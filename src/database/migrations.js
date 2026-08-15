const db = require('./database');

function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id             TEXT UNIQUE NOT NULL,
      username                TEXT,
      first_name              TEXT,
      free_predictions_used   INTEGER NOT NULL DEFAULT 0,
      is_admin                INTEGER NOT NULL DEFAULT 0,
      premium_type            TEXT,
      premium_expires_at      TEXT,
      exact_score_enabled     INTEGER NOT NULL DEFAULT 0,
      created_at              TEXT NOT NULL,
      updated_at              TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id       TEXT NOT NULL,
      plan              TEXT NOT NULL,
      amount            INTEGER NOT NULL,
      payment_method    TEXT NOT NULL,
      proof_file_id     TEXT,
      status            TEXT NOT NULL DEFAULT 'pending',
      created_at        TEXT NOT NULL,
      validated_at      TEXT
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id   TEXT NOT NULL,
      category      TEXT NOT NULL,
      match         TEXT,
      prediction    TEXT,
      confidence    REAL,
      api_data      TEXT,
      created_at    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_payments_telegram_id ON payments(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
    CREATE INDEX IF NOT EXISTS idx_predictions_telegram_id ON predictions(telegram_id);
  `);

  console.log('✅ Migrations SQLite appliquées (users, payments, predictions).');
}

module.exports = { runMigrations };
