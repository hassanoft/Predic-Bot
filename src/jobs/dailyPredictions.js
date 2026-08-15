const cron = require('node-cron');
const config = require('../config/config');
const footballApi = require('../services/footballApi');
const predictionService = require('../services/predictionService');

/**
 * Construit le message groupé "PRONOSTICS DU JOUR" à partir d'une sélection
 * de matchs déjà traités (1X2 uniquement, catégorie la plus fiable pour un
 * envoi automatique groupé — conforme à la règle "ne jamais inventer").
 */
function formatDailyMessage(picks) {
  const dateLabel = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });

  const blocks = picks.map(({ match, extracted }, index) => {
    return (
      `⚽ <b>MATCH ${index + 1}</b>\n\n` +
      `${predictionService.escapeHtml(match.home_team)} 🆚 ${predictionService.escapeHtml(match.away_team)}\n\n` +
      `🎯 1X2\n➡️ ${predictionService.escapeHtml(extracted.pick)}\n\n` +
      `📊 Confiance : ${extracted.confidencePct}%`
    );
  });

  return (
    `🔥 <b>PRONOSTICS DU JOUR</b>\n\n` +
    `📅 ${dateLabel}\n\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    blocks.join('\n\n━━━━━━━━━━━━━━━━\n\n') +
    `\n\n━━━━━━━━━━━━━━━━\n\n` +
    `🤖 <i>Football Prediction Bot</i>\n` +
    `📊 <i>Données basées sur l'API</i>\n\n` +
    `⚠️ <i>Estimations statistiques, aucun résultat n'est garanti.</i>`
  );
}

async function publishDailyPredictions(bot) {
  if (!config.adminGroupId) {
    console.log('ℹ️ ADMIN_GROUP_ID non configuré — publication automatique désactivée.');
    return;
  }

  const apiResult = await footballApi.getUpcomingPredictions({ useCache: false });
  if (!apiResult.success) {
    console.error('❌ Publication quotidienne annulée — API indisponible :', apiResult.message);
    return;
  }

  const picks = predictionService.selectBestForCategory(apiResult.data, '1x2', config.dailyPredictionsCount);
  if (picks.length === 0) {
    console.log('ℹ️ Publication quotidienne annulée — aucun pronostic 1X2 exploitable actuellement.');
    return;
  }

  const message = formatDailyMessage(picks);

  try {
    // Vérification explicite de l'identifiant du chat avant tout envoi :
    // on n'envoie JAMAIS ailleurs que dans ADMIN_GROUP_ID.
    await bot.telegram.sendMessage(config.adminGroupId, message, { parse_mode: 'HTML' });
    console.log(`✅ Pronostics du jour publiés dans le groupe ${config.adminGroupId} (${picks.length} match(s)).`);
  } catch (err) {
    console.error('❌ Échec de la publication automatique :', err.message);
  }
}

function scheduleDailyPredictions(bot) {
  cron.schedule(config.dailyCronSchedule, () => {
    publishDailyPredictions(bot).catch((err) =>
      console.error('❌ Erreur inattendue lors de la tâche quotidienne :', err.message)
    );
  });

  console.log(`🕒 Tâche quotidienne planifiée (cron: "${config.dailyCronSchedule}").`);
}

module.exports = { scheduleDailyPredictions, publishDailyPredictions };
