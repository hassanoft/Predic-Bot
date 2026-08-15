const axios = require('axios');
const config = require('../config/config');

/**
 * ────────────────────────────────────────────────────────────────────────
 * STRUCTURE RÉELLE DE L'API "Football Prediction" (Boggio-Analytics, v2)
 * ────────────────────────────────────────────────────────────────────────
 * Endpoint utilisé : GET /api/v2/predictions
 *   Query params optionnels :
 *     - iso_date   : "YYYY-MM-DD" (jour démarrant à 00:00 heure de Londres)
 *     - federation : "UEFA" | "CAF" | "CONCACAF" | "CONMEBOL" | "AFC" | "OFC"
 *     - market     : "classic" (défaut) | "btts" | "over_25" | "over_35" |
 *                    "home_over_05" | "home_over_15" | "away_over_05" | "away_over_15"
 *   Réponse : { "data": [ <PredictionObject>, ... ] }
 *
 * <PredictionObject> (champs réellement documentés par le fournisseur) :
 * {
 *   id: number,
 *   is_expired: boolean,
 *   competition_cluster: string,   // pays
 *   competition_name: string,      // ligue
 *   federation: string,
 *   season: string,
 *   start_date: string,            // ISO, heure Londres
 *   last_update_at: string,
 *   home_team: string,
 *   away_team: string,
 *   home_strength: number,
 *   away_strength: number,
 *   distance_between_teams: number,
 *   stadium_capacity: number,
 *   field_length: number,
 *   field_width: number,
 *   result: string | null,         // rempli seulement après le match
 *   available_markets: string[],   // marchés réellement disponibles pour CE match
 *   prediction_per_market: {
 *     classic: {
 *       odds: { "1": n|null, "X": n|null, "2": n|null, "1X": n|null, "X2": n|null, "12": n|null },
 *       probabilities: { "1": n, "X": n, "2": n, "1X": n, "X2": n, "12": n },
 *       status: "pending" | "won" | "lost" | "postponed",
 *       prediction: "1" | "X" | "2"
 *     },
 *     btts: { odds: {yes,no}, probabilities: {yes,no}, status, prediction: "yes"|"no" },
 *     over_25: { odds: {yes,no}, probabilities: {yes,no}, status, prediction: "yes"|"no" },
 *     over_35: { ... même forme ... },
 *     home_over_05 / home_over_15 / away_over_05 / away_over_15: { ... même forme ... }
 *   }
 * }
 *
 * ⚠️ IMPORTANT — CETTE API NE FOURNIT AUCUN MARCHÉ "SCORE EXACT".
 * Les marchés disponibles sont strictement limités à la liste ci-dessus
 * (confirmé par la documentation officielle du fournisseur et par
 * /api/v2/list-markets). Il n'existe donc structurellement aucune donnée
 * permettant de générer un score exact fiable à partir de cette API.
 * → predictionService.js retourne systématiquement le message
 *   "Aucun score exact exploitable" pour cette catégorie, conformément à
 *   la règle NE PAS INVENTER LES DONNÉES. Si un jour l'API évolue et
 *   expose un marché de score exact, il suffira d'ajouter son nom ici.
 *
 * Le champ "market" dans la query ne semble filtrer que les MATCHS renvoyés
 * (uniquement ceux où ce marché est disponible), pas la forme de la
 * réponse : prediction_per_market contient déjà tous les marchés
 * disponibles pour le match. On interroge donc l'API une seule fois par
 * fenêtre de matchs, puis on filtre/sélectionne côté serveur pour chaque
 * catégorie. Si un compte RapidAPI renvoie une forme différente, les
 * fonctions d'extraction de predictionService.js sont conçues pour
 * échouer proprement (retour "données insuffisantes") plutôt que d'inventer.
 * ────────────────────────────────────────────────────────────────────────
 */

const MARKETS = {
  CLASSIC: 'classic',
  BTTS: 'btts',
  OVER_25: 'over_25',
  OVER_35: 'over_35',
  HOME_OVER_05: 'home_over_05',
  HOME_OVER_15: 'home_over_15',
  AWAY_OVER_05: 'away_over_05',
  AWAY_OVER_15: 'away_over_15',
};

const client = axios.create({
  baseURL: config.rapidApiBaseUrl,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'x-rapidapi-host': config.rapidApiHost,
    'x-rapidapi-key': config.rapidApiKey,
  },
});

// Petit cache mémoire pour ménager le quota RapidAPI (les plans gratuits
// sont très limités en nombre d'appels par mois).
const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCacheKey(params) {
  return JSON.stringify(params || {});
}

function getFromCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Récupère la liste des prochains matchs avec leurs pronostics.
 * @param {Object} options
 * @param {string} [options.federation] - ex: "UEFA"
 * @param {string} [options.isoDate] - "YYYY-MM-DD"
 * @param {boolean} [options.useCache=true]
 * @returns {Promise<{success:boolean, data?:Array, errorType?:string, message?:string}>}
 */
async function getUpcomingPredictions({ federation, isoDate, useCache = true } = {}) {
  const params = {};
  if (federation) params.federation = federation;
  if (isoDate) params.iso_date = isoDate;

  const cacheKey = getCacheKey(params);
  if (useCache) {
    const cached = getFromCache(cacheKey);
    if (cached) return { success: true, data: cached, fromCache: true };
  }

  try {
    const response = await client.get('/predictions', { params });

    // Réponse vide ou JSON invalide / inattendu.
    if (!response || typeof response.data !== 'object' || response.data === null) {
      return {
        success: false,
        errorType: 'invalid_response',
        message: "Réponse invalide reçue de l'API de pronostics.",
      };
    }

    const matches = Array.isArray(response.data.data) ? response.data.data : null;

    if (!matches) {
      return {
        success: false,
        errorType: 'unexpected_format',
        message: "Le format de la réponse de l'API a changé ou est inattendu.",
      };
    }

    if (matches.length === 0) {
      return {
        success: false,
        errorType: 'empty',
        message: 'Aucun match disponible actuellement pour cette période.',
      };
    }

    setCache(cacheKey, matches);
    return { success: true, data: matches, fromCache: false };
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Récupère les pronostics pour un match précis (par ID de fixture).
 */
async function getPredictionById(matchId) {
  try {
    const response = await client.get(`/predictions/${matchId}`);
    const data = response.data && response.data.data ? response.data.data : response.data;

    if (!data) {
      return { success: false, errorType: 'empty', message: 'Aucune donnée pour ce match.' };
    }

    return { success: true, data };
  } catch (error) {
    return handleApiError(error);
  }
}

function handleApiError(error) {
  // Timeout réseau
  if (error.code === 'ECONNABORTED') {
    return {
      success: false,
      errorType: 'timeout',
      message: "Le service de pronostics met trop de temps à répondre. Réessayez dans un instant.",
    };
  }

  // Pas de réponse du tout (API indisponible / DNS / réseau)
  if (!error.response) {
    return {
      success: false,
      errorType: 'unavailable',
      message: 'Le service de pronostics est momentanément indisponible.',
    };
  }

  const status = error.response.status;

  if (status === 429) {
    return {
      success: false,
      errorType: 'rate_limited',
      message: 'Limite de requêtes RapidAPI atteinte. Réessayez plus tard.',
    };
  }

  if (status === 401 || status === 403) {
    // On ne journalise jamais la clé elle-même, uniquement le code d'erreur.
    console.error('❌ Authentification RapidAPI refusée (vérifier RAPIDAPI_KEY / abonnement).');
    return {
      success: false,
      errorType: 'auth_error',
      message: "Le service de pronostics n'est pas correctement configuré.",
    };
  }

  if (status === 404) {
    return {
      success: false,
      errorType: 'not_found',
      message: 'Aucune donnée disponible pour cette demande.',
    };
  }

  return {
    success: false,
    errorType: 'http_error',
    message: `Erreur inattendue du service de pronostics (code ${status}).`,
  };
}

module.exports = {
  MARKETS,
  getUpcomingPredictions,
  getPredictionById,
};
