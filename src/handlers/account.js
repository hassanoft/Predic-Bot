const userService = require('../services/userService');
const { mainMenuKeyboard } = require('../keyboards/mainKeyboard');

async function accountHandler(ctx) {
  const telegramId = ctx.from.id;
  userService.getOrCreateUser(telegramId, ctx.from.username, ctx.from.first_name);
  const status = userService.getStatus(telegramId);

  if (status.isAdmin) {
    const message =
      `👤 <b>MON COMPTE</b>\n\n` +
      `🆔 ID Telegram : <code>${telegramId}</code>\n\n` +
      `👑 <b>ADMINISTRATEUR</b>\n\n` +
      `💎 Premium permanent\n` +
      `🔢 Score Exact : ACTIVÉ\n` +
      `♾️ Générations illimitées`;
    return ctx.reply(message, { parse_mode: 'HTML', ...mainMenuKeyboard() });
  }

  const expirationLine =
    status.isPremiumActive && status.daysRemaining !== null
      ? `${status.daysRemaining} jour(s) restant(s)`
      : 'Aucun abonnement actif';

  const message =
    `👤 <b>MON COMPTE</b>\n\n` +
    `🆔 ID Telegram : <code>${telegramId}</code>\n\n` +
    `🎁 <b>Gratuit</b>\n${status.freeUsed} / ${status.freeLimit} utilisés\n\n` +
    `💎 <b>Statut</b>\n${status.statusLabel}\n\n` +
    `📅 <b>Abonnement</b>\n${expirationLine}\n\n` +
    `🔢 <b>Score Exact</b>\n${status.exactScoreEnabled ? 'Activé' : 'Désactivé'}`;

  await ctx.reply(message, { parse_mode: 'HTML', ...mainMenuKeyboard() });
}

module.exports = accountHandler;
