<?php
declare(strict_types=1);

/**
 * ⚰️ Veille des décès — les fiches « vivantes » (ou au statut inconnu) nées il y a moins de 110 ans comparées au fichier des
 * personnes décédées de l'INSEE DÉJÀ INSTALLÉ sur l'ordinateur (lib/insee_remote.php, Recherche → Décès INSEE).
 * Rien n'est envoyé sur Internet : tout est comparé ici, dans la base. Écran : assets/js/heritage-veille-deces.js.
 *
 * Moteur de rapprochement : celui des successions (lib/successoral_plus2.php : succ_p2_insee_score — sexe, nom de naissance,
 * prénoms, date et lieu de naissance), avec en plus une tolérance aux variantes du nom (deux lettres de différence au plus).
 *  - quand un nouveau fichier INSEE est importé : seulement les lignes nouvelles (source_import_id > dernier comparé) ;
 *  - « Vérifier maintenant » : tout le fichier.
 * Chaque piste attend une décision : « ✓ C'est elle » (décès écrit sur la fiche, avec la source INSEE et son numéro d'acte ;
 * la fiche passe « décédée ») ou « ✗ Ce n'est pas elle » (retenu : jamais reproposée). ↶ Annuler pour les deux.
 * « 🤔 J'ai un doute » : vue, à revoir — la piste RESTE dans la liste (status 'new'), avec review='doubt', sa date et une note ;
 * « ↩ Plus de doute » l'enlève ; ↶ remet l'état d'avant (prev).
 * Tables (créées ici) : vd_pistes, vd_state.
 *  - GET vd_status · GET vd_list · GET vd_dismissed
 *  - POST vd_run {full} · vd_auto · vd_confirm {id} · vd_not_same {id} · vd_undo {id} · vd_doubt {id, note?, off?, prev?}
 * Source : Fichier des personnes décédées, INSEE, data.gouv.fr, Licence Ouverte 2.0 (Etalab).
 */

const VD_SOURCE_URL = 'https://www.data.gouv.fr/fr/datasets/fichier-des-personnes-decedees/';
const VD_SOURCE_TITLE = 'Fichier des personnes décédées (INSEE)';
const VD_LICENCE = 'Licence Ouverte 2.0 (Etalab)';
const VD_LICENCE_URL = 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/';
const VD_MAX_AGE = 110;
const VD_THRESHOLD = 60;

if (!function_exists('succ_p2_insee_score')) { require_once __DIR__ . '/successoral.php'; }

function vd_tables(PDO $pdo): void
{
    static $done = [];
    $k = spl_object_id($pdo); if (isset($done[$k])) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS vd_pistes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id INTEGER NOT NULL,
        insee_id INTEGER NOT NULL,
        insee_key TEXT NOT NULL,
        score INTEGER NOT NULL DEFAULT 0,
        detail_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'new',
        event_id INTEGER,
        source_link_id INTEGER,
        prev_living TEXT,
        found_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        decided_at TEXT,
        UNIQUE(person_id, insee_key))");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_vd_pistes_status ON vd_pistes(status)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS vd_state (k TEXT PRIMARY KEY, v TEXT)');
    // 🤔 « J'ai un doute » : review = '' | 'doubt' (seules valeurs permises), sa date et sa note
    $cols = array_column($pdo->query('PRAGMA table_info(vd_pistes)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    if (!in_array('review', $cols, true)) { $pdo->exec("ALTER TABLE vd_pistes ADD COLUMN review TEXT NOT NULL DEFAULT ''"); }
    if (!in_array('review_at', $cols, true)) { $pdo->exec('ALTER TABLE vd_pistes ADD COLUMN review_at TEXT'); }
    if (!in_array('review_note', $cols, true)) { $pdo->exec("ALTER TABLE vd_pistes ADD COLUMN review_note TEXT NOT NULL DEFAULT ''"); }
    $done[$k] = true;
    if (vd_get($pdo, 'citations_v1') === '') { try { vd_fill_citations($pdo); vd_set($pdo, 'citations_v1', '1'); } catch (Throwable $_) {} } // une fois par base
}
function vd_get(PDO $pdo, string $k, string $d = ''): string { $s = $pdo->prepare('SELECT v FROM vd_state WHERE k=?'); $s->execute([$k]); $v = $s->fetchColumn(); return $v === false ? $d : (string) $v; }
function vd_set(PDO $pdo, string $k, string $v): void { $pdo->prepare('INSERT INTO vd_state(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v')->execute([$k, $v]); }

/** le fichier INSEE est-il installé ? (au moins une ligne) */
function vd_insee(PDO $pdo): array
{
    $has = (int) $pdo->query("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='insee_deces'")->fetchColumn();
    if (!$has || !(int) $pdo->query('SELECT count(*) FROM (SELECT 1 FROM insee_deces LIMIT 1)')->fetchColumn()) { return ['installed' => false, 'max_import' => 0]; }
    $r = $pdo->query('SELECT MIN(annee_deces), MAX(annee_deces) FROM insee_deces WHERE annee_deces BETWEEN 1900 AND ' . ((int) date('Y') + 1))->fetch(PDO::FETCH_NUM) ?: [null, null];
    $max = 0; try { $max = (int) $pdo->query('SELECT MAX(id) FROM insee_deces_imports')->fetchColumn(); } catch (Throwable $_) {}
    return ['installed' => true, 'from' => $r[0] === null ? null : (int) $r[0], 'to' => $r[1] === null ? null : (int) $r[1], 'max_import' => $max];
}

/** les fiches surveillées : pas décédées, sans décès ni inhumation notés, nées il y a moins de 110 ans (année connue), pas un animal */
function vd_watched_sql(PDO $pdo): string
{
    $min = (int) date('Y') - VD_MAX_AGE;
    $hasKind = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('persons') WHERE name='kind'")->fetchColumn();
    return "SELECT p.id FROM persons p WHERE p.living_status <> 'deceased'" . ($hasKind ? " AND COALESCE(p.kind,'person') <> 'animal'" : '') . "
        AND NOT EXISTS (SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('DEAT','BURI','CREM'))
        AND EXISTS (SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM') AND e.year >= $min)";
}
function vd_watched(PDO $pdo): array
{
    $ids = array_map('intval', $pdo->query(vd_watched_sql($pdo))->fetchAll(PDO::FETCH_COLUMN));
    return $ids ? succ_persons($pdo, $ids) : [];
}
/** seulement leur nombre (l'état de la veille, demandé à chaque fiche) : sans relire chaque fiche */
function vd_watched_count(PDO $pdo): int { return (int) $pdo->query('SELECT COUNT(*) FROM (' . vd_watched_sql($pdo) . ')')->fetchColumn(); }

/** les lignes INSEE d'un nom (exact, nom composé, ou proche à deux lettres près), nées à un an près */
function vd_rows(PDO $pdo, string $name, int $by, int $afterImport): array
{
    $n = succ_p2_norm($name); if (mb_strlen($n) < 2) { return []; }
    $pre = str_replace(['*', '?', '['], '', substr($n, 0, min(3, strlen($n)))); // trois lettres : MAZAUD retrouve MAZEAUD
    $sql = 'SELECT * FROM insee_deces WHERE nom GLOB ? AND annee_naissance BETWEEN ? AND ?' . ($afterImport > 0 ? ' AND source_import_id > ?' : '') . ' LIMIT 2000';
    $par = [$pre . '*', $by - 1, $by + 1]; if ($afterImport > 0) { $par[] = $afterImport; }
    $s = $pdo->prepare($sql); $s->execute($par);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $m = succ_p2_norm((string) $r['nom']);
        if ($m === $n || str_starts_with($m . ' ', $n . ' ') || str_starts_with($n . ' ', $m . ' ')) { $r['_near'] = false; $out[] = $r; continue; }
        if (strlen($n) >= 5 && levenshtein($m, $n) <= 2) { $r['_near'] = true; $out[] = $r; }
    }
    return $out;
}

/** comparer ; $full = tout le fichier, sinon seulement les lignes des fichiers importés depuis la dernière fois */
function vd_run(PDO $pdo, bool $full = false): array
{
    vd_tables($pdo);
    $ins = vd_insee($pdo);
    if (!$ins['installed']) { return ['ok' => false, 'insee' => $ins, 'message' => 'Le fichier des décès de l’INSEE n’est pas installé.']; }
    $last = (int) vd_get($pdo, 'last_import', '0');
    $after = $full ? 0 : $last;
    $watched = vd_watched($pdo);
    $add = $pdo->prepare('INSERT OR IGNORE INTO vd_pistes(person_id, insee_id, insee_key, score, detail_json) VALUES(?,?,?,?,?)');
    $found = 0;
    $placeQ = $pdo->prepare('SELECT pl.county, pl.country FROM events e LEFT JOIN places pl ON pl.id=e.place_id WHERE e.id=?');
    foreach ($watched as $pid => $p) {
        $by = (int) ($p['birth']['year'] ?? 0); if (!$by) { continue; }
        [$bn] = succ_p2_birth_name($pdo, $pid, (string) $p['last']);
        $names = array_values(array_unique(array_filter([trim($bn), trim((string) $p['last'])])));
        $place = [];
        if (($p['birth']['event_id'] ?? 0)) { $placeQ->execute([(int) $p['birth']['event_id']]); $place = $placeQ->fetch(PDO::FETCH_ASSOC) ?: []; }
        $seen = [];
        foreach ($names as $name) {
            foreach (vd_rows($pdo, $name, $by, $after) as $row) {
                if (isset($seen[(int) $row['id']])) { continue; } $seen[(int) $row['id']] = true;
                $sc = succ_p2_insee_score($p, $name, $row, $place);
                if (!$sc) { continue; }
                if ($row['_near'] && ($sc['detail']['name'] ?? 0) == 0) { $sc['score'] = min($sc['cap'], $sc['score'] + 15); $sc['detail']['name'] = 0.5; $sc['detail']['near'] = 1; }
                if ($sc['score'] < VD_THRESHOLD || ($sc['detail']['first'] ?? 0) == 0 || in_array($sc['detail']['birth'] ?? '', ['diff', 'unknown'], true)) { continue; }
                $add->execute([$pid, (int) $row['id'], succ_p2_insee_key($row), (int) $sc['score'], json_encode($sc['detail'])]);
                $found += $add->rowCount();
            }
        }
    }
    vd_set($pdo, 'last_import', (string) max($last, (int) $ins['max_import']));
    vd_set($pdo, 'last_run', date('Y-m-d H:i:s'));
    vd_set($pdo, 'last_found', (string) $found);
    return ['ok' => true, 'checked' => count($watched), 'found' => $found, 'full' => $full] + vd_status($pdo);
}

/** après un nouveau fichier INSEE (ou jamais comparé) : comparer, seulement ce qui est nouveau */
function vd_auto(PDO $pdo): array
{
    vd_tables($pdo);
    $ins = vd_insee($pdo);
    if (!$ins['installed']) { return ['ran' => false] + vd_status($pdo); }
    $last = (int) vd_get($pdo, 'last_import', '0');
    if ($last >= (int) $ins['max_import'] && vd_get($pdo, 'last_run') !== '') { return ['ran' => false] + vd_status($pdo); }
    return ['ran' => true] + vd_run($pdo, $last === 0);
}

function vd_pending_count(PDO $pdo): int
{
    return (int) $pdo->query("SELECT count(*) FROM vd_pistes v JOIN persons p ON p.id=v.person_id WHERE v.status='new' AND p.living_status <> 'deceased'")->fetchColumn();
}

function vd_status(PDO $pdo): array
{
    vd_tables($pdo);
    $ins = vd_insee($pdo);
    return ['insee' => $ins, 'pending' => vd_pending_count($pdo), 'last_run' => vd_get($pdo, 'last_run'), 'last_import' => (int) vd_get($pdo, 'last_import', '0'),
        'new_file' => $ins['installed'] && (int) $ins['max_import'] > (int) vd_get($pdo, 'last_import', '0'),
        'watched' => vd_watched_count($pdo), 'source' => ['label' => VD_SOURCE_TITLE, 'url' => VD_SOURCE_URL, 'licence' => VD_LICENCE, 'licence_url' => VD_LICENCE_URL]];
}

/** adresse de recherche de la ligne dans matchID (moteur ouvert du même fichier INSEE) */
function vd_matchid_url(array $row): string
{
    $first = trim((string) preg_split('/\s+/', trim((string) ($row['prenoms'] ?: $row['prenom'])))[0]);
    $q = trim($first . ' ' . $row['nom'] . ' ' . substr((string) $row['date_naissance'], 0, 4));
    return 'https://deces.matchid.io/search?q=' . rawurlencode($q);
}
function vd_place_text(string $commune, string $code, string $pays = ''): string
{
    $t = trim($commune);
    if ($code !== '' && preg_match('/^(\d[\dAB]\d{3})$/', $code)) { $t .= ($t !== '' ? ' ' : '') . '(' . (str_starts_with($code, '97') ? substr($code, 0, 3) : substr($code, 0, 2)) . ')'; }
    if ($pays !== '' && strtoupper(succ_p2_norm($pays)) !== 'FRANCE') { $t .= ($t !== '' ? ', ' : '') . $pays; }
    return $t;
}
function vd_item(array $v, array $p, array $row): array
{
    $N = succ_p2_insee_date((string) $row['date_naissance']); $D = succ_p2_insee_date((string) $row['date_deces']);
    return ['id' => (int) $v['id'], 'status' => (string) $v['status'], 'score' => (int) $v['score'], 'detail' => json_decode((string) $v['detail_json'], true) ?: [], 'found_at' => (string) $v['found_at'],
        'doubt' => ($v['review'] ?? '') === 'doubt' ? ['at' => (string) ($v['review_at'] ?? ''), 'note' => (string) ($v['review_note'] ?? '')] : null,
        'person' => ['id' => (int) $p['id'], 'name' => succ_name($p), 'gender' => (string) $p['gender'], 'birth' => (string) ($p['birth']['text'] ?? ''), 'birth_place' => (string) ($p['birth']['place'] ?? ''), 'status' => (string) $p['status']],
        'insee' => ['id' => (int) $row['id'], 'nom' => (string) $row['nom'], 'prenoms' => (string) ($row['prenoms'] ?: $row['prenom']), 'sexe' => (string) $row['sexe'],
            'naissance' => $N['text'], 'lieu_naissance' => vd_place_text((string) $row['commune_naissance'], (string) $row['code_lieu_naissance'], (string) $row['pays_naissance']),
            'deces' => $D['text'], 'deces_iso' => $D['iso'], 'lieu_deces' => vd_place_text((string) $row['commune_deces'], (string) $row['code_lieu_deces']), 'acte' => (string) $row['numero_acte_deces'],
            'fichier' => (string) $row['source_file'], 'url' => vd_matchid_url($row)],
        'source' => ['label' => VD_SOURCE_TITLE, 'url' => VD_SOURCE_URL, 'licence' => VD_LICENCE]];
}
/** les pistes qui attendent une décision (fiches encore vivantes), la meilleure d'abord */
function vd_list(PDO $pdo, string $status = 'new'): array
{
    vd_tables($pdo);
    $st = in_array($status, ['new', 'not_same', 'same'], true) ? $status : 'new';
    $rows = $pdo->query("SELECT v.* FROM vd_pistes v WHERE v.status=" . $pdo->quote($st) . ' ORDER BY v.score DESC, v.id LIMIT 500')->fetchAll(PDO::FETCH_ASSOC);
    if (!$rows) { return ['items' => [], 'status' => $st] + vd_status($pdo); }
    $ps = succ_persons($pdo, array_column($rows, 'person_id'));
    $in = implode(',', array_map('intval', array_column($rows, 'insee_id')));
    $ins = []; foreach ($pdo->query("SELECT * FROM insee_deces WHERE id IN ($in)") as $r) { $ins[(int) $r['id']] = $r; }
    $items = [];
    foreach ($rows as $v) {
        $p = $ps[(int) $v['person_id']] ?? null; $row = $ins[(int) $v['insee_id']] ?? null;
        if (!$p || !$row) { continue; }
        if ($st === 'new' && ($p['status'] === 'deceased' || $p['dead_event'])) { continue; } // déjà décédée (fiche complétée entre-temps)
        $items[] = vd_item($v, $p, $row);
    }
    return ['items' => $items, 'status' => $st] + vd_status($pdo);
}
function vd_piste(PDO $pdo, array $d): array
{
    vd_tables($pdo);
    $s = $pdo->prepare('SELECT * FROM vd_pistes WHERE id=?'); $s->execute([safe_int($d['id'] ?? 0)]);
    $v = $s->fetch(PDO::FETCH_ASSOC); if (!$v) { throw new LcndaBadInput('Piste introuvable.'); }
    return $v;
}
function vd_source_id(PDO $pdo): int
{
    $s = $pdo->prepare('SELECT id FROM sources WHERE title=? ORDER BY id LIMIT 1'); $s->execute([VD_SOURCE_TITLE]);
    $id = (int) $s->fetchColumn(); if ($id) { return $id; }
    $pdo->prepare('INSERT INTO sources(title, author, agency, publication, url, text) VALUES(?,?,?,?,?,?)')
        ->execute([VD_SOURCE_TITLE, 'INSEE', 'Institut national de la statistique et des études économiques', 'data.gouv.fr — ' . VD_LICENCE, VD_SOURCE_URL,
            'Fichier des personnes décédées depuis 1970, publié par l’INSEE sur data.gouv.fr sous la Licence Ouverte 2.0 (Etalab). Comparé sur l’ordinateur, rien n’est envoyé sur Internet.']);
    return (int) $pdo->lastInsertId();
}

/** la référence précise de la citation : le lien de la fiche INSEE (matchID), lu par la fiche (↗), les citations et l'export GEDCOM */
function vd_citation(string $url): string
{
    return preg_match('#^https?://\S+$#i', $url) ? json_encode(['view_url' => $url], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : '';
}
/** les décès déjà confirmés avant ce lien : citation_json rempli d'après le lien écrit dans la note (une fois ; rien si déjà rempli) */
function vd_fill_citations(PDO $pdo): int
{
    $has = (int) $pdo->query("SELECT count(*) FROM pragma_table_info('source_links') WHERE name='citation_json'")->fetchColumn();
    if (!$has) { return 0; }
    $rows = $pdo->query("SELECT sl.id, sl.note FROM vd_pistes v JOIN source_links sl ON sl.id=v.source_link_id WHERE v.status='same' AND COALESCE(sl.citation_json,'')=''")->fetchAll(PDO::FETCH_ASSOC);
    $n = 0; $u = $pdo->prepare('UPDATE source_links SET citation_json=? WHERE id=? AND COALESCE(citation_json,\'\')=\'\'');
    foreach ($rows as $r) {
        if (!preg_match('#https?://deces\.matchid\.io/\S+#i', (string) $r['note'], $m)) { continue; }
        $c = vd_citation(rtrim($m[0], '.,;)')); if ($c === '') { continue; }
        $u->execute([$c, (int) $r['id']]); $n += $u->rowCount();
    }
    return $n;
}

/** ✓ C'est elle : le décès écrit sur la fiche, avec la source INSEE ; la fiche passe « décédée » */
function vd_confirm(PDO $pdo, array $d): array
{
    $v = vd_piste($pdo, $d);
    if ($v['status'] !== 'new') { throw new LcndaBadInput('Cette piste est déjà décidée.'); }
    $pid = (int) $v['person_id'];
    if (function_exists('person_is_locked') && person_is_locked($pdo, $pid)) { throw new LcndaBadInput('Fiche verrouillée : déverrouille-la d’abord pour ajouter le décès.'); }
    $s = $pdo->prepare('SELECT * FROM insee_deces WHERE id=?'); $s->execute([(int) $v['insee_id']]); $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new LcndaBadInput('Ligne INSEE introuvable (le fichier a peut-être été retiré).'); }
    $tag = succ_p2_tag_id($pdo, 'DEAT'); if (!$tag) { throw new LcndaBadInput('Type d’événement « Décès » introuvable.'); }
    $D = succ_p2_insee_date((string) $row['date_deces']);
    $prev = (string) $pdo->query('SELECT living_status FROM persons WHERE id=' . $pid)->fetchColumn();
    $pdo->beginTransaction();
    try {
        $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, date_text, year, sort_date, place_id, description) VALUES('person',?,?,?,?,?,?,?)")
            ->execute([$pid, $tag, $D['text'] !== '' ? $D['text'] : (string) $row['date_deces'], $D['year'] ?? ((int) $row['annee_deces'] ?: null), $D['iso'] ?: null,
                succ_p2_place_id($pdo, (string) $row['commune_deces']), 'Décès trouvé par la veille des décès, d’après le fichier des personnes décédées de l’INSEE.']);
        $eid = (int) $pdo->lastInsertId();
        $page = 'Acte n° ' . ($row['numero_acte_deces'] ?: '—') . ' · décès à ' . (vd_place_text((string) $row['commune_deces'], (string) $row['code_lieu_deces']) ?: (string) $row['code_lieu_deces'])
            . ($row['source_file'] !== '' ? ' · fichier ' . $row['source_file'] : '');
        $url = vd_matchid_url($row);
        $pdo->prepare("INSERT INTO source_links(entity_type, entity_id, source_record_id, page, quality, citation_json, note) VALUES('event',?,?,?,?,?,?)")
            ->execute([$eid, vd_source_id($pdo), $page, '2', vd_citation($url), 'Fiche INSEE : ' . trim((string) $row['nom'] . ' ' . ($row['prenoms'] ?: $row['prenom'])) . ', né(e) le ' . succ_p2_insee_date((string) $row['date_naissance'])['text']
                . ' à ' . vd_place_text((string) $row['commune_naissance'], (string) $row['code_lieu_naissance'], (string) $row['pays_naissance']) . '. Recherche : ' . vd_matchid_url($row) . ' — ' . VD_LICENCE . '.']);
        $sl = (int) $pdo->lastInsertId();
        $pdo->prepare("UPDATE persons SET living_status='deceased', updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$pid]);
        $pdo->prepare("UPDATE vd_pistes SET status='same', event_id=?, source_link_id=?, prev_living=?, decided_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$eid, $sl, $prev, (int) $v['id']]);
        if (function_exists('log_change')) { log_change($pdo, 'person', $pid, 'update', 'Décès ajouté par la veille des décès (fichier INSEE)'); }
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    if (function_exists('rebuild_search')) { try { rebuild_search($pdo, $pid); } catch (Throwable $_) {} }
    return ['ok' => true, 'event_id' => $eid, 'url' => $url, 'source_url' => VD_SOURCE_URL, 'pending' => vd_pending_count($pdo)];
}
function vd_not_same(PDO $pdo, array $d): array
{
    $v = vd_piste($pdo, $d);
    if ($v['status'] !== 'new') { throw new LcndaBadInput('Cette piste est déjà décidée.'); }
    $pdo->prepare("UPDATE vd_pistes SET status='not_same', decided_at=CURRENT_TIMESTAMP WHERE id=?")->execute([(int) $v['id']]);
    return ['ok' => true, 'pending' => vd_pending_count($pdo)];
}
/** 🤔 « J'ai un doute » sur une piste qui attend : elle reste dans la liste, marquée « vue, à revoir » (date, note facultative).
 *  {id} pose le doute (aujourd'hui) ; {id, note} change seulement la note ; {id, off: 1} l'enlève ; {id, prev: {review, at, note}} remet l'état d'avant (↶). */
function vd_doubt(PDO $pdo, array $d): array
{
    $v = vd_piste($pdo, $d);
    if ($v['status'] !== 'new') { throw new LcndaBadInput('Cette piste est déjà décidée.'); }
    $prev = ['review' => (string) ($v['review'] ?? ''), 'at' => $v['review_at'] ?? null, 'note' => (string) ($v['review_note'] ?? '')];
    $note = static fn($x) => mb_substr(trim(preg_replace('/\s+/u', ' ', (string) $x)), 0, 500);
    if (isset($d['prev']) && is_array($d['prev'])) {
        $r = (string) ($d['prev']['review'] ?? '');
        if (!in_array($r, ['', 'doubt'], true)) { throw new LcndaBadInput('État inconnu.'); }
        $at = $r === 'doubt' && preg_match('/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/', (string) ($d['prev']['at'] ?? '')) ? (string) $d['prev']['at'] : null;
        $pdo->prepare('UPDATE vd_pistes SET review=?, review_at=?, review_note=? WHERE id=?')->execute([$r, $r === 'doubt' ? ($at ?? date('Y-m-d H:i:s')) : null, $r === 'doubt' ? $note($d['prev']['note'] ?? '') : '', (int) $v['id']]);
    } elseif (!empty($d['off'])) {
        $pdo->prepare("UPDATE vd_pistes SET review='', review_at=NULL, review_note='' WHERE id=?")->execute([(int) $v['id']]);
    } elseif (array_key_exists('note', $d) && $prev['review'] === 'doubt') {
        $pdo->prepare('UPDATE vd_pistes SET review_note=? WHERE id=?')->execute([$note($d['note']), (int) $v['id']]);
    } else {
        $pdo->prepare("UPDATE vd_pistes SET review='doubt', review_at=?, review_note=? WHERE id=?")->execute([date('Y-m-d H:i:s'), $note($d['note'] ?? ''), (int) $v['id']]);
    }
    $s = $pdo->prepare('SELECT review, review_at, review_note FROM vd_pistes WHERE id=?'); $s->execute([(int) $v['id']]); $n = $s->fetch(PDO::FETCH_ASSOC);
    return ['ok' => true, 'prev' => $prev, 'doubt' => $n['review'] === 'doubt' ? ['at' => (string) $n['review_at'], 'note' => (string) $n['review_note']] : null];
}
/** ↶ Annuler une décision : le décès ajouté est retiré, la fiche reprend son statut ; la piste revient */
function vd_undo(PDO $pdo, array $d): array
{
    $v = vd_piste($pdo, $d);
    if ($v['status'] === 'new') { return ['ok' => true, 'already' => true]; }
    $pid = (int) $v['person_id'];
    $pdo->beginTransaction();
    try {
        if ($v['status'] === 'same') {
            if ((int) $v['source_link_id']) { $pdo->prepare('DELETE FROM source_links WHERE id=?')->execute([(int) $v['source_link_id']]); }
            if ((int) $v['event_id']) { $pdo->prepare("DELETE FROM source_links WHERE entity_type='event' AND entity_id=?")->execute([(int) $v['event_id']]); $pdo->prepare('DELETE FROM events WHERE id=?')->execute([(int) $v['event_id']]); }
            $prev = in_array($v['prev_living'], ['living', 'unknown', 'deceased'], true) ? (string) $v['prev_living'] : 'unknown';
            $pdo->prepare('UPDATE persons SET living_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$prev, $pid]);
            if (function_exists('log_change')) { log_change($pdo, 'person', $pid, 'update', '↶ Décès de la veille des décès retiré'); }
        }
        $pdo->prepare("UPDATE vd_pistes SET status='new', event_id=NULL, source_link_id=NULL, prev_living=NULL, decided_at=NULL WHERE id=?")->execute([(int) $v['id']]);
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    if (function_exists('rebuild_search')) { try { rebuild_search($pdo, $pid); } catch (Throwable $_) {} }
    return ['ok' => true, 'pending' => vd_pending_count($pdo)];
}

function vd_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'vd_status' => vd_status($pdo),
        'vd_list' => vd_list($pdo, 'new'),
        'vd_dismissed' => vd_list($pdo, 'not_same'),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
function vd_api_post(PDO $pdo, string $action, array $d): array
{
    @set_time_limit(300);
    return match ($action) {
        'vd_run' => vd_run($pdo, !empty($d['full'])),
        'vd_auto' => vd_auto($pdo),
        'vd_confirm' => vd_confirm($pdo, $d),
        'vd_not_same' => vd_not_same($pdo, $d),
        'vd_undo' => vd_undo($pdo, $d),
        'vd_doubt' => vd_doubt($pdo, $d),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
