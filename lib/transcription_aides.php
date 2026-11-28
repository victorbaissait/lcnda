<?php
declare(strict_types=1);
/**
 * 📜 Atelier de transcription — les aides (assets/js/heritage-atelier-aides.js). Lecture seule, rien ne sort de l'ordinateur.
 *   GET txaid_match&q=Ma…d&place=…   💡 mot illisible : noms, prénoms et communes de la base qui vont avec le motif
 *                                    (« … » ou « ... » = plusieurs lettres, « ? » = une lettre). Seulement le nom déjà dans la base ;
 *                                    en mode consultation, rien des personnes vivantes.
 *   GET txaid_signs&act_id=N         ✍️ les zones « signature » des autres actes (pour « Comparer avec… »)
 *   GET txaid_progress               📊 ma progression : actes et part de mots douteux, mois par mois
 * Essai : tests/test-transcription-aides.js
 */

function txaid_fold(string $s): string
{
    $s = mb_strtolower($s, 'UTF-8');
    $s = strtr($s, ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'á' => 'a', 'ç' => 'c', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'í' => 'i',
        'ô' => 'o', 'ö' => 'o', 'ó' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ú' => 'u', 'ÿ' => 'y', 'ñ' => 'n', 'œ' => 'oe', 'æ' => 'ae', 'ſ' => 's']);
    return $s;
}

/** « Ma…d » → '/^ma.+d$/u' ; « Ma?aud » → '/^ma.aud$/u' ; null s'il n'y a pas au moins deux lettres sûres et un trou */
function txaid_pattern(string $q): ?string
{
    $q = txaid_fold(trim(str_replace('...', '…', $q)));
    if (!preg_match('/[…?]/u', $q) || mb_strlen((string) preg_replace('/[^\p{L}]/u', '', $q)) < 2 || mb_strlen($q) > 40) { return null; }
    $rx = '';
    foreach (preg_split('//u', $q, -1, PREG_SPLIT_NO_EMPTY) as $ch) {
        $rx .= $ch === '…' ? '.+' : ($ch === '?' ? '.' : preg_quote($ch, '/'));
    }
    return '/^' . $rx . '$/u';
}

function txaid_match(PDO $pdo, string $q, string $place = ''): array
{
    $rx = txaid_pattern($q);
    if ($rx === null) { return ['pattern' => false, 'items' => []]; }
    $kiosk = function_exists('kiosk_state') && !empty(kiosk_state()['on']);
    $where = $kiosk ? " WHERE living_status <> 'living'" : '';
    $count = ['surname' => [], 'given' => [], 'place' => []];
    foreach ($pdo->query('SELECT last_name, first_name FROM persons' . $where) as $r) {
        foreach (['surname' => [(string) $r['last_name']], 'given' => preg_split('/[\s,]+/u', (string) $r['first_name'])] as $type => $words) {
            foreach ($words as $w) {
                $w = trim((string) $w); if ($w === '' || !preg_match($rx, txaid_fold($w))) { continue; }
                $k = txaid_fold($w); $count[$type][$k] ??= ['value' => $w, 'n' => 0]; $count[$type][$k]['n']++;
            }
        }
    }
    $county = '';
    if ($place !== '') { $s = $pdo->prepare('SELECT county FROM places WHERE lower(name)=lower(?) LIMIT 1'); $s->execute([$place]); $county = (string) ($s->fetchColumn() ?: ''); }
    foreach ($pdo->query('SELECT name, county FROM places') as $r) {
        $name = trim((string) $r['name']); if ($name === '') { continue; }
        $town = trim(explode(',', $name)[0]);
        if (!preg_match($rx, txaid_fold($town))) { continue; }
        $k = txaid_fold($town); $near = $county !== '' && (string) $r['county'] === $county;
        $count['place'][$k] ??= ['value' => $town, 'n' => 0, 'near' => false];
        $count['place'][$k]['n']++; $count['place'][$k]['near'] = $count['place'][$k]['near'] || $near;
    }
    $items = [];
    foreach ($count as $type => $list) {
        $list = array_values($list);
        usort($list, static fn($a, $b) => [(int) !empty($b['near']), $b['n']] <=> [(int) !empty($a['near']), $a['n']] ?: strcmp($a['value'], $b['value']));
        foreach (array_slice($list, 0, 8) as $x) { $items[] = ['type' => $type, 'value' => $x['value'], 'n' => $x['n'], 'near' => !empty($x['near'])]; }
    }
    return ['pattern' => true, 'items' => $items];
}

function txaid_signs(PDO $pdo, int $actId): array
{
    $out = [];
    foreach ($pdo->query('SELECT id, title, date_text, place, body, data_json FROM act_transcriptions ORDER BY id DESC LIMIT 2000') as $r) {
        if ((int) $r['id'] === $actId) { continue; }
        $d = json_decode((string) $r['data_json'], true);
        foreach ((array) ($d['zones'] ?? []) as $z) {
            if (!is_array($z) || ($z['kind'] ?? '') !== 'sign' || (string) ($z['id'] ?? '') === '') { continue; }
            $s = (int) ($z['s'] ?? 0); $e = (int) ($z['e'] ?? 0);
            $text = $e > $s ? trim(mb_substr((string) $r['body'], $s, min(120, $e - $s))) : '';
            $out[] = ['act_id' => (int) $r['id'], 'zone_id' => (string) $z['id'], 'title' => (string) $r['title'], 'date' => (string) $r['date_text'], 'place' => (string) $r['place'], 'text' => $text];
            if (count($out) >= 80) { break 2; }
        }
    }
    return ['signs' => $out];
}

/** les mots douteux d'un texte : [?], [illisible], et les mots avec « ? » ou « … » dedans */
function txaid_unsure_count(string $body): array
{
    $words = preg_split('/\s+/u', trim($body), -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $unsure = 0;
    foreach ($words as $w) { if (preg_match('/\[\?\]|\[illisible\]|\p{L}[?…]|[?…]\p{L}/u', $w)) { $unsure++; } }
    return [count($words), $unsure];
}

function txaid_progress(PDO $pdo): array
{
    $months = [];
    $total = ['acts' => 0, 'words' => 0, 'unsure' => 0];
    foreach ($pdo->query("SELECT substr(created_at,1,7) AS m, body FROM act_transcriptions WHERE trim(body) <> '' ORDER BY created_at") as $r) {
        [$w, $u] = txaid_unsure_count((string) $r['body']);
        $m = (string) $r['m']; $months[$m] ??= ['month' => $m, 'acts' => 0, 'words' => 0, 'unsure' => 0];
        $months[$m]['acts']++; $months[$m]['words'] += $w; $months[$m]['unsure'] += $u;
        $total['acts']++; $total['words'] += $w; $total['unsure'] += $u;
    }
    return ['total' => $total, 'months' => array_values(array_slice($months, -24))];
}

function txaid_dispatch(PDO $pdo, string $action, bool $isWrite, array $data): never
{
    act_transcriptions_ensure($pdo);
    if ($isWrite) { json_response(['error' => 'Action inconnue'], 400); }
    json_response(match ($action) {
        'txaid_match' => txaid_match($pdo, (string) ($_GET['q'] ?? ''), (string) ($_GET['place'] ?? '')),
        'txaid_signs' => txaid_signs($pdo, safe_int($_GET['act_id'] ?? 0)),
        'txaid_progress' => txaid_progress($pdo),
        default => ['error' => 'Action inconnue'],
    });
}
