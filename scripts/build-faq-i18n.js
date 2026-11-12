#!/usr/bin/env node
/* 🌐 La FAQ dans les autres langues (mode d'emploi : docs/I18N.md, « La FAQ »).
 *
 *   node scripts/build-faq-i18n.js            fabrique assets/i18n/faq/<code>.json depuis assets/i18n/faq/src/<code>.tsv
 *   node scripts/build-faq-i18n.js --status   ce qui est traduit, langue par langue (questions sans traduction, réponses à revoir)
 *   node scripts/build-faq-i18n.js --todo <dossier> [--lang cs] [--size 12000]  (paquets d'environ 12 000 lettres)
 *                                            écrit dans <dossier> les questions encore à traduire, par paquets (pour traduire)
 *
 * La FAQ française reste écrite dans assets/js/heritage-more.js (« const FAQ = [ … ] ») : c'est la référence.
 * Chaque question a un repère fabriqué depuis sa question française (« 1x9k2qa ») et chaque réponse une empreinte (« 3f0z ») :
 *   assets/i18n/faq/src/de/*.tsv (ou src/de.tsv) : une ligne par question — « repère.empreinte <TAB> question traduite <TAB> réponse traduite ».
 * Si la réponse française change, l'empreinte ne correspond plus : la question reste traduite, la réponse revient au français
 * (repli) jusqu'à ce qu'on la retraduise (--status la liste). Si la question française change, la ligne n'est plus reconnue.
 * Les thèmes (Fiches, Outils…) sont des textes ordinaires : assets/i18n/src/faq.tsv.
 * Une réponse qui dépend de l'ordinateur s'écrit « {mac:⌃⌘Espace|pc:⊞ + .} » dans la traduction.
 * Langues en cours (cs, sv, da, sk, nb, ro, fi, hu, hr, sl : NEW_LANGS) : même principe, assets/i18n/faq/src/cs/*.tsv, …/sk/*.tsv, …/nb/*.tsv, …/ro/*.tsv, …/fi/*.tsv, …/hu/*.tsv, …/hr/*.tsv, …/sl/*.tsv ; leurs .json sont fabriqués
 * (vides au départ : tout reste en français) ; --status les montre, mais une question sans traduction n'y est pas une faute.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets/i18n/faq');
const SRC = path.join(DIR, 'src');
const LANGS = ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl'];  // traduites en entier (tests/test-i18n-faq.js)
const NEW_LANGS = ['cs', 'sv', 'da', 'sk', 'nb', 'ro', 'fi', 'hu', 'hr', 'sl']; // en cours : une question absente reste en français
const ALL_LANGS = [...LANGS, ...NEW_LANGS];
const VERSION = 7; // monter avec FAQ_I18N_V dans heritage-more.js quand les .json changent

/** la liste « const FAQ = [ … ]; » de heritage-more.js ; mac = true : les touches écrites pour un Mac */
function readFaq({mac = false} = {}) {
    const source = fs.readFileSync(path.join(ROOT, 'assets/js/heritage-more.js'), 'utf8');
    const start = source.indexOf('const FAQ = [');
    if (start < 0) throw new Error('« const FAQ = [ » introuvable dans heritage-more.js');
    let i = source.indexOf('[', start), depth = 0, quote = null;
    for (; i < source.length; i++) {
        const c = source[i];
        if (quote) { if (c === '\\') { i++; continue; } if (c === quote) quote = null; continue; }
        if (c === '\'' || c === '"' || c === '`') { quote = c; continue; }
        if (c === '[') depth++;
        else if (c === ']' && --depth === 0) break;
    }
    const literal = source.slice(source.indexOf('[', start), i + 1);
    const nav = mac ? {platform: 'MacIntel', userAgent: 'Macintosh'} : {platform: '', userAgent: ''};
    return vm.runInNewContext('(' + literal + ')', Object.assign(Object.create(null), {navigator: nav}), {timeout: 2000});
}
/** le même calcul que dans heritage-more.js (faqId) : FNV-1a 32 bits, en base 36 */
function hash(s) { let h = 0x811c9dc5; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }
const qid = q => hash(q).padStart(7, '0');
const aid = a => hash(a).slice(-4).padStart(4, '0');

/** toutes les questions, à plat : {id, ah, theme, q, a} (version PC des touches) */
function entries() {
    const out = [];
    readFaq().forEach(([theme, items]) => items.forEach(([q, a]) => out.push({id: qid(q), ah: aid(a), theme, q, a})));
    return out;
}
function readLang(code) {
    // assets/i18n/faq/src/<code>.tsv et/ou les fichiers du dossier assets/i18n/faq/src/<code>/ (*.tsv, lus dans l'ordre)
    const rows = new Map(), dir = path.join(SRC, code);
    const files = [path.join(SRC, `${code}.tsv`), ...(fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.tsv')).sort().map(f => path.join(dir, f)) : [])].filter(f => fs.existsSync(f));
    for (const file of files) {
        const name = path.relative(SRC, file);
        fs.readFileSync(file, 'utf8').replace(/\r/g, '').split('\n').forEach((l, n) => {
            if (!l.trim() || l.startsWith('#')) return;
            const [key, q, a] = l.split('\t');
            const [id, ah] = String(key || '').trim().split('.');
            if (!id || !q) throw new Error(`${name}:${n + 1} : ligne mal formée (repère.empreinte, tabulation, question, tabulation, réponse)`);
            rows.set(id, {ah: ah || '', q: q.trim(), a: (a || '').trim(), line: `${name}:${n + 1}`});
        });
    }
    return rows;
}
function status() {
    const all = entries(), ids = new Map(all.map(e => [e.id, e]));
    if (ids.size !== all.length) throw new Error('deux questions de la FAQ ont le même texte : chaque question doit être unique');
    const res = {};
    for (const c of ALL_LANGS) {
        const rows = readLang(c), r = {total: all.length, done: 0, stale: [], missing: [], orphan: [], errors: []};
        for (const e of all) {
            const t = rows.get(e.id);
            if (!t) { r.missing.push(e.id); continue; }
            if (t.ah !== e.ah || !t.a) r.stale.push(e.id); else r.done++;
            const sym = s => (s.match(/^[\p{Extended_Pictographic}\p{So}]/u) || [''])[0];
            if (sym(e.q) && sym(e.q) !== sym(t.q)) r.errors.push(`${t.line} symbole de tête perdu « ${sym(e.q)} » : ${t.q}`);
        }
        for (const [id, t] of rows) if (!ids.has(id)) r.orphan.push(`${t.line} ${id} (question française changée ou retirée)`);
        res[c] = r;
    }
    return res;
}
/** remet les touches selon l'ordinateur : « {mac:⌃⌘Espace|pc:⊞ + .} » (fait dans le navigateur, gardé tel quel ici) */
function build() {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, {recursive: true});
    const all = entries(), out = {};
    for (const c of ALL_LANGS) {
        const rows = readLang(c), items = {};
        let done = 0;
        for (const e of all) {
            const t = rows.get(e.id); if (!t) continue;
            const fresh = t.ah === e.ah && t.a;
            items[e.id] = fresh ? [t.q, t.a] : [t.q];
            if (fresh) done++;
        }
        const json = {_meta: {lang: c, version: VERSION, total: all.length, questions: Object.keys(items).length, answers: done, ai: true,
            note: 'Fabriqué par scripts/build-faq-i18n.js depuis assets/i18n/faq/src/' + c + '/*.tsv : ne pas modifier à la main.'}, items};
        fs.writeFileSync(path.join(DIR, `${c}.json`), JSON.stringify(json) + '\n');
        out[c] = {questions: Object.keys(items).length, answers: done};
    }
    return {total: all.length, langs: out};
}
/** paquets de questions à traduire (pour qui traduit) */
function todo(dir, {lang = '', size = 12000} = {}) {
    fs.mkdirSync(dir, {recursive: true});
    const st = status(), all = entries();
    const need = all.filter(e => (lang ? [lang] : ALL_LANGS).some(c => st[c].missing.includes(e.id) || st[c].stale.includes(e.id)));
    let n = 0, part = [], len = 0;
    const flush = () => { if (!part.length) return; fs.writeFileSync(path.join(dir, `faq-${String(++n).padStart(3, '0')}.tsv`), part.join('\n') + '\n'); part = []; len = 0; };
    for (const e of need) { const l = `${e.id}.${e.ah}\t${e.q}\t${e.a}`; if (len + l.length > size) flush(); part.push(l); len += l.length; }
    flush();
    return {entries: need.length, files: n};
}
module.exports = {readFaq, entries, status, build, todo, hash, qid, aid, LANGS, NEW_LANGS, ALL_LANGS, VERSION, DIR, SRC};

if (require.main === module) {
    const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : ''; };
    if (argv.includes('--status')) {
        const st = status(); let bad = 0;
        for (const c of ALL_LANGS) {
            const r = st[c];
            console.log(`${c} : ${r.done}/${r.total} réponses traduites · ${r.missing.length} sans traduction · ${r.stale.length} à revoir · ${r.orphan.length} lignes en trop`);
            r.errors.concat(r.orphan).forEach(e => { console.log('  ⚠️', e); });
            bad += r.errors.length;
        }
        process.exitCode = bad ? 1 : 0;
    } else if (argv.includes('--todo')) {
        const r = todo(opt('--todo'), {lang: opt('--lang'), size: Number(opt('--size')) || 12000});
        console.log(`${r.entries} questions à traduire → ${r.files} paquets dans ${opt('--todo')}`);
    } else {
        const r = build();
        console.log(`✓ FAQ : ${r.total} questions → assets/i18n/faq/{${ALL_LANGS.join(',')}}.json`);
        for (const c of ALL_LANGS) console.log(`  ${c} : ${r.langs[c].questions} questions, ${r.langs[c].answers} réponses`);
    }
}
