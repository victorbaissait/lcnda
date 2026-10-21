'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Les outils bâtis sur le dessin vectoriel (heritage-vector*.js) :   node tests/test-dessin-vectoriel.js
 * Un vrai « php -S » sur une base neuve (une petite famille sur 3 générations, une photo), puis un navigateur (Playwright ; sinon sauté) :
 *  1. ✒️ les deux carrés Remplissage / Contour : le carré du contour se voit et se clique (fenêtre standard des couleurs) ;
 *     ⤾ et ⇧X intervertissent en une seule étape de l'historique (⌘Z revient d'un coup) ;
 *  2. ✒️ calques : la liste ne déborde pas du panneau ; double-clic sur le calque où l'on dessine → on le renomme ;
 *     double-clic sur un texte du dessin → la case « Texte » du panneau prend la main ;
 *  3. ✒️ le nom tapé sert tout de suite à l'export ; un dessin enregistré : la liste compte ses objets (pas ses calques) ;
 *  4. 📰 / 🌳 / 🔤 un dessin tout fait (faire-part, arbre, sceau) n'est pas encore enregistré : fermer demande avant de le perdre ;
 *  5. 🌳 « N générations » = N rangées en comptant la personne (le bord de l'éventail dit « Nᵉ gén. ») ; les médaillons de
 *     l'arbre dessiné restent dans la page et ne se couvrent pas d'une génération à l'autre ;
 *  6. 🔤 le sceau ovale : la légende suit l'ovale ; « Signature d’Antoine » (élision).
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-vector-'));
const dir = path.join(tmp, 'a');
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const done = code => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} process.exit(code); };
{
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Joseph','Martin','male'),('Jean','Martin','male'),('Marie','Borie','female'),('Pierre','Martin','male'),('Anne','Roux','female'),('Antoine','Faure','male')");
$pdo->exec("INSERT INTO families(partner1_id,partner2_id) VALUES(2,3),(4,5)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,1),(2,2)");
if (function_exists('imagecreatetruecolor')) { $im = imagecreatetruecolor(400, 300); imagefill($im, 0, 0, imagecolorallocate($im, 230, 220, 200)); imagefilledellipse($im, 200, 150, 160, 120, imagecolorallocate($im, 40, 40, 60)); imagejpeg($im, MEDIA_DIR . '/photo.jpg', 90); $pdo->exec("INSERT INTO media(title, filename, media_type) VALUES('Photo','photo.jpg','image')"); }
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
    if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); done(1); }
}
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
function loadPlaywright() { for (const p of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { return require(p); } catch (_) {} } return null; }
async function launch(pw) { const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(f => fs.existsSync(f)); try { return await pw.chromium.launch(exe ? { executablePath: exe } : {}); } catch (_) { return pw.chromium.launch(); } }

(async () => {
    const pw = loadPlaywright();
    if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); console.log('0 vérification (Playwright absent)'); done(0); }
    const port = await freePort();
    const srv = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    const browser = await launch(pw);
    const out = {}, errors = [];
    try {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(String(e.message)));
        page.on('dialog', d => { errors.push('dialogue natif : ' + d.message()); d.dismiss(); });
        await page.goto(base);
        await page.waitForFunction(() => window.LCNDA_EXT?.openVectorEditor && window.LCNDA_EXT?.decorTreeInternals && window.LCNDA_EXT?.sealInternals && window.LCNDA_UI?.openColorBox && window.LCNDA_APP?.api, null, { timeout: 30000 });
        const objs = () => page.evaluate(() => [...document.querySelectorAll('.vx-dlg [data-vx-content] [data-vx]')].map(e => [e.getAttribute('fill'), e.getAttribute('stroke')]));
        const stageBox = async () => { const b = await page.locator('.vx-dlg [data-vx-stage]').boundingBox(); return { cx: b.x + b.width / 2, cy: b.y + b.height / 2 }; };
        const drag = async (x1, y1, x2, y2) => { await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 }); await page.mouse.move(x2, y2, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(150); };

        /* 1. Remplissage / Contour */
        await page.evaluate(() => window.LCNDA_EXT.openVectorEditor({})); await page.waitForSelector('.vx-dlg [data-vx-stage]'); await page.waitForTimeout(500);
        const { cx, cy } = await stageBox();
        await page.click('.vx-dlg [data-vx-tool="rect"]'); await drag(cx - 250, cy - 150, cx - 100, cy - 50);
        out.squares = await page.evaluate(() => ['[data-vx-fsfill]', '[data-vx-fsstroke]'].map(s => { const r = document.querySelector('.vx-dlg ' + s).getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
        await page.click('.vx-dlg [data-vx-fsstroke]'); await page.waitForSelector('.ui-colorbox');
        await page.locator('.ui-colorbox .ui-sw-btn[data-c]').nth(3).click(); await page.waitForTimeout(200);
        out.afterStroke = await objs();
        await page.click('.vx-dlg [data-vx-fsswap]'); await page.waitForTimeout(200); out.afterSwap = await objs();
        await page.keyboard.press('Shift+X'); await page.waitForTimeout(200); out.afterShiftX = await objs();
        await page.keyboard.press('Control+z'); await page.waitForTimeout(200); out.afterUndo = await objs();

        /* 2. calques et texte */
        await page.click('.vx-dlg [data-vx-tab="layers"]'); await page.waitForTimeout(200);
        out.pane = await page.evaluate(() => { const p = document.querySelector('.vx-dlg [data-vx-pane]'); return [p.scrollWidth, p.clientWidth]; });
        const li = await page.locator('.vx-dlg .vx-layer.is-layer input').first().boundingBox();
        await page.mouse.dblclick(li.x + 30, li.y + li.height / 2); await page.waitForTimeout(200);
        out.renameFocus = await page.evaluate(() => [document.activeElement?.matches('[data-vx-lname]'), document.activeElement?.readOnly]);
        await page.keyboard.press('Control+a'); await page.keyboard.type('Décor'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
        out.layers = await page.evaluate(() => [...document.querySelectorAll('.vx-dlg .vx-layer input')].map(i => i.value));
        // deux calques : le 1er clic redessine la liste (la ligne « Ranger dans… » disparaît), le 2e tombe entre deux lignes
        await page.locator('.vx-dlg [data-vx-pane] button').filter({ hasText: 'Calque' }).first().click(); await page.waitForTimeout(200);
        await page.click('.vx-dlg [data-vx-tool="ellipse"]'); await drag(cx + 50, cy - 150, cx + 150, cy - 60);
        const l2 = await page.locator('.vx-dlg .vx-layer.is-layer input').first().boundingBox();
        await page.mouse.dblclick(l2.x + 30, l2.y + l2.height / 2); await page.waitForTimeout(200);
        out.rename2 = await page.evaluate(() => [document.activeElement?.matches('[data-vx-lname]'), document.activeElement?.value]);
        await page.keyboard.press('Escape');
        await page.click('.vx-dlg [data-vx-tool="text"]'); await page.mouse.click(cx + 50, cy + 100); await page.waitForTimeout(300); await page.keyboard.type('Famille'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
        await page.click('.vx-dlg [data-vx-tool="select"]');
        const tb = await page.locator('.vx-dlg [data-vx-content] text').boundingBox();
        await page.mouse.dblclick(tb.x + tb.width / 2, tb.y + tb.height / 2); await page.waitForTimeout(300);
        out.textFocus = await page.evaluate(() => document.activeElement?.dataset?.vxP || '');

        /* 3. nom → export ; enregistrer → nombre d'objets */
        await page.fill('.vx-dlg [data-vx-name]', 'Armes des Martin');
        await page.locator('.vx-dlg .vx-export summary').click(); await page.click('.vx-dlg [data-vx-cmd="xd_svg"]'); await page.waitForSelector('dialog.ui-export[open]');
        const dl = page.waitForEvent('download', { timeout: 15000 });
        await page.locator('dialog.ui-export[open] .modal-actions button').last().click();
        out.exportName = (await dl).suggestedFilename();
        await page.keyboard.press('Control+s'); await page.waitForFunction(() => /Enregistré/.test(document.querySelector('.vx-dlg [data-vx-status]')?.textContent || ''), null, { timeout: 15000 });
        out.list = await page.evaluate(async () => (await window.LCNDA_APP.api('vector_docs')).docs.map(d => [d.name, d.objects, d.layers]));
        await page.evaluate(() => document.querySelector('.vx-dlg [data-vx-close]').click()); await page.waitForTimeout(300);
        out.closedSaved = await page.evaluate(() => !document.querySelector('.vx-dlg') && !document.querySelector('dialog.confirm-box-dialog[open]'));

        /* 4. un dessin tout fait : fermer demande */
        await page.evaluate(() => window.LCNDA_EXT.openVectorEditor({ doc: window.LCNDA_EXT.sealInternals.buildSeal({ initials: 'JM', shape: 'wax', top: 'Famille Martin' }), name: 'Sceau JM' }));
        await page.waitForSelector('.vx-dlg [data-vx-stage]'); await page.waitForTimeout(400);
        out.readyDirty = await page.locator('.vx-dlg [data-vx-status]').innerText();
        await page.evaluate(() => document.querySelector('.vx-dlg [data-vx-close]').click()); await page.waitForTimeout(300);
        out.askClose = await page.locator('dialog.confirm-box-dialog[open]').count();
        await page.locator('dialog.confirm-box-dialog[open] .modal-actions button').last().click(); await page.waitForTimeout(300);

        /* 5. arbre décoratif */
        out.tree = await page.evaluate(async () => {
            const T = window.LCNDA_EXT.decorTreeInternals, base = { person: 1, orient: 'auto', theme: 'classique', colors: 'branch', layoutNames: 'two', title: 'Famille Martin', subtitle: '', titlePos: 'bottom', dates: true, empty: true, frame: true, genLabels: true, leaves: false };
            const find = (objs, name) => { for (const o of objs) { if (o.name === name) return o; const r = o.children && find(o.children, name); if (r) return r; } return null; };
            const fan = await T.build({ ...base, shape: 'fan180', gens: 6, format: 'a3' }), gl = find(fan.objs, 'Générations').children.map(o => o.text);
            const cases = find(fan.objs, 'Ancêtres').children.length;
            const tr = await T.build({ ...base, shape: 'tree', gens: 4, format: 'a4' }), meds = find(tr.objs, 'Ancêtres').children.map(g => ({ g: g.name, m: g.children.find(c => c.name === 'Médaillon') })).filter(x => x.m && !x.m.rot);
            const inside = meds.every(({ m }) => m.x >= -0.5 && m.y >= -0.5 && m.x + m.w <= tr.w + 0.5 && m.y + m.h <= tr.h + 0.5);
            const gen = s => Math.floor(Math.log2(Number(s)));
            let overlaps = 0; for (let i = 0; i < meds.length; i++) for (let j = i + 1; j < meds.length; j++) { const a = meds[i], b = meds[j], ga = gen(parseInt(a.g)), gb = gen(parseInt(b.g)); if (Math.abs(ga - gb) !== 1) continue;
                const A2 = a.m, B2 = b.m, dx = (A2.x + A2.w / 2) - (B2.x + B2.w / 2), dy = (A2.y + A2.h / 2) - (B2.y + B2.h / 2); // deux ellipses : on teste le centre de l'une dans l'autre, agrandie de la moitié de la première
                if ((dx / ((A2.w + B2.w) / 2 * .7)) ** 2 + (dy / ((A2.h + B2.h) / 2 * .7)) ** 2 < 1) overlaps++; }
            return { outer: gl[gl.length - 1], labels: gl.length, cases, inside, overlaps, n: meds.length };
        });

        /* 6. sceaux */
        out.seal = await page.evaluate(() => {
            const S = window.LCNDA_EXT.sealInternals, d = S.buildSeal({ initials: 'LB', shape: 'oval', top: 'Famille Borie', bottom: 'Tulle 1832' });
            const leg = d.objs.find(l => l.name === 'Légende').children.find(o => o.type === 'textpath'), xs = leg.pts.map(p => p.x), ys = leg.pts.map(p => p.y);
            return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), names: [S.deName('Antoine FAURE'), S.deName('Jean MARTIN'), S.deName('Élise ROUX')] };
        });
    } finally { await browser.close(); srv.kill(); }

    const checks = [
        ['carrés Remplissage / Contour : deux carrés de 22 px, le contour se voit', () => assert.deepEqual(out.squares, [[22, 22], [22, 22]])],
        ['clic sur le carré du contour → fenêtre standard → le contour change', () => assert.notEqual(out.afterStroke[0][1], '#222222')],
        ['⤾ échange remplissage et contour ; ⇧X aussi', () => { assert.deepEqual(out.afterSwap[0], [out.afterStroke[0][1], out.afterStroke[0][0]]); assert.deepEqual(out.afterShiftX[0], out.afterStroke[0]); }],
        ['un échange = une seule étape de l’historique', () => assert.deepEqual(out.afterUndo[0], out.afterSwap[0])],
        ['calques : la liste ne déborde pas du panneau', () => assert.ok(out.pane[0] <= out.pane[1] + 1, String(out.pane))],
        ['calques : double-clic sur le calque actif → renommé', () => { assert.deepEqual(out.renameFocus, [true, false]); assert.equal(out.layers[0], 'Décor'); }],
        ['calques : double-clic avec deux calques → renommer le bon', () => assert.deepEqual(out.rename2, [true, 'Calque 2'])],
        ['double-clic sur un texte → la case Texte du panneau', () => assert.equal(out.textFocus, 'text')],
        ['export : le nom tapé donne le nom du fichier', () => assert.equal(out.exportName, 'armes-des-martin.svg')],
        ['liste : le nombre d’objets (pas celui des calques)', () => { assert.equal(out.list[0][0], 'Armes des Martin'); assert.equal(out.list[0][1], 3); assert.ok(out.list[0][2] >= 1); }],
        ['dessin enregistré : se ferme sans question', () => assert.equal(out.closedSaved, true)],
        ['dessin tout fait (sceau) : « modifié » et fermer demande', () => { assert.match(out.readyDirty, /modifi/); assert.equal(out.askClose, 1); }],
        ['arbre : 6 générations → le bord dit « 6ᵉ gén. », 63 cases', () => { assert.equal(out.tree.outer, '6ᵉ gén.'); assert.equal(out.tree.labels, 5); assert.equal(out.tree.cases, 63); }],
        ['arbre dessiné : médaillons dans la page, sans chevauchement d’une génération à l’autre', () => { assert.ok(out.tree.n >= 7); assert.equal(out.tree.inside, true); assert.equal(out.tree.overlaps, 0); }],
        ['sceau ovale : la légende suit l’ovale', () => assert.ok(out.seal.h > out.seal.w * 1.1, `${out.seal.w} × ${out.seal.h}`)],
        ['signature : « d’Antoine », « de Jean », « d’Élise »', () => assert.deepEqual(out.seal.names, ['d’Antoine FAURE', 'de Jean MARTIN', 'd’Élise ROUX'])],
        ['aucune erreur JavaScript, aucun dialogue natif', () => assert.deepEqual(errors, [])],
    ];
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
    console.log(failed ? `${failed} échec(s)` : `${checks.length} vérifications réussies`);
    done(failed ? 1 : 0);
})().catch(e => { console.error(e); done(1); });
