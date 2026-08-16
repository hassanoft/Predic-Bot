# Guide — data/stats.json

Ce fichier remplace toute API externe. Vous le mettez à jour vous-même,
manuellement, à la fréquence que vous voulez (idéalement 1 à 2 fois par
semaine, ou après chaque journée de championnat).

Le bot le relit à chaque demande de pronostic — **pas besoin de redémarrer**,
juste de sauvegarder le fichier (et de faire `git push` si Render est
configuré pour redéployer depuis votre dépôt).

---

## Structure

```json
{
  "updated_at": "2026-08-16",
  "competitions": {
    "NOM DE LA COMPÉTITION": {
      "teams": {
        "NOM EXACT DE L'ÉQUIPE": {
          "home": { "played": 2, "goals_for": 6, "goals_against": 1 },
          "away": { "played": 1, "goals_for": 3, "goals_against": 0 }
        }
      },
      "matches": [
        { "home_team": "NOM ÉQUIPE A", "away_team": "NOM ÉQUIPE B", "date": "2026-08-23T18:00:00Z" }
      ]
    }
  }
}
```

## Règles importantes

1. **Le nom d'équipe doit être identique** entre la section `teams` et la
   section `matches` (mêmes majuscules/accents). C'est ce nom qui sert de
   clé pour relier les deux — pas d'ID à inventer.

2. **`played` / `goals_for` / `goals_against` sont séparés domicile/extérieur.**
   Ce sont les statistiques RÉELLES de la saison en cours (ou de la saison
   précédente si la saison vient de commencer et que vous manquez de recul —
   c'est vous qui choisissez la source, le bot fait confiance à ce que vous
   entrez).

3. **Minimum 3 matchs joués (`played`) à domicile ET à l'extérieur** pour
   qu'une équipe soit exploitable par le modèle statistique. En dessous,
   le bot affichera "données insuffisantes" pour tout match impliquant
   cette équipe — c'est volontaire (pas de pronostic fiable sur un trop
   petit échantillon).

4. **`date` est au format ISO 8601, en UTC** (`YYYY-MM-DDTHH:MM:SSZ`).
   Les matchs déjà passés sont automatiquement ignorés — vous pouvez les
   laisser dans le fichier, pas besoin de les supprimer à la main.

5. **Plusieurs compétitions** : ajoutez simplement une nouvelle clé sous
   `competitions` (ex. `"Premier League"`, `"UEFA Champions League"`...).

## Où trouver les vrais chiffres

Sofascore.com, Flashscore.fr ou le site officiel de la compétition
affichent tous un classement "Domicile / Extérieur" avec buts marqués et
encaissés — il suffit de les recopier à la main dans ce fichier, sans
scripter d'accès automatisé.

## Erreurs courantes

- JSON invalide (virgule oubliée/en trop) → le bot répond "fichier mal
  formé", rien ne plante. Utilisez un validateur JSON en ligne avant de
  sauvegarder si vous n'êtes pas sûr.
- Nom d'équipe différent entre `teams` et `matches` → ce match précis sera
  ignoré silencieusement (traité comme "données insuffisantes").
