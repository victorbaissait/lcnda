#!/usr/bin/env node
/* 🌐 Vérifie les fichiers de langue (mode d'emploi : docs/I18N.md).
 *
 *   node scripts/i18n-check.js            résumé + problèmes (code de sortie 1 s'il y a une erreur)
 *   node scripts/i18n-check.js --verbose  aussi les avertissements (longueur suspecte, traduction = français)
 *   node scripts/i18n-check.js --strict-new   pour les langues ajoutées ensuite (cs, sv, da, sk, nb, ro) aussi : une clé absente devient une erreur (quand leur traduction sera finie)
 *   node scripts/i18n-check.js --lang cs   le détail d'une langue seulement (avec --verbose : chaque texte manquant)
 *
 * Erreurs : clé manquante dans une des 7 premières langues (en, es, de, it, pt, pl, nl), variables {x} différentes du français, pluriel sans toutes ses formes,
 *           texte vide, symbole de tête perdu (« ＋ », « ↶ », « ⤒ »…), fichier .json pas à jour avec les sources.
 * Avertissements : traduction 2,5 × plus longue que le français (risque de débordement, surtout en allemand),
 *           traduction identique au français (souvent un oubli, parfois normal : « Sosa », « GEDCOM »),
 *           cs / sv / da / sk / nb / ro : textes encore sans traduction (comptés : « cs : N textes encore sans traduction » ; repli sur le
 *           français), lignes des sous-dossiers de assets/i18n/src/ (nord/, nord2/, nord3/) dont la clé n'existe plus en français.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {readSources, LANGS, CORE, NEW_LANGS, FORMS} = require('./i18n-build.js');

const ROOT = path.join(__dirname, '..');
const vars = s => [...String(s).matchAll(/\{([a-z_][a-z0-9_]*)\}/gi)].map(m => m[1]).sort().join(',');
const LEADSYM = /^[＋↶↷⤒⤓✓⚠️⛔ℹ️🔍↗×✎🗑💾🖨⧉⋯⭐📁🔗↺⛶📤📋⚙️]/u;

/** src : un autre dossier de sources (pour les tests ; les .json ne sont alors pas comparés) */
function check({verbose = false, strictNew = false, only = '', src = ''} = {}) {
    const {rows, orphans, dups} = readSources(src ? {withOrphans: true, src} : {withOrphans: true});
    const errors = [], warns = [];
    const missingNew = Object.fromEntries(NEW_LANGS.map(c => [c, []])); // cs, sv, da, sk, nb, ro : textes encore sans traduction
    const keys = new Map();
    rows.forEach(r => keys.set((r.plural ? '=' : '') + r.key, r));
    const langs = only ? LANGS.filter(c => c === only) : LANGS;
    for (const r of keys.values()) {
        const fr = r.key.replace(/^[a-z0-9-]+\|/, '');
        for (const c of langs) {
            const where = (r.nord && r.nord[c]) || `${r.file}:${r.line}`;
            const v = r.vals[c];
            if (!v) {
                if (NEW_LANGS.includes(c) && !strictNew) missingNew[c].push(`${r.file}:${r.line} « ${r.plural ? '=' : ''}${r.key} »`);
                else errors.push(`${where} [${c}] manque : « ${r.key} »`);
                continue;
            }
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
    orphans.forEach(n => warns.push(`${n.file}:${n.line} « ${n.plural ? '=' : ''}${n.key} » n'existe dans aucun fichier français de assets/i18n/src/ (clé changée ?)`));
    dups.forEach(d => warns.push(`en double dans les sous-dossiers de src/ : ${d}`));
    for (const c of NEW_LANGS) if (missingNew[c].length) warns.push(`${c} : ${missingNew[c].length} textes encore sans traduction (node scripts/i18n-todo.js ${c} <zone>)`);
    // les .json doivent être à jour
    for (const c of (src ? [] : langs)) {
        let j = null; try { j = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/i18n', `${c}.json`), 'utf8')); } catch (e) { errors.push(`assets/i18n/${c}.json illisible : ${e.message}`); continue; }
        const missing = [...keys.values()].filter(r => r.vals[c] && j[r.key] == null).length;
        if (missing) errors.push(`assets/i18n/${c}.json pas à jour (${missing} textes absents) : lance node scripts/i18n-build.js`);
    }
    const out = {keys: keys.size, langs: langs.length, errors, warns, missingNew, orphans: orphans.length};
    return out;
}
module.exports = {check};
if (require.main === module) {
    const argv = process.argv.slice(2), verbose = argv.includes('--verbose'), li = argv.indexOf('--lang');
    const only = li >= 0 ? argv[li + 1] : '';
    const strictNew = argv.includes('--strict-new');
    const r = check({verbose, strictNew, only});
    r.errors.forEach(e => console.log('⛔', e));
    if (verbose) r.warns.forEach(w => console.log('⚠️', w));
    if (verbose && only && r.missingNew[only]) r.missingNew[only].forEach(m => console.log(`   ${only} sans traduction : ${m}`));
    // l'avancement des langues en cours, toujours montré
    if (!strictNew) for (const c of NEW_LANGS) if (!only || only === c) { const n = r.missingNew[c].length; console.log(n ? `⚠️ ${c} : ${n} textes encore sans traduction (repli sur le français)` : `✓ ${c} : tout est traduit`); }
    console.log(`${r.errors.length ? '⛔' : '✓'} ${r.keys} textes × ${r.langs} langues · ${r.errors.length} erreur(s) · ${r.warns.length} avertissement(s)${verbose ? '' : ' (--verbose pour les voir)'}`);
    process.exitCode = r.errors.length ? 1 : 0;
}
