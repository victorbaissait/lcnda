/* LCNDA — 🔍 Le menu de choix unique : une personne, un lieu, une source, un média, une enquête… ou plusieurs sortes.
 * Maquettes validées : docs/design/choix-personne.html, choix-personnes-roles.html, choix-lieux-et-autres.html.
 * Mode d'emploi pour les outils : docs/PICKER.md. Recherche côté serveur : lib/picker.php (picker_search).
 *
 *   html = LCNDA_PICKER.pickerField({name:'person_id', kind:'person'})   → le champ se lie tout seul
 *   item = await LCNDA_PICKER.openPicker({kind:'place'})                → petite fenêtre « choisir »
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const plural = (n, one, many) => `${n} ${n > 1 ? (many || one + 's') : one}`;
    const toast = (msg, type) => { try { (A().toast || (m => console.info(m)))(msg, type); } catch (_) {} };

    // Chaque sorte : symbole du champ, texte d'aide, nom au pluriel (pour « N … trouvé(e)s »), boutons.
    const K = {
        person: {ico: '🔍', ph: 'Nom, prénom… (2 lettres suffisent)', add: '＋ Ajouter une personne…', one: 'fiche', fem: true, open: '↗ Fiche', none: 'Aucune fiche', create: 'Créer la fiche', min: 2, label: '👤 Personnes'},
        place: {ico: '📍', ph: 'Ville, village, paroisse…', add: '＋ Ajouter un lieu…', one: 'lieu', many: 'lieux', open: '↗ Lieu', none: 'Aucun lieu', create: 'Créer le lieu', min: 2, label: '📍 Lieux'},
        source: {sym: '📚', add: '＋ Ajouter une source…', one: 'source', fem: true, none: 'Aucune source', label: '📚 Sources'},
        media: {sym: '🖼', add: '＋ Ajouter un média…', one: 'média', none: 'Aucun média', label: '🖼 Médias'},
        investigation: {sym: '🔍', add: '＋ Ajouter une enquête…', one: 'enquête', fem: true, none: 'Aucune enquête', label: '🔍 Enquêtes'},
        battue: {sym: '🧭', add: '＋ Ajouter une battue…', one: 'battue', fem: true, none: 'Aucune battue', label: '🧭 Battues'},
        label: {sym: '🏷', add: '＋ Ajouter une étiquette…', one: 'étiquette', fem: true, none: 'Aucune étiquette', label: '🏷 Étiquettes'},
        house: {sym: '🏠', add: '＋ Ajouter une maison…', one: 'maison', fem: true, none: 'Aucune maison', label: '🏠 Maisons'},
        periodical: {sym: '📰', add: '＋ Ajouter une revue…', one: 'revue', fem: true, none: 'Aucune revue', label: '📰 Revues'},
        employer: {sym: '🏭', add: '＋ Ajouter un employeur…', one: 'employeur', none: 'Aucun employeur', label: '🏭 Employeurs'},
        census: {sym: '📋', add: '＋ Ajouter un recensement…', one: 'recensement', none: 'Aucun recensement', label: '📋 Recensements'},
    };
    const kindOf = k => K[k] ? k : 'person';
    const isPerson = it => it && (it.kind === 'person' || it.kind === 'animal');
    const ROLES = ['témoin', 'parrain', 'marraine', 'voisin', 'employeur', 'officier', 'déclarant', 'épouse', 'époux', 'enfant', 'parent', 'autre'];

    // ── appels au serveur (api() de l'app quand elle est là, sinon fetch direct) ──
    async function get(params) {
        if (A().api) return A().api('picker_search', params);
        const url = new URL('api.php', location.href); url.searchParams.set('action', 'picker_search');
        Object.entries(params).forEach(([k, v]) => v !== undefined && url.searchParams.set(k, v));
        const r = await fetch(url, {headers: {Accept: 'application/json'}}); const d = await r.json(); if (d.error) throw new Error(d.error); return d;
    }
    async function post(action, body) {
        if (A().api) { const d = await A().api(action, {}, {method: 'POST', body}); return d.result ?? d; }
        const url = new URL('api.php', location.href); url.searchParams.set('action', action);
        const csrf = A().state?.csrf || '';
        const r = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf, Accept: 'application/json'}, body: JSON.stringify({...body, csrf})});
        const d = await r.json(); if (d.error) throw new Error(d.error); return d.result ?? d;
    }

    // ── petits morceaux de rendu ──
    const sosaOf = it => { if (!isPerson(it) || !it.id) return 0; try { return Number(A().sosaNumberFor?.(it.id)) || 0; } catch (_) { return 0; } };
    const avClass = it => it.kind === 'animal' ? 'a' : it.gender === 'male' ? 'm' : it.gender === 'female' ? 'f' : 'u';
    /** Le symbole de gauche : rond d'initiales (ou photo), repère de lieu, pastille de couleur, vignette ou symbole. */
    function sym(it) {
        if (it.free) return '<span class="pk-av u">?</span>';
        if (isPerson(it)) {
            const ini = it.initials || (it.kind === 'animal' ? '🐾' : initialsOf(it.title));
            return it.thumb ? `<span class="pk-av ${avClass(it)} photo" style="background-image:url('${esc(it.thumb)}')" aria-hidden="true">${esc(ini)}</span>` : `<span class="pk-av ${avClass(it)}" aria-hidden="true">${esc(ini)}</span>`;
        }
        if (it.kind === 'place') return `<span class="pk-ic pin${it.group === 'base' || !it.group ? '' : ' ref'}" aria-hidden="true"><span>${it.group === 'base' || !it.group ? '●' : '○'}</span></span>`;
        if (it.kind === 'label') return `<span class="pk-ic dot" aria-hidden="true"><i style="background:${esc(/^#[0-9a-f]{3,8}$/i.test(it.color || '') ? it.color : '#0066cc')}"></i></span>`;
        if (it.thumb) return `<span class="pk-ic thumb has-img" style="background-image:url('${esc(it.thumb)}')" aria-hidden="true"></span>`;
        if (it.kind === 'house') return '<span class="pk-ic house" aria-hidden="true">🏠</span>';
        return `<span class="pk-ic" aria-hidden="true">${esc(it.icon || K[it.kind]?.sym || '•')}</span>`;
    }
    const initialsOf = t => String(t || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
    /** Lettres tapées surlignées, sans tenir compte des accents ni des tirets. */
    function mark(text, q, minTok = 1) {
        text = String(text ?? ''); const fq = fold(q).replace(/[^a-z0-9]+/g, ' ').trim();
        if (!fq || fq.length < minTok) return esc(text);
        const chars = [...text], f = chars.map(c => { const x = fold(c); return /[a-z0-9]/.test(x[0] || '') ? x[0] : ' '; }).join('');
        const ranges = [], find = needle => { if (!needle) return false; let i = f.indexOf(needle), hit = false; while (i >= 0) { ranges.push([i, i + needle.length]); hit = true; i = f.indexOf(needle, i + needle.length); } return hit; };
        // la plus longue suite de mots tapés d'abord (« saint martin » dans « saint-martin 32 »), puis les autres mots
        const toks = fq.split(' ');
        let k = toks.length; while (k > 1 && !f.includes(toks.slice(0, k).join(' '))) k--;
        if (!find(toks.slice(0, k).join(' ')) || k < toks.length) toks.slice(k).filter(t => t.length >= Math.max(minTok, 2)).forEach(find);
        if (!ranges.length) return esc(text);
        ranges.sort((a, b) => a[0] - b[0]);
        let out = '', pos = 0;
        ranges.forEach(([a, b]) => { if (b <= pos) return; a = Math.max(a, pos); out += esc(chars.slice(pos, a).join('')) + '<mark>' + esc(chars.slice(a, b).join('')) + '</mark>'; pos = b; });
        return out + esc(chars.slice(pos).join(''));
    }
    const shortInfo = it => { const s = sosaOf(it); return [it.free ? 'sans fiche' : (it.short || (isPerson(it) ? '' : '')), s ? `Sosa ${s}` : ''].filter(Boolean).join(' · '); };
    const openLabel = kind => K[kind]?.open || '↗ Ouvrir';
    const keyOf = it => it.free ? `txt:${fold(it.title)}` : `${it.kind === 'animal' ? 'person' : it.kind}:${it.id}`;

    /** Ligne de la liste. */
    function rowHtml(it, q, idx, on) {
        const s = sosaOf(it), title = mark(it.title, q), titleHit = title.includes('<mark>'); // la ligne grise n'est surlignée que si le nom ne l'est pas
        const badge = s ? `<span class="pk-badge sosa">Sosa ${s}</span>` : it.badge ? `<span class="pk-badge2${it.badge_style === 'blue' ? ' blue' : ''}">${esc(it.badge)}</span>` : '';
        return `<div class="pk-item pk-row${on ? ' on' : ''}" role="option" data-row="${idx}" aria-selected="${on ? 'true' : 'false'}">${sym(it)}<div class="pk-txt"><div class="pk-name">${title}</div>${it.meta ? `<div class="pk-meta">${titleHit ? esc(it.meta) : mark(it.meta, q, 3)}</div>` : ''}</div>${badge}</div>`;
    }
    /** Pastille d'une chose choisie (seule : avec « ↗ Fiche » ; dans une liste : petite). */
    function chipHtml(it, i, small) {
        const info = shortInfo(it);
        const title = it.free ? `« ${esc(it.title)} »` : esc(it.kind === 'place' && it.name ? it.name : it.title); // « Saint-Martin (Gers) » : le département est déjà à côté
        if (small) return `<span class="pk-chip${it.free ? ' free' : ''}" data-i="${i}">${sym(it)}<b>${title}</b>${info ? `<small>${esc(info)}</small>` : ''}<button type="button" class="x" data-pk="remove" data-i="${i}" data-ia-done="1" title="Retirer" aria-label="Retirer ${esc(it.title)}">×</button></span>`;
        return `<span class="pk-chip${it.free ? ' free' : ''}" data-i="${i}">${sym(it)}<span><b>${title}</b>${info ? ` <small>${esc(info)}</small>` : ''}</span>`
            + (it.free ? '' : `<button type="button" class="go" data-pk="open" data-i="${i}" data-ia-done="1" title="Ouvrir">${esc(openLabel(it.kind === 'animal' ? 'person' : it.kind))}</button>`)
            + (it.kind === 'place' && !it.free ? `<button type="button" class="go" data-pk="map" data-i="${i}" data-ia-done="1" title="Voir sur la carte">🗺</button>` : '')
            + `<button type="button" class="x" data-pk="remove" data-i="${i}" data-ia-done="1" title="Changer" aria-label="Changer">×</button></span>`;
    }
    function searchHtml(kind, target, placeholder, hidden) {
        const k = K[kindOf(kind.split(',')[0])], mixed = kind.includes(',');
        return `<div class="pk-search" data-target="${esc(target)}"${hidden ? ' hidden' : ''}><div class="pk-box"><span class="pk-ico" aria-hidden="true">${mixed ? '🔍' : (k.ico || '🔍')}</span><input type="text" class="pk-input" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-autocomplete="list" placeholder="${esc(placeholder)}"><span class="pk-kbd" hidden>Échap</span></div><div class="pk-list" role="listbox" hidden></div></div>`;
    }

    // ── valeur : normalisation et champ caché ──
    function norm(v, kind) {
        if (v == null || v === '') return null;
        if (typeof v === 'number' || /^\d+$/.test(String(v))) return {kind, id: Number(v), title: '', _load: true};
        if (typeof v === 'string') return v.startsWith('txt:') ? {kind, id: null, title: v.slice(4), free: true} : {kind, id: null, title: v, free: true};
        if (typeof v === 'object') {
            if (v.txt != null && !v.id) return {...v, kind: v.kind || kind, id: null, title: String(v.txt), free: true};
            const it = {...v, kind: v.kind || kind};
            if (it.id) it.id = Number(it.id);
            if (!it.id && !it.ref) return it.title ? {...it, id: null, free: true} : null;
            if (!it.title) it._load = true;
            if (it.title == null) it.title = '';
            return it;
        }
        return null;
    }
    const valOf = it => it ? (it.free ? `txt:${it.title}` : String(it.id)) : '';
    function hiddenValue(c) {
        if (c.opts.roles) return JSON.stringify({main: c.main ? (c.main.free ? null : c.main.id) : null, people: c.people.map(p => ({...(p.free ? {txt: p.title} : {id: p.id}), role: p.role || '', primary: !!p.primary}))});
        return c.opts.multiple ? c.items.map(valOf).filter(Boolean).join(',') : valOf(c.items[0]);
    }

    // ── le champ ──
    const CTRL = new WeakMap();
    function pickerField(o = {}) {
        const opts = {name: o.name || 'picker', kind: String(o.kind || 'person'), multiple: !!o.multiple, placeholder: o.placeholder || '', allowFree: !!o.allowFree,
            allowCreate: o.allowCreate === undefined ? 'auto' : !!o.allowCreate, roles: o.roles ? {main: o.roles.main !== false, roleList: Array.isArray(o.roles.roleList) && o.roles.roleList.length ? o.roles.roleList : ROLES} : null,
            animals: o.animals === false ? 0 : 1, label: o.label || ''};
        const c = makeCtrl(opts, o.value);
        return `<div class="pk${opts.roles ? ' pk-roles' : ''}" data-picker="${esc(opts.kind)}" data-pk-opts="${esc(JSON.stringify(opts))}" data-pk-value="${esc(JSON.stringify(stateOut(c)))}">${innerHtml(c)}</div>`;
    }
    function makeCtrl(opts, value) {
        const kind = kindOf(opts.kind.split(',')[0]);
        const c = {opts, kind, items: [], main: null, people: [], el: null};
        if (opts.roles && typeof value === 'string') { try { value = JSON.parse(value); } catch (_) { value = null; } }
        if (opts.roles) {
            const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {people: Array.isArray(value) ? value : []};
            c.main = opts.roles.main ? norm(v.main, 'person') : null;
            c.people = (v.people || []).map(p => { const it = norm(p, 'person'); return it && {...it, role: p.role || '', primary: !!p.primary}; }).filter(Boolean);
            if (!opts.roles.main && c.main) { c.people.unshift({...c.main, primary: true, role: ''}); c.main = null; }
        } else {
            const list = Array.isArray(value) ? value : typeof value === 'string' && opts.multiple && value.includes(',') ? value.split(',') : value == null || value === '' ? [] : [value];
            c.items = list.map(v => norm(v, kind)).filter(Boolean);
            if (!opts.multiple) c.items = c.items.slice(0, 1);
        }
        return c;
    }
    const stateOut = c => c.opts.roles ? {main: c.main, people: c.people} : c.items;
    function innerHtml(c) {
        const o = c.opts, k = K[c.kind], hid = `<input type="hidden" name="${esc(o.name)}" value="${esc(hiddenValue(c))}">`;
        if (o.roles) {
            return hid + (o.roles.main ? `<span class="pk-lab">⭐ Personne principale <small>— une seule</small></span><div class="pk-mainslot">${mainHtml(c)}</div>${searchHtml('person', 'main', o.placeholder || 'Choisir la personne principale…', !!c.main)}` : '')
                + `<div class="pk-zone prim" data-zone="primary"><div class="pk-zone-h"><b>★ ${o.roles.main ? 'Autres personnes principales' : 'Personnes principales'}</b><small>au cœur de la recherche</small></div><div class="pk-chips2" data-zone-chips="primary">${zoneChips(c, true)}</div>${searchHtml('person', 'primary', '＋ Ajouter une personne principale…')}</div>`
                + `<div class="pk-zone" data-zone="secondary"><div class="pk-zone-h"><b>☆ Personnes secondaires</b><small>témoins, voisins, parrains, pistes…</small></div><div class="pk-chips2" data-zone-chips="secondary">${zoneChips(c, false)}</div>${searchHtml('person', 'secondary', '＋ Ajouter une personne secondaire…')}</div>`;
        }
        const mixed = o.kind.includes(',');
        const ph = o.placeholder || (mixed ? 'Rechercher…' : k.ph || 'Rechercher…');
        if (o.multiple) return hid + `<div class="pk-chips">${c.items.map((it, i) => chipHtml(it, i, true)).join('')}</div>` + searchHtml(o.kind, 'add', o.placeholder || (mixed ? '＋ Ajouter…' : k.add));
        return hid + `<div class="pk-chosen">${c.items[0] ? chipHtml(c.items[0], 0, false) : ''}</div>` + searchHtml(o.kind, 'set', ph, !!c.items[0]);
    }
    function mainHtml(c) {
        const m = c.main; if (!m) return '';
        const s = sosaOf(m), meta = [m.free ? 'sans fiche' : m.meta, s ? `Sosa ${s}` : ''].filter(Boolean).join(' · ');
        return `<div class="pk-main-card">${sym(m)}<div class="who"><b>${esc(m.title)}</b>${meta ? `<div>${esc(meta)}</div>` : ''}</div><span class="pk-star">★ PRINCIPALE</span>${m.free ? '' : '<button type="button" class="btn-s" data-pk="open-main" data-ia-done="1">↗ Fiche</button>'}<button type="button" class="btn-s" data-pk="change-main" data-ia-done="1">Changer</button></div>`;
    }
    function zoneChips(c, primary) {
        return c.people.map((p, i) => ({p, i})).filter(x => !!x.p.primary === primary).map(({p, i}) => {
            const info = p.free ? 'sans fiche' : [p.short, sosaOf(p) ? `Sosa ${sosaOf(p)}` : ''].filter(Boolean).join(' · ');
            const role = p.role ? `<button type="button" class="role" data-pk="role" data-i="${i}" data-ia-done="1" title="Changer le rôle">${esc(p.role)} ▾</button>` : `<button type="button" class="role empty" data-pk="role" data-i="${i}" data-ia-done="1" title="Donner un rôle (facultatif)">rôle ▾</button>`;
            return `<span class="pk-chip2${p.free ? ' free' : ''}" draggable="true" data-i="${i}">${sym(p)}<b>${p.free ? `« ${esc(p.title)} »` : esc(p.title)}</b>${info ? `<small>${esc(info)}</small>` : ''}${role}<button type="button" class="tg${primary ? '' : ' off'}" data-pk="toggle" data-i="${i}" data-ia-done="1" title="${primary ? 'Passer en secondaire' : 'Passer en principale'}">${primary ? '★' : '☆'}</button><button type="button" class="x" data-pk="remove" data-i="${i}" data-ia-done="1" title="Retirer" aria-label="Retirer ${esc(p.title)}">×</button></span>`;
        }).join('');
    }

    /** Redessine les pastilles (les cases de recherche restent en place : la frappe et le focus ne sont pas perdus). */
    function renderChosen(c) {
        const el = c.el, o = c.opts;
        el.querySelector(':scope > input[type=hidden]').value = hiddenValue(c);
        el.dataset.pkValue = JSON.stringify(stateOut(c));
        if (o.roles) {
            if (o.roles.main) { el.querySelector('.pk-mainslot').innerHTML = mainHtml(c); el.querySelector('.pk-search[data-target=main]').hidden = !!c.main; }
            el.querySelector('[data-zone-chips=primary]').innerHTML = zoneChips(c, true);
            el.querySelector('[data-zone-chips=secondary]').innerHTML = zoneChips(c, false);
        } else if (o.multiple) {
            el.querySelector('.pk-chips').innerHTML = c.items.map((it, i) => chipHtml(it, i, true)).join('');
        } else {
            el.querySelector('.pk-chosen').innerHTML = c.items[0] ? chipHtml(c.items[0], 0, false) : '';
            el.querySelector('.pk-search[data-target=set]').hidden = !!c.items[0];
        }
    }
    function emit(c) {
        const el = c.el, o = c.opts, value = pickerValue(el);
        const detail = {name: o.name, kind: o.kind, value};
        if (o.roles) detail.items = {main: c.main, people: c.people}; else if (o.multiple) detail.items = c.items; else detail.item = c.items[0] || null;
        el.dispatchEvent(new CustomEvent('picker-change', {bubbles: true, detail}));
        // compatibilité avec l'ancien champ collectionPersonField
        if (!o.roles && !o.multiple && c.kind === 'person') { const it = c.items[0]; el.dispatchEvent(new CustomEvent('cp-pick', {bubbles: true, detail: {id: it && !it.free ? Number(it.id) : 0, name: it ? it.title : '', field: o.name}})); }
        el.querySelector(':scope > input[type=hidden]').dispatchEvent(new Event('change', {bubbles: true}));
    }

    /** Relit les fiches dont on n'a que le numéro (valeur donnée par l'outil). */
    async function loadMissing(c) {
        const all = c.opts.roles ? [c.main, ...c.people].filter(Boolean) : c.items, todo = all.filter(it => it._load && it.id);
        if (!todo.length) return;
        const byKind = {};
        todo.forEach(it => { const k = it.kind === 'animal' ? 'person' : it.kind; (byKind[k] = byKind[k] || []).push(it.id); });
        for (const [kind, ids] of Object.entries(byKind)) {
            try {
                const d = await get({kind, ids: ids.join(',')});
                const found = {}; (d.groups || []).forEach(g => g.items.forEach(x => { found[x.id] = x; }));
                all.forEach(it => { const f = it._load && found[it.id]; if (f) { const keep = {role: it.role, primary: it.primary}; Object.assign(it, f, it.role !== undefined ? keep : {}); delete it._load; } });
            } catch (_) {}
        }
        all.forEach(it => { if (it._load && !it.title) it.title = `#${it.id}`; delete it._load; });
        if (c.el) renderChosen(c);
    }

    function bind(el) {
        if (CTRL.has(el)) return CTRL.get(el);
        let opts, value; try { opts = JSON.parse(el.dataset.pkOpts || '{}'); } catch (_) { opts = {}; } try { value = JSON.parse(el.dataset.pkValue || 'null'); } catch (_) { value = null; }
        if (!opts.name) opts = {name: el.querySelector('input[type=hidden]')?.name || 'picker', kind: el.dataset.picker || 'person', multiple: false, allowCreate: 'auto', roles: null, animals: 1};
        const c = makeCtrl(opts, opts.roles ? value : Array.isArray(value) ? value : value);
        c.el = el; CTRL.set(el, c);
        if (!el.querySelector('.pk-search')) el.innerHTML = innerHtml(c);
        el.addEventListener('input', e => { const s = e.target.closest('.pk-search'); if (s && e.target.matches('.pk-input')) { e.stopPropagation(); schedule(c, s); } });
        el.addEventListener('focusin', e => { const s = e.target.closest('.pk-search'); if (s && e.target.matches('.pk-input')) onFocus(c, s); });
        el.addEventListener('focusout', e => { const s = e.target.closest('.pk-search'); if (s) setTimeout(() => { if (!s.contains(document.activeElement)) closeList(s); }, 150); });
        el.addEventListener('keydown', e => onKey(c, e));
        el.addEventListener('mousedown', e => { if (e.target.closest('.pk-list')) e.preventDefault(); if (e.target.closest('.pk-box') && !e.target.matches('input')) { e.preventDefault(); e.target.closest('.pk-box').querySelector('input').focus(); } });
        el.addEventListener('click', e => onClick(c, e));
        el.addEventListener('mouseover', e => { const r = e.target.closest('.pk-row'); if (!r) return; const s = r.closest('.pk-search'), st = S(s); const i = Number(r.dataset.row); if (st.active !== i) { st.active = i; s.querySelectorAll('.pk-row').forEach(x => x.classList.toggle('on', Number(x.dataset.row) === i)); } });
        el.addEventListener('scroll', e => { if (e.target.classList?.contains('pk-scroll')) maybeMore(c, e.target.closest('.pk-search')); }, true);
        dragBind(c);
        loadMissing(c);
        return c;
    }

    // ── la recherche dans une case ──
    const SS = new WeakMap();
    const S = s => { if (!SS.has(s)) SS.set(s, {seq: 0, q: '', groups: [], flat: [], more: false, next: 0, active: 0, filter: 'all', counts: null, loading: false, timer: 0, kind: ''}); return SS.get(s); };
    const EMPTY_OK = ['label', 'house', 'periodical', 'investigation', 'battue', 'source', 'employer', 'census', 'media'];
    function minLen(c) { const kinds = c.opts.kind.split(','); return kinds.length > 1 ? 2 : (K[kinds[0]]?.min ?? 1); }
    function onFocus(c, s) { const inp = s.querySelector('.pk-input'); if (inp.value.trim().length >= minLen(c) || (!inp.value.trim() && !c.opts.kind.includes(',') && EMPTY_OK.includes(c.kind))) { if (s.querySelector('.pk-list').hidden) run(c, s); } }
    function schedule(c, s) {
        const st = S(s); clearTimeout(st.timer);
        const q = s.querySelector('.pk-input').value.trim();
        if (q.length < minLen(c) && !(q === '' && EMPTY_OK.includes(c.kind) && !c.opts.kind.includes(','))) { st.seq++; closeList(s); return; }
        st.timer = setTimeout(() => run(c, s), 180);
    }
    /** Ce que le serveur doit chercher : « sosa 12 » devient la fiche n° x, une sorte précise si un filtre est choisi. */
    function query(c, s, q) {
        const st = S(s); let kind = c.opts.kind;
        if (kind.includes(',') && st.filter !== 'all') kind = st.filter;
        const m = q.match(/^sosa\s*(\d+)$/i);
        if (m && kind.split(',').includes('person')) {
            try { const map = A().sosaMap?.() || {}; const id = Object.keys(map).find(k => Number(map[k]) === Number(m[1])); if (id) q = `#${id}`; } catch (_) {}
        }
        return {kind, q, animals: c.opts.animals === 0 ? 0 : 1};
    }
    async function run(c, s, more = false) {
        const st = S(s), q = s.querySelector('.pk-input').value.trim();
        const my = ++st.seq;
        if (!more) { st.q = q; st.loading = true; spin(s, true); }
        const p = query(c, s, q);
        let d;
        try { d = await get({...p, offset: more ? st.next : 0, limit: 30}); } catch (err) { if (my === st.seq) { st.loading = false; spin(s, false); toast(err.message || 'Recherche impossible', 'error'); } return; }
        if (my !== st.seq) return;
        st.loading = false; spin(s, false);
        st.kind = p.kind;
        if (more) {
            (d.groups || []).forEach(g => { const old = st.groups.find(x => x.key === g.key); if (old) { old.items.push(...g.items); if (g.total != null) old.total = g.total; } else st.groups.push(g); });
        } else {
            st.groups = d.groups || []; st.active = 0;
            if (c.opts.kind.includes(',') && st.filter === 'all') st.counts = Object.fromEntries(st.groups.map(g => [g.kind, g.total || 0]));
        }
        st.more = !!d.more; st.next = d.next_offset || 0;
        renderList(c, s, more);
    }
    function spin(s, on) { const box = s.querySelector('.pk-box'); let sp = box.querySelector('.pk-spin'); if (on && !sp) { sp = document.createElement('span'); sp.className = 'pk-spin'; box.appendChild(sp); } else if (!on && sp) sp.remove(); }
    function maybeMore(c, s) {
        const st = S(s), sc = s.querySelector('.pk-scroll');
        if (!sc || s.querySelector('.pk-list').hidden || !st.more || st.loading || st.filter === 'all' && c.opts.kind.includes(',')) return;
        if (sc.scrollTop + sc.clientHeight > sc.scrollHeight - 90) { st.loading = true; run(c, s, true); }
    }
    function closeList(s) { if (!s) return; S(s).seq++; clearTimeout(S(s).timer); const l = s.querySelector('.pk-list'); if (l) l.hidden = true; s.querySelector('.pk-kbd')?.setAttribute('hidden', ''); s.querySelector('.pk-input')?.setAttribute('aria-expanded', 'false'); }

    /** Lignes « actions » du bas : créer, garder le texte, carte. */
    function actions(c, s, q) {
        const kinds = c.opts.kind.split(','), st = S(s), kind = c.opts.kind.includes(',') && st.filter !== 'all' ? st.filter : kinds[0];
        const out = [], mixed = kinds.length > 1 && st.filter === 'all';
        if (!q) return out;
        const canCreate = c.opts.allowCreate === true || (c.opts.allowCreate === 'auto' && (kind === 'person' || kind === 'place'));
        if (canCreate && !mixed) {
            const text = kind === 'person' ? q.charAt(0).toUpperCase() + q.slice(1) : q;
            out.push({act: 'create', kind, text, html: `＋ ${esc(K[kind]?.create || 'Créer')} « ${esc(text)} »`});
        }
        if (c.opts.allowFree) out.push({act: 'free', kind, text: q, muted: true, html: `✎ Garder le texte « ${esc(q)} » sans fiche`});
        if (kind === 'place' && !mixed) out.push({act: 'map', kind, text: q, muted: true, html: '🗺 Choisir sur la carte'});
        return out;
    }
    function headText(c, s) {
        const st = S(s), kind = st.kind.includes(',') ? '' : st.kind;
        if (kind === 'place') {
            const g = Object.fromEntries(st.groups.map(x => [x.key, x])), parts = [];
            if (g.base?.total) parts.push(`${plural(g.base.total, 'lieu', 'lieux')} de ta base`);
            if (g.fr?.total) parts.push(plural(g.fr.total, 'commune') + ' de France');
            if (g.world?.total) parts.push(g.world.total >= 300 ? '300 villes du monde et plus' : plural(g.world.total, 'ville') + ' du monde');
            return parts.join(' · ');
        }
        const k = K[kind] || K.person, n = st.groups.reduce((a, g) => a + (g.total || 0), 0);
        return `${plural(n, k.one, k.many)} ${k.fem ? (n > 1 ? 'trouvées' : 'trouvée') : (n > 1 ? 'trouvés' : 'trouvé')}`;
    }
    function renderList(c, s, keepScroll) {
        const st = S(s), list = s.querySelector('.pk-list'), q = st.q, mixedField = c.opts.kind.includes(',');
        const sc0 = list.querySelector('.pk-scroll')?.scrollTop || 0;
        const flat = []; st.groups.forEach(g => g.items.forEach(it => flat.push(it)));
        const acts = actions(c, s, q);
        st.flat = [...flat.map(it => ({item: it})), ...acts];
        if (st.active >= st.flat.length) st.active = Math.max(0, st.flat.length - 1);
        let idx = 0, body = '';
        const showGroups = st.kind === 'place' || st.kind.includes(',');
        st.groups.forEach(g => {
            if (!g.items.length) return;
            if (showGroups) body += `<div class="pk-grp${g.key === 'fr' || g.key === 'world' ? ' gray' : ''}">${esc(g.label)}</div>`;
            g.items.forEach(it => { body += rowHtml(it, q, idx, idx === st.active); idx++; });
        });
        const total = st.groups.reduce((a, g) => a + (g.total || 0), 0);
        if (st.more && !(mixedField && st.filter === 'all')) {
            const left = total - flat.length;
            body += `<div class="pk-hint">${left > 0 ? `… ${plural(left, st.kind === 'place' ? 'autre' : 'autre')} : la liste défile` : '… la liste défile'}</div>`;
        }
        if (mixedField && flat.length) body += '<div class="pk-hint">↹ Tab passe d’un filtre à l’autre</div>';
        let head = '';
        if (mixedField) {
            const counts = st.counts || {}, all = Object.values(counts).reduce((a, b) => a + b, 0);
            head = `<div class="pk-filt" role="tablist"><button type="button" data-filter="all" class="${st.filter === 'all' ? 'on' : ''}" tabindex="-1" data-ia-done="1">Tout (${all})</button>${c.opts.kind.split(',').filter(k => K[k] && (counts[k] || st.filter === k)).map(k => `<button type="button" data-filter="${k}" class="${st.filter === k ? 'on' : ''}" tabindex="-1" data-ia-done="1"${counts[k] ? '' : ' disabled'}>${esc(K[k].label)} (${counts[k] || 0})</button>`).join('')}</div>`;
        } else if (flat.length) {
            head = `<div class="pk-head"><span>${esc(headText(c, s))}</span><span>↑ ↓ Entrée</span></div>`;
        }
        const kindNow = st.kind.includes(',') ? '' : st.kind;
        const empty = !flat.length ? `<div class="pk-empty">${esc(kindNow ? K[kindNow]?.none || 'Rien' : 'Rien')} pour « ${esc(q)} ». Vérifie l’orthographe${acts.length ? ', ou :' : '.'}</div>` : '';
        let ai = flat.length;
        const foot = acts.length ? `<div class="pk-foot">${acts.map(a => { const h = `<div class="pk-act pk-row${a.muted ? ' muted' : ''}${ai === st.active ? ' on' : ''}" role="option" data-row="${ai}">${a.html}</div>`; ai++; return h; }).join('')}</div>` : '';
        list.innerHTML = head + (flat.length ? `<div class="pk-scroll">${body}</div>` : empty) + foot;
        list.hidden = !(flat.length || acts.length || q);
        s.querySelector('.pk-kbd')?.toggleAttribute('hidden', list.hidden);
        s.querySelector('.pk-input')?.setAttribute('aria-expanded', list.hidden ? 'false' : 'true');
        if (keepScroll) { const sc = list.querySelector('.pk-scroll'); if (sc) sc.scrollTop = sc0; }
        // liste courte qui ne défile pas encore : on charge la suite tout de suite
        requestAnimationFrame(() => maybeMore(c, s));
    }
    function setActive(s, i) {
        const st = S(s), n = st.flat.length; if (!n) return;
        st.active = (i + n) % n;
        s.querySelectorAll('.pk-row').forEach(x => { const on = Number(x.dataset.row) === st.active; x.classList.toggle('on', on); x.setAttribute('aria-selected', on ? 'true' : 'false'); if (on) x.scrollIntoView({block: 'nearest'}); });
    }

    function onKey(c, e) {
        if (e.target.closest('.pk-rolemenu')) return roleKey(c, e);
        const s = e.target.closest('.pk-search'); if (!s || !e.target.matches('.pk-input')) return;
        const st = S(s), list = s.querySelector('.pk-list'), open = !list.hidden;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!open) { if (st.flat.length) { list.hidden = false; s.querySelector('.pk-kbd')?.removeAttribute('hidden'); } else run(c, s); return; }
            setActive(s, st.active + (e.key === 'ArrowDown' ? 1 : -1));
            if (e.key === 'ArrowDown' && st.active >= st.flat.length - 4) maybeMore(c, s);
        } else if (e.key === 'Enter') {
            if (!open || !st.flat.length) { if (open || e.target.value.trim()) e.preventDefault(); return; }
            e.preventDefault(); choose(c, s, st.flat[st.active]);
        } else if (e.key === 'Escape') {
            if (open) { e.preventDefault(); e.stopPropagation(); closeList(s); }
        } else if (e.key === 'Tab' && open && c.opts.kind.includes(',')) {
            const keys = ['all', ...c.opts.kind.split(',').filter(k => K[k] && (st.counts?.[k] || 0) > 0)];
            const i = keys.indexOf(st.filter); e.preventDefault();
            setFilter(c, s, keys[(i + (e.shiftKey ? -1 : 1) + keys.length) % keys.length]);
        } else if (e.key === 'Backspace' && !e.target.value && c.opts.multiple && c.items.length && s.dataset.target === 'add') {
            c.items.pop(); renderChosen(c); emit(c);
        }
    }
    function setFilter(c, s, f) { const st = S(s); st.filter = f; st.active = 0; run(c, s); }

    async function choose(c, s, row) {
        if (!row) return;
        const target = s.dataset.target, inp = s.querySelector('.pk-input');
        if (row.act === 'free') return pick(c, s, {kind: row.kind, id: null, title: row.text, free: true});
        if (row.act === 'create') return createAct(c, s, row);
        if (row.act === 'map') return mapAct(c, s, row.text, null);
        let it = {...row.item};
        // ville du monde : elle entre dans ta base au moment où on la choisit
        if (it.kind === 'place' && !it.id && it.ref) {
            try { spin(s, true); const r = await post('picker_place_adopt', {geoname_id: it.ref}); it = {...it, ...(r.item || {}), id: Number(r.id), group: 'base'}; delete it.ref; }
            catch (err) { toast(err.message || 'Lieu impossible à ajouter', 'error'); return; } finally { spin(s, false); }
        }
        pick(c, s, it);
        if (inp && target !== 'set' && target !== 'main') inp.focus();
    }
    /** Place la chose choisie dans le champ (selon la case : seule, ajout, principale, principales, secondaires). */
    function pick(c, s, it) {
        if (!s) return;
        const target = s.dataset.target, inp = s.querySelector('.pk-input'), st = S(s);
        st.seq++; inp.value = ''; closeList(s);
        if (target === 'set') c.items = [it];
        else if (target === 'add') { if (!c.items.some(x => keyOf(x) === keyOf(it))) c.items.push(it); }
        else if (target === 'main') {
            const old = c.main;
            c.people = c.people.filter(p => keyOf(p) !== keyOf(it));
            if (old && keyOf(old) !== keyOf(it) && !c.people.some(p => keyOf(p) === keyOf(old))) c.people.unshift({...old, role: '', primary: true});
            c.main = it;
        } else {
            const primary = target === 'primary', i = c.people.findIndex(p => keyOf(p) === keyOf(it));
            if (c.main && keyOf(c.main) === keyOf(it)) { toast(`${it.title} est déjà la personne principale.`); return; }
            if (i >= 0) c.people[i].primary = primary; else c.people.push({...it, role: '', primary});
        }
        renderChosen(c); emit(c);
        if (target === 'set') c.el.querySelector('.pk-chosen .go, .pk-chosen .x')?.focus();
        if (target === 'main') c.el.querySelector('[data-pk=change-main]')?.focus();
    }
    function createAct(c, s, row) {
        const done = it => { const n = norm(it, row.kind); if (n) pick(c, s, n); };
        const ev = new CustomEvent('picker-create', {bubbles: true, cancelable: true, detail: {kind: row.kind, text: row.text, field: c.opts.name, target: s.dataset.target, pick: done}});
        c.el.dispatchEvent(ev);
        if (ev.defaultPrevented) { closeList(s); return; }
        closeList(s);
        if (row.kind === 'place') {
            // lieu tapé à la main : il entre dans ta base tel quel (on pourra le compléter dans Lieux)
            post('picker_place_adopt', {name: row.text}).then(r => done({...(r.item || {}), id: Number(r.id), kind: 'place', group: 'base', title: r.item?.title || row.text})).catch(err => toast(err.message, 'error'));
        } else if (row.kind === 'person') {
            createPerson(row.text, done);
        } else toast(`Crée-la d’abord dans l’outil, puis choisis-la ici.`);
    }
    /** Repli de « ＋ Créer la fiche » : la fenêtre « Nouvelle fiche » de l'app, préremplie ; la fiche enregistrée est choisie. */
    async function createPerson(text, done) {
        const dlg = document.getElementById('person-dialog'), form = document.getElementById('person-form');
        if (!dlg || !form) { toast('Crée d’abord la fiche dans Personnes, puis choisis-la ici.'); return; }
        const find = async () => { try { const d = await get({kind: 'person', q: text, limit: 100}); return (d.groups || []).flatMap(g => g.items); } catch (_) { return []; } };
        const before = new Set((await find()).map(x => x.id));
        const btn = document.getElementById('new-person');
        if (btn) btn.click();
        else for (const mod of [{ctrlKey: true}, {metaKey: true}]) { if (dlg.open) break; document.dispatchEvent(new KeyboardEvent('keydown', {key: 'N', code: 'KeyN', shiftKey: true, bubbles: true, cancelable: true, ...mod})); } // raccourci « Nouvelle personne »
        if (!dlg.open) { toast('Crée d’abord la fiche dans Personnes, puis choisis-la ici.'); return; }
        // « Pierre DURANDAL » → prénom Pierre, nom DURANDAL (le mot en capitales, sinon le dernier mot)
        const words = text.trim().split(/\s+/), up = words.filter(w => w.length > 1 && w === w.toUpperCase() && /\p{L}/u.test(w));
        const last = up.length ? up.join(' ') : words.length > 1 ? words[words.length - 1] : words[0];
        const first = up.length ? words.filter(w => !up.includes(w)).join(' ') : words.length > 1 ? words.slice(0, -1).join(' ') : '';
        if (form.elements.last_name) form.elements.last_name.value = last;
        if (form.elements.first_name) form.elements.first_name.value = first;
        dlg.addEventListener('close', () => setTimeout(async () => { const fresh = (await find()).filter(x => !before.has(x.id)); if (fresh.length === 1) done(fresh[0]); }, 700), {once: true});
    }
    function mapAct(c, s, text, item) {
        const ev = new CustomEvent('picker-map', {bubbles: true, cancelable: true, detail: {kind: 'place', text, item, field: c.opts.name, pick: it => { const n = norm(it, 'place'); if (n && s) pick(c, s, n); }}});
        c.el.dispatchEvent(ev);
        if (s) closeList(s);
        if (!ev.defaultPrevented) {
            const p = item || {};
            if (p.id && A().setModule && A().state) { try { A().state.mapPlaceId = p.id; } catch (_) {} toast(`Ouvre la Carte pour voir ${p.title || 'ce lieu'}.`); }
            else toast('La carte n’est pas disponible depuis ce champ.');
        }
    }
    /** « ↗ Fiche / Lieu / Ouvrir » : la fiche d'une personne s'ouvre ; pour le reste l'outil écoute picker-open. */
    function openItem(el, it) {
        if (!it || it.free) return;
        const ev = new CustomEvent('picker-open', {bubbles: true, cancelable: true, detail: {kind: it.kind, id: it.id, item: it}});
        el.dispatchEvent(ev);
        if (ev.defaultPrevented) return;
        const app = A(), close = () => el.closest('dialog[open]')?.close();
        if (isPerson(it) && app.openPersonById) { close(); app.openPersonById(it.id); return; }
        if (it.kind === 'investigation' && app.state && app.setModule) { close(); app.state.currentInvestigationId = it.id; app.state.enquetesTab = 'enquetes'; app.setModule('enquetes'); return; }
        if (it.kind === 'battue' && app.state && app.setModule) { close(); app.state.currentBattueId = it.id; app.state.enquetesTab = 'battues'; app.setModule('enquetes'); return; }
        if (it.kind === 'house' && window.LCNDA_EXT?.openHouse) { window.LCNDA_EXT.openHouse({id: it.id}); return; }
        toast(`« ${it.title} » : ouvre-le depuis son outil.`);
    }

    function onClick(c, e) {
        const f = e.target.closest('[data-filter]');
        if (f) { e.preventDefault(); const s = f.closest('.pk-search'); setFilter(c, s, f.dataset.filter); s.querySelector('.pk-input').focus(); return; }
        const r = e.target.closest('.pk-row');
        if (r) { const s = r.closest('.pk-search'); choose(c, s, S(s).flat[Number(r.dataset.row)]); return; }
        const rm = e.target.closest('.pk-rolemenu [data-role]');
        if (rm) { setRole(c, Number(rm.closest('.pk-rolemenu').dataset.i), rm.dataset.role); return; }
        const b = e.target.closest('[data-pk]'); if (!b) return;
        e.preventDefault();
        const i = Number(b.dataset.i), act = b.dataset.pk, o = c.opts;
        const list = o.roles ? c.people : c.items, it = list[i];
        if (act === 'remove') {
            list.splice(i, 1); renderChosen(c); emit(c);
            const s = o.roles ? b.closest('.pk-zone')?.querySelector('.pk-search') : c.el.querySelector('.pk-search');
            if (!o.roles && !o.multiple) { const s1 = c.el.querySelector('.pk-search'); s1.hidden = false; s1.querySelector('.pk-input').focus(); } else s?.querySelector('.pk-input')?.focus();
        } else if (act === 'open') openItem(c.el, it);
        else if (act === 'map') mapAct(c, null, it?.title || '', it);
        else if (act === 'open-main') openItem(c.el, c.main);
        else if (act === 'change-main') {
            // « Changer » : l'ancienne principale descend dans les principales, rien n'est perdu
            const old = c.main;
            if (old && !c.people.some(p => keyOf(p) === keyOf(old))) c.people.unshift({...old, role: '', primary: true});
            c.main = null; renderChosen(c); emit(c);
            c.el.querySelector('.pk-search[data-target=main] .pk-input')?.focus();
        } else if (act === 'toggle') { it.primary = !it.primary; renderChosen(c); emit(c); }
        else if (act === 'role') openRoleMenu(c, b, i);
    }

    // ── petit menu des rôles ──
    let roleMenu = null;
    function closeRoleMenu() { roleMenu?.remove(); roleMenu = null; }
    function openRoleMenu(c, btn, i) {
        if (roleMenu && roleMenu.dataset.i === String(i)) { closeRoleMenu(); return; }
        closeRoleMenu();
        const p = c.people[i]; if (!p) return;
        const m = document.createElement('div'); m.className = 'pk-rolemenu'; m.dataset.i = String(i); m.setAttribute('role', 'menu');
        m.innerHTML = c.opts.roles.roleList.map(r => `<button type="button" data-role="${esc(r)}" data-ia-done="1" class="${p.role === r ? 'on' : ''}">${esc(r)}</button>`).join('')
            + `<input type="text" placeholder="Autre mot… (Entrée)" value="${esc(c.opts.roles.roleList.includes(p.role) ? '' : p.role || '')}" aria-label="Rôle libre">`
            + (p.role ? '<button type="button" class="clear" data-role="" data-ia-done="1">Retirer le rôle</button>' : '');
        c.el.appendChild(m); roleMenu = m;
        const fr = c.el.getBoundingClientRect(), br = btn.getBoundingClientRect();
        m.style.top = `${br.bottom - fr.top + 4}px`;
        m.style.left = `${Math.max(0, Math.min(br.left - fr.left, fr.width - m.offsetWidth))}px`;
        (m.querySelector('button.on') || m.querySelector('button'))?.focus();
        setTimeout(() => document.addEventListener('mousedown', function out(ev) { if (roleMenu && roleMenu.contains(ev.target)) return; closeRoleMenu(); document.removeEventListener('mousedown', out, true); }, true), 0);
    }
    function setRole(c, i, role) { if (c.people[i]) { c.people[i].role = String(role || '').trim().slice(0, 60); } closeRoleMenu(); renderChosen(c); emit(c); c.el.querySelector(`.pk-chip2[data-i="${i}"] .role`)?.focus(); }
    function roleKey(c, e) {
        const m = roleMenu; if (!m) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const i = m.dataset.i; closeRoleMenu(); c.el.querySelector(`.pk-chip2[data-i="${i}"] .role`)?.focus(); }
        else if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); setRole(c, Number(m.dataset.i), e.target.value); }
        else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target.matches('button')) { e.preventDefault(); const bs = [...m.querySelectorAll('button')], j = bs.indexOf(e.target); bs[(j + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus(); }
    }

    // ── glisser une pastille d'une zone à l'autre ──
    function dragBind(c) {
        if (!c.opts.roles) return;
        let from = -1;
        c.el.addEventListener('dragstart', e => { const ch = e.target.closest?.('.pk-chip2'); if (!ch) return; from = Number(ch.dataset.i); ch.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(from)); } catch (_) {} });
        c.el.addEventListener('dragend', () => { from = -1; c.el.querySelectorAll('.dragging, .drop').forEach(x => x.classList.remove('dragging', 'drop')); });
        c.el.addEventListener('dragover', e => { const z = e.target.closest('.pk-zone'); if (!z || from < 0) return; e.preventDefault(); c.el.querySelectorAll('.pk-zone').forEach(x => x.classList.toggle('drop', x === z)); });
        c.el.addEventListener('drop', e => { const z = e.target.closest('.pk-zone'); if (!z || from < 0) return; e.preventDefault(); const p = c.people[from]; if (p) { p.primary = z.dataset.zone === 'primary'; renderChosen(c); emit(c); } from = -1; c.el.querySelectorAll('.drop').forEach(x => x.classList.remove('drop')); });
    }

    // ── API publique ──
    function pickerValue(fieldEl) {
        const el = fieldEl?.closest?.('.pk') || fieldEl; if (!el) return null;
        const c = CTRL.get(el) || bind(el), raw = el.querySelector(':scope > input[type=hidden]')?.value || '';
        if (c.opts.roles) { try { return JSON.parse(raw); } catch (_) { return {main: null, people: []}; } }
        if (c.opts.multiple) return raw ? raw.split(',').map(v => /^\d+$/.test(v) ? Number(v) : v) : [];
        return raw === '' ? null : /^\d+$/.test(raw) ? Number(raw) : raw;
    }
    /** Remplit le champ : un numéro, un objet {id,title,…}, « txt:… », une liste, ou {main, people} pour les rôles. Ne déclenche pas picker-change. */
    function pickerSet(fieldEl, value) {
        const el = fieldEl?.closest?.('.pk') || fieldEl; if (!el) return;
        const c = CTRL.get(el) || bind(el), fresh = makeCtrl(c.opts, value);
        c.items = fresh.items; c.main = fresh.main; c.people = fresh.people;
        renderChosen(c); loadMissing(c);
    }
    /** Lecture (fiche de l'enquête, acte…) : la principale en grand, puis principales (bleu) et secondaires (gris). */
    function pickerView(data = {}) {
        const main = norm(data.main, 'person'), people = (data.people || []).map(p => { const it = norm(p, 'person'); return it && {...it, role: p.role || '', primary: !!p.primary}; }).filter(Boolean);
        const all = [main, ...people].filter(Boolean), need = all.some(it => it._load);
        const chip = p => `<button type="button" class="pk-vchip${p.free ? ' free' : ''}" data-pkv="${p.free ? 'free' : 'open'}" data-id="${p.id || ''}" data-title="${esc(p.title)}" data-ia-done="1" title="${p.free ? 'Personne sans fiche : clic pour créer sa fiche' : 'Ouvrir la fiche'}">${sym(p)}${esc(p.title || `#${p.id}`)}${p.role ? ` <small>${esc(p.role)}</small>` : p.free ? ' <small>sans fiche</small>' : ''}</button>`;
        const prim = people.filter(p => p.primary), sec = people.filter(p => !p.primary);
        const sm = main ? sosaOf(main) : 0, sub = main ? [main.meta || main.short, sm ? `Sosa ${sm}` : ''].filter(Boolean).join(' · ') : '';
        return `<div class="pk-view"${need ? ` data-pk-view="${esc(JSON.stringify(data))}"` : ''}>`
            + (main ? `<div class="pk-view-main" data-pkv="${main.free ? 'free' : 'open'}" data-id="${main.id || ''}" data-title="${esc(main.title)}" role="button" tabindex="0">${sym(main).replace('class="pk-av', 'class="pk-av big')}<div><b>${esc(main.title || `#${main.id}`)}</b> <span class="pk-star">★ PRINCIPALE</span>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div></div>` : '')
            + (prim.length ? `<div class="pk-vrow"><span class="lbl">★ Principales</span><span class="pk-vchips">${prim.map(chip).join('')}</span></div>` : '')
            + (sec.length ? `<div class="pk-vrow sec"><span class="lbl">☆ Secondaires</span><span class="pk-vchips">${sec.map(chip).join('')}</span></div>` : '')
            + (!all.length ? '<div class="pk-vrow sec"><span class="lbl">Personne</span><small>Aucune personne choisie</small></div>' : '') + '</div>';
    }
    async function resolveView(v) {
        let data; try { data = JSON.parse(v.dataset.pkView); } catch (_) { return; }
        delete v.dataset.pkView;
        const ids = [data.main, ...(data.people || [])].map(x => typeof x === 'object' && x ? (!x.title && x.id ? x.id : 0) : /^\d+$/.test(String(x ?? '')) ? Number(x) : 0).filter(Boolean);
        if (!ids.length) return;
        try {
            const d = await get({kind: 'person', ids: ids.join(',')}), found = {};
            (d.groups || []).forEach(g => g.items.forEach(x => { found[x.id] = x; }));
            const fill = x => { const id = typeof x === 'object' && x ? Number(x.id) : Number(x); return found[id] ? {...found[id], ...(typeof x === 'object' && x ? {role: x.role, primary: x.primary} : {})} : x; };
            v.outerHTML = pickerView({main: fill(data.main), people: (data.people || []).map(fill)});
        } catch (_) {}
    }
    document.addEventListener('click', e => {
        const b = e.target.closest?.('.pk-view [data-pkv]'); if (!b) return;
        if (b.dataset.pkv === 'open') { openItem(b, {kind: 'person', id: Number(b.dataset.id), title: b.dataset.title}); return; }
        const text = b.dataset.title, ask = A().confirmBox ? A().confirmBox(`« ${text} » n’a pas encore de fiche. La créer ?`, {title: '＋ Créer sa fiche', okLabel: 'Créer la fiche'}) : Promise.resolve(confirm(`Créer la fiche de « ${text} » ?`));
        Promise.resolve(ask).then(ok => {
            if (!ok) return;
            const ev = new CustomEvent('picker-create', {bubbles: true, cancelable: true, detail: {kind: 'person', text, field: '', target: 'view', pick: () => {}}});
            b.dispatchEvent(ev);
            if (!ev.defaultPrevented) createPerson(text, () => {});
        });
    });
    document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.pk-view-main')) { e.preventDefault(); e.target.click(); } });

    /** Petite fenêtre « choisir… » pour un bouton. Résout l'item choisi (ou la liste si multiple), null si on ferme. */
    function openPicker(o = {}) {
        return new Promise(resolve => {
            const kind = String(o.kind || 'person'), k = K[kindOf(kind.split(',')[0])], mixed = kind.includes(',');
            const title = o.title || (mixed ? 'Choisir…' : kind === 'person' ? (o.multiple ? 'Choisir des personnes' : 'Choisir une personne') : kind === 'place' ? (o.multiple ? 'Choisir des lieux' : 'Choisir un lieu') : `Choisir : ${k.label.replace(/^\S+\s/, '').toLowerCase()}`);
            const d = document.createElement('dialog'); d.className = 'modal small-modal pk-dialog';
            d.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">${esc(o.eyebrow || 'CHOISIR')}</span><h2>${esc(title)}</h2></div><button class="icon-button" value="cancel" type="button" data-pk-close aria-label="Fermer" data-ia-done="1">×</button></div>
                <div class="pk-dialog-body">${o.label ? `<span class="pk-lab">${esc(o.label)}</span>` : ''}${pickerField({...o, name: o.name || 'pk_dialog', kind, value: o.value ?? null})}</div>
                <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-pk-close data-ia-done="1">Annuler</button>${o.multiple || o.roles ? `<button type="submit" class="button" data-ia-done="1">${esc(o.okLabel || 'Choisir')}</button>` : ''}</div></form>`;
            document.body.appendChild(d);
            const field = d.querySelector('.pk'), c = bind(field);
            let result = null, done = false;
            const finish = v => { if (done) return; done = true; result = v; d.close(); };
            d.addEventListener('close', () => { d.remove(); if (!done) { done = true; } resolve(result); });
            d.querySelectorAll('[data-pk-close]').forEach(b => b.addEventListener('click', () => finish(null)));
            d.querySelector('form').addEventListener('submit', e => { e.preventDefault(); finish(o.roles ? {main: c.main, people: c.people} : c.items.slice()); });
            if (!o.multiple && !o.roles) field.addEventListener('picker-change', e => { if (e.detail.item) finish(e.detail.item); });
            d.showModal();
            d.querySelector('.pk-search:not([hidden]) .pk-input')?.focus();
        });
    }

    // ── liaison automatique : tout champ data-picker ajouté à la page ──
    const scan = root => { if (root.matches?.('.pk[data-picker]')) bind(root); root.querySelectorAll?.('.pk[data-picker]').forEach(bind); if (root.matches?.('.pk-view[data-pk-view]')) resolveView(root); root.querySelectorAll?.('.pk-view[data-pk-view]').forEach(resolveView); };
    new MutationObserver(list => list.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) scan(n); }))).observe(document.documentElement, {childList: true, subtree: true});
    document.addEventListener('focusin', e => { const el = e.target.closest?.('.pk[data-picker]'); if (el && !CTRL.has(el)) { bind(el); el.querySelector('.pk-search:not([hidden]) .pk-input') === e.target && onFocus(CTRL.get(el), e.target.closest('.pk-search')); } }, true);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scan(document)); else scan(document);

    const api = {pickerField, pickerView, pickerValue, pickerSet, openPicker, PICKER_KINDS: Object.keys(K), PICKER_ROLES: ROLES};
    window.LCNDA_PICKER = api;
    // aussi sur LCNDA_APP (créé par app.js, parfois après ce fichier)
    const expose = () => { const app = window.LCNDA_APP; if (!app) return false; Object.entries(api).forEach(([k, v]) => { if (!(k in app) || app[k] === v || String(k).startsWith('picker') || k === 'openPicker') app[k] = v; }); app.picker = api; return true; };
    if (!expose()) { let n = 0; const t = setInterval(() => { if (expose() || ++n > 200) clearInterval(t); }, 50); }
})();
