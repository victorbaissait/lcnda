'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🎤 Présentation — en plus : ↔ liaisons accrochées à deux objets, ⊕ fusion de formes, 🗂 masque des diapositives, 〰 trajectoires d'animation.
 *   node tests/test-presentation-plus.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const PV = require('../assets/js/heritage-tableur-plus.js'), MM = require('../assets/js/heritage-traitement-texte-fusion.js');
(async () => {
    const H = ['Nom', 'Commune', 'Siècle', 'Âge'], ROWS = [['A', 'Tulle', 18, 40], ['B', 'Tulle', 19, 60], ['C', 'Naves', 19, 70], ['D', 'Naves', 19, ''], ['E', '', 18, 30], null, ['', '', '', '']];
    await t('tableau croisé : somme par commune × siècle, totaux, vides en dernier', () => {
        assert.deepEqual(PV.compute(H, ROWS, {rows: 1, cols: 2, val: 3, agg: 'sum'}).matrix, [['Commune', '18', '19', 'Total'], ['Naves', null, 70, 70], ['Tulle', 40, 60, 100], ['(vide)', 30, null, 30], ['Total', 70, 130, 200]]);
    });
    await t('tableau croisé : nombre de lignes, moyenne (sans total), plus grand, valeurs différentes', () => {
        assert.deepEqual(PV.compute(H, ROWS, {rows: 1, cols: -1, val: -1, agg: 'count'}).matrix, [['Commune', 'Nombre de lignes'], ['Naves', 2], ['Tulle', 2], ['(vide)', 1], ['Total', 5]]);
        const avg = PV.compute(H, ROWS, {rows: 2, cols: -1, val: 3, agg: 'avg'}); assert.deepEqual(avg.matrix, [['Siècle', 'Moyenne de « Âge »'], [18, 35], [19, 65]]); assert.equal(avg.totalRow, false);
        assert.deepEqual(PV.compute(H, ROWS, {rows: 2, cols: -1, val: 1, agg: 'distinct'}).matrix.slice(1), [[18, 1], [19, 2]]);
        assert.deepEqual(PV.compute(H, ROWS, {rows: 2, cols: -1, val: 3, agg: 'max'}).matrix.slice(1), [[18, 40], [19, 70]]);
    });
    await t('tableau croisé : en % de la ligne, de la colonne, du tout', () => {
        const r = PV.compute(H, ROWS, {rows: 1, cols: 2, val: -1, agg: 'count', pct: 'row'}).matrix; assert.deepEqual(r[2], ['Tulle', 0.5, 0.5, 1]); assert.deepEqual(r[4], ['Total', 0.4, 0.6, 1]);
        const c = PV.compute(H, ROWS, {rows: 1, cols: 2, val: -1, agg: 'count', pct: 'col'}).matrix; assert.deepEqual(c[4], ['Total', 1, 1, 1]);
        const a = PV.compute(H, ROWS, {rows: 1, cols: 2, val: -1, agg: 'count', pct: 'all'}).matrix; assert.equal(a[4][3], 1);
    });
    await t('champs de fusion : valeurs, accords (né / née, il / elle), âge, années, champ vide visible, texte échappé', () => {
        const p = {name: 'Anne MOISANT', first: 'Anne', last: 'Moisant', gender: 'female', birth: '24/08/1770', birth_place: 'Pernay', by: 1770, dy: 1840, age: 70, father: '<b>Jean</b>', occupation: ''};
        const html = ['first', 'ne', 'il', 'birth', 'age', 'years', 'father', 'occupation'].map(MM.fieldHtml).join('|');
        assert.equal(MM.fill(html, p), 'Anne|née|elle|24/08/1770|70 ans|1770 – 1840|&lt;b&gt;Jean&lt;/b&gt;|…');
        assert.equal(MM.fill(MM.fieldHtml('ne'), {gender: 'male'}), 'né'); assert.equal(MM.fill(MM.fieldHtml('occupation'), p, {missing: ''}), '');
        assert.deepEqual(MM.fieldsIn(html), ['first', 'ne', 'il', 'birth', 'age', 'years', 'father', 'occupation']);
        assert.equal(MM.fill('<span class="wp-field" data-field="page">1</span>', p), '<span class="wp-field" data-field="page">1</span>', 'les autres champs ne bougent pas');
    });
    /* ── 2. navigateur ── */
    let chromium = null; try { ({chromium} = require('playwright')); } catch (_) {}
    let phpPath = null; try { const {findPhp, devBundledPhp} = require('../electron/php-server'); phpPath = findPhp([devBundledPhp()]); } catch (_) {}
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); return finish(); }
    const {phpRuntimeArgs} = require('../electron/php-server');
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const pp = s.address().port; s.close(() => res(pp)); }); });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-wordexcel-')); fs.mkdirSync(path.join(dir, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Louise','BORIE','female','deceased'),('Jean','FAURE','male','deceased'),('Pierre','BORIE','male','deceased')");
$p->exec("INSERT INTO families(partner1_id,partner2_id) VALUES(3,1)"); $p->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,2)");
$p = null; require 'lib/bootstrap.php'; $db = db();
$bt = (int) $db->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT'")->fetchColumn(); $db->prepare("INSERT INTO places(name) VALUES('Tulle')")->execute();
$db->prepare('INSERT INTO events(person_id,event_type_id,date_text,year,place_id,scope) VALUES(1,?,?,1890,1,?)')->execute([$bt, '3 mai 1890', 'person']); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch(); const page = await browser.newPage({viewport: {width: 1400, height: 900}});
    const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
    try {
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_EXT?.openKeynote && window.LCNDA_EXT?.keynoteInternals && window.LCNDA_APP?.state?.bootstrap);
        const K = () => page.evaluate(() => { const c = window.LCNDA_EXT.keynoteCurrent; return JSON.parse(JSON.stringify(c.show)); });
        const pick = ids => page.evaluate(ids => window.LCNDA_EXT.keynoteCurrent.select(ids), ids);
        const kcmd = c => page.evaluate(c => document.querySelector(`dialog[open] [data-kn-cmd="${c}"]`).click(), c);
        const submit = () => page.click('dialog.h-modal[open] button[type="submit"]');
        await t('le dessin : liaison accrochée (suit les objets), forme fusionnée, masque avec numéro, objet sans masque', async () => {
            const html = await page.evaluate(() => { const KI = window.LCNDA_EXT.keynoteInternals;
                const show = KI.normalize({w: 1920, h: 1080, theme: 'blanc', master: {objs: [{id: 'm1', t: 'text', html: '<div>Page {n} / {total}</div>', x: 1700, y: 1000, w: 200, h: 60}]}, slides: [
                    {id: 's1', objs: [{id: 'a', t: 'shape', kind: 'rect', x: 100, y: 100, w: 200, h: 100}, {id: 'b', t: 'shape', kind: 'ellipse', x: 900, y: 500, w: 200, h: 100}, {id: 'l', t: 'link', from: 'a', to: 'b', kind: 'elbow', arrow: 'both'},
                        {id: 'c', t: 'shape', kind: 'combo', mop: 'subtract', parts: [{kind: 'rect', x: 0, y: 0, w: 200, h: 200}, {kind: 'ellipse', x: 100, y: 100, w: 200, h: 200}], x: 1200, y: 100, w: 300, h: 300}]},
                    {id: 's2', noMaster: true, objs: []}]});
                const s1 = KI.renderSlide(show, show.slides[0]), s2 = KI.renderSlide(show, show.slides[1]), l = show.slides[0].objs.find(o => o.id === 'l');
                return {s1, s2, box: [l.x, l.y, l.w, l.h]}; });
            assert.match(html.s1, /Page 1 \/ 2/); assert.doesNotMatch(html.s2, /Page/); assert.match(html.s1, /data-kn-m="m1"/, 'le masque n’est pas choisissable');
            assert.equal((html.s1.match(/<polygon/g) || []).length >= 2, true, 'deux pointes'); assert.match(html.s1, /<mask id="knmc"/, 'soustraction par masque');
            assert.deepEqual(html.box, [270, 170, 660, 360], 'le cadre va d’un bord à l’autre (+ 30 de marge)');
        });
        await t('dans l’éditeur : ↔ relier deux objets, ⊕ les fusionner, 🗂 les mettre en masque, 〰 une trajectoire ; enregistré tel quel', async () => {
            await page.evaluate(() => window.LCNDA_EXT.openKeynote({name: 'Essai plus', show: {w: 1920, h: 1080, theme: 'blanc', slides: [{id: 's1', objs: [{id: 'a', t: 'shape', kind: 'rect', x: 100, y: 100, w: 300, h: 200}, {id: 'b', t: 'shape', kind: 'ellipse', x: 250, y: 150, w: 300, h: 200}, {id: 't', t: 'text', html: '<div>Logo</div>', x: 1500, y: 950, w: 300, h: 80}]}, {id: 's2', objs: []}]}}));
            await page.waitForSelector('dialog[open] .kn-sl [data-kn-o="a"]'); await page.waitForTimeout(400);
            await pick(['a', 'b']); await kcmd('connect'); await page.waitForTimeout(200);
            let sh = await K(); const link = sh.slides[0].objs.find(o => o.t === 'link'); assert.ok(link && link.from === 'a' && link.to === 'b', 'liaison créée');
            await page.evaluate(() => { const s = window.LCNDA_EXT.keynoteCurrent.show.slides[0]; s.objs = s.objs.filter(o => o.t !== 'link'); });
            await pick(['a', 'b']); await kcmd('merge'); await page.waitForSelector('dialog.h-modal[open] [name="op"]'); await page.selectOption('dialog.h-modal[open] [name="op"]', 'intersect'); await submit(); await page.waitForTimeout(300);
            sh = await K(); const c = sh.slides[0].objs.find(o => o.kind === 'combo'); assert.ok(c, 'forme fusionnée'); assert.equal(c.mop, 'intersect'); assert.equal(c.parts.length, 2); assert.deepEqual([c.x, c.y, c.w, c.h], [100, 100, 450, 250]);
            await pick(['t']); await kcmd('master'); await page.waitForTimeout(200);
            sh = await K(); assert.equal(sh.master.objs.length, 1); assert.ok(!sh.slides[0].objs.some(o => o.id === 't'));
            assert.ok(await page.$('dialog[open] .kn-sl .kn-mst [data-kn-m="t"]'), 'le logo est sur la diapositive, par le masque');
            const saved = await page.evaluate(async () => { const c = window.LCNDA_EXT.keynoteCurrent, show = JSON.parse(JSON.stringify(c.show)); show.slides[0].builds = [{id: 'b1', obj: show.slides[0].objs[0].id, kind: 'in', fx: 'path', pk: 'arc', dx: 300, dy: -100, start: 'click'}];
                show.slides[0].objs.push({id: 'x', t: 'shape', kind: 'rect', x: 0, y: 0, w: 50, h: 50}, {id: 'y', t: 'shape', kind: 'rect', x: 500, y: 500, w: 50, h: 50}, {id: 'lk', t: 'link', from: 'x', to: 'y', kind: 'curve'}); show.slides[1].noMaster = true;
                const r = await window.LCNDA_APP.api('save_slideshow', {}, {method: 'POST', body: {name: 'Essai plus', show}}); const g = await window.LCNDA_APP.api('slideshow', {id: r.result.id}); return g.show; });
            assert.equal(saved.master.objs[0].id, 't'); assert.equal(saved.slides[1].noMaster, true);
            const s0 = saved.slides[0]; assert.equal(s0.objs.find(o => o.kind === 'combo').mop, 'intersect'); assert.equal(s0.objs.find(o => o.kind === 'combo').parts.length, 2);
            assert.deepEqual([s0.objs.find(o => o.t === 'link').from, s0.objs.find(o => o.t === 'link').to], ['x', 'y']);
            assert.deepEqual([s0.builds[0].fx, s0.builds[0].pk, s0.builds[0].dx, s0.builds[0].dy], ['path', 'arc', 300, -100]);
        });
        await t('〰 une trajectoire ne cache pas l’objet au début de la diapositive', async () => {
            const hidden = await page.evaluate(() => { const KI = window.LCNDA_EXT.keynoteInternals, show = KI.normalize({slides: [{id: 's', objs: [{id: 'a', t: 'shape', kind: 'rect', x: 0, y: 0, w: 10, h: 10}], builds: [{id: 'b', obj: 'a', kind: 'in', fx: 'path', start: 'click'}]}]});
                return KI.renderBuilt(show, show.slides[0], 'thumb', 'start').includes('data-kn-o="a"'); });
            assert.equal(hidden, true);
        });
        await t('aucune erreur JavaScript', () => assert.deepEqual(errs, []));
    } finally { await browser.close(); proc.kill(); try { fs.rmSync(dir, {recursive: true, force: true}); } catch (_) {} }
    finish();
})();
function finish() { console.log(`${failed ? '✗' : '✓'} présentation, en plus : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); }
