<?php
declare(strict_types=1);

/**
 * 📤 Mon site web → « Publier en ligne » : Netlify (dépôt du .zip par leur API), GitHub Pages (un dépôt GitHub, branche
 * gh-pages) ou un hébergement FTP sécurisé (FTPS : FTP avec TLS, certificat vérifié). Interface : heritage-site-web.js.
 *
 * Sûreté :
 *  - tout passe par le serveur PHP ; le navigateur ne voit jamais les jetons ni les mots de passe (il sait seulement s'il y en a) ;
 *  - jetons et mots de passe sont gardés dans DATA_DIR/site-publish.json (droits 600), hors de la base : ils ne partent ni dans
 *    les sauvegardes de la base, ni dans les exports, ni dans le site ;
 *  - HTTPS seulement, vers api.netlify.com et api.github.com seulement ; pas de redirection suivie ; délais et tailles bornés ;
 *  - FTPS : chiffrement obligatoire (CURLUSESSL_ALL) et certificat du serveur vérifié ; le FTP en clair et le SFTP (clé du
 *    serveur impossible à vérifier simplement ici) ne sont pas proposés ;
 *  - mode consultation : refusé (écriture) ; jeton CSRF comme toute écriture.
 * Essais : LCNDA_PUBLISH_TEST_BASE=http://127.0.0.1:port remplace les deux services par un faux serveur local (tests/test-site-web.js).
 */

const PUB_ZIP_MAX = 50000000;   // octets du site envoyé
const PUB_FILES_MAX = 2000;
const PUB_ANSWER_MAX = 4000000; // octets d'une réponse lue

function pub_path(): string
{
    return DATA_DIR . '/site-publish.json';
}

function pub_read(): array
{
    $raw = is_file(pub_path()) ? json_decode((string) @file_get_contents(pub_path()), true) : null;
    return is_array($raw) ? $raw : [];
}

function pub_write(array $data): void
{
    $file = pub_path();
    if (@file_put_contents($file, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), LOCK_EX) === false) {
        throw new RuntimeException('Impossible de garder les réglages de publication (dossier des données en lecture seule ?).');
    }
    @chmod($file, 0600);
}

/** L'adresse de l'API d'un service (ou du faux serveur des essais) */
function pub_base(string $service): string
{
    $test = (string) getenv('LCNDA_PUBLISH_TEST_BASE');
    if ($test !== '' && preg_match('#^http://127\.0\.0\.1:\d{2,5}$#', $test)) { return $test . '/' . $service; }
    return ['netlify' => 'https://api.netlify.com/api/v1', 'github' => 'https://api.github.com'][$service] ?? throw new LcndaBadInput('Service inconnu.');
}

/** Une demande HTTPS bornée → ['code' => int, 'body' => string, 'json' => array|null] */
function pub_http(string $method, string $url, array $headers = [], ?string $body = null, int $timeout = 60): array
{
    $test = (string) getenv('LCNDA_PUBLISH_TEST_BASE');
    $isTest = $test !== '' && preg_match('#^http://127\.0\.0\.1:\d{2,5}$#', $test) && str_starts_with($url, $test . '/');
    if (!$isTest && !preg_match('#^https://(api\.netlify\.com|api\.github\.com)/#', $url)) { throw new LcndaBadInput('Adresse non permise.'); }
    if (!function_exists('curl_init')) { throw new RuntimeException('Publication impossible : l’extension PHP curl manque.'); }
    $ch = curl_init($url);
    $buf = '';
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => array_merge(['User-Agent: LCNDA (Mon site web)'], $headers),
        CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 12, CURLOPT_TIMEOUT => $timeout,
        CURLOPT_PROTOCOLS => $isTest ? CURLPROTO_HTTP : CURLPROTO_HTTPS, CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_WRITEFUNCTION => static function ($c, $chunk) use (&$buf) { if (strlen($buf) + strlen($chunk) > PUB_ANSWER_MAX) { return 0; } $buf .= $chunk; return strlen($chunk); },
    ]);
    if ($body !== null) { curl_setopt($ch, CURLOPT_POSTFIELDS, $body); }
    $ok = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_errno($ch);
    curl_close($ch);
    if ($ok === false && $err !== 23) { // 23 : réponse trop grosse (coupée par nous)
        throw new RuntimeException($err === 28 ? 'Le service met trop de temps à répondre : réessaie dans un moment.' : 'Pas de réseau (ou le service ne répond pas) : vérifie ta connexion à internet, puis réessaie.');
    }
    $json = json_decode($buf, true);
    return ['code' => $code, 'body' => $buf, 'json' => is_array($json) ? $json : null];
}

/** Une erreur du service, dite simplement */
function pub_fail(array $r, string $service): never
{
    $msg = is_array($r['json']) ? (string) ($r['json']['message'] ?? $r['json']['error'] ?? '') : '';
    if ($r['code'] === 401) { throw new RuntimeException('Le jeton ' . ($service === 'github' ? 'GitHub' : 'Netlify') . ' est refusé : vérifie-le (il a peut-être expiré), ou crée-en un nouveau.'); }
    if ($r['code'] === 403) { throw new RuntimeException($service === 'github' ? 'GitHub refuse : le jeton doit avoir les droits « Contents » et « Pages » (lecture et écriture) sur ce dépôt.' : 'Netlify refuse : ce jeton n’a pas le droit de publier ce site.'); }
    if ($r['code'] === 429) { throw new RuntimeException('Le service demande de patienter (trop de demandes) : réessaie dans une minute.'); }
    throw new RuntimeException('Le service a répondu par une erreur (' . $r['code'] . ')' . ($msg !== '' ? ' : ' . mb_substr(safe_text($msg), 0, 200) : '') . '.');
}

function pub_ftps_ok(): bool
{
    return function_exists('curl_version') && in_array('ftps', (array) (curl_version()['protocols'] ?? []), true);
}

/** Ce que l'écran a le droit de savoir : s'il y a un jeton (jamais le jeton), où le site a été publié */
function website_publish_state(PDO $pdo, int $id): array
{
    $c = pub_read();
    $site = is_array($c['sites'][(string) $id] ?? null) ? $c['sites'][(string) $id] : [];
    return ['netlify' => ['has_token' => !empty($c['netlify']['token'])], 'github' => ['has_token' => !empty($c['github']['token'])],
        'ftps' => ['available' => pub_ftps_ok(), 'has' => !empty($c['ftps']['host']), 'host' => (string) ($c['ftps']['host'] ?? ''), 'port' => (int) ($c['ftps']['port'] ?? 21), 'user' => (string) ($c['ftps']['user'] ?? ''), 'dir' => (string) ($c['ftps']['dir'] ?? '/'), 'has_password' => !empty($c['ftps']['pass'])],
        'site' => ['netlify_url' => (string) ($site['netlify_url'] ?? ''), 'github_repo' => (string) ($site['github_repo'] ?? ''), 'github_branch' => (string) ($site['github_branch'] ?? 'gh-pages'), 'github_url' => (string) ($site['github_url'] ?? ''),
            'ftps_url' => (string) ($site['ftps_url'] ?? ''), 'last' => (string) ($site['last'] ?? ''), 'last_at' => (string) ($site['last_at'] ?? '')]];
}

/** Garder (ou oublier) un jeton ou un accès FTPS. Rien n'est renvoyé. */
function website_publish_settings(PDO $pdo, array $d): array
{
    $c = pub_read();
    $p = (string) ($d['provider'] ?? '');
    if (!in_array($p, ['netlify', 'github', 'ftps'], true)) { throw new LcndaBadInput('Service inconnu.'); }
    if (!empty($d['forget'])) { unset($c[$p]); pub_write($c); return ['ok' => true, 'forgot' => $p]; }
    if ($p === 'ftps') {
        $host = strtolower(trim((string) ($d['host'] ?? '')));
        if (!preg_match('/^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/', $host)) { throw new LcndaBadInput('Le nom du serveur FTP n’est pas bon (exemple : ftp.mon-hebergeur.fr).'); }
        $user = mb_substr(trim((string) ($d['user'] ?? '')), 0, 120);
        if ($user === '' || preg_match('/[\x00-\x1f:@\/]/', $user)) { throw new LcndaBadInput('Donne l’identifiant FTP.'); }
        $dir = '/' . trim(preg_replace('#[^\w\-./]#u', '', (string) ($d['dir'] ?? '/')) ?? '', '/');
        if (str_contains($dir, '..')) { throw new LcndaBadInput('Dossier du site incorrect.'); }
        $pass = (string) ($d['pass'] ?? '');
        $c['ftps'] = ['host' => $host, 'port' => max(1, min(65535, safe_int($d['port'] ?? 21) ?: 21)), 'user' => $user, 'dir' => $dir === '/' ? '/' : $dir . '/', 'pass' => $pass !== '' ? mb_substr($pass, 0, 200) : (string) ($c['ftps']['pass'] ?? '')];
        if ($c['ftps']['pass'] === '') { throw new LcndaBadInput('Donne le mot de passe FTP.'); }
    } else {
        $tok = trim((string) ($d['token'] ?? ''));
        if (!preg_match('/^[A-Za-z0-9_\-.]{20,255}$/', $tok)) { throw new LcndaBadInput('Ce jeton n’a pas la bonne forme : copie-le en entier depuis ' . ($p === 'github' ? 'GitHub' : 'Netlify') . '.'); }
        $c[$p] = ['token' => $tok];
    }
    pub_write($c);
    return ['ok' => true];
}

/** Publier le site enregistré */
function website_publish(PDO $pdo, array $d): array
{
    @set_time_limit(900);
    $id = safe_int($d['id'] ?? 0);
    $p = (string) ($d['provider'] ?? '');
    if (!in_array($p, ['netlify', 'github', 'ftps'], true)) { throw new LcndaBadInput('Service inconnu.'); }
    if (!empty($d['token']) || ($p === 'ftps' && !empty($d['host']))) { website_publish_settings($pdo, $d); } // jeton collé en même temps : gardé d'abord
    $c = pub_read();
    [$row, $site] = website_load($pdo, $id);
    $b = website_build($pdo, $site, 'export');
    if (count($b['files']) > PUB_FILES_MAX) { throw new LcndaBadInput('Trop de fichiers pour une publication.'); }
    if (array_sum(array_map('strlen', $b['files'])) > PUB_ZIP_MAX) { throw new LcndaBadInput('Le site est trop lourd pour être publié d’un coup (plus de 50 Mo).'); }
    $files = $b['files']; unset($files['LISEZ-MOI.txt']);
    $mine = is_array($c['sites'][(string) $id] ?? null) ? $c['sites'][(string) $id] : [];
    $url = match ($p) { 'netlify' => pub_netlify($c, $mine, $files, $row['name']), 'github' => pub_github($c, $mine, $files, $d, $row['name']), 'ftps' => pub_ftps($c, $mine, $files) };
    $mine['last'] = $p; $mine['last_at'] = date('Y-m-d H:i:s');
    $c = array_replace(pub_read(), ['sites' => array_replace(pub_read()['sites'] ?? [], [(string) $id => $mine])]);
    pub_write($c);
    log_change($pdo, 'meta', 0, 'update', 'Site web publié (' . $p . ') : ' . $row['name']);
    return ['ok' => true, 'url' => $url, 'provider' => $p, 'files' => count($files)];
}

function pub_netlify(array $c, array &$mine, array $files, string $name): string
{
    $tok = (string) ($c['netlify']['token'] ?? '');
    if ($tok === '') { throw new LcndaBadInput('Colle d’abord ton jeton Netlify.'); }
    $h = ['Authorization: Bearer ' . $tok];
    $zipFile = tempnam(sys_get_temp_dir(), 'pub');
    $zip = new ZipArchive();
    if ($zip->open($zipFile, ZipArchive::OVERWRITE) !== true) { throw new RuntimeException('Impossible de préparer le site.'); }
    foreach ($files as $path => $bytes) { $zip->addFromString($path, $bytes); }
    $zip->close();
    $bytes = (string) file_get_contents($zipFile); @unlink($zipFile);
    for ($try = 0; $try < 2; $try++) {
        if (empty($mine['netlify_site_id'])) {
            $r = pub_http('POST', pub_base('netlify') . '/sites', array_merge($h, ['Content-Type: application/json']), json_encode(new stdClass()), 40);
            if ($r['code'] >= 300 || empty($r['json']['id'])) { pub_fail($r, 'netlify'); }
            $mine['netlify_site_id'] = (string) $r['json']['id'];
            $mine['netlify_url'] = (string) ($r['json']['ssl_url'] ?? $r['json']['url'] ?? '');
        }
        if (!preg_match('/^[A-Za-z0-9\-]{6,64}$/', $mine['netlify_site_id'])) { throw new RuntimeException('Réponse de Netlify illisible.'); }
        $r = pub_http('POST', pub_base('netlify') . '/sites/' . $mine['netlify_site_id'] . '/deploys', array_merge($h, ['Content-Type: application/zip']), $bytes, 300);
        if ($r['code'] === 404 && $try === 0) { unset($mine['netlify_site_id'], $mine['netlify_url']); continue; } // le site a été supprimé chez Netlify : on en refait un
        if ($r['code'] >= 300) { pub_fail($r, 'netlify'); }
        $u = (string) ($r['json']['ssl_url'] ?? $r['json']['url'] ?? $mine['netlify_url'] ?? '');
        if ($u !== '' && preg_match('#^https://[\w.\-]+(/.*)?$#', $u)) { $mine['netlify_url'] = $u; }
        return (string) ($mine['netlify_url'] ?? '');
    }
    throw new RuntimeException('Netlify n’a pas pu recevoir le site.');
}

function pub_github(array $c, array &$mine, array $files, array $d, string $name): string
{
    $tok = (string) ($c['github']['token'] ?? '');
    if ($tok === '') { throw new LcndaBadInput('Colle d’abord ton jeton GitHub.'); }
    $h = ['Authorization: Bearer ' . $tok, 'Accept: application/vnd.github+json', 'X-GitHub-Api-Version: 2022-11-28', 'Content-Type: application/json'];
    $api = pub_base('github');
    $j = static function (string $m, string $path, $body = null, array $ok = [200, 201]) use ($api, $h) {
        $r = pub_http($m, $api . $path, $h, $body === null ? null : json_encode($body, JSON_UNESCAPED_SLASHES), 60);
        if (!in_array($r['code'], $ok, true)) { pub_fail($r, 'github'); }
        return $r;
    };
    $me = $j('GET', '/user')['json'] ?? [];
    $login = (string) ($me['login'] ?? '');
    if (!preg_match('/^[A-Za-z0-9\-]{1,39}$/', $login)) { throw new RuntimeException('Réponse de GitHub illisible.'); }
    $repo = trim((string) ($d['repo'] ?? $mine['github_repo'] ?? ''));
    if ($repo === '') { $repo = website_slug($name); }
    if (!str_contains($repo, '/')) { $repo = $login . '/' . $repo; }
    if (!preg_match('#^[A-Za-z0-9\-]{1,39}/[A-Za-z0-9_.\-]{1,100}$#', $repo)) { throw new LcndaBadInput('Le dépôt GitHub doit s’écrire « nom » ou « compte/nom ».'); }
    $branch = (string) ($d['branch'] ?? $mine['github_branch'] ?? 'gh-pages');
    if (!preg_match('#^[A-Za-z0-9_.\-/]{1,60}$#', $branch) || str_contains($branch, '..')) { $branch = 'gh-pages'; }
    [$owner, $rname] = explode('/', $repo, 2);
    $r = pub_http('GET', $api . '/repos/' . $repo, $h, null, 30);
    if ($r['code'] === 404) {
        if (strcasecmp($owner, $login) !== 0) { throw new RuntimeException("Le dépôt {$repo} n’existe pas (ou le jeton ne le voit pas)."); }
        $j('POST', '/user/repos', ['name' => $rname, 'auto_init' => true, 'description' => 'Site fait avec LCNDA'], [201]);
    } elseif ($r['code'] !== 200) { pub_fail($r, 'github'); }
    // les fichiers → un arbre → un commit sur la branche (créée si besoin) ; .nojekyll : GitHub sert les fichiers tels quels
    $files['.nojekyll'] = '';
    $tree = [];
    foreach ($files as $path => $bytes) {
        $blob = $j('POST', "/repos/{$repo}/git/blobs", ['content' => base64_encode($bytes), 'encoding' => 'base64'], [201])['json'];
        if (!preg_match('/^[0-9a-f]{40,64}$/', (string) ($blob['sha'] ?? ''))) { throw new RuntimeException('Réponse de GitHub illisible.'); }
        $tree[] = ['path' => $path, 'mode' => '100644', 'type' => 'blob', 'sha' => $blob['sha']];
    }
    $t = $j('POST', "/repos/{$repo}/git/trees", ['tree' => $tree], [201])['json'];
    $ref = pub_http('GET', $api . "/repos/{$repo}/git/ref/heads/" . $branch, $h, null, 30);
    $parent = $ref['code'] === 200 ? (string) ($ref['json']['object']['sha'] ?? '') : '';
    $commit = $j('POST', "/repos/{$repo}/git/commits", ['message' => 'Site mis à jour avec LCNDA (' . date('d/m/Y H:i') . ')', 'tree' => (string) ($t['sha'] ?? ''), 'parents' => $parent !== '' ? [$parent] : []], [201])['json'];
    if ($parent !== '') { $j('PATCH', "/repos/{$repo}/git/refs/heads/" . $branch, ['sha' => $commit['sha'] ?? '', 'force' => true]); }
    else { $j('POST', "/repos/{$repo}/git/refs", ['ref' => 'refs/heads/' . $branch, 'sha' => $commit['sha'] ?? ''], [201]); }
    // GitHub Pages : allumé sur cette branche (déjà allumé : 409, on continue)
    $pg = pub_http('POST', $api . "/repos/{$repo}/pages", $h, json_encode(['source' => ['branch' => $branch, 'path' => '/']]), 30);
    if (!in_array($pg['code'], [201, 409, 422], true)) { pub_fail($pg, 'github'); }
    $info = pub_http('GET', $api . "/repos/{$repo}/pages", $h, null, 30);
    $url = (string) ($info['json']['html_url'] ?? '');
    if (!preg_match('#^https://[\w.\-]+(/.*)?$#', $url)) { $url = strcasecmp($rname, $owner . '.github.io') === 0 ? "https://{$rname}/" : 'https://' . strtolower($owner) . ".github.io/{$rname}/"; }
    $mine['github_repo'] = $repo; $mine['github_branch'] = $branch; $mine['github_url'] = $url;
    return $url;
}

function pub_ftps(array $c, array &$mine, array $files): string
{
    if (!pub_ftps_ok()) { throw new RuntimeException('Le FTP sécurisé n’est pas disponible avec ce PHP (curl sans FTPS).'); }
    $f = $c['ftps'] ?? null;
    if (!is_array($f) || empty($f['host']) || empty($f['pass'])) { throw new LcndaBadInput('Donne d’abord le serveur, l’identifiant et le mot de passe FTP.'); }
    foreach ($files as $path => $bytes) {
        $ch = curl_init('ftp://' . $f['host'] . ':' . (int) $f['port'] . $f['dir'] . implode('/', array_map('rawurlencode', explode('/', $path))));
        $in = fopen('php://temp', 'w+b'); fwrite($in, $bytes); rewind($in);
        curl_setopt_array($ch, [CURLOPT_UPLOAD => true, CURLOPT_INFILE => $in, CURLOPT_INFILESIZE => strlen($bytes), CURLOPT_USERPWD => $f['user'] . ':' . $f['pass'],
            CURLOPT_USE_SSL => CURLUSESSL_ALL, CURLOPT_FTPSSLAUTH => CURLFTPAUTH_TLS, CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_FTP_CREATE_MISSING_DIRS => CURLFTP_CREATE_DIR, CURLOPT_PROTOCOLS => CURLPROTO_FTP | CURLPROTO_FTPS, CURLOPT_CONNECTTIMEOUT => 15, CURLOPT_TIMEOUT => 120, CURLOPT_RETURNTRANSFER => true]);
        $ok = curl_exec($ch); $err = curl_errno($ch); $msg = curl_error($ch); curl_close($ch); fclose($in);
        if ($ok === false) {
            if (in_array($err, [6, 7, 28], true)) { throw new RuntimeException('Le serveur FTP ne répond pas : vérifie son nom et ta connexion.'); }
            if ($err === 67) { throw new RuntimeException('Le serveur FTP refuse l’identifiant ou le mot de passe.'); }
            if (in_array($err, [35, 51, 60, 64], true)) { throw new RuntimeException('Le serveur FTP n’a pas de connexion chiffrée valable (TLS) : par sûreté, rien n’est envoyé en clair.'); }
            throw new RuntimeException('Envoi FTP impossible : ' . mb_substr($msg, 0, 160));
        }
    }
    $mine['ftps_url'] = 'ftp://' . $f['host'] . $f['dir'];
    return '';
}
