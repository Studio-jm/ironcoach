<?php
// Copie ce fichier en config.php et renseigne tes valeurs.
// config.php ne doit JAMAIS être commité (cf. .gitignore).

return [
    // API du coach IronCoach (l'app Next.js déployée)
    'coach_api_base'  => 'https://ton-app.vercel.app',
    'blog_api_token'  => 'le_meme_que_BLOG_API_TOKEN_dans_le_coach',

    // Anthropic (Claude) — articles en Sonnet (qualité/prix)
    'anthropic_key'   => 'sk-ant-...',
    'anthropic_model' => 'claude-sonnet-4-6',

    // WordPress (API REST). Crée un "Application Password" dans ton profil WP.
    'wp_base'         => 'https://ton-blog.ch',
    'wp_user'         => 'ton_user_wp',
    'wp_app_password' => 'xxxx xxxx xxxx xxxx xxxx xxxx',
    'wp_status'       => 'draft', // 'draft' = relecture dans WP avant publication

    // Exemples de style (2-3 articles passés) pour caler la voix de l'auteur.
    // Mets le texte brut de tes articins ici, ou laisse vide au début.
    'style_examples'  => [
        // "Texte d'un article précédent...",
    ],
];
