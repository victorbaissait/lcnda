<?php
declare(strict_types=1);
/**
 * 🗳 Élections d'autrefois : comment votait la commune d'une personne (résultats par commune depuis 1848), et les
 * élections de député à proposer sur son profil « Homme / femme politique ». Caché tant que l'interrupteur de
 * Réglages → 🗳 Élections d'autrefois n'est pas mis (assets/js/heritage-elections.js) ; rien n'est livré avec l'app.
 *
 * Le pack (elections.sqlite, fabriqué par scripts/elections/build-elections.py dans .github/workflows/elections.yml)
 * est déposé dans la version « elections-donnees » du dépôt GitHub, coupé en morceaux, avec elections-manifest.json :
 *   {"version": "2026-11", "packs": {"elections": {"size": N, "sha256": "…", "built": "…", "parts": [{"name": "elections.sqlite.000", "size": N}]}}}
 * Même chemin que la météo (lib/meteo_dl.php) : téléchargement par tranches de 16 Mo (HTTP Range) dans un dossier
 * d'envoi, reprise après fermeture de l'app, puis vérification (taille, empreinte, base SQLite lisible, bon schéma)
 * avant de ranger le pack dans le dossier des données. Seulement l'adresse de la version GitHub (et ses redirections,
 * chacune revérifiée), rien n'est envoyé. Essais : un dossier local à la place de GitHub (GENEALOGY_TEST=1 +
 * LCNDA_TEST_ELECTIONS_DIR).
 * Données : Julia Cagé et Thomas Piketty (2023), « Une histoire du conflit politique » (Le Seuil), données
 * unehistoireduconflitpolitique.fr (téléchargement libre, citer la source) ; députés : Wikidata (CC0, n° Sycomore P1045).
 * Rien n'est écrit dans la généalogie ici : une élection proposée s'ajoute au profil par l'API du profil (art_write).
 */

const ELECTIONS_DL_BASE = 'https://github.com/victorbaissait/lcnda/releases/download/elections-donnees/';
const ELECTIONS_DL_STEP = 16 * 1024 * 1024;
const ELECTIONS_PACK_MAX = 4 * 1024 * 1024 * 1024;

function elections_dir(): string { return SHARED_DATA_DIR . '/elections'; }
function elections_path(): string { return elections_dir() . '/elections.sqlite'; }

function elections_pdo(): ?PDO
{
    static $pdo = false;
    if ($pdo !== false) { return $pdo; }
    $p = elections_path();
    if (!is_file($p) || filesize($p) < 1024) { return $pdo = null; }
    try {
        $o = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
        if (defined('PDO::SQLITE_ATTR_OPEN_FLAGS')) { $o[PDO::SQLITE_ATTR_OPEN_FLAGS] = PDO::SQLITE_OPEN_READONLY; }
        $x = new PDO('sqlite:' . $p, null, null, $o);
        $x->query('SELECT 1 FROM meta LIMIT 1');
        return $pdo = $x;
    } catch (Throwable) { return $pdo = null; }
}

/** GET elections_status → installé ? quand, combien, la citation à afficher */
function elections_status(): array
{
    $e = elections_pdo();
    $out = ['installed' => (bool) $e, 'removed' => is_file(elections_path() . '.removed'), 'dir' => elections_dir()];
    if ($e) {
        $m = $e->query('SELECT key, value FROM meta')->fetchAll(PDO::FETCH_KEY_PAIR);
        $out += ['built' => (string) ($m['built'] ?? ''), 'fixture' => !empty($m['fixture']), 'citation' => (string) ($m['citation'] ?? ''), 'terms' => (string) ($m['terms'] ?? ''),
            'elections' => (int) ($m['elections'] ?? 0), 'communes' => (int) ($m['communes'] ?? 0), 'deputes' => (int) ($m['deputes'] ?? 0), 'size' => (int) filesize(elections_path()),
            'years' => $e->query('SELECT MIN(year) a, MAX(year) b FROM elections')->fetch(),
            'sources' => $e->query('SELECT id, nom, licence, mention, url FROM sources ORDER BY id')->fetchAll()];
    }
    return $out;
}

/* ═════════════════════════ ⤓ Installer en un bouton (copie du chemin de la météo) ═════════════════════════ */

function elections_dl_get(string $name, ?array $range = null, int $max = 20 * 1024 * 1024): string
{
    if (!preg_match('/^[A-Za-z0-9._-]{1,120}$/', $name)) { throw new LcndaBadInput('Nom de fichier refusé.'); }
    $dir = (string) getenv('LCNDA_TEST_ELECTIONS_DIR');
    if (getenv('GENEALOGY_TEST') === '1' && $dir !== '') {
        $f = $dir . '/' . $name; if (!is_file($f)) { throw new RuntimeException(i18n_t('Les données électorales ne sont pas encore en ligne : réessaie plus tard.')); }
        if (!$range) { return (string) file_get_contents($f); }
        $h = fopen($f, 'rb'); fseek($h, $range[0]); $s = (string) fread($h, $range[1] - $range[0] + 1); fclose($h); return $s;
    }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Téléchargement impossible : PHP n’a pas l’extension curl.')); }
    $url = ELECTIONS_DL_BASE . $name;
    for ($hop = 0; $hop < 7; $hop++) {
        $resolve = link_safe_resolve($url);
        if ($resolve === null) { throw new RuntimeException(i18n_t('Adresse refusée : seulement une adresse publique en http ou https.')); }
        $body = ''; $too = false;
        $ch = curl_init($url);
        curl_setopt_array($ch, ($resolve !== '' ? [CURLOPT_RESOLVE => [$resolve]] : []) + ($range ? [CURLOPT_RANGE => $range[0] . '-' . $range[1]] : []) + [
            CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROXY => '', CURLOPT_NOPROXY => '*', CURLOPT_CONNECTTIMEOUT => 20, CURLOPT_TIMEOUT => 300,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => 'Mozilla/5.0 (LCNDA, donnees electorales)',
            CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }] + lcnda_curl_tls());
        curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $loc = (string) (curl_getinfo($ch, CURLINFO_REDIRECT_URL) ?: ''); $err = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
        unset($ch);
        if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse du serveur des données électorales.')); }
        if (in_array($code, [301, 302, 303, 307, 308], true) && $loc !== '') { $url = link_absolute_url($url, $loc); continue; }
        if ($code === 404) { throw new RuntimeException(i18n_t('Les données électorales ne sont pas encore en ligne : réessaie plus tard.')); }
        if ($code < 200 || $code >= 300) { throw new RuntimeException($err !== '' ? i18n_t('Pas de connexion au serveur des données électorales : {err}', ['err' => $err]) : i18n_t('Le serveur des données électorales répond {code}.', ['code' => (string) $code])); }
        return $body;
    }
    throw new RuntimeException(i18n_t('Trop de redirections.'));
}

/** GET elections_dl_info → le pack en ligne (manifeste gardé une heure) */
function elections_dl_info(): array
{
    $cache = elections_dir() . '/.envois/manifest.json';
    if (is_file($cache) && filemtime($cache) > time() - 3600 && getenv('GENEALOGY_TEST') !== '1') { $m = json_decode((string) file_get_contents($cache), true); }
    else {
        $m = json_decode(elections_dl_get('elections-manifest.json', null, 1024 * 1024), true);
        if (is_array($m)) { @mkdir(dirname($cache), 0775, true); @file_put_contents($cache, json_encode($m)); }
    }
    if (!is_array($m) || !is_array($m['packs'] ?? null)) { throw new RuntimeException(i18n_t('Le sommaire des données électorales est illisible.')); }
    $p = $m['packs']['elections'] ?? null; $out = null;
    if (is_array($p) && is_array($p['parts'] ?? null) && $p['parts'] && preg_match('/^[0-9a-f]{64}$/', (string) ($p['sha256'] ?? ''))) {
        $parts = []; $sum = 0; $ok = true;
        foreach ($p['parts'] as $x) { if (!is_array($x) || !preg_match('/^[A-Za-z0-9._-]{1,120}$/', (string) ($x['name'] ?? '')) || (int) ($x['size'] ?? 0) <= 0) { $ok = false; break; } $parts[] = ['name' => (string) $x['name'], 'size' => (int) $x['size']]; $sum += (int) $x['size']; }
        if ($ok && $sum === (int) ($p['size'] ?? -1) && $sum <= ELECTIONS_PACK_MAX) { $out = ['size' => $sum, 'sha256' => (string) $p['sha256'], 'parts' => $parts, 'built' => (string) ($p['built'] ?? '')]; }
    }
    return ['version' => (string) ($m['version'] ?? ''), 'pack' => $out];
}

function elections_upload_path(string $id): string
{
    if (!preg_match('/^[a-f0-9]{24}$/', $id)) { throw new RuntimeException('Envoi inconnu.'); }
    $dir = elections_dir() . '/.envois';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) { throw new RuntimeException(i18n_t('Dossier des données électorales impossible à créer.')); }
    return $dir . '/' . $id . '.part';
}

/** POST elections_dl_start → {id, size} */
function elections_dl_start(): array
{
    $p = elections_dl_info()['pack'];
    if (!$p) { throw new RuntimeException(i18n_t('Les données électorales ne sont pas encore en ligne : réessaie plus tard.')); }
    foreach (glob(elections_dir() . '/.envois/*.{part,dl}', GLOB_BRACE) ?: [] as $old) { if (filemtime($old) < time() - 7 * 86400) { @unlink($old); } }
    $id = bin2hex(random_bytes(12));
    $path = elections_upload_path($id);
    $free = @disk_free_space(dirname($path));
    if ($free !== false && $free < 2 * $p['size'] + 50 * 1024 * 1024) { throw new RuntimeException(i18n_t('Pas assez de place sur le disque (il faut environ {n} Mo de libres).', ['n' => (string) ceil(2 * $p['size'] / 1e6)])); }
    file_put_contents($path, '');
    file_put_contents(substr($path, 0, -5) . '.dl', json_encode(['parts' => $p['parts'], 'sha256' => $p['sha256'], 'size' => $p['size']]));
    return ['id' => $id, 'size' => $p['size']];
}

function elections_dl_meta(string $id): array
{
    $path = elections_upload_path($id);
    $meta = json_decode((string) @file_get_contents(substr($path, 0, -5) . '.dl'), true);
    if (!is_file($path) || !is_array($meta) || !is_array($meta['parts'] ?? null)) { throw new RuntimeException(i18n_t('Téléchargement inconnu ou expiré : recommence.')); }
    return [$path, $meta];
}

/** POST elections_dl_step {id} → {received, size, done} : la tranche suivante (reprend où le fichier s'est arrêté) */
function elections_dl_step(array $data): array
{
    [$path, $meta] = elections_dl_meta((string) ($data['id'] ?? ''));
    @set_time_limit(0);
    clearstatcache(true, $path);
    $have = filesize($path); $size = array_sum(array_column($meta['parts'], 'size'));
    $start = 0;
    foreach ($meta['parts'] as $part) {
        if ($have < $start + $part['size']) {
            $from = $have - $start; $to = min($part['size'] - 1, $from + ELECTIONS_DL_STEP - 1);
            $bytes = elections_dl_get($part['name'], [$from, $to], ELECTIONS_DL_STEP + 1024);
            if (strlen($bytes) !== $to - $from + 1) { throw new RuntimeException(i18n_t('Morceau incomplet reçu : réessaie (la reprise garde ce qui est déjà là).')); }
            $out = fopen($path, 'ab'); fwrite($out, $bytes); fclose($out);
            clearstatcache(true, $path);
            return ['received' => filesize($path), 'size' => $size, 'done' => filesize($path) >= $size];
        }
        $start += $part['size'];
    }
    return ['received' => $have, 'size' => $size, 'done' => true];
}

/** GET elections_dl_resume&id= → où en est un téléchargement interrompu */
function elections_dl_resume(string $id): array
{
    try { [$path, $meta] = elections_dl_meta($id); } catch (Throwable) { return ['exists' => false]; }
    clearstatcache(true, $path);
    return ['exists' => true, 'received' => filesize($path), 'size' => array_sum(array_column($meta['parts'], 'size'))];
}

function elections_dl_cancel(array $data): array
{
    $path = elections_upload_path((string) ($data['id'] ?? ''));
    foreach ([$path, substr($path, 0, -5) . '.dl'] as $f) { @unlink($f); }
    return ['ok' => true];
}

/** POST elections_dl_finish {id} → vérifie (taille, empreinte, base lisible, schéma) puis range le pack */
function elections_dl_finish(array $data): array
{
    [$path, $meta] = elections_dl_meta((string) ($data['id'] ?? ''));
    try {
        clearstatcache(true, $path);
        if (filesize($path) !== (int) $meta['size']) { throw new RuntimeException(i18n_t('Le fichier est incomplet (téléchargement interrompu ?) : rien n’a été installé.')); }
        @set_time_limit(0);
        if (!hash_equals((string) $meta['sha256'], (string) hash_file('sha256', $path))) { throw new RuntimeException(i18n_t('Le fichier est abîmé (empreinte différente) : rien n’a été installé.')); }
        try {
            $f = fopen($path, 'rb'); $magic = (string) fread($f, 16); fclose($f);
            if ($magic !== "SQLite format 3\0") { throw new RuntimeException('pas une base'); }
            $o = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION];
            if (defined('PDO::SQLITE_ATTR_OPEN_FLAGS')) { $o[PDO::SQLITE_ATTR_OPEN_FLAGS] = PDO::SQLITE_OPEN_READONLY; }
            $t = new PDO('sqlite:' . $path, null, null, $o);
            $m = $t->query('SELECT key, value FROM meta')->fetchAll(PDO::FETCH_KEY_PAIR);
            if (($m['kind'] ?? '') !== 'elections' || (int) ($m['format'] ?? 0) !== 1) { throw new RuntimeException('sorte'); }
            $tables = $t->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
            if (array_diff(['meta', 'sources', 'elections', 'groups', 'communes', 'results', 'deputes'], $tables)) { throw new RuntimeException('schéma'); }
            $n = (int) ($m['elections'] ?? 0); $t = null;
        } catch (Throwable) { throw new RuntimeException(i18n_t('Le pack ne peut pas être lu : rien n’a été installé.')); }
        $target = elections_path(); $hadPrev = false;
        if (is_file($target)) { @unlink($target . '.prev'); $hadPrev = @rename($target, $target . '.prev'); }
        if (!@rename($path, $target)) { if ($hadPrev) { @rename($target . '.prev', $target); } throw new RuntimeException(i18n_t('Pack impossible à ranger.')); }
        @unlink($target . '.removed');
        return ['elections' => $n, 'had_prev' => $hadPrev, 'size' => (int) filesize($target)];
    } finally { @unlink($path); @unlink(substr($path, 0, -5) . '.dl'); }
}

/** POST elections_pack_undo → défait la dernière installation (remet le pack d'avant, ou retire le nouveau) */
function elections_pack_undo(): array
{
    $t = elections_path();
    if (is_file($t . '.prev')) { @unlink($t); @rename($t . '.prev', $t); return ['restored' => true]; }
    @unlink($t);
    return ['removed' => true];
}

function elections_pack_remove(): array
{
    $t = elections_path();
    if (!is_file($t)) { throw new RuntimeException(i18n_t('Les données électorales ne sont pas installées.')); }
    @unlink($t . '.removed');
    if (!@rename($t, $t . '.removed')) { throw new RuntimeException(i18n_t('Pack impossible à retirer.')); }
    return ['ok' => true];
}

function elections_pack_restore(): array
{
    $t = elections_path();
    if (!is_file($t . '.removed')) { throw new RuntimeException(i18n_t('Rien à remettre.')); }
    if (is_file($t)) { throw new RuntimeException(i18n_t('Un autre pack a été installé entre-temps.')); }
    @rename($t . '.removed', $t);
    return ['ok' => true];
}

/* ═════════════════════════ Le lieu → la commune (code INSEE) ═════════════════════════ */

function elections_norm(string $s): string
{
    $a = function_exists('iconv') ? (string) @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s) : $s;
    return (string) preg_replace('/[^a-z0-9]+/', '', strtolower($a));
}

function elections_in_ring(float $x, float $y, array $ring): bool
{
    $in = false; $n = count($ring);
    for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
        [$xi, $yi] = [(float) $ring[$i][0], (float) $ring[$i][1]]; [$xj, $yj] = [(float) $ring[$j][0], (float) $ring[$j][1]];
        if ((($yi > $y) !== ($yj > $y)) && ($x < ($xj - $xi) * ($y - $yi) / (($yj - $yi) ?: 1e-12) + $xi)) { $in = !$in; }
    }
    return $in;
}

function elections_in_geometry(float $lon, float $lat, array $g): bool
{
    $polys = ($g['type'] ?? '') === 'Polygon' ? [$g['coordinates'] ?? []] : (($g['type'] ?? '') === 'MultiPolygon' ? ($g['coordinates'] ?? []) : []);
    foreach ($polys as $poly) {
        if (!$poly || !elections_in_ring($lon, $lat, $poly[0])) { continue; }
        $hole = false; foreach (array_slice($poly, 1) as $r) { if (elections_in_ring($lon, $lat, $r)) { $hole = true; break; } }
        if (!$hole) { return true; }
    }
    return false;
}

/** le code INSEE de la commune d'un lieu : code GeoNames (admin4), sinon contour communal qui contient le point, sinon nom unique dans le pack */
function elections_place_insee(PDO $pdo, PDO $e, array $pl): ?string
{
    $a4 = strtoupper(trim((string) ($pl['admin4_code'] ?? '')));
    $country = elections_norm((string) ($pl['country'] ?? ''));
    $fr = $country === '' || in_array($country, ['france', 'fr'], true);
    if ($fr && preg_match('/^(\d{2}|2A|2B)\d{3}$/', $a4)) { return $a4; }
    $lat = $pl['latitude'] ?? null; $lon = $pl['longitude'] ?? null;
    if ($fr && $lat !== null && $lon !== null && $lat !== '' && $lon !== '') {
        try {
            $s = $pdo->prepare('SELECT insee_code, geometry_json FROM commune_contours WHERE min_lon<=? AND max_lon>=? AND min_lat<=? AND max_lat>=? LIMIT 40');
            $s->execute([(float) $lon, (float) $lon, (float) $lat, (float) $lat]);
            foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $g = json_decode((string) $r['geometry_json'], true);
                if (is_array($g) && elections_in_geometry((float) $lon, (float) $lat, $g['geometry'] ?? $g)) { return (string) $r['insee_code']; }
            }
        } catch (Throwable) {}
    }
    if (!$fr) { return null; }
    $name = elections_norm(trim(explode(',', (string) ($pl['name'] ?? ''))[0]));
    if ($name === '') { return null; }
    $s = $e->prepare('SELECT code, dep FROM communes WHERE name_norm=? LIMIT 20'); $s->execute([$name]); $rows = $s->fetchAll();
    $dep = strtoupper(trim((string) ($pl['admin2_code'] ?? '')));
    if ($dep !== '') { $rows = array_values(array_filter($rows, static fn($r) => strtoupper((string) $r['dep']) === $dep)) ?: $rows; }
    return count($rows) === 1 ? (string) $rows[0]['code'] : null;
}

/* ═════════════════════════ Comment votait sa commune ═════════════════════════ */

function elections_groups(PDO $e): array
{
    static $memo = null;
    if ($memo !== null) { return $memo; }
    $memo = [];
    foreach ($e->query('SELECT election_id, pos, code, label, family, phrase, level FROM groups ORDER BY election_id, pos') as $g) { $memo[(int) $g['election_id']][(int) $g['pos']] = $g; }
    return $memo;
}

/** les chiffres d'une élection dans une commune : groupes en % (les grands blocs s'il y en a, sinon tout), du plus grand au plus petit */
function elections_result(PDO $e, array $el, string $insee): ?array
{
    $s = $e->prepare('SELECT * FROM results WHERE commune=? AND election_id=?'); $s->execute([$insee, (int) $el['id']]);
    $r = $s->fetch(); if (!$r) { return null; }
    $gs = elections_groups($e)[(int) $el['id']] ?? [];
    $vals = explode(',', (string) $r['v']);
    $sum = 0.0; foreach ($vals as $v) { $sum += (float) $v; }
    $exp = (int) ($r['exprimes'] ?? 0) ?: (int) $sum;
    $hasBloc = (bool) array_filter($gs, static fn($g) => $g['level'] === 'bloc');
    $out = [];
    foreach ($gs as $i => $g) {
        $v = $vals[$i] ?? ''; if ($v === '') { continue; }
        if ($hasBloc && $g['level'] !== 'bloc') { continue; }
        $pct = $el['kind'] === 'pvoix' ? (float) $v : ($exp > 0 ? 100 * (float) $v / $exp : null);
        if ($pct === null) { continue; }
        $out[] = ['label' => (string) $g['label'], 'family' => (string) $g['family'], 'phrase' => (string) $g['phrase'], 'level' => (string) $g['level'], 'pct' => round($pct, 1), 'voix' => $el['kind'] === 'voix' ? (int) $v : null];
    }
    usort($out, static fn($a, $b) => $b['pct'] <=> $a['pct']);
    return ['inscrits' => $r['inscrits'] !== null ? (int) $r['inscrits'] : null, 'votants' => $r['votants'] !== null ? (int) $r['votants'] : null, 'exprimes' => $r['exprimes'] !== null ? (int) $r['exprimes'] : null, 'groups' => $out];
}

function elections_person_rows(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT id, first_name, middle_name, last_name, gender, living_status FROM persons WHERE id=?'); $s->execute([$id]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException(i18n_t('Fiche introuvable.')); }
    $cols = $pdo->query('PRAGMA table_info(places)')->fetchAll(PDO::FETCH_COLUMN, 1);
    $pc = implode(',', array_map(static fn($c) => in_array($c, $cols, true) ? "pl.$c" : "'' AS $c", ['name', 'country', 'admin2_code', 'admin4_code', 'latitude', 'longitude']));
    $s = $pdo->prepare("SELECT e.id, e.year, e.place_id, t.gedcom_tag AS tag, $pc FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN families f ON f.id=e.family_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE (e.person_id=? OR f.partner1_id=? OR f.partner2_id=?) ORDER BY e.year, e.id");
    $s->execute([$id, $id, $id]);
    return [$p, $s->fetchAll(PDO::FETCH_ASSOC)];
}

/** GET elections_person&id= → les élections de sa vie d'adulte, dans la commune où elle vivait, et les propositions pour son profil */
function elections_person(PDO $pdo, int $id): array
{
    $e = elections_pdo();
    [$p, $events] = elections_person_rows($pdo, $id);
    if (!$e) { return ['installed' => false]; }
    $birth = null; $death = null;
    foreach ($events as $ev) { $y = $ev['year'] !== null ? (int) $ev['year'] : null; if (!$y) { continue; }
        if (in_array($ev['tag'], ['BIRT', 'BAPM', 'CHR'], true)) { $birth ??= $y; }
        if (in_array($ev['tag'], ['DEAT', 'BURI', 'CREM'], true)) { $death ??= $y; } }
    // où vivait-elle ? les événements datés avec un lieu en France, dans l'ordre
    $codes = []; $where = [];
    foreach ($events as $ev) {
        if (!$ev['place_id'] || $ev['year'] === null) { continue; }
        $pid = (int) $ev['place_id'];
        if (!array_key_exists($pid, $codes)) { $codes[$pid] = elections_place_insee($pdo, $e, $ev); }
        if ($codes[$pid]) { $where[] = [(int) $ev['year'], $codes[$pid]]; }
    }
    $years = array_column($where, 0);
    $from = $birth !== null ? $birth + 18 : ($years ? min($years) : null);
    $to = $death ?? ($birth !== null && $p['living_status'] !== 'living' ? $birth + 90 : (int) date('Y'));
    if ($years && $death === null && $birth === null) { $to = max($years); }
    $female = $p['gender'] === 'female';
    $list = [];
    if ($where && $from !== null) {
        $names = [];
        foreach ($e->query('SELECT * FROM elections ORDER BY year, code, tour')->fetchAll() as $el) {
            $y = (int) $el['year'];
            $age = $y < 1975 ? 21 : 18;
            if ($birth !== null ? ($y - $birth < $age || $y > $to) : ($y < $from || $y > $to)) { continue; }
            $code = null; foreach ($where as [$wy, $wc]) { if ($wy <= $y) { $code = $wc; } } $code ??= $where[0][1];
            $res = elections_result($e, $el, $code);
            if (!$res || !$res['groups']) { continue; }
            if (!isset($names[$code])) { $n = $e->prepare('SELECT name, dep FROM communes WHERE code=?'); $n->execute([$code]); $names[$code] = $n->fetch() ?: ['name' => $code, 'dep' => '']; }
            $list[] = ['id' => (int) $el['id'], 'code' => (string) $el['code'], 'type' => (string) $el['type'], 'tour' => (int) $el['tour'], 'year' => $y, 'date' => (string) $el['date'], 'label' => (string) $el['label'],
                'commune' => ['code' => $code, 'name' => (string) $names[$code]['name'], 'dep' => (string) $names[$code]['dep']], 'age' => $birth !== null ? $y - $birth : null,
                'could_vote' => !($female && $y < 1945)] + $res;
        }
    }
    $m = $e->query('SELECT key, value FROM meta')->fetchAll(PDO::FETCH_KEY_PAIR);
    return ['installed' => true, 'gender' => (string) $p['gender'], 'birth' => $birth, 'death' => $death, 'elections' => $list, 'no_place' => !$where,
        'citation' => (string) ($m['citation'] ?? ''), 'fixture' => !empty($m['fixture']), 'proposals' => elections_proposals($pdo, $e, $p, $birth, $death, array_values(array_unique(array_column($where, 1))), $list)];
}

/** GET elections_place&id=&from=&to= → 📜 Monographie de commune : comment on votait dans cette commune (toutes les élections du pack, ou ces années) */
function elections_place(PDO $pdo, int $id, int $from = 0, int $to = 0): array
{
    $e = elections_pdo();
    if (!$e) { return ['installed' => false]; }
    $s = $pdo->prepare('SELECT * FROM places WHERE id=?'); $s->execute([$id]); $pl = $s->fetch(PDO::FETCH_ASSOC);
    if (!$pl) { throw new RuntimeException(i18n_t('Lieu introuvable.')); }
    $code = elections_place_insee($pdo, $e, $pl);
    $list = [];
    if ($code) {
        $n = $e->prepare('SELECT name, dep FROM communes WHERE code=?'); $n->execute([$code]); $c = $n->fetch() ?: ['name' => (string) $pl['name'], 'dep' => ''];
        foreach ($e->query('SELECT * FROM elections ORDER BY year, code, tour')->fetchAll() as $el) {
            $y = (int) $el['year'];
            if (($from && $y < $from) || ($to && $y > $to)) { continue; }
            $res = elections_result($e, $el, $code);
            if (!$res || !$res['groups']) { continue; }
            $list[] = ['id' => (int) $el['id'], 'code' => (string) $el['code'], 'type' => (string) $el['type'], 'tour' => (int) $el['tour'], 'year' => $y, 'date' => (string) $el['date'], 'label' => (string) $el['label'],
                'commune' => ['code' => $code, 'name' => (string) $c['name'], 'dep' => (string) $c['dep']], 'age' => null, 'could_vote' => true] + $res;
        }
    }
    $m = $e->query('SELECT key, value FROM meta')->fetchAll(PDO::FETCH_KEY_PAIR);
    return ['installed' => true, 'insee' => $code, 'elections' => $list, 'citation' => (string) ($m['citation'] ?? ''), 'fixture' => !empty($m['fixture'])];
}

/** profil « Homme / femme politique » (ou élu local) : les mandats de député trouvés dans Wikidata sous son nom, et les
 *  présidentielles où un candidat porte son nom — à ajouter au profil « À vérifier », sauf ce qui y est déjà */
function elections_proposals(PDO $pdo, PDO $e, array $p, ?int $birth, ?int $death, array $communes, array $list): array
{
    try {
        $s = $pdo->prepare("SELECT count(*) FROM person_profiles WHERE person_id=? AND profile_key IN ('politic','elu_local')"); $s->execute([(int) $p['id']]);
        if (!(int) $s->fetchColumn()) { return []; }
    } catch (Throwable) { return []; }
    $last = elections_norm((string) $p['last_name']);
    $first = elections_norm((string) (preg_split('/[\s,-]+/u', trim((string) $p['first_name']))[0] ?? ''));
    if ($last === '' || $first === '') { return []; }
    $have = [];
    try {
        $s = $pdo->prepare("SELECT data FROM items WHERE person_id=? AND type_key='pol_election'"); $s->execute([(int) $p['id']]);
        foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $d) { $d = json_decode((string) $d, true) ?: []; if (preg_match('/\d{4}/', (string) ($d['date'] ?? ''), $m)) { $have[($d['scrutin'] ?? '') . ':' . $m[0]] = true; } }
    } catch (Throwable) {}
    $deps = array_map(static fn($c) => str_starts_with($c, '97') ? substr($c, 0, 3) : substr($c, 0, 2), $communes);
    $out = [];
    $s = $e->prepare('SELECT * FROM deputes WHERE nom_norm LIKE ? ORDER BY debut LIMIT 200'); $s->execute(['%' . $last . '%']);
    foreach ($s->fetchAll() as $d) {
        $tok = array_map('elections_norm', preg_split('/[\s-]+/u', (string) $d['nom']));
        if (!in_array($first, $tok, true) || !str_ends_with((string) $d['nom_norm'], $last)) { continue; }
        $bOk = $birth !== null && $d['naissance'] !== null ? abs($birth - (int) $d['naissance']) <= 1 : null;
        if ($bOk === false) { continue; }
        $depOk = $d['dep'] !== '' && in_array((string) $d['dep'], $deps, true);
        if (!$bOk && !$depOk) { continue; }
        $y = (int) substr((string) $d['debut'], 0, 4);
        if (($birth !== null && ($y - $birth < 21 || $y - $birth > 100)) || ($death !== null && $y > $death)) { continue; }
        if (isset($have['legislatives:' . $y])) { continue; }
        $out[] = ['key' => 'dep:' . $d['qid'] . ':' . $d['debut'], 'year' => $y, 'why' => $bOk ? 'name_birth' : 'name_dep', 'title' => i18n_t('Législatives {y} : élu député', ['y' => (string) $y]),
            'data' => ['title' => i18n_t('Législatives {y} (à vérifier)', ['y' => (string) $y]), 'date' => (string) $d['debut'], 'scrutin' => 'legislatives', 'round' => '1', 'result' => 'elu',
                'constituency' => $d['dep'] !== '' ? i18n_t('département {d}', ['d' => (string) $d['dep']]) : '',
                'sources' => i18n_t('Wikidata {q} (CC0) : mandat de député du {a}{b}. Fiche Sycomore de l’Assemblée nationale n° {s}.', ['q' => (string) $d['qid'], 'a' => (string) $d['debut'], 'b' => $d['fin'] !== '' ? ' au ' . $d['fin'] : '', 's' => (string) $d['sycomore']]),
                'notes' => i18n_t('À vérifier : proposé par 🗳 Élections d’autrefois parce que le nom {how} (Wikidata : {n}).', ['how' => $bOk ? i18n_t('et l’année de naissance correspondent') : i18n_t('correspond, dans un département où la personne a vécu'), 'n' => (string) $d['nom']])],
            'sycomore' => (string) $d['sycomore'], 'qid' => (string) $d['qid'], 'name' => (string) $d['nom'], 'dep' => (string) $d['dep']];
    }
    // présidentielles : un candidat qui porte son nom de famille (les chiffres sont ceux de sa commune)
    foreach ($list as $el) {
        if ($el['type'] !== 'pres' || isset($have['presidentielle:' . $el['year']])) { continue; }
        foreach ($el['groups'] as $g) {
            if ($g['level'] !== 'candidat') { continue; }
            $tok = array_map('elections_norm', preg_split('/[\s-]+/u', $g['label']));
            if (end($tok) !== $last && elections_norm($g['label']) !== $last) { continue; }
            $out[] = ['key' => 'pres:' . $el['code'] . ':' . $el['tour'], 'year' => $el['year'], 'why' => 'candidate', 'title' => i18n_t('{e} : candidat « {c} »', ['e' => $el['label'], 'c' => $g['label']]),
                'data' => ['title' => i18n_t('{e} (à vérifier)', ['e' => $el['label']]), 'date' => $el['date'], 'scrutin' => 'presidentielle', 'round' => (string) $el['tour'], 'label' => $g['label'],
                    'sources' => i18n_t('Cagé et Piketty (2023), Une histoire du conflit politique, données unehistoireduconflitpolitique.fr : {p} % à {c}.', ['p' => str_replace('.', ',', (string) $g['pct']), 'c' => $el['commune']['name']]),
                    'notes' => i18n_t('À vérifier : proposé par 🗳 Élections d’autrefois parce qu’un candidat porte le même nom de famille.')]];
        }
    }
    return $out;
}

/* ═════════════════════════ Aiguillage (api.php) ═════════════════════════ */

function elections_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'elections_status' => elections_status(),
        'elections_person' => elections_person($pdo, safe_int($q['id'] ?? 0)),
        'elections_place' => elections_place($pdo, safe_int($q['id'] ?? 0), safe_int($q['from'] ?? 0), safe_int($q['to'] ?? 0)),
        'elections_dl_info' => (static function () { try { return elections_dl_info(); } catch (RuntimeException $e) { return ['version' => '', 'pack' => null, 'offline' => true, 'error' => $e->getMessage()]; } })(),
        'elections_dl_resume' => elections_dl_resume((string) ($q['id'] ?? '')),
        default => throw new RuntimeException('Action inconnue.'),
    };
}

function elections_api_post(string $action, array $data): array
{
    return match ($action) {
        'elections_dl_start' => elections_dl_start(),
        'elections_dl_step' => elections_dl_step($data),
        'elections_dl_cancel' => elections_dl_cancel($data),
        'elections_dl_finish' => elections_dl_finish($data),
        'elections_pack_undo' => elections_pack_undo(),
        'elections_pack_remove' => elections_pack_remove(),
        'elections_pack_restore' => elections_pack_restore(),
        default => throw new RuntimeException('Action inconnue.'),
    };
}
