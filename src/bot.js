const { Telegraf } = require('telegraf');
const config = require('./config/config');
const { runMigrations } = require('./database/migrations');

const startHandler = require('./handlers/start');
const accountHandler = require('./handlers/account');
const predictionsHandler = require('./handlers/predictions');
const premiumHandler = require('./handlers/premium');
const adminHandler = require('./handlers/admin');
const { scheduleDailyPredictions } = require('./jobs/dailyPredictions');
const { BUTTONS, BUTTON_TO_CATEGORY } = require('./keyboards/mainKeyboard');

runMigrations();

const bot = new Telegraf(config.botToken);

// ─────────────────────────────────────────────
// COMMANDES
// ─────────────────────────────────────────────
bot.start(startHandler);
bot.command('admin', adminHandler.adminMenu);
bot.command('stats', adminHandler.stats);
bot.command('users', adminHandler.users);
bot.command('payments', adminHandler.payments);
bot.command('predictions', adminHandler.predictionsStats);
bot.command('broadcast', adminHandler.broadcastStart);

// ─────────────────────────────────────────────
// MENU PRINCIPAL (Reply Keyboard)
// ─────────────────────────────────────────────
for (const [buttonText, category] of Object.entries(BUTTON_TO_CATEGORY)) {
  bot.hears(buttonText, (ctx) => predictionsHandler.handleCategory(ctx, category));
}

bot.hears(BUTTONS.PREMIUM, premiumHandler.showPremiumMenu);
bot.hears(BUTTONS.ACCOUNT, accountHandler);

// ─────────────────────────────────────────────
// PARCOURS PREMIUM (Inline Keyboards)
// ─────────────────────────────────────────────
bot.action(/^premium:plan:(.+)$/, premiumHandler.selectPlan);
bot.action(/^pay:method:([a-z_]+):(.+)$/, premiumHandler.selectMethod);
bot.action(/^pay:confirm:([a-z_]+):(.+)$/, premiumHandler.confirmPaid);
bot.on('photo', premiumHandler.receiveProof);

// ─────────────────────────────────────────────
// ADMINISTRATION
// ─────────────────────────────────────────────
bot.action(/^admin:approve:(\d+)$/, adminHandler.approvePayment);
bot.action(/^admin:reject:(\d+)$/, adminHandler.rejectPayment);
bot.action('admin:broadcast:confirm', adminHandler.broadcastConfirm);
bot.action('admin:broadcast:cancel', adminHandler.broadcastCancel);

// ─────────────────────────────────────────────
// GESTION D'ERREURS GLOBALE
// Le bot ne doit jamais planter sur une erreur non gérée.
// ─────────────────────────────────────────────
bot.catch((err, ctx) => {
  console.error(`❌ Erreur non gérée pour l'update ${ctx.updateType} :`, err.message);
  ctx
    .reply('⚠️ Une erreur inattendue est survenue. Veuillez réessayer.')
    .catch(() => {});
});

// ─────────────────────────────────────────────
// TÂCHE QUOTIDIENNE
// ─────────────────────────────────────────────
scheduleDailyPredictions(bot);

module.exports = bot;
