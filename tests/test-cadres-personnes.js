#!/usr/bin/env node
/* 🗂 « Un cadre par personne » (réglage général genealogie-cadres, oui au départ) sur les listes de recherche.   node tests/test-cadres-personnes.js
 *  1. le serveur : pistes_list&per_person=1 (combien de pistes chaque personne de la page a en tout, mêmes filtres),
 *     listes_plus&what=notes (person_name de chaque note), Ma semaine → « manque » (person, sosa) ;
 *  2. chaque écran, réglage mis puis enlevé : 📋 Tous les doutes, ✅ Contrôle de la base (deux personnes → sous la première ;
 *     les exceptions aussi), 🔎 Pistes à vérifier (« + N autres pistes pour elle » charge les autres), 🧩 Ce qui manque
 *     (un tbody par personne), ⚰️ Décès possibles (un cadre par fiche, les fiches INSEE dedans, décision par fiche),
 *     💡 Suggestions (cadre léger), 🗓 Ma semaine « Par sorte » (💡 À chercher), 🏛️ Actes manquants (tbody par personne),
 *     Fusion de doublons (seulement une fiche qui a plusieurs paires), Journal / Notes / Enquêtes (« Ranger par personne »,
 *     non au départ), 🌍 Où chercher (un cadre par site) ; réglage enlevé : la présentation d'avant ;
 *  3. 1440 / 390 px, clair / sombre : pas de défilement de côté, rien de collé dans les cadres, fond sombre en sombre, pas d'erreur.
 * Les réponses de certaines listes sont simulées (page.route) pour avoir plusieurs lignes par personne dans une petite base.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');
const {start, newPage, settle, scan, closeDialogs, go} = require('./test-rien-de-colle.js');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
const root = path.join(__dirname, '..');

let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 14).join('\n  ')); } };

/* 1. le serveur, dans une base à part */
function serverSide() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-cadres-'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    try {
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
require_once 'lib/pistes_auto.php'; require_once 'lib/listes_plus.php';
$per = function ($f, $l, $g) use ($pdo) { $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES(?,?,?,'deceased')")->execute([$f, $l, $g]); return (int) $pdo->lastInsertId(); };
$a = $per('Anne', 'LACOMBE', 'female'); $b = $per('Louis', 'MAZAUD', 'male');
pst_schema($pdo);
$ins = $pdo->prepare("INSERT INTO pistes(person_id, src, rec_key, score, title) VALUES(?,?,?,?,?)");
foreach ([[$a, 95], [$b, 90], [$a, 85], [$a, 70], [$b, 60], [$a, 55]] as $i => [$pid, $sc]) { $ins->execute([$pid, 'insee', 'k' . $i, $sc, 'Acte ' . $i]); }
$pdo->prepare("UPDATE pistes SET status='no' WHERE rec_key='k5'")->execute();
$l1 = pst_list($pdo, ['status' => 'new', 'limit' => 2, 'per_person' => 1]);
$l0 = pst_list($pdo, ['status' => 'new', 'limit' => 2]);
$lmin = pst_list($pdo, ['status' => 'new', 'limit' => 2, 'min' => 80, 'per_person' => 1]);
$pdo->prepare("INSERT INTO notes(entity_type, entity_id, title, body) VALUES('person', ?, 'N1', 'texte')")->execute([$a]);
$pdo->prepare("INSERT INTO notes(entity_type, entity_id, title, body) VALUES('person', ?, 'N2', 'texte')")->execute([$b]);
$n = lp_notes($pdo, '');
echo json_encode(['a' => $a, 'b' => $b, 'l1' => $l1['per_person'] ?? null, 'rows1' => array_column($l1['rows'], 'person_id'), 'l0' => array_key_exists('per_person', $l0), 'lmin' => $lmin['per_person'] ?? null,
    'notes' => array_map(fn($r) => [$r['person_id'] ?? 0, $r['person_name'] ?? null], $n['rows'])]);
`], {cwd: root, encoding: 'utf8', env: {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: tmp, GENEALOGY_SKIP_REFERENCE: '1'}, maxBuffer: 1 << 24});
        if (r.status !== 0) throw new Error(r.stderr || r.stdout);
        return JSON.parse(r.stdout.trim().split('\n').pop());
    } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
}

/* les réponses simulées (une petite base n'a pas assez de lignes par personne) */
const json = body => ({status: 200, contentType: 'application/json', body: JSON.stringify(body)});
async function mock(p, action, data, test = () => true) {
    await p.route(u => { const x = new URL(u); return x.pathname.endsWith('api.php') && x.searchParams.get('action') === action && test(x.searchParams); }, async rt => {
        if (rt.request().method() !== 'GET') return rt.continue();
        const sp = new URL(rt.request().url()).searchParams;
        rt.fulfill(json(typeof data === 'function' ? data(sp) : data));
    });
}
function mocks(ID) {
    const P = (id, f, l, by, dy, sosa) => ({id, first_name: f, last_name: l, birth_year: by, death_year: dy, sosa});
    return {
        doutes: {rows: [
            {key: 'd1', sort: 'controle', level: 'red', title: 'Mère trop jeune', detail: '12 ans à la naissance', people: [ID.anne, ID.pierre], sosa: 5, branches: [], open: {kind: 'person', id: ID.anne}, fp: 'a'},
            {key: 'd2', sort: 'source', level: 'orange', title: 'Naissance sans source', detail: '', people: [ID.louis], sosa: 4, branches: [], open: {kind: 'person', id: ID.louis}, fp: 'b'},
            {key: 'd3', sort: 'source', level: 'yellow', title: 'Décès sans source', detail: '', people: [ID.anne], sosa: 5, branches: [], open: {kind: 'person', id: ID.anne}, fp: 'c'},
            {key: 'd4', sort: 'source', level: 'yellow', title: 'Mariage sans source', detail: '', people: [ID.louis], sosa: 4, branches: [], open: {kind: 'person', id: ID.louis}, fp: 'd'}],
            names: {[ID.anne]: 'Anne LACOMBE', [ID.louis]: 'Louis MAZAUD', [ID.pierre]: 'Pierre MAZAUD'}, counts: {controle: 1, source: 3}},
        controle: {checked_at: '2026-11-26 10:00:00', branches: [], exceptions: [{title: 'Âge étonnant', reason: 'Vérifié', note: '', at: '2026-11-01 10:00:00', people: [ID.rose], sort: 'ages', status: 'ok', place: null}],
            people: {[ID.anne]: P(ID.anne, 'Anne', 'LACOMBE', 1895, null, 5), [ID.pierre]: P(ID.pierre, 'Pierre', 'MAZAUD', 1920, null, 2), [ID.louis]: P(ID.louis, 'Louis', 'MAZAUD', 1890, 1960, 4), [ID.rose]: P(ID.rose, 'Rose', 'DURAND', 1892, null, 7)},
            alerts: [
                {sort: 'dates', level: 'red', title: 'Enfant né avant sa mère', detail: 'Pierre né en 1920, sa mère en 1895', people: [ID.anne, ID.pierre], check: 'x1'},
                {sort: 'ages', level: 'orange', title: 'Mariée très jeune', detail: '', people: [ID.louis], check: 'x2'},
                {sort: 'ages', level: 'yellow', title: 'Veuve longtemps', detail: '', people: [ID.anne], check: 'x3'},
                {sort: 'parents', level: 'yellow', title: 'Parent trop âgé', detail: '', people: [ID.louis, ID.pierre], check: 'x4'}]},
        pistes: sp => {
            const row = (id, pid, name, g, score) => ({id, person_id: pid, person: name, gender: g, years: '1895–', src: 'insee', key: 'k' + id, score, title: 'Décès de ' + name, url: 'https://example.org/' + id, status: 'new', why: [['ok', 'même nom']], tag: 'DEAT', main: true, archive: 'INSEE', licence: '', source_url: '', found: '', decided: ''});
            if (sp.get('person_id')) return {total: 3, rows: [row(1, ID.anne, 'Anne LACOMBE', 'female', 95), row(3, ID.anne, 'Anne LACOMBE', 'female', 85), row(9, ID.anne, 'Anne LACOMBE', 'female', 40)], counts: {new: 5, added: 0, no: 0}};
            return {total: 5, rows: [row(1, ID.anne, 'Anne LACOMBE', 'female', 95), row(2, ID.louis, 'Louis MAZAUD', 'male', 90), row(3, ID.anne, 'Anne LACOMBE', 'female', 85)], counts: {new: 5, added: 0, no: 0},
                ...(sp.get('per_person') ? {per_person: {[ID.anne]: 3, [ID.louis]: 1}} : {})};
        },
        needs: {counts: {all: 3, have: 0, find: 0, none: 3}, computed: [], rows: [
            {id: 1, what: 'birth', person_id: ID.anne, person: 'Anne LACOMBE', place: 'Tulle', year_from: 1895, year_to: 1895, investigation_id: 0, answers: [], bucket: 'none'},
            {id: 2, what: 'death', person_id: ID.louis, person: 'Louis MAZAUD', place: '', investigation_id: 0, answers: [], bucket: 'none'},
            {id: 3, what: 'marriage', person_id: ID.anne, person: 'Anne LACOMBE', place: '', investigation_id: 0, answers: [], bucket: 'none'}]},
        vd: {items: [
            {id: 1, score: 92, detail: {name: 1, first: 1, birth: 'day'}, person: {id: ID.anne, name: 'Anne LACOMBE', gender: 'female', birth: '1895', birth_place: 'Tulle'}, insee: {nom: 'LACOMBE', prenoms: 'Anne', naissance: '1895', deces: '1971', url: 'https://example.org/i1'}, source: {url: 'https://example.org/s'}},
            {id: 2, score: 74, detail: {name: 1, first: 1, birth: 'year'}, person: {id: ID.anne, name: 'Anne LACOMBE', gender: 'female', birth: '1895', birth_place: 'Tulle'}, insee: {nom: 'LACOMBE', prenoms: 'Anne Marie', naissance: '1895', deces: '1980', url: 'https://example.org/i2'}, source: {url: 'https://example.org/s'}},
            {id: 3, score: 81, detail: {name: 1, first: 1, birth: 'day'}, person: {id: ID.rose, name: 'Rose DURAND', gender: 'female', birth: '1892', birth_place: 'Paris'}, insee: {nom: 'DURAND', prenoms: 'Rose', naissance: '1892', deces: '1970', url: 'https://example.org/i3'}, source: {url: 'https://example.org/s'}}],
            insee: {installed: true, from: 1970, to: 2025}, watched: 3, last_run: '2026-11-20 08:00', pending: 3},
        dups: {candidates: [
            {id1: ID.louis, id2: ID.pierre, first1: 'Louis', last1: 'MAZAUD', first2: 'Pierre', last2: 'MAZAUD', score: 70, birth1: '1890', birth2: '1920', death1: '1960', death2: ''},
            {id1: ID.louis, id2: ID.jean, first1: 'Louis', last1: 'MAZAUD', first2: 'Jean', last2: 'MAZAUD', score: 60, birth1: '1890', birth2: '1950', death1: '1960', death2: ''},
            {id1: ID.henri, id2: ID.rose, first1: 'Henri', last1: 'DURAND', first2: 'Rose', last2: 'DURAND', score: 55, birth1: '1888', birth2: '1892', death1: '', death2: ''}]},
        journal: {rows: [
            {key: 'j1', kind: 'digest', title: 'Registres de Tulle', date: '2026-11-20', people: [{id: ID.anne, title: 'Anne LACOMBE'}], service: 'AD Corrèze', commune: 'Tulle'},
            {key: 'j2', kind: 'visit', title: 'Visite aux AD', date: '2026-11-18', people: [{id: ID.louis, title: 'Louis MAZAUD'}]},
            {key: 'j3', kind: 'digest', title: 'Tables décennales', date: '2026-11-10', people: [{id: ID.anne, title: 'Anne LACOMBE'}]}]},
        notes: {total: 3, offset: 0, rows: [
            {id: 1, title: 'Moulin', excerpt: 'Le moulin de Tulle', body: 'Le moulin de Tulle', entity_type: 'person', entity_id: ID.anne, kind: 'Fiche', label: 'Anne LACOMBE', person_id: ID.anne, person_name: 'Anne LACOMBE', updated_at: '2026-11-20 10:00:00'},
            {id: 2, title: 'Service', excerpt: 'Soldat', body: 'Soldat', entity_type: 'event', entity_id: 9, kind: 'Événement', label: 'Naissance (1890) — Louis MAZAUD', person_id: ID.louis, person_name: 'Louis MAZAUD', updated_at: '2026-11-19 10:00:00'},
            {id: 3, title: 'Cousins', excerpt: 'Des cousins', body: 'Des cousins', entity_type: 'person', entity_id: ID.anne, kind: 'Fiche', label: 'Anne LACOMBE', person_id: ID.anne, person_name: 'Anne LACOMBE', updated_at: '2026-11-18 10:00:00'}]},
        inv: {investigations: [
            {id: 1, title: 'Les parents d’Anne', person_id: ID.anne, person_name: 'Anne LACOMBE', status: 'open', item_count: 2, media_count: 0, question: '', created_at: '2026-11-01 10:00:00'},
            {id: 2, title: 'Le soldat Louis', person_id: ID.louis, person_name: 'Louis MAZAUD', status: 'open', item_count: 1, media_count: 0, question: '', created_at: '2026-11-02 10:00:00'},
            {id: 3, title: 'Le mariage d’Anne', person_id: ID.anne, person_name: 'Anne LACOMBE', status: 'paused', item_count: 0, media_count: 0, question: '', created_at: '2026-11-03 10:00:00'}]},
    };
}

/* 3. à cette largeur, dans ce thème : rien qui déborde de côté, rien de collé dans un cadre, fond sombre en sombre */
async function looks(p, rootSel, dark, sel = '.ui-person-card') {
    const over = await p.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
    assert.ok(over <= 1, `la page défile de côté (${over} px)`);
    const glue = await scan(p, rootSel);
    const inCards = await p.evaluate(({marks, sel}) => marks.filter(m => document.querySelector(`[data-glue-item="${m.mark}"]`)?.closest(sel)), {marks: glue, sel});
    const glued = inCards.map(g => `${g.item} [${g.box}] ${g.bad.map(b => b.kind + b.side + b.gap).join(',')}`);
    assert.deepEqual(glued, [], 'rien de collé dans les cadres : ' + glued.join(' ; '));
    const bg = await p.$eval(sel, el => { let e = el; while (e) { const c = getComputedStyle(e).backgroundColor; const m = c.match(/\d+(\.\d+)?/g); if (m && (m.length < 4 || +m[3] > 0)) return m.slice(0, 3).map(Number); e = e.parentElement; } return [255, 255, 255]; });
    const lum = (bg[0] * 299 + bg[1] * 587 + bg[2] * 114) / 1000;
    if (dark) assert.ok(lum < 110, 'fond sombre en sombre : ' + bg); else assert.ok(lum > 180, 'fond clair : ' + bg);
}
const cardNames = (p, scope = '#workspace') => p.$$eval(`${scope} .ui-person-card .ui-person-card-name, ${scope} tbody.ui-person-tb .ui-person-card-name`, l => l.map(e => e.textContent.trim()));
const setFrames = (p, on) => p.evaluate(on => { if (on === null) localStorage.removeItem('genealogie-cadres'); else localStorage.setItem('genealogie-cadres', on ? '1' : '0'); }, on);

(async () => {
    await t('serveur : per_person (mêmes filtres, seulement sur demande), person_name des notes', async () => {
        const r = serverSide();
        assert.deepEqual(r.rows1, [r.a, r.b], 'la page : la meilleure d’Anne puis celle de Louis');
        assert.deepEqual(r.l1, {[r.a]: 3, [r.b]: 2}, 'Anne a 3 pistes à vérifier en tout (l’écartée ne compte pas), Louis 2');
        assert.equal(r.l0, false, 'sans per_person : rien de plus');
        assert.deepEqual(r.lmin, {[r.a]: 2, [r.b]: 1}, 'avec la note minimale de la liste');
        assert.deepEqual(r.notes.map(x => x[1]).sort(), ['Anne LACOMBE', 'Louis MAZAUD']);
    });

    const {ID, base, browser, stop} = await start();
    const M = mocks(ID);
    try {
        for (const [w, dark] of [[1440, false], [390, false], [1440, true], [390, true]].filter(([w, d]) => !process.env.ONLY || process.env.ONLY === `${w}${d ? 'd' : ''}`)) {
            const tag = `${w} px${dark ? ', sombre' : ''}`;
            const p = await newPage(browser, base, {width: w, dark});
            await mock(p, 'compl', M.doutes, sp => sp.get('op') === 'doutes');
            await mock(p, 'controle', M.controle, sp => !sp.get('scope'));
            await mock(p, 'pistes_list', M.pistes);
            await mock(p, 'cx_needs_all', M.needs);
            await mock(p, 'vd_list', M.vd); await mock(p, 'vd_dismissed', {items: []}); await mock(p, 'vd_status', M.vd);
            await mock(p, 'duplicate_candidates', M.dups);
            await mock(p, 'research_journal', M.journal);
            await mock(p, 'listes_plus', M.notes, sp => sp.get('what') === 'notes');
            await mock(p, 'investigations', M.inv);
            const full = w === 1440 && !dark;

            await t(`📋 Tous les doutes : un cadre par personne (deux personnes → la première), Sosa, « N doutes » ; réglage enlevé → les lignes d’avant — ${tag}`, async () => {
                await setFrames(p, null);
                const open = async () => { await go.liste('doutes')(p); await p.waitForSelector('#workspace [data-dt-list] [data-dt-key]', {timeout: 30000}); await settle(p); };
                await open();
                const names = await cardNames(p);
                assert.deepEqual(names, ['Anne LACOMBE', 'Louis MAZAUD'], 'Anne (gravité rouge) d’abord, puis Louis');
                assert.equal(await p.$$eval('#workspace .ui-person-card', l => l.length), 2);
                assert.match(await p.textContent('#workspace .ui-person-card .ui-person-card-count'), /2 doutes/);
                assert.match(await p.textContent('#workspace .ui-person-card .ui-person-card-sub'), /Sosa 5/);
                assert.equal(await p.$$eval('#workspace .ui-person-card [data-dt-key]', l => l.length), 4, 'toutes les lignes dans un cadre');
                await looks(p, '#workspace', dark);
                if (full) {
                    await setFrames(p, false); await open();
                    assert.equal(await p.$$eval('#workspace .ui-person-card', l => l.length), 0); assert.equal(await p.$$eval('#workspace .ui-rows [data-dt-key]', l => l.length), 4);
                    await setFrames(p, true);
                }
            });

            await t(`✅ Contrôle : un cadre par personne, alerte à deux sous la première, Sosa et dates ; exceptions aussi ; tri A → Z gardé ; ▶ Une à une marche — ${tag}`, async () => {
                await setFrames(p, true);
                const open = async () => { await go.settings('controle')(p); await p.waitForSelector('#workspace .ctl-list [data-ctl-i]', {timeout: 30000}); await settle(p); };
                await open();
                assert.deepEqual(await cardNames(p), ['Anne LACOMBE', 'Louis MAZAUD']);
                assert.equal(await p.$$eval('#workspace .ui-person-card[data-person-card] [data-ctl-i]', l => l.length), 4);
                const first = await p.$eval('#workspace .ui-person-card', c => ({sub: c.querySelector('.ui-person-card-sub')?.textContent, life: c.querySelector('.ui-person-card-life')?.textContent, n: c.querySelector('.ui-person-card-count').textContent, i: [...c.querySelectorAll('[data-ctl-i]')].map(r => r.dataset.ctlI)}));
                assert.match(first.sub, /Sosa 5/); assert.match(first.life, /1895/); assert.match(first.n, /2 choses à vérifier/);
                assert.ok(first.i.length === 2 && first.i[0] === '0' && +first.i[1] > 1, 'les numéros de ligne restent ceux de la liste (boutons, menus) : ' + JSON.stringify(first));
                await looks(p, '#workspace', dark);
                if (full) {
                    await p.click('#workspace [data-ctl-sort="exceptions"]'); await settle(p);
                    assert.deepEqual(await cardNames(p), ['Rose DURAND'], 'les exceptions : un cadre aussi');
                    await p.click('#workspace [data-ctl-sort="all"]'); await settle(p);
                    await setFrames(p, false); await open();
                    assert.equal(await p.$$eval('#workspace .ui-person-card', l => l.length), 0); assert.equal(await p.$$eval('#workspace .ctl-list > .ctl-row[data-ctl-i]', l => l.length), 4);
                    await setFrames(p, true);
                }
            });

            await t(`🔎 Pistes à vérifier : un cadre par personne, « 3 pistes », « + 1 autre piste pour elle » charge la suivante — ${tag}`, async () => {
                await setFrames(p, true);
                const open = async () => { await go.liste('data_pistes')(p); await p.waitForSelector('#workspace [data-pst-list] .pst-row', {timeout: 30000}); await settle(p); };
                await open();
                assert.deepEqual(await cardNames(p), ['Anne LACOMBE', 'Louis MAZAUD']);
                assert.match(await p.textContent('#workspace .ui-person-card .ui-person-card-count'), /3 pistes/);
                assert.equal(await p.$$eval('#workspace .ui-person-card .pst-who', l => l.length), 0, 'le nom est en tête du cadre, plus sur chaque ligne');
                const more = await p.textContent('#workspace [data-pst-rest]'); assert.match(more, /[+＋] 1 autre piste pour elle/);
                await looks(p, '#workspace', dark);
                if (full) {
                    await p.click('#workspace [data-pst-rest]');
                    await p.waitForFunction(() => document.querySelectorAll('#workspace .ui-person-card')[0]?.querySelectorAll('.pst-row').length === 3);
                    assert.equal(await p.$$eval('#workspace [data-pst-rest]', l => l.length), 0);
                    assert.match(await p.textContent('#workspace [data-pst-more]'), /Voir 2 de plus/, '« Voir plus » compte la page du serveur, pas les pistes ajoutées');
                    await setFrames(p, false); await open();
                    assert.equal(await p.$$eval('#workspace .ui-person-card', l => l.length), 0); assert.equal(await p.$$eval('#workspace .pst-who', l => l.length), 3);
                    await setFrames(p, true);
                }
            });

            await t(`🧩 Ce qui manque (Ma semaine) : un tbody par personne, en-tête comme un cadre — ${tag}`, async () => {
                await setFrames(p, true);
                await go.module('dashboard')(p);
                const draw = () => p.evaluate(async () => { const ws = document.querySelector('#workspace'); let h = ws.querySelector('[data-test-needs]'); if (!h) { h = document.createElement('section'); h.className = 'page'; h.dataset.testNeeds = ''; ws.prepend(h); } await window.LCNDA_EXT.cxNeeds.semaineHtml(h, {reload: true}); });
                await p.waitForFunction(() => window.LCNDA_EXT?.cxNeeds?.semaineHtml); await draw(); await settle(p);
                assert.deepEqual(await cardNames(p, '[data-test-needs]'), ['Anne LACOMBE', 'Louis MAZAUD']);
                assert.equal(await p.$$eval('[data-test-needs] tbody.ui-person-tb', l => l.length), 2);
                assert.equal(await p.$$eval('[data-test-needs] tbody.ui-person-tb:first-of-type > tr:not(.ui-person-tb-head)', l => l.length), 2);
                assert.match(await p.textContent('[data-test-needs] .ui-person-card-count'), /2 choses qui manquent/);
                const over = await p.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth); assert.ok(over <= 1, 'pas de défilement de côté');
                if (full) { await setFrames(p, false); await draw(); assert.equal(await p.$$eval('[data-test-needs] tbody.ui-person-tb', l => l.length), 0); assert.equal(await p.$$eval('[data-test-needs] tbody tr', l => l.length), 3); await setFrames(p, true); }
            });

            await t(`⚰️ Décès possibles : un cadre par fiche de l’arbre, ses fiches INSEE dedans, ✓ / ✗ par fiche — ${tag}`, async () => {
                await setFrames(p, true);
                const open = async () => { await go.settings('veille_deces')(p); await p.waitForSelector('#workspace [data-vd-card]', {timeout: 30000}); await settle(p); };
                await open();
                assert.deepEqual(await cardNames(p), ['Anne LACOMBE', 'Rose DURAND']);
                const c = await p.$eval('#workspace .ui-person-card', c => ({n: c.querySelectorAll('[data-vd-card]').length, yes: c.querySelectorAll('[data-vd-yes]').length, no: c.querySelectorAll('[data-vd-no]').length, mine: c.querySelectorAll('.vd-mine').length, life: c.querySelector('.ui-person-card-life')?.textContent}));
                assert.deepEqual([c.n, c.yes, c.no, c.mine], [2, 2, 2, 0]); assert.match(c.life, /1895.*Tulle/);
                await looks(p, '#workspace', dark);
                if (full) { await setFrames(p, false); await open(); assert.equal(await p.$$eval('#workspace .ui-person-card', l => l.length), 0); assert.equal(await p.$$eval('#workspace .vd-mine', l => l.length), 3); await setFrames(p, true); }
            });

            await t(`💡 Suggestions (tableau de bord) et 🗓 Ma semaine « Par sorte » : des cadres légers par personne — ${tag}`, async () => {
                await setFrames(p, true);
                await p.waitForFunction(() => window.LCNDA_EXT?.dashboard?.research_suggestions && window.LCNDA_EXT?.semaine?.bodyHtml);
                const draw = () => p.evaluate(({ID}) => {
                    const E = window.LCNDA_EXT, ws = document.querySelector('#workspace');
                    let h = ws.querySelector('[data-test-light]'); if (!h) { h = document.createElement('section'); h.className = 'page'; h.dataset.testLight = ''; ws.prepend(h); }
                    const it = (pid, name, kind, sosa) => ({person_id: pid, name, kind, sosa, generation: 3, gender: 'female', from: 1890, to: 1900, place: 'Tulle', why: 'ses enfants'});
                    const sugg = E.dashboard.research_suggestions.render(0, {limit: 8}, 'span-12', {root_id: ID.jean, total: 3, items: [it(ID.anne, 'Anne LACOMBE', 'death', 5), it(ID.anne, 'Anne LACOMBE', 'marriage', 5), it(ID.rose, 'Rose DURAND', 'death', 7)]});
                    const row = (k, pid, name, title) => ({key: k, sort: 'manque', urgency: 'later', person_id: pid, person: name, sosa: 5, title, detail: '', open: {kind: 'gaps', id: pid}});
                    const sem = E.semaine.bodyHtml({today: '2026-11-26', items: [row('m1', ID.anne, 'Anne LACOMBE', 'Décès d’Anne'), row('m2', ID.rose, 'Rose DURAND', 'Décès de Rose'), row('m3', ID.anne, 'Anne LACOMBE', 'Mariage d’Anne')], done: [], counts: {}}, E.semaine.cfgOf({config: {group: 'sorte'}, limit: 1}));
                    h.innerHTML = `<div class="card-grid">${sugg}</div><div class="card" data-test-sem>${sem}</div>`;
                }, {ID});
                await draw(); await settle(p);
                assert.deepEqual(await cardNames(p, '[data-test-light] .card-grid'), ['Anne LACOMBE', 'Rose DURAND']);
                assert.equal(await p.$$eval('[data-test-light] .card-grid .ui-person-card.is-light', l => l.length), 2);
                assert.deepEqual(await cardNames(p, '[data-test-sem]'), ['Anne LACOMBE', 'Rose DURAND']);
                assert.deepEqual(await p.$$eval('[data-test-sem] .msr-pc', l => l.map(x => x.hidden)), [false, true], '« Voir les suivants » compte les cadres');
                assert.equal(await p.$$eval('[data-test-sem] .msr-pc:first-child .msr-row', l => l.length), 2);
                await p.click('[data-test-sem] [data-msr-more]'); assert.deepEqual(await p.$$eval('[data-test-sem] .msr-pc', l => l.map(x => x.hidden)), [false, false]);
                await looks(p, '[data-test-light]', dark);
                if (full) { await setFrames(p, false); await draw(); assert.equal(await p.$$eval('[data-test-light] .ui-person-card', l => l.length), 0); assert.equal(await p.$$eval('[data-test-light] .h-sugg li', l => l.length), 3); await setFrames(p, true); }
            });

            await t(`🏛️ Actes manquants (Trésors) : un tbody par personne, en-tête « Sosa · génération », tri par colonne gardé — ${tag}`, async () => {
                await setFrames(p, true);
                const open = async () => { await go.liste('tr_gaps')(p); await p.waitForSelector('#workspace .h-trl-table', {timeout: 30000}); await settle(p); };
                await open();
                const n = await p.$$eval('#workspace .h-trl-table tbody.ui-person-tb', l => l.length);
                assert.ok(n >= 2, 'plusieurs personnes : ' + n);
                assert.equal(await p.$$eval('#workspace .h-trl-table tbody:not(.ui-person-tb)', l => l.length), 0);
                assert.match(await p.textContent('#workspace .h-trl-table .ui-person-card-sub'), /Sosa \d+ · génération \d+/);
                assert.match(await p.textContent('#workspace .h-trl-table .ui-person-card-count'), /acte/);
                const over = await p.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth); assert.ok(over <= 1, 'pas de défilement de côté');
                if (full) { await setFrames(p, false); await open(); assert.equal(await p.$$eval('#workspace .h-trl-table tbody', l => l.length), 1); await setFrames(p, true); }
            });

            await t(`Fusion de doublons : un cadre seulement pour une fiche qui a plusieurs paires ; ⚖️ Comparer toujours là — ${tag}`, async () => {
                await setFrames(p, true);
                const open = async () => { await go.settings('duplicates')(p); await p.waitForSelector('#workspace .issue-list .issue', {timeout: 30000}); await settle(p); };
                await open();
                assert.deepEqual(await cardNames(p), ['Louis MAZAUD']);
                assert.equal(await p.$$eval('#workspace .ui-person-card .issue', l => l.length), 2);
                assert.equal(await p.$$eval('#workspace .issue-list > .issue', l => l.length), 1, 'la paire seule reste comme avant');
                assert.equal(await p.$$eval('#workspace .issue [data-h-compare]', l => l.length), 3);
                await looks(p, '#workspace', dark);
                if (full) { await setFrames(p, false); await open(); assert.equal(await p.$$eval('#workspace .ui-person-card', l => l.length), 0); assert.equal(await p.$$eval('#workspace .issue-list > .issue', l => l.length), 3); await setFrames(p, true); }
            });

            await t(`Journal, Notes, Enquêtes : « Ranger par personne » non au départ (l’ordre des dates), coché → un cadre par personne — ${tag}`, async () => {
                await setFrames(p, true);
                await p.evaluate(() => ['journal', 'notes', 'enquetes'].forEach(k => localStorage.removeItem('genealogie-cadres:' + k)));
                // Journal
                const openJ = async () => { await go.liste('research_journal')(p); await p.waitForSelector('#workspace [data-rj-key]', {timeout: 30000}); await settle(p); };
                await openJ();
                assert.equal(await p.$$eval('#workspace .ui-person-card', l => l.length), 0, 'non au départ');
                await p.click('#workspace [data-frames-opt="journal"]'); await settle(p);
                assert.deepEqual(await cardNames(p), ['Anne LACOMBE', 'Louis MAZAUD']);
                await looks(p, '#workspace', dark);
                // Notes
                const openN = async () => { await go.liste('notes_list')(p); await p.waitForSelector('#workspace .lp-notes tr[data-sel-id]', {timeout: 30000}); await settle(p); };
                await openN();
                assert.equal(await p.$$eval('#workspace tbody.ui-person-tb', l => l.length), 0);
                await p.click('#workspace [data-frames-opt="notes"]'); await settle(p);
                assert.deepEqual(await cardNames(p), ['Anne LACOMBE', 'Louis MAZAUD']);
                assert.equal(await p.$$eval('#workspace .lp-notes tr[data-sel-id] [data-sel-check]', l => l.length), 3, 'la barre de sélection coche toujours chaque note');
                // Enquêtes
                const openE = async () => { await closeDialogs(p); await p.evaluate(() => { const A = window.LCNDA_APP; A.state.enquetesTab = 'enquetes'; A.state.currentInvestigationId = 0; A.state.investigationDisplay = 'list'; A.setModule('enquetes'); }); await p.waitForSelector('#workspace .enq-list-page [data-enq-row]', {timeout: 30000}); await settle(p); };
                await openE();
                assert.equal(await p.$$eval('#workspace tbody.ui-person-tb', l => l.length), 0);
                await p.click('#workspace [data-frames-opt="enquetes"]'); await p.waitForSelector('#workspace tbody.ui-person-tb'); await settle(p);
                assert.deepEqual(await cardNames(p), ['Anne LACOMBE', 'Louis MAZAUD']);
                if (full) {
                    await p.click('#workspace .enq-list-page [data-sort-column="1"]');
                    assert.deepEqual(await p.$$eval('#workspace tbody.ui-person-tb:first-of-type tr[data-enq-row] td:nth-child(2)', l => l.map(x => x.textContent)), ['Le mariage d’Anne', 'Les parents d’Anne'], 'le tri par colonne range dans chaque cadre');
                    assert.equal(await p.$$eval('#workspace tbody.ui-person-tb:first-of-type > tr:first-child.ui-person-tb-head', l => l.length), 1, 'l’en-tête reste en tête');
                    await setFrames(p, false); await openE();
                    assert.equal(await p.$$eval('#workspace [data-frames-opt]', l => l.length), 0, 'réglage général enlevé : pas de case');
                    assert.equal(await p.$$eval('#workspace tbody.ui-person-tb', l => l.length), 0);
                    await setFrames(p, true);
                }
            });

            await t(`🌍 Où chercher : un cadre par site, chaque bouton gardé ; réglage enlevé → les lignes d’avant — ${tag}`, async () => {
                await setFrames(p, true);
                const open = async () => { await closeDialogs(p); await p.evaluate(id => window.LCNDA_EXT.ouChercher.openPerson(id), ID.anne); await p.waitForSelector('#workspace .ouc-page .ouc-list .ouc-row', {timeout: 30000}); await settle(p); };
                await p.waitForFunction(() => window.LCNDA_EXT?.ouChercher?.openPerson);
                await open();
                const r = await p.$$eval('#workspace .ouc-page .ouc-list .ouc-row', l => ({n: l.length, cards: l.filter(x => x.classList.contains('ui-item-card')).length, go: l.filter(x => x.querySelector('[data-ouc-go]') && x.querySelector('[data-ouc-more]')).length}));
                assert.ok(r.n > 0); assert.equal(r.cards, r.n, 'chaque site dans son cadre'); assert.equal(r.go, r.n, '↗ Chercher et ⋯ gardés');
                await looks(p, '#workspace', dark, '.ui-item-card');
                if (full) { await setFrames(p, false); await open(); assert.equal(await p.$$eval('#workspace .ouc-row.ui-item-card', l => l.length), 0); await setFrames(p, true); }
            });

            await t(`pas d’erreur — ${tag}`, async () => { assert.deepEqual(p.errs, []); });
            await p.context().close();
        }
    } finally { await stop(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
