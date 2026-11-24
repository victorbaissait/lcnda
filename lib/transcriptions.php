<?php
declare(strict_types=1);

/**
 * 📜 Transcription d'actes (interface : assets/js/heritage-transcribe.js) : l'image d'un acte (un média de la base),
 * son texte, les zones de l'image reliées à des passages du texte, et ce qui a été repéré (noms, dates, lieux, métiers),
 * relié aux fiches. Table créée à la première utilisation (sans changer le numéro de structure).
 */

/*
 * 📄 Un seul texte par document (maquette docs/design/dossier-et-transcriptions.html, B1 ; essai tests/test-transcription-unique.js) :
 * le texte de l'Atelier de transcription EST la transcription du document. media.transcription en garde une copie à jour à chaque
 * enregistrement de l'Atelier (la recherche, les listes, la page du document, l'export la lisent sans rien changer chez elles) ;
 * la case de la visionneuse écrit dans l'acte quand l'image n'en a qu'un ; avec plusieurs actes sur une image, un bloc par acte
 * (titre puis texte), et chacun se modifie dans l'Atelier. Les textes d'avant qui différaient : gardés l'un sous l'autre
 * (migration 102, act_doc_text_merge_all).
 */
const TRANSCRIPTION_KINDS = ['apreciser', 'naissance', 'bapteme', 'mariage', 'deces', 'sepulture', 'notarial', 'notoriete', 'recensement', 'militaire', 'lettre', 'autre'];

function act_transcriptions_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS act_transcriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'apreciser',
        media_id INTEGER, date_text TEXT NOT NULL DEFAULT '', place TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
        data_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_act_transcriptions_media ON act_transcriptions(media_id)');
    // 🕘 Versions (vague 2) : le texte de l'acte (et ses zones, ses personnes) à chaque enregistrement, et avant chaque gros changement
    $pdo->exec("CREATE TABLE IF NOT EXISTS act_transcription_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, act_id INTEGER NOT NULL, label TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
        data_json TEXT NOT NULL DEFAULT '{}', auto INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_act_transcription_versions_act ON act_transcription_versions(act_id)');
    // ⚖️ une lecture gardée (écriture à la main, lecture approfondie, OCR, fusion) : d'où elle vient (« htr:modèle », « deep:modèle », « ocr », « merge ») ; jamais effacée toute seule
    $cols = array_column($pdo->query('PRAGMA table_info(act_transcription_versions)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    if (!in_array('source', $cols, true)) { try { $pdo->exec("ALTER TABLE act_transcription_versions ADD COLUMN source TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {} } // base en lecture seule : rien
    $done = true;
}

/* ═════════ 🕘 Versions du texte d'un acte (la fenêtre commune « 🕘 Versions », app-versions.js) ═════════ */
const ACT_VERSIONS_AUTO_MAX = 60; // versions automatiques gardées par acte (les plus anciennes partent ; les nommées restent)

/** les zones et les personnes seulement : ce qui dépend du texte (les réglages de l'image n'ont pas de versions) */
function act_version_data(PDO $pdo, $data): array
{
    $c = act_transcription_clean_data($pdo, is_array($data) ? $data : []);
    return ['zones' => $c['zones'], 'people' => $c['people']] + (isset($c['reviewed']) ? ['reviewed' => $c['reviewed']] : []);
}

function act_transcription_versions(PDO $pdo, int $actId): array
{
    act_transcriptions_ensure($pdo);
    $s = $pdo->prepare('SELECT id, label, auto, created_at, body, source FROM act_transcription_versions WHERE act_id=? ORDER BY id DESC'); $s->execute([$actId]);
    return array_map(static function ($r) { $b = (string) $r['body'];
        return ['id' => (int) $r['id'], 'label' => (string) $r['label'], 'auto' => (int) $r['auto'], 'source' => (string) $r['source'], 'created_at' => $r['created_at'], 'words' => count(preg_split('/\s+/u', trim($b), -1, PREG_SPLIT_NO_EMPTY)), 'lines' => count(array_filter(explode("\n", $b), static fn($l) => trim($l) !== ''))]; }, $s->fetchAll());
}

function act_transcription_version(PDO $pdo, int $id): array
{
    act_transcriptions_ensure($pdo);
    $s = $pdo->prepare('SELECT * FROM act_transcription_versions WHERE id=?'); $s->execute([$id]); $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Version introuvable.'); }
    return ['id' => (int) $r['id'], 'act_id' => (int) $r['act_id'], 'label' => (string) $r['label'], 'auto' => (int) $r['auto'], 'source' => (string) ($r['source'] ?? ''), 'created_at' => $r['created_at'], 'body' => (string) $r['body'], 'data' => json_decode((string) $r['data_json'], true) ?: new stdClass()];
}

/** une version : ↺ « avant le retour », « ＋ Enregistrer la version actuelle », ou avant un gros changement (auto) ; restore_id + created_at : ↶ Annuler d'une suppression */
function save_act_transcription_version(PDO $pdo, array $data): array
{
    act_transcriptions_ensure($pdo);
    $actId = safe_int($data['act_id'] ?? 0);
    $e = $pdo->prepare('SELECT 1 FROM act_transcriptions WHERE id=?'); $e->execute([$actId]);
    if (!$e->fetchColumn()) { throw new RuntimeException('Transcription introuvable.'); }
    $body = mb_substr(str_replace("\0", '', (string) (is_scalar($data['body'] ?? '') ? ($data['body'] ?? '') : '')), 0, 200000);
    $label = mb_substr(safe_text($data['label'] ?? ''), 0, 120) ?: 'Version du ' . date('d/m/Y à H:i');
    $json = json_encode(act_version_data($pdo, $data['data'] ?? []), JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) ?: '{}';
    $id = safe_int($data['restore_id'] ?? 0); $at = (string) ($data['created_at'] ?? '');
    $at = preg_match('/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/', $at) ? str_replace('T', ' ', $at) : null;
    if ($id > 0) { $u = $pdo->prepare('SELECT 1 FROM act_transcription_versions WHERE id=?'); $u->execute([$id]); if ($u->fetchColumn()) { $id = 0; } }
    $source = mb_substr(preg_replace('/[^\p{L}\p{N}:._\- \/]+/u', '', (string) ($data['source'] ?? '')), 0, 120);
    $pdo->prepare('INSERT INTO act_transcription_versions(id, act_id, label, body, data_json, auto, created_at, source) VALUES(?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP),?)')
        ->execute([$id > 0 ? $id : null, $actId, $label, $body, $json, empty($data['auto']) || $source !== '' ? 0 : 1, $id > 0 ? $at : null, $source]); // une lecture n'est jamais une version automatique (elle reste)
    $vid = (int) $pdo->lastInsertId();
    $pdo->prepare('DELETE FROM act_transcription_versions WHERE act_id=? AND auto=1 AND id NOT IN (SELECT id FROM act_transcription_versions WHERE act_id=? AND auto=1 ORDER BY id DESC LIMIT ' . ACT_VERSIONS_AUTO_MAX . ')')->execute([$actId, $actId]);
    return ['id' => $vid, 'label' => $label];
}

/** à chaque enregistrement : une version automatique si le texte a changé depuis la dernière */
function act_version_on_save(PDO $pdo, int $actId, string $body, array $data): void
{
    $s = $pdo->prepare('SELECT body FROM act_transcription_versions WHERE act_id=? ORDER BY id DESC LIMIT 1'); $s->execute([$actId]); $last = $s->fetchColumn();
    if ($last !== false && (string) $last === $body) { return; }
    save_act_transcription_version($pdo, ['act_id' => $actId, 'label' => 'Enregistré', 'body' => $body, 'data' => $data, 'auto' => 1]);
}

function delete_act_transcription_version(PDO $pdo, array $data): array
{
    $old = act_transcription_version($pdo, safe_int($data['id'] ?? 0));
    $pdo->prepare('DELETE FROM act_transcription_versions WHERE id=?')->execute([$old['id']]);
    return ['id' => $old['id'], 'version' => $old];
}

function restore_act_transcription_version(PDO $pdo, array $data): array
{
    $v = is_array($data['version'] ?? null) ? $data['version'] : [];
    return save_act_transcription_version($pdo, ['act_id' => $v['act_id'] ?? 0, 'label' => $v['label'] ?? '', 'body' => $v['body'] ?? '', 'data' => $v['data'] ?? [], 'auto' => !empty($v['auto']), 'source' => (string) ($v['source'] ?? ''), 'restore_id' => $v['id'] ?? 0, 'created_at' => $v['created_at'] ?? null]);
}

function rename_act_transcription_version(PDO $pdo, array $data): array
{
    $old = act_transcription_version($pdo, safe_int($data['id'] ?? 0));
    $label = mb_substr(trim(safe_text($data['label'] ?? '')), 0, 120);
    if ($label === '') { throw new LcndaBadInput('Donne un nom à la version.'); }
    $pdo->prepare('UPDATE act_transcription_versions SET label=?, auto=0 WHERE id=?')->execute([$label, $old['id']]);
    return ['id' => $old['id'], 'label' => $label];
}

/** 🧩 « ⤓ Tableur » : les actes d'une sorte avec leur gabarit (heritage-transcribe.js gabSheet), 5 000 au plus, dans l'ordre des dates */
function act_gabarits(PDO $pdo, string $kind): array
{
    act_transcriptions_ensure($pdo);
    if (!in_array($kind, TRANSCRIPTION_KINDS, true)) { return []; }
    $pdo->sqliteCreateFunction('act_year', static fn($v) => act_transcription_year($v === null ? '' : (string) $v), 1);
    $s = $pdo->prepare("SELECT id, title, date_text, place, source, json_extract(data_json, '$.gabarit') AS g FROM act_transcriptions WHERE kind = ? ORDER BY act_year(date_text) IS NULL, act_year(date_text), date_text, id LIMIT 5000");
    $s->execute([$kind]);
    return array_map(static function ($r) { $g = json_decode((string) ($r['g'] ?? ''), true);
        return ['id' => (int) $r['id'], 'title' => (string) $r['title'], 'date_text' => (string) $r['date_text'], 'place' => (string) $r['place'], 'source' => (string) $r['source'], 'gabarit' => is_array($g) ? $g : null]; }, $s->fetchAll(PDO::FETCH_ASSOC));
}

function act_transcriptions_list(PDO $pdo): array
{
    act_transcriptions_ensure($pdo);
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'title' => $r['title'], 'kind' => $r['kind'], 'date_text' => $r['date_text'], 'place' => $r['place'], 'media_id' => (int) $r['media_id'],
        'filename' => (string) ($r['filename'] ?? ''), 'thumb' => (string) ($r['thumb'] ?? ''), 'updated_at' => $r['updated_at'], 'chars' => (int) $r['chars'], 'people' => (int) $r['people']],
        $pdo->query("SELECT t.id, t.title, t.kind, t.date_text, t.place, t.media_id, t.updated_at, length(t.body) AS chars, COALESCE(json_array_length(t.data_json, '$.people'), 0) AS people,
            m.filename, COALESCE(NULLIF(m.thumbnail,''), m.filename) AS thumb FROM act_transcriptions t LEFT JOIN media m ON m.id=t.media_id ORDER BY t.updated_at DESC")->fetchAll());
}

/** l'année d'une date d'acte écrite librement (« 23 mars 1790 », « vers 1784 », « 1790-03-23 ») */
function act_transcription_year(?string $text): ?int
{
    return preg_match('/(?<!\d)(9\d\d|1\d{3}|20\d\d)(?!\d)/', (string) $text, $m) ? (int) $m[1] : null;
}

/**
 * Listes → « Transcriptions d'actes » : une page de la liste (lecture seule), avec recherche, filtres et tri faits en SQL.
 * q : titre, texte, personnes, lieu, cote ; kinds : sortes d'acte ; person : n° de fiche reliée ; place : lieu (texte) ;
 * from / to : années ; status : todo / doing / done ; zones / linked : 1 ; sort : recent, old, date, az, za ; offset, limit.
 */
function act_transcriptions_page(PDO $pdo, array $q): array
{
    act_transcriptions_ensure($pdo);
    $pdo->sqliteCreateFunction('act_year', static fn($v) => act_transcription_year($v === null ? '' : (string) $v), 1);
    $where = []; $args = [];
    $text = trim(safe_text($q['q'] ?? ''));
    if ($text !== '') {
        // sans accents ni majuscules (lc_fold, comme la recherche de l'app) : titre, texte, personnes, lieu, cote, date
        $hay = "lc_fold(t.title || ' ' || t.place || ' ' || t.source || ' ' || t.date_text || ' ' || COALESCE(json_extract(t.data_json, '$.people'), '') || ' ' || t.body)";
        foreach (array_slice(preg_split('/\s+/u', $text) ?: [], 0, 6) as $w) {
            $f = function_exists('search_fold') ? search_fold($w) : mb_strtolower($w);
            if ($f === '') { continue; }
            $where[] = "instr($hay, ?) > 0"; $args[] = $f;
        }
    }
    $kinds = array_values(array_intersect(array_map('strval', is_array($q['kinds'] ?? null) ? $q['kinds'] : array_filter(explode(',', (string) ($q['kinds'] ?? '')))), TRANSCRIPTION_KINDS));
    if ($kinds) { $where[] = 't.kind IN (' . implode(',', array_fill(0, count($kinds), '?')) . ')'; array_push($args, ...$kinds); }
    $person = safe_int($q['person'] ?? 0);
    if ($person) { $where[] = "EXISTS (SELECT 1 FROM json_each(t.data_json, '$.people') j WHERE CAST(json_extract(j.value, '$.person_id') AS INTEGER) = ?)"; $args[] = $person; }
    $place = trim(safe_text($q['place'] ?? ''));
    if ($place !== '') { $where[] = "t.place LIKE ? ESCAPE '\\'"; $args[] = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $place) . '%'; }
    $from = safe_int($q['from'] ?? 0); $to = safe_int($q['to'] ?? 0);
    // CAST : PDO envoie les valeurs en texte, et pour SQLite un nombre est toujours « plus petit » qu'un texte (le filtre ne trouvait rien)
    if ($from) { $where[] = 'act_year(t.date_text) >= CAST(? AS INTEGER)'; $args[] = $from; }
    if ($to) { $where[] = 'act_year(t.date_text) <= CAST(? AS INTEGER)'; $args[] = $to; }
    $statusSql = "COALESCE(NULLIF(json_extract(t.data_json, '$.status'), ''), CASE WHEN trim(t.body) = '' THEN 'todo' ELSE 'doing' END)";
    $status = (string) ($q['status'] ?? '');
    if (in_array($status, ['todo', 'doing', 'checked', 'done'], true)) { $where[] = "$statusSql = ?"; $args[] = $status; }
    if (!empty($q['zones'])) { $where[] = "COALESCE(json_array_length(t.data_json, '$.zones'), 0) > 0"; }
    if (!empty($q['linked'])) { $where[] = "EXISTS (SELECT 1 FROM json_each(t.data_json, '$.people') j WHERE CAST(json_extract(j.value, '$.person_id') AS INTEGER) > 0)"; }
    $sql = ' FROM act_transcriptions t LEFT JOIN media m ON m.id=t.media_id' . ($where ? ' WHERE ' . implode(' AND ', $where) : '');
    $order = ['recent' => 't.updated_at DESC, t.id DESC', 'old' => 't.updated_at ASC, t.id ASC', 'date' => 'act_year(t.date_text) IS NULL, act_year(t.date_text) ASC, t.date_text ASC, t.id ASC',
        'az' => 't.title COLLATE NOCASE ASC, t.id ASC', 'za' => 't.title COLLATE NOCASE DESC, t.id DESC'][(string) ($q['sort'] ?? '')] ?? 't.updated_at DESC, t.id DESC';
    $limit = max(1, min(200, safe_int($q['limit'] ?? 50) ?: 50)); $offset = max(0, safe_int($q['offset'] ?? 0));
    $c = $pdo->prepare('SELECT count(*)' . $sql); $c->execute($args); $total = (int) $c->fetchColumn();
    $s = $pdo->prepare("SELECT t.id, t.title, t.kind, t.date_text, t.place, t.source, t.media_id, t.updated_at, substr(t.body, 1, 600) AS excerpt,
        (length(t.body) - length(replace(t.body, char(10), '')) + (CASE WHEN trim(t.body) = '' THEN 0 ELSE 1 END)) AS line_count,
        COALESCE(json_array_length(t.data_json, '$.zones'), 0) AS zone_count, json_extract(t.data_json, '$.people') AS people_json, $statusSql AS status,
        COALESCE(NULLIF(m.thumbnail,''), m.filename) AS thumb" . $sql . " ORDER BY $order LIMIT $limit OFFSET $offset");
    $s->execute($args);
    $items = array_map(static function ($r) {
        $people = array_values(array_filter(array_map(static fn($p) => is_array($p) ? ['name' => (string) ($p['name'] ?? ''), 'role' => (string) ($p['role'] ?? ''), 'person_id' => (int) ($p['person_id'] ?? 0)] : null, json_decode((string) $r['people_json'], true) ?: [])));
        return ['id' => (int) $r['id'], 'title' => (string) $r['title'], 'kind' => (string) $r['kind'], 'date_text' => (string) $r['date_text'], 'year' => act_transcription_year($r['date_text']), 'place' => (string) $r['place'], 'source' => (string) $r['source'],
            'media_id' => (int) $r['media_id'], 'thumb' => (string) ($r['thumb'] ?? ''), 'updated_at' => (string) $r['updated_at'], 'excerpt' => (string) $r['excerpt'], 'lines' => (int) $r['line_count'], 'zones' => (int) $r['zone_count'], 'people' => $people, 'status' => (string) $r['status']];
    }, $s->fetchAll());
    // le nombre de chaque sorte d'acte (pour « Filtrer ▾ »), sur toute la base
    $kindCounts = [];
    foreach ($pdo->query('SELECT kind, count(*) AS n FROM act_transcriptions GROUP BY kind')->fetchAll() as $r) { $kindCounts[(string) $r['kind']] = (int) $r['n']; }
    return ['items' => $items, 'total' => $total, 'offset' => $offset, 'limit' => $limit, 'kinds' => $kindCounts, 'all' => array_sum($kindCounts)];
}

/** les transcriptions d'actes faites sur une image (pour la visionneuse) */
function act_transcriptions_for_media(PDO $pdo, int $mediaId): array
{
    act_transcriptions_ensure($pdo);
    $s = $pdo->prepare('SELECT id, title, kind, date_text, place, source, body, data_json, updated_at, media_id FROM act_transcriptions WHERE media_id=? ORDER BY id LIMIT 20'); $s->execute([$mediaId]);
    $rows = $s->fetchAll();
    // 📑 l'image est une page d'un acte en plusieurs pages (un seul texte) : cet acte aussi, marqué page_of
    if (!$rows && ($owner = act_page_owner($pdo, $mediaId))) { $o = $pdo->prepare('SELECT id, title, kind, date_text, place, source, body, data_json, updated_at, media_id FROM act_transcriptions WHERE id=?'); $o->execute([$owner]); $rows = $o->fetchAll(); }
    $hide = act_doc_hidden_ids($pdo);
    return array_map(static function ($r) use ($hide, $mediaId) { $r['page_of'] = (int) $r['media_id'] !== $mediaId ? (int) $r['media_id'] : 0; unset($r['media_id']); $d = json_decode((string) $r['data_json'], true) ?: []; unset($r['data_json']);
        $r['id'] = (int) $r['id']; $r['zones'] = count(is_array($d['zones'] ?? null) ? $d['zones'] : []);
        $r['status'] = in_array($d['status'] ?? '', ['todo', 'doing', 'checked', 'done'], true) ? $d['status'] : (trim((string) $r['body']) === '' ? 'todo' : 'doing');
        if ($hide) { $d['people'] = array_values(array_filter(is_array($d['people'] ?? null) ? $d['people'] : [], static fn($p) => is_array($p) && !isset($hide[(int) ($p['person_id'] ?? 0)]))); } $r['people'] = array_values(array_map(static fn($p) => ['name' => (string) ($p['name'] ?? ''), 'role' => (string) ($p['role'] ?? ''), 'person_id' => (int) ($p['person_id'] ?? 0)], array_filter(is_array($d['people'] ?? null) ? $d['people'] : [], 'is_array'))); return $r;     }, $rows);
}

function act_transcription_get(PDO $pdo, int $id): array
{
    act_transcriptions_ensure($pdo);
    $s = $pdo->prepare('SELECT t.*, m.filename, m.title AS media_title FROM act_transcriptions t LEFT JOIN media m ON m.id=t.media_id WHERE t.id=?');
    $s->execute([$id]); $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Transcription introuvable.'); }
    return ['id' => (int) $r['id'], 'title' => $r['title'], 'kind' => $r['kind'], 'media_id' => (int) $r['media_id'], 'filename' => (string) $r['filename'], 'media_title' => (string) $r['media_title'],
        'date_text' => $r['date_text'], 'place' => $r['place'], 'source' => $r['source'], 'body' => $r['body'], 'data' => json_decode((string) $r['data_json'], true) ?: new stdClass(), 'updated_at' => $r['updated_at']];
}

/** les zones, les repérages et les liens : des nombres, des textes courts, des numéros de fiche ; rien d'autre n'est gardé */
function act_transcription_clean_data(PDO $pdo, $data): array
{
    $data = is_array($data) ? $data : [];
    // « 1e999 » est un nombre pour PHP mais devient l'infini : json_encode échouait et les zones et personnes de l'acte étaient perdues
    $num = static fn($v) => is_numeric($v) && is_finite((float) $v) ? max(-1e7, min(1e7, round((float) $v, 4))) : 0;
    $zones = [];
    foreach (array_slice(is_array($data['zones'] ?? null) ? $data['zones'] : [], 0, 2000) as $z) {
        if (!is_array($z)) { continue; }
        $zones[] = ['id' => mb_substr(preg_replace('/[^\w-]/', '', (string) ($z['id'] ?? '')), 0, 24), 'x' => $num($z['x'] ?? 0), 'y' => $num($z['y'] ?? 0), 'w' => $num($z['w'] ?? 0), 'h' => $num($z['h'] ?? 0),
            's' => max(0, (int) ($z['s'] ?? 0)), 'e' => max(0, (int) ($z['e'] ?? 0)), 'note' => mb_substr(safe_text($z['note'] ?? ''), 0, 300), 'c' => preg_match('/^#[0-9a-f]{6}$/i', (string) ($z['c'] ?? '')) ? $z['c'] : ''] + (in_array($z['src'] ?? '', ['htr', 'ocr', 'deep'], true) ? ['src' => $z['src']] : [])
            + (safe_int($z['p'] ?? 0) > 0 ? ['p' => safe_int($z['p'])] : []); // p : la page (n° du média) d'un acte en plusieurs pages ; absente = l'image de l'acte // src : posée par une lecture (sinon dessinée à la main)
    }
    $people = [];
    foreach (array_slice(is_array($data['people'] ?? null) ? $data['people'] : [], 0, 200) as $p) {
        if (!is_array($p)) { continue; }
        $pid = safe_int($p['person_id'] ?? 0);
        if ($pid) { $c = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $c->execute([$pid]); if (!$c->fetchColumn()) { $pid = 0; } }
        $people[] = ['name' => mb_substr(safe_text($p['name'] ?? ''), 0, 160), 'role' => mb_substr(safe_text($p['role'] ?? ''), 0, 60), 'person_id' => $pid, 's' => max(0, (int) ($p['s'] ?? 0)), 'e' => max(0, (int) ($p['e'] ?? 0))];
    }
    $range = static fn($v, float $min, float $max, float $def) => is_numeric($v) && is_finite((float) $v) ? max($min, min($max, round((float) $v, 3))) : $def;
    // « 🎚 Mieux voir » : les réglages de l'image retenus pour cet acte (des nombres bornés, rien d'autre)
    $cleanOne = static function ($view) use ($range): array {
    $view = is_array($view) ? $view : [];
    $rot = ((int) ($view['rot'] ?? 0) % 360 + 360) % 360;
    return ['contrast' => $range($view['contrast'] ?? 100, 50, 300, 100), 'bright' => $range($view['bright'] ?? 100, 40, 220, 100), 'invert' => !empty($view['invert']), 'rot' => $rot - $rot % 90, 'gray' => !empty($view['gray']),
        'sharp' => $range($view['sharp'] ?? 0, 0, 300, 0), 'sharpR' => $range($view['sharpR'] ?? 1.5, .5, 5, 1.5), 'clahe' => $range($view['clahe'] ?? 0, 0, 100, 0),
        'channel' => in_array($view['channel'] ?? '', ['', 'r', 'g', 'b'], true) ? (string) ($view['channel'] ?? '') : '', 'thr' => $range($view['thr'] ?? 0, 0, 254, 0),
        'lvB' => $range($view['lvB'] ?? 0, 0, 200, 0), 'lvW' => $range($view['lvW'] ?? 255, 55, 255, 255), 'lvG' => $range($view['lvG'] ?? 1, .3, 3, 1),
        'bg' => !empty($view['bg']), 'tilt' => $range($view['tilt'] ?? 0, -10, 10, 0), 'mirror' => !empty($view['mirror'])];
    };
    $cleanView = $cleanOne($data['view'] ?? []);
    // 📑 plusieurs pages (un seul texte) : les réglages de l'image de chaque page (n° du média → réglages), 200 pages au plus
    $pageViews = [];
    foreach (array_slice(is_array($data['pageViews'] ?? null) ? $data['pageViews'] : [], 0, 200, true) as $mid => $pv) { if (safe_int($mid) > 0 && is_array($pv)) { $pageViews[(string) safe_int($mid)] = $cleanOne($pv); } }
    $status = in_array($data['status'] ?? '', ['todo', 'doing', 'checked', 'done'], true) ? $data['status'] : '';
    // 🧩 le gabarit (heritage-transcribe-gabarit.js) : la sorte d'acte et ses cases {v, s, e, ok, own} — du texte borné, 40 cases au plus
    $gabarit = null; $gb = is_array($data['gabarit'] ?? null) ? $data['gabarit'] : null;
    if ($gb && in_array($gb['kind'] ?? '', TRANSCRIPTION_KINDS, true)) {
        $gf = [];
        foreach (array_slice(is_array($gb['fields'] ?? null) ? $gb['fields'] : [], 0, 40, true) as $k => $f) {
            if (!is_string($k) || !preg_match('/^[a-z0-9_]{1,24}$/', $k) || !is_array($f)) { continue; }
            $v = mb_substr(safe_text(is_scalar($f['v'] ?? '') ? (string) ($f['v'] ?? '') : ''), 0, 300); if ($v === '') { continue; }
            $gf[$k] = ['v' => $v, 's' => max(-1, (int) ($f['s'] ?? -1)), 'e' => max(-1, (int) ($f['e'] ?? -1))] + (!empty($f['ok']) ? ['ok' => true] : []) + (!empty($f['own']) ? ['own' => true] : []);
        }
        // les cases ajoutées dans l'acte (« ＋ Ajouter une case ») : leur nom, 20 au plus
        $gx = [];
        foreach (array_slice(is_array($gb['extra'] ?? null) ? $gb['extra'] : [], 0, 20) as $x) {
            $xk = is_array($x) ? (string) ($x['key'] ?? '') : ''; $xl = is_array($x) ? mb_substr(safe_text(is_scalar($x['label'] ?? '') ? (string) ($x['label'] ?? '') : ''), 0, 60) : '';
            if (preg_match('/^x_[a-z0-9_]{1,22}$/', $xk) && $xl !== '' && !in_array($xk, array_column($gx, 'key'), true)) { $gx[] = ['key' => $xk, 'label' => $xl]; }
        }
        $gabarit = ['kind' => $gb['kind'], 'fields' => (object) $gf] + ($gx ? ['extra' => $gx] : []);
    }
    // 📜 le texte lu autour de l'acte sur une capture d'écran (« Saint-Amand-Montrond, 1807-1809, N, M, D », « 139 / 268 ») : pour la source
    $frame = mb_substr(safe_text(is_string($data['frame_text'] ?? null) ? $data['frame_text'] : ''), 0, 600);
    // 🌐 la traduction gardée avec la transcription (« Traduire », lib/plus_famille.php) : du texte, borné
    $translation = mb_substr(str_replace("\0", '', is_string($data['translation'] ?? null) ? $data['translation'] : ''), 0, 40000);
    // 👁 les lignes relues (relecture ligne à ligne) : l'empreinte de chaque ligne relue, de courts textes en base 36
    $reviewed = array_values(array_unique(array_filter(array_slice(is_array($data['reviewed'] ?? null) ? $data['reviewed'] : [], -5000), static fn($k) => is_string($k) && preg_match('/^[0-9a-z]{1,10}$/', $k))));
    // 📑 un acte en plusieurs pages, un seul texte coupé par « — page 2 — » : les médias des morceaux du texte, dans l'ordre du texte
    $pages = array_values(array_unique(array_filter(array_map('safe_int', array_slice(is_array($data['pages'] ?? null) ? $data['pages'] : [], 0, 200)), static fn($v) => $v > 0)));
    return ['zones' => $zones, 'people' => $people, 'view' => $cleanView, 'status' => $status] + (count($pages) >= 2 ? ['pages' => $pages] : []) + ($pageViews ? ['pageViews' => $pageViews] : []) + ($gabarit ? ['gabarit' => $gabarit] : []) + ($frame !== '' ? ['frame_text' => $frame] : []) + ($translation !== '' ? ['translation' => $translation] : []) + ($reviewed ? ['reviewed' => $reviewed] : []);
}

function save_act_transcription(PDO $pdo, array $data): array
{
    act_transcriptions_ensure($pdo);
    $id = safe_int($data['id'] ?? 0);
    $mediaId = safe_int($data['media_id'] ?? 0);
    if ($mediaId) { $c = $pdo->prepare('SELECT 1 FROM media WHERE id=?'); $c->execute([$mediaId]);
        // « ↶ Annuler » d'une suppression : si l'image a été supprimée entre-temps, le texte revient quand même (sans image)
        if (!$c->fetchColumn()) { if (empty($data['restore'])) { throw new RuntimeException('Image de l’acte introuvable.'); } $mediaId = 0; } }
    $kind = in_array($data['kind'] ?? '', TRANSCRIPTION_KINDS, true) ? $data['kind'] : 'apreciser'; // « À préciser », comme l'Atelier
    $oldMedia = 0;
    if ($id) { $om = $pdo->prepare('SELECT media_id FROM act_transcriptions WHERE id=?'); $om->execute([$id]); $oldMedia = (int) $om->fetchColumn(); }
    $title = mb_substr(safe_text($data['title'] ?? ''), 0, 200) ?: 'Acte sans titre';
    $body = mb_substr(str_replace("\0", '', (string) (is_scalar($data['body'] ?? '') ? ($data['body'] ?? '') : '')), 0, 200000);
    // 📄 le premier acte d'une image qui avait déjà un texte (case de la visionneuse, OCR…) : ce texte est gardé sous le nouveau (jamais écrasé)
    if ($mediaId && $oldMedia !== $mediaId) {
        $o = $pdo->prepare('SELECT count(*) FROM act_transcriptions WHERE media_id=? AND id<>?'); $o->execute([$mediaId, $id]);
        if (!(int) $o->fetchColumn()) {
            $mt = $pdo->prepare("SELECT COALESCE(transcription,'') FROM media WHERE id=?"); $mt->execute([$mediaId]); $was = trim(str_replace("\r\n", "\n", (string) $mt->fetchColumn()));
            if ($was !== '' && !str_contains(str_replace("\r\n", "\n", $body), $was)) { $body = mb_substr(trim($body) === '' ? $was : rtrim($body) . "\n\n———\n" . $was, 0, 200000); }
        }
    }
    $json = json_encode(act_transcription_clean_data($pdo, $data['data'] ?? []), JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($json === false) { throw new RuntimeException('Zones ou personnes de l’acte illisibles : rien n’a été changé.'); }
    $vals = [$title, $kind, $mediaId ?: null, mb_substr(safe_text($data['date_text'] ?? ''), 0, 120), mb_substr(safe_text($data['place'] ?? ''), 0, 160), mb_substr(safe_text($data['source'] ?? ''), 0, 300), $body, $json];
    if ($id) {
        $s = $pdo->prepare('UPDATE act_transcriptions SET title=?, kind=?, media_id=?, date_text=?, place=?, source=?, body=?, data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?');
        $s->execute([...$vals, $id]);
        if (!$s->rowCount()) {
            // « ↶ Annuler » après une suppression : la transcription revient avec son numéro
            if (empty($data['restore'])) { throw new RuntimeException('Transcription introuvable.'); }
            $pdo->prepare('INSERT INTO act_transcriptions(id, title, kind, media_id, date_text, place, source, body, data_json) VALUES(?,?,?,?,?,?,?,?,?)')->execute([$id, ...$vals]);
        }
    } else {
        $pdo->prepare('INSERT INTO act_transcriptions(title, kind, media_id, date_text, place, source, body, data_json) VALUES(?,?,?,?,?,?,?,?)')->execute($vals);
        $id = (int) $pdo->lastInsertId();
    }
    // 📄 un seul texte par document : la copie du média suit (visionneuse, page du document, recherche, listes, export) ;
    // l'ancienne image d'un acte déplacé garde son texte si elle n'a plus d'acte
    media_doc_text_sync($pdo, $mediaId);
    if ($oldMedia && $oldMedia !== $mediaId) { media_doc_text_sync($pdo, $oldMedia); }
    act_pages_text_sync($pdo, $mediaId, $body, json_decode($json, true) ?: []); // 📑 chaque autre page reçoit son morceau du texte
    act_version_on_save($pdo, $id, $body, is_array($data['data'] ?? null) ? $data['data'] : []); // 🕘 une version à chaque enregistrement (si le texte a changé)
    log_change($pdo, 'meta', 0, 'update', 'Transcription d’acte enregistrée : ' . $title);
    return ['id' => $id, 'body' => $body];
}

function delete_act_transcription(PDO $pdo, array $data): array
{
    act_transcriptions_ensure($pdo);
    $id = safe_int($data['id'] ?? 0);
    $m = $pdo->prepare('SELECT media_id FROM act_transcriptions WHERE id=?'); $m->execute([$id]); $mediaId = (int) $m->fetchColumn();
    $pdo->prepare('DELETE FROM act_transcriptions WHERE id=?')->execute([$id]);
    media_doc_text_sync($pdo, $mediaId); // le dernier acte parti : le média garde son texte (rien n'est perdu)
    return ['ok' => true];
}

function rename_act_transcription(PDO $pdo, array $data): array
{
    act_transcriptions_ensure($pdo);
    $name = mb_substr(safe_text($data['name'] ?? ''), 0, 200);
    if ($name === '') { throw new RuntimeException('Nom manquant.'); }
    $id = safe_int($data['id'] ?? 0);
    $pdo->prepare('UPDATE act_transcriptions SET title=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$name, $id]);
    $m = $pdo->prepare('SELECT media_id FROM act_transcriptions WHERE id=?'); $m->execute([$id]); media_doc_text_sync($pdo, (int) $m->fetchColumn()); // le titre d'un bloc (plusieurs actes)
    return ['ok' => true];
}

/** pour chaque nom repéré : les fiches de la base qui lui ressemblent (nom de famille et prénom) */
function act_transcription_match_people(PDO $pdo, array $names): array
{
    $out = [];
    foreach (array_slice($names, 0, 60) as $name) {
        $name = trim(safe_text($name)); if (mb_strlen($name) < 3) { $out[] = []; continue; }
        $words = array_values(array_filter(preg_split('/[\s,\-]+/u', $name) ?: [], static fn($w) => mb_strlen($w) >= 2));
        if (!$words) { $out[] = []; continue; }
        $last = end($words); $first = $words[0];
        $s = $pdo->prepare("SELECT p.id, p.first_name, p.last_name,
            (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT' LIMIT 1) AS birth_year,
            (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='DEAT' LIMIT 1) AS death_year
            FROM persons p WHERE p.last_name LIKE ? COLLATE NOCASE " . (count($words) > 1 ? 'AND p.first_name LIKE ? COLLATE NOCASE' : '') . ' LIMIT 6');
        $s->execute(count($words) > 1 ? ['%' . $last . '%', '%' . $first . '%'] : ['%' . $last . '%']);
        $out[] = array_map(static fn($r) => ['id' => (int) $r['id'], 'name' => trim($r['first_name'] . ' ' . $r['last_name']), 'years' => trim(($r['birth_year'] ?: '?') . '–' . ($r['death_year'] ?: ''), '–')], $s->fetchAll());
    }
    return $out;
}

/* ═════════ 📄 Un seul texte par document ═════════ */

/** les actes transcrits sur une image, dans l'ordre où ils ont été faits */
function media_doc_acts(PDO $pdo, int $mediaId): array
{
    if ($mediaId <= 0) { return []; }
    act_transcriptions_ensure($pdo);
    $s = $pdo->prepare('SELECT id, title, body, updated_at FROM act_transcriptions WHERE media_id=? ORDER BY id'); $s->execute([$mediaId]);
    return $s->fetchAll(PDO::FETCH_ASSOC);
}

/** le texte du document fait de ses actes : le texte seul pour un acte ; un bloc par acte (titre, puis texte) pour plusieurs */
function media_doc_text_of(array $acts): string
{
    if (count($acts) === 1) { return (string) $acts[0]['body']; }
    return implode("\n\n", array_map(static fn($a) => trim((string) $a['title']) . "\n" . rtrim((string) $a['body']), $acts));
}

/** après un enregistrement de l'Atelier : la copie du média suit (sans acte, le média garde son texte) */
function media_doc_text_sync(PDO $pdo, int $mediaId): void
{
    $acts = media_doc_acts($pdo, $mediaId); if (!$acts) { return; }
    $pdo->prepare("UPDATE media SET transcription=? WHERE id=? AND COALESCE(transcription,'')<>?")->execute([$text = media_doc_text_of($acts), $mediaId, $text]);
}

/**
 * La case de la visionneuse (ou la fenêtre du média) envoie un texte : avec un seul acte, c'est aussi le texte de l'acte ;
 * avec plusieurs, chacun se modifie dans l'Atelier ($strict : refus avec une phrase ; sinon le texte d'avant est gardé).
 * Rend le texte à garder dans le média.
 */
function media_doc_text_accept(PDO $pdo, int $mediaId, string $text, string $before, bool $strict = false): string
{
    $acts = media_doc_acts($pdo, $mediaId);
    if (!$acts) { return $text; }
    if (count($acts) === 1) {
        if ((string) $acts[0]['body'] !== $text) { $pdo->prepare('UPDATE act_transcriptions SET body=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([mb_substr($text, 0, 200000), (int) $acts[0]['id']]); }
        return $text;
    }
    $all = media_doc_text_of($acts);
    if (str_replace("\r\n", "\n", $text) === str_replace("\r\n", "\n", $all)) { return $all; }
    if ($strict) { throw new RuntimeException('Ce document a plusieurs actes : chacun se modifie dans l’📜 Atelier de transcription.'); }
    return $before;
}

/**
 * Migration 102 : quand un document avait les deux (case de la visionneuse et transcription de l'Atelier) et qu'ils différaient,
 * les deux sont gardés l'un sous l'autre : le texte de l'Atelier d'abord (ses zones restent à leur place), puis, après un trait,
 * celui de la visionneuse. Rien n'est effacé. Rejouable : une fois fait, la copie du média est le texte des actes.
 */
function act_doc_text_merge_all(PDO $pdo): int
{
    if (!(bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='act_transcriptions'")->fetchColumn()) { return 0; }
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_act_transcriptions_media ON act_transcriptions(media_id)');
    $n = 0;
    $ids = $pdo->query('SELECT DISTINCT t.media_id FROM act_transcriptions t JOIN media m ON m.id=t.media_id WHERE t.media_id IS NOT NULL')->fetchAll(PDO::FETCH_COLUMN);
    $mt = $pdo->prepare('SELECT COALESCE(transcription,\'\') FROM media WHERE id=?');
    $acts = $pdo->prepare('SELECT id, title, body, updated_at FROM act_transcriptions WHERE media_id=? ORDER BY id');
    foreach ($ids as $mid) {
        $mid = (int) $mid;
        $mt->execute([$mid]); $media = trim(str_replace("\r\n", "\n", (string) $mt->fetchColumn()));
        $acts->execute([$mid]); $list = $acts->fetchAll(PDO::FETCH_ASSOC);
        if (!$list) { continue; }
        $all = trim(str_replace("\r\n", "\n", media_doc_text_of($list)));
        $inActs = $media === '' || $media === $all || str_contains($all, $media);
        foreach ($list as $a) { if (trim(str_replace("\r\n", "\n", (string) $a['body'])) === $media) { $inActs = true; } }
        if (!$inActs) {
            // l'acte qui reçoit le texte de la visionneuse : le premier vide, sinon le plus récent
            $target = null;
            foreach ($list as $a) { if (trim((string) $a['body']) === '') { $target = $a; break; } }
            if (!$target) { usort($list, static fn($x, $y) => strcmp((string) $y['updated_at'], (string) $x['updated_at']) ?: ((int) $y['id'] <=> (int) $x['id'])); $target = $list[0]; }
            $body = trim((string) $target['body']) === '' ? $media : rtrim((string) $target['body']) . "\n\n———\n" . $media;
            $pdo->prepare('UPDATE act_transcriptions SET body=? WHERE id=?')->execute([$body, (int) $target['id']]);
            $n++;
        }
        $acts->execute([$mid]);
        $text = media_doc_text_of($acts->fetchAll(PDO::FETCH_ASSOC));
        $pdo->prepare("UPDATE media SET transcription=? WHERE id=? AND COALESCE(transcription,'')<>?")->execute([$text, $mid, $text]);
    }
    return $n;
}

/** mode consultation, appareil invité : les fiches qu'on ne nomme pas (vivantes, confidentielles) → [id => true] */
function act_doc_hidden_ids(PDO $pdo): array
{
    if (!function_exists('kiosk_state') || empty(kiosk_state()['on'])) { return []; }
    $priv = (bool) $pdo->query("SELECT count(*) FROM pragma_table_info('persons') WHERE name='is_private'")->fetchColumn();
    return array_fill_keys(array_map('intval', $pdo->query("SELECT id FROM persons WHERE COALESCE(living_status,'')='living'" . ($priv ? ' OR COALESCE(is_private,0)=1' : ''))->fetchAll(PDO::FETCH_COLUMN)), true);
}

/**
 * 👤 « 📜 Actes et transcriptions » sur la fiche (maquette B4) : chaque document où la personne est reliée (le média, ou un de ses
 * événements) ou relevée dans l'Atelier (numéro de fiche), avec son rôle et un extrait ; et, si on le veut, les noms relevés pas
 * encore reliés qui lui ressemblent (« à relier » : jamais relié tout seul).
 */
function act_transcriptions_for_person(PDO $pdo, int $pid, bool $withGuess = true): array
{
    if ($pid <= 0) { return []; }
    act_transcriptions_ensure($pdo);
    $hide = act_doc_hidden_ids($pdo); if (isset($hide[$pid])) { return []; }
    $sealed = function_exists('sealed_media_sql') ? sealed_media_sql($pdo, 'm.id') : '';
    $out = [];
    $excerpt = static function (string $t, string $needle = ''): string {
        $t = trim(preg_replace('/\s+/u', ' ', $t) ?? ''); if ($t === '') { return ''; }
        $at = $needle !== '' ? mb_stripos($t, $needle) : false; $from = $at !== false && $at > 60 ? $at - 60 : 0;
        return ($from ? '… ' : '') . mb_substr($t, $from, 180) . (mb_strlen($t) > $from + 180 ? '…' : '');
    };
    $p = $pdo->prepare('SELECT first_name, last_name FROM persons WHERE id=?'); $p->execute([$pid]); $me = $p->fetch(PDO::FETCH_ASSOC) ?: ['first_name' => '', 'last_name' => ''];
    // 1. les actes de l'Atelier où elle est relevée avec son numéro de fiche (ou, à relier, un nom qui lui ressemble)
    $fold = static fn($s) => function_exists('search_fold') ? search_fold((string) $s) : mb_strtolower((string) $s);
    $last = $fold($me['last_name']); $first = $fold(preg_split('/[\s-]+/u', trim((string) $me['first_name']))[0] ?? '');
    $like = $withGuess && mb_strlen($last) >= 2 ? ' OR t.data_json LIKE ? COLLATE NOCASE' : '';
    $s = $pdo->prepare("SELECT t.id, t.title, t.kind, t.date_text, t.place, t.body, t.data_json, t.media_id, m.filename, COALESCE(NULLIF(m.thumbnail,''), m.filename) AS thumb
        FROM act_transcriptions t LEFT JOIN media m ON m.id=t.media_id WHERE (t.data_json LIKE ?{$like}){$sealed} ORDER BY t.date_text, t.id LIMIT 300");
    $s->execute($like ? ['%"person_id":' . $pid . '%', '%' . $me['last_name'] . '%'] : ['%"person_id":' . $pid . '%']);
    $seenMedia = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $people = json_decode((string) $r['data_json'], true)['people'] ?? [];
        $hit = null; $guess = null;
        foreach ((is_array($people) ? $people : []) as $i => $q) {
            if (!is_array($q)) { continue; }
            if ((int) ($q['person_id'] ?? 0) === $pid) { $hit = $q; break; }
            if ($withGuess && !$guess && (int) ($q['person_id'] ?? 0) === 0 && $last !== '') {
                $n = $fold($q['name'] ?? ''); $w = preg_split('/[\s,-]+/u', $n) ?: [];
                if (in_array($last, $w, true) && ($first === '' || in_array($first, $w, true))) { $guess = $q + ['i' => $i]; }
            }
        }
        if (!$hit && !$guess) { continue; }
        $q = $hit ?: $guess;
        $out[] = ['act_id' => (int) $r['id'], 'media_id' => (int) $r['media_id'], 'title' => (string) $r['title'], 'kind' => (string) $r['kind'], 'date_text' => (string) $r['date_text'], 'place' => (string) $r['place'],
            'role' => mb_substr((string) ($q['role'] ?? ''), 0, 60), 'name' => mb_substr((string) ($q['name'] ?? ''), 0, 160), 'state' => $hit ? 'linked' : 'tolink', 'index' => $hit ? -1 : (int) $guess['i'],
            'excerpt' => $excerpt((string) $r['body'], (string) ($q['name'] ?? '')), 'filename' => (string) ($r['filename'] ?? ''), 'thumb' => (string) ($r['thumb'] ?? '')];
        if ($hit && $r['media_id']) { $seenMedia[(int) $r['media_id']] = true; }
    }
    // 2. les documents transcrits reliés à la fiche (le média, un de ses événements, un de ses couples)
    $m = $pdo->prepare("SELECT DISTINCT m.id, m.title, m.document_title, m.filename, COALESCE(NULLIF(m.thumbnail,''), m.filename) AS thumb, COALESCE(m.date_text,'') AS date_text, m.transcription
        FROM media_links ml JOIN media m ON m.id=ml.media_id
        WHERE ((ml.entity_type='person' AND ml.entity_id=?) OR (ml.entity_type='event' AND ml.entity_id IN (SELECT id FROM events WHERE person_id=? OR family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?)))
            OR (ml.entity_type='family' AND ml.entity_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?)))
            AND trim(COALESCE(m.transcription,''))<>''{$sealed} ORDER BY m.date_text, m.id LIMIT 60");
    $m->execute([$pid, $pid, $pid, $pid, $pid, $pid]);
    foreach ($m->fetchAll(PDO::FETCH_ASSOC) as $r) {
        if (isset($seenMedia[(int) $r['id']])) { continue; }
        $a = $pdo->prepare('SELECT id, kind FROM act_transcriptions WHERE media_id=? ORDER BY id LIMIT 1'); $a->execute([(int) $r['id']]); $act = $a->fetch(PDO::FETCH_ASSOC) ?: null;
        $out[] = ['act_id' => $act ? (int) $act['id'] : 0, 'media_id' => (int) $r['id'], 'title' => trim((string) $r['title']) ?: trim((string) $r['document_title']) ?: (string) $r['filename'], 'kind' => $act ? (string) $act['kind'] : '',
            'date_text' => (string) $r['date_text'], 'place' => '', 'role' => '', 'name' => '', 'state' => 'media', 'index' => -1, 'excerpt' => $excerpt((string) $r['transcription'], (string) $me['last_name']),
            'filename' => (string) $r['filename'], 'thumb' => (string) $r['thumb']];
    }
    return array_slice($out, 0, 80);
}

/** « Relier » un nom relevé dans l'Atelier à une fiche (sur la fiche : « à relier » → Relier ; ↶ Annuler remet « was ») */
function act_link_person(PDO $pdo, array $data): array
{
    act_transcriptions_ensure($pdo);
    $id = safe_int($data['id'] ?? 0); $i = (int) ($data['index'] ?? -1); $pid = safe_int($data['person_id'] ?? 0); $was = safe_int($data['was'] ?? 0);
    $s = $pdo->prepare('SELECT data_json, media_id, title FROM act_transcriptions WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new RuntimeException('Transcription introuvable.'); }
    $d = json_decode((string) $r['data_json'], true) ?: [];
    if (!isset($d['people'][$i]) || !is_array($d['people'][$i])) { throw new RuntimeException('Ce nom n’est plus dans la transcription.'); }
    if ((int) ($d['people'][$i]['person_id'] ?? 0) !== $was) { throw new RuntimeException('Ce nom a été relié entre-temps : rien n’a été changé.'); }
    if ($pid) { $c = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $c->execute([$pid]); if (!$c->fetchColumn()) { throw new RuntimeException('Fiche introuvable.'); } }
    $d['people'][$i]['person_id'] = $pid;
    $pdo->prepare('UPDATE act_transcriptions SET data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([json_encode($d, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE), $id]);
    log_change($pdo, 'meta', 0, 'update', ($pid ? 'Nom relié dans la transcription : ' : 'Nom délié dans la transcription : ') . $r['title']);
    return ['ok' => true, 'id' => $id, 'index' => $i, 'person_id' => $pid, 'was' => $was];
}

/* ═════════ 📑 Un acte en plusieurs pages (lib/media_pages.php ; assets/js/heritage-transcribe-pages.js) ═════════ */

/** les repères « — page 2 — » du texte : une ligne entière « — <un mot> <nombre> — » (le mot dépend de la langue de l'écran) */
const ACT_PAGE_MARK = '/^—[ \t]*[\p{L}.]+[ \t]+\d+[^\n—]*—[ \t]*$/mu';

/** le texte coupé en morceaux, un par page (dans l'ordre du texte) : [texte du morceau 0, du morceau 1…] */
function act_page_segments(string $body): array
{
    $body = str_replace("\r\n", "\n", $body);
    if (!preg_match_all(ACT_PAGE_MARK, $body, $m, PREG_OFFSET_CAPTURE)) { return [$body]; }
    $out = []; $from = 0;
    foreach ($m[0] as [$line, $at]) { $out[] = substr($body, $from, max(0, $at - 1 - $from)); $from = min(strlen($body), $at + strlen($line) + 1); }
    $out[] = substr($body, $from);
    return $out;
}

/** l'acte « un seul texte » dont ce média est une page (0 : aucun) */
function act_page_owner(PDO $pdo, int $mediaId): int
{
    if ($mediaId <= 0) { return 0; }
    act_transcriptions_ensure($pdo);
    $s = $pdo->prepare("SELECT t.id FROM act_transcriptions t WHERE t.data_json LIKE '%\"pages\"%' AND EXISTS (SELECT 1 FROM json_each(t.data_json, '$.pages') j WHERE CAST(j.value AS INTEGER) = ?) ORDER BY t.id LIMIT 1");
    $s->execute([$mediaId]);
    return (int) $s->fetchColumn();
}

/**
 * Après l'enregistrement d'un acte en plusieurs pages : chaque autre page (sans acte à elle) reçoit son morceau du texte dans
 * media.transcription (la recherche, la visionneuse, la page du document la lisent). Jamais d'écrasement : un texte de la page
 * qui n'est pas déjà dans l'acte reste tel quel (l'Atelier le reprend à la prochaine ouverture).
 */
function act_pages_text_sync(PDO $pdo, int $mediaId, string $body, array $data): void
{
    $pages = is_array($data['pages'] ?? null) ? array_map('intval', $data['pages']) : [];
    if (count($pages) < 2) { return; }
    $seg = act_page_segments($body); $flat = str_replace("\r\n", "\n", $body);
    $own = $pdo->prepare('SELECT count(*) FROM act_transcriptions WHERE media_id=?');
    $cur = $pdo->prepare("SELECT COALESCE(transcription,'') FROM media WHERE id=?");
    $put = $pdo->prepare('UPDATE media SET transcription=? WHERE id=?');
    foreach ($pages as $i => $mid) {
        if ($mid <= 0 || $mid === $mediaId || !array_key_exists($i, $seg)) { continue; }
        $own->execute([$mid]); if ((int) $own->fetchColumn()) { continue; }
        $cur->execute([$mid]); $was = $cur->fetchColumn(); if ($was === false) { continue; }
        $was = trim(str_replace("\r\n", "\n", (string) $was)); $text = trim($seg[$i]);
        if ($was === $text || ($was !== '' && !str_contains($flat, $was))) { continue; }
        $put->execute([$text, $mid]);
    }
}
