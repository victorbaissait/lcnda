'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🎚️ Studio son et ⚡ Son rapide (maquette « Studio son » validée) :   node tests/test-studio-son.js
 *  - réglage par défaut « Comme avant » (l'ancien « 🎧 Modifier le son »), nouveau design derrière son réglage (Réglages) ;
 *  - chaque effet du moteur commun mesuré sur un son fabriqué (énergie dans une bande de fréquences, crête, sonie, durée,
 *    fréquence la plus forte) : il change vraiment le son ;
 *  - rack non destructif, ↶ ↷ et historique, marqueurs et zones (enregistrés, reliés à une fiche, bloc « 🎧 On l'entend »),
 *    multipiste (baisse de la musique sous la voix), export (formats, un fichier par zone, texte et repères), passage
 *    rapide ⇄ Studio (avec l'ancien design comme avec le nouveau), réglages enregistrés, transcription, micro, pas à pas.
 * Le test fabrique ses sons, sa base et son serveur PHP dans un dossier temporaire, puis efface tout. SON_SHOTS=dossier : captures.
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
const shots = process.env.SON_SHOTS || '';
if (!chromium || !phpPath) { console.log(`— sauté : ${!chromium ? 'Playwright' : 'PHP'} absent`); console.log('\n0 vérification (sauté).'); process.exit(0); }

/** un WAV 16 bits mono : fn(t) → échantillon */
function wav(file, dur, fn, sr = 44100) {
    const n = Math.round(dur * sr), b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    let s = 7; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; };
    for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, fn(i / sr, rnd))) * 32767), 44 + i * 2);
    fs.writeFileSync(file, b);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-studio-son-'));
const mediaDir = path.join(tmp, 'media'); fs.mkdirSync(mediaDir);
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let failed = 0, passed = 0, proc = null, browser = null;
const t = async (name, fn) => { try { await fn(); passed++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    try {
        // la « cassette » : 1,5 s de silence (bouton Lecture), une voix (bouffées de 220 et 660 Hz), 1,5 s de cassette à vide ; souffle et ronflement du courant (50 Hz) partout
        wav(path.join(mediaDir, 'cassette.wav'), 10, (x, r) => (x > 1.5 && x < 8.5 ? (0.35 * Math.sin(2 * Math.PI * 220 * x) + 0.15 * Math.sin(2 * Math.PI * 660 * x)) * Math.abs(Math.sin(2 * Math.PI * 1.1 * x)) : 0) + 0.03 * r() + 0.05 * Math.sin(2 * Math.PI * 50 * x) + 0.02 * Math.sin(2 * Math.PI * 100 * x));
        wav(path.join(mediaDir, 'musique.wav'), 10, x => 0.3 * Math.sin(2 * Math.PI * 800 * x));
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require "lib/paths.php"; (new PDO("sqlite:".DATA_DIR."/genealogy.sqlite"))->exec(file_get_contents(APP_ROOT."/data/schema.sql")); require "lib/bootstrap.php"; $p = db();
            $p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Louis','Durand','male')"); $pid = $p->lastInsertId();
            $p->exec("INSERT INTO media(title,media_type,filename) VALUES('Cassette Noël 1978','audio','cassette.wav')"); $cas = (int) $p->lastInsertId(); $p->exec("INSERT INTO media(title,media_type,filename) VALUES('Le petit vin blanc','audio','musique.wav')"); $mus = (int) $p->lastInsertId();
            $t = $p->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn(); $p->prepare("INSERT INTO events(scope,person_id,event_type_id,title,year) VALUES('person',?,?,?,1940)")->execute([$pid, $t, 'Évacuation de Dunkerque']);
            echo json_encode(['pid' => (int) $pid, 'ev' => (int) $p->lastInsertId(), 'cas' => $cas, 'mus' => $mus, 'v' => (int) $p->query('PRAGMA user_version')->fetchColumn()]);`], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
        if (r.status !== 0) throw new Error(r.stderr || r.stdout);
        const ids = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
        const port = await freePort();
        proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
        const base = `http://127.0.0.1:${port}/`;
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
        const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
        browser = await chromium.launch({ ...(fs.existsSync(exe) ? { executablePath: exe } : {}), args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
        await ctx.grantPermissions(['microphone']);
        const p = await ctx.newPage(); const errors = [];
        p.on('pageerror', e => errors.push(e.message));
        p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
        p.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); });
        await p.goto(base);
        await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.openSound && window.LCNDA_EXT?.audioEngine && window.LCNDA_EXT?.openAudioStudio && window.LCNDA_EXT?.audioMulti, null, { timeout: 30000 });
        const shot = async name => { if (!shots) return; fs.mkdirSync(shots, { recursive: true }); await p.screenshot({ path: path.join(shots, name) }); };
        const api = (action, q = {}) => p.evaluate(([a, q]) => window.LCNDA_APP.api(a, q), [action, q]);
        const CAS = { id: ids.cas, title: 'Cassette Noël 1978', filename: 'cassette.wav', media_type: 'audio' }, MUS_ID = ids.mus;
        const closeAll = () => p.evaluate(() => { document.querySelectorAll('dialog.h-aq[open], dialog.h-as[open], dialog.h-avx[open]').forEach(d => { if (d._aq) d._aq.forceClose?.(); d.dispatchEvent(new Event('lcnda-test-close')); d.close(); }); });

        /* ═════ 1. Le moteur : chaque effet change vraiment le son ═════ */
        const m = await p.evaluate(async () => {
            const E = window.LCNDA_EXT.audioEngine, sr = 44100, out = {};
            const make = (dur, fn) => { const n = Math.round(dur * sr), b = new AudioBuffer({ length: n, numberOfChannels: 1, sampleRate: sr }), d = b.getChannelData(0); let s = 1; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; }; for (let i = 0; i < n; i++) d[i] = fn(i / sr, rnd); return b; };
            const R = (b, fx) => E.renderRack(b, fx);
            const tone = make(4, (x, r) => (x > 1 ? 0.4 * Math.sin(2 * Math.PI * 440 * x) : 0) + 0.05 * r());
            { const o = await R(tone, [E.newFx('denoise', { print: { a: 0.1, b: 0.9 } })]); out.denoise = [E.bandEnergy(tone, 4000, 8000, { t0: 1.5, t1: 3.5 }) - E.bandEnergy(o, 4000, 8000, { t0: 1.5, t1: 3.5 }), E.bandEnergy(tone, 400, 480, { t0: 1.5, t1: 3.5 }) - E.bandEnergy(o, 400, 480, { t0: 1.5, t1: 3.5 })];
              out.denoiseAuto = E.bandEnergy(tone, 4000, 8000, { t0: 1.5, t1: 3.5 }) - E.bandEnergy(await R(tone, [E.newFx('denoise')]), 4000, 8000, { t0: 1.5, t1: 3.5 });
              const rem = await R(tone, [E.newFx('denoise', { print: { a: 0.1, b: 0.9 }, removed: true })]); out.removed = E.bandEnergy(tone, 400, 480, { t0: 1.5, t1: 3.5 }) - E.bandEnergy(rem, 400, 480, { t0: 1.5, t1: 3.5 }); }
            const hum = make(3, x => 0.3 * Math.sin(2 * Math.PI * 330 * x) + 0.1 * Math.sin(2 * Math.PI * 60 * x) + 0.05 * Math.sin(2 * Math.PI * 120 * x));
            { const o = await R(hum, [E.newFx('dehum')]); out.hum = [E.detectHum(hum), E.bandEnergy(hum, 57, 63) - E.bandEnergy(o, 57, 63), E.bandEnergy(hum, 117, 123) - E.bandEnergy(o, 117, 123), Math.abs(E.bandEnergy(hum, 320, 340) - E.bandEnergy(o, 320, 340))]; out.noHum = E.detectHum(make(2, x => 0.3 * Math.sin(2 * Math.PI * 300 * x))); }
            const clk = make(2, x => 0.3 * Math.sin(2 * Math.PI * 300 * x)), clean = clk.getChannelData(0).slice(); for (let k = 0; k < 20; k++) clk.getChannelData(0)[5000 + k * 4000] += 0.8;
            { const o = await R(clk, [E.newFx('declick')]), d = o.getChannelData(0); let mx = 0; for (let i = 0; i < d.length; i++) mx = Math.max(mx, Math.abs(d[i] - clean[i])); out.declick = mx; }
            const ess = make(3, (x, r) => 0.3 * Math.sin(2 * Math.PI * 300 * x) + ((x % 1) > 0.5 && (x % 1) < 0.7 ? 0.3 * r() : 0));
            { const o = await R(ess, [E.newFx('deess', { thr: -40, amount: 12 })]); out.deess = [E.bandEnergy(ess, 6000, 12000, { t0: 0.5, t1: 0.7 }) - E.bandEnergy(o, 6000, 12000, { t0: 0.5, t1: 0.7 }), Math.abs(E.bandEnergy(ess, 290, 310) - E.bandEnergy(o, 290, 310))]; }
            const loud = make(2, x => 0.9 * Math.sin(2 * Math.PI * 200 * x) * (x < 1 ? 1 : 0.1));
            out.limit = E.linToDb(E.peakOf(await R(loud, [E.newFx('gain', { db: 6 }), E.newFx('limit', { ceil: -3 })])));
            { const o = await R(loud, [E.newFx('comp', { thr: -30, ratio: 8, attack: 1 })]), a = E.frameRms(loud, loud.length / 2), c = E.frameRms(o, o.length / 2); out.comp = [a[0] / a[1], c[0] / c[1]]; }
            const noise = make(2, (x, r) => 0.2 * r());
            { const o = await R(noise, [E.newFx('eqg', { g5: 12 })]); out.eqg = [E.bandEnergy(o, 900, 1100) - E.bandEnergy(noise, 900, 1100), Math.abs(E.bandEnergy(o, 100, 150) - E.bandEnergy(noise, 100, 150))]; }
            out.eqp = E.bandEnergy(await R(noise, [E.newFx('eqp')]), 2800, 3200) - E.bandEnergy(noise, 2800, 3200);
            out.filter = E.bandEnergy(noise, 20, 60) - E.bandEnergy(await R(noise, [E.newFx('filter', { hp: 300, lp: 20000 })]), 20, 60);
            out.gain = E.linToDb(E.peakOf(await R(loud, [E.newFx('gain', { db: -6 })]))) - E.linToDb(E.peakOf(loud));
            out.normalize = E.linToDb(E.peakOf(await R(loud, [E.newFx('normalize', { peak: -6 })])));
            { const flat = make(4, () => 0.5); const f = async sh => (await R(flat, [E.newFx('fade', { in: 2, out: 0, shapeIn: sh })])).getChannelData(0)[sr]; out.fade = { lin: await f('lin'), fast: await f('fast'), slow: await f('slow'), s: await f('s'), start: (await R(flat, [E.newFx('fade', { in: 2, out: 1 })])).getChannelData(0)[0] }; }
            out.loudness = await E.lufs(await R(loud, [E.newFx('loudness', { target: -16 })]));
            { const burst = make(2, (x, r) => x < 0.05 ? r() * 0.8 : 0), o = await R(burst, [E.newFx('reverb', { room: 'eglise', mix: 60, dur: 2 })]); out.reverb = [E.frameRms(burst, sr / 2)[1], E.frameRms(o, sr / 2)[1]]; }
            const a4 = make(2, x => 0.5 * Math.sin(2 * Math.PI * 440 * x));
            { const o = await R(a4, [E.newFx('speed', { speed: 50, keep: true })]); out.slow = [o.duration, E.dominantFreq(o, { t0: 1 })]; }
            { const o = await R(a4, [E.newFx('speed', { pitch: 12, keep: true })]); out.pitch = [o.duration, E.dominantFreq(o, { t0: 0.5 })]; }
            { const o = await R(a4, [E.newFx('speed', { speed: 200, keep: false })]); out.tape = [o.duration, E.dominantFreq(o, { t0: 0.2 })]; }
            const cough = make(3, x => 0.3 * Math.sin(2 * Math.PI * 300 * x) + (x > 1.4 && x < 1.6 ? 0.4 * Math.sin(2 * Math.PI * 3000 * x) : 0));
            { const o = await R(cough, [E.newFx('repair', { masks: [{ t0: 1.38, t1: 1.62, f0: 2500, f1: 3500 }] })]); out.repair = [E.bandEnergy(cough, 2800, 3200, { t0: 1.42, t1: 1.58 }) - E.bandEnergy(o, 2800, 3200, { t0: 1.42, t1: 1.58 }), Math.abs(E.bandEnergy(cough, 290, 310) - E.bandEnergy(o, 290, 310))]; }
            const sil = make(10, x => (x > 2 && x < 3) || (x > 7 && x < 8) ? 0.3 * Math.sin(2 * Math.PI * 300 * x) : 0.001 * Math.sin(x * 9000));
            out.edges = E.edgeSilences(sil); out.silences = (await R(sil, [E.newFx('silences', { min: 2, keep: 0.5 })])).duration; out.trim = (await R(sil, [E.newFx('trim', { a: 1, b: 4 })])).duration;
            { const part = await R(a4, [{ ...E.newFx('gain', { db: -20 }), range: { a: 0.5, b: 1 } }]); out.range = [E.linToDb(E.frameRms(part, sr / 4)[0]) - E.linToDb(E.frameRms(a4, sr / 4)[0]), E.linToDb(E.frameRms(part, sr / 4)[2] / E.frameRms(a4, sr / 4)[2])]; }
            out.quickRack = E.quickToRack({ on: { hiss: true, voice: true, trim: true, silences: true }, force: 'fort', trim: { a: 1, b: 3 } }).map(x => x.type);
            { const r0 = [...E.quickToRack({ on: { hiss: true, level: true }, force: 'doux' }), E.newFx('reverb')]; const b0 = E.rackToQuick(r0); out.backQuick = [Object.keys(b0.q.on).sort().join(','), b0.q.force, b0.extras.map(x => x.type).join(',')]; }
            out.clean = E.cleanRack([{ type: 'nope' }, { type: 'gain', params: { db: 99 } }, { type: 'eqp', params: { bands: [{ type: '<x>', f: 1e9, g: -99, q: 0 }] } }]).map(x => [x.type, JSON.stringify(x.params)]);
            // multipiste : la musique baisse quand la voix parle
            const v = make(4, x => x > 1 && x < 2 ? 0.5 * Math.sin(2 * Math.PI * 300 * x) : 0), mu = make(4, x => 0.3 * Math.sin(2 * Math.PI * 800 * x)), pts = E.duckPoints(v, { db: -12 });
            const mix = await E.mixdown({ tracks: [{ id: 'v', clips: [{ key: 'v', start: 0, offset: 0, dur: 4 }] }, { id: 'm', clips: [{ key: 'm', start: 0, offset: 0, dur: 4 }], auto: { vol: pts } }] }, { v, m: mu });
            out.duck = [E.bandEnergy(mix, 780, 820, { t0: 0.2, t1: 0.8 }) - E.bandEnergy(mix, 780, 820, { t0: 1.3, t1: 1.8 })];
            const panned = await E.mixdown({ tracks: [{ id: 'm', pan: -1, clips: [{ key: 'm', start: 0, offset: 0, dur: 4 }] }] }, { m: mu }); out.pan = [E.peakOf(E.fromArrays([panned.getChannelData(0)], sr)), E.peakOf(E.fromArrays([panned.getChannelData(1)], sr))];
            const muted = await E.mixdown({ tracks: [{ id: 'v', clips: [{ key: 'v', start: 0, offset: 0, dur: 4 }] }, { id: 'm', mute: true, clips: [{ key: 'm', start: 0, offset: 0, dur: 4 }] }] }, { v, m: mu }); out.mute = E.bandEnergy(muted, 780, 820);
            // encodeurs et textes
            const fl = new Uint8Array(await (await E.encode('flac', a4, { tags: { title: 'Essai', chapters: [{ title: 'A', start: 0 }] } })).arrayBuffer()); out.flac = [String.fromCharCode(...fl.slice(0, 4)), new TextDecoder().decode(fl).includes('TITLE=Essai')];
            await E.loadLame(); const mp = new Uint8Array(await (await E.encode('mp3', a4, { tags: { title: 'Essai', artist: 'Louis', chapters: [{ title: 'Guerre', start: 0, end: 1 }] } })).arrayBuffer()); out.mp3 = [String.fromCharCode(...mp.slice(0, 3)), new TextDecoder('latin1').decode(mp.slice(0, 600)).includes('CHAP')];
            const dec = await E.ctx().decodeAudioData(mp.buffer.slice(0)); out.mp3dur = dec.duration;
            out.m4a = await E.m4aSupported();
            out.srt = E.toSrt([{ t: 1.5, who: 'Louis', text: 'En 40' }, { t: 4, who: '', text: 'Raconte' }], 10); out.vtt = E.toVtt([{ t: 1, who: '', text: 'x' }], 5, [{ kind: 'zone', name: 'Guerre', start: 0, end: 2 }]); out.cue = E.toCue([{ name: 'Guerre', start: 62.5 }], 'son.mp3', 'Cassette');
            return out;
        });
        await t('moteur : réduction de bruit par empreinte (choisie ou trouvée seule), « n’écouter que le bruit enlevé »', () => { assert.ok(m.denoise[0] > 10, `souffle −${m.denoise[0]} dB`); assert.ok(Math.abs(m.denoise[1]) < 1.5, `la voix change de ${m.denoise[1]} dB`); assert.ok(m.denoiseAuto > 8, `auto −${m.denoiseAuto}`); assert.ok(m.removed > 15, 'le bruit enlevé ne contient presque pas la voix'); });
        await t('moteur : De-hum trouve le courant (60 Hz) et l’enlève avec ses harmoniques, sans toucher la voix', () => { assert.equal(m.hum[0], 60); assert.ok(m.hum[1] > 15 && m.hum[2] > 15, JSON.stringify(m.hum)); assert.ok(m.hum[3] < 1); assert.equal(m.noHum, 0); });
        await t('moteur : De-clicker enlève les clics', () => assert.ok(m.declick < 0.05, `écart ${m.declick}`));
        await t('moteur : De-esser baisse les sifflantes, pas la voix', () => { assert.ok(m.deess[0] > 8, `sifflantes −${m.deess[0]} dB`); assert.ok(m.deess[1] < 0.5); });
        await t('moteur : limiteur (crête au plafond), compresseur (moins d’écart fort / faible)', () => { assert.ok(m.limit <= -2.95, `crête ${m.limit}`); assert.ok(m.comp[1] < m.comp[0] / 3, JSON.stringify(m.comp)); });
        await t('moteur : égaliseurs graphique et paramétrique, filtre, volume, normaliser', () => { assert.ok(m.eqg[0] > 9 && m.eqg[1] < 1.5, JSON.stringify(m.eqg)); assert.ok(m.eqp > 3, `présence +${m.eqp}`); assert.ok(m.filter > 15); assert.ok(Math.abs(m.gain + 6) < 0.05); assert.ok(Math.abs(m.normalize + 6) < 0.05); });
        await t('moteur : fondus à 4 courbes (droite, rapide, lente, en S)', () => { const f = m.fade; assert.ok(f.start === 0); assert.ok(Math.abs(f.lin - 0.25) < 0.01 && f.fast > f.lin && f.slow < f.lin && Math.abs(f.s - 0.25) < 0.01, JSON.stringify(f)); });
        await t('moteur : volume égal (−16 LUFS), réverbération (une traîne)', () => { assert.ok(Math.abs(m.loudness + 16) < 0.6, `sonie ${m.loudness}`); assert.ok(m.reverb[0] === 0 && m.reverb[1] > 0.002, JSON.stringify(m.reverb)); });
        await t('moteur : vitesse et hauteur séparées (hauteur gardée, demi-tons, comme une bande)', () => { assert.ok(Math.abs(m.slow[0] - 4) < 0.05 && Math.abs(m.slow[1] - 440) < 6, `ralenti ${m.slow}`); assert.ok(Math.abs(m.pitch[0] - 2) < 0.05 && Math.abs(m.pitch[1] - 880) < 10, `hauteur ${m.pitch}`); assert.ok(Math.abs(m.tape[0] - 1) < 0.02 && Math.abs(m.tape[1] - 880) < 10, `bande ${m.tape}`); });
        await t('moteur : réparation au pinceau (la toux part, la voix reste)', () => { assert.ok(m.repair[0] > 25, `toux −${m.repair[0]} dB`); assert.ok(m.repair[1] < 0.5); });
        await t('moteur : silences du début et de la fin trouvés, blancs raccourcis, coupe, effet sur la sélection seulement', () => { assert.ok(m.edges.a > 1.4 && m.edges.a < 2 && m.edges.b > 8 && m.edges.b < 8.6, JSON.stringify(m.edges)); assert.ok(m.silences < 7.5 && m.silences > 5); assert.ok(Math.abs(m.trim - 3) < 0.01); assert.ok(Math.abs(m.range[0]) < 0.1 && m.range[1] < -15, JSON.stringify(m.range)); });
        await t('moteur : Son rapide ⇄ rack (les boutons deviennent des effets et reviennent ; le reste reste à part) ; rack nettoyé', () => { assert.deepEqual(m.quickRack, ['trim', 'denoise', 'voice', 'silences']); assert.deepEqual(m.backQuick, ['hiss,level', 'doux', 'reverb']); assert.equal(m.clean.length, 2); assert.equal(m.clean[0][1], '{"db":24}'); assert.match(m.clean[1][1], /"type":"peaking","f":20000,"g":-24,"q":0.1/); });
        await t('moteur : multipiste (baisse sous la voix, panoramique, muet)', () => { assert.ok(m.duck[0] > 10, `baisse ${m.duck}`); assert.ok(m.pan[0] > 0.3 && m.pan[1] < 1e-4, JSON.stringify(m.pan)); assert.ok(m.mute < 0, `muet ${m.mute}`); });
        await t('moteur : encodeurs (FLAC avec étiquettes, MP3 avec ID3 et chapitres, relu), textes et repères', () => { assert.deepEqual(m.flac, ['fLaC', true]); assert.deepEqual(m.mp3, ['ID3', true]); assert.ok(Math.abs(m.mp3dur - 2) < 0.15); assert.match(m.srt, /^1\n00:00:01,500 --> 00:00:04,000\nLouis : En 40/); assert.match(m.vtt, /^WEBVTT[\s\S]*\[Guerre\]/); assert.match(m.cue, /INDEX 01 01:02:37/); });

        /* ═════ 2. Le réglage : « Comme avant » par défaut, le nouveau ⚡ Son rapide derrière le réglage ═════ */
        await p.evaluate(() => { localStorage.removeItem('genealogie-audio-quick-design'); localStorage.setItem('genealogie-audio-mode', 'quick'); });
        await t('par défaut « Comme avant » : ✂️ Modifier un son ouvre l’éditeur d’avant (« 🎧 Modifier le son »), avec « 🎚️ Studio son »', async () => {
            await p.evaluate(c => window.LCNDA_EXT.openAvEditor(c), CAS); await p.waitForSelector('dialog.h-avx[open] [data-avx-canvas]');
            assert.equal(await p.$('dialog.h-aq[open]'), null); assert.ok(await p.$('dialog.h-avx[open] [data-au-studio]'));
            await closeAll();
        });
        await t('Réglages → Montage, retouche, mise en page et son → 🎧 Son : « Comme avant » choisi, et le nouveau design se choisit (gardé tout seul)', async () => {
            await p.evaluate(() => { window.LCNDA_APP.state.maintenanceTab = 'montage_prefs'; window.LCNDA_APP.setModule('maintenance'); });
            await p.waitForSelector('[data-mtp-audiodesign]', { timeout: 15000 });
            assert.equal(await p.inputValue('[data-mtp-audiodesign]'), 'classic');
            await p.selectOption('[data-mtp-audiodesign]', 'new'); await p.waitForTimeout(600);
            assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-audio-quick-design')), 'new');
            await shot('maintenance-son.png');
        });
        await t('nouveau design : gros interrupteurs, bourdonnement trouvé tout seul, ✨ Tout nettoyer, Avant / Après, 4 boutons du bas', async () => {
            await p.evaluate(c => window.LCNDA_EXT.openAvEditor(c), CAS); await p.waitForSelector('dialog.h-aq[open] [data-aq-canvas]');
            assert.equal(await p.locator('dialog.h-aq [data-aq-tog]').count(), 7);
            assert.match(await p.textContent('[data-aq-help="hum"]'), /trouvé tout seul : 50 Hz/);
            assert.deepEqual(await p.$$eval('dialog.h-aq .modal-actions button', bs => bs.map(b => b.textContent.trim()).slice(-4)), ['Annuler', 'Copie séparée', 'Enregistrer sans l’afficher', 'Enregistrer et afficher cette version']);
            await p.click('[data-aq-cmd="all"]');
            await p.waitForFunction(() => { const a = document.querySelector('dialog.h-aq')._aq; return a.busy() === 0 && a.proc(); }, null, { timeout: 30000 });
            const r0 = await p.evaluate(() => { const a = document.querySelector('dialog.h-aq')._aq, E = window.LCNDA_EXT.audioEngine; return {on: a.q().on, cuts: a.cuts().length, hum: E.bandEnergy(a.base(), 45, 55, {t0: 3, t1: 7}) - E.bandEnergy(a.proc(), 45, 55, {t0: 3, t1: 7}), trim: a.trim()}; });
            assert.ok(r0.on.hiss && r0.on.clicks && r0.on.hum && r0.on.voice && r0.on.level && r0.on.trim, JSON.stringify(r0.on));
            assert.ok(r0.cuts === 2 && r0.trim.a > 1 && r0.trim.b < 9, JSON.stringify(r0)); assert.ok(r0.hum > 15, `ronflement −${r0.hum} dB`);
            assert.match(await p.textContent('[data-aq-notice]'), /hachurées seront coupées/);
            await p.click('[data-aq-ab="before"]'); assert.equal(await p.evaluate(() => document.querySelector('dialog.h-aq')._aq.ab()), 'before'); await p.click('[data-aq-ab="after"]');
            await p.click('[data-aq-cmd="play"]'); await p.waitForTimeout(300); await p.keyboard.down('a'); await p.waitForTimeout(150);
            assert.equal(await p.evaluate(() => document.querySelector('dialog.h-aq')._aq.ab()), 'before', 'A maintenue : l’avant'); await p.keyboard.up('a'); await p.waitForTimeout(100);
            assert.equal(await p.evaluate(() => document.querySelector('dialog.h-aq')._aq.ab()), 'after'); await p.click('[data-aq-cmd="play"]');
            await shot('rapide.png');
        });
        await t('Son rapide : force, ↶ ↷, poignées du début et de la fin', async () => {
            await p.click('[data-aq-force="fort"]'); assert.equal(await p.evaluate(() => document.querySelector('dialog.h-aq')._aq.q().force), 'fort');
            await p.click('[data-aq-cmd="undo"]'); assert.equal(await p.evaluate(() => document.querySelector('dialog.h-aq')._aq.q().force), 'moyen');
            await p.click('[data-aq-cmd="redo"]'); assert.equal(await p.evaluate(() => document.querySelector('dialog.h-aq')._aq.q().force), 'fort');
            const b = await (await p.$('[data-aq-canvas]')).boundingBox(), a0 = await p.evaluate(() => document.querySelector('dialog.h-aq')._aq.trim().a);
            const x0 = b.x + a0 / 10 * b.width; await p.mouse.move(x0, b.y + b.height / 2); await p.mouse.down(); await p.mouse.move(x0 + b.width * 0.1, b.y + b.height / 2, { steps: 4 }); await p.mouse.up();
            assert.ok(await p.evaluate(() => document.querySelector('dialog.h-aq')._aq.trim().a) > a0 + 0.7, 'la poignée a bougé');
            await p.click('[data-aq-cmd="undo"]'); assert.ok(Math.abs(await p.evaluate(() => document.querySelector('dialog.h-aq')._aq.trim().a) - a0) < 0.01);
        });
        await t('💾 Réglages enregistrés : Cassette, Dictaphone, Vidéo de mariage, et les miens (partagés avec le Studio)', async () => {
            await p.click('dialog.h-aq [data-ui-presets] [data-ps-toggle]').catch(() => {});
            const names = await p.$$eval('dialog.h-aq .ui-presets-name b', bs => bs.map(b => b.textContent));
            assert.ok(names.some(n => /Cassette/.test(n)) && names.some(n => /Dictaphone/.test(n)) && names.some(n => /mariage/.test(n)), names.join(' | '));
            await p.click('dialog.h-aq .ui-presets-list li:nth-child(2) [data-ps-apply]'); await p.waitForTimeout(200);
            const qq = await p.evaluate(() => document.querySelector('dialog.h-aq')._aq.q()); assert.deepEqual(Object.keys(qq.on).filter(k => qq.on[k]).sort(), ['hiss', 'silences', 'trim', 'voice']); assert.equal(qq.force, 'fort');
            await p.click('dialog.h-aq [data-ps-new]'); await p.fill('dialog.h-aq [data-ps-name]', 'Interviews de mamie'); await p.click('dialog.h-aq [data-ps-ok]'); await p.waitForTimeout(200);
            assert.match(await p.evaluate(() => localStorage.getItem('genealogie-audio-fx-presets')), /Interviews de mamie/);
        });
        await t('⚡ → 🎚️ : chaque bouton allumé devient un effet du rack ; les coupes deviennent des coupes de l’onde (historique)', async () => {
            await p.click('[data-aq-cmd="studio"]'); await p.waitForSelector('dialog.h-as[open] [data-as-canvas]'); await p.waitForTimeout(400);
            const s0 = await p.evaluate(() => { const a = document.querySelector('dialog.h-as')._as; return {rack: a.st.rack.map(x => x.type), hist: a.hist(), dur: a.base().duration}; });
            assert.deepEqual(s0.rack, ['denoise', 'voice']); assert.ok(s0.hist.some(h => /Couper le début/.test(h)) && s0.hist.some(h => /Raccourcir/.test(h) || /Couper la fin/.test(h)), s0.hist.join(' | '));
            assert.ok(s0.dur < 9, `durée ${s0.dur}`); assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-audio-mode')), 'studio');
        });
        await t('🎚️ → ⚡ : ce que le Son rapide sait montrer revient en boutons ; « 1 réglage du Studio reste appliqué »', async () => {
            await p.evaluate(() => document.querySelector('dialog.h-as')._as.addFx('reverb'));
            await p.click('dialog.h-as [data-as-cmd="quick"]'); await p.waitForSelector('dialog.h-aq[open]');
            const q = await p.evaluate(() => { const a = document.querySelector('dialog.h-aq')._aq; return {on: a.q().on, extras: a.extras().map(x => x.type)}; });
            assert.ok(q.on.hiss && q.on.voice, JSON.stringify(q)); assert.deepEqual(q.extras, ['reverb']);
            assert.match(await p.textContent('[data-aq-extras]'), /1 réglage du Studio reste appliqué \(réverbération\)/);
            assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-audio-mode')), 'quick');
            await closeAll();
        });
        await t('avec l’ancien design aussi : 🎚️ Studio son, puis retour avec la pastille « N réglages du Studio restent appliqués »', async () => {
            await p.evaluate(() => localStorage.removeItem('genealogie-audio-quick-design'));
            await p.evaluate(c => window.LCNDA_EXT.openAvEditor(c), CAS); await p.waitForSelector('dialog.h-avx[open] [data-au-studio]');
            await p.click('dialog.h-avx[open] [data-au-studio]'); await p.waitForSelector('dialog.h-as[open]');
            await p.evaluate(() => { const a = document.querySelector('dialog.h-as')._as; a.addFx('eqg'); a.addFx('limit'); });
            await p.click('dialog.h-as [data-as-cmd="quick"]'); await p.waitForSelector('dialog.h-avx[open] [data-au-rackpill]:not([hidden])');
            assert.match(await p.textContent('dialog.h-avx[open] [data-au-rackpill]'), /2 réglages du Studio restent appliqués/);
            await closeAll(); await p.evaluate(() => localStorage.setItem('genealogie-audio-quick-design', 'new'));
        });

        /* ═════ 3. Le Studio : rack non destructif, ↶ ↷, marqueurs et zones, liens, transcription ═════ */
        await p.evaluate(c => { localStorage.setItem('genealogie-audio-mode', 'studio'); return window.LCNDA_EXT.openAvEditor(c); }, CAS);
        await p.waitForSelector('dialog.h-as[open] [data-as-canvas]'); await p.waitForTimeout(300);
        const AS = 'document.querySelector("dialog.h-as")._as';
        await t('Studio : barre E1 avec ses menus, panneau E2, barre du bas K18', async () => {
            const menus = await p.$$eval('dialog.h-as [data-as-menus] [data-ui-menu]', bs => bs.map(b => b.textContent));
            assert.deepEqual(menus, ['Fichier', 'Édition', 'Effets', 'Marqueurs', 'Affichage', 'Fenêtre']);
            await p.click('dialog.h-as [data-ui-menu="Effets"]'); await p.waitForTimeout(150);
            const items = await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu button')].map(b => b.textContent).join('|'));
            for (const w of ['Égaliseur graphique', 'Égaliseur paramétrique', 'Compresseur', 'Limiteur', 'Réduction de bruit', 'De-clicker', 'De-hum', 'De-esser', 'Réverbération', 'Vitesse et hauteur', 'Normaliser', 'Fondus']) assert.ok(items.includes(w), `menu Effets : ${w}`);
            await p.keyboard.press('Escape');
            assert.ok(await p.$('dialog.h-as [data-ui-section="as-rack"]') && await p.$('dialog.h-as [data-ui-section="as-hist"]'));
        });
        await t('Studio : rack non destructif (le son de départ ne change pas ; 👁 éteint ; × retire)', async () => {
            const r0 = await p.evaluate(async AS => { const a = eval(AS), E = window.LCNDA_EXT.audioEngine, b0 = a.base(), s0 = b0.getChannelData(0).slice(0, 2000).join(); a.addFx('gain', {db: -12}); const out = await a.rendered(); return {same: a.base().getChannelData(0).slice(0, 2000).join() === s0 && a.base() === b0, drop: E.linToDb(E.peakOf(out)) - E.linToDb(E.peakOf(b0))}; }, AS);
            assert.ok(r0.same, 'le son de départ est intact'); assert.ok(Math.abs(r0.drop + 12) < 0.1, `−12 dB : ${r0.drop}`);
            await p.click('dialog.h-as [data-as-fx]:last-child [data-as-fxeye]'); await p.waitForTimeout(400);
            assert.ok(await p.evaluate(async AS => { const a = eval(AS), E = window.LCNDA_EXT.audioEngine; return Math.abs(E.peakOf(await a.rendered()) - E.peakOf(a.base())) < 1e-6; }, AS), 'éteint : le son est comme avant');
            await p.click('dialog.h-as [data-as-fx]:last-child [data-as-fxdel]');
            assert.equal(await p.evaluate(AS => eval(AS).st.rack.filter(x => x.type === 'gain').length, AS), 0);
        });
        await t('Studio : ↶ ↷ et l’historique cliquable ; supprimer la sélection, les zones suivent', async () => {
            const d0 = await p.evaluate(AS => eval(AS).base().duration, AS);
            await p.evaluate(AS => { const a = eval(AS); a.sel({a: 1, b: 2}); a.runCmd('del'); }, AS);
            assert.ok(Math.abs(await p.evaluate(AS => eval(AS).base().duration, AS) - (d0 - 1)) < 0.01);
            await p.keyboard.press('Control+z'); assert.ok(Math.abs(await p.evaluate(AS => eval(AS).base().duration, AS) - d0) < 0.01, '↶');
            await p.keyboard.press('Control+Shift+z'); assert.ok(Math.abs(await p.evaluate(AS => eval(AS).base().duration, AS) - (d0 - 1)) < 0.01, '↷');
            await p.click('dialog.h-as [data-ui-section="as-hist"] summary').catch(() => {});
            await p.click('dialog.h-as [data-as-hgo="0"]'); assert.ok(Math.abs(await p.evaluate(AS => eval(AS).base().duration, AS) - d0) < 0.01, 'clic sur « Ouverture »');
            assert.ok(await p.$('dialog.h-as [data-as-hist] li.is-future'), 'les étapes suivantes sont grisées');
        });
        await closeAll();
        // un Studio tout frais sur le son (les temps valent pour le fichier : zones enregistrées tout de suite)
        await p.evaluate(c => window.LCNDA_EXT.openAudioStudio(c), CAS); await p.waitForSelector('dialog.h-as[open] [data-as-canvas]'); await p.waitForTimeout(300);
        await t('Studio : marqueurs et zones nommées (M, ＋ Nouvelle zone), enregistrés dans la base', async () => {
            await p.evaluate(AS => { const a = eval(AS); a.sel({a: 2, b: 5}); }, AS);
            await p.click('dialog.h-as .h-as-left [data-as-cmd="zone"]'); await p.waitForTimeout(100);
            await p.fill('dialog.h-as [data-as-region] [data-as-rname]', 'Grand-père parle de la guerre'); await p.press('dialog.h-as [data-as-region] [data-as-rname]', 'Enter');
            await p.evaluate(AS => { eval(AS).cursor(7); eval(AS).sel(null); }, AS); await p.click('dialog.h-as [data-as-canvas]', { position: { x: 5, y: 5 } }); await p.keyboard.press('m');
            await p.waitForTimeout(900);
            const r0 = await api('audio_regions', { media_id: CAS.id, filename: 'cassette.wav' });
            assert.equal(r0.regions.length, 2); assert.equal(r0.regions.find(x => x.kind === 'zone').name, 'Grand-père parle de la guerre'); assert.ok(r0.regions.some(x => x.kind === 'marker'));
            assert.ok(await p.$('dialog.h-as .h-as-ztag'), 'la zone est au-dessus de l’onde');
        });
        await t('Studio : relier un passage à une personne (menu de choix, rôle) et à un événement ; bloc « 🎧 On l’entend » sur sa fiche', async () => {
            await p.click('dialog.h-as [data-as-region]:not(:has(.h-as-rtime:text("🚩"))) [data-as-rgo]').catch(() => p.click('dialog.h-as [data-as-region] [data-as-rgo]'));
            await p.evaluate(([AS, pid, ev]) => { const box = document.querySelector('dialog.h-as [data-as-link]'); const z = eval(AS).st.regions.find(r => r.kind === 'zone'); eval(AS).linkPick; box.dispatchEvent(new CustomEvent('picker-change', {bubbles: true, detail: {kind: 'person', value: {people: [{id: pid, role: 'parle', primary: true}]}, items: [{id: pid, title: 'Louis DURAND'}]}})); box.dispatchEvent(new CustomEvent('picker-change', {bubbles: true, detail: {kind: 'event', value: [ev], items: [{id: ev, title: 'Évacuation de Dunkerque'}]}})); return z?.name; }, [AS, ids.pid, ids.ev]);
            await p.waitForTimeout(900);
            const r0 = await api('audio_regions', { media_id: CAS.id, filename: 'cassette.wav' }), z = r0.regions.find(x => x.kind === 'zone');
            assert.deepEqual(z.links.map(l => [l.type, l.title, l.role]), [['person', 'Louis DURAND', 'parle'], ['event', 'Évacuation de Dunkerque', '']]);
            const pr = await api('person_audio_regions', { person_id: ids.pid }); assert.equal(pr.regions.length, 1); assert.equal(pr.regions[0].name, 'Grand-père parle de la guerre');
            assert.ok(await p.$('dialog.h-as [data-as-link] .pk'), 'le menu de choix unique est dans le panneau');
            const ev = await api('picker_search', { kind: 'event', q: 'dunkerque' }); const it = ev.groups[0].items[0];
            assert.equal(it.title, 'Évacuation de Dunkerque'); assert.match(it.meta, /Louis Durand/); assert.equal(it.kind, 'event');
            const ev2 = await api('picker_search', { kind: 'event', q: 'durand' }); assert.equal(ev2.groups[0].items.length, 1, 'on trouve aussi un événement par le nom de la personne');
        });
        await t('Studio : transcription à la main avec l’heure (⌘T), cherchable', async () => {
            await p.evaluate(AS => eval(AS).cursor(2.5), AS); await p.evaluate(AS => eval(AS).runCmd('tstamp'), AS);
            await p.fill('dialog.h-as [data-as-lines] li [data-as-who]', 'Louis'); await p.fill('dialog.h-as [data-as-lines] li [data-as-say]', 'En 40, on était à Dunkerque');
            await p.waitForTimeout(1300);
            const tr = await api('audio_transcript', { media_id: CAS.id, filename: 'cassette.wav' }); assert.deepEqual(tr.lines, [{ t: 2.5, who: 'Louis', text: 'En 40, on était à Dunkerque' }]);
            const se = await api('audio_transcript_search', { q: 'dunkerque' }); assert.equal(se.results.length, 1);
            const ts = await api('transcription_search', { q: 'Dunkerque' }); assert.ok(ts.media.some(x => x.filename === 'cassette.wav'), 'Recherche → Transcriptions trouve aussi le son');
            assert.ok(await p.isDisabled('dialog.h-as [data-as-text] button:has-text("Transcrire tout seul")'), 'la transcription automatique reste pour plus tard');
        });
        await t('Studio : spectre et pinceau de réparation (une réparation dans le rack et l’historique)', async () => {
            await p.evaluate(AS => { const a = eval(AS); a.paintMasks([{t0: 3, t1: 3.2, f0: 2000, f1: 4000}]); a.repairNow(); }, AS);
            const r0 = await p.evaluate(AS => ({rack: eval(AS).st.rack.map(x => x.type), hist: eval(AS).hist().at(-1)}), AS);
            assert.ok(r0.rack.includes('repair')); assert.match(r0.hist, /Pinceau : réparation à 0:03/);
            assert.ok(await p.evaluate(() => { const c = document.querySelector('dialog.h-as [data-as-spec]'); return c.width > 10 && c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data[3] === 255; }), 'le spectre est dessiné');
            await shot('studio.png');
        });
        await t('Studio : export E3 complété (MP3, WAV, FLAC, AIFF, texte et repères ; M4A seulement s’il est possible ; qualité, quoi, canaux, fréquence ; un fichier par zone)', async () => {
            await p.evaluate(AS => eval(AS).runCmd('export'), AS); await p.waitForSelector('dialog.ui-export[open]');
            const fmts = await p.$$eval('dialog.ui-export .ui-export-fmt', bs => bs.map(b => b.dataset.fmt));
            const m4a = await p.evaluate(() => window.LCNDA_EXT.audioEngine.m4aSupported());
            for (const f of ['mp3', 'wav', 'flac', 'aiff', 'text', 'base']) assert.ok(fmts.includes(f), f); assert.equal(fmts.includes('m4a'), m4a);
            for (const f of ['kbps', 'what', 'ch', 'rate']) assert.ok(await p.$(`dialog.ui-export [data-ui-fsel="${f}"]`), f);
            await p.click('dialog.ui-export [data-fmt="wav"]'); await p.selectOption('dialog.ui-export [data-ui-fsel="what"]', 'zones');
            const dls = []; const onDl = d => dls.push(d.suggestedFilename()); p.on('download', onDl);
            await p.click('dialog.ui-export [data-ui-go]'); await p.waitForFunction(() => !document.querySelector('dialog.ui-export[open]'), null, { timeout: 20000 }); await p.waitForTimeout(500);
            assert.deepEqual(dls, ['grand-pere-parle-de-la-guerre.wav']);
            await p.evaluate(AS => eval(AS).runCmd('export'), AS); await p.waitForSelector('dialog.ui-export[open]'); await p.click('dialog.ui-export [data-fmt="text"]'); await p.selectOption('dialog.ui-export [data-ui-fsel="text"]', 'srt');
            await p.click('dialog.ui-export [data-ui-go]'); await p.waitForFunction(() => !document.querySelector('dialog.ui-export[open]'), null, { timeout: 20000 }); await p.waitForTimeout(300);
            p.off('download', onDl); assert.ok(dls.some(n => /\.srt$/.test(n)), dls.join());
        });
        await t('Studio : 🎛️ Multipiste (Voix / Musique / Bruitages, M S ●, la musique baisse sous la voix)', async () => {
            await p.evaluate(AS => eval(AS).setMode('multi'), AS); await p.waitForSelector('dialog.h-as [data-am-lane="musique"]');
            await p.evaluate(async ([AS, id]) => { const a = eval(AS), key = 'm' + id; a.files.push({key, title: 'Le petit vin blanc', src: 'media/musique.wav', media: {id, filename: 'musique.wav'}}); await a.multi().addClip(key, a.multi().model().tracks[1], 0); }, [AS, MUS_ID]);
            await p.check('dialog.h-as [data-am-duck]'); await p.waitForFunction(AS => eval(AS).multi().model().tracks[1].auto.vol.some(q => q.duck), AS, { timeout: 15000 });
            const r0 = await p.evaluate(async AS => { const a = eval(AS), E = window.LCNDA_EXT.audioEngine, mix = await a.multi().mix(); return [E.bandEnergy(mix, 780, 820, {t0: 0.3, t1: 1.2}) - E.bandEnergy(mix, 780, 820, {t0: 3, t1: 4})]; }, AS);
            assert.ok(r0[0] > 8, `la musique baisse de ${r0[0]} dB pendant la voix`);
            await p.click('dialog.h-as [data-am-track="musique"] [data-am-m]'); assert.ok(await p.evaluate(AS => eval(AS).multi().model().tracks[1].mute, AS));
            await shot('multipiste.png');
            await p.evaluate(AS => eval(AS).setMode('wave'), AS);
        });
        await t('Studio : 💾 Enregistrer le projet (rack, zones, multipiste dans le projet) puis enregistrer une version : zones et transcription recopiées', async () => {
            await p.evaluate(AS => eval(AS).saveProj(false), AS); await p.waitForTimeout(800);
            const pl = await api('audio_projects'); assert.equal(pl.projects.length, 1); assert.match(pl.projects[0].summary, /Studio · 3 pistes · 2 zones/);
            const pj = await api('audio_project', { id: pl.projects[0].id }); assert.ok(pj.data.rack.some(x => x.type === 'repair') && pj.data.regions.length === 2 && pj.data.multi.tracks.length === 3);
            await p.evaluate(AS => { const a = eval(AS); a.st.rack = a.st.rack.filter(x => x.type !== 'repair'); }, AS);
            const info = await p.evaluate(AS => eval(AS).saveTo('show'), AS);
            assert.ok(info.filename && info.filename !== 'cassette.wav', JSON.stringify(info));
            const r1 = await api('audio_regions', { media_id: CAS.id, filename: info.filename }); assert.equal(r1.regions.length, 2);
            const v = await api('media_versions', { id: CAS.id }); assert.equal(v.versions.length, 2);
            await closeAll();
        });
        await t('fiche de la personne : « 🎧 On l’entend » (clic = écouter juste ce passage)', async () => {
            await p.evaluate(pid => window.LCNDA_APP.openPersonById(pid), ids.pid); await p.waitForSelector('.h-as-heard', { timeout: 15000 });
            assert.match(await p.textContent('.h-as-heard'), /Grand-père parle de la guerre/);
            assert.equal(await p.locator('.h-as-heard [data-heard-play]').count(), 1, 'la version montrée seulement (les zones ont été recopiées sur la nouvelle version)');
            await p.click('.h-as-heard [data-heard-play]'); await p.waitForTimeout(300);
            assert.equal(await p.textContent('.h-as-heard [data-heard-play]'), '⏸');
            await shot('fiche-on-l-entend.png');
        });
        await t('🛠️ Outils de modification → 🎧 Son : « 🧭 Sauver une vieille cassette », « 🎙️ Enregistrer au micro », « ⚡ Son rapide… »', async () => {
            await p.evaluate(() => { localStorage.setItem('genealogie-edittools-tab', 'audio'); window.LCNDA_APP.state.listType = 'edit_tools'; });
            await p.evaluate(() => window.LCNDA_EXT.openEditTools ? window.LCNDA_EXT.openEditTools('audio') : null);
            const has = await p.evaluate(() => typeof window.LCNDA_EXT.editToolsList === 'function' && window.LCNDA_EXT.editToolsList().find(t => t.key === 'audio').extra);
            assert.match(has, /Sauver une vieille cassette/); assert.match(has, /Enregistrer au micro/); assert.match(has, /Son rapide…/);
        });
        await t('🧭 Sauver une vieille cassette : le pas à pas allume les bons boutons', async () => {
            await p.evaluate(c => window.LCNDA_EXT.openQuickSound(c, {guide: true}), {...CAS}); await p.waitForSelector('dialog.h-aq[open] [data-aq-guide]:not([hidden])');
            for (let i = 0; i < 5; i++) await p.click('dialog.h-aq [data-aq-g="next"]');
            const q = await p.evaluate(() => document.querySelector('dialog.h-aq')._aq.q().on);
            assert.ok(q.hiss && q.hum && q.clicks && q.voice && q.level && q.trim, JSON.stringify(q)); assert.match(await p.textContent('[data-aq-guide]'), /Étape 6 sur 6/);
            await closeAll();
        });
        await t('🎙️ Enregistrer au micro : la prise entre dans les médias et s’ouvre dans le Studio', async () => {
            await p.evaluate(() => window.LCNDA_EXT.recordNewSound()); await p.waitForSelector('dialog.h-as-recdlg[open]');
            await p.click('dialog.h-as-recdlg [data-go]'); await p.waitForTimeout(1500); await p.click('dialog.h-as-recdlg [data-go]');
            await p.waitForSelector('dialog.h-as[open] [data-as-canvas]', { timeout: 20000 });
            assert.match(await p.inputValue('dialog.h-as [data-as-name]'), /Prise micro/);
            await closeAll();
        });
        await t('raccourcis réglables : le Studio et le Son rapide sont dans la liste des éditeurs', async () => {
            const ok = await p.evaluate(() => { const v = JSON.parse(localStorage.getItem('genealogie-editor-cmds') || '{}'); return [Object.keys(v).includes('audio-studio'), (v['audio-studio'] || []).some(r => r[0] === 'data-as-cmd=marker')]; });
            assert.deepEqual(ok, [true, true]);
        });
        await t('petit écran (390 px) et mode sombre : le Studio et le Son rapide s’affichent sans déborder', async () => {
            await p.setViewportSize({ width: 390, height: 844 }); await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
            await p.evaluate(c => window.LCNDA_EXT.openQuickSound(c), CAS); await p.waitForSelector('dialog.h-aq[open]'); await p.waitForTimeout(500);
            assert.ok(await p.evaluate(() => document.querySelector('dialog.h-aq').getBoundingClientRect().right <= 391));
            await shot('rapide-390-sombre.png'); await closeAll();
            await p.evaluate(c => window.LCNDA_EXT.openAudioStudio(c), CAS); await p.waitForSelector('dialog.h-as[open]'); await p.waitForTimeout(800);
            assert.ok(await p.evaluate(() => document.querySelector('dialog.h-as').scrollWidth <= document.querySelector('dialog.h-as').clientWidth + 2), 'pas de défilement de côté');
            await shot('studio-390-sombre.png'); await closeAll();
            await p.setViewportSize({ width: 1440, height: 950 }); await p.evaluate(() => { delete document.documentElement.dataset.theme; });
        });
        await t('aucune erreur dans la page', async () => assert.deepEqual(errors, []));
    } catch (e) { failed++; console.error('✗ préparation', e && e.stack || e); }
    finally {
        try { await browser?.close(); } catch (_) {}
        try { proc?.kill(); } catch (_) {}
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    console.log(failed ? `\n${failed} vérification(s) en échec (${passed} réussies).` : `\n${passed} vérifications réussies.`);
    process.exit(failed ? 1 : 0);
})();
