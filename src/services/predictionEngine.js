/**
 * ────────────────────────────────────────────────────────────────────────
 * MOTEUR DE PRONOSTIC STATISTIQUE (modèle de Poisson)
 * ────────────────────────────────────────────────────────────────────────
 * football-data.org ne fournit ni cotes ni probabilités pré-match sur le
 * plan gratuit : uniquement des matchs, classements et statistiques réelles
 * (buts marqués/encaissés, domicile/extérieur, matchs joués).
 *
 * Ce module calcule des probabilités à partir de CES données réelles, via
 * un modèle de Poisson classique (force offensive × faiblesse défensive ×
 * moyenne de la ligue) — la même famille de modèle que celle utilisée par
 * la plupart des sites de pronostics sérieux.
 *
 * Ce n'est PAS de l'invention de données : chaque probabilité est dérivée
 * de statistiques réelles. Si l'historique d'une équipe est trop faible
 * (moins de MIN_GAMES_PLAYED matchs joués à domicile/extérieur), le calcul
 * est purement et simplement refusé (retour null) plutôt que produit à
 * partir d'un échantillon non fiable.
 * ────────────────────────────────────────────────────────────────────────
 */

const MAX_GOALS = 6; // matrice des scores 0-0 à 6-6 (au-delà, probabilité négligeable)
const MIN_GAMES_PLAYED = 3; // garde-fou : échantillon minimal avant tout calcul

function factorial(n) {
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

function findTeamRow(table, teamId) {
  if (!Array.isArray(table)) return null;
  return table.find((row) => row.team && row.team.id === teamId) || null;
}

/**
 * Moyennes de la ligue calculées à partir des tables HOME et AWAY réelles
 * du classement (football-data.org : /competitions/{code}/standings).
 */
function buildLeagueAverages(homeTable, awayTable) {
  if (!Array.isArray(homeTable) || !Array.isArray(awayTable) || homeTable.length === 0 || awayTable.length === 0) {
    return null;
  }

  const sumHome = homeTable.reduce(
    (acc, t) => ({
      goalsFor: acc.goalsFor + (t.goalsFor || 0),
      goalsAgainst: acc.goalsAgainst + (t.goalsAgainst || 0),
      games: acc.games + (t.playedGames || 0),
    }),
    { goalsFor: 0, goalsAgainst: 0, games: 0 }
  );

  const sumAway = awayTable.reduce(
    (acc, t) => ({
      goalsFor: acc.goalsFor + (t.goalsFor || 0),
      goalsAgainst: acc.goalsAgainst + (t.goalsAgainst || 0),
      games: acc.games + (t.playedGames || 0),
    }),
    { goalsFor: 0, goalsAgainst: 0, games: 0 }
  );

  if (sumHome.games === 0 || sumAway.games === 0) return null;

  return {
    avgHomeGoalsFor: sumHome.goalsFor / sumHome.games,
    avgHomeGoalsAgainst: sumHome.goalsAgainst / sumHome.games,
    avgAwayGoalsFor: sumAway.goalsFor / sumAway.games,
    avgAwayGoalsAgainst: sumAway.goalsAgainst / sumAway.games,
  };
}

/**
 * Buts attendus (λ) pour chaque équipe : force offensive × faiblesse
 * défensive de l'adversaire × moyenne de la ligue. Modèle de Poisson
 * standard (attaque/défense relatives à la moyenne du championnat).
 */
function computeExpectedGoals({ homeRow, awayRow, leagueAverages }) {
  if (!homeRow || !awayRow || !leagueAverages) return null;
  if ((homeRow.playedGames || 0) < MIN_GAMES_PLAYED || (awayRow.playedGames || 0) < MIN_GAMES_PLAYED) return null;
  if (leagueAverages.avgHomeGoalsFor <= 0 || leagueAverages.avgAwayGoalsFor <= 0) return null;
  if (leagueAverages.avgHomeGoalsAgainst <= 0 || leagueAverages.avgAwayGoalsAgainst <= 0) return null;

  const homeAttack = homeRow.goalsFor / homeRow.playedGames / leagueAverages.avgHomeGoalsFor;
  const awayDefense = awayRow.goalsAgainst / awayRow.playedGames / leagueAverages.avgAwayGoalsAgainst;
  const lambdaHome = homeAttack * awayDefense * leagueAverages.avgHomeGoalsFor;

  const awayAttack = awayRow.goalsFor / awayRow.playedGames / leagueAverages.avgAwayGoalsFor;
  const homeDefense = homeRow.goalsAgainst / homeRow.playedGames / leagueAverages.avgHomeGoalsAgainst;
  const lambdaAway = awayAttack * homeDefense * leagueAverages.avgAwayGoalsFor;

  if (!Number.isFinite(lambdaHome) || !Number.isFinite(lambdaAway) || lambdaHome <= 0 || lambdaAway <= 0) {
    return null;
  }

  // Bornes de sécurité : au-delà de 6 buts attendus, le modèle n'est plus fiable
  // (probablement une anomalie de données plutôt qu'une vraie tendance).
  if (lambdaHome > 6 || lambdaAway > 6) return null;

  return { lambdaHome, lambdaAway };
}

function buildScoreMatrix(lambdaHome, lambdaAway) {
  const matrix = [];
  for (let i = 0; i <= MAX_GOALS; i++) {
    const row = [];
    for (let j = 0; j <= MAX_GOALS; j++) {
      row.push(poissonPmf(i, lambdaHome) * poissonPmf(j, lambdaAway));
    }
    matrix.push(row);
  }

  // La matrice tronquée à MAX_GOALS ne somme pas exactement à 1 : normalisation.
  let total = 0;
  for (const row of matrix) for (const p of row) total += p;
  if (total > 0) {
    for (let i = 0; i <= MAX_GOALS; i++) {
      for (let j = 0; j <= MAX_GOALS; j++) matrix[i][j] /= total;
    }
  }
  return matrix;
}

/**
 * Dérive tous les marchés (1X2, BTTS, Over/Under, Double Chance, Score
 * Exact) à partir de la matrice de probabilités des scores.
 */
function computeMarketsFromMatrix(matrix) {
  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;
  let pBttsYes = 0;
  let pOver25 = 0;
  let pOver35 = 0;
  let pHomeOver05 = 0;
  let pHomeOver15 = 0;
  let pAwayOver05 = 0;
  let pAwayOver15 = 0;
  let bestScore = { i: 0, j: 0, p: -1 };

  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = matrix[i][j];

      if (i > j) pHome += p;
      else if (i === j) pDraw += p;
      else pAway += p;

      if (i >= 1 && j >= 1) pBttsYes += p;
      if (i + j >= 3) pOver25 += p;
      if (i + j >= 4) pOver35 += p;
      if (i >= 1) pHomeOver05 += p;
      if (i >= 2) pHomeOver15 += p;
      if (j >= 1) pAwayOver05 += p;
      if (j >= 2) pAwayOver15 += p;

      if (p > bestScore.p) bestScore = { i, j, p };
    }
  }

  const yesNo = (yesProb) => (yesProb >= 0.5 ? 'yes' : 'no');
  const outcome1X2 = pHome >= pDraw && pHome >= pAway ? '1' : pAway >= pDraw ? '2' : 'X';

  return {
    classic: {
      probabilities: {
        1: pHome,
        X: pDraw,
        2: pAway,
        '1X': pHome + pDraw,
        X2: pDraw + pAway,
        12: pHome + pAway,
      },
      prediction: outcome1X2,
    },
    btts: { probabilities: { yes: pBttsYes, no: 1 - pBttsYes }, prediction: yesNo(pBttsYes) },
    over_25: { probabilities: { yes: pOver25, no: 1 - pOver25 }, prediction: yesNo(pOver25) },
    over_35: { probabilities: { yes: pOver35, no: 1 - pOver35 }, prediction: yesNo(pOver35) },
    home_over_05: { probabilities: { yes: pHomeOver05, no: 1 - pHomeOver05 }, prediction: yesNo(pHomeOver05) },
    home_over_15: { probabilities: { yes: pHomeOver15, no: 1 - pHomeOver15 }, prediction: yesNo(pHomeOver15) },
    away_over_05: { probabilities: { yes: pAwayOver05, no: 1 - pAwayOver05 }, prediction: yesNo(pAwayOver05) },
    away_over_15: { probabilities: { yes: pAwayOver15, no: 1 - pAwayOver15 }, prediction: yesNo(pAwayOver15) },
    exact_score: { scoreline: `${bestScore.i}-${bestScore.j}`, probability: bestScore.p },
  };
}

/**
 * Point d'entrée principal.
 * @returns {{markets: object, expectedGoals: {lambdaHome:number, lambdaAway:number}} | null}
 *          null si les données réelles disponibles sont insuffisantes.
 */
function computeMatchPredictions({ homeTeamId, awayTeamId, homeTable, awayTable }) {
  const leagueAverages = buildLeagueAverages(homeTable, awayTable);
  if (!leagueAverages) return null;

  const homeRow = findTeamRow(homeTable, homeTeamId);
  const awayRow = findTeamRow(awayTable, awayTeamId);

  const expectedGoals = computeExpectedGoals({ homeRow, awayRow, leagueAverages });
  if (!expectedGoals) return null;

  const matrix = buildScoreMatrix(expectedGoals.lambdaHome, expectedGoals.lambdaAway);
  const markets = computeMarketsFromMatrix(matrix);

  return { markets, expectedGoals };
}

module.exports = {
  computeMatchPredictions,
  poissonPmf,
  MIN_GAMES_PLAYED,
  MAX_GOALS,
};