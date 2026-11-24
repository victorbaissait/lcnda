'use strict';
/**
 * ⚖️ Généalogiste successoral — le droit en plus (assets/js/heritage-successoral-droit-core.js), sans serveur :
 *     node tests/test-successoral-droit.js
 * La loi de l'époque (conjoint en usufruit avant 2002, enfant naturel avant 1972, adultérin avant 2002, filiation déduite et corrigée),
 * les successions en cascade, la réserve et la quotité disponible (1, 2, 3 enfants ; conjoint seul), donations rapportables et hors
 * part, legs réduits, donation entre époux, régime matrimonial, droits de succession (barèmes 2024) et délais, étranger.
 * Puis le serveur (lib/successoral_droit.php) : ce qui est gardé, nettoyé, et rien en euros.
 */
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const S = require('../assets/js/heritage-successoral-core.js');
const X = require('../assets/js/heritage-successoral-droit-core.js');
let failed = 0;
const t = (name, fn) => { try { fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const same = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m);
/* un petit constructeur de familles : P(id, prénom, sexe, naissance, décès ('AAAA-MM-JJ' | 'AAAA' | null), statut) */
function fam() {
    const g = {persons: {}, parents: [], unions: []};
    const api = {
        g,
        P(id, first, gender, birth, death = null, status = null, extra = {}) {
            g.persons[id] = {id, first, last: extra.last || 'MAZAUD', gender: gender === 'f' ? 'female' : gender === 'm' ? 'male' : 'unknown', birth: {date: birth ? String(birth) : '', year: birth ? Number(String(birth).slice(0, 4)) : null},
                death: death ? {date: String(death), year: Number(String(death).slice(0, 4))} : null, status: status || (death ? 'deceased' : 'living'), dead_event: !!death, children_status: extra.children || 'unknown'};
            return api;
        },
        kid(child, ...parents) { parents.forEach(p => g.parents.push({child, parent: typeof p === 'object' ? p.id : p, rel: typeof p === 'object' ? p.rel : 'biological'})); return api; },
        union(id, a, b, o = {}) { g.unions.push({id, a, b, married: 'married' in o ? o.married : true, marriage: {date: o.date || ''}, divorced: !!o.divorced, divorce: {date: o.divDate || ''}, free: !!o.free}); return api; },
    };
    return api;
}

const shareOf = (H, id) => { const s = H.shares.find(x => x.id === id); return s ? (s.usufruct ? 'u' + X.str(s.usufruct) : X.str(s.share)) : '0'; };
const run = (g, dead, date, extra = {}) => S.compute(g, {deceasedId: dead, deathDate: date, ...extra});
const hist = (g, dead, date, o = {}) => { const R = run(g, dead, date); return X.historical(R, g, {recompute: e => run(g, dead, date, e), ...o}); };

t('la loi de l’époque : les bonnes dates', () => {
    same(['1900-01-01', '1950-06-01', '1972-07-31', '1972-08-01', '2002-06-30', '2002-07-01', '2006-12-31', '2007-01-01', ''].map(X.regimeOf), ['y1917', 'y1918', 'y1918', 'y1972', 'y1972', 'y2002', 'y2002', 'today', 'today']);
});
t('avant 2002 : le conjoint a l’usufruit (¼ avec des enfants), la propriété va aux enfants', () => {
    const f = fam().P(1, 'Pierre', 'm', 1920, '1990-05-01').P(2, 'Marie', 'f', 1925).P(3, 'Jean', 'm', 1950).P(4, 'Louise', 'f', 1952).union(1, 1, 2, {date: '1948-06-01'}).kid(3, 1, 2).kid(4, 1, 2);
    const H = hist(f.g, 1, '1990-05-01'); assert.equal(H.regime, 'y1972');
    assert.equal(shareOf(H, 2), 'u1/4'); assert.equal(shareOf(H, 3), '1/2'); assert.equal(shareOf(H, 4), '1/2');
    const H2 = hist(f.g, 1, '2010-05-01'); assert.equal(shareOf(H2, 2), '1/4'); assert.equal(shareOf(H2, 3), '3/8');
});
t('avant 2002, sans enfant : usufruit de la moitié pour le conjoint ; seul héritier : tout', () => {
    const f = fam().P(1, 'Pierre', 'm', 1920, '1980-05-01').P(2, 'Marie', 'f', 1925).P(5, 'Paul', 'm', 1890, '1950').P(6, 'Rose', 'f', 1895, '1960').P(7, 'Luc', 'm', 1922).union(1, 1, 2, {date: '1950-06-01'}).kid(1, 5, 6).kid(7, 5, 6);
    const H = hist(f.g, 1, '1980-05-01'); assert.equal(shareOf(H, 2), 'u1/2'); assert.equal(shareOf(H, 7), '1');
    const g2 = fam().P(1, 'Pierre', 'm', 1920, '1980-05-01').P(2, 'Marie', 'f', 1925).union(1, 1, 2, {date: '1950-06-01'});
    assert.equal(shareOf(hist(g2.g, 1, '1980-05-01'), 2), '1', 'seul : la propriété');
});
t('enfant naturel (avant 1972) : moitié de part ; adultérin : rien avant 1972, moitié jusqu’en 2002 ; la filiation se corrige', () => {
    const f = fam().P(1, 'Pierre', 'm', 1900, '1960-05-01').P(2, 'Marie', 'f', 1905, '1950').P(9, 'Anne', 'f', 1910).P(3, 'Jean', 'm', 1930).P(4, 'Louis', 'm', 1940).P(8, 'Rose', 'f', 1945)
        .union(1, 1, 2, {date: '1928-01-01'}).kid(3, 1, 2).kid(4, 1, 9).kid(8, 1, 9).union(2, 1, 9, {married: false, free: true});
    assert.equal(X.filiationOf(f.g, 1, 3), 'legitime'); assert.equal(X.filiationOf(f.g, 1, 4), 'adulterine', 'Pierre marié à Marie en 1940');
    const H = hist(f.g, 1, '1960-05-01'); assert.equal(shareOf(H, 3), '1'); assert.equal(shareOf(H, 4), '0');
    const H2 = hist(f.g, 1, '1960-05-01', {overrides: {4: {filiation: 'naturelle'}, 8: {filiation: 'naturelle'}}}); assert.equal(shareOf(H2, 3), '1/2'); assert.equal(shareOf(H2, 4), '1/4'); assert.equal(shareOf(H2, 8), '1/4');
    const H3 = hist(f.g, 1, '1990-05-01'); assert.equal(shareOf(H3, 3), '1/2'); assert.equal(shareOf(H3, 4), '1/4');
    const H4 = hist(f.g, 1, '2010-05-01'); assert.equal(shareOf(H4, 3), '1/3');
});
t('en cascade : un héritier mort après le défunt passe sa part à ses héritiers', () => {
    const f = fam().P(1, 'Pierre', 'm', 1920, '2010-05-01').P(3, 'Jean', 'm', 1950, '2012-01-01').P(4, 'Louise', 'f', 1952).P(5, 'Paul', 'm', 1975).P(6, 'Lise', 'f', 1978).kid(3, 1).kid(4, 1).kid(5, 3).kid(6, 3);
    const R = run(f.g, 1, '2010-05-01'), C = X.cascade(R.rows.filter(r => r.share !== '0').map(r => ({id: r.id, share: r.share})), f.g, {deathDate: '2010-05-01', compute: (g, o) => S.compute(g, o)});
    assert.equal(C.steps.length, 1); assert.equal(C.steps[0].from, 3);
    same(C.shares.map(s => [s.id, X.str(s.share)]).sort(), [[4, '1/2'], [5, '1/4'], [6, '1/4']]); assert.equal(C.total, '1');
});
t('réserve : 1 enfant ½, 2 enfants ⅔, 3 et plus ¾ ; conjoint seul ¼', () => {
    same([X.reserveOf(1, false), X.reserveOf(2, false), X.reserveOf(3, false), X.reserveOf(5, false), X.reserveOf(0, true), X.reserveOf(0, false)].map(X.str), ['1/2', '2/3', '3/4', '3/4', '1/4', '0']);
});
t('testament et donations : rapport, legs réduit, total juste', () => {
    const L = X.liberalites({net: 300000, shares: [{id: 2, share: '1/2', role: 'heir'}, {id: 3, share: '1/2', role: 'heir'}], childrenCount: 2, donations: [{to: 2, amount: 60000}], legs: [{to: 9, kind: 'amount', amount: 150000}]});
    assert.equal(L.masse, 360000); assert.equal(L.reserve, 240000); assert.equal(L.qd, 120000);
    same(L.rows.map(r => [r.id, r.aRecevoir]), [[2, 60000], [3, 120000], [9, 120000]]); assert.equal(L.reductions[0].to_c, 120000);
    assert.equal(L.rows.reduce((s, r) => s + r.aRecevoir, 0), 300000, 'tout l’actif est partagé');
    const H = X.liberalites({net: 100000, shares: [{id: 2, share: '1', role: 'heir'}], childrenCount: 1, donations: [{to: 7, amount: 80000, hors: true}]});
    assert.equal(H.qd, 90000); assert.equal(H.rows.find(r => r.id === 7).liberalites, 80000); assert.equal(H.rows.find(r => r.id === 2).aRecevoir, 100000);
});
t('donation entre époux : ¼ en propriété et ¾ en usufruit (valeur selon l’âge), la quotité disponible', () => {
    const sh = [{id: 1, share: '1/4', role: 'spouse'}, {id: 2, share: '3/8', role: 'heir'}, {id: 3, share: '3/8', role: 'heir'}];
    const Q = X.liberalites({net: 200000, shares: sh, childrenCount: 2, spouseId: 1, spouseDonation: 'quart_pp_usu', usufructAge: 75});
    const sp = Q.rows.find(r => r.id === 1); assert.equal(sp.liberalites, 50000); assert.equal(sp.usufruit, 45000, '30 % de 150 000 à 75 ans');
    assert.equal(Q.rows.find(r => r.id === 2).abIntestat, 75000);
    const D2 = X.liberalites({net: 200000, shares: sh, childrenCount: 2, spouseId: 1, spouseDonation: 'qd'}); assert.equal(D2.rows.find(r => r.id === 1).liberalites, 66666.67, 'le tiers, au centime');
});
t('régime matrimonial : communauté (moitié au conjoint d’abord), séparation, universelle avec attribution', () => {
    same(X.regime({kind: 'communaute', propres: 50000, communs: 200000}).succession, 150000);
    same(X.regime({kind: 'separation', propres: 50000, communs: 200000}).succession, 50000);
    same(X.regime({kind: 'universelle', propres: 50000, communs: 200000, attribution: true}).succession, 0);
});
t('droits de succession : enfant, frère, neveu, conjoint, handicap ; délais', () => {
    same(X.droits(180000, 'enfant'), {abattement: 100000, taxable: 80000, droits: 14194, exonere: false});
    same(X.droits(50000, 'frere').droits, 12888); same(X.droits(20000, 'neveu').droits, Math.round((20000 - 7967) * .55));
    assert.equal(X.droits(500000, 'conjoint').exonere, true); assert.equal(X.droits(200000, 'enfant', {handicap: true}).droits, 0);
    same(X.delais('2026-05-10', {today: new Date(2026, 10, 24)}), {declaration: '2026-11-10', days: -14, late: true});
    assert.equal(X.delais('2026-05-10', {abroad: true}).declaration, '2027-05-10');
    assert.equal(X.lienOf({role: 'heir', a: 0, b: 1}), 'enfant'); assert.equal(X.lienOf({role: 'heir', a: 1, b: 2, deg: 3}), 'neveu'); assert.equal(X.lienOf({role: 'heir', a: 2, b: 2, deg: 4}), 'parent4');
});
t('à l’étranger : un avertissement (résidence, biens, nationalité) ; rien pour la France', () => {
    assert.equal(X.abroad({residence: 'France'}).length, 0); assert.equal(X.abroad({residence: 'Belgique', biensEtranger: true, nationalite: 'belge'}).length, 3);
});
/* le serveur : ce qui est gardé (jamais un montant), nettoyé */
t('serveur : la loi, la filiation, le régime, le suivi des héritiers, nettoyés ; rien en euros', () => {
    const php = spawnSync('php', ['-r', String.raw`
function safe_text($s) { return trim(strip_tags((string) $s)); } function safe_int($v) { return (int) $v; }
require 'lib/successoral_droit.php';
echo json_encode([succ_droit_clean_droit(['law' => 'x', 'filiation' => ['4' => 'naturelle', '5' => 'bidon', '-3' => 'legitime'], 'matrim' => 'universelle', 'attribution' => 1, 'net' => 300000, 'handicap' => [3, 3, 'a']]),
    succ_droit_clean_suivi(['7' => ['stage' => 'signe', 'next' => '<b>Appeler</b>', 'remind' => '2026-13-99', 'sources' => [['what' => 'INSEE', 'state' => 'trouve', 'date' => '2026-01-02'], ['what' => '']]], 'x' => []])]);`], {cwd: path.join(__dirname, '..'), encoding: 'utf8'});
    const [dr, su] = JSON.parse(php.stdout);
    assert.equal(dr.law, 'auto'); same(dr.filiation, {4: 'naturelle'}); assert.equal(dr.matrim, 'universelle'); assert.equal(dr.attribution, true); assert.equal(dr.net, undefined, 'aucun montant gardé'); same(dr.handicap, [3]);
    same(su, {7: {stage: 'signe', next: 'Appeler', remind: '', sources: [{what: 'INSEE', state: 'trouve', date: '2026-01-02', note: ''}]}});
});
console.log(failed ? `${failed} essai(s) en échec` : 'Le droit en plus du successoral marche.');
process.exit(failed ? 1 : 0);
