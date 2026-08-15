const userService = require('../services/userService');
const footballApi = require('../services/footballApi');
const predictionService = require('../services/predictionService');
const { mainMenuKeyboard, premiumPlansKeyboard } = require('../keyboards/mainKeyboard');
const config = require('../config/config');

async function handleCategory(ctx, category) {
  const telegramId = ctx.from.id;
  userService.getOrCreateUser(telegramId, ctx.from.username, ctx.from.first_name);

  // 1. Vérifier l'accès (limite gratuite / premium / score exact / admin)
  const access = userService.canGenerate(telegramId, category);
  if (!access.allowed) {
    return sendAccessDeniedMessage(ctx, access.reason);
  }

  // 2. Appeler l'API
  const apiResult = await footballApi.getUpcomingPredictions({});
  if (!apiResult.success) {
    return ctx.reply(
      `⚠️ Impossible de récupérer les prédictions actuellement.\n\n${apiResult.message}\n\nVeuillez réessayer dans quelques instants.`,
      mainMenuKeyboard()
    );
  }

  // 3-6. Filtrer, sélectionner le meilleur pronostic exploitable pour cette catégorie
  const best = predictionService.selectBestForCategory(apiResult.data, category, 1);

  if (best.length === 0) {
    // Cas particulier attendu et systématique pour "score_exact" avec cette API.
    const message = predictionService.NO_DATA_MESSAGES[category] || '❌ Données insuffisantes pour générer ce type de pronostic.';
    return ctx.reply(message, mainMenuKeyboard());
    // Important : on NE décrémente PAS le compteur gratuit ici, puisqu'aucun
    // pronostic valide n'a été généré.
  }

  const { match, extracted } = best[0];
  const messageText = predictionService.formatPredictionMessage(match, category, extracted);

  await ctx.reply(messageText, { parse_mode: 'HTML', ...mainMenuKeyboard() });

  // 7-8. Un pronostic valide a bien été généré : on décrémente le compteur
  // gratuit (si applicable) et on l'enregistre dans l'historique.
  userService.registerFreeUsage(telegramId);

  const pickLabel = category === 'total_buts' ? extracted.best.pick : extracted.pick;
  const confidencePct = category === 'total_buts' ? extracted.best.confidencePct : extracted.confidencePct;
  userService.recordPrediction(
    telegramId,
    category,
    `${match.home_team} vs ${match.away_team}`,
    pickLabel,
    confidencePct,
    { matchId: match.id, market: category }
  );
}

async function sendAccessDeniedMessage(ctx, reason) {
  if (reason === 'exact_score_locked') {
    return ctx.reply(
      `🔒 <b>SCORE EXACT — ACCÈS RÉSERVÉ</b>\n\n` +
        `Cette catégorie est réservée aux abonnés <b>Premium + Score Exact</b>.\n\n` +
        `💎 Passez à la formule supérieure pour y accéder.`,
      { parse_mode: 'HTML', ...premiumPlansKeyboard() }
    );
  }

  // free_limit_reached (par défaut)
  return ctx.reply(
    `🔒 <b>LIMITE ATTEINTE</b>\n\n` +
      `Vous avez utilisé vos ${config.freePredictionsLimit} pronostics gratuits.\n\n` +
      `💎 Passez Premium pour continuer.\n\n` +
      `👇 Choisissez une formule :`,
    { parse_mode: 'HTML', ...premiumPlansKeyboard() }
  );
}

module.exports = { handleCategory };
