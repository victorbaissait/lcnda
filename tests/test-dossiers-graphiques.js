'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📁 Dossiers (et sous-dossiers) de « Mes diagrammes » et « Mes graphiques », colonne de gauche de Graphiques :
 *     node tests/test-dossiers-graphiques.js        (SHOTS_DIR=… pour garder des captures)
 * Un vrai « php -S » sur une base neuve (6 diagrammes, 3 graphiques perso), puis un navigateur (Playwright ; sinon sauté) :
 *  créer un dossier, l'ouvrir / le fermer (retenu, clavier Entrée / Espace), ranger en glissant (diagrammes) et par
 *  « 📁 Ranger » (diagrammes et graphiques, « ＋ Nouveau dossier… » dans le dossier coché), sous-dossier, boucle
 *  refusée, 3 niveaux au plus, ordre des dossiers, sortir d'un dossier, supprimer + « ↶ Annuler », noms piégés,
 *  rangement forgé nettoyé à la lecture, la clé revient de la base (autre navigateur), mode consultation, 390 px,
 *  aucune erreur JavaScript.
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-dossiers-'));
const dir = path.join(tmp, 'a');
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const KEY = 'genealogie-side-folders';
const TRAP = '<img src=x onerror="window.__xss=1">';
const SHOTS = process.env.SHOTS_DIR || '';
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
{
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Joseph','Martin','male')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
    if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
}
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

(async () => {
    let failed = 0;
    const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
    let pw = null;
    for (const m of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
    if (!pw || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, test sauté'); process.exit(0); }
    const port = Number(process.env.DOSSIERS_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    // la base : 6 diagrammes et 3 graphiques perso
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const post = async (action, body) => (await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ ...body, csrf }) })).json();
    const dg = [];
    for (const n of ['Assemblée 1789', 'Conseil municipal', 'Sénat 1900', 'Les Beatles', 'Fanfare', 'Métiers des ancêtres']) dg.push(Number((await post('save_diagram', { name: n, kind: n === 'Les Beatles' || n === 'Fanfare' ? 'timeline' : 'parliament', spec: {} })).result?.id));
    const gr = (id, name) => ({ id, name, icon: '📈', kind: 'chart', inStats: true, width: '12', style: 'columns', src: { source: 'manual' }, free: { series: [{ name: '1900' }], rows: [{ label: 'Rennes', v: ['42'] }] } });
    await post('graphs_write', { op: 'import', defs: [gr('cw_dos00001', 'Habitants'), gr('cw_dos00002', 'Mariages'), gr('cw_dos00003', 'Moulins')] });

    const browser = await pw.chromium.launch();
    const errors = [];
    const watch = p => {
        p.on('pageerror', e => errors.push(e.message));
        p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
        p.on('dialog', d => { errors.push('dialogue natif : ' + d.message()); d.dismiss(); });
    };
    const shot = async (p, name, sel = null) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const el = sel ? await p.$(sel) : null; await (el || p).screenshot({ path: path.join(SHOTS, name) }); };
    const open = async (p, mode = 'diagram', extra = {}) => {
        await p.goto(base);
        await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_SIDE_FOLDERS && window.LCNDA_EXT?.diagramItems && window.LCNDA_EXT?.customStatItems, null, { timeout: 20000 });
        await p.evaluate(([mode, extra]) => { const A = window.LCNDA_APP; Object.assign(A.state, { graphMode: mode, graphTab: 'types' }, extra); A.setModule('graphiques'); }, [mode, extra]);
        await p.waitForFunction(() => document.querySelectorAll('#sidebar-content [data-sf-kind="diagram"] [data-sf-item]').length >= 6, null, { timeout: 15000 });
        await p.evaluate(() => { const c = document.getElementById('sidebar-content'); c.scrollTop = c.scrollHeight; });
    };
    const data = (p, kind = 'diagram') => p.evaluate(k => window.LCNDA_SIDE_FOLDERS.read(k), kind);
    const raw = p => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
    const fid = async (p, name, kind = 'diagram') => (await data(p, kind)).folders.find(f => f.name === name)?.id;
    const ask = async (p, value) => { await p.waitForSelector('dialog.ask-text-dialog[open] input'); await p.fill('dialog.ask-text-dialog[open] input', value); await p.click('dialog.ask-text-dialog[open] [data-ask-ok]'); await p.waitForSelector('dialog.ask-text-dialog', { state: 'detached' }); };
    const newFolder = async (p, name, kind = 'diagram') => { await p.click(`#sidebar-content [data-sf-add="${kind}"]`); await ask(p, name); await p.waitForFunction(([n, k]) => window.LCNDA_SIDE_FOLDERS.read(k).folders.some(f => f.name === n), [name, kind]); };
    const head = id => `#sidebar-content [data-sf-toggle="${id}"]`;
    const itemSel = id => `#sidebar-content [data-sf-kind="diagram"] [data-sf-item="${id}"]`;
    const center = async (p, sel, where = 'center') => {
        const b = await p.locator(sel).boundingBox();
        if (!b) throw new Error('invisible : ' + sel + ' ' + await p.$eval(sel, e => JSON.stringify(e.getBoundingClientRect())).catch(x => x.message));
        return { x: b.x + b.width / 2, y: where === 'before' ? b.y + 2 : where === 'after' ? b.y + b.height - 2 : b.y + b.height / 2 };
    };
    const hideToasts = async p => { await p.evaluate(() => document.querySelectorAll('.ui-toast').forEach(x => x.close ? x.close() : x.remove())); await p.waitForTimeout(220); };
    const drag = async (p, from, to, where = 'center') => {
        await hideToasts(p); // les messages (en bas à gauche) passent par-dessus le bas de la colonne
        await p.$eval(to, el => el.scrollIntoView({ block: 'center' })); await p.$eval(from, el => el.scrollIntoView({ block: 'nearest' }));
        const a = await center(p, from), b = await center(p, to, where);
        await p.mouse.move(a.x, a.y); await p.mouse.down();
        await p.mouse.move(a.x + 8, a.y + 8, { steps: 2 });
        await p.mouse.move(b.x, b.y, { steps: 10 });
        await p.waitForTimeout(60);
        await p.mouse.up();
        await p.waitForTimeout(150);
    };
    const lastToast = p => p.evaluate(() => [...document.querySelectorAll('.ui-toast:not(.is-leaving) .ui-toast-text')].map(e => e.textContent).pop() || '');
    const clickUndo = async p => { await p.locator('.ui-toast:not(.is-leaving) .ui-toast-btn', { hasText: '↶ Annuler' }).last().click(); await p.waitForTimeout(150); };

    let ctx = null, p = null;
    try {
        ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        p = await ctx.newPage(); watch(p);
        await open(p);

        let fAss = '', fMus = '', fTrap = '';
        await t('créer : « ＋ 📁 Dossier » demande un nom (askText), le dossier apparaît avec « ↶ Annuler »', async () => {
            assert.ok(await p.$('#sidebar-content [data-sf-add="diagram"]'));
            assert.ok(await p.$('#sidebar-content [data-sf-add="graph"]'));
            await newFolder(p, 'Assemblées'); fAss = await fid(p, 'Assemblées');
            assert.match(fAss, /^f_[a-z0-9]{1,16}$/);
            assert.match(await lastToast(p), /Dossier « Assemblées » créé/);
            assert.ok(await p.$('.ui-toast .ui-toast-btn >> text=↶ Annuler'));
            await newFolder(p, 'Musique'); fMus = await fid(p, 'Musique');
            await newFolder(p, TRAP); fTrap = await fid(p, TRAP);
            assert.equal(await p.$eval(head(fTrap) + ' .sf-name', e => e.textContent), TRAP);
            assert.equal(await p.$$eval('#sidebar-content .sf img', e => e.length), 0);
            // l'ordre : dossiers d'abord, éléments sans dossier en bas, au-dessus de « Créer un diagramme »
            const order = await p.$$eval('#sidebar-content [data-sf-kind="diagram"] > *', els => els.map(e => e.matches('.sf') ? 'dossier' : e.matches('[data-sf-loose]') ? 'sans' : e.matches('[data-open-diagram-new]') ? 'créer' : '?'));
            assert.deepEqual(order, ['dossier', 'dossier', 'dossier', 'sans', 'créer']);
        });
        await t('ranger en glissant : un diagramme sur un dossier (il s’allume), les numéros D restent', async () => {
            await drag(p, itemSel(dg[0]), head(fAss));
            assert.equal((await data(p)).of[String(dg[0])], fAss);
            assert.match(await lastToast(p), /rangé dans « Assemblées »/);
            assert.ok(await p.$(`#sidebar-content [data-sf-folder="${fAss}"] > .sf-body [data-sf-item="${dg[0]}"]`));
            assert.equal(await p.$eval(itemSel(dg[0]) + ' .side-number', e => e.textContent), 'D1');
            assert.equal(await p.$eval(itemSel(dg[5]) + ' .side-number', e => e.textContent), 'D6');
            await drag(p, itemSel(dg[1]), head(fAss));
            assert.equal(await p.$eval(head(fAss) + ' .sf-count', e => e.textContent), '2');
            // le dossier s'allume pendant le glisser
            await hideToasts(p);
            for (const sel of [head(fMus), itemSel(dg[2])]) await p.$eval(sel, el => el.scrollIntoView({ block: 'nearest' }));
            const a = await center(p, itemSel(dg[2])), b = await center(p, head(fMus));
            await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(a.x + 8, a.y + 8, { steps: 2 }); await p.mouse.move(b.x, b.y, { steps: 8 });
            assert.ok(await p.$(head(fMus) + '.is-sf-drop'));
            await shot(p, 'B-glisser.png', '#sidebar');
            await p.keyboard.press('Escape'); await p.mouse.up();
            assert.equal((await data(p)).of[String(dg[2])], undefined, 'Échap : rien ne change');
        });
        await t('ouvrir / fermer : clic, Entrée, Espace ; retenu après rechargement', async () => {
            await p.click(head(fAss));
            assert.equal(await p.$eval(head(fAss), e => e.getAttribute('aria-expanded')), 'false');
            assert.ok((await data(p)).closed.includes(fAss));
            await p.reload(); await open(p, 'ancestors');
            assert.equal(await p.$eval(head(fAss), e => e.getAttribute('aria-expanded')), 'false');
            assert.equal(await p.$eval(`#sidebar-content [data-sf-folder="${fAss}"] > .sf-body`, e => e.hidden), true);
            await p.focus(head(fAss)); await p.keyboard.press('Enter');
            await p.waitForFunction(s => document.querySelector(s)?.getAttribute('aria-expanded') === 'true', head(fAss));
            await p.focus(head(fAss)); await p.keyboard.press(' ');
            await p.waitForFunction(s => document.querySelector(s)?.getAttribute('aria-expanded') === 'false', head(fAss));
        });
        await t('le dossier de l’élément affiché s’ouvre tout seul', async () => {
            await p.evaluate(id => { const A = window.LCNDA_APP; A.state.graphMode = 'diagram'; A.state.graphDiagramId = id; A.renderSidebar(); }, dg[0]);
            assert.equal(await p.$eval(head(fAss), e => e.getAttribute('aria-expanded')), 'true');
            assert.ok(await p.$(itemSel(dg[0]) + '.is-active'));
            await shot(p, 'A-dossiers.png', '#sidebar');
        });
        let fSub = '';
        await t('« 📁 Ranger » sur la page d’un diagramme : lignes radio, « ＋ Nouveau dossier… » dans le dossier coché', async () => {
            await p.evaluate(id => { const A = window.LCNDA_APP; A.state.graphMode = 'diagram'; A.state.graphDiagramId = id; A.setModule('graphiques'); }, dg[2]);
            await p.waitForSelector('#workspace [data-sf-range="diagram"]');
            const acts = await p.$$eval('#workspace .page-actions button', bs => bs.map(b => b.textContent.trim()));
            assert.ok(acts.indexOf('📁 Ranger') === acts.indexOf('⧉ Dupliquer') + 1, acts.join(' | '));
            await p.click('#workspace [data-sf-range="diagram"]');
            await p.waitForSelector('dialog.sf-range-dialog[open]');
            assert.match(await p.$eval('dialog.sf-range-dialog h2', e => e.textContent), /Ranger « Sénat 1900 »/);
            const opts = await p.$$eval('dialog.sf-range-dialog .sf-opt', ls => ls.map(l => l.textContent.trim()));
            assert.deepEqual(opts, ['Sans dossier', '📁 Assemblées', '📁 Musique', '📁 ' + TRAP]);
            assert.equal(await p.$$eval('dialog.sf-range-dialog img', e => e.length), 0);
            await p.check(`dialog.sf-range-dialog input[value="${fAss}"]`);
            await shot(p, 'C-ranger.png', 'dialog.sf-range-dialog');
            await p.click('dialog.sf-range-dialog [data-sf-new]'); await ask(p, 'Conseils');
            const sub = await p.$eval('dialog.sf-range-dialog input:checked', e => e.value);
            assert.equal(await p.$eval('dialog.sf-range-dialog input:checked', e => getComputedStyle(e.closest('.sf-opt')).getPropertyValue('--sf-depth').trim()), '1');
            assert.equal((await data(p)).folders.some(f => f.id === sub), false, 'pas encore enregistré');
            await p.click('dialog.sf-range-dialog [data-sf-ok]');
            const d = await data(p); fSub = sub;
            assert.equal(d.folders.find(f => f.id === sub)?.parent, fAss);
            assert.equal(d.of[String(dg[2])], sub);
            assert.match(await lastToast(p), /« Sénat 1900 » rangé dans « Conseils »/);
            // Annuler dans la fenêtre : rien ne change (et le nouveau dossier n'est pas gardé)
            await p.click('#workspace [data-sf-range="diagram"]');
            await p.click('dialog.sf-range-dialog [data-sf-new]'); await ask(p, 'Jamais gardé');
            await p.click('dialog.sf-range-dialog .button.secondary[data-sf-cancel]');
            assert.equal((await data(p)).folders.some(f => f.name === 'Jamais gardé'), false);
        });
        await t('« 📁 Ranger » sur la page d’un de mes graphiques, et ses dossiers à part', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.graphMode = 'stats'; A.state.graphStatsType = 'cw_dos00002'; A.setModule('graphiques'); });
            await p.waitForSelector('#workspace [data-sf-range="graph"]');
            await p.click('#workspace [data-sf-range="graph"]');
            await p.waitForSelector('dialog.sf-range-dialog[open]');
            assert.deepEqual(await p.$$eval('dialog.sf-range-dialog .sf-opt', ls => ls.map(l => l.textContent.trim())), ['Sans dossier']);
            await p.click('dialog.sf-range-dialog [data-sf-new]'); await ask(p, 'Population');
            await p.click('dialog.sf-range-dialog [data-sf-ok]');
            const g = await data(p, 'graph');
            assert.equal(g.of.cw_dos00002, g.folders[0].id);
            await p.waitForSelector(`#sidebar-content [data-sf-kind="graph"] [data-sf-folder="${g.folders[0].id}"] [data-side-value="stats:cw_dos00002"]`);
            assert.equal(await p.$eval('#sidebar-content [data-side-value="stats:cw_dos00002"] .side-number', e => e.textContent), 'M2');
            // pas de glisser pour « Mes graphiques »
            assert.equal(await p.$$eval('#sidebar-content [data-sf-kind="graph"].sf-can-drag', e => e.length), 0);
        });
        await t('sous-dossier en glissant un dossier sur un autre ; ordre en le glissant entre deux', async () => {
            await open(p, 'ancestors');
            await drag(p, head(fMus), head(fAss));
            assert.equal((await data(p)).folders.find(f => f.id === fMus).parent, fAss);
            assert.match(await lastToast(p), /Dossier « Musique » rangé dans « Assemblées »/);
            // entre deux dossiers du premier niveau : l'ordre change (le piégé passe avant Assemblées)
            await drag(p, head(fTrap), head(fAss), 'before');
            const top = (await data(p)).folders.filter(f => !f.parent).map(f => f.id);
            assert.deepEqual(top, [fTrap, fAss]);
            assert.match(await lastToast(p), /déplacé/);
            await shot(p, 'D-sous-dossiers.png', '#sidebar');
        });
        await t('boucle refusée : un dossier ne va pas dans lui-même ni dans un de ses sous-dossiers', async () => {
            const before = JSON.stringify(await data(p));
            await drag(p, head(fAss), head(fSub));
            assert.match(await lastToast(p), /propres sous-dossiers/);
            assert.equal(JSON.stringify(await data(p)), before);
            assert.match(await p.evaluate(([a]) => window.LCNDA_SIDE_FOLDERS.moveFolderError(window.LCNDA_SIDE_FOLDERS.read('diagram'), a, a), [fAss]), /lui-même/);
        });
        await t('trois niveaux au plus (glisser, nouveau dossier, et rangement forgé)', async () => {
            // Assemblées > Musique > Fond : 3 niveaux, permis
            await newFolder(p, 'Fond'); const fFond = await fid(p, 'Fond');
            await drag(p, head(fFond), head(fMus));
            assert.equal((await data(p)).folders.find(f => f.id === fFond).parent, fMus);
            // un 4e niveau : refusé
            await newFolder(p, 'Trop'); const fTrop = await fid(p, 'Trop');
            await drag(p, head(fTrop), head(fFond));
            assert.match(await lastToast(p), /Trois niveaux/);
            assert.equal((await data(p)).folders.find(f => f.id === fTrop).parent, null);
            // un dossier qui a des sous-dossiers ne descend pas trop bas : Musique (2 niveaux) dans Conseils (niveau 2) → 4
            await drag(p, head(fMus), head(fSub));
            assert.match(await lastToast(p), /Trois niveaux/);
            // « ＋ Nouveau dossier… » dans un dossier du 3e niveau : refusé
            await p.evaluate(id => { const A = window.LCNDA_APP; A.state.graphMode = 'diagram'; A.state.graphDiagramId = id; A.setModule('graphiques'); }, dg[4]);
            await p.click('#workspace [data-sf-range="diagram"]');
            await p.check(`dialog.sf-range-dialog input[value="${fFond}"]`);
            assert.equal(await p.$eval(`dialog.sf-range-dialog input[value="${fFond}"]`, e => getComputedStyle(e.closest('.sf-opt')).getPropertyValue('--sf-depth').trim()), '2');
            await p.click('dialog.sf-range-dialog [data-sf-new]');
            assert.equal(await p.$('dialog.ask-text-dialog[open]'), null);
            assert.match(await lastToast(p), /Trois niveaux/);
            await p.click('dialog.sf-range-dialog .button.secondary[data-sf-cancel]');
            await open(p, 'ancestors');
            // forgé : 5 niveaux, une boucle → remis à 3 niveaux, sans boucle
            const cleaned = await p.evaluate(() => window.LCNDA_SIDE_FOLDERS.clean({ folders: [{ id: 'f_a', name: 'a' }, { id: 'f_b', name: 'b', parent: 'f_a' }, { id: 'f_c', name: 'c', parent: 'f_b' }, { id: 'f_d', name: 'd', parent: 'f_c' }, { id: 'f_e', name: 'e', parent: 'f_d' }, { id: 'f_x', name: 'x', parent: 'f_y' }, { id: 'f_y', name: 'y', parent: 'f_x' }] }, 'diagram'));
            const depth = id => { let d = 0, f = cleaned.folders.find(x => x.id === id); while (f) { d++; f = cleaned.folders.find(x => x.id === f.parent); } return d; };
            assert.ok(cleaned.folders.every(f => depth(f.id) <= 3), JSON.stringify(cleaned.folders));
            assert.ok(cleaned.folders.filter(f => ['f_x', 'f_y'].includes(f.id)).some(f => f.parent === null));
        });
        await t('sortir d’un dossier : glisser hors des dossiers', async () => {
            if (await p.$eval(head(fAss), e => e.getAttribute('aria-expanded')) !== 'true') await p.click(head(fAss));
            await drag(p, itemSel(dg[1]), '#sidebar-content [data-sf-kind="diagram"] [data-open-diagram-new]');
            assert.equal((await data(p)).of[String(dg[1])], undefined);
            assert.match(await lastToast(p), /sorti des dossiers/);
            assert.ok(await p.$(`#sidebar-content [data-sf-loose] [data-sf-item="${dg[1]}"]`));
        });
        await t('supprimer un dossier : son contenu remonte d’un niveau, rien n’est supprimé, « ↶ Annuler » le remet', async () => {
            await hideToasts(p);
            const before = await data(p);
            await p.hover(head(fAss));
            assert.notEqual(await p.$eval(head(fAss) + ' .sf-tools', e => getComputedStyle(e).display), 'none', '✎ et 🗑 au survol');
            await p.mouse.move(5, 5);
            assert.equal(await p.$eval(head(fAss) + ' .sf-tools', e => getComputedStyle(e).display), 'none', 'cachés sans survol');
            await p.hover(head(fAss));
            await p.click(`#sidebar-content [data-sf-del="${fAss}"]`);
            assert.equal(await p.$('dialog.confirm-box-dialog[open]'), null, 'pas de question avant (H7)');
            const d = await data(p);
            assert.equal(d.folders.some(f => f.id === fAss), false);
            assert.equal(d.folders.find(f => f.id === fMus).parent, null);
            assert.equal(d.folders.find(f => f.id === fSub).parent, null);
            assert.equal(d.of[String(dg[0])], undefined, 'D1 remonte au premier niveau (sans dossier)');
            assert.equal(d.of[String(dg[2])], fSub);
            assert.match(await lastToast(p), /supprimé : son contenu remonte d’un niveau/);
            assert.equal(await p.$$eval('#sidebar-content [data-sf-kind="diagram"] [data-sf-item]', e => e.length), 6);
            await clickUndo(p);
            assert.deepEqual(await data(p), before);
            assert.ok(await p.$(head(fAss)));
            assert.match(await lastToast(p), /Annulé/);
        });
        await t('renommer (✎) : nom piégé affiché tel quel, borné à 60 caractères', async () => {
            await p.hover(head(fMus)); await p.click(`#sidebar-content [data-sf-rename="${fMus}"]`);
            await ask(p, TRAP + 'x'.repeat(100));
            const n = (await data(p)).folders.find(f => f.id === fMus).name;
            assert.equal(n.length, 60); assert.ok(n.startsWith(TRAP));
            assert.equal(await p.$$eval('#sidebar-content .sf img, #sidebar-content .sf [onerror]', e => e.length), 0);
            assert.equal(await p.evaluate(() => window.__xss), undefined);
            await clickUndo(p);
            assert.equal((await data(p)).folders.find(f => f.id === fMus).name, 'Musique');
        });
        await t('rangement forgé : nettoyé à la lecture (ids, noms, parents, 200 dossiers, éléments absents)', async () => {
            const keep = await p.evaluate(k => localStorage.getItem(k), KEY);
            const r = await p.evaluate(([k, trap]) => {
                const folders = [{ id: 'f_ok1', name: trap + 'y'.repeat(200), parent: null }, { id: '../x', name: 'mauvais id' }, { id: 'F_MAJ', name: 'majuscules' }, { id: 'f_ok1', name: 'doublon' }, { id: 'f_ok2', name: { a: 1 }, parent: 'f_absent' }, { id: 'f_ok3', name: 'lui-même', parent: 'f_ok3' }, null, 'texte'];
                for (let i = 0; i < 300; i++) folders.push({ id: 'f_n' + i, name: 'n' + i });
                localStorage.setItem(k, JSON.stringify({ diagram: { folders, of: { '1': 'f_ok1', '999999': 'f_ok1', 'abc': 'f_ok1', '2': 'f_absent', '3': 42 }, closed: ['f_ok1', 'f_absent', 7] }, graph: 'pas un objet', evil: { x: 1 } }));
                const d = window.LCNDA_SIDE_FOLDERS.read('diagram'), g = window.LCNDA_SIDE_FOLDERS.read('graph');
                window.LCNDA_APP.renderSidebar();
                return { d, g, items: document.querySelectorAll('#sidebar-content [data-sf-kind="diagram"] [data-sf-item]').length };
            }, [KEY, TRAP]);
            assert.equal(r.d.folders.length, 200);
            assert.ok(r.d.folders.every(f => /^f_[a-z0-9]{1,16}$/.test(f.id)));
            assert.equal(new Set(r.d.folders.map(f => f.id)).size, 200);
            assert.equal(r.d.folders[0].name.length, 60);
            assert.equal(r.d.folders.find(f => f.id === 'f_ok2').name, 'Dossier');
            assert.equal(r.d.folders.find(f => f.id === 'f_ok2').parent, null);
            assert.equal(r.d.folders.find(f => f.id === 'f_ok3').parent, null);
            assert.deepEqual(Object.keys(r.d.of).sort(), ['1', '999999']);
            assert.deepEqual(r.d.closed, ['f_ok1']);
            assert.deepEqual(r.g, { folders: [], of: {}, closed: [] });
            assert.equal(r.items, 6, 'une entrée vers un diagramme absent est ignorée');
            assert.equal(await p.$$eval('#sidebar-content .sf img', e => e.length), 0);
            // à l'écriture suivante, l'entrée vers un élément supprimé part
            assert.equal((await raw(p)).diagram.of['999999'], undefined);
            await p.evaluate(([k, v]) => { localStorage.setItem(k, v); window.LCNDA_APP.renderSidebar(); }, [KEY, keep]);
        });
        await t('la clé suit la base : un autre navigateur (sans rien en local) retrouve les dossiers', async () => {
            const mine = await data(p), mineG = await data(p, 'graph');
            await p.waitForTimeout(1600); // les réglages partent vers la base ~1 s après
            assert.ok(await p.evaluate(() => typeof window.LCNDA_SETTINGS === 'object'));
            const other = await browser.newContext({ viewport: { width: 1280, height: 900 } });
            const q = await other.newPage(); watch(q);
            await open(q, 'ancestors');
            assert.deepEqual(await data(q), mine);
            assert.deepEqual(await data(q, 'graph'), mineG);
            assert.ok(await q.$(head(fAss)));
            await other.close();
            // et dans les réglages par défaut du site (Apparence)
            assert.ok(fs.readFileSync(path.join(appRoot, 'assets/js/app.js'), 'utf8').includes(`'${KEY}'`));
            assert.ok(fs.readFileSync(path.join(appRoot, 'api.php'), 'utf8').includes(`'${KEY}'`));
        });
        await t('mode sombre : les dossiers suivent le thème', async () => {
            const design = await p.evaluate(() => localStorage.getItem('genealogie-design'));
            await p.evaluate(() => { localStorage.setItem('genealogie-design', JSON.stringify({ preset: 'dark' })); window.LCNDA_APP.applyDesign(); });
            const bg = await p.$eval(head(fAss), e => getComputedStyle(e).backgroundColor);
            const m = bg.match(/\d+/g).map(Number); assert.ok(m[0] < 90 && m[1] < 90 && m[2] < 90, bg);
            await shot(p, 'E-sombre.png', '#sidebar');
            await p.evaluate(v => { if (v === null) localStorage.removeItem('genealogie-design'); else localStorage.setItem('genealogie-design', v); window.LCNDA_APP.applyDesign(); }, design);
        });
        await ctx.close(); ctx = null;

        await t('390 px : rien ne déborde, la fenêtre « Ranger » tient dans l’écran', async () => {
            const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
            const m = await c.newPage(); watch(m);
            await open(m, 'diagram', { graphDiagramId: dg[2] });
            await m.evaluate(() => { document.getElementById('app')?.classList.remove('sidebar-collapsed'); });
            await m.waitForTimeout(300);
            const w = await m.evaluate(() => ({ doc: document.documentElement.scrollWidth, side: (() => { const s = document.getElementById('sidebar-content'); return s.scrollWidth - s.clientWidth; })(),
                heads: [...document.querySelectorAll('#sidebar-content .sf-head')].filter(h => h.offsetParent).map(h => h.scrollWidth - h.clientWidth) }));
            assert.ok(w.doc <= 390, JSON.stringify(w)); assert.ok(w.side <= 0, JSON.stringify(w)); assert.ok(w.heads.every(x => x <= 0), JSON.stringify(w));
            await shot(m, 'F-390-colonne.png');
            await m.waitForSelector('#workspace [data-sf-range="diagram"]', { state: 'attached' });
            await m.evaluate(() => document.querySelector('#workspace [data-sf-range="diagram"]').click());
            await m.waitForSelector('dialog.sf-range-dialog[open]');
            const box = await m.$eval('dialog.sf-range-dialog', d => { const r = d.getBoundingClientRect(); return { l: r.left, r: r.right, sw: d.scrollWidth - d.clientWidth }; });
            assert.ok(box.l >= 0 && box.r <= 390 && box.sw <= 0, JSON.stringify(box));
            await shot(m, 'F-390-ranger.png');
            await c.close();
        });
        await t('mode consultation : on voit et on ouvre les dossiers, mais rien à créer, ranger, renommer ni supprimer', async () => {
            fs.writeFileSync(path.join(dir, 'consultation.json'), JSON.stringify({ hash: '$2y$10$abcdefghijklmnopqrstuuWzGmJ1kGQ5JvH4sCq3zN6E1i0YqM6xG', since: 'x' }));
            const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
            const k = await c.newPage(); watch(k);
            try {
                await open(k, 'ancestors');
                await k.waitForFunction(() => document.body.classList.contains('is-kiosk'), null, { timeout: 10000 });
                await k.evaluate(() => window.LCNDA_APP.renderSidebar());
                assert.ok(await k.$(head(fAss)));
                assert.equal(await k.isVisible('#sidebar-content [data-sf-add="diagram"]'), false);
                await k.hover(head(fAss));
                assert.equal(await k.isVisible(`#sidebar-content [data-sf-del="${fAss}"]`), false);
                const was = await k.$eval(head(fAss), e => e.getAttribute('aria-expanded'));
                await k.click(head(fAss));
                assert.notEqual(await k.$eval(head(fAss), e => e.getAttribute('aria-expanded')), was, 'on peut ouvrir / fermer');
                if (await k.$eval(head(fAss), e => e.getAttribute('aria-expanded')) !== 'true') await k.click(head(fAss));
                const before = JSON.stringify({ ...(await data(k)), closed: [] });
                await drag(k, itemSel(dg[1]), head(fAss));
                assert.equal(JSON.stringify({ ...(await data(k)), closed: [] }), before, 'glisser ne range rien');
                await k.evaluate(id => { const A = window.LCNDA_APP; A.state.graphMode = 'diagram'; A.state.graphDiagramId = id; A.setModule('graphiques'); }, dg[2]);
                await k.waitForSelector('#workspace .h-dg-page');
                assert.equal(await k.isVisible('#workspace [data-sf-range]'), false);
                await k.evaluate(id => window.LCNDA_SIDE_FOLDERS.openRange('diagram', id, 'x'), dg[2]);
                assert.equal(await k.$('dialog.sf-range-dialog'), null);
            } finally { fs.unlinkSync(path.join(dir, 'consultation.json')); await c.close(); }
        });
        await t('aucune erreur JavaScript, aucun dialogue natif', async () => {
            assert.equal(await (async () => errors.filter(e => !/423|Locked|consultation/i.test(e)))().then(x => x.length), 0, errors.join('\n'));
        });
    } finally {
        if (ctx) await ctx.close().catch(() => {});
        await browser.close(); proc.kill();
    }
    process.exit(failed ? 1 : 0);
})();
