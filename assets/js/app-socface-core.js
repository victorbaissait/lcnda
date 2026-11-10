/* LCNDA — 🧾 Recensements SocFace (FranceArchives) : calculs purs, sans réseau (window.LCNDA_SOCFACE ; aussi require() dans Node).
 *
 * Le projet SocFace (ANR 2021-2026) a lu par intelligence artificielle les listes nominatives des recensements de 1836 à 1936 ;
 * les données sont dans la « base de noms – recensements » de FranceArchives. L'app N'INTERROGE JAMAIS ce site : elle fabrique
 * seulement l'adresse d'une recherche (ouverte dans le navigateur de la personne) et lit les fichiers CSV que la personne a
 * téléchargés elle-même, ou le texte d'une fiche qu'elle a copié.
 *
 *  - searchUrl({last, first, place, y1, y2, gender})  l'adresse https://francearchives.gouv.fr/basedenoms_recensement?…
 *    (paramètres du site : es_names, es_forenames, es_locations VÉRIFIÉS sur l'adresse réelle ; es_date_min, es_date_max, es_gender=f|h
 *    vus dans le code du site seulement)
 *  - censusYears(from, to)                              les années de recensement entre deux années (1836 … 1936, sans 1916)
 *  - parse(texte, {parseCSV})                           un CSV de FranceArchives (notice, export de recherche), un CSV SocFace
 *    complet (« Numéro Arkindex du ménage »…) ou le texte copié d'une fiche → {format, rows, skipped, households, notices}
 *  - group(rows)                                        les lignes rangées en ménages (n° de ménage, sinon année + commune + nom)
 *
 * Colonnes réelles (code source public de FranceArchives, cubicweb-francearchives, nominaroutes.py / entities/nomina.py) :
 *  - notice <id>.csv (VÉRIFIÉ sur un vrai fichier téléchargé : mêmes colonnes, « , », UTF-8 sans BOM ; tests/fixtures/socface/vrai-notice.csv,
 *    nom remplacé) : URL de FranceArchives, Nom, Prénoms, Date du document, Lieu du document, Profession, Genre,
 *    Type de document, Cote, Numéro de l'acte, Lieu de conservation, Lien vers le document numérisé (séparateur « , », UTF-8) ;
 *  - export d'une recherche (d'après le code seulement, pas encore vérifié sur un vrai fichier) : URL de FranceArchives, Nom, Prénoms, Profession, Type de document, Date du document,
 *    Lieu du document, Cote, Lien vers le document numérisé, Lieu de conservation.
 *  Ni le ménage, ni la naissance, ni la page ne sont dans ces CSV : on les prend dans le texte copié de la fiche
 *  (« Naissance », « Lien avec le chef de ménage », « Page et position de la ligne dans le recensement »…) quand il y en a.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_SOCFACE = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    const i18n = (s, v) => (typeof window !== 'undefined' && window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m))); // 🌐 app-i18n.js (sans fenêtre dans Node : le français)
    const YEARS = [1836, 1841, 1846, 1851, 1856, 1861, 1866, 1872, 1876, 1881, 1886, 1891, 1896, 1901, 1906, 1911, 1921, 1926, 1931, 1936];
    const BASE = 'https://francearchives.gouv.fr/basedenoms_recensement';
    /** l'adresse est vérifiée en partie : nom, prénom et lieu sur l'adresse réelle ; années et genre d'après le code du site */
    const VERIFIED = {verified: 'partiel', checked: '2026-11-10', params: {es_names: true, es_forenames: true, es_locations: true, es_date_min: false, es_date_max: false, es_gender: false}};
    const HOST_RX = /^https:\/\/francearchives\.gouv\.fr\//;
    const MENTION = 'Transcription automatique SocFace (FranceArchives) — peut contenir des erreurs : à vérifier sur l’image';
    const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
    const clean = s => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 400);
    const yearIn = v => { const m = String(v ?? '').match(/\b(1[6-9]\d\d|20\d\d)\b/); return m ? Number(m[1]) : null; };

    /** les années de recensement entre deux années (bornées à 1836–1936) */
    function censusYears(from, to) {
        const a = Number(from) || 1836, b = Number(to) || 1936;
        return YEARS.filter(y => y >= Math.min(a, b) && y <= Math.max(a, b));
    }

    /** L'adresse de la recherche sur FranceArchives : seulement ce qu'on voit dans l'adresse, rien d'autre n'est envoyé. */
    function searchUrl(p = {}) {
        const q = new URLSearchParams();
        const last = clean(p.last).slice(0, 80), first = clean(p.first).split(/\s+/)[0]?.slice(0, 60) || '', place = clean(p.place).replace(/\s*\(.*$/, '').split(',')[0].trim().slice(0, 80);
        if (last) q.set('es_names', last);
        if (first && p.firstAll) q.set('es_forenames', clean(p.first).slice(0, 80)); else if (first) q.set('es_forenames', first);
        if (place) q.set('es_locations', place);
        let y1 = Number(p.y1) || 0, y2 = Number(p.y2) || 0;
        if (y1 && y2 && y2 < y1) [y1, y2] = [y2, y1];
        if ((y2 && y2 < 1836) || (y1 && y1 > 1936)) { y1 = 0; y2 = 0; } // hors des recensements lus par SocFace : sans années
        if (y1) q.set('es_date_min', String(Math.max(1836, Math.min(1936, y1))));
        if (y2) q.set('es_date_max', String(Math.max(1836, Math.min(1936, y2))));
        const g = norm(p.gender);
        if (/^(f|female|femme)/.test(g)) q.set('es_gender', 'f'); else if (/^(h|m|male|homme)/.test(g)) q.set('es_gender', 'h');
        const s = q.toString();
        return s ? `${BASE}?${s}` : BASE;
    }
    /** une adresse de FranceArchives (notice, ménage) : gardée seulement si elle est bien sur ce site */
    const faUrl = u => { const s = String(u ?? '').trim(); return HOST_RX.test(s) && s.length < 600 && !/[\s<>"]/.test(s) ? s : ''; };
    /** le lien de l'image mène-t-il à la page exacte ? Un lien qui finit par « ficheFocus= » vide (vrai fichier des AD du Cher)
     *  ouvre le registre sans dire la page : on le garde, mais on le dit. */
    const imageExact = u => !!u && !/[?&-]ficheFocus=$|[?&][a-z_]*(page|vue|focus)[a-z_]*=$/i.test(String(u).trim());
    const imageLabel = u => imageExact(u) ? '🖼 Voir l’image ↗' : '🗂 Lien vers le registre (la page n’est pas précisée) ↗';
    const webUrl = u => { const s = String(u ?? '').trim(); return /^https?:\/\/[^\s<>"]+$/i.test(s) && s.length < 1000 ? s : ''; };

    /** « Tulle (Corrèze, France) » → {commune, department, country} */
    function splitPlace(v) {
        const s = clean(v); if (!s) return {commune: '', department: '', country: ''};
        const m = s.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
        if (!m) return {commune: s, department: '', country: ''};
        const parts = m[2].split(',').map(x => x.trim()).filter(Boolean);
        return {commune: m[1].trim(), department: parts.length > 1 ? parts.slice(0, -1).join(', ') : (/(france|belgique|suisse|italie|espagne|allemagne)/i.test(parts[0] || '') ? '' : parts[0] || ''), country: parts.length > 1 ? parts[parts.length - 1] : (/(france|belgique|suisse|italie|espagne|allemagne)/i.test(parts[0] || '') ? parts[0] : '')};
    }
    /** « 1922 ; St Périguen » → {year, text, place} */
    function splitBirth(v) {
        const s = clean(v); if (!s) return {year: null, text: '', place: ''};
        const [a, ...rest] = s.split(/\s*;\s*/);
        const y = yearIn(a);
        return y ? {year: y, text: a, place: rest.join(' ; ')} : {year: yearIn(s), text: '', place: s};
    }
    /** « 219 ; 4 » → {page, line} */
    function splitPageLine(v) { const m = String(v ?? '').match(/(\d+)\D+(\d+)/); return m ? {page: m[1], line: m[2]} : {page: (String(v ?? '').match(/\d+/) || [''])[0], line: ''}; }
    const gender = v => { const g = norm(v); return /^(f|femme|feminin|female)/.test(g) ? 'f' : /^(h|homme|m|masculin|male)/.test(g) ? 'h' : ''; };

    /* les noms des colonnes (français du site, anglais du site, CSV complet SocFace) → nos champs */
    const COLS = {
        url: ['url de francearchives', 'francearchives link', 'lien francearchives'],
        last: ['nom', 'name', 'nom de famille', 'names'],
        first: ['prenoms', 'forenames', 'prenom'],
        occupation: ['profession', 'profession (index)', 'profession (index siaf)', 'nmn_c_occupations', 'occupation'],
        occupation_src: ['profession (source)'],
        doctype: ['type de document', 'doctype_label', 'theme', 'typologie documentaire'],
        date: ['date du document', 'event date', 'annee du recensement'],
        place: ['lieu du document', 'event location', 'commune (normalisee)'],
        commune: ['commune de recensement'],
        department: ['departement'],
        cote: ['cote'],
        image: ['lien vers le document numerise', 'thumbnail_dest', 'url de la visionneuse'],
        service: ['lieu de conservation', 'partner service name'],
        gender: ['genre', 'gender'],
        act: ["numero de l'acte", 'deed number'],
        age: ['age'],
        birth_date: ['date de naissance'],
        birth_place: ['lieu de naissance'],
        birth: ['naissance', 'birth'],
        role: ['lien avec le chef de menage', 'relationship to the head of household'],
        civil: ['etat civil', 'civil status'],
        employer: ['employeur', 'employer'],
        nationality: ['nationalite', 'nationality'],
        notes: ['observations', 'comments_nomina_rp'],
        pageline: ['page et position de la ligne sur la page', 'page et position de la ligne dans le recensement', 'page and position of the line on the page'],
        household: ['numero arkindex du menage', 'household'],
        census: ['date et commune du recensement', 'date and place of the census'],
        arkindex: ['identifiant arkindex'],
    };
    const colKey = h => { const n = norm(h).replace(/\s*:\s*$/, ''); for (const [k, list] of Object.entries(COLS)) if (list.includes(n)) return k; return null; };

    /** une ligne lue (champs bruts) → une ligne SocFace normalisée */
    function rowFrom(v) {
        const pl = splitPlace(v.place || ''), cen = v.census ? (() => { const [d, ...p] = String(v.census).split(/\s*;\s*/); return {year: yearIn(d), ...splitPlace(p.join(' ; '))}; })() : null;
        const b = splitBirth(v.birth || ''), pg = splitPageLine(v.pageline || '');
        const commune = clean(v.commune) || cen?.commune || pl.commune;
        const r = {
            url: faUrl(v.url), last: titleCase(clean(v.last).replace(/\s*,\s*/g, ' ')), first: clean(v.first).replace(/\s*,\s*/g, ' '),
            occupation: neant(clean(v.occupation_src || v.occupation)), year: cen?.year || yearIn(v.date), commune,
            department: clean(v.department) || cen?.department || pl.department, country: cen?.country || pl.country || 'France',
            cote: clean(v.cote), image_url: webUrl(v.image), service: clean(v.service), gender: gender(v.gender),
            age: (String(v.age ?? '').match(/\d{1,3}/) || [''])[0], birth_year: yearIn(v.birth_date) || b.year || null, birth_text: clean(v.birth_date) || b.text,
            birth_place: clean(v.birth_place) || b.place, role: clean(v.role), civil_status: neant(clean(v.civil)), employer: neant(clean(v.employer)), nationality: neant(clean(v.nationality)),
            notes: clean(v.notes), page: pg.page, line: pg.line, household: clean(v.household).replace(/^_$/, ''), doctype: clean(v.doctype), arkindex: clean(v.arkindex),
            others: v.others || [],
        };
        return r;
    }
    /** « MOURGUE » → « Mourgue » (les noms écrits en capitales sur le site) ; un nom déjà en minuscules ne change pas */
    function titleCase(s) { return s && s === s.toUpperCase() && /[A-ZÀ-Ý]{2}/.test(s) ? s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, c) => a + c.toUpperCase()) : s; }
    /** deux noms qui se lisent pareil (« Mourgue » / « Mourgne ») : le moteur des lectures automatiques s'il est là */
    function similarNames(a, b) {
        if (norm(a) === norm(b)) return true;
        let L = null;
        try { L = (typeof window !== 'undefined' && window.LCNDA_LECTURE) || (typeof require === 'function' ? require('./app-lecture-auto.js') : null); } catch (_) { L = null; }
        return !!L && L.readingCost(a, b) <= 0.6;
    }
    /** « Néant », « Neant », « Niant », « néant » : une seule écriture (pas une erreur à signaler) */
    const neant = v => /^\s*(n[eéi]ant?|n[eé]an|neaut|nant)\s*\.?\s*$/i.test(String(v ?? '')) ? 'Néant' : v;
    const isCensus = r => !r.doctype || /recens|census|liste nominative|\brp\b/i.test(r.doctype);

    /** Le texte copié d'une ou plusieurs fiches de FranceArchives : « Libellé » puis valeur (même ligne avec « : » ou ligne suivante). */
    function parseNoticeText(text) {
        const lines = String(text || '').replace(/\r/g, '').split('\n').map(l => l.replace(/ /g, ' ').trim()).filter(Boolean);
        const LABELS = ['naissance', 'age', 'genre', 'etat civil', 'lien avec le chef de menage', 'profession (source)', 'profession (index)', 'profession', 'employeur', 'date et commune du recensement',
            'type de document', 'nationalite', 'observations', 'cote', 'page et position de la ligne dans le recensement', 'page et position de la ligne sur la page', 'voir les autres membres du menage', 'nom', 'prenoms', 'url de francearchives', 'lien vers le document numerise', 'lieu de conservation'];
        const notices = []; let cur = null, pending = null, title = '';
        const start = () => { cur = {_title: title}; notices.push(cur); };
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i], m = l.match(/^([^:]{2,60}?)\s*:\s*(.*)$/);
            const asLabel = s => LABELS.find(x => x === norm(s).replace(/\s*:$/, ''));
            let lab = m && asLabel(m[1]) ? asLabel(m[1]) : asLabel(l);
            if (lab) {
                const k = lab === 'voir les autres membres du menage' ? 'members' : colKey(lab);
                if (!cur || (k && k !== 'members' && cur[k] !== undefined)) start();
                if (k === 'members') { pending = 'members'; cur.others = []; continue; }
                const val = m && asLabel(m[1]) ? m[2] : '';
                if (val) { cur[k] = val; pending = null; } else pending = k;
                continue;
            }
            if (/https:\/\/francearchives\.gouv\.fr\/fr\/basedenoms\/\S+/.test(l)) { if (!cur) start(); cur.url = cur.url || l.match(/https:\/\/francearchives\.gouv\.fr\/fr\/basedenoms\/[^\s?#]+/)[0]; if (pending === 'members') pending = null; continue; }
            if (pending === 'members' && cur && !/^https?:/i.test(l)) { const mm = l.match(/^(.+?)(?:,\s*([^,]+))?$/); if (mm) cur.others.push({title: mm[1].trim(), role: (mm[2] || '').trim()}); continue; }
            if (pending && pending !== 'members' && cur) { cur[pending] = l; pending = null; continue; }
            if (/^https?:\/\//i.test(l) && cur && !cur.image) { cur.image = l; continue; }
            if (/^[A-ZÀ-ÝŒ' -]{2,}\s+[A-ZÀ-Ý][a-zà-ÿ]/.test(l) && l.length < 80) { title = l; if (cur && !cur.last) cur._title = l; }
        }
        return notices.map(n => {
            if (!n.last && n._title) { const mm = n._title.match(/^([A-ZÀ-ÝŒ' -]{2,}?)\s+([A-ZÀ-Ý].*)$/); if (mm) { n.last = mm[1].trim(); n.first = n.first || mm[2].trim(); } }
            return n;
        }).filter(n => n.last || n.first);
    }

    /** CSV (texte) ou texte de fiche → lignes normalisées + ménages. parseCSV : celui du moteur des tableaux (LCNDA_SHEET). */
    function parse(text, {parseCSV} = {}) {
        const t = String(text || '').replace(/^﻿/, '');
        const notices = [];
        let format = 'text', raw = [];
        const firstLine = t.split(/\r?\n/, 1)[0] || '';
        const looksCsv = /[,;\t]/.test(firstLine) && firstLine.split(/[,;\t]/).map(colKey).filter(Boolean).length >= 3;
        if (looksCsv) {
            if (typeof parseCSV !== 'function') throw new Error('le lecteur de tableaux n’est pas chargé');
            const rows = parseCSV(t);
            const head = (rows[0] || []).map(colKey);
            format = head.includes('household') || head.includes('arkindex') ? 'socface' : head.includes('gender') && head.includes('act') ? 'fa-notice' : 'fa-export';
            raw = rows.slice(1).filter(r => r.some(c => String(c).trim())).map(r => { const o = {}; head.forEach((k, i) => { if (k && o[k] === undefined) o[k] = r[i]; }); return o; });
        } else {
            raw = parseNoticeText(t);
            if (!raw.length) throw new Error('je ne reconnais ni un CSV de FranceArchives, ni le texte d’une fiche (« Naissance », « Lien avec le chef de ménage »…)');
        }
        const all = raw.map(rowFrom);
        const rows = all.filter(isCensus), skipped = all.length - rows.length;
        if (skipped) notices.push({kind: 'info', text: (skipped > 1 ? i18n('{n} lignes laissées de côté : ce ne sont pas des recensements.', {n: skipped}) : i18n('{n} ligne laissée de côté : ce ne sont pas des recensements.', {n: skipped}))});
        if (format === 'fa-export' || format === 'fa-notice') notices.push({kind: 'info', text: 'Ce fichier ne dit pas qui vit avec qui (le CSV de FranceArchives ne contient pas le ménage) : les personnes de même nom, même commune et même année sont mises ensemble. Décoche celles qui ne vont pas avec les autres. Pour avoir le ménage exact, copie le texte de la fiche (avec « Voir les autres membres du ménage »).'});
        const noYear = rows.filter(r => !r.year).length;
        if (noYear) notices.push({kind: 'warn', text: noYear > 1 ? i18n('{n} lignes sans année de recensement : elles ne seront pas importées.', {n: noYear}) : i18n('{n} ligne sans année de recensement : elle ne sera pas importée.', {n: noYear})});
        return {format, rows: rows.filter(r => r.year), skipped, households: group(rows.filter(r => r.year)), notices};
    }

    /** Les lignes rangées en ménages : n° de ménage si on l'a ; sinon même année, même commune, même nom de famille. */
    function group(rows) {
        const map = new Map();
        for (const r of rows) {
            let key = r.household ? `h:${r.household}` : `n:${r.year}|${norm(r.commune)}|${norm(r.last)}`;
            if (!r.household && !map.has(key)) { for (const [k, h] of map) if (!h.household && h.year === r.year && norm(h.commune) === norm(r.commune) && h.members.some(m => similarNames(m.last, r.last))) { key = k; break; } }
            if (!map.has(key)) map.set(key, {key, year: r.year, commune: r.commune, department: r.department, country: r.country, cote: r.cote, page: r.page, image_url: r.image_url, service: r.service, url: r.url, household: r.household, members: []});
            const h = map.get(key);
            h.members.push(r);
            h.image_url = h.image_url || r.image_url; h.cote = h.cote || r.cote; h.page = h.page || r.page; h.service = h.service || r.service; h.url = h.url || r.url;
            // les autres membres cités sur la fiche (nom et lien seulement), s'ils ne sont pas déjà là
            for (const o of r.others || []) {
                const mm = String(o.title).match(/^([A-ZÀ-ÝŒ' -]{2,}?)\s+([A-ZÀ-Ý].*)$/) || [null, o.title, ''];
                const extra = rowFrom({last: mm[1], first: mm[2], role: o.role});
                if (!h.members.some(m => norm(m.last) === norm(extra.last) && norm(m.first) === norm(extra.first))) h.members.push({...extra, year: r.year, commune: r.commune, department: r.department, page: r.page, partial: true});
            }
        }
        const roleRank = r => /^chef/i.test(r.role) ? 0 : /epou|époux|femme|mari/i.test(norm(r.role)) ? 1 : /fils|fille|enfant/i.test(norm(r.role)) ? 2 : 3;
        for (const h of map.values()) h.members.sort((a, b) => (Number(a.page) || 0) - (Number(b.page) || 0) || (Number(a.line) || 0) - (Number(b.line) || 0) || (a.line || b.line ? 0 : roleRank(a) - roleRank(b)));
        return [...map.values()].sort((a, b) => a.year - b.year || a.commune.localeCompare(b.commune, 'fr') || String(a.members[0]?.last).localeCompare(String(b.members[0]?.last), 'fr'));
    }

    return {YEARS, BASE, MENTION, VERIFIED, searchUrl, censusYears, parse, parseNoticeText, group, splitPlace, splitBirth, splitPageLine, faUrl, webUrl, imageExact, imageLabel, neant, norm};
});
