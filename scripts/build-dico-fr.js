#!/usr/bin/env node
'use strict';
/**
 * Fabrique le dictionnaire général du français des « 🪄 Corrections proposées » : assets/dico/fr-mots.txt.gz
 *   node scripts/build-dico-fr.js [chemin/vers/an-array-of-french-words/index.json]
 *
 * Source : le paquet npm « an-array-of-french-words » (~336 000 mots, licence MIT, © 2016 Zeke Sikelianos, d'après la liste
 * de mots de Letterpress). Il n'est PAS une dépendance de l'app : on le récupère seulement pour fabriquer ce fichier
 * (par ex. « npm pack an-array-of-french-words && tar xzf an-array-of-french-words-*.tgz », puis le chemin de package/index.json).
 *
 * Format (compact, lu par assets/js/app-htr-correction.js) : gzip d'un texte UTF-8 ; les lignes qui commencent par « # » sont
 * des commentaires (licence) ; ensuite un mot par ligne, triés, en « codage par préfixe » : le premier caractère dit combien
 * de lettres reprendre du mot précédent (caractère de code 48 + n, n ≤ 35), le reste est la fin du mot.
 * Les mots composés (avec un trait d'union) sont laissés de côté : le texte est coupé aux traits d'union avant la recherche.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const src = process.argv[2] || (() => { try { return require.resolve('an-array-of-french-words/index.json'); } catch (_) { return ''; } })();
if (!src || !fs.existsSync(src)) { console.error('Donne le chemin de an-array-of-french-words/index.json (voir l’en-tête de ce script).'); process.exit(1); }
const all = JSON.parse(fs.readFileSync(src, 'utf8'));
let version = '?'; try { version = JSON.parse(fs.readFileSync(path.join(path.dirname(src), 'package.json'), 'utf8')).version; } catch (_) {}
const words = [...new Set(all.map(w => String(w).trim().toLowerCase()).filter(w => w && !/[-\s'’0-9]/.test(w)))].sort();
const lines = [
    '# LCNDA — dictionnaire général du français pour les corrections proposées (assets/js/app-htr-correction.js).',
    `# Source : an-array-of-french-words ${version} (https://github.com/words/an-array-of-french-words), d'après la liste de mots de Letterpress.`,
    '# Licence MIT — Copyright (c) 2016 Zeke Sikelianos. Permission is hereby granted, free of charge, to any person obtaining a copy of this',
    '# software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation',
    '# the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom',
    '# the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be',
    '# included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
    '# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT',
    '# SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR',
    '# OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.',
    '# Format : un mot par ligne, codé par préfixe (1er caractère = 48 + lettres reprises du mot précédent). Fabriqué par scripts/build-dico-fr.js.',
];
let prev = '';
for (const w of words) { let i = 0; while (i < 35 && i < prev.length && i < w.length && prev[i] === w[i]) i++; lines.push(String.fromCharCode(48 + i) + w.slice(i)); prev = w; }
const out = path.join(__dirname, '..', 'assets', 'dico', 'fr-mots.txt.gz');
fs.mkdirSync(path.dirname(out), { recursive: true });
const gz = zlib.gzipSync(Buffer.from(lines.join('\n') + '\n', 'utf8'), { level: 9 });
fs.writeFileSync(out, gz);
console.log(`${words.length} mots → ${path.relative(process.cwd(), out)} (${(gz.length / 1024).toFixed(0)} Ko)`);
