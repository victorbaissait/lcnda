<?php
declare(strict_types=1);

/**
 * Outils de recherche et de partage (structure n°10, lib/migrations.php) :
 *  - 📥 dossier « Scans » surveillé : chaque fichier qui y arrive entre dans les médias (à identifier) ;
 *  - ⛪ paroisses d'Ancien Régime : « avant 1790, chercher dans les registres de la paroisse de X » ;
 *  - 🔎 index des noms cités dans les transcriptions (témoins, voisins, curés, parrains) ;
 *  - 🔎 voyages impossibles : une même fiche à deux endroits trop éloignés en trop peu de temps ;
 *  - 🤝 travail à deux : paquets de modifications échangés entre deux copies de la même base ;
 *  - 🔒 mode consultation : l'application ne peut plus rien modifier tant qu'on ne donne pas le mot de passe.
 */

/* ─── 🔒 Mode consultation ───────────────────────────────────────────── */

function kiosk_path(): string { return DATA_DIR . '/consultation.json'; }

function kiosk_state(): array
{
    $raw = is_file(kiosk_path()) ? json_decode((string) file_get_contents(kiosk_path()), true) : null;
    return is_array($raw) && !empty($raw['hash']) ? ['on' => true, 'since' => (string) ($raw['since'] ?? '')] : ['on' => false, 'since' => ''];
}

/**
 * Appelé au tout début d'api.php et d'upload.php : en mode consultation, aucune écriture (sauf sortir du mode, les
 * réglages d'affichage et la sauvegarde automatique) et aucun export.
 */
function kiosk_guard(string $action, bool $isWrite): void
{
    // Réglages d'affichage en consultation : l'écran les garde pour la séance, mais rien n'est écrit dans la base
    // (un visiteur ne peut pas y glisser un réglage piégé pour le propriétaire).
    if ($action === 'save_settings' && kiosk_state()['on']) {
        json_response(['ok' => true, 'saved' => 0, 'kiosk' => true]);
    }
    if (kiosk_state()['on'] && kiosk_blocks($action, $isWrite)) {
        json_response(['error' => 'Mode consultation : rien ne peut être modifié. Pour en sortir, clique sur « Quitter la consultation » et donne le mot de passe.', 'kiosk' => true], 423);
    }
}

/** Ce que le mode consultation refuse : toute écriture (sauf exceptions), les exports et le changement de base. */
function kiosk_blocks(string $action, bool $isWrite): bool
{
    // backup_sqlite : seulement la sauvegarde automatique dans le dossier de l'app (vérifié dans api.php)
    $allowedWrites = ['kiosk_exit', 'save_settings', 'backup_sqlite', 'offsite_copy_now', 'museum_sign']; // le livre d'or du musée se signe aussi en consultation
    $blockedReads = ['export_csv', 'export_csv_global', 'export_gedcom', 'export_json', 'export_sqlite', 'export_full_backup', 'export_research_report', 'export_family_book', 'sync_export', 'vault_download', 'museum_export', 'export_my_list', 'export_custom_block_def'];
    return ($isWrite && !in_array($action, $allowedWrites, true)) || (!$isWrite && in_array($action, $blockedReads, true)) || in_array($action, ['switch_database', 'delete_database', 'clone_database'], true);
}

function kiosk_enter(array $data): array
{
    $password = (string) ($data['password'] ?? '');
    if (mb_strlen($password) < 4) { throw new RuntimeException('Choisis un mot de passe d’au moins 4 caractères.'); }
    if (file_put_contents(kiosk_path(), json_encode(['hash' => password_hash($password, PASSWORD_DEFAULT), 'since' => date('c')])) === false) {
        throw new RuntimeException('Impossible d’activer le mode consultation (dossier des données en lecture seule ?).');
    }
    return kiosk_state();
}

function kiosk_exit(array $data): never
{
    $raw = is_file(kiosk_path()) ? json_decode((string) file_get_contents(kiosk_path()), true) : null;
    if (!is_array($raw) || empty($raw['hash'])) { json_response(['ok' => true, 'on' => false]); }
    usleep(400000); // freine les essais au hasard
    if (!password_verify((string) ($data['password'] ?? ''), (string) $raw['hash'])) { json_response(['error' => 'Mot de passe incorrect.'], 403); }
    @unlink(kiosk_path());
    json_response(['ok' => true, 'on' => false]);
}

/* ─── Réglages rangés dans la base ───────────────────────────────────── */

function ht_setting(PDO $pdo, string $key, array $default = []): array
{
    $stmt = $pdo->prepare('SELECT value FROM app_settings WHERE key=?'); $stmt->execute([$key]);
    $v = json_decode((string) ($stmt->fetchColumn() ?: ''), true);
    return is_array($v) ? $v + $default : $default;
}

function ht_save_setting(PDO $pdo, string $key, array $value): void
{
    $pdo->prepare('INSERT OR REPLACE INTO app_settings(key, value, updated_at) VALUES(?, ?, CURRENT_TIMESTAMP)')->execute([$key, json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
}

/* ─── 📥 Dossier « Scans » surveillé ─────────────────────────────────── */

const SCAN_INBOX_DONE = 'Importés dans LCNDA';
const SCAN_INBOX_TYPES = ['jpg' => 'image', 'jpeg' => 'image', 'png' => 'image', 'webp' => 'image', 'gif' => 'image', 'pdf' => 'pdf', 'heic' => 'convert', 'heif' => 'convert', 'tif' => 'convert', 'tiff' => 'convert'];

function scan_inbox_settings(PDO $pdo): array
{
    return ht_setting($pdo, 'lcnda-scan-inbox', ['dir' => '', 'enabled' => false, 'move_imported' => true]);
}

/** Fichiers du dossier qui n'ont pas encore été importés (les fichiers en cours d'écriture attendent le passage suivant). */
function scan_inbox_pending(PDO $pdo, string $dir): array
{
    $out = [];
    if ($dir === '' || !is_dir($dir)) { return $out; }
    $known = $pdo->prepare('SELECT 1 FROM scan_inbox_files WHERE hash=?');
    foreach (scandir($dir) ?: [] as $name) {
        $path = $dir . '/' . $name;
        if ($name[0] === '.' || !is_file($path)) { continue; }
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if (!isset(SCAN_INBOX_TYPES[$ext])) { continue; }
        clearstatcache(true, $path);
        if (time() - (int) @filemtime($path) < 3) { continue; }
        $hash = @sha1_file($path);
        if (!$hash) { continue; }
        $known->execute([$hash]);
        if ($known->fetchColumn()) { continue; }
        $out[] = ['name' => $name, 'path' => $path, 'ext' => $ext, 'hash' => $hash, 'size' => (int) filesize($path)];
    }
    return $out;
}

function scan_inbox_status(PDO $pdo): array
{
    $s = scan_inbox_settings($pdo);
    $dir = offsite_expand((string) $s['dir']);
    $recent = $pdo->query('SELECT s.filename, s.imported_at, m.id AS media_id, m.title, m.filename AS media_file, m.media_type FROM scan_inbox_files s LEFT JOIN media m ON m.id=s.media_id ORDER BY s.imported_at DESC LIMIT 12')->fetchAll();
    return $s + ['dir' => $dir, 'reachable' => $dir !== '' && is_dir($dir), 'pending' => count(scan_inbox_pending($pdo, $dir)), 'recent' => $recent,
        'can_convert' => scan_inbox_converter() !== null, 'total' => (int) $pdo->query('SELECT count(*) FROM scan_inbox_files')->fetchColumn()];
}

function save_scan_inbox_settings(PDO $pdo, array $data): array
{
    $dir = offsite_expand(safe_text($data['dir'] ?? ''));
    if ($dir !== '' && !is_dir($dir)) { throw new RuntimeException("Dossier introuvable : {$dir}"); }
    ht_save_setting($pdo, 'lcnda-scan-inbox', ['dir' => $dir, 'enabled' => !empty($data['enabled']) && $dir !== '', 'move_imported' => !empty($data['move_imported'])]);
    return scan_inbox_status($pdo);
}

/** Outil de conversion des photos HEIC (iPhone) et TIFF en JPEG : « sips » sur Mac, sinon ImageMagick s'il est là. */
function scan_inbox_converter(): ?string
{
    if (!function_exists('exec')) { return null; }
    foreach (['/usr/bin/sips', '/opt/homebrew/bin/magick', '/usr/local/bin/magick', '/usr/bin/convert'] as $bin) { if (is_executable($bin)) { return $bin; } }
    return null;
}

/** Importe les nouveaux fichiers du dossier (50 au plus par passage). */
function scan_inbox_run(PDO $pdo): never
{
    @set_time_limit(300);
    $s = scan_inbox_settings($pdo);
    $dir = offsite_expand((string) $s['dir']);
    if ($dir === '' || !is_dir($dir)) { json_response(['ok' => false, 'imported' => [], 'error' => $dir === '' ? 'Aucun dossier choisi.' : "Dossier introuvable : {$dir}"]); }
    if (!is_dir(MEDIA_DIR)) { @mkdir(MEDIA_DIR, 0775, true); }
    $imported = []; $skipped = [];
    foreach (array_slice(scan_inbox_pending($pdo, $dir), 0, 50) as $f) {
        try {
            $kind = SCAN_INBOX_TYPES[$f['ext']];
            $ext = $f['ext'] === 'jpeg' ? 'jpg' : $f['ext'];
            $stored = bin2hex(random_bytes(16));
            if ($kind === 'convert') {
                $bin = scan_inbox_converter();
                if (!$bin) { $skipped[] = ['name' => $f['name'], 'reason' => 'format HEIC/TIFF : à convertir en JPEG (aucun outil de conversion trouvé)']; continue; }
                $target = MEDIA_DIR . '/' . $stored . '.jpg';
                $cmd = str_ends_with($bin, 'sips') ? escapeshellarg($bin) . ' -s format jpeg ' . escapeshellarg($f['path']) . ' --out ' . escapeshellarg($target)
                    : escapeshellarg($bin) . ' ' . escapeshellarg($f['path'] . '[0]') . ' ' . escapeshellarg($target);
                exec($cmd . ' 2>&1', $output, $code);
                if ($code !== 0 || !is_file($target)) { $skipped[] = ['name' => $f['name'], 'reason' => 'conversion impossible']; continue; }
                $file = $stored . '.jpg'; $type = 'image';
            } else {
                $file = $stored . '.' . $ext; $type = $kind;
                if (!@copy($f['path'], MEDIA_DIR . '/' . $file)) { $skipped[] = ['name' => $f['name'], 'reason' => 'copie impossible']; continue; }
            }
            $title = pathinfo($f['name'], PATHINFO_FILENAME);
            $pdo->prepare('INSERT INTO media(title, media_type, filename, thumbnail, description) VALUES(?,?,?,?,?)')
                ->execute([$title, $type, $file, $type === 'image' ? $file : '', 'Arrivé par le dossier Scans le ' . date('d/m/Y à H:i') . ' (' . $f['name'] . ')']);
            $mediaId = (int) $pdo->lastInsertId();
            $pdo->prepare('INSERT OR REPLACE INTO scan_inbox_files(hash, filename, media_id) VALUES(?,?,?)')->execute([$f['hash'], $f['name'], $mediaId]);
            if (!empty($s['move_imported'])) {
                $done = $dir . '/' . SCAN_INBOX_DONE;
                if (!is_dir($done)) { @mkdir($done, 0775, true); }
                $dest = $done . '/' . $f['name'];
                if (is_file($dest)) { $dest = $done . '/' . pathinfo($f['name'], PATHINFO_FILENAME) . '-' . date('His') . '.' . $f['ext']; }
                @rename($f['path'], $dest);
            }
            $imported[] = ['name' => $f['name'], 'media_id' => $mediaId];
        } catch (Throwable $e) {
            $skipped[] = ['name' => $f['name'], 'reason' => $e->getMessage()];
        }
    }
    if ($imported) { log_change($pdo, 'media', null, 'upload', count($imported) . ' fichier(s) arrivé(s) par le dossier Scans'); }
    json_response(['ok' => true, 'imported' => $imported, 'skipped' => $skipped, 'pending' => count(scan_inbox_pending($pdo, $dir))]);
}

/* ─── ⛪ Paroisses d'Ancien Régime ───────────────────────────────────── */

function parish_place_search(PDO $pdo, string $q): array
{
    if (mb_strlen($q) < 2) { return []; }
    $stmt = $pdo->prepare("SELECT id, name, county, state, country, admin4_code FROM places WHERE name LIKE ? COLLATE NOCASE
        ORDER BY CASE WHEN name LIKE ? COLLATE NOCASE THEN 0 ELSE 1 END, (SELECT count(*) FROM events e WHERE e.place_id=places.id) DESC, name COLLATE NOCASE LIMIT 15");
    $stmt->execute(["%{$q}%", "{$q}%"]);
    return array_map(static fn($r) => $r + ['label' => implode(', ', array_filter([$r['name'], $r['county'] ?: $r['state'], $r['country']]))], $stmt->fetchAll());
}

function parishes_data(PDO $pdo, string $q = ''): array
{
    $sql = "SELECT pp.*, p.name AS place_name, p.county AS place_county, p.admin4_code AS place_insee, pr.name AS parish_place_name, pr.county AS parish_county,
            (SELECT count(*) FROM events e WHERE e.place_id=pp.place_id AND COALESCE(e.year,0) < pp.until_year) AS old_event_count
        FROM place_parishes pp LEFT JOIN places p ON p.id=pp.place_id LEFT JOIN places pr ON pr.id=pp.parish_place_id";
    $params = [];
    if ($q !== '') { $sql .= ' WHERE p.name LIKE ? OR pp.place_text LIKE ? OR pp.parish_name LIKE ? OR pr.name LIKE ?'; $params = array_fill(0, 4, "%{$q}%"); }
    $stmt = $pdo->prepare($sql . ' ORDER BY COALESCE(p.name, pp.place_text) COLLATE NOCASE');
    $stmt->execute($params);
    return with_labels($pdo, 'parish', $stmt->fetchAll());
}

function save_parish(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $placeId = safe_int($data['place_id'] ?? 0) ?: null;
    $placeText = safe_text($data['place_text'] ?? '');
    $parishPlaceId = safe_int($data['parish_place_id'] ?? 0) ?: null;
    $parishName = safe_text($data['parish_name'] ?? '');
    if (!$placeId && $placeText === '') { throw new RuntimeException('Choisis le lieu (hameau, village) dans les suggestions.'); }
    if ($parishName === '' && $parishPlaceId) { $n = $pdo->prepare('SELECT name FROM places WHERE id=?'); $n->execute([$parishPlaceId]); $parishName = (string) $n->fetchColumn(); }
    if ($parishName === '') { throw new RuntimeException('Indique la paroisse (ex. « Saint-Martin de Brive »).'); }
    $until = max(1000, min(1900, safe_int($data['until_year'] ?? 1790, 1790)));
    $from = safe_int($data['from_year'] ?? 0) ?: null;
    $fields = [$placeId, $placeText, $parishName, $parishPlaceId, $until, $from, h_long($data, 'note', 4000)];
    if ($id) {
        $pdo->prepare('UPDATE place_parishes SET place_id=?, place_text=?, parish_name=?, parish_place_id=?, until_year=?, from_year=?, note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$fields, $id]);
    } else {
        $pdo->prepare('INSERT INTO place_parishes(place_id, place_text, parish_name, parish_place_id, until_year, from_year, note) VALUES(?,?,?,?,?,?,?)')->execute($fields);
        $id = (int) $pdo->lastInsertId();
    }
    log_change($pdo, 'place', $placeId, 'update', 'Paroisse d’Ancien Régime : ' . ($placeText ?: '#' . $placeId) . ' → ' . $parishName);
    return ['id' => $id];
}

function delete_parish(PDO $pdo, array $data): array
{
    $pdo->prepare('DELETE FROM place_parishes WHERE id=?')->execute([safe_int($data['id'] ?? 0)]);
    return ['ok' => true];
}

/** Rattachements par lieu (place_id) et par commune (code INSEE), pour les fiches, les battues et les registres en ligne. */
function parish_map(PDO $pdo): array
{
    $byPlace = []; $byInsee = [];
    foreach (parishes_data($pdo) as $r) {
        $item = ['parish' => $r['parish_name'], 'parish_place_id' => $r['parish_place_id'] ? (int) $r['parish_place_id'] : null, 'until' => (int) $r['until_year'], 'from' => $r['from_year'] ? (int) $r['from_year'] : null, 'note' => $r['note'], 'place' => $r['place_name'] ?: $r['place_text']];
        if ($r['place_id']) { $byPlace[(int) $r['place_id']][] = $item; }
        if ($r['place_insee']) { $byInsee[(string) $r['place_insee']][] = $item; }
    }
    return ['by_place' => $byPlace, 'by_insee' => $byInsee];
}

/** Phrase « Avant 1790, chercher dans les registres de la paroisse de X » pour une commune (code INSEE). */
function parish_register_links(PDO $pdo, string $code): array
{
    $links = [];
    $map = parish_map($pdo)['by_insee'][$code] ?? [];
    foreach ($map as $p) {
        $url = '';
        if ($p['parish_place_id']) {
            $s = $pdo->prepare('SELECT admin4_code, name FROM places WHERE id=?'); $s->execute([$p['parish_place_id']]); $pp = $s->fetch();
            if ($pp && $pp['admin4_code'] && $pp['admin4_code'] !== $code) {
                try { $url = (string) (online_registers($pdo, (string) $pp['admin4_code'], (string) $pp['name'], false)['links'][0]['url'] ?? ''); } catch (Throwable $_) {}
            }
        }
        $links[] = ['label' => '⛪ Avant ' . $p['until'] . ', chercher dans les registres de la paroisse de ' . $p['parish'], 'url' => $url ?: 'https://www.google.com/search?q=' . rawurlencode('registres paroissiaux ' . $p['parish']), 'kind' => 'link',
            'note' => trim(($p['from'] ? 'Depuis ' . $p['from'] . '. ' : '') . $p['note']) ?: 'Rattachement noté dans Listes → Paroisses d’Ancien Régime.'];
    }
    return $links;
}

/* ─── 🔎 Index des noms cités ─────────────────────────────────────────── */

function name_key(string $name): string
{
    return trim((string) preg_replace('/\s+/', ' ', preg_replace('/[^a-z ]/', ' ', strtolower(ascii_fold($name)))));
}

function cited_names_data(PDO $pdo, string $q = ''): array
{
    $where = ''; $params = [];
    if ($q !== '') { $where = ' WHERE c.name LIKE ? COLLATE NOCASE OR c.occupation LIKE ? COLLATE NOCASE OR c.place_text LIKE ? COLLATE NOCASE'; $params = ["%{$q}%", "%{$q}%", "%{$q}%"]; }
    $stmt = $pdo->prepare("SELECT c.*, m.title AS media_title, m.filename AS media_file, m.media_type, trim(p.first_name||' '||p.last_name) AS person_name
        FROM cited_names c LEFT JOIN media m ON m.id=c.media_id LEFT JOIN persons p ON p.id=c.person_id{$where} ORDER BY c.name_key, COALESCE(c.year, 9999)");
    $stmt->execute($params);
    $groups = [];
    foreach (with_labels($pdo, 'cited_name', $stmt->fetchAll()) as $r) {
        $g = &$groups[$r['name_key']];
        $g ??= ['key' => $r['name_key'], 'name' => $r['name'], 'items' => [], 'roles' => [], 'occupations' => [], 'places' => [], 'from' => null, 'to' => null, 'person_id' => null, 'person_name' => ''];
        $g['items'][] = $r;
        foreach (['roles' => 'role', 'occupations' => 'occupation', 'places' => 'place_text'] as $k => $col) { if ($r[$col] !== '' && !in_array($r[$col], $g[$k], true)) { $g[$k][] = $r[$col]; } }
        if ($r['year']) { $g['from'] = $g['from'] === null ? (int) $r['year'] : min($g['from'], (int) $r['year']); $g['to'] = max((int) $g['to'], (int) $r['year']); }
        if ($r['person_id'] && !$g['person_id']) { $g['person_id'] = (int) $r['person_id']; $g['person_name'] = $r['person_name']; }
        unset($g);
    }
    $out = array_values($groups);
    foreach ($out as &$g) { $g['acts'] = count(array_unique(array_map(static fn($i) => $i['media_id'] ?: ($i['event_id'] ? 'e' . $i['event_id'] : 'n' . $i['id']), $g['items']))); }
    unset($g);
    usort($out, static fn($a, $b) => $b['acts'] <=> $a['acts'] ?: strcmp($a['key'], $b['key']));
    return $out;
}

function save_cited_name(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $name = trim(preg_replace('/\s+/u', ' ', safe_text($data['name'] ?? '')));
    if ($name === '') { throw new RuntimeException('Indique le nom.'); }
    $date = safe_text($data['date_text'] ?? '');
    $year = safe_int($data['year'] ?? 0) ?: h_year($date);
    $fields = [$name, name_key($name), safe_text($data['role'] ?? ''), safe_text($data['occupation'] ?? ''), safe_text($data['place_text'] ?? ''), $year ?: null, $date,
        safe_int($data['media_id'] ?? 0) ?: null, safe_int($data['event_id'] ?? 0) ?: null, safe_int($data['person_id'] ?? 0) ?: null, mb_substr(safe_text($data['snippet'] ?? ''), 0, 500), h_long($data, 'note', 4000)];
    if ($id) {
        $pdo->prepare('UPDATE cited_names SET name=?, name_key=?, role=?, occupation=?, place_text=?, year=?, date_text=?, media_id=?, event_id=?, person_id=?, snippet=?, note=? WHERE id=?')->execute([...$fields, $id]);
    } else {
        $pdo->prepare('INSERT INTO cited_names(name, name_key, role, occupation, place_text, year, date_text, media_id, event_id, person_id, snippet, note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')->execute($fields);
        $id = (int) $pdo->lastInsertId();
    }
    // Même nom ailleurs déjà relié à une fiche : on garde le lien, et inversement
    if ($fields[9]) { $pdo->prepare('UPDATE cited_names SET person_id=? WHERE name_key=? AND person_id IS NULL')->execute([$fields[9], $fields[1]]); }
    return ['id' => $id];
}

function delete_cited_name(PDO $pdo, array $data): array
{
    $pdo->prepare('DELETE FROM cited_names WHERE id=?')->execute([safe_int($data['id'] ?? 0)]);
    return ['ok' => true];
}

function transcriptions_list(PDO $pdo, string $q = ''): array
{
    $where = "TRIM(COALESCE(m.transcription,''))<>''";
    $params = [];
    if ($q !== '') { $where .= ' AND (m.title LIKE ? OR m.transcription LIKE ? OR m.document_reference LIKE ?)'; $params = ["%{$q}%", "%{$q}%", "%{$q}%"]; }
    $stmt = $pdo->prepare("SELECT m.id, m.title, m.filename, m.media_type, m.date_text, m.document_reference, substr(m.transcription,1,180) AS excerpt, length(m.transcription) AS length,
        (SELECT count(*) FROM cited_names c WHERE c.media_id=m.id) AS marked FROM media m WHERE {$where} ORDER BY marked, m.id DESC LIMIT 300");
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function media_transcription_detail(PDO $pdo, int $id): array
{
    $stmt = $pdo->prepare('SELECT id, title, filename, media_type, date_text, document_reference, transcription FROM media WHERE id=?'); $stmt->execute([$id]);
    $m = $stmt->fetch();
    if (!$m) { throw new RuntimeException('Média introuvable'); }
    $c = $pdo->prepare("SELECT c.*, trim(p.first_name||' '||p.last_name) AS person_name FROM cited_names c LEFT JOIN persons p ON p.id=c.person_id WHERE c.media_id=? ORDER BY c.id");
    $c->execute([$id]);
    $m['marks'] = $c->fetchAll();
    $m['suggestions'] = cited_name_suggestions($pdo, (string) $m['transcription'], array_column($m['marks'], 'name_key'));
    $l = $pdo->prepare("SELECT e.id, e.date_text, e.year, t.label AS type_label, trim(p.first_name||' '||p.last_name) AS person_name FROM media_links ml JOIN events e ON e.id=ml.entity_id JOIN event_types t ON t.id=e.event_type_id LEFT JOIN persons p ON p.id=e.person_id WHERE ml.media_id=? AND ml.entity_type='event'");
    $l->execute([$id]);
    $m['events'] = $l->fetchAll();
    return $m;
}

const CITED_ROLES = ['parrain', 'marraine', 'témoin', 'curé', 'vicaire', 'prêtre', 'notaire', 'voisin', 'voisine', 'sage-femme', 'officier', 'maire', 'tuteur', 'curateur', 'oncle', 'tante', 'cousin', 'cousine', 'frère', 'sœur', 'beau-frère', 'déclarant'];

/**
 * Noms repérés dans une transcription : un prénom connu (prénoms de la base ou prénoms anciens courants) suivi d'un ou
 * deux mots à majuscule. Le rôle et le métier sont devinés d'après les mots autour. À vérifier à la main.
 */
function cited_name_suggestions(PDO $pdo, string $text, array $already = []): array
{
    if (trim($text) === '') { return []; }
    static $firsts = null;
    if ($firsts === null) {
        $firsts = array_fill_keys(['jean', 'pierre', 'jacques', 'francois', 'louis', 'joseph', 'antoine', 'nicolas', 'michel', 'etienne', 'guillaume', 'charles', 'claude', 'jean-baptiste', 'andre', 'martin', 'mathieu', 'simon', 'philippe', 'paul', 'leonard', 'gabriel', 'denis', 'laurent', 'thomas', 'noel', 'blaise', 'gilles', 'hugues', 'bernard', 'leger', 'marie', 'anne', 'jeanne', 'marguerite', 'catherine', 'francoise', 'louise', 'elisabeth', 'madeleine', 'magdeleine', 'antoinette', 'marthe', 'claudine', 'genevieve', 'toinette', 'perrine', 'suzanne', 'barbe', 'agathe', 'gabrielle', 'jeanne-marie', 'marie-anne', 'rose', 'victoire', 'julie', 'sebastien', 'germain', 'julien', 'yves', 'vincent', 'augustin', 'henri', 'georges', 'auguste', 'victor', 'alexandre', 'benoit'], true);
        foreach ($pdo->query("SELECT DISTINCT lower(first_name) FROM persons WHERE TRIM(COALESCE(first_name,''))<>''")->fetchAll(PDO::FETCH_COLUMN) as $f) {
            foreach (preg_split('/[\s,]+/u', (string) $f) as $part) { $k = strtolower(ascii_fold($part)); if (strlen($k) >= 3) { $firsts[$k] = true; } }
        }
    }
    $already = array_fill_keys($already, true);
    $out = [];
    $word = "[A-ZÀ-ÖØ-Þ][\\p{L}'’-]+";
    // Regard en avant : chaque mot à majuscule est essayé comme début de nom (« Parrain Jacques Martin » donne « Jacques Martin »)
    if (!preg_match_all("/(?<![\\p{L}'’-])(?=({$word}(?:-{$word})?)\\s+((?:(?:de|du|des|le|la|d’|d')\\s*)?{$word}(?:\\s+{$word})?))/u", $text, $m, PREG_OFFSET_CAPTURE | PREG_SET_ORDER)) { return []; }
    foreach ($m as $match) {
        $first = $match[1][0]; $rest = $match[2][0];
        $firstKey = strtolower(ascii_fold(preg_split('/[- ]/', $first)[0]));
        if (!isset($firsts[$firstKey])) { continue; }
        $name = trim($first . ' ' . $rest);
        $key = name_key($name);
        if (isset($already[$key]) || isset($out[$key])) { continue; }
        $pos = (int) $match[0][1];
        $before = mb_strtolower(substr($text, max(0, $pos - 70), min(70, $pos)));
        $len = (int) $match[2][1] + strlen($match[2][0]) - $pos;
        $after = substr($text, $pos + $len, 80);
        $role = '';
        foreach (CITED_ROLES as $r) { if (str_contains($before, $r) || str_contains(mb_strtolower(mb_substr($after, 0, 30)), $r)) { $role = $r; } }
        $occupation = preg_match('/^\s*,\s*([\p{Ll}][\p{L}’\' -]{2,30}?)(?:[,.;]|\s+(?:de|demeurant|habitant|âgé|agé))/u', $after, $o) ? trim($o[1]) : '';
        $snippet = trim(substr($text, max(0, $pos - 50), $len + 100));
        $out[$key] = ['name' => $name, 'role' => $role, 'occupation' => $occupation, 'snippet' => mb_convert_encoding($snippet, 'UTF-8', 'UTF-8')];
    }
    return array_values(array_slice($out, 0, 60));
}

/* ─── 🔎 Voyages impossibles ─────────────────────────────────────────── */

/** Date exacte d'un acte (« 3 mars 1790 », « 1er mars 1790 », « 1790-03-03 », « 03/03/1790 »), sinon null. */
function exact_date(string $text): ?string
{
    $t = mb_strtolower(trim($text));
    if (preg_match('/^(?:le\s+)?(\d{4})-(\d{2})-(\d{2})/', $t, $m)) { return checkdate((int) $m[2], (int) $m[3], (int) $m[1]) ? "{$m[1]}-{$m[2]}-{$m[3]}" : null; }
    if (preg_match('#^(?:le\s+)?(\d{1,2})[/.](\d{1,2})[/.](\d{4})$#', $t, $m)) { return checkdate((int) $m[2], (int) $m[1], (int) $m[3]) ? sprintf('%04d-%02d-%02d', $m[3], $m[2], $m[1]) : null; }
    $months = ['janvier' => 1, 'janv' => 1, 'fevrier' => 2, 'février' => 2, 'fevr' => 2, 'févr' => 2, 'mars' => 3, 'avril' => 4, 'avr' => 4, 'mai' => 5, 'juin' => 6, 'juillet' => 7, 'juil' => 7, 'aout' => 8, 'août' => 8, 'septembre' => 9, 'sept' => 9, 'octobre' => 10, 'oct' => 10, 'novembre' => 11, 'nov' => 11, 'decembre' => 12, 'décembre' => 12, 'dec' => 12, 'déc' => 12,
        'jan' => 1, 'feb' => 2, 'mar' => 3, 'apr' => 4, 'may' => 5, 'jun' => 6, 'jul' => 7, 'aug' => 8, 'sep' => 9, 'oct.' => 10, 'dec.' => 12];
    if (preg_match('/^(?:le\s+)?(\d{1,2})(?:er|e)?\s+([a-zéûè.]+)\s+(\d{4})$/u', $t, $m)) {
        $mo = $months[rtrim($m[2], '.')] ?? $months[$m[2]] ?? null;
        return $mo && checkdate($mo, (int) $m[1], (int) $m[3]) ? sprintf('%04d-%02d-%02d', $m[3], $mo, $m[1]) : null;
    }
    return null;
}

/** Vitesse de déplacement plausible au plus (km par jour) selon l'époque. */
function journey_speed(int $year): ?float
{
    return match (true) { $year < 1830 => 70.0, $year < 1860 => 150.0, $year < 1900 => 400.0, $year < 1930 => 700.0, default => null };
}

function impossible_journeys(PDO $pdo, int $personId = 0): array
{
    $filter = $personId ? ' AND who.pid=' . $personId : '';
    $rows = $pdo->query("SELECT who.pid, who.role, e.id AS event_id, e.date_text, e.year, e.date_calendar, t.label AS type_label,
            COALESCE(e.precise_lat, pl.latitude) AS lat, COALESCE(e.precise_lon, pl.longitude) AS lon, pl.name AS place_name,
            COALESCE((SELECT trim(op.first_name||' '||op.last_name) FROM persons op WHERE op.id=e.person_id),'') AS owner_name
        FROM (
            SELECT id AS eid, person_id AS pid, '' AS role FROM events WHERE person_id IS NOT NULL
            UNION ALL SELECT e.id, f.partner1_id, '' FROM events e JOIN families f ON f.id=e.family_id WHERE f.partner1_id IS NOT NULL
            UNION ALL SELECT e.id, f.partner2_id, '' FROM events e JOIN families f ON f.id=e.family_id WHERE f.partner2_id IS NOT NULL
            UNION ALL SELECT w.event_id, w.person_id, COALESCE(NULLIF(w.note,''),'témoin') FROM event_witnesses w
        ) who JOIN events e ON e.id=who.eid JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id
        WHERE COALESCE(e.precise_lat, pl.latitude) IS NOT NULL AND e.year IS NOT NULL AND e.year < 1930{$filter}")->fetchAll();
    $byPerson = [];
    foreach ($rows as $r) {
        if (($r['date_calendar'] ?? 'gregorian') !== 'gregorian' && $r['date_calendar'] !== '') { continue; }
        $d = exact_date((string) $r['date_text']);
        if (!$d || ((float) $r['lat'] == 0.0 && (float) $r['lon'] == 0.0)) { continue; }
        $r['date'] = $d;
        $byPerson[(int) $r['pid']][$r['event_id'] . '|' . $r['role']] = $r;
    }
    $alerts = [];
    foreach ($byPerson as $pid => $events) {
        $events = array_values($events);
        usort($events, static fn($a, $b) => strcmp($a['date'], $b['date']));
        $n = count($events);
        for ($i = 0; $i < $n; $i++) {
            for ($j = $i + 1; $j < $n; $j++) {
                $days = (strtotime($events[$j]['date']) - strtotime($events[$i]['date'])) / 86400;
                if ($days > 20) { break; }
                if ((int) $events[$i]['event_id'] === (int) $events[$j]['event_id']) { continue; }
                $speed = journey_speed((int) substr($events[$i]['date'], 0, 4));
                if ($speed === null) { continue; }
                $km = h_distance_km((float) $events[$i]['lat'], (float) $events[$i]['lon'], (float) $events[$j]['lat'], (float) $events[$j]['lon']);
                $allowed = $speed * max($days, 0.5);
                if ($km < 30 || $km <= $allowed) { continue; }
                $alerts[] = ['person_id' => $pid, 'km' => round($km), 'days' => (int) $days, 'speed_limit' => $speed, 'a' => $events[$i], 'b' => $events[$j], 'ratio' => round($km / $allowed, 1)];
            }
        }
    }
    usort($alerts, static fn($x, $y) => $y['ratio'] <=> $x['ratio']);
    $people = collection_people($pdo, array_column($alerts, 'person_id'));
    foreach ($alerts as &$a) { $a['person'] = $people[$a['person_id']] ?? null; }
    unset($a);
    return array_slice($alerts, 0, 300);
}

/* ─── 🤝 Travail à deux : paquets de modifications ───────────────────── */

const SYNC_TABLES = ['places', 'persons', 'families', 'family_children', 'events', 'notes'];
const SYNC_REFS = [
    'families' => ['partner1_id' => 'persons', 'partner2_id' => 'persons'],
    'family_children' => ['family_id' => 'families', 'child_id' => 'persons'],
    'events' => ['person_id' => 'persons', 'family_id' => 'families', 'place_id' => 'places'],
];
const SYNC_SKIP = ['id', 'uid', 'source_id', 'created_at', 'updated_at', 'is_bookmarked', 'is_start', 'portrait_media_id', 'surname_group_id', 'is_locked', 'confidence_media_id'];

function sync_settings(PDO $pdo): array
{
    return ht_setting($pdo, 'lcnda-sync', ['base_uid' => '', 'author' => '', 'started_at' => '', 'last_export_at' => '', 'last_import_at' => '']);
}

function sync_columns(PDO $pdo, string $table): array
{
    static $cache = [];
    return $cache[$table] ??= array_values(array_filter(array_column($pdo->query("PRAGMA table_info({$table})")->fetchAll(), 'name'), static fn($c) => !in_array($c, SYNC_SKIP, true)));
}

function sync_assign_uids(PDO $pdo): int
{
    // Une seule requête par table (une écriture par ligne bloquait la base plusieurs minutes sur une grande généalogie)
    $n = 0;
    foreach (SYNC_TABLES as $t) {
        if (!(int) $pdo->query("SELECT EXISTS(SELECT 1 FROM {$t} WHERE uid IS NULL OR uid='')")->fetchColumn()) { continue; }
        $n += (int) $pdo->exec("UPDATE {$t} SET uid=lower(hex(randomblob(10))) WHERE uid IS NULL OR uid=''");
    }
    return $n;
}

/** Lieux partagés : seulement ceux que la famille utilise (pas les dizaines de milliers de communes de référence). */
function sync_where(string $t): string
{
    return $t === 'places' ? ' WHERE id IN (SELECT place_id FROM events WHERE place_id IS NOT NULL)' : '';
}

/** Toutes les lignes partagées, sous une forme « portable » (liens par uid, type d'événement par son code). */
function sync_portable_rows(PDO $pdo): array
{
    $uidOf = [];
    foreach (SYNC_TABLES as $t) { foreach ($pdo->query("SELECT id, uid FROM {$t}" . sync_where($t)) as $r) { $uidOf[$t][(int) $r['id']] = (string) $r['uid']; } }
    $types = [];
    foreach ($pdo->query('SELECT id, slug, label, scope, gedcom_tag FROM event_types') as $r) { $types[(int) $r['id']] = $r; }
    $out = [];
    foreach (SYNC_TABLES as $t) {
        $cols = sync_columns($pdo, $t);
        foreach ($pdo->query('SELECT uid, ' . implode(',', array_map(static fn($c) => '"' . $c . '"', $cols)) . " FROM {$t}" . sync_where($t)) as $r) {
            $uid = (string) $r['uid']; unset($r['uid']);
            foreach (SYNC_REFS[$t] ?? [] as $col => $ref) { $r[$col] = $r[$col] ? ($uidOf[$ref][(int) $r[$col]] ?? null) : null; }
            if ($t === 'events') { $et = $types[(int) $r['event_type_id']] ?? null; $r['event_type_id'] = $et ? ['slug' => $et['slug'], 'label' => $et['label'], 'scope' => $et['scope'], 'tag' => $et['gedcom_tag']] : null; }
            if ($t === 'notes') {
                $map = ['person' => 'persons', 'event' => 'events', 'family' => 'families'];
                if (!isset($map[$r['entity_type']])) { continue; }
                $r['entity_id'] = $uidOf[$map[$r['entity_type']]][(int) $r['entity_id']] ?? null;
                if (!$r['entity_id']) { continue; }
            }
            ksort($r);
            $out[$t][$uid] = $r;
        }
    }
    return $out;
}

function sync_hash(array $row): string { return md5(json_encode($row, JSON_UNESCAPED_UNICODE)); }

function sync_status(PDO $pdo): array
{
    $s = sync_settings($pdo);
    $pending = null;
    if ($s['base_uid'] !== '') { $pending = count(sync_diff($pdo)); }
    $log = $pdo->query('SELECT * FROM sync_packages ORDER BY id DESC LIMIT 20')->fetchAll();
    return $s + ['active' => $s['base_uid'] !== '', 'pending' => $pending, 'log' => $log];
}

/** Démarrer : identifiants communs sur toutes les fiches, et « photo » de l'état actuel (point de départ commun). */
function sync_start(PDO $pdo, array $data): array
{
    $s = sync_settings($pdo);
    $author = safe_text($data['author'] ?? '');
    if ($author === '') { throw new RuntimeException('Indique ton prénom (il apparaît dans les paquets que tu envoies).'); }
    if ($s['base_uid'] === '') {
        sync_assign_uids($pdo);
        sync_take_snapshot($pdo);
        $s['base_uid'] = bin2hex(random_bytes(8));
        $s['started_at'] = date('c');
    }
    $s['author'] = $author;
    ht_save_setting($pdo, 'lcnda-sync', $s);
    return sync_status($pdo);
}

/** Après avoir reçu la copie de la base du cousin : seulement changer le prénom de l'auteur. */
function sync_set_author(PDO $pdo, array $data): array
{
    $s = sync_settings($pdo);
    $s['author'] = safe_text($data['author'] ?? '') ?: $s['author'];
    ht_save_setting($pdo, 'lcnda-sync', $s);
    return sync_status($pdo);
}

function sync_take_snapshot(PDO $pdo, ?array $only = null): void
{
    // Toujours dans une transaction : des milliers d'écritures séparées tenaient la base verrouillée
    if (!$pdo->inTransaction()) { $pdo->beginTransaction(); try { sync_take_snapshot($pdo, $only); $pdo->commit(); } catch (Throwable $e) { $pdo->rollBack(); throw $e; } return; }
    $rows = sync_portable_rows($pdo);
    $ins = $pdo->prepare('INSERT OR REPLACE INTO sync_snapshot(tbl, uid, hash, row_json) VALUES(?,?,?,?)');
    if ($only === null) {
        $pdo->exec('DELETE FROM sync_snapshot');
        foreach ($rows as $t => $list) { foreach ($list as $uid => $r) { $ins->execute([$t, $uid, sync_hash($r), json_encode($r, JSON_UNESCAPED_UNICODE)]); } }
        return;
    }
    $del = $pdo->prepare('DELETE FROM sync_snapshot WHERE tbl=? AND uid=?');
    foreach ($only as [$t, $uid]) {
        if (isset($rows[$t][$uid])) { $ins->execute([$t, $uid, sync_hash($rows[$t][$uid]), json_encode($rows[$t][$uid], JSON_UNESCAPED_UNICODE)]); }
        else { $del->execute([$t, $uid]); }
    }
}

/** Ce qui a changé ici depuis le dernier envoi (ou le départ commun). */
function sync_diff(PDO $pdo): array
{
    sync_assign_uids($pdo);
    $rows = sync_portable_rows($pdo);
    $snap = [];
    foreach ($pdo->query('SELECT tbl, uid, hash, row_json FROM sync_snapshot') as $r) { $snap[$r['tbl']][$r['uid']] = $r; }
    $changes = [];
    foreach (SYNC_TABLES as $t) {
        foreach ($rows[$t] ?? [] as $uid => $r) {
            $old = $snap[$t][$uid] ?? null;
            if (!$old) { $changes[] = ['tbl' => $t, 'uid' => $uid, 'op' => 'create', 'before' => null, 'after' => $r]; }
            elseif ($old['hash'] !== sync_hash($r)) { $changes[] = ['tbl' => $t, 'uid' => $uid, 'op' => 'update', 'before' => json_decode($old['row_json'], true), 'after' => $r]; }
        }
    }
    foreach (array_reverse(SYNC_TABLES) as $t) {
        if ($t === 'places') { continue; } // un lieu qui n'est plus utilisé ici reste chez le cousin (données de référence)
        foreach ($snap[$t] ?? [] as $uid => $old) {
            if (!isset($rows[$t][$uid])) { $changes[] = ['tbl' => $t, 'uid' => $uid, 'op' => 'delete', 'before' => json_decode($old['row_json'], true), 'after' => null]; }
        }
    }
    return $changes;
}

function sync_export(PDO $pdo): never
{
    $s = sync_settings($pdo);
    if ($s['base_uid'] === '') { json_response(['error' => 'Le travail à deux n’est pas commencé sur cette base.'], 422); }
    $changes = sync_diff($pdo);
    if (!$changes) { json_response(['error' => 'Aucune modification depuis le dernier paquet.'], 422); }
    $package = ['format' => 'lcnda-changes', 'version' => 1, 'base_uid' => $s['base_uid'], 'package_uid' => bin2hex(random_bytes(8)), 'author' => $s['author'], 'created_at' => date('c'), 'changes' => $changes];
    $pdo->beginTransaction();
    sync_take_snapshot($pdo);
    $s['last_export_at'] = date('c');
    ht_save_setting($pdo, 'lcnda-sync', $s);
    $pdo->prepare("INSERT INTO sync_packages(direction, package_uid, author, change_count, summary) VALUES('sent', ?, ?, ?, ?)")->execute([$package['package_uid'], $s['author'], count($changes), sync_summary($changes)]);
    $pdo->commit();
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="lcnda-modifications-' . preg_replace('/[^a-z0-9]+/i', '-', ascii_fold($s['author'] ?: 'paquet')) . '-' . date('Ymd-His') . '.lcnda-changes.json"');
    echo json_encode($package, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function sync_summary(array $changes): string
{
    $count = [];
    $labels = ['persons' => 'fiche', 'events' => 'événement', 'families' => 'union', 'family_children' => 'lien enfant', 'places' => 'lieu', 'notes' => 'note'];
    $ops = ['create' => 'ajout', 'update' => 'modification', 'delete' => 'suppression'];
    foreach ($changes as $c) { $k = $ops[$c['op']] . ' ' . $labels[$c['tbl']]; $count[$k] = ($count[$k] ?? 0) + 1; }
    return implode(', ', array_map(static fn($k, $n) => "{$n} {$k}" . ($n > 1 ? 's' : ''), array_keys($count), $count));
}

/** Titre lisible d'une ligne portable (pour la revue). */
function sync_label(array $byUid, string $t, ?array $r): string
{
    if (!$r) { return ''; }
    $person = static fn($uid) => $uid && isset($byUid['persons'][$uid]) ? trim(($byUid['persons'][$uid]['first_name'] ?? '') . ' ' . ($byUid['persons'][$uid]['last_name'] ?? '')) : '?';
    return match ($t) {
        'persons' => trim(($r['first_name'] ?? '') . ' ' . ($r['last_name'] ?? '')) ?: 'Fiche sans nom',
        'places' => trim(($r['name'] ?? '') . ($r['county'] ? ', ' . $r['county'] : '')),
        'families' => 'Union de ' . $person($r['partner1_id']) . ' et ' . $person($r['partner2_id']),
        'family_children' => 'Enfant ' . $person($r['child_id']),
        'events' => ($r['event_type_id']['label'] ?? 'Événement') . ($r['person_id'] ? ' de ' . $person($r['person_id']) : '') . ($r['date_text'] ? ' (' . $r['date_text'] . ')' : ''),
        'notes' => 'Note' . ($r['title'] ? ' « ' . $r['title'] . ' »' : ''),
        default => $t,
    };
}

/** Lit un paquet reçu et prépare la revue : pour chaque changement, ce qui change et s'il y a conflit. */
function sync_preview(PDO $pdo, ?array $file): never
{
    if (!$file || (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) { json_response(['error' => 'Fichier non reçu.'], 422); }
    $package = json_decode((string) file_get_contents($file['tmp_name']), true);
    if (!is_array($package) || ($package['format'] ?? '') !== 'lcnda-changes' || !is_array($package['changes'] ?? null) || !array_is_list($package['changes'])) { json_response(['error' => 'Ce fichier n’est pas un paquet de modifications LCNDA.'], 422); }
    $s = sync_settings($pdo);
    if ($s['base_uid'] === '') { json_response(['error' => 'Le travail à deux n’est pas commencé sur cette base : ouvre la copie reçue de ton cousin, ou commence le partage.'], 422); }
    if ($package['base_uid'] !== $s['base_uid']) { json_response(['error' => 'Ce paquet vient d’une autre généalogie (pas de la même base de départ).'], 422); }
    $already = $pdo->prepare("SELECT 1 FROM sync_packages WHERE package_uid=? AND direction='received'"); $already->execute([$package['package_uid']]);
    $local = sync_portable_rows($pdo);
    $byUid = $local;
    foreach ($package['changes'] as $c) { if ($c['after']) { $byUid[$c['tbl']][$c['uid']] ??= $c['after']; } }
    $items = [];
    foreach ($package['changes'] as $i => $c) {
        if (!in_array($c['tbl'] ?? '', SYNC_TABLES, true) || !in_array($c['op'] ?? '', ['create', 'update', 'delete'], true)) { continue; }
        $mine = $local[$c['tbl']][$c['uid']] ?? null;
        $target = $c['after'];
        if ($mine !== null && $target !== null && sync_hash($mine) === sync_hash($target)) { $state = 'same'; }
        elseif ($c['op'] === 'delete' && $mine === null) { $state = 'same'; }
        elseif ($c['op'] === 'create' && $mine === null) { $state = 'new'; }
        elseif ($c['op'] === 'update' && $mine === null) { $state = 'missing'; }
        elseif ($mine !== null && $c['before'] !== null && sync_hash($mine) !== sync_hash($c['before'])) { $state = 'conflict'; }
        else { $state = 'ok'; }
        $fields = [];
        $from = $mine ?? $c['before'] ?? []; $to = $target ?? [];
        if ($c['op'] === 'update' || ($c['op'] === 'create' && $mine !== null)) {
            foreach ($to as $k => $v) {
                $a = $from[$k] ?? null;
                if (json_encode($a) !== json_encode($v)) { $fields[] = ['field' => $k, 'mine' => is_array($a) ? ($a['label'] ?? '') : $a, 'theirs' => is_array($v) ? ($v['label'] ?? '') : $v]; }
            }
        }
        $items[] = ['index' => (int) $i, 'tbl' => $c['tbl'], 'uid' => $c['uid'], 'op' => $c['op'], 'state' => $state, 'label' => sync_label($byUid, $c['tbl'], $target ?? $c['before']), 'fields' => array_slice($fields, 0, 30)];
    }
    $token = bin2hex(random_bytes(8));
    $dir = DATA_DIR . '/sync-inbox';
    if (!is_dir($dir)) { @mkdir($dir, 0775, true); }
    file_put_contents($dir . '/' . $token . '.json', json_encode($package, JSON_UNESCAPED_UNICODE));
    json_response(['token' => $token, 'author' => $package['author'] ?? '', 'created_at' => $package['created_at'] ?? '', 'already_received' => (bool) $already->fetchColumn(), 'items' => $items]);
}

/** Applique les changements acceptés (copie de sécurité complète avant). */
function sync_apply(PDO $pdo, array $data): never
{
    $token = preg_replace('/[^a-f0-9]/', '', (string) ($data['token'] ?? ''));
    $path = DATA_DIR . '/sync-inbox/' . $token . '.json';
    if ($token === '' || !is_file($path)) { json_response(['error' => 'Paquet introuvable : recharge-le.'], 422); }
    $package = json_decode((string) file_get_contents($path), true);
    $accepted = array_fill_keys(array_map('intval', is_array($data['accepted'] ?? null) ? $data['accepted'] : []), true);
    $backupDir = DATA_DIR . '/backups';
    if (!is_dir($backupDir)) { @mkdir($backupDir, 0775, true); }
    $pdo->exec('VACUUM main INTO ' . $pdo->quote($backupDir . '/genealogie-backup-' . date('Ymd-His') . '-avant-fusion-paquet.db'));
    $pdo->beginTransaction();
    try {
        $idOf = static function (string $t, ?string $uid) use ($pdo): ?int {
            if (!$uid) { return null; }
            $s = $pdo->prepare("SELECT id FROM {$t} WHERE uid=?"); $s->execute([$uid]);
            $id = $s->fetchColumn();
            return $id === false ? null : (int) $id;
        };
        $typeId = static function (?array $et) use ($pdo): ?int {
            if (!$et) { return null; }
            $s = $pdo->prepare('SELECT id FROM event_types WHERE slug=?'); $s->execute([$et['slug']]); $id = $s->fetchColumn();
            if ($id === false) { $s = $pdo->prepare('SELECT id FROM event_types WHERE label=? COLLATE NOCASE AND scope=?'); $s->execute([$et['label'], $et['scope']]); $id = $s->fetchColumn(); }
            if ($id === false) {
                $pdo->prepare("INSERT INTO event_types(scope, slug, label, gedcom_tag, icon, color, is_custom) VALUES(?,?,?,?, 'diamond', '#0066cc', 1)")->execute([$et['scope'], $et['slug'] . '-' . bin2hex(random_bytes(2)), $et['label'], $et['tag'] ?? '']);
                $id = $pdo->lastInsertId();
            }
            return (int) $id;
        };
        $applied = 0; $errors = []; $touched = [];
        $changes = $package['changes'];
        $order = array_flip(SYNC_TABLES);
        $indexed = [];
        foreach ($changes as $i => $c) { if (isset($accepted[$i])) { $indexed[] = [$i, $c]; } }
        usort($indexed, static function ($a, $b) use ($order) {
            $da = $a[1]['op'] === 'delete' ? 1 : 0; $db = $b[1]['op'] === 'delete' ? 1 : 0;
            if ($da !== $db) { return $da <=> $db; }
            return $da ? $order[$b[1]['tbl']] <=> $order[$a[1]['tbl']] : $order[$a[1]['tbl']] <=> $order[$b[1]['tbl']];
        });
        foreach ($indexed as [$i, $c]) {
            $t = $c['tbl'];
            if (!in_array($t, SYNC_TABLES, true)) { continue; }
            $localId = $idOf($t, $c['uid']);
            // Fiche verrouillée : le paquet du cousin ne la modifie pas
            if ($t === 'persons' && $localId && (int) $pdo->query('SELECT COALESCE(is_locked,0) FROM persons WHERE id=' . (int) $localId)->fetchColumn()) { $lockedSkipped = ($lockedSkipped ?? 0) + 1; continue; }
            if ($c['op'] === 'delete') {
                if ($localId) {
                    if ($t === 'persons' && function_exists('delete_person')) {
                        delete_person($pdo, ['id' => $localId]); // même nettoyage qu'à la main (médias, sources, notes, recherche) et fiche restaurable
                    } else {
                        if ($t === 'events') {
                            foreach (['media_links', 'source_links', 'notes', 'label_links'] as $dep) { $pdo->prepare("DELETE FROM {$dep} WHERE entity_type='event' AND entity_id=?")->execute([$localId]); }
                        }
                        $pdo->prepare("DELETE FROM {$t} WHERE id=?")->execute([$localId]);
                    }
                    $applied++;
                }
                $touched[] = [$t, $c['uid']];
                continue;
            }
            $r = $c['after'];
            $cols = sync_columns($pdo, $t);
            $row = [];
            foreach ($cols as $col) { if (array_key_exists($col, $r)) { $row[$col] = $r[$col]; } }
            $missing = false;
            foreach (SYNC_REFS[$t] ?? [] as $col => $ref) {
                if (!empty($row[$col])) { $id = $idOf($ref, $row[$col]); if ($id === null) { $missing = true; } $row[$col] = $id; }
            }
            if ($t === 'events') { $row['event_type_id'] = $typeId($r['event_type_id'] ?? null); if (!$row['event_type_id']) { $missing = true; } }
            if ($t === 'notes') {
                $map = ['person' => 'persons', 'event' => 'events', 'family' => 'families'];
                $row['entity_id'] = isset($map[$r['entity_type']]) ? $idOf($map[$r['entity_type']], $r['entity_id']) : null;
                if (!$row['entity_id']) { $missing = true; }
            }
            if ($missing) { $errors[] = sync_label([], $t, $r) . ' : une fiche liée manque (refusée ou pas encore reçue)'; continue; }
            if ($localId) {
                $pdo->prepare("UPDATE {$t} SET " . implode(',', array_map(static fn($k) => '"' . $k . '"=?', array_keys($row))) . ' WHERE id=?')->execute([...array_values($row), $localId]);
            } else {
                $pdo->prepare("INSERT INTO {$t}(" . implode(',', array_map(static fn($k) => '"' . $k . '"', array_keys($row))) . ',uid) VALUES(' . implode(',', array_fill(0, count($row) + 1, '?')) . ')')->execute([...array_values($row), $c['uid']]);
                $localId = (int) $pdo->lastInsertId();
            }
            if ($t === 'persons' && function_exists('rebuild_search')) { try { rebuild_search($pdo, $localId); } catch (Throwable $_) {} }
            $touched[] = [$t, $c['uid']];
            $applied++;
        }
        sync_take_snapshot($pdo, $touched);
        $s = sync_settings($pdo); $s['last_import_at'] = date('c'); ht_save_setting($pdo, 'lcnda-sync', $s);
        $pdo->prepare("INSERT INTO sync_packages(direction, package_uid, author, change_count, accepted_count, summary) VALUES('received', ?, ?, ?, ?, ?)")
            ->execute([$package['package_uid'], $package['author'] ?? '', count($changes), $applied, sync_summary(array_map(static fn($x) => $x[1], $indexed))]);
        log_change($pdo, 'meta', 0, 'update', 'Paquet de modifications de ' . ($package['author'] ?? '?') . ' : ' . $applied . ' changement(s) accepté(s) sur ' . count($changes));
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        json_response(['error' => 'Rien n’a été appliqué : ' . $e->getMessage()], 500);
    }
    @unlink($path);
    json_response(['ok' => true, 'applied' => $applied, 'errors' => $errors, 'locked_skipped' => $lockedSkipped ?? 0]);
}
