#!/usr/bin/env node
/* 🌐 Fabrique les fichiers de langue assets/i18n/<code>.json depuis assets/i18n/src/*.tsv (mode d'emploi : docs/I18N.md).
 *
 *   node scripts/i18n-build.js
 *
 * Format d'un fichier .tsv (une zone de l'app par fichier : cadre.tsv, reglages.tsv…) :
 *   - 1re ligne : fr  en  es  de  it  pt  pl  nl   (séparées par une tabulation, ou par « ¦ » entouré d'espaces)
 *   - une ligne par texte : le français exact (la clé), puis les 7 traductions ;
 *   - « ctx|Texte » dans la colonne fr : un même mot traduit autrement selon l'endroit (t('Texte', {ctx: 'ctx'})) ;
 *   - « =mot » dans la colonne fr : un pluriel pour plural(n, 'mot') ; chaque traduction donne ses formes séparées
 *     par « | » : one|other (en, es, de, it, pt, nl), one|few|many (pl) ;
 *   - ligne vide ou commençant par « # » : ignorée. Variables {n}, {x} : les mêmes dans toutes les langues.
 * Le français n'a pas de fichier : la clé EST le texte français.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets/i18n/src');
const LANGS = ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl'];
const NAMES = {en: 'English', es: 'Español', de: 'Deutsch', it: 'Italiano', pt: 'Português', pl: 'Polski', nl: 'Nederlands'};
const FORMS = {pl: ['one', 'few', 'many'], def: ['one', 'other']};

function readSources() {
    const rows = []; // {key, plural, vals: {en…}, file, line}
    for (const f of fs.readdirSync(SRC).filter(x => x.endsWith('.tsv')).sort()) {
        const lines = fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\r/g, '').split('\n');
        const head = (lines[0].includes('\t') ? lines[0].split('\t') : lines[0].split(' ¦ ')).map(s => s.trim());
        if (head[0] !== 'fr') throw new Error(`${f} : la 1re ligne doit commencer par « fr »`);
        lines.slice(1).forEach((l, i) => {
            if (!l.trim() || /^#/.test(l)) return;
            const cells = l.includes('\t') ? l.split('\t') : l.split(' ¦ '); // tabulations, ou « ¦ » entouré d'espaces (plus facile à écrire)
            let key = cells[0], plural = false;
            if (key.startsWith('=')) { plural = true; key = key.slice(1); }
            const vals = {};
            head.slice(1).forEach((code, k) => { if (LANGS.includes(code)) vals[code] = (cells[k + 1] ?? '').trim(); });
            rows.push({key, plural, vals, file: f, line: i + 2});
        });
    }
    return rows;
}
function forms(code, v) {
    const parts = v.split('|').map(s => s.trim());
    const names = FORMS[code] || FORMS.def, o = {};
    names.forEach((n, i) => { o[n] = parts[i] || parts[parts.length - 1]; });
    if (code === 'pl') o.other = o.few; else if (!o.other) o.other = o.one;
    if (code === 'pt' || code === 'es' || code === 'it') o.many = o.other; // « 1 000 000 de… » : Intl donne « many »
    if (code === 'fr') o.many = o.other;
    return o;
}
function build() {
    const rows = readSources();
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
        const sorted = {_meta: {lang: c, name: NAMES[c], source: 'fr', ai: true, note: 'Fabriqué par scripts/i18n-build.js depuis assets/i18n/src/*.tsv : ne pas modifier à la main.'}};
        Object.keys(out[c]).sort((a, b) => a.localeCompare(b, 'fr')).forEach(k => { sorted[k] = out[c][k]; });
        fs.writeFileSync(path.join(ROOT, 'assets/i18n', `${c}.json`), JSON.stringify(sorted, null, 1) + '\n');
    }
    return {rows: rows.length, keys: seen.size};
}
module.exports = {readSources, build, LANGS, SRC};
if (require.main === module) { const r = build(); console.log(`✓ ${r.keys} textes (${r.rows} lignes) → assets/i18n/{${LANGS.join(',')}}.json`); }
