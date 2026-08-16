require('dotenv').config();

/**
 * Liste des variables d'environnement strictement obligatoires
 * pour que le bot puisse démarrer correctement.
 */
const REQUIRED_ENV_VARS = ['BOT_TOKEN', 'ADMIN_TELEGRAM_ID', 'FOOTBALL_DATA_API_KEY'];

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
 * Moyens de paiement manuels.
 * numberEnvKey pointe vers la variable d'environnement contenant le numéro réel.
 */
const PAYMENT_METHODS = {
  mtn_momo: {
    id: 'mtn_momo',
    label: 'MTN Mobile Money',
    emoji: '🔵',
    numberEnvKey: 'MTN_MOMO_NUMBER',
  },
  wave: {
    id: 'wave',
    label: 'Wave',
    emoji: '🟣',
    numberEnvKey: 'WAVE_NUMBER',
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
  // football-data.org (fixtures + classements réels)
  // Les pronostics eux-mêmes sont CALCULÉS par src/services/predictionEngine.js
  // (modèle de Poisson) à partir de ces données réelles — cette API ne
  // fournit ni cotes ni probabilités pré-match sur le plan gratuit.
  // ─────────────────────────────────────────────
  footballData: {
    apiKey: process.env.FOOTBALL_DATA_API_KEY,
    baseUrl: 'https://api.football-data.org/v4',
    // Compétitions couvertes par le plan gratuit (TIER_ONE) parmi les plus
    // suivies en Côte d'Ivoire. Modifiable via FOOTBALL_DATA_COMPETITIONS
    // (codes séparés par des virgules), sans espaces.
    competitions: (process.env.FOOTBALL_DATA_COMPETITIONS || 'PL,PD,SA,BL1,FL1,CL')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean),
    // Fenêtre de matchs à venir interrogée (en jours).
    lookaheadDays: Number(process.env.FOOTBALL_DATA_LOOKAHEAD_DAYS) || 4,
  },

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