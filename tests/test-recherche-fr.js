'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🔎 Recherche « à la française » (lib/recherche_fr.php, assets/js/app-recherche-fr.js, assets/data/recherche-fr.json) :
 *     node tests/test-recherche-fr.js          (SHOTS=dossier : captures rfr-*.png ; RFR_PERF=0 : sans la base de 100 000 ;
 *                                                RFR_N=… : autre taille ; RFR_APP_BEFORE=dossier : mesure aussi une copie de l'app d'avant)
 *  1. le cœur JS (sans serveur) : noms (accents, casse, ligatures, apostrophes, tirets, particules), phonétique française
 *     (finales muettes, -ault/-aut/-ot/-eau, y/i, k/c/qu, ph/f, gn, ç, doubles), prénoms (abréviations des actes, formes latines
 *     et leurs fins, composés collés, diminutifs), lieux (St/Ste, articles), dates (vers, entre, avant, après, années, siècle,
 *     jour, républicain : 1er vendémiaire an I = 22 septembre 1792, 18 brumaire an VIII = 9 novembre 1799), « Trouvé par » ;
 *  2. parité : les mêmes centaines de cas passés au PHP et au JS donnent exactement la même chose ;
 *  3. le serveur (vraie base, php -S) : Personnes (exact, puis variantes, puis phonétique ; repli « Aucun Dupond… » ; « Toujours
 *     phonétique »), ⌘K, menu de choix (personnes, lieux, mot = lieu de naissance), Listes (personnes, événements, lieux),
 *     Doublons (rapprochement), Où chercher (menu de choix), réglages (latin, abréviations, marge de « vers »), nom piégé,
 *     % et _ pris à la lettre, mise à jour après une modification, migration n°96 ;
 *  4. 100 000 personnes (scripts/grosse-base.php) : migration, recherches, liste des Personnes ;
 *  5. navigateur (Playwright) 1440, 390, sombre : « Trouvé par » sous les résultats, repli, ⌘K, menu de choix, Listes,
 *     Réglages → 🔎 Recherche ; le nom piégé n'est jamais exécuté ; aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {findPhp, devBundledPhp, phpRuntimeArgs} = require('../electron/php-server');
const R = require('../assets/js/app-recherche-fr.js');

const appRoot = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || '';
const XSS = '<img src=x onerror=window.__xss=1>';
let failed = 0, checks = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const eq = (a, b, m) => { checks++; assert.equal(a, b, m); };
const deq = (a, b, m) => { checks++; assert.deepEqual(a, b, m); };
const phpPath = findPhp([devBundledPhp()]);

/* ═════ données de cas (fictives : MAZAUD, LACOMBE…) ═════ */
const SAME_SOUND = [
    ['Dupont', 'Dupond', 'Dupon', 'Dupons', 'DUPONT', 'dupont'], ['Thibault', 'Thibaut', 'Thibaud', 'Thibeau', 'Thibaux'], ['Arnault', 'Arnaud', 'Arnaut', 'Arnot'],
    ['Mazaud', 'Mazeau', 'Mazot', 'Mazaut', 'Masaud'], ['Lacombe', 'Lacomb', 'Lacombes', 'La Combe'], ['Lefèvre', 'Lefebvre', 'Lefeuvre', 'Lefevre'],
    ['Rousseau', 'Rouseau', 'Roussot', 'Roussaud'], ['Chevalier', 'Chevallier'], ['Gautier', 'Gaultier', 'Gauthier'], ['Philippe', 'Philipe', 'Filipe'],
    ['Guérin', 'Guerrin', 'Guerin'], ['Georges', 'Jorge'], ['Boyer', 'Boyé', 'Boyez'], ['Courtois', 'Courtoy'], ['Simon', 'Symon'], ['Laurent', 'Lorans', 'Laurens'],
    ['Vincent', 'Vinsan'], ['Nicolas', 'Nicola'], ['Matthieu', 'Mathieu'], ['Lefranc', 'Lefrancq'], ['Hébert', 'Ebert'], ['Kerjean', 'Querjean'], ['François', 'Fransois'],
    ['Maçon', 'Masson'], ['Rémy', 'Remi'], ['Faucher', 'Fauchet'], ['Bonnet', 'Bonne'], ['Marchand', 'Marchant'], ['Girard', 'Girart'], ['Renault', 'Renaud', 'Reno'],
];
const DIFFERENT = [['Dupont', 'Durand'], ['Martin', 'Morin'], ['Mazaud', 'Lacombe'], ['Bernard', 'Bertrand'], ['Petit', 'Pujol']];
const PARTICLES = [["d'Albert", 'Dalbert', 'De Albert', 'D’Albert', 'd Albert'], ['La Combe', 'Lacombe'], ['de la Fontaine', 'Delafontaine', 'De La Fontaine'],
    ['Le Goff', 'Legoff'], ['van der Berg', 'Vanderberg'], ["d'Harcourt", 'De Harcourt', 'Dharcourt']];
const FIRST = [
    ['J.-Bte', 'Jean-Baptiste', 'abr'], ['Jn Bte', 'Jean-Baptiste', 'abr'], ['Jean Bapt.', 'Jean-Baptiste', 'abr'], ['Jeanbaptiste', 'Jean-Baptiste', 'fr'], ['Jean Baptiste', 'Jean-Baptiste', 'fr'],
    ['Fçois', 'François', 'abr'], ['Fois', 'François', 'abr'], ['Jh', 'Joseph', 'abr'], ['Jph', 'Joseph', 'abr'], ['Pre', 'Pierre', 'abr'], ['Ant.', 'Antoine', 'abr'], ['Cath.', 'Catherine', 'abr'],
    ['Marg.', 'Marguerite', 'abr'], ['Magd.', 'Madeleine', 'abr'], ['Chles', 'Charles', 'abr'], ['Guill.', 'Guillaume', 'abr'], ['Nic.', 'Nicolas', 'abr'], ['Elisab.', 'Élisabeth', 'abr'],
    ['Mie', 'Marie', 'abr'], ['Mgte', 'Marguerite', 'abr'], ['Fçoise', 'Françoise', 'abr'],
    ['Joannes', 'Jean', 'latin'], ['Johannes', 'Jean', 'latin'], ['Ioannes', 'Jean', 'decl'], ['Joannis', 'Jean', 'latin'], ['Joannem', 'Jean', 'decl'], ['Joanna', 'Jeanne', 'latin'], ['Joannae', 'Jeanne', 'decl'],
    ['Petrus', 'Pierre', 'latin'], ['Petri', 'Pierre', 'decl'], ['Petro', 'Pierre', 'decl'], ['Petrum', 'Pierre', 'decl'], ['Maria', 'Marie', 'latin'], ['Mariae', 'Marie', 'decl'], ['Mariam', 'Marie', 'decl'],
    ['Franciscus', 'François', 'latin'], ['Francisci', 'François', 'decl'], ['Antonius', 'Antoine', 'latin'], ['Antonii', 'Antoine', 'decl'], ['Catharina', 'Catherine', 'latin'], ['Catharinae', 'Catherine', 'decl'],
    ['Jacobus', 'Jacques', 'latin'], ['Jacobi', 'Jacques', 'decl'], ['Guillelmus', 'Guillaume', 'latin'], ['Ludovicus', 'Louis', 'latin'], ['Ludovici', 'Louis', 'decl'], ['Carolus', 'Charles', 'latin'],
    ['Caroli', 'Charles', 'decl'], ['Stephanus', 'Étienne', 'latin'], ['Michael', 'Michel', 'latin'], ['Michaelis', 'Michel', 'decl'], ['Nicolaus', 'Nicolas', 'latin'], ['Nicolai', 'Nicolas', 'decl'],
    ['Josephus', 'Joseph', 'latin'], ['Josephi', 'Joseph', 'decl'], ['Anna', 'Anne', 'latin'], ['Annae', 'Anne', 'decl'], ['Margarita', 'Marguerite', 'latin'], ['Margaritae', 'Marguerite', 'decl'],
    ['Magdalena', 'Madeleine', 'latin'], ['Magdalenae', 'Madeleine', 'decl'], ['Elisabetha', 'Élisabeth', 'latin'], ['Elisabethae', 'Élisabeth', 'decl'], ['Claudius', 'Claude', 'latin'], ['Claudia', 'Claude', 'latin'],
    ['Claudii', 'Claude', 'decl'], ['Marianne', 'Marie-Anne', 'colle'], ['Marie Anne', 'Marie-Anne', 'fr'], ['Toinette', 'Antoinette', 'dim'], ['Jeannette', 'Jeanne', 'dim'], ['Nanette', 'Anne', 'dim'],
    ['Fanchon', 'Françoise', 'dim'], ['Mariette', 'Marie', 'dim'], ['Jacquou', 'Jacques', 'dim'], ['Margot', 'Marguerite', 'dim'], ['Babet', 'Élisabeth', 'dim'],
];
const NOT_FIRST = ['Carole', 'Joanne', 'Ant', 'Cath', 'Colin', 'Martine', 'Dupont', 'J.', 'M.'];
const DATES = [
    ['vers 1850', [{from: 1845, to: 1855, kind: 'vers'}]], ['v. 1850', [{from: 1845, to: 1855, kind: 'vers'}]], ['env. 1850', [{from: 1845, to: 1855, kind: 'vers'}]], ['~1850', [{from: 1845, to: 1855, kind: 'vers'}]],
    ['entre 1850 et 1860', [{from: 1850, to: 1860, kind: 'between'}]], ['de 1860 à 1850', [{from: 1850, to: 1860, kind: 'between'}]], ['1850-1860', [{from: 1850, to: 1860, kind: 'between'}]],
    ['avant 1900', [{from: null, to: 1899, kind: 'before'}]], ['après 1789', [{from: 1790, to: null, kind: 'after'}]], ['apres 1789', [{from: 1790, to: null, kind: 'after'}]], ['depuis 1789', [{from: 1789, to: null, kind: 'after'}]],
    ['années 1880', [{from: 1880, to: 1889, kind: 'decade'}]], ['les années 1880', [{from: 1880, to: 1889, kind: 'decade'}]], ['XVIIIe siècle', [{from: 1700, to: 1799, kind: 'century'}]],
    ['18e siècle', [{from: 1700, to: 1799, kind: 'century'}]], ['XIXe siècle', [{from: 1800, to: 1899, kind: 'century'}]], ['xviie siecle', [{from: 1600, to: 1699, kind: 'century'}]],
    ['3 mars 1850', [{from: 1850, to: 1850, kind: 'day', ymd: '1850-03-03'}]], ['1er janvier 1800', [{from: 1800, to: 1800, kind: 'day', ymd: '1800-01-01'}]], ['3/3/1850', [{from: 1850, to: 1850, kind: 'day', ymd: '1850-03-03'}]],
    ['03/03/1850', [{from: 1850, to: 1850, kind: 'day', ymd: '1850-03-03'}]], ['1850-03-03', [{from: 1850, to: 1850, kind: 'day', ymd: '1850-03-03'}]], ['mars 1850', [{from: 1850, to: 1850, kind: 'month', ymd: '1850-03'}]],
    ['1er vendémiaire an I', [{from: 1792, to: 1792, kind: 'rep', ymd: '1792-09-22'}]], ['18 brumaire an VIII', [{from: 1799, to: 1799, kind: 'rep', ymd: '1799-11-09'}]],
    ['15 brumaire an III', [{from: 1794, to: 1794, kind: 'rep', ymd: '1794-11-05'}]], ['12 thermidor an II', [{from: 1794, to: 1794, kind: 'rep', ymd: '1794-07-30'}]], ['1850', [{from: 1850, to: 1850, kind: 'year'}]],
    ['31 février 1850', [{from: 1850, to: 1850, kind: 'month', ymd: '1850-02'}]], ['Martin', []],
];

/* ═════ 1. le cœur JS ═════ */
(async () => {
    await t('noms : accents, casse, ligatures, apostrophes typographiques, tirets et espaces', () => {
        eq(R.fold('Évelyne ÇELIK'), 'evelyne celik'); eq(R.fold('Œuvray'), 'oeuvray'); eq(R.fold('Lætitia'), 'laetitia'); eq(R.fold('Strauß'), 'strauss'); eq(R.fold('Søren'), 'soren');
        eq(R.fold('Jean-Baptiste'), 'jean baptiste'); eq(R.fold("d’Albert"), 'd albert'); eq(R.fold('  MAZAUD   Pierre '), 'mazaud pierre'); eq(R.fold('ſaint'), 'saint'); eq(R.fold('Łukasz'), 'lukasz');
        eq(R.fold('Élise'), 'elise', 'accent décomposé (macOS)');
    });
    await t('phonétique française : les mêmes sons donnent la même clé, les noms différents non', () => {
        for (const g of SAME_SOUND) { const k = R.phon(g[0]); for (const x of g) eq(R.phon(x), k, `${x} ~ ${g[0]}`); }
        for (const [a, b] of DIFFERENT) { checks++; assert.notEqual(R.phon(a), R.phon(b), `${a} ≠ ${b}`); }
        eq(R.phon('Dupont'), 'dupon'); eq(R.phon('Thibault'), 'tibo'); eq(R.phon('Mazaud'), 'maso');
        eq(R.phonNear('dupon', 'dupan'), true); eq(R.phonNear('marten', 'martin'), true); eq(R.phonNear('ab', 'ac'), false); eq(R.phonNear('dupon', 'lakonb'), false);
    });
    await t('particules ignorées ou collées : d’Albert = Dalbert = De Albert, La Combe = Lacombe', () => {
        for (const g of PARTICLES) { const k = R.nameKeys(g[0]).glued; for (const x of g) eq(R.nameKeys(x).glued, k, `${x} ~ ${g[0]}`); }
        eq(R.nameKeys("d'Albert").bare, 'albert'); eq(R.nameKeys('La Combe').bare, 'combe'); eq(R.nameKeys('Lacombe').bare, 'lacombe'); eq(R.nameKeys('Le').bare, 'le', 'une particule seule reste');
    });
    await t(`prénoms : ${FIRST.length} abréviations, formes latines (et leurs fins), composés, diminutifs`, () => {
        for (const [form, fr, kind] of FIRST) { const e = R.firstQuery(form); assert.ok(e, form); eq(e.fr, fr, form); eq(e.kind, kind, `${form} : ${e.kind}`); }
        for (const w of NOT_FIRST) eq(R.firstQuery(w), null, w);
        eq(R.firstQuery('Petrus', {latin: false}), null, 'formes latines coupées'); eq(R.firstQuery('Fçois', {abr: false}), null, 'abréviations coupées');
        const ff = R.firstForms('Jean Baptiste Pierre'); deq(ff.map(f => f.canon), ['jeanbaptiste', 'jean', 'baptiste', 'pierre']);
        eq(R.firstCanonString('J.-Bte'), ' a:jeanbaptiste a:jean a:baptiste '); eq(R.firstCanonString('Petrus'), ' l:pierre '); eq(R.firstCanonString('Hippolyte'), ' hippolyte ');
    });
    await t('lieux : St/Ste/S. = Saint/Sainte, article du début', () => {
        eq(R.placeFold('St-Martin-la-Méanne'), 'saint martin la meanne'); eq(R.placeFold('Ste Fortunade'), 'sainte fortunade'); eq(R.placeFold('S. Pardoux'), 'saint pardoux');
        eq(R.placeFold('Sts Geosmes'), 'saints geosmes'); eq(R.placeFold('N.-D. de Lorette'), 'notre dame de lorette'); eq(R.placeFold('Saint-Ybard'), 'saint ybard'); eq(R.placeFold('Lens'), 'lens');
        deq(R.placeVariants('Le Mans'), ['le mans', 'mans']); deq(R.placeVariants('St Martin'), ['st martin', 'saint martin']);
    });
    await t(`dates tapées : ${DATES.length} formes, calendrier républicain (an I, an VIII), marge de « vers » réglable`, () => {
        for (const [q, want] of DATES) {
            const got = R.parseDates(q, 5).dates.map(d => { const o = {from: d.from, to: d.to, kind: d.kind}; if (d.ymd) o.ymd = d.ymd; return o; });
            deq(got, want, q);
        }
        deq(R.parseDates('vers 1850', 10).dates[0].from, 1840); deq(R.parseDates('vers 1850', 0).dates[0].to, 1850);
        const d = R.parseDates('Pierre MAZAUD vers 1850 Meymac', 5); eq(d.rest, 'pierre mazaud meymac');
        eq(R.dateYmd('15 brumaire an III'), '1794-11-05'); eq(R.dateYmd('3 mars 1850'), '1850-03-03'); eq(R.dateYmd('vers 1850'), '1850'); eq(R.dateYmd('mars 1850'), '1850-03'); eq(R.dateYmd(''), '');
    });
    await t('lire une recherche : particules collées au mot suivant, prénom composé en deux mots, dates à part', () => {
        const p = R.parseQuery('Jn Bte de la Combe vers 1850');
        deq(p.tokens.map(x => [x.raw, x.merged, x.first && x.first.fr]), [['jn bte', 'first', 'Jean-Baptiste'], ['de la combe', 'particle', null]]);
        eq(p.dates.length, 1);
        deq(R.parseQuery("d'Albert").tokens.map(x => x.glued), ['dalbert']);
        deq(R.parseQuery('Jean Pierre MAZAUD').tokens.map(x => x.parts), [['jean', 'pierre'], ['mazaud']]);
        eq(R.parseQuery('x'.repeat(500)).raw.length, 200, 'borné à 200 caractères');
    });
    const F = (first, last, extra = {}) => ({src: 0, type: '', first, middle: '', last, group: '', ...extra});
    await t('« Trouvé par » : nom exact, nom de mariage, particule, forme latine, abréviation, diminutif, phonétique, date', () => {
        const ex = (q, forms, opt) => R.explain(R.parseQuery(q, opt), forms, opt);
        deq(ex('Mazaud', [F('Pierre', 'MAZAUD')]), {ok: true, tier: 0, why: [{k: 'exact'}]});
        deq(ex('Dupont', [F('Marie', 'LACOMBE'), {src: 7, type: 'married', first: '', last: 'DUPONT'}]), {ok: true, tier: 1, why: [{k: 'married', v: 'DUPONT'}]});
        deq(ex('Dalbert', [F('Jean', "d'Albert")]), {ok: true, tier: 2, why: [{k: 'particle', v: "d'Albert"}]});
        deq(ex('Petrus Mazaud', [F('Pierre', 'MAZAUD')]), {ok: true, tier: 2, why: [{k: 'latin', v: 'petrus', fr: 'Pierre'}, {k: 'exact'}]});
        deq(ex('Pierre', [F('Petrus', 'MAZAUD')]), {ok: true, tier: 2, why: [{k: 'latin', v: 'Petrus', fr: 'Pierre'}]});
        deq(ex('François', [F('Fçois', 'MAZAUD')]), {ok: true, tier: 2, why: [{k: 'abr', v: 'Fçois', fr: 'François'}]});
        deq(ex('Antoinette', [F('Toinette', 'LACOMBE')]), {ok: true, tier: 2, why: [{k: 'dim', v: 'Toinette', fr: 'Antoinette'}]});
        deq(ex('Dupond', [F('Jean', 'DUPONT')]), {ok: true, tier: 3, why: [{k: 'phon', v: 'DUPONT'}]});
        deq(ex('Dupond', [F('Jean', 'DUPONT')]).ok, true); eq(R.explain(R.parseQuery('Dupond'), [F('Jean', 'DUPONT')], null, false).ok, false, 'sans phonétique');
        eq(ex('Petrus', [F('Pierre', 'X')], {latin: false}).ok, false, 'latin coupé'); eq(ex('Zzz', [F('Pierre', 'MAZAUD')]).ok, false);
        deq(R.explainDates(R.parseDates('vers 1850').dates, [{ev: 'birth', y: 1848, text: '1848'}]), [{k: 'date', v: 'vers 1850', ev: 'birth', y: 1848}]);
        deq(R.explainDates(R.parseDates('3 mars 1850').dates, [{ev: 'birth', y: 1850, text: '4 mars 1850'}, {ev: 'death', y: 1850, text: '3 mars 1850'}]), [{k: 'date', v: '3 mars 1850', ev: 'death', y: 1850}]);
    });
    await t('« Trouvé par » écrit : échappé, « nom exact » seulement avec une autre raison', () => {
        eq(R.whyText([{k: 'exact'}]), ''); eq(R.whyText([{k: 'latin', v: 'Petrus', fr: 'Pierre'}, {k: 'exact'}]), 'forme latine de Pierre (Petrus) · nom exact');
        eq(R.whyText([{k: 'abr', v: 'Ant.', fr: 'Antoine'}]), 'abréviation d’Antoine (Ant.)'); eq(R.whyText([{k: 'phon', v: 'DUPONT'}]), 'phonétique (proche de DUPONT)');
        eq(R.whyText([{k: 'fusion', v: 'Favars', now: 'Chameyrat-et-Favars'}]), 'commune fusionnée (Favars → Chameyrat-et-Favars)');
        eq(R.whyText([{k: 'date', v: 'vers 1850', ev: 'birth', y: 1848}]), 'date « vers 1850 » (naissance 1848)');
        const h = R.whyHtml([{k: 'phon', v: XSS}]); assert.ok(!h.includes('<img') && h.includes('&lt;img'), h); checks++;
        const fb = R.fallbackHtml({q: XSS, n: 3, names: ['Dupont', XSS]}); assert.ok(!fb.includes('<img'), fb); checks++;
    });

    /* ═════ 2. parité PHP / JS ═════ */
    await t('parité : le PHP et le JS donnent exactement la même chose (centaines de cas)', () => {
        if (!phpPath) { console.log('  — PHP absent : sauté'); return; }
        const cases = [];
        const names = [...SAME_SOUND.flat(), ...PARTICLES.flat(), ...DIFFERENT.flat(), 'Évelyne ÇELIK', 'Œuvray', 'Strauß', XSS, "'; DROP TABLE persons; --", '%_\\', 'Ø', 'Ångström', 'Müller-Lüdenscheidt', '', '   ', 'Ł', 'ı', 'ǿ', 'ẞ', 'Ǆ', '日本', 'Ελένη', 'Пётр'];
        names.forEach(n => { cases.push(['fold', [n]], ['phon', [n]], ['nameKeys', [n]], ['placeVariants', [n]], ['firstForms', [n]], ['firstCanonString', [n]]); });
        [...R.firstIndex().keys()].forEach((k, i) => { if (i % 2 === 0) cases.push(['firstQuery', [k]]); });
        FIRST.forEach(([f]) => { cases.push(['firstQuery', [f]], ['firstQuery', [f, {latin: false}]], ['firstQuery', [f, {abr: false}]], ['firstForms', [f + ' Pierre']]); });
        DATES.forEach(([q]) => { cases.push(['parseDates', [q, 5]], ['parseDates', ['Mazaud ' + q + ' Meymac', 7]], ['dateYmd', [q]]); });
        ['St-Martin-la-Méanne', 'Ste Fortunade', 'Le Mans', 'La Roche-Canillac', "L'Isle-Jourdain", 'N.-D. de Lorette', 'Saint-Ybard', 'S. Pardoux'].forEach(p => cases.push(['placeVariants', [p]]));
        const queries = ['Jn Bte de la Combe vers 1850', "d'Albert", 'Petrus Mazaud', 'Fçois LACOMBE 1850', 'Jean Pierre MAZAUD', 'Marie Anne', 'van der Berg', 'Toinette entre 1790 et 1800', 'Dupond', 'de', 'le Mans',
            '15 brumaire an III Mazaud', 'Ant. Cath.', 'J.-Bte', 'Jean Bapt. Mazaud', XSS, '%', '_', 'années 1880 Lacombe', 'Mie Jne', 'xviiie siècle'];
        queries.forEach(q => { cases.push(['parseQuery', [q]], ['parseQuery', [q, {latin: false, abr: false, vers: 2}]]); });
        const forms = [[F('Pierre', 'MAZAUD')], [F('Petrus', 'MAZAUD')], [F('J.-Bte', 'LACOMBE')], [F('Jean Baptiste', 'de la Combe')], [F('Marie', 'LACOMBE'), {src: 3, type: 'married', first: '', middle: '', last: 'DUPONT', group: ''}],
            [F('Toinette', "d'Albert")], [F('Fçois', 'Dupond')], [F('Marianne', 'Mazeau')], [F('Jean', XSS)], [F('Antoine', 'Thibault'), {src: 9, type: 'variant', first: 'Antonius', middle: '', last: 'Thibaud', group: ''}]];
        queries.forEach(q => forms.forEach(fs => { cases.push(['explain', [q, fs, null, true]], ['explain', [q, fs, {latin: false}, false]]); }));
        const code = String.raw`require 'lib/text.php'; require 'lib/recherche_fr.php';
            $in = json_decode((string) file_get_contents('php://stdin'), true); $out = [];
            foreach ($in as [$fn, $a]) {
                $set = static fn($v) => rfr_settings_clean(is_array($v) ? $v : []);
                $out[] = match ($fn) {
                    'fold' => rfr_fold($a[0]), 'phon' => rfr_phon($a[0]), 'nameKeys' => rfr_name_keys($a[0]), 'placeVariants' => rfr_place_variants($a[0]),
                    'firstForms' => rfr_first_forms($a[0]), 'firstCanonString' => rfr_first_canon_string($a[0]), 'firstQuery' => rfr_first_query($a[0], $set($a[1] ?? null)),
                    'parseDates' => rfr_parse_dates($a[0], (int) $a[1]), 'dateYmd' => rfr_date_ymd($a[0]), 'parseQuery' => rfr_parse_query($a[0], $set($a[1] ?? null)),
                    'explain' => rfr_explain(rfr_parse_query($a[0], $set($a[2] ?? null)), $a[1], $set($a[2] ?? null), (bool) $a[3]),
                };
            }
            echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);`;
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: appRoot, input: JSON.stringify(cases), encoding: 'utf8', maxBuffer: 1 << 26});
        assert.equal(r.status, 0, r.stderr);
        const php = JSON.parse(r.stdout);
        const js = cases.map(([fn, a]) => {
            if (fn === 'explain') return R.explain(R.parseQuery(a[0], a[2]), a[1], a[2], a[3]);
            if (fn === 'firstQuery' || fn === 'parseQuery') return R[fn](a[0], R.settingsClean(a[1] || null));
            return R[fn](...a);
        });
        // PHP rend [] pour un objet vide : on compare après le même passage en JSON
        const norm = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) && !Object.keys(x).length ? [] : x));
        let diff = 0;
        cases.forEach((c, i) => { checks++; if (norm(php[i]) !== norm(js[i])) { if (diff++ < 8) console.error('  ≠', JSON.stringify(c).slice(0, 160), '\n    PHP', norm(php[i]).slice(0, 300), '\n    JS ', norm(js[i]).slice(0, 300)); } });
        assert.equal(diff, 0, `${diff} différences sur ${cases.length} cas`);
        console.log(`  ${cases.length} cas comparés`);
        assert.ok(cases.length >= 500);
    });

    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return done(); }

    /* ═════ 3. le serveur ═════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-rfr-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', XSS};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$P = $pdo->prepare('INSERT INTO persons(id,first_name,middle_name,last_name,gender,is_start,living_status) VALUES(?,?,?,?,?,?,?)');
foreach ([[1,'Pierre','','MAZAUD','male',1,'deceased'],[2,'Petrus','','LACOMBE','male',0,'deceased'],[3,'J.-Bte','','DUPONT','male',0,'deceased'],[4,'Marie','','LACOMBE','female',0,'deceased'],
          [5,'Fçois','','de la Combe','male',0,'deceased'],[6,'Toinette','','MAZEAU','female',0,'deceased'],[7,'Jean','',"d'Albert",'male',0,'deceased'],[8,'Antoine','','DUPONS','male',0,'deceased'],
          [9,'Marianne','','DUPON','female',0,'deceased'],[10,'Jean','',getenv('XSS'),'male',0,'deceased'],[11,'Jean','Baptiste','MAZAUD','male',0,'deceased'],[12,'Rose','','100%_VRAI','female',0,'deceased'],
          [13,'Catherine','','THIBAULT','female',0,'deceased'],[14,'Cath.','','THIBAUD','female',0,'deceased']] as $r) { $P->execute($r); }
$pdo->exec("INSERT INTO name_variants(person_id,type,first_name,last_name) VALUES(4,'married','','DUPONT')");
$pdo->prepare("INSERT INTO places(id,name,county,country,alternate_names) VALUES(1,'Saint-Martin-la-Méanne','Corrèze','France',''),(2,'Le Mans','Sarthe','France',''),(3,'Chameyrat-et-Favars','Corrèze','France','Essai-les-Bois,Chameyrat'),(4,'Meymac','Corrèze','France',''),(5,'St-Pardoux','Corrèze','France',''),(6,?,'Corrèze','France','')")->execute([getenv('XSS')]);
$pdo->exec("INSERT OR REPLACE INTO meta(key,value) VALUES('frontieres_alt','{\"3\":[\"Essai-les-Bois\"]}')");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,4)");
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?,?)');
foreach ([['person',1,null,'BIRT','3 mars 1848',1848,1],['person',2,null,'BIRT','15 brumaire an III',1794,4],['person',3,null,'BIRT','1790',1790,2],['person',4,null,'BIRT','12 juin 1852',1852,3],
          ['family',null,1,'MARR','1875',1875,4],['person',5,null,'DEAT','1884',1884,5],['person',6,null,'BIRT','1701',1701,6],['person',13,null,'BIRT','1820',1820,4],['person',14,null,'BIRT','1821',1821,4],
          ['person',7,null,'BIRT','vers 1760',1760,1]] as $r) {
    [$sc,$pid,$fid,$tag,$dt,$y,$pl] = $r; $ev->execute([$sc,$pid,$fid,$t($tag),$dt,$y,$pl]); }
echo 'ok';`], {cwd: appRoot, encoding: 'utf8', env});
    if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], {cwd: appRoot, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse((html.match(/window\.INSTALL_CSRF = ("[^"]*")/) || [])[1] || '""');
    const get = async (action, q = {}) => { const r = await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, {headers: {Cookie: cookie}}); const j = await r.json(); if (r.status !== 200) throw new Error(`${action} ${r.status} ${JSON.stringify(j)}`); return j; };
    const post = async (action, body) => { const r = await fetch(`${base}api.php?action=${action}`, {method: 'POST', headers: {Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf}, body: JSON.stringify({...body, csrf})}); return {status: r.status, body: await r.json().catch(() => null)}; };
    const people = async (q, extra = {}) => get('people', {q, limit: 50, ...extra});
    const ids = d => (d.people || d.rows || []).map(p => Number(p.id));
    try {
        await t('rfr_names : une ligne par nom de fiche et par variante, remplie à la première recherche', async () => {
            await people('Pierre');
            const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/bootstrap.php'; $p=db(); echo $p->query('PRAGMA user_version')->fetchColumn(),'|',$p->query('SELECT count(*) FROM rfr_names')->fetchColumn(),'|',$p->query("SELECT first_canons FROM rfr_names WHERE person_id=2 AND src=0")->fetchColumn();`], {cwd: appRoot, env, encoding: 'utf8'});
            eq(r.stdout, '96|15| l:pierre ');
        });
        await t('Personnes : exact d’abord, puis variantes (nom de mariage, latin, abréviation), puis phonétique', async () => {
            let d = await people('Pierre');
            deq(ids(d), [1, 2], 'Pierre MAZAUD exact, puis Petrus LACOMBE (forme latine)');
            deq(d.people.map(p => p.tier), [0, 2]); deq(d.people[1].why, [{k: 'latin', v: 'Petrus', fr: 'Pierre'}]);
            d = await people('Dupont'); deq(ids(d), [3, 4], 'DUPONT, puis Marie LACOMBE (nom de mariage)'); deq(d.people[1].why, [{k: 'married', v: 'DUPONT'}]);
            eq(d.fallback, null, 'le nom exact existe : pas de phonétique');
            d = await people('Jean-Baptiste'); deq(ids(d).sort((a, b) => a - b), [3, 11], 'J.-Bte DUPONT et Jean Baptiste MAZAUD');
            d = await people('Jn Bte'); deq(ids(d).sort((a, b) => a - b), [3, 11]);
            d = await people('François'); deq(ids(d), [5]); deq(d.people[0].why, [{k: 'abr', v: 'Fçois', fr: 'François'}]);
            d = await people('Antoinette'); deq(ids(d), [6]); eq(d.people[0].why[0].k, 'dim');
            d = await people('Marie-Anne'); deq(ids(d), [9]); eq(d.people[0].why[0].k, 'colle');
            d = await people('Lacombe'); deq(ids(d), [4, 2, 5], 'LACOMBE (Marie, Petrus) puis de la Combe (particule)'); eq(d.people[2].why[0].k, 'particle');
            d = await people('Dalbert'); deq(ids(d), [7]); d = await people('De Albert'); deq(ids(d), [7]); d = await people('Albert'); deq(ids(d), [7]);
            d = await people('Catherine'); deq(ids(d), [13, 14]);
        });
        await t('repli phonétique : « Aucun Dupond ; 3 personnes proches : … » ; « Toujours phonétique »', async () => {
            let d = await people('Dupond');
            deq(ids(d).sort((a, b) => a - b), [3, 4, 8, 9], 'avec Marie LACOMBE, épouse DUPONT'); eq(d.fallback.n, 4); deq(d.fallback.q, 'Dupond'); deq(d.fallback.names.sort(), ['DUPON', 'DUPONS', 'DUPONT']);
            assert.ok(d.people.every(p => p.tier === 3 && p.why[0].k === 'phon')); checks++;
            d = await people('Dupont', {phonetic: 1}); deq(ids(d), [3, 4, 9, 8], 'toujours phonétique : exact, mariage, puis proches'); eq(d.fallback, null);
            d = await people('Thibaut'); deq(ids(d).sort((a, b) => a - b), [13, 14]);
            d = await people('zzqx'); deq(ids(d), []); eq(d.fallback, null);
        });
        await t('dates : « vers 1850 », jour exact, républicain, siècle', async () => {
            let d = await people('Mazaud vers 1850'); deq(ids(d), [1]); deq(d.people[0].why, [{k: 'exact'}, {k: 'date', v: 'vers 1850', ev: 'birth', y: 1848}]);
            d = await people('3 mars 1848'); deq(ids(d), [1]); d = await people('3/3/1848'); deq(ids(d), [1]);
            d = await people('15 brumaire an III'); deq(ids(d), [2]); d = await people('5/11/1794'); deq(ids(d), [2]);
            d = await people('XVIIIe siècle'); deq(ids(d).sort((a, b) => a - b), [2, 3, 6, 7]);
            d = await people('Lacombe après 1850'); deq(ids(d).sort((a, b) => a - b), [4, 5], 'Marie (1852) et Fçois (†1884)');
            d = await people('Mazaud 1875'); deq(ids(d), [1], 'le mariage compte'); eq(d.people[0].why[1].ev, 'marr');
        });
        await t('réglages : formes latines, abréviations coupées ; marge de « vers »', async () => {
            const set = v => post('save_settings', {set: {'genealogie-recherche-fr': JSON.stringify(v)}, remove: []});
            eq((await set({auto: true, latin: false, abr: false, vers: 1})).status, 200);
            deq(ids(await people('Pierre')), [1]); deq(ids(await people('François')), []); deq(ids(await people('Mazaud vers 1850')), []);
            await set({auto: false, latin: true, abr: true, vers: 5});
            deq(ids(await people('Dupond')), [], 'phonétique automatique coupée');
            await set({auto: true, latin: true, abr: true, vers: 5});
            deq(ids(await people('Pierre')), [1, 2]);
            const pr = await get('rfr_parse', {q: 'Jn Bte vers 1850'}); eq(pr.parsed.tokens[0].first.fr, 'Jean-Baptiste'); eq(pr.parsed.dates[0].from, 1845);
        });
        await t('% et _ pris à la lettre, guillemets et SQL piégés sans effet', async () => {
            deq(ids(await people('100%')), [12]); deq(ids(await people('%')), []); deq(ids(await people('_')), []);
            deq(ids(await people("'; DROP TABLE persons; --")), []); eq((await get('people', {limit: 50})).people.length, 14, 'la table est toujours là');
            const d = await people('img onerror'); deq(ids(d), [10]);
        });
        await t('⌘K : personnes (avec « Trouvé par »), lieux (Saint, article, commune fusionnée), repli', async () => {
            let d = await get('quick_search', {q: 'Petrus'}); deq(d.persons.map(p => Number(p.id)), [2, 1], 'Petrus LACOMBE, puis Pierre MAZAUD (forme latine)');
            d = await get('quick_search', {q: 'Pierre'}); deq(d.persons.map(p => Number(p.id)), [1, 2]); eq(d.persons[1].why[0].k, 'latin');
            d = await get('quick_search', {q: 'Dupond'}); eq(d.fallback.n, 4);
            d = await get('quick_search', {q: 'lieu St Martin'}); deq(d.places.map(p => Number(p.id)), [1]); eq(d.places[0].why[0].k, 'saint');
            d = await get('quick_search', {q: 'lieu Mans'}); deq(d.places.map(p => Number(p.id)), [2]);
            d = await get('quick_search', {q: 'lieu Essai-les-Bois'}); deq(d.places.map(p => Number(p.id)), [3]); deq(d.places[0].why, [{k: 'fusion', v: 'Essai-les-Bois', now: 'Chameyrat-et-Favars'}]);
            d = await get('quick_search', {q: 'lieu Saint Pardoux'}); deq(d.places.map(p => Number(p.id)), [5], 'St-Pardoux écrit abrégé dans la base');
        });
        await t('menu de choix (et « Pour qui ? » de Où chercher) : personnes, mot = lieu de naissance, lieux', async () => {
            const pk = async (kind, q) => (await get('picker_search', {kind, q, limit: 30})).groups;
            let g = await pk('person', 'Petrus'); deq(g[0].items.map(i => i.id), [2, 1]);
            g = await pk('person', 'Pierre'); deq(g[0].items.map(i => i.id), [1, 2]); eq(g[0].items[1].why[0].k, 'latin');
            g = await pk('person', 'Dupond'); eq(g[0].total, 4); eq(g[0].fallback.n, 4);
            g = await pk('person', 'Mazaud Meymac'); deq(g[0].items.map(i => i.id), [], 'Pierre est né à Saint-Martin, pas à Meymac');
            g = await pk('person', 'Pierre Saint-Martin'); deq(g[0].items.map(i => i.id), [1]); deq(g[0].items[0].why.map(w => w.k), ['exact', 'place']);
            g = await pk('person', 'Mazaud vers 1850'); deq(g[0].items.map(i => i.id), [1]);
            g = await pk('place', 'St Martin la Meanne'); assert.ok(g[0].items.some(i => i.id === 1)); checks++;
            g = await pk('place', 'Saint Pardoux'); assert.ok(g[0].items.some(i => i.id === 5)); checks++;
            g = await pk('place', 'Essai les Bois'); const it = g[0].items.find(i => i.id === 3); assert.ok(it); deq(it.why, [{k: 'fusion', v: 'Essai-les-Bois', now: 'Chameyrat-et-Favars'}]);
        });
        await t('Listes : personnes, événements (noms et dates), lieux', async () => {
            let d = await get('list', {type: 'persons', q: 'Pierre'}); deq(ids(d), [1, 2]); eq(d.rows[1].why[0].k, 'latin');
            d = await get('list', {type: 'persons', q: 'Dupond'}); deq(ids(d).length, 4); eq(d.fallback.n, 4);
            d = await get('list', {type: 'persons', q: 'Pierre', gender: 'female'}); deq(ids(d), [], 'le filtre de la liste reste');
            d = await get('list', {type: 'events', q: 'Petrus'}); deq(d.rows.map(r => Number(r.person_id)).sort((a, b) => a - b), [1, 1, 2], 'Petrus, puis Pierre MAZAUD (naissance, mariage)'); eq(d.rows.find(r => Number(r.person_id) === 1).why[0].k, 'latin');
            d = await get('list', {type: 'events', q: '15 brumaire an III'}); eq(d.rows.length, 1); eq(d.rows[0].why[0].k, 'date');
            d = await get('list', {type: 'events', q: 'Naissance vers 1850'}); deq(d.rows.map(r => r.year).sort((a, b) => a - b), [1848, 1852]);
            d = await get('list', {type: 'events', q: 'Mazaud 1875'}); eq(d.rows.length, 1, 'le mariage de Pierre MAZAUD');
            d = await get('list', {type: 'places', q: 'Mans'}); deq(ids(d), [2]);
            d = await get('list', {type: 'places', q: 'St Martin'}); deq(ids(d), [1]);
            d = await get('list', {type: 'places', q: 'essai-les-bois'}); deq(ids(d), [3]); eq(d.rows[0].why[0].k, 'fusion');
        });
        await t('Doublons : rapprochement à l’oreille et prénom écrit autrement (Catherine THIBAULT ↔ Cath. THIBAUD)', async () => {
            const d = await get('duplicate_candidates', {});
            const c = d.candidates.find(x => [x.id1, x.id2].sort().join() === '13,14');
            assert.ok(c, JSON.stringify(d.candidates).slice(0, 400)); checks++;
            const d2 = await get('duplicate_candidates', {q: 'Thibaut'}); assert.ok(d2.candidates.some(x => x.id1 === 13 || x.id2 === 13), 'la recherche des Doublons comprend la phonétique'); checks++;
            const ctl = await get('controle', {}).catch(() => null);
            if (ctl && ctl.alerts) { const a = ctl.alerts.find(x => x.check === 'duplicate' && x.people.includes(13)); assert.ok(a); assert.ok(a.checks.some(ch => /nom proche à l’oreille|même nom/.test(ch[1]))); checks++; }
        });
        await t('mise à jour : un nom changé, une variante ajoutée sont trouvés tout de suite', async () => {
            let r = await post('add_variant', {person_id: 8, type: 'married', last_name: 'VERGNE'}); eq(r.status, 200, JSON.stringify(r.body));
            let d = await people('Vergne'); deq(ids(d), [8]); eq(d.people[0].why[0].k, 'married');
            const r2 = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/bootstrap.php'; $p=db(); $p->exec("UPDATE persons SET first_name='Ludovicus' WHERE id=13"); $p->exec("UPDATE meta SET value=json_set(value,'$.at',0) WHERE key='rfr_seen'");`], {cwd: appRoot, env, encoding: 'utf8'});
            eq(r2.status, 0);
            d = await people('Louis'); deq(ids(d), [13], 'changé par ailleurs (sans passer par l’app) : retrouvé à la vérification suivante (au plus 10 minutes)');
        });
        await t('verrou : la nouvelle action rfr_parse passe par la garde commune (GET d’api.php)', () => {
            const api = fs.readFileSync(path.join(appRoot, 'api.php'), 'utf8');
            assert.ok(api.indexOf("'rfr_parse' =>") > api.indexOf('glock_guard(')); checks++;
        });

        /* ═════ 5. le navigateur ═════ */
        let pw = null; try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch (_) { try { pw = require('playwright'); } catch (__) { pw = null; } }
        if (!pw) { console.log('— Playwright absent : partie navigateur sautée'); }
        else {
            if (SHOTS) fs.mkdirSync(SHOTS, {recursive: true});
            const browser = await pw.chromium.launch();
            const errors = [];
            for (const [name, vp, dark] of [['1440', {width: 1440, height: 950}, false], ['390', {width: 390, height: 860}, false], ['sombre', {width: 1440, height: 950}, true]]) {
                await t(`navigateur ${name} : Personnes, repli, ⌘K, menu de choix, Listes, Réglages → 🔎 Recherche`, async () => {
                    const ctx = await browser.newContext({viewport: vp, colorScheme: dark ? 'dark' : 'light'});
                    await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-last-route', '#tableau-de-bord'); } catch (_) {} });
                    const p = await ctx.newPage();
                    p.on('pageerror', e => errors.push(`${name} : ${e.message}`)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push(`${name} : ${m.text()}`); });
                    await p.goto(base);
                    await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_RFR && window.LCNDA_EXT?.maintenance?.recherche_fr, null, {timeout: 30000});
                    if (dark) await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
                    const noScroll = async () => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false, 'pas de défilement horizontal');
                    await p.evaluate(() => window.LCNDA_APP.setModule('personnes'));
                    await p.waitForSelector('#person-search', {timeout: 20000});
                    if (name === '390') await p.evaluate(() => document.querySelector('#person-search')?.scrollIntoView());
                    assert.match(await p.locator('label:has(#person-phonetic)').innerText(), /Toujours phonétique/);
                    await p.fill('#person-search', 'Pierre'); await p.press('#person-search', 'Enter');
                    await p.waitForSelector('#person-list .rfr-why', {timeout: 20000});
                    assert.match(await p.locator('#person-list .rfr-why').first().innerText(), /Trouvé par : forme latine de Pierre \(Petrus\)/);
                    if (SHOTS) await p.screenshot({path: path.join(SHOTS, `rfr-personnes-${name}.png`)});
                    await p.fill('#person-search', 'Dupond'); await p.press('#person-search', 'Enter');
                    await p.waitForSelector('#person-list .rfr-fallback', {timeout: 20000});
                    assert.match(await p.locator('#person-list .rfr-fallback').innerText(), /Aucun « dupond » ; 4 personnes proches : DUPON/i);
                    if (SHOTS) await p.screenshot({path: path.join(SHOTS, `rfr-repli-${name}.png`)});
                    await p.fill('#person-search', 'img onerror'); await p.press('#person-search', 'Enter');
                    await p.waitForTimeout(600);
                    eq(await p.evaluate(() => window.__xss), undefined, 'nom piégé jamais exécuté');
                    await noScroll();
                    // ⌘K
                    await p.locator('body').click({position: {x: 5, y: 5}}).catch(() => {});
                    await p.keyboard.press('Control+KeyK');
                    await p.waitForSelector('#quick-search input', {timeout: 10000});
                    await p.fill('#quick-search input', 'Pierre');
                    await p.waitForFunction(() => /Trouvé par/.test(document.querySelector('#quick-search')?.innerText || ''), null, {timeout: 10000});
                    if (SHOTS) await p.screenshot({path: path.join(SHOTS, `rfr-cmdk-${name}.png`)});
                    await p.fill('#quick-search input', 'Dupond');
                    await p.waitForSelector('#quick-search .rfr-fallback', {timeout: 10000});
                    await p.keyboard.press('Escape');
                    // menu de choix
                    const it = await p.evaluate(async () => { const pr = window.LCNDA_PICKER.openPicker({kind: 'person', title: 'Choisir'}); return true; });
                    assert.ok(it);
                    await p.waitForSelector('dialog[open] .pk-field input, dialog[open] input[type="search"], .pk-modal input', {timeout: 10000}).catch(() => {});
                    const inp = p.locator('dialog[open] input:not([type=hidden])').first();
                    await inp.fill('Pierre');
                    await p.waitForSelector('.pk-why', {timeout: 10000});
                    assert.match(await p.locator('.pk-why').first().innerText(), /forme latine de Pierre/);
                    if (SHOTS) await p.screenshot({path: path.join(SHOTS, `rfr-picker-${name}.png`)});
                    await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
                    // Listes → Personnes
                    await p.evaluate(() => { window.LCNDA_APP.state.listType = 'persons'; window.LCNDA_APP.setModule('listes'); });
                    await p.waitForSelector('#workspace .ui-lb input[type="search"], #workspace input[type="search"]', {timeout: 20000});
                    await p.locator('#workspace input[type="search"]').first().fill('Pierre');
                    await p.waitForSelector('#table-target .rfr-why', {timeout: 20000});
                    if (SHOTS) await p.screenshot({path: path.join(SHOTS, `rfr-listes-${name}.png`)});
                    await noScroll();
                    // Réglages → 🔎 Recherche
                    await p.evaluate(() => { window.LCNDA_APP.state.maintenanceTab = 'recherche_fr'; window.LCNDA_APP.setModule('maintenance'); });
                    await p.waitForSelector('.rfr-page [data-rfr-try]', {timeout: 20000});
                    await p.fill('.rfr-page [data-rfr-try]', 'Jn Bte de la Combe vers 1850');
                    await p.waitForSelector('.rfr-understood li', {timeout: 10000});
                    assert.match(await p.locator('.rfr-understood').innerText(), /Jean-Baptiste/);
                    if (SHOTS) await p.screenshot({path: path.join(SHOTS, `rfr-reglages-${name}.png`)});
                    await noScroll();
                    await ctx.close();
                });
            }
            await browser.close();
            await t('aucune erreur JavaScript', () => deq(errors, []));
        }
    } finally {
        proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
    }

    /* ═════ 4. 100 000 personnes ═════ */
    if (process.env.RFR_PERF !== '0') await perf();
    done();
})();

async function perf() {
    const N = Math.max(1000, Number(process.env.RFR_N) || 100000);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-rfr-big-'));
    const envB = {...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '2'};
    try {
        await t(`${N.toLocaleString('fr-FR')} personnes : migration n°96 et recherches rapides`, async () => {
            // la base fabriquée par scripts/grosse-base.php est déjà à la dernière structure : on la ramène à 95 pour mesurer la mise à jour
            const g = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'memory_limit=2048M', path.join(appRoot, 'scripts/grosse-base.php'), String(N), '1789'], {cwd: appRoot, env: envB, encoding: 'utf8', maxBuffer: 1 << 24});
            assert.equal(g.status, 0, g.stderr || g.stdout);
            const down = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$p=new PDO('sqlite:'.getenv('GENEALOGY_DATA_DIR').'/genealogy.sqlite'); $p->exec('DROP TABLE IF EXISTS rfr_names'); $p->exec("DELETE FROM meta WHERE key IN ('rfr_seen','rfr_dirty')"); $p->exec('PRAGMA user_version = 95');`], {cwd: appRoot, env: envB, encoding: 'utf8'});
            assert.equal(down.status, 0, down.stderr);
            const m = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'memory_limit=1024M', '-r', `require 'lib/bootstrap.php'; $t=microtime(true); $p=db(); echo round((microtime(true)-$t)*1000),'|',$p->query('SELECT count(*) FROM rfr_names')->fetchColumn();`], {cwd: appRoot, env: envB, encoding: 'utf8'});
            assert.equal(m.status, 0, m.stderr);
            const [ms, rows] = m.stdout.trim().split('|').map(Number);
            console.log(`   migration n°96 (copie de sécurité comprise) : ${ms} ms, ${rows} noms`);
            assert.ok(rows >= N); assert.ok(ms < 30000, 'mise à jour trop lente'); checks += 2;
            const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
            const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'memory_limit=1024M', '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], {cwd: appRoot, env: envB, stdio: 'ignore'});
            const base = `http://127.0.0.1:${port}/`;
            try {
                for (let i = 0; i < 200; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
                let cookie = ''; await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r.text(); });
                const timed = async q => { const ms = []; let j = null; for (let i = 0; i < 3; i++) { const t0 = performance.now(); const r = await fetch(base + 'api.php?' + new URLSearchParams(q), {headers: {Cookie: cookie}}); j = await r.json(); ms.push(performance.now() - t0); } ms.sort((a, b) => a - b); return [ms[1], j]; };
                for (const [label, q, lim] of [['liste des Personnes (sans recherche)', {action: 'people', limit: 180, kind: 'human'}, 1500], ['Personnes « Martin »', {action: 'people', q: 'Martin', limit: 180, kind: 'human'}, 1500],
                    ['Personnes « jean martin »', {action: 'people', q: 'jean martin', limit: 180}, 1500], ['Personnes « Dupond » (repli phonétique)', {action: 'people', q: 'Dupond', limit: 180}, 1500],
                    ['Personnes « Petrus vers 1850 »', {action: 'people', q: 'Petrus vers 1850', limit: 180}, 1500], ['⌘K « martin »', {action: 'quick_search', q: 'martin'}, 1500],
                    ['menu de choix « mar »', {action: 'picker_search', kind: 'person', q: 'mar', limit: 30}, 1500], ['Listes → Personnes « martin »', {action: 'list', type: 'persons', q: 'martin'}, 2000],
                    ['Listes → Événements « naissance vers 1850 »', {action: 'list', type: 'events', q: 'naissance vers 1850'}, 3000]]) {
                    const [ms] = await timed(q);
                    console.log(`   ${label.padEnd(46)} ${String(Math.round(ms)).padStart(6)} ms`);
                    assert.ok(ms < lim, `${label} : ${Math.round(ms)} ms`); checks++;
                }
            } finally { proc.kill(); }
        });
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

function done() {
    if (failed) { console.error(`\n${failed} échec(s) (${checks} vérifications)`); process.exit(1); }
    console.log(`\nTout est bon (${checks} vérifications).`);
}
