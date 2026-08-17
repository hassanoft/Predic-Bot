const { Markup } = require('telegraf');
const config = require('../config/config');

const BUTTONS = {
  PRONOSTICS: '🎫 PRONOSTICS',
  EXACT_SCORE: '🔢 SCORE EXACT',
  PREMIUM: '💎 PREMIUM',
  ACCOUNT: '👤 MON COMPTE',
  BACK: '⬅️ RETOUR',
};

// Association bouton → catégorie interne (voir predictionService.js)
// Seul SCORE EXACT garde un flux "1 catégorie -> 1 match" ; PRONOSTICS a son
// propre flux dédié (voir handlers/combo.js).
const BUTTON_TO_CATEGORY = {
  [BUTTONS.EXACT_SCORE]: 'score_exact',
};

function mainMenuKeyboard() {
  return Markup.keyboard([
    [BUTTONS.PRONOSTICS, BUTTONS.EXACT_SCORE],
    [BUTTONS.PREMIUM, BUTTONS.ACCOUNT],
  ]).resize();
}

// Tailles de combiné proposées à l'utilisateur.
const COMBO_SIZES = [5, 10, 15, 20];

function comboSizeKeyboard() {
  const buttons = COMBO_SIZES.map((n) => Markup.button.callback(`${n} matchs`, `combo:size:${n}`));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  return Markup.inlineKeyboard(rows);
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

function paymentConfirmKeyboard(planId) {
  return Markup.inlineKeyboard([[Markup.button.callback("✅ J'AI PAYÉ", `pay:confirm:${planId}`)]]);
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
  COMBO_SIZES,
  mainMenuKeyboard,
  comboSizeKeyboard,
  premiumPlansKeyboard,
  paymentConfirmKeyboard,
  adminValidationKeyboard,
  broadcastConfirmKeyboard,
};
