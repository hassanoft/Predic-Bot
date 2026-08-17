/**
 * Mémorise le dernier combiné généré (liste d'IDs de matchs) pour chaque
 * utilisateur, ainsi que pour la publication automatique du groupe. Sert
 * uniquement à éviter de reproduire deux fois d'affilée exactement le même
 * combiné — stockage mémoire, non persistant (acceptable : au pire, après
 * un redémarrage, un combiné identique pourrait être régénéré une fois).
 */
const lastUserTicket = new Map();
let lastGroupTicket = [];

function getLastUserTicket(telegramId) {
  return lastUserTicket.get(String(telegramId)) || null;
}

function setLastUserTicket(telegramId, matchIds) {
  lastUserTicket.set(String(telegramId), matchIds);
}

function getLastGroupTicket() {
  return lastGroupTicket;
}

function setLastGroupTicket(matchIds) {
  lastGroupTicket = matchIds;
}

module.exports = {
  getLastUserTicket,
  setLastUserTicket,
  getLastGroupTicket,
  setLastGroupTicket,
};
