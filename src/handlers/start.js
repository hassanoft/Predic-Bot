const userService = require('../services/userService');
const { mainMenuKeyboard } = require('../keyboards/mainKeyboard');

async function startHandler(ctx) {
  const telegramId = ctx.from.id;
  userService.getOrCreateUser(telegramId, ctx.from.username, ctx.from.first_name);

  const status = userService.getStatus(telegramId);
  const welcomeExtra = status.isAdmin
    ? '\n👑 Compte administrateur détecté — accès illimité activé.'
    : `\n🎁 Vous disposez de ${status.freeRemaining} pronostic(s) gratuit(s).`;

  const message =
    `⚽ <b>Bienvenue sur Football Prediction Bot</b> !\n\n` +
    `Obtenez des pronostics football professionnels basés sur des données statistiques réelles : 1X2, BTTS, Over/Under, Double Chance, Total de buts et Score Exact.\n` +
    welcomeExtra +
    `\n\n👇 Choisissez une catégorie dans le menu ci-dessous.\n\n` +
    `⚠️ <i>Les pronostics sont des estimations basées sur des données statistiques. Aucun résultat n'est garanti. Les paris sportifs comportent des risques financiers.</i>`;

  await ctx.reply(message, { parse_mode: 'HTML', ...mainMenuKeyboard() });
}

module.exports = startHandler;
