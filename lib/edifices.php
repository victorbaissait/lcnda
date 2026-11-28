<?php
declare(strict_types=1);

/**
 * 🏰⛪ Fiches des édifices : un château (manoir, maison forte, tour…) ou un lieu de culte (église, chapelle, abbaye, prieuré,
 * temple, synagogue, mosquée…), rattaché à une commune, relié aux personnes et aux actes de l'arbre.
 * Maquette validée : docs/design/fiche-chateau-culte.html. Écran : assets/js/heritage-fiche-edifice.js (+ assets/css/fiche-edifice.css).
 *
 * Tables (créées à la première demande, dans la base de la généalogie : sauvegardes et copies comme le reste) :
 *  - sites           : la fiche (sorte, nom, commune, position, dates, état, culte, saint patron, diocèse, Q Wikidata, réf. Mérimée,
 *                      image Commons, histoire et note à soi) ;
 *  - site_people     : seigneurs, propriétaires, curés, abbés, pasteurs, rabbins, imams… (une personne de l'arbre ou un nom), années, source ;
 *  - site_registers  : les registres ou archives tenus là (BMS, catholicité, chartrier…) → service d'archives, cote, lien ;
 *  - site_events     : « l'acte s'est passé dans cet édifice » (un acte → une fiche ; l'adresse en texte libre de l'acte ne change pas).
 * Rien n'est recopié de Wikidata sans un clic : la fiche garde le numéro Q et ce que l'utilisateur a choisi de garder.
 * Chaque changement renvoie de quoi le défaire (↶ Annuler côté écran) : ed_restore remet une fiche effacée telle quelle.
 *
 *   GET  ed_list [place_id, insee]  → {sites:[…]}                     (pour les listes, la commune, la carte)
 *   GET  ed_get id                  → {site, people, registers, events, proposed, clergy_hints}
 *   GET  ed_person id               → {events:{event_id: lien}, unlinked:[…], roles:[…]} (fiche d'une personne)
 *   POST ed_save, ed_delete, ed_restore, ed_people_save, ed_people_delete, ed_reg_save, ed_reg_delete, ed_link
 */

const ED_CASTLE_KINDS = ['chateau', 'chateau_fort', 'forteresse', 'manoir', 'maison_forte', 'tour', 'motte'];
const ED_WORSHIP_KINDS = ['eglise', 'chapelle', 'collegiale', 'cathedrale', 'basilique', 'abbaye', 'prieure', 'monastere', 'couvent', 'commanderie', 'temple', 'synagogue', 'mosquee'];
const ED_STATES = ['', 'debout', 'restaure', 'ruine', 'disparu', 'transforme'];
const ED_CULTS = ['', 'catholique', 'protestant', 'orthodoxe', 'juif', 'musulman', 'autre'];
/** les mots d'un acte qui font penser à un édifice (adresse, description) */
const ED_ADDR_RE = '/\b(ch[aâ]teau|castel|manoir|maison forte|[eé]glise|chapelle|abbaye|prieur[eé]|monast[eè]re|couvent|coll[eé]giale|cath[eé]drale|basilique|temple|synagogue|mosqu[eé]e)\b/iu';
/** les métiers de l'arbre qui font un curé, un pasteur, un seigneur… (pour les proposer sur la fiche) */
const ED_ROLE_RE = [
    'church' => '/\b(cur[eé]|vicaire|desservant|chapelain|pr[eê]tre|recteur|chanoine|aum[oô]nier|abb[eé])\b/iu',
    'abbey' => '/\b(abb[eé]|abbesse|prieur|prieure|moine|moniale|religieu(x|se)|fr[eè]re|s(oe|œ)ur|chanoine)\b/iu',
    'temple' => '/\b(pasteur|ancien du consistoire|proposant)\b/iu',
    'synagogue' => '/\b(rabbin|ministre officiant|mohel|chantre|hazan)\b/iu',
    'mosquee' => '/\b(imam|muezzin)\b/iu',
    'castle' => '/\b(seigneur|dame de|baron(ne)?|comte(sse)?|marquis(e)?|vicomte(sse)?|ch[aâ]telain(e)?|r[eé]gisseur|intendant|garde du ch[aâ]teau)\b/iu',
];

function ed_tables(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS sites (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL DEFAULT 'eglise', name TEXT NOT NULL DEFAULT '',
        place_id INTEGER, insee TEXT NOT NULL DEFAULT '', commune TEXT NOT NULL DEFAULT '', lat REAL, lon REAL,
        built_from INTEGER, built_to INTEGER, gone_year INTEGER, state TEXT NOT NULL DEFAULT '', cult TEXT NOT NULL DEFAULT '',
        patron_saint TEXT NOT NULL DEFAULT '', diocese TEXT NOT NULL DEFAULT '', protection TEXT NOT NULL DEFAULT '', visit INTEGER NOT NULL DEFAULT 0,
        wikidata TEXT NOT NULL DEFAULT '', merimee TEXT NOT NULL DEFAULT '', wikipedia TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '',
        history TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', origin TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_sites_place ON sites(place_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_sites_insee ON sites(insee)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS site_people (id INTEGER PRIMARY KEY AUTOINCREMENT, site_id INTEGER NOT NULL, person_id INTEGER,
        name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT '', year_from INTEGER, year_to INTEGER, source_url TEXT NOT NULL DEFAULT '',
        source_label TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_site_people_site ON site_people(site_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_site_people_person ON site_people(person_id)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS site_registers (id INTEGER PRIMARY KEY AUTOINCREMENT, site_id INTEGER NOT NULL, what TEXT NOT NULL DEFAULT '',
        year_from INTEGER, year_to INTEGER, archive_service_id INTEGER, cote TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_site_registers_site ON site_registers(site_id)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS site_events (event_id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_site_events_site ON site_events(site_id)');
    $done = true;
}

function ed_bad(string $m): never { throw new LcndaBadInput($m); }
function ed_group(string $kind): string
{
    if (in_array($kind, ED_CASTLE_KINDS, true)) { return 'castle'; }
    if (in_array($kind, ['abbaye', 'prieure', 'monastere', 'couvent', 'commanderie'], true)) { return 'abbey'; }
    if (in_array($kind, ['temple', 'synagogue', 'mosquee'], true)) { return $kind; }
    return 'church';
}
function ed_year(mixed $v): ?int
{
    if ($v === null || $v === '' || !is_numeric($v)) { return null; }
    $y = (int) round((float) $v);
    return $y < -3000 || $y > 2100 ? null : $y;
}
function ed_str(mixed $v, int $max = 400): string { return mb_substr(trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', (string) ($v ?? '')) ?? ''), 0, $max); }
function ed_url(mixed $v): string
{
    $u = ed_str($v, 1000);
    return $u !== '' && preg_match('#^https?://#i', $u) ? $u : '';
}
function ed_fold(string $s): string
{
    $s = mb_strtolower($s);
    $s = strtr($s, ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'œ' => 'oe', 'æ' => 'ae', '’' => ' ', "'" => ' ']);
    $s = trim(preg_replace('/[^a-z0-9]+/', ' ', $s) ?? '');
    return preg_replace(['/\bst\b/', '/\bste\b/'], ['saint', 'sainte'], $s) ?? $s;
}
/** la partie « qui distingue » d'un nom d'édifice : « Église Saint-Martin » → « saint martin » ; « Château de Fléville » → « fleville » */
function ed_key(string $name): string
{
    $w = array_filter(explode(' ', ed_fold($name)), static fn($x) => $x !== '' && !in_array($x, ['eglise', 'chapelle', 'chateau', 'fort', 'manoir', 'maison', 'forte', 'abbaye', 'prieure', 'monastere', 'couvent',
        'collegiale', 'cathedrale', 'basilique', 'temple', 'protestant', 'reforme', 'synagogue', 'mosquee', 'paroissiale', 'tour', 'motte', 'castrale', 'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'en', 'et', 'a', 'au', 'aux'], true));
    return implode(' ', $w);
}
/** tous les mots de la clé sont-ils dans le texte ? */
function ed_has_key(string $txt, string $key): bool
{
    if ($key === '') { return false; }
    foreach (explode(' ', $key) as $w) { if (!preg_match('/\b' . preg_quote($w, '/') . '\b/', $txt)) { return false; } }
    return true;
}

function ed_row(array $r): array
{
    $int = static fn($v) => $v === null ? null : (int) $v;
    $flt = static fn($v) => $v === null ? null : (float) $v;
    return ['id' => (int) $r['id'], 'kind' => (string) $r['kind'], 'group' => ed_group((string) $r['kind']), 'name' => (string) $r['name'],
        'place_id' => $int($r['place_id']), 'place_name' => (string) ($r['place_name'] ?? ''), 'county' => (string) ($r['county'] ?? ''), 'insee' => (string) $r['insee'], 'commune' => (string) $r['commune'],
        'lat' => $flt($r['lat']), 'lon' => $flt($r['lon']), 'built_from' => $int($r['built_from']), 'built_to' => $int($r['built_to']), 'gone_year' => $int($r['gone_year']),
        'state' => (string) $r['state'], 'cult' => (string) $r['cult'], 'patron_saint' => (string) $r['patron_saint'], 'diocese' => (string) $r['diocese'],
        'protection' => (string) $r['protection'], 'visit' => (int) $r['visit'], 'wikidata' => (string) $r['wikidata'], 'merimee' => (string) $r['merimee'],
        'wikipedia' => (string) $r['wikipedia'], 'image' => (string) $r['image'], 'history' => (string) $r['history'], 'notes' => (string) $r['notes'], 'origin' => (string) $r['origin'],
        'n_events' => isset($r['n_events']) ? (int) $r['n_events'] : null, 'n_people' => isset($r['n_people']) ? (int) $r['n_people'] : null,
        'created_at' => (string) $r['created_at'], 'updated_at' => (string) $r['updated_at']];
}
const ED_SELECT = 'SELECT s.*, p.name AS place_name, p.county AS county, (SELECT COUNT(*) FROM site_events e JOIN events ev ON ev.id=e.event_id WHERE e.site_id=s.id) AS n_events,
    (SELECT COUNT(*) FROM site_people x WHERE x.site_id=s.id) AS n_people FROM sites s LEFT JOIN places p ON p.id=s.place_id';

function ed_site(PDO $pdo, int $id): ?array
{
    ed_tables($pdo);
    $s = $pdo->prepare(ED_SELECT . ' WHERE s.id=?'); $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    return $r ? ed_row($r) : null;
}

/** les communes d'une fiche : son lieu + les lieux de la base qui ont le même code INSEE */
function ed_place_ids(PDO $pdo, array $site): array
{
    $ids = [];
    if ($site['place_id']) { $ids[] = (int) $site['place_id']; }
    if ($site['insee'] !== '') { $s = $pdo->prepare('SELECT id FROM places WHERE admin4_code=?'); $s->execute([$site['insee']]); foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $i) { $ids[] = (int) $i; } }
    return array_values(array_unique($ids));
}

function ed_person_name(array $r, string $p = ''): string { return trim(((string) ($r[$p . 'first_name'] ?? '')) . ' ' . ((string) ($r[$p . 'last_name'] ?? ''))); }

/** un acte, prêt pour l'écran : qui, quoi, quand, où, adresse */
function ed_event_rows(PDO $pdo, string $where, array $args, int $limit = 400): array
{
    $sql = "SELECT ev.id, ev.scope, ev.person_id, ev.family_id, ev.year, ev.date_text, ev.sort_date, ev.address, ev.description, ev.place_id, ev.is_private,
            t.label AS type_label, t.gedcom_tag AS tag, pl.name AS place_name,
            p.first_name, p.last_name, a.id AS a_id, a.first_name AS a_first_name, a.last_name AS a_last_name, b.id AS b_id, b.first_name AS b_first_name, b.last_name AS b_last_name, se.site_id
        FROM events ev JOIN event_types t ON t.id=ev.event_type_id LEFT JOIN places pl ON pl.id=ev.place_id
        LEFT JOIN persons p ON ev.scope='person' AND p.id=ev.person_id
        LEFT JOIN families f ON ev.scope='family' AND f.id=ev.family_id LEFT JOIN persons a ON a.id=f.partner1_id LEFT JOIN persons b ON b.id=f.partner2_id
        LEFT JOIN site_events se ON se.event_id=ev.id
        WHERE $where ORDER BY COALESCE(ev.sort_date, ev.year) LIMIT $limit";
    $s = $pdo->prepare($sql); $s->execute($args);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $people = $r['scope'] === 'person' ? [['id' => (int) $r['person_id'], 'name' => ed_person_name($r)]]
            : array_values(array_filter([$r['a_id'] ? ['id' => (int) $r['a_id'], 'name' => ed_person_name($r, 'a_')] : null, $r['b_id'] ? ['id' => (int) $r['b_id'], 'name' => ed_person_name($r, 'b_')] : null]));
        $out[] = ['id' => (int) $r['id'], 'tag' => (string) $r['tag'], 'type' => (string) $r['type_label'], 'year' => $r['year'] === null ? null : (int) $r['year'], 'date' => (string) $r['date_text'],
            'address' => (string) $r['address'], 'description' => (string) $r['description'], 'place' => (string) ($r['place_name'] ?? ''), 'place_id' => $r['place_id'] === null ? null : (int) $r['place_id'],
            'people' => $people, 'site_id' => $r['site_id'] === null ? null : (int) $r['site_id'], 'private' => (int) $r['is_private']];
    }
    return $out;
}

function ed_list(PDO $pdo, array $q): array
{
    ed_tables($pdo);
    $where = []; $args = [];
    $pid = safe_int($q['place_id'] ?? 0); $insee = strtoupper(trim((string) ($q['insee'] ?? '')));
    if ($pid > 0 || $insee !== '') {
        $or = [];
        if ($pid > 0) { $or[] = 's.place_id=?'; $args[] = $pid; }
        if ($insee !== '' && preg_match('/^[0-9][0-9AB][0-9]{3}$/', $insee)) { $or[] = 's.insee=?'; $args[] = $insee; $or[] = 's.place_id IN (SELECT id FROM places WHERE admin4_code=?)'; $args[] = $insee; }
        if ($or) { $where[] = '(' . implode(' OR ', $or) . ')'; }
    }
    $s = $pdo->prepare(ED_SELECT . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY s.name COLLATE NOCASE'); $s->execute($args);
    return ['ok' => true, 'sites' => array_map('ed_row', $s->fetchAll(PDO::FETCH_ASSOC))];
}

function ed_get(PDO $pdo, int $id): array
{
    $site = ed_site($pdo, $id);
    if (!$site) { ed_bad('Cette fiche n’existe plus.'); }
    $s = $pdo->prepare('SELECT x.*, p.first_name, p.last_name, p.id AS pid FROM site_people x LEFT JOIN persons p ON p.id=x.person_id WHERE x.site_id=? ORDER BY COALESCE(x.year_from, x.year_to, 9999), x.id'); $s->execute([$id]);
    $people = array_map(static fn($r) => ['id' => (int) $r['id'], 'person_id' => $r['pid'] === null ? null : (int) $r['pid'], 'person_name' => $r['pid'] === null ? '' : ed_person_name($r),
        'name' => (string) $r['name'], 'role' => (string) $r['role'], 'year_from' => $r['year_from'] === null ? null : (int) $r['year_from'], 'year_to' => $r['year_to'] === null ? null : (int) $r['year_to'],
        'source_url' => (string) $r['source_url'], 'source_label' => (string) $r['source_label'], 'note' => (string) $r['note']], $s->fetchAll(PDO::FETCH_ASSOC));
    $hasAs = (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='archive_services'")->fetchColumn();
    $s = $pdo->prepare($hasAs ? 'SELECT r.*, a.name AS service_name, a.website_url AS service_url FROM site_registers r LEFT JOIN archive_services a ON a.id=r.archive_service_id WHERE r.site_id=? ORDER BY COALESCE(r.year_from, 9999), r.id'
        : "SELECT r.*, '' AS service_name, '' AS service_url FROM site_registers r WHERE r.site_id=? ORDER BY COALESCE(r.year_from, 9999), r.id"); $s->execute([$id]);
    $registers = array_map(static fn($r) => ['id' => (int) $r['id'], 'what' => (string) $r['what'], 'year_from' => $r['year_from'] === null ? null : (int) $r['year_from'], 'year_to' => $r['year_to'] === null ? null : (int) $r['year_to'],
        'archive_service_id' => $r['archive_service_id'] === null ? null : (int) $r['archive_service_id'], 'service_name' => (string) ($r['service_name'] ?? ''), 'service_url' => (string) ($r['service_url'] ?? ''),
        'cote' => (string) $r['cote'], 'url' => (string) $r['url'], 'note' => (string) $r['note']], $s->fetchAll(PDO::FETCH_ASSOC));
    $events = ed_event_rows($pdo, 'se.site_id=?', [$id]);
    // proposés : les actes de la même commune dont l'adresse (ou la description) parle de cet édifice, pas encore reliés
    $proposed = []; $hints = [];
    $pids = ed_place_ids($pdo, $site);
    if ($pids) {
        $in = implode(',', array_fill(0, count($pids), '?'));
        $key = ed_key($site['name']);
        $cand = ed_event_rows($pdo, "ev.place_id IN ($in) AND se.site_id IS NULL AND (TRIM(COALESCE(ev.address,''))<>'' OR TRIM(COALESCE(ev.description,''))<>'')", $pids, 2000);
        $ks = $pdo->query('SELECT kind FROM sites WHERE ' . ($site['insee'] !== '' ? 'insee=' . $pdo->quote($site['insee']) . ' OR ' : '') . 'place_id IN (' . implode(',', array_map('intval', $pids)) . ')')->fetchAll(PDO::FETCH_COLUMN);
        $nSites = count(array_filter($ks, static fn($k) => ed_group((string) $k) === $site['group']));
        $kindWord = ['castle' => 'chateau|castel|manoir|maison forte', 'church' => 'eglise|chapelle|collegiale|cathedrale|basilique', 'abbey' => 'abbaye|prieure|monastere|couvent', 'temple' => 'temple', 'synagogue' => 'synagogue', 'mosquee' => 'mosquee'][$site['group']];
        foreach ($cand as $e) {
            $txt = ed_fold($e['address'] . ' ' . $e['description']);
            $hitKey = ed_has_key($txt, $key);
            $hitKind = (bool) preg_match('/\b(' . $kindWord . ')\b/', $txt);
            if ($hitKind && ($hitKey || $nSites <= 1)) { $proposed[] = $e + ['why' => $hitKey ? 'nom' : 'sorte']; }
            if (count($proposed) >= 60) { break; }
        }
        // dans l'arbre : des personnes de cette commune dont le métier dit « curé », « pasteur », « seigneur »… (à confirmer)
        $re = ED_ROLE_RE[$site['group']] ?? ED_ROLE_RE['church'];
        $known = array_filter(array_map(static fn($p) => $p['person_id'], $people));
        $s = $pdo->prepare("SELECT DISTINCT p.id, p.first_name, p.last_name, p.occupation, MIN(ev.year) AS y0, MAX(ev.year) AS y1 FROM persons p JOIN events ev ON ev.person_id=p.id AND ev.scope='person'
            WHERE ev.place_id IN ($in) AND TRIM(COALESCE(p.occupation,''))<>'' GROUP BY p.id LIMIT 3000"); $s->execute($pids);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { if (!in_array((int) $r['id'], $known, true) && preg_match($re, (string) $r['occupation'])) { $hints[] = ['person_id' => (int) $r['id'], 'name' => ed_person_name($r), 'occupation' => (string) $r['occupation'], 'y0' => $r['y0'] === null ? null : (int) $r['y0'], 'y1' => $r['y1'] === null ? null : (int) $r['y1']]; } }
        $s = $pdo->prepare("SELECT DISTINCT p.id, p.first_name, p.last_name, ev.description, ev.year FROM events ev JOIN event_types t ON t.id=ev.event_type_id AND t.gedcom_tag='OCCU' JOIN persons p ON p.id=ev.person_id
            WHERE ev.place_id IN ($in) LIMIT 3000"); $s->execute($pids);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $id2 = (int) $r['id'];
            if (in_array($id2, $known, true) || array_filter($hints, static fn($h) => $h['person_id'] === $id2) || !preg_match($re, (string) $r['description'])) { continue; }
            $hints[] = ['person_id' => $id2, 'name' => ed_person_name($r), 'occupation' => (string) $r['description'], 'y0' => $r['year'] === null ? null : (int) $r['year'], 'y1' => $r['year'] === null ? null : (int) $r['year']];
        }
    }
    return ['ok' => true, 'site' => $site, 'people' => $people, 'registers' => $registers, 'events' => $events, 'proposed' => $proposed, 'clergy_hints' => array_slice($hints, 0, 30)];
}

/** la fiche d'une personne : ses actes reliés à un édifice, ceux qui pourraient l'être, ses rôles (seigneur de…, curé de…) */
function ed_person(PDO $pdo, int $pid): array
{
    ed_tables($pdo);
    $evs = ed_event_rows($pdo, "(ev.scope='person' AND ev.person_id=?) OR (ev.scope='family' AND ev.family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?))", [$pid, $pid, $pid]);
    $siteIds = array_values(array_unique(array_filter(array_map(static fn($e) => $e['site_id'], $evs))));
    $sites = [];
    foreach ($siteIds as $sid) { $x = ed_site($pdo, $sid); if ($x) { $sites[$sid] = $x; } }
    $clergy = [];
    if ($siteIds) {
        $s = $pdo->prepare('SELECT x.*, p.first_name, p.last_name, p.id AS pid FROM site_people x LEFT JOIN persons p ON p.id=x.person_id WHERE x.site_id IN (' . implode(',', array_map('intval', $siteIds)) . ')');
        $s->execute();
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $clergy[(int) $r['site_id']][] = ['person_id' => $r['pid'] === null ? null : (int) $r['pid'], 'name' => $r['pid'] ? ed_person_name($r) : (string) $r['name'], 'role' => (string) $r['role'],
            'year_from' => $r['year_from'] === null ? null : (int) $r['year_from'], 'year_to' => $r['year_to'] === null ? null : (int) $r['year_to']]; }
    }
    $linked = []; $unlinked = [];
    foreach ($evs as $e) {
        if ($e['site_id'] && isset($sites[$e['site_id']])) {
            $st = $sites[$e['site_id']];
            $who = array_values(array_filter($clergy[$st['id']] ?? [], static fn($c) => $e['year'] !== null && $st['group'] !== 'castle' && ($c['year_from'] ?? -9999) <= $e['year'] && $e['year'] <= ($c['year_to'] ?? $c['year_from'] ?? 9999)
                && ($c['year_from'] !== null || $c['year_to'] !== null)));
            $linked[(string) $e['id']] = ['site_id' => $st['id'], 'name' => $st['name'], 'kind' => $st['kind'], 'group' => $st['group'], 'people' => array_slice($who, 0, 2)];
        } elseif (preg_match(ED_ADDR_RE, $e['address'] . ' ' . $e['description'])) { $unlinked[] = ['event_id' => $e['id'], 'address' => $e['address'] ?: $e['description'], 'place_id' => $e['place_id'], 'place' => $e['place']]; }
    }
    $s = $pdo->prepare('SELECT x.*, s.name AS site_name, s.kind AS site_kind, s.image AS site_image, s.built_from, s.state FROM site_people x JOIN sites s ON s.id=x.site_id WHERE x.person_id=? ORDER BY COALESCE(x.year_from, 9999)'); $s->execute([$pid]);
    $roles = array_map(static fn($r) => ['id' => (int) $r['id'], 'site_id' => (int) $r['site_id'], 'site_name' => (string) $r['site_name'], 'kind' => (string) $r['site_kind'], 'group' => ed_group((string) $r['site_kind']),
        'role' => (string) $r['role'], 'year_from' => $r['year_from'] === null ? null : (int) $r['year_from'], 'year_to' => $r['year_to'] === null ? null : (int) $r['year_to'], 'image' => (string) $r['site_image'],
        'source_url' => (string) $r['source_url']], $s->fetchAll(PDO::FETCH_ASSOC));
    return ['ok' => true, 'events' => (object) $linked, 'unlinked' => $unlinked, 'roles' => $roles];
}

/** les champs d'une fiche envoyés par la page, vérifiés */
function ed_fields(PDO $pdo, array $d, ?array $old = null): array
{
    $g = static fn($k, $def = '') => array_key_exists($k, $d) ? $d[$k] : ($old[$k] ?? $def);
    $kind = (string) $g('kind', 'eglise');
    if (!in_array($kind, [...ED_CASTLE_KINDS, ...ED_WORSHIP_KINDS], true)) { ed_bad('Sorte d’édifice inconnue.'); }
    $name = ed_str($g('name'), 200);
    if ($name === '') { ed_bad('Donne un nom à l’édifice.'); }
    $pid = $g('place_id', null); $pid = $pid === null || $pid === '' ? null : safe_int($pid);
    if ($pid !== null) { $s = $pdo->prepare('SELECT id FROM places WHERE id=?'); $s->execute([$pid]); if (!$s->fetchColumn()) { $pid = null; } }
    $insee = strtoupper(ed_str($g('insee'), 5)); if ($insee !== '' && !preg_match('/^[0-9][0-9AB][0-9]{3}$/', $insee)) { $insee = ''; }
    $lat = $g('lat', null); $lon = $g('lon', null);
    $lat = is_numeric($lat) && abs((float) $lat) <= 90 ? round((float) $lat, 6) : null; $lon = is_numeric($lon) && abs((float) $lon) <= 180 ? round((float) $lon, 6) : null;
    if ($lat === null || $lon === null) { $lat = $lon = null; }
    $wd = ed_str($g('wikidata'), 20); if ($wd !== '' && !preg_match('/^Q\d+$/', $wd)) { $wd = ''; }
    $me = strtoupper(ed_str($g('merimee'), 20)); if ($me !== '' && !preg_match('/^[A-Z]{2,4}\d{5,}$/', $me)) { $me = ''; }
    $state = (string) $g('state'); if (!in_array($state, ED_STATES, true)) { $state = ''; }
    $cult = (string) $g('cult'); if (!in_array($cult, ED_CULTS, true)) { $cult = ''; }
    return ['kind' => $kind, 'name' => $name, 'place_id' => $pid, 'insee' => $insee, 'commune' => ed_str($g('commune'), 120), 'lat' => $lat, 'lon' => $lon,
        'built_from' => ed_year($g('built_from', null)), 'built_to' => ed_year($g('built_to', null)), 'gone_year' => ed_year($g('gone_year', null)), 'state' => $state, 'cult' => $cult,
        'patron_saint' => ed_str($g('patron_saint'), 200), 'diocese' => ed_str($g('diocese'), 200), 'protection' => ed_str($g('protection'), 300), 'visit' => $g('visit', 0) ? 1 : 0,
        'wikidata' => $wd, 'merimee' => $me, 'wikipedia' => ed_url($g('wikipedia')), 'image' => ed_str($g('image'), 300), 'history' => ed_str($g('history'), 20000), 'notes' => ed_str($g('notes'), 20000),
        'origin' => ed_str($g('origin'), 40)];
}

function ed_save(PDO $pdo, array $d): array
{
    ed_tables($pdo);
    $id = safe_int($d['id'] ?? 0);
    $old = $id ? ed_site($pdo, $id) : null;
    if ($id && !$old) { ed_bad('Cette fiche n’existe plus.'); }
    $f = ed_fields($pdo, $d, $old);
    if ($old) {
        $set = implode(', ', array_map(static fn($k) => "$k=?", array_keys($f)));
        $pdo->prepare("UPDATE sites SET $set, updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([...array_values($f), $id]);
    } else {
        if ($f['wikidata'] !== '') { // une seule fiche par élément Wikidata : on rouvre celle qui existe
            $s = $pdo->prepare('SELECT id FROM sites WHERE wikidata=?'); $s->execute([$f['wikidata']]); $ex = (int) $s->fetchColumn();
            if ($ex) { return ['ok' => true, 'site' => ed_site($pdo, $ex), 'existed' => true, 'before' => null]; }
        }
        $pdo->prepare('INSERT INTO sites(' . implode(',', array_keys($f)) . ') VALUES(' . implode(',', array_fill(0, count($f), '?')) . ')')->execute(array_values($f));
        $id = (int) $pdo->lastInsertId();
        foreach (array_slice(is_array($d['people'] ?? null) ? $d['people'] : [], 0, 200) as $p) { if (is_array($p)) { ed_people_save($pdo, ['site_id' => $id] + $p); } }
    }
    return ['ok' => true, 'site' => ed_site($pdo, $id), 'before' => $old];
}

/** efface une fiche ; renvoie tout ce qu'il faut pour la remettre (ed_restore) */
function ed_delete(PDO $pdo, int $id): array
{
    ed_tables($pdo);
    $s = $pdo->prepare('SELECT * FROM sites WHERE id=?'); $s->execute([$id]); $site = $s->fetch(PDO::FETCH_ASSOC);
    if (!$site) { ed_bad('Cette fiche n’existe plus.'); }
    $snap = ['site' => $site];
    foreach (['people' => 'site_people', 'registers' => 'site_registers', 'events' => 'site_events'] as $k => $t) { $s = $pdo->prepare("SELECT * FROM $t WHERE site_id=?"); $s->execute([$id]); $snap[$k] = $s->fetchAll(PDO::FETCH_ASSOC); }
    $pdo->beginTransaction();
    foreach (['site_people', 'site_registers', 'site_events'] as $t) { $pdo->prepare("DELETE FROM $t WHERE site_id=?")->execute([$id]); }
    $pdo->prepare('DELETE FROM sites WHERE id=?')->execute([$id]);
    $pdo->commit();
    return ['ok' => true, 'snapshot' => $snap];
}

function ed_insert_row(PDO $pdo, string $table, array $row, array $allowed): void
{
    $row = array_intersect_key($row, array_flip($allowed));
    if (!$row) { return; }
    $pdo->prepare("INSERT OR REPLACE INTO $table(" . implode(',', array_keys($row)) . ') VALUES(' . implode(',', array_fill(0, count($row), '?')) . ')')->execute(array_values($row));
}
const ED_COLS = [
    'sites' => ['id', 'kind', 'name', 'place_id', 'insee', 'commune', 'lat', 'lon', 'built_from', 'built_to', 'gone_year', 'state', 'cult', 'patron_saint', 'diocese', 'protection', 'visit', 'wikidata', 'merimee', 'wikipedia', 'image', 'history', 'notes', 'origin', 'created_at', 'updated_at'],
    'site_people' => ['id', 'site_id', 'person_id', 'name', 'role', 'year_from', 'year_to', 'source_url', 'source_label', 'note', 'created_at'],
    'site_registers' => ['id', 'site_id', 'what', 'year_from', 'year_to', 'archive_service_id', 'cote', 'url', 'note', 'created_at'],
    'site_events' => ['event_id', 'site_id', 'created_at'],
];
function ed_restore(PDO $pdo, array $snap): array
{
    ed_tables($pdo);
    $site = $snap['site'] ?? null;
    if (!is_array($site) || !safe_int($site['id'] ?? 0)) { ed_bad('Rien à remettre.'); }
    $f = ed_fields($pdo, $site); // vérifie ce qui revient de la page
    $pdo->beginTransaction();
    ed_insert_row($pdo, 'sites', ['id' => safe_int($site['id'])] + $f + ['created_at' => ed_str($site['created_at'] ?? '', 30) ?: date('Y-m-d H:i:s')], ED_COLS['sites']);
    foreach (['people' => 'site_people', 'registers' => 'site_registers', 'events' => 'site_events'] as $k => $t) {
        foreach (is_array($snap[$k] ?? null) ? $snap[$k] : [] as $r) { if (is_array($r)) { $r['site_id'] = safe_int($site['id']); ed_insert_row($pdo, $t, $r, ED_COLS[$t]); } }
    }
    $pdo->commit();
    return ['ok' => true, 'site' => ed_site($pdo, safe_int($site['id']))];
}

function ed_people_save(PDO $pdo, array $d): array
{
    ed_tables($pdo);
    $site = safe_int($d['site_id'] ?? 0);
    if (!ed_site($pdo, $site)) { ed_bad('Cette fiche n’existe plus.'); }
    $id = safe_int($d['id'] ?? 0);
    $pid = safe_int($d['person_id'] ?? 0) ?: null;
    if ($pid) { $s = $pdo->prepare('SELECT id FROM persons WHERE id=?'); $s->execute([$pid]); if (!$s->fetchColumn()) { $pid = null; } }
    $row = ['site_id' => $site, 'person_id' => $pid, 'name' => ed_str($d['name'] ?? '', 200), 'role' => ed_str($d['role'] ?? '', 80), 'year_from' => ed_year($d['year_from'] ?? null), 'year_to' => ed_year($d['year_to'] ?? null),
        'source_url' => ed_url($d['source_url'] ?? ''), 'source_label' => ed_str($d['source_label'] ?? '', 200), 'note' => ed_str($d['note'] ?? '', 2000)];
    if (!$pid && $row['name'] === '') { ed_bad('Choisis une personne ou écris un nom.'); }
    $before = null;
    if ($id) {
        $s = $pdo->prepare('SELECT * FROM site_people WHERE id=?'); $s->execute([$id]); $before = $s->fetch(PDO::FETCH_ASSOC) ?: null;
        if ($before) { $pdo->prepare('UPDATE site_people SET ' . implode(', ', array_map(static fn($k) => "$k=?", array_keys($row))) . ' WHERE id=?')->execute([...array_values($row), $id]); }
        else { ed_insert_row($pdo, 'site_people', ['id' => $id] + $row, ED_COLS['site_people']); } // ↶ : remise d'une ligne effacée, même numéro
    } else { $pdo->prepare('INSERT INTO site_people(' . implode(',', array_keys($row)) . ') VALUES(' . implode(',', array_fill(0, count($row), '?')) . ')')->execute(array_values($row)); $id = (int) $pdo->lastInsertId(); }
    return ['ok' => true, 'id' => $id, 'before' => $before];
}
function ed_people_delete(PDO $pdo, int $id): array
{
    ed_tables($pdo);
    $s = $pdo->prepare('SELECT * FROM site_people WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { ed_bad('Cette ligne n’existe plus.'); }
    $pdo->prepare('DELETE FROM site_people WHERE id=?')->execute([$id]);
    return ['ok' => true, 'row' => $r];
}
function ed_reg_save(PDO $pdo, array $d): array
{
    ed_tables($pdo);
    $site = safe_int($d['site_id'] ?? 0);
    if (!ed_site($pdo, $site)) { ed_bad('Cette fiche n’existe plus.'); }
    $id = safe_int($d['id'] ?? 0);
    $as = safe_int($d['archive_service_id'] ?? 0) ?: null;
    $row = ['site_id' => $site, 'what' => ed_str($d['what'] ?? '', 200), 'year_from' => ed_year($d['year_from'] ?? null), 'year_to' => ed_year($d['year_to'] ?? null), 'archive_service_id' => $as,
        'cote' => ed_str($d['cote'] ?? '', 200), 'url' => ed_url($d['url'] ?? ''), 'note' => ed_str($d['note'] ?? '', 2000)];
    if ($row['what'] === '') { ed_bad('Dis de quels registres il s’agit (par exemple « Registres paroissiaux »).'); }
    $before = null;
    if ($id) {
        $s = $pdo->prepare('SELECT * FROM site_registers WHERE id=?'); $s->execute([$id]); $before = $s->fetch(PDO::FETCH_ASSOC) ?: null;
        if ($before) { $pdo->prepare('UPDATE site_registers SET ' . implode(', ', array_map(static fn($k) => "$k=?", array_keys($row))) . ' WHERE id=?')->execute([...array_values($row), $id]); }
        else { ed_insert_row($pdo, 'site_registers', ['id' => $id] + $row, ED_COLS['site_registers']); }
    } else { $pdo->prepare('INSERT INTO site_registers(' . implode(',', array_keys($row)) . ') VALUES(' . implode(',', array_fill(0, count($row), '?')) . ')')->execute(array_values($row)); $id = (int) $pdo->lastInsertId(); }
    return ['ok' => true, 'id' => $id, 'before' => $before];
}
function ed_reg_delete(PDO $pdo, int $id): array
{
    ed_tables($pdo);
    $s = $pdo->prepare('SELECT * FROM site_registers WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { ed_bad('Cette ligne n’existe plus.'); }
    $pdo->prepare('DELETE FROM site_registers WHERE id=?')->execute([$id]);
    return ['ok' => true, 'row' => $r];
}
/** relie un acte à une fiche (site_id 0 : le délie) ; renvoie l'ancien lien pour ↶ */
function ed_link(PDO $pdo, array $d): array
{
    ed_tables($pdo);
    $ids = array_values(array_unique(array_filter(array_map('intval', is_array($d['event_ids'] ?? null) ? $d['event_ids'] : [safe_int($d['event_id'] ?? 0)]))));
    if (!$ids) { ed_bad('Aucun acte choisi.'); }
    $site = safe_int($d['site_id'] ?? 0);
    if ($site && !ed_site($pdo, $site)) { ed_bad('Cette fiche n’existe plus.'); }
    $before = [];
    $pdo->beginTransaction();
    foreach (array_slice($ids, 0, 500) as $eid) {
        $s = $pdo->prepare('SELECT id FROM events WHERE id=?'); $s->execute([$eid]); if (!$s->fetchColumn()) { continue; }
        $s = $pdo->prepare('SELECT site_id FROM site_events WHERE event_id=?'); $s->execute([$eid]); $was = $s->fetchColumn();
        $before[(string) $eid] = $was === false ? 0 : (int) $was;
        if ($site) { $pdo->prepare('INSERT OR REPLACE INTO site_events(event_id, site_id) VALUES(?,?)')->execute([$eid, $site]); }
        else { $pdo->prepare('DELETE FROM site_events WHERE event_id=?')->execute([$eid]); }
    }
    $pdo->commit();
    return ['ok' => true, 'before' => (object) $before];
}

function ed_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'ed_list' => ed_list($pdo, $q),
        'ed_get' => ed_get($pdo, safe_int($q['id'] ?? 0)),
        'ed_person' => ed_person($pdo, safe_int($q['id'] ?? 0)),
        default => ed_bad('Action inconnue.'),
    };
}
function ed_api_post(PDO $pdo, string $action, array $d): array
{
    return match ($action) {
        'ed_save' => ed_save($pdo, $d),
        'ed_delete' => ed_delete($pdo, safe_int($d['id'] ?? 0)),
        'ed_restore' => ed_restore($pdo, is_array($d['snapshot'] ?? null) ? $d['snapshot'] : []),
        'ed_people_save' => ed_people_save($pdo, $d),
        'ed_people_delete' => ed_people_delete($pdo, safe_int($d['id'] ?? 0)),
        'ed_reg_save' => ed_reg_save($pdo, $d),
        'ed_reg_delete' => ed_reg_delete($pdo, safe_int($d['id'] ?? 0)),
        'ed_link' => ed_link($pdo, $d),
        default => ed_bad('Action inconnue.'),
    };
}
