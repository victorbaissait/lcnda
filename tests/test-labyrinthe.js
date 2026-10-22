'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test du 🌀 Labyrinthe (outil Jeu : assets/js/app-labyrinthe-core.js, app-labyrinthe.js) :
 *     node tests/test-labyrinthe.js
 * 1. Le moteur (Node) : chaque forme × chaque algorithme — toutes les cases atteignables, une solution qui suit les
 *    passages, même graine = même labyrinthe, étapes sur des cases atteignables, distinctes, ni au départ ni à l'arrivée.
 * 2. Dans le navigateur (vrai « php -S », petite généalogie) : préparation, étapes tirées de la base sans vivant ni fiche
 *    confidentielle, ordre « remonte ta lignée », partie jouée au clavier jusqu'à la sortie (aucun POST), carte « Trouvé ! »,
 *    sortie fermée tant qu'il reste des étapes, pause, indice, Imprimer, ⤓ Exporter ▾, course à deux, brouillard, rond,
 *    390 px, mode sombre, aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');
const L = require(path.join(appRoot, 'assets/js/app-labyrinthe-core.js'));
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + (e.stack || e).toString().split('\n').slice(0, 6).join('\n    ')); } };

(async () => {
    console.log('Moteur');
    await t('chaque forme × chaque algorithme : tout est atteignable, la solution suit les passages', () => {
        for (const shape of L.SHAPES) for (const algo of L.ALGO_NAMES) for (const loops of [0, 25]) {
            const m = L.generate({seed: 'T1', shape, algo, loops, w: 22, h: 18, rings: 9, ends: 'loin'});
            const {dist} = L.bfs(m.links, m.start);
            assert.ok(m.cells.length > 30, `${shape} ${algo} : assez de cases`);
            assert.equal([...dist].filter(d => d < 0).length, 0, `${shape} ${algo} : une case n'est pas atteignable`);
            assert.ok(m.solution.length > 1 && m.solution[0] === m.start && m.solution.at(-1) === m.end, `${shape} ${algo} : solution`);
            for (let i = 1; i < m.solution.length; i++) assert.ok(m.links[m.solution[i - 1]].includes(m.solution[i]), `${shape} ${algo} : la solution traverse un mur`);
            m.links.forEach((l, a) => l.forEach(b => assert.ok(m.links[b].includes(a), 'passages symétriques')));
            if (!loops) assert.equal(m.links.reduce((s, l) => s + l.length, 0) / 2, m.cells.length - 1, `${shape} ${algo} : un labyrinthe parfait a n − 1 passages`);
        }
    });
    await t('même graine = même labyrinthe ; autre graine = autre labyrinthe', () => {
        const a = L.generate({seed: 'ABC', shape: 'hex', algo: 'wilson', w: 15, h: 12}), b = L.generate({seed: 'ABC', shape: 'hex', algo: 'wilson', w: 15, h: 12}), c = L.generate({seed: 'ABD', shape: 'hex', algo: 'wilson', w: 15, h: 12});
        assert.deepEqual(a.links, b.links); assert.equal(a.start, b.start); assert.equal(a.end, b.end);
        assert.notDeepEqual(a.links, c.links);
    });
    await t('boucles : plus de passages, toujours d’un seul tenant', () => {
        const a = L.generate({seed: 'B', algo: 'prim', w: 20, h: 20, loops: 0}), b = L.generate({seed: 'B', algo: 'prim', w: 20, h: 20, loops: 30});
        assert.ok(b.links.reduce((s, l) => s + l.length, 0) > a.links.reduce((s, l) => s + l.length, 0));
    });
    await t('étapes : distinctes, atteignables, ni au départ ni à l’arrivée ; même graine = mêmes places', () => {
        for (const shape of ['square', 'round', 'heart', 'france']) {
            const m = L.generate({seed: 'S', shape, w: 20, h: 20, rings: 8}), st = L.placeStages(m, 12, 'x');
            assert.equal(st.length, 12); assert.equal(new Set(st).size, 12);
            assert.ok(!st.includes(m.start) && !st.includes(m.end));
            const {dist} = L.bfs(m.links, m.start); st.forEach(c => assert.ok(dist[c] > 0));
            assert.deepEqual(L.placeStages(m, 12, 'x'), st);
            const r = L.route(m, [m.start, ...L.greedyOrder(m, m.start, st), m.end]);
            st.forEach(c => assert.ok(r.includes(c), 'le chemin complet passe par toutes les étapes'));
        }
    });
    await t('dessin SVG : un seul mur par côté, des portes au départ et à l’arrivée, texte échappé', () => {
        const m = L.generate({seed: 'D', w: 6, h: 6});
        const svg = L.toSvg(m, {style: 'parchemin', title: '<b>x</b>', solution: m.solution});
        assert.match(svg, /^<svg xmlns/); assert.ok(!svg.includes('<b>x</b>')); assert.match(svg, /lb-rough/);
        const segs = (L.wallsD(m).match(/M/g) || []).length; let closed = 0, border = 0;
        m.cells.forEach(c => c.sides.forEach(s => { if (s.nb < 0) border++; else if (c.id < s.nb && !m.links[c.id].includes(s.nb)) closed++; }));
        assert.equal(segs, closed + border - 2, 'murs intérieurs fermés + bord, moins les deux portes');
    });

    // ───── navigateur ─────
    let pw; try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch (_) { try { pw = require('playwright'); } catch (__) { pw = null; } }
    if (!pw) { console.log('  (navigateur absent : partie navigateur sautée)'); return done(); }
    const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
    const phpPath = findPhp([devBundledPhp()]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-laby-'));
    const env = {...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $d = db();
$per = function($f, $l, $g, $st, $priv = 0, $start = 0) use ($d) { $d->prepare("INSERT INTO persons(first_name,last_name,gender,living_status,is_private,is_start) VALUES(?,?,?,?,?,?)")->execute([$f, $l, $g, $st, $priv, $start]); return (int) $d->lastInsertId(); };
$pl = function($n) use ($d) { $d->prepare("INSERT INTO places(name) VALUES(?)")->execute([$n]); return (int) $d->lastInsertId(); };
$ev = function($pid, $tag, $y, $place) use ($d) { $d->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES('person',?,(SELECT id FROM event_types WHERE gedcom_tag=? LIMIT 1),?,?,?)")->execute([$pid, $tag, (string) $y, $y, $place]); };
$fam = function($a, $b, $kids, $y = null, $place = null) use ($d) { $d->prepare("INSERT INTO families(partner1_id,partner2_id) VALUES(?,?)")->execute([$a, $b]); $f = (int) $d->lastInsertId(); foreach ($kids as $k) $d->prepare("INSERT INTO family_children(family_id,child_id) VALUES(?,?)")->execute([$f, $k]);
  if ($y) $d->prepare("INSERT INTO events(scope,family_id,event_type_id,date_text,year,place_id) VALUES('family',?,(SELECT id FROM event_types WHERE gedcom_tag='MARR' LIMIT 1),?,?,?)")->execute([$f, (string) $y, $y, $place]); return $f; };
$tulle = $pl('Tulle'); $aur = $pl('Aurillac'); $brive = $pl('Brive-la-Gaillarde'); $secret = $pl('Lieu-Secret');
$paul = $per('Paul', 'Vivant', 'male', 'living', 0, 1); $ev($paul, 'BIRT', 1990, $tulle);
$jean = $per('Jean', 'Martin', 'male', 'deceased'); $ev($jean, 'BIRT', 1920, $tulle); $ev($jean, 'DEAT', 1990, $tulle);
$marie = $per('Marie', 'Durand', 'female', 'deceased'); $ev($marie, 'BIRT', 1925, $aur); $ev($marie, 'DEAT', 1999, $aur);
$pierre = $per('Pierre', 'Martin', 'male', 'deceased'); $ev($pierre, 'BIRT', 1890, $brive); $ev($pierre, 'DEAT', 1960, $brive);
$anne = $per('Anne', 'Roux', 'female', 'deceased'); $ev($anne, 'BIRT', 1895, $brive);
$cache = $per('Cachée', 'Confidentielle', 'female', 'deceased', 1); $ev($cache, 'BIRT', 1897, $secret);
$fam($jean, $marie, [$paul], 1950, $tulle); $fam($pierre, $anne, [$jean], 1918, $brive); $fam(null, $cache, [$marie]);
echo 'ok';`], {cwd: appRoot, encoding: 'utf8', env});
    if (!/ok$/.test((r.stdout || '').trim())) { console.error(r.stderr || r.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], {cwd: appRoot, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const shots = process.env.SHOTS || '';
    const browser = await pw.chromium.launch();
    const errors = [], posts = [];
    const open = async (width = 1440, dark = false) => {
        const ctx = await browser.newContext({viewport: {width, height: 950}, colorScheme: dark ? 'dark' : 'light'});
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, rt => rt.abort());
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(String(e.message)));
        page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push(m.text()); });
        page.on('request', q => { if (!/^(GET|HEAD)$/.test(q.method())) posts.push(q.method() + ' ' + q.url()); });
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_LABY && window.LCNDA_APP.setModule, null, {timeout: 30000});
        if (dark) await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
        return page;
    };
    /** une préparation à partir de réglages, puis « ▶ Démarrer la partie » */
    const newGame = async (page, cfg) => {
        await page.evaluate(c => { localStorage.setItem('lcnda-laby-prefs-v1', JSON.stringify(c)); localStorage.setItem('genealogie-goose-active-v1', ''); window.LCNDA_LABY.resetSetup(); }, cfg);
        await page.evaluate(async () => { await window.LCNDA_APP.setModule('dashboard'); await window.LCNDA_APP.setModule('jeu'); });
        await page.waitForSelector('select[name=variant]');
        await page.evaluate(() => { const s = document.querySelector('select[name=variant]'); if (s.value !== 'laby') { s.value = 'laby'; s.dispatchEvent(new Event('change', {bubbles: true})); } });
        await page.waitForSelector('#lb-setup-form [data-lb-pv] svg');
        await page.click('button.lb-start');
        await page.waitForFunction(() => window.LCNDA_LABY.debug() || document.querySelector('[data-lb-sterr] .ui-notice, [data-lb-sterr] p'), null, {timeout: 15000});
    };
    const keyFor = nb => (Math.abs(nb.dx) > Math.abs(nb.dy) ? (nb.dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (nb.dy > 0 ? 'ArrowDown' : 'ArrowUp'));
    /** suit la solution au clavier ; stopAt(debug) arrête avant la fin */
    const play = async (page, stopAt = null, max = 3000) => {
        await page.focus('[data-lb-board]');
        for (let k = 0; k < max; k++) {
            const d = await page.evaluate(() => window.LCNDA_LABY.debug()); if (!d || d.finished || (stopAt && stopAt(d))) return d;
            const pos = d.players.find(p => !p.done)?.pos, next = d.solution[1]; if (next == null) return d;
            const nb = (await page.evaluate(id => window.LCNDA_LABY.debug().neighbors(id), pos)).find(n => n.id === next);
            await page.keyboard.press(keyFor(nb));
        }
        return page.evaluate(() => window.LCNDA_LABY.debug());
    };
    try {
        console.log('Navigateur');
        const page = await open();
        await t('la page Jeu propose « 🌀 Labyrinthe » ; préparation avec aperçu, Ensembles prêts et 💾 Réglages enregistrés', async () => {
            await page.evaluate(async () => { await window.LCNDA_APP.setModule('jeu'); });
            await page.waitForSelector('select[name=variant] option[value=laby]', {state: 'attached'});
            await page.evaluate(() => { const s = document.querySelector('select[name=variant]'); s.value = 'laby'; s.dispatchEvent(new Event('change', {bubbles: true})); });
            await page.waitForSelector('#lb-setup-form [data-lb-pv] svg');
            assert.equal(await page.locator('[data-lb-ready]').count(), 4);
            assert.ok(await page.locator('[data-lb-presets] .ui-presets, [data-lb-presets] > *').count() >= 1, 'cadre des réglages enregistrés');
            const before = await page.innerHTML('[data-lb-pv]');
            await page.click('[data-lb-seg="shape"] [data-v="round"]'); await page.waitForTimeout(250);
            assert.notEqual(await page.innerHTML('[data-lb-pv]'), before, 'l’aperçu suit la forme');
            await page.click('[data-lb-reseed]'); await page.waitForTimeout(200);
            assert.match(await page.inputValue('[name=seed]'), /^[A-Z0-9]{6}$/);
            if (shots) await page.screenshot({path: path.join(shots, 'lb-setup.png'), fullPage: true});
        });
        await t('étapes « Remonte ta lignée » : des ancêtres sans vivant ni fiche confidentielle, dans l’ordre Sosa', async () => {
            await newGame(page, {shape: 'square', w: 12, h: 12, seed: 'LIGNEE', st: {n: 2, kind: 'ancetres', sub: 'sosa', order: 'lignee', needAll: true}});
            const d = await page.evaluate(() => window.LCNDA_LABY.debug()); assert.ok(d, 'la partie démarre');
            const titles = d.stages.map(s => s.title).join(' | ');
            assert.ok(!/VIVANT|CONFIDENTIELLE/i.test(titles), titles);
            assert.deepEqual(d.stages.map(s => s.n), [1, 2]);
            assert.match(d.stages[0].title, /Pierre MARTIN|Anne ROUX/, 'on commence par le plus ancien : ' + titles);
            assert.match(d.stages[1].title, /Jean MARTIN/, 'puis son enfant : ' + titles);
        });
        await t('partie au clavier : sortie fermée tant qu’il reste des étapes, cartes « Trouvé ! », fin, et aucun POST', async () => {
            const d0 = await page.evaluate(() => window.LCNDA_LABY.debug());
            // aller tout droit à la sortie, sans les étapes : elle reste fermée
            const direct = await page.evaluate(() => { const D = window.LCNDA_LABY.debug(); return D; });
            assert.ok(direct.stages.length === 2);
            await page.waitForTimeout(1500); // les réglages de l’app (« genealogie-* ») partent dans la base une seconde après : ce n’est pas la partie
            const before = posts.length;
            const mid = await play(page, x => x.players[0].got >= 1);
            assert.equal(mid.players[0].got, 1);
            assert.match(await page.textContent('[data-lb-found]'), /Trouvé|étape 1/);
            const end = await play(page);
            assert.equal(end.finished, true); assert.equal(end.players[0].got, 2); assert.ok(end.players[0].steps >= d0.solution.length - 1);
            assert.deepEqual(posts.slice(before), [], 'aucune écriture pendant la partie');
            assert.match(await page.textContent('[data-lb-end]'), /Bravo/);
            assert.equal(await page.locator('[data-lb-end] [data-lb-person]').count(), 2, '↗ Fiche pour chaque ancêtre');
            if (shots) await page.screenshot({path: path.join(shots, 'lb-fin.png')});
        });
        await t('la sortie refuse un joueur qui n’a pas tout ramassé', async () => {
            await newGame(page, {shape: 'square', w: 10, h: 10, seed: 'FERME', st: {n: 2, kind: 'lieux', sub: 'tous', order: 'libre', needAll: true}});
            const d = await page.evaluate(() => window.LCNDA_LABY.debug());
            // un chemin direct vers la sortie, en évitant de compter les étapes : on pose le pion à côté de la sortie
            const ok = await page.evaluate(() => { const D = window.LCNDA_LABY.debug(); return D.stages.every(s => s.kind === 'place') && D.stages.length === 2; });
            assert.ok(ok, JSON.stringify(d.stages));
            const titles = d.stages.map(s => s.title);
            assert.ok(!titles.includes('Lieu-Secret'), 'le lieu d’une fiche confidentielle n’apparaît pas');
            // le chemin direct (le même labyrinthe, refait ici avec la même graine) ne passe par aucune impasse, donc par aucune étape
            const m = L.generate({seed: 'FERME', shape: 'square', w: 10, h: 10, algo: 'backtracker', loops: 0, ends: 'coins', rings: 10});
            assert.equal(m.start, d.start); assert.equal(m.end, d.end);
            const direct = L.solve(m, m.start, m.end); await page.focus('[data-lb-board]');
            for (let i = 1; i < direct.length; i++) { const a = m.cells[direct[i - 1]], b = m.cells[direct[i]]; await page.keyboard.press(keyFor({dx: b.cx - a.cx, dy: b.cy - a.cy})); }
            const x = await page.evaluate(() => window.LCNDA_LABY.debug());
            assert.equal(x.players[0].pos, d.end, 'le pion est sur la sortie'); assert.equal(x.finished, false, 'mais la partie n’est pas finie');
            assert.match(await page.textContent('[data-lb-live]'), /fermée/);
        });
        await t('pause, 💡 indice, 👁 solution, 🖨 Imprimer (2 pages) et ⤓ Exporter ▾ (PNG, SVG)', async () => {
            await page.focus('[data-lb-board]'); await page.keyboard.press('Space');
            assert.match(await page.getAttribute('[data-lb-board]', 'class'), /is-paused/); await page.keyboard.press('Space');
            assert.doesNotMatch(await page.getAttribute('[data-lb-board]', 'class'), /is-paused/);
            await page.click('[data-lb-hint]'); assert.ok(await page.locator('.lb-l-hint circle').count() >= 1);
            await page.click('[data-lb-sol]'); assert.equal(await page.locator('.lb-l-sol path').count(), 1);
            await page.click('[data-lb-print]'); await page.waitForSelector('dialog.k-print[open]');
            const n = await page.evaluate(() => { const d = document.querySelector('dialog.k-print[open]'); const f = d.querySelector('iframe'); const doc = f?.contentDocument; return doc ? doc.querySelectorAll('.lb-pr-page svg').length : d.querySelectorAll('.lb-pr-page svg').length; });
            assert.equal(n, 2, 'le labyrinthe et sa solution');
            await page.keyboard.press('Escape'); await page.waitForTimeout(200);
            if (await page.$('dialog.k-print[open]')) await page.click('dialog.k-print[open] [data-k-x]');
            await page.click('[data-lb-export]'); await page.waitForSelector('.ui-actmenu-i');
            const items = await page.$$eval('.ui-actmenu-i', l => l.map(x => x.textContent));
            assert.ok(items.some(x => /PNG/.test(x)) && items.some(x => /SVG/.test(x)), items.join(','));
            await page.keyboard.press('Escape');
        });
        await t('course à deux : flèches pour l’un, Z Q S D pour l’autre ; brouillard', async () => {
            await newGame(page, {shape: 'square', w: 10, h: 10, seed: 'COURSE', mode: 'course', fog: true, fogR: 2, players: [{name: 'Léa', color: '#d93636'}, {name: 'Tom', color: '#2878c8'}], st: {n: 0}});
            const d = await page.evaluate(() => window.LCNDA_LABY.debug()); assert.equal(d.players.length, 2);
            assert.equal(await page.locator('.lb-l-fog mask').count(), 1, 'brouillard');
            await page.focus('[data-lb-board]');
            const nbs = await page.evaluate(id => window.LCNDA_LABY.debug().neighbors(id), d.start);
            const dir = keyFor(nbs[0]), wasd = {ArrowUp: 'KeyW', ArrowDown: 'KeyS', ArrowLeft: 'KeyA', ArrowRight: 'KeyD'}[dir];
            await page.keyboard.press(wasd);
            let x = await page.evaluate(() => window.LCNDA_LABY.debug());
            assert.equal(x.players[1].steps, 1, 'Tom a bougé'); assert.equal(x.players[0].steps, 0, 'Léa n’a pas bougé');
            await page.keyboard.press(dir); x = await page.evaluate(() => window.LCNDA_LABY.debug());
            assert.equal(x.players[0].steps, 1, 'Léa a bougé');
            assert.equal(await page.locator('.lb-l-pawns .lb-pawn').count(), 2);
        });
        await t('glisser le pion à la souris', async () => {
            await newGame(page, {shape: 'hex', w: 10, h: 8, seed: 'GLISSE', mode: 'tour', players: [{name: 'Moi'}], st: {n: 0}});
            const d = await page.evaluate(() => window.LCNDA_LABY.debug());
            const pt = await page.evaluate(id => { const D = window.LCNDA_LABY.debug(), nb = D.neighbors(id)[0], s = document.querySelector('[data-lb-svg] svg'), p = s.createSVGPoint();
                const cell = document.querySelector('.lb-l-pawns .lb-pawn'); const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(cell.getAttribute('style')); p.x = Number(m[1]) + nb.dx; p.y = Number(m[2]) + nb.dy;
                const q = p.matrixTransform(s.getScreenCTM()); const p0 = s.createSVGPoint(); p0.x = Number(m[1]); p0.y = Number(m[2]); const q0 = p0.matrixTransform(s.getScreenCTM()); return {x0: q0.x, y0: q0.y, x: q.x, y: q.y}; }, d.start);
            await page.mouse.move(pt.x0, pt.y0); await page.mouse.down(); await page.mouse.move(pt.x, pt.y, {steps: 4}); await page.mouse.up();
            const x = await page.evaluate(() => window.LCNDA_LABY.debug());
            assert.equal(x.players[0].steps, 1);
        });
        await t('colonne de gauche : les labyrinthes en cours, on en rouvre un ; ⋯ Supprimer', async () => {
            await page.evaluate(() => window.LCNDA_APP.renderSidebar?.());
            await page.waitForSelector('[data-lb-open]');
            const n = await page.locator('[data-lb-open]').count(); assert.ok(n >= 3, `${n} parties`);
            await page.click('[data-lb-open] >> nth=1'); await page.waitForSelector('.lb-play');
            await page.click('[data-lb-more]'); await page.click('.ui-actmenu-i:has-text("Supprimer")');
            await page.waitForSelector('dialog.confirm-box-dialog[open] [data-cb-ok]'); await page.click('dialog.confirm-box-dialog[open] [data-cb-ok]');
            await page.waitForSelector('#lb-setup-form'); assert.equal(await page.evaluate(() => window.LCNDA_LABY.gameCount()), n - 1);
        });
        await page.context().close();
        await t('390 px et mode sombre : préparation et partie sans débordement', async () => {
            const p2 = await open(390, true);
            await newGame(p2, {shape: 'round', rings: 7, seed: 'PETIT', style: 'haies', st: {n: 2, kind: 'evenements', sub: 'tous', order: 'chrono', needAll: false}});
            assert.ok(await p2.evaluate(() => window.LCNDA_LABY.debug()?.cells > 50));
            const over = await p2.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            assert.ok(over <= 2, `débordement ${over}px`);
            if (shots) await p2.screenshot({path: path.join(shots, 'lb-390-sombre.png'), fullPage: true});
            await p2.evaluate(async () => { localStorage.setItem('genealogie-goose-active-v1', ''); window.LCNDA_LABY.resetSetup(); await window.LCNDA_APP.setModule('dashboard'); await window.LCNDA_APP.setModule('jeu'); });
            await p2.evaluate(() => { const s = document.querySelector('select[name=variant]'); s.value = 'laby'; s.dispatchEvent(new Event('change', {bubbles: true})); });
            await p2.waitForSelector('#lb-setup-form');
            const over2 = await p2.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            assert.ok(over2 <= 2, `préparation : débordement ${over2}px`);
            await p2.context().close();
        });
        await t('aucune erreur JavaScript', () => { assert.deepEqual(errors, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(dir, {recursive: true, force: true});
    }
    done();
})().catch(e => { console.error(e); process.exit(1); });
function done() { console.log(`\n${pass} réussis, ${fail} en échec`); process.exit(fail ? 1 : 0); }
