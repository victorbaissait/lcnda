<?php
declare(strict_types=1);

/**
 * 📤 Partager avec la famille (F11 ; fenêtre : assets/js/heritage-partage.js, visionneuse : assets/js/family-share-viewer.js
 * et assets/css/family-share.css, recopiées dans le fichier).
 *
 * Une copie de l'arbre en lecture seule, à envoyer à la famille : un .zip qui contient index.html (à ouvrir d'un double-clic,
 * sans l'app ni internet : arbre, fiches, photos choisies, recherche), un dossier photos/ et LISEZ-MOI.txt.
 *
 * Construit sur l'existant : les vivants (déclarés, ou probablement vivants) et les fiches confidentielles sont reconnus par
 * gedcom_share_hidden() (lib/gedcom.php, la règle de l'export GEDCOM « Pour partager ») ; les branches par h_ancestors() et
 * h_descendants() (lib/heritage.php, comme « GEDCOM d'une seule branche ») ; photo ou document comme la fenêtre des images
 * (picker_media_sort_sql, lib/picker.php).
 *
 * Contrôle strict (rien de caché ne part) :
 *  - une fiche confidentielle est retirée ; un vivant est retiré (« cachés ») ou réduit à son prénom (« prénom seulement »),
 *    sans date, lieu, événement, note, photo ni numéro ;
 *  - un événement de couple (mariage…) ne part que si aucun des deux n'est caché ;
 *  - une photo ou un document ne part que si AUCUNE personne qui y est reliée ou repérée (fiche, événement, famille, visage
 *    nommé, portrait) n'est cachée ; les images sont réenregistrées (sans les données EXIF : GPS, appareil, date) ;
 *  - dans les textes qui partent (notes, titres, transcriptions), le nom complet d'une personne cachée est remplacé par
 *    « [nom retiré] » (sauf s'il est aussi celui d'une personne qui part, un homonyme ancien) ;
 *  - à la fin, tout le paquet est relu : s'il y reste le nom complet ou le numéro d'une personne cachée, rien n'est envoyé.
 *  - noms de fichiers fabriqués (photos/m12.jpg), jamais repris de la base ; un fichier hors du dossier des médias est ignoré.
 *
 * GET api.php?action=family_share_preview&… → {summary}   GET api.php?action=family_share_export&… → le .zip
 * Paramètres : branches=[{"mode":"ascendants"|"descendants","person":ID,"partner":ID,"generations":N,"spouses":1}] (vide = toute
 * la base), living=hide|first, photos=0|1, docs=0|1, notes=0|1, title=…, death_cutoff_year=AAAA (cacher aussi les décès récents).
 * Mode consultation : refusé (kiosk_blocks, lib/heritage_tools.php).
 */

const FS_MAX_BRANCHES = 12;
const FS_MAX_MEDIA = 3000;
const FS_IMG_MAX = 1600;
const FS_THUMB_MAX = 360;
const FS_REDACTED = '[nom retiré]';

function fs_options(array $q): array
{
    $flag = static fn(string $k, bool $def) => isset($q[$k]) ? !in_array(strtolower((string) $q[$k]), ['0', 'false', 'off', 'no', ''], true) : $def;
    $branches = [];
    $raw = $q['branches'] ?? '';
    $list = is_string($raw) && $raw !== '' ? json_decode($raw, true) : (is_array($raw) ? $raw : []);
    foreach (array_slice(is_array($list) ? $list : [], 0, FS_MAX_BRANCHES) as $b) {
        if (!is_array($b)) { continue; }
        $mode = in_array($b['mode'] ?? '', ['ascendants', 'descendants'], true) ? (string) $b['mode'] : '';
        $person = safe_int($b['person'] ?? 0);
        if (!$mode || $person <= 0) { continue; }
        $branches[] = ['mode' => $mode, 'person' => $person, 'partner' => safe_int($b['partner'] ?? 0), 'generations' => max(1, min(60, safe_int($b['generations'] ?? 60) ?: 60)),
            'spouses' => !isset($b['spouses']) || !in_array((string) $b['spouses'], ['0', 'false', ''], true)];
    }
    $title = trim(preg_replace('/\s+/u', ' ', str_replace("\0", '', is_scalar($q['title'] ?? '') ? (string) ($q['title'] ?? '') : '')));
    return ['branches' => $branches, 'living' => ($q['living'] ?? '') === 'first' ? 'first' : 'hide',
        'photos' => $flag('photos', true), 'docs' => $flag('docs', true), 'notes' => $flag('notes', true), 'title' => mb_substr($title, 0, 120)];
}

/** Personnes des branches choisies (null = toute la base). */
function fs_branch_ids(PDO $pdo, array $branches): ?array
{
    if (!$branches) { return null; }
    $keep = [];
    foreach ($branches as $b) {
        if ($b['mode'] === 'ascendants') { $keep += h_ancestors($pdo, $b['person'], $b['generations']); continue; }
        if (!$b['partner']) { $keep += h_descendants($pdo, [$b['person']], $b['generations'], $b['spouses']); continue; }
        // descendants de CE couple seulement (pas les enfants d'une autre union), comme gedcom_branch_ids()
        $s = $pdo->prepare('SELECT fc.child_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE (f.partner1_id=? AND f.partner2_id=?) OR (f.partner1_id=? AND f.partner2_id=?)');
        $s->execute([$b['person'], $b['partner'], $b['partner'], $b['person']]);
        $kids = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
        $keep += ($kids ? h_descendants($pdo, $kids, $b['generations'] - 1, $b['spouses']) : []) + [$b['person'] => true, $b['partner'] => true];
    }
    return $keep;
}

function fs_plain(string $html): string
{
    $t = preg_replace('#<(br|/p|/div|/li|/h\d)\b[^>]*>#i', "\n", $html);
    $t = html_entity_decode(strip_tags((string) $t), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    return trim((string) preg_replace("/\n{3,}/", "\n\n", str_replace("\r", '', $t)));
}

function fs_fold(string $s): string
{
    $s = mb_strtolower(trim(preg_replace('/\s+/u', ' ', $s)));
    $t = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
    return $t !== false && $t !== '' ? $t : $s;
}

function fs_place(array $r, string $p = ''): string
{
    return implode(', ', array_values(array_filter(array_map('trim', [(string) ($r[$p . 'place_name'] ?? ''), (string) ($r[$p . 'county'] ?? ''), (string) ($r[$p . 'country'] ?? '')]), static fn($x) => $x !== '' && mb_strtolower($x) !== 'france')));
}

/**
 * Le paquet : ce qui part (données de la visionneuse), les fichiers à copier et le résumé.
 * @return array{data: array, files: array, summary: array, forbidden: array}
 */
function family_share_build(PDO $pdo, array $o): array
{
    if (function_exists('picker_register')) { picker_register($pdo); }
    $hasKind = in_array('kind', array_column($pdo->query('PRAGMA table_info(persons)')->fetchAll(), 'name'), true);
    $all = $pdo->query(person_select() . ($hasKind ? " WHERE COALESCE(p.kind,'human')<>'animal'" : '') . ' ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE, p.id')->fetchAll();
    $families = $pdo->query('SELECT * FROM families ORDER BY id')->fetchAll();
    $hidden = gedcom_share_hidden($pdo, $all, $families); // id => living | private
    $branch = fs_branch_ids($pdo, $o['branches']);
    $byId = [];
    foreach ($all as $p) { $byId[(int) $p['id']] = $p; }
    $inScope = static fn(int $id) => isset($byId[$id]) && ($branch === null || isset($branch[$id]));
    $sum = ['people' => 0, 'living_hidden' => 0, 'living_first' => 0, 'private_removed' => 0, 'families' => 0, 'events' => 0, 'photos' => 0, 'docs' => 0, 'notes' => 0,
        'media_skipped_hidden' => 0, 'media_skipped_other' => 0, 'names_redacted' => 0, 'bytes' => 0, 'branches' => count($o['branches'])];
    // numéros de la copie : 1, 2, 3… (les numéros de la base ne partent pas)
    $num = []; $n = 0;
    foreach ($all as $p) {
        $id = (int) $p['id'];
        if (!$inScope($id)) { continue; }
        $h = $hidden[$id] ?? '';
        if ($h === 'private') { $sum['private_removed']++; continue; }
        if ($h === 'living') { if ($o['living'] === 'hide') { $sum['living_hidden']++; continue; } $sum['living_first']++; }
        $num[$id] = ++$n;
    }
    $open = static fn(int $id) => isset($num[$id]) && !isset($hidden[$id]); // une fiche qui part en entier

    // événements des personnes (et des couples) qui partent en entier
    $events = $pdo->query("SELECT e.id, e.person_id, e.family_id, e.date_text, e.year, e.title, e.description, t.label AS type_label, t.gedcom_tag, pl.name AS place_name, pl.county, pl.country
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id ORDER BY COALESCE(e.sort_date,''), COALESCE(e.year, 9999), e.id")->fetchAll();
    $famById = []; foreach ($families as $f) { $famById[(int) $f['id']] = $f; }
    $famOpen = static function (int $fid) use ($famById, $hidden, $byId): bool { // aucun des deux n'est caché (ni vivant, ni confidentiel)
        $f = $famById[$fid] ?? null; if (!$f) { return false; }
        foreach ([(int) ($f['partner1_id'] ?? 0), (int) ($f['partner2_id'] ?? 0)] as $pid) { if ($pid && (isset($hidden[$pid]) || !isset($byId[$pid]))) { return false; } }
        return true;
    };
    $evOk = []; $evByPerson = []; $evByFam = [];
    foreach ($events as $e) {
        $pid = (int) ($e['person_id'] ?? 0); $fid = (int) ($e['family_id'] ?? 0);
        $row = ['t' => (string) ($e['type_label'] ?: 'Événement'), 'd' => trim((string) $e['date_text']), 'p' => fs_place($e)];
        if ($o['notes']) { $desc = trim(fs_plain((string) $e['title']) . ((string) $e['title'] !== '' && (string) $e['description'] !== '' ? ' — ' : '') . fs_plain((string) $e['description'])); if ($desc !== '') { $row['x'] = mb_substr($desc, 0, 4000); } }
        if ($pid && $open($pid)) { $evByPerson[$pid][] = $row; $evOk[(int) $e['id']] = true; }
        elseif ($fid && $famOpen($fid)) { $evByFam[$fid][] = $row; $evOk[(int) $e['id']] = true; }
    }

    // familles : les partenaires et enfants qui partent ; on garde la famille si elle relie au moins deux fiches de la copie
    $kids = [];
    foreach ($pdo->query('SELECT family_id, child_id FROM family_children ORDER BY family_id, position, id') as $c) { $kids[(int) $c['family_id']][] = (int) $c['child_id']; }
    $fams = []; $famNum = [];
    foreach ($families as $f) {
        $fid = (int) $f['id'];
        $a = (int) ($f['partner1_id'] ?? 0); $b = (int) ($f['partner2_id'] ?? 0);
        $c = array_values(array_filter($kids[$fid] ?? [], static fn($k) => isset($num[$k])));
        $members = array_filter([$a && isset($num[$a]) ? $a : 0, $b && isset($num[$b]) ? $b : 0, ...$c]);
        if (count($members) < 2 && !($members && isset($evByFam[$fid]))) { continue; }
        $famNum[$fid] = count($fams);
        $fams[] = ['a' => $a && isset($num[$a]) ? $num[$a] : 0, 'b' => $b && isset($num[$b]) ? $num[$b] : 0, 'c' => array_map(static fn($k) => $num[$k], $c), 'ev' => $evByFam[$fid] ?? []];
        $sum['events'] += count($evByFam[$fid] ?? []);
    }
    $sum['families'] = count($fams);

    // notes des fiches, événements et familles qui partent
    $notesBy = [];
    if ($o['notes']) {
        foreach ($pdo->query('SELECT entity_type, entity_id, title, body FROM notes ORDER BY id') as $nt) {
            $eid = (int) $nt['entity_id']; $type = (string) $nt['entity_type'];
            $txt = trim(fs_plain((string) $nt['title']) . "\n" . fs_plain((string) $nt['body']));
            if ($txt === '') { continue; }
            if ($type === 'person' && $open($eid)) { $notesBy[$eid][] = mb_substr($txt, 0, 20000); $sum['notes']++; }
        }
    }

    // médias : qui y est relié, et qui y est repéré ; une seule personne cachée suffit pour qu'il ne parte pas
    $media = []; $mediaFor = []; $files = [];
    if ($o['photos'] || $o['docs']) {
        $mlinks = [];
        foreach ($pdo->query("SELECT ml.media_id, ml.entity_type, ml.entity_id, e.person_id AS ev_person, e.family_id AS ev_family FROM media_links ml LEFT JOIN events e ON ml.entity_type='event' AND e.id=ml.entity_id") as $l) {
            $mid = (int) $l['media_id']; $t = (string) $l['entity_type']; $eid = (int) $l['entity_id'];
            $who = [];
            if ($t === 'person') { $who[] = $eid; }
            elseif ($t === 'event') { if ((int) $l['ev_person']) { $who[] = (int) $l['ev_person']; } if ((int) $l['ev_family']) { $f = $famById[(int) $l['ev_family']] ?? []; $who[] = (int) ($f['partner1_id'] ?? 0); $who[] = (int) ($f['partner2_id'] ?? 0); } }
            elseif ($t === 'family') { $f = $famById[$eid] ?? []; $who[] = (int) ($f['partner1_id'] ?? 0); $who[] = (int) ($f['partner2_id'] ?? 0); }
            foreach (array_filter($who) as $pid) { $mlinks[$mid][$pid] = true; }
        }
        $tagged = [];
        try { foreach ($pdo->query('SELECT media_id, person_id FROM media_tags WHERE person_id IS NOT NULL') as $t) { $tagged[(int) $t['media_id']][(int) $t['person_id']] = true; } } catch (Throwable $_) {}
        foreach ($all as $p) { if ((int) ($p['portrait_media_id'] ?? 0)) { $mlinks[(int) $p['portrait_media_id']][(int) $p['id']] = true; } }
        $sortSql = function_exists('picker_media_sort_sql') ? picker_media_sort_sql($pdo) : "CASE WHEN lower(m.media_type) IN ('document','pdf') THEN 'document' ELSE 'photo' END";
        $rows = $pdo->query("SELECT m.id, m.title, m.filename, m.media_type, m.date_text, m.transcription, m.document_reference, {$sortSql} AS sort FROM media m ORDER BY m.id")->fetchAll();
        $root = realpath(MEDIA_DIR);
        $k = 0;
        foreach ($rows as $m) {
            $mid = (int) $m['id'];
            $people = array_keys(($mlinks[$mid] ?? []) + ($tagged[$mid] ?? []));
            $shown = array_values(array_filter($people, static fn($pid) => isset($num[$pid]) && !isset($hidden[$pid])));
            if (!$shown) { continue; } // rien à voir avec la copie
            if (array_filter($people, static fn($pid) => isset($hidden[$pid]))) { $sum['media_skipped_hidden']++; continue; } // un vivant ou une fiche confidentielle dessus
            $isDoc = (string) $m['sort'] === 'document';
            if (($isDoc && !$o['docs']) || (!$isDoc && !$o['photos'])) { continue; }
            $ext = strtolower(pathinfo((string) $m['filename'], PATHINFO_EXTENSION));
            if ((string) $m['media_type'] !== 'image' || !in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif'], true)) { $sum['media_skipped_other']++; continue; } // PDF, sons, vidéos : pas dans la copie
            $path = $root ? realpath(MEDIA_DIR . '/' . (string) $m['filename']) : false;
            if (!$root || !$path || !str_starts_with($path, $root . DIRECTORY_SEPARATOR) || !is_file($path)) { $sum['media_skipped_other']++; continue; }
            if (count($media) >= FS_MAX_MEDIA) { $sum['media_skipped_other']++; continue; }
            $k++;
            $item = ['t' => trim((string) $m['title']) ?: ($isDoc ? 'Document' : 'Photo'), 'k' => $isDoc ? 'doc' : 'photo', 'f' => "photos/m{$k}.jpg", 'th' => "photos/t{$k}.jpg", 'y' => trim((string) $m['date_text'])];
            if ($isDoc && trim((string) $m['document_reference']) !== '') { $item['c'] = trim((string) $m['document_reference']); }
            if ($isDoc && trim((string) $m['transcription']) !== '') { $item['tr'] = mb_substr(fs_plain((string) $m['transcription']), 0, 30000); }
            $media[] = $item;
            $files[] = ['src' => $path, 'n' => $k];
            $sum[$isDoc ? 'docs' : 'photos']++;
            $sum['bytes'] += min((int) filesize($path), 450000) + 30000;
            foreach ($shown as $pid) { $mediaFor[$pid][] = count($media) - 1; }
        }
    }

    // les fiches
    $people = [];
    foreach ($all as $p) {
        $id = (int) $p['id'];
        if (!isset($num[$id])) { continue; }
        $sex = match ((string) $p['gender']) { 'male' => 'm', 'female' => 'f', default => 'u' };
        $par = []; $sp = [];
        foreach ($famById as $fid => $f) {
            if (!isset($famNum[$fid])) { continue; }
            if (in_array($id, $kids[$fid] ?? [], true)) { $par[] = $famNum[$fid]; }
            if ((int) ($f['partner1_id'] ?? 0) === $id || (int) ($f['partner2_id'] ?? 0) === $id) { $sp[] = $famNum[$fid]; }
        }
        if (isset($hidden[$id])) { // vivant, prénom seulement : rien d'autre
            $first = trim(preg_split('/\s+/u', trim((string) $p['first_name']))[0] ?? '');
            $people[] = ['i' => $num[$id], 'f' => $first !== '' ? $first : 'Personne vivante', 'l' => '', 's' => $sex, 'lv' => 1, 'par' => $par, 'fam' => $sp];
            continue;
        }
        $ev = $evByPerson[$id] ?? [];
        $sum['events'] += count($ev);
        $row = ['i' => $num[$id], 'f' => trim((string) $p['first_name'] . ' ' . (string) $p['middle_name']), 'l' => trim((string) $p['last_name']), 's' => $sex,
            'b' => trim((string) ($p['birth_date'] ?: $p['bapt_date'] ?: ($p['birth_year'] ?? ''))), 'd' => trim((string) ($p['death_date'] ?: $p['buri_date'] ?: ($p['death_year'] ?? ''))),
            'by' => $p['birth_year'] !== null ? (int) $p['birth_year'] : ($p['bapt_year'] !== null ? (int) $p['bapt_year'] : null), 'dy' => $p['death_year'] !== null ? (int) $p['death_year'] : ($p['buri_year'] !== null ? (int) $p['buri_year'] : null),
            'ev' => $ev, 'par' => $par, 'fam' => $sp];
        if (!empty($notesBy[$id])) { $row['no'] = $notesBy[$id]; }
        if (!empty($mediaFor[$id])) { $row['md'] = array_values(array_unique($mediaFor[$id])); }
        $people[] = $row;
    }
    // portrait : la photo de la fiche, si elle part
    $portraitOf = [];
    foreach ($all as $p) { if (isset($num[(int) $p['id']]) && !isset($hidden[(int) $p['id']]) && (int) ($p['portrait_media_id'] ?? 0)) { $portraitOf[$num[(int) $p['id']]] = (int) $p['portrait_media_id']; } }
    if ($portraitOf) {
        $srcToIdx = []; foreach ($files as $i => $fl) { $srcToIdx[$fl['src']] = $i; }
        $s = $pdo->prepare('SELECT filename FROM media WHERE id=?');
        foreach ($people as &$row) {
            if (!isset($portraitOf[$row['i']])) { continue; }
            $s->execute([$portraitOf[$row['i']]]); $fn = (string) $s->fetchColumn();
            $path = $fn !== '' ? realpath(MEDIA_DIR . '/' . $fn) : false;
            if ($path && isset($srcToIdx[$path])) { $row['ph'] = $srcToIdx[$path]; }
        }
        unset($row);
    }
    $sum['people'] = count($people);

    // la racine : la personne de départ si elle part en entier, sinon la première fiche de la première branche
    $start = (int) $pdo->query('SELECT id FROM persons ORDER BY is_start DESC, id LIMIT 1')->fetchColumn();
    $rootId = $o['branches'] ? $o['branches'][0]['person'] : $start;
    if (!$open($rootId)) { $rootId = $open($start) ? $start : 0; }
    if (!$rootId) { foreach ($people as $row) { if (empty($row['lv'])) { $rootId = array_search($row['i'], $num, true) ?: 0; break; } } }

    // noms complets des personnes cachées (sauf homonymes de personnes qui partent) : à retirer de tous les textes
    $shownNames = [];
    foreach ($all as $p) { if ($open((int) $p['id'])) { $shownNames[fs_fold($p['first_name'] . ' ' . $p['last_name'])] = true; $shownNames[fs_fold($p['last_name'] . ' ' . $p['first_name'])] = true; } }
    $forbidden = [];
    foreach ($hidden as $hid => $why) {
        $p = $byId[$hid] ?? null; if (!$p) { continue; }
        $first = trim((string) $p['first_name']); $last = trim((string) $p['last_name']);
        if ($first === '' || $last === '') { continue; }
        $one = trim(preg_split('/\s+/u', $first)[0] ?? '');
        foreach (array_unique([$first . ' ' . $last, $last . ' ' . $first, $one . ' ' . $last, $last . ' ' . $one]) as $full) {
            if (mb_strlen($full) >= 5 && !isset($shownNames[fs_fold($full)])) { $forbidden[] = $full; }
        }
    }
    $forbidden = array_values(array_unique($forbidden));
    usort($forbidden, static fn($a, $b) => mb_strlen($b) <=> mb_strlen($a));
    $redact = static function (string $s) use ($forbidden, &$sum): string {
        if ($s === '' || !$forbidden) { return $s; }
        foreach ($forbidden as $name) {
            $re = '/(?<![\p{L}])' . implode('[\s\-]+', array_map(static fn($w) => preg_quote($w, '/'), preg_split('/\s+/u', $name))) . '(?![\p{L}])/iu';
            $s = (string) preg_replace_callback($re, static function () use (&$sum) { $sum['names_redacted']++; return FS_REDACTED; }, $s);
        }
        return $s;
    };
    $walk = static function ($v) use (&$walk, $redact) { if (is_string($v)) { return $redact($v); } if (is_array($v)) { foreach ($v as $k => $x) { $v[$k] = $walk($x); } } return $v; };
    $people = array_map(static function ($row) use ($walk) { $keep = ['f' => $row['f'], 'l' => $row['l'] ?? '']; $row = $walk($row); return array_merge($row, $keep); }, $people); // le nom de la fiche elle-même ne bouge pas
    $fams = $walk($fams); $media = $walk($media);

    $title = $o['title'] !== '' ? $o['title'] : 'L’arbre de la famille';
    $data = ['v' => 1, 'title' => $title, 'made' => date('Y-m-d'), 'living' => $o['living'], 'root' => $rootId ? ($num[$rootId] ?? 0) : 0,
        'people' => array_values($people), 'fams' => $fams, 'media' => $media,
        'counts' => ['people' => $sum['people'], 'living_hidden' => $sum['living_hidden'] + $sum['living_first'], 'private' => $sum['private_removed']]];
    return ['data' => $data, 'files' => $files, 'summary' => $sum, 'forbidden' => $forbidden];
}

/** Dernière vérification : rien de caché dans le paquet ; sinon une erreur et rien n'est envoyé. */
function family_share_check(array $pkg): void
{
    $json = json_encode($pkg['data'], JSON_UNESCAPED_UNICODE);
    $fold = fs_fold((string) $json);
    foreach ($pkg['forbidden'] as $name) {
        if (preg_match('/(?<![\p{L}])' . implode('[\s\-]+', array_map(static fn($w) => preg_quote(fs_fold($w), '/'), preg_split('/\s+/u', $name))) . '(?![\p{L}])/iu', $fold)) {
            throw new RuntimeException('Contrôle : le nom d’une personne cachée restait dans la copie. Rien n’a été fabriqué.');
        }
    }
    foreach ($pkg['data']['people'] as $p) {
        if (!empty($p['lv']) && (isset($p['b']) || isset($p['d']) || isset($p['ev']) || isset($p['md']) || isset($p['no']) || isset($p['ph']) || ($p['l'] ?? '') !== '')) {
            throw new RuntimeException('Contrôle : une personne vivante avait encore des renseignements. Rien n’a été fabriqué.');
        }
    }
}

function fs_image_bytes(string $path, int $max): ?string
{
    $info = @getimagesize($path);
    if (!$info || !extension_loaded('gd') || (int) $info[0] * (int) $info[1] > 60000000) { return null; }
    $loader = match ($info[2]) { IMAGETYPE_JPEG => 'imagecreatefromjpeg', IMAGETYPE_PNG => 'imagecreatefrompng', IMAGETYPE_WEBP => 'imagecreatefromwebp', IMAGETYPE_GIF => 'imagecreatefromgif', default => null };
    $img = $loader && function_exists($loader) ? @$loader($path) : null;
    if (!$img) { return null; }
    $r = min(1, $max / max($info[0], $info[1]));
    $w = max(1, (int) round($info[0] * $r)); $h = max(1, (int) round($info[1] * $r));
    $out = imagecreatetruecolor($w, $h);
    imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255));
    imagecopyresampled($out, $img, 0, 0, 0, 0, $w, $h, $info[0], $info[1]);
    ob_start(); imagejpeg($out, null, $max > 600 ? 84 : 78); $bytes = (string) ob_get_clean(); // réenregistrée : sans EXIF (GPS, appareil…)
    imagedestroy($out); imagedestroy($img);
    return $bytes;
}

function family_share_html(array $data): string
{
    $css = (string) @file_get_contents(APP_ROOT . '/assets/css/family-share.css');
    $js = (string) @file_get_contents(APP_ROOT . '/assets/js/family-share-viewer.js');
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_INVALID_UTF8_SUBSTITUTE);
    $title = htmlspecialchars((string) $data['title'], ENT_QUOTES);
    $safe = static fn(string $code) => str_ireplace(['</script', '</style'], ['<\/script', '<\/style'], $code);
    return "<!doctype html>\n<html lang=\"fr\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
        . "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src 'self' file: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'none'; base-uri 'none'\">"
        . "<meta name=\"robots\" content=\"noindex, nofollow\"><meta name=\"referrer\" content=\"no-referrer\"><title>{$title}</title><style>" . $safe($css) . "</style></head>\n<body>"
        . "<noscript><p style=\"padding:1rem\">Pour voir l’arbre, autorise JavaScript pour ce fichier (il ne va jamais sur internet).</p></noscript><div id=\"fs-app\"></div>"
        . "<script id=\"fs-data\" type=\"application/json\">{$json}</script><script>" . $safe($js) . "</script></body></html>";
}

function family_share_dispatch(PDO $pdo, string $action, array $q): never
{
    try {
        @ini_set('memory_limit', '1024M');
        $o = fs_options($q);
        foreach ($o['branches'] as $b) { $c = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $c->execute([$b['person']]); if (!$c->fetchColumn()) { throw new LcndaBadInput('Une des personnes choisies pour les branches n’existe plus.'); } }
        $pkg = family_share_build($pdo, $o);
        family_share_check($pkg);
        if ($action === 'family_share_preview') {
            $s = $pkg['summary'];
            $r = $pkg['data']['root'] ? ($pkg['data']['people'][array_search($pkg['data']['root'], array_column($pkg['data']['people'], 'i'), true)] ?? null) : null;
            json_response(['ok' => true, 'summary' => $s, 'title' => $pkg['data']['title'], 'root' => $r ? ['name' => trim($r['f'] . ' ' . $r['l']), 'by' => $r['by'] ?? null, 'dy' => $r['dy'] ?? null] : null,
                'gd' => extension_loaded('gd'), 'zip' => class_exists('ZipArchive')]);
        }
        if (!class_exists('ZipArchive')) { json_response(['error' => 'Export impossible : l’extension PHP zip manque.'], 500); }
        @set_time_limit(900);
        $tmp = tempnam(sys_get_temp_dir(), 'partage');
        $zip = new ZipArchive();
        if ($zip->open($tmp, ZipArchive::OVERWRITE) !== true) { throw new RuntimeException('Impossible de préparer le fichier.'); }
        $data = $pkg['data'];
        foreach ($pkg['files'] as $i => $f) {
            $big = fs_image_bytes($f['src'], FS_IMG_MAX); $small = fs_image_bytes($f['src'], FS_THUMB_MAX);
            if ($big === null || $small === null) { $data['media'][$i]['gone'] = 1; continue; } // image illisible : la vignette dit « image absente »
            $zip->addFromString("photos/m{$f['n']}.jpg", $big);
            $zip->addFromString("photos/t{$f['n']}.jpg", $small);
        }
        $zip->addFromString('index.html', family_share_html($data));
        $made = date('d/m/Y');
        $zip->addFromString('LISEZ-MOI.txt', "« {$data['title']} » — copie de l’arbre en lecture seule ({$made})\r\n\r\n"
            . "1. Décompresse ce dossier (clic droit → Extraire tout, ou double-clic sur Mac).\r\n2. Ouvre le fichier index.html (double-clic) : l’arbre s’affiche dans le navigateur, sans internet ni logiciel à installer.\r\n\r\n"
            . "Rien ne peut y être modifié. Les personnes vivantes n’y figurent pas" . ($o['living'] === 'first' ? ' (seulement leur prénom)' : '') . ", ni les fiches confidentielles.\r\n\r\nFait avec LCNDA — Le Carnet numérique des ancêtres.\r\n");
        $zip->close();
        $slug = trim((string) preg_replace('/[^a-z0-9]+/', '-', strtolower((string) @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $data['title']))), '-') ?: 'famille';
        $name = 'arbre-' . mb_substr($slug, 0, 50) . '-' . date('Ymd') . '.zip';
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="' . $name . '"');
        header('Content-Length: ' . filesize($tmp));
        header('Cache-Control: no-store, private');
        header('X-Content-Type-Options: nosniff');
        readfile($tmp); @unlink($tmp);
        exit;
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], 422);
    }
}
