# Pipeline blog — IronCoach

Scripts PHP qui transforment les séances réelles (lues depuis l'API du coach)
en articles de blog WordPress, avec relecture humaine obligatoire.

PHP natif uniquement (cURL) → compatible mutualisé Infomaniak. Aucune dépendance.

## Architecture

```
Coach (Next.js)                  Ce pipeline (PHP/cron Infomaniak)        WordPress
/api/blog/seances  ──GET──▶  generate.php → Claude → brouillon ──PATCH──▶  (en base)
                                                   │
                                          relecture humaine (statut=valide)
                                                   │
                   ◀─GET valide─  publish.php → WordPress REST ──────────▶  post (draft)
/api/blog/seances  ◀─PATCH publie─  (statut=publie + url)
```

Le pipeline ne lit/écrit QUE l'API du coach (jamais Strava/intervals directement).

## Installation sur Infomaniak

1. Déposer le dossier `blog-pipeline/` sur le serveur (FTP ou Git).
2. `cp config.example.php config.php` puis renseigner :
   - `coach_api_base` + `blog_api_token` (= `BLOG_API_TOKEN` de l'app coach)
   - `anthropic_key`
   - `wp_base`, `wp_user`, `wp_app_password` (Application Password WordPress)
   - `style_examples` : 2-3 articles passés pour caler ta voix (optionnel au début)
3. Tester à la main : `php generate.php` puis `php publish.php`.

## Webcron Infomaniak

- **generate.php** : toutes les ~15 min (1 séance par tick).
- **publish.php** : 1-2× par jour (publie ce que tu as validé).

## Relecture (E-E-A-T — obligatoire)

En attendant une UI dédiée dans l'app coach :

```bash
# 1. Lister les brouillons générés
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/blog/seances?statut=brouillon_genere&limit=10"

# 2. Valider (corriger le texte si besoin), prêt à publier
curl -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"sessionId":"...","articleFinal":"# Titre\n\nTexte corrigé...","statut":"valide"}' \
  "$BASE/api/blog/seances"
```

`publish.php` publie les `valide` vers WordPress en **draft** (dernier contrôle
dans WP avant mise en ligne), puis passe le statut à `publie`.

## Coûts (estimation brief)

- Claude (Sonnet) : ~2-4 $/mois pour ~30 articles. Active le Batch API + prompt
  caching des `style_examples` pour descendre sous 2 $.
- Infra : 0 € (serveur Infomaniak déjà payé).

## Statuts d'une séance

`planifie` → `realise` (coach) → `brouillon_genere` (generate.php) →
`valide` (humain) → `publie` (publish.php)
