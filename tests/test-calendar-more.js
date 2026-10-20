'use strict';
/**
 * 📅 Calendrier / mesures, cadres de plus (assets/js/heritage-calendar-more.js) :   node tests/test-calendar-more.js
 *  Pâques (2024, 1700 grégorien, 1500 julien), fêtes mobiles, jour de la semaine (14 juillet 1789 = mardi, julien avant 1582),
 *  lecture des dates, âge → naissance (exact et « environ »), âge exact, écart entre deux dates (même incomplètes),
 *  générations et ancêtres, heures canoniques, mesures anciennes, monnaies étrangères ;
 *  et « Fêtes religieuses → date exacte » (heritage-tools.js) : « le lundi après la Saint-Martin 1650 », « 3 jours avant Pâques 1702 ».
 * Sans navigateur : les fichiers sont chargés dans une machine virtuelle Node.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.resolve(__dirname, '..');
const sandbox = { window: {}, localStorage: { getItem: () => null, setItem: () => {} }, document: { addEventListener() {}, getElementById: () => null }, setTimeout: () => 0, setInterval: () => 0, clearInterval() {}, Intl, console };
vm.createContext(sandbox);
for (const f of ['heritage-calendar-more.js', 'heritage-tools.js']) vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8'), sandbox, { filename: f });
const C = sandbox.window.LCNDA_EXT.calendarMore, feastDate = sandbox.window.LCNDA_EXT.feastDate;
const plain = v => JSON.parse(JSON.stringify(v));
const ymd = o => `${o.y}-${String(o.m).padStart(2, '0')}-${String(o.d).padStart(2, '0')}`;

const checks = [];
const check = (name, fn) => checks.push([name, fn]);

check('Pâques : 31/03/2024, 11/04/1700 (grégorien), 19/04/1500 (julien)', () => {
    assert.equal(ymd(C.easter(2024)), '2024-03-31');
    assert.equal(ymd(C.easter(1700)), '1700-04-11');
    const e1500 = C.easter(1500);
    assert.equal(e1500.calendar, 'julian');
    assert.equal(ymd(e1500), '1500-04-19');
    assert.equal(ymd(C.easter(1789)), '1789-04-12');
    assert.equal(ymd(C.easter(1500, false)), '1500-04-01', 'comput grégorien forcé');
});
check('fêtes mobiles 2024 : Cendres 14/02, Ascension 09/05, Pentecôte 19/05, Fête-Dieu jeudi 30/05', () => {
    const f = Object.fromEntries(C.movableFeasts(2024).map(x => [x.name, x]));
    assert.equal(ymd(f['Mercredi des Cendres'].date), '2024-02-14');
    assert.equal(f['Mercredi des Cendres'].weekday, 'mercredi');
    assert.equal(ymd(f.Ascension.date), '2024-05-09');
    assert.equal(ymd(f['Pentecôte'].date), '2024-05-19');
    assert.equal(ymd(f['Fête-Dieu'].date), '2024-05-30');
    assert.equal(f['Fête-Dieu'].weekday, 'jeudi');
    assert.equal(ymd(f['Septuagésime'].date), '2024-01-28');
    assert.equal(f['Mardi gras'].weekday, 'mardi');
    assert.equal(f.Rogations.weekday, 'lundi');
    assert.equal(feastDate('lundi des Rogations 1789').iso, '1789-05-18');
});
check('jour de la semaine : 14/07/1789 = mardi, 01/01/2000 = samedi, 4 oct. 1582 julien = jeudi, 15 oct. 1582 = vendredi', () => {
    assert.equal(C.weekday(1789, 7, 14).weekday, 'mardi');
    assert.equal(C.weekday(2000, 1, 1).weekday, 'samedi');
    assert.equal(C.weekday(1582, 10, 4, 'rome').weekday, 'jeudi');
    assert.equal(C.weekday(1582, 10, 4, 'rome').calendar, 'julian');
    assert.equal(C.weekday(1582, 10, 15, 'rome').weekday, 'vendredi');
    assert.equal(C.weekday(1582, 10, 15, 'france').calendar, 'julian', 'en France, julien jusqu’au 9 décembre 1582');
    assert.equal(C.weekday(1582, 12, 20, 'france').calendar, 'gregorian');
    assert.equal(ymd(C.weekday(1500, 3, 1).other), '1500-03-11', 'écart de 10 jours après le 29 février 1500 julien');
});
check('lecture des dates : 12/03/1790, 1790-03-12, 1er mars 1790, mars 1790, 03/1790, 1790 ; 31/02 refusé', () => {
    for (const t of ['12/03/1790', '1790-03-12', '12 mars 1790', '12 Mars 1790']) assert.deepEqual(plain(C.parseDate(t)), { y: 1790, m: 3, d: 12 }, t);
    assert.deepEqual(plain(C.parseDate('1er août 1790')), { y: 1790, m: 8, d: 1 });
    assert.deepEqual(plain(C.parseDate('mars 1790')), { y: 1790, m: 3 });
    assert.deepEqual(plain(C.parseDate('03/1790')), { y: 1790, m: 3 });
    assert.deepEqual(plain(C.parseDate('vers 1790')), { y: 1790 });
    assert.equal(C.parseDate('31/02/1790'), null);
    assert.equal(C.parseDate('jui 1790'), null, 'juin ou juillet ?');
    assert.equal(C.parseDate('n’importe quoi'), null);
});
check('âge → naissance : 32 ans le 12/03/1790 → entre le 13/03/1757 et le 12/03/1758 ; « environ 40 ans » plus large', () => {
    const r = C.birthRange(32, '12/03/1790');
    assert.equal(ymd(r.from), '1757-03-13');
    assert.equal(ymd(r.to), '1758-03-12');
    const a = C.birthRange(40, '12/03/1790', 2);
    assert.equal(ymd(a.from), '1747-03-13');
    assert.equal(ymd(a.to), '1752-03-12');
    const y = C.birthRange(30, '1790');
    assert.equal(ymd(y.from), '1759-01-02');
    assert.equal(ymd(y.to), '1760-12-31');
    assert.equal(C.birthRange(30, 'demain'), null);
});
check('âge exact et écart entre deux dates (années, mois, jours, semaines ; dates incomplètes)', () => {
    const a = C.ageAt('13/03/1757', '12/03/1790');
    assert.deepEqual([a.years, a.months, a.days], [32, 11, 27]);
    const b = C.dateDiff('14/07/1789', '09/11/1799');
    assert.deepEqual([b.years, b.months, b.days, b.totalDays, b.weeks], [10, 3, 26, 3770, 538]);
    const c = C.dateDiff('31/01/1800', '01/03/1800');
    assert.deepEqual([c.years, c.months, c.days, c.totalDays], [0, 1, 1, 29]);
    const s = C.dateDiff('09/11/1799', '14/07/1789');
    assert.ok(s.swapped && s.totalDays === 3770);
    const p = C.dateDiff('1789', 'mars 1790');
    assert.equal(p.exact, false);
    assert.equal(p.min.totalDays, jd(1790, 3, 1) - jd(1789, 12, 31));
    assert.equal(p.max.totalDays, jd(1790, 3, 31) - jd(1789, 1, 1));
});
const jd = (y, m, d) => C.jdnG(y, m, d);
check('générations : 1980 → 1700 = 280 ans, 8 à 11 générations ; 8 générations en arrière depuis 1980 → 1716–1780', () => {
    const g = C.generationsBetween(1980, 1700);
    assert.equal(g.years, 280);
    assert.equal(Math.round(g.min), 8);
    assert.equal(Math.round(g.max), 11);
    assert.ok(Math.abs(g.male - 9.33) < 0.01 && Math.abs(g.female - 10.37) < 0.01);
    const b = C.generationsBack(8, 1980);
    assert.deepEqual([b.from, b.to, b.male, b.female], [1716, 1780, 1740, 1764]);
    assert.deepEqual(plain(C.ancestors(8)), { n: 8, at: 256, total: 510, sosaFrom: 256, sosaTo: 511 });
    assert.equal(C.ancestors(1).total, 2);
});
check('heures canoniques : vêpres vers 18 h à l’équinoxe, plus tôt en hiver, plus tard en été ; sexte à midi', () => {
    const r = C.canonicalFromText('à l’heure de vêpres');
    assert.equal(r.key, 'vepres');
    assert.equal(r.text, 'vers 18 h');
    assert.ok(C.canonicalTime('vepres', 12, 21) < 17 && C.canonicalTime('vepres', 6, 21) > 19.5);
    assert.equal(C.canonicalTime('sexte', 6), 12);
    assert.equal(C.canonicalFromText('après complies en décembre').month, 12);
    assert.equal(C.canonicalFromText('à midi sonné'), null);
    assert.equal(C.clock(17.76, 0.5), '18 h');
    assert.equal(C.clock(6.4, 0.5), '6 h 30');
});
check('mesures : 1 toise = 1,949 m ; 1 arpent de Paris = 34,19 a ; 1 setier = 12 boisseaux ; 1 journal de Bretagne = 80 cordes ; 1 ha en arpents des eaux et forêts', () => {
    const t = C.convertMeasure(1, 'paris', 'toise');
    assert.ok(Math.abs(t.base - 1.949036) < 1e-6);
    assert.equal(t.metric[1], 'm');
    assert.ok(Math.abs(t.others.find(o => o.label === 'pied du roi').value - 6) < 1e-3);
    const a = C.convertMeasure(1, 'paris', 'arpent');
    assert.equal(a.metric[1], 'a');
    assert.ok(Math.abs(a.metric[0] - 34.19) < 0.01);
    const s = C.convertMeasure(1, 'paris', 'setier');
    assert.ok(Math.abs(s.others.find(o => o.label === 'boisseau').value - 12) < 0.01);
    const j = C.convertMeasure(3, 'bretagne', 'journal');
    assert.ok(Math.abs(j.others.find(o => o.label === 'corde carrée').value - 240) < 0.1);
    assert.equal(j.metric[1], 'ha');
    const h = C.convertMeasure(1, 'paris', 'metric_surf_ha');
    assert.ok(Math.abs(h.others.find(o => /eaux et forêts \(/.test(o.label)).value - 1.958) < 0.001);
    assert.ok(C.convertMeasure(1, 'lyon', 'bichet').approx, 'valeur régionale marquée ≈');
    assert.equal(C.convertMeasure(1, 'paris', 'inconnue'), null);
    for (const r of C.REGIONS) for (const u of r.units) assert.ok(u[3] > 0 && ['long', 'surf', 'grain', 'liq'].includes(u[2]), `${r.id}.${u[0]}`);
});
check('monnaies : louis d’or 24 livres au XVIIIe, 2 piastres ≈ 10 l 10 s, livres/sols/deniers', () => {
    assert.equal(C.coinValue('louis', '18').text, '24 livres');
    assert.equal(C.coinValue('piastre', '18', 2).text, '10 livres 10 sols');
    assert.equal(C.coinValue('lorraine', '17'), null);
    assert.equal(C.lsd(1.2625), '1 livre 5 sols 3 deniers');
});
check('fêtes relatives : lundi après la Saint-Martin 1650, 3 jours avant Pâques 1702, 2e dimanche après Pâques 1789, veille et lendemain', () => {
    const m = feastDate('le lundi après la Saint-Martin 1650');
    assert.equal(m.iso, '1650-11-14');
    assert.equal(m.weekday, 'lundi');
    assert.equal(m.label, 'lundi après la Saint-Martin');
    const p = feastDate('3 jours avant Pâques 1702');
    assert.equal(p.iso, '1702-04-13');
    assert.equal(feastDate('trois jours avant Pâques 1702').iso, '1702-04-13');
    assert.equal(feastDate('le second dimanche après Pâques 1789').iso, '1789-04-26');
    assert.equal(feastDate('le dimanche avant la Toussaint 1700').iso, '1700-10-31');
    assert.equal(feastDate('le lendemain de la Saint-Martin 1702').iso, '1702-11-12');
    assert.equal(feastDate('le lendemain de la Saint-Martin 1702').label, 'lendemain de la Saint-Martin');
    assert.equal(feastDate('lundi de Pâques 1690').iso, C.easter(1690).y + '-' + String(C.easter(1690).m).padStart(2, '0') + '-' + String(C.easter(1690).d + 1).padStart(2, '0'));
    assert.equal(feastDate('huit jours après la Toussaint 1750').iso, '1750-11-09');
});

let failed = 0;
for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
console.log(failed ? `${failed} échec(s)` : `${checks.length} vérifications réussies`);
process.exitCode = failed ? 1 : 0;
