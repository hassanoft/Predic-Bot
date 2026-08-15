/**
 * Stockage mémoire (non persistant) de l'état "en cours de paiement" par
 * utilisateur. Suffisant pour un parcours court (choix formule → moyen →
 * preuve). En cas de redéploiement, l'utilisateur reprend simplement au
 * menu Premium.
 */
const sessions = new Map();

function setDraft(telegramId, draft) {
  sessions.set(String(telegramId), draft);
}

function getDraft(telegramId) {
  return sessions.get(String(telegramId)) || null;
}

function clearDraft(telegramId) {
  sessions.delete(String(telegramId));
}

// Suivi séparé pour le flux /broadcast admin (message en attente de confirmation).
const broadcastDrafts = new Map();

function setBroadcastDraft(telegramId, text) {
  broadcastDrafts.set(String(telegramId), text);
}

function getBroadcastDraft(telegramId) {
  return broadcastDrafts.get(String(telegramId)) || null;
}

function clearBroadcastDraft(telegramId) {
  broadcastDrafts.delete(String(telegramId));
}

module.exports = {
  setDraft,
  getDraft,
  clearDraft,
  setBroadcastDraft,
  getBroadcastDraft,
  clearBroadcastDraft,
};
