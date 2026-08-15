const { MARKETS } = require('./footballApi');

const OUTCOME_LABELS_1X2 = { 1: 'Victoire équipe domicile', X: 'Match nul', 2: 'Victoire équipe extérieure' };
const DOUBLE_CHANCE_LABELS = { '1X': '1X (Domicile ou Nul)', X2: 'X2 (Nul ou Extérieur)', '12': '12 (Domicile ou Extérieur)' };

/**
 * Retourne true si l'objet marché a bien une prédiction et une probabilité exploitables.
 */
function hasUsableMarket(marketData) {
  return (
    marketData &&
    typeof marketData === 'object' &&
    marketData.prediction !== undefined &&
    marketData.prediction !== null &&
    marketData.probabilities &&
    typeof marketData.probabilities === 'object'
  );
}

function toConfidencePct(probability) {
  if (typeof probability !== 'number' || Number.isNaN(probability)) return null;
  return Math.round(probability * 100);
}

function getMarket(match, marketKey) {
  if (!match || !match.prediction_per_market) return null;
  const marketData = match.prediction_per_market[marketKey];
  return hasUsableMarket(marketData) ? marketData : null;
}

// ─────────────────────────────────────────────────────────────
// EXTRACTION PAR CATÉGORIE
// Chaque fonction renvoie soit { pick, confidencePct, raw } soit null
// si l'API ne fournit pas assez de données pour cette catégorie.
// ─────────────────────────────────────────────────────────────

function extract1X2(match) {
  const m = getMarket(match, MARKETS.CLASSIC);
  if (!m) return null;
  const outcome = m.prediction; // "1" | "X" | "2"
  const label = OUTCOME_LABELS_1X2[outcome];
  const prob = m.probabilities[outcome];
  const confidencePct = toConfidencePct(prob);
  if (!label || confidencePct === null) return null;

  const teamPick =
    outcome === '1' ? match.home_team : outcome === '2' ? match.away_team : 'Match nul';

  return { pick: teamPick, label, confidencePct, raw: m };
}

function extractDoubleChance(match) {
  const m = getMarket(match, MARKETS.CLASSIC);
  if (!m || !m.probabilities) return null;

  const candidates = ['1X', 'X2', '12']
    .map((key) => ({ key, prob: m.probabilities[key] }))
    .filter((c) => typeof c.prob === 'number');

  if (candidates.length === 0) return null;

  const best = candidates.reduce((a, b) => (b.prob > a.prob ? b : a));
  const confidencePct = toConfidencePct(best.prob);
  if (confidencePct === null) return null;

  return { pick: best.key, label: DOUBLE_CHANCE_LABELS[best.key], confidencePct, raw: m };
}

function extractBTTS(match) {
  const m = getMarket(match, MARKETS.BTTS);
  if (!m) return null;
  const outcome = m.prediction; // "yes" | "no"
  const prob = m.probabilities[outcome];
  const confidencePct = toConfidencePct(prob);
  if (confidencePct === null) return null;

  return {
    pick: outcome === 'yes' ? 'OUI' : 'NON',
    label: 'Les deux équipes marquent',
    confidencePct,
    raw: m,
  };
}

/**
 * "Total de buts" : agrège tous les marchés Over/Under de buts totaux
 * (over_25, over_35) réellement fournis par l'API, sans en inventer.
 */
function extractTotalGoals(match) {
  const marketDefs = [
    { key: MARKETS.OVER_25, line: '2.5' },
    { key: MARKETS.OVER_35, line: '3.5' },
  ];

  const results = [];
  for (const def of marketDefs) {
    const m = getMarket(match, def.key);
    if (!m) continue;
    const outcome = m.prediction; // "yes" | "no"
    const prob = m.probabilities[outcome];
    const confidencePct = toConfidencePct(prob);
    if (confidencePct === null) continue;
    const direction = outcome === 'yes' ? 'Over' : 'Under';
    results.push({ pick: `${direction} ${def.line}`, confidencePct, raw: m });
  }

  if (results.length === 0) return null;

  results.sort((a, b) => b.confidencePct - a.confidencePct);
  return { best: results[0], all: results };
}

/**
 * "Over/Under" : sélectionne le meilleur pronostic Over/Under parmi tous
 * les marchés de buts (totaux ou par équipe) réellement disponibles.
 */
function extractOverUnder(match) {
  const marketDefs = [
    { key: MARKETS.OVER_25, label: 'Total buts — 2.5' },
    { key: MARKETS.OVER_35, label: 'Total buts — 3.5' },
    { key: MARKETS.HOME_OVER_05, label: `Buts ${match.home_team || 'domicile'} — 0.5` },
    { key: MARKETS.HOME_OVER_15, label: `Buts ${match.home_team || 'domicile'} — 1.5` },
    { key: MARKETS.AWAY_OVER_05, label: `Buts ${match.away_team || 'extérieur'} — 0.5` },
    { key: MARKETS.AWAY_OVER_15, label: `Buts ${match.away_team || 'extérieur'} — 1.5` },
  ];

  const results = [];
  for (const def of marketDefs) {
    const m = getMarket(match, def.key);
    if (!m) continue;
    const outcome = m.prediction;
    const prob = m.probabilities[outcome];
    const confidencePct = toConfidencePct(prob);
    if (confidencePct === null) continue;
    const direction = outcome === 'yes' ? 'OVER' : 'UNDER';
    results.push({ pick: `${direction} — ${def.label}`, confidencePct, raw: m });
  }

  if (results.length === 0) return null;

  results.sort((a, b) => b.confidencePct - a.confidencePct);
  return results[0];
}

/**
 * "Score Exact" : cette API ne fournit structurellement aucun marché de
 * score exact (voir footballApi.js). On retourne donc toujours null ici,
 * ce qui déclenche le message d'indisponibilité prévu par le cahier des
 * charges — jamais un score inventé.
 */
function extractExactScore(_match) {
  return null;
}

const EXTRACTORS = {
  '1x2': extract1X2,
  double_chance: extractDoubleChance,
  btts: extractBTTS,
  total_buts: extractTotalGoals,
  over_under: extractOverUnder,
  score_exact: extractExactScore,
};

/**
 * Parcourt la liste de matchs renvoyée par l'API et sélectionne les
 * meilleurs pronostics exploitables pour une catégorie donnée, triés par
 * confiance décroissante.
 */
function selectBestForCategory(matches, category, limit = 1) {
  const extractor = EXTRACTORS[category];
  if (!extractor || !Array.isArray(matches)) return [];

  const usable = [];
  for (const match of matches) {
    if (match.is_expired) continue; // on ignore les matchs déjà passés
    const extracted = extractor(match);
    if (!extracted) continue;

    const confidencePct = extracted.confidencePct ?? extracted.best?.confidencePct;
    if (typeof confidencePct !== 'number') continue;

    usable.push({ match, extracted, confidencePct });
  }

  usable.sort((a, b) => b.confidencePct - a.confidencePct);
  return usable.slice(0, limit);
}

/**
 * Construit le message Telegram (HTML) pour un pronostic donné.
 */
function formatPredictionMessage(match, category, extracted) {
  const categoryLabels = {
    '1x2': '1X2',
    total_buts: 'Total de buts',
    btts: 'BTTS',
    over_under: 'Over/Under',
    double_chance: 'Double Chance',
    score_exact: 'Score Exact',
  };

  let pickLine;
  let confidencePct;

  if (category === 'total_buts') {
    pickLine = extracted.best.pick;
    confidencePct = extracted.best.confidencePct;
  } else {
    pickLine = extracted.pick;
    confidencePct = extracted.confidencePct;
  }

  const dateLabel = match.start_date ? formatMatchDate(match.start_date) : null;

  return (
    `⚽ <b>PRONOSTIC FOOTBALL</b>\n\n` +
    `🏟 <b>Match</b>\n${escapeHtml(match.home_team)} 🆚 ${escapeHtml(match.away_team)}\n\n` +
    (match.competition_name ? `🏆 <b>Compétition</b>\n${escapeHtml(match.competition_name)}\n\n` : '') +
    (dateLabel ? `🕒 <b>Coup d'envoi</b>\n${dateLabel}\n\n` : '') +
    `🎯 <b>Marché</b>\n${categoryLabels[category] || category}\n\n` +
    `🔥 <b>Pronostic</b>\n${escapeHtml(pickLine)}\n\n` +
    `📊 <b>Confiance</b>\n${confidencePct}%\n\n` +
    `📈 <b>Données API</b>\nAnalyse basée sur les statistiques et probabilités fournies par le modèle de pronostics.\n\n` +
    `━━━━━━━━━━━━━━\n` +
    `🤖 <i>Football Prediction Bot</i>\n\n` +
    `⚠️ <i>Estimation statistique, aucun résultat n'est garanti.</i>`
  );
}

function formatMatchDate(isoDate) {
  try {
    const d = new Date(isoDate);
    return d.toLocaleString('fr-FR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoDate;
  }
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const NO_DATA_MESSAGES = {
  '1x2': "❌ Données insuffisantes pour générer un pronostic 1X2 exploitable actuellement.",
  total_buts: "❌ Données insuffisantes pour générer un pronostic de total de buts exploitable actuellement.",
  btts: "❌ Données insuffisantes pour générer un pronostic BTTS exploitable actuellement.",
  over_under: "❌ Données insuffisantes pour générer un pronostic Over/Under exploitable actuellement.",
  double_chance: "❌ Données insuffisantes pour générer un pronostic Double Chance exploitable actuellement.",
  score_exact:
    "❌ Aucun score exact exploitable n'est disponible pour ce match avec les données actuelles de l'API.",
};

module.exports = {
  selectBestForCategory,
  formatPredictionMessage,
  formatMatchDate,
  escapeHtml,
  NO_DATA_MESSAGES,
};
