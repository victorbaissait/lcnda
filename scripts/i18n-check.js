#!/usr/bin/env node
/* 🌐 Vérifie les fichiers de langue (mode d'emploi : docs/I18N.md).
 *
 *   node scripts/i18n-check.js            résumé + problèmes (code de sortie 1 s'il y a une erreur)
 *   node scripts/i18n-check.js --verbose  aussi les avertissements (longueur suspecte, traduction = français)
 *
 * Erreurs : clé manquante dans une langue, variables {x} différentes du français, pluriel sans toutes ses formes,
 *           texte vide, symbole de tête perdu (« ＋ », « ↶ », « ⤒ »…), fichier .json pas à jour avec les sources.
 * Avertissements : traduction 2,5 × plus longue que le français (risque de débordement, surtout en allemand),
 *           traduction identique au français (souvent un oubli, parfois normal : « Sosa », « GEDCOM »).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {readSources, LANGS} = require('./i18n-build.js');

const ROOT = path.join(__dirname, '..');
const vars = s => [...String(s).matchAll(/\{([a-z_][a-z0-9_]*)\}/gi)].map(m => m[1]).sort().join(',');
const LEADSYM = /^[＋↶↷⤒⤓✓⚠️⛔ℹ️🔍↗×✎🗑💾🖨⧉⋯⭐📁🔗↺⛶📤📋⚙️]/u;
const FORMS = {pl: ['one', 'few', 'many'], def: ['one', 'other']};

function check({verbose = false} = {}) {
    const rows = readSources();
    const errors = [], warns = [];
    const keys = new Map();
    rows.forEach(r => keys.set((r.plural ? '=' : '') + r.key, r));
    for (const r of keys.values()) {
        const where = `${r.file}:${r.line}`;
        const fr = r.key.replace(/^[a-z0-9-]+\|/, '');
        for (const c of LANGS) {
            const v = r.vals[c];
            if (!v) { errors.push(`${where} [${c}] manque : « ${r.key} »`); continue; }
            if (r.plural) {
                const n = v.split('|').length, need = (FORMS[c] || FORMS.def).length;
                if (n < need) errors.push(`${where} [${c}] pluriel incomplet (${n}/${need} formes) : « ${r.key} » → « ${v} »`);
                continue;
            }
            if (vars(fr) !== vars(v)) errors.push(`${where} [${c}] variables différentes {${vars(fr)}} ≠ {${vars(v)}} : « ${r.key} » → « ${v} »`);
            const lf = fr.match(LEADSYM), lv = v.match(LEADSYM);
            if (lf && (!lv || lf[0] !== lv[0])) errors.push(`${where} [${c}] symbole de tête perdu « ${lf[0]} » : « ${v} »`);
            if (fr.length >= 8 && v.length > fr.length * 2.5) warns.push(`${where} [${c}] longueur suspecte (${fr.length} → ${v.length}) : « ${v} »`);
            if (v === fr && fr.length > 3 && /\p{L}{4}/u.test(fr)) warns.push(`${where} [${c}] identique au français : « ${v} »`);
        }
    }
    // les .json doivent être à jour
    for (const c of LANGS) {
        let j = null; try { j = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/i18n', `${c}.json`), 'utf8')); } catch (e) { errors.push(`assets/i18n/${c}.json illisible : ${e.message}`); continue; }
        const missing = [...keys.values()].filter(r => r.vals[c] && j[r.key] == null).length;
        if (missing) errors.push(`assets/i18n/${c}.json pas à jour (${missing} textes absents) : lance node scripts/i18n-build.js`);
    }
    const out = {keys: keys.size, langs: LANGS.length, errors, warns};
    return out;
}
module.exports = {check};
if (require.main === module) {
    const verbose = process.argv.includes('--verbose');
    const r = check({verbose});
    r.errors.forEach(e => console.log('⛔', e));
    if (verbose) r.warns.forEach(w => console.log('⚠️', w));
    console.log(`${r.errors.length ? '⛔' : '✓'} ${r.keys} textes × ${r.langs} langues · ${r.errors.length} erreur(s) · ${r.warns.length} avertissement(s)${verbose ? '' : ' (--verbose pour les voir)'}`);
    process.exitCode = r.errors.length ? 1 : 0;
}
