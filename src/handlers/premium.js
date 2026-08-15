const config = require('../config/config');
const paymentService = require('../services/paymentService');
const sessions = require('../state/paymentSessions');
const {
  mainMenuKeyboard,
  premiumPlansKeyboard,
  paymentMethodsKeyboard,
  paymentConfirmKeyboard,
  adminValidationKeyboard,
} = require('../keyboards/mainKeyboard');

async function showPremiumMenu(ctx) {
  const message =
    `💎 <b>PREMIUM</b>\n\n` +
    `🟢 <b>STANDARD</b>\n` +
    `7 jours — 1 500 FCFA\n` +
    `30 jours — 4 000 FCFA\n` +
    `90 jours — 9 000 FCFA\n\n` +
    `👑 <b>PREMIUM + SCORE EXACT</b>\n` +
    `30 jours — 6 000 FCFA\n` +
    `90 jours — 13 000 FCFA\n` +
    `1 an — 30 000 FCFA\n\n` +
    `⚠️ <i>Les pronostics restent des estimations statistiques, aucun résultat n'est garanti.</i>`;

  await ctx.reply(message, { parse_mode: 'HTML', ...premiumPlansKeyboard() });
}

async function selectPlan(ctx) {
  const planId = ctx.match[1];
  const plan = config.premiumPlans[planId];
  if (!plan) return ctx.answerCbQuery('Formule introuvable.');

  await ctx.answerCbQuery();
  sessions.setDraft(ctx.from.id, { planId });

  const message =
    `💳 <b>CHOISISSEZ VOTRE MOYEN DE PAIEMENT</b>\n\n` +
    `Formule sélectionnée : <b>${plan.label}</b> — ${plan.price} FCFA`;

  await ctx.reply(message, { parse_mode: 'HTML', ...paymentMethodsKeyboard(planId) });
}

async function selectMethod(ctx) {
  const [, methodId, planId] = ctx.match;
  const method = config.paymentMethods[methodId];
  const plan = config.premiumPlans[planId];
  if (!method || !plan) return ctx.answerCbQuery('Option invalide.');

  await ctx.answerCbQuery();
  sessions.setDraft(ctx.from.id, { planId, methodId });

  const number = process.env[method.numberEnvKey] || 'Numéro non configuré — contactez l’administrateur';

  const message =
    `💳 <b>PAIEMENT</b>\n\n` +
    `Formule :\n${plan.label}\n\n` +
    `Montant :\n${plan.price} FCFA\n\n` +
    `${method.emoji} <b>${method.label}</b>\n` +
    `Numéro : <code>${number}</code>\n\n` +
    `Effectuez le paiement sur le numéro indiqué.\n\n` +
    `Après paiement, cliquez sur le bouton ci-dessous.`;

  await ctx.reply(message, { parse_mode: 'HTML', ...paymentConfirmKeyboard(methodId, planId) });
}

async function confirmPaid(ctx) {
  const [, methodId, planId] = ctx.match;
  const method = config.paymentMethods[methodId];
  const plan = config.premiumPlans[planId];
  if (!method || !plan) return ctx.answerCbQuery('Option invalide.');

  await ctx.answerCbQuery();
  sessions.setDraft(ctx.from.id, { planId, methodId, awaitingProof: true });

  await ctx.reply('📸 Envoyez votre preuve de paiement (capture d’écran ou photo du reçu).');
}

/**
 * Déclenché sur réception d'une photo. On ne traite que si l'utilisateur
 * a un paiement en attente de preuve — sinon on ignore silencieusement
 * (ce n'est pas forcément lié à un paiement).
 */
async function receiveProof(ctx) {
  const draft = sessions.getDraft(ctx.from.id);
  if (!draft || !draft.awaitingProof) return; // pas de flux de paiement en cours

  const plan = config.premiumPlans[draft.planId];
  const method = config.paymentMethods[draft.methodId];
  if (!plan || !method) {
    sessions.clearDraft(ctx.from.id);
    return ctx.reply('⚠️ Session de paiement expirée, merci de recommencer via 💎 PREMIUM.', mainMenuKeyboard());
  }

  const photos = ctx.message.photo;
  const fileId = photos[photos.length - 1].file_id; // meilleure résolution

  const payment = paymentService.createPaymentRequest(ctx.from.id, plan.id, plan.price, method.id, fileId);
  sessions.clearDraft(ctx.from.id);

  await ctx.reply(
    '✅ Preuve reçue ! Votre paiement est en cours de vérification par l’administrateur. Vous serez notifié dès validation.',
    mainMenuKeyboard()
  );

  await notifyAdminOfPayment(ctx, payment, plan, method);
}

async function notifyAdminOfPayment(ctx, payment, plan, method) {
  const username = ctx.from.username ? `@${ctx.from.username}` : '(pas de username)';

  const caption =
    `💰 <b>NOUVEAU PAIEMENT</b>\n\n` +
    `👤 Utilisateur : ${username}\n` +
    `🆔 Telegram ID : <code>${ctx.from.id}</code>\n\n` +
    `💎 Formule :\n${plan.label}\n\n` +
    `💰 Montant :\n${plan.price} FCFA\n\n` +
    `📱 Méthode :\n${method.emoji} ${method.label}`;

  const destinations = [config.adminTelegramId];

  for (const chatId of destinations) {
    if (!chatId) continue;
    try {
      await ctx.telegram.sendPhoto(chatId, payment.proof_file_id, {
        caption,
        parse_mode: 'HTML',
        ...adminValidationKeyboard(payment.id),
      });
    } catch (err) {
      console.error(`❌ Échec de notification admin (chat ${chatId}) :`, err.message);
    }
  }
}

module.exports = {
  showPremiumMenu,
  selectPlan,
  selectMethod,
  confirmPaid,
  receiveProof,
};
