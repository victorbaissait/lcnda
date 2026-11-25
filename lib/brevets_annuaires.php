<?php
declare(strict_types=1);
/**
 * 📇 Les annuaires du commerce de Paris (1787–1914) et 💡 les brevets d'invention du XIXᵉ siècle.
 *
 * 📇 Annuaires — un pack à télécharger une fois (Réglages → 📇 Annuaires de Paris, assets/js/heritage-brevets-annuaires.js),
 *    puis lu sans Internet. Source : SoDUCo, « Annuaires historiques parisiens, 1798-1914 », NAKALA
 *    (DOI 10.34847/nkl.98eem49t), Licence Ouverte Etalab 2.0 : les entrées des listes alphabétiques des annuaires
 *    (Bottin, Didot, Didot-Bottin, Paris-Hachette…) lues automatiquement, avec l'adresse géocodée et la page Gallica.
 *    Fabriqué par scripts/brevets-annuaires/build-annuaires.py (.github/workflows/brevets-annuaires.yml).
 *  · fiche : « 📇 En 1855, un MAZAUD, boulanger, 12 rue de la Roquette (annuaire Didot-Bottin) ↗ » quand une personne
 *    qui a vécu à Paris y ressemble (même nom ; et même prénom, ou même métier, ou même rue, ou nom rare) ;
 *    « ✓ C'est lui » ajoute la source et un événement « Lieu de résidence » (↶ Annuler), « ✗ Pas lui » (↶) ;
 *  · Listes → Données (ba_list), calque de carte (ba_map : une adresse au fil des années), monographie de Paris (ba_place).
 * 💡 Brevets — la base de l'INPI (1791–1901) n'est pas téléchargeable librement : son fichier « open data » (licence de
 *    réutilisation INPI, gratuite) n'est envoyé que par courriel après une demande de compte ; rien n'est livré ni
 *    téléchargé ici : l'écran propose seulement de chercher sur le site de l'INPI (voir le fichier JS).
 * Le pack est un fichier SQLite à part (dossier des données / brevets-annuaires), jamais dans la généalogie.
 * Écritures dans la généalogie : seulement ba_add / ba_undo (source + événement) et ba_mark (« Pas lui »).
 * Essais : un dossier local à la place de GitHub (GENEALOGY_TEST=1 + LCNDA_TEST_BA_DIR) — tests/test-brevets-annuaires.js.
 */

const BA_DL_BASE = 'https://github.com/victorbaissait/lcnda/releases/download/brevets-annuaires-donnees/';
const BA_DL_STEP = 16 * 1024 * 1024;
const BA_PACK_MAX = 4 * 1024 * 1024 * 1024;
const BA_MARK = 'LCNDA annuaires de Paris';
const BA_PAGE = 'https://nakala.fr/10.34847/nkl.98eem49t';
const BA_FIRST = 1787;
const BA_LAST = 1914;
const BA_FEMALE = ['MME', 'MMES', 'MLLE', 'MLLES', 'MILE', 'VVE', 'VE', 'VEUVE', 'DLLE', 'DAME', 'MADAME', 'DEMOISELLE'];
const BA_TITLES = ['M', 'MM', 'MR', 'DR', 'DE', 'D', 'DU', 'LE', 'LA', 'ABBE', 'LABBE', 'BARON', 'COMTE', 'MARQUIS', 'VICOMTE', 'CHEVALIER', 'GENERAL', 'COLONEL', 'AINE', 'JEUNE', 'FILS', 'PERE', 'FRERES', 'NEVEU', 'CADET', 'ET', 'CIE'];

function ba_dir(): string { return SHARED_DATA_DIR . '/brevets-annuaires'; }
function ba_path(): string { return ba_dir() . '/ba-annuaires.sqlite'; }

function ba_pdo(): ?PDO
{
    static $pool = false;
    if ($pool !== false) { return $pool; }
    $p = ba_path();
    if (!is_file($p) || filesize($p) < 1024) { return $pool = null; }
    try {
        $o = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
        if (defined('PDO::SQLITE_ATTR_OPEN_FLAGS')) { $o[PDO::SQLITE_ATTR_OPEN_FLAGS] = PDO::SQLITE_OPEN_READONLY; }
        $x = new PDO('sqlite:' . $p, null, null, $o);
        $x->query('SELECT 1 FROM e LIMIT 1');
        return $pool = $x;
    } catch (Throwable) { return $pool = null; }
}

/** la clé d'un nom : MAJUSCULES sans accents, sans espaces ni tirets — comme cle() dans build-annuaires.py */
function ba_key(string $s): string
{
    $s = str_replace(['œ', 'Œ', 'æ', 'Æ', 'ß'], ['oe', 'OE', 'ae', 'AE', 'ss'], $s);
    if (class_exists('Normalizer')) { $n = Normalizer::normalize($s, Normalizer::FORM_KD); if (is_string($n)) { $s = (string) preg_replace('/\p{Mn}+/u', '', $n); } }
    else { $s = strtr($s, ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'á' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'ñ' => 'n', 'ÿ' => 'y',
        'À' => 'A', 'Â' => 'A', 'Ä' => 'A', 'É' => 'E', 'È' => 'E', 'Ê' => 'E', 'Ë' => 'E', 'Î' => 'I', 'Ï' => 'I', 'Ô' => 'O', 'Ö' => 'O', 'Ù' => 'U', 'Û' => 'U', 'Ü' => 'U', 'Ç' => 'C']); }
    return (string) preg_replace('/[^A-Z]+/', '', strtoupper($s));
}
function ba_fold(string $s): string { return strtolower((string) preg_replace('/\s+/', ' ', preg_replace('/[^A-Za-z0-9]+/', ' ', ba_key_soft($s)))); }
/** sans accents mais en gardant les espaces (pour comparer des mots) */
function ba_key_soft(string $s): string
{
    $s = str_replace(['œ', 'Œ', 'æ', 'Æ', '’'], ['oe', 'OE', 'ae', 'AE', "'"], $s);
    if (class_exists('Normalizer')) { $n = Normalizer::normalize($s, Normalizer::FORM_KD); if (is_string($n)) { $s = (string) preg_replace('/\p{Mn}+/u', '', $n); } }
    return $s;
}

/** les prénoms en clés : « Jean-Marie Victor » → [JEAN, MARIE, VICTOR, JEANMARIE] */
function ba_first_keys(string $s): array
{
    $out = [];
    foreach (preg_split('/[\s,]+/u', trim($s)) ?: [] as $w) { if ($w === '') { continue; } foreach (explode('-', $w) as $p) { $k = ba_key($p); if ($k !== '') { $out[] = $k; } } if (str_contains($w, '-')) { $out[] = ba_key($w); } }
    return array_values(array_unique($out));
}

/* ═════════════════════════ ⤓ Le pack (copie du chemin de la météo, lib/meteo_dl.php) ═════════════════════════ */

function ba_dl_get(string $name, ?array $range = null, int $max = 20 * 1024 * 1024): string
{
    if (!preg_match('/^[A-Za-z0-9._-]{1,120}$/', $name)) { throw new LcndaBadInput('Nom de fichier refusé.'); }
    $dir = (string) getenv('LCNDA_TEST_BA_DIR');
    if (getenv('GENEALOGY_TEST') === '1' && $dir !== '') {
        $f = $dir . '/' . $name; if (!is_file($f)) { throw new RuntimeException(i18n_t('Les annuaires de Paris ne sont pas encore en ligne : réessaie plus tard.')); }
        if (!$range) { return (string) file_get_contents($f); }
        $h = fopen($f, 'rb'); fseek($h, $range[0]); $s = (string) fread($h, $range[1] - $range[0] + 1); fclose($h); return $s;
    }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Téléchargement impossible : PHP n’a pas l’extension curl.')); }
    $url = BA_DL_BASE . $name;
    for ($hop = 0; $hop < 7; $hop++) {
        $resolve = link_safe_resolve($url);
        if ($resolve === null) { throw new RuntimeException(i18n_t('Adresse refusée : seulement une adresse publique en http ou https.')); }
        $body = ''; $too = false;
        $ch = curl_init($url);
        curl_setopt_array($ch, ($resolve !== '' ? [CURLOPT_RESOLVE => [$resolve]] : []) + ($range ? [CURLOPT_RANGE => $range[0] . '-' . $range[1]] : []) + [
            CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROXY => '', CURLOPT_NOPROXY => '*', CURLOPT_CONNECTTIMEOUT => 20, CURLOPT_TIMEOUT => 300,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => 'Mozilla/5.0 (LCNDA, annuaires de Paris)',
            CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }] + lcnda_curl_tls());
        curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $loc = (string) (curl_getinfo($ch, CURLINFO_REDIRECT_URL) ?: ''); $err = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
        unset($ch);
        if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse du serveur des annuaires.')); }
        if (in_array($code, [301, 302, 303, 307, 308], true) && $loc !== '') { $url = link_absolute_url($url, $loc); continue; }
        if ($code === 404) { throw new RuntimeException(i18n_t('Les annuaires de Paris ne sont pas encore en ligne : réessaie plus tard.')); }
        if ($code < 200 || $code >= 300) { throw new RuntimeException($err !== '' ? i18n_t('Pas de connexion au serveur des annuaires : {err}', ['err' => $err]) : i18n_t('Le serveur des annuaires répond {code}.', ['code' => (string) $code])); }
        return $body;
    }
    throw new RuntimeException(i18n_t('Trop de redirections.'));
}

/** GET ba_dl_info → le pack en ligne (manifeste gardé une heure) */
function ba_dl_info(): array
{
    $cache = ba_dir() . '/.envois/manifest.json';
    if (is_file($cache) && filemtime($cache) > time() - 3600 && getenv('GENEALOGY_TEST') !== '1') { $m = json_decode((string) file_get_contents($cache), true); }
    else {
        $m = json_decode(ba_dl_get('brevets-annuaires-manifest.json', null, 1024 * 1024), true);
        if (is_array($m)) { @mkdir(dirname($cache), 0775, true); @file_put_contents($cache, json_encode($m)); }
    }
    if (!is_array($m) || !is_array($m['packs'] ?? null)) { throw new RuntimeException(i18n_t('Le sommaire des annuaires est illisible.')); }
    $out = [];
    $p = $m['packs']['annuaires'] ?? null;
    if (is_array($p) && is_array($p['parts'] ?? null) && $p['parts'] && preg_match('/^[0-9a-f]{64}$/', (string) ($p['sha256'] ?? ''))) {
        $parts = []; $sum = 0; $ok = true;
        foreach ($p['parts'] as $x) { if (!is_array($x) || !preg_match('/^[A-Za-z0-9._-]{1,120}$/', (string) ($x['name'] ?? '')) || (int) ($x['size'] ?? 0) <= 0) { $ok = false; break; } $parts[] = ['name' => (string) $x['name'], 'size' => (int) $x['size']]; $sum += (int) $x['size']; }
        if ($ok && $sum === (int) ($p['size'] ?? -1) && $sum <= BA_PACK_MAX) {
            $out['annuaires'] = ['size' => $sum, 'sha256' => (string) $p['sha256'], 'parts' => $parts, 'built' => (string) ($p['built'] ?? ''), 'records' => (int) ($p['records'] ?? 0), 'sqlite_size' => (int) ($p['sqlite_size'] ?? 0)];
        }
    }
    return ['version' => (string) ($m['version'] ?? ''), 'packs' => (object) $out];
}

function ba_upload_path(string $id): string
{
    if (!preg_match('/^[a-f0-9]{24}$/', $id)) { throw new RuntimeException('Envoi inconnu.'); }
    $dir = ba_dir() . '/.envois';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) { throw new RuntimeException(i18n_t('Dossier des annuaires impossible à créer.')); }
    return $dir . '/' . $id . '.part';
}

/** POST ba_dl_start → {id, size} */
function ba_dl_start(array $data): array
{
    $p = ((array) ba_dl_info()['packs'])['annuaires'] ?? null;
    if (!$p) { throw new RuntimeException(i18n_t('Les annuaires de Paris ne sont pas encore en ligne : réessaie plus tard.')); }
    foreach (glob(ba_dir() . '/.envois/*.{part,dl}', GLOB_BRACE) ?: [] as $old) { if (filemtime($old) < time() - 7 * 86400) { @unlink($old); } }
    $id = bin2hex(random_bytes(12));
    $path = ba_upload_path($id);
    $need = $p['size'] + max($p['sqlite_size'], 3 * $p['size']) + 50 * 1024 * 1024;
    $free = @disk_free_space(dirname($path));
    if ($free !== false && $free < $need) { throw new RuntimeException(i18n_t('Pas assez de place sur le disque (il faut environ {n} Mo de libres).', ['n' => (string) ceil($need / 1e6)])); }
    file_put_contents($path, '');
    file_put_contents(substr($path, 0, -5) . '.dl', json_encode(['kind' => 'annuaires', 'parts' => $p['parts'], 'sha256' => $p['sha256'], 'size' => $p['size']]));
    return ['id' => $id, 'size' => $p['size'], 'kind' => 'annuaires'];
}

function ba_dl_meta(string $id): array
{
    $path = ba_upload_path($id);
    $meta = json_decode((string) @file_get_contents(substr($path, 0, -5) . '.dl'), true);
    if (!is_file($path) || !is_array($meta) || !is_array($meta['parts'] ?? null)) { throw new RuntimeException(i18n_t('Téléchargement inconnu ou expiré : recommence.')); }
    return [$path, $meta];
}

/** POST ba_dl_step {id} → {received, size, done} : la tranche suivante (reprend où le fichier s'est arrêté) */
function ba_dl_step(array $data): array
{
    [$path, $meta] = ba_dl_meta((string) ($data['id'] ?? ''));
    @set_time_limit(0);
    clearstatcache(true, $path);
    $have = filesize($path); $size = array_sum(array_column($meta['parts'], 'size'));
    $start = 0;
    foreach ($meta['parts'] as $part) {
        if ($have < $start + $part['size']) {
            $from = $have - $start; $to = min($part['size'] - 1, $from + BA_DL_STEP - 1);
            $bytes = ba_dl_get($part['name'], [$from, $to], BA_DL_STEP + 1024);
            if (strlen($bytes) !== $to - $from + 1) { throw new RuntimeException(i18n_t('Morceau incomplet reçu : réessaie (la reprise garde ce qui est déjà là).')); }
            $out = fopen($path, 'ab'); fwrite($out, $bytes); fclose($out);
            clearstatcache(true, $path);
            return ['received' => filesize($path), 'size' => $size, 'done' => filesize($path) >= $size];
        }
        $start += $part['size'];
    }
    return ['received' => $have, 'size' => $size, 'done' => true];
}

/** GET ba_dl_resume&id= → où en est un téléchargement interrompu */
function ba_dl_resume(string $id): array
{
    try { [$path, $meta] = ba_dl_meta($id); } catch (Throwable) { return ['exists' => false]; }
    clearstatcache(true, $path);
    return ['exists' => true, 'kind' => 'annuaires', 'received' => filesize($path), 'size' => array_sum(array_column($meta['parts'], 'size'))];
}

function ba_dl_cancel(array $data): array
{
    $path = ba_upload_path((string) ($data['id'] ?? ''));
    foreach ([$path, substr($path, 0, -5) . '.dl'] as $f) { @unlink($f); }
    return ['ok' => true];
}

/** POST ba_dl_finish {id} → vérifie (taille, empreinte), décompresse, vérifie la base (sorte, schéma) puis la range */
function ba_dl_finish(array $data): array
{
    [$path, $meta] = ba_dl_meta((string) ($data['id'] ?? ''));
    $target = ba_path();
    $tmp = $target . '.' . bin2hex(random_bytes(4)) . '.tmp';
    try {
        clearstatcache(true, $path);
        if (filesize($path) !== (int) $meta['size']) { throw new RuntimeException(i18n_t('Le fichier est incomplet (téléchargement interrompu ?) : rien n’a été installé.')); }
        @set_time_limit(0);
        if (!hash_equals((string) $meta['sha256'], (string) hash_file('sha256', $path))) { throw new RuntimeException(i18n_t('Le fichier est abîmé (empreinte différente) : rien n’a été installé.')); }
        try {
            $in = gzopen($path, 'rb'); $out = fopen($tmp, 'wb'); $n = 0;
            if (!$in || !$out) { throw new RuntimeException('ouverture'); }
            while (!gzeof($in)) { $buf = gzread($in, 1 << 20); if ($buf === false) { throw new RuntimeException('lecture'); } $n += strlen($buf); if ($n > BA_PACK_MAX) { throw new RuntimeException('trop gros'); } fwrite($out, $buf); }
            gzclose($in); fclose($out);
            $f = fopen($tmp, 'rb'); $magic = (string) fread($f, 16); fclose($f);
            if ($magic !== "SQLite format 3\0") { throw new RuntimeException('pas une base'); }
            $o = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION];
            if (defined('PDO::SQLITE_ATTR_OPEN_FLAGS')) { $o[PDO::SQLITE_ATTR_OPEN_FLAGS] = PDO::SQLITE_OPEN_READONLY; }
            $t = new PDO('sqlite:' . $tmp, null, null, $o);
            $m = $t->query('SELECT key, value FROM meta')->fetchAll(PDO::FETCH_KEY_PAIR);
            if (($m['kind'] ?? '') !== 'annuaires' || (int) ($m['format'] ?? 0) !== 1) { throw new RuntimeException('sorte'); }
            $tables = $t->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
            if (array_diff(['meta', 'books', 'streets', 'years', 'e'], $tables)) { throw new RuntimeException('schéma'); }
            $count = (int) ($m['count'] ?? 0); $t = null;
        } catch (Throwable) { @unlink($tmp); throw new RuntimeException(i18n_t('La base téléchargée ne peut pas être lue : rien n’a été installé.')); }
        $hadPrev = false;
        if (is_file($target)) { @unlink($target . '.prev'); $hadPrev = @rename($target, $target . '.prev'); }
        if (!@rename($tmp, $target)) { @unlink($tmp); if ($hadPrev) { @rename($target . '.prev', $target); } throw new RuntimeException(i18n_t('Base impossible à ranger.')); }
        @unlink($target . '.removed');
        return ['kind' => 'annuaires', 'records' => $count, 'had_prev' => $hadPrev, 'size' => (int) filesize($target)];
    } finally { @unlink($path); @unlink(substr($path, 0, -5) . '.dl'); }
}

/** POST ba_pack_undo → défait la dernière installation (remet la base d'avant, ou retire la nouvelle) */
function ba_pack_undo(array $data): array
{
    $t = ba_path();
    if (is_file($t . '.prev')) { @unlink($t); @rename($t . '.prev', $t); return ['restored' => true]; }
    @unlink($t);
    return ['removed' => true];
}

/** POST ba_pack_remove → mis de côté (« ↶ Annuler » : ba_pack_restore) */
function ba_pack_remove(array $data): array
{
    $t = ba_path();
    if (!is_file($t)) { throw new RuntimeException(i18n_t('Les annuaires ne sont pas installés.')); }
    @unlink($t . '.removed');
    if (!@rename($t, $t . '.removed')) { throw new RuntimeException(i18n_t('Base impossible à retirer.')); }
    return ['ok' => true];
}

function ba_pack_restore(array $data): array
{
    $t = ba_path();
    if (!is_file($t . '.removed')) { throw new RuntimeException(i18n_t('Rien à remettre.')); }
    if (is_file($t)) { throw new RuntimeException(i18n_t('Une autre base a été installée entre-temps.')); }
    @rename($t . '.removed', $t);
    return ['ok' => true];
}

/** GET ba_status → installé ? combien, quand, taille, années */
function ba_status(): array
{
    $x = ba_pdo();
    $row = ['installed' => (bool) $x, 'removed' => is_file(ba_path() . '.removed'), 'dir' => ba_dir()];
    if ($x) {
        $m = $x->query('SELECT key, value FROM meta')->fetchAll(PDO::FETCH_KEY_PAIR);
        $row += ['records' => (int) ($m['count'] ?? 0), 'built' => (string) ($m['built'] ?? ''), 'fixture' => !empty($m['fixture']), 'size' => (int) filesize(ba_path()),
            'from' => (int) ($m['year_from'] ?? 0), 'to' => (int) ($m['year_to'] ?? 0), 'mention' => (string) ($m['mention'] ?? ''), 'licence' => (string) ($m['licence'] ?? ''), 'url' => (string) ($m['url'] ?? BA_PAGE),
            'years' => (int) $x->query('SELECT count(*) FROM years')->fetchColumn(), 'books' => (int) $x->query('SELECT count(*) FROM books')->fetchColumn()];
    }
    return $row;
}

/* ═════════════════════════ Une entrée, prête pour l'écran ═════════════════════════ */

function ba_book(PDO $x, int $id): array
{
    static $cache = [];
    if (!isset($cache[$id])) { $s = $x->prepare('SELECT * FROM books WHERE id=?'); $s->execute([$id]); $cache[$id] = $s->fetch() ?: ['code' => '', 'label' => '', 'title' => '', 'url' => '', 'year' => null, 'coll' => '']; }
    return $cache[$id];
}
function ba_street(PDO $x, ?int $id): string
{
    static $cache = [];
    if (!$id) { return ''; }
    if (!isset($cache[$id])) { $s = $x->prepare('SELECT name FROM streets WHERE id=?'); $s->execute([$id]); $cache[$id] = (string) ($s->fetchColumn() ?: ''); }
    return $cache[$id];
}

/** l'adresse à montrer : la rue trouvée par le géocodeur quand elle ressemble à ce qui est imprimé, sinon l'imprimé */
function ba_address(array $r, string $street): string
{
    $num = trim((string) $r['num']); $ad = trim((string) $r['ad']);
    if ($street !== '' && (int) ($r['q'] ?? 0) >= 50) { return trim(($num !== '' && (int) $r['z'] === 1 ? $num . ' ' : '') . $street); }
    if ($ad === '') { return ''; }
    return $ad . ($num !== '' ? ', ' . $num : '');
}

/** la clé d'un groupe : même nom, même métier (début), même rue — reste vraie d'une version du pack à l'autre */
function ba_group_key(array $r, string $street): string
{
    $act = substr(ba_fold((string) $r['a']), 0, 8);
    $where = $street !== '' ? ba_fold($street) : ba_fold((string) $r['ad']);
    return 'a:' . substr(sha1($r['k'] . '|' . $act . '|' . $where . '|' . ba_fold((string) $r['g'])), 0, 20);
}

function ba_row_out(PDO $x, array $r): array
{
    $b = ba_book($x, (int) $r['b']);
    $street = ba_street($x, $r['s'] !== null ? (int) $r['s'] : null);
    $page = $r['p'] !== null ? (int) $r['p'] : null;
    $gallica = str_starts_with((string) $b['url'], 'https://gallica.bnf.fr/');
    $url = $gallica && $page ? $b['url'] . '/f' . $page . '.item' : (string) $b['url'];
    $name = trim((string) $r['n']) . ($r['g'] !== '' ? ' (' . $r['g'] . ')' : '');
    return ['id' => (int) $r['id'], 'key' => ba_group_key($r, $street), 'name' => $name, 'nom' => (string) $r['n'], 'given' => (string) $r['g'], 'act' => (string) $r['a'],
        'address' => ba_address($r, $street), 'printed' => trim((string) $r['ad'] . ((string) $r['num'] !== '' ? ', ' . $r['num'] : '')), 'street' => $street,
        'lat' => $r['la'] !== null ? round((int) $r['la'] / 1e5, 5) : null, 'lon' => $r['lo'] !== null ? round((int) $r['lo'] / 1e5, 5) : null,
        'approx' => $r['z'] !== null && (int) $r['z'] === 2, 'score' => $r['q'] !== null ? (int) $r['q'] : null, 'year' => (int) $r['y'],
        'book' => (string) $b['label'], 'title' => (string) $b['title'], 'code' => (string) $b['code'], 'page' => $page, 'url' => $url, 'book_url' => (string) $b['url']];
}

/* ═════════════════════════ La personne de la fiche ═════════════════════════ */

function ba_is_paris(string $place): bool { return preg_match('/(^|[^a-z])paris([^a-z]|$)/', ba_fold($place)) === 1; }

function ba_person_facts(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM persons WHERE id=?'); $s->execute([$id]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException(i18n_t('Fiche introuvable.')); }
    $s = $pdo->prepare("SELECT e.year, e.address, e.title, e.description, e.place_id, COALESCE(t.gedcom_tag,'') AS tag, COALESCE(pl.name,'') AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE e.person_id=? ORDER BY COALESCE(e.year, 9999), e.id");
    $s->execute([$id]);
    $birth = null; $death = null; $paris = []; $jobs = []; $streets = []; $parisPlace = 0;
    foreach (preg_split('/\s*[;,\/]\s*|\s+et\s+/u', (string) ($p['occupation'] ?? '')) ?: [] as $j) { if (trim($j) !== '') { $jobs[] = trim($j); } }
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $e) {
        $y = $e['year'] !== null && $e['year'] !== '' ? (int) $e['year'] : null;
        if ($birth === null && $y && in_array($e['tag'], ['BIRT', 'BAPM', 'CHR'], true)) { $birth = $y; }
        if ($death === null && $y && in_array($e['tag'], ['DEAT', 'BURI', 'CREM'], true)) { $death = $y; }
        if ($e['tag'] === 'OCCU' && trim((string) ($e['title'] ?: $e['description'])) !== '') { $jobs[] = trim((string) ($e['title'] ?: $e['description'])); }
        if (ba_is_paris((string) $e['place'])) {
            $paris[] = $y; if (!$parisPlace) { $parisPlace = (int) $e['place_id']; }
            if (trim((string) $e['address']) !== '') { $streets[] = trim((string) $e['address']); }
        }
    }
    $first = trim((string) $p['first_name']);
    $py = array_values(array_filter($paris, static fn($y) => $y !== null));
    // les années où il a pu être dans un annuaire : adulte, vivant, entre 1787 et 1914
    $lo = $birth !== null ? $birth + 16 : ($py ? min($py) - 20 : null);
    $hi = $death !== null ? $death : ($birth !== null ? $birth + 85 : ($py ? max($py) + 20 : null));
    if ($lo !== null) { $lo = max(BA_FIRST, $lo); }
    if ($hi !== null) { $hi = min(BA_LAST, $hi); }
    return ['id' => (int) $p['id'], 'last' => trim((string) $p['last_name']), 'first' => $first, 'first_keys' => ba_first_keys($first), 'gender' => (string) $p['gender'],
        'animal' => ($p['kind'] ?? '') === 'animal', 'birth' => $birth, 'death' => $death, 'paris' => (bool) $paris, 'paris_years' => $py, 'paris_place' => $parisPlace,
        'jobs' => array_values(array_unique($jobs)), 'streets' => array_values(array_unique($streets)), 'from' => $lo, 'to' => $hi, 'locked' => (int) ($p['is_locked'] ?? 0) === 1];
}

/** peut-il être dans un annuaire de Paris ? (pour proposer le pack) */
function ba_could_match(array $f): bool
{
    return !$f['animal'] && ba_key($f['last']) !== '' && $f['paris'] && $f['from'] !== null && $f['to'] !== null && $f['from'] <= $f['to'];
}

/** les mots qui comptent d'un métier : « Maître boulanger » → [boula] (5 lettres suffisent : « boulang. » imprimé) */
function ba_job_stems(array $jobs): array
{
    $out = [];
    foreach ($jobs as $j) { foreach (explode(' ', ba_fold($j)) as $w) { if (strlen($w) >= 4 && !in_array($w, ['maitre', 'ouvrier', 'ouvriere', 'marchand', 'marchande', 'garcon', 'compagnon', 'chez', 'dans', 'pour', 'avec'], true)) { $out[] = substr($w, 0, 5); } } }
    return array_values(array_unique($out));
}
function ba_street_words(string $s): array
{
    $out = [];
    foreach (explode(' ', ba_fold($s)) as $w) { if (strlen($w) >= 4 && !in_array($w, ['rue', 'boulevard', 'boul', 'avenue', 'place', 'quai', 'passage', 'impasse', 'faubourg', 'saint', 'sainte', 'paris'], true)) { $out[] = $w; } }
    return $out;
}

/** ce qui est entre parenthèses : prénom ? initiale ? une femme (Mme, Vve) ? */
function ba_given(string $g): array
{
    $female = false; $names = []; $abbr = []; $initials = [];
    foreach (preg_split('/[\s,]+/u', trim($g)) ?: [] as $w) {
        if ($w === '') { continue; }
        $dot = str_contains($w, '.');
        foreach (explode('-', $w) as $part) {
            $k = ba_key($part); if ($k === '') { continue; }
            if (in_array($k, BA_FEMALE, true)) { $female = true; continue; }
            if (in_array($k, BA_TITLES, true)) { continue; }
            if (strlen($k) === 1) { $initials[] = $k; }
            elseif ($dot || strlen($k) <= 3) { $abbr[] = $k; }
            else { $names[] = $k; }
        }
    }
    return ['female' => $female, 'names' => $names, 'abbr' => $abbr, 'initials' => $initials];
}

/** les groupes d'entrées qui lui ressemblent (une entrée par adresse et par année, regroupées par métier et rue) */
function ba_matches(array $f, int $limit = 4): array
{
    $x = ba_pdo();
    if (!$x || !ba_could_match($f)) { return ['groups' => [], 'total' => 0]; }
    $s = $x->prepare('SELECT * FROM e WHERE k=? AND y BETWEEN ? AND ? ORDER BY y LIMIT 15000');
    $s->execute([ba_key($f['last']), $f['from'], $f['to']]);
    $rows = $s->fetchAll();
    $stems = ba_job_stems($f['jobs']);
    $words = []; foreach ($f['streets'] as $st) { $words = array_merge($words, ba_street_words($st)); }
    $female = $f['gender'] === 'female'; $male = $f['gender'] === 'male';
    $groups = []; $seen = [];
    foreach ($rows as $r) {
        $o = ba_row_out($x, $r + ['k' => $r['k']]);
        $dup = $o['year'] . '|' . $o['key'] . '|' . $o['address'];
        if (isset($seen[$dup])) { continue; }
        $seen[$dup] = 1;
        $gv = ba_given((string) $r['g']);
        if ($male && $gv['female']) { continue; }
        $score = 0; $why = [i18n_t('même nom')];
        $fk = $f['first_keys'];
        if ($gv['names']) {
            if (!array_intersect($gv['names'], $fk)) { continue; }  // un autre prénom écrit en toutes lettres : quelqu'un d'autre
            $score += 4; $why[] = i18n_t('même prénom');
        } elseif ($gv['abbr']) {
            $hit = false; foreach ($gv['abbr'] as $a) { foreach ($fk as $k) { if (str_starts_with($k, $a)) { $hit = true; } } }
            if (!$hit) { continue; }
            $score += 3; $why[] = i18n_t('prénom abrégé ({g})', ['g' => (string) $r['g']]);
        } elseif ($gv['initials']) {
            if (!$fk || !in_array($fk[0][0], $gv['initials'], true)) { continue; }
            $score += 1; $why[] = i18n_t('même initiale ({g})', ['g' => (string) $r['g']]);
        }
        if ($female && !$gv['female'] && !$gv['names'] && !$gv['abbr']) { $score -= 1; }
        $act = ba_fold((string) $r['a']);
        foreach ($stems as $st) { if ($st !== '' && preg_match('/(^| )' . preg_quote($st, '/') . '/', $act)) { $score += 4; $why[] = i18n_t('même métier'); break; } }
        $addr = ba_fold($o['street'] . ' ' . $o['printed']);
        foreach ($words as $w) { if (preg_match('/(^| )' . preg_quote($w, '/') . '( |$)/', $addr)) { $score += 4; $why[] = i18n_t('même rue'); break; } }
        foreach ($f['paris_years'] as $py) { if (abs($py - $o['year']) <= 3) { $score += 1; $why[] = i18n_t('à Paris vers {y} d’après sa fiche', ['y' => (string) $py]); break; } }
        $g = &$groups[$o['key']];
        if (!$g) { $g = ['key' => $o['key'], 'best' => $o, 'rows' => [], 'years' => [], 'score' => $score, 'why' => $why]; }
        if ($score > $g['score']) { $g['score'] = $score; $g['why'] = $why; }
        $g['years'][$o['year']] = 1;
        if (count($g['rows']) < 40) { $g['rows'][] = $o; }
        unset($g);
    }
    $total = count($groups);
    // un nom rare : même sans prénom ni métier, la piste vaut d'être montrée
    $rare = $total <= 3;
    $out = [];
    foreach ($groups as $g) {
        if ($g['score'] < 3 && !($rare && $g['score'] >= 0)) { continue; }
        if ($rare && $g['score'] < 3) { $g['why'][] = i18n_t('nom rare dans les annuaires'); }
        $ys = array_keys($g['years']); sort($ys);
        $g['from'] = $ys[0]; $g['to'] = end($ys); $g['count'] = count($ys); unset($g['years']);
        $out[] = $g;
    }
    usort($out, static fn($a, $b) => [$b['score'], $b['count']] <=> [$a['score'], $a['count']]);
    return ['groups' => array_slice($out, 0, $limit), 'total' => $total, 'shown' => count($out)];
}

function ba_schema(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS ba_marks (person_id INTEGER NOT NULL, rec_key TEXT NOT NULL, verdict TEXT NOT NULL DEFAULT 'no', ids TEXT NOT NULL DEFAULT '{}', summary TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(person_id, rec_key))");
    $done = true;
}
function ba_marks(PDO $pdo, int $pid): array
{
    ba_schema($pdo);
    $s = $pdo->prepare('SELECT rec_key, verdict, ids FROM ba_marks WHERE person_id=?'); $s->execute([$pid]);
    $out = []; foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $out[$r['rec_key']] = ['verdict' => $r['verdict'], 'ids' => json_decode((string) $r['ids'], true) ?: []]; }
    return $out;
}

/** GET ba_person&id= → installé ? pourrait-il y être ? les groupes d'entrées qui lui ressemblent (avec « c'est lui » / « pas lui ») */
function ba_person(PDO $pdo, int $id): array
{
    $f = ba_person_facts($pdo, $id);
    $m = ba_matches($f);
    $marks = ba_marks($pdo, $id);
    $groups = [];
    foreach ($m['groups'] as $g) { $mk = $marks[$g['key']] ?? null; $g['verdict'] = $mk['verdict'] ?? ''; $groups[] = $g; }
    return ['person' => ['id' => $f['id'], 'last' => $f['last'], 'first' => $f['first'], 'birth' => $f['birth'], 'death' => $f['death'], 'gender' => $f['gender'], 'paris' => $f['paris'], 'from' => $f['from'], 'to' => $f['to'], 'locked' => $f['locked']],
        'installed' => (bool) ba_pdo(), 'could' => ba_could_match($f), 'groups' => $groups, 'total' => $m['total'] ?? 0, 'inventor' => ba_inventor_period($f)];
}

/** 💡 a-t-il pu déposer un brevet entre 1791 et 1901 ? (adulte pendant ces années) */
function ba_inventor_period(array $f): bool
{
    if ($f['animal'] || ba_key($f['last']) === '') { return false; }
    $b = $f['birth']; $d = $f['death'];
    if ($b === null && $d === null) { return false; }
    $lo = $b !== null ? $b + 18 : $d - 50; $hi = $d ?? $b + 85;
    return $lo <= 1901 && $hi >= 1791;
}

/* ═════════════════════════ ✓ C'est lui (source + lieu de résidence), ↶ Annuler, ✗ Pas lui ═════════════════════════ */

/** POST ba_add {person_id, id} → une source et un événement « Lieu de résidence » sur sa fiche (relus dans le pack : rien de l'écran n'est recopié) */
function ba_add(PDO $pdo, array $d): array
{
    ba_schema($pdo);
    $pid = safe_int($d['person_id'] ?? 0);
    if (!$pid || !person_exists($pdo, $pid)) { throw new RuntimeException(i18n_t('Fiche introuvable.')); }
    assert_person_unlocked($pdo, $pid);
    $x = ba_pdo();
    if (!$x) { throw new RuntimeException(i18n_t('Les annuaires ne sont pas installés.')); }
    $s = $x->prepare('SELECT * FROM e WHERE id=?'); $s->execute([safe_int($d['id'] ?? 0)]);
    $raw = $s->fetch();
    if (!$raw) { throw new RuntimeException(i18n_t('Entrée introuvable dans l’annuaire.')); }
    $r = ba_row_out($x, $raw);
    $prev = ba_marks($pdo, $pid)[$r['key']] ?? null;
    if ($prev && $prev['verdict'] === 'yes') { throw new RuntimeException(i18n_t('Cette entrée est déjà sur sa fiche.')); }
    $f = ba_person_facts($pdo, $pid);
    $who = trim($f['first'] . ' ' . mb_strtoupper($f['last']));
    $entry = trim($r['name'] . ($r['act'] !== '' ? ', ' . $r['act'] : '') . ($r['address'] !== '' ? ', ' . $r['address'] : ''));
    $lines = [i18n_t('Trouvé dans les annuaires de Paris (SoDUCo) le {date} : {name} reconnu(e) par toi (« C’est lui »).', ['date' => date('d/m/Y'), 'name' => $who])];
    $lines[] = i18n_t('{book}, {y} : « {entry} »', ['book' => $r['book'], 'y' => (string) $r['year'], 'entry' => $entry]);
    if ($r['printed'] !== '' && $r['printed'] !== $r['address']) { $lines[] = i18n_t('Adresse imprimée (lue automatiquement) : {a}', ['a' => $r['printed']]); }
    if ($r['lat'] !== null) { $lines[] = i18n_t('Position donnée par le géocodeur historique : {lat}, {lon}{approx}', ['lat' => (string) $r['lat'], 'lon' => (string) $r['lon'], 'approx' => $r['approx'] ? ' (' . i18n_t('à la rue seulement') . ')' : '']); }
    $lines[] = i18n_t('Ouvrage : {t}', ['t' => $r['title']]) . ($r['url'] !== '' ? "\n" . i18n_t('Page numérisée : {u}', ['u' => $r['url']]) : '');
    $lines[] = i18n_t('Texte lu automatiquement (OCR) : vérifie sur la page numérisée.');
    $lines[] = i18n_t('Données : {m}.', ['m' => 'SoDUCo, « Annuaires historiques parisiens, 1798-1914 », NAKALA, DOI 10.34847/nkl.98eem49t — Licence Ouverte Etalab 2.0']);
    $title = mb_substr(i18n_t('Annuaire de Paris {y} — {e}', ['y' => (string) $r['year'], 'e' => $entry]), 0, 240);
    $ids = ['sources' => [], 'source_links' => [], 'events' => []];
    $own = !$pdo->inTransaction(); // api.php ouvre déjà une transaction pour chaque écriture
    if ($own) { $pdo->beginTransaction(); }
    try {
        $pdo->prepare('INSERT INTO sources(title, author, agency, publication, url, text) VALUES(?,?,?,?,?,?)')
            ->execute([$title, '', 'BnF — Gallica (numérisation) ; SoDUCo (extraction)', BA_MARK . ' (' . $r['book'] . ')', $r['url'] !== '' ? $r['url'] : BA_PAGE, implode("\n", $lines)]);
        $sid = (int) $pdo->lastInsertId(); $ids['sources'][] = $sid;
        $link = $pdo->prepare('INSERT INTO source_links(entity_type, entity_id, source_record_id, page, quality, note) VALUES(?,?,?,?,?,?)');
        $page = $r['page'] ? i18n_t('vue {p}', ['p' => (string) $r['page']]) : '';
        $link->execute(['person', $pid, $sid, $page, '', i18n_t('Annuaire de Paris, {y}', ['y' => (string) $r['year']])]); $ids['source_links'][] = (int) $pdo->lastInsertId();
        $type = $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='RESI' AND scope='person' ORDER BY id LIMIT 1")->fetchColumn();
        if ($type) {
            $e = add_event($pdo, ['person_id' => $pid, 'event_type_id' => (int) $type, 'date_text' => (string) $r['year'], 'place_id' => $f['paris_place'] ?: '', 'place_name' => 'Paris', 'country' => 'France',
                'address' => mb_substr($r['address'] !== '' ? $r['address'] : $r['printed'], 0, 300), 'precise_lat' => $r['lat'] ?? '', 'precise_lon' => $r['lon'] ?? '',
                'description' => mb_substr(i18n_t('D’après l’{book} de {y}{act}', ['book' => $r['book'], 'y' => (string) $r['year'], 'act' => $r['act'] !== '' ? ' (' . $r['act'] . ')' : '']), 0, 500),
                'confidence_origin' => 'Annuaire de Paris — ' . $r['book'], 'research_note' => i18n_t('Texte de l’annuaire lu automatiquement : vérifie sur la page numérisée.')]);
            $eid = (int) ($e['id'] ?? 0);
            if ($eid) { $ids['events'][] = $eid; $link->execute(['event', $eid, $sid, $page, '', i18n_t('Annuaire de Paris, {y}', ['y' => (string) $r['year']])]); $ids['source_links'][] = (int) $pdo->lastInsertId(); }
        }
        $pdo->prepare("INSERT INTO ba_marks(person_id, rec_key, verdict, ids, summary) VALUES(?,?,'yes',?,?) ON CONFLICT(person_id, rec_key) DO UPDATE SET verdict='yes', ids=excluded.ids, summary=excluded.summary, created_at=CURRENT_TIMESTAMP")
            ->execute([$pid, $r['key'], json_encode($ids), $title]);
        if (function_exists('log_change')) { log_change($pdo, 'person', $pid, 'update', '📇 Annuaire de Paris : source et lieu de résidence ajoutés — ' . $title); }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    return ['key' => $r['key'], 'source_id' => $sid, 'event_ids' => $ids['events'], 'title' => $title, 'prev' => $prev['verdict'] ?? ''];
}

/** POST ba_undo {person_id, key} → retire la source, ses liens et l'événement ajoutés (s'ils sont encore là) */
function ba_undo(PDO $pdo, array $d): array
{
    ba_schema($pdo);
    $pid = safe_int($d['person_id'] ?? 0); $key = (string) ($d['key'] ?? '');
    if (!preg_match('/^a:[0-9a-f]{20}$/', $key)) { throw new LcndaBadInput('Entrée inconnue.'); }
    $mk = ba_marks($pdo, $pid)[$key] ?? null;
    if (!$mk || $mk['verdict'] !== 'yes') { throw new RuntimeException(i18n_t('Cet ajout est déjà annulé, ou introuvable.')); }
    assert_person_unlocked($pdo, $pid);
    $ids = $mk['ids'];
    $own = !$pdo->inTransaction();
    if ($own) { $pdo->beginTransaction(); }
    try {
        foreach (array_map('intval', $ids['source_links'] ?? []) as $id) { $pdo->prepare('DELETE FROM source_links WHERE id=?')->execute([$id]); }
        foreach (array_map('intval', $ids['events'] ?? []) as $id) {
            foreach (['media_links', 'source_links', 'notes'] as $t) { try { $pdo->prepare("DELETE FROM $t WHERE entity_type='event' AND entity_id=?")->execute([$id]); } catch (Throwable) {} }
            $pdo->prepare('DELETE FROM events WHERE id=? AND person_id=?')->execute([$id, $pid]);
        }
        foreach (array_map('intval', $ids['sources'] ?? []) as $id) {
            $n = $pdo->prepare('SELECT count(*) FROM source_links WHERE source_record_id=?'); $n->execute([$id]);
            if (!(int) $n->fetchColumn()) { $pdo->prepare('DELETE FROM sources WHERE id=? AND publication LIKE ?')->execute([$id, '%' . BA_MARK . '%']); }
        }
        $pdo->prepare('DELETE FROM ba_marks WHERE person_id=? AND rec_key=?')->execute([$pid, $key]);
        if (function_exists('log_change')) { log_change($pdo, 'person', $pid, 'update', '📇 Annuaire de Paris : ajout annulé'); }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    return ['ok' => true, 'person_id' => $pid];
}

/** POST ba_mark {person_id, key, verdict: 'no' | ''} → « ✗ Pas lui » ou l'enlever (↶) ; rend l'état d'avant */
function ba_mark(PDO $pdo, array $d): array
{
    ba_schema($pdo);
    $pid = safe_int($d['person_id'] ?? 0);
    if (!$pid || !person_exists($pdo, $pid)) { throw new RuntimeException(i18n_t('Fiche introuvable.')); }
    $key = (string) ($d['key'] ?? '');
    if (!preg_match('/^a:[0-9a-f]{20}$/', $key)) { throw new LcndaBadInput('Entrée inconnue.'); }
    $prev = ba_marks($pdo, $pid)[$key] ?? null;
    if ($prev && $prev['verdict'] === 'yes') { throw new RuntimeException(i18n_t('Cette entrée est déjà sur sa fiche : annule l’ajout d’abord.')); }
    $verdict = (string) ($d['verdict'] ?? '');
    if ($verdict === 'no') { $pdo->prepare("INSERT INTO ba_marks(person_id, rec_key, verdict) VALUES(?,?,'no') ON CONFLICT(person_id, rec_key) DO UPDATE SET verdict='no', created_at=CURRENT_TIMESTAMP")->execute([$pid, $key]); }
    elseif ($verdict === '') { $pdo->prepare('DELETE FROM ba_marks WHERE person_id=? AND rec_key=?')->execute([$pid, $key]); }
    else { throw new LcndaBadInput('Choix inconnu.'); }
    return ['ok' => true, 'prev' => $prev ? $prev['verdict'] : ''];
}

/* ═════════════════════════ 🧰 Listes → Données, 🗺 calque, 📜 monographie ═════════════════════════ */

const BA_LIST_FIELDS = ['name', 'act', 'address', 'street', 'year', 'book'];

/** GET ba_list&query={q, filters, near, years, sort, dir, offset, limit} → {rows, total, more} (le pack doit être installé) */
function ba_list(array $in): array
{
    $x = ba_pdo();
    if (!$x) { return ['installed' => false, 'rows' => [], 'total' => 0]; }
    $q = json_decode((string) ($in['query'] ?? '{}'), true); if (!is_array($q)) { $q = []; }
    $where = []; $args = []; $narrowed = false;
    $years = is_array($q['years'] ?? null) ? $q['years'] : [];
    $yf = is_numeric($years['from'] ?? null) ? (int) $years['from'] : null; $yt = is_numeric($years['to'] ?? null) ? (int) $years['to'] : null;
    if ($yf !== null || $yt !== null) {
        $r = $x->prepare('SELECT MIN(lo), MAX(hi) FROM years WHERE y BETWEEN ? AND ?'); $r->execute([$yf ?? 0, $yt ?? 9999]); [$lo, $hi] = $r->fetch(PDO::FETCH_NUM);
        if ($lo === null) { return ['installed' => true, 'rows' => [], 'total' => 0]; }
        $where[] = 'e.id BETWEEN ? AND ?'; $args[] = (int) $lo; $args[] = (int) $hi; $narrowed = true;
    }
    $post = []; // filtres finis en PHP (texte libre sur plusieurs colonnes)
    foreach ((array) ($q['filters'] ?? []) as $flt) {
        if (!is_array($flt)) { continue; }
        $key = (string) ($flt['key'] ?? ''); $op = (string) ($flt['op'] ?? 'contains'); $v = $flt['value'] ?? '';
        if ($key === 'name') {
            $k = ba_key((string) $v); if ($k === '') { continue; }
            if ($op === 'eq') { $where[] = 'e.k=?'; $args[] = $k; }
            else { $where[] = 'e.k>=? AND e.k<?'; $args[] = $k; $args[] = substr($k, 0, -1) . chr(ord(substr($k, -1)) + 1); }
            $narrowed = true;
        } elseif ($key === 'street') {
            $sk = ba_fold((string) $v); if ($sk === '') { continue; }
            $ids = $x->prepare('SELECT id FROM streets WHERE sk LIKE ? LIMIT 400'); $ids->execute(['%' . $sk . '%']); $list = array_map('intval', $ids->fetchAll(PDO::FETCH_COLUMN));
            if (!$list) { return ['installed' => true, 'rows' => [], 'total' => 0]; }
            $where[] = 'e.s IN (' . implode(',', $list) . ')'; $narrowed = true;
        } elseif ($key === 'act') { $where[] = 'e.a LIKE ?'; $args[] = '%' . str_replace(['%', '_'], ['\%', '\_'], (string) $v) . '%'; }
        elseif ($key === 'year' && is_numeric($v)) { $where[] = $op === 'gte' ? 'e.y>=?' : ($op === 'lte' ? 'e.y<=?' : 'e.y=?'); $args[] = (int) $v; }
        elseif ($key === 'book' && $op === 'in' && is_array($v) && $v) { $where[] = 'e.b IN (SELECT id FROM books WHERE label IN (' . implode(',', array_fill(0, count($v), '?')) . '))'; foreach ($v as $one) { $args[] = (string) $one; } }
        elseif ($key === 'book' && is_string($v) && $v !== '') { $where[] = 'e.b IN (SELECT id FROM books WHERE label LIKE ?)'; $args[] = '%' . $v . '%'; }
        elseif ($key === 'address') { $post[] = ba_fold((string) $v); }
    }
    $near = is_array($q['near'] ?? null) && is_numeric($q['near']['lat'] ?? null) && is_numeric($q['near']['lon'] ?? null) ? $q['near'] : null;
    if ($near) {
        $km = max(0.05, min(30.0, (float) ($near['km'] ?? 1))); $lat = (float) $near['lat']; $lon = (float) $near['lon'];
        $dla = $km / 111.2; $dlo = $km / (111.2 * max(0.2, cos(deg2rad($lat))));
        $where[] = 'e.la BETWEEN ? AND ? AND e.lo BETWEEN ? AND ?'; array_push($args, (int) round(($lat - $dla) * 1e5), (int) round(($lat + $dla) * 1e5), (int) round(($lon - $dlo) * 1e5), (int) round(($lon + $dlo) * 1e5));
    }
    $text = ba_fold((string) ($q['q'] ?? ''));
    if ($text !== '' && !$narrowed) { $k = ba_key((string) $q['q']); if (strlen($k) >= 2) { $where[] = '(e.k>=? AND e.k<? OR e.a LIKE ?)'; array_push($args, $k, substr($k, 0, -1) . chr(ord(substr($k, -1)) + 1), '%' . $q['q'] . '%'); } }
    elseif ($text !== '') { $post[] = $text; }
    $limit = max(1, min(5000, (int) ($q['limit'] ?? 100))); $offset = max(0, (int) ($q['offset'] ?? 0));
    $cap = 20000;
    $sql = 'SELECT e.* FROM e' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' LIMIT ' . ($cap + 1);
    $s = $x->prepare($sql); $s->execute($args);
    $rows = []; $more = false;
    foreach ($s as $r) {
        if (count($rows) >= $cap) { $more = true; break; }
        $o = ba_row_out($x, $r);
        if ($post) { $hay = ba_fold($o['name'] . ' ' . $o['act'] . ' ' . $o['address'] . ' ' . $o['printed'] . ' ' . $o['book']); foreach ($post as $p) { if ($p !== '' && !str_contains($hay, $p)) { continue 2; } } }
        if ($near && $o['lat'] !== null) { $o['_km'] = round(ba_km((float) $near['lat'], (float) $near['lon'], $o['lat'], $o['lon']), 2); if ($o['_km'] > (float) ($near['km'] ?? 1)) { continue; } }
        $rows[] = ba_list_row($o);
    }
    $sort = (string) ($q['sort'] ?? ''); $dir = (string) ($q['dir'] ?? 'asc') === 'desc' ? -1 : 1;
    if ($sort !== '' && ($sort === '_km' || in_array($sort, BA_LIST_FIELDS, true))) { usort($rows, static fn($a, $b) => $dir * (is_numeric($a[$sort] ?? null) && is_numeric($b[$sort] ?? null) ? $a[$sort] <=> $b[$sort] : strcmp(ba_fold((string) ($a[$sort] ?? '')), ba_fold((string) ($b[$sort] ?? ''))))); }
    return ['installed' => true, 'total' => count($rows), 'more' => $more, 'rows' => array_slice($rows, $offset, $limit)];
}
function ba_list_row(array $o): array
{
    return ['id' => $o['id'], 'name' => $o['name'], 'act' => $o['act'], 'address' => $o['address'], 'printed' => $o['printed'], 'street' => $o['street'], 'year' => $o['year'], 'book' => $o['book'],
        'lat' => $o['lat'], 'lon' => $o['lon'], 'approx' => $o['approx'], 'url' => $o['url'], 'source' => $o['url'], 'title' => $o['title']] + (isset($o['_km']) ? ['_km' => $o['_km']] : []);
}
function ba_km(float $a, float $b, float $c, float $d): float
{
    $r = M_PI / 180; $x = sin(($c - $a) * $r / 2) ** 2 + cos($a * $r) * cos($c * $r) * sin(($d - $b) * $r / 2) ** 2;
    return 6371 * 2 * asin(min(1.0, sqrt($x)));
}

/** GET ba_map&q=&from=&to=&bbox=lon0,lat0,lon1,lat1&max= → des points (une adresse ou un nom au fil des années) */
function ba_map(array $in): array
{
    $x = ba_pdo();
    if (!$x) { return ['installed' => false, 'features' => []]; }
    $q = trim((string) ($in['q'] ?? '')); $max = max(1, min(5000, (int) ($in['max'] ?? 1500)));
    $from = is_numeric($in['from'] ?? null) ? (int) $in['from'] : null; $to = is_numeric($in['to'] ?? null) ? (int) $in['to'] : null;
    if ($q === '') { return ['installed' => true, 'features' => [], 'need_q' => true]; }
    $where = []; $args = [];
    $sk = ba_fold($q);
    $ids = $x->prepare('SELECT id FROM streets WHERE sk LIKE ? LIMIT 200'); $ids->execute(['%' . $sk . '%']); $list = array_map('intval', $ids->fetchAll(PDO::FETCH_COLUMN));
    $k = ba_key($q);
    $where[] = '(' . ($list ? 'e.s IN (' . implode(',', $list) . ') OR ' : '') . 'e.k=?)'; $args[] = $k;
    if ($from !== null) { $where[] = 'e.y>=?'; $args[] = $from; }
    if ($to !== null) { $where[] = 'e.y<=?'; $args[] = $to; }
    $where[] = 'e.la IS NOT NULL';
    if (preg_match('/^(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)$/', (string) ($in['bbox'] ?? ''), $m)) {
        $where[] = 'e.lo BETWEEN ? AND ? AND e.la BETWEEN ? AND ?'; array_push($args, (int) round((float) $m[1] * 1e5), (int) round((float) $m[3] * 1e5), (int) round((float) $m[2] * 1e5), (int) round((float) $m[4] * 1e5));
    }
    $s = $x->prepare('SELECT e.* FROM e WHERE ' . implode(' AND ', $where) . ' ORDER BY e.y LIMIT ' . $max); $s->execute($args);
    $out = [];
    foreach ($s as $r) { $o = ba_row_out($x, $r); $out[] = ['type' => 'pt', 'lat' => $o['lat'], 'lon' => $o['lon'], 'label' => $o['year'] . ' — ' . $o['name'] . ($o['act'] !== '' ? ', ' . $o['act'] : '') . ($o['address'] !== '' ? ', ' . $o['address'] : ''), 'year' => $o['year'], 'url' => $o['url']]; }
    return ['installed' => true, 'features' => $out, 'source' => 'SoDUCo, Annuaires historiques parisiens 1798-1914 (NAKALA, Etalab 2.0)'];
}

/** GET ba_place&id= → pour Paris : les noms de ta famille (qui ont vécu à Paris) trouvés dans les annuaires, avec leurs années */
function ba_place(PDO $pdo, array $in): array
{
    $x = ba_pdo();
    $name = (string) ($in['name'] ?? '');
    $pid = safe_int($in['id'] ?? 0);
    if ($pid) { $s = $pdo->prepare('SELECT name FROM places WHERE id=?'); $s->execute([$pid]); $name = (string) ($s->fetchColumn() ?: $name); }
    if (!ba_is_paris($name)) { return ['paris' => false, 'installed' => (bool) $x, 'names' => []]; }
    if (!$x) { return ['paris' => true, 'installed' => false, 'names' => []]; }
    $s = $pdo->query("SELECT p.last_name, MIN(e.year) a, MAX(e.year) b, COUNT(DISTINCT p.id) n FROM persons p JOIN events e ON e.person_id=p.id JOIN places pl ON pl.id=e.place_id
        WHERE (lower(pl.name) LIKE 'paris%' OR lower(pl.name) LIKE '%, paris%' OR lower(pl.name) LIKE '% paris %') AND p.last_name<>'' GROUP BY lower(p.last_name) ORDER BY n DESC LIMIT 60");
    $q = $x->prepare('SELECT COUNT(*) c, MIN(y) a, MAX(y) b FROM e WHERE k=?');
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $k = ba_key((string) $r['last_name']); if (strlen($k) < 2) { continue; }
        $q->execute([$k]); $c = $q->fetch();
        if ((int) $c['c'] > 0) { $out[] = ['name' => mb_strtoupper((string) $r['last_name']), 'persons' => (int) $r['n'], 'entries' => (int) $c['c'], 'from' => (int) $c['a'], 'to' => (int) $c['b']]; }
    }
    usort($out, static fn($a, $b) => $b['persons'] <=> $a['persons'] ?: $b['entries'] <=> $a['entries']);
    return ['paris' => true, 'installed' => true, 'names' => array_slice($out, 0, 20)];
}

/* ═════════════════════════ Aiguillage (api.php) ═════════════════════════ */

function ba_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'ba_status' => ba_status(),
        'ba_person' => ba_person($pdo, safe_int($q['id'] ?? 0)),
        'ba_list' => ba_list($q),
        'ba_map' => ba_map($q),
        'ba_place' => ba_place($pdo, $q),
        // sans internet (ou rien encore en ligne) : une réponse normale qui le dit
        'ba_dl_info' => (static function () { try { return ba_dl_info(); } catch (RuntimeException $e) { return ['version' => '', 'packs' => (object) [], 'offline' => true, 'error' => $e->getMessage()]; } })(),
        'ba_dl_resume' => ba_dl_resume((string) ($q['id'] ?? '')),
        default => throw new RuntimeException('Action inconnue.'),
    };
}

/** le pack (fichiers à part, rien n'est écrit dans la généalogie) */
function ba_api_post(string $action, array $data): array
{
    return match ($action) {
        'ba_dl_start' => ba_dl_start($data),
        'ba_dl_step' => ba_dl_step($data),
        'ba_dl_cancel' => ba_dl_cancel($data),
        'ba_dl_finish' => ba_dl_finish($data),
        'ba_pack_undo' => ba_pack_undo($data),
        'ba_pack_remove' => ba_pack_remove($data),
        'ba_pack_restore' => ba_pack_restore($data),
        default => throw new RuntimeException('Action inconnue.'),
    };
}

/** les écritures dans la généalogie (dans la transaction de handle_write) */
function ba_api_write(PDO $pdo, string $action, array $data): array
{
    return match ($action) {
        'ba_add' => ba_add($pdo, $data),
        'ba_undo' => ba_undo($pdo, $data),
        'ba_mark' => ba_mark($pdo, $data),
        default => throw new RuntimeException('Action inconnue.'),
    };
}
