const config = require('../config/config');
const userService = require('../services/userService');
const paymentService = require('../services/paymentService');
const sessions = require('../state/paymentSessions');
const { broadcastConfirmKeyboard, mainMenuKeyboard } = require('../keyboards/mainKeyboard');

function requireAdmin(ctx) {
  if (!userService.isAdmin(ctx.from.id)) {
    ctx.reply('⛔ Commande réservée à l’administrateur.');
    return false;
  }
  return true;
}

async function adminMenu(ctx) {
  if (!requireAdmin(ctx)) return;
  await ctx.reply(
    `👑 <b>MENU ADMINISTRATEUR</b>\n\n` +
      `/stats — Statistiques globales\n` +
      `/users — Derniers utilisateurs\n` +
      `/payments — Paiements en attente\n` +
      `/predictions — Statistiques des pronostics\n` +
      `/broadcast [message] — Diffuser un message`,
    { parse_mode: 'HTML' }
  );
}

async function stats(ctx) {
  if (!requireAdmin(ctx)) return;
  const s = userService.getStats();

  await ctx.reply(
    `👑 <b>STATISTIQUES</b>\n\n` +
      `👥 Utilisateurs : ${s.totalUsers}\n` +
      `💎 Premium : ${s.premiumUsers}\n` +
      `🆓 Gratuits : ${s.freeUsers}\n\n` +
      `💰 Paiements validés :\n${s.totalRevenue} FCFA\n\n` +
      `📊 Pronostics générés :\n${s.totalPredictions}`,
    { parse_mode: 'HTML' }
  );
}

async function users(ctx) {
  if (!requireAdmin(ctx)) return;
  const list = userService.listUsers(20);

  if (list.length === 0) return ctx.reply('Aucun utilisateur enregistré pour le moment.');

  const lines = list.map((u) => {
    const tag = u.username ? `@${u.username}` : u.first_name || 'Sans nom';
    const badge = u.is_admin ? '👑' : u.premium_expires_at && new Date(u.premium_expires_at) > new Date() ? '💎' : '🆓';
    return `${badge} ${tag} — <code>${u.telegram_id}</code>`;
  });

  await ctx.reply(`👥 <b>DERNIERS UTILISATEURS</b>\n\n${lines.join('\n')}`, { parse_mode: 'HTML' });
}

async function payments(ctx) {
  if (!requireAdmin(ctx)) return;
  const pending = paymentService.getPendingPayments(20);

  if (pending.length === 0) return ctx.reply('✅ Aucun paiement en attente.');

  const lines = pending.map(
    (p) => `#${p.id} — <code>${p.telegram_id}</code> — ${p.plan} — ${p.amount} FCFA — ${p.payment_method}`
  );

  await ctx.reply(`💰 <b>PAIEMENTS EN ATTENTE</b>\n\n${lines.join('\n')}`, { parse_mode: 'HTML' });
}

async function predictionsStats(ctx) {
  if (!requireAdmin(ctx)) return;
  const s = userService.getStats();
  await ctx.reply(`📊 <b>PRONOSTICS GÉNÉRÉS</b>\n\nTotal : ${s.totalPredictions}`, { parse_mode: 'HTML' });
}

async function broadcastStart(ctx) {
  if (!requireAdmin(ctx)) return;

  const text = ctx.message.text.replace(/^\/broadcast(@\w+)?\s*/i, '').trim();
  if (!text) {
    return ctx.reply('Usage : /broadcast Votre message à diffuser à tous les utilisateurs.');
  }

  sessions.setBroadcastDraft(ctx.from.id, text);

  await ctx.reply(
    `📢 <b>APERÇU DU MESSAGE</b>\n\n${text}\n\n` + `Confirmez-vous l'envoi à tous les utilisateurs ?`,
    { parse_mode: 'HTML', ...broadcastConfirmKeyboard() }
  );
}

async function broadcastConfirm(ctx) {
  if (!requireAdmin(ctx)) return ctx.answerCbQuery();

  const text = sessions.getBroadcastDraft(ctx.from.id);
  if (!text) {
    await ctx.answerCbQuery();
    return ctx.reply('⚠️ Aucun message en attente. Utilisez /broadcast à nouveau.');
  }

  await ctx.answerCbQuery('Diffusion en cours...');
  sessions.clearBroadcastDraft(ctx.from.id);

  const ids = userService.listAllTelegramIds();
  let sent = 0;
  let failed = 0;

  for (const id of ids) {
    try {
      await ctx.telegram.sendMessage(id, `📢 ${text}`);
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  await ctx.reply(`✅ Diffusion terminée.\n\nEnvoyés : ${sent}\nÉchecs : ${failed}`);
}

async function broadcastCancel(ctx) {
  if (!requireAdmin(ctx)) return ctx.answerCbQuery();
  sessions.clearBroadcastDraft(ctx.from.id);
  await ctx.answerCbQuery('Annulé.');
  await ctx.reply('❌ Diffusion annulée.');
}

async function approvePayment(ctx) {
  if (!requireAdmin(ctx)) return ctx.answerCbQuery();

  const paymentId = Number(ctx.match[1]);
  const payment = paymentService.getPaymentById(paymentId);

  if (!payment) {
    await ctx.answerCbQuery('Paiement introuvable.');
    return;
  }
  if (payment.status !== 'pending') {
    await ctx.answerCbQuery('Ce paiement a déjà été traité.');
    return;
  }

  const plan = config.premiumPlans[payment.plan];
  if (!plan) {
    await ctx.answerCbQuery('Formule inconnue pour ce paiement.');
    return;
  }

  paymentService.approvePayment(paymentId);
  const user = userService.activatePremium(payment.telegram_id, plan);

  await ctx.answerCbQuery('Paiement approuvé ✅');
  await ctx.editMessageCaption(
    `${ctx.callbackQuery.message.caption}\n\n✅ <b>APPROUVÉ</b>`,
    { parse_mode: 'HTML' }
  ).catch(() => {});

  const expirationDate = new Date(user.premium_expires_at).toLocaleDateString('fr-FR');

  await ctx.telegram.sendMessage(
    payment.telegram_id,
    `✅ <b>PAIEMENT VALIDÉ</b>\n\n` +
      `Votre Premium est maintenant actif.\n\n` +
      `💎 Formule : ${plan.label}\n` +
      `📅 Expiration : ${expirationDate}\n\n` +
      `Profitez de vos pronostics !`,
    { parse_mode: 'HTML' }
  ).catch((err) => console.error('❌ Échec notification utilisateur (approbation) :', err.message));
}

async function rejectPayment(ctx) {
  if (!requireAdmin(ctx)) return ctx.answerCbQuery();

  const paymentId = Number(ctx.match[1]);
  const payment = paymentService.getPaymentById(paymentId);

  if (!payment) {
    await ctx.answerCbQuery('Paiement introuvable.');
    return;
  }
  if (payment.status !== 'pending') {
    await ctx.answerCbQuery('Ce paiement a déjà été traité.');
    return;
  }

  paymentService.rejectPayment(paymentId);

  await ctx.answerCbQuery('Paiement refusé ❌');
  await ctx.editMessageCaption(
    `${ctx.callbackQuery.message.caption}\n\n❌ <b>REFUSÉ</b>`,
    { parse_mode: 'HTML' }
  ).catch(() => {});

  await ctx.telegram.sendMessage(
    payment.telegram_id,
    `❌ <b>PAIEMENT REFUSÉ</b>\n\nVotre paiement n'a pas pu être validé.\nContactez l'administrateur si nécessaire.`,
    { parse_mode: 'HTML' }
  ).catch((err) => console.error('❌ Échec notification utilisateur (refus) :', err.message));
}

module.exports = {
  adminMenu,
  stats,
  users,
  payments,
  predictionsStats,
  broadcastStart,
  broadcastConfirm,
  broadcastCancel,
  approvePayment,
  rejectPayment,
};
