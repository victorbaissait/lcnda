'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📑 F13 Lire une table décennale (assets/js/heritage-decennales.js) et 🔍 F15 Comparer deux photos
 * (assets/js/heritage-photo-compare.js, lib/photo_compare.php) :   node tests/test-f13-f15.js
 *  1. serveur (vrai « php -S », base neuve) : comparaisons enregistrées (deux photos obligatoires et différentes, personnes
 *     forgées ou disparues écartées, réglages bornés, mode forgé → côte à côte, liste filtrée par média et par personne,
 *     renommer, supprimer puis « ↶ Annuler » par restore_last_delete), empreintes de visages des deux photos, jeton CSRF ;
 *  2. navigateur (Playwright ; sinon sauté) :
 *     - F13 : une table décennale synthétique fabriquée pour le test (canevas). Si le moteur Tesseract est disponible hors
 *       ligne (LCNDA_TESS_DIR : le dossier qui contient core/package/tesseract-core-lstm.wasm.js et
 *       eng/package/4.0.0_best_int/eng.traineddata.gz), il est servi au navigateur à la place d'internet et la table est lue
 *       pour de vrai ; sinon le parcours manuel est testé (moteur introuvable → message clair, saisie à la main). Toujours :
 *       table « à la main » sans HTR installé → message et grille rapide ; dates comprises (C4, année de la table) ; création
 *       du dépouillement « Table décennale » (lignes, zones, photo reliée), « ↶ Annuler » puis « ↷ Rétablir » ; fiche créée
 *       avec sa naissance puis annulée ; fiche reliée par le menu de choix ;
 *     - F15 : outil ouvert sur deux photos, ressemblance prudente (« ce n’est pas une preuve »), côte à côte / fondu / rideau,
 *       yeux posés en deux clics par photo → alignement, noir et blanc, notes, « 💾 Enregistrer » (relié aux médias et aux
 *       personnes), rouvert depuis Listes → Outils de modification, portes d'entrée (visionneuse, Médias, fiche, Comparaison) ;
 *     - 1440 px, 390 px et mode sombre : aucune erreur JavaScript, pas de défilement horizontal.
 * Captures : SHOTS=dossier ; port : F13_PORT (20266 par défaut) ; données : F13_DIR (sinon un dossier temporaire).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
if (!phpPath) { console.log('— PHP absent : test sauté'); process.exit(0); }
const SHOTS = process.env.SHOTS || '';
const root = process.env.F13_DIR ? path.resolve(process.env.F13_DIR) : fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-f13-'));
const dir = path.join(root, 'data');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
const TESS = process.env.LCNDA_TESS_DIR || '';
const tessFiles = TESS ? { core: path.join(TESS, 'core/package/tesseract-core-lstm.wasm.js'), eng: path.join(TESS, 'eng/package/4.0.0_best_int/eng.traineddata.gz') } : null;
const hasTess = !!tessFiles && fs.existsSync(tessFiles.core) && fs.existsSync(tessFiles.eng);

// deux empreintes de visage proches (même personne ?) et une lointaine, en base64 (128 nombres flottants)
const vec = seed => { const a = new Float32Array(128); let x = seed; for (let i = 0; i < 128; i++) { x = (x * 9301 + 49297) % 233280; a[i] = (x / 233280 - .5) * .18; } return a; };
const near = v => { const a = Float32Array.from(v); for (let i = 0; i < 128; i += 4) a[i] += .03; return a; };
const b64 = a => Buffer.from(a.buffer).toString('base64');
const dA = vec(7), dB = near(dA), dC = vec(99);

{ const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Martin','male'),('Marie','Borie','female'),('Louis','Bernard','male')");
$p = null; require 'lib/bootstrap.php'; $pdo = db();
$mk = function (string $f, array $c) { $im = imagecreatetruecolor(900, 1100); imagefill($im, 0, 0, imagecolorallocate($im, $c[0], $c[1], $c[2]));
    $skin = imagecolorallocate($im, 225, 190, 160); imagefilledellipse($im, 450, 520, 420, 560, $skin); $dark = imagecolorallocate($im, 40, 30, 30);
    imagefilledellipse($im, 370, 470, 60, 34, $dark); imagefilledellipse($im, 530, 470, 60, 34, $dark); imagefilledrectangle($im, 400, 650, 500, 670, $dark); imagejpeg($im, MEDIA_DIR . '/' . $f, 88); };
$mk('portrait-a.jpg', [120, 140, 180]); $mk('portrait-b.jpg', [170, 150, 120]); $mk('portrait-c.jpg', [90, 160, 110]);
$pdo->exec("INSERT INTO media(title, filename, media_type, is_person_photo) VALUES('Jean en 1910','portrait-a.jpg','image',1),('Jean vers 1940','portrait-b.jpg','image',1),('Inconnu','portrait-c.jpg','image',0)");
$pdo->exec("INSERT INTO media_links(media_id, entity_type, entity_id) VALUES(1,'person',1),(2,'person',1)");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
  if (r.status !== 0 || !String(r.stdout).includes('ok')) { console.error(r.stderr || r.stdout); process.exit(1); } }

let failed = 0;
let current = null;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); if (SHOTS && current) await current.screenshot({ path: path.join(SHOTS, 'echec-' + failed + '.png') }).catch(() => {}); } };
const ROWS = [['MARTIN', 'Jean Pierre', '12 mars 1855'], ['DUPONT', 'Marie Louise', '3 janvier 1856'], ['BERNARD', 'Louis', '27/07/1857'], ['ROBERT', 'Anne', '14 mai 1858'], ['PETIT', 'Paul Henri', '9 juin 1859'], ['DURAND', 'Jeanne', '30 octobre 1860']];

(async () => {
    const port = Number(process.env.F13_PORT) || 20266;
    { const busy = await new Promise(res => { const c = require('node:net').connect(port, '127.0.0.1'); c.on('connect', () => { c.destroy(); res(true); }); c.on('error', () => res(false)); }); if (busy) { console.error(`Le port ${port} est déjà pris (F13_PORT pour en choisir un autre).`); process.exit(1); } }
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (action, q = {}) => { const r = await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } }); return { status: r.status, ...(await r.json().catch(() => ({}))) }; };
    const post = async (action, body, token = csrf) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf: token }) }); const j = await r.json().catch(() => ({})); return { status: r.status, body: j }; };
    const ids = {};
    try {
        await t('F15 serveur : empreintes de visages des deux photos', async () => {
            assert.equal((await post('save_face_scan', { media_id: 1, model: 'test', faces: [{ x: 25, y: 20, w: 50, h: 55, score: .99, d: b64(dA) }] })).status, 200);
            assert.equal((await post('save_face_scan', { media_id: 2, model: 'test', faces: [{ x: 25, y: 20, w: 50, h: 55, score: .99, d: b64(dB) }] })).status, 200);
            assert.equal((await post('save_face_scan', { media_id: 3, model: 'test', faces: [{ x: 25, y: 20, w: 50, h: 55, score: .99, d: b64(dC) }] })).status, 200);
            const f = await get('photo_compare_faces', { a: 1, b: 2 });
            assert.equal(f.a.length, 1); assert.equal(f.b.length, 1); assert.equal(f.a[0].d, b64(dA));
            assert.deepEqual((await get('photo_compare_faces', { a: 'x', b: -4 })), { status: 200, a: [], b: [] });
        });
        await t('F15 serveur : enregistrer (photos obligatoires et différentes, personnes forgées écartées, réglages bornés)', async () => {
            assert.equal((await post('photo_comparison_write', { op: 'save', media_a: 1, media_b: 1 })).status, 422, 'la même photo deux fois');
            assert.equal((await post('photo_comparison_write', { op: 'save', media_a: 1, media_b: 999 })).status, 422, 'photo inconnue');
            assert.equal((await post('photo_comparison_write', { op: 'save', media_a: 1, media_b: 2, people: 5 })).status, 422, 'personnes : une liste');
            assert.equal((await post('photo_comparison_write', { op: 'pirate', media_a: 1, media_b: 2 })).status, 422);
            assert.ok([403, 419].includes((await post('photo_comparison_write', { op: 'save', media_a: 1, media_b: 2 }, 'mauvais-jeton')).status), 'jeton CSRF');
            const r = await post('photo_comparison_write', { op: 'save', media_a: 1, media_b: 2, people: [1, '2', 9999, 'abc', 1], notes: 'Même nez', mode: '<script>', score: 250, verdict: 'Ressemblance forte — ce n’est pas une preuve',
                settings: { eyes: { a: [[.4, .42], [.6, .42]], b: [[2, 'x'], [.5, .5]] }, contrast: 9999, gray: 1, evil: 'x' } });
            assert.equal(r.status, 200, JSON.stringify(r.body)); const c = r.body.comparison; ids.c1 = c.id;
            assert.deepEqual(c.people.map(p => p.id), [1, 2]); assert.equal(c.mode, 'side'); assert.equal(c.score, 100);
            assert.equal(c.title, 'Jean en 1910 ↔ Jean vers 1940'); assert.equal(c.media_a.filename, 'portrait-a.jpg');
            assert.deepEqual(c.settings.eyes, { a: [[.4, .42], [.6, .42]] }, 'yeux forgés de B écartés'); assert.equal(c.settings.contrast, 300); assert.equal(c.settings.gray, true); assert.equal(c.settings.evil, undefined);
            ids.c2 = (await post('photo_comparison_write', { op: 'save', media_a: 3, media_b: 2, people: [3], mode: 'curtain' })).body.comparison.id;
        });
        await t('F15 serveur : liste (par photo, par personne), renommer, supprimer puis « ↶ Annuler »', async () => {
            assert.equal((await get('photo_comparisons')).items.length, 2);
            assert.deepEqual((await get('photo_comparisons', { media_id: 1 })).items.map(i => i.id), [ids.c1]);
            assert.deepEqual((await get('photo_comparisons', { person_id: 3 })).items.map(i => i.id), [ids.c2]);
            assert.equal((await post('photo_comparison_write', { op: 'rename', id: ids.c1, title: '' })).status, 422);
            assert.equal((await post('photo_comparison_write', { op: 'rename', id: ids.c1, title: 'Jean jeune et vieux' })).status, 200);
            assert.equal((await get('photo_comparison', { id: ids.c1 })).comparison.title, 'Jean jeune et vieux');
            assert.equal((await post('photo_comparison_write', { op: 'delete', id: ids.c2 })).status, 200);
            assert.equal((await get('photo_comparison', { id: ids.c2 })).status, 404);
            assert.equal((await post('restore_last_delete', { entity_type: 'photo_comparison', entity_id: ids.c2 })).status, 200);
            const back = (await get('photo_comparison', { id: ids.c2 })).comparison;
            assert.equal(back.mode, 'curtain'); assert.deepEqual(back.people.map(p => p.id), [3]);
            assert.equal((await post('restore_last_delete', { entity_type: 'photo_comparison', entity_id: ids.c2 })).status, 422, 'pas deux fois');
        });

        let pw = null; try { pw = require('playwright'); } catch (_) { try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch (_) { pw = null; } }
        if (!pw) { console.log('— Playwright absent : partie navigateur sautée'); return; }
        const browser = await pw.chromium.launch();
        const errors = [];
        const newPage = async ({ width = 1440, height = 900, dark = false, tess = true } = {}) => {
            const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? 'dark' : 'light' });
            const page = await ctx.newPage();
            page.on('pageerror', e => errors.push(`${width}${dark ? ' sombre' : ''} : ${e.message}`));
            page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errors.push(`${width} console : ${m.text()}`); });
            // rien ne sort vers internet ; le moteur de lecture, s'il est là, vient du disque (mêmes fichiers, même empreinte)
            await page.route(u => !u.toString().startsWith(base) && !/^(data|blob):/.test(u.toString()), async r => {
                const u = r.request().url();
                if (tess && hasTess && u.includes('tesseract-core-lstm.wasm.js')) return r.fulfill({ body: fs.readFileSync(tessFiles.core), contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } });
                if (tess && hasTess && /@tesseract\.js-data\/\w+\/4\.0\.0_best_int\/\w+\.traineddata\.gz/.test(u)) return r.fulfill({ body: fs.readFileSync(tessFiles.eng), contentType: 'application/octet-stream', headers: { 'access-control-allow-origin': '*' } });
                return r.abort();
            });
            await page.goto(base, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap && window.LCNDA_EXT?.openDecennale && window.LCNDA_EXT?.openPhotoCompare, null, { timeout: 30000 });
            if (dark) await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
            return page;
        };
        const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); } };
        const noHScroll = async (page, what) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${what} : défilement horizontal`);
        const page = await newPage(); current = page;

        // la table synthétique, fabriquée pour le test (canevas → PNG dans les médias)
        const png = await page.evaluate(rows => { const c = document.createElement('canvas'); c.width = 1400; c.height = 900; const g = c.getContext('2d'); g.fillStyle = '#fbf8f0'; g.fillRect(0, 0, 1400, 900); g.fillStyle = '#222';
            g.font = 'bold 34px DejaVu Serif, serif'; g.fillText('TABLE DECENNALE DES NAISSANCES 1853-1862', 170, 60);
            g.font = 'bold 26px DejaVu Sans, sans-serif'; g.fillText('NOMS', 120, 130); g.fillText('PRENOMS', 560, 130); g.fillText('DATES', 1060, 130);
            g.strokeStyle = '#444'; g.lineWidth = 2; [80, 500, 980, 1320].forEach(x => { g.beginPath(); g.moveTo(x, 95); g.lineTo(x, 860); g.stroke(); }); g.beginPath(); g.moveTo(80, 150); g.lineTo(1320, 150); g.stroke();
            g.font = '30px DejaVu Sans, sans-serif'; rows.forEach((r, i) => { const y = 210 + i * 100; g.fillText(r[0], 110, y); g.fillText(r[1], 530, y); g.fillText(r[2], 1010, y); g.strokeStyle = '#bbb'; g.lineWidth = 1; g.beginPath(); g.moveTo(80, y + 40); g.lineTo(1320, y + 40); g.stroke(); });
            return c.toDataURL('image/png').split(',')[1]; }, ROWS);
        fs.writeFileSync(path.join(dir, 'media', 'table-1855.png'), Buffer.from(png, 'base64'));
        { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db(); $pdo->exec("INSERT INTO media(title, filename, media_type) VALUES('Table décennale de Tulle','table-1855.png','image')"); echo $pdo->lastInsertId();`], { cwd: appRoot, encoding: 'utf8', env }); ids.table = Number(r.stdout); assert.ok(ids.table > 0, r.stderr); }

        await t('F13 : dates comprises comme un champ de date (C4), avec les années de la table', async () => {
            const r = await page.evaluate(() => { const E = window.LCNDA_EXT, p = E.decennalePeriod('1853-1862');
                return { p, a: E.decennaleRowDate('12 mars', { prevYear: 1855, period: p }), b: E.decennaleRowDate('3/4', { period: E.decennalePeriod('1856') }), c: E.decennaleRowDate('14 mai 1870', { period: p }),
                    d: E.decennaleRowDate('30 février 1855', { period: p }), e: E.decennaleRowDate('12 mars', { annee: '1858', period: p }), f: E.decennaleRowDate('', {}), g: E.decennaleRowDate('5 ventôse an XI', { period: E.decennalePeriod('an XI - 1812') }), h: E.decennaleRowDate('12 mars', { period: p }) }; });
            assert.deepEqual(r.p, { y1: 1853, y2: 1862 });
            assert.equal(r.a.text, '12 mars 1855'); assert.ok(r.a.ok && !r.a.warn, JSON.stringify(r.a)); assert.equal(r.a.label, '12 mars 1855');
            assert.equal(r.b.text, '3/4/1856'); assert.ok(r.b.ok);
            assert.ok(r.c.ok && /hors de la période/.test(r.c.warn), JSON.stringify(r.c));
            assert.equal(r.d.ok, false); assert.match(r.d.warn, /impossible/);
            assert.equal(r.e.text, '12 mars 1858');
            assert.ok(r.f.empty);
            assert.ok(r.g.ok, JSON.stringify(r.g));
            assert.ok(r.h.ok === false || /préciser/.test(r.h.warn || '') || r.h.text === '12 mars', 'sans année ni ligne d’avant : à préciser');
        });

        const stepToColumns = async (pg, { hand = false } = {}) => {
            await pg.evaluate(id => window.LCNDA_EXT.openDecennale({ mediaId: id }), ids.table);
            await pg.waitForSelector('.h-td-dlg [name=td_period]');
            await pg.fill('.h-td-dlg [name=td_period]', '1853-1862');
            if (hand) await pg.click('[data-td-writing="hand"]');
            await pg.click('[data-td-next]'); await pg.waitForSelector('[data-td-imgbox] img');
            await pg.waitForFunction(() => document.querySelector('[data-td-imgbox] img')?.complete);
            const box = await pg.locator('[data-td-imgbox]').boundingBox();
            const drag = async (sel, fx, fy) => { const h = await pg.locator(sel).boundingBox(); await pg.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await pg.mouse.down(); await pg.mouse.move(box.x + fx * box.width, box.y + fy * box.height, { steps: 4 }); await pg.mouse.up(); };
            await pg.locator('[data-td-stage]').evaluate(el => { el.scrollTop = 0; });
            await drag('[data-td-h="top"]', .5, 155 / 900); await drag('[data-td-h="bottom"]', .5, 858 / 900);
            await drag('[data-td-v="0"]', 82 / 1400, .5); await drag('[data-td-v="1"]', 500 / 1400, .5); await drag('[data-td-v="2"]', 980 / 1400, .5);
            await pg.click('[data-td-rows]');
            return {n: await pg.evaluate(() => document.querySelectorAll('[data-td-ov] .h-td-row').length), drag};
        };

        await t('F13 : ① l’image (K1 si elle manque), ② les colonnes (gabarit, traits glissés, lignes repérées)', async () => {
            await page.evaluate(() => window.LCNDA_EXT.openDecennale({}));
            await page.click('[data-td-next]');
            assert.ok(await page.locator('.h-td-dlg .is-invalid, .h-td-dlg .ui-field-error').count() > 0, 'la photo manque : erreur sous le champ');
            await page.keyboard.press('Escape'); await page.waitForTimeout(200);
            assert.equal(await page.locator('dialog.h-td-dlg').count(), 0);
            const {n, drag} = await stepToColumns(page);
            assert.equal(n, 6, 'les 6 lignes de la table');
            assert.deepEqual(await page.$$eval('[data-td-role]', s => s.map(x => x.value)), ['nom', 'prenoms', 'date']);
            await page.selectOption('[data-td-tpl]', 'npds'); assert.equal(await page.locator('[data-td-role]').count(), 4);
            await page.selectOption('[data-td-tpl]', 'npd');
            await drag('[data-td-v="1"]', 500 / 1400, .5); await drag('[data-td-v="2"]', 980 / 1400, .5);
            assert.equal(await page.locator('[data-td-ov] .h-td-row').count(), 6, 'les lignes restent');
            await shot(page, 'f13-colonnes-1440.png');
        });

        await t(`F13 : ③ la lecture ${hasTess ? '(Tesseract hors ligne, table lue pour de vrai)' : '(moteur introuvable : message clair, saisie à la main)'} puis ④ la relecture`, async () => {
            await page.click('[data-td-next]');
            if (hasTess) {
                await page.waitForSelector('[data-td-tbody]', { timeout: 180000 });
                const vals = await page.$$eval('[data-td-i]', trs => trs.map(tr => ['nom', 'prenoms', 'date'].map(k => tr.querySelector(`[data-td-k="${k}"]`).value)));
                const exact = vals.filter((v, i) => ROWS[i] && v[0] === ROWS[i][0] && v[1] === ROWS[i][1]).length;
                assert.ok(exact >= 4, `noms lus : ${JSON.stringify(vals)}`);
            } else {
                await page.waitForSelector('[data-td-read] [data-td-manual]', { timeout: 30000 });
                assert.match(await page.locator('[data-td-read]').innerText(), /saisie à la main reste possible/);
                await page.click('[data-td-read] [data-td-manual]'); await page.waitForSelector('[data-td-tbody]');
                for (const [i, r] of ROWS.entries()) { await page.fill(`[data-td-i="${i}"] [data-td-k="nom"]`, r[0].toLowerCase()); await page.fill(`[data-td-i="${i}"] [data-td-k="prenoms"]`, r[1]); await page.fill(`[data-td-i="${i}"] [data-td-k="date"]`, r[2]); }
            }
            // corriger : une date sans année prend celle de la ligne d'avant
            await page.fill('[data-td-i="1"] [data-td-k="date"]', '3 janvier');
            assert.match(await page.locator('[data-td-i="1"] [data-td-dh]').innerText(), /3 janvier 1855/);
            await page.fill('[data-td-i="1"] [data-td-k="date"]', '3 janvier 1856');
            await page.click('[data-td-i="2"] [data-td-k="nom"]');
            assert.match(await page.locator('[data-td-strip-lab]').innerText(), /ligne 3/);
            assert.equal(await page.locator('[data-td-ov4] .is-cur').getAttribute('data-td-zone'), '2');
            await page.focus('[data-td-i="0"] [data-td-k="nom"]'); await page.keyboard.press('Tab');
            assert.equal(await page.inputValue('[data-td-i="0"] [data-td-k="nom"]'), 'MARTIN', 'nom en capitales');
            // retirer une ligne vide ajoutée, avec « ↶ Annuler »
            await page.click('[data-td-addrow]'); assert.equal(await page.locator('[data-td-i]').count(), 7);
            await page.click('[data-td-i="6"] [data-td-delrow]'); assert.equal(await page.locator('[data-td-i]').count(), 6);
            await shot(page, 'f13-relecture-1440.png');
        });

        await t('F13 : ⑤ créer le dépouillement « Table décennale », « ↶ Annuler » puis « ↷ Rétablir »', async () => {
            await page.click('[data-td-next]'); await page.waitForSelector('.h-td-sum');
            assert.match(await page.locator('.h-td-sum').innerText(), /6 lignes/);
            await page.click('[data-td-next]'); await page.waitForSelector('.h-td-fiches', { timeout: 60000 });
            const find = () => page.evaluate(async () => (await window.LCNDA_APP.api('archive_digest_search', {})).rows.filter(x => x.record_type === 'table_decennale'));
            let rows = await find(); assert.equal(rows.length, 1); const d = rows[0];
            assert.equal(d.template_key, 'table'); assert.equal(d.year_text, '1853-1862'); assert.equal(d.media.length, 1);
            assert.deepEqual(d.people.map(p => [p.last_name, p.first_name, p.extra_info, p.personal_status]).slice(0, 2), [['MARTIN', 'Jean Pierre', '12 mars 1855', 'Naissance'], ['DUPONT', 'Marie Louise', '3 janvier 1856', 'Naissance']]);
            const lines = await page.evaluate(async id => (await window.LCNDA_APP.api('archive_digest_transcriptions', { id })).lines, d.id);
            assert.equal(lines.length, 6); const z = JSON.parse(lines[0].zone_json); assert.ok(z.y > 15 && z.y < 25 && z.height > 4, lines[0].zone_json);
            await page.locator('.ui-toast').filter({ hasText: 'Dépouillement créé' }).getByRole('button', { name: /Annuler/ }).last().click();
            await page.waitForFunction(async () => !(await window.LCNDA_APP.api('archive_digest_search', {})).rows.some(x => x.record_type === 'table_decennale'), null, { timeout: 15000 });
            assert.ok(await page.locator('.h-td-sum').isVisible(), 'retour au résumé, prêt à recréer');
            await page.locator('.ui-toast').getByRole('button', { name: /Rétablir/ }).last().click();
            await page.waitForSelector('.h-td-fiches', { timeout: 30000 });
            rows = await find(); assert.equal(rows.length, 1); ids.digest = rows[0].id; assert.equal(rows[0].people.length, 6);
        });

        await t('F13 : les fiches — ＋ Créer la fiche (avec la naissance) puis « ↶ Annuler », 🔗 Relier par le menu de choix', async () => {
            await page.waitForTimeout(800); // les fiches proposées
            await page.click('[data-td-create="0"]');
            await page.waitForSelector('[data-td-f="0"] .h-td-linked');
            const pid = Number(await page.locator('[data-td-f="0"] [data-open-person]').getAttribute('data-open-person'));
            const ev = await page.evaluate(async id => (await window.LCNDA_APP.api('person', { id })).events || [], pid);
            assert.ok(ev.some(e => e.date_text === '12 mars 1855'), JSON.stringify(ev).slice(0, 300));
            await page.locator('.ui-toast').filter({ hasText: 'Fiche créée' }).getByRole('button', { name: /Annuler/ }).last().click();
            await page.waitForSelector('[data-td-f="0"] [data-td-create]');
            const left = await page.evaluate(async () => (await window.LCNDA_APP.api('picker_search', { kind: 'person', q: 'Jean Pierre Martin' })).groups.flatMap(g => g.items).filter(i => /Jean Pierre/.test(i.title)).length);
            assert.equal(left, 0, 'fiche retirée');
            // BERNARD Louis : la fiche existante est proposée, on la relie
            await page.waitForFunction(() => document.querySelector('[data-td-f="2"] input[name="td_p2"]')?.value, null, { timeout: 15000 });
            const sug = await page.locator('[data-td-f="2"] input[name="td_p2"]').inputValue();
            assert.equal(sug, '3', 'Louis Bernard proposé');
            await page.click('[data-td-link="2"]'); await page.waitForSelector('[data-td-f="2"] .h-td-linked');
            const p = (await page.evaluate(async id => (await window.LCNDA_APP.api('archive_digest_search', { id })).rows[0].people, ids.digest)).find(x => x.last_name === 'BERNARD');
            assert.equal(Number(p.person_id), 3);
            await shot(page, 'f13-fiches-1440.png');
            await page.click('[data-td-open]');
            await page.waitForSelector('.h-dp-table', { timeout: 15000 });
            assert.deepEqual(await page.$$eval('.h-dp-table .h-dp-colhead th', ths => ths.map(t => t.textContent).filter(Boolean)), ['Nom', 'Prénoms', 'Fiche', 'Date', 'Acte', 'Notes']);
            assert.equal(await page.locator('.h-dp-table .h-dp-band').count(), 0, 'pas de foyers pour une table décennale');
            await shot(page, 'f13-depouillement-1440.png');
        });

        await t('F13 : table écrite à la main sans lecteur HTR installé → message clair et grille rapide', async () => {
            await stepToColumns(page, { hand: true });
            await page.click('[data-td-next]');
            await page.waitForSelector('[data-td-read] [data-td-manual]');
            assert.match(await page.locator('[data-td-read]').innerText(), /pas installé/);
            await page.click('[data-td-read] [data-td-manual]'); await page.waitForSelector('[data-td-tbody]');
            assert.equal(await page.locator('[data-td-i]').count(), 6);
            await page.fill('[data-td-i="0"] [data-td-k="nom"]', 'Borie'); await page.keyboard.press('Enter');
            assert.equal(await page.evaluate(() => document.activeElement?.closest('[data-td-i]')?.dataset.tdI), '1', 'Entrée : ligne suivante');
            await page.click('[data-td-cancel]');
            await page.locator('dialog[open]').filter({ hasText: 'Fermer l’assistant' }).getByRole('button', { name: /Fermer sans créer/ }).click();
            await page.waitForFunction(() => !document.querySelector('dialog.h-td-dlg'), null, { timeout: 5000 });
        });

        await t('F15 : l’outil sur deux photos — ressemblance prudente, côte à côte / fondu / rideau, noir et blanc', async () => {
            await page.evaluate(() => window.LCNDA_EXT.openPhotoCompare({ a: 1, b: 2 }));
            await page.waitForSelector('.h-pc-dlg [data-pc-verdict]', { timeout: 15000 });
            const v = await page.locator('[data-pc-score]').innerText();
            assert.match(v, /ce n’est pas une preuve/); assert.match(v, /très forte|forte/);
            assert.ok(await page.locator('[data-pc-people] .pk-chip').count() >= 1, 'Jean, sur les deux photos');
            for (const m of ['fade', 'curtain', 'side']) { await page.click(`[data-pc-mode="${m}"]`); assert.equal(await page.locator(`[data-pc-mode="${m}"].is-active`).count(), 1); }
            await page.click('label:has([data-pc-gray])'); assert.equal(await page.isChecked('[data-pc-gray]'), true);
            const st = await page.evaluate(() => [...document.querySelectorAll('[data-pc-canvas]')].map(c => c.width > 100));
            assert.deepEqual(st, [true]);
            // l'autre photo : ressemblance faible
            const far = await page.evaluate(() => window.LCNDA_EXT.photoCompareVerdict(0.72));
            assert.equal(far.level, 'ressemblance faible'); assert.match(far.text, /pas une preuve/);
            await shot(page, 'f15-cote-a-cote-1440.png');
        });

        await t('F15 : poser les yeux (2 clics par photo) → aligner ; notes ; « 💾 Enregistrer » relié aux médias et aux personnes', async () => {
            await page.click('[data-pc-place]');
            const cv = await page.locator('[data-pc-canvas]').boundingBox();
            // dans chaque moitié, les yeux du portrait dessiné (370,470) et (530,470) sur 900 × 1100, posé au milieu
            const eye = async (half, fx) => { const W = cv.width / 2 - 3, H = cv.height, s = Math.min(W / 900, H / 1100) * .96, ox = half * (cv.width / 2 + 3) + (W - 900 * s) / 2, oy = (H - 1100 * s) / 2; await page.mouse.click(cv.x + ox + fx * s, cv.y + oy + 470 * s); };
            assert.match(await page.locator('[data-pc-hint]').innerText(), /œil de gauche de la photo A/);
            await eye(1, 370); assert.match(await page.locator('[data-pc-hint]').innerText(), /photo A/, 'clic sur la mauvaise photo : on redemande');
            await eye(0, 370); await eye(0, 530); await eye(1, 370); await eye(1, 530);
            assert.equal(await page.isChecked('[data-pc-aligned]'), true);
            await page.fill('[data-pc-notes]', 'Même implantation des cheveux');
            await page.fill('[data-pc-name]', 'Jean à 20 et 50 ans');
            await page.click('[data-pc-cmd="save"]');
            await page.waitForFunction(() => /Enregistré/.test(document.querySelector('.h-pc-dlg [data-ui-status]')?.textContent || ''));
            const c = (await page.evaluate(async () => (await window.LCNDA_APP.api('photo_comparisons', {})).items)).find(x => x.title === 'Jean à 20 et 50 ans');
            assert.ok(c, 'enregistrée'); ids.saved = c.id;
            assert.equal(c.notes, 'Même implantation des cheveux'); assert.equal(c.media_a.id, 1); assert.equal(c.media_b.id, 2);
            assert.ok(c.people.some(p => p.id === 1)); assert.equal(c.settings.aligned, true); assert.equal(c.settings.gray, true);
            const ea = c.settings.eyes.a; assert.ok(Math.abs(ea[0][0] - 370 / 900) < .03 && Math.abs(ea[1][0] - 530 / 900) < .03 && Math.abs(ea[0][1] - 470 / 1100) < .03, JSON.stringify(ea));
            assert.match(c.verdict, /pas une preuve/);
            await shot(page, 'f15-yeux-alignes-1440.png');
            await page.click('.h-pc-dlg [data-pc-cmd="close"]'); await page.waitForTimeout(200);
            assert.equal(await page.locator('dialog.h-pc-dlg').count(), 0);
        });

        await t('F15 : rouvrir depuis Listes → Outils de modification ; portes d’entrée (Médias, visionneuse, fiche, Comparaison)', async () => {
            await page.evaluate(() => { try { localStorage.setItem('genealogie-edittools-tab', 'photocmp'); } catch (_) {} const S = window.LCNDA_APP.state; S.listType = 'edit_tools'; window.LCNDA_APP.setModule('listes'); });
            await page.waitForSelector(`[data-et-open="${ids.saved}"]`, { timeout: 15000 });
            await page.locator(`[data-et-open="${ids.saved}"]`).first().click();
            await page.waitForSelector('.h-pc-dlg [data-pc-verdict]');
            assert.equal(await page.inputValue('[data-pc-name]'), 'Jean à 20 et 50 ans');
            assert.equal(await page.inputValue('[data-pc-notes]'), 'Même implantation des cheveux');
            assert.equal(await page.isChecked('[data-pc-aligned]'), true);
            await page.click('.h-pc-dlg [data-pc-cmd="close"]');
            // Médias
            await page.evaluate(() => { window.LCNDA_APP.state.listType = 'media'; window.LCNDA_APP.setModule('listes'); });
            await page.waitForSelector('button:has-text("🔍 Comparer deux photos")', { state: 'attached', timeout: 15000 });
            // visionneuse : « 🔍 Comparer avec… » ouvre la fenêtre des médias pour la photo B
            await page.evaluate(() => window.LCNDA_APP.openLightbox([{ id: 1, title: 'Jean en 1910', filename: 'portrait-a.jpg', media_type: 'image' }], 0));
            await page.click('#compare-media');
            await page.waitForSelector('dialog.mpk-dialog[open]');
            assert.match(await page.locator('dialog.mpk-dialog[open]').innerText(), /Comparer avec/);
            await page.locator('dialog.mpk-dialog[open] .mpk-tile', { hasText: 'Jean vers 1940' }).first().click();
            await page.locator('dialog.mpk-dialog[open]').getByRole('button', { name: /^Comparer$/ }).click();
            await page.waitForSelector('.h-pc-dlg [data-pc-verdict]');
            await page.click('.h-pc-dlg [data-pc-cmd="close"]');
            await page.evaluate(() => document.getElementById('lightbox')?.close());
            // fiche : 🔍 dans le bloc Médias
            await page.evaluate(() => { window.LCNDA_APP.state.currentPersonId = 1; window.LCNDA_APP.setModule('personnes'); });
            await page.waitForSelector('[data-photo-compare-person]', { timeout: 15000 });
            // Comparaison → Images : l'outil dans la page
            await page.evaluate(() => { const S = window.LCNDA_APP.state; S.comparisonMode = 'images'; S.imageCompare = { left: { id: 1, title: 'Jean en 1910', filename: 'portrait-a.jpg', media_type: 'image', people_links: [] }, right: { id: 2, title: 'Jean vers 1940', filename: 'portrait-b.jpg', media_type: 'image', people_links: [] } }; window.LCNDA_APP.setModule('comparaison'); });
            await page.waitForSelector('#comparison-photo-tool [data-pc-verdict]', { timeout: 15000 });
            await noHScroll(page, 'Comparaison 1440');
            await shot(page, 'f15-comparaison-page-1440.png');
        });

        await t('390 px et mode sombre : assistant et outil lisibles, sans défilement horizontal', async () => {
            for (const opt of [{ width: 390, height: 844 }, { width: 1440, height: 900, dark: true }]) {
                const pg = await newPage({ ...opt, tess: false });
                const tag = opt.dark ? 'sombre' : '390';
                await pg.evaluate(id => window.LCNDA_EXT.openDecennale({ mediaId: id }), ids.table);
                await pg.waitForSelector('.h-td-dlg [name=td_period]'); await noHScroll(pg, `table ${tag}`);
                await shot(pg, `f13-image-${tag}.png`);
                await pg.click('[data-td-next]'); await pg.waitForSelector('[data-td-imgbox] img'); await noHScroll(pg, `colonnes ${tag}`);
                await shot(pg, `f13-colonnes-${tag}.png`);
                await pg.keyboard.press('Escape');
                await pg.evaluate(id => window.LCNDA_EXT.openPhotoCompare({ id }), ids.saved);
                await pg.waitForSelector('.h-pc-dlg [data-pc-verdict]'); await pg.waitForTimeout(300); await noHScroll(pg, `photos ${tag}`);
                await shot(pg, `f15-${tag}.png`);
                await pg.context().close();
            }
        });
        assert.deepEqual(errors, [], 'erreurs JavaScript : ' + errors.join('\n'));
        console.log(hasTess ? '  (lecture Tesseract hors ligne testée)' : '  (Tesseract absent hors ligne : parcours manuel testé)');
        await browser.close();
    } catch (e) { failed++; console.error(e); }
    finally { proc.kill(); if (!process.env.F13_DIR) fs.rmSync(root, { recursive: true, force: true }); }
    if (failed) { console.error(`\n${failed} échec(s)`); process.exit(1); }
    console.log('\nTout est bon.');
})();
