const config = require('../config/config');
const paymentService = require('../services/paymentService');
const sessions = require('../state/paymentSessions');
const {
  mainMenuKeyboard,
  premiumPlansKeyboard,
  paymentConfirmKeyboard,
  adminValidationKeyboard,
} = require('../keyboards/mainKeyboard');

function buildWavePayLink(amount) {
  return `${config.wavePayLinkBase}${amount}`;
}

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
    `💳 Paiement par Wave uniquement.\n\n` +
    `⚠️ <i>Les pronostics restent des estimations statistiques, aucun résultat n'est garanti.</i>`;

  await ctx.reply(message, { parse_mode: 'HTML', ...premiumPlansKeyboard() });
}

/**
 * Formule choisie -> on affiche directement le lien de paiement Wave avec
 * le montant pré-rempli (plus d'étape de choix de moyen de paiement,
 * Wave étant désormais le seul disponible).
 */
async function selectPlan(ctx) {
  const planId = ctx.match[1];
  const plan = config.premiumPlans[planId];
  if (!plan) return ctx.answerCbQuery('Formule introuvable.');

  await ctx.answerCbQuery();
  sessions.setDraft(ctx.from.id, { planId, awaitingProof: false });

  const payLink = buildWavePayLink(plan.price);

  const message =
    `💳 <b>PAIEMENT — WAVE</b>\n\n` +
    `Formule :\n${plan.label}\n\n` +
    `Montant :\n${plan.price} FCFA\n\n` +
    `👉 Cliquez pour payer directement avec Wave :\n${payLink}\n\n` +
    `Après paiement, cliquez sur le bouton ci-dessous.`;

  await ctx.reply(message, {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...paymentConfirmKeyboard(planId),
  });
}

async function confirmPaid(ctx) {
  const planId = ctx.match[1];
  const plan = config.premiumPlans[planId];
  if (!plan) return ctx.answerCbQuery('Formule invalide.');

  await ctx.answerCbQuery();
  sessions.setDraft(ctx.from.id, { planId, awaitingProof: true });

  await ctx.reply('📸 Envoyez votre preuve de paiement (capture d’écran Wave).');
}

/**
 * Déclenché sur réception d'une photo. On ne traite que si l'utilisateur
 * a un paiement en attente de preuve — sinon on ignore silencieusement.
 */
async function receiveProof(ctx) {
  const draft = sessions.getDraft(ctx.from.id);
  if (!draft || !draft.awaitingProof) return; // pas de flux de paiement en cours

  const plan = config.premiumPlans[draft.planId];
  if (!plan) {
    sessions.clearDraft(ctx.from.id);
    return ctx.reply('⚠️ Session de paiement expirée, merci de recommencer via 💎 PREMIUM.', mainMenuKeyboard());
  }

  const photos = ctx.message.photo;
  const fileId = photos[photos.length - 1].file_id; // meilleure résolution

  const payment = paymentService.createPaymentRequest(ctx.from.id, plan.id, plan.price, 'wave', fileId);
  sessions.clearDraft(ctx.from.id);

  await ctx.reply(
    '✅ Preuve reçue ! Votre paiement est en cours de vérification par l’administrateur. Vous serez notifié dès validation.',
    mainMenuKeyboard()
  );

  await notifyAdminOfPayment(ctx, payment, plan);
}

async function notifyAdminOfPayment(ctx, payment, plan) {
  const username = ctx.from.username ? `@${ctx.from.username}` : '(pas de username)';

  const caption =
    `💰 <b>NOUVEAU PAIEMENT</b>\n\n` +
    `👤 Utilisateur : ${username}\n` +
    `🆔 Telegram ID : <code>${ctx.from.id}</code>\n\n` +
    `💎 Formule :\n${plan.label}\n\n` +
    `💰 Montant :\n${plan.price} FCFA\n\n` +
    `📱 Méthode :\n🟣 Wave`;

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
  confirmPaid,
  receiveProof,
};
