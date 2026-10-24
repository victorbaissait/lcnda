'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🎬 Montage — 🎨 roues de couleur, 🎯 vectorscope et histogramme, 📢 volume standard (LUFS) à l'export.   node tests/test-montage-plus.js
 * Le test fabrique ses rushes (ffmpeg), sa base et son serveur PHP dans un dossier temporaire, puis efface tout.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const MP = require('../assets/js/heritage-montage-plus.js');

const appRoot = path.resolve(__dirname, '..');
let failed = 0, count = 0, proc = null, browser = null;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    await t('LUFS (BS.1770) : un 1 kHz à −20 dB de crête vaut −23 LUFS en mono, −20 en stéréo ; le silence ne compte pas', () => {
        const sr = 48000, n = sr * 5, s = new Float32Array(n); for (let i = 0; i < n; i++) s[i] = 0.1 * Math.sin(2 * Math.PI * 1000 * i / sr);
        assert.ok(Math.abs(MP.lufs([s], sr).lufs + 23) < 0.1); assert.ok(Math.abs(MP.lufs([s, s], sr).lufs + 20) < 0.1);
        const half = new Float32Array(n * 2); half.set(s); assert.ok(Math.abs(MP.lufs([half], sr).lufs + 23) < 0.2, 'les blancs sont écartés par le seuil');
        assert.equal(MP.lufs([new Float32Array(n)], sr).lufs, -Infinity);
    });
    await t('roues : un point → une couleur (au centre : rien) ; vectorscope : le rouge en haut à gauche', () => {
        assert.deepEqual(MP.color([1, 0]).r, 255); assert.equal(MP.color([0, 0]), null); assert.deepEqual(MP.parse('3,4'), [0.6, 0.8]);
        const [x, y] = MP.scopeXY(255, 0, 0); assert.ok(x < 0 && y < 0);
    });
    let chromium = null; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (_) {} }
    const phpPath = findPhp([devBundledPhp()]), ffmpeg = ['/usr/bin/ffmpeg', 'ffmpeg'].find(f => spawnSync(f, ['-version']).status === 0);
    if (!chromium || !phpPath || !ffmpeg) { console.log('— navigateur : Playwright, PHP ou ffmpeg absent, partie sautée'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-montage-plus-')), mediaDir = path.join(tmp, 'media'); fs.mkdirSync(mediaDir);
    const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: mediaDir, GENEALOGY_SKIP_REFERENCE: '1' };
    const ff = args => { const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8' }); if (r.status !== 0) throw new Error('ffmpeg : ' + r.stderr); };
    try {
        ff(['-f', 'lavfi', '-i', 'color=c=gray:s=320x180:r=25:d=3', '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:d=3', '-af', 'volume=0.2', '-c:v', 'libvpx', '-b:v', '400k', '-c:a', 'libopus', '-b:a', '128k', '-shortest', path.join(mediaDir, 'gris.webm')]);
        const project = { sources: [{ src: 'media/gris.webm', title: 'Gris', kind: 'video', dur: 3, w: 320, h: 180 }],
            v1: [{ id: 'va', s: 0, from: 0, to: 3, tr: { type: 'none', d: 1 }, look: {}, vol: 1 }], v2: [], texts: [], audio: [],
            tracks: [{ id: 'V1', kind: 'main', name: 'Vidéo 1' }, { id: 'T1', kind: 't', name: 'Textes 1' }, { id: 'A1', kind: 'a', name: 'Son 1' }] };
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require "lib/paths.php"; (new PDO("sqlite:".DATA_DIR."/genealogy.sqlite"))->exec(file_get_contents(APP_ROOT."/data/schema.sql")); require "lib/bootstrap.php"; $p = db(); $p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Martin','male')"); $p->prepare("INSERT INTO montage_projects(name, data_json) VALUES(?, ?)")->execute(["Essai", $argv[1]]); echo $p->lastInsertId();`, JSON.stringify(project)], { cwd: appRoot, encoding: 'utf8', env });
        if (r.status !== 0) throw new Error(r.stderr || r.stdout);
        const projId = Number(r.stdout.trim().split('\n').pop());
        const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const pp = s.address().port; s.close(() => res(pp)); }); });
        proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
        const base = `http://127.0.0.1:${port}/`;
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
        browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
        const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
        await ctx.addInitScript(() => { try { localStorage.removeItem('genealogie-montage-prefs'); } catch (_) {} });
        const p = await ctx.newPage(), errors = [];
        p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); });
        await p.goto(base);
        await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.openMontageProject && window.LCNDA_EXT?.montageWheels, null, { timeout: 30000 });
        await p.evaluate(id => window.LCNDA_EXT.openMontageProject(id), projId);
        await p.waitForSelector('[data-mt-canvas]'); await p.waitForFunction(() => document.querySelector('dialog[open]')?.__montage?.eng);
        const M = 'document.querySelector("dialog[open]").__montage';
        const px = () => p.evaluate(() => { const c = document.querySelector('[data-mt-canvas]'); return [...c.getContext('2d').getImageData(c.width >> 1, c.height >> 1, 1, 1).data].slice(0, 3); });
        await p.evaluate(async m => { await eval(m).eng.seek(1); }, M);

        await t('🎨 roues de couleur (tout le film) : tirer « Tons moyens » vers le bleu bleuit l’image ; double-clic : retour', async () => {
            const g0 = await px(); assert.ok(Math.abs(g0[0] - g0[2]) < 12, `gris au départ : ${g0}`);
            await p.click('[data-mt-tab="color"]'); await p.waitForSelector('[data-mt-pane="color"] [data-mt-wheel="film.cw.mid"]');
            assert.equal(await p.$$eval('[data-mt-pane="color"] [data-mt-wheel]', l => l.length), 3);
            const b = await p.$eval('[data-mt-pane="color"] [data-mt-wheel="film.cw.mid"] .h-mt-wheel-disc', el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
            // le bleu : à 240° (sens inverse des aiguilles depuis la droite), donc en bas à gauche à l'écran
            const bx = b.x + b.w / 2 + Math.cos(240 * Math.PI / 180) * b.w * 0.45, by = b.y + b.h / 2 - Math.sin(240 * Math.PI / 180) * b.h * 0.45;
            await p.mouse.move(b.x + b.w / 2, b.y + b.h / 2); await p.mouse.down(); await p.mouse.move(bx, by, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(300);
            const cw = await p.evaluate(m => eval(m).P.look.cw, M); assert.ok(cw?.mid, 'gardé dans le projet');
            const c = await px(); assert.ok(c[2] > c[0] + 15, `bleuie : ${c}`);
            await p.dblclick(`[data-mt-pane="color"] [data-mt-wheel="film.cw.mid"] .h-mt-wheel-disc`); await p.waitForTimeout(300);
            const g1 = await px(); assert.ok(Math.abs(g1[0] - g1[2]) < 12, `revenu au gris : ${g1}`);
        });
        await t('🎨 roues d’un morceau : ombres vers le rouge (écran) — l’image rougit', async () => {
            await p.evaluate(m => { const M = eval(m); M.P.v1[0].look = { cw: { sh: '1,0', hi: '0.8,0' } }; M.eng.redraw(); }, M);
            const c = await px(); assert.ok(c[0] > c[2] + 15, `rougie : ${c}`);
            await p.evaluate(m => { const M = eval(m); M.P.v1[0].look = {}; M.eng.redraw(); }, M);
        });
        await t('🎯 vectorscope : Affichage → le panneau s’ouvre et dessine ; une 2e fois le ferme', async () => {
            await p.evaluate(() => document.querySelector('dialog[open] [data-mt-cmd="scope"]').click());
            await p.waitForSelector('.h-mt-scope canvas'); await p.waitForTimeout(600);
            const lit = await p.$eval('.h-mt-scope canvas[data-h]', c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 150) n++; return n; });
            assert.ok(lit > 20, `histogramme dessiné (${lit})`);
            await p.evaluate(() => document.querySelector('dialog[open] [data-mt-cmd="scope"]').click()); assert.equal(await p.$('.h-mt-scope'), null);
        });
        await t('📢 volume standard : le mélange hors ligne est mesuré (sinus de ffmpeg à 1/8 × 0,2 : −32 dB de crête, en stéréo ≈ −32 LUFS) et le gain amène à −14', async () => {
            const m = await p.evaluate(m => window.LCNDA_EXT.montageLoud.gainFor(eval(m).P, -14), M);
            assert.ok(Math.abs(m.lufs + 32) < 1.5, `mesuré ${m.lufs}`); assert.ok(Math.abs(m.after + 14) < 0.2 || m.limited, `après ${m.after}`);
        });
        await t('📢 volume standard : un réglage de départ (Réglages → Montage), proposé à l’export', async () => {
            const pr = await p.evaluate(() => window.LCNDA_EXT.montagePrefs()); assert.equal(pr.lufs, 0);
            await p.evaluate(() => localStorage.setItem('genealogie-montage-prefs', JSON.stringify({ lufs: -16 })));
            assert.equal(await p.evaluate(() => window.LCNDA_EXT.montagePrefs().lufs), -16);
            await p.evaluate(() => document.querySelector('dialog[open] [data-avx-save]').click()); await p.waitForSelector('dialog[open] select[name="lufs"]');
            assert.equal(await p.inputValue('dialog[open] select[name="lufs"]'), '-16');
        });
        await t('aucune erreur dans la page', async () => assert.deepEqual(errors, []));
    } catch (e) { failed++; console.error('✗ préparation', e && e.stack || e); }
    finally { try { await browser?.close(); } catch (_) {} try { proc?.kill(); } catch (_) {} fs.rmSync(tmp, { recursive: true, force: true }); }
    finish();
})();
function finish() { console.log(`${failed ? '✗' : '✓'} montage, couleurs et volume : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); }
