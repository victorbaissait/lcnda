'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🌐 Mon site web et 🪟 widgets sur le bureau :   node tests/test-site-web.js
 *  1. sans serveur (Node) : l'éditeur de code (Emmet HTML et CSS, complétion, coloration qui échappe tout) ; les widgets de
 *     bureau côté Electron (electron/desk-widgets.js : options nettoyées, adresses permises, place ramenée sur l'écran,
 *     fenêtre isolée SANS preload ni Node) ; main.js et preload.js lisibles, le pont n'expose que des sortes connues,
 *     desk-widgets.js est bien dans l'application construite (package.json) ;
 *  2. API (base neuve : ancêtres morts, une petite-fille vivante, une fiche confidentielle, une photo de la vivante) :
 *     enregistrer, relire, liste, renommer, dupliquer, supprimer (rend le site) puis remettre, versions ; HTML forgé
 *     désamorcé (script, onerror, javascript:, iframe, base, meta refresh, SVG animate) et compté ; CSS et JS gardés à part ;
 *     sans jeton CSRF : refusé ; blocs de la généalogie (arbre, fiche, frise, carte, chiffres, photos, lieu) sans vivant ni
 *     confidentiel ; export .zip (pages, css, js, images réduites, CSP, nom de la vivante remplacé, sa photo refusée) ;
 *     page seule ; aperçu « ↗ » isolé (en-tête CSP sandbox) ; mode consultation : export refusé ; widgets (page de bureau
 *     avec nonce et CSP, fichier autonome sans la vivante) ;
 *  3. navigateur (Playwright ; sinon sauté) : liste vide → « ＋ Nouveau site » → modèle « Page vide » ; clic dans l'aperçu
 *     → « Ceci est : … » ; rôle « En-tête » ; T Écrire → le code suit ; code → l'aperçu suit (Emmet + Tab) ; clic dans le
 *     code → l'élément choisi ; bloc glissé dans l'aperçu ; bloc de la généalogie rempli ; ↶ ↷ ; téléphone ; ▶ Tester
 *     (le script de la personne tourne dans l'aperçu isolé, sans toucher l'app) ; enregistrer ; export (.zip) ; 390 px et
 *     sombre ; 🪟 sur le tableau de bord (navigateur : fichier .html) ; aucune erreur dans la console.
 *  Captures (si SITE_SHOTS=dossier).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const C = require('../assets/js/heritage-site-web-code.js');
const DW = require('../electron/desk-widgets.js');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-site-'));
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const SHOTS = process.env.SITE_SHOTS || '';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
/** attend qu'une valeur lue dans l'aperçu (ou ailleurs) soit la bonne, 4 s au plus */
const until = async (read, want) => { let v; for (let i = 0; i < 40; i++) { v = await read().catch(() => undefined); if (v === want) return v; await new Promise(r => setTimeout(r, 100)); } return v; };
const hasPy = spawnSync('python3', ['-c', 'import zipfile'], { encoding: 'utf8' }).status === 0;

(async () => {
    /* ═════ 1. Sans serveur ═════ */
    eq(C.expandAbbr('ul>li.item*3').text, '<ul>\n  <li class="item"></li>\n  <li class="item"></li>\n  <li class="item"></li>\n</ul>', 'Emmet : ul>li.item*3');
    eq(C.expandAbbr('div#haut.carte{Bonjour}').text, '<div id="haut" class="carte">Bonjour</div>', 'Emmet : id, classe, texte');
    eq(C.expandAbbr('nav>a[href=#]*2{Lien $}').text, '<nav>\n  <a href="#">Lien 1</a>\n  <a href="#">Lien 2</a>\n</nav>', 'Emmet : attributs, numéros $');
    ok(C.expandAbbr('(header>h1)+main+footer').text.includes('<main></main>\n<footer></footer>'), 'Emmet : groupes et frères');
    eq(C.expandAbbr('.a>.b').text, '<div class="a">\n  <div class="b"></div>\n</div>', 'Emmet : balise sous-entendue (div)');
    eq([C.expandAbbr('bonjour'), C.expandAbbr('2x'), C.expandAbbr('ul>')], [null, null, null], 'Emmet : un simple mot ou une abréviation cassée ne se déplie pas');
    eq(C.expandAbbr('<script>alert(1)</script>'), null, 'Emmet : pas de balise injectée');
    eq(C.expandAbbr('p{<img onerror=x>}').text, '<p>&lt;img onerror=x&gt;</p>', 'Emmet : le texte est échappé');
    eq(['m10', 'w100p', 'p10-20', 'c#333', 'df', 'fz1.5e', 'z10'].map(a => C.expandCss(a).text), ['margin: 10px;', 'width: 100%;', 'padding: 10px 20px;', 'color: #333;', 'display: flex;', 'font-size: 1.5em;', 'z-index: 10;'], 'Emmet CSS');
    eq(C.completions('<di', 3, 'html').items[0].insert, 'div', 'complétion : balise');
    ok(C.completions('<a hr', 5, 'html').items.some(i => i.insert === 'href=""'), 'complétion : attribut');
    ok(C.completions('a{ marg', 7, 'css').items.some(i => i.label === 'margin-top'), 'complétion : propriété CSS');
    eq(C.completions('a{ display: fl', 14, 'css').items.map(i => i.label), ['flex'], 'complétion : valeur CSS');
    ok(C.completions('docu', 4, 'js').items.some(i => i.label === 'document'), 'complétion : JS');
    const hl = C.highlight('<div onclick="x()"><script>alert(1)</script></div>', 'html') + C.highlight('a{color:red}</style><script>', 'css') + C.highlight('"<img src=x onerror=alert(1)>"', 'js');
    ok(!/<(script|img|div)\b/i.test(hl.replace(/<\/?span[^>]*>/g, '')), 'coloration : tout est échappé');
    eq(C.abbrBefore('  <p class="x">ul>li*2'), 'ul>li*2', 'Emmet : l’abréviation après une balise');
    // les styles du panneau écrits dans le CSS du site (une règle par sélecteur, sans doublon ; @media réutilisé)
    let css = '.carte { color: red; }\n@media (max-width: 640px) {\n  .bandeau { padding: 4px; }\n}\n';
    css = C.cssSetDecl(css, { sel: '.carte', prop: 'padding', value: '8px' }); css = C.cssSetDecl(css, { sel: '.carte', prop: 'color', value: 'blue' });
    eq((css.match(/\.carte \{/g) || []).length, 1, 'CSS : la règle .carte mise à jour, pas de doublon');
    eq([...C.cssGetDecls(css, { sel: '.carte' })], [['color', 'blue'], ['padding', '8px']], 'CSS : l’ordre des propriétés gardé');
    css = C.cssSetDecl(css, { sel: '.carte:hover', prop: 'color', value: '#f00' }); css = C.cssSetDecl(css, { sel: '.carte', media: '(max-width:640px)', prop: 'padding', value: '2px' });
    eq((css.match(/@media/g) || []).length, 1, 'CSS : @media déjà là, réutilisé');
    eq(C.cssGetDecls(css, { sel: '.carte', media: '(max-width: 640px)' }).get('padding'), '2px', 'CSS : la règle d’écran lue');
    eq(C.cssGetDecls(css, { sel: '.carte:hover' }).get('color'), '#f00', 'CSS : la règle :hover');
    ok(!/\.carte:hover/.test(C.cssSetDecl(css, { sel: '.carte:hover', prop: 'color', value: '' })), 'CSS : une règle vidée est retirée');
    eq(C.cssSetDecl(css, { sel: '.carte', prop: 'color', value: 'red; } body { x: y' }), css, 'CSS : une valeur qui casserait la feuille est refusée');
    ok(!/<span class="swc-tag">undefined/.test(C.highlight('a </ b <// c </>', 'html')) && C.highlight('a </ b', 'html').includes('&lt;/ b'), 'coloration : « </ » tapé à moitié ne casse rien');

    eq(DW.cleanOptions('countdown', { onTop: 'yes', label: 'Cousinade\u0000 <b>', date: '2027-07-14', extra: 1 }), { onTop: false, label: 'Cousinade  <b>', date: '2027-07-14' }, 'widget : options nettoyées (onTop seulement si true)');
    eq(DW.cleanOptions('countdown', { date: '2027-02-30' }).date, '', 'widget : date impossible refusée');
    eq(DW.cleanOptions('today', { label: 'x', date: '2027-07-14', onTop: true }), { onTop: true, label: '', date: '' }, 'widget : label/date seulement pour le compte à rebours');
    ok(DW.isWidgetUrl('http://127.0.0.1:9/api.php?action=desk_widget_page&kind=today', 'http://127.0.0.1:9'), 'widget : sa page');
    ok(!DW.isWidgetUrl('http://127.0.0.1:9/api.php?action=export_sqlite', 'http://127.0.0.1:9') && !DW.isWidgetUrl('http://evil.test/api.php?action=desk_widget_page&kind=today', 'http://127.0.0.1:9') && !DW.isWidgetUrl('http://127.0.0.1:9/api.php?action=desk_widget_page&kind=zzz', 'http://127.0.0.1:9'), 'widget : rien d’autre');
    ok(DW.isSitePreviewUrl('http://127.0.0.1:9/api.php?action=website_preview&id=1', 'http://127.0.0.1:9') && !DW.isSitePreviewUrl('http://127.0.0.1:9@evil.test/api.php?action=website_preview', 'http://127.0.0.1:9'), 'aperçu du site : reconnu, et pas une fausse adresse');
    const wo = DW.windowOptions('today', { onTop: true }, { x: 1, y: 2, width: 300, height: 200 });
    eq([wo.frame, wo.alwaysOnTop, wo.webPreferences.contextIsolation, wo.webPreferences.nodeIntegration, wo.webPreferences.sandbox, 'preload' in wo.webPreferences], [false, true, true, false, true, false], 'widget : fenêtre sans cadre, isolée, sans Node ni preload');
    const displays = [{ workArea: { x: 0, y: 0, width: 1440, height: 900 } }];
    eq(DW.fitBounds({ x: 100, y: 120, width: 320, height: 300 }, displays, DW.KINDS.today), { x: 100, y: 120, width: 320, height: 300 }, 'widget : place retenue');
    eq(DW.fitBounds({ x: 5000, y: 3000, width: 320, height: 300 }, displays, DW.KINDS.today), { x: 1440 - 320 - 24, y: 24, width: 320, height: 300 }, 'widget : écran débranché → ramené sur l’écran');
    ok(/^Exec="\/opt\/LCNDA app\/lcnda" --widgets$/m.test(DW.linuxAutostartEntry({ exec: '/opt/LCNDA app/lcnda', args: ['--widgets'] })), 'widget : démarrage Linux (.desktop, chemin avec espace)');
    ok(DW.KINDS.calc && DW.cleanOptions('calc', { label: 'x', date: '2027-01-01', onTop: true }).label === '' && DW.isWidgetUrl('http://127.0.0.1:9/api.php?action=desk_widget_page&kind=calc', 'http://127.0.0.1:9'), 'widget calculette : sorte connue d’Electron');
    for (const f of ['electron/main.js', 'electron/preload.js', 'electron/desk-widgets.js']) ok(spawnSync(process.execPath, ['--check', path.join(appRoot, f)]).status === 0, `${f} : lisible`);
    const mainJs = fs.readFileSync(path.join(appRoot, 'electron/main.js'), 'utf8'), preJs = fs.readFileSync(path.join(appRoot, 'electron/preload.js'), 'utf8');
    ok(/new BrowserWindow\(desk\.windowOptions\(kind, o, bounds\)\)/.test(mainJs) && /if \(!fromApp\(event\)\) return \{ ok: false, error: 'Refusé' \};\s*\n\s*cmd = String/.test(mainJs), 'main.js : la fenêtre du widget vient de desk.windowOptions ; seules les demandes de l’app sont écoutées');
    ok(/desk\.isSitePreviewUrl\(url, origin\)[\s\S]{0,400}preload: undefined/.test(mainJs), 'main.js : l’aperçu du site s’ouvre sans le pont de l’app');
    ok(/createWindow\(\)[\s\S]*contextIsolation: true, nodeIntegration: false, sandbox: true/.test(mainJs), 'main.js : la fenêtre principale reste isolée');
    ok(/desktopWidgets: \{[\s\S]*?\n  \},/.test(preJs) && !/require\('(fs|child_process|path)'\)/.test(preJs), 'preload : pont minimal, sans module Node');
    ok(JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8')).build.files.includes('electron/desk-widgets.js'), 'package.json : desk-widgets.js livré avec l’application');
    console.log(`✓ sans serveur : ${n} vérifications`);

    /* ═════ 2. Serveur et API ═════ */
    {
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,is_start) VALUES('Jean','Martin','male',1),('Pierre','Martin','male',0),('Marie','Dupuy','female',0),('Lucie','Martin','female',0),('Paul','Secret','male',0)"); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("UPDATE persons SET living_status='living' WHERE id=4"); $pdo->exec("UPDATE persons SET is_private=1 WHERE id=5");
$tag = static fn($t) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$t' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO places(name,county,latitude,longitude) VALUES('Tulle','Corrèze',45.267,1.771),('Brive','Corrèze',45.158,1.533)");
$ev = $pdo->prepare("INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?,?)");
foreach ([[1,'BIRT','3 mars 1850',1850,1],[1,'DEAT','12 mai 1920',1920,2],[2,'BIRT','1820',1820,1],[2,'DEAT','1880',1880,1],[3,'BIRT','1825',1825,2],[3,'DEAT','1890',1890,2],[4,'BIRT','8 juin 1990',1990,2],[5,'BIRT','1860',1860,1],[5,'DEAT','1930',1930,1]] as [$pid,$t,$d,$y,$pl]) { $ev->execute(['person',$pid,null,$tag($t),$d,$y,$pl]); }
$pdo->exec("INSERT INTO families(partner1_id,partner2_id) VALUES(2,3)"); $f = (int) $pdo->lastInsertId(); $pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES($f,1)");
$pdo->exec("INSERT INTO families(partner1_id,partner2_id) VALUES(1,NULL)"); $f2 = (int) $pdo->lastInsertId(); $pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES($f2,4)");
foreach (['jean.jpg' => [120, 60, 30], 'lucie.jpg' => [30, 90, 160]] as $fn => $c) { $im = imagecreatetruecolor(2400, 1600); imagefill($im, 0, 0, imagecolorallocate($im, ...$c)); imagejpeg($im, MEDIA_DIR . '/' . $fn, 90); }
$pdo->exec("INSERT INTO media(title,filename,media_type,date_text) VALUES('Jean au marché','jean.jpg','image','1900'),('Lucie enfant','lucie.jpg','image','1995')");
$pdo->exec("UPDATE persons SET portrait_media_id=1 WHERE id=1");
$pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id) VALUES(1,'person',1),(2,'person',4),(2,'person',1)");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
        if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
    }
    /* le faux Netlify et le faux GitHub (réponses simulées) : le serveur PHP les appelle à la place des vrais */
    const http = require('node:http');
    const mock = { calls: [], down: false, repo: false, token: 'nfp_essai_0123456789abcdefghij', ghToken: 'github_pat_essai_0123456789abcdef' };
    const mockSrv = http.createServer((req, res) => {
        let body = []; req.on('data', c => body.push(c)); req.on('end', () => {
            body = Buffer.concat(body); const u = req.url, auth = req.headers.authorization || '';
            mock.calls.push({ m: req.method, u, auth, type: req.headers['content-type'] || '', size: body.length, head: body.subarray(0, 2).toString('latin1') });
            if (mock.down) { req.socket.destroy(); return; }
            const send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
            if (u.startsWith('/netlify/')) {
                if (auth !== `Bearer ${mock.token}`) return send(401, { message: 'Access Denied' });
                if (req.method === 'POST' && u === '/netlify/sites') return send(201, { id: 'abc123-site-id', ssl_url: 'https://essai-lcnda.netlify.app' });
                if (req.method === 'POST' && u === '/netlify/sites/abc123-site-id/deploys') return send(body.subarray(0, 2).toString('latin1') === 'PK' ? 200 : 422, { id: 'd1', state: 'uploaded', ssl_url: 'https://essai-lcnda.netlify.app' });
                return send(404, { message: 'Not found' });
            }
            if (u.startsWith('/github/')) {
                if (auth !== `Bearer ${mock.ghToken}`) return send(401, { message: 'Bad credentials' });
                const g = u.slice(7), sha = c => c.repeat(40);
                if (g === '/user') return send(200, { login: 'victor' });
                if (g === '/repos/victor/notre-site' && req.method === 'GET') return mock.repo ? send(200, { name: 'notre-site' }) : send(404, { message: 'Not Found' });
                if (g === '/user/repos') { mock.repo = true; return send(201, { name: 'notre-site' }); }
                if (g.endsWith('/git/blobs')) return send(201, { sha: sha('b') });
                if (g.endsWith('/git/trees')) return send(201, { sha: sha('t') });
                if (g.includes('/git/ref/heads/')) return send(404, { message: 'Not Found' });
                if (g.endsWith('/git/commits')) return send(201, { sha: sha('c') });
                if (g.endsWith('/git/refs')) return send(201, { ref: 'refs/heads/gh-pages' });
                if (g.endsWith('/pages') && req.method === 'POST') return send(201, {});
                if (g.endsWith('/pages')) return send(200, { html_url: 'https://victor.github.io/notre-site/' });
                return send(404, { message: 'Not Found' });
            }
            send(404, {});
        });
    });
    const mockPort = await freePort(); await new Promise(r => mockSrv.listen(mockPort, '127.0.0.1', r));
    env.LCNDA_PUBLISH_TEST_BASE = `http://127.0.0.1:${mockPort}`;
    const port = Number(process.env.SITE_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'post_max_size=64M', '-d', 'memory_limit=1024M', '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let pw = null; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    let browser = null;
    try {
        // GET sans navigateur
        const get = async (q, raw = false) => { const res = await fetch(base + 'api.php?' + new URLSearchParams(q)); return raw ? res : res.json(); };
        const render = await get({ action: 'website_render', blocks: JSON.stringify([{ kind: 'tree', person: 1, gens: 3 }, { kind: 'person', person: 1 }, { kind: 'person', person: 4 }, { kind: 'person', person: 5 }, { kind: 'timeline', person: 1 }, { kind: 'map', person: 1, scope: 'ancestors' }, { kind: 'chart' }, { kind: 'chart', chart: 'prenoms' }, { kind: 'photos', person: 1 }, { kind: 'place', place: 2 }, { kind: 'tree', person: 4 }, { kind: 'bidon' }]) });
        const [tree, fiche, ficheLiv, fichePriv, frise, map, chart, prenoms, photos, place, treeLiv, bidon] = render.html;
        ok(/Pierre MARTIN/.test(tree) && /Marie DUPUY/.test(tree) && /lc-tree-col/.test(tree), 'bloc arbre : les ancêtres');
        ok(/Jean MARTIN/.test(fiche) && /3 mars 1850, Tulle/.test(fiche) && /Fils de Pierre MARTIN et de Marie DUPUY/.test(fiche) && /media\/jean\.jpg/.test(fiche), 'bloc fiche : dates, lieu, parents, portrait');
        ok(/n’est pas publiée/.test(ficheLiv) && !/Lucie/.test(ficheLiv) && /n’est pas publiée/.test(fichePriv) && !/Secret/.test(fichePriv) && /n’est pas publiée/.test(treeLiv), 'blocs : ni vivante ni fiche confidentielle');
        ok(/1850/.test(frise) && /lc-frise/.test(frise), 'bloc frise');
        ok(/<svg class="lc-map-svg"/.test(map) && /Tulle/.test(map), 'bloc carte (lieux de la personne et de ses ancêtres)');
        ok(/Naissances par décennie \(3\)/.test(chart) && !/1990/.test(chart), 'bloc chiffres : sans la vivante ni la confidentielle (3 naissances)');
        ok(/Jean/.test(prenoms) && !/Lucie|Paul/.test(prenoms), 'bloc prénoms : sans la vivante ni la confidentielle');
        ok(/jean\.jpg/.test(photos) && !/lucie\.jpg/.test(photos), 'bloc photos : la photo où est la vivante ne part pas');
        ok(/Jean MARTIN/.test(place) && /Marie DUPUY/.test(place) && !/Lucie/.test(place), 'bloc gens d’un lieu : sans la vivante');
        eq(bidon, '', 'bloc inconnu : rien');
        ok(/\.lc-tree\{/.test(render.css), 'les styles des blocs');
        const pg = await get({ action: 'desk_widget_page', kind: 'today' }, true); const pgCsp = pg.headers.get('content-security-policy') || ''; const pgHtml = await pg.text();
        ok(/script-src 'nonce-[\w-]+'/.test(pgCsp) && /connect-src 'none'/.test(pgCsp) && /<script nonce="[\w-]+">/.test(pgHtml) && !/<script>/.test(pgHtml), 'widget de bureau : CSP avec nonce, aucun script sans nonce');
        ok(/Lucie MARTIN/.test(pgHtml) && !/Paul SECRET/.test(pgHtml), 'widget de bureau (ton ordinateur) : comme le tableau de bord, sans fiche confidentielle');
        const wf = await (await get({ action: 'desk_widget_file', kind: 'today' }, true)).text();
        ok(!/Lucie|Secret/.test(wf) && /Jean MARTIN/.test(wf) && /default-src 'none'/.test(wf), 'widget en fichier autonome : sans vivante ni confidentielle, CSP');
        const wp = await (await get({ action: 'desk_widget_file', kind: 'photo' }, true)).text();
        ok((wp.match(/data:image\/jpeg;base64/g) || []).length === 1, 'widget photo en fichier : seulement la photo sans la vivante, intégrée');
        const cd = await (await get({ action: 'desk_widget_page', kind: 'countdown', label: 'Cousinade </script><script>alert(1)</script>', date: '2027-07-14' }, true)).text();
        ok(/Cousinade/.test(cd) && !/<\/script><script>alert/.test(cd) && /2027-07-14/.test(cd), 'widget compte à rebours : texte échappé');
        eq((await get({ action: 'desk_widget_page', kind: 'zzz' }, true)).status, 422, 'widget inconnu refusé');

        if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); return; }
        browser = await pw.chromium.launch();
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
        await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-edittools-tab', 'website'); localStorage.removeItem('genealogie-site-web'); } catch (_) {} });
        const page = await ctx.newPage(); const errors = [];
        page.on('pageerror', e => errors.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console ' + m.text()); });
        page.on('dialog', dl => { errors.push('alert ' + dl.message()); dl.dismiss(); });
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.setModule && window.LCNDA_EXT?.siteWeb && window.LCNDA_EXT?.siteCode && window.LCNDA_APP.state.csrf, null, { timeout: 30000 });
        const api = (action, body, getIt = false) => page.evaluate(async ({ action, body, getIt }) => { try { const r = getIt ? await window.LCNDA_APP.api(action, body || {}) : await window.LCNDA_APP.api(action, {}, { method: 'POST', body }); return { ok: true, r }; } catch (e) { return { ok: false, e: e.message }; } }, { action, body, getIt });

        /* 2. API */
        const site = await page.evaluate(() => window.LCNDA_EXT.siteWeb.blankSite());
        site.pages[0].html += '\n<section class="section"><div class="conteneur"><h2>Notre famille</h2><p>Jean Martin et sa petite-fille Lucie Martin.</p><img src="media/jean.jpg" alt="Jean"><img src="media/lucie.jpg" alt="Lucie"><div data-lc-block="person" data-person="1"></div><div data-lc-block="tree" data-person="1" data-gens="3"></div></div></section>';
        site.pages.push({ id: 'p2', name: 'Contact', slug: 'nous ecrire', html: '<header class="site-entete"><nav data-lc-block="menu"></nav></header><p>Écrivez-nous.</p>', title: '', desc: '' });
        site.css += '\n.carte-famille { color: var(--lc-principale); } body { background-image: url(media/jean.jpg); }';
        site.js = 'document.body.dataset.ok = "1";';
        const saved = await api('save_website', { name: 'Site essai', data: site }); ok(saved.ok, 'enregistrer ' + (saved.e || '')); const id = saved.r.result.id;
        eq(saved.r.result.removed, 0, 'rien de retiré d’un site sain');
        const back = await api('website', { id }, true); eq([back.r.name, back.r.data.pages.length, back.r.data.pages[1].slug, back.r.data.js], ['Site essai', 2, 'nous-ecrire', site.js], 'relire (adresse de page nettoyée, JS gardé à part)');
        const list = await api('websites', {}, true); eq([list.r.items[0].info.pages, list.r.items[0].info.blocks, list.r.items[0].info.js], [2, 4, true], 'résumé pour la liste');
        ok((await api('rename_website', { id, name: 'Notre site' })).ok && (await api('website', { id }, true)).r.name === 'Notre site', 'renommer');
        const dup = await api('duplicate_website', { id }); ok(dup.ok && dup.r.result.id !== id, 'dupliquer');
        const v = await api('save_website_version', { site_id: id, label: 'Première', data: site }); ok(v.ok, 'version');
        eq((await api('website_versions', { site_id: id }, true)).r.items.map(x => x.label), ['Première'], 'liste des versions');
        const del = await api('delete_website', { id: dup.r.result.id }); ok(del.ok && del.r.result.site.name, 'supprimer rend le site (pour ↶)');
        const rest = await api('restore_website', { site: del.r.result.site }); ok(rest.ok && rest.r.result.id, '↶ le remet'); await api('delete_website', { id: rest.r.result.id });
        const forged = JSON.parse(JSON.stringify(site));
        forged.pages[0].html = '<p>a<script>alert(1)</script><scr<script>x</script>ipt>alert(2)</script><img src="x" onerror="alert(3)"><a href="javascript:alert(4)">l</a><a href=" jav&#x09;ascript:alert(5)">m</a><iframe src="https://evil.test"></iframe><base href="https://evil.test/"><meta http-equiv="refresh" content="0;url=https://evil.test"><svg><animate attributeName="href" values="javascript:alert(6)"/><a xlink:href="javascript:alert(7)">s</a></svg><object data="x.swf"></object><div style="background:url(javascript:alert(8));width:expression(alert(9))">x</div><form action="javascript:alert(10)"><button formaction="javascript:alert(11)">b</button></form><img srcset="javascript:alert(12)"></p>';
        forged.css = 'a{color:red}</style><script>alert(13)</script>@import url("https://evil.test/x.css");@import url("https://fonts.googleapis.com/css2?family=Lora");b{behavior:url(x.htc);width:expression(alert(14))}';
        forged.js = 'console.log("</script><script>alert(15)")';
        const fs1 = await api('save_website', { name: 'Piège', data: forged }); ok(fs1.ok, 'site forgé enregistré (nettoyé)');
        const fh = (await api('website', { id: fs1.r.result.id }, true)).r.data;
        ok(!/<script|onerror|javascript:|<iframe|<base|<meta|<object|<animate|xlink:href|expression\(|formaction|srcset/i.test(fh.pages[0].html), 'HTML forgé désamorcé côté serveur : ' + fh.pages[0].html);
        ok(fs1.r.result.removed >= 10, `ce qui a été retiré est compté (${fs1.r.result.removed})`);
        ok(!/<\/style|<script|evil\.test|behavior|expression/i.test(fh.css) && /fonts\.googleapis\.com/.test(fh.css), 'CSS forgée nettoyée (Google Fonts gardé)');
        ok(!/<\/script/i.test(fh.js), 'JS : ne peut pas sortir de sa balise');
        await api('delete_website', { id: fs1.r.result.id });
        ok(!(await api('save_website', { name: 'x', data: { pages: 'rien' } })).ok, 'données forgées refusées');
        ok(!(await api('save_website', { name: 'x', data: { pages: [] } })).ok, 'site sans page refusé');
        const noCsrf = await page.evaluate(async () => (await fetch('api.php?action=save_website', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x', data: { pages: [{ html: '' }] } }) })).status);
        ok(noCsrf >= 400, 'sans jeton CSRF : refusé');
        const chk = await api('website_export_check', { id }, true);
        eq([chk.r.summary.pages, chk.r.summary.images, chk.r.summary.refused, chk.r.summary.names >= 1], [2, 1, 1, true], 'résumé d’export : 1 image, 1 refusée (la vivante), nom retiré');
        // le .zip
        const zipRes = await fetch(`${base}api.php?action=website_export&id=${id}&format=zip`); ok(/zip/.test(zipRes.headers.get('content-type')), 'export : un .zip');
        const zipFile = path.join(dir, 'site.zip'); fs.writeFileSync(zipFile, Buffer.from(await zipRes.arrayBuffer()));
        if (hasPy) {
            const z = JSON.parse(spawnSync('python3', ['-I', '-c', 'import zipfile,sys,json\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nprint(json.dumps({n:z.read(n).decode("utf-8","replace") if n.endswith((".html",".css",".js",".txt")) else len(z.read(n)) for n in z.namelist()}))', zipFile], { encoding: 'utf8' }).stdout);
            eq(Object.keys(z).sort(), ['LISEZ-MOI.html', 'LISEZ-MOI.txt', 'css/style.css', 'images/m1.jpg', 'index.html', 'js/script.js', 'nous-ecrire.html'], 'le .zip : pages, css, js, images');
            const ix = z['index.html'];
            ok(/<meta http-equiv="Content-Security-Policy" content="default-src 'self';[^"]*script-src 'self'/.test(ix) && /<script src="js\/script\.js" defer><\/script>/.test(ix), 'index.html : CSP et script en fichier');
            ok(!/Lucie/.test(ix) && /\[nom retiré\]/.test(ix), 'le nom de la vivante écrit à la main est remplacé');
            ok(/src="images\/m1\.jpg"/.test(ix) && !/lucie\.jpg|media\//.test(ix), 'images : renommées, la photo de la vivante n’est pas partie');
            ok(/Fils de Pierre MARTIN/.test(ix) && /lc-tree-box/.test(ix), 'les blocs de la généalogie sont figés dans la page');
            ok(/href="nous-ecrire\.html"/.test(ix) && /aria-current="page"/.test(z['nous-ecrire.html']), 'le menu relie les pages');
            ok(/--lc-principale:#7a2a2a/.test(z['css/style.css']) && /\.lc-tree\{/.test(z['css/style.css']) && /url\("images\/m1\.jpg"\)/.test(z['css/style.css']), 'style.css : couleurs, blocs, image de fond');
            ok(z['images/m1.jpg'] < 400000, `image réduite (${z['images/m1.jpg']} octets)`);
        }
        const one = await (await fetch(`${base}api.php?action=website_export&id=${id}&format=html&page=index`)).text();
        ok(/data:image\/jpeg;base64/.test(one) && /<style>/.test(one) && !/Lucie/.test(one), 'page seule : tout dedans, sans la vivante');
        const pv = await fetch(`${base}api.php?action=website_preview&id=${id}&page=nous-ecrire`);
        ok(/^sandbox allow-scripts/.test(pv.headers.get('content-security-policy') || '') && /connect-src 'none'/.test(pv.headers.get('content-security-policy')), '↗ aperçu : isolé (CSP sandbox, pas de connexion)');
        ok(/api\.php\?action=website_preview&amp;id=\d+&amp;page=index/.test(await pv.text()), '↗ aperçu : les liens du menu restent dans l’aperçu');
        // 🏛️ diagrammes et 🗺 cartes figés dans le site (dessinés par l'app), carte interactive
        const dgId = (await api('save_diagram', { name: 'Barres', kind: 'columns', spec: { kind: 'columns', rows: [] } })).r.result.id;
        const PNG2 = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, 'media', 'jean.jpg')).toString('base64'); // une vraie image (comme celle que l'app assemble)
        const s2 = JSON.parse(JSON.stringify(site)); s2.pages = [s2.pages[0]];
        s2.pages[0].html = `<header><nav data-lc-block="menu"></nav></header><div data-lc-block="diagram" data-diagram="${dgId}"></div><div data-lc-block="map" data-person="1" data-scope="ancestors" data-gens="6" data-fond="osm" data-vive="1"></div><div data-lc-block="map" data-person="1" data-scope="person" data-gens="6" data-fond="satellite"></div>`;
        s2.frozen = { [`diagram:${dgId}`]: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><text x="1" y="20">Lucie Martin</text><script>alert(1)</script><a href="javascript:alert(2)"><rect onclick="alert(3)" width="5" height="5"/></a><use href="https://evil.test/x.svg#a"/></svg>',
            'map:1:ancestors:6:osm': { img: PNG2, credit: '© OSM <b>gras</b>', w: 760, h: 460, view: { lat: 45.2, lng: 1.7, z: 8 } },
            'map:1:person:6:satellite': { img: PNG2, credit: '© Esri', w: 760, h: 460, view: { lat: 45.2, lng: 1.7, z: 9 } },
            'diagram:999999': '<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'map:1:person:6:osm': { img: 'data:text/html;base64,PHNjcmlwdD4=', credit: 'x' } };
        const sv2 = await api('save_website', { name: 'Site cartes', data: s2 }); ok(sv2.ok, 'site avec diagramme et cartes figés ' + (sv2.e || '')); const id2 = sv2.r.result.id;
        const fz = (await api('website', { id: id2 }, true)).r.data.frozen;
        eq(Object.keys(fz).sort(), [`diagram:${dgId}`, 'map:1:ancestors:6:osm', 'map:1:person:6:satellite'].sort(), 'figés : seulement ceux des blocs de la page, et des images vraies (pas de data:text/html)');
        ok(!/<script|onclick|javascript:|evil\.test/i.test(fz[`diagram:${dgId}`]) && /Lucie Martin/.test(fz[`diagram:${dgId}`]), 'diagramme figé : SVG désamorcé');
        const mp = await api('website_map_points', { person: 1, scope: 'ancestors', gens: 6 }, true);
        ok(mp.ok && mp.r.points.some(p => /Tulle/.test(p.name)) && mp.r.points.every(p => Number.isFinite(p.lat) && Number.isFinite(p.lng)), 'les lieux de la carte (pour la dessiner sur son fond)');
        eq((await api('website_map_points', { person: 4 }, true)).r.points, [], 'les lieux d’une personne vivante : rien');
        if (hasPy) {
            const zf = path.join(dir, 'site2.zip'); fs.writeFileSync(zf, Buffer.from(await (await fetch(`${base}api.php?action=website_export&id=${id2}&format=zip`)).arrayBuffer()));
            const z2 = JSON.parse(spawnSync('python3', ['-I', '-c', 'import zipfile,sys,json\nz=zipfile.ZipFile(sys.argv[1])\nprint(json.dumps({n:z.read(n).decode("utf-8","replace") if n.endswith((".html",".css",".js",".txt")) else len(z.read(n)) for n in z.namelist()}))', zf], { encoding: 'utf8' }).stdout);
            ok(z2['images/carte-1.jpg'] > 0 && z2['images/carte-2.jpg'] > 0, 'les cartes figées partent en images (réenregistrées)');
            ok(/<script src="js\/carte-lcnda\.js" defer><\/script>/.test(z2['index.html']) && /class="lc-carte-vive" data-carte="/.test(z2['index.html']) && /tile\.openstreetmap\.org/.test(z2['index.html']) && /lc-carte-vive/.test(z2['js/carte-lcnda.js']), 'carte interactive : le petit script du site, les tuiles OpenStreetMap et leur mention');
            ok(/© OSM &lt;b&gt;gras&lt;\/b&gt;/.test(z2['index.html']) && /© Esri/.test(z2['index.html']), 'la mention de chaque fond est sous sa carte (échappée)');
            ok(/<figure class="lc-diagramme"><svg/.test(z2['index.html']) && !/Lucie/.test(z2['index.html']) && /\[nom retiré\]/.test(z2['index.html']), 'diagramme figé dans la page, nom de la vivante retiré');
        }
        await api('delete_website', { id: id2 });
        // 🧮 la calculette sur le bureau
        const calcPage = await (await get({ action: 'desk_widget_page', kind: 'calc' }, true)).text();
        ok(/LCNDA_CALC/.test(calcPage) && (calcPage.match(/<script nonce="[\w-]+">/g) || []).length === 2 && !/<script>/.test(calcPage), 'widget calculette : le moteur de la Calculette dans la page, scripts avec nonce');
        ok(/class="calc"/.test(await (await get({ action: 'desk_widget_file', kind: 'calc' }, true)).text()), 'widget calculette en fichier autonome');
        // 📤 publier en ligne (réponses simulées)
        let pst = (await api('website_publish_state', { id }, true)).r;
        eq([pst.netlify.has_token, pst.github.has_token], [false, false], 'publier : pas encore de jeton');
        ok(/forme/.test((await api('website_publish', { id, provider: 'netlify', token: 'court' })).e || ''), 'jeton de mauvaise forme : refusé');
        ok(/Colle d’abord ton jeton Netlify/.test((await api('website_publish', { id, provider: 'netlify' })).e || ''), 'sans jeton : message clair');
        const pub = await api('website_publish', { id, provider: 'netlify', token: mock.token }); ok(pub.ok, 'publier sur Netlify ' + (pub.e || ''));
        eq(pub.r.result.url, 'https://essai-lcnda.netlify.app', 'Netlify : l’adresse du site');
        const dep = mock.calls.find(c => c.u.endsWith('/deploys')); ok(dep && dep.type === 'application/zip' && dep.head === 'PK' && dep.size > 1000, 'Netlify : le .zip du site est envoyé');
        pst = (await api('website_publish_state', { id }, true)).r;
        ok(pst.netlify.has_token && !JSON.stringify(pst).includes(mock.token) && pst.site.netlify_url === 'https://essai-lcnda.netlify.app', 'l’écran sait qu’il y a un jeton, sans jamais le voir');
        const secretFile = path.join(dir, 'site-publish.json');
        ok(fs.existsSync(secretFile) && (fs.statSync(secretFile).mode & 0o777) === 0o600, 'jetons gardés hors de la base, fichier lisible par toi seul (600)');
        ok(!JSON.stringify((await api('website', { id }, true)).r).includes(mock.token), 'le jeton n’est pas dans le site');
        const pub2 = await api('website_publish', { id, provider: 'netlify' }); ok(pub2.ok && mock.calls.filter(c => c.m === 'POST' && c.u === '/netlify/sites').length === 1, 'republier : le même site Netlify (pas de doublon)');
        mock.down = true; ok(/Pas de réseau/.test((await api('website_publish', { id, provider: 'netlify' })).e || ''), 'réseau coupé : message clair'); mock.down = false;
        const bad = await api('website_publish_settings', { provider: 'netlify', token: 'nfp_mauvais_0123456789abcdefghij' }); ok(bad.ok, 'changer de jeton');
        ok(/refusé/.test((await api('website_publish', { id, provider: 'netlify' })).e || ''), 'jeton refusé par le service : message clair');
        const gh = await api('website_publish', { id, provider: 'github', token: mock.ghToken, repo: 'notre-site' }); ok(gh.ok, 'publier sur GitHub Pages ' + (gh.e || ''));
        eq(gh.r.result.url, 'https://victor.github.io/notre-site/', 'GitHub Pages : l’adresse du site');
        ok(mock.calls.some(c => c.u === '/github/user/repos') && mock.calls.some(c => c.u.endsWith('/git/refs')) && mock.calls.filter(c => c.u.endsWith('/git/blobs')).length >= 3, 'GitHub : dépôt créé, fichiers, branche gh-pages');
        ok(!/(Bearer|github_pat|nfp_)/.test(JSON.stringify(gh.r)), 'aucun jeton dans la réponse');
        ok((await api('website_publish', { id, provider: 'github', repo: '../x y' })).e, 'dépôt mal écrit : refusé');
        ok((await api('website_publish_settings', { provider: 'github', forget: true })).ok && !(await api('website_publish_state', { id }, true)).r.github.has_token, '× Oublier le jeton');
        ok(/serveur FTP/.test((await api('website_publish_settings', { provider: 'ftps', host: 'pas un nom', user: 'a', pass: 'b' })).e || ''), 'FTP : nom de serveur vérifié');
        // mode consultation : pas d'export
        await api('kiosk_enter', { password: 'secret1' });
        eq((await fetch(`${base}api.php?action=website_export&id=${id}&format=zip`)).status, 423, 'mode consultation : export refusé');
        eq((await fetch(`${base}api.php?action=desk_widget_file&kind=today`)).status, 423, 'mode consultation : fichier du widget refusé');
        ok(/consultation/i.test((await api('website_publish', { id, provider: 'netlify' })).e || ''), 'mode consultation : publier refusé');
        await api('kiosk_exit', { password: 'secret1' });
        await api('delete_website', { id });
        console.log(`✓ API : ${n} vérifications`);

        /* 3. Navigateur */
        await page.evaluate(() => { window.LCNDA_APP.state.listType = 'edit_tools'; window.LCNDA_APP.setModule('listes'); });
        await page.waitForSelector('[data-et-tab="website"].is-active'); await page.waitForTimeout(300);
        ok(/Aucun projet de site/.test(await page.textContent('.h-et-page')), 'liste vide : la grande boîte « rien ici »');
        await page.click('.h-et-bar [data-et-new]'); await page.waitForSelector('dialog[open] .sw-tpl');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'site-modeles.png') });
        ok(await page.locator('dialog[open] .sw-tpl').count() === 5, 'les 5 modèles');
        await page.click('dialog[open] [data-tpl="blank"]'); await page.waitForSelector('dialog.sw-dlg[open] [data-sw-frame]');
        const fr = page.frameLocator('[data-sw-frame]');
        await fr.locator('header.site-entete').waitFor(); await page.waitForTimeout(400);
        ok(await fr.locator('.lc-menu-list a').count() === 1, 'aperçu : le menu se remplit');
        // ⚠ l'aperçu est isolé : il ne voit pas l'app
        eq(await page.locator('[data-sw-frame]').getAttribute('sandbox'), 'allow-scripts', 'aperçu : iframe sandbox sans allow-same-origin');
        // clic → Ceci est…
        await fr.locator('h2').first().click(); await page.waitForTimeout(300);
        eq(await page.textContent('.sw-this code'), 'h2', 'clic dans l’aperçu : « Ceci est : h2 »');
        await fr.locator('section.section').first().click({ position: { x: 5, y: 5 } }); await page.waitForTimeout(300);
        eq(await page.textContent('.sw-this code'), 'section.section', 'clic sur la section : « section.section »');
        ok(await page.locator('.swc-mark:not([hidden])').count() === 1, 'l’élément choisi est surligné dans le code');
        // « c'est mon header »
        await fr.locator('header.site-entete').click({ position: { x: 4, y: 4 } }); await page.waitForTimeout(300);
        await page.fill('[data-sw-at="class"]', 'site-entete haut'); await page.press('[data-sw-at="class"]', 'Tab'); await page.waitForTimeout(300);
        await page.fill('[data-sw-at="id"]', 'haut de page'); await page.press('[data-sw-at="id"]', 'Tab'); await page.waitForTimeout(300);
        ok(/<header class="site-entete haut" data-lc-name="En-tête" id="haut-de-page">/.test(await page.inputValue('.swc-ta')), 'classe et id donnés dans le panneau → le code suit');
        await fr.locator('section.section p').first().click(); await page.waitForTimeout(250);
        await page.click('[data-sw-role="2"]'); await page.waitForTimeout(400); // Contenu principal
        ok(await fr.locator('main[data-lc-name="Contenu principal"]').count() === 1 || await fr.locator('main').count() === 1, '« c’est mon contenu principal » : la balise devient <main>');
        await page.click('.ui-topbar [data-ui-cmd="undo"]'); await page.waitForTimeout(400);
        eq(await fr.locator('main').count(), 0, '↶ annule');
        await page.click('.ui-topbar [data-ui-cmd="redo"]'); await page.waitForTimeout(400);
        eq(await fr.locator('main').count(), 1, '↷ rétablit');
        // T Écrire → le code suit
        await page.click('[data-sw-mode="text"]'); await page.waitForTimeout(200);
        await fr.locator('h2').first().click(); await page.keyboard.press('End'); await page.keyboard.type(' de la famille'); await page.waitForTimeout(600);
        ok(/<h2>Un titre de la famille<\/h2>/.test(await page.inputValue('.swc-ta')), 'T Écrire : le code suit');
        ok(!/contenteditable|data-lcb/.test(await page.evaluate(() => window.LCNDA_EXT.siteWeb.current.page().html)), 'rien du pont dans la page enregistrée');
        await page.click('[data-sw-mode="select"]');
        // code → aperçu (Emmet)
        const ta = page.locator('.swc-ta');
        await page.evaluate(() => { const t = document.querySelector('.swc-ta'); const i = t.value.indexOf('<footer'); t.focus(); t.setSelectionRange(i, i); });
        await page.keyboard.type('div.carte-famille>h3{Les Martin}+p{De Tulle}'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
        eq(await fr.locator('.carte-famille h3').textContent(), 'Les Martin', 'code (Emmet + Tab) → l’aperçu suit tout de suite');
        // clic dans le code → l'élément choisi
        await page.evaluate(() => { const t = document.querySelector('.swc-ta'); const i = t.value.indexOf('De Tulle'); t.setSelectionRange(i + 2, i + 2); t.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        await page.waitForTimeout(400);
        eq(await page.textContent('.sw-this code'), 'p', 'clic dans le code → l’élément est choisi dans l’aperçu');
        // CSS en direct
        await page.click('[data-sw-tab="css"]');
        await page.evaluate(() => { const t = document.querySelector('.swc-ta'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); });
        await page.keyboard.type('\n.carte-famille { border: 3px solid rgb(1, 2, 3); }');
        eq(await until(() => fr.locator('.carte-famille').evaluate(e => getComputedStyle(e).borderTopColor), 'rgb(1, 2, 3)'), 'rgb(1, 2, 3)', 'CSS → l’aperçu suit');
        await page.click('[data-sw-tab="html"]');
        // un bloc de la généalogie glissé dans l'aperçu (fiche de Jean : le menu de choix est remplacé par la réponse)
        await page.evaluate(() => { const P = window.LCNDA_PICKER || window.LCNDA_APP; P.openPicker = async () => ({ id: 1, title: 'Jean MARTIN' }); });
        const box = await page.locator('[data-sw-frame]').boundingBox();
        await page.click('[data-sw-left="blocks"].ed-tool').catch(() => {});
        if (!await page.locator('[data-sw-block="person"]').isVisible()) await page.click('.sw-rail [data-sw-left="blocks"]');
        await page.dragAndDrop('[data-sw-block="person"]', '[data-sw-frame]', { targetPosition: { x: box.width / 2, y: 30 } }).catch(() => {});
        await page.waitForTimeout(400);
        if (!await fr.locator('[data-lc-block="person"]').count()) await page.click('[data-sw-block="person"]'); // si le glisser n'est pas joué par ce navigateur
        await fr.locator('[data-lc-block="person"] .lc-fiche').waitFor({ timeout: 8000 });
        ok(/Fils de Pierre MARTIN/.test(await fr.locator('[data-lc-block="person"]').textContent()), 'bloc de la généalogie : rempli par l’app');
        ok(!/lc-fiche/.test(await page.evaluate(() => window.LCNDA_EXT.siteWeb.current.page().html)), 'le bloc reste vide dans le code (rempli à l’aperçu et à l’export)');
        // téléphone
        await page.click('[data-sw-device="phone"]'); await page.waitForTimeout(300);
        eq(await page.locator('[data-sw-devbox]').evaluate(e => e.style.width), '390px', 'aperçu téléphone (390 px)');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'site-editeur-1440.png') });
        await page.click('[data-sw-device="desktop"]');
        // ▶ Tester : le script de la personne tourne, isolé
        await page.click('[data-sw-tab="js"]');
        await page.evaluate(() => { const t = document.querySelector('.swc-ta'); t.focus(); t.select(); });
        await page.keyboard.type('let s = ""; try { s = typeof parent.LCNDA_APP + typeof parent.document; } catch (e) { s = "bloqué"; } document.body.dataset.essai = s; try { document.body.dataset.cookie = document.cookie; } catch (e) { document.body.dataset.cookie = "bloqué"; }');
        await page.click('[data-sw-mode="play"]');
        eq(await until(() => fr.locator('body').getAttribute('data-essai'), 'bloqué'), 'bloqué', '▶ Tester : le script tourne mais ne voit pas l’app');
        eq(await fr.locator('body').getAttribute('data-cookie'), 'bloqué', '▶ Tester : pas de cookie de l’app');
        await page.click('[data-sw-mode="select"]'); await page.waitForTimeout(300);
        // déplacer à la souris dans l'aperçu (ligne bleue), puis au clavier (Alt + ↑ / ↓), ↶ ↷ suivent
        await page.click('[data-sw-view="visual"]'); await page.waitForTimeout(500);
        const pf = page.frames().find(f => f.url() === 'about:srcdoc');
        const html0 = await page.evaluate(() => window.LCNDA_EXT.siteWeb.current.page().html);
        const footBox = await pf.locator('footer').boundingBox(), firstSec = await pf.locator('body > section').first().boundingBox();
        await page.mouse.move(footBox.x + 30, footBox.y + 8); await page.mouse.down();
        await page.mouse.move(firstSec.x + 40, firstSec.y + 6, { steps: 10 }); await page.mouse.move(firstSec.x + 40, firstSec.y + 3, { steps: 2 });
        ok(await pf.locator('#lcb-ov .lcb-drop').evaluate(e => getComputedStyle(e).display) === 'block', 'en glissant : la ligne bleue montre où il ira');
        await page.mouse.up(); await page.waitForTimeout(500);
        const html1 = await page.evaluate(() => window.LCNDA_EXT.siteWeb.current.page().html);
        ok(html1.indexOf('<footer') < html1.indexOf('<section') && html0.indexOf('<footer') > html0.indexOf('<section'), 'glissé à la souris : le pied de page passe avant la section (le code suit)');
        eq(await page.textContent('.sw-this code'), 'footer.site-pied', 'l’élément déplacé reste choisi');
        await pf.locator('footer').click({ position: { x: 5, y: 5 } }); await pf.locator('body').press('Alt+ArrowDown'); await page.waitForTimeout(400);
        const html2 = await page.evaluate(() => window.LCNDA_EXT.siteWeb.current.page().html);
        ok(html2.indexOf('<footer') > html2.indexOf('<section'), 'Alt + ↓ : il redescend');
        await page.click('.ui-topbar [data-ui-cmd="undo"]'); await page.waitForTimeout(400);
        ok((await page.evaluate(() => window.LCNDA_EXT.siteWeb.current.page().html)).indexOf('<footer') < html2.indexOf('<footer'), '↶ annule le déplacement');
        await page.click('.ui-topbar [data-ui-cmd="redo"]'); await page.waitForTimeout(300);
        // 🏛️ un diagramme de l'app (menu de choix « diagramme »)
        const dgB = (await api('save_diagram', { name: 'Les âges', kind: 'columns', spec: { kind: 'columns', o: { title: 'Les âges' } } })).r.result.id;
        await page.evaluate(id => { const P = window.LCNDA_PICKER || window.LCNDA_APP; P.openPicker = async o => (o.kind === 'diagram' ? { id, title: 'Les âges' } : { id: 1, title: 'Jean MARTIN' }); }, dgB);
        await fr.locator('header.site-entete').click({ position: { x: 4, y: 4 } }); await page.waitForTimeout(200);
        if (!await page.locator('[data-sw-block="diagram"]').isVisible()) await page.click('.sw-rail [data-sw-left="blocks"]');
        await page.click('[data-sw-block="diagram"]'); await page.waitForSelector('dialog[open] [data-dg-way="pick"]');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'site-diagramme-choix.png') });
        await page.click('dialog[open] [data-dg-way="pick"]');
        await fr.locator('.lc-diagramme svg').waitFor({ timeout: 8000 });
        ok(await page.evaluate(id => /^<svg/.test(window.LCNDA_EXT.siteWeb.current.site.frozen[`diagram:${id}`] || ''), dgB), 'diagramme de l’app : dessiné par Graphiques, gardé (figé) dans le site');
        // 🗺 une carte sur un fond de l'app (même liste que Réglages → fonds de carte)
        await page.click('[data-sw-block="map"]'); await fr.locator('[data-lc-block="map"] .lc-map-img').waitFor({ timeout: 20000 });
        ok(await page.evaluate(() => Object.keys(window.LCNDA_EXT.siteWeb.current.site.frozen).some(k => /^map:1:ancestors:6:[a-z0-9_]+$/.test(k))), 'carte : assemblée en image sur son fond');
        await fr.locator('[data-lc-block="map"]').click(); await page.waitForTimeout(300);
        const fondSel = page.locator('[data-sw-panel] select[data-sw-ba="fond"]');
        ok(await fondSel.count() === 1 && await fondSel.locator('optgroup').count() >= 2, 'le choix du fond : la liste des fonds de l’app, rangée comme dans les Réglages');
        await page.check('[data-sw-panel] input[data-sw-ba="vive"]'); await page.waitForTimeout(400);
        ok(/data-vive="1"/.test(await page.evaluate(() => window.LCNDA_EXT.siteWeb.current.page().html)), '« Carte interactive » cochée');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'site-carte-fond.png') });
        // 📤 publier (faux Netlify)
        await page.evaluate(() => window.LCNDA_EXT.siteWeb.current.save({ quiet: true }));
        await page.click('[data-sw-cmd="publish"]'); await page.waitForSelector('dialog[open] [data-pub-pane="netlify"]');
        await page.click('dialog[open] [data-pub-tab="netlify"]');
        await page.click('dialog[open] .modal-actions button[type="submit"]'); await page.waitForTimeout(300);
        ok(await page.locator('dialog[open] input[name="token_netlify"].is-invalid, dialog[open] input[name="token_netlify"][aria-invalid="true"]').count() === 1, 'publier sans jeton : erreur sous le champ (K1)');
        await page.fill('dialog[open] input[name="token_netlify"]', mock.token);
        await page.click('dialog[open] .modal-actions button[type="submit"]');
        await page.waitForSelector('dialog[open] [data-pub-out] a[href="https://essai-lcnda.netlify.app"]', { timeout: 20000 });
        eq(await page.inputValue('dialog[open] input[name="token_netlify"]'), '', 'le jeton ne reste pas affiché');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'site-publier.png') });
        await page.click('dialog[open] .modal-actions [data-h-close]'); await page.waitForTimeout(200);
        // pages
        await page.click('.sw-rail [data-sw-left="pages"]');
        page.once('dialog', () => {}); // askText est une fenêtre de l'app
        await page.click('[data-sw-page="add"]'); await page.waitForSelector('dialog[open] input[type=text]');
        await page.fill('dialog[open] input[type=text]', 'Nos photos'); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
        eq(await page.evaluate(() => window.LCNDA_EXT.siteWeb.current.site.pages.map(p => p.slug)), ['index', 'nos-photos'], 'nouvelle page (adresse faite toute seule)');
        ok(await fr.locator('.lc-menu-list a').count() === 2, 'le menu montre la nouvelle page');
        // enregistrer
        await page.keyboard.press('Control+s'); await page.waitForFunction(() => /Enregistré/.test(document.querySelector('.sw-dlg .ui-topbar [data-ui-status]')?.textContent || ''), null, { timeout: 8000 });
        const sid = await page.evaluate(() => window.LCNDA_EXT.siteWeb.current.id); ok(sid > 0, 'enregistré (⌘S)');
        // export
        await page.click('.ui-topbar [data-sw-cmd="export"]'); await page.waitForSelector('dialog.ui-export[open]');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'site-export.png') });
        const [dl] = await Promise.all([page.waitForEvent('download'), page.click('dialog.ui-export[open] [data-ui-go]')]);
        ok(/-\d{4}-\d{2}-\d{2}\.zip$/.test(dl.suggestedFilename()), 'export : le .zip se télécharge');
        await page.waitForTimeout(300);
        // sombre, 390 px
        await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await page.waitForTimeout(200);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'site-editeur-sombre.png') });
        ok(await page.locator('.sw-dlg').evaluate(e => getComputedStyle(e).backgroundColor) !== 'rgb(255, 255, 255)', 'mode sombre : l’éditeur passe en sombre');
        await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
        await page.click('.ui-topbar [data-sw-cmd="close"]'); await page.waitForTimeout(400);
        ok(await page.locator('.h-et-page [data-et-open]').count() >= 1, 'la liste montre le site');
        // téléphone : l'éditeur tient en 390 px
        await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
        await page.click('.h-et-page [data-et-open]'); await page.waitForSelector('dialog.sw-dlg[open] [data-sw-frame]'); await page.waitForTimeout(800);
        ok(await page.locator('[data-sw-leftpane]').isHidden(), '390 px : le panneau de gauche est replié');
        const over = await page.evaluate(() => document.querySelector('.sw-dlg').scrollWidth - document.querySelector('.sw-dlg').clientWidth);
        ok(over <= 2, `390 px : pas de défilement de côté (${over})`);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'site-editeur-390.png') });
        await page.click('.ui-topbar [data-sw-cmd="close"]'); await page.waitForTimeout(300);
        await page.setViewportSize({ width: 1440, height: 900 });
        // 🪟 sur le tableau de bord (navigateur : fichier .html)
        await page.evaluate(() => window.LCNDA_APP.setModule('dashboard')); await page.waitForTimeout(1200);
        const put = page.locator('[data-dw-put]');
        if (await put.count()) await put.first().click(); else await page.evaluate(() => window.LCNDA_EXT.deskWidgets.open('today'));
        await page.waitForSelector('dialog[open] .dw-kinds');
        ok(await page.locator('dialog[open] [data-dw-kind="calc"]').count() === 1, '🧮 la calculette est parmi les widgets de bureau');
        ok(/navigateur/.test(await page.textContent('dialog[open] .ui-notice')), 'navigateur : la fenêtre dit qu’il faut l’application de bureau, et propose le fichier');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'widgets-bureau.png') });
        await page.click('dialog[open] [data-dw-file="countdown"]'); await page.waitForTimeout(300);
        ok(await page.locator('dialog[open] .is-invalid, dialog[open] [aria-invalid="true"]').count() >= 1 || /date/.test(await page.textContent('dialog[open]')), 'compte à rebours sans date : erreur dans le champ (K1)');
        await page.fill('dialog[open] [data-dw-cd="date"]', '14 juillet 2027');
        const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('dialog[open] [data-dw-file="countdown"]')]);
        eq(dl2.suggestedFilename(), 'widget-countdown.html', 'fichier du widget téléchargé');
        eq(errors, [], 'aucune erreur dans la console');
        console.log(`✓ navigateur : ${n} vérifications en tout`);
    } finally {
        if (browser) await browser.close();
        proc.kill(); mockSrv.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
    console.log(`✓ Mon site web et widgets de bureau : ${n} vérifications`);
})().catch(e => { console.error(e); process.exit(1); });
