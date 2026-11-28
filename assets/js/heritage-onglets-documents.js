/* LCNDA — 📄 L'onglet « Documents » (maquette docs/design/onglets-documents-catalogue.html, D1 à D5).
 * Caché au départ (Réglages → Apparence → onglets du menu). Fait comme l'onglet Personnes : la liste dans la colonne de
 * gauche, la fiche à droite. Les documents sont les MÉDIAS de la base (rien à ressaisir) : lecture par
 * api.php?action=onglets&op=documents|document (lib/onglets.php, lecture seule) ; « ✎ Modifier » ouvre la visionneuse des
 * médias de l'app (la même que Listes → Médias).
 *  - colonne : bascule « A → Z | 👤 Par personne | 📁 Dossiers » (C5, comme Personnes), barre H10 (🔍 Chercher · Filtrer ▾ ·
 *    Trier : …), lettres repères ; chaque ligne (les mêmes que la colonne Personnes) : vignette, titre, puis les personnes
 *    reliées (« Jean MAZAUD, Marie LACOMBE +3 ») et la pastille K8 de la sorte avec la date et le lieu ; « ⋯ » à côté de
 *    la bascule = « Sous le titre : tout (conseillé) / les personnes / la date et le lieu » ; clic droit sur une ligne (K14) ;
 *  - 👤 Par personne : les documents sous le nom de chaque personne reliée (nom de famille puis prénom), « Sans personne » à la fin ;
 *  - vivants et fiches confidentielles : le serveur ne les nomme pas en mode consultation (lib/onglets.php), ni dans la
 *    liste, ni dans la recherche, ni dans « Par personne » ;
 *  - 📁 Dossiers : le rangement de Graphiques, tel quel (app-side-folders.js, kind 'document', clé genealogie-side-folders) :
 *    glisser, « ＋ 📁 Dossier », ✎ / 🗑 au survol, « 📁 Ranger » depuis la fiche, chaque rangement se défait (↶ Annuler) ;
 *  - réglages de la liste retenus (barre H10 : lcnda-listbar:onglets:documents ; mode et fiche ouverte : genealogie-documents-tab) ;
 *  - mode consultation 🔒 : on lit, on ouvre les dossiers, rien d'autre (la visionneuse s'ouvre en lecture seule).
 *  Audit des onglets (docs/design/audit-onglets.html, §4) :
 *  - « ✎ Modifier » : titre, date, lieu, cote et personnes modifiés sur place (POST onglets_write, lib/onglets.php ; ↶ Annuler) ;
 *    la visionneuse reste dans « ⋯ » (« 🖼 Ouvrir dans la visionneuse ») ;
 *  - rangements « 📍 Lieux » et « 🕰 Années » (commune, décennie) ; 🏷 pastilles d'étiquettes et « Filtrer ▾ → Étiquette » ;
 *  - 🔍 l'image zoomable (molette, glisser) et le texte transcrit côte à côte, défilement lié ;
 *  - ☑ « Cocher » dans la colonne : la barre commune (LCNDA_EXT.selectionBar) → 📁 Ranger, 🏷 Étiqueter, 👤 Relier, ⤓ ZIP, 🗑 Supprimer ;
 *  - 📋 Copier la citation (style au choix, retenu) ; 👯 « peut-être un doublon de… » (empreintes d'images) ; 🗑 Supprimer + ↶ Annuler ;
 *  - ✉️ « Noter une pièce manquante » dans le fil d'une correspondance (table doc_missing_pieces, ↶ Annuler).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI || {}, SF = () => window.LCNDA_SIDE_FOLDERS;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const plural = (n, w, pl) => A()?.plural ? A().plural(n, w, pl) : `${n} ${n > 1 ? (pl || w + 's') : w}`;
    const kiosk = () => document.body.classList.contains('is-kiosk');
    const PREF = 'genealogie-documents-tab', BAR_KEY = 'onglets:documents', STEP = 60;
    const readPref = () => { try { const v = JSON.parse(localStorage.getItem(PREF) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (_) { return {}; } };
    const writePref = patch => { try { localStorage.setItem(PREF, JSON.stringify({...readPref(), ...patch})); } catch (_) {} };
    const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const letterOf = t => { const c = fold(String(t || '').replace(/^[^A-Za-zÀ-ÿ0-9]+/, '')).charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; };
    const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

    /* ─── la sorte d'un document : pastille K8 grise (PHOTO, ACTE, LETTRE…) ─── */
    const SORTS = [['photo', '📷', 'Photo'], ['acte', '📄', 'Acte'], ['lettre', '✉️', 'Lettre'], ['carte', '🗺', 'Carte'], ['livret', '📒', 'Livret'], ['document', '📄', 'Document'], ['son', '🔊', 'Son'], ['video', '🎬', 'Vidéo']];
    function sortOf(d) {
        const t = fold(`${d.title} ${d.subject}`), mt = fold(d.media_type);
        if (mt === 'audio') return 'son';
        if (mt === 'video') return 'video';
        if (d.corr || /\b(lettre|courrier|carte postale|correspondance|telegramme)\b/.test(t)) return /carte postale/.test(t) ? 'carte' : 'lettre';
        if (/\b(carte|plan|cadastr|matrice)/.test(t)) return 'carte';
        if (/\b(livret|carnet|passeport)\b/.test(t)) return 'livret';
        if (/\b(acte|registre|bail|testament|contrat|diplome|certificat|jugement|inventaire|extrait|recensement|notari)/.test(t)) return 'acte';
        if (mt === 'pdf' || mt === 'document' || /\.(pdf|docx?|odt|txt)$/i.test(d.filename || '')) return 'document';
        return 'photo';
    }
    const sortMeta = k => SORTS.find(s => s[0] === k) || SORTS[0];
    const thumbOf = d => (fold(d.media_type) === 'image' && (d.thumbnail || d.filename)) ? `<img src="media/${encodeURIComponent(d.thumbnail || d.filename)}" alt="" loading="lazy" decoding="async">` : `<span class="ong-ico" aria-hidden="true">${sortMeta(sortOf(d))[1]}</span>`;
    const T = (k, v) => (window.LCNDA_I18N?.t ? window.LCNDA_I18N.t(k, v) : String(k).replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? ''));
    /* ce qu'on lit sous le titre (réglage « ⋯ » de la colonne) : tout (conseillé), les personnes, ou la date et le lieu */
    const UNDER = [['all', 'Tout : personnes, date et lieu (conseillé)'], ['people', 'Les personnes reliées'], ['when', 'La date et le lieu']];
    const under = () => (UNDER.some(u => u[0] === readPref().under) ? readPref().under : 'all');
    const SHOW_NAMES = 2; // au-delà : « +N »
    const peopleOf = d => d.people || [];
    /** « Jean MAZAUD, Marie LACOMBE » + « +3 » : les noms se coupent (…), le « +3 » reste toujours visible */
    function whoHtml(d) {
        const pp = peopleOf(d), n = Math.max(Number(d.people_count) || 0, pp.length); if (!n) return '';
        const names = pp.slice(0, SHOW_NAMES).map(p => p.name), rest = n - names.length;
        return `<span class="ong-who" title="${esc(pp.map(p => p.name).join(', ') + (n > pp.length ? ` +${n - pp.length}` : ''))}"><span class="ong-names">${esc(names.join(', '))}</span>${rest > 0 ? `<span class="ong-plus">+${rest}</span>` : ''}</span>`;
    }
    const whenText = (d, cote = false) => [d.date_text, d.place, cote && d.cote].filter(Boolean).join(' · ');
    const kindBadge = d => (UI().badge ? UI().badge(T(sortMeta(d.sort)[2]), 'grey', {cls: 'ong-type'}) : '');
    /** les lignes grises sous le titre (colonne) : la pastille de la sorte toujours en tête de la dernière */
    function subLines(d, {cote = false} = {}) {
        const u = under(), who = whoHtml(d), when = whenText(d, cote), lines = [];
        if (u !== 'when' && who) lines.push(who);
        if (u !== 'people' || !who) lines.push(`<span class="ong-wtxt">${esc(when || T('Sans date'))}</span>`);
        lines[lines.length - 1] = kindBadge(d) + lines[lines.length - 1];
        return lines.map(l => `<small class="ong-sub">${l}</small>`).join('');
    }
    /** les mêmes lignes pour une fiche (K9) à droite */
    const cardLines = d => { const u = under(), who = whoHtml(d), when = whenText(d, true); return [u !== 'when' && who ? {html: who} : '', u !== 'people' || !who ? when : ''].filter(Boolean); };
    const personKey = p => `${fold(p.last || p.name)} ${fold(p.first)}`;

    /* ─── les données ─── */
    let recFull = null, recFullLoading = null; // 📚 la liste complète des recueils (couverture, % transcrit…), pour les vignettes de droite
    let missing = []; // ✉️ les pièces manquantes notées dans les fils (lib/onglets.php, doc_missing_pieces)
    let recs = [], centers = new Map(), docs = null, loading = null, failed = '', cur = 0, shown = STEP, bar = null, cache = new Map();
    {   // « #documents/12 » : la fiche n° 12 (lien, ← → du navigateur)
        const m = location.hash.match(/^#documents\/(\d{1,12})\b/);
        cur = m ? Number(m[1]) : Number(readPref().cur) || 0;
    }
    let stale = false; // un média ajouté ou changé ailleurs (lcnda:media-changed) : la liste et le cache sont à relire
    async function load(force = false) {
        if (docs && !force && !stale) return docs;
        if (force || stale) recFull = null;
        if (!loading) { stale = false; loading = A().api('onglets', {op: 'documents'}).then(r => { recs = r.recueils || []; missing = r.missing || []; docs = (r.documents || []).map(d => ({...d, sort: sortOf(d)})); failed = ''; fillLabelOpts(); return docs; })
            .catch(e => { failed = e.message || 'Les documents n’ont pas pu se charger.'; docs = null; return []; }).finally(() => { loading = null; }); }
        return loading;
    }
    ext.documentItems = () => (docs || []).map(d => [String(d.id), `${sortMeta(d.sort)[1]} ${d.title}`]); // pour le glisser des dossiers
    const byId = id => (docs || []).find(d => d.id === Number(id)) || null;
    const recOf = id => recs.find(r => r.id === Number(id)) || null;
    const recNames = d => (d.recueils || []).map(x => recOf(x.id)?.title || '').filter(Boolean);

    /* ─── filtrer, trier ─── */
    const LABEL_OPTS = []; // 🏷 les étiquettes des documents (remplie au chargement : la barre lit cette liste à chaque ouverture de « Filtrer ▾ »)
    const labelsOf = d => d.labels || [];
    function fillLabelOpts() { const m = new Map(); (docs || []).forEach(d => labelsOf(d).forEach(l => { const x = m.get(l.id) || {l, n: 0}; x.n++; m.set(l.id, x); })); LABEL_OPTS.splice(0, LABEL_OPTS.length, ...[...m.values()].sort((a, b) => fold(a.l.name).localeCompare(fold(b.l.name), 'fr')).map(x => [String(x.l.id), `🏷 ${x.l.name}`, `🏷 ${x.l.name}`, x.n])); }
    const filters = () => [
        {id: 'sort', label: 'Sorte', type: 'check', options: SORTS.map(([k, i, l]) => [k, `${i} ${l}${l.endsWith('o') ? 's' : 's'}`])},
        {id: 'label', label: 'Étiquette', type: 'check', options: LABEL_OPTS},
        {id: 'tr', label: 'Transcription', type: 'radio', options: [['', 'Tous'], ['tr', '✅ Déjà transcrits'], ['notr', '📝 Pas encore transcrits']], dflt: ''},
        {id: 'from', group: 'Année', label: 'À partir de', type: 'text', placeholder: 'ex. 1900', chipPrefix: 'Depuis'},
        {id: 'to', group: 'Année', label: 'Jusqu’à', type: 'text', placeholder: 'ex. 1920', chipPrefix: 'Jusqu’à'},
        {id: 'akind', label: 'Sorte d’acte', type: 'check', options: AKINDS.map(([k, l]) => [k, l])},
        {id: 'place', group: 'Lieu', label: 'Ville ou lieu', type: 'place', placeholder: 'ex. Sancoins', chipPrefix: 'Lieu :'},
        {id: 'km', group: 'Lieu', label: 'Dans un rayon de (km)', type: 'text', placeholder: 'ex. 20 (vide : le lieu seul)', chip: v => (kmOf(v) ? T('à {n} km autour', {n: String(kmOf(v))}) : '')},
        {id: 'rec', group: 'Recueil', label: 'Recueil', type: 'radio', options: [['', 'Tous'], ['in', '📚 Dans un recueil'], ['out', 'Dans aucun recueil']], dflt: ''},
        {id: 'recname', group: 'Recueil', label: 'Nom du recueil', type: 'text', placeholder: 'ex. Registre de Sancoins', chipPrefix: '📚'},
        {id: 'person', label: 'Personne', type: 'person', chipPrefix: 'Avec'},
        {id: 'loose', label: 'Rangement', type: 'check', text: 'Rattachés à aucune fiche', chipLabel: 'Sans fiche'}];
    /* 📜 la sorte d'acte : celle choisie dans l'Atelier, sinon devinée d'après le titre (« Naissance de… ») */
    const AKINDS = [['naissance', 'Naissances', /\bnaissance|\bne le\b|\bnee le\b/], ['bapteme', 'Baptêmes', /\bbapt/], ['mariage', 'Mariages', /\bmariage|\bmarie le\b/], ['deces', 'Décès', /\bdeces\b|\bdecede/],
        ['sepulture', 'Sépultures', /\bsepulture|\binhum/], ['notarial', 'Actes notariés', /\bnotari|\bcontrat de mariage|\btestament|\binventaire/], ['notoriete', 'Actes de notoriété', /\bnotoriete/],
        ['recensement', 'Recensements', /\brecensement/], ['militaire', 'Documents militaires', /\bmilitaire|\bmatricule|\bregiment/], ['lettre', 'Lettres', /\blettre|\bcourrier/]];
    const kindsOf = d => ((d.kinds || []).length ? d.kinds : AKINDS.filter(k => k[2].test(fold(d.title))).map(k => k[0]));
    const kmOf = v => { const n = Number(String(v || '').replace(',', '.').match(/\d+(?:\.\d+)?/)?.[0]); return n > 0 ? Math.min(n, 2000) : 0; };
    const dist = (a, b) => { const r = x => x * Math.PI / 180, dl = r(b.lat - a.lat), dn = r(b.lon - a.lon); const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dn / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(h))); };
    const placeWord = t => fold(String(t || '').replace(/^txt:/, '').split(',')[0]).trim();
    /** le document est-il à ce lieu (ou à X km autour) ? le centre et ses coordonnées sont lus une fois (onglets place_point) */
    let warnedNoGeo = 0;
    function placeOk(d, v, km) {
        const geo = d.geo || [], pid = v && typeof v === 'object' ? Number(v.id) : 0, w = placeWord(pid ? v.title : v);
        if (pid && geo.some(g => g.id === pid)) return true;
        if (pid && km) {
            const c = centers.get(pid);
            if (c === undefined) { centers.set(pid, null); A().api('onglets', {op: 'place_point', id: pid}).then(p => { centers.set(pid, p); paintList(); paintWorkspaceList(); }).catch(() => centers.set(pid, {lat: null})); }
            else if (c && c.lat != null) return geo.some(g => g.lat != null && dist(c, g) <= km);
            else if (c && warnedNoGeo !== pid) { warnedNoGeo = pid; A().toast(T('« {x} » n’a pas encore de coordonnées : seuls les documents de ce lieu sont montrés (ajoute-les dans Lieux pour chercher autour).', {x: v.title || ''})); }
        }
        return !!w && [d.place, ...geo.map(g => g.name)].some(n => placeWord(n) === w || fold(n).includes(w));
    }
    const SORT_OPTS = [['az', 'A → Z'], ['za', 'Z → A'], ['recent', 'Les plus récents'], ['old', 'Les plus anciens'], ['cote', 'Par cote'], ['date', 'Par date du document']];
    /* 🔎 les images qui ont une enquête photo (pour la colonne de gauche en mode « 🔎 Enquêtes photo ») ; null : pas encore lues */
    let epIds = null, epLoading = null;
    function loadEpIds(force = false) {
        const EP = ext.enquetePhoto; if (!EP?.loadCounts) { epIds = new Set(); return Promise.resolve(); }
        if (epLoading && !force) return epLoading;
        epLoading = EP.loadCounts(force).then(c => { const before = epIds ? [...epIds].sort().join() : null; epIds = new Set(Object.keys(c?.by || {}).filter(k => Number(c.by[k]) > 0).map(Number)); epLoading = null;
            if (modeOf() === 'inquiries' && before !== [...epIds].sort().join()) paintList(); });
        return epLoading;
    }
    function filtered() {
        const st = bar?.state || {q: '', filters: {}, sort: 'az'}, f = st.filters || {};
        const q = fold(st.q).trim(), words = q.split(/\s+/).filter(Boolean);
        const y1 = Number(String(f.from || '').match(/\d{3,4}/)?.[0]) || 0, y2 = Number(String(f.to || '').match(/\d{3,4}/)?.[0]) || 0;
        const pid = f.person && typeof f.person === 'object' ? Number(f.person.id) : 0, pname = !pid && f.person ? fold(String(f.person).replace(/^txt:/, '')) : '';
        const epOnly = modeOf() === 'inquiries';
        if (epOnly && !epIds) { loadEpIds(); return []; }
        let list = (docs || []).filter(d => {
            if (words.length) { const hay = fold([d.title, d.cote, d.date_text, d.place, d.series, ...(d.people || []).map(p => p.name), ...recNames(d), ...(d.geo || []).map(g => g.name), ...kindsOf(d).map(k => AKINDS.find(x => x[0] === k)?.[1] || ''), ...labelsOf(d).map(l => l.name)].join(' ')); if (!words.every(w => hay.includes(w))) return false; }
            if (Array.isArray(f.sort) && f.sort.length && !f.sort.includes(d.sort)) return false;
            if (Array.isArray(f.label) && f.label.length && !labelsOf(d).some(l => f.label.includes(String(l.id)))) return false;
            if (f.tr === 'tr' && !d.has_tr) return false;
            if (f.tr === 'notr' && d.has_tr) return false;
            if ((y1 || y2) && (!d.year || (y1 && d.year < y1) || (y2 && d.year > y2))) return false;
            if (f.place && !placeOk(d, f.place, kmOf(f.km))) return false;
            if (Array.isArray(f.akind) && f.akind.length && !kindsOf(d).some(k => f.akind.includes(k))) return false;
            if (f.rec === 'in' && !(d.recueils || []).length) return false;
            if (f.rec === 'out' && (d.recueils || []).length) return false;
            if (f.recname && !recNames(d).some(n => fold(n).includes(fold(f.recname)))) return false;
            if (pid && !(d.people || []).some(p => p.id === pid)) return false;
            if (pname && !(d.people || []).some(p => fold(p.name).includes(pname))) return false;
            if (f.loose && d.links) return false;
            if (epOnly && !epIds.has(Number(d.id))) return false; // 🔎 Enquêtes photo : seulement les images qui ont une enquête
            return true;
        });
        const t = d => fold(d.title), num = s => Number(String(s || '').match(/\d+/)?.[0]) || 0;
        const cmp = {az: (a, b) => t(a).localeCompare(t(b), 'fr'), za: (a, b) => t(b).localeCompare(t(a), 'fr'),
            recent: (a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.id - a.id, old: (a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id - b.id,
            cote: (a, b) => (a.cote ? 0 : 1) - (b.cote ? 0 : 1) || fold(a.cote).replace(/\d+/g, '').localeCompare(fold(b.cote).replace(/\d+/g, ''), 'fr') || num(a.cote) - num(b.cote) || t(a).localeCompare(t(b), 'fr'),
            date: (a, b) => (a.year || 99999) - (b.year || 99999) || t(a).localeCompare(t(b), 'fr')}[st.sort] || ((a, b) => t(a).localeCompare(t(b), 'fr'));
        return list.sort(cmp);
    }

    /* ─── la colonne de gauche ─── */
    /** 🏷 les pastilles d'étiquettes (2 au plus, « +N ») */
    const labelChips = d => { const ls = labelsOf(d); if (!ls.length) return ''; return `<span class="ong-labels">${ls.slice(0, 2).map(l => `<span class="ong-label" style="${l.color ? `--ong-lc:${esc(l.color)}` : ''}" title="${esc(T('Étiquette : {x}', {x: l.name}))}">🏷 ${esc(l.name)}</span>`).join('')}${ls.length > 2 ? `<span class="ong-label is-more">+${ls.length - 2}</span>` : ''}</span>`; };
    const rowBtn = (d, letter) => `<button type="button" class="side-menu-item ong-row ong-docrow${d.id === cur ? ' is-active' : ''}" data-ong-doc="${d.id}" data-letter="${esc(letter)}">
        <span class="ong-thumb">${thumbOf(d)}</span><span class="ong-txt"><strong>${esc(d.title)}</strong>${subLines(d, {cote: bar?.state?.sort === 'cote'})}${labelChips(d)}</span></button>`;
    // ☑ en mode « Cocher », chaque ligne est dans une boîte (la case de la barre commune se pose à côté du bouton, pas dedans)
    const rowHtml = (d, letter = letterOf(d.title)) => (selOn() ? `<div class="ong-selrow" data-ong-sel="${d.id}">${rowBtn(d, letter)}</div>` : rowBtn(d, letter));
    /* les façons de ranger (maquette correspondances.html, partie 2) : A = 6 cases en 3 × 2 (conseillé) ; B = 4 cases, « 📚 Ensembles »
       et dessous un petit choix Recueils / Lettres / Sortes. Le choix A ou B : ⋯ → « Façons de ranger » (retenu). */
    const MODES = [['az', 'A → Z'], ['people', '👤 Personnes'], ['recueils', '📚 Recueils'], ['folders', '📁 Dossiers'], ['letters', '✉️ Lettres'], ['sorts', '🏷 Sortes'], ['places', '📍 Lieux'], ['years', '🕰 Années'], ['inquiries', '🔎 Enquêtes photo']];
    const SETS = [['recueils', '📚 Recueils'], ['letters', '✉️ Lettres'], ['sorts', '🏷 Sortes'], ['places', '📍 Lieux'], ['years', '🕰 Années'], ['inquiries', '🔎 Enquêtes photo']];
    /* 📍 Par lieu (la commune de l'acte) et 🕰 Par année (la décennie) : des groupes repliables, comme les sortes */
    const placeOf = d => String(d.place || (d.geo || [])[0]?.name || '').split(',')[0].trim();
    const decadeOf = d => (d.year ? Math.floor(d.year / 10) * 10 : null);
    // ☑ « Cocher » : des cases dans la colonne et la barre d'actions commune (app-selection.js)
    let selMode = false, sel = null;
    const selOn = () => selMode && !kiosk() && modeOf() !== 'folders';
    const layout = () => (readPref().layout === 'B' ? 'B' : 'A');
    const modeOf = () => (MODES.some(m => m[0] === readPref().mode) ? readPref().mode : 'az');
    const isSet = m => SETS.some(x => x[0] === m);
    const CO = () => window.LCNDA_CORRESP;
    const gapMonths = () => { const n = Number(readPref().gapMonths); return n >= 1 && n <= 24 ? n : 2; };
    function modeBarHtml(mode) {
        if (layout() === 'A') return `<div class="segmented ong-mode is-grid is-3" role="tablist" aria-label="${esc(T('Façon de ranger'))}">${MODES.map(([k, l]) => `<button type="button" class="${mode === k ? 'is-active' : ''}" data-ong-mode="${k}" aria-pressed="${mode === k}">${esc(T(l))}</button>`).join('')}</div>`;
        const four = [['az', 'A → Z'], ['people', '👤 Par personne'], ['sets', '📚 Ensembles'], ['folders', '📁 Dossiers']];
        const on = k => (k === 'sets' ? isSet(mode) : mode === k);
        return `<div class="segmented ong-mode is-grid" role="tablist" aria-label="${esc(T('Façon de ranger'))}">${four.map(([k, l]) => `<button type="button" class="${on(k) ? 'is-active' : ''}" data-ong-mode="${k === 'sets' ? (isSet(mode) ? mode : (readPref().lastSet || 'recueils')) : k}" data-ong-sets="${k === 'sets' ? 1 : ''}" aria-pressed="${on(k)}">${esc(T(l))}</button>`).join('')}</div>`
            + (isSet(mode) ? `<div class="segmented ong-submode" role="tablist" aria-label="${esc(T('Ensembles'))}">${SETS.map(([k, l]) => `<button type="button" class="${mode === k ? 'is-active' : ''}" data-ong-mode="${k}" aria-pressed="${mode === k}">${esc(T(l))}</button>`).join('')}</div>` : '');
    }
    /* 📚 Recueils : les groupes repliés (0 = « Dans aucun recueil ») ; tout ouvert au départ */
    const foldedRecs = () => (Array.isArray(readPref().recFold) ? readPref().recFold.map(Number) : []);
    function toggleFold(id) {
        const f = foldedRecs(), i = f.indexOf(id); if (i >= 0) f.splice(i, 1); else f.push(id);
        writePref({recFold: f}); paintList(); if (id === 0) paintWorkspaceList();
        document.querySelector(`#sidebar-content [data-ong-fold="${id}"].ong-fold`)?.focus({preventScroll: true});
    }
    const foldedKeys = k => (Array.isArray(readPref()[k]) ? readPref()[k].map(String) : []);
    function toggleKey(k, id) { const f = foldedKeys(k), i = f.indexOf(String(id)); if (i >= 0) f.splice(i, 1); else f.push(String(id)); writePref({[k]: f}); paintList(); }
    function underMenu(btn) {
        const u = under();
        const items = UNDER.map(([k, l]) => ({icon: k === u ? '✓' : '', label: l, run: () => { writePref({under: k}); paintList(); paintWorkspaceList(); }}));
        if (modeOf() === 'recueils') items.push('-', {icon: foldedRecs().includes(0) ? '' : '✓', label: T('Montrer « Dans aucun recueil »'), run: () => toggleFold(0)});
        const L = layout(), setL = v => { writePref({layout: v}); A().renderSidebar(); };
        items.push('-', {icon: L === 'A' ? '●' : '○', label: T('Façons de ranger : 6 cases (conseillé)'), run: () => setL('A')}, {icon: L === 'B' ? '●' : '○', label: T('Façons de ranger : 4 cases, avec « 📚 Ensembles »'), run: () => setL('B')});
        if (modeOf() === 'letters') { const g = gapMonths(); items.push('-', ...[1, 2, 3, 6].map(n => ({icon: g === n ? '●' : '○', label: T('Trou signalé à partir de {n} mois', {n: String(n)}), run: () => { writePref({gapMonths: n}); paintList(); paintWorkspaceList(); }}))); }
        UI().menuAt?.(btn, items, {title: T('Réglages de Documents')});
    }
    function rowMenu(id, e) { // K14 : UI.contextMenu = le menu de l'app à l'endroit de la souris
        const d = byId(id); if (!d || !UI().contextMenu) return;
        // R11 : Ouvrir · Modifier · 📁 Ranger · 🏷 Étiquette · ⤓ Exporter · — · 🗑 Supprimer (le même ordre que le « ⋯ » de la fiche)
        const items = [{icon: '↗', label: 'Ouvrir', run: () => select(id)}];
        if (!kiosk()) items.push({icon: '✎', label: 'Modifier', run: async () => { await select(id); document.querySelector('#workspace [data-ong-edit]')?.click(); }});
        if (!kiosk() && SF()?.openRange) items.push({icon: '📁', label: T('Ranger'), run: () => SF().openRange('document', String(id), d.title)});
        if (ext.enquetePhoto && (!kiosk() || ext.enquetePhoto.loadCounts)) items.push({icon: '🔎', label: T('Enquêter sur cette photo…'), run: () => ext.enquetePhoto.forMedia([id], {title: d.title})});
        const la = !kiosk() && ext.selectionBar?.labelAction ? ext.selectionBar.labelAction('media', {after: reloadAll}) : null;
        if (la) items.push({icon: '🏷', label: T('Étiquette'), run: () => la.run([String(id)])});
        if (d.filename) items.push({icon: '⤓', label: 'Télécharger', run: () => { const a = Object.assign(document.createElement('a'), {href: `media/${encodeURIComponent(d.filename)}`, download: d.filename}); document.body.appendChild(a); a.click(); a.remove(); }});
        items.push({icon: '📋', label: T('Copier la citation'), run: () => copyCitation(d)});
        if (!kiosk()) items.push('-', {icon: '🗑', label: T('Supprimer'), danger: true, run: () => deleteMany([id])});
        const pp = peopleOf(d).slice(0, 8);
        if (pp.length) items.push('-', ...pp.map(p => ({icon: '👤', label: p.name, run: () => A().openPersonById?.(p.id)})));
        UI().contextMenu(e, items, {title: `« ${d.title.slice(0, 50)} »`});
    }
    function sidebar(content, footer) {
        const mode = modeOf();
        content.innerHTML = `<div class="ong-side" data-ong-side="documents" data-no-reorder>
            <div class="ong-modebar"><div class="ong-modes">${modeBarHtml(mode)}</div>
            <button type="button" class="icon-button small ong-opts" data-ong-under aria-label="Sous le titre" title="Sous le titre">⋯</button></div>
            <div class="ong-bar" data-ong-bar></div>
            <div class="ong-letters" data-ong-letters ${['folders', 'places', 'years'].includes(mode) ? 'hidden' : ''}></div><div class="ong-list" data-ong-list>${UI().skeleton ? UI().skeleton(6) : '<div class="loading-block">Chargement…</div>'}</div></div>`;
        // 📚 dans le pied de la colonne (fixe, il ne cache aucun document), sous le nombre : la liste des recueils à droite
        footer.innerHTML = `<span data-ong-count></span>${kiosk() ? '' : `<button type="button" class="icon-button small ong-selbtn${selMode ? ' is-active' : ''}" data-ong-selmode aria-pressed="${selMode}" aria-label="${esc(T('☑ Cocher plusieurs documents'))}" title="${esc(T('☑ Cocher plusieurs documents'))}">☑</button>`}<button type="button" class="button secondary ong-allrec" data-ong-allrec title="${esc(T('Les recueils en vignettes, à droite, sans quitter Documents'))}">📚 ${esc(T('Voir la liste des recueils'))}<small class="ong-allrec-n" data-ong-allrec-n>${docs ? esc(plural(recs.length, 'recueil')) : ''}</small></button>`;
        // d'une autre façon de ranger : la colonne passe en « 📚 Recueils », la liste des recueils s'ouvre à droite
        footer.querySelector('[data-ong-selmode]')?.addEventListener('click', () => { selMode = !selMode; if (!selMode) { sel?.clear(); sel?.destroy(); sel = null; } A().renderSidebar(); });
        footer.querySelector('[data-ong-allrec]')?.addEventListener('click', () => { if (modeOf() !== 'recueils') { writePref({mode: 'recueils', wsRec: ''}); shown = STEP; A().renderSidebar(); } showRec(''); });
        bar = UI().listBar ? UI().listBar({key: BAR_KEY, search: {placeholder: 'Chercher… (titre, cote, personne, lieu, année)'}, filters: filters(), sort: {options: SORT_OPTS, value: 'az'},
            onChange: () => { shown = STEP; paintList(); paintWorkspaceList(); }}) : null;
        if (bar) content.querySelector('[data-ong-bar]').appendChild(bar);
        const sig = A().state?.module, signal = A().sidebarSignal?.();
        SF()?.bind(content, {signal});
        content.addEventListener('click', e => {
            const m = e.target.closest('[data-ong-mode]'); if (m) { const k = m.dataset.ongMode; writePref({mode: k, ...(isSet(k) ? {lastSet: k} : {})}); shown = STEP; A().renderSidebar(); paintWorkspaceList(); return; }
            const xh = e.target.closest('[data-ong-ex]'); if (xh) { showEx(xh.dataset.ongEx); return; } // ✉️ le fil de cette correspondance à droite
            const sh = e.target.closest('[data-ong-sorth]'); if (sh) { showSort(sh.dataset.ongSorth); return; } // 🏷 les documents de cette sorte à droite
            const o = e.target.closest('[data-ong-under]'); if (o) { underMenu(o); return; }
            const gf = e.target.closest('[data-ong-gfold]'); if (gf) { toggleKey(gf.dataset.ongGkey, gf.dataset.ongGfold); return; }
            const l = e.target.closest('[data-ong-letter]'); if (l && !l.disabled) { jumpTo(l.dataset.ongLetter); return; }
            const fo = e.target.closest('[data-ong-fold]'); if (fo) { toggleFold(Number(fo.dataset.ongFold)); return; }
            const fx = e.target.closest('[data-ong-exfold]'); if (fx) { toggleKey('exFold', fx.dataset.ongExfold); return; }
            const fs = e.target.closest('[data-ong-sortfold]'); if (fs) { toggleKey('sortFold', fs.dataset.ongSortfold); return; }
            const rh = e.target.closest('[data-ong-rec]'); if (rh) { showRec(rh.dataset.ongRec); return; } // 📚 ses documents à droite (« ↗ Ouvrir le recueil » y est)
            const r = e.target.closest('[data-ong-doc]'); if (r) { if (pick.on && !cur) { togglePick(Number(r.dataset.ongDoc)); return; } select(Number(r.dataset.ongDoc)); return; }
            const more = e.target.closest('[data-ong-more]'); if (more) { shown += STEP; paintList(); }
        }, {signal});
        content.addEventListener('contextmenu', e => { // K14 : le menu de la ligne à l'endroit de la souris
            const r = e.target.closest('[data-ong-doc]'); if (!r || e.shiftKey) return;
            e.preventDefault(); rowMenu(Number(r.dataset.ongDoc), e); // → UI.contextMenu
        }, {signal});
        content.addEventListener('keydown', e => {
            const r = e.target.closest?.('[data-ong-doc]'); if (!r || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
            const all = [...content.querySelectorAll('[data-ong-doc]')].filter(x => x.offsetParent), i = all.indexOf(r), nx = all[i + (e.key === 'ArrowDown' ? 1 : -1)];
            if (nx) { e.preventDefault(); nx.focus(); select(Number(nx.dataset.ongDoc), {keepFocus: true}); }
        }, {signal});
        load().then(() => { if (A().state?.module === sig) { paintList(); paintWorkspaceList(); } }); // une barre neuve (filtres relus) : les vignettes suivent aussi
    }
    /** 👤 Par personne : [{p, letter, docs}] (nom de famille puis prénom), puis « Sans personne » */
    function groupsByPerson(list) {
        const by = new Map(), none = [];
        list.forEach(d => { const pp = peopleOf(d); if (!pp.length) { none.push(d); return; } pp.forEach(p => { if (!by.has(p.id)) by.set(p.id, {p, docs: []}); by.get(p.id).docs.push(d); }); });
        const out = [...by.values()].sort((a, b) => personKey(a.p).localeCompare(personKey(b.p), 'fr') || a.p.id - b.p.id).map(g => ({...g, letter: letterOf(g.p.last || g.p.name)}));
        if (none.length) out.push({p: null, letter: '', docs: none});
        return out;
    }
    /** ce que la colonne montre, dans l'ordre : titres de lettre, noms (Par personne), lignes */
    function entries(list, mode, st) {
        const out = [];
        if (mode === 'letters' && CO()) { // ✉️ une correspondance par groupe de personnes, ses pièces dans l'ordre, les trous signalés
            const folded = foldedKeys('exFold');
            CO().exchanges(list, {gapMonths: gapMonths()}).forEach(x => {
                const shut = folded.includes(x.key); out.push({xh: x, shut});
                if (shut) return;
                const gapAfter = new Map(x.gaps.map(g => [g.after, g]));
                x.pieces.forEach(d => { out.push({d: byId(d.id) || d, letter: '#', ex: x}); const g = gapAfter.get(d.id); if (g) out.push({gap: g}); });
            });
            return out;
        }
        if (mode === 'sorts' && CO()) { // 🏷 une sorte après l'autre (les plus nombreuses d'abord), « Autres » à la fin
            const folded = foldedKeys('sortFold'), by = new Map();
            list.forEach(d => { const k = CO().sortOf(d); if (!by.has(k)) by.set(k, []); by.get(k).push(d); });
            const rank = k => CO().SORTS.findIndex(x => x[0] === k);
            [...by.entries()].sort((a, b) => (a[0] === 'other') - (b[0] === 'other') || b[1].length - a[1].length || rank(a[0]) - rank(b[0])).forEach(([k, ds]) => {
                const shut = folded.includes(k); out.push({sh: k, n: ds.length, shut}); if (!shut) ds.forEach(d => out.push({d, letter: '#'}));
            });
            return out;
        }
        if (mode === 'places' || mode === 'years') { // 📍 une commune après l'autre (A → Z) · 🕰 une décennie après l'autre ; « Sans lieu » / « Sans date » à la fin
            const fk = mode === 'places' ? 'placeFold' : 'yearFold', folded = foldedKeys(fk), by = new Map();
            list.forEach(d => { const k = mode === 'places' ? (placeOf(d) || '') : String(decadeOf(d) ?? ''); if (!by.has(k)) by.set(k, []); by.get(k).push(d); });
            const keys = [...by.keys()].sort((a, b) => (a === '') - (b === '') || (mode === 'years' ? Number(a) - Number(b) : fold(a).localeCompare(fold(b), 'fr')));
            keys.forEach(k => {
                const ds = by.get(k), shut = folded.includes(k);
                const label = mode === 'places' ? (k ? `📍 ${k}` : T('Sans lieu')) : (k ? `🕰 ${k}–${Number(k) + 9}` : T('Sans date'));
                out.push({gh: {key: k, fk, label, n: ds.length}, shut});
                if (!shut) ds.slice().sort((a, b) => (a.year || 99999) - (b.year || 99999) || fold(a.title).localeCompare(fold(b.title), 'fr')).forEach(d => out.push({d, letter: '#'}));
            });
            return out;
        }
        if (mode === 'recueils') { // 📚 chaque recueil, ses documents dans l'ordre des pages ; « Dans aucun recueil » à la fin
            const keep = new Set(list.map(d => d.id)), none = list.filter(d => !(d.recueils || []).length);
            const folded = foldedRecs(); // ▸ / ▾ : un recueil, ou « Dans aucun recueil » (0), replié ou ouvert (retenu)
            recs.forEach(r => {
                const ds = (docs || []).filter(d => keep.has(d.id) && (d.recueils || []).some(x => x.id === r.id)).map(d => ({d, num: d.recueils.find(x => x.id === r.id).num})).sort((a, b) => a.num - b.num);
                if (!ds.length && (bar?.state?.q || Object.keys(bar?.state?.filters || {}).length)) return;
                const shut = folded.includes(r.id);
                out.push({rh: r, n: ds.length, shut}); if (!shut) ds.forEach(x => out.push({d: x.d, letter: '#', num: x.num}));
            });
            if (none.length) { const shut = folded.includes(0); out.push({rh: null, n: none.length, shut}); if (!shut) none.forEach(d => out.push({d, letter: '#'})); }
            return out;
        }
        if (mode === 'people') {
            let last = null;
            groupsByPerson(list).forEach(g => {
                if (g.p && g.letter !== last) { out.push({lh: g.letter}); last = g.letter; }
                out.push({ph: g});
                g.docs.forEach(d => out.push({d, letter: g.letter || '#'}));
            });
            return out;
        }
        const alpha = !st.sort || st.sort === 'az' || st.sort === 'za';
        let last = '';
        list.forEach(d => { const L = letterOf(d.title); if (alpha && L !== last) { out.push({lh: L}); last = L; } out.push({d, letter: L}); });
        return out;
    }
    function jumpTo(letter) {
        const all = entries(filtered(), modeOf(), bar?.state || {});
        let rows = 0, found = false;
        for (const e of all) { if (e.lh === letter) { found = true; break; } if (e.d) rows++; }
        if (!found) return;
        if (rows >= shown) { shown = Math.ceil((rows + 1) / STEP) * STEP; paintList(); }
        const el = document.querySelector(`#sidebar-content [data-ong-lh="${CSS.escape(letter)}"]`);
        el?.scrollIntoView({block: 'start'}); document.querySelector(`#sidebar-content .ong-list [data-ong-doc][data-letter="${CSS.escape(letter)}"]`)?.focus({preventScroll: true});
    }
    function paintList() {
        const box = document.querySelector('#sidebar-content [data-ong-list]'); if (!box) return;
        const count = document.querySelector('#sidebar-footer [data-ong-count]');
        if (failed) { box.innerHTML = A().empty ? A().empty(failed, {icon: '⛔'}) : esc(failed); return; }
        if (!docs) return;
        const mode = modeOf(), list = filtered(), st = bar?.state || {}, active = Object.keys(st.filters || {}).filter(k => { const v = st.filters[k]; return Array.isArray(v) ? v.length : !!v; }).length;
        bar?.setCount?.(`${plural(list.length, 'document')}${list.length !== docs.length ? ` sur ${docs.length}` : ''}`);
        const rn = document.querySelector('#sidebar-footer [data-ong-allrec-n]'); if (rn) rn.textContent = plural(recs.length, 'recueil'); // « 0 recueil » s'il n'y en a pas
        if (count) { const fd = SF()?.read('document')?.folders?.length || 0; count.textContent = `${plural(docs.length, 'document')}${mode === 'folders' ? ` · ${plural(fd, 'dossier')}` : active ? ` · ${plural(active, 'filtre')}` : ''}`; }
        const letters = document.querySelector('#sidebar-content [data-ong-letters]');
        if (letters && (mode === 'places' || mode === 'years')) letters.hidden = true;
        if (!docs.length) { box.innerHTML = A().empty ? A().empty('Aucun document pour l’instant : les photos, actes et lettres ajoutés aux fiches arrivent ici.', {icon: '📄'}) : ''; if (letters) letters.innerHTML = ''; return; }
        if (mode === 'folders') {
            const keep = new Set(list.map(d => String(d.id)));
            box.innerHTML = SF() ? SF().sectionHtml('document', {label: 'Mes dossiers', items: [...list, ...docs.filter(d => !keep.has(String(d.id)))].map(d => [String(d.id), d.title]), isActive: id => Number(id) === cur, itemHtml: id => keep.has(String(id)) ? rowHtml(byId(id)) : ''})
                .replace('<div class="sf-loose" data-sf-loose>', `<div class="sf-loose" data-sf-loose><div class="section-label ong-loose-label">Sans dossier</div>`) : '';
            return;
        }
        if (mode === 'inquiries' && !list.length) { box.innerHTML = A().empty ? A().empty(epIds ? T('Aucune image n’a encore d’enquête photo.') : T('On cherche les images qui ont une enquête…'), {icon: '🔎'}) : ''; if (letters) letters.innerHTML = ''; return; }
        const all = entries(list, mode, st);
        if (letters && mode !== 'places' && mode !== 'years') {
            const have = new Set(all.filter(e => e.lh).map(e => e.lh));
            letters.hidden = !have.size;
            letters.innerHTML = LETTERS.map(L => `<button type="button" data-ong-letter="${L}" ${have.has(L) ? '' : 'disabled'} aria-label="${esc(T('Aller à la lettre {x}', {x: L}))}">${L}</button>`).join('');
        }
        if (!list.length) { box.innerHTML = A().empty ? A().empty('Rien ne correspond : change les mots cherchés ou retire un filtre.', {icon: '🔎'}) : ''; return; }
        let html = '', rows = 0;
        const total = all.filter(e => e.d).length;
        for (const e of all) {
            if (e.d && rows >= shown) break;
            if (e.lh) html += `<div class="section-label ong-lh" data-ong-lh="${esc(e.lh)}">${esc(e.lh)}</div>`;
            else if (e.rh !== undefined) { const fid = e.rh ? e.rh.id : 0, fold = `<button type="button" class="ong-fold" data-ong-fold="${fid}" aria-expanded="${!e.shut}" title="${esc(e.shut ? T('Montrer') : T('Masquer'))}" aria-label="${esc(e.shut ? T('Montrer') : T('Masquer'))}">${e.shut ? '▸' : '▾'}</button>`;
                html += e.rh ? `<div class="ong-ph ong-rhrow">${fold}<button type="button" class="ong-rh" data-ong-rec="${e.rh.id}" title="${esc(T('Voir ses documents à droite'))}"><span>${esc(e.rh.icon || '📚')} ${esc(e.rh.title)}</span><small>${e.n}</small></button></div>`
                    : `<div class="ong-ph ong-rhrow">${fold}<button type="button" class="ong-rh" data-ong-fold="0"><span>${esc(T('Dans aucun recueil'))}</span><small>${e.n}</small></button></div>`; }
            else if (e.xh) { const x = e.xh, fold = `<button type="button" class="ong-fold" data-ong-exfold="${esc(x.key)}" aria-expanded="${!e.shut}" aria-label="${esc(e.shut ? T('Montrer') : T('Masquer'))}">${e.shut ? '▸' : '▾'}</button>`;
                html += `<div class="ong-ph ong-rhrow ong-exrow">${fold}<button type="button" class="ong-rh" data-ong-ex="${esc(x.key)}" title="${esc(T('Voir le fil à droite'))}"><span>✉️ ${esc(x.title || T('Correspondant inconnu'))}</span><small>${x.from ? esc(x.from === x.to ? String(x.from) : `${x.from}–${x.to}`) + ' · ' : ''}${x.pieces.length}</small></button></div>`; }
            else if (e.gap) html += `<div class="ong-gap" role="note">⚠ ${esc(T('rien entre {a} et {b} ({n} mois)', {a: e.gap.from, b: e.gap.to, n: String(e.gap.months)}))}</div>`;
            else if (e.sh) { const [k, ic, l] = CO().sortMeta(e.sh), fold = `<button type="button" class="ong-fold" data-ong-sortfold="${esc(k)}" aria-expanded="${!e.shut}" aria-label="${esc(e.shut ? T('Montrer') : T('Masquer'))}">${e.shut ? '▸' : '▾'}</button>`;
                html += `<div class="ong-ph ong-rhrow">${fold}<button type="button" class="ong-rh" data-ong-sorth="${esc(k)}" title="${esc(T('Voir ces documents à droite'))}"><span>${ic} ${esc(T(l))}</span><small>${e.n}</small></button></div>`; }
            else if (e.gh) { const g = e.gh, fold = `<button type="button" class="ong-fold" data-ong-gfold="${esc(g.key)}" data-ong-gkey="${g.fk}" aria-expanded="${!e.shut}" aria-label="${esc(e.shut ? T('Montrer') : T('Masquer'))}">${e.shut ? '▸' : '▾'}</button>`;
                html += `<div class="ong-ph ong-rhrow ong-grow">${fold}<button type="button" class="ong-rh" data-ong-gfold="${esc(g.key)}" data-ong-gkey="${g.fk}"><span>${esc(g.label)}</span><small>${g.n}</small></button></div>`; }
            else if (e.ph) html += `<div class="ong-ph" data-ong-ph="${e.ph.p ? e.ph.p.id : 0}"><span>${e.ph.p ? `👤 ${esc(e.ph.p.name)}` : esc(T('Sans personne'))}</span><small>${e.ph.docs.length}</small></div>`;
            else { html += e.num ? rowHtml(e.d, e.letter).replace('<strong>', `<strong><span class="ong-pnum">${esc(T('p. {n}', {n: String(e.num)}))}</span> `) : rowHtml(e.d, e.letter); rows++; }
        }
        queueMicrotask(() => pick.on && paintPick());
        box.innerHTML = `<div class="side-menu ong-menu${selOn() ? ' is-selecting' : ''}">${html}</div>${total > shown ? `<button type="button" class="ui-more" data-ong-more>Voir les ${Math.min(STEP, total - shown)} suivants ↓</button>` : ''}`;
        mountSel(box);
    }

    /* ─── ☑ Cocher plusieurs documents : la barre de sélection commune (app-selection.js) ─── */
    const write = async body => { const r = await A().api('onglets_write', {}, {method: 'POST', body}); return r?.result ?? r ?? {}; };
    async function reloadAll() { cache.clear(); await load(true); if (A().state?.module !== 'documents') return; paintList(); paintWorkspaceList(); if (cur && document.querySelector(`#workspace [data-ong-id="${cur}"]`)) showDoc(cur); }
    function mountSel(box) {
        if (!selOn() || !ext.selectionBar) { if (sel && !selOn()) { sel.destroy(); sel = null; } return; }
        if (sel && sel.host === box && sel.el.isConnected) { sel.refresh(); return; }
        sel?.destroy();
        sel = ext.selectionBar({host: box, rowSelector: '[data-ong-sel]', idOf: el => el.dataset.ongSel, key: 'documents:col', what: [T('document coché'), T('documents cochés')], actions: selActions()});
        sel?.el.classList.add('ong-selbar');
    }
    const docsOf = ids => ids.map(byId).filter(Boolean);
    function selActions() {
        const SB = ext.selectionBar || {};
        return [
            {id: 'range', icon: '📁', label: T('Ranger'), help: T('Ranger les documents cochés dans un dossier de la colonne'), edit: true, run: ids => rangeMany(ids)},
            SB.labelAction ? {...SB.labelAction('media', {after: reloadAll}), label: T('Étiqueter')} : null,
            ext.enquetePhoto ? {id: 'enquete', icon: '🔎', label: T('Enquêter sur ces images'), help: T('Une enquête photo avec les documents cochés : un indice trouvé sur l’un profite aux autres'), edit: true, run: ids => ext.enquetePhoto.create(ids.map(Number))} : null,
            {id: 'link', icon: '👤', label: T('Relier à une personne'), help: T('Relier les documents cochés à une fiche'), edit: true, run: ids => linkMany(ids)},
            {id: 'zip', icon: '⤓', label: T('Exporter en ZIP'), help: T('Les fichiers des documents cochés, avec une liste (CSV), dans un fichier .zip'), run: ids => zipMany(ids)},
            {id: 'delete', icon: '🗑', label: T('Supprimer'), help: T('Supprime les documents cochés ; « ↶ Annuler » les remet'), edit: true, danger: true, run: (ids, s2) => deleteMany(ids, s2)},
        ].filter(Boolean);
    }
    function rangeMany(ids) {
        const S = SF(); if (!S) return A().toast(T('Les dossiers ne sont pas encore chargés : réessaie dans un instant.'), 'error');
        const data = S.read('document'), list = data.folders || [];
        if (!list.length) return A().toast(T('Aucun dossier pour l’instant : « 📁 Dossiers » dans la colonne, puis « ＋ 📁 Dossier ».'), 'error');
        const depth = f => { let n = 0, x = f; while (x?.parent) { n++; x = list.find(y => y.id === x.parent); } return n; };
        ext.openDialog?.({eyebrow: T('RANGER'), title: T('📁 Ranger {n}', {n: plural(ids.length, 'document')}), submitLabel: T('Ranger'),
            body: `<div class="form-grid one-column"><label>${esc(T('Dossier'))}<select name="folder"><option value="">${esc(T('Sans dossier'))}</option>${list.map(f => `<option value="${esc(f.id)}">${'  '.repeat(depth(f))}📁 ${esc(f.name)}</option>`).join('')}</select></label></div>`,
            onSubmit: form => {
                const target = String(new FormData(form).get('folder') || ''), name = list.find(f => f.id === target)?.name || '';
                const run = () => { const d = S.read('document'); ids.forEach(id => { if (target) d.of[String(id)] = target; else delete d.of[String(id)]; }); S.write('document', d); };
                const msg = target ? T('{n} rangés dans « {f} »', {n: plural(ids.length, 'document'), f: name}) : T('{n} sortis des dossiers', {n: plural(ids.length, 'document')});
                if (A().undoLocalChange) A().undoLocalChange(msg, [S.KEY], run, () => A().renderSidebar?.()); else run();
                A().renderSidebar?.();
            }});
    }
    async function linkMany(ids) {
        const P = window.LCNDA_PICKER; if (!P?.openPicker) return A().toast(T('Le menu de choix n’est pas encore chargé.'), 'error');
        const p = await P.openPicker({kind: 'person', title: T('Relier {n} à…', {n: plural(ids.length, 'document')})});
        if (!p?.id) return;
        const done = [];
        for (const id of ids) { const r = await write({op: 'doc_people', media_id: Number(id), add: [Number(p.id)]}); if ((r.added || []).length) done.push(Number(id)); }
        await reloadAll();
        A().undoToast?.(T('{n} reliés à {who}', {n: plural(done.length, 'document'), who: p.title || ''}), {
            undo: async () => { for (const id of done) await write({op: 'doc_people', media_id: id, remove: [Number(p.id)]}); await reloadAll(); },
            redo: async () => { for (const id of done) await write({op: 'doc_people', media_id: id, add: [Number(p.id)]}); await reloadAll(); }});
    }
    async function deleteMany(ids, s2) {
        const list = docsOf(ids); if (!list.length) return;
        const gone = [];
        for (const d of list) { try { await A().api('delete_media', {}, {method: 'POST', body: {media_id: d.id}}); gone.push(d); } catch (e) { A().toast(e.message, 'error'); break; } }
        s2?.clear?.(); if (gone.some(d => d.id === cur)) { cur = 0; writePref({cur: 0}); }
        await reloadAll(); if (!cur) render();
        if (!gone.length) return;
        A().undoToast?.(gone.length > 1 ? T('{n} supprimés', {n: plural(gone.length, 'document')}) : T('Document « {t} » supprimé', {t: gone[0].title}), {
            undo: async () => { for (const d of gone.slice().reverse()) await A().api('restore_last_delete', {}, {method: 'POST', body: {entity_type: 'media', entity_id: d.id}}); await reloadAll(); },
            redo: async () => { for (const d of gone) await A().api('delete_media', {}, {method: 'POST', body: {media_id: d.id}}); await reloadAll(); }});
    }
    /* ⤓ un .zip « rangé » (sans compression : les images le sont déjà) : les fichiers + documents.csv */
    const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
    const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
    function zipBlob(files) { // [{name, data: Uint8Array}]
        const enc = new TextEncoder(), parts = [], dir = []; let off = 0;
        const d = new Date(), tm = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dt = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
        files.forEach(f => {
            const name = enc.encode(f.name), crc = crc32(f.data), h = new DataView(new ArrayBuffer(30));
            [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, tm, 2], [12, dt, 2], [14, crc, 4], [18, f.data.length, 4], [22, f.data.length, 4], [26, name.length, 2], [28, 0, 2]].forEach(([o, v, n]) => (n === 4 ? h.setUint32(o, v, true) : h.setUint16(o, v, true)));
            parts.push(new Uint8Array(h.buffer), name, f.data);
            const c = new DataView(new ArrayBuffer(46));
            [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, tm, 2], [14, dt, 2], [16, crc, 4], [20, f.data.length, 4], [24, f.data.length, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, off, 4]].forEach(([o, v, n]) => (n === 4 ? c.setUint32(o, v, true) : c.setUint16(o, v, true)));
            dir.push(new Uint8Array(c.buffer), name);
            off += 30 + name.length + f.data.length;
        });
        const size = dir.reduce((a, x) => a + x.length, 0), e = new DataView(new ArrayBuffer(22));
        [[0, 0x06054b50, 4], [8, files.length, 2], [10, files.length, 2], [12, size, 4], [16, off, 4]].forEach(([o, v, n]) => (n === 4 ? e.setUint32(o, v, true) : e.setUint16(o, v, true)));
        return new Blob([...parts, ...dir, new Uint8Array(e.buffer)], {type: 'application/zip'});
    }
    ext.ongletsZip = zipBlob; // (aussi pour les essais)
    async function zipMany(ids) {
        const list = docsOf(ids); if (!list.length) return;
        A().toast(T('Préparation du ZIP ({n})…', {n: plural(list.length, 'document')}));
        const files = [], used = new Set(), rows = [[T('Titre'), T('Date'), T('Lieu'), T('Cote'), T('Personnes'), T('Fichier')]];
        const safe = t => (A().safeExportFilename ? A().safeExportFilename(t, 'document') : String(t || 'document').replace(/[^a-z0-9]+/gi, '-'));
        for (const d of list) {
            let fname = '';
            if (d.filename) {
                try {
                    const r = await fetch(`media/${encodeURIComponent(d.filename)}`); if (!r.ok) throw new Error(String(r.status));
                    const ext2 = (d.filename.match(/\.[a-z0-9]{1,5}$/i) || [''])[0].toLowerCase();
                    let base = safe(d.title).slice(0, 60) || 'document', n = 2; fname = base + ext2; while (used.has(fname)) fname = `${base}-${n++}${ext2}`; used.add(fname);
                    files.push({name: fname, data: new Uint8Array(await r.arrayBuffer())});
                } catch (_) { fname = ''; }
            }
            rows.push([d.title, d.date_text, d.place, d.cote, peopleOf(d).map(p => p.name).join(', '), fname || T('(fichier absent)')]);
        }
        const cell = v => (A().csvCell ? A().csvCell(v, {sep: ';'}) : `"${String(v ?? '').replace(/"/g, '""')}"`);
        files.push({name: 'documents.csv', data: new TextEncoder().encode('﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n'))});
        const a = document.createElement('a'); a.href = URL.createObjectURL(zipBlob(files)); a.download = `documents-${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        A().toast(T('{n} dans le ZIP.', {n: plural(files.length - 1, 'fichier')}), 'success');
    }

    /* ─── à droite : la liste en vignettes (rien de choisi) ou la fiche ─── */
    let wsShown = 24;
    /* ☑ Choisir plusieurs (maquette documents-lies-recueils, partie 3) : l'ordre des clics est l'ordre des pages du recueil */
    const pick = {on: false, ids: []};
    function togglePick(id) { const i = pick.ids.indexOf(id); if (i >= 0) pick.ids.splice(i, 1); else pick.ids.push(id); paintPick(); }
    function paintPick() {
        const barEl = document.querySelector('#workspace [data-ong-pickbar]'), btn = document.querySelector('#workspace [data-ong-pick]');
        if (btn) { btn.classList.toggle('is-active', pick.on); btn.setAttribute('aria-pressed', String(pick.on)); }
        document.querySelectorAll('#workspace [data-ong-cards] [data-ong-card], #sidebar-content .ong-list [data-ong-doc]').forEach(el => {
            const id = Number(el.dataset.ongCard || el.dataset.ongDoc), n = pick.on ? pick.ids.indexOf(id) + 1 : 0;
            el.classList.toggle('is-picked', n > 0); el.classList.toggle('is-picking', pick.on); el.querySelector(':scope > .ong-pickn')?.remove();
            if (n) el.insertAdjacentHTML('afterbegin', `<span class="ong-pickn" aria-label="${esc(T('choisi n° {n}', {n: String(n)}))}">${n}</span>`);
            el.querySelectorAll('[data-ong-doc]').forEach(x => (pick.on ? x.setAttribute('aria-pressed', String(n > 0)) : x.removeAttribute('aria-pressed')));
            if (el.matches('[data-ong-doc]')) { if (pick.on) el.setAttribute('aria-pressed', String(n > 0)); else el.removeAttribute('aria-pressed'); }
        });
        if (!barEl) return;
        barEl.hidden = !pick.on; if (!pick.on) return;
        const n = pick.ids.length;
        const what = plural(n, 'document choisi', 'documents choisis');
        barEl.innerHTML = `<span class="ong-pickcount">${n ? esc(n > 1 ? T('{x}, dans l’ordre des clics', {x: what}) : what) : esc(T('Clique sur les documents à prendre, dans l’ordre des pages.'))}</span><span class="spacer"></span>
            <button type="button" class="button small" data-ong-pick-make ${n ? '' : 'disabled'}>${esc(n > 1 ? T('📚 Faire un recueil avec {x}', {x: plural(n, 'document', 'documents')}) : T('📚 Faire un recueil'))}</button>
            <button type="button" class="button small secondary" data-ong-pick-add ${n ? '' : 'disabled'}>${esc(T('📚 Ajouter à un recueil…'))}</button>
            <button type="button" class="button small secondary" data-ong-pick-all>${esc(T('Tout choisir (ceux montrés)'))}</button>
            ${n ? `<button type="button" class="button small secondary" data-ong-pick-none>${esc(T('Tout enlever'))}</button>` : ''}
            <button type="button" class="icon-button small" data-ong-pick-close aria-label="${esc(T('Fermer'))}" title="${esc(T('Fermer'))}">×</button>`;
    }
    async function afterRecueil() { cache.clear(); recFull = null; await load(true); if (A().state?.module !== 'documents') return; paintList(); paintWorkspaceList(); if (cur && document.querySelector(`#workspace [data-ong-id="${cur}"]`)) showDoc(cur); }
    /* 📚 à droite, en mode « 📚 Recueils » : les recueils en vignettes (les mêmes que Listes → 📚 Recueils), avec le nombre de documents de chacun ;
       un clic → ses documents, dans l'ordre des pages (« ← Tous les recueils », « ↗ Ouvrir le recueil »). « Dans aucun recueil » : la dernière vignette. */
    const wsRec = () => (modeOf() === 'recueils' ? String(readPref().wsRec ?? '') : '');
    function loadRecFull() {
        if (recFull || recFullLoading) return recFullLoading;
        recFullLoading = A().api('recueils', {q: ''}).then(r => { recFull = r.recueils || []; }).catch(() => { recFull = []; }).finally(() => { recFullLoading = null; if (A().state?.module === 'documents') paintWorkspaceList(); });
        return recFullLoading;
    }
    /** les documents montrés à droite : ceux du recueil choisi (ordre des pages), sinon la liste filtrée */
    function wsDocs(list = filtered()) {
        const w = wsRec(); if (!w) return list;
        if (w === 'none') return list.filter(d => !(d.recueils || []).length);
        const id = Number(w);
        return list.filter(d => (d.recueils || []).some(x => x.id === id)).map(d => ({d, num: d.recueils.find(x => x.id === id).num})).sort((a, b) => a.num - b.num).map(x => Object.assign(x.d, {_num: x.num}));
    }
    function showRec(v) {
        writePref({wsRec: String(v)}); wsShown = 24;
        if (cur) { cur = 0; writePref({cur: 0}); history.pushState(null, '', '#documents'); document.querySelectorAll('#sidebar-content [data-ong-doc].is-active').forEach(x => x.classList.remove('is-active')); render(); }
        else { paintWorkspaceList(); document.querySelector('#workspace [data-ong-page]')?.scrollIntoView({block: 'start'}); }
    }
    function recCardsHtml(list) {
        if (!recFull) { loadRecFull(); return UI().skeleton ? UI().skeleton(4) : `<div class="loading-block">${esc(T('Chargement…'))}</div>`; }
        const st = bar?.state || {}, narrowed = !!(st.q || Object.values(st.filters || {}).some(v => (Array.isArray(v) ? v.length : !!v)));
        const cnt = new Map(); let none = 0;
        list.forEach(d => { const rr = d.recueils || []; if (!rr.length) none++; new Set(rr.map(x => x.id)).forEach(id => cnt.set(id, (cnt.get(id) || 0) + 1)); });
        const cover = r => (r.cover ? `<img src="media/${esc(encodeURIComponent(r.cover.thumbnail || r.cover.filename))}" alt="" loading="lazy">` : `<span class="ui-card-ico">${esc(r.icon || '📚')}</span>`);
        const items = recFull.filter(r => !narrowed || cnt.get(r.id)).map(r => { const pct = r.pages ? Math.round(r.transcribed / r.pages * 100) : 0, n = cnt.get(r.id) || 0;
            return {thumb: cover(r), name: `${r.icon || '📚'} ${r.title}`, open: `data-ong-wsrec="${r.id}"`, openLabel: T('Voir ses documents'), attrs: `data-ong-reccard="${r.id}"`,
                lines: [[r.reference, r.place_text, r.date_text].filter(Boolean).join(' · ') || T('Sans cote'), `${plural(n, 'document', 'documents')} · ${plural(r.pages, 'page', 'pages')}`],
                badges: [{text: T('{n} % transcrit', {n: String(pct)}), kind: pct >= 100 ? 'green' : pct ? 'blue' : 'grey'}, r.loose ? {text: plural(r.loose, 'photo à ranger', 'photos à ranger'), kind: 'yellow'} : null].filter(Boolean),
                when: r.updated_at, whenLabel: 'Modifié', menu: [`<button type="button" data-ong-recopen="${r.id}">📚 ${esc(T('Ouvrir le recueil'))}</button>`]}; });
        if (none && !foldedRecs().includes(0)) items.push({thumb: '<span class="ui-card-ico">🗂️</span>', name: T('Dans aucun recueil'), open: `data-ong-wsrec="none"`, openLabel: T('Voir ces documents'), attrs: 'data-ong-reccard="none"', lines: [plural(none, 'document', 'documents'), T('Ni rangés ni classés dans un recueil')]});
        if (!items.length) return A().emptyState({icon: '📚', text: T('Aucun recueil pour l’instant'), hint: T('« ☑ Choisir plusieurs », puis « 📚 Faire un recueil » : les documents choisis deviennent ses pages, dans l’ordre des clics.')});
        return UI().cardsHtml(items);
    }
    /* ─── 🗺 Carte et 📅 Frise : les documents trouvés, par lieu ou par décennie (réglage retenu) ─── */
    const WS_VIEWS = [['cards', '▦ Vignettes'], ['map', '🗺 Carte'], ['time', '📅 Frise']];
    const wsView = () => { const v = readPref().wsView; return WS_VIEWS.some(x => x[0] === v) ? v : 'cards'; };
    const mercX = (lon, z) => (lon + 180) / 360 * 256 * 2 ** z, mercY = (lat, z) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 256 * 2 ** z; };
    /** les lieux des documents (coordonnées connues), chacun avec ses documents ; ceux sans lieu à part */
    function docsByPlace(list) {
        const P = new Map(), none = [];
        list.forEach(d => { const g = (d.geo || []).find(x => x.lat != null && x.lon != null); if (!g) return none.push(d); const k = `${g.lat.toFixed(4)},${g.lon.toFixed(4)}`; if (!P.has(k)) P.set(k, {name: g.name, lat: g.lat, lon: g.lon, docs: []}); P.get(k).docs.push(d); });
        return {places: [...P.values()].sort((a, b) => b.docs.length - a.docs.length), none};
    }
    function docsMapHtml(list) {
        const {places, none} = docsByPlace(list), W = 900, H = 440;
        if (!places.length) return A().emptyState({icon: '🗺', text: T('Aucun de ces documents n’a de lieu avec des coordonnées'), hint: T('Donne un lieu aux documents (avec ses coordonnées dans Lieux) pour les voir sur la carte.')});
        const lat0 = Math.min(...places.map(p => p.lat)), lat1 = Math.max(...places.map(p => p.lat)), lon0 = Math.min(...places.map(p => p.lon)), lon1 = Math.max(...places.map(p => p.lon));
        let z = 13; while (z > 2 && (mercX(lon1, z) - mercX(lon0, z) > W - 120 || mercY(lat0, z) - mercY(lat1, z) > H - 100)) z--;
        const cx = (mercX(lon0, z) + mercX(lon1, z)) / 2, cy = (mercY(lat0, z) + mercY(lat1, z)) / 2, left = cx - W / 2, top = cy - H / 2;
        const tiles = ext.mapCompare?.tilesHtml ? ext.mapCompare.tilesHtml(readPref().wsMapBg || 'osmfr', left, top, z, W, H) : '';
        const max = Math.max(...places.map(p => p.docs.length));
        const pins = places.map((p, i) => { const x = mercX(p.lon, z) - left, y = mercY(p.lat, z) - top, r = 11 + 13 * Math.sqrt(p.docs.length / max);
            return `<button type="button" class="ong-pin" data-ong-pin="${i}" style="left:${(x / W * 100).toFixed(2)}%;top:${(y / H * 100).toFixed(2)}%;width:${2 * r}px;height:${2 * r}px" title="${esc(`${p.name} · ${plural(p.docs.length, 'document', 'documents')}`)}">${p.docs.length}</button>`; }).join('');
        return `<div class="ong-map" data-ong-map style="aspect-ratio:${W}/${H}"><div class="ong-map-tiles" style="width:${W}px;height:${H}px;transform-origin:0 0" data-ong-maptiles>${tiles}</div>${pins}</div>
            <div class="ong-mapside" data-ong-mapside><p class="muted">${esc(T('{n} lieux : clique un rond pour voir ses documents.', {n: String(places.length)}))}${none.length ? ' ' + esc(T('{n} documents sans lieu connu ne sont pas sur la carte.', {n: String(none.length)})) : ''}</p></div>`;
    }
    function bindDocsMap(box, list) {
        const {places} = docsByPlace(list), map = box.querySelector('[data-ong-map]'), tl = box.querySelector('[data-ong-maptiles]');
        const fit = () => { if (map && tl) tl.style.transform = `scale(${map.clientWidth / 900})`; }; fit(); new ResizeObserver(fit).observe(map);
        box.querySelectorAll('[data-ong-pin]').forEach(b => b.addEventListener('click', () => { const p = places[Number(b.dataset.ongPin)]; box.querySelectorAll('.ong-pin.is-on').forEach(x => x.classList.remove('is-on')); b.classList.add('is-on');
            box.querySelector('[data-ong-mapside]').innerHTML = `<h3>📍 ${esc(p.name)} <small class="muted">${esc(plural(p.docs.length, 'document', 'documents'))}</small></h3>${UI().cardsHtml ? UI().cardsHtml(p.docs.slice(0, 60).map(d => ({thumb: thumbOf(d), name: d.title, open: `data-ong-doc="${d.id}"`, attrs: `data-ong-card="${d.id}"`, lines: cardLines(d)}))) : ''}`; }));
    }
    function docsTimeHtml(list) {
        const dated = list.filter(d => d.year), none = list.length - dated.length;
        if (!dated.length) return A().emptyState({icon: '📅', text: T('Aucun de ces documents n’a de date'), hint: T('Donne une date aux documents pour les voir sur la frise.')});
        const by = new Map(); dated.forEach(d => { const k = Math.floor(d.year / 10) * 10; if (!by.has(k)) by.set(k, []); by.get(k).push(d); });
        const keys = [...by.keys()].sort((a, b) => a - b), max = Math.max(...[...by.values()].map(v => v.length));
        return `<div class="ong-time">${keys.map(k => { const ds = by.get(k).sort((a, b) => a.year - b.year);
            return `<section class="ong-tdec"><h3><span>${k}–${k + 9}</span><i style="width:${Math.max(4, ds.length / max * 100)}%"></i><small class="muted">${esc(plural(ds.length, 'document', 'documents'))}</small></h3>
                <div class="ong-tline">${ds.map(d => `<button type="button" class="ong-tdoc" data-ong-doc="${d.id}" data-ong-card="${d.id}" title="${esc(d.title)}">${thumbOf(d)}<b>${d.year}</b><small>${esc(d.title)}</small></button>`).join('')}</div></section>`; }).join('')}</div>
            ${none ? `<p class="muted">${esc(T('{n} documents sans date ne sont pas sur la frise.', {n: String(none)}))}</p>` : ''}`;
    }
    /* ✉️ à droite, en mode « ✉️ Lettres » : les correspondances en vignettes ; un clic → le fil (ou la carte, la frise) */
    const wsEx = () => (modeOf() === 'letters' ? readPref().wsEx ?? null : null);
    const wsSort = () => (modeOf() === 'sorts' ? String(readPref().wsSort || '') : '');
    function backToList() { if (cur) { cur = 0; writePref({cur: 0}); history.pushState(null, '', '#documents'); document.querySelectorAll('#sidebar-content [data-ong-doc].is-active').forEach(x => x.classList.remove('is-active')); render(); } else { paintWorkspaceList(); document.querySelector('#workspace [data-ong-page]')?.scrollIntoView({block: 'start'}); } }
    function showEx(key) { writePref({wsEx: key == null ? null : String(key)}); backToList(); }
    function showSort(k) { writePref({wsSort: String(k || '')}); wsShown = 24; backToList(); }
    const yrs = x => (x.from ? (x.from === x.to ? String(x.from) : `${x.from}–${x.to}`) : T('Sans date'));
    function exCardsHtml(list) {
        const xs = CO().exchanges(list, {gapMonths: gapMonths()});
        if (!xs.length) return A().emptyState({icon: '✉️', text: T('Aucune correspondance pour l’instant'), hint: T('Dans la visionneuse d’un média, donne-lui une sorte de correspondance (lettre, carte postale, télégramme…) et ses correspondants : il arrive ici, rangé avec les autres pièces du même échange.')});
        return UI().cardsHtml(xs.map(x => { const first = x.pieces.find(d => fold(d.media_type) === 'image') || x.pieces[0], pct = Math.round(x.transcribed / x.pieces.length * 100);
            return {thumb: thumbOf(first), name: `✉️ ${x.title || T('Correspondant inconnu')}`, open: `data-ong-wsex="${esc(x.key)}"`, openLabel: T('Voir le fil'), attrs: `data-ong-excard="${esc(x.key)}"`,
                lines: [`${yrs(x)} · ${plural(x.pieces.length, 'pièce', 'pièces')}`], badges: [{text: T('{n} % transcrit', {n: String(pct)}), kind: pct >= 100 ? 'green' : pct ? 'blue' : 'grey'}, x.gaps.length ? {text: plural(x.gaps.length, 'trou', 'trous'), kind: 'yellow'} : null].filter(Boolean)}; }));
    }
    const EX_VIEWS = [['fil', '🧵 Le fil'], ['map', '🗺 Carte'], ['time', '📅 Frise']];
    function exFilHtml(x) {
        const ids = new Map(x.pieces.map(d => [d.id, d])), gapAfter = new Map(x.gaps.map(g => [g.after, g])), reply = new Map(x.replies.map(r => [r.id, r]));
        const places = [...new Set(x.pieces.map(d => d.place).filter(Boolean))];
        const stat = (l, v) => `<div><small>${esc(T(l))}</small><b>${esc(v)}</b></div>`;
        const head = `<div class="ong-exstats">${stat('Pièces', String(x.pieces.length))}${stat('Période', yrs(x))}${stat('Délai moyen de réponse', x.avgDelay != null ? T('{n} jours (le plus long : {m})', {n: String(x.avgDelay), m: String(x.maxDelay)}) : '—')}
            ${stat('Transcrites', `${x.transcribed} / ${x.pieces.length} (${Math.round(x.transcribed / x.pieces.length * 100)} %)`)}${stat('Trous', T('{n} (plus de {m} mois)', {n: String(x.gaps.length), m: String(gapMonths())}))}${places.length ? stat('Lieux', places.slice(0, 5).join(', ')) : ''}</div>`;
        const rows = x.pieces.map(d => { const r = reply.get(d.id), to = r ? ids.get(r.to) : null, g = gapAfter.get(d.id);
            return `<li class="ong-piece"><button type="button" class="ong-piece-main" data-ong-doc="${d.id}" data-ong-card="${d.id}"><span class="ong-thumb">${thumbOf(d)}</span><span class="ong-txt"><strong>${esc(d.title)}</strong>
                <small>${esc([d.date_text || T('Sans date'), d.corr, d.place].filter(Boolean).join(' · '))}</small>${to ? `<small class="ong-reply">↩ ${esc(T('répond à « {t} »', {t: to.title}))}${r.days != null ? ' · ' + esc(T('délai : {n} jours', {n: String(r.days)})) : ''}</small>` : ''}</span>
                ${bdg(d.has_tr ? T('transcrite') : T('à transcrire'), d.has_tr ? 'green' : 'grey')}</button></li>${missOf(d.id).map(missHtml).join('')}${g ? `<li class="ong-gap" role="note">⚠ ${esc(T('{n} mois sans pièce ({a} → {b}) : perdues ?', {n: String(g.months), a: g.from, b: g.to}))}</li>` : ''}`; }).join('');
        const lost = missing.filter(m => m.key === x.key && !ids.has(m.after)); // notée « au début » (ou la pièce d'après a disparu)
        return head + `<ol class="ong-fil">${lost.map(missHtml).join('')}${rows}</ol>`;
        function missOf(id) { return missing.filter(m => m.key === x.key && m.after === id); }
    }
    /* ✉️ une pièce manquante dans le fil : sans fichier, à sa place ; 🗑 la retire (↶ Annuler) */
    const missHtml = m => `<li class="ong-piece ong-missing" data-ong-missing="${m.id}"><span class="ong-piece-main is-missing"><span class="ong-thumb"><span class="ong-ico" aria-hidden="true">✉️</span></span><span class="ong-txt"><strong>${esc(m.title || T('Pièce manquante'))}</strong>
        <small>${esc([m.date_text || T('Sans date'), m.note].filter(Boolean).join(' · '))}</small></span>${bdg(T('manquante'), 'yellow')}</span>${kiosk() ? '' : `<button type="button" class="icon-button small" data-ong-missdel="${m.id}" aria-label="${esc(T('Retirer cette pièce manquante'))}" title="${esc(T('Retirer cette pièce manquante'))}">🗑</button>`}</li>`;
    function addMissing(x) {
        if (kiosk()) return;
        const pieces = x.pieces.map(d => byId(d.id) || d);
        ext.openDialog?.({eyebrow: T('CORRESPONDANCE'), title: T('✉️ Noter une pièce manquante'), submitLabel: T('Noter'),
            body: `<p class="muted">${esc(T('Une lettre dont parle une autre, ou un trou dans le fil : elle prend sa place dans le fil, sans fichier, jusqu’à ce que tu la retrouves.'))}</p>
                <div class="form-grid"><label>${esc(T('Date (même approximative)'))}<input name="date_text" maxlength="80" placeholder="${esc(T('ex. mai 1916'))}"></label>
                <label>${esc(T('Ce que c’était'))}<input name="title" maxlength="200" placeholder="${esc(T('ex. Lettre de Marie à Jean'))}"></label>
                <label class="span-2">${esc(T('Placée après'))}<select name="after"><option value="0">${esc(T('— au début du fil —'))}</option>${pieces.map((d, i) => `<option value="${d.id}" ${i === pieces.length - 1 ? 'selected' : ''}>${esc([d.date_text || T('Sans date'), d.title].join(' · '))}</option>`).join('')}</select></label>
                <label class="span-2">${esc(T('Note'))} <small>(${esc(T('facultatif'))})</small><input name="note" maxlength="2000" placeholder="${esc(T('ex. citée dans la lettre du 3 juin'))}"></label></div>`,
            onSubmit: async form => {
                const f = Object.fromEntries(new FormData(form));
                const r = await write({op: 'missing_add', key: x.key, after: Number(f.after) || 0, date_text: f.date_text || '', title: f.title || '', note: f.note || ''});
                await reloadAll();
                A().undoToast?.(T('Pièce manquante notée'), {undo: async () => { await write({op: 'missing_delete', id: r.id}); await reloadAll(); }, redo: async () => { await write({op: 'missing_restore', id: r.id}); await reloadAll(); }});
            }});
    }
    async function removeMissing(id) {
        const m = missing.find(x => x.id === id);
        try { await write({op: 'missing_delete', id}); } catch (e) { return A().toast(e.message, 'error'); }
        await reloadAll();
        A().undoToast?.(T('Pièce manquante « {t} » retirée', {t: m?.title || m?.date_text || ''}), {undo: async () => { await write({op: 'missing_restore', id}); await reloadAll(); }, redo: async () => { await write({op: 'missing_delete', id}); await reloadAll(); }});
    }
    function paintExWs(box, list, key) {
        const x = CO().exchanges(list, {gapMonths: gapMonths()}).find(e => e.key === key);
        const back = `<div class="ong-recbar"><button type="button" class="button small secondary" data-ong-wsex="">← ${esc(T('Toutes les correspondances'))}</button>`;
        if (!x) { box.innerHTML = back + '</div>' + A().emptyState({icon: '🔎', text: T('Rien ne correspond'), hint: T('Change les mots cherchés ou retire un filtre dans la colonne de gauche.')}); return; }
        const v = EX_VIEWS.some(e => e[0] === readPref().exView) ? readPref().exView : 'fil';
        const seg = `<div class="ong-wsview segmented" role="tablist">${EX_VIEWS.map(([k, l]) => `<button type="button" class="${v === k ? 'is-active' : ''}" data-ong-exview="${k}" aria-pressed="${v === k}">${esc(T(l))}</button>`).join('')}</div>`;
        const docsOf = x.pieces.map(d => byId(d.id) || d);
        box.innerHTML = `${back}<strong>✉️ ${esc(x.title || T('Correspondant inconnu'))}</strong><small class="muted">${esc(yrs(x))} · ${esc(plural(x.pieces.length, 'pièce', 'pièces'))}</small>${kiosk() ? '' : `<span class="spacer"></span><button type="button" class="button small secondary" data-ong-missadd>${esc(T('✉️ Noter une pièce manquante'))}</button>`}</div>${seg}`
            + (v === 'map' ? docsMapHtml(docsOf) : v === 'time' ? docsTimeHtml(docsOf) : exFilHtml(x));
        if (v === 'map') bindDocsMap(box, docsOf);
        box.querySelector('[data-ong-missadd]')?.addEventListener('click', () => addMissing(x));
        box.querySelectorAll('[data-ong-missdel]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); removeMissing(Number(b.dataset.ongMissdel)); }));
    }
    /* 🏞 la collection de cartes postales (🏷 Sortes → Cartes postales) : vignettes recto ⇄ verso, par éditeur (numéros manquants), par lieu, vierges */
    let pcData = null, pcLoading = null;
    function loadPostcards() { if (pcData || pcLoading) return; pcLoading = A().api('postcards').then(r => { pcData = r.postcards || []; }).catch(() => { pcData = []; }).finally(() => { pcLoading = null; if (A().state?.module === 'documents') paintWorkspaceList(); }); }
    const PC_VIEWS = [['cards', '▦ Vignettes'], ['publisher', '🏷 Par éditeur'], ['place', '📍 Par lieu'], ['blank', '✉️ Écrites / vierges']];
    const pcThumb = c => `<span class="ong-pc-flip">${c.recto?.thumb ? `<img class="r" src="${esc(c.recto.thumb)}" alt="" loading="lazy">` : ''}${c.verso?.thumb ? `<img class="v" src="${esc(c.verso.thumb)}" alt="" loading="lazy">` : ''}</span>`;
    const pcCard = c => `<button type="button" class="ong-pc" data-ong-doc="${c.media_id}" data-ong-card="${c.media_id}" title="${esc(c.verso ? T('Survole pour voir le verso') : c.title)}">${pcThumb(c)}<b>${esc(c.title)}</b><small>${esc([c.publisher, c.card_number && `n° ${c.card_number}`, c.place?.name, c.year].filter(Boolean).join(' · '))}</small></button>`;
    /** les numéros qui manquent dans une série (numéros entiers, trous de 30 au plus) */
    function missingNums(cards) {
        const n = [...new Set(cards.map(c => Number(String(c.card_number).match(/\d+/)?.[0])).filter(x => x > 0))].sort((a, b) => a - b), out = [];
        for (let i = 1; i < n.length; i++) if (n[i] - n[i - 1] > 1 && n[i] - n[i - 1] <= 31) for (let k = n[i - 1] + 1; k < n[i]; k++) out.push(k);
        return out;
    }
    function postcardsHtml(list) {
        if (!pcData) { loadPostcards(); return UI().skeleton ? UI().skeleton(4) : ''; }
        const keep = new Set(list.map(d => d.id)), cards = pcData.filter(c => keep.has(c.media_id));
        const v = PC_VIEWS.some(x => x[0] === readPref().pcView) ? readPref().pcView : 'cards';
        const seg = `<div class="ong-wsview segmented" role="tablist">${PC_VIEWS.map(([k, l]) => `<button type="button" class="${v === k ? 'is-active' : ''}" data-ong-pcview="${k}" aria-pressed="${v === k}">${esc(T(l))}</button>`).join('')}</div>`;
        if (!cards.length) return seg + A().emptyState({icon: '🏞', text: T('Aucune fiche de carte postale pour l’instant'), hint: T('Listes → 🏞 Cartes postales : donne à chaque carte son éditeur, son numéro, son lieu, son recto et son verso.')});
        const group = (key, label) => { const by = new Map(); cards.forEach(c => { const k = key(c) || ''; if (!by.has(k)) by.set(k, []); by.get(k).push(c); });
            return [...by.entries()].sort((a, b) => (a[0] === '') - (b[0] === '') || a[0].localeCompare(b[0], 'fr')).map(([k, cs]) => ({name: k || label, cards: cs})); };
        const numSort = cs => [...cs].sort((a, b) => (Number(String(a.card_number).match(/\d+/)?.[0]) || 1e9) - (Number(String(b.card_number).match(/\d+/)?.[0]) || 1e9));
        let groups;
        if (v === 'publisher') groups = group(c => c.publisher.trim(), T('Éditeur inconnu')).map(g => ({...g, cards: numSort(g.cards), miss: g.name !== T('Éditeur inconnu') ? missingNums(g.cards) : []}));
        else if (v === 'place') groups = group(c => c.place?.name || '', T('Lieu inconnu'));
        else if (v === 'blank') { const blank = c => !c.sent_date && !c.postmark && !c.writer && !c.writer_text && !c.recipient && !c.recipient_text; groups = [{name: T('Écrites ou envoyées'), cards: cards.filter(c => !blank(c))}, {name: T('Vierges (jamais envoyées)'), cards: cards.filter(blank)}].filter(g => g.cards.length); }
        else groups = [{name: '', cards}];
        return seg + groups.map(g => `<section class="ong-pcgroup">${g.name ? `<h3>${esc(g.name)} <small class="muted">${esc(plural(g.cards.length, 'carte', 'cartes'))}</small></h3>` : ''}
            ${g.miss?.length ? `<p class="ong-pcmiss">⚠ ${esc(g.miss.length > 1 ? T('Il manque les n° {n}', {n: g.miss.slice(0, 20).join(', ') + (g.miss.length > 20 ? '…' : '')}) : T('Il manque le n° {n}', {n: String(g.miss[0])}))}</p>` : ''}
            <div class="ong-pcgrid">${g.cards.map(pcCard).join('')}</div></section>`).join('');
    }
    function sortCardsHtml(list) {
        const by = new Map(); list.forEach(d => { const k = CO().sortOf(d); if (!by.has(k)) by.set(k, []); by.get(k).push(d); });
        const keys = CO().SORTS.map(s => s[0]).filter(k => by.has(k));
        return UI().cardsHtml(keys.map(k => { const [, ic, l] = CO().sortMeta(k), ds = by.get(k), img = ds.find(d => fold(d.media_type) === 'image');
            return {thumb: img ? thumbOf(img) : `<span class="ui-card-ico">${ic}</span>`, name: `${ic} ${T(l)}`, open: `data-ong-wssort="${k}"`, openLabel: T('Voir ces documents'), attrs: `data-ong-sortcard="${k}"`, lines: [plural(ds.length, 'document', 'documents')]}; }));
    }
    /* 🔎 à droite, en mode « 🔎 Enquêtes photo » : toutes les enquêtes photo (vignette, images, indices, lieu et date trouvés) ; ouvrir, supprimer (↶ Annuler) */
    async function paintInquiries(box) {
        const EP = ext.enquetePhoto;
        if (!EP?._get) { box.innerHTML = A().emptyState({icon: '🔎', text: T('L’enquête photo n’est pas chargée.')}); return; }
        loadEpIds(true);
        let L = [];
        try { L = (await EP._get('list')).inquiries || []; } catch (e) { box.innerHTML = A().emptyState({icon: '🔎', text: e.message}); return; }
        if (!box.isConnected || modeOf() !== 'inquiries') return;
        if (!L.length) { box.innerHTML = A().emptyState({icon: '🔎', text: T('Aucune enquête photo pour l’instant'), hint: T('Sur la page d’une image : « 🔎 Enquêter », ou clic droit sur une image.')}); return; }
        const ro = kiosk();
        box.innerHTML = `<div class="ong-epcards">${UI().cardsHtml(L.map(q => ({
            thumb: q.thumb ? `<img src="media/${encodeURIComponent(q.thumb)}" alt="" loading="lazy">` : '<span class="ui-card-ico">🔎</span>',
            name: q.title || T('Enquête photo'), open: `data-ong-epopen="${q.id}"`, openLabel: T('Ouvrir l’enquête'), attrs: `data-ong-ep="${q.id}"`,
            lines: [[plural(q.n_images, 'image'), plural(q.n_clues, 'indice')].join(' · '), [q.place?.name ? `🗺 ${q.place.name}` : '', q.date?.text ? `📅 ${q.date.text}` : '', q.status === 'done' ? T('terminée pour l’instant') : ''].filter(Boolean).join(' · ')],
            date: q.updated_at,
            menu: ro ? [] : [`<button type="button" role="menuitem" data-ong-epdel="${q.id}">🗑 ${esc(T('Supprimer l’enquête'))}</button>`]
        })))}</div>`;
        box.onclick = async e => {
            const o = e.target.closest('[data-ong-epopen]'); if (o) { e.preventDefault(); EP.open(Number(o.dataset.ongEpopen), {onClose: () => paintWorkspaceList()}); return; }
            const d = e.target.closest('[data-ong-epdel]'); if (!d || ro) return;
            e.preventDefault(); const id = Number(d.dataset.ongEpdel), q = L.find(x => x.id === id);
            try { await EP._post('delete', {id}); } catch (err) { A().toast(err.message, 'error'); return; }
            await EP.loadCounts?.(true); paintWorkspaceList();
            const msg = T('Enquête photo « {name} » supprimée', {name: q?.title || ''});
            if (A().undoDelete) A().undoDelete({type: 'photo_inquiry', id, message: msg, redo: () => EP._post('delete', {id}), after: async () => { await EP.loadCounts?.(true); paintWorkspaceList(); }});
            else A().undoToast ? A().undoToast(msg, {undo: async () => { await A().api('restore_last_delete', {}, {method: 'POST', body: {entity_type: 'photo_inquiry', entity_id: id}}); await EP.loadCounts?.(true); paintWorkspaceList(); }}) : A().toast(msg);
        };
    }
    function paintWorkspaceList() {
        const box = document.querySelector('#workspace [data-ong-cards]'); if (!box || cur) return;
        const all = filtered();
        if (modeOf() === 'inquiries' && !pick.on) { paintInquiries(box); return; }
        if ((docs || []).length && CO() && modeOf() === 'letters' && !pick.on) { const k = wsEx(); if (k == null) box.innerHTML = exCardsHtml(all); else paintExWs(box, all, k); return; }
        if ((docs || []).length && CO() && modeOf() === 'sorts' && !pick.on && !wsSort()) { box.innerHTML = sortCardsHtml(all); return; }
        if (!(docs || []).length) { box.innerHTML = A().emptyState({icon: '📄', text: 'Aucun document pour l’instant', hint: 'Les photos, actes, lettres et papiers ajoutés aux fiches (ou importés) arrivent ici, sans rien ressaisir.', action: kiosk() ? null : {label: '⤒ Importer des documents', attrs: 'data-empty-click="[data-ong-import]"'}}); return; }
        if (modeOf() === 'recueils' && !wsRec() && !pick.on) { box.innerHTML = recCardsHtml(all); return; }
        if (wsSort() === 'postcard' && CO() && !pick.on) { const pl = all.filter(d => CO().sortOf(d) === 'postcard');
            box.innerHTML = `<div class="ong-recbar"><button type="button" class="button small secondary" data-ong-wssort="">← ${esc(T('Toutes les sortes'))}</button><strong>🏞 ${esc(T('Cartes postales'))}</strong><small class="muted">${esc(plural(pl.length, 'document', 'documents'))}</small></div>` + postcardsHtml(pl); return; }
        const w = wsRec(), rec = w && w !== 'none' ? (recOf(w) || {id: Number(w), title: '', icon: '📚'}) : null, ws0 = wsSort(), list = ws0 && CO() ? all.filter(d => CO().sortOf(d) === ws0) : wsDocs(all);
        const head = ws0 && CO() ? `<div class="ong-recbar"><button type="button" class="button small secondary" data-ong-wssort="">← ${esc(T('Toutes les sortes'))}</button><strong>${CO().sortMeta(ws0)[1]} ${esc(T(CO().sortMeta(ws0)[2]))}</strong><small class="muted">${esc(plural(list.length, 'document', 'documents'))}</small></div>` : w ? `<div class="ong-recbar" data-ong-recbar><button type="button" class="button small secondary" data-ong-wsrec="">← ${esc(T('Tous les recueils'))}</button>
            <strong>${rec ? `${esc(rec.icon || '📚')} ${esc(rec.title || T('Recueil'))}` : `🗂️ ${esc(T('Dans aucun recueil'))}`}</strong><small class="muted">${esc(plural(list.length, 'document', 'documents'))}${rec ? ` · ${esc(T('dans l’ordre des pages'))}` : ''}</small>
            <span class="spacer"></span>${rec ? `<button type="button" class="button small secondary" data-ong-recopen="${rec.id}">↗ ${esc(T('Ouvrir le recueil'))}</button>` : ''}</div>` : '';
        if (!list.length) { box.innerHTML = head + A().emptyState({icon: '🔎', text: 'Rien ne correspond', hint: 'Change les mots cherchés ou retire un filtre dans la colonne de gauche.'}); return; }
        const vw = wsView(), seg = `<div class="ong-wsview segmented" role="tablist" aria-label="${esc(T('Montrer les documents'))}">${WS_VIEWS.map(([k, l]) => `<button type="button" class="${vw === k ? 'is-active' : ''}" data-ong-wsview="${k}" aria-pressed="${vw === k}">${esc(T(l))}</button>`).join('')}</div>`;
        if (vw === 'map') { box.innerHTML = head + seg + docsMapHtml(list); bindDocsMap(box, list); paintPick(); return; }
        if (vw === 'time') { box.innerHTML = head + seg + docsTimeHtml(list); paintPick(); return; }
        box.innerHTML = head + seg + (UI().cardsHtml ? UI().cardsHtml(list.slice(0, wsShown).map(d => ({thumb: thumbOf(d), name: rec && d._num ? `${T('p. {n}', {n: String(d._num)})} · ${d.title}` : d.title, open: `data-ong-doc="${d.id}"`, attrs: `data-ong-card="${d.id}"`, lines: cardLines(d),
            badges: [{text: sortMeta(d.sort)[2], kind: 'grey'}, ...(d.has_tr ? [{text: 'Transcrit', kind: 'green'}] : [])], when: d.created_at, whenLabel: 'Ajouté'}))) : '');
        if (list.length > wsShown && UI().moreButton) box.appendChild(UI().moreButton({remaining: list.length - wsShown, step: 24, onClick: () => { wsShown += 24; paintWorkspaceList(); }}));
        paintPick();
    }
    async function render(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        await load();
        if (token != null && token !== A().state?.workspaceToken) return;
        let lost = 0; // « #documents/99999 » : un document qui n'existe pas (ou plus) — la petite ligne K10 au-dessus de la liste
        if (cur && !byId(cur)) { lost = !failed && /^#documents\/\d/.test(location.hash) ? cur : 0; cur = 0; if (lost) history.replaceState(null, '', hashFor(0)); }
        if (cur) return showDoc(cur, token);
        const ro = kiosk();
        ws.innerHTML = `<section class="page ong-page" data-ong-page="documents">${UI().pageHeader ? UI().pageHeader({title: 'Documents', icon: '📄',
            help: 'Les médias et pièces d’archives de ta base, comme les personnes : la liste à gauche (A → Z, 👤 par personne, 📚 par recueil ou en 📁 dossiers), la fiche à droite.',
            primary: ro ? '' : '<button type="button" class="button" data-ong-import>⤒ Importer des documents</button>',
            actions: [ro ? '' : `<button type="button" class="button secondary" data-ong-pick aria-pressed="${pick.on}">${esc(T('☑ Choisir plusieurs'))}</button>`, '<button type="button" class="button secondary" data-ong-medias>↗ Listes → Médias</button>'].filter(Boolean)}) : '<h1>Documents</h1>'}
            ${failed ? `<div class="ui-msg is-error">⛔ ${esc(failed)}</div>` : ''}${lost ? `<div class="ong-lost" data-ong-lost>${A().empty(`Document introuvable (n° ${lost}) : il n’existe pas, ou plus (supprimé ?). Choisis-en un ci-dessous.`, {icon: '🔍'})}</div>` : ''}<div class="ong-pickbar" data-ong-pickbar hidden></div><div class="ong-cards" data-ong-cards></div></section>`;
        paintWorkspaceList();
    }
    function hashFor(id) { return id ? `#documents/${id}` : '#documents'; }
    async function select(id, {keepFocus = false} = {}) {
        if (!id) return;
        cur = id; writePref({cur: id});
        document.querySelectorAll('#sidebar-content [data-ong-doc]').forEach(b => b.classList.toggle('is-active', Number(b.dataset.ongDoc) === id));
        if (location.hash !== hashFor(id)) history.pushState(null, '', hashFor(id));
        await showDoc(id);
        if (keepFocus) document.querySelector(`#sidebar-content [data-ong-doc="${id}"]`)?.focus({preventScroll: true});
        if (matchMedia('(max-width: 850px)').matches) document.getElementById('workspace')?.scrollIntoView({block: 'start'});
    }
    function folderPath(id) {
        const data = SF()?.read('document'); if (!data) return [];
        let f = data.folders.find(x => x.id === data.of[String(id)]); const out = [];
        while (f) { out.unshift(f.name); f = f.parent ? data.folders.find(x => x.id === f.parent) : null; }
        return out;
    }
    const kindWord = d => sortMeta(d.sort || sortOf(d))[2];
    const lifeOf = p => (p.birth || p.death) ? `${p.birth || '?'}–${p.death || ''}` : '';
    function personChip(p) {
        const g = {male: 'm', female: 'f'}[p.gender] || 'u', ini = String(p.name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
        const av = UI().avatarOr ? UI().avatarOr({id: p.id, name: p.name, gender: p.gender}, 34, `<span class="ong-av is-${g}">${esc(ini)}</span>`) : `<span class="ong-av is-${g}">${esc(ini)}</span>`;
        return `<button type="button" class="ong-person" data-ong-person="${p.id}" title="Ouvrir la fiche">${av}<span><b>${esc(p.name)}</b>${lifeOf(p) || p.role ? `<small>${esc([p.role, lifeOf(p)].filter(Boolean).join(' · '))}</small>` : ''}</span><span class="ong-go" aria-hidden="true">↗</span></button>`;
    }
    /* 📄 un seul texte par document (maquette docs/design/dossier-et-transcriptions.html, B3) : le texte de l'Atelier de transcription,
       un bloc par acte (sorte, état, lieu, date, cote, zones) avec « 📜 Ouvrir dans l'Atelier » ; sans acte, le texte du document */
    const TXST = {todo: ['À faire', 'grey'], doing: ['En cours', 'yellow'], checked: ['Relue', 'blue'], done: ['Finie', 'green']};
    const bdg = (t, k) => (UI().badge ? UI().badge(t, k) : `<span class="ui-badge is-${k}">${esc(t)}</span>`);
    // 3c : le texte montré comme dans l'Atelier, avec les mêmes numéros de ligne (heritage-transcribe-aligne.js ; réglage « Numéros de ligne »)
    const trText = v => (ext.txAligne ? ext.txAligne.numberedHtml(v, {cls: 'ong-tr'}) : `<div class="ong-tr">${esc(v)}</div>`);
    function trHtml(d, isImg, ro) {
        const acts = d.acts || [], wp = ext.openTextDoc ? `<button type="button" class="button small secondary" data-ong-wp>${esc(T('📝 Dans le traitement de texte'))}</button>` : '';
        const open = id => (!ro && isImg && ext.openActTranscriber ? `<button type="button" class="button small" data-ong-txopen="${id}">${esc(T('📜 Ouvrir dans l’Atelier'))}</button>` : '');
        if (!acts.length) return d.transcription ? `<section class="card ong-sec ong-trsec"><div class="ong-sh"><h3>📜 ${esc(T('Transcription'))}</h3><span class="spacer"></span>${open(0)}${wp}</div>${trText(d.transcription)}</section>` : '';
        return acts.map((a, i) => { const st = TXST[a.status] || TXST.doing;
            const meta = [a.place, a.date_text, a.source, a.zones ? A().plural(a.zones, 'zone') : ''].filter(Boolean).join(' · ');
            return `<section class="card ong-sec ong-trsec" data-ong-act="${a.id}"><div class="ong-sh"><h3>📜 ${esc(acts.length > 1 ? a.title || T('Transcription') : T('Transcription'))}</h3>${bdg(ext.actKindLabel ? ext.actKindLabel(a.kind) : a.kind, 'grey')}${bdg(T(st[0]), st[1])}<span class="spacer"></span>${open(a.id)}${i === 0 ? wp : ''}</div>
                ${acts.length === 1 && a.title ? `<p class="ong-trtitle">${esc(a.title)}</p>` : ''}${a.reason && ext.txCtx ? `<p class="ong-trwhy">${ext.txCtx.reasonHtml(a.reason)}</p>` : ''}${String(a.body || '').trim() ? trText(a.body) : `${window.LCNDA_APP.empty(T('Rien d’écrit pour l’instant.'))}`}
                ${meta ? `<p class="ong-trmeta">${esc(meta)}</p>` : ''}</section>`; }).join('');
    }
    /** les noms relevés dans l'Atelier pas encore reliés à une fiche (ils se relient dans l'Atelier, ou sur la fiche qui leur ressemble) */
    function unlinked(d) {
        const names = (d.acts || []).flatMap(a => (a.people || []).filter(p => !p.person_id && p.name).map(p => [p.name, p.role, a.id]));
        // 3c : comme dans la visionneuse, un clic (🔗) ouvre l'Atelier sur l'acte pour relier la personne
        const ro = kiosk(), chip = ([n, r, id]) => (ro ? `<span class="ong-uname">${esc(n)}${r ? ` <small>${esc(r)}</small>` : ''}</span>` : `<button type="button" class="ong-uname is-unlinked" data-ong-txlink="${id}" title="${esc(T('Pas encore relié : le relier dans l’Atelier'))}">🔗 ${esc(n)}${r ? ` <small>${esc(r)}</small>` : ''}</button>`);
        return names.length ? `<p class="ong-unlinked"><span class="muted">${esc(T('Relevés dans le texte, pas encore reliés :'))}</span> ${names.slice(0, 30).map(chip).join(' ')}</p>` : '';
    }
    const epBtn = d => `<button type="button" class="button secondary" data-ep-media="${Number(d.id)}" data-ep-title="${esc(d.title || '')}" title="${esc(T('🔎 Enquête photo : relever les indices (lieu, date, uniformes, texte…)'))}">${esc(T('🔎 Enquêter'))}</button>`;
    async function showDoc(id, token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const t0 = A().state?.workspaceToken;
        if (!cache.has(id)) ws.innerHTML = `<section class="page ong-page">${UI().spinner ? UI().spinner('Chargement du document…') : '<div class="loading-block">Chargement…</div>'}</section>`;
        let d;
        try { d = cache.get(id) || (await A().api('onglets', {op: 'document', id})).document; cache.set(id, d); }
        catch (e) {
            if (cur !== id || A().state?.module !== 'documents') return;
            const lost = /introuvable|n’existe/i.test(e.message || ''); // « #documents/99999 » : la petite ligne K10, pas une erreur
            ws.innerHTML = `<section class="page ong-page">${lost ? A().empty('Document introuvable : il n’existe pas, ou plus (supprimé ?). Choisis-en un dans la colonne de gauche.', {icon: '🔍'}) : A().emptyState({icon: '⛔', text: 'Ce document ne s’ouvre pas', hint: e.message || ''})}</section>`; return;
        }
        if ((token != null && token !== A().state?.workspaceToken) || t0 !== A().state?.workspaceToken || cur !== id || A().state?.module !== 'documents') return;
        const lite = byId(id) || {}, sort = lite.sort || sortOf(d), [, icon] = sortMeta(sort), ro = kiosk();
        const isImg = fold(d.media_type) === 'image' && d.filename, src = d.filename ? `media/${encodeURIComponent(d.filename)}` : '';
        const path = folderPath(id), when = UI().when || (x => esc(x));
        const readDate = d.date_text && UI().readDate ? UI().readDate(d.date_text) : null;
        const help = [kindWord({...d, sort}), d.date_text, d.places?.[0]?.name, d.pages && `${d.pages} p.`].filter(Boolean).join(' · ');
        // R11 : le même ordre que le clic droit d'une ligne (Ouvrir · Modifier · Ranger · Étiquette · Exporter · — · Supprimer)
        const more = [`<button type="button" data-ong-view>↗ ${esc(T('Ouvrir le média'))}</button>`, ...(!ro && d.filename ? [`<button type="button" data-ong-edit-viewer>🖼 ${esc(T('Ouvrir dans la visionneuse'))}</button>`] : []),
            ...(!ro && isImg && ext.recueilDocs ? [`<button type="button" data-ong-recadd>${esc(T('📚 Ajouter à un recueil…'))}</button>`] : []), `<button type="button" data-ong-cite>📋 ${esc(T('Copier la citation'))}</button>`,
            '<button type="button" data-ong-dl>⤓ Télécharger</button>', '<button type="button" data-ong-print>🖨 Imprimer</button>', ...(!ro ? [`<button type="button" class="danger" data-ong-del>🗑 ${esc(T('Supprimer'))}</button>`] : [])];
        const field = (k, v, raw = false) => v ? `<dt>${esc(k)}</dt><dd>${raw ? v : esc(v)}</dd>` : '';
        const ppl = d.people || [];
        ws.innerHTML = `<section class="page ong-page ong-docpage" data-ong-page="document" data-ong-id="${id}">
            ${UI().pageHeader({where: ['Documents', ...path].join(' › '), icon, title: d.title, help: esc(help || 'Document de ta base.'), detail: true,
                primary: ro ? '' : '<button type="button" class="button" data-ong-edit>✎ Modifier</button>',
                // 🔎 Enquête photo (heritage-enquete-photo.js) : à côté de l'Atelier ; devient « 🔎 Enquête · 5 indices · lieu probable » ; en consultation, seulement s'il y en a une
                actions: ro ? [ext.enquetePhoto ? epBtn(d) : ''].filter(Boolean) : [isImg && ext.openActTranscriber ? `<button type="button" class="button secondary" data-ong-tx title="${esc(T('Ouvrir l’outil de transcription complet sur cette image'))}">${esc(T('📜 Atelier de transcription'))}</button>` : '', ext.enquetePhoto ? epBtn(d) : '', SF()?.rangeButtonHtml ? SF().rangeButtonHtml('document', id, d.title) : ''].filter(Boolean), more})}
            <button type="button" class="button small secondary ong-back" data-ong-back>← Liste</button>
            <div class="ong-dup" data-ong-dup hidden></div>
            <div class="ong-doc">
                <figure class="ong-view">${isImg ? `<button type="button" class="ong-big" data-ong-view title="Voir en grand"><img src="${src}" alt="" data-ong-img></button>` : `<button type="button" class="ong-big is-file" data-ong-view><span aria-hidden="true">${icon}</span><small>${esc(d.filename || 'Pas de fichier')}</small></button>`}
                    <figcaption data-ong-size>${isImg ? '' : esc(kindWord({...d, sort}))}</figcaption>
                    ${isImg ? `<button type="button" class="button small secondary ong-sbs-btn" data-ong-sbs-open aria-pressed="${!!readPref().sbs}">🔍 ${esc(T('Zoom et texte côte à côte'))}</button>` : ''}</figure>
                <div class="card ong-fields" data-ong-fields><h3>Description</h3>${labelsOf(lite).length ? `<p class="ong-labels-line">${labelsOf(lite).map(l => `<span class="ong-label" style="${l.color ? `--ong-lc:${esc(l.color)}` : ''}">🏷 ${esc(l.name)}</span>`).join(' ')}</p>` : ''}<dl>
                    ${field('Sorte', UI().badge ? UI().badge(kindWord({...d, sort}), 'grey') : kindWord({...d, sort}), true)}
                    ${field(T('Cote', {ctx: 'archives'}), d.cote)}
                    ${d.date_text ? `<dt>Date</dt><dd>${esc(d.date_text)}${readDate?.ok ? `<small class="ong-ok">✓ Compris : ${esc(readDate.label)}${readDate.extra ? ` ${esc(readDate.extra)}` : ''}</small>` : ''}</dd>` : ''}
                    ${field('Lieu', (d.places || []).map(p => `📍 ${esc(p.name)}`).join(', '), true)}
                    ${field('Fonds · série', [d.service, d.series].filter(Boolean).join(' › '))}
                    ${field('Pages', d.pages)}
                    ${field('Correspondant', d.correspondent)}
                    ${field('Lien', d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${esc(d.url.replace(/^https?:\/\//, '').slice(0, 60))} ↗</a>` : '', true)}
                    ${field('Où il est', path.length ? `📁 ${esc(path.join(' › '))}` : '', true)}
                    ${field('Fichier', d.filename)}
                </dl>${!d.cote && !d.date_text && !ro ? `<p class="ong-hint">${A().empty ? A().empty('Pas encore de date ni de cote : « ✎ Modifier » pour les écrire.', {icon: '✎'}) : ''}</p>` : ''}</div>
            </div>
            ${isImg ? `<section class="card ong-sec ong-sbs" data-ong-sbs ${readPref().sbs ? '' : 'hidden'}>${sbsHtml(d, src)}</section>` : ''}
            <section class="card ong-sec ong-recsec" data-ong-recueil hidden></section>
            <section class="card ong-sec ong-pagessec" data-ong-pages hidden></section>
            <section class="card ong-sec ong-linkssec" data-ong-links hidden></section>
            ${d.description ? `<section class="card ong-sec"><h3>Notes</h3><p class="ong-pre">${esc(d.description)}</p></section>` : ''}
            ${trHtml(d, isImg, ro)}
            <section class="card ong-sec"><h3>${esc(T('Personnes reliées'))} · ${ppl.length}</h3>${ppl.length ? `<div class="ong-people">${ppl.map(personChip).join('')}</div>` : (A().empty ? A().empty('Aucune personne reliée à ce document.', {icon: '👤'}) : '')}${unlinked(d)}</section>
            ${(d.links || []).length ? `<section class="card ong-sec"><h3>${esc(T('Relié à'))}</h3><ul class="ong-links">${d.links.map(l => `<li>${esc(l.label)}</li>`).join('')}</ul></section>` : ''}
            <p class="ong-when">${d.created_at ? when(d.created_at, {label: 'Ajouté'}) : ''}</p>
        </section>`;
        // 📑 les autres pages du même document (recto / verso, page 1…N, annexe : heritage-pages.js), montrées ensemble ; ＋ Relier une autre page…
        const pg = ws.querySelector('[data-ong-pages]');
        if (pg && ext.mediaPages) ext.mediaPages.mount(pg, id, {ro, onOpen: pid => { if (Number(pid) !== Number(id)) select(Number(pid)); }});
        const rc = ws.querySelector('[data-ong-recueil]'); // 📚 « Dans le recueil … page 12 » : la page d'avant, la suivante (heritage-recueil-docs.js)
        if (rc && ext.recueilDocs) ext.recueilDocs.mountPlace(rc, id, {ro, onOpen: did => { if (Number(did) !== Number(id)) select(Number(did)); }});
        const lk = ws.querySelector('[data-ong-links]'); // 🔗 documents liés (heritage-liens.js) : un clic ouvre l'autre document ici
        if (lk && ext.docLinks) ext.docLinks.mount(lk, id, {ro, onOpen: did => { if (Number(did) !== Number(id)) select(Number(did)); }});
        const img = ws.querySelector('[data-ong-img]');
        if (img) { const put = () => { const cap = ws.querySelector('[data-ong-size]'); if (cap && img.naturalWidth) cap.textContent = `${img.naturalWidth} × ${img.naturalHeight} px · ${printFit(img.naturalWidth, img.naturalHeight)}`; }; if (img.complete) put(); else img.addEventListener('load', put, {once: true}); }
        const sb = ws.querySelector('[data-ong-sbs]'); if (sb) bindSbs(sb);
        ext.enquetePhoto?.decorate?.(ws); // 🔎 « Enquête · N indices · lieu probable » si l'image en a une
        if (isImg) findDuplicates(d, ws.querySelector('[data-ong-dup]'));
    }
    /* 🔍 l'image zoomable (molette, + / −, glisser) et le texte transcrit à côté ; le texte qui défile fait défiler l'image */
    function sbsText(d) {
        const acts = (d.acts || []).filter(a => String(a.body || '').trim());
        return acts.length ? acts.map(a => String(a.body)).join('\n\n') : String(d.transcription || '');
    }
    function sbsHtml(d, src) {
        const tx = sbsText(d);
        return `<div class="ong-sh"><h3>🔍 ${esc(T('Image et transcription côte à côte'))}</h3><span class="spacer"></span>
            <span class="ong-zoombar"><button type="button" class="icon-button small" data-ong-zoom="-1" aria-label="${esc(T('Zoom arrière'))}" title="${esc(T('Zoom arrière'))}">−</button><output data-ong-zoomval>100 %</output><button type="button" class="icon-button small" data-ong-zoom="1" aria-label="${esc(T('Zoom avant'))}" title="${esc(T('Zoom avant'))}">＋</button><button type="button" class="button small secondary" data-ong-zoom="0">${esc(T('Taille d’origine'))}</button>
            <label class="checkbox-line ong-linkscroll"><input type="checkbox" data-ong-linkscroll ${readPref().linkScroll === false ? '' : 'checked'}> ${esc(T('Défilement lié'))}</label></span></div>
            <div class="ong-sbs-grid"><div class="ong-zoombox" data-ong-zoombox tabindex="0" aria-label="${esc(T('Image : molette pour zoomer, glisser pour se déplacer'))}"><img src="${src}" alt="" draggable="false" data-ong-zoomimg></div>
            <div class="ong-sbs-text" data-ong-sbstext>${tx.trim() ? trText(tx) : `${window.LCNDA_APP.empty(T('Pas encore de transcription : « 📜 Atelier de transcription » pour l’écrire.'))}`}</div></div>`;
    }
    function bindSbs(sec) {
        const box = sec.querySelector('[data-ong-zoombox]'), img = sec.querySelector('[data-ong-zoomimg]'), text = sec.querySelector('[data-ong-sbstext]'), out = sec.querySelector('[data-ong-zoomval]');
        if (!box || !img) return;
        const z = {k: 1, x: 0, y: 0};
        const paint = () => { img.style.transform = `translate(${z.x}px, ${z.y}px) scale(${z.k})`; if (out) out.textContent = `${Math.round(z.k * 100)} %`; sec.dataset.zoom = String(z.k); };
        const clampPan = () => { const w = box.clientWidth, h = box.clientHeight, iw = img.clientWidth * z.k, ih = img.clientHeight * z.k; z.x = Math.min(0, Math.max(w - iw, z.x)); z.y = Math.min(0, Math.max(Math.min(0, h - ih), z.y)); if (iw <= w) z.x = (w - iw) / 2; };
        const zoomAt = (f, cx = box.clientWidth / 2, cy = box.clientHeight / 2) => { const k = Math.min(8, Math.max(1, z.k * f)); z.x = cx - (cx - z.x) * (k / z.k); z.y = cy - (cy - z.y) * (k / z.k); z.k = k; clampPan(); paint(); };
        box.addEventListener('wheel', e => { e.preventDefault(); const r = box.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top); }, {passive: false});
        let drag = null;
        box.addEventListener('pointerdown', e => { drag = {x: e.clientX - z.x, y: e.clientY - z.y}; box.setPointerCapture?.(e.pointerId); box.classList.add('is-dragging'); });
        box.addEventListener('pointermove', e => { if (!drag) return; z.x = e.clientX - drag.x; z.y = e.clientY - drag.y; clampPan(); paint(); });
        const stop = () => { drag = null; box.classList.remove('is-dragging'); };
        box.addEventListener('pointerup', stop); box.addEventListener('pointercancel', stop);
        box.addEventListener('keydown', e => { if (e.key === '+' || e.key === '=') zoomAt(1.2); else if (e.key === '-') zoomAt(1 / 1.2); else if (e.key === '0') { z.k = 1; z.x = 0; z.y = 0; clampPan(); paint(); } });
        sec.querySelectorAll('[data-ong-zoom]').forEach(b => b.addEventListener('click', () => { const v = Number(b.dataset.ongZoom); if (!v) { z.k = 1; z.x = 0; z.y = 0; clampPan(); paint(); } else zoomAt(v > 0 ? 1.25 : 0.8); }));
        const link = sec.querySelector('[data-ong-linkscroll]');
        link?.addEventListener('change', () => writePref({linkScroll: link.checked}));
        // défilement lié : la part du texte déjà lue = la part de l'image (de haut en bas) montrée
        text?.addEventListener('scroll', () => {
            if (!link?.checked) return;
            const p = text.scrollHeight > text.clientHeight ? text.scrollTop / (text.scrollHeight - text.clientHeight) : 0;
            const ih = img.clientHeight * z.k, h = box.clientHeight; if (ih <= h) return;
            z.y = -p * (ih - h); clampPan(); paint();
        });
        sec._zoom = z; // pour les essais
        if (img.complete) { clampPan(); paint(); } else img.addEventListener('load', () => { clampPan(); paint(); }, {once: true});
    }
    /* 👯 « peut-être un doublon de… » : les empreintes des images (heritage-images-similaires.js, app-image-prints.js) */
    async function findDuplicates(d, host) {
        const P = window.LCNDA_IMGPRINT, ip = ext.imagePrints; if (!host || !P?.search || !ip?.load) return;
        try {
            const all = await ip.load(); const items = all?.items || [], me = items.find(x => Number(x.id) === Number(d.id));
            if (!me || !host.isConnected) return;
            const res = (await P.search(me, items, {sens: 0.6, min: 60, exclude: d.id})).filter(r => ['identique', 'proche', 'recadree'].includes(r.kind)).slice(0, 3);
            if (!res.length || !host.isConnected || cur !== d.id) return;
            const label = r => ({identique: T('identique'), proche: T('très proche'), recadree: T('recadrée')}[r.kind] || '');
            host.hidden = false;
            host.innerHTML = `<span class="ong-dup-ico" aria-hidden="true">👯</span><span>${esc(T('Peut-être un doublon de :'))}</span> ${res.map(r => { const o = byId(r.item.id); return `<button type="button" class="ong-dup-link" data-ong-doc="${Number(r.item.id)}" title="${esc(T('Ouvrir ce document'))}">« ${esc(o?.title || r.item.title || `#${r.item.id}`)} » <small>${esc(label(r))} · ${r.score} %</small></button>`; }).join(' ')}
                ${ext.openImageDuplicates ? `<button type="button" class="button small secondary" data-ong-dupopen>${esc(T('👯 Voir les doublons'))}</button>` : ''}`;
            host.querySelector('[data-ong-dupopen]')?.addEventListener('click', () => ext.openImageDuplicates());
        } catch (_) { /* pas d'empreintes : rien à dire */ }
    }
    ext.ongletsDocs = {findDuplicates: (d, host) => findDuplicates(d, host)};
    /* ✎ Modifier sur place : titre, date, lieu, cote, personnes (menu de choix) ; « ↶ Annuler » remet tout comme avant */
    function editInline(d) {
        const box = document.querySelector('#workspace [data-ong-fields]'); if (!box || kiosk()) return;
        const PK = window.LCNDA_PICKER;
        const place = (d.places || [])[0];
        box.classList.add('is-editing');
        box.innerHTML = `<h3>✎ ${esc(T('Modifier le document'))}</h3><form class="ong-inline" data-ong-inline novalidate><div class="form-grid">
            <label class="span-2">${esc(T('Titre'))}<input name="title" maxlength="500" value="${esc(d.document_title && !d.title ? d.document_title : d.title)}" required></label>
            <label>${esc(T('Date'))}<input name="date_text" maxlength="500" value="${esc(d.date_text || '')}" data-ui-date placeholder="${esc(T('ex. 12 mars 1903, vers 1900'))}"></label>
            <label>${esc(T('Cote', {ctx: 'archives'}))}<input name="document_reference" maxlength="500" value="${esc(d.cote || '')}" placeholder="${esc(T('ex. 3 E 12/45'))}"></label>
            <div class="span-2" data-ong-pfield><span class="pk-lab">${esc(T('Lieu'))}</span>${PK ? PK.pickerField({name: 'place_id', kind: 'place', value: place ? {id: place.id, title: place.name} : null, allowCreate: false, placeholder: T('Ville, village, paroisse…')}) : ''}</div>
            <div class="span-2" data-ong-ppl><span class="pk-lab">${esc(T('Personnes reliées'))}</span>${PK ? PK.pickerField({name: 'people', kind: 'person', multiple: true, allowCreate: false, value: (d.people || []).filter(p => !p.found).map(p => ({id: p.id, title: p.name}))}) : ''}</div></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-ong-inline-cancel>${esc(T('Annuler'))}</button><button type="submit" class="button" data-ong-inline-save>${esc(T('Enregistrer'))}</button></div></form>`;
        const form = box.querySelector('form');
        form.querySelector('[name="title"]').focus();
        form.querySelector('[data-ong-inline-cancel]').addEventListener('click', () => showDoc(d.id));
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(form)), title = String(f.title || '').trim();
            if (!title) { A().toast(T('Donne un titre au document.'), 'error'); return; }
            const pVal = PK ? PK.pickerValue(form.querySelector('[data-ong-pfield] .pk')) : null, pid = Number(pVal) || 0;
            const nextPeople = PK ? (PK.pickerValue(form.querySelector('[data-ong-ppl] .pk')) || []).map(Number).filter(Boolean) : null;
            const prevPeople = (d.people || []).filter(p => !p.found).map(p => Number(p.id));
            const add = nextPeople ? nextPeople.filter(x => !prevPeople.includes(x)) : [], remove = nextPeople ? prevPeople.filter(x => !nextPeople.includes(x)) : [];
            const body = {op: 'doc_save', media_id: d.id, title, date_text: String(f.date_text || '').trim(), document_reference: String(f.document_reference || '').trim()};
            if (PK) body.place_id = pid;
            form.querySelector('[data-ong-inline-save]').disabled = true;
            try {
                const r = await write(body);
                if (add.length || remove.length) await write({op: 'doc_people', media_id: d.id, add, remove});
                const again = async () => { cache.delete(d.id); await reloadAll(); };
                await again();
                A().undoToast?.(T('Document « {t} » modifié', {t: title}), {
                    undo: async () => { await write({op: 'doc_save', media_id: d.id, ...r.before}); if (add.length || remove.length) await write({op: 'doc_people', media_id: d.id, add: remove, remove: add}); await again(); },
                    redo: async () => { await write(body); if (add.length || remove.length) await write({op: 'doc_people', media_id: d.id, add, remove}); await again(); }});
            } catch (err) { A().toast(err.message, 'error'); form.querySelector('[data-ong-inline-save]').disabled = false; }
        });
    }
    /* 📋 la citation toute prête (lib/citation_styles.php), au style choisi (retenu dans genealogie-documents-tab) */
    const CITE_STYLES = [['fr', 'Classique (à la française)'], ['ee', 'Evidence Explained'], ['chicago', 'Chicago'], ['forum', 'Généanet / forum']];
    async function copyCitation(d) {
        let r; try { r = await A().api('onglets', {op: 'citation', id: d.id}); } catch (e) { return A().toast(e.message, 'error'); }
        const st = CITE_STYLES.some(x => x[0] === readPref().citeStyle) ? readPref().citeStyle : 'fr';
        const textOf = k => r.styles?.[k]?.note || r.styles?.[k]?.biblio || '';
        ext.openDialog?.({eyebrow: T('CITER'), title: T('📋 Copier la citation'), submitLabel: T('📋 Copier'),
            body: `<div class="form-grid one-column"><fieldset class="ong-citestyles"><legend>${esc(T('Style'))}</legend>${CITE_STYLES.map(([k, l]) => `<label class="checkbox-line"><input type="radio" name="style" value="${k}" ${k === st ? 'checked' : ''}> ${esc(T(l))}</label>`).join('')}</fieldset>
                <label>${esc(T('La citation'))}<textarea name="text" rows="4" data-ong-citetext>${esc(textOf(st))}</textarea></label></div>`,
            onOpen: dlg => dlg.addEventListener('change', e => { if (e.target.name === 'style') { dlg.querySelector('[data-ong-citetext]').value = textOf(e.target.value); writePref({citeStyle: e.target.value}); } }),
            onSubmit: async form => {
                const f = Object.fromEntries(new FormData(form)); writePref({citeStyle: f.style});
                try { await navigator.clipboard.writeText(String(f.text || '')); A().toast(T('Citation copiée.'), 'success'); }
                catch (_) { A().toast(T('Le presse-papiers est fermé : sélectionne le texte et copie-le (⌘C).'), 'error'); }
            }});
    }
    ext.ongletsCite = copyCitation;
    function printFit(w, h) { const L = Math.max(w, h), S = Math.min(w, h); for (const [f, l, s] of [['A4', 3508, 2480], ['A5', 2480, 1748], ['A6', 1748, 1240]]) if (L >= l && S >= s) return `assez grande pour imprimer en ${f}`; return 'petite : écran seulement'; }

    /* ─── les boutons de la page ─── */
    const asMedia = d => ({id: d.id, title: d.title, filename: d.filename, thumbnail: d.thumbnail, media_type: d.media_type, date_text: d.date_text, document_reference: d.cote, transcription: d.transcription, description: d.description});
    document.addEventListener('click', async e => {
        const page = e.target.closest?.('#workspace [data-ong-page]'); if (!page || A().state?.module !== 'documents') return;
        const b = e.target.closest('button, a'); if (!b) return;
        if (b.matches('[data-ong-missadd], [data-ong-missdel], [data-ong-zoom], [data-ong-dupopen], [data-ong-inline-cancel], [data-ong-inline-save]') || b.closest('.pk, .sel-bar')) return; // leurs propres écouteurs
        if (b.matches('[data-ong-pick]')) { pick.on = !pick.on; if (!pick.on) pick.ids = []; if (modeOf() === 'recueils' && !wsRec()) paintWorkspaceList(); paintPick(); return; }
        if (b.matches('[data-ong-pick-close]')) { pick.on = false; pick.ids = []; if (modeOf() === 'recueils' && !wsRec()) paintWorkspaceList(); paintPick(); return; }
        if (b.matches('[data-ong-pick-none]')) { pick.ids = []; paintPick(); return; }
        if (b.matches('[data-ong-pick-all]')) { wsDocs().slice(0, wsShown).forEach(x => { if (!pick.ids.includes(x.id)) pick.ids.push(x.id); }); paintPick(); return; }
        if (b.matches('[data-ong-pick-make], [data-ong-pick-add]')) {
            if (!ext.recueilDocs) return A().toast(T('Les recueils ne sont pas encore chargés : réessaie dans un instant.'), 'error');
            const chosen = pick.ids.map(byId).filter(Boolean);
            const done = async () => { pick.on = false; pick.ids = []; await afterRecueil(); paintPick(); };
            if (b.matches('[data-ong-pick-make]')) ext.recueilDocs.create(chosen, {onDone: done}); else ext.recueilDocs.addTo(chosen, {onDone: done});
            return;
        }
        if (b.matches('[data-ong-wsrec]')) { showRec(b.dataset.ongWsrec); return; }
        if (b.matches('[data-ong-wsex]')) { showEx(b.dataset.ongWsex === '' && !b.closest('[data-ong-excard]') ? null : b.dataset.ongWsex); return; }
        if (b.matches('[data-ong-pcview]')) { writePref({pcView: b.dataset.ongPcview}); paintWorkspaceList(); return; }
        if (b.matches('[data-ong-exview]')) { writePref({exView: b.dataset.ongExview}); paintWorkspaceList(); return; }
        if (b.matches('[data-ong-wssort]')) { showSort(b.dataset.ongWssort); return; }
        if (b.matches('[data-ong-wsview]')) { writePref({wsView: b.dataset.ongWsview}); paintWorkspaceList(); return; }
        if (b.matches('[data-ong-recopen]')) { b.closest('details')?.removeAttribute('open'); ext.openRecueil?.(Number(b.dataset.ongRecopen)); return; }
        if (pick.on && !cur && b.matches('[data-ong-doc]')) { e.preventDefault(); togglePick(Number(b.dataset.ongDoc)); return; }
        let d = cache.get(cur);
        // la page affichée peut venir d'avant un vidage du cache (ouverture de l'app, média changé ailleurs) : on relit le document au lieu de ne rien faire
        if (!d && !b.matches('[data-ong-doc], [data-ong-back], [data-ong-medias], [data-ong-import]')) {
            const id = Number(page.dataset.ongId) || cur;
            if (id) { try { d = (await A().api('onglets', {op: 'document', id})).document; if (d) { cache.set(id, d); if (!cur) cur = id; } } catch (_) {} }
            if (!d) return A().toast(T('Ce document n’a pas pu être relu : réessaie dans un instant.'), 'error');
        }
        if (b.matches('[data-ong-doc]')) { e.preventDefault(); return select(Number(b.dataset.ongDoc)); }
        if (b.matches('[data-ong-back]')) { cur = 0; writePref({cur: 0}); history.pushState(null, '', '#documents'); document.querySelectorAll('#sidebar-content [data-ong-doc].is-active').forEach(x => x.classList.remove('is-active')); render(); if (matchMedia('(max-width: 850px)').matches) document.getElementById('sidebar')?.scrollIntoView({block: 'start'}); return; }
        if (b.matches('[data-ong-medias]')) { if (A().state) A().state.listType = 'media'; return A().setModule('listes'); }
        if (b.matches('[data-ong-import]')) {
            if (kiosk()) return A().toast('Mode consultation : rien ne peut être ajouté.', 'error');
            const P = window.LCNDA_MEDIA_PICKER; if (!P?.openMediaPicker) return A().toast('La fenêtre des images n’est pas chargée.', 'error');
            await P.openMediaPicker({types: ['image', 'document', 'audio', 'video'], multiple: true, title: '⤒ Importer des documents', okLabel: 'Fermer'});
            await load(true); cache.clear(); A().renderSidebar(); render(); return;
        }
        if (!d) return;
        if (b.matches('[data-ong-person]')) { A().openPersonById?.(Number(b.dataset.ongPerson)); return; }
        if (b.matches('[data-ong-view]')) { if (!d.filename) return; // 📑 un document en plusieurs pages : toutes ses pages dans la visionneuse
            let pages = []; try { pages = ((await ext.mediaPages?.get(d.id)) || {}).pages || []; } catch (_) { pages = []; }
            const list = pages.length > 1 ? pages.map(p => (Number(p.media_id) === Number(d.id) ? asMedia(d) : {id: Number(p.media_id), title: p.title, filename: p.filename, thumbnail: p.thumbnail, media_type: p.media_type, date_text: p.date_text, document_reference: p.document_reference, transcription: p.transcription, description: p.description})) : [asMedia(d)];
            A().openLightbox(list, Math.max(0, list.findIndex(m => Number(m.id) === Number(d.id))), true); return; }
        if (b.matches('[data-ong-edit]')) { if (kiosk()) return; return editInline(d); } // ✎ sur place (la visionneuse : « ⋯ → 🖼 Ouvrir dans la visionneuse »)
        if (b.matches('[data-ong-cite]')) { b.closest('details')?.removeAttribute('open'); return copyCitation(d); }
        if (b.matches('[data-ong-sbs-open]')) { const sec = page.querySelector('[data-ong-sbs]'); if (!sec) return; sec.hidden = !sec.hidden; writePref({sbs: !sec.hidden}); b.setAttribute('aria-pressed', String(!sec.hidden)); if (!sec.hidden) { bindSbs(sec); sec.scrollIntoView({block: 'nearest'}); } return; }
        if (b.matches('[data-ong-del]')) { b.closest('details')?.removeAttribute('open'); if (kiosk()) return; return deleteMany([d.id]); } // R7 : tout de suite, « ↶ Annuler »
        if (b.matches('[data-ong-edit-viewer]')) {
            b.closest('details')?.removeAttribute('open');
            if (!d.filename) return A().toast('Ce document n’a pas de fichier : modifie-le depuis la fiche à laquelle il est rattaché.', 'error');
            A().openLightbox([asMedia(d)], 0, kiosk());
            const lb = document.getElementById('lightbox');
            lb?.addEventListener('close', async () => { cache.delete(d.id); await load(true); if (A().state?.module === 'documents') { paintList(); if (cur === d.id) showDoc(d.id); } }, {once: true});
            return;
        }
        if (b.matches('[data-ong-tx], [data-ong-txopen], [data-ong-txlink]')) { // (data-ong-txlink : un nom pas encore relié, 🔗) // 📜 l'outil de transcription complet : la transcription déjà commencée sur cette image, sinon une nouvelle
            if (!d.filename) return A().toast(T('Ce document n’a pas d’image : l’Atelier de transcription a besoin d’une image.'), 'error');
            if (!ext.openActTranscriber) return A().toast(T('L’Atelier de transcription n’est pas encore chargé : réessaie dans un instant.'), 'error');
            if (b.disabled) return; b.disabled = true; // un seul clic à la fois (le serveur peut mettre un instant à répondre)
            try {
                let acts = []; try { acts = (await A().api('act_transcriptions_media', {media_id: d.id})).items || []; } catch (_) { acts = []; }
                const again = async () => { cache.delete(d.id); await load(true); if (A().state?.module === 'documents') { paintList(); if (cur === d.id) showDoc(d.id); } };
                const aid = Number(b.dataset.ongTxopen || b.dataset.ongTxlink || 0);
                if (aid) await ext.openActTranscriber({id: aid, page: d.id, onClose: again});
                else if (acts.length) await ext.openActTranscriber({id: acts[0].id, page: d.id, onClose: again}); // 📑 une page d'un acte en plusieurs pages : l'Atelier s'ouvre sur elle
                else await ext.openActTranscriber({mediaId: d.id, filename: d.filename, title: d.title || '', text: d.transcription || '', onClose: again});
            } catch (err) { console.error(err); A().toast(T('L’Atelier de transcription n’a pas pu s’ouvrir : {x}', {x: String(err?.message || err).slice(0, 200)}), 'error'); }
            finally { b.disabled = false; }
            return;
        }
        if (b.matches('[data-ong-recadd]')) { ext.recueilDocs?.addTo([{...d, id: d.id || cur}], {onDone: afterRecueil}); return; }
        if (b.matches('[data-ong-dl]')) { if (!d.filename) return; const a = Object.assign(document.createElement('a'), {href: `media/${encodeURIComponent(d.filename)}`, download: d.filename}); document.body.appendChild(a); a.click(); a.remove(); return; }
        if (b.matches('[data-ong-print]')) { UI().printPage ? UI().printPage(d.title) : A().toast('L’impression n’est pas disponible.', 'error'); return; }
        if (b.matches('[data-ong-wp]')) {
            const html = String(d.transcription || '').split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
            const data = ext.textDocTools?.dataOf ? ext.textDocTools.dataOf(`<h1>${esc(d.title)}</h1>${html}`) : null;
            ext.openTextDoc?.(data ? {data, name: `Transcription — ${d.title}`} : {name: `Transcription — ${d.title}`});
        }
    });
    /* 🔄 un média ajouté ou changé, d'où qu'il vienne (fiche, visionneuse, menu de choix des médias, import, « 📥 À trier »,
       dossier Scans…) : l'événement commun lcnda:media-changed (assets/js/app-media-limits.js). Onglet ouvert : la liste se
       redessine tout de suite (sans recharger la page) ; sinon elle sera relue à la prochaine ouverture. */
    let refreshTimer = 0, refreshing = null;
    async function refreshNow() {
        if (refreshing) { stale = true; return; } // un envoi de plus pendant la relecture : une relecture de plus après
        refreshing = (async () => {
            if (loading) await loading; // une lecture partie avant le changement : on la laisse finir, puis on relit
            await load(true);
            if (A()?.state?.module !== 'documents') return;
            paintList(); paintWorkspaceList();
            const id = cur;
            if (id && document.querySelector(`#workspace [data-ong-page="document"][data-ong-id="${id}"]`)) {
                try { const d = (await A().api('onglets', {op: 'document', id})).document; if (d) cache.set(id, d); } catch (_) {}
                if (cur === id && A()?.state?.module === 'documents') showDoc(id);
            }
        })();
        try { await refreshing; } finally { refreshing = null; }
        if (stale && A()?.state?.module === 'documents') refreshNow();
    }
    document.addEventListener('lcnda:media-changed', () => {
        stale = true; cache.clear();
        if (A()?.state?.module !== 'documents') return;
        clearTimeout(refreshTimer); refreshTimer = setTimeout(refreshNow, 250);
    });
    // un document rangé ou sorti d'un dossier (📁 Ranger) : la colonne est redessinée par app-side-folders.js ; le chemin en haut de la fiche suit
    window.addEventListener('storage', e => { if (e.key === 'genealogie-side-folders' && A()?.state?.module === 'documents' && cur) showDoc(cur); });

    ext.onglets = ext.onglets || {};
    ext.onglets.documents = {sidebar, render, hash: () => { const m = location.hash.match(/^#documents(?:\/(\d{1,12}))?\/?$/); if (m) cur = Number(m[1] || 0); return cur ? hashFor(cur) : '#documents'; },
        reload: async () => { cache.clear(); await load(true); }, sortOf, select};
    // l'app a pu ouvrir l'onglet avant que ce fichier soit chargé (adresse « #documents » au démarrage) : on dessine maintenant
    const late = () => { const st = A()?.state; if (st?.module !== 'documents') return; if (document.querySelector('#workspace .loading-screen')) render(); if (!document.querySelector('#sidebar-content [data-ong-side="documents"]')) A().renderSidebar?.(); };
    if (document.readyState === 'complete') setTimeout(late, 0); else addEventListener('load', () => setTimeout(late, 0), {once: true});
})();
