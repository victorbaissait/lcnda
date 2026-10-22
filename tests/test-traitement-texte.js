'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📝 Traitement de texte (Listes → Outils de modification), moteur, API et navigateur :   node tests/test-traitement-texte.js
 *  1. moteur (Node) : .docx et .odt écrits puis relus par notre propre lecteur (titres, gras, listes, tableau fusionné,
 *     note, image, en-tête, section en paysage, colonnes, commentaire, modification suivie) ; ZIP et XML valides (lecture
 *     stricte : python3 si présent, sinon le lecteur du moteur) ; RTF, Markdown, texte ; fichiers piégés refusés
 *     (XML avec DOCTYPE ou ENTITY, bombe zip, trop gros, vieux .doc, PDF) ;
 *  2. API : enregistrer, relire, liste (résumé), renommer, dupliquer, supprimer (rend le document) puis remettre ; versions ;
 *     HTML forgé désamorcé côté serveur ; sans jeton CSRF : refusé ; menu de choix (documents, classeurs) ; personnes citées ;
 *  3. navigateur (Playwright ; sinon sauté) : liste vide → « ＋ Nouveau document » ; saisie ; style Titre 1 ; gras ; liste
 *     à 2 niveaux (Tab, Entrée sur une ligne vide) ; tableau ; image (rangée dans les médias) ; note de bas de page (en bas de
 *     sa page) ; sommaire ; suivi des modifications (ajout, suppression, tout accepter) ; commentaire ; rechercher et
 *     remplacer ; ↶ ↷ ; enregistrer, fermer, rouvrir ; aller-retour .docx et .odt depuis l'écran ; collage piégé nettoyé
 *     (scripts, onerror, javascript:, Word) ; fichier piégé refusé dans la fenêtre d'import ; impression page par page ;
 *     390 px et sombre ; aucune erreur dans la console.
 *  Captures (si TEXTE_SHOTS=dossier).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const S = require('../assets/js/app-tableur-engine.js');
const T = require('../assets/js/app-texte-formats.js');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-texte-'));
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const SHOTS = process.env.TEXTE_SHOTS || '';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DwnwEIGBkZGRgYAAAhAAP/0yVeKQAAAABJRU5ErkJggg==', 'base64');
const toAB = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const hasPy = spawnSync('python3', ['-c', 'import zipfile,xml.dom.minidom'], { encoding: 'utf8' }).status === 0;
/** ZIP et XML valides : lecture stricte par python3 (zipfile + minidom) si présent, sinon par notre propre lecteur */
async function validZip(buf, label) {
    if (hasPy) {
        const f = path.join(dir, `v-${Date.now()}.zip`); fs.writeFileSync(f, buf);
        const r = spawnSync('python3', ['-I', '-c', 'import zipfile,sys,xml.dom.minidom as M\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nfor n in z.namelist():\n  (n.endswith(".xml") or n.endswith(".rels")) and M.parseString(z.read(n))\nprint(len(z.namelist()))', f], { encoding: 'utf8' });
        ok(r.status === 0, `${label} : ZIP et XML valides (python) ${r.stderr}`); return;
    }
    const z = await S.unzip(toAB(buf)); for (const nm of z.names) if (/\.(xml|rels)$/.test(nm)) S.parseXml(await z.text(nm)); ok(true, `${label} : ZIP et XML lisibles`);
}
const blob2buf = async b => Buffer.from(await b.arrayBuffer());

(async () => {
    /* ═════ 1. Le moteur, dans Node ═════ */
    const src = `data:image/png;base64,${PNG.toString('base64')}`;
    const d = T.newDoc({ title: 'Essai' });
    d.comments = [{ id: 'c1', text: 'À vérifier', author: 'Victor', at: '2026-10-22T10:00:00Z' }];
    d.header = { blocks: [T.para([T.run('Famille Martin — page '), { field: 'page', fieldText: '1' }, T.run(' / '), { field: 'pages', fieldText: '2' }], { al: 'right' })] };
    d.footer = { blocks: [T.para([T.run('Pied de page')])] };
    d.sections = [{ page: null, blocks: [
        T.para([T.run('Le récit')], { st: 'h1' }),
        T.para([T.run('Il était '), T.run('une fois', { b: 1, cm: ['c1'] }), T.run(' un '), T.run('ancêtre', { i: 1, col: '#c00000' }), { note: { id: 'n1', k: 'foot', text: 'Acte de naissance, AD19.' } }, T.run(' né en 1850.', { tc: { k: 'ins', id: 't1', a: 'Victor', t: '2026-10-22T10:00:00Z' } }), T.run(' effacé', { tc: { k: 'del', id: 't2', a: 'Victor' } })], { al: 'justify' }),
        { t: 'p', st: 'normal', list: { k: 'ul', l: 0 }, runs: [T.run('un')] }, { t: 'p', st: 'normal', list: { k: 'ul', l: 1 }, runs: [T.run('deux')] }, { t: 'p', st: 'normal', list: { k: 'ol', l: 0 }, runs: [T.run('trois')] },
        { t: 'table', head: 1, rows: [[{ blocks: [T.para([T.run('Nom')])] }, { blocks: [T.para([T.run('Âge')])] }], [{ rs: 2, blocks: [T.para([T.run('MARTIN')])] }, { blocks: [T.para([T.run('62')])] }], [{ blocks: [T.para([T.run('63')])] }]] },
        { t: 'img', src, w: 120, cap: 'Une image', wrap: 'square', al: 'right' }, { t: 'pb' },
        T.para([T.run('Lien', { href: 'https://example.org' }), T.run(' et '), T.run('Jean MARTIN', { link: { k: 'person', id: 3 } })]),
        { t: 'cols', n: 2, blocks: [T.para([T.run('en colonnes '.repeat(30))])] },
    ] }, { page: { orient: 'landscape' }, blocks: [T.para([T.run('Paysage')], { st: 'quote' })] }];
    const check = (r, f) => {
        const b0 = r.doc.sections[0].blocks, all = r.doc.sections.flatMap(s => s.blocks), p1 = b0.find(b => b.t === 'p' && /Il était/.test(T.plainOf(b.runs)));
        eq(b0[0].st, 'h1', `${f} : titre 1`);
        ok(p1.runs.some(x => x.b && x.x === 'une fois') && p1.runs.some(x => x.i && x.col === '#c00000'), `${f} : gras, italique, couleur`);
        ok(p1.runs.some(x => x.note?.text === 'Acte de naissance, AD19.'), `${f} : note de bas de page`);
        ok(p1.runs.some(x => x.tc?.k === 'ins') && p1.runs.some(x => x.tc?.k === 'del' && /effacé/.test(x.x)), `${f} : modifications suivies`);
        ok(p1.runs.some(x => (x.cm || []).length) && r.doc.comments.some(c => c.text === 'À vérifier'), `${f} : commentaire`);
        eq(all.filter(b => b.list).map(b => `${b.list.k}${b.list.l}`), ['ul0', 'ul1', 'ol0'], `${f} : listes à 2 niveaux`);
        const t = all.find(b => b.t === 'table'); ok(t && t.head === 1 && t.rows[1][0].rs === 2, `${f} : tableau, en-tête répété, fusion`);
        const im = all.find(b => b.t === 'img'); ok(im && /^data:image\/png/.test(im.src) && im.cap === 'Une image' && im.wrap === 'square', `${f} : image habillée, légende`);
        ok(all.some(b => b.t === 'pb'), `${f} : saut de page`);
        ok(all.some(b => b.t === 'cols' && b.n === 2), `${f} : colonnes`);
        ok(all.some(b => (b.runs || []).some(x => x.link?.k === 'person' && x.link.id === 3)) && all.some(b => (b.runs || []).some(x => x.href === 'https://example.org' || x.href === 'https://example.org/')), `${f} : liens (personne de la base, adresse)`);
        eq(r.doc.sections.length, 2, `${f} : 2 sections`); eq(r.doc.sections[1].page.orient, 'landscape', `${f} : section en paysage`);
        ok(r.doc.header.blocks.some(b => b.runs.some(x => x.field === 'page')) && r.doc.footer.blocks.length, `${f} : en-tête (numéro de page) et pied`);
    };
    for (const f of ['docx', 'odt']) {
        const files = await (f === 'docx' ? T.toDocx(d, { files: true }) : T.toOdt(d, { files: true }));
        const buf = await blob2buf(await S.makeZip(files));
        await validZip(buf, f);
        check(await (f === 'docx' ? T.fromDocx : T.fromOdt)(toAB(buf)), f);
    }
    { const md = T.toMarkdown(d), r = T.fromMarkdown(md); ok(/^# Le récit/m.test(md) && r.doc.sections[0].blocks[0].st === 'h1' && r.doc.sections[0].blocks.some(b => b.t === 'table'), 'Markdown : aller-retour (titres, tableau)'); }
    { const r = T.fromRtf(T.toRtf(d)); const b = r.doc.sections[0].blocks; ok(b[0].st === 'h1' && b.some(x => (x.runs || []).some(y => y.note)) && b.some(x => x.t === 'table'), 'RTF : aller-retour (titre, note, tableau)'); }
    { const t = T.toText(d); ok(/Le récit/.test(t) && !/effacé/.test(t) && /\[1\] Acte/.test(t), 'texte : sans les suppressions, notes à la fin'); }
    // fichiers piégés
    const rejects = async (fn, rx, m) => { try { await fn(); ok(false, m); } catch (e) { ok(rx.test(e.message), `${m} (${e.message})`); } };
    const docxWith = async xml => blob2buf(await S.makeZip([{ name: '[Content_Types].xml', data: '<Types/>' }, { name: 'word/document.xml', data: xml }]));
    await rejects(async () => T.fromDocx(toAB(await docxWith('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><w:document><w:body/></w:document>'))), /refusé/, 'docx avec DOCTYPE/ENTITY refusé');
    await rejects(async () => T.fromDocx(toAB(await blob2buf(await S.makeZip([{ name: 'word/document.xml', data: '<w:document><w:body>' + '<w:p/>'.repeat(10) + '</w:body></w:document>' }, { name: 'word/styles.xml', data: '<a>' + ' '.repeat(30 * 1024 * 1024) + '</a>' }])))), /bombe|trop gros/, 'bombe zip refusée');
    await rejects(async () => T.readFile('gros.txt', new ArrayBuffer(61 * 1024 * 1024)), /trop gros/, 'fichier trop gros refusé');
    await rejects(async () => T.readFile('vieux.doc', toAB(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]))), /\.doc/, 'ancien .doc : message clair');
    await rejects(async () => T.readFile('scan.pdf', toAB(Buffer.from('%PDF-1.4 ...'))), /PDF/, 'PDF : message clair');
    await rejects(async () => T.fromOdt(toAB(await blob2buf(await S.makeZip([{ name: 'mimetype', data: 'application/vnd.oasis.opendocument.spreadsheet', store: true }, { name: 'content.xml', data: '<a/>' }])))), /classeur/, 'ODS (classeur) refusé comme texte');
    console.log(`✓ moteur : ${n} vérifications`);

    /* ═════ 2 et 3. Serveur, API, navigateur ═════ */
    {
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Martin','male'),('Pierre','Martin','male'),('Marie','Dupuy','female')"); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO places(name) VALUES('Tulle')"); $pl = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES('person',1,?,?,?,?)")->execute([$t, '3 mars 1850', 1850, $pl]);
$pdo->exec("INSERT INTO families(partner1_id,partner2_id) VALUES(2,3)"); $f = (int) $pdo->lastInsertId(); $pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES($f,1)");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
        if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
    }
    const port = Number(process.env.TEXTE_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'post_max_size=256M', '-d', 'upload_max_filesize=64M', '-d', 'memory_limit=1024M', '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let pw = null; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    let browser = null;
    try {
        if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); return; }
        browser = await pw.chromium.launch();
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
        await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-edittools-tab', 'textdoc'); } catch (_) {} });
        const page = await ctx.newPage(); const errors = [];
        page.on('pageerror', e => errors.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console ' + m.text()); });
        page.on('dialog', dl => { errors.push('alert ' + dl.message()); dl.dismiss(); }); // un script collé qui s'exécuterait
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.setModule && window.LCNDA_EXT?.openTextDoc && window.LCNDA_TEXT?.toDocx && window.LCNDA_APP.state.csrf, null, { timeout: 30000 });
        const api = (action, body, get = false) => page.evaluate(async ({ action, body, get }) => { try { const r = get ? await window.LCNDA_APP.api(action, body || {}) : await window.LCNDA_APP.api(action, {}, { method: 'POST', body }); return { ok: true, r }; } catch (e) { return { ok: false, e: e.message }; } }, { action, body, get });

        /* 2. API */
        const data = { sections: [{ html: '<h1 data-st="h1">Titre</h1><p data-st="normal">Bonjour la famille.</p>' }], page: { w: 210, h: 297, m: { t: 25, r: 25, b: 25, l: 25 } }, header: { html: '' }, footer: { html: '' }, styles: [], comments: [] };
        const saved = await api('save_textdoc', { name: 'Essai API', data }); ok(saved.ok, 'enregistrer ' + (saved.e || '')); const id = saved.r.result.id;
        const back = await api('textdoc', { id }, true); eq([back.r.name, back.r.data.sections[0].html], ['Essai API', data.sections[0].html], 'relire');
        const list = await api('textdocs', {}, true); eq([list.r.items[0].info.words, list.r.items[0].info.heads], [4, ['Titre']], 'résumé pour la vignette (mots, titres)');
        ok((await api('rename_textdoc', { id, name: 'Renommé' })).ok, 'renommer'); eq((await api('textdoc', { id }, true)).r.name, 'Renommé');
        const dup = await api('duplicate_textdoc', { id }); ok(dup.ok && dup.r.result.id !== id, 'dupliquer');
        const v = await api('save_textdoc_version', { doc_id: id, label: 'Première', data }); ok(v.ok, 'version enregistrée');
        eq((await api('textdoc_versions', { doc_id: id }, true)).r.items.map(x => x.label), ['Première'], 'liste des versions');
        const del = await api('delete_textdoc', { id: dup.r.result.id }); ok(del.ok && del.r.result.doc.name, 'supprimer rend le document (pour ↶)');
        const rest = await api('restore_textdoc', { doc: del.r.result.doc }); ok(rest.ok && rest.r.result.id, '↶ le remet'); await api('delete_textdoc', { id: rest.r.result.id });
        const forged = await api('save_textdoc', { name: 'x', data: { sections: [{ html: '<p>a<script>alert(1)</script><img src="x" onerror="alert(2)"><a href="javascript:alert(3)">l</a><iframe src="https://evil"></iframe></p>' }] } });
        const fh = (await api('textdoc', { id: forged.r.result.id }, true)).r.data.sections[0].html; ok(!/script|onerror|javascript:|iframe/i.test(fh), 'HTML forgé désamorcé côté serveur : ' + fh);
        await api('delete_textdoc', { id: forged.r.result.id });
        ok(!(await api('save_textdoc', { name: 'x', data: { sections: 'rien' } })).ok, 'données forgées refusées');
        const noCsrf = await page.evaluate(async () => (await fetch('api.php?action=save_textdoc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x', data: { sections: [{ html: '' }] } }) })).status);
        ok(noCsrf >= 400, 'sans jeton CSRF : refusé');
        const pk = await api('picker_search', { kind: 'textdoc', q: 'Ren' }, true); ok(pk.ok && JSON.stringify(pk.r).includes('Renommé'), 'menu de choix : les documents');
        const ppl = await api('textdoc_people', { ids: '1' }, true); eq([ppl.r.people['1'].name, ppl.r.people['1'].birth, ppl.r.people['1'].birth_place], ['Jean MARTIN', '3 mars 1850', 'Tulle'], 'personne citée : nom, naissance, lieu');
        const tree = await api('textdoc_tree', { id: 1, gens: 3 }, true); eq(tree.r.people.map(p => p.sosa).sort(), [1, 2, 3], 'petit arbre : la personne et ses parents (Sosa 2 et 3)');
        await api('delete_textdoc', { id });

        /* 3. la liste puis un document neuf */
        await page.evaluate(() => { window.LCNDA_APP.state.listType = 'edit_tools'; window.LCNDA_APP.setModule('listes'); });
        await page.waitForSelector('[data-et-tab="textdoc"].is-active'); await page.waitForTimeout(300);
        ok(await page.locator('.h-et-page .empty-state, .h-et-page [data-empty]').count() > 0 || /Aucun projet de document/.test(await page.textContent('.h-et-page')), 'liste vide : la grande boîte « rien ici »');
        await page.click('.h-et-bar [data-et-new]'); await page.waitForSelector('dialog.wp-dlg[open] .wp-body'); await page.waitForTimeout(500);
        const H = () => page.evaluate(() => window.LCNDA_EXT.textDocKit.current.secs[0].body.innerHTML);
        const ed = (fn, arg) => page.evaluate(fn, arg);
        await page.click('.wp-body'); await page.keyboard.type('Le récit de Jean');
        await page.selectOption('[data-wp-style]', 'h1'); await page.waitForTimeout(100);
        await page.click('.wp-body h1'); await page.keyboard.press('End'); await page.keyboard.press('Enter');
        ok(/<h1 data-st="h1"[^>]*>Le récit de Jean<\/h1><p data-st="normal">/.test(await H()), 'style Titre 1, puis « Normal » après Entrée');
        await page.keyboard.type('Jean naquit en 1850 à Tulle. '); await page.keyboard.press('Control+b'); await page.keyboard.type('Sabotier'); await page.keyboard.press('Control+b'); await page.keyboard.type(' de métier.');
        ok(/<b>Sabotier<\/b>/.test(await H()), 'gras (⌘B)');
        await page.keyboard.press('Enter'); await page.keyboard.press('Control+Shift+8'); await page.keyboard.type('un'); await page.keyboard.press('Enter'); await page.keyboard.press('Tab'); await page.keyboard.type('deux'); await page.keyboard.press('Enter'); await page.keyboard.press('Shift+Tab'); await page.keyboard.type('trois'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
        ok(/<ul><li data-st="normal">un<ul><li data-st="normal">deux<\/li><\/ul><\/li><li data-st="normal">trois<\/li><\/ul><p data-st="normal">/.test(await H()), 'liste à 2 niveaux (Tab, Maj+Tab, Entrée sur une ligne vide) : ' + (await H()).slice(-260));
        await page.keyboard.type('Une note ici'); await page.keyboard.press('Control+Alt+KeyF');
        await page.waitForSelector('dialog.h-modal[open] textarea[name=t]'); await page.fill('dialog.h-modal[open] textarea[name=t]', 'Registre paroissial de Tulle, AD19.'); await page.click('dialog.h-modal[open] [type=submit]'); await page.waitForTimeout(300);
        ok(/<sup class="wp-fn" data-fn="[^"]+" data-kind="foot" data-note="Registre paroissial de Tulle, AD19\." contenteditable="false">1<\/sup>/.test(await H()), 'note de bas de page, numérotée');
        ok(/Registre paroissial de Tulle/.test(await page.textContent('.wp-sheet[data-page="1"] .wp-sheet-notes')), 'la note est en bas de sa page');
        await page.keyboard.press('End'); await page.keyboard.press('Enter');
        await ed(() => { window.LCNDA_EXT.textDocKit.current.run('table'); }); await page.waitForSelector('dialog.h-modal[open] [name=r]'); await page.click('dialog.h-modal[open] [type=submit]'); await page.waitForTimeout(300);
        await page.keyboard.type('Nom'); await page.keyboard.press('Tab'); await page.keyboard.type('Âge');
        ok(/<table class="wp-table"><thead><tr><th>Nom<\/th><th>Âge<\/th>/.test(await H()), 'tableau (Tab passe à la case suivante)');
        // une image : rangée dans les médias
        await page.evaluate(async b64 => { const ed = window.LCNDA_EXT.textDocKit.current; const u = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const p = ed.secs[0].body.querySelector('p'); const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); ed.lastRange = r; await window.LCNDA_EXT.textDocTools.insertImageFile(ed, new File([u], 'portrait.png', { type: 'image/png' })); }, PNG.toString('base64'));
        await page.waitForSelector('.wp-body figure.wp-fig img[src^="media/"]'); ok(true, 'image ajoutée (et rangée dans les médias)');
        // sommaire
        await ed(() => { const e = window.LCNDA_EXT.textDocKit.current; const h = e.secs[0].body.querySelector('h1'); const r = document.createRange(); r.setStart(h, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); e.lastRange = r; e.run('toc'); });
        await page.waitForTimeout(500); ok(/Le récit de Jean/.test(await page.textContent('.wp-gen[data-gen="toc"]')) && (await page.textContent('.wp-gen[data-gen="toc"] .wp-gen-l b')) === '1', 'sommaire avec les numéros de page');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'b-editeur.png') });
        // ↶ ↷
        await page.waitForTimeout(400); const N = h => h.replace(/ style=""/g, '').replace(/style="([^"]*)"/g, (m, v) => 'style="' + v.replace(/\s|;$/g, '') + '"'), len0 = N(await H()).length; await ed(() => window.LCNDA_EXT.textDocKit.current.undo()); await page.waitForTimeout(300); const len1 = N(await H()).length; await ed(() => window.LCNDA_EXT.textDocKit.current.redo()); await page.waitForTimeout(300); const len2 = N(await H()).length;
        ok(len1 < len0 && len2 === len0, `↶ ↷ (${len0} → ${len1} → ${len2})`);
        // suivi des modifications
        await ed(() => window.LCNDA_EXT.textDocKit.current.run('track'));
        await page.click('.wp-body h1'); await page.keyboard.press('End'); await page.keyboard.type(' Martin'); await page.keyboard.press('Home'); await page.keyboard.press('Delete');
        const h1 = await page.innerHTML('.wp-body h1');
        ok(/<ins class="wp-ins"[^>]*> Martin<\/ins>/.test(h1) && /<del class="wp-del"[^>]*>L<\/del>/.test(h1), 'suivi : ajout en vert, suppression barrée : ' + h1);
        await ed(() => window.LCNDA_EXT.textDocKit.current.run('acceptall')); await page.waitForTimeout(100);
        eq(await page.innerHTML('.wp-body h1'), 'e récit de Jean Martin', 'tout accepter');
        await ed(() => window.LCNDA_EXT.textDocKit.current.run('track'));
        // commentaire
        await page.evaluate(() => { const e = window.LCNDA_EXT.textDocKit.current, t = e.secs[0].body.querySelector('h1').firstChild, r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 5); getSelection().removeAllRanges(); getSelection().addRange(r); e.lastRange = r; e.run('comment'); });
        await page.waitForSelector('[data-wp-cmt] textarea'); await page.fill('[data-wp-cmt] textarea', 'Vérifier la date'); await page.dispatchEvent('[data-wp-cmt] textarea', 'change');
        ok(await page.locator('.wp-body .wp-cm').count() === 1 && await ed(() => window.LCNDA_EXT.textDocKit.current.doc.comments[0].text) === 'Vérifier la date', 'commentaire sur un passage');
        // rechercher et remplacer
        await page.click('.wp-body > p[data-st="normal"]'); await page.keyboard.press('Control+f'); await page.waitForSelector('[data-wp-findbar]:not([hidden]) [data-f="q"]');
        await page.fill('[data-f="q"]', 'Tulle'); await page.waitForTimeout(350); eq(await page.textContent('[data-f="n"]'), '1 / 1', 'rechercher : trouvé, compté');
        await page.fill('[data-f="r"]', 'Brive'); await page.click('[data-f="all"]'); await page.waitForTimeout(200);
        ok(!/Tulle/.test((await H()).replace(/data-note="[^"]*"/g, '')) && /Brive/.test(await H()), 'tout remplacer');
        await page.keyboard.press('Escape');
        // enregistrer, fermer, rouvrir
        await page.fill('[data-wp-name]', 'Récit de Jean'); await page.dispatchEvent('[data-wp-name]', 'change');
        await page.keyboard.press('Control+s'); await page.waitForSelector('dialog.wp-dlg [data-ui-status] .is-saved');
        const did = await ed(() => window.LCNDA_EXT.textDocKit.current.id); ok(did > 0, 'enregistré en base');
        const htmlBefore = await H();
        await page.click('dialog.wp-dlg .ui-topbar > button[data-wp-cmd="close"]'); await page.waitForSelector('dialog.wp-dlg', { state: 'detached' });
        await page.waitForSelector('.h-et-page >> text=Récit de Jean');
        if (SHOTS) { await page.click('.ui-listbar [data-view="cards"], .ui-listbar button:has-text("Fiches")').catch(() => {}); await page.waitForTimeout(200); await page.screenshot({ path: path.join(SHOTS, 'a-liste.png') }); }
        await page.locator(`.h-et-page [data-et-open="${did}"]:visible`).first().click(); await page.waitForSelector('dialog.wp-dlg[open] .wp-body h1');
        await page.waitForTimeout(400);
        const strip = h => h.replace(/ contenteditable="(true|false)"/g, '').replace(/ data-wp-push="1"| style="--wp-push:[^"]*"|<div class="wp-gen"[\s\S]*?<\/div><\/div>|<div class="wp-endnotes"[\s\S]*$/g, '');
        eq(strip(await H()).replace(/<div class="wp-gen"[^>]*>[\s\S]*?(?=<h1)/, ''), strip(htmlBefore).replace(/<div class="wp-gen"[^>]*>[\s\S]*?(?=<h1)/, ''), 'rouvert tel quel');
        // aller-retour .docx et .odt depuis l'écran (relus par notre lecteur, et ZIP / XML valides)
        for (const f of ['docx', 'odt']) {
            const b64 = await ed(async f => { const e = window.LCNDA_EXT.textDocKit.current, b = await e.fileOf(f), u = new Uint8Array(await b.arrayBuffer()); return window.LCNDA_TEXT.toB64(u); }, f);
            const buf = Buffer.from(b64, 'base64'); await validZip(buf, `${f} depuis l’écran`);
            const r = await (f === 'docx' ? T.fromDocx : T.fromOdt)(toAB(buf)), all = r.doc.sections.flatMap(s => s.blocks), txt = all.map(T.blockText).join('\n');
            ok(all.some(b => b.st === 'h1') && all.some(b => b.list?.l === 1) && all.some(b => b.t === 'table') && all.some(b => b.t === 'img') && all.some(b => (b.runs || []).some(x => x.note)) && all.some(b => b.t === 'toc') && /Brive/.test(txt) && r.doc.comments.length === 1, `${f} relu : titre, liste, tableau, image, note, sommaire, commentaire`);
        }
        // collage piégé (Word et le web)
        await page.click('.wp-body > p[data-st="normal"]'); await page.keyboard.press('End');
        await page.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/html', '<html><body><p class=MsoNormal style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·<span>&nbsp;&nbsp;</span></span>Élément Word</p><p>du <b>gras</b><script>alert("x")</script><img src="x" onerror="alert(1)"><a href="javascript:alert(2)">lien</a><iframe src="https://evil.example"></iframe><span style="background:url(javascript:alert(3))">fond</span></p></body></html>'); dt.setData('text/plain', 'x'); const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); document.querySelector('.wp-body > p[data-st="normal"]').dispatchEvent(ev); });
        await page.waitForTimeout(400);
        const ph = await H(); ok(!/<script|onerror|javascript:|<iframe|url\(/i.test(ph), 'collage piégé nettoyé'); ok(/<li data-st="normal">Élément Word<\/li>/.test(ph) && /<b>gras<\/b>/.test(ph), 'collage depuis Word : la liste et le gras restent');
        // fichier piégé dans la fenêtre d'import
        const bomb = path.join(dir, 'piege.docx');
        fs.writeFileSync(bomb, await blob2buf(await S.makeZip([{ name: 'word/document.xml', data: '<?xml version="1.0"?><!DOCTYPE w [<!ENTITY lol "lol">]><w:document><w:body/></w:document>' }])));
        await ed(() => { window.LCNDA_EXT.textDocKit.current.run('import'); });
        await page.setInputFiles('dialog.k-import input[type=file]', bomb); await page.waitForSelector('dialog.k-import .ui-notice-error, dialog.k-import .ui-notice.is-error, dialog.k-import [class*="error"]');
        ok(/refusé/.test(await page.textContent('dialog.k-import')), 'fichier piégé refusé dans la fenêtre d’import');
        await page.click('dialog.k-import [data-k-x]');
        // un vrai .docx importé (fait par notre moteur) : un nouveau document
        const good = path.join(dir, 'lettre.docx'); fs.writeFileSync(good, await blob2buf(await T.toDocx(d)));
        await ed(() => { window.LCNDA_EXT.textDocKit.current.run('import'); }); await page.setInputFiles('dialog.k-import input[type=file]', good);
        await page.waitForSelector('dialog.k-import [data-k-go]:not([disabled])'); ok(/Repris : .*tableau.*image.*note/.test(await page.textContent('dialog.k-import')), 'import : « Voilà ce qui va entrer »');
        await page.click('dialog.k-import [data-k-go]'); await page.waitForFunction(() => document.querySelectorAll('dialog.wp-dlg[open]').length === 2);
        ok(await page.evaluate(() => /Le récit/.test(document.querySelectorAll('dialog.wp-dlg[open]')[1].querySelector('.wp-body').innerHTML)), 'le .docx s’ouvre dans un nouveau document');
        await page.evaluate(() => { const d2 = [...document.querySelectorAll('dialog.wp-dlg[open]')][1]; d2.close(); });
        // impression page par page (le même document que l'écran)
        const ph2 = await ed(async () => window.LCNDA_EXT.textDocKit.current.pagedHtml()); ok(/@page s0\{size:210mm 297mm/.test(ph2) && /class="pg s0"/.test(ph2) && /wp-sheet-notes/.test(ph2), 'impression : les pages, leur format, les notes en bas');
        // 390 px puis sombre
        await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(400);
        const over = await page.evaluate(() => { const d0 = document.querySelector('dialog.wp-dlg'); return Math.max(d0.scrollWidth - d0.clientWidth, document.documentElement.scrollWidth - 390); });
        ok(over <= 1, `390 px : pas de défilement de côté (${over})`);
        ok(await page.evaluate(() => { const s = document.querySelector('.wp-sec').getBoundingClientRect(); return s.width <= 390; }), '390 px : la page tient dans l’écran');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'c-390.png') });
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await page.waitForTimeout(200);
        const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.wp-tools')).backgroundColor), paper = await page.evaluate(() => getComputedStyle(document.querySelector('.wp-sheet')).backgroundColor);
        ok(!/255, 255, 255/.test(bg) && /255, 255, 255/.test(paper), `sombre : la barre sombre (${bg}), la page reste blanche (${paper})`);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'd-sombre.png') });
        await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
        await page.evaluate(() => { window.LCNDA_EXT.textDocKit.current.dirty = false; }); await page.click('dialog.wp-dlg .ui-topbar > button[data-wp-cmd="close"]');
        eq(errors, [], 'aucune erreur dans la console');
    } finally {
        if (browser) await browser.close();
        proc.kill();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    }
    console.log(`✓ ${n} vérifications du traitement de texte (moteur, API et navigateur)`);
})().catch(e => { console.error(e); process.exit(1); });
