<?php
declare(strict_types=1);

/**
 * 🗂 Archives en ligne (suite) : Archives nationales (décrets de naturalisation, Minutier central), ANOM (état civil des
 * colonies, bagnards), Service historique de la Défense (inscrits maritimes, officiers), mémoire de la déportation et des
 * fusillés, Journal officiel, annuaires anciens, patrimoine (Mérimée, Palissy), archives étrangères (Belgique, Suisse, Ellis Island).
 *
 * Le même modèle que la première vague (lib/sources_ouvertes.php, dont il reprend la table so_imports, le rangement du
 * fichier so_store_file et la mention « à vérifier ») : le serveur NE SE CONNECTE À AUCUN de ces sites. La page ouvre la
 * recherche dans le navigateur de la personne (adresses : assets/js/app-sources-ouvertes-2-core.js) ; la personne importe
 * ensuite ce qu'elle a téléchargé, ou colle un lien et recopie les cases.
 *
 * POST so2_preview : « c'est la même personne ? » — la fiche, ses événements, les écarts ; rien n'est écrit.
 * POST so2_import (multipart : « file » facultatif + « data » JSON) :
 *  - le fichier → un média relié à la fiche (ou au lieu, à la maison, à l'objet de famille), avec la mention « à vérifier » ;
 *  - une source avec le lien, reliée à la fiche et à chaque événement ajouté ;
 *  - les ajouts cochés seulement (événements d'un type permis pour cette sorte, inventaire après décès, départ, notes du bloc
 *    militaire, texte d'une notice du patrimoine) — rien n'est remplacé : on ajoute, ou on remplit une case vide ;
 *  - « Pas sûr que ce soit la même personne » : le document et la source sont gardés, rien n'est ajouté à la fiche.
 * POST so2_undo : retire tout ce que l'import a ajouté, remet les anciennes valeurs (si elles n'ont pas changé entre-temps).
 * so2_respect_ids() : les fiches qui portent une déportation, un décès en déportation ou « Fusillé » — jamais dans un jeu.
 */

const SO2_MENTION = 'Lu sur un site d’archives en ligne et recopié : à vérifier sur le document';
/** les types d'événements que cet outil peut ajouter : clé => [slug, gedcom, libellé, portée, icône, couleur] */
const SO2_TYPES = [
    'naturalisation' => ['naturalisation', 'NATU', 'Naturalisation', 'person', 'diamond', '#0066cc'],
    'contrat-de-mariage' => ['contrat-de-mariage', 'MARC', 'Contrat de mariage', 'family', 'diamond', '#0066cc'],
    'testament' => ['testament', 'WILL', 'Testament', 'person', 'diamond', '#0066cc'],
    'acte' => ['acte', 'DEED', 'Acte', 'person', 'circle', '#0066cc'],
    'naissance' => ['naissance', 'BIRT', 'Naissance', 'person', 'star', '#00c896'],
    'deces' => ['deces', 'DEAT', 'Décès', 'person', 'cross', '#111111'],
    'mariage' => ['mariage', 'MARR', 'Mariage', 'family', 'rings', '#7a47db'],
    'condamnation' => ['condamnation', '', 'Condamnation', 'person', 'diamond', '#6b7280'],
    'bagne' => ['bagne', '', 'Arrivée au bagne', 'person', 'chains', '#6b7280'],
    'liberation-du-bagne' => ['liberation-du-bagne', '', 'Libération ou décès au bagne', 'person', 'diamond', '#6b7280'],
    'service-militaire' => ['service-militaire', 'MISE', 'Service militaire', 'person', 'diamond', '#0066cc'],
    'deportation' => ['deportation', '', 'Déportation', 'person', 'diamond', '#3f3f46'],
    'deces-en-deportation' => ['deces-en-deportation', '', 'Décès en déportation', 'person', 'cross', '#111111'],
    'fusille' => ['fusille', '', 'Fusillé', 'person', 'cross', '#111111'],
    'decoration' => ['decoration', '', 'Décoration', 'person', 'diamond', '#b45309'],
    'changement-de-nom' => ['changement-de-nom', '', 'Changement de nom', 'person', 'diamond', '#0066cc'],
    'lieu-de-residence' => ['residence', 'RESI', 'Lieu de résidence', 'person', 'home', '#2f80ed'],
    'profession' => ['occupation', 'OCCU', 'Profession', 'person', 'briefcase', '#1f8a70'],
    'immigration' => ['immigration', 'IMMI', 'Immigration', 'person', 'diamond', '#0066cc'],
];
/** pour chaque sorte : les types d'événements permis et les autres ajouts possibles */
const SO2_KINDS = [
    'naturalisation' => ['label' => 'Décret de naturalisation', 'agency' => 'Archives nationales', 'events' => ['naturalisation'], 'extra' => ['voyage']],
    'minutier' => ['label' => 'Acte notarié (Minutier central)', 'agency' => 'Archives nationales — Minutier central des notaires de Paris', 'events' => ['contrat-de-mariage', 'testament', 'acte'], 'extra' => ['probate']],
    'anom_ec' => ['label' => 'Acte d’état civil des colonies', 'agency' => 'Archives nationales d’outre-mer (ANOM)', 'events' => ['naissance', 'deces', 'mariage', 'acte'], 'extra' => []],
    'bagne' => ['label' => 'Dossier de bagnard', 'agency' => 'Archives nationales d’outre-mer (ANOM)', 'events' => ['condamnation', 'bagne', 'liberation-du-bagne'], 'extra' => []],
    'shd_marin' => ['label' => 'Inscrit maritime', 'agency' => 'Service historique de la Défense', 'events' => ['service-militaire'], 'extra' => ['military']],
    'shd_officier' => ['label' => 'Dossier d’officier', 'agency' => 'Service historique de la Défense', 'events' => ['service-militaire'], 'extra' => ['military']],
    'deportation' => ['label' => 'Notice de déportation', 'agency' => 'Mémorial de la Shoah / Fondation pour la mémoire de la déportation', 'events' => ['deportation', 'deces-en-deportation', 'deces'], 'extra' => [], 'respect' => true],
    'fusille' => ['label' => 'Notice du Maitron des fusillés', 'agency' => 'Maitron des fusillés et exécutés 1940-1944', 'events' => ['fusille', 'deces'], 'extra' => [], 'respect' => true],
    'jo' => ['label' => 'Journal officiel', 'agency' => 'Journal officiel de la République française (Gallica, BnF)', 'events' => ['naturalisation', 'decoration', 'changement-de-nom'], 'extra' => []],
    'annuaire' => ['label' => 'Annuaire ancien', 'agency' => 'Annuaires anciens (Gallica, BnF)', 'events' => ['lieu-de-residence', 'profession'], 'extra' => []],
    'patrimoine' => ['label' => 'Notice du patrimoine', 'agency' => 'Ministère de la Culture — POP (Mérimée, Palissy)', 'events' => [], 'extra' => ['target'], 'noPerson' => true],
    'etranger_acte' => ['label' => 'Acte trouvé à l’étranger', 'agency' => 'Archives étrangères', 'events' => ['naissance', 'deces', 'mariage', 'acte'], 'extra' => []],
    'ellis' => ['label' => 'Arrivée à Ellis Island', 'agency' => 'Statue of Liberty – Ellis Island Foundation', 'events' => ['immigration'], 'extra' => ['voyage']],
];
const SO2_RESPECT_SLUGS = ['deportation', 'deces-en-deportation', 'fusille'];
const SO2_RESPECT_LABELS = ['Déportation', 'Décès en déportation', 'Fusillé', 'Fusillée'];

function so2_need_so(): void
{
    if (!function_exists('so_schema')) { require_once __DIR__ . '/sources_ouvertes.php'; }
}
function so2_t(mixed $v, int $max = 500): string { return mb_substr(trim(is_scalar($v) ? safe_text((string) $v) : ''), 0, $max); }
function so2_url(mixed $v): string { $s = trim(is_scalar($v) ? (string) $v : ''); return preg_match('#^https?://[^\s<>"\'`]+$#i', $s) && strlen($s) <= 2000 ? $s : ''; }
function so2_year(string $s): int { return preg_match('/\b(1[0-9]\d\d|20\d\d)\b/', $s, $m) ? (int) $m[1] : 0; }
function so2_fold(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = strtr($s, ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'œ' => 'oe', 'æ' => 'ae', '’' => "'", '-' => ' ']);
    return (string) preg_replace('/\s+/', ' ', $s);
}

/** les types d'événements de cet outil (migration 76 et, au besoin, au premier import) */
function so2_seed_types(PDO $pdo): void
{
    $check = $pdo->prepare('SELECT id FROM event_types WHERE scope=? AND (slug=? OR label=? COLLATE NOCASE) LIMIT 1');
    $ins = $pdo->prepare("INSERT INTO event_types(scope,slug,label,gedcom_tag,icon,color,is_custom,is_active,is_artistic,custom_fields) VALUES(?,?,?,?,?,?,0,1,0,'')");
    foreach (['condamnation', 'bagne', 'liberation-du-bagne', 'deportation', 'deces-en-deportation', 'fusille', 'decoration', 'changement-de-nom'] as $k) {
        [$slug, $tag, $label, $scope, $icon, $color] = SO2_TYPES[$k];
        $check->execute([$scope, $slug, $label]);
        if (!$check->fetchColumn()) { $ins->execute([$scope, $slug, $label, $tag, $icon, $color]); }
    }
}

/** l'identifiant du type (cherché par nom court, sinon code GEDCOM, sinon libellé ; créé s'il manque) */
function so2_type_id(PDO $pdo, string $key): int
{
    [$slug, $tag, $label, $scope, $icon, $color] = SO2_TYPES[$key];
    $q = $pdo->prepare("SELECT id FROM event_types WHERE scope=? AND (slug=? OR (?<>'' AND gedcom_tag=?) OR label=? COLLATE NOCASE)
        ORDER BY (slug=?) DESC, (label=? COLLATE NOCASE) DESC, COALESCE(is_active,1) DESC, id LIMIT 1");
    $q->execute([$scope, $slug, $tag, $tag, $label, $slug, $label]);
    $id = (int) $q->fetchColumn();
    if ($id) { return $id; }
    $pdo->prepare("INSERT INTO event_types(scope,slug,label,gedcom_tag,icon,color,is_custom,is_active,is_artistic,custom_fields) VALUES(?,?,?,?,?,?,0,1,0,'')")->execute([$scope, $slug, $label, $tag, $icon, $color]);
    return (int) $pdo->lastInsertId();
}

/** les fiches qui demandent du respect (déportation, décès en déportation, fusillé) : [id => true] */
function so2_respect_ids(PDO $pdo): array
{
    $out = [];
    try {
        $in = implode(',', array_fill(0, count(SO2_RESPECT_SLUGS), '?')); $inL = implode(',', array_fill(0, count(SO2_RESPECT_LABELS), '?'));
        $s = $pdo->prepare("SELECT DISTINCT e.person_id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IS NOT NULL AND (t.slug IN ($in) OR t.label IN ($inL))");
        $s->execute([...SO2_RESPECT_SLUGS, ...SO2_RESPECT_LABELS]);
        foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $id) { $out[(int) $id] = true; }
    } catch (Throwable $_) {}
    if (function_exists('so3_respect_ids')) { $out += so3_respect_ids($pdo); } // 🌍 fiches d’Arolsen importées (lib/sources_ouvertes_3.php) : jamais dans un jeu non plus
    return $out;
}

/** la fiche telle que l'import la voit : nom, années, événements (type, date), union, départs, notes militaires */
function so2_person(PDO $pdo, int $pid): ?array
{
    if ($pid <= 0) { return null; }
    $s = $pdo->prepare("SELECT id, first_name, middle_name, last_name, gender, living_status, COALESCE(military_data,'') AS mil FROM persons WHERE id=?");
    $s->execute([$pid]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { return null; }
    $ev = $pdo->prepare("SELECT e.id, e.date_text, e.year, t.slug AS type_slug, t.gedcom_tag, t.label, COALESCE(pl.name,'') AS place FROM events e JOIN event_types t ON t.id=e.event_type_id
        LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id=? ORDER BY COALESCE(e.year,9999), e.id");
    $ev->execute([$pid]);
    $events = $ev->fetchAll(PDO::FETCH_ASSOC);
    $fam = $pdo->prepare("SELECT f.id, CASE WHEN f.partner1_id=? THEN f.partner2_id ELSE f.partner1_id END AS other FROM families f WHERE f.partner1_id=? OR f.partner2_id=? ORDER BY f.id");
    $fam->execute([$pid, $pid, $pid]);
    $families = [];
    foreach ($fam->fetchAll(PDO::FETCH_ASSOC) as $f) {
        $name = '';
        if ((int) $f['other']) { $o = $pdo->prepare('SELECT trim(first_name||\' \'||last_name) FROM persons WHERE id=?'); $o->execute([(int) $f['other']]); $name = (string) $o->fetchColumn(); }
        $families[] = ['id' => (int) $f['id'], 'spouse' => $name];
        $fe = $pdo->prepare('SELECT e.id, e.date_text, e.year, t.slug AS type_slug, t.gedcom_tag, t.label FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.family_id=?');
        $fe->execute([(int) $f['id']]);
        foreach ($fe->fetchAll(PDO::FETCH_ASSOC) as $e) { $events[] = $e + ['place' => '']; }
    }
    $by = 0; $dy = 0;
    foreach ($events as $e) { if (!$by && in_array($e['gedcom_tag'], ['BIRT', 'CHR', 'BAPM'], true)) { $by = (int) $e['year']; } if (!$dy && $e['gedcom_tag'] === 'DEAT') { $dy = (int) $e['year']; } }
    $voy = 0; try { $v = $pdo->prepare('SELECT count(*) FROM person_voyages WHERE person_id=?'); $v->execute([$pid]); $voy = (int) $v->fetchColumn(); } catch (Throwable $_) {}
    return ['id' => (int) $p['id'], 'first' => trim((string) $p['first_name'] . ' ' . (string) $p['middle_name']), 'last' => (string) $p['last_name'], 'gender' => (string) $p['gender'],
        'living_status' => (string) $p['living_status'], 'birth_year' => $by ?: null, 'death_year' => $dy ?: null,
        'events' => array_map(static fn($e) => ['id' => (int) $e['id'], 'type_slug' => (string) $e['type_slug'], 'gedcom_tag' => (string) $e['gedcom_tag'], 'label' => (string) $e['label'], 'date_text' => (string) $e['date_text'], 'year' => (int) $e['year'] ?: null, 'place' => (string) $e['place']], $events),
        'families' => $families, 'hasSpouse' => (bool) $families, 'hasVoyage' => $voy > 0];
}

/** la cible d'une notice du patrimoine : un lieu, une maison ou un objet de famille qui existe */
function so2_target(PDO $pdo, mixed $t): ?array
{
    if (!is_array($t)) { return null; }
    $type = (string) ($t['type'] ?? ''); $id = safe_int($t['id'] ?? 0);
    $table = ['place' => ['places', 'name'], 'house' => ['houses', 'name'], 'object' => ['family_objects', 'title']][$type] ?? null;
    if (!$table || $id <= 0) { return null; }
    if ($type === 'house' && function_exists('houses_ensure')) { houses_ensure($pdo); }
    try { $s = $pdo->prepare("SELECT {$table[1]} FROM {$table[0]} WHERE id=?"); $s->execute([$id]); $name = $s->fetchColumn(); } catch (Throwable $_) { return null; }
    return $name === false ? null : ['type' => $type, 'id' => $id, 'name' => (string) $name];
}

/** les champs envoyés par la page, nettoyés et bornés */
function so2_clean(array $d): array
{
    $kind = isset(SO2_KINDS[$d['kind'] ?? '']) ? (string) $d['kind'] : '';
    if ($kind === '') { throw new LcndaBadInput('Sorte d’import inconnue.'); }
    $f = is_array($d['fields'] ?? null) ? $d['fields'] : [];
    $out = ['kind' => $kind, 'person_id' => safe_int($d['person_id'] ?? 0), 'site' => so2_t($d['site'] ?? '', 40), 'url' => so2_url($d['url'] ?? ''), 'fields' => [],
        'same' => ($d['same'] ?? 'yes') === 'no' ? 'no' : 'yes', 'adds' => []];
    foreach ($f as $k => $v) {
        if (!is_string($k) || !preg_match('/^[a-z_]{1,40}$/', $k) || count($out['fields']) >= 40) { continue; }
        $out['fields'][$k] = so2_t($v, in_array($k, ['text', 'summary', 'ships', 'transcript'], true) ? 20000 : 500);
    }
    $allowed = SO2_KINDS[$kind];
    foreach (array_slice(is_array($d['adds'] ?? null) ? $d['adds'] : [], 0, 12) as $a) {
        if (!is_array($a) || empty($a['checked'])) { continue; }
        $what = (string) ($a['what'] ?? '');
        $row = ['what' => $what, 'date' => so2_t($a['date'] ?? '', 120), 'place' => so2_t($a['place'] ?? '', 200), 'title' => so2_t($a['title'] ?? '', 300), 'description' => so2_t($a['description'] ?? '', 4000)];
        if ($what === 'event') {
            $type = (string) ($a['type'] ?? '');
            if (!in_array($type, $allowed['events'], true)) { throw new LcndaBadInput('Cet ajout ne correspond pas à ce document.'); }
            $row['type'] = $type;
        } elseif (!in_array($what, $allowed['extra'], true)) { throw new LcndaBadInput('Cet ajout ne correspond pas à ce document.'); }
        $out['adds'][] = $row;
    }
    return $out;
}

/** POST so2_preview : « c'est la même personne ? » — la fiche et les écarts avec ce que dit le document ; rien n'est écrit */
function so2_preview(PDO $pdo, array $data): array
{
    $c = so2_clean($data + ['adds' => []]);
    $p = so2_person($pdo, $c['person_id']);
    $f = $c['fields']; $out = [];
    $add = static function (string $level, string $text) use (&$out): void { $out[] = ['level' => $level, 'text' => $text]; };
    if ($p) {
        if (!empty($f['last']) && $p['last'] !== '' && so2_fold($f['last']) !== so2_fold($p['last'])) { $add('orange', 'Le document dit « ' . $f['last'] . ' », la fiche « ' . $p['last'] . ' » : est-ce bien la même personne ?'); }
        if (!empty($f['first']) && $p['first'] !== '') {
            $a = explode(' ', so2_fold($f['first']))[0]; $b = explode(' ', so2_fold($p['first']));
            if (!in_array($a, $b, true)) { $add('orange', 'Prénom lu « ' . $f['first'] . ' », la fiche dit « ' . $p['first'] . ' ».'); }
        }
        $by = so2_year((string) ($f['birth'] ?? ''));
        if ($by && $p['birth_year'] && abs($by - (int) $p['birth_year']) > 1) { $add('orange', 'Né(e) en ' . $by . ' d’après le document, en ' . $p['birth_year'] . ' d’après la fiche.'); }
        $y = so2_year((string) ($f['date'] ?? ''));
        if ($y && $p['birth_year'] && $y < (int) $p['birth_year']) { $add('orange', 'Le document est daté de ' . $y . ', avant la naissance notée sur la fiche (' . $p['birth_year'] . ').'); }
        if ($y && $p['death_year'] && $y > (int) $p['death_year'] + 1 && !in_array($c['kind'], ['patrimoine', 'jo'], true)) { $add('yellow', 'Le document est daté de ' . $y . ', après le décès noté sur la fiche (' . $p['death_year'] . ').'); }
        if ($p['living_status'] === 'living' && !empty(SO2_KINDS[$c['kind']]['respect'])) { $add('yellow', 'La fiche est notée « vivante » : vérifie qu’il s’agit bien de la même personne.'); }
    }
    if ($c['url'] !== '' && $p) {
        $s = $pdo->prepare("SELECT count(*) FROM sources s JOIN source_links l ON l.source_record_id=s.id WHERE s.url=? AND l.entity_type='person' AND l.entity_id=?");
        $s->execute([$c['url'], $p['id']]);
        if ((int) $s->fetchColumn()) { $add('yellow', 'Ce lien est déjà une source de cette fiche : l’importer encore ferait un doublon.'); }
    }
    $target = so2_target($pdo, $data['target'] ?? null);
    return ['ecarts' => $out, 'person' => $p, 'target' => $target];
}

/** ajoute un texte à la suite d'un autre (jamais à la place), sans le répéter */
function so2_append(string $old, string $txt): string
{
    $old = trim($old); $txt = trim($txt);
    if ($txt === '' || str_contains(so2_fold($old), so2_fold($txt))) { return $old; }
    return $old !== '' ? $old . "\n\n" . $txt : $txt;
}

/** POST so2_import (multipart) */
function so2_import(PDO $pdo, ?array $file, array $data): array
{
    so2_need_so(); so_schema($pdo);
    $c = so2_clean($data);
    $kind = $c['kind']; $K = SO2_KINDS[$kind]; $f = $c['fields'];
    $pid = $c['person_id'];
    $t0 = $data['target'] ?? null; // un lieu « pas encore dans ta base » (wNNN) y entre une fois choisi
    if (is_array($t0) && ($t0['type'] ?? '') === 'place' && preg_match('/^w\d{1,12}$/', (string) ($t0['id'] ?? ''))) { $t0['id'] = (int) place_id_from_data($pdo, ['place_id' => (string) $t0['id']]); }
    $target = so2_target($pdo, $t0);
    if ($pid) {
        if (!person_exists($pdo, $pid)) { throw new RuntimeException('Fiche introuvable : elle a peut-être été supprimée.'); }
        assert_person_unlocked($pdo, $pid);
    } elseif (empty($K['noPerson']) || !$target) {
        throw new RuntimeException(empty($K['noPerson']) ? 'Choisis d’abord la fiche à qui ce document se rapporte.' : 'Choisis le lieu, la maison ou l’objet de famille à compléter.');
    }
    $person = so2_person($pdo, $pid);
    $stored = so_store_file($file);
    if (!$stored && $c['url'] === '' && trim((string) ($f['text'] ?? '')) === '' && trim((string) ($f['summary'] ?? '')) === '') {
        throw new LcndaBadInput('Il faut un fichier, un lien ou au moins le texte du document.');
    }
    $sure = $c['same'] === 'yes';
    $batch = 'so2-' . bin2hex(random_bytes(6));
    $ids = ['media' => [], 'media_links' => [], 'sources' => [], 'source_links' => [], 'events' => [], 'probate' => [], 'voyages' => [], 'collection_media' => []];
    $before = [];
    $who = $person ? trim($person['first'] . ' ' . mb_strtoupper($person['last'])) : ($target['name'] ?? '');
    $notes = [];
    $pdo->beginTransaction();
    try {
        // 1. le fichier → un média (relié à la fiche si c'est bien elle, ou à la cible du patrimoine)
        $mediaId = 0; $mediaFile = '';
        if ($stored) {
            [$mediaFile, $mtype] = $stored;
            $title = so2_t($f['media_title'] ?? '', 300) ?: ($K['label'] . ($who !== '' ? ' — ' . $who : ''));
            $pdo->prepare('INSERT INTO media(title, description, media_type, filename, thumbnail, date_text, document_reference, document_title, document_url, transcription) VALUES(?,?,?,?,?,?,?,?,?,?)')
                ->execute([$title, SO2_MENTION . '.', $mtype, $mediaFile, $mtype === 'image' ? $mediaFile : '', so2_t($f['date'] ?? ($f['year'] ?? ''), 100),
                    so2_t($f['cote'] ?? ($f['ref'] ?? ''), 200), $K['label'], $c['url'], so2_t($f['text'] ?? ($f['summary'] ?? ''), 20000)]);
            $mediaId = (int) $pdo->lastInsertId(); $ids['media'][] = $mediaId;
            $link = static function (string $type, int $id) use ($pdo, $mediaId, &$ids): void {
                $pos = $pdo->prepare('SELECT COALESCE(max(position),0)+1 FROM media_links WHERE entity_type=? AND entity_id=?'); $pos->execute([$type, $id]);
                $pdo->prepare('INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?,?,?,?)')->execute([$mediaId, $type, $id, (float) $pos->fetchColumn()]);
                $ids['media_links'][] = (int) $pdo->lastInsertId();
            };
            if ($pid && $sure) { $link('person', $pid); }
            if ($pid && $sure && in_array($kind, ['shd_marin', 'shd_officier'], true)) { $link('military', $pid); }
            // un lieu ou une maison n'a pas de liste de médias à lui : l'image reste reliée à la source, et le texte ajouté la nomme
            if ($target && $target['type'] === 'object') {
                $pdo->prepare("INSERT INTO family_collection_media(collection_type, collection_id, media_id, position, role) VALUES('family_object', ?, ?, 0, '')")->execute([$target['id'], $mediaId]);
                $ids['collection_media'][] = (int) $pdo->lastInsertId();
            }
            log_change($pdo, 'media', $mediaId, 'create', $K['label'] . ' importé(e)' . ($who !== '' ? ' pour ' . $who : ''));
        }
        // 2. la source, avec le lien
        $srcTitle = $K['label'] . ($who !== '' ? ' — ' . $who : '') . (!empty($f['cote']) ? ' (' . $f['cote'] . ')' : '') . (!empty($f['ref']) ? ' (' . $f['ref'] . ')' : '') . (!empty($f['date']) ? ', ' . $f['date'] : '');
        $text = SO2_MENTION . '.' . (trim((string) ($f['text'] ?? '')) !== '' ? "\n\n" . so2_t($f['text'], 20000) : '');
        $pdo->prepare('INSERT INTO sources(title, author, agency, publication, url, text) VALUES(?,?,?,?,?,?)')->execute([mb_substr($srcTitle, 0, 400), '', $K['agency'], so2_t($f['cote'] ?? '', 200), $c['url'], $text]);
        $sid = (int) $pdo->lastInsertId(); $ids['sources'][] = $sid;
        $sl = $pdo->prepare('INSERT INTO source_links(entity_type, entity_id, source_record_id, page, quality, note) VALUES(?,?,?,?,?,?)');
        $page = so2_t($f['page'] ?? ($f['cote'] ?? ($f['number'] ?? '')), 120);
        if ($pid && $sure) { $sl->execute(['person', $pid, $sid, $page, '', SO2_MENTION]); $ids['source_links'][] = (int) $pdo->lastInsertId(); }
        if ($target && in_array($target['type'], ['place'], true)) { $sl->execute(['place', $target['id'], $sid, $page, '', SO2_MENTION]); $ids['source_links'][] = (int) $pdo->lastInsertId(); }
        if ($mediaId) { $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'source', ?, 0)")->execute([$mediaId, $sid]); $ids['media_links'][] = (int) $pdo->lastInsertId(); }
        // 3. les ajouts cochés (seulement si c'est bien la même personne)
        foreach ($sure ? $c['adds'] : [] as $a) {
            if ($a['what'] === 'event') {
                if (!$pid) { continue; }
                $typeId = so2_type_id($pdo, $a['type']);
                $scope = SO2_TYPES[$a['type']][3];
                $body = ['event_type_id' => $typeId, 'date_text' => $a['date'], 'place_name' => $a['place'], 'title' => $a['title'], 'description' => trim($a['description'] . ($a['description'] !== '' ? "\n" : '') . SO2_MENTION . '.')];
                if ($scope === 'family') {
                    $famId = 0; $want = safe_int($data['family_id'] ?? 0);
                    foreach ($person['families'] as $fam) { if (!$famId || $fam['id'] === $want) { $famId = $fam['id']; } }
                    if (!$famId) { $notes[] = SO2_TYPES[$a['type']][2] . ' non ajouté (pas d’union sur la fiche)'; continue; }
                    $eid = (int) add_event($pdo, $body + ['event_scope' => 'family', 'family_id' => $famId])['id'];
                } else {
                    $eid = (int) add_event($pdo, $body + ['person_id' => $pid])['id'];
                }
                $ids['events'][] = $eid;
                $sl->execute(['event', $eid, $sid, $page, '', SO2_MENTION]); $ids['source_links'][] = (int) $pdo->lastInsertId();
                $notes[] = 'événement « ' . SO2_TYPES[$a['type']][2] . ' » ajouté';
            } elseif ($a['what'] === 'probate' && $pid) {
                $pdo->prepare('INSERT INTO probate_inventories(person_id, date_text, year, notary, place_text, currency, reference, notes) VALUES(?,?,?,?,?,?,?,?)')
                    ->execute([$pid, $a['date'], so2_year($a['date']) ?: null, $a['title'], $a['place'], '', $a['description'] !== '' ? $a['description'] : so2_t($f['cote'] ?? '', 200), SO2_MENTION . '.']);
                $ids['probate'][] = (int) $pdo->lastInsertId(); $notes[] = 'inventaire après décès ajouté';
            } elseif ($a['what'] === 'voyage' && $pid) {
                if ($kind === 'naturalisation') { // la date de naturalisation du dernier départ, seulement si la case est vide
                    $v = $pdo->prepare("SELECT id, naturalization_date, naturalization_place FROM person_voyages WHERE person_id=? ORDER BY COALESCE(departure_year,0) DESC, id DESC LIMIT 1");
                    $v->execute([$pid]); $row = $v->fetch(PDO::FETCH_ASSOC);
                    if ($row && trim((string) $row['naturalization_date']) === '') {
                        $before['voyage'] = ['id' => (int) $row['id'], 'naturalization_date' => '', 'naturalization_place' => (string) $row['naturalization_place'], 'after' => $a['date']];
                        $pdo->prepare('UPDATE person_voyages SET naturalization_date=?, naturalization_place=CASE WHEN trim(naturalization_place)=\'\' THEN ? ELSE naturalization_place END, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$a['date'], $a['place'], (int) $row['id']]);
                        $notes[] = 'date de naturalisation notée dans « Départs et émigration »';
                    } elseif ($row) { $notes[] = 'naturalisation déjà notée dans « Départs et émigration », gardée'; }
                } else { // Ellis Island : un départ en plus
                    $pdo->prepare('INSERT INTO person_voyages(person_id, departure_port, ship_name, destination, arrival_date, arrival_port, passenger_list_url, passenger_list_text, notes) VALUES(?,?,?,?,?,?,?,?,?)')
                        ->execute([$pid, $a['place'], $a['title'], $a['description'], $a['date'], 'New York (Ellis Island)', $c['url'], so2_t($f['text'] ?? '', 5000), SO2_MENTION . '.']);
                    $ids['voyages'][] = (int) $pdo->lastInsertId();
                    $flag = (int) $pdo->query('SELECT COALESCE(show_voyage_block,0) FROM persons WHERE id=' . $pid)->fetchColumn();
                    if (!$flag) { $before['show_voyage_block'] = 0; $pdo->prepare('UPDATE persons SET show_voyage_block=1 WHERE id=?')->execute([$pid]); }
                    $notes[] = 'départ ajouté (« Départs et émigration »)';
                }
            } elseif ($a['what'] === 'military' && $pid) {
                $raw = (string) $pdo->query("SELECT COALESCE(military_data,'') FROM persons WHERE id=" . $pid)->fetchColumn();
                $mil = json_decode($raw, true); $mil = is_array($mil) ? $mil : [];
                $new = so2_append((string) ($mil['notes_militaires'] ?? ''), $a['description']);
                if ($new !== trim((string) ($mil['notes_militaires'] ?? ''))) {
                    $mil['notes_militaires'] = $new; $after = json_encode($mil, JSON_UNESCAPED_UNICODE);
                    $before['military_data'] = $raw; $before['military_after'] = $after;
                    $pdo->prepare('UPDATE persons SET military_data=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$after, $pid]);
                    $notes[] = 'notes du bloc militaire complétées';
                }
                if (($person['gender'] ?? '') !== 'male') {
                    $flag = (int) $pdo->query('SELECT COALESCE(show_military_block,0) FROM persons WHERE id=' . $pid)->fetchColumn();
                    if (!$flag) { $before['show_military_block'] = 0; $pdo->prepare('UPDATE persons SET show_military_block=1 WHERE id=?')->execute([$pid]); }
                }
            } elseif ($a['what'] === 'target' && $target) {
                $txt = trim(($a['title'] !== '' ? $a['title'] . "\n" : '') . $a['description'] . "\n(" . ($c['url'] !== '' ? $c['url'] . ' — ' : '') . SO2_MENTION . ')');
                if ($mediaId && $target['type'] !== 'object') { $txt .= "\nImage rangée dans les médias : « " . so2_t($f['media_title'] ?? '', 300) . ($f['media_title'] ?? '' ? '' : $K['label'] . ($who !== '' ? ' — ' . $who : '')) . ' ».'; }
                if ($target['type'] === 'place') {
                    $old = (string) $pdo->query('SELECT COALESCE(description,\'\') FROM places WHERE id=' . $target['id'])->fetchColumn(); $new = so2_append($old, $txt);
                    if ($new !== trim($old)) { $before['target'] = ['type' => 'place', 'id' => $target['id'], 'old' => $old, 'after' => $new]; $pdo->prepare('UPDATE places SET description=? WHERE id=?')->execute([$new, $target['id']]); }
                } elseif ($target['type'] === 'object') {
                    $old = (string) $pdo->query('SELECT COALESCE(description,\'\') FROM family_objects WHERE id=' . $target['id'])->fetchColumn(); $new = so2_append($old, $txt);
                    if ($new !== trim($old)) { $before['target'] = ['type' => 'object', 'id' => $target['id'], 'old' => $old, 'after' => $new]; $pdo->prepare('UPDATE family_objects SET description=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$new, $target['id']]); }
                } else { // maison : la note de la maison (meta.note)
                    $rawH = (string) $pdo->query('SELECT data_json FROM houses WHERE id=' . $target['id'])->fetchColumn();
                    $h = json_decode($rawH, true); $h = is_array($h) ? $h : [];
                    $h['meta'] = is_array($h['meta'] ?? null) ? $h['meta'] : ['people' => [], 'note' => ''];
                    $old = (string) ($h['meta']['note'] ?? ''); $new = so2_append($old, $txt);
                    if ($new !== trim($old)) { $h['meta']['note'] = $new; $after = json_encode($h, JSON_UNESCAPED_UNICODE); $before['target'] = ['type' => 'house', 'id' => $target['id'], 'old' => $rawH, 'after' => $after];
                        $pdo->prepare('UPDATE houses SET data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$after, $target['id']]); }
                }
                $notes[] = isset($before['target']) ? 'notice ajoutée à « ' . $target['name'] . ' »' : 'notice déjà présente dans « ' . $target['name'] . ' », gardée';
            }
        }
        if (!$sure) { $notes[] = 'rien ajouté à la fiche (pas sûr que ce soit la même personne)'; }
        $summary = $K['label'] . ' : ' . implode(', ', array_merge($mediaId ? ['document rangé dans les médias'] : [], ['source créée'], $notes));
        $pdo->prepare('INSERT INTO so_imports(batch, kind, person_id, summary, ids, before_json) VALUES(?,?,?,?,?,?)')
            ->execute([$batch, $kind, $pid, $summary, json_encode($ids), json_encode($before + ($target ? ['_target' => $target] : []), JSON_UNESCAPED_UNICODE)]);
        log_change($pdo, $pid ? 'person' : 'source', $pid ?: $sid, 'update', $summary . ' — ' . SO2_MENTION);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        if ($stored) { @unlink(MEDIA_DIR . '/' . $stored[0]); }
        throw $e;
    }
    return ['batch' => $batch, 'summary' => $summary, 'media_id' => $ids['media'][0] ?? 0, 'source_id' => $sid, 'event_ids' => $ids['events'], 'notes' => $notes];
}

/** POST so2_undo : retire tout ce qu'un import a ajouté et remet les anciennes valeurs (si personne ne les a changées depuis) */
function so2_undo(PDO $pdo, array $data): array
{
    so2_need_so(); so_schema($pdo);
    $batch = so2_t($data['batch'] ?? '', 40);
    if (!str_starts_with($batch, 'so2-')) { throw new LcndaBadInput('Import inconnu.'); }
    $s = $pdo->prepare("SELECT * FROM so_imports WHERE batch=? AND undone_at=''"); $s->execute([$batch]); $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException('Cet import est déjà annulé, ou introuvable.'); }
    $ids = json_decode((string) $row['ids'], true) ?: []; $before = json_decode((string) $row['before_json'], true) ?: [];
    $pid = (int) $row['person_id'];
    if ($pid) { assert_person_unlocked($pdo, $pid); }
    $files = [];
    $pdo->beginTransaction();
    try {
        foreach (array_map('intval', $ids['source_links'] ?? []) as $id) { $pdo->prepare('DELETE FROM source_links WHERE id=?')->execute([$id]); }
        foreach (array_map('intval', $ids['events'] ?? []) as $id) {
            foreach (['media_links', 'source_links', 'notes', 'label_links'] as $t) { try { $pdo->prepare("DELETE FROM $t WHERE entity_type='event' AND entity_id=?")->execute([$id]); } catch (Throwable $_) {} }
            try { $pdo->prepare('DELETE FROM event_witnesses WHERE event_id=?')->execute([$id]); } catch (Throwable $_) {}
            $pdo->prepare('DELETE FROM events WHERE id=?')->execute([$id]);
            log_change($pdo, 'event', $id, 'delete', 'Import d’archives en ligne annulé');
        }
        foreach (array_map('intval', $ids['probate'] ?? []) as $id) { $pdo->prepare('DELETE FROM probate_inventories WHERE id=? AND person_id=?')->execute([$id, $pid]); }
        foreach (array_map('intval', $ids['voyages'] ?? []) as $id) { try { $pdo->prepare('DELETE FROM voyage_people WHERE voyage_id=?')->execute([$id]); } catch (Throwable $_) {} $pdo->prepare('DELETE FROM person_voyages WHERE id=? AND person_id=?')->execute([$id, $pid]); }
        foreach (array_map('intval', $ids['collection_media'] ?? []) as $id) { $pdo->prepare('DELETE FROM family_collection_media WHERE id=?')->execute([$id]); }
        foreach (array_map('intval', $ids['sources'] ?? []) as $id) {
            $n = $pdo->prepare('SELECT count(*) FROM source_links WHERE source_record_id=?'); $n->execute([$id]);
            if (!(int) $n->fetchColumn()) { $pdo->prepare("DELETE FROM media_links WHERE entity_type='source' AND entity_id=?")->execute([$id]); $pdo->prepare('DELETE FROM sources WHERE id=?')->execute([$id]); }
        }
        foreach (array_map('intval', $ids['media_links'] ?? []) as $id) { $pdo->prepare('DELETE FROM media_links WHERE id=?')->execute([$id]); }
        foreach (array_map('intval', $ids['media'] ?? []) as $id) {
            $n = $pdo->prepare('SELECT (SELECT count(*) FROM media_links WHERE media_id=?) + (SELECT count(*) FROM family_collection_media WHERE media_id=?)'); $n->execute([$id, $id]);
            if ((int) $n->fetchColumn()) { continue; } // relié ailleurs entre-temps : gardé
            $fn = $pdo->prepare('SELECT filename FROM media WHERE id=?'); $fn->execute([$id]); $name = basename((string) $fn->fetchColumn());
            $pdo->prepare('DELETE FROM media WHERE id=?')->execute([$id]);
            if ($name !== '') { $u = $pdo->prepare('SELECT count(*) FROM media WHERE filename=? OR thumbnail=?'); $u->execute([$name, $name]); if (!(int) $u->fetchColumn()) { $files[] = $name; } }
            log_change($pdo, 'media', $id, 'delete', 'Import d’archives en ligne annulé');
        }
        if (isset($before['voyage']['id'])) { // seulement si la date est encore celle que l'import a écrite
            $pdo->prepare('UPDATE person_voyages SET naturalization_date=?, naturalization_place=? WHERE id=? AND naturalization_date=?')
                ->execute([(string) $before['voyage']['naturalization_date'], (string) $before['voyage']['naturalization_place'], (int) $before['voyage']['id'], (string) $before['voyage']['after']]);
        }
        if (array_key_exists('military_data', $before) && $pid) {
            $cur = (string) $pdo->query("SELECT COALESCE(military_data,'') FROM persons WHERE id=" . $pid)->fetchColumn();
            if ($cur === (string) ($before['military_after'] ?? '')) { $pdo->prepare('UPDATE persons SET military_data=? WHERE id=?')->execute([(string) $before['military_data'], $pid]); }
            else { // changé entre-temps : on ne remet que les notes, si elles sont encore celles écrites par l'import
                $old = json_decode((string) $before['military_data'], true) ?: []; $aft = json_decode((string) ($before['military_after'] ?? ''), true) ?: []; $now = json_decode($cur, true) ?: [];
                if (($now['notes_militaires'] ?? null) === ($aft['notes_militaires'] ?? null)) { $now['notes_militaires'] = $old['notes_militaires'] ?? ''; $pdo->prepare('UPDATE persons SET military_data=? WHERE id=?')->execute([json_encode($now, JSON_UNESCAPED_UNICODE), $pid]); }
            }
        }
        if (isset($before['target']['type'])) {
            $t = $before['target']; $id = (int) $t['id'];
            match ($t['type']) {
                'place' => $pdo->prepare('UPDATE places SET description=? WHERE id=? AND description=?')->execute([(string) $t['old'], $id, (string) $t['after']]),
                'object' => $pdo->prepare('UPDATE family_objects SET description=? WHERE id=? AND description=?')->execute([(string) $t['old'], $id, (string) $t['after']]),
                'house' => $pdo->prepare('UPDATE houses SET data_json=? WHERE id=? AND data_json=?')->execute([(string) $t['old'], $id, (string) $t['after']]),
                default => null,
            };
        }
        foreach (['show_military_block', 'show_voyage_block'] as $col) { if (array_key_exists($col, $before) && $pid) { $pdo->prepare("UPDATE persons SET $col=? WHERE id=?")->execute([(int) $before[$col], $pid]); } }
        $pdo->prepare('UPDATE so_imports SET undone_at=CURRENT_TIMESTAMP WHERE batch=?')->execute([$batch]);
        log_change($pdo, $pid ? 'person' : 'source', $pid ?: 0, 'update', 'Import d’archives en ligne annulé (' . $row['kind'] . ')');
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    foreach ($files as $name) { @unlink(MEDIA_DIR . '/' . $name); }
    return ['batch' => $batch, 'undone' => true];
}

/** le point d'entrée (api.php) : POST so2_preview, so2_import (multipart), so2_undo — jamais de requête vers un site d'archives */
const SO2_ACTIONS = ['so2_preview', 'so2_import', 'so2_undo'];
function so2_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite) { json_response(['error' => 'Demande inconnue.'], 400); }
        if ($action === 'so2_import') {
            $data = $payload;
            if (isset($payload['data']) && is_string($payload['data'])) { $data = json_decode($payload['data'], true); }
            if (!is_array($data)) { throw new LcndaBadInput('Données de l’import illisibles.'); }
            json_response(['ok' => true, 'result' => so2_import($pdo, $_FILES['file'] ?? null, $data)]);
        }
        json_response(['ok' => true, 'result' => match ($action) { 'so2_preview' => so2_preview($pdo, $payload), 'so2_undo' => so2_undo($pdo, $payload), default => throw new LcndaBadInput('Demande inconnue.') }]);
    } catch (LcndaBadInput $e) { json_response(['error' => $e->getMessage()], 422); }
    catch (Throwable $e) { json_response(['error' => function_exists('readable_error_message') ? readable_error_message($e) : $e->getMessage()], 422); }
}
