<?php
declare(strict_types=1);

/**
 * ⤓ Exports « réseau » (Réglages → Export → « ⤓ Vers d'autres logiciels et sites », interface : assets/js/heritage-echanges.js) :
 *  - 🗒 Obsidian : un dossier (ZIP) de notes Markdown — une note par personne (identité, événements, sources, notes) et une
 *    par lieu, reliées par des liens [[…]] (parents, enfants, conjoints, lieux) ; noms de fichiers sûrs et uniques ;
 *  - 🕸 Réseau familial : GraphML (Gephi, yEd) et DOT (Graphviz), nœuds personnes (et familles si on le veut), attributs
 *    (années, sexe, génération, Sosa).
 * Données : echanges_dataset() (mêmes règles de vie privée que les autres exports : vivants et fiches confidentielles
 * anonymes « Personne vivante » ou retirés). Étendue : toute la base, une branche (gedcom_branch_ids) ou les ancêtres Sosa.
 * Appelé par export_plus() (lib/echanges.php) : GET action=export_plus&format=obsidian|graphml|dot.
 */

const ECH_NET_MAX_NAME = 100; // caractères au plus dans un nom de note (sans « .md »)

/**
 * Étendue de l'export : « all » (tout), « branch » (branch_mode / branch_person, comme le GEDCOM) ou « sosa » (la personne
 * n°1 et ses ancêtres). Rend [racine Sosa, positions Sosa par personne].
 */
function ech_net_scope(PDO $pdo): array
{
    $scope = (string) ($_GET['scope'] ?? 'all');
    $root = max(0, (int) ($_GET['root_id'] ?? 0));
    if (!$root) {
        try { $root = (int) $pdo->query("SELECT value FROM app_settings WHERE key='genealogie-sosa-root'")->fetchColumn(); } catch (Throwable) { $root = 0; }
    }
    if ($root) { $s = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $s->execute([$root]); if (!$s->fetchColumn()) { $root = 0; } }
    if (!$root && function_exists('dashboard_sosa_root')) { $r = dashboard_sosa_root($pdo); $root = $r ? (int) $r['id'] : 0; }
    if ($scope === 'sosa') {
        if (!$root) { throw new RuntimeException('Aucune personne n°1 (Sosa) : choisis-la d’abord (Réglages → Apparence).'); }
        $_GET['branch_mode'] = 'ascendants'; $_GET['branch_person'] = (string) $root; unset($_GET['branch_generations']);
    } elseif ($scope === 'branch') {
        if (!in_array($_GET['branch_mode'] ?? '', ['ascendants', 'descendants'], true) || (int) ($_GET['branch_person'] ?? 0) <= 0) {
            throw new RuntimeException('Choisis la personne de la branche.');
        }
    } else {
        unset($_GET['branch_mode'], $_GET['branch_person']);
    }
    $sosa = [];
    if ($root && function_exists('sosa_positions')) {
        foreach ((sosa_positions($pdo, $root, 60000)['personSosas'] ?? []) as $pid => $list) { $sosa[(int) $pid] = array_map('intval', $list); }
    }
    return [$root, $sosa];
}

/** Génération de chaque personne par rapport à la personne n°1 (1 = elle, 2 = ses parents, 0 = ses enfants…), d'après les liens du fichier. */
function ech_net_generations(array $d, int $root): array
{
    if (!$root || !isset($d['persons'][$root])) { return []; }
    $parents = []; $kids = [];
    foreach ($d['families'] as $fid => $f) {
        foreach (array_keys($d['children'][$fid] ?? []) as $c) {
            foreach ([(int) $f['partner1_id'], (int) $f['partner2_id']] as $p) { if ($p) { $parents[$c][] = $p; $kids[$p][] = $c; } }
        }
    }
    $gen = [$root => 1]; $queue = [$root];
    while ($queue) {
        $id = array_shift($queue);
        foreach ($parents[$id] ?? [] as $p) { if (!isset($gen[$p])) { $gen[$p] = $gen[$id] + 1; $queue[] = $p; } }
        foreach ($kids[$id] ?? [] as $c) { if (!isset($gen[$c])) { $gen[$c] = $gen[$id] - 1; $queue[] = $c; } }
    }
    return $gen;
}

/** Texte d'une fiche pour un export : sans balises, sans caractères de contrôle. */
function ech_net_plain(string $v): string
{
    $v = html_entity_decode(strip_tags(preg_replace('#<\s*(br|/p|/div|/li)\b[^>]*>#i', "\n", $v) ?? $v), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $v = preg_replace('/[^\P{C}\n\t]/u', '', $v) ?? '';
    return trim(preg_replace("/\n{3,}/", "\n\n", str_replace("\r", '', $v)) ?? $v);
}

/** Années « 1790–1850 », « ° 1790 », « † 1850 » ou '' */
function ech_net_years(array $p): string
{
    $b = (int) ($p['birth_year'] ?? 0) ?: (int) ($p['bapt_year'] ?? 0); $dd = (int) ($p['death_year'] ?? 0) ?: (int) ($p['buri_year'] ?? 0);
    if ($b && $dd) { return $b . '–' . $dd; }
    return $b ? '° ' . $b : ($dd ? '† ' . $dd : '');
}

/** Nom de note Obsidian sûr : sans * " \ / < > : | ? # ^ [ ], ni point au début, ni espace en trop, 100 caractères au plus. */
function ech_net_safe_name(string $v): string
{
    $v = preg_replace('/[\x00-\x1f\x7f*"\\\\\/<>:|?#^\[\]{}%]+/u', ' ', $v) ?? '';
    $v = trim(preg_replace('/\s+/u', ' ', $v) ?? '', " .\t-");
    if (mb_strlen($v) > ECH_NET_MAX_NAME) { $v = rtrim(mb_substr($v, 0, ECH_NET_MAX_NAME), ' .'); }
    if (preg_match('/^(con|prn|aux|nul|com\d|lpt\d)$/i', $v)) { $v .= ' (fiche)'; } // noms réservés de Windows
    return $v !== '' ? $v : 'Sans nom';
}

/** Rend un nom unique (sans tenir compte des majuscules ni des accents : Windows et macOS les confondent). */
function ech_net_unique(string $name, array &$taken): string
{
    $base = $name; $k = 2;
    while (isset($taken[gedcom_fold($name)])) { $name = $base . ' (' . $k++ . ')'; }
    $taken[gedcom_fold($name)] = true;
    return $name;
}

/** Texte libre dans une note : pas de faux lien [[…]] ni de balise HTML qui s'exécuterait dans l'aperçu. */
function ech_net_md(string $v): string
{
    $v = ech_net_plain($v);
    return str_replace(['[[', ']]', '<', '>'], ['[ [', '] ]', '‹', '›'], $v);
}

/** Valeur YAML entre guillemets */
function ech_net_yaml(string $v): string
{
    return '"' . str_replace(['\\', '"', "\n", "\t"], ['\\\\', '\\"', '\\n', ' '], ech_net_plain($v)) . '"';
}

// ─── 🗒 Obsidian ─────────────────────────────────────────────────────────────────────────────

function export_obsidian(PDO $pdo): never
{
    if (!class_exists('ZipArchive')) { throw new RuntimeException('Export impossible : l’extension PHP ZipArchive manque sur cet ordinateur.'); }
    [$root, $sosa] = ech_net_scope($pdo);
    $d = echanges_dataset($pdo, true);
    if (!$d['persons']) { throw new RuntimeException('Aucune personne à exporter.'); }
    $withSources = ($_GET['sources'] ?? '1') !== '0';
    $withNotes = ($_GET['notes'] ?? '1') !== '0';
    $gen = ech_net_generations($d, $root);
    $taken = ['généalogie' => true, 'genealogie' => true];
    // 1. les noms des notes (personnes, puis lieux), uniques dans tout le coffre
    $pname = []; $anonNo = 0;
    foreach ($d['persons'] as $id => $p) {
        if (isset($d['hidden'][$id])) { $pname[$id] = ech_net_unique('Personne vivante ' . (++$anonNo), $taken); continue; }
        $y = ech_net_years($p);
        $pname[$id] = ech_net_unique(ech_net_safe_name(echanges_person_name($p) . ($y !== '' ? ' (' . str_replace('–', '-', $y) . ')' : '')), $taken);
    }
    $plname = [];
    foreach ($d['places'] as $id => $pl) {
        $label = trim((string) $pl['name']) ?: 'Lieu';
        $sub = trim((string) ($pl['subdivision'] ?? '')); // lieu-dit : « Le Moulin, Tulle (Corrèze) »
        if ($sub !== '' && gedcom_fold($sub) !== gedcom_fold($label)) { $label = $sub . ', ' . $label; }
        $extra = trim((string) ($pl['county'] ?? '')) ?: trim((string) ($pl['country'] ?? ''));
        $plname[$id] = ech_net_unique(ech_net_safe_name($label . ($extra !== '' && gedcom_fold($extra) !== gedcom_fold((string) $pl['name']) ? ' (' . $extra . ')' : '')), $taken);
    }
    $link = static fn(string $n, string $alias = ''): string => '[[' . $n . ($alias !== '' && $alias !== $n ? '|' . str_replace(['|', '[', ']'], ' ', $alias) : '') . ']]';
    $plink = static fn(int $id) => isset($pname[$id]) ? $link($pname[$id]) : '';
    // liens familiaux
    $parents = []; $kids = []; $spouses = [];
    foreach ($d['families'] as $fid => $f) {
        $p1 = (int) $f['partner1_id']; $p2 = (int) $f['partner2_id'];
        if ($p1 && $p2) { $spouses[$p1][$fid] = $p2; $spouses[$p2][$fid] = $p1; }
        foreach ($d['children'][$fid] ?? [] as $c => $row) {
            foreach ([[$p1, 'relation_to_partner1'], [$p2, 'relation_to_partner2']] as [$par, $col]) {
                if (!$par) { continue; }
                $rel = (string) ($row[$col] ?? '');
                $parents[$c][$par] = $rel; $kids[$par][$c] = $rel;
            }
        }
    }
    $relWord = static fn(string $r): string => match ($r) { 'adopted' => ' (adoption)', 'foster' => ' (accueil)', 'step' => ' (beau-parent)', default => '' };
    $eventLine = static function (array $e) use ($d, $plname, $link): string {
        $kind = trim((string) $e['type_label']) ?: 'Événement';
        $date = trim((string) $e['date_text']) ?: ((int) ($e['year'] ?? 0) ? (string) (int) $e['year'] : '');
        $pl = (int) ($e['place_id'] ?? 0);
        $where = $pl && isset($plname[$pl]) ? ' à ' . $link($plname[$pl], (string) $d['places'][$pl]['name']) : '';
        $what = trim(ech_net_md((string) ($e['title'] ?? '')));
        $desc = trim(ech_net_md((string) ($e['description'] ?? '')));
        return '- **' . ech_net_md($kind) . '**' . ($date !== '' ? ' : ' . ech_net_md($date) : '') . $where . ($what !== '' ? ' — ' . $what : '') . ($desc !== '' ? "\n  " . str_replace("\n", "\n  ", $desc) : '');
    };
    $cites = static function (string $key) use ($d, $withSources): array {
        if (!$withSources) { return []; }
        $out = [];
        foreach ($d['citations'][$key] ?? [] as $c) {
            $s = $d['sources'][(int) $c['source_record_id']] ?? null; if (!$s) { continue; }
            $t = trim(implode(', ', array_filter([trim((string) ($s['author'] ?? '')), trim((string) ($s['title'] ?? '')) ?: 'Source sans titre', trim((string) ($c['page'] ?? ''))])));
            $url = trim((string) ($s['url'] ?? ''));
            $out[$t] = '- ' . ech_net_md($t) . (preg_match('#^https?://[^\s<>()]+$#i', $url) ? ' — <' . $url . '>' : '');
        }
        return array_values($out);
    };
    $notes = static function (string $key) use ($d, $withNotes): array {
        if (!$withNotes) { return []; }
        $out = [];
        foreach ($d['notes'][$key] ?? [] as $n) {
            $t = ech_net_md((string) $n['title']); $b = ech_net_md((string) $n['body']);
            if ($t === '' && $b === '') { continue; }
            $out[] = ($t !== '' ? '### ' . $t . "\n\n" : '') . $b;
        }
        return $out;
    };
    $files = [];
    $placeUsers = [];
    foreach ($d['persons'] as $id => $p) {
        $hidden = isset($d['hidden'][$id]);
        $md = ['---'];
        if ($hidden) {
            $md[] = 'tags: [genealogie, vivant]';
            $md[] = 'lcnda_id: ' . $id;
            $md[] = '---'; $md[] = '';
            $md[] = '# ' . $pname[$id]; $md[] = '';
            $md[] = '> Fiche cachée pour la vie privée (personne vivante ou fiche confidentielle) : seuls ses liens familiaux sont gardés.'; $md[] = '';
        } else {
            $sex = match ($p['gender'] ?? '') { 'male' => 'homme', 'female' => 'femme', default => 'inconnu' };
            $md[] = 'tags: [genealogie, personne]';
            $md[] = 'aliases: [' . ech_net_yaml(echanges_person_name($p)) . ']';
            $md[] = 'sexe: ' . $sex;
            foreach (['naissance' => 'birth', 'deces' => 'death'] as $k => $col) {
                $txt = trim((string) ($p[$col . '_date'] ?? ''));
                if ($txt !== '') { $md[] = $k . ': ' . ech_net_yaml($txt); }
            }
            if (isset($sosa[$id])) { $md[] = 'sosa: [' . implode(', ', $sosa[$id]) . ']'; }
            if (isset($gen[$id])) { $md[] = 'generation: ' . $gen[$id]; }
            $md[] = 'lcnda_id: ' . $id;
            $md[] = '---'; $md[] = '';
            $md[] = '# ' . ech_net_md(echanges_person_name($p)); $md[] = '';
            $ident = [];
            $y = ech_net_years($p); if ($y !== '') { $ident[] = '- Années : ' . $y; }
            $ident[] = '- Sexe : ' . $sex;
            if (isset($sosa[$id])) { $ident[] = '- Sosa : ' . implode(', ', $sosa[$id]); }
            foreach ($d['variants'][$id] ?? [] as $v) {
                $vn = trim(trim((string) ($v['first_name'] ?? '')) . ' ' . trim((string) ($v['last_name'] ?? '')));
                if ($vn !== '') { $ident[] = '- Autre nom : ' . ech_net_md($vn); }
            }
            $occ = trim((string) ($p['occupation'] ?? '')); if ($occ !== '') { $ident[] = '- Métier : ' . ech_net_md($occ); }
            $md[] = '## Identité'; $md[] = ''; array_push($md, ...$ident); $md[] = '';
        }
        // famille (aussi pour une fiche cachée : les liens restent)
        $fam = [];
        $par = $parents[$id] ?? [];
        if ($par) { $fam[] = '- Parents : ' . implode(', ', array_map(static fn($pp, $r) => $plink((int) $pp) . $relWord((string) $r), array_keys($par), $par)); }
        foreach ($spouses[$id] ?? [] as $fid => $sp) {
            $line = '- Conjoint : ' . $plink((int) $sp);
            if (!$d['families'][$fid]['hidden']) { foreach ($d['byFamily'][$fid] ?? [] as $eid) { $e = $d['events'][$eid]; if (in_array($e['gedcom_tag'], ['MARR', 'MRCI', 'MRRE'], true)) { $dt = trim((string) $e['date_text']); if ($dt !== '') { $line .= ' (mariage : ' . ech_net_md($dt) . ')'; } break; } } }
            $fam[] = $line;
        }
        $k = $kids[$id] ?? [];
        if ($k) { $fam[] = '- Enfants : ' . implode(', ', array_map(static fn($c, $r) => $plink((int) $c) . $relWord((string) $r), array_keys($k), $k)); }
        if ($fam) { $md[] = '## Famille'; $md[] = ''; array_push($md, ...$fam); $md[] = ''; }
        if (!$hidden) {
            $evs = [];
            foreach ($d['byPerson'][$id] ?? [] as $eid) { $evs[] = $eid; }
            foreach (array_keys($spouses[$id] ?? []) as $fid) { if (!$d['families'][$fid]['hidden']) { foreach ($d['byFamily'][$fid] ?? [] as $eid) { $evs[] = $eid; } } }
            $evs = array_values(array_unique($evs));
            if ($evs) {
                $md[] = '## Événements'; $md[] = '';
                foreach ($evs as $eid) {
                    $e = $d['events'][$eid]; $md[] = $eventLine($e);
                    $pl = (int) ($e['place_id'] ?? 0); if ($pl && isset($plname[$pl])) { $placeUsers[$pl][$id] = true; }
                }
                $md[] = '';
            }
            $src = $cites('person:' . $id);
            foreach ($evs as $eid) { array_push($src, ...$cites('event:' . $eid)); }
            $src = array_values(array_unique($src));
            if ($src) { $md[] = '## Sources'; $md[] = ''; array_push($md, ...$src); $md[] = ''; }
            $nt = $notes('person:' . $id);
            if ($nt) { $md[] = '## Notes'; $md[] = ''; $md[] = implode("\n\n", $nt); $md[] = ''; }
        }
        $files['Personnes/' . $pname[$id] . '.md'] = implode("\n", $md);
    }
    foreach ($d['places'] as $id => $pl) {
        $md = ['---', 'tags: [genealogie, lieu]'];
        $lat = $pl['latitude'] ?? null; $lon = $pl['longitude'] ?? null;
        $hasCoord = $lat !== null && $lon !== null && $lat !== '' && $lon !== '' && abs((float) $lat) <= 90 && abs((float) $lon) <= 180;
        if ($hasCoord) { $md[] = 'location: [' . round((float) $lat, 6) . ', ' . round((float) $lon, 6) . ']'; }
        $md[] = 'lcnda_lieu: ' . $id; $md[] = '---'; $md[] = '';
        $md[] = '# ' . ech_net_md((string) $pl['name']); $md[] = '';
        $md[] = ech_net_md(echanges_place_title($pl)); $md[] = '';
        if ($hasCoord) { $md[] = '- Coordonnées : ' . round((float) $lat, 6) . ', ' . round((float) $lon, 6); $md[] = ''; }
        $who = array_keys($placeUsers[$id] ?? []);
        if ($who) { $md[] = '## Personnes'; $md[] = ''; foreach ($who as $pid) { $md[] = '- ' . $plink((int) $pid); } $md[] = ''; }
        $files['Lieux/' . $plname[$id] . '.md'] = implode("\n", $md);
    }
    // la note d'accueil
    $idx = ['---', 'tags: [genealogie]', '---', '', '# Généalogie', '', 'Exporté depuis LCNDA (Le Carnet numérique des ancêtres) le ' . date('d/m/Y') . '.', ''];
    if ($root && isset($pname[$root])) { $idx[] = 'Personne n°1 : ' . $plink($root); $idx[] = ''; }
    $idx[] = '## Personnes (' . count($pname) . ')'; $idx[] = '';
    $sorted = $pname; asort($sorted, SORT_NATURAL | SORT_FLAG_CASE);
    foreach (array_keys($sorted) as $pid) { $idx[] = '- ' . $plink((int) $pid); }
    if ($plname) { $idx[] = ''; $idx[] = '## Lieux (' . count($plname) . ')'; $idx[] = ''; $s2 = $plname; asort($s2, SORT_NATURAL | SORT_FLAG_CASE); foreach ($s2 as $n) { $idx[] = '- ' . $link($n); } }
    $files['Généalogie.md'] = implode("\n", $idx) . "\n";
    $tmp = tempnam(sys_get_temp_dir(), 'obsidian');
    if ($tmp === false) { throw new RuntimeException('Fichier temporaire impossible.'); }
    $zip = new ZipArchive();
    if ($zip->open($tmp, ZipArchive::OVERWRITE) !== true) { @unlink($tmp); throw new RuntimeException('Création du fichier ZIP impossible.'); }
    $folder = 'Genealogie-LCNDA/';
    foreach ($files as $name => $body) { $zip->addFromString($folder . $name, rtrim($body) . "\n"); }
    $zip->close();
    $body = (string) file_get_contents($tmp); @unlink($tmp);
    echanges_send('obsidian-genealogie-' . date('Ymd') . '.zip', 'application/zip', $body, ['X-LCNDA-Count' => (string) count($pname), 'X-LCNDA-Skipped' => (string) count($plname)]);
}

// ─── 🕸 Réseau familial : GraphML et DOT ───────────────────────────────────────────────────

/** Nœuds et liens du réseau : [nodes => [id => attrs], edges => [[from, to, kind]]] */
function ech_net_graph(PDO $pdo): array
{
    [$root, $sosa] = ech_net_scope($pdo);
    $d = echanges_dataset($pdo, true);
    if (!$d['persons']) { throw new RuntimeException('Aucune personne à exporter.'); }
    $withFamilies = ($_GET['families'] ?? '0') === '1';
    $gen = ech_net_generations($d, $root);
    $nodes = []; $edges = []; $anon = 0;
    foreach ($d['persons'] as $id => $p) {
        $hidden = isset($d['hidden'][$id]);
        $nodes['I' . $id] = ['kind' => 'person', 'label' => $hidden ? 'Personne vivante ' . (++$anon) : echanges_person_name($p),
            'sex' => $hidden ? 'U' : match ($p['gender'] ?? '') { 'male' => 'M', 'female' => 'F', default => 'U' },
            'birth' => $hidden ? null : (((int) ($p['birth_year'] ?? 0)) ?: (((int) ($p['bapt_year'] ?? 0)) ?: null)),
            'death' => $hidden ? null : (((int) ($p['death_year'] ?? 0)) ?: (((int) ($p['buri_year'] ?? 0)) ?: null)),
            'generation' => $gen[$id] ?? null, 'sosa' => isset($sosa[$id]) ? min($sosa[$id]) : null, 'sosa_all' => isset($sosa[$id]) ? implode(' ', $sosa[$id]) : '',
            'living' => $hidden];
    }
    foreach ($d['families'] as $fid => $f) {
        $p1 = (int) $f['partner1_id']; $p2 = (int) $f['partner2_id']; $kids = array_keys($d['children'][$fid] ?? []);
        if ($withFamilies) {
            $year = null;
            if (!$f['hidden']) { foreach ($d['byFamily'][$fid] ?? [] as $eid) { $e = $d['events'][$eid]; if (in_array($e['gedcom_tag'], ['MARR', 'MRCI', 'MRRE'], true) && (int) $e['year']) { $year = (int) $e['year']; break; } } }
            $names = array_map(static fn($x) => $nodes['I' . $x]['label'], array_filter([$p1, $p2]));
            $nodes['F' . $fid] = ['kind' => 'family', 'label' => $names ? implode(' × ', $names) : 'Famille', 'sex' => '', 'birth' => $year, 'death' => null, 'generation' => null, 'sosa' => null, 'sosa_all' => '', 'living' => (bool) $f['hidden']];
            foreach (array_filter([$p1, $p2]) as $x) { $edges[] = ['I' . $x, 'F' . $fid, 'partner']; }
            foreach ($kids as $c) { $edges[] = ['F' . $fid, 'I' . $c, 'child']; }
        } else {
            if ($p1 && $p2) { $edges[] = ['I' . $p1, 'I' . $p2, 'spouse']; }
            foreach ($kids as $c) { foreach (array_filter([$p1, $p2]) as $x) { $edges[] = ['I' . $x, 'I' . $c, 'parent']; } }
        }
    }
    return ['nodes' => $nodes, 'edges' => $edges, 'families' => $withFamilies];
}

function export_graphml(PDO $pdo): never
{
    $g = ech_net_graph($pdo);
    $keys = [['label', 'node', 'string'], ['kind', 'node', 'string'], ['sex', 'node', 'string'], ['birth_year', 'node', 'int'], ['death_year', 'node', 'int'],
        ['generation', 'node', 'int'], ['sosa', 'node', 'long'], ['sosa_all', 'node', 'string'], ['living', 'node', 'boolean'], ['relation', 'edge', 'string']];
    $x = ['<?xml version="1.0" encoding="UTF-8"?>',
        '<graphml xmlns="http://graphml.graphdrawing.org/xmlns" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">',
        '<!-- Exporté depuis LCNDA le ' . date('d/m/Y') . ' : ' . count($g['nodes']) . ' nœuds. -->'];
    foreach ($keys as [$name, $for, $type]) { $x[] = '<key id="' . $name . '" for="' . $for . '" attr.name="' . $name . '" attr.type="' . $type . '"/>'; }
    $x[] = '<graph id="famille" edgedefault="directed">';
    foreach ($g['nodes'] as $id => $n) {
        $data = '<data key="label">' . echanges_xml($n['label']) . '</data><data key="kind">' . $n['kind'] . '</data>';
        if ($n['sex'] !== '') { $data .= '<data key="sex">' . $n['sex'] . '</data>'; }
        if ($n['birth'] !== null) { $data .= '<data key="birth_year">' . (int) $n['birth'] . '</data>'; }
        if ($n['death'] !== null) { $data .= '<data key="death_year">' . (int) $n['death'] . '</data>'; }
        if ($n['generation'] !== null) { $data .= '<data key="generation">' . (int) $n['generation'] . '</data>'; }
        if ($n['sosa'] !== null) { $data .= '<data key="sosa">' . (int) $n['sosa'] . '</data><data key="sosa_all">' . echanges_xml($n['sosa_all']) . '</data>'; }
        $data .= '<data key="living">' . ($n['living'] ? 'true' : 'false') . '</data>';
        $x[] = '<node id="' . $id . '">' . $data . '</node>';
    }
    $i = 0;
    foreach ($g['edges'] as [$a, $b, $kind]) {
        $x[] = '<edge id="e' . (++$i) . '" source="' . $a . '" target="' . $b . '"' . ($kind === 'spouse' ? ' directed="false"' : '') . '><data key="relation">' . $kind . '</data></edge>';
    }
    $x[] = '</graph>'; $x[] = '</graphml>';
    echanges_send('reseau-familial-' . date('Ymd') . '.graphml', 'application/graphml+xml; charset=utf-8', implode("\n", $x) . "\n",
        ['X-LCNDA-Count' => (string) count(array_filter($g['nodes'], static fn($n) => $n['kind'] === 'person')), 'X-LCNDA-Skipped' => (string) count($g['edges'])]);
}

/** Texte entre guillemets pour Graphviz : « \ » et « " » échappés, retours à la ligne en \n, sans caractère de contrôle. */
function ech_net_dot(string $v): string
{
    $v = preg_replace('/[^\P{C}\n]/u', '', $v) ?? '';
    return '"' . str_replace(['\\', '"', "\n"], ['\\\\', '\\"', '\\n'], $v) . '"';
}

function export_dot(PDO $pdo): never
{
    $g = ech_net_graph($pdo);
    $o = ['// Réseau familial exporté depuis LCNDA le ' . date('d/m/Y') . ' : dessine-le avec Graphviz (dot -Tsvg reseau.dot -o reseau.svg)',
        'digraph famille {', '  graph [rankdir=TB, charset="UTF-8", fontname="Helvetica", label=' . ech_net_dot('Réseau familial') . ', labelloc=t];',
        '  node [shape=box, style="rounded,filled", fontname="Helvetica", fontsize=10, fillcolor="#f2f2f2"];', '  edge [color="#666666", arrowsize=0.6];'];
    $fill = ['M' => '#dbe8f7', 'F' => '#f9dfe8', 'U' => '#eeeeee'];
    foreach ($g['nodes'] as $id => $n) {
        if ($n['kind'] === 'family') {
            $o[] = '  ' . $id . ' [shape=point, width=0.12, label="", xlabel=' . ech_net_dot($n['birth'] ? '× ' . $n['birth'] : '') . ', tooltip=' . ech_net_dot($n['label']) . '];';
            continue;
        }
        $years = $n['birth'] || $n['death'] ? "\n" . ($n['birth'] ?: '?') . '–' . ($n['death'] ?: '') : '';
        $attrs = 'label=' . ech_net_dot($n['label'] . $years) . ', fillcolor="' . ($fill[$n['sex']] ?? '#eeeeee') . '", sex="' . $n['sex'] . '"';
        if ($n['birth']) { $attrs .= ', birth_year=' . (int) $n['birth']; }
        if ($n['death']) { $attrs .= ', death_year=' . (int) $n['death']; }
        if ($n['generation'] !== null) { $attrs .= ', generation=' . (int) $n['generation']; }
        if ($n['sosa'] !== null) { $attrs .= ', sosa=' . (int) $n['sosa'] . ', penwidth=2'; }
        $o[] = '  ' . $id . ' [' . $attrs . '];';
    }
    foreach ($g['edges'] as [$a, $b, $kind]) {
        $o[] = '  ' . $a . ' -> ' . $b . ($kind === 'spouse' ? ' [dir=none, style=dashed, constraint=false, relation=spouse]' : ' [relation=' . $kind . ']') . ';';
    }
    $o[] = '}';
    echanges_send('reseau-familial-' . date('Ymd') . '.dot', 'text/vnd.graphviz; charset=utf-8', implode("\n", $o) . "\n",
        ['X-LCNDA-Count' => (string) count(array_filter($g['nodes'], static fn($n) => $n['kind'] === 'person')), 'X-LCNDA-Skipped' => (string) count($g['edges'])]);
}
