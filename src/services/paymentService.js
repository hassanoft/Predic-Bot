const db = require('../database/database');

function nowIso() {
  return new Date().toISOString();
}

function createPaymentRequest(telegramId, planId, amount, paymentMethod, proofFileId) {
  const result = db
    .prepare(
      `INSERT INTO payments (telegram_id, plan, amount, payment_method, proof_file_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`
    )
    .run(String(telegramId), planId, amount, paymentMethod, proofFileId || null, nowIso());

  return getPaymentById(result.lastInsertRowid);
}

function getPaymentById(id) {
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
}

function approvePayment(id) {
  db.prepare("UPDATE payments SET status = 'approved', validated_at = ? WHERE id = ?").run(nowIso(), id);
  return getPaymentById(id);
}

function rejectPayment(id) {
  db.prepare("UPDATE payments SET status = 'rejected', validated_at = ? WHERE id = ?").run(nowIso(), id);
  return getPaymentById(id);
}

function getPendingPayments(limit = 20) {
  return db.prepare("SELECT * FROM payments WHERE status = 'pending' ORDER BY created_at DESC LIMIT ?").all(limit);
}

function getRecentPayments(limit = 20) {
  return db.prepare('SELECT * FROM payments ORDER BY created_at DESC LIMIT ?').all(limit);
}

module.exports = {
  createPaymentRequest,
  getPaymentById,
  approvePayment,
  rejectPayment,
  getPendingPayments,
  getRecentPayments,
};
