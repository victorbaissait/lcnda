#!/usr/bin/env node
/* 🌐 Ce qui reste à traduire dans une langue, zone par zone (mode d'emploi : docs/I18N.md, « Ajouter une langue »).
 *
 *   node scripts/i18n-todo.js cs cadre          les clés de assets/i18n/src/cadre.tsv sans traduction en tchèque,
 *                                               avec l'anglais et l'allemand en aide (clé ⇥ en ⇥ de)
 *   node scripts/i18n-todo.js sv,da listes      les clés qui manquent dans au moins une de ces langues
 *   node scripts/i18n-todo.js sk,nb cadre       pour le slovaque et le norvégien : en plus, le tchèque (aide pour sk) et le danois
 *                                               (aide pour nb), langues très proches (clé ⇥ en ⇥ de ⇥ cs ⇥ da)
 *   node scripts/i18n-todo.js ro cadre          pour le roumain : en plus, l'italien (langue romane proche) en aide
 *   node scripts/i18n-todo.js fi,hu cadre       pour le finnois et le hongrois : en plus, le suédois (aide pour fi) et l'allemand
 *                                               (déjà là, aide pour hu)
 *   node scripts/i18n-todo.js hr,sl cadre       pour le croate et le slovène : en plus, le tchèque (langue slave, aide pour les
 *                                               deux : une seule colonne)
 *   node scripts/i18n-todo.js lt,lv,et cadre    pour le lituanien, le letton et l'estonien : en plus, le polonais (aide pour lt et
 *                                               lv) et le finnois (aide pour et) : deux colonnes d'aide
 *   node scripts/i18n-todo.js cs all            le nombre de textes à traduire, zone par zone (les plus petites d'abord)
 *   options : --json (sortie JSON), --skeleton (lignes « clé ¦ ¦ ¦ » prêtes à remplir pour nord/<zone>.tsv),
 *             --limit N (les N premières seulement)
 *
 * Les traductions de cs, sv, da s'écrivent dans assets/i18n/src/nord/<zone>.tsv (1re ligne « fr ¦ cs ¦ sv ¦ da »), celles de
 * sk, nb dans assets/i18n/src/nord2/<zone>.tsv (1re ligne « fr ¦ sk ¦ nb »), celles de ro dans assets/i18n/src/nord3/<zone>.tsv
 * (1re ligne « fr ¦ ro »), celles de fi, hu dans assets/i18n/src/nord4/<zone>.tsv (1re ligne « fr ¦ fi ¦ hu »),
 * celles de hr, sl dans assets/i18n/src/nord5/<zone>.tsv (1re ligne « fr ¦ hr ¦ sl »),
 * celles de lt, lv, et dans assets/i18n/src/nord6/<zone>.tsv (1re ligne « fr ¦ lt ¦ lv ¦ et »), avec la même clé que dans <zone>.tsv :
 * « ctx|Texte » et « =mot » (pluriel) compris. Pluriels : cs et sk = 3 formes « 1 | 2 à 4 | 5 et plus » (osoba|osoby|osob),
 * sv, da, nb = 2 formes (person|personer), ro = 3 formes « 1 | 0 et 2 à 19 | 20 et plus » (persoană|persoane|de persoane),
 * fi = 2 formes (henkilö|henkilöä), hu = 2 formes souvent identiques (személy|személy : singulier après un nombre),
 * hr = 3 formes « 1, 21… | 2 à 4, 22 à 24… | 0, 5 à 20… » (osoba|osobe|osoba), sl = 4 formes « 1, 101… | 2, 102… | 3 et 4… | 0, 5 et plus »
 * (oseba|osebi|osebe|oseb), lt = 3 formes « 1, 21… | 2 à 9, 22 à 29… | 0, 10 à 20, 30… » (asmuo|asmenys|asmenų),
 * lv = 3 formes dans cet ordre « 0, 10 à 20, 30… | 1, 21… | le reste » (personu|persona|personas), et = 2 formes (isik|isikut). Puis :
 *   node scripts/i18n-build.js && node scripts/i18n-check.js      (0 erreur ; les textes encore manquants sont comptés)
 * Une clé présente dans plusieurs zones n'est à traduire qu'une fois (elle compte comme faite partout).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {readSources, dirOf, LANGS, NEW_LANGS, SRC} = require('./i18n-build.js');
const NEAR = {sk: 'cs', nb: 'da', ro: 'it', fi: 'sv', hu: 'de', hr: 'cs', sl: 'cs', lt: 'pl', lv: 'pl', et: 'fi'}; // une langue très proche (ou voisine), déjà traduite : en aide à côté de l'anglais et de l'allemand (hu : l'allemand, déjà là)

const near = list => [...new Set(list.map(c => NEAR[c]).filter(c => c && c !== 'en' && c !== 'de'))]; // l'anglais et l'allemand sont déjà là
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
        const it = {key: id, line: r.line, missing: miss, en: (m && m.vals.en) || r.vals.en || '', de: (m && m.vals.de) || r.vals.de || ''};
        near(list).forEach(c => { it[c] = (m && m.vals[c]) || ''; });
        items.push(it);
    }
    const where = dirOf(list[0]);
    return {codes: list, zone, items, total: seen.size, dir: where.dir, head: where.head, near: near(list)};
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
    const file = `assets/i18n/src/${r.dir}/${r.zone}.tsv`, cols = r.head.split(/\s*¦\s*|\t/).length - 1;
    if (flags.has('--skeleton')) {
        console.log(`# ${r.zone} : ${r.items.length} / ${r.total} textes à traduire — à remplir puis à ajouter dans ${file} (1re ligne : ${r.head})`);
        items.forEach(x => console.log(`${x.key}${' ¦ '.repeat(cols)}`.trimEnd() + ' '));
        process.exit(0);
    }
    console.log(`# ${r.zone} : ${r.items.length} / ${r.total} textes sans traduction en ${r.codes.join(', ')} — à écrire dans ${file} (1re ligne : ${r.head})`);
    console.log('# clé (français) ⇥ anglais (aide) ⇥ allemand (aide)' + r.near.map(c => ` ⇥ ${c} (aide, langue proche)`).join('') + (r.codes.length > 1 ? ' ⇥ langues qui manquent' : ''));
    items.forEach(x => console.log([x.key, x.en, x.de].concat(r.near.map(c => x[c]), r.codes.length > 1 ? [x.missing.join(',')] : []).join('\t')));
}
