'use strict';
/**
 * ⚖️ Généalogiste successoral — le moteur de la dévolution (assets/js/heritage-successoral-core.js), sans serveur :
 *     node tests/test-successoral-core.js
 * Conjoint (art. 757 à 757-2), 4 ordres (art. 734), représentation (art. 752 à 755), renonçant, frères et sœurs de lits
 * différents à parts égales (loi du 3 décembre 2001), un ou deux parents (art. 736 à 738-1), fente aux 3e et 4e ordres
 * (art. 747 à 750), rien au-delà du 6e degré (art. 745), adoption plénière / simple, enfant conçu, divorce, PACS,
 * hypothèses quand un statut est inconnu, parts exactes qui totalisent 1, avertissements de date, pièces justificatives,
 * liste de contrôle, journal, liens Légifrance de chaque article cité.
 */
const assert = require('node:assert/strict');
const S = require('../assets/js/heritage-successoral-core.js');
let failed = 0;
const t = (name, fn) => { try { fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

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
const shares = r => Object.fromEntries(r.rows.filter(x => x.role !== 'out' && x.role !== 'souche' && x.share !== '0').map(x => [x.name.split(' ')[0], x.share]));
const total = r => S.str(S.sumAll(r._main.shares.map(s => s.share)));
const run = (f, dead, o = {}) => S.compute(f.g, {deceasedId: dead, ...o});

/* ═════ L'exemple de la maquette : Marcel MAZAUD († 3 mars 2026) ═════ */
function marcel() {
    return fam()
        .P(1, 'Louis', 'm', 1900, '1980-06-01').P(2, 'Hélène', 'f', 1902, '1930-01-10', null, {last: 'PEYRAT'}).P(3, 'Marie', 'f', 1910, '1995-02-02', null, {last: 'BESSE'})
        .P(10, 'Marcel', 'm', 1938, '2026-03-03').P(11, 'Jeanne', 'f', 1940, '2019-02-11', null, {last: 'LACOMBE'})
        .P(20, 'André', 'm', 1926, null, 'unknown').P(21, 'Paul', 'm', 1936, '2010-05-05').P(22, 'Suzanne', 'f', 1941).P(23, 'Jean', 'm', 1922, '1944-08-01')
        .P(30, 'Claire', 'f', 1962).P(31, 'Henri', 'm', 1965, '2018-04-04').P(40, 'Lucas', 'm', 1993).P(41, 'Emma', 'f', 1996)
        .union(100, 1, 2, {date: '1925'}).union(101, 1, 3, {date: '1935'}).union(102, 10, 11, {date: '1962'})
        .kid(20, 1, 2).kid(10, 1, 3).kid(21, 1, 3).kid(22, 1, 3).kid(23, 1, 3).kid(30, 21).kid(31, 21).kid(40, 31).kid(41, 31);
}

t('Marcel : 2e ordre, père et mère morts, frères et sœurs de lits différents à PARTS ÉGALES (droit actuel), représentation de Paul et d’Henri', () => {
    const r = run(marcel(), 10);
    assert.equal(r.order, 2); assert.equal(r.spouse, null, 'Jeanne est morte avant : pas de conjoint');
    assert.deepEqual(shares(r), {André: '1/3', Suzanne: '1/3', Claire: '1/6', Lucas: '1/12', Emma: '1/12'});
    assert.equal(total(r), '1');
    const paul = r.rows.find(x => x.id === 21); assert.equal(paul.role, 'souche'); assert.equal(paul.share, '1/3');
    assert.equal(r.rows.find(x => x.id === 31).role, 'souche'); assert.equal(r.rows.find(x => x.id === 40).via, 'repr');
    const jean = r.rows.find(x => x.id === 23); assert.equal(jean.role, 'out'); assert.equal(jean.share, '0');
    assert.equal(r.rows.find(x => x.id === 20).kin, 'demi-frère (même père)');
    assert.equal(r.rows.find(x => x.id === 22).kin, 'sœur germaine');
    assert.equal(r.rows.find(x => x.id === 40).kin, 'petit-neveu'); assert.equal(r.rows.find(x => x.id === 41).deg, 4);
    assert.ok(r.notes.some(n => /parts égales/.test(n)));
});
t('Marcel : André (statut inconnu) → une autre hypothèse : Suzanne 1/2, Claire 1/4, Lucas 1/8, Emma 1/8 ; branches à chercher', () => {
    const r = run(marcel(), 10);
    assert.equal(r.hypotheses.length, 1);
    const h = r.hypotheses[0]; assert.match(h.label, /André MAZAUD est mort avant sans descendant/);
    assert.deepEqual(Object.fromEntries(h.shares.map(s => [s.name.split(' ')[0], s.share])), {Suzanne: '1/2', Claire: '1/4', Lucas: '1/8', Emma: '1/8'});
    assert.equal(h.total, '1');
    const kinds = r.search.map(s => `${s.kind}:${s.id}`);
    assert.ok(kinds.includes('unknown:20')); assert.ok(kinds.includes('nodesc:23'));
    const r2 = run(marcel(), 10, {addresses: {22: true, 30: true, 40: true}});
    assert.ok(r2.search.some(s => s.kind === 'address' && s.id === 41), 'Emma : pas d’adresse');
    assert.ok(!r2.search.some(s => s.kind === 'address' && s.id === 22));
});
t('si André a des enfants et meurt avant : ils le représentent (hypothèse) ; dit « mort avant » à la main : plus d’hypothèse', () => {
    const f = marcel().P(50, 'Rémi', 'm', 1950).kid(50, 20);
    const r = run(f, 10);
    assert.match(r.hypotheses[0].label, /représenté par ses descendants/);
    assert.deepEqual(Object.fromEntries(r.hypotheses[0].shares.map(s => [s.name.split(' ')[0], s.share])).Rémi, '1/3');
    const r2 = run(f, 10, {overrides: {20: {status: 'dead_before'}}});
    assert.equal(r2.hypotheses.length, 0); assert.equal(shares(r2).Rémi, '1/3');
});

/* ═════ 1er ordre ═════ */
const base = () => fam().P(1, 'Défunt', 'm', 1940, '2025-05-01').P(2, 'Épouse', 'f', 1942);
t('conjoint + deux enfants communs : ¼ au conjoint, 3/8 chacun, option usufruit (art. 757)', () => {
    const f = base().P(3, 'Anne', 'f', 1965).P(4, 'Bruno', 'm', 1968).union(9, 1, 2).kid(3, 1, 2).kid(4, 1, 2);
    const r = run(f, 1);
    assert.deepEqual(shares(r), {Épouse: '1/4', Anne: '3/8', Bruno: '3/8'}); assert.equal(r.spouseOption, 'usufruit'); assert.equal(r.order, 1);
    assert.equal(r.rows.find(x => x.role === 'spouse').kin, 'épouse'); assert.equal(total(r), '1');
});
t('conjoint + un enfant d’un autre lit : ¼ en propriété, pas d’option usufruit', () => {
    const f = base().P(5, 'Première', 'f', 1941, '1970').P(3, 'Anne', 'f', 1965).P(4, 'Bruno', 'm', 1975).union(8, 1, 5).union(9, 1, 2).kid(3, 1, 5).kid(4, 1, 2);
    const r = run(f, 1);
    assert.deepEqual(shares(r), {Épouse: '1/4', Anne: '3/8', Bruno: '3/8'}); assert.equal(r.spouseOption, null);
});
t('enfant prédécédé représenté par ses deux enfants, un autre enfant vivant : 1/2, 1/4, 1/4 ; arrière-petit-enfant à l’infini', () => {
    const f = fam().P(1, 'Défunt', 'm', 1930, '2024-01-01').P(2, 'Anne', 'f', 1955).P(3, 'Bruno', 'm', 1957, '2000').P(4, 'Chloé', 'f', 1980).P(5, 'Denis', 'm', 1982, '2010').P(6, 'Eva', 'f', 2005)
        .kid(2, 1).kid(3, 1).kid(4, 3).kid(5, 3).kid(6, 5);
    const r = run(f, 1);
    assert.deepEqual(shares(r), {Anne: '1/2', Chloé: '1/4', Eva: '1/4'}); assert.equal(r.rows.find(x => x.id === 6).kin, 'arrière-petite-fille');
    assert.equal(r.rows.find(x => x.id === 6).deg, 3); assert.equal(total(r), '1');
});
t('tous les enfants morts avant : partage par souche même à degrés égaux (art. 752-753)', () => {
    const f = fam().P(1, 'Défunt', 'm', 1920, '2020-01-01').P(2, 'A', 'm', 1945, '2000').P(3, 'B', 'f', 1947, '2001').P(4, 'a1', 'm', 1970).P(5, 'b1', 'f', 1972).P(6, 'b2', 'f', 1974).P(7, 'b3', 'm', 1976)
        .kid(2, 1).kid(3, 1).kid(4, 2).kid(5, 3).kid(6, 3).kid(7, 3);
    assert.deepEqual(shares(run(f, 1)), {a1: '1/2', b1: '1/6', b2: '1/6', b3: '1/6'});
});
t('renonçant : ses enfants le représentent (depuis 2007) ; renonçant sans enfant : sa part accroît aux autres', () => {
    const f = fam().P(1, 'Défunt', 'm', 1930, '2024-01-01').P(2, 'Anne', 'f', 1955).P(3, 'Bruno', 'm', 1957).P(4, 'Chloé', 'f', 1980).P(5, 'Zoé', 'f', 1960).kid(2, 1).kid(3, 1).kid(4, 3).kid(5, 1);
    assert.deepEqual(shares(run(f, 1, {overrides: {3: {status: 'renonce'}, 5: {status: 'renonce'}}})), {Anne: '1/2', Chloé: '1/2'});
});
t('mort après le défunt : il hérite (sa part passe à ses propres héritiers) ; enfant conçu avant le décès hérite, pas celui né 400 jours après', () => {
    const f = fam().P(1, 'Défunt', 'm', 1950, '2024-01-10').P(2, 'Anne', 'f', 1975, '2024-06-01').P(3, 'Posthume', 'm', '2024-07-15').P(4, 'Tard', 'f', '2025-03-01').kid(2, 1).kid(3, 1).kid(4, 1);
    const r = run(f, 1);
    assert.deepEqual(shares(r), {Anne: '1/2', Posthume: '1/2'});
    assert.ok(r.search.some(s => s.kind === 'post' && s.id === 2));
});
t('adoption plénière : hérite de l’adoptant, plus de son parent d’origine ; simple : des deux', () => {
    const f = fam().P(1, 'Bio', 'm', 1940, '2024-01-01').P(2, 'Adoptant', 'f', 1945, '2023-01-01').P(3, 'Adopté', 'm', 1970).P(4, 'Autre', 'f', 1972).kid(3, 1, {id: 2, rel: 'adopted'}).kid(4, 1);
    const ple = run(f, 1, {overrides: {3: {adoption: 'pleniere'}}});
    assert.deepEqual(shares(ple), {Autre: '1'});
    const sim = run(f, 1, {overrides: {3: {adoption: 'simple'}}});
    assert.deepEqual(shares(sim), {Adopté: '1/2', Autre: '1/2'});
    const unk = run(f, 1); assert.ok(unk.search.some(s => s.kind === 'adoption' && s.id === 3), 'type d’adoption à préciser');
    const fromAdopter = run(f, 2, {overrides: {3: {adoption: 'pleniere'}}}); assert.deepEqual(shares(fromAdopter), {Adopté: '1'});
    const step = fam().P(1, 'Défunt', 'm', 1940, '2024-01-01').P(3, 'Beau', 'm', 1970).P(4, 'Frère', 'm', 1942).P(5, 'Père', 'm', 1910, '1990').kid(3, {id: 1, rel: 'step'}).kid(1, 5).kid(4, 5);
    assert.deepEqual(shares(run(step, 1)), {Frère: '1'}, 'un enfant du conjoint (beau-fils) n’hérite pas');
});

/* ═════ Conjoint sans descendant ═════ */
const parentsFam = () => fam().P(1, 'Défunt', 'm', 1960, '2024-01-01').P(2, 'Père', 'm', 1930).P(3, 'Mère', 'f', 1932).P(4, 'Frère', 'm', 1962).P(5, 'Sœur', 'f', 1965).kid(1, 2, 3).kid(4, 2, 3).kid(5, 2, 3);
t('conjoint + père et mère : ½, ¼, ¼ (art. 757-1) ; un seul parent : ¾ + ¼ ; sans parent : tout au conjoint, frères écartés (art. 757-2)', () => {
    const f = parentsFam().P(9, 'Épouse', 'f', 1962).union(9, 1, 9);
    assert.deepEqual(shares(run(f, 1)), {Épouse: '1/2', Père: '1/4', Mère: '1/4'});
    f.g.persons[3].death = {date: '2020-01-01', year: 2020};
    assert.deepEqual(shares(run(f, 1)), {Épouse: '3/4', Père: '1/4'});
    f.g.persons[2].death = {date: '2021-01-01', year: 2021};
    const r = run(f, 1); assert.deepEqual(shares(r), {Épouse: '1'}); assert.ok(r.notes.some(n => /757-3/.test(n)));
});
t('divorcé : pas conjoint ; union libre ou PACS : pas conjoint ; couple sans mariage noté : deux hypothèses', () => {
    const f = parentsFam().P(9, 'Ex', 'f', 1962).union(9, 1, 9, {divorced: true, divDate: '2010-01-01'});
    assert.equal(shares(run(f, 1)).Ex, undefined);
    const g = parentsFam().P(9, 'Amie', 'f', 1962).union(9, 1, 9, {free: true, married: null});
    assert.equal(shares(run(g, 1)).Amie, undefined);
    const h = parentsFam().P(9, 'Compagne', 'f', 1962).union(9, 1, 9, {married: null});
    const r = run(h, 1);
    assert.equal(shares(r).Compagne, '1/2'); assert.ok(r.search.some(s => s.kind === 'marriage'));
    assert.equal(r.hypotheses.length, 1); assert.match(r.hypotheses[0].label, /PACS/);
    assert.deepEqual(Object.fromEntries(r.hypotheses[0].shares.map(s => [s.name.split(' ')[0], s.share])), {Père: '1/4', Mère: '1/4', Frère: '1/4', Sœur: '1/4'});
    assert.equal(shares(run(h, 1, {spouse: {9: 'not'}})).Compagne, undefined);
});

/* ═════ 2e ordre sans conjoint ═════ */
t('père et mère + deux frères : ¼, ¼, ¼, ¼ (art. 738) ; un seul parent : ¼ + 3/8 + 3/8', () => {
    assert.deepEqual(shares(run(parentsFam(), 1)), {Père: '1/4', Mère: '1/4', Frère: '1/4', Sœur: '1/4'});
    const f = parentsFam(); f.g.persons[3].death = {date: '2000', year: 2000};
    assert.deepEqual(shares(run(f, 1)), {Père: '1/4', Frère: '3/8', Sœur: '3/8'});
});
t('demi-frères : même part que les germains (art. 744, loi de 2001)', () => {
    const f = parentsFam().P(6, 'Demi', 'm', 1955).P(7, 'Autre mère', 'f', 1931, '1958').kid(6, 2, 7);
    f.g.persons[2].death = {date: '2000', year: 2000}; f.g.persons[3].death = {date: '2001', year: 2001};
    const r = run(f, 1);
    assert.deepEqual(shares(r), {Frère: '1/3', Sœur: '1/3', Demi: '1/3'}); assert.equal(r.rows.find(x => x.id === 6).kin, 'demi-frère (même père)');
});
t('père et mère, sans frère ni sœur : ½ chacun (art. 736) ; un seul parent et des grands-parents de l’autre branche : ½ + ½ (art. 738-1)', () => {
    const f = fam().P(1, 'Défunt', 'm', 1980, '2024-01-01').P(2, 'Père', 'm', 1950).P(3, 'Mère', 'f', 1952).kid(1, 2, 3);
    assert.deepEqual(shares(run(f, 1)), {Père: '1/2', Mère: '1/2'});
    f.g.persons[3].death = {date: '2010', year: 2010};
    assert.deepEqual(shares(run(f, 1)), {Père: '1'}, 'pas d’ascendant de l’autre côté : le père prend tout');
    f.P(4, 'GPm', 'm', 1925).P(5, 'GMm', 'f', 1928).kid(3, 4, 5);
    const r = run(f, 1); assert.deepEqual(shares(r), {Père: '1/2', GPm: '1/4', GMm: '1/4'}); assert.ok(r.notes.some(n => /738-1/.test(n)));
});

/* ═════ 3e et 4e ordres : la fente ═════ */
function odette() {
    // Odette († 2025) : père Jacques (†), mère Rose (†) ; côté père : grands-parents † ; leur fils Marc († ) → Pierre (vivant), Anne († 2015) → Paul (vivant)
    // côté mère : grands-parents † ; arrière-grands-parents † → Léonie († , sœur de la grand-mère) → Enfant de Léonie (inconnu, 5e) ; Germaine : cousine issue de germains (6e)
    return fam()
        .P(1, 'Odette', 'f', 1950, '2025-04-04', null, {last: 'LACOMBE'}).P(2, 'Jacques', 'm', 1920, '1990', null, {last: 'LACOMBE'}).P(3, 'Rose', 'f', 1925, '1999', null, {last: 'VIDAL'}).kid(1, 2, 3)
        .P(10, 'GPp', 'm', 1890, '1960').P(11, 'GMp', 'f', 1892, '1965').kid(2, 10, 11).P(12, 'Marc', 'm', 1922, '1980').kid(12, 10, 11)
        .P(13, 'Pierre', 'm', 1950).P(14, 'Anne', 'f', 1948, '2015').kid(13, 12).kid(14, 12).P(15, 'Paul', 'm', 1975).kid(15, 14)
        .P(20, 'GPm', 'm', 1895, '1970').P(21, 'GMm', 'f', 1898, '1975').kid(3, 20, 21)
        .P(30, 'AGP', 'm', 1870, '1940').P(31, 'AGM', 'f', 1872, '1945').kid(21, 30, 31).P(32, 'Léonie', 'f', 1900, '1980', null, {last: 'VIDAL'}).kid(32, 30, 31)
        .P(33, 'EnfantLéonie', 'm', 1925, null, 'unknown').kid(33, 32)
        .P(34, 'Oncle2', 'm', 1902, '1970').kid(34, 30, 31).P(35, 'Cousin2', 'm', 1930, '2000').kid(35, 34).P(36, 'Germaine', 'f', 1958).kid(36, 35);
}
t('4e ordre (Odette) : moitié par branche, le plus proche en degré dans chacune, pas de représentation entre cousins (art. 749-750)', () => {
    const r = run(odette(), 1);
    assert.equal(r.order, 4);
    assert.deepEqual(shares(r), {Pierre: '1/2', EnfantLéonie: '1/2'});
    assert.equal(shares(r).Paul, undefined, 'les enfants d’Anne ne la représentent pas');
    assert.equal(r.rows.find(x => x.id === 13).kin, 'cousin germain'); assert.equal(r.rows.find(x => x.id === 13).deg, 4);
    assert.equal(r.rows.find(x => x.id === 33).deg, 5); assert.equal(r.rows.find(x => x.id === 33).kin, 'cousin germain d’un parent');
    const h = r.hypotheses.find(x => x.flips.includes(33));
    assert.deepEqual(Object.fromEntries(h.shares.map(s => [s.name.split(' ')[0], s.share])), {Pierre: '1/2', Germaine: '1/2'}, 'sans l’enfant de Léonie, Germaine (6e) prend la moitié maternelle');
    assert.equal(total(r), '1');
});
t('4e ordre : plus personne dans une branche → l’autre prend tout ; 3e ordre : un grand-parent vivant d’un côté prend tout, même devant les cousins', () => {
    const f = odette(); f.g.persons[33].status = 'deceased'; f.g.persons[33].death = {date: '1990', year: 1990}; f.g.persons[36].death = {date: '2020', year: 2020};
    assert.deepEqual(shares(run(f, 1)), {Pierre: '1'});
    const g = odette(); g.g.persons[21].death = null; g.g.persons[21].status = 'living'; g.g.persons[21].birth = {date: '1930', year: 1930}; g.g.persons[21].dead_event = false;
    const r = run(g, 1); assert.equal(r.order, 3); assert.deepEqual(shares(r), {GMm: '1'});
    const k = odette(); k.g.persons[11].death = null; k.g.persons[11].status = 'living'; k.g.persons[11].birth = {date: '1930', year: 1930}; k.g.persons[11].dead_event = false;
    k.g.persons[21].death = null; k.g.persons[21].status = 'living'; k.g.persons[21].birth = {date: '1932', year: 1932}; k.g.persons[21].dead_event = false;
    k.g.persons[20].death = null; k.g.persons[20].status = 'living'; k.g.persons[20].birth = {date: '1931', year: 1931}; k.g.persons[20].dead_event = false;
    assert.deepEqual(shares(run(k, 1)), {GMp: '1/2', GPm: '1/4', GMm: '1/4'});
});
t('rien au-delà du 6e degré : un parent au 7e seulement → déshérence (l’État), branches à chercher', () => {
    const f = fam().P(1, 'Seul', 'm', 1950, '2025-01-01').P(2, 'Père', 'm', 1920, '1990').kid(1, 2).P(3, 'GP', 'm', 1890, '1960').kid(2, 3).P(4, 'AGP', 'm', 1860, '1930').kid(3, 4)
        .P(5, 'GOncle', 'm', 1888, '1950').kid(5, 4).P(6, 'c1', 'm', 1915, '1990').kid(6, 5).P(7, 'c2', 'm', 1940, '2000').kid(7, 6).P(8, 'c3', 'm', 1965, '2010').kid(8, 7).P(9, 'Loin', 'f', 1990).kid(9, 8);
    const r = run(f, 1);
    assert.equal(r.rows.find(x => x.id === 9), undefined);
    assert.equal(r.escheat, true); assert.ok(r.notes.some(n => /l’État/.test(n)));
    assert.ok(r.search.some(s => s.kind === 'branch' || s.kind === 'parents'));
    f.P(10, 'Proche', 'm', 1945).kid(10, 6); // 6e degré : c1 est au 5e (mort), son fils au 6e
    assert.deepEqual(shares(run(f, 1)), {Proche: '1'});
});

/* ═════ Avertissements, pièces, contrôle, journal ═════ */
t('avertissement de date : avant 2002 (droit actuel calculé quand même), avant 2007 (renonçant), date inconnue', () => {
    const f = marcel(); f.g.persons[10].death = {date: '1999-05-14', year: 1999};
    const r = run(f, 10); assert.ok(r.warnings.some(w => w.kind === 'old' && /1er juillet 2002/.test(w.text))); assert.ok(r.rows.length > 0, 'le calcul est fait quand même');
    f.g.persons[10].death = {date: '2004-05-14', year: 2004}; assert.ok(run(f, 10).warnings.some(w => w.kind === 'mid'));
    f.g.persons[10].death = {date: '2026-03-03', year: 2026}; assert.deepEqual(run(f, 10).warnings, []);
});
t('pièces de Marcel : commun à tous, une liste par souche, Jean à écarter ; états en main / demandé / manquant', () => {
    const r = run(marcel(), 10);
    const P = S.pieces(r, marcel().g, {acts: {'D:10': {event_id: 1, label: 'Décès', place: 'Malvialle', year: 2026, media: true}, 'N:21': {event_id: 2, label: 'Naissance', year: 1936, media: true}}, states: {'N:30': 'asked'}});
    const common = P.groups.find(g => g.key === 'common').items.map(i => i.key);
    assert.deepEqual(common.sort(), ['D:1', 'D:10', 'D:11', 'D:3', 'N:10'].sort());
    const paul = P.groups.find(g => g.heirs?.includes(30)); assert.ok(paul, 'groupe de la souche de Paul');
    const keys = paul.items.map(i => i.key);
    for (const k of ['N:21', 'D:21', 'N:30', 'N:31', 'D:31', 'N:40', 'N:41']) assert.ok(keys.includes(k), k);
    assert.ok(P.groups.some(g => g.exclude && g.items[0].key === 'D:23'));
    const suz = P.groups.find(g => g.heirs?.includes(22)).items.map(i => i.key); assert.ok(suz.includes('N:22'));
    assert.equal(P.list.find(i => i.key === 'D:10').state, 'have'); assert.equal(P.list.find(i => i.key === 'N:30').state, 'asked'); assert.equal(P.list.find(i => i.key === 'N:22').state, 'missing');
    const ck = S.checklist(r, P, {});
    assert.equal(ck.ok, false); assert.ok(ck.items.find(i => i.key === 'hypo' && !i.ok));
    const all = Object.fromEntries(P.list.map(i => [i.key, 'have']));
    const ck2 = S.checklist(r, S.pieces(r, marcel().g, {states: all}), {hypothesis_note: 'André décédé à Lyon en 1990 sans enfant (acte reçu).'});
    assert.equal(ck2.ok, true, JSON.stringify(ck2.items));
});
t('journal : ce qui change entre deux calculs ; CSV sans formule', () => {
    const before = S.snapshot(run(fam().P(1, 'D', 'm', 1930, '2024-01-01').P(2, 'A', 'f', 1960).kid(2, 1).g ? fam().P(1, 'D', 'm', 1930, '2024-01-01').P(2, 'A', 'f', 1960).kid(2, 1) : null, 1));
    const after = S.snapshot(run(fam().P(1, 'D', 'm', 1930, '2024-01-01').P(2, 'A', 'f', 1960).P(3, 'B', 'm', 1962, null, 'unknown').kid(2, 1).kid(3, 1), 1));
    const lines = S.diffLines(before, after, {2: 'A', 3: 'B'});
    assert.deepEqual(lines, ['A : 1 → 1/2', 'B ajouté (statut inconnu)']);
    assert.equal(S.csvCell('=1+1'), "'=1+1"); assert.match(S.journalCsv([{at: '19/11/2026 10:42', text: 'PDF créé; 3 pages'}]), /^Date;Action\r\n19\/11\/2026 10:42;"PDF créé; 3 pages"$/);
});
t('fractions exactes, degrés civils, mots de parenté', () => {
    assert.equal(S.str(S.add(S.F(1, 6), S.F(1, 4))), '5/12'); assert.equal(S.pct(S.F(5, 12)), 41.67); assert.equal(S.str(S.parse('10/20')), '1/2');
    assert.equal(S.kinLabel(2, 3, 'female'), 'fille de cousin germain'); assert.equal(S.kinLabel(3, 3, 'male'), 'cousin issu de germains');
    assert.equal(S.kinLabel(1, 5, 'female'), 'arrière-arrière-petite-nièce'); assert.equal(S.kinLabel(0, 6, 'male'), 'descendant à la 6e génération');
    assert.deepEqual(S.DEGREES.map(d => d[0]), [1, 2, 3, 4, 5, 6]);
});
t('⚖️ chaque article cité a son lien Légifrance (https://www.legifrance.gouv.fr), dans les notes, les avertissements, les branches', () => {
    const texts = [];
    const collect = r => { texts.push(...r.notes, ...r.warnings.map(w => w.text), ...r.search.map(s => s.text), ...r.orders.map(o => o.label)); };
    collect(run(marcel(), 10)); collect(run(odette(), 1));
    const m = marcel(); m.g.persons[10].death = {date: '1999-05-14', year: 1999}; collect(run(m, 10));
    for (const f of [parentsFam().P(9, 'Épouse', 'f', 1962).union(9, 1, 9)]) collect(run(f, 1));
    collect(run(base().P(3, 'Anne', 'f', 1965).union(9, 1, 2).kid(3, 1, 2), 1));
    texts.push(...S.ABSENCE.map(a => `art. ${a.art}`));
    const cited = new Set(texts.flatMap(x => S.lawCited(x)));
    assert.ok(cited.size >= 10, [...cited].join(','));
    for (const a of cited) { assert.ok(S.LAW[a], 'pas de lien pour art. ' + a); }
    for (const [a, u] of Object.entries(S.LAW)) assert.match(u, /^https:\/\/www\.legifrance\.gouv\.fr\/codes\//, a);
    assert.match(S.lawLinks('(art. 747-748)'), /href="https:\/\/www\.legifrance\.gouv\.fr\/[^"]+"[^>]*target="_blank"[^>]*>747<\/a>-<a [^>]*>748</);
    assert.equal(S.lawUrl('734'), 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006430952');
});

if (failed) { console.error(`✗ ${failed} échec(s)`); process.exitCode = 1; } else console.log('✓ tout est bon');
