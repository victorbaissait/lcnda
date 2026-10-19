'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test de l'outil 👤 Visages (lib/faces.php, assets/js/heritage-faces.js, assets/js/faces-worker.js) :
 *     node tests/test-faces.js
 * 1. Serveur (vrai « php -S ») : l'index donne de quoi choisir les photos (photo de la personne, portrait d'une fiche,
 *    visages identifiés, personnes rattachées, étiquettes, albums, année) ; une photo sautée est notée sans effacer une
 *    analyse réussie ; envois forgés (empreinte fausse, cadres hors limites, trop de visages, raison piégée) ; mode consultation.
 * 2. Navigateur (si Playwright est installé ; sinon cette partie est sautée) : une analyse de 50 photos avec un FAUX
 *    moteur (window.LCNDA_FACES_TEST, voir faces-worker.js : pas de modèle de 13 Mo à télécharger, réseau coupé) qui
 *    occupe vraiment le processeur dans le fil à part. On mesure qu'un clic répond en moins de 200 ms pendant l'analyse,
 *    que « ■ Arrêter » répond en moins d'une demi-seconde même en plein calcul d'une photo bloquée, que la pause arrête
 *    d'avancer, que la reprise repart où on s'était arrêté, et qu'une photo qui plante ou qui traîne est sautée et notée.
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-faces-'));
const dir = path.join(tmp, 'a');
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const N = 54; // 50 photos ordinaires + une qui plante, une qui ne répond jamais, une qui bloque le calcul, une illisible
fs.mkdirSync(path.join(dir, 'media', 'mariage'), { recursive: true });
{
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Joseph','Martin','male'),('Marie','Durand','female')"); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$n = (int) getenv('FACES_N');
$img = function (string $file, int $i) {
    if (function_exists('imagecreatetruecolor')) {
        $w = 1800 + ($i % 5) * 100; $h = 1300; $im = imagecreatetruecolor($w, $h);
        imagefill($im, 0, 0, imagecolorallocate($im, 40 + $i * 3 % 200, 90, 160 - $i % 100));
        for ($k = 0; $k < 6; $k++) imagefilledellipse($im, 200 + $k * 260, 500 + ($i * 37 + $k * 91) % 400, 220, 280, imagecolorallocate($im, 230, 190 - $k * 9, 160));
        imagejpeg($im, $file, 82); imagedestroy($im);
    } else { file_put_contents($file, base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=')); }
};
$ins = $pdo->prepare("INSERT INTO media(title, filename, media_type, date_text, is_person_photo) VALUES(?,?,?,?,?)");
for ($i = 1; $i <= $n; $i++) {
    $name = match ($i) { 12 => 'plante.jpg', 20 => 'bloque.jpg', 30 => 'occupe.jpg', 40 => 'illisible.jpg', default => ($i <= 4 ? 'mariage/' : '') . sprintf('photo-%02d.jpg', $i) };
    if ($name === 'illisible.jpg') file_put_contents(MEDIA_DIR . '/' . $name, 'pas une image'); else $img(MEDIA_DIR . '/' . $name, $i);
    $title = $i === 7 ? '<img src=x onerror="window.__xss=1">Noce' : "Photo $i";
    $ins->execute([$title, $name, 'image', $i === 5 ? 'vers 1925' : ($i === 6 ? 'entre 1950 et 1952' : ''), $i === 3 ? 1 : 0]);
}
$pdo->exec("INSERT INTO media(title, filename, media_type) VALUES('Un acte en PDF','acte.pdf','document')");
$pdo->exec("UPDATE persons SET portrait_media_id=8 WHERE id=1");
$pdo->exec("INSERT INTO labels(name,color) VALUES('Portraits de famille','#c00'),('Paysages','#0c0')");
$pdo->exec("INSERT INTO label_links(label_id,entity_type,entity_id) VALUES(1,'media',9),(2,'media',10)");
$pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id,collection_label) VALUES(1,'person',2,'Album du mariage'),(2,'person',2,'')");
$pdo->exec("INSERT INTO media_tags(media_id,person_id,x,y,w,h,confidence) VALUES(11,1,10,20,18,24,'certain')");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: { ...envFor(dir), FACES_N: String(N) } });
    if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
}

const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
async function server(d) {
    const port = Number(process.env.FACES_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(d), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async action => { const r = await fetch(base + 'api.php?action=' + action, { headers: { Cookie: cookie } }); return { status: r.status, body: await r.json() }; };
    const post = async (action, body, raw = null) => {
        const r = await fetch(base + 'api.php?action=' + action, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: raw ?? JSON.stringify({ ...body, csrf }) });
        return { status: r.status, body: await r.json().catch(() => ({})) };
    };
    return { proc, base, port, csrf, get, post };
}
const desc = (seed = 1) => { const v = new Float32Array(128); for (let i = 0; i < 128; i++) v[i] = Math.sin(seed * (i + 1)) * .09; return Buffer.from(v.buffer).toString('base64'); };
const byId = (idx, id) => idx.media.find(m => m.id === id);

async function browserPart(S, out) {
    let pw = null;
    for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!pw) { out.browser = 'sauté (Playwright absent)'; return; }
    const browser = await pw.chromium.launch();
    const errors = [];
    try {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        await ctx.addInitScript(() => { window.LCNDA_FACES_TEST = { engine: 'mock', ms: 220, crash: 'plante', hang: 'bloque', busy: 'occupe', timeout: 1500 }; });
        await ctx.route(/cdn\.jsdelivr\.net/, r => r.abort()); // pas de réseau : le vrai modèle n'est jamais demandé
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(String(e.message)));
        page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
        await page.goto(S.base);
        await page.waitForFunction(() => window.LCNDA_EXT?.openFaces && window.LCNDA_APP?.api);
        // la liste Médias : un seul bouton « 👤 Visages »
        await page.evaluate(() => { window.LCNDA_APP.state.listType = 'media'; return window.LCNDA_APP.renderList?.('media'); }).catch(() => {});
        await page.waitForTimeout(600);
        out.buttons = await page.evaluate(() => [...document.querySelectorAll('.media-list-actions button')].map(b => b.textContent.trim()));
        const viaButton = await page.$('#media-face-detect-btn');
        if (viaButton) await viaButton.click(); else await page.evaluate(() => window.LCNDA_EXT.openFaces());
        await page.waitForSelector('dialog.h-faces [data-fc-go]');
        out.defaultSrc = await page.$eval('dialog.h-faces input[name=fc_src]:checked', i => i.value);
        out.markedBadge = await page.$eval('dialog.h-faces input[value=marked]', i => i.closest('.fc-src').querySelector('.fc-badge')?.textContent);
        await page.click('dialog.h-faces input[value=all]');
        out.goLabel = await page.textContent('dialog.h-faces [data-fc-go]');
        // la réactivité : on mesure le délai d'un clic (de l'entrée souris au traitement) et les longues tâches
        await page.evaluate(() => {
            window.__lat = []; window.__long = [];
            window.__paint = [];
            document.addEventListener('click', e => { window.__lat.push(performance.now() - e.timeStamp); }, true);
            // de l'entrée souris jusqu'à l'image suivante peinte, après le traitement du clic
            window.addEventListener('click', e => { const t = e.timeStamp; requestAnimationFrame(() => setTimeout(() => window.__paint.push(performance.now() - t), 0)); });
            // la page est-elle restée libre ? un minuteur toutes les 10 ms : le plus grand trou entre deux tours
            window.__gap = 0; let last = performance.now(); window.__iv = setInterval(() => { const n = performance.now(); window.__gap = Math.max(window.__gap, n - last); last = n; }, 10);
        });
        await page.click('dialog.h-faces [data-fc-go]');
        await page.waitForSelector('dialog.h-faces [data-fc-stop]');
        // pendant l'analyse : des clics sur les onglets ①/②, chacun doit répondre (DOM changé et image peinte) en moins de 200 ms
        out.clicks = [];
        for (let k = 0; k < 10; k++) {
            const which = k % 2 ? 'find' : 'who';
            const t0 = Date.now();
            await page.click(`dialog.h-faces [data-fc-step=${which}]`);
            await page.waitForFunction(w => document.querySelector(`dialog.h-faces [data-fc-step=${w}]`)?.classList.contains('is-active'), which);
            await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));
            out.clicks.push(Date.now() - t0);
            await page.waitForTimeout(250);
        }
        out.progressDuring = await page.$eval('dialog.h-faces .h-faces-progress small', e => e.textContent);
        out.speedText = await page.$eval('dialog.h-faces .fc-run-speed', e => e.textContent);
        // pause : le compteur cesse d'avancer (après la photo en cours), puis reprise
        await page.click('dialog.h-faces [data-fc-pause]');
        await page.waitForTimeout(700);
        const p1 = await page.$eval('dialog.h-faces .h-faces-progress small', e => e.textContent);
        await page.waitForTimeout(900);
        const p2 = await page.$eval('dialog.h-faces .h-faces-progress small', e => e.textContent);
        out.pause = { p1, p2, label: await page.textContent('dialog.h-faces [data-fc-pause]') };
        await page.click('dialog.h-faces [data-fc-pause]');
        // la photo « occupe » bloque le calcul 60 s : « ■ Arrêter » doit répondre tout de suite
        await page.waitForFunction(() => /occupe|Photo 30\b/.test(document.querySelector('dialog.h-faces [data-fc-runtxt]')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(300);
        out.stopCurrent = await page.$eval('dialog.h-faces [data-fc-runtxt]', e => e.textContent).catch(() => '');
        out.stopMs = await page.evaluate(() => new Promise(res => {
            const t0 = performance.now(); document.querySelector('dialog.h-faces [data-fc-stop]').click();
            const check = () => (/arrêtée/.test(document.querySelector('dialog.h-faces [data-fc-run]')?.textContent || '') || document.querySelector('dialog.h-faces [data-fc-run]')?.hidden ? res(performance.now() - t0) : requestAnimationFrame(check)); check();
        }));
        await page.waitForSelector('dialog.h-faces [data-fc-resume]', { timeout: 10000 });
        out.resumeText = await page.textContent('dialog.h-faces .fc-resume');
        out.latencies = await page.evaluate(() => window.__lat.slice());
        out.paint = await page.evaluate(() => window.__paint.slice());
        out.maxGap = await page.evaluate(() => { clearInterval(window.__iv); return Math.round(window.__gap); });
        // fermer, rouvrir : la reprise est proposée, et repart où on s'était arrêté
        await page.click('dialog.h-faces [data-fc-close]');
        await page.evaluate(() => window.LCNDA_EXT.openFaces());
        await page.waitForSelector('dialog.h-faces [data-fc-resume]');
        await page.click('dialog.h-faces [data-fc-resume]');
        out.resumeStart = await page.$eval('dialog.h-faces .h-faces-progress small', e => e.textContent);
        await page.waitForFunction(() => document.querySelector('dialog.h-faces [data-fc-run]')?.hidden && document.querySelector('dialog.h-faces [data-fc-go]'), null, { timeout: 90000 });
        await page.waitForTimeout(400);
        out.afterAll = await page.evaluate(() => window.LCNDA_APP.api('faces_index'));
        out.photosList = await page.$$eval('dialog.h-faces .fc-photo', l => l.length);
        out.xss = await page.evaluate(() => window.__xss || 0);
        // beaucoup de visages : la comparaison passe dans un fil à part et donne le même résultat
        out.bigAnalyse = await page.evaluate(async () => {
            const F = window.LCNDA_EXT.faceInternals, v = s => { const a = new Float32Array(128); for (let i = 0; i < 128; i++) a[i] = Math.sin(s * (i + 1)) * .09 + (s % 7) * .001; return F.b64(a); };
            const prints = Array.from({ length: 600 }, (_, i) => ({ id: i + 1, media_id: i + 1, x: 1, y: 1, w: 5, h: 5, d: v(1 + (i % 40)), status: '', person_id: i < 40 ? 1000 + i : null, person_name: 'P' + i }));
            const t0 = performance.now(); let maxGap = 0, last = performance.now(); const tick = setInterval(() => { const n = performance.now(); maxGap = Math.max(maxGap, n - last); last = n; }, 10);
            const a = await F.analyseAsync({ prints }); clearInterval(tick); const b = F.analyse({ prints });
            return { same: a.props.length === b.props.length && a.groups.length === b.groups.length && a.byPerson.size === b.byPerson.size, props: a.props.length, maxGap: Math.round(maxGap), ms: Math.round(performance.now() - t0) };
        });
        await page.screenshot({ path: path.join(tmp, 'faces-find.png') });
        // les autres choix : période (C4, texte libre), album ou dossier, sans sauter les photos déjà analysées
        await page.click('dialog.h-faces [data-fc-onlynew]');
        await page.click('dialog.h-faces input[value=period]');
        await page.fill('dialog.h-faces [data-fc-period] input', 'entre 1920 et 1952');
        out.period = await page.textContent('dialog.h-faces [data-fc-go]');
        out.periodHelp = await page.textContent('dialog.h-faces [data-fc-period] .ui-date-help').catch(() => '');
        await page.click('dialog.h-faces input[value=album]');
        await page.selectOption('dialog.h-faces [data-fc-album]', 'mariage');
        out.album = await page.textContent('dialog.h-faces [data-fc-go]');
        await page.click('dialog.h-faces input[value=recent]');
        await page.fill('dialog.h-faces [data-fc-recent]', '7');
        out.recent = await page.textContent('dialog.h-faces [data-fc-go]');
        await page.click('dialog.h-faces [data-fc-onlynew]');
        await page.click('dialog.h-faces [data-fc-step=who]');
        out.whoFilters = await page.$$eval('dialog.h-faces .fc-filters button', l => l.map(b => b.textContent));
        await page.screenshot({ path: path.join(tmp, 'faces-who.png') });
        // ouvrir une photo pour l'identifier : la visionneuse s'ouvre avec les cadres proposés
        await page.click('dialog.h-faces [data-fc-step=find]');
        await page.click('dialog.h-faces .fc-photo .button[data-fc-openmedia]');
        await page.waitForTimeout(1200);
        out.lightbox = await page.evaluate(() => ({ open: !!document.getElementById('lightbox')?.open, boxes: document.querySelectorAll('#lightbox-tag-canvas .face-suggestion-box').length }));
        // 390 px et mode sombre
        const m = await browser.newContext({ viewport: { width: 390, height: 800 }, colorScheme: 'dark' });
        await m.addInitScript(() => { window.LCNDA_FACES_TEST = { engine: 'mock', ms: 50 }; try { localStorage.setItem('lcnda-theme', 'dark'); } catch (_) {} });
        const mp = await m.newPage(); mp.on('pageerror', e => errors.push(String(e.message)));
        await mp.goto(S.base); await mp.waitForFunction(() => window.LCNDA_EXT?.openFaces);
        await mp.evaluate(() => { document.documentElement.dataset.theme = 'dark'; window.LCNDA_EXT.openFaces(); });
        await mp.waitForSelector('dialog.h-faces [data-fc-go]');
        out.narrow = await mp.evaluate(() => { const d = document.querySelector('dialog.h-faces'); return { dlg: d.scrollWidth <= d.clientWidth + 1, body: document.documentElement.scrollWidth <= 391 }; });
        await mp.screenshot({ path: path.join(tmp, 'faces-390-dark.png'), fullPage: false });
        // fermer en pleine analyse (et cliquer deux fois sur Analyser) : rien ne casse, la reprise est proposée
        await mp.click('dialog.h-faces [data-fc-onlynew]');
        await mp.click('dialog.h-faces input[value=all]');
        await mp.dblclick('dialog.h-faces [data-fc-go]');
        await mp.waitForSelector('dialog.h-faces [data-fc-stop]');
        await mp.waitForTimeout(400);
        await mp.click('dialog.h-faces [data-fc-close]');
        out.closedMid = await mp.evaluate(() => !document.querySelector('dialog.h-faces'));
        await mp.evaluate(() => window.LCNDA_EXT.openFaces());
        out.reopenResume = await mp.waitForSelector('dialog.h-faces [data-fc-resume]', { timeout: 5000 }).then(() => true, () => false);
        await mp.click('dialog.h-faces [data-fc-forget]');
        out.forgot = await mp.$('dialog.h-faces [data-fc-resume]').then(x => !x);
        await m.close();
    } finally { out.errors = errors; await browser.close(); }
}

(async () => {
    const S = await server(dir);
    const out = {};
    try {
        out.idx0 = (await S.get('faces_index')).body;
        out.okScan = await S.post('save_face_scan', { media_id: 15, faces: [{ x: 10, y: 10, w: 20, h: 25, score: .9, d: desc(1) }, { x: 50, y: 10, w: 20, h: 25, score: .8, d: desc(2) }], model: 'test' });
        out.skipAfterOk = await S.post('save_face_scan', { media_id: 15, skipped: 'trop longue' });
        out.skipNew = await S.post('save_face_scan', { media_id: 16, skipped: '<script>alert(1)</script>' + 'x'.repeat(500) });
        out.forged = await S.post('save_face_scan', { media_id: 17, faces: [{ x: -50, y: 900, w: 1e9, h: 'abc', d: desc(3) }, { x: 1, y: 1, w: 5, h: 5, d: 'pas-une-empreinte' }, { x: 1, y: 1, w: 5, h: 5, d: Buffer.alloc(100).toString('base64') }, 'texte', null] });
        out.many = await S.post('save_face_scan', { media_id: 18, faces: Array.from({ length: 500 }, (_, i) => ({ x: i % 90, y: 1, w: 3, h: 3, d: desc(i + 1) })) });
        out.ghost = await S.post('save_face_scan', { media_id: 99999, faces: [] });
        out.notJson = await S.post('save_face_scan', null, '{"media_id": 15, nope');
        out.idx1 = (await S.get('faces_index')).body;
        await browserPart(S, out);
        fs.writeFileSync(path.join(dir, 'consultation.json'), JSON.stringify({ hash: '$2y$10$abcdefghijklmnopqrstuuWzGmJ1kGQ5JvH4sCq3zN6E1i0YqM6xG', since: 'x' }));
        out.kioskGet = await S.get('faces_index');
        out.kioskPost = await S.post('save_face_scan', { media_id: 19, skipped: 'x' });
        fs.unlinkSync(path.join(dir, 'consultation.json'));
    } finally { S.proc.kill(); }

    const B = out.browser !== undefined ? null : out;
    const checks = [
        ['index : seulement les images, avec de quoi choisir', () => { const ix = out.idx0; assert.equal(ix.media.length, N); assert.ok(!ix.media.some(m => m.filename === 'acte.pdf')); }],
        ['photo de la personne et portrait d’une fiche', () => { assert.equal(byId(out.idx0, 3).portrait, true); assert.equal(byId(out.idx0, 8).portrait, true); assert.equal(byId(out.idx0, 9).portrait, false); }],
        ['visages identifiés, personnes rattachées', () => { assert.equal(byId(out.idx0, 11).tagged, 1); assert.deepEqual(byId(out.idx0, 11).people, [1]); assert.deepEqual(byId(out.idx0, 1).people, [2]); }],
        ['étiquettes, étiquette « portrait » repérée', () => { assert.deepEqual(byId(out.idx0, 9).labels, [1]); assert.deepEqual(out.idx0.face_labels, [1]); }],
        ['albums et dossiers', () => { assert.deepEqual(byId(out.idx0, 1).albums, ['Album du mariage', 'mariage']); assert.deepEqual(byId(out.idx0, 3).albums, ['mariage']); assert.deepEqual(byId(out.idx0, 9).albums, []); }],
        ['année d’après la date', () => { assert.equal(byId(out.idx0, 5).year, 1925); assert.equal(byId(out.idx0, 6).year, 1950); assert.equal(byId(out.idx0, 9).year, null); }],
        ['analyse enregistrée', () => { assert.equal(out.okScan.status, 200); assert.equal(out.okScan.body.result?.faces ?? out.okScan.body.faces, 2); }],
        ['sautée après une analyse réussie : les visages restent', () => { assert.equal(out.skipAfterOk.status, 200); const m = byId(out.idx1, 15); assert.equal(m.scanned, true); assert.equal(m.skipped, ''); assert.equal(out.idx1.prints.filter(p => p.media_id === 15).length, 2); }],
        ['photo sautée : notée, raison raccourcie', () => { const m = byId(out.idx1, 16); assert.equal(m.scanned, false); assert.ok(m.skipped.length > 0 && m.skipped.length <= 80, m.skipped); }],
        ['envoi forgé : rien d’abîmé', () => { assert.equal(out.forged.status, 200); const p = out.idx1.prints.filter(q => q.media_id === 17); assert.equal(p.length, 1); assert.ok(p[0].x >= 0 && p[0].y <= 100 && p[0].w <= 100 && p[0].h > 0); }],
        ['trop de visages : 80 au plus', () => assert.equal(out.idx1.prints.filter(p => p.media_id === 18).length, 80)],
        ['photo inconnue, JSON illisible : refusés', () => { assert.ok(out.ghost.status >= 400); assert.ok(out.notJson.status >= 400); }],
        ['mode consultation : lecture permise, écriture refusée', () => { assert.equal(out.kioskGet.status, 200); assert.equal(out.kioskPost.status, 423); }],
    ];
    if (B) checks.push(
        ['liste Médias : un seul bouton « 👤 Visages »', () => { if (!out.buttons.length) return; assert.ok(out.buttons.includes('👤 Visages'), out.buttons.join(' | ')); assert.ok(!out.buttons.some(b => /Détection de visage|Qui est qui/.test(b))); }],
        ['choix par défaut : le plus léger (photos marquées)', () => { assert.equal(out.defaultSrc, 'marked'); assert.match(out.markedBadge, /^4 à analyser/); }],
        ['toutes les nouvelles photos : 50 à analyser (4 déjà faites plus haut)', () => assert.match(out.goLabel, /Analyser 50 photos/)],
        ['pendant l’analyse : chaque clic répond en moins de 200 ms', () => { assert.ok(out.clicks.length === 10); assert.ok(Math.max(...out.paint) < 200, out.paint.map(Math.round).join(', ')); assert.ok(Math.max(...out.latencies) < 200, out.latencies.map(Math.round).join(', ')); }],
        ['pendant l’analyse : la page n’est jamais bloquée plus de 200 ms', () => assert.ok(out.maxGap < 200, String(out.maxGap))],
        ['vitesse et temps restant affichés', () => assert.match(out.speedText, /s par photo · reste ≈ /)],
        ['pause : on n’avance plus, puis reprise', () => { assert.equal(out.pause.p1, out.pause.p2); assert.match(out.pause.label, /Reprendre/); }],
        ['« ■ Arrêter » en plein calcul bloqué : moins d’une demi-seconde', () => { assert.match(out.stopCurrent, /Photo 30/); assert.ok(out.stopMs < 500, String(out.stopMs)); }],
        ['après l’arrêt : la reprise est proposée', () => assert.match(out.resumeText, /restantes? sur 50/)],
        ['reprise : repart où on s’était arrêté', () => { const [done] = out.resumeStart.split('/').map(s => Number(s.replace(/\D/g, ''))); assert.ok(done >= 20, out.resumeStart); }],
        ['photo qui plante, qui ne répond pas, illisible : sautées et notées', () => { const sk = out.afterAll.media.filter(m => m.skipped).map(m => m.filename).sort(); for (const f of ['bloque.jpg', 'illisible.jpg', 'plante.jpg']) assert.ok(sk.includes(f), sk.join(',')); }],
        ['toutes les autres analysées', () => { const left = out.afterAll.media.filter(m => !m.scanned && !m.skipped); assert.equal(left.length, 0, left.map(m => m.filename).join(',')); }],
        ['les photos avec des visages à nommer sont listées', () => assert.ok(out.photosList > 10)],
        ['période « entre 1920 et 1952 » : 2 photos, date comprise', () => { assert.match(out.period, /Analyser 2 photos/); assert.match(out.periodHelp, /Compris/); }],
        ['album ou dossier « mariage » : 4 photos', () => assert.match(out.album, /Analyser 4 photos/)],
        ['les 7 plus récentes', () => assert.match(out.recent, /Analyser 7 photos/)],
        ['② Qui est-ce ? : filtres avec le nombre', () => { assert.equal(out.whoFilters.length, 4); assert.ok(out.whoFilters.every(t => /\(\d/.test(t))); }],
        ['ouvrir et identifier : visionneuse avec les cadres', () => { assert.equal(out.lightbox.open, true); assert.ok(out.lightbox.boxes > 0); }],
        ['600 visages : comparaison dans un fil à part, même résultat, page libre', () => { assert.equal(out.bigAnalyse.same, true); assert.ok(out.bigAnalyse.props > 0); assert.ok(out.bigAnalyse.maxGap < 200, JSON.stringify(out.bigAnalyse)); }],
        ['titre piégé : rien exécuté', () => assert.equal(out.xss, 0)],
        ['fermer en pleine analyse : reprise proposée, « Abandonner » l’oublie', () => { assert.ok(out.closedMid); assert.ok(out.reopenResume); assert.ok(out.forgot); }],
        ['390 px : pas de défilement de côté', () => { assert.ok(out.narrow.dlg); assert.ok(out.narrow.body); }],
        ['aucune erreur JavaScript', () => assert.deepEqual(out.errors, [])],
    );
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
    if (!B) console.log('  – navigateur :', out.browser);
    if (process.env.FACES_SHOTS) { for (const f of ['faces-find.png', 'faces-who.png', 'faces-390-dark.png']) { try { fs.copyFileSync(path.join(tmp, f), path.join(process.env.FACES_SHOTS, f)); } catch (_) {} } }
    if (B) console.log(`  (clic → image peinte : ${out.paint.map(Math.round).join(', ')} ms ; aller-retour Playwright : ${out.clicks.join(', ')} ms ; arrêt : ${Math.round(out.stopMs)} ms ; plus long blocage de la page : ${out.maxGap} ms)`);
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(failed ? `${failed} échec(s)` : `${checks.length} vérifications réussies`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(1); });
