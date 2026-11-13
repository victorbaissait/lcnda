'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🎬 Montage — réglages en plus :   node tests/test-montage-reglages.js
 *  1. boutons des pistes petits / moyens / grands (menu Affichage et Réglages, retenus), raccourcis connus d'avance (B…) ;
 *  2. son : courbe du volume posée sur un morceau (fondus + points, aussi dans le mélange hors ligne), effets du moteur son
 *     commun (volume plus égal, réverbération, gauche ↔ droite), « ↺ Remettre comme au départ » (couleurs, son du film, texte),
 *     sections du panneau de droite repliables et rangées (E2 : ⠿, Alt + ↑ / ↓, ordre et ouverture retenus) ;
 *  3. ⤓ Exporter (fenêtre E3) à part de 💾 Enregistrer, polices de l'ordinateur (E5), contour, ombre, bandeau, italique.
 * Le test fabrique ses rushes (ffmpeg), sa base et son serveur PHP (port 20750 ou LCNDA_TEST_PORT), puis efface tout.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
let failed = 0, count = 0, proc = null, browser = null;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    await t('commandes du montage connues d’avance (page Raccourcis) : petits / grands boutons, sections du panneau', () => {
        const keys = fs.readFileSync(path.join(appRoot, 'assets/js/heritage-editorkeys.js'), 'utf8');
        const i = keys.indexOf('/*DEFAULT_CMDS*/') + 16, d = JSON.parse(keys.slice(i, keys.indexOf('/*/DEFAULT_CMDS*/'))), ids = d.montage.map(r => r[0]);
        for (const id of ['tbtn:s', 'tbtn:l', 'tbtn:0', 'secreset', 'op:split', 'export', 'proj']) assert.ok(ids.includes('data-mt-cmd=' + id), id);
        assert.equal(new Set(ids).size, ids.length);
        assert.match(keys, /B: 'Couper ici'/);
    });
    let chromium = null; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (_) {} }
    const phpPath = findPhp([devBundledPhp()]), ffmpeg = ['/usr/bin/ffmpeg', 'ffmpeg'].find(f => spawnSync(f, ['-version']).status === 0);
    if (!chromium || !phpPath || !ffmpeg) { console.log('— navigateur : Playwright, PHP ou ffmpeg absent, partie sautée'); return finish(); }
    const base0 = process.env.LCNDA_TEST_TMP || os.tmpdir();
    const tmp = fs.mkdtempSync(path.join(base0, 'carnet-montage-reglages-')), mediaDir = path.join(tmp, 'media'); fs.mkdirSync(mediaDir);
    const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: mediaDir, GENEALOGY_SKIP_REFERENCE: '1' };
    const ff = args => { const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8' }); if (r.status !== 0) throw new Error('ffmpeg : ' + r.stderr); };
    try {
        ff(['-f', 'lavfi', '-i', 'color=c=gray:s=320x180:r=25:d=4', '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:d=4', '-af', 'volume=0.2', '-c:v', 'libvpx', '-b:v', '400k', '-c:a', 'libopus', '-b:a', '128k', '-shortest', path.join(mediaDir, 'gris.webm')]);
        ff(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:d=4', '-af', 'volume=0.3', '-c:a', 'libopus', '-b:a', '96k', path.join(mediaDir, 'la.webm')]);
        const project = { sources: [{ src: 'media/gris.webm', title: 'Gris', kind: 'video', dur: 4, w: 320, h: 180 }, { src: 'media/la.webm', title: 'La', kind: 'audio', dur: 4 }],
            v1: [{ id: 'va', s: 0, from: 0, to: 4, tr: { type: 'none', d: 1 }, look: {}, vol: 1 }], v2: [],
            texts: [{ id: 'ta', at: 0, dur: 4, text: 'MONTAGE', size: 14, color: '#ffffff', bg: '', font: 'Georgia, serif', x: 50, y: 50, anim: 'none', align: 'center', fade: false, shadow: false, track: 'T1' }],
            audio: [{ id: 'aa', s: 1, from: 0, to: 4, at: 0, vol: 1, fadeIn: 0, fadeOut: 0, track: 'A1' }],
            tracks: [{ id: 'V1', kind: 'main', name: 'Vidéo 1' }, { id: 'T1', kind: 't', name: 'Textes 1' }, { id: 'A1', kind: 'a', name: 'Son 1' }] };
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require "lib/paths.php"; (new PDO("sqlite:".DATA_DIR."/genealogy.sqlite"))->exec(file_get_contents(APP_ROOT."/data/schema.sql")); require "lib/bootstrap.php"; $p = db(); $p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Martin','male')"); $p->prepare("INSERT INTO montage_projects(name, data_json) VALUES(?, ?)")->execute(["Essai", $argv[1]]); echo $p->lastInsertId();`, JSON.stringify(project)], { cwd: appRoot, encoding: 'utf8', env });
        if (r.status !== 0) throw new Error(r.stderr || r.stdout);
        const projId = Number(r.stdout.trim().split('\n').pop());
        const port = Number(process.env.LCNDA_TEST_PORT) || 20750;
        proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
        const base = `http://127.0.0.1:${port}/`;
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
        browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
        const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
        await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('mtr-init')) { sessionStorage.setItem('mtr-init', '1'); localStorage.removeItem('genealogie-montage-prefs'); localStorage.removeItem('genealogie-montage-panel'); } } catch (_) {} });
        const p = await ctx.newPage(), errors = [];
        p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); });
        await p.goto(base);
        await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.openMontageProject && window.LCNDA_EXT?.audioEngine?.clipGain, null, { timeout: 30000 });
        const openMontage = async () => { await p.evaluate(id => window.LCNDA_EXT.openMontageProject(id), projId); await p.waitForSelector('[data-mt-canvas]'); await p.waitForFunction(() => document.querySelector('dialog[open]')?.__montage?.eng); await p.waitForTimeout(300); };
        await openMontage();
        const M = 'document.querySelector("dialog.h-avx-montage[open]").__montage';
        const menu = async (top, cmd) => { await p.click(`.h-mt-menubar summary:text-is("${top}")`); await p.click(`.h-mt-menubar [data-mt-cmd="${cmd}"]`); };
        const select = (track, id) => p.evaluate(([m, tr, i]) => eval(m).select(tr, i), [M, track, id]);
        const prefs = k => p.evaluate(k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } }, k);

        await t('1) boutons des pistes : Affichage → petits, grands, taille de départ (retenu tout de suite, ↶ Annuler)', async () => {
            await menu('Affichage', 'tbtn:l'); assert.equal((await prefs('genealogie-montage-prefs')).tbtn, 30);
            assert.equal(Math.round(await p.$eval('dialog.h-avx-montage .h-mt-tbtns button', b => b.getBoundingClientRect().width)), 30);
            await menu('Affichage', 'tbtn:s'); assert.equal((await prefs('genealogie-montage-prefs')).tbtn, 18);
            await menu('Affichage', 'tbtn:0'); assert.equal((await prefs('genealogie-montage-prefs')).tbtn, 0);
            assert.equal(await p.$eval('dialog.h-avx-montage', d => d.classList.contains('mt-tbtn')), false, 'taille de départ : comme avant');
        });
        await t('1) raccourcis : B coupe au curseur (bulle avec la touche), ⤓ Exporter et 💾 Enregistrer sont deux boutons', async () => {
            assert.equal(await p.$eval('dialog.h-avx-montage [data-mt-op="split"]', b => b.dataset.shortcut), 'B');
            const ids = await p.evaluate(() => { const d = document.querySelector('dialog.h-avx-montage'); return [!!d.querySelector('[data-mt-export]'), !!d.querySelector('[data-mt-saveproj]'), d.querySelector('[data-mt-export]') !== d.querySelector('[data-mt-saveproj]')]; });
            assert.deepEqual(ids, [true, true, true]);
            await p.click('[data-mt-clip="v1:va"]', { position: { x: 4, y: 6 } }); await p.waitForTimeout(400); await p.evaluate(m => eval(m).eng.seek(2), M);
            await p.keyboard.press('b');
            await p.waitForTimeout(300);
            assert.equal(await p.evaluate(m => eval(m).P.v1.length, M), 2, 'B : coupé en deux');
            await p.waitForTimeout(500); await p.keyboard.press('ControlOrMeta+z');
            for (let i = 0; i < 30 && await p.evaluate(m => eval(m).P.v1.length, M) !== 1; i++) await p.waitForTimeout(100);
            assert.equal(await p.evaluate(m => eval(m).P.v1.length, M), 1, '⌘Z : défait');
        });
        await t('2) courbe du volume (moteur commun) : fondus et points, entre deux points en ligne droite', async () => {
            const g = await p.evaluate(() => { const E = window.LCNDA_EXT.audioEngine, c = { fadeIn: 1, fadeOut: 1, env: [{ t: 2, v: 0.5 }, { t: 3, v: 1.5 }] };
                return [E.clipGain({}, 1, 4, 1), E.clipGain(c, 0.5, 4, 0.5), E.clipGain(c, 2.5, 4, 2.5), E.clipGain(c, 3.5, 4, 3.5)]; });
            assert.equal(g[0], 1); assert.ok(Math.abs(g[1] - 0.25) < 1e-9, 'fondu d’entrée × premier point'); assert.ok(Math.abs(g[2] - 1) < 1e-9); assert.ok(Math.abs(g[3] - 0.75) < 1e-9, 'fondu de sortie × dernier point');
        });
        await t('2) courbe du volume : ✎ poser des points sur le morceau, dans la frise ; double-clic l’enlève ; ✕ Effacer (↶ Annuler)', async () => {
            await p.addStyleTag({ content: '.ui-toast { pointer-events: none !important; opacity: .2; }' }); // les messages H7 (en bas à gauche) passent sur la frise
            await select('audio', 'aa');
            await p.click('dialog.h-avx-montage [data-mt-envedit]');
            const env = 'dialog.h-avx-montage [data-mt-env="audio:aa"].is-edit';
            await p.waitForSelector(env);
            const b = await p.$eval(env, el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
            await p.mouse.click(b.x + b.w * 0.5, b.y + b.h * 0.75);
            const pts = await p.evaluate(m => eval(m).P.audio[0].env, M);
            assert.equal(pts.length, 1); assert.ok(Math.abs(pts[0].t - 2) < 0.3, `temps ${pts[0].t}`); assert.ok(pts[0].v > 0.3 && pts[0].v < 0.7, `volume ${pts[0].v}`);
            await p.waitForSelector(`${env} [data-mt-envpt]`);
            const ptBox = await p.$eval(`${env} [data-mt-envpt]`, el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
            await p.mouse.move(ptBox.x, ptBox.y); await p.mouse.down(); await p.mouse.move(ptBox.x, b.y - 10, { steps: 4 }); await p.mouse.up();
            assert.ok((await p.evaluate(m => eval(m).P.audio[0].env[0].v, M)) > 1.8, 'tiré vers le haut : plus fort');
            await p.click('dialog.h-avx-montage [data-mt-envadd]');
            assert.equal(await p.evaluate(m => eval(m).P.audio[0].env.length, M), 2);
            const pt2 = await p.$eval(`${env} [data-mt-envpt="0"]`, el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
            await p.mouse.click(pt2.x, pt2.y); await p.mouse.click(pt2.x, pt2.y);
            assert.equal(await p.evaluate(m => eval(m).P.audio[0].env.length, M), 1, 'double-clic : point enlevé');
            await p.click('dialog.h-avx-montage [data-mt-envclear]');
            assert.equal(await p.evaluate(m => eval(m).P.audio[0].env, M), undefined);
            await p.waitForSelector('.undo-toast, [data-undo], .toast', { timeout: 3000 }).catch(() => {});
            await p.click('dialog.h-avx-montage [data-mt-envedit]');
        });
        await t('2) le mélange hors ligne (volume standard à l’export) suit la courbe : à 0 %, le son disparaît', async () => {
            const m = await p.evaluate(async mm => { if (!window.LCNDA_EXT.audioEngine?.clipGain) return 'pas de moteur'; const P = JSON.parse(JSON.stringify(eval(mm).P)); P.v1.forEach(c => { c.mute = true; }); delete P.audio[0].env; const a = await window.LCNDA_EXT.montageLoud.mixMontage(P); P.audio[0].env = [{ t: 0, v: 0 }]; const b = await window.LCNDA_EXT.montageLoud.mixMontage(P);
                const pk = x => x.chans[0].reduce((s, v) => Math.max(s, Math.abs(v)), 0); return [pk(a), pk(b)]; }, M);
            assert.ok(m[0] > 0.02, `son de départ ${m[0]}`); assert.equal(m[1], 0);
        });
        await t('2) effets du moteur commun joués en direct : volume plus égal, réverbération, gauche ↔ droite', async () => {
            const ok = await p.evaluate(() => { const ac = new AudioContext(), o = ac.createOscillator(), out = window.LCNDA_EXT.audioEngine.liveChain(ac, o, { comp: true, reverb: 0.4, room: 'eglise', pan: -0.5, bass: 3 }); const ok = out !== o && typeof out.connect === 'function'; ac.close(); return ok; });
            assert.ok(ok);
            await select('audio', 'aa');
            const html = await p.$eval('dialog.h-avx-montage [data-mt-pane="item"]', el => el.innerHTML);
            for (const k of ['afx.comp', 'afx.reverb', 'afx.room', 'afx.pan']) assert.ok(html.includes(`data-mt-k="${k}"`), k);
            await p.$eval('dialog.h-avx-montage [data-mt-k="afx.reverb"]', el => { el.value = '0.3'; el.dispatchEvent(new Event('input', { bubbles: true })); });
            await p.waitForFunction(m => eval(m).P.audio[0].afx?.reverb === 0.3, M, { timeout: 4000, polling: 100 });
        });
        await t('2) ↺ Remettre comme au départ : couleurs d’un morceau, son du film (↶ Annuler)', async () => {
            await select('v1', 'va');
            await p.$eval('dialog.h-avx-montage [data-mt-k="look.bright"]', el => { el.value = '1.5'; el.dispatchEvent(new Event('input', { bubbles: true })); });
            assert.equal(await p.evaluate(m => eval(m).P.v1[0].look.bright, M), 1.5);
            await p.click('dialog.h-avx-montage [data-mt-lookreset="look"]');
            assert.deepEqual(await p.evaluate(m => eval(m).P.v1[0].look, M), {});
            await p.evaluate(m => { eval(m).P.fx.clarity = true; eval(m).P.fx.volume = 2; }, M);
            await p.click('dialog.h-avx-montage [data-mt-tab="sound"]'); await p.click('dialog.h-avx-montage [data-mt-fxreset]');
            assert.deepEqual(await p.evaluate(m => [eval(m).P.fx.clarity, eval(m).P.fx.volume], M), [false, 1]);
            await p.click('dialog.h-avx-montage [data-mt-tab="item"]');
        });
        await t('2) E2 : sections repliables avec ⠿ ; Alt + ↓ range, l’ordre et l’ouverture sont retenus ; Affichage → ↺ les remet', async () => {
            await select('v1', 'va');
            const keys = () => p.$$eval('dialog.h-avx-montage [data-mt-pane="item"] > details[data-mt-sec]', l => l.map(d => d.dataset.mtSec));
            const k0 = await keys(); assert.ok(k0.length >= 5, k0.join(','));
            assert.ok(await p.$('dialog.h-avx-montage [data-mt-pane="item"] > details[data-mt-sec="time"] > summary [data-mt-secgrip]'));
            await p.focus('dialog.h-avx-montage [data-mt-pane="item"] > details[data-mt-sec="time"] > summary [data-mt-secgrip]');
            await p.keyboard.press('Alt+ArrowDown');
            const k1 = await keys(); assert.equal(k1.indexOf('time'), k0.indexOf('time') + 1);
            assert.deepEqual((await prefs('genealogie-montage-panel')).order['item-v1'], k1);
            await p.click('dialog.h-avx-montage [data-mt-pane="item"] > details[data-mt-sec="color"] > summary b');
            await p.waitForTimeout(50);
            assert.equal((await prefs('genealogie-montage-panel')).open['item-v1:color'], false);
            await select('audio', 'aa'); await select('v1', 'va');
            assert.deepEqual(await keys(), k1, 'ordre gardé après un nouveau dessin');
            assert.equal(await p.$eval('dialog.h-avx-montage [data-mt-pane="item"] > details[data-mt-sec="color"]', d => d.open), false);
            await menu('Affichage', 'secreset');
            assert.equal(await prefs('genealogie-montage-panel'), null);
            assert.deepEqual(await keys(), k0);
        });
        await t('3) textes : italique, contour, couleur et force de l’ombre, opacité et coins du bandeau (dessinés), ↺', async () => {
            await select('texts', 'ta'); await p.evaluate(m => eval(m).eng.seek(1), M);
            const px = () => p.evaluate(() => { const c = document.querySelector('dialog.h-avx-montage [data-mt-canvas]'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 16) s += d[i] + d[i + 1] + d[i + 2]; return s; });
            const before = await px();
            await p.$eval('dialog.h-avx-montage [data-mt-k="hasstroke"]', el => el.click());
            await p.waitForFunction(m => eval(m).P.texts[0].stroke === '#000000', M);
            await p.waitForSelector('dialog.h-avx-montage [data-mt-k="strokeW"]');
            await p.$eval('dialog.h-avx-montage [data-mt-k="strokeW"]', el => { el.value = '20'; el.dispatchEvent(new Event('input', { bubbles: true })); });
            await p.evaluate(m => eval(m).eng.redraw(), M); await p.waitForTimeout(100);
            assert.notEqual(await px(), before, 'le contour se voit sur l’image');
            await p.$eval('dialog.h-avx-montage [data-mt-k="italic"]', el => el.click()); assert.equal(await p.evaluate(m => eval(m).P.texts[0].italic, M), true);
            await p.$eval('dialog.h-avx-montage [data-mt-k="hasbg"]', el => el.click()); await p.waitForSelector('dialog.h-avx-montage [data-mt-k="bgA"]');
            await p.$eval('dialog.h-avx-montage [data-mt-k="bgR"]', el => { el.value = '50'; el.dispatchEvent(new Event('input', { bubbles: true })); });
            assert.equal(await p.evaluate(m => eval(m).P.texts[0].bgR, M), 50);
            await p.click('dialog.h-avx-montage [data-mt-txtreset="outline"]');
            assert.equal(await p.evaluate(m => eval(m).P.texts[0].stroke, M), undefined);
        });
        await t('3) police : la fenêtre commune des polices (E5) s’ouvre depuis un titre', async () => {
            await select('texts', 'ta');
            await p.click('dialog.h-avx-montage [data-mt-fontpick]');
            await p.waitForFunction(() => [...document.querySelectorAll('dialog[open]')].length >= 2, null, { timeout: 4000 });
            await p.keyboard.press('Escape'); await p.waitForTimeout(200);
        });
        await t('3) ⤓ Exporter ouvre la fenêtre E3 du film (sans enregistrer le projet)', async () => {
            await p.click('dialog.h-avx-montage [data-mt-export]');
            await p.waitForSelector('dialog.ui-export[open]', { timeout: 5000 });
            await p.keyboard.press('Escape'); await p.waitForTimeout(200);
        });
        await t('1) Réglages → Montage… : Petits / Moyens / Grands (K2)', async () => {
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => { d.__montage && (d.onclose = null); }));
            const q = await ctx.newPage(); q.on('pageerror', e => errors.push(e.message)); await q.goto(base);
            await q.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP.setModule, null, { timeout: 30000 });
            await q.evaluate(() => { window.LCNDA_APP.state.maintenanceTab = 'montage_prefs'; window.LCNDA_APP.setModule('maintenance'); });
            await q.waitForSelector('[data-mtp-tbtn="30"]');
            await q.click('[data-mtp-tbtn="30"]');
            await q.waitForFunction(() => Number(JSON.parse(localStorage.getItem('genealogie-montage-prefs') || '{}').tbtn) === 30, null, { timeout: 5000 });
            await q.click('[data-mtp-tbtn="22"]');
            await q.waitForFunction(() => [0, 22].includes(Number(JSON.parse(localStorage.getItem('genealogie-montage-prefs') || '{}').tbtn)), null, { timeout: 5000 });
            await q.close();
        });
        await t('aucune erreur dans la page', async () => assert.deepEqual(errors, []));
    } catch (e) { failed++; console.error('✗ préparation', e && e.stack || e); }
    finally { try { await browser?.close(); } catch (_) {} try { proc?.kill(); } catch (_) {} fs.rmSync(tmp, { recursive: true, force: true }); }
    finish();
})();
function finish() { console.log(`${failed ? '✗' : '✓'} montage, réglages en plus : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); }
