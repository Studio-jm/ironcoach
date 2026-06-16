<?php
// Tick de cron : traite UNE séance prête → génère un brouillon d'article.
// À appeler via le webcron Infomaniak (toutes les ~15 min).
//   php generate.php
//
// Flux : récupère 1 séance "realise" (avec compte rendu) → Claude rédige
// un brouillon → écrit le brouillon dans la table partagée (statut=brouillon_genere).
// La relecture humaine se fait ensuite (cf. publish.php).

require __DIR__ . '/lib.php';

$cfg = load_config();

$seances = coach_get_seances($cfg, 'realise', 1);
$seance = $seances[0] ?? null;
if (!$seance) {
    log_line('Aucune séance prête à traiter. Fin.');
    exit(0);
}

$sessionId = $seance['sessionId'];
log_line("Séance à traiter : $sessionId (" . ($seance['sport'] ?? '?') . ', ' . ($seance['date'] ?? '?') . ')');

$article = claude_generate_article($cfg, $seance);
if (!$article) {
    log_line('Échec génération article. On réessaiera au prochain tick.');
    exit(1);
}

$ok = coach_patch_seance($cfg, $sessionId, [
    'brouillonArticle' => "# {$article['title']}\n\n{$article['content']}",
    'statut'           => 'brouillon_genere',
]);

if ($ok) {
    log_line("Brouillon généré et stocké : « {$article['title']} »");
    log_line('→ À relire avant publication (publish.php).');
} else {
    log_line('Brouillon généré mais échec de l\'écriture en base.');
    exit(1);
}
