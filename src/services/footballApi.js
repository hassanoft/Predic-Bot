const axios = require('axios');
const config = require('../config/config');
const { computeMatchPredictions, MIN_GAMES_PLAYED } = require('./predictionEngine');

/**
 * ────────────────────────────────────────────────────────────────────────
 * SOFASCORE — API JSON PUBLIQUE (non officielle, utilisée par sofascore.com
 * lui-même). Structure vérifiée via des exemples réels documentés par la
 * communauté (aucune clé requise).
 * ────────────────────────────────────────────────────────────────────────
 * Base : https://api.sofascore.com/api/v1
 *
 * GET /config/unique-tournaments/en/football
 *   → { uniqueTournaments: [{ id, name, slug, category:{...} }], ... }
 *   Référentiel des compétitions — utilisé pour résoudre un NOM de
 *   compétition ("Premier League"...) en ID interne Sofascore.
 *
 * GET /sport/football/scheduled-events/{YYYY-MM-DD}
 *   → { events: [{ id, startTimestamp, status:{type: "notstarted"|"finished"|...},
 *                   tournament:{ name, category:{name}, uniqueTournament:{id,name} },
 *                   homeTeam:{id,name}, awayTeam:{id,name} }] }
 *   Tous les matchs (toutes compétitions confondues) pour une date donnée.
 *   startTimestamp est en SECONDES (epoch Unix).
 *
 * GET /unique-tournament/{tournamentId}/seasons
 *   → { seasons: [{ id, name, year }] }  — la plus récente en premier.
 *
 * GET /unique-tournament/{tournamentId}/season/{seasonId}/standings/home
 * GET /unique-tournament/{tournamentId}/season/{seasonId}/standings/away
 *   → { standings: [{ rows: [{ team:{id,name}, matches, scoresFor,
 *                               scoresAgainst, wins, draws, losses, points }] }] }
 *
 * Aucune probabilité n'est fournie par Sofascore : elle est CALCULÉE côté
 * bot (predictionEngine.js, modèle de Poisson) à partir de ces données
 * réelles de classement domicile/extérieur — même logique et même garde-fou
 * anti-invention de données que la version football-data.org précédente,
 * avec repli automatique sur la saison précédente si l'échantillon de la
 * saison en cours est trop faible.
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

const RELIABLE_SAMPLE_FRACTION = 0.7;

const client = axios.create({
  baseURL: config.sofascore.baseUrl,
  timeout: 10000,
  headers: {
    // Beaucoup de passerelles publiques de ce type rejettent les requêtes
    // sans en-tête User-Agent proche d'un navigateur réel.
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'application/json',
  },
});

// ─────────────────────────────────────────────
// Limiteur de débit à fenêtre glissante. Sofascore ne publie pas de quota
// officiel (API non documentée) : on reste volontairement prudent.
// ─────────────────────────────────────────────
const MAX_CALLS_PER_WINDOW = 15;
const WINDOW_MS = 60 * 1000;
const callTimestamps = [];

async function throttledGet(url, opts) {
  const now = Date.now();
  while (callTimestamps.length > 0 && now - callTimestamps[0] > WINDOW_MS) {
    callTimestamps.shift();
  }
  if (callTimestamps.length >= MAX_CALLS_PER_WINDOW) {
    const waitMs = WINDOW_MS - (now - callTimestamps[0]) + 50;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return throttledGet(url, opts);
  }
  callTimestamps.push(Date.now());
  return client.get(url, opts);
}

// ─────────────────────────────────────────────
// Cache mémoire.
// ─────────────────────────────────────────────
const cache = new Map();
const TOURNAMENTS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7j — référentiel quasi statique
const SEASONS_TTL_MS = 24 * 60 * 60 * 1000; // 1j
const STANDINGS_TTL_MS = 6 * 60 * 60 * 1000; // 6h — saison en cours
const PREVIOUS_STANDINGS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30j — saison passée, figée
const EVENTS_TTL_MS = 20 * 60 * 1000; // 20 min

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

/**
 * Résout les noms de compétitions configurés (config.sofascore.competitions)
 * en IDs internes Sofascore, via le référentiel officiel du site.
 */
async function resolveTargetTournamentIds() {
  const cacheKey = 'tournaments:football';
  const cached = cacheGet(cacheKey, TOURNAMENTS_TTL_MS);
  if (cached) return cached;

  const response = await throttledGet('/config/unique-tournaments/en/football');
  const list = (response.data && response.data.uniqueTournaments) || [];

  const idSet = new Set();
  for (const name of config.sofascore.competitions) {
    const found = list.find((t) => t.name && t.name.toLowerCase() === name.toLowerCase());
    if (found) idSet.add(found.id);
  }

  cacheSet(cacheKey, idSet);
  return idSet;
}

async function fetchScheduledEventsForDate(dateStr) {
  const cacheKey = `events:${dateStr}`;
  const cached = cacheGet(cacheKey, EVENTS_TTL_MS);
  if (cached) return cached;

  const response = await throttledGet(`/sport/football/scheduled-events/${dateStr}`);
  const events = (response.data && response.data.events) || [];

  cacheSet(cacheKey, events);
  return events;
}

async function fetchSeasons(tournamentId) {
  const cacheKey = `seasons:${tournamentId}`;
  const cached = cacheGet(cacheKey, SEASONS_TTL_MS);
  if (cached) return cached;

  const response = await throttledGet(`/unique-tournament/${tournamentId}/seasons`);
  const seasons = (response.data && response.data.seasons) || [];

  cacheSet(cacheKey, seasons);
  return seasons;
}

function extractRows(standingsResponseData) {
  const standings = standingsResponseData && standingsResponseData.standings;
  if (!Array.isArray(standings) || standings.length === 0) return [];
  return standings[0].rows || [];
}

/**
 * Normalise les lignes de classement Sofascore vers la forme attendue par
 * predictionEngine.js (mêmes noms de champs que la version précédente).
 */
function normalizeStandingsRows(rows) {
  return rows
    .filter((r) => r && r.team)
    .map((r) => ({
      team: { id: r.team.id, name: r.team.name },
      playedGames: r.matches || 0,
      goalsFor: r.scoresFor || 0,
      goalsAgainst: r.scoresAgainst || 0,
    }));
}

async function fetchStandingsTables(tournamentId, seasonId, ttlMs) {
  const cacheKey = `standings:${tournamentId}:${seasonId}`;
  const cached = cacheGet(cacheKey, ttlMs);
  if (cached) return cached;

  const [homeRes, awayRes] = await Promise.all([
    throttledGet(`/unique-tournament/${tournamentId}/season/${seasonId}/standings/home`),
    throttledGet(`/unique-tournament/${tournamentId}/season/${seasonId}/standings/away`),
  ]);

  const result = {
    homeTable: normalizeStandingsRows(extractRows(homeRes.data)),
    awayTable: normalizeStandingsRows(extractRows(awayRes.data)),
  };

  cacheSet(cacheKey, result);
  return result;
}

function reliableFraction(table) {
  if (!Array.isArray(table) || table.length === 0) return 0;
  const enough = table.filter((t) => (t.playedGames || 0) >= MIN_GAMES_PLAYED).length;
  return enough / table.length;
}

function hasReliableSample(standings) {
  if (!standings) return false;
  return (
    reliableFraction(standings.homeTable) >= RELIABLE_SAMPLE_FRACTION &&
    reliableFraction(standings.awayTable) >= RELIABLE_SAMPLE_FRACTION
  );
}

/**
 * Classement exploitable pour un tournoi : saison en cours si l'échantillon
 * est suffisant, sinon repli automatique sur la saison précédente (classement
 * final réel) — jamais une valeur inventée.
 */
async function getStandingsWithFallback(tournamentId) {
  const seasons = await fetchSeasons(tournamentId);
  if (!seasons || seasons.length === 0) return null;

  const currentSeasonId = seasons[0].id;
  const current = await fetchStandingsTables(tournamentId, currentSeasonId, STANDINGS_TTL_MS);

  if (hasReliableSample(current)) {
    return { standings: current, usedPreviousSeason: false };
  }

  if (seasons.length > 1) {
    const previousSeasonId = seasons[1].id;
    const previousLabel = seasons[1].year || seasons[1].name || null;
    const previous = await fetchStandingsTables(tournamentId, previousSeasonId, PREVIOUS_STANDINGS_TTL_MS);
    if (previous) {
      return { standings: previous, usedPreviousSeason: true, previousSeasonLabel: previousLabel };
    }
  }

  return { standings: current, usedPreviousSeason: false };
}

function normalizeMatch(event, standingsInfo) {
  const uniqueTournament = event.tournament && event.tournament.uniqueTournament;

  const base = {
    id: event.id,
    is_expired: false,
    competition_cluster: event.tournament && event.tournament.category ? event.tournament.category.name : null,
    competition_name: uniqueTournament ? uniqueTournament.name : event.tournament ? event.tournament.name : null,
    federation: null,
    start_date: event.startTimestamp ? new Date(event.startTimestamp * 1000).toISOString() : null,
    home_team: event.homeTeam && event.homeTeam.name ? event.homeTeam.name : 'Équipe à domicile',
    away_team: event.awayTeam && event.awayTeam.name ? event.awayTeam.name : 'Équipe à l'extérieur',
    prediction_per_market: null,
  };

  if (!standingsInfo || !standingsInfo.standings || !event.homeTeam || !event.awayTeam) return base;

  const computed = computeMatchPredictions({
    homeTeamId: event.homeTeam.id,
    awayTeamId: event.awayTeam.id,
    homeTable: standingsInfo.standings.homeTable,
    awayTable: standingsInfo.standings.awayTable,
  });

  if (!computed) return base;

  base.prediction_per_market = computed.markets;
  base._model = computed.expectedGoals;
  base._usedPreviousSeasonData = !!standingsInfo.usedPreviousSeason;
  base._previousSeasonLabel = standingsInfo.previousSeasonLabel || null;
  return base;
}

/**
 * Récupère les prochains matchs (compétitions configurées) et calcule un
 * pronostic statistique pour chacun. Les matchs pour lesquels les données
 * réelles sont insuffisantes (même après repli sur la saison précédente)
 * sont exclus du résultat.
 */
async function getUpcomingPredictions({ useCache = true } = {}) {
  try {
    if (!useCache) cache.clear();

    const targetIds = await resolveTargetTournamentIds();
    if (targetIds.size === 0) {
      return {
        success: false,
        errorType: 'unavailable',
        message: "Aucune des compétitions configurées n'a été trouvée sur la source de données.",
      };
    }

    const days = [];
    for (let i = 0; i < config.sofascore.lookaheadDays; i++) {
      days.push(isoDate(new Date(Date.now() + i * 24 * 60 * 60 * 1000)));
    }

    let allEvents = [];
    for (const day of days) {
      const events = await fetchScheduledEventsForDate(day);
      allEvents = allEvents.concat(events);
    }

    const upcoming = allEvents.filter(
      (e) =>
        e.status &&
        e.status.type === 'notstarted' &&
        e.tournament &&
        e.tournament.uniqueTournament &&
        targetIds.has(e.tournament.uniqueTournament.id)
    );

    if (upcoming.length === 0) {
      return {
        success: false,
        errorType: 'empty',
        message: 'Aucun match à venir actuellement pour les compétitions suivies.',
      };
    }

    const tournamentIdsNeeded = [...new Set(upcoming.map((e) => e.tournament.uniqueTournament.id))];
    const standingsByTournament = {};
    for (const tId of tournamentIdsNeeded) {
      try {
        standingsByTournament[tId] = await getStandingsWithFallback(tId);
      } catch (err) {
        console.error(`⚠️ Classement Sofascore indisponible pour le tournoi ${tId} :`, err.message);
        standingsByTournament[tId] = null;
      }
    }

    const matches = upcoming
      .map((e) => normalizeMatch(e, standingsByTournament[e.tournament.uniqueTournament.id]))
      .filter((m) => m.prediction_per_market !== null);

    if (matches.length === 0) {
      return {
        success: false,
        errorType: 'empty',
        message:
          'Données de classement insuffisantes (saison en cours ET saison précédente) pour calculer un pronostic fiable sur les matchs à venir.',
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
      message: 'La source de données met trop de temps à répondre. Réessayez dans un instant.',
    };
  }

  if (!error.response) {
    return {
      success: false,
      errorType: 'unavailable',
      message: 'La source de données est momentanément inaccessible.',
    };
  }

  const status = error.response.status;

  if (status === 429) {
    return {
      success: false,
      errorType: 'rate_limited',
      message: 'Trop de requêtes envoyées à la source de données. Réessayez dans une minute.',
    };
  }

  if (status === 403 || status === 401) {
    console.error(`❌ Accès refusé par la source de données (code ${status}) — possible blocage anti-scraping.`);
    return {
      success: false,
      errorType: 'blocked',
      message: "La source de données a temporairement bloqué l'accès. Réessayez plus tard.",
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
    message: `Erreur inattendue de la source de données (code ${status}).`,
  };
}

module.exports = {
  MARKETS,
  getUpcomingPredictions,
};