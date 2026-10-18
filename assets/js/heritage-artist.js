/* LCNDA — 🎨 Le catalogue d'un artiste : le NOYAU du moteur (serveur : lib/artist_catalog.php + lib/art_engine.php).
 *
 * Chaque sorte de fiche (disque, morceau, enregistrement, livre, œuvre d'art, exposition, film…) est une DÉFINITION :
 * des groupes de champs typés (★ = affiché au départ), des sections calculées (prises d'un morceau, éditions d'un album…),
 * des liens possibles. Les sortes intégrées sont dans heritage-artist-music.js, -art.js, -books.js, -film.js, -page.js ;
 * les sortes créées par l'utilisateur viennent de la base (art_types). L'écran de fiche (lecture et formulaire), le panneau
 * « ⚙️ Champs affichés » (heritage-artist-panel.js), les listes (heritage-artist-list.js) et le livre
 * (heritage-artist-catalogue.js) sont pilotés par ces définitions : ajouter une sorte = ajouter une définition.
 *
 * Les types de champs (texte, date, personne, lieu, image/son, liste, tableau…) sont dans heritage-artist-fields.js.
 * Valeurs dans le JSON d'une fiche : personne {pid, title} ou {txt}, lieu {plid, title}, autre fiche {iid, title, kind},
 * média {mid, f, title}. Le serveur en tire « Lié à » des deux côtés (art_people, art_links).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const P = () => window.LCNDA_PICKER || window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (...a) => A().toast(...a);
    const api = (...a) => A().api(...a);
    const post = async (action, body) => (await api(action, {}, {method: 'POST', body})).result;
    const write = (op, body = {}) => post('art_write', {op, ...body});
    const plural = (n, w, pl) => A()?.plural ? A().plural(n, w, pl) : `${n} ${w}${n > 1 ? 's' : ''}`;
    const readJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch (_) { return d; } };
    const writeJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const clone = o => JSON.parse(JSON.stringify(o ?? null));

    /* ═════════ Le registre ═════════ */
    const ART = window.LCNDA_ART = window.LCNDA_ART || {};
    Object.assign(ART, {defs: ART.defs || {}, ft: ART.ft || {}, views: ART.views || {}, pageSections: ART.pageSections || {}, models: ART.models || {}, after: ART.after || []});
    /** une sorte de fiche ; les champs reçoivent leurs valeurs par défaut */
    ART.define = def => {
        const d = {icon: '✦', many: `${def.label}s`, fem: false, domain: 'autre', list: [], card: [], export: [], ...def};
        d.groups = (d.groups || []).map(g => ({zone: 'main', icon: '', ...g, fields: (g.fields || []).map(f => ({type: 'text', ...f}))}));
        // « 🔗 Lié à » partout, en bas de la colonne de droite (se cache dans le panneau comme le reste)
        if (!d.groups.some(g => g.key === '_linked') && d.linked !== false) d.groups.push({key: '_linked', label: 'Lié à', icon: '🔗', zone: 'right', fields: [{key: '_linked', label: 'Fiches et personnes liées', type: 'computed', view: 'linked', star: true}]});
        ART.defs[d.key] = d; return d;
    };
    ART.def = k => ART.defs[k] || null;
    ART.fieldsOf = (def, cust = []) => [...def.groups.flatMap(g => g.fields), ...cust];
    const DOMAINS = [['music', '🎵 Musique'], ['art', '🖼 Art'], ['books', '📚 Livres et textes'], ['film', '🎬 Films et spectacles'], ['autre', '✦ Autres']];
    ART.DOMAINS = DOMAINS;

    /* ═════════ Petits outils communs ═════════ */
    const U = ART.util = {
        esc, plural, clone,
        money: v => { const s = String(v ?? '').trim(); if (!s) return ''; const n = Number(s.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) && /^[\d\s.,]+$/.test(s) ? `${n.toLocaleString('fr-FR', {maximumFractionDigits: 2})} €` : /€|F\b|\$/.test(s) ? s : `${s} €`; },
        num: v => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; },
        yearOf: v => { const s = String(v ?? ''); const m = s.match(/\b(1[0-9]{3}|20[0-9]{2})\b/) || s.match(/^(?:vers\s+|an\s+)?(\d{1,4})$/i); return m ? m[1] : ''; },
        secs: d => { const m = String(d || '').trim().match(/^(?:(\d+):)?(\d{1,3}):(\d{2})$/); return m ? (Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3])) : 0; },
        hms: s => !s ? '' : s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
        initials: t => String(t || '').replace(/[«»"]/g, '').split(/[\s-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?',
        slug: t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'champ',
        photoSrc: ph => ph?.f ? `media/${encodeURIComponent(ph.f)}` : (/^https:\/\//.test(ph?.u || '') ? ph.u : ''),
        /** une valeur « personne » lue de n'importe quelle forme (ancienne chaîne, {pid}, {txt}) */
        // une personne sans fiche s'écrit {pname: "René Dufour"} (le serveur la range aussi dans item_people) ; txt = même nom, pour l'affichage
        person: v => { if (!v) return null; if (typeof v === 'string') return v.trim() ? {pname: v.trim(), txt: v.trim()} : null; if (typeof v !== 'object') return null;
            if (Number(v.pid) > 0) return {pid: Number(v.pid), title: v.title || ''}; const n = v.pname || v.txt || v.name || v.title; return n ? {pname: String(n), txt: String(n)} : null; },
        ref: v => !v ? null : typeof v === 'string' ? (v.trim() ? {txt: v.trim()} : null) : typeof v === 'object' ? (Number(v.iid) > 0 ? {iid: Number(v.iid), title: v.title || '', kind: v.kind || ''} : v.txt || v.title ? {txt: String(v.txt || v.title)} : null) : null,
        place: v => !v ? null : typeof v === 'string' ? (v.trim() ? {txt: v.trim()} : null) : typeof v === 'object' ? (Number(v.plid) > 0 ? {plid: Number(v.plid), title: v.title || ''} : v.txt || v.title ? {txt: String(v.txt || v.title)} : null) : null,
    };
    U.nameOf = v => { const p = U.person(v); return p ? (p.title || p.txt || '') : ''; };
    U.refTitle = v => { const r = U.ref(v); return r ? (r.title || r.txt || '') : ''; };
    U.placeTitle = v => { const r = U.place(v); return r ? (r.title || r.txt || '') : ''; };

    /** une pastille de personne en lecture (rond d'initiales bleu/rose/gris, « ? » sans fiche), clic = ouvrir la fiche */
    U.personChip = (v, role = '', ctx = null) => {
        const p = U.person(v); if (!p) return '';
        if (!p.pid) return `<span class="ar-chip is-free" title="Personne sans fiche"><span class="ar-q">?</span>${esc(p.txt)}${role ? ` <span class="ar-role">${esc(role)}</span>` : ''}</span>`;
        const g = ctx?.genderOf?.(p.pid) || 'u', title = p.title || ctx?.personTitle?.(p.pid) || `#${p.pid}`;
        return `<button type="button" class="ar-chip" data-ar-person="${p.pid}" title="Ouvrir la fiche"><span class="ar-av ${g}">${esc(U.initials(title))}</span>${esc(title)}${role ? ` <span class="ar-role">${esc(role)}</span>` : ''}</button>`;
    };
    /** une pastille de fiche du catalogue (ou d'un lieu), clic = l'ouvrir */
    U.refChip = (v, icon = '', extra = '') => {
        const r = U.ref(v); if (!r) return '';
        if (!r.iid) return `<span class="ar-ochip is-free"><i>${esc(icon || ART.defs[r.kind]?.icon || '✦')}</i>${esc(r.txt)}${extra}</span>`;
        return `<button type="button" class="ar-ochip is-link" data-ar-open="${r.iid}"><i>${esc(icon || ART.defs[r.kind]?.icon || '✦')}</i>${esc(r.title || `#${r.iid}`)}${extra}</button>`;
    };
    U.placeChip = v => { const r = U.place(v); if (!r) return ''; return r.plid ? `<button type="button" class="ar-ochip" data-ar-place="${r.plid}"><i>📍</i>${esc(r.title)}</button>` : `<span class="ar-ochip is-free"><i>📍</i>${esc(r.txt)}</span>`; };
    U.cover = (it, cls = 'ar-cov') => { const src = U.photoSrc((it?.data?.photos || [])[0]); return src ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" data-ar-img>` : `<span class="${cls} is-empty">${esc(ART.defs[it?.kind]?.icon || '✦')}</span>`; };

    /* ═════════ Les réglages « Champs affichés » : définition + réglage global (ou propre à l'artiste) ═════════ */
    const TABS = ['fiche', 'liste', 'vignettes', 'export'];
    ART.TABS = TABS;
    /** la sorte telle qu'on la montre : groupes et champs dans l'ordre choisi, masqués notés, champs perso ajoutés */
    ART.layout = (store, kind, tab = 'fiche') => {
        const def = ART.defs[kind]; if (!def) return {groups: [], fields: [], hideEmpty: true};
        const S = store?.settingsFor?.(kind) || {}, cust = store?.customFields?.(kind) || [], groupsX = store?.customGroups?.(kind) || [];
        const T = S[tab] || {};
        const groups0 = [...def.groups.map(g => ({...g, fields: [...g.fields]})), ...groupsX.map(g => ({zone: 'right', icon: '✎', ...g, fields: [], custom: true}))];
        let mine = groups0.find(g => g.key === '_mine');
        if (!mine) { mine = {key: '_mine', label: 'Mes champs', icon: '✎', zone: 'right', fields: [], auto: true}; groups0.splice(groups0.findIndex(g => g.key === '_linked'), 0, mine); }
        cust.forEach(f => { const g = groups0.find(x => x.key === f.group) || mine; g.fields.push({...f, custom: true}); });
        const isOn = f => { const off = T.off || [], on = T.on || []; if (on.includes(f.key)) return true; if (off.includes(f.key)) return false;
            if (tab === 'fiche') return f.star !== false && (f.star || f.custom); const dl = def[{liste: 'list', vignettes: 'card', export: 'export'}[tab]] || []; return dl.includes(f.key) || (tab === 'export' && f.custom && f.type !== 'computed') || (tab !== 'fiche' && f.inList && tab === 'liste') || (tab === 'vignettes' && f.inCard) || (tab === 'export' && !dl.length && f.star && f.type !== 'computed'); };
        const order = (list, keys, k = x => x.key) => { if (!Array.isArray(keys) || !keys.length) return list; const pos = new Map(keys.map((x, i) => [x, i])); return [...list].sort((a, b) => (pos.has(k(a)) ? pos.get(k(a)) : 1e4 + list.indexOf(a)) - (pos.has(k(b)) ? pos.get(k(b)) : 1e4 + list.indexOf(b))); };
        let groups = order(groups0, T.gorder).map(g => ({...g, fields: order(g.fields, (T.forder || {})[g.key]).map(f => ({...f, on: isOn(f)}))}));
        if (tab === 'fiche') groups = groups.filter(g => g.fields.length || !g.auto);
        let fields = groups.flatMap(g => g.fields);
        if (tab !== 'fiche') fields = order([...fields, ...(def.listExtra || []).filter(x => !fields.some(f => f.key === x.key))].filter(f => (f.type !== 'computed' || tab === 'liste') && f.key !== '_linked'), T.order || def[{liste: 'list', vignettes: 'card', export: 'export'}[tab]]).map(f => ({...f, on: isOn(f)}));
        return {groups, fields, hideEmpty: store?.settings?.hideEmpty !== false, def};
    };

    /* ═════════ Les données d'un artiste (une « boutique » par catalogue ouvert) ═════════ */
    class Store {
        constructor(pid) { this.pid = pid; this.items = []; this.links = []; this.people = []; this.byId = new Map(); this.extra = new Map(); this.settings = {}; this.global = {}; this.personSet = null; this.presets = []; this.types = []; this.cited = []; this.person = {}; }
        async load() {
            const r = await api('art', {op: 'boot', person_id: this.pid});
            this.person = r.person || {}; this.items = r.items || []; this.links = r.links || []; this.people = r.people || []; this.cited = r.cited || [];
            this.global = r.settings?.global || {}; this.personSet = r.settings?.person || null; this.presets = Array.isArray(r.settings?.presets?.list) ? r.settings.presets.list : [];
            this.types = r.types || []; ART.loadTypes(this.types);
            this.items.forEach(it => { it.person_id = this.pid; it.data = it.data || {}; try { ART.defs[it.kind]?.upgrade?.(it.data); } catch (_) {} }); // les fiches d'avant : mises au format du moteur (enregistré à la prochaine modification)
            this.byId = new Map(this.items.map(i => [i.id, i]));
            this.settings = this.personSet?.own ? this.personSet : this.global;
            return this;
        }
        get name() { const p = this.person; return `${p.first_name || ''} ${String(p.last_name || '').toLocaleUpperCase('fr-FR')}`.trim() || 'Artiste'; }
        of(kind) { return this.items.filter(i => i.kind === kind).sort((a, b) => (a.sort - b.sort) || ((Number(a.year) || 9999) - (Number(b.year) || 9999))); }
        get(id) { return this.byId.get(Number(id)) || this.extra.get(Number(id)) || null; }
        /** une fiche d'un autre artiste (ouverte depuis un lien) */
        async ensure(id) {
            id = Number(id); if (this.get(id)) return this.get(id);
            const r = await api('art', {op: 'item', id}); const it = r.item; try { ART.defs[it.kind]?.upgrade?.(it.data); } catch (_) {} this.extra.set(it.id, it);
            (r.links || []).forEach(l => { if (!this.links.some(x => x.id === l.id)) this.links.push(l); });
            (r.people || []).forEach(p => { if (!this.people.some(x => x.item_id === p.item_id && x.person_id === p.person_id && x.field === p.field)) this.people.push(p); });
            return it;
        }
        linksFrom(id, type = null) { return this.links.filter(l => l.from === Number(id) && (!type || l.type === type)); }
        linksTo(id, type = null) { return this.links.filter(l => l.to === Number(id) && (!type || l.type === type)); }
        /** l'autre fiche d'un lien, vue de « id » */
        otherOf(l, id) { const oid = l.from === Number(id) ? l.to : l.from; return this.get(oid) || {...l.other, data: {}, summary: true}; }
        genderOf(pid) { const p = this.people.find(x => x.person_id === Number(pid)); return {male: 'm', female: 'f'}[p?.gender] || (Number(pid) === Number(this.pid) ? {male: 'm', female: 'f'}[this.person.gender] || 'u' : 'u'); }
        personTitle(pid) { const p = this.people.find(x => x.person_id === Number(pid)); return p?.name || (Number(pid) === Number(this.pid) ? this.name : ''); }
        settingsFor(kind) { return this.settings?.kinds?.[kind] || {}; }
        customFields(kind) { return [...(this.global?.kinds?.[kind]?.custom || []), ...(this.personSet?.kinds?.[kind]?.custom || [])]; }
        customGroups(kind) { return [...(this.global?.kinds?.[kind]?.groups || []), ...(this.personSet?.kinds?.[kind]?.groups || [])]; }
        async saveSettings(scope = null) {
            const own = !!this.personSet?.own, key = scope || (own ? `person:${this.pid}` : 'global');
            const data = key === 'global' ? this.global : this.personSet;
            await write('save_settings', {key, data});
        }
    }
    ART.Store = Store;
    /** les sortes créées par l'utilisateur (dans la base) entrent dans le registre */
    ART.loadTypes = types => (types || []).forEach(t => { const d = t.def || {}; if (!ART.defs[t.key] || ART.defs[t.key].userType) ART.define({...d, key: t.key, label: t.label || d.label || 'Sorte', icon: d.icon || '✦', many: d.many || `${t.label}s`, domain: d.domain || 'autre', userType: true, groups: Array.isArray(d.groups) && d.groups.length ? d.groups : [{key: 'main', label: t.label, zone: 'main', fields: [{key: 'title', label: 'Titre', type: 'text', star: true}, {key: 'date', label: 'Date', type: 'date', star: true}]}, {key: 'photos', label: 'Photos', zone: 'left', fields: [{key: 'photos', label: 'Photos', type: 'photos', star: true}]}, {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true}]}], list: d.list || ['title', 'date'], card: d.card || ['date']}); });

    /* ═════════ L'écran d'une fiche : lecture ═════════ */
    /** le contexte passé aux types de champs et aux vues */
    const mkCtx = (store, it, extra = {}) => ({store, item: it, pid: store.pid, def: ART.defs[it?.kind], genderOf: pid => store.genderOf(pid), personTitle: pid => store.personTitle(pid), ...extra});
    ART.ctx = mkCtx;
    const ftOf = f => ART.ft[f.type] || ART.ft.text;
    const isEmpty = (f, v) => { const t = ftOf(f); return t.empty ? t.empty(v, f) : (v == null || v === '' || (Array.isArray(v) && !v.length)); };
    ART.isEmpty = isEmpty;
    ART.valueOf = (it, f) => { const t = ftOf(f); return t.value ? t.value(it.data || {}, f, it) : (f.key === 'title' ? (it.data?.title ?? it.title) : it.data?.[f.key]); };
    ART.text = (ctx, it, f) => { const t = ftOf(f), v = ART.valueOf(it, f); if (f.type === 'computed') return ART.views[f.view]?.text?.(ctx, it, f) || ''; return isEmpty(f, v) ? '' : t.text ? t.text(f, v, ctx) : String(v ?? ''); };
    ART.read = (ctx, it, f) => { const t = ftOf(f); if (f.type === 'computed') return ART.views[f.view]?.read?.(ctx, it, f) || ''; const v = ART.valueOf(it, f); return isEmpty(f, v) ? '' : (f.view && ART.views[f.view]?.read ? ART.views[f.view].read(ctx, it, f, v) : t.read ? t.read(f, v, ctx) : esc(v)); };

    function readHtml(store, it) {
        const def = ART.defs[it.kind], L = ART.layout(store, it.kind, 'fiche'), ctx = mkCtx(store, it), hide = L.hideEmpty;
        const zones = {left: [], main: [], right: []};
        let firstMain = true, photosHtml = '';
        L.groups.forEach(g => {
            const vis = g.fields.filter(f => f.on);
            if (!vis.length) return;
            const zone = g.zone === 'side' ? 'right' : (g.zone || 'main');
            if (g.key === 'photos' || vis.every(f => f.type === 'photos')) { photosHtml += vis.map(f => ART.read(ctx, it, f)).join(''); return; }
            const scal = [], rich = [];
            // « Label – 21 812 (n° de catalogue) » : un champ peut en emmener un autre (join) ; le titre et l'artiste sont dans l'en-tête (head)
            const joined = new Set(vis.filter(f => f.join).map(f => f.join.key));
            vis.forEach(f => { if (f.head || joined.has(f.key)) return; let h = ART.read(ctx, it, f);
                if (f.join) { const jf = g.fields.find(x => x.key === f.join.key) || ART.fieldsOf(def).find(x => x.key === f.join.key); const jh = jf && jf.on !== false ? ART.read(ctx, it, jf) : ''; if (jh) h = h ? `${h}${f.join.sep ?? ' · '}${f.join.lab ? `<span class="ar-g">${esc(f.join.lab)}</span> ` : ''}${jh}${f.join.small ? ` <small class="ar-g">${esc(f.join.small)}</small>` : ''}` : jh; }
                if (!h && hide) return; const rec = {f, h: h || '<span class="ar-none">—</span>'}; ((f.section || f.type === 'computed' || ftOf(f).block) && zone === 'main' ? rich : scal).push(rec); });
            if (zone === 'main') {
                if (scal.length) zones.main.push(`${firstMain ? '' : `<div class="ar-sec"><div class="ar-sh"><b>${esc(g.label)}</b></div>`}<dl class="ar-dl">${scal.map(({f, h}) => `<dt>${esc(f.short || f.label)}</dt><dd>${h}</dd>`).join('')}</dl>${firstMain ? '' : '</div>'}`);
                firstMain = false;
                rich.forEach(({f, h}) => { const meta = f.view ? (ART.views[f.view]?.meta?.(ctx, it, f) || '') : (ftOf(f).meta?.(f, ART.valueOf(it, f), ctx) || ''), act = ART.views[f.view]?.actions?.(ctx, it, f) || ''; zones.main.push(`<section class="ar-sec" data-ar-sec="${esc(f.key)}"><div class="ar-sh"><b>${esc(f.secLabel || f.label)}</b>${meta ? `<small class="ar-g">${meta}</small>` : ''}<span class="spacer"></span>${act}</div>${h}</section>`); });
            } else {
                const body = scal.map(({f, h}) => (ftOf(f).block || f.type === 'computed' || f.bare) ? `<div class="ar-sblock">${h}</div>` : `<dl class="ar-dl ar-dl-s"><dt>${esc(f.short || f.label)}</dt><dd>${h}</dd></dl>`).join('');
                if (body) zones[zone].push(`<div class="ar-side" data-ar-group="${esc(g.key)}"><h5>${esc(g.icon || '')} ${esc(g.label)}</h5>${body.replace(/<\/dl><dl class="ar-dl ar-dl-s">/g, '')}</div>`);
            }
        });
        const heading = def.heading ? def.heading(ctx, it) : `<h2 class="ar-h2">${esc(it.title)}${it.year ? ` <small>· ${esc(it.year)}</small>` : ''}</h2>`;
        const badges = def.badges ? def.badges(ctx, it) : '';
        const left = (photosHtml || zones.left.length) ? `<div class="ar-col ar-left">${photosHtml}${zones.left.join('')}</div>` : '';
        return `<div class="ar-sheet ${left ? 'has-left' : 'no-left'} ${zones.right.length ? 'has-right' : 'no-right'}">${left}<div class="ar-col ar-main">${heading}${badges}${zones.main.join('') || '<p class="muted">Rien d’écrit pour l’instant : « ✎ Modifier ».</p>'}</div>${zones.right.length ? `<div class="ar-col ar-right">${zones.right.join('')}</div>` : ''}</div>`;
    }
    ART.readHtml = readHtml;

    /* ═════════ L'écran d'une fiche : le formulaire (même ordre que le panneau) ═════════ */
    function formHtml(store, it, draft) {
        const L = ART.layout(store, it.kind, 'fiche'), ctx = mkCtx(store, it, {draft});
        const fake = {...it, data: draft};
        return `<div class="ar-form" data-ar-form>${L.groups.map(g => {
            const fs = g.fields.filter(f => f.type !== 'computed'); if (!fs.length) return '';
            const on = fs.filter(f => f.on), off = fs.filter(f => !f.on);
            return `<div class="ar-grp"><span>${esc(g.icon || '')} ${esc(g.label)}</span></div><div class="ar-egrid">${on.map(f => `<div class="ar-fld ${ftOf(f).wide || f.wide ? 'is-wide' : ''} ${f.custom ? 'is-custom' : ''}" data-fk="${esc(f.key)}" data-ft="${esc(f.type)}"><span class="ar-flab">${esc(f.label)}${f.help ? ` <small class="muted">${esc(f.help)}</small>` : ''}</span>${ftOf(f).edit(f, ART.valueOf(fake, f), ctx)}</div>`).join('')}
                ${off.length ? `<div class="ar-offline is-wide"><small class="muted">Masqués :</small> ${off.map(f => `<button type="button" class="ar-linkbtn" data-ar-unhide="${esc(f.key)}" title="Afficher ce champ (comme 👁 dans « ⚙️ Champs affichés »)">＋ ${esc(f.label)}</button>`).join(' ')}</div>` : ''}</div>`;
        }).join('')}<div class="ar-form-foot">${it.id ? '<button type="button" class="button small secondary danger" data-ar-cmd="delete">🗑 Supprimer</button>' : ''}<span class="spacer"></span><button type="button" class="button small secondary" data-ar-cmd="addfield">＋ Ajouter un champ</button></div></div>`;
    }
    /** le formulaire → le brouillon (chaque type de champ lit sa case) */
    function collect(root, store, it, draft) {
        const L = ART.layout(store, it.kind, 'fiche'), all = L.groups.flatMap(g => g.fields);
        root.querySelectorAll('[data-ar-form] > .ar-egrid > [data-fk]').forEach(el => {
            const f = all.find(x => x.key === el.dataset.fk); if (!f) return; const t = ftOf(f);
            if (t.collect) t.collect(el, f, draft); else draft[f.key] = t.get ? t.get(el, f) : (el.querySelector('input,textarea,select')?.value ?? '');
        });
        return draft;
    }
    ART.formHtml = formHtml; ART.collect = collect;

    /* ═════════ Enregistrer, supprimer (avec « ↶ Annuler »), cocher « Artiste » ═════════ */
    async function needArtist(store) {
        if (Number(store.person.is_artist)) return {};
        const ok = await A().confirmBox(`La fiche de ${store.name} n’est pas encore cochée « Artiste ». La cocher pour ranger ce catalogue ?`, {title: '🎨 Cocher « Artiste » ?', okLabel: 'Cocher « Artiste »'});
        if (!ok) throw new Error('');
        store.person.is_artist = 1; return {make_artist: 1};
    }
    ART.saveItem = async (store, kind, id, data) => {
        const extra = await needArtist(store);
        const pf = ART.defs[kind]?.parentField, parent_id = pf ? (U.ref(data[pf])?.iid || 0) : 0; // la chaîne : album → édition, morceau → enregistrement…
        const r = await write('save_item', {person_id: store.pid, kind, id: id || 0, data, parent_id, ...extra});
        return r.id;
    };
    ART.deleteItem = async (store, it, after) => {
        const r = await write('delete_item', {person_id: it.person_id || store.pid, id: it.id});
        const snap = r.item; await after?.();
        A().undoToast(`« ${it.title} » supprimé${ART.defs[it.kind]?.fem ? 'e' : ''}`, {
            undo: async () => { await write('restore_item', {item: snap}); await after?.(); },
            redo: async () => { await write('delete_item', {person_id: snap.person_id, id: snap.id}); await after?.(); }});
    };
    ART.needArtist = needArtist; ART.write = write;

    /* ═════════ Les blocs de la fiche de la personne ═════════ */
    const BLOCK_KINDS = {artist_books: ['book', '📚 Bibliographie'], artist_works: ['work', '🖼️ Œuvres et inventaire'], artist_discography: ['release', '💿 Discographie'], artist_filmography: ['film', '🎬 Filmographie']};
    const MUSIC = ['musicien', 'chanteur', 'compositeur', 'chef', 'groupe'], SCREEN = ['cineaste', 'acteur', 'videaste'];
    const blockVisible = (p, items, kind) => { const disc = p.artist_discipline || ''; return items.some(i => i.kind === kind) || kind === 'book' || (kind === 'work' && !MUSIC.includes(disc) && !SCREEN.includes(disc)) || (kind === 'release' && MUSIC.includes(disc)) || (kind === 'film' && SCREEN.includes(disc)); };
    const cardLine = it => { const d = ART.defs[it.kind]; return d?.cardLine ? d.cardLine(it) : [it.year, it.data?.technique || it.data?.format || it.data?.publisher || it.data?.jobs].filter(Boolean).join(' · '); };
    ext.personBlocks = ext.personBlocks || {};
    Object.entries(BLOCK_KINDS).forEach(([key, [kind, label]]) => {
        ext.personBlocks[key] = (index, detail) => {
            const p = detail.person; if (!p || !Number(p.is_artist)) return '';
            const items = (detail.heritage?.artist || []).filter(i => i.kind === kind); if (!blockVisible(p, detail.heritage?.artist || [], kind)) return '';
            const def = ART.defs[kind] || {icon: '✦', label: 'élément', fem: false};
            const body = items.length ? `<div class="ar-grid">${items.slice(0, 18).map(it => `<button type="button" class="ar-card" data-ar-item="${it.id}" data-ar-pid="${p.id}">${U.cover(it)}<b>${esc(it.title)}</b><small>${esc(cardLine(it))}</small></button>`).join('')}</div>${items.length > 18 ? `<p class="muted">… et ${items.length - 18} de plus (« Tout voir »).</p>` : ''}`
                : `${A().emptyState({icon: def.icon, text: `${def.fem ? 'Aucune' : 'Aucun'} ${String(def.label).toLowerCase()} pour l’instant`})}<div class="ar-row"><button type="button" class="button small secondary" data-ar-open-kind="${kind}" data-ar-pid="${p.id}" data-ar-new>＋ ${def.fem ? 'Nouvelle' : 'Nouveau'} ${esc(String(def.label).toLowerCase())}</button><button type="button" class="button small secondary" data-ar-open-kind="${kind}" data-ar-pid="${p.id}" data-ar-import>📥 Importer</button></div>`;
            return A().card(index, label, items.length || '', `<div class="ar-block">${body}</div>`, 'span-12', `<button type="button" class="button small secondary" data-ar-open-kind="${kind}" data-ar-pid="${p.id}">${items.length ? 'Tout voir, modifier' : 'Ouvrir'}</button>`);
        };
    });
    // 🎨 Artiste : sa page (bloc d'entrée vers la page de l'artiste, heritage-artist-page.js)
    ext.personBlocks.artist_page = (index, detail) => {
        const p = detail.person; if (!p || !Number(p.is_artist)) return '';
        const items = detail.heritage?.artist || [], n = k => items.filter(i => i.kind === k).length;
        const sum = [['release', 'disque'], ['work', 'œuvre'], ['book', 'livre'], ['film', 'film'], ['track_work', 'morceau'], ['exhibition', 'exposition']].filter(([k]) => n(k)).map(([k, w]) => plural(n(k), w)).join(' · ');
        return A().card(index, '🎨 Artiste : sa page', '', `<div class="ar-block"><p>${esc(sum || 'Son catalogue est vide pour l’instant.')}</p><div class="ar-row"><button type="button" class="button small" data-ar-open-kind="page" data-ar-pid="${p.id}">🎨 Ouvrir la page de l’artiste</button></div></div>`, 'span-12');
    };
    // 🎨 Cité dans des catalogues d'artistes : « joue sur Paris canaille (1958) »
    ext.personBlocks.artist_cited = (index, detail) => {
        const list = detail.heritage?.artist_cited || []; if (!list.length) return '';
        return A().card(index, '🎨 Cité dans des catalogues d’artistes', list.length, `<ul class="ar-cited">${list.map(c => `<li><button type="button" class="ar-ochip is-link" data-ar-item="${c.id}" data-ar-pid="${c.person_id}"><i>${esc(ART.defs[c.kind]?.icon || '✦')}</i>${esc(c.title)}${c.year ? ` (${esc(c.year)})` : ''}</button> <small class="muted">${esc([c.roles.join(', '), c.person && c.person_id !== Number(detail.person?.id) ? `catalogue de ${c.person}` : ''].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul>`, 'span-6');
    };
    document.addEventListener('click', e => {
        const b = e.target.closest('[data-ar-open-kind],[data-ar-item]'); if (!b || b.closest('.ar-dlg')) return;
        const pid = Number(b.dataset.arPid); if (!pid) return; e.preventDefault();
        if (b.dataset.arOpenKind) openCatalog(pid, {kind: b.dataset.arOpenKind, add: b.hasAttribute('data-ar-new'), importNow: b.hasAttribute('data-ar-import')});
        else openCatalog(pid, {item: Number(b.dataset.arItem)});
    });

    /* ═════════ La fenêtre du catalogue (plein écran) ═════════ */
    const PREFS = 'genealogie-artist-prefs';
    let OPEN = null; // le catalogue ouvert (un seul à la fois)
    async function openCatalog(pid, opts = {}) {
        if (OPEN?.dlg?.isConnected) { if (OPEN.pid === pid) { OPEN.go(opts); return OPEN; } if (!await OPEN.close()) return null; }
        const store = new Store(pid);
        try { await store.load(); } catch (e) { toast(e.message, 'error'); return null; }
        const dlg = document.createElement('dialog'); dlg.className = 'modal ar-dlg'; dlg.dataset.ownClose = '1'; dlg.dataset.dndOff = ''; dlg.dataset.ordOff = ''; // nos lignes ont déjà ⠿ ↑ ↓ (pas celles de heritage-dnd.js)
        dlg.innerHTML = `<div class="ar-shell"><header class="ar-top" data-ar-top></header><div class="ar-wrap"><div class="ar-body" data-ar-body></div><aside class="ar-panel" data-ar-panel hidden></aside></div></div>`;
        document.body.appendChild(dlg); ext.fullInit?.(dlg, 'artist', true); dlg.showModal();
        const $ = q => dlg.querySelector(q), body = $('[data-ar-body]');
        const prefs = readJ(PREFS, {});
        // l'état : la page de l'artiste, une liste (une sorte), ou une fiche (lecture / modification)
        const S = {view: 'list', kind: 'release', id: 0, edit: false, draft: null, dirty: false, back: [], changed: false};
        const C = {dlg, pid, store, S, body, prefs, go, close, paint, open: openIt, newItem, startEdit, savePrefs: () => writeJ(PREFS, prefs), reload, setDirty, panel: null};
        OPEN = C; dlg._C = C;
        function setDirty(v = true) { S.dirty = v; const st = $('[data-ui-status]'); if (st) UI().savedStatus?.(st, v ? 'dirty' : 'saved'); }
        async function reload() { await store.load(); S.changed = true; }
        const leave = async () => { if (!S.edit || !S.dirty) return true; return A().confirmBox('Les modifications de cette fiche seront perdues.', {title: 'Quitter sans enregistrer ?', okLabel: 'Quitter sans enregistrer', danger: true}); };
        async function close() { if (!await leave()) return false; dlg.close(); dlg.remove(); if (OPEN === C) OPEN = null; if (S.changed) ext.refreshView?.(); return true; }
        C.leave = leave;
        // Échap : d'abord le panneau, puis le formulaire, puis la fiche, puis la fenêtre — une seule chose à la fois
        dlg.addEventListener('cancel', async e => {
            e.preventDefault();
            if (document.querySelector('dialog[open]:not(.ar-dlg) ~ dialog[open], .ar-dlg ~ dialog[open]')) return;
            if (C.panel && !$('[data-ar-panel]').hidden) { C.panel.close(); return; }
            if (S.view === 'item' && S.edit) { if (!await leave()) return; S.edit = false; S.dirty = false; if (!S.id) { S.view = S.back.pop()?.view || 'list'; } paint(); return; }
            if (S.view === 'item') { back(); return; }
            close();
        });
        function back() { const b = S.back.pop(); if (b) Object.assign(S, b, {edit: false, draft: null, dirty: false}); else { S.view = S.kind === 'profile' ? 'page' : 'list'; S.id = 0; } paint(true); }
        C.back = back;
        function go(o = {}) {
            if (o.item) { const it = store.get(o.item); if (it) { S.view = 'item'; S.id = it.id; S.kind = it.kind; S.edit = !!o.edit; } }
            else if (o.kind === 'page') { S.view = 'page'; }
            else if (o.kind) { S.view = 'list'; S.kind = o.kind; }
            paint(true);
            if (o.add) newItem(S.kind);
            if (o.importNow) ART.openImport?.(C, S.kind);
        }
        async function openIt(id, {edit = false} = {}) {
            if (S.edit && !await leave()) return;
            let it = store.get(id); if (!it) { try { it = await store.ensure(id); } catch (e) { return toast(e.message, 'error'); } }
            if (S.view !== 'item' || S.id !== it.id) S.back.push({view: S.view, kind: S.kind, id: S.id});
            Object.assign(S, {view: 'item', id: it.id, kind: it.kind, edit, draft: edit ? clone(it.data || {}) : null, dirty: false}); paint(true);
        }
        function newItem(kind, preset = {}) {
            const def = ART.defs[kind]; if (!def) return;
            const data = {title: '', ...(def.newData ? def.newData(store) : {}), ...preset};
            if (S.view !== 'item' || S.id) S.back.push({view: S.view, kind: S.kind, id: S.id});
            Object.assign(S, {view: 'item', kind, id: 0, edit: true, draft: data, dirty: false, newData: data}); paint(true);
            setTimeout(() => body.querySelector('[data-fk="title"] input')?.focus(), 30);
        }
        function startEdit() { const it = store.get(S.id); if (!it) return; S.edit = true; S.draft = clone(it.data || {}); S.dirty = false; paint(); }
        const current = () => S.id ? store.get(S.id) : {id: 0, kind: S.kind, title: S.draft?.title || '', data: S.draft || {}, person_id: pid};
        C.current = current;

        /* — la barre du haut (E1) — */
        function topHtml() {
            const UIx = UI(), full = ext.fullButton ? ext.fullButton('artist') : '';
            if (S.view === 'item') {
                const it = current(), def = ART.defs[it.kind] || {};
                const eb = (def.eyebrow ? def.eyebrow(it, store) : def.label || '').toLocaleUpperCase('fr-FR');
                return `<span class="ar-ticon">${esc(def.icon || '✦')}</span><div class="ar-tname"><span class="eyebrow">${esc(eb)}</span><h2>${esc((S.edit ? S.draft?.title : it.title) || (it.id ? 'Sans titre' : `${def.fem ? 'Nouvelle' : 'Nouveau'} : ${String(def.label || '').toLowerCase()}`))}</h2></div>
                    ${it.id && !it.summary ? `<span class="segmented ar-mode"><button type="button" class="${S.edit ? '' : 'is-active'}" data-ar-cmd="read">Lecture</button><button type="button" class="${S.edit ? 'is-active' : ''}" data-ar-cmd="edit">✎ Modifier</button></span>` : ''}
                    <span class="spacer"></span><span class="ar-status" data-ui-status></span>
                    <button type="button" class="button small secondary" data-ar-cmd="fields" title="Afficher, masquer, ranger les champs ; ajouter les tiens">⚙️ Champs affichés</button>
                    ${it.id ? '<button type="button" class="button small secondary" data-ar-cmd="export" title="La fiche en PDF, à imprimer, ou en fichier">⤓ Exporter ▾</button>' : ''}
                    ${S.edit ? `<button type="button" class="button small" data-ar-cmd="save" data-shortcut="⌘S">💾 Enregistrer</button>` : ''}${full}<button type="button" class="icon-button" data-ar-cmd="close" aria-label="Fermer" title="Fermer">×</button>`;
            }
            const kinds = ART.tabKinds(store), def = ART.defs[S.kind] || {};
            const eb = S.view === 'page' ? 'ARTISTE · SA PAGE' : S.kind === 'work' ? 'CATALOGUE RAISONNÉ' : `CATALOGUE · ${String(def.many || '').toLocaleUpperCase('fr-FR')}`;
            const n = S.view === 'list' ? store.of(S.kind).length : 0;
            return `<span class="ar-ticon">${S.view === 'page' ? '🎨' : esc(def.icon || '✦')}</span><div class="ar-tname"><span class="eyebrow">${esc(eb)}</span><h2>${esc(store.name)}${S.view === 'list' ? ` — ${esc(plural(n, String(def.label || '').toLowerCase(), String(def.many || '').toLowerCase()))}` : ''}</h2></div>
                <nav class="segmented ar-tabs" data-ar-tabs><button type="button" class="${S.view === 'page' ? 'is-active' : ''}" data-ar-tab="page">🎨 Page</button>${kinds.map(k => `<button type="button" class="${S.view === 'list' && S.kind === k ? 'is-active' : ''}" data-ar-tab="${k}">${esc(ART.defs[k].icon)} ${esc(ART.defs[k].tab || ART.defs[k].many)}</button>`).join('')}<button type="button" data-ar-cmd="morekinds" title="Les autres sortes de fiches, et créer la tienne">＋</button></nav>
                <span class="spacer"></span>
                ${S.view === 'list' ? `<button type="button" class="button small" data-ar-cmd="new">＋ ${def.fem ? 'Nouvelle' : 'Nouveau'} ${esc(String(def.label || '').toLowerCase())}</button><button type="button" class="button small secondary" data-ar-cmd="import" data-help="Remplit le catalogue depuis Discogs, MusicBrainz, Apple Music, Open Library, Wikidata, TMDb, un tableau, ou un fichier exporté d’ici : tu choisis ce qui entre, rien n’est écrasé.">📥 Importer</button>${['work', 'release', 'master'].includes(S.kind) ? `<button type="button" class="button small secondary" data-ar-cmd="book" title="Le catalogue raisonné ou la discographie en livre, dans la mise en page">📖 Faire le livre…</button>` : ''}<button type="button" class="button small secondary" data-ar-cmd="export" title="Tableur, PDF, impression, fichier (réimportable)">⤓ Exporter ▾</button>` : `<button type="button" class="button small secondary" data-ar-cmd="organize" title="Ranger, cacher les sections, choisir leur largeur">⚙️ Organiser la page</button>`}
                <button type="button" class="button small secondary" data-ar-cmd="keys" title="Jeton Discogs, clé TMDb (facultatifs, gardés dans ce navigateur)">🔑</button>${full}<button type="button" class="icon-button" data-ar-cmd="close" aria-label="Fermer" title="Fermer">×</button>`;
        }
        function crumbHtml(it) {
            const def = ART.defs[it.kind] || {};
            const extra = def.crumbExtra ? def.crumbExtra(mkCtx(store, it), it) : '';
            const owner = it.person_id && it.person_id !== pid ? `<span class="muted">catalogue d’un autre artiste</span>` : `<button type="button" class="ar-linkbtn" data-ar-tab="page">🎨 ${esc(store.name)}</button>`;
            return `<div class="ar-crumb">${owner} › <button type="button" class="ar-linkbtn" data-ar-tab="${esc(it.kind)}">${esc(def.icon || '')} ${esc(def.many || '')}</button> › <b>${esc(it.title || (S.draft?.title) || 'Nouvelle fiche')}</b>${extra}</div>`;
        }
        function paint(top = true) {
            if (top) $('[data-ar-top]').innerHTML = topHtml();
            const keep = body.scrollTop;
            if (S.view === 'item') {
                const it = current();
                if (!it) { S.view = 'list'; return paint(); }
                body.innerHTML = crumbHtml(it) + (S.edit ? formHtml(store, it, S.draft) : readHtml(store, it));
                UI().savedStatus?.($('[data-ui-status]'), S.edit ? (S.dirty || !S.id ? 'dirty' : 'saved') : 'saved');
                if (!S.edit) ART.after.forEach(fn => { try { fn(C, body, it); } catch (e) { console.error(e); } });
            } else if (S.view === 'page') { body.innerHTML = ''; ART.paintPage ? ART.paintPage(C, body) : body.textContent = '…'; }
            else { body.innerHTML = ''; ART.paintList ? ART.paintList(C, body) : body.textContent = '…'; }
            // défilement remis en haut à chaque nouvelle vue (même place si on redessine la même)
            const sig = `${S.view}|${S.kind}|${S.id}|${S.edit}`;
            body.scrollTop = sig === C._sig ? keep : 0; C._sig = sig;
            if (C.panel?.page && S.view !== 'page') C.panel.close(); else C.panel?.refresh?.();
        }
        async function save() {
            if (!S.edit) return;
            collect(body, store, current(), S.draft);
            if (!String(S.draft.title || '').trim()) { toast('Il faut un titre.', 'error'); body.querySelector('[data-fk="title"] input')?.focus(); return; }
            const def = ART.defs[S.kind]; def.beforeSave?.(S.draft, store);
            UI().savedStatus?.($('[data-ui-status]'), 'saving');
            try { const id = await ART.saveItem(store, S.kind, S.id, S.draft); await reload(); S.id = id; S.edit = false; S.draft = null; S.dirty = false; paint(true); UI().savedStatus?.($('[data-ui-status]'), 'saved'); }
            catch (e) { UI().savedStatus?.($('[data-ui-status]'), 'error'); if (e.message) toast(e.message, 'error', {retry: () => save()}); }
        }
        C.save = save;
        /* — les clics — */
        dlg.addEventListener('input', e => { if (S.edit && e.target.closest('[data-ar-form]')) { if (!S.dirty) setDirty(); } });
        dlg.addEventListener('change', e => { if (S.edit && e.target.closest('[data-ar-form]') && !S.dirty) setDirty(); });
        dlg.addEventListener('picker-change', e => { if (S.edit && e.target.closest('[data-ar-form]') && !S.dirty) setDirty(); });
        dlg.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && S.edit) { e.preventDefault(); save(); } });
        dlg.addEventListener('error', e => { const im = e.target; if (im?.matches?.('img[data-ar-img]') && !im.dataset.broken) { im.dataset.broken = '1'; const sp = document.createElement('span'); sp.className = `${im.className} is-empty is-broken`; sp.title = 'Image introuvable'; sp.innerHTML = '🖼<small>image introuvable</small>'; im.replaceWith(sp); } }, true);
        dlg.addEventListener('click', async e => {
            const t = e.target.closest('button, [data-ar-open], [data-ar-row-open]'); if (!t || !dlg.contains(t)) return;
            const d = t.dataset;
            if (t.closest('.pk') || t.closest('.mpk')) return; // le menu de choix et la fenêtre des images gèrent leurs boutons
            if (d.arTab) { if (S.edit && !await leave()) return; S.edit = false; S.dirty = false; S.back = []; if (d.arTab === 'page') { S.view = 'page'; } else { S.view = 'list'; S.kind = d.arTab; } S.id = 0; return paint(true); }
            if (d.arOpen) { e.preventDefault(); return openIt(Number(d.arOpen)); }
            if (d.arRowOpen) { return openIt(Number(d.arRowOpen)); }
            if (d.arPerson) { if (!await close()) return; A().openPersonById?.(Number(d.arPerson)); return; }
            if (d.arZoom !== undefined) { const it = current(), ph = ART.normPhotos(it?.data?.photos)[Number(d.arZoom)]; if (ph) ext.openDialog({eyebrow: 'PHOTO', title: ph.c || it.title, wide: true, body: `<img src="${esc(U.photoSrc(ph))}" alt="" style="max-width:100%;max-height:75vh;display:block;margin:auto">`, submitLabel: 'Fermer', onSubmit: () => true}); return; }
            if (d.arPlace) { toast('Ce lieu est dans ta base : ouvre-le depuis « Lieux ».'); return; }
            if (d.arUnhide) { ART.setVisible(store, S.kind, 'fiche', d.arUnhide, true); collect(body, store, current(), S.draft); await store.saveSettings(); return paint(false); }
            const c = d.arCmd; if (!c) return;
            if (c === 'close') return close();
            if (c === 'read') { if (!await leave()) return; S.edit = false; S.dirty = false; S.draft = null; return paint(true); }
            if (c === 'edit') return startEdit();
            if (c === 'save') return save();
            if (c === 'new') return newItem(S.kind);
            if (c === 'fields') return ART.openFieldsPanel?.(C, S.kind, 'fiche');
            if (c === 'addfield') return ART.addFieldDialog?.(C, S.kind);
            if (c === 'organize') return ART.openOrganizer?.(C);
            if (c === 'import') return ART.openImport?.(C, S.kind);
            if (c === 'keys') return ART.editKeys?.();
            if (c === 'book') return ext.artistCatalogue?.wizard?.({mode: S.kind === 'work' ? 'catalogue' : 'discography', pid, store, ids: C.listIds?.()});
            if (c === 'morekinds') return moreKinds(t);
            if (c === 'export') return S.view === 'item' ? ART.exportItem?.(C, current()) : ART.exportList?.(C, S.kind);
            if (c === 'delete') { const it = current(); if (!it?.id) return; try { await ART.deleteItem(store, it, async () => { await reload(); if (S.view === 'item' && !store.get(S.id)) { S.edit = false; S.draft = null; back(); } else paint(true); }); } catch (er) { toast(er.message, 'error'); } return; }
        });
        /** ＋ : toutes les sortes, rangées par domaine, et « ＋ Créer une sorte de fiche » */
        function moreKinds(btn) {
            const all = Object.values(ART.defs).filter(d => !d.hidden && d.key !== 'profile');
            ext.openDialog({eyebrow: 'CATALOGUE', title: 'Toutes les sortes de fiches', submitLabel: 'Fermer', wide: true,
                body: `<div class="ar-kinds">${DOMAINS.map(([dk, dl]) => { const l = all.filter(d => (d.domain || 'autre') === dk); return l.length ? `<h4>${esc(dl)}</h4><div class="ar-kindrow">${l.map(d => `<button type="button" class="ar-kindbtn" data-k="${esc(d.key)}">${esc(d.icon)} ${esc(d.many)} <small>${store.of(d.key).length || ''}</small></button>`).join('')}</div>` : ''; }).join('')}
                    <p class="muted">Une sorte qui manque (sculpture, affiche, opéra…) ? Crée-la : tu choisis ses champs (ou tu les reprends d’une autre sorte).</p><button type="button" class="button small" data-newtype>＋ Créer une sorte de fiche…</button></div>`,
                onOpen: dg => dg.addEventListener('click', ev => { const b = ev.target.closest('[data-k],[data-newtype]'); if (!b) return; dg.close(); if (b.dataset.k) { S.view = 'list'; S.kind = b.dataset.k; S.id = 0; prefs.extraTabs = [...new Set([...(prefs.extraTabs || []), b.dataset.k])]; C.savePrefs(); paint(true); } else ART.newTypeDialog?.(C); }),
                onSubmit: () => true});
        }
        // ouverture
        if (opts.item) { const it = store.get(opts.item) || await store.ensure(opts.item).catch(() => null); if (it) Object.assign(S, {view: 'item', kind: it.kind, id: it.id}); }
        else if (opts.kind === 'page' || (!opts.kind && !opts.item)) S.view = 'page';
        else if (opts.kind) Object.assign(S, {view: 'list', kind: opts.kind});
        paint(true);
        if (opts.add) newItem(S.kind);
        if (opts.importNow) setTimeout(() => ART.openImport?.(C, S.kind), 50);
        return C;
    }
    /** les onglets de sortes : celles qui ont des fiches, celles de la discipline, et celles qu'on a ajoutées */
    ART.tabKinds = store => {
        const base = ['book', 'work', 'release', 'track_work', 'film', 'exhibition'], disc = store.person.artist_discipline || '', prefs = readJ(PREFS, {});
        const want = new Set(base.filter(k => store.of(k).length || (k === 'book') || (k === 'work' && !MUSIC.includes(disc) && !SCREEN.includes(disc)) || (['release', 'track_work'].includes(k) && MUSIC.includes(disc)) || (k === 'film' && SCREEN.includes(disc)) || (k === 'exhibition' && store.of('work').length)));
        // les sortes « de rangement » (albums, enregistrements, organisations…) restent dans « ＋ », sauf si on les a ajoutées
        const quiet = new Set(['master', 'recording', 'org', 'copy', 'concert', 'text', 'profile']);
        Object.keys(ART.defs).forEach(k => { if ((store.of(k).length && !quiet.has(k)) || (prefs.extraTabs || []).includes(k)) want.add(k); });
        return [...want].filter(k => ART.defs[k]).sort((a, b) => (base.indexOf(a) + 1 || 99) - (base.indexOf(b) + 1 || 99));
    };
    ART.setVisible = (store, kind, tab, key, on) => {
        const tgt = store.personSet?.own ? store.personSet : (store.global = store.global || {});
        tgt.kinds = tgt.kinds || {}; const K = tgt.kinds[kind] = tgt.kinds[kind] || {}; const T = K[tab] = K[tab] || {};
        T.on = (T.on || []).filter(x => x !== key); T.off = (T.off || []).filter(x => x !== key); (on ? T.on : T.off).push(key);
        store.settings = store.personSet?.own ? store.personSet : store.global;
    };

    /** ouvrir une fiche du catalogue depuis n'importe où (menu de choix « ↗ Ouvrir », mise en page…) */
    async function openItem(id) {
        try { const r = await api('art', {op: 'item', id}); return openCatalog(r.item.person_id, {item: r.item.id}); } catch (e) { toast(e.message, 'error'); return null; }
    }
    ext.artistCatalog = {open: openCatalog, openItem, ART};
    ART.open = openCatalog; ART.openItem = openItem;
})();
