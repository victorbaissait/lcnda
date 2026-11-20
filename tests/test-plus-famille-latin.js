'use strict';
/**
 * 🌐 Traduire un acte latin, niveau 1 (assets/js/plus-famille-latin.js, sans navigateur) :   node tests/test-plus-famille-latin.js
 * nombres en lettres → chiffres, jour et mois, formules des registres, dictionnaire de l'Aide à la lecture (aide-langues/la.js),
 * prénoms latins → français, rôles (baptisé, père, mère, parrain, marraine), comparaison avec une traduction complète,
 * reconnaissance d'un texte latin. Acte modèle fictif (MAZAUD, LACOMBE, Malvialle).
 */
const assert = require('node:assert/strict');
const L = require('../assets/js/plus-famille-latin.js');

let failed = 0;
const t = (name, fn) => { try { fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const ACTE = 'Anno Domini millesimo septingentesimo quinquagesimo secundo, die decima quarta mensis martii, baptizatus est Joannes, filius legitimus Petri MAZAUD et Mariae LACOMBE conjugum hujus parochiae de Malvialle, natus hesterna die. Patrinus fuit Joannes LACOMBE, matrina Antonia BESSE, qui signare nescierunt.';

t('nombres écrits en lettres', () => {
    assert.equal(L.numberWord('millesimo'), 1000); assert.equal(L.numberWord('septingentesimo'), 700); assert.equal(L.numberWord('quinquagesimo'), 50);
    assert.equal(L.numberWord('secundo'), 2); assert.equal(L.numberWord('decima'), 10); assert.equal(L.numberWord('quarta'), 4); assert.equal(L.numberWord('nonaginta'), 90);
    assert.equal(L.numberWord('nomine'), 0, 'un mot qui commence comme « non » n’est pas un nombre'); assert.equal(L.numberWord('sexus'), 0);
    assert.equal(L.monthOf('martii'), 'mars'); assert.equal(L.monthOf('9bris'), 'novembre'); assert.equal(L.monthOf('Decembris'), 'décembre');
});
t('le mot à mot de l’acte modèle : formules, nombres, dictionnaire, noms', () => {
    const r = L.wordByWord(ACTE), by = src => r.segments.find(s => s.src === src);
    assert.equal(by('Anno Domini').tr, 'l’an du Seigneur'); assert.equal(by('Anno Domini').kind, 'formule');
    assert.equal(by('millesimo septingentesimo quinquagesimo secundo').tr, '1752');
    assert.equal(by('die decima quarta').tr, 'le 14ᵉ jour');
    assert.equal(by('mensis martii').tr, 'du mois de mars');
    assert.equal(by('baptizatus est').tr, 'a été baptisé');
    assert.equal(by('filius legitimus').tr, 'fils légitime');
    assert.equal(by('hujus parochiae').tr, 'de cette paroisse');
    assert.equal(by('natus hesterna die').sure, false, 'né hier : peu sûr (pointillé)');
    assert.equal(by('Patrinus fuit').tr, 'le parrain fut'); assert.equal(by('qui signare nescierunt').tr, 'qui n’ont su signer');
    assert.equal(by('Petri MAZAUD').tr, 'Pierre MAZAUD'); assert.equal(by('Antonia BESSE').tr, 'Antoinette BESSE');
    assert.ok(r.segments.every(s => ACTE.slice(s.s, s.e) === s.src), 'chaque morceau garde sa place dans le texte (surlignage lié)');
});
t('ce que l’app a trouvé : date et rôles', () => {
    const f = L.wordByWord(ACTE).found;
    assert.equal(f.date, '14 mars 1752');
    const role = r => f.names.filter(n => n.role === r).map(n => n.fr);
    assert.deepEqual(role('sujet'), ['Jean']); assert.deepEqual(role('père'), ['Pierre MAZAUD']); assert.deepEqual(role('mère'), ['Marie LACOMBE']);
    assert.deepEqual(role('parrain'), ['Jean LACOMBE']); assert.deepEqual(role('marraine'), ['Antoinette BESSE']);
});
t('le dictionnaire de l’Aide à la lecture sert au mot à mot', () => {
    const r = L.wordByWord('obiit Anna vidua quondam Petri, sepulta est in coemeterio');
    const tr = r.segments.map(s => `${s.src}=${s.tr}`).join(' | ');
    assert.match(tr, /obiit=est mort/); assert.match(tr, /in coemeterio=au cimetière/); assert.match(tr, /vidua=/);
});
t('les deux lectures : d’accord, ou les différences', () => {
    const r = L.wordByWord(ACTE);
    const ok = 'L’an du Seigneur mil sept cent cinquante-deux, le quatorzième jour du mois de mars, a été baptisé Jean, fils légitime de Pierre MAZAUD et de Marie LACOMBE, époux de cette paroisse de Malvialle, né la veille. Le parrain fut Jean LACOMBE, la marraine Antoinette BESSE, qui n’ont su signer.';
    assert.deepEqual(L.agree(r, ok), {ok: true, diffs: []});
    const bad = L.agree(r, 'En 1753, Jean fils de Pierre MAZAUD fut baptisé ; parrain Jean LACOMBE.');
    assert.equal(bad.ok, false); assert.ok(bad.diffs.some(d => /1752/.test(d))); assert.ok(bad.diffs.includes('marraine'));
    assert.equal(L.frenchYear(1752), 'mil sept cent cinquante-deux'); assert.equal(L.frenchYear(1680), 'mil six cent quatre-vingts'); assert.equal(L.frenchYear(1871), 'mil huit cent soixante-et-onze');
});
t('un texte latin est reconnu (le bouton « 🌐 Traduire » apparaît), pas un texte français', () => {
    assert.equal(L.looksLatin(ACTE), true);
    assert.equal(L.looksLatin('Le dix mars mil huit cent, est né Jean, fils de Pierre et de Marie, de cette commune.'), false);
});

if (failed) { console.error(`\n${failed} échec(s)`); process.exit(1); }
console.log('\nTout est bon.');
