#!/usr/bin/env node
/* 🌐 Fabrique les fichiers de langue assets/i18n/<code>.json depuis assets/i18n/src/*.tsv (mode d'emploi : docs/I18N.md).
 *
 *   node scripts/i18n-build.js
 *
 * Format d'un fichier .tsv (une zone de l'app par fichier : cadre.tsv, reglages.tsv…) :
 *   - 1re ligne : fr  en  es  de  it  pt  pl  nl   (séparées par une tabulation, ou par « ¦ » entouré d'espaces)
 *   - une ligne par texte : le français exact (la clé), puis les traductions ;
 *   - « ctx|Texte » dans la colonne fr : un même mot traduit autrement selon l'endroit (t('Texte', {ctx: 'ctx'})) ;
 *   - « =mot » dans la colonne fr : un pluriel pour plural(n, 'mot') ; chaque traduction donne ses formes séparées
 *     par « | » : one|other (en, es, de, it, pt, nl, sv, da, nb), one|few|many (pl, cs, sk : 1 | 2 à 4 | 5 et plus),
 *     one|few|other (ro : 1 | 0 et 2 à 19 | 20 et plus, « 20 de persoane ») ;
 *   - ligne vide ou commençant par « # » : ignorée. Variables {n}, {x} : les mêmes dans toutes les langues.
 * Les langues ajoutées ensuite ont leurs propres fichiers, un par zone, dans un sous-dossier de assets/i18n/src/ :
 * nord/<zone>.tsv (1re ligne « fr ¦ cs ¦ sv ¦ da »), nord2/<zone>.tsv (1re ligne « fr ¦ sk ¦ nb ») et nord3/<zone>.tsv
 * (1re ligne « fr ¦ ro »), mêmes clés
 * (y compris « ctx|… » et « =mot ») que assets/i18n/src/<zone>.tsv : ainsi on les traduit sans toucher aux fichiers des
 * 7 premières langues. Tout sous-dossier de src/ est lu ; chaque fichier dit ses langues dans sa 1re ligne : toutes les
 * sortes de fichiers sont fusionnées, clé par clé.
 * Le français n'a pas de fichier : la clé EST le texte français.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets/i18n/src');
const NORD = path.join(SRC, 'nord');
const CORE = ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl'];  // traduites en entier : une clé absente est une erreur
const NEW_LANGS = ['cs', 'sv', 'da', 'sk', 'nb', 'ro'];   // en cours de traduction : une clé absente → repli sur le français
const LANGS = [...CORE, ...NEW_LANGS];
const NAMES = {en: 'English', es: 'Español', de: 'Deutsch', it: 'Italiano', pt: 'Português', pl: 'Polski', nl: 'Nederlands', cs: 'Čeština', sv: 'Svenska', da: 'Dansk', sk: 'Slovenčina', nb: 'Norsk (bokmål)', ro: 'Română'};
const FORMS = {pl: ['one', 'few', 'many'], cs: ['one', 'few', 'many'], sk: ['one', 'few', 'many'], ro: ['one', 'few', 'other'], def: ['one', 'other']};

function readFile(file, label) {
    const out = [];
    const lines = fs.readFileSync(file, 'utf8').replace(/\r/g, '').split('\n');
    const head = (lines[0].includes('\t') ? lines[0].split('\t') : lines[0].split(' ¦ ')).map(s => s.trim());
    if (head[0] !== 'fr') throw new Error(`${label} : la 1re ligne doit commencer par « fr »`);
    const bad = head.slice(1).filter(c => !LANGS.includes(c));
    if (bad.length) throw new Error(`${label} : langue inconnue dans la 1re ligne (${bad.join(', ')})`);
    lines.slice(1).forEach((l, i) => {
        if (!l.trim() || /^#/.test(l)) return;
        const cells = l.includes('\t') ? l.split('\t') : l.split(' ¦ '); // tabulations, ou « ¦ » entouré d'espaces (plus facile à écrire)
        let key = cells[0], plural = false;
        if (key.startsWith('=')) { plural = true; key = key.slice(1); }
        const vals = {};
        head.slice(1).forEach((code, k) => { vals[code] = (cells[k + 1] ?? '').trim(); });
        out.push({key, plural, vals, file: label, line: i + 2, langs: head.slice(1)});
    });
    return out;
}
/** les sous-dossiers de src/ qui ont des .tsv (nord/, nord2/…) : un par groupe de langues ajoutées ensuite */
function extraDirs(src = SRC) {
    if (!fs.existsSync(src)) return [];
    return fs.readdirSync(src, {withFileTypes: true}).filter(d => d.isDirectory()).map(d => path.join(src, d.name))
        .filter(d => fs.readdirSync(d).some(f => f.endsWith('.tsv'))).sort();
}
/** les fichiers d'un sous-dossier (nord/ par défaut), ou de plusieurs : {key, plural, vals: {cs, sv, da…}, file, line, langs} */
function readNord(dirs = NORD) {
    const rows = [];
    for (const dir of [].concat(dirs)) {
        if (!fs.existsSync(dir)) continue;
        const name = path.basename(dir);
        for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.tsv')).sort()) rows.push(...readFile(path.join(dir, f), `${name}/${f}`));
    }
    return rows;
}
/** dans quel sous-dossier s'écrit une langue ajoutée ensuite (lu dans la 1re ligne des fichiers ; sinon nord/) */
function dirOf(code, src = SRC) {
    for (const d of extraDirs(src)) {
        for (const f of fs.readdirSync(d).filter(x => x.endsWith('.tsv'))) {
            const h = fs.readFileSync(path.join(d, f), 'utf8').split('\n')[0];
            if ((h.includes('\t') ? h.split('\t') : h.split(' ¦ ')).map(x => x.trim()).includes(code)) return {dir: path.basename(d), head: h.trim()};
        }
    }
    return {dir: 'nord', head: 'fr ¦ cs ¦ sv ¦ da'};
}
/** les lignes des fichiers de assets/i18n/src/*.tsv, avec les traductions de nord/ fusionnées (même clé) ;
 *  orphans : les lignes de nord/ dont la clé n'existe dans aucun fichier français (clé changée ou mal recopiée) */
function readSources({withOrphans = false, src = SRC, nord = null} = {}) {
    const rows = []; // {key, plural, vals: {en…}, file, line}
    for (const f of fs.readdirSync(src).filter(x => x.endsWith('.tsv')).sort()) rows.push(...readFile(path.join(src, f), f));
    const byId = new Map(rows.map(r => [(r.plural ? '=' : '') + r.key, r]));
    const orphans = [], dups = [];
    const seenNord = new Map();
    for (const n of readNord(nord || extraDirs(src))) {
        const id = (n.plural ? '=' : '') + n.key;
        const r = byId.get(id);
        for (const c of n.langs) { // en double = la même clé ET la même langue (nord/ et nord2/ ont chacun leurs langues)
            const k = `${c}${id}`;
            if (seenNord.has(k) && n.vals[c]) dups.push(`« ${n.key} » [${c}] (${seenNord.get(k)} et ${n.file}:${n.line})`);
            if (n.vals[c]) seenNord.set(k, `${n.file}:${n.line}`);
        }
        if (!r) { orphans.push(n); continue; }
        r.nord = r.nord || {};
        for (const c of n.langs) if (n.vals[c]) { r.vals[c] = n.vals[c]; r.nord[c] = `${n.file}:${n.line}`; }
    }
    if (withOrphans) return {rows, orphans, dups};
    return rows;
}
function forms(code, v) {
    const parts = v.split('|').map(s => s.trim());
    const names = FORMS[code] || FORMS.def, o = {};
    names.forEach((n, i) => { o[n] = parts[i] || parts[parts.length - 1]; });
    if (code === 'pl') o.other = o.few;
    else if (code === 'cs' || code === 'sk') { o.other = o.many; o.many = o.few; } // Intl (cs, sk) : 5 et plus → « other », 1,5 → « many » (comme « 2 à 4 »)
    else if (!o.other) o.other = o.one;
    if (code === 'pt' || code === 'es' || code === 'it') o.many = o.other; // « 1 000 000 de… » : Intl donne « many »
    if (code === 'fr') o.many = o.other;
    return o;
}
function build() {
    const {rows, orphans, dups} = readSources({withOrphans: true});
    orphans.forEach(n => console.warn(`⚠️ ${n.file}:${n.line} : « ${n.key} » n'existe dans aucun fichier français de assets/i18n/src/ (clé changée ?) — ignorée`));
    dups.forEach(d => console.warn(`⚠️ en double dans les sous-dossiers : ${d} — la dernière gagne`));
    const out = Object.fromEntries(LANGS.map(c => [c, {}]));
    const seen = new Map();
    for (const r of rows) {
        const id = (r.plural ? '=' : '') + r.key;
        if (seen.has(id)) console.warn(`⚠️ en double : « ${r.key} » (${seen.get(id)} et ${r.file}:${r.line}) — la dernière gagne`);
        seen.set(id, `${r.file}:${r.line}`);
        for (const c of LANGS) {
            const v = r.vals[c]; if (!v) continue;
            out[c][r.key] = r.plural ? forms(c, v) : v;
        }
    }
    for (const c of LANGS) {
        const sorted = {_meta: {lang: c, name: NAMES[c], source: 'fr', ai: true, note: 'Fabriqué par scripts/i18n-build.js depuis assets/i18n/src/*.tsv' + (NEW_LANGS.includes(c) ? ` et assets/i18n/src/${dirOf(c).dir}/*.tsv` : '') + ' : ne pas modifier à la main.'}};
        Object.keys(out[c]).sort((a, b) => a.localeCompare(b, 'fr')).forEach(k => { sorted[k] = out[c][k]; });
        fs.writeFileSync(path.join(ROOT, 'assets/i18n', `${c}.json`), JSON.stringify(sorted, null, 1) + '\n');
    }
    return {rows: rows.length, keys: seen.size};
}
module.exports = {readSources, readNord, extraDirs, dirOf, build, LANGS, CORE, NEW_LANGS, FORMS, NAMES, SRC, NORD};
if (require.main === module) { const r = build(); console.log(`✓ ${r.keys} textes (${r.rows} lignes) → assets/i18n/{${LANGS.join(',')}}.json`); }
