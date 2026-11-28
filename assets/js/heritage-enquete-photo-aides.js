/* LCNDA — 🔎 Enquête photo : les aides (maquette validée docs/design/enquete-photo.html, § 4 à § 7 quater).
 * Chargé après heritage-enquete-photo.js ; reçoit de lui « api » (l'enquête ouverte et de quoi agir dessus).
 *  § 4  🤖 l'IA de cet ordinateur (Ollama, éteinte au départ) : une question à la fois, un cadre pour chaque chose vue (sinon jetée),
 *       « je ne sais pas » permis, jamais de nom de personne ni de visage, « Supposé » au plus ; « Oui, c'est ça / Non / Garder comme piste ».
 *  § 5  recherches proposées d'après les indices, chacune avec son « parce que… » ; § 7 ter 🧰 Chercher dans les données (sans Internet).
 *  § 5 bis ☀️ calcul d'ombre ; § 6 comparer en ligne (rien n'est envoyé : on découpe, on floute, la personne dépose elle-même) ;
 *  § 7 bis les 46 aides (+ 🔤 Essayer une police) ; guides illustrés, sourcés ↗ ; 📖 Raconter, 🛡 Partager sans risque, ✉️ Demander à un cousin.
 *  § 7 quater : aucune donnée téléchargée ni livrée ici — seulement des liens.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {}, UI = () => window.LCNDA_UI || {}, C = () => window.LCNDA_EP_CORE, EP = () => ext.enquetePhoto || {};
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (m, k, o) => A().toast?.(m, k, o);
    const plural = (n, one, many) => (A().plural ? A().plural(n, one, many) : `${n} ${n > 1 ? (many || one + 's') : one}`);
    const kiosk = () => document.body.classList.contains('is-kiosk');
    const undoToast = (m, o) => (A().undoToast ? A().undoToast(m, o) : toast(m));
    const ext_ = (u, n) => (UI().extLink ? UI().extLink(u, n) : `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">↗ ${esc(n)}</a>`);
    const empty = (t, icon = '🔍') => (A().empty ? A().empty(t, {icon}) : `<p class="empty-line">${esc(t)}</p>`);
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const monthName = m => T(MONTHS[m - 1]);
    const dlgOpen = o => ext.openDialog?.(o);
    const today = () => new Date().toISOString().slice(0, 10);
    const download = (blob, name) => { const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: name}); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    const safeName = s => (A().safeExportFilename ? A().safeExportFilename(s) : String(s || 'enquete').replace(/[^\w-]+/g, '-'));

    /* ═════════ ce que l'enquête sait déjà : le lieu supposé, la date, la fenêtre ═════════ */
    function placeOf(api) {
        const c = api.inq.conclusion?.place; if (c?.lat != null) return {name: c.name, lat: c.lat, lon: c.lon, id: c.place_id, certainty: c.certainty};
        const h = (api.inq.hypotheses || []).find(x => x.place?.lat != null); if (h) return {name: h.place.name, lat: h.place.lat, lon: h.place.lon, id: h.place_id, certainty: 'supposed'};
        const k = api.clues.find(x => x.place?.lat != null && x.certainty !== 'refuted'); if (k) return {name: k.place.name, lat: k.place.lat, lon: k.place.lon, id: k.place_id, certainty: k.certainty};
        return c ? {name: c.name, id: c.place_id, certainty: c.certainty} : null;
    }
    function dayOfInq(api) {
        for (const c of api.clues) { if (c.certainty === 'refuted' || !['date', 'dos'].includes(c.kind)) continue; const d = C().dayOf(c.text); if (d) return {...d, clue: c}; }
        const d = C().dayOf(api.inq.conclusion?.date?.text || ''); return d ? {...d} : null;
    }
    const win = api => C().dateWindow(api.clues);
    const yearWin = api => { const w = win(api), c = api.inq.conclusion?.date; return {from: w.from ?? c?.from ?? null, to: w.to ?? c?.to ?? null}; };

    /* ═════════ 🔤 la langue d'un texte lu (des mots fréquents, sans dictionnaire) ═════════ */
    const LANGS = {français: ['le', 'la', 'les', 'de', 'du', 'des', 'et', 'au', 'aux', 'hôtel', 'poste', 'rue', 'place', 'café', 'maison', 'église', 'gare', 'pharmacie', 'boulangerie', 'épicerie', 'mairie', 'école', 'souvenir'],
        allemand: ['der', 'die', 'das', 'und', 'strasse', 'straße', 'platz', 'gasthaus', 'bahnhof', 'kirche', 'zum', 'zur', 'gruss', 'gruß', 'aus', 'von'], anglais: ['the', 'and', 'street', 'of', 'station', 'church', 'inn', 'greetings', 'from'],
        italien: ['il', 'della', 'via', 'piazza', 'chiesa', 'albergo', 'saluti', 'di'], espagnol: ['el', 'calle', 'plaza', 'iglesia', 'recuerdo', 'los', 'y'], latin: ['anno', 'domini', 'hic', 'iacet', 'sanctus', 'ecclesia'], néerlandais: ['het', 'straat', 'kerk', 'groeten', 'uit', 'en']};
    function guessLang(text) {
        const words = String(text || '').toLowerCase().normalize('NFC').split(/[^a-zà-ÿßœ]+/).filter(w => w.length > 1); if (!words.length) return null;
        let best = null; Object.entries(LANGS).forEach(([l, list]) => { const hit = [...new Set(words.filter(w => list.includes(w)))]; if (hit.length && (!best || hit.length > best.words.length)) best = {lang: l, words: hit.slice(0, 3)}; });
        return best;
    }

    /* ═════════ guides illustrés (§ 7 bis) — seulement des faits sûrs, chacun avec sa source ↗ ═════════ */
    const W = p => `https://fr.wikipedia.org/wiki/${p}`, WE = p => `https://en.wikipedia.org/wiki/${p}`;
    const GUIDES = {
        tirages: {icon: '🖼', title: 'Types de tirage', intro: 'Le support d’une photo donne une fourchette : pas avant son invention. Il a souvent servi longtemps ensuite.', items: [
            {n: 'Daguerréotype', svg: 'mirror', t: 'Plaque de cuivre argentée, effet de miroir, souvent sous verre dans un écrin.', from: 1839, url: W('Daguerréotype')},
            {n: 'Calotype', t: 'Négatif sur papier (procédé de Talbot).', from: 1841, url: W('Calotype')},
            {n: 'Ambrotype (collodion sur verre)', t: 'Négatif sur verre posé sur un fond noir : il paraît positif.', from: 1851, url: W('Ambrotype')},
            {n: 'Papier albuminé', t: 'Tirage brun-rouge un peu brillant, sur papier très fin souvent collé sur carton.', from: 1850, url: W('Papier_albuminé')},
            {n: 'Carte de visite', svg: 'cdv', t: 'Petit portrait collé sur un carton d’environ 6 × 10 cm, nom du photographe au dos.', from: 1854, url: WE('Carte_de_visite')},
            {n: 'Ferrotype', t: 'Image sur une mince plaque de fer vernie noire.', from: 1856, url: W('Ferrotype')},
            {n: 'Carte cabinet', svg: 'cabinet', t: 'Portrait sur un carton plus grand (environ 11 × 17 cm).', from: 1863, url: WE('Cabinet_card')},
            {n: 'Plaque sèche au gélatino-bromure', t: 'Négatif sur verre au gélatino-bromure d’argent.', from: 1871, url: W('Gélatino-bromure_d%27argent')},
            {n: 'Autochrome (couleur)', t: 'Plaque de verre en couleurs des frères Lumière, aux couleurs pointillées.', from: 1907, url: W('Autochrome')},
            {n: 'Diapositive Kodachrome', t: 'Film inversible en couleurs.', from: 1935, url: W('Kodachrome')}]},
        insignes: {icon: '🎖', title: 'Insignes et décorations (France)', intro: 'Une décoration portée donne un « pas avant » sa création.', items: [
            {n: 'Légion d’honneur', from: 1802, url: W('Ordre_national_de_la_Légion_d%27honneur')}, {n: 'Médaille militaire', from: 1852, url: W('Médaille_militaire')},
            {n: 'Médaille de Sainte-Hélène', from: 1857, url: W('Médaille_de_Sainte-Hélène')}, {n: 'Mérite agricole', from: 1883, url: W('Ordre_du_Mérite_agricole')},
            {n: 'Croix de guerre 1914-1918', from: 1915, url: W('Croix_de_guerre_1914-1918_(France)')}, {n: 'Médaille commémorative de la guerre 1914-1918', from: 1920, url: W('Médaille_commémorative_de_la_guerre_1914-1918')},
            {n: 'Croix de guerre 1939-1945', from: 1939, url: W('Croix_de_guerre_1939-1945')}, {n: 'Ordre de la Libération', from: 1940, url: W('Ordre_de_la_Libération')},
            {n: 'Médaille de la Résistance', from: 1943, url: W('Médaille_de_la_Résistance_française')}, {n: 'Ordre national du Mérite', from: 1963, url: W('Ordre_national_du_Mérite')}]},
        uniformes: {icon: '🎖', title: 'Uniformes militaires (France, 1914-1918)', intro: 'Le numéro au col et les galons se notent comme des textes lus.', items: [
            {n: 'Pantalon rouge garance', t: 'Infanterie au début de la guerre, remplacé par le bleu horizon.', to: 1915, url: W('Uniforme_bleu_horizon')},
            {n: 'Uniforme bleu horizon', t: 'Adopté pendant la guerre.', from: 1915, url: W('Uniforme_bleu_horizon')},
            {n: 'Casque Adrian', svg: 'adrian', t: 'Casque d’acier à cimier.', from: 1915, url: W('Casque_Adrian')},
            {n: 'Képi et capote, sans casque', t: 'Seul, ce n’est qu’une piste (le képi est resté porté hors du front).', to: 1915, cert: 'supposed', url: W('Casque_Adrian')}]},
        vehicules: {icon: '🚲', title: 'Véhicules', intro: 'Un modèle reconnu donne un « pas avant » sa sortie.', items: [
            {n: 'Bicyclette « de sécurité » (deux roues égales, chaîne)', from: 1885, url: WE('Safety_bicycle')}, {n: 'Ford T', from: 1908, url: W('Ford_T')},
            {n: 'Citroën Traction Avant', from: 1934, url: W('Citroën_Traction_Avant')}, {n: 'Renault 4CV', from: 1946, url: W('Renault_4CV')},
            {n: 'Citroën 2CV', from: 1948, url: W('Citroën_2CV')}, {n: 'Citroën DS', from: 1955, url: W('Citroën_DS')}, {n: 'Renault 4', from: 1961, url: W('Renault_4')}]},
        civils: {icon: '📯', title: 'Uniformes civils', intro: 'Ils aident à relier une photo aux métiers de l’arbre (cherche le métier dans « 🧰 Chercher dans les données »).', items: [
            {n: 'Garde champêtre', t: 'Plaque au baudrier marquée « LA LOI ».', url: W('Garde_champêtre')}, {n: 'Facteur', t: 'Sacoche, casquette ou képi des Postes.', url: W('Facteur')},
            {n: 'Gendarme', url: W('Gendarmerie_nationale_(France)')}, {n: 'Sapeur-pompier', t: 'Casque à cimier.', url: W('Sapeur-pompier_en_France')},
            {n: 'Cheminot', url: W('Cheminot')}, {n: 'Infirmière de la Croix-Rouge', t: 'Voile blanc marqué d’une croix rouge.', url: W('Croix-Rouge_française')}]},
        panneaux: {icon: '🪧', title: 'Panneaux et langue', intro: 'La langue des enseignes et des panneaux peut dater une photo.', items: [
            {n: 'Panneaux en allemand en Alsace-Moselle', t: 'Le territoire était allemand de 1871 à 1918.', from: 1871, to: 1918, cert: 'supposed', url: W('Alsace-Lorraine')}]},
        drapeaux: {icon: '🚩', title: 'Drapeaux', intro: 'Leur forme et leurs couleurs ; un drapeau étranger peut dire une occupation ou une fête.', items: [
            {n: 'Drapeau blanc (Restauration)', t: 'Drapeau de la France de 1814 à 1830 (avec les Cent-Jours).', from: 1814, to: 1830, cert: 'supposed', url: W('Drapeau_de_la_France')},
            {n: 'Drapeau tricolore', t: 'Drapeau de la France depuis 1830 (déjà de 1794 à 1814).', url: W('Drapeau_de_la_France')}]},
        plaques: {icon: '🔢', title: 'Plaques et numéros', intro: 'Une plaque de rue, un numéro, une borne : note leur forme et leur couleur, puis cherche le nom dans « 🧰 Chercher dans les données » (anciens noms des rues).', items: [
            {n: 'Monuments aux morts', t: 'La plupart ont été élevés entre 1920 et 1925.', from: 1919, cert: 'supposed', url: W('Monument_aux_morts')}]},
        retouches: {icon: '🖌', title: 'Retouches anciennes', intro: 'Ciel repeint, personnage ajouté, photomontage : regarde les bords trop nets, les ombres qui ne vont pas ensemble.', items: [
            {n: 'Retouche du négatif ou du tirage', t: 'Grattage, crayon, gouache : visages lissés, fonds effacés.', url: W('Retouche_photographique')},
            {n: 'Photo coloriée à la main', t: 'Couleurs posées au pinceau sur un tirage noir et blanc.', url: W('Colorisation')}]},
        cartepostale: {icon: '✉️', title: 'Le papier de la carte postale', intro: 'Le dos de la carte et le timbre donnent une époque.', items: [
            {n: 'Dos divisé (France)', svg: 'divided', t: 'La correspondance à gauche, l’adresse à droite.', from: 1904, url: W('Carte_postale')},
            {n: 'Timbre « Semeuse »', from: 1903, url: W('Semeuse_(timbre)')}, {n: 'Timbre « Marianne de Gandon »', from: 1945, url: W('Marianne_de_Gandon')}]},
    };
    const SVGS = {mirror: '<svg viewBox="0 0 60 40" aria-hidden="true"><rect x="4" y="4" width="52" height="32" rx="3" fill="#cfd6dd" stroke="#555"/><path d="M8 32 L52 8" stroke="#fff" stroke-width="3" opacity=".7"/></svg>',
        cdv: '<svg viewBox="0 0 40 60" aria-hidden="true"><rect x="2" y="2" width="36" height="56" fill="#efe4cc" stroke="#777"/><rect x="6" y="6" width="28" height="40" fill="#a08a6a"/><rect x="10" y="50" width="20" height="3" fill="#777"/></svg>',
        cabinet: '<svg viewBox="0 0 44 66" aria-hidden="true"><rect x="2" y="2" width="40" height="62" fill="#e8dcc0" stroke="#777"/><rect x="6" y="6" width="32" height="46" fill="#8f7a5c"/><rect x="10" y="56" width="24" height="3" fill="#777"/></svg>',
        adrian: '<svg viewBox="0 0 60 36" aria-hidden="true"><path d="M8 28 Q30 -2 52 28 Z" fill="#6d7f8e"/><path d="M30 4 L30 26" stroke="#4b5a66" stroke-width="3"/><path d="M2 30 H58" stroke="#4b5a66" stroke-width="4" stroke-linecap="round"/></svg>',
        divided: '<svg viewBox="0 0 60 40" aria-hidden="true"><rect x="2" y="2" width="56" height="36" fill="#f3ead6" stroke="#777"/><path d="M30 6 V34" stroke="#777"/><rect x="46" y="6" width="9" height="11" fill="none" stroke="#777"/><path d="M34 22 H54 M34 28 H54" stroke="#999"/></svg>'};
    function guide(key, api) {
        const g = GUIDES[key]; if (!g) return;
        const can = api && !api.ro;
        dlgOpen({eyebrow: T('🔎 GUIDE'), title: `${g.icon} ${T(g.title)}`, submitLabel: T('Fermer'), wide: true, body: `<p class="ui-hint">${esc(T(g.intro))}</p>
            <ul class="ep-guide">${g.items.map((it, i) => `<li>${it.svg ? `<span class="ep-gsvg">${SVGS[it.svg]}</span>` : ''}<div><b>${esc(T(it.n))}</b>${it.from || it.to ? ` <span class="ui-badge is-date">${esc([it.from ? T('pas avant {y}', {y: it.from}) : '', it.to ? T('pas après {y}', {y: it.to}) : ''].filter(Boolean).join(', '))}</span>` : ''}
                ${it.t ? `<br><small>${esc(T(it.t))}</small>` : ''}<br>${ext_(it.url, T('Source'))}</div>${can ? `<button type="button" class="button small secondary" data-g="${i}">＋ ${esc(T('Indice'))}</button>` : ''}</li>`).join('')}</ul>
            <p class="ui-hint">${esc(T('Seulement des faits sûrs, chacun avec sa source. D’abord la France 1850-1950.'))}</p>`,
            onOpen: dg => dg.addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (!b) return; const it = g.items[Number(b.dataset.g)]; dg.close();
                api.editClue({kind: {tirages: 'support', cartepostale: 'dos', vehicules: 'objet', drapeaux: 'objet', panneaux: 'texte', plaques: 'lieu'}[key] || 'gens', text: T(it.n), certainty: it.cert || 'probable', date_from: it.from || null, date_to: it.to || null, why: [T(it.t || ''), T('Guide : {g}', {g: T(g.title)})].filter(Boolean).join(' · '), url: it.url, images: {[api.img?.id]: 'yes'}}); }),
            onSubmit: () => true});
    }
    /** une pastille de réponse : ce qu'en dit un guide (pour pré-remplir l'indice) */
    function chipHint(label) {
        const L = String(label), find = (g, n) => GUIDES[g].items.find(x => x.n === n);
        const map = {'Dos divisé': find('cartepostale', 'Dos divisé (France)'), 'Daguerréotype': find('tirages', 'Daguerréotype'), 'Ferrotype': find('tirages', 'Ferrotype'), 'Carte de visite': find('tirages', 'Carte de visite'), 'Carte cabinet': find('tirages', 'Carte cabinet'), 'Monument aux morts': find('plaques', 'Monuments aux morts')};
        const it = map[L]; if (!it) return {};
        return {from: it.from || null, to: it.to || null, certainty: it.cert || (it.from ? 'probable' : 'supposed'), why: T(it.t || it.n), url: it.url};
    }

    /* ═════════ 📏 la frise de la photo ═════════ */
    function friseHtml(api) {
        const w = win(api); if (!w.steps.length) return `<p class="ui-hint">${esc(T('Pas encore de « pas avant » ni de « pas après ».'))}</p>`;
        const ys = w.steps.flatMap(s => [s.from, s.to]).filter(Boolean), a = Math.min(...ys) - 5, b = Math.max(...ys) + 5, X = y => ((y - a) / (b - a) * 100).toFixed(2);
        const band = w.from != null || w.to != null ? `<rect x="${X(w.from ?? a)}%" y="4" width="${Math.max(0.6, X(w.to ?? b) - X(w.from ?? a))}%" height="14" class="ep-fw${w.conflict ? ' is-bad' : ''}"/>` : '';
        return `<div class="ep-frise"><svg width="100%" height="${26 + w.steps.length * 14}" role="img" aria-label="${esc(T('Frise des dates possibles'))}">${band}<line x1="0" y1="18" x2="100%" y2="18" class="ep-fl"/>
            ${w.steps.map((s, i) => `<g><line x1="${X(s.from ?? a)}%" x2="${X(s.to ?? b)}%" y1="${30 + i * 14}" y2="${30 + i * 14}" class="ep-fs-${s.certainty}"/><text x="${X(s.from ?? s.to)}%" y="${27 + i * 14}" class="ep-ft">${esc(`${s.num} · ${s.from ? '≥' + s.from : ''}${s.to ? ' ≤' + s.to : ''}`)}</text></g>`).join('')}</svg>
            <p class="ep-fwin">${w.conflict ? `⚠️ ${esc(T('Les indices se contredisent : pas avant {a} mais pas après {b}.', {a: w.from, b: w.to}))}` : `📅 ${esc(w.from && w.to ? T('entre {a} et {b}', {a: w.from, b: w.to}) : w.from ? T('pas avant {y}', {y: w.from}) : T('pas après {y}', {y: w.to}))}`}</p></div>`;
    }
    function missingText(m) {
        return {tie: () => T('« {a} » et « {b} » tiennent aussi bien : cherche l’indice qui les départage.', {a: m.a, b: m.b}), text: () => T('Y a-t-il un texte à lire (enseigne, légende, dos) ?'), date: () => T('Aucun indice de date : le support, les habits ou un tampon en donnent souvent un.'),
            conflict: () => T('Deux indices de date se contredisent : l’un est sans doute faux.'), wide: () => T('La fenêtre {a}–{b} est large : un tirage, un uniforme ou un véhicule la réduirait.', {a: m.from, b: m.to}),
            half: () => (m.from ? T('On sait « pas avant {y} » : cherche un « pas après ».', {y: m.from}) : T('On sait « pas après {y} » : cherche un « pas avant ».', {y: m.to})), place: () => T('Aucun indice de lieu : un bâtiment, un paysage, une enseigne ?'),
            proveplace: () => T('Pour passer à « Prouvé » : trouver une autre carte postale du même lieu, ou un plan ancien.'), support: () => T('Le support (carte postale, carte de visite…) n’est pas encore noté.'), more: () => T('Une autre photo du même lieu ou du même album aiderait (« ＋ Ajouter une photo ou un document… »).')}[m.k]?.() || '';
    }

    /* ═════════ § 5 les recherches proposées, avec leur « parce que… » ═════════ */
    function suggestions(api) {
        const out = [], cl = api.clues.filter(c => c.certainty !== 'refuted'), pl = placeOf(api);
        cl.filter(c => c.kind === 'texte').slice(0, 3).forEach(c => out.push({icon: '🏨', title: T('« {t} » dans l’app', {t: c.text}), because: T('parce que l’indice {n} est un texte lu', {n: c.num}), desc: T('Chercher ce texte dans tes cartes postales, tes documents transcrits et les données installées.'), act: [T('🔍 Chercher'), () => searchData(api, c)]}));
        cl.filter(c => c.kind === 'lieu').slice(0, 2).forEach(c => out.push({icon: '⛪', title: T('« {t} » dans l’app', {t: c.text}), because: T('parce que l’indice {n} décrit le lieu', {n: c.num}), desc: T('Monuments, édifices, lieux de ta base, près des lieux de ta famille d’abord.'), act: [T('🧰 Chercher dans les données'), () => searchData(api, c)]}));
        if (cl.some(c => c.kind === 'gens' && /uniforme|soldat|képi|militaire/i.test(c.text))) out.push({icon: '🎖', title: T('Uniforme'), because: T('parce qu’un indice montre des soldats'), desc: T('Guide des uniformes et insignes (képi, numéro au col, galons).'), act: [T('🎖 Ouvrir le guide'), () => guide('uniformes', api)]});
        if (cl.some(c => c.kind === 'gens' && /décor|médaille|croix/i.test(c.text))) out.push({icon: '🎖', title: T('Décorations'), because: T('parce qu’un indice montre une décoration'), desc: T('Chaque décoration a sa date de création.'), act: [T('🎖 Ouvrir le guide'), () => guide('insignes', api)]});
        if (cl.some(c => c.kind === 'gens')) out.push({icon: '📅', title: T('Dater par la mode'), because: T('parce qu’il y a des gens habillés'), desc: T('Comparer coiffes, chapeaux et robes avec les repères d’époque.'), act: [T('📅 Ouvrir'), () => open('mode', api)]});
        const pub = cl.find(c => c.data?.publisher || c.data?.photographer);
        if (pub) { const name = pub.data.publisher || pub.data.photographer, q = encodeURIComponent(name);
            out.push({icon: '📮', title: T('« {t} » en ligne ↗', {t: name}), because: T('parce que le dos porte un nom d’éditeur ou de photographe'), desc: T('Archives : fonds de cartes postales par éditeur ; sites de collectionneurs par mots-clés.'), online: true,
                links: [[`https://francearchives.gouv.fr/fr/search?q=${q}`, 'FranceArchives'], [`https://www.delcampe.net/fr/collections/search?term=${q}`, 'Delcampe'], [`https://www.geneanet.org/fonds/individus/?go=1&nom=${q}`, 'Geneanet']]}); }
        if (pl?.name && pl.certainty !== 'proven') out.push({icon: '🗺', title: T('Vieux plans de {p}', {p: pl.name}), because: T('parce que le lieu est « {c} »', {c: T(api.CERT[pl.certainty]?.[0] || 'Supposé').toLowerCase()}), desc: T('Plans anciens et cadastre : retrouve-t-on le bâtiment vu sur la photo ?'), act: [T('🗺 Ouvrir les plans'), () => open('cadastre', api)]});
        const d = dayOfInq(api); if (d && pl?.lat != null) out.push({icon: '🌦', title: T('Météo du {d}', {d: `${d.d} ${monthName(d.m)} ${d.y}`}), because: T('parce que la date et le lieu sont connus'), desc: T('Neige, sol mouillé, ciel couvert : comparés à la météo d’autrefois.'), act: [T('🌦 Voir'), () => open('meteo', api)]});
        return out;
    }
    function renderSearches(api, pane) {
        const S = suggestions(api), blocked = api.privacy?.blocked || kiosk();
        pane.innerHTML = S.length ? `<p class="ui-hint">${esc(T('D’abord dans ce que l’app a déjà (sans Internet), puis des sites à ouvrir. Chaque proposition dit pourquoi elle est là.'))}</p>
            <ul class="ep-sugg">${S.map((s, i) => `<li><b>${esc(s.icon)} ${esc(s.title)}</b> <small class="ep-because">${esc(s.because)}</small><br><small>${esc(s.desc)}</small><div class="ep-row">${s.act ? `<button type="button" class="button small secondary" data-s="${i}">${esc(s.act[0])}</button>` : ''}${s.links ? (blocked ? `<small class="muted">🔒 ${esc(api.privacy?.message || T('Mode consultation : rien ne part sur Internet.'))}</small>` : s.links.map(([u, n]) => ext_(u, n)).join(' ')) : ''}</div></li>`).join('')}</ul>`
            : empty(T('Les recherches proposées viennent des indices : relève d’abord un texte, un lieu, des habits…'));
        pane.onclick = e => { const b = e.target.closest('[data-s]'); if (b) S[Number(b.dataset.s)]?.act?.[1](); };
    }

    /* ═════════ 🧰 § 7 ter Chercher dans les données (déjà rempli d'après l'indice) ═════════ */
    async function searchData(api, clue = null, preset = {}) {
        const pl = placeOf(api), w = yearWin(api);
        const q0 = preset.q ?? (clue ? clue.text.replace(/[«»"?]/g, ' ').trim() : '');
        let st = {q: q0, place: preset.place ?? (clue?.place?.name || pl?.name || ''), from: w.from || '', to: w.to || ''};
        const dg = dlgOpen({eyebrow: T('🧰 CHERCHER DANS LES DONNÉES'), title: clue ? T('Chercher pour l’indice {n}', {n: clue.num}) : T('Chercher dans les données'), submitLabel: T('Fermer'), wide: true,
            body: `<div class="ep-sform" data-ep-sform><label>${esc(T('Texte'))}<input name="q" value="${esc(st.q)}"></label><label>${esc(T('Lieu'))}<input name="place" value="${esc(st.place)}"></label><label>${esc(T('De'))}<input name="from" value="${esc(st.from)}" inputmode="numeric"></label><label>${esc(T('À'))}<input name="to" value="${esc(st.to)}" inputmode="numeric"></label><button type="button" class="button small" data-ep-go>🔍 ${esc(T('Chercher'))}</button></div>
                <p class="ui-hint">${esc(T('L’app cherche d’abord dans ce qui est installé, sans Internet.'))}</p><div data-ep-sres>${UI().spinner ? UI().spinner(T('Recherche…')) : ''}</div>`,
            onSubmit: () => true});
        if (!dg) return;
        const res = dg.querySelector('[data-ep-sres]');
        const run = async () => {
            const f = dg.querySelector('[data-ep-sform]'), v = n => (f.querySelector(`[name="${n}"]`)?.value || '').trim(); st = {q: v('q'), place: v('place'), from: v('from'), to: v('to')};
            res.innerHTML = UI().spinner ? UI().spinner(T('Recherche…')) : '';
            const [srv, cx] = await Promise.all([api.get('search', {q: st.q, place: st.place, from: st.from, to: st.to}).catch(() => ({})), st.q.length >= 2 ? A().api('cx_search', {q: st.q}).catch(() => ({})) : Promise.resolve({})]);
            const rows = [], add = (where, what, extra, clueText) => rows.push({where, what, extra, clueText: clueText || `${what}`});
            (srv.docs || []).forEach(d => add('📄 ' + T('Tes documents transcrits'), `${d.title}${d.when ? ` (${d.when})` : ''}`, `« ${d.snippet} »`, T('Trouvé dans « {t} » : « {s} »', {t: d.title, s: d.snippet.slice(0, 120)})));
            (srv.postcards || []).forEach(p => add('✉️ ' + T('Tes cartes postales'), p.title || p.publisher, [p.publisher, p.when].filter(Boolean).join(' · '), T('Carte postale « {t} » ({p})', {t: p.title, p: p.publisher})));
            (srv.tree || []).forEach(p => add('👪 ' + T('Ton arbre'), p.name, T('à {pl} de {a} à {b}', {pl: st.place, a: p.from ?? '?', b: p.to ?? '?'}), T('{n} à {pl} ({a}-{b})', {n: p.name, pl: st.place, a: p.from ?? '?', b: p.to ?? '?'})));
            (srv.sites || []).forEach(s => add('🏛 ' + T('Édifices'), s.name, s.kind));
            (srv.photographers || []).forEach(p => add('📮 ' + T('Photographes'), p.name, ''));
            (cx.base || []).forEach(g => (g.items || []).forEach(x => add('🔎 ' + T('Ta base'), x.title || x.name || x.label || '', x.sub || x.subtitle || '')));
            (cx.lists || []).forEach(g => (g.rows || []).forEach(r => add('📋 ' + T('Données installées'), Object.values(r).filter(v => typeof v === 'string').slice(0, 2).join(' · '), g.src)));
            const ctx = {place: (srv.places || [])[0] ? {id: Number(srv.places[0].id), name: srv.places[0].name, lat: srv.places[0].latitude, lon: srv.places[0].longitude} : (pl ? {id: pl.id, name: pl.name, lat: pl.lat, lon: pl.lon} : null), year: Number(st.from) || Number(st.to) || null};
            const d = dayOfInq(api); if (d) ctx.date = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
            const have = new Set(Object.keys(ctx).filter(k => ctx[k])), blocked = api.privacy?.blocked || kiosk();
            const srcs = (ext.dataSources || []).filter(s => s && Array.isArray(s.needs) && s.needs.length && s.needs.every(n => have.has(n)) && !String(s.id).startsWith('enquete_photo')).slice(0, 40);
            const picks = (ext.pickSources || []).filter(s => s && Array.isArray(s.needs) && s.needs.every(n => have.has(n))).slice(0, 10);
            res.innerHTML = `<table class="ep-stable"><thead><tr><th>${esc(T('Où'))}</th><th>${esc(T('Ce qu’on trouve'))}</th><th></th></tr></thead><tbody>${rows.length ? rows.map((r, i) => `<tr><td>${esc(r.where)}</td><td><b>${esc(r.what)}</b>${r.extra ? `<br><small>${esc(r.extra)}</small>` : ''}</td><td>${api.ro ? '' : `<button type="button" class="button small secondary" data-ep-sadd="${i}">＋ ${esc(T('Indice'))}</button>`}</td></tr>`).join('') : `<tr><td colspan="3">${empty(T('Rien trouvé dans tes documents, tes cartes postales ni ton arbre.'))}</td></tr>`}</tbody></table>
                ${picks.length || srcs.length ? `<h4>${esc(T('Et aussi, si installés'))}</h4><ul class="ep-dsl">${picks.map((s, i) => `<li><button type="button" class="link-button" data-ep-pick="${i}">${esc(s.icon || '🧰')} ${esc(T(s.label))}</button><div data-ep-pickhost="${i}"></div></li>`).join('')}${srcs.map((s, i) => `<li><button type="button" class="link-button" data-ep-ds="${i}" ${s.online && blocked ? 'disabled' : ''}>${esc(s.icon || '🧰')} ${esc(T(s.label))}${s.online ? ' 🌐' : ''}</button><div data-ep-dshost="${i}"></div></li>`).join('')}</ul>` : ''}`;
            res.onclick = async e => {
                const a = e.target.closest('[data-ep-sadd]'); if (a) { const r = rows[Number(a.dataset.epSadd)]; await api.addClue({kind: clue?.kind || 'autre', text: r.clueText.slice(0, 590), certainty: 'supposed', source: 'donnees', why: T('Trouvé dans : {w}', {w: r.where}), place_id: ctx.place?.id || null}); a.disabled = true; api.post('journal', {id: api.inq.id, what: T('Recherche dans les données : {q}', {q: st.q || st.place}), result: r.what}).catch(() => {}); return; }
                const p = e.target.closest('[data-ep-pick]'); if (p) { const s = picks[Number(p.dataset.epPick)], host = res.querySelector(`[data-ep-pickhost="${p.dataset.epPick}"]`);
                    try { if (s.installed && !(await s.installed())) { host.innerHTML = empty(T('Pas installé.')); return; } const r = await s.fetch(ctx); host.innerHTML = `<p><b>${esc(r.title || '')}</b></p><ul>${(r.facts || []).map(f => `<li>${esc(f.label)} : ${esc(f.value)}</li>`).join('')}</ul>${api.ro ? '' : `<button type="button" class="button small secondary" data-ep-pickadd>＋ ${esc(T('Indice'))}</button>`}`;
                        host.querySelector('[data-ep-pickadd]')?.addEventListener('click', () => api.addClue({kind: 'ciel', text: `${r.title || s.label}`.slice(0, 590), why: (r.facts || []).map(f => `${f.label} : ${f.value}`).join(' · ').slice(0, 3000), certainty: 'supposed', source: 'donnees', url: r.url || ''}));
                    } catch (err) { host.innerHTML = empty(err.message || T('Pas disponible.')); } return; }
                const ds = e.target.closest('[data-ep-ds]'); if (ds) { const s = srcs[Number(ds.dataset.epDs)], host = res.querySelector(`[data-ep-dshost="${ds.dataset.epDs}"]`); host.innerHTML = UI().spinner ? UI().spinner(T('Recherche…'), {inline: true}) : ''; try { const ok = await s.run(ctx, host); if (ok === false && !host.innerHTML) host.innerHTML = empty(T('Rien ici.')); } catch (err) { host.innerHTML = empty(err.message || T('Pas disponible.')); } }
            };
        };
        dg.querySelector('[data-ep-go]').addEventListener('click', run);
        dg.querySelector('[data-ep-sform]').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
        run();
    }

    /* ═════════ ⚖ hypothèses concurrentes (dans l'onglet Indices) ═════════ */
    function hypothesesHtml(api) {
        const H = api.inq.hypotheses || []; if (!H.length && api.ro) return '';
        const rows = H.map(h => ({h, s: C().hypScore(h, api.clues)})).sort((a, b) => b.s.score - a.s.score);
        return `<h4>⚖ ${esc(T('Hypothèses concurrentes'))}</h4>${rows.length ? `<div class="ep-hypgrid">${rows.map(({h, s}, i) => `<div class="ep-hyp${i === 0 && rows.length > 1 && s.score > (rows[1]?.s.score ?? -1e9) ? ' is-best' : ''}"><b>${h.kind === 'date' ? '📅' : '🗺'} ${esc(h.label)}</b>
            <small>${esc(T('Pour : {a} · À vérifier : {b} · Contre : {c}', {a: s.pour, b: s.check, c: s.contre}))}</small>
            <ul>${api.clues.filter(c => h.stances?.[c.id]).map(c => `<li class="is-${esc(h.stances[c.id])}${c.certainty === 'refuted' ? ' is-refuted' : ''}">${esc(h.stances[c.id] === 'pour' ? '＋' : h.stances[c.id] === 'contre' ? '−' : '＝')} ${c.num} · ${esc(c.text)}</li>`).join('')}</ul>
            ${api.ro ? '' : `<div class="ep-row"><button type="button" class="button small secondary" data-ep-hypst="${h.id}">⚖ ${esc(T('Placer les indices'))}</button><button type="button" class="icon-button small" data-ep-hypdel="${h.id}" aria-label="${esc(T('Supprimer'))}" title="${esc(T('Supprimer'))}">🗑</button></div>`}</div>`).join('')}</div>${rows.length > 1 ? `<p class="ui-hint">${esc(T('Celle qui tient le mieux est en vert. Les lieux réfutés restent visibles, barrés.'))}</p>` : ''}` : ''}
            ${api.ro ? '' : `<button type="button" class="button small secondary" data-ep-hypnew>＋ ${esc(T('Une hypothèse'))}</button>`}`;
    }
    function hypClick(api, e) {
        const t = e.target;
        if (t.closest('[data-ep-hypnew]')) { editHyp(api); return true; }
        const s = t.closest('[data-ep-hypst]'); if (s) { stances(api, (api.inq.hypotheses || []).find(h => h.id === Number(s.dataset.epHypst))); return true; }
        const d = t.closest('[data-ep-hypdel]'); if (d) { (async () => { const r = await api.post('hyp_delete', {id: Number(d.dataset.epHypdel)}); await api.reload(); undoToast(T('Hypothèse supprimée'), {undo: async () => { await api.post('hyp_restore', {row: r.row}); await api.reload(); }}); })().catch(err => toast(err.message, 'error')); return true; }
        return false;
    }
    function editHyp(api, h = {}) {
        const P = window.LCNDA_PICKER;
        dlgOpen({eyebrow: T('⚖ HYPOTHÈSE'), title: h.id ? T('Hypothèse') : T('Nouvelle hypothèse'), submitLabel: h.id ? T('Enregistrer') : T('Ajouter l’hypothèse'), body: `<div class="form-grid one-column">
            <label>${esc(T('Nom'))}<input name="label" value="${esc(h.label || '')}" required placeholder="${esc(T('Brive, Tulle, vers 1910…'))}"></label>
            <label>${esc(T('Sorte'))}<select name="kind"><option value="lieu">🗺 ${esc(T('Lieu'))}</option><option value="date" ${h.kind === 'date' ? 'selected' : ''}>📅 ${esc(T('Date'))}</option></select></label>
            <div><span class="pk-lab">${esc(T('Lieu de la base'))}</span>${P?.pickerField ? P.pickerField({name: 'place_id', kind: 'place', value: h.place_id || null}) : ''}</div></div>`,
            onSubmit: async f => { await api.post('hyp_save', {id: h.id || 0, inquiry_id: api.inq.id, label: f.label.value, kind: f.kind.value, place_id: Number(f.place_id?.value) || null, stances: h.stances || {}}); await api.reload(); }});
    }
    function stances(api, h) {
        if (!h) return;
        dlgOpen({eyebrow: T('⚖ HYPOTHÈSE'), title: T('Les indices pour « {h} »', {h: h.label}), submitLabel: T('Enregistrer'), wide: true, body: `<table class="ep-stable"><tbody>${api.clues.map(c => `<tr class="${c.certainty === 'refuted' ? 'is-refuted' : ''}"><td>${c.num} · ${esc(c.text)}</td><td>${api.certBadge(c.certainty)}</td><td><select name="s_${c.id}"><option value="">—</option>${[['pour', T('pour')], ['contre', T('contre')], ['deux', T('pour les deux')]].map(([k, l]) => `<option value="${k}" ${h.stances?.[c.id] === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>`,
            onSubmit: async f => { const st = {}; api.clues.forEach(c => { const v = f.elements[`s_${c.id}`]?.value; if (v) st[c.id] = v; }); await api.post('hyp_save', {...h, inquiry_id: api.inq.id, stances: st}); await api.reload(); }});
    }

    /* ═════════ ☀️ § 5 bis le calcul d'ombre ═════════ */
    function pairs(api, im) {
        const sun = api.layersOf(im).find(l => l.id === 'sun'); if (!sun) return [];
        const v = api.viewOf ? api.viewOf(im)?.querySelector('img.ep-photo') : null, Wd = v?.naturalWidth || 1, Hd = v?.naturalHeight || 1;
        const len = s => Math.hypot((s.pts[1][0] - s.pts[0][0]) * Wd, (s.pts[1][1] - s.pts[0][1]) * Hd);
        return sun.shapes.filter(s => s.t === 'vline').map(o => { const sh = sun.shapes.find(x => x.t === 'shadow' && x.n === o.n); if (!sh) return null;
            const dx = (sh.pts[1][0] - sh.pts[0][0]) * Wd, dy = (sh.pts[1][1] - sh.pts[0][1]) * Hd;
            return {n: o.n, elev: C().elevationFrom(len(o), len(sh)), ratio: len(sh) / Math.max(1e-6, len(o)), dir: Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'toward' : 'away')}; }).filter(Boolean);
    }
    function monthsText(lst) {
        if (!lst.length) return '';
        const runs = []; lst.forEach(m => { const r = runs[runs.length - 1]; if (r && r[1] === m - 1) r[1] = m; else runs.push([m, m]); });
        if (runs.length > 1 && runs[0][0] === 1 && runs[runs.length - 1][1] === 12) { const f = runs.shift(); runs[runs.length - 1][1] = f[1] + 12; }
        return runs.map(([a, b]) => (a === b ? T('en {m}', {m: monthName(a)}) : T('de {a} à {b}', {a: monthName(a), b: monthName(((b - 1) % 12) + 1)}))).join(', ');
    }
    function shadow(api) {
        const im = api.img, P = pairs(api, im), pl = placeOf(api), tol = Number(api.prefs().tol) || 6, d = dayOfInq(api);
        const ag = C().agree(P.map(p => p.elev));
        const body = `<p class="ui-hint">${esc(T('Une ombre dit où était le soleil. Trace un objet bien droit (📏, du pied vers le haut) puis le bout de son ombre (🌑, depuis le pied).'))}</p>
            <div class="ep-row"><button type="button" class="button small secondary" data-sh="vline">📏 ${esc(T('Tracer un objet droit'))}</button><button type="button" class="button small secondary" data-sh="shadow">🌑 ${esc(T('Tracer son ombre'))}</button><button type="button" class="button small secondary" data-sh="vline">＋ ${esc(T('Un 2ᵉ objet (plus sûr)'))}</button></div>
            <div class="ep-2"><label>${esc(T('Hauteur du soleil (degrés)'))}<input name="elev" inputmode="decimal" value="${ag.mean != null ? ag.mean.toFixed(1) : ''}" data-sh-in></label><label>${esc(T('Marge (±°)'))}<input name="tol" inputmode="decimal" value="${tol}" data-sh-in></label></div>
            <div class="ep-2"><label>${esc(T('Latitude du lieu supposé'))}<input name="lat" inputmode="decimal" value="${pl?.lat != null ? pl.lat : ''}" data-sh-in placeholder="45.16"></label><label>${esc(T('Date connue (si on l’a)'))}<input name="date" value="${d ? `${d.d} ${monthName(d.m)} ${d.y}` : ''}" data-sh-in placeholder="${esc(T('14 juillet 1911'))}"></label></div>
            <div><span class="pk-lab">${esc(T('L’ombre part'))}</span>${UI().segmented ? UI().segmented({label: T('Sens de l’ombre'), cls: 'ep-shdir', items: [['right', T('vers la droite')], ['left', T('vers la gauche')], ['toward', T('vers moi')], ['away', T('vers le fond')]].map(([k, l]) => ({on: (P[0]?.dir || 'right') === k, attrs: `data-shdir="${k}"`, html: esc(l)}))}) : ''}</div>
            <div class="ep-shout" data-sh-out aria-live="polite"></div>
            <div><span class="pk-lab">${esc(T('Saison sur l’image ?'))}</span><div class="ep-chipset">${['Feuilles aux arbres', 'Arbres nus', 'Neige', 'Gens en manteau'].map(s => `<button type="button" class="ep-tag" data-sh-season="${esc(s)}" ${api.ro ? 'disabled' : ''}>${esc(T(s))}</button>`).join('')}</div></div>
            <p class="ui-hint">${esc(T('Calcul de la position du soleil (formules astronomiques usuelles), sur l’ordinateur. Une ombre ne prouve jamais un lieu ou une date à elle seule : au mieux « Probable » avec d’autres indices, et elle sait surtout réfuter (« pas en hiver »).'))}</p>`;
        let last = null, dir = P[0]?.dir || 'right';
        const calc = dg => {
            const g = n => dg.querySelector(`[name="${n}"]`)?.value.replace(',', '.'), h = Number(g('elev')), t = Number(g('tol')) || 6, lat = Number(g('lat')), out = dg.querySelector('[data-sh-out]');
            if (!(h > 0 && h < 90)) { out.innerHTML = empty(T('Trace un objet droit et son ombre, ou écris la hauteur du soleil.'), '☀️'); last = null; return; }
            const lines = [`<p><b>${esc(T('Hauteur du soleil : environ {h}° (± {t}°)', {h: Math.round(h), t}))}</b>${P[0] ? ` <small>${esc(T('l’ombre est {r} fois longue comme l’objet', {r: P[0].ratio.toFixed(2).replace('.', ',')}))}</small>` : ''}</p>`];
            if (P.length > 1) lines.push(`<p>${ag.ok ? '✓ ' + esc(T('Les {n} objets donnent le même soleil (à {g}° près).', {n: P.length, g: Math.round(ag.gap)})) : '⚠️ ' + esc(T('Les objets ne donnent pas le même soleil ({g}° d’écart) : photo penchée ou prise de haut ? Certitude baissée.', {g: Math.round(ag.gap)}))}</p>`);
            let text = T('Hauteur du soleil : environ {h}°', {h: Math.round(h)}), cert = 'supposed', data = {elev: h, tol: t};
            if (Number.isFinite(lat) && g('lat') !== '') {
                const r = C().shadowMonths(lat, h, t); data.lat = lat; data.impossible = r.impossible;
                lines.push(`<p>${esc(T('Lieu supposé : {p}', {p: pl?.name || `${lat}°`}))}</p><p><b>${esc(T('Ce qui est possible :'))}</b></p><ul>`
                    + r.other.map(o => `<li>${esc(T('{m}, {h} (heure du soleil)', {m: monthsText(o.months), h: o.ranges.map(x => T('entre {a} et {b}', {a: C().hhmm(x[0]), b: C().hhmm(x[1])})).join(T(' ou '))}))}</li>`).join('')
                    + (r.noon.length ? `<li>${esc(T('{m}, vers midi', {m: monthsText(r.noon)}))}</li>` : '')
                    + (r.impossible.length ? `<li><b>${esc(T('pas {m} : le soleil ne monte pas si haut ici.', {m: monthsText(r.impossible)}))}</b></li>` : '') + '</ul>');
                if (r.impossible.length) text = T('Ombre : soleil à environ {h}°, pas possible {m}', {h: Math.round(h), m: monthsText(r.impossible)});
                const day = C().dayOf(g('date'));
                if (day) { const s = C().shadowOnDate(lat, h, day.m, day.d);
                    if (!s.possible) { lines.push(`<p>⚠️ ${esc(T('Le {d}, le soleil ne monte pas à {h}° ici : la date ou le lieu est faux.', {d: `${day.d} ${monthName(day.m)} ${day.y}`, h: Math.round(h)}))}</p>`); cert = 'supposed'; }
                    else { const az = dir === 'left' || dir === 'away' ? s.azMorning : s.azMorning, f1 = C().facing(s.azMorning, dir), f2 = C().facing(s.azAfternoon, dir);
                        lines.push(`<p>${esc(T('Avec la date connue ({d}) : il était vers {a} (matin, soleil à l’{s1}) ou {b} (après-midi, soleil à l’{s2}), heure du soleil.', {d: `${day.d} ${monthName(day.m)} ${day.y}`, a: C().hhmm(s.morning), b: C().hhmm(s.afternoon), s1: T(C().compass(s.azMorning)), s2: T(C().compass(s.azAfternoon))}))}</p>
                            <p>${esc(T('L’ombre part {dir} : le matin, la photo regarde à peu près vers le {f1} ; l’après-midi, vers le {f2}.', {dir: T({right: 'vers la droite', left: 'vers la gauche', toward: 'vers moi', away: 'vers le fond'}[dir]), f1: T(C().compass(f1)), f2: T(C().compass(f2))}))}</p>${compassSvg(s.azMorning, f1)}`);
                        data.morning = s.morning; data.afternoon = s.afternoon; data.facing = [f1, f2]; void az; }
                }
            }
            out.innerHTML = lines.join('');
            last = {text, cert: P.length > 1 && !ag.ok ? 'supposed' : cert, data};
        };
        dlgOpen({eyebrow: T('☀️ CALCUL D’OMBRE'), title: T('Ce que dit l’ombre'), submitLabel: api.ro ? T('Fermer') : T('＋ Garder comme indice'), body,
            onOpen: dg => { dg.addEventListener('input', e => { if (e.target.matches('[data-sh-in]')) calc(dg); });
                dg.addEventListener('click', e => { const b = e.target.closest('[data-sh]'); if (b) { api.setTool(b.dataset.sh); dg.close(); toast(b.dataset.sh === 'vline' ? T('Trace l’objet droit sur la photo, du pied vers le haut.') : T('Trace l’ombre, depuis le pied de l’objet jusqu’au bout de l’ombre.')); return; }
                    const sd = e.target.closest('[data-shdir]'); if (sd) { UI().segPick?.(sd); dir = sd.dataset.shdir; calc(dg); return; }
                    const se = e.target.closest('[data-sh-season]'); if (se) { api.addClue({kind: 'date', text: T('Saison : {s}', {s: T(se.dataset.shSeason)}), certainty: 'probable', why: T('vu sur l’image')}); se.disabled = true; } });
                calc(dg); },
            onSubmit: async () => { if (api.ro) return true; if (!last) { toast(T('Rien à garder : trace d’abord l’objet et son ombre.'), 'error'); return false; }
                await api.addClue({kind: 'date', text: last.text, certainty: last.cert, source: 'ombre', why: T('Calcul d’ombre (sur l’ordinateur)'), data: {shadow: last.data}}); }});
    }
    function compassSvg(sunAz, facing) {
        const pt = (a, r) => [50 + r * Math.sin(a * Math.PI / 180), 50 - r * Math.cos(a * Math.PI / 180)];
        const [sx, sy] = pt(sunAz, 38), [fx, fy] = pt(facing, 34);
        return `<svg class="ep-compass" viewBox="0 0 100 100" width="120" height="120" role="img" aria-label="${esc(T('Le soleil et la direction de la photo'))}"><circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" opacity=".3"/><text x="50" y="12" text-anchor="middle" font-size="9">N</text><text x="91" y="53" text-anchor="middle" font-size="9">E</text><text x="50" y="96" text-anchor="middle" font-size="9">S</text><text x="9" y="53" text-anchor="middle" font-size="9">O</text>
            <circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="6" fill="#f5b400"/><line x1="50" y1="50" x2="${fx.toFixed(1)}" y2="${fy.toFixed(1)}" stroke="#055dff" stroke-width="3" marker-end="url(#epc)"/><defs><marker id="epc" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#055dff"/></marker></defs></svg>`;
    }
    /** ☀️ ombres de plusieurs photos : même jour, même heure ? */
    function multiShadow(api) {
        const rows = api.images.map(im => ({im, p: pairs(api, im)})).filter(r => r.p.length);
        if (rows.length < 2) return toast(T('Trace un objet droit et son ombre sur au moins deux images.'), 'error');
        const e = rows.map(r => C().agree(r.p.map(p => p.elev)).mean), ag = C().agree(e, 6);
        dlgOpen({eyebrow: T('☀️ OMBRES'), title: T('Ombres de plusieurs photos'), submitLabel: T('Fermer'), body: `<ul>${rows.map((r, i) => `<li>${esc(api.letterOf(r.im))} : ${esc(T('soleil à environ {h}°', {h: Math.round(e[i])}))}</li>`).join('')}</ul><p>${ag.ok ? '✓ ' + esc(T('Même hauteur de soleil (à {g}° près) : possiblement le même jour, à la même heure.', {g: Math.round(ag.gap)})) : '⚠️ ' + esc(T('Pas la même hauteur de soleil ({g}° d’écart) : pas au même moment.', {g: Math.round(ag.gap)}))}</p>`, onSubmit: () => true});
    }

    /* ═════════ 📐 perspective, 🪞 reflets, ✂ morceaux ═════════ */
    function perspective(api) {
        const l = api.layersOf(api.img).find(x => x.id === 'persp'); const L = (l?.shapes || []).filter(s => s.t === 'line');
        if (L.length < 2) { api.setTool('line'); return toast(T('Trace deux lignes de perspective (📐) le long de bords horizontaux d’un bâtiment (toit, rangée de fenêtres).')); }
        const [a, b] = L.slice(-2), [x1, y1] = a.pts[0], [x2, y2] = a.pts[1], [x3, y3] = b.pts[0], [x4, y4] = b.pts[1];
        const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(den) < 1e-9) return toast(T('Ces deux lignes sont parallèles sur l’image : choisis-en deux qui fuient vers un même point.'), 'error');
        const py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / den, pct = Math.round(py * 100);
        const where = py < 0 ? T('au-dessus de l’image : l’appareil était plus haut que tout ce qu’on voit (étage, colline).') : py > 1 ? T('sous l’image : l’appareil était très bas, ou penché vers le haut.') : T('à {p} % de la hauteur de l’image (depuis le haut).', {p: pct});
        dlgOpen({eyebrow: T('📐 PERSPECTIVE'), title: T('D’où la photo a été prise'), submitLabel: api.ro ? T('Fermer') : T('＋ Garder comme indice'), body: `<p>${esc(T('Le point de fuite des deux lignes donne la ligne d’horizon : elle passe {w}', {w: where}))}</p><p class="ui-hint">${esc(T('Tout ce qui est sur cette ligne est à la hauteur de l’appareil : les yeux d’un homme debout (environ 1,6 m), une fenêtre d’étage… Valable si la photo n’est pas penchée.'))}</p>`,
            onSubmit: async () => { if (!api.ro) await api.addClue({kind: 'lieu', text: T('Ligne d’horizon {w}', {w: where}).slice(0, 590), certainty: 'supposed', why: T('Perspective : deux lignes tracées')}); }});
    }
    async function cropCanvas(api, s, {scale = 1, mirror = false} = {}) {
        const im = api.img, faces = (im.faces || []).map(f => ({...f, t: 'blur'})); // les visages identifiés sont toujours floutés dans un morceau
        const cv = await api.composite(im, {layers: false, extraBlur: faces});
        const x = Math.max(0, Math.min(s.x, s.x + s.w)) * cv.width, y = Math.max(0, Math.min(s.y, s.y + s.h)) * cv.height, w = Math.max(1, Math.abs(s.w) * cv.width), h = Math.max(1, Math.abs(s.h) * cv.height);
        const out = document.createElement('canvas'); out.width = Math.round(w * scale); out.height = Math.round(h * scale); const g = out.getContext('2d');
        if (mirror) { g.translate(out.width, 0); g.scale(-1, 1); }
        g.drawImage(cv, x, y, w, h, 0, 0, out.width, out.height); return out;
    }
    async function saveCrop(api, s) { const cv = await cropCanvas(api, s); cv.toBlob(b => download(b, `${safeName(api.inq.title)}-morceau.png`), 'image/png'); api.post('log_export', {id: api.inq.id, what: 'morceau'}).catch(() => {}); }
    async function mirror(api, s) {
        const cv = await cropCanvas(api, s, {scale: Math.min(4, 900 / Math.max(1, Math.abs(s.w) * (api.viewOf(api.img)?.querySelector('img')?.naturalWidth || 900))), mirror: true});
        dlgOpen({eyebrow: T('🪞 REFLETS'), title: T('Le reflet, agrandi et retourné'), submitLabel: T('Fermer'), wide: true, body: `<p class="ui-hint">${esc(T('Une vitrine, une flaque, un miroir : on voit ce qu’il y avait derrière le photographe. Rien n’est inventé : seulement agrandi et retourné.'))}</p><div class="ep-mirror" data-m></div><label>${esc(T('Contraste'))} <input type="range" min="60" max="300" value="140" data-mc></label>`,
            onOpen: dg => { const host = dg.querySelector('[data-m]'); cv.style.maxWidth = '100%'; cv.style.filter = 'contrast(140%)'; host.appendChild(cv); dg.querySelector('[data-mc]').addEventListener('input', e => { cv.style.filter = `contrast(${e.target.value}%)`; }); }, onSubmit: () => true});
    }

    /* ═════════ 🌐 § 6 comparer en ligne — seulement si on veut, rien d'automatique ═════════ */
    async function compareOnline(api, s = null) {
        let pv = api.privacy || {}; try { pv = await api.get('privacy'); } catch (_) {}
        if (kiosk()) pv = {blocked: true, message: T('Mode consultation : rien ne part sur Internet.')};
        if (pv.blocked) {
            return dlgOpen({eyebrow: T('🌐 COMPARER EN LIGNE'), title: T('🔒 Pas pour cette photo'), submitLabel: T('Fermer'), body: `<p class="ui-notice ep-blocked" data-ep-blocked>🔒 ${esc(pv.message || T('Bloqué.'))}</p><p>${esc(T('Bloqué quand la photo montre une personne vivante, quand elle est confidentielle, en mode consultation et pour les invités du wifi.'))}</p>
                <button type="button" class="button small secondary" data-cmp-app>🔍 ${esc(T('Comparer avec les photos de l’app'))}</button>`,
                onOpen: dg => dg.querySelector('[data-cmp-app]').addEventListener('click', () => { dg.close(); ext.photoCompareWith?.({id: api.img.media_id, filename: api.img.media?.filename, title: api.img.media?.title}); }), onSubmit: () => true});
        }
        if (!s) { const crops = api.layersOf(api.img).find(l => l.id === 'crops'); s = crops?.shapes?.slice(-1)[0] || null; }
        if (!s) { api.setTool('crop'); return toast(T('Découpe d’abord le morceau à comparer (✂ sur l’image) : le bâtiment, sans les visages.')); }
        const cv = await cropCanvas(api, s), noFace = !(api.img.faces || []).length && !api.layersOf(api.img).some(l => l.shapes.some(x => x.t === 'blur'));
        const q = encodeURIComponent([placeOf(api)?.name, api.clues.find(c => c.kind === 'lieu')?.text].filter(Boolean).join(' ') || api.inq.title);
        const sites = [['https://lens.google.com/', 'Google Lens'], ['https://www.bing.com/visualsearch', 'Bing'], ['https://tineye.com/', 'TinEye'], ['https://yandex.com/images/', 'Yandex'], [`https://commons.wikimedia.org/w/index.php?search=${q}`, 'Wikimedia Commons']];
        dlgOpen({eyebrow: T('🌐 COMPARER EN LIGNE'), title: T('Comparer à des photos en ligne'), submitLabel: T('Fermer'), wide: true, body: `<p class="ui-notice">🌐 ${esc(T('Cette partie de la photo va être envoyée au site que tu choisis. Les visages sont floutés d’office. Le site garde peut-être l’image.'))}</p>
            ${noFace ? `<p class="ui-notice">⚠️ ${esc(T('Aucun visage marqué : s’il y a quelqu’un sur le morceau, floute-le d’abord avec ▦.'))}</p>` : ''}
            <div class="ep-cmp"><figure><div data-cmp-crop></div><figcaption>${esc(T('Morceau découpé'))}</figcaption></figure><figure><div class="ep-paste" data-cmp-paste tabindex="0">${esc(T('Une photo trouvée en ligne, collée ici pour comparer (⌘V ou glisser)'))}</div><figcaption>${esc(T('Rien n’est récupéré automatiquement sur les sites.'))}</figcaption></figure></div>
            <div class="ep-row"><button type="button" class="button small secondary" data-cmp-save>⤓ ${esc(T('Enregistrer le morceau'))}</button>${sites.map(([u, n]) => ext_(u, n)).join(' ')}</div>
            <label>${esc(T('La page trouvée (lien)'))}<input data-cmp-url inputmode="url" placeholder="https://…"></label>
            <div><span class="pk-lab">${esc(T('Ressemble :'))}</span><span class="ep-row">${[['oui', T('Oui')], ['non', T('Non')], ['peut', T('Peut-être')]].map(([k, l]) => `<button type="button" class="button small secondary" data-cmp-r="${k}" ${api.ro ? 'disabled' : ''}>${esc(l)}</button>`).join('')}</span></div>`,
            onOpen: dg => {
                cv.style.maxWidth = '100%'; dg.querySelector('[data-cmp-crop]').appendChild(cv);
                const paste = dg.querySelector('[data-cmp-paste]'), put = f => { if (!f || !/^image\//.test(f.type)) return; const u = URL.createObjectURL(f); paste.innerHTML = `<img src="${u}" alt="">`; };
                dg.addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])][0]; if (f) { e.preventDefault(); put(f); } });
                UI().bindFileDrop ? UI().bindFileDrop(paste, files => put(files[0]), {accept: 'image/*'}) : null;
                dg.addEventListener('click', async e => {
                    if (e.target.closest('[data-cmp-save]')) return saveCrop(api, s);
                    if (e.target.closest('.ui-ext-link')) api.post('journal', {id: api.inq.id, what: T('Comparé en ligne'), result: e.target.closest('a').textContent.replace('↗', '').trim()}).catch(() => {});
                    const r = e.target.closest('[data-cmp-r]'); if (!r) return; const url = dg.querySelector('[data-cmp-url]').value.trim();
                    const k = r.dataset.cmpR, cert = k === 'oui' ? 'probable' : k === 'non' ? 'refuted' : 'supposed';
                    await api.addClue({kind: 'lieu', text: k === 'oui' ? T('Ressemble à une photo trouvée en ligne') : k === 'non' ? T('Ne ressemble pas à la photo trouvée en ligne') : T('Ressemble peut-être à une photo trouvée en ligne'), certainty: cert, source: 'en_ligne', url, consulted_at: today(), why: T('Comparaison à l’œil, côte à côte')});
                    dg.close();
                });
            }, onSubmit: () => true});
    }

    /* ═════════ 🤖 § 4 l'IA en option ═════════ */
    const AI_Q = {support: 'Quel est le support de cette image (photo, carte postale, document) ?', texte: 'Y a-t-il du texte lisible sur l’image ? Recopie-le.', lieu: 'Vois-tu un bâtiment ou un paysage remarquable ?', gens: 'Quels habits, uniformes ou décorations vois-tu ?', objets: 'Quels objets vois-tu (véhicule, outil, affiche) ?', date: 'Quels détails aident à dater l’image (saison, habits, véhicules) ?', dos: 'Que vois-tu au dos (texte, tampon, timbre) ?'};
    async function ai(api, q = 'lieu') {
        if (!api.prefs().ai) return toast(T('L’IA est éteinte : ⚙️ Personnaliser pour l’allumer.'), 'error');
        if (api.ro) return;
        const qk = AI_Q[q] ? q : 'lieu', question = T(AI_Q[qk]);
        const dg = dlgOpen({eyebrow: T('🤖 L’IA REGARDE'), title: T('Question : « {q} »', {q: question}), submitLabel: T('Fermer'), wide: true, body: `<div data-ai>${UI().spinner ? UI().spinner(T('L’IA de l’ordinateur regarde l’image…')) : ''}</div><p class="ui-hint">${esc(T('Ce que l’IA dit arrive en piste à vérifier (Supposé au plus). C’est toi qui décides.'))}</p>`, onSubmit: () => true});
        let r; try { r = await api.post('ai_ask', {image_id: api.img.id, question}); } catch (e) { dg.querySelector('[data-ai]').innerHTML = `<p class="ui-notice">⛔ ${esc(e.message)}</p>`; return; }
        const host = dg.querySelector('[data-ai]');
        host.innerHTML = `${(r.observations || []).length ? `<ul class="ep-ai">${r.observations.map((o, i) => `<li data-ai-i="${i}"><b>${esc(o.text)}</b> <small class="muted">${esc(o.clarity === 'floue' ? T('vu, mais flou') : T('vu nettement'))}</small><div class="ep-row"><button type="button" class="button small" data-ai-yes="${i}">✓ ${esc(T('Oui, c’est ça'))}</button><button type="button" class="button small secondary" data-ai-no="${i}">✗ ${esc(T('Non'))}</button><button type="button" class="button small secondary" data-ai-keep="${i}">${esc(T('Garder comme piste'))}</button></div></li>`).join('')}</ul>` : ''}
            ${r.unknown || r.dont_know ? `<p>🤷 ${esc(r.unknown || T('Je ne sais pas.'))}</p>` : ''}${r.dropped ? `<p class="ui-hint">${esc(T('{n} réponse(s) sans cadre sur l’image, ou qui nommaient quelqu’un : pas gardées.', {n: r.dropped}))}</p>` : ''}`;
        host.addEventListener('click', async e => {
            const b = e.target.closest('[data-ai-yes], [data-ai-no], [data-ai-keep]'); if (!b) return; const li = b.closest('li'), o = r.observations[Number(li.dataset.aiI)];
            if (b.dataset.aiNo != null) { li.classList.add('is-refuted'); li.querySelectorAll('button').forEach(x => { x.disabled = true; }); api.post('journal', {id: api.inq.id, what: T('🤖 Réponse de l’IA écartée'), result: o.text}).catch(() => {}); return; }
            const im = api.img, shape = {id: Math.random().toString(36).slice(2, 10), t: 'rect', x: o.box[0], y: o.box[1], w: o.box[2], h: o.box[3]};
            const clue = await api.addClue({kind: {texte: 'texte', gens: 'gens', objets: 'objet', date: 'date', support: 'support', dos: 'dos'}[qk] || 'lieu', text: o.text, certainty: 'supposed', source: 'ia', shape_id: shape.id, why: b.dataset.aiYes != null ? T('Vu par l’IA, et je le vois aussi') : T('Piste de l’IA, pas encore vérifiée')});
            if (clue) { shape.clue = clue.id; shape.n = clue.num; api.change(im, () => api.layersOf(im).push({id: `c${clue.id}`, name: `${clue.num} · 🤖 ${clue.text.slice(0, 36)}`, visible: true, locked: false, shapes: [shape]})); }
            li.querySelectorAll('button').forEach(x => { x.disabled = true; });
        });
    }

    /* ═════════ 👪 l'arbre : âge, qui manque, fête, deuil ═════════ */
    async function treeDialog(api, what, extra = {}) {
        const w = yearWin(api), q = {what, from: w.from || '', to: w.to || '', ...extra};
        let r; try { r = await api.get('tree', q); } catch (e) { return toast(e.message, 'error'); }
        const person = p => `<button type="button" class="link-button" data-ep-pid="${p.id}" ${p.id ? '' : 'disabled'}>${esc(p.name)}</button>${p.birth || p.death ? ` <small class="muted">(${p.birth || '?'}-${p.death || ''})</small>` : ''}`;
        let title = '', body = '';
        if (what === 'ages') { title = T('🧒 Enfants de l’arbre d’environ {a} ans ({f}-{t})', {a: r.age, f: r.from, t: r.to}); body = r.people.length ? `<ul>${r.people.map(p => `<li>${person(p)} — ${esc(T('{a} à {b} ans', {a: p.age_from, b: p.age_to}))}${p.close ? ` · ${esc(T('proche des personnes de la photo'))}` : ''}</li>`).join('')}</ul>` : empty(T('Personne de cet âge dans l’arbre à cette date.')); }
        if (what === 'missing') { const rel = {parent: T('parent'), sibling: T('frère ou sœur'), spouse: T('conjoint'), child: T('enfant')}; title = T('👥 Qui manque ? (vers {y})', {y: r.year});
            body = `${r.on_photo.length ? `<p>${esc(T('Sur la photo :'))} ${r.on_photo.map(person).join(', ')}</p>` : `<p class="ui-hint">${esc(T('Relie d’abord les personnes de la photo (identifiées sur l’image, ou « 🔗 Relier… »).'))}</p>`}${r.people.length ? `<p>${esc(T('Proches vivants à cette date, pas sur la photo :'))}</p><ul>${r.people.map(p => `<li>${person(p)} · ${esc(rel[p.relation] || '')}</li>`).join('')}</ul>` : empty(T('Personne ne manque d’après l’arbre.'))}`; }
        if (what === 'events') { const ev = r.events.filter(e => (extra.only ? e.kind === extra.only : true)); title = extra.only === 'deuil' ? T('🖤 Décès de l’arbre dans la fenêtre de dates') : T('🎉 Les événements de l’arbre qui collent');
            body = ev.length ? `<ul>${ev.map(e => `<li>${e.kind === 'deuil' ? '🖤' : '🎉'} <b>${esc(e.label)}</b> ${esc(e.date || e.year)} — ${e.who.map(person).join(', ')}${api.ro ? '' : ` <button type="button" class="button small secondary" data-ep-evadd="${e.id}">＋ ${esc(T('Indice'))}</button>`}</li>`).join('')}</ul>` : empty(T('Aucun événement de l’arbre dans cette fenêtre.')); r.ev = ev; }
        dlgOpen({eyebrow: T('👪 L’ARBRE'), title, submitLabel: T('Fermer'), wide: true, body: `${body}<p class="ui-hint">${esc(T('Jamais d’analyse des visages : seulement les dates de l’arbre.'))}</p>`,
            onOpen: dg => dg.addEventListener('click', e => { const p = e.target.closest('[data-ep-pid]'); if (p) { dg.close(); A().openPersonById?.(Number(p.dataset.epPid)); }
                const a = e.target.closest('[data-ep-evadd]'); if (a) { const ev = r.ev.find(x => x.id === Number(a.dataset.epEvadd)); api.addClue({kind: 'gens', text: `${ev.label} ${ev.date || ev.year} — ${ev.who.map(x => x.name).join(', ')}`.slice(0, 590), certainty: 'supposed', source: 'famille', date_from: ev.year, date_to: ev.year, why: T('Événement de l’arbre qui colle avec la photo')}); a.disabled = true; } }), onSubmit: () => true});
    }
    async function askAge(api, school = false) {
        const v = await A().askText?.({title: school ? T('🏫 Photo de classe : âge des enfants') : T('🧒 Âge apparent'), message: T('Âge d’environ… (en années). Rien n’est calculé d’après les visages.'), placeholder: '6', inputMode: 'numeric'});
        const age = Number(v); if (!(age >= 0 && age < 110)) return;
        if (!api.ro) await api.addClue({kind: 'gens', text: school ? T('Photo de classe : enfants d’environ {a} ans', {a: age}) : T('Enfant d’environ {a} ans', {a: age}), certainty: 'supposed', data: {age}});
        treeDialog(api, 'ages', {age});
    }

    /* ═════════ 🌙 la lune ═════════ */
    function moon(api) {
        const L = window.LCNDA_LUNE, w = yearWin(api); if (!L) return toast(T('Le calendrier de la lune n’est pas chargé.'), 'error');
        dlgOpen({eyebrow: T('🌙 LA LUNE'), title: T('La phase de la lune sur une photo de nuit'), submitLabel: T('Fermer'), wide: true, body: `<div class="ep-2"><label>${esc(T('Phase vue'))}<select data-mp>${[[0, T('nouvelle lune')], [90, T('premier quartier')], [180, T('pleine lune')], [270, T('dernier quartier')]].map(([a, l]) => `<option value="${a}">${esc(l)}</option>`).join('')}</select></label><label>${esc(T('De'))}<input data-mf value="${w.from || ''}" inputmode="numeric" placeholder="1905"></label><label>${esc(T('À'))}<input data-mt value="${w.to || ''}" inputmode="numeric" placeholder="1915"></label></div><div data-mo aria-live="polite"></div><p class="ui-hint">${esc(T('Calendrier de la lune de l’app, sur l’ordinateur. À un jour près ; la nuit autour de la date.'))}</p>`,
            onOpen: dg => { const run = () => { const a = Number(dg.querySelector('[data-mp]').value), f = Number(dg.querySelector('[data-mf]').value), t = Number(dg.querySelector('[data-mt]').value) || f, out = dg.querySelector('[data-mo]');
                    if (!(f > 1000) || t < f) { out.innerHTML = empty(T('Donne une fenêtre d’années (la frise).'), '🌙'); return; } if (t - f > 40) { out.innerHTML = empty(T('Fenêtre trop large : 40 ans au plus.'), '🌙'); return; }
                    const list = []; let j = L.jd(f, 1, 1); const end = L.jd(t, 12, 31, 24); while (list.length < 600) { j = L.nextPhase(j + 0.5, a); if (j > end) break; const d = L.fromJd(j); list.push(`${d.d} ${monthName(d.m)} ${d.y}`); }
                    out.innerHTML = `<p><b>${esc(T('{n} dates possibles', {n: list.length}))}</b></p><p class="ep-moonlist">${list.slice(0, 160).map(esc).join(' · ')}${list.length > 160 ? ' …' : ''}</p>`; };
                dg.addEventListener('input', run); run(); }, onSubmit: () => true});
    }

    /* ═════════ 🏷 EXIF ═════════ */
    async function exif(api) {
        const im = api.img; if (!im?.media?.filename) return;
        let r = null; try { const b = await fetch(api.mediaSrc(im.media)).then(x => x.arrayBuffer()); r = C().readExif(b); } catch (_) {}
        if (!r) return dlgOpen({eyebrow: T('🏷 MÉTADONNÉES'), title: T('Métadonnées cachées (EXIF)'), submitLabel: T('Fermer'), body: empty(T('Pas de métadonnées dans ce fichier (photo scannée, ou effacées).'), '🏷'), onSubmit: () => true});
        const y = C().yearOf(r.date);
        dlgOpen({eyebrow: T('🏷 MÉTADONNÉES'), title: T('Métadonnées cachées (EXIF)'), submitLabel: api.ro ? T('Fermer') : T('＋ Garder comme indice'), body: `<dl class="ep-dl">${r.date ? `<dt>${esc(T('Date de prise de vue'))}</dt><dd>${esc(r.date)}</dd>` : ''}${r.make || r.model ? `<dt>${esc(T('Appareil'))}</dt><dd>${esc([r.make, r.model].filter(Boolean).join(' '))}</dd>` : ''}${r.lat != null ? `<dt>GPS</dt><dd>${r.lat}, ${r.lon}</dd>` : ''}${r.software ? `<dt>${esc(T('Logiciel'))}</dt><dd>${esc(r.software)}</dd>` : ''}</dl>
            <p class="ui-hint">${esc(T('Lu sur l’ordinateur. Une date EXIF est un indice fort, mais « Probable » seulement : l’horloge de l’appareil peut être fausse. Un scan porte la date du scan.'))}</p>`,
            onSubmit: async () => { if (api.ro) return; if (r.date) await api.addClue({kind: 'date', text: T('Date EXIF : {d}', {d: r.date}), certainty: 'probable', source: 'exif', date_from: y, date_to: y, why: [r.make, r.model].filter(Boolean).join(' ')});
                if (r.lat != null) await api.addClue({kind: 'lieu', text: T('Position GPS : {a}, {b}', {a: r.lat, b: r.lon}), certainty: 'probable', source: 'exif', data: {lat: r.lat, lon: r.lon}}); }});
    }

    /* ═════════ 📮 photographes, 📒 repères, 🧱 mur, 🎓 exercice ═════════ */
    async function photographers(api = null) {
        let list = []; try { list = (await EP()._get('photographers')).photographers || []; } catch (_) {}
        const ro = kiosk();
        const dg = dlgOpen({eyebrow: T('📮 PHOTOGRAPHES'), title: T('Photographes et éditeurs'), submitLabel: T('Fermer'), wide: true, body: `<p class="ui-hint">${esc(T('Ta liste, que tu complètes toi-même : nom, ville, adresse, années d’activité. Un tampon au dos donne alors une fourchette de dates et une ville probable.'))}</p>
            <div data-ph>${list.length ? `<table class="ep-stable"><tbody>${list.map(p => `<tr><td><b>${esc(p.name)}</b><br><small>${esc([p.city, p.address].filter(Boolean).join(' · '))}</small></td><td>${esc([p.year_from, p.year_to].filter(Boolean).join(' – '))}</td><td>${p.url ? ext_(p.url, '') : ''}</td><td>${api && !api.ro ? `<button type="button" class="button small secondary" data-ph-clue="${p.id}">＋ ${esc(T('Indice'))}</button>` : ''}${ro ? '' : `<button type="button" class="icon-button small" data-ph-del="${p.id}" aria-label="${esc(T('Supprimer'))}" title="${esc(T('Supprimer'))}">🗑</button>`}</td></tr>`).join('')}</tbody></table>` : empty(T('Aucun photographe pour l’instant.'), '📮')}</div>
            ${ro ? '' : `<button type="button" class="button small" data-ph-new>＋ ${esc(T('Un photographe ou un éditeur'))}</button>`}`, onSubmit: () => true});
        dg?.addEventListener('click', async e => {
            if (e.target.closest('[data-ph-new]')) { dg.close(); return dlgOpen({eyebrow: T('📮 PHOTOGRAPHE'), title: T('Nouveau photographe'), submitLabel: T('Ajouter'), body: `<div class="form-grid one-column"><label>${esc(T('Nom (tel qu’écrit sur le tampon)'))}<input name="name" required placeholder="Phot. J. LACOMBE"></label><label>${esc(T('Ville'))}<input name="city"></label><label>${esc(T('Adresse'))}<input name="address"></label><div class="ep-2"><label>${esc(T('Actif de'))}<input name="year_from" inputmode="numeric"></label><label>${esc(T('à'))}<input name="year_to" inputmode="numeric"></label></div><label>${esc(T('Source (lien)'))}<input name="url" inputmode="url"></label></div>`,
                onSubmit: async f => { await EP()._post('photographer_save', Object.fromEntries(new FormData(f))); photographers(api); }}); }
            const d = e.target.closest('[data-ph-del]'); if (d) { const r = await EP()._post('photographer_delete', {id: Number(d.dataset.phDel)}); dg.close(); photographers(api); undoToast(T('Photographe supprimé'), {undo: async () => { await EP()._post('photographer_restore', {row: r.row}); photographers(api); }}); }
            const c = e.target.closest('[data-ph-clue]'); if (c && api) { const p = list.find(x => x.id === Number(c.dataset.phClue)); dg.close(); api.editClue({kind: 'support', text: T('Photographe : {n}', {n: p.name}), certainty: 'probable', date_from: p.year_from || null, date_to: p.year_to || null, why: [p.city, p.address].filter(Boolean).join(' · '), url: p.url || '', data: {photographer: p.name}, images: {[api.img?.id]: 'yes'}}); }
        });
    }
    async function keepLandmark(api, c) {
        try { await api.post('landmark_save', {label: c.text, kind: c.kind, place_id: c.place_id || api.inq.conclusion?.place?.place_id || null, media_id: api.img?.media_id || null, inquiry_id: api.inq.id}); toast(T('📒 « {t} » gardé comme repère : il sera proposé pour les photos suivantes.', {t: c.text})); } catch (e) { toast(e.message, 'error'); }
    }
    async function landmarks() {
        let list = []; try { list = (await EP()._get('landmarks')).landmarks || []; } catch (_) {}
        const dg = dlgOpen({eyebrow: T('📒 REPÈRES'), title: T('Carnet de repères'), submitLabel: T('Fermer'), body: list.length ? `<ul class="ep-guide">${list.map(l => `<li>${l.filename ? `<img src="media/${encodeURIComponent(l.filename)}" alt="" class="ep-th">` : ''}<div><b>${esc(l.label)}</b><br><small>${esc(l.place_name || '')}</small></div>${kiosk() ? '' : `<button type="button" class="icon-button small" data-lm-del="${l.id}" aria-label="${esc(T('Supprimer'))}" title="${esc(T('Supprimer'))}">🗑</button>`}</li>`).join('')}</ul>` : empty(T('Aucun repère : dans une enquête, ⋯ d’un indice → « 📒 Garder comme repère ».'), '📒'), onSubmit: () => true});
        dg?.addEventListener('click', async e => { const d = e.target.closest('[data-lm-del]'); if (!d) return; const r = await EP()._post('landmark_delete', {id: Number(d.dataset.lmDel)}); dg.close(); landmarks(); undoToast(T('Repère supprimé'), {undo: async () => { await EP()._post('landmark_restore', {row: r.row}); }}); });
    }
    async function wall(ctx) {
        let list = []; try { list = (await EP()._get('wall')).media || []; } catch (_) {}
        const dg = dlgOpen({eyebrow: T('🧱 MUR'), title: T('Les photos sans nom'), submitLabel: T('Fermer'), wide: true, body: list.length ? `<p class="ui-hint">${esc(T('Toutes les photos sans lieu ou sans date, rangées par avancement.'))}</p><div class="ep-wall">${list.map(m => `<button type="button" class="ep-wtile" data-wall="${m.id}" title="${esc(m.title)}"><img src="media/${encodeURIComponent(m.filename)}" alt="" loading="lazy"><small>${esc(m.title || '')}</small><small class="muted">${esc([m.no_place ? T('sans lieu') : '', m.no_date ? T('sans date') : '', m.n_clues ? plural(m.n_clues, 'indice') : ''].filter(Boolean).join(' · '))}</small></button>`).join('')}</div>` : empty(T('Toutes tes photos ont un lieu et une date.'), '🧱'), onSubmit: () => true});
        dg?.addEventListener('click', e => { const t = e.target.closest('[data-wall]'); if (t) { dg.close(); EP().forMedia([Number(t.dataset.wall)]); } });
    }
    async function nextUnnamed(api) {
        let list = []; try { list = (await EP()._get('wall')).media || []; } catch (_) {}
        const m = list.find(x => !x.n_inq && !api.images.some(i => i.media_id === x.id)); if (!m) return toast(T('Plus de photo sans nom ni enquête.'));
        api.dlg.close(); EP().create([m.id]);
    }
    /** 🎓 une photo-énigme d'exemple, dessinée ici (fictive, libre de droits) */
    async function exercise(ctx) {
        if (kiosk() || !ext.rtUploadCopy) return toast(T('Pas en mode consultation.'), 'error');
        const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 780; const g = cv.getContext('2d');
        const sky = g.createLinearGradient(0, 0, 0, 480); sky.addColorStop(0, '#d9c7a3'); sky.addColorStop(1, '#efe3c8'); g.fillStyle = sky; g.fillRect(0, 0, 1200, 780);
        g.fillStyle = '#b9a47f'; g.fillRect(0, 520, 1200, 260); // la place
        g.fillStyle = '#8c7656'; g.fillRect(820, 200, 160, 340); g.beginPath(); g.ellipse(900, 190, 60, 70, 0, Math.PI, 0); g.fill(); g.fillRect(895, 70, 10, 60); // clocher à bulbe
        g.fillStyle = '#9b8562'; g.fillRect(80, 250, 620, 290); g.fillStyle = '#6f5c40'; [140, 320, 500].forEach(x => g.fillRect(x, 330, 70, 110));
        g.fillStyle = '#efe6d0'; g.fillRect(150, 268, 480, 46); g.fillStyle = '#3d3224'; g.font = 'bold 34px Georgia, serif'; g.textAlign = 'center'; g.fillText('HÔTEL DE LA POSTE', 390, 303);
        g.fillStyle = '#5a4a34'; g.fillRect(560, 560, 14, 120); g.fillStyle = 'rgba(60,45,30,.45)'; g.beginPath(); g.moveTo(574, 680); g.lineTo(700, 680); g.lineTo(700, 690); g.lineTo(574, 690); g.fill(); // un poteau et son ombre
        g.fillStyle = '#2f271c'; g.font = 'italic 24px Georgia, serif'; g.textAlign = 'left'; g.fillText('12 — La Place et l’Église', 40, 750); g.font = '16px Georgia, serif'; g.fillText('Phot. J. LACOMBE (exemple fictif)', 900, 750);
        const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9));
        try { const r = await ext.rtUploadCopy(blob, {title: T('🎓 Exercice — carte postale fictive')}); const id = Number(r.media_id || r.id); const q = await EP()._post('create', {media_ids: [id], title: T('🎓 Exercice : la place')}); ctx?.again?.(); EP().open(q.id, {panel: 'questions'}); toast(T('Exercice : entoure l’enseigne, lis le texte, mesure l’ombre du poteau, puis conclus.')); }
        catch (e) { toast(e.message, 'error'); }
    }
    function openGlobal(k, ctx) { return {wall: () => wall(ctx), exercice: () => exercise(ctx), photographes: () => photographers(null), reperes: () => landmarks()}[k]?.(); }

    /* ═════════ 📍 photos proches, 🧩 photos sœurs ═════════ */
    async function nearby(api) {
        const pl = placeOf(api); if (pl?.lat == null) return toast(T('Il faut un lieu placé sur la carte (conclusion, hypothèse ou indice).'), 'error');
        let r; try { r = await api.get('nearby', {lat: pl.lat, lon: pl.lon, km: 2, not: api.inq.id}); } catch (e) { return toast(e.message, 'error'); }
        mediaGrid(api, T('📍 Mes photos à moins de 2 km de {p}', {p: pl.name || ''}), r.media, m => T('{k} km', {k: String(m.km).replace('.', ',')}));
    }
    async function sisters(api) {
        let r; try { r = await api.get('sisters'); } catch (e) { return toast(e.message, 'error'); }
        mediaGrid(api, T('🧩 Photos sœurs'), r.media, m => T('même nom : {n}', {n: m.why}), r.names.length ? '' : T('Note d’abord le photographe ou l’éditeur (question « Le support » → 📮 Le photographe).'));
    }
    function mediaGrid(api, title, list, sub, hint = '') {
        const dg = dlgOpen({eyebrow: T('🔎 ENQUÊTE PHOTO'), title, submitLabel: T('Fermer'), wide: true, body: `${hint ? `<p class="ui-hint">${esc(hint)}</p>` : ''}${list.length ? `<div class="ep-wall">${list.map(m => `<div class="ep-wtile"><img src="media/${encodeURIComponent(m.filename)}" alt="" loading="lazy"><small>${esc(m.title)}</small><small class="muted">${esc(sub(m))}</small>${api.ro ? '' : `<button type="button" class="button small secondary" data-add="${m.id}">＋ ${esc(T('Dans l’enquête'))}</button>`}</div>`).join('')}</div>` : empty(T('Rien trouvé.'))}`, onSubmit: () => true});
        dg?.addEventListener('click', e => { const b = e.target.closest('[data-add]'); if (b) { b.disabled = true; EP().current?.addImages([Number(b.dataset.add)]); } });
    }

    /* ═════════ 📖 raconter, 🛡 partager sans risque, ✉️ demander à un cousin ═════════ */
    async function imagesHtml(api, {safe = false, layers = true} = {}) {
        const out = [];
        for (const im of api.images) { if (im.media?.media_type !== 'image' || !im.media.filename) continue;
            const faces = safe ? (im.faces || []).filter(f => f.private).map(f => ({...f, t: 'blur'})) : [];
            try { const cv = await api.composite(im, {layers, extraBlur: faces}); const k = Math.min(1, 1400 / Math.max(cv.width, cv.height)), sm = document.createElement('canvas'); sm.width = Math.round(cv.width * k); sm.height = Math.round(cv.height * k); sm.getContext('2d').drawImage(cv, 0, 0, sm.width, sm.height);
                out.push(`<figure><img src="${sm.toDataURL('image/jpeg', 0.85)}" alt=""><figcaption>${esc(api.letterOf(im))} · ${esc(im.label || im.media.title || '')}</figcaption></figure>`); } catch (_) {} }
        return out.join('');
    }
    async function storyHtml(api, {safe = false} = {}) {
        const inq = api.inq, c = inq.conclusion || {}, privNames = (inq.links || []).filter(l => l.private).map(l => l.label.replace(/\s*\(.*\)$/, '')).filter(Boolean);
        const hide = t => (safe && privNames.some(n => n && String(t).includes(n)));
        const clues = api.clues.filter(x => !hide(x.text) && !hide(x.why));
        const css = 'body{font:15px/1.5 Georgia,serif;color:#222;max-width:820px;margin:24px auto;padding:0 16px}h1{font-size:26px}figure{margin:12px 0}img{max-width:100%}li.r{text-decoration:line-through;color:#888}.b{font:11px system-ui;border:1px solid;padding:0 4px;text-transform:uppercase}';
        const certW = k => T(api.CERT[k]?.[0] || '');
        return `<!doctype html><html lang="fr"><meta charset="utf-8"><title>${esc(inq.title)}</title><style>${css}</style><body>
            <h1>🔎 ${esc(T('Comment on a retrouvé ce lieu : {t}', {t: inq.title}))}</h1>${await imagesHtml(api, {safe})}
            <h2>${esc(T('Les indices'))}</h2><ol>${clues.map(x => `<li class="${x.certainty === 'refuted' ? 'r' : ''}"><b>${esc(x.text)}</b> <span class="b">${esc(certW(x.certainty))}</span>${x.why && !safe ? ` — ${esc(x.why)}` : ''}${x.url ? ` (<a href="${esc(x.url)}">${esc(T('source'))}</a>)` : ''}</li>`).join('')}</ol>
            ${(inq.hypotheses || []).length ? `<h2>${esc(T('Les hypothèses'))}</h2><ul>${inq.hypotheses.map(h => { const s = C().hypScore(h, api.clues); return `<li>${esc(h.label)} — ${esc(T('Pour : {a} · À vérifier : {b} · Contre : {c}', {a: s.pour, b: s.check, c: s.contre}))}</li>`; }).join('')}</ul>` : ''}
            <h2>${esc(T('Ma conclusion'))}</h2><p>${c.place ? `🗺 ${esc(c.place.name || '')} <span class="b">${esc(certW(c.place.certainty))}</span>` : ''}${c.date ? `<br>📅 ${esc(c.date.text || '')} <span class="b">${esc(certW(c.date.certainty))}</span>` : ''}${!c.place && !c.date ? esc(T('Pas encore de conclusion.')) : ''}</p>
            ${!safe && (inq.journal || []).length ? `<h2>${esc(T('Le journal de l’enquête'))}</h2><ul>${inq.journal.slice().reverse().map(j => `<li>${esc(j.created_at.slice(0, 10))} — ${esc(j.what)}${j.result ? ` : ${esc(j.result)}` : ''}</li>`).join('')}</ul>` : ''}
            ${safe ? `<p><small>${esc(T('Partagé sans risque : visages des vivants floutés, données privées retirées.'))}</small></p>` : ''}</body></html>`;
    }
    async function story(api, {safe = false} = {}) {
        const html = await storyHtml(api, {safe});
        dlgOpen({eyebrow: safe ? T('🛡 PARTAGER SANS RISQUE') : T('📖 RACONTER L’ENQUÊTE'), title: safe ? T('Partager sans risque') : T('Raconter l’enquête'), submitLabel: T('Fermer'), wide: true,
            body: `<p class="ui-hint">${esc(safe ? T('Les visages des personnes vivantes ou confidentielles (identifiées sur l’image) et les zones ▦ sont floutés ; les notes, le journal et les noms des vivants sont retirés.') : T('Une page « Comment on a retrouvé ce lieu » pour le livre ou le site familial.'))}</p>
                <iframe class="ep-story" sandbox="" title="${esc(T('Aperçu'))}"></iframe><div class="ep-row"><button type="button" class="button small" data-st-print>🖨 ${esc(T('Imprimer ou PDF…'))}</button><button type="button" class="button small secondary" data-st-dl>⤓ ${esc(T('Télécharger la page (.html)'))}</button></div>`,
            onOpen: dg => { dg.querySelector('iframe').srcdoc = html;
                dg.addEventListener('click', e => { if (e.target.closest('[data-st-print]')) { UI().openPrintDialog ? UI().openPrintDialog({title: api.inq.title, key: 'enquete-photo', html}) : toast(T('L’impression n’est pas prête.'), 'error'); api.post('log_export', {id: api.inq.id, kind: 'print', what: safe ? 'partage' : 'raconter'}).catch(() => {}); }
                    if (e.target.closest('[data-st-dl]')) { download(new Blob([html], {type: 'text/html'}), `${safeName(api.inq.title)}${safe ? '-partage' : ''}.html`); api.post('log_export', {id: api.inq.id, what: safe ? 'partage' : 'raconter'}).catch(() => {}); } }); },
            onSubmit: () => true});
    }
    async function cousin(api) {
        const qs = [...api.clues.filter(c => c.certainty !== 'proven' && c.certainty !== 'refuted').map(c => T('{n}. « {t} » : est-ce juste ? Que sais-tu de plus ?', {n: c.num, t: c.text})), ...C().missing(api.inq).map(missingText), T('Qui est sur la photo ? Où et quand a-t-elle été prise ?')];
        const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><title>${esc(api.inq.title)}</title><style>body{font:14px/1.5 Georgia,serif;margin:0}h1{font-size:20px}figure{margin:6px 0}img{max-width:100%;max-height:120mm}li{margin:6px 0 18px}.l{border-bottom:1px dotted #999;height:22px}</style><body>
            <h1>✉️ ${esc(T('Peux-tu m’aider à reconnaître cette photo ?'))}</h1>${await imagesHtml(api, {safe: true})}<p>${esc(T('Les zones entourées ont un numéro. Écris ce que tu sais, même si tu n’es pas sûr.'))}</p>
            <ol>${qs.map(q => `<li>${esc(q.replace(/^\d+\.\s*/, ''))}<div class="l"></div><div class="l"></div></li>`).join('')}</ol></body></html>`;
        if (!UI().openPrintDialog) return toast(T('L’impression n’est pas prête.'), 'error');
        UI().openPrintDialog({title: T('Demander à un cousin'), key: 'enquete-photo-cousin', html}); api.post('log_export', {id: api.inq.id, kind: 'print', what: 'cousin'}).catch(() => {});
    }

    /* ═════════ 🔤 Deviner un texte avec une police (validé) ═════════
     * Un cadre sur l'enseigne, le texte deviné (« ? » pour une lettre douteuse), une police qui ressemble (seulement celles de
     * l'ordinateur : rien n'est téléchargé), posé en transparence sur la photo : taille, espacement, largeur, rotation, penchée,
     * 4 coins (perspective), opacité, couleur, « clignoter ». Note par lettre et en tout : « colle bien / à moitié / ne colle pas ».
     * Chaque essai gardé est un indice (source « police ») : « Supposé » au plus, « Probable » seulement confirmé par un autre indice. */
    const FONTS = [
        ['serif', 'Capitales à empattements', '"Times New Roman", Times, "Liberation Serif", "DejaVu Serif", Georgia, serif'],
        ['didone', 'Didone (Didot, Bodoni)', 'Didot, "Bodoni 72", "Bodoni MT", "Times New Roman", serif'],
        ['slab', 'Égyptienne (empattements carrés)', 'Rockwell, "Roboto Slab", "Courier New", "Liberation Mono", monospace'],
        ['grotesk', 'Grotesque (sans empattements)', '"Helvetica Neue", Helvetica, Arial, "Liberation Sans", "DejaVu Sans", sans-serif'],
        ['narrow', 'Grotesque étroite', '"Arial Narrow", "Liberation Sans Narrow", "DejaVu Sans Condensed", Impact, sans-serif'],
        ['script', 'Écriture (script)', '"Brush Script MT", "Segoe Script", "Apple Chancery", "URW Chancery L", cursive'],
        ['stencil', 'Pochoir', 'Stencil, "Stencil Std", Impact, fantasy'],
        ['deco', 'Art déco', 'Copperplate, "Copperplate Gothic Light", Futura, "Century Gothic", Avenir, sans-serif']];
    const fontOf = k => FONTS.find(f => f[0] === k) || FONTS[0];
    /** la 1ʳᵉ police de la pile est-elle sur cet ordinateur ? (largeur comparée à la police de secours) */
    const fontThere = stack => { try { const g = document.createElement('canvas').getContext('2d'), first = stack.split(',')[0].trim(); g.font = '40px monospace'; const a = g.measureText('HÔTEL MAZAUD wi').width; g.font = `40px ${first}, monospace`; return g.measureText('HÔTEL MAZAUD wi').width !== a; } catch (_) { return true; } };
    const RATES = [['good', 'colle bien'], ['half', 'colle à moitié'], ['bad', 'ne colle pas']];
    let fontSt = null; // {api, draft, editing (id de l'indice), blink}
    const defGuess = frame => ({frame, text: '', style: 'serif', weight: 700, size: 0.78, spacing: 0.04, stretch: 1, skew: 0, rot: 0, corners: [[0, 0], [0, 0], [0, 0], [0, 0]], opacity: 0.6, color: '#d1242f', rating: {overall: '', letters: []}, shown: true});
    function fontGuess(api, {frame = null, clue = null} = {}) {
        if (api.ro) return;
        if (!frame && !clue) { api.setTool('fontframe'); return toast(T('Encadre l’enseigne sur la photo (▭), puis écris ce que tu crois lire.')); }
        fontSt = {api, draft: clue ? {...defGuess(clue.data.font.frame), ...clue.data.font} : defGuess(frame), editing: clue?.id || 0, image: clue ? Number(clue.data.font.image) : api.img.id, blink: null, confirmed: clue?.data?.confirmed_by || 0};
        if (clue) fontSt.draft.text = clue.data.font.text || '';
        api.setPanel('font');
    }
    const guesses = api => api.clues.filter(c => c.source === 'police' && c.data?.font);
    function renderFont(api, pane) {
        if (!fontSt || fontSt.api.inq.id !== api.inq.id) fontSt = {api, draft: null, editing: 0, image: api.img?.id, blink: null};
        fontSt.api = api;
        const g = fontSt.draft, list = guesses(api);
        const sl = (k, label, min, max, step, unit = '') => `<label class="ep-sl">${esc(T(label))}<input type="range" min="${min}" max="${max}" step="${step}" value="${g[k]}" data-epf="${k}"><output>${esc(String(g[k]))}${unit}</output></label>`;
        const others = api.clues.filter(c => c.source !== 'police' && c.certainty !== 'refuted');
        pane.innerHTML = `<div class="ep-fonthead"><button type="button" class="link-button" data-epf-back>← ${esc(T('Questions'))}</button><b>🔤 ${esc(T('Essayer une police'))}</b></div>
            <p class="ui-hint">${esc(T('Pour une enseigne à moitié cachée ou floue : écris ce que tu crois lire, et regarde si ça colle. Un essai seul reste « Supposé ».'))}</p>
            ${g ? `<div class="ep-fontform">
                <label>${esc(T('Texte deviné (« ? » pour une lettre douteuse)'))}<input data-epf-text value="${esc(g.text)}" placeholder="HÔTEL DE LA P?STE" autocomplete="off"></label>
                <label>${esc(T('Police'))}<select data-epf="style">${['serif', 'didone', 'slab', 'grotesk', 'narrow', 'script', 'stencil', 'deco'].map(k => { const f = fontOf(k); return `<option value="${k}" ${g.style === k ? 'selected' : ''} style="font-family:${esc(f[2])}">${esc(T(f[1]))}${fontThere(f[2]) ? '' : ` (${esc(T('remplacée : pas sur cet ordinateur'))})`}</option>`; }).join('')}</select></label>
                <label>${esc(T('Graisse'))}<select data-epf="weight"><option value="400" ${g.weight == 400 ? 'selected' : ''}>${esc(T('normale'))}</option><option value="700" ${g.weight == 700 ? 'selected' : ''}>${esc(T('grasse'))}</option></select></label>
                ${sl('size', 'Taille', 0.2, 1.6, 0.01)}${sl('spacing', 'Espacement des lettres', -0.15, 0.6, 0.01)}${sl('stretch', 'Largeur', 0.4, 2.2, 0.01)}${sl('rot', 'Rotation', -30, 30, 0.5, '°')}${sl('skew', 'Penchée', -30, 30, 0.5, '°')}${sl('opacity', 'Opacité', 0.1, 1, 0.05)}
                <label>${esc(T('Couleur'))}<input type="color" data-epf="color" value="${esc(g.color)}"></label>
                <p class="ui-hint">${esc(T('Glisse les 4 coins sur la photo pour suivre la perspective de l’enseigne.'))}</p>
                <div class="ep-row"><label class="ui-toggle"><input type="checkbox" data-epf-blink ${fontSt.blink ? 'checked' : ''}><i></i>${esc(T('Clignoter (le texte, puis la photo)'))}</label><button type="button" class="button small secondary" data-epf-corners>↺ ${esc(T('Remettre les coins'))}</button></div>
                <div><span class="pk-lab">${esc(T('En tout, ça colle ?'))}</span>${UI().segmented ? UI().segmented({label: T('En tout'), cls: 'ep-rate', items: RATES.map(([k, l]) => ({on: g.rating.overall === k, attrs: `data-epf-rate="${k}"`, html: esc(T(l))}))}) : ''}</div>
                <div><span class="pk-lab">${esc(T('Lettre par lettre (un clic : colle bien → à moitié → ne colle pas)'))}</span><div class="ep-letters" data-epf-letters>${[...g.text].map((ch, i) => (ch.trim() ? `<button type="button" class="ep-letter is-${g.rating.letters[i] || 'none'}" data-epf-l="${i}" title="${esc(T(RATES.find(r => r[0] === g.rating.letters[i])?.[1] || 'pas encore noté'))}">${esc(ch)}</button>` : '<span class="ep-lsp"> </span>')).join('')}</div></div>
                <label>${esc(T('Confirmé par un autre indice (le même nom trouvé ailleurs)'))}<select data-epf-conf><option value="">${esc(T('— pas encore'))}</option>${others.map(c => `<option value="${c.id}" ${Number(fontSt.confirmed) === c.id ? 'selected' : ''}>${c.num} · ${esc(c.text.slice(0, 60))}</option>`).join('')}</select></label>
                <div class="ep-row"><button type="button" class="button small" data-epf-keep>${esc(fontSt.editing ? T('Enregistrer l’essai') : T('＋ Garder cet essai'))}</button><button type="button" class="button small secondary" data-epf-search>🧰 ${esc(T('Chercher ce nom dans les données'))}</button><button type="button" class="link-button" data-epf-cancel>${esc(T('Annuler'))}</button></div></div>`
                : `<button type="button" class="button small" data-epf-frame>▭ ${esc(T('Encadrer l’enseigne'))}</button>`}
            <h4>${esc(T('Essais gardés ({n})', {n: list.length}))}</h4>
            ${list.length ? `<ul class="ep-fguesses">${list.map(c => { const f = c.data.font; return `<li data-epf-g="${c.id}"><button type="button" class="icon-button small" data-epf-eye="${c.id}" aria-pressed="${f.shown !== false}" title="${esc(T('Montrer sur la photo'))}" aria-label="${esc(T('Montrer sur la photo'))}">${f.shown !== false ? '👁' : '◌'}</button>
                <span style="font-family:${esc(fontOf(f.style)[2])};font-weight:${Number(f.weight) || 700};color:${esc(f.color)}">${esc(f.text)}</span><small class="muted">${esc(T(fontOf(f.style)[1]))}${f.rating?.overall ? ` · ${esc(T(RATES.find(r => r[0] === f.rating.overall)?.[1] || ''))}` : ''}</small>${api.certBadge(c.certainty)}
                <button type="button" class="button small secondary" data-epf-edit="${c.id}">✎ ${esc(T('Reprendre'))}</button></li>`; }).join('')}</ul><p class="ui-hint">${esc(T('Allume plusieurs essais (👁) pour les comparer côte à côte sur la photo, par exemple deux noms différents.'))}</p>` : empty(T('Aucun essai gardé.'), '🔤')}`;
        bindFont(api, pane); api.paint(api.images.find(i => i.id === fontSt.image) || api.img);
    }
    function bindFont(api, pane) {
        const repaint = () => api.paint(api.images.find(i => i.id === fontSt.image) || api.img);
        pane.oninput = e => { const g = fontSt.draft; if (!g) return;
            if (e.target.matches('[data-epf-text]')) { g.text = e.target.value; g.rating.letters = g.rating.letters.slice(0, g.text.length); const box = pane.querySelector('[data-epf-letters]'); if (box) box.innerHTML = [...g.text].map((ch, i) => (ch.trim() ? `<button type="button" class="ep-letter is-${g.rating.letters[i] || 'none'}" data-epf-l="${i}">${esc(ch)}</button>` : '<span class="ep-lsp"> </span>')).join(''); }
            const k = e.target.dataset.epf; if (k) { g[k] = ['style', 'color'].includes(k) ? e.target.value : Number(e.target.value); const o = e.target.parentElement.querySelector('output'); if (o) o.textContent = e.target.value + (k === 'rot' || k === 'skew' ? '°' : ''); }
            repaint(); };
        pane.onchange = e => { if (e.target.matches('[data-epf-blink]')) { clearInterval(fontSt.blink); fontSt.blink = e.target.checked ? setInterval(() => api.dlg.classList.toggle('ep-blink-off'), 650) : null; if (!e.target.checked) api.dlg.classList.remove('ep-blink-off'); }
            if (e.target.matches('[data-epf-conf]')) fontSt.confirmed = Number(e.target.value) || 0; if (e.target.dataset.epf) pane.oninput(e); };
        pane.onclick = async e => {
            const t = e.target, g = fontSt.draft;
            if (t.closest('[data-epf-back]')) { stopBlink(api); fontSt.draft = null; api.setPanel('questions'); api.images.forEach(im => api.paint(im)); return; }
            if (t.closest('[data-epf-frame]')) return fontGuess(api);
            if (t.closest('[data-epf-cancel]')) { stopBlink(api); fontSt.draft = null; fontSt.editing = 0; return renderFont(api, pane); }
            if (t.closest('[data-epf-corners]') && g) { g.corners = [[0, 0], [0, 0], [0, 0], [0, 0]]; return repaint(); }
            const r = t.closest('[data-epf-rate]'); if (r && g) { UI().segPick?.(r); g.rating.overall = r.dataset.epfRate; return; }
            const l = t.closest('[data-epf-l]'); if (l && g) { const i = Number(l.dataset.epfL), seq = ['', 'good', 'half', 'bad'], cur = g.rating.letters[i] || ''; g.rating.letters[i] = seq[(seq.indexOf(cur) + 1) % 4]; l.className = `ep-letter is-${g.rating.letters[i] || 'none'}`; return repaint(); }
            if (t.closest('[data-epf-search]') && g) return searchData(api, null, {q: g.text.replace(/\?/g, ' ').trim()});
            if (t.closest('[data-epf-keep]') && g) return keepGuess(api, pane);
            const eye = t.closest('[data-epf-eye]'); if (eye) { const c = api.clues.find(x => x.id === Number(eye.dataset.epfEye)); const f = {...c.data.font, shown: c.data.font.shown === false}; try { const x = await api.post('clue_save', {id: c.id, data: {...c.data, font: f}}); Object.assign(c, x.clue); } catch (err) { toast(err.message, 'error'); } return renderFont(api, pane); }
            const ed = t.closest('[data-epf-edit]'); if (ed) return fontGuess(api, {clue: api.clues.find(x => x.id === Number(ed.dataset.epfEdit))});
        };
    }
    function stopBlink(api) { clearInterval(fontSt?.blink); if (fontSt) fontSt.blink = null; api.dlg.classList.remove('ep-blink-off'); }
    async function keepGuess(api, pane) {
        const g = fontSt.draft; if (!g.text.trim()) return toast(T('Écris d’abord le texte que tu crois lire.'), 'error');
        const rate = RATES.find(r => r[0] === g.rating.overall), f = fontOf(g.style);
        const counts = RATES.map(([k, l]) => [l, g.rating.letters.filter(x => x === k).length]).filter(x => x[1]);
        const data = {font: {...g, image: fontSt.image}, confirmed_by: fontSt.confirmed || 0};
        const body = {inquiry_id: api.inq.id, kind: 'texte', source: 'police', text: T('« {t} » essayé en {f}', {t: g.text, f: T(f[1])}), certainty: fontSt.confirmed ? 'probable' : 'supposed',
            why: [rate ? T('En tout : {r}', {r: T(rate[1])}) : '', counts.map(([l, n]) => T('{n} lettre(s) : {l}', {n, l: T(l)})).join(', ')].filter(Boolean).join(' · '), images: {[fontSt.image]: 'yes'}, data};
        try {
            if (fontSt.editing) { const r = await api.post('clue_save', {...body, id: fontSt.editing}); Object.assign(api.clues.find(x => x.id === fontSt.editing) || {}, r.clue); toast(T('Essai enregistré')); }
            else await api.addClue(body);
            stopBlink(api); fontSt.draft = null; fontSt.editing = 0; renderFont(api, pane);
        } catch (e) { toast(e.message, 'error'); }
    }
    /** l'homographie qui envoie le rectangle (0,0)–(w,h) sur 4 points (coins dans l'ordre : haut-gauche, haut-droite, bas-droite, bas-gauche) */
    function matrix3d(w, h, p) {
        const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = p, dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
        let g = 0, hh = 0; const den = dx1 * dy2 - dx2 * dy1;
        if ((Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) && Math.abs(den) > 1e-12) { g = (dx3 * dy2 - dx2 * dy3) / den; hh = (dx1 * dy3 - dx3 * dy1) / den; }
        const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, c = x0, d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3, f = y0;
        return `matrix3d(${[a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, c, f, 0, 1].map(v => +v.toFixed(8)).join(',')})`;
    }
    function quad(g, W, H) {
        const {x, y, w, h} = g.frame, cx = (x + w / 2) * W, cy = (y + h / 2) * H, r = (g.rot || 0) * Math.PI / 180;
        return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py], i) => { const X = (px + (g.corners?.[i]?.[0] || 0)) * W - cx, Y = (py + (g.corners?.[i]?.[1] || 0)) * H - cy; return [cx + X * Math.cos(r) - Y * Math.sin(r), cy + X * Math.sin(r) + Y * Math.cos(r)]; });
    }
    function paintFonts(api, im, view) {
        const cvs = view?.querySelector('.ep-canvas'), img = cvs?.querySelector('img.ep-photo'); if (!cvs || !img) return;
        cvs.querySelectorAll('.ep-fontov, .ep-fh').forEach(n => n.remove());
        const onPanel = !!api.dlg.querySelector('.ep-fonthead'); if (!onPanel) return;
        const W = img.offsetWidth, H = img.offsetHeight; if (!W || !H) return;
        const COLORS = ['#d1242f', '#055dff', '#1a7f37', '#8250df'];
        const items = guesses(api).filter(c => Number(c.data.font.image) === im.id && c.data.font.shown !== false && c.id !== fontSt?.editing).map((c, i) => ({g: c.data.font, id: c.id, color: c.data.font.color || COLORS[i % 4]}));
        if (fontSt?.draft && fontSt.image === im.id) items.push({g: fontSt.draft, id: 0, draft: true, color: fontSt.draft.color});
        items.forEach(({g, id, draft, color}) => {
            const fw = g.frame.w * W, fh = g.frame.h * H; if (!(fw > 2 && fh > 2)) return;
            const q = quad(g, W, H), div = document.createElement('div');
            div.className = `ep-fontov${draft ? ' is-draft' : ''}`; div.dataset.epfov = String(id);
            div.style.cssText = `width:${fw}px;height:${fh}px;transform:${matrix3d(fw, fh, q)};opacity:${g.opacity}`;
            const letters = [...(g.text || '')].map((ch, i) => `<span class="ep-fl-${g.rating?.letters?.[i] || 'none'}${ch === '?' ? ' is-q' : ''}">${esc(ch)}</span>`).join('');
            div.innerHTML = `<span class="ep-fontline" style="font-family:${esc(fontOf(g.style)[2])};font-weight:${Number(g.weight) || 700};font-size:${(g.size * fh).toFixed(1)}px;letter-spacing:${g.spacing}em;color:${esc(color)};transform:scaleX(${g.stretch}) skewX(${-(g.skew || 0)}deg)">${letters}</span>`;
            cvs.appendChild(div);
            if (draft) q.forEach((p, i) => { const hd = document.createElement('span'); hd.className = 'ep-fh'; hd.dataset.epfh = String(i); hd.style.left = `${p[0]}px`; hd.style.top = `${p[1]}px`; hd.title = T('Glisser ce coin'); cvs.appendChild(hd);
                hd.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); const r = img.getBoundingClientRect(), k = r.width / W, sx = e.clientX, sy = e.clientY, c0 = [...g.corners[i]];
                    const mv = ev => { g.corners[i] = [c0[0] + (ev.clientX - sx) / k / W, c0[1] + (ev.clientY - sy) / k / H]; paintFonts(api, im, view); };
                    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
                    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); }); });
        });
    }

    /* ═════════ les aides : la grille (§ 7 bis) et leur aiguillage ═════════ */
    const AIDES = [
        ['📷 Lire la photo elle-même', [['exif', '🏷', 'Métadonnées cachées (EXIF)'], ['g:tirages', '🖼', 'Type de tirage'], ['photographe', '📮', 'Le photographe'], ['perspective', '📐', 'Perspective'], ['reflets', '🪞', 'Reflets']]],
        ['🗺 Retrouver le lieu', [['horizon', '⛰', 'Ligne d’horizon'], ['avantapres', '↔', 'Avant / après'], ['hypmap', '🗺', 'Carte des hypothèses'], ['affiches', '🪧', 'Affiches et enseignes']]],
        ['🎖 Les gens et les objets', [['g:insignes', '🎖', 'Guide des insignes'], ['g:vehicules', '🚲', 'Véhicules'], ['age', '🧒', 'Âge apparent']]],
        ['🧠 Mieux raisonner', [['hyps', '⚖', 'Hypothèses concurrentes'], ['manque', '❓', 'Qu’est-ce qui me manque ?'], ['journal', '📜', 'Journal de l’enquête']]],
        ['👪 Avec la famille, et apprendre', [['cousin', '✉️', 'Demander à un cousin'], ['serie', '🗂', 'Série de photos'], ['wall', '🧱', 'Mur des photos sans nom'], ['exercice', '🎓', 'Exercices']]],
        ['🔍 Encore sur l’image', [['recadrage', '✂', 'Recadrage d’origine'], ['g:retouches', '🖌', 'Retouches anciennes'], ['ecriture', '✍', 'L’écriture au dos'], ['agrandir', '🔎', 'Agrandir sans inventer'], ['police', '🔤', 'Essayer une police']]],
        ['🌦 Le ciel et le temps', [['meteo', '🌧', 'Météo du jour'], ['lune', '🌙', 'La lune'], ['shadow', '☀️', 'Calcul d’ombre']]],
        ['🏘 Le lieu en détail', [['g:plaques', '🔢', 'Plaques et numéros'], ['monument', '🗿', 'Monument aux morts'], ['arbres', '🌳', 'Les arbres'], ['cadastre', '🗺', 'Cadastre et vieux plans']]],
        ['👔 Les gens, et relier', [['deuil', '🖤', 'Deuil'], ['fete', '🎉', 'La fête du jour'], ['missing', '👥', 'Qui manque ?'], ['sisters', '🧩', 'Photos sœurs'], ['story', '📖', 'Raconter l’enquête'], ['safe', '🛡', 'Partager sans risque']]],
        ['✨ Et encore', [['g:cartepostale', '✉️', 'Le papier de la carte postale'], ['timbre', '📮', 'Timbre et oblitération'], ['ombres', '☀️', 'Ombres de plusieurs photos'], ['g:panneaux', '🪧', 'Panneaux et langue'], ['g:drapeaux', '🚩', 'Drapeaux'], ['g:civils', '📯', 'Uniformes civils'], ['classe', '🏫', 'Photo de classe'], ['nearby', '📍', 'Mes photos proches'], ['frise', '📏', 'Frise de la photo'], ['reperes', '📒', 'Carnet de repères'], ['ten', '⏱', 'Mode « 10 minutes »'], ['online', '🌐', 'Comparer en ligne'], ['ai', '🤖', 'Demander à l’IA']]]];
    function renderAides(api, pane) {
        pane.innerHTML = `<p class="ui-hint">${esc(T('Chacune arrive au bon moment dans les questions, et chacune peut devenir un indice avec sa certitude.'))}</p>${AIDES.map(([g, list]) => `<h4 class="ep-ah">${esc(T(g))}</h4><div class="ep-agrid">${list.map(([k, i, l]) => `<button type="button" class="ep-aide" data-ep-aidek="${k}">${esc(i)} ${esc(T(l))}</button>`).join('')}</div>`).join('')}`;
        pane.onclick = e => { const b = e.target.closest('[data-ep-aidek]'); if (b) open(b.dataset.epAidek, api); };
    }
    function simpleClue(api, title, hint, kind, chips) {
        if (api.ro) return;
        dlgOpen({eyebrow: T('🔎 AIDE'), title, submitLabel: T('Fermer'), body: `<p class="ui-hint">${esc(hint)}</p><div class="ep-chipset">${chips.map((c, i) => `<button type="button" class="ep-tag" data-c="${i}">${esc(T(c.t))}</button>`).join('')}</div>`,
            onOpen: dg => dg.addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; const c = chips[Number(b.dataset.c)]; dg.close(); api.editClue({kind, text: T(c.t), certainty: c.cert || 'supposed', date_from: c.from || null, date_to: c.to || null, why: c.why ? T(c.why) : '', url: c.url || '', images: {[api.img?.id]: 'yes'}}); }), onSubmit: () => true});
    }
    function open(k, api) {
        if (k.startsWith('g:')) return guide(k.slice(2), api);
        const f = {
            exif: () => exif(api), photographe: () => photographers(api), perspective: () => perspective(api), reflets: () => { api.setTool('crop'); toast(T('Découpe le reflet (✂) : vitrine, flaque, miroir.')); },
            horizon: () => { api.setTool('free'); toast(T('Trace la crête des montagnes à main levée (✎). La comparaison avec le relief demande des données d’altitude qui ne sont pas encore installées : la ligne est gardée avec l’image.')); },
            avantapres: () => (ext.photoCompareWith ? ext.photoCompareWith({id: api.img.media_id, filename: api.img.media?.filename, title: api.img.media?.title}) : toast(T('Le comparateur n’est pas chargé.'), 'error')),
            hypmap: () => hypMap(api), affiches: () => affiche(api), age: () => askAge(api), classe: () => askAge(api, true),
            hyps: () => { api.dlg.querySelector('[data-ep-panel="clues"]')?.click(); setTimeout(() => api.dlg.querySelector('[data-ep-hyps]')?.scrollIntoView({block: 'start'}), 50); },
            manque: () => dlgOpen({eyebrow: T('❓ CE QUI MANQUE'), title: T('Qu’est-ce qui me manque ?'), submitLabel: T('Fermer'), body: (() => { const m = C().missing(api.inq).map(missingText).filter(Boolean); return m.length ? `<ol>${m.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : empty(T('Rien d’évident : l’enquête tient bien.'), '✓'); })(), onSubmit: () => true}),
            journal: () => journal(api), cousin: () => cousin(api), serie: () => EP().current?.addImages(), wall: () => wall({}), exercice: () => exercise({}),
            recadrage: () => simpleClue(api, T('✂ Recadrage d’origine'), T('Bords, coins coupés, traces de colle : la photo vient-elle d’une plus grande (groupe, album) ?'), 'support', [{t: 'Bords coupés aux ciseaux'}, {t: 'Coins arrondis'}, {t: 'Traces de colle ou de coins d’album'}, {t: 'Découpée dans une photo de groupe'}]),
            ecriture: () => { if (ext.photoCompareWith) ext.photoCompareWith({id: api.img.media_id, filename: api.img.media?.filename, title: api.img.media?.title}); toast(T('Compare l’écriture au dos avec une lettre ou une signature connue de la famille.')); },
            agrandir: () => { EP().current?.betterSee?.(); toast(T('Zoom et « Mieux voir » seulement : aucune IA qui recrée des détails.')); },
            meteo: () => meteo(api), lune: () => moon(api), shadow: () => shadow(api), ombres: () => multiShadow(api),
            monument: () => simpleClue(api, T('🗿 Monument aux morts'), T('La plupart des monuments aux morts ont été élevés entre 1920 et 1925.'), 'lieu', [{t: 'Monument aux morts présent', from: 1919, why: 'La plupart élevés entre 1920 et 1925', url: W('Monument_aux_morts')}, {t: 'Pas de monument aux morts là où il est aujourd’hui', to: 1925, why: 'Absent : sans doute avant son inauguration', url: W('Monument_aux_morts')}]),
            arbres: () => simpleClue(api, T('🌳 Les arbres'), T('Jeune ou vieux, comparé à la vue d’aujourd’hui : un écart d’années.'), 'date', [{t: 'Arbres jeunes (plantés depuis peu)'}, {t: 'Arbres très grands, plus qu’aujourd’hui'}, {t: 'Arbres absents aujourd’hui'}]),
            cadastre: () => cadastre(api), deuil: () => treeDialog(api, 'events', {only: 'deuil'}), fete: () => treeDialog(api, 'events'), missing: () => treeDialog(api, 'missing'), sisters: () => sisters(api),
            story: () => story(api), safe: () => story(api, {safe: true}), nearby: () => nearby(api), reperes: () => landmarks(), online: () => compareOnline(api), ai: () => ai(api, 'lieu'), police: () => fontGuess(api),
            timbre: () => timbre(api), frise: () => dlgOpen({eyebrow: T('📏 FRISE'), title: T('Frise de la photo'), submitLabel: T('Fermer'), wide: true, body: friseHtml(api), onSubmit: () => true}),
            ten: () => { const p = api.prefs(); EP().setPrefs({tenMinutes: !p.tenMinutes}); api.dlg.querySelector('[data-ep-panel="questions"]')?.click(); },
            mode: () => modeGuide(api),
        }[k];
        if (f) return f(); toast(k);
    }
    function journal(api) {
        const J = api.inq.journal || [];
        dlgOpen({eyebrow: T('📜 JOURNAL'), title: T('Journal de l’enquête'), submitLabel: api.ro ? T('Fermer') : T('＋ Noter'), body: `${J.length ? `<ul class="ep-journal">${J.map(j => `<li>${UI().when ? UI().when(j.created_at) : esc(j.created_at)} — <b>${esc(j.what)}</b>${j.result ? ` : ${esc(j.result)}` : ''}</li>`).join('')}</ul>` : empty(T('Rien encore.'), '📜')}${api.ro ? '' : `<label>${esc(T('Ce que j’ai regardé'))}<input name="what"></label><label>${esc(T('Ce que ça a donné'))}<input name="result"></label>`}`,
            onSubmit: async f => { if (api.ro || !f.what?.value.trim()) return; await api.post('journal', {id: api.inq.id, what: f.what.value, result: f.result.value}); await api.reload(); }});
    }
    function affiche(api) {
        if (api.ro) return;
        dlgOpen({eyebrow: T('🪧 AFFICHES'), title: T('Affiches et enseignes'), submitLabel: T('Ajouter l’indice'), body: `<p class="ui-hint">${esc(T('Une marque, un produit, un film à l’affiche donne un « pas avant telle année ». Note où tu as trouvé l’année.'))}</p><label>${esc(T('Ce qui est écrit'))}<input name="t" required></label><label>${esc(T('Pas avant (année)'))}<input name="y" inputmode="numeric"></label><label>${esc(T('Source de l’année (lien)'))}<input name="u" inputmode="url"></label>`,
            onSubmit: async f => { await api.addClue({kind: 'texte', text: T('Affiche ou enseigne : « {t} »', {t: f.t.value}), date_from: Number(f.y.value) || null, url: f.u.value, certainty: 'probable', why: T('pas avant la sortie du produit ou du film')}); }});
    }
    function timbre(api) {
        if (api.ro) return;
        dlgOpen({eyebrow: T('📮 TIMBRE'), title: T('Timbre et oblitération'), submitLabel: T('Ajouter l’indice'), body: `<p class="ui-hint">${esc(T('Le cachet de la poste donne sa ville et sa date : une trace solide si elle est lisible.'))}</p><label>${esc(T('Ville du cachet'))}<input name="v"></label><label>${esc(T('Date du cachet'))}<input name="d" placeholder="${esc(T('14 juillet 1911'))}"></label><div><span class="pk-lab">${esc(T('Sûr de la lecture ?'))}</span>${certSegLocal()}</div><p class="ui-hint">${esc(T('Le timbre lui-même : ✉️ guide « Le papier de la carte postale ».'))}</p>`,
            onOpen: dg => dg.addEventListener('click', e => { const b = e.target.closest('[data-tc]'); if (b) { UI().segPick?.(b); dg.querySelector('[name=c]').value = b.dataset.tc; } }),
            onSubmit: async f => { const y = C().yearOf(f.d.value); await api.addClue({kind: 'dos', text: T('Cachet de la poste : {v} {d}', {v: f.v.value, d: f.d.value}).trim(), certainty: f.c.value || 'probable', date_from: y, date_to: y, why: T('Cachet lu au dos')}); }});
    }
    const certSegLocal = () => `${UI().segmented ? UI().segmented({label: T('Certitude'), items: [['proven', 'Prouvé'], ['probable', 'Probable'], ['supposed', 'Supposé']].map(([k, l]) => ({on: k === 'probable', attrs: `data-tc="${k}"`, html: esc(T(l))}))}) : ''}<input type="hidden" name="c" value="probable">`;
    function modeGuide(api) {
        dlgOpen({eyebrow: T('📅 DATER PAR LA MODE'), title: T('Dater par la mode'), submitLabel: T('Fermer'), body: `<p>${esc(T('Compare coiffes, chapeaux, robes et costumes avec des photos datées de la même région : celles de ta base d’abord (même famille, même village), puis les collections en accès ouvert des musées.'))}</p>
            <div class="ep-row"><button type="button" class="button small secondary" data-md-near>📍 ${esc(T('Mes photos proches'))}</button><button type="button" class="button small secondary" data-md-sis>🧩 ${esc(T('Photos sœurs'))}</button></div>
            ${api.privacy?.blocked || kiosk() ? '' : `<p>${ext_('https://www.parismuseescollections.paris.fr/fr', 'Paris Musées')} ${ext_('https://www.metmuseum.org/art/collection', 'The Met')} ${ext_('https://www.rijksmuseum.nl/en/rijksstudio', 'Rijksmuseum')}</p>`}
            <p class="ui-hint">${esc(T('La mode change lentement et pas partout en même temps : un indice de mode reste « Supposé » ou « Probable », jamais « Prouvé ».'))}</p>`,
            onOpen: dg => dg.addEventListener('click', e => { if (e.target.closest('[data-md-near]')) { dg.close(); nearby(api); } if (e.target.closest('[data-md-sis]')) { dg.close(); sisters(api); } }), onSubmit: () => true});
    }
    async function meteo(api) {
        const s = (ext.pickSources || []).find(x => x.id === 'meteo_jour'), pl = placeOf(api), d = dayOfInq(api);
        if (!d || pl?.lat == null) return toast(T('Il faut une date au jour près et un lieu placé sur la carte.'), 'error');
        if (!s) return toast(T('La météo d’autrefois n’est pas chargée.'), 'error');
        searchData(api, null, {q: '', place: pl.name});
    }
    function cadastre(api) {
        const pl = placeOf(api), blocked = api.privacy?.blocked || kiosk();
        dlgOpen({eyebrow: T('🗺 PLANS'), title: T('Cadastre et vieux plans'), submitLabel: T('Fermer'), body: `<p>${esc(T('Trace le contour des bâtiments vus (✎) et cherche-les sur le plan ancien : cadastre de l’app, cartes anciennes, ou les photos aériennes anciennes.'))}</p>
            <div class="ep-row">${ext.openCadastre ? `<button type="button" class="button small secondary" data-cd-app>▦ ${esc(T('Cadastre de l’app'))}</button>` : ''}${blocked ? `<small class="muted">🔒 ${esc(T('Mode consultation : rien ne part sur Internet.'))}</small>` : `${ext_('https://remonterletemps.ign.fr/', 'IGN Remonter le temps')} ${ext_('https://www.geoportail.gouv.fr/', 'Géoportail')}`}</div>
            ${pl?.name ? `<p class="ui-hint">${esc(T('Lieu supposé : {p}', {p: pl.name}))}</p>` : ''}`, onOpen: dg => dg.querySelector('[data-cd-app]')?.addEventListener('click', () => { dg.close(); ext.openCadastre?.({place_id: pl?.id}); }), onSubmit: () => true});
    }
    function hypMap(api) {
        const H = (api.inq.hypotheses || []).filter(h => h.kind === 'lieu'), color = {proven: '#1a7f37', probable: '#055dff', supposed: '#bf8700', refuted: '#d1242f'};
        const pts = H.filter(h => h.place?.lat != null).map(h => { const s = C().hypScore(h, api.clues); const refuted = s.contre > s.pour + s.check; return {lat: h.place.lat, lon: h.place.lon, label: `${refuted ? '✗ ' : ''}${h.label}`, color: refuted ? color.refuted : s.score > 2 ? color.probable : color.supposed}; });
        const c = api.inq.conclusion?.place; if (c?.lat != null) pts.push({lat: c.lat, lon: c.lon, label: `🗺 ${c.name}`, color: color[c.certainty] || color.supposed});
        const map = pts.length && ext.miniMap ? ext.miniMap(pts, [], {height: 320}) : empty(T('Ajoute des hypothèses de lieu placées sur la carte (⚖ dans l’onglet Indices).'), '🗺');
        dlgOpen({eyebrow: T('🗺 HYPOTHÈSES'), title: T('Carte des hypothèses'), submitLabel: T('Fermer'), wide: true, body: `${map}<ul>${pts.map(p => `<li style="color:${p.color}">${p.label.startsWith('✗') ? `<s>${esc(p.label)}</s>` : esc(p.label)}</li>`).join('')}</ul><p class="ui-hint">${esc(T('En couleur selon la certitude ; les lieux réfutés restent visibles, barrés.'))}</p>`, onSubmit: () => true});
    }

    ext.enquetePhotoAides = {suggestions, renderSearches, renderAides, open, guide, chipHint, guessLang, friseHtml, missingText, hypothesesHtml, hypClick, searchData, keepLandmark, shadow, perspective, compareOnline, mirror, saveCrop, ai, story: api => story(api), safeShare: api => story(api, {safe: true}), cousin, nextUnnamed, openGlobal,
        fontGuess, paintFonts, renderFont, GUIDES, FONTS, _matrix3d: matrix3d, _storyHtml: storyHtml};
})();
