<?php
declare(strict_types=1);
/**
 * 🎓 35. Entraîner la lecture sur mes lignes relues (maquette docs/design/atelier-idees.html ; réponse 1 : le modèle choisi par registre).
 * Une ligne relue (👁 Relire ligne à ligne : data.reviewed) = sa zone sur l'image + son texte juste. Les lignes sont regroupées par
 * main (data.reg.hand, ⏭ 37) et par registre. Deux moteurs, tout sur l'ordinateur, en tâche de fond (avancée, ■ Arrêter : le meilleur
 * état est gardé), 1 ligne sur 10 mise de côté et jamais montrée pendant l'entraînement : elle mesure avant / après.
 *   kraken : « Lecture rapide » — ketos train, affiné depuis le .mlmodel installé (lib/htr_setup.php) ; marche partout, Mac compris.
 *   qwen   : « Qwen (avec Unsloth) » — LoRA du modèle de vision sur les images de lignes + texte corrigé (scripts/atelier_train_qwen.py),
 *            export pour Ollama / Unsloth ; carte graphique de 8 Go ou plus conseillée (PC) ; sur Mac : pas garanti, on le dit.
 * Rien n'est téléchargé sans un clic ; rien ne part sur Internet. Le lanceur : scripts/atelier_train.php.
 * Essais (tests/test-atelier-idees.js) : GENEALOGY_TEST=1 + LCNDA_KETOS_BIN / LCNDA_QWEN_TRAIN_BIN = un faux entraîneur (tests/fixtures/fake-trainer.php),
 * LCNDA_TEST_GPU (« nom,Mo ») et LCNDA_TEST_OS (mac, linux, windows) pour imiter l'ordinateur.
 */

require_once __DIR__ . '/htr_setup.php';
require_once __DIR__ . '/atelier_idees.php';

const ATELIER_TRAIN_MIN = 50;        // on peut essayer dès 50 lignes
const ATELIER_TRAIN_ADVISED = 150;   // conseillé
const ATELIER_QWEN_VRAM_GB = 8;
const ATELIER_QWEN_BASE = 'unsloth/Qwen2.5-VL-3B-Instruct-bnb-4bit';

function txi_train_dir(): string
{
    $d = DATA_DIR . '/atelier-train'; if (!is_dir($d)) { @mkdir($d, 0775, true); }
    return $d;
}

function txi_test_mode(): bool { return getenv('GENEALOGY_TEST') === '1'; }

function txi_os(): string
{
    $t = (string) getenv('LCNDA_TEST_OS');
    if (txi_test_mode() && in_array($t, ['mac', 'linux', 'windows'], true)) { return $t; }
    return match (PHP_OS_FAMILY) { 'Darwin' => 'mac', 'Windows' => 'windows', default => 'linux' };
}

/** une commande de l'ordinateur (sans shell), sa sortie ; '' si elle n'existe pas */
function txi_run(array $cmd, int $timeout = 8): string
{
    if (!function_exists('proc_open')) { return ''; }
    $p = @proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    if (!is_resource($p)) { return ''; }
    stream_set_blocking($pipes[1], false); $out = ''; $t0 = microtime(true);
    while (microtime(true) - $t0 < $timeout) { $out .= (string) stream_get_contents($pipes[1]); if (!proc_get_status($p)['running']) { break; } usleep(50000); }
    $out .= (string) stream_get_contents($pipes[1]); @fclose($pipes[1]); @fclose($pipes[2]);
    if (proc_get_status($p)['running']) { @proc_terminate($p); }
    @proc_close($p);
    return trim($out);
}

function txi_which(string $bin): string
{
    foreach (explode(PATH_SEPARATOR, (string) getenv('PATH')) as $d) { foreach (['', '.exe'] as $x) { $f = rtrim($d, '/\\') . DIRECTORY_SEPARATOR . $bin . $x; if ($d !== '' && @is_file($f) && @is_executable($f)) { return $f; } } }
    return '';
}

/** la carte graphique : {kind: nvidia|apple|'', name, vram_gb} */
function txi_gpu(): array
{
    $t = (string) getenv('LCNDA_TEST_GPU');
    if (txi_test_mode() && $t !== '') { if ($t === 'none') { return ['kind' => '', 'name' => '', 'vram_gb' => 0]; } [$n, $mb] = array_pad(explode(',', $t), 2, '0'); return ['kind' => stripos($n, 'apple') !== false ? 'apple' : 'nvidia', 'name' => trim($n), 'vram_gb' => round((int) $mb / 1024, 1)]; }
    if (txi_os() === 'mac') {
        $cpu = txi_run(['/usr/sbin/sysctl', '-n', 'machdep.cpu.brand_string'], 3);
        return str_contains($cpu, 'Apple') ? ['kind' => 'apple', 'name' => $cpu, 'vram_gb' => function_exists('tx_deep_ram_gb') ? tx_deep_ram_gb() : 0] : ['kind' => '', 'name' => '', 'vram_gb' => 0]; // mémoire partagée
    }
    $smi = txi_which('nvidia-smi') ?: (txi_os() === 'windows' ? 'C:\\Windows\\System32\\nvidia-smi.exe' : '');
    if ($smi === '' || !@is_file($smi)) { return ['kind' => '', 'name' => '', 'vram_gb' => 0]; }
    $o = txi_run([$smi, '--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], 6);
    $first = explode("\n", $o)[0] ?? '';
    if (!preg_match('/^(.+?),\s*(\d+)/', $first, $m)) { return ['kind' => '', 'name' => '', 'vram_gb' => 0]; }
    return ['kind' => 'nvidia', 'name' => trim($m[1]), 'vram_gb' => round((int) $m[2] / 1024, 1)];
}

/** ketos (l'outil d'entraînement de Kraken), à côté du Python installé pour la lecture rapide */
function txi_ketos(): string
{
    $f = (string) getenv('LCNDA_KETOS_BIN');
    if (txi_test_mode() && $f !== '' && is_file($f)) { return $f; }
    $py = htr_venv_python(); if (!$py) { return ''; }
    $k = dirname($py) . (htr_is_windows() ? '/ketos.exe' : '/ketos');
    return is_file($k) ? $k : '';
}

/**
 * 🦥 Unsloth : d'abord le fournisseur d'IA des réglages s'il existe (un autre outil de l'app le décrit ; on ne double pas ses réglages),
 * puis un Python où « unsloth » s'importe (vérifié à la demande, gardé dans htr/unsloth.json).
 */
function txi_unsloth(bool $probe = false): array
{
    $out = ['provider' => false, 'provider_name' => '', 'python' => '', 'installed' => false, 'checked' => ''];
    // le serveur d'IA choisi dans les réglages (lib/ia_serveur.php : Ollama, Unsloth, compatible OpenAI) : repris tel quel, jamais doublé
    if (!function_exists('ia_srv_config') && is_file(__DIR__ . '/ia_serveur.php')) { require_once __DIR__ . '/ia_serveur.php'; }
    if (function_exists('ia_srv_config')) { try { $c = ia_srv_config(); $out['provider'] = ($c['kind'] ?? '') === 'unsloth'; $out['provider_name'] = (string) (IA_SRV_KINDS[$c['kind'] ?? '']['label'] ?? ''); $out['provider_url'] = (string) ($c['url'] ?? ''); } catch (Throwable $e) {} }
    $fake = (string) getenv('LCNDA_QWEN_TRAIN_BIN');
    if (txi_test_mode() && $fake !== '' && is_file($fake)) { return ['python' => PHP_BINARY, 'installed' => true, 'checked' => 'test'] + $out; }
    $cache = htr_dir() . '/unsloth.json'; $c = htr_json_file($cache);
    if (!$probe && isset($c['installed'])) { return ['python' => (string) ($c['python'] ?? ''), 'installed' => (bool) $c['installed'], 'checked' => (string) ($c['checked'] ?? '')] + $out; }
    if (!$probe) { return $out; }
    $cands = array_values(array_unique(array_filter([$out['python'], (string) getenv('LCNDA_UNSLOTH_PYTHON'), htr_venv_python() ?? '', txi_which('python3'), txi_which('python')])));
    foreach ($cands as $py) {
        $v = txi_run([$py, '-c', 'import unsloth, torch; print("ok", unsloth.__version__, torch.cuda.is_available())'], 90);
        if (preg_match('/^ok /m', $v)) { $r = ['python' => $py, 'installed' => true, 'checked' => date('c')]; @file_put_contents($cache, json_encode($r)); return $r + $out; }
    }
    $r = ['python' => '', 'installed' => false, 'checked' => date('c')]; @file_put_contents($cache, json_encode($r));
    return $r + $out;
}

/** les modèles entraînés (communs à toutes les généalogies, comme les modèles de lecture) */
function txi_trained(): array
{
    $j = htr_json_file(htr_dir() . '/models/trained.json');
    return array_values(array_filter(is_array($j['models'] ?? null) ? $j['models'] : [], static fn($m) => is_array($m) && (($m['engine'] ?? '') === 'qwen' ? is_dir((string) ($m['dir'] ?? '')) : is_file(htr_dir() . '/models/' . basename((string) ($m['file'] ?? ''))))));
}

/** les actes et leurs lignes relues qui ont une zone : [main => {hand, lines, registers: {clé => {label, lines}}, acts}] (sans découper les images) */
function txi_reviewed_lines(PDO $pdo, ?string $onlyHand = null): array
{
    act_transcriptions_ensure($pdo);
    $groups = [];
    $st = $pdo->query("SELECT a.id, a.media_id, a.place, a.body, a.data_json, m.filename FROM act_transcriptions a LEFT JOIN media m ON m.id=a.media_id WHERE a.data_json LIKE '%\"reviewed\"%' ORDER BY a.id");
    $fileOf = $pdo->prepare("SELECT filename FROM media WHERE id=? AND media_type='image'");
    foreach ($st as $a) {
        $d = json_decode((string) $a['data_json'], true) ?: []; $set = array_flip(array_map('strval', (array) ($d['reviewed'] ?? []))); if (!$set) { continue; }
        $reg = is_array($d['reg'] ?? null) ? $d['reg'] : []; $hand = trim((string) ($reg['hand'] ?? ''));
        if ($onlyHand !== null && txi_norm($hand) !== txi_norm($onlyHand)) { continue; }
        $zones = (array) ($d['zones'] ?? []);
        $rec = function_exists('txi_recueil_of') ? txi_recueil_of($pdo, (int) $a['media_id']) : null;
        $key = function_exists('txi_reg_key') ? txi_reg_key($reg, $rec, (string) $a['place']) : '';
        $label = trim((string) ($reg['register'] ?? '') ?: ($rec['title'] ?? '') ?: (string) $a['place']);
        if (!empty($reg['cote'])) { $label = trim($label . ' (' . $reg['cote'] . ')'); }
        $g = &$groups[txi_norm($hand)]; $g ??= ['hand' => $hand, 'lines' => [], 'registers' => [], 'acts' => 0]; $g['acts']++;
        foreach (txi_text_lines(str_replace("\r", '', (string) $a['body'])) as $l) {
            if (!isset($set[txi_line_key($l['text'])])) { continue; }
            $z = txi_zone_of($zones, $l['s'], $l['e']); if (!$z || ($z['w'] ?? 0) < 8 || ($z['h'] ?? 0) < 4 || in_array($z['kind'] ?? '', ['skip', 'sign'], true)) { continue; }
            $mid = (int) ($z['p'] ?? 0) ?: (int) $a['media_id']; $fn = $mid === (int) $a['media_id'] ? (string) $a['filename'] : (function () use ($fileOf, $mid) { $fileOf->execute([$mid]); return (string) $fileOf->fetchColumn(); })();
            if ($fn === '') { continue; }
            $g['lines'][] = ['act' => (int) $a['id'], 'file' => $fn, 'x' => (float) $z['x'], 'y' => (float) $z['y'], 'w' => (float) $z['w'], 'h' => (float) $z['h'], 'text' => trim((string) preg_replace('/\s+/u', ' ', $l['text']))];
            $g['registers'][$key] ??= ['key' => $key, 'label' => $label, 'lines' => 0]; $g['registers'][$key]['lines']++;
        }
        unset($g);
    }
    return $groups;
}

/** le travail en cours (un seul à la fois) */
function txi_train_running(): ?array
{
    foreach (glob(txi_train_dir() . '/*', GLOB_ONLYDIR) ?: [] as $d) {
        if (!preg_match('/^[a-f0-9]{24}$/', basename($d))) { continue; }
        $s = htr_json_file($d . '/status.json');
        if (($s['state'] ?? '') === 'running' && time() - (int) ($s['updated'] ?? 0) < 1800) { return ['id' => basename($d)] + $s; }
    }
    return null;
}

/** « 20 min à 1 h » : ce que l'entraînement va prendre, à dire avant de lancer */
function txi_train_estimate(string $engine, int $lines, array $gpu): array
{
    $fast = ($gpu['kind'] ?? '') === 'nvidia';
    [$a, $b] = $engine === 'qwen' ? ($fast ? [1.5, 4] : [20, 60]) : ($fast ? [.6, 2] : [6, 18]); // secondes par ligne, pour tout l'entraînement
    return ['min' => (int) max(2, round($lines * $a / 60)), 'max' => (int) max(5, round($lines * $b / 60))];
}

function txi_train_get(PDO $pdo, string $op, array $q): array
{
    if ($op === 'train_job') { return txi_train_job($pdo, (string) ($q['id'] ?? '')); }
    if ($op === 'train_models') { return ['models' => txi_trained(), 'running' => txi_train_running()]; } // léger : la fenêtre « 📚 Registre et main »
    if ($op !== 'train_status' && $op !== 'train_probe') { throw new LcndaBadInput('Opération inconnue.'); }
    $os = txi_os(); $gpu = txi_gpu(); $ketos = txi_ketos(); $setup = htr_setup_status();
    $base = array_values(array_map(static fn($m) => ['file' => $m['file'], 'title' => $m['title'], 'recommended' => $m['recommended']], array_filter($setup['models'], static fn($m) => $m['present'])));
    $un = txi_unsloth($op === 'train_probe');
    $hands = [];
    foreach (txi_reviewed_lines($pdo) as $g) {
        $n = count($g['lines']);
        $hands[] = ['hand' => $g['hand'], 'lines' => $n, 'acts' => $g['acts'], 'registers' => array_values($g['registers']), 'ready' => $g['hand'] !== '' && $n >= ATELIER_TRAIN_ADVISED, 'can' => $g['hand'] !== '' && $n >= ATELIER_TRAIN_MIN,
            'estimate' => ['kraken' => txi_train_estimate('kraken', $n, $gpu), 'qwen' => txi_train_estimate('qwen', $n, $gpu)]];
    }
    usort($hands, static fn($a, $b) => ($a['hand'] === '') <=> ($b['hand'] === '') ?: $b['lines'] <=> $a['lines']);
    $qwenOk = $gpu['kind'] === 'nvidia' && $gpu['vram_gb'] >= ATELIER_QWEN_VRAM_GB;
    return [
        'machine' => ['os' => $os, 'gpu' => $gpu, 'ram_gb' => function_exists('tx_deep_ram_gb') ? tx_deep_ram_gb() : 0],
        'kraken' => ['ready' => $ketos !== '' && (bool) $base, 'ketos' => $ketos !== '', 'engine' => (bool) $setup['kraken'], 'base' => $base,
            'why' => $ketos === '' ? ($setup['kraken'] ? 'ketos' : 'engine') : (!$base ? 'model' : '')],
        'qwen' => ['ready' => $un['installed'] && ($qwenOk || $os === 'mac'), 'gpu_ok' => $qwenOk, 'mac' => $os === 'mac', 'unsloth' => $un, 'vram_min' => ATELIER_QWEN_VRAM_GB, 'base' => ATELIER_QWEN_BASE,
            'base_cached' => txi_qwen_base_cached($un),
            'why' => !$un['installed'] ? ($un['checked'] === '' ? 'unchecked' : 'unsloth') : ($os === 'mac' ? 'mac' : (!$qwenOk ? 'gpu' : ''))],
        'hands' => $hands, 'min' => ATELIER_TRAIN_MIN, 'advised' => ATELIER_TRAIN_ADVISED,
        'models' => txi_trained(), 'running' => txi_train_running(),
        'assigned' => $pdo->query('SELECT reg_key, model FROM atelier_reg_models')->fetchAll(PDO::FETCH_KEY_PAIR),
    ];
}

/** le modèle de départ de Qwen est-il déjà sur l'ordinateur (cache de Hugging Face) ? */
function txi_qwen_base_cached(array $un): bool
{
    if (($un['checked'] ?? '') === 'test') { return getenv('LCNDA_TEST_QWEN_CACHED') === '1'; }
    $home = (string) (getenv('HF_HOME') ?: ((getenv('HOME') ?: getenv('USERPROFILE') ?: '') . '/.cache/huggingface'));
    return $home !== '' && is_dir($home . '/hub/models--' . str_replace('/', '--', ATELIER_QWEN_BASE));
}

function txi_train_post(PDO $pdo, string $op, array $d): array
{
    return match ($op) {
        'train_start' => txi_train_start($pdo, $d),
        'train_cancel' => txi_train_cancel((string) ($d['id'] ?? '')),
        'train_assign' => txi_train_assign($pdo, $d),
        'train_ollama' => txi_train_ollama((string) ($d['id'] ?? '')),
        default => throw new LcndaBadInput('Opération inconnue.'),
    };
}

function txi_slug(string $s): string { $s = trim((string) preg_replace('/[^a-z0-9]+/', '-', txi_norm($s)), '-'); return $s !== '' ? substr($s, 0, 40) : 'main'; }

/** découpe une ligne (sa zone, un peu de marge en haut et en bas pour les jambages) en PNG */
function txi_crop_line(string $file, array $l, string $out): bool
{
    static $cache = [];
    $root = realpath(MEDIA_DIR); $src = realpath(MEDIA_DIR . '/' . str_replace(['\\', "\0"], ['/', ''], $file));
    if (!$root || !$src || !str_starts_with($src, $root . DIRECTORY_SEPARATOR)) { return false; }
    if (!isset($cache[$src])) { if (count($cache) > 4) { $cache = []; } $cache[$src] = @imagecreatefromstring((string) file_get_contents($src)) ?: null; }
    $im = $cache[$src]; if (!$im) { return false; }
    $W = imagesx($im); $H = imagesy($im); $pad = $l['h'] * .12;
    $x = max(0, (int) floor($l['x'])); $y = max(0, (int) floor($l['y'] - $pad)); $w = min($W - $x, (int) ceil($l['w'])); $h = min($H - $y, (int) ceil($l['h'] + 2 * $pad));
    if ($w < 4 || $h < 4) { return false; }
    $t = imagecreatetruecolor($w, $h); imagecopy($t, $im, 0, 0, $x, $y, $w, $h);
    return imagepng($t, $out);
}

/**
 * POST train_start {engine: kraken|qwen, hand, base (modèle de départ), accept_mac, allow_download} → {id}
 * Les lignes relues de cette main sont découpées (une image + son texte .gt.txt) ; 1 sur 10 mise de côté (heldout/).
 */
function txi_train_start(PDO $pdo, array $d): array
{
    if ($r = txi_train_running()) { throw new LcndaBadInput(i18n_t('Un entraînement est déjà en cours : attends qu’il se termine, ou arrête-le.')); }
    $engine = ($d['engine'] ?? '') === 'qwen' ? 'qwen' : 'kraken';
    $hand = trim(safe_text($d['hand'] ?? ''));
    if ($hand === '') { throw new LcndaBadInput(i18n_t('Choisis la main à entraîner (remplis d’abord le champ « Main » des actes).')); }
    $g = txi_reviewed_lines($pdo, $hand)[txi_norm($hand)] ?? null; $lines = $g['lines'] ?? [];
    if (count($lines) < ATELIER_TRAIN_MIN) { throw new LcndaBadInput(i18n_t('Pas assez de lignes relues pour cette main : {n} sur {min} au moins (150 conseillées).', ['n' => (string) count($lines), 'min' => (string) ATELIER_TRAIN_MIN])); }
    if (!function_exists('imagecreatefromstring')) { throw new RuntimeException(i18n_t('PHP n’a pas l’extension GD : les lignes ne peuvent pas être découpées.')); }
    $gpu = txi_gpu(); $os = txi_os();
    if ($engine === 'kraken') {
        $ketos = txi_ketos(); if ($ketos === '') { throw new LcndaBadInput(i18n_t('La lecture rapide (Kraken) n’est pas installée avec son outil d’entraînement : Réglages → Reconnaissance d’écriture (HTR).')); }
        $baseFile = basename((string) ($d['base'] ?? ''));
        $present = array_values(array_filter(htr_setup_status()['models'], static fn($m) => $m['present']));
        if ($baseFile === '' || !in_array($baseFile, array_column($present, 'file'), true)) { $baseFile = (string) ((array_values(array_filter($present, static fn($m) => $m['recommended']))[0] ?? $present[0] ?? [])['file'] ?? ''); }
        $basePath = $baseFile !== '' ? htr_model_file(['file' => $baseFile, 'model' => 'models/htr/' . $baseFile]) : null;
        if (!$basePath) { throw new LcndaBadInput(i18n_t('Aucun modèle de lecture installé à affiner : Réglages → Reconnaissance d’écriture (HTR), étape ②.')); }
    } else {
        $un = txi_unsloth();
        if (!$un['installed']) { throw new LcndaBadInput(i18n_t('Unsloth n’est pas installé sur cet ordinateur : « vérifier » (🎓 Entraîner) dit ce qui manque.')); }
        if ($os === 'mac' && empty($d['accept_mac'])) { throw new LcndaBadInput(i18n_t('Sur Mac, l’entraînement de Qwen avec Unsloth n’est pas garanti : confirme d’abord que tu veux essayer.')); }
        if ($os !== 'mac' && !($gpu['kind'] === 'nvidia' && $gpu['vram_gb'] >= ATELIER_QWEN_VRAM_GB)) { throw new LcndaBadInput(i18n_t('Qwen a besoin d’une carte graphique NVIDIA de 8 Go ou plus : utilise plutôt la lecture rapide (Kraken).')); }
        if (!txi_qwen_base_cached($un) && empty($d['allow_download'])) { throw new LcndaBadInput(i18n_t('Le modèle de départ de Qwen n’est pas encore sur l’ordinateur : coche « Télécharger une fois le modèle de départ » pour continuer.')); }
    }
    $id = bin2hex(random_bytes(12)); $dir = txi_train_dir() . '/' . $id;
    @mkdir($dir . '/train', 0775, true); @mkdir($dir . '/heldout', 0775, true); @mkdir($dir . '/out', 0775, true);
    $train = []; $held = []; $k = 0;
    foreach ($lines as $i => $l) {
        $isHeld = $i % 10 === 9; // 1 ligne sur 10, jamais montrée pendant l'entraînement
        $name = sprintf('%05d', ++$k); $sub = $isHeld ? 'heldout' : 'train';
        if (!txi_crop_line($l['file'], $l, "$dir/$sub/$name.png")) { continue; }
        file_put_contents("$dir/$sub/$name.gt.txt", $l['text']);
        if ($isHeld) { $held[] = "$dir/$sub/$name.png"; } else { $train[] = "$dir/$sub/$name.png"; }
    }
    if (count($train) < ATELIER_TRAIN_MIN - 5 || !$held) { htr_rmtree($dir, txi_train_dir()); throw new LcndaBadInput(i18n_t('Les images des lignes n’ont pas pu être découpées.')); }
    // la validation pendant l'entraînement : prise dans les lignes d'entraînement (la ligne mise de côté reste jamais vue)
    $val = array_values(array_filter($train, static fn($f, $i) => $i % 9 === 4, ARRAY_FILTER_USE_BOTH)); $tr = array_values(array_diff($train, $val));
    file_put_contents("$dir/train.txt", implode("\n", $tr) . "\n"); file_put_contents("$dir/val.txt", implode("\n", $val) . "\n"); file_put_contents("$dir/heldout.txt", implode("\n", $held) . "\n");
    $epochs = max(5, min(50, safe_int($d['epochs'] ?? 30) ?: 30));
    $title = i18n_t('Main de {h}', ['h' => $hand]);
    $device = $gpu['kind'] === 'nvidia' ? 'cuda:0' : 'cpu';
    $job = ['engine' => $engine, 'hand' => $hand, 'title' => $title, 'epochs' => $epochs, 'lines' => count($train), 'heldout' => count($held), 'created' => time(), 'device' => $device,
        'reg_keys' => array_values(array_filter(array_keys($g['registers']))), 'slug' => txi_slug($hand)];
    $bin = static fn(string $b): array => str_ends_with($b, '.php') ? [PHP_BINARY, $b] : [$b];
    if ($engine === 'kraken') {
        $job['base'] = $baseFile;
        $job['cmd_train'] = [...$bin($ketos), 'train', '-f', 'path', '-i', $basePath, '--resize', 'union', '-o', "$dir/out/model", '-N', (string) $epochs, '--lag', '5', '-d', $device, '-t', "$dir/train.txt", '-e', "$dir/val.txt"];
        $job['cmd_test_base'] = [...$bin($ketos), 'test', '-f', 'path', '-m', $basePath, '-e', "$dir/heldout.txt"];
        $job['cmd_test_new'] = [...$bin($ketos), 'test', '-f', 'path', '-m', '{MODEL}', '-e', "$dir/heldout.txt"];
    } else {
        $un = txi_unsloth(); $fake = (string) getenv('LCNDA_QWEN_TRAIN_BIN');
        $runner = txi_test_mode() && $fake !== '' && is_file($fake) ? [PHP_BINARY, $fake] : [$un['python'], APP_ROOT . '/scripts/atelier_train_qwen.py'];
        $job['base'] = ATELIER_QWEN_BASE; $job['allow_download'] = !empty($d['allow_download']);
        $job['cmd_train'] = [...$runner, '--engine', 'qwen', '--base', ATELIER_QWEN_BASE, '--train', "$dir/train.txt", '--val', "$dir/val.txt", '--heldout', "$dir/heldout.txt", '--out', "$dir/out", '--epochs', (string) $epochs];
    }
    file_put_contents("$dir/job.json", json_encode($job, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    file_put_contents("$dir/status.json", json_encode(['state' => 'running', 'phase' => 'start', 'epoch' => 0, 'epochs' => $epochs, 'updated' => time(), 'created' => time()]));
    htr_spawn_php([APP_ROOT . '/scripts/atelier_train.php', $dir, APP_ROOT, htr_dir()], "$dir/run.log");
    return ['id' => $id, 'lines' => count($train), 'heldout' => count($held), 'epochs' => $epochs, 'title' => $title, 'engine' => $engine];
}

function txi_train_jobdir(string $id): string
{
    if (!preg_match('/^[a-f0-9]{24}$/', $id)) { throw new LcndaBadInput(i18n_t('Entraînement inconnu.')); }
    $d = txi_train_dir() . '/' . $id; if (!is_dir($d) || is_link($d)) { throw new LcndaBadInput(i18n_t('Entraînement inconnu.')); }
    return $d;
}

/** où en est l'entraînement ; une fois fini, le modèle est choisi pour les registres de cette main (une seule fois ; « ↶ Annuler » côté écran) */
function txi_train_job(PDO $pdo, string $id): array
{
    $dir = txi_train_jobdir($id); $s = htr_json_file("$dir/status.json"); $job = htr_json_file("$dir/job.json");
    if (($s['state'] ?? '') === 'running' && time() - (int) ($s['updated'] ?? 0) > 1800) { $s['state'] = 'error'; $s['error'] = i18n_t('L’entraînement ne donne plus de nouvelles (l’application a été fermée ?).'); }
    $out = ['id' => $id, 'engine' => (string) ($job['engine'] ?? ''), 'hand' => (string) ($job['hand'] ?? ''), 'title' => (string) ($job['title'] ?? ''), 'lines' => (int) ($job['lines'] ?? 0), 'heldout_n' => (int) ($job['heldout'] ?? 0)] + $s;
    $out['elapsed'] = max(0, time() - (int) ($job['created'] ?? time()));
    unset($out['log']); $out['log'] = mb_substr((string) @file_get_contents("$dir/train.log"), -3000);
    $model = (string) ($s['model_file'] ?? '');
    if (in_array($s['state'] ?? '', ['done', 'cancelled'], true) && $model !== '' && empty($s['assigned']) && ($job['engine'] ?? '') === 'kraken') {
        $was = []; $set = $pdo->prepare('INSERT INTO atelier_reg_models(reg_key, model, label, updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(reg_key) DO UPDATE SET model=excluded.model, label=excluded.label, updated_at=CURRENT_TIMESTAMP');
        $get = $pdo->prepare('SELECT model FROM atelier_reg_models WHERE reg_key=?');
        foreach ((array) ($job['reg_keys'] ?? []) as $k) { if (!is_string($k) || !preg_match('/^[rin]:[0-9a-f]{1,16}$/', $k)) { continue; } $get->execute([$k]); $was[$k] = (string) ($get->fetchColumn() ?: ''); $set->execute([$k, $model, (string) ($job['title'] ?? '')]); }
        $s['assigned'] = $was; @file_put_contents("$dir/status.json", json_encode($s, JSON_UNESCAPED_UNICODE)); $out['assigned_now'] = $was;
    }
    return $out;
}

function txi_train_cancel(string $id): array
{
    $dir = txi_train_jobdir($id); @file_put_contents("$dir/cancel", '1');
    return ['id' => $id, 'cancel' => true];
}

/** POST train_assign {model, reg_keys: {clé: modèle d'avant}} : remet les modèles d'avant (↶ Annuler), ou choisit un modèle pour des registres */
function txi_train_assign(PDO $pdo, array $d): array
{
    $n = 0;
    foreach ((array) ($d['reg_keys'] ?? []) as $k => $model) {
        if (!is_string($k)) { continue; }
        txi_reg_model_set($pdo, ['reg_key' => $k, 'model' => is_string($model) ? $model : (string) ($d['model'] ?? '')]); $n++;
    }
    return ['changed' => $n];
}

/** POST train_ollama {id} : un modèle Qwen entraîné ajouté à Ollama (ollama create, sur cet ordinateur ; seulement au clic) */
function txi_train_ollama(string $id): array
{
    $dir = txi_train_jobdir($id); $s = htr_json_file("$dir/status.json");
    $mf = (string) ($s['modelfile'] ?? '');
    if ($mf === '' || !is_file($mf)) { throw new LcndaBadInput(i18n_t('Pas de modèle prêt pour Ollama dans cet entraînement (l’adaptateur LoRA reste utilisable avec Unsloth).')); }
    $bin = txi_which('ollama') ?: (is_file('/usr/local/bin/ollama') ? '/usr/local/bin/ollama' : (is_file('/opt/homebrew/bin/ollama') ? '/opt/homebrew/bin/ollama' : ''));
    if ($bin === '') { throw new LcndaBadInput(i18n_t('Ollama n’est pas installé sur cet ordinateur.')); }
    $name = 'lcnda-' . substr(txi_slug((string) (htr_json_file("$dir/job.json")['hand'] ?? 'main')), 0, 30);
    $o = txi_run([$bin, 'create', $name, '-f', $mf], 600);
    return ['name' => $name, 'output' => mb_substr($o, -1000)];
}
