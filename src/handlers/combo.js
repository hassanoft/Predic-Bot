const config = require('../config/config');
const userService = require('../services/userService');
const footballApi = require('../services/footballApi');
const predictionService = require('../services/predictionService');
const comboSessions = require('../state/comboSessions');
const { mainMenuKeyboard, premiumPlansKeyboard, comboSizeKeyboard } = require('../keyboards/mainKeyboard');

async function showComboSizeMenu(ctx) {
  await ctx.reply('🎫 <b>PRONOSTICS</b>\n\nCombien de matchs voulez-vous dans votre combiné ?', {
    parse_mode: 'HTML',
    ...comboSizeKeyboard(),
  });
}

async function generateCombo(ctx) {
  const size = Number(ctx.match[1]);
  await ctx.answerCbQuery();

  const telegramId = ctx.from.id;
  userService.getOrCreateUser(telegramId, ctx.from.username, ctx.from.first_name);

  // 1. Vérifier l'accès (limite gratuite / premium / admin) — un combiné,
  // quelle que soit sa taille, compte pour UNE génération.
  const access = userService.canGenerate(telegramId, 'pronostics');
  if (!access.allowed) {
    return sendAccessDeniedMessage(ctx, access.reason);
  }

  // 2. Récupérer les matchs à venir avec pronostics calculés
  const apiResult = await footballApi.getUpcomingPredictions({});
  if (!apiResult.success) {
    return ctx.reply(
      `⚠️ Impossible de récupérer les pronostics actuellement.\n\n${apiResult.message}\n\nVeuillez réessayer dans quelques instants.`,
      mainMenuKeyboard()
    );
  }

  // 3. Construire le ticket combiné (tirage aléatoire, sans répéter le
  // dernier ticket généré pour cet utilisateur)
  const previousIds = comboSessions.getLastUserTicket(telegramId);
  const ticket = predictionService.buildRandomCombo(apiResult.data, size, previousIds);

  if (!ticket || ticket.actualSize === 0) {
    return ctx.reply(
      '❌ Données insuffisantes pour générer un combiné exploitable actuellement. Réessayez plus tard.',
      mainMenuKeyboard()
    );
  }

  comboSessions.setLastUserTicket(telegramId, ticket.matchIds);

  const message = predictionService.formatComboMessage(ticket);
  await ctx.reply(message, { parse_mode: 'HTML', ...mainMenuKeyboard() });

  // 4. Un combiné valide a été généré : décrémenter le compteur gratuit
  // (si applicable) et enregistrer chaque match de l'historique.
  userService.registerFreeUsage(telegramId);

  for (const entry of ticket.entries) {
    userService.recordPrediction(
      telegramId,
      'pronostics',
      `${entry.match.home_team} vs ${entry.match.away_team}`,
      `${entry.best.category}: ${entry.best.pick}`,
      entry.best.confidencePct,
      { matchId: entry.match.id, comboSize: ticket.actualSize }
    );
  }
}

async function sendAccessDeniedMessage(ctx, reason) {
  if (reason === 'exact_score_locked') {
    // Non applicable ici (pronostics n'exige jamais Score Exact), gardé
    // par cohérence avec predictions.js si la logique évolue un jour.
    return ctx.reply(
      `🔒 <b>ACCÈS RÉSERVÉ</b>\n\n💎 Passez Premium pour continuer.`,
      { parse_mode: 'HTML', ...premiumPlansKeyboard() }
    );
  }

  return ctx.reply(
    `🔒 <b>LIMITE ATTEINTE</b>\n\n` +
      `Vous avez utilisé vos ${config.freePredictionsLimit} pronostics gratuits.\n\n` +
      `💎 Passez Premium pour continuer.\n\n` +
      `👇 Choisissez une formule :`,
    { parse_mode: 'HTML', ...premiumPlansKeyboard() }
  );
}

module.exports = { showComboSizeMenu, generateCombo };
