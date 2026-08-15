const express = require('express');
const config = require('./config/config');
const bot = require('./bot');

const app = express();

app.get('/', (_req, res) => {
  res.send('Football Prediction Bot is running.');
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(config.port, () => {
  console.log(`🌐 Serveur Express à l'écoute sur le port ${config.port}`);
});

// Démarrage du bot en mode polling (simple et fiable pour un Web Service).
bot
  .launch()
  .then(() => console.log('🤖 Bot Telegram démarré (polling).'))
  .catch((err) => {
    console.error('❌ Échec du démarrage du bot :', err.message);
    process.exit(1);
  });

// Arrêt propre pour éviter les conflits 409 lors des redéploiements Render.
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
