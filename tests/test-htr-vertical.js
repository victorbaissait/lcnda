'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📐 ✨ Lire l'acte : les mentions écrites à 90° dans la marge (scripts/htr_recognize.py, scripts/htr_job.php, lib/htr_setup.php) :
 *     node tests/test-htr-vertical.js
 * Kraken n'est pas installé ici (et aucun modèle n'est téléchargé) : la segmentation et la lecture sont remplacées par des
 * boîtes simulées et un « lecteur » d'essai qui compare le morceau d'image tourné au texte attendu.
 *  1. repérage (boîtes simulées) : une pile de petits bouts dans la marge (« 2 », « 1 », « 6 », « Buraez »), une ligne de base
 *     verticale, une ligne bien plus haute que large → une zone ; une page de lignes horizontales (même courtes, même une
 *     signature à deux lignes) → aucune zone ;
 *  2. image fabriquée (texte horizontal + une colonne verticale, dans les deux sens) : le morceau est tourné, le bon sens
 *     gardé (le plus sûr), la boîte remise sur la page ; les lignes horizontales ne changent pas ; une lecture tournée moins
 *     sûre que les bouts lus de travers → rien ne bouge ;
 *  3. le résultat de la lecture (htr_job.php simulé, htr_read_job) : le texte principal, « ——— », « Mention en marge : »,
 *     puis la mention ; sans mention, rien n'est ajouté.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-htr-vertical-'));
const dir = path.join(tmp, 'data');
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
const php = (code, e = env) => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: e }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
let failed = 0;
const t = (name, fn) => { try { fn(); console.log(`✓ ${name}`); } catch (e) { failed++; console.log(`✗ ${name}\n  ${String(e.stack || e).split('\n').slice(0, 4).join('\n  ')}`); } };

/* ─── 1 et 2 : le pont Python ─── */
const pyBin = ['python3', 'python'].find(b => spawnSync(b, ['--version']).status === 0);
const font = ['/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Times New Roman.ttf', 'C:/Windows/Fonts/times.ttf'].find(f => fs.existsSync(f)) || '';
const script = String.raw`
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("bridge", sys.argv[1]); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
out = {}
H = lambda x0, y0, x1, y1, t="ligne", c=0.93: {"text": t, "bbox": [x0, y0, x1, y1], "conf": c, "words": []}
page = [H(60, 80, 900, 112), H(60, 150, 880, 182), H(60, 220, 905, 252), H(60, 290, 870, 322), H(60, 360, 300, 392, "Jean")]
frag = [H(1080, 90, 1106, 183, "2", .55), H(1080, 191, 1106, 284, "1", .55), H(1080, 292, 1106, 385, "6", .5), H(1080, 393, 1106, 486, "Buraez", .6)]
out["pile"] = m.vertical_zones(page[:2] + frag + page[2:])
out["base"] = m.vertical_zones(page + [{"text": "x", "bbox": [1000, 100, 1030, 200], "conf": .8, "words": [], "baseline": [[1015, 195], [1015, 105]]}])
out["haute"] = m.vertical_zones(page + [H(20, 100, 50, 600, "mention")])
out["horiz"] = m.vertical_zones(page)
out["signature"] = m.vertical_zones(page + [H(600, 450, 760, 482, "Le maire"), H(600, 500, 740, 532, "Dupont")])
out["vide"] = m.vertical_zones([])
try:
    from PIL import Image, ImageDraw, ImageFont, ImageChops, ImageStat
except Exception:
    Image = None
out["pil"] = Image is not None and bool(sys.argv[2])
if out["pil"]:
    font = ImageFont.truetype(sys.argv[2], 30)
    MARG = "Mariée à Lucien Bernadou"
    def make(angle):
        im = Image.new("L", (1200, 900), 255); d = ImageDraw.Draw(im); lines = []
        for n, t in enumerate(["L’an mil huit cent vingt-six, le deux mai,", "par-devant nous, officier de l’état civil,", "a comparu Jean Mazaud, laboureur,", "lequel nous a présenté un enfant"]):
            d.text((60, 80 + n * 70), t, font=font, fill=0); lines.append(H(*d.textbbox((60, 80 + n * 70), t, font=font), t))
        strip = Image.new("L", (560, 48), 255); ImageDraw.Draw(strip).text((6, 4), MARG, font=font, fill=0)
        strip = strip.crop(strip.point(lambda v: 255 - v).getbbox())
        vert = strip.rotate(angle, expand=True); im.paste(vert, (1080, 90)); vw, vh = vert.size; step = vh // 4
        for k, t in enumerate(["2", "1", "6", "Buraez"]):  # la segmentation de travers : des petits bouts dans la colonne
            lines.insert(1 + k, H(1078, 90 + k * step, 1106, 90 + k * step + step - 8, t, .55))
        return im, lines, strip, [1080, 90, 1080 + vw, 90 + vh]
    def reader(ref, seen):
        def read(crop):  # le « lecteur » d'essai : sûr seulement si le morceau tourné ressemble au texte écrit droit
            g = crop.convert("L"); bb = g.point(lambda v: 255 - v).getbbox()
            if not bb: return []
            g = g.crop(bb); seen.append(list(crop.size))
            if g.size[0] < g.size[1]: return [{"text": "l", "bbox": [0, 0, g.size[0], g.size[1]], "conf": .3, "words": []}]
            c = 1 - ImageStat.Stat(ImageChops.difference(ref, g.resize(ref.size))).mean[0] / 128
            return [{"text": MARG if c > .8 else "uopeuɹǝq", "bbox": list(bb), "conf": round(c, 3), "words": [{"t": w, "c": round(c, 3), "bbox": list(bb)} for w in MARG.split()]}]
        return read
    for name, angle in (("bas_haut", 90), ("haut_bas", -90)):
        im, lines, ref, vbox = make(angle); seen = []
        main, margin = m.split_margin(im, lines, reader(ref, seen))
        out[name] = {"main": [l["text"] for l in main], "margin": margin, "vbox": vbox, "reads": len(seen), "before": [l["text"] for l in lines]}
    im, lines, ref, vbox = make(90)
    main, margin = m.split_margin(im, lines, lambda crop: [{"text": "?", "bbox": [0, 0, 10, 10], "conf": .52, "words": []}])
    out["peu_sur"] = {"main": [l["text"] for l in main], "margin": margin}
    im, lines, ref, vbox = make(90)
    out["sans_zone"] = m.split_margin(im, [l for l in lines if len(l["text"]) > 6], lambda crop: 1 / 0)
print(json.dumps(out, ensure_ascii=False))`;
let py = null;
if (pyBin) {
    const r = spawnSync(pyBin, ['-I', '-c', script, path.join(appRoot, 'scripts/htr_recognize.py'), font], { encoding: 'utf8' });
    py = r.status === 0 ? JSON.parse(r.stdout) : { error: r.stderr };
}
t('Python présent pour le pont de lecture', () => { assert.ok(pyBin, 'python3 introuvable'); assert.ok(!py.error, py.error); });
if (py && !py.error) {
    t('repérage : une pile de petits bouts dans la marge → une seule zone, les lignes horizontales n’y sont pas', () => {
        assert.equal(py.pile.length, 1, JSON.stringify(py.pile));
        assert.deepEqual(py.pile[0].idx, [2, 3, 4, 5], 'les quatre bouts « 2 », « 1 », « 6 », « Buraez »');
        assert.deepEqual(py.pile[0].bbox, [1080, 90, 1106, 486]);
    });
    t('repérage : une ligne de base verticale, une ligne bien plus haute que large → une zone', () => {
        assert.equal(py.base.length, 1); assert.deepEqual(py.base[0].idx, [5]);
        assert.equal(py.haute.length, 1); assert.deepEqual(py.haute[0].bbox, [20, 100, 50, 600]);
    });
    t('repérage : des lignes horizontales (une courte, une signature à deux lignes) → aucune zone', () => {
        assert.deepEqual(py.horiz, []); assert.deepEqual(py.signature, []); assert.deepEqual(py.vide, []);
    });
    t('image fabriquée : PIL et une police pour dessiner l’essai', () => assert.ok(py.pil, 'Pillow ou une police manque : la partie image n’a pas pu être essayée'));
    if (py.pil) {
        t('image fabriquée, mention écrite de bas en haut : tournée de −90°, rangée à part, boîte remise sur la page', () => {
            const r = py.bas_haut;
            assert.deepEqual(r.main, ['L’an mil huit cent vingt-six, le deux mai,', 'par-devant nous, officier de l’état civil,', 'a comparu Jean Mazaud, laboureur,', 'lequel nous a présenté un enfant'], 'plus de « 2 », « 1 », « 6 », « Buraez » dans le texte, l’ordre gardé');
            assert.equal(r.margin.length, 1); assert.equal(r.margin[0].text, 'Mariée à Lucien Bernadou'); assert.equal(r.margin[0].rotated, -90);
            assert.ok(r.margin[0].conf > .9, `lecture sûre (${r.margin[0].conf})`);
            assert.deepEqual(r.margin[0].bbox, r.vbox, 'la boîte de la mention, sur la page d’origine');
            assert.equal(r.reads, 2, 'les deux sens essayés, une seule zone');
        });
        t('image fabriquée, mention écrite de haut en bas : tournée de +90°', () => {
            const r = py.haut_bas;
            assert.equal(r.margin.length, 1); assert.equal(r.margin[0].text, 'Mariée à Lucien Bernadou'); assert.equal(r.margin[0].rotated, 90);
            assert.deepEqual(r.margin[0].bbox, r.vbox); assert.equal(r.main.length, 4);
        });
        t('lecture tournée pas plus sûre que les bouts lus de travers : rien ne bouge ; sans zone, le lecteur n’est jamais appelé', () => {
            assert.equal(py.peu_sur.margin.length, 0); assert.equal(py.peu_sur.main.length, 8, 'les lignes restent toutes, telles quelles');
            assert.equal(py.sans_zone[1].length, 0); assert.equal(py.sans_zone[0].length, 4);
        });
    }
}

/* ─── 3. le résultat de la lecture ─── */
const png = (w, h) => {
    const crc32 = buf => { let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; };
    const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.alloc((w + 1) * h, 230))), chunk('IEND', Buffer.alloc(0))]);
};
const jobsDir = php(`require 'lib/bootstrap.php'; echo htr_jobs_dir();`).trim().split('\n').pop();
const runJob = (id, sim) => {
    const d = path.join(jobsDir, id); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'page.png'), png(600, 400));
    fs.writeFileSync(path.join(d, 'job.json'), JSON.stringify({ image: 'page.png', model_file: 'essai.mlmodel', created: Math.floor(Date.now() / 1000) }));
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), path.join(appRoot, 'scripts/htr_job.php'), d, appRoot], { cwd: appRoot, encoding: 'utf8', env: { ...env, GENEALOGY_HTR_SIMULATE: sim } });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(php(`require 'lib/bootstrap.php'; echo json_encode(htr_read_job('${id}'), JSON_UNESCAPED_UNICODE);`).trim().split('\n').pop());
};
t('lecture avec une mention verticale : texte principal, « ——— », « Mention en marge : », puis la mention', () => {
    const j = runJob('a'.repeat(24), 'vertical');
    assert.equal(j.state, 'done'); assert.equal(j.margin, 1);
    const texts = j.lines.map(l => l.text);
    assert.deepEqual(texts.slice(-3), ['———', 'Mention en marge :', 'Mariée à Lucien Bernadou']);
    assert.equal(texts.length, 7, 'les 4 lignes du texte d’abord, rien de mélangé');
    assert.ok(!texts.slice(0, 4).some(x => /Bernadou|Mention/.test(x)));
    assert.deepEqual(j.lines.slice(-3).map(l => l.kind), ['sep', 'margin-title', 'margin']);
    assert.equal(j.lines[6].rotated, 90); assert.ok(Array.isArray(j.lines[6].bbox), 'la mention garde sa boîte (zone posée dans l’Atelier)');
    assert.equal(j.lines[4].bbox, null, 'la ligne de séparation n’a pas de zone');
    assert.match(j.text, /son épouse\n———\nMention en marge :\nMariée à Lucien Bernadou$/);
    assert.ok(j.text.indexOf('L’an mil') < j.text.indexOf('Mention en marge'));
});
t('lecture sans mention : rien d’ajouté (les lignes horizontales ne changent pas)', () => {
    const j = runJob('b'.repeat(24), '1');
    assert.equal(j.state, 'done'); assert.equal(j.margin, 0); assert.equal(j.lines.length, 4);
    assert.ok(!j.lines.some(l => l.kind)); assert.ok(!/Mention en marge/.test(j.text));
});
t('le titre suit la langue de l’app (anglais)', () => {
    const out = php(`$_SERVER['HTTP_X_LCNDA_LANG'] = 'en'; require 'lib/bootstrap.php'; echo json_encode(htr_with_margin([['text' => 'a']], [['text' => 'b']]), JSON_UNESCAPED_UNICODE);`).trim().split('\n').pop();
    const j = JSON.parse(out); assert.equal(j.lines.length, 4); assert.equal(j.lines[2].text, 'Margin note:'); assert.equal(j.text, 'a\n———\nMargin note:\nb');
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `✗ ${failed} échec(s)` : '✓ tout est bon');
process.exit(failed ? 1 : 0);
