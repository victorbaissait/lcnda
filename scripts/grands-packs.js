#!/usr/bin/env node
/* 📦 Les grands packs (lots K et L) : ceux qui ne sont PAS livrés avec l'app, mais déposés dans une version GitHub et installés à la
 * demande (Réglages → 🗂 Données, ou le bouton « 📦 Installer (≈ N Mo) » de la page du lot ; lib/grands_packs.php).
 *
 *   node scripts/grands-packs.js <lot> <dossier de sortie>      lot = k ou l
 *
 * Range dans <dossier de sortie> (puis .github/workflows/telech-k.yml / telech-l.yml les déposent dans la version
 * « telech-<lot>-donnees ») :
 *   - lot K : tous les packs par pays tk-patrimoine_<pays> (pas tk-patrimoine_monde, livré) ;
 *   - les deux lots : tout fichier t<lot>-*.json.gz de plus de 3 Mo (la règle des tests : un fichier livré reste petit).
 * Les fichiers sont DÉPLACÉS (ils quittent assets/data : le sommaire assets/data/manifest.json, refait ensuite, ne les compte plus).
 * Le sommaire de la version (telech-<lot>-manifest.json) est complété : les packs déjà en ligne (le fichier téléchargé de la
 * version, s'il est dans le dossier) gardent leur ligne ; ceux d'ici la remplacent.
 *   {"version": "2026-11-27", "packs": {"tk-patrimoine_gb": {"name": "tk-patrimoine_gb.json.gz", "size": N, "sha256": "…", "built": "…",
 *    "rows": N, "licence": "…", "source": "…"}}}
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const MAX_SHIPPED = 3e6; // tests/test-telech-k.js, test-telech-l.js : chaque fichier livré pèse moins de 3 Mo
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'assets', 'data');

/** ce qui part dans la version : la règle, partagée avec les tests */
function isBig(lot, file, size) {
    if (!/^t[kl]-[a-z]+(_[a-z]{2,5})?\.json\.gz$/.test(file) || !file.startsWith(`t${lot}-`)) return false;
    if (lot === 'k' && /^tk-patrimoine_[a-z]{2}\.json\.gz$/.test(file)) return true;
    return size >= MAX_SHIPPED;
}

function entryOf(abs, name) {
    const buf = fs.readFileSync(abs);
    let j = null; try { j = JSON.parse(zlib.gunzipSync(buf).toString('utf8')); } catch (_) {}
    if (!j || !Array.isArray(j.rows)) throw new Error(`${name} : pas un pack lisible (gzip → JSON avec rows)`);
    const str = v => (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim().slice(0, 200);
    return {name, size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), built: str(j.built).slice(0, 10), rows: j.rows.length,
        licence: str(j.licence), source: str(j.source), ...(typeof j.url === 'string' && /^https:\/\//.test(j.url) ? {url: j.url} : {})};
}

function main() {
    const [lot, out] = process.argv.slice(2);
    if (!['k', 'l'].includes(lot) || !out) { console.error('usage : node scripts/grands-packs.js k|l <dossier de sortie>'); process.exit(2); }
    fs.mkdirSync(out, {recursive: true});
    const mf = path.join(out, `telech-${lot}-manifest.json`);
    let m = {version: '', packs: {}};
    try { const old = JSON.parse(fs.readFileSync(mf, 'utf8')); if (old && typeof old.packs === 'object') m = old; } catch (_) {}
    let moved = 0;
    for (const f of fs.readdirSync(DATA).sort()) {
        const abs = path.join(DATA, f); if (!fs.statSync(abs).isFile()) continue;
        if (!isBig(lot, f, fs.statSync(abs).size)) continue;
        const id = f.replace(/\.json\.gz$/, '');
        m.packs[id] = entryOf(abs, f);
        fs.renameSync(abs, path.join(out, f));
        moved++;
        console.log(`${id} : ${(m.packs[id].size / 1e6).toFixed(1)} Mo, ${m.packs[id].rows} lignes → version telech-${lot}-donnees`);
    }
    // une ligne dont le fichier n'est ni ici ni déjà en ligne (le dossier ne contient que ce qui a été téléchargé de la version) reste
    m.version = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(mf, JSON.stringify(m, null, 1) + '\n');
    console.log(`${moved} pack(s) rangé(s) ; sommaire : ${Object.keys(m.packs).length} pack(s) dans ${path.relative(ROOT, mf) || mf}`);
}

if (require.main === module) main();
module.exports = {isBig, entryOf, MAX_SHIPPED};
