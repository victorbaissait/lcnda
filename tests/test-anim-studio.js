'use strict';
/**
 * 🎞 Studio d'animation, sans navigateur : le temps du film (scènes, années, ralenti), la caméra, les données des modèles
 * (course des noms, pyramide, courbe, éventail, légendes faites seules) et les fichiers fabriqués (WebM, MP4, GIF relu, .zip relu
 * par Python, sous-titres .srt). Le serveur (projets, ↶ Annuler, données) : tests/test-anim-studio-ui.js.
 */
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

global.window = global; // les deux fichiers se rangent dans window.LCNDA_EXT
const R = require('../assets/js/heritage-anim-render.js');
const E = require('../assets/js/heritage-anim-export.js');
let failed = 0;
const t = (name, fn) => { try { fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e.stack || e.message); } };

/* une petite famille fictive : MAZAUD (Aurillac → Paris), LACOMBE, DURAND */
const D = R.indexPeople({
    people: [
        {id: 1, f: 'Pierre', l: 'MAZAUD', g: 'm', by: 1750, dy: 1810, bp: 10, dp: 10, fa: null, mo: null},
        {id: 2, f: 'Marie', l: 'LACOMBE', g: 'f', by: 1755, dy: 1820, bp: 11, dp: 10, fa: null, mo: null},
        {id: 3, f: 'Jean', l: 'MAZAUD', g: 'm', by: 1780, dy: 1850, bp: 10, dp: 12, fa: 1, mo: 2},
        {id: 4, f: 'Anne', l: 'DURAND', g: 'f', by: 1785, dy: 1860, bp: 12, dp: 12, fa: null, mo: null},
        {id: 5, f: 'Jean', l: 'MAZAUD', g: 'm', by: 1810, dy: 1880, bp: 12, dp: 12, fa: 3, mo: 4},
        {id: 6, f: 'Louise', l: 'MAZAUD', g: 'f', by: 1812, dy: null, bp: 12, dp: null, fa: 3, mo: 4},
    ],
    places: {10: ['Aurillac', 44.93, 2.44], 11: ['Mauriac', 45.22, 2.33], 12: ['Paris', 48.86, 2.35]},
    events: [[1, 1750, 'birth', 10], [2, 1755, 'birth', 11], [1, 1778, 'marriage', 10], [2, 1778, 'marriage', 10], [3, 1780, 'birth', 10], [3, 1805, 'residence', 12], [4, 1785, 'birth', 12], [3, 1808, 'marriage', 12], [5, 1810, 'birth', 12], [6, 1812, 'birth', 12], [1, 1810, 'death', 10]],
    root: 5,
});

t('le temps du film : chaque scène à sa place, l’avancement de 0 à 1', () => {
    const P = {scenes: [{dur: 4}, {dur: 10}, {dur: 6}]};
    assert.equal(R.totalDur(P), 20);
    assert.deepEqual([R.scenesAt(P, 0).i, R.scenesAt(P, 4).i, R.scenesAt(P, 13.9).i, R.scenesAt(P, 20).i, R.scenesAt(P, 99).i], [0, 1, 1, 2, 2]);
    assert.equal(R.scenesAt(P, 9).p, .5);
    assert.equal(R.scenesAt({scenes: []}, 1), null);
});
t('les formats : tailles paires, le petit côté = la qualité', () => {
    assert.deepEqual(R.sizeOf('16:9', 1080), [1920, 1080]); assert.deepEqual(R.sizeOf('9:16', 720), [720, 1280]); assert.deepEqual(R.sizeOf('1:1', 2160), [2160, 2160]);
    for (const f of Object.keys(R.FORMATS)) for (const q of [540, 720, 1080]) R.sizeOf(f, q).forEach(n => assert.equal(n % 2, 0));
});
t('les années d’une scène : régulières, ou ralenties là où il se passe beaucoup (toujours croissantes, de début à fin)', () => {
    const s = {from: 1700, to: 1900};
    assert.equal(R.yearAt(s, 0), 1700); assert.equal(R.yearAt(s, 1), 1900); assert.equal(R.yearAt(s, .5), 1800);
    const ys = [...Array(80).fill(1800), 1710, 1890], w = R.makeWarp(1700, 1900, ys, .8);
    assert.equal(w.length, 101); assert.ok(Math.abs(w[0] - 1700) < 1e-9 && Math.abs(w[100] - 1900) < 1e-6);
    for (let i = 1; i < w.length; i++) assert.ok(w[i] >= w[i - 1] - 1e-9, 'croissante');
    const around = w.filter(y => y >= 1795 && y <= 1805).length; assert.ok(around > 5, `plus de temps autour de 1800 (${around})`);
    assert.ok(Number.isNaN(R.yearAt({}, .5)), 'une scène sans années');
});
t('la caméra : points ◆ (glisse entre deux), suivre, avancer doucement ; le cadre ne sort jamais de l’image', () => {
    const cam = {mode: 'keys', keys: [{t: 0, x: .5, y: .5, z: 1}, {t: 1, x: .2, y: .8, z: 3}]};
    assert.deepEqual(R.camAt(cam, 0), {x: .5, y: .5, z: 1}); assert.deepEqual(R.camAt(cam, 1), {x: .2, y: .8, z: 3});
    const mid = R.camAt(cam, .5); assert.ok(mid.z > 1 && mid.z < 3 && mid.x < .5);
    assert.deepEqual(R.camAt({mode: 'fit'}, .3), {x: .5, y: .5, z: 1});
    const kb = R.camAt({mode: 'kenburns', z0: 1, z1: 1.5}, 1); assert.equal(kb.z, 1.5);
    const fol = R.camAt({mode: 'follow'}, .5, [{x: 0, y: 0, z: 1}, {x: 1, y: 1, z: 3}]); assert.deepEqual(fol, {x: .5, y: .5, z: 2});
    const [x, y, w, h] = R.camRect({x: 0, y: 1, z: 4}, 1000, 500); assert.ok(x >= 0 && y >= 0 && x + w <= 1000 && y + h <= 500 && Math.abs(w - 250) < 1e-9);
});
t('🏁 la course des noms : les valeurs chaque année, plafond, nombre de barres', () => {
    const r = R.raceData(D, {what: 'surname', mode: 'cumulative', top: 5});
    assert.equal(r.from, 1750); assert.ok(r.keys.includes('MAZAUD') && r.keys.includes('LACOMBE'));
    assert.equal(r.table.get(1812).get('MAZAUD'), 4); assert.equal(r.table.get(1760).get('MAZAUD'), 1);
    assert.equal(r.max, 4); assert.equal(r.top, 5);
    const pr = R.raceData(D, {what: 'first', mode: 'cumulative'}); assert.equal(pr.table.get(1812).get('Jean'), 2);
    assert.equal(R.raceData({people: []}, {}), null);
});
t('👥 la pyramide : les vivants de l’année par tranche d’âge, hommes et femmes', () => {
    const p = R.pyramidData(D, {step: 10});
    const y1800 = p.table.get(1800); // Pierre 50 ans, Marie 45, Jean 20, Anne 15
    assert.equal(y1800.m[5], 1); assert.equal(y1800.m[2], 1); assert.equal(y1800.f[4], 1); assert.equal(y1800.f[1], 1);
    assert.ok(p.max >= 1);
});
t('📈 la courbe : naissances par décennie, cumulées, âge moyen au décès', () => {
    const l = R.lineData(D, {what: 'births', per: 'decade'}); assert.equal(l.from, 1750); assert.deepEqual(l.pts.find(x => x[0] === 1810), [1810, 2]);
    const c = R.lineData(D, {what: 'births', per: 'decade', cumulative: true}); assert.equal(c.pts[c.pts.length - 1][1], 6);
    const a = R.lineData(D, {what: 'agedeath', per: 'decade'}); assert.equal(a.pts.find(x => x[0] === 1810)[1], 60);
    const m = R.lineData(D, {what: 'marriages', per: 'decade'}); assert.ok(m && m.pts.some(x => x[1] > 0), 'mariages');
});
t('🌳 l’éventail : les ancêtres avec leur numéro Sosa', () => {
    const f = R.fanData(D, 5, 4);
    assert.deepEqual(f.items.map(x => [x.sosa, x.p.id]).sort((a, b) => a[0] - b[0]), [[1, 5], [2, 3], [3, 4], [4, 1], [5, 2]]);
});
t('💬 les légendes faites seules : départs, mariages ; étalées, dans l’ordre', () => {
    const c = R.autoCaptions(D, {from: 1700, to: 1900, kinds: ['depart', 'mariage', 'naissance'], max: 10});
    assert.ok(c.some(x => /Jean MAZAUD part de Aurillac pour Paris/.test(x.text) && x.year === 1805), JSON.stringify(c));
    assert.ok(c.some(x => /Marie LACOMBE part de Mauriac pour Aurillac/.test(x.text)), 'un départ au moment du mariage');
    assert.ok(R.autoCaptions(D, {from: 1700, to: 1900, kinds: ['mariage'], max: 10}).some(x => /^1778 · mariage de/.test(x.text)), 'les mariages seuls');
    for (let i = 1; i < c.length; i++) assert.ok(c[i].year >= c[i - 1].year);
    assert.equal(R.autoCaptions(D, {from: 1700, to: 1900, kinds: [], max: 10}).length, 0);
});

/* ── les fichiers ── */
t('WebM : en-tête EBML, piste vidéo VP9, son Opus, grappes', () => {
    const w = E.webm({w: 320, h: 180, codec: 'V_VP9', frames: [{data: new Uint8Array([1, 2, 3]), ts: 0, key: true}, {data: new Uint8Array([4]), ts: 33333, key: false}, {data: new Uint8Array([5]), ts: 2100000, key: true}],
        audio: {packets: [{data: new Uint8Array([9]), ts: 0}], head: new Uint8Array(19), sr: 48000, ch: 2}, durationMs: 2200});
    assert.deepEqual([...w.slice(0, 4)], [0x1A, 0x45, 0xDF, 0xA3]);
    const s = Buffer.from(w).toString('latin1'); assert.ok(s.includes('webm') && s.includes('V_VP9') && s.includes('A_OPUS'));
    assert.equal(Buffer.from(w).indexOf(Buffer.from([0x1F, 0x43, 0xB6, 0x75])) > 0, true, 'une grappe');
    assert.equal((s.match(/\x1F\x43\xB6\x75/g) || []).length, 2, 'une grappe par image clé');
});
t('MP4 : ftyp, mdat, moov ; une image clé, les tailles et les adresses des images justes', () => {
    const frames = [{data: Uint8Array.from([0, 0, 0, 2, 9, 9]), key: true}, {data: Uint8Array.from([0, 0, 0, 1, 7]), key: false}];
    const m = E.mp4({w: 320, h: 180, fps: 30, frames, avcC: Uint8Array.from([1, 66, 0, 30, 255, 225, 0, 0, 1, 0, 0]), audio: {frames: [Uint8Array.from([1, 2])], asc: Uint8Array.from([0x11, 0x90]), sr: 48000, ch: 2}});
    const top = []; let o = 0; const dv = new DataView(m.buffer);
    while (o < m.length) { const size = dv.getUint32(o); top.push(Buffer.from(m.slice(o + 4, o + 8)).toString()); o += size; }
    assert.deepEqual(top, ['ftyp', 'mdat', 'moov']); assert.equal(o, m.length);
    const s = Buffer.from(m), stco = s.indexOf('stco'), off = s.readUInt32BE(stco + 12);
    assert.deepEqual([...m.slice(off, off + 6)], [0, 0, 0, 2, 9, 9], 'la première image est à son adresse');
    assert.ok(s.indexOf('avcC') > 0 && s.indexOf('esds') > 0 && s.indexOf('stss') > 0);
});
/* un petit lecteur de GIF (LZW) pour relire ce qu'on écrit */
function readGif(b) {
    let o = 6; const w = b[o] | (b[o + 1] << 8), h = b[o + 2] | (b[o + 3] << 8), flags = b[o + 4]; o += 7; const gct = 3 * (2 ** ((flags & 7) + 1)), pal = b.slice(o, o + gct); o += gct; const frames = [];
    while (o < b.length) {
        const c = b[o++];
        if (c === 0x3B) break;
        if (c === 0x21) { o++; while (b[o]) o += b[o] + 1; o++; continue; }
        if (c === 0x2C) { o += 9; const min = b[o++]; let data = []; while (b[o]) { data.push(...b.slice(o + 1, o + 1 + b[o])); o += b[o] + 1; } o++;
            let size = min + 1, dict = [], cur = 0, bits = 0, prev = null; const out = [], clear = 1 << min, eoi = clear + 1, reset = () => { dict = []; for (let i = 0; i < clear; i++) dict[i] = [i]; dict[clear] = []; dict[eoi] = null; size = min + 1; prev = null; };
            reset(); let p = 0;
            while (true) { while (bits < size && p < data.length) { cur |= data[p++] << bits; bits += 8; } if (bits < size) break; const code = cur & ((1 << size) - 1); cur >>>= size; bits -= size;
                if (code === clear) { reset(); continue; } if (code === eoi) break;
                let e = dict[code]; if (!e) e = [...prev, prev[0]]; out.push(...e); if (prev) dict.push([...prev, e[0]]); prev = e; if (dict.length === (1 << size) && size < 12) size++; }
            frames.push(out.slice(0, w * h).map(i => [pal[i * 3], pal[i * 3 + 1], pal[i * 3 + 2]])); }
    }
    return {w, h, frames};
}
t('GIF : relu par un petit lecteur, les couleurs et les images reviennent (LZW juste, même long)', () => {
    const W = 40, H = 30, mk = f => { const d = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < W * H; i++) { const x = i % W, y = Math.floor(i / W); d[i * 4] = (x * 6 + f * 40) % 256; d[i * 4 + 1] = y * 8; d[i * 4 + 2] = 128; d[i * 4 + 3] = 255; } return d; };
    const frames = [mk(0), mk(1), mk(2)], g = E.gif({w: W, h: H, frames, delay: 10});
    assert.equal(Buffer.from(g.slice(0, 6)).toString(), 'GIF89a');
    const r = readGif(g); assert.equal(r.frames.length, 3); assert.equal(r.frames[0].length, W * H);
    let err = 0; r.frames[1].forEach(([a, b], i) => { err += Math.abs(a - frames[1][i * 4]) + Math.abs(b - frames[1][i * 4 + 1]); });
    assert.ok(err / (W * H) < 40, `écart moyen ${err / (W * H)}`);
});
t('.zip : relu par Python (images intactes, CRC justes)', () => {
    const z = E.zip([{name: 'image-0001.png', data: Uint8Array.from([1, 2, 3, 4])}, {name: 'image-0002.png', data: new Uint8Array(1000).fill(7)}]);
    const f = path.join(os.tmpdir(), `lcnda-anim-${process.pid}.zip`); fs.writeFileSync(f, z);
    const r = spawnSync('python3', ['-c', 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip(), [len(z.read(n)) for n in z.namelist()])', f], {encoding: 'utf8'});
    fs.unlinkSync(f);
    if (r.error) { console.log('  (python3 absent : vérification sautée)'); return; }
    assert.equal(r.stdout.trim(), 'None [4, 1000]', r.stderr);
});
t('sous-titres .srt : numéros, heures, dans l’ordre', () => {
    const s = E.srt([{start: 62.5, end: 65, text: 'B'}, {start: 1, end: 3.25, text: 'A'}, {start: 5, end: 6, text: ''}]);
    assert.equal(s, '1\n00:00:01,000 --> 00:00:03,250\nA\n\n2\n00:01:02,500 --> 00:01:05,000\nB\n');
});
console.log(failed ? `${failed} essai(s) en échec` : 'Le Studio d’animation (calculs et fichiers) marche.');
process.exit(failed ? 1 : 0);
