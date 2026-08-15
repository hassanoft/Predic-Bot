const db = require('../database/database');
const config = require('../config/config');

function nowIso() {
  return new Date().toISOString();
}

function isConfiguredAdmin(telegramId) {
  return String(telegramId) === config.adminTelegramId;
}

/**
 * Récupère un utilisateur, ou le crée s'il n'existe pas encore.
 * Un /start supplémentaire NE réinitialise JAMAIS free_predictions_used.
 */
function getOrCreateUser(telegramId, username, firstName) {
  const id = String(telegramId);
  const existing = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(id);

  if (existing) {
    // On met à jour uniquement les métadonnées (username peut changer),
    // jamais les compteurs.
    db.prepare(
      'UPDATE users SET username = ?, first_name = ?, updated_at = ? WHERE telegram_id = ?'
    ).run(username || existing.username, firstName || existing.first_name, nowIso(), id);
    return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(id);
  }

  const timestamp = nowIso();
  db.prepare(
    `INSERT INTO users
      (telegram_id, username, first_name, free_predictions_used, is_admin, premium_type, premium_expires_at, exact_score_enabled, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, NULL, NULL, 0, ?, ?)`
  ).run(id, username || null, firstName || null, isConfiguredAdmin(id) ? 1 : 0, timestamp, timestamp);

  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(id);
}

function getUser(telegramId) {
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(String(telegramId));
}

function isAdmin(telegramId) {
  if (isConfiguredAdmin(telegramId)) return true;
  const user = getUser(telegramId);
  return !!(user && user.is_admin);
}

function isPremiumActive(user) {
  if (!user || !user.premium_expires_at) return false;
  return new Date(user.premium_expires_at).getTime() > Date.now();
}

/**
 * Renvoie un résumé exploitable de l'état du compte : statut, accès,
 * générations restantes, expiration, etc.
 */
function getStatus(telegramId) {
  const user = getUser(telegramId);
  if (!user) return null;

  const admin = isAdmin(telegramId);
  const premiumActive = isPremiumActive(user);

  let statusLabel;
  if (admin) statusLabel = 'Administrateur';
  else if (premiumActive) statusLabel = user.premium_type === 'exact_score' ? 'Premium + Score Exact' : 'Premium';
  else statusLabel = 'Gratuit';

  const freeRemaining = Math.max(0, config.freePredictionsLimit - user.free_predictions_used);

  let daysRemaining = null;
  if (premiumActive) {
    daysRemaining = Math.ceil((new Date(user.premium_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }

  return {
    user,
    isAdmin: admin,
    isPremiumActive: premiumActive,
    statusLabel,
    freeUsed: user.free_predictions_used,
    freeRemaining,
    freeLimit: config.freePredictionsLimit,
    exactScoreEnabled: admin || (premiumActive && !!user.exact_score_enabled),
    daysRemaining,
  };
}

/**
 * Vérifie si un utilisateur peut générer un pronostic pour une catégorie donnée.
 * Renvoie { allowed: boolean, reason?: string }
 */
function canGenerate(telegramId, category) {
  const status = getStatus(telegramId);
  if (!status) return { allowed: false, reason: 'unknown_user' };

  if (status.isAdmin) return { allowed: true };

  const categoryConfig = config.categories[category];
  if (categoryConfig && categoryConfig.requiresExactScore && !status.exactScoreEnabled) {
    return { allowed: false, reason: 'exact_score_locked' };
  }

  if (status.isPremiumActive) return { allowed: true };

  if (status.freeRemaining > 0) return { allowed: true };

  return { allowed: false, reason: 'free_limit_reached' };
}

/**
 * Incrémente le compteur d'essais gratuits — à appeler UNIQUEMENT après
 * la génération effective d'un pronostic valide (jamais en cas d'échec API).
 */
function registerFreeUsage(telegramId) {
  const status = getStatus(telegramId);
  if (!status || status.isAdmin || status.isPremiumActive) return; // n'affecte que les comptes gratuits

  db.prepare(
    'UPDATE users SET free_predictions_used = free_predictions_used + 1, updated_at = ? WHERE telegram_id = ?'
  ).run(nowIso(), String(telegramId));
}

/**
 * Active un abonnement Premium pour un utilisateur.
 * @param {string|number} telegramId
 * @param {object} plan - une entrée de config.premiumPlans
 */
function activatePremium(telegramId, plan) {
  const id = String(telegramId);
  const user = getUser(id);
  if (!user) throw new Error(`Utilisateur introuvable: ${id}`);

  // Si un abonnement est déjà actif, on prolonge à partir de la date d'expiration
  // existante ; sinon on part d'aujourd'hui.
  const base = isPremiumActive(user) ? new Date(user.premium_expires_at) : new Date();
  const expiresAt = new Date(base.getTime() + plan.days * 24 * 60 * 60 * 1000);

  db.prepare(
    `UPDATE users
       SET premium_type = ?, premium_expires_at = ?, exact_score_enabled = ?, updated_at = ?
     WHERE telegram_id = ?`
  ).run(plan.type, expiresAt.toISOString(), plan.exactScore ? 1 : 0, nowIso(), id);

  return getUser(id);
}

function recordPrediction(telegramId, category, matchLabel, predictionLabel, confidencePct, apiDataSnapshot) {
  db.prepare(
    `INSERT INTO predictions (telegram_id, category, match, prediction, confidence, api_data, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    String(telegramId),
    category,
    matchLabel,
    predictionLabel,
    confidencePct,
    JSON.stringify(apiDataSnapshot || {}),
    nowIso()
  );
}

function getStats() {
  const totalUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const premiumUsers = db
    .prepare("SELECT COUNT(*) AS c FROM users WHERE premium_expires_at IS NOT NULL AND premium_expires_at > ?")
    .get(nowIso()).c;
  const freeUsers = totalUsers - premiumUsers;
  const totalRevenue = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE status = 'approved'")
    .get().s;
  const totalPredictions = db.prepare('SELECT COUNT(*) AS c FROM predictions').get().c;

  return { totalUsers, premiumUsers, freeUsers, totalRevenue, totalPredictions };
}

function listUsers(limit = 20) {
  return db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT ?').all(limit);
}

function listAllTelegramIds() {
  return db.prepare('SELECT telegram_id FROM users').all().map((r) => r.telegram_id);
}

module.exports = {
  getOrCreateUser,
  getUser,
  isAdmin,
  isPremiumActive,
  getStatus,
  canGenerate,
  registerFreeUsage,
  activatePremium,
  recordPrediction,
  getStats,
  listUsers,
  listAllTelegramIds,
};
