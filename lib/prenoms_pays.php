<?php
declare(strict_types=1);
/**
 * 📊 Prénoms d'ici et d'ailleurs : combien d'enfants recevaient tel prénom, l'année et là où une personne est née.
 * Écran : assets/js/heritage-prenoms-pays.js (la petite ligne de la fiche, « voir la courbe », le bloc « ⤓ Installer » de
 * Statistiques → Prénoms : la famille et la France). Rien n'est livré avec l'app, rien n'est écrit dans la généalogie.
 *
 * Le pack (prenoms-pays.sqlite.gz, fabriqué par scripts/prenoms/build-prenoms.py dans .github/workflows/prenoms.yml) est
 * déposé dans la version « prenoms-donnees » du dépôt GitHub avec prenoms-manifest.json :
 *   {"version": "2026-11", "packs": {"pays": {"size": N, "sha256": "…", "raw_size": N, "built": "…", "parts": [{"name": "prenoms-pays.sqlite.gz.000", "size": N}]}}}
 * Même chemin que la météo (lib/meteo_dl.php) : tranches de 16 Mo (HTTP Range) dans un dossier d'envoi, reprise après
 * fermeture de l'app, puis vérification (taille, empreinte sha256), décompression, base SQLite lisible du bon schéma, avant
 * de ranger le pack dans SHARED_DATA_DIR/prenoms/. Seulement l'adresse de la version GitHub (et ses redirections, chacune
 * revérifiée), rien n'est envoyé. Essais : un dossier local à la place de GitHub (GENEALOGY_TEST=1 + LCNDA_TEST_PRENOMS_DIR).
 *
 * Données (table sources du pack, « À propos des données ») : Insee, Fichier des prénoms (France et départements,
 * 1900–2023, Licence Ouverte 2.0) ; OFS STATPOP (Suisse, personnes vivant en Suisse fin 2025 selon leur année de naissance,
 * OPEN-BY) ; Retraite Québec, Banque de prénoms (1980–2025, CC BY 4.0). Belgique et Luxembourg : pas de fichier utilisable.
 *
 * Jamais une personne en vie, probablement en vie (moins de 100 ans, sans décès) ou confidentielle (même règle que
 * lib/prenoms_france.php pf_people).
 */

const PP_DL_BASE = 'https://github.com/victorbaissait/lcnda/releases/download/prenoms-donnees/';
const PP_DL_STEP = 16 * 1024 * 1024;
const PP_PACK_MAX = 1024 * 1024 * 1024;
const PP_RAW_MAX = 2 * 1024 * 1024 * 1024;
const PP_COUNTRY = ['FR' => 'France', 'CH' => 'Suisse', 'QC' => 'Québec'];
/** les pays sans fichier dans le pack, et pourquoi (dit dans « À propos des données ») */
const PP_MISSING = [
    ['pays' => 'Belgique', 'why' => 'Statbel publie les prénoms des nouveau-nés, mais son site refuse les téléchargements faits par un programme : le fichier n’a pas pu être vérifié, il n’est donc pas dans le pack.', 'url' => 'https://statbel.fgov.be/fr/themes/population/noms-et-prenoms'],
    ['pays' => 'Luxembourg', 'why' => 'Seule une liste des prénoms les plus portés en 2020 est publiée (data.public.lu), sans l’année de naissance : rien pour comparer une année.', 'url' => 'https://data.public.lu/fr/datasets/prenoms-les-plus-donnes-au-luxembourg/'],
    ['pays' => 'Suisse (par canton)', 'why' => 'Les prénoms des nouveau-nés par canton n’existent que depuis 2000 et seulement par le service stats.swiss : le pack garde la Suisse entière (STATPOP).', 'url' => 'https://www.bfs.admin.ch/asset/fr/36054234'],
];

function pp_dir(): string { return SHARED_DATA_DIR . '/prenoms'; }
function pp_path(): string { return pp_dir() . '/prenoms-pays.sqlite'; }

function pp_pdo(): ?PDO
{
    static $pool = [];
    $p = pp_path();
    clearstatcache(true, $p);
    $k = $p . ':' . (is_file($p) ? filemtime($p) . ':' . filesize($p) : '-');
    if (array_key_exists($k, $pool)) { return $pool[$k]; }
    if (!is_file($p) || filesize($p) < 1024) { return $pool[$k] = null; }
    try {
        $o = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
        if (defined('PDO::SQLITE_ATTR_OPEN_FLAGS')) { $o[PDO::SQLITE_ATTR_OPEN_FLAGS] = PDO::SQLITE_OPEN_READONLY; }
        $x = new PDO('sqlite:' . $p, null, null, $o);
        $x->query('SELECT 1 FROM meta LIMIT 1');
        return $pool[$k] = $x;
    } catch (Throwable) { return $pool[$k] = null; }
}

/** GET prenoms_pays_status → installé ? les pays, les années, les zones (pour les menus) */
function pp_status(): array
{
    $e = pp_pdo();
    $out = ['installed' => (bool) $e, 'removed' => is_file(pp_path() . '.removed'), 'dir' => pp_dir()];
    if ($e) {
        $m = $e->query('SELECT key, value FROM meta')->fetchAll(PDO::FETCH_KEY_PAIR);
        $zones = [];
        foreach ($e->query('SELECT z.id, z.pays, z.code, z.nom, MIN(t.annee) a, MAX(t.annee) b FROM zones z JOIN totals t ON t.zone=z.id GROUP BY z.id ORDER BY z.pays, z.code') as $z) {
            $zones[] = ['id' => (int) $z['id'], 'country' => $z['pays'], 'code' => $z['code'], 'name' => $z['nom'], 'from' => (int) $z['a'], 'to' => (int) $z['b']];
        }
        $out += ['built' => (string) ($m['built'] ?? ''), 'fixture' => !empty($m['essai']), 'size' => (int) filesize(pp_path()), 'zones' => $zones,
            'sources' => $e->query('SELECT pays, nom, licence, mention, url, annees, quoi FROM sources ORDER BY pays')->fetchAll()];
    }
    return $out;
}

/** GET prenoms_pays_about → les sources (installées ou non) et les pays absents */
function pp_about(): array
{
    $st = pp_status();
    return ['installed' => $st['installed'], 'sources' => $st['sources'] ?? [], 'missing' => PP_MISSING];
}

/* ═════════════════════════ ⤓ Installer en un bouton (copie du chemin de la météo) ═════════════════════════ */

function pp_dl_get(string $name, ?array $range = null, int $max = 20 * 1024 * 1024): string
{
    if (!preg_match('/^[A-Za-z0-9._-]{1,120}$/', $name)) { throw new LcndaBadInput('Nom de fichier refusé.'); }
    $dir = (string) getenv('LCNDA_TEST_PRENOMS_DIR');
    if (getenv('GENEALOGY_TEST') === '1' && $dir !== '') {
        $f = $dir . '/' . $name; if (!is_file($f)) { throw new RuntimeException(i18n_t('Les données des prénoms ne sont pas encore en ligne : réessaie plus tard, ou importe un fichier.')); }
        if (!$range) { return (string) file_get_contents($f); }
        $h = fopen($f, 'rb'); fseek($h, $range[0]); $s = (string) fread($h, $range[1] - $range[0] + 1); fclose($h); return $s;
    }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Téléchargement impossible : PHP n’a pas l’extension curl.')); }
    $url = PP_DL_BASE . $name;
    for ($hop = 0; $hop < 7; $hop++) {
        $resolve = link_safe_resolve($url);
        if ($resolve === null) { throw new RuntimeException(i18n_t('Adresse refusée : seulement une adresse publique en http ou https.')); }
        $body = ''; $too = false;
        $ch = curl_init($url);
        curl_setopt_array($ch, ($resolve !== '' ? [CURLOPT_RESOLVE => [$resolve]] : []) + ($range ? [CURLOPT_RANGE => $range[0] . '-' . $range[1]] : []) + [
            CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROXY => '', CURLOPT_NOPROXY => '*', CURLOPT_CONNECTTIMEOUT => 20, CURLOPT_TIMEOUT => 300,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => 'Mozilla/5.0 (LCNDA, donnees prenoms)',
            CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }] + lcnda_curl_tls());
        curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $loc = (string) (curl_getinfo($ch, CURLINFO_REDIRECT_URL) ?: ''); $err = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
        unset($ch);
        if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse du serveur des données des prénoms.')); }
        if (in_array($code, [301, 302, 303, 307, 308], true) && $loc !== '') { $url = link_absolute_url($url, $loc); continue; }
        if ($code === 404) { throw new RuntimeException(i18n_t('Les données des prénoms ne sont pas encore en ligne : réessaie plus tard, ou importe un fichier.')); }
        if ($code < 200 || $code >= 300) { throw new RuntimeException($err !== '' ? i18n_t('Pas de connexion au serveur des données des prénoms : {err}', ['err' => $err]) : i18n_t('Le serveur des données des prénoms répond {code}.', ['code' => (string) $code])); }
        return $body;
    }
    throw new RuntimeException(i18n_t('Trop de redirections.'));
}

/** GET prenoms_pays_dl_info → le pack en ligne (manifeste gardé une heure) */
function pp_dl_info(): array
{
    $cache = pp_dir() . '/.envois/manifest.json';
    if (is_file($cache) && filemtime($cache) > time() - 3600 && getenv('GENEALOGY_TEST') !== '1') { $m = json_decode((string) file_get_contents($cache), true); }
    else {
        $m = json_decode(pp_dl_get('prenoms-manifest.json', null, 1024 * 1024), true);
        if (is_array($m)) { @mkdir(dirname($cache), 0775, true); @file_put_contents($cache, json_encode($m)); }
    }
    if (!is_array($m) || !is_array($m['packs'] ?? null)) { throw new RuntimeException(i18n_t('Le sommaire des données des prénoms est illisible.')); }
    $p = $m['packs']['pays'] ?? null; $out = null;
    if (is_array($p) && is_array($p['parts'] ?? null) && $p['parts'] && preg_match('/^[0-9a-f]{64}$/', (string) ($p['sha256'] ?? ''))) {
        $parts = []; $sum = 0; $ok = true;
        foreach ($p['parts'] as $x) { if (!is_array($x) || !preg_match('/^[A-Za-z0-9._-]{1,120}$/', (string) ($x['name'] ?? '')) || (int) ($x['size'] ?? 0) <= 0) { $ok = false; break; } $parts[] = ['name' => (string) $x['name'], 'size' => (int) $x['size']]; $sum += (int) $x['size']; }
        if ($ok && $sum === (int) ($p['size'] ?? -1) && $sum <= PP_PACK_MAX) { $out = ['size' => $sum, 'sha256' => (string) $p['sha256'], 'raw_size' => (int) ($p['raw_size'] ?? 0), 'parts' => $parts, 'built' => (string) ($p['built'] ?? '')]; }
    }
    return ['version' => (string) ($m['version'] ?? ''), 'pack' => $out];
}

function pp_upload_path(string $id): string
{
    if (!preg_match('/^[a-f0-9]{24}$/', $id)) { throw new RuntimeException('Envoi inconnu.'); }
    $dir = pp_dir() . '/.envois';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) { throw new RuntimeException(i18n_t('Dossier des données des prénoms impossible à créer.')); }
    return $dir . '/' . $id . '.part';
}

/** POST prenoms_pays_dl_start → {id, size} */
function pp_dl_start(): array
{
    $p = pp_dl_info()['pack'];
    if (!$p) { throw new RuntimeException(i18n_t('Les données des prénoms ne sont pas encore en ligne : réessaie plus tard, ou importe un fichier.')); }
    foreach (glob(pp_dir() . '/.envois/*.{part,dl}', GLOB_BRACE) ?: [] as $old) { if (filemtime($old) < time() - 7 * 86400) { @unlink($old); } }
    $id = bin2hex(random_bytes(12));
    $path = pp_upload_path($id);
    $need = $p['size'] + max($p['raw_size'], 4 * $p['size']) + 50 * 1024 * 1024; // le fichier reçu + la base décompressée
    $free = @disk_free_space(dirname($path));
    if ($free !== false && $free < $need) { throw new RuntimeException(i18n_t('Pas assez de place sur le disque (il faut environ {n} Mo de libres).', ['n' => (string) ceil($need / 1e6)])); }
    file_put_contents($path, '');
    file_put_contents(substr($path, 0, -5) . '.dl', json_encode(['parts' => $p['parts'], 'sha256' => $p['sha256'], 'size' => $p['size']]));
    return ['id' => $id, 'size' => $p['size']];
}

function pp_dl_meta(string $id): array
{
    $path = pp_upload_path($id);
    $meta = json_decode((string) @file_get_contents(substr($path, 0, -5) . '.dl'), true);
    if (!is_file($path) || !is_array($meta) || !is_array($meta['parts'] ?? null)) { throw new RuntimeException(i18n_t('Téléchargement inconnu ou expiré : recommence.')); }
    return [$path, $meta];
}

/** POST prenoms_pays_dl_step {id} → {received, size, done} : la tranche suivante (reprend où le fichier s'est arrêté) */
function pp_dl_step(array $data): array
{
    [$path, $meta] = pp_dl_meta((string) ($data['id'] ?? ''));
    @set_time_limit(0);
    clearstatcache(true, $path);
    $have = filesize($path); $size = array_sum(array_column($meta['parts'], 'size'));
    $start = 0;
    foreach ($meta['parts'] as $part) {
        if ($have < $start + $part['size']) {
            $from = $have - $start; $to = min($part['size'] - 1, $from + PP_DL_STEP - 1);
            $bytes = pp_dl_get($part['name'], [$from, $to], PP_DL_STEP + 1024);
            if (strlen($bytes) !== $to - $from + 1) { throw new RuntimeException(i18n_t('Morceau incomplet reçu : réessaie (la reprise garde ce qui est déjà là).')); }
            $out = fopen($path, 'ab'); fwrite($out, $bytes); fclose($out);
            clearstatcache(true, $path);
            return ['received' => filesize($path), 'size' => $size, 'done' => filesize($path) >= $size];
        }
        $start += $part['size'];
    }
    return ['received' => $have, 'size' => $size, 'done' => true];
}

/** GET prenoms_pays_dl_resume&id= → où en est un téléchargement interrompu */
function pp_dl_resume(string $id): array
{
    try { [$path, $meta] = pp_dl_meta($id); } catch (Throwable) { return ['exists' => false]; }
    clearstatcache(true, $path);
    return ['exists' => true, 'received' => filesize($path), 'size' => array_sum(array_column($meta['parts'], 'size'))];
}

function pp_dl_cancel(array $data): array
{
    $path = pp_upload_path((string) ($data['id'] ?? ''));
    foreach ([$path, substr($path, 0, -5) . '.dl'] as $f) { @unlink($f); }
    return ['ok' => true];
}

/** POST prenoms_pays_dl_finish {id} → vérifie (taille, empreinte), décompresse, vérifie la base (schéma) puis la range */
function pp_dl_finish(array $data): array
{
    [$path, $meta] = pp_dl_meta((string) ($data['id'] ?? ''));
    $tmp = pp_path() . '.' . bin2hex(random_bytes(4)) . '.tmp';
    try {
        clearstatcache(true, $path);
        if (filesize($path) !== (int) $meta['size']) { throw new RuntimeException(i18n_t('Le fichier est incomplet (téléchargement interrompu ?) : rien n’a été installé.')); }
        @set_time_limit(0);
        if (!hash_equals((string) $meta['sha256'], (string) hash_file('sha256', $path))) { throw new RuntimeException(i18n_t('Le fichier est abîmé (empreinte différente) : rien n’a été installé.')); }
        try {
            $in = gzopen($path, 'rb'); $out = fopen($tmp, 'wb'); $n = 0;
            if (!$in || !$out) { throw new RuntimeException('ouverture'); }
            while (!gzeof($in)) { $b = gzread($in, 1 << 20); if ($b === false || $b === '') { break; } $n += strlen($b); if ($n > PP_RAW_MAX) { throw new RuntimeException('trop gros'); } fwrite($out, $b); }
            gzclose($in); fclose($out);
            $f = fopen($tmp, 'rb'); $magic = (string) fread($f, 16); fclose($f);
            if ($magic !== "SQLite format 3\0") { throw new RuntimeException('pas une base'); }
            $o = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION];
            if (defined('PDO::SQLITE_ATTR_OPEN_FLAGS')) { $o[PDO::SQLITE_ATTR_OPEN_FLAGS] = PDO::SQLITE_OPEN_READONLY; }
            $t = new PDO('sqlite:' . $tmp, null, null, $o);
            $m = $t->query('SELECT key, value FROM meta')->fetchAll(PDO::FETCH_KEY_PAIR);
            if (($m['kind'] ?? '') !== 'pays' || (int) ($m['format'] ?? 0) !== 1) { throw new RuntimeException('sorte'); }
            $tables = $t->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
            if (array_diff(['meta', 'sources', 'zones', 'names', 'counts', 'totals'], $tables)) { throw new RuntimeException('schéma'); }
            $countries = array_column($t->query('SELECT DISTINCT pays FROM zones ORDER BY pays')->fetchAll(PDO::FETCH_ASSOC), 'pays');
            $t = null;
        } catch (Throwable) { @unlink($tmp); throw new RuntimeException(i18n_t('Le pack ne peut pas être lu : rien n’a été installé.')); }
        $target = pp_path(); $hadPrev = false;
        if (is_file($target)) { @unlink($target . '.prev'); $hadPrev = @rename($target, $target . '.prev'); }
        if (!@rename($tmp, $target)) { @unlink($tmp); if ($hadPrev) { @rename($target . '.prev', $target); } throw new RuntimeException(i18n_t('Pack impossible à ranger.')); }
        @unlink($target . '.removed');
        return ['countries' => $countries, 'had_prev' => $hadPrev, 'size' => (int) filesize($target)];
    } finally { @unlink($path); @unlink(substr($path, 0, -5) . '.dl'); }
}

/** POST prenoms_pays_pack_undo → défait la dernière installation (remet le pack d'avant, ou retire le nouveau) */
function pp_pack_undo(): array
{
    $t = pp_path();
    if (is_file($t . '.prev')) { @unlink($t); @rename($t . '.prev', $t); return ['restored' => true]; }
    @unlink($t);
    return ['removed' => true];
}

/** POST prenoms_pays_pack_remove → mis de côté (« ↶ Annuler » : prenoms_pays_pack_restore) */
function pp_pack_remove(): array
{
    $t = pp_path();
    if (!is_file($t)) { throw new RuntimeException(i18n_t('Les données des prénoms ne sont pas installées.')); }
    @unlink($t . '.removed');
    if (!@rename($t, $t . '.removed')) { throw new RuntimeException(i18n_t('Pack impossible à retirer.')); }
    return ['ok' => true];
}

function pp_pack_restore(): array
{
    $t = pp_path();
    if (!is_file($t . '.removed')) { throw new RuntimeException(i18n_t('Rien à remettre.')); }
    if (is_file($t)) { throw new RuntimeException(i18n_t('Un autre pack a été installé entre-temps.')); }
    @rename($t . '.removed', $t);
    return ['ok' => true];
}

/* ═════════════════════════ Lire les chiffres ═════════════════════════ */

/** « Marie-Thérèse Jeanne » → « MARIE-THERESE » (comme lib/heritage.php prenom_key) */
function pp_key(string $name): string
{
    $first = preg_split('/[\s,]+/u', trim($name))[0] ?? '';
    return strtoupper(ascii_fold($first));
}

function pp_fold(string $s): string
{
    return trim((string) preg_replace('/[^a-z0-9]+/', ' ', strtolower(ascii_fold(trim($s)))));
}

/** le lieu → [pays, code du département ('' : le pays entier)] ou null (pays sans données) */
function pp_place_zone(array $pl): ?array
{
    $c = pp_fold((string) ($pl['country'] ?? ''));
    $txt = pp_fold(implode(' ', [(string) ($pl['name'] ?? ''), (string) ($pl['county'] ?? ''), (string) ($pl['state'] ?? '')]));
    if (in_array($c, ['suisse', 'switzerland', 'schweiz', 'svizzera', 'ch', 'confederation suisse'], true)) { return ['CH', '']; }
    if ($c === 'quebec' || (in_array($c, ['canada', 'ca', 'bas canada', 'nouvelle france'], true) && preg_match('/\bquebec\b/', $txt)) || ($c === '' && preg_match('/\bquebec\b/', pp_fold((string) ($pl['state'] ?? ''))))) { return ['QC', '']; }
    if ($c !== '' && !in_array($c, ['france', 'fr', 'republique francaise'], true)) { return null; }
    if (!function_exists('world_place_dept')) { require_once __DIR__ . '/monde_autour.php'; }
    $d = world_place_dept($pl);
    if ($d === '2A' || $d === '2B') { $d = '20'; } // le fichier de l'Insee compte la Corse d'un seul bloc
    return ['FR', $d];
}

/** les chiffres d'un prénom dans une zone pour une année : [n, rang, total, prénoms comptés] ou null */
function pp_point(PDO $e, int $zone, int $nameId, int $sex, int $year): ?array
{
    $t = $e->prepare('SELECT n, prenoms FROM totals WHERE zone=? AND sexe=? AND annee=?'); $t->execute([$zone, $sex, $year]); $tot = $t->fetch();
    if (!$tot || (int) $tot['n'] <= 0) { return null; }
    $c = $e->prepare('SELECT n, rang FROM counts WHERE name=? AND zone=? AND sexe=? AND annee=?'); $c->execute([$nameId, $zone, $sex, $year]); $r = $c->fetch();
    return ['n' => $r ? (int) $r['n'] : 0, 'rank' => $r ? (int) $r['rang'] : null, 'total' => (int) $tot['n'], 'names' => (int) $tot['prenoms']];
}

function pp_zone_row(PDO $e, string $cc, string $code): ?array
{
    $s = $e->prepare('SELECT id, pays, code, nom FROM zones WHERE pays=? AND code=?'); $s->execute([$cc, $code]);
    $r = $s->fetch();
    return $r ? ['id' => (int) $r['id'], 'country' => $r['pays'], 'code' => $r['code'], 'name' => $r['nom']] : null;
}

/** « dans le Cantal », « dans l'Ain », « en France », « au Québec »… */
function pp_where(array $z): string
{
    if ($z['code'] === '') { return ['FR' => 'en France', 'CH' => 'en Suisse', 'QC' => 'au Québec'][$z['country']] ?? ('en ' . $z['name']); }
    $n = $z['name'];
    $special = ['Paris' => 'à Paris', 'Corse' => 'en Corse', 'Guadeloupe' => 'en Guadeloupe', 'Martinique' => 'en Martinique', 'Guyane' => 'en Guyane', 'La Réunion' => 'à La Réunion', 'Mayotte' => 'à Mayotte'];
    if (isset($special[$n])) { return $special[$n]; }
    $plural = ['Ardennes', 'Bouches-du-Rhône', 'Côtes-d’Armor', 'Deux-Sèvres', 'Hautes-Alpes', 'Alpes-Maritimes', 'Alpes-de-Haute-Provence', 'Hautes-Pyrénées', 'Pyrénées-Atlantiques', 'Pyrénées-Orientales', 'Landes', 'Vosges', 'Yvelines', 'Hauts-de-Seine'];
    if (in_array($n, $plural, true)) { return 'dans les ' . $n; }
    if (preg_match('/^[AEIOUYH]/u', ascii_fold($n)) && !in_array($n, ['Haute-Garonne', 'Haute-Loire', 'Haute-Marne', 'Haute-Saône', 'Haute-Savoie', 'Haute-Vienne', 'Haut-Rhin'], true)) { return 'dans l’' . $n; }
    $fem = ['Charente', 'Charente-Maritime', 'Corrèze', 'Creuse', 'Dordogne', 'Drôme', 'Gironde', 'Haute-Garonne', 'Haute-Loire', 'Haute-Marne', 'Haute-Saône', 'Haute-Savoie', 'Haute-Vienne', 'Loire', 'Loire-Atlantique', 'Lozère', 'Manche', 'Marne', 'Mayenne', 'Meurthe-et-Moselle', 'Meuse', 'Moselle', 'Nièvre', 'Sarthe', 'Savoie', 'Seine-Maritime', 'Seine-et-Marne', 'Seine-Saint-Denis', 'Somme', 'Vendée', 'Vienne', 'Côte-d’Or'];
    return (in_array($n, $fem, true) ? 'dans la ' : 'dans le ') . $n;
}

/** la personne : prénom, sexe, naissance (année, lieu), cachée ? (même règle que pf_people) */
function pp_person_row(PDO $pdo, int $id): ?array
{
    $hasPriv = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('persons') WHERE name='is_private'")->fetchColumn();
    $s = $pdo->prepare("SELECT id, first_name, gender, living_status, COALESCE(kind,'') AS kind" . ($hasPriv ? ', COALESCE(is_private,0) AS priv' : ', 0 AS priv') . ' FROM persons WHERE id=?');
    $s->execute([$id]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p || $p['kind'] === 'animal') { return null; }
    $ev = $pdo->prepare("SELECT t.gedcom_tag AS tag, e.year, pl.name, pl.county, pl.state, pl.country, pl.admin2_code, pl.admin4_code
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE e.person_id=? AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI','CREM') ORDER BY (t.gedcom_tag='BIRT') DESC, COALESCE(e.year,9999), e.id");
    try { $ev->execute([$id]); $rows = $ev->fetchAll(PDO::FETCH_ASSOC); }
    catch (Throwable) { // une base sans les colonnes admin*_code
        $ev = $pdo->prepare(str_replace(', pl.admin2_code, pl.admin4_code', '', $ev->queryString)); $ev->execute([$id]); $rows = $ev->fetchAll(PDO::FETCH_ASSOC);
    }
    $birth = null; $dead = false;
    foreach ($rows as $r) {
        if (in_array($r['tag'], ['DEAT', 'BURI', 'CREM'], true)) { $dead = true; continue; }
        if (!$birth && $r['year']) { $birth = $r; }
    }
    $by = $birth ? (int) $birth['year'] : 0;
    $hidden = (int) $p['priv'] === 1 || $p['living_status'] === 'living' || ($p['living_status'] !== 'deceased' && !$dead && (!$by || $by > (int) date('Y') - 100));
    return ['id' => (int) $p['id'], 'first' => trim((string) $p['first_name']), 'g' => (string) $p['gender'], 'birth' => $birth, 'year' => $by, 'hidden' => $hidden];
}

/** GET prenoms_pays_person&id= → la petite ligne de la fiche (ou {line: null, why}) */
function pp_person(PDO $pdo, int $id): array
{
    $e = pp_pdo();
    if (!$e) { return ['installed' => false, 'line' => null, 'why' => 'not_installed']; }
    $p = pp_person_row($pdo, $id);
    if (!$p) { return ['installed' => true, 'line' => null, 'why' => 'none']; }
    if ($p['hidden']) { return ['installed' => true, 'line' => null, 'why' => 'hidden']; }
    $sex = $p['g'] === 'female' ? 2 : ($p['g'] === 'male' ? 1 : 0);
    $key = pp_key($p['first']);
    if (!$sex || $key === '' || !$p['birth'] || !$p['year']) { return ['installed' => true, 'line' => null, 'why' => 'unknown']; }
    $where = pp_place_zone($p['birth']);
    if (!$where || ($p['birth']['name'] ?? null) === null) { return ['installed' => true, 'line' => null, 'why' => 'place']; }
    $s = $e->prepare('SELECT id FROM names WHERE prenom=?'); $s->execute([$key]); $nameId = (int) ($s->fetchColumn() ?: 0);
    $zones = [];
    if ($where[1] !== '' && ($z = pp_zone_row($e, $where[0], $where[1]))) { $zones[] = $z; }
    if ($z = pp_zone_row($e, $where[0], '')) { $zones[] = $z; }
    foreach ($zones as $z) {
        $pt = pp_point($e, $z['id'], $nameId, $sex, $p['year']);
        if (!$pt) { continue; } // année hors du fichier : le pays entier, sinon rien
        $label = mb_convert_case(mb_strtolower(preg_split('/[\s,]+/u', $p['first'])[0]), MB_CASE_TITLE);
        $src = $e->prepare('SELECT nom, mention, url, licence FROM sources WHERE pays=?'); $src->execute([$z['country']]);
        return ['installed' => true, 'line' => ['name' => $label, 'key' => $key, 'sex' => $sex, 'year' => $p['year'], 'zone' => $z, 'where' => pp_where($z),
            'country_zone' => $zones[count($zones) - 1]['id'], 'n' => $pt['n'], 'total' => $pt['total'], 'rank' => $pt['rank'],
            'one_in' => $pt['n'] > 0 ? (int) round($pt['total'] / $pt['n']) : null, 'living_pop' => $z['country'] === 'CH', 'source' => $src->fetch() ?: null]];
    }
    return ['installed' => true, 'line' => null, 'why' => 'years'];
}

/** GET prenoms_pays_curve&name=&sex=&zones=1,2 → la courbe d'un prénom : pour mille naissances, chaque année, zone par zone */
function pp_curve(array $q): array
{
    $e = pp_pdo();
    if (!$e) { return ['installed' => false, 'series' => []]; }
    $key = pp_key(mb_substr((string) ($q['name'] ?? ''), 0, 60));
    $sex = (int) ($q['sex'] ?? 0); if (!in_array($sex, [0, 1, 2], true)) { $sex = 0; }
    $ids = array_slice(array_values(array_unique(array_filter(array_map('intval', explode(',', (string) ($q['zones'] ?? '')))))), 0, 4);
    $s = $e->prepare('SELECT id FROM names WHERE prenom=?'); $s->execute([$key]); $nameId = (int) ($s->fetchColumn() ?: 0);
    $out = [];
    foreach ($ids as $zid) {
        $z = $e->prepare('SELECT id, pays, code, nom FROM zones WHERE id=?'); $z->execute([$zid]); $zr = $z->fetch();
        if (!$zr) { continue; }
        $tot = []; $cnt = [];
        $t = $e->prepare('SELECT annee, SUM(n) n FROM totals WHERE zone=? AND (?=0 OR sexe=?) GROUP BY annee ORDER BY annee'); $t->execute([$zid, $sex, $sex]);
        foreach ($t as $r) { $tot[(int) $r['annee']] = (int) $r['n']; }
        $c = $e->prepare('SELECT annee, SUM(n) n, MIN(rang) r FROM counts WHERE name=? AND zone=? AND (?=0 OR sexe=?) GROUP BY annee'); $c->execute([$nameId, $zid, $sex, $sex]);
        foreach ($c as $r) { $cnt[(int) $r['annee']] = [(int) $r['n'], (int) $r['r']]; }
        $pts = [];
        foreach ($tot as $y => $n) { $k = $cnt[$y] ?? [0, null]; $pts[] = ['y' => $y, 'n' => $k[0], 'total' => $n, 'per1000' => $n > 0 ? round($k[0] * 1000 / $n, 3) : 0, 'rank' => $sex ? $k[1] : null]; }
        $src = $e->prepare('SELECT nom, mention, url, licence, quoi FROM sources WHERE pays=?'); $src->execute([$zr['pays']]);
        $zz = ['id' => (int) $zr['id'], 'country' => $zr['pays'], 'code' => $zr['code'], 'name' => $zr['nom']];
        $out[] = ['zone' => $zz + ['where' => pp_where($zz)], 'points' => $pts, 'source' => $src->fetch() ?: null];
    }
    return ['installed' => true, 'name' => $key, 'sex' => $sex, 'series' => $out];
}

/** pour lib/heritage.php firstnames_france_data : la série d'une zone (nombre par année), ou null sans pack */
function pp_series_by_key(string $key, int $sex, int $zoneId): ?array
{
    $e = pp_pdo(); if (!$e) { return null; }
    $s = $e->prepare('SELECT c.annee, SUM(c.n) n FROM counts c JOIN names nm ON nm.id=c.name WHERE nm.prenom=? AND c.zone=? AND (?=0 OR c.sexe=?) GROUP BY c.annee ORDER BY c.annee');
    $s->execute([$key, $zoneId, $sex, $sex]);
    $out = [];
    foreach ($s as $r) { $out[(int) $r['annee']] = (int) $r['n']; }
    return $out;
}

/* ═════════════════════════ Aiguillage (api.php) ═════════════════════════ */

function pp_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'prenoms_pays_status' => pp_status(),
        'prenoms_pays_about' => pp_about(),
        'prenoms_pays_person' => pp_person($pdo, safe_int($q['id'] ?? 0)),
        'prenoms_pays_curve' => pp_curve($q),
        'prenoms_pays_dl_info' => (static function () { try { return pp_dl_info(); } catch (RuntimeException $e) { return ['version' => '', 'pack' => null, 'offline' => true, 'error' => $e->getMessage()]; } })(),
        'prenoms_pays_dl_resume' => pp_dl_resume((string) ($q['id'] ?? '')),
        default => throw new RuntimeException('Action inconnue.'),
    };
}

function pp_api_post(string $action, array $data): array
{
    return match ($action) {
        'prenoms_pays_dl_start' => pp_dl_start(),
        'prenoms_pays_dl_step' => pp_dl_step($data),
        'prenoms_pays_dl_cancel' => pp_dl_cancel($data),
        'prenoms_pays_dl_finish' => pp_dl_finish($data),
        'prenoms_pays_pack_undo' => pp_pack_undo(),
        'prenoms_pays_pack_remove' => pp_pack_remove(),
        'prenoms_pays_pack_restore' => pp_pack_restore(),
        default => throw new RuntimeException('Action inconnue.'),
    };
}
