<?php
declare(strict_types=1);
/**
 * 📜 Transcription d'actes, la suite (assets/js/heritage-transcribe-acte.js, maquette docs/design/transcription-actes.html) :
 *  1. 🔍 la lecture approfondie, facultative : un modèle « vision » ouvert (Qwen3-VL, Apache 2.0) servi par Ollama SUR CET
 *     ORDINATEUR — l'app ne parle qu'à 127.0.0.1 (ou localhost / ::1) ; tout autre hôte est refusé. Rien ne part sur Internet,
 *     sauf le téléchargement du modèle, fait par Ollama lui-même (/api/pull) quand on le demande.
 *  2. « Ce que l'app a trouvé » → la généalogie : les fiches proposées (relier, comparer, créer), puis tout entre d'un coup
 *     (fiches, liens familiaux, événements, source et citations), dans la transaction d'écriture d'api.php, avec un reçu
 *     pour « ↶ Annuler » qui défait tout (lib/imports.php : import_receipt_*, import_undo).
 */

/* ═════════ 1. Lecture approfondie (Ollama, sur cet ordinateur seulement) ═════════ */
require_once __DIR__ . '/ia_serveur.php'; // 🖥 le serveur d'IA choisi (Ollama, Unsloth ou compatible OpenAI) : lib/ia_serveur.php

const TX_DEEP_DEFAULT_URL = 'http://127.0.0.1:11434';
/** Les modèles proposés : licence vraiment ouverte (Apache 2.0), tag Ollama exact, poids approximatif du téléchargement. */
// les versions « instruct » : elles écrivent la transcription tout de suite (les autres « réfléchissent » d'abord et la réponse restait vide)
// tried : essayé sur des actes par l'app (les autres sont « à l'essai » : à comparer sur tes actes avant de t'y fier) ;
// pros / cons : ses avantages et inconvénients, montrés à côté du choix ; ram_gb : la mémoire conseillée.
const TX_DEEP_MODELS = [
    ['tag' => 'qwen3-vl:8b-instruct', 'label' => 'Qwen3-VL 8B', 'size_gb' => 6.1, 'ram_gb' => 16, 'license' => 'Apache 2.0', 'recommended' => true, 'tried' => true,
        'pros' => 'le meilleur essayé sur les actes anciens, bon en français et en latin', 'cons' => '16 Go de mémoire conseillés'],
    ['tag' => 'qwen3-vl:4b-instruct', 'label' => 'Qwen3-VL 4B', 'size_gb' => 3.3, 'ram_gb' => 8, 'license' => 'Apache 2.0', 'recommended' => false, 'tried' => true,
        'pros' => 'léger et rapide, pour un ordinateur modeste', 'cons' => 'se trompe plus souvent sur les noms et les écritures difficiles'],
    ['tag' => 'qwen3-vl:32b-instruct', 'label' => 'Qwen3-VL 32B', 'size_gb' => 21, 'ram_gb' => 64, 'license' => 'Apache 2.0', 'recommended' => false, 'tried' => false,
        'pros' => 'pour les ordinateurs puissants (64 Go) : la même famille que le conseillé, plus précise sur les écritures difficiles', 'cons' => 'lent, gros téléchargement'],
    ['tag' => 'qwen2.5vl:72b', 'label' => 'Qwen2.5-VL 72B', 'size_gb' => 49, 'ram_gb' => 64, 'license' => 'Qwen (libre d’usage)', 'recommended' => false, 'tried' => false,
        'pros' => 'le plus gros qui tienne dans 64 Go', 'cons' => 'très lent, très gros téléchargement, licence moins ouverte'],
    ['tag' => 'mistral-small3.2:24b', 'label' => 'Mistral Small 3.2 (24B)', 'size_gb' => 15, 'ram_gb' => 32, 'license' => 'Apache 2.0', 'recommended' => false, 'tried' => false,
        'pros' => 'fort en français, bon pour comprendre l’acte', 'cons' => '32 Go de mémoire conseillés, plus lent'],
    ['tag' => 'gemma3:12b', 'label' => 'Gemma 3 12B (Google)', 'size_gb' => 8.1, 'ram_gb' => 16, 'license' => 'Gemma (Google)', 'recommended' => false, 'tried' => false,
        'pros' => 'bon dans les langues européennes', 'cons' => 'licence de Google moins ouverte, moins précis sur l’écriture à la main'],
    ['tag' => 'gemma3:4b', 'label' => 'Gemma 3 4B (Google)', 'size_gb' => 3.3, 'ram_gb' => 8, 'license' => 'Gemma (Google)', 'recommended' => false, 'tried' => false,
        'pros' => 'léger, plusieurs langues', 'cons' => 'licence de Google, se trompe souvent sur les noms'],
    ['tag' => 'minicpm-v:8b', 'label' => 'MiniCPM-V 8B', 'size_gb' => 5.5, 'ram_gb' => 16, 'license' => 'MiniCPM (libre d’usage)', 'recommended' => false, 'tried' => false,
        'pros' => 'annoncé bon en écriture manuscrite', 'cons' => 'moins connu, résultats à comparer'],
    ['tag' => 'granite3.2-vision:2b', 'label' => 'Granite 3.2 Vision 2B (IBM)', 'size_gb' => 2.4, 'ram_gb' => 8, 'license' => 'Apache 2.0', 'recommended' => false, 'tried' => false,
        'pros' => 'très léger, fait pour les documents, ordinateurs modestes', 'cons' => 'faible sur l’écriture à la main ancienne'],
];
const TX_DEEP_LANGS = ['fra' => 'français', 'lat' => 'latin', 'fra+lat' => 'français et latin', 'eng' => 'anglais', 'deu' => 'allemand', 'ita' => 'italien', 'spa' => 'espagnol', 'pol' => 'polonais', 'nld' => 'néerlandais', 'grc' => 'grec ancien', 'ell' => 'grec moderne'];

/** Vrai seulement pour http://127.0.0.1, http://localhost ou http://[::1] (un port au choix), sans nom ni mot de passe, sans chemin. */
function tx_deep_url_ok(string $url): bool
{
    if ($url === '' || preg_match('/[\s\\\\@]/', $url)) { return false; }
    $p = parse_url($url);
    if (!is_array($p) || strtolower((string) ($p['scheme'] ?? '')) !== 'http' || isset($p['user']) || isset($p['pass']) || isset($p['query']) || isset($p['fragment'])) { return false; }
    if (isset($p['path']) && !in_array($p['path'], ['', '/'], true)) { return false; }
    $host = strtolower((string) ($p['host'] ?? ''));
    if (!in_array($host, ['127.0.0.1', 'localhost', '[::1]', '::1'], true)) { return false; }
    $port = (int) ($p['port'] ?? 80);
    return $port > 0 && $port < 65536;
}

/** L'adresse d'Ollama (variable LCNDA_OLLAMA_URL pour un autre port), toujours ramenée à une adresse IP de l'ordinateur. */
function tx_deep_base(?string $url = null): string
{
    $url = $url ?? ia_srv_url(); // sans réglage : LCNDA_OLLAMA_URL ou TX_DEEP_DEFAULT_URL, comme avant
    if (!tx_deep_url_ok($url)) { throw new LcndaBadInput('La lecture approfondie ne parle qu’à Ollama sur cet ordinateur (127.0.0.1) : adresse refusée.'); }
    $p = parse_url($url);
    $host = strtolower((string) $p['host']);
    $ip = in_array($host, ['[::1]', '::1'], true) ? '[::1]' : '127.0.0.1'; // « localhost » n'est pas résolu : jamais d'autre machine
    return 'http://' . $ip . ':' . (int) ($p['port'] ?? 80);
}

function tx_deep_model(string $tag): array
{
    foreach (TX_DEEP_MODELS as $m) { if ($m['tag'] === $tag) { return $m; } }
    throw new LcndaBadInput('Modèle de lecture approfondie inconnu.');
}

/**
 * Une demande à Ollama (JSON) ; $onLine reçoit chaque ligne d'une réponse en flux (NDJSON) et peut renvoyer false pour arrêter.
 * Pas de proxy, pas de redirection suivie, rien d'autre que l'adresse vérifiée.
 */
function tx_deep_http(string $method, string $path, ?array $body = null, int $timeout = 5, ?callable $onLine = null, ?string $base = null): array
{
    if (ia_srv_is_openai()) { return ia_srv_http($method, $path, $body, $timeout, $onLine, $base); } // Unsloth, LM Studio… : traduit vers /v1 (lib/ia_serveur.php)
    if (!function_exists('curl_init')) { throw new RuntimeException('La lecture approfondie a besoin de l’extension cURL de PHP.'); }
    $url = tx_deep_base($base) . $path;
    $ch = curl_init($url);
    $buf = ''; $raw = '';
    $opts = [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROXY => '', CURLOPT_NOPROXY => '*', CURLOPT_CONNECTTIMEOUT => 3, CURLOPT_TIMEOUT => $timeout,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP, CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json']];
    if ($body !== null) { $opts[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }
    $opts[CURLOPT_WRITEFUNCTION] = static function ($c, string $chunk) use (&$buf, &$raw, $onLine): int {
        if (!$onLine) { $raw .= $chunk; return strlen($chunk); }
        $buf .= $chunk;
        while (($nl = strpos($buf, "\n")) !== false) {
            $line = trim(substr($buf, 0, $nl)); $buf = substr($buf, $nl + 1);
            if ($line === '') { continue; }
            $j = json_decode($line, true);
            if (is_array($j) && $onLine($j) === false) { return 0; } // arrêté
        }
        return strlen($chunk);
    };
    curl_setopt_array($ch, $opts);
    $ok = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_errno($ch);
    curl_close($ch);
    if ($onLine && trim($buf) !== '') { $j = json_decode(trim($buf), true); if (is_array($j)) { $onLine($j); } }
    if ($ok === false && $err !== CURLE_WRITE_ERROR) { return ['ok' => false, 'code' => $code, 'error' => 'unreachable']; }
    $json = $onLine ? [] : (json_decode($raw, true) ?: []);
    return ['ok' => $code >= 200 && $code < 300, 'code' => $code, 'json' => is_array($json) ? $json : [], 'stopped' => $err === CURLE_WRITE_ERROR];
}

/** Ollama est-il là ? (programme trouvé, service qui répond, modèles déjà téléchargés) */
/** La mémoire de l'ordinateur en Go (0 si on ne sait pas) : pour conseiller le modèle qui lui convient. */
function tx_deep_ram_gb(): int
{
    $b = 0;
    if (@is_readable('/proc/meminfo') && preg_match('/MemTotal:\s+(\d+)\s*kB/', (string) @file_get_contents('/proc/meminfo'), $m)) { $b = (int) $m[1] * 1024; }
    elseif (PHP_OS_FAMILY === 'Darwin' && function_exists('shell_exec')) { $b = (int) trim((string) @shell_exec('/usr/sbin/sysctl -n hw.memsize 2>/dev/null')); }
    elseif (PHP_OS_FAMILY === 'Windows' && function_exists('shell_exec')) { $o = (string) @shell_exec('powershell -NoProfile -Command "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory" 2>NUL'); $b = (int) preg_replace('/\D/', '', $o); }
    $env = (int) getenv('LCNDA_RAM_GB'); if ($env > 0) { return $env; } // pour les essais
    return $b > 0 ? (int) round($b / 1073741824) : 0;
}

/** Un nom de modèle d'Ollama sûr (lettres, chiffres, « . : / - _ ») */
function tx_deep_tag_ok(string $tag): bool { return (bool) preg_match('/^[a-z0-9][a-z0-9._\/:-]{0,79}$/i', $tag); }

function tx_deep_status(): array
{
    $bin = '';
    foreach (['/usr/local/bin/ollama', '/usr/bin/ollama', '/opt/homebrew/bin/ollama', '/Applications/Ollama.app/Contents/Resources/ollama', (getenv('LOCALAPPDATA') ?: '') . '\\Programs\\Ollama\\ollama.exe'] as $p) { if ($p !== '' && @is_file($p)) { $bin = $p; break; } }
    $out = ['installed' => $bin !== '', 'running' => false, 'version' => '', 'local_only' => true, 'models' => [], 'download_url' => 'https://ollama.com/download'];
    try { $base = tx_deep_base(); } catch (Throwable) { $out['local_only'] = false; $base = null; }
    if ($base !== null) {
        $v = tx_deep_http('GET', '/api/version', null, 3);
        if ($v['ok']) {
            $out['running'] = true; $out['installed'] = true; $out['version'] = mb_substr((string) ($v['json']['version'] ?? ''), 0, 40);
            $tags = tx_deep_http('GET', '/api/tags', null, 5);
            $have = [];
            foreach ((array) ($tags['json']['models'] ?? []) as $m) { if (is_array($m)) { $have[(string) ($m['name'] ?? $m['model'] ?? '')] = true; } }
            foreach (TX_DEEP_MODELS as $m) { $out['models'][] = $m + ['present' => isset($have[$m['tag']]) || isset($have[$m['tag'] . ':latest'])]; }
            // « Autre modèle (Ollama) » (avancé) : les modèles déjà installés hors de la liste, et s'ils savent lire une image
            $known = array_column(TX_DEEP_MODELS, 'tag'); $n = 0;
            foreach (array_keys($have) as $name) {
                if ($name === '' || in_array($name, $known, true) || in_array(preg_replace('/:latest$/', '', $name), $known, true) || !tx_deep_tag_ok($name) || ++$n > 20) { continue; }
                $sh = tx_deep_http('POST', '/api/show', ['model' => $name], 4);
                $caps = $sh['ok'] ? array_map('strval', (array) ($sh['json']['capabilities'] ?? [])) : [];
                $out['others'][] = ['tag' => $name, 'label' => $name, 'vision' => in_array('vision', $caps, true), 'present' => true];
            }
        }
    }
    if (!$out['models']) { foreach (TX_DEEP_MODELS as $m) { $out['models'][] = $m + ['present' => false]; } }
    // le modèle conseillé pour CET ordinateur : le plus grand des modèles essayés qui tient dans sa mémoire
    $ram = tx_deep_ram_gb(); $out['ram_gb'] = $ram; $out['others'] = $out['others'] ?? [];
    if ($ram > 0) {
        $best = ''; foreach ($out['models'] as $m) { if ($m['tried'] && $m['ram_gb'] <= $ram && ($best === '' || $m['ram_gb'] > (tx_deep_model($best)['ram_gb']))) { $best = $m['tag']; } }
        if ($best === '') { $best = 'qwen3-vl:4b-instruct'; }
        foreach ($out['models'] as &$m) { $m['recommended'] = $m['tag'] === $best; $m['fits'] = $m['ram_gb'] <= $ram; } unset($m);
    } else { foreach ($out['models'] as &$m) { $m['fits'] = true; } unset($m); }
    return $out;
}

function tx_deep_jobs_dir(): string
{
    $d = DATA_DIR . '/cache/tx-deep-jobs';
    if (!is_dir($d)) { @mkdir($d, 0700, true); }
    return $d;
}

function tx_deep_job_dir(string $id): string
{
    if (!preg_match('/^[a-f0-9]{24}$/', $id)) { throw new LcndaBadInput('Lecture inconnue.'); }
    $d = tx_deep_jobs_dir() . '/' . $id;
    if (!is_dir($d) || is_link($d)) { throw new LcndaBadInput('Lecture inconnue (ou trop ancienne).'); }
    return $d;
}

/** La consigne donnée au modèle : une transcription diplomatique, ligne par ligne, sans rien inventer. */
function tx_deep_prompt(string $lang, array $ctx = []): string
{
    $l = TX_DEEP_LANGS[$lang] ?? 'français';
    return tx_deep_base_prompt($l) . tx_deep_context_text($ctx);
}

/**
 * 🧠 « Aider l'IA » (maquette docs/design/transcription-versions-contexte.html, 3) : ce que l'on sait déjà du document, ajouté à la consigne.
 * ctx = {doc, about, hints: [« mariage connu : … »]} — du texte court, nettoyé ; jamais une consigne de plus : la règle finale dit de ne rien
 * inventer, et un mot lu grâce à un indice reste marqué douteux [?]. Le navigateur montre ce texte tel quel (« Voir ce qui est envoyé »).
 */
function tx_deep_context_clean($ctx): array
{
    $ctx = is_array($ctx) ? $ctx : [];
    $line = static fn($v, int $n) => mb_substr(trim(preg_replace('/\s+/u', ' ', str_replace("\0", '', is_scalar($v) ? (string) $v : '')) ?? ''), 0, $n);
    $hints = [];
    foreach (array_slice(is_array($ctx['hints'] ?? null) ? array_values($ctx['hints']) : [], 0, 20) as $h) { $h = $line($h, 240); if ($h !== '') { $hints[] = $h; } }
    return ['doc' => $line($ctx['doc'] ?? '', 240), 'about' => $line($ctx['about'] ?? '', 600), 'hints' => $hints];
}

function tx_deep_context_text($ctx): string
{
    $c = tx_deep_context_clean($ctx);
    if ($c['doc'] === '' && $c['about'] === '' && !$c['hints']) { return ''; }
    $t = "\n\nCe que l'on sait déjà de ce document (pour t'aider à lire un mot peu lisible, jamais pour compléter) :";
    if ($c['doc'] !== '') { $t .= "\nDocument : " . rtrim($c['doc'], '.') . '.'; }
    if ($c['about'] !== '') { $t .= "\nDe quoi il parle : " . rtrim($c['about'], '.') . '.'; }
    if ($c['hints']) { $t .= "\nIndices (à n'utiliser que pour lire un mot peu lisible) :\n- " . implode("\n- ", $c['hints']); }
    return $t . "\nRègle : recopie seulement ce qui est écrit sur l'image. N'ajoute jamais un nom, une date, un lieu ou une phrase qui n'y est pas. "
        . "Si un mot n'est pas sûr, marque-le [?] même s'il ressemble à un indice : un mot lu grâce à un indice reste douteux.";
}

function tx_deep_base_prompt(string $l): string
{
    return "Tu es paléographe. Transcris fidèlement, en transcription diplomatique, le texte manuscrit de cette image d'un registre ancien (langue : $l).\n"
        . "- Recopie ligne par ligne : une ligne de l'image = une ligne de ta réponse, dans le même ordre.\n"
        . "- Garde l'orthographe, les abréviations, les majuscules et la ponctuation d'origine ; ne modernise pas, ne traduis pas.\n"
        . "- N'invente rien et ne complète rien. Écris [illisible] pour un mot que tu ne peux pas lire, et [?] juste après un mot douteux.\n"
        . "- Ne commente pas : réponds seulement par la transcription.";
}

function tx_deep_new_job(array $job): array
{
    $running = 0;
    foreach (glob(tx_deep_jobs_dir() . '/*', GLOB_ONLYDIR) ?: [] as $d) {
        if (is_link($d) || !preg_match('/^[a-f0-9]{24}$/', basename($d))) { continue; }
        if (time() - (int) @filemtime($d . '/job.json') > 6 * 3600) { foreach (glob($d . '/*') ?: [] as $f) { @unlink($f); } @rmdir($d); continue; }
        $r = json_decode((string) @file_get_contents($d . '/result.json'), true) ?: [];
        if (($r['state'] ?? '') === 'running' && time() - (int) ($r['updated'] ?? 0) < 900) { $running++; }
    }
    if ($running >= 2) { throw new LcndaBadInput('Deux lectures sont déjà en cours : attends qu’une se termine.'); }
    $id = bin2hex(random_bytes(12)); $dir = tx_deep_jobs_dir() . '/' . $id;
    if (!@mkdir($dir, 0700)) { throw new RuntimeException('Écriture impossible dans le dossier des données.'); }
    return [$id, $dir];
}

/** ⤓ Télécharger un modèle (par Ollama, /api/pull), en arrière-plan ; la progression est lue par tx_deep_job. */
function tx_deep_pull_start(array $data): array
{
    $m = tx_deep_model(safe_text($data['model'] ?? ''));
    $st = tx_deep_status();
    if (!$st['running']) { throw new LcndaBadInput('Ollama ne répond pas sur cet ordinateur : installe-le (ollama.com), lance-le, puis réessaie.'); }
    [$id, $dir] = tx_deep_new_job([]);
    file_put_contents($dir . '/job.json', json_encode(['kind' => 'pull', 'model' => $m['tag'], 'base' => tx_deep_base(), 'created' => time()]));
    file_put_contents($dir . '/result.json', json_encode(['state' => 'running', 'updated' => time(), 'completed' => 0, 'total' => 0, 'status' => '']));
    htr_spawn_php([APP_ROOT . '/scripts/tx_deep_job.php', $dir, APP_ROOT], $dir . '/run.log');
    return ['id' => $id, 'model' => $m['tag']];
}

/** 🔍 Lire une image (la zone recadrée, envoyée par le navigateur) avec le modèle vision, en arrière-plan. */
function tx_deep_read_start(array $data): array
{
    $want = safe_text($data['model'] ?? '');
    $lang = (string) ($data['language'] ?? 'fra'); if (!isset(TX_DEEP_LANGS[$lang])) { $lang = 'fra'; }
    $b64 = $data['image_b64'] ?? '';
    if (!is_string($b64) || $b64 === '') { throw new LcndaBadInput('Image manquante.'); }
    if (strlen($b64) > 30 * 1024 * 1024) { throw new LcndaBadInput('Image trop lourde.'); }
    $bin = base64_decode($b64, true);
    $info = $bin !== false ? @getimagesizefromstring($bin) : false;
    if (!$info || !in_array($info[2] ?? 0, [IMAGETYPE_JPEG, IMAGETYPE_PNG], true)) { throw new LcndaBadInput('Image illisible.'); }
    if ((int) $info[0] < 8 || (int) $info[1] < 8 || (int) $info[0] > 8000 || (int) $info[1] > 8000) { throw new LcndaBadInput('Image trop grande.'); }
    $st = tx_deep_status();
    if (!$st['running']) { throw new LcndaBadInput('Ollama ne répond pas sur cet ordinateur : installe-le (ollama.com), lance-le, puis réessaie.'); }
    $other = array_values(array_filter($st['others'] ?? [], static fn($x) => $x['tag'] === $want));
    if ($other) {
        if (!$other[0]['vision']) { throw new LcndaBadInput('Ce modèle ne sait pas lire une image : choisis un modèle « vision ».'); }
        $m = ['tag' => $other[0]['tag']];
    } else {
        $m = tx_deep_model($want);
        $present = array_filter($st['models'], static fn($x) => $x['tag'] === $m['tag'] && $x['present']);
        if (!$present) { throw new LcndaBadInput('Ce modèle n’est pas encore téléchargé : « ⤓ Installer la lecture approfondie ».'); }
    }
    [$id, $dir] = tx_deep_new_job([]);
    file_put_contents($dir . '/image.b64', base64_encode($bin)); unset($bin);
    file_put_contents($dir . '/job.json', json_encode(['kind' => 'read', 'model' => $m['tag'], 'base' => tx_deep_base(), 'prompt' => tx_deep_prompt($lang, is_array($data['context'] ?? null) ? $data['context'] : []), 'created' => time()], JSON_UNESCAPED_UNICODE));
    file_put_contents($dir . '/result.json', json_encode(['state' => 'running', 'updated' => time(), 'text' => '']));
    htr_spawn_php([APP_ROOT . '/scripts/tx_deep_job.php', $dir, APP_ROOT], $dir . '/run.log');
    return ['id' => $id, 'model' => $m['tag']];
}

/** Le travail lui-même (scripts/tx_deep_job.php) : écrit l'avancement dans result.json ; « cancel » l'arrête. */
function tx_deep_run(string $dir): void
{
    $job = json_decode((string) @file_get_contents($dir . '/job.json'), true) ?: [];
    $put = static function (array $r) use ($dir): void { $r['updated'] = time(); @file_put_contents($dir . '/result.json.tmp', json_encode($r, JSON_UNESCAPED_UNICODE)); @rename($dir . '/result.json.tmp', $dir . '/result.json'); };
    $cancelled = static fn(): bool => is_file($dir . '/cancel');
    $put(['state' => 'running', 'text' => '']); // le programme a démarré (tx_deep_job s'en sert pour voir un départ raté)
    try {
        $base = (string) ($job['base'] ?? '');
        if (!tx_deep_url_ok($base)) { throw new RuntimeException('Adresse refusée.'); }
        $tag = (string) ($job['model'] ?? ''); if (($job['kind'] ?? '') === 'pull') { $tag = tx_deep_model($tag)['tag']; } elseif (!tx_deep_tag_ok($tag)) { throw new RuntimeException('Modèle refusé.'); } // lire : vérifié au départ (liste ou modèle installé)
        if (($job['kind'] ?? '') === 'pull') {
            $state = ['state' => 'running', 'completed' => 0, 'total' => 0, 'status' => '']; $last = 0; $err = '';
            $r = tx_deep_http('POST', '/api/pull', ['model' => $tag, 'stream' => true], 6 * 3600, static function (array $j) use (&$state, &$last, &$err, $put, $cancelled) {
                if (!empty($j['error'])) { $err = mb_substr((string) $j['error'], 0, 300); return false; }
                $state['status'] = mb_substr((string) ($j['status'] ?? ''), 0, 80);
                if (isset($j['total'])) { $state['total'] = (int) $j['total']; $state['completed'] = (int) ($j['completed'] ?? 0); }
                if ($state['status'] === 'success') { $state['state'] = 'done'; }
                if (microtime(true) - $last > .5) { $last = microtime(true); $put($state); }
                return !$cancelled();
            }, $base);
            if ($cancelled()) { $put(['state' => 'cancelled']); return; }
            if ($err !== '' || !$r['ok']) { $put(['state' => 'error', 'error' => $err !== '' ? $err : 'Le téléchargement du modèle n’a pas abouti.']); return; }
            $state['state'] = 'done'; $put($state); return;
        }
        $img = trim((string) @file_get_contents($dir . '/image.b64'));
        // Qwen3-VL « réfléchit » d'abord (message.thinking) : sans « think: false », toute la place peut y passer et la réponse
        // reste vide. On le demande ; un Ollama trop ancien qui ne connaît pas « think » est relancé sans.
        $text = ''; $thinking = ''; $last = 0; $err = ''; $r = ['ok' => false]; $info = '';
        foreach ([true, false] as $noThink) {
            $text = ''; $thinking = ''; $err = '';
            $body = ['model' => $tag, 'stream' => true, 'keep_alive' => '5m', 'options' => ['temperature' => 0, 'num_ctx' => 16384, 'num_predict' => 4096],
                'messages' => [['role' => 'user', 'content' => (string) ($job['prompt'] ?? '')] + ($img !== '' ? ['images' => [$img]] : [])]];
            if ($noThink) { $body['think'] = false; }
            if (($job['kind'] ?? '') === 'find') { $body['format'] = 'json'; $body['options']['num_predict'] = 3072; } // 🔍 Repérer avec l'IA : du texte seulement, réponse en JSON
            $r = tx_deep_http('POST', '/api/chat', $body, 1800, static function (array $j) use (&$text, &$thinking, &$last, &$err, &$info, $put, $cancelled) {
                if (!empty($j['error'])) { $err = mb_substr((string) $j['error'], 0, 300); return false; }
                if (!empty($j['done'])) { $info = trim(implode(' · ', array_filter([isset($j['done_reason']) ? 'fin : ' . mb_substr((string) $j['done_reason'], 0, 20) : '', isset($j['prompt_eval_count']) ? 'image et consigne : ' . (int) $j['prompt_eval_count'] : '', isset($j['eval_count']) ? 'écrit : ' . (int) $j['eval_count'] : '']))); }
                $text .= (string) ($j['message']['content'] ?? '');
                $thinking .= (string) ($j['message']['thinking'] ?? '');
                if (mb_strlen($text) > 60000 || mb_strlen($thinking) > 60000) { return false; }
                if (microtime(true) - $last > .7) { $last = microtime(true); $put(['state' => 'running', 'text' => $text]); }
                return !$cancelled();
            }, $base);
            if ($noThink && $err !== '' && stripos($err, 'think') !== false && !$cancelled()) { continue; } // « think » inconnu de cet Ollama
            break;
        }
        @unlink($dir . '/image.b64');
        if ($cancelled()) { $put(['state' => 'cancelled']); return; }
        if ($err !== '' || (!$r['ok'] && trim($text) === '')) { $put(['state' => 'error', 'error' => $err !== '' ? $err : 'La lecture approfondie n’a pas abouti.', 'detail' => trim($info . ($r['ok'] ? '' : ' · HTTP ' . (int) ($r['code'] ?? 0)), ' ·')]); return; }
        if (trim($text) === '') { // jamais un texte vide présenté comme une lecture
            $put(['state' => 'error', 'error' => trim($thinking) !== ''
                ? 'Le modèle a réfléchi sans écrire de transcription. Recadre une zone plus petite (quelques lignes) ou essaie le modèle 8B, puis relance.'
                : 'Le modèle n’a rien lu sur cette image. Recadre une zone plus petite (quelques lignes) ou essaie le modèle 8B, puis relance.', 'detail' => $info]); return; }
        if (($job['kind'] ?? '') === 'find') { // jamais une réponse non vérifiée : le JSON doit suivre le schéma, sinon rien n'est repris
            try { $found = tx_find_validate($text); } catch (Throwable $e) { $put(['state' => 'error', 'error' => 'L’IA a répondu autre chose que le JSON demandé : rien n’est repris.', 'detail' => mb_substr($e->getMessage(), 0, 160)]); return; }
            $put(['state' => 'done', 'text' => '', 'found' => $found]); return;
        }
        $put(['state' => 'done', 'text' => trim(preg_replace('/^```[a-z]*\s*|\s*```$/', '', trim($text)) ?? $text)]);
    } catch (Throwable $e) {
        @unlink($dir . '/image.b64');
        $put(['state' => 'error', 'error' => $e->getMessage()]);
    }
}

function tx_deep_job(string $id): array
{
    $dir = tx_deep_job_dir($id);
    $r = json_decode((string) @file_get_contents($dir . '/result.json'), true) ?: [];
    $job = json_decode((string) @file_get_contents($dir . '/job.json'), true) ?: [];
    $state = (string) ($r['state'] ?? 'running');
    if ($state === 'running' && time() - (int) ($r['updated'] ?? $job['created'] ?? time()) > 1800) { $state = 'error'; $r['error'] = 'La lecture approfondie a pris trop de temps.'; }
    // le programme de lecture s'est arrêté net (erreur PHP, mémoire…) : on le dit avec la fin de son journal, au lieu d'attendre 30 min
    if ($state === 'running' && !is_file($dir . '/result.json') && time() - (int) ($job['created'] ?? time()) > 30) {
        $log = trim((string) @file_get_contents($dir . '/run.log'));
        $state = 'error'; $r['error'] = 'Le programme de lecture n’a pas démarré.'; $r['detail'] = mb_substr(preg_replace('/\s+/', ' ', $log) ?? '', -300);
    }
    return ['id' => $id, 'kind' => (string) ($job['kind'] ?? ''), 'model' => (string) ($job['model'] ?? ''), 'state' => $state, 'elapsed' => max(0, time() - (int) ($job['created'] ?? time())),
        'completed' => (int) ($r['completed'] ?? 0), 'total' => (int) ($r['total'] ?? 0), 'status' => (string) ($r['status'] ?? ''), 'text' => (string) ($r['text'] ?? ''), 'error' => (string) ($r['error'] ?? ''), 'detail' => (string) ($r['detail'] ?? '')]
        + (($job['kind'] ?? '') === 'find' && is_array($r['found'] ?? null) ? ['found' => $r['found']] : []);
}

function tx_deep_cancel(string $id): array
{
    @file_put_contents(tx_deep_job_dir($id) . '/cancel', '1');
    return ['id' => $id, 'cancelled' => true];
}

/** api.php : les actions de la lecture approfondie (pas de transaction de la base : rien n'y est écrit). */
function tx_deep_dispatch(string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite && $action === 'tx_deep_status') { json_response(tx_deep_status()); }
        if (!$isWrite && $action === 'tx_deep_job') { json_response(tx_deep_job(safe_text($_GET['id'] ?? ''))); }
        if ($isWrite && $action === 'tx_deep_pull') { json_response(['ok' => true, 'result' => tx_deep_pull_start($payload)]); }
        if ($isWrite && $action === 'tx_deep_read') { json_response(['ok' => true, 'result' => tx_deep_read_start($payload)]); }
        if ($isWrite && $action === 'tx_find_start') { json_response(['ok' => true, 'result' => tx_find_start($payload)]); }
        if ($isWrite && $action === 'tx_deep_prompt') { $lang = (string) ($payload['language'] ?? 'fra'); json_response(['ok' => true, 'result' => ['prompt' => tx_deep_prompt(isset(TX_DEEP_LANGS[$lang]) ? $lang : 'fra', is_array($payload['context'] ?? null) ? $payload['context'] : [])]]); } // 🧠 « Voir ce qui est envoyé »
        if ($isWrite && $action === 'tx_deep_cancel') { json_response(['ok' => true, 'result' => tx_deep_cancel(safe_text($payload['id'] ?? ''))]); }
    } catch (Throwable $e) { json_response(['error' => readable_error_message($e)], 422); }
    json_response(['error' => 'Action inconnue'], 404);
}
const TX_DEEP_ACTIONS = ['tx_deep_status', 'tx_deep_job', 'tx_deep_pull', 'tx_deep_read', 'tx_deep_cancel', 'tx_find_start', 'tx_deep_prompt'];

/* ═════════ 1 bis. 🔍 Repérer avec l'IA : le texte seul (jamais l'image) envoyé au même modèle local, réponse en JSON vérifiée ═════════ */

const TX_FIND_PERSON_KEYS = ['nom', 'prenom', 'age', 'metier', 'lieu', 'lien', 'role'];

/** La consigne : un objet JSON, rien d'inventé. */
function tx_find_prompt(string $text): string
{
    return "Voici la transcription d'un acte ancien (elle peut contenir des fautes de lecture). Repère seulement ce qui y est écrit.\n"
        . "Réponds uniquement par un objet JSON, sans aucun autre texte, de cette forme exacte :\n"
        . '{"personnes":[{"nom":"","prenom":"","age":"","metier":"","lieu":"","lien":"","role":""}],"lieux":[""],"dates":[""],"sorte":""}' . "\n"
        . "- N'invente rien : laisse \"\" (ou une liste vide) quand le texte ne le dit pas.\n"
        . "- age : le nombre d'années écrit dans le texte, en chiffres. lieu : le lieu d'origine, de naissance ou de domicile écrit.\n"
        . "- lien : le lien de parenté écrit (frère, fils de …, veuve de …). role : comparant, témoin, déclarant, parrain, marraine, défunt, époux, épouse, ou \"\".\n"
        . "- lieux : les villes, pays et régions nommés. dates : les dates écrites, telles quelles. sorte : naissance, baptême, mariage, décès, sépulture, notarié, militaire ou autre.\n"
        . "Texte :\n<<<\n" . $text . "\n>>>";
}

/** Le JSON de l'IA, vérifié : seulement les clés attendues, des textes courts, des listes bornées ; sinon une exception. */
function tx_find_validate(string $raw): array
{
    if (strlen($raw) > 60000) { throw new LcndaBadInput('réponse trop longue'); }
    $raw = trim(preg_replace('/^```(?:json)?\s*|\s*```$/i', '', trim($raw)) ?? '');
    if ($raw === '') { throw new LcndaBadInput('réponse vide'); }
    $j = json_decode($raw, true, 8);
    if (!is_array($j) || ($j !== [] && array_is_list($j))) { throw new LcndaBadInput('pas un objet JSON'); }
    $extra = array_diff(array_keys($j), ['personnes', 'lieux', 'dates', 'sorte']);
    if ($extra) { throw new LcndaBadInput('clé inattendue'); }
    $str = static function ($v, int $max = 120): string {
        if ($v === null) { return ''; }
        if (is_int($v) || is_float($v)) { $v = (string) $v; }
        if (!is_string($v)) { throw new LcndaBadInput('valeur qui n’est pas un texte'); }
        $v = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $v) ?? '');
        return mb_substr($v, 0, $max);
    };
    $list = static function ($v, int $max): array { if ($v === null) { return []; } if (!is_array($v) || !array_is_list($v)) { throw new LcndaBadInput('liste attendue'); } if (count($v) > 200) { throw new LcndaBadInput('liste trop longue'); } return array_slice($v, 0, $max); };
    $out = ['personnes' => [], 'lieux' => [], 'dates' => [], 'sorte' => ''];
    foreach ($list($j['personnes'] ?? [], 40) as $p) {
        if (!is_array($p) || ($p !== [] && array_is_list($p))) { throw new LcndaBadInput('personne qui n’est pas un objet'); }
        if (array_diff(array_keys($p), TX_FIND_PERSON_KEYS)) { throw new LcndaBadInput('champ de personne inattendu'); }
        $q = []; foreach (TX_FIND_PERSON_KEYS as $k) { $q[$k] = $str($p[$k] ?? ''); }
        if ($q['age'] !== '' && (!preg_match('/^\d{1,3}$/', $q['age']) || (int) $q['age'] > 120)) { $q['age'] = ''; }
        if ($q['nom'] === '' && $q['prenom'] === '') { continue; }
        $out['personnes'][] = $q;
    }
    foreach (['lieux', 'dates'] as $k) { foreach ($list($j[$k] ?? [], 40) as $v) { $v = $str($v); if ($v !== '' && !in_array($v, $out[$k], true)) { $out[$k][] = $v; } } }
    $out['sorte'] = $str($j['sorte'] ?? '', 40);
    return $out;
}

/** 🔍 Repérer avec l'IA : le texte (jamais l'image) part au modèle local, en arrière-plan ; tx_deep_job rend « found ». */
function tx_find_start(array $data): array
{
    $text = is_string($data['text'] ?? null) ? (string) $data['text'] : '';
    $text = trim(str_replace("\0", '', mb_check_encoding($text, 'UTF-8') ? $text : ''));
    if ($text === '') { throw new LcndaBadInput('Le texte est vide : lis ou écris d’abord l’acte.'); }
    if (mb_strlen($text) > 20000) { throw new LcndaBadInput('Texte trop long pour l’IA (20 000 signes au plus) : choisis un passage.'); }
    $st = tx_deep_status();
    if (!$st['local_only']) { throw new LcndaBadInput('L’adresse d’Ollama n’est pas sur cet ordinateur : la lecture approfondie est refusée.'); }
    if (!$st['running']) { throw new LcndaBadInput('Ollama ne répond pas sur cet ordinateur : installe-le (ollama.com), lance-le, puis réessaie.'); }
    $want = safe_text($data['model'] ?? '');
    $present = array_values(array_filter($st['models'], static fn($x) => $x['present']));
    usort($present, static fn($a, $b) => (($b['tag'] === $want) <=> ($a['tag'] === $want)) ?: ($b['recommended'] <=> $a['recommended']));
    if (!$present) { throw new LcndaBadInput('Ce modèle n’est pas encore téléchargé : « ⤓ Installer la lecture approfondie ».'); }
    $m = tx_deep_model($present[0]['tag']);
    [$id, $dir] = tx_deep_new_job([]);
    file_put_contents($dir . '/job.json', json_encode(['kind' => 'find', 'model' => $m['tag'], 'base' => tx_deep_base(), 'prompt' => tx_find_prompt($text), 'created' => time()], JSON_UNESCAPED_UNICODE));
    file_put_contents($dir . '/result.json', json_encode(['state' => 'running', 'updated' => time(), 'text' => '']));
    htr_spawn_php([APP_ROOT . '/scripts/tx_deep_job.php', $dir, APP_ROOT], $dir . '/run.log');
    return ['id' => $id, 'model' => $m['tag']];
}

/* ═════════ 2. De l'acte à la généalogie ═════════ */

const ACT_ROLES = ['epoux', 'epouse', 'pere_epoux', 'mere_epoux', 'pere_epouse', 'mere_epouse', 'pere', 'mere', 'pere_defunt', 'mere_defunt', 'sujet', 'defunt', 'conjoint', 'temoin', 'parrain', 'marraine', 'declarant', 'parent', 'autre'];
const ACT_MAIN_EVENT = ['mariage' => 'MARR', 'bapteme' => 'CHR', 'naissance' => 'BIRT', 'deces' => 'DEAT', 'sepulture' => 'BURI'];
const ACT_MAX_PEOPLE = 40;

/** Une fiche, en court, pour « ⇆ Comparer » : naissance, décès, métier, parents, conjoints. */
function act_people_details(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', array_slice($ids, 0, 30)))));
    $out = [];
    $ev = $pdo->prepare("SELECT t.gedcom_tag, e.date_text, e.year, pl.name AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id=? AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI') ORDER BY e.year IS NULL, e.year, e.id");
    $one = $pdo->prepare('SELECT id, first_name, last_name, gender, occupation FROM persons WHERE id=?');
    foreach ($ids as $id) {
        $one->execute([$id]); $p = $one->fetch(); if (!$p) { continue; }
        $ev->execute([$id]); $birth = null; $death = null;
        foreach ($ev->fetchAll() as $e) { $v = ['date' => (string) $e['date_text'], 'year' => $e['year'] !== null ? (int) $e['year'] : null, 'place' => (string) ($e['place'] ?? '')];
            if (in_array($e['gedcom_tag'], ['BIRT', 'CHR', 'BAPM'], true)) { $birth = $birth ?? $v; } else { $death = $death ?? $v; } }
        $name = static function (int $pid) use ($pdo): array { $s = $pdo->prepare('SELECT id, first_name, last_name, gender FROM persons WHERE id=?'); $s->execute([$pid]); $r = $s->fetch(); return $r ? ['id' => (int) $r['id'], 'name' => trim($r['first_name'] . ' ' . mb_strtoupper((string) $r['last_name'])), 'gender' => (string) $r['gender']] : []; };
        $parents = array_values(array_filter(array_map($name, child_parent_ids($pdo, $id))));
        $sp = $pdo->prepare('SELECT CASE WHEN partner1_id=? THEN partner2_id ELSE partner1_id END FROM families WHERE (partner1_id=? OR partner2_id=?)'); $sp->execute([$id, $id, $id]);
        $spouses = array_values(array_filter(array_map(static fn($x) => $x ? $name((int) $x) : [], $sp->fetchAll(PDO::FETCH_COLUMN))));
        $out[] = ['id' => $id, 'name' => trim($p['first_name'] . ' ' . mb_strtoupper((string) $p['last_name'])), 'first' => (string) $p['first_name'], 'last' => (string) $p['last_name'], 'gender' => (string) $p['gender'],
            'occupation' => (string) ($p['occupation'] ?? ''), 'birth' => $birth, 'death' => $death, 'father' => array_values(array_filter($parents, static fn($x) => $x['gender'] !== 'female'))[0] ?? null,
            'mother' => array_values(array_filter($parents, static fn($x) => $x['gender'] === 'female'))[0] ?? null, 'spouses' => $spouses];
    }
    return $out;
}

/** Pour chaque personne de l'acte : les fiches qui lui ressemblent (avec leur détail) ; la source déjà là, s'il y en a une. */
function act_import_check(PDO $pdo, array $d): array
{
    $people = array_slice(is_array($d['people'] ?? null) ? $d['people'] : [], 0, ACT_MAX_PEOPLE);
    $year = safe_int($d['year'] ?? 0) ?: null;
    $idx = ip_people_index($pdo, array_map(static fn($p) => ip_fold(ip_txt(is_array($p) ? ($p['last'] ?? '') : '', 200)), $people));
    $cands = []; $all = [];
    foreach ($people as $p) {
        if (!is_array($p) || !preg_match('/^p\d{1,3}$/', (string) ($p['key'] ?? ''))) { continue; }
        $sex = ($p['sex'] ?? '') === 'm' ? 'male' : (($p['sex'] ?? '') === 'f' ? 'female' : '');
        $by = safe_int($p['birth_year'] ?? 0) ?: null; $role = (string) ($p['role'] ?? '');
        $kind = $by ? 'birth' : (str_starts_with($role, 'pere') || str_starts_with($role, 'mere') ? 'parent' : ($year ? 'marriage' : 'any'));
        $c = ip_candidates($idx, ip_txt($p['first'] ?? '', 200), ip_txt($p['last'] ?? '', 200), $sex, $by ?? $year, $by ? 'birth' : $kind);
        $cands[(string) $p['key']] = $c; foreach ($c as $x) { $all[] = $x['id']; }
    }
    $details = []; foreach (act_people_details($pdo, $all) as $x) { $details[$x['id']] = $x; }
    foreach ($cands as $k => $list) { foreach ($list as $i => $x) { $cands[$k][$i]['detail'] = $details[$x['id']] ?? null; } }
    $src = null; $title = ip_txt($d['source_title'] ?? '', 500);
    if ($title !== '') { $s = $pdo->prepare('SELECT id, title FROM sources WHERE title=? COLLATE NOCASE ORDER BY id LIMIT 1'); $s->execute([$title]); $r = $s->fetch(); if ($r) { $src = ['id' => (int) $r['id'], 'title' => (string) $r['title']]; } }
    return ['candidates' => $cands, 'source' => $src];
}

/** Le plan reçu du navigateur, revérifié : personnes (créer / relier / ignorer / témoin seul), liens, événement, source. */
function act_import_plan(PDO $pdo, array $d): array
{
    $people = [];
    foreach (array_slice(is_array($d['people'] ?? null) ? $d['people'] : [], 0, ACT_MAX_PEOPLE + 1) as $p) {
        if (!is_array($p) || !preg_match('/^p\d{1,3}$/', (string) ($p['key'] ?? ''))) { continue; }
        $action = in_array($p['action'] ?? '', ['create', 'link', 'ignore', 'witness'], true) ? $p['action'] : 'ignore';
        $pid = safe_int($p['person_id'] ?? 0);
        if ($action === 'link' && (!$pid || !person_exists($pdo, $pid))) { throw new LcndaBadInput('Une fiche à relier n’existe plus : choisis-en une autre.'); }
        $add = is_array($p['add'] ?? null) ? $p['add'] : [];
        $people[(string) $p['key']] = ['key' => (string) $p['key'], 'action' => $action, 'person_id' => $action === 'link' ? $pid : 0,
            'first' => ip_txt($p['first'] ?? '', 200), 'last' => ip_txt($p['last'] ?? '', 200), 'name' => ip_txt($p['name'] ?? '', 300),
            'sex' => ($p['sex'] ?? '') === 'm' ? 'male' : (($p['sex'] ?? '') === 'f' ? 'female' : 'unknown'),
            'role' => in_array($p['role'] ?? '', ACT_ROLES, true) ? $p['role'] : 'autre', 'job' => ip_txt($p['job'] ?? '', 200), 'age' => min(130, max(0, safe_int($p['age'] ?? 0))),
            'birth_year' => safe_int($p['birth_year'] ?? 0) ?: null, 'residence' => ip_txt($p['residence'] ?? '', 200), 'deceased' => !empty($p['deceased']),
            'add' => ['job' => !empty($add['job']), 'birth' => !empty($add['birth']), 'death' => !empty($add['death']), 'residence' => !empty($add['residence'])]];
        if ($action === 'create' && $people[(string) $p['key']]['first'] === '' && $people[(string) $p['key']]['last'] === '') { throw new LcndaBadInput('Une personne à créer n’a ni prénom ni nom.'); }
    }
    if (count($people) > ACT_MAX_PEOPLE) { throw new LcndaBadInput('Trop de personnes dans un seul acte.'); }
    $rels = [];
    foreach (array_slice(is_array($d['relations'] ?? null) ? $d['relations'] : [], 0, 80) as $r) {
        if (!is_array($r)) { continue; }
        $t = (string) ($r['type'] ?? ''); $k = static fn($x) => isset($people[(string) $x]) ? (string) $x : '';
        if ($t === 'couple' && $k($r['a'] ?? '') && $k($r['b'] ?? '')) { $rels[] = ['type' => 'couple', 'a' => $k($r['a']), 'b' => $k($r['b']), 'marriage' => !empty($r['marriage'])]; }
        if ($t === 'parents' && $k($r['child'] ?? '') && ($k($r['father'] ?? '') || $k($r['mother'] ?? ''))) { $rels[] = ['type' => 'parents', 'father' => $k($r['father'] ?? ''), 'mother' => $k($r['mother'] ?? ''), 'child' => $k($r['child'])]; }
        if ($t === 'sibling' && $k($r['a'] ?? '') && $k($r['b'] ?? '')) { $rels[] = ['type' => 'sibling', 'a' => $k($r['a']), 'b' => $k($r['b'])]; }
    }
    $e = is_array($d['event'] ?? null) ? $d['event'] : [];
    $event = ['kind' => isset(ACT_MAIN_EVENT[$e['kind'] ?? '']) ? (string) $e['kind'] : 'autre', 'date' => ip_txt($e['date'] ?? '', 120), 'place' => ip_txt($e['place'] ?? '', 200), 'place_id' => safe_int($e['place_id'] ?? 0)];
    if ($event['place_id'] && !record_exists($pdo, 'places', $event['place_id'])) { $event['place_id'] = 0; }
    $s = is_array($d['source'] ?? null) ? $d['source'] : [];
    $source = ['id' => safe_int($s['id'] ?? 0), 'title' => ip_txt($s['title'] ?? '', 500), 'agency' => ip_txt($s['archive'] ?? '', 300), 'url' => preg_match('#^https?://#i', (string) ($s['url'] ?? '')) ? ip_txt($s['url'], 2000) : ''];
    foreach (['archive', 'commune', 'register', 'years', 'cote', 'view', 'view_total', 'act'] as $f) { $source['c_' . $f] = ip_txt($s[$f] ?? '', 300); }
    if ($source['id'] && !record_exists($pdo, 'sources', $source['id'])) { $source['id'] = 0; }
    return [$people, $rels, $event, $source];
}

/** Un événement ajouté par l'acte, avec sa citation (source + vue précise) ; renvoie son numéro. */
function act_add_event(PDO $pdo, array $ev, array $source, string $note, array &$count): int
{
    $type = ip_event_type($pdo, (string) $ev['tag']); if (!$type) { return 0; }
    $row = add_event($pdo, ['event_scope' => isset($ev['family_id']) ? 'family' : 'person', 'person_id' => $ev['person_id'] ?? 0, 'family_id' => $ev['family_id'] ?? 0, 'event_type_id' => $type,
        'date_text' => (string) ($ev['date'] ?? ''), 'place_id' => $ev['place_id'] ?? '', 'place_name' => (string) ($ev['place'] ?? ''), 'description' => (string) ($ev['description'] ?? ''), 'fact_confidence' => (string) ($ev['confidence'] ?? 'unknown')]);
    $id = (int) ($row['id'] ?? 0); if (!$id) { return 0; }
    if (!empty($ev['description'])) { $pdo->prepare('UPDATE events SET description=? WHERE id=? AND COALESCE(description,\'\')=\'\'')->execute([(string) $ev['description'], $id]); }
    $count['events']++;
    if ($source['_id']) {
        $pdo->prepare('INSERT INTO source_links(entity_type,entity_id,source_record_id,page,quality,note) VALUES(?,?,?,?,?,?)')->execute(['event', $id, $source['_id'], '', '', $note]);
        $cite = []; foreach (['archive', 'commune', 'register', 'years', 'cote', 'view', 'view_total', 'act'] as $f) { $cite['citation_' . $f] = $source['c_' . $f]; } if ($source['url'] !== '') { $cite['citation_view_url'] = $source['url']; }
        store_citation($pdo, (int) $pdo->lastInsertId(), $cite);
        $count['citations']++;
    }
    return $id;
}

/** ✓ Ajouter à la généalogie : tout d'un coup (api.php ouvre la transaction), et le jeton de « ↶ Annuler ». */
function act_import_apply(PDO $pdo, array $d): array
{
    [$people, $rels, $event, $source] = act_import_plan($pdo, $d);
    $tid = safe_int($d['transcription_id'] ?? 0); $mediaId = safe_int($d['media_id'] ?? 0);
    if ($mediaId && !record_exists($pdo, 'media', $mediaId)) { $mediaId = 0; }
    $text = mb_substr((string) ($d['text'] ?? ''), 0, 20000);
    foreach ($people as $p) { if ($p['action'] === 'link') { assert_person_unlocked($pdo, $p['person_id']); } }
    $before = import_receipt_begin($pdo);
    $count = ['created' => 0, 'linked' => 0, 'events' => 0, 'families' => 0, 'witnesses' => 0, 'citations' => 0, 'source_created' => 0, 'skipped' => []];
    $occBefore = []; $map = [];
    $placeName = $event['place'];
    // la source : la même (même titre) est reprise
    $source['_id'] = $source['id'];
    if (!$source['_id'] && $source['title'] !== '') {
        $s = $pdo->prepare('SELECT id FROM sources WHERE title=? COLLATE NOCASE ORDER BY id LIMIT 1'); $s->execute([$source['title']]); $source['_id'] = (int) $s->fetchColumn();
        if (!$source['_id']) {
            $pdo->prepare("INSERT INTO sources(source_type,title,author,agency,publication,url,text) VALUES('archive',?,?,?,?,?,?)")->execute([$source['title'], '', $source['agency'], trim($source['c_register'] . ' ' . $source['c_years']), '', '']);
            $source['_id'] = (int) $pdo->lastInsertId(); $count['source_created'] = 1;
            if (function_exists('archive_service_store_source') && $source['c_cote'] !== '') { archive_service_store_source($pdo, $source['_id'], ['archive_cote' => $source['c_cote']]); }
        }
    }
    $note = 'Transcription d’acte' . ($text !== '' ? " :\n" . $text : '');
    // les fiches
    foreach ($people as $k => $p) {
        if ($p['action'] === 'link') { $map[$k] = $p['person_id']; $count['linked']++; continue; }
        if ($p['action'] !== 'create') { continue; }
        $row = save_person($pdo, ['first_name' => $p['first'], 'last_name' => $p['last'], 'gender' => $p['sex'], 'occupation' => $p['add']['job'] ? $p['job'] : '', 'living_status' => 'deceased']);
        $map[$k] = (int) $row['id']; $count['created']++;
    }
    $date = $event['date']; $placeArg = $event['place_id'] ? ['place_id' => $event['place_id']] : ['place' => $placeName];
    // les liens : couple, parents ↔ enfant, frère / sœur
    $families = [];
    $familyOf = static function (int $a, int $b) use ($pdo, &$count): int { $fid = couple_family_id($pdo, $a, $b); if (!$fid) { $pdo->prepare('INSERT INTO families(partner1_id, partner2_id) VALUES(?,?)')->execute([$a, $b]); $fid = (int) $pdo->lastInsertId(); $count['families']++; } return $fid; };
    foreach ($rels as $r) {
        if ($r['type'] === 'couple' && isset($map[$r['a']], $map[$r['b']]) && $map[$r['a']] !== $map[$r['b']]) { $families['couple:' . $r['a'] . ':' . $r['b']] = $familyOf($map[$r['a']], $map[$r['b']]); }
        if ($r['type'] === 'parents' && isset($map[$r['child']])) {
            $c = $map[$r['child']]; $f = $r['father'] !== '' ? ($map[$r['father']] ?? 0) : 0; $m = $r['mother'] !== '' ? ($map[$r['mother']] ?? 0) : 0;
            if (!$f && !$m) { continue; }
            $cur = child_parent_ids($pdo, $c);
            if ($cur) { if (array_diff(array_filter([$f, $m]), $cur)) { $count['skipped'][] = person_label_by_id($pdo, $c); } continue; } // d'autres parents déjà : rien n'est changé
            if ($f && $m) { $fid = $familyOf($f, $m); }
            else { $pdo->prepare('INSERT INTO families(partner1_id, partner2_id) VALUES(?, NULL)')->execute([$f ?: $m]); $fid = (int) $pdo->lastInsertId(); $count['families']++; }
            ensure_child_link($pdo, $fid, $c); $families['parents:' . $r['child']] = $fid;
        }
    }
    foreach ($rels as $r) { // frère ou sœur : rejoint la famille des parents de l'autre, s'il n'a pas encore de parents
        if ($r['type'] !== 'sibling' || !isset($map[$r['a']], $map[$r['b']])) { continue; }
        $s = $map[$r['b']]; if (child_parent_ids($pdo, $s)) { continue; }
        $fc = $pdo->prepare('SELECT family_id FROM family_children WHERE child_id=? ORDER BY id LIMIT 1'); $fc->execute([$map[$r['a']]]); $fid = (int) $fc->fetchColumn();
        if ($fid) { ensure_child_link($pdo, $fid, $s); }
    }
    // l'événement de l'acte (mariage, baptême, naissance, décès, sépulture)
    $mainId = 0; $tag = ACT_MAIN_EVENT[$event['kind']] ?? '';
    if ($tag === 'MARR') {
        $fid = 0; foreach ($families as $key => $f) { if (str_starts_with($key, 'couple:')) { $fid = $f; break; } }
        if ($fid) {
            $has = $pdo->prepare("SELECT e.id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.family_id=? AND t.gedcom_tag='MARR' LIMIT 1"); $has->execute([$fid]); $mainId = (int) $has->fetchColumn();
            if (!$mainId) { $mainId = act_add_event($pdo, ['tag' => 'MARR', 'family_id' => $fid, 'date' => $date] + $placeArg, $source, $note, $count); }
        }
    } elseif ($tag !== '') {
        $subj = null; foreach ($people as $k => $p) { if (isset($map[$k]) && in_array($p['role'], ['sujet', 'defunt'], true)) { $subj = $map[$k]; break; } }
        if ($subj) { $mainId = act_add_event($pdo, ['tag' => $tag, 'person_id' => $subj, 'date' => $date] + $placeArg, $source, $note, $count); }
    }
    if ($mainId && $mediaId) { $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'event', ?, 0)")->execute([$mediaId, $mainId]); }
    // les faits en plus : métier, naissance estimée d'après l'âge, décès d'avant l'acte, domicile ; les témoins, parrains et marraines
    $hasTag = static function (int $pid, array $tags) use ($pdo): bool { $in = implode(',', array_fill(0, count($tags), '?')); $s = $pdo->prepare("SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=? AND t.gedcom_tag IN ($in) LIMIT 1"); $s->execute([$pid, ...$tags]); return (bool) $s->fetchColumn(); };
    $wpos = 0;
    foreach ($people as $k => $p) {
        if (!isset($map[$k])) { continue; }
        $pid = $map[$k];
        if ($p['job'] !== '' && $p['add']['job']) {
            if ($p['action'] === 'link') { $s = $pdo->prepare('SELECT occupation FROM persons WHERE id=?'); $s->execute([$pid]); $old = (string) $s->fetchColumn(); if (trim($old) === '') { $occBefore[$pid] = [$old, $p['job']]; $pdo->prepare('UPDATE persons SET occupation=? WHERE id=?')->execute([$p['job'], $pid]); } }
            act_add_event($pdo, ['tag' => 'OCCU', 'person_id' => $pid, 'date' => $date, 'description' => $p['job']] + ($p['residence'] !== '' ? ['place' => $p['residence']] : $placeArg), $source, $note, $count);
        }
        if ($p['birth_year'] && $p['add']['birth'] && !$hasTag($pid, ['BIRT', 'CHR', 'BAPM'])) {
            act_add_event($pdo, ['tag' => 'BIRT', 'person_id' => $pid, 'date' => 'vers ' . $p['birth_year'], 'confidence' => 'estimated', 'description' => $p['age'] ? $p['age'] . ' ans dans l’acte' : ''], $source, $note, $count);
        }
        if ($p['deceased'] && $p['add']['death'] && !$hasTag($pid, ['DEAT', 'BURI'])) {
            act_add_event($pdo, ['tag' => 'DEAT', 'person_id' => $pid, 'date' => $date !== '' ? 'avant le ' . $date : '', 'confidence' => 'deduced', 'description' => 'Dit décédé dans l’acte'], $source, $note, $count);
        }
        if ($p['residence'] !== '' && $p['add']['residence']) {
            act_add_event($pdo, ['tag' => 'RESI', 'person_id' => $pid, 'date' => $date, 'place' => $p['residence']], $source, $note, $count);
        }
        if ($mainId && in_array($p['role'], ['temoin', 'parrain', 'marraine', 'declarant'], true)) {
            $pdo->prepare('INSERT INTO event_witnesses(event_id, person_id, note, position) VALUES(?,?,?,?)')->execute([$mainId, $pid, ['temoin' => 'témoin', 'parrain' => 'parrain', 'marraine' => 'marraine', 'declarant' => 'déclarant'][$p['role']], ++$wpos]);
            $count['witnesses']++;
        }
        if ($source['_id'] && $p['action'] === 'create') { $pdo->prepare('INSERT INTO source_links(entity_type,entity_id,source_record_id,page,quality,note) VALUES(?,?,?,?,?,?)')->execute(['person', $pid, $source['_id'], '', '', 'Nommé dans l’acte']); store_citation($pdo, (int) $pdo->lastInsertId(), array_combine(array_map(static fn($f) => 'citation_' . $f, ['archive', 'commune', 'register', 'years', 'cote', 'view', 'view_total', 'act']), array_map(static fn($f) => $source['c_' . $f], ['archive', 'commune', 'register', 'years', 'cote', 'view', 'view_total', 'act']))); $count['citations']++; }
    }
    if (function_exists('gedimport_rebuild_search')) { gedimport_rebuild_search($pdo); }
    $label = $source['c_act'] !== '' ? $source['c_act'] : 'acte transcrit';
    $undo = import_receipt_save($pdo, 'tree', $before, ['label' => $label, 'act' => ['occupations' => $occBefore, 'transcription_id' => $tid]]);
    log_change($pdo, 'meta', 0, 'create', 'Acte ajouté à la généalogie : ' . $label . ' (' . ip_plural($count['created'], 'fiche créée', 'fiches créées') . ', ' . ip_plural($count['linked'], 'fiche reliée', 'fiches reliées') . ')');
    return $count + ['map' => $map, 'event_id' => $mainId, 'source_id' => $source['_id'], 'undo' => $undo];
}

/** ↶ Annuler l'ajout d'un acte : les métiers remis comme avant, puis tout ce qui a été ajouté retiré (import_undo). */
function act_import_undo(PDO $pdo, array $d): array
{
    $token = (string) ($d['token'] ?? '');
    $r = import_receipt_load($token, 'tree');
    if (!is_array($r['act'] ?? null)) { throw new LcndaBadInput('Annulation impossible : ce n’est pas l’ajout d’un acte.'); }
    foreach ((array) ($r['act']['occupations'] ?? []) as $pid => [$old, $set]) { $pdo->prepare('UPDATE persons SET occupation=? WHERE id=? AND occupation=?')->execute([(string) $old, (int) $pid, (string) $set]); }
    $res = import_undo($pdo, ['token' => $token]);
    return ['removed' => (int) ($res['removed'] ?? 0), 'persons' => (int) ($res['persons'] ?? 0)];
}

/* ═════════ 3. « Ce que l'app a trouvé », plus riche (assets/js/heritage-transcribe-trouve.js) ═════════ */

/** Les fiches, lieux et événements du « Monde autour » qui ressemblent à ce que le repérage a trouvé (rien n'est écrit). */
function act_trouve_match(PDO $pdo, array $d): array
{
    $out = ['people' => [], 'places' => [], 'events' => []];
    // les fins qui se prononcent pareil (« Baisser », « Baissait », « Baissé ») comptent pour une seule lettre de différence
    $sound = static fn(string $x): string => preg_replace(['/(?:aient|ait|ais|ai|er|ez|et|ee|e)$/', '/(.)\\1/', '/ph/', '/y/'], ['e', '$1', 'f', 'i'], $x) ?? $x;
    $close = static function (string $a, string $b) use ($sound): int { if ($a === $b) { return 0; } $l = max(mb_strlen($a), mb_strlen($b)); if ($l < 4 || $a[0] !== $b[0]) { return 99; } $d = levenshtein($a, $b); if ($d > 1 && $sound($a) === $sound($b)) { $d = 1; } return $d <= ($l >= 7 ? 2 : 1) ? $d : 99; };
    // les personnes : le nom de famille écrit à une ou deux lettres près (« Baisser » ↔ « BAISSAIT »), le prénom pareil ou presque
    $s = $pdo->prepare("SELECT id, first_name, last_name, gender FROM persons WHERE COALESCE(kind,'person')<>'animal' AND last_name LIKE ? LIMIT 600");
    foreach (array_slice(is_array($d['people'] ?? null) ? $d['people'] : [], 0, 40) as $p) {
        if (!is_array($p) || !preg_match('/^r\d{1,3}$/', (string) ($p['key'] ?? ''))) { continue; }
        $lf = ip_fold(ip_txt($p['last'] ?? '', 120)); $ff = ip_fold(ip_txt($p['first'] ?? '', 120));
        $lf = str_replace(' ', '', $lf); if (mb_strlen($lf) < 3) { continue; }
        $s->execute([substr($lf, 0, 2) . '%']);
        $c = [];
        foreach ($s->fetchAll() as $r) {
            $dl = $close($lf, str_replace(' ', '', ip_fold((string) $r['last_name']))); if ($dl > 2) { continue; }
            $pf = ip_fold((string) $r['first_name']); $fs = 0;
            if ($ff !== '' && $pf !== '') { $t1 = explode(' ', $ff)[0]; $t2 = explode(' ', $pf)[0]; $fs = $pf === $ff ? 3 : ($t1 === $t2 ? 2 : ($close($t1, $t2) <= 1 ? 1 : -9)); }
            if ($fs < 0) { continue; }
            $c[] = ['id' => (int) $r['id'], 'title' => trim($r['first_name'] . ' ' . mb_strtoupper((string) $r['last_name'])), 'gender' => (string) $r['gender'], 'score' => (3 - $dl) + $fs, 'same' => $dl === 0 && $fs >= 2];
        }
        usort($c, static fn($a, $b) => $b['score'] <=> $a['score'] ?: $a['id'] <=> $b['id']);
        $c = array_slice($c, 0, 3);
        foreach ($c as &$x) { $y = $pdo->prepare("SELECT MIN(CASE WHEN t.gedcom_tag IN ('BIRT','CHR','BAPM') THEN e.year END), MAX(CASE WHEN t.gedcom_tag IN ('DEAT','BURI') THEN e.year END) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=?"); $y->execute([$x['id']]); [$b, $dd] = $y->fetch(PDO::FETCH_NUM) ?: [null, null]; $x['years'] = ($b || $dd) ? (($b ?: '?') . '–' . ($dd ?: '')) : ''; }
        unset($x);
        $out['people'][(string) $p['key']] = $c;
    }
    // les lieux : le même nom, ou à une ou deux lettres près
    $pl = $pdo->prepare('SELECT id, name, country FROM places WHERE name LIKE ? LIMIT 400');
    foreach (array_slice(is_array($d['places'] ?? null) ? $d['places'] : [], 0, 40) as $name) {
        $name = ip_txt($name, 120); $f = str_replace(' ', '', ip_fold(preg_replace('/^(?:Sainct|St)\b/u', 'Saint', $name) ?? $name)); if (mb_strlen($f) < 2) { continue; }
        $pl->execute([mb_substr($name, 0, 2) . '%']);
        $c = [];
        foreach ($pl->fetchAll() as $r) { $first = str_replace(' ', '', ip_fold(explode(',', (string) $r['name'])[0])); $dl = $close($f, $first); if ($dl > 2) { continue; } $c[] = ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'same' => $dl === 0, 'score' => 3 - $dl]; }
        usort($c, static fn($a, $b) => $b['score'] <=> $a['score'] ?: $a['id'] <=> $b['id']);
        $out['places'][$name] = array_slice($c, 0, 3);
    }
    // le contexte : « bataille d'Ulm » ↔ un événement du « Monde autour » (livré avec l'app, ou un des miens)
    $world = function_exists('world_events_bundled') ? world_events_bundled()['events'] : [];
    if (function_exists('world_own_as_events')) { try { $world = array_merge($world, world_own_as_events($pdo)); } catch (Throwable) { /* table absente */ } }
    $stop = ['bataille', 'combat', 'siege', 'prise', 'campagne', 'affaire', 'de', 'du', 'des', 'la', 'le', 'les', 'd', 'l', 'prisonniers', 'prisonnier', 'guerre', 'dans', 'armes', 'retour', 'retourner', 'leur', 'pays', 'delivrance'];
    foreach (array_slice(is_array($d['events'] ?? null) ? $d['events'] : [], 0, 20) as $e) {
        if (!is_array($e) || !preg_match('/^e\d{1,3}$/', (string) ($e['key'] ?? ''))) { continue; }
        $label = ip_fold(ip_txt($e['label'] ?? '', 160)); $kind = (string) ($e['kind'] ?? '');
        $words = array_values(array_filter(explode(' ', $label), static fn($w) => mb_strlen($w) >= 3 && !in_array($w, $stop, true)));
        $c = [];
        foreach ($world as $w) {
            $t = ' ' . ip_fold((string) $w['title']) . ' ';
            $hit = $words ? count(array_filter($words, static fn($x) => str_contains($t, ' ' . $x . ' '))) === count($words) : false;
            if (!$hit && $kind === 'prisonniers' && preg_match('/ prisonniers? /', $t)) { $hit = true; }
            if ($hit) { $c[] = ['id' => (string) $w['id'], 'title' => (string) $w['title'], 'from' => (int) $w['from'], 'to' => (int) $w['to'], 'date' => (string) ($w['date'] ?? ''), 'place' => (string) ($w['place'] ?? ''), 'own' => !empty($w['own'])]; }
        }
        $out['events'][(string) $e['key']] = array_slice($c, 0, 3);
    }
    return $out;
}

/** La source de l'acte (même forme que pour « ✓ Ajouter à la généalogie ») : reprise si elle existe déjà (même titre), créée sinon. */
function act_item_source(PDO $pdo, array $s, array &$count): array
{
    $source = ['id' => safe_int($s['id'] ?? 0), 'title' => ip_txt($s['title'] ?? '', 500), 'agency' => ip_txt($s['archive'] ?? '', 300), 'url' => preg_match('#^https?://#i', (string) ($s['url'] ?? '')) ? ip_txt($s['url'], 2000) : ''];
    foreach (['archive', 'commune', 'register', 'years', 'cote', 'view', 'view_total', 'act'] as $f) { $source['c_' . $f] = ip_txt($s[$f] ?? '', 300); }
    if ($source['id'] && !record_exists($pdo, 'sources', $source['id'])) { $source['id'] = 0; }
    $source['_id'] = $source['id'];
    if (!$source['_id'] && $source['title'] !== '') {
        $q = $pdo->prepare('SELECT id FROM sources WHERE title=? COLLATE NOCASE ORDER BY id LIMIT 1'); $q->execute([$source['title']]); $source['_id'] = (int) $q->fetchColumn();
        if (!$source['_id']) {
            $pdo->prepare("INSERT INTO sources(source_type,title,author,agency,publication,url,text) VALUES('archive',?,?,?,?,?,?)")->execute([$source['title'], '', $source['agency'], trim($source['c_register'] . ' ' . $source['c_years']), '', '']);
            $source['_id'] = (int) $pdo->lastInsertId(); $count['source_created'] = 1;
            if (function_exists('archive_service_store_source') && $source['c_cote'] !== '') { archive_service_store_source($pdo, $source['_id'], ['archive_cote' => $source['c_cote']]); }
        }
    }
    return $source;
}

const ACT_ITEM_AS = ['event', 'note', 'job', 'residence', 'info'];

/**
 * ＋ Ajouter à une fiche : un élément trouvé dans l'acte (personne, âge, métier, lieu, date, contexte, phrase choisie) mis sur
 * la fiche choisie, comme événement, note, profession, résidence ou info — toujours avec sa source (ce document, la ligne)
 * et la phrase en citation ; « ↶ Annuler » passe par act_import_undo (même reçu).
 */
function act_item_add(PDO $pdo, array $d): array
{
    $pid = safe_int($d['person_id'] ?? 0);
    if (!$pid || !person_exists($pdo, $pid)) { throw new LcndaBadInput('Choisis la fiche où ajouter cet élément.'); }
    assert_person_unlocked($pdo, $pid);
    $as = in_array($d['as'] ?? '', ACT_ITEM_AS, true) ? (string) $d['as'] : '';
    if ($as === '') { throw new LcndaBadInput('Choisis comment ajouter cet élément.'); }
    $title = ip_txt($d['title'] ?? '', 200); $date = ip_txt($d['date'] ?? '', 120); $place = ip_txt($d['place'] ?? '', 200);
    $quote = mb_substr(trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', (string) (is_scalar($d['quote'] ?? '') ? ($d['quote'] ?? '') : '')) ?? ''), 0, 2000);
    $line = min(100000, max(0, safe_int($d['line'] ?? 0)));
    // 📑 un acte en plusieurs pages : la page de l'élément (n° dans l'ordre du document, et son nom : recto, verso, annexe, nom libre)
    $pageNo = min(1000, max(0, safe_int($d['page'] ?? 0)));
    $pageName = mb_substr(safe_text(is_scalar($d['page_label'] ?? '') ? (string) ($d['page_label'] ?? '') : ''), 0, 60);
    $pageName = ['recto' => 'recto', 'verso' => 'verso', 'annexe' => 'annexe', 'page' => ''][mb_strtolower($pageName)] ?? $pageName;
    $page = $pageNo ? 'page ' . $pageNo . ($pageName !== '' ? ' (' . $pageName . ')' : '') : '';
    if ($title === '' && $quote === '') { throw new LcndaBadInput('Rien à ajouter : l’élément est vide.'); }
    if ($as === 'job' && $title === '') { throw new LcndaBadInput('Rien à ajouter : l’élément est vide.'); }
    if ($as === 'residence' && $place === '' && $title === '') { throw new LcndaBadInput('Rien à ajouter : l’élément est vide.'); }
    // un événement du « Monde autour » relié : sa date et son lieu viennent de la base, jamais inventés
    $wid = ip_txt($d['world_id'] ?? '', 20);
    if ($wid !== '' && $as === 'event' && function_exists('world_events_bundled')) {
        $world = world_events_bundled()['events']; if (function_exists('world_own_as_events')) { try { $world = array_merge($world, world_own_as_events($pdo)); } catch (Throwable) { /* table absente */ } }
        foreach ($world as $w) { if ((string) $w['id'] !== $wid) { continue; }
            if ($date === '') { $date = (string) ($w['date'] ?? '') !== '' ? (string) $w['date'] : ((int) $w['from'] === (int) $w['to'] ? (string) (int) $w['from'] : (int) $w['from'] . '-' . (int) $w['to']); }
            if ($place === '' && (string) ($w['place'] ?? '') !== '') { $place = (string) $w['place']; }
            break; }
    }
    $mediaId = safe_int($d['media_id'] ?? 0); if ($mediaId && !record_exists($pdo, 'media', $mediaId)) { $mediaId = 0; }
    $before = import_receipt_begin($pdo);
    $count = ['events' => 0, 'notes' => 0, 'citations' => 0, 'source_created' => 0];
    $source = act_item_source($pdo, is_array($d['source'] ?? null) ? $d['source'] : [], $count);
    $note = trim(($page !== '' ? 'Page ' . $pageNo . ($line ? ', ligne ' . $line : '') . ' : ' : ($line ? 'Ligne ' . $line . ' : ' : '')) . ($quote !== '' ? '« ' . $quote . ' »' : ''));
    $occBefore = []; $eventId = 0; $noteId = 0;
    $cite = static function (string $type, int $id) use ($pdo, $source, $note, $page, &$count): void {
        if (!$source['_id']) { return; }
        $pdo->prepare('INSERT INTO source_links(entity_type,entity_id,source_record_id,page,quality,note) VALUES(?,?,?,?,?,?)')->execute([$type, $id, $source['_id'], $page, '', $note]);
        $c = []; foreach (['archive', 'commune', 'register', 'years', 'cote', 'view', 'view_total', 'act'] as $f) { $c['citation_' . $f] = $source['c_' . $f]; } if ($source['url'] !== '') { $c['citation_view_url'] = $source['url']; }
        if ($page !== '') { $cf = function_exists('citation_from') ? citation_from($c) : []; $ref = $cf ? citation_reference($cf) : ''; $c['page'] = $ref !== '' ? $ref . ', ' . $page : $page; } // 📑 la page de l'acte, après la référence
        store_citation($pdo, (int) $pdo->lastInsertId(), $c); $count['citations']++;
    };
    $tagFor = static function (string $tag, string $label) use ($pdo): int {
        $s = $pdo->prepare("SELECT id FROM event_types WHERE gedcom_tag=? AND scope IN ('person','') ORDER BY is_custom, id LIMIT 1"); $s->execute([$tag]); $id = (int) $s->fetchColumn();
        if ($id) { return $id; }
        $pdo->prepare("INSERT INTO event_types(scope,slug,label,gedcom_tag,icon,color,is_custom,is_active) VALUES('person',?,?,?,'diamond','#0066cc',1,1)")->execute([strtolower($tag) . '-acte', $label, $tag]);
        return (int) $pdo->lastInsertId();
    };
    if ($as === 'note') {
        $body = trim(($title !== '' && $title !== $quote ? $title . "\n" : '') . ($note !== '' ? $note : '') . ($source['title'] !== '' ? "\n— " . $source['title'] : ''));
        $pdo->prepare("INSERT INTO notes(entity_type, entity_id, title, body, created_at, updated_at) VALUES('person', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")->execute([$pid, 'Dans l’acte' . ($source['c_act'] !== '' ? ' : ' . $source['c_act'] : ''), $body]);
        $noteId = (int) $pdo->lastInsertId(); $count['notes']++;
        $cite('note', $noteId);
    } else {
        $tag = ['event' => 'EVEN', 'info' => 'FACT', 'job' => 'OCCU', 'residence' => 'RESI'][$as];
        $type = $tagFor($tag, ['EVEN' => 'Autre événement', 'FACT' => 'Info', 'OCCU' => 'Profession', 'RESI' => 'Lieu de résidence'][$tag]);
        if ($as === 'job') { $o = $pdo->prepare('SELECT occupation FROM persons WHERE id=?'); $o->execute([$pid]); $old = (string) $o->fetchColumn(); if (trim($old) === '') { $occBefore[$pid] = [$old, $title]; $pdo->prepare('UPDATE persons SET occupation=? WHERE id=?')->execute([$title, $pid]); } }
        $row = add_event($pdo, ['event_scope' => 'person', 'person_id' => $pid, 'event_type_id' => $type, 'date_text' => $date, 'place_id' => '', 'place_name' => $as === 'residence' ? ($place !== '' ? $place : $title) : $place, 'description' => $as === 'residence' && $place === '' ? '' : $title, 'fact_confidence' => 'unknown']);
        $eventId = (int) ($row['id'] ?? 0);
        if ($eventId) {
            $desc = $as === 'residence' && $place === '' ? '' : $title;
            if ($desc !== '') { $pdo->prepare("UPDATE events SET description=? WHERE id=? AND COALESCE(description,'')=''")->execute([$desc, $eventId]); }
            $count['events']++; $cite('event', $eventId);
            if ($mediaId) { $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'event', ?, 0)")->execute([$mediaId, $eventId]); }
        }
    }
    if (function_exists('gedimport_rebuild_search')) { gedimport_rebuild_search($pdo); }
    $label = ($title !== '' ? $title : mb_substr($quote, 0, 60)) . ' → ' . person_label_by_id($pdo, $pid);
    $undo = import_receipt_save($pdo, 'tree', $before, ['label' => $label, 'act' => ['occupations' => $occBefore, 'transcription_id' => safe_int($d['transcription_id'] ?? 0)]]);
    log_change($pdo, 'meta', 0, 'create', 'Élément d’un acte ajouté à une fiche : ' . $label);
    return $count + ['event_id' => $eventId, 'note_id' => $noteId, 'source_id' => $source['_id'], 'date' => $date, 'place' => $place, 'undo' => $undo];
}

/* ═════════ 🧠 « Aider l'IA » : ce que la base sait déjà des personnes reliées à l'acte (maquette docs/design/transcription-versions-contexte.html, 3) ═════════
 * Des indices courts, jamais imposés : cochés au départ pour l'événement principal (mariage connu), les façons d'écrire les noms et les lieux ;
 * décochés pour le reste (parents, métiers). Rien n'est écrit dans la base. */
function act_ai_hints(PDO $pdo, array $d): array
{
    $ids = array_values(array_unique(array_filter(array_map('safe_int', array_slice(is_array($d['person_ids'] ?? null) ? $d['person_ids'] : [], 0, 30)), static fn($v) => $v > 0)));
    $place = mb_substr(trim(safe_text(is_scalar($d['place'] ?? '') ? (string) ($d['place'] ?? '') : '')), 0, 160);
    $hints = [];
    $add = static function (string $key, string $icon, string $label, array $parts, bool $on) use (&$hints): void {
        $parts = array_values(array_unique(array_filter(array_map(static fn($x) => trim((string) $x), $parts), static fn($x) => $x !== '')));
        if ($parts) { $hints[] = ['key' => $key, 'icon' => $icon, 'label' => $label, 'text' => mb_substr(implode(' · ', $parts), 0, 230), 'on' => $on]; }
    };
    $nameOf = static function (int $pid) use ($pdo): string { static $c = []; if (!isset($c[$pid])) { $s = $pdo->prepare('SELECT first_name, last_name FROM persons WHERE id=?'); $s->execute([$pid]); $r = $s->fetch(PDO::FETCH_ASSOC); $c[$pid] = $r ? trim($r['first_name'] . ' ' . mb_strtoupper((string) $r['last_name'])) : ''; } return $c[$pid]; };
    $placeName = static function ($id) use ($pdo): string { if (!$id) { return ''; } $s = $pdo->prepare('SELECT name FROM places WHERE id=?'); $s->execute([(int) $id]); return (string) $s->fetchColumn(); };
    $places = $place !== '' ? [$place] : [];
    if ($ids) {
        $in = implode(',', $ids);
        // 💍 les mariages connus (le couple, l'année, le lieu)
        $mar = [];
        foreach ($pdo->query("SELECT id, partner1_id, partner2_id FROM families WHERE partner1_id IN ($in) OR partner2_id IN ($in) LIMIT 12")->fetchAll(PDO::FETCH_ASSOC) as $f) {
            if (!$f['partner1_id'] || !$f['partner2_id']) { continue; }
            $e = $pdo->prepare("SELECT e.year, e.date_text, e.place_id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.family_id=? AND t.gedcom_tag='MARR' ORDER BY e.id LIMIT 1"); $e->execute([(int) $f['id']]); $ev = $e->fetch(PDO::FETCH_ASSOC) ?: [];
            $pl = $placeName($ev['place_id'] ?? 0); if ($pl !== '') { $places[] = $pl; }
            $mar[] = implode(', ', array_filter([$nameOf((int) $f['partner1_id']) . ' × ' . $nameOf((int) $f['partner2_id']), (string) ($ev['year'] ?? '') ?: (string) ($ev['date_text'] ?? ''), $pl]));
        }
        $add('marriage', '💍', 'mariage connu', $mar, true);
        // ✍ les façons d'écrire les noms : le nom de la fiche (MAZAUD, Mazaud) et ses variantes (Mazaut)
        $forms = [];
        foreach ($pdo->query("SELECT DISTINCT last_name FROM persons WHERE id IN ($in) AND trim(last_name)<>''")->fetchAll(PDO::FETCH_COLUMN) as $ln) {
            $ln = trim((string) $ln); $f = [mb_strtoupper($ln), mb_convert_case(mb_strtolower($ln), MB_CASE_TITLE)];
            $v = $pdo->prepare("SELECT DISTINCT trim(nv.last_name) FROM name_variants nv JOIN persons p ON p.id=nv.person_id WHERE p.id IN ($in) AND p.last_name=? AND trim(nv.last_name)<>'' LIMIT 8"); $v->execute([$ln]);
            foreach ($v->fetchAll(PDO::FETCH_COLUMN) as $x) { $f[] = (string) $x; }
            $forms[] = implode(', ', array_values(array_unique($f)));
        }
        $add('names', '✍', 'façons d’écrire', $forms, true);
        // 📍 les lieux de leurs événements
        foreach ($pdo->query("SELECT DISTINCT p.name FROM events e JOIN places p ON p.id=e.place_id WHERE (e.person_id IN ($in) OR e.family_id IN (SELECT id FROM families WHERE partner1_id IN ($in) OR partner2_id IN ($in))) AND trim(p.name)<>'' LIMIT 10")->fetchAll(PDO::FETCH_COLUMN) as $pl) { $places[] = (string) $pl; }
        // 👪 les parents ; 🧑‍🌾 les métiers (décochés au départ)
        $par = [];
        foreach ($ids as $pid) {
            $s = $pdo->prepare('SELECT f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=? LIMIT 1'); $s->execute([$pid]); $f = $s->fetch(PDO::FETCH_ASSOC);
            if ($f) { $pp = array_filter([$f['partner1_id'] ? $nameOf((int) $f['partner1_id']) : '', $f['partner2_id'] ? $nameOf((int) $f['partner2_id']) : '']); if ($pp) { $par[] = 'de ' . $nameOf($pid) . ' : ' . implode(' et ', $pp); } }
        }
        $add('parents', '👪', 'parents', $par, false);
        $jobs = [];
        foreach ($pdo->query("SELECT e.person_id, e.description FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IN ($in) AND t.gedcom_tag='OCCU' AND trim(e.description)<>'' LIMIT 10")->fetchAll(PDO::FETCH_ASSOC) as $j) { $jobs[] = $nameOf((int) $j['person_id']) . ', ' . mb_substr((string) $j['description'], 0, 60); }
        $add('jobs', '🧑‍🌾', 'métiers', $jobs, false);
    }
    $add('places', '📍', 'lieux', array_slice(array_values(array_unique($places)), 0, 8), true);
    // l'ordre de la maquette : mariage, noms, lieux, puis le reste
    $rank = ['marriage' => 0, 'names' => 1, 'places' => 2, 'parents' => 3, 'jobs' => 4];
    usort($hints, static fn($a, $b) => $rank[$a['key']] <=> $rank[$b['key']]);
    return ['hints' => $hints];
}
