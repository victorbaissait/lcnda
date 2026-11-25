<?php
declare(strict_types=1);
/**
 * 🖥 Le serveur d'IA locale : Ollama (conseillé, par défaut), Unsloth (Unsloth Studio / Desktop) ou un autre serveur
 * « compatible OpenAI » (LM Studio, llama.cpp, Jan…). Toujours SUR CET ORDINATEUR : la même règle d'adresse que la lecture
 * approfondie (tx_deep_url_ok : 127.0.0.1, localhost ou ::1, en http, sans chemin) — rien ne part sur Internet.
 *
 * Toutes les fonctions d'IA (🔍 lecture approfondie avec image, 🧠 Aider l'IA, 🔍 Repérer avec l'IA, traduction, 🤖 assistant,
 * généalogiste, récit…) passent par tx_deep_http (lib/transcription_actes.php), qui parle l'API d'Ollama. Quand un serveur
 * compatible OpenAI est choisi, tx_deep_http passe la main ici (ia_srv_http) : la demande « à la Ollama » est traduite vers
 * /v1/models et /v1/chat/completions (images en « data: URL » base64 dans les parties du message, flux SSE), et la réponse
 * est rendue « à la Ollama ». Avec Ollama, rien ne change : le chemin d'origine reste tel quel.
 *
 * Réglage : SHARED_DATA_DIR/genealogie-ia-serveur.json (propre à l'ordinateur, pas à la base ni aux sauvegardes) :
 *   {kind: ollama|unsloth|openai, url, key?}. La clé (facultative, ex. « sk-unsloth-… » d'Unsloth Studio) n'est jamais
 *   renvoyée au navigateur et ne part que vers l'adresse locale choisie. Sans réglage : Ollama, LCNDA_OLLAMA_URL ou 127.0.0.1:11434.
 *
 *  GET  ia_srv_get                       → le réglage (sans la clé), les choix, les ports connus
 *  POST ia_srv_save {kind, url, key?, keep_key?} · ia_srv_test {kind, url, key?} → {ok, models, error} · ia_srv_detect → {found}
 * Essai : tests/test-ia-unsloth.js (faux serveur compatible OpenAI).
 */

require_once __DIR__ . '/paths.php';

/** les trois choix ; « api » : la langue parlée (ollama : /api/… ; openai : /v1/…) */
const IA_SRV_KINDS = [
    'ollama' => ['label' => 'Ollama', 'url' => 'http://127.0.0.1:11434', 'api' => 'ollama', 'site' => 'https://ollama.com/download'],
    'unsloth' => ['label' => 'Unsloth', 'url' => 'http://127.0.0.1:8888', 'api' => 'openai', 'site' => 'https://github.com/unslothai/unsloth'],
    'openai' => ['label' => 'Serveur compatible OpenAI', 'url' => 'http://127.0.0.1:1234', 'api' => 'openai', 'site' => ''],
];
/** « 🔎 Chercher sur cet ordinateur » : les ports habituels (Ollama, Unsloth Studio, LM Studio, llama.cpp, Jan) */
const IA_SRV_PROBES = [
    ['kind' => 'ollama', 'port' => 11434, 'name' => 'Ollama'],
    ['kind' => 'unsloth', 'port' => 8888, 'name' => 'Unsloth'],
    ['kind' => 'openai', 'port' => 1234, 'name' => 'LM Studio'],
    ['kind' => 'openai', 'port' => 8080, 'name' => 'llama.cpp'],
    ['kind' => 'openai', 'port' => 1337, 'name' => 'Jan'],
];

function ia_srv_file(): string { return SHARED_DATA_DIR . '/genealogie-ia-serveur.json'; }

/** une clé d'API locale acceptable (lettres, chiffres, « - _ . ») */
function ia_srv_key_ok(string $k): bool { return (bool) preg_match('/^[A-Za-z0-9._-]{1,200}$/', $k); }

/** l'adresse est-elle sur cet ordinateur ? (la règle de la lecture approfondie, une seule pour toute l'app) */
function ia_srv_url_ok(string $url): bool
{
    if (!function_exists('tx_deep_url_ok')) { require_once __DIR__ . '/transcription_actes.php'; }
    return tx_deep_url_ok($url);
}

/** le réglage en cours : {kind, url, key, saved} ; $reload pour relire le fichier */
function ia_srv_config(bool $reload = false): array
{
    static $cache = null;
    if ($cache !== null && !$reload) { return $cache; }
    $env = (string) getenv('LCNDA_OLLAMA_URL');
    $cfg = ['kind' => 'ollama', 'url' => $env !== '' ? $env : IA_SRV_KINDS['ollama']['url'], 'key' => '', 'saved' => false];
    $j = is_file(ia_srv_file()) ? json_decode((string) @file_get_contents(ia_srv_file()), true) : null;
    if (is_array($j) && isset(IA_SRV_KINDS[(string) ($j['kind'] ?? '')])) {
        $kind = (string) $j['kind'];
        $url = is_string($j['url'] ?? null) && $j['url'] !== '' ? (string) $j['url'] : IA_SRV_KINDS[$kind]['url'];
        $key = is_string($j['key'] ?? null) && ia_srv_key_ok((string) $j['key']) ? (string) $j['key'] : '';
        // Ollama sans adresse choisie : LCNDA_OLLAMA_URL garde la main (comme avant)
        if ($kind === 'ollama' && empty($j['url']) && $env !== '') { $url = $env; }
        $cfg = ['kind' => $kind, 'url' => $url, 'key' => $kind === 'ollama' ? '' : $key, 'saved' => true];
    }
    return $cache = $cfg;
}

/** l'adresse du serveur (tx_deep_base l'emploie quand on ne lui en donne pas) */
function ia_srv_url(): string { return ia_srv_config()['url']; }

/** vrai quand le serveur choisi parle l'API « compatible OpenAI » (sinon : le chemin Ollama d'origine) */
function ia_srv_is_openai(): bool { return IA_SRV_KINDS[ia_srv_config()['kind']]['api'] === 'openai'; }

/** ce que voit le navigateur (jamais la clé) */
function ia_srv_public(): array
{
    $c = ia_srv_config();
    return ['kind' => $c['kind'], 'url' => $c['url'], 'has_key' => $c['key'] !== '', 'saved' => $c['saved'], 'label' => IA_SRV_KINDS[$c['kind']]['label'],
        'api' => IA_SRV_KINDS[$c['kind']]['api'], 'site' => IA_SRV_KINDS[$c['kind']]['site'],
        'kinds' => array_map(static fn($k) => ['label' => $k['label'], 'url' => $k['url'], 'api' => $k['api']], IA_SRV_KINDS), 'probes' => IA_SRV_PROBES];
}

/** l'adresse ramenée à l'IP de l'ordinateur (jamais un nom résolu ailleurs), ou une exception claire */
function ia_srv_base(string $url): string
{
    if (!ia_srv_url_ok($url)) { throw new LcndaBadInput(i18n_tx('L’IA ne parle qu’à un serveur sur cet ordinateur (127.0.0.1, localhost ou ::1, en http://, sans chemin) : adresse refusée.')); }
    return tx_deep_base($url);
}

/** i18n_t quand l'app est chargée (le programme de lecture en arrière-plan ne l'a pas) */
function i18n_tx(string $s, array $v = []): string
{
    if (function_exists('i18n_t')) { return i18n_t($s, $v); }
    foreach ($v as $k => $x) { $s = str_replace('{' . $k . '}', (string) $x, $s); }
    return $s;
}

function ia_srv_save(array $d): array
{
    $kind = (string) ($d['kind'] ?? '');
    if (!isset(IA_SRV_KINDS[$kind])) { throw new LcndaBadInput(i18n_tx('Serveur d’IA inconnu.')); }
    $url = trim((string) ($d['url'] ?? '')); if ($url === '') { $url = IA_SRV_KINDS[$kind]['url']; }
    $url = rtrim($url, '/');
    ia_srv_base($url); // refusée si ce n'est pas sur cet ordinateur
    $old = ia_srv_config(true);
    $key = trim((string) ($d['key'] ?? ''));
    if ($key === '' && !empty($d['keep_key']) && $old['kind'] !== 'ollama') { $key = $old['key']; }
    if ($key !== '' && !ia_srv_key_ok($key)) { throw new LcndaBadInput(i18n_tx('Clé d’API illisible (lettres, chiffres, « - _ . » seulement).')); }
    $j = ['kind' => $kind, 'url' => $url] + ($kind !== 'ollama' && $key !== '' ? ['key' => $key] : []);
    $f = ia_srv_file();
    if (!is_dir(dirname($f))) { @mkdir(dirname($f), 0700, true); }
    if (@file_put_contents($f . '.tmp', json_encode($j, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT)) === false || !@rename($f . '.tmp', $f)) { throw new RuntimeException(i18n_tx('Écriture impossible dans le dossier des données.')); }
    @chmod($f, 0600);
    ia_srv_config(true);
    return ia_srv_public() + ['before' => ['kind' => $old['kind'], 'url' => $old['url'], 'saved' => $old['saved']]];
}

/** ↶ : revenir au réglage d'avant (ou à « rien de choisi » : Ollama par défaut) */
function ia_srv_reset(): array { @unlink(ia_srv_file()); ia_srv_config(true); return ia_srv_public(); }

/* ═════════ le transport : une demande HTTP vers l'adresse locale vérifiée, sans proxy ni redirection ═════════ */

/**
 * $onData reçoit chaque morceau reçu (pour le flux) et peut renvoyer false pour arrêter.
 * Rend {ok, code, raw, error?: 'unreachable', stopped}
 */
function ia_srv_curl(string $base, string $method, string $path, ?array $body, int $timeout, string $key = '', ?callable $onData = null, int $connect = 3): array
{
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_tx('L’IA locale a besoin de l’extension cURL de PHP.')); }
    if (!ia_srv_url_ok($base)) { throw new LcndaBadInput(i18n_tx('Adresse refusée.')); }
    $ch = curl_init($base . $path);
    $raw = '';
    $h = ['Content-Type: application/json', 'Accept: application/json, text/event-stream'];
    if ($key !== '') { $h[] = 'Authorization: Bearer ' . $key; }
    $opts = [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROXY => '', CURLOPT_NOPROXY => '*', CURLOPT_CONNECTTIMEOUT => $connect, CURLOPT_TIMEOUT => $timeout,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP, CURLOPT_HTTPHEADER => $h];
    if ($body !== null) { $opts[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }
    $opts[CURLOPT_WRITEFUNCTION] = static function ($c, string $chunk) use (&$raw, $onData): int {
        if (strlen($raw) < 4 * 1024 * 1024) { $raw .= $chunk; }
        if ($onData && $onData($chunk, (int) curl_getinfo($c, CURLINFO_RESPONSE_CODE)) === false) { return 0; }
        return strlen($chunk);
    };
    curl_setopt_array($ch, $opts);
    $ok = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_errno($ch);
    curl_close($ch);
    if ($ok === false && $err !== CURLE_WRITE_ERROR) { return ['ok' => false, 'code' => $code, 'raw' => '', 'error' => 'unreachable', 'stopped' => false]; }
    return ['ok' => $code >= 200 && $code < 300, 'code' => $code, 'raw' => $raw, 'stopped' => $err === CURLE_WRITE_ERROR];
}

/** le message d'erreur d'un serveur compatible OpenAI ({error: {message}}, {error: "…"}, {detail: …}), en clair */
function ia_srv_error_text(array $r): string
{
    if (($r['error'] ?? '') === 'unreachable') { return 'unreachable'; }
    $j = json_decode((string) ($r['raw'] ?? ''), true);
    $m = '';
    if (is_array($j)) {
        $e = $j['error'] ?? $j['detail'] ?? $j['message'] ?? '';
        if (is_array($e)) { $e = $e['message'] ?? $e['msg'] ?? ($e[0]['msg'] ?? json_encode($e, JSON_UNESCAPED_UNICODE)); }
        $m = is_scalar($e) ? (string) $e : '';
    }
    $code = (int) ($r['code'] ?? 0);
    if ($code === 401 || $code === 403) {
        return i18n_tx('Le serveur demande une clé d’API (HTTP {c}) : crée une clé dans ses réglages (Unsloth : « sk-unsloth-… ») et colle-la ici, ou autorise l’accès sans clé.', ['c' => $code]) . ($m !== '' ? ' — ' . mb_substr($m, 0, 160) : '');
    }
    return mb_substr($m !== '' ? $m : i18n_tx('Le serveur a répondu {c}.', ['c' => $code]), 0, 300);
}

/* ═════════ les noms de modèles : ceux du serveur ↔ ceux de la liste conseillée (noms d'Ollama) ═════════ */

/**
 * Un nom de modèle ramené à l'essentiel, pour reconnaître « unsloth/Qwen3-VL-8B-Instruct-GGUF » (ou « qwen3-vl-8b-instruct »,
 * « Qwen3-VL-8B-Instruct-UD-Q4_K_XL.gguf ») comme le « qwen3-vl:8b-instruct » de la liste : sans dossier, format, quantification,
 * « instruct » / « it », ni date de version.
 */
function ia_srv_model_key(string $name): string
{
    $n = strtolower($name);
    $n = (string) preg_replace('~^.*/~', '', $n); // « unsloth/… », « qwen/… »
    $n = (string) preg_replace('/\.gguf$/', '', $n);
    $drop = '/^(gguf|mlx|instruct|it|ud|i?q\d+|k|m|s|l|xl|xs|xxs|bf16|f16|f32|fp16|fp8|\d+bit|awq|gptq|latest|dynamic|2[0-9]{3})$/';
    $parts = array_filter(preg_split('/[-_.:\s]+/', $n) ?: [], static fn($p) => $p !== '' && !preg_match($drop, $p));
    return implode('', $parts);
}

/** la liste du serveur (/v1/models) : [ids] */
function ia_srv_openai_models(string $base, string $key, int $timeout = 5): array
{
    $r = ia_srv_curl($base, 'GET', '/v1/models', null, $timeout, $key);
    if (!$r['ok']) { return ['ok' => false, 'r' => $r, 'ids' => []]; }
    $j = json_decode($r['raw'], true);
    $ids = [];
    foreach ((array) (is_array($j) ? ($j['data'] ?? $j['models'] ?? []) : []) as $m) {
        $id = is_array($m) ? (string) ($m['id'] ?? $m['name'] ?? '') : (is_string($m) ? $m : '');
        if ($id !== '' && mb_strlen($id) <= 200 && !preg_match('/[\x00-\x1F]/', $id)) { $ids[] = $id; }
        if (count($ids) >= 200) { break; }
    }
    return ['ok' => true, 'r' => $r, 'ids' => array_values(array_unique($ids)), 'json_ok' => is_array($j)];
}

/** les noms montrés à l'app : un modèle reconnu prend le nom de la liste conseillée, les autres gardent le leur */
function ia_srv_aliases(array $ids): array
{
    $known = defined('TX_DEEP_MODELS') ? array_column(TX_DEEP_MODELS, 'tag') : [];
    $byKey = []; foreach ($known as $t) { $byKey[ia_srv_model_key($t)] = $t; }
    $out = []; $taken = [];
    foreach ($ids as $id) {
        $k = ia_srv_model_key($id);
        $alias = isset($byKey[$k]) && !isset($taken[$byKey[$k]]) ? $byKey[$k] : $id;
        $taken[$alias] = true; $out[$id] = $alias;
    }
    return $out; // id du serveur → nom montré
}

/** le vrai nom à envoyer au serveur pour un nom montré par l'app */
function ia_srv_resolve_model(string $base, string $key, string $name): string
{
    $l = ia_srv_openai_models($base, $key, 5);
    if (!$l['ok'] || in_array($name, $l['ids'], true)) { return $name; }
    foreach (ia_srv_aliases($l['ids']) as $id => $alias) { if ($alias === $name) { return (string) $id; } }
    return $name;
}

/** sait-il lire une image ? Les serveurs compatibles OpenAI ne le disent pas : on le devine d'après le nom (Qwen-VL, Gemma 3, Pixtral…) */
function ia_srv_guess_vision(string $name): bool
{
    return (bool) preg_match('/(^|[^a-z])vl([^a-z]|$)|vl\d|vision|llava|minicpm-?v|pixtral|gemma-?[34]|moondream|smolvlm|internvl|mllama|llama-?4|mistral-small-?3\.[12]|qvq|ocr|omni/i', $name);
}

/* ═════════ la traduction « API d'Ollama » → « API compatible OpenAI » ═════════ */

/** une image base64 brute (comme Ollama la reçoit) → une data: URL */
function ia_srv_data_url(string $b64): string
{
    $b64 = trim($b64);
    if (str_starts_with($b64, 'data:')) { return $b64; }
    $mime = str_starts_with($b64, 'iVBOR') ? 'image/png' : (str_starts_with($b64, 'R0lG') ? 'image/gif' : (str_starts_with($b64, 'UklG') ? 'image/webp' : 'image/jpeg'));
    return 'data:' . $mime . ';base64,' . $b64;
}

/** les messages d'Ollama → ceux d'OpenAI : images en parties « image_url », appels d'outils avec un identifiant, réponses d'outil reliées */
function ia_srv_openai_messages(array $msgs): array
{
    $out = []; $pending = []; $n = 0;
    foreach ($msgs as $m) {
        if (!is_array($m)) { continue; }
        $role = (string) ($m['role'] ?? 'user');
        $content = $m['content'] ?? '';
        $o = ['role' => $role];
        if (!empty($m['images']) && is_array($m['images'])) {
            $parts = [['type' => 'text', 'text' => (string) $content]];
            foreach ($m['images'] as $img) { if (is_string($img) && $img !== '') { $parts[] = ['type' => 'image_url', 'image_url' => ['url' => ia_srv_data_url($img)]]; } }
            $o['content'] = $parts;
        } else { $o['content'] = is_string($content) ? $content : json_encode($content, JSON_UNESCAPED_UNICODE); }
        if ($role === 'assistant' && !empty($m['tool_calls']) && is_array($m['tool_calls'])) {
            $pending = []; $calls = [];
            foreach ($m['tool_calls'] as $tc) {
                $fn = is_array($tc['function'] ?? null) ? $tc['function'] : [];
                $id = is_string($tc['id'] ?? null) && $tc['id'] !== '' ? $tc['id'] : 'call_' . (++$n);
                $args = $fn['arguments'] ?? [];
                $calls[] = ['id' => $id, 'type' => 'function', 'function' => ['name' => (string) ($fn['name'] ?? ''), 'arguments' => is_string($args) ? $args : json_encode($args ?: new stdClass(), JSON_UNESCAPED_UNICODE)]];
                $pending[] = [$id, (string) ($fn['name'] ?? '')];
            }
            $o['tool_calls'] = $calls;
        }
        if ($role === 'tool') {
            $want = (string) ($m['tool_name'] ?? '');
            $i = 0; foreach ($pending as $j => [$pid, $pname]) { if ($want === '' || $pname === $want) { $i = $j; break; } }
            $o['tool_call_id'] = (string) ($m['tool_call_id'] ?? ($pending[$i][0] ?? 'call_0'));
            if ($pending) { array_splice($pending, $i, 1); }
        }
        $out[] = $o;
    }
    return $out;
}

/** le corps d'une demande /api/chat d'Ollama → celui de /v1/chat/completions */
function ia_srv_openai_chat_body(array $body, string $model): array
{
    $o = ['model' => $model, 'messages' => ia_srv_openai_messages((array) ($body['messages'] ?? [])), 'stream' => !empty($body['stream'])];
    $opt = is_array($body['options'] ?? null) ? $body['options'] : [];
    if (isset($opt['temperature'])) { $o['temperature'] = (float) $opt['temperature']; }
    if (isset($opt['num_predict'])) { $o['max_tokens'] = (int) $opt['num_predict']; }
    if (!empty($body['tools']) && is_array($body['tools'])) { $o['tools'] = $body['tools']; }
    if ($o['stream']) { $o['stream_options'] = ['include_usage' => true]; }
    // « think », « keep_alive », « num_ctx », « format » : propres à Ollama, pas envoyés (la consigne demande déjà le JSON)
    return $o;
}

/** la réponse (non en flux) d'OpenAI → celle d'Ollama */
function ia_srv_ollama_message(array $j): array
{
    $c = is_array($j['choices'][0] ?? null) ? $j['choices'][0] : [];
    $m = is_array($c['message'] ?? null) ? $c['message'] : [];
    $msg = ['role' => 'assistant', 'content' => is_string($m['content'] ?? null) ? $m['content'] : ''];
    $th = $m['reasoning_content'] ?? $m['reasoning'] ?? null; if (is_string($th) && $th !== '') { $msg['thinking'] = $th; }
    if (!empty($m['tool_calls']) && is_array($m['tool_calls'])) { $msg['tool_calls'] = array_values(array_filter($m['tool_calls'], 'is_array')); }
    return ['model' => (string) ($j['model'] ?? ''), 'message' => $msg, 'done' => true, 'done_reason' => (string) ($c['finish_reason'] ?? 'stop')]
        + (isset($j['usage']['prompt_tokens']) ? ['prompt_eval_count' => (int) $j['usage']['prompt_tokens'], 'eval_count' => (int) ($j['usage']['completion_tokens'] ?? 0)] : []);
}

/**
 * tx_deep_http, version « compatible OpenAI » : mêmes arguments, même forme de réponse que pour Ollama.
 * /api/version, /api/tags, /api/show, /api/chat (avec ou sans flux) ; /api/pull est refusé avec une phrase claire.
 */
function ia_srv_http(string $method, string $path, ?array $body = null, int $timeout = 5, ?callable $onLine = null, ?string $base = null): array
{
    $cfg = ia_srv_config();
    $base = tx_deep_base($base);
    $key = $cfg['key'];
    $label = IA_SRV_KINDS[$cfg['kind']]['label'];
    $fail = static function (array $r): array {
        if (($r['error'] ?? '') === 'unreachable') { return ['ok' => false, 'code' => 0, 'error' => 'unreachable']; }
        return ['ok' => false, 'code' => (int) $r['code'], 'json' => ['error' => ia_srv_error_text($r)], 'stopped' => false];
    };
    if ($path === '/api/version') {
        $l = ia_srv_openai_models($base, $key, $timeout);
        if (!$l['ok']) { return $fail($l['r']); }
        if (empty($l['json_ok'])) { return ['ok' => false, 'code' => (int) $l['r']['code'], 'json' => ['error' => i18n_tx('Ce n’est pas un serveur d’IA compatible OpenAI.')]]; }
        return ['ok' => true, 'code' => 200, 'json' => ['version' => $label . ' (compatible OpenAI)'], 'stopped' => false];
    }
    if ($path === '/api/tags') {
        $l = ia_srv_openai_models($base, $key, $timeout);
        if (!$l['ok']) { return $fail($l['r']); }
        $models = []; foreach (ia_srv_aliases($l['ids']) as $id => $alias) { $models[] = ['name' => $alias, 'model' => $alias, 'server_id' => (string) $id]; }
        return ['ok' => true, 'code' => 200, 'json' => ['models' => $models], 'stopped' => false];
    }
    if ($path === '/api/show') {
        $name = (string) ($body['model'] ?? '');
        $real = ia_srv_resolve_model($base, $key, $name);
        $caps = ['completion'];
        if (ia_srv_guess_vision($real) || ia_srv_guess_vision($name)) { $caps[] = 'vision'; }
        if ($cfg['kind'] === 'unsloth') { $caps[] = 'tools'; } // Unsloth Studio annonce l'appel d'outils ; les autres : l'app essaie, puis passe au JSON
        return ['ok' => true, 'code' => 200, 'json' => ['capabilities' => $caps], 'stopped' => false];
    }
    if ($path === '/api/pull') {
        $msg = i18n_tx('Avec {s}, le modèle se télécharge dans sa propre application (pas depuis LCNDA) : choisis-le et lance-le là-bas, puis « ↻ Tester la connexion ».', ['s' => $label]);
        if ($onLine) { $onLine(['error' => $msg]); }
        return ['ok' => false, 'code' => 501, 'json' => ['error' => $msg], 'stopped' => false];
    }
    if ($path !== '/api/chat' || $body === null) { return ['ok' => false, 'code' => 404, 'json' => ['error' => i18n_tx('Demande inconnue pour ce serveur.')], 'stopped' => false]; }

    $model = ia_srv_resolve_model($base, $key, (string) ($body['model'] ?? ''));
    $o = ia_srv_openai_chat_body($body, $model);
    $hasTools = !empty($o['tools']);
    $toolsErr = static function (array $res) use ($hasTools): array { // l'assistant passe alors au protocole JSON (« does not support tools »)
        if ($hasTools && !$res['ok'] && ($res['code'] ?? 0) >= 400 && !in_array((int) $res['code'], [401, 403], true)) {
            $res['json']['error'] = 'does not support tools — ' . (string) ($res['json']['error'] ?? '');
        }
        return $res;
    };
    if (!$o['stream'] || !$onLine) {
        $o['stream'] = false; unset($o['stream_options']);
        $r = ia_srv_curl($base, 'POST', '/v1/chat/completions', $o, $timeout, $key);
        if (!$r['ok']) { return $toolsErr($fail($r)); }
        $j = json_decode($r['raw'], true);
        if (!is_array($j) || !isset($j['choices'])) { return ['ok' => false, 'code' => (int) $r['code'], 'json' => ['error' => i18n_tx('Réponse illisible du serveur d’IA.')], 'stopped' => false]; }
        $msg = ia_srv_ollama_message($j);
        if ($onLine) { $onLine($msg); return ['ok' => true, 'code' => 200, 'json' => [], 'stopped' => false]; }
        return ['ok' => true, 'code' => 200, 'json' => $msg, 'stopped' => false];
    }
    // en flux : des lignes « data: {…} » (SSE), traduites en lignes d'Ollama pour $onLine
    $buf = ''; $done = false; $reason = ''; $usage = null; $stopped = false;
    $r = ia_srv_curl($base, 'POST', '/v1/chat/completions', $o, $timeout, $key, static function (string $chunk, int $code) use (&$buf, &$done, &$reason, &$usage, &$stopped, $onLine) {
        if ($code >= 300) { return true; } // une erreur : lue en entier après
        $buf .= $chunk;
        while (($nl = strpos($buf, "\n")) !== false) {
            $line = trim(substr($buf, 0, $nl)); $buf = substr($buf, $nl + 1);
            if ($line === '' || !str_starts_with($line, 'data:')) { continue; }
            $data = trim(substr($line, 5));
            if ($data === '[DONE]') { $done = true; continue; }
            $j = json_decode($data, true); if (!is_array($j)) { continue; }
            if (!empty($j['error'])) { $e = $j['error']; $stopped = true; $onLine(['error' => mb_substr(is_array($e) ? (string) ($e['message'] ?? '') : (string) $e, 0, 300)]); return false; }
            if (isset($j['usage']['prompt_tokens'])) { $usage = $j['usage']; }
            $c = is_array($j['choices'][0] ?? null) ? $j['choices'][0] : null; if (!$c) { continue; }
            $d = is_array($c['delta'] ?? null) ? $c['delta'] : [];
            if (!empty($c['finish_reason'])) { $reason = (string) $c['finish_reason']; }
            $line = ['message' => ['role' => 'assistant', 'content' => is_string($d['content'] ?? null) ? $d['content'] : ''], 'done' => false];
            $th = $d['reasoning_content'] ?? $d['reasoning'] ?? null; if (is_string($th) && $th !== '') { $line['message']['thinking'] = $th; }
            if ($line['message']['content'] === '' && !isset($line['message']['thinking'])) { continue; }
            if ($onLine($line) === false) { $stopped = true; return false; }
        }
        return true;
    });
    if (!$r['ok'] && !$r['stopped']) { $res = $fail($r); if (isset($res['json']['error'])) { $onLine(['error' => $res['json']['error']]); } return $res; }
    if (!$stopped) {
        $last = ['message' => ['role' => 'assistant', 'content' => ''], 'done' => true, 'done_reason' => $reason !== '' ? $reason : 'stop'];
        if (is_array($usage)) { $last['prompt_eval_count'] = (int) ($usage['prompt_tokens'] ?? 0); $last['eval_count'] = (int) ($usage['completion_tokens'] ?? 0); }
        $onLine($last);
    }
    return ['ok' => true, 'code' => (int) $r['code'], 'json' => [], 'stopped' => $stopped];
}

/* ═════════ Réglages → 🤖 IA : tester, chercher ═════════ */

/** « ↻ Tester la connexion » : le serveur répond-il, et quels modèles a-t-il ? (sans rien enregistrer) */
function ia_srv_test(array $d): array
{
    $kind = (string) ($d['kind'] ?? 'ollama'); if (!isset(IA_SRV_KINDS[$kind])) { throw new LcndaBadInput(i18n_tx('Serveur d’IA inconnu.')); }
    $url = rtrim(trim((string) ($d['url'] ?? '')), '/'); if ($url === '') { $url = IA_SRV_KINDS[$kind]['url']; }
    $base = ia_srv_base($url);
    $key = trim((string) ($d['key'] ?? ''));
    if ($key === '' && $kind !== 'ollama') { $cur = ia_srv_config(); if ($cur['kind'] === $kind) { $key = $cur['key']; } }
    if ($key !== '' && !ia_srv_key_ok($key)) { throw new LcndaBadInput(i18n_tx('Clé d’API illisible (lettres, chiffres, « - _ . » seulement).')); }
    return ia_srv_probe($kind, $base, $key, 5, 3);
}

/** une sonde : {ok, kind, url, version, models: [{id, name, vision}], error} */
function ia_srv_probe(string $kind, string $base, string $key, int $timeout, int $connect): array
{
    $out = ['ok' => false, 'kind' => $kind, 'url' => $base, 'version' => '', 'models' => [], 'error' => '', 'needs_key' => false];
    if (IA_SRV_KINDS[$kind]['api'] === 'ollama') {
        $v = ia_srv_curl($base, 'GET', '/api/version', null, $timeout, '', null, $connect);
        $j = json_decode((string) $v['raw'], true);
        if (!$v['ok'] || !is_array($j) || !isset($j['version'])) { $out['error'] = ($v['error'] ?? '') === 'unreachable' ? 'unreachable' : i18n_tx('Ce n’est pas Ollama (pas de réponse à /api/version).'); return $out; }
        $out['version'] = mb_substr((string) $j['version'], 0, 40);
        $t = ia_srv_curl($base, 'GET', '/api/tags', null, $timeout, '', null, $connect);
        $tj = json_decode((string) $t['raw'], true);
        foreach ((array) (is_array($tj) ? ($tj['models'] ?? []) : []) as $m) { if (is_array($m) && ($n = (string) ($m['name'] ?? $m['model'] ?? '')) !== '') { $out['models'][] = ['id' => $n, 'name' => $n, 'vision' => null]; } }
        $out['ok'] = true; return $out;
    }
    $r = ia_srv_curl($base, 'GET', '/v1/models', null, $timeout, $key, null, $connect);
    $j = json_decode((string) $r['raw'], true);
    if (!$r['ok']) {
        $out['error'] = ia_srv_error_text($r);
        $out['needs_key'] = in_array((int) $r['code'], [401, 403], true) && is_array($j); // un vrai serveur d'IA, qui veut une clé
        return $out;
    }
    if (!is_array($j) || !(isset($j['data']) || isset($j['models']))) { $out['error'] = i18n_tx('Ce n’est pas un serveur d’IA compatible OpenAI (pas de liste à /v1/models).'); return $out; }
    $ids = [];
    foreach ((array) ($j['data'] ?? $j['models'] ?? []) as $m) { $id = is_array($m) ? (string) ($m['id'] ?? $m['name'] ?? '') : (is_string($m) ? $m : ''); if ($id !== '' && mb_strlen($id) <= 200 && !preg_match('/[\x00-\x1F]/', $id) && count($ids) < 200) { $ids[] = $id; } }
    foreach (ia_srv_aliases(array_values(array_unique($ids))) as $id => $alias) { $out['models'][] = ['id' => (string) $id, 'name' => (string) $alias, 'vision' => ia_srv_guess_vision((string) $id)]; }
    $out['ok'] = true; $out['version'] = IA_SRV_KINDS[$kind]['label'];
    return $out;
}

/** « 🔎 Chercher sur cet ordinateur » : les ports habituels, essayés vite (127.0.0.1 seulement) */
function ia_srv_detect(array $d = []): array
{
    $ports = IA_SRV_PROBES;
    // essais : LCNDA_IA_PROBE_PORTS="ollama:1234,unsloth:5678" remplace la liste (jamais une autre machine)
    $env = (string) getenv('LCNDA_IA_PROBE_PORTS');
    if ($env !== '') {
        $ports = [];
        foreach (explode(',', $env) as $p) { [$k, $n] = array_pad(explode(':', trim($p)), 2, ''); if (isset(IA_SRV_KINDS[$k]) && (int) $n > 0 && (int) $n < 65536) { $ports[] = ['kind' => $k, 'port' => (int) $n, 'name' => IA_SRV_KINDS[$k]['label']]; } }
    }
    $cur = ia_srv_config();
    $found = [];
    foreach ($ports as $p) {
        $base = 'http://127.0.0.1:' . (int) $p['port'];
        $key = $cur['kind'] === $p['kind'] ? $cur['key'] : '';
        $r = ia_srv_probe($p['kind'], $base, $key, 3, 1);
        if ($r['ok'] || $r['needs_key']) { $found[] = ['kind' => $p['kind'], 'name' => $p['name'], 'url' => $base, 'ok' => $r['ok'], 'needs_key' => $r['needs_key'], 'models' => count($r['models']), 'error' => $r['ok'] ? '' : $r['error']]; }
    }
    return ['found' => $found, 'tried' => array_map(static fn($p) => $p['name'] . ' :' . $p['port'], $ports)];
}

const IA_SRV_ACTIONS = ['ia_srv_get', 'ia_srv_save', 'ia_srv_reset', 'ia_srv_test', 'ia_srv_detect'];

/** api.php : rien n'est écrit dans la base */
function ia_srv_dispatch(string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite && $action === 'ia_srv_get') { json_response(ia_srv_public()); }
        if ($isWrite && $action === 'ia_srv_save') { json_response(['ok' => true, 'result' => ia_srv_save($payload)]); }
        if ($isWrite && $action === 'ia_srv_reset') { json_response(['ok' => true, 'result' => ia_srv_reset()]); }
        if ($isWrite && $action === 'ia_srv_test') { json_response(['ok' => true, 'result' => ia_srv_test($payload)]); }
        if ($isWrite && $action === 'ia_srv_detect') { json_response(['ok' => true, 'result' => ia_srv_detect($payload)]); }
    } catch (Throwable $e) { json_response(['error' => readable_error_message($e)], 422); }
    json_response(['error' => 'Action inconnue'], 404);
}
