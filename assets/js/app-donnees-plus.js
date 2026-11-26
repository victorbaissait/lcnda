/* LCNDA — 📊 Les données, en plus : les 21 ajouts de l'espace Données, et ce qui les rend modulables
 * (maquette validée docs/design/donnees-plus.html, décisions du 2026-11-26 : toutes les recommandations).
 *
 *  A. Modulable
 *   · « ⚙ Organiser le récap » (même fenêtre que « ⚙️ Organiser la fiche » d'un village, fiche-village-organiser.css) : 9 blocs
 *     ⭐ 🕘 🆕 💾 👪 🕳 ✅ 💽 🧰 — montrer / cacher, ⠿ glisser, ↑ ↓, Alt + flèches, Compacte / Normale, « ↺ Remettre comme au départ », ↶.
 *     Au départ : ⭐ 🕘 🆕 💾 seulement quand ils ont un contenu, 🕳 en compact, 💽 caché ; un bloc vide ne prend aucune place.
 *     Tout éteint et rangé comme au départ : le récap validé, tel quel (rien n'est déplacé).
 *   · Réglages → 📊 Données : les 21 ajouts en 5 groupes, un interrupteur chacun, une ligne pour dire à quoi il sert, ses petits
 *     réglages seulement quand il est allumé, « Tout allumer / Tout éteindre » par groupe, ↶ ; 📜 Crédits toujours là.
 *     Allumés au départ : 1 2 3 4 5 6 9 13 14 15 19 20 ; les 9 autres se proposent une fois dans ✅ À faire.
 *  B. Ici : ⭐ favoris (1), 🕘 récents (2), 🆕 nouveau depuis ta visite (3), 💾 questions gardées (4), 📊 la pastille des fiches et le récap
 *     filtré sur une personne ou un lieu (5), 👤 « Pour… » dans toutes les listes (6, un critère du moteur : la période porte son texte),
 *     🕳 (9, le bloc), 📝 notes (10, serveur : lib/donnees_plus.php), ➕ lignes ajoutées (11, ici), ⚠️ douteuses (12, ici),
 *     🔎 marques de confiance (13), 📶 « marche sans Internet » (20). Les outils (7 8 9 14 15 16 17 18 19 21) : app-donnees-plus-outils.js.
 *  Vie privée : rien sur une personne vivante ou confidentielle ne sort (ld_famille ne les donne pas ; en consultation, pas les vivants) ;
 *  en consultation et pour les invités du réseau local : tout se lit, rien ne s'écrit, 📝 ✋ ⚠️ ne se montrent pas, les réglages ne s'ouvrent pas.
 *  Rapide : la pastille est comptée à l'ouverture d'une fiche, pendant les temps morts, et gardée un jour ; jamais tout contre tout
 *  (une ligne regarde les quelques lieux de la personne, ou les cases d'un degré des lieux de la famille).
 *  Réglages (clés « genealogie-… ») : genealogie-donnees-plus {on, opt}, genealogie-donnees-recap-blocs {order, hidden, size},
 *    genealogie-donnees-favoris, genealogie-donnees-recents, genealogie-donnees-ouvertes, genealogie-donnees-questions,
 *    genealogie-donnees-lignes, genealogie-donnees-douteuses, genealogie-donnees-plus-offre ; ↶ Annuler par A().undoToast.
 *  API : LCNDA_EXT.donneesPlus = {on, opt, setFeat, FEATS, listBar, rowsPainted, collect, candLists, focus, openOrganiser, offline, …} ;
 *        LCNDA_EXT.dataPlus = {recap(page, body), answer(page, ST)} (appelés par app-donnees-accueil.js).
 *  Essai : tests/test-donnees-plus.js
 */
(() => {
    'use strict';
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const E = () => ext.dataListsEngine || {};
    const H = () => ext.dataHome || {};
    const TH = () => ext.listesThemes || null;
    const LF = () => ext.listesFamille || null;
    const CH = () => ext.listesChoix || null;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'");
    const lang = () => (window.LCNDA_I18N?.lang || document.documentElement.lang || 'fr');
    const loc = () => (lang() === 'fr' ? 'fr-FR' : lang());
    const nf = n => Number(n || 0).toLocaleString(loc());
    const toast = (m, k) => A().toast?.(m, k);
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    const ro = () => kiosk() || !!window.LCNDA_GUEST;
    const api = (a, q = {}) => A().api(a, q);
    const post = async (a, body = {}) => { const r = await A().api(a, {}, {method: 'POST', body}); return r && typeof r === 'object' && r.result && typeof r.result === 'object' ? r.result : r; };
    const readLS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
    const writeLS = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, String(v)); } catch (_) {} };
    const readJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } };
    const writeJ = (k, v) => writeLS(k, v == null ? null : JSON.stringify(v));
    const undoable = (msg, keys, after) => { const snap = keys.map(k => [k, readLS(k, null)]); return () => { const now = keys.map(k => [k, readLS(k, null)]); const put = s => { s.forEach(([k, v]) => writeLS(k, v)); after?.(); };
        if (A().undoToast) A().undoToast(msg, {undo: () => put(snap), redo: () => put(now)}); else toast(msg); }; };
    const idle = fn => (window.requestIdleCallback ? requestIdleCallback(() => fn(), {timeout: 1500}) : setTimeout(fn, 60));
    const fmtDay = ms => { try { return new Date(ms).toLocaleDateString(loc(), {day: 'numeric', month: 'short'}); } catch (_) { return ''; } };
    const ago = ms => { const d = Math.floor((Date.now() - ms) / 864e5), h = new Date(ms); if (d <= 0 && new Date().getDate() === h.getDate()) return T('aujourd’hui, {h}', {h: h.toLocaleTimeString(loc(), {hour: '2-digit', minute: '2-digit'})}); if (d <= 1) return T('hier'); return T('il y a {n} jours', {n: d}); };
    const K_FEAT = 'genealogie-donnees-plus', K_LAY = 'genealogie-donnees-recap-blocs', K_FAV = 'genealogie-donnees-favoris', K_REC = 'genealogie-donnees-recents', K_USED = 'genealogie-donnees-ouvertes',
        K_Q = 'genealogie-donnees-questions', K_MINE = 'genealogie-donnees-lignes', K_DOUBT = 'genealogie-donnees-douteuses', K_OFFER = 'genealogie-donnees-plus-offre', K_SEEN = 'lcnda-donnees-vu', K_PAST = 'lcnda-donnees-pastille';
    const SETTINGS_TAB = 'donnees_plus';

    /* ═════════════ A2. les 21 ajouts ═════════════ */
    const GROUPS = ['Retrouver vite', 'Relier à la famille', 'Ton travail', 'Partager', 'Entretien'];
    const seg = (k, lab, vals, labels) => ({k, type: 'seg', lab, vals, labels: labels || vals});
    const tog = (k, lab) => ({k, type: 'tog', lab}), chk = (k, lab) => ({k, type: 'chk', lab});
    const num = (k, lab, unit, min, max) => ({k, type: 'num', lab, unit, min, max});
    const FEATS = [
        {n: 1, g: 0, ic: '⭐', name: 'Favoris épinglés', why: 'Le ⭐ d’une liste la met en haut du récap, avec ses filtres.'},
        {n: 2, g: 0, ic: '🕘', name: 'Listes récentes', why: 'Les dernières listes ouvertes, rouvertes comme tu les as laissées.', opts: [seg('recentN', 'Combien', ['5', '10', '20'])]},
        {n: 3, g: 0, ic: '🆕', name: 'Nouveau depuis ta visite', why: 'Après une mise à jour, ce qui touche tes lieux et tes années.', opts: [tog('famOnly', 'seulement ce qui touche la famille')]},
        {n: 4, g: 0, ic: '💾', name: 'Questions gardées', why: 'Une question gardée se repose toute seule ; « nouvelle réponse » quand ça change.', opts: [seg('reask', 'Reposer', ['maj', 'semaine', 'mois', 'jamais'], ['à chaque mise à jour', 'chaque semaine', 'chaque mois', 'jamais'])]},
        {n: 5, g: 1, ic: '📊', name: 'Pastille sur les fiches', why: '« 📊 42 données la concernent » sur une fiche ; un clic filtre le récap.', opts: [tog('pPerson', 'fiche d’une personne'), tog('pPlace', 'fiche d’un lieu'), num('pMin', 'cachée sous', 'données', 1, 999)]},
        {n: 6, g: 1, ic: '👤', name: 'Filtrer par la vie d’une personne', why: 'Pendant sa vie, avant sa naissance, son enfance, sa jeunesse — dans toutes les listes.', opts: [num('childTo', 'Enfance jusqu’à', 'ans', 1, 30), num('youngTo', 'Jeunesse jusqu’à', 'ans', 2, 60)]},
        {n: 7, g: 1, ic: '⚖️', name: 'Comparer', why: 'Deux personnes ou deux lieux côte à côte, thème par thème.'},
        {n: 8, g: 1, ic: '🗺', name: 'Carte de tout, autour d’un lieu', why: 'Une couche par thème, à allumer ou éteindre.', opts: [num('radius', 'Rayon de départ', 'km', 1, 500)]},
        {n: 9, g: 1, ic: '🕳', name: 'Ce qui manque', why: 'Les lieux sans coordonnées et ce qu’ils feraient apparaître.', opts: [tog('births', 'aussi les années de naissance manquantes')]},
        {n: 10, g: 2, ic: '📝', name: 'Notes sur une ligne', why: 'Une note pour toi, qui suit la ligne même après une mise à jour.'},
        {n: 11, g: 2, ic: '➕', name: 'Ajouter une ligne', why: 'Une ligne qui manque, marquée « ajoutée par moi », avec ta source.', opts: [tog('propose', 'proposer Wikidata / OpenStreetMap')]},
        {n: 12, g: 2, ic: '⚠️', name: 'Marquer douteuse', why: 'Pour toi seul, avec un lien pour corriger à la source.', opts: [seg('doubtMode', 'Une ligne douteuse est', ['barree', 'cachee'], ['barrée', 'cachée'])]},
        {n: 13, g: 2, ic: '🔎', name: 'Marques de confiance', why: 'Petites marques sur les lignes dont il faut se méfier un peu.', opts: [chk('mLieu', '◌ placé par son lieu'), chk('mDate', '≈ date approximative'), chk('mOcr', '🤖 lu par une machine'), chk('mDiff', '⚖ sources en désaccord'), chk('mMine', '✋ ajoutée par moi')]},
        {n: 14, g: 3, ic: '📖', name: 'Citer une ligne', why: 'Source, licence et date de consultation, prêtes à copier.', opts: [seg('citeStyle', 'Style', ['s', 'i', 'c'], ['Simple', 'ISO 690', 'Chicago'])]},
        {n: 15, g: 3, ic: '📜', name: 'Crédits et licences', why: 'Toutes les sources et leurs licences, par thème.', lock: true},
        {n: 16, g: 3, ic: '📄', name: 'Livret « Le monde de mes ancêtres »', why: 'Pour une personne ou une branche, à imprimer ou en PDF.', opts: [seg('bookFormat', 'Format', ['A4', 'A5'])]},
        {n: 17, g: 3, ic: '🎞', name: 'Diaporama de sa vie', why: 'Année par année, ce que les données disent autour d’elle.', opts: [seg('speed', 'Vitesse', ['6000', '3500', '1800'], ['Lent', 'Normal', 'Vite'])]},
        {n: 18, g: 3, ic: '🔗', name: 'Partager sur le site familial', why: 'Une liste filtrée, avec un aperçu de ce qui part. Jamais les vivants.', opts: [seg('shareAud', 'Par défaut pour', ['membres', 'tous'], ['les membres', 'tout le monde']), tog('shareNotes', 'joindre mes notes')]},
        {n: 19, g: 4, ic: '💽', name: 'Place prise', why: 'La place de chaque pack, et ceux jamais ouverts qu’on peut retirer.', opts: [num('warnGo', 'Prévenir sous', 'Go libres', 0, 500)]},
        {n: 20, g: 4, ic: '📶', name: 'Badge « sans Internet »', why: 'Sur chaque liste : marche sans Internet, sauf les photos, ou pas.'},
        {n: 21, g: 4, ic: '🕰', name: 'Versions des packs', why: 'Revenir à la version gardée d’un pack, voir ce qui a changé.'}];
    const DEF_ON = new Set([1, 2, 3, 4, 5, 6, 9, 13, 14, 15, 19, 20]);
    const ODEF = {recentN: '5', famOnly: true, reask: 'maj', pPerson: true, pPlace: true, pMin: 5, childTo: 12, youngTo: 25, radius: 30, births: true, propose: true, doubtMode: 'barree',
        mLieu: true, mDate: true, mOcr: true, mDiff: true, mMine: true, citeStyle: 's', bookFormat: 'A4', speed: '3500', shareAud: 'membres', shareNotes: false, warnGo: 2};
    const cfg = () => { const v = readJ(K_FEAT, {}); return {on: v && typeof v.on === 'object' ? v.on : {}, opt: v && typeof v.opt === 'object' ? v.opt : {}}; };
    const on = n => n === 15 || (cfg().on[n] != null ? !!cfg().on[n] : DEF_ON.has(n));
    const opt = k => { const v = cfg().opt[k]; return v != null ? v : ODEF[k]; };
    const featOf = n => FEATS.find(f => f.n === Number(n));
    const repaintAll = () => { rerenderRecap(); if (A().state?.module === 'maintenance' && A().state.maintenanceTab === SETTINGS_TAB) ext.maintenance[SETTINGS_TAB]?.(); };
    function setCfg(mut, msg) {
        if (ro()) return;
        const done = undoable(msg, [K_FEAT], repaintAll);
        const c = cfg(); mut(c); writeJ(K_FEAT, c);
        done(); repaintAll();
    }
    const setFeat = (n, v) => setCfg(c => { c.on[n] = !!v; }, T(v ? '« {f} » allumé' : '« {f} » éteint', {f: `${featOf(n).ic} ${T(featOf(n).name)}`}));
    const setOpt = (k, v) => setCfg(c => { c.opt[k] = v; }, T('Réglage enregistré.'));

    /* ═════════════ les listes : favoris, récents, ouvertes ═════════════ */
    const lists = () => (E().list?.() || []).filter(d => d && !d.link && E().shown?.(d) !== false);
    const listById = id => (E().list?.() || []).find(d => d.id === id) || null;
    const themeOfList = d => TH()?.themeOf?.(d) || '';
    const themeById = id => (TH()?.themes?.() || ext.dataListThemes || []).find(t => t.id === id) || null;
    const favs = () => (Array.isArray(readJ(K_FAV, [])) ? readJ(K_FAV, []) : []).filter(f => f && f.id);
    const recents = () => (Array.isArray(readJ(K_REC, [])) ? readJ(K_REC, []) : []).filter(f => f && f.id);
    const isFav = id => favs().some(f => f.id === id);
    const critLabel = (d, st) => { if (!st) return ''; const out = []; try { (st.crit || []).forEach(c => out.push(E().critText(d, c))); if (st.period) out.push(E().periodText(st.period)); if (st.near) out.push(E().nearText(st.near)); if (st.q) out.push(`« ${st.q} »`); } catch (_) {} return out.join(' · '); };
    function toggleFav(d, st, btn) {
        if (ro()) return;
        const on1 = isFav(d.id), done = undoable(T(on1 ? '{l} retiré des favoris' : '{l} ajouté aux favoris', {l: T(d.label)}), [K_FAV], () => paintStar(btn, d));
        const list = favs().filter(f => f.id !== d.id);
        if (!on1) list.unshift({id: d.id, at: Date.now(), st: st ? {crit: st.crit || [], period: st.period || null, near: st.near || null, q: st.q || '', chips: st.chips || []} : null});
        writeJ(K_FAV, list.slice(0, 60)); paintStar(btn, d); done();
    }
    const paintStar = (btn, d) => { if (!btn) return; const f = isFav(d.id); btn.setAttribute('aria-pressed', String(f)); btn.innerHTML = `<span aria-hidden="true">${f ? '⭐' : '☆'}</span> ${esc(T('Favori'))}`; btn.title = T(f ? 'Retirer des favoris' : 'Ajouter aux favoris (avec les filtres du moment)'); };
    function noteOpen(d) {
        if (kiosk()) return;
        const used = readJ(K_USED, {}) || {}; if (!used.__since) used.__since = Date.now(); used[d.id] = Date.now(); writeJ(K_USED, used); // __since : « jamais ouvert » ne veut rien dire avant quelques semaines d'usage
        const r = recents().filter(x => x.id !== d.id); r.unshift({id: d.id, at: Date.now()}); writeJ(K_REC, r.slice(0, 20));
    }
    function openList(id, st) { const d = listById(id); if (!d) return toast(T('Cette liste n’existe plus.'), 'error'); if (st) E().open?.(id, st); else E().openKey?.(E().keyOf(d)); }

    /* ═════════════ 📶 marche sans Internet ? ═════════════ */
    const PHOTO = /(img|image|photo|thumb|vignette|picture|visuel)/i;
    async function offline(d) {
        if (!d) return null;
        if (d.online || d.needsInternet) return {k: 'net', t: T('🌐 il faut Internet'), cls: 'is-grey'};
        if (!(await E().isInstalled?.(d))) return {k: 'dl', t: T('⤓ à installer'), cls: 'is-grey'};
        if ((d.fields || []).some(f => (f.type === 'url' || f.type === 'image') && PHOTO.test(`${f.key} ${f.label}`))) return {k: 'photo', t: T('📶 sauf photos'), cls: 'is-orange'};
        return {k: 'ok', t: T('📶 sans Internet'), cls: 'is-green'};
    }
    const badgeHtml = b => (b ? `<span class="ui-badge ${b.cls} dp-off" data-dp-off="${esc(b.k)}">${esc(b.t)}</span>` : '');

    /* ═════════════ les lignes autour d'une personne, d'un lieu (5, 7, 8, 16, 17) ═════════════ */
    /** les listes qui comptent : placées, datées, lues d'un coup ; par thème, ses listes réunies installées d'abord (sinon deux listes du thème) */
    let candP = null, candAt = 0;
    function candLists() {
        if (candP && Date.now() - candAt < 600000) return candP;
        candAt = Date.now();
        candP = (async () => {
            const I = TH()?.index?.(), out = [], src = new Set();
            (ext.listesReunies?.defs?.() || []).forEach(M => { try { (ext.listesReunies.sourcesOf?.(M) || []).forEach(x => src.add(x.list)); } catch (_) {} });
            for (const [tid, ds] of I?.by.entries() || []) {
                if (tid === 'aranger') continue;
                const ok = ds.filter(d => !d.link && d.geo && d.period && !d.query && typeof d.load === 'function');
                const inst = []; for (const d of ok) { if (await E().isInstalled?.(d)) inst.push(d); }
                const mg = inst.filter(d => d.merged);
                const plain = inst.filter(d => !d.merged && !(mg.length && (src.has(d.id) || d.merge))); // une source déjà dans une liste réunie installée ne compte pas deux fois
                plain.sort((a, b) => (b.familyColumn ? 1 : 0) - (a.familyColumn ? 1 : 0)); // celles faites pour « Dans la famille » d'abord
                [...mg.slice(0, 2), ...plain.slice(0, 5)].forEach(d => out.push({d, theme: tid}));
            }
            return out;
        })().catch(() => { candP = null; return []; });
        return candP;
    }
    const kmOf = theme => { try { return H().radiusOf ? H().radiusOf(theme) : 30; } catch (_) { return 30; } };
    const dist = (a, b, c, d) => (E().km ? E().km(a, b, c, d) : 0);
    /** {places:[{lat, lon}], from, to, km?(thème)} → [{d, r, theme, y, g, k (km), title}] ; jamais tout contre tout : chaque ligne regarde les quelques lieux */
    async function collect({places = [], from = null, to = null, km = null, themes = null} = {}) {
        const pl = places.filter(p => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)));
        if (!pl.length) return [];
        const out = [];
        for (const {d, theme} of await candLists()) {
            if (themes && !themes.includes(theme)) continue;
            let rows = []; try { rows = await E().loadAll(d); } catch (_) { continue; }
            const R = km ? km(theme) : kmOf(theme), dLat = R / 111;
            for (const r of rows) {
                const p = E().periodOf(d, r); if (!p) continue;
                if (from != null && p[1] < from) continue;
                if (to != null && p[0] > to) continue;
                const g = E().geoOf(d, r); if (!g) continue;
                let best = Infinity;
                for (const q of pl) { if (Math.abs(q.lat - g[0]) > dLat) continue; const k = dist(q.lat, q.lon, g[0], g[1]); if (k < best) best = k; }
                if (best > R) continue;
                out.push({d, r, theme, y: p[0], y2: p[1], g, k: Math.round(best * 10) / 10, title: H().titleOf ? H().titleOf(d, r) : String(r.name || '—')});
            }
        }
        return out;
    }
    const byTheme = rows => { const m = {}; rows.forEach(x => { m[x.theme] = (m[x.theme] || 0) + 1; }); return m; };

    /** une personne de l'arbre → {id, name, b, d, living, places} (jamais une fiche confidentielle ; un vivant pas en consultation) */
    const yr = s => { const m = String(s || '').match(/^(-?\d{1,4})/); return m ? Number(m[1]) : null; };
    async function personInfo(id) {
        const det = await api('person', {id}); const P = det?.person || {}, evs = det?.events || [];
        if (Number(P.is_private) === 1) throw new Error(T('Fiche confidentielle : rien n’est calculé pour elle.'));
        const living = P.living_status === 'living';
        if (living && kiosk()) throw new Error(T('Mode consultation : pas les personnes vivantes.'));
        const birth = evs.find(e => ['BIRT', 'BAPM', 'CHR'].includes(e.gedcom_tag) && (e.year || e.sort_date)), death = evs.find(e => ['DEAT', 'BURI'].includes(e.gedcom_tag) && e.year);
        const b = birth ? Number(birth.year || yr(birth.sort_date)) : null, dd = death ? Number(death.year) : null;
        const seen = new Set(), places = [];
        evs.forEach(e => { if (e.latitude == null || e.longitude == null || !e.place_name) return; const k = `${e.latitude},${e.longitude}`; if (seen.has(k)) return; seen.add(k); places.push({lat: Number(e.latitude), lon: Number(e.longitude), name: String(e.place_name)}); });
        const name = `${P.first_name || ''} ${String(P.last_name || '').toUpperCase()}`.trim() || T('(sans nom)');
        return {id: Number(id), name, b, d: dd, living, places, end: dd || (b ? Math.min(new Date().getFullYear(), b + 90) : null), evs, parents: (det?.parents || []).map(x => Number(x.id)).filter(Boolean)};
    }

    /* ═════════════ 👤 filtrer par la vie d'une personne (6) ═════════════ */
    const MOMENTS = [['life', 'Pendant sa vie'], ['before', 'Avant sa naissance'], ['child', 'Enfance (0–{n})'], ['young', 'Jeunesse ({a}–{n})']];
    function lifeRange(p, m) {
        if (!p?.b) return null;
        const c = Number(opt('childTo')) || 12, y = Math.max(c + 1, Number(opt('youngTo')) || 25);
        if (m === 'before') return [p.b - 100, p.b - 1];
        if (m === 'child') return [p.b, p.b + c];
        if (m === 'young') return [p.b + c + 1, p.b + y];
        return [p.b, p.end || p.b + 90];
    }
    const momentText = m => { const c = Number(opt('childTo')) || 12, y = Math.max(c + 1, Number(opt('youngTo')) || 25); const x = MOMENTS.find(z => z[0] === m) || MOMENTS[0]; return T(x[1], {n: m === 'young' ? y : c, a: c + 1}); };
    async function pickPerson(anchorHost, onPick) {
        const box = document.createElement('div'); box.className = 'dp-pop'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', T('Pour qui ?'));
        box.innerHTML = `<label class="dp-fld"><span>${esc(T('Une personne de l’arbre'))}</span><input type="search" data-dp-pq placeholder="${esc(T('Prénom NOM'))}" autocomplete="off"></label><ul class="dp-pres" data-dp-pres></ul><div class="dp-pop-act"><button type="button" class="button small secondary" data-dp-px>${esc(T('Fermer'))}</button></div>`;
        anchorHost.appendChild(box);
        const inp = box.querySelector('[data-dp-pq]'), res = box.querySelector('[data-dp-pres]'); let tq = 0, my = 0;
        const close = () => { box.remove(); };
        inp.addEventListener('input', () => { clearTimeout(tq); tq = setTimeout(async () => { const q = inp.value.trim(), n = ++my; if (q.length < 2) { res.innerHTML = ''; return; }
            const r = await api('picker_search', {kind: 'person', q, limit: 8}).catch(() => ({})); if (n !== my) return;
            const its = (r.groups || []).flatMap(g => g.items || []).filter(x => x.id).slice(0, 8);
            res.innerHTML = its.length ? its.map(x => `<li><button type="button" class="dp-pick" data-dp-pid="${Number(x.id)}">👤 ${esc(x.title || x.name || '')}</button></li>`).join('') : `<li class="muted">${esc(T('Personne de ce nom dans ton arbre.'))}</li>`; }, 200); });
        box.addEventListener('click', async e => { if (e.target.closest('[data-dp-px]')) return close(); const b = e.target.closest('[data-dp-pid]'); if (!b) return;
            try { const p = await personInfo(Number(b.dataset.dpPid)); close(); onPick(p); } catch (x) { toast(x.message, 'error'); } });
        box.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
        inp.focus();
    }
    function lifeBar(page, pg) {
        const d = pg.base || pg.d; if (!d?.period || page.querySelector('[data-dp-for]')) return;
        const row = page.querySelector('.ld-bar-row'); if (!row) return;
        const b = document.createElement('button'); b.type = 'button'; b.className = 'ui-listbar-btn'; b.dataset.dpFor = ''; b.setAttribute('aria-haspopup', 'true'); b.textContent = `👤 ${T('Pour…')}`;
        b.title = T('Pendant la vie d’une personne, avant sa naissance, son enfance, sa jeunesse');
        const cols = row.querySelector('[data-ld-cols]'); if (cols) cols.before(b); else row.appendChild(b);
        const host = document.createElement('div'); host.className = 'dp-for-host'; row.after(host);
        b.addEventListener('click', () => {
            if (host.firstChild) { host.innerHTML = ''; return; }
            pickPerson(host, p => {
                if (!p.b) return toast(T('{p} n’a pas d’année de naissance : impossible de situer sa vie.', {p: p.name}), 'error');
                const wrap = document.createElement('div'); wrap.className = 'dp-pop'; host.appendChild(wrap);
                wrap.innerHTML = `<b>👤 ${esc(p.name)} (${p.b}–${p.d || '…'})</b><span class="segmented dp-seg" role="group" aria-label="${esc(T('Moment de sa vie'))}">${MOMENTS.map(([k]) => `<button type="button" data-dp-mom="${k}" aria-pressed="false">${esc(momentText(k))}</button>`).join('')}</span><div class="dp-pop-act"><button type="button" class="button small secondary" data-dp-px>${esc(T('Fermer'))}</button></div>`;
                wrap.addEventListener('click', e => {
                    if (e.target.closest('[data-dp-px]')) { host.innerHTML = ''; return; }
                    const m = e.target.closest('[data-dp-mom]'); if (!m) return;
                    const r = lifeRange(p, m.dataset.dpMom), st = pg.state();
                    st.period = {from: r[0], to: r[1], mode: 'overlap', label: `👤 ${p.name} · ${momentText(m.dataset.dpMom).toLowerCase()}, ${r[0]}–${r[1]}`, pid: p.id, pb: p.b, pname: p.name};
                    host.innerHTML = ''; pg.rerun();
                });
                wrap.querySelector('[data-dp-mom]')?.focus();
            });
        });
    }

    /* ═════════════ 🔎 marques de confiance (13) ═════════════ */
    const APPROX = /(\bvers\b|\bcirca\b|\bca\.|~|≈|\benviron\b|\?|\bavant\b|\baprès\b|\bapres\b|\bentre\b|\bdébut\b|\bfin\b|\bmilieu\b|années \d|s\b(?=$))/i;
    const OCR = /(ocr|socface|gallica|retronews|transcription automatique|lu par une machine|reconnaissance de caract)/i;
    function marks(d, r) {
        const out = [];
        if (opt('mLieu') && d.geo) { const g = E().geoOf?.(d, r); if (g) { const has = Object.values(r).some(v => (typeof v === 'number' || (typeof v === 'string' && /^-?\d+\.\d+$/.test(v))) && Math.abs(Number(v) - g[0]) < 1e-6) || Object.values(r).some(v => Array.isArray(v) && v.some(x => Math.abs(Number(x) - g[0]) < 1e-6)); if (!has || r._placedBy) out.push(['lieu', '◌', T('placé par son lieu'), T('Placé par son lieu, pas par des coordonnées')]); } }
        if (opt('mDate')) { const dk = (d.fields || []).filter(f => f.type === 'date' || f.type === 'year' || /date|annee|year|quand/i.test(f.key)).map(f => r[f.key]).filter(v => v != null && v !== ''); if (r.approx || r.circa || dk.some(v => typeof v === 'string' && APPROX.test(v))) out.push(['date', '≈', T('date approximative'), T('La date n’est pas sûre au jour près')]); }
        if (opt('mOcr') && (r.ocr || OCR.test(`${d.source || ''} ${(d.fields || []).map(f => f.key).join(' ')}`))) out.push(['ocr', '🤖', T('texte lu par une machine'), T('Texte reconnu par une machine dans un document scanné : il peut y avoir des erreurs')]);
        if (opt('mDiff') && r._diff) out.push(['diff', '⚖', T('sources en désaccord'), T('Les sources ne donnent pas la même chose')]);
        return out;
    }
    const markHtml = ([k, ic, lab, tip], cls = '') => `<span class="dp-cm${cls}" data-dp-mark="${k}" title="${esc(tip || lab)}">${esc(ic)} ${esc(lab)}</span>`;
    const legendHtml = () => `<div class="dp-legend" data-dp-legend aria-label="${esc(T('Légende des marques'))}"><b>${esc(T('Marques :'))}</b>${[opt('mLieu') ? ['lieu', '◌', T('placé par son lieu')] : null, opt('mDate') ? ['date', '≈', T('date approximative')] : null, opt('mOcr') ? ['ocr', '🤖', T('texte lu par une machine')] : null, opt('mDiff') ? ['diff', '⚖', T('sources en désaccord')] : null].filter(Boolean).map(m => markHtml(m)).join('')}${!kiosk() && on(11) && opt('mMine') ? markHtml(['mine', '✋', T('ajoutée par moi')], ' is-mine') : ''}${!kiosk() && on(12) ? markHtml(['doubt', '⚠️', T('douteuse pour moi')], ' is-doubt') : ''}<span>${esc(T('« — » : rien à signaler'))}</span></div>`;

    /* ═════════════ 📝 notes (10), ⚠️ douteuses (12), ✋ lignes ajoutées (11) ═════════════ */
    const NOTES = new Map(); // id de liste → {clé: {note}}
    async function loadNotes(id) { if (kiosk() || !on(10)) return {}; try { const r = await api('dplus_notes', {list: id}); NOTES.set(id, r.notes || {}); } catch (_) { NOTES.set(id, {}); } return NOTES.get(id); }
    const doubts = () => readJ(K_DOUBT, {}) || {};
    const dkey = (id, k) => `${id}|${k}`;
    const mine = id => { const m = readJ(K_MINE, {}) || {}; return Array.isArray(m[id]) ? m[id] : []; };
    const rkey = (d, r) => { try { return CH()?.rowKey ? CH().rowKey(d, r) : String(r.id ?? JSON.stringify(r)).slice(0, 500); } catch (_) { return ''; } };
    const srcUrlOf = (d, r) => { const u = (d.fields || []).filter(f => f.type === 'url' && r[f.key]).map(f => String(r[f.key])); const wd = u.find(x => /wikidata\.org/.test(x)); const q = qidOf(r); return wd || (q ? `https://www.wikidata.org/wiki/${q}` : u[0] || d.sourceUrl || ''); };
    const qidOf = r => { for (const v of [r.qid, r.wikidata, r.wd, r.q]) { const m = String(v ?? '').match(/\bQ\d{1,10}\b/); if (m) return m[0]; } for (const v of Object.values(r)) { const m = typeof v === 'string' && v.match(/wikidata\.org\/(?:wiki|entity)\/(Q\d{1,10})/); if (m) return m[1]; } return ''; };
    function noteDialog(d, r, onDone) {
        if (ro()) return;
        const id = (d._base || d).id, k = rkey(d, r), cur = NOTES.get(id)?.[k]?.note || '', title = H().titleOf ? H().titleOf(d, r) : '';
        ext.openDialog({eyebrow: T('Ma note sur cette ligne'), title: `📝 ${title}`, submitLabel: T('💾 Enregistrer'), body: `<label class="dp-fld"><span>${esc(T('Note (pour moi)'))}</span><textarea name="note" rows="4" maxlength="4000">${esc(cur)}</textarea></label><p class="muted small">${esc(T('La note suit la ligne, même après une mise à jour du pack. Elle ne part pas dans un partage, sauf si tu le choisis.'))}</p>`,
            onOpen: dl => dl.querySelector('textarea')?.focus(),
            onSubmit: async f => {
                const note = f.elements.note.value.trim();
                const res = await post('dplus_note', {list: id, key: k, title, note});
                const put = async v => { await post('dplus_note', {list: id, key: k, title, note: v}); await loadNotes(id); onDone?.(); };
                await loadNotes(id); onDone?.();
                if (A().undoToast) A().undoToast(note ? T('📝 Note enregistrée') : T('📝 Note retirée'), {undo: () => put(res.before || ''), redo: () => put(note)});
            }});
    }
    function doubtDialog(d, r, onDone) {
        if (ro()) return;
        const id = (d._base || d).id, k = rkey(d, r), all = doubts(), cur = all[dkey(id, k)], url = srcUrlOf(d, r);
        const save = (v, msg) => { const done = undoable(msg, [K_DOUBT], onDone); const a = doubts(); if (v) a[dkey(id, k)] = v; else delete a[dkey(id, k)]; writeJ(K_DOUBT, a); onDone?.(); done(); };
        ext.openDialog({eyebrow: T('Pour moi seul'), title: `⚠️ ${H().titleOf ? H().titleOf(d, r) : ''}`, submitLabel: cur ? T('Enregistrer') : T('⚠️ Douteuse pour moi'),
            body: `<label class="dp-fld"><span>${esc(T('Pourquoi'))}</span><input name="why" maxlength="300" value="${esc(cur?.why || '')}" placeholder="${esc(T('la date varie selon les sources'))}"></label>
                ${url && /^https?:/.test(url) ? `<p><a class="srca dp-srca" href="${esc(A().safeUrl ? A().safeUrl(url) : url)}" target="_blank" rel="noopener noreferrer">${esc(T('Corriger à la source ↗'))}</a></p>` : ''}
                ${cur ? `<p><button type="button" class="button small secondary" data-dp-undoubt>↶ ${esc(T('N’est plus douteuse'))}</button></p>` : ''}<p class="muted small">${esc(T('Change seulement ton affichage : barrée (par défaut) ou cachée, dans Réglages → 📊 Données.'))}</p>`,
            onOpen: dl => { dl.querySelector('[data-dp-undoubt]')?.addEventListener('click', () => { save(null, T('La ligne n’est plus douteuse')); dl.close(); }); dl.querySelector('input')?.focus(); },
            onSubmit: f => save({why: f.elements.why.value.trim(), at: Date.now(), t: H().titleOf ? H().titleOf(d, r) : ''}, T('⚠️ Ligne marquée douteuse'))});
    }
    function addRowDialog(d, row0, onDone) {
        if (ro()) return;
        const id = (d._base || d).id;
        ext.openDialog({eyebrow: T('Ajouter une ligne qui manque'), title: `➕ ${T(d.label)}`, submitLabel: row0 ? T('Enregistrer') : T('＋ Ajouter'),
            body: `<label class="dp-fld"><span>${esc(T('Quoi'))}</span><input name="what" required maxlength="200" value="${esc(row0?.what || '')}"></label>
                <div class="dp-two"><label class="dp-fld"><span>${esc(T('Quand (année)'))}</span><input name="when" maxlength="40" value="${esc(row0?.when || '')}" placeholder="1887, mars 1887 (≈)"></label><label class="dp-fld"><span>${esc(T('Où'))}</span><input name="where" maxlength="120" value="${esc(row0?.where || '')}"></label></div>
                <label class="dp-fld"><span>${esc(T('D’où je le sais'))}</span><input name="src" maxlength="300" value="${esc(row0?.src || '')}"></label>
                <p class="muted small">${esc(T('Marquée ✋ « ajoutée par moi ». Gardée sur cet ordinateur, jamais envoyée à la source.'))}</p>`,
            onSubmit: async f => {
                const v = {id: row0?.id || `m${Date.now().toString(36)}`, what: f.elements.what.value.trim(), when: f.elements.when.value.trim(), where: f.elements.where.value.trim(), src: f.elements.src.value.trim(), at: Date.now()};
                if (!v.what) return UI().fail ? UI().fail(f.elements.what, T('Écris ce qui manque.')) : false;
                v.y = yr(v.when.replace(/^\D+/, '')); v.approx = /≈|\?|vers|environ|circa/i.test(v.when);
                if (v.where) { try { const r = await api('picker_search', {kind: 'place', q: v.where, limit: 5}); const it = (r.groups || []).flatMap(g => g.items || []).find(x => x.lat != null && x.lon != null); if (it) { v.lat = Number(it.lat); v.lon = Number(it.lon); } } catch (_) {} }
                const done = undoable(row0 ? T('✋ Ligne modifiée') : T('✋ Ligne ajoutée : {t}', {t: v.what}), [K_MINE], onDone);
                const m = readJ(K_MINE, {}) || {}; const l = Array.isArray(m[id]) ? m[id] : []; m[id] = row0 ? l.map(x => (x.id === row0.id ? v : x)) : [...l, v];
                writeJ(K_MINE, m); onDone?.(); done();
            }});
    }
    function delMine(d, mid, onDone) { const id = (d._base || d).id, done = undoable(T('✋ Ligne retirée'), [K_MINE], onDone); const m = readJ(K_MINE, {}) || {}; m[id] = (m[id] || []).filter(x => x.id !== mid); if (!m[id].length) delete m[id]; writeJ(K_MINE, m); onDone?.(); done(); }

    /* ═════════════ la page d'une liste (moteur commun : app-listes-donnees.js) ═════════════ */
    function listBar(page, pg) {
        const d = pg.base || pg.d; if (!page || !d) return;
        noteOpen(d);
        const h2 = page.querySelector('.page-header h2'); // ⭐ à côté du titre (l'en-tête garde ses 2 boutons + ⋯ + ⭐ des raccourcis)
        if (on(1) && !ro() && h2 && !page.querySelector('[data-dp-star]')) {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'dp-star'; b.dataset.dpStar = '';
            h2.appendChild(b); paintStar(b, d); b.addEventListener('click', () => toggleFav(d, pg.state(), b));
        }
        if (on(20)) offline(d).then(b => { if (!b || !page.isConnected || page.querySelector('[data-dp-off]')) return; const h = page.querySelector('.page-header h2'); h?.insertAdjacentHTML('beforeend', ` ${badgeHtml(b)}`); });
        if (on(6)) lifeBar(page, pg);
        if (on(11) && !ro() && !page.querySelector('[data-dp-addrow]')) {
            const row = page.querySelector('.ld-bar-row'); const b = document.createElement('button'); b.type = 'button'; b.className = 'ui-listbar-btn'; b.dataset.dpAddrow = ''; b.textContent = `➕ ${T('Ajouter une ligne')}`;
            row?.appendChild(b); b.addEventListener('click', () => addRowDialog(d, null, () => pg.refresh()));
        }
        // le bas de la liste : 📜 Crédits et licences (toujours là), ⚖️ / 🗺 / 🔗 quand ils sont allumés
        if (!page.querySelector('[data-dp-foot]')) {
            const f = document.createElement('p'); f.className = 'dp-listfoot muted'; f.dataset.dpFoot = '';
            f.innerHTML = [`<button type="button" class="dr-link" data-dp-credits>📜 ${esc(T('Crédits et licences'))}</button>`,
                on(18) && !ro() && !window.LCNDA_GUEST ? `<button type="button" class="dr-link" data-dp-share>🔗 ${esc(T('Partager sur le site familial'))}</button>` : '',
                on(8) && d.geo ? `<button type="button" class="dr-link" data-dp-around-list>🗺 ${esc(T('Tout autour d’un lieu'))}</button>` : ''].filter(Boolean).join(' · ');
            page.appendChild(f);
            f.addEventListener('click', e => {
                if (e.target.closest('[data-dp-credits]')) return ext.donneesPlusOutils?.credits?.();
                if (e.target.closest('[data-dp-share]')) return ext.donneesPlusOutils?.share?.(pg);
                if (e.target.closest('[data-dp-around-list]')) { const st = pg.state(); return ext.donneesPlusOutils?.around?.(st.near ? {lat: st.near.lat, lon: st.near.lon, name: st.near.title} : null); }
            });
        }
        if (!page.__dp) {
            page.__dp = true;
            page.addEventListener('click', e => {
                const b = e.target.closest('[data-dp-act]'); if (!b) return;
                const i = Number(b.dataset.dpRow), rows = pg.rows(), r = rows[i], dd = pg.d;
                const repaint = () => pg.refresh();
                if (b.dataset.dpAct === 'note' && r) return noteDialog(dd, r, () => paintRows(page, pg));
                if (b.dataset.dpAct === 'doubt' && r) return doubtDialog(dd, r, repaint);
                if (b.dataset.dpAct === 'cite' && r) return ext.donneesPlusOutils?.cite?.(dd, r);
                const mr = mine((dd._base || dd).id).find(x => x.id === b.dataset.dpMid);
                if (b.dataset.dpAct === 'mine-edit' && mr) return addRowDialog(dd, mr, repaint);
                if (b.dataset.dpAct === 'mine-del' && mr) return delMine(dd, mr.id, repaint);
            });
        }
        if (on(10) && !kiosk()) loadNotes(d.id).then(() => { if (page.isConnected) paintRows(page, pg); });
    }
    /** après chaque dessin du tableau : marques, 📝, ⚠️, 📖, l'âge (👤 Pour…), mes lignes ✋, la légende */
    function rowsPainted(res, rows, pg) { const page = res.closest('.ld-page'); if (page) paintRows(page, pg, res); }
    function paintRows(page, pg, res0) {
        const res = res0 || page.querySelector('[data-ld-results]'); if (!res) return;
        const d = pg.d, base = pg.base || d, rows = pg.rows(), st = pg.state(), kio = ro(), notes = NOTES.get(base.id) || {}, dbt = doubts(), hide = opt('doubtMode') === 'cachee';
        const table = res.querySelector('table.ld-table'); if (!table) return;
        res.querySelectorAll('[data-dp-x]').forEach(x => x.remove());
        table.querySelectorAll('tr.dp-doubt, tr.dp-hidden').forEach(tr => tr.classList.remove('dp-doubt', 'dp-hidden'));
        table.querySelectorAll('tbody tr[data-ld-row]').forEach(tr => {
            const i = Number(tr.dataset.ldRow), r = rows[i]; if (!r) return;
            const first = tr.querySelector('td:not(.ld-acts)'); if (!first) return;
            const k = rkey(d, r), bits = [];
            if (on(13)) marks(d, r).forEach(m => bits.push(markHtml(m)));
            const db = !kio && on(12) ? dbt[dkey(base.id, k)] : null;
            if (db) { bits.push(markHtml(['doubt', '⚠️', T('douteuse pour moi'), db.why || ''], ' is-doubt')); tr.classList.add(hide ? 'dp-hidden' : 'dp-doubt'); }
            if (st.period?.pb != null) { const p = E().periodOf?.(d, r); if (p) { const a = p[0] - st.period.pb; bits.push(`<span class="dp-age" data-dp-x>${esc(a < 0 ? T('{n} ans avant', {n: -a}) : T('{p} : {n} ans', {p: st.period.pname, n: a}))}</span>`); } }
            if (bits.length) first.insertAdjacentHTML('beforeend', `<span class="dp-conf" data-dp-x>${bits.join('')}</span>`);
            const nt = !kio && on(10) ? notes[k]?.note : '';
            if (nt) first.insertAdjacentHTML('beforeend', `<span class="dp-note-line" data-dp-x>📝 ${esc(nt)}</span>`);
            // 📖 📝 ⚠️ dans la première case : 📎 et 🧺 restent seuls au bout de chaque ligne (comme décidé)
            const btn = (act, ic, lab, pressed) => `<button type="button" class="dp-ib${pressed ? ' is-on' : ''}" data-dp-act="${act}" data-dp-row="${i}" title="${esc(lab)}" aria-label="${esc(lab)}"${pressed != null ? ` aria-pressed="${!!pressed}"` : ''}>${ic}</button>`;
            const add = [on(14) ? btn('cite', '📖', T('Citer cette ligne')) : '', !kio && on(10) ? btn('note', '📝', T('Ma note sur cette ligne'), !!nt) : '', !kio && on(12) ? btn('doubt', '⚠️', T('Marquer douteuse'), !!db) : ''].join('');
            if (add) first.insertAdjacentHTML('beforeend', `<span class="dp-ra" data-dp-x>${add}</span>`);
        });
        // ✋ mes lignes : à la fin de la première page, si elles passent la recherche et la période
        if (on(11) && !kio) {
            const q = fold(st.q || ''), cols = table.querySelector('thead tr')?.children.length || 3;
            const shown = mine(base.id).filter(m => (!q || fold(`${m.what} ${m.where} ${m.src}`).includes(q)) && (!st.period || m.y == null || (m.y >= Number(st.period.from) && m.y <= Number(st.period.mode === 'in' ? st.period.from : st.period.to))));
            const tb = table.querySelector('tbody');
            if (tb && shown.length && rows.length >= (pg.total?.() || 0)) shown.forEach(m => {
                tb.insertAdjacentHTML('beforeend', `<tr class="dp-mine" data-dp-x data-dp-mine="${esc(m.id)}"><td colspan="${Math.max(1, cols - 1)}"><b>${esc(m.what)}</b><small class="muted"> ${esc([m.when, m.where, m.src].filter(Boolean).join(' · '))}</small> <span class="dp-conf">${opt('mMine') ? markHtml(['mine', '✋', T('ajoutée par moi')], ' is-mine') : ''}${m.approx && opt('mDate') ? markHtml(['date', '≈', T('date approximative')]) : ''}</span>
                    ${opt('propose') ? `<span class="dp-prop"><a href="https://www.wikidata.org/wiki/Special:NewItem" target="_blank" rel="noopener noreferrer">${esc(T('proposer à Wikidata ↗'))}</a>${m.lat != null ? ` · <a href="https://www.openstreetmap.org/edit#map=17/${Number(m.lat)}/${Number(m.lon)}" target="_blank" rel="noopener noreferrer">${esc(T('à OpenStreetMap ↗'))}</a>` : ''}</span>` : ''}</td>
                    <td class="ld-acts"><button type="button" class="ld-act dp-ib" data-dp-act="mine-edit" data-dp-mid="${esc(m.id)}" title="${esc(T('Modifier'))}" aria-label="${esc(T('Modifier'))}">✎</button><button type="button" class="ld-act dp-ib" data-dp-act="mine-del" data-dp-mid="${esc(m.id)}" title="${esc(T('Supprimer'))}" aria-label="${esc(T('Supprimer'))}">🗑</button></td></tr>`);
            });
        }
        if (on(13) && !res.querySelector('[data-dp-legend]')) res.insertAdjacentHTML('beforeend', legendHtml().replace('data-dp-legend', 'data-dp-legend data-dp-x'));
    }

    /* ═════════════ A1. le récap : blocs, ⚙ Organiser le récap ═════════════ */
    const BLK = [['fav', '⭐ Mes favoris', 1], ['rec', '🕘 Récemment ouvertes', 2], ['new', '🆕 Nouveau depuis ta visite', 3], ['qs', '💾 Mes questions', 4], ['fam', '👪 Pour ta famille', 0],
        ['miss', '🕳 Ce qui manque', 9], ['todo', '✅ À faire', 0], ['disk', '💽 Place prise', 19], ['themes', '🧰 Les thèmes', 0]];
    const LDEF = {order: BLK.map(b => b[0]), hidden: ['disk'], size: {rec: 'c', qs: 'c', miss: 'c', todo: 'c', disk: 'c'}};
    const layout = () => { const v = readJ(K_LAY, null); if (!v || !Array.isArray(v.order)) return JSON.parse(JSON.stringify(LDEF)); const order = [...v.order.filter(k => BLK.some(b => b[0] === k)), ...LDEF.order.filter(k => !v.order.includes(k))]; return {order, hidden: Array.isArray(v.hidden) ? v.hidden : [], size: v.size && typeof v.size === 'object' ? v.size : {}}; };
    const blkDef = k => BLK.find(b => b[0] === k);
    const avail = k => { const f = blkDef(k)?.[2]; return !f || on(f); };
    const isDefaultLayout = l => JSON.stringify(l) === JSON.stringify(LDEF);
    function rerenderRecap() {
        const st = A().state; if (!st) return;
        const page = document.querySelector('#workspace [data-dr]'); if (!page || H().view?.() !== 'recap') return;
        if (st.module === 'listes' && st.listType === 'donnees') ext.lists?.donnees?.(++st.workspaceToken); else if (st.module === 'donnees') H().render?.(++st.workspaceToken);
    }
    const FOCUS = {cur: null};
    /** appelé par app-donnees-accueil.js après chaque dessin du récap */
    function recap(page, body) {
        if (!page || !body) return;
        const head = page.querySelector('.page-header .page-actions');
        if (head && !head.querySelector('[data-dp-org]')) {
            head.insertAdjacentHTML('beforeend', `<button type="button" class="button small secondary" data-dp-org>⚙ ${esc(T('Organiser le récap'))}</button>`);
            head.addEventListener('click', e => { if (e.target.closest('[data-dp-org]')) openOrganiser(); });
        }
        const fam = body.querySelector('.dr-fam'), todo = body.querySelector('.dr-todo'), rc = body.querySelector('.dr-rc');
        const th = [body.querySelector('.dr-trs-h'), body.querySelector('.dr-trs'), body.querySelector('.dr-trs-more'), body.querySelector('.dr-foot')].filter(Boolean);
        const foot = body.querySelector('[data-dr-foot]');
        if (foot && !body.querySelector('[data-dp-cred]')) {
            const s = document.createElement('p'); s.className = 'dr-foot muted dp-cred'; s.dataset.dpCred = '';
            s.innerHTML = [on(7) ? `<button type="button" class="dr-link" data-dp-cmp>⚖️ ${esc(T('Comparer'))}</button>` : '', on(8) ? `<button type="button" class="dr-link" data-dp-around>🗺 ${esc(T('Autour de…'))}</button>` : '', `<button type="button" class="dr-link" data-dp-credits>📜 ${esc(T('Crédits et licences'))}</button>`].filter(Boolean).join(' · ');
            foot.after(s); th.push(s);
            s.addEventListener('click', e => { if (e.target.closest('[data-dp-credits]')) ext.donneesPlusOutils?.credits?.(); if (e.target.closest('[data-dp-cmp]')) ext.donneesPlusOutils?.compare?.(); if (e.target.closest('[data-dp-around]')) ext.donneesPlusOutils?.around?.(null); });
        }
        if (FOCUS.cur) paintFocus(page, body);
        // les blocs (vides d'abord : ils se remplissent et se montrent quand ils ont un contenu)
        const l = layout(), blocks = {}, hasContent = {};
        const mk = (k, title, extra = '') => { const s = document.createElement('section'); s.className = 'dr-box dp-blk'; s.dataset.dpBlk = k; s.setAttribute('aria-label', T(title)); s.innerHTML = `<div class="dp-bh"><h3>${esc(T(title))}</h3>${extra}</div><div class="dp-bb" data-dp-bb></div>`; return s; };
        if (fam) { fam.dataset.dpBlk = 'fam'; blocks.fam = fam; hasContent.fam = true; }
        if (todo) { todo.dataset.dpBlk = 'todo'; blocks.todo = todo; hasContent.todo = true; }
        if (th.length) { const w = document.createElement('div'); w.className = 'dp-themes'; w.dataset.dpBlk = 'themes'; blocks.themes = w; hasContent.themes = true; th[0].before(w); th.forEach(x => w.appendChild(x)); }
        const ext1 = ['fav', 'rec', 'new', 'qs', 'miss', 'disk'].filter(k => avail(k) && !l.hidden.includes(k) && !(k === 'disk' && ro()) && !(k === 'miss' && ro()));
        ext1.forEach(k => { blocks[k] = mk(k, blkDef(k)[1]); blocks[k].hidden = true; });
        const grid = document.createElement('div'); grid.className = 'dp-grid'; grid.dataset.dpGrid = '';
        const place = () => {
            l.order.forEach(k => { const el = blocks[k]; if (!el) return; grid.appendChild(el); const hid = l.hidden.includes(k) || !avail(k) || !hasContent[k]; el.hidden = hid; el.classList.toggle('dp-c', (l.size[k] || 'n') === 'c'); el.classList.toggle('dp-n', (l.size[k] || 'n') !== 'c'); });
            const extras = ext1.some(k => hasContent[k]);
            grid.classList.toggle('dp-plain', !extras && isDefaultLayout(l));
        };
        (rc || th[0] || body.firstChild)?.before?.(grid);
        place(); rc?.remove();
        const fill = (k, html) => { const el = blocks[k]; if (!el || !page.isConnected) return; if (!html) { hasContent[k] = false; place(); return; } el.querySelector('[data-dp-bb]').innerHTML = html; hasContent[k] = true; place(); };
        // ⭐ 🕘
        if (blocks.fav) fillFav(blocks.fav, fill);
        if (blocks.rec) fill('rec', recHtml());
        if (blocks.qs) { fill('qs', qsHtml()); idle(() => reaskDue().then(ch => { if (ch && page.isConnected) fill('qs', qsHtml()); })); }
        if (blocks.new) idle(() => computeNew().then(items => fill('new', newHtml(items))).catch(() => fill('new', '')));
        if (blocks.miss) api('dplus_missing').then(r => fill('miss', missHtml(r))).catch(() => fill('miss', ''));
        if (blocks.disk) ext.donneesPlusOutils?.diskSummary?.().then(s => fill('disk', s ? `<ul class="dr-hl dp-hl"><li><span class="dr-hic" aria-hidden="true">💽</span><span><b>${esc(T('{s} de données', {s: s.total}))}</b>${s.never ? `<small>${esc(T('{n} packs jamais ouverts : {s}', {n: s.never, s: s.neverSize}))}</small>` : ''}${s.low ? `<small class="dp-warn">${esc(T('Moins de {g} Go libres sur le disque.', {g: opt('warnGo')}))}</small>` : ''}</span><button type="button" class="dr-link dr-go" data-dp-disk>${esc(T('faire de la place'))}</button></li></ul>` : '')).catch(() => fill('disk', ''));
        if (todo && !ro()) todoExtras(todo);
        if (!body.__dpb) {
            body.__dpb = true;
            body.addEventListener('click', e => onRecapClick(e, page, body));
            body.addEventListener('keydown', e => onFavKey(e, page));
            bindFavDrag(body);
        }
    }
    function onRecapClick(e, page, body) {
        const t = e.target; let b;
        if ((b = t.closest('[data-dp-open]'))) { const f = favs().find(x => x.id === b.dataset.dpOpen) || null; return openList(b.dataset.dpOpen, b.dataset.dpWith === 'fav' && f?.st ? f.st : null); }
        if ((b = t.closest('[data-dp-unfav]'))) { const id = b.dataset.dpUnfav, d = listById(id), done = undoable(T('{l} retiré des favoris', {l: T(d?.label || id)}), [K_FAV], rerenderRecap); writeJ(K_FAV, favs().filter(f => f.id !== id)); done(); return rerenderRecap(); }
        if (t.closest('[data-dp-forget]')) { const done = undoable(T('Récents oubliés'), [K_REC], rerenderRecap); writeJ(K_REC, []); done(); return rerenderRecap(); }
        if ((b = t.closest('[data-dp-ask]'))) return H().ask?.(b.dataset.dpAsk);
        if ((b = t.closest('[data-dp-unq]'))) { const q = b.dataset.dpUnq, done = undoable(T('Question oubliée'), [K_Q], rerenderRecap); writeJ(K_Q, savedQs().filter(x => x.q !== q)); done(); return rerenderRecap(); }
        if (t.closest('[data-dp-seen]')) { const done = undoable(T('Tout est vu'), [K_SEEN], rerenderRecap); markSeen(); done(); return rerenderRecap(); }
        if ((b = t.closest('[data-dp-newgo]'))) { const x = b.dataset.dpNewgo; if (x.startsWith('theme:')) { const k = TH()?.keyOf?.(x.slice(6)); if (k) E().openKey?.(k); return; } return openList(x); }
        if (t.closest('[data-dp-missgo]')) return ext.donneesPlusOutils?.missing?.();
        if (t.closest('[data-dp-disk]')) return ext.donneesPlusOutils?.disk?.();
        if (t.closest('[data-dp-offer]')) { writeLS(K_OFFER, '1'); return goSettings(); }
        if (t.closest('[data-dp-offer-x]')) { const done = undoable(T('Proposition rangée'), [K_OFFER], rerenderRecap); writeLS(K_OFFER, '1'); done(); return rerenderRecap(); }
        if (t.closest('[data-dp-unfocus]')) { FOCUS.cur = null; return rerenderRecap(); }
        if ((b = t.closest('[data-dp-ftheme]'))) return focusOpen(b.dataset.dpFtheme);
        void page; void body;
    }
    const goSettings = () => { const st = A().state; if (!st) return; st.maintenanceTab = SETTINGS_TAB; A().persistUiState?.(); A().setModule?.('maintenance'); };

    /* ⭐ Mes favoris : rangés en glissant ⠿ (ou Alt + flèches) */
    function fillFav(el, fill) {
        const f = favs().filter(x => listById(x.id)); if (!f.length) return fill('fav', '');
        fill('fav', `<ul class="dr-hl dp-hl" data-dp-favs>${f.map(x => { const d = listById(x.id), cl = critLabel(d, x.st);
            return `<li draggable="true" data-dp-fav="${esc(x.id)}"><span class="dr-hic" aria-hidden="true">${esc(d.icon || '📋')}</span><span><button type="button" class="dp-lnk" data-dp-open="${esc(x.id)}" data-dp-with="fav" title="${esc(T('Alt + flèches pour ranger'))}">${esc(T(d.label))}</button><small>${esc(cl || T(themeById(themeOfList(d))?.label || ''))}${on(20) ? ` <span data-dp-offb="${esc(x.id)}"></span>` : ''}</small></span><span class="dp-acts"><span class="dp-grip" aria-hidden="true" title="${esc(T('Glisser pour ranger'))}">⠿</span><button type="button" class="dp-x" data-dp-unfav="${esc(x.id)}" aria-label="${esc(T('Retirer des favoris'))}" title="${esc(T('Retirer des favoris'))}">×</button></span></li>`; }).join('')}</ul>`);
        if (on(20)) f.forEach(async x => { const b = await offline(listById(x.id)); const s = el.querySelector(`[data-dp-offb="${CSS.escape(x.id)}"]`); if (s && b) s.outerHTML = badgeHtml(b); });
    }
    function moveFav(id, to) { const l = favs(), i = l.findIndex(f => f.id === id); if (i < 0 || to < 0 || to >= l.length || to === i) return false; const done = undoable(T('Favoris rangés'), [K_FAV], rerenderRecap); const [x] = l.splice(i, 1); l.splice(to, 0, x); writeJ(K_FAV, l); done(); return true; }
    function onFavKey(e, page) {
        if (!e.altKey || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
        const li = e.target.closest('[data-dp-fav]'); if (!li) return; e.preventDefault();
        const id = li.dataset.dpFav, i = favs().findIndex(f => f.id === id);
        if (moveFav(id, i + (e.key === 'ArrowUp' ? -1 : 1))) { rerenderRecap(); setTimeout(() => document.querySelector(`[data-dp-fav="${CSS.escape(id)}"] [data-dp-open]`)?.focus(), 120); }
        void page;
    }
    function bindFavDrag(body) {
        let dk = '';
        body.addEventListener('dragstart', e => { const li = e.target.closest?.('[data-dp-fav]'); if (!li) return; dk = li.dataset.dpFav; li.classList.add('is-drag'); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dk); } catch (_) {} });
        body.addEventListener('dragover', e => { const li = e.target.closest?.('[data-dp-fav]'); if (!dk || !li) return; e.preventDefault(); });
        body.addEventListener('drop', e => { const li = e.target.closest?.('[data-dp-fav]'); if (!dk || !li) return; e.preventDefault(); const to = favs().findIndex(f => f.id === li.dataset.dpFav); if (moveFav(dk, to)) rerenderRecap(); dk = ''; });
        body.addEventListener('dragend', () => { dk = ''; body.querySelectorAll('.is-drag').forEach(x => x.classList.remove('is-drag')); });
    }
    function recHtml() {
        const n = Number(opt('recentN')) || 5, r = recents().filter(x => listById(x.id)).slice(0, n); if (!r.length) return '';
        return `<ul class="dr-hl dp-hl">${r.map(x => { const d = listById(x.id), cl = critLabel(d, E().stateOf?.(d.id, d)); return `<li><span class="dr-hic" aria-hidden="true">${esc(d.icon || '📋')}</span><span><b>${esc(T(d.label))}</b><small>${esc([ago(x.at), cl].filter(Boolean).join(' · '))}</small></span><button type="button" class="dr-link dr-go" data-dp-open="${esc(x.id)}">${esc(T('rouvrir'))}</button></li>`; }).join('')}</ul><p class="dr-note dp-more"><button type="button" class="dr-link" data-dp-forget>${esc(T('Oublier les récents'))}</button></p>`;
    }

    /* 💾 questions gardées (4) */
    const savedQs = () => (Array.isArray(readJ(K_Q, [])) ? readJ(K_Q, []) : []).filter(x => x && x.q);
    function qsHtml() {
        const l = savedQs(); if (!l.length) return '';
        return `<ul class="dr-hl dp-hl">${l.map(x => `<li><span class="dr-hic" aria-hidden="true">🔍</span><span><b>${esc(x.q)}</b> ${x.fresh ? `<span class="ui-badge is-blue">${esc(x.fresh > 1 ? T('{n} nouvelles réponses', {n: x.fresh}) : T('1 nouvelle réponse'))}</span>` : ''}<small>${esc(x.n > 1 ? T('{n} réponses', {n: nf(x.n)}) : x.n === 1 ? T('1 réponse') : T('aucune réponse'))}${x.checked ? ` · ${esc(T('vérifiée {d}', {d: ago(x.checked)}))}` : ''}</small></span><span class="dp-acts"><button type="button" class="dr-link dr-go" data-dp-ask="${esc(x.q)}">${esc(T('poser'))}</button><button type="button" class="dp-x" data-dp-unq="${esc(x.q)}" aria-label="${esc(T('Oublier cette question'))}" title="${esc(T('Oublier cette question'))}">×</button></span></li>`).join('')}</ul>`;
    }
    const packSig = async () => { try { const s = await ext.listesMaj?.status?.(); return (s?.packs || []).map(p => `${p.id}:${p.version}`).join('|').length + ':' + (s?.packs || []).reduce((n, p) => n + (Number(p.rows) || 0), 0); } catch (_) { return ''; } };
    /** reposer les questions dont c'est l'heure (sur ce navigateur, rien ne part sur Internet) */
    let reasking = false;
    async function reaskDue() {
        if (reasking || kiosk() || opt('reask') === 'jamais' || !ext.dataAsk) return false;
        reasking = true; let changed = false;
        try {
            const sig = await packSig(), l = savedQs(), every = {semaine: 7 * 864e5, mois: 30 * 864e5}[opt('reask')] || 0;
            for (const x of l) {
                const due = opt('reask') === 'maj' ? x.sig !== sig : Date.now() - (x.checked || 0) > every; if (!due) continue;
                try { const r = await ext.dataAsk(x.q); const n = Number(r.total) || 0; x.fresh = Math.max(x.fresh || 0, n - (Number(x.n) || 0)); x.checked = Date.now(); x.sig = sig; changed = true; } catch (_) {}
            }
            if (changed) writeJ(K_Q, l);
        } finally { reasking = false; }
        return changed;
    }
    /** sous la réponse d'une question : 💾 Garder cette question ; « nouvelle réponse » surlignée la première fois */
    function answer(page, ST) {
        if (!on(4) || kiosk()) return;
        const foot = page.querySelector('.dr-foot2 .dr-foot-act'); if (!foot || !ST.q || !ST.res) return;
        const q = ST.q, l = savedQs(), x = l.find(y => y.q === q);
        const b = document.createElement('button'); b.type = 'button'; b.className = 'button small secondary'; b.dataset.dpKeepq = '';
        b.setAttribute('aria-pressed', String(!!x)); b.textContent = x ? `💾 ${T('Gardée')}` : `💾 ${T('Garder cette question')}`;
        foot.prepend(b);
        const titles = (ST.res.rows || []).map(r => (H().titleOf ? H().titleOf(ST.u.d, r) : '')).slice(0, 80);
        if (x) {
            const fresh = new Set(titles.filter(t => Array.isArray(x.titles) && !x.titles.includes(t)));
            if (x.fresh && fresh.size) page.querySelectorAll('.dr-row').forEach(li => { const t = li.querySelector('.dr-rtitle')?.textContent?.trim(); if (fresh.has(t)) li.classList.add('dp-fresh'); });
            if (x.fresh) b.insertAdjacentHTML('afterend', ` <span class="ui-badge is-blue">${esc(x.fresh > 1 ? T('{n} nouvelles réponses', {n: x.fresh}) : T('1 nouvelle réponse'))}</span>`);
            x.n = Number(ST.res.total) || 0; x.fresh = 0; x.titles = titles; writeJ(K_Q, l);
        }
        b.addEventListener('click', async () => {
            const now = savedQs(), has = now.some(y => y.q === q), done = undoable(has ? T('Question oubliée') : T('💾 Question gardée : elle sera reposée après chaque mise à jour'), [K_Q]);
            writeJ(K_Q, has ? now.filter(y => y.q !== q) : [{q, list: ST.u?.d?.id || '', n: Number(ST.res.total) || 0, at: Date.now(), checked: Date.now(), sig: await packSig(), titles, fresh: 0}, ...now].slice(0, 30));
            const n2 = !has; b.setAttribute('aria-pressed', String(n2)); b.textContent = n2 ? `💾 ${T('Gardée')}` : `💾 ${T('Garder cette question')}`; done();
        });
    }

    /* 🆕 nouveau depuis ta visite (3) : les packs dont la version a changé, et leurs lignes qui touchent la famille (comparées ici) */
    const seen = () => readJ(K_SEEN, null);
    const famKeys = async (d, theme) => {
        await LF()?.ready?.(); if (!LF()?.placesCount?.()) return [];
        let rows = []; try { rows = await E().loadAll(d); } catch (_) { return []; }
        const km = kmOf(theme), out = [];
        for (const r of rows) { const g = E().geoOf(d, r), p = E().periodOf(d, r); if (!g || !p) continue; if (LF().nearKm(g[0], g[1], km) > km) continue; const pr = LF().presence(g[0], g[1], p[0], km); if (!pr.who.length) continue; out.push({k: rkey(d, r), t: H().titleOf ? H().titleOf(d, r) : '', y: p[0], who: pr.who[0]}); if (out.length >= 500) break; }
        return out;
    };
    async function snapshot() {
        const s = await ext.listesMaj?.status?.().catch(() => null);
        return {at: Date.now(), packs: Object.fromEntries((s?.packs || []).map(p => [p.id, `${p.version}|${p.rows}`])), themes: (TH()?.themeList?.() || []).map(t => t.id)};
    }
    async function markSeen() { const s = await snapshot(), old = seen() || {}; s.fam = old.fam || {}; for (const c of await candLists()) { if (s.fam[c.d.id]) s.fam[c.d.id].keys = (await famKeys(c.d, c.theme)).map(x => x.k); } writeJ(K_SEEN, s); }
    async function computeNew() {
        if (kiosk()) return [];
        const prev = seen(), now = await snapshot();
        if (!prev || !prev.packs) { // la première fois : ce qui est là compte comme déjà vu ; la base de comparaison est gardée
            now.fam = {}; for (const c of (await candLists()).slice(0, 30)) now.fam[c.d.id] = {keys: (await famKeys(c.d, c.theme)).map(x => x.k)}; writeJ(K_SEEN, now); return [];
        }
        const changed = Object.keys(now.packs).filter(id => prev.packs[id] && prev.packs[id] !== now.packs[id]);
        const items = [];
        if (changed.length) {
            const cands = await candLists();
            for (const c of cands) {
                let ids = []; try { ids = await ext.listesMaj.packsOfList(c.d); } catch (_) {}
                if (!ids.some(id => changed.includes(id))) continue;
                const base = new Set(prev.fam?.[c.d.id]?.keys || []), cur = await famKeys(c.d, c.theme), add = cur.filter(x => !base.has(x.k));
                if (!add.length) continue;
                const th = themeById(c.theme), p = (await ext.listesMaj.status()).packs.find(x => ids.includes(x.id));
                items.push({ic: th?.icon || '•', text: add.length > 1 ? T('{n} lignes de « {l} » touchent la famille', {n: nf(add.length), l: T(c.d.label)}) : T('« {t} » touche la famille', {t: add[0].t}),
                    sub: [add.slice(0, 2).map(x => `${x.t} ${x.y}${x.who?.age != null ? ` (${T('{p} avait {a} ans', {p: x.who.n, a: x.who.age})})` : ''}`).join(' · '), p ? T('pack du {d}', {d: p.version}) : ''].filter(Boolean).join(' · '), go: c.d.id});
            }
            if (!opt('famOnly')) changed.forEach(id => { if (!items.some(x => x.pack === id)) items.push({ic: '🗂', text: T('Le pack « {p} » a été mis à jour', {p: id}), sub: now.packs[id].split('|')[0], pack: id}); });
        }
        const newTh = now.themes.filter(t => prev.themes && !prev.themes.includes(t));
        newTh.forEach(id => { const th = themeById(id), n = (TH()?.index?.().by.get(id) || []).length; if (th) items.push({ic: th.icon, text: T('Nouveau thème {t} : {n} listes', {t: `${th.icon} ${T(th.label)}`, n}), go: `theme:${id}`}); });
        return items;
    }
    function newHtml(items) {
        if (!items.length) return '';
        const prev = seen();
        return `<ul class="dr-hl dp-hl">${items.map(x => `<li><span class="dr-hic" aria-hidden="true">${esc(x.ic)}</span><span><b>${esc(x.text)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span>${x.go ? `<button type="button" class="dr-link dr-go" data-dp-newgo="${esc(x.go)}">${esc(T('voir'))}</button>` : '<span></span>'}</li>`).join('')}</ul>
            <p class="dr-note dp-more">${esc(prev?.at ? T('Depuis ta visite du {d}. Seulement ce qui touche les lieux et les années de ta famille.', {d: fmtDay(prev.at)}) : '')} <button type="button" class="dr-link" data-dp-seen>✓ ${esc(T('Tout vu'))}</button></p>`;
    }
    function missHtml(r) {
        const pl = r?.places || [], items = [];
        if (pl.length) items.push(`<li><span class="dr-hic" aria-hidden="true">📍</span><span><b>${esc(pl.length > 1 ? T('{n} lieux de l’arbre sans coordonnées', {n: nf(pl.length)}) : T('1 lieu de l’arbre sans coordonnées'))}</b><small>${esc(pl.slice(0, 3).map(p => p.name).join(' · '))}</small></span><button type="button" class="dr-link dr-go" data-dp-missgo>${esc(T('placer'))}</button></li>`);
        if (opt('births') && r?.no_birth) items.push(`<li><span class="dr-hic" aria-hidden="true">📅</span><span><b>${esc(r.no_birth > 1 ? T('{n} personnes sans année de naissance', {n: nf(r.no_birth)}) : T('1 personne sans année de naissance'))}</b><small>${esc(T('leurs « âge à ce moment » restent vides'))}</small></span><span></span></li>`);
        return items.length ? `<ul class="dr-hl dp-hl">${items.join('')}</ul>` : '';
    }
    async function todoExtras(todo) {
        const ul = todo.querySelector('[data-dr-todo]'); if (!ul) return;
        const add = [];
        // ✨ « Nouveau : thème » : écrit par le récap lui-même (app-donnees-accueil.js newThemes), même sans le bloc 🆕
        const offN = FEATS.filter(f => !on(f.n)).length;
        if (offN && readLS(K_OFFER, '') !== '1') add.push(`<li class="dp-offer"><span>🧩 ${esc(offN > 1 ? T('{n} ajouts éteints : les voir', {n: offN}) : T('1 ajout éteint : le voir'))}</span><span><button type="button" class="dr-link" data-dp-offer>${esc(T('voir'))}</button> <button type="button" class="dp-x" data-dp-offer-x aria-label="${esc(T('Ne plus proposer'))}" title="${esc(T('Ne plus proposer'))}">×</button></span></li>`);
        if (!add.length) return;
        const put = () => { if (!ul.isConnected) return; ul.querySelectorAll('.dp-todo-x').forEach(x => x.remove()); ul.insertAdjacentHTML('afterbegin', add.map(h => h.replace('<li', '<li data-dp-todox class="dp-todo-x"')).join('')); };
        put(); new MutationObserver((_, mo) => { if (!ul.isConnected) return mo.disconnect(); if (!ul.querySelector('.dp-todo-x')) put(); }).observe(ul, {childList: true});
    }

    /* ═════════════ 📊 la pastille (5) et le récap filtré sur une personne ou un lieu ═════════════ */
    const pastCache = () => readJ(K_PAST, {}) || {};
    async function countFor(key, args) {
        const sig = `${(await candLists()).map(c => c.d.id).join(',').length}|${LF()?.placesCount?.() || 0}`, c = pastCache()[key];
        if (c && c.sig === sig && Date.now() - c.at < 864e5) return c;
        const rows = await collect(args), v = {n: rows.length, by: byTheme(rows), at: Date.now(), sig};
        const all = pastCache(); all[key] = v; const ks = Object.keys(all); if (ks.length > 300) ks.sort((a, b) => all[a].at - all[b].at).slice(0, ks.length - 300).forEach(k => delete all[k]);
        if (!kiosk()) writeJ(K_PAST, all);
        return v;
    }
    function pastilleHtml(v) { return `<button type="button" class="dp-pastille" data-dp-pastille>📊 ${esc(v.n > 1 ? T('{n} données la concernent', {n: nf(v.n)}) : T('1 donnée la concerne'))}</button>`; }
    function afterPerson(detail) {
        if (!on(5) || !opt('pPerson')) return;
        const P = detail?.person; if (!P || Number(P.is_private) === 1 || (P.living_status === 'living' && kiosk())) return;
        const hero = document.querySelector('#workspace .person-page .person-hero'); if (!hero) return;
        const host = document.createElement('p'); host.className = 'dp-past-wrap'; host.hidden = true; hero.after(host);
        idle(async () => {
            let p; try { p = await personInfo(P.id); } catch (_) { return; }
            if (!p.places.length || !p.b) return;
            const v = await countFor(`p${p.id}`, {places: p.places, from: p.b, to: p.end});
            if (!host.isConnected || v.n < (Number(opt('pMin')) || 5)) return;
            host.innerHTML = pastilleHtml(v); host.hidden = false;
            host.querySelector('[data-dp-pastille]').addEventListener('click', () => focus({kind: 'person', id: p.id, name: p.name, b: p.b, d: p.d, end: p.end, places: p.places, by: v.by, n: v.n}));
        });
    }
    (ext.afterPerson = ext.afterPerson || []).push(d => { try { afterPerson(d); } catch (e) { console.error(e); } });
    /** les fiches de lieu (village, lieu précis) : la pastille sous le titre */
    function placePage() {
        if (!on(5) || !opt('pPlace')) return;
        const page = document.querySelector('#workspace .h-village, #workspace .precise-place-page'); if (!page || page.querySelector('[data-dp-pp]')) return;
        const name = page.querySelector('.page-header h2, .page-header h1')?.textContent?.trim(); if (!name) return;
        const host = document.createElement('p'); host.className = 'dp-past-wrap'; host.dataset.dpPp = ''; host.hidden = true; page.querySelector('.page-header')?.after(host);
        idle(async () => {
            let lat = null, lon = null;
            const gp = page.querySelector('a[href*="geoportail"]')?.getAttribute('href') || ''; const m = gp.match(/[?&]c=(-?[\d.]+),(-?[\d.]+)/); if (m) { lon = Number(m[1]); lat = Number(m[2]); }
            if (lat == null) { try { const r = await api('picker_search', {kind: 'place', q: name, limit: 5}); const it = (r.groups || []).flatMap(g => g.items || []).find(x => x.lat != null && x.lon != null); if (it) { lat = Number(it.lat); lon = Number(it.lon); } } catch (_) {} }
            if (lat == null) return;
            const v = await countFor(`l${lat.toFixed(3)},${lon.toFixed(3)}`, {places: [{lat, lon}]});
            if (!host.isConnected || v.n < (Number(opt('pMin')) || 5)) return;
            host.innerHTML = pastilleHtml(v).replace(T('{n} données la concernent', {n: nf(v.n)}), T('{n} données autour', {n: nf(v.n)})); host.hidden = false;
            host.querySelector('[data-dp-pastille]').addEventListener('click', () => focus({kind: 'place', name, places: [{lat, lon, name}], by: v.by, n: v.n}));
        });
    }
    let ppT = 0;
    const watchPlaces = () => { const w = document.getElementById('workspace'); if (!w || w.__dpObs) return !!w; w.__dpObs = true; new MutationObserver(() => { clearTimeout(ppT); ppT = setTimeout(placePage, 250); }).observe(w, {childList: true}); return true; };
    if (!watchPlaces()) document.addEventListener('DOMContentLoaded', watchPlaces);
    /** le récap, filtré sur elle : ses chips et un nombre par thème (chaque nombre ouvre la liste du thème, filtrée) */
    function focus(f) {
        FOCUS.cur = f;
        const st = A().state; if (!st) return;
        try { H()._st.view = 'recap'; H()._st.q = ''; H()._st.res = null; } catch (_) {}
        if (H().inListes?.() === false) { A().setModule?.('donnees'); return; }
        st.listType = 'donnees'; if (st.module === 'listes') { A().renderSidebar?.(); ext.lists?.donnees?.(++st.workspaceToken); } else A().setModule?.('listes');
    }
    function paintFocus(page, body) {
        const f = FOCUS.cur; if (!f || body.querySelector('[data-dp-focus]')) return;
        const box = document.createElement('section'); box.className = 'dr-box dp-focus'; box.dataset.dpFocus = '';
        const ths = Object.entries(f.by || {}).sort((a, b) => b[1] - a[1]);
        box.innerHTML = `<div class="dp-bh"><h3>${esc(f.kind === 'person' ? T('📊 Pour {p}', {p: f.name}) : T('📊 Autour de {p}', {p: f.name}))}</h3><button type="button" class="dr-link" data-dp-unfocus>✕ ${esc(T('Tout le récap'))}</button></div>
            <div class="ld-chips dp-chips">${f.kind === 'person' ? `<span class="ui-listbar-chip">👤 ${esc(f.name)}</span><span class="ui-listbar-chip">📅 ${esc(T('pendant sa vie, {a}–{b}', {a: String(f.b), b: String(f.d || '…')}))}</span>` : ''}<span class="ui-listbar-chip">📍 ${esc(f.places.map(p => p.name).filter(Boolean).slice(0, 3).join(', ') || f.name)}</span></div>
            <div class="dp-tcount">${ths.map(([id, n]) => { const t = themeById(id); return `<button type="button" data-dp-ftheme="${esc(id)}"><b>${nf(n)}</b>${esc(t?.icon || '')} ${esc(T(t?.label || id))}</button>`; }).join('')}</div>
            ${f.kind === 'person' && (on(16) || on(17)) ? `<p class="dp-focus-act">${on(16) ? `<button type="button" class="button small secondary" data-dp-book>📄 ${esc(T('Livret « Le monde de… »'))}</button>` : ''}${on(17) ? `<button type="button" class="button small secondary" data-dp-slides>🎞 ${esc(T('Sa vie, année par année'))}</button>` : ''}</p>` : ''}
            ${f.kind === 'place' && on(8) ? `<p class="dp-focus-act"><button type="button" class="button small secondary" data-dp-fmap>🗺 ${esc(T('Tout autour'))}</button></p>` : ''}`;
        const anchor = body.querySelector('[data-dp-grid]') || body.querySelector('.dr-rc') || body.firstChild; body.insertBefore(box, anchor);
        box.addEventListener('click', e => { if (e.target.closest('[data-dp-book]')) ext.donneesPlusOutils?.booklet?.(f.id); if (e.target.closest('[data-dp-slides]')) ext.donneesPlusOutils?.slideshow?.(f.id); if (e.target.closest('[data-dp-fmap]')) ext.donneesPlusOutils?.around?.(f.places[0]); });
    }
    async function focusOpen(theme) {
        const f = FOCUS.cur; if (!f) return;
        const c = (await candLists()).find(x => x.theme === theme); if (!c) return;
        const p = f.places[0], preset = {near: p ? {lat: p.lat, lon: p.lon, km: kmOf(theme), title: p.name || f.name} : null, sort: p ? '_km' : ''};
        if (f.kind === 'person' && f.b) preset.period = {from: f.b, to: f.end || f.b + 90, mode: 'overlap', label: `👤 ${f.name} · ${momentText('life').toLowerCase()}, ${f.b}–${f.end || f.b + 90}`, pid: f.id, pb: f.b, pname: f.name};
        E().open?.(c.d.id, preset);
    }

    /* ═════════════ « ⚙ Organiser le récap » ═════════════ */
    function openOrganiser() {
        if (!ext.openDialog) return;
        let l = layout(); const undo = [];
        const save = () => { writeJ(K_LAY, l); rerenderRecap(); };
        const push = () => { undo.push(JSON.stringify(l)); if (undo.length > 50) undo.shift(); };
        const lab = k => T(blkDef(k)[1]).replace(/\s*$/, '');
        const sizeSeg = k => { const c = (l.size[k] || 'n') === 'c'; return `<span class="segmented dp-seg" role="group" aria-label="${esc(T('Taille de « {b} »', {b: lab(k)}))}"><button type="button" data-dp-sz="${k}" data-v="c" aria-pressed="${c}">${esc(T('Compacte'))}</button><button type="button" data-dp-sz="${k}" data-v="n" aria-pressed="${!c}">${esc(T('Normale'))}</button></span>`; };
        const body = () => `<p class="muted vl-help">${esc(T('Glisse ⠿ (ou ↑ ↓, ou Alt + flèches) pour ranger ; l’interrupteur montre ou cache ; la taille met plus ou moins de lignes. Gardé tout de suite, pour toi seul. La question reste toujours en haut ; un bloc vide ne se montre pas.'))}</p>
            <div class="vl-wrap"><table class="data-table vl-table dp-org"><thead><tr><th>${esc(T('Ordre'))}</th><th>${esc(T('Bloc'))}</th><th>${esc(T('Montré'))}</th><th>${esc(T('Taille'))}</th></tr></thead><tbody>${l.order.map((k, i) => {
                const na = !avail(k), off = l.hidden.includes(k), f = blkDef(k)[2];
                return `<tr data-dp-row="${k}" draggable="true" class="${off ? 'is-off' : ''}${na ? ' is-na' : ''}"><td class="vl-ord"><button type="button" class="vl-grip" data-dp-grip="${k}" aria-label="${esc(T('Déplacer « {b} » (flèches haut et bas)', {b: lab(k)}))}" title="${esc(T('Glisser, ou flèches haut et bas'))}">⠿</button><button type="button" class="vl-move" data-dp-mv="${k}" data-dir="-1" ${i ? '' : 'disabled'} aria-label="${esc(T('Monter « {b} »', {b: lab(k)}))}">↑</button><button type="button" class="vl-move" data-dp-mv="${k}" data-dir="1" ${i < l.order.length - 1 ? '' : 'disabled'} aria-label="${esc(T('Descendre « {b} »', {b: lab(k)}))}">↓</button></td>
                    <td class="vl-name"><span>${esc(lab(k))}</span>${na ? ` <small class="vl-na">${esc(T('éteint dans Réglages (ajout {n})', {n: f}))}</small>` : ''}<span class="dp-sz-s">${sizeSeg(k)}</span></td>
                    <td class="vl-show"><label class="ui-toggle"><input type="checkbox" data-dp-show="${k}" ${off ? '' : 'checked'} ${na ? 'disabled' : ''} aria-label="${esc(T('Montrer « {b} »', {b: lab(k)}))}"><i></i></label></td><td class="dp-sz-l">${sizeSeg(k)}</td></tr>`; }).join('')}</tbody></table></div>
            <div class="vl-foot"><button type="button" class="button small secondary" data-dp-reset>↺ ${esc(T('Remettre comme au départ'))}</button><button type="button" class="button small secondary" data-dp-undo ${undo.length ? '' : 'disabled'}>↶ ${esc(T('Annuler'))}</button><span class="muted vl-count">${esc(T('{n} blocs montrés sur {t}', {n: l.order.filter(k => avail(k) && !l.hidden.includes(k)).length, t: l.order.length}))}</span></div>
            <p class="muted small dp-org-note">${esc(T('Un bloc grisé est éteint dans'))} <button type="button" class="dr-link" data-dp-goset>${esc(T('Réglages → 📊 Données'))}</button>.</p>`;
        ext.openDialog({eyebrow: T('Récap des données'), title: `⚙ ${T('Organiser le récap')}`, wide: true, submitLabel: 'Fermer', body: body(),
            onOpen: dl => {
                dl.classList.add('vl-dialog', 'dp-org-dlg'); const box = dl.querySelector('.h-dialog-body');
                const repaint = focusSel => { box.innerHTML = body(); const f = focusSel && box.querySelector(focusSel); if (f) { if (f.disabled) f.closest('tr')?.querySelector('[data-dp-grip]')?.focus(); else f.focus(); } };
                const move = (k, dir) => { const i = l.order.indexOf(k), j = i + dir; if (j < 0 || j >= l.order.length) return false; push(); l.order.splice(i, 1); l.order.splice(j, 0, k); save(); return true; };
                box.addEventListener('click', e => {
                    const m = e.target.closest('[data-dp-mv]'); if (m) { if (move(m.dataset.dpMv, Number(m.dataset.dir))) repaint(`[data-dp-mv="${m.dataset.dpMv}"][data-dir="${m.dataset.dir}"]`); return; }
                    const s = e.target.closest('[data-dp-sz]'); if (s) { push(); l.size[s.dataset.dpSz] = s.dataset.v; save(); repaint(`.${s.closest('.dp-sz-s') ? 'dp-sz-s' : 'dp-sz-l'} [data-dp-sz="${s.dataset.dpSz}"][data-v="${s.dataset.v}"]`); return; }
                    if (e.target.closest('[data-dp-reset]')) { push(); l = JSON.parse(JSON.stringify(LDEF)); save(); repaint('[data-dp-undo]'); if (A().undoToast) A().undoToast(T('Récap remis comme au départ'), {undo: () => { if (dl.open) box.querySelector('[data-dp-undo]')?.click(); }}); return; }
                    if (e.target.closest('[data-dp-undo]')) { const s1 = undo.pop(); if (s1) { l = JSON.parse(s1); save(); repaint(undo.length ? '[data-dp-undo]' : '[data-dp-reset]'); } return; }
                    if (e.target.closest('[data-dp-goset]')) { dl.close(); goSettings(); }
                });
                box.addEventListener('change', e => { const t = e.target; if (!t.dataset.dpShow) return; push(); const k = t.dataset.dpShow; l.hidden = t.checked ? l.hidden.filter(x => x !== k) : [...new Set([...l.hidden, k])]; save(); repaint(`[data-dp-show="${k}"]`); });
                box.addEventListener('keydown', e => { if (!['ArrowUp', 'ArrowDown'].includes(e.key)) return; const row = e.target.closest?.('[data-dp-row]'); if (!row || (!e.target.dataset.dpGrip && !e.altKey)) return; e.preventDefault(); const k = row.dataset.dpRow; if (move(k, e.key === 'ArrowUp' ? -1 : 1)) repaint(`[data-dp-grip="${k}"]`); });
                let dk = '';
                box.addEventListener('dragstart', e => { const r = e.target.closest?.('[data-dp-row]'); if (!r) return; dk = r.dataset.dpRow; r.classList.add('is-drag'); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dk); } catch (_) {} });
                box.addEventListener('dragover', e => { const r = e.target.closest?.('[data-dp-row]'); if (!dk || !r) return; e.preventDefault(); box.querySelectorAll('.is-drop-before, .is-drop-after').forEach(x => x.classList.remove('is-drop-before', 'is-drop-after')); r.classList.add(e.clientY > r.getBoundingClientRect().top + r.offsetHeight / 2 ? 'is-drop-after' : 'is-drop-before'); });
                box.addEventListener('drop', e => { const r = e.target.closest?.('[data-dp-row]'); if (!dk || !r) return; e.preventDefault(); const to = r.dataset.dpRow, after = r.classList.contains('is-drop-after'); if (to !== dk) { push(); l.order.splice(l.order.indexOf(dk), 1); l.order.splice(l.order.indexOf(to) + (after ? 1 : 0), 0, dk); save(); } const k = dk; dk = ''; repaint(`[data-dp-grip="${k}"]`); });
                box.addEventListener('dragend', () => { dk = ''; box.querySelectorAll('.is-drag, .is-drop-before, .is-drop-after').forEach(x => x.classList.remove('is-drag', 'is-drop-before', 'is-drop-after')); });
            },
            onSubmit: () => true});
    }

    /* ═════════════ Réglages → 📊 Données ═════════════ */
    const TAB = [SETTINGS_TAB, '25k4', '📊 Données'];
    function register() { const app = A(); if (!Array.isArray(app?.defaultMaintenanceTabs)) return false; if (!app.defaultMaintenanceTabs.some(x => x[0] === TAB[0])) app.defaultMaintenanceTabs.push(TAB); return true; }
    if (!register()) document.addEventListener('DOMContentLoaded', () => { if (!register()) setTimeout(register, 500); });
    const SUNDO = [];
    function optHtml(o) {
        const v = opt(o.k), lab = T(o.lab);
        if (o.type === 'seg') return `<span class="dp-o"><span class="lbl">${esc(lab)}</span><span class="segmented dp-seg" role="group" aria-label="${esc(lab)}">${o.vals.map((x, i) => `<button type="button" data-dp-opt="${o.k}" data-v="${esc(x)}" aria-pressed="${String(v) === String(x)}">${esc(T(o.labels[i]))}</button>`).join('')}</span></span>`;
        if (o.type === 'tog') return `<label class="ui-toggle dp-o"><input type="checkbox" data-dp-opt="${o.k}" ${v ? 'checked' : ''}><i></i>${esc(lab)}</label>`;
        if (o.type === 'chk') return `<label class="dp-chk"><input type="checkbox" data-dp-opt="${o.k}" ${v ? 'checked' : ''}> ${esc(lab)}</label>`;
        return `<label class="dp-o dp-num"><span class="lbl">${esc(lab)}</span><input type="number" min="${o.min}" max="${o.max}" step="1" inputmode="numeric" data-dp-opt="${o.k}" value="${esc(v)}" aria-label="${esc(lab)}"><span>${esc(T(o.unit))}</span></label>`;
    }
    function settingsPage(token) {
        const host = document.getElementById('workspace'); if (!host) return;
        const head = UI().pageHeader ? UI().pageHeader({where: T('Réglages · 📊 Données'), icon: '📊', title: T('Ce que Données peut faire en plus'), help: esc(T('Allume seulement ce qui te sert. Rien ne part sur Internet sans un clic de ta part.')), saved: true}) : `<h2>📊 ${esc(T('Ce que Données peut faire en plus'))}</h2>`;
        if (ro()) { host.innerHTML = `<section class="page dp-set" data-dp-set>${head}<p class="dp-kiosk">🔒 ${esc(T('En borne et pour les invités du réseau local : tout se lit, rien ne s’écrit (pas de note, pas d’ajout, pas de marque, pas de partage), et ces réglages ne s’ouvrent pas.'))}</p></section>`; return; }
        const n = FEATS.filter(f => on(f.n)).length, place = H().place?.() || 'listes';
        host.innerHTML = `<section class="page dp-set" data-dp-set>${head}
            <section class="maintenance-panel dp-where"><b>${esc(T('Où sont les données'))}</b><span class="segmented dp-seg" role="group" aria-label="${esc(T('Où sont les données'))}">${[['listes', 'Dans Listes'], ['onglet', 'Onglet 📊 Données'], ['deux', 'Les deux']].map(([v, l]) => `<button type="button" data-dp-place="${v}" aria-pressed="${place === v}">${esc(T(l))}</button>`).join('')}</span><small class="muted">${esc(T('L’un des deux reste toujours là.'))}</small></section>
            <div class="dp-set-top"><span class="dp-count" aria-live="polite"><b data-dp-on>${n}</b> ${esc(T('ajouts allumés sur {t}', {t: FEATS.length}))}</span><span class="dp-row"><button type="button" class="button small secondary" data-dp-sundo ${SUNDO.length ? '' : 'disabled'}>↶ ${esc(T('Annuler'))}</button><button type="button" class="button small secondary" data-dp-sreset>↺ ${esc(T('Remettre comme au départ'))}</button></span></div>
            ${GROUPS.map((g, gi) => { const fs = FEATS.filter(f => f.g === gi), k = fs.filter(f => on(f.n)).length;
                return `<section class="maintenance-panel dp-grp" aria-labelledby="dp-gh${gi}"><div class="dp-grp-h"><h3 id="dp-gh${gi}">${esc(T(g))} <small class="muted">${esc(T('{a} sur {b}', {a: k, b: fs.length}))}</small></h3><span class="dp-row"><button type="button" class="button small secondary" data-dp-all="${gi}" data-v="1">${esc(T('Tout allumer'))}</button><button type="button" class="button small secondary" data-dp-all="${gi}" data-v="0">${esc(T('Tout éteindre'))}</button></span></div>
                    ${fs.map(f => { const o = on(f.n); return `<div class="dp-feat${o ? '' : ' is-off'}" data-dp-f="${f.n}"><span class="dp-fic" aria-hidden="true">${esc(f.ic)}</span><span class="dp-ft"><b>${esc(T(f.name))}</b> <small class="muted">${f.n}</small><span class="dp-why">${esc(T(f.why))}</span></span>${f.lock ? `<span class="dp-lock">🔒 ${esc(T('toujours là'))}</span>` : `<label class="ui-toggle"><input type="checkbox" data-dp-ft="${f.n}" ${o ? 'checked' : ''} aria-label="${esc(T(f.name))}"><i></i></label>`}${o && f.opts ? `<div class="dp-opts">${f.opts.map(optHtml).join('')}</div>` : ''}</div>`; }).join('')}</section>`; }).join('')}
            <p class="dp-kiosk">🔒 ${esc(T('En borne et pour les invités du réseau local : tout se lit, rien ne s’écrit, et ces réglages ne s’ouvrent pas. Les personnes vivantes ou confidentielles ne sortent jamais de l’app, quels que soient les réglages.'))}</p></section>`;
        const page = host.querySelector('[data-dp-set]');
        const snapPush = () => { SUNDO.push(readLS(K_FEAT, null)); if (SUNDO.length > 50) SUNDO.shift(); };
        const write = (mut, msg) => { snapPush(); const before = SUNDO[SUNDO.length - 1]; const c = cfg(); mut(c); writeJ(K_FEAT, c); const after = readLS(K_FEAT, null); settingsPage(); UI().markSaved?.(document.querySelector('[data-dp-set]')); rerenderRecap();
            if (A().undoToast) A().undoToast(msg, {undo: () => { writeLS(K_FEAT, before); SUNDO.pop(); settingsPage(); }, redo: () => { writeLS(K_FEAT, after); settingsPage(); }}); };
        page.addEventListener('change', e => {
            const t = e.target;
            if (t.dataset.dpFt) { const f = featOf(t.dataset.dpFt); write(c => { c.on[f.n] = t.checked; }, T(t.checked ? '« {f} » allumé' : '« {f} » éteint', {f: `${f.ic} ${T(f.name)}`})); setTimeout(() => document.querySelector(`[data-dp-ft="${f.n}"]`)?.focus(), 0); return; }
            if (t.dataset.dpOpt) {
                const k = t.dataset.dpOpt, o = FEATS.flatMap(f => f.opts || []).find(x => x.k === k); if (!o) return;
                let v = t.type === 'checkbox' ? t.checked : t.value;
                if (o.type === 'num') { v = Math.round(Number(v)); if (!(v >= o.min && v <= o.max)) { toast(T('Écris un nombre entre {a} et {b}.', {a: o.min, b: o.max}), 'error'); t.value = opt(k); return; } }
                write(c => { c.opt[k] = v; }, T('Réglage enregistré.')); setTimeout(() => document.querySelector(`[data-dp-opt="${k}"]`)?.focus(), 0);
            }
        });
        page.addEventListener('click', e => {
            const t = e.target; let b;
            if ((b = t.closest('[data-dp-opt][data-v]'))) { const k = b.dataset.dpOpt, v = b.dataset.v; write(c => { c.opt[k] = v; }, T('Réglage enregistré.')); setTimeout(() => document.querySelector(`[data-dp-opt="${k}"][data-v="${CSS.escape(v)}"]`)?.focus(), 0); return; }
            if ((b = t.closest('[data-dp-all]'))) { const gi = Number(b.dataset.dpAll), v = b.dataset.v === '1'; write(c => { FEATS.filter(f => f.g === gi && !f.lock).forEach(f => { c.on[f.n] = v; }); }, T(v ? '{g} : tout allumé' : '{g} : tout éteint', {g: T(GROUPS[gi])})); setTimeout(() => document.querySelector(`[data-dp-all="${gi}"][data-v="${b.dataset.v}"]`)?.focus(), 0); return; }
            if (t.closest('[data-dp-sundo]')) { const s = SUNDO.pop(); if (s !== undefined) { writeLS(K_FEAT, s); settingsPage(); rerenderRecap(); setTimeout(() => document.querySelector(SUNDO.length ? '[data-dp-sundo]' : '[data-dp-sreset]')?.focus(), 0); } return; }
            if (t.closest('[data-dp-sreset]')) { write(c => { c.on = {}; c.opt = {}; }, T('Ajouts remis comme au départ')); return; }
            if ((b = t.closest('[data-dp-place]'))) { H().setPlace?.(b.dataset.dpPlace); settingsPage(); }
        });
        void token;
    }
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[SETTINGS_TAB] = settingsPage;

    ext.donneesPlus = {on, opt, setFeat, setOpt, FEATS, GROUPS, DEF_ON, listBar, rowsPainted, collect, candLists, personInfo, lifeRange, momentText, focus, openOrganiser, offline, badgeHtml, marks, layout, LDEF,
        favs, recents, savedQs, mine, doubts, loadNotes, notes: id => NOTES.get(id) || {}, rkey, qidOf, srcUrlOf, kmOf, themeById, listById, computeNew, markSeen, settingsTab: SETTINGS_TAB, ro, kiosk, _focus: FOCUS, critLabel, resetCache: () => { candP = null; writeLS(K_PAST, null); }};
    ext.dataPlus = {recap, answer};
})();
