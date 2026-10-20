'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Montage vidéo, nouveautés :   node tests/test-montage-more.js
 * Transitions (glissements, volets, iris, zoom, flou, fondu en couleur) lues sur les pixels de l'image, effet « vieux film »
 * (animé mais le même à chaque passage), pistes verrouillées, aimant (tête de lecture, Alt pour s'en passer), temps d'une
 * musique (120 battements par minute), stabilisation (une vidéo qui tremble), enregistrement du film.
 * Le test fabrique ses vidéos (ffmpeg), sa base et son serveur PHP dans un dossier temporaire, puis efface tout.
 * MONTAGE_SHOTS=dossier : garde des captures d'écran.
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
if (!chromium || !phpPath || !ffmpeg) { console.log(`— sauté : ${!chromium ? 'Playwright' : !phpPath ? 'PHP' : 'ffmpeg'} absent`); console.log('\n0 vérification (sauté).'); process.exit(0); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-montage-more-'));
const mediaDir = path.join(tmp, 'media'); fs.mkdirSync(mediaDir);
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const ff = args => { const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8' }); if (r.status !== 0) throw new Error('ffmpeg : ' + r.stderr); };
const SIL = ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'];
const VP8 = ['-c:v', 'libvpx', '-b:v', '600k', '-c:a', 'libopus', '-shortest'];
let failed = 0, proc = null, browser = null;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    try {
        // les rushes : rouge, bleu (unis), une mire qui tremble, des « clics » à 120 battements par minute
        ff(['-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=25:d=2.5', ...SIL, ...VP8, path.join(mediaDir, 'rouge.webm')]);
        ff(['-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=25:d=2.5', ...SIL, ...VP8, path.join(mediaDir, 'bleu.webm')]);
        ff(['-f', 'lavfi', '-i', 'mandelbrot=size=400x260', '-frames:v', '1', path.join(tmp, 'motif.png')]); // une image fixe, détaillée dans les deux sens
        ff(['-loop', '1', '-framerate', '25', '-i', path.join(tmp, 'motif.png'), ...SIL, '-vf', 'crop=320:180:40+16*sin(n*1.7):40+12*cos(n*2.3)', '-t', '3', ...VP8, path.join(mediaDir, 'tremble.webm')]);
        ff(['-f', 'lavfi', '-i', "aevalsrc='if(lt(mod(t\\,0.5)\\,0.03)\\,0.9*sin(2*PI*900*t)*exp(-mod(t\\,0.5)*60)\\,0.01*sin(2*PI*110*t))':s=44100:d=8", '-c:a', 'libopus', '-b:a', '96k', path.join(mediaDir, 'musique.webm')]);
        const project = {
            sources: [{ src: 'media/rouge.webm', title: 'Rouge', kind: 'video', dur: 2.5, w: 320, h: 180 }, { src: 'media/bleu.webm', title: 'Bleu', kind: 'video', dur: 2.5, w: 320, h: 180 },
                { src: 'media/tremble.webm', title: 'Tremble', kind: 'video', dur: 3, w: 320, h: 180 }, { src: 'media/musique.webm', title: 'Musique', kind: 'audio', dur: 8 }],
            v1: [{ id: 'va', s: 0, from: 0, to: 2.5, tr: { type: 'none', d: 1 }, look: {}, vol: 1 }, { id: 'vb', s: 1, from: 0, to: 2.5, tr: { type: 'slideL', d: 1 }, look: {}, vol: 1 }, { id: 'vc', s: 2, from: 0, to: 3, tr: { type: 'none', d: 1 }, look: {}, vol: 1 }],
            v2: [], texts: [{ id: 'ta', at: 0.3, dur: 2, text: 'Titre', size: 6, track: 'T1' }], audio: [{ id: 'aa', s: 3, from: 0, to: 8, at: 0, vol: 1, track: 'A1' }],
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
        const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
        await ctx.addInitScript(() => { try { localStorage.removeItem('genealogie-montage-prefs'); } catch (_) {} });
        const p = await ctx.newPage(); const errors = [];
        p.on('pageerror', e => errors.push(e.message));
        p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
        p.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); });
        await p.goto(base);
        await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.openMontageProject, null, { timeout: 30000 });
        await p.evaluate(id => window.LCNDA_EXT.openMontageProject(id), projId);
        await p.waitForSelector('[data-mt-canvas]'); await p.waitForFunction(() => document.querySelector('dialog[open]')?.__montage?.eng);
        const M = 'document.querySelector("dialog[open]").__montage';
        const shot = async name => { if (!shots) return; fs.mkdirSync(shots, { recursive: true }); await p.screenshot({ path: path.join(shots, name) }); };
        const seek = tt => p.evaluate(async ([m, tt]) => { await eval(m).eng.seek(tt); }, [M, tt]);
        // les couleurs d'un point de l'image (x, y en part de la largeur et de la hauteur)
        const px = (x, y) => p.evaluate(([x, y]) => { const c = document.querySelector('[data-mt-canvas]'); return [...c.getContext('2d').getImageData(Math.round(x * (c.width - 1)), Math.round(y * (c.height - 1)), 1, 1).data].slice(0, 3); }, [x, y]);
        const red = c => c[0] > 150 && c[2] < 90, blue = c => c[2] > 150 && c[0] < 90;
        const lastToast = () => p.evaluate(() => [...document.querySelectorAll('.ui-toast-text')].map(x => x.textContent).join(' | '));
        const selectClip = async id => { await p.click(`[data-mt-clip$=":${id}"]`, { position: { x: 4, y: 6 } }); await p.waitForFunction(([m, id]) => eval(m).sel?.id === id, [M, id]); };
        const setTr = async type => { await selectClip('vb'); await p.selectOption('[data-mt-pane="item"] [data-mt-k="tr.type"]', type); await p.waitForFunction(([m, type]) => eval(m).P.v1[1].tr.type === type, [M, type]); };

        await t('transitions : les deux morceaux à l’écran pendant le passage (glissements, volets, iris)', async () => {
            const L = await p.evaluate(m => window.LCNDA_EXT._montage.layoutV1(eval(m).P).map(x => [x.at, x.end, x.cross]), M);
            assert.deepEqual(L[1], [1.5, 4, 1], 'le glissement fait chevaucher les deux morceaux, comme le fondu enchaîné');
            const cases = { slideL: [[0.25, 0.5, red], [0.75, 0.5, blue]], slideR: [[0.25, 0.5, blue], [0.75, 0.5, red]], slideU: [[0.5, 0.25, red], [0.5, 0.75, blue]], slideD: [[0.5, 0.25, blue], [0.5, 0.75, red]],
                wipeL: [[0.2, 0.5, blue], [0.8, 0.5, red]], wipeR: [[0.2, 0.5, red], [0.8, 0.5, blue]], iris: [[0.5, 0.5, blue], [0.02, 0.03, red]] };
            for (const [type, pts] of Object.entries(cases)) {
                await setTr(type); await seek(2.0);
                for (const [x, y, ok] of pts) { const c = await px(x, y); assert.ok(ok(c), `${type} à (${x}, ${y}) : ${c}`); }
                if (type === 'iris') await shot('01-iris.png');
            }
            await seek(1.0); assert.ok(red(await px(0.5, 0.5)), 'avant la transition : le rouge seul');
            await seek(3.0); assert.ok(blue(await px(0.5, 0.5)), 'après la transition : le bleu seul');
        });
        await t('transitions : fondu enchaîné, zoom, flou (mélange), fondu en couleur', async () => {
            for (const type of ['cross', 'zoom', 'blur']) { await setTr(type); await seek(2.0); const c = await px(0.5, 0.5); assert.ok(c[0] > 50 && c[2] > 50, `${type} au milieu : ${c}`); }
            await setTr('zoom'); await seek(1.6); const z = await px(0.5, 0.5); assert.ok(z[0] > 150 && z[2] < 60, `zoom : au début, le rouge agrandi (${z})`);
            await setTr('color'); await p.waitForSelector('[data-mt-k="tr.color"]');
            await p.$eval('[data-mt-k="tr.color"]', el => { el.value = '#00ff00'; el.dispatchEvent(new Event('input', { bubbles: true })); });
            const L = await p.evaluate(m => window.LCNDA_EXT._montage.layoutV1(eval(m).P)[1].at, M); assert.equal(L, 2.5, 'le fondu en couleur ne fait pas chevaucher');
            await seek(2.45); const c = await px(0.5, 0.5); assert.ok(c[1] > 150 && c[0] < 100, `fondu en vert : ${c}`);
            await setTr('slideL');
        });
        await t('vieux film (tout le film) : animé, le même à chaque passage, coins assombris', async () => {
            await p.click('[data-mt-tab="color"]'); await p.click('[data-mt-pane="color"] .h-mt-old summary');
            await p.check('[data-mt-pane="color"] [data-mt-k="pold.on"]');
            await p.waitForFunction(m => eval(m).P.old?.on, M);
            await p.$eval('[data-mt-pane="color"] [data-mt-k="pold.amt"]', el => { el.value = '1'; el.dispatchEvent(new Event('input', { bubbles: true })); });
            const frame = () => p.evaluate(() => { const c = document.querySelector('[data-mt-canvas]'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 4 * 7) h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) >>> 0; return h; });
            await seek(0.5); const a = await frame(); await seek(1.2); await seek(0.5); const b = await frame(); await seek(0.55); const c = await frame();
            assert.equal(a, b, 'même moment, même image (aperçu = export)'); assert.notEqual(a, c, 'le grain bouge d’une image à l’autre');
            await seek(0.5); const mid = await px(0.5, 0.5), corner = await px(0.01, 0.02);
            assert.ok(mid[0] + mid[1] + mid[2] > (corner[0] + corner[1] + corner[2]) + 40, `vignette : centre ${mid}, coin ${corner}`);
            assert.ok(mid[1] > 30, `sépia : le rouge prend du jaune-brun (${mid})`);
            await shot('02-vieux-film.png');
            await p.uncheck('[data-mt-pane="color"] [data-mt-k="pold.on"]').finally(() => p.click('[data-mt-tab="item"]'));
        });
        await t('pistes verrouillées : ni glisser, ni enlever, ni couper ; gardé dans le projet', async () => {
            await p.click('[data-mt-tlock="A1"]');
            assert.equal(await p.evaluate(m => eval(m).P.tracks.find(x => x.id === 'A1').locked, M), true);
            const box = await p.locator('[data-mt-clip="audio:aa"]').boundingBox();
            await p.mouse.move(box.x + 30, box.y + 10); await p.mouse.down(); await p.mouse.move(box.x + 130, box.y + 12, { steps: 6 }); await p.mouse.up();
            assert.equal(await p.evaluate(m => eval(m).P.audio[0].at, M), 0, 'le son n’a pas bougé');
            assert.match(await lastToast(), /Piste verrouillée/);
            await p.click('[data-mt-tlock="V1"]'); await selectClip('va');
            await p.click('[data-mt-op="del"]'); await p.click('[data-mt-op="split"]');
            assert.equal(await p.evaluate(m => eval(m).P.v1.length, M), 3, 'rien d’enlevé ni de coupé sur la piste verrouillée');
            const kept = await p.evaluate(m => window.LCNDA_EXT._montage.projectModel(JSON.parse(JSON.stringify(eval(m).P))).tracks.filter(x => x.locked).map(x => x.id), M);
            assert.deepEqual(kept, ['V1', 'A1']);
            await p.click('[data-mt-tlock="V1"]'); await p.click('[data-mt-tlock="A1"]');
            assert.equal(await p.evaluate(m => eval(m).P.tracks.some(x => x.locked), M), false);
        });
        await t('🥁 temps de la musique : environ 16 temps à 120 par minute, traits sur la frise', async () => {
            await selectClip('aa'); await p.click('[data-mt-pane="item"] [data-mt-beats]');
            await p.waitForFunction(m => Array.isArray(eval(m).P.audio[0].beats), M, { timeout: 30000 });
            const { beats, bpm } = await p.evaluate(m => eval(m).P.audio[0], M);
            assert.ok(Math.abs(bpm - 120) <= 4, `tempo ${bpm}`);
            assert.ok(beats.length >= 14 && beats.length <= 17, `${beats.length} temps : ${beats.join(' ')}`);
            const off = beats.map(b => { const d = b % 0.5; return Math.min(d, 0.5 - d); });
            assert.ok(off.filter(d => d < 0.06).length >= beats.length - 2, `les temps tombent sur les clics : ${beats.join(' ')}`);
            assert.ok(await p.$$eval('[data-mt-clip="audio:aa"] .h-mt-beat', e => e.length) >= 14);
            await shot('03-temps.png');
        });
        await t('🧲 aimant : un titre glissé se colle à la tête de lecture (et pas avec Alt)', async () => {
            await seek(3.0); const beats = await p.evaluate(m => { const a = eval(m).P.audio[0], b = a.beats; a.beats = []; return b; }, M); // d'abord sans les temps
            let ph = 3.0; const drag = async (toAt, alt) => {
                await p.evaluate(m => { eval(m).P.texts[0].at = 0.3; }, M); await p.evaluate(m => eval(m).eng.redraw(), M);
                await selectClip('ta'); await p.evaluate(([m, tt]) => eval(m).eng.seek(tt), [M, ph]); const box = await p.locator('[data-mt-clip="texts:ta"]').boundingBox(); const pxs = 40;
                if (alt) await p.keyboard.down('Alt');
                await p.mouse.move(box.x + 10, box.y + 10); await p.mouse.down(); await p.mouse.move(box.x + 10 + (toAt - 0.3) * pxs, box.y + 11, { steps: 8 });
                const guide = await p.$$eval('.h-mt-snapline:not([hidden])', e => e.length);
                await p.mouse.up(); if (alt) await p.keyboard.up('Alt');
                return [await p.evaluate(m => eval(m).P.texts[0].at, M), guide];
            };
            const [snapped, g1] = await drag(2.93, false); assert.equal(snapped, 3, 'collé à 3,0 s'); assert.equal(g1, 1, 'la ligne de l’aimant se montre');
            const [free, g2] = await drag(2.93, true); assert.ok(Math.abs(free - 2.9) < 0.051, `sans aimant : ${free}`); assert.equal(g2, 0);
            await p.click('[data-mt-snap]'); const [off] = await drag(2.93, false); assert.ok(Math.abs(off - 2.9) < 0.051, `aimant arrêté : ${off}`);
            assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-montage-prefs')).snap), false, 'retenu dans les réglages');
            await p.click('[data-mt-snap]');
            // les temps de la musique attirent aussi (vers 1 s)
            await p.evaluate(([m, b]) => { eval(m).P.audio[0].beats = b; }, [M, beats]);
            const near = beats.reduce((x, y) => Math.abs(y - 0.97) < Math.abs(x - 0.97) ? y : x);
            ph = 6.2; const [b] = await drag(0.97, false); assert.ok(Math.abs(b - near) < 0.002 || Math.abs(b + 2 - beats.reduce((x, y) => Math.abs(y - 2.97) < Math.abs(x - 2.97) ? y : x)) < 0.002, `collé à un temps : ${b}`);
        });
        await t('📐 stabilisation : annuler, puis analyser une vidéo qui tremble (le tremblement est retrouvé et compensé)', async () => {
            await selectClip('vc'); await p.click('[data-mt-pane="item"] .h-mt-stab summary'); await p.click('[data-mt-pane="item"] [data-mt-stab]');
            await p.waitForSelector('[data-mt-stabcancel]'); await p.click('[data-mt-stabcancel]');
            await p.waitForFunction(m => !document.querySelector('[data-mt-stabcancel]') && !eval(m).P.v1[2].stab, M, { timeout: 20000 });
            assert.match(await lastToast(), /annulée/);
            await p.click('[data-mt-pane="item"] .h-mt-stab summary'); await p.click('[data-mt-pane="item"] [data-mt-stab]');
            await p.waitForFunction(m => eval(m).P.v1[2].stab, M, { timeout: 60000 });
            const st = await p.evaluate(m => eval(m).P.v1[2].stab, M);
            // l'image montre la source décalée de (40 + 16 sin(1,7 n)) : son contenu va dans l'autre sens
            const n = st.x.map((_, i) => Math.floor((st.t0 + i * st.dt) * 25 + 1e-6)), ex = n.map(k => -16 * Math.sin(k * 1.7)), ey = n.map(k => -12 * Math.cos(k * 2.3));
            const corr = (a, b) => { const ma = a.reduce((s, v) => s + v, 0) / a.length, mb = b.reduce((s, v) => s + v, 0) / b.length; let s = 0, sa = 0, sb = 0; a.forEach((v, i) => { s += (v - ma) * (b[i] - mb); sa += (v - ma) ** 2; sb += (b[i] - mb) ** 2; }); return s / Math.sqrt(sa * sb); };
            const cx = corr(st.x, ex), cy = corr(st.y, ey);
            assert.ok(cx > 0.85 && cy > 0.85, `chemin retrouvé : ${cx.toFixed(3)} / ${cy.toFixed(3)}`);
            // la correction ramène le contenu à sa place : chemin + correction ≈ constant
            const res = await p.evaluate(m => { const c = eval(m).P.v1[2], S = window.LCNDA_EXT._montage; return c.stab.x.map((x, i) => x / 10000 + S.stabAt(c, c.stab.t0 + i * c.stab.dt).x); }, M);
            const sd = a => { const m0 = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m0) ** 2, 0) / a.length); };
            assert.ok(sd(res) < sd(st.x.map(x => x / 10000)) * 0.35, `tremblement réduit : ${sd(res).toFixed(4)} contre ${sd(st.x.map(x => x / 10000)).toFixed(4)}`);
            assert.ok(await p.$('[data-mt-pane="item"] [data-mt-k="stab.z"]'), 'réglages de la stabilisation');
            await seek(5.0); await shot('04-stabilisation.png');
            const kept = await p.evaluate(m => window.LCNDA_EXT._montage.projectModel(JSON.parse(JSON.stringify(eval(m).P))).v1[2].stab.x.length, M);
            assert.equal(kept, st.x.length, 'gardée dans le projet');
        });
        await t('✂️ couper la vidéo sur les temps', async () => {
            await selectClip('aa'); await p.selectOption('[data-mt-beatevery]', '4'); await p.click('[data-mt-beatcut]');
            await p.waitForFunction(m => eval(m).P.v1.length > 3, M);
            const L = await p.evaluate(m => window.LCNDA_EXT._montage.layoutV1(eval(m).P).map(x => +x.at.toFixed(2)), M);
            assert.ok(L.some(x => Math.abs(x - 6) < 0.08) || L.some(x => Math.abs(x - 4) < 0.08), `coupes : ${L}`);
            await p.click('[data-mt-op="undo"]'); await p.waitForFunction(m => eval(m).P.v1.length === 3, M);
        });
        await t('le film s’enregistre encore (avec transition, vieux film et stabilisation)', async () => {
            const size = await p.evaluate(async m => { const S = window.LCNDA_EXT._montage, P = S.projectModel(JSON.parse(JSON.stringify(eval(m).P)));
                P.audio = []; P.texts = []; P.v1 = P.v1.slice(0, 2); P.v1[1].old = { on: true, amt: 0.8 }; P.v1[0].to = 1.5; P.v1[1].to = 1.5;
                const mime = ['video/webm;codecs=vp8,opus', 'video/webm'].find(x => MediaRecorder.isTypeSupported(x)); const blob = await S.recordMontage(P, mime); return blob.size; }, M);
            assert.ok(size > 5000, `fichier de ${size} octets`);
        });
        await t('aucune erreur dans la page', async () => assert.deepEqual(errors, []));
    } catch (e) { failed++; console.error('✗ préparation', e && e.stack || e); }
    finally {
        try { await browser?.close(); } catch (_) {}
        try { proc?.kill(); } catch (_) {}
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    console.log(failed ? `\n${failed} vérification(s) en échec.` : '\nToutes les vérifications du montage réussies.');
    process.exit(failed ? 1 : 0);
})();
