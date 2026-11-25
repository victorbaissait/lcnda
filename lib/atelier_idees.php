<?php
declare(strict_types=1);
/**
 * 📜 Atelier de transcription, idées 35 à 40 (maquette approuvée docs/design/atelier-idees.html) — le côté serveur.
 *   GET  api.php?action=atelier_idees&op=…        reg · search · thumb · iiif_preview · iiif_thumb · stats · train_status · train_job
 *   POST api.php?action=atelier_idees_write {op}  iiif_open · reg_model · modern_ai · train_start · train_cancel · train_assign · train_ollama
 * ⏭ 37  reg : le registre d'un acte (recueil, ou manifeste IIIF), la vue n / N, l'acte d'avant / d'après, la vue suivante.
 * 🌐 40  iiif_* : seulement l'adresse que la personne colle ; une vue par clic ; la licence, la cote et le lien ↗ source gardés.
 * 🔎 36  search : un index SQLite FTS5 des lignes (texte fidèle et modernisé), remis à jour avant chaque recherche
 *        (les actes changés depuis : leur date de modification) ; « ≈ orthographes voisines » : une clé de prononciation par mot.
 * 🔤 38  modern_ai : la version modernisée proposée par l'IA locale (Ollama, comme la lecture approfondie), ligne pour ligne.
 * 🎓 35  train_* : lib/atelier_entrainer.php.
 * Essais : tests/test-atelier-idees.js.
 */

require_once __DIR__ . '/atelier_idees_data.php';

function txi_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    act_transcriptions_ensure($pdo);
    $pdo->exec('CREATE TABLE IF NOT EXISTS atelier_iiif_views (id INTEGER PRIMARY KEY AUTOINCREMENT, manifest TEXT NOT NULL, n INTEGER NOT NULL, media_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(manifest, n))');
    $pdo->exec("CREATE TABLE IF NOT EXISTS atelier_reg_models (reg_key TEXT PRIMARY KEY, model TEXT NOT NULL DEFAULT '', label TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    try {
        $pdo->exec("CREATE VIRTUAL TABLE IF NOT EXISTS atelier_fts USING fts5(text, phon, act_id UNINDEXED, line UNINDEXED, layer UNINDEXED, s UNINDEXED, e UNINDEXED, tokenize = 'unicode61 remove_diacritics 2')");
    } catch (Throwable $e) { /* SQLite sans FTS5 : la recherche le dit */ }
    $pdo->exec("CREATE TABLE IF NOT EXISTS atelier_fts_state (act_id INTEGER PRIMARY KEY, stamp TEXT NOT NULL DEFAULT '')");
    $done = true;
}

/** mode consultation (ou appareil invité en lecture seule) : rien ne s'écrit, rien ne part sur Internet.
 *  (kiosk_state, lib/heritage_tools.php : toujours chargé ; onglets_kiosk ne l'est pas ici, sa vérification ne faisait rien) */
function txi_kiosk(): bool { return function_exists('kiosk_state') && !empty(kiosk_state()['on']); }

function txi_idees_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        txi_ensure($pdo);
        if (!$isWrite && $action === 'atelier_idees') {
            $op = (string) ($_GET['op'] ?? '');
            if ($op === 'thumb') { txi_line_thumb($pdo, safe_int($_GET['act'] ?? 0), (string) ($_GET['zone'] ?? '')); }
            if ($op === 'iiif_thumb') { txi_iiif_thumb((string) ($_GET['manifest'] ?? ''), safe_int($_GET['n'] ?? 0)); }
            if (str_starts_with($op, 'train_')) { require_once __DIR__ . '/atelier_entrainer.php'; json_response(txi_train_get($pdo, $op, $_GET)); }
            json_response(match ($op) {
                'reg' => txi_reg_info($pdo, safe_int($_GET['act_id'] ?? 0), safe_int($_GET['media_id'] ?? 0), txi_idees_clean_extra(['reg' => ['manifest' => $_GET['manifest'] ?? '', 'n' => $_GET['n'] ?? 0, 'total' => $_GET['total'] ?? 0, 'register' => $_GET['register'] ?? '', 'page_url' => $_GET['page_url'] ?? '']])['reg'] ?? []),
                'search' => txi_search($pdo, (string) ($_GET['q'] ?? ''), !empty($_GET['near']), safe_int($_GET['limit'] ?? 60) ?: 60),
                'iiif_preview' => txi_iiif_preview((string) ($_GET['url'] ?? '')),
                'stats' => txi_stats($pdo),
                default => throw new LcndaBadInput('Opération inconnue.'),
            });
        }
        if ($isWrite && $action === 'atelier_idees_write') {
            if (txi_kiosk()) { throw new LcndaBadInput(i18n_t('Pas en mode consultation.')); }
            $op = (string) ($payload['op'] ?? '');
            if (str_starts_with($op, 'train_')) { require_once __DIR__ . '/atelier_entrainer.php'; json_response(txi_train_post($pdo, $op, $payload)); }
            json_response(match ($op) {
                'iiif_open' => txi_iiif_open($pdo, $payload),
                'reg_model' => txi_reg_model_set($pdo, $payload),
                'modern_ai' => txi_modern_ai($payload),
                default => throw new LcndaBadInput('Opération inconnue.'),
            });
        }
        json_response(['error' => 'Action inconnue.'], 400);
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], str_contains($e->getMessage(), 'introuvable') ? 404 : 422);
    } catch (Throwable $e) { // jamais une erreur 500 : « pas disponible ici », en clair
        error_log('LCNDA atelier_idees : ' . $e->getMessage());
        json_response(['error' => i18n_t('Cette fonction de l’Atelier n’est pas disponible ici.'), 'unavailable' => true], 422);
    }
}

/* ═════════ ⏭ 37. Le registre d'un acte : recueil (une vue par page) ou manifeste IIIF ═════════ */

function txi_act_row(PDO $pdo, int $id): ?array
{
    if ($id <= 0) { return null; }
    $s = $pdo->prepare('SELECT id, title, kind, media_id, date_text, place, source, body, data_json FROM act_transcriptions WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { return null; }
    $r['data'] = json_decode((string) $r['data_json'], true) ?: []; unset($r['data_json']);
    return $r;
}

/** le recueil d'une image : {recueil_id, title, url, page_ids (dans l'ordre), index (0…)} ou null */
function txi_recueil_of(PDO $pdo, int $mediaId): ?array
{
    if ($mediaId <= 0) { return null; }
    try {
        $s = $pdo->prepare("SELECT ri.recueil_id, ri.page_id FROM recueil_images ri WHERE ri.media_id=? AND ri.page_id IS NOT NULL ORDER BY ri.id LIMIT 1"); $s->execute([$mediaId]); $r = $s->fetch(PDO::FETCH_ASSOC);
    } catch (Throwable $e) { return null; }
    if (!$r) { return null; }
    $rid = (int) $r['recueil_id'];
    $pages = array_map('intval', $pdo->query('SELECT id FROM recueil_pages WHERE recueil_id=' . $rid . ' ORDER BY position, id')->fetchAll(PDO::FETCH_COLUMN));
    $i = array_search((int) $r['page_id'], $pages, true);
    if ($i === false) { return null; }
    $rec = $pdo->query('SELECT * FROM recueils WHERE id=' . $rid)->fetch(PDO::FETCH_ASSOC) ?: []; // (« url » n'existe pas dans toutes les bases)
    return ['recueil_id' => $rid, 'title' => (string) ($rec['title'] ?? ''), 'url' => (string) ($rec['url'] ?? ''), 'pages' => $pages, 'index' => (int) $i];
}

/** l'image d'une page de recueil (la meilleure, sinon la première) */
function txi_page_media(PDO $pdo, int $pageId): int
{
    $s = $pdo->prepare('SELECT best_image_id FROM recueil_pages WHERE id=?'); $s->execute([$pageId]); $best = (int) $s->fetchColumn();
    if ($best > 0) { $c = $pdo->prepare('SELECT media_id FROM recueil_images WHERE id=? OR (media_id=? AND page_id=?) LIMIT 1'); $c->execute([$best, $best, $pageId]); $m = (int) $c->fetchColumn(); if ($m > 0) { return $m; } }
    $s = $pdo->prepare("SELECT ri.media_id FROM recueil_images ri JOIN media m ON m.id=ri.media_id WHERE ri.page_id=? AND m.media_type='image' ORDER BY (ri.role='page') DESC, ri.position, ri.id LIMIT 1"); $s->execute([$pageId]);
    return (int) $s->fetchColumn();
}

/** les actes d'une image, dans l'ordre où on les a faits */
function txi_acts_on(PDO $pdo, int $mediaId): array
{
    if ($mediaId <= 0) { return []; }
    $s = $pdo->prepare('SELECT id FROM act_transcriptions WHERE media_id=? ORDER BY id'); $s->execute([$mediaId]);
    return array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
}

function txi_norm(string $s): string
{
    $s = mb_strtolower(trim($s));
    if (class_exists('Normalizer')) { $s = (string) Normalizer::normalize($s, Normalizer::FORM_D); $s = (string) preg_replace('/\p{Mn}+/u', '', $s); }
    return trim((string) preg_replace('/[^a-z0-9]+/', ' ', strtr($s, ['ſ' => 's', 'œ' => 'oe', 'æ' => 'ae'])));
}

/** la clé du registre (pour le modèle de lecture choisi par registre, 🎓 35) : r:<recueil>, i:<manifeste>, n:<registre + cote + lieu> */
function txi_reg_key(array $reg, ?array $rec, string $place = ''): string
{
    if (!empty($reg['manifest'])) { return 'i:' . substr(sha1((string) $reg['manifest']), 0, 16); }
    if ($rec) { return 'r:' . $rec['recueil_id']; }
    $n = txi_norm(($reg['register'] ?? '') . '|' . ($reg['cote'] ?? ''));
    return $n !== '' ? 'n:' . substr(sha1($n . '|' . txi_norm($place)), 0, 16) : '';
}

/**
 * GET reg : {register: bool, kind: recueil|iiif|'', title, view, total, acts_here, index, prev_act, next_act, next_view, prev_view, reg_key, model}
 * next_view : {media_id, act_id (le 1er acte déjà fait sur cette vue, ou 0)} pour un recueil ; {iiif: n} pour une vue IIIF pas encore téléchargée.
 */
function txi_reg_info(PDO $pdo, int $actId, int $mediaId, array $given = []): array
{
    $act = txi_act_row($pdo, $actId);
    if ($act) { $mediaId = (int) ($act['media_id'] ?? 0); }
    $reg = is_array($act['data']['reg'] ?? null) ? $act['data']['reg'] : $given; // un acte pas encore enregistré : son registre envoyé par l'Atelier
    $out = ['register' => false, 'kind' => '', 'title' => '', 'view' => 0, 'total' => 0, 'acts_here' => txi_acts_on($pdo, $mediaId), 'prev_act' => 0, 'next_act' => 0, 'next_view' => null, 'prev_view' => null, 'reg_key' => '', 'model' => '', 'url' => ''];
    $here = $out['acts_here']; $pos = $actId ? array_search($actId, $here, true) : false;
    $rec = txi_recueil_of($pdo, $mediaId);
    $fn = $pdo->prepare('SELECT filename FROM media WHERE id=?');
    $viewMedia = static function (int $mid) use ($pdo, $fn): array { $a = txi_acts_on($pdo, $mid); $fn->execute([$mid]); return ['media_id' => $mid, 'filename' => (string) $fn->fetchColumn(), 'act_id' => $a[0] ?? 0, 'last_act' => $a ? $a[count($a) - 1] : 0]; };
    if ($rec) {
        $out['register'] = true; $out['kind'] = 'recueil'; $out['title'] = $rec['title']; $out['url'] = $rec['url'];
        $out['view'] = $rec['index'] + 1; $out['total'] = count($rec['pages']); $out['recueil'] = $rec['recueil_id'];
        foreach ([1 => 'next_view', -1 => 'prev_view'] as $d => $k) {
            for ($j = $rec['index'] + $d; $j >= 0 && $j < count($rec['pages']); $j += $d) { $m = txi_page_media($pdo, $rec['pages'][$j]); if ($m > 0) { $out[$k] = $viewMedia($m) + ['view' => $j + 1]; break; } }
        }
    } elseif (!empty($reg['manifest']) && !empty($reg['n'])) {
        $out['register'] = true; $out['kind'] = 'iiif'; $out['title'] = (string) ($reg['register'] ?? ''); $out['url'] = (string) ($reg['page_url'] ?? $reg['manifest']);
        $n = (int) $reg['n']; $out['view'] = $n; $out['total'] = (int) ($reg['total'] ?? 0);
        $s = $pdo->prepare('SELECT media_id FROM atelier_iiif_views WHERE manifest=? AND n=?');
        foreach ([1 => 'next_view', -1 => 'prev_view'] as $d => $k) {
            $nn = $n + $d; if ($nn < 1 || ($out['total'] && $nn > $out['total'])) { continue; }
            $s->execute([$reg['manifest'], $nn]); $m = (int) $s->fetchColumn();
            $out[$k] = ($m > 0 && record_exists($pdo, 'media', $m) ? $viewMedia($m) : ['media_id' => 0, 'filename' => '', 'act_id' => 0, 'last_act' => 0]) + ['view' => $nn, 'iiif' => $nn];
        }
    }
    if ($pos !== false) { $out['prev_act'] = $here[$pos - 1] ?? 0; $out['next_act'] = $here[$pos + 1] ?? 0; $out['index'] = $pos + 1; }
    if (!$out['prev_act'] && ($out['prev_view']['last_act'] ?? 0)) { $out['prev_act'] = (int) $out['prev_view']['last_act']; } // ◀ : le dernier acte de la vue d'avant
    $out['reg_key'] = txi_reg_key($reg, $rec, (string) ($act['place'] ?? ''));
    if ($out['reg_key'] !== '') {
        $s = $pdo->prepare('SELECT model FROM atelier_reg_models WHERE reg_key=?'); $s->execute([$out['reg_key']]); $m = (string) ($s->fetchColumn() ?: '');
        if (!function_exists('htr_dir')) { require_once __DIR__ . '/htr_setup.php'; }
        $out['model'] = $m !== '' && is_file(htr_dir() . '/models/' . basename($m)) ? $m : ''; // un modèle effacé depuis : le modèle de départ
    }
    return $out;
}

/** 🎓 le modèle de lecture choisi pour un registre ('' : le modèle de départ) */
function txi_reg_model_set(PDO $pdo, array $d): array
{
    $key = (string) ($d['reg_key'] ?? ''); $model = basename((string) ($d['model'] ?? ''));
    if (!preg_match('/^[rin]:[0-9a-f]{1,16}$/', $key)) { throw new LcndaBadInput(i18n_t('Registre inconnu.')); }
    $old = $pdo->prepare('SELECT model FROM atelier_reg_models WHERE reg_key=?'); $old->execute([$key]); $was = (string) ($old->fetchColumn() ?: '');
    if ($model === '') { $pdo->prepare('DELETE FROM atelier_reg_models WHERE reg_key=?')->execute([$key]); return ['reg_key' => $key, 'model' => '', 'was' => $was]; }
    if (!function_exists('htr_model_name_ok')) { require_once __DIR__ . '/htr_net.php'; }
    if (!htr_model_name_ok($model)) { throw new LcndaBadInput(i18n_t('Modèle inconnu.')); }
    $pdo->prepare('INSERT INTO atelier_reg_models(reg_key, model, label, updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(reg_key) DO UPDATE SET model=excluded.model, label=excluded.label, updated_at=CURRENT_TIMESTAMP')
        ->execute([$key, $model, mb_substr(safe_text($d['label'] ?? ''), 0, 200)]);
    return ['reg_key' => $key, 'model' => $model, 'was' => $was];
}

/* ═════════ 🌐 40. Une vue des Archives (IIIF) ═════════ */

function txi_iiif_cache_dir(): string
{
    $d = DATA_DIR . '/atelier-iiif'; if (!is_dir($d)) { @mkdir($d, 0775, true); }
    return $d;
}

/** une licence (adresse ou texte) en mots simples, et si elle interdit la réutilisation */
function txi_iiif_licence(string $l): array
{
    $low = mb_strtolower($l); $name = $l;
    if (preg_match('#etalab|licence-ouverte|open-licence|licence ouverte#', $low)) { $name = 'Licence Ouverte'; }
    elseif (preg_match('#creativecommons\.org/(licenses|publicdomain)/([a-z-]+)/?([\d.]*)#', $low, $m)) { $name = $m[1] === 'publicdomain' ? 'Domaine public (CC0)' : 'CC ' . strtoupper($m[2]) . ($m[3] !== '' ? ' ' . $m[3] : ''); }
    elseif (preg_match('#rightsstatements\.org/vocab/([a-z-]+)#i', $l, $m)) { $name = ['InC' => 'Droits réservés', 'NoC-US' => 'Libre de droits (États-Unis)', 'NoC-NC' => 'Libre, usage non commercial', 'CNE' => 'Droits non évalués', 'UND' => 'Droits non déterminés', 'NKC' => 'Pas de droits connus'][$m[1]] ?? $m[1]; }
    $warn = (bool) preg_match('#rightsstatements\.org/vocab/InC|all rights reserved|tous droits r[ée]serv[ée]s|reproduction interdite|r[ée]utilisation interdite|/licenses/[a-z-]*nd[a-z-]*/#i', $l);
    return ['name' => mb_substr($name, 0, 300), 'warn' => $warn];
}

/** le manifeste (Presentation 2 ou 3), ou une seule image IIIF (info.json) → titre, cote, licence, mention, lien source, vues [{label, service, direct}] */
function txi_iiif_parse(string $json, string $url): array
{
    $m = json_decode($json, true);
    if (!is_array($m)) { throw new LcndaBadInput(i18n_t('Ce n’est pas une adresse IIIF. Télécharge la vue depuis le site des Archives, puis ajoute-la.')); }
    $svc = static function ($s): string { if (is_array($s) && array_is_list($s)) { $s = $s[0] ?? null; } return is_array($s) ? rtrim((string) ($s['@id'] ?? $s['id'] ?? ''), '/') : ''; };
    $link = static function ($x): string { if (is_string($x)) { return $x; } if (is_array($x) && array_is_list($x)) { $x = $x[0] ?? null; } return is_array($x) ? (string) ($x['@id'] ?? $x['id'] ?? '') : ''; };
    $views = [];
    $ctx = json_encode($m['@context'] ?? '') ?: '';
    if (str_contains($ctx, 'image') && (isset($m['protocol']) || in_array($m['type'] ?? $m['@type'] ?? '', ['ImageService2', 'ImageService3', 'iiif:Image'], true))) { // une seule image (info.json)
        $views[] = ['label' => '1', 'service' => rtrim((string) ($m['@id'] ?? $m['id'] ?? preg_replace('#/info\.json$#', '', $url)), '/'), 'direct' => ''];
    } elseif (isset($m['sequences'][0]['canvases']) && is_array($m['sequences'][0]['canvases'])) {
        foreach ($m['sequences'][0]['canvases'] as $i => $c) {
            $res = $c['images'][0]['resource'] ?? null; if (!is_array($res)) { continue; }
            $views[] = ['label' => iiif_label($c['label'] ?? '') ?: (string) ($i + 1), 'service' => $svc($res['service'] ?? null), 'direct' => (string) ($res['@id'] ?? '')];
        }
    } elseif (isset($m['items']) && is_array($m['items'])) {
        foreach ($m['items'] as $i => $c) {
            $body = $c['items'][0]['items'][0]['body'] ?? null; if (is_array($body) && array_is_list($body)) { $body = $body[0] ?? null; } if (!is_array($body)) { continue; }
            $views[] = ['label' => iiif_label($c['label'] ?? '') ?: (string) ($i + 1), 'service' => $svc($body['service'] ?? null), 'direct' => (string) ($body['id'] ?? '')];
        }
    } else { throw new LcndaBadInput(i18n_t('Ce n’est pas une adresse IIIF. Télécharge la vue depuis le site des Archives, puis ajoute-la.')); }
    $views = array_values(array_filter($views, static fn($v) => preg_match('#^https?://#i', $v['service']) || preg_match('#^https?://#i', $v['direct'])));
    if (!$views) { throw new LcndaBadInput(i18n_t('Aucune image dans ce manifeste.')); }
    $cote = '';
    foreach ((array) ($m['metadata'] ?? []) as $md) {
        if (!is_array($md)) { continue; }
        if (preg_match('/\b(cote|shelf ?mark|call ?number|signature|r[ée]f[ée]rence|identifi)/i', iiif_label($md['label'] ?? ''))) { $cote = iiif_label($md['value'] ?? ''); break; }
    }
    $lic = is_array($m['license'] ?? null) ? implode(' ', array_map('strval', array_filter($m['license'], 'is_string'))) : (string) ($m['license'] ?? $m['rights'] ?? '');
    $attr = iiif_label($m['attribution'] ?? ($m['requiredStatement']['value'] ?? ''));
    $L = txi_iiif_licence($lic !== '' ? $lic : $attr);
    $page = $link($m['related'] ?? $m['homepage'] ?? '');
    return ['title' => mb_substr(iiif_label($m['label'] ?? '') ?: i18n_t('Registre en ligne'), 0, 300), 'cote' => mb_substr($cote, 0, 80), 'attribution' => mb_substr($attr, 0, 500),
        'licence' => $lic !== '' ? $L['name'] : '', 'licence_url' => preg_match('#^https?://#', $lic) ? $lic : '', 'licence_warn' => $L['warn'] || txi_iiif_licence($attr)['warn'],
        'page_url' => preg_match('#^https?://#i', $page) ? mb_substr($page, 0, 2000) : '', 'views' => array_slice($views, 0, 5000)];
}

/** le manifeste lu (gardé une heure : « Vue suivante » ne le relit pas à chaque clic) */
function txi_iiif_manifest(string $url, bool $fresh = false): array
{
    $url = trim($url); if ($url === '') { throw new LcndaBadInput(i18n_t('Colle l’adresse IIIF donnée par le site des Archives.')); }
    if (!preg_match('#^https?://#i', $url)) { throw new LcndaBadInput(i18n_t('Ce n’est pas une adresse IIIF. Télécharge la vue depuis le site des Archives, puis ajoute-la.')); }
    require_once __DIR__ . '/recueil_iiif.php';
    $f = txi_iiif_cache_dir() . '/' . sha1($url) . '.json';
    if (!$fresh && is_file($f) && time() - (int) filemtime($f) < 3600) { $c = json_decode((string) file_get_contents($f), true); if (is_array($c) && !empty($c['views'])) { return $c; } }
    $p = txi_iiif_parse(iiif_get($url, IIIF_MANIFEST_MAX), $url);
    @file_put_contents($f, json_encode($p, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    return $p;
}

function txi_iiif_size_url(array $v, string $size): string
{
    return preg_match('#^https?://#i', $v['service']) ? $v['service'] . '/full/' . $size . '/0/default.jpg' : $v['direct'];
}

/** GET iiif_preview : ce que dit le manifeste, avant de rien télécharger d'autre */
function txi_iiif_preview(string $url): array
{
    if (txi_kiosk()) { throw new LcndaBadInput(i18n_t('Pas en mode consultation.')); }
    $p = txi_iiif_manifest($url, true);
    return ['title' => $p['title'], 'cote' => $p['cote'], 'attribution' => $p['attribution'], 'licence' => $p['licence'], 'licence_url' => $p['licence_url'], 'licence_warn' => $p['licence_warn'],
        'page_url' => $p['page_url'], 'count' => count($p['views']), 'labels' => array_column($p['views'], 'label')];
}

/** GET iiif_thumb : la petite vignette d'une vue d'un manifeste déjà lu (jamais une autre adresse) */
function txi_iiif_thumb(string $manifest, int $n): never
{
    $f = txi_iiif_cache_dir() . '/' . sha1(trim($manifest)) . '.json';
    $p = is_file($f) ? json_decode((string) file_get_contents($f), true) : null;
    $v = is_array($p) ? ($p['views'][$n - 1] ?? null) : null;
    if (!$v) { http_response_code(404); exit; }
    $t = txi_iiif_cache_dir() . '/t-' . sha1($manifest . '#' . $n) . '.jpg';
    if (!is_file($t)) {
        if (txi_kiosk()) { http_response_code(404); exit; } // en consultation : seulement les vignettes déjà là, rien ne part sur Internet
        require_once __DIR__ . '/recueil_iiif.php';
        try { $bytes = iiif_get(txi_iiif_size_url($v, '!200,200'), 3 * 1024 * 1024); } catch (Throwable $e) { http_response_code(404); exit; }
        if (iiif_image_ext($bytes) === '') { http_response_code(404); exit; }
        @file_put_contents($t, $bytes);
    }
    header('Content-Type: ' . ((@getimagesize($t)['mime'] ?? '') ?: 'image/jpeg')); header('Cache-Control: private, max-age=86400');
    readfile($t); exit;
}

/**
 * POST iiif_open {url, n} : la vue n seulement, en bonne résolution, dans les Médias (déjà là : reprise) →
 * {media_id, filename, n, total, reg: {register, cote, archive, attribution, licence, licence_warn, page_url, manifest, n, total, view}}
 */
function txi_iiif_open(PDO $pdo, array $d): array
{
    $url = trim((string) ($d['url'] ?? ''));
    $p = txi_iiif_manifest($url);
    $total = count($p['views']); $n = safe_int($d['n'] ?? 1);
    if ($n < 1 || $n > $total) { throw new LcndaBadInput(i18n_t('Cette vue n’existe pas (le registre a {n} vues).', ['n' => (string) $total])); }
    $v = $p['views'][$n - 1];
    $reg = ['register' => $p['title'], 'cote' => $p['cote'], 'archive' => $p['attribution'], 'attribution' => $p['attribution'], 'licence' => $p['licence'], 'licence_warn' => $p['licence_warn'],
        'page_url' => $p['page_url'], 'manifest' => $url, 'n' => $n, 'total' => $total, 'view' => $n];
    // la même vue demandée deux fois en même temps (double clic, deux onglets) : la seconde attend, puis reprend la première
    $lock = @fopen(txi_iiif_cache_dir() . '/open-' . sha1($url . '#' . $n) . '.lock', 'c'); if ($lock) { flock($lock, LOCK_EX); }
    try { return txi_iiif_open_locked($pdo, $url, $n, $total, $v, $p, $reg); } finally { if ($lock) { flock($lock, LOCK_UN); fclose($lock); } }
}

function txi_iiif_open_locked(PDO $pdo, string $url, int $n, int $total, array $v, array $p, array $reg): array
{
    $s = $pdo->prepare('SELECT v.media_id, m.filename FROM atelier_iiif_views v JOIN media m ON m.id=v.media_id WHERE v.manifest=? AND v.n=?'); $s->execute([$url, $n]); $have = $s->fetch(PDO::FETCH_ASSOC);
    if ($have && is_file(MEDIA_DIR . '/' . $have['filename'])) { return ['media_id' => (int) $have['media_id'], 'filename' => (string) $have['filename'], 'n' => $n, 'total' => $total, 'label' => $v['label'], 'reg' => $reg, 'reused' => true]; }
    require_once __DIR__ . '/recueil_iiif.php';
    $bytes = '';
    foreach (array_unique(array_filter([txi_iiif_size_url($v, '!3000,3000'), $v['direct']])) as $u) { try { $bytes = iiif_get($u, IIIF_IMAGE_MAX); break; } catch (LcndaBadInput $e) { $last = $e; } }
    if ($bytes === '') { throw $last ?? new LcndaBadInput(i18n_t('La vue n’a pas pu être téléchargée.')); }
    $ext = iiif_image_ext($bytes);
    if ($ext === '') { throw new LcndaBadInput(i18n_t('La vue {n} n’est pas une image.', ['n' => $v['label']])); }
    if (!is_dir(MEDIA_DIR)) { @mkdir(MEDIA_DIR, 0775, true); }
    $name = bin2hex(random_bytes(16)) . '.' . $ext;
    if (file_put_contents(MEDIA_DIR . '/' . $name, $bytes) === false) { throw new RuntimeException(i18n_t('Impossible de ranger la photo dans les médias.')); }
    $mention = trim(implode("\n", array_filter([$p['attribution'] !== '' ? i18n_t('Source : {s}', ['s' => $p['attribution']]) : '', $p['licence'] !== '' ? i18n_t('Licence : {l}', ['l' => $p['licence']]) : '', $p['page_url'] ?: $url])));
    $pdo->prepare("INSERT INTO media(title, description, media_type, filename, thumbnail, document_reference, document_title, document_url) VALUES(?,?,'image',?,?,?,?,?)")
        ->execute([mb_substr($p['title'] . ' — ' . i18n_t('vue {n}', ['n' => $v['label']]), 0, 300), mb_substr($mention, 0, 2000), $name, $name, $p['cote'], mb_substr($p['title'], 0, 300), mb_substr($p['page_url'] ?: $url, 0, 2000)]);
    $mid = (int) $pdo->lastInsertId();
    $pdo->prepare('INSERT INTO atelier_iiif_views(manifest, n, media_id) VALUES(?,?,?) ON CONFLICT(manifest, n) DO UPDATE SET media_id=excluded.media_id')->execute([$url, $n, $mid]);
    return ['media_id' => $mid, 'filename' => $name, 'n' => $n, 'total' => $total, 'label' => $v['label'], 'reg' => $reg, 'reused' => false];
}

/* ═════════ 🔎 36. Chercher dans toutes les transcriptions ═════════ */

/** la clé de prononciation d'un mot (« ≈ orthographes voisines ») : Mazaud, Mazeaud, Mazaut, Masaud, Mazand → « maso » */
function txi_phon(string $w): string
{
    $w = txi_norm($w); $w = str_replace(' ', '', $w);
    if ($w === '' || ctype_digit($w)) { return $w; }
    $w = (string) preg_replace('/(?<=[aeiou])n(?=[bcdfgjklmpqrstvwxz]|$)/', 'u', $w); // u / n : « Mazand » ≈ « Mazaud »
    $w = strtr($w, ['eaux' => 'o', 'eau' => 'o', 'aux' => 'o', 'au' => 'o', 'ph' => 'f', 'qu' => 'k', 'ck' => 'k', 'ai' => 'e', 'ei' => 'e', 'y' => 'i', 'z' => 's', 'w' => 'v']);
    $w = (string) preg_replace('/c(?=[aou]|$)/', 'k', $w); $w = (string) preg_replace('/c(?=[eiy])/', 's', $w);
    $w = (string) preg_replace('/(?<!c)h/', '', $w); $w = (string) preg_replace('/(.)\1+/', '$1', $w);
    $w = (string) preg_replace('/[dtxsz]+$/', '', $w); if (strlen($w) > 3) { $w = (string) preg_replace('/e$/', '', $w); }
    return $w;
}

/** les mots d'un texte (lettres, chiffres, apostrophes gardées à part) */
function txi_words(string $s): array
{
    preg_match_all('/[\p{L}\p{N}ſ]+/u', $s, $m);
    return $m[0];
}

function txi_u16(string $s): int { return intdiv(strlen((string) mb_convert_encoding($s, 'UTF-16LE', 'UTF-8')), 2); }

/** l'index remis à jour : les actes nouveaux ou changés (date de modification, taille), les actes supprimés retirés */
function txi_fts_sync(PDO $pdo): int
{
    $rows = $pdo->query('SELECT id, updated_at, length(body) AS lb, length(data_json) AS ld FROM act_transcriptions')->fetchAll(PDO::FETCH_ASSOC);
    $state = $pdo->query('SELECT act_id, stamp FROM atelier_fts_state')->fetchAll(PDO::FETCH_KEY_PAIR);
    $want = []; foreach ($rows as $r) { $want[(int) $r['id']] = $r['updated_at'] . '|' . $r['lb'] . '|' . $r['ld']; }
    $changed = array_keys(array_filter($want, static fn($st, $id) => ($state[$id] ?? null) !== $st, ARRAY_FILTER_USE_BOTH));
    $gone = array_diff(array_map('intval', array_keys($state)), array_keys($want));
    if (!$changed && !$gone) { return 0; }
    $own = !$pdo->inTransaction(); if ($own) { $pdo->beginTransaction(); }
    try {
        $del = $pdo->prepare('DELETE FROM atelier_fts WHERE act_id=?'); $delS = $pdo->prepare('DELETE FROM atelier_fts_state WHERE act_id=?');
        foreach ($gone as $id) { $del->execute([$id]); $delS->execute([$id]); }
        $get = $pdo->prepare('SELECT body, data_json FROM act_transcriptions WHERE id=?');
        $ins = $pdo->prepare('INSERT INTO atelier_fts(text, phon, act_id, line, layer, s, e) VALUES(?,?,?,?,?,?,?)');
        $st = $pdo->prepare('INSERT INTO atelier_fts_state(act_id, stamp) VALUES(?,?) ON CONFLICT(act_id) DO UPDATE SET stamp=excluded.stamp');
        foreach ($changed as $id) {
            $del->execute([$id]); $get->execute([$id]); $r = $get->fetch(PDO::FETCH_ASSOC); if (!$r) { continue; }
            $data = json_decode((string) $r['data_json'], true) ?: [];
            $layers = ['f' => (string) $r['body']] + (is_string($data['modern']['text'] ?? null) ? ['m' => (string) $data['modern']['text']] : []);
            foreach ($layers as $layer => $text) {
                foreach (txi_text_lines(str_replace("\r", '', $text)) as $k => $l) {
                    $ins->execute([$l['text'], implode(' ', array_map('txi_phon', txi_words($l['text']))), $id, $k + 1, $layer, $l['s'], $l['e']]);
                }
            }
            $st->execute([$id, $want[$id]]);
        }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    return count($changed) + count($gone);
}

/** la zone d'une ligne (celle qui la couvre le plus) */
function txi_zone_of(array $zones, int $s, int $e): ?array
{
    $best = null; $bo = 0;
    foreach ($zones as $z) { if (!is_array($z) || ($z['e'] ?? 0) <= ($z['s'] ?? 0) || in_array($z['kind'] ?? '', ['skip'], true)) { continue; } $o = min((int) $z['e'], $e) - max((int) $z['s'], $s); if ($o > $bo) { $bo = $o; $best = $z; } }
    return $best;
}

/**
 * GET search {q, near} → {hits: [{act_id, title, kind, date_text, place, line, text, words, variant, layer, zone, goto: {s, e}}], acts, lines, indexed}
 * Les résultats exacts d'abord ; avec near, les orthographes voisines (variant : le mot trouvé), bien distinguées.
 */
function txi_search(PDO $pdo, string $q, bool $near, int $limit = 60): array
{
    try { $pdo->query('SELECT 1 FROM atelier_fts LIMIT 1'); } catch (Throwable $e) { throw new RuntimeException(i18n_t('La recherche plein texte n’est pas possible ici (SQLite sans FTS5).')); }
    txi_fts_sync($pdo);
    $limit = max(1, min(200, $limit));
    $toks = [];
    foreach (txi_words($q) as $w) { foreach (explode(' ', txi_norm($w)) as $t) { if (mb_strlen($t) >= 2 && !in_array($t, $toks, true)) { $toks[] = $t; } } }
    $indexed = (int) $pdo->query("SELECT COUNT(*) FROM atelier_fts WHERE layer='f'")->fetchColumn();
    if (!$toks) { return ['hits' => [], 'acts' => 0, 'lines' => 0, 'indexed' => $indexed, 'q' => $q]; }
    $exactQ = implode(' AND ', array_map(static fn($t) => 'text : "' . str_replace('"', '', $t) . '"*', array_slice($toks, 0, 8)));
    $sel = 'SELECT f.rowid AS rid, f.text, f.act_id, f.line, f.layer, f.s, f.e FROM atelier_fts f WHERE atelier_fts MATCH ? ORDER BY f.act_id, f.layer, f.line LIMIT ' . ($limit * 3);
    $st = $pdo->prepare($sel);
    $st->execute([$exactQ]); $exact = $st->fetchAll(PDO::FETCH_ASSOC);
    $var = [];
    if ($near) {
        $phons = array_values(array_unique(array_filter(array_map('txi_phon', $toks), static fn($p) => strlen($p) >= 2)));
        if ($phons) { $st->execute([implode(' AND ', array_map(static fn($p) => 'phon : "' . $p . '"', array_slice($phons, 0, 8)))]); $var = $st->fetchAll(PDO::FETCH_ASSOC); }
    }
    $seen = []; $hits = []; $actCache = [];
    $act = static function (int $id) use ($pdo, &$actCache): ?array { return $actCache[$id] ??= txi_act_row($pdo, $id); };
    $add = static function (array $r, bool $isVar) use (&$seen, &$hits, $act, $toks): void {
        $key = $r['act_id'] . ':' . $r['line'];
        if (isset($seen[$key])) { return; } // la même ligne (fidèle ou modernisée) une seule fois
        $a = $act((int) $r['act_id']); if (!$a) { return; }
        $words = []; $variant = '';
        foreach (txi_words((string) $r['text']) as $w) {
            $n = txi_norm($w);
            foreach ($toks as $t) {
                if (str_starts_with($n, $t)) { $words[] = $w; continue 2; }
                if ($isVar && txi_phon($w) === txi_phon($t)) { $words[] = $w; $variant = $variant ?: $w; continue 2; }
            }
        }
        if ($isVar && !$variant) { return; }
        $seen[$key] = true;
        $text = (string) $r['text']; $first = $words[0] ?? ''; $off = $first !== '' ? mb_strpos($text, $first) : false;
        $ls = (int) $r['s']; $gs = $off !== false ? $ls + txi_u16(mb_substr($text, 0, (int) $off)) : $ls; $ge = $off !== false ? $gs + txi_u16($first) : (int) $r['e'];
        $zones = (array) ($a['data']['zones'] ?? []);
        $zone = null; $lineS = $ls; $lineE = (int) $r['e'];
        if ($r['layer'] === 'm') { // la ligne modernisée : la zone et la place de la même ligne du texte fidèle
            $fl = txi_text_lines((string) ($a['body'] ?? ''))[(int) $r['line'] - 1] ?? null;
            if ($fl) { $lineS = $fl['s']; $lineE = $fl['e']; $gs = $lineS; $ge = $lineE; } else { $gs = $ge = 0; }
        }
        $z = txi_zone_of($zones, $lineS, $lineE); if ($z) { $zone = ['id' => (string) ($z['id'] ?? ''), 'w' => (float) ($z['w'] ?? 0), 'h' => (float) ($z['h'] ?? 0)]; }
        $hits[] = ['act_id' => (int) $a['id'], 'title' => (string) $a['title'], 'kind' => (string) $a['kind'], 'date_text' => (string) $a['date_text'], 'place' => (string) $a['place'],
            'line' => (int) $r['line'], 'text' => $text, 'words' => array_values(array_unique($words)), 'variant' => $isVar ? $variant : '', 'layer' => (string) $r['layer'], 'zone' => $zone, 'goto' => ['s' => $gs, 'e' => $ge]];
    };
    foreach ($exact as $r) { if (count($hits) >= $limit) { break; } $add($r, false); }
    foreach ($var as $r) { if (count($hits) >= $limit) { break; } $add($r, true); }
    return ['hits' => $hits, 'acts' => count(array_unique(array_column($hits, 'act_id'))), 'lines' => count($hits), 'indexed' => $indexed, 'q' => $q];
}

/** GET stats : combien d'actes et de lignes (le haut de « Transcriptions d'actes ») */
function txi_stats(PDO $pdo): array
{
    try { txi_fts_sync($pdo); $lines = (int) $pdo->query("SELECT COUNT(*) FROM atelier_fts WHERE layer='f'")->fetchColumn(); } catch (Throwable $e) { $lines = 0; }
    return ['acts' => (int) $pdo->query('SELECT COUNT(*) FROM act_transcriptions')->fetchColumn(), 'lines' => $lines];
}

/** GET thumb : le morceau d'image d'une ligne (sa zone, un peu agrandie), en petite vignette JPEG gardée en cache */
function txi_line_thumb(PDO $pdo, int $actId, string $zoneId): never
{
    $a = txi_act_row($pdo, $actId);
    $z = null; foreach ((array) ($a['data']['zones'] ?? []) as $q) { if (is_array($q) && (string) ($q['id'] ?? '') === $zoneId && $zoneId !== '') { $z = $q; break; } }
    $mid = $z ? (int) ($z['p'] ?? 0) ?: (int) ($a['media_id'] ?? 0) : 0;
    $s = $pdo->prepare("SELECT filename FROM media WHERE id=? AND media_type='image'"); $s->execute([$mid]); $fn = str_replace(['\\', "\0"], ['/', ''], (string) $s->fetchColumn());
    $root = realpath(MEDIA_DIR); $src = $fn !== '' && !str_contains($fn, '..') ? realpath(MEDIA_DIR . '/' . $fn) : false;
    if (!$z || !$root || !$src || !str_starts_with($src, $root . DIRECTORY_SEPARATOR) || !function_exists('imagecreatefromstring')) { http_response_code(404); exit; }
    $dir = DATA_DIR . '/atelier-thumbs'; if (!is_dir($dir)) { @mkdir($dir, 0775, true); }
    $out = $dir . '/' . $actId . '-' . sha1(json_encode([$z['x'], $z['y'], $z['w'], $z['h'], $fn, @filemtime($src)])) . '.jpg';
    if (!is_file($out)) {
        $info = @getimagesize($src); if (!$info || (int) $info[0] * (int) $info[1] > 120000000) { http_response_code(404); exit; }
        $im = @imagecreatefromstring((string) file_get_contents($src)); if (!$im) { http_response_code(404); exit; }
        $W = imagesx($im); $H = imagesy($im); $pad = (float) $z['h'] * .15;
        $x = max(0, (int) floor((float) $z['x'])); $y = max(0, (int) floor((float) $z['y'] - $pad)); $w = min($W - $x, (int) ceil((float) $z['w'])); $h = min($H - $y, (int) ceil((float) $z['h'] + 2 * $pad));
        if ($w < 2 || $h < 2) { http_response_code(404); exit; }
        $th = 56; $tw = (int) max(1, min(900, round($w * $th / $h))); if ($tw === 900) { $th = (int) max(1, round($h * 900 / $w)); }
        $t = imagecreatetruecolor($tw, $th); imagecopyresampled($t, $im, 0, 0, $x, $y, $tw, $th, $w, $h);
        imagejpeg($t, $out, 82);
    }
    header('Content-Type: image/jpeg'); header('Cache-Control: private, max-age=3600');
    readfile($out); exit;
}

/* ═════════ 🔤 38. La version modernisée proposée par l'IA locale ═════════ */

/** POST modern_ai {text, lang, model} → {text, model} : même nombre de lignes, rien d'inventé ; seulement l'IA de cet ordinateur (Ollama) */
function txi_modern_ai(array $d): array
{
    $text = mb_substr(str_replace("\r", '', (string) ($d['text'] ?? '')), 0, 20000);
    if (trim($text) === '') { throw new LcndaBadInput(i18n_t('Le texte est vide : lis ou écris d’abord l’acte.')); }
    require_once __DIR__ . '/transcription_actes.php';
    $st = tx_deep_status();
    if (!$st['running']) { throw new LcndaBadInput(i18n_t('L’IA de cet ordinateur (Ollama) n’est pas lancée : ouvre-la, ou utilise « 📖 Développer les abréviations » (sans IA).')); }
    $model = (string) ($d['model'] ?? '');
    $present = array_values(array_filter(array_merge($st['models'], $st['others'] ?? []), static fn($m) => !empty($m['present'])));
    if ($model === '' || !in_array($model, array_column($present, 'tag'), true)) { $model = (string) (array_values(array_filter($present, static fn($m) => !empty($m['recommended'])))[0]['tag'] ?? $present[0]['tag'] ?? ''); }
    if ($model === '' || !tx_deep_tag_ok($model)) { throw new LcndaBadInput(i18n_t('Aucun modèle d’IA installé pour la lecture approfondie.')); }
    $lines = explode("\n", $text); $n = count($lines);
    $prompt = "Tu modernises la transcription d'un acte ancien (langue : " . mb_substr(safe_text($d['lang'] ?? 'fra'), 0, 12) . ").\n"
        . "- Une ligne de la transcription = une ligne de ta réponse, dans le même ordre : exactement {$n} lignes (une ligne vide reste vide).\n"
        . "- Orthographe actuelle, abréviations développées (9bre → novembre, lab. → laboureur), ſ → s, noms de famille en CAPITALES.\n"
        . "- Ne rien ajouter, ne rien inventer, ne rien résumer ; un mot illisible [?] reste [?].\n"
        . "- Réponds seulement par le texte, sans commentaire.\n\nTranscription :\n" . $text;
    $out = '';
    $r = tx_deep_http('POST', '/api/chat', ['model' => $model, 'stream' => true, 'messages' => [['role' => 'user', 'content' => $prompt]], 'options' => ['temperature' => 0]], 300,
        static function (array $j) use (&$out) { $out .= (string) ($j['message']['content'] ?? ''); return true; });
    if (!$r['ok'] && trim($out) === '') { throw new RuntimeException(i18n_t('L’IA n’a pas répondu.')); }
    $got = explode("\n", trim(str_replace("\r", '', $out), "\n"));
    // même nombre de lignes que le texte fidèle (une ligne en trop ou en moins : complétée ou coupée)
    $got = array_slice(array_pad($got, $n, ''), 0, $n);
    foreach ($lines as $i => $l) { if (trim($l) === '') { $got[$i] = ''; } }
    return ['text' => implode("\n", $got), 'model' => $model];
}
