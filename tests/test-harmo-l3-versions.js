'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * L3 — une seule fenêtre « 🕘 Versions » (app-versions.js) :   node tests/test-harmo-l3-versions.js
 *  1. Node : comparaison mot à mot (UI.versionsDiff : <del> à gauche, <ins> à droite, blancs gardés, échappement), rangement
 *     Aujourd’hui · Cette semaine · Plus ancien ;
 *  2. API : versions automatiques (colonne auto) du texte et du site ; renommer (texte, site, média, instantané de tableau) :
 *     nom vide refusé, l'original d'un média garde son nom, sans jeton CSRF refusé ;
 *  3. navigateur : traitement de texte (Fichier → 🕘 Versions… : filtres avec le nombre, « Maintenant » EN COURS, groupes, aperçu,
 *     deux cases = comparaison barré / ajouté, « ↺ Revenir » sans question puis ↶ Annuler, ⋯ Renommer, 🗑 + ↶) ; Mon site web
 *     (aperçu isolé sans script, comparaison, revenir + ↶) ; une photo retouchée (taille en pixels, trait à glisser, revenir à
 *     l'original + ↶, suppression différée puis ↶) ; sombre et 390 px sans débordement ; aucune erreur dans la console.
 *  Captures si L3_SHOTS=dossier.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const V = require('../assets/js/app-versions.js');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-l3-'));
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const SHOTS = process.env.L3_SHOTS || '';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    /* ═════ 1. Node ═════ */
    const d = V.diff('Marie naît à Tulle en 1872, fille de Jean, sabotier.', 'Marie naît à Tulle le 7 mai 1872, fille de Jean, cordonnier.');
    eq(d.left, 'Marie naît à Tulle <del>en</del> 1872, fille de Jean, <del>sabotier.</del>', 'diff : à gauche, ce qui part barré');
    ok(/<ins>le 7 mai <\/ins>1872/.test(d.right) && /<ins>cordonnier.<\/ins>/.test(d.right), 'diff : à droite, ce qui arrive');
    eq([d.added, d.removed, d.same], [4, 2, false], 'diff : mots ajoutés et retirés');
    ok(V.diff('a b', 'a b').same, 'diff : textes pareils');
    ok(!/<script/.test(V.diff('x', '<script>alert(1)</script>').right) && /&lt;script/.test(V.diff('x', '<script>').right), 'diff : texte échappé');
    ok(/<br>/.test(V.diff('un\ndeux', 'un\ntrois').left), 'diff : retours à la ligne');
    const big = 'mot '.repeat(3000); ok(V.diff(big, big + 'fin').added === 1, 'diff : long texte, vite');
    const now = new Date(2026, 9, 28, 15, 0);
    eq([V.groupOf(new Date(2026, 9, 28, 9, 5), now), V.groupOf(new Date(2026, 9, 25, 9), now), V.groupOf(new Date(2026, 9, 10), now), V.groupOf('', now)], ['today', 'week', 'older', 'older'], 'rangement Aujourd’hui · Cette semaine · Plus ancien');
    console.log(`✓ Node : ${n} vérifications`);

    /* ═════ 2 et 3. Serveur ═════ */
    {
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Marie','Peyre','female')"); $p = null;
require 'lib/bootstrap.php'; $pdo = db(); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
        if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
    }
    const port = Number(process.env.L3_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'post_max_size=64M', '-d', 'upload_max_filesize=32M', '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await wait(100); } }
    let pw = null; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    let browser = null;
    try {
        if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); return; }
        browser = await pw.chromium.launch();
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
        const page = await ctx.newPage(); const errors = [];
        page.on('pageerror', e => errors.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console ' + m.text()); });
        page.on('dialog', dl => { errors.push('alert ' + dl.message()); dl.dismiss(); });
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.openTextDoc && window.LCNDA_EXT?.openWebsite && window.LCNDA_UI?.openVersions, null, { timeout: 30000 }).catch(async e => { console.error(await page.evaluate(() => JSON.stringify({csrf: !!window.LCNDA_APP?.state?.csrf, td: !!window.LCNDA_EXT?.openTextDoc, ws: !!window.LCNDA_EXT?.openWebsite, v: !!window.LCNDA_UI?.openVersions}))); throw e; });
        const api = (action, body, get = false) => page.evaluate(async ({ action, body, get }) => { try { const r = get ? await window.LCNDA_APP.api(action, body || {}) : await window.LCNDA_APP.api(action, {}, { method: 'POST', body }); return { ok: true, r: r.result || r }; } catch (e) { return { ok: false, e: e.message }; } }, { action, body, get });
        const list = async () => (await page.locator('dialog.ui-vers [data-vers-list]').innerText()).replace(/\s*\n+\s*/g, ' | ');
        const R = 'dialog.ui-vers [data-vers-row]:not([data-vers-row="now"])';
        const undo = async () => { await page.locator('.ui-toast .ui-toast-btn', { hasText: 'Annuler' }).last().click(); await wait(700); };

        /* 2. API */
        const mk = t => ({ sections: [{ html: `<p data-st="normal">${t}</p>` }] });
        const T1 = 'Marie Peyre naît à Tulle en 1872, fille de Jean, sabotier, et d’Anne Borie.', T2 = 'Marie Peyre naît à Tulle le 7 mai 1872, fille de Jean, cordonnier, et d’Anne Borie.', T3 = T2 + ' Elle grandit rue de la Barrière.';
        const doc = (await api('save_textdoc', { name: 'Biographie de Marie Peyre', kind: 'doc', data: mk(T3) })).r; const did = Number(doc.id);
        const v1 = (await api('save_textdoc_version', { doc_id: did, label: 'Brouillon 2', data: mk(T1) })).r;
        const v2 = (await api('save_textdoc_version', { doc_id: did, label: '', auto: 1, data: mk(T2) })).r;
        eq(v2.label, 'Enregistrement automatique', 'texte : une version automatique sans nom');
        eq((await api('textdoc_versions', { doc_id: did }, true)).r.items.map(x => [x.label, x.auto]), [['Enregistrement automatique', 1], ['Brouillon 2', 0]], 'texte : liste avec « auto »');
        ok(!(await api('rename_textdoc_version', { id: v1.id, label: '   ' })).ok, 'texte : renommer sans nom refusé');
        ok(!(await api('rename_textdoc_version', { id: 999999, label: 'x' })).ok, 'texte : version inconnue refusée');
        ok((await api('rename_textdoc_version', { id: v1.id, label: 'Avant Paul' })).ok && (await api('textdoc_versions', { doc_id: did }, true)).r.items[1].label === 'Avant Paul', 'texte : renommer');
        await api('rename_textdoc_version', { id: v1.id, label: 'Brouillon 2' });
        const noCsrf = await page.evaluate(async id => (await fetch('api.php?action=rename_textdoc_version', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, label: 'pirate' }) })).status, v1.id);
        ok(noCsrf >= 400, `sans jeton CSRF : refusé (${noCsrf})`);
        const site = p => ({ pages: [{ name: 'Accueil', html: `<h1>Famille Peyre</h1><p>${p}</p><img src="x" onerror="parent.L3HACK=1"><script>parent.L3HACK=1</script>` }] });
        const st = (await api('save_website', { name: 'Site Peyre', data: site('Bienvenue sur le site de la famille.') })).r; const sid = Number(st.id);
        const sv = (await api('save_website_version', { site_id: sid, label: 'Avant les photos', data: site('Bienvenue.') })).r;
        ok(!(await api('rename_website_version', { id: sv.id, label: '' })).ok && (await api('rename_website_version', { id: sv.id, label: 'Premier site' })).ok, 'site : renommer (vide refusé)');
        await api('rename_website_version', { id: sv.id, label: 'Avant les photos' });
        const board = (await api('save_board', { title: 'Tableau test', data: { items: [{ id: 'a', type: 'note', x: 0, y: 0, w: 100, h: 80, text: 'x' }] } })).r;
        if (board?.id) {
            const snap = (await api('save_board_snapshot', { board_id: board.id, label: 'avant' })).r;
            ok((await api('rename_board_snapshot', { id: snap.id, label: '⏱ Ma version' })).ok && (await api('board_snapshots', { board_id: board.id }, true)).r.snapshots[0].label === 'Ma version', 'tableau : renommer un instantané (⏱ réservé)');
            ok(!(await api('rename_board_snapshot', { id: snap.id, label: ' ' })).ok, 'tableau : nom vide refusé');
        }
        // une photo et sa retouche (images faites ici)
        const mid = await page.evaluate(async () => {
            const png = (w, h, c) => new Promise(res => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(w / 4, h / 4, w / 2, h / 2); cv.toBlob(res, 'image/png'); });
            const up = async fd => { const r = await fetch('api.php?action=retouch_media', { method: 'POST', body: fd, headers: { 'X-CSRF-Token': window.LCNDA_APP.state.csrf } }); return (await r.json()).result; };
            let fd = new FormData(); fd.append('file', await png(800, 600, '#8f7a55'), 'a.png'); fd.append('kind', 'image'); fd.append('title', 'Portrait de Marie'); const r = await up(fd);
            fd = new FormData(); fd.append('file', await png(800, 600, '#4a6a8f'), 'b.png'); fd.append('media_id', r.media_id); fd.append('mode', 'version'); fd.append('show', '1'); await up(fd);
            return r.media_id;
        });
        const mv = (await api('media_versions', { id: mid }, true)).r.versions;
        eq(mv.map(x => [x.is_original, !!x.shown]), [[1, false], [0, true]], 'photo : original + retouche affichée');
        ok(!(await api('retouch_rename_version', { media_id: mid, version_id: mv[0].id, label: 'Autre' })).ok, 'photo : l’original garde son nom');
        ok(!(await api('retouch_rename_version', { media_id: mid + 1, version_id: mv[1].id, label: 'Autre' })).ok, 'photo : version d’un autre média refusée');
        console.log(`✓ API : ${n} vérifications`);

        /* 3. Traitement de texte */
        await page.evaluate(id => window.LCNDA_EXT.openTextDoc({ id }), did);
        await page.waitForSelector('.wp-dlg [data-wp-menu="Fichier"] summary');
        await page.click('.wp-dlg [data-wp-menu="Fichier"] summary'); ok(/🕘 Versions…/.test(await page.textContent('.wp-dlg [data-wp-menu="Fichier"] [data-wp-cmd="versions"]')), 'texte : Fichier → 🕘 Versions…');
        await page.click('.wp-dlg [data-wp-menu="Fichier"] [data-wp-cmd="versions"]');
        await page.waitForSelector(R); await wait(400);
        ok(await page.evaluate(() => getComputedStyle(document.querySelector('dialog.ui-vers')).width) === '1040px', 'grande fenêtre K6 (1040)');
        eq(await page.$$eval('dialog.ui-vers [data-vers-filter]', b => b.map(x => x.textContent)), ['Tout (2)', '✎ Nommées (1)', '🕘 Automatiques (1)'], 'filtres C5 avec le nombre');
        let L = await list();
        ok(/^Maintenant \| le texte à l’écran · 22 mots \| EN COURS \| AUJOURD’HUI/.test(L), `« Maintenant » en haut, EN COURS, puis « Aujourd’hui » : ${L}`);
        ok(/Brouillon 2 \| aujourd’hui à \d+ h \d\d · 14 mots \| ✎ nommée/.test(L), 'ligne utile (K4 · mots) et « nommée »');
        await page.click('dialog.ui-vers [data-vers-filter="auto"]'); eq(await page.locator(R).count(), 1, 'filtre « Automatiques »'); await page.click('dialog.ui-vers [data-vers-filter="all"]');
        await page.locator(R).last().click(); await page.waitForSelector('dialog.ui-vers .ui-vers-text'); await wait(200);
        ok((await page.textContent('dialog.ui-vers [data-vers-pane]')).includes('sabotier'), 'clic = aperçu à droite');
        eq(await page.$$eval('dialog.ui-vers .modal-actions button', b => b.map(x => x.textContent.trim())), ['Fermer'], '« Fermer » seul en bas');
        await page.locator('dialog.ui-vers [data-vers-check]').nth(1).check(); await page.locator('dialog.ui-vers [data-vers-check]').nth(2).check();
        await page.waitForSelector('dialog.ui-vers [data-vers-left] del'); await wait(200);
        eq(await page.$$eval('dialog.ui-vers [data-vers-left] del', x => x.map(e => e.textContent)), ['en', 'sabotier,'], 'comparaison : barré à gauche');
        eq(await page.$$eval('dialog.ui-vers [data-vers-right] ins', x => x.map(e => e.textContent.trim())), ['le 7 mai', 'cordonnier,'], 'comparaison : ajouté à droite');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'l3-texte.png') });
        await page.locator(R).last().click(); await wait(300); await page.click('dialog.ui-vers [data-vers-act="restore"]'); await wait(900);
        ok(/Revenu à « Brouillon 2 » — la version d’avant est gardée/.test(await page.locator('.ui-toast').last().innerText()), '« ↺ Revenir » sans question, message H7');
        ok((await page.textContent('.wp-dlg .wp-body')).includes('sabotier') && /Avant le retour à « Brouillon 2 »/.test(await list()), 'revenu, et l’actuelle gardée d’abord (automatique)');
        await undo(); ok((await page.textContent('.wp-dlg .wp-body')).includes('rue de la Barrière'), '↶ Annuler remet le texte');
        await page.locator(R).first().click(); await wait(200);
        await page.click('dialog.ui-vers [data-vers-act="more"]');
        eq(await page.$$eval('.ui-actmenu .ui-actmenu-i b', b => b.map(x => x.textContent)), ['Renommer', 'En faire une copie', 'Exporter', 'Supprimer'], '⋯ : Renommer, Copie, Exporter, Supprimer');
        await page.locator('.ui-actmenu .ui-actmenu-i', { hasText: 'Renommer' }).click(); await page.fill('.ask-text-dialog input', 'Premier jet'); await page.click('.ask-text-dialog [data-ask-ok]'); await wait(600);
        ok(/Premier jet/.test(await list()), '✎ Renommer');
        const n0 = await page.locator(R).count();
        await page.locator(R, { hasText: 'Premier jet' }).click({ button: 'right' }); await page.locator('.ui-actmenu .ui-actmenu-i', { hasText: 'Supprimer' }).click(); await wait(600);
        eq(await page.locator(R).count(), n0 - 1, 'clic droit → 🗑 Supprimer, sans question'); await undo(); eq(await page.locator(R).count(), n0, '↶ Annuler la suppression');
        await page.click('dialog.ui-vers [data-vers-close]'); await page.evaluate(() => { window.LCNDA_EXT.textDocKit.current.dirty = false; }); await page.click('dialog.wp-dlg .ui-topbar > button[data-wp-cmd="close"]').catch(() => {});
        console.log(`✓ traitement de texte : ${n} vérifications`);

        /* 3. Mon site web */
        await page.evaluate(id => window.LCNDA_EXT.openWebsite({ id }), sid);
        await page.waitForSelector('.sw-dlg [data-ui-menu="Fichier"]'); await wait(400);
        await page.click('.sw-dlg [data-ui-menu="Fichier"]'); await page.locator('.ui-actmenu .ui-actmenu-i', { hasText: 'Versions…' }).first().click();
        await page.waitForSelector(R); await wait(300); await page.locator(R).first().click(); await page.waitForSelector('dialog.ui-vers iframe'); await wait(500);
        eq(await page.getAttribute('dialog.ui-vers iframe', 'sandbox'), '', 'site : aperçu isolé (sandbox vide)');
        eq(await page.evaluate(() => window.L3HACK), undefined, 'site : aucun script de la page lancé');
        await page.click('dialog.ui-vers [data-vers-act="cmpnow"]'); await page.waitForSelector('dialog.ui-vers [data-vers-right] ins');
        ok(/sur le site de la famille/.test(await page.textContent('dialog.ui-vers [data-vers-right] ins')), 'site : comparer avec maintenant');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'l3-site.png') });
        await page.click('dialog.ui-vers [data-vers-act="restore"]'); await wait(900);
        ok(/Bienvenue\.<\/p>/.test(await page.evaluate(() => window.LCNDA_EXT.siteWeb.current.site.pages[0].html)), 'site : revenu à la version');
        await undo(); ok(/famille\.<\/p>/.test(await page.evaluate(() => window.LCNDA_EXT.siteWeb.current.site.pages[0].html)), 'site : ↶ Annuler');
        await page.click('dialog.ui-vers [data-vers-close]');
        await page.evaluate(() => { const c = window.LCNDA_EXT.siteWeb.current; c.dirty = false; document.querySelectorAll('dialog[open]').forEach(x => x.close()); });
        console.log(`✓ site : ${n} vérifications`);

        /* 3. Une photo retouchée */
        await page.evaluate(id => window.LCNDA_UI.openMediaVersions({ id, title: 'Portrait de Marie', media_type: 'image' }, { kind: 'image' }), mid);
        await page.waitForSelector(R); await wait(1000);
        L = await list(); ok(/Retouche 1 — \d\d\/\d\d\/\d{4} \| aujourd’hui à .* · 800 × 600 px \| AFFICHÉE/.test(L) && /Original .*ORIGINAL/.test(L), `photo : taille en pixels, affichée, original : ${L}`);
        await page.locator('dialog.ui-vers [data-vers-check]').nth(1).check(); await page.locator('dialog.ui-vers [data-vers-check]').nth(2).check();
        const sl = page.locator('dialog.ui-vers [data-vers-slide]'); await sl.waitFor(); await sl.scrollIntoViewIfNeeded(); await wait(300); const bb = await sl.boundingBox();
        await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.mouse.move(bb.x + bb.width * 0.2, bb.y + bb.height / 2, { steps: 4 }); await page.mouse.up();
        ok(Math.abs(parseFloat(await sl.evaluate(e => e.style.getPropertyValue('--cut'))) - 20) < 3, 'photo : le trait se glisse');
        await page.focus('dialog.ui-vers [data-vers-cut]'); await page.keyboard.press('ArrowRight'); ok(Math.abs(parseFloat(await sl.evaluate(e => e.style.getPropertyValue('--cut'))) - 25) < 3, 'photo : ← → au clavier');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'l3-photo.png') });
        await page.locator(R, { hasText: 'Original' }).click(); await wait(300);
        eq(await page.locator('dialog.ui-vers [data-vers-act="rename"]').count(), 0, 'photo : l’original ne se renomme pas');
        await page.click('dialog.ui-vers [data-vers-act="restore"]'); await wait(900);
        const shown = async () => (await api('media_versions', { id: mid }, true)).r.versions.find(x => x.shown).is_original;
        eq(await shown(), 1, 'photo : revenir = l’original affiché partout'); await undo(); eq(await shown(), 0, 'photo : ↶ Annuler');
        await page.locator(R, { hasText: 'Retouche' }).click(); await page.click('dialog.ui-vers [data-vers-act="more"]'); await page.locator('.ui-actmenu .ui-actmenu-i', { hasText: 'Supprimer' }).click(); await wait(400);
        eq((await api('media_versions', { id: mid }, true)).r.versions.length, 2, 'photo : la suppression attend la fin du message'); await undo(); await wait(500);
        eq((await api('media_versions', { id: mid }, true)).r.versions.length, 2, 'photo : ↶ Annuler, la version reste');

        /* sombre, 390 px */
        await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await wait(200);
        const bg = await page.evaluate(() => getComputedStyle(document.querySelector('dialog.ui-vers .ui-vers-ph')).backgroundColor);
        ok(!/255, 255, 255/.test(bg), `sombre : en-tête de l’aperçu sombre (${bg})`);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'l3-sombre.png') });
        await page.setViewportSize({ width: 390, height: 844 }); await wait(400);
        eq(await page.evaluate(() => { const d = document.querySelector('dialog.ui-vers'); return [d.scrollWidth <= d.clientWidth + 1, document.documentElement.scrollWidth <= 391]; }), [true, true], '390 px : pas de débordement');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'l3-390.png') });
        await page.click('dialog.ui-vers [data-vers-close]');
        eq(errors, [], 'aucune erreur dans la console');
    } finally {
        if (browser) await browser.close();
        proc.kill();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    }
    console.log(`✓ ${n} vérifications de la fenêtre « 🕘 Versions » (L3)`);
})().catch(e => { console.error(e); process.exit(1); });
