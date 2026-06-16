<?php
// Publie les séances VALIDÉES par un humain vers WordPress.
//   php publish.php
//
// Relecture humaine obligatoire (E-E-A-T) : seules les séances dont le statut
// a été passé à "valide" sont publiées. La publication crée un post WordPress
// (en "draft" par défaut = dernier filet de sécurité avant mise en ligne).
//
// Workflow de relecture (en attendant une UI dédiée) :
//   1. Lire les brouillons :  GET /api/blog/seances?statut=brouillon_genere
//   2. Corriger si besoin + valider : PATCH { sessionId, articleFinal, statut:"valide" }
//   3. Ce script publie les "valide" → WordPress, puis statut="publie".

require __DIR__ . '/lib.php';

$cfg = load_config();

$seances = coach_get_seances($cfg, 'valide', 5);
if (empty($seances)) {
    log_line('Aucune séance validée à publier. Fin.');
    exit(0);
}

log_line(count($seances) . ' séance(s) à publier.');

foreach ($seances as $s) {
    $sessionId = $s['sessionId'];
    // article_final si présent (corrigé par l'humain), sinon le brouillon
    $raw = $s['articleFinal'] ?? $s['brouillonArticle'] ?? '';
    if (trim($raw) === '') {
        log_line("[$sessionId] Pas de contenu, ignorée.");
        continue;
    }

    $lines = explode("\n", trim($raw));
    $title = trim(ltrim(array_shift($lines), '# '));
    $content = trim(implode("\n", $lines));

    $post = wp_create_post($cfg, $title, $content);
    if (!$post) {
        log_line("[$sessionId] Échec publication WordPress.");
        continue;
    }

    $url = $post['link'] ?? '';
    coach_patch_seance($cfg, $sessionId, [
        'statut'     => 'publie',
        'urlPubliee' => $url,
    ]);
    log_line("[$sessionId] Publié : « $title » → $url");
}

log_line('Terminé.');
