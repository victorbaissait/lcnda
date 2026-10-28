<?php
declare(strict_types=1);

/**
 * 🐘 Mon site web : les pages en PHP (page.ext = 'php') exécutées pour l'aperçu, et l'aperçu en direct dans un autre navigateur.
 *
 * Exécuter le PHP de la personne (demandé : « du vrai PHP dans l'aperçu ») se fait dans un PHP À PART, jamais dans celui de l'app :
 *  - le site est écrit dans un dossier jetable (DATA_DIR/cache/site-php/run-…) ; PHP est lancé avec proc_open en tableau
 *    d'arguments (aucun shell), -n (aucun php.ini de l'ordinateur) et des réglages explicites : open_basedir = ce dossier,
 *    fonctions dangereuses désactivées (exec, proc_open, sockets, mail, putenv, ini_set…), pas d'adresse distante
 *    (allow_url_fopen/include), 5 s et 64 Mo au plus, environnement vide (ni secrets de l'app, ni chemin de la base) ;
 *  - le processus est tué au bout de 5 s (même s'il dort), sa sortie est coupée à 2 Mo, le dossier est effacé ensuite ;
 *  - seulement quand l'app tourne sur l'ordinateur de la personne (adresse 127.0.0.1 / localhost) : sinon refus expliqué.
 * La page obtenue ne s'affiche que dans un cadre isolé (iframe sandbox de l'éditeur) ou avec l'en-tête CSP « sandbox »
 * (origine opaque : elle ne peut rien lire de l'app).
 *
 * Aperçu en direct (website_live_put → jeton, website_live, website_live_rev) : le site non enregistré est gardé 2 h dans
 * DATA_DIR/cache/site-live/<jeton>.json ; la page se recharge quand l'éditeur renvoie le site (révision suivante). Dans
 * l'application de bureau, router.php laisse passer ces deux adresses sans le secret d'Electron, avec un jeton existant.
 */

const SITE_PHP_TIMEOUT = 5;          // secondes
const SITE_PHP_OUT_MAX = 2000000;    // octets de sortie
const SITE_LIVE_TTL = 7200;          // un aperçu en direct vit 2 h après le dernier envoi
const SITE_PHP_DISABLED = ['exec', 'shell_exec', 'system', 'passthru', 'proc_open', 'proc_close', 'proc_get_status', 'proc_terminate', 'proc_nice', 'popen', 'pclose',
    'pcntl_exec', 'pcntl_fork', 'pcntl_signal', 'pcntl_alarm', 'pcntl_waitpid', 'pcntl_wait', 'pcntl_signal_dispatch', 'pcntl_setpriority', 'pcntl_unshare', 'pcntl_rfork', 'pcntl_forkx',
    'curl_init', 'curl_exec', 'curl_multi_exec', 'curl_multi_init', 'fsockopen', 'pfsockopen', 'stream_socket_client', 'stream_socket_server', 'stream_socket_pair', 'socket_create', 'socket_create_listen', 'socket_create_pair', 'socket_connect',
    'mail', 'mb_send_mail', 'putenv', 'dl', 'ini_set', 'ini_alter', 'ini_restore', 'set_include_path', 'set_time_limit', 'symlink', 'link', 'chmod', 'chown', 'chgrp', 'lchown', 'lchgrp', 'chroot', 'umask',
    'posix_kill', 'posix_mkfifo', 'posix_mknod', 'posix_setuid', 'posix_setgid', 'posix_seteuid', 'posix_setegid', 'posix_setsid', 'posix_setpgid', 'apache_setenv', 'virtual', 'openlog', 'syslog',
    'ftp_connect', 'ftp_ssl_connect', 'imap_open', 'ldap_connect', 'pg_connect', 'mysqli_connect', 'dns_get_record', 'gethostbyname', 'gethostbynamel', 'getmxrr', 'checkdnsrr'];

/** null si le PHP des pages peut tourner ici ; sinon la raison (en français) */
function website_php_local(): ?string
{
    if (getenv('GENEALOGY_SITE_PHP') === '0') { return 'L’exécution du PHP des pages est coupée sur cette installation (GENEALOGY_SITE_PHP=0).'; }
    if (PHP_SAPI === 'cli') { return null; }
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    $host = function_exists('lcnda_host_name') ? lcnda_host_name((string) ($_SERVER['HTTP_HOST'] ?? '')) : '';
    $local = in_array($ip, ['127.0.0.1', '::1', '::ffff:127.0.0.1'], true) && (in_array($host, ['localhost', '127.0.0.1', '::1'], true) || str_ends_with($host, '.localhost'));
    return $local ? null : 'Le PHP des pages ne s’exécute que si LCNDA tourne sur ton ordinateur (application de bureau, ou MAMP / WAMP ouvert à l’adresse localhost). '
        . 'Ici, l’app est ouverte depuis une autre adresse : l’aperçu d’une page .php n’est pas possible, mais l’export .zip la garde telle quelle.';
}

/** Le programme PHP à lancer : GENEALOGY_PHP, celui qui fait tourner l'app (php -S), ou le « php » voisin */
function website_php_binary(): ?string
{
    foreach ([(string) getenv('GENEALOGY_PHP'), PHP_BINARY, PHP_BINDIR . DIRECTORY_SEPARATOR . (PHP_OS_FAMILY === 'Windows' ? 'php.exe' : 'php')] as $c) {
        if ($c !== '' && preg_match('/^php[0-9.]*(\.exe)?$/i', basename($c)) && is_file($c) && is_executable($c)) { return $c; }
    }
    return null;
}

/**
 * Les extensions à charger (avec -n, aucun php.ini n'est lu) : celles du PHP embarqué (runtime.json posé par
 * electron/fetch-php.js, comme electron/php-server.js : phpRuntimeArgs) ; sinon (PHP du système, MAMP…) celles de l'app qui
 * sont des modules à part et sans risque (texte, XML, images, SQLite dans le dossier) — jamais réseau, processus ni FFI.
 */
function website_php_runtime_args(string $php): array
{
    $info = @json_decode((string) @file_get_contents(dirname($php) . '/runtime.json'), true);
    $args = [];
    $exts = is_array($info) && is_array($info['extensions'] ?? null) ? $info['extensions'] : [];
    if ($exts) {
        $args[] = '-d'; $args[] = 'extension_dir=' . dirname($php) . DIRECTORY_SEPARATOR . 'ext';
        foreach ($exts as $e) { if (is_string($e) && preg_match('/^[\w.\-]+$/', $e)) { $args[] = '-d'; $args[] = 'extension=' . $e; } }
        return $args;
    }
    $dir = (string) ini_get('extension_dir');
    if ($dir === '' || !is_dir($dir) || $php !== PHP_BINARY) { return []; }
    $loaded = array_map('strtolower', get_loaded_extensions());
    foreach (['pdo', 'xml', 'ctype', 'mbstring', 'iconv', 'intl', 'tokenizer', 'calendar', 'dom', 'simplexml', 'xmlreader', 'xmlwriter', 'fileinfo', 'gd', 'exif', 'pdo_sqlite', 'sqlite3', 'zip', 'gettext'] as $e) {
        if (!in_array($e, $loaded, true)) { continue; }
        foreach ([$e . '.so', 'php_' . $e . '.dll'] as $f) {
            if (is_file($dir . DIRECTORY_SEPARATOR . $f)) { $args[] = '-d'; $args[] = 'extension=' . $dir . DIRECTORY_SEPARATOR . $f; break; }
        }
    }
    return $args;
}

/** Un dossier de cache de l'app (créé au besoin), chemin réel */
function website_php_cache(string $sub): string
{
    $dir = DATA_DIR . '/cache/' . $sub;
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) { throw new RuntimeException('Impossible de créer le dossier ' . $dir . '.'); }
    return (string) realpath($dir);
}

function website_php_rmdir(string $dir): void
{
    if (is_link($dir) || is_file($dir)) { @unlink($dir); return; }
    if (!is_dir($dir)) { return; }
    foreach (scandir($dir) ?: [] as $f) { if ($f !== '.' && $f !== '..') { website_php_rmdir($dir . DIRECTORY_SEPARATOR . $f); } }
    @rmdir($dir);
}

/** Les restes de plus de $age secondes (un lancement interrompu, un aperçu en direct expiré) */
function website_php_sweep(string $root, int $age): void
{
    foreach (scandir($root) ?: [] as $f) {
        if ($f === '.' || $f === '..') { continue; }
        $p = $root . DIRECTORY_SEPARATOR . $f;
        if (@filemtime($p) < time() - $age) { website_php_rmdir($p); }
    }
}

/** Familles de fonctions qui ouvrent le réseau (ou une base distante) : toutes bloquées, quelle que soit l'extension présente */
const SITE_PHP_NET_FUNCS = '/^(socket_|stream_socket_|curl_|mysqli_|mysql_|mysqlnd_|pg_|ftp_|imap_|ldap_|snmp|oci|odbc_|sqlsrv_|ibase_|fbird_|dba_|memcache_|msgpack_|amqp_|dns_|gethostby|getmxrr|checkdnsrr|getprotobyn|getservby|net_get_interfaces|fsockopen|pfsockopen|mail$|mb_send_mail|error_log$|ssh2_|swoole_|uv_|event_|ev_|posix_|pcntl_|proc_|shmop_|msg_|sem_|shm_|ffi_)/i';
/** Classes qui ouvrent le réseau : disable_classes ne suffit pas toujours (retiré des derniers PHP) */
const SITE_PHP_NET_CLASSES = '/^(mysqli|mysqli_\w+|PDO|Redis\w*|Memcache\w*|SoapClient|SoapServer|AMQP\w+|MongoDB\\\\.*|SNMP|SolrClient|Swoole\\\\.*|FFI|Ev\w*|Event\w*|SSH2\w*|Gearman\w+|ZMQ\w*|Socket)$/i';

/**
 * Ce que contient vraiment ce PHP (extensions intégrées comprises) : ['funcs' => fonctions réseau à bloquer,
 * 'classes' => classes réseau présentes, 'pdo' => pilotes PDO autres que SQLite]. Gardé en cache tant que le binaire ne change pas.
 */
function website_php_probe(string $php, array $rt): array
{
    static $memo = [];
    $key = md5($php . '|' . @filemtime($php) . '|' . @filesize($php) . '|' . implode(' ', $rt));
    if (isset($memo[$key])) { return $memo[$key]; }
    $file = website_php_cache('site-php-probe') . DIRECTORY_SEPARATOR . $key . '.json';
    $info = @json_decode((string) @file_get_contents($file), true);
    if (!is_array($info) || !isset($info['f'], $info['c'], $info['p'])) {
        $code = 'echo json_encode(["f"=>get_defined_functions()["internal"],"c"=>get_declared_classes(),"p"=>class_exists("PDO")?PDO::getAvailableDrivers():[]]);';
        $proc = @proc_open([$php, '-n', ...$rt, '-r', $code], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, null, ['bypass_shell' => true, 'suppress_errors' => true]);
        $out = '';
        if (is_resource($proc)) { fclose($pipes[0]); $out = (string) stream_get_contents($pipes[1], 4000000); fclose($pipes[1]); fclose($pipes[2]); proc_close($proc); }
        $info = @json_decode($out, true);
        if (!is_array($info) || !isset($info['f'], $info['c'], $info['p'])) { $info = ['f' => [], 'c' => ['mysqli', 'PDO', 'Redis'], 'p' => ['mysql']]; } // inconnu : on suppose le pire
        else { @file_put_contents($file, json_encode($info)); }
    }
    $funcs = array_values(array_filter(array_map('strval', (array) $info['f']), static fn($f) => preg_match(SITE_PHP_NET_FUNCS, $f)));
    $classes = array_values(array_filter(array_map('strval', (array) $info['c']), static fn($c) => preg_match(SITE_PHP_NET_CLASSES, $c) && !($c === 'PDO' && !array_diff((array) $info['p'], ['sqlite']))));
    return $memo[$key] = ['funcs' => $funcs, 'classes' => $classes, 'pdo' => array_values(array_diff((array) $info['p'], ['sqlite']))];
}

/** Un lanceur qui coupe le réseau du PHP des pages, s'il en existe un qui marche ici ([] sinon) */
function website_php_netless_prefix(): array
{
    static $pre = null;
    if ($pre !== null) { return $pre; }
    $ok = static function (array $cmd): bool {
        $p = @proc_open($cmd, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, null, ['bypass_shell' => true, 'suppress_errors' => true]);
        if (!is_resource($p)) { return false; }
        foreach ($pipes as $h) { fclose($h); }
        return proc_close($p) === 0;
    };
    if (PHP_OS_FAMILY === 'Linux') {
        foreach (['/usr/bin/unshare', '/bin/unshare'] as $u) { if (is_executable($u) && $ok([$u, '-r', '-n', '/bin/true'])) { return $pre = [$u, '-r', '-n']; } }
    } elseif (PHP_OS_FAMILY === 'Darwin') {
        $sb = '/usr/bin/sandbox-exec'; $prof = '(version 1)(allow default)(deny network*)';
        if (is_executable($sb) && $ok([$sb, '-p', $prof, '/usr/bin/true'])) { return $pre = [$sb, '-p', $prof]; }
    }
    return $pre = [];
}

/** Le texte PHP des pages nomme-t-il une classe réseau présente, ou crée-t-il un objet d'un nom calculé ? (null = rien) */
function website_php_risky_source(array $files, array $classes): ?string
{
    if (!$classes) { return null; }
    $names = array_map('strtolower', $classes);
    foreach ($files as $p => $c) {
        if (!str_contains((string) $c, '<?')) { continue; } // tout fichier peut être inclus par une page : on lit tout ce qui contient du PHP
        $toks = @token_get_all((string) $c);
        $prev = null;
        foreach ($toks as $t) {
            if (is_array($t) && in_array($t[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) { continue; }
            $txt = is_array($t) ? $t[1] : $t;
            $low = strtolower(ltrim($txt, '\\'));
            if (is_array($t) && in_array($t[0], [T_STRING, T_NAME_QUALIFIED, T_NAME_FULLY_QUALIFIED], true) && (in_array($low, $names, true) || preg_match('/^(reflection\w*|class_alias)$/', $low))) {
                return 'La page « ' . $p . ' » utilise « ' . $txt . ' », qui pourrait se connecter à internet : l’aperçu ne la lance pas.';
            }
            if ($prev === 'new' && !(is_array($t) && in_array($t[0], [T_STRING, T_NAME_QUALIFIED, T_NAME_FULLY_QUALIFIED, T_CLASS, T_STATIC], true))) {
                return 'La page « ' . $p . ' » crée un objet dont le nom est calculé : l’aperçu ne la lance pas.';
            }
            $prev = is_array($t) && $t[0] === T_NEW ? 'new' : null;
        }
    }
    return null;
}

/**
 * Le cœur : écrit $files (chemin relatif → texte) dans un dossier jetable, y exécute $entry avec $_GET = $query, rend
 * ['html' => sortie, 'errors' => [messages], 'ms' => durée]. Les chemins sont revérifiés (pas de « .. », pas de / au début).
 */
function website_php_exec(array $files, string $entry, array $query = []): array
{
    $t0 = hrtime(true);
    if (($why = website_php_local()) !== null) { throw new LcndaBadInput($why); }
    $php = website_php_binary();
    if ($php === null) { throw new LcndaBadInput('PHP est introuvable pour exécuter la page (indique son chemin dans la variable GENEALOGY_PHP).'); }
    if (!isset($files[$entry])) { throw new LcndaBadInput('Page introuvable.'); }
    $root = website_php_cache('site-php');
    website_php_sweep($root, 600);
    $dir = $root . DIRECTORY_SEPARATOR . 'run-' . bin2hex(random_bytes(8));
    if (!@mkdir($dir . DIRECTORY_SEPARATOR . 'site', 0700, true)) { throw new RuntimeException('Impossible de préparer le dossier d’exécution.'); }
    $site = (string) realpath($dir . DIRECTORY_SEPARATOR . 'site');
    $outFile = $dir . DIRECTORY_SEPARATOR . 'sortie.txt'; $errFile = $dir . DIRECTORY_SEPARATOR . 'erreurs.txt'; // hors du dossier du site : hors d'atteinte
    try {
        foreach ($files as $p => $c) {
            $p = (string) $p;
            if (!preg_match('#^[a-z0-9\-_./]{1,120}$#', $p) || str_starts_with($p, '/') || preg_match('#(^|/)\.#', $p)) { continue; }
            $to = $site . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $p);
            if (!is_dir(dirname($to))) { @mkdir(dirname($to), 0700, true); }
            file_put_contents($to, (string) $c);
        }
        // l'amorce : pose $_GET et $_SERVER comme une vraie requête, puis inclut la page (son nom en majuscules : aucun fichier du site ne peut l'avoir)
        $qs = http_build_query($query);
        $server = ['REQUEST_METHOD' => 'GET', 'REQUEST_URI' => '/' . $entry . ($qs !== '' ? '?' . $qs : ''), 'QUERY_STRING' => $qs, 'SCRIPT_NAME' => '/' . $entry, 'PHP_SELF' => '/' . $entry,
            'HTTP_HOST' => 'localhost', 'SERVER_NAME' => 'localhost', 'SERVER_PORT' => '80', 'SERVER_PROTOCOL' => 'HTTP/1.1', 'HTTP_ACCEPT_LANGUAGE' => 'fr', 'REMOTE_ADDR' => '127.0.0.1', 'GATEWAY_INTERFACE' => 'CGI/1.1', 'SERVER_SOFTWARE' => 'LCNDA (aperçu)'];
        file_put_contents($site . DIRECTORY_SEPARATOR . 'LCNDA-AMORCE.php', "<?php\n\$_GET = " . var_export($query, true) . ";\n\$_REQUEST = \$_GET; \$_POST = []; \$_COOKIE = []; \$_FILES = []; \$_ENV = [];\n"
            . "\$_SERVER = " . var_export($server, true) . " + ['DOCUMENT_ROOT' => __DIR__, 'SCRIPT_FILENAME' => __DIR__ . " . var_export('/' . $entry, true) . ", 'REQUEST_TIME' => time(), 'REQUEST_TIME_FLOAT' => microtime(true)];\n"
            . "unset(\$argv, \$argc);\nchdir(__DIR__);\ninclude __DIR__ . " . var_export('/' . $entry, true) . ";\n");
        $rt = website_php_runtime_args($php);
        $probe = website_php_probe($php, $rt);
        $netless = website_php_netless_prefix();
        if (!$netless && ($why = website_php_risky_source($files, $probe['classes'])) !== null) { throw new LcndaBadInput($why); }
        $args = [...$netless, $php, '-n', ...$rt,
            '-d', 'open_basedir=' . $site, '-d', 'disable_functions=' . implode(',', array_unique([...SITE_PHP_DISABLED, ...$probe['funcs']])), '-d', 'disable_classes=' . implode(',', array_unique(['FFI', 'SoapClient', 'SoapServer', ...$probe['classes']])),
            '-d', 'allow_url_fopen=0', '-d', 'allow_url_include=0', '-d', 'max_execution_time=' . SITE_PHP_TIMEOUT, '-d', 'max_input_time=' . SITE_PHP_TIMEOUT, '-d', 'memory_limit=64M',
            '-d', 'display_errors=1', '-d', 'display_startup_errors=0', '-d', 'html_errors=0', '-d', 'log_errors=1', '-d', 'error_reporting=' . E_ALL, '-d', 'short_open_tag=0',
            '-d', 'include_path=.', '-d', 'sys_temp_dir=' . $site, '-d', 'upload_tmp_dir=' . $site, '-d', 'session.save_path=' . $site, '-d', 'ffi.enable=0', '-d', 'opcache.enable_cli=0',
            '-d', 'auto_prepend_file=', '-d', 'auto_append_file=', '-d', 'output_buffering=0', '-d', 'expose_php=0', '-d', 'mail.add_x_header=0', '-d', 'default_charset=UTF-8',
            '-f', $site . DIRECTORY_SEPARATOR . 'LCNDA-AMORCE.php'];
        $env = PHP_OS_FAMILY === 'Windows' ? array_filter(['SystemRoot' => (string) getenv('SystemRoot'), 'TEMP' => $site, 'TMP' => $site]) : []; // Windows : SystemRoot, sans quoi PHP ne démarre pas toujours
        $proc = @proc_open($args, [0 => ['pipe', 'r'], 1 => ['file', $outFile, 'w'], 2 => ['file', $errFile, 'w']], $pipes, $site, $env, ['bypass_shell' => true, 'suppress_errors' => true]);
        if (!is_resource($proc)) { throw new RuntimeException('PHP n’a pas pu être lancé pour exécuter la page.'); }
        fclose($pipes[0]);
        $stop = ''; $deadline = microtime(true) + SITE_PHP_TIMEOUT;
        while (true) {
            $st = proc_get_status($proc);
            if (!$st['running']) { break; }
            clearstatcache(true, $outFile);
            if ((int) @filesize($outFile) > SITE_PHP_OUT_MAX) { $stop = 'Sortie trop longue (plus de 2 Mo) : la page a été arrêtée.'; break; }
            if (microtime(true) > $deadline) { $stop = 'La page a été arrêtée au bout de ' . SITE_PHP_TIMEOUT . ' s (boucle sans fin, ou attente trop longue ?).'; break; }
            usleep(15000);
        }
        if ($stop !== '') { @proc_terminate($proc, 9); }
        proc_close($proc);
        $html = (string) @file_get_contents($outFile, false, null, 0, SITE_PHP_OUT_MAX);
        $err = (string) @file_get_contents($errFile, false, null, 0, 65536);
    } finally {
        website_php_rmdir($dir);
    }
    // aucun chemin de cet ordinateur dans ce qu'on renvoie
    $hide = static fn(string $s) => str_replace([$site . DIRECTORY_SEPARATOR, $site, $dir], ['', '', ''], mb_scrub($s, 'UTF-8'));
    $errors = array_values(array_filter(array_map(static fn($l) => trim((string) preg_replace('/^PHP\s+/', '', $l)), explode("\n", $hide($err))), static fn($l) => $l !== '' && !str_contains($l, 'PHP Startup') && !str_contains($l, 'Module "')));
    if ($stop !== '') { $errors[] = $stop; }
    return ['html' => $hide($html), 'errors' => array_slice($errors, 0, 50), 'ms' => (int) round((hrtime(true) - $t0) / 1e6)];
}

/** Exécute une page d'un site tel quel (pages, fichiers en plus, css/style.css, js/script.js) : ['html', 'errors', 'ms'] */
function website_php_run(array $site, string $slug, array $query = []): array
{
    $files = []; $entry = null;
    foreach ($site['pages'] as $i => $p) {
        $name = website_page_file($p, $i);
        $files[$name] = (string) $p['html'];
        if ($p['slug'] === $slug || ($i === 0 && $slug === 'index')) { $entry = $name; }
    }
    foreach (is_array($site['files'] ?? null) ? $site['files'] : [] as $f) { $files[$f['path']] = (string) $f['content']; }
    $files['css/style.css'] = isset($site['theme']) ? website_full_css($site) : (string) ($site['css'] ?? '');
    if (trim((string) ($site['js'] ?? '')) !== '') { $files['js/script.js'] = (string) $site['js']; }
    if ($entry === null) { throw new LcndaBadInput('Page introuvable.'); }
    if (!str_ends_with($entry, '.php')) { return ['html' => $files[$entry], 'errors' => [], 'ms' => 0]; }
    return website_php_exec($files, $entry, $query);
}

/**
 * Une page du site, complète et toute dans un fichier (comme website_preview : styles, scripts, images en data:, rien de
 * caché), puis exécutée si c'est une page PHP. Rend ['html', 'errors', 'ms', 'php' => bool, 'idx'].
 */
function website_php_page(PDO $pdo, array $site, string $slug, array $query = []): array
{
    $slug = website_slug($slug);
    $idx = 0;
    foreach ($site['pages'] as $i => $p) { if ($p['slug'] === $slug) { $idx = $i; } }
    $b = website_build($pdo, $site, 'inline');
    $page = $site['pages'][$idx];
    $name = website_page_file($page, $idx);
    if (($page['ext'] ?? 'html') !== 'php') { return ['html' => $b['files'][$name], 'errors' => [], 'ms' => 0, 'php' => false, 'idx' => $idx]; }
    // le site prêt : chaque page complète, les fichiers en plus vérifiés (noms cachés retirés, images de la base en data:)
    $ready = $site;
    foreach ($ready['pages'] as $i => $p) { $ready['pages'][$i]['html'] = $b['files'][website_page_file($p, $i)] ?? ''; }
    foreach ($ready['files'] as $k => $f) { $ready['files'][$k]['content'] = $b['extra'][$f['path']] ?? ''; }
    $r = website_php_run($ready, $page['slug'], $query);
    return $r + ['php' => true, 'idx' => $idx];
}

/** Les paramètres d'une adresse « ?a=1&b=2 » (ou un tableau) → tableau simple pour $_GET, borné */
function website_php_query(mixed $q): array
{
    if (is_string($q)) { $s = ltrim(trim($q), '?'); $q = []; if ($s !== '' && strlen($s) <= 4000) { parse_str($s, $q); } }
    return is_array($q) ? array_slice($q, 0, 100, true) : [];
}

/**
 * Les liens et formulaires (GET) vers une page du site restent dans l'aperçu : $to(slug, paramètres) donne l'adresse.
 * $hidden(slug) : les champs cachés d'un formulaire qui pointe vers une page (null = formulaires laissés tels quels).
 */
function website_php_links(array $site, string $html, callable $to, ?callable $hidden = null): string
{
    $slugs = [];
    foreach ($site['pages'] as $i => $p) { $slugs[$i === 0 ? 'index' : $p['slug']] = true; }
    $html = (string) preg_replace_callback('#(\shref\s*=\s*)(["\'])([a-z0-9\-]+)\.(?:html|php)(\?[^"\'\#]*)?(\#[^"\']*)?\2#i', static function ($m) use ($slugs, $to) {
        $s = strtolower($m[3]); if (!isset($slugs[$s])) { return $m[0]; }
        $q = []; if (($m[4] ?? '') !== '') { parse_str(html_entity_decode(substr($m[4], 1), ENT_QUOTES | ENT_HTML5, 'UTF-8'), $q); }
        return $m[1] . '"' . htmlspecialchars($to($s, $q), ENT_QUOTES) . htmlspecialchars($m[5] ?? '', ENT_QUOTES) . '"';
    }, $html);
    if ($hidden === null) { return $html; }
    return (string) preg_replace_callback('#<form\b[^>]*>#i', static function ($m) use ($slugs, $hidden) {
        if (preg_match('#\smethod\s*=\s*["\']?post#i', $m[0]) || !preg_match('#\saction\s*=\s*(["\'])([a-z0-9\-]+)\.(?:html|php)\1#i', $m[0], $a) || !isset($slugs[strtolower($a[2])])) { return $m[0]; }
        $tag = (string) preg_replace('#\saction\s*=\s*(["\'])[^"\']*\1#i', ' action="api.php"', $m[0]);
        $in = '';
        foreach ($hidden(strtolower($a[2])) as $k => $v) { $in .= '<input type="hidden" name="' . htmlspecialchars((string) $k, ENT_QUOTES) . '" value="' . htmlspecialchars((string) $v, ENT_QUOTES) . '">'; }
        return $tag . $in;
    }, $html);
}

/* ═════════ Aperçu en direct (un autre navigateur) ═════════ */

function website_live_file(string $token): ?string
{
    return preg_match('/^[a-f0-9]{32}$/', $token) ? website_php_cache('site-live') . DIRECTORY_SEPARATOR . $token . '.json' : null;
}

/** Le site gardé pour ce jeton (null : inconnu ou expiré) */
function website_live_read(string $token): ?array
{
    $f = website_live_file($token);
    if ($f === null || !is_file($f) || filemtime($f) < time() - SITE_LIVE_TTL) { return null; }
    $d = json_decode((string) file_get_contents($f), true);
    return is_array($d) && is_array($d['site'] ?? null) ? $d : null;
}

/** POST website_live_put {site, page, token?} : garde le site non enregistré ; même jeton = révision suivante (la page se recharge) */
function website_live_put(array $d): array
{
    if (($why = website_php_local()) !== null) { throw new LcndaBadInput($why); }
    $raw = is_string($d['site'] ?? null) ? json_decode($d['site'], true) : ($d['site'] ?? null);
    [$site] = website_check($raw);
    $root = website_php_cache('site-live');
    website_php_sweep($root, SITE_LIVE_TTL);
    $token = is_string($d['token'] ?? null) && website_live_read($d['token']) !== null ? $d['token'] : bin2hex(random_bytes(16));
    $old = website_live_read($token);
    $rev = (int) ($old['rev'] ?? 0) + 1;
    $page = website_slug((string) ($d['page'] ?? 'index'));
    $tmp = $root . DIRECTORY_SEPARATOR . $token . '.' . bin2hex(random_bytes(4)) . '.part';
    file_put_contents($tmp, json_encode(['site' => $site, 'page' => $page, 'rev' => $rev, 'at' => time()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    @chmod($tmp, 0600);
    if (!@rename($tmp, (string) website_live_file($token))) { @unlink($tmp); throw new RuntimeException('Impossible de garder l’aperçu en direct.'); }
    $host = (string) ($_SERVER['HTTP_HOST'] ?? '127.0.0.1');
    $dirUrl = rtrim(str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/api.php'))), '/');
    $url = 'http://' . $host . $dirUrl . '/api.php?action=website_live&token=' . $token . '&page=' . rawurlencode($page);
    return ['token' => $token, 'url' => $url, 'rev' => $rev, 'expires' => time() + SITE_LIVE_TTL];
}

/** GET website_live&token=…&page=… (+ les paramètres de la page) : la page rendue, isolée, qui se recharge à chaque révision */
function website_live_page(PDO $pdo, array $q): never
{
    $token = (string) ($q['token'] ?? '');
    $d = website_live_read($token);
    if ($d === null) {
        http_response_code(404); header('Content-Type: text/plain; charset=utf-8'); header('Cache-Control: no-store');
        echo 'Cet aperçu en direct a expiré (2 h) ou n’existe pas : rouvre-le depuis Mon site web.'; exit;
    }
    [$site] = website_check($d['site']);
    $query = array_diff_key($q, ['action' => 1, 'token' => 1, 'page' => 1]);
    try { $r = website_php_page($pdo, $site, (string) ($q['page'] ?? $d['page'] ?? 'index'), website_php_query($query)); }
    catch (LcndaBadInput $e) { $r = ['html' => '<!doctype html><meta charset="utf-8"><p style="font:16px system-ui;padding:20px">' . htmlspecialchars($e->getMessage()) . '</p>', 'errors' => [], 'php' => true]; }
    $html = $r['html'];
    $live = static fn(string $slug, array $p = []) => 'api.php?' . http_build_query(['action' => 'website_live', 'token' => $token, 'page' => $slug] + $p);
    $html = website_php_links($site, $html, $live, static fn(string $slug) => ['action' => 'website_live', 'token' => $token, 'page' => $slug]);
    // la politique : celle de l'aperçu, avec un nonce pour les scripts (le nôtre, ceux de la page) et seulement api.php joignable
    $nonce = rtrim(strtr(base64_encode(random_bytes(18)), '+/', '-_'), '=');
    $origin = 'http://' . (string) ($_SERVER['HTTP_HOST'] ?? '127.0.0.1');
    $api = $origin . rtrim(str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/api.php'))), '/') . '/api.php';
    $csp = str_replace(["script-src 'unsafe-inline'", "connect-src 'none'", "form-action 'none'"], ["script-src 'nonce-{$nonce}'", 'connect-src ' . $api, 'form-action ' . $api], website_csp('preview'));
    $html = (string) preg_replace('#<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]*">#i', '<meta http-equiv="Content-Security-Policy" content="' . htmlspecialchars($csp, ENT_COMPAT) . '">', $html, 1);
    $html = (string) preg_replace('#<script\b(?![^>]*\snonce=)#i', '<script nonce="' . $nonce . '"', $html);
    $poll = '<script nonce="' . $nonce . '">(function(){var u=' . json_encode('api.php?action=website_live_rev&token=' . $token) . ',r=' . (int) $d['rev'] . ';'
        . 'function t(){fetch(u,{cache:"no-store",credentials:"omit"}).then(function(x){return x.ok?x.json():null}).then(function(j){if(!j)return;if(j.rev!==r){location.reload();return}setTimeout(t,1000)}).catch(function(){setTimeout(t,3000)})}setTimeout(t,1000)})();</script>';
    if ($r['errors'] ?? []) { $poll .= "\n<!-- Erreurs PHP :\n" . str_replace('--', '- -', implode("\n", $r['errors'])) . "\n-->"; }
    $html = stripos($html, '</body>') !== false ? (string) preg_replace('#</body>#i', $poll . "\n</body>", $html, 1) : $html . $poll;
    header('Content-Security-Policy: sandbox allow-scripts allow-forms; ' . $csp);
    header('Content-Type: text/html; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store, private');
    header('Referrer-Policy: no-referrer');
    echo $html;
    exit;
}

/** GET website_live_rev&token=… : {rev} ; lisible par la page isolée (origine opaque : Access-Control-Allow-Origin: *) */
function website_live_rev(string $token): never
{
    $d = website_live_read($token);
    header('Access-Control-Allow-Origin: *');
    if ($d === null) { json_response(['error' => 'Aperçu expiré.'], 404); }
    json_response(['rev' => (int) $d['rev']]);
}

/** POST website_php_run / website_live_put ; GET website_live / website_live_rev (api.php) */
function website_php_dispatch(PDO $pdo, string $action, bool $isWrite, array $q): never
{
    try {
        if ($action === 'website_live_rev' && !$isWrite) { website_live_rev((string) ($q['token'] ?? '')); }
        if ($action === 'website_live' && !$isWrite) { @ini_set('memory_limit', '1024M'); website_live_page($pdo, $q); }
        if ($action === 'website_live_put' && $isWrite) { json_response(['ok' => true] + website_live_put($q)); }
        if ($action === 'website_php_run' && $isWrite) {
            @ini_set('memory_limit', '1024M');
            if (($why = website_php_local()) !== null) { throw new LcndaBadInput($why); }
            $raw = is_string($q['site'] ?? null) ? json_decode($q['site'], true) : ($q['site'] ?? null);
            [$site] = website_check($raw);
            $r = website_php_page($pdo, $site, (string) ($q['page'] ?? 'index'), website_php_query($q['query'] ?? []));
            json_response(['ok' => true, 'html' => $r['html'], 'errors' => $r['errors'], 'ms' => $r['ms'], 'php' => $r['php']]);
        }
        json_response(['error' => 'Demande inconnue.'], 405);
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], 422);
    }
}
