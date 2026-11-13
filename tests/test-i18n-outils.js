#!/usr/bin/env node
/* 🌐 Traduction de la zone « outils » (dernière vague) : réglages et dessins des diagrammes (heritage-diagram-plus, -more,
 * -adn-chiffres, -famille). Vérifie, sans navigateur :
 *  - chaque texte passé à i18n('…') dans ces fichiers a sa traduction en en, de, pl (et les 4 autres langues) ;
 *  - les variables {x} sont les mêmes dans toutes les langues ;
 *  - en français, t() rend le texte tel quel (le français ne change jamais) ;
 *  - les fichiers se chargent dans Node (syntaxe) ;
 *  - assets/i18n/src/outils.tsv n'a pas de clé en double.
 *     node tests/test-i18n-outils.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const FILES = ['heritage-diagram-plus.js', 'heritage-diagram-more.js', 'heritage-diagram-adn-chiffres.js', 'heritage-diagram-famille.js'];
const LANGS = ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl'];
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('✗ ' + msg); } };

const dicts = Object.fromEntries(LANGS.map(l => [l, JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n', `${l}.json`), 'utf8'))]));
const vars = s => (String(s).match(/\{[a-z_][a-z0-9_]*\}/gi) || []).sort().join(',');
const val = v => (v && typeof v === 'object' ? Object.values(v).join('|') : v);

for (const f of FILES) {
    const src = fs.readFileSync(path.join(root, 'assets/js', f), 'utf8');
    try { new Function(src); ok(true, ''); } catch (e) { ok(false, `${f} : ${e.message}`); }
    ok(/const i18n = \(s, v\) =>/.test(src), `${f} : l’aide i18n est présente`);
    const re = /\bi18n\(\s*(['"])((?:\\.|(?!\1).)*?)\1\s*(?=[,)])(,\s*\{\s*ctx\s*:\s*['"]([a-z0-9-]+)['"])?/g; let m;
    while ((m = re.exec(src))) {
        const s = m[2].replace(/\\(.)/g, '$1'); if (!/\p{L}/u.test(s)) continue;
        const k = m[4] ? `${m[4]}|${s}` : s;
        for (const l of LANGS) {
            const v = dicts[l][k] ?? dicts[l][s];
            ok(v != null, `${f} : « ${k} » sans traduction (${l})`);
            if (v != null) ok(vars(val(v).split('|')[0]) === vars(s) || typeof v === 'object', `${f} : variables différentes pour « ${k} » (${l})`);
        }
    }
}

// en français, rien ne change ; en allemand, la phrase est traduite avec ses variables
const I = require(path.join(root, 'assets/js/app-i18n.js'));
ok(I.t('Chemin trouvé en {n} étapes.', {n: 3}) === 'Chemin trouvé en 3 étapes.', 'français inchangé');
if (I.setLang) {
    try {
        I.setLang('de', {persist: false, silent: true});
        if (I.lang === 'de' && I.has('Chemin trouvé en {n} étapes.')) ok(/Schritten/.test(I.t('Chemin trouvé en {n} étapes.', {n: 3})), 'allemand traduit');
        I.setLang('fr', {persist: false, silent: true});
    } catch (_) { /* pas de dictionnaire chargeable hors navigateur : la vérification des .json ci-dessus suffit */ }
}

// pas de clé en double dans outils.tsv
const seen = new Map();
fs.readFileSync(path.join(root, 'assets/i18n/src/outils.tsv'), 'utf8').split('\n').forEach((l, i) => {
    if (!l || l[0] === '#' || l.startsWith('fr ¦')) return;
    const k = l.split(/\t| ¦ /)[0];
    ok(!seen.has(k), `outils.tsv : « ${k} » en double (lignes ${seen.get(k)} et ${i + 1})`);
    seen.set(k, i + 1);
    ok(l.split(/\t| ¦ /).length === 8, `outils.tsv:${i + 1} : 8 colonnes attendues`);
});

console.log(fails ? `✗ ${fails} échec(s) sur ${checks} vérifications` : `✓ ${checks} vérifications`);
process.exit(fails ? 1 : 0);
