/**
 * LCNDA — 🔊 Sons et enfance : ce qu'il entendait, chantait, lisait à l'école, mangeait, voyait naître (lot 9).
 * Données livrées avec l'app (assets/data/l9a-*.json.gz, refaites par scripts/lot9-sons-enfance/*.py, lues à la demande) :
 *   🔊 l9a-sons      enregistrements anciens en français (78 tours, cylindres) d'Internet Archive, SEULEMENT ceux marqués
 *                    domaine public / CC0 / CC BY sur leur notice ; le son reste sur archive.org (lu en ligne, jamais copié)
 *   🎼 l9a-chansons  chansons populaires datées (phrase de Wikipédia) + partition IMSLP « Public Domain » (auteurs morts ≤ 1940)
 *   📚 l9a-livres    livres de classe (Wikisource, Internet Archive) ; 📝 la recherche des sujets du certificat d'études
 *   🧸 l9a-jouets    images des catégories « 1900s toys »… de Commons (auteur et licence de chaque image)
 *   🍬🚗 l9a-marques marques françaises, voitures et objets, avec leur année (Wikidata) et une image libre (Commons)
 *   🍰 l9a-recettes  recettes des livres de cuisine du domaine public (Wikisource, lien vers la page exacte) + livres scannés
 *   🐦🌼 l9a-nature  oiseaux et fleurs sauvages communs des campagnes (clés GBIF, images Commons)
 * En ligne, à la demande (lib/lot9_sons_enfance.php, réponses gardées) :
 *   💌 Europeana 1914-1918 et 📷 photos anciennes de la commune sur Europeana (licences ouvertes seulement ; clé GRATUITE de
 *   l'utilisateur dans Réglages, jamais écrite dans l'app) ; 🐦🌼 les espèces vues près de la commune (GBIF, CC0 / CC BY) ;
 *   le chant de chaque oiseau (xeno-canto, clé gratuite de l'utilisateur ; licence de chaque enregistrement, souvent CC BY-NC-SA).
 * Où : fiche d'une personne, bloc « 🔊 Sons et enfance » (une ligne par sujet, le détail sous « ▸ plus ») ; fiche d'un village et
 * Monographie de commune (💌 📷 🐦 🌼) ; Listes (LCNDA_EXT.dataLists) ; à la demande (LCNDA_EXT.dataSources) ;
 * « Où chercher » (deux sites en plus) ; Réglages → « 🔊 Sons et enfance » (chaque sujet s'éteint, les deux clés, À propos des données).
 * localStorage : « genealogie-lot9-sons-enfance » (sujets), « genealogie-lot9-cles » (clés Europeana, xeno-canto).
 *   window.LCNDA_EXT.sonsEnfance = {load, core…, personInto, placeInto}   (Node : module.exports = core)
 * Essai : tests/test-lot9-sons-enfance.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */
    const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const table = f => (f.rows || []).map(r => (Array.isArray(r) ? Object.fromEntries((f.fields || []).map((k, i) => [k, r[i] ?? null])) : r));
    function lifeSpan(life) {
        const ys = (life?.events || []).map(e => num(e.year)).filter(y => y !== null);
        const b = num(life?.person?.birth), d = num(life?.person?.death);
        return {birth: b, death: d, from: b ?? (ys.length ? Math.min(...ys) : null), to: d ?? (ys.length ? Math.max(...ys) : null)};
    }
    const decadeOf = y => (y === null ? null : Math.floor(y / 10) * 10);
    /** 🔊 les enregistrements d'une année (ou de l'année connue la plus proche, à 3 ans au plus) */
    function soundsFor(rows, y) {
        if (y === null) return {year: null, list: []};
        for (const d of [0, -1, 1, -2, 2, -3, 3]) { const l = rows.filter(r => r.y === y + d); if (l.length) return {year: y + d, list: l}; }
        return {year: null, list: []};
    }
    /** 🎼 les chansons de son enfance : parues entre 5 ans avant sa naissance et ses 14 ans ; les chansons plus anciennes qu'on chantait encore viennent après */
    function songsFor(rows, birth) {
        if (birth === null) return {child: [], older: []};
        const child = rows.filter(r => r.y >= birth - 5 && r.y <= birth + 14).sort((a, b) => a.y - b.y);
        const older = rows.filter(r => r.y < birth - 5).sort((a, b) => b.y - a.y);
        return {child, older};
    }
    /** 📚 les livres d'école déjà parus à ses 13 ans (et pas plus de 60 ans avant : ces livres ont été réédités pendant des décennies) */
    function schoolBooksFor(rows, birth) {
        if (birth === null) return [];
        const z = birth + 13;
        return rows.filter(r => r.y <= z && r.y >= z - 60).sort((x, y) => x.y - y.y);
    }
    /** 🧸 les jouets de la décennie de ses 6 ans */
    function toysFor(decades, birth) {
        if (birth === null) return {decade: null, list: []};
        const d = decadeOf(birth + 6);
        return {decade: d, list: decades?.[String(d)] || []};
    }
    const CAR_KINDS = ['voiture', 'deux-roues'];
    /** 🍬 les marques nées de son vivant (de sa naissance à sa mort, ou à ses 90 ans) */
    function brandsFor(rows, life) {
        const {birth, death} = lifeSpan(life); if (birth === null) return [];
        const end = death ?? Math.min(birth + 90, new Date().getFullYear());
        return rows.filter(r => !CAR_KINDS.includes(r.k) && r.y > birth && r.y <= end).map(r => ({r, age: r.y - birth})).sort((a, b) => a.r.y - b.r.y);
    }
    /** 🚗 les voitures et deux-roues sortis autour de ses 30 ans (28–32) */
    function carsAt30(rows, life) {
        const {birth, death} = lifeSpan(life); if (birth === null) return [];
        if (death !== null && death < birth + 28) return [];
        return rows.filter(r => CAR_KINDS.includes(r.k) && r.y >= birth + 28 && r.y <= birth + 32).map(r => ({r, age: r.y - birth})).sort((a, b) => Math.abs(a.age - 30) - Math.abs(b.age - 30) || a.r.y - b.r.y);
    }
    /** 🍰 le livre de cuisine de son époque : le plus récent paru (ou réédité) avant ses 25 ans, avec des recettes de préférence */
    function cookbookFor(books, recipes, birth) {
        if (birth === null) return null;
        const yOf = b => b.ed || b.y;
        const ok = books.filter(b => b.y <= birth + 25).sort((a, b) => yOf(b) - yOf(a));
        const withR = ok.filter(b => recipes.some(r => r.b === b.id));
        const pick = withR.find(b => yOf(b) >= birth - 60) || ok[0] || null; // un livre transcrit pas trop ancien, sinon le dernier scan
        if (!pick) return null;
        return {book: pick, recipes: recipes.filter(r => r.b === pick.id), scans: ok.filter(b => b.where === 'archive' && b !== pick).slice(0, 2)};
    }
    /** 💌 un homme en âge d'être mobilisé en 1914-1918 (né 1865–1900), ou une trace militaire de ces années */
    function ww1Soldier(life) {
        const {birth, death} = lifeSpan(life);
        const mil = (life?.jobs || []).some(j => /soldat|poilu|caporal|sergent|lieutenant|capitaine|militaire|infanter|artiller|chasseur|zouave|dragon|cuirassier/i.test(fold(j.text)))
            || (life?.events || []).some(e => /^(_MILT|_MIL|MILI|MILT|_DCM|EVEN)$/.test(String(e.tag || '').toUpperCase()) && num(e.year) >= 1914 && num(e.year) <= 1919 && /guerre|mobilis|militaire|regiment|soldat|mort pour la france/i.test(fold(`${e.type} ${e.title} ${e.description}`)));
        if (mil) return true;
        if (birth === null || life?.person?.gender === 'female') return false;
        return birth >= 1865 && birth <= 1900 && (death === null || death >= 1914);
    }
    /** les espèces de la liste vues près du lieu (counts : {clé GBIF: n}) → les plus vues d'abord */
    function speciesNear(list, counts) { return list.filter(s => (counts?.[String(s.key)] || 0) > 0).map(s => ({s, n: counts[String(s.key)]})).sort((a, b) => b.n - a.n); }
    /** le lieu « de sa vie » : naissance, sinon le premier lieu placé en France */
    function homePlace(life) {
        const pls = life?.places || [];
        const birthEv = (life?.events || []).find(e => /^(BIRT|CHR|BAPM)$/.test(String(e.tag || '').toUpperCase()) && e.place_id);
        const p = (birthEv && pls.find(x => x.id === birthEv.place_id)) || pls.find(x => num(x.lat) !== null) || pls[0] || null;
        return p;
    }

    const core = {lifeSpan, decadeOf, soundsFor, songsFor, schoolBooksFor, toysFor, brandsFor, carsAt30, cookbookFor, ww1Soldier, speciesNear, homePlace, table, fold};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (...a) => A().api(...a);
    const post = (a, b) => api(a, {}, {method: 'POST', body: b}).then(r => r?.result || r);
    const kiosk = () => !!(A().state?.kiosk || A().state?.bootstrap?.kiosk);
    const DATA_V = 1;
    const KEY = 'genealogie-lot9-sons-enfance', KEYS = 'genealogie-lot9-cles';
    const TAB = ['lot9_sons_enfance', '25l9', '🔊 Sons et enfance'];
    const PARTS = [
        ['sons', '🔊 Les sons de son époque', 'Ce qu’on entendait au phonographe l’année de ses 20 ans (78 tours et cylindres libres d’Internet Archive ; Europeana avec ta clé).'],
        ['chansons', '🎼 Les chansons de son enfance', 'Les chansons parues quand il était enfant, avec la partition libre d’IMSLP quand elle existe.'],
        ['ww1', '💌 Lettres et souvenirs de 14-18', 'Les lettres, photos et objets de 14-18 de sa commune sur Europeana 1914-1918 (clé Europeana gratuite).'],
        ['photos', '📷 Photos anciennes sur Europeana', 'Les photos anciennes de la commune sous licence libre, à garder dans les médias (clé Europeana gratuite).'],
        ['oiseaux', '🐦 Les oiseaux de son village', 'Les oiseaux communs vus près de la commune (GBIF) et leur chant (xeno-canto, clé gratuite).'],
        ['fleurs', '🌼 Les fleurs sauvages de son pays', 'Les fleurs sauvages communes vues près de la commune (GBIF), avec une image.'],
        ['livres', '📚 Les livres d’école de son enfance', 'Les livres de classe de ses 7 à 13 ans, à lire sur Wikisource ou Internet Archive.'],
        ['jouets', '🧸 Les jouets de son enfance', 'Les jouets de la décennie de ses 6 ans (images de Wikimedia Commons).'],
        ['marques', '🍬 Les marques nées de son vivant', 'Banania, la Vache qui rit, Ripolin… et l’âge qu’il avait à leur naissance.'],
        ['voitures', '🚗 Les voitures de ses 30 ans', 'Les voitures et les deux-roues sortis autour de ses 30 ans.'],
        ['recettes', '🍰 Le livre de cuisine de son époque', 'Les recettes d’un livre de cuisine de son temps (domaine public), à ajouter au livre de recettes de la famille.']];
    const settings = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...Object.fromEntries(PARTS.map(p => [p[0], true])), ...s}; };
    const on = k => settings()[k] !== false;
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const keys = () => { try { return JSON.parse(localStorage.getItem(KEYS) || '{}') || {}; } catch (_) { return {}; } };
    const saveKeys = k => { try { localStorage.setItem(KEYS, JSON.stringify(k)); } catch (_) {} };
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
    const he = P => (P?.gender === 'female' ? T('elle') : P?.gender === 'male' ? T('il') : T('cette personne'));
    const He = P => cap(he(P));
    const link = (url, label) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label));
    const srcLink = url => (url ? `<a class="l9a-src-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(T('Ouvrir la source (internet)'))}">${esc(T('↗ source'))}</a>` : '');
    const row = (icon, html, src, extra = '', attrs = '') => `<div class="hist-row l9a-row"${attrs}><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const more = (html, n) => (html ? `<details class="l9a-more"><summary>${esc(T('▸ plus'))}${n ? ` <small class="muted">(${nf(n)})</small>` : ''}</summary>${html}</details>` : '');
    const emptyLine = (t, icon = 'ℹ️') => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);
    const ageTxt = n => (n <= 0 ? T('moins d’un an') : n === 1 ? T('1 an') : T('{n} ans', {n: String(n)}));
    const iaFile = r => `https://archive.org/download/${encodeURIComponent(r.id)}/${encodeURIComponent(r.file)}`;
    const iaPage = id => `https://archive.org/details/${encodeURIComponent(id)}`;
    const player = (src, label) => `<audio class="l9a-audio" controls preload="none" src="${esc(src)}" aria-label="${esc(label)}"></audio>`;
    const fig = (g, extra = '') => `<figure class="l9a-fig"><a href="${esc(g.page)}" target="_blank" rel="noopener noreferrer"><img loading="lazy" alt="${esc(g.alt || g.t || '')}" src="${esc(g.thumb)}" onerror="this.closest('figure').classList.add('l9a-off')"></a><figcaption>${esc(g.t || '')}<br><small>${esc([g.artist, g.date].filter(Boolean).join(', '))}${g.lic ? ` · ${esc(g.lic)}` : ''} · ${link(g.page, g.where || '↗ Commons')}</small>${extra}</figcaption></figure>`;

    /* ─────────── chargement (une fois, à la demande) ─────────── */
    const FILES = {sons: 'l9a-sons', chansons: 'l9a-chansons', livres: 'l9a-livres', jouets: 'l9a-jouets', marques: 'l9a-marques', recettes: 'l9a-recettes', nature: 'l9a-nature'};
    const data = {};
    async function readMaybeGz(r) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir ces fichiers.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    function load(kind) {
        if (!data[kind]) data[kind] = fetch(`assets/data/${FILES[kind]}.json.gz?v=${DATA_V}`, {credentials: 'same-origin'})
            .then(r => { if (r.status === 404) return null; if (!r.ok) throw new Error(T('Le fichier {f} est introuvable.', {f: FILES[kind]})); return readMaybeGz(r); })
            .then(f => (f ? {meta: f, rows: kind === 'sons' ? table(f) : (f.rows || [])} : null))
            .catch(e => { delete data[kind]; throw e; });
        return data[kind];
    }
    const SRC = {
        sons: () => `${link('https://archive.org/details/78rpm', 'Internet Archive')} — ${esc(T('licence lue sur chaque notice (domaine public, CC0 ou CC BY)'))}`,
        chansons: () => `${link('https://fr.wikipedia.org', 'Wikipédia')} (CC BY-SA 4.0) · ${link('https://www.wikidata.org', 'Wikidata')} (CC0) · ${link('https://imslp.org', 'IMSLP')} (${esc(T('partitions du domaine public'))})`,
        livres: () => `${link('https://fr.wikisource.org', 'Wikisource')} · ${link('https://archive.org', 'Internet Archive')} · ${link('https://fr.wikipedia.org', 'Wikipédia')} (CC BY-SA 4.0)`,
        jouets: () => `${link('https://commons.wikimedia.org/wiki/Category:Toys_by_decade', 'Wikimedia Commons')} — ${esc(T('auteur et licence sous chaque image'))}`,
        marques: () => `${link('https://www.wikidata.org', 'Wikidata')} (CC0) · ${link('https://fr.wikipedia.org', 'Wikipédia')} (CC BY-SA 4.0) · ${link('https://commons.wikimedia.org', 'Commons')}`,
        recettes: () => `${link('https://fr.wikisource.org/wiki/Cat%C3%A9gorie:Cuisine', 'Wikisource')} (${esc(T('textes du domaine public'))}) · ${link('https://archive.org', 'Internet Archive')}`,
        europeana: url => `${link(url || 'https://www.europeana.eu', 'Europeana')} — ${esc(T('licence ouverte de chaque notice (domaine public, CC0, CC BY, CC BY-SA)'))}`,
        gbif: url => `${link(url || 'https://www.gbif.org', 'GBIF.org')} — ${esc(T('observations des jeux de données CC0 et CC BY 4.0'))} · ${link('https://commons.wikimedia.org', 'Commons')}`,
        xc: () => `${link('https://xeno-canto.org', 'xeno-canto')} — ${esc(T('licence et auteur de chaque enregistrement'))}`
    };
    const SRC_TXT = {sons: 'Internet Archive (78 tours, cylindres) — domaine public, CC0, CC BY', chansons: 'Wikipédia (CC BY-SA 4.0), Wikidata (CC0), IMSLP (domaine public)', livres: 'Wikisource, Internet Archive, Wikipédia',
        jouets: 'Wikimedia Commons (licence de chaque image)', marques: 'Wikidata (CC0), Wikipédia (CC BY-SA 4.0), Commons', recettes: 'Wikisource, Internet Archive (domaine public)',
        ww1: 'Europeana 1914-1918 (licences ouvertes)', photos: 'Europeana (licences ouvertes)', oiseaux: 'GBIF.org (CC0, CC BY 4.0), xeno-canto', fleurs: 'GBIF.org (CC0, CC BY 4.0), Commons'};

    /* ─────────── les lignes d'une personne ─────────── */
    function soundsHtml(D, life, eu) {
        const {birth} = lifeSpan(life); if (birth === null) return '';
        const y20 = birth + 20;
        const {year, list} = soundsFor(D.rows, y20);
        const euItems = (eu?.items || []).filter(x => x.media);
        if (!list.length && !euItems.length) return '';
        const first = list[0];
        const lead = first ? T('Ce qu’on entendait au phonographe l’année de ses 20 ans ({y}) : {t}.', {y: String(y20), t: `<b>${esc(first.t)}</b>${first.who ? ` — ${esc(first.who)}` : ''}`})
            + (year !== y20 ? ` <small class="muted">(${esc(T('disque de {y}', {y: String(year)}))})</small>` : '') : T('Ce qu’on entendait l’année de ses 20 ans ({y}) :', {y: String(y20)});
        const li = r => `<li>${esc(r.t)}${r.who ? ` <small class="muted">— ${esc(r.who)}</small>` : ''} <small class="muted">(${esc(r.y)}, ${esc(r.lic)})</small> ${link(iaPage(r.id), '↗ Internet Archive')}<br>${player(iaFile(r), r.t)}</li>`;
        const euLi = x => `<li>${esc(x.title)} <small class="muted">(${esc(x.year || '')}, ${esc(x.lic)}${x.provider ? `, ${esc(x.provider)}` : ''})</small> ${link(x.page, '↗ Europeana')}<br>${player(x.media, x.title)}</li>`;
        const firstPlayer = first ? `${player(iaFile(first), first.t)} ${link(iaPage(first.id), '↗ Internet Archive')}` : '';
        const rest = list.slice(1).map(li).join('') + euItems.slice(0, 6).map(euLi).join('');
        return row('🔊', lead, SRC.sons() + (euItems.length ? ` · ${SRC.europeana()}` : ''), `<div class="l9a-play">${firstPlayer}</div>${more(rest ? `<ul class="hist-ul l9a-ul">${rest}</ul><small class="muted hist-hyp">${esc(T('Le son reste sur le site d’origine : il faut Internet pour l’écouter. L’année est celle écrite sur la notice.'))}</small>` : '', list.length - 1 + euItems.length || null)}`);
    }
    const songLine = r => `<b>${esc(r.t.replace(/ \((chanson|opéra-comique)\)$/, ''))}</b> (${esc(r.y)}${r.authors?.length ? `, ${esc(r.authors.map(a => a[0]).join(', '))}` : r.trad ? `, ${esc(T('chanson traditionnelle'))}` : ''})`;
    const scoreLink = r => (r.score ? link(r.score.url, T('🎼 partition (IMSLP)')) : '');
    function songsHtml(D, life) {
        const {birth} = lifeSpan(life);
        const {child, older} = songsFor(D.rows, birth);
        if (!child.length && !older.length) return '';
        const top = child.find(r => r.score) || child[0];
        const lead = top ? T('Les chansons de son enfance : {s}.', {s: songLine(top)}) : T('Les chansons qu’on chantait déjà avant sa naissance : {s}.', {s: songLine(older[0])});
        const li = r => `<li>${songLine(r)} ${scoreLink(r)} ${link(r.wp, '↗ Wikipédia')}${r.sentence ? `<br><small class="muted">« ${esc(r.sentence)} »</small>` : ''}</li>`;
        const restChild = child.filter(r => r !== top), olderList = top ? older.slice(0, 8) : older.slice(1, 9);
        const body = (restChild.length ? `<ul class="hist-ul">${restChild.map(li).join('')}</ul>` : '') + (olderList.length ? `<p class="muted">${esc(T('Et les chansons plus anciennes qu’on chantait encore :'))}</p><ul class="hist-ul">${olderList.map(li).join('')}</ul>` : '');
        const x = top || older[0];
        return row('🎼', `${lead} ${scoreLink(x)} ${srcLink(x.wp)}`, SRC.chansons(), (x.sentence ? `<blockquote class="l9a-quote">« ${esc(x.sentence)} »</blockquote>` : '') + more(body, restChild.length + olderList.length || null));
    }
    function bookLinks(b) { return [b.ws ? link(b.ws, T('📖 lire sur Wikisource')) : '', ...(b.ia || []).slice(0, 2).map(i => link(i.url, i.date ? T('📄 scan de {y}', {y: i.date}) : T('📄 scan'))), b.wp ? link(b.wp, '↗ Wikipédia') : ''].filter(Boolean).join(' · '); }
    function booksHtml(D, life) {
        const {birth} = lifeSpan(life);
        const list = schoolBooksFor(D.rows, birth); if (!list.length) return '';
        const top = list.find(b => b.id === 'tour') || list[0];
        const P = life.person;
        const lead = T('À l’école (de 7 à 13 ans, {a}–{b}), {p} a pu apprendre dans {t}.', {a: String(birth + 7), b: String(birth + 13), p: he(P), t: `<b>${esc(top.t)}</b> (${esc(top.yk === 'edition' ? T('édition de {y}', {y: String(top.y)}) : String(top.y))})`});
        const li = b => `<li><b>${esc(b.t)}</b> <small class="muted">(${esc(b.yk === 'edition' ? T('édition de {y}', {y: String(b.y)}) : String(b.y))}, ${esc(b.subj)})</small><br>${bookLinks(b)}${b.sentence ? `<br><small class="muted">« ${esc(b.sentence)} »</small>` : ''}</li>`;
        return row('📚', `${lead} ${bookLinks(top)}`, SRC.livres(), more(`<ul class="hist-ul">${list.filter(b => b !== top).map(li).join('')}</ul><small class="muted hist-hyp">${esc(T('Chaque école avait ses livres : ce sont les plus répandus de l’époque, pas forcément les siens.'))}</small>`, list.length - 1 || null));
    }
    function toysHtml(D, life) {
        const {birth} = lifeSpan(life);
        const {decade, list} = toysFor(D.meta.decades, birth); if (!list.length) return '';
        return row('🧸', T('Les jouets de son enfance : ceux des années {d}, quand {p} avait 6 ans.', {d: String(decade), p: he(life.person)}), SRC.jouets(),
            `<div class="l9a-figs">${list.slice(0, 4).map(g => fig(g)).join('')}</div>${more(`<div class="l9a-figs">${list.slice(4).map(g => fig(g)).join('')}</div>`, list.length > 4 ? list.length - 4 : null)}`);
    }
    const brandName = r => `<b>${esc(r.n)}</b>`;
    function brandsHtml(D, life) {
        const list = brandsFor(D.rows, life); if (!list.length) return '';
        const P = life.person;
        // la plus parlante : née pendant son enfance ou sa jeunesse (5–25 ans), sinon la première
        const top = list.find(x => x.age >= 5 && x.age <= 25 && x.r.img) || list.find(x => x.age >= 5 && x.age <= 25) || list[0];
        const lead = T('{P} avait {a} quand {b} est née ({y}).', {P: He(P), a: ageTxt(top.age), b: brandName(top.r), y: String(top.r.y)});
        const li = x => `<li>${esc(x.r.y)} : ${brandName(x.r)} <small class="muted">— ${esc(T('{a}', {a: ageTxt(x.age)}))}</small> ${srcLink(x.r.wp)}</li>`;
        return row('🍬', `${lead} ${srcLink(top.r.wp)}`, SRC.marques(), (top.r.img ? `<div class="l9a-figs">${fig({...top.r.img, t: top.r.n})}</div>` : '') + (top.r.sentence ? `<blockquote class="l9a-quote">« ${esc(top.r.sentence)} »</blockquote>` : '')
            + more(`<ul class="hist-ul">${list.filter(x => x !== top).map(li).join('')}</ul>`, list.length - 1 || null));
    }
    function carsHtml(D, life) {
        const list = carsAt30(D.rows, life); if (!list.length) return '';
        const top = list[0];
        const lead = top.age === 30 ? T('L’année de ses 30 ans ({y}) sort {c}.', {y: String(top.r.y), c: brandName(top.r)}) : T('Autour de ses 30 ans, en {y} (à {a}), sort {c}.', {y: String(top.r.y), a: ageTxt(top.age), c: brandName(top.r)});
        return row('🚗', `${lead} ${srcLink(top.r.wp)}`, SRC.marques(), (top.r.img ? `<div class="l9a-figs">${fig({...top.r.img, t: top.r.n})}</div>` : '') + (top.r.sentence ? `<blockquote class="l9a-quote">« ${esc(top.r.sentence)} »</blockquote>` : '')
            + more(`<ul class="hist-ul">${list.slice(1).map(x => `<li>${esc(x.r.y)} : ${brandName(x.r)} <small class="muted">— ${esc(ageTxt(x.age))}</small> ${srcLink(x.r.wp)}</li>`).join('')}</ul>`, list.length - 1 || null));
    }
    const recipeCache = new Map();
    function recipeLi(r, book, pid) {
        const k = `${r.b}|${r.n}`; recipeCache.set(k, {r, book});
        return `<li><b>${esc(r.n)}</b> ${link(r.url, T('↗ la page du livre'))}${!kiosk() ? ` <button type="button" class="button small secondary" data-l9a-recipe="${esc(k)}" data-l9a-pid="${esc(pid || '')}">${esc(T('＋ Ajouter au livre de recettes'))}</button>` : ''}<br><small class="muted">${esc(r.text.slice(0, 220))}${r.text.length > 220 ? '…' : ''}</small></li>`;
    }
    const bookTitle = b => `<b>${esc(b.t)}</b> (${esc(b.a)}, ${esc(b.y)}${b.ed && b.ed !== b.y ? `, ${esc(T('édition de {y}', {y: String(b.ed)}))}` : ''})`;
    function recipesHtml(D, life) {
        const {birth} = lifeSpan(life);
        const c = cookbookFor(D.meta.books || [], D.rows, birth); if (!c) return '';
        const pid = life.person?.id;
        const pickR = c.recipes.filter((r, i, a) => a.findIndex(x => x.k === r.k) === i).slice(0, 12);
        const lead = T('Le livre de cuisine de son époque : {b}.', {b: bookTitle(c.book)});
        const scans = c.scans.map(b => `<li>${bookTitle(b)} ${link(b.url, T('📄 le livre scanné'))}</li>`).join('');
        return row('🍰', `${lead} ${link(c.book.url, c.book.where === 'wikisource' ? T('📖 le lire') : T('📄 le livre scanné'))}`, SRC.recettes(),
            more((pickR.length ? `<ul class="hist-ul l9a-recipes">${pickR.map(r => recipeLi(r, c.book, pid)).join('')}</ul>` : '') + (scans ? `<p class="muted">${esc(T('D’autres livres de cuisine de son temps (scans) :'))}</p><ul class="hist-ul">${scans}</ul>` : ''), pickR.length || null));
    }
    /* 💌 en ligne, quand une clé Europeana est là */
    const euMemo = new Map();
    function euSearch(kind, q) {
        const k = keys().eu; if (!k) return Promise.resolve({ok: false, nokey: true});
        const key = kind + JSON.stringify(q);
        if (!euMemo.has(key)) euMemo.set(key, api('l9a_eu', {kind, key: k, ...q}).catch(e => { euMemo.delete(key); return {ok: false, message: e.message}; }));
        return euMemo.get(key);
    }
    function ww1Html(res, placeName, forPerson) {
        if (!res?.ok || !res.items?.length) return '';
        const items = res.items, top = items[0];
        const lead = forPerson ? T('{n} lettres, photos ou souvenirs de 14-18 de {p} sur Europeana 1914-1918 : {t}.', {n: nf(res.total || items.length), p: esc(placeName), t: `<b>${esc(top.title)}</b>`})
            : T('{n} lettres, photos ou souvenirs de 14-18 de la commune sur Europeana 1914-1918.', {n: nf(res.total || items.length)});
        const li = x => `<li>${x.thumb ? `<img class="l9a-mini" loading="lazy" alt="" src="${esc(x.thumb)}" onerror="this.remove()"> ` : ''}${esc(x.title)} <small class="muted">(${esc([x.year, x.provider, x.lic].filter(Boolean).join(', '))})</small> ${link(x.page, '↗ Europeana')}</li>`;
        return row('💌', `${lead} ${srcLink(res.search)}`, SRC.europeana(res.search), more(`<ul class="hist-ul l9a-eu">${items.slice(0, 20).map(li).join('')}</ul>`, items.length));
    }
    const lifeMemo = new Map();
    const lifeOf = id => { if (!lifeMemo.has(id)) lifeMemo.set(id, api('ha_life', {id}).catch(e => { lifeMemo.delete(id); throw e; })); return lifeMemo.get(id); };
    const PERSON_PARTS = ['sons', 'chansons', 'livres', 'jouets', 'marques', 'voitures', 'recettes', 'ww1'];
    const FILE_OF = {sons: 'sons', chansons: 'chansons', livres: 'livres', jouets: 'jouets', marques: 'marques', voitures: 'marques', recettes: 'recettes'};
    async function personInto(host, id, opts = {}) {
        const s = settings(), want = (opts.parts || PERSON_PARTS).filter(k => opts.force || s[k]);
        if (!want.length) { host.innerHTML = ''; return 0; }
        let life; try { life = opts.life || await lifeOf(id); } catch (_) { host.innerHTML = ''; return 0; }
        if (!life?.ok || life.person?.kind === 'animal') { host.innerHTML = ''; return 0; }
        const {birth} = lifeSpan(life);
        const files = [...new Set(want.map(k => FILE_OF[k]).filter(Boolean))];
        const D = Object.fromEntries(await Promise.all(files.map(async f => [f, await load(f).catch(() => null)])));
        const home = homePlace(life);
        const html = [];
        // les sons Europeana de ses 20 ans (en plus) et 💌 14-18 : seulement avec la clé
        const euSounds = want.includes('sons') && birth !== null && keys().eu ? await euSearch('sounds', {from: birth + 19, to: birth + 21}) : null;
        if (want.includes('sons') && D.sons) html.push(soundsHtml(D.sons, life, euSounds));
        if (want.includes('chansons') && D.chansons) html.push(songsHtml(D.chansons, life));
        if (want.includes('livres') && D.livres) html.push(booksHtml(D.livres, life));
        if (want.includes('jouets') && D.jouets) html.push(toysHtml(D.jouets, life));
        if (want.includes('marques') && D.marques) html.push(brandsHtml(D.marques, life));
        if (want.includes('voitures') && D.marques) html.push(carsHtml(D.marques, life));
        if (want.includes('recettes') && D.recettes) html.push(recipesHtml(D.recettes, life));
        if (want.includes('ww1') && home?.name && ww1Soldier(life) && keys().eu) html.push(ww1Html(await euSearch('ww1', {name: home.name, from: 1914, to: 1919}), home.name, true));
        if (!host.isConnected && !opts.detached) return 0;
        const out = html.filter(Boolean);
        host.innerHTML = out.length ? `<div class="hist-life l9a-life">${out.join('')}</div>` : '';
        return out.length;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.lot9_sons_enfance = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal') return '';
        if (!PERSON_PARTS.some(k => on(k))) return '';
        return A().card(index, T('🔊 Sons et enfance'), '', `<div class="l9a-block" data-l9a-person="${Number(p.id)}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => {
        document.querySelectorAll('#workspace [data-l9a-person]').forEach(async h => {
            const id = Number(h.dataset.l9aPerson); lifeMemo.delete(id);
            const n = await personInto(h, id);
            const card = h.closest('section.card'); if (card) card.hidden = !n;
        });
    });

    /* ─────────── 🏘 un lieu : fiche d'un village, monographie, à la demande ─────────── */
    const placeLL = pl => { const lat = num(pl?.lat ?? pl?.latitude), lon = num(pl?.lon ?? pl?.longitude); return lat !== null && lon !== null && !(lat === 0 && lon === 0) ? {lat, lon} : null; };
    const gbifMemo = new Map();
    async function gbifNear(kind, ll) {
        const N = await load('nature').catch(() => null); if (!N) return null;
        const list = kind === 'birds' ? N.meta.birds : N.meta.flowers;
        const k = `${kind}|${ll.lat.toFixed(2)}|${ll.lon.toFixed(2)}`;
        if (!gbifMemo.has(k)) gbifMemo.set(k, api('l9a_gbif', {kind, lat: ll.lat, lon: ll.lon, keys: list.map(s => s.key).join(',')}).catch(e => { gbifMemo.delete(k); return {ok: false, message: e.message}; }));
        const res = await gbifMemo.get(k);
        return res?.ok ? {res, near: speciesNear(list, res.counts)} : null;
    }
    const speciesFig = (x, extra = '') => (x.s.img ? fig({...x.s.img, t: x.s.fr, alt: x.s.fr}, extra) : `<figure class="l9a-fig l9a-noimg"><figcaption><b>${esc(x.s.fr)}</b>${extra}</figcaption></figure>`);
    const speciesCap = x => `<br><i>${esc(x.s.sci)}</i> · ${esc(x.s.mil)}${x.s.mois ? ` · ${esc(x.s.mois)}` : ''}<br><small class="muted">${esc(T('{n} observations', {n: nf(x.n)}))}</small>${x.s.wp ? ` ${link(x.s.wp, '↗ Wikipédia')}` : ''}`;
    async function birdsHtml(ll, placeName) {
        const g = await gbifNear('birds', ll); if (!g || !g.near.length) return '';
        const top = g.near.slice(0, 12);
        const xcKey = keys().xc;
        const songBtn = x => (xcKey ? `<br><button type="button" class="button small secondary" data-l9a-xc="${esc(x.s.sci)}">${esc(T('🔊 Écouter son chant'))}</button><span data-l9a-xc-host="${esc(x.s.sci)}"></span>` : '');
        const lead = T('Les oiseaux de son village : {list}…', {list: top.slice(0, 4).map(x => `<b>${esc(x.s.fr)}</b>`).join(', ')});
        return row('🐦', lead, SRC.gbif(g.res.url) + (xcKey ? ` · ${SRC.xc()}` : ''), `<div class="l9a-figs">${top.slice(0, 4).map(x => speciesFig(x, speciesCap(x) + songBtn(x))).join('')}</div>`
            + more(`<div class="l9a-figs">${top.slice(4).map(x => speciesFig(x, speciesCap(x) + songBtn(x))).join('')}</div>${!xcKey ? `<p class="muted">${esc(T('Pour écouter leur chant : ta clé xeno-canto gratuite dans Réglages → « 🔊 Sons et enfance ».'))}</p>` : ''}<small class="muted hist-hyp">${esc(T('Ce sont les observations d’aujourd’hui (à ~10 km) : les mêmes oiseaux chantaient déjà à son époque, souvent plus nombreux.'))}</small>`, top.length > 4 ? top.length - 4 : null),
        ` data-l9a-place="${esc(placeName || '')}"`);
    }
    async function flowersHtml(ll) {
        const g = await gbifNear('flowers', ll); if (!g || !g.near.length) return '';
        const top = g.near.slice(0, 16);
        const lead = T('Les fleurs sauvages de son pays : {list}…', {list: top.slice(0, 4).map(x => `<b>${esc(x.s.fr)}</b>`).join(', ')});
        return row('🌼', lead, SRC.gbif(g.res.url), `<div class="l9a-figs">${top.slice(0, 4).map(x => speciesFig(x, speciesCap(x))).join('')}</div>`
            + more(`<div class="l9a-figs">${top.slice(4).map(x => speciesFig(x, speciesCap(x))).join('')}</div><small class="muted hist-hyp">${esc(T('Observations d’aujourd’hui à ~10 km : les fleurs des prés et des haies ont beaucoup reculé depuis son époque.'))}</small>`, top.length > 4 ? top.length - 4 : null));
    }
    const photoCache = new Map();
    function photosHtml(res, placeName) {
        if (!res?.ok || !res.items?.length) return '';
        const items = res.items.filter(x => x.thumb);
        if (!items.length) return '';
        const card = x => { photoCache.set(x.id, {x, placeName});
            return fig({thumb: x.thumb, page: x.page, t: x.title, artist: [x.creator, x.provider].filter(Boolean).join(', '), date: x.year || '', lic: x.lic, where: '↗ Europeana'},
                !kiosk() && x.free ? `<br><button type="button" class="button small secondary" data-l9a-keep="${esc(x.id)}">${esc(T('＋ Garder dans les médias'))}</button>` : ''); };
        const lead = T('{n} photos et cartes anciennes de {p} sous licence libre sur Europeana.', {n: nf(res.total || items.length), p: esc(placeName)});
        return row('📷', `${lead} ${srcLink(res.search)}`, SRC.europeana(res.search), `<div class="l9a-figs">${items.slice(0, 4).map(card).join('')}</div>${more(`<div class="l9a-figs">${items.slice(4, 24).map(card).join('')}</div><small class="muted hist-hyp">${esc(T('Les images de Wikimedia Commons de la commune sont dans « 🖼️ Images anciennes de la commune » ; ici, celles des musées et archives d’Europe.'))}</small>`, items.length > 4 ? items.length - 4 : null)}`);
    }
    /** une partie d'un lieu → HTML ('' = rien) */
    async function placePart(kind, place, opts = {}) {
        const ll = placeLL(place), name = place.name || '';
        const years = opts.years || null;
        if (kind === 'ww1') { if (!name || !keys().eu) return ''; return ww1Html(await euSearch('ww1', {name, dept: place.county || '', from: 1914, to: 1919}), name, false); }
        if (kind === 'photos') {
            if (!name || !keys().eu) return '';
            const res = await euSearch('photos', {name, dept: place.county || '', from: years?.from ? Math.max(1840, years.from - 10) : 1850, to: years?.to ? Math.min(1980, years.to + 10) : 1960});
            return photosHtml(dedupeCommons(res), name);
        }
        if (kind === 'oiseaux') return ll ? birdsHtml(ll, name) : '';
        if (kind === 'fleurs') return ll ? flowersHtml(ll) : '';
        return '';
    }
    /** pas de doublon avec les images de Commons de « commune-plus » : une image Europeana qui vient de Wikimedia est écartée */
    function dedupeCommons(res) { if (!res?.ok) return res; return {...res, items: (res.items || []).filter(x => !/wikimedia/i.test(`${x.provider} ${x.thumb}`))}; }
    const PLACE_KINDS = ['ww1', 'photos', 'oiseaux', 'fleurs'];
    async function placeInto(host, place, opts = {}) {
        const s = settings(), kinds = (opts.parts || PLACE_KINDS).filter(k => opts.force || s[k]);
        const parts = await Promise.all(kinds.map(k => placePart(k, place, opts).catch(() => '')));
        if (!host.isConnected && !opts.detached) return 0;
        const html = parts.filter(Boolean);
        const offer = !keys().eu && !keys().xc && (s.ww1 || s.photos) && !opts.detached && !dismissed() ? `<p class="muted l9a-offer">${esc(T('Les lettres de 14-18 et les photos anciennes de la commune sur Europeana : il faut une clé gratuite.'))} <button type="button" class="button small secondary" data-l9a-settings>${esc(T('Réglages'))}</button> <button type="button" class="icon-button" data-l9a-dismiss aria-label="${esc(T('Ne plus proposer'))}" title="${esc(T('Ne plus proposer'))}">×</button></p>` : '';
        host.innerHTML = html.length || offer ? `<section class="maintenance-panel cplus-panel l9a-panel"><h3>${esc(T('🔊 Sons, nature et souvenirs du village'))}</h3><div class="hist-life l9a-life">${html.join('')}</div>${offer}</section>` : '';
        return html.length;
    }
    const DISMISS = 'genealogie-lot9-offre-vue';
    const dismissed = () => { try { return localStorage.getItem(DISMISS) === '1'; } catch (_) { return false; } };
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(),
            lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null,
            insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || '', county: ''};
    }
    async function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-l9a])'); if (!village) return;
        village.dataset.l9a = '1';
        if (!PLACE_KINDS.some(k => on(k))) return;
        const place = villagePlace(village);
        const anchor = village.querySelector('[data-et-host]') || village.querySelector('[data-ha-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="l9a-place" data-l9a-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-l9a-host]'), place);
    }
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; decorate().catch(e => console.error(e)); }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── 📜 Monographie de commune : une partie par sujet ─────────── */
    const MONO = [['ww1', 'l9a_ww1', '💌', 'Lettres et souvenirs de 14-18 (Europeana)'], ['photos', 'l9a_photos', '📷', 'Photos anciennes sur Europeana'], ['oiseaux', 'l9a_oiseaux', '🐦', 'Les oiseaux du village'], ['fleurs', 'l9a_fleurs', '🌼', 'Les fleurs sauvages du pays']];
    (ext.monographSections = ext.monographSections || []).push(...MONO.map(([kind, id, icon, label]) => ({
        id, icon, label, group: 'Le lieu', defaultOn: true, enabled: () => on(kind), source: SRC_TXT[kind],
        render: async (place, host, ctx) => {
            let years = null; try { years = ctx?.years ? await ctx.years() : null; } catch (_) {}
            const html = await placePart(kind, {...place, lat: place.latitude ?? place.lat, lon: place.longitude ?? place.lon}, {years}); if (!html) return false;
            host.innerHTML = `<div class="hist-life l9a-life">${html}</div>`; return true;
        }})));

    /* ─────────── les boutons (délégués) ─────────── */
    async function addRecipe(btn) {
        const c = recipeCache.get(btn.dataset.l9aRecipe); if (!c) return;
        const {r, book} = c, label = btn.textContent;
        btn.disabled = true;
        try {
            const story = T('Recette de « {b} » ({a}, {y}), page {p}. Texte du domaine public, d’après Wikisource : {u}', {b: book.t, a: book.a, y: String(book.ed || book.y), p: r.page || '?', u: r.url});
            const res = await post('tresor_memory_write', {op: 'save', item: {kind: 'recipe', title: r.n, body: r.text, data: {dish: 'plat', from: String(btn.dataset.l9aPid || ''), story}}});
            btn.textContent = T('✓ Dans le livre de recettes');
            const undo = async () => { await post('tresor_memory_write', {op: 'delete', id: res.id}); if (btn.isConnected) { btn.disabled = false; btn.textContent = label; } };
            A().undoToast ? A().undoToast(T('« {d} » ajoutée au livre de recettes (Trésors → Mémoire familiale).', {d: r.n}), {undo, icon: '🍰'}) : A().toast?.(T('Ajouté au livre de recettes.'));
        } catch (e) { btn.disabled = false; A().toast?.(e.message, 'error'); }
    }
    async function keepPhoto(btn) {
        const c = photoCache.get(btn.dataset.l9aKeep); if (!c) return;
        const label = btn.textContent; btn.disabled = true; btn.textContent = T('…');
        try {
            const res = await post('l9a_keep', {id: c.x.id, key: keys().eu || '', place_name: c.placeName || ''});
            if (!res?.batch) throw new Error(res?.error || T('Impossible de garder cette image.'));
            btn.textContent = T('✓ Dans les médias');
            const undo = async () => { await post('l9a_keep_undo', {batch: res.batch}); if (btn.isConnected) { btn.disabled = false; btn.textContent = label; } };
            A().undoToast ? A().undoToast(T('Image gardée dans les médias, avec sa source ({l}).', {l: res.licence || c.x.lic}), {undo, icon: '📷'}) : A().toast?.(T('Image gardée dans les médias.'));
        } catch (e) { btn.disabled = false; btn.textContent = label; A().toast?.(e.message, 'error'); }
    }
    async function playBird(btn) {
        const sci = btn.dataset.l9aXc, hostEl = btn.parentElement?.querySelector(`[data-l9a-xc-host="${CSS.escape(sci)}"]`);
        btn.disabled = true;
        try {
            const res = await api('l9a_xc', {sci, key: keys().xc || ''});
            if (!res?.ok) throw new Error(res?.message || T('Pas de connexion à Internet : réessaie quand tu seras connecté.'));
            const r = res.recs?.[0]; if (!r) { if (hostEl) hostEl.innerHTML = `<small class="muted">${esc(T('Pas d’enregistrement trouvé.'))}</small>`; return; }
            if (hostEl) hostEl.innerHTML = `${player(r.file, sci)}<small class="muted">${esc([r.rec, r.loc, r.type].filter(Boolean).join(' · '))} · ${link(r.lic, r.licname || r.lic)} · ${link(r.url, `↗ xeno-canto XC${r.id}`)}</small>`;
            btn.hidden = true;
            hostEl?.querySelector('audio')?.play?.().catch(() => {});
        } catch (e) { btn.disabled = false; A().toast?.(e.message, 'error'); }
    }
    document.addEventListener('click', e => {
        const t = e.target;
        const r = t.closest?.('[data-l9a-recipe]'); if (r) { e.preventDefault(); addRecipe(r); return; }
        const k = t.closest?.('[data-l9a-keep]'); if (k) { e.preventDefault(); keepPhoto(k); return; }
        const x = t.closest?.('[data-l9a-xc]'); if (x) { e.preventDefault(); playBird(x); return; }
        if (t.closest?.('[data-l9a-settings]')) { e.preventDefault(); ext.sonsEnfance.openSettings(); return; }
        const d = t.closest?.('[data-l9a-dismiss]'); if (d) { e.preventDefault(); try { localStorage.setItem(DISMISS, '1'); } catch (_) {} const p = d.closest('.l9a-offer'); p?.remove();
            A().undoToast?.(T('Proposition cachée.'), {undo: () => { try { localStorage.removeItem(DISMISS); } catch (_) {} }}); }
    });

    /* ─────────── 📋 Listes ─────────── */
    const rowsOf = kind => load(kind).then(D => D || {meta: {}, rows: []});
    const KIND_LABEL = {aliment: 'aliment', boisson: 'boisson', maison: 'maison', magasin: 'magasin', jouet: 'jouet', hygiene: 'toilette', objet: 'objet', voiture: 'voiture', 'deux-roues': 'deux-roues'};
    (ext.dataLists = ext.dataLists || []).push(
        {id: 'l9a_sons', icon: '🔊', label: T('Enregistrements anciens libres (78 tours, cylindres)'), group: 'Le monde', source: SRC_TXT.sons, sourceUrl: 'https://archive.org/details/78rpm', enabled: () => on('sons'),
            load: async () => (await rowsOf('sons')).rows.map(r => ({name: r.t, who: r.who, year: r.y, licence: r.lic, src: iaPage(r.id)})),
            fields: [{key: 'name', label: T('Enregistrement'), type: 'text'}, {key: 'who', label: T('Interprète'), type: 'text'}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'licence', label: T('Licence'), type: 'enum'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.year, r.year]},
        {id: 'l9a_chansons', icon: '🎼', label: T('Chansons populaires datées (partitions libres)'), group: 'Le monde', source: SRC_TXT.chansons, sourceUrl: 'https://imslp.org', enabled: () => on('chansons'),
            load: async () => (await rowsOf('chansons')).rows.map(r => ({name: r.t, year: r.y, authors: (r.authors || []).map(a => a[0]).join(', ') || T('traditionnel'), score: r.score?.url || '', quote: r.sentence, src: r.wp})),
            fields: [{key: 'name', label: T('Chanson'), type: 'text'}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'authors', label: T('Auteurs'), type: 'text'}, {key: 'score', label: T('Partition (IMSLP)'), type: 'url'}, {key: 'quote', label: T('La phrase de la source'), type: 'text'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.year, null]},
        {id: 'l9a_livres', icon: '📚', label: T('Livres d’école anciens'), group: 'Le monde', source: SRC_TXT.livres, sourceUrl: 'https://fr.wikisource.org', enabled: () => on('livres'),
            load: async () => (await rowsOf('livres')).rows.map(b => ({name: b.t, year: b.y, subject: b.subj, read: b.ws || b.ia?.[0]?.url || '', src: b.wp || b.ws || b.ia?.[0]?.url || ''})),
            fields: [{key: 'name', label: T('Livre'), type: 'text'}, {key: 'year', label: T('Paru en (ou édition de)'), type: 'year'}, {key: 'subject', label: T('Matière'), type: 'enum'}, {key: 'read', label: T('Le lire'), type: 'url'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.year, null]},
        {id: 'l9a_jouets', icon: '🧸', label: T('Jouets anciens par décennie (images)'), group: 'Le monde', source: SRC_TXT.jouets, sourceUrl: 'https://commons.wikimedia.org/wiki/Category:Toys_by_decade', enabled: () => on('jouets'),
            load: async () => { const D = await rowsOf('jouets'); const out = []; for (const [d, l] of Object.entries(D.meta.decades || {})) for (const g of l) out.push({name: g.t, decade: Number(d), artist: g.artist, licence: g.lic, src: g.page}); return out; },
            fields: [{key: 'name', label: T('Image'), type: 'text'}, {key: 'decade', label: T('Décennie'), type: 'year'}, {key: 'artist', label: T('Auteur'), type: 'text'}, {key: 'licence', label: T('Licence'), type: 'enum'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.decade, r.decade + 9]},
        {id: 'l9a_marques', icon: '🍬', label: T('Marques, voitures et objets français, par année'), group: 'Le monde', source: SRC_TXT.marques, sourceUrl: 'https://www.wikidata.org', enabled: () => on('marques') || on('voitures'),
            load: async () => (await rowsOf('marques')).rows.map(r => ({name: r.n, kind: T(KIND_LABEL[r.k] || r.k), year: r.y, quote: r.sentence, src: r.wp, wikidata: `https://www.wikidata.org/wiki/${r.q}`})),
            fields: [{key: 'name', label: T('Nom'), type: 'text'}, {key: 'kind', label: T('Genre'), type: 'enum', values: Object.values(KIND_LABEL).map(x => T(x))}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'quote', label: T('La phrase de la source'), type: 'text'}, {key: 'src', label: T('Source'), type: 'url'}, {key: 'wikidata', label: 'Wikidata', type: 'url'}],
            period: r => [r.year, null]},
        {id: 'l9a_recettes', icon: '🍰', label: T('Recettes des livres de cuisine anciens'), group: 'Le monde', source: SRC_TXT.recettes, sourceUrl: 'https://fr.wikisource.org/wiki/Cat%C3%A9gorie:Cuisine', enabled: () => on('recettes'),
            load: async () => { const D = await rowsOf('recettes'); const B = Object.fromEntries((D.meta.books || []).map(b => [b.id, b])); return D.rows.map(r => ({name: r.n, dish: r.k, book: B[r.b]?.t || '', author: B[r.b]?.a || '', year: B[r.b]?.ed || B[r.b]?.y || null, page: r.page, text: r.text.slice(0, 300), src: r.url})); },
            fields: [{key: 'name', label: T('Recette'), type: 'text'}, {key: 'dish', label: T('Plat'), type: 'enum'}, {key: 'book', label: T('Livre'), type: 'enum'}, {key: 'author', label: T('Auteur'), type: 'text'}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'page', label: T('Page'), type: 'text'}, {key: 'text', label: T('Le début'), type: 'text'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.year, null]},
        {id: 'l9a_oiseaux', icon: '🐦', label: T('Oiseaux communs des campagnes'), group: 'Le lieu', source: SRC_TXT.oiseaux, sourceUrl: 'https://www.gbif.org', enabled: () => on('oiseaux'),
            load: async () => ((await rowsOf('nature')).meta.birds || []).map(s => ({name: s.fr, sci: s.sci, where: s.mil, src: s.wp || `https://www.gbif.org/species/${s.key}`})),
            fields: [{key: 'name', label: T('Oiseau'), type: 'text'}, {key: 'sci', label: T('Nom latin'), type: 'text'}, {key: 'where', label: T('Où on le voit'), type: 'text'}, {key: 'src', label: T('Source'), type: 'url'}]},
        {id: 'l9a_fleurs', icon: '🌼', label: T('Fleurs sauvages communes'), group: 'Le lieu', source: SRC_TXT.fleurs, sourceUrl: 'https://www.gbif.org', enabled: () => on('fleurs'),
            load: async () => ((await rowsOf('nature')).meta.flowers || []).map(s => ({name: s.fr, sci: s.sci, where: s.mil, months: s.mois || '', src: s.wp || `https://www.gbif.org/species/${s.key}`})),
            fields: [{key: 'name', label: T('Fleur'), type: 'text'}, {key: 'sci', label: T('Nom latin'), type: 'text'}, {key: 'where', label: T('Où on la voit'), type: 'text'}, {key: 'months', label: T('Floraison'), type: 'text'}, {key: 'src', label: T('Source'), type: 'url'}]});

    /* ─────────── 🧰 le registre commun des données : à la demande ─────────── */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', country: pl.country || '', county: pl.county || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null} : null);
    const personOfCtx = ctx => Number(ctx.person?.id || ctx.person?.person?.id || ctx.person) || 0;
    async function runPerson(parts, ctx, host, empty) {
        const id = personOfCtx(ctx); if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return null; }
        host.innerHTML = '<div></div>';
        const n = await personInto(host.firstElementChild, id, {parts, force: true, detached: true});
        if (!n) host.innerHTML = emptyLine(T(empty), 'ℹ️');
        return n;
    }
    async function runPlace(kind, ctx, host) {
        const pl = placeOfCtx(ctx.place); if (!pl) { host.innerHTML = emptyLine(T('Choisis un lieu.'), '📍'); return null; }
        if ((kind === 'ww1' || kind === 'photos') && !keys().eu) { host.innerHTML = emptyLine(T('Il faut ta clé Europeana (gratuite) : Réglages → « 🔊 Sons et enfance ».'), '🔑'); return null; }
        const html = await placePart(kind, pl, {});
        host.innerHTML = html ? `<div class="hist-life l9a-life">${html}</div>` : '';
        return !!html;
    }
    async function runYear(ctx, host) {
        const y = num(ctx.year); if (y === null) { host.innerHTML = emptyLine(T('Choisis une année.'), '📅'); return null; }
        const D = await load('sons').catch(() => null); if (!D) return null;
        const {year, list} = soundsFor(D.rows, y);
        if (!list.length) { host.innerHTML = ''; return false; }
        host.innerHTML = `<div class="hist-life l9a-life">${row('🔊', T('Au phonographe en {y} : {t}.', {y: String(year), t: `<b>${esc(list[0].t)}</b>`}), SRC.sons(), `<div class="l9a-play">${player(iaFile(list[0]), list[0].t)} ${link(iaPage(list[0].id), '↗ Internet Archive')}</div>`)}</div>`;
        return true;
    }
    const PDS = [['sons', '🔊', 'Ce qu’on entendait au phonographe à ses 20 ans', 'Il faut sa date de naissance (entre 1879 et 1942).'], ['chansons', '🎼', 'Les chansons de son enfance', 'Il faut sa date de naissance.'],
        ['livres', '📚', 'Ses livres d’école', 'Il faut sa date de naissance (entre 1860 et 1960).'], ['jouets', '🧸', 'Les jouets de son enfance', 'Il faut sa date de naissance.'],
        ['marques', '🍬', 'Les marques nées de son vivant', 'Il faut sa date de naissance.'], ['voitures', '🚗', 'Les voitures de ses 30 ans', 'Il faut sa date de naissance (entre 1855 et 1965).'],
        ['recettes', '🍰', 'Le livre de cuisine de son époque', 'Il faut sa date de naissance.'], ['ww1', '💌', 'Lettres et souvenirs de 14-18 de sa commune', 'Il faut un homme né entre 1865 et 1900, un lieu de naissance, et ta clé Europeana.']];
    (ext.dataSources = ext.dataSources || []).push(
        ...PDS.map(([k, icon, label, empty]) => ({id: `l9a_${k}`, icon, label: T(label), group: 'La personne', needs: ['person'], installed: () => true, run: (ctx, host) => runPerson([k], ctx, host, empty)})),
        ...MONO.map(([kind, id, icon, label]) => ({id: `${id}_lieu`, icon, label: T(label), group: 'Le lieu', needs: ['place'], installed: () => true, run: (ctx, host) => runPlace(kind, ctx, host)})),
        {id: 'l9a_sons_annee', icon: '🔊', label: T('Un disque de cette année-là'), group: 'Le monde', needs: ['year'], installed: () => true, run: runYear});

    /* ─────────── 🌍 Où chercher : deux sites en plus (registre des sites du monde) ─────────── */
    function registerOuChercher() {
        const M = root.LCNDA_OUC_MONDE; if (!M || !Array.isArray(M.SITES) || M.SITES.some(s => s.key === 'l9a_eu1418')) return !!M;
        const enc = encodeURIComponent;
        M.SITES.push(
            {key: 'l9a_eu1418', icon: '💌', group: 'Monde', label: T('Europeana 1914-1918 — lettres, photos et objets des familles'), cats: ['bibliotheques'], period: [1914, 1919], access: 'online',
                url: p => `https://www.europeana.eu/fr/search?query=${enc(`"${p.last || ''}"`)}&qf=collection%3Aww1`,
                rel: {countries: ['fr', 'be', 'de', 'gb'], from: 1914, to: 1919, base: 0.8, why: () => T('Il a pu connaître la guerre de 14-18 : des familles ont confié à Europeana leurs lettres, photos et carnets ; cherche son nom')}},
            {key: 'l9a_gallica_certif', icon: '📝', group: 'Monde', label: T('Gallica — recueils de sujets du certificat d’études (lecture en ligne)'), cats: ['bibliotheques'], period: [1880, 1960], access: 'online',
                url: () => `https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=${enc('(gallica all "sujets" and gallica all "certificat d\'études")')}`,
                rel: {countries: ['fr'], from: 1880, to: 1990, base: 0.4, why: () => T('Les sujets donnés au certificat d’études (dictées, problèmes, rédactions) : des recueils sont numérisés sur Gallica (lecture libre, réutilisation non commerciale)')}});
        return true;
    }

    /* ─────────── ⚙️ Réglages → 🔊 Sons et enfance ─────────── */
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const metas = {};
        await Promise.all(Object.keys(FILES).map(async k => { try { const D = await load(k); if (D) metas[k] = D; } catch (_) {} }));
        let about = null; try { about = await api('l9a_about'); } catch (_) {}
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = settings(), k = keys();
        const tg = ([key, label, sub]) => `<label class="checkbox-line cplus-tg" data-l9a-tg="${key}"><input type="checkbox" ${s[key] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const count = {sons: D => D.rows.length, chansons: D => D.rows.length, livres: D => D.rows.length, jouets: D => Object.values(D.meta.decades || {}).reduce((a, b) => a + b.length, 0), marques: D => D.rows.length, recettes: D => D.rows.length, nature: D => (D.meta.birds || []).length + (D.meta.flowers || []).length};
        const LABEL = {sons: '🔊 Sons', chansons: '🎼 Chansons', livres: '📚 Livres d’école', jouets: '🧸 Jouets', marques: '🍬🚗 Marques et voitures', recettes: '🍰 Recettes', nature: '🐦🌼 Oiseaux et fleurs'};
        const rows = Object.keys(FILES).map(f => { const D = metas[f]; if (!D) return `<tr><td>${esc(T(LABEL[f]))}</td><td colspan="4" class="muted">${esc(T('Fichier absent.'))}</td></tr>`;
            const m = D.meta; return `<tr><td>${esc(T(LABEL[f]))}</td><td>${link(m.url, m.source)}${m.note ? `<br><small class="muted">${esc(m.note)}</small>` : ''}</td><td>${esc(nf(count[f](D)))}</td><td>${esc(m.licence)}</td><td>${esc(m.built || '')}</td></tr>`; }).join('');
        const certif = metas.livres?.meta?.certif;
        const certifTxt = certif ? (certif.found?.length ? T('Sujets du certificat d’études : {n} transcriptions trouvées sur Wikisource.', {n: String(certif.found.length)}) : T('📝 Sujets du certificat d’études : aucun recueil transcrit et ouvert trouvé sur Wikisource ni Internet Archive. « Où chercher » propose la recherche sur Gallica (lecture libre, réutilisation non commerciale).')) : '';
        const skipped = [...(metas.recettes?.meta?.excluded || [])].map(([t, why]) => `<li>${esc(t)} — <small class="muted">${esc(why)}</small></li>`).join('');
        ws.innerHTML = `<section class="page cplus-settings l9a-settings" data-l9a-settings-page>${UI().pageHeader ? UI().pageHeader({title: T('Sons et enfance'), icon: '🔊', where: T('Réglages · Données'), help: esc(T('Les disques, les chansons, les livres d’école, les jouets, les marques, les voitures et les recettes de son époque ; les oiseaux, les fleurs, les lettres de 14-18 et les photos de son village. Les listes sont livrées avec l’app ; les sons, les images et les recherches viennent d’Internet.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3><p class="muted">${esc(T('Sur la fiche d’une personne (bloc « 🔊 Sons et enfance »), sur la fiche d’un village et dans la monographie de commune. Les listes sont dans Listes.'))}</p>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('🔑 Tes clés gratuites'))}</h3>
                <p class="muted">${esc(T('Europeana et xeno-canto demandent une clé à chacun. Elle est gratuite : crée un compte sur leur site, puis colle ta clé ici. Elle reste sur cet ordinateur.'))}</p>
                <label class="l9a-key">${esc(T('Clé Europeana (lettres de 14-18, photos, sons)'))} <input type="text" autocomplete="off" spellcheck="false" data-l9a-key="eu" value="${esc(k.eu || '')}" placeholder="${esc(T('ta clé'))}"></label>
                <small class="muted">${link('https://www.europeana.eu/en/apis', T('↗ Demander une clé Europeana (gratuit)'))}</small>
                <label class="l9a-key">${esc(T('Clé xeno-canto (chants d’oiseaux)'))} <input type="text" autocomplete="off" spellcheck="false" data-l9a-key="xc" value="${esc(k.xc || '')}" placeholder="${esc(T('ta clé'))}"></label>
                <small class="muted">${link('https://xeno-canto.org/account', T('↗ Ta clé xeno-canto (compte gratuit)'))}</small>
                <p><button type="button" class="button small" data-l9a-keys-save>${esc(T('Enregistrer les clés'))}</button></p></div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Sujet'))}</th><th>${esc(T('Source'))}</th><th>${esc(T('Lignes'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Fabriqué le'))}</th></tr></thead><tbody>${rows}
                <tr><td>${esc(T('💌📷 Europeana'))}</td><td>${link('https://www.europeana.eu', 'Europeana')}</td><td>${esc(T('en ligne'))}</td><td>${esc(T('domaine public, CC0, CC BY, CC BY-SA seulement'))}</td><td></td></tr>
                <tr><td>${esc(T('🐦🌼 Observations'))}</td><td>${link('https://www.gbif.org', 'GBIF.org')}</td><td>${esc(T('en ligne'))}</td><td>${esc(T('jeux de données CC0 et CC BY 4.0'))}</td><td></td></tr>
                <tr><td>${esc(T('🐦 Chants'))}</td><td>${link('https://xeno-canto.org', 'xeno-canto')}</td><td>${esc(T('en ligne'))}</td><td>${esc(T('la licence de chaque enregistrement (souvent CC BY-NC-SA)'))}</td><td></td></tr></tbody></table></div>
                ${certifTxt ? `<p class="muted">${esc(certifTxt)}</p>` : ''}${skipped ? `<p class="muted">${esc(T('Livres de cuisine écartés (pas encore libres) :'))}</p><ul class="hist-ul">${skipped}</ul>` : ''}
                <p class="muted">${esc(T('Réponses gardées sur l’ordinateur : {n}.', {n: nf(about?.cache?.count || 0)}))} <button type="button" class="button small secondary" data-l9a-cache-clear>${esc(T('🗑 Vider'))}</button></p></div></section>`;
    }
    document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-l9a-tg]'); if (!t || !e.target.matches('input')) return;
        const s = settings(), k = t.dataset.l9aTg, was = s[k];
        s[k] = e.target.checked; saveSettings(s);
        A().undoToast?.(T(e.target.checked ? '« {p} » s’affiche.' : '« {p} » est caché.', {p: T(PARTS.find(p => p[0] === k)?.[1] || k)}), {undo: () => { const x = settings(); x[k] = was; saveSettings(x); drawSettings(); }});
    });
    document.addEventListener('click', async e => {
        if (e.target.closest?.('[data-l9a-keys-save]')) {
            const page = e.target.closest('[data-l9a-settings-page]'); const was = keys(), now = {...was};
            page.querySelectorAll('[data-l9a-key]').forEach(i => { const v = i.value.trim(); if (v) now[i.dataset.l9aKey] = v; else delete now[i.dataset.l9aKey]; });
            saveKeys(now); euMemo.clear();
            A().undoToast?.(T('Clés enregistrées.'), {undo: () => { saveKeys(was); euMemo.clear(); drawSettings(); }});
            return;
        }
        if (e.target.closest?.('[data-l9a-cache-clear]')) {
            try {
                const res = await post('l9a_cache_clear', {});
                euMemo.clear(); gbifMemo.clear(); drawSettings();
                A().undoToast?.(T('Réponses gardées effacées ({n}).', {n: String(res.removed)}), {undo: async () => { await post('l9a_cache_restore', {token: res.token}); drawSettings(); }});
            } catch (err) { A().toast?.(err.message, 'error'); }
        }
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'epoque_travail'); if (i < 0) i = tabs.findIndex(t => t[0] === 'histoire'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === 'lot9_sons_enfance')) { let i = B.findIndex(b => b[0] === 'epoque_travail'); if (i < 0) i = B.findIndex(b => b[0] === 'histoire'); if (i < 0) i = B.findIndex(b => b[0] === 'world'); B.splice(i < 0 ? B.length : i + 1, 0, ['lot9_sons_enfance', '🔊 Sons et enfance']); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans.lot9_sons_enfance ||= '12';
        registerOuChercher();
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.sonsEnfance = {...core, load, settings, keys, personInto, placeInto, placePart, lifeOf,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
