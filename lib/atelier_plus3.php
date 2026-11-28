<?php
declare(strict_types=1);
/**
 * 📜 Atelier de transcription, outils en plus (3) — le côté serveur (heritage-atelier-plus3.js).
 *   GET  api.php?action=atelier_plus3&op=…        doubts · word_thumb · twins · privacy · people_info
 *   POST api.php?action=atelier_plus3_write {op}  doubt_fix · twin_link
 * ❓ 11 doubts : les mots douteux de tous les actes (« Ma?aud », « mot[?] », « Ma…d », « [illisible] »), avec la zone de leur ligne ;
 *        word_thumb : le morceau d'image du mot (exact si la lecture a donné la place des mots, sinon estimé dans la ligne) ;
 *        doubt_fix : un mot corrigé dans un autre acte, le texte d'avant gardé dans 🕘 Versions, zones et personnes décalées.
 * 🔗 14 twins : les actes jumeaux possibles d'un acte (mêmes personnes, dates proches) ; twin_link : le lien confirmé, gardé dans
 *        les deux actes (data.twins) — l'acte ouvert dans l'Atelier le garde lui-même (pas de conflit d'enregistrement).
 * 🎤 12 privacy : l'acte touche-t-il une fiche vivante ou confidentielle, ou est-il récent (la dictée en ligne n'est alors pas proposée) ?
 * 👥 8  people_info : le nom des fiches reliées (« fiche confidentielle » en consultation).
 * Rien de nouveau dans la base : data_json des actes (lib/atelier_plus3_data.php). Essai : tests/test-atelier-plus3.js.
 */

require_once __DIR__ . '/atelier_idees.php';
require_once __DIR__ . '/atelier_plus3_data.php';

function txp3_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        txi_ensure($pdo);
        if (!$isWrite && $action === 'atelier_plus3') {
            $op = (string) ($_GET['op'] ?? '');
            if ($op === 'word_thumb') { txp3_word_thumb($pdo, safe_int($_GET['act'] ?? 0), (string) ($_GET['zone'] ?? ''), safe_int($_GET['s'] ?? 0), safe_int($_GET['e'] ?? 0)); }
            json_response(match ($op) {
                'doubts' => txp3_doubts($pdo, min(1500, max(1, safe_int($_GET['limit'] ?? 600)))),
                'twins' => txp3_twins($pdo, safe_int($_GET['act_id'] ?? 0)),
                'privacy' => txp3_privacy($pdo, safe_int($_GET['act_id'] ?? 0)),
                'people_info' => txp3_people_info($pdo, (string) ($_GET['ids'] ?? '')),
                default => throw new LcndaBadInput('Opération inconnue.'),
            });
        }
        if ($isWrite && $action === 'atelier_plus3_write') {
            if (txi_kiosk()) { throw new LcndaBadInput(i18n_t('Pas en mode consultation.')); }
            json_response(match ((string) ($payload['op'] ?? '')) {
                'doubt_fix' => txp3_doubt_fix($pdo, $payload),
                'twin_link' => txp3_twin_link($pdo, $payload),
                default => throw new LcndaBadInput('Opération inconnue.'),
            });
        }
        json_response(['error' => 'Action inconnue.'], 400);
    } catch (LcndaConflict $e) {
        json_response(['error' => $e->getMessage(), 'conflict' => true], 409);
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], str_contains($e->getMessage(), 'introuvable') ? 404 : 422);
    } catch (Throwable $e) {
        error_log('LCNDA atelier_plus3 : ' . $e->getMessage());
        json_response(['error' => i18n_t('Cette fonction de l’Atelier n’est pas disponible ici.'), 'unavailable' => true], 422);
    }
}

/* ═════════ les positions du texte comme dans le navigateur (UTF-16) ═════════ */

function txp3_u16_slice(string $s, int $a, ?int $b = null): string
{
    $u = (string) mb_convert_encoding($s, 'UTF-16LE', 'UTF-8');
    $n = intdiv(strlen($u), 2); $a = max(0, min($n, $a)); $b = $b === null ? $n : max($a, min($n, $b));
    return (string) mb_convert_encoding(substr($u, 2 * $a, 2 * ($b - $a)), 'UTF-8', 'UTF-16LE');
}

/** les actes à laisser de côté en consultation (une fiche vivante ou confidentielle y est reliée) */
function txp3_hidden_acts(PDO $pdo, array $acts): array
{
    $hid = act_doc_hidden_ids($pdo); if (!$hid) { return []; }
    $out = [];
    foreach ($acts as $id => $r) { foreach ((array) ($r['data']['people'] ?? []) as $p) { if (is_array($p) && isset($hid[(int) ($p['person_id'] ?? 0)])) { $out[(int) $id] = true; break; } } }
    return $out;
}

/** tous les actes avec leur texte : [id => row] */
function txp3_acts(PDO $pdo, int $limit = 5000): array
{
    $out = [];
    foreach ($pdo->query('SELECT t.id, t.title, t.kind, t.media_id, t.date_text, t.place, t.body, t.data_json, m.filename FROM act_transcriptions t LEFT JOIN media m ON m.id=t.media_id ORDER BY t.id LIMIT ' . max(1, $limit)) as $r) {
        $r['data'] = json_decode((string) $r['data_json'], true) ?: []; unset($r['data_json']);
        $out[(int) $r['id']] = $r;
    }
    return $out;
}

/* ═════════ ❓ 11. Les mots douteux ═════════ */

/** les mots douteux d'un texte (la même règle que scanDoubts, heritage-atelier-plus3-data.js) : [{s, e, word, line, kind}] (positions UTF-16) */
function txp3_scan_doubts(string $body): array
{
    $out = []; $pos = 0; $ln = 1;
    foreach (explode("\n", $body) as $L) {
        if (preg_match_all('/\S+/u', $L, $m, PREG_OFFSET_CAPTURE)) {
            foreach ($m[0] as [$w, $off]) {
                $kind = preg_match('/\[illisible\]/iu', $w) ? 'illisible' : (preg_match('/\[\?\]/u', $w) || preg_match('/^\?+$/u', $w) ? 'mark'
                    : (preg_match('/\p{L}\?|\?\p{L}|\p{L}(?:…|\.{3})|(?:…|\.{3})\p{L}|^…$/u', $w) ? 'word' : ''));
                if ($kind === '') { continue; }
                $s = $pos + txi_u16(substr($L, 0, $off));
                $out[] = ['s' => $s, 'e' => $s + txi_u16($w), 'word' => $w, 'line' => $ln, 'kind' => $kind];
            }
        }
        $pos += txi_u16($L) + 1; $ln++;
    }
    return $out;
}

/** GET doubts → {items: [{act_id, title, date_text, place, s, e, word, kind, line, text (la ligne), zone}], acts, total, more} */
function txp3_doubts(PDO $pdo, int $limit): array
{
    $acts = txp3_acts($pdo); $hidden = txp3_hidden_acts($pdo, $acts);
    $items = []; $total = 0; $withDoubt = 0;
    foreach ($acts as $id => $a) {
        if (isset($hidden[$id])) { continue; }
        $body = (string) $a['body']; $hits = txp3_scan_doubts($body); if (!$hits) { continue; }
        $withDoubt++; $lines = explode("\n", $body);
        foreach ($hits as $h) {
            $total++; if (count($items) >= $limit) { continue; }
            $lineText = (string) ($lines[$h['line'] - 1] ?? '');
            $z = txi_zone_of((array) ($a['data']['zones'] ?? []), $h['s'], $h['e']);
            $items[] = ['act_id' => $id, 'title' => (string) $a['title'], 'kind' => (string) $a['kind'], 'date_text' => (string) $a['date_text'], 'place' => (string) $a['place']] + $h
                + ['text' => mb_substr($lineText, 0, 300), 'zone' => $z ? (string) ($z['id'] ?? '') : ''];
        }
    }
    return ['items' => $items, 'acts' => $withDoubt, 'total' => $total, 'more' => max(0, $total - count($items))];
}

/** GET word_thumb : le morceau d'image d'un mot (sa ligne, resserrée autour du mot), JPEG en cache */
function txp3_word_thumb(PDO $pdo, int $actId, string $zoneId, int $s, int $e): never
{
    $a = txi_act_row($pdo, $actId);
    if ($a && txp3_hidden_acts($pdo, [$actId => $a])) { http_response_code(404); exit; }
    $z = null; foreach ((array) ($a['data']['zones'] ?? []) as $q) { if (is_array($q) && (string) ($q['id'] ?? '') === $zoneId && $zoneId !== '') { $z = $q; break; } }
    $mid = $z ? (int) ($z['p'] ?? 0) ?: (int) ($a['media_id'] ?? 0) : 0;
    $st = $pdo->prepare("SELECT filename FROM media WHERE id=? AND media_type='image'"); $st->execute([$mid]); $fn = str_replace(['\\', "\0"], ['/', ''], (string) $st->fetchColumn());
    $root = realpath(MEDIA_DIR); $src = $fn !== '' && !str_contains($fn, '..') ? realpath(MEDIA_DIR . '/' . $fn) : false;
    if (!$z || !$root || !$src || !str_starts_with($src, $root . DIRECTORY_SEPARATOR) || !function_exists('imagecreatefromstring')) { http_response_code(404); exit; }
    // où est le mot dans la ligne : la place donnée par la lecture (wb), sinon d'après la place des lettres
    $zs = (int) ($z['s'] ?? 0); $ze = (int) ($z['e'] ?? 0); $len = max(1, $ze - $zs);
    $r0 = max(0, min($len, $s - $zs)); $r1 = max($r0, min($len, $e - $zs));
    $zx = (float) $z['x']; $zw = (float) $z['w']; $zh = (float) $z['h'];
    $x0 = $zx + $zw * $r0 / $len; $x1 = $zx + $zw * $r1 / $len;
    if (is_array($z['wb'] ?? null) && (int) ($z['wl'] ?? -1) === $len) {
        $xs = []; foreach ($z['wb'] as $w) { if (is_array($w) && count($w) >= 4 && (int) $w[1] > $r0 && (int) $w[0] < $r1) { $xs[] = (float) $w[2]; $xs[] = (float) $w[3]; } }
        if ($xs) { $x0 = min($xs); $x1 = max($xs); }
    }
    $pad = max($zh * .5, ($x1 - $x0) * .25);
    $dir = DATA_DIR . '/atelier-thumbs'; if (!is_dir($dir)) { @mkdir($dir, 0775, true); }
    $out = $dir . '/w' . $actId . '-' . sha1(json_encode([$x0, $x1, $z['y'], $zh, $fn, @filemtime($src)])) . '.jpg';
    if (!is_file($out)) {
        $info = @getimagesize($src); if (!$info || (int) $info[0] * (int) $info[1] > 120000000) { http_response_code(404); exit; }
        $im = @imagecreatefromstring((string) file_get_contents($src)); if (!$im) { http_response_code(404); exit; }
        $W = imagesx($im); $H = imagesy($im); $vp = $zh * .2;
        $x = max(0, (int) floor($x0 - $pad)); $y = max(0, (int) floor((float) $z['y'] - $vp)); $w = min($W - $x, (int) ceil($x1 - $x0 + 2 * $pad)); $h = min($H - $y, (int) ceil($zh + 2 * $vp));
        if ($w < 2 || $h < 2) { http_response_code(404); exit; }
        $th = 64; $tw = (int) max(1, min(520, round($w * $th / $h)));
        $t = imagecreatetruecolor($tw, $th); imagecopyresampled($t, $im, 0, 0, $x, $y, $tw, $th, $w, $h);
        imagejpeg($t, $out, 84);
    }
    header('Content-Type: image/jpeg'); header('Cache-Control: private, max-age=3600');
    readfile($out); exit;
}

/** une place du texte après un remplacement de [s, e) par $n lettres (UTF-16) : avant, rien ; après, décalée ; dedans, au bout du nouveau mot */
function txp3_shift(int $p, int $s, int $e, int $n): int
{
    if ($p <= $s) { return $p; }
    if ($p >= $e) { return $p + $n - ($e - $s); }
    return $s + $n;
}

/** POST doubt_fix {act_id, s, e, old, new} → {act_id, s, e, word, old, version_id, rev} : le texte d'avant gardé dans 🕘 Versions */
function txp3_doubt_fix(PDO $pdo, array $d): array
{
    require_once __DIR__ . '/transcriptions.php';
    $id = safe_int($d['act_id'] ?? 0); $s = safe_int($d['s'] ?? -1); $e = safe_int($d['e'] ?? -1);
    $old = (string) ($d['old'] ?? ''); $new = mb_substr(str_replace(["\0", "\r", "\n"], ['', '', ' '], is_scalar($d['new'] ?? '') ? (string) $d['new'] : ''), 0, 200);
    $st = $pdo->prepare('SELECT t.*, ' . ACT_REV_SQL . ' AS rev0 FROM act_transcriptions t WHERE t.id=?'); $st->execute([$id]); $a = $st->fetch(PDO::FETCH_ASSOC);
    if (!$a) { throw new RuntimeException(i18n_t('Transcription introuvable.')); }
    if (trim($new) === '') { throw new LcndaBadInput(i18n_t('Écris la bonne lecture du mot.')); }
    $body = (string) $a['body']; $n16 = txi_u16($body);
    if ($s < 0 || $e <= $s || $e > $n16 || txp3_u16_slice($body, $s, $e) !== $old) { throw new LcndaConflict(i18n_t('Ce mot a changé dans l’acte entre-temps : rien n’a été changé.')); }
    $data = json_decode((string) $a['data_json'], true) ?: [];
    $vid = (int) save_act_transcription_version($pdo, ['act_id' => $id, 'label' => mb_substr('Avant : « ' . $old . ' » → « ' . $new . ' »', 0, 120), 'body' => $body, 'data' => $data, 'auto' => 0])['id'];
    $n = txi_u16($new);
    $newBody = txp3_u16_slice($body, 0, $s) . $new . txp3_u16_slice($body, $e);
    foreach (['zones', 'people'] as $k) {
        foreach ((array) ($data[$k] ?? []) as $i => $x) { if (!is_array($x)) { continue; } foreach (['s', 'e'] as $q) { if (isset($x[$q]) && is_numeric($x[$q])) { $data[$k][$i][$q] = txp3_shift((int) $x[$q], $s, $e, $n); } }
            if ($k === 'zones' && isset($data[$k][$i]['wl']) && (int) $x['s'] <= $s && (int) $x['e'] >= $e) { unset($data[$k][$i]['wb'], $data[$k][$i]['wl']); } } // la place des mots de cette ligne est de nouveau estimée
    }
    foreach ((array) ($data['gabarit']['fields'] ?? []) as $k => $f) { if (is_array($f) && (int) ($f['s'] ?? -1) >= 0) { $data['gabarit']['fields'][$k]['s'] = txp3_shift((int) $f['s'], $s, $e, $n); $data['gabarit']['fields'][$k]['e'] = txp3_shift((int) ($f['e'] ?? 0), $s, $e, $n); } }
    foreach ((array) ($data['outline'] ?? []) as $i => $o) { if (is_array($o)) { $data['outline'][$i]['s'] = txp3_shift((int) ($o['s'] ?? 0), $s, $e, $n); } }
    $r = save_act_transcription($pdo, ['id' => $id, 'title' => $a['title'], 'kind' => $a['kind'], 'media_id' => (int) $a['media_id'], 'date_text' => $a['date_text'], 'place' => $a['place'], 'source' => $a['source'],
        'body' => $newBody, 'data' => $data, 'base_rev' => (int) $a['rev0']]);
    return ['act_id' => $id, 's' => $s, 'e' => $s + $n, 'word' => $new, 'old' => $old, 'version_id' => $vid, 'rev' => (int) ($r['rev'] ?? 0), 'updated_at' => (string) ($r['updated_at'] ?? '')];
}

/* ═════════ 🔗 14. Les actes jumeaux ═════════ */

/** le jour d'une date écrite (« 12 nov. 1787 », « 9bre 1787 », « 1787-11-12 », « 1787 ») → [jour julien approché | null, précision d|m|y|''] */
function txp3_days(string $t): array
{
    $s = txi_norm($t);
    $civ = static function (int $y, int $m, int $d): int { $y -= $m <= 2 ? 1 : 0; $era = intdiv($y >= 0 ? $y : $y - 399, 400); $yoe = $y - $era * 400; $doy = intdiv(153 * ($m + ($m > 2 ? -3 : 9)) + 2, 5) + $d - 1; $doe = $yoe * 365 + intdiv($yoe, 4) - intdiv($yoe, 100) + $doy; return $era * 146097 + $doe; };
    if (preg_match('/\b(\d{4}) (\d{1,2}) (\d{1,2})\b/', $s, $m) && (int) $m[2] >= 1 && (int) $m[2] <= 12) { return [$civ((int) $m[1], (int) $m[2], max(1, min(31, (int) $m[3]))), 'd']; }
    if (preg_match('/\b(\d{1,2}) (\d{1,2}) (\d{4})\b/', $s, $m) && (int) $m[2] >= 1 && (int) $m[2] <= 12) { return [$civ((int) $m[3], (int) $m[2], max(1, min(31, (int) $m[1]))), 'd']; }
    if (!preg_match('/\b(1[2-9]\d{2}|20\d{2})\b/', $s, $y)) { return [null, '']; }
    $months = ['janv' => 1, 'fevr' => 2, 'fev' => 2, 'mars' => 3, 'avr' => 4, 'mai' => 5, 'juin' => 6, 'juil' => 7, 'aout' => 8, 'sept' => 9, '7bre' => 9, 'oct' => 10, '8bre' => 10, 'nov' => 11, '9bre' => 11, 'dec' => 12, 'xbre' => 12, '10bre' => 12];
    $mo = 0; $mpos = -1;
    foreach ($months as $k => $v) { if (preg_match('/\b' . $k . '/', $s, $mm, PREG_OFFSET_CAPTURE)) { $mo = $v; $mpos = (int) $mm[0][1]; break; } }
    if (!$mo) { return [$civ((int) $y[1], 7, 1), 'y']; }
    if (preg_match('/\b(\d{1,2})(?: ?er)? $/', substr($s, 0, $mpos), $dd)) { return [$civ((int) $y[1], $mo, max(1, min(31, (int) $dd[1]))), 'd']; }
    return [$civ((int) $y[1], $mo, 15), 'm'];
}

/** les noms d'un acte : {full: [prénom nom], sur: [noms]} (personnes relevées, cases du gabarit, noms en capitales du texte) */
function txp3_names(array $a): array
{
    $raw = [];
    foreach ((array) ($a['data']['people'] ?? []) as $p) { if (is_array($p) && trim((string) ($p['name'] ?? '')) !== '') { $raw[] = (string) $p['name']; } }
    foreach ((array) ($a['data']['gabarit']['fields'] ?? []) as $k => $f) {
        if (!is_array($f) || !in_array((string) $k, ['enfant', 'pere', 'mere', 'parrain', 'marraine', 'epoux', 'epouse', 'defunt', 'conjoint', 'parents_epoux', 'parents_epouse', 'temoins', 'personne'], true)) { continue; }
        foreach (preg_split('/\s*(?:;|\bet\b)\s*/u', (string) ($f['v'] ?? '')) ?: [] as $part) { $part = trim((string) preg_replace('/,.*$/u', '', $part)); if ($part !== '') { $raw[] = $part; } }
    }
    $text = (string) ($a['title'] ?? '') . "\n" . mb_substr((string) ($a['body'] ?? ''), 0, 20000);
    if (preg_match_all("/\b(\p{Lu}\p{Ll}+(?:[- ]\p{Lu}\p{Ll}+)?)\s+((?:de |du |d['’])?\p{Lu}{2,}[\p{Lu}'’-]*)/u", $text, $m, PREG_SET_ORDER)) { foreach ($m as $x) { $raw[] = $x[1] . ' ' . $x[2]; } }
    $full = []; $sur = [];
    foreach ($raw as $n) {
        $w = preg_split('/\s+/', txi_norm($n)) ?: []; $w = array_values(array_filter($w, static fn($x) => $x !== '' && !in_array($x, ['feu', 'feue', 'de', 'du', 'd', 'la', 'le'], true)));
        if (count($w) >= 2) { $full[implode(' ', $w)] = true; }
        if ($w && mb_strlen(end($w)) >= 3) { $sur[end($w)] = true; }
    }
    return ['full' => array_keys($full), 'sur' => array_keys($sur)];
}

/** la sorte d'un acte pour les jumeaux : mariage, bans, contrat, naissance, bapteme, deces, sepulture, '' */
function txp3_twin_kind(array $a): string
{
    $k = (string) ($a['kind'] ?? ''); $t = txi_norm((string) ($a['title'] ?? '')); $head = txi_norm(mb_substr((string) ($a['body'] ?? ''), 0, 400));
    if (preg_match('/\b(bans?|publications? de mariage|promesses? de mariage|fiancailles)\b/', $t) || (in_array($k, ['autre', 'apreciser'], true) && preg_match('/\b(publication|publie|bans?)\b/', $head) && preg_match('/\bmariage\b/', $head))) { return 'bans'; }
    if (preg_match('/\b(contrat|traite) de mariage\b/', $t) || ($k === 'notarial' && preg_match('/\b(contrat|traite|conventions?) de mariage\b|\bfuturs? epoux\b/', $head))) { return 'contrat'; }
    if (preg_match('/\binhumation\b/', $t) && in_array($k, ['autre', 'apreciser', 'sepulture'], true)) { return 'sepulture'; }
    return in_array($k, ['mariage', 'naissance', 'bapteme', 'deces', 'sepulture'], true) ? $k : '';
}

/** deux sortes qui vont ensemble → [rel, jours au plus] | null */
function txp3_twin_pair(string $a, string $b): ?array
{
    $p = [$a, $b]; sort($p); $k = implode('|', $p);
    return match ($k) { 'bans|mariage' => ['bans', 150], 'contrat|mariage' => ['contrat', 400], 'bapteme|naissance' => ['bapteme', 60], 'deces|sepulture' => ['inhumation', 15], default => null };
}

/** GET twins {act_id} → {kind, linked: [{id, rel, title…}], items: [{id, title, kind, date_text, place, filename, rel, score, days, shared: [noms], linked}]} */
function txp3_twins(PDO $pdo, int $actId): array
{
    $acts = txp3_acts($pdo); $a = $acts[$actId] ?? null;
    if (!$a) { throw new RuntimeException(i18n_t('Transcription introuvable.')); }
    $hidden = txp3_hidden_acts($pdo, $acts);
    $ka = txp3_twin_kind($a); $na = txp3_names($a); [$da, $pa] = txp3_days((string) $a['date_text'] . ' ' . (string) $a['title']);
    $linked = []; foreach ((array) ($a['data']['twins'] ?? []) as $t) { if (is_array($t) && safe_int($t['id'] ?? 0)) { $linked[safe_int($t['id'])] = (string) ($t['rel'] ?? 'autre'); } }
    $items = [];
    foreach ($acts as $id => $b) {
        if ($id === $actId || isset($hidden[$id])) { continue; }
        $isLinked = isset($linked[$id]) || in_array($actId, array_map(static fn($t) => is_array($t) ? safe_int($t['id'] ?? 0) : 0, (array) ($b['data']['twins'] ?? [])), true);
        $pair = $ka !== '' ? txp3_twin_pair($ka, txp3_twin_kind($b)) : null;
        if (!$pair && !$isLinked) { continue; }
        $nb = txp3_names($b);
        $full = array_values(array_intersect($na['full'], $nb['full'])); $sur = array_values(array_intersect($na['sur'], $nb['sur']));
        [$db, $pb] = txp3_days((string) $b['date_text'] . ' ' . (string) $b['title']);
        $days = null; $dpts = 0.0;
        if ($pair) {
            if (!$full && count($sur) < 2 && !$isLinked) { continue; }
            if ($da !== null && $db !== null && $pa !== 'y' && $pb !== 'y') {
                $days = abs($da - $db); $max = $pair[1] + ($pa === 'm' || $pb === 'm' ? 31 : 0);
                if ($days > $max && !$isLinked) { continue; }
                $dpts = $days <= $max ? 3 * (1 - $days / max(1, $max)) + 1 : 0;
            } elseif ($da !== null && $db !== null) {
                if (abs($da - $db) > 400 && !$isLinked) { continue; } $dpts = .5;
            } elseif (count($full) < 2 && !$isLinked) { continue; }
        }
        $place = txi_norm((string) $a['place']) !== '' && txi_norm((string) preg_replace('/\s*\(.*$/', '', (string) $a['place'])) === txi_norm((string) preg_replace('/\s*\(.*$/', '', (string) $b['place'])) ? 1 : 0;
        $score = round(count($full) * 3 + count($sur) + $dpts + $place, 2);
        $items[] = ['id' => $id, 'title' => (string) $b['title'], 'kind' => (string) $b['kind'], 'date_text' => (string) $b['date_text'], 'place' => (string) $b['place'], 'filename' => (string) ($b['filename'] ?? ''),
            'rel' => $isLinked ? ($linked[$id] ?? ($pair[0] ?? 'autre')) : $pair[0], 'score' => $score, 'days' => $days, 'shared' => array_slice($full ?: $sur, 0, 5), 'linked' => $isLinked];
    }
    usort($items, static fn($x, $y) => [$y['linked'], $y['score']] <=> [$x['linked'], $x['score']]);
    return ['kind' => $ka, 'items' => array_slice($items, 0, 8)];
}

/** POST twin_link {act_id, other_id, rel, on} : le lien gardé dans l'AUTRE acte (l'acte ouvert le garde lui-même, data.twins) → {other_id, on, rel} */
function txp3_twin_link(PDO $pdo, array $d): array
{
    require_once __DIR__ . '/transcriptions.php';
    $id = safe_int($d['act_id'] ?? 0); $other = safe_int($d['other_id'] ?? 0); $on = !empty($d['on']);
    $rel = in_array((string) ($d['rel'] ?? ''), TXP3_TWIN_RELS, true) ? (string) $d['rel'] : 'autre';
    if (!$id || !$other || $id === $other) { throw new LcndaBadInput('Deux actes différents, s’il te plaît.'); }
    $chk = $pdo->prepare('SELECT 1 FROM act_transcriptions WHERE id=?'); $chk->execute([$id]); if (!$chk->fetchColumn()) { throw new RuntimeException(i18n_t('Transcription introuvable.')); }
    $s = $pdo->prepare('SELECT data_json, title FROM act_transcriptions WHERE id=?'); $s->execute([$other]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new RuntimeException(i18n_t('Transcription introuvable.')); }
    $data = json_decode((string) $r['data_json'], true) ?: [];
    $tw = array_values(array_filter((array) ($data['twins'] ?? []), static fn($t) => is_array($t) && safe_int($t['id'] ?? 0) !== $id));
    if ($on) { $tw[] = ['id' => $id, 'rel' => $rel]; }
    $data['twins'] = $tw; $clean = txp3_clean_extra(['twins' => $tw]);
    if (isset($clean['twins'])) { $data['twins'] = $clean['twins']; } else { unset($data['twins']); }
    $pdo->prepare("UPDATE act_transcriptions SET data_json=json_set(?, '$.rev', " . ACT_REV_SQL . ' + 1), updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE), $other]);
    log_change($pdo, 'meta', 0, 'update', ($on ? 'Actes liés : ' : 'Lien entre actes retiré : ') . $r['title']);
    return ['other_id' => $other, 'on' => $on, 'rel' => $rel];
}

/* ═════════ 🎤 12 · 👥 8. La vie privée ═════════ */

/** les fiches reliées à l'acte : ses personnes et celles de son image */
function txp3_linked_persons(PDO $pdo, array $a): array
{
    $ids = [];
    foreach ((array) ($a['data']['people'] ?? []) as $p) { $pid = is_array($p) ? safe_int($p['person_id'] ?? 0) : 0; if ($pid) { $ids[$pid] = true; } }
    $mid = (int) ($a['media_id'] ?? 0);
    if ($mid) { $s = $pdo->prepare("SELECT entity_id FROM media_links WHERE media_id=? AND entity_type='person'"); $s->execute([$mid]); foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $pid) { $ids[(int) $pid] = true; } }
    return array_keys($ids);
}

/** GET privacy {act_id} → {living, confidential, recent} */
function txp3_privacy(PDO $pdo, int $actId): array
{
    $a = $actId ? txi_act_row($pdo, $actId) : null;
    if (!$a) { return ['living' => false, 'confidential' => false, 'recent' => false]; }
    $ids = txp3_linked_persons($pdo, $a); $living = false; $priv = false;
    if ($ids) {
        $hasPriv = (bool) $pdo->query("SELECT count(*) FROM pragma_table_info('persons') WHERE name='is_private'")->fetchColumn();
        $in = implode(',', array_fill(0, count($ids), '?'));
        $s = $pdo->prepare("SELECT COALESCE(living_status,'') AS l" . ($hasPriv ? ', COALESCE(is_private,0) AS p' : ', 0 AS p') . " FROM persons WHERE id IN ($in)"); $s->execute($ids);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { if ($r['l'] === 'living') { $living = true; } if ((int) $r['p'] === 1) { $priv = true; } }
    }
    require_once __DIR__ . '/atelier_plus2.php';
    $recent = txp2_recent($a, (int) date('Y'));
    return ['living' => $living, 'confidential' => $priv || $recent, 'recent' => $recent];
}

/** GET people_info {ids: "1,2"} → {people: [{id, name, private}]} ; en consultation, une fiche vivante ou confidentielle n'est pas nommée */
function txp3_people_info(PDO $pdo, string $ids): array
{
    $list = array_values(array_unique(array_filter(array_map('intval', explode(',', $ids)), static fn($v) => $v > 0))); $list = array_slice($list, 0, 200);
    if (!$list) { return ['people' => []]; }
    $hasPriv = (bool) $pdo->query("SELECT count(*) FROM pragma_table_info('persons') WHERE name='is_private'")->fetchColumn();
    $in = implode(',', array_fill(0, count($list), '?'));
    $s = $pdo->prepare("SELECT id, first_name, last_name, COALESCE(living_status,'') AS l" . ($hasPriv ? ', COALESCE(is_private,0) AS p' : ', 0 AS p') . " FROM persons WHERE id IN ($in)"); $s->execute($list);
    $kiosk = txi_kiosk(); $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $private = $r['l'] === 'living' || (int) $r['p'] === 1;
        $out[] = ['id' => (int) $r['id'], 'name' => $kiosk && $private ? i18n_t('Fiche confidentielle') : trim((string) $r['first_name'] . ' ' . (string) $r['last_name']), 'private' => $private];
    }
    return ['people' => $out];
}
