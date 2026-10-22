'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * L'atelier de mise en page utilisé comme un vrai utilisateur (assets/js/heritage-layout.js, heritage-layout-facts.js) :   node tests/test-layout-atelier.js
 *   ⎋ Échap désélectionne sans demander de fermer l'atelier ; 🎨 les carrés fond / contour ouvrent la fenêtre des couleurs de l'app (C2) ;
 *   🔒 un objet verrouillé ne disparaît pas de la sélection quand on le supprime, et une suppression propose « ↶ Annuler » (H7) ;
 *   📏 pas de page de 0 mm ni d'objet de largeur négative ; ¹ un appel de note posé entre deux paragraphes va dans le paragraphe ;
 *   ✅ un arbre (dessin SVG) n'est pas « trop petit pour l'impression » ; 📄 « Gabarit de plusieurs pages » dit ce qu'il a fait ;
 *   💾 après « Enregistrer », quitter la page ne demande plus rien ; 🔎 « naquit à Amboise » (sans date) comparé au lieu de la fiche ;
 *   🅰 un nouveau style de paragraphe part de la police du texte courant ; 🌐 l'export HTML n'intègre pas une image introuvable ;
 *   🕘 l'historique dit « Commentaire ajouté ».
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-layout-atelier-'));
fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const done = code => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} process.exit(code); };

(async () => {
    const out = {}, errors = [];
    {
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start,living_status) VALUES(1,'Jean','Martin','male',1,'deceased'),(2,'Pierre','Martin','male',0,'deceased'),(3,'Marie','Durand','female',0,'deceased')");
$pdo->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(2,3)')->execute(); $f = (int) $pdo->lastInsertId(); $pdo->prepare('INSERT INTO family_children(family_id,child_id) VALUES(?,1)')->execute([$f]);
$pdo->exec("INSERT INTO places(id,name,country) VALUES(1,'Tours','France'),(2,'Amboise','France')");
$birt = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT'")->fetchColumn();
$pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES('person',1,?,'12 mars 1890',1890,1)")->execute([$birt]);
$img = imagecreatetruecolor(60, 80); imagefill($img, 0, 0, imagecolorallocate($img, 150, 110, 90)); imagejpeg($img, MEDIA_DIR . '/jean.jpg');
$pdo->exec("INSERT INTO media(id,title,media_type,filename,thumbnail) VALUES(1,'Jean','image','jean.jpg','jean.jpg')");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
        if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); done(1); }
    }
    let pw = null; for (const p of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); done(0); }
    let srv = null, browser = null;
    try {
        const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
        srv = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
        const base = `http://127.0.0.1:${port}/`;
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
        const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
        browser = await pw.chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {}).catch(() => pw.chromium.launch());
        const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true });
        await ctx.route(u => !u.href.startsWith(base), r => r.abort());
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(String(e.message)));
        page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
        page.on('dialog', d => { errors.push('dialogue natif : ' + d.type() + ' ' + d.message()); d.type() === 'beforeunload' ? d.accept() : d.dismiss(); });
        await page.goto(base);
        await page.waitForFunction(() => window.LCNDA_EXT?.newLayoutDoc && window.LCNDA_EXT?.factCheck && window.LCNDA_APP?.state?.bootstrap, null, { timeout: 30000 });
        const E = 'dialog.ly-editor[open] ';
        const cmd = k => page.evaluate(k => document.querySelector(`dialog.ly-editor [data-ly-cmd="${k}"]`).click(), k).then(() => page.waitForTimeout(250));
        const msg = () => page.textContent(E + '[data-ly-msg]');
        const own = `${E}.ly-board .ly-page[data-page="0"] .ly-item:not(.ly-from-master)`;
        const pageBox = async () => (await page.$(`${E}.ly-board .ly-page[data-page="0"]`)).boundingBox();
        const draw = async (tool, x1, y1, x2, y2) => { await page.click(`${E}[data-ly-tool="${tool}"]`); const b = await pageBox(); await page.mouse.move(b.x + x1, b.y + y1); await page.mouse.down(); await page.mouse.move(b.x + x2, b.y + y2, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(200); };
        const clickItem = async (k, dbl) => { const b = await (await page.$$(own))[k].boundingBox(); await page.mouse[dbl ? 'dblclick' : 'click'](b.x + 12, b.y + 12); await page.waitForTimeout(200); };
        const selCount = () => page.$$eval(E + '.ly-selbox', l => l.length);
        const answer = async v => { await page.waitForSelector('dialog.ask-text-dialog[open]'); const i = await page.$('dialog.ask-text-dialog[open] input, dialog.ask-text-dialog[open] textarea'); await i.fill(v); await i.press('Enter'); await page.waitForTimeout(300); };

        // un livre vide de deux pages
        await page.evaluate(() => window.LCNDA_EXT.newLayoutDoc('blank', () => {}));
        await page.waitForSelector('dialog[open] [name=pages]');
        await page.fill('dialog[open] [name=name]', 'Atelier'); await page.fill('dialog[open] [name=pages]', '2');
        await page.click('dialog[open] button[type=submit]');
        await page.waitForSelector(E); await page.waitForTimeout(600);
        // ⎋ Échap : désélectionne, l'atelier reste ouvert sans question
        await draw('rect', 60, 60, 200, 200); await page.click(`${E}[data-ly-tool="select"]`); await clickItem(0);
        out.selBefore = await selCount(); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
        out.esc = { sel: await selCount(), confirm: !!(await page.$('dialog.confirm-box-dialog[open]')), editor: !!(await page.$(E)) };
        // 🎨 le carré du fond : la fenêtre des couleurs de l'app
        await clickItem(0); await page.click(`${E}.ly-fs-fill`); await page.waitForTimeout(300);
        out.colorbox = !!(await page.$('.ui-colorbox'));
        if (out.colorbox) { await page.fill('.ui-colorbox [data-ui-hex]', '#123456'); await page.press('.ui-colorbox [data-ui-hex]', 'Enter'); await page.waitForTimeout(300); }
        out.fill = await page.$eval(own + ' svg path', p => p.getAttribute('fill'));
        // 🔒 supprimer un objet verrouillé : un mot, la sélection reste ; déverrouillé : supprimé avec « ↶ Annuler »
        await clickItem(0); await cmd('lock'); await page.keyboard.press('Delete'); await page.waitForTimeout(200);
        out.locked = { sel: await selCount(), items: (await page.$$(own)).length, msg: await msg() };
        await cmd('lock'); await page.keyboard.press('Delete'); await page.waitForTimeout(300);
        out.deleted = { items: (await page.$$(own)).length, toast: await page.evaluate(() => document.body.innerText.includes('Objet supprimé')) };
        await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
        out.undone = (await page.$$(own)).length;
        // 📏 valeurs limites : largeur d'objet négative, page de 0 mm
        await clickItem(0); await page.click(`${E}[data-ly-panel="obj"]`); await page.waitForTimeout(200);
        await page.fill(`${E}[data-ly-set="w"]`, '-50'); await page.press(`${E}[data-ly-set="w"]`, 'Tab'); await page.waitForTimeout(250);
        out.objW = await page.$eval(own, el => el.style.width);
        await page.click(`${E}[data-ly-panel="doc"]`); await page.waitForTimeout(200);
        await page.fill(`${E}[data-ly-doc="w"]`, '0'); await page.press(`${E}[data-ly-doc="w"]`, 'Tab'); await page.waitForTimeout(250);
        out.pageW = await page.$eval(`${E}.ly-board .ly-page`, el => parseFloat(el.style.width));
        await page.fill(`${E}[data-ly-doc="w"]`, '210'); await page.press(`${E}[data-ly-doc="w"]`, 'Tab'); await page.waitForTimeout(250);
        // ¹ une note juste après un double-clic (curseur entre les paragraphes) : l'appel va dans le paragraphe
        await draw('text', 60, 260, 400, 400); await page.keyboard.type('Jean Martin naquit à Amboise.'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
        await page.click(`${E}[data-ly-tool="select"]`); await clickItem(1, true);
        await page.evaluate(() => { const t = document.querySelector('dialog.ly-editor [contenteditable=true]'), r = document.createRange(); r.setStart(t, t.childNodes.length); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
        await cmd('fnote'); await answer('Acte de naissance.');
        out.noteHtml = await page.$eval(E + '[contenteditable=true]', t => t.innerHTML);
        // 🕘 un commentaire sur des mots : l'historique le nomme
        await page.evaluate(() => { const t = document.querySelector('dialog.ly-editor [contenteditable=true] p'), r = document.createRange(); r.setStart(t.firstChild, 0); r.setEnd(t.firstChild, 4); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
        await cmd('comment'); await answer('Vérifier'); await answer('Victor');
        await page.click(`${E}[data-ly-panel="history"]`); await page.waitForTimeout(200);
        out.history = await page.textContent(E + '[data-ly-pbody]');
        // 🅰 un nouveau style de paragraphe : la police du texte courant
        await page.click(`${E}[data-ly-panel="text"]`); await page.click(`${E}[data-ly-psnew]`); await page.waitForSelector('dialog[open]:not(.ly-editor) [name=name]');
        out.newStyleFont = await page.$eval('dialog[open]:not(.ly-editor) [name=font]', i => i.value);
        out.bodyFont = await page.evaluate(() => window.LCNDA_EXT.layoutKit.baseStyles(window.LCNDA_EXT.layoutKit.THEMES[0]).find(s => s.id === 'ps-body')?.font || '');
        await page.click('dialog[open]:not(.ly-editor) [data-h-close]');
        // ✅ un arbre (SVG) : pas « trop petit pour l'impression » ; le fait « naquit à Amboise » est signalé
        await cmd('tree'); await page.waitForSelector('dialog[open]:not(.ly-editor) [name=mode]'); await page.click('dialog[open]:not(.ly-editor) button[type=submit]');
        await page.waitForFunction(() => /🌳/.test(document.querySelector('dialog.ly-editor [data-ly-msg]')?.textContent || '') && !/Je dessine/.test(document.querySelector('dialog.ly-editor [data-ly-msg]').textContent), null, { timeout: 15000 });
        await cmd('preflight'); await page.waitForSelector('.ly-preflight', { timeout: 15000 });
        out.preflight = await page.$eval('.ly-preflight', ol => ol.innerText);
        out.preflightClose = await page.$eval('dialog:has(.ly-preflight) .modal-actions [data-h-close]', b => b.textContent);
        await page.click('dialog:has(.ly-preflight) [data-h-close]');
        // 📄 gabarit sur toutes les pages : le message dit ce qui a été fait
        await cmd('masters'); await page.waitForSelector('dialog[open]:not(.ly-editor) [name=which]');
        await page.selectOption('dialog[open]:not(.ly-editor) [name=to]', ''); await page.selectOption('dialog[open]:not(.ly-editor) [name=which]', 'all');
        await page.click('dialog[open]:not(.ly-editor) button[type=submit]'); await page.waitForTimeout(250);
        out.mastersMsg = await msg();
        // 💾 enregistré : plus de « quitter la page ? »
        out.dirtyBefore = await page.$eval('dialog.ly-editor', d => d.dataset.dirty);
        await page.keyboard.press('Control+s'); await page.waitForFunction(() => /Enregistré/.test(document.querySelector('dialog.ly-editor [data-ly-state]')?.textContent || ''), null, { timeout: 10000 });
        await page.click(`${E}[data-ed-zoom="in"]`); // K18 : le zoom commun de la barre du bas await page.waitForTimeout(100); // un zoom ne change pas le document
        out.dirtyAfter = await page.$eval('dialog.ly-editor', d => d.dataset.dirty);
        // 🔎 le fait sans date : « naquit à Amboise » alors que la fiche dit Tours
        out.facts = await page.evaluate(async () => (await window.LCNDA_EXT.factCheck([{ page: 0, id: 'x', text: 'Jean MARTIN naquit à Amboise. Jean MARTIN naquit à Tours.', ctx: [] }])).map(x => `${x.lvl} ${x.text}`));
        // 🌐 export HTML d'un document qui montre une image introuvable : pas de « data:text/plain »
        const id = await page.evaluate(async () => { const K = window.LCNDA_EXT.layoutKit, d = K.cleanDoc({ page: { w: 100, h: 100 }, pages: [{ id: 'p1', master: '', items: [{ id: 'f1', type: 'frame', x: 10, y: 10, w: 40, h: 40, src: 'media/absente.jpg' }, { id: 'f2', type: 'frame', x: 50, y: 50, w: 40, h: 40, src: 'media/jean.jpg' }] }] });
            const r = await window.LCNDA_APP.api('save_layout_doc', {}, { method: 'POST', body: { name: 'Image absente', is_design: 0, doc: d } }); return r.result.id; });
        await page.click(`${E}.ly-top [data-ly-cmd="close"]`).catch(() => cmd('close')); await page.waitForTimeout(300);
        await page.evaluate(id => window.LCNDA_EXT.openLayoutDoc(id, () => {}), id); await page.waitForSelector(E); await page.waitForTimeout(500);
        await cmd('export'); await page.waitForSelector('dialog.ui-export[open]'); await page.click('dialog.ui-export[open] [data-fmt="html"]');
        const dlP = page.waitForEvent('download'); await page.click('dialog.ui-export[open] [data-ui-go]'); const dl = await dlP;
        const html = fs.readFileSync(await dl.path(), 'utf8');
        out.html = { textPlain: /data:text\/plain/.test(html), jpeg: (html.match(/href="data:image\/jpeg/g) || []).length, missingKept: /href="media\/absente\.jpg"/.test(html) };
    } catch (e) { errors.push('test : ' + (e.stack || e.message)); }
    finally { await browser?.close(); srv?.kill(); }

    const checks = [
        ['⎋ Échap désélectionne sans proposer de fermer l’atelier', () => { assert.equal(out.selBefore, 1); assert.deepEqual(out.esc, { sel: 0, confirm: false, editor: true }); }],
        ['🎨 le carré du fond ouvre la fenêtre des couleurs de l’app (C2), le code # s’applique', () => { assert.ok(out.colorbox); assert.equal(out.fill, '#123456'); }],
        ['🔒 objet verrouillé : un message, il reste choisi ; déverrouillé : supprimé avec « ↶ Annuler », ⌘Z le remet', () => { assert.equal(out.locked.sel, 1); assert.equal(out.locked.items, 1); assert.match(out.locked.msg, /verrouillé/); assert.deepEqual(out.deleted, { items: 0, toast: true }); assert.equal(out.undone, 1); }],
        ['📏 pas de largeur négative, pas de page de 0 mm', () => { assert.equal(out.objW, '0px'); assert.ok(out.pageW > 100, String(out.pageW)); }],
        ['¹ appel de note posé entre deux paragraphes : dans le paragraphe', () => assert.match(out.noteHtml, /Amboise\.<sup data-fn="[a-z0-9]+">1<\/sup><\/p>/)],
        ['🕘 l’historique dit « Commentaire ajouté »', () => assert.match(out.history, /Commentaire ajouté/)],
        ['🅰 nouveau style de paragraphe : police du texte courant', () => { assert.ok(out.bodyFont); assert.equal(out.newStyleFont, out.bodyFont); }],
        ['✅ arbre dessiné : pas « trop petit pour l’impression » ; le lieu contredit par la fiche est signalé ; bouton « Fermer »', () => { assert.doesNotMatch(out.preflight, /trop petite/); assert.match(out.preflight, /Amboise/); assert.equal(out.preflightClose, 'Fermer'); }],
        ['📄 « Gabarit de plusieurs pages » : le message dit ce qui a été fait', () => assert.match(out.mastersMsg, /Gabarit enlevé de 2 pages\./)],
        ['💾 après « Enregistrer » (et un zoom), quitter la page ne demande plus rien', () => { assert.equal(out.dirtyBefore, '1'); assert.equal(out.dirtyAfter, ''); }],
        ['🔎 « naquit à Amboise » (sans date) : signalé ; « naquit à Tours » : rien', () => { assert.equal(out.facts.length, 1, out.facts.join('\n')); assert.match(out.facts[0], /^warn .*Amboise.*12 mars 1890 à Tours/); }],
        ['🌐 export HTML : l’image introuvable n’est pas intégrée comme du texte, la bonne l’est', () => assert.deepEqual(out.html, { textPlain: false, jpeg: 1, missingKept: true })],
        ['aucune erreur JavaScript, aucun dialogue natif', () => assert.deepEqual(errors, [])],
    ];
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', String(e.message).slice(0, 700)); } }
    if (errors.length) console.log(errors);
    console.log(failed ? `${failed} échec(s)` : `${checks.length} vérifications réussies`);
    done(failed ? 1 : 0);
})().catch(e => { console.error(e); done(1); });
