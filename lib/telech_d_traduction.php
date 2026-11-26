<?php
declare(strict_types=1);
/**
 * 🌐 Traduction hors ligne (lot D) : Argos Translate (logiciel libre, licence MIT ou CC0 au choix) et ses modèles, installés UNE
 * fois sur cet ordinateur, dans le dossier des données commun (SHARED_DATA_DIR/traduction) ; ensuite tout marche sans Internet et
 * le texte à traduire ne quitte jamais l'ordinateur.
 *   traduction/venv/       environnement Python avec argostranslate (pip, PyPI)
 *   traduction/packages/   les modèles (.argosmodel installés), ARGOS_PACKAGES_DIR
 *   traduction/status.json, install.log, engine.json
 * Python : celui que l'installation de la lecture d'écriture (HTR) a déjà apporté (SHARED_DATA_DIR/htr/python), sinon le Python 3.9
 * à 3.12 de l'ordinateur. Langues : allemand, italien, espagnol, néerlandais, polonais, portugais, anglais → français, par
 * l'anglais (les modèles d'Argos vont de X vers l'anglais, et de l'anglais vers le français). Le LATIN n'existe pas dans l'index
 * d'Argos (vérifié le 2026-11-25) : l'app le dit, et propose le mot à mot latin et le modèle d'IA local (lecture approfondie).
 * Routes (lib/telech_d.php les passe ici) :
 *   GET  td_tr_status · td_tr_dl_info · td_tr_dl_resume {id}
 *   POST td_tr_dl_start {kind} · td_tr_dl_step {id} · td_tr_dl_cancel {id} · td_tr_pack_finish {id} · td_tr_pack_undo {kind}
 *        td_tr_translate {text, from} · td_tr_uninstall
 * (même forme que les autres familles de Réglages → 🗂 Données : assets/js/app-listes-maj.js)
 * GENEALOGY_TD_SIMULATE=1 (essais) : rien n'est téléchargé ni lancé ; la « traduction » est un texte d'essai.
 */

require_once __DIR__ . '/htr_setup.php';

const TDTR_LANGS = [
    'de' => ['Allemand', ['de-en', 'en-fr']], 'it' => ['Italien', ['it-en', 'en-fr']], 'es' => ['Espagnol', ['es-en', 'en-fr']],
    'nl' => ['Néerlandais', ['nl-en', 'en-fr']], 'pl' => ['Polonais', ['pl-en', 'en-fr']], 'pt' => ['Portugais', ['pt-en', 'en-fr']],
    'en' => ['Anglais', ['en-fr']],
];
const TDTR_MODEL_MB = 95;          // un modèle d'Argos pèse ≈ 80 à 110 Mo
const TDTR_ENGINE_MB = 450;        // argostranslate + ctranslate2 + sentencepiece + stanza (et PyTorch processeur)
const TDTR_SOURCES = [
    'engine' => ['label' => 'Argos Translate (Argos Open Technologies)', 'url' => 'https://github.com/argosopentech/argos-translate', 'licence' => 'MIT ou CC0 1.0, au choix',
        'quote' => 'Argos Translate is dual licensed under either the MIT License or Creative Commons CC0.', 'read' => '2026-11-25'],
    'models' => ['label' => 'Modèles d’Argos Translate (index argospm)', 'url' => 'https://github.com/argosopentech/argospm-index', 'licence' => 'index : MIT ou CC0 ; chaque modèle : licence et crédits écrits dans son paquet (montrés après l’installation)',
        'quote' => 'Dual licensed under either the MIT License or CC0.', 'read' => '2026-11-25'],
    'opus' => ['label' => 'OPUS-MT (Université d’Helsinki) — données d’entraînement d’Argos, et modèles directs', 'url' => 'https://github.com/Helsinki-NLP/Opus-MT', 'licence' => 'CC BY 4.0',
        'quote' => 'pre-trained downloadable translation models (matrix view), CC-BY 4.0 license', 'read' => '2026-11-25'],
];

function tdtr_dir(): string { $d = SHARED_DATA_DIR . '/traduction'; if (!is_dir($d)) { @mkdir($d, 0775, true); } return $d; }
function tdtr_sim(): bool { $s = (string) getenv('GENEALOGY_TD_SIMULATE'); return $s !== '' && $s !== '0'; }
function tdtr_venv_python(): ?string
{
    $p = htr_is_windows() ? tdtr_dir() . '/venv/Scripts/python.exe' : tdtr_dir() . '/venv/bin/python3';
    return is_file($p) ? $p : null;
}
function tdtr_json_file(string $f): array { $j = is_file($f) ? json_decode((string) @file_get_contents($f), true) : null; return is_array($j) ? $j : []; }
function tdtr_engine(): array { return tdtr_json_file(tdtr_dir() . '/engine.json'); }
function tdtr_status_file(): array { return tdtr_json_file(tdtr_dir() . '/status.json'); }
/** les modèles installés : « de-en » → {version, licence} (relu par --check après chaque installation, gardé dans engine.json) */
function tdtr_models(): array { return is_array(tdtr_engine()['models'] ?? null) ? tdtr_engine()['models'] : []; }
function tdtr_lang_ready(string $lang): bool
{
    $m = tdtr_models();
    foreach (TDTR_LANGS[$lang][1] ?? ['?'] as $pair) { if (!isset($m[$pair])) { return false; } }
    return !empty(tdtr_engine()['ok']);
}
function tdtr_size(): int
{
    $n = 0; $d = tdtr_dir();
    if (!is_dir($d)) { return 0; }
    try { foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($d, FilesystemIterator::SKIP_DOTS)) as $f) { if ($f->isFile()) { $n += $f->getSize(); } } } catch (Throwable) {}
    return $n;
}
function tdtr_running(): bool { $s = tdtr_status_file(); return ($s['state'] ?? '') === 'running' && time() - (int) ($s['updated'] ?? 0) < 3600; }

function tdtr_status(): array
{
    $e = tdtr_engine();
    $langs = [];
    foreach (TDTR_LANGS as $k => [$name, $pairs]) {
        $langs[$k] = ['name' => $name, 'pairs' => $pairs, 'installed' => tdtr_lang_ready($k), 'built' => (string) ($e['built'][$k] ?? ''),
            'size' => tdtr_lang_ready($k) ? count($pairs) * TDTR_MODEL_MB * 1_000_000 : 0];
    }
    return ['ok' => true, 'engine' => ['installed' => !empty($e['ok']), 'version' => (string) ($e['version'] ?? ''), 'python' => (string) ($e['python'] ?? '')],
        'models' => tdtr_models(), 'langs' => $langs, 'installed' => !empty($e['ok']) && (bool) array_filter($langs, static fn($l) => $l['installed']),
        'install' => tdtr_status_file(), 'size' => tdtr_size(), 'sources' => TDTR_SOURCES, 'latin' => false, 'simulated' => tdtr_sim()];
}
/** ce qu'on peut installer (rien n'est lu en ligne ici : les tailles sont approchées, l'index est lu par l'installation) */
function tdtr_dl_info(): array
{
    $packs = [];
    foreach (TDTR_LANGS as $k => [$name, $pairs]) {
        $mb = count($pairs) * TDTR_MODEL_MB + (empty(tdtr_engine()['ok']) ? TDTR_ENGINE_MB : 0);
        $packs[$k] = ['built' => '', 'size' => $mb * 1_000_000, 'approx' => true];
    }
    return ['ok' => true, 'packs' => $packs];
}

/* ─────────── l'installation, en arrière-plan (scripts/telech-d/argos_install.php) ─────────── */
function tdtr_dl_start(array $d): array
{
    if (function_exists('kiosk_state') && !empty(kiosk_state()['on'])) { throw new RuntimeException(i18n_t('Mode consultation : rien ne s’installe.')); }
    $lang = (string) ($d['kind'] ?? '');
    if (!isset(TDTR_LANGS[$lang])) { throw new LcndaBadInput('Langue inconnue.'); }
    if (tdtr_running()) { return ['id' => (string) (tdtr_status_file()['id'] ?? ''), 'size' => 100, 'already' => true]; }
    $id = bin2hex(random_bytes(6));
    $dir = tdtr_dir();
    @file_put_contents($dir . '/status.json', json_encode(['state' => 'running', 'id' => $id, 'lang' => $lang, 'step' => i18n_t('Démarrage…'), 'pct' => 1, 'updated' => time()], JSON_UNESCAPED_UNICODE));
    @file_put_contents($dir . '/install.log', '[' . date('H:i:s') . "] Installation demandée : {$lang}\n", FILE_APPEND);
    htr_spawn_php([APP_ROOT . '/scripts/telech-d/argos_install.php', $dir, APP_ROOT, $lang, SHARED_DATA_DIR . '/htr', tdtr_sim() ? '1' : '0'], $dir . '/install.log');
    return ['id' => $id, 'size' => 100];
}
/** l'avancement en « octets » = pour cent (la file de Réglages → 🗂 Données compte en octets) */
function tdtr_dl_step(array $d): array
{
    $s = tdtr_status_file(); $id = (string) ($d['id'] ?? '');
    if ($id === '' || ($s['id'] ?? '') !== $id) { throw new RuntimeException(i18n_t('Installation introuvable : relance-la.')); }
    if (($s['state'] ?? '') === 'error') { throw new RuntimeException((string) ($s['step'] ?? i18n_t('Installation interrompue.'))); }
    if (($s['state'] ?? '') === 'running') { usleep(tdtr_sim() ? 200_000 : 1_500_000); $s = tdtr_status_file(); }
    if (($s['state'] ?? '') === 'running' && time() - (int) ($s['updated'] ?? 0) > 3600) { throw new RuntimeException(i18n_t('L’installation ne répond plus : relance-la.')); }
    $done = ($s['state'] ?? '') === 'done';
    return ['received' => $done ? 100 : max(1, min(99, (int) ($s['pct'] ?? 1))), 'size' => 100, 'done' => $done, 'step' => (string) ($s['step'] ?? '')];
}
function tdtr_dl_resume(array $q): array { $s = tdtr_status_file(); $id = (string) ($q['id'] ?? ''); return ['exists' => $id !== '' && ($s['id'] ?? '') === $id && in_array($s['state'] ?? '', ['running', 'done'], true), 'received' => (int) ($s['pct'] ?? 0), 'size' => 100]; }
function tdtr_dl_cancel(array $d): array
{
    $s = tdtr_status_file();
    if (($s['id'] ?? '') === (string) ($d['id'] ?? '')) { @file_put_contents(tdtr_dir() . '/cancel', '1'); }
    return ['ok' => true];
}
function tdtr_pack_finish(array $d): array
{
    $s = tdtr_status_file();
    if (($s['id'] ?? '') !== (string) ($d['id'] ?? '') || ($s['state'] ?? '') !== 'done') { throw new RuntimeException(i18n_t('L’installation n’est pas finie.')); }
    return ['ok' => true, 'lang' => (string) ($s['lang'] ?? ''), 'models' => tdtr_models()];
}
/** « ↶ Annuler » après une installation : retire les modèles de cette langue (pas le modèle anglais → français s'il sert à une autre) */
function tdtr_pack_undo(array $d): array
{
    $lang = (string) ($d['kind'] ?? '');
    if (!isset(TDTR_LANGS[$lang])) { throw new LcndaBadInput('Langue inconnue.'); }
    $keep = [];
    foreach (TDTR_LANGS as $k => [, $pairs]) { if ($k !== $lang && tdtr_lang_ready($k)) { $keep = array_merge($keep, $pairs); } }
    $e = tdtr_engine(); $removed = [];
    foreach (TDTR_LANGS[$lang][1] as $pair) {
        if (in_array($pair, $keep, true) || !isset($e['models'][$pair])) { continue; }
        [$f, $t] = explode('-', $pair);
        if (!tdtr_sim()) { tdtr_run(['--remove', $f, $t]); }
        unset($e['models'][$pair]); $removed[] = $pair;
    }
    unset($e['built'][$lang]);
    @file_put_contents(tdtr_dir() . '/engine.json', json_encode($e, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    return ['ok' => true, 'removed' => $removed];
}
function tdtr_uninstall(): array
{
    if (tdtr_running()) { throw new RuntimeException(i18n_t('Une installation est en cours : attends qu’elle finisse.')); }
    $freed = 0; $dir = tdtr_dir();
    foreach (['venv', 'packages'] as $sub) { if (is_dir($dir . '/' . $sub)) { $freed += htr_rmtree($dir . '/' . $sub, $dir); } }
    foreach (['engine.json', 'status.json', 'cancel'] as $f) { @unlink($dir . '/' . $f); }
    return ['ok' => true, 'freed' => $freed];
}

/* ─────────── traduire (sur cet ordinateur) ─────────── */
function tdtr_run(array $args, string $stdin = '', int $timeout = 180): array
{
    $py = tdtr_venv_python();
    if ($py === null) { throw new RuntimeException(i18n_t('La traduction hors ligne n’est pas installée.')); }
    $env = ['ARGOS_PACKAGES_DIR' => tdtr_dir() . '/packages', 'ARGOS_DEVICE_TYPE' => 'cpu', 'PATH' => (string) getenv('PATH'), 'HOME' => tdtr_dir(), 'PYTHONIOENCODING' => 'utf-8'];
    $p = proc_open([$py, '-I', APP_ROOT . '/scripts/telech-d/argos_translate.py', ...$args], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, tdtr_dir(), $env);
    if (!is_resource($p)) { throw new RuntimeException(i18n_t('Impossible de lancer la traduction.')); }
    fwrite($pipes[0], $stdin); fclose($pipes[0]);
    stream_set_blocking($pipes[1], false); stream_set_blocking($pipes[2], false);
    $out = ''; $err = ''; $t0 = time();
    while (true) {
        $out .= (string) stream_get_contents($pipes[1]); $err .= (string) stream_get_contents($pipes[2]);
        $st = proc_get_status($p);
        if (!$st['running']) { break; }
        if (time() - $t0 > $timeout) { proc_terminate($p); fclose($pipes[1]); fclose($pipes[2]); proc_close($p); throw new RuntimeException(i18n_t('La traduction prend trop de temps : essaie un morceau plus court.')); }
        usleep(100_000);
    }
    $out .= (string) stream_get_contents($pipes[1]);
    fclose($pipes[1]); fclose($pipes[2]); proc_close($p);
    $j = json_decode(trim($out), true);
    if (!is_array($j)) { throw new RuntimeException(i18n_t('Réponse illisible du programme de traduction.') . ($err !== '' ? ' ' . mb_substr(trim($err), -200) : '')); }
    return $j;
}
function tdtr_translate(array $d): array
{
    $text = trim((string) ($d['text'] ?? ''));
    $from = (string) ($d['from'] ?? '');
    if ($text === '') { throw new LcndaBadInput('Rien à traduire.'); }
    if (mb_strlen($text) > 20000) { throw new LcndaBadInput('Texte trop long (20 000 caractères au plus) : traduis-le en plusieurs fois.'); }
    if ($from === 'la') { return ['ok' => false, 'code' => 'latin', 'message' => i18n_t('Argos Translate n’a pas de modèle pour le latin.')]; }
    if (!isset(TDTR_LANGS[$from])) { throw new LcndaBadInput('Langue inconnue.'); }
    if (!tdtr_lang_ready($from)) { return ['ok' => false, 'code' => 'not_installed', 'lang' => $from, 'message' => i18n_t('La traduction {l} → français n’est pas installée.', ['l' => i18n_t(TDTR_LANGS[$from][0])])]; }
    if (tdtr_sim()) { return ['ok' => true, 'text' => '[FR] ' . $text, 'route' => $from === 'en' ? ['en', 'fr'] : [$from, 'en', 'fr'], 'engine' => 'Argos Translate (essai)', 'models' => array_intersect_key(tdtr_models(), array_flip(TDTR_LANGS[$from][1]))]; }
    $r = tdtr_run(['--translate', $from, 'fr'], json_encode(['text' => $text], JSON_UNESCAPED_UNICODE));
    if (empty($r['ok'])) { throw new RuntimeException((string) ($r['message'] ?? i18n_t('Traduction impossible.'))); }
    return ['ok' => true, 'text' => (string) $r['text'], 'route' => $r['route'] ?? [$from, 'fr'], 'engine' => 'Argos Translate ' . ($r['version'] ?? ''),
        'models' => array_intersect_key(tdtr_models(), array_flip(TDTR_LANGS[$from][1]))];
}

function tdtr_api_get(string $action, array $q): array
{
    return match ($action) {
        'td_tr_status' => tdtr_status(),
        'td_tr_dl_info' => tdtr_dl_info(),
        'td_tr_dl_resume' => tdtr_dl_resume($q),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
function tdtr_api_post(string $action, array $d): array
{
    return match ($action) {
        'td_tr_dl_start' => tdtr_dl_start($d),
        'td_tr_dl_step' => tdtr_dl_step($d),
        'td_tr_dl_cancel' => tdtr_dl_cancel($d),
        'td_tr_pack_finish' => tdtr_pack_finish($d),
        'td_tr_pack_undo' => tdtr_pack_undo($d),
        'td_tr_translate' => tdtr_translate($d),
        'td_tr_uninstall' => tdtr_uninstall(),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
