'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🌐 Mon site web — l'essai COMPLET, commande par commande (comme l'audit Word / Excel) :   node tests/test-site-web-complet.js
 * Chaque commande de l'éditeur (barre du haut, menus Fichier / Édition / Insertion / Affichage, colonne d'outils, barre du milieu,
 * panneau de gauche : blocs, pages, styles ; panneau « Ceci est… » ; code HTML / CSS / JS : complétion, Emmet, fermeture,
 * retrait ; synchronisation code ⇄ aperçu ; glisser ; touches ; modèles ; versions ; export ZIP et page ; aperçu ↗ ;
 * publier Netlify / GitHub / FTP (réponses simulées) ; widgets de bureau ; liste des Outils de modification) est essayée
 * dans le vrai écran, et son RÉSULTAT est vérifié (la page, le code, l'aperçu, la base, le fichier). Le .zip exporté est ouvert :
 * HTML bien formé, liens entre pages, images, CSP, aucune personne vivante ni fiche confidentielle.
 * À la fin : le tableau commande → OK (et l'essai échoue si une commande ne marche pas). Captures : SITE_SHOTS=dossier.
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-site-complet-'));
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const SHOTS = process.env.SITE_SHOTS || '';
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const hasPy = spawnSync('python3', ['-c', 'import zipfile'], { encoding: 'utf8' }).status === 0;
const results = [];
let group = '';
/** une commande : son essai ; une erreur est notée (et l'essai continue, pour voir toutes les commandes) */
async function cmd(name, fn) {
    if (process.env.SITE_LOG) console.log('…', name);
    let t; const limit = new Promise((_, no) => { t = setTimeout(() => no(new Error('trop long (45 s)')), 45000); });
    try { await Promise.race([fn(), limit]); results.push([group, name, 'OK']); }
    catch (e) { results.push([group, name, `ÉCHEC : ${String(e.message || e).split('\n')[0].slice(0, 200)}`]); if (process.env.SITE_LOG) console.log('   ✗', results.at(-1)[2], String(e.message || e).split('\n').slice(1, 12).join(' | ')); }
    finally { clearTimeout(t); }
}
const must = (c, m) => { if (!c) throw new Error(m || 'résultat inattendu'); };
const until = async (read, ok, ms = 6000) => { let v; for (let i = 0; i < ms / 100; i++) { try { v = await read(); if (ok(v)) return v; } catch (_) { /* pas encore */ } await new Promise(r => setTimeout(r, 100)); } return v; };

(async () => {
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
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'post_max_size=64M', '-d', 'memory_limit=1024M', '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let pw = null; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); proc.kill(); mockSrv.close(); return; }
    const browser = await pw.chromium.launch();
    try {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
        await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-edittools-tab', 'website'); localStorage.removeItem('genealogie-site-web'); } catch (_) {} });
        const page = await ctx.newPage(); page.setDefaultTimeout(6000); const errors = [];
        page.on('pageerror', e => errors.push('pageerror ' + e.message + ' @ ' + String(e.stack || '').split('\n').slice(1, 3).join(' '))); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|ERR_/.test(m.text())) errors.push('console ' + m.text()); });
        page.on('dialog', d => { errors.push('alert ' + d.message()); d.dismiss(); });
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.siteWeb && window.LCNDA_EXT?.openDiagramEditor, null, { timeout: 30000 });
        const wait = ms => page.waitForTimeout(ms);
        const api = (action, body, get = false) => page.evaluate(async ({ action, body, get }) => { try { const r = get ? await window.LCNDA_APP.api(action, body || {}) : await window.LCNDA_APP.api(action, {}, { method: 'POST', body }); return { ok: true, r }; } catch (e) { return { ok: false, e: e.message }; } }, { action, body, get });
        const dgId = (await api('save_diagram', { name: 'Âges au décès', kind: 'columns', spec: { kind: 'columns', o: { title: 'Âges' } } })).r.result.id;
        // le menu de choix, la fenêtre des images et des polices répondent tout seuls (on essaie l'éditeur, pas eux)
        await page.evaluate(dg => {
            const P = window.LCNDA_PICKER || window.LCNDA_APP;
            P.openPicker = async o => (o.kind === 'diagram' ? { id: dg, title: 'Âges au décès' } : o.kind === 'place' ? { id: 1, title: 'Tulle' } : { id: 1, title: 'Jean MARTIN' });
            P.openMediaPicker = async o => { const m = { id: 1, title: 'Jean au marché', filename: 'jean.jpg' }; return o?.multiple ? [m] : m; };
            window.LCNDA_UI.openFontPicker = async () => 'Verdana';
        }, dgId);
        if (process.env.SITE_LOG) { await page.evaluate(() => { const P = window.LCNDA_EXT.siteWeb.Editor.prototype, r = P.reload; window.__reloads = 0; P.reload = function () { window.__reloads++; return r.call(this); }; }); setInterval(() => page.evaluate(() => window.__reloads).then(n => console.log('   (recharges de l’aperçu :', n, ')')).catch(() => {}), 20000).unref(); }
        const C = () => page.evaluate(() => { const c = window.LCNDA_EXT.siteWeb.current; return c && { html: c.page().html, css: c.site.css, js: c.site.js, theme: c.site.theme, settings: c.site.settings, pages: c.site.pages.map(p => ({ name: p.name, slug: p.slug, title: p.title, desc: p.desc })), pageIdx: c.pageIdx, id: c.id, dirty: c.dirty, view: c.view, device: c.device, zoom: c.zoom, mode: c.mode, sel: c.sel && { tag: c.sel.tag, cls: c.sel.cls, id: c.sel.id, name: c.sel.name, path: c.sel.path, block: c.sel.block }, name: c.name, frozen: Object.keys(c.site.frozen || {}) }; });
        const fr = page.frameLocator('[data-sw-frame]');
        const frame = () => page.frames().find(f => f.url() === 'about:srcdoc');
        const pick = async (css, pos = { x: 3, y: 3 }) => { await fr.locator(css).first().click({ position: pos }); await wait(250); await page.evaluate(() => document.querySelectorAll('[data-sw-panel] details:not([open])').forEach(d => { d.open = true; })); await wait(60); }; // les sections du panneau, ouvertes (retenues)
        const menu = async (m, label) => { await page.click(`.sw-dlg [data-ui-menu="${m}"]`); await page.locator('.ui-actmenu .ui-actmenu-i', { hasText: label }).first().click(); await wait(300); };
        const ask = async v => { await page.waitForSelector('.ask-text-dialog input'); await page.fill('.ask-text-dialog input', v); await page.click('.ask-text-dialog [data-ask-ok]'); await wait(350); };
        const undoToast = async () => { await page.locator('.ui-toast button', { hasText: 'Annuler' }).last().click(); await wait(400); };
        const count = async css => fr.locator(css).count();
        const setField = (css, v) => page.evaluate(({ css, v }) => { const el = document.querySelector(css); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, { css, v });
        const leftTab = async t => { const pane = page.locator('[data-sw-leftpane]'); if (await pane.isHidden()) await page.click(`.sw-rail [data-sw-left="${t}"]`); await page.click(`[data-sw-leftpane] .sw-lefttabs [data-sw-left="${t}"]`); await wait(150); };
        const codeTab = async t => { if ((await C()).view === 'visual') await page.click('[data-sw-view="split"]'); await page.click(`[data-sw-tab="${t}"]`); await wait(100); };
        const typeCode = async (at, text) => { await page.evaluate(at => { const t = document.querySelector('.swc-ta'); const i = at === 'end' ? t.value.length : at; t.focus(); t.setSelectionRange(i, i); }, at); await page.keyboard.type(text); await wait(300); };
        const restoreCode = async v => { await page.evaluate(v => { const t = document.querySelector('.swc-ta'); t.value = v; t.dispatchEvent(new Event('input', { bubbles: true })); }, v); await wait(400); };
        const shot = async n => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `complet-${n}.png`) }); };

        /* ═════ La liste et les modèles ═════ */
        group = 'Liste et modèles';
        await page.evaluate(() => { window.LCNDA_APP.state.listType = 'edit_tools'; window.LCNDA_APP.setModule('listes'); });
        await page.waitForSelector('[data-et-tab="website"].is-active');
        for (const [key, pages] of [['famille', 4], ['ancetre', 4], ['village', 3], ['artiste', 4]]) {
            await cmd(`Modèle « ${key} »`, async () => {
                await page.evaluate(async key => { const t = window.LCNDA_EXT.siteKit.TEMPLATES.find(x => x.key === key); const d = await t.make(); void window.LCNDA_EXT.siteWeb.open({ data: d, name: d.settings.title }); }, key);
                await page.waitForSelector('dialog.sw-dlg[open] [data-sw-frame]'); await fr.locator('header').first().waitFor();
                const c = await C(); must(c.pages.length === pages, `${c.pages.length} pages`);
                await until(() => count('.lc-note'), n => !n, 8000); // les blocs de la généalogie se remplissent
                must(!/⏳/.test(await fr.locator('body').textContent()), 'un bloc reste à remplir');
                await page.evaluate(() => { const c = window.LCNDA_EXT.siteWeb.current; c.dirty = false; c.close(); }); await wait(200);
            });
        }
        await cmd('＋ Nouveau site → Page vide', async () => {
            await page.click('.h-et-bar [data-et-new]'); await page.waitForSelector('dialog[open] .sw-tpl');
            must(await page.locator('dialog[open] .sw-tpl').count() === 5, 'les 5 modèles');
            await page.click('dialog[open] [data-tpl="blank"]'); await page.waitForSelector('dialog.sw-dlg[open] [data-sw-frame]'); await fr.locator('header.site-entete').waitFor();
        });
        await wait(500);

        /* ═════ Barre du haut (E1) ═════ */
        group = 'Barre du haut';
        await cmd('Nom du site (tapable)', async () => { await page.fill('[data-sw-name]', 'Site complet'); await wait(100); must((await C()).name === 'Site complet'); });
        await cmd('💾 Enregistrer', async () => { await page.click('.ui-topbar [data-sw-cmd="save"]'); await until(() => page.textContent('.sw-dlg [data-ui-status]'), t => /Enregistré/.test(t)); must((await C()).id > 0, 'pas de numéro'); });
        await cmd('« ✓ Enregistré » → « • modifié » après un changement', async () => { await pick('h2'); await page.fill('[data-sw-at="data-lc-name"]', 'Titre'); await page.press('[data-sw-at="data-lc-name"]', 'Tab'); await wait(200); must(/modifié/.test(await page.textContent('.sw-dlg [data-ui-status]'))); });
        await cmd('↶ Annuler (barre)', async () => { await page.click('.ui-topbar [data-ui-cmd="undo"]'); await wait(300); must(!/data-lc-name="Titre"/.test((await C()).html)); });
        await cmd('↷ Rétablir (barre)', async () => { await page.click('.ui-topbar [data-ui-cmd="redo"]'); await wait(300); must(/data-lc-name="Titre"/.test((await C()).html)); });
        await cmd('💾 ▾ Enregistrer une copie…', async () => {
            const n0 = (await api('websites', {}, true)).r.items.length; await page.click('.sw-dlg .ed-save-more'); await page.locator('.ui-actmenu .ui-actmenu-i', { hasText: 'copie' }).click(); await ask('Copie du site'); await wait(500);
            const l = (await api('websites', {}, true)).r.items; must(l.length === n0 + 1 && l.some(x => x.name === 'Copie du site'), 'copie absente');
        });
        await cmd('💾 ▾ Enregistrer comme nouvelle version', async () => { await page.click('.sw-dlg .ed-save-more'); await page.locator('.ui-actmenu .ui-actmenu-i', { hasText: 'version' }).click(); await ask('V1'); await wait(500); must((await api('website_versions', { site_id: (await C()).id }, true)).r.items.some(v => v.label === 'V1')); });
        await cmd('💾 ▾ Ouvrir l’aperçu dans le navigateur', async () => {
            const [pop] = await Promise.all([page.waitForEvent('popup'), (async () => { await page.click('.sw-dlg .ed-save-more'); await page.locator('.ui-actmenu .ui-actmenu-i', { hasText: 'aperçu' }).click(); })()]);
            await pop.waitForLoadState(); must(/action=website_preview/.test(pop.url())); must(/Mon site/.test(await pop.textContent('body'))); await pop.close();
        });
        await cmd('⛶ Plein écran', async () => { const a = await page.locator('dialog.sw-dlg').evaluate(d => d.classList.contains('is-full')); await page.click('.sw-dlg [data-full-toggle="website"]'); await wait(200); must(a !== await page.locator('dialog.sw-dlg').evaluate(d => d.classList.contains('is-full'))); await page.click('.sw-dlg [data-full-toggle="website"]'); });
        await shot('editeur');

        /* ═════ Colonne d'outils (K19) et barre du milieu ═════ */
        group = 'Colonne d’outils et barre du milieu';
        for (const [m, key] of [['text', 'T'], ['play', 'P'], ['select', 'V']]) await cmd(`Outil ${m === 'select' ? '↖ Choisir' : m === 'text' ? 'T Écrire' : '▶ Tester'}`, async () => { await page.click(`.sw-rail [data-sw-mode="${m}"]`); await wait(300); must((await C()).mode === m && await page.locator(`.sw-rail [data-sw-mode="${m}"].is-active`).count() === 1); });
        for (const t of ['pages', 'styles', 'blocks']) await cmd(`Panneau ${t === 'blocks' ? '＋ Blocs' : t === 'pages' ? '📄 Pages' : '🎨 Styles'}`, async () => { await page.click(`.sw-rail [data-sw-left="${t}"]`); await wait(150); if (await page.locator('[data-sw-leftpane]').isHidden()) await page.click(`.sw-rail [data-sw-left="${t}"]`); must(await page.locator(`[data-sw-leftpane] .sw-lefttabs [data-sw-left="${t}"].is-active`).count() === 1); });
        await cmd('</> Montrer / cacher le code', async () => { await page.click('[data-sw-view="visual"]'); await page.click('.sw-rail [data-sw-view-toggle]'); await wait(150); must((await C()).view === 'split'); });
        for (const v of ['visual', 'code', 'split']) await cmd(`Affichage ${v}`, async () => { await page.click(`[data-sw-view="${v}"]`); await wait(150); must(await page.locator('[data-sw-work]').getAttribute('data-view') === v); });
        for (const [d, w] of [['phone', '390px'], ['tablet', '820px'], ['desktop', '1280px']]) await cmd(`Écran ${d}`, async () => { await page.click(`.sw-bar [data-sw-device="${d}"]`); await wait(150); must(await page.locator('[data-sw-devbox]').evaluate(e => e.style.width) === w); });
        await cmd('Zoom − / + (barre du bas K18)', async () => { const z0 = (await C()).zoom; await page.click('.sw-dlg [data-ed-zoom="in"]'); await wait(150); const z1 = (await C()).zoom; await page.click('.sw-dlg [data-ed-zoom="out"]'); await wait(150); must(z1 > z0 && (await C()).zoom < z1, `${z0} ${z1}`); });

        /* ═════ Insertion (menu) et blocs ═════ */
        group = 'Blocs (menu Insertion et panneau ＋ Blocs)';
        const BLOCKS = await page.evaluate(() => window.LCNDA_EXT.siteKit.BLOCKS.map(b => [b.key, b.label, b.group]));
        for (const [key, label, g] of BLOCKS) {
            await cmd(`${label} (${key})`, async () => {
                await page.click('[data-sw-view="visual"]');
                const n0 = await count('[data-lc-name], [data-lc-block]');
                await pick('footer'); // posé après l'élément choisi
                if (key === 'diagram') { await page.click('.sw-dlg [data-ui-menu="Insertion"]'); await page.locator('.ui-actmenu .ui-actmenu-i', { hasText: label }).first().click(); await page.click('dialog[open] [data-dg-way="pick"]'); }
                else await menu('Insertion', label);
                await until(() => count('[data-lc-name], [data-lc-block]'), n => n > n0, 4000);
                must(await count('[data-lc-name], [data-lc-block]') > n0, 'rien de posé');
                if (g === 'genea') { await until(() => frame().evaluate(() => document.body.textContent), t => !/⏳/.test(t), 15000); must(!/⏳|Bloc inconnu|impossible/.test(await frame().evaluate(() => document.body.textContent)), 'bloc pas rempli'); }
                if (key === 'image') must(/src="media\/jean\.jpg"/.test((await C()).html), 'image absente du code');
            });
        }
        await cmd('Glisser un bloc du panneau dans l’aperçu', async () => {
            await leftTab('blocks'); const n0 = await count('blockquote.citation');
            // le glisser HTML5 d'un cadre à l'autre n'est pas joué par Playwright : les mêmes évènements, envoyés à la main
            await page.evaluate(() => document.querySelector('[data-sw-block="quote"]').dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() })));
            await frame().evaluate(() => { const t = document.querySelector('body > section'), r = t.getBoundingClientRect(), o = { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 4, dataTransfer: new DataTransfer() }; t.dispatchEvent(new DragEvent('dragover', o)); t.dispatchEvent(new DragEvent('drop', o)); });
            await until(() => count('blockquote.citation'), n => n > n0, 3000); must(await count('blockquote.citation') > n0);
        });
        await cmd('Cliquer un bloc du panneau (posé après l’élément choisi)', async () => { await pick('h2'); const n0 = await count('.colonnes'); await page.click('[data-sw-block="cols"]'); await wait(400); must(await count('.colonnes') === n0 + 1); });

        /* ═════ Menu Édition ═════ */
        group = 'Menu Édition et touches';
        await cmd('Édition → Dupliquer', async () => { await pick('blockquote.citation'); const n0 = await count('blockquote.citation'); await menu('Édition', 'Dupliquer'); must(await count('blockquote.citation') === n0 + 1); });
        await cmd('Édition → Monter', async () => { await pick('footer'); const i0 = (await C()).sel.path.at(-1); await menu('Édition', 'Monter'); must((await C()).sel.path.at(-1) === i0 - 1); });
        await cmd('Édition → Descendre', async () => { const i0 = (await C()).sel.path.at(-1); await menu('Édition', 'Descendre'); must((await C()).sel.path.at(-1) === i0 + 1); });
        await cmd('Édition → Voir l’élément dans le code', async () => { await page.click('[data-sw-view="visual"]'); await pick('footer'); await menu('Édition', 'Voir'); must((await C()).view === 'split' && await page.locator('.swc-mark:not([hidden])').count() === 1); });
        await cmd('Édition → Supprimer (puis ↶ dans le message)', async () => { const n0 = await count('blockquote.citation'); await pick('blockquote.citation'); await menu('Édition', 'Supprimer'); must(await count('blockquote.citation') === n0 - 1, 'pas retiré'); await undoToast(); must(await count('blockquote.citation') === n0, '↶ ne remet pas'); });
        await cmd('Édition → Annuler / Rétablir', async () => { const h0 = (await C()).html; await pick('h2'); await page.click('[data-sw-role="0"]'); await wait(300); must((await C()).html !== h0); await menu('Édition', 'Annuler'); must((await C()).html === h0, 'annuler'); await menu('Édition', 'Rétablir'); must((await C()).html !== h0, 'rétablir'); await menu('Édition', 'Annuler'); });
        await cmd('Touche Suppr (élément choisi)', async () => { await pick('blockquote.citation'); const n0 = await count('blockquote.citation'); await frame().locator('body').press('Delete'); await wait(300); must(await count('blockquote.citation') === n0 - 1); await undoToast(); });
        await cmd('Touches V / T / P / B', async () => { await page.focus('.sw-rail [data-sw-mode="select"]'); for (const [k, m] of [['t', 'text'], ['p', 'play'], ['v', 'select']]) { await page.keyboard.press(k); await wait(250); must((await C()).mode === m, k); } await page.keyboard.press('b'); await wait(100); must(await page.locator('[data-sw-leftpane] .sw-lefttabs [data-sw-left="blocks"].is-active').count() === 1, 'b'); });
        await cmd('⌘S (dans l’aperçu)', async () => { await pick('h2'); await page.click('[data-sw-role="3"]'); await wait(200); await frame().locator('body').press('Control+s'); await until(() => page.textContent('.sw-dlg [data-ui-status]'), t => /Enregistré/.test(t)); must(/Enregistré/.test(await page.textContent('.sw-dlg [data-ui-status]'))); });
        await cmd('⌘Z / ⇧⌘Z (hors des cases)', async () => { const h0 = (await C()).html; await pick('h2'); await page.click('[data-sw-role="4"]'); await wait(200); await page.focus('.sw-rail [data-sw-mode="select"]'); await page.keyboard.press('Control+z'); await wait(300); must((await C()).html === h0, 'z'); await page.keyboard.press('Control+Shift+z'); await wait(300); must((await C()).html !== h0, 'Z'); await page.keyboard.press('Control+z'); await wait(200); });
        await cmd('Alt + ↓ / ↑ (déplacer au clavier)', async () => { await pick('footer'); const i0 = (await C()).sel.path.at(-1); await frame().locator('body').press('Alt+ArrowUp'); await wait(300); must((await C()).sel.path.at(-1) === i0 - 1, '↑'); await frame().locator('body').press('Alt+ArrowDown'); await wait(300); must((await C()).sel.path.at(-1) === i0, '↓'); });
        await cmd('Glisser un élément à la souris (ligne bleue)', async () => {
            await page.click('[data-sw-view="visual"]'); await wait(300);
            const f = frame(), a = await f.locator('footer').first().boundingBox(), b = await f.locator('body > section').first().boundingBox();
            await page.mouse.move(a.x + 30, a.y + 8); await page.mouse.down(); await page.mouse.move(b.x + 40, b.y + 6, { steps: 8 }); await page.mouse.move(b.x + 40, b.y + 3, { steps: 2 });
            must(await f.locator('#lcb-ov .lcb-drop').evaluate(e => getComputedStyle(e).display) === 'block', 'pas de ligne'); await page.mouse.up(); await wait(400);
            const h = (await C()).html; must(h.indexOf('<footer') < h.indexOf('<section'), 'pas déplacé'); await page.click('.ui-topbar [data-ui-cmd="undo"]'); await wait(300);
        });

        /* ═════ Aperçu ═════ */
        group = 'Aperçu (cadre isolé)';
        await cmd('Clic : « Ceci est… »', async () => { await pick('a.site-nom'); const s = (await C()).sel; must(s.tag === 'a' && s.cls === 'site-nom' && /a\.site-nom/.test(await page.textContent('.sw-this code'))); });
        await cmd('Double-clic sur un texte → T Écrire', async () => { await fr.locator('h2').first().dblclick(); await wait(300); must((await C()).mode === 'text'); });
        await cmd('T Écrire : le texte tapé va dans le code', async () => { await fr.locator('section.section p').first().click(); await page.keyboard.press('End'); await page.keyboard.type(' Ajouté.'); await wait(600); must(/Ajouté\./.test((await C()).html) && !/contenteditable/.test((await C()).html)); await page.click('.sw-rail [data-sw-mode="select"]'); });
        await cmd('▶ Tester : lien vers une autre page', async () => {
            await page.evaluate(() => { void window.LCNDA_EXT.siteWeb.current.pageAction('add', 0); }); await ask('Deuxième'); await page.evaluate(() => window.LCNDA_EXT.siteWeb.current.goPage(0)); await wait(300);
            await page.click('.sw-rail [data-sw-mode="play"]'); await wait(500); await fr.locator('.lc-menu-list a', { hasText: 'Deuxième' }).first().click(); await wait(500); must((await C()).pageIdx === 1, 'page pas changée');
            await page.evaluate(() => window.LCNDA_EXT.siteWeb.current.goPage(0)); await page.click('.sw-rail [data-sw-mode="select"]'); await wait(300);
        });
        await cmd('▶ Tester : lien vers un autre site (message)', async () => { await page.click('.sw-rail [data-sw-mode="play"]'); await wait(400); await page.evaluate(() => window.LCNDA_EXT.siteWeb.current.post({ type: 'noop' })); await frame().evaluate(() => { const a = document.createElement('a'); a.href = 'https://exemple.fr/'; a.textContent = 'ext'; document.body.appendChild(a); a.click(); }); await wait(300); must(await page.locator('.ui-toast', { hasText: 'exemple.fr' }).count() >= 1); await page.click('.sw-rail [data-sw-mode="select"]'); await wait(300); });
        await cmd('▶ Tester : mes scripts tournent, isolés de l’app', async () => { await codeTab('js'); await page.evaluate(() => { const t = document.querySelector('.swc-ta'); t.focus(); t.select(); }); await page.keyboard.type('let s = ""; try { s = typeof parent.document; } catch (e) { s = "isolé"; } document.body.dataset.t = s;'); await page.click('.sw-rail [data-sw-mode="play"]'); must(await until(() => fr.locator('body').getAttribute('data-t'), v => v === 'isolé') === 'isolé'); await page.click('.sw-rail [data-sw-mode="select"]'); await wait(300); });

        /* ═════ Panneau « Ceci est… » (E2) ═════ */
        group = 'Panneau « Ceci est… »';
        const ROLES = [['header', 'En-tête'], ['nav', 'Menu'], ['main', 'Contenu principal'], ['section', 'Section'], ['footer', 'Pied de page'], ['div', 'Carte']];
        for (const [i, [tag, name]] of ROLES.entries()) await cmd(`Rôle « ${name} »`, async () => { await pick('body > section'); const h0 = (await C()).html; await page.click(`[data-sw-role="${i}"]`); await wait(300); const s = (await C()).sel; must(s.tag === tag && s.name === name, `${s.tag} ${s.name}`); if ((await C()).html !== h0) { await page.click('.ui-topbar [data-ui-cmd="undo"]'); await wait(250); } must((await C()).html === h0, '↶'); });
        await cmd('Nom (pour toi)', async () => { await pick('body > section'); await page.fill('[data-sw-at="data-lc-name"]', 'Mon texte'); await page.press('[data-sw-at="data-lc-name"]', 'Tab'); await wait(250); must(/data-lc-name="Mon texte"/.test((await C()).html)); });
        await cmd('Balise', async () => { await pick('body > section h2'); await page.selectOption('[data-sw-tag]', 'h3'); await wait(300); must(/<h3>Un titre/.test((await C()).html) || /<h3[^>]*>/.test((await C()).html)); await page.click('.ui-topbar [data-ui-cmd="undo"]'); await wait(250); });
        await cmd('Classe(s)', async () => { await pick('body > section'); await page.fill('[data-sw-at="class"]', 'section carte-famille'); await page.press('[data-sw-at="class"]', 'Tab'); await wait(300); must(/class="section carte-famille"/.test((await C()).html)); });
        await cmd('id', async () => { await page.fill('[data-sw-at="id"]', 'notre histoire!'); await page.press('[data-sw-at="id"]', 'Tab'); await wait(300); must(/id="notre-histoire-"/.test((await C()).html), (await C()).html.slice(0, 200)); });
        for (const [act, check] of [['up', s => s], ['down', s => s], ['dup', s => s], ['parent', s => s], ['code', s => s]]) await cmd(`Bouton ${act === 'up' ? '↑' : act === 'down' ? '↓' : act === 'dup' ? '⧉' : act === 'parent' ? '⤴ (parent)' : '</> (code)'}`, async () => {
            await pick('footer p'); if (act !== 'parent' && act !== 'code') await pick('footer');
            const s0 = (await C()).sel, h0 = (await C()).html; await page.click(`[data-sw-panel] [data-sw-act="${act}"]`); await wait(300); const s1 = (await C()).sel;
            if (act === 'up') must(s1.path.at(-1) === s0.path.at(-1) - 1); if (act === 'down') must(s1.path.at(-1) === s0.path.at(-1) + 1 || s1.path.at(-1) === s0.path.at(-1)); if (act === 'dup') must((await C()).html.length > h0.length);
            if (act === 'parent') must(s1.path.length === s0.path.length - 1); if (act === 'code') must(await page.locator('.swc-mark:not([hidden])').count() === 1); check(s1);
            if ((act === 'dup' || act === 'up' || act === 'down') && (await C()).html !== h0) { await page.click('.ui-topbar [data-ui-cmd="undo"]'); await wait(250); }
        });
        await cmd('Bouton 🗑 (puis ↶)', async () => { await pick('blockquote.citation'); const n0 = await count('blockquote.citation'); await page.click('[data-sw-panel] [data-sw-act="del"]'); await wait(300); must(await count('blockquote.citation') === n0 - 1); await undoToast(); must(await count('blockquote.citation') === n0); });
        await cmd('Image : 🖼 Changer l’image + texte de remplacement', async () => { await pick('figure.image img'); await page.click('[data-sw-panel] [data-sw-act="image"]'); await wait(300); await page.fill('[data-sw-at="alt"]', 'Jean au marché de Tulle'); await page.press('[data-sw-at="alt"]', 'Tab'); await wait(300); must(/alt="Jean au marché de Tulle"/.test((await C()).html)); });
        await cmd('Lien : adresse et pages du site', async () => { await pick('a.site-nom'); await page.locator('[data-sw-panel] .sw-chip[data-sw-act="link"]').last().click(); await wait(300); const last = (await C()).pages.at(-1).slug; must(new RegExp(`class="site-nom" href="${last}\\.html"`).test((await C()).html), (await C()).html.slice(0, 300)); await page.fill('[data-sw-at="href"]', 'javascript:alert(1)'); await page.press('[data-sw-at="href"]', 'Tab'); await wait(300); must(!/javascript:/.test((await C()).html), 'javascript: accepté'); });
        // les styles : cet élément / la classe, survol, taille d'écran
        await cmd('Appliquer à « Cet élément seulement » → style="…"', async () => { await pick('body > section h2'); await page.selectOption('[data-sw-to]', 'el'); await page.click('[data-sw-panel] [data-sw-act="align"][data-v="center"]'); await wait(300); must(/<h2[^>]*style="text-align: center"/.test((await C()).html), (await C()).html.match(/<h2[^>]*>/g)?.join(' ')); });
        await cmd('Par défaut : « Tous les éléments .classe » → vraie règle CSS', async () => { await pick('body > section'); must(await page.inputValue('[data-sw-to]') === 'class:section', 'pas la classe par défaut'); await page.click('[data-sw-panel] [data-sw-act="align"][data-v="right"]'); await wait(300); must(/\n\.section \{[^}]*text-align: right;/.test((await C()).css), (await C()).css.slice(-300)); });
        await cmd('Règle mise à jour, sans doublon', async () => { await page.click('[data-sw-panel] [data-sw-act="align"][data-v="left"]'); await wait(300); const css = (await C()).css; must((css.match(/\.section \{/g) || []).length === 1 && /text-align: left;/.test(css) && !/text-align: right/.test(css), css.slice(-300)); });
        await cmd('Le code CSS se met à jour en direct', async () => { await codeTab('css'); must(/text-align: left;/.test(await page.inputValue('.swc-ta'))); });
        await cmd('Au survol (:hover)', async () => { await page.click('[data-sw-panel] [data-sw-state=":hover"]'); await setField('[data-sw-panel] input[data-sw-st="color"]', '#ff0000'); await wait(300); must(/\.section:hover \{[^}]*color: #ff0000;/.test((await C()).css)); await page.click('[data-sw-panel] [data-sw-state=""]'); });
        await cmd('Taille d’écran : 📱 Téléphone → @media', async () => { await page.click('[data-sw-panel] [data-sw-screen="phone"]'); await wait(200); must((await C()).device === 'phone', 'aperçu pas en téléphone'); await setField('[data-sw-panel] input[data-sw-st="padding"]', '7'); await wait(300); must(/@media \(max-width: 480px\) \{\s*\.section \{\s*padding: 7px;/.test((await C()).css), (await C()).css.slice(-200)); must(await fr.locator('body > section').first().evaluate(e => getComputedStyle(e).paddingTop) === '7px', 'aperçu pas à jour'); });
        await cmd('Taille d’écran : 💻 Tablette → @media', async () => { await page.click('[data-sw-panel] [data-sw-screen="tablet"]'); await setField('[data-sw-panel] input[data-sw-st="padding"]', '9'); await wait(300); must(/@media \(max-width: 820px\) \{\s*\.section \{\s*padding: 9px;/.test((await C()).css)); await page.click('[data-sw-panel] [data-sw-screen="all"]'); await page.click('.sw-bar [data-sw-device="desktop"]'); });
        await cmd('Cet élément + survol → règle #id:hover (id donné tout seul)', async () => { await pick('a.site-nom'); await page.selectOption('[data-sw-to]', 'el'); await page.click('[data-sw-panel] [data-sw-state=":hover"]'); await setField('[data-sw-panel] input[data-sw-st="color"]', '#00ff00'); await wait(400); const c = await C(); must(/id="el-[a-z0-9]+"/.test(c.html) && /#el-[a-z0-9]+:hover \{[^}]*color: #00ff00;/.test(c.css)); await page.click('[data-sw-panel] [data-sw-state=""]'); });
        await cmd('↶ annule un style écrit dans le CSS', async () => { const css0 = (await C()).css; await pick('body > section'); await page.click('[data-sw-panel] [data-sw-act="align"][data-v="center"]'); await wait(300); must((await C()).css !== css0); await page.click('.ui-topbar [data-ui-cmd="undo"]'); await wait(300); must((await C()).css === css0); });
        await cmd('Changer le CSS dans le code → le panneau relit', async () => { await pick('body > section'); await codeTab('css'); await typeCode('end', '\n.section { margin-top: 33px; }'); await wait(600); must(await page.locator('[data-sw-panel] input[data-sw-st="margin-top"]').inputValue() === '33', await page.locator('[data-sw-panel] input[data-sw-st="margin-top"]').inputValue()); });
        for (const [prop, v, re] of [['margin-top', '12', /margin-top: 12px/], ['margin-bottom', '14', /margin-bottom: 14px/], ['padding', '16', /padding: 16px/], ['max-width', '600', /max-width: 600px/], ['border-radius', '5', /border-radius: 5px/], ['font-size', '20', /font-size: 20px/], ['color', '#123456', /color: #123456/], ['background-color', '#abcdef', /background-color: #abcdef/]]) {
            await cmd(`Curseur / couleur « ${prop} »`, async () => { await pick('blockquote.citation'); await page.selectOption('[data-sw-to]', 'el'); await setField(`[data-sw-panel] input[data-sw-st="${prop}"]`, v); await wait(250); must(re.test((await C()).html), (await C()).html.match(/<blockquote[^>]*>/)?.[0]); });
        }
        await cmd('Sans fond', async () => { await page.click('[data-sw-panel] [data-sw-act="nobg"]'); await wait(250); must(!/blockquote[^>]*background-color/.test((await C()).html)); });
        await cmd('Police (E5)', async () => { await page.click('[data-sw-panel] [data-sw-act="font"]'); await wait(300); must(/blockquote[^>]*font-family: 'Verdana'/.test((await C()).html)); });
        await cmd('Gras (interrupteur)', async () => { await page.check('[data-sw-panel] input[data-sw-st="font-weight"]', { force: true }); await wait(250); must(/blockquote[^>]*font-weight: bold/.test((await C()).html)); });
        // les options des blocs de la généalogie
        const blockOpt = async (sel, fn) => { await page.click('[data-sw-view="visual"]'); await pick(sel); await fn(); await wait(600); };
        await cmd('Arbre : générations', async () => { await blockOpt('[data-lc-block="tree"]', () => page.selectOption('[data-sw-ba="gens"]', '2')); must(/data-lc-block="tree"[^>]*data-gens="2"/.test((await C()).html)); must(await until(() => fr.locator('[data-lc-block="tree"] .lc-tree-col').count(), n => n === 2) === 2, 'pas redessiné'); });
        await cmd('Carte : lieux de la personne / et ses ancêtres', async () => { await blockOpt('[data-lc-block="map"]', () => page.selectOption('[data-sw-ba="scope"]', 'person')); must(/data-lc-block="map"[^>]*data-scope="person"/.test((await C()).html)); });
        await cmd('Carte : fond de carte (liste des Réglages)', async () => { await pick('[data-lc-block="map"]'); must(await page.locator('[data-sw-ba="fond"] optgroup').count() >= 2); await page.selectOption('[data-sw-ba="fond"]', 'osmfr'); await wait(500); must(/data-fond="osmfr"/.test((await C()).html)); must(await until(() => fr.locator('[data-lc-block="map"] .lc-map-img').count(), n => n === 1, 20000) === 1, 'pas d’image'); });
        await cmd('Carte : interactive (bouge aussi dans l’éditeur)', async () => {
            await pick('[data-lc-block="map"]'); await page.check('[data-sw-panel] input[data-sw-ba="vive"]', { force: true }); await wait(800);
            must(await until(() => fr.locator('.lc-carte-vive[data-lcv-on] button').count(), n => n === 2, 8000) === 2, 'pas de ＋ −');
            const t0 = await fr.locator('.lc-carte-vive img').nth(1).getAttribute('src'); await fr.locator('.lc-carte-vive button').first().click(); await wait(300);
            must(await fr.locator('.lc-carte-vive img').nth(1).getAttribute('src') !== t0, 'le zoom ne change rien');
        });
        await cmd('Chiffres : naissances / prénoms', async () => { await blockOpt('[data-lc-block="chart"]', () => page.selectOption('[data-sw-ba="chart"]', 'prenoms')); must(await until(() => fr.locator('[data-lc-block="chart"] .lc-bar').count(), n => n > 0) > 0); });
        await cmd('Photos : au plus N', async () => { await blockOpt('[data-lc-block="photos"]', () => page.selectOption('[data-sw-ba="max"]', '6')); must(/data-max="6"/.test((await C()).html)); });
        await cmd('Personne : Changer…', async () => { await blockOpt('[data-lc-block="person"]', () => page.click('[data-sw-panel] [data-sw-act="block-person"]')); must(/data-lc-block="person"[^>]*data-person="1"/.test((await C()).html)); });
        await cmd('Lieu : Changer…', async () => { await blockOpt('[data-lc-block="place"]', () => page.click('[data-sw-panel] [data-sw-act="block-place"]')); must(/data-lc-block="place"[^>]*data-place="1"/.test((await C()).html) && /Gens de Tulle/.test((await C()).html)); });
        await cmd('Diagramme : Changer… / ✎ Modifier', async () => { await blockOpt('[data-lc-block="diagram"]', () => page.click('[data-sw-panel] [data-sw-act="dg-pick"]')); must(/data-diagram="\d+"/.test((await C()).html)); await page.click('[data-sw-panel] [data-sw-act="dg-edit"]'); await page.waitForSelector('dialog.h-dg-dlg[open], dialog[open] .h-dg-edit, .h-dg-dlg', { timeout: 5000 }); await page.evaluate(() => { const d = [...document.querySelectorAll('dialog[open]')].pop(); if (d && !d.classList.contains('sw-dlg')) d.close(); }); await wait(300); });

        /* ═════ Panneau 📄 Pages ═════ */
        group = 'Pages';
        await leftTab('pages');
        await cmd('＋ Nouvelle page', async () => { const n0 = (await C()).pages.length; await page.click('[data-sw-page="add"]'); await ask('Nos photos'); const c = await C(); must(c.pages.length === n0 + 1 && c.pages.at(-1).slug === 'nos-photos' && c.pageIdx === n0); must(await fr.locator('.lc-menu-list a', { hasText: 'Nos photos' }).count() === 1, 'pas dans le menu'); });
        await cmd('Ouvrir une page (liste et menu déroulant)', async () => { await page.click('[data-sw-open-page="0"]'); await wait(300); must((await C()).pageIdx === 0); await page.selectOption('select[data-sw-page]', '1'); await wait(300); must((await C()).pageIdx === 1); });
        await cmd('✎ Renommer (adresse refaite)', async () => { await page.click('[data-sw-page="rename"][data-sw-pi="1"]'); await ask('Les nôtres'); const p = (await C()).pages[1]; must(p.name === 'Les nôtres' && p.slug === 'les-notres'); });
        await cmd('⠿ Ranger une page (Alt + ↓ / ↑ sur la poignée, K20)', async () => { const n = (await C()).pages.map(p => p.name); await page.locator('.sw-pagerow').nth(1).locator('.dnd-grip').focus(); await page.keyboard.press('Alt+ArrowDown'); await wait(400); const m = (await C()).pages.map(p => p.name); must(m[2] === n[1] && m[1] === n[2], JSON.stringify(m)); await page.locator('.sw-pagerow').nth(2).locator('.dnd-grip').focus(); await page.keyboard.press('Alt+ArrowUp'); await wait(400); must(JSON.stringify((await C()).pages.map(p => p.name)) === JSON.stringify(n)); });
        await cmd('⧉ Dupliquer', async () => { const n0 = (await C()).pages.length; await page.click('[data-sw-page="dup"][data-sw-pi="1"]'); await wait(300); must((await C()).pages.length === n0 + 1 && /\(copie\)/.test((await C()).pages[2].name)); });
        await cmd('🗑 Supprimer (puis ↶)', async () => { const n0 = (await C()).pages.length; await page.click('[data-sw-page="del"][data-sw-pi="2"]'); await wait(300); must((await C()).pages.length === n0 - 1); await undoToast(); must((await C()).pages.length === n0); await page.click('[data-sw-page="del"][data-sw-pi="2"]'); await wait(300); });
        await cmd('Titre, description, adresse de la page', async () => { await page.click('[data-sw-open-page="1"]'); await wait(200); await setField('[data-sw-pf="title"]', 'Notre famille — page 2'); await setField('[data-sw-pf="desc"]', 'La description'); await setField('[data-sw-pf="slug"]', 'Ma Page 2'); await wait(200); const p = (await C()).pages[1]; must(p.title === 'Notre famille — page 2' && p.desc === 'La description' && p.slug === 'ma-page-2', JSON.stringify(p)); await page.click('[data-sw-open-page="0"]'); });

        /* ═════ Panneau 🎨 Styles ═════ */
        group = 'Styles du site';
        await leftTab('styles');
        for (const [k, v] of [['primary', '#204060'], ['accent', '#aa6600'], ['bg', '#fafafa'], ['text', '#111111']]) await cmd(`Couleur ${k}`, async () => { await setField(`[data-sw-th="${k}"]`, v); await wait(250); must((await C()).theme[k] === v); const name = { primary: '--lc-principale', accent: '--lc-accent', bg: '--lc-fond', text: '--lc-texte' }[k]; const got = await until(() => frame().evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name), x => x === v, 3000); must(got === v, `aperçu pas à jour (${got})`); });
        for (const k of ['font', 'headFont']) await cmd(`Police ${k === 'font' ? 'du texte' : 'des titres'} (E5)`, async () => { await page.click(`[data-sw-font="${k}"]`); await wait(300); must((await C()).theme[k] === 'Verdana'); });
        for (const [k, v] of [['size', '19'], ['width', '900'], ['radius', '12']]) await cmd(`Curseur ${k}`, async () => { await setField(`[data-sw-th="${k}"]`, v); await wait(250); must(String((await C()).theme[k]) === v); });
        await cmd('Nom, description, langue du site', async () => { await setField('[data-sw-sf="title"]', 'Les Martin'); await setField('[data-sw-sf="desc"]', 'Notre famille'); await page.selectOption('[data-sw-sf="lang"]', 'oc'); await wait(400); const s = (await C()).settings; must(s.title === 'Les Martin' && s.desc === 'Notre famille' && s.lang === 'oc'); must(await frame().evaluate(() => document.documentElement.lang) === 'oc', 'langue pas appliquée'); });

        /* ═════ Code ═════ */
        group = 'Code (HTML, CSS, JS)';
        await cmd('Onglets HTML / CSS / JS', async () => { for (const t of ['css', 'js', 'html']) { await codeTab(t); must(await page.locator('.swc').getAttribute('data-lang') === t); } });
        await cmd('Taper du HTML → l’aperçu suit', async () => { await codeTab('html'); const i = (await page.inputValue('.swc-ta')).indexOf('<footer'); await typeCode(i, '<p class="ajout">Par le code</p>\n'); must(await until(() => count('p.ajout'), n => n === 1) === 1); });
        await cmd('Emmet HTML (Tab)', async () => { const i = (await page.inputValue('.swc-ta')).indexOf('<footer'); await typeCode(i, 'ul.liste>li*3'); await page.keyboard.press('Tab'); await wait(400); must(await until(() => count('ul.liste li'), n => n === 3) === 3); });
        await cmd('Fermeture automatique des balises', async () => { const i = (await page.inputValue('.swc-ta')).indexOf('<footer'); await typeCode(i, '<em>'); must((await page.inputValue('.swc-ta')).includes('<em></em>')); await page.keyboard.type('auto'); await wait(300); });
        await cmd('Complétion HTML (balise, attribut)', async () => { const v0 = await page.inputValue('.swc-ta'); const i = v0.indexOf('<footer'); await typeCode(i, '<sec'); must(await page.locator('.swc-pop:not([hidden]) .swc-opt', { hasText: 'section' }).count() >= 1, 'pas de liste'); await page.keyboard.press('Enter'); must((await page.inputValue('.swc-ta')).includes('<section')); await page.keyboard.type(' cl'); must(await page.locator('.swc-pop:not([hidden]) .swc-opt', { hasText: 'class' }).count() >= 1, 'attribut'); await page.keyboard.press('Escape'); await restoreCode(v0); });
        await cmd('Retour à la ligne : retrait gardé', async () => { const v0 = await page.inputValue('.swc-ta'); const i = v0.indexOf('<h2'); await page.evaluate(i => { const t = document.querySelector('.swc-ta'); t.focus(); t.setSelectionRange(i, i); }, i); await page.keyboard.press('Enter'); const v = await page.inputValue('.swc-ta'); const ind = /\n( *)<h2/.exec(v0)[1]; must(v.slice(i, i + 2 + ind.length * 2 + 3).includes(`\n${ind}<h2`), JSON.stringify(v.slice(i - 5, i + 20))); await restoreCode(v0); });
        await cmd('Tab / Maj + Tab (retrait)', async () => { const v0 = await page.inputValue('.swc-ta'); const i = v0.indexOf('\n<footer') + 1; await typeCode(i, ''); await page.keyboard.press('Tab'); must((await page.inputValue('.swc-ta')).slice(i, i + 9) === '  <footer', 'Tab'); await page.keyboard.press('Shift+Tab'); must(await page.inputValue('.swc-ta') === v0, 'Maj + Tab'); await restoreCode(v0); });
        await cmd('Clic dans le code → l’élément est choisi', async () => { await page.evaluate(() => { const t = document.querySelector('.swc-ta'); const i = t.value.indexOf('Par le code'); t.setSelectionRange(i + 2, i + 2); t.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await wait(400); must((await C()).sel?.cls === 'ajout'); });
        await cmd('Choisi dans l’aperçu → surligné dans le code', async () => { await pick('footer'); must(await page.locator('.swc-mark:not([hidden])').count() === 1); });
        await cmd('CSS : Emmet (m10) et complétion', async () => { await codeTab('css'); await typeCode('end', '\n.ajout { m10'); await page.keyboard.press('Tab'); await page.keyboard.type(' colo'); must(await page.locator('.swc-pop:not([hidden]) .swc-opt', { hasText: 'color' }).count() >= 1, 'pas de liste'); await page.keyboard.press('Enter'); await page.keyboard.type('rgb(9, 8, 7); }'); await wait(500); const v = await page.inputValue('.swc-ta'); must(/margin: 10px;/.test(v) && /color: rgb\(9, 8, 7\)/.test(v)); must(await until(() => fr.locator('p.ajout').evaluate(e => getComputedStyle(e).color), c => c === 'rgb(9, 8, 7)') === 'rgb(9, 8, 7)', 'aperçu'); });
        await cmd('JS : complétion', async () => { await codeTab('js'); await typeCode('end', '\ndocu'); must(await page.locator('.swc-pop:not([hidden]) .swc-opt', { hasText: 'document' }).count() >= 1); await page.keyboard.press('Escape'); await page.keyboard.type('ment.title = "x";'); await codeTab('html'); });

        /* ═════ Menu Fichier, versions, export, aperçu, publier ═════ */
        group = 'Fichier, versions, export';
        await cmd('Fichier → Enregistrer', async () => { await menu('Fichier', 'Enregistrer'); await until(() => page.textContent('.sw-dlg [data-ui-status]'), t => /Enregistré/.test(t)); must(/Enregistré/.test(await page.textContent('.sw-dlg [data-ui-status]'))); });
        await cmd('Fichier → Enregistrer comme nouvelle version', async () => { await menu('Fichier', 'nouvelle version'); await ask('V2'); must((await api('website_versions', { site_id: (await C()).id }, true)).r.items.some(v => v.label === 'V2')); });
        await cmd('Fichier → 🕘 Versions… (L3 : ↺ Revenir, 🗑 + ↶)', async () => {
            const R = 'dialog.ui-vers [data-vers-row]:not([data-vers-row="now"])';
            await menu('Fichier', 'Versions'); await page.waitForSelector(R); await wait(300);
            const n0 = await page.locator(R).count(); await page.locator(R).first().click(); await page.click('dialog.ui-vers [data-vers-act="more"]'); await page.locator('.ui-actmenu .ui-actmenu-i', { hasText: 'Supprimer' }).click(); await wait(500);
            must(await page.locator(R).count() === n0 - 1, 'pas supprimée'); await undoToast(); await wait(400); must(await page.locator(R).count() === n0, '↶');
            await page.locator(R).last().click(); await wait(300); await page.click('dialog.ui-vers [data-vers-act="restore"]'); await wait(800); must((await C()).pages.length === 1, 'pas reprise (V1 : une page)');
            await page.click('dialog.ui-vers [data-vers-close]'); await wait(200); await page.click('.ui-topbar [data-ui-cmd="undo"]'); await wait(500); must((await C()).pages.length > 1, '↶ après reprise');
        });
        await cmd('Fichier → Nouveau site… (modèles)', async () => { await menu('Fichier', 'Nouveau site'); await page.waitForSelector('dialog[open] .sw-tpl'); await page.evaluate(() => [...document.querySelectorAll('dialog[open]')].pop().close()); await wait(200); });
        let zipPath = '';
        await cmd('⤓ Exporter → 🗜 Site complet (.zip)', async () => { await page.click('.ui-topbar [data-sw-cmd="export"]'); await page.waitForSelector('dialog.ui-export[open]'); must(/page/.test(await page.textContent('dialog.ui-export[open] .ui-export-info'))); const [dl] = await Promise.all([page.waitForEvent('download'), page.click('dialog.ui-export[open] [data-ui-go]')]); zipPath = path.join(dir, 'export.zip'); await dl.saveAs(zipPath); must(fs.statSync(zipPath).size > 1000); });
        await cmd('⤓ Exporter → 🌐 Cette page seule (.html)', async () => { await menu('Fichier', 'Exporter'); await page.waitForSelector('dialog.ui-export[open]'); await page.click('dialog.ui-export[open] [data-fmt="html"]'); const [dl] = await Promise.all([page.waitForEvent('download'), page.click('dialog.ui-export[open] [data-ui-go]')]); const p2 = path.join(dir, 'page.html'); await dl.saveAs(p2); const t = fs.readFileSync(p2, 'utf8'); must(/^<!doctype html>/.test(t) && /<style>/.test(t) && /data:image\/jpeg;base64/.test(t)); });
        await cmd('Fichier → Ouvrir l’aperçu dans le navigateur', async () => { const [pop] = await Promise.all([page.waitForEvent('popup'), menu('Fichier', 'aperçu')]); await pop.waitForLoadState(); const r = await fetch(pop.url().replace(/^http:\/\/[^/]+\//, base)); must(/^sandbox allow-scripts/.test(r.headers.get('content-security-policy') || '')); await pop.close(); });
        await cmd('↗ Aperçu (barre du milieu)', async () => { const [pop] = await Promise.all([page.waitForEvent('popup'), page.click('.sw-bar [data-sw-cmd="browser"]')]); await pop.waitForLoadState(); must(/website_preview/.test(pop.url())); await pop.close(); });
        await cmd('📤 Publier → Netlify (réponses simulées)', async () => { await page.click('.sw-bar [data-sw-cmd="publish"]'); await page.waitForSelector('dialog[open] [data-pub-pane]:not([hidden])'); await page.click('dialog[open] [data-pub-tab="netlify"]'); await page.fill('dialog[open] input[name="token_netlify"]', mock.token); await page.click('dialog[open] .modal-actions button[type="submit"]'); await page.waitForSelector('dialog[open] [data-pub-out] a[href="https://essai-lcnda.netlify.app"]', { timeout: 20000 }); });
        await cmd('📤 Publier → GitHub Pages (réponses simulées)', async () => { await page.click('dialog[open] [data-pub-tab="github"]'); await page.fill('dialog[open] input[name="token_github"]', mock.ghToken); await page.fill('dialog[open] input[name="repo"]', 'notre-site'); await page.click('dialog[open] .modal-actions button[type="submit"]'); await page.waitForSelector('dialog[open] [data-pub-out] a[href="https://victor.github.io/notre-site/"]', { timeout: 20000 }); });
        await cmd('📤 Publier → FTP sécurisé (serveur introuvable : message clair)', async () => { if (!await page.locator('dialog[open] [data-pub-tab="ftps"]').count()) return; await page.click('dialog[open] [data-pub-tab="ftps"]'); await page.fill('dialog[open] input[name="host"]', 'ftp.exemple.invalid'); await page.fill('dialog[open] input[name="user"]', 'moi'); await page.fill('dialog[open] input[name="pass"]', 'secret'); await page.click('dialog[open] .modal-actions button[type="submit"]'); await page.waitForSelector('dialog[open] [data-pub-out] .ui-notice-error', { timeout: 40000 }); must(/ne répond pas|FTP/.test(await page.textContent('dialog[open] [data-pub-out]'))); });
        await cmd('📤 × Oublier les jetons', async () => { await page.click('dialog[open] .modal-actions [data-h-close]'); await wait(300); await page.click('.sw-bar [data-sw-cmd="publish"]'); await page.waitForSelector('dialog[open] [data-pub-pane]:not([hidden])', { timeout: 20000 }); for (const p of ['netlify', 'github', 'ftps']) { if (await page.locator(`dialog[open] [data-pub-tab="${p}"]`).count()) await page.click(`dialog[open] [data-pub-tab="${p}"]`); const b = page.locator(`dialog[open] [data-pub-forget="${p}"]`); if (await b.count()) { await b.click(); await wait(400); } } const st = (await api('website_publish_state', { id: (await C()).id }, true)).r; must(!st.netlify.has_token && !st.github.has_token && !st.ftps.has); await page.click('dialog[open] .modal-actions [data-h-close]'); });
        await cmd('Fichier → Fermer (avec des changements : on demande)', async () => { await pick('h2'); await page.click('[data-sw-role="5"]'); await wait(200); await menu('Fichier', 'Fermer'); await page.waitForSelector('.confirm-box-dialog[open]'); await page.locator('.confirm-box-dialog[open] .modal-actions button').last().click(); await wait(400); must(!await page.locator('dialog.sw-dlg[open]').count()); });

        /* ═════ Le .zip exporté, ouvert et vérifié ═════ */
        group = 'Le site exporté (.zip)';
        if (zipPath && hasPy) {
            const check = spawnSync('python3', ['-I', '-c', String.raw`
import zipfile, sys, json, re
from html.parser import HTMLParser
VOID = {'area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr'}
OPT = {'p','li','td','th','tr','option','dt','dd','thead','tbody'}
z = zipfile.ZipFile(sys.argv[1]); names = set(z.namelist()); out = {'files': sorted(names), 'pages': {}}
for n in names:
    if not n.endswith('.html'): continue
    t = z.read(n).decode('utf-8'); stack = []; errs = []; refs = []
    class P(HTMLParser):
        def handle_starttag(self, tag, a):
            a = dict(a)
            for k in ('href', 'src'):
                if a.get(k): refs.append(a[k])
            if tag not in VOID: stack.append(tag)
        def handle_endtag(self, tag):
            if tag in VOID: return
            while stack and stack[-1] != tag and stack[-1] in OPT: stack.pop()
            if stack and stack[-1] == tag: stack.pop()
            else: errs.append('fermeture </%s> sans ouverture (ligne %d : %s)' % (tag, self.getpos()[0], t.split('\n')[self.getpos()[0] - 1].strip()[:120]))
    p = P(); p.feed(t); p.close()
    left = [x for x in stack if x not in OPT]
    if left: errs.append('balises pas fermées : %s' % left)
    out['pages'][n] = {'errs': errs, 'refs': refs, 'doctype': t.lower().startswith('<!doctype html>'), 'csp': "script-src 'self'" in t, 'lang': bool(re.search(r'<html lang="[a-z]{2}', t)), 'charset': '<meta charset="utf-8">' in t, 'title': bool(re.search(r'<title>[^<]+</title>', t)), 'text': t}
out['js'] = z.read('js/script.js').decode('utf-8') if 'js/script.js' in names else ''
css = z.read('css/style.css').decode('utf-8'); out['cssurls'] = re.findall(r'url\(["\']?([^"\')]+)', css); out['css'] = css
print(json.dumps(out))`, zipPath], { encoding: 'utf8' });
            const Z = JSON.parse(check.stdout || '{}');
            await cmd('Fichiers du site', async () => { must(Z.files.includes('index.html') && Z.files.includes('css/style.css') && Z.files.includes('js/script.js') && Z.files.some(f => /^images\//.test(f)), Z.files.join(', ')); });
            await cmd('📦 LISEZ-MOI.txt et LISEZ-MOI.html (MAMP, WAMP, double-clic, hébergeur)', async () => { must(Z.files.includes('LISEZ-MOI.txt') && Z.files.includes('LISEZ-MOI.html'), 'absents'); const t = Z.pages['LISEZ-MOI.html'].text; must(/MAMP/.test(t) && /WAMP/.test(t) && /XAMPP/.test(t) && /double-clic/.test(t) && /hébergeur/.test(t) && !Z.pages['LISEZ-MOI.html'].errs.length, 'contenu'); });
            await cmd('📦 Aucun chemin absolu ni adresse de l’app', async () => { for (const [n, p] of Object.entries(Z.pages || {})) { if (/^LISEZ-MOI/.test(n)) continue; must(!/(src|href)="\/(?!\/)|127\.0\.0\.1|localhost|api\.php|\/assets\//.test(p.text), `${n} : chemin absolu`); } must(!/url\(["']?\//.test(Z.css) && !/127\.0\.0\.1|api\.php/.test(Z.css), 'css : chemin absolu'); });
            for (const [n, p] of Object.entries(Z.pages || {})) {
                if (/^LISEZ-MOI/.test(n)) continue;
                await cmd(`${n} : HTML bien formé`, async () => { must(!p.errs.length, p.errs.join(' ; ')); });
                await cmd(`${n} : doctype, langue, charset, titre, CSP`, async () => { must(p.doctype && p.lang && p.charset && p.title && p.csp); });
                await cmd(`${n} : liens entre pages et images présents`, async () => { const bad = p.refs.filter(r => !/^(https?:|mailto:|tel:|#|data:)/.test(r)).map(r => r.split('#')[0]).filter(r => r && !Z.files.includes(r)); must(!bad.length, `introuvables : ${bad.join(', ')}`); must(!p.refs.some(r => /^media\//.test(r)), 'adresse media/ de l’app'); });
                await cmd(`${n} : aucune personne vivante ni confidentielle`, async () => { must(!/Lucie|SECRET|Secret/.test(p.text), 'nom caché présent'); must(!/nfp_|github_pat|Bearer/.test(p.text), 'jeton'); must(!/contenteditable|data-lcb|lcb-ov/.test(p.text), 'restes de l’éditeur'); });
            }
            await cmd('css/style.css : images présentes, couleurs du site', async () => { const bad = Z.cssurls.filter(u => !/^(data:|https?:|#)/.test(u) && !(u.startsWith('../') && Z.files.includes(u.slice(3)))); must(!bad.length, bad.join(', ')); must(/--lc-principale:#204060/.test(Z.css)); });
            // le site ouvert dans un vrai navigateur, depuis le disque
            const out = path.join(dir, 'site'); fs.mkdirSync(out, { recursive: true }); spawnSync('python3', ['-I', '-c', 'import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', zipPath, out]);
            await cmd('Le site s’ouvre d’un double-clic (sans erreur, images chargées)', async () => {
                const sp = await ctx.newPage(); const errs = []; sp.on('pageerror', e => errs.push(e.message)); sp.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) errs.push(m.text()); });
                await sp.goto('file://' + path.join(out, 'index.html')); await sp.waitForTimeout(800);
                const broken = await sp.evaluate(() => [...document.images].filter(i => /^images\//.test(i.getAttribute('src') || '') && !i.naturalWidth).map(i => i.getAttribute('src')));
                must(!broken.length, `images cassées : ${broken.join(', ')}`); must(!errs.length, errs.join(' ; '));
                must(!!await sp.evaluate(() => document.body.dataset.t), 'js/script.js n’a pas tourné');
                must(await sp.locator('.lc-carte-vive[data-lcv-on] button').count() === 2, 'carte interactive absente en file://');
                const links = await sp.evaluate(() => [...document.querySelectorAll('.lc-menu-list a')].map(a => a.getAttribute('href'))); must(links.length >= 2, 'menu');
                await sp.click('.lc-menu-list a >> nth=1'); await sp.waitForTimeout(400); must(/\.html$/.test(sp.url()) && !/index\.html$/.test(sp.url()), 'lien de page'); await sp.close();
            });
            // 📦 comme dans MAMP / WAMP : servi par un vrai serveur, à la racine puis dans un sous-dossier
            const htdocs = path.join(dir, 'htdocs'); fs.mkdirSync(htdocs, { recursive: true }); fs.cpSync(out, path.join(htdocs, 'mon-site'), { recursive: true });
            for (const [label, root, sub] of [['à la racine du serveur', out, '/'], ['dans un sous-dossier (http://localhost/mon-site/)', htdocs, '/mon-site/']]) {
                await cmd(`📦 Servi ${label} : toutes les pages, sans 404 ni erreur`, async () => {
                    const sport = await freePort(); const srv = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${sport}`, '-t', root], { cwd: root, stdio: 'ignore' });
                    try {
                        const sbase = `http://127.0.0.1:${sport}${sub}`;
                        for (let i = 0; i < 60; i++) { try { await fetch(sbase); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
                        const sp = await ctx.newPage(); const bad = [], errs = [];
                        sp.on('response', r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); }); sp.on('pageerror', e => errs.push(e.message)); sp.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) errs.push(m.text()); });
                        for (const n of Object.keys(Z.pages).filter(n => !/^LISEZ-MOI/.test(n)).concat('LISEZ-MOI.html')) {
                            await sp.goto(sbase + n); await sp.waitForTimeout(500);
                            const broken = await sp.evaluate(() => [...document.images].filter(i => /^images\//.test(i.getAttribute('src') || '') && !(i.complete && i.naturalWidth)).map(i => i.getAttribute('src')));
                            must(!broken.length, `${n} : images cassées ${broken.join(', ')}`);
                            if (n === 'index.html') { must(!!await sp.evaluate(() => document.body.dataset.t), `js/script.js n’a pas tourné (${errs.join(' ; ')} ${bad.join(' ')} ${JSON.stringify(Z.js || '').slice(0, 160)})`); }
                            if (await sp.locator('.lc-carte-vive').count()) must(await sp.locator('.lc-carte-vive[data-lcv-on] button').count() === 2, `${n} : carte`);
                        }
                        must(!bad.filter(b => b.includes(`127.0.0.1:${sport}`)).length, bad.join(', ')); must(!errs.length, errs.join(' ; ')); await sp.close();
                    } finally { srv.kill(); }
                });
            }
        }

        /* ═════ Widgets de bureau ═════ */
        group = 'Widgets de bureau';
        // sans attendre la promesse de setModule : le changement d'adresse (pushState) pendant l'attente faisait parfois perdre la main à Playwright
        await page.evaluate(() => { void window.LCNDA_APP.setModule('dashboard'); }); await page.waitForFunction(() => window.LCNDA_APP.state.module === 'dashboard'); await wait(1000);
        for (const k of ['today', 'ancestor', 'photo', 'calc', 'countdown']) await cmd(`Navigateur : ⤓ fichier .html « ${k} »`, async () => {
            await page.evaluate(() => { void window.LCNDA_EXT.deskWidgets.open(); }); await page.waitForSelector('dialog[open] .dw-kinds');
            const dg = page.locator('dialog[open]').last(); if (k === 'countdown') { await dg.locator('[data-dw-cd="date"]').fill('14/07/2027'); await dg.locator('[data-dw-cd="date"]').press('Tab'); await wait(700); } // la date se met en forme en quittant la case : attendre avant de cliquer
            const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), dg.locator(`[data-dw-file="${k}"]`).click()]); must(dl.suggestedFilename() === `widget-${k}.html`);
            const p2 = path.join(dir, `w-${k}.html`); await dl.saveAs(p2); const t = fs.readFileSync(p2, 'utf8'); must(/Content-Security-Policy/.test(t) && !/Lucie|Secret/.test(t));
            await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await wait(250);
        });
        await cmd('Application de bureau : poser, retirer, au-dessus, démarrage (pont simulé)', async () => {
            await page.evaluate(() => { const calls = window.__dw = []; window.lcnda = { desktopWidgets: { list: async () => ({ ok: true, platform: 'linux', autostart: false, widgets: { today: { open: calls.some(c => c[0] === 'open') && !calls.some(c => c[0] === 'close'), onTop: false } } }), open: async (k, o) => { calls.push(['open', k, o]); return { ok: true }; }, close: async k => { calls.push(['close', k]); return { ok: true }; }, set: async (k, o) => { calls.push(['set', k, o]); return { ok: true }; }, autostart: async on => { calls.push(['auto', on]); return { ok: true }; } } }; });
            await page.evaluate(() => { void window.LCNDA_EXT.deskWidgets.open('today'); }); await page.waitForSelector('dialog[open] [data-dw-open="today"]');
            await page.locator('dialog[open] [data-dw-top="today"]').evaluate(e => e.click()); await wait(200); await page.click('dialog[open] [data-dw-open="today"]'); await wait(300);
            await page.locator('dialog[open] [data-dw-auto]').evaluate(e => e.click()); await wait(300);
            await page.click('dialog[open] [data-dw-close="today"]'); await wait(300);
            const calls = await page.evaluate(() => window.__dw);
            must(calls.some(c => c[0] === 'open' && c[1] === 'today' && c[2].onTop === true), 'poser'); must(calls.some(c => c[0] === 'auto' && c[1] === true), 'démarrage'); must(calls.some(c => c[0] === 'close' && c[1] === 'today'), 'retirer');
            await page.evaluate(() => { delete window.lcnda; [...document.querySelectorAll('dialog[open]')].pop()?.close(); });
        });
        await cmd('🪟 sur la calculette', async () => { await page.evaluate(() => { void window.LCNDA_EXT.openCalculator?.(); }); await page.waitForSelector('#calculette [data-dw-put="calc"]', { timeout: 5000 }); await page.click('#calculette [data-dw-put="calc"]'); await page.waitForSelector('dialog[open] [data-dw-kind="calc"].is-focus'); await page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.querySelector('#calculette [data-cm-close]')?.click(); }); });

        /* ═════ La liste des Outils de modification ═════ */
        group = 'Liste des sites';
        await page.evaluate(() => { window.LCNDA_APP.state.listType = 'edit_tools'; window.LCNDA_APP.setModule('listes'); }); await page.waitForSelector('[data-et-tab="website"].is-active'); await wait(500);
        await cmd('La liste montre les sites (vignette, pages)', async () => { must(await page.locator('.h-et-page [data-et-open]').count() >= 2); must(/page/.test(await page.textContent('.h-et-page'))); });
        await cmd('Ouvrir depuis la liste', async () => { await page.locator('.h-et-page button[data-et-open]:visible').last().click(); await page.waitForSelector('dialog.sw-dlg[open] [data-sw-frame]'); await wait(400); await page.evaluate(() => { const c = window.LCNDA_EXT.siteWeb.current; c.dirty = false; c.close(); }); await wait(300); });
        await cmd('Renommer depuis la liste', async () => { await page.evaluate(() => { const b = document.querySelector('.h-et-page [data-et-ren]'); b?.click(); }); await ask('Renommé'); must((await api('websites', {}, true)).r.items.some(x => x.name === 'Renommé')); });
        await cmd('Supprimer depuis la liste', async () => { const n0 = (await api('websites', {}, true)).r.items.length; await page.evaluate(() => document.querySelector('.h-et-page [data-et-del]')?.click()); await page.waitForSelector('.confirm-box-dialog[open]'); await page.locator('.confirm-box-dialog[open] .modal-actions button').last().click(); await wait(500); must((await api('websites', {}, true)).r.items.length === n0 - 1); });

        group = 'Console';
        await cmd('Aucune erreur dans la console', async () => { must(!errors.length, errors.slice(0, 3).join(' ; ')); });
    } finally {
        await browser.close(); proc.kill(); mockSrv.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
    // le tableau
    const w = Math.max(...results.map(r => r[1].length)), bad = results.filter(r => r[2] !== 'OK');
    let g = '';
    for (const [gr, name, st] of results) { if (gr !== g) { console.log(`\n■ ${gr}`); g = gr; } console.log(`  ${name.padEnd(w)}  ${st}`); }
    console.log(`\n${results.length} commandes essayées : ${results.length - bad.length} OK, ${bad.length} en échec.`);
    if (process.env.SITE_TABLE) fs.writeFileSync(process.env.SITE_TABLE, JSON.stringify(results, null, 1));
    assert.equal(bad.length, 0, `commandes en échec : ${bad.map(b => b[1]).join(', ')}`);
})().catch(e => { console.error(e); process.exit(1); });
