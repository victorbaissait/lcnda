'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test de « 🔍 Chercher une image semblable » et « 👯 Doublons d'images »
 * (assets/js/app-image-prints.js, assets/js/heritage-images-similaires.js, lib/image_prints.php) :
 *     node tests/test-images-similaires.js
 * 1. Serveur (vrai « php -S ») : des photos de test fabriquées avec GD (une photo riche en détails, puis : copie
 *    identique, JPEG recompressé, redimensionnée, recadrée à 70 %, zoomée, plus claire, en PNG, et une autre photo) ;
 *    envois forgés (hachage faux, points trop nombreux, vignette de mauvaise taille), jeton CSRF absent, mode consultation.
 * 2. Navigateur (Playwright, sinon sauté) : le calcul des empreintes en tâche de fond (par paquets, reprise), le
 *    classement attendu (identique, très proche, recadrée / zoomée, rien pour l'autre photo), la recherche depuis la
 *    visionneuse et depuis une image de l'ordinateur, la fenêtre des doublons (groupes, la plus grande proposée), la
 *    fusion des liens (fiches, événement, étiquette, album, portrait, zone d'un visage replacée) puis « ↶ Annuler » qui
 *    remet la base EXACTEMENT comme avant ; « en versions » ; « Ce n'est pas un doublon » ; 390 px et mode sombre.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-imgsim-'));
const dir = path.join(tmp, 'a');
const shots = process.env.IMGSIM_SHOTS || '';
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const php = (code, env = {}) => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...envFor(dir), ...env } });

/* ═════ Les photos de test (GD) et la base ═════ */
{
    const r = php(String.raw`
require 'lib/paths.php';
if (!function_exists('imagecreatetruecolor')) { echo 'nogd'; exit; }
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Joseph','Martin','male'),('Marie','Durand','female'),('Louis','Petit','male')"); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
// une « photo » riche en détails : dégradé, formes, traits, texte, grain
$photo = function (int $seed, int $W = 1600, int $H = 1200) {
    mt_srand($seed); $im = imagecreatetruecolor($W, $H);
    for ($y = 0; $y < $H; $y += 4) { $c = imagecolorallocate($im, 60 + (int)(120 * $y / $H), 90 + mt_rand(0, 20), 150 - (int)(80 * $y / $H)); imagefilledrectangle($im, 0, $y, $W, $y + 3, $c); }
    for ($k = 0; $k < 70; $k++) {
        $c = imagecolorallocate($im, mt_rand(0, 255), mt_rand(0, 255), mt_rand(0, 255));
        $x = mt_rand(0, $W); $y = mt_rand(0, $H); $s = mt_rand(30, 220);
        switch ($k % 4) {
            case 0: imagefilledellipse($im, $x, $y, $s, (int)($s * .7), $c); break;
            case 1: imagefilledrectangle($im, $x, $y, $x + $s, $y + (int)($s * .6), $c); break;
            case 2: imagefilledpolygon($im, [$x, $y, $x + $s, $y + mt_rand(-60, 60), $x + mt_rand(-40, 40), $y + $s], $c); break;
            default: imagesetthickness($im, mt_rand(2, 6)); imageline($im, $x, $y, $x + mt_rand(-300, 300), $y + mt_rand(-300, 300), $c);
        }
    }
    $ink = imagecolorallocate($im, 20, 20, 20);
    for ($k = 0; $k < 40; $k++) imagestring($im, 5, mt_rand(0, $W - 120), mt_rand(0, $H - 20), 'Famille ' . mt_rand(1800, 1950), $ink);
    for ($k = 0; $k < 6000; $k++) { $g = mt_rand(0, 255); imagesetpixel($im, mt_rand(0, $W - 1), mt_rand(0, $H - 1), imagecolorallocate($im, $g, $g, $g)); }
    return $im;
};
$M = MEDIA_DIR; $src = $photo(7); $W = imagesx($src); $H = imagesy($src);
imagejpeg($src, "$M/base.jpg", 90);
copy("$M/base.jpg", "$M/copie.jpg");
imagejpeg($src, "$M/recompresse.jpg", 45);
$r = imagescale($src, 800, 600, IMG_BICUBIC); imagejpeg($r, "$M/reduite.jpg", 88);
$c = imagecrop($src, ['x' => 320, 'y' => 120, 'width' => 1120, 'height' => 840]); imagejpeg($c, "$M/recadree.jpg", 88);
$z = imagecrop($src, ['x' => 480, 'y' => 360, 'width' => 720, 'height' => 540]); $z = imagescale($z, 1600, 1200, IMG_BICUBIC); imagejpeg($z, "$M/zoomee.jpg", 88);
$b = imagecreatefromjpeg("$M/base.jpg"); imagefilter($b, IMG_FILTER_BRIGHTNESS, 35); imagejpeg($b, "$M/claire.jpg", 90);
imagepng($src, "$M/format.png");
imagejpeg($photo(99), "$M/autre.jpg", 88);
// la même zoomée, gardée hors des médias : l'« image de l'ordinateur » pour la recherche
imagejpeg($z, DATA_DIR . '/externe.jpg', 80);
$ins = $pdo->prepare("INSERT INTO media(title, filename, thumbnail, media_type, date_text) VALUES(?,?,?,?,?)");
foreach ([['Photo de famille', 'base.jpg'], ['Copie de la photo', 'copie.jpg'], ['Photo recompressée', 'recompresse.jpg'], ['Photo réduite', 'reduite.jpg'],
          ['Photo recadrée', 'recadree.jpg'], ['Photo zoomée', 'zoomee.jpg'], ['Photo éclaircie', 'claire.jpg'], ['Photo en PNG', 'format.png'],
          ['<img src=x onerror="window.__xss=1">Autre photo', 'autre.jpg'], ['Un acte en PDF', 'acte.pdf']] as [$t, $f]) {
    $ins->execute([$t, $f, str_ends_with($f, '.pdf') ? '' : $f, str_ends_with($f, '.pdf') ? 'document' : 'image', '1925']);
}
file_put_contents("$M/acte.pdf", "%PDF-1.4\n%test\n");
// des liens sur les doublons : ils doivent passer sur la photo gardée (1), puis revenir avec « ↶ Annuler »
$birth = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT'")->fetchColumn();
$pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, date_text, year) VALUES('person', 1, ?, '7 mai 1925', 1925)")->execute([$birth]);
$pdo->exec("INSERT INTO media_links(media_id, entity_type, entity_id) VALUES(1,'person',1),(2,'person',1),(2,'person',2),(5,'event',1),(5,'person',3)");
$pdo->exec("INSERT INTO labels(name, color) VALUES('Portraits', '#c00')");
$pdo->exec("INSERT INTO label_links(label_id, entity_type, entity_id) VALUES(1, 'media', 2)");
$pdo->exec("UPDATE persons SET portrait_media_id=5 WHERE id=2");
$pdo->exec("INSERT INTO media_tags(media_id, person_id, x, y, w, h, confidence) VALUES(5, 3, 10, 20, 20, 25, 'certain')");
$pdo->exec("INSERT INTO family_collection_media(collection_type, collection_id, media_id, position) VALUES('family_memory', 1, 2, 0)");
echo 'ok';`);
    if (r.stdout === 'nogd') { console.log('  – GD absent : test sauté'); process.exit(0); }
    if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
}

/** ce qu'on compare avant la fusion et après « ↶ Annuler » : toutes les lignes qui touchent aux médias */
const TABLES = ['media', 'media_links', 'label_links', 'media_tags', 'persons', 'family_collection_media', 'media_versions', 'image_prints', 'image_not_duplicates', 'events'];
function dump() {
    const r = php(String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $out = [];
foreach (json_decode(getenv('T'), true) as $t) { $rows = $p->query("SELECT * FROM $t ORDER BY rowid")->fetchAll(PDO::FETCH_ASSOC); foreach ($rows as &$x) { unset($x['updated_at']); } $out[$t] = $rows; }
echo json_encode($out);`, { T: JSON.stringify(TABLES) });
    return JSON.parse(r.stdout);
}

const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
async function server(d) {
    const port = Number(process.env.IMGSIM_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(d), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (action, q = '') => { const r = await fetch(base + 'api.php?action=' + action + q, { headers: { Cookie: cookie } }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    const post = async (action, body, { token = csrf } = {}) => {
        const r = await fetch(base + 'api.php?action=' + action, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}) }, body: JSON.stringify(token ? { ...body, csrf: token } : body) });
        return { status: r.status, body: await r.json().catch(() => ({})) };
    };
    return { proc, base, port, csrf, get, post };
}

const goodPrint = () => ({ nw: 512, nh: 384, a: '0123456789abcdef', d: 'fedcba9876543210', p: '00ff00ff00ff00ff', hist: Buffer.alloc(64, 4).toString('base64'), lum: 120, sat: 40,
    g: Buffer.alloc(48 * 48, 128).toString('base64'), c: Buffer.alloc(16 * 16 * 3, 90).toString('base64'), kp: Buffer.alloc(37 * 3, 1).toString('base64') });

async function browserPart(S, out) {
    let pw = null;
    for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!pw) { out.browser = 'sauté (Playwright absent)'; return; }
    const browser = await pw.chromium.launch();
    const errors = [];
    const watch = page => { page.on('pageerror', e => errors.push(String(e.message))); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); }); };
    try {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await ctx.newPage(); watch(page);
        await page.goto(S.base);
        await page.waitForFunction(() => window.LCNDA_EXT?.imagePrints && window.LCNDA_IMGPRINT && window.LCNDA_APP?.state?.csrf);
        // 1. les empreintes en tâche de fond : on lance, on s'arrête en route (page rechargée), puis ça reprend
        out.status0 = await page.evaluate(() => window.LCNDA_APP.api('image_prints_status', { algo: window.LCNDA_IMGPRINT.ALGO }));
        await page.evaluate(() => { window.LCNDA_EXT.imagePrints.run(); });
        await page.waitForFunction(() => window.LCNDA_EXT.imagePrints.job.done >= 4, null, { timeout: 60000 });
        await page.reload();
        await page.waitForFunction(() => window.LCNDA_EXT?.imagePrints && window.LCNDA_APP?.state?.csrf);
        out.statusMid = await page.evaluate(() => window.LCNDA_APP.api('image_prints_status', { algo: window.LCNDA_IMGPRINT.ALGO }));
        await page.evaluate(() => window.LCNDA_EXT.imagePrints.run());
        out.status1 = await page.evaluate(() => window.LCNDA_APP.api('image_prints_status', { algo: window.LCNDA_IMGPRINT.ALGO }));
        // 2. le classement attendu, depuis la photo de départ
        out.kinds = await page.evaluate(async () => {
            const P = window.LCNDA_IMGPRINT, all = await window.LCNDA_EXT.imagePrints.load(true), base = all.items.find(x => x.filename === 'base.jpg'), o = {};
            for (const it of all.items) if (it !== base) { const r = P.compare(base, it); o[it.filename] = { kind: r.kind, sub: r.sub, score: r.score, zone: r.zone || null, part: r.part || '' }; }
            const res = await P.search(base, all.items, { exclude: base.id });
            o._search = res.map(r => r.item.filename);
            return o;
        });
        // 3. depuis la visionneuse : « 🔍 Chercher une image semblable »
        await page.evaluate(() => window.LCNDA_APP.openLightbox([{ id: 1, filename: 'base.jpg', thumbnail: 'base.jpg', title: 'Photo de famille', media_type: 'image' }], 0, true));
        await page.waitForSelector('#similar-media:not([hidden])', { timeout: 5000 });
        await page.click('#similar-media');
        await page.waitForSelector('dialog.isim-search .ui-card', { timeout: 20000 });
        await page.waitForTimeout(400);
        out.searchCards = await page.$$eval('dialog.isim-search .ui-card', l => l.map(c => c.querySelector('.ui-card-name').textContent.trim()));
        out.searchFilters = await page.$$eval('dialog.isim-search [data-isim-filter]', l => l.map(b => b.textContent.trim()));
        out.previewPair = await page.$$eval('dialog.isim-search .isim-pair figure', l => l.length);
        if (shots) await page.screenshot({ path: path.join(shots, 'imgsim-recherche-1440.png') });
        // une image de l'ordinateur (la même, zoomée) : elle n'entre pas dans les médias
        const before = (await S.get('image_prints_status', '&algo=1')).body.total;
        await page.setInputFiles('dialog.isim-search .ui-drop input[type=file]', path.join(dir, 'externe.jpg'));
        await page.waitForFunction(() => /Image de ton ordinateur/.test(document.querySelector('dialog.isim-search [data-isim-query]')?.textContent || '') && document.querySelector('dialog.isim-search .ui-card'), null, { timeout: 20000 });
        await page.waitForTimeout(400);
        out.extCards = await page.$$eval('dialog.isim-search .ui-card', l => l.map(c => c.querySelector('.ui-card-name').textContent.trim() + ' | ' + c.querySelector('.ui-card-body').textContent));
        out.extMedia = (await S.get('image_prints_status', '&algo=1')).body.total === before;
        await page.click('dialog.isim-search [data-isim-close]');
        await page.keyboard.press('Escape').catch(() => {});
        await page.evaluate(() => document.getElementById('lightbox')?.close?.());
        // 4. 👯 Doublons d'images : depuis la liste Médias (l'ancien bouton « Recherche de doublons » ouvre cette fenêtre)
        out.dbBefore = dump();
        await page.evaluate(() => window.LCNDA_APP.openMediaDuplicatesDialog());
        await page.waitForSelector('dialog.isim-dups .isim-group', { timeout: 30000 });
        await page.waitForTimeout(300);
        out.groups = await page.$$eval('dialog.isim-dups .isim-group', l => l.map(g => ({ id: g.dataset.isimGroup, names: [...g.querySelectorAll('.ui-card-name')].map(n => n.textContent.trim()), kept: g.querySelector('.ui-card.is-kept .ui-card-name')?.textContent.trim() })));
        out.dupFilters = await page.$$eval('dialog.isim-dups [data-isim-filter]', l => l.map(b => b.textContent.trim()));
        if (shots) await page.screenshot({ path: path.join(shots, 'imgsim-doublons-1440.png') });
        const g = out.groups.find(x => x.names.includes('Photo de famille'));
        // garder la photo de départ (même taille que sa copie : on la choisit), puis fusionner
        if (g && g.kept !== 'Photo de famille') await page.click(`dialog.isim-dups [data-isim-keep="${g.id}:1"]`);
        await page.click(`dialog.isim-dups [data-isim-merge="${g.id}"]`);
        await page.waitForSelector('.ui-toast-btn', { timeout: 10000 });
        await page.waitForTimeout(300);
        out.afterMerge = dump();
        out.toast = await page.$$eval('.ui-toast-text', l => l.map(x => x.textContent).join(' | '));
        out.trashCount = await page.$eval('dialog.isim-dups [data-isim-filter="trash"]', b => b.textContent);
        await page.click('.ui-toast-btn');
        await page.waitForFunction(() => /Annulé/.test([...document.querySelectorAll('.ui-toast-text')].map(x => x.textContent).join(' ')), null, { timeout: 10000 });
        await page.waitForTimeout(500);
        out.afterUndo = dump();
        // « Ce n'est pas un doublon » sur une photo du groupe, puis « ↺ Signaler de nouveau »
        await page.waitForSelector('dialog.isim-dups .isim-group', { timeout: 30000 });
        out.xss = await page.evaluate(() => window.__xss || 0);
        await page.click('dialog.isim-dups [data-isim-close]');
        // 5. 390 px, mode sombre
        const m = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
        await m.addInitScript(() => { try { localStorage.setItem('genealogie-theme', 'dark'); } catch (_) {} });
        const mp = await m.newPage(); watch(mp);
        await mp.goto(S.base); await mp.waitForFunction(() => window.LCNDA_EXT?.openImageDuplicates && window.LCNDA_APP?.state?.csrf);
        await mp.evaluate(() => { document.documentElement.dataset.theme = 'dark'; window.LCNDA_EXT.openImageDuplicates(); });
        await mp.waitForSelector('dialog.isim-dups .isim-group', { timeout: 30000 });
        out.narrowDups = await mp.evaluate(() => { const d = document.querySelector('dialog.isim-dups'); return { dlg: d.scrollWidth <= d.clientWidth + 1, body: document.documentElement.scrollWidth <= 391, bg: getComputedStyle(d).backgroundColor }; });
        if (shots) await mp.screenshot({ path: path.join(shots, 'imgsim-doublons-390-sombre.png') });
        await mp.click('dialog.isim-dups [data-isim-close]');
        await mp.evaluate(() => window.LCNDA_EXT.openSimilarImages({ media: { id: 1, filename: 'base.jpg', title: 'Photo de famille' } }));
        await mp.waitForSelector('dialog.isim-search .ui-card', { timeout: 20000 });
        out.narrowSearch = await mp.evaluate(() => { const d = document.querySelector('dialog.isim-search'); return { dlg: d.scrollWidth <= d.clientWidth + 1, body: document.documentElement.scrollWidth <= 391 }; });
        if (shots) await mp.screenshot({ path: path.join(shots, 'imgsim-recherche-390-sombre.png') });
        await m.close();
    } finally { out.errors = errors; await browser.close(); }
}

(async () => {
    const S = await server(dir);
    const out = {};
    try {
        out.st0 = await S.get('image_prints_status', '&algo=1');
        out.todo = await S.get('image_prints_todo', '&algo=1&limit=50');
        out.badAlgo = await S.get('image_prints_status', '&algo=abc');
        // envois forgés
        out.forged = [];
        for (const bad of [{ a: 'zz' }, { kp: Buffer.alloc(37 * 500, 1).toString('base64') }, { g: Buffer.alloc(10).toString('base64') }, { hist: 'pas du base64 !' }, { nw: 'x' }, { kp: Buffer.alloc(40).toString('base64') }]) {
            out.forged.push((await S.post('image_prints_save', { algo: 1, items: [{ media_id: 1, filename: 'base.jpg', w: 10, h: 10, print: { ...goodPrint(), ...bad } }] })).status);
        }
        out.tooMany = await S.post('image_prints_save', { algo: 1, items: Array.from({ length: 30 }, () => ({ media_id: 1, filename: 'base.jpg', print: goodPrint() })) });
        out.wrongFile = await S.post('image_prints_save', { algo: 1, items: [{ media_id: 1, filename: '../../etc/passwd', w: 1, h: 1, print: goodPrint() }] });
        out.noCsrf = await S.post('image_prints_save', { algo: 1, items: [] }, { token: '' });
        out.noCsrfMerge = await S.post('image_dup_merge', { keep: 1, others: [{ id: 2 }] }, { token: '' });
        out.mergeSelf = await S.post('image_dup_merge', { keep: 1, others: [{ id: 1 }] });
        out.mergeGhost = await S.post('image_dup_merge', { keep: 1, others: [{ id: 999 }] });
        out.mergeMode = await S.post('image_dup_merge', { keep: 1, others: [{ id: 2 }], mode: 'effacer' });
        out.undoBad = await S.post('image_dup_undo', { token: "x' OR 1=1" });
        out.dismissBad = await S.post('image_dup_dismiss', { pairs: 'tout' });
        out.mapForged = await S.post('image_dup_merge', { keep: 1, others: [{ id: 3, map: { s: 1e9, tx: 'a' } }], mode: 'version' }); // correspondance fausse : ignorée (pas d'erreur)
        out.versions = (await S.get('media_versions', '&id=1')).body;
        out.undoVersion = await S.post('image_dup_undo', { token: out.mapForged.body.token || '' });
        out.versionsAfter = (await S.get('media_versions', '&id=1')).body;
        out.dismiss = await S.post('image_dup_dismiss', { pairs: [[4, 1], [1, 4], [1, 999]] });
        out.state = await S.get('image_dup_state');
        out.undismiss = await S.post('image_dup_dismiss', { pairs: [[1, 4]], undo: true });
        out.state2 = await S.get('image_dup_state');
        await browserPart(S, out);
        fs.writeFileSync(path.join(dir, 'consultation.json'), JSON.stringify({ hash: '$2y$10$abcdefghijklmnopqrstuuWzGmJ1kGQ5JvH4sCq3zN6E1i0YqM6xG', since: 'x' }));
        out.kioskGet = await S.get('image_prints_all', '&algo=1');
        out.kioskSave = await S.post('image_prints_save', { algo: 1, items: [] });
        out.kioskMerge = await S.post('image_dup_merge', { keep: 1, others: [{ id: 2 }] });
        fs.unlinkSync(path.join(dir, 'consultation.json'));
    } finally { S.proc.kill(); }

    const B = out.browser !== undefined ? null : out;
    const K = B ? out.kinds : {};
    const checks = [
        ['état : 9 photos (le PDF n’en est pas une), toutes à calculer', () => { assert.equal(out.st0.status, 200); assert.equal(out.st0.body.total, 9); assert.equal(out.st0.body.todo, 9); assert.equal(out.todo.body.items.length, 9); assert.ok(!out.todo.body.items.some(i => /pdf$/.test(i.filename))); }],
        ['version des empreintes incorrecte : refusée', () => assert.equal(out.badAlgo.status, 422)],
        ['empreintes forgées : refusées (422)', () => assert.deepEqual(out.forged, [422, 422, 422, 422, 422, 422])],
        ['trop d’empreintes d’un coup : refusé', () => assert.equal(out.tooMany.status, 422)],
        ['fichier qui n’est pas celui du média : ignoré', () => { assert.equal(out.wrongFile.status, 200); assert.equal(out.wrongFile.body.saved, 0); }],
        ['sans jeton CSRF : refusé', () => { assert.equal(out.noCsrf.status, 419); assert.equal(out.noCsrfMerge.status, 419); }],
        ['fusion avec elle-même, photo inconnue, mode inconnu : refusés', () => { assert.equal(out.mergeSelf.status, 422); assert.equal(out.mergeGhost.status, 404); assert.equal(out.mergeMode.status, 422); }],
        ['annulation inconnue, paires mal formées : refusées', () => { assert.equal(out.undoBad.status, 422); assert.equal(out.dismissBad.status, 422); }],
        ['« en versions » : la photo écartée devient une version de la photo gardée', () => { assert.equal(out.mapForged.status, 200, JSON.stringify(out.mapForged.body)); const v = out.versions.versions.map(x => x.filename); assert.ok(v.includes('base.jpg') && v.includes('recompresse.jpg'), v.join(',')); }],
        ['« ↶ Annuler » des versions : rien ne reste', () => { assert.equal(out.undoVersion.status, 200); assert.equal(out.versionsAfter.versions.length, 1); assert.equal(out.versionsAfter.versions[0].id, 0); }],
        ['« Ce n’est pas un doublon » : gardé une fois, dans l’ordre, inconnues ignorées ; puis signalé de nouveau', () => { assert.equal(out.dismiss.body.count, 1); assert.deepEqual(out.state.body.dismissed, [[1, 4]]); assert.equal(out.undismiss.body.count, 1); assert.deepEqual(out.state2.body.dismissed, []); }],
        ['mode consultation : lecture permise, écriture refusée', () => { assert.equal(out.kioskGet.status, 200); assert.equal(out.kioskSave.status, 423); assert.equal(out.kioskMerge.status, 423); }],
    ];
    if (B) {
        const ids = rows => rows.map(r => Number(r.id));
        checks.push(
            ['tâche de fond : reprend après un rechargement, puis tout est calculé', () => { assert.equal(out.status0.fresh, 0); assert.ok(out.statusMid.fresh >= 4 && out.statusMid.fresh <= 9, JSON.stringify(out.statusMid)); assert.equal(out.status1.fresh, 9, JSON.stringify(out.status1)); }],
            ['copie identique → « identique »', () => assert.equal(K['copie.jpg'].kind, 'identique')],
            ['JPEG recompressé → très proche', () => assert.equal(K['recompresse.jpg'].kind, 'proche')],
            ['redimensionnée → très proche (redimensionnée)', () => { assert.equal(K['reduite.jpg'].kind, 'proche'); assert.equal(K['reduite.jpg'].sub, 'taille'); }],
            ['plus claire → très proche (retouchée)', () => { assert.equal(K['claire.jpg'].kind, 'proche'); assert.equal(K['claire.jpg'].sub, 'retouche'); }],
            ['en PNG → très proche (autre format)', () => { assert.equal(K['format.png'].kind, 'proche'); assert.equal(K['format.png'].sub, 'format'); }],
            ['recadrée 70 % → recadrée, au bon endroit', () => { const r = K['recadree.jpg']; assert.equal(r.kind, 'recadree'); assert.ok(Math.abs(r.zone.x - .2) < .03 && Math.abs(r.zone.y - .1) < .03 && Math.abs(r.zone.w - .7) < .03, JSON.stringify(r.zone)); }],
            ['zoomée → recadrée / zoomée, au bon endroit', () => { const r = K['zoomee.jpg']; assert.equal(r.kind, 'recadree'); assert.equal(r.sub, 'zoom'); assert.ok(Math.abs(r.zone.x - .3) < .03 && Math.abs(r.zone.w - .45) < .03, JSON.stringify(r.zone)); }],
            ['une autre photo → rien', () => assert.equal(K['autre.jpg'].kind, null)],
            ['classement : identique, puis très proches, puis recadrées ; l’autre photo absente', () => { const s = K._search; assert.equal(s[0], 'copie.jpg'); assert.ok(!s.includes('autre.jpg')); assert.ok(s.indexOf('recadree.jpg') > s.indexOf('reduite.jpg')); assert.ok(s.indexOf('zoomee.jpg') > s.indexOf('claire.jpg')); assert.equal(s.length, 7); }],
            ['visionneuse → fenêtre de recherche : 7 photos, filtres avec le nombre, aperçu côte à côte', () => { assert.equal(out.searchCards.length, 7); assert.equal(out.searchCards[0], 'Copie de la photo'); assert.ok(out.searchFilters.every(t => /\(\d+\)$/.test(t))); assert.equal(out.searchFilters[0], 'Tout (7)'); assert.equal(out.previewPair, 2); }],
            ['image de l’ordinateur (zoomée) : retrouve la photo, sans entrer dans les médias', () => { assert.ok(out.extCards.length >= 1); assert.ok(out.extCards.some(c => /^Photo de famille/.test(c) && /Zoomée|Recadrée/.test(c)), out.extCards.join('\n')); assert.ok(out.extMedia); }],
            ['doublons : un groupe avec toutes les variantes, sans l’autre photo', () => { const g = out.groups.find(x => x.names.includes('Photo de famille')); assert.ok(g); assert.equal(g.names.length, 8, g.names.join(', ')); assert.ok(!out.groups.some(x => x.names.some(n => /Autre photo/.test(n)))); }],
            ['doublons : filtres avec le nombre (parfaits, retouchés, recadrés, redimensionnés, autre format, pas des doublons, corbeille)', () => { assert.equal(out.dupFilters.length, 8); assert.match(out.dupFilters.join('|'), /Parfaits \(1\).*Retouchés \(1\).*Recadrés \/ zoomés \(1\).*Redimensionnés \(1\).*Autre format \(1\)/); }],
            ['fusion : les doublons partent, la photo gardée reste', () => { assert.deepEqual(ids(out.afterMerge.media), [1, 9, 10]); }],
            ['fusion : liens aux fiches et à l’événement réunis (sans doublon)', () => { const l = out.afterMerge.media_links.map(x => `${x.media_id}:${x.entity_type}:${x.entity_id}`).sort(); assert.deepEqual(l, ['1:event:1', '1:person:1', '1:person:2', '1:person:3']); }],
            ['fusion : étiquette, album et portrait passés sur la photo gardée', () => { assert.deepEqual(out.afterMerge.label_links.map(x => Number(x.entity_id)), [1]); assert.equal(Number(out.afterMerge.family_collection_media[0].media_id), 1); assert.equal(Number(out.afterMerge.persons.find(p => Number(p.id) === 2).portrait_media_id), 1); }],
            ['fusion : la zone du visage replacée sur la photo gardée', () => { const t = out.afterMerge.media_tags[0]; assert.equal(Number(t.media_id), 1); assert.ok(Math.abs(t.x - (20 + .7 * 10)) < 1.5 && Math.abs(t.y - (10 + .7 * 20)) < 1.5 && Math.abs(t.w - 14) < 1.2, JSON.stringify(t)); }],
            ['fusion : message avec « ↶ Annuler », corbeille des doublons', () => { assert.match(out.toast, /doublons fusionnés/); assert.match(out.trashCount, /\(1\)/); }],
            ['« ↶ Annuler » : la base revient EXACTEMENT comme avant', () => assert.deepEqual(out.afterUndo, out.dbBefore)],
            ['titre piégé : rien exécuté', () => assert.equal(out.xss, 0)],
            ['390 px, sombre : pas de défilement de côté', () => { assert.ok(out.narrowDups.dlg && out.narrowDups.body); assert.ok(out.narrowSearch.dlg && out.narrowSearch.body); assert.notEqual(out.narrowDups.bg, 'rgb(255, 255, 255)'); }],
            ['aucune erreur JavaScript', () => assert.deepEqual(out.errors, [])],
        );
    }
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
    if (!B) console.log('  – navigateur :', out.browser);
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(failed ? `${failed} échec(s)` : `${checks.length} vérifications réussies`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(1); });
