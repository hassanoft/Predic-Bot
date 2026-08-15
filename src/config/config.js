require('dotenv').config();

/**
 * Liste des variables d'environnement strictement obligatoires
 * pour que le bot puisse démarrer correctement.
 */
const REQUIRED_ENV_VARS = ['BOT_TOKEN', 'ADMIN_TELEGRAM_ID', 'RAPIDAPI_KEY'];

function assertRequiredEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    // On log une erreur claire plutôt que de laisser planter le process
    // avec une stack trace incompréhensible pour l'utilisateur final.
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
 * Moyens de paiement manuels.
 * numberEnvKey pointe vers la variable d'environnement contenant le numéro réel.
 */
const PAYMENT_METHODS = {
  orange_money: {
    id: 'orange_money',
    label: 'Orange Money',
    emoji: '🟠',
    numberEnvKey: 'ORANGE_MONEY_NUMBER',
  },
  mtn_momo: {
    id: 'mtn_momo',
    label: 'MTN Mobile Money',
    emoji: '🔵',
    numberEnvKey: 'MTN_MOMO_NUMBER',
  },
  moov_money: {
    id: 'moov_money',
    label: 'Moov Money',
    emoji: '🔴',
    numberEnvKey: 'MOOV_MONEY_NUMBER',
  },
  wave: {
    id: 'wave',
    label: 'Wave',
    emoji: '🟣',
    numberEnvKey: 'WAVE_NUMBER',
  },
};

/**
 * Catégories de pronostics et marchés API correspondants.
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

  rapidApiKey: process.env.RAPIDAPI_KEY,
  rapidApiHost: process.env.RAPIDAPI_HOST || 'football-prediction-api.p.rapidapi.com',
  // On ne garde que la base de l'URL : le service ajoute lui-même les query params.
  rapidApiBaseUrl: 'https://football-prediction-api.p.rapidapi.com/api/v2',

  databasePath: process.env.DATABASE_PATH && process.env.DATABASE_PATH.trim() !== ''
    ? process.env.DATABASE_PATH
    : './database.sqlite',

  freePredictionsLimit: 2,

  dailyCronSchedule: process.env.DAILY_CRON_SCHEDULE || '0 8 * * *',
  dailyPredictionsCount: Number(process.env.DAILY_PREDICTIONS_COUNT) || 5,

  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  premiumPlans: PREMIUM_PLANS,
  paymentMethods: PAYMENT_METHODS,
  categories: CATEGORIES,
};

module.exports = config;
