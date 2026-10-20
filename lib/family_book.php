<?php
declare(strict_types=1);

/**
 * 📖 Livre de famille (Maintenance → Export propre) : on choisit les parties du livre et leur ordre (couverture, préface,
 * chiffres, arbre, fiches, chronologie, lieux, index, mot de la fin), ce que montre chaque fiche et dans quel ordre
 * (biographie, famille, repères, photos, notes), l'allure (style, police, format de page, couleur) et le format du
 * fichier : page à imprimer ou PDF, HTML, Word, OpenDocument, ePub (liseuse), Markdown, texte, tableau CSV des personnes.
 * La branche (ancêtres, descendants…) vient de family_book_branch() (api.php).
 */

const FAMILY_BOOK_SECTIONS = ['cover' => 'Couverture', 'preface' => 'Préface', 'stats' => 'La famille en chiffres', 'tree' => 'L’arbre',
    'people' => 'Les fiches', 'chronology' => 'Chronologie', 'places' => 'Les lieux de la famille', 'index' => 'Index des noms', 'epilogue' => 'Mot de la fin'];
const FAMILY_BOOK_PARTS = ['bio' => 'Biographie', 'family' => 'Famille proche', 'events' => 'Repères chronologiques', 'photos' => 'Photos', 'notes' => 'Notes'];
const FAMILY_BOOK_FORMATS = ['html', 'doc', 'odt', 'epub', 'md', 'txt', 'csv'];

/** Réglages du livre lus dans l'adresse (les anciennes cases tree/bio/photos/chronology restent comprises) */
function family_book_options(array $q): array
{
    $list = static function (string $key, array $allowed, array $default) use ($q): array {
        if (!isset($q[$key])) { return $default; }
        $out = [];
        foreach (explode(',', (string) $q[$key]) as $k) { $k = trim($k); if (isset($allowed[$k]) && !in_array($k, $out, true)) { $out[] = $k; } }
        return $out;
    };
    $flag = static fn(string $k) => !isset($q[$k]) || !in_array(strtolower((string) $q[$k]), ['0', 'false', 'off', 'no'], true);
    $sections = $list('sections', FAMILY_BOOK_SECTIONS, array_values(array_filter(['cover', $flag('tree') ? 'tree' : null, 'people', $flag('chronology') ? 'chronology' : null])));
    $parts = $list('parts', FAMILY_BOOK_PARTS, array_values(array_filter([$flag('bio') ? 'bio' : null, 'family', 'events', $flag('photos') ? 'photos' : null])));
    $text = static fn(string $k, int $max) => trim(mb_substr((string) ($q[$k] ?? ''), 0, $max));
    $pick = static fn(string $k, array $allowed, string $default) => in_array($q[$k] ?? '', $allowed, true) ? (string) $q[$k] : $default;
    $accent = preg_match('/^#[0-9a-f]{6}$/i', (string) ($q['accent'] ?? '')) ? (string) $q['accent'] : '';
    return [
        'sections' => $sections ?: ['people'], 'parts' => $parts,
        'title' => $text('title', 200), 'subtitle' => $text('subtitle', 300), 'author' => $text('author', 200),
        'preface' => $text('preface', 8000), 'epilogue' => $text('epilogue', 8000),
        'theme' => $pick('theme', ['classic', 'modern', 'sepia', 'elegant', 'minimal'], 'modern'),
        'font' => $pick('font', ['sans', 'serif', 'mono'], 'sans'),
        'paper' => $pick('paper', ['A4', 'A5', 'letter'], 'A4'),
        'order' => $pick('order', ['book', 'birth', 'name', 'generation'], 'book'),
        'flow' => $pick('flow', ['page', 'flow'], 'page'),
        'photos' => max(0, min(12, (int) ($q['photo_count'] ?? 3))),
        'events' => max(0, min(60, (int) ($q['event_count'] ?? 12))),
        'accent' => $accent,
        'format' => $pick('format', FAMILY_BOOK_FORMATS, 'html'),
    ];
}

/** Tout le contenu du livre, prêt pour n'importe quel format */
function family_book_model(PDO $pdo, array $o, array $q): array
{
    $people = array_values(array_filter($pdo->query(person_select() . " ORDER BY COALESCE(birth_year,9999),p.last_name COLLATE NOCASE,p.first_name COLLATE NOCASE,p.id")->fetchAll(), 'export_person_allowed'));
    $scope = in_array($q['scope'] ?? 'all', ['all', 'ancestors', 'descendants', 'both'], true) ? (string) ($q['scope'] ?? 'all') : 'all';
    $allowed = $people; // les parents, conjoints et enfants hors de la branche sont nommés quand même
    [$people, $numbers, $branchTitle] = family_book_branch($pdo, $people, safe_int($q['root_id'] ?? 0), $scope, max(1, min(30, safe_int($q['generations'] ?? 8) ?: 8)));
    $visible = family_book_person_set($people);
    $related = family_book_person_set($allowed);
    $byId = [];
    foreach ($allowed as $p) { $byId[(int) $p['id']] = $p; }
    $life = static fn(array $p) => (($p['birth_date'] ?? '') ?: ($p['birth_year'] ?? '') ?: '?') . ' – ' . (($p['living_status'] ?? '') === 'living' ? '' : ((($p['death_date'] ?? '') ?: ($p['death_year'] ?? '')) ?: '?'));
    $numberLabel = static function (int $id) use ($numbers): string {
        $parts = [];
        if (!empty($numbers[$id]['sosa'])) $parts[] = 'Sosa ' . implode(', ', $numbers[$id]['sosa']);
        if (!empty($numbers[$id]['daboville'])) $parts[] = 'd’Aboville ' . implode(', ', $numbers[$id]['daboville']);
        return implode(' · ', $parts);
    };

    $eventsBy = [];
    foreach ($pdo->query("SELECT e.*,t.label AS type_label,t.gedcom_tag,pl.name AS place_name,pl.county,pl.country,f.partner1_id,f.partner2_id
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id LEFT JOIN families f ON f.id=e.family_id
        ORDER BY COALESCE(e.year,9999),e.id") as $e) {
        $ids = ($e['scope'] ?? '') === 'family' ? array_filter([(int) ($e['partner1_id'] ?? 0), (int) ($e['partner2_id'] ?? 0)]) : array_filter([(int) ($e['person_id'] ?? 0)]);
        foreach (array_unique($ids) as $id) { if (isset($visible[$id])) { $eventsBy[$id][] = $e; } }
    }
    $parentsOf = []; $childrenOf = []; $partnersOf = [];
    foreach ($pdo->query('SELECT fc.child_id,f.partner1_id,f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id ORDER BY fc.position,fc.id') as $r) {
        $c = (int) $r['child_id'];
        foreach (array_filter([(int) ($r['partner1_id'] ?? 0), (int) ($r['partner2_id'] ?? 0)]) as $pid) {
            if (isset($related[$c], $related[$pid])) { $parentsOf[$c][$pid] = $pid; $childrenOf[$pid][$c] = $c; }
        }
    }
    foreach ($pdo->query('SELECT partner1_id,partner2_id FROM families WHERE partner1_id IS NOT NULL AND partner2_id IS NOT NULL') as $r) {
        $a = (int) $r['partner1_id']; $b = (int) $r['partner2_id'];
        if (isset($related[$a], $related[$b])) { $partnersOf[$a][$b] = $b; $partnersOf[$b][$a] = $a; }
    }
    $photosBy = [];
    if (in_array('photos', $o['parts'], true) && $o['photos'] > 0) {
        foreach ($pdo->query("SELECT ml.entity_id AS person_id,m.id,m.title,m.filename,m.thumbnail FROM media_links ml JOIN media m ON m.id=ml.media_id
            WHERE ml.entity_type='person' AND COALESCE(m.media_type,'image')='image' ORDER BY ml.position,m.id") as $m) {
            $pid = (int) $m['person_id'];
            if (isset($visible[$pid]) && count($photosBy[$pid] ?? []) < $o['photos']) { $photosBy[$pid][] = ['id' => (int) $m['id'], 'file' => ($m['thumbnail'] ?? '') ?: (string) $m['filename'], 'full' => (string) $m['filename'], 'title' => ($m['title'] ?? '') ?: (string) $m['filename']]; }
        }
    }
    $notesBy = [];
    if (in_array('notes', $o['parts'], true)) {
        foreach ($pdo->query("SELECT entity_id, title, body FROM notes WHERE entity_type='person' AND trim(COALESCE(body,''))<>'' ORDER BY id") as $n) {
            if (isset($visible[(int) $n['entity_id']])) { $notesBy[(int) $n['entity_id']][] = ['title' => (string) $n['title'], 'body' => strip_tags((string) $n['body'])]; }
        }
    }
    // Ordre des fiches
    if ($o['order'] === 'birth') { usort($people, static fn($a, $b) => [(int) ($a['birth_year'] ?: 9999), full_name($a)] <=> [(int) ($b['birth_year'] ?: 9999), full_name($b)]); }
    elseif ($o['order'] === 'name') { usort($people, static fn($a, $b) => strcoll(mb_strtolower(($a['last_name'] ?? '') . ' ' . ($a['first_name'] ?? '')), mb_strtolower(($b['last_name'] ?? '') . ' ' . ($b['first_name'] ?? '')))); }
    elseif ($o['order'] === 'generation' && $numbers) { usort($people, static function ($a, $b) use ($numbers) { $g = static fn($p) => ($s = $numbers[(int) $p['id']]['sosa'][0] ?? null) ? (int) floor(log((float) $s, 2)) : (($d = $numbers[(int) $p['id']]['daboville'][0] ?? null) ? substr_count((string) $d, '.') : 99); return [$g($a), (int) ($a['birth_year'] ?: 9999)] <=> [$g($b), (int) ($b['birth_year'] ?: 9999)]; }); }

    $persons = []; $portraitStmt = null;
    foreach ($people as $p) {
        $id = (int) $p['id'];
        $names = static fn(array $ids) => array_values(array_filter(array_map(static fn($x) => $byId[$x] ?? null, array_values($ids))));
        $parents = $names($parentsOf[$id] ?? []); $partners = $names($partnersOf[$id] ?? []); $children = $names($childrenOf[$id] ?? []);
        $evs = $eventsBy[$id] ?? [];
        // pour le publipostage de la mise en page : lieux de naissance et de décès, métier, premier numéro Sosa, portrait en grand
        $placeOf = static function (array $tags) use ($evs): string { foreach ($tags as $t) { foreach ($evs as $e) { if (($e['gedcom_tag'] ?? '') === $t && ($e['place_name'] ?? '') !== '') { return (string) $e['place_name']; } } } return ''; };
        $portraitFull = '';
        if (!empty($p['portrait_media_id'])) { $portraitStmt ??= $pdo->prepare('SELECT filename FROM media WHERE id=?'); $portraitStmt->execute([(int) $p['portrait_media_id']]); $portraitFull = (string) ($portraitStmt->fetchColumn() ?: ''); }
        $persons[] = [
            'id' => $id, 'name' => full_name($p) ?: 'Personne sans nom', 'number' => $numberLabel($id), 'life' => $life($p),
            'first_name' => (string) ($p['first_name'] ?? ''), 'last_name' => (string) ($p['last_name'] ?? ''), 'gender' => (string) ($p['gender'] ?? 'unknown'),
            'birth' => (string) (($p['birth_date'] ?? '') ?: ($p['birth_year'] ?? '')), 'death' => (string) (($p['death_date'] ?? '') ?: ($p['death_year'] ?? '')),
            'status' => family_book_life_label($p['living_status'] ?? 'unknown'), 'group' => (string) ($p['surname_group'] ?? ''),
            'portrait' => (string) ($p['portrait'] ?? ''),
            'bio' => automatic_biography($p, $evs, $parents, $partners, $children),
            'parents' => array_map(static fn($x) => full_name($x), $parents), 'partners' => array_map(static fn($x) => full_name($x), $partners), 'children' => array_map(static fn($x) => full_name($x), $children),
            'events' => array_map(static fn($e) => ['date' => (string) (($e['date_text'] ?? '') ?: ($e['year'] ?? '')), 'type' => (string) ($e['type_label'] ?? 'Événement'), 'place' => trim(implode(', ', array_filter([$e['place_name'] ?? '', $e['country'] ?? ''])))], array_slice($evs, 0, $o['events'] ?: 0)),
            'photos' => $photosBy[$id] ?? [], 'notes' => $notesBy[$id] ?? [],
            'occupation' => trim((string) ($p['occupation'] ?? '')), 'birth_place' => $placeOf(['BIRT', 'CHR', 'BAPM']), 'death_place' => $placeOf(['DEAT', 'BURI']),
            'sosa' => (string) ($numbers[$id]['sosa'][0] ?? ''), 'portrait_id' => (int) ($p['portrait_media_id'] ?? 0), 'portrait_full' => $portraitFull,
        ];
    }
    // L'arbre
    $tree = ['ancestors' => [], 'descendants' => []];
    foreach ($people as $p) {
        foreach ($numbers[(int) $p['id']]['sosa'] ?? [] as $n) { $tree['ancestors'][(int) floor(log((float) $n, 2)) + 1][$n] = [$n, full_name($p), $life($p)]; }
        foreach ($numbers[(int) $p['id']]['daboville'] ?? [] as $n) { $tree['descendants'][$n] = [$n, full_name($p), $life($p), substr_count((string) $n, '.')]; }
    }
    ksort($tree['ancestors']); foreach ($tree['ancestors'] as &$g) { ksort($g); } unset($g);
    uksort($tree['descendants'], 'strnatcmp');
    // Chronologie et lieux
    $chrono = []; $seen = []; $places = [];
    foreach ($people as $p) {
        foreach ($eventsBy[(int) $p['id']] ?? [] as $e) {
            if (isset($seen[(int) $e['id']])) { continue; }
            $seen[(int) $e['id']] = true;
            $who = ($e['scope'] ?? '') === 'family' ? implode(' et ', array_map('full_name', array_values(array_filter([$byId[(int) ($e['partner1_id'] ?? 0)] ?? null, $byId[(int) ($e['partner2_id'] ?? 0)] ?? null])))) : full_name($p);
            $place = trim(implode(', ', array_filter([$e['place_name'] ?? '', $e['country'] ?? ''])));
            $chrono[] = ['y' => (int) ($e['year'] ?? 0) ?: 9999, 'date' => (string) ((($e['date_text'] ?? '') ?: ($e['year'] ?? '')) ?: '?'), 'type' => (string) ($e['type_label'] ?? 'Événement'), 'who' => $who, 'place' => $place];
            if (($e['place_name'] ?? '') !== '') {
                $k = (string) $e['place_name'] . (($e['county'] ?? '') ? ' (' . $e['county'] . ')' : '');
                $places[$k] ??= ['place' => $k, 'events' => 0, 'from' => null, 'to' => null, 'people' => []];
                $places[$k]['events']++; $places[$k]['people'][full_name($p)] = true;
                if ($e['year']) { $places[$k]['from'] = $places[$k]['from'] === null ? (int) $e['year'] : min($places[$k]['from'], (int) $e['year']); $places[$k]['to'] = max((int) $places[$k]['to'], (int) $e['year']); }
            }
        }
    }
    usort($chrono, static fn($a, $b) => $a['y'] <=> $b['y']);
    usort($places, static fn($a, $b) => $b['events'] <=> $a['events'] ?: strcoll($a['place'], $b['place']));
    foreach ($places as &$pl) { $pl['people'] = count($pl['people']); } unset($pl);
    // Chiffres
    $years = array_filter(array_map(static fn($p) => (int) ($p['birth_year'] ?? 0), $people));
    $ages = []; foreach ($people as $p) { if ($p['birth_year'] && $p['death_year'] && $p['death_year'] >= $p['birth_year']) { $ages[] = (int) $p['death_year'] - (int) $p['birth_year']; } }
    $surnames = []; foreach ($people as $p) { $s = trim((string) ($p['last_name'] ?? '')); if ($s !== '') { $surnames[$s] = ($surnames[$s] ?? 0) + 1; } }
    arsort($surnames);
    $stats = ['people' => count($people), 'men' => count(array_filter($people, static fn($p) => ($p['gender'] ?? '') === 'male')), 'women' => count(array_filter($people, static fn($p) => ($p['gender'] ?? '') === 'female')),
        'from' => $years ? min($years) : null, 'to' => $years ? max($years) : null, 'age' => $ages ? (int) round(array_sum($ages) / count($ages)) : null,
        'surnames' => array_slice($surnames, 0, 12, true), 'places' => count($places), 'events' => count($chrono)];
    $index = $persons;
    usort($index, static fn($a, $b) => strcoll(mb_strtolower($a['last_name'] . ' ' . $a['first_name']), mb_strtolower($b['last_name'] . ' ' . $b['first_name'])));
    return ['title' => $o['title'] ?: ($branchTitle !== '' ? $branchTitle : 'Généalogie familiale'), 'subtitle' => $o['subtitle'], 'author' => $o['author'], 'date' => date('d/m/Y'),
        'persons' => $persons, 'tree' => $tree, 'chronology' => $chrono, 'places' => array_values($places), 'stats' => $stats,
        'index' => array_map(static fn($p) => ['id' => $p['id'], 'name' => ($p['last_name'] !== '' ? mb_strtoupper($p['last_name']) . ' ' : '') . $p['first_name'], 'life' => $p['life'], 'number' => $p['number']], $index)];
}

/** Fichier d'une image du livre (pour l'ePub et le document OpenDocument), seulement dans le dossier des médias */
function family_book_media_file(string $filename): ?string
{
    $root = realpath(MEDIA_DIR);
    $path = $root !== false && $filename !== '' ? realpath($root . '/' . $filename) : false;
    return $path && str_starts_with($path, $root . DIRECTORY_SEPARATOR) && is_file($path) && filesize($path) <= 3 * 1024 * 1024 ? $path : null;
}

/* ─────────────── HTML (page à imprimer / PDF, fichier HTML, Word) ─────────────── */
function family_book_html(array $m, array $o, string $mode = 'html'): string
{
    $e = static fn($v) => htmlspecialchars((string) $v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $nl = static fn($v) => nl2br($e($v));
    $themes = [
        'modern' => ['#111', '#006dcc', '#f5f5f5', '#fff', '2px solid #111'],
        'classic' => ['#222', '#7a1f1f', '#f3efe6', '#fffdf8', '1px solid #7a1f1f'],
        'sepia' => ['#3b2a1a', '#8b5a2b', '#efe4d0', '#fbf5ea', '1px solid #b89870'],
        'elegant' => ['#1d2433', '#9c7b3c', '#eceae4', '#fff', '1px solid #c9b48a'],
        'minimal' => ['#222', '#444', '#fff', '#fff', '1px solid #ddd'],
    ];
    [$ink, $accent, $bg, $paper, $line] = $themes[$o['theme']] ?? $themes['modern'];
    if ($o['accent']) { $accent = $o['accent']; }
    $font = ['sans' => 'Arial, Helvetica, sans-serif', 'serif' => 'Georgia, "Times New Roman", serif', 'mono' => '"Courier New", monospace'][$o['font']];
    $head = ['serif' => 'Georgia, "Times New Roman", serif', 'sans' => $font, 'mono' => $font][$o['font']];
    if (in_array($o['theme'], ['classic', 'elegant', 'sepia'], true)) { $head = 'Georgia, "Times New Roman", serif'; }
    $page = ['A4' => 'A4', 'A5' => 'A5', 'letter' => 'letter'][$o['paper']];
    $brk = $o['flow'] === 'page' ? 'break-before:page;page-break-before:always;' : 'margin-top:28px;';
    $word = $mode === 'doc';
    $img = static function (string $file) use ($mode): string {
        if ($mode === 'print') { return 'media/' . rawurlencode($file); }
        return family_book_media_src($file); // dans le fichier lui-même quand l'image est petite
    };
    $out = '<!doctype html><html lang="fr"' . ($word ? ' xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"' : '') . '><head><meta charset="utf-8"><title>' . $e($m['title']) . '</title>'
        . ($word ? '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->' : '')
        . '<style>
        @page{size:' . $page . ';margin:16mm}
        :root{--ink:' . $ink . ';--accent:' . $accent . '}
        body{font-family:' . $font . ';margin:0;color:' . $ink . ';line-height:1.5;background:' . ($word ? '#fff' : $bg) . '}
        h1,h2,h3{font-family:' . $head . ';color:' . $ink . '}
        .eyebrow{color:' . $accent . ';font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:bold}
        .sheet{background:' . $paper . ';padding:16mm 18mm;' . $brk . '}
        .sheet:first-of-type{break-before:auto;page-break-before:auto}
        .cover{min-height:' . ($word ? 'auto' : '88vh') . ';display:' . ($word ? 'block' : 'grid') . ';align-content:center;text-align:' . (in_array($o['theme'], ['classic', 'elegant'], true) ? 'center' : 'left') . '}
        .cover h1{font-size:48px;line-height:1.05;margin:10px 0}.cover .sub{font-size:20px;color:#555;margin:0 0 18px}.cover .meta{color:#666}
        .cover .rule{width:120px;height:3px;background:' . $accent . ';margin:18px ' . (in_array($o['theme'], ['classic', 'elegant'], true) ? 'auto' : '0') . '}
        h2{font-size:28px;margin:4px 0 14px;border-bottom:' . $line . ';padding-bottom:6px}
        h3{font-size:15px;margin:14px 0 6px;color:' . $accent . '}
        .person-head{display:flex;gap:16px;align-items:flex-start}.portrait{width:110px;height:110px;object-fit:cover;border:' . $line . '}
        .initials{width:110px;height:110px;border:' . $line . ';display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:bold;color:#888;background:#f4f4f4}
        .life{color:#555;font-weight:bold;margin:0}.chips span{display:inline-block;border:' . $line . ';padding:2px 8px;font-size:12px;margin:6px 6px 0 0}
        .box{border:' . $line . ';padding:10px 12px;margin-top:12px;break-inside:avoid;page-break-inside:avoid}
        .bio{white-space:pre-line}
        table{width:100%;border-collapse:collapse;font-size:13px}td,th{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}
        td.d{font-weight:bold;white-space:nowrap;width:110px}
        .photos{display:flex;flex-wrap:wrap;gap:8px}.photos figure{margin:0;width:31%;break-inside:avoid}.photos img{width:100%;height:130px;object-fit:cover;border:' . $line . '}.photos figcaption{font-size:11px;color:#666}
        .gen{break-inside:avoid;margin-bottom:12px}.gen ol{list-style:none;padding:0;margin:0;columns:2;column-gap:24px}.gen li{padding:2px 0;border-bottom:1px solid #eee;break-inside:avoid}.gen b,.desc b{color:' . $accent . ';display:inline-block;min-width:56px}
        .desc{list-style:none;padding:0;margin:0}.desc li{padding:2px 0;border-bottom:1px solid #eee}
        .stats{display:flex;flex-wrap:wrap;gap:12px}.stat{border:' . $line . ';padding:10px 14px;min-width:120px}.stat strong{display:block;font-size:26px;color:' . $accent . '}
        .index{columns:2;column-gap:28px;font-size:13px}.index div{break-inside:avoid;padding:1px 0}
        .text{white-space:pre-line;font-size:16px;line-height:1.7}
        .actions{position:sticky;top:0;background:#fff;border-bottom:2px solid #111;padding:10px 14px;text-align:right;z-index:2;font-family:Arial,sans-serif}
        .actions button{border:2px solid #111;background:#006dcc;color:#fff;font-weight:bold;padding:9px 14px;cursor:pointer}
        @media print{body{background:#fff}.actions{display:none}.sheet{padding:0}}
        </style></head><body>';
    if ($mode === 'print') { $out .= '<div class="actions"><button onclick="window.print()">Imprimer / enregistrer en PDF</button></div>'; }
    foreach ($o['sections'] as $s) {
        switch ($s) {
            case 'cover':
                $out .= '<section class="sheet cover"><span class="eyebrow">Livre de famille</span><h1>' . $e($m['title']) . '</h1>' . ($m['subtitle'] !== '' ? '<p class="sub">' . $e($m['subtitle']) . '</p>' : '') . '<div class="rule"></div><p class="meta">' . ($m['author'] !== '' ? $e($m['author']) . ' · ' : '') . $e(count($m['persons'])) . ' personne(s) · ' . $e($m['date']) . '</p></section>';
                break;
            case 'preface': if ($o['preface'] !== '') { $out .= '<section class="sheet"><span class="eyebrow">Préface</span><h2>Avant de commencer</h2><div class="text">' . $e($o['preface']) . '</div></section>'; } break;
            case 'epilogue': if ($o['epilogue'] !== '') { $out .= '<section class="sheet"><span class="eyebrow">Mot de la fin</span><h2>Pour finir</h2><div class="text">' . $e($o['epilogue']) . '</div></section>'; } break;
            case 'stats':
                $st = $m['stats'];
                $out .= '<section class="sheet"><span class="eyebrow">La famille en chiffres</span><h2>Quelques chiffres</h2><div class="stats">'
                    . '<div class="stat"><strong>' . $e($st['people']) . '</strong>personnes</div><div class="stat"><strong>' . $e($st['men']) . ' / ' . $e($st['women']) . '</strong>hommes / femmes</div>'
                    . ($st['from'] ? '<div class="stat"><strong>' . $e($st['from']) . '–' . $e($st['to']) . '</strong>naissances</div>' : '') . ($st['age'] ? '<div class="stat"><strong>' . $e($st['age']) . ' ans</strong>âge moyen au décès</div>' : '')
                    . '<div class="stat"><strong>' . $e($st['places']) . '</strong>lieux</div><div class="stat"><strong>' . $e($st['events']) . '</strong>événements</div></div>'
                    . ($st['surnames'] ? '<h3>Les noms les plus portés</h3><p>' . implode(' · ', array_map(static fn($n, $c) => $e($n) . ' (' . $c . ')', array_keys($st['surnames']), $st['surnames'])) . '</p>' : '') . '</section>';
                break;
            case 'tree':
                if (!$m['tree']['ancestors'] && !$m['tree']['descendants']) { break; }
                $out .= '<section class="sheet"><span class="eyebrow">L’arbre</span>';
                if ($m['tree']['ancestors']) {
                    $out .= '<h2>Les ancêtres</h2>';
                    foreach ($m['tree']['ancestors'] as $g => $rows) {
                        $out .= '<div class="gen"><h3>' . ($g === 1 ? 'Génération 1 : la personne de départ' : 'Génération ' . $g . ' (' . count($rows) . ' sur ' . (2 ** ($g - 1)) . ')') . '</h3><ol>';
                        foreach ($rows as [$n, $name, $life]) { $out .= '<li><b>' . $e($n) . '</b>' . $e($name) . ' <small>(' . $e($life) . ')</small></li>'; }
                        $out .= '</ol></div>';
                    }
                }
                if ($m['tree']['descendants']) {
                    $out .= '<h2>Les descendants</h2><ul class="desc">';
                    foreach ($m['tree']['descendants'] as [$n, $name, $life, $depth]) { $out .= '<li style="padding-left:' . ($depth * 18) . 'px"><b>' . $e($n) . '</b>' . $e($name) . ' <small>(' . $e($life) . ')</small></li>'; }
                    $out .= '</ul>';
                }
                $out .= '</section>';
                break;
            case 'people':
                foreach ($m['persons'] as $p) {
                    $ini = mb_strtoupper(mb_substr($p['first_name'], 0, 1) . mb_substr($p['last_name'], 0, 1)) ?: '?';
                    $portrait = in_array('photos', $o['parts'], true) && $p['portrait'] !== '' ? $img($p['portrait']) : '';
                    $out .= '<article class="sheet" id="p' . $p['id'] . '"><div class="person-head">' . ($portrait ? '<img class="portrait" src="' . $e($portrait) . '" alt="" width="110" height="110">' : '<div class="initials">' . $e($ini) . '</div>')
                        . '<div><span class="eyebrow">' . $e($p['number'] ?: 'Fiche n°' . $p['id']) . '</span><h2 style="border:0;margin:2px 0">' . $e($p['name']) . '</h2><p class="life">' . $e($p['life']) . '</p><div class="chips"><span>' . $e($p['status']) . '</span>' . ($p['group'] !== '' ? '<span>' . $e($p['group']) . '</span>' : '') . '</div></div></div>';
                    foreach ($o['parts'] as $part) {
                        if ($part === 'bio' && $p['bio'] !== '') { $out .= '<div class="box"><h3>Biographie</h3><div class="bio">' . $e($p['bio']) . '</div></div>'; }
                        if ($part === 'family') { $out .= '<div class="box"><h3>Famille proche</h3><table><tr><td class="d">Parents</td><td>' . $e(implode(' · ', $p['parents']) ?: '—') . '</td></tr><tr><td class="d">Conjoint(s)</td><td>' . $e(implode(' · ', $p['partners']) ?: '—') . '</td></tr><tr><td class="d">Enfant(s)</td><td>' . $e(implode(' · ', $p['children']) ?: '—') . '</td></tr></table></div>'; }
                        if ($part === 'events' && $p['events']) { $out .= '<div class="box"><h3>Repères chronologiques</h3><table>' . implode('', array_map(static fn($x) => '<tr><td class="d">' . $e($x['date']) . '</td><td><strong>' . $e($x['type']) . '</strong>' . ($x['place'] !== '' ? ' — ' . $e($x['place']) : '') . '</td></tr>', $p['events'])) . '</table></div>'; }
                        if ($part === 'photos' && $p['photos']) {
                            $figs = '';
                            foreach ($p['photos'] as $ph) { $src = $img($ph['file']); if ($src !== '') { $figs .= '<figure><img src="' . $e($src) . '" alt=""><figcaption>' . $e($ph['title']) . '</figcaption></figure>'; } }
                            if ($figs !== '') { $out .= '<div class="box"><h3>Photos</h3><div class="photos">' . $figs . '</div></div>'; }
                        }
                        if ($part === 'notes' && $p['notes']) { $out .= '<div class="box"><h3>Notes</h3>' . implode('', array_map(static fn($n) => ($n['title'] !== '' ? '<p><strong>' . $e($n['title']) . '</strong></p>' : '') . '<div class="bio">' . $e($n['body']) . '</div>', $p['notes'])) . '</div>'; }
                    }
                    $out .= '</article>';
                }
                break;
            case 'chronology':
                if (!$m['chronology']) { break; }
                $out .= '<section class="sheet"><span class="eyebrow">Chronologie</span><h2>Les grandes dates de la famille</h2><table>' . implode('', array_map(static fn($r) => '<tr><td class="d">' . $e($r['date']) . '</td><td><strong>' . $e($r['type']) . '</strong> — ' . $e($r['who']) . ($r['place'] !== '' ? '<br><small>' . $e($r['place']) . '</small>' : '') . '</td></tr>', $m['chronology'])) . '</table></section>';
                break;
            case 'places':
                if (!$m['places']) { break; }
                $out .= '<section class="sheet"><span class="eyebrow">Géographie</span><h2>Les lieux de la famille</h2><table><tr><th>Lieu</th><th>Événements</th><th>Personnes</th><th>Période</th></tr>' . implode('', array_map(static fn($r) => '<tr><td>' . $e($r['place']) . '</td><td>' . $e($r['events']) . '</td><td>' . $e($r['people']) . '</td><td>' . $e($r['from'] ? $r['from'] . ($r['to'] !== $r['from'] ? '–' . $r['to'] : '') : '') . '</td></tr>', $m['places'])) . '</table></section>';
                break;
            case 'index':
                $out .= '<section class="sheet"><span class="eyebrow">Index</span><h2>Index des noms</h2><div class="index">' . implode('', array_map(static fn($r) => '<div>' . (in_array('people', $o['sections'], true) && $mode !== 'doc' ? '<a href="#p' . $r['id'] . '">' . $e($r['name']) . '</a>' : $e($r['name'])) . ' <small>(' . $e($r['life']) . ')</small></div>', $m['index'])) . '</div></section>';
                break;
        }
    }
    return $out . '</body></html>';
}

/* ─────────────── Markdown et texte ─────────────── */
function family_book_markdown(array $m, array $o, bool $plain = false): string
{
    $h = static fn(int $lvl, string $t) => $plain ? ($lvl === 1 ? mb_strtoupper($t) . "\n" . str_repeat('=', min(70, mb_strlen($t))) : ($lvl === 2 ? $t . "\n" . str_repeat('-', min(70, mb_strlen($t))) : '» ' . $t)) : str_repeat('#', $lvl) . ' ' . $t;
    $b = static fn(string $t) => $plain ? $t : '**' . $t . '**';
    $L = [];
    foreach ($o['sections'] as $s) {
        switch ($s) {
            case 'cover': $L[] = $h(1, $m['title']); if ($m['subtitle'] !== '') $L[] = $m['subtitle']; $L[] = ($m['author'] !== '' ? $m['author'] . ' · ' : '') . count($m['persons']) . ' personne(s) · ' . $m['date']; break;
            case 'preface': if ($o['preface'] !== '') { $L[] = $h(2, 'Préface'); $L[] = $o['preface']; } break;
            case 'epilogue': if ($o['epilogue'] !== '') { $L[] = $h(2, 'Mot de la fin'); $L[] = $o['epilogue']; } break;
            case 'stats':
                $st = $m['stats']; $L[] = $h(2, 'La famille en chiffres');
                $L[] = "- {$st['people']} personnes ({$st['men']} hommes, {$st['women']} femmes)" . ($st['from'] ? "\n- naissances de {$st['from']} à {$st['to']}" : '') . ($st['age'] ? "\n- âge moyen au décès : {$st['age']} ans" : '') . "\n- {$st['places']} lieux, {$st['events']} événements";
                if ($st['surnames']) $L[] = 'Noms les plus portés : ' . implode(', ', array_map(static fn($n, $c) => "$n ($c)", array_keys($st['surnames']), $st['surnames']));
                break;
            case 'tree':
                if ($m['tree']['ancestors']) { $L[] = $h(2, 'Les ancêtres'); foreach ($m['tree']['ancestors'] as $g => $rows) { $L[] = $h(3, 'Génération ' . $g); $L[] = implode("\n", array_map(static fn($r) => "- {$r[0]}. {$r[1]} ({$r[2]})", $rows)); } }
                if ($m['tree']['descendants']) { $L[] = $h(2, 'Les descendants'); $L[] = implode("\n", array_map(static fn($r) => str_repeat('  ', $r[3]) . "- {$r[0]} {$r[1]} ({$r[2]})", $m['tree']['descendants'])); }
                break;
            case 'people':
                foreach ($m['persons'] as $p) {
                    $L[] = $h(2, $p['name'] . ' (' . $p['life'] . ')');
                    if ($p['number'] !== '') $L[] = $plain ? $p['number'] : '*' . $p['number'] . '*';
                    foreach ($o['parts'] as $part) {
                        if ($part === 'bio' && $p['bio'] !== '') { $L[] = $p['bio']; }
                        if ($part === 'family') { $L[] = '- ' . $b('Parents') . ' : ' . (implode(', ', $p['parents']) ?: '—') . "\n- " . $b('Conjoint(s)') . ' : ' . (implode(', ', $p['partners']) ?: '—') . "\n- " . $b('Enfant(s)') . ' : ' . (implode(', ', $p['children']) ?: '—'); }
                        if ($part === 'events' && $p['events']) { $L[] = $h(3, 'Repères') . "\n" . implode("\n", array_map(static fn($x) => "- {$x['date']} : {$x['type']}" . ($x['place'] !== '' ? " — {$x['place']}" : ''), $p['events'])); }
                        if ($part === 'notes' && $p['notes']) { $L[] = $h(3, 'Notes') . "\n" . implode("\n\n", array_map(static fn($n) => ($n['title'] !== '' ? $b($n['title']) . "\n" : '') . $n['body'], $p['notes'])); }
                        if ($part === 'photos' && $p['photos'] && !$plain) { $L[] = implode("\n", array_map(static fn($ph) => '![' . str_replace(['[', ']'], '', $ph['title']) . '](media/' . rawurlencode($ph['file']) . ')', $p['photos'])); }
                    }
                }
                break;
            case 'chronology': if ($m['chronology']) { $L[] = $h(2, 'Chronologie'); $L[] = implode("\n", array_map(static fn($r) => "- {$r['date']} — {$r['type']} — {$r['who']}" . ($r['place'] !== '' ? " ({$r['place']})" : ''), $m['chronology'])); } break;
            case 'places': if ($m['places']) { $L[] = $h(2, 'Les lieux de la famille'); $L[] = implode("\n", array_map(static fn($r) => "- {$r['place']} : {$r['events']} événement(s), {$r['people']} personne(s)" . ($r['from'] ? ", {$r['from']}–{$r['to']}" : ''), $m['places'])); } break;
            case 'index': $L[] = $h(2, 'Index des noms'); $L[] = implode("\n", array_map(static fn($r) => "- {$r['name']} ({$r['life']})", $m['index'])); break;
        }
    }
    return implode("\n\n", $L) . "\n";
}

function family_book_csv(array $m): string
{
    $rows = [['Nom', 'Prénoms', 'Numéro', 'Naissance', 'Décès', 'Parents', 'Conjoint(s)', 'Enfants']];
    foreach ($m['persons'] as $p) { $rows[] = [$p['last_name'], $p['first_name'], $p['number'], $p['birth'], $p['death'], implode(' ; ', $p['parents']), implode(' ; ', $p['partners']), implode(' ; ', $p['children'])]; }
    return "\xEF\xBB\xBF" . implode("\r\n", array_map(static fn($r) => implode(';', array_map(static fn($c) => '"' . str_replace('"', '""', (is_string($c) && $c !== '' && strpbrk($c[0], "=+-@\t\r") !== false && !is_numeric($c) ? "'" : '') . (string) $c) . '"', $r)), $rows)) . "\r\n";
}

/* ─────────────── ePub (liseuse) et OpenDocument (LibreOffice, Word) ─────────────── */
function family_book_epub(array $m, array $o): string
{
    if (!class_exists('ZipArchive')) { throw new RuntimeException('ePub impossible : l’extension PHP ZipArchive manque.'); }
    $x = static fn($v) => htmlspecialchars((string) $v, ENT_QUOTES | ENT_XML1 | ENT_SUBSTITUTE, 'UTF-8');
    $tmp = tempnam(sys_get_temp_dir(), 'book'); $zip = new ZipArchive(); $zip->open($tmp, ZipArchive::OVERWRITE);
    $zip->addFromString('mimetype', 'application/epub+zip'); $zip->setCompressionName('mimetype', ZipArchive::CM_STORE);
    $zip->addFromString('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    $css = 'body{font-family:serif;line-height:1.5}h1,h2{font-family:serif}h2{border-bottom:1px solid #999}.eyebrow{font-size:.75em;letter-spacing:.15em;text-transform:uppercase;color:#7a1f1f}.box{margin:1em 0}table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #ddd;padding:2px 4px;vertical-align:top}img{max-width:100%}';
    $zip->addFromString('OEBPS/style.css', $css);
    $chapters = []; $images = []; $n = 0;
    $page = static fn(string $title, string $body) => '<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="fr"><head><meta charset="utf-8"/><title>' . htmlspecialchars($title, ENT_XML1) . '</title><link rel="stylesheet" href="style.css"/></head><body>' . $body . '</body></html>';
    $addImg = static function (string $file) use (&$images, $zip): string {
        $path = family_book_media_file($file); if (!$path) { return ''; }
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION)); $mime = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'gif' => 'image/gif', 'webp' => 'image/webp'][$ext] ?? '';
        if ($mime === '') { return ''; }
        $name = 'img' . (count($images) + 1) . '.' . $ext; $zip->addFile($path, 'OEBPS/' . $name); $images[$name] = $mime; return $name;
    };
    // Les parties HTML du livre, chapitre par chapitre, réécrites en XHTML
    foreach ($o['sections'] as $s) {
        if ($s === 'people') {
            foreach ($m['persons'] as $p) {
                $body = '<p class="eyebrow">' . $x($p['number'] ?: 'Fiche') . '</p><h2>' . $x($p['name']) . '</h2><p><strong>' . $x($p['life']) . '</strong></p>';
                if (in_array('photos', $o['parts'], true) && $p['portrait'] !== '' && ($im = $addImg($p['portrait']))) { $body .= '<p><img src="' . $im . '" alt=""/></p>'; }
                foreach ($o['parts'] as $part) {
                    if ($part === 'bio' && $p['bio'] !== '') $body .= '<div class="box"><p>' . nl2br($x($p['bio']), true) . '</p></div>';
                    if ($part === 'family') $body .= '<table><tr><td>Parents</td><td>' . $x(implode(' · ', $p['parents']) ?: '—') . '</td></tr><tr><td>Conjoint(s)</td><td>' . $x(implode(' · ', $p['partners']) ?: '—') . '</td></tr><tr><td>Enfant(s)</td><td>' . $x(implode(' · ', $p['children']) ?: '—') . '</td></tr></table>';
                    if ($part === 'events' && $p['events']) $body .= '<h3>Repères</h3><table>' . implode('', array_map(static fn($ev) => '<tr><td>' . $x($ev['date']) . '</td><td>' . $x($ev['type']) . ($ev['place'] !== '' ? ' — ' . $x($ev['place']) : '') . '</td></tr>', $p['events'])) . '</table>';
                    if ($part === 'photos') foreach ($p['photos'] as $ph) { if ($im = $addImg($ph['full'] ?: $ph['file'])) $body .= '<p><img src="' . $im . '" alt=""/><br/><small>' . $x($ph['title']) . '</small></p>'; }
                    if ($part === 'notes') foreach ($p['notes'] as $nt) { $body .= '<div class="box">' . ($nt['title'] !== '' ? '<p><strong>' . $x($nt['title']) . '</strong></p>' : '') . '<p>' . nl2br($x($nt['body']), true) . '</p></div>'; }
                }
                $chapters[] = ['f' => 'c' . (++$n) . '.xhtml', 't' => $p['name'], 'b' => $body];
            }
            continue;
        }
        $html = family_book_html($m, ['sections' => [$s]] + $o, 'epub');
        if (!preg_match('~<body>(.*)</body>~s', $html, $mm) || trim(strip_tags($mm[1])) === '') { continue; }
        $body = preg_replace(['~<br>~', '~ id="[^"]*"~', '~<a href="#p\d+">(.*?)</a>~s'], ['<br/>', '', '$1'], $mm[1]);
        $body = preg_replace('~<img ([^>]*?)(?<!/)>~', '<img $1/>', $body);
        $chapters[] = ['f' => 'c' . (++$n) . '.xhtml', 't' => FAMILY_BOOK_SECTIONS[$s], 'b' => $body];
    }
    if (!$chapters) { $chapters[] = ['f' => 'c1.xhtml', 't' => $m['title'], 'b' => '<h1>' . $x($m['title']) . '</h1>']; }
    foreach ($chapters as $c) { $zip->addFromString('OEBPS/' . $c['f'], $page($c['t'], $c['b'])); }
    $zip->addFromString('OEBPS/nav.xhtml', $page('Sommaire', '<nav xmlns:epub="http://www.idpf.org/2007/ops" epub:type="toc"><h1>Sommaire</h1><ol>' . implode('', array_map(static fn($c) => '<li><a href="' . $c['f'] . '">' . $x($c['t']) . '</a></li>', $chapters)) . '</ol></nav>'));
    $uid = 'urn:uuid:' . sprintf('%04x%04x-%04x-4%03x-a%03x-%012x', random_int(0, 65535), random_int(0, 65535), random_int(0, 65535), random_int(0, 4095), random_int(0, 4095), random_int(0, 0xffffffffffff));
    $manifest = '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>'
        . implode('', array_map(static fn($c, $i) => '<item id="c' . $i . '" href="' . $c['f'] . '" media-type="application/xhtml+xml"/>', $chapters, array_keys($chapters)))
        . implode('', array_map(static fn($f, $mime) => '<item id="' . pathinfo($f, PATHINFO_FILENAME) . '" href="' . $f . '" media-type="' . $mime . '"/>', array_keys($images), $images));
    $spine = implode('', array_map(static fn($i) => '<itemref idref="c' . $i . '"/>', array_keys($chapters)));
    $zip->addFromString('OEBPS/content.opf', '<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="fr"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">' . $uid . '</dc:identifier><dc:title>' . $x($m['title']) . '</dc:title><dc:language>fr</dc:language><dc:creator>' . $x($m['author'] ?: 'LCNDA') . '</dc:creator><meta property="dcterms:modified">' . gmdate('Y-m-d\TH:i:s\Z') . '</meta></metadata><manifest>' . $manifest . '</manifest><spine>' . $spine . '</spine></package>');
    $zip->close();
    $data = (string) file_get_contents($tmp); @unlink($tmp);
    return $data;
}

/** Document OpenDocument texte (.odt) : s'ouvre dans LibreOffice, Word, Pages ; le texte est modifiable */
function family_book_odt(array $m, array $o): string
{
    if (!class_exists('ZipArchive')) { throw new RuntimeException('Document impossible : l’extension PHP ZipArchive manque.'); }
    $x = static fn($v) => htmlspecialchars((string) $v, ENT_QUOTES | ENT_XML1 | ENT_SUBSTITUTE, 'UTF-8');
    $P = static fn(string $t, string $style = 'Text_20_body') => '<text:p text:style-name="' . $style . '">' . str_replace("\n", '<text:line-break/>', $x($t)) . '</text:p>';
    $H = static fn(int $l, string $t) => '<text:h text:style-name="Heading_20_' . $l . '" text:outline-level="' . $l . '">' . $x($t) . '</text:h>';
    $body = '';
    foreach (explode("\n\n", family_book_markdown($m, $o, true)) as $block) {
        $lines = explode("\n", $block);
        if (count($lines) === 2 && preg_match('/^[=]+$/', $lines[1])) { $body .= $H(1, $lines[0]); continue; }
        if (count($lines) >= 2 && preg_match('/^-+$/', $lines[1])) { $body .= $H(2, $lines[0]) . (count($lines) > 2 ? $P(implode("\n", array_slice($lines, 2))) : ''); continue; }
        if (str_starts_with($lines[0], '» ')) { $body .= $H(3, mb_substr($lines[0], 2)) . (count($lines) > 1 ? $P(implode("\n", array_slice($lines, 1))) : ''); continue; }
        $body .= $P($block);
    }
    $tmp = tempnam(sys_get_temp_dir(), 'odt'); $zip = new ZipArchive(); $zip->open($tmp, ZipArchive::OVERWRITE);
    $zip->addFromString('mimetype', 'application/vnd.oasis.opendocument.text'); $zip->setCompressionName('mimetype', ZipArchive::CM_STORE);
    $zip->addFromString('META-INF/manifest.xml', '<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/></manifest:manifest>');
    $ns = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"';
    $font = ['serif' => 'Georgia', 'sans' => 'Arial', 'mono' => 'Courier New'][$o['font']];
    $zip->addFromString('styles.xml', '<?xml version="1.0" encoding="UTF-8"?><office:document-styles ' . $ns . ' office:version="1.2"><office:styles>'
        . '<style:style style:name="Standard" style:family="paragraph"><style:text-properties style:font-name="' . $font . '" fo:font-family="' . $font . '" fo:font-size="11pt"/></style:style>'
        . '<style:style style:name="Text_20_body" style:display-name="Text body" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-bottom="0.2cm"/></style:style>'
        . '<style:style style:name="Heading_20_1" style:display-name="Heading 1" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-top="0.6cm" fo:margin-bottom="0.3cm"/><style:text-properties fo:font-size="24pt" fo:font-weight="bold"/></style:style>'
        . '<style:style style:name="Heading_20_2" style:display-name="Heading 2" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-top="0.6cm" fo:margin-bottom="0.2cm"' . ($o['flow'] === 'page' ? ' fo:break-before="page"' : '') . '/><style:text-properties fo:font-size="17pt" fo:font-weight="bold" fo:color="' . ($o['accent'] ?: '#1d3557') . '"/></style:style>'
        . '<style:style style:name="Heading_20_3" style:display-name="Heading 3" style:family="paragraph" style:parent-style-name="Standard"><style:text-properties fo:font-size="13pt" fo:font-weight="bold"/></style:style>'
        . '</office:styles></office:document-styles>');
    $zip->addFromString('content.xml', '<?xml version="1.0" encoding="UTF-8"?><office:document-content ' . $ns . ' office:version="1.2"><office:body><office:text>' . $body . '</office:text></office:body></office:document-content>');
    $zip->close();
    $data = (string) file_get_contents($tmp); @unlink($tmp);
    return $data;
}

/** Envoie le livre dans le format demandé */
function family_book_send(PDO $pdo, array $q): never
{
    $o = family_book_options($q);
    $m = family_book_model($pdo, $o, $q);
    $inline = ($q['inline'] ?? '') === '1';
    $base = 'livre-de-famille-' . date('Ymd-His');
    $send = static function (string $mime, string $ext, string $data) use ($base): never {
        header('Content-Type: ' . $mime);
        header('Content-Disposition: attachment; filename="' . $base . '.' . $ext . '"');
        header('X-Content-Type-Options: nosniff');
        echo $data; exit;
    };
    switch ($o['format']) {
        case 'doc': $send('application/msword; charset=utf-8', 'doc', "\xEF\xBB\xBF" . family_book_html($m, $o, 'doc'));
        case 'odt': $send('application/vnd.oasis.opendocument.text', 'odt', family_book_odt($m, $o));
        case 'epub': $send('application/epub+zip', 'epub', family_book_epub($m, $o));
        case 'md': $send('text/markdown; charset=utf-8', 'md', family_book_markdown($m, $o));
        case 'txt': $send('text/plain; charset=utf-8', 'txt', family_book_markdown($m, $o, true));
        case 'csv': $send('text/csv; charset=utf-8', 'csv', family_book_csv($m));
    }
    header('Content-Type: text/html; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    if (!$inline) { header('Content-Disposition: attachment; filename="' . $base . '.html"'); }
    echo family_book_html($m, $o, $inline ? 'print' : 'html');
    exit;
}
