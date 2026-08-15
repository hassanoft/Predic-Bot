const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const config = require('../config/config');

// S'assure que le dossier parent du fichier SQLite existe (utile pour /data sur Render).
const dbDir = path.dirname(config.databasePath);
if (dbDir && dbDir !== '.' && !fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(config.databasePath);

// Améliore la fiabilité en cas d'écritures concurrentes (webhook + cron + admin).
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = db;
