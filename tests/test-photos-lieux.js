'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📍 Images de lieux : « Où a-t-elle été prise ? » (lib/place_photos.php, assets/js/heritage-place-photos.js) :
 *     node tests/test-photos-lieux.js        (PP_SHOTS=dossier pour garder les captures)
 * Un vrai « php -S » sur une base neuve, puis un navigateur (Playwright ; sinon seule la partie serveur est faite) :
 *  1. plusieurs hypothèses avec leur certitude ; zones cercle / polygone valides, zones abîmées refusées ; une seule retenue,
 *     qui devient le lieu du média ; suppression puis ↶ Annuler ;
 *  2. la lecture pour une couche de carte (GET place_photos : lieu, rue, certitude, sans lieu, bbox ; LCNDA_EXT.placePhotos) ;
 *  3. la demande d'aide créée DANS les outils existants (🤝 entraide, ✉️ petites annonces), la photo reliée ; une réponse →
 *     une hypothèse avec son auteur, notée dans la demande ; ↶ Annuler remet tout ;
 *  4. le comparateur (« Hier et aujourd'hui ») : rideau, repères, ajustement à la main, enregistré ;
 *  5. la fenêtre, la liste H10, le bloc du lieu, le calque : à 1440 px, 390 px et en sombre, sans erreur JavaScript.
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-pplieux-'));
const dir = path.join(tmp, 'a');
const shots = process.env.PP_SHOTS || '';
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
{
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Joseph','Martin','male')"); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO places(name, county, country, latitude, longitude) VALUES('Brive-la-Gaillarde','Corrèze','France',45.1588,1.5321)");
$pdo->exec("INSERT INTO places(name, county, country, latitude, longitude) VALUES('Tulle','Corrèze','France',45.2671,1.7700)");
$mk = function ($name, $c1, $c2) { $im = imagecreatetruecolor(900, 600); imagefill($im, 0, 0, imagecolorallocate($im, ...$c1));
    for ($k = 0; $k < 12; $k++) imagefilledrectangle($im, 60 + $k * 65, 300 - ($k % 4) * 40, 110 + $k * 65, 560, imagecolorallocate($im, ...$c2));
    imagefilledrectangle($im, 435, 80, 465, 300, imagecolorallocate($im, 60, 60, 60)); imagejpeg($im, MEDIA_DIR . '/' . $name, 85); };
if (!function_exists('imagecreatetruecolor')) { echo 'nogd'; exit(1); }
$mk('old.jpg', [205, 190, 160], [120, 100, 80]); $mk('old2.jpg', [190, 185, 170], [90, 90, 90]); $mk('today.jpg', [170, 200, 230], [140, 120, 110]);
$ins = $pdo->prepare("INSERT INTO media(title, filename, thumbnail, media_type, date_text) VALUES(?,?,?, 'image', ?)");
$ins->execute(['Brive — La Grande-Rue', 'old.jpg', 'old.jpg', 'vers 1905']);
$ins->execute(['Vue du village', 'old2.jpg', 'old2.jpg', 'vers 1910']);
$ins->execute(['La Grande-Rue aujourd’hui', 'today.jpg', 'today.jpg', '2024']);
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
    if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
}
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

(async () => {
    const port = Number(process.env.PP_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let pw = null;
    for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    const out = {};
    let browser = null;
    try {
        // la lecture marche sans navigateur (et sans jeton : c'est un GET)
        out.empty = await (await fetch(base + 'api.php?action=place_photos')).json();
        out.noCsrf = (await fetch(base + 'api.php?action=place_photo_write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'guess', media_id: 1, place_id: 1 }) })).status;
        if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); return; }
        browser = await pw.chromium.launch();
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await ctx.route(/tile\.openstreetmap|tile\.|arcgisonline|ign\.fr|stamen|carto|opentopomap/, r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
        await ctx.route(/cdn\.jsdelivr\.net|unpkg\.com/, r => r.abort());
        const outside = []; ctx.on('request', r => { const u = r.url(); if (!u.startsWith(base) && !/^data:|^blob:/.test(u) && !/tile|arcgis|ign\.fr|carto|stamen|jsdelivr|unpkg|fonts\.g/.test(u)) outside.push(u); });
        const page = await ctx.newPage();
        const errors = []; page.on('pageerror', e => errors.push(String(e.message))); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.api && window.LCNDA_EXT?.placePhotos && window.LCNDA_EXT?.openDialog && window.LCNDA_EXT?.openPhotoCompare);
        const W = (body) => page.evaluate(b => window.LCNDA_APP.api('place_photo_write', {}, { method: 'POST', body: b }).then(r => r, e => ({ error: e.message })), body);
        const G = (action, q = {}) => page.evaluate(([a, qq]) => window.LCNDA_APP.api(a, qq), [action, q]);

        /* 1. hypothèses, zones, une seule retenue */
        const a = await W({ op: 'guess', media_id: 1, place_id: 1, certainty: 'probable', why: 'Légende imprimée : « Brive — La Grande-Rue »' });
        const b = await W({ op: 'guess', media_id: 1, zone: { type: 'polygon', pts: [[45.159, 1.531], [45.160, 1.534], [45.158, 1.535]] }, street: 'Grande-Rue', bearing: 90, fov: 50, certainty: 'possible', why: 'Le clocher à droite', author: 'Moi' });
        const c = await W({ op: 'guess', media_id: 1, zone: { type: 'circle', lat: 45.2671, lon: 1.77, r: 400 }, certainty: 'verify', why: 'Ou bien Tulle ?' });
        out.bad = {
            poly2: await W({ op: 'guess', media_id: 1, zone: { type: 'polygon', pts: [[45, 1], [45.1, 1.1]] } }),
            flat: await W({ op: 'guess', media_id: 1, zone: { type: 'polygon', pts: [[45, 1], [45.1, 1.1], [45.2, 1.2]] } }),
            circle: await W({ op: 'guess', media_id: 1, zone: { type: 'circle', lat: 45, lon: 1, r: 1 } }),
            nothing: await W({ op: 'guess', media_id: 1, certainty: 'certain' }),
            latOnly: await W({ op: 'guess', media_id: 1, lat: 45 }),
            notImage: await W({ op: 'guess', media_id: 999, place_id: 1 }),
            zoneText: await W({ op: 'guess', media_id: 1, zone: '<script>' }),
        };
        out.afterAdd = (await G('place_photo', { media_id: 1 })).item;
        const rt = await W({ op: 'retain', id: b.id });
        out.afterRetainB = rt.item;
        await W({ op: 'retain', id: a.id });
        out.mediaPlace = await page.evaluate(() => window.LCNDA_APP.api('place_photos', { place_id: 1 }));
        const del = await W({ op: 'delete_guess', id: a.id });
        out.afterDel = del.item;
        out.restored = (await W({ op: 'restore_guess', snapshot: del.snapshot })).item;

        /* 2. la lecture pour la couche de carte */
        await W({ op: 'info', media_id: 2, kind: 'postcard', date_text: 'vers 1910', author: 'ND Phot.' });
        out.read = {
            all: await G('place_photos'), place2: await G('place_photos', { place_id: 2 }), street: await G('place_photos', { street: 'grande-rue' }),
            cert: await G('place_photos', { certainty: 'verify', all: 1 }), certRet: await G('place_photos', { certainty: 'verify' }), unplaced: await G('place_photos', { unplaced: 1 }),
            bboxIn: await G('place_photos', { bbox: '45,1.4,45.3,1.6' }), bboxOut: await G('place_photos', { bbox: '48,2,49,3' }), from: await G('place_photos', { from: 1908 }),
            ext: await page.evaluate(async () => { const P = window.LCNDA_EXT.placePhotos; const l = await P.list({ certainty: ['probable', 'certain'] }); const g = await P.geojson({ all: true }); return { n: l.items.length, types: g.features.map(f => f.geometry.type + (f.properties.zone ? ':' + f.properties.zone : '')), first: g.features[0]?.geometry.coordinates }; }),
        };

        /* 3. demande d'aide dans les outils existants, réponse → hypothèse, ↶ Annuler */
        const help = await W({ op: 'ask', media_id: 1, where: 'help_request', format: 'forum', question: 'Est-ce bien la Grande-Rue ?' });
        const ad = await W({ op: 'ask', media_id: 1, where: 'press_ad' });
        out.help = help; out.ad = ad;
        out.helpList = (await G('help_requests', { status: 'all' })).requests.find(r => Number(r.id) === help.id);
        out.adList = (await G('press_ads')).ads.find(x => Number(x.id) === ad.id);
        out.text = await G('place_photo_help_text', { media_id: 1, format: 'forum' });
        out.asks = (await G('place_photo', { media_id: 1 })).asks;
        const ans = await W({ op: 'answer', media_id: 1, ask_type: 'help_request', ask_id: help.id, author: 'Cousin_Corrèze', place_id: 2, street: 'Rue Jean-Jaurès', certainty: 'probable', why: 'Je reconnais la pharmacie' });
        out.ans = ans;
        out.helpAfter = (await G('help_requests', { status: 'all' })).requests.find(r => Number(r.id) === help.id);
        out.noAuthor = await W({ op: 'answer', media_id: 1, ask_type: 'help_request', ask_id: help.id, author: '', place_id: 2 });
        out.undo = await W({ op: 'answer_undo', ...ans.undo });
        out.helpUndone = (await G('help_requests', { status: 'all' })).requests.find(r => Number(r.id) === help.id);
        const ans2 = await W({ op: 'answer', media_id: 1, ask_type: 'press_ad', ask_id: ad.id, author: 'Un lecteur de La Montagne', lat: 45.1593, lon: 1.5331, certainty: 'possible', why: 'Courrier reçu' });
        out.adAfter = (await G('press_ads')).ads.find(x => Number(x.id) === ad.id); out.ans2 = ans2;

        /* 4. le comparateur « Hier et aujourd'hui » */
        await W({ op: 'info', media_id: 1, today_media_id: 3 });
        out.cmp = await page.evaluate(async () => {
            const tool = await window.LCNDA_EXT.openPhotoCompare({ a: 1, b: 3, purpose: 'place' });
            const dlg = document.querySelector('dialog.h-pc-dlg');
            for (let i = 0; i < 60 && !(tool.state.a.img && tool.state.b.img); i++) await new Promise(r => setTimeout(r, 100));
            const r = { mode: tool.state.mode, recal: !!dlg.querySelector('[data-pc-moveb]'), score: !!dlg.querySelector('[data-pc-score]'), eyesBtn: !!dlg.querySelector('[data-pc-auto]'), title: dlg.querySelector('.ui-topbar-name, [data-pc-name]')?.value || '' };
            // le trait du rideau : glisser au milieu
            const cv = dlg.querySelector('[data-pc-canvas]'), bx = cv.getBoundingClientRect();
            const ev = (t, x) => cv.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: bx.top + bx.height / 2, button: 0, pointerId: 1 }));
            ev('pointerdown', bx.left + bx.width / 2); ev('pointermove', bx.left + bx.width * 0.25); ev('pointerup', bx.left + bx.width * 0.25);
            r.mix = tool.state.mix;
            // repères posés à la main (deux par photo) puis ajustement
            tool.state.a.eyes = [[0.2, 0.3], [0.8, 0.35]]; tool.state.b.eyes = [[0.25, 0.32], [0.75, 0.3]]; tool.state.aligned = true;
            const rot = [...dlg.querySelectorAll('[data-pc-r="adjR"]')][0]; rot.value = '12'; rot.dispatchEvent(new Event('input', { bubbles: true }));
            const mv = dlg.querySelector('[data-pc-moveb]'); mv.checked = true; mv.dispatchEvent(new Event('change', { bubbles: true }));
            ev('pointerdown', bx.left + bx.width * 0.7); ev('pointermove', bx.left + bx.width * 0.7 + 30); ev('pointerup', bx.left + bx.width * 0.7 + 30);
            r.adjX = tool.state.adjX; r.adjR = tool.state.adjR;
            await tool.save();
            r.saved = tool.state.id;
            return r;
        });
        if (shots) await page.screenshot({ path: path.join(shots, 'pp-comparateur-1440.png') });
        out.cmpRec = (await G('photo_comparison', { id: out.cmp.saved })).comparison;
        await page.evaluate(() => { const d = document.querySelector('dialog.h-pc-dlg'); d?.close(); });
        await page.evaluate(id => window.LCNDA_APP.api('place_photo_write', {}, { method: 'POST', body: { op: 'info', media_id: 1, comparison_id: id } }), out.cmp.saved);

        /* 5. la fenêtre, la liste, le bloc, le calque */
        const shotAll = async tag => {
            await page.evaluate(() => window.LCNDA_EXT.placePhotos.open(1));
            await page.waitForSelector('.pp-dlg .pp-guess');
            await page.waitForTimeout(300);
            const o = await page.evaluate(() => { const d = document.querySelector('.pp-dlg'); return { guesses: d.querySelectorAll('.pp-guess').length, retained: d.querySelectorAll('.pp-guess.is-retained').length, badges: [...d.querySelectorAll('.pp-guess .ui-badge')].map(x => x.textContent),
                zones: d.querySelectorAll('.pp-map-svg .pp-zone').length, cones: d.querySelectorAll('.pp-map-svg .pp-cone').length, asks: d.querySelectorAll('.pp-asklist li').length, today: !!d.querySelector('.pp-today-row'), overflow: document.documentElement.scrollWidth > innerWidth + 1,
                dlgOverflow: d.closest('dialog').scrollWidth > d.closest('dialog').clientWidth + 2 }; });
            if (shots) await page.screenshot({ path: path.join(shots, `pp-fenetre-${tag}.png`) });
            await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            await page.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'place_images'; A.setModule('listes'); });
            await page.waitForSelector('.pp-page .ui-card, .pp-page .ui-row, .pp-page [data-pp-open]');
            o.listItems = await page.evaluate(() => document.querySelectorAll('.pp-page [data-pp-open].ui-card, .pp-page .ui-card, .pp-page .ui-row').length);
            o.listOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
            if (shots) await page.screenshot({ path: path.join(shots, `pp-liste-${tag}.png`), fullPage: false });
            return o;
        };
        out.ui1440 = await shotAll('1440');

        // l'éditeur d'une hypothèse : K1 sans lieu, puis un point posé sur la carte
        await page.evaluate(() => window.LCNDA_EXT.placePhotos.open(2));
        await page.waitForSelector('.pp-dlg .pp-gform');
        await page.click('.pp-gform [data-pp-gsave]');
        out.k1 = await page.evaluate(() => !!document.querySelector('.pp-gform .is-invalid, .pp-gform .ui-field-error, .pp-gform [aria-invalid="true"]'));
        await page.click('.pp-gform [data-pp-tool="point"]');
        const mapBox = async () => { await page.locator('.pp-dlg .pp-map').scrollIntoViewIfNeeded(); return page.locator('.pp-dlg .pp-map').boundingBox(); };
        let mb = await mapBox();
        await page.mouse.click(mb.x + mb.width / 2, mb.y + mb.height / 2);
        await page.waitForFunction(() => /📍/.test(document.querySelector('[data-pp-geo]')?.textContent || ''));
        await page.click('.pp-gform [data-pp-tool="dir"]');
        mb = await mapBox();
        await page.mouse.click(mb.x + mb.width / 2 + 60, mb.y + mb.height / 2);
        await page.click('.pp-gform .pp-cert-opt.is-green');
        await page.fill('.pp-gform [name=why]', 'Vue prise depuis le pont');
        await page.click('.pp-gform [data-pp-gsave]');
        await page.waitForFunction(() => document.querySelectorAll('.pp-dlg .pp-guess').length === 1, null, { polling: 100, timeout: 8000 }).catch(async e => { console.log('DBG', await page.evaluate(() => [document.querySelectorAll('.pp-dlg').length, document.querySelectorAll('.pp-dlg .pp-guess').length, document.querySelector('.pp-gform')?.innerText.slice(0, 300), [...document.querySelectorAll('.ui-field-error, .is-invalid, [class*=toast]')].map(x => x.textContent).join('|')])); throw e; });
        out.uiAdded = (await G('place_photo', { media_id: 2 })).item.guesses[0];
        // supprimer → ↶ Annuler (H7)
        await page.click('.pp-dlg [data-pp-del]');
        await page.waitForFunction(() => !document.querySelector('.pp-dlg .pp-guess'));
        await page.evaluate(() => [...document.querySelectorAll('button')].find(x => /Annuler/.test(x.textContent) && x.closest('.toast, .ui-toast, [class*="toast"]'))?.click());
        await page.waitForFunction(() => document.querySelectorAll('.pp-dlg .pp-guess').length === 1, null, { timeout: 5000 }).catch(() => {});
        out.uiUndo = (await G('place_photo', { media_id: 2 })).item.guesses.length;
        await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));

        // la demande d'aide depuis la fenêtre
        await page.evaluate(() => window.LCNDA_EXT.placePhotos.open(1));
        await page.waitForSelector('.pp-dlg [data-pp-ask]');
        await page.click('.pp-dlg [data-pp-ask]');
        await page.waitForFunction(() => (document.querySelector('.pp-askform [name=message]')?.value || '').length > 50);
        out.askText = await page.evaluate(() => document.querySelector('.pp-askform [name=message]').value);
        if (shots) await page.screenshot({ path: path.join(shots, 'pp-demande-aide-1440.png') });
        await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));

        // le bloc « 🖼 Images du lieu » (fiche d'un village, monographie)
        await page.evaluate(() => { const ws = document.getElementById('workspace'); ws.innerHTML = '<section class="page"><div data-pli-host data-pli-place="1" data-pli-name="Brive-la-Gaillarde" data-pli-lat="45.1588" data-pli-lon="1.5321"></div></section>'; });
        await page.waitForSelector('.pp-block .pp-tile');
        out.block = await page.evaluate(() => ({ streets: [...document.querySelectorAll('.pp-street h4')].map(h => h.textContent.trim()), tiles: document.querySelectorAll('.pp-tile').length, map: !!document.querySelector('.pp-block .pp-map svg') }));
        if (shots) await page.screenshot({ path: path.join(shots, 'pp-bloc-lieu-1440.png') });

        // le calque de la Carte
        await page.evaluate(() => { try { localStorage.setItem('lcnda-map-place-photos', '1'); } catch (_) {} window.LCNDA_APP.setModule('carte'); });
        await page.waitForSelector('[data-pp-layer]', { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(800);
        out.layer = await page.evaluate(() => ({ btn: !!document.querySelector('[data-pp-layer]'), on: document.querySelector('[data-pp-layer]')?.getAttribute('aria-pressed') }));

        // 390 px, puis sombre
        await page.setViewportSize({ width: 390, height: 844 });
        out.ui390 = await shotAll('390');
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
        await page.setViewportSize({ width: 1440, height: 900 });
        out.uiDark = await shotAll('sombre');
        out.darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

        out.errors = errors; out.outside = outside;
    } finally { await browser?.close(); proc.kill(); }

    const checks = [
        ['lecture vide et sans jeton : liste vide, écriture refusée', () => { assert.deepEqual(out.empty.items, []); assert.ok([400, 403, 419].includes(out.noCsrf), String(out.noCsrf)); }],
    ];
    if (pw) checks.push(
        ['plusieurs hypothèses avec leur certitude, la première retenue d’office', () => { const g = out.afterAdd.guesses; assert.equal(g.length, 3); assert.deepEqual(g.map(x => x.certainty).sort(), ['possible', 'probable', 'verify']); assert.equal(g.filter(x => x.retained).length, 1); assert.equal(out.afterAdd.retained.place.id, 1); }],
        ['zones valides gardées (polygone, cercle) avec la direction', () => { const g = out.afterAdd.guesses; const p = g.find(x => x.zone?.type === 'polygon'), c = g.find(x => x.zone?.type === 'circle'); assert.equal(p.zone.pts.length, 3); assert.equal(p.bearing, 90); assert.equal(p.fov, 50); assert.equal(p.street, 'Grande-Rue'); assert.equal(c.zone.r, 400); assert.ok(p.at && c.at); }],
        ['zones abîmées et hypothèses vides refusées avec une phrase claire', () => { for (const [k, v] of Object.entries(out.bad)) assert.ok(v.error, k); assert.match(out.bad.poly2.error, /3 points/); assert.match(out.bad.flat.error, /plate/); assert.match(out.bad.circle.error, /rayon/); assert.match(out.bad.nothing.error, /au moins un lieu/); }],
        ['une seule retenue ; elle devient le lieu du média', () => { assert.equal(out.afterRetainB.guesses.filter(x => x.retained).length, 1); assert.equal(out.afterRetainB.retained.zone.type, 'polygon'); assert.equal(out.mediaPlace.items.length, 1); assert.equal(out.mediaPlace.items[0].retained.place.id, 1); }],
        ['supprimer la retenue → une autre prend sa place ; ↶ Annuler la remet retenue', () => { assert.equal(out.afterDel.guesses.length, 2); assert.equal(out.afterDel.guesses.filter(x => x.retained).length, 1); assert.equal(out.restored.guesses.length, 3); assert.equal(out.restored.retained.place.id, 1); }],
        ['lecture pour la couche de carte : filtres lieu, rue, certitude, sans lieu, bbox, époque', () => { const r = out.read; assert.equal(r.all.items.length, 2); assert.equal(r.place2.items.length, 0); assert.equal(r.street.items.length, 1); assert.equal(r.cert.items.length, 1); assert.equal(r.certRet.items.length, 0); assert.equal(r.unplaced.items.length, 1); assert.equal(r.unplaced.items[0].media_id, 2); assert.equal(r.bboxIn.items.length, 1); assert.equal(r.bboxOut.items.length, 0); assert.equal(r.from.items.length, 1); assert.ok(r.all.streets.includes('Grande-Rue')); }],
        ['LCNDA_EXT.placePhotos.list / geojson', () => { assert.equal(out.read.ext.n, 1); assert.ok(out.read.ext.types.includes('Polygon:polygon')); assert.ok(out.read.ext.types.includes('Point:circle')); assert.equal(out.read.ext.first.length, 2); }],
        ['demande d’entraide créée dans l’outil existant, la photo reliée', () => { assert.equal(out.help.type, 'help_request'); assert.ok(out.helpList); assert.equal(out.helpList.target, 'place_photo'); assert.equal(out.helpList.status, 'draft'); assert.equal(Number(out.helpList.media[0].id), 1); assert.match(out.helpList.message, /Mes pistes/); assert.match(out.helpList.message, /Brive-la-Gaillarde/); }],
        ['petite annonce créée dans l’outil existant, avec la photo', () => { assert.equal(out.ad.type, 'press_ad'); assert.ok(out.adList); assert.equal(out.adList.kind, 'recherche'); assert.equal(Number(out.adList.media[0].id), 1); assert.equal(out.asks.length, 2); }],
        ['texte prêt à coller : pistes, certitude, indices, questions', () => { assert.match(out.text.message, /probable/); assert.match(out.text.message, /Légende imprimée/); assert.match(out.text.message, /Reconnaissez-vous/); }],
        ['réponse → nouvelle hypothèse avec son auteur, notée dans la demande', () => { const g = out.ans.item.guesses.find(x => x.id === out.ans.id); assert.equal(g.author, 'Cousin_Corrèze'); assert.equal(g.origin, 'help_request'); assert.equal(g.origin_id, out.help.id); assert.equal(out.helpAfter.status, 'answered'); assert.match(out.helpAfter.answer, /Cousin_Corrèze/); assert.ok(out.noAuthor.error); }],
        ['↶ Annuler une réponse : hypothèse retirée, demande comme avant', () => { assert.ok(!out.undo.item.guesses.some(x => x.id === out.ans.id)); assert.equal(out.helpUndone.status, 'draft'); assert.equal(out.helpUndone.answer, ''); }],
        ['réponse à une annonce : notée dans l’annonce', () => { assert.equal(out.adAfter.status, 'answered'); assert.match(out.adAfter.data.answers, /lecteur de La Montagne/); }],
        ['comparateur « Hier et aujourd’hui » : rideau, sans visages, trait glissé, ajustement enregistré', () => { assert.equal(out.cmp.mode, 'curtain'); assert.equal(out.cmp.recal, true); assert.equal(out.cmp.score, false); assert.equal(out.cmp.eyesBtn, false); assert.ok(out.cmp.mix < 40, String(out.cmp.mix)); assert.equal(out.cmp.adjR, 12); assert.ok(out.cmp.adjX > 10); assert.equal(out.cmpRec.settings.purpose, 'place'); assert.equal(out.cmpRec.settings.adj.r, 12); assert.deepEqual(out.cmpRec.settings.eyes.a, [[0.2, 0.3], [0.8, 0.35]]); }],
        ['fenêtre : hypothèses, pastilles K8, zones et cône sur la carte, demandes, photo d’aujourd’hui', () => { const u = out.ui1440; assert.equal(u.guesses, 4); assert.equal(u.retained, 1); assert.ok(u.badges.includes('À vérifier')); assert.ok(u.zones >= 2); assert.ok(u.cones >= 1); assert.equal(u.asks, 2); assert.equal(u.today, true); }],
        ['éditeur : K1 sans lieu ; point + direction posés sur la carte', () => { assert.equal(out.k1, true); assert.ok(out.uiAdded.lat != null); assert.ok(out.uiAdded.bearing != null); assert.equal(out.uiAdded.certainty, 'certain'); assert.equal(out.uiAdded.retained, true); }],
        ['supprimer dans la fenêtre → ↶ Annuler la remet', () => assert.equal(out.uiUndo, 1)],
        ['demande d’aide : texte prêt avec la question et les pistes', () => assert.match(out.askText, /Où a été prise/)],
        ['bloc du lieu : rangé par rue, avec la carte', () => { assert.ok(out.block.tiles >= 1); assert.ok(out.block.streets.some(s => /Grande-Rue/.test(s))); assert.equal(out.block.map, true); }],
        ['calque de la Carte', () => { assert.equal(out.layer.btn, true); assert.equal(out.layer.on, 'true'); }],
        ['liste H10 et fenêtre à 390 px et en sombre, sans débordement', () => { for (const u of [out.ui390, out.uiDark]) { assert.equal(u.guesses, 4); assert.ok(u.listItems >= 2); assert.equal(u.overflow, false); assert.equal(u.listOverflow, false); } assert.equal(out.ui390.dlgOverflow, false); }],
        ['aucune requête vers un site extérieur', () => assert.deepEqual(out.outside, [])],
        ['aucune erreur JavaScript', () => assert.deepEqual(out.errors, [])],
    );
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(failed ? `${failed} échec(s)` : `${checks.length} vérifications réussies`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(1); });
