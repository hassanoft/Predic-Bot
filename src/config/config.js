require('dotenv').config();

/**
 * Liste des variables d'environnement strictement obligatoires
 * pour que le bot puisse démarrer correctement.
 */
const REQUIRED_ENV_VARS = ['BOT_TOKEN', 'ADMIN_TELEGRAM_ID'];

function assertRequiredEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(
      `❌ Variables d'environnement manquantes : ${missing.join(', ')}\n` +
        `→ Vérifiez votre fichier .env (ou la configuration Render) en vous basant sur .env.example`
    );
    process.exit(1);
  }
}

assertRequiredEnv();

/**
 * Formules Premium.
 * type: "standard" (sans Score Exact) | "exact_score" (avec Score Exact)
 * price: en FCFA
 */
const PREMIUM_PLANS = {
  standard_7: {
    id: 'standard_7',
    label: 'Standard — 7 jours',
    type: 'standard',
    days: 7,
    price: 1500,
    exactScore: false,
  },
  standard_30: {
    id: 'standard_30',
    label: 'Standard — 30 jours',
    type: 'standard',
    days: 30,
    price: 4000,
    exactScore: false,
  },
  standard_90: {
    id: 'standard_90',
    label: 'Standard — 90 jours',
    type: 'standard',
    days: 90,
    price: 9000,
    exactScore: false,
  },
  exact_30: {
    id: 'exact_30',
    label: 'Premium + Score Exact — 30 jours',
    type: 'exact_score',
    days: 30,
    price: 6000,
    exactScore: true,
  },
  exact_90: {
    id: 'exact_90',
    label: 'Premium + Score Exact — 90 jours',
    type: 'exact_score',
    days: 90,
    price: 13000,
    exactScore: true,
  },
  exact_365: {
    id: 'exact_365',
    label: 'Premium + Score Exact — 1 an',
    type: 'exact_score',
    days: 365,
    price: 30000,
    exactScore: true,
  },
};

/**
 * Catégories de pronostics et marchés correspondants.
 * Voir src/services/footballApi.js pour la structure réelle des données.
 */
const CATEGORIES = {
  '1x2': { label: '1X2', requiresExactScore: false },
  total_buts: { label: 'Total de buts', requiresExactScore: false },
  btts: { label: 'BTTS', requiresExactScore: false },
  over_under: { label: 'Over/Under', requiresExactScore: false },
  double_chance: { label: 'Double Chance', requiresExactScore: false },
  score_exact: { label: 'Score Exact', requiresExactScore: true },
};

const config = {
  botToken: process.env.BOT_TOKEN,
  adminTelegramId: String(process.env.ADMIN_TELEGRAM_ID || '').trim(),
  adminGroupId: process.env.ADMIN_GROUP_ID ? String(process.env.ADMIN_GROUP_ID).trim() : null,

  // ─────────────────────────────────────────────
  // Sofascore (API JSON publique, non officielle — scraping structuré)
  // Aucune clé requise. Les pronostics sont CALCULÉS par
  // src/services/predictionEngine.js (modèle de Poisson) à partir des
  // vraies données de classement (buts marqués/encaissés, domicile/
  // extérieur) récupérées sur Sofascore.
  // ─────────────────────────────────────────────
  sofascore: {
    baseUrl: 'https://api.sofascore.com/api/v1',
    // Noms de compétitions ciblés (tels qu'affichés par Sofascore), résolus
    // dynamiquement en IDs internes via /config/unique-tournaments.
    // Modifiable via SOFASCORE_COMPETITIONS (séparés par des virgules).
    competitions: (
      process.env.SOFASCORE_COMPETITIONS ||
      'Premier League,LaLiga,Serie A,Bundesliga,Ligue 1,UEFA Champions League'
    )
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean),
    // Fenêtre de matchs à venir interrogée (en jours).
    lookaheadDays: Number(process.env.SOFASCORE_LOOKAHEAD_DAYS) || 4,
  },

  // ─────────────────────────────────────────────
  // Paiement Wave (lien direct, montant ajouté en query param)
  // ─────────────────────────────────────────────
  wavePayLinkBase:
    process.env.WAVE_PAY_LINK_BASE || 'https://pay.wave.com/m/M_ci_knlRyepWBd4f/c/ci/?amount=',

  databasePath: process.env.DATABASE_PATH && process.env.DATABASE_PATH.trim() !== ''
    ? process.env.DATABASE_PATH
    : './database.sqlite',

  freePredictionsLimit: 2,

  dailyCronSchedule: process.env.DAILY_CRON_SCHEDULE || '0 8 * * *',
  dailyPredictionsCount: Number(process.env.DAILY_PREDICTIONS_COUNT) || 5,

  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  premiumPlans: PREMIUM_PLANS,
  categories: CATEGORIES,
};

module.exports = config;