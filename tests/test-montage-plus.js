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
    await t('suivi (Node) : un carré qui avance est suivi image par image ; entre deux positions, la place se calcule', () => {
        const W = 80, H = 60, fr = []; for (let i = 0; i < 10; i++) { const d = new Float32Array(W * H).fill(30), cx = 20 + i * 4, cy = 20 + i * 2; for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) d[(cy + y) * W + cx + x] = 220 + x * 3; fr.push({ d, W, H }); }
        assert.deepEqual(MP.trackPoints(fr, 20, 20).at(-1), [56, 38]); assert.deepEqual(MP.trackAt([{ t: 0, x: 10, y: 10 }, { t: 2, x: 30, y: 50 }], 1), { t: 1, x: 20, y: 30 });
    });
    await t('caméras (Node) : le décalage retrouvé par le son ; à tour de rôle, sur le temps commun', () => {
        const sr = 8000, N = sr * 10, a = new Float32Array(N); let seed = 1; const rnd = () => ((seed = seed * 16807 % 2147483647) / 2147483647 - 0.5);
        for (let i = 0; i < N; i++) a[i] = rnd() * (Math.sin(i / sr * 3) > 0.3 ? 1 : 0.05);
        const ea = MP.envelope(a, sr), eb = MP.envelope(a.slice(1.5 * sr), sr); assert.equal(MP.bestLag(ea, eb, 200).lag * 0.02, 1.5);
        assert.deepEqual(MP.plan([{ off: 0, dur: 10, env: ea }, { off: 1.5, dur: 8.5, env: eb }], { mode: 'turn', every: 3 }).map(x => [x.cam, x.a, x.b]), [[0, 1.5, 4.5], [1, 4.5, 7.5], [0, 7.5, 10]]);
    });
    await t('fond vert (Node) : le vert pur part, la peau et le gris restent', () => {
        const d = new Uint8ClampedArray([0, 255, 0, 255, 20, 200, 30, 255, 200, 150, 120, 255, 128, 128, 128, 255]); MP.keyPixels(d, {});
        assert.equal(d[3], 0); assert.equal(d[7], 0); assert.deepEqual([...d.slice(8, 16)], [200, 150, 120, 255, 128, 128, 128, 255]);
    });
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
        ff(['-f', 'lavfi', '-i', 'color=c=0x00ff00:s=320x180:r=25:d=3', '-vf', 'drawbox=x=130:y=60:w=60:h=60:color=red:t=fill', '-c:v', 'libvpx', '-b:v', '800k', '-an', path.join(mediaDir, 'vert.webm')]);
        ff(['-f', 'lavfi', '-i', 'color=c=gray:s=320x180:r=25:d=3', '-f', 'lavfi', '-i', 'color=c=red:s=24x24:r=25:d=3', '-filter_complex', "[0][1]overlay=x='20+t*60':y=70", '-c:v', 'libvpx', '-b:v', '800k', '-an', path.join(mediaDir, 'mobile.webm')]);
        // deux « caméras » de la même scène : le même son (des salves irrégulières), la 2e a commencé 1,5 s plus tard
        ff(['-f', 'lavfi', '-i', "aevalsrc='(0.6*random(0)-0.3)*gt(sin(3*t)+sin(7.3*t),0.4)':s=44100:d=9", path.join(tmp, 'scene.wav')]);
        ff(['-f', 'lavfi', '-i', 'color=c=red:s=160x90:r=25:d=9', '-i', path.join(tmp, 'scene.wav'), '-c:v', 'libvpx', '-b:v', '200k', '-c:a', 'libopus', '-shortest', path.join(mediaDir, 'camA.webm')]);
        ff(['-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=25:d=7.5', '-ss', '1.5', '-i', path.join(tmp, 'scene.wav'), '-c:v', 'libvpx', '-b:v', '200k', '-c:a', 'libopus', '-shortest', path.join(mediaDir, 'camB.webm')]);
        const project = { sources: [{ src: 'media/gris.webm', title: 'Gris', kind: 'video', dur: 3, w: 320, h: 180 }, { src: 'media/vert.webm', title: 'Fond vert', kind: 'video', dur: 3, w: 320, h: 180 }, { src: 'media/mobile.webm', title: 'Mobile', kind: 'video', dur: 3, w: 320, h: 180 }, { src: 'media/camA.webm', title: 'Caméra A', kind: 'video', dur: 9, w: 160, h: 90 }, { src: 'media/camB.webm', title: 'Caméra B', kind: 'video', dur: 7.5, w: 160, h: 90 }],
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
        await t('🟩 fond vert : l’incrustation verte devient transparente (le gris de la piste 1 se voit), le sujet rouge reste', async () => {
            await p.evaluate(async m => { const M = eval(m); M.P.v2.push({ id: 'vk', s: 1, from: 0, to: 3, at: 0, full: true, fit: 'fit', vol: 0, track: 'V2' }); M.P.tracks.unshift({ id: 'V2', kind: 'v', name: 'Vidéo 2' }); }, M);
            await p.evaluate(async m => { const M = eval(m); await M.eng.refresh(); await M.eng.seek(1); }, M); await p.waitForTimeout(300);
            const at = (x, y) => p.evaluate(([x, y]) => { const c = document.querySelector('[data-mt-canvas]'); return [...c.getContext('2d').getImageData(Math.round(x * c.width), Math.round(y * c.height), 1, 1).data].slice(0, 3); }, [x, y]);
            const g0 = await at(0.1, 0.1); assert.ok(g0[1] > 200 && g0[0] < 80, `vert avant : ${g0}`);
            await p.evaluate(m => { const M = eval(m); M.P.v2[0].key = { on: true, color: '#00ff00' }; M.eng.redraw(); }, M); await p.waitForTimeout(200);
            const g1 = await at(0.1, 0.1), red = await at(0.5, 0.5); assert.ok(Math.abs(g1[0] - g1[1]) < 25 && g1[1] < 180, `le gris dessous : ${g1}`); assert.ok(red[0] > 150 && red[1] < 90, `le rouge reste : ${red}`);
            await p.evaluate(m => { const M = eval(m); M.P.v2 = []; M.eng.redraw(); }, M);
        });
        await t('🎯 suivre ce qui bouge : un titre posé sur le carré rouge le suit pendant qu’il avance', async () => {
            await p.evaluate(async m => { const M = eval(m); M.P.v1[0].s = 2; M.P.texts.push({ id: 'tx', at: 0, dur: 3, text: 'ICI', size: 5, x: 50, y: 20, track: 'T1' }); await M.eng.refresh(); await M.eng.seek(0.2); }, M);
            await p.evaluate(m => { eval(m).select('texts', 'tx'); }, M); await p.click('[data-mt-tab="item"]'); await p.waitForSelector('[data-mt-pane="item"] [data-mt-trk="pick"]');
            await p.evaluate(async m => { await eval(m).eng.seek(0.2); }, M);
            await p.evaluate(() => document.querySelector('[data-mt-pane="item"] [data-mt-trk="pick"]').click());
            const b = await p.$eval('[data-mt-canvas]', c => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
            await p.mouse.click(b.x + b.w * (32 + 12) / 320, b.y + b.h * 82 / 180);
            await p.waitForFunction(m => eval(m).P.texts.find(x => x.id === 'tx').track?.length > 10, M, { timeout: 60000 });
            const tr = await p.evaluate(m => eval(m).P.texts.find(x => x.id === 'tx').track, M), a = tr[0], z = tr.at(-1);
            assert.ok(Math.abs(a.x - 44 / 320 * 100) < 4, `départ ${a.x}`); assert.ok(z.x - a.x > 40, `il avance : ${a.x} → ${z.x}`); assert.ok(Math.abs(z.y - a.y) < 4, 'à la même hauteur');
            const want = 20 + 2.9 * 60 + 12; assert.ok(Math.abs(z.x - want / 320 * 100) < 6, `arrivée ${z.x} (≈ ${(want / 320 * 100).toFixed(1)})`);
            await p.evaluate(m => { const M = eval(m); M.P.texts = M.P.texts.filter(x => x.id !== 'tx'); M.P.v1[0].s = 0; }, M);
        });
        await t('🎥 plusieurs caméras : calées par le son (1,5 s), montées à tour de rôle, le son d’une seule caméra', async () => {
            const n0 = await p.evaluate(m => eval(m).P.v1.length, M);
            await p.evaluate(() => document.querySelector('dialog[open] [data-mt-cmd="multicam"]').click()); await p.waitForSelector('dialog[open] [name="cam"]');
            await p.$$eval('dialog[open] [name="cam"]', l => l.forEach(i => { i.checked = ['3', '4'].includes(i.value); }));
            await p.selectOption('dialog[open] [name="mode"]', 'turn'); await p.fill('dialog[open] [name="every"]', '2');
            await p.click('dialog[open] button[type="submit"]'); await p.waitForFunction(([m, n0]) => eval(m).P.v1.length > n0, [M, n0], { timeout: 60000 });
            const r = await p.evaluate(([m, n0]) => { const P = eval(m).P; return { v: P.v1.slice(n0).map(c => [c.s, c.from, c.to, c.mute]), a: P.audio.at(-1) }; }, [M, n0]);
            assert.deepEqual(r.v.map(x => x[0]).slice(0, 3), [3, 4, 3], 'à tour de rôle'); assert.ok(r.v.every(x => x[3]), 'les images sans leur son');
            const b = r.v[1]; assert.ok(Math.abs(b[1] - (r.v[0][2] - 1.5)) < 0.08, `caméra B calée : ${b[1]} (A finit à ${r.v[0][2]})`);
            assert.equal(r.a.s, 3); assert.ok(Math.abs(r.a.from - 1.5) < 0.08, `son de A à partir de 1,5 s : ${r.a.from}`);
            await p.evaluate(([m, n0]) => { const P = eval(m).P; P.v1.splice(n0); P.audio.pop(); }, [M, n0]);
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
