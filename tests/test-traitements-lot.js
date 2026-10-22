'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * ⚙️ Traitements par lot (Listes → 🛠️ Outils de modification), moteur, API et navigateur :   node tests/test-traitements-lot.js
 *  1. moteur (Node) : renommer (séquence, texte, titre, personne, lieu, chercher/remplacer, majuscules, sans accents, espaces),
 *     tailles (redimensionner, rogner, pivoter), noms uniques et sûrs, recette forgée bornée, aperçu (plan) mélangé,
 *     métadonnées (Exif avec GPS repéré puis effacé sans perte, textes d'un PNG) ;
 *  2. API (lib/lots.php) : sans jeton CSRF refusé ; fichier déguisé (.jpg qui n'en est pas un), extension interdite, nom avec
 *     chemin ; nouvelle version (l'original gardé dans media_versions) puis ↶ Annuler ; copie reliée aux mêmes fiches puis ↶ ;
 *     titre + étiquette + personne puis ↶ ; fiche verrouillée refusée ; mode consultation refusé ;
 *  3. navigateur (Playwright ; sinon sauté) : onglet « ⚙️ Traitements par lot » ; fichiers de la base par la fenêtre unique
 *     des images et de l'ordinateur (E4) ; chaque action avec un vrai fichier (renommer en séquence, redimensionner, rogner +
 *     pivoter, noir et blanc, filigrane, format PNG / WebP, qualité et poids max, métadonnées, assembler en PDF, document
 *     .docx → .odt, .md → .docx, .html → .docx, classeur .xlsx → .csv, son .wav → .flac) ; une chaîne de 3 actions sur des
 *     médias de la base en nouvelle version, puis ↶ Annuler (H7) ; copie ; ZIP ; étiquettes et personne ; ⠿ Alt + ↓,
 *     interrupteur, ⧉, × ; recettes (ensemble prêt appliqué, recette enregistrée qui apparaît dans la liste) ; 390 px, sombre,
 *     aucune erreur dans la console.
 *  Captures (si LOT_SHOTS=dossier).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const B = require('../assets/js/app-lot-engine.js');
const S = require('../assets/js/app-tableur-engine.js');
const T = require('../assets/js/app-texte-formats.js');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-lot-'));
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const SHOTS = process.env.LOT_SHOTS || '';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const toAB = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const sql = q => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); echo json_encode($p->query(${JSON.stringify(q).replace(/\$/g, '\\$')})->fetchAll(PDO::FETCH_ASSOC));`], { cwd: appRoot, encoding: 'utf8', env }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return JSON.parse(r.stdout); };

/** un segment APP1 « Exif » : orientation 1 et une position GPS (GPSLatitudeRef = N) */
function exifApp1() {
    const t = Buffer.alloc(56); t.write('II', 0); t.writeUInt16LE(42, 2); t.writeUInt32LE(8, 4);
    t.writeUInt16LE(2, 8);
    t.writeUInt16LE(0x0112, 10); t.writeUInt16LE(3, 12); t.writeUInt32LE(1, 14); t.writeUInt16LE(1, 18);
    t.writeUInt16LE(0x8825, 22); t.writeUInt16LE(4, 24); t.writeUInt32LE(1, 26); t.writeUInt32LE(38, 30);
    t.writeUInt32LE(0, 34);
    t.writeUInt16LE(1, 38); t.writeUInt16LE(1, 40); t.writeUInt16LE(2, 42); t.writeUInt32LE(2, 44); t.write('N\0', 48); t.writeUInt32LE(0, 52);
    const body = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), t]);
    const head = Buffer.from([0xff, 0xe1, 0, 0]); head.writeUInt16BE(body.length + 2, 2);
    return Buffer.concat([head, body]);
}
const withExif = jpg => Buffer.concat([jpg.subarray(0, 2), exifApp1(), jpg.subarray(2)]);
/** un son WAV de 0,5 s (8 kHz, mono, 16 bits) */
function wav() {
    const sr = 8000, len = 4000, b = Buffer.alloc(44 + len * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + len * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(len * 2, 40);
    for (let i = 0; i < len; i++) b.writeInt16LE(Math.round(Math.sin(i / sr * 2 * Math.PI * 440) * 12000), 44 + i * 2);
    return b;
}

(async () => {
    /* ═════ 1. Le moteur, dans Node ═════ */
    const it = { name: 'IMG_0042.JPG', title: 'Mariage de Jean', year: 1925, person: 'Jean MARTIN', place: 'Tulle', w: 4000, h: 3000 };
    eq(B.renameBase(it, 0, { pattern: '{texte}-{n}', text: 'photo' }), 'photo-001', 'séquence 001');
    eq(B.renameBase(it, 4, { pattern: '{texte}-{n}', text: 'photo', start: 10, step: 5, digits: 4 }), 'photo-0030', 'départ, pas, chiffres');
    eq(B.renameBase(it, 0, { pattern: '{annee} {titre} ({lieu}) {personne}' }), '1925 Mariage de Jean (Tulle) Jean MARTIN', 'année, titre, lieu, personne');
    eq(B.renameBase(it, 0, { pattern: '{nom}', find: 'img_', repl: 'Famille ' }), 'Famille 0042', 'chercher / remplacer (sans tenir compte des majuscules)');
    eq(B.renameBase({ name: 'Été à Brive.jpg' }, 0, { pattern: '{nom}', cas: 'upper', noAccents: true, spaces: 'dash' }), 'ETE-A-BRIVE', 'majuscules, sans accents, tirets');
    eq(B.renameBase({ name: 'x.jpg' }, 0, { pattern: '{nom}', cas: 'title' }), 'X', 'une majuscule par mot');
    eq(B.renameBase({ name: 'x.jpg' }, 0, { pattern: '{texte}-{n}', text: '' }), '001', 'morceau vide : pas de « -001 »');
    ok(/^\d{4}-\d{2}-\d{2}$/.test(B.renameBase({ name: 'x.jpg' }, 0, { pattern: '{date}' })), 'date du jour');
    eq(B.safeName('../../etc/passwd'), 'etc passwd', 'nom sans chemin'); eq(B.safeName('a<b>:c|d?.'), 'a b c d', 'caractères interdits retirés'); eq(B.safeName('CON'), '_CON', 'nom réservé de Windows');
    eq(B.uniqueNames(['a.jpg', 'A.jpg', 'a.jpg']), ['a.jpg', 'A (2).jpg', 'a (3).jpg'], 'noms uniques dans un ZIP');
    eq(B.fitSize(4000, 3000, { by: 'long', long: 1600 }), { w: 1600, h: 1200 }, 'plus grand côté');
    eq(B.fitSize(800, 600, { by: 'long', long: 1600, noUp: true }), { w: 800, h: 600 }, 'ne pas agrandir');
    eq(B.fitSize(800, 600, { by: 'long', long: 1600, noUp: false }), { w: 1600, h: 1200 }, 'agrandir si permis');
    eq(B.fitSize(4000, 3000, { by: 'width', w: 1000 }), { w: 1000, h: 750 }, 'largeur, proportions gardées');
    eq(B.fitSize(4000, 3000, { by: 'box', w: 500, h: 500, keep: false }), { w: 500, h: 500 }, 'cadre sans proportions');
    eq(B.fitSize(4000, 3000, { by: 'pct', pct: 25 }), { w: 1000, h: 750 }, 'pourcentage');
    eq(B.cropBox(4000, 3000, { ratio: '1:1', rotate: 90 }), { x: 500, y: 0, w: 3000, h: 3000, outW: 3000, outH: 3000 }, 'carré centré');
    eq(B.cropBox(4000, 3000, { margin: 10, rotate: 90 }).outW, 2400, 'bords coupés puis ¼ de tour');
    const forged = B.cleanRecipe({ out: 'evil', cards: [{ type: 'resize', p: { long: 1e9, by: 'x' } }, { type: '__proto__' }, { type: 'watermark', p: { color: 'red;background:url(x)', text: 'a'.repeat(999) } }, { type: 'tags', p: { labels: ['1', '-3', 'x', 2, 2], person: '7' } }] });
    eq([forged.out, forged.cards.length, forged.cards[0].p.long, forged.cards[0].p.by, forged.cards[1].p.color, forged.cards[1].p.text.length, forged.cards[2].p.labels, forged.cards[2].p.person], ['zip', 3, 16000, 'long', '#ffffff', 120, [1, 2], 7], 'recette forgée : bornée et nettoyée');
    const pl = B.plan([{ ...it, base: true }, { name: 'lettre.docx' }, { name: 'acte.pdf', base: true, title: 'acte' }, { name: 'compte.xlsx' }, { name: 'petite.png', w: 300, h: 200 }],
        { out: 'version', cards: [{ type: 'rename', p: { pattern: '{texte}-{n}', text: 'lot' } }, { type: 'resize', p: { long: 1600 } }, { type: 'format', p: { image: 'webp', doc: 'odt', sheet: 'csv' } }] }, { avif: false });
    eq(pl.rows.map(r => [r.after.name, r.mode]), [['lot-001.webp', 'version'], ['lot-002.odt', 'new'], ['lot-003.pdf', 'meta'], ['lot-004.csv', 'new'], ['lot-005.webp', 'new']], 'aperçu : noms, formats et sorties');
    eq([pl.rows[0].after.w, pl.rows[0].after.h, pl.rows[4].after.w], [1600, 1200, 300], 'aperçu : tailles après (petite image pas agrandie)');
    ok(pl.rows[2].notes.some(x => /lecture seule/.test(x)) && pl.rows[3].notes.some(x => /1re feuille/.test(x)), 'aperçu : PDF en lecture seule, CSV = 1re feuille');
    eq(B.plan([{ name: 'a.jpg', w: 10, h: 10 }], { out: 'zip', cards: [{ type: 'format', p: { image: 'avif' } }] }, { avif: false }).rows[0].after.ext, 'webp', 'AVIF impossible : WebP à la place');
    const plPdf = B.plan([{ name: 'a.jpg', w: 10, h: 10 }, { name: 'b.png', w: 10, h: 10 }], { out: 'zip', cards: [{ type: 'pdf', p: { name: 'Mes scans' } }] });
    eq([plPdf.pdf.name, plPdf.pdf.pages, plPdf.rows.map(r => r.mode)], ['Mes scans.pdf', 2, ['pdf', 'pdf']], 'aperçu : assembler en PDF');
    eq(B.plan([{ name: 'a.jpg', w: 10, h: 10 }], { out: 'zip', cards: [{ type: 'resize', p: { long: 1600 } }] }).rows[0].encode, false, 'une retouche qui ne change rien ne réécrit pas l’image');
    // métadonnées
    const fakeJpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]), Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'binary'), Buffer.from([0xff, 0xfe, 0, 7]), Buffer.from('hello'), Buffer.from([0xff, 0xda, 0, 4, 1, 2, 3, 4, 5, 0xff, 0xd9])]);
    const withE = withExif(fakeJpg), info = B.exifInfo(withE);
    eq([info.exif, info.gps, info.orientation], [true, true, 1], 'Exif lu : GPS repéré');
    const stripped = Buffer.from(B.stripJpeg(withE));
    ok(!B.exifInfo(stripped).exif && !stripped.includes(Buffer.from('hello')) && stripped.includes(Buffer.from('JFIF')) && stripped.subarray(-11).equals(fakeJpg.subarray(-11)), 'JPEG : Exif, GPS et commentaire effacés, JFIF et l’image gardés tels quels');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DwnwEIGBkZGRgYAAAhAAP/0yVeKQAAAABJRU5ErkJggg==', 'base64');
    const txt = Buffer.concat([Buffer.from([0, 0, 0, 10]), Buffer.from('tEXtAuthor\0Moi', 'binary'), Buffer.from([0, 0, 0, 0])]); // longueur, type, données, CRC (pas vérifié)
    const pngT = Buffer.concat([png.subarray(0, 33), txt, png.subarray(33)]);
    ok(B.hasMeta(pngT) && !B.hasMeta(Buffer.from(B.stripPng(pngT))) && Buffer.from(B.stripPng(pngT)).equals(png), 'PNG : textes effacés, le reste identique');
    console.log(`✓ moteur : ${n} vérifications`);

    /* ═════ 2 et 3. Serveur, API, navigateur ═════ */
    {
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Martin','male'),('Paul','Verrou','male')"); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("UPDATE persons SET is_locked=1 WHERE id=2");
$pdo->exec("INSERT INTO labels(name,color) VALUES('Mariage','#cc0000')");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
        if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
    }
    const port = Number(process.env.LOT_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'post_max_size=256M', '-d', 'upload_max_filesize=128M', '-d', 'memory_limit=1024M', '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let pw = null; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    let browser = null;
    try {
        if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); return; }
        browser = await pw.chromium.launch();
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
        await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-edittools-tab', 'lot'); } catch (_) {} });
        const page = await ctx.newPage(); const errors = [];
        page.on('pageerror', e => errors.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console ' + m.text()); });
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.setModule && window.LCNDA_EXT?.openBatch && window.LCNDA_BATCH && window.LCNDA_APP.state.csrf, null, { timeout: 60000 });
        /** une image faite par le navigateur (dégradé coloré, w × h) en JPEG ou PNG */
        const makeImage = (w, h, type = 'image/jpeg') => page.evaluate(async ({ w, h, type }) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#c0392b'); g.addColorStop(1, '#2980b9'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = '#f1c40f'; x.fillRect(w / 4, h / 4, w / 2, h / 2); const b = await new Promise(r => c.toBlob(r, type, .9)); return [...new Uint8Array(await b.arrayBuffer())]; }, { w, h, type }).then(a => Buffer.from(a));
        /** envoi multipart (comme la page) ; csrf: false = sans jeton */
        const upload = (action, fields, file, csrf = true) => page.evaluate(async ({ action, fields, file, csrf }) => { const fd = new FormData(); if (csrf) fd.append('csrf', window.LCNDA_APP.state.csrf); Object.entries(fields).forEach(([k, v]) => fd.append(k, String(v))); if (file) fd.append('file', new Blob([new Uint8Array(file.data)]), file.name); const r = await fetch('api.php?action=' + action, { method: 'POST', body: fd }); return { status: r.status, j: await r.json().catch(() => ({})) }; }, { action, fields, file: file ? { name: file.name, data: [...file.data] } : null, csrf });
        const post = (action, body) => page.evaluate(async ({ action, body }) => { try { return { ok: true, r: await window.LCNDA_APP.api(action, {}, { method: 'POST', body }) }; } catch (e) { return { ok: false, e: e.message, status: e.status }; } }, { action, body });
        const mediaFile = id => sql(`SELECT filename, title FROM media WHERE id=${Number(id)}`)[0];
        const exists = f => fs.existsSync(path.join(dir, 'media', f));

        /* — des médias de la base : deux photos (une avec position GPS), reliées à Jean — */
        const jpg1 = withExif(await makeImage(1200, 800)), jpg2 = await makeImage(900, 600);
        const seed = async (buf, name, title) => { const r = await page.evaluate(async ({ data, name, title }) => { const fd = new FormData(); fd.append('csrf', window.LCNDA_APP.state.csrf); fd.append('kind', 'image'); fd.append('title', title); fd.append('file', new Blob([new Uint8Array(data)], { type: 'image/jpeg' }), name); const r = await fetch('api.php?action=retouch_media', { method: 'POST', body: fd }); return r.json(); }, { data: [...buf], name, title }); return r.result.media_id; };
        const m1 = await seed(jpg1, 'p1.jpg', 'Mariage 1925'), m2 = await seed(jpg2, 'p2.jpg', 'Communion');
        sql(`INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(${m1}, 'person', 1, 1), (${m2}, 'person', 1, 2)`);
        ok(m1 > 0 && m2 > 0, 'deux photos dans la base');

        /* ═════ 2. API ═════ */
        let res = await upload('lot_begin', {}, null, false); eq(res.status, 419, 'sans jeton CSRF : refusé');
        const tk = (await post('lot_begin', { count: 3 })).r.result.token; ok(/^[a-f0-9]{32}$/.test(tk), 'lot commencé (jeton)');
        res = await upload('lot_item', { token: tk, mode: 'new', name: 'faux.jpg' }, { name: 'faux.jpg', data: Buffer.from('<?php echo 1; ?>') }); ok(res.status === 422 && /ne correspond pas/.test(res.j.error), 'fichier déguisé (.jpg qui n’en est pas un) : refusé');
        res = await upload('lot_item', { token: tk, mode: 'new', name: 'x.php' }, { name: 'x.php', data: Buffer.from('<?php') }); ok(res.status === 422 && /ne se range pas/.test(res.j.error), 'extension interdite : refusée');
        res = await upload('lot_item', { token: tk, mode: 'new', name: 'x.svg' }, { name: 'x.svg', data: Buffer.from('<svg onload="alert(1)"/>') }); ok(res.status === 422, 'SVG : refusé');
        res = await upload('lot_item', { token: 'zz', mode: 'new', name: 'a.jpg' }, { name: 'a.jpg', data: jpg2 }); ok(res.status === 422, 'jeton forgé : refusé');
        res = await upload('lot_item', { token: tk, mode: 'version', media_id: m1, name: '../../evil.jpg', title: 'Mariage (lot)', label_ids: '1,999', person_id: '' }, { name: '../../evil.jpg', data: jpg2 });
        ok(res.status === 200 && /^[a-f0-9]{32}\.jpg$/.test(res.j.result.filename), 'nouvelle version : nom tiré au hasard, sans chemin');
        const v = sql(`SELECT label, is_original, filename FROM media_versions WHERE media_id=${m1} ORDER BY id`);
        ok(v.length === 2 && v[0].is_original === 1 && /^Lot 1 — /.test(v[1].label) && v[1].filename === res.j.result.filename, 'l’original reste dans les versions (« Lot 1 — … »)');
        eq([mediaFile(m1).title, sql(`SELECT count(*) n FROM label_links WHERE entity_type='media' AND entity_id=${m1}`)[0].n], ['Mariage (lot)', 1], 'titre changé, étiquette posée (l’inconnue ignorée)');
        res = await upload('lot_item', { token: tk, mode: 'copy', media_id: m2, name: 'copie.png', title: '' }, { name: 'copie.png', data: await makeImage(30, 20, 'image/png') });
        const cp = res.j.result.media_id; ok(cp > m2 && sql(`SELECT count(*) n FROM media_links WHERE media_id=${cp} AND entity_id=1`)[0].n === 1 && /Communion \(copie\)/.test(mediaFile(cp).title), 'copie : nouveau média relié aux mêmes fiches');
        res = await upload('lot_item', { token: tk, mode: 'meta', media_id: m2, title: 'Communion 1932', person_id: 2 }); ok(res.status === 422 && /verrouillée/.test(res.j.error), 'fiche verrouillée : on n’y relie rien');
        res = await upload('lot_item', { token: tk, mode: 'meta', media_id: m2, title: 'Communion 1932', label_ids: '1' }); ok(res.status === 200, 'titre et étiquette seuls (sans fichier)');
        const newFile = mediaFile(m1).filename;
        const und = await post('lot_undo', { token: tk }); ok(und.ok && und.r.result.undone >= 5, '↶ Annuler le lot');
        eq([mediaFile(m1).title, mediaFile(m2).title, sql(`SELECT count(*) n FROM media_versions WHERE media_id=${m1}`)[0].n, sql(`SELECT count(*) n FROM media WHERE id=${cp}`)[0].n, sql("SELECT count(*) n FROM label_links WHERE entity_type='media'")[0].n],
            ['Mariage 1925', 'Communion', 0, 0, 0], '↶ : titres, versions, copie et étiquettes comme avant');
        ok(mediaFile(m1).filename !== newFile && !exists(newFile) && exists(mediaFile(m1).filename), '↶ : la photo d’origine est de nouveau affichée, le fichier du lot est parti');
        ok(!(await post('lot_undo', { token: tk })).ok, 'un lot ne s’annule qu’une fois');
        // mode consultation : rien ne s'écrit
        ok((await post('kiosk_enter', { password: '1234' })).ok, 'mode consultation : entrer');
        const kio = await post('lot_begin', { count: 1 }); ok(!kio.ok && kio.status === 423, 'mode consultation : traitement par lot refusé');
        ok((await post('kiosk_exit', { password: '1234' })).ok, 'mode consultation : sortir');

        /* ═════ 3. Navigateur ═════ */
        await page.evaluate(() => { window.LCNDA_APP.state.listType = 'edit_tools'; window.LCNDA_APP.setModule('listes'); });
        await page.waitForSelector('[data-et-tab="lot"].is-active'); await page.waitForTimeout(300);
        ok(/Aucun projet de traitement par lot/.test(await page.textContent('.h-et-page')), 'onglet : la grande boîte « rien ici » avec le bouton pour commencer');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'a-onglet.png') });
        await page.click('.h-et-bar [data-et-new]'); await page.waitForSelector('dialog.h-lot[open]');
        const L = () => 'dialog.h-lot[open]';
        const ready = () => page.waitForFunction(() => { const d = document.querySelector('dialog.h-lot[open]'); return d && d._lot.files.length && d._lot.files.every(f => f.ready); }, null, { timeout: 30000 }).then(() => page.waitForTimeout(250));
        const setRecipe = r => page.evaluate(r => { const d = document.querySelector('dialog.h-lot[open]'); const R = window.LCNDA_BATCH.cleanRecipe(r); d._lot.recipe.cards = R.cards; d._lot.recipe.out = R.out; d.querySelector('[data-lot-add]'); }, r);
        // fichiers de la base par la fenêtre unique des images
        await page.click(`${L()} [data-lot-media]`); await page.waitForSelector('dialog.mpk-dialog[open] .mpk-tile');
        await page.click('dialog.mpk-dialog[open] .mpk-tile[data-i="0"]'); await page.click('dialog.mpk-dialog[open] .mpk-tile[data-i="1"]');
        await page.click('dialog.mpk-dialog[open] [data-mp="ok"]');
        await ready();
        eq(await page.evaluate(() => document.querySelector('dialog.h-lot[open]')._lot.files.map(f => [f.base, f.kind, f.w, f.h, f.person]).sort((a, b) => a[2] - b[2])), [[true, 'image', 900, 600, 'Jean MARTIN'], [true, 'image', 1200, 800, 'Jean MARTIN']], 'médias de la base choisis (taille et personne reliée lues)');
        ok(/position GPS/.test(await page.textContent(`${L()} [data-lot-plan]`)), 'aperçu : la position GPS de la photo est signalée');

        /* — une chaîne de 3 actions, en nouvelle version, puis ↶ Annuler — */
        // l'interface : retirer la carte de départ, ajouter Renommer, Redimensionner, Changer de format par le menu
        await page.evaluate(() => { const d = document.querySelector('dialog.h-lot[open]'); d._lot.recipe.cards.length = 0; });
        for (const lab of ['Renommer', 'Redimensionner', 'Changer de format']) { await page.click(`${L()} [data-lot-add]`); await page.click(`.ui-actmenu button:has-text("${lab}")`); }
        const rn = `${L()} .h-lot-card[data-type="rename"]`;
        await page.fill(`${rn} [data-k=pattern]`, ''); await page.click(`${rn} [data-token="{texte}"]`); await page.type(`${rn} [data-k=pattern]`, '-'); await page.click(`${rn} [data-token="{n}"]`);
        await page.fill(`${rn} [data-k=text]`, 'Famille Martin'); await page.selectOption(`${rn} [data-k=spaces]`, 'dash');
        await page.fill(`${L()} .h-lot-card[data-type="resize"] [data-k=long]`, '600');
        await page.selectOption(`${L()} .h-lot-card[data-type="format"] [data-k=image]`, 'png');
        await page.check(`${L()} [name=h-lot-out][value=version]`); await page.waitForTimeout(300);
        const planTxt = await page.textContent(`${L()} [data-lot-plan]`);
        ok(/Famille-Martin-001\.png/.test(planTxt) && /Famille-Martin-002\.png/.test(planTxt) && /1200 × 800\s*→\s*600 × 400/.test(planTxt) && /JPG\s*→\s*PNG/.test(planTxt), 'aperçu « Voilà ce qui va se passer » : nom, taille et format avant → après');
        eq(await page.textContent(`${L()} [data-lot-run]`), '▶ Lancer sur 2 fichiers', 'bouton « ▶ Lancer sur 2 fichiers »');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'b-chaine.png') });
        // ⠿ Alt + ↓ range la 1re carte ; l'interrupteur éteint une étape ; ⧉ ; ×
        await page.focus(`${rn} .h-lot-grip`); await page.keyboard.press('Alt+ArrowDown');
        eq(await page.evaluate(() => document.querySelector('dialog.h-lot[open]')._lot.recipe.cards.map(c => c.type)), ['resize', 'rename', 'format'], '⠿ Alt + ↓ : la carte descend');
        await page.keyboard.press('Alt+ArrowUp');
        await page.click(`${L()} .h-lot-card[data-type="format"] .h-lot-on`); await page.waitForTimeout(250);
        ok(/JPG\s*$|· JPG ·/.test(await page.textContent(`${L()} .h-lot-plan li:first-child`)) && !/→ PNG/.test(await page.textContent(`${L()} [data-lot-plan]`)), 'interrupteur : l’étape éteinte ne compte plus');
        await page.click(`${L()} .h-lot-card[data-type="format"] .h-lot-on`);
        await page.click(`${L()} .h-lot-card[data-type="resize"] [data-dup]`); eq(await page.locator(`${L()} .h-lot-card[data-type="resize"]`).count(), 2, '⧉ duplique une carte');
        await page.click(`${L()} .h-lot-card[data-type="resize"]:nth-child(2) [data-del]`); eq(await page.locator(`${L()} .h-lot-card[data-type="resize"]`).count(), 1, '× retire une carte (avec « ↶ Annuler »)');
        await page.waitForTimeout(250);
        const before = [mediaFile(m1), mediaFile(m2)];
        await page.click(`${L()} [data-lot-run]`); await page.waitForFunction(() => document.querySelector('dialog.h-lot[open]')?.dataset.lotDone, null, { timeout: 60000 });
        eq([await page.getAttribute(L(), 'data-lot-done'), await page.getAttribute(L(), 'data-lot-bad')], ['2', '0'], 'chaîne de 3 actions : 2 fichiers traités, aucune erreur');
        const after = [mediaFile(m1), mediaFile(m2)], vs = sql(`SELECT media_id, is_original FROM media_versions WHERE media_id IN (${m1},${m2})`);
        ok(after.every(a => /\.png$/.test(a.filename)) && after.map(a => a.title).sort().join('|') === 'Famille-Martin-001|Famille-Martin-002' && vs.filter(x => x.is_original).length === 2 && vs.length === 4, 'nouvelle version (PNG) affichée, titre changé, l’original gardé dans les versions');
        const out1 = fs.readFileSync(path.join(dir, 'media', mediaFile(m1).filename)), sz = T.imageSize(new Uint8Array(out1));
        eq([sz.w, sz.h], [600, 400], 'la version fait bien 600 × 400');
        const lotToast = page.locator('.toast', { hasText: 'traités' }).locator('button', { hasText: 'Annuler' });
        ok(await lotToast.count() === 1, 'message H7 « ⚙️ 2 fichiers traités » avec « ↶ Annuler »');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'c-lance.png') });
        await lotToast.click(); await page.waitForFunction(() => /Annulé.{0,8}Traitement par lot/.test(document.body.textContent), null, { timeout: 15000 });
        eq([mediaFile(m1), mediaFile(m2)], before, '↶ Annuler : les médias comme avant');
        eq(sql(`SELECT count(*) n FROM media_versions WHERE media_id IN (${m1},${m2})`)[0].n, 0, '↶ Annuler : les versions du lot retirées');

        /* — copie dans les médias, avec étiquette et personne — */
        await page.waitForFunction(() => document.querySelector('dialog.h-lot[open]')._lot.files.every(f => f.ready));
        await setRecipe({ out: 'copy', cards: [{ type: 'gray' }, { type: 'tags', p: { labels: [1] } }] });
        await page.evaluate(() => { const d = document.querySelector('dialog.h-lot[open]'); d.querySelectorAll('[name=h-lot-out]').forEach(r => { r.checked = r.value === 'copy'; }); });
        await page.evaluate(() => document.querySelector('dialog.h-lot[open]')._lot.run());
        await page.waitForFunction(() => document.querySelector('dialog.h-lot[open]')?.dataset.lotDone === '2' && !document.querySelector('dialog.h-lot.is-running'), null, { timeout: 60000 });
        const copies = sql(`SELECT id, filename, title FROM media WHERE id > ${m2} ORDER BY id`);
        ok(copies.length === 2 && copies.every(c => sql(`SELECT count(*) n FROM label_links WHERE entity_type='media' AND entity_id=${c.id} AND label_id=1`)[0].n === 1) && copies.every(c => sql(`SELECT count(*) n FROM media_links WHERE media_id=${c.id} AND entity_id=1`)[0].n === 1), 'copie : 2 nouveaux médias, étiquetés, reliés à Jean');
        const grayPx = await page.evaluate(async f => { const b = await (await fetch('media/' + f)).blob(); const bm = await createImageBitmap(b); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const x = c.getContext('2d'); x.drawImage(bm, 0, 0); const d = x.getImageData(bm.width / 2, bm.height / 2, 1, 1).data; const e = x.getImageData(2, 2, 1, 1).data; return [Math.abs(d[0] - d[1]) + Math.abs(d[1] - d[2]), Math.abs(e[0] - e[2])]; }, copies[0].filename);
        ok(grayPx[0] <= 6 && grayPx[1] <= 6, `noir et blanc : rouge = vert = bleu (${grayPx})`);

        /* — ZIP : chaque action avec de vrais fichiers de l'ordinateur — */
        const pc = path.join(dir, 'pc'); fs.mkdirSync(pc);
        const doc = T.newDoc({ title: 'Lettre' }); doc.sections = [{ page: null, blocks: [T.para([T.run('Chère cousine')], { st: 'h1' }), T.para([T.run('Bonjour '), T.run('la famille', { b: 1 })])] }];
        fs.writeFileSync(path.join(pc, 'lettre.docx'), Buffer.from(await (await T.toDocx(doc)).arrayBuffer()));
        fs.writeFileSync(path.join(pc, 'notes.md'), '# Notes\n\nUn **mot** important.\n');
        fs.writeFileSync(path.join(pc, 'page.html'), '<html><body><h1>Page</h1><p>Texte<script>alert(1)</script><img src=x onerror="alert(2)"></p></body></html>');
        const wb = S.normalize({ sheets: [{ name: 'Liste', cells: { A1: { v: 'Nom' }, B1: { v: 'Âge' }, A2: { v: 'Jean' }, B2: { v: 62 }, A3: { v: "'=cmd" }, B3: { v: '=B2+1' } } }] });
        fs.writeFileSync(path.join(pc, 'liste.xlsx'), Buffer.from(await (await S.toXlsx(wb)).arrayBuffer()));
        fs.writeFileSync(path.join(pc, 'voix.wav'), wav());
        fs.writeFileSync(path.join(pc, 'scan-a.jpg'), withExif(await makeImage(800, 1100))); fs.writeFileSync(path.join(pc, 'scan-b.png'), await makeImage(1000, 700, 'image/png'));
        fs.writeFileSync(path.join(pc, 'acte.pdf'), Buffer.from('%PDF-1.4\n%%EOF\n'));
        const runZip = async (recipe, files) => {
            await page.evaluate(() => { const d = document.querySelector('dialog.h-lot[open]'); d._lot.files.splice(0); });
            await page.setInputFiles(`${L()} .ui-drop input[type=file]`, files.map(f => path.join(pc, f))); await ready();
            await setRecipe({ ...recipe, out: 'zip' });
            await page.evaluate(() => { const d = document.querySelector('dialog.h-lot[open]'); delete d.dataset.lotDone; });
            const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.evaluate(() => document.querySelector('dialog.h-lot[open]')._lot.run())]);
            await page.waitForFunction(() => document.querySelector('dialog.h-lot[open]')?.dataset.lotDone && !document.querySelector('dialog.h-lot.is-running'), null, { timeout: 60000 });
            const buf = fs.readFileSync(await dl.path()), z = await S.unzip(toAB(buf));
            const out = {}; for (const nm of z.names) out[nm] = Buffer.from(await z.read(nm));
            return { names: z.names.slice().sort(), out, bad: await page.getAttribute(L(), 'data-lot-bad') };
        };
        let z = await runZip({ cards: [{ type: 'rename', p: { pattern: '{texte} {n}', text: 'scan', spaces: 'under' } }, { type: 'crop', p: { ratio: '1:1', rotate: 90 } }, { type: 'resize', p: { by: 'long', long: 300 } }, { type: 'watermark', p: { text: '© Martin', pos: 'br', size: 10 } }, { type: 'format', p: { image: 'webp' } }] }, ['scan-a.jpg', 'scan-b.png']);
        eq(z.names, ['scan_001.webp', 'scan_002.webp'], 'ZIP : renommer en séquence (soulignés)');
        ok(Object.values(z.out).every(b => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP'), 'format WebP');
        const dims = await page.evaluate(async arr => Promise.all(arr.map(async a => { const bm = await createImageBitmap(new Blob([new Uint8Array(a)])); return [bm.width, bm.height]; })), Object.values(z.out).map(b => [...b]));
        eq(dims, [[300, 300], [300, 300]], 'rogner au carré + ¼ de tour + redimensionner à 300 px');
        z = await runZip({ cards: [{ type: 'quality', p: { q: 95, maxKb: 20 } }, { type: 'format', p: { image: 'jpg' } }] }, ['scan-b.png']);
        ok(z.out['scan-b.jpg'] && z.out['scan-b.jpg'].length <= 20 * 1024 && z.out['scan-b.jpg'][0] === 0xff, `qualité et poids : JPG de ${z.out['scan-b.jpg']?.length} octets (20 Ko au plus)`);
        z = await runZip({ cards: [{ type: 'strip' }] }, ['scan-a.jpg']);
        const orig = fs.readFileSync(path.join(pc, 'scan-a.jpg'));
        ok(B.exifInfo(orig).gps && !B.exifInfo(z.out['scan-a.jpg']).exif && z.out['scan-a.jpg'].length === orig.length - exifApp1().length, 'métadonnées : GPS effacé sans perte (seul le segment Exif est parti)');
        z = await runZip({ cards: [{ type: 'pdf', p: { name: 'Mes scans', page: 'a4', margin: 10 } }] }, ['scan-a.jpg', 'scan-b.png']);
        const pdf = z.out['Mes scans.pdf']?.toString('latin1') || '';
        ok(pdf.startsWith('%PDF-') && /\/Count 2/.test(pdf) && (pdf.match(/\/Type \/Page /g) || []).length === 2, 'assembler en un PDF : 2 pages');
        z = await runZip({ cards: [{ type: 'format', p: { doc: 'odt', sheet: 'csv', audio: 'flac' } }] }, ['lettre.docx', 'liste.xlsx', 'voix.wav', 'acte.pdf']);
        eq(z.names, ['acte.pdf', 'lettre.odt', 'liste.csv', 'voix.flac'], 'documents, classeurs et sons : nouveaux formats (le PDF reste tel quel)');
        const odt = await T.fromOdt(toAB(z.out['lettre.odt'])); ok(/Chère cousine/.test(T.plainOf(odt.doc.sections[0].blocks[0].runs)) && odt.doc.sections[0].blocks[0].st === 'h1', '.docx → .odt : titre gardé');
        const csv = z.out['liste.csv'].toString('utf8'); ok(/Nom;Âge/.test(csv) && /Jean;62/.test(csv) && /'=cmd/.test(csv) && /;63/.test(csv), '.xlsx → .csv : valeurs calculées, formule glissée désamorcée');
        eq(z.out['voix.flac'].subarray(0, 4).toString(), 'fLaC', '.wav → .flac');
        z = await runZip({ cards: [{ type: 'format', p: { doc: 'docx' } }] }, ['notes.md', 'page.html']);
        const md = await T.fromDocx(toAB(z.out['notes.docx'])), hd = await T.fromDocx(toAB(z.out['page.docx']));
        ok(/Notes/.test(T.plainOf(md.doc.sections[0].blocks[0].runs)) && md.doc.sections[0].blocks.some(b => (b.runs || []).some(r => r.b && /mot/.test(r.x))), '.md → .docx : titre et gras');
        const hdText = JSON.stringify(hd.doc.sections); ok(/Page/.test(hdText) && !/alert|onerror|script/i.test(hdText), '.html → .docx : le texte, sans script ni onerror');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'd-zip.png') });

        /* — recettes : ensemble prêt, recette enregistrée qui apparaît dans la liste — */
        await page.click(`${L()} [data-ui-presets] [data-ps-toggle]`);
        await page.click(`${L()} [data-ui-presets] li[data-i="0"] [data-ps-apply]`); await page.waitForTimeout(200);
        eq(await page.evaluate(() => document.querySelector('dialog.h-lot[open]')._lot.recipe.cards.map(c => c.type)), ['resize', 'format', 'quality', 'strip'], 'ensemble prêt « Photos pour le web » appliqué');
        await page.click(`${L()} [data-ui-presets] [data-ps-new]`); await page.fill(`${L()} [data-ui-presets] [data-ps-name]`, 'Pour le blog'); await page.click(`${L()} [data-ui-presets] [data-ps-ok]`);
        ok(await page.evaluate(() => window.LCNDA_EXT.batchInternals.userRecipes().some(x => x.name === 'Pour le blog')), 'recette enregistrée');

        /* — 390 px, sombre — */
        await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
        const over = await page.evaluate(() => { const d = document.querySelector('dialog.h-lot[open]'); return Math.max(d.scrollWidth - d.clientWidth, document.documentElement.scrollWidth - 390, d.getBoundingClientRect().right - 390); });
        ok(over <= 1, `390 px : pas de défilement de côté (${over})`);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'e-390.png') });
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await page.waitForTimeout(200);
        const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.h-lot-card')).backgroundColor); ok(!/255, 255, 255/.test(bg), `sombre : les cartes sont sombres (${bg})`);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'f-sombre.png') });
        await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
        await page.keyboard.press('Escape'); await page.waitForTimeout(300);
        ok(!(await page.locator('dialog.h-lot[open]').count()), 'Échap ferme la fenêtre');
        await page.waitForSelector('.h-et-page'); await page.waitForTimeout(400);
        ok(/Pour le blog/.test(await page.textContent('.h-et-page')), 'la recette apparaît dans 🛠️ Outils de modification → ⚙️ Traitements par lot');
        eq(errors, [], 'aucune erreur dans la console');
    } finally {
        if (browser) await browser.close();
        proc.kill();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    }
    console.log(`✓ ${n} vérifications des traitements par lot (moteur, API et navigateur)`);
})().catch(e => { console.error(e); process.exit(1); });
