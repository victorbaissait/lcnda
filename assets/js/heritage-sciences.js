/* LCNDA — 🔬 Sciences, inventions et explorations, sur le moteur des fiches (docs/TYPES.md, noyau heritage-artist.js).
 * Maquettes validées M (invention), N (découverte), Y (profil scientifique), Z (explorateur, expédition) de
 * docs/design/profils-et-oeuvres.html. Serveur : lib/sciences.php (sortes, profils, coordonnées des lieux, import DOI / ORCID / HAL).
 *
 * Ce fichier : les outils communs du domaine (pastilles employeur / revue, champs « selon la sorte », cartes, enregistrement
 * avec le bon profil au lieu de « Artiste ») et les sortes 💡 invention, 🔬 découverte, 📄 publication scientifique.
 * heritage-sciences-explore.js : 🧭 expédition et profil explorateur ; heritage-sciences-profile.js : profils inventeur et
 * scientifique, sections de page, import des publications, blocs de la fiche de la personne.
 * Chargé après heritage-artist-fields.js et AVANT heritage-artist-page.js (ses sections entrent dans la page dès le départ).
 */
(() => {
    'use strict';
    const i18n = (s, v) => { const I = (typeof window !== 'undefined' ? window : globalThis).LCNDA_I18N; if (v) v = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x])); return I ? I.t(s, v) : (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s); }; // 🌐 textes traduits (docs/I18N.md) ; nombres gardés tels quels
    const ART = window.LCNDA_ART; if (!ART?.define) return;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP, P = () => window.LCNDA_PICKER || window.LCNDA_APP;
    const U = ART.util, esc = U.esc;
    const plural = (n, w, pl) => U.plural(n, w, pl);
    const lab = (l, k) => (l.find(x => x[0] === k) || [, k || ''])[1];
    const safeUrl = u => /^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '';
    const SC = ART.sci = ART.sci || {};
    SC.lab = lab; SC.safeUrl = safeUrl;
    /** les sortes du domaine → le profil qu'elles proposent de cocher */
    SC.KIND_PROFILE = {invention: 'inventor', discovery: 'scientist', paper: 'scientist', expedition: 'explorer', profile_inventor: 'inventor', profile_scientist: 'scientist', profile_explorer: 'explorer'};
    SC.PROFILES = {inventor: ['Inventeur', '💡'], scientist: ['Scientifique', '🔬'], explorer: ['Explorateur', '🧭']};
    // le domaine dans « ＋ Toutes les sortes de fiches »
    if (Array.isArray(ART.DOMAINS) && !ART.DOMAINS.some(d => d[0] === 'science')) ART.DOMAINS.splice(Math.max(0, ART.DOMAINS.findIndex(d => d[0] === 'autre')), 0, ['science', '🔬 Sciences, inventions, explorations']);
    const extLink = (u, label, icon = '🔗') => { const s = safeUrl(u); return s ? `<a class="ar-ochip is-link sc-ext" href="${esc(s)}" target="_blank" rel="noopener noreferrer"><i>${icon}</i>${esc(label)}</a>` : ''; };
    SC.extLink = extLink;

    /* ═════════ Des valeurs vers d'autres parties de la base : employeur 🏭, revue 📰, source 📚 (menu de choix unique) ═════════ */
    const REFK = {employer: {key: 'empid', icon: '🏭'}, periodical: {key: 'perid', icon: '📰'}, source: {key: 'sid', icon: '📚'}};
    const refOf = (v, key) => !v ? null : typeof v === 'string' ? (v.trim() ? {txt: v.trim()} : null) : typeof v === 'object' ? (Number(v[key]) > 0 ? {[key]: Number(v[key]), title: String(v.title || '')} : (v.txt || v.title) ? {txt: String(v.txt || v.title)} : null) : null;
    const pkValOf = (v, key) => { const r = refOf(v, key); return r ? (r[key] ? {id: r[key], title: r.title} : `txt:${r.txt}`) : null; };
    const pkItems = el => { const pk = el?.querySelector?.('.pk'); if (!pk) return []; try { const v = JSON.parse(pk.dataset.pkValue || '[]'); return Array.isArray(v) ? v : v ? [v] : []; } catch (_) { return []; } };
    const fromPk = (it, key) => !it ? null : (it.free || !it.id) ? (it.title ? {txt: String(it.title)} : null) : {[key]: Number(it.id), title: String(it.title || '')};
    const refTitle = (v, key) => { const r = refOf(v, key); return r ? (r.title || r.txt || '') : ''; };
    const refChip = (v, kind) => { const K = REFK[kind], r = refOf(v, K.key); if (!r) return '';
        if (kind === 'employer' && r.empid && r.title) return `<button type="button" class="ar-ochip is-link" data-sc-emp="${esc(r.title)}" title="${esc(i18n('Ouvrir la fiche Employeurs'))}"><i>${K.icon}</i>${esc(r.title)}</button>`;
        return `<span class="ar-ochip ${r[K.key] ? '' : 'is-free'}" ${r[K.key] ? `title="${esc(kind === 'employer' ? i18n('Fiche Employeurs') : kind === 'periodical' ? i18n('Revues et magazines') : i18n('Sources'))}"` : ''}><i>${K.icon}</i>${esc(r.title || r.txt)}</span>`; };
    // une fiche Employeurs (institution, laboratoire, entreprise) s'ouvre par-dessus, sans fermer la fiche
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-sc-emp]'); if (!b || !ext.openEmployer) return; e.preventDefault(); ext.openEmployer(b.dataset.scEmp); });
    document.addEventListener('picker-open', e => { if (e.detail?.kind !== 'employer' || !ext.openEmployer || !e.target.closest?.('.ar-dlg')) return; e.preventDefault(); ext.openEmployer(e.detail.item?.title || ''); });
    SC.refOf = refOf; SC.refTitle = refTitle; SC.refChip = refChip;
    const pkField = (kind, v, key, extra = {}) => P().pickerField({hiddenName: false, name: 'sc_ref', inline: false, kind, allowFree: true, allowCreate: kind === 'employer', value: pkValOf(v, key), ...extra});
    Object.entries(REFK).forEach(([kind, K]) => {
        ART.ft[kind] = {label: {employer: 'Employeur, institution', periodical: 'Revue, journal', source: i18n('Source')}[kind], badge: K.icon, tile: `${K.icon} ${{employer: 'Employeur', periodical: 'Revue', source: i18n('Source')}[kind]}`,
            edit: (f, v) => `<div data-sc-pk="${kind}">${pkField(kind, v, K.key)}</div>`, get: el => fromPk(pkItems(el)[0], K.key),
            read: (f, v) => refChip(v, kind), text: (f, v) => refTitle(v, K.key), empty: v => !refOf(v, K.key)};
    });
    /* les mêmes dans les tableaux (colonne type employer / periodical / source) : extension des cellules du moteur (ART.cellTypes) */
    ART.cellTypes = ART.cellTypes || {};
    Object.entries(REFK).forEach(([kind, K]) => {
        ART.cellTypes[kind] = {edit: (c, v) => `<span class="ar-pk" data-c="${esc(c.key)}" data-ct="${kind}" data-sc-pk="${kind}">${pkField(kind, v, K.key)}</span>`,
            get: cell => fromPk(pkItems(cell)[0], K.key), read: (c, v) => refChip(v, kind), text: (c, v) => refTitle(v, K.key)};
    });
    /** une colonne « employeur » si le moteur sait l'afficher dans un tableau (sinon : texte) */
    const cellKind = k => ART.cellHook ? k : 'text';
    SC.cellKind = cellKind;
    // « ＋ Créer la fiche « … » » d'un employeur depuis le menu de choix : la fiche Employeurs est créée tout de suite
    document.addEventListener('picker-create', async e => {
        if (e.detail?.kind !== 'employer' || !e.target.closest?.('[data-sc-pk="employer"]')) return; e.preventDefault();
        try {
            const saved = (await A().api('save_employer_record', {}, {method: 'POST', body: {name: e.detail.text}})).result || {}, name = String(saved.name || e.detail.text).trim();
            const r = await A().api('picker_search', {kind: 'employer', q: name, offset: 0, limit: 20});
            const all = (r.groups || []).flatMap(g => g.items || []), it = all.find(x => x.key && x.key === saved.key) || all.find(x => String(x.title).toLowerCase() === name.toLowerCase());
            if (it) { e.detail.pick({id: it.id, title: it.title}); A().toast(i18n('Nouvelle fiche Employeurs : « {title} ».', {title: it.title})); }
            else e.detail.pick(`txt:${e.detail.text}`);
        } catch (er) { A().toast(er.message, 'error'); }
    });

    /* ═════════ Enregistrer : le profil Inventeur / Scientifique / Explorateur au lieu de « Artiste » ═════════ */
    const profilesOf = store => (store.person?.profiles || []).map(p => p.profile_key);
    SC.profilesOf = profilesOf;
    /** coche le profil s'il le faut (une question d'abord) ; une erreur vide = la personne a dit non */
    SC.needProfile = async (store, kind) => {
        const want = SC.KIND_PROFILE[kind]; if (!want) return;
        const have = profilesOf(store);
        if (kind.startsWith('profile_') ? have.includes(want) : have.some(k => SC.PROFILES[k])) return;
        const [label, icon] = SC.PROFILES[want], def = ART.defs[kind] || {};
        if (!kind.startsWith('profile_')) {
            const ok = await A().confirmBox(i18n(def.fem ? 'La fiche de {name} n’est pas encore cochée « {icon} {label} ». La cocher pour y ranger cette {x2} ?' : 'La fiche de {name} n’est pas encore cochée « {icon} {label} ». La cocher pour y ranger ce {x2} ?', {name: store.name, icon, label, x2: String(def.label || i18n('fiche')).toLowerCase()}), {title: `${icon} ${i18n('Cocher « {label} » ?', {label})}`, okLabel: i18n('Cocher « {label} »', {label})});
            if (!ok) throw new Error('');
        }
        await ART.write('set_profile', {person_id: store.pid, profile: want, on: 1, label, icon});
        store.person.profiles = [...(store.person.profiles || []), {profile_key: want, item_id: null}];
    };
    const baseSave = ART.saveItem, inFlight = new Map();
    ART.saveItem = (store, kind, id, data) => {
        if (!SC.KIND_PROFILE[kind]) return baseSave(store, kind, id, data);
        // un double-clic sur « 💾 Enregistrer » : une seule fiche (le second appel attend le premier)
        const key = `${store.pid}|${kind}|${id || 0}`; if (inFlight.has(key)) return inFlight.get(key);
        const job = (async () => {
            await SC.needProfile(store, kind);
            const pf = ART.defs[kind]?.parentField, parent_id = pf ? (U.ref(data[pf])?.iid || 0) : 0;
            const r = await ART.write('save_item', {person_id: store.pid, kind, id: id || 0, data, parent_id, make_profile: SC.KIND_PROFILE[kind]});
            return r.id;
        })();
        inFlight.set(key, job); job.finally(() => inFlight.delete(key)).catch(() => {});
        return job;
    };
    // « ⤒ Importer » d'une de nos sortes : la question porte sur le bon profil (pas sur « Artiste »)
    // la sorte vient de l'appel (fenêtre « ⤒ Importer ») : pas d'une variable restée d'une fenêtre fermée (sinon « ＋ Plusieurs épisodes » demandait « Cocher Inventeur ? »)
    const baseNeed = ART.needArtist;
    ART.needArtist = async (store, kind) => { if (kind && SC.KIND_PROFILE[kind]) { await SC.needProfile(store, kind); return {}; } return baseNeed(store); };
    const wrapImport = () => { const base = ART.openImport; if (!base || base._sc) return; ART.openImport = (C, kind) => { if (kind === 'paper' && SC.openPubImport) return SC.openPubImport(C); return base(C, kind); }; ART.openImport._sc = true; };
    if (document.readyState === 'loading') document.addEventListener?.('DOMContentLoaded', wrapImport); else setTimeout(wrapImport, 0);

    /* ═════════ Les cartes : un repère par lieu (coordonnées de la base, ou écrites à la main) ═════════ */
    /** « 45.24 N, 1.78 E », « 45,24 ; 1,78 », « -12.5 -45.2 » → [lat, lon] */
    SC.parseCoords = t => { const s = String(t || '').trim(); if (!s) return null; const m = s.replace(/,(\d)/g, '.$1').match(/(-?\d+(?:\.\d+)?)\s*°?\s*([NS])?\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EOWO])?/i); if (!m) return null;
        let lat = Number(m[1]), lon = Number(m[3]); if (/s/i.test(m[2] || '')) lat = -Math.abs(lat); if (/[ow]/i.test(m[4] || '')) lon = -Math.abs(lon); return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat, lon] : null; };
    const COORDS = new Map();
    /** un emplacement de carte : groupes [{color, line, pts: [{plid, coords, label, n}]}] ; dessiné dès qu'il est dans la page */
    SC.mapSlot = (groups, {height = 260, empty = i18n('Aucun lieu avec ses coordonnées.')} = {}) => `<div class="sci-map" data-sci-map="${esc(JSON.stringify({groups, height, empty}))}">${window.LCNDA_UI.spinner(i18n('Chargement de la carte…'))}</div>`;
    async function drawMap(el) {
        if (el.dataset.sciDone) return; el.dataset.sciDone = '1';
        let cfg; try { cfg = JSON.parse(el.dataset.sciMap); } catch (_) { el.innerHTML = ''; return; }
        const need = [...new Set(cfg.groups.flatMap(g => g.pts).map(p => Number(p.plid)).filter(id => id > 0 && !COORDS.has(id)))];
        if (need.length) { try { const r = await A().api('sciences', {op: 'coords', ids: need.join(',')}); (r.places || []).forEach(p => COORDS.set(p.id, p)); } catch (_) {} need.forEach(id => { if (!COORDS.has(id)) COORDS.set(id, null); }); }
        const pts = [], paths = [];
        cfg.groups.forEach(g => { const line = [];
            g.pts.forEach(p => { const c = p.coords ? SC.parseCoords(p.coords) : null, b = COORDS.get(Number(p.plid)), ll = c || (b && b.lat != null && b.lon != null ? [b.lat, b.lon] : null); if (!ll) return;
                pts.push({lat: ll[0], lon: ll[1], label: p.label || b?.name || '', color: p.color || g.color || '#e1a500', n: p.n || 0, showLabel: !!cfg.labels || !!p.show}); line.push(ll); });
            if (g.line && line.length > 1) paths.push({coords: line, color: g.color || '#e1a500', dashed: true, width: 3}); });
        if (!el.isConnected) return;
        el.innerHTML = pts.length && ext.miniMap ? ext.miniMap(pts, paths, {height: cfg.height || 260}) : `<p class="muted sc-mapnone">🗺 ${esc(cfg.empty || i18n('Aucun lieu avec ses coordonnées.'))}</p>`;
    }
    SC.drawMaps = root => root?.querySelectorAll?.('[data-sci-map]:not([data-sci-done])').forEach(drawMap);
    if (typeof MutationObserver !== 'undefined' && document.documentElement) new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) { if (n.nodeType !== 1) continue; if (n.matches?.('[data-sci-map]')) drawMap(n); else if (n.firstElementChild) SC.drawMaps(n); } }).observe(document.documentElement, {childList: true, subtree: true});

    /* ═════════ Des vues communes ═════════ */
    // des personnes avec leur rôle, en pastilles (« Pierre MARTIN inventeur principal »)
    ART.views.sc_people = {read: (ctx, it, f, v) => { const l = ART.normPeople(v); return l.length ? `<div class="sc-ppl">${l.map(r => `<div>${U.personChip(r, r.role, ctx)}</div>`).join('')}</div>` : ''; }};
    const timeline = (l, fn, cls = '') => `<div class="ar-tl ${cls}">${l.map((r, i) => fn(r, i, l)).join('')}</div>`;
    SC.timeline = timeline;
    const docChip = d => d ? ` <span class="ar-ochip"><i>📄</i>${esc(d)}</span>` : '';
    SC.docChip = docChip;
    const yr = v => U.yearOf(v);

    /* ═════════ 💡 INVENTION (maquette M) ═════════ */
    const COUNTRIES = [['FR', '🇫🇷', 'France'], ['BE', '🇧🇪', 'Belgique'], ['CH', '🇨🇭', 'Suisse'], ['LU', '🇱🇺', 'Luxembourg'], ['DE', '🇩🇪', 'Allemagne'], ['GB', '🇬🇧', 'Royaume-Uni'], ['IT', '🇮🇹', 'Italie'], ['ES', '🇪🇸', 'Espagne'], ['PT', '🇵🇹', 'Portugal'], ['NL', '🇳🇱', 'Pays-Bas'], ['AT', '🇦🇹', 'Autriche'],
        ['SE', '🇸🇪', i18n('Suède')], ['DK', '🇩🇰', 'Danemark'], ['NO', '🇳🇴', i18n('Norvège')], ['FI', '🇫🇮', 'Finlande'], ['PL', '🇵🇱', 'Pologne'], ['CS', '🇨🇿', i18n('Tchécoslovaquie')], ['HU', '🇭🇺', 'Hongrie'], ['SU', '🇷🇺', 'URSS, Russie'], ['US', '🇺🇸', i18n('États-Unis')], ['CA', '🇨🇦', 'Canada'],
        ['MX', '🇲🇽', 'Mexique'], ['BR', '🇧🇷', i18n('Brésil')], ['AR', '🇦🇷', 'Argentine'], ['JP', '🇯🇵', 'Japon'], ['CN', '🇨🇳', 'Chine'], ['IN', '🇮🇳', 'Inde'], ['AU', '🇦🇺', 'Australie'], ['DZ', '🇩🇿', i18n('Algérie')], ['MA', '🇲🇦', 'Maroc'], ['ZA', '🇿🇦', i18n('Afrique du Sud')],
        ['EP', '🇪🇺', i18n('Brevet européen')], ['WO', '🌐', 'Demande internationale (PCT)'], ['XX', '🏳', 'Autre pays']];
    const flag = c => (COUNTRIES.find(x => x[0] === c) || [, '🏳'])[1];
    const cname = c => (COUNTRIES.find(x => x[0] === c) || [, , c || ''])[2];
    const PSTAT = [['', '—'], ['depose', i18n('déposé')], ['examen', i18n('en examen')], ['delivre', i18n('délivré')], ['vigueur', i18n('en vigueur')], ['tombe', i18n('tombé (domaine public)')], ['expire', i18n('expiré')], ['refuse', i18n('refusé')], ['abandonne', i18n('abandonné')], ['retire', i18n('retiré')], ['annule', i18n('annulé')]];
    const ISTAT = [['', '—'], ['idee', i18n('idée, croquis')], ['proto', 'prototype'], ['brevete', i18n('breveté')], ['fabrique', i18n('fabriqué, vendu')], ['abandon', i18n('abandonné')], ['inconnu', i18n('on ne sait pas')]];
    const PROTO = [['', '—'], ['garde', i18n('gardé')], ['famille', i18n('dans la famille')], ['musee', i18n('au musée')], ['donne', i18n('donné')], ['vendu', 'vendu'], ['casse', i18n('cassé')], ['perdu', 'perdu'], ['detruit', i18n('détruit')]];
    const DISP = [['anteriorite', i18n('antériorité opposée')], ['opposition', 'opposition'], ['contrefacon', i18n('contrefaçon')], ['nullite', i18n('action en nullité')], ['proces', i18n('procès')], ['autre', 'autre']];
    const OUTCOME = [['', '—'], ['gagne', i18n('gagné')], ['perdu', 'perdu'], ['transaction', 'accord, transaction'], ['en_cours', i18n('en cours')], ['refus', i18n('brevet refusé')]];
    const IREL = [['derivee', i18n('invention dérivée')], ['perfection', i18n('perfectionnement de')], ['issue', i18n('issue de la découverte')], ['menee', i18n('a mené à')], ['fabriquee', i18n('fabriquée sous forme de')], ['publiee', i18n('publiée dans')], ['concurrente', 'concurrente'], ['autre', i18n('liée à')]];
    const IPHOTO = [['fig', i18n('Figure du brevet')], ['proto', 'Prototype'], ['objet', i18n('Objet fabriqué')], ['dessin', 'Dessin, croquis'], ['pub', i18n('Publicité, notice')], ['autre', 'Autre']];
    SC.COUNTRIES = COUNTRIES; SC.flag = flag; SC.cname = cname; SC.PSTAT = PSTAT;
    const patentNo = p => { const n = String(p.no || '').trim(); if (!n) return '—'; return /^[A-Z]{2}\s?\d/.test(n) ? n : `${p.country && p.country !== 'XX' ? `${p.country} ` : ''}${n}`; };
    const espacenet = p => { const n = patentNo(p).replace(/[\s.]/g, ''); return /^[A-Z]{2}\d{3,}/.test(n) ? `https://worldwide.espacenet.com/patent/search?q=pn%3D${encodeURIComponent(n)}` : ''; };
    const pBadge = p => { const s = p.status || ''; if (!s) return ''; const bad = ['refuse', 'abandonne', 'retire', 'annule'].includes(s), ok = ['delivre', 'vigueur'].includes(s);
        return `<span class="ar-badge ${bad ? 'w' : ok ? 'ok' : ''}">${esc(s === 'tombe' ? i18n('tombé') : lab(PSTAT, s))}${p.end ? ` (${esc(p.end)})` : ''}</span>`; };
    SC.patentNo = patentNo; SC.pBadge = pBadge; SC.espacenet = espacenet;
    const patentCard = (p, ctx) => { const claims = String(p.claims || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
        const dl = [['Classe', p.cls], ['Mandataire', p.agent], [i18n('Annuités'), p.annuities], [i18n('Publié'), p.published], [i18n('Cité par'), p.cited_by && (/^\d+$/.test(String(p.cited_by).trim()) ? plural(Number(p.cited_by), i18n('brevet ultérieur'), i18n('brevets ultérieurs')) : p.cited_by)], ['Famille', p.family]].filter(x => x[1]);
        if (!claims.length && !dl.length && !p.title && !p.doc && !p.url) return '';
        const url = safeUrl(p.url) || espacenet(p);
        return `<div class="ar-reccard sc-patent ${p.main ? 'is-main' : ''}"><div class="sci-rhd"><span class="sci-kind">BREVET ${esc(patentNo(p))}</span>${p.title ? `<b>« ${esc(p.title)} »</b>` : ''}<span class="spacer"></span>${p.doc ? `<span class="ar-ochip"><i>📄</i>${esc(p.doc)}</span>` : ''}${url ? extLink(url, /espacenet/.test(url) ? 'Espacenet' : i18n('Voir en ligne')) : ''}</div>
            <div class="sc-pgrid">${claims.length ? `<div><small class="ar-g">Revendications (${claims.length})</small><ol class="sc-claims">${claims.map(c => `<li>${esc(c)}</li>`).join('')}</ol></div>` : '<div></div>'}${dl.length ? `<dl class="ar-dl sc-dl-s">${dl.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}</div></div>`; };
    ART.views.sc_patents = {
        meta: (ctx, it) => { const l = it.data?.patents || []; if (!l.length) return ''; const c = new Set(l.map(p => p.country).filter(Boolean)).size, fam = new Set(l.map(p => String(p.family || '').trim() || '1')).size;
            return esc(`${plural(c, 'pays', 'pays')} · ${plural(fam, 'famille de brevets', 'familles de brevets')}`); },
        actions: (ctx, it) => it.id ? `<button type="button" class="button small secondary" data-ar-cmd="edit">＋ ${i18n('Ajouter un brevet')}</button>` : '',
        read: (ctx, it, f, v) => { const l = Array.isArray(v) ? v : []; if (!l.length) return '';
            const rows = l.map(p => `<tr class="${p.main ? 'is-me' : ''}"><td>${flag(p.country)} ${esc(cname(p.country))}</td><td>${p.main ? `<b>${esc(patentNo(p))}</b>` : esc(patentNo(p))}</td><td>${esc(p.filed || '—')}</td><td>${esc(p.granted || '—')}</td><td>${esc(p.applicant || '')}</td><td>${pBadge(p)}</td></tr>`).join('');
            const cards = [...l].sort((a, b) => (b.main ? 1 : 0) - (a.main ? 1 : 0)).map(p => patentCard(p, ctx)).filter(Boolean);
            return `<div class="ar-scroll"><table class="ar-t sc-ptable"><thead><tr><th>Pays</th><th>N°</th><th>${i18n('Dépôt')}</th><th>${i18n('Délivrance')}</th><th>${i18n('Déposant')}</th><th>Statut</th></tr></thead><tbody>${rows}</tbody></table></div>${cards[0] || ''}${cards.length > 1 ? `<details class="sc-more"><summary>${esc(plural(cards.length - 1, 'autre brevet détaillé', 'autres brevets détaillés'))}</summary>${cards.slice(1).join('')}</details>` : ''}`; },
        text: (ctx, it) => ART.arr(it.data?.patents).map(patentNo).join(', '),
    };
    ART.views.sc_patent_count = {read: (ctx, it) => { const l = it.data?.patents || []; if (!l.length) return ''; return esc(`${plural(l.length, 'brevet')} · ${plural(new Set(l.map(p => p.country).filter(Boolean)).size, 'pays', 'pays')}`); },
        text: (ctx, it) => { const l = it.data?.patents || []; return l.length ? plural(l.length, 'brevet') : ''; }};
    ART.views.sc_protos = {read: (ctx, it, f, v) => timeline(v || [], (r, i, l) => `<div class="ar-ev ${i === l.length - 1 ? 'now' : ''}"><b>${esc(r.date || '?')}</b> · ${esc([r.name, r.material].filter(Boolean).join(', '))} <small class="ar-g">${esc([r.shown, lab(PROTO, r.state), r.where].filter(Boolean).join(' · '))}${r.where && /famille/i.test(r.where + lab(PROTO, r.state)) ? ' 📦' : ''}</small></div>`)};
    ART.views.sc_licences = {read: (ctx, it, f, v) => { const l = v || []; return `<div class="ar-scroll"><table class="ar-t"><thead><tr><th>Entreprise</th><th>Pays</th><th>${i18n('Années')}</th><th>Conditions</th><th>${i18n('Fabriqués')}</th></tr></thead><tbody>${l.map(r => `<tr><td>${typeof r.company === 'object' ? refChip(r.company, 'employer') : esc(r.company || '')}</td><td>${esc(r.country || '')}</td><td>${esc(r.years || '')}</td><td>${esc(r.terms || '')}</td><td>${esc(r.made || '')}</td></tr>`).join('')}</tbody></table></div>`; }};
    ART.views.sc_disputes = {read: (ctx, it, f, v) => (v || []).map(r => `<div class="sc-line"><b>${esc(r.date || '?')}</b> · ${esc([lab(DISP, r.kind), r.what].filter(Boolean).join(' : '))}${r.court ? `, ${esc(r.court)}` : ''}${r.outcome ? ` · <b>${esc(lab(OUTCOME, r.outcome))}</b>` : ''}${docChip(r.doc)}</div>`).join('')};
    ART.views.sc_objects = {read: (ctx, it, f, v) => { const st = ctx.store; return `<div class="sc-minis">${(v || []).map(r => { const ref = U.ref(r.obj), o = ref?.iid ? st.get(ref.iid) : null, col = /^#[0-9a-f]{6}$/i.test(String(r.color || '').trim()) ? r.color.trim() : '';
        return `<button type="button" class="sci-mini" ${ref?.iid ? `data-ar-open="${ref.iid}"` : ''}>${o && U.photoSrc(ART.arr(o.data?.photos)[0]) ? U.cover(o, 'sc-mi') : `<i class="sc-mi" style="${col ? `background:${esc(col)}` : ''}"></i>`}<span>${esc(r.name || ref?.title || ref?.txt || '')}</span><small>${esc([r.year, r.where].filter(Boolean).join(' · '))}</small></button>`; }).join('')}</div>`; }};
    ART.views.sc_prizes = {read: (ctx, it, f, v) => `${(v || []).map(r => { const k = String(r.rank || '').toLowerCase(); const ic = /\bor\b|1er|premier|lauréat/.test(k) ? '🥇' : /argent|2e/.test(k) ? '🥈' : /bronze|3e/.test(k) ? '🥉' : '🏆';
        return `<div class="sc-line">${ic} ${esc([r.prize, r.year].filter(Boolean).join(' '))}${r.rank ? ` · ${esc(r.rank)}` : ''}${r.note ? ` <small class="ar-g">${esc(r.note)}</small>` : ''}</div>`; }).join('')}<small class="ar-g">${i18n('(aussi dans « 🏆 Concours et récompenses » de la personne)')}</small>`};
    /** les liens vers d'autres fiches, avec leur nom (« invention dérivée : greffoir 1958 ») */
    const relView = rels => ({read: (ctx, it, f, v) => (v || []).map(r => `<div>${U.refChip(r.to, '', r.link ? ` <small class="ar-g">· ${esc(lab(rels, r.link))}</small>` : '')}</div>`).join('')});
    ART.views.sc_irel = relView(IREL);

    ART.define({key: 'invention', icon: '💡', label: 'Invention', many: 'Inventions', fem: true, domain: 'science', profile: 'inventor',
        eyebrow: it => ['Invention', it.data?.domain].filter(Boolean).join(' · '),
        heading: (ctx, it) => { const d = it.data || {}, dt = String(d.date || '').trim(), conc = dt ? i18n(/^\d{3,4}$/.test(dt) ? 'conçu en {dt}' : /^\d/.test(dt) ? 'conçu le {dt}' : 'conçu {dt}', {dt}) : '';
            return `<h2 class="ar-h2">${esc(it.title)}${conc || d.place ? ` <small>· ${esc([conc, U.placeTitle(d.place)].filter(Boolean).join(' · '))}</small>` : ''}</h2>`; },
        badges: (ctx, it) => { const d = it.data || {}, b = []; if (d.status) b.push(`<span class="ar-badge b">${esc(lab(ISTAT, d.status))}</span>`); const np = (d.patents || []).length; if (np) b.push(`<span class="ar-badge">📜 ${esc(plural(np, 'brevet'))}</span>`);
            if ((d.prototypes || []).length) b.push(`<span class="ar-badge">🔧 ${esc(plural(d.prototypes.length, 'prototype'))}</span>`); return b.length ? `<div class="ar-badges">${b.join('')}</div>` : ''; },
        cardLine: it => [it.data?.date, it.data?.domain, ART.arr(it.data?.patents).length && plural(it.data.patents.length, 'brevet')].filter(Boolean).join(' · '),
        newData: () => ({status: 'idee', patents: [], prototypes: []}),
        groups: [
            {key: 'main', label: i18n('L’invention'), zone: 'main', fields: [
                {key: 'title', label: i18n('Nom de l’invention'), type: 'text', star: true, head: true, ph: 'Sécateur à cliquet'},
                {key: 'domain', label: 'Domaine', type: 'text', star: true, ph: 'Outillage · viticulture, arboriculture'},
                {key: 'problem', label: i18n('Problème'), type: 'text', star: true, ph: 'couper des branches épaisses sans forcer'},
                {key: 'principle', label: 'Principe', type: 'text', star: true, ph: 'lame qui avance par crans (cliquet)'},
                {key: 'date', label: i18n('Première idée'), type: 'date', star: true, ph: 'vers 1950', join: {key: 'idea_doc', sep: ' · 📄 '}},
                {key: 'idea_doc', label: i18n('Où l’idée est notée'), type: 'text', star: true, ph: 'carnet de croquis p. 14'},
                {key: 'place', label: 'Atelier', type: 'place', star: true},
                {key: 'workshop', label: 'Atelier (nom)', type: 'text', star: false, ph: 'Forge Martin'},
                {key: 'status', label: i18n('Où en est-elle'), type: 'select', choices: ISTAT, star: true, head: true},
                {key: 'users', label: i18n('Pour qui'), type: 'text', star: false, ph: 'vignerons âgés, jardiniers'},
                {key: 'materials', label: i18n('Matériaux'), type: 'text', star: false},
                {key: 'inspiration', label: i18n('D’après, inspirée de'), type: 'text', star: false},
                {key: 'idea_media', label: i18n('Carnet, plan (média)'), type: 'document', star: false}]},
            {key: 'photos', label: 'Figures, prototypes, objets', zone: 'left', fields: [{key: 'photos', label: 'Figures, prototypes, objets', type: 'photos', star: true, labels: IPHOTO, pickTitle: i18n('Figures du brevet, prototypes, objets fabriqués')}]},
            {key: 'inventors', label: 'Inventeurs', icon: '👥', zone: 'left', fields: [{key: 'inventors', label: 'Inventeurs', type: 'people', view: 'sc_people', star: true, bare: true, addLabel: i18n('Un inventeur'), rolePh: 'inventeur principal, dessins, co-inventeur (US)…', roleWord: 'inventeur'}]},
            {key: 'prizes', label: 'Prix', icon: '🏆', zone: 'left', fields: [{key: 'prizes', label: 'Prix, concours', type: 'rows', view: 'sc_prizes', star: true, bare: true, addLabel: i18n('Un prix'),
                cols: [{key: 'prize', label: 'Concours, prix', w: 'l', ph: 'Concours Lépine'}, {key: 'year', label: i18n('Année'), w: 's'}, {key: 'rank', label: i18n('Récompense'), w: 'm', ph: 'médaille d’or'}, {key: 'note', label: 'Note', w: 'm'}]}]},
            {key: 'patents', label: 'Brevets', zone: 'main', fields: [{key: 'patents', label: '📜 Brevets', type: 'rows', view: 'sc_patents', star: true, addLabel: i18n('Un brevet'), focus: 'no', unitWord: 'brevet', moreLabel: 'Titre, revendications, classe, mandataire…',
                blank: () => ({country: 'FR'}),
                cols: [{key: 'country', label: 'Pays', type: 'select', choices: COUNTRIES.map(c => [c[0], `${c[1]} ${c[2]}`]), w: 's'}, {key: 'no', label: 'N°', w: 's', ph: 'FR 1 054 321'}, {key: 'filed', label: i18n('Dépôt'), type: 'date', w: 's', ph: '4 mars 1952'}, {key: 'granted', label: i18n('Délivrance'), type: 'date', w: 's'},
                    {key: 'applicant', label: i18n('Déposant'), w: 'm', ph: 'P. MARTIN'}, {key: 'status', label: 'Statut', type: 'select', choices: PSTAT, w: 's'}, {key: 'end', label: 'Fin', w: 's', ph: '1972'}, {key: 'main', label: '★ Principal', type: 'bool', w: 's'}],
                more: [{key: 'title', label: i18n('Titre du brevet'), type: 'text'}, {key: 'claims', label: i18n('Revendications (une par ligne)')}, {key: 'cls', label: 'Classe (CIB)', type: 'text'}, {key: 'agent', label: 'Mandataire', type: 'text'}, {key: 'annuities', label: i18n('Annuités'), type: 'text'},
                    {key: 'published', label: i18n('Publié (BOPI…)'), type: 'text'}, {key: 'cited_by', label: i18n('Cité par'), type: 'text'}, {key: 'family', label: i18n('Famille de brevets'), type: 'text'}, {key: 'doc', label: i18n('Pièce (brevet complet, 4 p.…)'), type: 'text'}, {key: 'url', label: i18n('Adresse en ligne'), type: 'text'}]}]},
            {key: 'protos', label: 'Prototypes', zone: 'main', fields: [{key: 'prototypes', label: '🔧 Prototypes', type: 'rows', view: 'sc_protos', star: true, addLabel: i18n('Un prototype'), focus: 'date',
                cols: [{key: 'date', label: 'Date', w: 's'}, {key: 'name', label: 'Prototype', w: 'm', ph: 'prototype n° 1'}, {key: 'material', label: i18n('Matière'), w: 'm', ph: 'bois et fer'}, {key: 'shown', label: i18n('Présenté'), w: 'm', ph: 'au concours Lépine'}, {key: 'state', label: 'Devenu', type: 'select', choices: PROTO, w: 's'}, {key: 'where', label: i18n('Où, chez qui'), w: 'm'}]}]},
            {key: 'licences', label: i18n('Licences et exploitation'), zone: 'main', fields: [{key: 'licences', label: `🏭 ${i18n('Licences et exploitation')}`, type: 'rows', view: 'sc_licences', star: true, addLabel: i18n('Une licence'),
                cols: [{key: 'company', label: 'Entreprise', type: cellKind('employer'), w: 'l'}, {key: 'country', label: 'Pays', w: 's'}, {key: 'years', label: i18n('Années'), w: 's', ph: '1954-1972'}, {key: 'terms', label: 'Conditions', w: 'm', ph: '5 % des ventes'}, {key: 'made', label: i18n('Fabriqués'), w: 's', ph: '≈ 180 000'}]}]},
            {key: 'disputes', label: i18n('Antériorités et procès'), icon: '⚖️', zone: 'right', fields: [{key: 'disputes', label: i18n('Antériorités et procès'), type: 'rows', view: 'sc_disputes', star: true, bare: true, addLabel: i18n('Une antériorité, un procès'),
                cols: [{key: 'date', label: 'Date', w: 's'}, {key: 'kind', label: 'Sorte', type: 'select', choices: DISP, w: 's'}, {key: 'what', label: i18n('Quoi'), w: 'l', ph: 'brevet allemand DE 801 112 opposé en Italie'}, {key: 'court', label: 'Tribunal', w: 'm'}, {key: 'outcome', label: 'Issue', type: 'select', choices: OUTCOME, w: 's'}, {key: 'doc', label: i18n('Pièce'), w: 's'}]}]},
            {key: 'objects', label: i18n('Objets fabriqués'), icon: '📦', zone: 'right', fields: [
                {key: 'objects', label: i18n('Objets fabriqués'), type: 'rows', view: 'sc_objects', star: true, bare: true, addLabel: i18n('Un objet'),
                    cols: [{key: 'name', label: i18n('Modèle, objet'), w: 'm', ph: 'Modèle « Pradier 54 »'}, {key: 'obj', label: i18n('Fiche de l’exemplaire'), type: 'item', kinds: ['copy'], w: 'm'}, {key: 'year', label: i18n('Année'), w: 's'}, {key: 'where', label: i18n('Où'), w: 'm'}, {key: 'color', label: 'Couleur (#8a8f99)', w: 's'}]},
                {key: 'objects_note', label: i18n('Note sur les objets'), type: 'text', star: true, bare: true, ph: 'exemplaires de la famille, catalogue de vente 1956'}]},
            {key: 'rel', label: i18n('Inventions et découvertes liées'), icon: '🔗', zone: 'right', fields: [{key: 'related', label: i18n('Liées'), type: 'rows', view: 'sc_irel', star: true, bare: true, addLabel: i18n('Un lien'),
                cols: [{key: 'link', label: 'Lien', type: 'select', choices: IREL, w: 's'}, {key: 'to', label: i18n('Fiche'), type: 'item', kinds: ['invention', 'discovery', 'paper', 'copy'], w: 'l'}]}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        list: ['photos', 'title', 'date', 'domain', '_patents', 'place', 'status'], card: ['date', 'domain', '_patents'],
        export: ['photos', 'title', 'date', 'domain', 'problem', 'principle', 'place', 'inventors', 'patents', 'prototypes', 'licences', 'disputes', 'prizes', 'notes'],
        listExtra: [{key: '_patents', label: 'Brevets', type: 'computed', view: 'sc_patent_count'}],
        searchHint: i18n('ex. sécateur, FR 1 054 321, Lépine, 1952'),
        filters: store => { const l = store.of('invention'), doms = [...new Set(l.map(i => String(i.data.domain || '').trim()).filter(Boolean))].sort(), cs = [...new Set(l.flatMap(i => ART.arr(i.data.patents).map(p => p.country)).filter(Boolean))];
            return [{id: 'dom', label: 'Domaine', group: 'Domaine', type: 'check', options: doms.map(d => [d, `${d} (${l.filter(i => i.data.domain === d).length})`]), test: (it, v) => !v?.length || v.includes(it.data.domain)},
                {id: 'country', label: i18n('Breveté en'), group: i18n('Breveté en'), type: 'check', options: cs.map(c => [c, `${flag(c)} ${cname(c)}`]), test: (it, v) => !v?.length || ART.arr(it.data.patents).some(p => v.includes(p.country))},
                {id: 'st', label: i18n('Où en est-elle'), group: i18n('Où en est-elle'), type: 'check', options: ISTAT.filter(x => x[0] && l.some(i => i.data.status === x[0])).map(x => [x[0], x[1]]), test: (it, v) => !v?.length || v.includes(it.data.status)},
                {id: 'pat', label: i18n('Avec au moins un brevet'), group: 'Autres', type: 'check', test: (it, v) => !v || ART.arr(it.data.patents).length > 0},
                {id: 'live', label: i18n('Brevet encore en vigueur'), group: 'Autres', type: 'check', test: (it, v) => !v || ART.arr(it.data.patents).some(p => ['vigueur', 'delivre', 'depose', 'examen'].includes(p.status))},
                {id: 'lic', label: i18n('Exploitée (licence)'), group: 'Autres', type: 'check', test: (it, v) => !v || ART.arr(it.data.licences).length > 0}]; },
        sorts: [['year', i18n('Par année')], ['recent', i18n('Les plus récentes')], ['patents', i18n('Le plus de brevets')], ['az', 'A → Z'], ['za', 'Z → A'], ['perso', 'Mon ordre']],
    });

    /* ═════════ 🔬 DÉCOUVERTE (maquette N) : la sorte change les champs ═════════ */
    const DK = [['plante', '🌿', i18n('Espèce nouvelle (plante)'), 'bio'], ['animal', '🦋', i18n('Espèce nouvelle (animal)'), 'bio'], ['champignon', '🍄', 'Champignon, lichen', 'bio'], ['microbe', '🦠', 'Micro-organisme, virus', 'bio'],
        ['comete', '☄️', i18n('Comète'), 'astro'], ['asteroide', '🪨', i18n('Astéroïde, petite planète'), 'astro'], ['astre', '✨', i18n('Étoile, exoplanète, galaxie'), 'astre'], ['gene', '🧬', i18n('Gène'), 'gene'], ['molecule', '⚗️', i18n('Molécule, élément chimique'), 'molecule'],
        ['maladie', '🩺', 'Maladie, traitement', 'maladie'], ['fossile', '🦴', 'Fossile', 'fossile'], ['mineral', '💎', i18n('Minéral'), 'mineral'], ['site', '🏺', i18n('Site archéologique'), 'site'], ['grotte', '🕳', 'Grotte, gouffre', 'grotte'],
        ['epave', '⚓', i18n('Épave'), 'epave'], ['manuscrit', '📜', i18n('Manuscrit, archive, trésor'), 'manuscrit'], ['loi', '∑', i18n('Loi, théorème, méthode'), 'loi'], ['source', '💧', i18n('Source, gisement'), 'source'], ['geo', '🗺', i18n('Lieu (col, lac, île, sommet…)'), 'geo'], ['autre', '🔬', i18n('Autre découverte'), 'autre']];
    const SPEC = {
        bio: [['taxon', 'Nom scientifique complet', 'Ophrys martinii Garrigues, 1957'], ['rank', 'Rang', i18n('espèce, sous-espèce, variété')], ['family', 'Famille', i18n('Orchidacées')], ['holotype', i18n('Holotype (spécimen type)'), i18n('herbier du Muséum, Paris')], ['collection', i18n('N° de collection'), 'P00412233'], ['habitat', 'Milieu', 'coteau calcaire'], ['protection', 'Protection', i18n('protégée en Limousin')]],
        astro: [['designation', i18n('Désignation'), 'C/1956 R1, (31042)'], ['orbit', 'Orbite', i18n('période 6,4 ans, périhélie 1,2 ua')], ['observatory', 'Observatoire', i18n('Pic du Midi')], ['instrument', 'Instrument', i18n('lunette de 60 cm')], ['magnitude', i18n('Éclat (magnitude)'), '9,5']],
        astre: [['designation', i18n('Désignation')], ['constellation', 'Constellation'], ['method', i18n('Méthode'), 'transit, vitesse radiale…'], ['instrument', 'Instrument'], ['distance', 'Distance']],
        gene: [['organism', 'Organisme', i18n('blé tendre')], ['chromosome', 'Chromosome'], ['function', 'Fonction'], ['genbank', 'N° GenBank']],
        molecule: [['formula', 'Formule'], ['cas', 'N° CAS'], ['use', 'Usage'], ['process', i18n('Procédé')]],
        maladie: [['agent', 'Cause, agent'], ['signs', 'Signes'], ['treatment', 'Traitement'], ['patients', 'Premiers malades']],
        fossile: [['age', i18n('Âge'), i18n('Jurassique, 150 millions d’années')], ['layer', 'Couche'], ['deposit', 'Gisement'], ['collection', 'Collection, n°']],
        mineral: [['formula', 'Formule'], ['system', i18n('Système cristallin')], ['ima', 'N° IMA'], ['type_locality', i18n('Localité type')]],
        site: [['period', i18n('Période'), i18n('Néolithique')], ['digs', 'Fouilles (campagnes)', '1958, 1961-1964'], ['finds', i18n('Objets trouvés')], ['museum', i18n('Musée, dépôt')], ['protection', 'Protection', i18n('classé monument historique 1967')]],
        grotte: [['size', i18n('Développement, profondeur')], ['decor', i18n('Ornée, remplissage')], ['protection', 'Protection']],
        epave: [['ship', 'Navire'], ['sunk', 'Naufrage'], ['depth', 'Profondeur'], ['finds', i18n('Objets remontés')]],
        manuscrit: [['fonds', i18n('Fonds, bibliothèque')], ['cote', 'Cote'], ['dating', 'Datation'], ['content', 'Contenu']],
        loi: [['statement', i18n('Énoncé')], ['proof', i18n('Preuve, démonstration')], ['branch', 'Branche']],
        source: [['resource', 'Ressource'], ['flow', i18n('Débit, réserve')], ['use', 'Exploitation']],
        geo: [['feature', i18n('Sorte (col, lac, île…)')], ['height', 'Altitude, taille'], ['old_name', 'Nom local, ancien nom']],
        autre: [['what', i18n('Quoi exactement')], ['detail', i18n('Précisions')]]};
    const dkOf = k => DK.find(x => x[0] === k) || DK[DK.length - 1];
    SC.DK = DK; SC.dkOf = dkOf;
    const specFields = dk => SPEC[dkOf(dk)[3]] || SPEC.autre;
    const specVal = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    const specEdit = (dk, v) => `<div class="ar-egrid sc-spec" data-sc-spec="${esc(JSON.stringify(specVal(v)))}">${specFields(dk).map(([k, l, ph]) => `<label class="ar-fld"><span class="ar-flab">${esc(l)}</span><input class="ar-in" data-sp="${esc(k)}" value="${esc(specVal(v)[k] || '')}" ${ph ? `placeholder="${esc(ph)}"` : ''}></label>`).join('')}<p class="ar-note is-wide">${esc(dkOf(dk)[1])} ${i18n('Ces champs changent avec la « Sorte » : comète (désignation, orbite, observatoire), gène (organisme, chromosome, n° GenBank), site archéologique (période, fouilles, musée), fossile (âge, couche, gisement)…')}</p></div>`;
    ART.ft.sc_spec = {label: i18n('Selon la sorte'), badge: '🗂', wide: true, block: true,
        edit: (f, v, ctx) => specEdit(ctx.draft?.dkind || ctx.item?.data?.dkind, v),
        get: el => { const box = el.querySelector('[data-sc-spec]'); let o = {}; try { o = JSON.parse(box?.dataset.scSpec || '{}'); } catch (_) {} box?.querySelectorAll('[data-sp]').forEach(i => { const t = i.value.trim(); if (t) o[i.dataset.sp] = t; else delete o[i.dataset.sp]; }); return o; },
        read: (f, v, ctx) => { const o = specVal(v), l = specFields(ctx.item?.data?.dkind).filter(([k]) => String(o[k] || '').trim()); return l.length ? `<dl class="ar-dl">${l.map(([k, la]) => `<dt>${esc(la)}</dt><dd>${esc(o[k])}</dd>`).join('')}</dl>` : ''; },
        text: (f, v, ctx) => specFields(ctx?.item?.data?.dkind).map(([k]) => specVal(v)[k]).filter(x => typeof x === 'string' && x.trim()).join(' · '), empty: v => !Object.values(specVal(v)).some(x => String(x || '').trim())};
    // la sorte change : les champs « selon la sorte » changent tout de suite (ce qui est déjà écrit est gardé)
    document.addEventListener('change', e => {
        const sel = e.target.closest?.('.ar-dlg [data-fk="dkind"] select'); if (!sel) return;
        const box = sel.closest('[data-ar-form]')?.querySelector('[data-fk="spec"] [data-sc-spec]'); if (!box) return;
        const o = ART.ft.sc_spec.get(box.parentElement); const tmp = document.createElement('div'); tmp.innerHTML = specEdit(sel.value, o); box.replaceWith(tmp.firstElementChild);
    });
    const NSTAT = [['', '—'], ['provisoire', 'nom provisoire'], ['publie', i18n('publié')], ['accepte', i18n('accepté')], ['officiel', 'officiel (UAI, IMA…)'], ['synonyme', 'synonyme'], ['retrograde', i18n('rétrogradé (sous-espèce…)')], ['remplace', i18n('remplacé')], ['invalide', 'invalide']];
    const RECOG = [['', '—'], ['reconnue', 'reconnue'], ['attente', i18n('en attente')], ['contestee', i18n('contestée')], ['retrogradee', i18n('rétrogradée')], ['refutee', i18n('réfutée')]];
    const CTRV = [['acceptee', i18n('acceptée')], ['prix', 'prix, distinction'], ['confirmee', i18n('confirmée')], ['contestee', i18n('priorité contestée')], ['critiquee', i18n('critiquée')], ['retrogradee', i18n('rétrogradée')], ['refutee', i18n('réfutée')], ['renommee', i18n('renommée')], ['autre', 'autre']];
    const DPUB = [['premiere', i18n('Première description')], ['annonce', 'Annonce'], ['confirmation', 'Confirmation'], ['revision', i18n('Révision')], ['contestation', 'Contestation'], ['vulgarisation', 'Article grand public'], ['autre', 'Autre']];
    const CHAIN = [['publiee', i18n('publiée dans')], ['menee', i18n('a mené à')], ['confirme', 'confirme'], ['contredit', 'contredit'], ['meme', i18n('découverte en même temps que')], ['nommee', i18n('nommée d’après')], ['fabriquee', i18n('fabriquée')], ['autre', i18n('liée à')]];
    const DPHOTO = [['specimen', i18n('Spécimen')], ['station', i18n('Lieu, station')], ['planche', 'Planche'], ['etiquette', i18n('Étiquette')], ['observation', 'Observation'], ['carte', i18n('Carte')], ['autre', 'Autre']];
    SC.CHAIN = CHAIN;
    ART.views.sc_italic = {read: (ctx, it, f, v) => `<i>${esc(v)}</i>`};
    ART.views.sc_dmap = {read: (ctx, it) => { const d = it.data || {}, pl = U.place(d.place); if (!pl?.plid && !SC.parseCoords(d.coords)) return '';
        return SC.mapSlot([{color: '#7b2ff7', pts: [{plid: pl?.plid || 0, coords: d.coords || '', label: d.place_detail || U.placeTitle(d.place), show: true}]}], {height: 560, empty: i18n('Ce lieu n’a pas encore ses coordonnées (fiche du lieu, ou « Coordonnées » ici).')}); }};
    ART.views.sc_dpubs = {actions: (ctx, it) => it.id ? `<button type="button" class="button small secondary" data-ar-cmd="edit">＋ ${i18n('Ajouter')}</button>` : '',
        read: (ctx, it, f, v) => `<div class="ar-scroll"><table class="ar-t"><thead><tr><th>Date</th><th>Publication</th><th>Auteurs</th><th></th></tr></thead><tbody>${(v || []).map(r => { const ref = U.ref(r.ref), p = ref?.iid ? ctx.store.get(ref.iid) : null, doi = String(r.doi || p?.data?.doi || '').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim();
            return `<tr><td>${esc(r.date || p?.year || '')}</td><td>${r.what ? `<b>${esc(lab(DPUB, r.what))}</b> · ` : ''}${ref?.iid ? U.refChip(r.ref, '📄') : esc(ref?.txt || '')}</td><td>${esc(r.authors || '')}</td><td>${/^10\.\d{4,9}\//.test(doi) ? `<a href="https://doi.org/${esc(encodeURI(doi))}" target="_blank" rel="noopener noreferrer">DOI ↗</a>` : r.doc ? `📄 ${esc(r.doc)}` : ''}</td></tr>`; }).join('')}</tbody></table></div>`};
    ART.views.sc_ctrv = {read: (ctx, it, f, v) => timeline(v || [], (r, i, l) => `<div class="ar-ev ${['contestee', 'critiquee', 'refutee'].includes(r.kind) ? 'sale' : ''} ${i === l.length - 1 ? 'now' : ''}"><b>${esc(r.date || '?')}</b> · ${['contestee', 'refutee'].includes(r.kind) ? `<b>${esc(lab(CTRV, r.kind))}</b>` : esc(lab(CTRV, r.kind))}${r.text ? ` : ${esc(r.text)}` : ''}${docChip(r.doc)}</div>`)};
    /** la chaîne « découverte → publiée dans → publication → a mené à → invention → fabriquée → objet » */
    const FREE = {publiee: ['📚', 'Publication'], menee: ['💡', 'Invention'], fabriquee: ['📦', 'Objet'], nommee: ['🏷', i18n('Nommée d’après')], confirme: ['🔬', i18n('Découverte')], contredit: ['🔬', i18n('Découverte')], meme: ['🔬', i18n('Découverte')]};
    const ent = (ctx, ref, link = '') => { const r = U.ref(ref); if (!r) return ''; const o = r.iid ? ctx.store.get(r.iid) || ctx.store.links.find(l => l.other?.id === r.iid)?.other : null, d = ART.defs[o?.kind || r.kind] || (FREE[link] ? {icon: FREE[link][0], label: FREE[link][1]} : {});
        return `<${r.iid ? `button type="button" data-ar-open="${r.iid}"` : 'div'} class="sc-ent ${o?.kind === 'invention' ? 'x' : ''}"><b>${esc(d.icon || '✦')} ${esc(d.label || i18n('Fiche'))}</b><small>${esc([o?.title || r.title || r.txt, o?.year].filter(Boolean).join(', '))}</small></${r.iid ? 'button' : 'div'}>`; };
    ART.views.sc_flow = {read: (ctx, it, f, v) => { const l = (v || []).filter(r => U.ref(r.to)); if (!l.length) return '';
        return `<div class="sc-flow"><div class="sc-ent core"><b>${esc(ART.defs[it.kind]?.icon || '')} ${esc(ART.defs[it.kind]?.label || '')}</b><small>${esc([it.title, it.year].filter(Boolean).join(', '))}</small></div>${l.map(r => `<div class="sc-arr">↓ ${esc(lab(CHAIN, r.link || 'autre'))}</div>${ent(ctx, r.to, r.link)}`).join('')}</div><p class="ar-note">${i18n('Liens possibles : « publiée dans », « a mené à », « confirme », « contredit », « découverte en même temps que », « nommée d’après ».')}</p>`; }};

    ART.define({key: 'discovery', icon: '🔬', label: i18n('Découverte'), many: i18n('Découvertes'), fem: true, domain: 'science', profile: 'scientist',
        eyebrow: it => [i18n('Découverte'), it.data?.dkind ? dkOf(it.data.dkind)[2] : '', it.data?.domain].filter(Boolean).join(' · '),
        heading: (ctx, it) => { const d = it.data || {}; return `<h2 class="ar-h2">${esc(it.title)}${d.date || d.place ? ` <small>· ${esc([d.date, U.placeTitle(d.place)].filter(Boolean).join(' · '))}</small>` : ''}</h2>`; },
        badges: (ctx, it) => { const d = it.data || {}, b = [`<span class="ar-badge b">${esc(dkOf(d.dkind)[1])} ${esc(dkOf(d.dkind)[2])}</span>`];
            if (d.recognition) b.push(`<span class="ar-badge ${d.recognition === 'reconnue' ? 'ok' : ['contestee', 'refutee', 'retrogradee'].includes(d.recognition) ? 'w' : ''}">${d.recognition === 'reconnue' ? '✓ ' : ''}${esc(lab(RECOG, d.recognition))}</span>`);
            if (d.name_status) b.push(`<span class="ar-badge">🏷 ${esc(lab(NSTAT, d.name_status))}</span>`); return `<div class="ar-badges">${b.join('')}</div>`; },
        cardLine: it => [it.data?.date, dkOf(it.data?.dkind)[2], it.data?.sci_name].filter(Boolean).join(' · '),
        newData: () => ({dkind: 'plante', recognition: 'reconnue'}),
        beforeSave: d => { d.dkind_label = dkOf(d.dkind)[2]; },
        groups: [
            {key: 'main', label: i18n('La découverte'), zone: 'main', fields: [
                {key: 'title', label: i18n('Nom de la découverte'), type: 'text', star: true, head: true, ph: 'Ophrys martinii (l’Ophrys de Laguenne)'},
                {key: 'dkind', label: 'Sorte', type: 'select', choices: DK.map(x => [x[0], `${x[1]} ${x[2]}`]), star: true, head: true},
                {key: 'domain', label: 'Domaine', type: 'text', star: true, ph: 'Botanique · orchidées'},
                {key: 'date', label: 'Date', type: 'date', star: true, ph: '12 mai 1956'},
                {key: 'discoverers', label: i18n('Découvreurs'), type: 'people', view: 'sc_people', star: true, addLabel: i18n('Un découvreur'), rolePh: i18n('a trouvé la plante, a décrit l’espèce…'), roleWord: i18n('découvreur')},
                {key: 'method', label: i18n('Méthode'), type: 'text', star: true, ph: 'herborisation · comparaison au Muséum · caryotype (1978)'},
                {key: 'specimen', label: i18n('Spécimen type'), type: 'text', star: true, ph: 'Holotype : herbier du Muséum, Paris · P00412233'},
                {key: 'recognition', label: i18n('Reconnue ou contestée'), type: 'select', choices: RECOG, star: true, head: true},
                {key: 'instrument', label: 'Instrument, outil', type: 'text', star: false},
                {key: 'context', label: 'Circonstances', type: 'longtext', star: false, rows: 3}]},
            {key: 'spec', label: i18n('Selon la sorte'), zone: 'main', fields: [{key: 'spec', label: `🗂 ${i18n('Selon la sorte')}`, short: i18n('Selon la sorte'), type: 'sc_spec', star: true, secLabel: `🗂 ${i18n('Selon la sorte')}`}]},
            {key: 'naming', label: 'Nommage', zone: 'main', fields: [
                {key: 'sci_name', label: 'Nom', type: 'text', view: 'sc_italic', star: true, ph: 'Ophrys martinii', join: {key: 'name_author', sep: ' '}},
                {key: 'name_author', label: i18n('Auteur et année du nom'), type: 'text', star: true, ph: 'Garrigues, 1957'},
                {key: 'honoree', label: i18n('En l’honneur de'), type: 'person', star: true, roleWord: i18n('nommée en son honneur'), join: {key: 'honoree_note', sep: ' ', small: ''}},
                {key: 'honoree_note', label: i18n('Pourquoi ce nom'), type: 'text', star: true, ph: '(son père, naturaliste amateur)'},
                {key: 'name_status', label: i18n('Statut du nom'), type: 'select', choices: NSTAT, star: true, join: {key: 'status_note', sep: ' → '}},
                {key: 'status_note', label: i18n('Précision du statut'), type: 'text', star: true, ph: 'synonyme de Ophrys aranifera subsp. … depuis 2005'},
                {key: 'common_name', label: 'Nom commun', type: 'text', star: true, ph: 'Ophrys de Laguenne'},
                {key: 'other_names', label: 'Autres noms', type: 'text', star: false}]},
            {key: 'photos', label: 'Photos', zone: 'left', fields: [{key: 'photos', label: i18n('Spécimen, lieu, planche, étiquette'), type: 'photos', star: true, labels: DPHOTO, pickTitle: i18n('Les images de la découverte')}]},
            {key: 'where', label: i18n('Lieu de la découverte'), icon: '🗺', zone: 'left', fields: [
                {key: '_map', label: i18n('Carte'), type: 'computed', view: 'sc_dmap', star: true},
                {key: 'place', label: i18n('Lieu'), type: 'place', star: true},
                {key: 'place_detail', label: i18n('Endroit précis'), type: 'text', star: true, ph: 'Puy de Laguenne, coteau calcaire'},
                {key: 'coords', label: i18n('Coordonnées'), type: 'text', star: true, ph: '45.24 N, 1.78 E'},
                {key: 'altitude', label: 'Altitude, profondeur', type: 'text', star: true, ph: '380 m'}]},
            {key: 'pubs', label: 'Publications', zone: 'main', fields: [{key: 'publications', label: '📚 Publications', type: 'rows', view: 'sc_dpubs', star: true, addLabel: i18n('Une publication'), focus: 'date',
                cols: [{key: 'date', label: 'Date', w: 's'}, {key: 'what', label: 'Sorte', type: 'select', choices: DPUB, w: 's'}, {key: 'ref', label: i18n('Publication (fiche ou texte)'), type: 'item', kinds: ['paper', 'book'], w: 'l'}, {key: 'authors', label: 'Auteurs', w: 'm'}, {key: 'doi', label: 'DOI', w: 's', ph: '10.…'}, {key: 'doc', label: i18n('Pièce'), w: 's'}]}]},
            {key: 'ctrv', label: i18n('Reconnaissance et controverses'), zone: 'main', fields: [{key: 'controversy', label: `⚖️ ${i18n('Reconnaissance et controverses')}`, type: 'rows', view: 'sc_ctrv', star: true, addLabel: i18n('Une étape'), focus: 'date',
                cols: [{key: 'date', label: 'Date', w: 's'}, {key: 'kind', label: i18n('Quoi'), type: 'select', choices: CTRV, w: 's'}, {key: 'text', label: i18n('Précision'), w: 'l', ph: 'un abbé de Brive dit l’avoir vue en 1951'}, {key: 'doc', label: i18n('Pièce'), w: 's', ph: 'lettres'}]}]},
            {key: 'chain', label: i18n('Liens entre découvertes et inventions'), icon: '🔗', zone: 'right', fields: [{key: 'chain', label: 'Liens', type: 'rows', view: 'sc_flow', star: true, bare: true, addLabel: i18n('Un lien'),
                cols: [{key: 'link', label: 'Lien', type: 'select', choices: CHAIN, w: 's'}, {key: 'to', label: i18n('Fiche liée'), type: 'item', kinds: ['paper', 'invention', 'discovery', 'copy', 'book'], w: 'l'}]}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        list: ['photos', 'title', 'date', 'dkind', 'domain', 'place', 'recognition'], card: ['date', 'dkind'],
        export: ['photos', 'title', 'dkind', 'domain', 'date', 'place', 'discoverers', 'method', 'specimen', 'spec', 'sci_name', 'honoree', 'name_status', 'publications', 'controversy', 'notes'],
        searchHint: i18n('ex. ophrys, comète, Laguenne, 1956'),
        filters: store => { const l = store.of('discovery');
            return [{id: 'dk', label: 'Sorte', group: 'Sorte', type: 'check', options: DK.filter(x => l.some(i => i.data.dkind === x[0])).map(x => [x[0], `${x[1]} ${x[2]} (${l.filter(i => i.data.dkind === x[0]).length})`]), test: (it, v) => !v?.length || v.includes(it.data.dkind)},
                {id: 'rec', label: 'Reconnaissance', group: 'Reconnaissance', type: 'check', options: RECOG.filter(x => x[0]).map(x => [x[0], x[1]]), test: (it, v) => !v?.length || v.includes(it.data.recognition)},
                {id: 'place', label: i18n('Lieu'), type: 'place', chipPrefix: 'À', test: (it, v) => !v || (typeof v === 'object' ? U.place(it.data.place)?.plid === Number(v.id) : U.placeTitle(it.data.place).toLowerCase().includes(String(v).replace(/^txt:/, '').toLowerCase()))},
                {id: 'from', label: 'De', group: i18n('Période'), type: 'text', placeholder: '1900', test: (it, v) => !v || (Number(it.year) || 0) >= Number(v)},
                {id: 'to', label: 'À', group: i18n('Période'), type: 'text', placeholder: '1999', test: (it, v) => !v || (Number(it.year) || 9999) <= Number(v)},
                {id: 'named', label: i18n('Porte le nom de quelqu’un'), group: 'Autres', type: 'check', test: (it, v) => !v || !!U.person(it.data.honoree)}]; },
        sorts: [['year', i18n('Par année')], ['recent', i18n('Les plus récentes')], ['az', 'A → Z'], ['za', 'Z → A'], ['perso', 'Mon ordre']],
    });

    /* ═════════ 📄 PUBLICATION SCIENTIFIQUE (fiche « Écrit · article » de la maquette Y) ═════════ */
    const PTYPE = [['article', i18n('Article de revue')], ['communication', i18n('Communication, congrès')], ['livre', 'Livre'], ['chapitre', i18n('Chapitre de livre')], ['these', i18n('Thèse')], ['rapport', 'Rapport'], ['note', 'Note, compte rendu'], ['preprint', i18n('Prépublication')], ['vulgarisation', 'Article grand public'], ['autre', 'Autre']];
    SC.PTYPE = PTYPE;
    ART.views.sc_authors = {read: (ctx, it, f, v) => { const l = ART.normPeople(v); return l.length ? `<div class="sc-authors">${l.map((r, i) => `<span class="sc-au"><small>${i + 1}.</small>${U.personChip(r, r.role, ctx)}</span>`).join('')}</div>` : ''; }};
    SC.journalOf = it => refTitle(it.data?.journal, 'perid') || it.data?.journal_txt || '';
    ART.define({key: 'paper', icon: '📄', label: 'Publication', many: 'Publications', fem: true, domain: 'science', profile: 'scientist', tab: 'Publications',
        eyebrow: it => ['Publication', lab(PTYPE, it.data?.ptype || 'article')].join(' · '),
        heading: (ctx, it) => { const d = it.data || {}; return `<h2 class="ar-h2">${esc(it.title)} <small>· ${esc([d.year || d.date, [SC.journalOf(it), d.volume].filter(Boolean).join(' '), d.pages && `p. ${d.pages}`].filter(Boolean).join(' · '))}</small></h2>`; },
        badges: (ctx, it) => { const d = it.data || {}, b = []; if (d.citations !== '' && d.citations != null) b.push(`<span class="ar-badge b">${esc(plural(Number(String(d.citations).replace(/\s/g, '')) || 0, 'citation'))}</span>`); const doi = String(d.doi || '').trim(); if (/^10\./.test(doi)) b.push(`<a class="ar-badge" href="https://doi.org/${esc(encodeURI(doi))}" target="_blank" rel="noopener noreferrer">DOI ↗</a>`); if (d.hal) b.push(`<span class="ar-badge">HAL</span>`); return b.length ? `<div class="ar-badges">${b.join('')}</div>` : ''; },
        cardLine: it => [it.data?.year || it.year, SC.journalOf(it)].filter(Boolean).join(' · '),
        newData: () => ({ptype: 'article'}),
        beforeSave: d => { d.journal_txt = refTitle(d.journal, 'perid'); if (!d.year && d.date) d.year = U.yearOf(d.date); },
        groups: [
            {key: 'main', label: i18n('La publication'), zone: 'main', fields: [
                {key: 'title', label: 'Titre', type: 'text', star: true, head: true},
                {key: 'authors', label: i18n('Auteurs (dans l’ordre)'), type: 'people', view: 'sc_authors', star: true, addLabel: i18n('Un auteur'), rolePh: i18n('rôle (facultatif) : dernier auteur, correspondant…'), roleWord: 'co-auteur'},
                {key: 'ptype', label: 'Sorte', type: 'select', choices: PTYPE, star: true},
                {key: 'year', label: i18n('Année'), type: 'text', star: true, ph: '1974'},
                {key: 'date', label: 'Date exacte', type: 'date', star: false},
                {key: 'journal', label: 'Revue', type: 'periodical', star: true, join: {key: 'volume', sep: ' · vol. '}},
                {key: 'volume', label: 'Volume', type: 'text', star: true},
                {key: 'issue', label: i18n('Numéro'), type: 'text', star: true},
                {key: 'pages', label: 'Pages', type: 'text', star: true, ph: '211-214'},
                {key: 'publisher', label: i18n('Éditeur, congrès'), type: 'text', star: false},
                {key: 'doi', label: 'DOI', type: 'ident', star: true, ph: '10.1038/251123a0', href: v => /^10\./.test(v) ? `https://doi.org/${encodeURI(v)}` : ''},
                {key: 'hal', label: 'HAL', type: 'ident', star: false, ph: 'hal-01234567', href: v => /^[a-z]+-\d+/.test(v) ? `https://hal.science/${encodeURIComponent(v)}` : ''},
                {key: 'pmid', label: 'PubMed', type: 'ident', star: false, href: v => /^\d{4,10}$/.test(v) ? `https://pubmed.ncbi.nlm.nih.gov/${v}/` : ''},
                {key: 'isbn', label: 'ISBN', type: 'text', star: false},
                {key: 'url', label: 'Adresse', type: 'url', star: false},
                {key: 'citations', label: 'Citations', type: 'number', star: true},
                {key: 'lang', label: 'Langue', type: 'text', star: false},
                {key: 'keywords', label: i18n('Mots-clés'), type: 'text', star: false}]},
            {key: 'abs', label: i18n('Résumé'), zone: 'main', fields: [{key: 'abstract', label: i18n('Résumé'), type: 'longtext', star: true, section: true, rows: 6}]},
            {key: 'file', label: i18n('Le texte'), icon: '📄', zone: 'right', fields: [{key: 'pdf', label: i18n('PDF, tiré à part'), type: 'document', star: true}]},
            {key: 'links', label: i18n('Découvertes et inventions'), icon: '🔗', zone: 'right', fields: [{key: 'subjects', label: i18n('Fiches liées'), type: 'items', kinds: ['discovery', 'invention', 'expedition'], star: true}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        list: ['year', 'title', 'journal', 'authors', 'citations'], card: ['year', 'journal'],
        export: ['year', 'title', 'authors', 'journal', 'volume', 'pages', 'doi', 'citations', 'abstract'],
        searchHint: 'ex. ophrys, Nature, 1974, 10.1038',
        filters: store => { const l = store.of('paper');
            return [{id: 'pt', label: 'Sorte', group: 'Sorte', type: 'check', options: PTYPE.filter(x => l.some(i => (i.data.ptype || 'article') === x[0])).map(x => [x[0], `${x[1]} (${l.filter(i => (i.data.ptype || 'article') === x[0]).length})`]), test: (it, v) => !v?.length || v.includes(it.data.ptype || 'article')},
                {id: 'from', label: 'De', group: i18n('Période'), type: 'text', placeholder: '1957', test: (it, v) => !v || (Number(it.year) || 0) >= Number(v)},
                {id: 'to', label: 'À', group: i18n('Période'), type: 'text', placeholder: '1996', test: (it, v) => !v || (Number(it.year) || 9999) <= Number(v)},
                {id: 'doi', label: i18n('Avec un DOI'), group: 'Autres', type: 'check', test: (it, v) => !v || /^10\./.test(String(it.data.doi || ''))},
                {id: 'pdf', label: i18n('Avec le PDF'), group: 'Autres', type: 'check', test: (it, v) => !v || !!ART.mediaOf(it.data.pdf)}]; },
        sorts: [['year', i18n('Par année')], ['recent', i18n('Les plus récentes')], ['citations', i18n('Les plus citées')], ['az', 'A → Z'], ['za', 'Z → A']],
    });
    // des tris de plus pour les listes (ART.sorters : extension du tri du moteur, heritage-artist-list.js)
    ART.sorters = ART.sorters || {};
    ART.sorters.citations = (a, b) => (U.num(b.data?.citations) || 0) - (U.num(a.data?.citations) || 0) || (Number(a.year) || 9999) - (Number(b.year) || 9999);
    ART.sorters.patents = (a, b) => ART.arr(b.data?.patents).length - ART.arr(a.data?.patents).length || String(a.title).localeCompare(String(b.title), 'fr');
    SC.yr = yr;

    /* ═════════ Pour les sections de la page (profils inventeur, scientifique, explorateur) ═════════ */
    /** la fiche de profil de la personne (une par profil) */
    SC.prof = (C, key) => C.store.of(`profile_${key}`)[0] || null;
    SC.pdata = (C, key) => SC.prof(C, key)?.data || {};
    SC.editBtn = key => `<button type="button" class="icon-button small" data-sc-editprofile="${esc(key)}" title="${esc(i18n('Modifier'))}">…</button>`;
    SC.newBtn = (kind, label) => `<button type="button" class="button small secondary" data-sc-new="${esc(kind)}">＋ ${esc(label)}</button>`;
    SC.allBtn = kind => `<button type="button" class="button small secondary" data-ar-tab="${esc(kind)}">${i18n('Tout voir')}</button>`;
    SC.empty = (text, kind = '', label = '') => `<p class="muted">${esc(text)}</p>${kind ? `<div class="ar-row">${SC.newBtn(kind, label)}</div>` : ''}`;
    /** une ligne de tableau d'une fiche de profil, lue avec son type de champ (pastilles, lieux…) */
    SC.rowsRead = (C, key, field) => { const p = SC.prof(C, key); if (!p) return ''; const f = ART.fieldsOf(ART.defs[`profile_${key}`]).find(x => x.key === field); return f ? ART.read(ART.ctx(C.store, p), p, f) : ''; };
    /** déclarer une section de page ; profiles = les profils qui la montrent (le premier est son profil) */
    SC.section = (key, o) => { ART.pageSections[key] = {w: '½', ...o, profile: o.profiles[0], profiles: o.profiles}; };
    SC.COLORS = ['#e1a500', '#d0182f', '#055dff', '#1aa34a', '#7b2ff7', '#d9488f', '#0aa1a8', '#8a5a2b'];
    document.addEventListener('click', async e => {
        const b = e.target.closest?.('[data-sc-editprofile],[data-sc-new]'); if (!b) return; const C = b.closest('.ar-dlg')?._C; if (!C) return; e.preventDefault();
        if (b.dataset.scNew) { if (ART.defs[b.dataset.scNew]) C.newItem(b.dataset.scNew); return; }
        const kind = `profile_${b.dataset.scEditprofile}`; if (!ART.defs[kind]) return; const it = C.store.of(kind)[0];
        if (it) C.open(it.id, {edit: true}); else C.newItem(kind, {title: C.store.name});
    });
})();
