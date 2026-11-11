#!/usr/bin/env node
/* 🌐 Ce qui reste à traduire dans une langue, zone par zone (mode d'emploi : docs/I18N.md, « Ajouter une langue »).
 *
 *   node scripts/i18n-todo.js cs cadre          les clés de assets/i18n/src/cadre.tsv sans traduction en tchèque,
 *                                               avec l'anglais et l'allemand en aide (clé ⇥ en ⇥ de)
 *   node scripts/i18n-todo.js sv,da listes      les clés qui manquent dans au moins une de ces langues
 *   node scripts/i18n-todo.js cs all            le nombre de textes à traduire, zone par zone (les plus petites d'abord)
 *   options : --json (sortie JSON), --skeleton (lignes « clé ¦ ¦ ¦ » prêtes à remplir pour nord/<zone>.tsv),
 *             --limit N (les N premières seulement)
 *
 * Les traductions de cs, sv, da s'écrivent dans assets/i18n/src/nord/<zone>.tsv (1re ligne « fr ¦ cs ¦ sv ¦ da »),
 * avec la même clé que dans <zone>.tsv : « ctx|Texte » et « =mot » (pluriel) compris. Pluriels : cs = 3 formes
 * « 1 | 2 à 4 | 5 et plus » (osoba|osoby|osob), sv et da = 2 formes (person|personer). Puis :
 *   node scripts/i18n-build.js && node scripts/i18n-check.js      (0 erreur ; les textes encore manquants sont comptés)
 * Une clé présente dans plusieurs zones n'est à traduire qu'une fois (elle compte comme faite partout).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {readSources, LANGS, NEW_LANGS, SRC} = require('./i18n-build.js');

function todo(codes, zone) {
    const list = String(codes || '').split(',').map(s => s.trim()).filter(Boolean);
    const bad = list.filter(c => !LANGS.includes(c));
    if (!list.length || bad.length) throw new Error(`langue inconnue : ${bad.join(', ') || '(aucune)'} — une de ${LANGS.join(', ')}`);
    const rows = readSources();
    const byId = new Map(rows.map(r => [(r.plural ? '=' : '') + r.key, r])); // la ligne fusionnée (nord/ compris)
    const zones = [...new Set(rows.map(r => r.file.replace(/\.tsv$/, '')))].sort();
    const missingIn = r => { const m = byId.get((r.plural ? '=' : '') + r.key); return list.filter(c => !(m && m.vals[c])); };
    if (zone === 'all') {
        const counts = zones.map(z => {
            const seen = new Set(); let n = 0, total = 0;
            rows.filter(r => r.file === `${z}.tsv`).forEach(r => { const id = (r.plural ? '=' : '') + r.key; if (seen.has(id)) return; seen.add(id); total++; if (missingIn(r).length) n++; });
            return {zone: z, missing: n, total};
        });
        return {codes: list, zones: counts.sort((a, b) => a.missing - b.missing || a.zone.localeCompare(b.zone))};
    }
    if (!zones.includes(zone)) throw new Error(`zone inconnue : « ${zone} » — une de ${zones.join(', ')} (ou « all »)`);
    const seen = new Set(), items = [];
    for (const r of rows.filter(x => x.file === `${zone}.tsv`)) {
        const id = (r.plural ? '=' : '') + r.key;
        if (seen.has(id)) continue; seen.add(id);
        const miss = missingIn(r); if (!miss.length) continue;
        const m = byId.get(id);
        items.push({key: id, line: r.line, missing: miss, en: (m && m.vals.en) || r.vals.en || '', de: (m && m.vals.de) || r.vals.de || ''});
    }
    return {codes: list, zone, items, total: seen.size};
}
module.exports = {todo};

if (require.main === module) {
    const argv = process.argv.slice(2);
    const flags = new Set(argv.filter(a => a.startsWith('--')));
    const li = argv.indexOf('--limit'), limit = li >= 0 ? Number(argv[li + 1]) || 0 : 0;
    const pos = argv.filter((a, i) => !a.startsWith('--') && !(li >= 0 && i === li + 1));
    if (pos.length < 2) {
        console.log(`usage : node scripts/i18n-todo.js <langue> <zone|all> [--skeleton] [--json] [--limit N]\n  langues : ${LANGS.join(', ')} (en cours : ${NEW_LANGS.join(', ')})\n  zones : ${fs.readdirSync(SRC).filter(f => f.endsWith('.tsv')).map(f => f.replace(/\.tsv$/, '')).join(', ')}`);
        process.exit(1);
    }
    let r;
    try { r = todo(pos[0], pos[1]); } catch (e) { console.error('⛔', e.message); process.exit(1); }
    if (flags.has('--json')) { console.log(JSON.stringify(r, null, 1)); process.exit(0); }
    if (r.zones) {
        const all = r.zones.reduce((s, z) => s + z.missing, 0);
        console.log(`# ${r.codes.join(', ')} : ${all} textes encore sans traduction (clés d'une zone, une fois chacune ; les plus petites zones d'abord)`);
        r.zones.forEach(z => console.log(`${String(z.missing).padStart(6)} / ${String(z.total).padStart(5)}  ${z.zone}${z.missing ? '' : '  ✓'}`));
        process.exit(0);
    }
    const items = limit ? r.items.slice(0, limit) : r.items;
    const file = `assets/i18n/src/nord/${r.zone}.tsv`;
    if (flags.has('--skeleton')) {
        console.log(`# ${r.zone} : ${r.items.length} / ${r.total} textes à traduire — à remplir puis à ajouter dans ${file} (1re ligne : fr ¦ cs ¦ sv ¦ da)`);
        items.forEach(x => console.log(`${x.key} ¦  ¦  ¦ `));
        process.exit(0);
    }
    console.log(`# ${r.zone} : ${r.items.length} / ${r.total} textes sans traduction en ${r.codes.join(', ')} — à écrire dans ${file}`);
    console.log('# clé (français) ⇥ anglais (aide) ⇥ allemand (aide)' + (r.codes.length > 1 ? ' ⇥ langues qui manquent' : ''));
    items.forEach(x => console.log([x.key, x.en, x.de].concat(r.codes.length > 1 ? [x.missing.join(',')] : []).join('\t')));
}
