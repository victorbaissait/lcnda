<?php
declare(strict_types=1);

/**
 * 🎉 Organiser une cousinade (Listes → Recherche et organisation → « 🎉 Cousinades », assets/js/heritage-cousinade.js,
 * calculs sans écran : assets/js/app-cousinade-core.js, styles : assets/css/cousinade.css).
 * Un projet = un ancêtre (ou un couple) : l'app trouve ses descendants VIVANTS (et leurs conjoints, au choix), rangés par
 * branche (l'enfant de l'ancêtre dont ils descendent), avec le lien de parenté envers l'ancêtre et envers une personne de
 * référence (mêmes mots que la question « Quel lien ? » : qm_kinship / qm_kin_label de lib/question_more.php).
 * Construit sur l'existant :
 *  - adresse, courriel, téléphone repris du « Répertoire des vivants » (living_contacts, par person_id), sinon de la dernière
 *    adresse ou résidence notée dans la fiche ; modifiés ici sans toucher la fiche, sauf si on coche « aussi dans le répertoire » ;
 *  - jamais une fiche confidentielle (persons.is_private) : ni trouvée, ni montrée ;
 *  - les données des vivants restent dans ces deux tables : aucun export (GEDCOM, site, mode simple…) ne les lit ; le seul
 *    fichier qui en sort est le tableau des invités, avec une case explicite pour les adresses.
 * Tables (migration 86) : cousinades, cousinade_guests. Supprimer = deleted_at (↶ Annuler).
 * Mode consultation (kiosk) : rien ne se lit, rien ne s'écrit (des adresses de vivants).
 */

const COUS_ANSWERS = ['', 'yes', 'no', 'maybe'];
const COUS_GUESTS_MAX = 3000;
const COUS_SET_FIELDS = ['invited', 'answer', 'present', 'table_no', 'foyer', 'branch_id'];
const COUS_TEXT_FIELDS = ['first_name' => 80, 'last_name' => 80, 'address' => 300, 'postal_code' => 20, 'city' => 120, 'country' => 80, 'email' => 200, 'phone' => 60, 'diet' => 200, 'note' => 2000, 'foyer' => 60];
const COUS_OPTION_KEYS = ['branchColors', 'invitation', 'badges', 'tables', 'album', 'tree', 'refFirst'];

function cousinade_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS cousinades (id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '', ancestor_id INTEGER, ancestor2_id INTEGER, ref_id INTEGER,
        date_text TEXT NOT NULL DEFAULT '', place_id INTEGER, place_text TEXT NOT NULL DEFAULT '',
        include_spouses INTEGER NOT NULL DEFAULT 1, options_json TEXT NOT NULL DEFAULT '{}', deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS cousinade_guests (id INTEGER PRIMARY KEY AUTOINCREMENT, cousinade_id INTEGER NOT NULL,
        person_id INTEGER, spouse_of INTEGER, branch_id INTEGER, first_name TEXT NOT NULL DEFAULT '', last_name TEXT NOT NULL DEFAULT '',
        gender TEXT NOT NULL DEFAULT 'unknown', living_doubt INTEGER NOT NULL DEFAULT 0, invited INTEGER NOT NULL DEFAULT 1,
        foyer TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', postal_code TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '',
        country TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
        answer TEXT NOT NULL DEFAULT '', people_count INTEGER, diet TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
        present INTEGER NOT NULL DEFAULT 0, table_no INTEGER, added_by TEXT NOT NULL DEFAULT 'scan', position INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_cous_guests_c ON cousinade_guests(cousinade_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_cous_guests_p ON cousinade_guests(person_id)');
}

function cous_ready(PDO $pdo): bool
{
    static $ok = [];
    $k = spl_object_id($pdo);
    if (!empty($ok[$k])) { return true; }
    return $ok[$k] = (int) $pdo->query("SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('cousinades','cousinade_guests')")->fetchColumn() === 2;
}

function cous_kiosk(): bool { return function_exists('kiosk_state') && !empty(kiosk_state()['on']); }

function cous_text(mixed $v, int $max): string
{
    return mb_substr(trim((string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', safe_text($v))), 0, $max);
}

/* ═════════ Le graphe de la famille (une lecture par requête) ═════════ */
function cous_graph(PDO $pdo): array
{
    static $g = null;
    if ($g !== null) { return $g; }
    $kids = []; $parents = []; $partners = []; $couples = [];
    foreach ($pdo->query('SELECT id, partner1_id, partner2_id FROM families') as $f) {
        $a = (int) $f['partner1_id']; $b = (int) $f['partner2_id'];
        $couples[(int) $f['id']] = [$a, $b];
        if ($a && $b) { $partners[$a][$b] = true; $partners[$b][$a] = true; }
    }
    foreach ($pdo->query('SELECT family_id, child_id FROM family_children') as $r) {
        $c = (int) $r['child_id']; [$a, $b] = $couples[(int) $r['family_id']] ?? [0, 0];
        foreach ([$a, $b] as $p) { if ($p && $p !== $c) { $kids[$p][$c] = (int) $r['family_id']; $parents[$c][$p] = true; } }
    }
    return $g = ['kids' => $kids, 'parents' => $parents, 'partners' => $partners, 'couples' => $couples];
}

/** id → infos utiles (nom, sexe, vivant ?, confidentiel, années, portrait) */
function cous_people(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    $out = [];
    $hasPriv = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('persons') WHERE name='is_private'")->fetchColumn();
    foreach (array_chunk($ids, 400) as $chunk) {
        $in = implode(',', $chunk);
        foreach ($pdo->query("SELECT p.id, p.first_name, p.last_name, p.gender, p.living_status, " . ($hasPriv ? 'COALESCE(p.is_private,0)' : '0') . " AS priv, m.filename AS portrait
            FROM persons p LEFT JOIN media m ON m.id=p.portrait_media_id WHERE p.id IN ($in)")->fetchAll(PDO::FETCH_ASSOC) as $p) {
            $out[(int) $p['id']] = ['id' => (int) $p['id'], 'first' => trim((string) $p['first_name']), 'last' => trim((string) $p['last_name']), 'gender' => (string) $p['gender'],
                'status' => (string) $p['living_status'], 'priv' => (int) $p['priv'] === 1, 'portrait' => (string) ($p['portrait'] ?? ''), 'birth' => null, 'death' => null, 'dead_event' => false];
        }
        foreach ($pdo->query("SELECT e.person_id, t.gedcom_tag, MIN(e.year) AS y, COUNT(*) AS n FROM events e JOIN event_types t ON t.id=e.event_type_id
            WHERE e.person_id IN ($in) AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI','CREM') GROUP BY e.person_id, t.gedcom_tag")->fetchAll(PDO::FETCH_ASSOC) as $e) {
            $id = (int) $e['person_id']; if (!isset($out[$id])) { continue; }
            $y = $e['y'] !== null ? (int) $e['y'] : null;
            if (in_array($e['gedcom_tag'], ['BIRT', 'CHR', 'BAPM'], true)) { if ($y && (!$out[$id]['birth'] || $y < $out[$id]['birth'])) { $out[$id]['birth'] = $y; } }
            else { $out[$id]['dead_event'] = true; if ($y && (!$out[$id]['death'] || $y < $out[$id]['death'])) { $out[$id]['death'] = $y; } }
        }
    }
    return $out;
}

/** « Prénom NOM » */
function cous_name(array $p): string
{
    return trim($p['first'] . ' ' . mb_strtoupper($p['last'])) ?: 'Sans nom';
}

/**
 * Vivant ? 'yes' (noté vivant), 'maybe' (rien de noté, né il y a moins de 100 ans, sans décès), 'no'.
 * Sans année de naissance : 'maybe' si un parent est né il y a moins de 125 ans.
 */
function cous_alive(array $p, ?int $parentBirth = null): string
{
    if ($p['status'] === 'living') { return 'yes'; }
    if ($p['status'] === 'deceased' || $p['dead_event'] || $p['death']) { return 'no'; }
    $now = (int) date('Y');
    if ($p['birth']) { return $p['birth'] >= $now - 100 ? 'maybe' : 'no'; }
    if ($parentBirth && $parentBirth >= $now - 125) { return 'maybe'; }
    return 'no';
}

/**
 * Les descendants d'un ancêtre (ou d'un couple) : id → [gen, branch] (gen 1 = enfant ; branch = l'enfant de l'ancêtre
 * par qui il descend, le plus court chemin ; à génération égale, le premier enfant né).
 */
function cous_descendants(PDO $pdo, int $a, int $b = 0, int $max = 15): array
{
    $G = cous_graph($pdo);
    $first = [];
    if ($a && $b) {
        foreach ($G['kids'][$a] ?? [] as $c => $fam) { [$x, $y] = $G['couples'][$fam] ?? [0, 0]; if (($x === $a && $y === $b) || ($x === $b && $y === $a)) { $first[$c] = true; } }
        if (!$first) { foreach ([$a, $b] as $p) { foreach ($G['kids'][$p] ?? [] as $c => $_) { $first[$c] = true; } } }
    } else {
        foreach ($G['kids'][$a] ?? [] as $c => $_) { $first[$c] = true; }
    }
    $info = cous_people($pdo, array_keys($first));
    $order = array_keys($first);
    usort($order, static fn($x, $y) => (($info[$x]['birth'] ?? 9999) <=> ($info[$y]['birth'] ?? 9999)) ?: $x <=> $y);
    $out = []; $level = [];
    foreach ($order as $c) { if ($c === $a || $c === $b) { continue; } $out[$c] = ['gen' => 1, 'branch' => $c, 'parent' => $a]; $level[] = $c; }
    for ($g = 2; $g <= $max && $level; $g++) {
        $next = [];
        foreach ($level as $p) {
            foreach ($G['kids'][$p] ?? [] as $c => $_) {
                if (isset($out[$c]) || $c === $a || $c === $b) { continue; }
                $out[$c] = ['gen' => $g, 'branch' => $out[$p]['branch'], 'parent' => $p]; $next[] = $c;
                if (count($out) > 20000) { break 3; }
            }
        }
        $level = $next;
    }
    return $out;
}

/**
 * La recherche : les descendants vivants (et leurs conjoints vivants si demandé), sans les fiches confidentielles.
 * → ['guests' => [[person_id, spouse_of, branch_id, gen, doubt, first, last, gender, foyer]], 'private' => n, 'dead' => n]
 */
function cous_scan(PDO $pdo, int $a, int $b, bool $spouses): array
{
    $desc = cous_descendants($pdo, $a, $b);
    $G = cous_graph($pdo);
    $ids = array_keys($desc);
    $spouseIds = [];
    if ($spouses) { foreach ($ids as $id) { foreach ($G['partners'][$id] ?? [] as $s => $_) { if (!isset($desc[$s]) && $s !== $a && $s !== $b) { $spouseIds[$s][] = $id; } } } }
    $info = cous_people($pdo, array_merge($ids, array_keys($spouseIds)));
    $now = (int) date('Y');
    $guests = []; $private = 0; $dead = 0; $kept = [];
    foreach ($desc as $id => $d) {
        $p = $info[$id] ?? null; if (!$p) { continue; }
        if ($p['priv']) { $private++; continue; }
        $par = $info[$d['parent']] ?? null;
        $alive = cous_alive($p, $par['birth'] ?? null);
        if ($alive === 'no') { $dead++; continue; }
        $kept[$id] = true;
        // un enfant mineur va dans le foyer de son parent (s'il est invité aussi) ; sinon son propre foyer
        $minor = $p['birth'] && $p['birth'] > $now - 18;
        $guests[$id] = ['person_id' => $id, 'spouse_of' => null, 'branch_id' => $d['branch'], 'gen' => $d['gen'], 'doubt' => $alive === 'maybe' ? 1 : 0,
            'first' => $p['first'], 'last' => $p['last'], 'gender' => $p['gender'], 'foyer' => 'f' . $id, 'minor' => $minor, 'parent' => $d['parent']];
    }
    foreach ($guests as $id => &$gst) {
        if ($gst['minor'] && isset($kept[$gst['parent']])) { $gst['foyer'] = $guests[$gst['parent']]['foyer']; }
    }
    unset($gst);
    $out = array_values($guests);
    foreach ($spouseIds as $s => $of) {
        $p = $info[$s] ?? null; if (!$p) { continue; }
        if ($p['priv']) { $private++; continue; }
        $mate = null; foreach ($of as $o) { if (isset($guests[$o])) { $mate = $o; break; } }
        if (!$mate) { continue; }
        $alive = cous_alive($p, null);
        if ($alive === 'no') { continue; }
        $out[] = ['person_id' => $s, 'spouse_of' => $mate, 'branch_id' => $guests[$mate]['branch_id'], 'gen' => $guests[$mate]['gen'], 'doubt' => $alive === 'maybe' ? 1 : 0,
            'first' => $p['first'], 'last' => $p['last'], 'gender' => $p['gender'], 'foyer' => $guests[$mate]['foyer'], 'minor' => false, 'parent' => 0];
    }
    return ['guests' => $out, 'private' => $private, 'dead' => $dead];
}

/** les coordonnées d'une fiche : le répertoire des vivants d'abord, sinon la dernière adresse ou résidence notée */
function cous_contacts(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    $out = [];
    foreach (array_chunk($ids, 400) as $chunk) {
        $in = implode(',', $chunk);
        try {
            foreach ($pdo->query("SELECT person_id, email, phone, phone_mobile, phone_landline, address, postal_code, city, country FROM living_contacts WHERE person_id IN ($in) ORDER BY updated_at DESC, id DESC")->fetchAll(PDO::FETCH_ASSOC) as $c) {
                $id = (int) $c['person_id']; if (isset($out[$id])) { continue; }
                $out[$id] = ['email' => (string) $c['email'], 'phone' => (string) ($c['phone_mobile'] ?: ($c['phone'] ?: $c['phone_landline'])), 'address' => (string) $c['address'],
                    'postal_code' => (string) $c['postal_code'], 'city' => (string) $c['city'], 'country' => (string) $c['country'], 'from' => 'contact'];
            }
        } catch (Throwable $_) {}
        foreach ($pdo->query("SELECT e.person_id, e.address, pl.name AS city, pl.country AS country, e.year FROM events e LEFT JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
            WHERE e.person_id IN ($in) AND (trim(COALESCE(e.address,''))<>'' OR t.gedcom_tag='RESI') ORDER BY COALESCE(e.year,0) DESC, e.id DESC")->fetchAll(PDO::FETCH_ASSOC) as $e) {
            $id = (int) $e['person_id'];
            if (isset($out[$id]) && ($out[$id]['address'] !== '' || $out[$id]['city'] !== '')) { continue; }
            $row = $out[$id] ?? ['email' => '', 'phone' => '', 'address' => '', 'postal_code' => '', 'city' => '', 'country' => '', 'from' => 'fiche'];
            $row['address'] = trim((string) $e['address']); $row['city'] = trim((string) ($e['city'] ?? ''));
            if ($row['country'] === '') { $row['country'] = trim((string) ($e['country'] ?? '')); }
            if ($row['address'] === '' && $row['city'] === '') { continue; }
            $out[$id] = $row;
        }
    }
    return $out;
}

/* ═════════ Les liens de parenté ═════════ */
function cous_strip_art(string $s): string { return (string) preg_replace('/^(le |la |l’|l\')/u', '', $s); }
function cous_de(string $withArt): string
{
    if (str_starts_with($withArt, 'le ')) { return 'du ' . mb_substr($withArt, 3); }
    return 'de ' . $withArt;
}
/** ce qu'une personne est pour l'ancêtre : « petit-fils », « arrière-petite-fille »… (gen = générations sous l'ancêtre) */
function cous_kin_to_ancestor(int $gen, string $gender): string
{
    return function_exists('qm_kin_label') ? cous_strip_art(qm_kin_label($gen, 0, $gender, false)) : '';
}
/** ce que X est pour R (avec l'article) ; null si aucun lien de sang connu */
function cous_kin(PDO $pdo, int $x, int $r, string $gender): ?string
{
    if (!$x || !$r || !function_exists('qm_kinship')) { return null; }
    if ($x === $r) { return 'self'; }
    $k = qm_kinship($pdo, $x, $r);
    if (!$k) { return null; }
    return qm_kin_label((int) $k['a'], (int) $k['b'], $gender, (bool) $k['half']);
}

/* ═════════ Lecture ═════════ */
function cous_row(PDO $pdo, int $id, bool $withDeleted = false): array
{
    $s = $pdo->prepare('SELECT * FROM cousinades WHERE id=?' . ($withDeleted ? '' : ' AND deleted_at IS NULL'));
    $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new LcndaBadInput('Cousinade introuvable.'); }
    return $r;
}

function cous_options(string $json): array
{
    $o = json_decode($json ?: '{}', true);
    return is_array($o) ? array_intersect_key($o, array_flip(COUS_OPTION_KEYS)) : [];
}

function cousinade_list(PDO $pdo): array
{
    $rows = $pdo->query("SELECT c.*, (SELECT count(*) FROM cousinade_guests g WHERE g.cousinade_id=c.id AND g.deleted_at IS NULL) AS n,
        (SELECT count(*) FROM cousinade_guests g WHERE g.cousinade_id=c.id AND g.deleted_at IS NULL AND g.invited=1) AS n_inv,
        (SELECT count(*) FROM cousinade_guests g WHERE g.cousinade_id=c.id AND g.deleted_at IS NULL AND g.invited=1 AND g.answer='yes') AS n_yes,
        (SELECT count(*) FROM cousinade_guests g WHERE g.cousinade_id=c.id AND g.deleted_at IS NULL AND g.invited=1 AND g.answer='') AS n_wait
        FROM cousinades c WHERE c.deleted_at IS NULL ORDER BY c.updated_at DESC, c.id DESC")->fetchAll(PDO::FETCH_ASSOC);
    $info = cous_people($pdo, array_merge(array_column($rows, 'ancestor_id'), array_column($rows, 'ancestor2_id')));
    return array_map(static function ($r) use ($info) {
        $a = $info[(int) $r['ancestor_id']] ?? null; $b = $info[(int) $r['ancestor2_id']] ?? null;
        $opt = cous_options((string) $r['options_json']);
        return ['id' => (int) $r['id'], 'title' => (string) $r['title'], 'ancestor' => $a && !$a['priv'] ? cous_name($a) : '', 'ancestor2' => $b && !$b['priv'] ? cous_name($b) : '',
            'ancestor_id' => (int) $r['ancestor_id'], 'date_text' => (string) $r['date_text'], 'place_text' => (string) $r['place_text'],
            'guests' => (int) $r['n'], 'invited' => (int) $r['n_inv'], 'yes' => (int) $r['n_yes'], 'waiting' => (int) $r['n_wait'],
            'cover' => !empty($opt['album'][0]['filename']) ? (string) $opt['album'][0]['filename'] : '', 'updated_at' => (string) $r['updated_at'], 'created_at' => (string) $r['created_at']];
    }, $rows);
}

/** un projet et ses invités, avec branche, génération et liens de parenté calculés à la lecture */
function cousinade_get(PDO $pdo, int $id): array
{
    $c = cous_row($pdo, $id);
    $a = (int) $c['ancestor_id']; $b = (int) $c['ancestor2_id']; $ref = (int) $c['ref_id'];
    $desc = $a ? cous_descendants($pdo, $a, $b) : [];
    $s = $pdo->prepare('SELECT * FROM cousinade_guests WHERE cousinade_id=? AND deleted_at IS NULL ORDER BY position, id');
    $s->execute([$id]);
    $rows = $s->fetchAll(PDO::FETCH_ASSOC);
    $pids = array_filter(array_merge(array_column($rows, 'person_id'), array_column($rows, 'spouse_of'), [$a, $b, $ref]));
    $info = cous_people($pdo, $pids);
    $anc = $info[$a] ?? null; $anc2 = $info[$b] ?? null; $refP = $info[$ref] ?? null;
    if ($refP && $refP['priv']) { $refP = null; $ref = 0; }
    $ancName = $anc ? cous_name($anc) : '';
    if ($anc && $anc2) { $ancName = $anc['last'] === $anc2['last'] ? trim($anc['first'] . ' et ' . $anc2['first'] . ' ' . mb_strtoupper($anc['last'])) : cous_name($anc) . ' et ' . cous_name($anc2); }
    $branchIds = []; $hidden = 0; $guests = [];
    foreach ($rows as $r) {
        $pid = (int) $r['person_id']; $p = $pid ? ($info[$pid] ?? null) : null;
        if ($pid && (!$p || $p['priv'])) { $hidden++; continue; } // fiche devenue confidentielle (ou supprimée) : jamais montrée
        $mate = (int) $r['spouse_of']; $mp = $mate ? ($info[$mate] ?? null) : null;
        if ($mp && $mp['priv']) { $mp = null; }
        $d = $pid ? ($desc[$pid] ?? null) : null; $dm = $mate ? ($desc[$mate] ?? null) : null;
        $branch = (int) ($d['branch'] ?? $dm['branch'] ?? $r['branch_id'] ?? 0);
        $gen = $d['gen'] ?? ($dm['gen'] ?? null);
        $gender = $p['gender'] ?? (string) $r['gender'];
        $toAnc = ''; $toRef = '';
        if ($d) { $toAnc = cous_kin_to_ancestor((int) $d['gen'], $gender); }
        elseif ($pid && $a && function_exists('qm_kinship') && ($k0 = qm_kinship($pdo, $pid, $a)) && (int) $k0['b'] === 0) { $toAnc = cous_kin_to_ancestor((int) $k0['a'], $gender); }
        elseif ($mp && $dm) { $toAnc = ($gender === 'female' ? 'épouse' : ($gender === 'male' ? 'époux' : 'conjoint')) . ' ' . cous_de(qm_kin_label((int) $dm['gen'], 0, $mp['gender'], false)); }
        if ($ref) {
            if ($pid) { $k = cous_kin($pdo, $pid, $ref, $gender); if ($k === 'self') { $toRef = 'self'; } elseif ($k) { $toRef = cous_strip_art($k); } }
            if ($toRef === '' && $mp) {
                $k = cous_kin($pdo, $mate, $ref, $mp['gender']);
                $sp = $gender === 'female' ? 'épouse' : ($gender === 'male' ? 'époux' : 'conjoint');
                if ($k === 'self') { $toRef = $sp; } elseif ($k) { $toRef = $sp . ' ' . cous_de($k); }
            }
        }
        if ($branch) { $branchIds[$branch] = true; }
        $guests[] = ['id' => (int) $r['id'], 'person_id' => $pid ?: null, 'spouse_of' => $mp ? $mate : null, 'spouse_name' => $mp ? cous_name($mp) : '',
            'first_name' => $p ? $p['first'] : (string) $r['first_name'], 'last_name' => $p ? $p['last'] : (string) $r['last_name'], 'gender' => $gender,
            'birth' => $p['birth'] ?? null, 'portrait' => $p['portrait'] ?? '', 'doubt' => (int) $r['living_doubt'] === 1 && !($p && $p['status'] === 'living'),
            'branch_id' => $branch ?: null, 'gen' => $gen, 'kin_ancestor' => $toAnc, 'kin_ref' => $toRef,
            'invited' => (int) $r['invited'] === 1, 'foyer' => (string) $r['foyer'], 'address' => (string) $r['address'], 'postal_code' => (string) $r['postal_code'],
            'city' => (string) $r['city'], 'country' => (string) $r['country'], 'email' => (string) $r['email'], 'phone' => (string) $r['phone'],
            'answer' => (string) $r['answer'], 'people_count' => $r['people_count'] !== null ? (int) $r['people_count'] : null, 'diet' => (string) $r['diet'], 'note' => (string) $r['note'],
            'present' => (int) $r['present'] === 1, 'table_no' => $r['table_no'] !== null ? (int) $r['table_no'] : null, 'added_by' => (string) $r['added_by'], 'updated_at' => (string) $r['updated_at']];
    }
    // les branches : chaque enfant de l'ancêtre (même sans invité), dans l'ordre des naissances
    $bInfo = cous_people($pdo, array_merge(array_keys($branchIds), array_keys(array_filter($desc, static fn($d) => $d['gen'] === 1))));
    $branches = [];
    foreach ($desc as $cid => $d) { if ($d['gen'] === 1 && isset($bInfo[$cid], $branchIds[$cid])) { $branches[$cid] = $bInfo[$cid]; } } // une branche = un enfant qui a des invités
    foreach (array_keys($branchIds) as $bid) { if (!isset($branches[$bid]) && isset($bInfo[$bid])) { $branches[$bid] = $bInfo[$bid]; } }
    $bl = [];
    foreach ($branches as $bid => $p) { $bl[] = ['id' => $bid, 'name' => $p['priv'] ? 'Branche confidentielle' : cous_name($p), 'first' => $p['priv'] ? '' : $p['first'], 'birth' => $p['birth'], 'gender' => $p['gender']]; }
    $placeName = (string) $c['place_text'];
    if ((int) $c['place_id']) { $ps = $pdo->prepare('SELECT name FROM places WHERE id=?'); $ps->execute([(int) $c['place_id']]); $placeName = (string) ($ps->fetchColumn() ?: $placeName); }
    return ['id' => (int) $c['id'], 'title' => (string) $c['title'], 'ancestor_id' => $a ?: null, 'ancestor2_id' => $b ?: null, 'ancestor_name' => $ancName,
        'ancestor' => $anc ? ['id' => $a, 'name' => cous_name($anc), 'first' => $anc['first'], 'last' => $anc['last'], 'gender' => $anc['gender'], 'portrait' => $anc['portrait']] : null,
        'ancestor2' => $anc2 ? ['id' => $b, 'name' => cous_name($anc2), 'first' => $anc2['first'], 'last' => $anc2['last'], 'gender' => $anc2['gender']] : null,
        'ref_id' => $ref ?: null, 'ref' => $refP ? ['id' => $ref, 'name' => cous_name($refP), 'first' => $refP['first'], 'gender' => $refP['gender']] : null,
        'date_text' => (string) $c['date_text'], 'place_id' => (int) $c['place_id'] ?: null, 'place_text' => $placeName, 'include_spouses' => (int) $c['include_spouses'] === 1,
        'options' => cous_options((string) $c['options_json']), 'branches' => $bl, 'guests' => $guests, 'hidden' => $hidden,
        'updated_at' => (string) $c['updated_at'], 'created_at' => (string) $c['created_at']];
}

/* ═════════ Écriture ═════════ */
function cous_person_ok(PDO $pdo, int $id): bool
{
    if ($id <= 0) { return false; }
    $p = cous_people($pdo, [$id])[$id] ?? null;
    return $p && !$p['priv'];
}

/** ajoute les invités trouvés qui ne sont pas encore là (ni retirés à la main) → ids ajoutés */
function cous_fill(PDO $pdo, int $id, int $a, int $b, bool $spouses): array
{
    $scan = cous_scan($pdo, $a, $b, $spouses);
    $have = [];
    $s = $pdo->prepare('SELECT person_id FROM cousinade_guests WHERE cousinade_id=? AND person_id IS NOT NULL');
    $s->execute([$id]);
    foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $pid) { $have[(int) $pid] = true; }
    $new = array_values(array_filter($scan['guests'], static fn($g) => !isset($have[$g['person_id']])));
    $contacts = cous_contacts($pdo, array_column($new, 'person_id'));
    $pos = (int) $pdo->query('SELECT COALESCE(MAX(position),0) FROM cousinade_guests WHERE cousinade_id=' . $id)->fetchColumn();
    $ins = $pdo->prepare('INSERT INTO cousinade_guests(cousinade_id, person_id, spouse_of, branch_id, first_name, last_name, gender, living_doubt, invited, foyer, address, postal_code, city, country, email, phone, added_by, position)
        VALUES(?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?)');
    $added = [];
    foreach (array_slice($new, 0, COUS_GUESTS_MAX) as $g) {
        $c = $contacts[$g['person_id']] ?? [];
        $ins->execute([$id, $g['person_id'], $g['spouse_of'], $g['branch_id'], $g['first'], $g['last'], $g['gender'], $g['doubt'], $g['foyer'],
            mb_substr($c['address'] ?? '', 0, 300), mb_substr($c['postal_code'] ?? '', 0, 20), mb_substr($c['city'] ?? '', 0, 120), mb_substr($c['country'] ?? '', 0, 80),
            mb_substr($c['email'] ?? '', 0, 200), mb_substr($c['phone'] ?? '', 0, 60), 'scan', ++$pos]);
        $added[] = (int) $pdo->lastInsertId();
    }
    return ['added' => $added, 'private' => $scan['private'], 'dead' => $scan['dead'], 'found' => count($scan['guests'])];
}

function cous_touch(PDO $pdo, int $id): void { $pdo->prepare('UPDATE cousinades SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$id]); }

function cous_save(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0);
    if ($id) { // une mise à jour : seuls les champs envoyés changent (renommer, changer la référence…)
        $old = cous_row($pdo, $id);
        $keep = ['title' => $old['title'], 'ancestor_id' => $old['ancestor_id'], 'ancestor2_id' => $old['ancestor2_id'], 'ref_id' => $old['ref_id'], 'date_text' => $old['date_text'],
            'place_id' => $old['place_id'], 'place_text' => $old['place_text'], 'include_spouses' => $old['include_spouses']];
        foreach ($keep as $k => $v) { if (!array_key_exists($k, $d)) { $d[$k] = $v ?? ''; } }
    }
    $title = cous_text($d['title'] ?? '', 160);
    $a = safe_int($d['ancestor_id'] ?? 0); $b = safe_int($d['ancestor2_id'] ?? 0); $ref = safe_int($d['ref_id'] ?? 0);
    if (!$id && !$a) { throw new LcndaBadInput('Choisis l’ancêtre (ou le couple) dont on réunit les descendants.'); }
    foreach ([[$a, 'L’ancêtre'], [$b, 'Le conjoint de l’ancêtre'], [$ref, 'La personne de référence']] as [$x, $what]) {
        if ($x && !cous_person_ok($pdo, $x)) { throw new LcndaBadInput("{$what} est introuvable (ou confidentielle)."); }
    }
    if ($b === $a) { $b = 0; }
    $date = cous_text($d['date_text'] ?? '', 120); $placeId = safe_int($d['place_id'] ?? 0); $placeText = cous_text($d['place_text'] ?? '', 200);
    if ($placeId) { $ps = $pdo->prepare('SELECT id FROM places WHERE id=?'); $ps->execute([$placeId]); if (!$ps->fetchColumn()) { $placeId = 0; } }
    $spouses = !array_key_exists('include_spouses', $d) || !empty($d['include_spouses']) ? 1 : 0;
    if ($id) {
        $a = $a ?: (int) $old['ancestor_id'];
        if ($title === '') { $title = (string) $old['title']; }
        $pdo->prepare('UPDATE cousinades SET title=?, ancestor_id=?, ancestor2_id=?, ref_id=?, date_text=?, place_id=?, place_text=?, include_spouses=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
            ->execute([$title, $a, $b ?: null, $ref ?: null, $date, $placeId ?: null, $placeText, $spouses, $id]);
        log_change($pdo, 'cousinade', $id, 'update', 'Cousinade modifiée : ' . $title, ['title' => $old['title']], ['title' => $title]);
        $fill = ((int) $old['ancestor_id'] !== $a || (int) $old['ancestor2_id'] !== $b || ((int) $old['include_spouses'] !== $spouses && $spouses)) ? cous_fill($pdo, $id, $a, $b, (bool) $spouses) : null;
        return ['id' => $id, 'fill' => $fill];
    }
    if ($title === '') { $p = cous_people($pdo, [$a])[$a]; $title = 'Cousinade ' . ($p['last'] !== '' ? mb_strtoupper($p['last']) : cous_name($p)); }
    $pdo->prepare('INSERT INTO cousinades(title, ancestor_id, ancestor2_id, ref_id, date_text, place_id, place_text, include_spouses) VALUES(?,?,?,?,?,?,?,?)')
        ->execute([$title, $a, $b ?: null, $ref ?: null, $date, $placeId ?: null, $placeText, $spouses]);
    $id = (int) $pdo->lastInsertId();
    $fill = cous_fill($pdo, $id, $a, $b, (bool) $spouses);
    log_change($pdo, 'cousinade', $id, 'create', 'Cousinade créée : ' . $title . ' (' . count($fill['added']) . ' invités trouvés)', null, ['id' => $id, 'title' => $title]);
    return ['id' => $id, 'fill' => $fill];
}

function cous_guest(PDO $pdo, int $cid, int $gid, bool $withDeleted = false): array
{
    $s = $pdo->prepare('SELECT * FROM cousinade_guests WHERE id=? AND cousinade_id=?' . ($withDeleted ? '' : ' AND deleted_at IS NULL'));
    $s->execute([$gid, $cid]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new LcndaBadInput('Invité introuvable.'); }
    return $r;
}

/** un invité : coordonnées, réponse, régime, note… (la fiche ne change pas, sauf « aussi dans le répertoire des vivants ») */
function cous_guest_save(PDO $pdo, array $d): array
{
    $cid = safe_int($d['cousinade_id'] ?? 0); cous_row($pdo, $cid);
    $gid = safe_int($d['id'] ?? 0);
    $vals = [];
    foreach (COUS_TEXT_FIELDS as $k => $max) { if (array_key_exists($k, $d)) { $vals[$k] = cous_text($d[$k], $max); } }
    if (isset($vals['email']) && $vals['email'] !== '' && !filter_var($vals['email'], FILTER_VALIDATE_EMAIL)) { throw new LcndaBadInput('Ce courriel n’a pas la bonne forme (exemple : prenom.nom@exemple.fr).'); }
    if (array_key_exists('answer', $d)) { $ans = cous_text($d['answer'], 10); if (!in_array($ans, COUS_ANSWERS, true)) { throw new LcndaBadInput('Réponse inconnue.'); } $vals['answer'] = $ans; }
    if (array_key_exists('people_count', $d)) { $n = $d['people_count'] === '' || $d['people_count'] === null ? null : safe_int($d['people_count']); if ($n !== null && ($n < 0 || $n > 99)) { throw new LcndaBadInput('Le nombre de personnes va de 0 à 99.'); } $vals['people_count'] = $n; }
    foreach (['invited', 'present'] as $k) { if (array_key_exists($k, $d)) { $vals[$k] = !empty($d[$k]) ? 1 : 0; } }
    if (array_key_exists('table_no', $d)) { $t = $d['table_no'] === '' || $d['table_no'] === null ? null : safe_int($d['table_no']); if ($t !== null && ($t < 1 || $t > 500)) { throw new LcndaBadInput('Le numéro de table va de 1 à 500.'); } $vals['table_no'] = $t; }
    if (array_key_exists('branch_id', $d)) { $bid = safe_int($d['branch_id']); $vals['branch_id'] = $bid > 0 ? $bid : null; }
    if ($gid) {
        $old = cous_guest($pdo, $cid, $gid);
        if (!(int) $old['person_id'] && isset($vals['first_name'], $vals['last_name']) && $vals['first_name'] === '' && $vals['last_name'] === '') { throw new LcndaBadInput('Donne au moins un prénom ou un nom.'); }
        if ((int) $old['person_id']) { unset($vals['first_name'], $vals['last_name']); } // le nom d'une fiche se change sur la fiche
        if ($vals) {
            $sets = implode(', ', array_map(static fn($k) => "$k=?", array_keys($vals)));
            $pdo->prepare("UPDATE cousinade_guests SET $sets, updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([...array_values($vals), $gid]);
        }
        $prev = array_intersect_key($old, $vals);
    } else {
        $pid = safe_int($d['person_id'] ?? 0);
        if ($pid && !cous_person_ok($pdo, $pid)) { throw new LcndaBadInput('Cette fiche est introuvable (ou confidentielle).'); }
        $p = $pid ? cous_people($pdo, [$pid])[$pid] : null;
        if (!$p && trim(($vals['first_name'] ?? '') . ($vals['last_name'] ?? '')) === '') { throw new LcndaBadInput('Donne au moins un prénom ou un nom.'); }
        if ($pid) { $dup = $pdo->prepare('SELECT id FROM cousinade_guests WHERE cousinade_id=? AND person_id=? AND deleted_at IS NULL'); $dup->execute([$cid, $pid]); if ($dup->fetchColumn()) { throw new LcndaBadInput('Cette personne est déjà dans la liste des invités.'); } }
        $c = $pid ? (cous_contacts($pdo, [$pid])[$pid] ?? []) : [];
        $row = array_merge(['first_name' => $p['first'] ?? '', 'last_name' => $p['last'] ?? '', 'address' => $c['address'] ?? '', 'postal_code' => $c['postal_code'] ?? '', 'city' => $c['city'] ?? '',
            'country' => $c['country'] ?? '', 'email' => $c['email'] ?? '', 'phone' => $c['phone'] ?? ''], array_filter($vals, static fn($v) => $v !== '' && $v !== null));
        if ($p) { $row['first_name'] = $p['first']; $row['last_name'] = $p['last']; }
        $row = array_merge($row, array_intersect_key($vals, array_flip(['answer', 'people_count', 'invited', 'present', 'table_no', 'branch_id'])));
        $row['gender'] = $p['gender'] ?? 'unknown';
        $pos = (int) $pdo->query('SELECT COALESCE(MAX(position),0)+1 FROM cousinade_guests WHERE cousinade_id=' . $cid)->fetchColumn();
        $cols = array_merge(['cousinade_id', 'person_id', 'added_by', 'position'], array_keys($row));
        $pdo->prepare('INSERT INTO cousinade_guests(' . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')
            ->execute(array_merge([$cid, $pid ?: null, 'hand', $pos], array_values($row)));
        $gid = (int) $pdo->lastInsertId();
        if (($row['foyer'] ?? '') === '') { $pdo->prepare('UPDATE cousinade_guests SET foyer=? WHERE id=?')->execute(['h' . $gid, $gid]); }
        $prev = null;
    }
    // « aussi dans le répertoire des vivants » : seulement si on l'a coché, et seulement pour une fiche
    $toFiche = !empty($d['to_contacts']);
    if ($toFiche) {
        $g = cous_guest($pdo, $cid, $gid);
        if ((int) $g['person_id']) { cous_push_contact($pdo, $g); }
    }
    cous_touch($pdo, $cid);
    return ['id' => $gid, 'prev' => $prev, 'contacts' => $toFiche];
}

function cous_push_contact(PDO $pdo, array $g): void
{
    $pid = (int) $g['person_id'];
    $s = $pdo->prepare('SELECT * FROM living_contacts WHERE person_id=? ORDER BY updated_at DESC, id DESC LIMIT 1');
    $s->execute([$pid]);
    $old = $s->fetch(PDO::FETCH_ASSOC);
    $vals = ['email' => $g['email'], 'phone_mobile' => $g['phone'], 'address' => $g['address'], 'postal_code' => $g['postal_code'], 'city' => $g['city'], 'country' => $g['country'] ?: 'France'];
    if ($old) {
        $pdo->prepare('UPDATE living_contacts SET email=?, phone_mobile=?, address=?, postal_code=?, city=?, country=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...array_values($vals), (int) $old['id']]);
        log_change($pdo, 'living_contact', (int) $old['id'], 'update', 'Contact mis à jour depuis la cousinade : ' . trim($g['first_name'] . ' ' . $g['last_name']), $old, $vals);
    } else {
        $pdo->prepare('INSERT INTO living_contacts(person_id, first_name, last_name, relationship, email, phone_mobile, address, postal_code, city, country, attendance_status, notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([$pid, $g['first_name'], $g['last_name'], 'Cousinade', ...array_values($vals), 'invited', '']);
        log_change($pdo, 'living_contact', (int) $pdo->lastInsertId(), 'create', 'Contact ajouté depuis la cousinade : ' . trim($g['first_name'] . ' ' . $g['last_name']), null, $vals);
    }
}

/** une même valeur (ou une valeur par invité) pour plusieurs invités → l'avant, pour « ↶ Annuler » */
function cous_guests_set(PDO $pdo, array $d): array
{
    $cid = safe_int($d['cousinade_id'] ?? 0); cous_row($pdo, $cid);
    $field = cous_text($d['field'] ?? '', 20);
    if (!in_array($field, COUS_SET_FIELDS, true)) { throw new LcndaBadInput('Champ inconnu.'); }
    $values = is_array($d['values'] ?? null) ? $d['values'] : null;
    $ids = $values !== null ? array_keys($values) : (is_array($d['ids'] ?? null) ? $d['ids'] : []);
    $ids = array_slice(array_values(array_unique(array_filter(array_map('intval', $ids)))), 0, COUS_GUESTS_MAX);
    $norm = static function ($v) use ($field) {
        if ($field === 'invited' || $field === 'present') { return !empty($v) ? 1 : 0; }
        if ($field === 'answer') { $v = cous_text($v, 10); if (!in_array($v, COUS_ANSWERS, true)) { throw new LcndaBadInput('Réponse inconnue.'); } return $v; }
        if ($field === 'foyer') { return cous_text($v, 60); }
        if ($v === null || $v === '') { return null; }
        $n = safe_int($v); if ($n < 1 || $n > ($field === 'table_no' ? 500 : PHP_INT_MAX)) { throw new LcndaBadInput('Valeur hors limites.'); }
        return $n;
    };
    $one = $values === null ? $norm($d['value'] ?? null) : null;
    $prev = [];
    $get = $pdo->prepare("SELECT $field FROM cousinade_guests WHERE id=? AND cousinade_id=? AND deleted_at IS NULL");
    $upd = $pdo->prepare("UPDATE cousinade_guests SET $field=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND cousinade_id=?");
    $own = !$pdo->inTransaction(); if ($own) { $pdo->beginTransaction(); }
    try {
        foreach ($ids as $gid) {
            $get->execute([$gid, $cid]); $old = $get->fetch(PDO::FETCH_NUM); if (!$old) { continue; }
            $prev[$gid] = $old[0];
            $upd->execute([$values !== null ? $norm($values[$gid] ?? $values[(string) $gid] ?? null) : $one, $gid, $cid]);
        }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own) { $pdo->rollBack(); } throw $e; }
    cous_touch($pdo, $cid);
    return ['field' => $field, 'prev' => (object) $prev, 'count' => count($prev)];
}

function cous_guests_delete(PDO $pdo, array $d, bool $restore): array
{
    $cid = safe_int($d['cousinade_id'] ?? 0); cous_row($pdo, $cid);
    $ids = array_slice(array_values(array_filter(array_map('intval', is_array($d['ids'] ?? null) ? $d['ids'] : [safe_int($d['id'] ?? 0)]))), 0, COUS_GUESTS_MAX);
    if (!$ids) { throw new LcndaBadInput('Aucun invité.'); }
    $in = implode(',', $ids);
    $st = $pdo->prepare("UPDATE cousinade_guests SET deleted_at=" . ($restore ? 'NULL' : 'CURRENT_TIMESTAMP') . " WHERE cousinade_id=? AND id IN ($in)");
    $st->execute([$cid]);
    cous_touch($pdo, $cid);
    return ['ids' => $ids, 'count' => $st->rowCount()];
}

/** « ↶ Annuler » une recherche ou un import : retire pour de bon les lignes ajoutées (seulement celles-là) */
function cous_guests_purge(PDO $pdo, array $d): array
{
    $cid = safe_int($d['cousinade_id'] ?? 0); cous_row($pdo, $cid);
    $ids = array_slice(array_values(array_filter(array_map('intval', is_array($d['ids'] ?? null) ? $d['ids'] : []))), 0, COUS_GUESTS_MAX);
    if (!$ids) { return ['count' => 0]; }
    $st = $pdo->prepare('DELETE FROM cousinade_guests WHERE cousinade_id=? AND added_by IN (\'scan\',\'import\') AND id IN (' . implode(',', $ids) . ')');
    $st->execute([$cid]);
    cous_touch($pdo, $cid);
    return ['count' => $st->rowCount()];
}

/** ⤒ Importer une liste (un tableau déjà lu par le navigateur) : met à jour les invités de même nom, ajoute les autres */
function cous_import(PDO $pdo, array $d): array
{
    $cid = safe_int($d['cousinade_id'] ?? 0); cous_row($pdo, $cid);
    $rows = is_array($d['rows'] ?? null) ? array_slice($d['rows'], 0, COUS_GUESTS_MAX) : [];
    if (!$rows) { throw new LcndaBadInput('Aucune ligne à importer.'); }
    $fold = static fn($s) => strtolower(trim((string) preg_replace('/[^a-z0-9]+/i', ' ', ascii_fold((string) $s))));
    $s = $pdo->prepare('SELECT * FROM cousinade_guests WHERE cousinade_id=? AND deleted_at IS NULL');
    $s->execute([$cid]);
    $byName = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $g) {
        $pid = (int) $g['person_id'];
        $p = $pid ? (cous_people($pdo, [$pid])[$pid] ?? null) : null;
        if ($p && $p['priv']) { continue; }
        $k = $fold(($p['first'] ?? $g['first_name']) . ' ' . ($p['last'] ?? $g['last_name']));
        $byName[$k] = $g;
    }
    $added = []; $updated = []; $pos = (int) $pdo->query('SELECT COALESCE(MAX(position),0) FROM cousinade_guests WHERE cousinade_id=' . $cid)->fetchColumn();
    $own = !$pdo->inTransaction(); if ($own) { $pdo->beginTransaction(); }
    try {
        foreach ($rows as $r) {
            if (!is_array($r)) { continue; }
            $vals = [];
            foreach (COUS_TEXT_FIELDS as $k => $max) { if (isset($r[$k]) && is_scalar($r[$k])) { $v = cous_text($r[$k], $max); if ($v !== '') { $vals[$k] = $v; } } }
            if (isset($vals['email']) && !filter_var($vals['email'], FILTER_VALIDATE_EMAIL)) { unset($vals['email']); }
            if (isset($r['answer']) && in_array($r['answer'], COUS_ANSWERS, true) && $r['answer'] !== '') { $vals['answer'] = $r['answer']; }
            if (isset($r['people_count']) && is_numeric($r['people_count'])) { $n = (int) $r['people_count']; if ($n >= 0 && $n <= 99) { $vals['people_count'] = $n; } }
            if (($vals['first_name'] ?? '') === '' && ($vals['last_name'] ?? '') === '') { continue; }
            $k = $fold(($vals['first_name'] ?? '') . ' ' . ($vals['last_name'] ?? ''));
            if (isset($byName[$k])) {
                $g = $byName[$k]; unset($vals['first_name'], $vals['last_name']);
                if (!$vals) { continue; }
                $sets = implode(', ', array_map(static fn($c) => "$c=?", array_keys($vals)));
                $pdo->prepare("UPDATE cousinade_guests SET $sets, updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([...array_values($vals), (int) $g['id']]);
                $updated[] = ['id' => (int) $g['id'], 'prev' => array_intersect_key($g, $vals)];
                continue;
            }
            $cols = array_merge(['cousinade_id', 'added_by', 'position'], array_keys($vals));
            $pdo->prepare('INSERT INTO cousinade_guests(' . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute(array_merge([$cid, 'import', ++$pos], array_values($vals)));
            $nid = (int) $pdo->lastInsertId();
            if (($vals['foyer'] ?? '') === '') { $pdo->prepare('UPDATE cousinade_guests SET foyer=? WHERE id=?')->execute(['h' . $nid, $nid]); }
            $added[] = $nid; $byName[$k] = ['id' => $nid] + $vals;
        }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own) { $pdo->rollBack(); } throw $e; }
    cous_touch($pdo, $cid);
    return ['added' => $added, 'updated' => $updated];
}

/** « ↶ Annuler » un import : les lignes modifiées reprennent leurs anciennes valeurs (champs connus seulement) */
function cous_import_undo(PDO $pdo, array $d): array
{
    $cid = safe_int($d['cousinade_id'] ?? 0); cous_row($pdo, $cid);
    $n = cous_guests_purge($pdo, ['cousinade_id' => $cid, 'ids' => $d['added'] ?? []])['count'];
    $allowed = array_merge(array_keys(COUS_TEXT_FIELDS), ['answer', 'people_count']);
    foreach (array_slice(is_array($d['updated'] ?? null) ? $d['updated'] : [], 0, COUS_GUESTS_MAX) as $u) {
        if (!is_array($u) || !is_array($u['prev'] ?? null)) { continue; }
        $vals = array_intersect_key($u['prev'], array_flip($allowed));
        if (isset($vals['answer']) && !in_array($vals['answer'], COUS_ANSWERS, true)) { unset($vals['answer']); }
        $vals = array_map(static fn($v) => is_scalar($v) || $v === null ? $v : '', $vals);
        if (!$vals) { continue; }
        $sets = implode(', ', array_map(static fn($c) => "$c=?", array_keys($vals)));
        $pdo->prepare("UPDATE cousinade_guests SET $sets WHERE id=? AND cousinade_id=?")->execute([...array_values($vals), safe_int($u['id'] ?? 0), $cid]);
        $n++;
    }
    return ['count' => $n];
}

/** des réglages du projet (couleurs des branches, invitation, badges, tables, album, arbre) : clés connues seulement */
function cous_options_save(PDO $pdo, array $d): array
{
    $cid = safe_int($d['id'] ?? 0); $c = cous_row($pdo, $cid);
    $opt = cous_options((string) $c['options_json']);
    $patch = is_array($d['patch'] ?? null) ? $d['patch'] : [];
    foreach ($patch as $k => $v) {
        if (!in_array($k, COUS_OPTION_KEYS, true)) { continue; }
        if ($k === 'branchColors') { $v = is_array($v) ? array_filter(array_map(static fn($x) => is_string($x) && preg_match('/^#[0-9a-f]{6}$/i', $x) ? $x : null, $v)) : []; $v = array_slice($v, 0, 200, true); }
        elseif ($k === 'album') {
            $ids = array_slice(array_values(array_unique(array_filter(array_map(static fn($x) => is_array($x) ? safe_int($x['id'] ?? 0) : safe_int($x), is_array($v) ? $v : [])))), 0, 500);
            $v = [];
            if ($ids) { foreach ($pdo->query('SELECT id, filename, title FROM media WHERE id IN (' . implode(',', $ids) . ')')->fetchAll(PDO::FETCH_ASSOC) as $m) { $v[(int) $m['id']] = ['id' => (int) $m['id'], 'filename' => (string) $m['filename'], 'title' => (string) $m['title']]; } }
            $v = array_values(array_filter(array_map(static fn($i) => $v[$i] ?? null, $ids)));
        } else {
            $v = json_decode((string) json_encode($v), true);
            if (strlen((string) json_encode($v)) > 20000) { throw new LcndaBadInput('Réglage trop long.'); }
        }
        $opt[$k] = $v;
    }
    $pdo->prepare('UPDATE cousinades SET options_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([json_encode($opt, JSON_UNESCAPED_UNICODE), $cid]);
    return ['id' => $cid, 'options' => $opt, 'prev' => cous_options((string) $c['options_json'])];
}

function cousinade_api_get(PDO $pdo, array $g): array
{
    if (cous_kiosk()) { throw new RuntimeException('Mode consultation : les cousinades (adresses des vivants) ne se montrent pas.'); }
    if (!cous_ready($pdo)) { cousinade_schema($pdo); }
    $op = scalar_text($g['op'] ?? 'list', 'op');
    return match ($op) {
        'list' => ['items' => cousinade_list($pdo)],
        'get' => cousinade_get($pdo, safe_int($g['id'] ?? 0)),
        'preview' => (static function () use ($pdo, $g) {
            $a = safe_int($g['ancestor_id'] ?? 0); $b = safe_int($g['ancestor2_id'] ?? 0);
            if (!cous_person_ok($pdo, $a)) { throw new LcndaBadInput('Choisis l’ancêtre.'); }
            if ($b && !cous_person_ok($pdo, $b)) { $b = 0; }
            $s = cous_scan($pdo, $a, $b, ($g['spouses'] ?? '1') !== '0');
            $branches = []; foreach ($s['guests'] as $x) { if (!$x['spouse_of']) { $branches[$x['branch_id']] = ($branches[$x['branch_id']] ?? 0) + 1; } }
            return ['found' => count($s['guests']), 'descendants' => count(array_filter($s['guests'], static fn($x) => !$x['spouse_of'])), 'doubt' => count(array_filter($s['guests'], static fn($x) => $x['doubt'])),
                'private' => $s['private'], 'dead' => $s['dead'], 'branches' => count($branches)];
        })(),
        default => throw new LcndaBadInput('Demande inconnue.'),
    };
}

function cousinade_api_post(PDO $pdo, array $d): array
{
    if (cous_kiosk()) { throw new RuntimeException('Mode consultation : rien ne peut être modifié.'); }
    if (!cous_ready($pdo)) { cousinade_schema($pdo); }
    $op = scalar_text($d['op'] ?? '', 'op');
    return match ($op) {
        'save' => cous_save($pdo, $d),
        'delete', 'restore' => (static function () use ($pdo, $d, $op) {
            $id = safe_int($d['id'] ?? 0); $c = cous_row($pdo, $id, true);
            $pdo->prepare('UPDATE cousinades SET deleted_at=' . ($op === 'delete' ? 'CURRENT_TIMESTAMP' : 'NULL') . ' WHERE id=?')->execute([$id]);
            log_change($pdo, 'cousinade', $id, $op === 'delete' ? 'delete' : 'update', ($op === 'delete' ? 'Cousinade supprimée : ' : 'Cousinade rétablie : ') . $c['title']);
            return ['id' => $id];
        })(),
        'rescan' => (static function () use ($pdo, $d) {
            $id = safe_int($d['id'] ?? 0); $c = cous_row($pdo, $id);
            $r = cous_fill($pdo, $id, (int) $c['ancestor_id'], (int) $c['ancestor2_id'], (int) $c['include_spouses'] === 1);
            cous_touch($pdo, $id);
            return $r;
        })(),
        'guest_save' => cous_guest_save($pdo, $d),
        'guests_set' => cous_guests_set($pdo, $d),
        'guests_delete' => cous_guests_delete($pdo, $d, false),
        'guests_restore' => cous_guests_delete($pdo, $d, true),
        'guests_purge' => cous_guests_purge($pdo, $d),
        'import' => cous_import($pdo, $d),
        'import_undo' => cous_import_undo($pdo, $d),
        'options' => cous_options_save($pdo, $d),
        default => throw new LcndaBadInput('Demande inconnue.'),
    };
}
