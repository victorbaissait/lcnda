<?php
declare(strict_types=1);

/**
 * 📊 Les données, en plus (maquette validée docs/design/donnees-plus.html, décisions du 2026-11-26) : la partie serveur des 21 ajouts
 * de l'espace Données (assets/js/app-donnees-plus.js, app-donnees-plus-outils.js). Le reste (favoris, récents, lignes ajoutées,
 * lignes douteuses, réglages) est gardé dans le navigateur (clés « genealogie-… », copiées dans la base par save_settings).
 *
 *  - 📝 notes sur une ligne d'une liste de données : table dplus_notes (créée ici, au premier appel) ; la note suit la clé de la ligne
 *    (même après une mise à jour du pack) ; GET dplus_notes {list} · POST dplus_note {list, key, title, note} (vide = retirée ; renvoie
 *    l'ancienne pour ↶ Annuler) ;
 *  - 🕳 lieux de l'arbre sans coordonnées : GET dplus_missing (jamais un événement confidentiel) ; 📍 Placer : POST dplus_place {id, lat, lon}
 *    (renvoie les anciennes coordonnées pour ↶ ; lat = lon = null remet « sans coordonnées ») ;
 *  - 🕰 versions d'un pack livré : GET dplus_versions {pack} (celle en place, celle gardée par lib/donnees_maj.php pour ↶, celle livrée) ;
 *  - 🔗 une liste filtrée partagée sur le site familial : POST dplus_share {name, audience, cols, rows, sources} → table dplus_shares ;
 *    le serveur retire encore toute ligne qui nomme une personne vivante ou une fiche confidentielle (fc_hidden, la règle du site
 *    familial) ; GET dplus_shares · POST dplus_share_remove {id} (renvoie de quoi la remettre) · POST dplus_share_restore {share} ;
 *    la page de la famille (famille.php) les lit par dplus_guest_lists().
 * Écritures : jeton CSRF (api.php) ; mode consultation : refusées avant d'arriver ici (kiosk_guard).
 * Essai : tests/test-donnees-plus.js
 */

function dplus_schema(PDO $pdo): void
{
    static $done = [];
    $k = spl_object_id($pdo);
    if (isset($done[$k])) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS dplus_notes (list_id TEXT NOT NULL, rkey TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (list_id, rkey))");
    $pdo->exec("CREATE TABLE IF NOT EXISTS dplus_shares (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', audience TEXT NOT NULL DEFAULT 'membres',
        body TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $done[$k] = true;
}

function dplus_str(mixed $v, int $max): string
{
    $s = is_scalar($v) ? (string) $v : '';
    $s = (string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s);
    return mb_substr(trim($s), 0, $max);
}

function dplus_id(mixed $v): string
{
    $s = dplus_str($v, 120);
    if (!preg_match('/^[A-Za-z0-9_.~:-]{1,120}$/', $s)) { throw new LcndaBadInput('Liste inconnue.'); }
    return $s;
}

/* ═════════════ 📝 notes ═════════════ */
function dplus_notes(PDO $pdo, array $q): array
{
    $list = dplus_id($q['list'] ?? '');
    $s = $pdo->prepare('SELECT rkey, note, title, updated_at FROM dplus_notes WHERE list_id=? LIMIT 5000');
    $s->execute([$list]);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $out[(string) $r['rkey']] = ['note' => (string) $r['note'], 'title' => (string) $r['title'], 'at' => (string) $r['updated_at']]; }
    return ['notes' => (object) $out];
}

function dplus_note(PDO $pdo, array $d): array
{
    $list = dplus_id($d['list'] ?? '');
    $key = dplus_str($d['key'] ?? '', 600);
    if ($key === '') { throw new LcndaBadInput('Ligne inconnue.'); }
    $note = dplus_str($d['note'] ?? '', 4000);
    $title = dplus_str($d['title'] ?? '', 300);
    $s = $pdo->prepare('SELECT note FROM dplus_notes WHERE list_id=? AND rkey=?'); $s->execute([$list, $key]);
    $before = $s->fetchColumn();
    if ($note === '') { $pdo->prepare('DELETE FROM dplus_notes WHERE list_id=? AND rkey=?')->execute([$list, $key]); }
    else {
        $pdo->prepare('INSERT INTO dplus_notes(list_id, rkey, title, note, updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)
            ON CONFLICT(list_id, rkey) DO UPDATE SET note=excluded.note, title=excluded.title, updated_at=CURRENT_TIMESTAMP')->execute([$list, $key, $title, $note]);
    }
    return ['ok' => true, 'before' => $before === false ? '' : (string) $before, 'note' => $note];
}

/* ═════════════ 🕳 les lieux de l'arbre sans coordonnées ═════════════ */
function dplus_missing(PDO $pdo): array
{
    $kiosk = function_exists('kiosk_state') && !empty(kiosk_state()['on']);
    $evPriv = in_array('is_private', array_column($pdo->query('PRAGMA table_info(events)')->fetchAll(PDO::FETCH_ASSOC), 'name'), true);
    $sql = "SELECT pl.id, pl.name, pl.county, pl.state, pl.country, COUNT(e.id) AS acts,
                COUNT(DISTINCT CASE WHEN e.person_id IS NOT NULL THEN e.person_id END) AS people
            FROM places pl JOIN events e ON e.place_id=pl.id
            LEFT JOIN persons p ON p.id=e.person_id
            WHERE (pl.latitude IS NULL OR pl.longitude IS NULL OR (pl.latitude=0 AND pl.longitude=0))
              AND COALESCE(p.is_private,0)=0" . ($evPriv ? ' AND COALESCE(e.is_private,0)=0' : '') . ($kiosk ? " AND COALESCE(p.living_status,'')<>'living'" : '') . "
            GROUP BY pl.id ORDER BY acts DESC, people DESC, pl.name COLLATE NOCASE LIMIT 200";
    $out = [];
    foreach ($pdo->query($sql) as $r) {
        $name = trim((string) $r['name']);
        if ($name === '') { continue; }
        $out[] = ['id' => (int) $r['id'], 'name' => $name, 'where' => implode(', ', array_values(array_filter([(string) $r['county'], (string) $r['state'], (string) $r['country']], 'strlen'))),
            'acts' => (int) $r['acts'], 'people' => (int) $r['people'], 'vague' => !preg_match('/[,(]/', $name) && trim((string) $r['county'] . (string) $r['state']) === ''];
    }
    $births = (int) $pdo->query("SELECT COUNT(*) FROM persons p WHERE COALESCE(p.is_private,0)=0 AND p.living_status<>'living' AND NOT EXISTS (SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id
        WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM') AND e.year IS NOT NULL)")->fetchColumn();
    return ['places' => $out, 'no_birth' => $births];
}

function dplus_place(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0);
    $s = $pdo->prepare('SELECT latitude, longitude, name FROM places WHERE id=?'); $s->execute([$id]);
    $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new LcndaBadInput('Lieu introuvable.'); }
    $lat = $d['lat'] ?? null; $lon = $d['lon'] ?? null;
    if ($lat === null || $lon === null || $lat === '' || $lon === '') { $lat = null; $lon = null; }
    else {
        if (!is_numeric($lat) || !is_numeric($lon)) { throw new LcndaBadInput('Coordonnées illisibles.'); }
        $lat = round((float) $lat, 6); $lon = round((float) $lon, 6);
        if ($lat < -90 || $lat > 90 || $lon < -180 || $lon > 180 || ($lat == 0.0 && $lon == 0.0)) { throw new LcndaBadInput('Coordonnées hors de la Terre.'); }
    }
    $pdo->prepare('UPDATE places SET latitude=?, longitude=? WHERE id=?')->execute([$lat, $lon, $id]);
    return ['ok' => true, 'id' => $id, 'name' => (string) $row['name'], 'before' => ['lat' => $row['latitude'] === null ? null : (float) $row['latitude'], 'lon' => $row['longitude'] === null ? null : (float) $row['longitude']]];
}

/* ═════════════ 🕰 versions d'un pack livré ═════════════ */
function dplus_versions(array $q): array
{
    require_once __DIR__ . '/donnees_maj.php';
    $id = (string) ($q['pack'] ?? '');
    if (!dmaj_ok_id($id) || !isset(dmaj_local()['packs'][$id])) { throw new LcndaBadInput('Pack inconnu.'); }
    $cur = dmaj_current($id) ?: [];
    $ship = dmaj_local()['packs'][$id];
    $out = [['kind' => 'current', 'version' => (string) ($cur['version'] ?? ''), 'rows' => (int) ($cur['rows'] ?? 0), 'at' => (string) ($cur['installed_at'] ?? ''),
        'from_rows' => (int) ($cur['from_rows'] ?? 0), 'state' => (string) ($cur['state'] ?? 'shipped')]];
    $bk = dmaj_dir() . '/backup/' . $id . '/state.json';
    $kept = is_file($bk) ? json_decode((string) file_get_contents($bk), true) : null;
    if (is_array($kept)) {
        $e = is_array($kept['entry'] ?? null) ? $kept['entry'] : null;
        $out[] = ['kind' => 'kept', 'version' => (string) ($e['version'] ?? ($ship['version'] ?? '')), 'rows' => (int) ($e['rows'] ?? ($ship['rows'] ?? 0)), 'at' => (string) ($e['installed_at'] ?? ''),
            'shipped' => $e === null, 'revert' => true];
    }
    if (($cur['state'] ?? '') === 'updated' && !(is_array($kept) && ($kept['entry'] ?? null) === null)) {
        $out[] = ['kind' => 'shipped', 'version' => (string) ($ship['version'] ?? ''), 'rows' => (int) ($ship['rows'] ?? 0), 'at' => '', 'revert' => false];
    }
    return ['pack' => $id, 'versions' => $out];
}

/* ═════════════ 🔗 partager une liste filtrée sur le site familial ═════════════ */
/** un texte réduit pour comparer des noms : minuscules, sans accents, rien que des lettres et chiffres séparés d'une espace */
function dplus_fold(string $s): string
{
    $s = mb_strtolower($s);
    if (class_exists('Normalizer')) { $n = Normalizer::normalize($s, Normalizer::FORM_D); if (is_string($n)) { $s = (string) preg_replace('/\p{Mn}+/u', '', $n); } }
    return ' ' . trim((string) preg_replace('/[^\p{L}\p{N}]+/u', ' ', $s)) . ' ';
}

/** les noms de ces fiches, rangés par le plus long mot du nom de famille : [mot => [[mots du nom repliés], premier prénom replié]…] */
function dplus_names_of(PDO $pdo, array $ids): array
{
    $out = [];
    $ids = array_values(array_unique(array_map('intval', $ids)));
    foreach (array_chunk($ids, 500) as $chunk) {
        foreach ($pdo->query('SELECT first_name, last_name FROM persons WHERE id IN (' . implode(',', $chunk) . ')') as $p) {
            $ln = trim(dplus_fold((string) $p['last_name'])); $fn = trim(dplus_fold((string) $p['first_name']));
            if ($ln === '' || $fn === '') { continue; }
            $first = explode(' ', $fn)[0]; // « Marie Louise » se cache aussi derrière « Marie DURAND »
            $words = array_values(array_unique(explode(' ', $ln)));
            usort($words, static fn($a, $b) => mb_strlen($b) <=> mb_strlen($a));
            $out[$words[0]][] = [$words, ' ' . $first . ' ']; // tous les mots du nom, dans n'importe quel ordre (« FONTAINE (de la) »)
        }
    }
    return $out;
}

/** les noms qu'un partage ne montre jamais : personnes vivantes (déclarées ou probables) et fiches confidentielles */
function dplus_hidden_names(PDO $pdo): array
{
    require_once __DIR__ . '/comptes_famille.php';
    $hidden = fc_hidden($pdo);
    return $hidden ? dplus_names_of($pdo, array_keys($hidden)) : [];
}

/** ce texte nomme-t-il une de ces personnes (premier prénom et tous les mots du nom, en mots entiers, dans n'importe quel ordre, accents et capitales ignorés) ? */
function dplus_names_hit(string $txt, array $idx): bool
{
    if (!$idx) { return false; }
    $f = dplus_fold($txt);
    foreach (array_unique(explode(' ', trim($f))) as $w) {
        foreach ($idx[$w] ?? [] as [$ln, $fn]) {
            if (!str_contains($f, $fn)) { continue; }
            $all = true;
            foreach ($ln as $x) { if (!str_contains($f, ' ' . $x . ' ')) { $all = false; break; } }
            if ($all) { return true; }
        }
    }
    return false;
}

/** un partage nettoyé : jamais un nom caché, ni dans les lignes, ni dans le titre, les colonnes, les filtres ou les sources */
function dplus_clean_body(array $b, array $hidden, int &$dropped = 0): array
{
    $cols = array_slice(array_map(static fn($c) => dplus_str($c, 80), is_array($b['cols'] ?? null) ? array_values($b['cols']) : []), 0, 12);
    foreach ($cols as $i => $c) { if (dplus_names_hit($c, $hidden)) { $cols[$i] = '—'; } }
    $rows = [];
    foreach (array_slice(is_array($b['rows'] ?? null) ? array_values($b['rows']) : [], 0, 2000) as $r) {
        if (!is_array($r)) { continue; }
        $cells = array_slice(array_map(static fn($c) => dplus_str($c, 400), array_values($r)), 0, count($cols));
        if (dplus_names_hit(implode(' · ', $cells), $hidden)) { $dropped++; continue; }
        $rows[] = $cells;
    }
    $sources = [];
    foreach (array_slice(is_array($b['sources'] ?? null) ? array_values($b['sources']) : [], 0, 30) as $s) {
        if (!is_array($s)) { continue; }
        $u = dplus_str($s['url'] ?? '', 500);
        $x = ['source' => dplus_str($s['source'] ?? '', 300), 'licence' => dplus_str($s['licence'] ?? '', 120), 'url' => preg_match('#^https?://[^\s"\'<>]+$#i', $u) ? $u : ''];
        if (dplus_names_hit(implode(' · ', $x), $hidden)) { continue; }
        $sources[] = $x;
    }
    $name = dplus_str($b['name'] ?? '', 200) ?: 'Liste';
    if (dplus_names_hit($name, $hidden)) { $name = 'Liste'; }
    $filters = dplus_str($b['filters'] ?? '', 400);
    if (dplus_names_hit($filters, $hidden)) { $filters = ''; }
    return ['kind' => 'liste', 'name' => $name, 'cols' => $cols, 'rows' => $rows, 'sources' => $sources, 'filters' => $filters];
}

function dplus_share(PDO $pdo, array $d): array
{
    $aud = in_array($d['audience'] ?? '', ['membres', 'tous'], true) ? (string) $d['audience'] : 'membres';
    if (!is_array($d['cols'] ?? null) || !$d['cols']) { throw new LcndaBadInput('Rien à partager.'); }
    $dropped = 0;
    $body = dplus_clean_body($d, dplus_hidden_names($pdo), $dropped);
    if (!$body['cols']) { throw new LcndaBadInput('Rien à partager.'); }
    if (!empty($d['dry'])) { return ['ok' => true, 'dry' => true, 'rows' => count($body['rows']), 'dropped' => $dropped]; } // l'aperçu : ce qui partirait, sans rien garder
    $pdo->prepare('INSERT INTO dplus_shares(name, audience, body) VALUES(?,?,?)')->execute([$body['name'], $aud, (string) json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
    return ['ok' => true, 'id' => (int) $pdo->lastInsertId(), 'rows' => count($body['rows']), 'dropped' => $dropped];
}

function dplus_shares(PDO $pdo): array
{
    $out = [];
    foreach ($pdo->query('SELECT id, name, audience, body, created_at FROM dplus_shares ORDER BY id DESC LIMIT 200') as $r) {
        $b = json_decode((string) $r['body'], true) ?: [];
        $out[] = ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'audience' => (string) $r['audience'], 'rows' => count($b['rows'] ?? []), 'at' => (string) $r['created_at']];
    }
    $acc = 0;
    try { if ($pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='fc_accounts'")->fetchColumn()) { $acc = (int) $pdo->query('SELECT COUNT(*) FROM fc_accounts WHERE removed_ts=0')->fetchColumn(); } } catch (Throwable) {}
    return ['shares' => $out, 'accounts' => $acc];
}

function dplus_share_remove(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0);
    $s = $pdo->prepare('SELECT id, name, audience, body, created_at FROM dplus_shares WHERE id=?'); $s->execute([$id]);
    $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new LcndaBadInput('Partage introuvable.'); }
    $pdo->prepare('DELETE FROM dplus_shares WHERE id=?')->execute([$id]);
    return ['ok' => true, 'share' => $row];
}

function dplus_share_restore(PDO $pdo, array $d): array
{
    $r = is_array($d['share'] ?? null) ? $d['share'] : [];
    $body = json_decode((string) ($r['body'] ?? ''), true);
    if (!is_array($body) || ($body['kind'] ?? '') !== 'liste') { throw new LcndaBadInput('Partage illisible.'); }
    // remis tel quel, mais repassé au même filtre (les vivants ont pu changer entre-temps)
    return dplus_share($pdo, ['name' => $r['name'] ?? '', 'audience' => $r['audience'] ?? 'membres', 'cols' => $body['cols'] ?? [], 'rows' => $body['rows'] ?? [], 'sources' => $body['sources'] ?? [], 'filters' => $body['filters'] ?? '']);
}

/**
 * famille.php : les listes partagées, pour un compte connecté — repassées au filtre à chaque lecture : les vivants et les fiches
 * confidentielles (les vivants ont pu changer depuis le partage), et pour un compte limité à une branche, toute personne hors de
 * sa branche (elle « n'existe pas » pour lui, lib/comptes_famille.php fc_mode).
 */
function dplus_guest_lists(PDO $pdo, ?array $account = null): array
{
    dplus_schema($pdo);
    $hidden = dplus_hidden_names($pdo);
    if ($account !== null && function_exists('fc_scope_ids')) {
        $scope = fc_scope_ids($pdo, $account);
        if ($scope !== null) {
            $out = [];
            foreach ($pdo->query('SELECT id FROM persons') as $r) { if (!isset($scope[(int) $r['id']])) { $out[] = (int) $r['id']; } }
            foreach (dplus_names_of($pdo, $out) as $w => $list) { foreach ($list as $x) { $hidden[$w][] = $x; } }
        }
    }
    $out = [];
    foreach ($pdo->query('SELECT id, name, body, created_at FROM dplus_shares ORDER BY id DESC LIMIT 50') as $r) {
        $b = json_decode((string) $r['body'], true);
        if (!is_array($b) || ($b['kind'] ?? '') !== 'liste') { continue; }
        $c = dplus_clean_body($b + ['name' => (string) $r['name']], $hidden);
        $out[] = ['id' => (int) $r['id'], 'name' => $c['name'], 'cols' => $c['cols'], 'rows' => $c['rows'], 'sources' => $c['sources'], 'filters' => $c['filters'], 'at' => (string) $r['created_at']];
    }
    return ['lists' => $out];
}

/** api.php : toutes les routes dplus_* (après le jeton CSRF et le garde du mode consultation) */
function donnees_plus_api(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        dplus_schema($pdo);
        $kiosk = function_exists('kiosk_state') && !empty(kiosk_state()['on']);
        if ($kiosk && in_array($action, ['dplus_notes', 'dplus_shares'], true)) { json_response($action === 'dplus_notes' ? ['notes' => (object) [], 'kiosk' => true] : ['shares' => [], 'accounts' => 0, 'kiosk' => true]); } // 📝 et 🔗 sont à toi : pas en consultation
        $r = match (true) {
            !$isWrite && $action === 'dplus_notes' => dplus_notes($pdo, $_GET),
            !$isWrite && $action === 'dplus_missing' => dplus_missing($pdo),
            !$isWrite && $action === 'dplus_versions' => dplus_versions($_GET),
            !$isWrite && $action === 'dplus_shares' => dplus_shares($pdo),
            $isWrite && $action === 'dplus_note' => dplus_note($pdo, $payload),
            $isWrite && $action === 'dplus_place' => dplus_place($pdo, $payload),
            $isWrite && $action === 'dplus_share' => dplus_share($pdo, $payload),
            $isWrite && $action === 'dplus_share_remove' => dplus_share_remove($pdo, $payload),
            $isWrite && $action === 'dplus_share_restore' => dplus_share_restore($pdo, $payload),
            default => throw new LcndaBadInput('Action inconnue.'),
        };
        json_response($r);
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (Throwable $e) {
        json_response(['error' => $e->getMessage()], 422);
    }
}
