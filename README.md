# ⚽ Football Prediction Bot

Bot Telegram professionnel de pronostics football, entièrement en français, basé sur des données réelles fournies par l'API **Football Prediction** (RapidAPI). Système de générations gratuites, abonnements Premium avec paiement manuel (Orange Money, MTN Mobile Money, Moov Money, Wave), validation admin, et publication automatique quotidienne dans un groupe Telegram.

> ⚠️ Le bot n'invente **jamais** de statistiques. Si l'API ne fournit pas assez de données pour une catégorie donnée, un message clair l'indique — voir la section [Score Exact](#-note-importante-sur-la-catégorie-score-exact) ci-dessous.

---

## 1. Présentation

| Catégorie | Description |
|---|---|
| ⚽ 1X2 | Victoire domicile / Nul / Victoire extérieur |
| ⚽ TOTAL DE BUT | Over/Under sur le total de buts (2.5, 3.5) |
| 🎯 BTTS | Les deux équipes marquent (Oui/Non) |
| 📊 OVER/UNDER | Meilleur pronostic Over/Under disponible |
| 🛡 DOUBLE CHANCE | 1X / X2 / 12 |
| 🔢 SCORE EXACT | Réservé Premium + Score Exact |

Chaque nouvel utilisateur dispose de **2 pronostics gratuits**. Au-delà, il doit souscrire à une formule Premium. L'administrateur (identifié par son ID Telegram) a un accès illimité à toutes les fonctionnalités, sans paiement.

---

## 2. Installation

```bash
git clone <votre-repo>
cd football-prediction-bot
npm install
cp .env.example .env
```

---

## 3. Création du bot Telegram

1. Ouvrez une conversation avec [@BotFather](https://t.me/BotFather) sur Telegram.
2. Envoyez `/newbot` et suivez les instructions (nom, username se terminant par `bot`).
3. Copiez le token fourni dans `BOT_TOKEN` de votre fichier `.env`.

---

## 4. Configuration du fichier `.env`

Dupliquez `.env.example` en `.env` et remplissez chaque variable. **Ne committez jamais ce fichier** (`.env` est déjà dans `.gitignore`).

---

## 5. Configuration RapidAPI

1. Créez un compte sur [RapidAPI](https://rapidapi.com/) et abonnez-vous à l'API **Football Prediction** (Boggio Analytics) : https://rapidapi.com/boggio-analytics/api/football-prediction
2. Copiez votre clé RapidAPI dans `RAPIDAPI_KEY`.
3. `RAPIDAPI_HOST` reste `football-prediction-api.p.rapidapi.com`.

**Marchés réellement fournis par cette API** : `classic` (1X2, dont Double Chance), `btts`, `over_25`, `over_35`, `home_over_05`, `home_over_15`, `away_over_05`, `away_over_15`. Le plan gratuit ("Basic") limite les prédictions à 12h à l'avance et ~100 appels/mois — le bot met donc les résultats en cache 10 minutes pour économiser votre quota. Passez à un plan payant (PRO/ULTRA/MEGA) pour des prédictions jusqu'à 48h à l'avance et davantage d'appels.

### 🔴 Note importante sur la catégorie Score Exact

Cette API **ne propose aucun marché "score exact"** — ce n'est pas une limitation du bot mais une caractéristique de l'API elle-même (confirmé par la documentation officielle du fournisseur). Conformément à la règle « ne jamais inventer de données », la catégorie 🔢 SCORE EXACT affichera donc systématiquement :

> ❌ Aucun score exact exploitable n'est disponible pour ce match avec les données actuelles de l'API.

Si vous changez de fournisseur de données pour un qui expose un vrai marché de score exact, il suffit d'adapter `src/services/footballApi.js` (constante `MARKETS`) et `extractExactScore()` dans `src/services/predictionService.js`.

---

## 6. Configuration de l'ID administrateur

1. Envoyez un message à [@userinfobot](https://t.me/userinfobot) sur Telegram pour obtenir votre ID numérique.
2. Renseignez-le dans `ADMIN_TELEGRAM_ID`.

L'administrateur bénéficie automatiquement de générations illimitées, de toutes les catégories (Score Exact inclus) et des commandes `/admin`, `/stats`, `/users`, `/payments`, `/predictions`, `/broadcast`.

---

## 7. Configuration de l'ID du groupe (publication automatique)

1. Ajoutez votre bot dans le groupe Telegram cible, en tant qu'administrateur (pour qu'il puisse y publier).
2. Récupérez l'ID du groupe (par exemple via [@userinfobot](https://t.me/userinfobot) ajouté temporairement au groupe, ou via les logs du bot).
3. Renseignez-le dans `ADMIN_GROUP_ID`.

Les publications automatiques toutes les 24h sont envoyées **exclusivement** vers cet identifiant — jamais ailleurs.

---

## 8. Configuration des moyens de paiement

Renseignez vos numéros réels dans `.env` :

```
ORANGE_MONEY_NUMBER=07XXXXXXXX
MTN_MOMO_NUMBER=05XXXXXXXX
MOOV_MONEY_NUMBER=01XXXXXXXX
WAVE_NUMBER=07XXXXXXXX
```

---

## 9. Lancement local

```bash
npm start
```

Le serveur Express démarre sur `PORT` (3000 par défaut) et le bot se lance en mode polling. Testez `http://localhost:3000/health`.

---

## 10. Déploiement GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <url-de-votre-repo>
git push -u origin main
```

Le fichier `.gitignore` exclut déjà `.env`, `node_modules/` et les fichiers `*.db` / `*.sqlite`.

---

## 11. Déploiement Render

1. Créez un nouveau **Web Service** sur [Render](https://render.com), connecté à votre dépôt GitHub — ou utilisez directement le fichier `render.yaml` fourni (Render détecte automatiquement les *Blueprints*).
2. Dans l'onglet **Environment**, renseignez manuellement les secrets marqués `sync: false` dans `render.yaml` : `BOT_TOKEN`, `ADMIN_TELEGRAM_ID`, `ADMIN_GROUP_ID`, `RAPIDAPI_KEY`, et les 4 numéros de paiement.
3. Le `render.yaml` provisionne un **disque persistant** (`/data`, 1 Go) pour que la base SQLite survive aux redéploiements. Sans disque persistant, la base serait réinitialisée à chaque déploiement.
4. Build command : `npm install` · Start command : `npm start` (déjà configurés).

---

## 12. Fonctionnement du Premium

| Formule | Durée | Prix | Score Exact |
|---|---|---|---|
| 🟢 Standard | 7 jours | 1 500 FCFA | ❌ |
| 🟢 Standard | 30 jours | 4 000 FCFA | ❌ |
| 🟢 Standard | 90 jours | 9 000 FCFA | ❌ |
| 👑 Premium + Score Exact | 30 jours | 6 000 FCFA | ✅ |
| 👑 Premium + Score Exact | 90 jours | 13 000 FCFA | ✅ |
| 👑 Premium + Score Exact | 1 an | 30 000 FCFA | ✅ |

Un renouvellement pendant que le Premium est encore actif **prolonge** la date d'expiration existante au lieu de la remplacer.

---

## 13. Système de validation des paiements

1. L'utilisateur choisit 💎 PREMIUM → une formule → un moyen de paiement.
2. Le bot affiche le numéro correspondant et le montant.
3. Après paiement, l'utilisateur clique **✅ J'AI PAYÉ** puis envoie une photo de la preuve.
4. Le bot crée un enregistrement `pending` dans la table `payments` et notifie l'administrateur (`ADMIN_TELEGRAM_ID`) avec la photo et les boutons **✅ APPROUVER** / **❌ REFUSER**.
5. En cas d'approbation : le Premium est activé (date d'expiration calculée, Score Exact activé si la formule le permet), l'utilisateur est notifié.
6. En cas de refus : l'utilisateur est notifié, aucun accès n'est accordé.

---

## 14. Automatisation quotidienne

Un job `node-cron` (`src/jobs/dailyPredictions.js`) s'exécute selon `DAILY_CRON_SCHEDULE` (par défaut `0 8 * * *`, soit 8h00 chaque jour, heure du serveur). Il sélectionne les `DAILY_PREDICTIONS_COUNT` meilleurs pronostics 1X2 du moment et les publie dans `ADMIN_GROUP_ID` uniquement, avec vérification explicite de l'identifiant du chat avant l'envoi.

---

## Structure du projet

```
football-prediction-bot/
├── src/
│   ├── bot.js                  # Enregistrement de tous les handlers Telegraf
│   ├── server.js               # Point d'entrée : serveur Express + lancement du bot
│   ├── config/config.js        # Variables d'environnement, plans Premium, moyens de paiement
│   ├── database/               # Connexion SQLite (better-sqlite3) + migrations
│   ├── services/
│   │   ├── footballApi.js      # Appel RapidAPI, cache, gestion d'erreurs
│   │   ├── predictionService.js# Extraction/sélection/formatage des pronostics par catégorie
│   │   ├── userService.js      # Utilisateurs, accès, compteurs, Premium
│   │   └── paymentService.js   # Paiements manuels (création, approbation, refus)
│   ├── handlers/                # start, predictions, premium, account, admin
│   ├── keyboards/mainKeyboard.js
│   ├── state/paymentSessions.js # État mémoire du parcours de paiement en cours
│   └── jobs/dailyPredictions.js
├── .env.example
├── .gitignore
├── package.json
├── render.yaml
└── README.md
```

## Sécurité

- `BOT_TOKEN` et `RAPIDAPI_KEY` ne sont jamais exposés dans les logs ni dans le code.
- Toute action administrateur vérifie le `telegram_id` réel de l'expéditeur (jamais le `username`, falsifiable).
- Les callbacks Telegram (`admin:approve:*`, `admin:reject:*`) revérifient systématiquement les droits admin côté serveur avant d'agir.
