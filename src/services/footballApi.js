const axios = require('axios');
const config = require('../config/config');
const { computeMatchPredictions } = require('./predictionEngine');

/**
 * ────────────────────────────────────────────────────────────────────────
 * football-data.org (v4) — STRUCTURE RÉELLE UTILISÉE ICI
 * ────────────────────────────────────────────────────────────────────────
 * Auth : header "X-Auth-Token: <clé>"
 * Plan gratuit (TIER_ONE) : 10 requêtes/minute, 12 compétitions, PAS de
 * cotes ni de probabilités pré-match (add-on payant, et même payant ce
 * sont des cotes moyennes POST-match — inutilisables pour prédire).
 *
 * 1) GET /v4/matches?competitions=PL,PD,...&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
 *    → { matches: [{ id, utcDate, status, competition:{id,name,code},
 *                     area:{name}, homeTeam:{id,name}, awayTeam:{id,name} }] }
 *    Filtre "competitions" confirmé sur la ressource principale /v4/matches.
 *    On filtre nous-mêmes sur status ∈ {SCHEDULED, TIMED} (à venir, non joués).
 *
 * 2) GET /v4/competitions/{code}/standings
 *    → { standings: [
 *          { type: "TOTAL", table: [...] },
 *          { type: "HOME",  table: [{ team:{id,name}, playedGames, goalsFor, goalsAgainst, ... }] },
 *          { type: "AWAY",  table: [...] }
 *        ] }
 *    Les tables HOME/AWAY donnent, PAR ÉQUIPE, les buts marqués/encaissés
 *    réels à domicile et à l'extérieur — exactement ce qu'il faut pour le
 *    modèle de Poisson (src/services/predictionEngine.js).
 *
 * Aucune probabilité n'est fournie par cette API : elle est CALCULÉE côté
 * bot à partir de ces données réelles. Voir predictionEngine.js pour le
 * détail du modèle et la garde-fou anti-invention de données.
 * ────────────────────────────────────────────────────────────────────────
 */

const MARKETS = {
  CLASSIC: 'classic',
  BTTS: 'btts',
  OVER_25: 'over_25',
  OVER_35: 'over_35',
  HOME_OVER_05: 'home_over_05',
  HOME_OVER_15: 'home_over_15',
  AWAY_OVER_05: 'away_over_05',
  AWAY_OVER_15: 'away_over_15',
  EXACT_SCORE: 'exact_score',
};

const UPCOMING_STATUSES = new Set(['SCHEDULED', 'TIMED']);

const client = axios.create({
  baseURL: config.footballData.baseUrl,
  timeout: 10000,
  headers: {
    'X-Auth-Token': config.footballData.apiKey,
  },
});

// ─────────────────────────────────────────────
// Limiteur de débit simple : le plan gratuit autorise 10 req/min.
// On espace les appels pour ne jamais s'en approcher.
// ─────────────────────────────────────────────
let lastCallAt = 0;
const MIN_INTERVAL_MS = 6500; // ~9 requêtes/minute max, marge de sécurité

async function throttledGet(url, opts) {
  const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastCallAt));
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCallAt = Date.now();
  return client.get(url, opts);
}

// ─────────────────────────────────────────────
// Cache mémoire : les classements changent peu (cache long), les matchs
// programmés un peu plus souvent (cache court).
// ─────────────────────────────────────────────
const cache = new Map();
const STANDINGS_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const MATCHES_TTL_MS = 20 * 60 * 1000; // 20 min

function cacheGet(key, ttlMs) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value) {
  cache.set(key, { value, timestamp: Date.now() });
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

async function fetchStandings(competitionCode) {
  const cacheKey = `standings:${competitionCode}`;
  const cached = cacheGet(cacheKey, STANDINGS_TTL_MS);
  if (cached) return cached;

  const response = await throttledGet(`/competitions/${competitionCode}/standings`);
  const groups = response.data && response.data.standings;
  if (!Array.isArray(groups)) return null;

  const homeTable = (groups.find((g) => g.type === 'HOME') || {}).table || [];
  const awayTable = (groups.find((g) => g.type === 'AWAY') || {}).table || [];

  const result = { homeTable, awayTable };
  cacheSet(cacheKey, result);
  return result;
}

async function fetchUpcomingMatches() {
  const competitions = config.footballData.competitions;
  const cacheKey = `matches:${competitions.join(',')}`;
  const cached = cacheGet(cacheKey, MATCHES_TTL_MS);
  if (cached) return cached;

  const today = new Date();
  const to = new Date(today.getTime() + config.footballData.lookaheadDays * 24 * 60 * 60 * 1000);

  const response = await throttledGet('/matches', {
    params: {
      competitions: competitions.join(','),
      dateFrom: isoDate(today),
      dateTo: isoDate(to),
    },
  });

  const allMatches = Array.isArray(response.data && response.data.matches) ? response.data.matches : [];
  const upcoming = allMatches.filter((m) => UPCOMING_STATUSES.has(m.status));

  cacheSet(cacheKey, upcoming);
  return upcoming;
}

/**
 * Convertit un match football-data.org + les classements de sa compétition
 * en objet normalisé (même forme qu'auparavant : home_team, away_team,
 * start_date, prediction_per_market...) afin que predictionService.js et
 * les handlers n'aient presque rien à changer.
 */
function normalizeMatch(match, standings) {
  const base = {
    id: match.id,
    is_expired: false,
    competition_cluster: match.area ? match.area.name : null,
    competition_name: match.competition ? match.competition.name : null,
    federation: match.competition ? match.competition.code : null,
    start_date: match.utcDate,
    home_team: match.homeTeam && match.homeTeam.name ? match.homeTeam.name : 'Équipe à domicile',
    away_team: match.awayTeam && match.awayTeam.name ? match.awayTeam.name : 'Équipe à l’extérieur',
    prediction_per_market: null,
  };

  if (!standings || !match.homeTeam || !match.awayTeam) return base;

  const computed = computeMatchPredictions({
    homeTeamId: match.homeTeam.id,
    awayTeamId: match.awayTeam.id,
    homeTable: standings.homeTable,
    awayTable: standings.awayTable,
  });

  if (!computed) return base; // données insuffisantes -> match ignoré plus loin

  base.prediction_per_market = computed.markets;
  base._model = computed.expectedGoals; // conservé pour audit éventuel, non affiché
  return base;
}

/**
 * Récupère les prochains matchs et calcule un pronostic statistique pour
 * chacun (voir predictionEngine.js). Les matchs pour lesquels les données
 * réelles sont insuffisantes sont exclus du résultat — jamais complétés
 * par une valeur inventée.
 */
async function getUpcomingPredictions({ useCache = true } = {}) {
  try {
    if (!useCache) cache.clear();

    const rawMatches = await fetchUpcomingMatches();
    if (rawMatches.length === 0) {
      return {
        success: false,
        errorType: 'empty',
        message: 'Aucun match à venir actuellement pour les compétitions suivies.',
      };
    }

    // On ne récupère chaque classement qu'une seule fois par compétition concernée.
    const competitionCodes = [
      ...new Set(rawMatches.map((m) => m.competition && m.competition.code).filter(Boolean)),
    ];

    const standingsByCompetition = {};
    for (const code of competitionCodes) {
      try {
        standingsByCompetition[code] = await fetchStandings(code);
      } catch (err) {
        console.error(`⚠️ Classement indisponible pour la compétition ${code} :`, err.message);
        standingsByCompetition[code] = null;
      }
    }

    const matches = rawMatches
      .map((m) => normalizeMatch(m, standingsByCompetition[m.competition && m.competition.code]))
      .filter((m) => m.prediction_per_market !== null);

    if (matches.length === 0) {
      return {
        success: false,
        errorType: 'empty',
        message: 'Données de classement insuffisantes pour calculer un pronostic fiable sur les matchs à venir.',
      };
    }

    return { success: true, data: matches };
  } catch (error) {
    return handleApiError(error);
  }
}

function handleApiError(error) {
  if (error.code === 'ECONNABORTED') {
    return {
      success: false,
      errorType: 'timeout',
      message: 'Le service de données football met trop de temps à répondre. Réessayez dans un instant.',
    };
  }

  if (!error.response) {
    return {
      success: false,
      errorType: 'unavailable',
      message: 'Le service de données football est momentanément indisponible.',
    };
  }

  const status = error.response.status;

  if (status === 429) {
    return {
      success: false,
      errorType: 'rate_limited',
      message: 'Limite de requêtes football-data.org atteinte. Réessayez dans une minute.',
    };
  }

  if (status === 401 || status === 403) {
    console.error('❌ Authentification football-data.org refusée (vérifier FOOTBALL_DATA_API_KEY).');
    return {
      success: false,
      errorType: 'auth_error',
      message: "Le service de données football n'est pas correctement configuré.",
    };
  }

  if (status === 404) {
    return {
      success: false,
      errorType: 'not_found',
      message: 'Aucune donnée disponible pour cette demande.',
    };
  }

  return {
    success: false,
    errorType: 'http_error',
    message: `Erreur inattendue du service de données football (code ${status}).`,
  };
}

module.exports = {
  MARKETS,
  getUpcomingPredictions,
};