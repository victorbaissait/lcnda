/**
 * 🌐 Mon site web — les blocs (en-tête, menu, texte, image, galerie, citation, contact, pied de page ; et ceux de la
 * généalogie : arbre, fiche, frise, carte, chiffres, photos d'une personne, gens d'un lieu), les modèles de sites
 * (« Ma famille », « Mon ancêtre », « Mon village », « Portfolio d'artiste », « Page vide »), la feuille de styles de départ
 * et le petit script « pont » posé dans l'aperçu isolé (il montre ce qu'on survole, dit à l'éditeur ce qu'on a cliqué,
 * rend le texte modifiable, reçoit les blocs glissés).
 * Chaque bloc a un nom (data-lc-name) et une classe : l'éditeur les montre (« Ceci est : header.site-entete »).
 * Les blocs de la généalogie sont des <div data-lc-block="tree" data-person="12"> vides : lib/website.php les remplit
 * (aperçu) et les fige à l'export, sans personne vivante ni fiche confidentielle.
 * L'éditeur : assets/js/heritage-site-web.js (window.LCNDA_EXT.siteKit).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const PK = () => window.LCNDA_PICKER || A();
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const year = new Date().getFullYear();
    const pickPerson = async (title = 'Quelle personne ?') => { const it = await PK().openPicker?.({kind: 'person', title}); return it ? {id: Number(it.id), name: String(it.title || it.label || it.name || '').trim()} : null; };
    const pickPlace = async (title = 'Quel lieu ?') => { const it = await PK().openPicker?.({kind: 'place', title}); return it && Number(it.id) > 0 ? {id: Number(it.id), name: String(it.title || it.label || it.name || '').trim()} : null; };
    /** le fond de carte de l'app (Réglages → Cartes et fonds de carte), sinon Voyager */
    const defaultFond = () => { try { const v = A()?.mapBackgroundValue?.(A()?.readDesignSettings?.()?.mapBackground); return /^[a-z0-9_]{1,30}$/.test(v || '') && v !== 'offline' ? v : 'voyager'; } catch (_) { return 'voyager'; } };
    /** un diagramme : un des miens (menu de choix, sorte « diagramme »), ou un nouveau (l'éditeur de diagrammes) → {id, name} */
    const pickDiagram = () => new Promise(resolve => {
        let done = false; const end = v => { if (!done) { done = true; resolve(v); } };
        ext.openDialog({eyebrow: 'MON SITE WEB', title: '🏛️ Quel diagramme ?', submitLabel: 'Fermer',
            body: '<div class="sw-tpls"><button type="button" class="sw-tpl" data-dg-way="pick"><span class="sw-tpl-ico" aria-hidden="true">🔍</span><b>Un de mes diagrammes</b><small>Graphiques → Mes diagrammes</small></button><button type="button" class="sw-tpl" data-dg-way="new"><span class="sw-tpl-ico" aria-hidden="true">＋</span><b>Créer un diagramme</b><small>Hémicycle, frise, barres, camembert… avec tes données ou celles de l’app</small></button></div>',
            onOpen: d => {
                d.addEventListener('close', () => setTimeout(() => end(null), 0));
                d.addEventListener('click', async e => {
                    const b = e.target.closest('[data-dg-way]'); if (!b) return; done = true; d.close();
                    if (b.dataset.dgWay === 'pick') { const it = await PK().openPicker?.({kind: 'diagram', title: 'Quel diagramme ?'}); resolve(it ? {id: Number(it.id), name: String(it.title || 'Diagramme')} : null); return; }
                    if (!ext.openDiagramEditor) { resolve(null); return; }
                    let saved = 0; await ext.openDiagramEditor(null, {onSave: id => { saved = Number(id) || saved; }, onClose: () => resolve(saved ? {id: saved, name: 'Mon diagramme'} : null)});
                });
            }, onSubmit: () => {}});
    });
    const mediaSrc = m => `media/${encodeURIComponent(m.filename || m.file || '')}`;
    const pickImages = async (multiple, title) => { const r = await PK().openMediaPicker?.({types: ['image'], multiple, title, okLabel: multiple ? 'Utiliser ces images' : 'Utiliser cette image'}); if (!r) return null; return (Array.isArray(r) ? r : [r]).filter(m => m && (m.filename || m.file)); };
    const section = (name, inner, cls = 'section') => `<section class="${cls}" data-lc-name="${esc(name)}">\n  <div class="conteneur">\n${inner}\n  </div>\n</section>`;
    const geneaBlock = (kind, attrs, name, title) => section(name, `    <h2>${esc(title)}</h2>\n    <div class="lc-bloc" data-lc-block="${kind}"${Object.entries(attrs).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('')} data-lc-name="${esc(name)}"></div>`);

    /* ═════ La feuille de styles de départ (dans l'onglet CSS : on peut tout changer) ═════ */
    const BASE_CSS = `/* La feuille de styles de ton site. Les couleurs et polices viennent de l’onglet 🎨 Styles :
   var(--lc-principale), var(--lc-accent), var(--lc-fond), var(--lc-texte), var(--lc-police), var(--lc-police-titres),
   var(--lc-largeur), var(--lc-arrondi), var(--lc-taille). */
* { box-sizing: border-box; }
body { margin: 0; font-family: var(--lc-police); font-size: var(--lc-taille); line-height: 1.6; color: var(--lc-texte); background: var(--lc-fond); }
img { max-width: 100%; height: auto; }
h1, h2, h3 { font-family: var(--lc-police-titres); line-height: 1.2; color: var(--lc-principale); }
a { color: var(--lc-principale); }
.conteneur { max-width: var(--lc-largeur); margin: 0 auto; padding: 0 20px; }
.site-entete { background: var(--lc-principale); color: #fff; padding: 16px 0; }
.site-entete .conteneur { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.site-nom { font-family: var(--lc-police-titres); font-size: 1.5em; font-weight: 700; color: #fff; text-decoration: none; }
.site-menu .lc-menu-list a { color: #fff; }
.bandeau { padding: 72px 0; text-align: center; background: linear-gradient(135deg, var(--lc-fond), color-mix(in srgb, var(--lc-accent) 25%, var(--lc-fond))); }
.bandeau h1 { font-size: 2.6em; margin: 0 0 .3em; }
.bandeau p { font-size: 1.2em; margin: 0 auto; max-width: 40em; }
.section { padding: 40px 0; }
.colonnes { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 24px; }
.carte { background: #fff; border-radius: var(--lc-arrondi); padding: 20px; box-shadow: 0 2px 12px rgba(0, 0, 0, .07); }
.image { margin: 0; }
.image img { border-radius: var(--lc-arrondi); display: block; }
.image figcaption { color: #6b625b; font-size: .9em; margin-top: .4em; }
.galerie { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.galerie figure { margin: 0; }
.galerie img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: var(--lc-arrondi); display: block; }
.galerie figcaption { font-size: .85em; color: #6b625b; }
.citation { margin: 0; padding: 18px 24px; border-left: 5px solid var(--lc-accent); background: rgba(255, 255, 255, .6); font-size: 1.2em; font-style: italic; }
.citation cite { display: block; margin-top: .5em; font-size: .8em; font-style: normal; color: #6b625b; }
.bouton { display: inline-block; padding: 10px 20px; border-radius: var(--lc-arrondi); background: var(--lc-principale); color: #fff; text-decoration: none; font-weight: 700; }
.site-pied { background: #2b2420; color: #eee; padding: 24px 0; text-align: center; font-size: .9em; }
.site-pied a { color: #fff; }
@media (max-width: 640px) {
  .bandeau { padding: 44px 0; }
  .bandeau h1 { font-size: 1.9em; }
  .site-entete .conteneur { flex-direction: column; align-items: flex-start; }
}
`;

    /* ═════ Les blocs ═════ */
    const BLOCKS = [
        {key: 'header', group: 'page', icon: '🔝', label: 'En-tête', hint: 'Le nom du site et le menu', html: ctx => `<header class="site-entete" data-lc-name="En-tête">\n  <div class="conteneur">\n    <a class="site-nom" href="index.html">${esc(ctx.title || 'Mon site')}</a>\n    <nav class="site-menu" data-lc-block="menu" data-lc-name="Menu"></nav>\n  </div>\n</header>`},
        {key: 'menu', group: 'page', icon: '☰', label: 'Menu', hint: 'Les liens vers les pages, tenus à jour', html: () => `<nav class="site-menu" data-lc-block="menu" data-lc-name="Menu"></nav>`},
        {key: 'hero', group: 'page', icon: '🌅', label: 'Bandeau', hint: 'Un grand titre et une phrase', html: ctx => `<section class="bandeau" data-lc-name="Bandeau">\n  <div class="conteneur">\n    <h1>${esc(ctx.title || 'Bienvenue')}</h1>\n    <p>Une phrase pour dire de quoi parle ce site.</p>\n  </div>\n</section>`},
        {key: 'text', group: 'page', icon: '¶', label: 'Texte', hint: 'Un titre et un paragraphe', html: () => section('Texte', '    <h2>Un titre</h2>\n    <p>Écris ton texte ici : clique sur « T Écrire » puis dans le texte.</p>')},
        {key: 'cols', group: 'page', icon: '▥', label: 'Trois colonnes', hint: 'Trois cartes côte à côte (une seule sur téléphone)', html: () => section('Colonnes', `    <div class="colonnes">\n${[1, 2, 3].map(k => `      <div class="carte" data-lc-name="Carte ${k}">\n        <h3>Titre ${k}</h3>\n        <p>Quelques mots…</p>\n      </div>`).join('\n')}\n    </div>`)},
        {key: 'quote', group: 'page', icon: '❝', label: 'Citation', hint: 'Une phrase mise en valeur', html: () => section('Citation', '    <blockquote class="citation">\n      <p>« Ceux qui ne savent pas d’où ils viennent ne savent pas où ils vont. »</p>\n      <cite>— proverbe</cite>\n    </blockquote>')},
        {key: 'contact', group: 'page', icon: '✉', label: 'Contact', hint: 'Un bouton pour écrire un courriel', html: () => section('Contact', '    <h2>Nous écrire</h2>\n    <p>Une question, une photo, un souvenir à partager ?</p>\n    <p><a class="bouton" href="mailto:prenom.nom@exemple.fr">✉ Écrire un message</a></p>', 'section contact')},
        {key: 'footer', group: 'page', icon: '🔚', label: 'Pied de page', hint: 'En bas de chaque page', html: ctx => `<footer class="site-pied" data-lc-name="Pied de page">\n  <div class="conteneur">\n    <p>© ${year} ${esc(ctx.title || 'Mon site')} — fait avec LCNDA</p>\n  </div>\n</footer>`},
        {key: 'image', group: 'img', icon: '🖼', label: 'Image', hint: 'Une image de tes médias', ask: async () => { const l = await pickImages(false, 'L’image du site'); return l?.[0] ? {m: l[0]} : null; },
            html: (ctx, o) => section('Image', `    <figure class="image" data-lc-name="Image">\n      <img src="${esc(mediaSrc(o.m))}" alt="${esc(o.m.title || '')}">\n      <figcaption>${esc(o.m.title || '')}</figcaption>\n    </figure>`)},
        {key: 'gallery', group: 'img', icon: '🗂', label: 'Galerie', hint: 'Plusieurs images en vignettes', ask: async () => { const l = await pickImages(true, 'Les images de la galerie'); return l?.length ? {list: l} : null; },
            html: (ctx, o) => section('Galerie', `    <h2>Photos</h2>\n    <div class="galerie" data-lc-name="Galerie">\n${o.list.map(m => `      <figure>\n        <img src="${esc(mediaSrc(m))}" alt="${esc(m.title || '')}" loading="lazy">\n        <figcaption>${esc(m.title || '')}</figcaption>\n      </figure>`).join('\n')}\n    </div>`)},
        {key: 'tree', group: 'genea', icon: '🌳', label: 'Arbre', hint: 'Les ancêtres d’une personne (2 à 5 générations)', ask: async () => { const p = await pickPerson('L’arbre de qui ?'); return p && {p}; },
            html: (ctx, o) => geneaBlock('tree', {person: o.p.id, gens: 4}, `Arbre de ${o.p.name}`, `L’arbre de ${o.p.name}`)},
        {key: 'person', group: 'genea', icon: '👤', label: 'Fiche', hint: 'Naissance, décès, parents, événements', ask: async () => { const p = await pickPerson('La fiche de qui ?'); return p && {p}; },
            html: (ctx, o) => geneaBlock('person', {person: o.p.id}, `Fiche de ${o.p.name}`, o.p.name)},
        {key: 'timeline', group: 'genea', icon: '📅', label: 'Frise', hint: 'Sa vie, année par année', ask: async () => { const p = await pickPerson('La frise de qui ?'); return p && {p}; },
            html: (ctx, o) => geneaBlock('timeline', {person: o.p.id}, `Frise de ${o.p.name}`, `La vie de ${o.p.name}`)},
        {key: 'map', group: 'genea', icon: '🗺', label: 'Carte', hint: 'Les lieux d’une personne (ou de ses ancêtres)', ask: async () => { const p = await pickPerson('La carte de qui ?'); return p && {p}; },
            html: (ctx, o) => geneaBlock('map', {person: o.p.id, scope: 'ancestors', gens: 6, fond: defaultFond(), vive: 0}, `Carte de ${o.p.name}`, `Les lieux de ${o.p.name} et de ses ancêtres`)},
        {key: 'diagram', group: 'genea', icon: '🏛️', label: 'Diagramme', hint: 'Un de tes diagrammes (Graphiques → Mes diagrammes), ou un nouveau ; redessiné à chaque ouverture, figé à l’export', ask: async () => { const d = await pickDiagram(); return d && {d}; },
            html: (ctx, o) => geneaBlock('diagram', {diagram: o.d.id}, `Diagramme ${o.d.name}`, o.d.name)},
        {key: 'chart', group: 'genea', icon: '📊', label: 'Chiffres', hint: 'Naissances par décennie, prénoms les plus portés', html: () => geneaBlock('chart', {chart: 'naissances'}, 'Chiffres de la famille', 'La famille en chiffres')},
        {key: 'photos', group: 'genea', icon: '📷', label: 'Photos d’une personne', hint: 'Ses photos publiables, toutes seules', ask: async () => { const p = await pickPerson('Les photos de qui ?'); return p && {p}; },
            html: (ctx, o) => geneaBlock('photos', {person: o.p.id, max: 12}, `Photos de ${o.p.name}`, `Les photos de ${o.p.name}`)},
        {key: 'place', group: 'genea', icon: '📍', label: 'Gens d’un lieu', hint: 'Qui est né, s’est marié ou est mort là', ask: async () => { const p = await pickPlace('Quel village, quelle ville ?'); return p && {p}; },
            html: (ctx, o) => geneaBlock('place', {place: o.p.id}, `Gens de ${o.p.name}`, `Les nôtres à ${o.p.name}`)},
    ];
    const GROUPS = [['page', 'La page'], ['img', 'Images'], ['genea', 'Ma généalogie (rempli tout seul)']];

    /* ═════ Les modèles de sites ═════ */
    const theme = (o = {}) => ({primary: '#7a2a2a', accent: '#c8a45c', bg: '#fbf8f3', text: '#2b2420', font: 'Georgia', headFont: 'Georgia', width: 1100, radius: 8, size: 17, ...o});
    const page = (name, slug, parts) => ({name, slug, html: parts.join('\n\n') + '\n', title: '', desc: ''});
    const B = key => BLOCKS.find(b => b.key === key);
    const H = (key, ctx, o) => B(key).html(ctx, o);
    const rootPerson = async () => {
        const id = Number(A()?.sosaRootId?.() || A()?.state?.bootstrap?.startPersonId || 0);
        if (id) { try { const r = await A().api('person', {id}); const p = r.person || r; const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim(); if (name) return {id, name}; } catch (_) {} }
        return pickPerson('De quelle famille parle le site ? (la personne de départ)');
    };
    const TEMPLATES = [
        {key: 'blank', icon: '⬜', name: 'Page vide', hint: 'Un en-tête, un texte, un pied de page : à toi de jouer', make: async () => {
            const ctx = {title: 'Mon site'};
            return {settings: {title: 'Mon site', tpl: 'blank'}, theme: theme(), css: BASE_CSS, js: '', pages: [page('Accueil', 'index', [H('header', ctx), H('text', ctx), H('footer', ctx)])]};
        }},
        {key: 'famille', icon: '👪', name: 'Ma famille', hint: 'Accueil, notre arbre, la famille en chiffres, nous écrire', make: async () => {
            const p = await rootPerson(); if (!p) return null;
            const last = p.name.split(/\s+/).pop(); const title = `La famille ${last}`; const ctx = {title};
            return {settings: {title, tpl: 'famille', desc: `Le site de la famille ${last} : son histoire, son arbre, ses photos.`}, theme: theme(), css: BASE_CSS, js: '', pages: [
                page('Accueil', 'index', [H('header', ctx), H('hero', ctx).replace('Une phrase pour dire de quoi parle ce site.', `Notre histoire, nos ancêtres, nos photos : bienvenue chez les ${last}.`), H('text', ctx).replace('Un titre', 'Notre histoire'), H('chart', ctx), H('footer', ctx)]),
                page('Notre arbre', 'arbre', [H('header', ctx), H('tree', ctx, {p}), H('footer', ctx)]),
                page('Photos', 'photos', [H('header', ctx), H('photos', ctx, {p}), H('footer', ctx)]),
                page('Nous écrire', 'contact', [H('header', ctx), H('contact', ctx), H('footer', ctx)]),
            ]};
        }},
        {key: 'ancetre', icon: '🧓', name: 'Mon ancêtre', hint: 'Sa fiche, sa vie en frise, son arbre, ses lieux, ses photos', make: async () => {
            const p = await pickPerson('Quel ancêtre ?'); if (!p) return null;
            const title = p.name; const ctx = {title};
            return {settings: {title, tpl: 'ancetre', desc: `La vie de ${p.name}.`}, theme: theme({primary: '#2f4f6f', accent: '#b98b4e', bg: '#f7f5f0'}), css: BASE_CSS, js: '', pages: [
                page('Sa vie', 'index', [H('header', ctx), H('hero', ctx).replace('Une phrase pour dire de quoi parle ce site.', 'Ce que nous savons de sa vie, acte après acte.'), H('person', ctx, {p}), H('timeline', ctx, {p}), H('footer', ctx)]),
                page('Son arbre', 'arbre', [H('header', ctx), H('tree', ctx, {p}), H('footer', ctx)]),
                page('Ses lieux', 'lieux', [H('header', ctx), H('map', ctx, {p}), H('footer', ctx)]),
                page('Photos', 'photos', [H('header', ctx), H('photos', ctx, {p}), H('footer', ctx)]),
            ]};
        }},
        {key: 'village', icon: '🏘', name: 'Mon village', hint: 'Le village, son histoire, les familles qui y ont vécu', make: async () => {
            const pl = await pickPlace('Quel village ?'); if (!pl) return null;
            const name = pl.name.split(',')[0].trim(); const title = name; const ctx = {title};
            return {settings: {title, tpl: 'village', desc: `${name} : son histoire et ses familles.`}, theme: theme({primary: '#3d5a2a', accent: '#c9a227', bg: '#f8f7f1'}), css: BASE_CSS, js: '', pages: [
                page('Le village', 'index', [H('header', ctx), H('hero', ctx).replace('Une phrase pour dire de quoi parle ce site.', `L’histoire de ${name} et des familles qui y ont vécu.`), H('text', ctx).replace('Un titre', `${name} autrefois`), H('place', ctx, {p: pl}), H('footer', ctx)]),
                page('Son histoire', 'histoire', [H('header', ctx), H('text', ctx).replace('Un titre', 'Les grandes dates'), H('quote', ctx), H('footer', ctx)]),
                page('Nous écrire', 'contact', [H('header', ctx), H('contact', ctx), H('footer', ctx)]),
            ]};
        }},
        {key: 'artiste', icon: '🎨', name: 'Portfolio d’artiste', hint: 'Présentation, œuvres en galerie, expositions, contact', make: async () => {
            const title = 'Mon atelier'; const ctx = {title};
            return {settings: {title, tpl: 'artiste', desc: 'Peintures, dessins, sculptures : le portfolio de l’atelier.'}, theme: theme({primary: '#1f1f1f', accent: '#d4553a', bg: '#faf9f7', text: '#1f1f1f', font: 'Helvetica Neue', headFont: 'Didot', radius: 2}), css: BASE_CSS, js: '', pages: [
                page('Accueil', 'index', [H('header', ctx), H('hero', ctx).replace('Une phrase pour dire de quoi parle ce site.', 'Peintures, dessins et carnets de voyage.'), H('cols', ctx).replace('Titre 1', 'Peinture').replace('Titre 2', 'Dessin').replace('Titre 3', 'Carnets'), H('footer', ctx)]),
                page('Œuvres', 'oeuvres', [H('header', ctx), H('text', ctx).replace('Un titre', 'Les œuvres').replace('Écris ton texte ici : clique sur « T Écrire » puis dans le texte.', 'Ajoute une galerie : panneau ＋ Blocs → 🗂 Galerie.'), H('footer', ctx)]),
                page('Expositions', 'expositions', [H('header', ctx), section('Expositions', `    <h2>Expositions</h2>\n    <ul>\n      <li><b>${year}</b> — Galerie du Port, Bordeaux</li>\n      <li><b>${year - 1}</b> — Salon d’automne</li>\n    </ul>`), H('footer', ctx)]),
                page('Contact', 'contact', [H('header', ctx), H('contact', ctx), H('footer', ctx)]),
            ]};
        }},
    ];

    /* ═════ Le DOM d'une page, hors de l'app (DOMParser : rien ne s'exécute) ═════ */
    const parse = html => new DOMParser().parseFromString(`<!doctype html><html><head></head><body>${html}</body></html>`, 'text/html');
    const elByPath = (doc, path) => { let el = doc.body; for (const k of path || []) { el = el?.children?.[k]; if (!el) return null; } return el; };
    const pathOf = el => { const p = []; while (el && el.parentElement && el.tagName !== 'BODY') { p.unshift([...el.parentElement.children].indexOf(el)); el = el.parentElement; } return p; };
    const blockAttrs = el => { const o = {kind: el.getAttribute('data-lc-block') || ''}; [...el.attributes].forEach(a => { const m = /^data-([a-z][a-z0-9-]*)$/.exec(a.name); if (m && m[1] !== 'lc-block' && m[1] !== 'lc-name') o[m[1]] = a.value; }); return o; };
    const blockKey = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));
    /** où poser un bloc : après l'élément choisi (remonté jusqu'au corps ou au <main>), sinon avant le pied de page, sinon à la fin */
    function insertHtml(html, blockHtml, {path = null, where = 'after'} = {}) {
        const doc = parse(html);
        const tpl = doc.createElement('template'); tpl.innerHTML = `\n\n${blockHtml}${where === 'before' ? '\n\n' : ''}`;
        const first = tpl.content.firstElementChild;
        let ref = path ? elByPath(doc, path) : null;
        while (ref && ref.parentElement && !/^(BODY|MAIN)$/.test(ref.parentElement.tagName)) ref = ref.parentElement;
        if (ref && ref.parentElement) ref.parentElement.insertBefore(tpl.content, where === 'before' ? ref : ref.nextSibling);
        else { const foot = [...doc.body.children].reverse().find(e => e.tagName === 'FOOTER'); if (foot) { tpl.innerHTML = `${blockHtml}\n\n`; const f2 = tpl.content.firstElementChild; doc.body.insertBefore(tpl.content, foot); return {html: doc.body.innerHTML, path: f2 ? pathOf(f2) : null}; } doc.body.appendChild(tpl.content); }
        return {html: doc.body.innerHTML, path: first ? pathOf(first) : null};
    }

    /* ═════ Le pont : le script posé dans l'aperçu isolé (iframe sandbox, origine opaque) ═════ */
    // Il ne voit que le site ; il parle à l'éditeur par postMessage ; l'éditeur vérifie que le message vient bien de l'aperçu.
    const BRIDGE = String.raw`(function(){'use strict';
var mode='select',sel=null,edit=null,hov=null,T=0,dropAt=null,mv=null,skipClick=false;var H=document.documentElement,B=document.body;
var ov=document.createElement('div');ov.id='lcb-ov';ov.innerHTML='<div class="lcb-hov"><span></span></div><div class="lcb-sel"><span></span></div><div class="lcb-drop"></div>';H.appendChild(ov);
var bh=ov.children[0],bs=ov.children[1],bd=ov.children[2];
function send(m){m.lcSite=1;try{parent.postMessage(m,'*');}catch(e){}}
function path(el){var p=[];while(el&&el!==B&&el.parentElement){p.unshift(Array.prototype.indexOf.call(el.parentElement.children,el));el=el.parentElement;}return el===B?p:null;}
function byPath(p){var el=B;for(var i=0;i<(p||[]).length;i++){el=el&&el.children[p[i]];if(!el)return null;}return el;}
function root(el){if(!el||el.nodeType!==1)return null;if(ov.contains(el))return null;var b=el.closest('[data-lc-block]');if(b)return b;return B.contains(el)&&el!==B?el:null;}
function label(el){var s=el.tagName.toLowerCase();if(el.id)s+='#'+el.id;var c=(el.getAttribute('class')||'').trim();if(c)s+='.'+c.split(/\s+/).slice(0,3).join('.');var n=el.getAttribute('data-lc-name');return n?n+' · '+s:s;}
function box(b,el){if(!el){b.style.display='none';return;}var r=el.getBoundingClientRect();b.style.display='block';b.style.left=(r.left+scrollX)+'px';b.style.top=(r.top+scrollY)+'px';b.style.width=r.width+'px';b.style.height=r.height+'px';b.firstChild.textContent=label(el);b.classList.toggle('is-low',r.top<22);}
function info(el){var cs=getComputedStyle(el);return{path:path(el),tag:el.tagName.toLowerCase(),id:el.id||'',cls:(el.getAttribute('class')||'').trim(),name:el.getAttribute('data-lc-name')||'',block:el.getAttribute('data-lc-block')||'',text:(el.textContent||'').replace(/\s+/g,' ').trim().slice(0,90),
 attrs:[].slice.call(el.attributes).map(function(a){return [a.name,a.value];}).filter(function(a){return !/^(class|id|style|contenteditable|spellcheck|draggable|data-lc|data-lcb)/.test(a[0]);}).slice(0,40),src:el.getAttribute('src')||'',href:el.getAttribute('href')||'',alt:el.getAttribute('alt')||'',style:el.getAttribute('style')||'',kids:el.children.length,
 cs:{color:cs.color,bg:cs.backgroundColor,font:cs.fontFamily,size:cs.fontSize,weight:cs.fontWeight,align:cs.textAlign,mt:cs.marginTop,mr:cs.marginRight,mb:cs.marginBottom,ml:cs.marginLeft,pt:cs.paddingTop,pr:cs.paddingRight,pb:cs.paddingBottom,pl:cs.paddingLeft,radius:cs.borderTopLeftRadius,maxw:cs.maxWidth}};}
function select(el,scroll){sel=el;box(bs,el);if(el&&scroll){var r=el.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight)el.scrollIntoView({block:'center'});setTimeout(function(){box(bs,el);},60);}}
var TEXTY='p,h1,h2,h3,h4,h5,h6,li,a,span,blockquote,figcaption,td,th,cite,small,strong,em,b,i,label,dt,dd,button,q,time,address';
function serialize(){var c=B.cloneNode(true);c.querySelectorAll('script[data-lcb]').forEach(function(e){e.remove();});c.querySelectorAll('[contenteditable]').forEach(function(e){e.removeAttribute('contenteditable');});c.querySelectorAll('[data-lc-block]').forEach(function(e){e.innerHTML='';});c.querySelectorAll('[spellcheck]').forEach(function(e){e.removeAttribute('spellcheck');});return c.innerHTML;}
function stopEdit(){if(!edit)return;edit.removeAttribute('contenteditable');edit.removeAttribute('spellcheck');edit=null;}
document.addEventListener('mousemove',function(e){if(mode==='play'){box(bh,null);return;}var el=root(e.target);if(el!==hov){hov=el;box(bh,el&&el!==sel?el:null);}},true);
document.addEventListener('mouseleave',function(){hov=null;box(bh,null);});
document.addEventListener('click',function(e){
 if(skipClick){skipClick=false;e.preventDefault();e.stopPropagation();return;}
 if(e.target.closest&&e.target.closest('.lc-carte-vive button'))return; // ＋ − de la carte interactive : ils marchent aussi ici
 var a=e.target.closest&&e.target.closest('a[href]');
 if(mode==='play'){if(!a)return;var h=a.getAttribute('href')||'';var m=/^([a-z0-9-]+)\.(?:html|php)(#.*)?$/i.exec(h);if(m){e.preventDefault();send({type:'goto',slug:m[1]});return;}if(h.charAt(0)==='#')return;e.preventDefault();send({type:'external',href:h.slice(0,300)});return;}
 if(edit&&edit.contains(e.target))return;
 e.preventDefault();e.stopPropagation();var el=root(e.target);if(!el)return;
 if(mode==='text'&&el.matches(TEXTY)&&!el.closest('[data-lc-block]')){stopEdit();edit=el;el.setAttribute('contenteditable','true');el.setAttribute('spellcheck','true');el.focus();}
 else stopEdit();
 select(el);send({type:'select',info:info(el)});},true);
document.addEventListener('dblclick',function(e){if(mode!=='select')return;var el=root(e.target);if(el&&el.matches(TEXTY)&&!el.closest('[data-lc-block]')){send({type:'want-text'});}},true);
document.addEventListener('submit',function(e){e.preventDefault();},true);
// déplacer un élément à la souris : on le prend, une ligne bleue montre où il ira (avant, après, ou dedans en pointillés)
var BOXY='section,div,main,nav,header,footer,article,aside,ul,ol,figure,blockquote,form,table';
function moveTarget(e){var p=document.elementFromPoint(e.clientX,e.clientY);if(!p||ov.contains(p))return null;var t=root(p);if(!t||!mv||t===mv.el||mv.el.contains(t))return null;var r=t.getBoundingClientRect();
 var inside=t.matches(BOXY)&&!t.matches('[data-lc-block]')&&e.clientY>r.top+r.height*.28&&e.clientY<r.bottom-r.height*.28&&r.height>24;
 return{el:t,r:r,where:inside?'inside':(e.clientY<r.top+r.height/2?'before':'after')};}
document.addEventListener('mousedown',function(e){if(mode!=='select'||e.button!==0||edit)return;if(e.target.closest&&e.target.closest('.lc-carte-vive'))return;var el=root(e.target);if(!el)return;mv={el:el,x:e.clientX,y:e.clientY,on:false,t:null};},true);
document.addEventListener('mousemove',function(e){if(!mv)return;if(!mv.on){if(Math.abs(e.clientX-mv.x)+Math.abs(e.clientY-mv.y)<7)return;mv.on=true;H.classList.add('lcb-moving');select(mv.el,false);}
 e.preventDefault();var t=moveTarget(e);mv.t=t;if(!t){bd.style.display='none';return;}bd.style.display='block';bd.classList.toggle('is-in',t.where==='inside');bd.style.left=(t.r.left+scrollX)+'px';bd.style.width=t.r.width+'px';
 if(t.where==='inside'){bd.style.top=(t.r.top+scrollY)+'px';bd.style.height=t.r.height+'px';}else{bd.style.height='';bd.style.top=((t.where==='before'?t.r.top:t.r.bottom)+scrollY-2)+'px';}},true);
document.addEventListener('mouseup',function(e){if(!mv)return;var m=mv;mv=null;H.classList.remove('lcb-moving');bd.style.display='none';bd.classList.remove('is-in');if(!m.on)return;skipClick=true;setTimeout(function(){skipClick=false;},300);
 if(m.t){var from=path(m.el),to=path(m.t.el);if(from&&to)send({type:'move',from:from,to:to,where:m.t.where});}},true);
document.addEventListener('input',function(){clearTimeout(T);T=setTimeout(function(){send({type:'html',html:serialize(),sel:sel?path(sel):null});box(bs,sel);},280);},true);
document.addEventListener('keydown',function(e){if(e.altKey&&!edit&&sel&&mode!=='play'&&(e.key==='ArrowUp'||e.key==='ArrowDown')){e.preventDefault();send({type:'key',key:e.key==='ArrowUp'?'moveup':'movedown'});return;}
 if(e.key==='Escape'&&edit){stopEdit();send({type:'html',html:serialize(),sel:sel?path(sel):null});return;}
 if((e.metaKey||e.ctrlKey)&&/^[szy]$/i.test(e.key)&&!edit){e.preventDefault();send({type:'key',key:e.key.toLowerCase(),shift:e.shiftKey});}
 if(!edit&&mode!=='play'&&sel&&(e.key==='Delete'||e.key==='Backspace')){e.preventDefault();send({type:'key',key:'delete'});}},true);
addEventListener('scroll',function(){box(bs,sel);box(bh,null);},{passive:true});addEventListener('resize',function(){box(bs,sel);});
function dropTarget(e){var el=document.elementFromPoint(e.clientX,e.clientY);if(!el||ov.contains(el))return null;while(el&&el.parentElement&&!/^(BODY|MAIN)$/.test(el.parentElement.tagName))el=el.parentElement;if(!el||el===B||el===H)return null;var r=el.getBoundingClientRect();return{el:el,where:e.clientY<r.top+r.height/2?'before':'after',r:r};}
document.addEventListener('dragover',function(e){if(mode==='play')return;e.preventDefault();var t=dropTarget(e);dropAt=t;if(!t){bd.style.display='none';return;}bd.style.display='block';bd.style.left=(t.r.left+scrollX)+'px';bd.style.width=t.r.width+'px';bd.style.top=((t.where==='before'?t.r.top:t.r.bottom)+scrollY-2)+'px';},true);
document.addEventListener('dragleave',function(e){if(e.target===H||e.target===B)bd.style.display='none';},true);
document.addEventListener('drop',function(e){if(mode==='play')return;e.preventDefault();bd.style.display='none';var t=dropAt||dropTarget(e);send({type:'drop',path:t?path(t.el):null,where:t?t.where:'after'});},true);
addEventListener('message',function(e){if(e.source!==parent)return;var m=e.data||{};
 if(m.type==='set'){stopEdit();var y=scrollY;B.innerHTML=m.html;scrollTo(0,y);sel=m.sel?byPath(m.sel):null;select(sel,false);if(m.mode)mode=m.mode;if(window.LCNDA_CARTE_VIVE)window.LCNDA_CARTE_VIVE();}
 else if(m.type==='css'){var s=document.getElementById('lcb-user');if(s)s.textContent=m.css;var t=document.getElementById('lcb-theme');if(t&&typeof m.theme==='string')t.textContent=m.theme;setTimeout(function(){select(sel,false);},30);}
 else if(m.type==='mode'){mode=m.mode;stopEdit();H.classList.toggle('lcb-text',mode==='text');H.classList.toggle('lcb-play',mode==='play');box(bh,null);}
 else if(m.type==='select'){var el=m.path?byPath(m.path):null;select(el,true);if(el&&m.report)send({type:'select',info:info(el)});}
 else if(m.type==='info'){if(sel)send({type:'select',info:info(sel)});}
 else if(m.type==='attr'){var ae=byPath(m.path);if(ae&&/^(style|class|id|data-lc-name|alt|href|src|title)$/.test(m.name)){if(m.value===null)ae.removeAttribute(m.name);else ae.setAttribute(m.name,String(m.value));}select(sel,false);}
});
H.classList.toggle('lcb-text',mode==='text');send({type:'ready',h:document.documentElement.scrollHeight});
})();`;
    const BRIDGE_CSS = `#lcb-ov{position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none}
#lcb-ov>div{position:absolute;display:none;box-sizing:border-box}
.lcb-hov{outline:1.5px dashed #055dff;outline-offset:-1px;background:rgba(5,93,255,.04)}
.lcb-sel{outline:2px solid #055dff;outline-offset:-1px}
#lcb-ov span{position:absolute;left:-2px;top:-21px;font:600 11px/1 system-ui,sans-serif;background:#055dff;color:#fff;padding:4px 6px;border-radius:3px 3px 0 0;white-space:nowrap;max-width:420px;overflow:hidden;text-overflow:ellipsis}
#lcb-ov .is-low span{top:0;border-radius:0 0 3px 0}
.lcb-hov span{background:#5b7cc9}
.lcb-drop{height:4px;background:#055dff;border-radius:2px;box-shadow:0 0 0 2px rgba(255,255,255,.8)}
.lcb-drop.is-in{background:rgba(5,93,255,.06);outline:2px dashed #055dff;outline-offset:-2px;box-shadow:none}
html.lcb-moving,html.lcb-moving *{cursor:grabbing!important;user-select:none!important}
html.lcb-text [contenteditable]{outline:2px solid #12a150!important;outline-offset:2px;cursor:text}
html:not(.lcb-play) a,html:not(.lcb-play) button{cursor:default}
html.lcb-text body :is(p,h1,h2,h3,h4,h5,h6,li,a,span,blockquote,figcaption,td,th,cite):not([data-lc-block] *){cursor:text}`;

    ext.siteKit = {BLOCKS, GROUPS, TEMPLATES, BASE_CSS, BRIDGE, BRIDGE_CSS, parse, elByPath, pathOf, blockAttrs, blockKey, insertHtml, pickPerson, pickPlace, pickImages, pickDiagram, defaultFond, mediaSrc, esc};
})();
