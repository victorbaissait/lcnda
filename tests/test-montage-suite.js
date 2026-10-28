'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Montage vidéo, la suite :   node tests/test-montage-suite.js
 * a) taille des boutons des pistes (👁 🔓 ↑ ↓ 🗑) réglable : Réglages → Montage… (K2) et Affichage → Boutons des pistes (↶ Annuler) ;
 *    la colonne des noms s'élargit, les éléments de la frise commencent après elle ; « comme avant » ne change rien.
 * b) raccourcis réglables (heritage-editorkeys.js, la liste commune) : Édition → ⌨️ Raccourcis du montage ; « Couper ici » mis sur S
 *    → S coupe, B ne coupe plus ; menus, aide du bas ; liste de départ complète (tous les menus du montage).
 * c) « 💾 Enregistrer » (le projet, par l'API) ≠ « ⤓ Exporter ▾ » (la fenêtre d'export commune E3) ; menu ▾ d'Enregistrer (K19).
 * d) polices de l'ordinateur (E5, UI.openFontPicker) pour un titre ; une police glissée dans un projet avec du CSS en plus est refusée.
 * Captures à 1440 px, 390 px et en mode sombre (MONTAGE_SHOTS=dossier), sans erreur de page.
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
for (const m of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (_) { /* suivant */ } }
const phpPath = findPhp([devBundledPhp()]);
const ffmpeg = ['/usr/bin/ffmpeg', 'ffmpeg'].find(f => spawnSync(f, ['-version']).status === 0);
const shots = process.env.MONTAGE_SHOTS || '';
let failed = 0, passed = 0, proc = null, browser = null;
const t = async (name, fn) => { try { await fn(); passed++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

// ── sans navigateur : le code lui-même ──
const studio = fs.readFileSync(path.join(appRoot, 'assets/js/heritage-studio-av.js'), 'utf8');
const keys = fs.readFileSync(path.join(appRoot, 'assets/js/heritage-editorkeys.js'), 'utf8');
const idx = fs.readFileSync(path.join(appRoot, 'index.php'), 'utf8');
(async () => {
    await t('code : réglage des boutons des pistes, menu Affichage, raccourcis, police nettoyée', async () => {
        assert.match(studio, /tbtn: tbtnOf\(v\.tbtn\)/, 'le réglage est lu et borné');
        assert.match(studio, /LAYOUT_FIELDS = \['side', 'stage', 'lane', 'tbtn'/, 'il fait partie des 💾 réglages enregistrés de la disposition');
        assert.match(studio, /\['tbtn:up', 'Boutons des pistes : plus grands'\]/);
        assert.match(studio, /\['keys', '⌨️ Raccourcis du montage…'\]/);
        assert.match(studio, /ext\.editorKeyOwn\?\.\('montage'/, 'les touches de départ se libèrent');
        assert.match(studio, /if \('font' in x && !FONT_OK\(x\.font\)\)/, 'la police d’un projet est relue');
        assert.match(keys, /const MOVES = \{montage:/);
        const i = keys.indexOf('/*DEFAULT_CMDS*/') + 16, d = JSON.parse(keys.slice(i, keys.indexOf('/*/DEFAULT_CMDS*/')));
        const ids = d.montage.map(r => r[0]);
        for (const id of ['op:split', 'op:voice', 'op:sub', 'op:chapter', 'multicam', 'subexport', 'snap', 'scope', 'keys', 'tbtn:up', 'export', 'proj']) assert.ok(ids.includes('data-mt-cmd=' + id), `commande connue d’avance : ${id}`);
        assert.equal(new Set(ids).size, ids.length, 'pas de doublon');
        assert.match(idx, /heritage-studio-av\.js\?v=\d+/); assert.match(idx, /heritage-editorkeys\.js\?v=\d+/);
    });
    if (!chromium || !phpPath || !ffmpeg) { console.log(`— navigateur sauté : ${!chromium ? 'Playwright' : !phpPath ? 'PHP' : 'ffmpeg'} absent`); console.log(`\n${passed} vérification(s), ${failed} échec(s).`); process.exit(failed ? 1 : 0); }

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-montage-suite-'));
    const mediaDir = path.join(tmp, 'media'); fs.mkdirSync(mediaDir);
    const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const ff = args => { const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8' }); if (r.status !== 0) throw new Error('ffmpeg : ' + r.stderr); };
    const SIL = ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'], VP8 = ['-c:v', 'libvpx', '-b:v', '600k', '-c:a', 'libopus', '-shortest'];
    try {
        ff(['-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=25:d=2.5', ...SIL, ...VP8, path.join(mediaDir, 'rouge.webm')]);
        ff(['-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=25:d=2.5', ...SIL, ...VP8, path.join(mediaDir, 'bleu.webm')]);
        const project = {
            sources: [{ src: 'media/rouge.webm', title: 'Rouge', kind: 'video', dur: 2.5, w: 320, h: 180 }, { src: 'media/bleu.webm', title: 'Bleu', kind: 'video', dur: 2.5, w: 320, h: 180 }],
            v1: [{ id: 'va', s: 0, from: 0, to: 2.5, tr: { type: 'none', d: 1 }, look: {}, vol: 1 }, { id: 'vb', s: 1, from: 0, to: 2.5, tr: { type: 'none', d: 1 }, look: {}, vol: 1 }],
            v2: [], audio: [],
            texts: [{ id: 'ta', at: 0.3, dur: 2, text: 'Titre', size: 6, track: 'T1', font: 'Georgia, serif' },
                { id: 'tb', at: 2.6, dur: 1, text: 'Piège', size: 6, track: 'T1', font: 'x; background:url(https://exemple.invalid/a.png)' }],
            tracks: [{ id: 'V2', kind: 'v', name: 'Vidéo 2' }, { id: 'V1', kind: 'main', name: 'Vidéo 1' }, { id: 'T1', kind: 't', name: 'Textes 1' }, { id: 'A1', kind: 'a', name: 'Son 1' }],
        };
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require "lib/paths.php"; (new PDO("sqlite:".DATA_DIR."/genealogy.sqlite"))->exec(file_get_contents(APP_ROOT."/data/schema.sql")); require "lib/bootstrap.php"; $p = db(); $p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Martin','male')"); $p->prepare("INSERT INTO montage_projects(name, data_json) VALUES(?, ?)")->execute(["Essai", $argv[1]]); echo $p->lastInsertId();`, JSON.stringify(project)], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
        if (r.status !== 0) throw new Error(r.stderr || r.stdout);
        const projId = Number(r.stdout.trim().split('\n').pop());
        const port = await freePort();
        proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
        const base = `http://127.0.0.1:${port}/`;
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
        const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
        browser = await chromium.launch({ ...(fs.existsSync(exe) ? { executablePath: exe } : {}), args: ['--autoplay-policy=no-user-gesture-required'] });
        const errors = [];
        const newPage = async ({ width = 1440, height = 900, dark = false } = {}) => {
            const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? 'dark' : 'light' });
            const p = await ctx.newPage();
            p.on('pageerror', e => errors.push(e.message));
            p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
            p.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); });
            await p.goto(base);
            await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.openMontageProject && window.LCNDA_EXT?.editorKeysPanel, null, { timeout: 30000 });
            if (dark) await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
            return p;
        };
        const openMontage = async p => { await p.evaluate(id => window.LCNDA_EXT.openMontageProject(id), projId); await p.waitForSelector('[data-mt-canvas]'); await p.waitForFunction(() => document.querySelector('dialog[open]')?.__montage?.eng); await p.waitForTimeout(300); };
        const shot = async (p, name) => { if (!shots) return; fs.mkdirSync(shots, { recursive: true }); await p.screenshot({ path: path.join(shots, name) }); };
        const M = 'document.querySelector("dialog.h-avx-montage").__montage';
        const menu = async (p, top, cmd) => { await p.click(`.h-mt-menubar summary:text-is("${top}")`); await p.click(`.h-mt-menubar [data-mt-cmd="${cmd}"]`); };
        const geo = p => p.evaluate(() => { const d = document.querySelector('dialog.h-avx-montage'), b = d.querySelector('.h-mt-tbtns button').getBoundingClientRect(), l = d.querySelector('.h-mt-lname').getBoundingClientRect(), c = d.querySelector('[data-mt-clip="v1:va"]').getBoundingClientRect(), ln = d.querySelector('.h-mt-lane').getBoundingClientRect(); return { bw: b.width, bh: b.height, lw: l.width, lr: l.right, cl: c.left, lane: ln.height, cls: d.classList.contains('mt-tbtn') }; });
        const p = await newPage();
        await openMontage(p);

        await t('a) comme avant : rien ne change (pas de classe, colonne des noms de 146 px)', async () => {
            const g = await geo(p);
            assert.equal(g.cls, false); assert.equal(Math.round(g.lw), 146);
            assert.ok(g.cl >= g.lr - 1, `le premier élément commence après la colonne des noms (${g.cl} / ${g.lr})`);
            await shot(p, 'suite-01-avant-1440.png');
        });
        await t('a) Affichage → Boutons des pistes : plus grands / plus petits (gardé tout de suite, ↶ Annuler), colonne élargie, frise décalée', async () => {
            for (let i = 0; i < 4; i++) await menu(p, 'Affichage', 'tbtn:up');
            assert.match(await p.evaluate(() => [...document.querySelectorAll('.ui-toast-text')].map(x => x.textContent).join(' | ')), /Boutons des pistes : 38 px/);
            // ↶ Annuler du dernier message (tout de suite, avant qu'il s'en aille) : 34 px
            await p.locator('.ui-toast').last().getByRole('button', { name: /Annuler/ }).click({ timeout: 4000 });
            await p.waitForFunction(() => JSON.parse(localStorage.getItem('genealogie-montage-prefs') || '{}').tbtn === 34);
            const g = await geo(p);
            assert.equal(g.cls, true); assert.equal(Math.round(g.bw), 34); assert.equal(Math.round(g.bh), 34);
            assert.ok(g.lw >= 5 * 34, `la colonne des noms tient les 5 boutons (${g.lw})`);
            assert.ok(g.cl >= g.lr - 1, `les éléments commencent après les noms (${g.cl} / ${g.lr})`);
            assert.ok(g.lane >= 34 + 18, `la piste est assez haute (${g.lane})`);
            await shot(p, 'suite-02-grands-boutons-1440.png');
            // le clic marche toujours sur un grand bouton : cacher / montrer la piste Textes 1
            await p.click('[data-mt-tvis="T1"]'); assert.equal(await p.evaluate(m => eval(m).P.tracks.find(x => x.id === 'T1').hidden, M), true);
            await p.click('[data-mt-tvis="T1"]'); assert.equal(await p.evaluate(m => !!eval(m).P.tracks.find(x => x.id === 'T1').hidden, M), false);
            await menu(p, 'Affichage', 'tbtn:down');
            assert.equal(Math.round((await geo(p)).bw), 30);
            await menu(p, 'Affichage', 'tbtn:0');
            const g0 = await geo(p); assert.equal(g0.cls, false, 'taille de départ : comme avant'); assert.equal(Math.round(g0.lw), 146);
        });
        await t('a) Réglages → Montage… : « Taille des boutons des pistes » gardée tout de suite (K2)', async () => {
            const q = await newPage();
            await q.evaluate(() => { window.LCNDA_APP.state.maintenanceTab = 'montage_prefs'; window.LCNDA_APP.setModule('maintenance'); });
            await q.waitForSelector('[data-mtp="tbtn"]');
            await q.$eval('[data-mtp="tbtn"]', el => { el.value = '40'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
            await q.waitForFunction(() => Number(JSON.parse(localStorage.getItem('genealogie-montage-prefs') || '{}').tbtn) === 40, null, { timeout: 5000 });
            await shot(q, 'suite-03-reglages-1440.png');
            await openMontage(q);
            const g = await geo(q); assert.equal(Math.round(g.bw), 40); assert.ok(g.cl >= g.lr - 1);
            await q.evaluate(() => localStorage.removeItem('genealogie-montage-prefs'));
            await q.context().close();
        });

        await t('b) Édition → ⌨️ Raccourcis du montage : la liste commune, sur l’onglet du montage', async () => {
            await menu(p, 'Édition', 'keys');
            await p.waitForSelector('dialog.h-mt-keysdlg [data-ek-tab="montage"].is-active');
            const txt = await p.textContent('dialog.h-mt-keysdlg');
            assert.match(txt, /Couper ici/); assert.match(txt, /Raccourcis du montage/);
            await shot(p, 'suite-04-raccourcis-1440.png');
            // « ✂️ Couper ici » → S (la fenêtre qui écoute la touche, comme dans Réglages)
            await p.click('dialog.h-mt-keysdlg [data-ek-set="data-mt-cmd=op:split"]');
            await p.waitForSelector('dialog.shortcut-capture[open]'); await p.keyboard.press('s');
            assert.match(await p.textContent('dialog.shortcut-capture'), /touche de départ \(B\) ne fera plus/);
            await p.click('dialog.shortcut-capture [data-ok]');
            await p.waitForFunction(() => JSON.parse(localStorage.getItem('genealogie-editor-shortcuts') || '{}').montage?.['data-mt-cmd=op:split'] === 'S');
            await p.click('dialog.h-mt-keysdlg .modal-actions [data-x]');
            await p.waitForFunction(() => !document.querySelector('dialog.h-mt-keysdlg'));
        });
        await t('b) S coupe, B ne coupe plus ; le menu et l’aide du bas disent S', async () => {
            await p.waitForFunction(() => /S\s*:\s*couper ici/.test(document.querySelector('dialog.h-avx-montage .ed-status')?.textContent || document.querySelector('dialog.h-avx-montage').textContent));
            const kb = await p.$eval('.h-mt-menubar [data-mt-cmd="op:split"] kbd', k => k.textContent.trim()); assert.equal(kb, 'S');
            await p.evaluate(async m => { const x = eval(m); x.select('v1', 'va'); await x.eng.seek(1); }, M);
            await p.click('[data-mt-canvas]'); // le focus dans le montage, pas dans une case
            await p.keyboard.press('b'); await p.waitForTimeout(200);
            assert.equal(await p.evaluate(m => eval(m).P.v1.length, M), 2, 'B ne coupe plus');
            await p.evaluate(async m => { const x = eval(m); x.select('v1', 'va'); await x.eng.seek(1); }, M);
            await p.keyboard.press('s'); await p.waitForFunction(m => eval(m).P.v1.length === 3, M, { timeout: 3000 });
            await p.keyboard.press('Control+z'); await p.waitForFunction(m => eval(m).P.v1.length === 2, M);
            await p.evaluate(() => localStorage.removeItem('genealogie-editor-shortcuts'));
        });

        await t('c) 💾 Enregistrer garde le projet (API, sans export) ; ⤓ Exporter ▾ ouvre la fenêtre d’export commune', async () => {
            const head = await p.$$eval('dialog.h-avx-montage .h-avx-headbtns button', bs => bs.map(b => b.textContent.trim()));
            const iE = head.findIndex(x => /Exporter/.test(x)), iS = head.findIndex(x => /^💾 Enregistrer$/.test(x));
            assert.ok(iE >= 0 && iS > iE, `deux boutons séparés : ${head.join(' | ')}`);
            await p.evaluate(m => { eval(m).P.texts[0].text = 'Titre enregistré'; }, M);
            await p.click('dialog.h-avx-montage [data-mt-saveproj]');
            await p.waitForFunction(id => window.LCNDA_APP.api('montage_project', { id }).then(r => r.project.texts?.[0]?.text === 'Titre enregistré'), projId, { timeout: 8000 });
            assert.equal(await p.$('dialog.ui-export[open]'), null, 'Enregistrer n’exporte rien');
            // le menu ▾ d'Enregistrer (K19) : le projet, sous un autre nom, garder dans les médias, projets
            await p.click('dialog.h-avx-montage .ed-save-more'); await p.waitForSelector('.ui-actmenu-i');
            const items = await p.$$eval('.ui-actmenu-i', bs => bs.map(b => b.textContent.trim()).join(' | '));
            assert.match(items, /sous un autre nom/); assert.match(items, /Garder dans les médias/);
            await p.keyboard.press('Escape');
            await p.click('dialog.h-avx-montage [data-mt-export]');
            await p.waitForSelector('dialog.ui-export[open]');
            const ex = await p.textContent('dialog.ui-export[open]'); assert.match(ex, /WebM|MP4/); assert.match(ex, /Son seul/);
            await shot(p, 'suite-05-export-1440.png');
            await p.click('dialog.ui-export[open] [data-ui-x]');
            await p.waitForFunction(() => !document.querySelector('dialog.ui-export[open]'));
        });
        await t('c) API : un projet ne s’enregistre pas sans le jeton CSRF', async () => {
            const res = await fetch(base + 'api.php?action=save_montage_project', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: projId, name: 'Pirate', project: { sources: [] } }) });
            assert.ok(res.status >= 400, `refusé (${res.status})`);
            const list = await p.evaluate(() => window.LCNDA_APP.api('montage_projects').then(r => r.projects.map(x => x.name)));
            assert.ok(!list.includes('Pirate'));
        });

        await t('d) la police d’un titre : fenêtre commune des polices (E5), police tapée de l’ordinateur, gardée et dessinée', async () => {
            await p.evaluate(m => eval(m).select('texts', 'ta'), M);
            await p.click('[data-mt-tab="item"]');
            await p.waitForSelector('[data-mt-pane="item"] [data-mt-fontpick]');
            await p.click('[data-mt-pane="item"] [data-mt-fontpick]');
            await p.waitForSelector('dialog.ui-fontpick .ui-font');
            const tags = await p.$$eval('dialog.ui-fontpick .ui-font small', s => s.map(x => x.textContent));
            assert.ok(tags.includes('CONSEILLÉE'), 'les polices déjà prises dans ce film sont en tête');
            await p.fill('dialog.ui-fontpick input[type="search"], dialog.ui-fontpick .ui-search input', 'DejaVu Sans Mono');
            await p.waitForTimeout(200);
            await shot(p, 'suite-06-polices-1440.png');
            await p.keyboard.press('Enter');
            await p.waitForFunction(m => eval(m).P.texts.find(x => x.id === 'ta').font === '"DejaVu Sans Mono", sans-serif', M, { timeout: 4000 });
            assert.match(await p.$eval('[data-mt-pane="item"] [data-mt-fontpick]', b => b.textContent), /DejaVu Sans Mono/);
        });
        await t('d) une police glissée dans un projet avec du CSS en plus est remplacée par la police de départ', async () => {
            const f = await p.evaluate(m => eval(m).P.texts.find(x => x.id === 'tb').font, M);
            assert.equal(f, 'Georgia, serif');
            const clean = await p.evaluate(() => window.LCNDA_EXT._montage.projectModel({ sources: [], texts: [{ text: 'a', font: '"Bon Nom", sans-serif' }, { text: 'b', font: 'a}b' }, { text: 'c', font: 'x\nY' }] }).texts.map(x => x.font));
            assert.deepEqual(clean, ['"Bon Nom", sans-serif', 'Georgia, serif', 'Georgia, serif']);
        });

        await t('390 px et mode sombre : le montage s’ouvre, boutons des pistes grands, sans erreur', async () => {
            for (const [o, name] of [[{ width: 390, height: 844 }, 'suite-07-390.png'], [{ dark: true }, 'suite-08-sombre-1440.png']]) {
                const q = await newPage(o);
                await q.evaluate(() => localStorage.setItem('genealogie-montage-prefs', JSON.stringify({ tbtn: 30 })));
                await openMontage(q);
                const g = await geo(q); assert.equal(Math.round(g.bw), 30);
                if (o.width === 390) assert.ok(await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'pas de défilement de côté de la page');
                await shot(q, name);
                await q.evaluate(() => localStorage.removeItem('genealogie-montage-prefs'));
                await q.context().close();
            }
        });
        await t('aucune erreur dans la page', async () => { assert.deepEqual(errors, []); });
    } catch (e) { failed++; console.error('✗ préparation', e); }
    finally {
        try { await browser?.close(); } catch (_) {}
        try { proc?.kill(); } catch (_) {}
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    }
    console.log(`\n${passed} vérification(s), ${failed} échec(s).`);
    process.exit(failed ? 1 : 0);
})();
