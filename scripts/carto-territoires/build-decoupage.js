#!/usr/bin/env node
/* 🧩 Territoires à partir de communes — le découpage des communes (arrondissement, canton) pour « toutes les communes de… ».
 * Source : INSEE, Code officiel géographique (COG) 2025 — Licence Ouverte / Open Licence (Etalab 2.0).
 *   https://www.insee.fr/fr/information/8377252 (fichiers v_commune_2025.csv, v_arrondissement_2025.csv, v_canton_2025.csv, v_departement_2025.csv,
 *   v_mvt_commune_2025.csv)
 * Même millésime que les noms des communes de assets/data/geo/fr-communes.json.gz (les tracés, eux, viennent de là).
 *   node scripts/carto-territoires/build-decoupage.js DOSSIER_DES_CSV
 * Sortie : assets/data/communes-decoupage.json.gz = {v, attr, licence, url, dep:{code:nom}, arr:{code:nom}, can:{code:nom}, c:{insee:[arr, can]},
 *   succ:{ancien code: code d'aujourd'hui}}   (succ : une commune fusionnée → celle qui l'a reprise ; les tracés de 2018 en gardent encore)
 */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const dir = process.argv[2]; if (!dir) { console.error('usage : build-decoupage.js DOSSIER_DES_CSV'); process.exit(1); }
const csv = f => { const t = fs.readFileSync(path.join(dir, f), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
    const row = l => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
    const h = row(t[0]); return t.slice(1).map(l => { const r = row(l), o = {}; h.forEach((k, i) => { o[k] = r[i] ?? ''; }); return o; }); };
const dep = {}, arr = {}, can = {}, c = {};
csv('v_departement_2025.csv').forEach(r => { dep[r.DEP] = r.LIBELLE; });
csv('v_arrondissement_2025.csv').forEach(r => { arr[r.ARR] = r.LIBELLE; });
csv('v_canton_2025.csv').forEach(r => { if (r.TYPECT === 'C' || r.TYPECT === 'V') can[r.CAN] = r.LIBELLE; });
csv('v_commune_2025.csv').forEach(r => { if (r.TYPECOM !== 'COM') return; c[r.COM] = [r.ARR || '', can[r.CAN] ? r.CAN : '']; });
// les communes fusionnées (ou devenues déléguées) → la commune d'aujourd'hui, en suivant les changements
const now = new Set(Object.keys(c)), parent = {}, next = {};
csv('v_commune_2025.csv').forEach(r => { if (r.TYPECOM !== 'COM' && r.COMPARENT) parent[r.COM] = r.COMPARENT; });
csv('v_mvt_commune_2025.csv').forEach(r => { if (r.TYPECOM_AV === 'COM' && r.COM_AV !== r.COM_AP && r.COM_AP && (!next[r.COM_AV] || r.DATE_EFF > next[r.COM_AV][1])) next[r.COM_AV] = [r.COM_AP, r.DATE_EFF]; });
const succ = {};
Object.keys(next).forEach(k => { if (now.has(k)) return; let x = k, guard = 0; while (!now.has(x) && guard++ < 20) x = next[x]?.[0] || parent[x] || x; if (now.has(x) && x !== k) succ[k] = x; });
const out = {v: 1, succ, attr: 'INSEE, Code officiel géographique 2025', licence: 'Licence Ouverte / Open Licence (Etalab 2.0)', url: 'https://www.insee.fr/fr/information/8377252', dep, arr, can, c};
const dest = path.join(__dirname, '../../assets/data/communes-decoupage.json.gz');
fs.writeFileSync(dest, zlib.gzipSync(JSON.stringify(out), {level: 9}));
console.log(`${Object.keys(c).length} communes, ${Object.keys(succ).length} anciennes, ${Object.keys(arr).length} arrondissements, ${Object.keys(can).length} cantons → ${dest} (${fs.statSync(dest).size} octets)`);
