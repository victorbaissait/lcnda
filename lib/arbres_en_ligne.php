<?php
declare(strict_types=1);

/**
 * 🌐 Mes arbres en ligne — synchronisation ASSISTÉE, par fichier, avec Ancestry et Geneanet.
 * Ni Ancestry ni Geneanet n'ouvrent d'accès à leurs arbres pour les autres logiciels (Ancestry : seulement des partenaires choisis,
 * Family Tree Maker et RootsMagic ; Geneanet : pas d'accès public) : l'app ne se connecte à aucun compte, ne lit aucune page de ces
 * sites, n'envoie rien. Tout passe par un fichier GEDCOM que la personne téléverse ou télécharge elle-même.
 *  - ⤴ Envoyer : l'export « Pour Geneanet » (existant) ou « Pour Ancestry » (lib/echanges.php : target=ancestry), la liste de ce qui a
 *    changé depuis le dernier envoi (journal des modifications), le lien vers la page officielle et les étapes ;
 *  - ⤵ Recevoir : le GEDCOM téléchargé depuis le site est importé dans une base TEMPORAIRE (lib/merge.php : merge_temp_import),
 *    comparé à la base (merge_person_profiles, merge_candidates, et l'identifiant stable _UID quand il y en a un), puis découpé en
 *    lignes : ➕ événement qui manque, ≠ différence, 👤 nouvelle personne, 💍 couple, 👶 lien parent-enfant, 📝 note, ❔ à vérifier.
 *    Chaque ligne : « ✓ Ajouter » (ou « Prendre la version du site ») / « ✗ Garder la mienne » (retenu pour les prochaines fois),
 *    ↶ Annuler. Rien n'est écrit avant un clic.
 * Tables (créées ici) : ael_sites, ael_receives, ael_lines. Écran : assets/js/heritage-arbres-en-ligne.js.
 *  - GET enligne_status · GET enligne_changes&site= · GET enligne_lines&site=
 *  - POST enligne_receive (fichier, site) · enligne_sent {site} · enligne_sent_undo {site, prev} · enligne_apply {ids, choice}
 *    · enligne_dismiss {ids} · enligne_undo {ids} · enligne_settings {site, reminder_days}
 */

const AEL_SITES = [
    'ancestry' => ['name' => 'Ancestry', 'icon' => '🌳', 'home' => 'https://www.ancestry.fr/',
        'help' => 'https://help-redir.ancestry.com/hc/en-ca/articles/53933352542867-Uploading-and-Downloading-Trees',
        'help_label' => 'Aide d’Ancestry : téléverser et télécharger un arbre (GEDCOM)',
        'send' => ['Sur Ancestry, ouvre « Arbres » puis « Créer et gérer les arbres ».', 'Clique sur « Téléverser un fichier GEDCOM » (Upload a GEDCOM file), choisis le fichier que l’app vient de préparer, donne un nom à l’arbre.',
            'Ancestry ne sait pas fusionner deux arbres : chaque envoi crée un nouvel arbre. Garde l’ancien tant que tu n’as pas vérifié le nouveau.', 'Les photos ne passent pas par le fichier : Ancestry ne les reprend pas.'],
        'receive' => ['Sur Ancestry, ouvre ton arbre, puis « Paramètres de l’arbre » (Tree settings).', 'Clique sur « Exporter l’arbre » (Export tree), attends que le fichier soit prêt, puis « Télécharger le fichier GEDCOM ».', 'Reviens ici et choisis ce fichier : l’app le compare à ta base, rien n’est ajouté sans ton accord.']],
    'geneanet' => ['name' => 'Geneanet', 'icon' => '🌐', 'home' => 'https://www.geneanet.org/',
        'help' => 'https://en.geneanet.org/create-your-family-tree/gedcom',
        'help_label' => 'Page officielle de Geneanet : importer un fichier GEDCOM',
        'send' => ['Sur Geneanet, ouvre « Mon arbre » puis « Importer un fichier GEDCOM » (mise à jour Gedcom).', 'Choisis le fichier que l’app vient de préparer.',
            'Attention au choix proposé par Geneanet : « Remplacer l’arbre » efface ce qui y est ; « Ajouter une branche » le garde. En cas de doute, demande l’aide de Geneanet.', 'Les vivants et les fiches confidentielles restent cachés (« Personne vivante »).'],
        'receive' => ['Sur Geneanet, ouvre « Mon arbre », puis « Exporter mon arbre » au format GEDCOM.', 'Télécharge le fichier quand il est prêt (Geneanet peut l’envoyer par courriel).', 'Reviens ici et choisis ce fichier : l’app le compare à ta base, rien n’est ajouté sans ton accord.']],
];
const AEL_SINGLE = ['BIRT', 'CHR', 'BAPM', 'DEAT', 'BURI', 'CREM'];
const AEL_HIDDEN_NAMES = ['personne vivante', 'fiche confidentielle', 'living', 'private', 'prive', 'vivant', 'vivante', 'confidentiel'];

function ael_tables(PDO $pdo): void
{
    static $done = [];
    $k = spl_object_id($pdo); if (isset($done[$k])) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS ael_sites (site TEXT PRIMARY KEY, last_sent_at TEXT, prev_sent_at TEXT, last_received_at TEXT, last_received_file TEXT NOT NULL DEFAULT '', reminder_days INTEGER NOT NULL DEFAULT 0)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ael_receives (id INTEGER PRIMARY KEY AUTOINCREMENT, site TEXT NOT NULL, file TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, stats_json TEXT NOT NULL DEFAULT '{}', data_json TEXT NOT NULL DEFAULT '{}')");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ael_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, receive_id INTEGER NOT NULL, site TEXT NOT NULL, line_key TEXT NOT NULL, kind TEXT NOT NULL, label TEXT NOT NULL DEFAULT '',
        detail_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'pending', applied_json TEXT, decided_at TEXT)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_ael_lines_site ON ael_lines(site, status)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_ael_lines_key ON ael_lines(site, line_key)');
    $done[$k] = true;
}
function ael_site_key(mixed $s): string
{
    $s = strtolower(trim((string) $s));
    if (!isset(AEL_SITES[$s])) { throw new LcndaBadInput('Site inconnu : choisis Ancestry ou Geneanet.'); }
    return $s;
}
function ael_site_row(PDO $pdo, string $site): array
{
    ael_tables($pdo);
    $pdo->prepare('INSERT OR IGNORE INTO ael_sites(site) VALUES(?)')->execute([$site]);
    $s = $pdo->prepare('SELECT * FROM ael_sites WHERE site=?'); $s->execute([$site]);
    return $s->fetch(PDO::FETCH_ASSOC) ?: ['site' => $site];
}
function ael_fold(string $s): string { return function_exists('merge_fold') ? merge_fold($s) : strtolower(trim($s)); }

/** les modifications depuis le dernier envoi (journal des modifications) */
function ael_changes(PDO $pdo, string $site, int $limit = 200): array
{
    $row = ael_site_row($pdo, $site);
    $since = (string) ($row['last_sent_at'] ?? '');
    if ($since === '') { return ['since' => null, 'never' => true, 'total' => (int) $pdo->query('SELECT count(*) FROM persons')->fetchColumn(), 'items' => []]; }
    $c = $pdo->prepare("SELECT count(*) FROM change_log WHERE created_at > ? AND entity_type <> 'view'"); $c->execute([$since]);
    $total = (int) $c->fetchColumn();
    $s = $pdo->prepare("SELECT id, entity_type, entity_id, action, summary, created_at FROM change_log WHERE created_at > ? AND entity_type <> 'view' ORDER BY id DESC LIMIT " . max(1, min(1000, $limit)));
    $s->execute([$since]);
    $items = $s->fetchAll(PDO::FETCH_ASSOC);
    // les fiches qui restent cachées dans le fichier (vivantes, confidentielles) : leurs changements ne partent pas
    $pids = array_values(array_unique(array_map(static fn($r) => (int) $r['entity_id'], array_filter($items, static fn($r) => $r['entity_type'] === 'person' && (int) $r['entity_id']))));
    $hidden = [];
    if ($pids) {
        $lim = (int) date('Y') - 100;
        foreach ($pdo->query('SELECT p.id, p.living_status, COALESCE(p.is_private,0) AS priv, (SELECT MIN(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN (\'BIRT\',\'CHR\',\'BAPM\')) AS by,
            (SELECT count(*) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN (\'DEAT\',\'BURI\',\'CREM\')) AS dead FROM persons p WHERE p.id IN (' . implode(',', $pids) . ')') as $p) {
            if ((int) $p['priv'] === 1 || $p['living_status'] === 'living' || (!(int) $p['dead'] && $p['living_status'] !== 'deceased' && $p['by'] !== null && (int) $p['by'] >= $lim)) { $hidden[(int) $p['id']] = true; }
        }
    }
    foreach ($items as &$it) { $it['id'] = (int) $it['id']; $it['entity_id'] = $it['entity_id'] === null ? null : (int) $it['entity_id']; $it['hidden'] = $it['entity_type'] === 'person' && isset($hidden[(int) $it['entity_id']]); }
    return ['since' => $since, 'never' => false, 'total' => $total, 'items' => $items];
}

function ael_pending(PDO $pdo, string $site): int
{
    $s = $pdo->prepare("SELECT count(*) FROM ael_lines WHERE site=? AND status='pending'"); $s->execute([$site]);
    return (int) $s->fetchColumn();
}
function ael_status(PDO $pdo): array
{
    ael_tables($pdo);
    $out = [];
    foreach (AEL_SITES as $key => $def) {
        $row = ael_site_row($pdo, $key);
        $ch = ael_changes($pdo, $key, 1);
        $days = (int) ($row['reminder_days'] ?? 0);
        $due = $days > 0 && !empty($row['last_sent_at']) && $ch['total'] > 0 && strtotime((string) $row['last_sent_at']) < time() - $days * 86400;
        $out[$key] = ['site' => $key, 'name' => $def['name'], 'icon' => $def['icon'], 'home' => $def['home'], 'help' => $def['help'], 'help_label' => $def['help_label'],
            'send_steps' => $def['send'], 'receive_steps' => $def['receive'], 'last_sent_at' => $row['last_sent_at'] ?? null, 'last_received_at' => $row['last_received_at'] ?? null,
            'last_received_file' => (string) ($row['last_received_file'] ?? ''), 'reminder_days' => $days, 'changes' => $ch['never'] ? null : $ch['total'], 'pending' => ael_pending($pdo, $key), 'reminder_due' => $due];
    }
    return ['sites' => $out];
}

/** l'envoi est noté (la date sert à « ce qui a changé depuis ») ; ↶ remet la date d'avant */
function ael_sent(PDO $pdo, array $d): array
{
    $site = ael_site_key($d['site'] ?? ''); $row = ael_site_row($pdo, $site);
    $now = gmdate('Y-m-d H:i:s');
    $pdo->prepare('UPDATE ael_sites SET prev_sent_at=last_sent_at, last_sent_at=? WHERE site=?')->execute([$now, $site]);
    return ['ok' => true, 'site' => $site, 'sent_at' => $now, 'prev' => $row['last_sent_at'] ?? null];
}
function ael_sent_undo(PDO $pdo, array $d): array
{
    $site = ael_site_key($d['site'] ?? ''); ael_site_row($pdo, $site);
    $prev = isset($d['prev']) && preg_match('/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/', (string) $d['prev']) ? (string) $d['prev'] : null;
    $pdo->prepare('UPDATE ael_sites SET last_sent_at=? WHERE site=?')->execute([$prev, $site]);
    return ['ok' => true];
}
function ael_settings(PDO $pdo, array $d): array
{
    $site = ael_site_key($d['site'] ?? ''); ael_site_row($pdo, $site);
    $days = (int) ($d['reminder_days'] ?? 0); if (!in_array($days, [0, 30, 90, 180, 365], true)) { $days = 0; }
    $pdo->prepare('UPDATE ael_sites SET reminder_days=? WHERE site=?')->execute([$days, $site]);
    return ['ok' => true, 'reminder_days' => $days];
}

/* ═════════════════════ ⤵ Recevoir : comparer le fichier du site à la base ═════════════════════ */

/** les événements d'une base, par personne ou par famille, avec leur lieu (pour les recopier sans la base temporaire) */
function ael_events(PDO $db, string $col): array
{
    $by = [];
    foreach ($db->query("SELECT e.id, e.person_id, e.family_id, e.date_text, e.year, e.sort_date, COALESCE(e.title,'') AS title, COALESCE(e.description,'') AS description, COALESCE(e.cause,'') AS cause,
            COALESCE(e.address,'') AS address, t.gedcom_tag AS tag, t.label, t.scope, COALESCE(pl.name,'') AS place, COALESCE(pl.county,'') AS county, COALESCE(pl.state,'') AS state, COALESCE(pl.country,'') AS country,
            pl.latitude AS lat, pl.longitude AS lon, COALESCE(pl.subdivision,'') AS subdivision
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.$col IS NOT NULL ORDER BY COALESCE(e.year,9999), e.id") as $e) {
        $by[(int) $e[$col === 'person_id' ? 'person_id' : 'family_id']][] = $e;
    }
    return $by;
}
function ael_event_text(array $e): string
{
    $place = trim((string) ($e['place'] ?? ''));
    return trim(($e['label'] ?: $e['tag']) . (trim((string) $e['title']) !== '' ? ' : ' . trim((string) $e['title']) : '') . ' ' . ($e['date_text'] ?: ($e['year'] ?: '')) . ($place !== '' ? ', ' . $place : ''));
}
function ael_event_key(array $e): string { return $e['tag'] . (in_array($e['tag'], AEL_SINGLE, true) ? '' : ':' . (int) $e['year'] . ':' . ael_fold((string) $e['title'])); }
function ael_person_text(array $p): string
{
    $n = trim(trim((string) $p['first_name'] . ' ' . (string) ($p['middle_name'] ?? '')) . ' ' . mb_strtoupper(trim((string) $p['last_name']))) ?: 'Sans nom';
    return $n . (($p['birth'] ?? null) || ($p['death'] ?? null) ? ' (' . ($p['birth'] ?: '?') . '–' . ($p['death'] ?: '?') . ')' : '');
}
function ael_event_payload(array $e): array
{
    return ['tag' => (string) $e['tag'], 'label' => (string) $e['label'], 'scope' => (string) $e['scope'], 'date_text' => (string) $e['date_text'], 'year' => $e['year'] === null ? null : (int) $e['year'],
        'sort_date' => $e['sort_date'], 'title' => (string) $e['title'], 'description' => (string) $e['description'], 'cause' => (string) $e['cause'], 'address' => (string) $e['address'],
        'place' => ['name' => (string) $e['place'], 'county' => (string) $e['county'], 'state' => (string) $e['state'], 'country' => (string) $e['country'], 'lat' => $e['lat'], 'lon' => $e['lon'], 'subdivision' => (string) $e['subdivision']],
        'text' => ael_event_text($e)];
}
function ael_is_hidden_name(array $p): bool
{
    $n = ael_fold(trim((string) $p['first_name'] . ' ' . (string) $p['last_name']));
    return $n === '' || in_array($n, AEL_HIDDEN_NAMES, true) || in_array(ael_fold((string) $p['first_name']), ['living', 'private'], true);
}

/** ⤵ un fichier reçu : importé à part, comparé, découpé en lignes à valider */
function ael_receive(PDO $pdo, ?array $file, string $site): array
{
    @set_time_limit(0);
    ael_tables($pdo);
    $site = ael_site_key($site);
    if (!$file || ($file['error'] ?? 1) !== UPLOAD_ERR_OK) { throw new LcndaBadInput('Fichier non reçu.'); }
    $ext = strtolower(pathinfo((string) ($file['name'] ?? ''), PATHINFO_EXTENSION));
    if (!in_array($ext, ['ged', 'gedcom'], true)) { throw new LcndaBadInput('Choisis le fichier GEDCOM (.ged) téléchargé depuis ' . AEL_SITES[$site]['name'] . '.'); }
    try { [$token, $tmp, $stats] = merge_temp_import((string) $file['tmp_name'], $ext); }
    catch (RuntimeException $e) { throw new LcndaBadInput($e->getMessage()); }
    try { $built = ael_build_lines($pdo, $tmp, $site); }
    finally { $tmp = null; foreach (['', '-wal', '-shm', '.migration-lock'] as $sfx) { @unlink(merge_dir() . '/' . $token . '.sqlite' . $sfx); } }
    $pdo->beginTransaction();
    try {
        $pdo->prepare("UPDATE ael_lines SET status='superseded' WHERE site=? AND status='pending'")->execute([$site]);
        $pdo->prepare('INSERT INTO ael_receives(site, file, stats_json, data_json) VALUES(?,?,?,?)')->execute([$site, mb_substr((string) $file['name'], 0, 200),
            json_encode(['persons' => $stats['persons'] ?? null, 'families' => $stats['families'] ?? null, 'events' => $stats['events'] ?? null, 'counts' => $built['counts']], JSON_UNESCAPED_UNICODE), json_encode($built['data'], JSON_UNESCAPED_UNICODE)]);
        $rid = (int) $pdo->lastInsertId();
        // ce qui a été refusé (« Garder la mienne ») ou déjà ajouté lors d'une réception précédente ne revient pas
        $known = $pdo->prepare("SELECT 1 FROM ael_lines WHERE site=? AND line_key=? AND status IN ('dismissed','applied') LIMIT 1");
        $ins = $pdo->prepare('INSERT INTO ael_lines(receive_id, site, line_key, kind, label, detail_json) VALUES(?,?,?,?,?,?)');
        $kept = 0; $skipped = 0;
        foreach ($built['lines'] as $l) {
            $known->execute([$site, $l['key']]);
            if ($known->fetchColumn()) { $skipped++; continue; }
            $ins->execute([$rid, $site, $l['key'], $l['kind'], $l['label'], json_encode($l['detail'], JSON_UNESCAPED_UNICODE)]); $kept++;
        }
        $pdo->prepare('UPDATE ael_sites SET last_received_at=?, last_received_file=? WHERE site=?')->execute([gmdate('Y-m-d H:i:s'), mb_substr((string) $file['name'], 0, 200), $site]);
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    return ['ok' => true, 'receive_id' => $rid, 'file' => (string) $file['name'], 'lines' => $kept, 'already' => $skipped, 'counts' => $built['counts'], 'persons' => $built['persons']] + ael_lines($pdo, $site);
}

/** la comparaison : les lignes, et ce qu'il faut garder du fichier pour les appliquer plus tard (personnes, familles, correspondances) */
function ael_build_lines(PDO $pdo, PDO $tmp, string $site): array
{
    $name = AEL_SITES[$site]['name'];
    $incAll = merge_person_profiles($tmp);
    $tmpPersons = []; foreach ($tmp->query("SELECT id, COALESCE(first_name,'') AS first_name, COALESCE(middle_name,'') AS middle_name, COALESCE(last_name,'') AS last_name, COALESCE(prefix,'') AS prefix, COALESCE(suffix,'') AS suffix, gender, living_status, COALESCE(unique_id,'') AS uid, COALESCE(occupation,'') AS occupation FROM persons") as $r) { $tmpPersons[(int) $r['id']] = $r; }
    $inc = array_filter($incAll, static fn($p) => !ael_is_hidden_name($p) || $p['events']);
    $mine = merge_person_profiles($pdo);
    $rows = merge_candidates($inc, $mine);
    // l'identifiant stable du site (_UID), quand la fiche vient déjà de lui : sûr
    $uidMine = [];
    foreach ($pdo->query("SELECT id, unique_id FROM persons WHERE COALESCE(unique_id,'') <> ''") as $r) { $u = (string) $r['unique_id']; if (strlen($u) >= 8 && !preg_match('/^@?[A-Z]{0,2}\d+@?$/i', $u)) { $uidMine[$u] = (int) $r['id']; } }
    $map = []; $check = []; $new = [];
    foreach ($rows as $r) {
        $id = (int) $r['id']; $uid = (string) ($tmpPersons[$id]['uid'] ?? '');
        if ($uid !== '' && isset($uidMine[$uid])) { $map[$id] = $uidMine[$uid]; continue; }
        if ($r['proposal'] === 'same') { $map[$id] = (int) $r['candidates'][0]['id']; }
        elseif ($r['proposal'] === 'check') { $check[$id] = $r; }
        else { $new[$id] = $r; }
    }
    $incEv = ael_events($tmp, 'person_id'); $mineEv = ael_events($pdo, 'person_id');
    $incFamEv = ael_events($tmp, 'family_id');
    $notesOf = static function (PDO $db, string $type): array { $o = []; foreach ($db->query("SELECT entity_id, COALESCE(body,'') AS body FROM notes WHERE entity_type='" . $type . "'") as $n) { if (trim($n['body']) !== '') { $o[(int) $n['entity_id']][] = (string) $n['body']; } } return $o; };
    $incNotes = $notesOf($tmp, 'person'); $mineNotes = $notesOf($pdo, 'person');
    $normNote = static fn(string $t) => trim((string) preg_replace('/\s+/u', ' ', (string) preg_replace('/\n\n\([^()\n]{1,80}\)\s*$/u', '', $t)));
    $pText = static fn(int $id) => ael_person_text($incAll[$id] ?? ['first_name' => '', 'last_name' => '']);
    $mText = static fn(int $id) => ael_person_text($mine[$id] ?? ['first_name' => '', 'last_name' => '']);
    $pKey = static fn(int $id) => ael_fold(($incAll[$id]['first_name'] ?? '') . ' ' . ($incAll[$id]['last_name'] ?? '')) . '|' . ($incAll[$id]['birth'] ?? '');
    $lines = [];
    $add = static function (string $kind, string $key, string $label, array $detail) use (&$lines, $site): void { $lines[] = ['kind' => $kind, 'key' => sha1($site . '|' . $kind . '|' . $key), 'label' => $label, 'detail' => $detail]; };
    // ce qui manque ou diffère sur une fiche déjà là
    $missingOf = static function (int $incId, int $mineId) use ($incEv, $mineEv): array {
        $have = []; foreach ($mineEv[$mineId] ?? [] as $e) { $have[ael_event_key($e)] = $e; }
        $miss = []; $diff = [];
        foreach ($incEv[$incId] ?? [] as $e) {
            if ((string) $e['tag'] === '') { continue; }
            $k = ael_event_key($e);
            if (!isset($have[$k])) { $miss[] = $e; $have[$k] = $e; continue; }
            if (!in_array($e['tag'], AEL_SINGLE, true)) { continue; }
            $m = $have[$k];
            $yDiff = $e['year'] !== null && $m['year'] !== null && (int) $e['year'] !== (int) $m['year'];
            $pDiff = trim((string) $e['place']) !== '' && trim((string) $m['place']) !== '' && ael_fold((string) $e['place']) !== ael_fold((string) $m['place']);
            $dMore = !$yDiff && $e['year'] !== null && $m['year'] === null; // le site a une date, pas moi
            $plMore = !$pDiff && trim((string) $e['place']) !== '' && trim((string) $m['place']) === '';
            if ($yDiff || $pDiff || $dMore || $plMore) { $diff[] = [$e, $m, $yDiff || $pDiff]; }
        }
        return [$miss, $diff];
    };
    foreach ($map as $incId => $mineId) {
        [$miss, $diff] = $missingOf($incId, $mineId);
        foreach ($miss as $e) {
            $add('event', $pKey($incId) . '|' . ael_event_key($e) . '|' . ael_fold((string) $e['place']) . '|' . (int) $e['year'], 'Ajouter à ' . $mText($mineId) . ' : ' . ael_event_text($e),
                ['person_id' => $mineId, 'inc' => $incId, 'event' => ael_event_payload($e), 'mine' => $mText($mineId)]);
        }
        foreach ($diff as [$e, $m, $conflict]) {
            $add('diff', $pKey($incId) . '|' . $e['tag'] . '|' . ael_fold((string) $e['place']) . '|' . (int) $e['year'], ($conflict ? 'Différent pour ' : 'Plus précis pour ') . $mText($mineId) . ' : ' . ($e['label'] ?: $e['tag']),
                ['person_id' => $mineId, 'event_id' => (int) $m['id'], 'conflict' => $conflict, 'mine_text' => ael_event_text($m), 'site_text' => ael_event_text($e), 'event' => ael_event_payload($e), 'mine' => $mText($mineId)]);
        }
        $known = array_map($normNote, $mineNotes[$mineId] ?? []);
        foreach ($incNotes[$incId] ?? [] as $body) {
            if (in_array($normNote($body), $known, true)) { continue; }
            $add('note', $pKey($incId) . '|' . sha1($normNote($body)), 'Note pour ' . $mText($mineId) . ' : « ' . mb_strimwidth(trim($body), 0, 90, '…') . ' »', ['person_id' => $mineId, 'body' => $body, 'mine' => $mText($mineId)]);
        }
    }
    // les personnes à garder dans le fichier (pour les ajouter plus tard sans la base temporaire)
    $keep = [];
    $relOf = [];
    $fams = [];
    foreach ($tmp->query('SELECT id, partner1_id, partner2_id FROM families') as $f) {
        $kids = array_map('intval', $tmp->query('SELECT child_id FROM family_children WHERE family_id=' . (int) $f['id'] . ' ORDER BY position, id')->fetchAll(PDO::FETCH_COLUMN));
        $fams[(int) $f['id']] = ['p1' => (int) $f['partner1_id'] ?: null, 'p2' => (int) $f['partner2_id'] ?: null, 'kids' => $kids, 'events' => array_map('ael_event_payload', $incFamEv[(int) $f['id']] ?? [])];
    }
    $label = static function (int $id) use ($map, $mText, $pText): string { return isset($map[$id]) ? $mText($map[$id]) : $pText($id); };
    foreach ($fams as $f) {
        $parents = array_values(array_filter([$f['p1'], $f['p2']]));
        foreach ($f['kids'] as $k) { if ($parents) { $relOf[$k][] = ($incAll[$k]['gender'] ?? '') === 'female' ? 'fille de ' . implode(' et ', array_map($label, $parents)) : 'enfant de ' . implode(' et ', array_map($label, $parents)); } }
        if ($f['p1'] && $f['p2']) { $relOf[$f['p1']][] = 'conjoint de ' . $label($f['p2']); $relOf[$f['p2']][] = 'conjoint de ' . $label($f['p1']); }
        foreach ($parents as $pp) { foreach ($f['kids'] as $k) { $relOf[$pp][] = 'parent de ' . $label($k); } }
    }
    $personPayload = static function (int $id) use ($tmpPersons, $incEv, $incNotes, $incAll): array {
        $p = $tmpPersons[$id];
        return ['first_name' => $p['first_name'], 'middle_name' => $p['middle_name'], 'last_name' => $p['last_name'], 'prefix' => $p['prefix'], 'suffix' => $p['suffix'], 'gender' => $p['gender'],
            'living_status' => $p['living_status'], 'occupation' => $p['occupation'], 'uid' => $p['uid'], 'birth' => $incAll[$id]['birth'] ?? null, 'death' => $incAll[$id]['death'] ?? null,
            'events' => array_map('ael_event_payload', $incEv[$id] ?? []), 'notes' => $incNotes[$id] ?? []];
    };
    foreach ($new as $id => $r) {
        $keep[$id] = $personPayload($id);
        $rel = array_slice(array_values(array_unique($relOf[$id] ?? [])), 0, 3);
        $add('person', 'p|' . $pKey($id), 'Nouvelle personne : ' . $pText($id) . ($rel ? ' — ' . implode(', ', $rel) : ''),
            ['inc' => $id, 'text' => $pText($id), 'rel' => $rel, 'events' => array_map(static fn($e) => $e['text'], $keep[$id]['events'])]);
    }
    foreach ($check as $id => $r) {
        $keep[$id] = $personPayload($id);
        $c = $r['candidates'][0];
        [$miss] = $missingOf($id, (int) $c['id']);
        $add('check', 'c|' . $pKey($id) . '|' . (int) $c['id'], 'À vérifier : ' . $pText($id) . ' (' . $name . ') ressemble à ta fiche ' . $mText((int) $c['id']),
            ['inc' => $id, 'text' => $pText($id), 'candidate' => (int) $c['id'], 'candidate_text' => $mText((int) $c['id']), 'score' => (int) $c['score'], 'why' => $c['why'] ?? [], 'against' => $c['against'] ?? [],
             'missing' => array_map('ael_event_payload', $miss), 'rel' => array_slice(array_values(array_unique($relOf[$id] ?? [])), 0, 3)]);
    }
    // liens entre fiches déjà là : un couple qui manque, un enfant pas encore rattaché
    $mineFam = []; foreach ($pdo->query('SELECT id, partner1_id, partner2_id FROM families') as $f) { $a = (int) $f['partner1_id']; $b = (int) $f['partner2_id']; $mineFam[min($a, $b) . '-' . max($a, $b)] = (int) $f['id']; }
    $mineKids = []; foreach ($pdo->query('SELECT fc.child_id, f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id') as $r) { $mineKids[(int) $r['child_id']][] = [(int) $r['partner1_id'], (int) $r['partner2_id']]; }
    foreach ($fams as $fid => $f) {
        $a = $f['p1'] ? ($map[$f['p1']] ?? null) : null; $b = $f['p2'] ? ($map[$f['p2']] ?? null) : null;
        if ($a && $b && !isset($mineFam[min($a, $b) . '-' . max($a, $b)])) {
            $add('couple', 'f|' . $pKey($f['p1']) . '|' . $pKey($f['p2']), 'Couple : ' . $mText($a) . ' et ' . $mText($b) . ($f['events'] ? ' — ' . implode(' ; ', array_map(static fn($e) => $e['text'], $f['events'])) : ''),
                ['a' => $a, 'b' => $b, 'events' => $f['events']]);
        }
        foreach ($f['kids'] as $k) {
            $c = $map[$k] ?? null; if (!$c || (!$a && !$b)) { continue; }
            $linked = false; foreach ($mineKids[$c] ?? [] as $pp) { if (($a && in_array($a, $pp, true)) || ($b && in_array($b, $pp, true))) { $linked = true; } }
            if ($linked || count($mineKids[$c] ?? []) > 0 && $a && $b) { continue; } // déjà des parents ailleurs : pas un deuxième jeu
            $add('child', 'k|' . $pKey($k) . '|' . ($f['p1'] ? $pKey($f['p1']) : '') . '|' . ($f['p2'] ? $pKey($f['p2']) : ''), 'Lien : ' . $mText($c) . ' enfant de ' . implode(' et ', array_map($mText, array_filter([$a, $b]))),
                ['child' => $c, 'a' => $a, 'b' => $b]);
        }
    }
    $counts = array_count_values(array_column($lines, 'kind'));
    return ['lines' => $lines, 'counts' => $counts, 'persons' => count($incAll), 'data' => ['site' => $site, 'map' => $map, 'persons' => $keep, 'families' => array_values($fams)]];
}

function ael_lines(PDO $pdo, string $site, bool $all = false): array
{
    ael_tables($pdo);
    $site = ael_site_key($site);
    $s = $pdo->prepare('SELECT l.*, r.file, r.created_at AS received_at FROM ael_lines l JOIN ael_receives r ON r.id=l.receive_id WHERE l.site=? AND l.receive_id=(SELECT MAX(id) FROM ael_receives WHERE site=?)' . ($all ? '' : " AND l.status IN ('pending','applied','dismissed')") . ' ORDER BY l.id');
    $s->execute([$site, $site]);
    $items = []; $file = ''; $at = null;
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $l) {
        $file = (string) $l['file']; $at = (string) $l['received_at'];
        $items[] = ['id' => (int) $l['id'], 'kind' => (string) $l['kind'], 'label' => (string) $l['label'], 'status' => (string) $l['status'], 'detail' => json_decode((string) $l['detail_json'], true) ?: []];
    }
    return ['site' => $site, 'file' => $file, 'received_at' => $at, 'items' => $items, 'pending' => ael_pending($pdo, $site)];
}

/* ═════════════════════ appliquer une ligne (et ↶) ═════════════════════ */
function ael_place_id(PDO $pdo, array $pl): ?int
{
    $name = trim((string) ($pl['name'] ?? '')); if ($name === '') { return null; }
    $s = $pdo->prepare("SELECT id FROM places WHERE name=? COLLATE NOCASE AND COALESCE(county,'')=? AND COALESCE(country,'')=? LIMIT 1");
    $s->execute([$name, (string) ($pl['county'] ?? ''), (string) ($pl['country'] ?? '')]);
    $id = (int) $s->fetchColumn(); if ($id) { return $id; }
    $s = $pdo->prepare("SELECT id FROM places WHERE name=? COLLATE NOCASE ORDER BY id LIMIT 1"); $s->execute([$name]);
    if (($id = (int) $s->fetchColumn()) && (string) ($pl['county'] ?? '') === '') { return $id; }
    $pdo->prepare('INSERT INTO places(name,county,state,country,latitude,longitude,subdivision) VALUES(?,?,?,?,?,?,?)')
        ->execute([$name, (string) ($pl['county'] ?? ''), (string) ($pl['state'] ?? ''), (string) ($pl['country'] ?? ''), $pl['lat'] ?? null, $pl['lon'] ?? null, (string) ($pl['subdivision'] ?? '')]);
    return (int) $pdo->lastInsertId();
}
function ael_insert_event(PDO $pdo, array $e, ?int $pid, ?int $fid, array &$made, string $site): int
{
    static $cache = [];
    $type = gedcom_event_type_id($pdo, $cache, $fid ? 'family' : 'person', (string) $e['tag'], (string) $e['label']);
    $desc = trim((string) $e['description']);
    $pdo->prepare('INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,sort_date,place_id,address,title,description,cause) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([$fid ? 'family' : 'person', $pid, $fid, $type, (string) $e['date_text'], $e['year'], $e['sort_date'] ?? null, ael_place_id($pdo, $e['place'] ?? []), (string) ($e['address'] ?? ''), (string) ($e['title'] ?? ''),
            $desc . ($desc !== '' ? "\n" : '') . 'Reçu de ' . AEL_SITES[$site]['name'] . ' (fichier GEDCOM) le ' . date('d/m/Y') . '.', (string) ($e['cause'] ?? '')]);
    $id = (int) $pdo->lastInsertId(); $made['events'][] = $id; return $id;
}
function ael_family(PDO $pdo, ?int $a, ?int $b, array &$made): int
{
    $s = $pdo->prepare('SELECT id FROM families WHERE (partner1_id IS ? AND partner2_id IS ?) OR (partner1_id IS ? AND partner2_id IS ?) LIMIT 1'); $s->execute([$a, $b, $b, $a]);
    $id = (int) $s->fetchColumn(); if ($id) { return $id; }
    $pdo->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,?)')->execute([$a, $b]);
    $id = (int) $pdo->lastInsertId(); $made['families'][] = $id; return $id;
}
function ael_link_child(PDO $pdo, int $fid, int $child, array &$made): void
{
    $s = $pdo->prepare('SELECT count(*) FROM family_children WHERE family_id=? AND child_id=?'); $s->execute([$fid, $child]);
    if ((int) $s->fetchColumn()) { return; }
    $pdo->prepare('INSERT INTO family_children(family_id,child_id) VALUES(?,?)')->execute([$fid, $child]);
    $made['children'][] = (int) $pdo->lastInsertId();
}
function ael_add_note(PDO $pdo, int $pid, string $body, array &$made, string $site): void
{
    $pdo->prepare("INSERT INTO notes(entity_type,entity_id,body) VALUES('person',?,?)")->execute([$pid, $body . "\n\n(" . AEL_SITES[$site]['name'] . ')']);
    $made['notes'][] = (int) $pdo->lastInsertId();
}
/** une personne du fichier ajoutée à la base, avec ses événements, ses notes et ses liens vers les fiches déjà là */
function ael_add_person(PDO $pdo, array $data, int $inc, array &$map, array &$made, string $site): int
{
    $p = $data['persons'][(string) $inc] ?? $data['persons'][$inc] ?? null; if (!$p) { throw new LcndaBadInput('Personne introuvable dans le fichier reçu : reçois le fichier de nouveau.'); }
    $cut = static fn($v) => mb_substr((string) $v, 0, 200);
    $pdo->prepare('INSERT INTO persons(first_name,middle_name,last_name,prefix,suffix,gender,living_status,unique_id) VALUES(?,?,?,?,?,?,?,?)')
        ->execute([$cut($p['first_name']), $cut($p['middle_name']), $cut($p['last_name']), $cut($p['prefix']), $cut($p['suffix']), in_array($p['gender'], ['male', 'female', 'nonbinary'], true) ? $p['gender'] : 'unknown',
            in_array($p['living_status'], ['living', 'deceased'], true) ? $p['living_status'] : 'unknown', (string) $p['uid'] !== '' ? (string) $p['uid'] : null]);
    $pid = (int) $pdo->lastInsertId(); $made['persons'][] = $pid; $map[$inc] = $pid;
    foreach ($p['events'] as $e) { ael_insert_event($pdo, $e, $pid, null, $made, $site); }
    foreach ($p['notes'] as $n) { ael_add_note($pdo, $pid, (string) $n, $made, $site); }
    foreach ($data['families'] as $f) {
        $a = $f['p1'] ? ($map[$f['p1']] ?? $map[(string) $f['p1']] ?? null) : null; $b = $f['p2'] ? ($map[$f['p2']] ?? $map[(string) $f['p2']] ?? null) : null;
        $isPartner = in_array($inc, [(int) $f['p1'], (int) $f['p2']], true);
        if ($isPartner && ($a || $b)) {
            if ($a && $b) { $fid = ael_family($pdo, $a, $b, $made); if (in_array($fid, $made['families'] ?? [], true)) { foreach ($f['events'] as $e) { ael_insert_event($pdo, $e, null, $fid, $made, $site); } } } else { $fid = 0; }
            foreach ($f['kids'] as $k) { // ses enfants déjà dans la base, sans parents
                $c = $map[$k] ?? $map[(string) $k] ?? null; if (!$c || $c === $pid) { continue; }
                $s = $pdo->prepare('SELECT count(*) FROM family_children WHERE child_id=?'); $s->execute([$c]);
                if ((int) $s->fetchColumn()) { continue; }
                ael_link_child($pdo, $fid ?: ael_family($pdo, $a, $b, $made), $c, $made);
            }
        }
        if (in_array($inc, array_map('intval', $f['kids']), true) && ($a || $b)) {
            ael_link_child($pdo, ael_family($pdo, $a, $b, $made), $pid, $made);
        }
    }
    if (function_exists('rebuild_search')) { try { rebuild_search($pdo, $pid); } catch (Throwable $_) {} }
    return $pid;
}
function ael_receive_data(PDO $pdo, int $rid): array
{
    $s = $pdo->prepare('SELECT data_json FROM ael_receives WHERE id=?'); $s->execute([$rid]);
    $d = json_decode((string) $s->fetchColumn(), true);
    if (!is_array($d)) { throw new LcndaBadInput('Réception introuvable.'); }
    $d['map'] = array_map('intval', (array) ($d['map'] ?? []));
    return $d;
}
function ael_save_map(PDO $pdo, int $rid, array $data): void
{
    $pdo->prepare('UPDATE ael_receives SET data_json=? WHERE id=?')->execute([json_encode($data, JSON_UNESCAPED_UNICODE), $rid]);
}

/** ✓ appliquer des lignes ; choice (pour « À vérifier ») : same | new */
function ael_apply(PDO $pdo, array $d): array
{
    ael_tables($pdo);
    $ids = array_values(array_unique(array_filter(array_map('intval', (array) ($d['ids'] ?? [])))));
    if (!$ids) { throw new LcndaBadInput('Aucune ligne choisie.'); }
    $choice = in_array($d['choice'] ?? '', ['same', 'new'], true) ? (string) $d['choice'] : 'same';
    $done = []; $touched = [];
    $pdo->beginTransaction();
    try {
        $s = $pdo->prepare("SELECT * FROM ael_lines WHERE id=? AND status='pending'");
        $datas = [];
        foreach ($ids as $id) {
            $s->execute([$id]); $l = $s->fetch(PDO::FETCH_ASSOC); if (!$l) { continue; }
            $site = (string) $l['site']; $rid = (int) $l['receive_id'];
            $datas[$rid] ??= ael_receive_data($pdo, $rid);
            $data = &$datas[$rid];
            $x = json_decode((string) $l['detail_json'], true) ?: [];
            $made = ['events' => [], 'persons' => [], 'families' => [], 'children' => [], 'notes' => [], 'updates' => [], 'map' => []];
            switch ($l['kind']) {
                case 'event': ael_insert_event($pdo, $x['event'], (int) $x['person_id'], null, $made, $site); $touched[(int) $x['person_id']] = true; break;
                case 'note': ael_add_note($pdo, (int) $x['person_id'], (string) $x['body'], $made, $site); $touched[(int) $x['person_id']] = true; break;
                case 'diff':
                    $q = $pdo->prepare('SELECT id, date_text, year, sort_date, place_id FROM events WHERE id=? AND person_id=?'); $q->execute([(int) $x['event_id'], (int) $x['person_id']]);
                    $prev = $q->fetch(PDO::FETCH_ASSOC); if (!$prev) { throw new LcndaBadInput('L’événement de ta fiche n’existe plus : reçois le fichier de nouveau.'); }
                    $e = $x['event'];
                    $pdo->prepare('UPDATE events SET date_text=?, year=?, sort_date=?, place_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
                        ->execute([$e['date_text'] !== '' ? $e['date_text'] : $prev['date_text'], $e['year'] ?? $prev['year'], $e['year'] !== null ? ($e['sort_date'] ?? null) : $prev['sort_date'], ael_place_id($pdo, $e['place'] ?? []) ?? $prev['place_id'], (int) $prev['id']]);
                    $made['updates'][] = $prev; $touched[(int) $x['person_id']] = true; break;
                case 'couple':
                    $fid = ael_family($pdo, (int) $x['a'], (int) $x['b'], $made);
                    if (in_array($fid, $made['families'], true)) { foreach ($x['events'] ?? [] as $e) { ael_insert_event($pdo, $e, null, $fid, $made, $site); } }
                    $touched[(int) $x['a']] = $touched[(int) $x['b']] = true; break;
                case 'child': ael_link_child($pdo, ael_family($pdo, $x['a'] ? (int) $x['a'] : null, $x['b'] ? (int) $x['b'] : null, $made), (int) $x['child'], $made); $touched[(int) $x['child']] = true; break;
                case 'person': $pid = ael_add_person($pdo, $data, (int) $x['inc'], $data['map'], $made, $site); $made['map'][] = (int) $x['inc']; $touched[$pid] = true; break;
                case 'check':
                    if ($choice === 'new' || !empty($d['choices'][(string) $id]) && $d['choices'][(string) $id] === 'new') { $pid = ael_add_person($pdo, $data, (int) $x['inc'], $data['map'], $made, $site); $made['map'][] = (int) $x['inc']; $touched[$pid] = true; }
                    else { $data['map'][(int) $x['inc']] = (int) $x['candidate']; $made['map'][] = (int) $x['inc']; foreach ($x['missing'] ?? [] as $e) { ael_insert_event($pdo, $e, (int) $x['candidate'], null, $made, $site); } $touched[(int) $x['candidate']] = true; $made['choice'] = 'same'; }
                    break;
                default: continue 2;
            }
            $pdo->prepare("UPDATE ael_lines SET status='applied', applied_json=?, decided_at=CURRENT_TIMESTAMP WHERE id=?")->execute([json_encode($made), $id]);
            if ($made['map']) { ael_save_map($pdo, $rid, $data); }
            unset($data);
            $done[] = $id;
        }
        if ($done) { log_change($pdo, 'meta', 0, 'update', '🌐 Reçu d’un arbre en ligne : ' . count($done) . ' changement(s) ajouté(s)'); }
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    if (function_exists('rebuild_search')) { foreach (array_keys($touched) as $pid) { try { rebuild_search($pdo, (int) $pid); } catch (Throwable $_) {} } }
    return ['ok' => true, 'applied' => $done];
}
function ael_dismiss(PDO $pdo, array $d): array
{
    ael_tables($pdo);
    $ids = array_values(array_filter(array_map('intval', (array) ($d['ids'] ?? []))));
    $n = 0; $s = $pdo->prepare("UPDATE ael_lines SET status='dismissed', decided_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'");
    foreach ($ids as $id) { $s->execute([$id]); $n += $s->rowCount(); }
    return ['ok' => true, 'dismissed' => $n];
}
/** ↶ : ce qu'une ligne a ajouté est retiré (dans l'ordre inverse), ce qu'elle a changé est remis ; la ligne revient « à décider » */
function ael_undo(PDO $pdo, array $d): array
{
    ael_tables($pdo);
    $ids = array_values(array_filter(array_map('intval', (array) ($d['ids'] ?? []))));
    rsort($ids);
    $n = 0; $touched = [];
    $pdo->beginTransaction();
    try {
        $s = $pdo->prepare('SELECT * FROM ael_lines WHERE id=?');
        foreach ($ids as $id) {
            $s->execute([$id]); $l = $s->fetch(PDO::FETCH_ASSOC); if (!$l || $l['status'] === 'pending') { continue; }
            if ($l['status'] === 'applied') {
                $m = json_decode((string) $l['applied_json'], true) ?: [];
                foreach (array_reverse($m['updates'] ?? []) as $u) { $pdo->prepare('UPDATE events SET date_text=?, year=?, sort_date=?, place_id=? WHERE id=?')->execute([$u['date_text'], $u['year'], $u['sort_date'], $u['place_id'], (int) $u['id']]); }
                foreach ($m['notes'] ?? [] as $x) { $pdo->prepare('DELETE FROM notes WHERE id=?')->execute([(int) $x]); }
                foreach ($m['children'] ?? [] as $x) { $pdo->prepare('DELETE FROM family_children WHERE id=?')->execute([(int) $x]); }
                foreach ($m['events'] ?? [] as $x) { $pdo->prepare("DELETE FROM source_links WHERE entity_type='event' AND entity_id=?")->execute([(int) $x]); $pdo->prepare('DELETE FROM events WHERE id=?')->execute([(int) $x]); }
                foreach ($m['families'] ?? [] as $x) { $pdo->prepare('DELETE FROM family_children WHERE family_id=?')->execute([(int) $x]); $pdo->prepare('DELETE FROM families WHERE id=?')->execute([(int) $x]); }
                foreach ($m['persons'] ?? [] as $x) { $pdo->prepare('DELETE FROM persons WHERE id=?')->execute([(int) $x]); }
                if (!empty($m['map'])) { $data = ael_receive_data($pdo, (int) $l['receive_id']); foreach ($m['map'] as $inc) { unset($data['map'][(int) $inc]); } ael_save_map($pdo, (int) $l['receive_id'], $data); }
                $x = json_decode((string) $l['detail_json'], true) ?: [];
                foreach (['person_id', 'candidate', 'child', 'a', 'b'] as $k) { if (!empty($x[$k])) { $touched[(int) $x[$k]] = true; } }
            }
            $pdo->prepare("UPDATE ael_lines SET status='pending', applied_json=NULL, decided_at=NULL WHERE id=?")->execute([$id]);
            $n++;
        }
        if ($n) { log_change($pdo, 'meta', 0, 'update', '↶ Arbre en ligne : ' . $n . ' changement(s) annulé(s)'); }
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    if (function_exists('rebuild_search')) { foreach (array_keys($touched) as $pid) { try { rebuild_search($pdo, (int) $pid); } catch (Throwable $_) {} } }
    return ['ok' => true, 'undone' => $n];
}

function ael_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'enligne_status' => ael_status($pdo),
        'enligne_changes' => ['site' => ael_site_key($q['site'] ?? '')] + ael_changes($pdo, ael_site_key($q['site'] ?? '')),
        'enligne_lines' => ael_lines($pdo, (string) ($q['site'] ?? '')),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
function ael_api_post(PDO $pdo, string $action, array $d): array
{
    return match ($action) {
        'enligne_receive' => ael_receive($pdo, $_FILES['file'] ?? null, (string) ($_POST['site'] ?? $d['site'] ?? '')),
        'enligne_sent' => ael_sent($pdo, $d),
        'enligne_sent_undo' => ael_sent_undo($pdo, $d),
        'enligne_apply' => ael_apply($pdo, $d),
        'enligne_dismiss' => ael_dismiss($pdo, $d),
        'enligne_undo' => ael_undo($pdo, $d),
        'enligne_settings' => ael_settings($pdo, $d),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
