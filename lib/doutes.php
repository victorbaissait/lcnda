<?php
declare(strict_types=1);

/**
 * C 📋 Une seule liste des doutes (maquette docs/design/complements-existants.html, partie C). Rien n'est recopié : chaque ligne
 * est lue dans l'outil d'origine au moment où la liste s'ouvre, et « ↗ » y emmène pour décider. Corriger dans l'outil fait
 * disparaître la ligne. Une seule échelle de gravité : 🔴 red impossible · 🟠 orange à vérifier · 🟡 yellow curieux.
 *  ✅ Contrôle   controle_state()            alertes pas « Ce n'est pas une erreur »        la sienne
 *  ⚖️ Hypothèses hypotheses + options/preuves état « ouverte »                               🟠 (🟡 si une réponse a 3 fois plus de preuves)
 *  🛡 Liens      solidite_fragiles()          liens supposed / unsourced des ancêtres Sosa   🟠
 *  ⚔️ Désaccords proof_items kind=conflict     sans résolution écrite                         🟠
 *  📚 Sans source naissance, mariage, décès sans source (ancêtres Sosa ; réglage : toute la base, ou pas du tout)  🟡
 *  🧾 SocFace    socface_records()            foyers pas « vérifié sur l'image »            🟡
 *  ⚖️ Successoral (réglage, à part par défaut) : homonymes des dossiers en cours            🟠
 * « 👁 Marquer vu » n'est pas « Ce n'est pas une erreur » : la ligne reste (en pâle, ou cachée par le filtre de départ) et l'outil
 * d'origine n'est pas touché. Un vu revient si la chose change (empreinte). Marques : app_settings « lcnda-doutes-vus ».
 * Mode consultation : la liste se lit, rien ne s'écrit, les vivants sont « Personne vivante ».
 */

const DOUTES_KEY = 'lcnda-doutes-vus';
const DOUTES_SORTS = ['controle', 'hypothese', 'lien', 'preuve', 'source', 'socface', 'succ'];

function doutes_marks(PDO $pdo): array
{
    try { $raw = $pdo->query("SELECT value FROM app_settings WHERE key='" . DOUTES_KEY . "'")->fetchColumn(); } catch (Throwable $_) { return []; }
    $m = json_decode((string) ($raw ?: ''), true);
    return is_array($m) ? $m : [];
}
function doutes_marks_save(PDO $pdo, array $marks): void
{
    if (count($marks) > 5000) { uasort($marks, static fn($a, $b) => strcmp((string) ($b['at'] ?? ''), (string) ($a['at'] ?? ''))); $marks = array_slice($marks, 0, 5000, true); }
    $pdo->prepare('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP')->execute([DOUTES_KEY, json_encode($marks, JSON_UNESCAPED_UNICODE)]);
}

/** La branche d'un Sosa : 2 et ses ancêtres = paternelle, 3 et ses ancêtres = maternelle. */
function doutes_branch(int $sosa): string
{
    if ($sosa < 2) { return ''; }
    $bits = decbin($sosa);
    return $bits[1] === '0' ? 'p' : 'm';
}

/** Toutes les lignes (non filtrées), avec leur empreinte. */
function doutes_rows(PDO $pdo): array
{
    $set = compl_settings($pdo);
    $rows = [];
    $root = (int) ($pdo->query('SELECT id FROM persons ORDER BY is_start DESC, id LIMIT 1')->fetchColumn() ?: 0);
    $sosaOf = [];
    $positions = [];
    if ($root && function_exists('sosa_positions')) {
        try { $positions = sosa_positions($pdo, $root, 20000)['positions'] ?? []; } catch (Throwable $_) {}
        foreach ($positions as $n => $pid) { $pid = (int) $pid; if (!isset($sosaOf[$pid]) || (int) $n < $sosaOf[$pid]) { $sosaOf[$pid] = (int) $n; } }
    }
    $add = static function (array $r) use (&$rows, $sosaOf): void {
        $people = array_values(array_unique(array_filter(array_map('intval', $r['people'] ?? []))));
        $sosas = array_values(array_filter(array_map(static fn($p) => $sosaOf[$p] ?? 0, $people)));
        $r['people'] = $people;
        $r['sosa'] = $sosas ? min($sosas) : 0;
        $r['branches'] = array_values(array_unique(array_filter(array_map('doutes_branch', $sosas))));
        $rows[] = $r;
    };
    // ✅ Contrôle de la base (son cache)
    if (function_exists('controle_state')) {
        try {
            foreach (controle_state($pdo)['alerts'] as $a) {
                $add(['key' => 'controle:' . $a['key'], 'sort' => 'controle', 'level' => in_array($a['level'] ?? '', ['red', 'orange', 'yellow'], true) ? $a['level'] : 'yellow',
                    'title' => (string) $a['title'], 'detail' => mb_substr(trim((string) ($a['detail'] ?? '')), 0, 220), 'people' => $a['people'] ?? [], 'fp' => (string) ($a['fp'] ?? md5((string) $a['title'])),
                    'open' => ['kind' => 'controle', 'level' => (string) $a['level'], 'key' => (string) $a['key']], 'sub' => (string) ($a['sort'] ?? '')]);
            }
        } catch (Throwable $_) {}
    }
    // ⚖️ Hypothèses ouvertes
    try {
        $hasOpt = compl_has($pdo, 'hypothesis_options');
        $concl = compl_has($pdo, 'hypotheses', 'concluded_at') ? " AND COALESCE(h.concluded_at,'')=''" : '';
        foreach ($pdo->query("SELECT h.id, h.title, h.person_id, h.related_person_id, h.updated_at, p.first_name, p.last_name FROM hypotheses h LEFT JOIN persons p ON p.id=h.person_id WHERE h.status='open'{$concl} ORDER BY h.updated_at DESC LIMIT 2000")->fetchAll(PDO::FETCH_ASSOC) as $h) {
            $opts = []; $proofs = 0;
            if ($hasOpt) {
                $s = $pdo->prepare("SELECT o.id, o.label, (SELECT count(*) FROM hypothesis_proofs pr WHERE pr.option_id=o.id AND pr.stance='for') AS n FROM hypothesis_options o WHERE o.hypothesis_id=? ORDER BY o.sort_order, o.id");
                $s->execute([(int) $h['id']]); $opts = $s->fetchAll(PDO::FETCH_ASSOC); $proofs = array_sum(array_map(static fn($o) => (int) $o['n'], $opts));
            }
            $counts = array_map(static fn($o) => (int) $o['n'], $opts); rsort($counts);
            $lean = count($counts) >= 2 && $counts[0] >= 1 && $counts[0] >= 3 * max(1, $counts[1]) && $counts[1] * 3 <= $counts[0];
            $detail = $opts ? i18n_t('{a} réponses, {p} preuves', ['a' => count($opts), 'p' => $proofs]) . ' · ' . implode(' · ', array_map(static fn($o) => $o['label'] . ' : ' . (int) $o['n'], array_slice($opts, 0, 3))) : '';
            $add(['key' => 'hypothese:' . (int) $h['id'], 'sort' => 'hypothese', 'level' => $lean ? 'yellow' : 'orange', 'title' => (string) $h['title'], 'detail' => trim(compl_person_name($h) . ($detail !== '' ? ' · ' . $detail : ''), ' ·'),
                'people' => [(int) $h['person_id'], (int) $h['related_person_id']], 'fp' => md5(count($opts) . '|' . $proofs . '|' . $h['updated_at']), 'open' => ['kind' => 'hypothese', 'id' => (int) $h['id']]]);
        }
    } catch (Throwable $_) {}
    // 🛡 Liens fragiles des ancêtres Sosa
    if (function_exists('solidite_fragiles')) {
        try {
            foreach (solidite_fragiles($pdo)['items'] as $it) {
                if (!in_array($it['level'], ['supposed', 'unsourced'], true)) { continue; }
                $c = (string) ($it['child']['name'] ?? ''); $p = (string) ($it['parent']['name'] ?? '');
                $add(['key' => 'lien:' . (int) $it['child_id'] . ':' . (int) $it['parent_id'], 'sort' => 'lien', 'level' => 'orange',
                    'title' => i18n_t($it['level'] === 'supposed' ? 'Lien parent-enfant supposé' : 'Lien parent-enfant sans source'), 'detail' => trim($c . ' → ' . $p . ' · Sosa ' . (int) $it['sosa'], ' →·'),
                    'people' => [(int) $it['child_id'], (int) $it['parent_id']], 'fp' => md5($it['level'] . '|' . $it['code'] . '|' . $it['ref']), 'open' => ['kind' => 'lien', 'child' => (int) $it['child_id'], 'parent' => (int) $it['parent_id']]]);
            }
        } catch (Throwable $_) {}
    }
    // ⚔️ Désaccords de preuve sans résolution écrite
    if (compl_has($pdo, 'proof_items')) {
        try {
            foreach ($pdo->query("SELECT i.id, i.text, i.updated_at, c.id AS case_id, c.question, c.person_id, c.related_id FROM proof_items i JOIN proof_cases c ON c.id=i.case_id WHERE i.kind='conflict' AND trim(i.resolution)='' AND i.deleted_at='' AND c.deleted_at='' ORDER BY i.updated_at DESC LIMIT 1000")->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $add(['key' => 'preuve:' . (int) $r['id'], 'sort' => 'preuve', 'level' => 'orange', 'title' => mb_substr(trim((string) $r['text']) ?: i18n_t('Désaccord sans résolution'), 0, 160), 'detail' => mb_substr((string) $r['question'], 0, 200),
                    'people' => [(int) $r['person_id'], (int) $r['related_id']], 'fp' => md5((string) $r['updated_at']), 'open' => ['kind' => 'preuve', 'id' => (int) $r['case_id']]]);
            }
        } catch (Throwable $_) {}
    }
    // 📚 Sans source : naissance, mariage, décès
    if ($set['doutes_nosource'] !== 'none') {
        try {
            $ids = $set['doutes_nosource'] === 'sosa' ? array_keys($sosaOf) : null;
            $tags = "'BIRT','CHR','BAPM','MARR','DEAT','BURI'";
            $base = "SELECT e.id, e.date_text, e.place_id, t.gedcom_tag AS tag, e.person_id, e.family_id, f.partner1_id, f.partner2_id FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN families f ON f.id=e.family_id
                WHERE t.gedcom_tag IN ($tags) AND NOT EXISTS (SELECT 1 FROM source_links sl WHERE sl.entity_type='event' AND sl.entity_id=e.id)";
            $found = [];
            if ($ids === null) { $found = $pdo->query($base . ' ORDER BY e.id LIMIT 3000')->fetchAll(PDO::FETCH_ASSOC); }
            elseif ($ids) {
                foreach (array_chunk($ids, 400) as $chunk) { $in = implode(',', array_map('intval', $chunk)); $found = array_merge($found, $pdo->query($base . " AND (e.person_id IN ($in) OR e.family_id IN (SELECT id FROM families WHERE partner1_id IN ($in) OR partner2_id IN ($in))) ORDER BY e.id")->fetchAll(PDO::FETCH_ASSOC)); /* 🐘 le couple par l'index des familles (les mêmes lignes) : plus un parcours de tous les événements par paquet */ if (count($found) > 3000) { break; } }
            }
            $names = hom_people($pdo, array_merge(array_column($found, 'person_id'), array_column($found, 'partner1_id'), array_column($found, 'partner2_id')));
            $seen = [];
            foreach ($found as $e) {
                if (isset($seen[(int) $e['id']])) { continue; } $seen[(int) $e['id']] = true;
                $ppl = $e['person_id'] ? [(int) $e['person_id']] : [(int) $e['partner1_id'], (int) $e['partner2_id']];
                $who = implode(' × ', array_filter(array_map(static fn($p) => $names[$p]['name'] ?? '', $ppl)));
                $what = ['BIRT' => 'Naissance sans source', 'CHR' => 'Baptême sans source', 'BAPM' => 'Baptême sans source', 'MARR' => 'Mariage sans source', 'DEAT' => 'Décès sans source', 'BURI' => 'Inhumation sans source'][$e['tag']] ?? 'Événement sans source';
                $add(['key' => 'source:' . (int) $e['id'], 'sort' => 'source', 'level' => 'yellow', 'title' => i18n_t($what), 'detail' => trim($who . ($e['date_text'] !== '' ? ', ' . $e['date_text'] : ''), ', '),
                    'people' => $ppl, 'fp' => md5((string) $e['date_text'] . '|' . (string) $e['place_id']), 'open' => ['kind' => 'person', 'id' => $ppl[0] ?: ($ppl[1] ?? 0), 'event' => (int) $e['id']]]);
                if (count($seen) >= 3000) { break; }
            }
        } catch (Throwable $_) {}
    }
    // 🧾 Lectures SocFace pas vérifiées sur l'image
    if (function_exists('socface_records')) {
        try {
            foreach (socface_records($pdo, 'cr.verified=0', [], 300) as $r) {
                $chef = ''; $ppl = [];
                foreach ($r['members'] as $m) { if ($m['person_id']) { $ppl[] = (int) $m['person_id']; } if ($m['is_primary'] || $chef === '') { $chef = trim($m['first'] . ' ' . $m['last']); } }
                $add(['key' => 'socface:' . (int) $r['id'], 'sort' => 'socface', 'level' => 'yellow', 'title' => i18n_t($r['place'] !== '' ? 'Recensement de {y} à {place} : lecture à vérifier sur l’image' : 'Recensement de {y} : lecture à vérifier sur l’image', ['y' => $r['year'], 'place' => $r['place']]),
                    'detail' => $chef !== '' ? i18n_t('Foyer de {name}', ['name' => $chef]) : '', 'people' => $ppl, 'fp' => md5((string) $r['id'] . '|' . count($r['members'])), 'open' => ['kind' => 'socface', 'id' => (int) $r['id']]]);
            }
        } catch (Throwable $_) {}
    }
    // ⚖️ Successoral (réglage « aussi dans cette liste ») : homonymes des dossiers en cours ; jamais en consultation
    if ($set['doutes_succ'] === 'with' && !compl_kiosk() && function_exists('succ_homonyms') && compl_has($pdo, 'succ_case_persons')) {
        try {
            foreach ($pdo->query("SELECT id, number FROM succ_cases WHERE deleted_at IS NULL AND state NOT IN ('clos','archive') LIMIT 200")->fetchAll(PDO::FETCH_ASSOC) as $c) {
                foreach (succ_homonyms($pdo, (int) $c['id']) as $h) {
                    $add(['key' => 'succ:' . (int) $c['id'] . ':' . (int) $h['person_id'] . ':' . (int) $h['other_id'], 'sort' => 'succ', 'level' => 'orange', 'title' => i18n_t('Homonyme dans un dossier de succession'),
                        'detail' => trim((string) $c['number'] . ' · ' . (string) $h['name']), 'people' => [(int) $h['person_id'], (int) $h['other_id']], 'fp' => md5((string) $h['other_id']), 'open' => ['kind' => 'succ', 'id' => (int) $c['id']]]);
                }
            }
        } catch (Throwable $_) {}
    }
    return $rows;
}

/** GET compl&op=doutes[&person=&anc=1] : les lignes, chacune avec « vu » (et sa date), les nombres par sorte, les noms. */
function doutes_data(PDO $pdo, array $q): array
{
    $set = compl_settings($pdo);
    $rows = doutes_rows($pdo);
    $marks = doutes_marks($pdo);
    $person = safe_int($q['person'] ?? 0);
    if ($person) {
        $want = [$person => true];
        if (!empty($q['anc'])) { foreach (doutes_ancestors($pdo, $person) as $a) { $want[$a] = true; } }
        $rows = array_values(array_filter($rows, static fn($r) => (bool) array_intersect_key(array_flip($r['people']), $want)));
    }
    $kiosk = compl_kiosk();
    $living = [];
    if ($kiosk) {
        $all = array_values(array_unique(array_merge(...array_map(static fn($r) => $r['people'], $rows ?: [['people' => []]]))));
        foreach (array_chunk($all, 400) as $chunk) { foreach ($pdo->query('SELECT id FROM persons WHERE living_status=\'living\' AND id IN (' . implode(',', array_map('intval', $chunk)) . ')')->fetchAll(PDO::FETCH_COLUMN) as $id) { $living[(int) $id] = true; } }
    }
    $rank = ['red' => 0, 'orange' => 1, 'yellow' => 2];
    foreach ($rows as &$r) {
        $m = $marks[$r['key']] ?? null;
        $r['seen'] = is_array($m) && ($set['doutes_seen_back'] === 'never' || (string) ($m['fp'] ?? '') === $r['fp']);
        $r['seen_at'] = $r['seen'] ? (string) ($m['at'] ?? '') : '';
        $r['returned'] = is_array($m) && !$r['seen'];
        if ($kiosk && array_intersect_key(array_flip($r['people']), $living)) { $r['title'] = i18n_t('Personne vivante'); $r['detail'] = ''; $r['masked'] = true; }
    }
    unset($r);
    usort($rows, static fn($a, $b) => ($rank[$a['level']] <=> $rank[$b['level']]) ?: ($a['sosa'] ?: PHP_INT_MAX) <=> ($b['sosa'] ?: PHP_INT_MAX) ?: strcmp($a['key'], $b['key']));
    $counts = array_fill_keys(DOUTES_SORTS, 0);
    foreach ($rows as $r) { $counts[$r['sort']] = ($counts[$r['sort']] ?? 0) + 1; }
    $names = [];
    if (!$kiosk) { foreach (hom_people($pdo, array_slice(array_values(array_unique(array_merge(...array_map(static fn($r) => $r['people'], $rows ?: [['people' => []]])))), 0, 4000)) as $p) { $names[$p['id']] = $p['name']; } }
    return ['rows' => $rows, 'counts' => $counts, 'total' => count($rows), 'names' => $names ?: new stdClass(), 'settings' => $set, 'kiosk' => $kiosk];
}
function doutes_ancestors(PDO $pdo, int $pid): array
{
    $out = []; $todo = [$pid]; $n = 0;
    $s = $pdo->prepare('SELECT f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=?');
    while ($todo && $n++ < 20000) {
        $c = array_pop($todo); $s->execute([$c]);
        foreach ($s->fetchAll(PDO::FETCH_NUM) as $r) { foreach ($r as $p) { $p = (int) $p; if ($p && !isset($out[$p])) { $out[$p] = true; $todo[] = $p; } } }
    }
    return array_keys($out);
}
/** Le widget : les trois nombres (pas encore vus), le plus grave, et les 5 premières lignes. */
function doutes_summary(PDO $pdo): array
{
    $d = doutes_data($pdo, []);
    $open = array_values(array_filter($d['rows'], static fn($r) => !$r['seen']));
    $c = ['red' => 0, 'orange' => 0, 'yellow' => 0];
    foreach ($open as $r) { $c[$r['level']]++; }
    return ['counts' => $c, 'total' => count($open), 'top' => array_slice($open, 0, 5), 'settings' => $d['settings'], 'names' => $d['names']];
}
/** 👁 Marquer vu (la ligne passe en pâle, revient si elle change) : rend la marque d'avant pour « ↶ Annuler ». */
function doute_vu(PDO $pdo, array $d): array
{
    $key = compl_txt($d['key'] ?? '', 200);
    if (!preg_match('/^(' . implode('|', DOUTES_SORTS) . '):[\p{L}0-9:_.-]{1,180}$/iu', $key)) { throw new LcndaBadInput('Ligne inconnue.'); }
    $marks = doutes_marks($pdo);
    $prev = $marks[$key] ?? null;
    if (!empty($d['off'])) { unset($marks[$key]); }
    else { $marks[$key] = ['fp' => compl_txt($d['fp'] ?? '', 64), 'at' => date('Y-m-d'), 'title' => compl_txt($d['title'] ?? '', 160)]; }
    doutes_marks_save($pdo, $marks);
    return ['key' => $key, 'prev' => $prev];
}
function doute_vu_undo(PDO $pdo, array $d): array
{
    $key = compl_txt($d['key'] ?? '', 200);
    if (!preg_match('/^(' . implode('|', DOUTES_SORTS) . '):[\p{L}0-9:_.-]{1,180}$/iu', $key)) { throw new LcndaBadInput('Ligne inconnue.'); }
    $marks = doutes_marks($pdo);
    $p = $d['prev'] ?? null;
    if (is_array($p)) { $marks[$key] = ['fp' => compl_txt($p['fp'] ?? '', 64), 'at' => compl_date_ok((string) ($p['at'] ?? '')) ? $p['at'] : date('Y-m-d'), 'title' => compl_txt($p['title'] ?? '', 160)]; }
    else { unset($marks[$key]); }
    doutes_marks_save($pdo, $marks);
    return ['key' => $key];
}
/** ⤓ Exporter en CSV (GET compl_export&op=doutes_csv) : refusé en consultation, noté dans « Qui a vu quoi ». */
function doutes_csv(PDO $pdo, array $q): never
{
    $d = doutes_data($pdo, $q);
    if (function_exists('access_log_add')) { access_log_add($pdo, 'export', 'genealogy', null, '', 'doutes_csv'); }
    $lv = ['red' => i18n_t('impossible'), 'orange' => i18n_t('à vérifier'), 'yellow' => i18n_t('curieux')];
    $cell = static function (string $v): string { $v = preg_match('/^[=+\-@\t\r]/', $v) ? "'" . $v : $v; return '"' . str_replace('"', '""', $v) . '"'; };
    $lines = [implode(';', array_map($cell, ['sorte', 'gravite', 'titre', 'detail', 'personnes', 'sosa', 'vu']))];
    foreach ($d['rows'] as $r) {
        $lines[] = implode(';', array_map($cell, [$r['sort'], $lv[$r['level']] ?? $r['level'], $r['title'], $r['detail'], implode(' ', array_map(static fn($p) => '#' . $p, $r['people'])), $r['sosa'] ? (string) $r['sosa'] : '', $r['seen'] ? (string) $r['seen_at'] : '']));
    }
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="doutes-' . date('Y-m-d') . '.csv"');
    header('X-Content-Type-Options: nosniff');
    echo "\xEF\xBB\xBF" . implode("\r\n", $lines) . "\r\n";
    exit;
}
