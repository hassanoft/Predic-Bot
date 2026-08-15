const { Markup } = require('telegraf');
const config = require('../config/config');

const BUTTONS = {
  ONE_X_TWO: '⚽ 1X2',
  TOTAL_GOALS: '⚽ TOTAL DE BUT',
  BTTS: '🎯 BTTS',
  OVER_UNDER: '📊 OVER/UNDER',
  DOUBLE_CHANCE: '🛡 DOUBLE CHANCE',
  EXACT_SCORE: '🔢 SCORE EXACT',
  PREMIUM: '💎 PREMIUM',
  ACCOUNT: '👤 MON COMPTE',
  BACK: '⬅️ RETOUR',
};

// Association bouton → catégorie interne (voir predictionService.js)
const BUTTON_TO_CATEGORY = {
  [BUTTONS.ONE_X_TWO]: '1x2',
  [BUTTONS.TOTAL_GOALS]: 'total_buts',
  [BUTTONS.BTTS]: 'btts',
  [BUTTONS.OVER_UNDER]: 'over_under',
  [BUTTONS.DOUBLE_CHANCE]: 'double_chance',
  [BUTTONS.EXACT_SCORE]: 'score_exact',
};

function mainMenuKeyboard() {
  return Markup.keyboard([
    [BUTTONS.ONE_X_TWO, BUTTONS.TOTAL_GOALS],
    [BUTTONS.BTTS, BUTTONS.OVER_UNDER],
    [BUTTONS.DOUBLE_CHANCE, BUTTONS.EXACT_SCORE],
    [BUTTONS.PREMIUM, BUTTONS.ACCOUNT],
  ])
    .resize()
    .persistent();
}

function premiumPlansKeyboard() {
  const plans = config.premiumPlans;
  const standardRow = ['standard_7', 'standard_30', 'standard_90'].map((id) =>
    Markup.button.callback(`🟢 ${plans[id].label} — ${plans[id].price} FCFA`, `premium:plan:${id}`)
  );
  const exactRow = ['exact_30', 'exact_90', 'exact_365'].map((id) =>
    Markup.button.callback(`👑 ${plans[id].label} — ${plans[id].price} FCFA`, `premium:plan:${id}`)
  );

  return Markup.inlineKeyboard([...standardRow.map((b) => [b]), ...exactRow.map((b) => [b])]);
}

function paymentMethodsKeyboard(planId) {
  const methods = config.paymentMethods;
  const buttons = Object.values(methods).map((m) =>
    Markup.button.callback(`${m.emoji} ${m.label}`, `pay:method:${m.id}:${planId}`)
  );
  return Markup.inlineKeyboard(buttons.map((b) => [b]));
}

function paymentConfirmKeyboard(methodId, planId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✅ J'AI PAYÉ", `pay:confirm:${methodId}:${planId}`)],
  ]);
}

function adminValidationKeyboard(paymentId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ APPROUVER', `admin:approve:${paymentId}`),
      Markup.button.callback('❌ REFUSER', `admin:reject:${paymentId}`),
    ],
  ]);
}

function broadcastConfirmKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Envoyer', 'admin:broadcast:confirm'),
      Markup.button.callback('❌ Annuler', 'admin:broadcast:cancel'),
    ],
  ]);
}

module.exports = {
  BUTTONS,
  BUTTON_TO_CATEGORY,
  mainMenuKeyboard,
  premiumPlansKeyboard,
  paymentMethodsKeyboard,
  paymentConfirmKeyboard,
  adminValidationKeyboard,
  broadcastConfirmKeyboard,
};
