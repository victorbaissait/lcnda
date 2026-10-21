/* LCNDA — 📰 🏆 🎓 Les blocs communs à TOUTE personne (maquettes O, AB, AC de docs/design/profils-et-oeuvres.html) : le NOYAU.
 *
 * Construit sur le moteur des fiches (heritage-artist.js, docs/TYPES.md) : chaque sorte (passage dans les médias,
 * récompense, concours, étape de scolarité, diplôme, établissement) est une définition ART.define ; l'écran de fiche
 * (ART.readHtml / ART.formHtml), le panneau « ⚙️ Champs affichés », les listes H10 (ART.paintList) et l'export sont ceux du moteur.
 * Différence avec les catalogues d'artistes : n'importe quelle personne (pas besoin d'« Artiste ») ; serveur lib/blocs.php
 * (GET action=blocs, POST action=blocs_write).
 *
 * Ici : les types de champs en plus (pastilles de choix, revue, personnes avec rôles en zones, plusieurs documents),
 * la « boutique » (BlocStore), la fenêtre (BL.open), les listes de l'écran Listes (Revue de presse, Palmarès),
 * et la petite API pour les autres outils (ext.blocs, ext.press, ext.awards, ext.education : listFor(pid)…).
 * Les sortes et les blocs de la fiche : heritage-blocs-press.js, -awards.js, -school.js.
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART; if (!ART?.define) return;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const k of ['personBlocks', 'lists']) ext[k] = ext[k] || {};
    ext.afterPerson = ext.afterPerson || [];
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI || {}, P = () => window.LCNDA_PICKER || window.LCNDA_APP;
    const U = ART.util, esc = U.esc;
    const toast = (...a) => A().toast(...a);
    const write = async (op, body = {}) => (await A().api('blocs_write', {}, {method: 'POST', body: {op, ...body}})).result;
    const clone = o => JSON.parse(JSON.stringify(o ?? null));

    const BL = ext.blocs = ext.blocs || {};
    BL.KINDS = new Set(['press_item', 'award', 'contest', 'school_step', 'diploma', 'school']);
    /** les trois domaines : leurs sortes (onglets de la fenêtre), le nom de la liste */
    BL.DOMAINS = {
        press: {icon: '📰', label: 'Revue de presse', eyebrow: 'DANS LES MÉDIAS', kinds: ['press_item']},
        awards: {icon: '🏆', label: 'Palmarès', eyebrow: 'CONCOURS ET RÉCOMPENSES', kinds: ['award', 'contest']},
        school: {icon: '🎓', label: 'Diplômes et formation', eyebrow: 'DIPLÔMES ET FORMATION', kinds: ['school_step', 'diploma', 'school']},
    };
    const domainOf = kind => Object.keys(BL.DOMAINS).find(d => BL.DOMAINS[d].kinds.includes(kind)) || 'press';
    BL.domainOf = domainOf;
    BL.write = write;
    const changed = (pid, kind) => { BL._cache.clear(); document.dispatchEvent(new CustomEvent('lcnda:blocs-changed', {detail: {pid, kind}})); };

    /* ═════════ Petits outils ═════════ */
    const pkState = el => { const pk = el?.querySelector?.('.pk'); if (!pk) return null; try { return JSON.parse(pk.dataset.pkValue || 'null'); } catch (_) { return null; } };
    const ch = f => (f.choices || []).map(c => Array.isArray(c) ? c : [c, c]);
    const labelOf = (choices, v) => (choices.map(c => Array.isArray(c) ? c : [c, c]).find(c => String(c[0]) === String(v)) || [, v])[1];
    BL.labelOf = labelOf;
    /** « 🏅 Sport » → « Sport » (pour les colonnes) */
    BL.bare = s => String(s || '').replace(/^[^\p{L}\p{N}«(]+/u, '').trim();
    const safeUrl = u => (A()?.safeUrl ? A().safeUrl(u) : (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : ''));
    BL.safeUrl = safeUrl;
    const isImg = f => /\.(jpe?g|png|webp|gif|avif)$/i.test(String(f || ''));
    const isAudio = (f, t) => t === 'audio' || /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(String(f || ''));
    const isVideo = (f, t) => t === 'video' || /\.(mp4|webm|mov|m4v|ogv)$/i.test(String(f || ''));
    BL.isImg = isImg; BL.isAudio = isAudio; BL.isVideo = isVideo;
    BL.mediaSrc = m => (m?.f ? `media/${encodeURIComponent(m.f)}` : '');
    /** l'année de début et de fin d'une fiche (bornes calculées par le serveur, sinon l'année) */
    BL.span = it => { const a = Number(it.date_min ?? it.year) || Number(it.year) || 0, b = Number(it.date_max ?? it.year) || a; return a ? [a, Math.max(a, b)] : null; };
    BL.when = it => String(it.data?.date || it.date_text || it.year || '').trim();
    /** une pastille de personne (lecture) avec le sexe connu par la boutique */
    BL.chip = (v, role, store) => U.personChip(v, role, store ? {genderOf: pid => store.genderOf(pid), personTitle: pid => store.personTitle(pid)} : null);

    /* ═════════ Types de champs en plus ═════════ */
    const T = ART.ft;
    /** des pastilles de choix (C5 filtres, noir = choisi) ; f.free : « ＋ libre » (un mot à soi) */
    T.pills = {label: 'Pastilles de choix', badge: 'choix', wide: true,
        edit: (f, v) => { const cs = ch(f), known = cs.some(([k]) => String(k) === String(v ?? '')), free = v && !known ? String(v) : '';
            return `<div class="ui-filters bl-pills" data-pills>${cs.map(([k, l]) => `<button type="button" data-pill="${esc(k)}" class="${String(v ?? '') === String(k) && v !== '' ? 'is-active' : ''}" aria-pressed="${String(v ?? '') === String(k) && v !== ''}">${esc(l)}</button>`).join('')}${f.free ? `<input class="ar-in bl-pill-free" data-pill-free value="${esc(free)}" placeholder="${esc(f.freePh || '＋ libre (ton mot)')}" maxlength="80">` : ''}</div>`; },
        get: el => { const fr = el.querySelector('[data-pill-free]')?.value.trim(); if (fr) return fr; return el.querySelector('[data-pill].is-active')?.dataset.pill || ''; },
        read: (f, v) => `<span class="bl-pillr">${esc(labelOf(ch(f), v))}</span>`, text: (f, v) => BL.bare(labelOf(ch(f), v)), empty: v => v == null || v === ''};
    /** une revue de « Listes → Revues et magazines » (menu de choix, sorte « periodical »), ou un nom libre ; JSON {perid, title} (indexé) */
    const perVal = v => !v ? null : typeof v === 'string' ? (v.trim() ? {txt: v.trim()} : null) : Number(v.perid) > 0 ? {perid: Number(v.perid), title: v.title || ''} : (v.txt || v.title) ? {txt: String(v.txt || v.title)} : null;
    BL.perVal = perVal;
    BL.perTitle = v => { const p = perVal(v); return p ? (p.title || p.txt || '') : ''; };
    BL.perChip = (v, icon = '📰') => { const p = perVal(v); if (!p) return ''; return p.perid ? `<button type="button" class="ar-ochip is-link" data-bl-periodical="${p.perid}" title="Ouvrir « Revues et magazines »"><i>${esc(icon)}</i>${esc(p.title || `#${p.perid}`)}</button>` : `<span class="ar-ochip is-free"><i>${esc(icon)}</i>${esc(p.txt)}</span>`; };
    T.periodical = {label: 'Revue, journal, émission', badge: '📰', tile: '📰 Revue',
        edit: (f, v) => { const p = perVal(v); return P().pickerField({hiddenName: false, name: 'bl_periodical', kind: 'periodical', allowFree: true, value: p ? (p.perid ? {id: p.perid, title: p.title} : `txt:${p.txt}`) : null}); },
        get: el => { const s = pkState(el), it = Array.isArray(s) ? s[0] : null; if (!it) return null; return it.free || !it.id ? (it.title ? {txt: String(it.title)} : null) : {perid: Number(it.id), title: it.title || ''}; },
        read: (f, v) => BL.perChip(v, f.icon || '📰'), text: (f, v) => BL.perTitle(v), empty: v => !perVal(v)};
    /** des personnes avec un rôle, en deux zones (★ principales / ☆ secondaires) : le menu de choix avec rôles (CLAUDE.md) */
    const castOf = v => (Array.isArray(v) ? v : []).map(r => { if (!r || typeof r !== 'object') return null; const p = U.person(r); if (!p) return null; return {...(p.pid ? {pid: p.pid, title: p.title} : {pname: p.pname}), role: String(r.role || ''), primary: r.primary !== false}; }).filter(Boolean);
    BL.castOf = castOf;
    T.cast = {label: 'Personnes et rôles (zones)', badge: '👤 rôles', wide: true, block: true,
        edit: (f, v, ctx) => P().pickerField({hiddenName: false, name: 'bl_cast', kind: 'person', allowFree: true, roles: {main: false, roleList: f.roles || undefined},
            value: {people: castOf(v).map(r => r.pid ? {id: r.pid, title: r.title, gender: {m: 'male', f: 'female'}[ctx?.store?.genderOf?.(r.pid)] || undefined, role: r.role, primary: r.primary} : {txt: r.pname, role: r.role, primary: r.primary})}}),
        get: el => { const s = pkState(el); return (s?.people || []).map(p => p.free || !p.id ? (p.title ? {pname: String(p.title), role: p.role || '', primary: !!p.primary} : null) : {pid: Number(p.id), title: p.title || '', role: p.role || '', primary: !!p.primary}).filter(Boolean); },
        read: (f, v, ctx) => { const l = castOf(v); if (!l.length) return ''; const st = ctx?.store; const line = (arr, lab, cls) => arr.length ? `<div class="bl-castrow ${cls}"><span class="bl-castlab">${lab}</span><span>${arr.map(r => BL.chip(r, r.role, st)).join('')}</span></div>` : '';
            const prim = l.filter(r => r.primary), sec = l.filter(r => !r.primary); return `<div class="bl-cast">${sec.length ? line(prim, '★ Principales', 'prim') + line(sec, '☆ Secondaires', 'sec') : `<div class="bl-castrow"><span>${prim.map(r => BL.chip(r, r.role, st)).join('')}</span></div>`}</div>`; },
        text: (f, v) => castOf(v).map(r => `${r.title || r.pname}${r.role ? ` (${r.role})` : ''}`).join(', '), empty: v => !castOf(v).length};
    /** plusieurs documents de la base (bulletins, livrets, contrats…) : la fenêtre unique des images et documents */
    const mlOf = v => (Array.isArray(v) ? v : []).map(m => m && Number(m.mid) > 0 ? {mid: Number(m.mid), f: String(m.f || ''), title: String(m.title || ''), type: String(m.type || '')} : null).filter(Boolean);
    BL.mlOf = mlOf;
    const mlChip = (m, edit) => `<span class="ar-ochip bl-mlchip" data-ml="${esc(JSON.stringify(m))}">${isImg(m.f) ? `<img src="${esc(BL.mediaSrc(m))}" alt="" data-ar-img>` : `<i>${isAudio(m.f, m.type) ? '🎧' : isVideo(m.f, m.type) ? '🎬' : '📄'}</i>`}${edit ? esc(m.title || m.f || `#${m.mid}`) : `<a href="${esc(BL.mediaSrc(m))}" target="_blank" rel="noopener">${esc(m.title || m.f || `#${m.mid}`)}</a>`}${edit ? '<button type="button" class="icon-button small" data-ml-del title="Retirer">✕</button>' : ''}</span>`;
    T.medialist = {label: 'Documents (plusieurs)', badge: '📄+', tile: '📄 Documents', wide: true,
        edit: (f, v) => `<div class="bl-ml" data-ml-box>${mlOf(v).map(m => mlChip(m, true)).join('')}<button type="button" class="button small secondary" data-ml-add>🖼 ${esc(f.addLabel || 'Ajouter des documents…')}</button></div>`,
        get: el => [...el.querySelectorAll('[data-ml]')].map(x => { try { return JSON.parse(x.dataset.ml); } catch (_) { return null; } }).filter(Boolean),
        read: (f, v) => `<div class="bl-ml">${mlOf(v).map(m => mlChip(m, false)).join('')}</div>`, text: (f, v) => mlOf(v).map(m => m.title || m.f).join(', '), empty: v => !mlOf(v).length};
    /** l'extrait (citation) en italique */
    ART.views.bl_quote = {read: (ctx, it, f, v) => `<blockquote class="bl-quote">${esc(v).replace(/\n/g, '<br>')}</blockquote>`};
    ART.CUSTOM_TYPES = [...new Set([...(ART.CUSTOM_TYPES || []), 'periodical', 'medialist'])];

    /* ═════════ La boutique : les fiches de ces sortes (toutes les personnes) ═════════ */
    class BlocStore extends ART.Store {
        constructor(pid, kinds) { super(pid || 0); this.kinds = kinds; this.readonly = false; this.ownerPid = 0; }
        async load() {
            const r = await A().api('blocs', {op: 'boot', kinds: this.kinds.join(','), person_id: this.pid || 0});
            this.person = r.person || {}; this.items = r.items || []; this.links = r.links || []; this.people = r.people || []; this.cited = [];
            this.global = r.settings?.global || {}; this.personSet = null; this.presets = Array.isArray(r.settings?.presets?.list) ? r.settings.presets.list : []; this.types = [];
            this.readonly = !!r.readonly || document.body.classList.contains('is-kiosk');
            this.items.forEach(it => { it.data = ART.sane ? ART.sane(it.kind, it.data) : (it.data || {}); try { ART.defs[it.kind]?.upgrade?.(it.data); } catch (_) {} });
            this.byId = new Map(this.items.map(i => [i.id, i])); this.settings = this.global;
            return this;
        }
        get name() { const p = this.person; return p?.id ? `${p.first_name || ''} ${String(p.last_name || '').toLocaleUpperCase('fr-FR')}`.trim() : 'toutes les personnes'; }
        genderOf(pid) { pid = Number(pid); const p = this.people.find(x => x.person_id === pid); const g = p?.gender || this.items.find(i => i.person_id === pid)?.owner_gender || (pid === Number(this.person?.id) ? this.person.gender : ''); return {male: 'm', female: 'f'}[g] || 'u'; }
        personTitle(pid) { pid = Number(pid); return this.people.find(x => x.person_id === pid)?.name || this.items.find(i => i.person_id === pid)?.owner || (pid && pid === Number(this.person?.id) ? this.name : '') || this.extraNames?.[pid] || ''; }
        locked(it) { return this.readonly || !!it?.owner_locked; }
        async saveSettings() { await ART.write('save_settings', {key: 'global', data: this.global || {}}); }
    }
    BL.Store = BlocStore;

    /* ═════════ Enregistrer, supprimer (« ↶ Annuler ») ═════════ */
    BL.save = async (pid, kind, id, data) => { const r = await write('save_item', {person_id: pid, kind, id: id || 0, data}); changed(pid, kind); return r.id; };
    BL.remove = async (it, after) => {
        const r = await write('delete_item', {id: it.id}); const snap = r.item; changed(it.person_id, it.kind); await after?.();
        A().undoToast(`« ${it.title} » supprimé${ART.defs[it.kind]?.fem ? 'e' : ''}`, {
            undo: async () => { await write('restore_item', {item: snap}); changed(snap.person_id, snap.kind); await after?.(); },
            redo: async () => { await write('delete_item', {id: snap.id}); changed(snap.person_id, snap.kind); await after?.(); }});
    };
    // le moteur passe par ici aussi (« ＋ Créer la fiche « … » » d'un champ « fiche liée », fiche ouverte depuis un catalogue)
    const origSave = ART.saveItem, origDelete = ART.deleteItem, origTabs = ART.tabKinds;
    ART.saveItem = (store, kind, id, data) => BL.KINDS.has(kind) ? BL.save(store.ownerPid || store.pid, kind, id, data) : origSave(store, kind, id, data);
    ART.deleteItem = (store, it, after) => BL.KINDS.has(it.kind) ? BL.remove(it, after) : origDelete(store, it, after);
    if (origTabs) ART.tabKinds = store => origTabs(store).filter(k => !BL.KINDS.has(k)); // pas d'onglet « passages » dans le catalogue d'un artiste

    /* ═════════ La liste (barre H10 du moteur) + pastilles C5 + frise ═════════ */
    const WHO = {id: 'who', group: 'Personne', label: 'Personne', type: 'person', chipPrefix: '', allowFree: false,
        test: (it, v, store) => !v || !v.id ? true : (it.person_id === Number(v.id) || (store?.people || []).some(p => p.item_id === it.id && p.person_id === Number(v.id)))};
    BL.WHO = WHO;
    /** la colonne « Personne » des listes (la fiche à qui se rattache chaque ligne) */
    ART.views.bl_owner = {text: (ctx, it) => it.owner || ctx?.store?.personTitle?.(it.person_id) || '', read: (ctx, it) => esc(ART.views.bl_owner.text(ctx, it))};
    BL.OWNER_COL = {key: 'c_who', label: 'Personne', type: 'computed', view: 'bl_owner'};
    /** la liste d'une sorte dans « host » (fenêtre ou écran Listes) ; C : {store, S: {kind}, open, reload, dlg, paint} */
    BL.mountList = (C, host, {who} = {}) => {
        ART.paintList(C, host);
        const def = ART.defs[C.S.kind], bar = host.querySelector('.ui-listbar'), out = host.querySelector('.ar-listout');
        if (!bar || !out) return;
        C._who = C._who || new Set();
        if (who !== undefined && !C._who.has(C.S.kind)) { C._who.add(C.S.kind); bar.setFilter?.('who', who ? {id: Number(who.id), title: who.title || ''} : ''); }
        // pastilles « Tout (19) · 🎖 Décorations (4)… » (C5, noir = actif), liées au filtre de la barre
        const qf = def.quick;
        let chips = null;
        if (qf) { chips = document.createElement('div'); chips.className = 'ui-filters bl-quick'; bar.after(chips); }
        const extra = document.createElement('div'); extra.className = 'bl-listextra'; host.appendChild(extra);
        const paintExtra = () => {
            const ids = C.listIds ? C.listIds() : [], list = ids.map(id => C.store.get(id)).filter(Boolean);
            if (chips) {
                const cur = bar.state.filters[qf.filter] || [], base = C.store.of(C.S.kind).filter(it => (WHO.test(it, bar.state.filters.who, C.store)));
                const counts = new Map(); base.forEach(it => { const v = qf.value(it); if (v) counts.set(v, (counts.get(v) || 0) + 1); });
                const opts = qf.options.filter(([k]) => counts.has(k) || cur.includes(k));
                chips.innerHTML = `<button type="button" class="${cur.length ? '' : 'is-active'}" data-bl-q="">Tout (${base.length})</button>${opts.map(([k, l]) => `<button type="button" class="${cur.includes(k) ? 'is-active' : ''}" data-bl-q="${esc(k)}">${esc(l)} (${counts.get(k) || 0})</button>`).join('')}`;
                chips.hidden = !base.length;
            }
            extra.innerHTML = def.listExtraHtml ? def.listExtraHtml(C.store, list) : '';
            // une liste vide : le texte du moteur parle d'import de disques — ici, seulement « ＋ Nouveau »
            out.querySelectorAll('.empty-box small').forEach(s => { if (/Discogs|Importer/.test(s.textContent)) s.textContent = def.emptyHint || 'Clique sur « ＋ Nouveau » pour commencer.'; });
        };
        chips?.addEventListener('click', e => { const b = e.target.closest('[data-bl-q]'); if (!b) return; const k = b.dataset.blQ; const cur = bar.state.filters[qf.filter] || []; bar.setFilter(qf.filter, !k ? [] : cur.length === 1 && cur[0] === k ? [] : [k]); });
        new MutationObserver(paintExtra).observe(out, {childList: true});
        paintExtra();
    };

    /* ═════════ La fenêtre (plein écran) : la liste d'une sorte, ou une fiche ═════════ */
    let OPEN = null;
    /** BL.open({domain | kind, pid, item, add, all}) : pid = la personne (filtre « Personne » mis d'office) */
    BL.open = async (o = {}) => {
        const kind0 = o.kind || BL.DOMAINS[o.domain || 'press'].kinds[0], domain = o.domain || domainOf(kind0), D = BL.DOMAINS[domain];
        if (OPEN?.dlg?.isConnected) { if (!await OPEN.close()) return null; }
        const pid = Number(o.pid) || 0;
        const store = new BlocStore(pid, D.kinds);
        try { await store.load(); } catch (e) { toast(e.message, 'error'); return null; }
        const dlg = document.createElement('dialog'); dlg.className = 'modal ar-dlg bl-dlg'; dlg.dataset.ownClose = '1'; dlg.dataset.dndOff = ''; dlg.dataset.ordOff = '';
        dlg.innerHTML = `<div class="ar-shell"><header class="ar-top" data-ar-top></header><div class="ar-wrap"><div class="ar-body" data-ar-body></div><aside class="ar-panel" data-ar-panel hidden></aside></div></div>`;
        document.body.appendChild(dlg); ext.fullInit?.(dlg, 'blocs', false); dlg.showModal();
        const $ = q => dlg.querySelector(q), body = $('[data-ar-body]');
        const S = {view: 'list', kind: kind0, id: 0, edit: false, draft: null, dirty: false, back: [], changed: false, owner: 0};
        const who = pid ? {id: pid, title: store.name} : null;
        const C = {dlg, pid, store, S, body, prefs: {}, domain, go: null, close, paint, open: openIt, newItem, startEdit, savePrefs: () => {}, reload, setDirty, panel: null, onClose: o.onClose};
        OPEN = C; dlg._C = C;
        function setDirty(v = true) { S.dirty = v; UI().savedStatus?.($('[data-ui-status]'), v ? 'dirty' : 'saved'); }
        async function reload() { await store.load(); S.changed = true; }
        const leave = async () => { if (!S.edit || !S.dirty) return true; return A().confirmBox('Les modifications de cette fiche seront perdues.', {title: 'Quitter sans enregistrer ?', okLabel: 'Quitter sans enregistrer', danger: true}); };
        C.leave = leave;
        let closing = false;
        async function close() { if (closing) return false; if (!await leave()) return false; closing = true; dlg.close(); dlg.remove(); if (OPEN === C) OPEN = null; if (S.changed) { ext.refreshView?.(); C.onClose?.(); } return true; }
        dlg.addEventListener('cancel', async e => {
            e.preventDefault();
            if (document.querySelector('.bl-dlg ~ dialog[open]')) return; // une petite fenêtre par-dessus (menu de choix, images…)
            if (C.panel && !$('[data-ar-panel]').hidden) { C.panel.close(); return; }
            if (S.view === 'item' && S.edit) { if (!await leave()) return; S.edit = false; S.dirty = false; if (!S.id) { back(); return; } paint(); return; }
            if (S.view === 'item') { back(); return; }
            close();
        });
        function back() { const b = S.back.pop(); if (b && (b.view !== 'item' || store.get(b.id))) Object.assign(S, b, {edit: false, draft: null, dirty: false}); else { S.view = 'list'; S.id = 0; S.edit = false; S.draft = null; S.dirty = false; } paint(true); }
        C.back = back;
        async function openIt(id, {edit = false} = {}) {
            if (S.edit && !await leave()) return;
            let it = store.get(id);
            if (!it) { try { it = await store.ensure(id); } catch (e) { toast(e.message, 'error'); return; } }
            if (!BL.KINDS.has(it.kind)) { if (await close()) ext.artistCatalog?.openItem?.(it.id); return; } // une œuvre, un disque… : son catalogue
            if (S.view !== 'item' || S.id !== it.id) S.back.push({view: S.view, kind: S.kind, id: S.id});
            Object.assign(S, {view: 'item', id: it.id, kind: it.kind, edit: false, draft: null, dirty: false}); store.ownerPid = it.person_id;
            if (edit) return startEdit();
            paint(true);
        }
        /** une nouvelle fiche : d'abord la personne (celle du filtre, sinon on la demande) */
        async function newItem(kind, preset = {}) {
            const def = ART.defs[kind]; if (!def) return;
            if (store.readonly) return toast('Mode consultation : rien ne peut être ajouté.', 'error');
            if (S.edit && !await leave()) return;
            const bar = body.querySelector('.ui-listbar'), w = bar?.state?.filters?.who;
            let owner = Number(preset._owner) || (w?.id ? Number(w.id) : 0) || pid, oname = w?.id ? w.title : '';
            if (!owner) { const it = await P().openPicker({kind: 'person', title: def.askWho || 'À qui se rattache cette fiche ?', eyebrow: D.eyebrow}); if (!it?.id) return; owner = Number(it.id); oname = it.title || ''; }
            if (oname) store.extraNames = {...(store.extraNames || {}), [owner]: oname};
            if ((owner === pid && Number(store.person?.is_locked)) || store.items.some(i => i.person_id === owner && i.owner_locked)) return toast('Fiche verrouillée : déverrouille la fiche de la personne pour ajouter quelque chose.', 'error');
            delete preset._owner;
            const data = {title: '', ...(def.newData ? def.newData(store) : {}), ...preset};
            if (S.view !== 'item' || S.id) S.back.push({view: S.view, kind: S.kind, id: S.id});
            Object.assign(S, {view: 'item', kind, id: 0, edit: true, draft: data, dirty: false, owner}); store.ownerPid = owner;
            paint(true);
            setTimeout(() => body.querySelector('[data-fk="title"] input, [data-ar-form] input:not([type=hidden])')?.focus(), 40);
        }
        function startEdit() { const it = store.get(S.id); if (!it) return; if (store.locked(it)) return toast(store.readonly ? 'Mode consultation : rien ne peut être modifié.' : 'Fiche verrouillée : déverrouille la fiche de la personne pour modifier.', 'error'); S.edit = true; S.draft = clone(it.data || {}); S.dirty = false; S.owner = it.person_id; store.ownerPid = it.person_id; paint(true); }
        const current = () => S.id ? store.get(S.id) : {id: 0, kind: S.kind, title: S.draft?.title || '', data: S.draft || {}, person_id: S.owner, owner: store.personTitle(S.owner)};
        C.current = current;

        function topHtml() {
            const full = ext.fullButton ? ext.fullButton('blocs') : '';
            if (S.view === 'item') {
                const it = current(), def = ART.defs[it.kind] || {}, lock = store.locked(it);
                const eb = (def.eyebrow ? def.eyebrow(it, store) : def.label || '').toLocaleUpperCase('fr-FR');
                return `<span class="ar-ticon">${esc(def.icon || '✦')}</span><div class="ar-tname"><span class="eyebrow">${esc(eb)}</span><h2>${esc((S.edit ? S.draft?.title : it.title) || (it.id ? 'Sans titre' : `${def.fem ? 'Nouvelle' : 'Nouveau'} : ${String(def.label || '').toLowerCase()}`))}</h2></div>
                    ${it.id && !lock ? `<span class="segmented ar-mode"><button type="button" class="${S.edit ? '' : 'is-active'}" data-ar-cmd="read">Lecture</button><button type="button" class="${S.edit ? 'is-active' : ''}" data-ar-cmd="edit">✎ Modifier</button></span>` : lock ? `<span class="ar-badge" title="${store.readonly ? 'Mode consultation' : 'La fiche de la personne est verrouillée'}">🔒 ${store.readonly ? 'Consultation' : 'Verrouillée'}</span>` : ''}
                    <span class="spacer"></span><span class="ar-status" data-ui-status></span>
                    <button type="button" class="button small secondary" data-ar-cmd="fields" title="Afficher, masquer, ranger les champs ; ajouter les tiens">⚙️ Champs affichés</button>
                    ${it.id ? '<button type="button" class="button small secondary" data-ar-cmd="export" title="La fiche en PDF, à imprimer, ou en fichier">⤓ Exporter ▾</button>' : ''}
                    ${S.edit ? '<button type="button" class="button small" data-ar-cmd="save" data-shortcut="⌘S">💾 Enregistrer</button>' : ''}${full}<button type="button" class="icon-button" data-ar-cmd="close" aria-label="Fermer" title="Fermer">×</button>`;
            }
            const def = ART.defs[S.kind] || {};
            return `<span class="ar-ticon">${esc(D.icon)}</span><div class="ar-tname"><span class="eyebrow">${esc(D.eyebrow)}</span><h2>${esc(D.label)}</h2></div>
                ${D.kinds.length > 1 ? `<nav class="segmented ar-tabs">${D.kinds.map(k => `<button type="button" class="${S.kind === k ? 'is-active' : ''}" data-ar-tab="${k}">${esc(ART.defs[k]?.icon || '')} ${esc(ART.defs[k]?.tab || ART.defs[k]?.many || k)}</button>`).join('')}</nav>` : ''}
                <span class="spacer"></span>
                ${store.readonly ? '' : `<button type="button" class="button small" data-ar-cmd="new">＋ ${def.fem ? 'Nouvelle' : 'Nouveau'} ${esc(String(def.label || '').toLowerCase())}</button>`}
                <button type="button" class="button small secondary" data-ar-cmd="export" title="Tableur, PDF, impression, fichier">⤓ Exporter ▾</button>${full}<button type="button" class="icon-button" data-ar-cmd="close" aria-label="Fermer" title="Fermer">×</button>`;
        }
        function crumbHtml(it) {
            const def = ART.defs[it.kind] || {}, owner = it.person_id ? BL.chip({pid: it.person_id, title: it.owner || store.personTitle(it.person_id)}, '', store) : '';
            return `<div class="ar-crumb"><button type="button" class="ar-linkbtn" data-ar-tab="${esc(it.kind)}">${esc(D.icon)} ${esc(D.kinds.length > 1 ? def.many : D.label)}</button> › <b>${esc(it.title || S.draft?.title || 'Nouvelle fiche')}</b>${owner ? ` <span class="bl-owner">· fiche de ${owner}</span>` : ''}</div>`;
        }
        function paint(top = true) {
            if (top) $('[data-ar-top]').innerHTML = topHtml();
            const keep = body.scrollTop;
            if (S.view === 'item') {
                const it = current(); if (!it) { S.view = 'list'; return paint(); }
                body.innerHTML = crumbHtml(it) + (S.edit ? ART.formHtml(store, it, S.draft) : ART.readHtml(store, it));
                UI().savedStatus?.($('[data-ui-status]'), S.edit ? (S.dirty || !S.id ? 'dirty' : 'saved') : 'saved');
                if (S.edit) BL.afterForm(body, it.kind); else ART.after.forEach(fn => { try { fn(C, body, it); } catch (e) { console.error(e); } });
            } else { body.innerHTML = ''; BL.mountList(C, body, {who}); }
            const sig = `${S.view}|${S.kind}|${S.id}|${S.edit}`;
            body.scrollTop = sig === C._sig ? keep : 0; C._sig = sig;
            if (C.panel && S.view !== 'item' && C.panel.page) C.panel.close(); else C.panel?.refresh?.();
        }
        let saving = false;
        async function save() {
            if (!S.edit || saving) return;
            const it = current(), def = ART.defs[S.kind];
            ART.collect(body, store, it, S.draft);
            try { def.beforeSave?.(S.draft, store); } catch (e) { console.error(e); }
            if (!String(S.draft.title || '').trim()) { toast(def.titleHint || 'Il faut un titre.', 'error'); body.querySelector('[data-fk="title"] input')?.focus(); return; }
            const owner = S.id ? it.person_id : S.owner;
            saving = true; UI().savedStatus?.($('[data-ui-status]'), 'saving');
            try { const id = await BL.save(owner, S.kind, S.id, S.draft); await reload(); S.id = id; S.edit = false; S.draft = null; S.dirty = false; paint(true); UI().savedStatus?.($('[data-ui-status]'), 'saved'); }
            catch (e) { UI().savedStatus?.($('[data-ui-status]'), 'error'); if (e.message) toast(e.message, 'error', {retry: () => save()}); }
            finally { saving = false; }
        }
        C.save = save;
        dlg.addEventListener('input', e => { if (S.edit && e.target.closest('[data-ar-form]') && !S.dirty) setDirty(); });
        dlg.addEventListener('change', e => { if (S.edit && e.target.closest('[data-ar-form]') && !S.dirty) setDirty(); });
        dlg.addEventListener('picker-change', e => { if (S.edit && e.target.closest('[data-ar-form]') && !S.dirty) setDirty(); });
        dlg.addEventListener('media-change', e => { if (S.edit && e.target.closest('[data-ar-form]') && !S.dirty) setDirty(); });
        dlg.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && S.edit) { e.preventDefault(); save(); } });
        dlg.addEventListener('error', e => { const im = e.target; if (im?.matches?.('img[data-ar-img]') && !im.dataset.broken) { im.dataset.broken = '1'; const sp = document.createElement('span'); sp.className = `${im.className} is-empty is-broken`; sp.title = 'Image introuvable'; sp.textContent = '🖼'; im.replaceWith(sp); } }, true);
        // « ↗ Fiche » d'une personne (menu de choix, lecture des zones) : on ferme la fenêtre d'abord
        dlg.addEventListener('picker-open', async e => {
            if (e.detail.kind === 'person' || e.detail.kind === 'animal') { e.preventDefault(); e.stopPropagation(); if (await close()) A().openPersonById?.(e.detail.id); return; }
            if (e.detail.kind === 'periodical') { e.preventDefault(); e.stopPropagation(); if (await close()) BL.openPeriodicals(); }
        });
        dlg.addEventListener('click', async e => {
            const t = e.target.closest('button, [data-ar-open], [data-ar-row-open], [data-bl-periodical]'); if (!t || !dlg.contains(t)) return;
            if (t.closest('.pk') || t.closest('.mpk') || t.closest('.mf')) return;
            const d = t.dataset;
            if (d.arTab) { if (S.edit && !await leave()) return; S.edit = false; S.dirty = false; S.back = []; S.view = 'list'; S.kind = d.arTab; S.id = 0; return paint(true); }
            if (d.arOpen) { e.preventDefault(); return openIt(Number(d.arOpen)); }
            if (d.arRowOpen) return openIt(Number(d.arRowOpen));
            if (d.arPerson) { if (await close()) A().openPersonById?.(Number(d.arPerson)); return; }
            if (d.blPeriodical) { if (await close()) BL.openPeriodicals(); return; }
            if (d.arZoom !== undefined) { const it = current(), ph = ART.normPhotos(it?.data?.photos)[Number(d.arZoom)]; if (ph) ext.openDialog?.({eyebrow: 'PHOTO', title: ph.c || it.title, wide: true, body: `<img src="${esc(U.photoSrc(ph))}" alt="" style="max-width:100%;max-height:75vh;display:block;margin:auto">`, submitLabel: 'Fermer', onSubmit: () => true}); return; }
            if (d.arPlace) { toast('Ce lieu est dans ta base : ouvre-le depuis « Lieux ».'); return; }
            if (d.arUnhide) { ART.setVisible(store, S.kind, 'fiche', d.arUnhide, true); ART.collect(body, store, current(), S.draft); try { await store.saveSettings(); } catch (er) { toast(er.message, 'error'); } return paint(false); }
            const c = d.arCmd; if (!c) return;
            if (c === 'close') return close();
            if (c === 'read') { if (!await leave()) return; S.edit = false; S.dirty = false; S.draft = null; if (!S.id) return back(); return paint(true); }
            if (c === 'edit') return startEdit();
            if (c === 'save') return save();
            if (c === 'new') return newItem(S.kind);
            if (c === 'fields') return ART.openFieldsPanel?.(C, S.kind, 'fiche');
            if (c === 'addfield') return ART.addFieldDialog?.(C, S.kind);
            if (c === 'export') return S.view === 'item' ? ART.exportItem?.(C, current()) : ART.exportList?.(C, S.kind);
            if (c === 'delete') { const it = current(); if (!it?.id) return; try { await BL.remove(it, async () => { await reload(); if (S.view === 'item' && !store.get(S.id)) { S.edit = false; S.draft = null; S.dirty = false; back(); } else paint(true); }); } catch (er) { toast(er.message, 'error'); } return; }
        });
        // ouverture
        if (o.item) { const it = store.get(o.item); if (it) { Object.assign(S, {view: 'item', kind: it.kind, id: it.id}); store.ownerPid = it.person_id; } }
        paint(true);
        if (o.item && o.edit) startEdit();
        if (o.add) newItem(o.add === true ? S.kind : o.add, o.preset || {});
        return C;
    };
    /** ouvrir une fiche de ces sortes depuis n'importe où (menu de choix « ↗ Ouvrir », pastille…) */
    BL.openItem = async (id, o = {}) => {
        try { const r = await A().api('art', {op: 'item', id}); const it = r.item; return BL.open({kind: it.kind, item: it.id, pid: o.pid || 0, edit: !!o.edit, onClose: o.onClose}); } catch (e) { toast(e.message, 'error'); return null; }
    };
    // le menu de choix (« ↗ Ouvrir » d'une fiche « artwork ») passe par le catalogue des artistes : nos sortes s'ouvrent ici
    const hookCatalog = () => {
        const cat = ext.artistCatalog; if (!cat || cat._blocs) return; cat._blocs = true;
        const orig = cat.openItem;
        cat.openItem = async id => { try { const r = await A().api('art', {op: 'item', id}); if (BL.KINDS.has(r.item.kind)) return BL.open({kind: r.item.kind, item: r.item.id}); } catch (e) { toast(e.message, 'error'); return null; } return orig(id); };
        ART.openItem = cat.openItem;
    };
    hookCatalog(); document.addEventListener('DOMContentLoaded', hookCatalog);

    /** « Listes → Revues et magazines » (le média d'un passage) */
    BL.openPeriodicals = () => { const st = A()?.state; if (!st || !A().setModule) return; st.listType = 'periodicals'; A().setModule('listes'); };

    /* ═════════ Le formulaire : pastilles, champs « seulement pour… », documents ═════════ */
    /** les champs « onlyFor: {champ: [valeurs]} » ne se montrent que si le champ de pastilles a l'une de ces valeurs */
    BL.afterForm = (root, kind) => {
        const def = ART.defs[kind]; if (!def) return;
        const all = ART.fieldsOf(def), cond = all.filter(f => f.onlyFor);
        const sync = () => cond.forEach(f => { const el = root.querySelector(`[data-ar-form] [data-fk="${CSS.escape(f.key)}"]`); if (!el) return;
            const ok = Object.entries(f.onlyFor).every(([k, vals]) => { const box = root.querySelector(`[data-ar-form] [data-fk="${CSS.escape(k)}"]`); if (!box) return true; const t = ART.ft[all.find(x => x.key === k)?.type] || {}; const v = t.get ? t.get(box) : ''; return vals.includes(v); });
            el.hidden = !ok; });
        const syncAll = () => { sync(); root.querySelectorAll('[data-ar-form] > .ar-egrid').forEach(g => { const fs = [...g.querySelectorAll(':scope > [data-fk]')]; const off = fs.length > 0 && fs.every(x => x.hidden) && !g.querySelector(':scope > .ar-offline'); g.hidden = off; if (g.previousElementSibling?.matches('.ar-grp')) g.previousElementSibling.hidden = off; }); };
        syncAll();
        root.querySelector('[data-ar-form]')?.addEventListener('bl-sync', syncAll);
        root.querySelector('[data-ar-form]')?.addEventListener('change', syncAll);
        def.afterForm?.(root);
    };
    document.addEventListener('click', async e => {
        const dlg = e.target.closest?.('.bl-dlg'); if (!dlg) return;
        const pill = e.target.closest('[data-pill]');
        if (pill) { const box = pill.closest('[data-pills]'), on = !pill.classList.contains('is-active'); box.querySelectorAll('[data-pill]').forEach(b => { b.classList.remove('is-active'); b.setAttribute('aria-pressed', 'false'); }); if (on) { pill.classList.add('is-active'); pill.setAttribute('aria-pressed', 'true'); const fr = box.querySelector('[data-pill-free]'); if (fr) fr.value = ''; }
            box.dispatchEvent(new Event('change', {bubbles: true})); box.dispatchEvent(new Event('bl-sync', {bubbles: true})); return; }
        const del = e.target.closest('[data-ml-del]');
        if (del) { const box = del.closest('[data-ml-box]'); del.closest('[data-ml]').remove(); box.dispatchEvent(new Event('change', {bubbles: true})); return; }
        const add = e.target.closest('[data-ml-add]');
        if (add) {
            const C = dlg._C, box = add.closest('[data-ml-box]');
            const list = await P().openMediaPicker?.({multiple: true, types: ['document', 'image', 'audio', 'video'], person: C?.S?.owner || C?.store?.ownerPid || undefined, eyebrow: 'DOCUMENTS', title: 'Bulletins, livrets, contrats…', okLabel: 'Ajouter ces documents', allowImport: true});
            if (!list?.length) return;
            const have = new Set([...box.querySelectorAll('[data-ml]')].map(x => { try { return JSON.parse(x.dataset.ml).mid; } catch (_) { return 0; } }));
            list.filter(m => !have.has(Number(m.id))).forEach(m => { const tmp = document.createElement('div'); tmp.innerHTML = mlChip({mid: Number(m.id), f: m.filename || '', title: m.title || '', type: m.media_type || ''}, true); add.before(tmp.firstElementChild); });
            box.dispatchEvent(new Event('change', {bubbles: true}));
        }
    });
    document.addEventListener('input', e => { const fr = e.target.closest?.('.bl-dlg [data-pill-free]'); if (!fr || !fr.value.trim()) return; fr.closest('[data-pills]').querySelectorAll('[data-pill].is-active').forEach(b => { b.classList.remove('is-active'); b.setAttribute('aria-pressed', 'false'); }); fr.dispatchEvent(new Event('bl-sync', {bubbles: true})); });

    /* ═════════ Les blocs de la fiche de la personne : données (crochet du serveur, sinon chargées ici) ═════════ */
    BL._cache = new Map();
    /** toutes les fiches d'une personne (les siennes, et celles des autres qui la citent), {items, cited, people} */
    BL.dataFor = async (pid, {fresh = false} = {}) => {
        pid = Number(pid) || 0; if (!pid) return {items: [], cited: [], people: []};
        if (!fresh && BL._cache.has(pid)) return BL._cache.get(pid);
        const pr = A().api('blocs', {op: 'person', person_id: pid}).then(r => ({items: r.items || [], cited: r.cited || [], people: r.people || []}));
        BL._cache.set(pid, pr); pr.catch(() => BL._cache.delete(pid));
        return pr;
    };
    /** une petite boutique en lecture seule (pastilles des personnes) faite des données d'un bloc */
    BL.miniStore = (pid, data) => { const s = new BlocStore(pid, []); s.items = [...(data.items || []), ...(data.cited || [])]; s.people = data.people || []; s.byId = new Map(s.items.map(i => [i.id, i])); return s; };
    /** le bloc : tout de suite si le serveur a donné les données (detail.heritage.blocs), sinon un rond qui tourne puis on remplit */
    BL.block = ({key, title, render, actions}) => (index, detail, opt = {}) => {
        const p = detail.person; if (!p?.id) return '';
        if (p.kind === 'animal' && key !== 'awards') return '';
        const ed = h => (opt.editOnly ? opt.editOnly(h) : h);
        const data = detail.heritage?.blocs;
        const inner = data ? render(p, data, {locked: !!opt.isLocked}) : `<div data-bl-host="${esc(key)}" data-pid="${Number(p.id)}" data-locked="${opt.isLocked ? 1 : 0}">${UI().spinner ? UI().spinner('Chargement…') : 'Chargement…'}</div>`;
        return A().card(index, title, '', `<div class="bl-block" data-bl-block="${esc(key)}" data-pid="${Number(p.id)}">${inner}</div>`, 'span-12', actions(p, ed));
    };
    BL.renderers = {};
    ext.afterPerson.push(detail => {
        const hosts = document.querySelectorAll('[data-bl-host]'); if (!hosts.length) return;
        const pid = Number(detail?.person?.id) || Number(hosts[0].dataset.pid);
        BL.dataFor(pid, {fresh: true}).then(data => { document.querySelectorAll(`[data-bl-host][data-pid="${pid}"]`).forEach(h => { const r = BL.renderers[h.dataset.blHost]; if (r) h.outerHTML = r(detail.person || {id: pid}, data, {locked: h.dataset.locked === '1'}); }); })
            .catch(e => document.querySelectorAll('[data-bl-host]').forEach(h => { h.innerHTML = UI().notice ? UI().notice('error', e.message) : esc(e.message); }));
    });
    // les clics des blocs de la fiche (hors de la fenêtre)
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-bl-open],[data-bl-item],[data-bl-new],[data-bl-mf]'); if (!b || b.closest('.bl-dlg')) return; if (e.target.closest('[data-ar-player], a[href]')) return;
        if (b.dataset.blMf !== undefined) { const blk = b.closest('.bl-block'); blk.querySelectorAll('[data-bl-mf]').forEach(x => x.classList.toggle('is-active', x === b)); const v = b.dataset.blMf;
            blk.querySelectorAll('[data-bl-medium]').forEach(c => { c.hidden = !!v && c.dataset.blMedium !== v; }); return; }
        e.preventDefault();
        const pid = Number(b.dataset.pid) || 0;
        if (b.dataset.blItem) return BL.open({kind: b.dataset.blKind || undefined, item: Number(b.dataset.blItem), pid});
        if (b.dataset.blNew) return BL.open({kind: b.dataset.blNew, pid, add: true});
        return BL.open({domain: b.dataset.blOpen, kind: b.dataset.blKind || undefined, pid});
    });
    // après un enregistrement : la fiche de la personne se redessine (et les listes de l'écran Listes)
    document.addEventListener('lcnda:blocs-changed', () => { if (!OPEN) ext.refreshView?.(); });

    // « 🎨 Cité dans des catalogues d'artistes » : sans nos fiches (elles ont leurs propres blocs, avec « dans la fiche de … »)
    const hookCited = () => { const f = ext.personBlocks.artist_cited; if (!f || f._blocs) return; const g = (index, detail, o) => f(index, {...detail, heritage: {...(detail.heritage || {}), artist_cited: (detail.heritage?.artist_cited || []).filter(c => !BL.KINDS.has(c.kind))}}, o); g._blocs = true; ext.personBlocks.artist_cited = g; };
    hookCited(); document.addEventListener('DOMContentLoaded', hookCited);

    /* ═════════ L'écran Listes : « Revue de presse » et « Palmarès » (toutes les personnes) ═════════ */
    let listOnChg = null;
    BL.listScreen = (domain, kind) => async token => {
        const ws = A().$('#workspace'), D = BL.DOMAINS[domain], def = ART.defs[kind];
        const st = () => A().state?.workspaceToken;
        const store = new BlocStore(0, D.kinds);
        ws.innerHTML = `<section class="page bl-page">${UI().spinner ? UI().spinner('Chargement…') : 'Chargement…'}</section>`;
        try { await store.load(); } catch (e) { if (token === st()) ws.innerHTML = `<section class="page">${A().empty(e.message)}</section>`; return; }
        if (token !== undefined && token !== st()) return;
        ws.innerHTML = `<section class="page bl-page">${(window.LCNDA_UI?.pageHeader || (o => `<header class="page-header"><div><span class="eyebrow"></span><h2>${esc(o.icon)} ${esc(o.title)}</h2><p>${o.help}</p></div><div class="page-actions">${o.primary}${o.actions.join('')}</div></header>`))({icon: D.icon, title: D.label, help: esc(def.listIntro || ''), primary: store.readonly ? '' : `<button type="button" class="button small" data-bl-pnew>＋ ${def.fem ? 'Nouvelle' : 'Nouveau'} ${esc(def.label.toLowerCase())}</button>`, actions: ['<button type="button" class="button small secondary" data-bl-pexport>⤓ Exporter ▾</button>']})}
            <div class="bl-pagewrap"><div class="bl-pagebody" data-bl-pbody></div><aside class="ar-panel" data-ar-panel hidden></aside></div></section>`;
        const page = ws.querySelector('.bl-page'), host = ws.querySelector('[data-bl-pbody]');
        const C = {dlg: page, pid: 0, store, S: {view: 'list', kind, id: 0, changed: false}, body: host, panel: null, prefs: {}, savePrefs: () => {},
            reload: async () => { await store.load(); }, paint: () => { host.innerHTML = ''; BL.mountList(C, host); },
            open: id => BL.open({kind, item: Number(id), onClose: refresh}), current: () => null};
        async function refresh() { try { await store.load(); } catch (e) { toast(e.message, 'error'); return; } if (page.isConnected) C.paint(); }
        host.innerHTML = ''; BL.mountList(C, host, {who: null});
        page.addEventListener('click', e => {
            const t = e.target.closest('[data-ar-row-open],[data-ar-cmd],[data-bl-pnew],[data-bl-pexport],[data-ar-person],[data-bl-periodical],[data-ar-open]'); if (!t) return;
            if (t.dataset.arRowOpen) return C.open(t.dataset.arRowOpen);
            if (t.dataset.arOpen) return BL.openItem(Number(t.dataset.arOpen), {onClose: refresh});
            if (t.dataset.arPerson) return A().openPersonById?.(Number(t.dataset.arPerson));
            if (t.dataset.blPeriodical) return BL.openPeriodicals();
            if (t.hasAttribute('data-bl-pnew') || t.dataset.arCmd === 'new') return BL.open({kind, add: true, onClose: refresh});
            if (t.hasAttribute('data-bl-pexport')) return ART.exportList?.(C, kind);
        });
        const onChg = () => { if (!page.isConnected) { document.removeEventListener('lcnda:blocs-changed', onChg); return; } refresh(); };
        // un seul écouteur pour l'écran Listes : celui de la page d'avant part (sinon un de plus, avec toute sa page, à chaque passage)
        if (listOnChg) document.removeEventListener('lcnda:blocs-changed', listOnChg);
        listOnChg = onChg; document.addEventListener('lcnda:blocs-changed', onChg);
    };

    /* ═════════ La petite API pour les autres outils (profils sportif, politique, artiste…) ═════════ */
    /** BL.listFor(pid, {kinds, cited}) → les fiches de la personne (cited: true ajoute celles des autres qui la citent) */
    BL.listFor = async (pid, {kinds = null, cited = false} = {}) => {
        const d = await BL.dataFor(pid); const l = [...d.items, ...(cited ? d.cited : [])];
        return (kinds ? l.filter(it => kinds.includes(it.kind)) : l).map(it => clone(it));
    };
})();
