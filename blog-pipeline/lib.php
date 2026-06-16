<?php
// Helpers partagés du pipeline blog. PHP natif (compatible mutualisé Infomaniak).

function load_config(): array {
    $path = __DIR__ . '/config.php';
    if (!file_exists($path)) {
        fwrite(STDERR, "config.php manquant. Copie config.example.php.\n");
        exit(1);
    }
    return require $path;
}

function log_line(string $msg): void {
    echo '[' . date('Y-m-d H:i:s') . "] $msg\n";
}

// ─── API du coach (table seances partagée) ───────────────────────────────────

function coach_get_seances(array $cfg, string $statut = 'realise', int $limit = 1): array {
    $base = rtrim($cfg['coach_api_base'], '/');
    $url = $base . '/api/blog/seances?statut=' . urlencode($statut) . '&limit=' . $limit;
    $res = http_request('GET', $url, [
        'Authorization: Bearer ' . $cfg['blog_api_token'],
    ]);
    if ($res['code'] !== 200) {
        log_line("GET seances → HTTP {$res['code']}");
        return [];
    }
    $data = json_decode($res['body'], true);
    return $data['seances'] ?? [];
}

function coach_patch_seance(array $cfg, string $sessionId, array $fields): bool {
    $url = rtrim($cfg['coach_api_base'], '/') . '/api/blog/seances';
    $payload = array_merge(['sessionId' => $sessionId], $fields);
    $res = http_request('PATCH', $url, [
        'Authorization: Bearer ' . $cfg['blog_api_token'],
        'Content-Type: application/json',
    ], json_encode($payload));
    if ($res['code'] !== 200) {
        log_line("PATCH seance → HTTP {$res['code']} : {$res['body']}");
        return false;
    }
    return true;
}

// ─── Claude (génération d'article) ───────────────────────────────────────────

function claude_generate_article(array $cfg, array $seance): ?array {
    $prompt = build_article_prompt($seance, $cfg['style_examples'] ?? []);

    $body = json_encode([
        'model'      => $cfg['anthropic_model'],
        'max_tokens' => 2000,
        'system'     => "Tu es l'auteur d'un blog qui documente une préparation Ironman encadrée par une IA. "
                      . "Tu écris à la première personne, ton vécu réel, sans jargon inutile. "
                      . "Tu t'appuies UNIQUEMENT sur les données fournies (pas d'invention). "
                      . "Style E-E-A-T : expérience de première main, honnête, concret.",
        'messages'   => [['role' => 'user', 'content' => $prompt]],
    ]);

    $res = http_request('POST', 'https://api.anthropic.com/v1/messages', [
        'x-api-key: ' . $cfg['anthropic_key'],
        'anthropic-version: 2023-06-01',
        'Content-Type: application/json',
    ], $body);

    if ($res['code'] !== 200) {
        log_line("Claude → HTTP {$res['code']} : {$res['body']}");
        return null;
    }
    $data = json_decode($res['body'], true);
    $text = $data['content'][0]['text'] ?? null;
    if (!$text) return null;

    // Sépare titre (1re ligne) et corps
    $lines = explode("\n", trim($text));
    $title = trim(ltrim(array_shift($lines), '# '));
    $content = trim(implode("\n", $lines));
    return ['title' => $title, 'content' => $content];
}

function build_article_prompt(array $s, array $styleExamples): string {
    $plan    = json_encode($s['planPrevu'] ?? [], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    $real    = json_encode($s['dataRealisee'] ?? [], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    $ctx     = json_encode($s['contexteNarratif'] ?? [], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    $debrief = $s['compteRenduCoach'] ?? '';
    $memo    = $s['memoTranscription'] ?? '';

    $sport = $s['sport'] ?? 'séance';
    $isRecup = ($s['type'] ?? '') === 'recup';

    $format = $isRecup
        ? "Format COURT (journal de récup, ~150 mots) : ressenti, pourquoi la récup compte, une phrase de contexte."
        : "Format COMPLET (~400-600 mots) : accroche, déroulé prévu vs réalisé, ressenti, lecture du coach IA, ce que ça apprend pour la suite.";

    $examples = '';
    if (!empty($styleExamples)) {
        $examples = "\n## Exemples de ma voix (à imiter, pas à copier)\n"
                  . implode("\n---\n", array_slice($styleExamples, 0, 3));
    }

    return <<<TXT
Rédige un article de blog à partir des données réelles de cette séance ($sport).

## Séance prévue
$plan

## Séance réalisée
$real

## Compte rendu du coach IA
$debrief

## Mon ressenti (mémo)
$memo

## Contexte de la prépa
$ctx

## Consignes
$format
- Première personne, vécu réel, honnête (y compris les jours moyens).
- Mets en avant l'angle "entraîné par une IA" quand c'est pertinent.
- N'invente aucune donnée : utilise uniquement ce qui est ci-dessus.
- Première ligne = titre accrocheur (sans #). Puis le corps de l'article.
$examples
TXT;
}

// ─── WordPress (publication via API REST) ────────────────────────────────────

function wp_create_post(array $cfg, string $title, string $content): ?array {
    $url = rtrim($cfg['wp_base'], '/') . '/wp-json/wp/v2/posts';
    $auth = base64_encode($cfg['wp_user'] . ':' . $cfg['wp_app_password']);
    $body = json_encode([
        'title'   => $title,
        'content' => $content,
        'status'  => $cfg['wp_status'] ?? 'draft',
    ]);
    $res = http_request('POST', $url, [
        'Authorization: Basic ' . $auth,
        'Content-Type: application/json',
    ], $body);
    if ($res['code'] !== 201) {
        log_line("WP create post → HTTP {$res['code']} : {$res['body']}");
        return null;
    }
    return json_decode($res['body'], true);
}

// ─── HTTP (cURL) ──────────────────────────────────────────────────────────────

function http_request(string $method, string $url, array $headers = [], ?string $body = null): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT        => 120,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    $resBody = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($resBody === false) {
        $err = curl_error($ch);
        curl_close($ch);
        return ['code' => 0, 'body' => $err];
    }
    curl_close($ch);
    return ['code' => $code, 'body' => $resBody];
}
