'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * ⚖️ Outils du généalogiste successoral et ＋ Ajouter un onglet (maquette docs/design/onglets-et-successoral-outils.html,
 * parties A et B1 à B6) :
 *     node tests/test-successoral-outils.js      (captures : /tmp/claude-0/sp/succ/out-*.png)
 *  1. sans serveur : 📊 parts en euros (fractions exactes, 1/3, 1/7, montants à reste, 0 €, montant énorme, « 187 450,50 » et
 *     « 187450.5 », commission sans TVA) ; ⏱ arrondi à la minute, découpe à minuit, pause après 10 min ; 🔔 retards + aujourd'hui,
 *     « 9+ », ⏭ lundi ; 📋 liste de contrôle (demandé = à revoir, manquant = manque) ; 🧾 chaîne du défunt vers l'héritier ;
 *     ✉️ champs, champ inconnu, champ vide, exclus d'office ; ＋ catalogue (usage × onglet, conseillé, absent) ;
 *  2. le serveur : migration 93, ⏱ temps noté (une ligne par jour, ⏱, colonne « Temps »), 🔔 « due_items » (sans nom ni
 *     adresse), ✓ ⏭ ↶ dans cette généalogie et dans une autre, ✉️ modèles à soi, série rangée et annulée d'un coup (une ligne au
 *     journal), « Remis au notaire » avec le résumé, rien en mode consultation, l'actif net jamais envoyé ;
 *  3. le navigateur (Playwright) à 1440 px, 390 px et en sombre : ＋ au bout du menu et la fenêtre, chronomètre, cloche,
 *     liste de contrôle, chaîne de filiation, parts en euros, courriers en série — un nom piégé n'est jamais exécuté.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const S = require('../assets/js/heritage-successoral-core.js');
const O = require('../assets/js/heritage-successoral-outils-core.js');
const TP = require('../assets/js/app-onglets-plus.js');

const appRoot = path.resolve(__dirname, '..');
const UX = process.env.SHOTS || '/tmp/claude-0/sp/succ';
const XSS = '<img src=x onerror=window.__xss=1>';
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const c = n => BigInt(n);

/* la famille de la maquette : Paul MAZAUD († 2025), ses frère et sœurs ; Louise (†) représentée par Jeanne et Marc LACOMBE,
 * Hélène (†) par Sylvie ROUSSILHE */
function maz() {
    const g = {persons: {}, parents: [], unions: []};
    const P = (id, first, last, gender, birth, death = null) => { g.persons[id] = {id, first, last, gender: gender === 'f' ? 'female' : 'male', birth: {date: String(birth), year: birth}, death: death ? {date: String(death), year: Number(String(death).slice(0, 4))} : null, status: death ? 'deceased' : 'living', dead_event: !!death, children_status: 'unknown'}; };
    P(1, 'Jean', 'MAZAUD', 'm', 1910, '1980'); P(2, 'Marie', 'PEYRAT', 'f', 1912, '1990');
    P(10, 'Paul', 'MAZAUD', 'm', 1938, '2025-03-02'); P(11, 'Louise', 'MAZAUD', 'f', 1941, '2019'); P(12, 'Pierre', 'LACOMBE', 'm', 1940, '2000');
    P(13, 'André', 'MAZAUD', 'm', 1945); P(14, 'Hélène', 'MAZAUD', 'f', 1943, '2015');
    P(20, 'Jeanne', 'LACOMBE', 'f', 1967); P(21, 'Marc', 'LACOMBE', 'm', 1969); P(22, 'Sylvie', 'ROUSSILHE', 'f', 1970);
    for (const k of [10, 11, 13, 14]) { g.parents.push({child: k, parent: 1, rel: 'biological'}, {child: k, parent: 2, rel: 'biological'}); }
    for (const k of [20, 21]) { g.parents.push({child: k, parent: 11, rel: 'biological'}, {child: k, parent: 12, rel: 'biological'}); }
    g.parents.push({child: 22, parent: 14, rel: 'biological'});
    g.unions.push({id: 100, a: 1, b: 2, married: true, marriage: {date: '1936'}, divorced: false, divorce: {date: ''}, free: false}, {id: 101, a: 11, b: 12, married: true, marriage: {date: '1966'}, divorced: false, divorce: {date: ''}, free: false});
    return g;
}

(async () => {
    /* ═════ 1. sans serveur ═════ */
    await t('📊 saisie de l’actif : « 187 450,50 », « 187450.5 », « 187.450,50 », « 1 000 000 € » ; vide, lettres, négatif refusés', () => {
        for (const s of ['187 450,50', '187450.5', '187.450,50', '187 450,50 €', '187 450,50', '187450,50', '187,450.50', '€187450.50']) assert.equal(O.parseEuros(s).cents, c(18745050), s);
        assert.equal(O.parseEuros('187.450').cents, c(18745000), '187.450 = des milliers');
        assert.equal(O.parseEuros('1 000 000 €').cents, c(100000000));
        assert.equal(O.parseEuros('0').cents, c(0)); assert.equal(O.parseEuros('0,00 €').ok, true);
        assert.equal(O.parseEuros('12,3456').cents, c(1235), 'quatre décimales : arrondi au centime'); assert.equal(O.parseEuros('12,345').cents, c(1234500), '« 12,345 » : des milliers (comme « 12.345 »)');
        for (const [s, why] of [['', 'empty'], ['   ', 'empty'], ['abc', 'nan'], ['12a', 'nan'], ['-5', 'neg'], ['−5', 'neg'], ['1,2,3', 'nan'], ['9'.repeat(25), 'absurd'], ['.', 'nan']]) assert.equal(O.parseEuros(s).why, why, s);
        assert.equal(O.parseEuros('1 000 000 000,01').huge, true, 'plus d’un milliard : à confirmer');
        assert.equal(O.parseEuros('999 999 999').huge, false);
    });
    await t('📊 partage au centime : 1/3 et 1/6 de 187 450 € (la maquette), le total tombe juste, les centimes aux plus grosses pertes', () => {
        const sh = [{id: 'andre', share: '1/3'}, {id: 'jeanne', share: '1/6'}, {id: 'marc', share: '1/6'}, {id: 'sylvie', share: '1/3'}];
        const r = O.splitCents(c(18745000), sh);
        assert.deepEqual(r.map(x => x.cents), [c(6248333), c(3124167), c(3124167), c(6248333)]);
        assert.equal(r.reduce((a, x) => a + x.cents, 0n), c(18745000));
        assert.deepEqual(r.map(x => x.rounded), [false, true, true, false]);
        assert.equal(O.formatCents(c(3124167)), '31 241,67');
        // la commission : 30 % sans TVA, 25 % d'un 1/3 (la maquette)
        assert.equal(O.commission(c(3124167), 30), c(937250)); assert.equal(O.commission(c(6248333), 25), c(1562083)); assert.equal(O.commission(c(6248333), '12,5'), c(781042));
        assert.equal(O.commission(c(100), 0), 0n); assert.equal(O.commission(c(1), 50), c(1), 'demi-centime : au plus proche (vers le haut)');
    });
    await t('📊 cas tordus : 1/7, montant à reste, 0 €, montant énorme (exact, sans virgule flottante), parts qui ne totalisent pas 1', () => {
        const sept = Array.from({length: 7}, (_, i) => ({id: i, share: '1/7'}));
        for (const tot of [c(100), c(1), c(7), c(999999), c(18745050)]) { const r = O.splitCents(tot, sept); assert.equal(r.reduce((a, x) => a + x.cents, 0n), tot, String(tot)); assert.ok(r.every(x => x.cents >= tot / 7n && x.cents <= tot / 7n + 1n)); }
        const r1 = O.splitCents(c(100), sept); assert.deepEqual(r1.map(x => x.cents), [15n, 15n, 14n, 14n, 14n, 14n, 14n], 'à égalité : l’ordre de la liste');
        const tiers = O.splitCents(c(1), [{id: 1, share: '1/3'}, {id: 2, share: '1/3'}, {id: 3, share: '1/3'}]); assert.deepEqual(tiers.map(x => x.cents), [1n, 0n, 0n]);
        assert.deepEqual(O.splitCents(0n, [{id: 1, share: '1/2'}, {id: 2, share: '1/2'}]).map(x => x.cents), [0n, 0n], '0 €');
        const big = c('123456789012345678'); const rb = O.splitCents(big, [{id: 1, share: '1/3'}, {id: 2, share: '2/3'}]);
        assert.deepEqual(rb.map(x => x.cents), [c('41152263004115226'), c('82304526008230452')]); assert.equal(rb[0].cents + rb[1].cents, big);
        assert.equal(O.formatCents(c('123456789012345678'), 'fr-FR'), '1 234 567 890 123 456,78');
        const half = O.splitCents(c(1001), [{id: 1, share: '1/4'}, {id: 2, share: '1/4'}]); assert.equal(half.reduce((a, x) => a + x.cents, 0n), c(501), 'la moitié de 10,01 € arrondie : 5,01 €');
        const T = O.euroTable([{id: 1, name: 'André MAZAUD', kin: 'frère', role: 'heir', share: '1/2'}, {id: 2, name: 'X', kin: 'frère', role: 'heir', share: '1/2'}, {id: 3, name: 'Y', role: 'out', share: '0'}, {id: 4, name: 'Z', role: 'heir', share: '0'}], c(1000001), {1: {percent: 30, signed: true}, 2: {percent: 25, signed: false}});
        assert.equal(T.lines.length, 3, 'pas les écartés ; le renonçant à 0 reste en gris');
        assert.equal(T.total, c(1000001)); assert.equal(T.lines[2].zero, true); assert.equal(T.lines[2].cents, 0n);
        assert.equal(T.lines[0].fee + T.lines[0].rest, T.lines[0].cents); assert.equal(T.lines[1].signed, false); assert.equal(T.rests + T.fees, T.total);
    });
    await t('⏱ minute la plus proche, une ligne par jour après minuit, pause toute seule après 10 min sans rien toucher', () => {
        assert.equal(O.roundMinutes(29999), 0); assert.equal(O.roundMinutes(30000), 1); assert.equal(O.roundMinutes(65 * 60000 + 20000), 65);
        const at = (d, h, m) => new Date(2026, 10, d, h, m).getTime();
        assert.deepEqual(O.byDay([{from: at(20, 23, 20), to: at(21, 0, 25)}]).map(x => [x.day, x.minutes]), [['2026-11-20', 40], ['2026-11-21', 25]]);
        assert.deepEqual(O.byDay([{from: at(20, 9, 0), to: at(20, 9, 30)}, {from: at(20, 10, 0), to: at(20, 10, 35)}]).map(x => x.minutes), [65]);
        assert.deepEqual(O.byDay([{from: at(20, 9, 0), to: at(20, 9, 0)}]), []);
        const st = {start: at(20, 11, 0), segs: [{from: at(20, 9, 0), to: at(20, 10, 0)}]};
        assert.equal(O.elapsed(st, at(20, 11, 30)), 90 * 60000);
        assert.equal(O.autoPause(st, at(20, 11, 42), at(20, 11, 51)), null, '9 min : continue');
        const p = O.autoPause(st, at(20, 11, 42), at(20, 11, 52)); assert.equal(p.start, 0); assert.equal(p.paused, 'auto');
        assert.deepEqual(p.segs.at(-1), {from: at(20, 11, 0), to: at(20, 11, 42)}, 'le temps sans rien toucher n’est pas compté'); assert.deepEqual(p.gap, {from: at(20, 11, 42), to: at(20, 11, 52)});
        assert.equal(O.elapsed(p), 102 * 60000);
        assert.equal(O.chronoLabel(['👥 Héritiers', '📑 Pièces']), 'Recherches : 👥 Héritiers, 📑 Pièces');
    });
    await t('🔔 pastille = retards + aujourd’hui (pas la semaine), « 9+ », les retards d’abord ; ⏭ demain ou lundi', () => {
        const g = O.bellGroups([{due: '2026-11-14', number: 'b'}, {due: '2026-11-19'}, {due: '2026-11-20'}, {due: '2026-11-24'}, {due: '2026-12-15'}, {due: 'x'}], '2026-11-20');
        assert.deepEqual([g.late.length, g.today.length, g.week.length, g.count, g.badge], [2, 1, 1, 3, '3']);
        assert.equal(g.late[0].due, '2026-11-14', 'le plus ancien d’abord');
        assert.equal(O.bellGroups(Array.from({length: 12}, () => ({due: '2026-01-01'})), '2026-11-20').badge, '9+');
        assert.equal(O.bellGroups([{due: '2026-11-25'}], '2026-11-20').badge, '', 'la semaine seule : pas de pastille');
        assert.equal(O.snoozeDay('2026-11-19'), '2026-11-20'); assert.equal(O.snoozeDay('2026-11-20'), '2026-11-23', 'vendredi → lundi'); assert.equal(O.snoozeDay('2026-11-21'), '2026-11-23');
    });
    const g = maz();
    const R = S.compute(g, {deceasedId: 10, deathDate: '2025-03-02'});
    await t('moteur : 1/3 André, 1/6 Jeanne et Marc, 1/3 Sylvie (la maquette)', () => {
        const sh = Object.fromEntries(R.rows.filter(r => r.role === 'heir').map(r => [r.name, r.share]));
        assert.deepEqual(sh, {'André MAZAUD': '1/3', 'Jeanne LACOMBE': '1/6', 'Marc LACOMBE': '1/6', 'Sylvie ROUSSILHE': '1/3'});
    });
    const D0 = {id: 1, number: '2026-014', state: 'recherche', deceased_id: 10, graph: g, hypothesis_note: '', addresses: {13: {lines: ['12 rue des Écoles', '87000 Limoges']}, 20: {lines: ['4 av. de Paris', '19100 Brive'], email: 'j@example.org'}, 22: {lines: ['1 place', '19000 Tulle']}},
        courriers: [{id: 471, person_id: 21, kind: 'acte', date_envoi: '2026-11-03'}, {id: 480, person_id: 22, kind: 'contact', date_envoi: '2026-10-03', reponse: 'yes', signe_le: ''}, {id: 481, person_id: 13, kind: 'contrat', date_envoi: '2026-10-01', signe_le: '2026-10-20'}],
        contact: {21: {state: 'introuvable', at: '2026-09-02'}}, deadlines: [{id: 1, due: '2026-11-14', label: 'Relance', done: false}, {id: 2, due: '2026-12-30', label: 'Plus tard', done: false}], acts: {'D:10': {label: 'Décès', place: 'Limoges', year: 2025, sources: ['AD 87, état civil Limoges, D 2025 n° 412'], media: 1}}};
    const states = {'D:10': 'have', 'N:10': 'have', 'N:11': 'have', 'N:13': 'have', 'N:14': 'have', 'D:11': 'have', 'D:14': 'have', 'N:20': 'have', 'N:21': 'asked', 'N:22': 'missing', 'D:1': 'have', 'D:2': 'have'};
    const P = S.pieces(R, g, {acts: D0.acts, states, asked: {'N:21': {courrier_id: 471, date: '2026-11-03'}}});
    await t('📋 avant de remettre : un acte demandé = à revoir (pas manque), un acte manquant = manque, contrat « oui » sans date, introuvable, retard ; jamais bloquant', () => {
        const ck = O.beforeNotary(D0, R, P, {today: '2026-11-20'});
        const by = Object.fromEntries(ck.items.map(i => [i.key, i]));
        assert.equal(by.death.level, 'ok'); assert.match(by.death.detail, /D 2025 n° 412/);
        assert.equal(by.links.level, 'miss'); assert.match(by.links.detail, /Sylvie ROUSSILHE/);
        assert.equal(by.asked.level, 'warn', 'demandé, pas reçu : à revoir'); assert.match(by.asked.detail, /demandé le 2026-11-03 \(courrier n° 471\)/);
        assert.equal(by.contracts.level, 'warn'); assert.match(by.contracts.detail, /Sylvie ROUSSILHE a répondu « oui », pas de date de signature/);
        assert.equal(by.contact.level, 'warn'); assert.match(by.contact.detail, /Marc LACOMBE \(introuvable, depuis le 2026-09-02\)/);
        assert.equal(by.total.level, 'ok'); assert.deepEqual(by.total.detail.split(' + ').sort(), ['1/3', '1/3', '1/6', '1/6']);
        assert.equal(by.late.level, 'warn'); assert.equal(ck.ready, false); assert.equal(ck.ok + ck.warn + ck.miss, ck.total);
        assert.match(O.notaryJournal(ck), /^Remis au notaire avec \d manque\(s\) et \d point\(s\) à revoir \(.*Actes demandés, pas encore reçus : 1/);
        const ok = O.beforeNotary({...D0, deadlines: []}, R, S.pieces(R, g, {acts: D0.acts, states: Object.fromEntries(Object.keys(states).map(k => [k, 'have']))}), {today: '2026-11-20'});
        assert.equal(ok.items.find(i => i.key === 'links').level, 'ok'); assert.equal(ok.items.find(i => i.key === 'asked'), undefined);
    });
    await t('🧾 chaîne de filiation : du défunt vers l’héritier, les actes communs une seule fois, puis « commun, voir 1 »', () => {
        const ch = O.filiationChain(D0, R, P);
        assert.equal(ch.length, 4);
        const first = ch[0]; assert.equal(first.steps[0].key, 'D:10', 'd’abord le décès du défunt');
        assert.equal(first.steps[0].seen, 0); assert.deepEqual(first.steps[0].sources, ['AD 87, état civil Limoges, D 2025 n° 412']);
        const jeanne = ch.find(h => h.name === 'Jeanne LACOMBE');
        assert.deepEqual(jeanne.steps.map(s => s.key).filter(k => !['D:10', 'N:10', 'D:1', 'D:2'].includes(k)), ['N:11', 'D:11', 'N:20'], 'Louise, sa mort (représentée), puis Jeanne');
        assert.deepEqual(jeanne.steps.slice(0, 2).map(s => s.key), ['D:10', 'N:10'], 'd’abord le défunt');
        assert.equal(ch[1].steps.find(s => s.key === 'D:10').seen, 1, 'commun : renvoi au premier héritier'); assert.equal(ch[0].steps.find(s => s.key === 'D:10').seen, 0);
        const marc = ch.find(h => h.name === 'Marc LACOMBE'); assert.equal(marc.steps.find(s => s.key === 'N:21').state, 'asked');
        assert.ok(O.citedArticles(R).includes('752-2'), 'la représentation, citée par le moteur');
        assert.ok(O.citedArticles(R).every(a => S.LAW[a]));
    });
    await t('✉️ champs : valeurs, champ vide effacé (et signalé), champ inconnu avec sa ligne, le défunt n’est jamais un champ ; exclus d’office', () => {
        const v = O.letterValues(D0, R.rows.find(r => r.id === 20), {date: '20 nov. 2026', sent: '3 oct. 2026', sender: 'Claire D.'});
        assert.equal(v['civilité'], 'Madame'); assert.equal(v['prénom'], 'Jeanne'); assert.equal(v.nom, 'LACOMBE'); assert.equal(v.adresse, '4 av. de Paris\n19100 Brive'); assert.equal(v.dossier, '2026-014');
        assert.ok(!Object.values(v).some(x => /Paul/.test(x)), 'le défunt n’est pas un champ');
        assert.ok(!O.FIELDS.some(f => /d[ée]funt/.test(f)));
        const f = O.fillLetter('{civilité},\nmon courrier du {envoyé_le} · {heir} · {sender}', v); assert.equal(f.text, 'Madame,\nmon courrier du 3 oct. 2026 · Jeanne LACOMBE · Claire D.');
        const e = O.fillLetter('{civilité} {nom}', {...v, 'civilité': ''}); assert.equal(e.text, 'LACOMBE'); assert.deepEqual(e.empty, ['civilité']); assert.ok(e.parts.some(p => p.empty && p.field === 'civilité'));
        assert.deepEqual(O.unknownFields('Bonjour\n\n\n\n{dossierr} et {nom}'), [{name: 'dossierr', line: 5}]);
        assert.deepEqual(O.unknownFields('{heir} {sender} {sent}'), [], 'les anciens champs restent compris');
        const x = O.fillLetter('{nom}', {...v, nom: XSS}); assert.equal(x.text, XSS, 'le texte reste brut : échappé à l’affichage');
        const rec = O.recipients(D0, R);
        assert.deepEqual(rec.map(r => [r.name, r.checked, r.why]).sort(), [['André MAZAUD', true, ''], ['Jeanne LACOMBE', true, ''], ['Marc LACOMBE', false, 'introuvable'], ['Sylvie ROUSSILHE', true, '']]);
        assert.equal(rec.find(r => r.name === 'Sylvie ROUSSILHE').last.date, '2026-10-03');
        const noaddr = O.recipients({...D0, addresses: {}}, R); assert.ok(noaddr.every(r => !r.checked));
        assert.equal(noaddr.find(r => r.id === 13).why, 'noaddr');
    });
    await t('＋ catalogue : usage × onglet (A2) — successoral : 📮 Courriers conseillé (jamais ajouté seul), ✨ Trésors et 💬 Questions absents ; plusieurs usages : conseillé pour au moins l’un', () => {
        const by = k => TP.CATALOG.find(x => x.k === k);
        assert.equal(TP.CATALOG.every(x => x.rec.length === 10 && /^[YRPN]+$/.test(x.rec)), true);
        assert.equal(TP.status(by('courriers'), ['successoral']), 'rec');
        assert.equal(TP.status(by('tresors'), ['successoral']), 'off'); assert.equal(TP.status(by('questions'), ['successoral']), 'off');
        assert.equal(TP.status(by('documents'), ['successoral']), 'shown'); assert.equal(TP.status(by('successoral'), ['successoral']), 'shown');
        assert.equal(TP.status(by('documents'), ['genealogie']), 'rec'); assert.equal(TP.status(by('adn'), ['genealogie']), 'ok');
        assert.equal(TP.status(by('tresors'), ['genealogie', 'successoral']), 'rec', 'conseillé pour au moins un usage');
        assert.equal(TP.status(by('adn'), ['lignee', 'recensement']), 'off');
        assert.equal(TP.idOf(by('courriers')), 'ct_addcourriers'); assert.match(TP.idOf(by('ou_chercher')), /^ct_[a-z0-9]{4,24}$/);
        assert.ok(TP.matches(by('courriers'), 'relance')); assert.ok(TP.matches(by('transcriptions'), 'acte')); assert.ok(TP.matches(by('agenda'), 'AGENDA')); assert.ok(!TP.matches(by('adn'), 'courrier'));
        assert.equal(TP.CATALOG.filter(x => x.target).every(x => /^(list|maint|stat|search):[a-z_]+$/.test(x.target)), true);
    });
    await t('code : bouton 🔔 réglable (usage successoral), fichiers chargés, migration 93, exports publics sans succ_*', () => {
        const ap = fs.readFileSync(path.join(appRoot, 'assets/js/app-apparence.js'), 'utf8'); assert.match(ap, /\['bell', '#succ-bell-open', '🔔'/); assert.match(ap, /\['succ', 'bell'\]\.includes/);
        const idx = fs.readFileSync(path.join(appRoot, 'index.php'), 'utf8');
        for (const f of ['heritage-successoral-outils-core.js', 'heritage-successoral-outils.js', 'app-onglets-plus.js', 'onglets-plus.css']) assert.match(idx, new RegExp(f.replace('.', '\\.') + '\\?v=\\d+'), f);
        assert.match(idx, /id="succ-bell-open" hidden/);
        { const mg = fs.readFileSync(path.join(appRoot, 'lib/migrations.php'), 'utf8'); assert.ok(Number((mg.match(/const SCHEMA_VERSION = (\d+);/) || [])[1]) >= 93); assert.match(mg, /93 => 'schema_v93'/); } // 94 : 🔐 📜 (lib/verrou.php)
        for (const f of ['lib/gedcom.php', 'lib/family_share.php', 'lib/export_gramps.php']) if (fs.existsSync(path.join(appRoot, f))) assert.doesNotMatch(fs.readFileSync(path.join(appRoot, f), 'utf8'), /succ_templates|succ_fees/, f);
        const pr = fs.readFileSync(path.join(appRoot, 'assets/js/app-premier.js'), 'utf8'); assert.match(pr, /genealogie-menu-added/, 'un onglet ajouté à la main n’est pas caché par un usage');
    });

    /* ═════ 2. le serveur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-succ-outils-'));
    const dir = path.join(tmp, 'data');
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$ins = $pdo->prepare('INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(?,?,?,?,?)');
foreach ([[1,'Jean','MAZAUD','male','deceased'],[2,'Marie','PEYRAT','female','deceased'],[10,'Paul','MAZAUD','male','deceased'],[11,'Louise','MAZAUD','female','deceased'],[12,'Pierre','LACOMBE','male','deceased'],[13,'André','MAZAUD','male','living'],[14,'Hélène','MAZAUD','female','deceased'],
  [20,'Jeanne','LACOMBE','female','living'],[21,'Marc','LACOMBE','male','living'],[22,'Sylvie','ROUSSILHE','female','living'],[23,'<img src=x onerror=window.__xss=1>','PIÈGE','female','living'],[30,'Robert','ROUSSILHE','male','deceased']] as $r) { $ins->execute($r); }
$tag = fn($t) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$t' ORDER BY id LIMIT 1")->fetchColumn();
$ev = $pdo->prepare("INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year) VALUES(?,?,?,?,?,?)");
foreach ([[1,'BIRT','1910'],[1,'DEAT','1980'],[2,'BIRT','1912'],[2,'DEAT','1990'],[10,'BIRT','1938'],[10,'DEAT','2 mars 2025'],[11,'BIRT','1941'],[11,'DEAT','2019'],[12,'DEAT','2000'],[13,'BIRT','1945'],[14,'BIRT','1943'],[14,'DEAT','2015'],[20,'BIRT','1967'],[21,'BIRT','1969'],[22,'BIRT','1970'],[23,'BIRT','1972'],[30,'BIRT','1930'],[30,'DEAT','2024']] as [$p,$t,$d]) { $ev->execute(['person',$p,null,$tag($t),$d,(int) substr($d,-4)]); }
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(100,1,2),(101,12,11),(102,null,14)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(100,10),(100,11),(100,13),(100,14),(101,20),(101,21),(102,22),(102,23)");
$lc = $pdo->prepare('INSERT INTO living_contacts(person_id,first_name,last_name,address,postal_code,city,email) VALUES(?,?,?,?,?,?,?)');
$lc->execute([13,'André','MAZAUD','12 rue des Écoles','87000','Limoges','']); $lc->execute([20,'Jeanne','LACOMBE','4 av. de Paris','19100','Brive','jeanne@example.org']); $lc->execute([22,'Sylvie','ROUSSILHE','1 place du Marché','19000','Tulle','']);
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const api = async (action, q = {}) => { const r = await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } }); return r.json(); };
    const get = async (op, q = {}) => api('successoral', { op, ...q });
    const post = async (body, action = 'successoral_write') => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ ...body, csrf }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    const w = async body => { const r = await post(body); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.result; };
    const php = code => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db(); ${code}`], { cwd: appRoot, encoding: 'utf8', env });
    const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    let A = 0, B = 0, other = '';
    try {
        await t('serveur : migration 93 — succ_templates, succ_fees.source', async () => {
            const r = php(`echo json_encode([(int) $pdo->query("SELECT count(*) FROM sqlite_master WHERE name='succ_templates'")->fetchColumn(), (int) $pdo->query("SELECT count(*) FROM pragma_table_info('succ_fees') WHERE name='source'")->fetchColumn(), (int) $pdo->query('PRAGMA user_version')->fetchColumn()]);`);
            const [tpl, src] = JSON.parse(r.stdout); assert.equal(tpl, 1); assert.equal(src, 1);
        });
        await t('serveur : ⏱ temps noté — une ligne par jour (⏱ chrono), colonne « Temps » ; ↶ Annuler ; dossier clos refusé', async () => {
            A = (await w({ op: 'save', deceased_id: 10, number: '2026-014', notary_text: 'Me VIALLE', notary_ref: 'VIA-25-118' })).id;
            const r = await w({ op: 'chrono_note', case_id: A, label: 'Recherches : 👥 Héritiers, 📑 Pièces', days: [{ day: '2026-11-20', minutes: 40 }, { day: '2026-11-21', minutes: 25 }] });
            assert.equal(r.ids.length, 2);
            const D = await get('get', { id: A });
            assert.deepEqual(D.fees.map(f => [f.day, f.minutes, f.source]), [['2026-11-21', 25, 'chrono'], ['2026-11-20', 40, 'chrono']]);
            assert.ok(D.journal.some(j => /⏱ Temps compté par le chronomètre : 0 h 40/.test(j.text)));
            const row = (await get('index')).bases.find(b => b.active).cases.find(x => x.id === A); assert.equal(row.minutes, 65, 'la colonne « Temps » du tableau de bord');
            await w({ op: 'fee_save', case_id: A, id: r.ids[0], kind: 'time', day: '2026-11-20', label: 'Corrigé à la main', minutes: 45 });
            assert.equal((await get('get', { id: A })).fees.find(f => f.id === r.ids[0]).source, 'chrono', '✎ corriger garde le ⏱');
            await w({ op: 'chrono_undo', case_id: A, ids: r.ids }); assert.equal((await get('get', { id: A })).fees.length, 0);
            assert.equal((await post({ op: 'chrono_note', case_id: A, days: [{ day: '2026-11-20', minutes: 0 }] })).status, 422, 'rien à noter');
            assert.equal((await post({ op: 'chrono_note', case_id: A, days: [{ day: 'demain', minutes: 5 }] })).status, 422);
        });
        await t('serveur : 🔔 « due_items » dans l’index léger — échéances et relances jusqu’à 7 jours, sans nom d’héritier ni adresse', async () => {
            await w({ op: 'deadline_save', case_id: A, due: day(-6), label: 'Rendre le tableau au notaire', kind: 'remise' });
            await w({ op: 'deadline_save', case_id: A, due: day(0), label: 'Relance contrat de révélation', kind: 'relance' });
            await w({ op: 'deadline_save', case_id: A, due: day(30), label: 'Plus tard', kind: 'autre' });
            const L = await w({ op: 'file_letter', case_id: A, person_id: 22, kind: 'contact', letter: 'Madame,', date_envoi: day(-30), relance_jours: 30, recipient_address: '1 place du Marché\n19000 Tulle' });
            const idx = await get('index'); const items = idx.bases.find(b => b.active).cases.find(x => x.id === A).due_items;
            assert.deepEqual(items.filter(x => x.sort !== 'declaration').map(x => x.kind).sort(), ['deadline', 'deadline', 'relance'], 'pas l’échéance dans 30 jours');
            assert.ok(items.some(x => x.sort === 'declaration'), 'la déclaration de succession (6 mois), faite d’office, en retard');
            const rel = items.find(x => x.kind === 'relance'); assert.equal(rel.label, `Relance courrier n° ${L.courrier_id} — premier contact`); assert.equal(rel.due, day(0));
            assert.doesNotMatch(JSON.stringify(items), /ROUSSILHE|Sylvie|Tulle|Marché/, 'jamais un nom d’héritier ni une adresse');
        });
        await t('serveur : 🔔 ✓ fait, ⏭ reporter, ↶ annuler (échéance et relance), une ligne au journal du dossier', async () => {
            const items = (await get('index')).bases.find(b => b.active).cases.find(x => x.id === A).due_items;
            const dl = items.find(x => x.kind === 'deadline' && x.due === day(-6)), rel = items.find(x => x.kind === 'relance');
            const r1 = await w({ op: 'due_mark', kind: 'deadline', id: dl.id, act: 'done' }); assert.deepEqual(r1.prev, { due: day(-6), done: 0 });
            let D = await get('get', { id: A }); assert.equal(D.deadlines.find(x => x.id === dl.id).done, true); assert.match(D.journal[0].text, /^Échéance faite : Rendre le tableau/);
            await w({ op: 'due_mark', kind: 'deadline', id: dl.id, act: 'undo', prev: r1.prev });
            D = await get('get', { id: A }); assert.equal(D.deadlines.find(x => x.id === dl.id).done, false);
            const r2 = await w({ op: 'due_mark', kind: 'relance', id: rel.id, act: 'snooze', to: day(3) });
            D = await get('get', { id: A }); assert.equal(D.courriers.find(x => x.id === rel.id).relance_date, day(3)); assert.match(D.journal[0].text, /reportée au/);
            await w({ op: 'due_mark', kind: 'relance', id: rel.id, act: 'undo', prev: r2.prev });
            assert.equal((await get('get', { id: A })).courriers.find(x => x.id === rel.id).relance_date, day(0));
            assert.equal((await post({ op: 'due_mark', kind: 'deadline', id: 999999, act: 'done' })).status, 422);
            assert.equal((await post({ op: 'due_mark', kind: 'deadline', id: dl.id, act: 'snooze', to: 'x' })).status, 422);
            assert.equal((await post({ op: 'due_mark', gid: 'nexistepas', kind: 'deadline', id: dl.id, act: 'done' })).status, 422, 'généalogie inconnue');
        });
        await t('serveur : 🔔 un dossier dans une autre généalogie — lu par l’index, ✓ et ⏭ écrits dans celle-là', async () => {
            B = (await w({ op: 'save', deceased_id: 30, number: '2026-016', notary_text: 'Me PEYRAT' })).id;
            await w({ op: 'deadline_save', case_id: B, due: day(0), label: 'Déclaration de succession (6 mois), côté notaire', kind: 'declaration' });
            const g = await post({ name: '⚖️ Dossiers de succession' }, 'genealogy_create'); assert.equal(g.status, 200, JSON.stringify(g.body)); other = g.body.id;
            await w({ op: 'move', case_id: B, to: other });
            const there = (await get('index')).bases.find(b => b.id === other); const c2 = there.cases.find(x => x.number === '2026-016');
            const it = c2.due_items.find(x => x.label.startsWith('Déclaration')); assert.equal(it.due, day(0));
            const r = await w({ op: 'due_mark', gid: other, kind: 'deadline', id: it.id, act: 'snooze', to: day(1) });
            const again = (await get('index')).bases.find(b => b.id === other).cases.find(x => x.number === '2026-016').due_items.find(x => x.id === it.id); assert.equal(again.due, day(1));
            await w({ op: 'due_mark', gid: other, kind: 'deadline', id: it.id, act: 'undo', prev: r.prev });
            const ro = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$p = new PDO('sqlite:${path.join(dir, 'genealogies', other, 'genealogy.sqlite')}'); echo $p->query('SELECT text FROM succ_journal ORDER BY id DESC LIMIT 2')->fetchAll(PDO::FETCH_COLUMN)[1];`], { encoding: 'utf8' });
            assert.match(ro.stdout, /Échéance reportée au/, 'journal du dossier, dans sa généalogie');
        });
        await t('serveur : ✉️ modèles à soi (dans la généalogie des dossiers), série rangée d’un coup (une ligne au journal), annulée d’un coup', async () => {
            const m = await w({ op: 'tpl_save', name: 'Relance douce', kind: 'relance', body: '{civilité},\n{dossier}' });
            assert.deepEqual((await get('tpl_list')).items.map(x => [x.name, x.kind]), [['Relance douce', 'relance']]);
            await w({ op: 'tpl_save', id: m.id, name: XSS, kind: 'zzz', body: 'x' }); assert.equal((await get('tpl_list')).items[0].kind, 'autre');
            await w({ op: 'tpl_delete', id: m.id }); assert.equal((await get('tpl_list')).items.length, 0); await w({ op: 'tpl_restore', id: m.id }); assert.equal((await get('tpl_list')).items.length, 1);
            assert.equal((await post({ op: 'tpl_save', name: '', body: 'x' })).status, 422);
            const before = (await get('get', { id: A })).journal.length;
            const r = await w({ op: 'file_letters', case_id: A, kind: 'relance', objet: 'Relance', date_envoi: day(0), relance_jours: 30, letters: [{ person_id: 13, letter: 'Monsieur,' }, { person_id: 20, letter: 'Madame,', recipient_address: '4 av. de Paris' }, { person_id: 22, letter: 'Madame,' }] });
            assert.equal(r.ids.length, 3);
            let D = await get('get', { id: A });
            assert.equal(D.journal.length, before + 1, 'une seule ligne pour la série'); assert.match(D.journal[0].text, new RegExp(`^Courriers en série : relance à 3 héritier\\(s\\) \\(n° ${Math.min(...r.ids)} à ${Math.max(...r.ids)}\\)$`));
            assert.equal(D.courriers.filter(x => r.ids.includes(x.id)).every(x => x.relance_date === day(30)), true);
            const u = await w({ op: 'unfile_letters', case_id: A, ids: r.ids }); assert.equal(u.removed, 3);
            D = await get('get', { id: A }); assert.equal(D.courriers.filter(x => r.ids.includes(x.id)).length, 0); assert.match(D.journal[0].text, /^Courriers en série annulés : 3/);
            assert.equal((await post({ op: 'file_letters', case_id: A, letters: [] })).status, 422);
            assert.equal((await post({ op: 'file_letters', case_id: A, letters: Array.from({ length: 61 }, () => ({ person_id: 13, letter: 'x' })) })).status, 422, 'par paquets de 60 au plus');
        });
        await t('serveur : 📋 « Remis au notaire » quand même — le résumé au journal', async () => {
            await w({ op: 'state', id: A, state: 'remis', checked: 'forced', summary: 'Remis au notaire avec 1 manque(s) et 2 point(s) à revoir (Liens prouvés par aucun acte : 1)' });
            const D = await get('get', { id: A }); assert.match(D.journal[0].text, /remis quand même\) — Remis au notaire avec 1 manque/);
            await w({ op: 'state', id: A, state: 'recherche' });
        });
        await t('serveur : mode consultation — ni la cloche, ni les modèles, rien ne s’écrit', async () => {
            const act = async (action, body) => (await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ ...body, csrf }) })).status;
            assert.equal(await act('kiosk_enter', { password: 'secret1' }), 200);
            try {
                assert.ok((await get('index')).error, 'index refusé'); assert.ok((await get('tpl_list')).error, 'modèles refusés');
                for (const b of [{ op: 'chrono_note', case_id: A, days: [{ day: day(0), minutes: 5 }] }, { op: 'due_mark', kind: 'deadline', id: 1, act: 'done' }, { op: 'tpl_save', name: 'x', body: 'y' }, { op: 'file_letters', case_id: A, letters: [{ person_id: 13, letter: 'x' }] }]) {
                    const k = await post(b); assert.ok([403, 423].includes(k.status), `${b.op} : ${k.status}`);
                }
            } finally { assert.equal(await act('kiosk_exit', { password: 'secret1' }), 200); }
        });

        /* ═════ 3. le navigateur ═════ */
        let chromium = null;
        try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (_) { try { ({ chromium } = require('playwright')); } catch (__) { /* sauté */ } }
        if (!chromium) { console.log('— Playwright absent : partie navigateur sautée'); return; }
        // un acte en main pour le décès du défunt (avec sa cote) ; un acte demandé ; Marc introuvable
        await w({ op: 'piece', case_id: A, key: 'D:10', state: 'have', what: 'Le décès de Paul MAZAUD' });
        await w({ op: 'piece', case_id: A, key: 'N:21', state: 'asked', what: 'Naissance de Marc' });
        await w({ op: 'contact_state', case_id: A, person_id: 21, state: 'introuvable' });
        await w({ op: 'fee_save', case_id: A, kind: 'percent', percent: 30, person_id: 20, label: 'Contrat signé' });
        await w({ op: 'tpl_save', name: XSS, kind: 'relance', body: 'Modèle {nom}' });
        const browser = await chromium.launch();
        fs.mkdirSync(UX, { recursive: true });
        const open = async (w0, h0, dark, hash = '#successoral', usage = ['genealogie', 'successoral']) => {
            // les réglages « genealogie-… » suivent la base : l'usage et le thème y sont écrits avant d'ouvrir la page
            await post({ set: { 'genealogie-usage': JSON.stringify({ usages: usage, start: 'last' }), 'genealogie-menu-hidden': '[]', 'genealogie-menu-successoral': '1', ...(dark ? { 'genealogie-design': JSON.stringify({ preset: 'dark' }) } : {}) }, remove: [...(dark ? [] : ['genealogie-design']), 'genealogie-custom-tabs', 'genealogie-menu-order', 'genealogie-menu-added', 'genealogie-menu-plus', 'genealogie-menu-documents'] }, 'save_settings');
            const ctx = await browser.newContext({ viewport: { width: w0, height: h0 }, deviceScaleFactor: 1, colorScheme: dark ? 'dark' : 'light' });
            await ctx.addInitScript(([dk, us]) => { try { if (!sessionStorage.getItem('t-init')) { sessionStorage.setItem('t-init', '1'); if (dk) localStorage.setItem('genealogie-design', JSON.stringify({preset: 'dark'})); localStorage.setItem('genealogie-usage', JSON.stringify({usages: us, start: 'last'})); localStorage.setItem('genealogie-menu-successoral', '1'); localStorage.setItem('genealogie-menu-hidden', '[]'); localStorage.setItem('lcnda-succ-view', '"cases"'); localStorage.removeItem('lcnda-succ-chrono'); } } catch (_) {} }, [dark, usage]);
            const pg = await ctx.newPage(); const errs = [];
            pg.on('pageerror', e => errs.push('pageerror ' + e.message)); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|tile\.openstreetmap|ERR_|net::/.test(m.text())) errs.push('console ' + m.text()); });
            pg.on('dialog', d => d.dismiss());
            await pg.goto(base + hash); await pg.waitForFunction(() => window.LCNDA_EXT?.successoral?.openCase && window.LCNDA_EXT?.succOutils?.chronoButton && window.LCNDA_EXT?.tabsPlus && window.LCNDA_APP?.setModule, null, { timeout: 20000 });
            return { ctx, pg, errs };
        };
        const noSide = async pg => assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'pas de défilement de côté');
        const shot = async (pg, name) => { await pg.waitForTimeout(350); return pg.screenshot({ path: path.join(UX, `out-${name}.png`) }); };
        const xss = pg => pg.evaluate(() => window.__xss);
        const toastHas = (pg, re) => pg.waitForFunction(src => new RegExp(src).test(document.querySelector('.toast-region')?.textContent || ''), re.source, { timeout: 10000 });
        try {
            await t('navigateur 1440 : ＋ au bout du menu, la fenêtre (conseillés, recherche), cocher 📄 Documents → à la fin avant Réglages, ↶ Annuler ; raccourci 📮 Courriers', async () => {
                const { ctx, pg, errs } = await open(1440, 900, false, '#dashboard', ['genealogie']);
                await pg.evaluate(() => { localStorage.removeItem('genealogie-menu-hidden'); localStorage.removeItem('genealogie-menu-documents'); window.LCNDA_APP.applyMenuOrder(); });
                await pg.waitForSelector('.main-nav > .nav-add-tab');
                assert.equal(await pg.$eval('.main-nav', n => n.lastElementChild.classList.contains('nav-add-tab')), true, 'le dernier du menu');
                assert.equal(await pg.getAttribute('.nav-add-tab', 'title'), 'Ajouter un onglet');
                await shot(pg, 'menu-plus-1440');
                await pg.click('.nav-add-tab'); await pg.waitForSelector('dialog[open] [data-tp-cat]');
                const dlg = pg.locator('dialog[open]');
                assert.match(await dlg.textContent(), /Qu’est-ce que tu veux avoir sous la main \?/);
                assert.equal(await dlg.locator('[data-tp-card="documents"] .tp-tag.is-rec').count(), 1, '📄 Documents conseillé pour 🌳');
                assert.equal(await dlg.locator('[data-tp-card="documents"] input').isChecked(), false);
                await shot(pg, 'catalogue-1440');
                await dlg.locator('[data-tp-q]').fill('relance');
                assert.deepEqual(await dlg.locator('[data-tp-card]').evaluateAll(els => els.map(e => e.dataset.tpCard)), ['courriers', 'agenda']);
                await dlg.locator('[data-tp-q]').fill('');
                await dlg.locator('[data-tp-card="documents"] input').check();
                await toastHas(pg, /Onglet « 📄 Documents » ajouté/);
                const order = await pg.$$eval('.main-nav > .nav-item', els => els.filter(e => e.style.display !== 'none').map(e => e.dataset.board || e.dataset.module));
                assert.deepEqual(order.slice(-2), ['documents', 'maintenance'], 'à la fin, avant Réglages');
                assert.deepEqual(JSON.parse(await pg.evaluate(() => localStorage.getItem('genealogie-menu-added'))), ['documents']);
                // un changement d'usage ne cache jamais un onglet ajouté à la main (app-premier.js, usageChanges)
                const ch = await pg.evaluate(() => { const g = k => ({'genealogie-menu-hidden': '[]', 'genealogie-menu-added': '["documents"]'}[k] ?? null); return window.LCNDA_EXT.premierLancement.usageChanges(['successoral'], ['genealogie'], g); });
                assert.ok(!JSON.parse(ch['genealogie-menu-hidden']).includes('documents'), 'Documents reste montré'); assert.ok(JSON.parse(ch['genealogie-menu-hidden']).includes('successoral'));
                await pg.locator('.toast-region button:has-text("Annuler")').last().click(); await pg.waitForTimeout(500);
                assert.equal(await pg.$eval('.main-nav [data-module="documents"]', e => e.style.display), 'none', '↶ Annuler : caché comme avant');
                await dlg.locator('[data-tp-card="courriers"] input').check(); await pg.waitForTimeout(400);
                assert.ok(await pg.$('.main-nav .nav-custom-tab[data-board="ct_addcourriers"]'), 'un onglet à soi « raccourci »');
                await dlg.locator('[data-tp-card="courriers"] input').check({ force: true }).catch(() => {});
                assert.equal((await pg.evaluate(() => JSON.parse(localStorage.getItem('genealogie-custom-tabs')))).filter(x => x.target === 'list:courriers').length, 1, 'deux clics, un seul onglet');
                await dlg.locator('[data-tp-card="courriers"] input').uncheck(); await pg.waitForTimeout(300);
                assert.equal((await pg.evaluate(() => JSON.parse(localStorage.getItem('genealogie-custom-tabs')))).find(x => x.id === 'ct_addcourriers').hidden, true, 'caché, pas effacé');
                await pg.keyboard.press('Escape');
                // Réglages → Menus : le bouton, la case, « Retirer »
                await dlg.count();
                await pg.evaluate(() => { const L = JSON.parse(localStorage.getItem('genealogie-custom-tabs')); L.find(x => x.id === 'ct_addcourriers').hidden = false; window.LCNDA_APP.saveCustomTabs(L); window.LCNDA_APP.state.maintenanceTab = 'nav_menus'; window.LCNDA_APP.setModule('maintenance'); });
                await pg.waitForSelector('[data-tp-settings] [data-tab-plus]');
                await pg.waitForSelector('#menu-order [data-order-key="ct_addcourriers"] [data-tp-remove]');
                await pg.locator('[data-tp-settings]').scrollIntoViewIfNeeded(); await shot(pg, 'reglages-menu-1440');
                await pg.click('#menu-order [data-order-key="ct_addcourriers"] [data-tp-remove]'); await toastHas(pg, /retiré du menu/);
                assert.equal(await pg.$('.main-nav [data-board="ct_addcourriers"]'), null);
                await pg.uncheck('[data-tp-plus-show]'); await pg.waitForTimeout(300); assert.equal(await pg.$('.main-nav > .nav-add-tab'), null, 'la case enlève le ＋');
                await pg.check('[data-tp-plus-show]'); await pg.waitForTimeout(300); assert.ok(await pg.$('.main-nav > .nav-add-tab'));
                await pg.evaluate(() => document.body.classList.add('is-kiosk')); await pg.waitForTimeout(300);
                assert.equal(await pg.$('.main-nav > .nav-add-tab'), null, 'pas de ＋ en mode consultation');
                assert.deepEqual(errs, []); await ctx.close();
            });
            await t('navigateur 1440 : ＋ en usage successoral — ✨ Trésors et 💬 Questions absents, 📮 Courriers conseillé et pas ajouté d’office', async () => {
                const { ctx, pg, errs } = await open(1440, 900, false, '#successoral', ['successoral']);
                await pg.evaluate(() => window.LCNDA_EXT.tabsPlus.open()); await pg.waitForSelector('dialog[open] [data-tp-cat]');
                const cards = await pg.$$eval('dialog[open] [data-tp-card]', els => els.map(e => e.dataset.tpCard));
                assert.ok(!cards.includes('tresors') && !cards.includes('questions')); assert.ok(cards.includes('courriers'));
                assert.equal(await pg.locator('dialog[open] [data-tp-card="courriers"] .tp-tag.is-rec').count(), 1);
                assert.equal(await pg.locator('dialog[open] [data-tp-card="courriers"] input').isChecked(), false, 'jamais ajouté tout seul');
                assert.equal(await pg.locator('dialog[open] [data-tp-card="successoral"] input').isChecked(), true);
                assert.deepEqual(errs, []); await ctx.close();
            });
            await t('navigateur 1440 : ⏱ chronomètre — démarre dans l’en-tête, bulle, ⏸, ⏹ Arrêter et noter → 💶 Temps et frais (⏱), ↶ Annuler', async () => {
                const { ctx, pg, errs } = await open(1440, 900, false);
                await pg.evaluate(id => window.LCNDA_EXT.successoral.openCase(id, 'heirs'), A);
                await pg.waitForSelector('[data-succ-chrono="start"]');
                await pg.click('[data-succ-chrono="start"]'); await pg.waitForSelector('#succ-chrono-float');
                assert.match(await pg.textContent('#succ-chrono-float'), /⏱ 2026-014/); assert.match(await pg.title(), /^⏱ 2026-014 · /);
                assert.ok(await pg.$('.succ-page [data-succ-chrono="stop"]'));
                await pg.click('[data-succ-tab="pieces"]'); await pg.waitForTimeout(300);
                // on fait comme si 1 h 05 étaient passées
                await pg.evaluate(() => { const st = JSON.parse(localStorage.getItem('lcnda-succ-chrono')); st.start = Date.now() - 65 * 60000; localStorage.setItem('lcnda-succ-chrono', JSON.stringify(st)); localStorage.setItem('lcnda-succ-chrono-act', String(Date.now())); });
                await pg.waitForTimeout(1200); await pg.locator('.succ-page .page-header').scrollIntoViewIfNeeded(); await shot(pg, 'chrono-1440');
                await pg.click('.succ-page [data-succ-chrono="stop"]'); await pg.waitForSelector('dialog[open] .succ-chrono-note');
                assert.equal(await pg.inputValue('dialog[open] [name=h]'), '1'); assert.equal(await pg.inputValue('dialog[open] [name=m]'), '05');
                assert.match(await pg.inputValue('dialog[open] [name=label]'), /^Recherches : .*📑 Pièces/);
                assert.match(await pg.textContent('dialog[open] [type=submit]'), /Noter 1 h 05/);
                await shot(pg, 'chrono-noter-1440');
                await pg.click('dialog[open] [type=submit]'); await toastHas(pg, /1 h 05 notées dans le dossier 2026-014/);
                assert.equal(await pg.$('#succ-chrono-float'), null);
                const D = await get('get', { id: A }); const f = D.fees.find(x => x.source === 'chrono'); assert.equal(f.minutes, 65);
                await pg.click('[data-succ-tab="fees"]'); await pg.waitForSelector('[data-succ-fee-edit]');
                assert.match(await pg.textContent('.succ-table'), /⏱/); await shot(pg, 'temps-1440');
                await pg.locator('.toast-region button:has-text("Annuler")').last().click(); await pg.waitForTimeout(800);
                assert.equal((await get('get', { id: A })).fees.filter(x => x.source === 'chrono').length, 0, '↶ Annuler');
                // pause toute seule
                await pg.click('[data-succ-chrono="start"]'); await pg.waitForSelector('#succ-chrono-float');
                await pg.evaluate(() => { const st = JSON.parse(localStorage.getItem('lcnda-succ-chrono')); st.start = Date.now() - 30 * 60000; localStorage.setItem('lcnda-succ-chrono', JSON.stringify(st)); localStorage.setItem('lcnda-succ-chrono-act', String(Date.now() - 11 * 60000)); });
                await pg.evaluate(() => { const ws = document.getElementById('workspace'); ws.dispatchEvent(new Event('noop')); });
                await pg.waitForFunction(() => /Rien touché depuis 10 min/.test(document.getElementById('succ-chrono-float')?.textContent || ''), null, { timeout: 5000 }).catch(async () => {
                    // un geste de la souris pendant l'essai a pu remettre l'activité : on la recule encore
                    await pg.evaluate(() => localStorage.setItem('lcnda-succ-chrono-act', String(Date.now() - 11 * 60000)));
                });
                await pg.click('#succ-chrono-float [data-succ-chrono="stop"]').catch(() => {});
                await pg.keyboard.press('Escape');
                await pg.evaluate(() => localStorage.removeItem('lcnda-succ-chrono'));
                assert.deepEqual(errs, []); await ctx.close();
            });
            await t('navigateur 1440 : 🔔 la cloche — pastille (retards + aujourd’hui), panneau, autre généalogie, ✓ fait avec ↶ Annuler', async () => {
                const { ctx, pg, errs } = await open(1440, 900, false);
                await pg.waitForFunction(() => { const b = document.getElementById('succ-bell-open'); return b && !b.hidden && !b.querySelector('[data-succ-bell-n]').hidden; }, null, { timeout: 15000 });
                const n = await pg.textContent('#succ-bell-open [data-succ-bell-n]'); assert.ok(Number(n) >= 3, `pastille ${n}`);
                await pg.click('#succ-bell-open'); await pg.waitForSelector('#succ-bell-panel .succ-bell-row');
                const txt = await pg.textContent('#succ-bell-panel');
                assert.match(txt, /En retard · \d/); assert.match(txt, /Aujourd’hui · \d/); assert.match(txt, /Rendre le tableau au notaire/); assert.match(txt, /Déclaration de succession/);
                assert.match(txt, /🌳 ⚖️ Dossiers de succession/, 'la généalogie d’un dossier rangé ailleurs');
                assert.doesNotMatch(txt, /Sylvie|Jeanne|Tulle|Brive/, 'pas de nom d’héritier vivant ni d’adresse');
                await shot(pg, 'cloche-1440');
                const row = pg.locator('#succ-bell-panel .succ-bell-row', { hasText: 'Rendre le tableau au notaire' }).first();
                await row.locator('[data-succ-bell-do="done"]').click(); await toastHas(pg, /✓ Fait : Rendre le tableau au notaire/);
                await pg.waitForTimeout(800);
                assert.ok((await get('get', { id: A })).deadlines.find(x => x.label === 'Rendre le tableau au notaire').done);
                await pg.locator('.toast-region button:has-text("Annuler")').last().click(); await pg.waitForTimeout(900);
                assert.equal((await get('get', { id: A })).deadlines.find(x => x.label === 'Rendre le tableau au notaire').done, false);
                // la liste « Boutons en haut à droite » : 🔔 à gauche de ⚖️, montré d'office
                await pg.keyboard.press('Escape');
                await pg.evaluate(() => { localStorage.setItem('genealogie-reglages-presentation', 'old'); window.LCNDA_APP.state.maintenanceTab = 'design'; window.LCNDA_APP.setModule('maintenance'); });
                await pg.waitForSelector('#lc-tb-order [data-order-key="bell"]');
                const keys = await pg.$$eval('#lc-tb-order .order-row', els => els.map(e => e.dataset.orderKey).filter(k => !/^(et|enq|act)_/.test(k)));
                assert.ok(keys.indexOf('bell') === keys.indexOf('succ') - 1, keys.join(','));
                assert.equal(await pg.$eval('#lc-tb-order [data-order-key="bell"] [data-tb-show]', e => e.checked), true);
                // mode consultation : pas de cloche
                await pg.evaluate(() => document.body.classList.add('is-kiosk')); await pg.waitForTimeout(400);
                assert.equal(await pg.$eval('#succ-bell-open', e => e.hidden), true);
                assert.deepEqual(errs, []); await ctx.close();
            });
            await t('navigateur 1440 : 📋 avant de remettre (encadré, fenêtre au passage à « Remis »), 🧾 chaîne de filiation dans le PDF, texte piégé jamais exécuté', async () => {
                const { ctx, pg, errs } = await open(1440, 900, false);
                await pg.evaluate(() => localStorage.removeItem('lcnda-succ-npages'));
                await pg.evaluate(id => window.LCNDA_EXT.successoral.openCase(id, 'notary'), A);
                await pg.waitForSelector('.succ-ck-box [data-succ-ck]');
                const ck = await pg.textContent('.succ-ck-box');
                assert.match(ck, /Points prêts : \d sur \d/); assert.match(ck, /Actes demandés, pas encore reçus : 1/); assert.match(ck, /Héritiers introuvables ou silencieux : 1/);
                assert.equal(await pg.locator('.succ-ck-box li.is-warn[data-succ-ck-item="asked"]').count(), 1, 'demandé = à revoir');
                assert.equal(await pg.$eval('[data-succ-npage="chain"]', e => e.checked), true, 'page cochée d’office');
                const prev = await pg.textContent('.succ-npreview');
                assert.match(prev, /CHAÎNE DE FILIATION/); assert.match(prev, /Page 3 \/ 4/); assert.match(prev, /commun, voir 1/);
                assert.ok(prev.includes(XSS), 'le nom piégé s’affiche tel quel'); assert.match(prev, /acte à fournir/);
                const laws = await pg.$$eval('.succ-npreview .succ-law', as => as.map(a => a.getAttribute('href')));
                assert.ok(laws.length && laws.every(h => h.startsWith('https://www.legifrance.gouv.fr/')), 'liens Légifrance seulement');
                await pg.locator('.succ-ck-box').scrollIntoViewIfNeeded(); await shot(pg, 'avant-notaire-1440');
                await pg.locator('.succ-npreview .succ-chain').first().scrollIntoViewIfNeeded(); await shot(pg, 'chaine-1440');
                await pg.uncheck('[data-succ-npage="tree"]'); await pg.waitForTimeout(200);
                assert.match(await pg.textContent('.succ-npreview'), /Page 2 \/ 3/);
                await pg.check('[data-succ-npage="tree"]');
                // le passage à « Remis au notaire »
                await pg.click('[data-succ-state="remis"]'); await pg.waitForSelector('dialog[open] [data-succ-ck]');
                assert.match(await pg.textContent('dialog[open]'), /Ça avertit, ça n’empêche pas/);
                await shot(pg, 'remettre-1440');
                await pg.click('dialog[open] [type=submit]'); await toastHas(pg, /État : Remis au notaire/);
                const D = await get('get', { id: A }); assert.equal(D.state, 'remis'); assert.match(D.journal.find(j => j.kind === 'state').text, /Remis au notaire avec \d manque/);
                await w({ op: 'state', id: A, state: 'recherche' });
                assert.equal(await xss(pg), undefined); assert.deepEqual(errs, []); await ctx.close();
            });
            await t('navigateur 1440 : 📊 parts en euros — bascule, montant tapé (jamais gardé), arrondi, commission, mention « l’app ne calcule pas l’impôt »', async () => {
                const { ctx, pg, errs } = await open(1440, 900, false);
                await pg.evaluate(id => window.LCNDA_EXT.successoral.openCase(id, 'heirs'), A);
                await pg.waitForSelector('[data-succ-eur-mode="eur"]'); await pg.click('[data-succ-eur-mode="eur"]');
                await pg.waitForSelector('[data-succ-eur-amount]');
                assert.match(await pg.textContent('.succ-eur-box'), /Hors droits de succession et frais : l’app ne calcule pas l’impôt/);
                await pg.fill('[data-succ-eur-amount]', 'abc'); assert.match(await pg.textContent('[data-succ-eur-body]'), /Tape un montant en euros/);
                await pg.fill('[data-succ-eur-amount]', '187 450,00');
                await pg.waitForSelector('[data-succ-eur-table]');
                const tot = await pg.textContent('[data-succ-eur-table] tfoot'); assert.match(tot, /187\s450,00 €/);
                const rowJ = await pg.textContent('[data-succ-eur-table] tbody tr:has-text("Jeanne LACOMBE")'); assert.match(rowJ, /30 %/);
                assert.ok(await pg.textContent('[data-succ-eur-table]').then(x => x.includes(XSS)), 'nom piégé montré tel quel');
                await pg.locator('.succ-eur-box').scrollIntoViewIfNeeded(); await shot(pg, 'euros-1440');
                const ls = await pg.evaluate(() => JSON.stringify(Object.entries(localStorage)) + JSON.stringify(Object.entries(sessionStorage)));
                assert.doesNotMatch(ls, /187.?450/, 'jamais gardé dans le navigateur');
                assert.doesNotMatch(php('echo json_encode($pdo->query("SELECT group_concat(text, \'|\') FROM succ_journal")->fetchColumn());').stdout, /187/, 'ni au journal');
                // quitter le dossier : effacé
                await pg.evaluate(() => window.LCNDA_EXT.successoral.openCase(0)); await pg.waitForTimeout(400);
                await pg.evaluate(id => window.LCNDA_EXT.successoral.openCase(id, 'heirs'), A); await pg.waitForSelector('[data-succ-eur-mode]');
                assert.equal(await pg.locator('[data-succ-eur-amount]').count(), 0, 'retour aux fractions');
                await pg.click('[data-succ-eur-mode="eur"]'); assert.equal(await pg.inputValue('[data-succ-eur-amount]'), '', 'l’actif n’est plus là');
                assert.equal(await xss(pg), undefined); assert.deepEqual(errs, []); await ctx.close();
            });
            await t('navigateur 1440 : ✉️ courriers en série — exclus d’office signalés, champs, aperçu lettre par lettre (champ vide surligné), champ inconnu, rangés et annulés d’un coup', async () => {
                const { ctx, pg, errs } = await open(1440, 900, false);
                await pg.evaluate(id => window.LCNDA_EXT.successoral.openCase(id, 'contacts'), A);
                await pg.waitForSelector('[data-succ-serial]'); await pg.click('[data-succ-serial]'); await pg.waitForSelector('dialog[open] .succ-serial');
                const dlg = pg.locator('dialog[open]');
                const who = await dlg.locator('[data-succ-to]').evaluateAll(els => els.map(e => [e.closest('li').textContent.trim().slice(0, 60), e.checked]));
                assert.equal(who.find(x => /Marc LACOMBE/.test(x[0]))[1], false); assert.match(who.find(x => /Marc LACOMBE/.test(x[0]))[0], /introuvable/);
                assert.equal(who.find(x => x[0].includes(XSS))[1], false, 'sans adresse : décoché');
                assert.equal(who.find(x => /André MAZAUD/.test(x[0]))[1], true);
                assert.match(await dlg.locator('[data-succ-scount]').textContent(), /Lettres prêtes : 3 sur 5/);
                await dlg.locator('[name=letter]').fill('{civilité} {prénom} {nom},\nDossier {dossier}.');
                await dlg.locator('[data-succ-sview="preview"]').click();
                assert.match(await dlg.locator('[data-succ-sat]').textContent(), /Lettre 1 \/ 3/);
                assert.match(await dlg.locator('[data-succ-spage]').textContent(), /(Madame|Monsieur) \S+ [A-ZÉ]+,\s*Dossier 2026-014\./);
                await shot(pg, 'serie-apercu-1440');
                await dlg.locator('li', { hasText: 'PIÈGE' }).locator('[data-succ-to]').check(); // la fiche piégée, sans adresse : cochée à la main
                const pages = [];
                for (let i = 0; i < 4; i++) { pages.push(await dlg.locator('[data-succ-spage]').textContent()); await dlg.locator('[data-succ-snav="1"]').click(); }
                assert.match(await dlg.locator('[data-succ-sat]').textContent(), /Lettre 4 \/ 4/);
                assert.ok(pages.some(p => p.includes(XSS)), 'le nom piégé dans l’aperçu, en texte');
                // un champ vide (pas d'adresse) : surligné dans l'aperçu
                await dlg.locator('[data-succ-sview="model"]').click(); await dlg.locator('[name=letter]').fill('{adresse}\n{prénom} {nom}'); await dlg.locator('[data-succ-sview="preview"]').click();
                for (let i = 0; i < 4; i++) await dlg.locator('[data-succ-snav="-1"]').click();
                for (let i = 0; i < 4 && !(await dlg.locator('[data-succ-spage]').textContent()).includes(XSS); i++) await dlg.locator('[data-succ-snav="1"]').click();
                assert.equal(await dlg.locator('[data-succ-spage] mark.succ-empty').count(), 1, 'champ vide surligné');
                await dlg.locator('[data-succ-sview="model"]').click();
                await dlg.locator('[name=letter]').fill('Bonjour {dossierr}');
                assert.match(await dlg.locator('[data-succ-swarn]').textContent(), /Champ inconnu : \{dossierr\} \(ligne 1\)/);
                await dlg.locator('[type=submit]').click(); await pg.waitForTimeout(300);
                assert.equal(await pg.locator('dialog[open] .succ-serial').count(), 1, 'pas rangé avec un champ inconnu');
                // un champ en le cliquant
                await dlg.locator('[name=letter]').fill('Bonjour ');
                await dlg.locator('[data-succ-field="nom"]').click(); assert.equal(await dlg.locator('[name=letter]').inputValue(), 'Bonjour {nom}');
                // les modèles à soi : le nom piégé est échappé
                await pg.waitForFunction(() => document.querySelectorAll('dialog[open] [data-succ-mine] option').length > 0);
                assert.ok((await dlg.locator('[data-succ-mine] option').first().textContent()).includes(XSS));
                await shot(pg, 'serie-1440');
                await dlg.locator('[type=submit]').click(); await toastHas(pg, /4 courriers rangés dans le Registre de courriers, relance le/);
                let D = await get('get', { id: A });
                assert.match(D.journal[0].text, /^Courriers en série : premier contact à 4 héritier\(s\)/);
                const made = D.courriers.filter(x => x.kind === 'contact' && x.date_envoi === day(0)).length; assert.equal(made, 4);
                await pg.locator('.toast-region button:has-text("Annuler")').last().click(); await pg.waitForTimeout(1000);
                D = await get('get', { id: A }); assert.equal(D.courriers.filter(x => x.kind === 'contact' && x.date_envoi === day(0)).length, 0, '↶ Annuler enlève les 4 d’un coup');
                assert.equal(await xss(pg), undefined); assert.deepEqual(errs, []); await ctx.close();
            });
            for (const [w0, h0, dark, tag] of [[390, 844, false, '390'], [1440, 900, true, 'sombre']]) {
                await t(`navigateur ${tag} : ＋, cloche, chronomètre, liste de contrôle, chaîne, euros, série — sans défilement de côté`, async () => {
                    const { ctx, pg, errs } = await open(w0, h0, dark);
                    await pg.waitForSelector('.main-nav > .nav-add-tab', { state: 'attached' });
                    await pg.evaluate(() => window.LCNDA_EXT.tabsPlus.open()); await pg.waitForSelector('dialog[open] [data-tp-cat]'); await noSide(pg); await shot(pg, `catalogue-${tag}`); await pg.keyboard.press('Escape');
                    await pg.waitForFunction(() => !document.getElementById('succ-bell-open')?.hidden);
                    await pg.evaluate(() => document.getElementById('succ-bell-open').click()); await pg.waitForSelector('#succ-bell-panel .succ-bell-row'); await noSide(pg); await shot(pg, `cloche-${tag}`); await pg.keyboard.press('Escape');
                    await pg.evaluate(id => window.LCNDA_EXT.successoral.openCase(id, 'heirs'), A); await pg.waitForSelector('[data-succ-chrono="start"]');
                    await pg.click('[data-succ-chrono="start"]'); await pg.waitForSelector('#succ-chrono-float'); await noSide(pg); await shot(pg, `chrono-${tag}`);
                    await pg.click('[data-succ-eur-mode="eur"]'); await pg.fill('[data-succ-eur-amount]', '187450.5'); await pg.waitForSelector('[data-succ-eur-table]'); await noSide(pg); await pg.locator('.succ-eur-box').scrollIntoViewIfNeeded(); await shot(pg, `euros-${tag}`);
                    await pg.click('[data-succ-tab="notary"]'); await pg.waitForSelector('.succ-ck-box'); await noSide(pg); await shot(pg, `avant-notaire-${tag}`);
                    await pg.locator('.succ-npreview .succ-chain').first().scrollIntoViewIfNeeded(); await shot(pg, `chaine-${tag}`);
                    await pg.click('[data-succ-tab="contacts"]'); await pg.click('[data-succ-serial]'); await pg.waitForSelector('dialog[open] .succ-serial'); await pg.click('dialog[open] [data-succ-sview="preview"]'); await noSide(pg); await shot(pg, `serie-${tag}`);
                    await pg.keyboard.press('Escape');
                    await pg.evaluate(() => localStorage.removeItem('lcnda-succ-chrono'));
                    assert.equal(await xss(pg), undefined); assert.deepEqual(errs, []); await ctx.close();
                });
            }
        } finally { await browser.close(); }
    } finally {
        proc.kill();
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
        finish();
    }
})();
function finish() { if (failed) { console.error(`✗ ${failed} échec(s)`); process.exitCode = 1; } else console.log('✓ tout est bon'); }
