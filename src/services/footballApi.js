const fs = require('fs');
const config = require('../config/config');
const { computeMatchPredictions } = require('./predictionEngine');

/**
 * ────────────────────────────────────────────────────────────────────────
 * SOURCE DE DONNÉES : FICHIER LOCAL (data/stats.json)
 * ────────────────────────────────────────────────────────────────────────
 * Plus aucune API ni scraping externe : l'administrateur tient à jour un
 * fichier JSON contenant les vraies statistiques domicile/extérieur de
 * chaque équipe et la liste des prochains matchs. Voir data/README.md
 * pour le format complet et le guide de remplissage.
 *
 * Le fichier est relu à chaque appel (pas de cache) : une modification est
 * donc prise en compte immédiatement, sans redémarrage du bot.
 *
 * Comme précédemment, aucune probabilité n'est fournie directement dans le
 * fichier : elle est CALCULÉE par predictionEngine.js (modèle de Poisson)
 * à partir des statistiques réelles saisies. Une équipe avec moins de
 * MIN_GAMES_PLAYED matchs joués (domicile ou extérieur) est écartée plutôt
 * que de produire un pronostic sur un échantillon non fiable.
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

/**
 * Charge et valide le fichier de statistiques. Ne lève jamais d'exception :
 * retourne toujours { data } ou { error }.
 */
function loadStatsFile() {
  const filePath = config.stats.filePath;

  if (!fs.existsSync(filePath)) {
    return { error: `Fichier de statistiques introuvable : ${filePath}` };
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return { error: `Impossible de lire le fichier de statistiques : ${err.message}` };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { error: `Le fichier de statistiques contient du JSON invalide : ${err.message}` };
  }

  if (!parsed || typeof parsed.competitions !== 'object' || parsed.competitions === null) {
    return { error: 'Le fichier de statistiques ne contient pas de clé "competitions" valide.' };
  }

  return { data: parsed };
}

/**
 * Construit les tables domicile/extérieur (même forme que predictionEngine.js
 * attend) à partir de la section "teams" d'une compétition. Le nom de
 * l'équipe sert directement d'identifiant (pas d'ID numérique à gérer).
 */
function buildTables(teams) {
  const homeTable = [];
  const awayTable = [];

  for (const [name, stats] of Object.entries(teams || {})) {
    if (stats && stats.home) {
      homeTable.push({
        team: { id: name, name },
        playedGames: Number(stats.home.played) || 0,
        goalsFor: Number(stats.home.goals_for) || 0,
        goalsAgainst: Number(stats.home.goals_against) || 0,
      });
    }
    if (stats && stats.away) {
      awayTable.push({
        team: { id: name, name },
        playedGames: Number(stats.away.played) || 0,
        goalsFor: Number(stats.away.goals_for) || 0,
        goalsAgainst: Number(stats.away.goals_against) || 0,
      });
    }
  }

  return { homeTable, awayTable };
}

function normalizeMatch(match, competitionName, tables, index) {
  const base = {
    id: `${competitionName}#${index}#${match.home_team}#${match.away_team}`,
    is_expired: false,
    competition_cluster: null,
    competition_name: competitionName,
    federation: null,
    start_date: match.date || null,
    home_team: match.home_team || 'Équipe à domicile',
    away_team: match.away_team || "Équipe à l'extérieur",
    prediction_per_market: null,
  };

  if (!match.home_team || !match.away_team) return base;

  const computed = computeMatchPredictions({
    homeTeamId: match.home_team, // le nom sert d'identifiant
    awayTeamId: match.away_team,
    homeTable: tables.homeTable,
    awayTable: tables.awayTable,
  });

  if (!computed) return base; // données insuffisantes -> match écarté plus loin

  base.prediction_per_market = computed.markets;
  base._model = computed.expectedGoals;
  return base;
}

/**
 * Lit le fichier de statistiques et calcule un pronostic pour chaque match
 * à venir qui dispose de données suffisantes.
 * @param {object} _options - conservé pour compatibilité d'interface avec
 *   les appelants existants (useCache n'a plus de sens : lecture fichier
 *   locale, toujours à jour).
 */
async function getUpcomingPredictions(_options = {}) {
  const loaded = loadStatsFile();
  if (loaded.error) {
    console.error('❌ ' + loaded.error);
    return {
      success: false,
      errorType: 'file_error',
      message: 'Le fichier de statistiques est introuvable ou mal formé. Vérifiez data/stats.json (voir data/README.md).',
    };
  }

  const { competitions } = loaded.data;
  const now = Date.now();
  const allMatches = [];

  for (const [competitionName, comp] of Object.entries(competitions)) {
    const tables = buildTables(comp && comp.teams);
    const rawMatches = Array.isArray(comp && comp.matches) ? comp.matches : [];

    rawMatches.forEach((m, index) => {
      // Les matchs déjà passés sont ignorés automatiquement (pas besoin de
      // les supprimer du fichier à la main).
      if (m.date && new Date(m.date).getTime() < now) return;
      allMatches.push(normalizeMatch(m, competitionName, tables, index));
    });
  }

  if (allMatches.length === 0) {
    return {
      success: false,
      errorType: 'empty',
      message: "Aucun match à venir n'est renseigné dans le fichier de statistiques (data/stats.json).",
    };
  }

  const usable = allMatches.filter((m) => m.prediction_per_market !== null);

  if (usable.length === 0) {
    return {
      success: false,
      errorType: 'empty',
      message:
        'Données insuffisantes (au moins 3 matchs joués domicile et extérieur requis par équipe) pour calculer un pronostic fiable sur les matchs renseignés.',
    };
  }

  return { success: true, data: usable };
}

module.exports = {
  MARKETS,
  getUpcomingPredictions,
};
