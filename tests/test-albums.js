'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📒 Albums photo (lib/albums.php, assets/js/heritage-albums.js, app-albums-core.js ; Documents → « 📚 Recueils | 📒 Albums photo ») :
 *   node tests/test-albums.js            (SHOTS=dossier pour garder des captures, DEBUG=1 pour les réponses HTTP en erreur)
 *  1. Sans navigateur (app-albums-core.js) : les pages d'un album (N photos par page, « nouvelle page avant »), les dates d'après les
 *     photos, déplacer une photo (glisser, ↑ ↓), la légende montrée.
 *  2. Serveur : structure n°115 ; créer un album avec 3 photos dans l'ordre ; dates calculées (1905–1920) ; une photo dans deux albums ;
 *     réordonner (l'ordre d'avant rendu pour ↶ Annuler) ; légende ; retirer + remettre ; ajouter une photo déjà là : ignorée ;
 *     supprimer + ↶ Annuler (restore_last_delete) ; mode consultation : l'album confidentiel et la photo d'une vivante cachés,
 *     rien ne s'écrit.
 *  3. Navigateur : la grille des façons de ranger garde 9 cases ; « 📚 Recueils » → le petit choix « 📒 Albums photo » ; la colonne
 *     (chaque album, ses photos n° 1, 2…, « Dans aucun album ») ; les albums en vignettes ; ouvrir un album ; glisser une photo
 *     (↶ Annuler) ; ⋯ → ↑ ; légende enregistrée ; 📖 feuilleter (couverture, pages, flèches) ; 🖨 la fenêtre Imprimer (photos par page) ;
 *     « ☑ Choisir plusieurs » → « 📒 Mettre dans un album… » → un nouvel album dans l'ordre des clics ; ☑ Cocher → la barre commune ;
 *     📍 « Mettre dans… » → « Un album photo… » ; « 🔎 Enquêter sur cet album » ; ⚙️ Personnaliser ; 390 px sombre : rien ne déborde ;
 *     consultation : pas de bouton qui modifie ; aucune erreur JS.
 * Noms inventés (MAZAUD, LACOMBE, DURAND).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const K = require('../assets/js/app-albums-core.js');

async function browserPart(out) {
    const phpPath = findPhp([devBundledPhp()]);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-alb-'));
    const dir = path.join(tmp, 'data'); fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1' };
    const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
    const seed = JSON.parse(php(String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Marie','LACOMBE','female','living',0),(3,'Paul','DURAND','male','deceased',0)");
$pic = function (string $f, array $rgb) { $im = imagecreatetruecolor(600, 420); imagefill($im, 0, 0, imagecolorallocate($im, ...$rgb)); imagestring($im, 5, 40, 40, $f, imagecolorallocate($im, 20, 20, 20)); imagepng($im, MEDIA_DIR . '/' . $f); };
$ins = $pdo->prepare("INSERT INTO media(title, media_type, filename, thumbnail, date_text) VALUES(?, 'image', ?, ?, ?)"); $m = [];
foreach ([['noce.png', 'La noce MAZAUD', '1905', [230, 210, 180]], ['ecole.png', 'L’école de Sancoins', '1912', [200, 220, 200]], ['plage.png', 'Marie à la plage', '1920', [190, 210, 235]], ['ferme.png', 'La ferme DURAND', '', [220, 200, 200]]] as [$f, $t, $d, $c]) { $pic($f, $c); $ins->execute([$t, $f, $f, $d]); $m[$f] = (int) $pdo->lastInsertId(); }
$pdo->prepare("INSERT INTO media_tags(media_id, person_id, x, y, w, h) VALUES(?, 2, 40, 20, 15, 20)")->execute([$m['plage.png']]);
echo json_encode(['m' => $m, 'v' => (int) $pdo->query('PRAGMA user_version')->fetchColumn(), 'want' => SCHEMA_VERSION, 'tables' => $pdo->query("SELECT group_concat(name) FROM sqlite_master WHERE type='table' AND name LIKE 'photo_album%'")->fetchColumn()]);`));
    out.seed = seed; const m = seed.m;
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = await freePort(), base = `http://127.0.0.1:${port}/`;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const browser = await chromium.launch();
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const p = await ctx.newPage(); const errs = [];
        p.on('pageerror', e => errs.push(e.message));
        p.on('response', r => { if (r.status() >= 400 && process.env.DEBUG) console.log('HTTP', r.status(), r.url().slice(0, 160)); });
        await p.addInitScript(() => { window.LCNDA_SHEET_LAZY_OFF = true; });
        await p.goto(base);
        await p.waitForFunction(() => window.LCNDA_EXT?.albums && window.LCNDA_ALBUMS_CORE && window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.onglets?.documents, null, { timeout: 30000 });
        const get = (op, q = {}) => p.evaluate(([o, x]) => window.LCNDA_APP.api('albums', { op: o, ...x }).then(r => r, e => ({ error: e.message })), [op, q]);
        const post = (op, b = {}) => p.evaluate(([o, x]) => window.LCNDA_APP.api('albums_write', {}, { method: 'POST', body: { op: o, ...x } }).then(r => ({ ok: true, r: r?.result ?? r }), e => ({ ok: false, error: e.message })), [op, b]);
        const shot = async n => { if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); await p.screenshot({ path: path.join(process.env.SHOTS, n) }); } };
        const undoClick = async () => { await sleep(150); const ok = await p.evaluate(() => { const b = [...document.querySelectorAll('.toast button, [class*="toast"] button')].reverse().find(x => /Annuler/.test(x.textContent)); b?.click(); return !!b; }); await sleep(600); return ok; };
        const clearToasts = () => p.evaluate(() => document.querySelectorAll('.toast, [class*="toast"]').forEach(t => { if (t.querySelector('button')) t.remove(); }));

        /* ═════ 2. serveur ═════ */
        const S = out.server = {};
        const c1 = await post('create', { title: 'Album de la famille MAZAUD', description: 'Trouvé chez une cousine', media_ids: [m['noce.png'], m['ecole.png'], m['plage.png']], per_page: 2 });
        S.created = c1.ok ? { id: c1.r.id, n: c1.r.album.n, order: c1.r.album.items.map(i => i.media_id), range: c1.r.album.range, per: c1.r.album.per_page, cover: c1.r.album.cover?.id } : c1;
        const aid = c1.r.id;
        const c2 = await post('create', { title: 'Les écoles', media_ids: [m['ecole.png']] });
        S.twoAlbums = (await get('media', { media_id: m['ecole.png'] })).albums.map(a => a.title);
        const g1 = (await get('get', { id: aid })).album, ids = g1.items.map(i => i.id);
        const ro = await post('reorder', { id: aid, item_ids: [ids[2], ids[0], ids[1]] });
        if (!ro.ok) throw new Error('reorder: ' + ro.error);
        S.reorder = { before: ro.r.before, after: (await get('get', { id: aid })).album.items.map(i => i.media_id) };
        await post('reorder', { id: aid, item_ids: ro.r.before });
        const cap = await post('item_save', { item_id: ids[0], caption: 'Le jour de la noce, devant la mairie' });
        S.caption = { before: cap.r.before.caption, now: (await get('get', { id: aid })).album.items[0].caption };
        const rm = await post('remove', { id: aid, item_ids: [ids[1]] });
        S.removed = (await get('get', { id: aid })).album.n;
        await post('restore_items', { id: aid, rows: rm.r.rows });
        S.restored = (await get('get', { id: aid })).album.items.map(i => i.media_id);
        S.dup = (await post('add', { id: aid, media_ids: [m['noce.png']] })).r.added.length;
        S.idx = await get('index');
        const del = await post('delete', { id: c2.r.id });
        S.deleted = !(await get('list')).albums.some(a => a.id === c2.r.id);
        await p.evaluate(id => window.LCNDA_APP.api('restore_last_delete', {}, { method: 'POST', body: { entity_type: 'photo_album', entity_id: id } }), c2.r.id);
        const back = (await get('get', { id: c2.r.id })).album;
        S.undoDelete = { ok: del.ok, back: back?.title, n: back?.n };
        S.bad = (await post('create', { title: 'x', media_ids: [999999] })).r.album.n;
        await post('delete', { id: S.bad === 0 ? (await get('list')).albums.find(a => a.title === 'x').id : 0 });

        /* ═════ 3. navigateur : Documents ═════ */
        await p.evaluate(() => { localStorage.setItem('genealogie-menu-documents', '1'); localStorage.setItem('genealogie-menu-hidden', '[]'); location.hash = '#documents'; });
        await p.waitForSelector('#sidebar-content .ong-mode [data-ong-mode]', { timeout: 20000 });
        const B = out.ui = {};
        B.grid = await p.evaluate(() => [...document.querySelectorAll('#sidebar-content .ong-mode [data-ong-mode]')].map(b => b.textContent.trim()));
        await p.click('#sidebar-content .ong-mode [data-ong-mode="recueils"]'); await sleep(500);
        B.toggle = await p.evaluate(() => [...document.querySelectorAll('#sidebar-content .ong-booktoggle [data-ong-mode]')].map(b => b.textContent.trim()));
        await p.click('#sidebar-content .ong-booktoggle [data-ong-mode="albums"]');
        await p.waitForSelector('#sidebar-content [data-ong-album]', { timeout: 10000 });
        B.gridAfter = await p.evaluate(() => ({ n: document.querySelectorAll('#sidebar-content .ong-mode [data-ong-mode]').length, active: document.querySelector('#sidebar-content .ong-mode .is-active')?.textContent.trim(), sub: document.querySelector('#sidebar-content .ong-booktoggle .is-active')?.textContent.trim() }));
        B.column = await p.evaluate(() => ({ heads: [...document.querySelectorAll('#sidebar-content .ong-rh')].map(x => x.textContent.replace(/\s+/g, ' ').trim()), rows: [...document.querySelectorAll('#sidebar-content .ong-list [data-ong-doc] strong')].map(x => x.textContent.trim()) }));
        await p.waitForSelector('#workspace [data-alb-card]', { timeout: 10000 });
        B.cards = await p.evaluate(() => [...document.querySelectorAll('#workspace [data-alb-card]')].map(c => c.textContent.replace(/\s+/g, ' ').trim()));
        await shot('alb-cards.png');
        // ouvrir l'album (depuis la colonne)
        await p.click(`#sidebar-content [data-ong-album="${aid}"]`);
        await p.waitForSelector('#workspace [data-alb-tile]', { timeout: 10000 });
        const tiles = () => p.evaluate(() => [...document.querySelectorAll('#workspace [data-alb-tile]')].map(t => Number(t.dataset.albTile)));
        B.tiles0 = await tiles();
        B.pages = await p.evaluate(() => [...document.querySelectorAll('#workspace .alb-pg')].map(x => x.textContent.trim()));
        await shot('alb-view.png');
        // glisser la 3ᵉ photo avant la 1ʳᵉ (glisser-déposer HTML5), puis ↶ Annuler
        await clearToasts();
        await p.locator(`#workspace [data-alb-tile="${B.tiles0[2]}"]`).dragTo(p.locator(`#workspace [data-alb-tile="${B.tiles0[0]}"]`), { targetPosition: { x: 10, y: 60 } });
        await sleep(900);
        B.dragged = await tiles();
        B.dragServer = (await get('get', { id: aid })).album.items.map(i => i.id);
        B.dragUndo = await undoClick(); await sleep(600);
        B.afterUndo = (await get('get', { id: aid })).album.items.map(i => i.id);
        // ⋯ → ↓ Reculer d'une place (au clavier / au doigt)
        await p.waitForSelector(`#workspace [data-alb-imenu="${B.tiles0[0]}"]`);
        await p.click(`#workspace [data-alb-imenu="${B.tiles0[0]}"]`); await sleep(250);
        B.itemMenu = await p.evaluate(() => [...document.querySelectorAll('.ui-menu [role="menuitem"], .ui-pop button')].map(b => b.textContent.trim()).filter(Boolean));
        await p.evaluate(() => [...document.querySelectorAll('.ui-menu [role="menuitem"], .ui-pop button')].find(b => /Reculer/.test(b.textContent))?.click()); await sleep(900);
        B.moved = (await get('get', { id: aid })).album.items.map(i => i.id);
        await post('reorder', { id: aid, item_ids: B.tiles0 });
        await p.evaluate(() => window.LCNDA_EXT.onglets.documents.render()); await p.waitForSelector('#workspace [data-alb-tile]'); await sleep(300);
        // légende écrite sur place : enregistrée, avec « ↶ Annuler »
        await clearToasts();
        await p.fill(`#workspace [data-alb-cap="${B.tiles0[1]}"]`, 'La classe de 1912');
        await p.dispatchEvent(`#workspace [data-alb-cap="${B.tiles0[1]}"]`, 'change'); await sleep(800);
        B.capSaved = (await get('get', { id: aid })).album.items.find(i => i.id === B.tiles0[1])?.caption;
        B.capToast = await p.evaluate(() => [...document.querySelectorAll('.toast, [class*="toast"]')].some(t => /Légende enregistrée/.test(t.textContent) && /Annuler/.test(t.textContent)));
        // 📖 feuilleter : la couverture, puis les pages (2 photos par page)
        await p.click(`#workspace [data-alb-flip="${aid}"]`); await p.waitForSelector('dialog.alb-flip[open] .alb-coverpage', { timeout: 5000 });
        B.flip = { cover: await p.evaluate(() => document.querySelector('dialog.alb-flip .alb-coverpage h2')?.textContent), pos0: await p.evaluate(() => document.querySelector('dialog.alb-flip [data-alb-pos]').textContent) };
        await p.keyboard.press('ArrowRight'); await sleep(200);
        B.flip.page1 = await p.evaluate(() => ({ figs: document.querySelectorAll('dialog.alb-flip .alb-fig').length, cap: [...document.querySelectorAll('dialog.alb-flip figcaption')].map(f => f.textContent), pos: document.querySelector('dialog.alb-flip [data-alb-pos]').textContent }));
        await p.click('dialog.alb-flip [data-alb-go="1"]'); await sleep(200);
        B.flip.page2 = await p.evaluate(() => ({ figs: document.querySelectorAll('dialog.alb-flip .alb-fig').length, next: document.querySelector('dialog.alb-flip [data-alb-go="1"]').disabled }));
        await shot('alb-flip.png');
        await p.evaluate(() => document.querySelector('dialog.alb-flip')?.close()); await sleep(200);
        // 🖨 la fenêtre Imprimer commune, avec « Photos par page »
        await p.click('#workspace [data-alb-more]'); await sleep(250);
        B.more = await p.evaluate(() => [...document.querySelectorAll('.ui-menu [role="menuitem"], .ui-pop button')].map(b => b.textContent.trim()).filter(Boolean));
        await p.evaluate(() => [...document.querySelectorAll('.ui-menu [role="menuitem"], .ui-pop button')].find(b => /Imprimer/.test(b.textContent))?.click());
        await p.waitForSelector('dialog.k-print[open]', { timeout: 5000 }).catch(() => null);
        B.print = await p.evaluate(() => { const d = document.querySelector('dialog.k-print[open]'); return d ? { per: !!d.querySelector('[data-k-q="per"]'), captions: !!d.querySelector('[data-k-q="captions"]'), key: d.dataset.kPrintKey } : null; });
        await sleep(1200);
        B.printPrev = await p.evaluate(() => { const f = document.querySelector('dialog.k-print[open] iframe'); const d = f?.contentDocument; return d ? d.querySelectorAll('[data-k-page]').length : -1; });
        await p.evaluate(() => document.querySelector('dialog.k-print[open] [data-k-x]')?.click()); await sleep(300);
        // ⚙️ Personnaliser
        await p.click('#workspace [data-alb-more]'); await sleep(200);
        await p.evaluate(() => [...document.querySelectorAll('.ui-menu [role="menuitem"], .ui-pop button')].find(b => /Personnaliser/.test(b.textContent))?.click()); await sleep(300);
        B.prefs = await p.evaluate(() => ({ per: !!document.querySelector('dialog[open] [data-alp="perPage"]'), turn: !!document.querySelector('dialog[open] [data-alp="turn"]') }));
        await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await sleep(200);
        // ← Tous les albums
        await p.click('#workspace [data-alb-back]'); await p.waitForSelector('#workspace [data-alb-card]', { timeout: 5000 });

        // « ☑ Choisir plusieurs » : deux photos dans l'ordre des clics → « 📒 Mettre dans un album… » → un nouvel album
        await p.click('#workspace [data-ong-pick]'); await sleep(500);
        await p.waitForSelector('#workspace [data-ong-card]', { timeout: 5000 });
        await p.click(`#workspace [data-ong-card="${m['ferme.png']}"] [data-ong-doc]`).catch(async () => p.click(`#workspace [data-ong-card="${m['ferme.png']}"]`)); await sleep(200);
        await p.click(`#workspace [data-ong-card="${m['noce.png']}"] [data-ong-doc]`).catch(async () => p.click(`#workspace [data-ong-card="${m['noce.png']}"]`)); await sleep(200);
        B.pickBtn = await p.evaluate(() => { const b = document.querySelector('#workspace [data-ong-pick-album]'); return b ? { text: b.textContent.trim(), disabled: b.disabled } : null; });
        await p.click('#workspace [data-ong-pick-album]'); await sleep(400);
        B.pickMenu = await p.evaluate(() => [...document.querySelectorAll('.ui-menu [role="menuitem"], .ui-pop button')].map(b => b.textContent.trim()).filter(Boolean));
        await p.evaluate(() => [...document.querySelectorAll('.ui-menu [role="menuitem"], .ui-pop button')].find(b => /nouvel album/i.test(b.textContent))?.click());
        await p.waitForSelector('dialog.h-modal[open] [name="title"]', { timeout: 5000 });
        await p.fill('dialog.h-modal[open] [name="title"]', 'La ferme et la noce');
        await p.click('dialog.h-modal[open] button[type="submit"]'); await sleep(1200);
        const made = (await get('list')).albums.find(a => a.title === 'La ferme et la noce');
        B.picked = made ? (await get('get', { id: made.id })).album.items.map(i => i.media_id) : null;
        B.pickOff = await p.evaluate(() => document.querySelector('#workspace [data-ong-pickbar]')?.hidden);
        // ☑ Cocher dans la colonne → la barre commune propose « 📒 Mettre dans un album… »
        await p.click('#sidebar-footer [data-ong-selmode]'); await sleep(600);
        B.selAction = await p.evaluate(() => { const r = document.querySelector('#sidebar-content [data-ong-sel]'); r?.querySelector('input[type="checkbox"], .sel-check')?.click(); return new Promise(res => setTimeout(() => res([...document.querySelectorAll('.sel-bar button, .ong-selbar button')].map(b => (b.textContent + ' ' + (b.title || '') + ' ' + (b.getAttribute('aria-label') || '')).trim())), 300)); });
        await p.click('#sidebar-footer [data-ong-selmode]'); await sleep(400);
        // 📍 « Mettre dans… » → « Un album photo… » (le panier)
        B.dropTarget = await p.evaluate(() => (window.LCNDA_EXT.dropTargets || []).some(t => t.id === 'album_photo' && (t.kinds || []).includes('media')));
        // 🔎 enquêter sur l'album : une enquête avec ses 3 photos, dans l'ordre de l'album
        if (await p.evaluate(() => !!window.LCNDA_EXT.enquetePhoto)) {
            await p.evaluate(id => window.LCNDA_EXT.albums.inquire(id), aid);
            await p.waitForSelector('dialog.ep-dlg .ep-chip', { timeout: 15000 }).catch(() => null); await sleep(1200);
            B.inquiry = await p.evaluate(() => { const t = window.LCNDA_EXT.enquetePhoto.current; return t ? { title: t.inq.title, media: t.images.map(i => i.media_id), classement: !!document.querySelector('dialog.h-modal[open] [data-c3-list]') } : null; });
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await sleep(500);
        }
        out.media = m; out.aid = aid;

        /* ═════ 390 px, sombre : la vue d'un album et 📖 ne débordent pas ═════ */
        await p.setViewportSize({ width: 390, height: 844 });
        await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
        await p.evaluate(id => { const v = JSON.parse(localStorage.getItem('genealogie-documents-tab') || '{}'); localStorage.setItem('genealogie-documents-tab', JSON.stringify({ ...v, mode: 'albums', wsAlbum: String(id), cur: 0 })); window.LCNDA_APP.renderSidebar(); window.LCNDA_EXT.onglets.documents.render(); }, aid);
        await p.waitForSelector('#workspace [data-alb-tile]', { timeout: 10000 }); await sleep(400);
        B.narrow = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: innerWidth, tiles: [...document.querySelectorAll('#workspace [data-alb-tile]')].every(t => t.getBoundingClientRect().right <= innerWidth + 1) }));
        await p.click(`#workspace [data-alb-flip="${aid}"]`); await p.waitForSelector('dialog.alb-flip[open]'); await sleep(200);
        B.narrowFlip = await p.evaluate(() => { const r = document.querySelector('dialog.alb-flip[open]').getBoundingClientRect(); return { left: r.left, right: r.right, vw: innerWidth }; });
        await shot('alb-390.png');
        await p.evaluate(() => document.querySelector('dialog.alb-flip')?.close());
        await p.setViewportSize({ width: 1440, height: 900 });
        await p.evaluate(() => { delete document.documentElement.dataset.theme; });

        /* ═════ mode consultation : l'album confidentiel et la photo d'une vivante cachés, lecture seule ═════ */
        const priv = await post('create', { title: 'Album secret', media_ids: [m['ferme.png']], is_private: 1 });
        const kin = await p.evaluate(() => window.LCNDA_APP.api('kiosk_enter', {}, { method: 'POST', body: { password: 'secret-1234' } }).then(() => true, e => e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.albums && document.body.classList.contains('is-kiosk'), null, { timeout: 30000 });
        const kl = (await get('list')).albums;
        const kg = (await get('get', { id: aid })).album;
        out.kiosk = { entered: kin, titles: kl.map(a => a.title), privGet: (await get('get', { id: priv.r.id })).error || '', items: kg.items.map(i => i.media_id), hidden: kg.hidden, write: await post('update', { id: aid, title: 'Piraté' }), idxHasPlage: Object.keys((await get('index')).of).includes(String(m['plage.png'])) };
        await p.evaluate(id => { const v = JSON.parse(localStorage.getItem('genealogie-documents-tab') || '{}'); localStorage.setItem('genealogie-documents-tab', JSON.stringify({ ...v, mode: 'albums', wsAlbum: String(id), cur: 0 })); window.LCNDA_APP.renderSidebar(); window.LCNDA_EXT.onglets.documents.render(); }, aid);
        await p.waitForSelector('#workspace [data-alb-tile]', { timeout: 10000 }); await sleep(300);
        out.kiosk.ui = await p.evaluate(() => ({ edit: !!document.querySelector('#workspace [data-alb-edit], #workspace [data-alb-addph], #workspace [data-alb-cap], #workspace [data-alb-imenu]'), drag: !!document.querySelector('#workspace [data-alb-tile][draggable="true"]'), flip: !!document.querySelector('#workspace [data-alb-flip]'), hid: document.querySelector('#workspace .alb-hid')?.textContent || '' }));
        await p.evaluate(() => window.LCNDA_APP.api('kiosk_exit', {}, { method: 'POST', body: { password: 'secret-1234' } }).catch(() => null));
        out.errs = errs;
    } finally { await browser.close(); proc.kill(); }
}

(async () => {
    const out = {};
    const it = (id, page_break = 0, y = null) => ({ id, page_break, caption: '', media: { title: `Photo ${id}`, year: y } });
    const checks = [
        ['📄 pages : 5 photos, 2 par page → 3 pages (2, 2, 1) ; « nouvelle page avant » sur la 2ᵉ → 1, 2, 2 ; 6 par page → 1 page', () => {
            assert.deepEqual(K.pages([1, 2, 3, 4, 5].map(i => it(i)), 2).map(p => p.map(x => x.id)), [[1, 2], [3, 4], [5]]);
            assert.deepEqual(K.pages([it(1), it(2, 1), it(3), it(4), it(5)], 2).map(p => p.map(x => x.id)), [[1], [2, 3], [4, 5]]);
            assert.equal(K.pages([1, 2, 3, 4, 5].map(i => it(i)), 6).length, 1); assert.equal(K.okPer(5), 4); assert.deepEqual(K.pages([], 4), []); }],
        ['📅 dates d’après les photos : 1920, 1905 et une sans date → « 1905–1920 » ; une seule année → « 1912 » ; aucune → rien', () => {
            assert.deepEqual(K.range([it(1, 0, 1920), it(2, 0, 1905), it(3)]), { from: 1905, to: 1920, text: '1905–1920' });
            assert.equal(K.range([{ media: { date_text: 'vers 1912' } }]).text, '1912'); assert.equal(K.range([it(1)]), null); }],
        ['↕ glisser : la 3ᵉ en tête ; ↑ ↓ d’une place ; un id absent ne change rien ; n° de page de chaque photo', () => {
            assert.deepEqual(K.move([1, 2, 3, 4], 2, 0), [3, 1, 2, 4]); assert.deepEqual(K.moveBy([1, 2, 3], 2, 1), [1, 3, 2]); assert.deepEqual(K.moveBy([1, 2, 3], 1, -1), [1, 2, 3]);
            assert.deepEqual(K.moveBy([1, 2], 9, 1), [1, 2]); assert.deepEqual(K.pageOf([it(1), it(2), it(3)], 2), { 1: 1, 2: 1, 3: 2 }); }],
        ['🏷 légende montrée : celle écrite, sinon le titre du document', () => { assert.equal(K.captionOf({ caption: ' La noce ', media: { title: 'x' } }), 'La noce'); assert.equal(K.captionOf({ caption: '', media: { title: 'La ferme' } }), 'La ferme'); }],
    ];
    let chromiumOk = !!chromium;
    if (chromiumOk) {
        try { await browserPart(out); } catch (e) { console.error(e); chromiumOk = false; checks.push(['navigateur', () => { throw e; }]); }
    }
    if (chromiumOk) {
        const S = out.server, B = out.ui, m = out.media;
        checks.push(
            ['structure n°115 : les tables photo_albums et photo_album_items', () => { assert.equal(out.seed.v, out.seed.want); assert.equal(out.seed.want, 115); assert.match(out.seed.tables, /photo_albums/); assert.match(out.seed.tables, /photo_album_items/); }],
            ['créer : 3 photos dans l’ordre donné, 2 par page, dates calculées 1905–1920, la 1ʳᵉ photo en couverture', () => { assert.deepEqual(S.created.order, [m['noce.png'], m['ecole.png'], m['plage.png']]); assert.equal(S.created.per, 2); assert.equal(S.created.range.text, '1905–1920'); assert.equal(S.created.cover, m['noce.png']); }],
            ['une photo dans deux albums ; un média inconnu n’est pas ajouté', () => { assert.deepEqual(S.twoAlbums.sort(), ['Album de la famille MAZAUD', 'Les écoles']); assert.equal(S.bad, 0); }],
            ['réordonner : le nouvel ordre ; l’ordre d’avant est rendu (↶ Annuler)', () => { assert.deepEqual(S.reorder.after, [m['plage.png'], m['noce.png'], m['ecole.png']]); assert.equal(S.reorder.before.length, 3); }],
            ['légende enregistrée (et l’ancienne rendue) ; retirer puis remettre une photo, à sa place ; une photo déjà là : ignorée', () => { assert.equal(S.caption.now, 'Le jour de la noce, devant la mairie'); assert.equal(S.caption.before, ''); assert.equal(S.removed, 2); assert.deepEqual(S.restored, [m['noce.png'], m['ecole.png'], m['plage.png']]); assert.equal(S.dup, 0); }],
            ['les albums de chaque média (colonne de Documents) : place dans l’album', () => { assert.deepEqual(S.idx.of[m['ecole.png']].map(x => x[1]).sort(), [1, 2]); assert.ok(S.idx.albums.length >= 2); }],
            ['supprimer un album : les photos restent ; ↶ Annuler le remet avec ses photos', () => { assert.ok(S.deleted); assert.deepEqual(S.undoDelete, { ok: true, back: 'Les écoles', n: 1 }); }],
            ['Documents : la grille garde 9 cases (pas de 10ᵉ) ; « 📚 Recueils » → le petit choix « 📚 Recueils | 📒 Albums photo »', () => { assert.equal(B.grid.length, 9, JSON.stringify(B.grid)); assert.ok(B.grid.includes('📚 Recueils')); assert.deepEqual(B.toggle, ['📚 Recueils', '📒 Albums photo']);
                assert.deepEqual(B.gridAfter, { n: 9, active: '📒 Albums', sub: '📒 Albums photo' }); }],
            ['la colonne : chaque album (dates · nombre), ses photos « n° 1, 2… » dans l’ordre, puis « Dans aucun album »', () => { assert.ok(B.column.heads.some(h => /📒 Album de la famille MAZAUD\s*1905–1920 · 3/.test(h)), JSON.stringify(B.column.heads)); assert.ok(B.column.heads.some(h => /Dans aucun album/.test(h)));
                assert.ok(B.column.rows.slice(0, 3).every((r, i) => r.startsWith(`n° ${i + 1}`)), JSON.stringify(B.column.rows)); }],
            ['à droite : les albums en vignettes (titre, dates, nombre de photos)', () => { assert.ok(B.cards.some(c => /Album de la famille MAZAUD/.test(c) && /1905–1920/.test(c) && /3 photos/.test(c)), JSON.stringify(B.cards)); }],
            ['un album : ses photos dans l’ordre, numérotées, avec les pages (2 par page → « page 1 », « page 2 »)', () => { assert.equal(B.tiles0.length, 3); assert.deepEqual(B.pages, ['page 1', 'page 2']); }],
            ['↕ glisser une photo à sa place : enregistré ; ↶ Annuler remet l’ordre', () => { assert.deepEqual(B.dragServer, [B.tiles0[2], B.tiles0[0], B.tiles0[1]]); assert.deepEqual(B.dragged, B.dragServer); assert.ok(B.dragUndo); assert.deepEqual(B.afterUndo, B.tiles0); }],
            ['⋯ d’une photo : ↓ Reculer, couverture, nouvelle page, retirer ; ↓ enregistré', () => { assert.ok(B.itemMenu.some(t => /Reculer/.test(t)) && B.itemMenu.some(t => /couverture/.test(t)) && B.itemMenu.some(t => /Nouvelle page/.test(t)) && B.itemMenu.some(t => /Retirer de l’album/.test(t)), JSON.stringify(B.itemMenu));
                assert.deepEqual(B.moved, [B.tiles0[1], B.tiles0[0], B.tiles0[2]]); }],
            ['légende écrite sur place : enregistrée, « Légende enregistrée » + ↶ Annuler', () => { assert.equal(B.capSaved, 'La classe de 1912'); assert.ok(B.capToast); }],
            ['📖 feuilleter : couverture, puis 2 photos par page avec leurs légendes, ‹ › et flèches, la dernière page arrête « Suivante »', () => { assert.equal(B.flip.cover, 'Album de la famille MAZAUD'); assert.equal(B.flip.pos0, 'Couverture'); assert.equal(B.flip.page1.figs, 2); assert.equal(B.flip.page1.pos, 'Page 1 sur 2');
                assert.ok(B.flip.page1.cap.includes('Le jour de la noce, devant la mairie') && B.flip.page1.cap.includes('La classe de 1912'), JSON.stringify(B.flip.page1.cap)); assert.equal(B.flip.page2.figs, 1); assert.equal(B.flip.page2.next, true); }],
            ['⋯ de l’album : Imprimer, Exporter, Enquêter, Personnaliser, Supprimer ; 🖨 la fenêtre Imprimer commune (photos par page, légendes), aperçu en pages', () => { assert.ok(['Imprimer', 'Exporter', 'Enquêter', 'Personnaliser', 'Supprimer'].every(w => B.more.some(t => t.includes(w))), JSON.stringify(B.more));
                assert.deepEqual(B.print, { per: true, captions: true, key: 'album-photo' }); assert.ok(B.printPrev >= 2, String(B.printPrev)); }],
            ['⚙️ Personnaliser : photos par page d’un nouvel album, tourner les pages', () => { assert.deepEqual(B.prefs, { per: true, turn: true }); }],
            ['« ☑ Choisir plusieurs » → « 📒 Mettre dans un album… » → nouvel album, dans l’ordre des clics ; le choix se ferme', () => { assert.ok(B.pickBtn && !B.pickBtn.disabled, JSON.stringify(B.pickBtn)); assert.ok(B.pickMenu.some(t => /nouvel album/i.test(t)) && B.pickMenu.some(t => /Album de la famille MAZAUD/.test(t)), JSON.stringify(B.pickMenu));
                assert.deepEqual(B.picked, [m['ferme.png'], m['noce.png']]); assert.equal(B.pickOff, true); }],
            ['☑ Cocher : la barre commune propose « 📒 Mettre dans un album… » ; 📍 « Mettre dans… » a « Un album photo… »', () => { assert.ok(B.selAction.some(t => /album/i.test(t)), JSON.stringify(B.selAction)); assert.ok(B.dropTarget); }],
            ['🔎 Enquêter sur cet album : une enquête « Album « … » » avec ses 3 photos, ouverte sur « 📒 Classement d’un album »', () => { if (!B.inquiry) return; assert.match(B.inquiry.title, /Album de la famille MAZAUD/); assert.deepEqual(B.inquiry.media, [m['noce.png'], m['ecole.png'], m['plage.png']]); assert.ok(B.inquiry.classement); }],
            ['390 px, sombre : l’album et 📖 ne débordent pas', () => { assert.ok(B.narrow.sw <= B.narrow.vw + 1 && B.narrow.tiles, JSON.stringify(B.narrow)); assert.ok(B.narrowFlip.left >= -1 && B.narrowFlip.right <= B.narrowFlip.vw + 1, JSON.stringify(B.narrowFlip)); }],
            ['consultation : l’album confidentiel caché (liste et lien direct) ; la photo de Marie LACOMBE (vivante) cachée, comptée ; rien ne s’écrit', () => { const Kk = out.kiosk; assert.equal(Kk.entered, true); assert.ok(!Kk.titles.includes('Album secret'), JSON.stringify(Kk.titles)); assert.match(Kk.privGet, /introuvable/);
                assert.deepEqual(Kk.items, [m['noce.png'], m['ecole.png']]); assert.equal(Kk.hidden, 1); assert.equal(Kk.write.ok, false); assert.equal(Kk.idxHasPlage, false); }],
            ['consultation : on feuillette, aucun bouton qui modifie, pas de glisser ; « photos cachées » dit', () => { const U = out.kiosk.ui; assert.deepEqual({ edit: U.edit, drag: U.drag, flip: U.flip }, { edit: false, drag: false, flip: true }); assert.match(U.hid, /1 photos? de personnes vivantes/); }],
            ['aucune erreur JS', () => assert.deepEqual(out.errs, [], JSON.stringify(out.errs))],
        );
    } else if (!chromium) console.log('  (Playwright absent : la partie navigateur n’est pas vérifiée)');
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
    console.log(failed ? `${failed} échec(s) sur ${checks.length}` : `${checks.length} vérifications réussies`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
