#!/usr/bin/env node
/* 🗂 Fabrique assets/data/manifest.json : le sommaire des données livrées avec l'app (un « pack » = un fichier, ou une famille
 * de fichiers : dp-maires-01…, cc-rietstap-a…, ou tout un sous-dossier : wikidata/, dicotopo/…).
 *
 *   node scripts/donnees-manifest.js [--branch main] [--check]
 *
 * Pour chaque pack : version (= date des données), built, sha256 et taille de chaque fichier, nombre de lignes, licence, source.
 * La date vient du champ « built » du fichier (mis par son script de fabrication) ; sinon la date du dernier enregistrement git
 * du fichier ; sinon la date du fichier sur le disque.
 * L'app lit ce sommaire (lib/donnees_maj.php) : il dit ce qui est installé, et, lu sur GitHub
 * (raw.githubusercontent.com/victorbaissait/lcnda/<branche>/assets/data/manifest.json), s'il existe une version plus récente.
 * Relancé par .github/workflows/donnees-maj.yml après avoir refait des packs.
 * --check : n'écrit rien, sort en erreur si le sommaire n'est pas à jour (pour un essai).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const {spawnSync} = require('child_process');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'assets', 'data');
const OUT = path.join(DATA, 'manifest.json');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BRANCH = arg('--branch', process.env.LCNDA_DONNEES_BRANCH || 'main');
const CHECK = argv.includes('--check');

/* les listes qu'on peut recompter en direct sur Wikidata (la même question que le script de fabrication, en ne gardant que le nombre) */
const WIKIDATA_COUNT = {
    'l8c-tour': 'SELECT (COUNT(DISTINCT ?s) AS ?n) WHERE { ?ed wdt:P31 wd:Q33881 . ?ed p:P527 ?ps . ?ps ps:P527 ?s . ?s wdt:P1427 ?a ; wdt:P1444 ?b . }',
};
/* le script qui refait chaque pack (affiché dans Réglages → 🗂 Données installées) */
const BUILDERS = [[/^l8c-/, 'scripts/lot8-monde-village/build.py'], [/^l8a-/, 'scripts/lot8-ciel-metier'], [/^l8b-/, 'scripts/lot8-soldats-noms'], [/^l9a-/, 'scripts/lot9-sons-enfance'],
    [/^l9b-/, 'scripts/lot9-monde-coutumes'], [/^l10t-/, 'scripts/lot10-terre-gens'], [/^l10o-/, 'scripts/lot10-objets-traces'], [/^td-/, 'scripts/telech-d'], [/^tf-/, 'scripts/telech-f'], [/^th-/, 'scripts/telech-h'], [/^tg-/, 'scripts/telech-g'], [/^ti-/, 'scripts/telech-i'], [/^ts-|^tx-/, 'scripts/telech-m'], [/^tk-/, 'scripts/telech-k'], [/^tl-/, 'scripts/telech-l'], [/^tj-/, 'scripts/telech-j'], [/^tn2-/, 'scripts/telech-n2'],[/^te-/, 'scripts/telech-e'],[/^tc-/, 'scripts/telech-c'], [/^l10-/, 'scripts/lot10-regles-actes'], [/^tb-/, 'scripts/telech-b/build.py'], [/^ha-/, 'scripts/histoire-autour/build.py'],
    [/^wikidata$/, 'scripts/wikidata/build-wikidata.py'], [/^tm-/, 'scripts/terre-mots'], [/^tq-/, 'scripts/terre-quotidien'], [/^tr-/, 'scripts/terroir'], [/^cc-/, 'scripts/commune-culture'],
    [/^et-/, 'scripts/epoque-travail'], [/^pm-/, 'scripts/pays-memoire'], [/^dp-/, 'scripts/droit-pouvoir'], [/^br-/, 'scripts/boussole-rues'], [/^metiers-/, 'scripts/metiers-rivieres'],
    [/^(dicotopo|casias)$/, 'scripts/lieux-patrimoine'], [/^(chateaux|territoires)$/, 'scripts/chateaux-territoires'], [/^geo$/, 'scripts/geo']];

const isData = f => /\.(json|json\.gz|bin)$/.test(f) && f !== 'manifest.json';
function walk(dir, rel = '') {
    const out = [];
    for (const e of fs.readdirSync(dir, {withFileTypes: true}).sort((a, b) => (a.name < b.name ? -1 : 1))) {
        if (e.name.startsWith('.')) continue;
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), r));
        else if (isData(e.name) && !(rel === '' && e.name === 'manifest.json')) out.push(r);
    }
    return out;
}
const stem = f => f.replace(/\.(json\.gz|json|bin)$/, '');

/* les packs : un sous-dossier = un pack ; à la racine, une famille de ≥ 5 fichiers « nom-XX » = un pack, sinon un fichier = un pack */
function packsOf(files) {
    const top = files.filter(f => !f.includes('/'));
    const fam = {};
    for (const f of top) { const m = stem(f).match(/^(.+)-([0-9A-Za-z]{1,3})$/); if (m) fam[m[1]] = (fam[m[1]] || 0) + 1; }
    const families = Object.keys(fam).filter(k => fam[k] >= 5).sort((a, b) => b.length - a.length);
    const packs = {};
    for (const f of files) {
        let id;
        if (f.includes('/')) id = f.split('/')[0];
        else { const s = stem(f); id = families.find(k => s === k || s.startsWith(k + '-')) || s; }
        (packs[id] = packs[id] || []).push(f);
    }
    return packs;
}

/* la date du dernier enregistrement git de chaque fichier (une seule commande) */
function gitDates() {
    const r = spawnSync('git', ['log', '--format=@%cs', '--name-only', '--', 'assets/data'], {cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024});
    const out = {};
    if (r.status !== 0) return out;
    let d = '';
    for (const line of r.stdout.split('\n')) {
        if (line.startsWith('@')) d = line.slice(1);
        else if (line.startsWith('assets/data/')) { const f = line.slice(12); if (!out[f]) out[f] = d; }
    }
    return out;
}
const dirty = (() => { const r = spawnSync('git', ['status', '--porcelain', '--', 'assets/data'], {cwd: ROOT, encoding: 'utf8'}); return new Set(r.status === 0 ? r.stdout.split('\n').map(l => l.slice(3).trim()).filter(Boolean).map(l => l.replace(/^assets\/data\//, '')) : []); })();

const isDate = v => typeof v === 'string' && /^\d{4}-\d\d(-\d\d)?/.test(v);
const short = (v, n = 200) => { const s = typeof v === 'string' ? v : v && typeof v === 'object' ? (v.credit || v.name || v.title || v.text || '') : ''; return String(s).replace(/\s+/g, ' ').trim().slice(0, n); };
/** le nombre de lignes : rows[], ou le tableau / l'objet le plus grand */
function rowsOf(j) {
    if (Array.isArray(j)) return j.length;
    if (!j || typeof j !== 'object') return 0;
    if (Array.isArray(j.rows)) return j.rows.length;
    let best = 0;
    for (const v of Object.values(j)) { const n = Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0; if (n > best) best = n; }
    return best;
}
function readJson(abs) {
    let b = fs.readFileSync(abs);
    if (b[0] === 0x1f && b[1] === 0x8b) b = zlib.gunzipSync(b);
    try { return JSON.parse(b.toString('utf8')); } catch (_) { return null; }
}

function build() {
    const files = walk(DATA), packs = packsOf(files), git = gitDates();
    const out = {format: 1, about: 'Sommaire des données livrées avec LCNDA (scripts/donnees-manifest.js)', repo: 'victorbaissait/lcnda', branch: BRANCH, packs: {}};
    let newest = '';
    for (const id of Object.keys(packs).sort()) {
        const list = packs[id], entry = {version: '', built: '', size: 0, rows: 0, files: {}};
        let meta = null, dates = [];
        for (const f of list) {
            const abs = path.join(DATA, f), buf = fs.readFileSync(abs);
            entry.files[f] = {sha256: crypto.createHash('sha256').update(buf).digest('hex'), size: buf.length};
            entry.size += buf.length;
            if (f.endsWith('.bin')) { dates.push(git[f] && !dirty.has(f) ? git[f] : fs.statSync(abs).mtime.toISOString().slice(0, 10)); continue; }
            const j = readJson(abs);
            entry.rows += rowsOf(j);
            const m = j && !Array.isArray(j) && typeof j === 'object' ? j : {};
            const built = [m.built, m.generated, m.updated, m.checked, m.meta?.built, m.source?.built].find(isDate);
            dates.push(built ? built.slice(0, 10) : git[f] && !dirty.has(f) ? git[f] : fs.statSync(abs).mtime.toISOString().slice(0, 10));
            if (!meta && (m.licence || m.license || m.source || m.attr || m.src)) meta = m;
        }
        const d = dates.sort().pop() || '';
        entry.version = entry.built = d;
        if (d > newest) newest = d;
        if (meta) {
            const lic = meta.licence || meta.license || meta.source?.licence || '';
            entry.licence = short(lic, 120);
            entry.source = short(meta.source || meta.attr || meta.src || meta.credit || '', 200);
            const url = [meta.url, meta.source_url, meta.source?.url, meta.licence_url].find(u => typeof u === 'string' && /^https:\/\//.test(u));
            if (url) entry.url = url;
            const title = short(meta.title || meta.what || '', 160); if (title) entry.title = title;
            // ce que couvre le pack (récap « dont N utiles pour tes lieux », app-donnees-accueil.js) : bbox [O, S, E, N] et/ou pays ISO
            const bb = meta.bbox || meta.meta?.bbox; if (Array.isArray(bb) && bb.length === 4 && bb.every(Number.isFinite)) entry.bbox = bb.map(x => Math.round(x * 100) / 100);
            const cc = [].concat(meta.country || meta.meta?.country || []).filter(c => /^[A-Z]{2}$/.test(c)); if (cc.length) entry.country = cc;
        }
        const b = BUILDERS.find(([re]) => re.test(id)); if (b) entry.script = b[1];
        if (WIKIDATA_COUNT[id]) entry.wikidata_count = WIKIDATA_COUNT[id];
        out.packs[id] = entry;
    }
    out.generated = newest;
    return out;
}

const m = build();
const text = JSON.stringify(m, null, 0).replace(/,"([a-z0-9][^"]*)":\{"version"/g, ',\n"$1":{"version"') + '\n';
if (CHECK) {
    const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
    const strip = x => JSON.stringify({...x, generated: '', branch: ''});
    if (!old || strip(old) !== strip(m)) { console.error('assets/data/manifest.json n’est pas à jour : node scripts/donnees-manifest.js'); process.exit(1); }
    console.log('✓ manifest.json à jour'); process.exit(0);
}
fs.writeFileSync(OUT, text);
console.log(`assets/data/manifest.json : ${Object.keys(m.packs).length} packs, ${Object.values(m.packs).reduce((n, p) => n + Object.keys(p.files).length, 0)} fichiers, ${(fs.statSync(OUT).size / 1024).toFixed(0)} Ko`);
