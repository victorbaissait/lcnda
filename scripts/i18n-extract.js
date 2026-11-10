#!/usr/bin/env node
/* 🌐 Les textes français encore écrits en dur (mode d'emploi : docs/I18N.md).
 *
 *   node scripts/i18n-extract.js assets/js/app-ui.js            les textes français d'un fichier (fichier:ligne  texte)
 *   node scripts/i18n-extract.js assets/js --summary            nombre de textes par fichier (les plus gros d'abord)
 *   node scripts/i18n-extract.js assets/js/app-ui.js --missing en
 *                                                               seulement ceux qui n'ont pas de traduction en anglais
 *   options : --json (sortie JSON), --tsv (une ligne par texte, à coller dans assets/i18n/src/<zone>.tsv), --unique
 *
 * Heuristique : chaînes '…', "…", `…` (gabarits : le texte hors ${…}, découpé entre les balises, plus title, placeholder,
 * aria-label, alt), hors commentaires ; gardées si elles ont l'air françaises (accents, mots courants, mots de l'app) et
 * pas du code (clés, sélecteurs, adresses, CSS). Les fichiers .php : le HTML hors <?php ?>, et les chaînes des blocs PHP.
 * Les textes passés à t('…') comptent comme « à traduire » : --missing dit lesquels manquent dans le fichier de langue.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ACCENT = /[àâçéèêëîïôûùüÿœæÀÂÇÉÈÊËÎÏÔÛÙÜŸŒÆ’«»]/;
const STOP = new Set('le la les des du un une et ou pour avec dans sur pas ton ta tes tu te toi ici ce cette ces son sa ses qui que quoi est sont par au aux en plus rien tout tous toutes fiche fiches personne personnes enregistrer annuler fermer supprimer retirer modifier ajouter créer chercher filtrer trier liste lieu lieux carte cartes source sources réglages aide nouveau nouvelle ouvrir choisir importer exporter imprimer copier coller dupliquer renommer relier oui non aucun aucune moins encore'.split(' '));
const CODEY = /^[\w$.\-:#\[\]=>*+~^|/\\(),'"@%!?{}&;]*$/; // pas d'espace ni de lettre accentuée : une clé, un sélecteur…
const ATTRS = /\b(title|placeholder|aria-label|alt|data-tip|label)\s*=\s*(["'])([^"'<>]*?)\2/g;

/* ═════ Lecture du JS : chaînes et gabarits, sans les commentaires ═════ */
function scanJs(src) {
    const out = []; // {text, line, html}
    let i = 0, line = 1, lastSig = '';
    const n = src.length;
    const push = (text, ln, html) => { if (text) out.push({text, line: ln, html}); };
    const regexAllowed = () => !lastSig || /[(,=:[!&|?{};+\-*%<>~^]$/.test(lastSig) || /\b(return|typeof|case|in|of|delete|void|throw|new|else|do)$/.test(lastSig);
    function readQuoted(q) { // i sur le guillemet
        const ln = line; let s = ''; i++;
        while (i < n && src[i] !== q) {
            if (src[i] === '\\') { const c = src[i + 1]; s += c === 'n' ? '\n' : c === 't' ? '\t' : c === 'u' ? (() => { const m = src.slice(i + 2).match(/^\{?([0-9a-f]{4,6})\}?/i); if (m) { i += m[0].length; return String.fromCodePoint(parseInt(m[1], 16)); } return ''; })() : c; i += 2; continue; }
            if (src[i] === '\n') { line++; break; }
            s += src[i++];
        }
        i++;
        return {s, ln};
    }
    function readTemplate() { // i sur `
        i++; let seg = '', ln = line;
        while (i < n) {
            const c = src[i];
            if (c === '\\') { seg += src[i + 1]; i += 2; continue; }
            if (c === '`') { i++; push(seg, ln, true); return; }
            if (c === '$' && src[i + 1] === '{') { push(seg, ln, true); seg = ''; i += 2; scanCode(true); ln = line; continue; }
            if (c === '\n') line++;
            seg += c; i++;
        }
        push(seg, ln, true);
    }
    function scanCode(untilBrace) {
        let depth = 0;
        while (i < n) {
            const c = src[i], d = src[i + 1];
            if (c === '\n') { line++; i++; continue; }
            if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
            if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
            if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); const body = src.slice(i, e < 0 ? n : e + 2); line += (body.match(/\n/g) || []).length; i = e < 0 ? n : e + 2; continue; }
            if (c === "'" || c === '"') { const {s, ln} = readQuoted(c); push(s, ln, /<\/?[a-z][\w-]*[\s>/]/i.test(s)); lastSig = 'x'; continue; }
            if (c === '`') { readTemplate(); lastSig = 'x'; continue; }
            if (c === '/' && regexAllowed()) { // expression régulière
                i++; let cls = false;
                while (i < n && src[i] !== '\n') { if (src[i] === '\\') { i += 2; continue; } if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; else if (src[i] === '/' && !cls) break; i++; }
                i++; while (i < n && /[a-z]/i.test(src[i])) i++;
                lastSig = 'x'; continue;
            }
            if (untilBrace) { if (c === '{') depth++; else if (c === '}') { if (depth === 0) { i++; return; } depth--; } }
            if (/[A-Za-z0-9_$]/.test(c)) { const m = src.slice(i).match(/^[A-Za-z0-9_$]+/)[0]; lastSig = m; i += m.length; continue; }
            lastSig = c; i++;
        }
    }
    scanCode(false);
    return out;
}

/* ═════ HTML : le texte entre les balises + les attributs lisibles ═════ */
function htmlPieces(s) {
    const res = [];
    let m; ATTRS.lastIndex = 0;
    while ((m = ATTRS.exec(s))) res.push(m[3]);
    s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, '\u0000').split('\u0000').forEach(p => res.push(p));
    // un morceau qui commence au milieu d'une balise (gabarit coupé par ${…}) : ce qui suit le dernier « > »
    return res.map(p => p.replace(/^[^<>]*?"?\s*>/, m => (/[=]/.test(m) ? '' : m)).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
}

/** a l'air d'un texte français affiché ? */
function looksFrench(raw) {
    const s = String(raw || '').replace(/\s+/g, ' ').trim();
    if (s.length < 2 || s.length > 400 || !/\p{L}{2}/u.test(s)) return false;
    if (/^(https?:|mailto:|data:|#|\.|\/|assets\/|lib\/|api\.php)/.test(s)) return false;
    if (/^[a-z][\w-]*(\s*[:{]|\s*=)/.test(s) && !ACCENT.test(s)) return false; // CSS, clé=valeur
    if (/[{};]\s*$/.test(s) && /:\s*[\w#-]+;/.test(s)) return false;           // CSS en ligne
    if (/^(data|aria)-[\w-]+$/.test(s)) return false;
    if (CODEY.test(s) && !ACCENT.test(s)) { // un seul mot sans accent
        return /^[A-ZÉ][a-zàâçéèêëîïôûùü]{2,}$/.test(s) && STOP.has(s.toLowerCase());
    }
    if (ACCENT.test(s)) return !/^[\w.-]+\.(js|css|php|json|png|svg)$/.test(s);
    const words = s.toLowerCase().split(/[^a-zàâçéèêëîïôûùüÿœæ]+/).filter(Boolean);
    return words.some(w => STOP.has(w)) && words.length >= 1 && !/\b(the|and|with|for|you|your|this)\b/i.test(s);
}

function textsOfFile(file) {
    const src = fs.readFileSync(file, 'utf8');
    const ext = path.extname(file);
    let items = [];
    if (ext === '.php') {
        // le HTML hors PHP (lignes gardées), et les chaînes des blocs PHP
        let html = '', i = 0;
        const re = /<\?(php|=)?[\s\S]*?(\?>|$)/g; let m;
        while ((m = re.exec(src))) { html += src.slice(i, m.index); html += m[0].replace(/[^\n]/g, ' '); i = m.index + m[0].length; const code = m[0]; scanJs(code.replace(/^<\?(php|=)?/, '').replace(/\?>$/, '')).forEach(x => items.push({text: x.text, line: src.slice(0, m.index).split('\n').length + x.line - 1, html: x.html})); }
        html += src.slice(i);
        // le JS des <script> en ligne : lu comme du JS
        html = html.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (all, a, body, b, off) => { const base = html.slice(0, off).split('\n').length; scanJs(body).forEach(x => items.push({text: x.text, line: base + x.line - 1, html: x.html})); return a + body.replace(/[^\n]/g, ' ') + b; });
        html.split('\n').forEach((l, k) => htmlPieces(l).forEach(p => items.push({text: p, line: k + 1, html: false})));
    } else items = scanJs(src);
    const res = [];
    for (const it of items) {
        const pieces = it.html ? htmlPieces(it.text) : [it.text];
        for (const p of pieces) {
            const s = p.replace(/\s+/g, ' ').trim();
            if (looksFrench(s)) res.push({file, line: it.line, text: s});
        }
    }
    return res;
}
/** les textes passés à t('…') ou I18N.t('…') : ils doivent être dans les fichiers de langue */
function tCalls(file) {
    const src = fs.readFileSync(file, 'utf8'), res = [];
    const re = /\b(?:t|tr|tt|i18n|I\.t|I18N\.t|LCNDA_I18N\.t)\(\s*(['"`])((?:\\.|(?!\1).)*?)\1\s*(,\s*\{[^}]*ctx\s*:\s*['"]([a-z0-9-]+)['"])?/g; let m;
    while ((m = re.exec(src))) { if (m[1] === '`' && m[2].includes('${')) continue; res.push({file, line: src.slice(0, m.index).split('\n').length, text: m[2].replace(/\\(.)/g, '$1'), ctx: m[4] || ''}); }
    return res;
}
function filesOf(target) {
    const st = fs.statSync(target);
    if (st.isFile()) return [target];
    return fs.readdirSync(target).flatMap(f => { const p = path.join(target, f); const s = fs.statSync(p); if (s.isDirectory()) return /^(node_modules|vendor|i18n|aide-langues)$/.test(f) ? [] : filesOf(p); return /\.(js|php)$/.test(f) && !/\.min\.js$/.test(f) ? [p] : []; });
}
/** même lecture que le filet de la page : le texte entier, sans symbole devant, sans « … », « : », « ▾ » au bout */
const LEAD = /^[\s\p{Extended_Pictographic}\p{So}\p{Sm}️‍⃣·•]+/u, TRAIL = /[\s…:▾▸→↗]+$/u;
function translated(dict, s, ctx = '') {
    if (ctx && dict[`${ctx}|${s}`] != null) return true;
    if (dict[s] != null) return true;
    const lead = (s.match(LEAD) || [''])[0], rest = s.slice(lead.length), trail = (rest.match(TRAIL) || [''])[0], core = rest.slice(0, rest.length - trail.length);
    if (dict[rest] != null || dict[core] != null || dict[lead + core] != null) return true;
    return patternsOf(dict).some(re => re.test(s) || re.test(core));
}
const patCache = new WeakMap();
function patternsOf(dict) {
    if (patCache.has(dict)) return patCache.get(dict);
    const list = Object.keys(dict).filter(k => /\{[a-z_][a-z0-9_]*\}/i.test(k) && typeof dict[k] === 'string').map(k => new RegExp('^' + k.replace(/^[a-z0-9-]+\|/, '').split(/(\{[a-z_][a-z0-9_]*\})/i).map(p => (/^\{.*\}$/.test(p) ? '(.+?)' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('') + '$', 'u'));
    patCache.set(dict, list); return list;
}
const loadDict = code => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets/i18n', `${code}.json`), 'utf8')); } catch (_) { return {}; } };

function run(argv) {
    const args = argv.filter(a => !a.startsWith('--')), flag = f => argv.includes(f);
    const mi = argv.indexOf('--missing'), missing = mi >= 0 ? argv[mi + 1] : '';
    const targets = args.filter(a => a !== missing);
    if (!targets.length) { console.log('usage : node scripts/i18n-extract.js <fichier|dossier>… [--summary] [--missing en] [--json] [--tsv] [--unique]'); return 1; }
    const dict = missing ? loadDict(missing) : null;
    let all = [];
    for (const tg of targets) for (const f of filesOf(tg)) {
        if (/app-i18n\.js$/.test(f)) continue;
        all.push(...textsOfFile(f).map(x => ({...x, kind: 'dur'})));
        all.push(...tCalls(f).map(x => ({...x, kind: 't'})));
    }
    // un texte passé à t() n'est plus « en dur »
    const tset = new Set(all.filter(x => x.kind === 't').map(x => `${x.file}:${x.text}`));
    all = all.filter(x => x.kind === 't' || !tset.has(`${x.file}:${x.text}`));
    if (dict) all = all.filter(x => !translated(dict, x.text, x.ctx));
    if (flag('--unique')) { const seen = new Set(); all = all.filter(x => !seen.has(x.text) && seen.add(x.text)); }
    const rel = f => path.relative(process.cwd(), f);
    if (flag('--json')) console.log(JSON.stringify(all.map(x => ({...x, file: rel(x.file)})), null, 1));
    else if (flag('--tsv')) { const seen = new Set(); all.forEach(x => { if (!seen.has(x.text)) { seen.add(x.text); console.log(x.text.replace(/\t/g, ' ')); } }); }
    else if (flag('--summary')) {
        const by = {}; all.forEach(x => { by[rel(x.file)] = (by[rel(x.file)] || 0) + 1; });
        Object.entries(by).sort((a, b) => b[1] - a[1]).forEach(([f, k]) => console.log(String(k).padStart(6), f));
        console.log(String(all.length).padStart(6), `TOTAL (${Object.keys(by).length} fichiers)`);
    } else all.forEach(x => console.log(`${rel(x.file)}:${x.line}\t${x.kind === 't' ? 't() ' : ''}${x.text}`));
    return 0;
}
module.exports = {scanJs, htmlPieces, looksFrench, textsOfFile, tCalls, filesOf, translated, loadDict};
if (require.main === module) process.exitCode = run(process.argv.slice(2));
