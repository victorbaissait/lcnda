'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test des 4 jeux de la famille (page Jeu) : 🕵️ Qui est-ce ?, 🃏 Memory, 📅 La bonne date, ❌ Morpion.
 *     node tests/test-jeux-famille.js
 * 1. La logique sans écran (assets/js/app-jeu-famille-logique.js, require) : personnes sans vivants ni fiches confidentielles,
 *    questions qui collent aux données, paires sans doublon, frise dans l'ordre (dates « vers » comprises), victoire du morpion
 *    dans les 4 directions, sans diagonales, gravité, grille qui s'agrandit, ordinateur qui gagne et qui bloque.
 * 2. Le navigateur, sur une petite généalogie servie par un vrai « php -S » : une partie de chaque jusqu'au bout,
 *    aucun POST pendant les parties, la partie gardée après rechargement, 390 px et sombre sans débordement, aucune erreur.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const L = require('../assets/js/app-jeu-famille-logique.js');

let failures = 0;
const ok = msg => console.log('  ✓ ' + msg);
async function t(name, fn) { try { await fn(); ok(name); } catch (e) { failures++; console.log('  ✗ ' + name + '\n    ' + (e && e.stack || e).toString().split('\n').slice(0, 6).join('\n    ')); } }

/* ═════ 1. Logique ═════ */
const D = {
    persons: [
        {id: 1, first: 'Jean', last: 'Martin', g: 'm', job: 'laboureur', photo: '', birth: {date: {y: 1780, m: 3, d: 2}, place: 'Auch'}, death: {date: {y: 1850, m: 0, d: 0}, place: 'Auch'}, living: 0, priv: 0},
        {id: 2, first: 'Marie', last: 'Durand', g: 'f', job: 'fileuse', photo: 'media/m.jpg', birth: {date: {y: 1785, m: 0, d: 0, about: true}, place: 'Condom (France)'}, death: {date: {y: 1860}, place: 'Auch'}, living: 0, priv: 0},
        {id: 3, first: 'Pierre', last: 'Martin', g: 'm', job: 'laboureur', photo: '', birth: {date: {y: 1810, m: 6, d: 1}, place: 'Auch'}, death: {date: {y: 1880, m: 1, d: 1}, place: 'Lectoure'}, living: 0, priv: 0},
        {id: 4, first: 'Anne', last: 'Bernard', g: 'f', job: 'couturière', photo: '', birth: {date: {y: 1815, m: 2, d: 9}, place: 'Lectoure'}, death: null, living: 0, priv: 0},
        {id: 5, first: 'Louis', last: 'Martin', g: 'm', job: 'menuisier', photo: '', birth: {date: {y: 1845, m: 4, d: 4}, place: 'Lectoure'}, death: {date: {y: 1910}, place: 'Paris'}, living: 0, priv: 0},
        {id: 6, first: 'Vivant', last: 'Secret', g: 'f', job: 'secret', birth: {date: {y: 1990}}, living: 1, priv: 0},
        {id: 7, first: 'Cachée', last: 'Confidentielle', g: 'f', job: 'cachée', birth: {date: {y: 1700}}, living: 0, priv: 1},
    ],
    families: [{id: 1, a: 1, b: 2, c: [3], marr: {date: {y: 1805, m: 5, d: 1}, place: 'Auch'}}, {id: 2, a: 3, b: 4, c: [5], marr: {date: {y: 1840}, place: 'Lectoure'}}],
};
const sosa = {5: 1, 3: 2, 4: 3, 1: 4, 2: 5};
console.log('Logique');
(async () => {
    await t('personnes : jamais les vivants ni les fiches confidentielles ; Sosa, génération et côté', () => {
        const all = L.pool(D, {scope: 'all', sosa});
        assert.deepEqual(all.map(p => p.id).sort(), [1, 2, 3, 4, 5]);
        const anc = L.pool(D, {scope: 'sosa', sosa}); assert.equal(anc.length, 5);
        const g2 = L.pool(D, {scope: 'gen', gen: 2, sosa}); assert.deepEqual(g2.map(p => p.id).sort(), [1, 2]);
        const br = L.pool(D, {scope: 'branch', rootId: 3, sosa}); assert.deepEqual(br.map(p => p.id).sort(), [1, 2, 3]);
        assert.equal(all.find(p => p.id === 1).side, 'pere'); assert.equal(all.find(p => p.id === 4).side, 'mere'); assert.equal(all.find(p => p.id === 2).btown, 'Condom');
        assert.deepEqual([2, 3, 4, 5, 6, 7, 8, 11, 12, 15].map(L.sosaSide), ['pere', 'mere', 'pere', 'pere', 'mere', 'mere', 'pere', 'pere', 'mere', 'mere']);
    });
    await t('Qui est-ce ? : chaque question partage les candidats, la réponse colle à la personne cachée, elle reste toujours possible', () => {
        const c = L.pool(D, {scope: 'all', sosa}), qs = L.quizQuestions(c), byId = id => qs.find(q => q.id === id);
        assert.ok(qs.length >= 8, `questions : ${qs.length}`);
        ['g:f', 'job:laboureur', 'bt:Auch', 'side:pere', 'by<1800'].forEach(id => assert.ok(byId(id), id));
        assert.ok(qs.every(q => q.yes > 0 && q.no > 0));
        for (const secret of c) {
            const asked = qs.map(q => ({id: q.id, answer: L.quizAnswer(q, secret)}));
            const rem = L.quizRemaining(c, asked, byId);
            assert.ok(rem.some(p => p.id === secret.id), `${secret.name} reste possible`);
        }
        assert.equal(L.quizAnswer(byId('job:laboureur'), c.find(p => p.id === 1)), 'oui');
        assert.equal(L.quizAnswer(byId('job:laboureur'), c.find(p => p.id === 4)), 'non');
        assert.equal(L.quizAnswer(byId('side:pere'), {side: ''}), 'inconnu');
    });
    await t('Memory : paires sans valeur en double, une carte a + une carte b par paire, même graine = même paquet', () => {
        const c = L.pool(D, {scope: 'all', sosa});
        for (const k of ['nom', 'village', 'metier', 'annee']) {
            const d = L.memoryDeck(c, k, 10, 'abc'), vals = d.cards.filter(x => x.side === 'b').map(x => x.text.toLowerCase());
            assert.equal(new Set(vals).size, vals.length, k);
            assert.equal(d.cards.length, d.pairs * 2);
            for (let i = 0; i < d.pairs; i++) assert.deepEqual(d.cards.filter(x => x.pair === i).map(x => x.side).sort(), ['a', 'b']);
            assert.deepEqual(L.memoryDeck(c, k, 10, 'abc'), d);
        }
        assert.equal(L.memoryDeck(c, 'village', 10, 'x').pairs, 3, 'Auch, Condom, Lectoure');
        const d = L.memoryDeck(c, 'nom', 4, 's'), a = d.cards.find(x => x.pair === 0 && x.side === 'a'), b = d.cards.find(x => x.pair === 0 && x.side === 'b'), o = d.cards.find(x => x.pair === 1);
        assert.ok(L.memoryMatch(a, b)); assert.ok(!L.memoryMatch(a, o)); assert.ok(!L.memoryMatch(a, a));
    });
    await t('La bonne date : écart minimum, frise toujours dans l’ordre, dates « vers » et même année acceptées des deux côtés', () => {
        const c = L.pool(D, {scope: 'all', sosa}), ev = L.timelineEvents(D, c, {history: true});
        assert.ok(ev.some(e => e.kind === 'mariage' && /Jean MARTIN et Marie DURAND/.test(e.text)));
        assert.ok(!ev.some(e => /Vivant|Confidentielle/.test(e.text)), 'pas de vivants ni de confidentiels');
        const deck = L.timelineDeck(ev, 12, 10, 'g');
        for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) assert.ok(Math.abs(deck[i].date.y - deck[j].date.y) >= 10);
        const line = [];
        L.shuffle(ev, L.rng('o')).forEach(e => line.splice(L.timelinePlace(line, e), 0, e));
        for (let i = 1; i < line.length; i++) assert.ok(L.cmpDate(line[i - 1].date, line[i].date) <= 0);
        const a = {date: {y: 1800, m: 0, d: 0}}, b = {date: {y: 1800, m: 5, d: 1}};
        assert.ok(L.timelineFits([a], b, 0) && L.timelineFits([a], b, 1), 'même année sans mois : les deux places vont');
        const x = {date: {y: 1790, m: 1, d: 1}}, y = {date: {y: 1810, m: 1, d: 1}};
        assert.ok(L.timelineFits([x, y], {date: {y: 1800}}, 1)); assert.ok(!L.timelineFits([x, y], {date: {y: 1800}}, 0)); assert.ok(!L.timelineFits([x, y], {date: {y: 1800}}, 2));
        assert.equal(L.dateText({y: 1785, about: true}), '≈ 1785'); assert.equal(L.dateText({y: 1937, m: 6, d: 20}), '20 juin 1937');
    });
    await t('Morpion : victoire en ligne, colonne, 2 diagonales, N à la suite, sans diagonales, gravité, grille qui s’agrandit', () => {
        const put = (b, cells, w) => cells.forEach(([r, c]) => { b[r][c] = w; });
        for (const [cells, k] of [[[[2, 0], [2, 1], [2, 2], [2, 3]], 4], [[[0, 4], [1, 4], [2, 4], [3, 4], [4, 4]], 5], [[[0, 0], [1, 1], [2, 2]], 3], [[[0, 3], [1, 2], [2, 1], [3, 0]], 4]]) {
            const b = L.emptyBoard(6, 6); put(b, cells, 1); const last = cells[1];
            assert.equal(L.morpionLine(b, last[0], last[1], k, true)?.length, cells.length);
            assert.equal(L.morpionLine(b, last[0], last[1], k + 1, true), null, 'pas assez');
        }
        const d = L.emptyBoard(4, 4); put(d, [[0, 0], [1, 1], [2, 2]], 0); assert.equal(L.morpionLine(d, 1, 1, 3, false), null, 'sans diagonales');
        { // « jusqu'à remplir la grille » : une suite de 6 avec k = 3 vaut 2 points, une diagonale de 3 en vaut 1, sans diagonales elle ne compte pas
            const f = L.emptyBoard(6, 6); put(f, [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5]], 0); put(f, [[2, 0], [3, 1], [4, 2]], 1);
            assert.deepEqual(L.morpionCount(f, 3, true, 2).pts, [2, 1]); assert.deepEqual(L.morpionCount(f, 3, false, 2).pts, [2, 0]);
        }
        const mixed = L.emptyBoard(3, 3); put(mixed, [[0, 0], [0, 1]], 0); mixed[0][2] = 1; assert.equal(L.morpionLine(mixed, 0, 1, 3, true), null);
        const g = L.emptyBoard(6, 7); assert.deepEqual(L.morpionDrop(g, 3), [5, 3]); g[5][3] = 0; assert.deepEqual(L.morpionDrop(g, 3), [4, 3]);
        assert.equal(L.morpionMoves(g, true).length, 7); for (let r = 0; r < 6; r++) g[r][0] = 1; assert.equal(L.morpionMoves(g, true).length, 6, 'colonne pleine');
        const gr = L.morpionGrow(L.emptyBoard(3, 3), 2, 2, 25); assert.equal(gr.board.length, 4); assert.equal(gr.board[0].length, 4); assert.deepEqual([gr.r, gr.c], [2, 2]);
        const g0 = L.morpionGrow(L.emptyBoard(3, 3), 0, 0, 25); assert.deepEqual([g0.r, g0.c], [1, 1]);
        const mid = L.morpionGrow(L.emptyBoard(3, 3), 1, 1, 25); assert.equal(mid.board.length, 3, 'au milieu : rien ne change');
        const big = L.morpionGrow(L.emptyBoard(25, 25), 0, 0, 25); assert.equal(big.board.length, 25, 'pas plus que le maximum');
    });
    await t('Morpion : l’ordinateur gagne quand il peut, sinon bloque, et ne joue que des cases libres', () => {
        const b = L.emptyBoard(3, 3); b[0][0] = 1; b[0][1] = 1; b[1][0] = 0; b[1][1] = 0;
        for (const level of ['simple', 'moyen']) assert.deepEqual(L.morpionAI(b, 1, {k: 3, gravity: false, level, players: 2}), [0, 2], `gagne (${level})`);
        const c = L.emptyBoard(3, 3); c[2][0] = 0; c[2][1] = 0;
        for (const level of ['simple', 'moyen']) assert.deepEqual(L.morpionAI(c, 1, {k: 3, gravity: false, level, players: 2}), [2, 2], `bloque (${level})`);
        const g = L.emptyBoard(6, 7); [[5, 0], [5, 1], [5, 2]].forEach(([r, cc]) => { g[r][cc] = 0; });
        assert.deepEqual(L.morpionAI(g, 1, {k: 4, gravity: true, level: 'moyen', players: 2}), [5, 3], 'gravité : bloque en bas');
        const full = [[0, 1, 0], [0, 1, 1], [1, 0, -1]]; assert.deepEqual(L.morpionAI(full, 0, {k: 3, gravity: false, level: 'moyen', players: 2}), [2, 2]);
    });
    await browserPart();
    console.log(failures ? `\n${failures} échec(s)` : '\nTout est bon.');
    process.exit(failures ? 1 : 0);
})();

/* ═════ 2. Navigateur ═════ */
async function browserPart() {
    console.log('Navigateur');
    let pw; try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch (_) { try { pw = require('playwright'); } catch (__) { console.log('  (Playwright absent : partie navigateur sautée)'); return; } }
    const appRoot = path.resolve(__dirname, '..'), phpPath = findPhp([devBundledPhp()]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-jeux-')), env = {...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $p = db();
$tag = function ($t) use ($p) { $s = $p->prepare('SELECT id FROM event_types WHERE gedcom_tag=? LIMIT 1'); $s->execute([$t]); $id = (int) $s->fetchColumn();
    if (!$id) { $p->prepare('INSERT INTO event_types(name, gedcom_tag) VALUES(?, ?)')->execute([$t, $t]); $id = (int) $p->lastInsertId(); } return $id; };
$place = function ($n) use ($p) { $s = $p->prepare('SELECT id FROM places WHERE name=?'); $s->execute([$n]); $id = (int) $s->fetchColumn(); if (!$id) { $p->prepare('INSERT INTO places(name) VALUES(?)')->execute([$n]); $id = (int) $p->lastInsertId(); } return $id; };
$towns = ['Auch', 'Condom', 'Lectoure', 'Mirande', 'Nogaro', 'Eauze', 'Vic', 'Fleurance'];
$jobs = ['laboureur', 'tisserand', 'meunier', 'forgeron', 'tailleur', 'boulanger', 'menuisier', 'couturière'];
$ids = [];
for ($i = 0; $i < 30; $i++) {
    $p->prepare("INSERT INTO persons(first_name,last_name,gender,occupation,living_status,is_private) VALUES(?,?,?,?,?,0)")->execute(['Prénom' . $i, 'Nom' . chr(65 + $i % 26) . $i, $i % 2 ? 'female' : 'male', $jobs[$i % 8], 'deceased']);
    $id = (int) $p->lastInsertId(); $ids[] = $id;
    $p->prepare('INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?)')->execute(['person', $id, $tag('BIRT'), (3 + $i % 20) . ' mai ' . (1700 + $i * 7), 1700 + $i * 7, $place($towns[$i % 8])]);
    $p->prepare('INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?)')->execute(['person', $id, $tag('DEAT'), (string) (1760 + $i * 7), 1760 + $i * 7, $place($towns[($i + 3) % 8])]);
}
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Vivant','Toujours','male','living')");
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status,is_private) VALUES('Cachée','Secrète','female','deceased',1)");
for ($i = 0; $i < 6; $i++) { $p->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,?)')->execute([$ids[2 * $i], $ids[2 * $i + 1]]); $f = (int) $p->lastInsertId();
    $p->prepare('INSERT INTO events(scope,family_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?)')->execute(['family', $f, $tag('MARR'), (string) (1730 + $i * 9), 1730 + $i * 9, $place('Auch')]); }
echo 'ok';`], {cwd: appRoot, encoding: 'utf8', env});
    if (r.status !== 0 || !/ok$/.test(r.stdout.trim())) { failures++; console.log('  ✗ base de test\n' + (r.stderr || r.stdout)); return; }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], {cwd: appRoot, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const shots = process.env.SHOTS || '';
    const browser = await pw.chromium.launch();
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 950}});
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, rt => rt.abort());
        const page = await ctx.newPage();
        const errors = [], posts = []; let watch = false;
        page.on('pageerror', e => errors.push(String(e.message)));
        page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push(m.text()); });
        page.on('request', q => {
            if (!watch || /^(GET|HEAD)$/.test(q.method())) return;
            // seule exception : la copie des réglages de l'interface (save_settings, faite par l'app, groupée) — jamais les parties des jeux
            let keys = []; try { const b = JSON.parse(q.postData() || '{}'); keys = [...Object.keys(b.set || {}), ...(b.remove || [])]; } catch (_) {}
            if (/action=save_settings/.test(q.url()) && keys.length && !keys.some(k => /jeux-famille/.test(k))) return;
            posts.push(q.method() + ' ' + q.url() + ' ' + keys.join(','));
        });
        await page.goto(base);
        await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_JEUX_FAMILLE?.KEYS?.length >= 6, null, {timeout: 30000});
        await page.evaluate(async () => { await window.LCNDA_APP.setModule('jeu'); });
        await page.waitForSelector('select[name="variant"]');
        const J = (fn, arg) => page.evaluate(fn, arg);
        const games = () => J(() => window.LCNDA_JEUX_FAMILLE._games());
        const start = async (key, ready = null, scopeAll = true) => {
            if (!await page.$('select[name="variant"]')) { await page.click('[data-jf-new]'); await page.waitForSelector('select[name="variant"]'); }
            await page.selectOption('select[name="variant"]', key); await page.waitForSelector(`.jf-${key} #jf-setup-form`);
            if (ready) await page.click(`[data-jf-ready="${ready}"]`), await page.waitForSelector(`.jf-${key} #jf-setup-form`);
            if (scopeAll && await page.$('[data-jf-seg="scope"][data-v="all"]')) await page.click('[data-jf-seg="scope"][data-v="all"]');
            await page.click('#jf-setup-form [type=submit]');
            await page.waitForSelector('[data-jf-play]');
            const g = (await games())[0]; assert.equal(g.kind, key); return g;
        };
        await t('les 4 jeux sont dans « Jeu ▾ », à côté du jeu de l’oie, du puzzle et du labyrinthe', async () => {
            const opts = await page.$$eval('select[name="variant"] option', l => l.map(o => o.value));
            ['goose', 'quiz', 'memory', 'timeline', 'morpion'].forEach(k => assert.ok(opts.includes(k), k));
        });
        await t('🕵️ Qui est-ce ? : poser une question grise des portraits, puis trouver l’ancêtre caché', async () => {
            const g = await start('quiz', 'kids'); watch = true;
            assert.equal(g.board.length, 9); assert.ok(!g.board.some(p => /Vivant|Cachée/.test(p.name)), 'pas de vivant ni de confidentiel');
            await page.click('[data-q="g:f"]'); await page.waitForSelector('.jfq-answer');
            const after = (await games())[0]; assert.equal(after.players[0].q, 1);
            const out = await page.$$eval('.jfq-card.is-out', l => l.length); assert.ok(out > 0, 'des portraits grisés');
            if (shots) await page.screenshot({path: path.join(shots, 'quiz.png'), fullPage: true});
            await page.click('[data-guess]'); await page.click(`[data-p="${after.players[0].secret}"]`);
            await page.waitForSelector('.jfq-end'); const fin = (await games())[0]; assert.equal(fin.finished, true); assert.equal(fin.winner, 0);
            watch = false;
        });
        await t('🃏 Memory : une mauvaise paire se retourne, toutes les paires trouvées = partie finie', async () => {
            const g = await start('memory', 'kids'); watch = true;
            const pairs = {}; g.cards.forEach(c => { (pairs[c.pair] = pairs[c.pair] || []).push(c.i); });
            const keys = Object.keys(pairs);
            await page.click(`[data-c="${pairs[keys[0]][0]}"]`); await page.click(`[data-c="${pairs[keys[1]][0]}"]`);
            await page.waitForFunction(() => !document.querySelectorAll('.jfm-card.is-up:not(.is-found)').length, null, {timeout: 5000});
            for (const k of keys) { await page.click(`[data-c="${pairs[k][0]}"]`); await page.click(`[data-c="${pairs[k][1]}"]`); }
            await page.waitForSelector('.jfq-endbox'); const fin = (await games())[0];
            assert.equal(fin.finished, true); assert.equal(fin.moves, keys.length + 1); assert.equal(fin.scores[0], keys.length);
            if (shots) await page.screenshot({path: path.join(shots, 'memory.png'), fullPage: true});
            watch = false;
        });
        await t('📅 La bonne date : une carte bien placée = un point, une carte mal placée va à sa vraie place, frise dans l’ordre', async () => {
            const g = await start('timeline', 'easy'); watch = true;
            // une erreur exprès d'abord (si possible), puis tout juste
            let first = true;
            for (;;) {
                const s = (await games())[0]; if (s.finished || s.pos >= s.deck.length) break;
                const card = s.deck[s.pos], right = await J(([line, c]) => window.LCNDA_JEUX_LOGIQUE.timelinePlace(line, c), [s.line, card]);
                let at = right;
                if (first) { first = false; for (let k = 0; k <= s.line.length; k++) if (!(await J(([line, c, x]) => window.LCNDA_JEUX_LOGIQUE.timelineFits(line, c, x), [s.line, card, k]))) { at = k; break; } }
                await page.click(`[data-at="${at}"]`);
            }
            const fin = (await games())[0];
            assert.equal(fin.finished, true);
            for (let i = 1; i < fin.line.length; i++) assert.ok(L.cmpDate(fin.line[i - 1].date, fin.line[i].date) <= 0, 'frise dans l’ordre');
            assert.ok(fin.players[0].pts >= fin.line.length - 2);
            if (shots) await page.screenshot({path: path.join(shots, 'timeline.png'), fullPage: true});
            watch = false;
        });
        await t('❌ Morpion : 3 à la suite gagne (surligné), ↻ Rejouer garde les scores, l’ordinateur joue tout seul', async () => {
            await start('morpion', 'classic', false); watch = true;
            for (const [r, c] of [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]]) await page.click(`.jfx-cell[data-r="${r}"][data-c="${c}"]`);
            await page.waitForSelector('.jfx-cell.is-win'); assert.equal(await page.$$eval('.jfx-cell.is-win', l => l.length), 3);
            let g = (await games())[0]; assert.equal(g.winner, 0); assert.deepEqual(g.score, [1, 0]);
            await page.click('[data-jf-again]'); await page.waitForFunction(() => !document.querySelector('.jfx-cell.is-win'));
            g = (await games())[0]; assert.deepEqual(g.score, [1, 0], 'scores de la soirée gardés'); assert.equal(g.round, 2); assert.equal(g.turn, 1, 'l’autre joueur commence');
            if (shots) await page.screenshot({path: path.join(shots, 'morpion.png'), fullPage: true});
            watch = false;
            // contre l'ordinateur, avec la gravité (puissance 4)
            await page.click('[data-jf-new]'); await page.waitForSelector('#jf-setup-form');
            await page.click('[data-jf-ready="p4"]'); await page.waitForSelector('#jf-setup-form');
            await page.selectOption('.jf-player[data-i="1"] select[name="pai"]', 'moyen');
            await page.click('#jf-setup-form [type=submit]'); await page.waitForSelector('[data-jf-play]'); watch = true;
            await page.click('.jfx-cell[data-r="0"][data-c="3"]'); // la gravité : le pion tombe en bas
            await page.waitForFunction(() => window.LCNDA_JEUX_FAMILLE._games()[0].moves.length === 2, null, {timeout: 5000});
            g = (await games())[0]; assert.deepEqual(g.moves[0].slice(0, 2), [5, 3], 'tombé en bas'); assert.equal(g.moves[1][2], 1, 'l’ordinateur a joué');
            watch = false;
        });
        await t('aucun POST pendant les parties', () => assert.deepEqual(posts, []));
        await t('la partie se retrouve après rechargement (colonne de gauche)', async () => {
            await page.reload(); await page.waitForFunction(() => window.LCNDA_JEUX_FAMILLE?.KEYS?.length >= 6 && window.LCNDA_APP?.state);
            await page.evaluate(async () => { await window.LCNDA_APP.setModule('jeu'); });
            await page.waitForSelector('[data-jf-open]'); assert.ok(await page.$$eval('[data-jf-open]', l => l.length) >= 5);
            await page.click('[data-jf-open]'); await page.waitForSelector('[data-jf-play]');
        });
        await t('390 px et sombre : préparation et parties sans débordement de la page', async () => {
            await page.setViewportSize({width: 390, height: 844});
            await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
            for (const k of ['quiz', 'memory', 'timeline', 'morpion']) {
                await page.click('[data-jf-new]').catch(() => {}); await page.waitForTimeout(300);
                await page.selectOption('select[name="variant"]', k); await page.waitForSelector(`.jf-${k} #jf-setup-form`);
                const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(over <= 1, `${k} préparation : ${over}px de trop`);
                if (shots) await page.screenshot({path: path.join(shots, `${k}-390-setup.png`), fullPage: true});
                if (await page.$('[data-jf-seg="scope"][data-v="all"]')) await page.click('[data-jf-seg="scope"][data-v="all"]');
                await page.click('#jf-setup-form [type=submit]'); await page.waitForSelector('[data-jf-play]');
                const over2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(over2 <= 1, `${k} partie : ${over2}px de trop`);
                if (shots) await page.screenshot({path: path.join(shots, `${k}-390-sombre.png`), fullPage: true});
            }
        });
        await t('aucune erreur JavaScript', () => assert.deepEqual(errors, []));
    } finally { await browser.close(); proc.kill(); fs.rmSync(dir, {recursive: true, force: true}); }
}
