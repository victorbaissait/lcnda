/* LCNDA — 🔀 Listes réunies (suite) : d'autres listes réunies, seulement DÉCLARÉES (moteur : app-listes-reunies.js, app-listes-donnees.js),
 *  et deux choses que le moteur laissait ouvertes : chercher dans les VALEURS des listes, et les lieux de la famille sur la carte d'une liste.
 *
 *  Listes réunies (une ligne = un événement, un édifice, une personne ; la source ↗ sur chaque ligne ; 👪 « Dans la famille ») :
 *    🌋 Éruptions réunies   l10t_volcans (Wikipédia) + ha_catastrophes (NOAA, éruptions) + tf_volcans (NOAA, années de ciel voilé)
 *                           même numéro NOAA, OU même volcan la même année
 *    🌊 Crues réunies       hist_crues (BDHI) + mr_reperes (repères de crues) + hist_catnat (CatNat, inondations) + Wikidata (inondations)
 *                           même crue = ± 3 jours ET moins de 10 km (une source peut donner plusieurs lignes d'une même crue : many)
 *    ⚔️ Batailles réunies   ha_batailles + Wikidata (batailles) — même identifiant Wikidata
 *    🏛 Monuments réunis    Mérimée + châteaux (Wikidata) + lieux des lots G et H (forts, poudrières, sémaphores, lazarets, kiosques,
 *                           Marianne, halles) — même identifiant Wikidata OU même référence Mérimée
 *    🎖 Soldats réunis      Morts pour la France + Compagnons de la Libération + Carignan-Salières — même nom et même naissance ;
 *                           seulement des personnes décédées (jamais une fiche de la généalogie : ce sont des listes publiques)
 *    🗺 Anciens noms de lieux : déclarée par le lot J ; ici seulement une liste d'attente si personne ne l'a déclarée (jamais en double).
 *    (👶 Prénoms : pas de liste réunie — les sources donnent des comptes par zone et par année, ou le sens d'un prénom : rien à fondre.)
 *  Chaque source n'entre que si sa liste existe et est installée (sinon la liste réunie propose de les installer).
 *
 *  🔎 Les valeurs : LCNDA_EXT.listesValeurs = {warm(q, cb), has(d, mot), ready(id)} — l'écran « 🧰 Toutes les données » trouve aussi une
 *    liste quand le mot est dans ses lignes (« le mot est dans ses valeurs »). Un index des mots (≥ 3 lettres), fait UNE fois par liste
 *    installée (petites listes « load » seulement ; jamais une liste « query » du serveur), à la première frappe, liste par liste,
 *    pendant les temps morts du navigateur (requestIdleCallback) : la frappe n'attend jamais.
 *  👪 Sur la carte d'une liste qui montre la famille (colonne « Dans la famille », pastille ou critère « famille ») : un cercle vert
 *    autour de chaque lieu de la famille, rayon = le réglage « Dans la famille » (LCNDA_EXT.listesCarteFamille, appelé par paintMap).
 *  Tout est calculé ici : rien ne part sur Internet ; lecture seule (marche en mode consultation).
 *  Essai : tests/test-listes-reunies-plus.js
 */
(() => {
    'use strict';
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const E = () => ext.dataListsEngine || {};
    const RU = () => ext.listesReunies || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'");
    const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const nf = (n, d = 0) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('fr-FR', {maximumFractionDigits: d}) : '');
    const NOW = new Date().getFullYear();
    const dateCol = (key = 'date', label = 'Date') => ({key, label, type: 'date', html: r => esc(RU().dateText ? RU().dateText(r[key], r.year) : (r[key] || r.year || ''))});
    const famChip = km => (ext.listesFamille?.chip ? ext.listesFamille.chip({km}) : null);
    const qidOf = u => { const m = String(u || '').match(/wikidata\.org\/wiki\/(Q\d+)/); return m ? m[1] : ''; };
    /** « 12/03/1890 », « 1890-03-12 », « 1890 » → « 1890-03-12 » (ou ce qu'on sait) */
    const iso = s => { const t = String(s ?? '').trim(); let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; m = t.match(/^-?\d{3,4}(-\d{2}(-\d{2})?)?/); return m ? m[0] : ''; };
    const yearOf = s => { const m = String(s ?? '').match(/(?:^|\D)(-?\d{3,4})(?!\d)/); return m ? Number(m[1]) : null; };
    /** une personne : les mots de son nom, triés (« MOULIN Jean » = « Jean Moulin »), et son année de naissance */
    const personKey = (name, born) => { const w = fold(name).replace(/[^a-z' -]/g, ' ').split(/[\s-]+/).filter(x => x.length > 1); if (w.length < 2 || num(born) == null) return ''; return `${[w[0], w.at(-1)].sort().join(' ')}|${num(born)}`; };
    const volcKey = (name, year) => { const w = fold(name).replace(/\(.*\)/, '').match(/[a-z]{3,}/); return w && num(year) != null && !/^non$|^inconnu/.test(w[0]) ? `${w[0]}|${num(year)}` : ''; };
    const noaaId = u => { const m = String(u ?? '').match(/(?:^|\/)(\d{2,6})$/); return m ? m[1] : ''; };
    const NOAA_V = id => (id ? `https://www.ngdc.noaa.gov/hazel/view/hazards/volcano/event-more-info/${encodeURIComponent(id)}` : '');

    /* ═════════════ 🌋 Éruptions réunies ═════════════ */
    const ERUPTIONS = {id: 'eruptions', theme: 'seismes', icon: '🌋', label: 'Éruptions réunies', noun: ['éruption', 'éruptions'], group: 'Le monde',
        source: 'Wikipédia (CC BY-SA 4.0) · NOAA NCEI (domaine public)', keywords: ['volcan', 'éruption', 'eruption', 'VEI', 'année sans été'],
        same: {by: ['noaa', 'vk']},
        fields: [dateCol(), {key: 'year', label: 'Année', type: 'year'}, {key: 'volcano', label: 'Volcan', type: 'text'}, {key: 'country', label: 'Pays', type: 'enum'},
            {key: 'vei', label: 'Force (VEI)', type: 'number'}, {key: 'effect', label: 'Ce qui s’est passé', type: 'text'}, {key: 'to', label: 'Effet jusqu’en', type: 'year'}, {key: 'dead', label: 'Morts', type: 'number'}, {key: 'sources', label: 'Sources'}],
        hideCols: ['year', 'to'], familyColumn: true, familyKm: 300, familyBefore: 'sources', defaultSort: ['year', 'desc'], keep: ['noaa', 'vk'],
        diff: [{key: 'vei', abs: 0.5}, {key: 'dead', ratio: 2}],
        detail: [{key: 'date', label: 'Date'}, {key: 'volcano', label: 'Volcan'}, {key: 'vei', label: 'VEI'}, {key: 'effect', label: 'Ce qui s’est passé'}, {key: 'dead', label: 'Morts', fmt: v => nf(v)}],
        title: r => `${r.volcano || T('Éruption')}, ${r.year ?? ''}`, period: r => [r.year, r.to ?? r.year],
        sources: [
            {list: 'l10t_volcans', rank: 1, short: 'Wikipédia', sub: 'les récoltes gâchées', row: r => { const id = noaaId(r.noaa); return {key: r.name + r.date, noaa: id, vk: volcKey(r.name, r.year), date: r.date, year: r.year, volcano: r.name, country: r.where, vei: r.vei, effect: r.what, to: r.to, url: r.url || r.noaa}; }},
            {list: 'ha_catastrophes', rank: 2, short: 'NOAA', sub: 'monde', when: r => r.k === 'vo', row: r => ({key: `vo${r.id}`, noaa: r.id != null ? String(r.id) : '', vk: volcKey(r.volcano || r.loc, r.y ?? r.year), date: r.date || '', year: r.y ?? r.year, lat: r.lat, lon: r.lon,
                volcano: r.volcano || r.loc, country: r.country, vei: r.vei ?? r.mag, dead: r.deaths, url: NOAA_V(r.id)})},
            {list: 'tf_volcans', rank: 3, short: 'NOAA (ciel voilé)', sub: '1600–2000', when: r => !!r.volcano && r.volcano !== T('non identifié'), row: r => { const id = /event-more-info/.test(r.src || '') ? noaaId(r.src) : ''; return {key: `tf${r.year}|${r.volcano}`, noaa: id, vk: volcKey(r.volcano, r.year), year: r.year, volcano: r.volcano, country: r.country, vei: r.vei, url: r.src}; }}]};

    /* ═════════════ 🌊 Crues réunies ═════════════ */
    const CRUES = {id: 'crues', theme: 'eaux', icon: '🌊', label: 'Crues réunies', noun: ['crue', 'crues'], group: 'Le lieu',
        source: 'Géorisques BDHI et CatNat (Licence Ouverte) · Repères de crues (Licence Ouverte) · Wikidata (CC0)', keywords: ['inondation', 'crue', 'débordement', 'repère de crue', 'flood'],
        same: {km: 10, days: 3, yearOnly: true},
        fields: [dateCol(), {key: 'year', label: 'Année', type: 'year'}, {key: 'place', label: 'Où', type: 'place'}, {key: 'river', label: 'Rivière', type: 'enum'},
            {key: 'what', label: 'Ce qu’en dit la source', type: 'text'}, {key: 'highest', label: 'Plus haute crue connue ici', type: 'enum'}, {key: 'sources', label: 'Sources'}],
        hideCols: ['year', 'highest'], familyColumn: true, familyBefore: 'sources', defaultSort: ['date', 'desc'],
        detail: [{key: 'date', label: 'Date'}, {key: 'place', label: 'Où'}, {key: 'river', label: 'Rivière'}, {key: 'what', label: 'Ce qu’en dit la source'}],
        title: r => `${T('Crue')} ${r.river ? `${r.river} ` : ''}${r.place ? `· ${r.place} ` : ''}(${r.year ?? ''})`,
        sources: [
            {list: 'hist_crues', rank: 1, short: 'BDHI', row: r => ({key: r.id ?? `${r.start}|${r.title}`, date: iso(r.start) || r.year, year: r.year ?? yearOf(r.start), lat: r.lat, lon: r.lon, place: r.communes || r.deps, what: r.title, url: 'https://www.georisques.gouv.fr/base-de-donnees/BDHI'})},
            {list: 'mr_reperes', rank: 2, short: 'Repères de crues', many: true, lazy: true, row: r => ({key: r.id ?? `${r.insee}|${r.date}|${r.lat}`, date: iso(r.date) || r.annee, year: r.annee, lat: r.lat, lon: r.lon, place: r.commune, river: r.riviere, what: r.description, highest: r.plus_haute, url: r.url})},
            {list: 'hist_catnat', rank: 3, short: 'CatNat', many: true, lazy: true, preset: {crit: [{key: 'risk', kind: 'text', op: 'contains', value: 'nondation'}]}, when: r => /inond|crue/i.test(String(r.risk || '')),
                row: r => ({key: r.id ?? `${r.commune}|${r.start}`, date: iso(r.start) || r.year, year: r.year, lat: r.lat, lon: r.lon, place: r.commune, what: r.risk, url: 'https://www.georisques.gouv.fr/'})},
            {list: 'wikidata_evenements', rank: 4, short: 'Wikidata', lazy: true, when: r => /🌊|inond|flood|crue/i.test(String(r.kind || '')), row: r => ({key: r.qid, date: r.date, year: r.year, lat: r.lat, lon: r.lon, place: r.name, what: r.name, url: r.url})}]};
    CRUES.chips = [famChip(15)].filter(Boolean);

    /* ═════════════ ⚔️ Batailles réunies ═════════════ */
    const BATAILLES = {id: 'batailles', theme: 'guerres', icon: '⚔️', label: 'Batailles réunies', noun: ['bataille', 'batailles'], group: 'Le monde',
        source: 'Wikidata (CC0) · Wikipédia (CC BY-SA 4.0)', keywords: ['bataille', 'siège', 'combat', 'battle'],
        same: {by: 'qid'},
        fields: [dateCol(), {key: 'year', label: 'Année', type: 'year'}, {key: 'name', label: 'Bataille', type: 'text'}, {key: 'war', label: 'Guerre', type: 'enum'},
            {key: 'sides', label: 'Camps', type: 'text'}, {key: 'place', label: 'Lieu', type: 'text'}, {key: 'country', label: 'Pays', type: 'enum'}, {key: 'sources', label: 'Sources'}],
        hideCols: ['year', 'sides'], familyColumn: true, familyBefore: 'sources', defaultSort: ['year', 'desc'], keep: ['end'],
        detail: [{key: 'date', label: 'Date'}, {key: 'name', label: 'Bataille'}, {key: 'place', label: 'Lieu'}, {key: 'war', label: 'Guerre'}],
        title: r => `${r.name || T('Bataille')}${r.year != null ? `, ${r.year}` : ''}`, period: r => [r.year, r.end ?? r.year],
        sources: [
            {list: 'ha_batailles', rank: 1, short: 'Wikidata', sub: 'batailles et sièges', row: r => ({key: r.q, qid: r.q, date: r.date || r.year, year: r.year ?? r.y, end: r.y2 ?? r.end, lat: r.lat, lon: r.lon, name: r.name, war: r.war, sides: r.belligerents, place: r.place, country: r.country, url: r.url})},
            {list: 'wikidata_evenements', rank: 2, short: 'Wikidata (événements)', lazy: true, when: r => /⚔|bataille|battle|schlacht|batalla|battaglia|batalha|bitwa|slag/i.test(String(r.kind || '')),
                row: r => ({key: r.qid, qid: r.qid, date: r.date, year: r.year, end: r.end, lat: r.lat, lon: r.lon, name: r.name, url: r.wikipedia || r.url})}]};
    BATAILLES.chips = [famChip(15)].filter(Boolean);

    /* ═════════════ 🏛 Monuments réunis ═════════════ */
    const PLACE_SRC = [['tg_forts', 'forts'], ['tg_poudres', 'poudrières'], ['tg_semaphores', 'sémaphores'], ['tg_lazarets', 'lazarets'], ['th_kiosques', 'kiosques'], ['th_marianne', 'Marianne'], ['th_halles', 'halles']];
    const MONUMENTS = {id: 'monuments', theme: 'monuments', icon: '🏛', label: 'Monuments réunis', noun: ['monument', 'monuments'], group: 'Le lieu',
        source: 'Ministère de la Culture, POP — Mérimée (Licence Ouverte) · Wikidata (CC0) · OpenStreetMap (ODbL)', keywords: ['monument historique', 'mérimée', 'château', 'patrimoine', 'édifice'],
        same: {by: ['qid', 'merimee']},
        fields: [{key: 'name', label: 'Monument', type: 'text'}, {key: 'kind', label: 'Sorte', type: 'enum'}, {key: 'commune', label: 'Commune', type: 'place'},
            {key: 'from', label: 'Construit', type: 'year'}, {key: 'to', label: 'Jusqu’en', type: 'year'}, {key: 'protection', label: 'Protection', type: 'text'}, {key: 'merimee', label: 'Référence Mérimée', type: 'text'}, {key: 'sources', label: 'Sources'}],
        hideCols: ['to', 'merimee'], familyColumn: true, familyBefore: 'sources', keep: ['qid'],
        detail: [{key: 'name', label: 'Monument'}, {key: 'kind', label: 'Sorte'}, {key: 'commune', label: 'Commune'}, {key: 'from', label: 'Construit'}, {key: 'protection', label: 'Protection'}],
        title: r => `${r.name || T('Monument')}${r.commune ? ` (${r.commune})` : ''}`, period: r => [r.from, r.to ?? r.from],
        sources: [
            {list: 'lp_merimee', rank: 1, short: 'Mérimée', lazy: true, row: r => ({key: r.ref, merimee: r.ref, name: r.name, kind: r.deno, commune: r.commune, from: r.from, to: r.to, protection: r.protection, lat: r.lat, lon: r.lon, url: r.url})},
            {list: 'chateaux', rank: 2, short: 'Wikidata', sub: 'châteaux', lazy: true, row: r => ({key: r.q, qid: r.q, merimee: r.merimee, name: r.name, kind: r.type, commune: r.commune, from: r.from, to: r.to, protection: r.protection, lat: r.lat, lon: r.lon, url: r.wikipedia || r.wikidata})},
            ...PLACE_SRC.map(([list, sub]) => ({list, rank: 3, short: `Wikidata · ${sub}`, sub, row: r => { const q = qidOf(r.src); return {key: q || `${r.name}|${r.lat}|${r.lon}`, qid: q, name: r.name, kind: r.kind, commune: r.commune, from: r.from, to: r.to, protection: r.mh ? T('monument historique') : '', lat: r.lat, lon: r.lon, url: r.src}; }}))]};
    MONUMENTS.chips = [famChip(15)].filter(Boolean);

    /* ═════════════ 🎖 Soldats réunis (personnes décédées seulement) ═════════════ */
    const dead = (died, born) => num(died) != null || (num(born) != null && num(born) < NOW - 110);
    const SOLDATS = {id: 'soldats', theme: 'guerres', icon: '🎖', label: 'Soldats réunis', noun: ['soldat', 'soldats'], group: 'Chercher',
        source: 'Mémoire des hommes (ministère des Armées) · Wikidata (CC0)', keywords: ['soldat', 'poilu', 'mort pour la France', 'compagnon de la libération', 'militaire'],
        same: {by: 'pk'},
        fields: [{key: 'name', label: 'Nom', type: 'text', person: true}, {key: 'born', label: 'Naissance', type: 'text'}, {key: 'year', label: 'Né(e) en', type: 'year'}, {key: 'birthplace', label: 'Lieu de naissance', type: 'place'},
            {key: 'died', label: 'Décès', type: 'text'}, {key: 'role', label: 'Ce qu’en dit la source', type: 'text'}, {key: 'sources', label: 'Sources'}],
        hideCols: ['year'], familyColumn: true, familyBefore: 'sources', keep: ['pk'], defaultSort: ['name', 'asc'], // 👪 : qui de la famille vivait près de son lieu de naissance, l'année où il est né
        detail: [{key: 'name', label: 'Nom'}, {key: 'born', label: 'Naissance'}, {key: 'birthplace', label: 'Lieu de naissance'}, {key: 'died', label: 'Décès'}, {key: 'role', label: 'Ce qu’en dit la source'}],
        title: r => `${r.name || ''}${r.year != null ? ` (${r.year})` : ''}`, period: r => [r.year, r.year], geo: r => [r.lat, r.lon],
        sources: [
            {list: 'bo_mpf', rank: 1, short: 'Mémoire des hommes', sub: 'Morts pour la France 1914–1918', lazy: true, row: r => { const name = [r.nom, r.prenoms].filter(Boolean).join(' '), y = r.year ?? yearOf(r.naiss);
                return {key: r.key || r.id, pk: personKey(`${String(r.prenoms || '').split(/\s+/)[0]} ${r.nom}`, y), name, born: iso(r.naiss) || y, year: y, birthplace: [r.lieu, r.dep ? `(${r.dep})` : ''].filter(Boolean).join(' '), died: [iso(r.deces), r.lieu_deces].filter(Boolean).join(' · ') || T('mort pour la France'), role: [r.grade, r.unite].filter(Boolean).join(' · '), url: r.url}; }},
            {list: 'tg_compagnons', rank: 2, short: 'Ordre de la Libération', sub: 'Compagnons', when: r => dead(r.died, r.born), row: r => ({key: qidOf(r.src) || `${r.name}|${r.born}`, pk: personKey(r.name, r.born), name: r.name, born: r.born, year: r.born, birthplace: r.place, died: r.died, role: r.role, lat: r.lat, lon: r.lon, url: r.src})},
            {list: 'tg_carignan', rank: 3, short: 'Wikidata', sub: 'Carignan-Salières (1665)', when: r => dead(r.died, r.born), row: r => ({key: qidOf(r.src) || `${r.name}|${r.born}`, pk: personKey(r.name, r.born), name: r.name, born: r.born, year: r.born, birthplace: r.place, died: r.died, role: r.role, lat: r.lat, lon: r.lon, url: r.src})}]};

    /* ═════════════ 🗺 Anciens noms de lieux : au lot J ; ici seulement une attente s'il ne l'a pas déclarée ═════════════ */
    const isNames = m => m && (m.theme === 'lieux' || /anciens?_?noms|noms_lieux|toponym/i.test(String(m.id || ''))) && !m.placeholder;
    const NOMS = {id: 'anciens_noms', theme: 'lieux', icon: '🗺', label: 'Anciens noms de lieux', noun: ['nom', 'noms'], group: 'Le lieu', placeholder: true,
        source: 'GOV (CC BY-SA 3.0) · Wikidata (CC0)', keywords: ['ancien nom', 'toponymie', 'lieu-dit'], same: {by: 'key'},
        fields: [{key: 'name', label: 'Nom', type: 'text'}, {key: 'from', label: 'Depuis', type: 'year'}, {key: 'to', label: 'Jusqu’à', type: 'year'}, {key: 'sources', label: 'Sources'}],
        sources: [{list: 'gov_noms', rank: 1, short: 'GOV', row: r => ({key: r.gov ? `${r.gov}|${fold(r.name)}` : '', name: r.name, from: r.from, to: r.to, lat: r.lat, lon: r.lon})}]};
    function namesPlaceholder() {
        const M = ext.dataListMerges = ext.dataListMerges || [];
        if (M.some(isNames)) return;            // le lot J l'a déclarée : rien
        if (!M.some(m => m && m.id === NOMS.id)) M.push(NOMS);
    }

    const MINE = [ERUPTIONS, CRUES, BATAILLES, MONUMENTS, SOLDATS];
    const M0 = ext.dataListMerges = ext.dataListMerges || [];
    MINE.forEach(m => { if (!M0.some(x => x && x.id === m.id)) M0.push(m); });
    // le lot J se charge peut-être après nous : on attend la fin du chargement avant de poser l'attente
    if (document.readyState === 'complete') namesPlaceholder(); else window.addEventListener('load', () => setTimeout(namesPlaceholder, 0), {once: true});

    /* ═════════════ 🔎 chercher aussi dans les valeurs des listes ═════════════ */
    const VAL = new Map(); // id de liste → '\nmot\nmot…' (les mots de ses lignes, une fois)
    const WORDS_MAX = 80000, ROWS_MAX = 300000;
    const idle = () => new Promise(r => (window.requestIdleCallback ? window.requestIdleCallback(() => r(), {timeout: 400}) : setTimeout(r, 16)));
    const eligible = d => d && !d.link && !d.merged && !d.query && typeof d.load === 'function' && E().shown?.(d) !== false;
    async function indexOf(d) {
        if (VAL.has(d.id)) return VAL.get(d.id);
        let ok = true; try { ok = await E().isInstalled(d); } catch (_) { ok = false; }
        if (!ok) return null; // pas installée : on ne télécharge rien pour chercher
        let rows = []; try { rows = await E().loadAll(d); } catch (_) { VAL.set(d.id, ''); return ''; }
        const keys = (d.fields || []).filter(f => !['url', 'number', 'image'].includes(f.type) && f.key !== 'sources').map(f => f.key), set = new Set();
        let t = performance.now();
        for (let i = 0; i < rows.length && i < ROWS_MAX && set.size < WORDS_MAX; i++) {
            const r = rows[i];
            for (const k of keys) { const v = r[k]; if (v == null || v === '') continue; for (const w of fold(Array.isArray(v) ? v.join(' ') : v).split(/[^a-z0-9'-]+/)) if (w.length >= 3) set.add(w); }
            if (performance.now() - t > 12) { await idle(); t = performance.now(); } // jamais plus de 12 ms d'affilée
        }
        const txt = set.size ? `\n${[...set].join('\n')}` : '';
        VAL.set(d.id, txt); return txt;
    }
    let running = null, cbs = new Set(), tick = 0;
    function warm(q, cb) {
        if (cb) cbs.add(cb);
        if (fold(q).trim().length < 3 || running) return running;
        running = (async () => {
            const ds = (E().list?.() || []).filter(eligible).filter(d => !VAL.has(d.id));
            for (const d of ds) {
                await idle();
                const had = VAL.has(d.id); await indexOf(d).catch(() => null);
                if (!had && VAL.get(d.id)) { clearTimeout(tick); tick = setTimeout(() => { cbs.forEach(f => { try { f(); } catch (_) {} }); }, 250); }
            }
        })().finally(() => { running = null; cbs = new Set(); });
        return running;
    }
    /** le mot (ou son début : « moul » → moulin) est-il dans les valeurs de la liste ? (une liste réunie : dans l'une de ses sources) */
    function has(d, w) {
        const x = fold(w).trim(); if (x.length < 3 || !d) return false;
        if (d.merged && d.mergeId) { const M = (ext.dataListMerges || []).find(m => m && m.id === d.mergeId); try { return !!M && (RU().sourcesOf?.(M) || []).some(s => has(s.d, x)); } catch (_) { return false; } }
        const t = VAL.get(d.id); return !!t && t.includes(`\n${x}`);
    }
    ext.listesValeurs = {warm, has, ready: id => VAL.has(id), indexOf, reset: () => VAL.clear()};

    /* ═════════════ 👪 les lieux de la famille sur la carte d'une liste ═════════════ */
    const famShown = (d, st) => !!(d?.familyColumn || (st?.chips || []).includes('famille') || (st?.crit || []).some(c => c.kind === 'xf' && c.fid === 'famille'));
    let famAsked = false;
    /** [{lat, lon, km, color, nofit}] autour des lieux de la famille proches des points montrés ; repaint() quand les lieux arrivent */
    ext.listesCarteFamille = (d, st, pts, repaint) => {
        const LF = ext.listesFamille; if (!LF || !famShown(d, st)) return [];
        const F = LF.data?.();
        if (!F) { if (!famAsked) { famAsked = true; Promise.resolve(LF.ready?.()).then(() => { famAsked = false; if (LF.data?.()) repaint?.(); }, () => { famAsked = false; }); } return []; }
        const r = Number(LF.km?.()) || 15, dl = r / 111, ps = (pts || []).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
        if (!ps.length) return [];
        const box = [Math.min(...ps.map(p => p.lat)) - dl, Math.min(...ps.map(p => p.lon)) - dl * 2, Math.max(...ps.map(p => p.lat)) + dl, Math.max(...ps.map(p => p.lon)) + dl * 2];
        const seen = new Set(), out = [];
        for (const p of F.places || []) {
            if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || p.lat < box[0] || p.lat > box[2] || p.lon < box[1] || p.lon > box[3]) continue;
            const k = `${Math.round(p.lat * 20)}:${Math.round(p.lon * 20)}`; if (seen.has(k)) continue; seen.add(k);
            out.push({lat: p.lat, lon: p.lon, km: r, color: '#2e7d32', nofit: true, label: p.name});
            if (out.length >= 200) break;
        }
        return out;
    };

    ext.listesReuniesPlus = {defs: () => [...MINE, NOMS], personKey, volcKey, noaaId, iso, namesPlaceholder};
})();
