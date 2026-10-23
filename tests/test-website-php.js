'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🐘 Mon site web : fichiers en plus, pages PHP, PHP exécuté à part, aperçu en direct, navigateurs :   node tests/test-website-php.js
 *  1. sans serveur (Node) : electron/browsers.js (liste, adresse de l'app seulement, lancement sans shell), l'exception
 *     « aperçu en direct » du relais d'Electron (php-server.js), main.js / preload.js (pont : listBrowsers, openInBrowser) ;
 *  2. serveur « php -S » avec le secret d'Electron (GENEALOGY_APP_SECRET) sur une base neuve (un ancêtre, une vivante, une photo) :
 *     - chemins des fichiers nettoyés (.., /etc, réservés, en double, extension inconnue, fichier caché) ; pages .php gardées,
 *       leur HTML désamorcé hors du code PHP ;
 *     - export .zip : fichiers à leur place, page .php telle quelle, <link>/<script> des fichiers en plus sur les bonnes pages,
 *       liens .html → .php, nom de la vivante retiré des fichiers, images de la base (../images/ depuis css/), LISEZ-MOI (serveur PHP) ;
 *     - aperçu (website_preview) d'une page .php : exécutée, avec ses paramètres ;
 *     - website_php_run : echo, include d'un fichier en plus, $_GET, erreur affichée, fonctions interdites, lecture hors du
 *       dossier refusée (fichier, base, variables d'environnement), boucle sans fin et attente coupées, sortie bornée ;
 *       sans jeton CSRF : refusé ; app ouverte depuis une autre adresse : refusé avec un message ;
 *     - aperçu en direct : jeton, page sans le secret (seulement avec un jeton qui existe), CSP sandbox + nonce, révision,
 *       liens qui restent dans l'aperçu, expiration (2 h).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs, isLiveSiteRequest } = require('../electron/php-server');
const B = require('../electron/browsers');
const DW = require('../electron/desk-widgets');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-site-php-'));
const SECRET = 'secret-de-test-0123456789';
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', GENEALOGY_APP_SECRET: SECRET, GENEALOGY_ALLOWED_HOSTS: 'lcnda.test' };
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

(async () => {
    /* ═════ 1. Sans serveur ═════ */
    eq(B.listBrowsers('linux', { PATH: '' }).map(b => b.id), ['safari', 'chrome', 'firefox', 'edge', 'brave', 'opera', 'chromium'], 'navigateurs : les sept, dans l’ordre');
    ok(B.listBrowsers('linux', { PATH: '' }).every(b => b.installed === false && !('path' in b)), 'navigateurs : rien d’installé sans PATH, aucun chemin donné à la page');
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-nav-'));
    fs.writeFileSync(path.join(bin, 'firefox'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    fs.writeFileSync(path.join(bin, 'chromium'), 'pas exécutable', { mode: 0o644 });
    const fake = { PATH: bin };
    eq(B.listBrowsers('linux', fake).filter(b => b.installed).map(b => b.id), ['firefox'], 'Linux : un programme exécutable du PATH (pas un simple fichier)');
    eq(B.launchCommand('firefox', 'http://127.0.0.1:9/x', 'linux', fake), [path.join(bin, 'firefox'), ['http://127.0.0.1:9/x']], 'Linux : le navigateur et l’adresse, en tableau d’arguments');
    eq(B.launchCommand('safari', 'http://127.0.0.1:9/x', 'linux', fake), null, 'Linux : pas de Safari');
    const o = 'http://127.0.0.1:8123';
    ok(B.isAppUrl('http://127.0.0.1:8123/api.php?action=website_live&token=x', o) && B.isAppUrl('http://localhost:8123/', o), 'adresse de l’app : 127.0.0.1 ou localhost, même port');
    ok(!B.isAppUrl('https://evil.test/', o) && !B.isAppUrl('http://127.0.0.1:9999/', o) && !B.isAppUrl('http://127.0.0.1:8123@evil.test/', o) && !B.isAppUrl('file:///etc/passwd', o)
        && !B.isAppUrl('http://user:pw@127.0.0.1:8123/', o) && !B.isAppUrl('javascript:alert(1)', o) && !B.isAppUrl('--headless', o), 'adresse de l’app : rien d’autre');
    eq(await B.openInBrowser('firefox', 'https://evil.test/', o, () => {}), { ok: false, error: 'Adresse refusée : seulement une page de l’application.' }, 'ouvrir : adresse étrangère refusée');
    eq((await B.openInBrowser('netscape', o + '/', o, () => {})).ok, false, 'ouvrir : navigateur inconnu refusé');
    let opened = ''; eq(await B.openInBrowser('default', o + '/api.php?action=website_live', o, u => { opened = u; }), { ok: true }, 'ouvrir : navigateur par défaut');
    eq(opened, o + '/api.php?action=website_live', 'ouvrir : l’adresse passée telle quelle à openExternal');
    const live = (u, m = 'GET') => isLiveSiteRequest({ method: m, url: u });
    ok(live('/api.php?action=website_live&token=' + 'a'.repeat(32) + '&page=index') && live('/api.php?action=website_live_rev&token=' + 'b'.repeat(32)), 'relais Electron : aperçu en direct sans le secret');
    ok(!live('/api.php?action=website_live&token=zz') && !live('/api.php?action=website_preview&token=' + 'a'.repeat(32)) && !live('/api.php?action=website_live&token=' + 'a'.repeat(32), 'POST') && !live('/media/x.jpg?action=website_live&token=' + 'a'.repeat(32)), 'relais Electron : rien d’autre');
    ok(DW.isSitePreviewUrl('http://127.0.0.1:9/api.php?action=website_live&token=x', 'http://127.0.0.1:9'), 'aperçu en direct ouvert dans l’app : fenêtre isolée, sans le pont');
    const mainJs = fs.readFileSync(path.join(appRoot, 'electron/main.js'), 'utf8'), preJs = fs.readFileSync(path.join(appRoot, 'electron/preload.js'), 'utf8');
    ok(/ipcMain\.handle\('lcnda:open-in-browser', \(event, id, url\) => \{\s*\n\s*if \(!fromApp\(event\)\) return/.test(mainJs) && /browsers\.openInBrowser\(.*server\.origin/.test(mainJs), 'main.js : seulement la fenêtre de l’app, adresse vérifiée contre son origine');
    ok(/listBrowsers: \(\) => ipcRenderer\.invoke\('lcnda:browsers'\)/.test(preJs) && /openInBrowser: \(id, url\) => ipcRenderer\.invoke\('lcnda:open-in-browser'/.test(preJs), 'preload : window.lcnda.listBrowsers / openInBrowser');
    const browsersSrc = fs.readFileSync(path.join(appRoot, 'electron/browsers.js'), 'utf8');
    ok(!/shell:\s*true|exec\(|execSync/.test(browsersSrc), 'browsers.js : jamais de shell');
    ok(JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8')).build.files.includes('electron/browsers.js'), 'package.json : browsers.js livré');
    for (const f of ['electron/main.js', 'electron/preload.js', 'electron/browsers.js', 'electron/php-server.js']) ok(spawnSync(process.execPath, ['--check', path.join(appRoot, f)]).status === 0, `${f} : lisible`);
    console.log(`✓ sans serveur : ${n} vérifications`);

    /* ═════ 2. Serveur ═════ */
    {
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(first_name,last_name,gender,living_status,is_start) VALUES('Jean','ANCIEN','male','deceased',1),('Zoé','VIVANTISSIME','female','living',0)");
$im = imagecreatetruecolor(400, 300); imagefill($im, 0, 0, imagecolorallocate($im, 120, 60, 30)); imagejpeg($im, MEDIA_DIR . '/jean.jpg', 90);
$pdo->exec("INSERT INTO media(title,filename,media_type) VALUES('Jean','jean.jpg','image')");
$pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id) VALUES(1,'person',1)");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
        if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
    }
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'memory_limit=1024M', '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    const H = { 'x-carnet-secret': SECRET };
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state', { headers: H }); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
        const boot = await fetch(base + 'api.php?action=bootstrap', { headers: H });
        const cookie = (boot.headers.get('set-cookie') || '').split(';')[0];
        const csrf = (await boot.json()).csrf;
        ok(cookie && csrf, 'session et jeton');
        const post = async (action, body, token = csrf) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { ...H, cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, ...(token ? { csrf: token } : {}) }) }); let j = null; try { j = await r.json(); } catch (_) {} return { status: r.status, j }; };
        const get = async (q, headers = H) => { const r = await fetch(base + 'api.php?' + new URLSearchParams(q), { headers: { ...headers, cookie } }); return { r, status: r.status, t: await r.text() }; };

        const site = {
            settings: { title: 'Essai PHP' }, theme: {}, css: 'body{background:url(media/jean.jpg)}', js: 'console.log(1);',
            breakpoints: [{ id: 'tel', name: 'Téléphone', icon: '📱', width: 390, query: '(max-width: 600px)', extra: { a: 1 } }],
            pages: [
                { id: 'p1', name: 'Accueil', html: '<h1>Bienvenue</h1><p><a href="contact.html?n=Max">Écrire</a> <a href="contact.php#bas">bas</a></p><img src="media/jean.jpg" alt="Jean">' },
                { id: 'p2', name: 'Contact', slug: 'contact', ext: 'php', html: '<?php $n = $_GET["n"] ?? "personne"; ?>\n<h1>Contact <?= htmlspecialchars($n) ?></h1>\n<?php include "includes/entete.php"; ?>\n<script>alert(1)</script><img src="x" onerror="alert(2)"><p>Zoé VIVANTISSIME</p><form action="contact.php"><input name="n"></form>' },
            ],
            files: [
                { id: 'f1', path: 'css/carte.css', content: '.carte{background:url(media/jean.jpg)}', pages: ['index', 'inconnue'] },
                { id: 'f2', path: 'js/menu.js', content: 'console.log("Zoé VIVANTISSIME")' },
                { id: 'f3', path: 'includes/entete.php', content: '<?php echo "<header>Entête " . htmlspecialchars($_GET["n"] ?? "") . "</header>"; ?><script>x()</script>' },
                { id: 'f4', path: 'data/x.json', content: '{"a":1}' },
                { path: 'CSS/Grand.CSS', content: 'a{}' },
                { path: '../etc/passwd', content: 'x' }, { path: '/etc/x.css', content: 'x' }, { path: 'a/../b.css', content: 'x' }, { path: 'a/./b.css', content: 'x' },
                { path: 'css/style.css', content: 'x' }, { path: 'images/x.css', content: 'x' }, { path: 'contact.html', content: 'x' }, { path: 'Lisez-moi.html', content: 'x' },
                { path: '.htaccess', content: 'x' }, { path: 'x.exe', content: 'x' }, { path: 'data/x.json', content: 'doublon' }, { path: 'a b.css', content: 'x' }, { path: 'c:\\x.css', content: 'x' },
                { path: 'x'.repeat(130) + '.css', content: 'x' }, { path: 42 }, 'pas un objet',
            ],
        };
        const saved = await post('save_website', { name: 'Site PHP', data: site });
        ok(saved.status === 200 && saved.j.result.id, 'enregistrer un site avec fichiers et page .php : ' + JSON.stringify(saved.j));
        const id = saved.j.result.id;
        const back = JSON.parse((await get({ action: 'website', id })).t).data;
        eq(back.files.map(f => [f.path, f.kind]), [['css/carte.css', 'css'], ['js/menu.js', 'js'], ['includes/entete.php', 'php'], ['data/x.json', 'json'], ['css/grand.css', 'css']], 'chemins : nettoyés, les dangereux, réservés, en double ou inconnus retirés');
        eq(back.files[0].pages, ['index'], 'pages d’un fichier css : seulement celles qui existent');
        eq([back.pages[0].ext, back.pages[1].ext, back.pages[1].slug], ['html', 'php', 'contact'], 'page .php gardée');
        ok(/<\?php \$n = \$_GET\["n"\] \?\? "personne"; \?>/.test(back.pages[1].html) && /<\?= htmlspecialchars\(\$n\) \?>/.test(back.pages[1].html) && !/<script|onerror/.test(back.pages[1].html), 'page .php : code gardé, HTML autour désamorcé');
        ok(/<\?php echo "<header>/.test(back.files[2].content) && !/<script>x/.test(back.files[2].content), 'fichier .php : code gardé, HTML autour désamorcé');
        eq(back.breakpoints, site.breakpoints.map(({ extra, ...b }) => b), 'tailles d’écran gardées (valeurs simples)');
        ok(saved.j.result.removed >= 15, `ce qui a été retiré est compté (${saved.j.result.removed})`);
        const big = await post('save_website', { name: 'x', data: { pages: [{ html: '' }], files: [{ path: 'a.txt', content: 'x'.repeat(1000001) }] } });
        ok(big.status === 422 && /1 Mo/.test(big.j.error), 'fichier de plus d’1 Mo refusé');
        const many = await post('save_website', { name: 'x', data: { pages: [{ html: '' }], files: Array.from({ length: 9 }, (_, i) => ({ path: `f${i}.txt`, content: 'x'.repeat(950000) })) } });
        ok(many.status === 422 && /8 Mo/.test(many.j.error), 'plus de 8 Mo en tout refusé');

        const chk = JSON.parse((await get({ action: 'website_export_check', id })).t);
        ok(['index.html', 'contact.php', 'css/carte.css', 'js/menu.js', 'includes/entete.php', 'data/x.json', 'css/grand.css'].every(f => chk.files.includes(f)) && !chk.files.includes('contact.html'), 'résumé d’export : pages et fichiers en plus');
        eq(chk.summary.broken, 0, 'liens contact.html → la page .php : pas cassés');

        // le .zip, lu par PHP
        const zr = await fetch(base + 'api.php?action=website_export&id=' + id, { headers: { ...H, cookie } });
        eq(zr.status, 200, 'export .zip');
        const zipFile = path.join(dir, 'site.zip'); fs.writeFileSync(zipFile, Buffer.from(await zr.arrayBuffer()));
        const zj = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', '$z=new ZipArchive();$z->open($argv[1]);$o=[];for($i=0;$i<$z->numFiles;$i++){$n=$z->getNameIndex($i);$o[$n]=preg_match("/\\.(jpg|png)$/",$n)?"(image)":$z->getFromIndex($i);}echo json_encode($o);', zipFile], { encoding: 'utf8' });
        const z = JSON.parse(zj.stdout);
        ok(z['contact.php'] && /^<\?php \$n = \$_GET/.test(z['contact.php']) && /<!doctype html>/.test(z['contact.php']) && z['contact.php'].indexOf('<?php $n') < z['contact.php'].indexOf('<!doctype'), 'contact.php : le premier bloc PHP avant <!doctype>, le code tel quel (non exécuté)');
        ok(z['index.html'].indexOf('href="css/style.css"') < z['index.html'].indexOf('href="css/carte.css"') && /href="css\/grand\.css"/.test(z['index.html']), 'index.html : style.css puis les feuilles en plus');
        ok(!/carte\.css/.test(z['contact.php']) && /grand\.css/.test(z['contact.php']), 'contact.php : seulement les feuilles prévues pour elle');
        ok(z['index.html'].indexOf('src="js/script.js"') < z['index.html'].indexOf('src="js/menu.js"') && /src="js\/menu\.js"/.test(z['contact.php']), 'scripts en plus après script.js, sur toutes les pages');
        ok(/href="contact\.php\?n=Max"/.test(z['index.html']) && /href="contact\.php#bas"/.test(z['index.html']), 'liens vers la page .php : bonne extension');
        ok(/\[nom retiré\]/.test(z['js/menu.js']) && !/VIVANTISSIME/.test(JSON.stringify(z)), 'nom de la vivante retiré partout (pages, fichiers en plus)');
        ok(/url\("\.\.\/images\/m1\.jpg"\)/.test(z['css/carte.css']) && /url\("\.\.\/images\/m1\.jpg"\)/.test(z['css/style.css']) && z['images/m1.jpg'], 'images des feuilles : ../images/ depuis css/');
        eq([z['data/x.json'], z['includes/entete.php'].startsWith('<?php echo')], ['{"a":1}', true], 'fichiers en plus à leur chemin');
        ok(/serveur PHP/.test(z['LISEZ-MOI.html']) && /contact\.php/.test(z['LISEZ-MOI.html']) && /MAMP/.test(z['LISEZ-MOI.txt']), 'LISEZ-MOI : il faut un serveur PHP pour les pages .php');

        // aperçu d'une page .php (exécutée), avec ses paramètres
        const pv = await get({ action: 'website_preview', id, page: 'contact', n: 'Léa <b>' });
        ok(/sandbox allow-scripts/.test(pv.r.headers.get('content-security-policy') || ''), 'aperçu : isolé (CSP sandbox)');
        ok(/Contact Léa &lt;b&gt;/.test(pv.t) && /<header>Entête Léa &lt;b&gt;<\/header>/.test(pv.t) && !/<\?php/.test(pv.t), 'aperçu : page .php exécutée, include et $_GET');
        const pvi = await get({ action: 'website_preview', id, page: 'index' });
        ok(/href="api\.php\?action=website_preview&amp;id=\d+&amp;page=contact&amp;n=Max"/.test(pvi.t) && /data:image\/jpeg;base64/.test(pvi.t), 'aperçu : liens vers la page .php restent dans l’aperçu, images intégrées');
        const exHtml = await get({ action: 'website_export', id, page: 'contact', format: 'html' });
        ok(/Contact personne/.test(exHtml.t), 'export « page seule » d’une page .php : exécutée');

        // website_php_run
        const run = async (html, files = [], query = '', extra = {}) => (await post('website_php_run', { site: JSON.stringify({ pages: [{ name: 'Accueil', ext: 'php', html }], files, ...extra }), page: 'index', query })).j;
        let r = await run('<?php echo "Bonjour " . (2 + 3); ?>');
        ok(/Bonjour 5/.test(r.html) && Array.isArray(r.errors) && r.errors.length === 0 && typeof r.ms === 'number', 'php_run : echo');
        r = await run('<?php include "inc/a.php"; echo f(2); require_once __DIR__ . "/inc/a.php"; ?>', [{ path: 'inc/a.php', content: '<?php function f($x) { return "deux fois " . (2 * $x); }' }]);
        ok(/deux fois 4/.test(r.html), 'php_run : include d’un fichier en plus');
        r = await run('<?php echo "n=" . ($_GET["n"] ?? "") . " p=" . ($_GET["p"][0] ?? "") . " uri=" . $_SERVER["REQUEST_URI"]; ?>', [], '?n=Zo%C3%A9&p[]=x');
        ok(/n=Zoé p=x uri=\/index\.php\?n=Zo%C3%A9&amp;p%5B0%5D=x|n=Zoé p=x uri=\/index\.php\?n=Zo%C3%A9&p%5B0%5D=x/.test(r.html), 'php_run : $_GET et REQUEST_URI : ' + r.html.match(/n=.*?uri=\S*/));
        r = await run('<?php echo $inconnu; trigger_error("oups", E_USER_WARNING); echo "suite"; ?>');
        ok(/Undefined variable \$inconnu/.test(r.html) && /oups/.test(r.html) && /suite/.test(r.html) && r.errors.some(e => /Undefined variable/.test(e)) && r.errors.some(e => /oups/.test(e)), 'php_run : erreurs affichées et renvoyées');
        ok(!r.errors.some(e => e.includes(dir)) && !r.html.includes(dir), 'php_run : aucun chemin de l’ordinateur dans la réponse');
        r = await run('<?php echo "x" ?><?php fonction_bidon(');
        ok(r.errors.some(e => /syntax error/i.test(e)), 'php_run : erreur de syntaxe renvoyée');
        for (const fn of ['exec("id")', 'shell_exec("id")', 'system("id")', 'passthru("id")', 'proc_open("id", [], $p)', 'popen("id", "r")', 'putenv("A=1")', 'ini_set("open_basedir", "/")', 'set_time_limit(0)', 'mail("a@b.c", "x", "y")', 'fsockopen("127.0.0.1", 80)', 'stream_socket_client("tcp://127.0.0.1:80")', 'symlink("/etc/passwd", "x")', 'chmod("index.php", 0777)', 'dl("x.so")']) {
            r = await run('<?php echo "avant "; ' + fn + '; echo "APRÈS";');
            ok(/Call to undefined function/.test(r.errors.join(' ')) && !/APRÈS/.test(r.html), `php_run : ${fn.split('(')[0]} interdit ` + JSON.stringify(r).slice(-400));
        }
        r = await run('<?php var_dump(@file_get_contents("/etc/passwd"), @file_get_contents("../../../genealogy.sqlite"), @scandir("/"), getenv("GENEALOGY_APP_SECRET"), getenv("PATH"), @file_get_contents("https://example.com/"), ini_get("open_basedir") !== ""); try { new PDO("sqlite:../../../genealogy.sqlite"); echo "BASE OUVERTE"; } catch (Throwable $e) { echo "base refusée"; }');
        ok(/^bool\(false\)\s*bool\(false\)\s*bool\(false\)\s*bool\(false\)\s*bool\(false\)\s*bool\(false\)\s*bool\(true\)/m.test(r.html.trim()) && !/BASE OUVERTE/.test(r.html), 'php_run : rien hors du dossier (fichiers, base, réseau), environnement vide : ' + r.html.slice(0, 300));
        r = await run('<?php echo file_get_contents("../genealogy.sqlite"); ?>');
        ok(/open_basedir/.test(r.errors.join(' ')), 'php_run : open_basedir le dit');
        let t0 = Date.now(); r = await run('<?php while (true) { $a = 1; }');
        ok(Date.now() - t0 < 9000 && /Maximum execution time|arrêtée au bout de 5 s/.test(r.errors.join(' ')), `php_run : boucle sans fin coupée (${Date.now() - t0} ms)`);
        t0 = Date.now(); r = await run('<?php echo "début"; while (true) { usleep(200000); }');
        ok(Date.now() - t0 < 9000 && /arrêtée au bout de 5 s/.test(r.errors.join(' ')) && /début/.test(r.html), `php_run : une attente sans fin aussi (tuée, ${Date.now() - t0} ms)`);
        r = await run('<?php while (true) { echo str_repeat("x", 100000); }');
        ok(r.html.length <= 2000000 && /trop longue/.test(r.errors.join(' ')), 'php_run : sortie bornée à 2 Mo');
        r = await run('<h1>Titre</h1><?php echo "<p>" . date("Y") . "</p>"; ?>', [], '', { css: 'h1{color:red}', files: [{ path: 'css/a.css', content: '.a{}' }, { path: 'js/a.js', content: 'var a=1;' }] });
        ok(/<!doctype html>/.test(r.html) && /h1\{color:red\}/.test(r.html) && /\.a\{\}/.test(r.html) && /var a=1;/.test(r.html) && /<p>\d{4}<\/p>/.test(r.html), 'php_run : page complète, styles et scripts intégrés');
        r = (await post('website_php_run', { site: JSON.stringify({ pages: [{ name: 'Accueil', html: '<p>simple</p>' }] }), page: 'index' })).j;
        ok(/<p>simple<\/p>/.test(r.html) && r.php === false, 'php_run : une page .html n’est pas exécutée');
        eq((await post('website_php_run', { site: '{}', page: 'index' }, 'faux')).status, 419, 'php_run : sans jeton CSRF, refusé');
        ok(!fs.existsSync(path.join(dir, 'cache', 'site-php')) || fs.readdirSync(path.join(dir, 'cache', 'site-php')).length === 0, 'php_run : dossiers d’exécution effacés');
        // l'app ouverte depuis une autre adresse (GENEALOGY_ALLOWED_HOSTS) : pas d'exécution
        const far = await new Promise((res, rej) => {
            const body = JSON.stringify({ site: JSON.stringify({ pages: [{ ext: 'php', html: '<?php echo 1;' }] }), page: 'index', csrf });
            const q = http.request({ host: '127.0.0.1', port, path: '/api.php?action=website_php_run', method: 'POST', headers: { ...H, cookie, host: 'lcnda.test', 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (s) => { let d = ''; s.on('data', c => d += c); s.on('end', () => res({ status: s.statusCode, j: JSON.parse(d) })); });
            q.on('error', rej); q.end(body);
        });
        ok(far.status === 422 && /sur ton ordinateur/.test(far.j.error), 'php_run : refusé (avec un message) si l’app n’est pas ouverte en local : ' + JSON.stringify(far.j));

        // aperçu en direct
        const put = await post('website_live_put', { site: JSON.stringify(site), page: 'contact' });
        ok(put.status === 200 && /^[a-f0-9]{32}$/.test(put.j.token) && put.j.url.includes(`127.0.0.1:${port}/api.php?action=website_live&token=${put.j.token}&page=contact`) && put.j.rev === 1, 'live : jeton et adresse');
        const tok = put.j.token;
        const lv = await fetch(put.j.url); const lvt = await lv.text(); const lcsp = lv.headers.get('content-security-policy') || '';
        ok(lv.status === 200 && /Contact personne/.test(lvt) && /Entête/.test(lvt), 'live : la page .php rendue, sans le secret d’Electron (navigateur externe)');
        const nonce = (lcsp.match(/'nonce-([\w-]+)'/) || [])[1];
        ok(/^sandbox allow-scripts allow-forms;/.test(lcsp) && nonce && !/unsafe-inline'; connect/.test(lcsp) && new RegExp(`connect-src http://127\\.0\\.0\\.1:${port}/api\\.php`).test(lcsp), 'live : CSP sandbox, nonce, seulement api.php joignable');
        ok((lvt.match(/<script\b/g) || []).length >= 2 && (lvt.match(/<script\b/g) || []).length === (lvt.match(new RegExp(`<script nonce="${nonce}"`, 'g')) || []).length, 'live : chaque script porte le nonce');
        ok(/website_live_rev&token=/.test(lvt) && /location\.reload/.test(lvt), 'live : le petit script qui suit les révisions');
        ok(new RegExp(`<meta http-equiv="Content-Security-Policy" content="[^"]*nonce-${nonce}`).test(lvt), 'live : la CSP de la page elle-même a le même nonce');
        ok(/<form action="api\.php"[^>]*><input type="hidden" name="action" value="website_live"><input type="hidden" name="token" value="[a-f0-9]{32}"><input type="hidden" name="page" value="contact">/.test(lvt), 'live : le formulaire (GET) vers la page reste dans l’aperçu');
        const li = await (await fetch(base + `api.php?action=website_live&token=${tok}&page=index`)).text();
        ok(new RegExp(`href="api\\.php\\?action=website_live&amp;token=${tok}&amp;page=contact&amp;n=Max"`).test(li) && /data:image\/jpeg;base64/.test(li), 'live : liens entre pages restent dans l’aperçu, images de la base affichées');
        const lq = await (await fetch(base + `api.php?action=website_live&token=${tok}&page=contact&n=Hugo`)).text();
        ok(/Contact Hugo/.test(lq), 'live : paramètres de la page ($_GET)');
        const rev = await fetch(base + `api.php?action=website_live_rev&token=${tok}`);
        eq([rev.status, rev.headers.get('access-control-allow-origin'), (await rev.json()).rev], [200, '*', 1], 'live : révision lisible par la page isolée');
        const put2 = await post('website_live_put', { site: JSON.stringify({ ...site, pages: [site.pages[0], { ...site.pages[1], html: '<h1>Changé</h1>' }] }), page: 'contact', token: tok });
        eq([put2.j.token, put2.j.rev], [tok, 2], 'live : même jeton, révision suivante');
        ok(/Changé/.test(await (await fetch(put.j.url)).text()), 'live : la page suit le site envoyé');
        const bad = 'c'.repeat(32);
        eq((await fetch(base + `api.php?action=website_live&token=${bad}&page=index`)).status, 403, 'live : jeton inconnu, sans le secret → refusé par le routeur');
        eq((await fetch(base + `api.php?action=website_live&token=${bad}`, { headers: H })).status, 404, 'live : jeton inconnu (avec le secret) → expiré');
        eq((await fetch(base + `api.php?action=website_preview&id=${id}&token=${tok}`)).status, 403, 'live : le jeton n’ouvre rien d’autre');
        eq((await fetch(base + `api.php?action=website_live&token=${tok}`, { method: 'POST' })).status, 403, 'live : en lecture seulement');
        eq((await post('website_live_put', { site: JSON.stringify(site) }, 'faux')).status, 419, 'live : envoi sans jeton CSRF refusé');
        const lf = path.join(dir, 'cache', 'site-live', tok + '.json');
        ok(fs.existsSync(lf) && (fs.statSync(lf).mode & 0o077) === 0, 'live : le site gardé dans le dossier des données, lisible par soi seul');
        const old = new Date(Date.now() - 3 * 3600e3); fs.utimesSync(lf, old, old);
        eq((await fetch(base + `api.php?action=website_live_rev&token=${tok}`)).status, 404, 'live : expiré après 2 h');
    } finally {
        proc.kill();
        fs.rmSync(dir, { recursive: true, force: true });
    }
    console.log(`✓ ${n} vérifications (fichiers en plus, pages PHP, PHP isolé, aperçu en direct, navigateurs)`);
})().catch((e) => { console.error(e); process.exit(1); });
