<?php
declare(strict_types=1);

/**
 * 🌍 Où chercher ? et 🧩 Les murs de brique.
 *
 * « Où chercher ? » : ce que la base dit d'une personne pour choisir les sites à consulter (pays, département, époque,
 * événements, profils : soldat, marin, émigré, notaire ou héritage, déporté…, ce qui manque) ; le tri par pertinence est
 * fait dans le navigateur (assets/js/app-ou-chercher-core.js) d'après le registre des sites de « Chercher sur internet »
 * (app.js + les lots « sources ouvertes »), lu à chaque fois : un site ajouté plus tard est pris en compte tout seul.
 * Rien n'est recopié : « ✓ déjà cherché » est un dépouillement du Journal des recherches (archive_digest_entries,
 * template_key « ouc:<clé du site> », personne cherchée dans archive_digest_sought) ; « ＋ En faire une piste » est une
 * piste d'enquête (investigation_items) dans l'enquête ouverte de la personne (créée au besoin).
 *
 * « Murs de brique » : les ancêtres directs (Sosa) dont un parent ou les deux manquent, plus ceux marqués à la main
 * (« 🧱 Je bloque ici »). Seule la marque, la note et le statut sont gardés (table brick_walls, migration 82).
 *
 *  - ouc_person_context()  GET ou_chercher_person&id= : la personne, ses lieux (pays, département), ses événements,
 *                          ses profils, ce qui manque, ce qui a déjà été cherché (Journal), ses pistes, son mur ;
 *  - ouc_walls_data()      GET murs_de_brique : la liste (génération, Sosa, ce qui manque, statut, compteurs) ;
 *  - ouc_wall_detail()     GET mur_de_brique&id= : déjà cherché (Journal, courriers, pistes, hypothèses), indices dans la base ;
 *  - ouc_wall_save()       POST mur_save {person_id, manual?, status?, note?} → {prev} pour ↶ Annuler (POST mur_restore) ;
 *  - ouc_make_lead()       POST ou_chercher_piste {person_id, title, url, notes} → {item_id, investigation_id, created} ;
 *  - ouc_semaine_rows()    « Ma semaine de recherche » : un mur par semaine (lib/semaine.php).
 * Aucune requête sortante : l'app ne fait que fabriquer des adresses que le navigateur de la personne ouvre.
 */

const OUC_STATUSES = ['open' => 'À chercher', 'progress' => 'En cours', 'solved' => 'Résolu', 'abandoned' => 'Abandonné'];
const OUC_MAX_GEN = 16;

function ouc_schema(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS brick_walls (
        person_id   INTEGER PRIMARY KEY,
        manual      INTEGER NOT NULL DEFAULT 0,
        status      TEXT    NOT NULL DEFAULT 'open',
        note        TEXT    NOT NULL DEFAULT '',
        created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_at TEXT    NOT NULL DEFAULT '',
        FOREIGN KEY(person_id) REFERENCES persons(id) ON DELETE CASCADE
    )");
    $done = true;
}

function ouc_has_table(PDO $pdo, string $t): bool
{
    static $c = [];
    if (!isset($c[$t])) { $s = $pdo->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"); $s->execute([$t]); $c[$t] = (bool) $s->fetchColumn(); }
    return $c[$t];
}

function ouc_has_col(PDO $pdo, string $t, string $col): bool
{
    static $c = [];
    $k = "$t.$col";
    if (!isset($c[$k])) { $c[$k] = false; try { foreach ($pdo->query('PRAGMA table_info(' . preg_replace('/\W/', '', $t) . ')') as $r) { if ($r['name'] === $col) { $c[$k] = true; break; } } } catch (Throwable $_) {} }
    return $c[$k];
}

function ouc_fold(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = strtr($s, ['’' => "'", 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'à' => 'a', 'â' => 'a', 'ä' => 'a', 'ô' => 'o', 'ö' => 'o', 'î' => 'i', 'ï' => 'i', 'û' => 'u', 'ù' => 'u', 'ü' => 'u', 'ç' => 'c', '-' => ' ']);
    return preg_replace('/\s+/', ' ', $s) ?? $s;
}

function ouc_name(array $p): string
{
    $t = trim(trim((string) ($p['first_name'] ?? '')) . ' ' . mb_strtoupper(trim((string) ($p['last_name'] ?? ''))));
    return $t !== '' ? $t : 'Personne #' . (int) ($p['id'] ?? 0);
}

/** la racine des numéros Sosa : la même que « Que manque-t-il ? » (lib/suggestions.php) */
function ouc_root(PDO $pdo): int
{
    return (int) $pdo->query('SELECT id FROM persons ORDER BY is_start DESC, id LIMIT 1')->fetchColumn();
}

/** les parents connus d'une personne : [père, mère] (null si absent) */
function ouc_parents(PDO $pdo, int $pid): array
{
    return function_exists('sosa_parent_ids') ? sosa_parent_ids($pdo, $pid) : [null, null];
}

/** l'état d'un mur gardé (ou null) */
function ouc_wall_row(PDO $pdo, int $pid): ?array
{
    ouc_schema($pdo);
    $s = $pdo->prepare('SELECT * FROM brick_walls WHERE person_id=?'); $s->execute([$pid]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    return $r ?: null;
}

/* ═════════════════════ 🌍 Où chercher ? : ce que la base dit de la personne ═════════════════════ */

/** GET ou_chercher_person */
function ouc_person_context(PDO $pdo, int $pid): array
{
    ouc_schema($pdo);
    $s = $pdo->prepare('SELECT * FROM persons WHERE id=?'); $s->execute([$pid]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException('Fiche introuvable.'); }
    $ev = $pdo->prepare("SELECT e.id, e.year, e.date_text, COALESCE(t.gedcom_tag,'') AS tag, COALESCE(t.slug,'') AS slug, COALESCE(t.label,'') AS label,
            COALESCE(e.title,'') AS title, COALESCE(e.description,'') AS description, COALESCE(pl.name,'') AS place, COALESCE(pl.county,'') AS county,
            COALESCE(pl.state,'') AS state, COALESCE(pl.country,'') AS country, COALESCE(pl.admin2_code,'') AS admin2, COALESCE(e.former_country,'') AS former_country
        FROM events e LEFT JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE e.person_id=? OR e.family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?) ORDER BY COALESCE(e.year,9999), e.id");
    $ev->execute([$pid, $pid, $pid]);
    $events = [];
    foreach ($ev->fetchAll(PDO::FETCH_ASSOC) as $e) {
        $dept = null;
        $country = trim((string) ($e['country'] ?: $e['former_country']));
        if ($e['place'] !== '' && function_exists('gaps_archive_of')) {
            $a = gaps_archive_of(['name' => $e['place'], 'county' => $e['county'], 'country' => $country, 'admin2_code' => $e['admin2']]);
            if (!empty($a['code'])) { $dept = ['code' => (string) $a['code'], 'name' => (string) $a['department'], 'service' => (string) $a['label']]; }
        }
        $events[] = ['id' => (int) $e['id'], 'tag' => (string) $e['tag'], 'slug' => (string) $e['slug'], 'label' => (string) $e['label'], 'year' => $e['year'] !== null ? (int) $e['year'] : null,
            'date' => (string) $e['date_text'], 'place' => (string) $e['place'], 'county' => (string) $e['county'], 'state' => (string) $e['state'], 'country' => $country,
            'dept' => $dept, 'text' => mb_substr(trim($e['title'] . ' ' . $e['description']), 0, 200)];
    }
    // l'adresse du site des Archives du département (la même liste que « 🗂 Archives en ligne »)
    foreach ($events as &$e) {
        if ($e['dept'] && function_exists('so_department')) { $d = so_department($e['dept']['name'], $e['place']); if ($d && $d['url'] !== '') { $e['dept']['url'] = $d['url']; } }
    }
    unset($e);
    [$father, $mother] = ouc_parents($pdo, $pid);
    $has = static function (array $tags) use ($events, $pid): bool { foreach ($events as $e) { if (in_array($e['tag'], $tags, true)) { return true; } } return false; };
    $partners = (int) $pdo->query('SELECT count(*) FROM families WHERE partner1_id=' . $pid . ' OR partner2_id=' . $pid)->fetchColumn();
    $children = (int) $pdo->query('SELECT count(*) FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE f.partner1_id=' . $pid . ' OR f.partner2_id=' . $pid)->fetchColumn();

    // profils : ce que la fiche dit de sa vie (pour proposer les bons sites)
    $occ = ouc_fold((string) ($p['occupation'] ?? '') . ' ' . implode(' ', array_map(static fn($e) => $e['tag'] === 'OCCU' ? $e['text'] . ' ' . $e['label'] : '', $events)));
    $prof = [];
    $mil = trim((string) ($p['military_data'] ?? ''));
    if (($mil !== '' && $mil !== '[]' && $mil !== '{}') || !empty($p['show_military_block']) || !empty($p['show_poilu_block']) || (string) ($p['mort_pour_la_france'] ?? '') === 'yes'
        || $has(['MISE', 'MIIN', 'MIDE', 'MIAW', '_MILT', 'MILI']) || preg_match('/\b(soldat|militaire|caporal|sergent|adjudant|officier|capitaine|lieutenant|colonel|general|zouave|chasseur|cuirassier|dragon|hussard|artilleur|fantassin|grenadier|poilu)\b/', $occ)) { $prof['soldier'] = true; }
    if ((string) ($p['mort_pour_la_france'] ?? '') === 'yes') { $prof['mpf'] = true; }
    if (preg_match('/\b(marin|matelot|mousse|pecheur|navigateur|calfat|capitaine au long cours|maitre au cabotage|second capitaine|timonier|novice|terre neuvas|armateur)\b/', $occ)) { $prof['sailor'] = true; }
    if (preg_match('/\b(notaire|clerc de notaire|tabellion)\b/', $occ)) { $prof['notary'] = true; }
    if ($has(['WILL', 'PROB', 'DEED', 'LATR', 'MARC'])) { $prof['inheritance'] = true; }
    if (preg_match('/\b(cheminot|chemin de fer|mecanicien de locomotive|aiguilleur|garde barriere)\b/', $occ)) { $prof['railway'] = true; }
    if (preg_match('/\b(gendarme|policier|gardien de la paix|agent de police|commissaire)\b/', $occ)) { $prof['police'] = true; }
    if (preg_match('/\b(maire|depute|senateur|conseiller general|adjoint au maire)\b/', $occ)) { $prof['elected'] = true; }
    if (preg_match('/\b(medecin|docteur en medecine|chirurgien|officier de sante|pharmacien|sage femme)\b/', $occ)) { $prof['doctor'] = true; }
    if (preg_match('/\b(photographe)\b/', $occ)) { $prof['photographer'] = true; }
    if (preg_match('/\b(cure|pretre|vicaire|religieuse|abbe|pasteur|rabbin)\b/', $occ)) { $prof['clergy'] = true; }
    if (preg_match('/\b(mineur|ouvrier|manoeuvre|journalier|employe)\b/', $occ)) { $prof['worker'] = true; }
    if (!empty($p['show_voyage_block']) || $has(['EMIG', 'IMMI', 'NATU'])) { $prof['emigrant'] = true; }
    if (ouc_has_table($pdo, 'person_voyages')) { $s = $pdo->prepare('SELECT count(*) FROM person_voyages WHERE person_id=?'); $s->execute([$pid]); if ((int) $s->fetchColumn()) { $prof['emigrant'] = true; } }
    if (!empty($p['show_placement_block'])) { $prof['placed'] = true; }
    if (ouc_has_table($pdo, 'child_placements') && ouc_has_col($pdo, 'child_placements', 'person_id')) { $s = $pdo->prepare('SELECT count(*) FROM child_placements WHERE person_id=?'); $s->execute([$pid]); if ((int) $s->fetchColumn()) { $prof['placed'] = true; } }
    if (!empty($p['show_resistance_block'])) { $prof['resistant'] = true; }
    if (!empty($p['show_heraldry_block']) || $has(['NOBI'])) { $prof['noble'] = true; }
    foreach ($events as $e) {
        $t = ouc_fold($e['label'] . ' ' . $e['slug'] . ' ' . $e['text']);
        if (preg_match('/deport|camp de concentration|auschwitz|drancy|buchenwald|dachau|ravensbruck|mauthausen/', $t)) { $prof['deported'] = true; }
        if (preg_match('/fusille|execute/', $t)) { $prof['shot'] = true; }
        if (preg_match('/prisonnier de guerre/', $t)) { $prof['pow'] = true; $prof['soldier'] = true; }
        if ($e['tag'] === 'RELI' && preg_match('/protestant|reforme|huguenot|lutherien|calviniste/', $t)) { $prof['protestant'] = true; }
        if (($e['tag'] === 'RELI' && preg_match('/juif|juive|israelite|judaisme/', $t)) || in_array($e['tag'], ['BARM', 'BASM'], true)) { $prof['jewish'] = true; }
    }
    if (ouc_has_table($pdo, 'person_profiles')) {
        $s = $pdo->prepare('SELECT DISTINCT profile_key FROM person_profiles WHERE person_id=?'); $s->execute([$pid]);
        foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $k) {
            $k = (string) $k; $prof['p_' . preg_replace('/[^a-z0-9_]/', '', $k)] = true;
            if (preg_match('/milit|soldat|armee/', $k)) { $prof['soldier'] = true; }
            if (preg_match('/marin|mer/', $k)) { $prof['sailor'] = true; }
            if (preg_match('/politi|elu/', $k)) { $prof['elected'] = true; }
            if (preg_match('/scien|invent/', $k)) { $prof['inventor'] = true; }
            if (preg_match('/artist|artisan/', $k)) { $prof['artist'] = true; }
        }
    }
    if (!empty($p['is_artist'])) { $prof['artist'] = true; }
    // ce qui manque
    $byear = null; $dyear = null;
    foreach ($events as $e) { if ($byear === null && in_array($e['tag'], ['BIRT', 'CHR', 'BAPM'], true) && $e['year']) { $byear = $e['year']; } if ($dyear === null && in_array($e['tag'], ['DEAT', 'BURI', 'CREM'], true) && $e['year']) { $dyear = $e['year']; } }
    $now = (int) date('Y');
    $living = (string) ($p['living_status'] ?? '');
    $missing = [];
    if (!$has(['BIRT', 'CHR', 'BAPM'])) { $missing[] = 'birth'; }
    if (!$has(['DEAT', 'BURI', 'CREM']) && $living !== 'living' && (!$byear || $byear < $now - 100 || $living === 'deceased')) { $missing[] = 'death'; }
    if (!$father && !$mother) { $missing[] = 'parents'; } elseif (!$father) { $missing[] = 'father'; } elseif (!$mother) { $missing[] = 'mother'; }
    if (($partners || $children) && !$has(['MARR', 'MRCI', 'MRRE'])) { $missing[] = 'marriage'; }
    // ce qui a déjà été cherché depuis « Où chercher ? » (Journal des recherches)
    $searched = [];
    if (ouc_has_table($pdo, 'archive_digest_sought')) {
        $s = $pdo->prepare("SELECT a.id, a.template_key, a.archive_service, a.archive_url, a.status, COALESCE(a.result,'') AS result, a.updated_at, a.created_at
            FROM archive_digest_entries a JOIN archive_digest_sought ds ON ds.archive_digest_id=a.id WHERE ds.person_id=? AND a.template_key LIKE 'ouc:%' ORDER BY a.updated_at DESC, a.id DESC");
        $s->execute([$pid]);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $k = substr((string) $r['template_key'], 4);
            if (isset($searched[$k])) { continue; }
            $searched[$k] = ['id' => (int) $r['id'], 'site' => (string) $r['archive_service'], 'url' => (string) $r['archive_url'], 'status' => (string) $r['status'], 'result' => (string) $r['result'], 'date' => (string) ($r['updated_at'] ?: $r['created_at'])];
        }
    }
    $journal = 0;
    if (function_exists('research_journal_data')) { try { $journal = count(research_journal_data($pdo, ['person_id' => $pid, 'limit' => 400])['rows'] ?? []); } catch (Throwable $_) {} }
    $leads = ouc_leads($pdo, $pid);
    [$sosa] = ouc_sosa_of($pdo, $pid);
    $wall = ouc_wall_row($pdo, $pid);
    return [
        'person' => ['id' => $pid, 'first' => trim((string) $p['first_name']), 'middle' => trim((string) ($p['middle_name'] ?? '')), 'last' => trim((string) $p['last_name']), 'name' => ouc_name($p),
            'gender' => (string) $p['gender'], 'kind' => (string) ($p['kind'] ?? ''), 'living' => $living, 'private' => (int) ($p['is_private'] ?? 0) === 1, 'occupation' => trim((string) ($p['occupation'] ?? '')),
            'birth_year' => $byear, 'death_year' => $dyear, 'sosa' => $sosa, 'generation' => $sosa ? (int) floor(log($sosa, 2)) + 1 : null, 'familysearch_id' => (string) ($p['familysearch_id'] ?? '')],
        'events' => $events, 'profiles' => array_keys($prof), 'missing' => $missing,
        'parents' => ['father' => $father, 'mother' => $mother], 'partners' => $partners, 'children' => $children,
        'searched' => $searched, 'journal' => $journal, 'leads' => $leads,
        'wall' => $wall ? ['manual' => (int) $wall['manual'] === 1, 'status' => (string) $wall['status'], 'note' => (string) $wall['note'], 'updated_at' => (string) $wall['updated_at']] : null,
    ];
}

/** les pistes d'enquête d'une personne (enquêtes sur elle, ou pistes qui la citent) */
function ouc_leads(PDO $pdo, int $pid, int $limit = 60): array
{
    if (!ouc_has_table($pdo, 'investigation_items')) { return []; }
    $join = ouc_has_table($pdo, 'investigation_item_persons') ? ' OR ii.id IN (SELECT investigation_item_id FROM investigation_item_persons WHERE person_id=:p)' : '';
    $s = $pdo->prepare("SELECT ii.id, ii.title, ii.url, ii.status, ii.kind, ii.created_at, ii.investigation_id, i.title AS inv_title FROM investigation_items ii JOIN investigations i ON i.id=ii.investigation_id
        WHERE i.person_id=:p$join ORDER BY CASE ii.status WHEN 'to_explore_priority' THEN 0 WHEN 'promising' THEN 1 WHEN 'to_explore' THEN 2 ELSE 3 END, ii.id DESC LIMIT " . max(1, $limit));
    $s->execute(['p' => $pid]);
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'title' => (string) $r['title'], 'url' => (string) $r['url'], 'status' => (string) $r['status'], 'investigation_id' => (int) $r['investigation_id'], 'investigation' => (string) $r['inv_title'], 'created_at' => (string) $r['created_at']], $s->fetchAll(PDO::FETCH_ASSOC));
}

/** [Sosa le plus petit, toutes les positions] d'une personne (racine : la personne de départ) */
function ouc_sosa_of(PDO $pdo, int $pid): array
{
    static $cache = null;
    if ($cache === null) {
        $root = ouc_root($pdo);
        $cache = $root && function_exists('sosa_positions') ? (sosa_positions($pdo, $root, 20000)['personSosas'] ?? []) : [];
    }
    $l = $cache[$pid] ?? [];
    return [$l ? (int) $l[0] : null, $l];
}

/* ═════════════════════ ＋ En faire une piste ═════════════════════ */

/** POST ou_chercher_piste : une piste « à explorer » dans l'enquête ouverte de la personne (créée si elle n'en a pas) */
function ouc_make_lead(PDO $pdo, array $d): array
{
    $pid = safe_int($d['person_id'] ?? 0);
    $title = mb_substr(safe_text($d['title'] ?? ''), 0, 200);
    $url = mb_substr(safe_text($d['url'] ?? ''), 0, 2000);
    $notes = mb_substr(safe_text($d['notes'] ?? ''), 0, 2000);
    if (!$pid) { throw new RuntimeException('Personne manquante.'); }
    if ($title === '') { throw new RuntimeException('Intitulé obligatoire.'); }
    if ($url !== '' && (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $url))) { throw new RuntimeException('Adresse Internet invalide'); }
    $s = $pdo->prepare('SELECT * FROM persons WHERE id=?'); $s->execute([$pid]); $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException('Fiche introuvable.'); }
    $s = $pdo->prepare("SELECT id FROM investigations WHERE person_id=? AND COALESCE(status,'open')='open' ORDER BY updated_at DESC, id DESC LIMIT 1"); $s->execute([$pid]);
    $inv = (int) $s->fetchColumn(); $created = false;
    if (!$inv) {
        $r = save_investigation($pdo, ['person_id' => $pid, 'title' => 'Où chercher ? — ' . ouc_name($p), 'question' => 'Les sites proposés par « 🌍 Où chercher ? » pour ' . ouc_name($p) . '.', 'status' => 'open']);
        $inv = (int) $r['id']; $created = true;
    }
    $r = add_investigation_item($pdo, ['investigation_id' => $inv, 'kind' => 'link', 'title' => $title, 'url' => $url, 'notes' => $notes, 'status' => 'to_explore', 'linked_person_ids' => (string) $pid]);
    $item = (int) ($r['id'] ?? 0);
    if (!$item) { $item = (int) $pdo->query('SELECT max(id) FROM investigation_items WHERE investigation_id=' . $inv)->fetchColumn(); }
    return ['item_id' => $item, 'investigation_id' => $inv, 'created' => $created];
}

/* ═════════════════════ 🧩 Les murs de brique ═════════════════════ */

/** GET murs_de_brique : les murs calculés (ancêtres sans parents, ou un parent manquant) et ceux marqués à la main */
function ouc_walls_data(PDO $pdo, array $q = []): array
{
    ouc_schema($pdo);
    $root = ouc_root($pdo);
    $maxGen = max(1, min(OUC_MAX_GEN, safe_int($q['gen'] ?? OUC_MAX_GEN) ?: OUC_MAX_GEN));
    $pos = $root && function_exists('sosa_positions') ? sosa_positions($pdo, $root, 20000) : ['positions' => [], 'personSosas' => []];
    $personSosas = $pos['personSosas'] ?? [];
    $marks = [];
    foreach ($pdo->query('SELECT * FROM brick_walls') as $r) { $marks[(int) $r['person_id']] = $r; }
    $cand = [];
    foreach ($personSosas as $pid => $sosas) {
        $s = (int) $sosas[0]; $g = (int) floor(log($s, 2)) + 1;
        if ($g > $maxGen) { continue; }
        [$f, $m] = ouc_parents($pdo, (int) $pid);
        if ($f && $m) { continue; }
        $cand[(int) $pid] = ['sosa' => $s, 'generation' => $g, 'missing' => !$f && !$m ? 'both' : (!$f ? 'father' : 'mother'), 'computed' => true];
    }
    foreach ($marks as $pid => $r) {
        if (isset($cand[$pid])) { continue; }
        $s = isset($personSosas[$pid]) ? (int) $personSosas[$pid][0] : null;
        [$f, $m] = ouc_parents($pdo, $pid);
        $cand[$pid] = ['sosa' => $s, 'generation' => $s ? (int) floor(log($s, 2)) + 1 : null, 'missing' => !$f && !$m ? 'both' : (!$f ? 'father' : (!$m ? 'mother' : '')), 'computed' => false];
    }
    // un mur suivi (statut, note) dont les deux parents sont maintenant connus : résolu tout seul (message de félicitation)
    $newly = [];
    foreach ($marks as $pid => $r) {
        if (in_array($r['status'], ['solved', 'abandoned'], true) || (int) $r['manual'] === 1) { continue; }
        if (($cand[$pid]['missing'] ?? '') === '') {
            $pdo->prepare("UPDATE brick_walls SET status='solved', resolved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE person_id=?")->execute([$pid]);
            $marks[$pid]['status'] = 'solved'; $marks[$pid]['resolved_at'] = date('Y-m-d H:i:s');
            $newly[] = $pid;
        }
    }
    foreach ($marks as $pid => $r) {
        if (!isset($cand[$pid])) { continue; }
        if (($cand[$pid]['missing'] ?? '') === '' && $r['status'] !== 'solved' && (int) $r['manual'] !== 1) { unset($cand[$pid]); }
    }
    if (!$cand) { return ['root_id' => $root, 'items' => [], 'counts' => ['all' => 0], 'newly_solved' => []]; }
    $ids = array_keys($cand);
    $in = implode(',', array_fill(0, count($ids), '?'));
    $people = [];
    $s = $pdo->prepare("SELECT id, first_name, last_name, gender, living_status, kind, portrait_media_id, updated_at FROM persons WHERE id IN ($in)"); $s->execute($ids);
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $p) { $people[(int) $p['id']] = $p; }
    $life = [];
    $s = $pdo->prepare("SELECT e.person_id, e.year, t.gedcom_tag, COALESCE(pl.name,'') AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id IN ($in) AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI') ORDER BY e.year");
    $s->execute($ids);
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $e) {
        $pid = (int) $e['person_id']; $k = in_array($e['gedcom_tag'], ['BIRT', 'CHR', 'BAPM'], true) ? 'b' : 'd';
        if (!isset($life[$pid][$k]) || ($k === 'b' && $e['gedcom_tag'] === 'BIRT' && !($life[$pid]['bt'] ?? false))) { $life[$pid][$k] = ['year' => $e['year'] !== null ? (int) $e['year'] : null, 'place' => (string) $e['place']]; if ($k === 'b') { $life[$pid]['bt'] = $e['gedcom_tag'] === 'BIRT'; } }
    }
    // ce qui a déjà été cherché (Journal : dépouillements où la personne est cherchée) et pistes
    $searchedN = []; $leadN = [];
    if (ouc_has_table($pdo, 'archive_digest_sought')) { $s = $pdo->prepare("SELECT person_id, count(*) n FROM archive_digest_sought WHERE person_id IN ($in) GROUP BY person_id"); $s->execute($ids); foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $searchedN[(int) $r['person_id']] = (int) $r['n']; } }
    if (ouc_has_table($pdo, 'investigation_items')) { $s = $pdo->prepare("SELECT i.person_id, count(*) n FROM investigation_items ii JOIN investigations i ON i.id=ii.investigation_id WHERE i.person_id IN ($in) AND ii.status IN ('to_explore','to_explore_priority','promising') GROUP BY i.person_id"); $s->execute($ids); foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $leadN[(int) $r['person_id']] = (int) $r['n']; } }
    $items = [];
    foreach ($cand as $pid => $c) {
        $p = $people[$pid] ?? null; if (!$p) { continue; }
        $m = $marks[$pid] ?? null;
        $items[] = ['person_id' => $pid, 'name' => ouc_name($p), 'first_name' => (string) $p['first_name'], 'last_name' => (string) $p['last_name'], 'gender' => (string) $p['gender'], 'kind' => (string) ($p['kind'] ?? ''),
            'portrait_media_id' => (int) ($p['portrait_media_id'] ?? 0), 'sosa' => $c['sosa'], 'generation' => $c['generation'], 'missing' => $c['missing'], 'computed' => $c['computed'],
            'manual' => $m ? (int) $m['manual'] === 1 : false, 'status' => $m ? (string) $m['status'] : 'open', 'note' => $m ? (string) $m['note'] : '',
            'updated_at' => $m ? (string) $m['updated_at'] : '', 'resolved_at' => $m ? (string) $m['resolved_at'] : '',
            'birth' => $life[$pid]['b'] ?? null, 'death' => $life[$pid]['d'] ?? null, 'searched' => $searchedN[$pid] ?? 0, 'leads' => $leadN[$pid] ?? 0];
    }
    usort($items, static fn($a, $b) => [$a['generation'] ?? 99, $a['sosa'] ?? PHP_INT_MAX, $a['name']] <=> [$b['generation'] ?? 99, $b['sosa'] ?? PHP_INT_MAX, $b['name']]);
    $counts = ['all' => count($items), 'open' => 0, 'progress' => 0, 'solved' => 0, 'abandoned' => 0, 'manual' => 0, 'both' => 0, 'father' => 0, 'mother' => 0];
    foreach ($items as $it) { $counts[$it['status']] = ($counts[$it['status']] ?? 0) + 1; if ($it['manual']) { $counts['manual']++; } if (isset($counts[$it['missing']])) { $counts[$it['missing']]++; } }
    $names = [];
    foreach ($newly as $pid) { foreach ($items as $it) { if ($it['person_id'] === $pid) { $names[] = ['person_id' => $pid, 'name' => $it['name']]; } } }
    return ['root_id' => $root, 'items' => $items, 'counts' => $counts, 'newly_solved' => $names, 'statuses' => OUC_STATUSES];
}

/** GET mur_de_brique : déjà cherché et indices dans la base pour une personne */
function ouc_wall_detail(PDO $pdo, int $pid): array
{
    ouc_schema($pdo);
    $s = $pdo->prepare('SELECT * FROM persons WHERE id=?'); $s->execute([$pid]); $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException('Fiche introuvable.'); }
    $out = ['person_id' => $pid, 'journal' => [], 'courriers' => [], 'leads' => ouc_leads($pdo, $pid, 30), 'hypotheses' => [], 'hints' => []];
    if (function_exists('research_journal_data')) {
        try { foreach (array_slice(research_journal_data($pdo, ['person_id' => $pid, 'limit' => 200])['rows'] ?? [], 0, 40) as $r) {
            $out['journal'][] = ['key' => (string) ($r['key'] ?? ''), 'kind' => (string) ($r['kind'] ?? ''), 'title' => (string) ($r['title'] ?? ''), 'date' => (string) ($r['date'] ?? ''), 'result' => (string) ($r['result'] ?? ''), 'result_label' => (string) ($r['result_label'] ?? ''), 'status_label' => (string) ($r['status_label'] ?? '')];
        } } catch (Throwable $_) {}
    }
    if (ouc_has_table($pdo, 'courriers') && ouc_has_col($pdo, 'courriers', 'event_id')) {
        $s = $pdo->prepare("SELECT c.id, c.objet, c.destinataire, c.statut, c.date_envoi FROM courriers c JOIN events e ON e.id=c.event_id WHERE e.person_id=? ORDER BY c.date_envoi DESC LIMIT 20"); $s->execute([$pid]);
        $out['courriers'] = $s->fetchAll(PDO::FETCH_ASSOC);
    }
    if (ouc_has_table($pdo, 'hypotheses')) {
        $s = $pdo->prepare('SELECT id, title, status, confidence FROM hypotheses WHERE person_id=? OR related_person_id=? ORDER BY updated_at DESC LIMIT 20'); $s->execute([$pid, $pid]);
        $out['hypotheses'] = $s->fetchAll(PDO::FETCH_ASSOC);
    }
    // indices : années et lieux de la personne
    $s = $pdo->prepare("SELECT e.id, e.year, t.gedcom_tag AS tag, COALESCE(pl.name,'') AS place, COALESCE(pl.county,'') AS county FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id=? ORDER BY e.year");
    $s->execute([$pid]); $evs = $s->fetchAll(PDO::FETCH_ASSOC);
    $by = null; $places = [];
    foreach ($evs as $e) { if ($by === null && in_array($e['tag'], ['BIRT', 'CHR', 'BAPM'], true) && $e['year'] !== null) { $by = (int) $e['year']; } if ($e['place'] !== '') { $places[ouc_fold(explode(',', $e['place'])[0])] = $e['place']; } }
    if ($by === null) { foreach ($evs as $e) { if ($e['year'] !== null) { $by = (int) $e['year'] - ($e['tag'] === 'MARR' ? 25 : 40); break; } } }
    $hints = [];
    $last = trim((string) $p['last_name']);
    // 1. homonymes proches : même nom, nés 16 à 55 ans avant (un parent possible) ou à 10 ans près (la même personne ? un frère ?)
    if ($last !== '') {
        $kin = ouc_kin_ids($pdo, $pid);
        $s = $pdo->prepare("SELECT p.id, p.first_name, p.last_name, p.gender, (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM') AND e.year IS NOT NULL ORDER BY e.year LIMIT 1) AS by,
                (SELECT pl.name FROM events e JOIN places pl ON pl.id=e.place_id WHERE e.person_id=p.id ORDER BY e.year LIMIT 1) AS place
            FROM persons p WHERE p.id<>? AND lower(p.last_name)=lower(?) LIMIT 400");
        $s->execute([$pid, $last]);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $h) {
            $hid = (int) $h['id']; if (isset($kin[$hid])) { continue; }
            $hy = $h['by'] !== null ? (int) $h['by'] : null; $samePlace = $h['place'] && isset($places[ouc_fold(explode(',', (string) $h['place'])[0])]);
            if ($by !== null && $hy !== null && $by - $hy >= 16 && $by - $hy <= 55) {
                $hints[] = ['sort' => 'homonym', 'person_id' => $hid, 'name' => ouc_name($h), 'score' => 3 + ($samePlace ? 2 : 0), 'text' => 'Même nom, né' . ($h['gender'] === 'female' ? 'e' : '') . ' ' . ($by - $hy) . ' ans avant' . ($h['place'] ? ' à ' . explode(',', (string) $h['place'])[0] : '') . ' : ' . ($h['gender'] === 'female' ? 'sa mère ?' : 'son père ?')];
            } elseif ($by !== null && $hy !== null && abs($by - $hy) <= 12) {
                $hints[] = ['sort' => 'homonym', 'person_id' => $hid, 'name' => ouc_name($h), 'score' => 2 + ($samePlace ? 2 : 0), 'text' => 'Même nom, né' . ($h['gender'] === 'female' ? 'e' : '') . ' en ' . $hy . ($h['place'] ? ' à ' . explode(',', (string) $h['place'])[0] : '') . ' : un frère, une sœur, un cousin ?'];
            } elseif ($samePlace) {
                $hints[] = ['sort' => 'homonym', 'person_id' => $hid, 'name' => ouc_name($h), 'score' => 1, 'text' => 'Même nom, même lieu' . ($hy ? ' (né' . ($h['gender'] === 'female' ? 'e' : '') . ' en ' . $hy . ')' : '')];
            }
        }
    }
    // 2. parrains, marraines, témoins de ses actes (souvent de la famille)
    if (ouc_has_table($pdo, 'event_witnesses')) {
        $s = $pdo->prepare("SELECT w.person_id, w.note, p.first_name, p.last_name, t.label, e.year FROM event_witnesses w JOIN events e ON e.id=w.event_id JOIN persons p ON p.id=w.person_id LEFT JOIN event_types t ON t.id=e.event_type_id
            WHERE (e.person_id=? OR e.family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?)) AND w.person_id<>? LIMIT 40");
        $s->execute([$pid, $pid, $pid, $pid]);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $w) {
            $same = $last !== '' && ouc_fold((string) $w['last_name']) === ouc_fold($last);
            $hints[] = ['sort' => 'witness', 'person_id' => (int) $w['person_id'], 'name' => ouc_name(['id' => $w['person_id']] + $w), 'score' => $same ? 4 : 2,
                'text' => trim(($w['note'] ? $w['note'] : 'Témoin') . ' · ' . ($w['label'] ?: 'acte') . ($w['year'] ? ' de ' . $w['year'] : '')) . ($same ? ' · même nom : de la famille ?' : ' · souvent un proche')];
        }
    }
    // 3. voisins et foyer dans les recensements
    if (ouc_has_table($pdo, 'census_members') && ouc_has_table($pdo, 'census_records')) {
        $s = $pdo->prepare("SELECT cm2.person_id, cm2.display_name, cm2.first_name, cm2.household_position, cr.year, COALESCE(pl.name,'') AS place
            FROM census_members cm JOIN census_members cm2 ON cm2.census_id=cm.census_id AND cm2.id<>cm.id JOIN census_records cr ON cr.id=cm.census_id LEFT JOIN places pl ON pl.id=cr.place_id WHERE cm.person_id=? LIMIT 40");
        try { $s->execute([$pid]); foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $c) {
            $nm = trim((string) ($c['first_name'] ?? '') . ' ' . (string) $c['display_name']);
            $hints[] = ['sort' => 'census', 'person_id' => (int) ($c['person_id'] ?? 0), 'name' => $nm !== '' ? $nm : 'Quelqu’un', 'score' => 2,
                'text' => 'Dans le même foyer en ' . $c['year'] . ($c['place'] !== '' ? ' à ' . explode(',', $c['place'])[0] : '') . ($c['household_position'] ? ' (' . $c['household_position'] . ')' : '') . ' : un parent âgé, un beau-parent ?'];
        } } catch (Throwable $_) {}
    }
    // 4. ADN : correspondances au même nom ou reliées à quelqu'un du même nom
    if (ouc_has_table($pdo, 'dna_matches') && $last !== '') {
        $s = $pdo->prepare("SELECT m.id, m.name, m.shared_cm, m.relationship, m.side, m.person_id FROM dna_matches m LEFT JOIN persons p ON p.id=m.person_id WHERE lower(m.name) LIKE ? OR lower(COALESCE(p.last_name,''))=lower(?) ORDER BY m.shared_cm DESC LIMIT 10");
        $s->execute(['%' . mb_strtolower($last) . '%', $last]);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $m) {
            $hints[] = ['sort' => 'dna', 'person_id' => (int) ($m['person_id'] ?? 0), 'dna_id' => (int) $m['id'], 'name' => (string) $m['name'], 'score' => 3,
                'text' => 'Correspondance ADN' . ($m['shared_cm'] ? ' · ' . round((float) $m['shared_cm']) . ' cM' : '') . ($m['relationship'] ? ' · ' . $m['relationship'] : '') . ' : son arbre a peut-être la suite'];
        }
    }
    usort($hints, static fn($a, $b) => $b['score'] <=> $a['score']);
    $out['hints'] = array_slice($hints, 0, 24);
    return $out;
}

/** la famille proche déjà reliée (soi, conjoints, enfants, descendants proches) : pas des « indices » */
function ouc_kin_ids(PDO $pdo, int $pid): array
{
    $ids = [$pid => true];
    $s = $pdo->prepare('SELECT partner1_id, partner2_id, id FROM families WHERE partner1_id=? OR partner2_id=?'); $s->execute([$pid, $pid]);
    $fams = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $f) { $ids[(int) $f['partner1_id']] = true; $ids[(int) $f['partner2_id']] = true; $fams[] = (int) $f['id']; }
    $level = $fams;
    for ($g = 0; $g < 4 && $level; $g++) {
        $in = implode(',', array_map('intval', $level));
        $kids = $pdo->query("SELECT child_id FROM family_children WHERE family_id IN ($in)")->fetchAll(PDO::FETCH_COLUMN);
        $level = [];
        foreach ($kids as $k) { $ids[(int) $k] = true; foreach ($pdo->query('SELECT id FROM families WHERE partner1_id=' . (int) $k . ' OR partner2_id=' . (int) $k)->fetchAll(PDO::FETCH_COLUMN) as $f) { $level[] = (int) $f; } }
    }
    unset($ids[0]);
    return $ids;
}

/** POST mur_save : marque à la main, statut, note. Renvoie l'état d'avant (↶ Annuler : POST mur_restore). */
function ouc_wall_save(PDO $pdo, array $d): array
{
    ouc_schema($pdo);
    $pid = safe_int($d['person_id'] ?? 0);
    if (!$pid) { throw new RuntimeException('Personne manquante.'); }
    $s = $pdo->prepare('SELECT id, first_name, last_name FROM persons WHERE id=?'); $s->execute([$pid]); $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException('Fiche introuvable.'); }
    $prev = ouc_wall_row($pdo, $pid);
    $row = $prev ?: ['manual' => 0, 'status' => 'open', 'note' => '', 'resolved_at' => ''];
    if (array_key_exists('manual', $d)) { $row['manual'] = !empty($d['manual']) ? 1 : 0; }
    if (array_key_exists('status', $d)) {
        $st = safe_text($d['status']);
        if (!isset(OUC_STATUSES[$st])) { throw new RuntimeException('Statut inconnu.'); }
        if ($st === 'solved' && $row['status'] !== 'solved') { $row['resolved_at'] = date('Y-m-d H:i:s'); }
        if ($st !== 'solved') { $row['resolved_at'] = ''; }
        $row['status'] = $st;
    }
    if (array_key_exists('note', $d)) { $row['note'] = mb_substr(safe_text($d['note']), 0, 4000); }
    $pdo->prepare('INSERT INTO brick_walls(person_id,manual,status,note,resolved_at,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(person_id) DO UPDATE SET manual=excluded.manual, status=excluded.status, note=excluded.note, resolved_at=excluded.resolved_at, updated_at=CURRENT_TIMESTAMP')
        ->execute([$pid, (int) $row['manual'], (string) $row['status'], (string) $row['note'], (string) $row['resolved_at']]);
    if (function_exists('log_change')) { log_change($pdo, 'person', $pid, 'update', 'Mur de brique : ' . OUC_STATUSES[$row['status']] . ($row['manual'] ? ' (marqué à la main)' : '') . ' — ' . ouc_name($p), $prev, $row); }
    return ['ok' => true, 'person_id' => $pid, 'prev' => $prev ? array_intersect_key($prev, array_flip(['manual', 'status', 'note', 'resolved_at'])) : null, 'wall' => ouc_wall_row($pdo, $pid)];
}

/** POST mur_restore : remet l'état d'avant (null = aucune ligne) */
function ouc_wall_restore(PDO $pdo, array $d): array
{
    ouc_schema($pdo);
    $pid = safe_int($d['person_id'] ?? 0);
    if (!$pid) { throw new RuntimeException('Personne manquante.'); }
    $prev = is_array($d['prev'] ?? null) ? $d['prev'] : null;
    if (!$prev) { $pdo->prepare('DELETE FROM brick_walls WHERE person_id=?')->execute([$pid]); return ['ok' => true, 'person_id' => $pid]; }
    $st = (string) ($prev['status'] ?? 'open'); if (!isset(OUC_STATUSES[$st])) { $st = 'open'; }
    $ra = (string) ($prev['resolved_at'] ?? ''); if ($ra !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/', $ra)) { $ra = ''; }
    $pdo->prepare('INSERT INTO brick_walls(person_id,manual,status,note,resolved_at,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(person_id) DO UPDATE SET manual=excluded.manual, status=excluded.status, note=excluded.note, resolved_at=excluded.resolved_at, updated_at=CURRENT_TIMESTAMP')
        ->execute([$pid, !empty($prev['manual']) ? 1 : 0, $st, mb_substr(safe_text($prev['note'] ?? ''), 0, 4000), $ra]);
    return ['ok' => true, 'person_id' => $pid];
}

/* ═════════════════════ 🗓 Ma semaine de recherche : un mur par semaine ═════════════════════ */

/** une ligne « 🧩 Mur de la semaine » : le mur ouvert le plus proche (petite génération), qui change chaque semaine */
function ouc_semaine_rows(PDO $pdo): array
{
    try { $d = ouc_walls_data($pdo, ['gen' => 10]); } catch (Throwable $_) { return []; }
    $open = array_values(array_filter($d['items'] ?? [], static fn($w) => in_array($w['status'], ['open', 'progress'], true)));
    if (!$open) { return []; }
    $week = (int) date('oW');
    // les murs « en cours » d'abord ; parmi les 8 premiers, un par semaine (le même toute la semaine)
    usort($open, static fn($a, $b) => [($a['status'] === 'progress') ? 0 : 1, $a['generation'] ?? 99, $a['sosa'] ?? PHP_INT_MAX] <=> [($b['status'] === 'progress') ? 0 : 1, $b['generation'] ?? 99, $b['sosa'] ?? PHP_INT_MAX]);
    $pool = array_slice($open, 0, 8);
    $w = $pool[$week % count($pool)];
    $miss = ['both' => 'ses deux parents', 'father' => 'son père', 'mother' => 'sa mère'][$w['missing']] ?? 'ce qui manque';
    return [['key' => 'mur:' . (int) $w['person_id'] . ':' . $week, 'sort' => 'piste', 'urgency' => 'week', 'badge' => '🧩 Mur de la semaine',
        'title' => 'Mur de brique : ' . $w['name'] . ' — chercher ' . $miss,
        'detail' => implode(' · ', array_filter([$w['sosa'] ? 'Sosa ' . $w['sosa'] : '', $w['generation'] ? 'génération ' . $w['generation'] : '', '🌍 Où chercher ? te propose les sites à consulter'])),
        'person_id' => (int) $w['person_id'], 'open' => ['kind' => 'murs', 'id' => (int) $w['person_id']], 'done_label' => 'Piste faite', 'snooze' => 'mark']];
}
