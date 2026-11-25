#!/usr/bin/env node
// Écrit la FAQ de l'app dans les deux pages de présentation, et les fichiers pour les moteurs et les IA.
//   node scripts/build-presentation-faq.js           écrit tout
//   node scripts/build-presentation-faq.js --check   vérifie seulement que tout est à jour (sortie 1 sinon)
//
// Source : la liste « const FAQ = [ … ]; » de assets/js/heritage-more.js (Réglages → FAQ / tuto) et sa traduction
// anglaise (assets/i18n/faq/en.json, noms des thèmes dans assets/i18n/en.json, clé « faq|Thème »).
// Ce qui est écrit :
//   - carnet-numerique-des-ancetres.php et carnet-numerique-des-ancetres-en.php, entre <!-- FAQ:DEBUT --> et <!-- FAQ:FIN -->
//     (sommaire des thèmes, puis chaque thème #faq-N et chaque question #q-N-M en <details>), et entre
//     <!-- FAQ-JSONLD:DEBUT --> et <!-- FAQ-JSONLD:FIN --> (données schema.org FAQPage) ; le reste des pages n'est pas touché ;
//   - llms.txt (le résumé du site), llms-full.txt et llms-full-en.txt (toute la FAQ en texte), robots.txt, sitemap.xml.
// Les pages restent sans PHP : elles se lisent telles quelles, même sans JavaScript (la recherche seule en a besoin).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const CHECK = process.argv.includes('--check');

// Adresse publique du dossier des pages (avec « / » à la fin), pour sitemap.xml et robots.txt qui demandent des
// adresses complètes. Vide : sitemap.xml garde des adresses relatives et robots.txt ne le nomme pas.
const SITE_URL = (process.env.LCNDA_SITE_URL || '').trim();
const PAGE_FR = 'carnet-numerique-des-ancetres.php';
const PAGE_EN = 'carnet-numerique-des-ancetres-en.php';
const REPO = 'https://github.com/victorbaissait/lcnda';

// ── La FAQ de l'app ──
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
// La FAQ de l'app écrit certaines touches selon l'ordinateur (navigator) : ici, la version PC.
const FAQ = vm.runInNewContext('(' + literal + ')', Object.assign(Object.create(null), { navigator: { platform: '', userAgent: '' } }), { timeout: 2000 });

// Texte simple : pas de balises ni d'entités HTML, espaces resserrés.
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' };
const plain = (t) => String(t)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(+e.slice(1)) : (entities[e.toLowerCase()] ?? m))
    .replace(/\s+/g, ' ')
    .trim();

// 🇬🇧 La même FAQ en anglais (repère = empreinte de la question française, comme heritage-more.js) ;
// une question pas encore traduite reste en français.
const faqId = q => { let h = 0x811c9dc5; for (const ch of String(q)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36).padStart(7, '0'); };
const pcKeys = t => String(t).replace(/\{mac:([^|{}]*)\|pc:([^{}]*)\}/g, (m, mac, pc) => pc);
const enItems = JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/faq/en.json'), 'utf8')).items || {};
const enDict = JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/en.json'), 'utf8'));
let enMissing = 0;
const groups = {
    fr: FAQ.map(([theme, items]) => [plain(theme), items.map(([q, a]) => [plain(q), plain(a)])]),
    en: FAQ.map(([theme, items]) => [plain(enDict['faq|' + theme] || enDict[theme] || theme), items.map(([q, a]) => {
        const tr = enItems[faqId(q)];
        if (!tr || !tr[0] || !tr[1]) enMissing++;
        return [plain(pcKeys(tr && tr[0] ? tr[0] : q)), plain(pcKeys(tr && tr[1] ? tr[1] : a))];
    })]),
};
const count = groups.fr.reduce((s, g) => s + g[1].length, 0);

// ── Dans les pages ──
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const TXT = {
    fr: { hint: n => `Comment faire ceci ou cela dans LCNDA : ${n} questions.`, empty: 'Aucune question ne correspond à cette recherche.', toc: 'Thèmes de la FAQ', page: PAGE_FR },
    en: { hint: n => `How to do this or that in LCNDA: ${n} questions.`, empty: 'No question matches this search.', toc: 'FAQ topics', page: PAGE_EN },
};
const pad = '                ';
function faqHtml(lang) {
    const t = TXT[lang], g = groups[lang];
    const out = [
        `${pad}<p class="presentation-faq-hint" id="faq-count">${esc(t.hint(count))}</p>`,
        `${pad}<nav class="presentation-faq-toc" aria-label="${esc(t.toc)}">` + g.map(([theme, items], n) => `<a href="#faq-${n}">${esc(theme)} <small>${items.length}</small></a>`).join('') + '</nav>',
        `${pad}<p class="presentation-faq-empty" id="faq-empty" hidden>${esc(t.empty)}</p>`,
        `${pad}<div id="faq-list">`,
    ];
    g.forEach(([theme, items], n) => {
        out.push(`${pad}<div class="presentation-faq-cat" id="faq-${n}"><h3>${esc(theme)}<small>${items.length}</small></h3>`);
        items.forEach(([q, a], m) => out.push(`${pad}<details class="presentation-faq-item" id="q-${n}-${m}"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`));
        out.push(`${pad}</div>`);
    });
    out.push(`${pad}</div>`);
    return out.join('\n');
}
// JSON dans <script> : « < » écrit < (ni </script>, ni « <? » dans la page).
const jsonLd = lang => '    <script type="application/ld+json">' + JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: lang,
    mainEntity: groups[lang].flatMap(([, items]) => items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }))),
}).replace(/</g, '\\u003c') + '</script>';
function between(text, a, b, inner, file) {
    const i = text.indexOf(a), j = text.indexOf(b);
    if (i < 0 || j < i) throw new Error(`${file} : repères ${a} … ${b} introuvables`);
    return text.slice(0, i + a.length) + '\n' + inner + '\n' + text.slice(text.lastIndexOf('\n', j) + 1);
}

const outputs = {};
for (const lang of ['fr', 'en']) {
    const file = TXT[lang].page;
    let page = fs.readFileSync(path.join(root, file), 'utf8');
    page = between(page, '<!-- FAQ:DEBUT -->', '<!-- FAQ:FIN -->', faqHtml(lang), file);
    page = between(page, '<!-- FAQ-JSONLD:DEBUT -->', '<!-- FAQ-JSONLD:FIN -->', jsonLd(lang), file);
    outputs[file] = page;
}

// ── Fichiers pour les IA et les moteurs ──
const app = JSON.parse(outputs[PAGE_FR].match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@type":"SoftwareApplication".*?)<\/script>/)[1]);
const [y, mo, d] = app.datePublished.split('-');
const faqText = (lang) => {
    const head = lang === 'fr'
        ? `# LCNDA — Le Carnet numérique des ancêtres : la FAQ complète\n\n> ${count} questions et réponses, par thème (version ${app.softwareVersion}). Page : ${PAGE_FR}#faq\n`
        : `# LCNDA — The Digital Ancestors' Notebook: the full FAQ\n\n> ${count} questions and answers, by topic (version ${app.softwareVersion}). Page: ${PAGE_EN}#faq\n`;
    return head + groups[lang].map(([theme, items]) => `\n## ${theme}\n` + items.map(([q, a]) => `\n### ${q}\n\n${a}\n`).join('')).join('') ;
};
outputs['llms-full.txt'] = faqText('fr');
outputs['llms-full-en.txt'] = faqText('en');
outputs['llms.txt'] = `# LCNDA — Le Carnet numérique des ancêtres

> Application de généalogie gratuite (AGPL-3.0) qui fonctionne sur l'ordinateur, sans compte ni nuage :
> fiches, sources, arbres, cartes, transcription des actes (aussi par une IA locale), successions. 32 langues.
> (English: a free genealogy app that runs on your own computer, with no account and no cloud.)

## L'essentiel

- [Présentation et téléchargement](${PAGE_FR}) : version ${app.softwareVersion} du ${d}/${mo}/${y}, macOS, Windows, Linux
- [Nouveautés de chaque version](${PAGE_FR}#v${app.softwareVersion.replace(/\./g, '-')}) : une fiche par version (date, en bref, le détail)
- [FAQ complète, en texte](llms-full.txt) : ${count} questions et réponses, par thème

## English

- [Presentation and download](${PAGE_EN})
- [Full FAQ, as text](llms-full-en.txt) : ${count} questions and answers, by topic

## Optionnel

- [Code source](${REPO})
- [Notes de version](${REPO}/tree/HEAD/release-notes)
`;
const url = p => SITE_URL + p;
const lastmod = app.datePublished;
outputs['sitemap.xml'] = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${[PAGE_FR, PAGE_EN].map(p => `  <url>
    <loc>${url(p)}</loc>
    <lastmod>${lastmod}</lastmod>
    <xhtml:link rel="alternate" hreflang="fr" href="${url(PAGE_FR)}"/>
    <xhtml:link rel="alternate" hreflang="en" href="${url(PAGE_EN)}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${url(PAGE_FR)}"/>
  </url>`).join('\n')}
${['llms.txt', 'llms-full.txt', 'llms-full-en.txt'].map(p => `  <url>
    <loc>${url(p)}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`).join('\n')}
</urlset>
`;
outputs['robots.txt'] = `# LCNDA : tout peut être lu, par les moteurs de recherche comme par les assistants IA.
User-agent: *
Allow: /
${SITE_URL ? `\nSitemap: ${url('sitemap.xml')}\n` : '\n# Sitemap : sitemap.xml, à côté de cette page (adresse complète : LCNDA_SITE_URL=https://… node scripts/build-presentation-faq.js)\n'}`;

// ── Écrire (ou vérifier) ──
let stale = [];
for (const [file, text] of Object.entries(outputs)) {
    const p = path.join(root, file);
    const old = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    if (old === text) continue;
    stale.push(file);
    if (!CHECK) fs.writeFileSync(p, text);
}
if (CHECK) {
    if (stale.length) { console.error('Pas à jour (lance node scripts/build-presentation-faq.js) : ' + stale.join(', ')); process.exit(1); }
    console.log(`FAQ de la page de présentation à jour : ${count} questions.`);
} else {
    if (enMissing) console.warn(`page anglaise : ${enMissing} question(s) encore en français`);
    console.log(`FAQ écrite dans ${PAGE_FR} et ${PAGE_EN} : ${FAQ.length} thèmes, ${count} questions.` + (stale.length ? ` Mis à jour : ${stale.join(', ')}.` : ' Rien à changer.'));
    groups.fr.forEach(([theme, items]) => console.log(`  ${theme} : ${items.length}`));
}
module.exports = { groups, count };
