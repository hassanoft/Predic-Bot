const cron = require('node-cron');
const config = require('../config/config');
const footballApi = require('../services/footballApi');
const predictionService = require('../services/predictionService');
const comboSessions = require('../state/comboSessions');

async function publishDailyPredictions(bot) {
  if (!config.adminGroupId) {
    console.log('ℹ️ ADMIN_GROUP_ID non configuré — publication automatique désactivée.');
    return;
  }

  const apiResult = await footballApi.getUpcomingPredictions({ useCache: false });
  if (!apiResult.success) {
    console.error('❌ Publication quotidienne annulée — source de données indisponible :', apiResult.message);
    return;
  }

  // Même logique que le flux utilisateur PRONOSTICS : tirage aléatoire,
  // sans reproduire exactement le dernier combiné publié dans le groupe.
  const previousIds = comboSessions.getLastGroupTicket();
  const ticket = predictionService.buildRandomCombo(apiResult.data, config.dailyPredictionsCount, previousIds);

  if (!ticket || ticket.actualSize === 0) {
    console.log('ℹ️ Publication quotidienne annulée — aucun combiné exploitable actuellement.');
    return;
  }

  comboSessions.setLastGroupTicket(ticket.matchIds);

  const dateLabel = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });

  const message = predictionService.formatComboMessage(ticket, {
    title: `🔥 <b>COMBINÉ DU JOUR — ${ticket.actualSize} MATCHS</b>\n📅 ${dateLabel}`,
  });

  try {
    // Vérification explicite de l'identifiant du chat avant tout envoi :
    // on n'envoie JAMAIS ailleurs que dans ADMIN_GROUP_ID.
    await bot.telegram.sendMessage(config.adminGroupId, message, { parse_mode: 'HTML' });
    console.log(`✅ Combiné du jour publié dans le groupe ${config.adminGroupId} (${ticket.actualSize} match(s)).`);
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
