#!/usr/bin/env node
// Fabrique faq-data.js (la FAQ de la page de présentation) à partir de la FAQ de l'app.
//   node scripts/build-faq-data.js
// Source : la liste « const FAQ = [ … ]; » de assets/js/heritage-more.js (Maintenance → FAQ / tuto),
// mêmes thèmes, mêmes questions, mêmes réponses, en texte simple.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/js/heritage-more.js'), 'utf8');

// Trouve « const FAQ = [ » puis le crochet fermant qui lui répond (en sautant les textes entre guillemets).
const start = source.indexOf('const FAQ = [');
if (start < 0) throw new Error('« const FAQ = [ » introuvable dans heritage-more.js');
let i = source.indexOf('[', start), depth = 0, quote = null;
for (; i < source.length; i++) {
    const c = source[i];
    if (quote) {
        if (c === '\\') { i++; continue; }
        if (c === quote) quote = null;
        continue;
    }
    if (c === '\'' || c === '"' || c === '`') { quote = c; continue; }
    if (c === '[') depth++;
    else if (c === ']' && --depth === 0) break;
}
const literal = source.slice(source.indexOf('[', start), i + 1);
const FAQ = vm.runInNewContext('(' + literal + ')', Object.create(null), { timeout: 2000 });

// Texte simple : pas de balises ni d'entités HTML, espaces resserrés.
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' };
const plain = (t) => String(t)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(+e.slice(1)) : (entities[e.toLowerCase()] ?? m))
    .replace(/\s+/g, ' ')
    .trim();
const js = (t) => '\'' + plain(t).replace(/\\/g, '\\\\').replace(/'/g, '\\\'') + '\'';

let count = 0;
const groups = FAQ.map(([theme, items]) => {
    const rows = items.map(([q, a]) => { count++; return `            [${js(q)}, ${js(a)}],`; });
    return `        [${js(theme)}, [\n${rows.join('\n')}\n        ]],`;
});
const out = `// FAQ du site LCNDA — à placer dans le même dossier que index.html.
// Format : [ 'Thème', [ ['Question', 'Réponse'], ... ] ]
// Fabriqué par scripts/build-faq-data.js à partir de la FAQ de l'app (assets/js/heritage-more.js) : ne pas modifier à la main.
const FAQ = [
${groups.join('\n')}
    ];
`;

// Vérification : le fichier produit doit se relire et redonner le même nombre de questions.
const check = vm.runInNewContext(out + ';this.n = FAQ.reduce((s, g) => s + g[1].length, 0);', {});
if (check !== count) throw new Error('faq-data.js ne se relit pas correctement');

fs.writeFileSync(path.join(root, 'faq-data.js'), out);
console.log(`faq-data.js : ${FAQ.length} thèmes, ${count} questions.`);
FAQ.forEach(([theme, items]) => console.log(`  ${theme} : ${items.length}`));
