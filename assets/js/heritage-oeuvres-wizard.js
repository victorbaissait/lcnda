/* LCNDA — 🧩 « ✎ Créer un type d'œuvre » (maquette L de docs/design/profils-et-oeuvres.html) : un assistant en 5 étapes.
 *  1 · Nom et icône (pluriel, famille, partir de rien ou d'un type existant, fiches « parties » : un char a des éditions…)
 *  2 · Champs et groupes (24 sortes de champs ; bibliothèque : reprendre les champs des autres types ; réglages d'un champ :
 *      libellé, aide, valeur de départ, unité, choix, colonnes, calcul, obligatoire, affiché d'office, dans la recherche)
 *  3 · Liens possibles (vers quels types, et leur nom dans les deux sens)   4 · Liste et vignettes   5 · Aperçu
 * Enregistré par le moteur (api art_write : save_type → item_types, type_fields, type_links) ; il remplace la petite fenêtre
 * « ✎ Créer une sorte de fiche » de heritage-artist-panel.js (ART.newTypeDialog). Un type créé a les mêmes outils que les
 * autres : liste H10, ⚙️ champs affichés, export, catalogue, « Lié à ».
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART, OE = ART?.oeuvres; if (!OE) return;
    const A = () => window.LCNDA_APP;
    const U = ART.util, esc = U.esc, clone = U.clone;
    const SORTS = ['text', 'longtext', 'number', 'date', 'period', 'duration', 'dims', 'measure', 'money', 'list', 'tags', 'bool', 'rating', 'url', 'code', 'people', 'place', 'item', 'media', 'document', 'rows', 'color', 'note', 'computed'];
    const TILE = {people: '👤 Personne + rôle', rows: '📋 Tableau (lignes)', computed: '🧮 Calcul', item: '📎 Fiche liée', rating: '⭐ Note', number: '123 Nombre', date: '📅 Date (C4)', url: '🔗 Lien web', bool: '☐ Oui / non'};
    const tile = t => TILE[t] || ART.ft[t]?.tile || ART.ft[t]?.label || t;
    const short = t => tile(t).replace(/\s*\(.*\)$/, '');
    OE.WIZ_SORTS = SORTS;
    const ICONS = ['🎠', '🎭', '🎉', '🚜', '🎪', '🏵', '🪅', '🎈', '🌸', '🐉', '🛞', '🎊', '👑', '⭐', '🗿', '🏺', '📷', '🧵', '🪵', '⚒️', '🎻', '🏆', '💡', '🔭', '📰', '🧭', '🍷', '🧸', '🪆', '🏠', '⛵', '✦'];
    const CALC = [['count', 'Nombre de lignes d’un tableau'], ['sum', 'Somme d’une colonne d’un tableau'], ['dur', 'Durée totale d’une colonne (2:58…)'], ['children', 'Nombre de fiches « parties »'], ['years', 'Années depuis une date']];
    const fkey = (label, taken) => { let b = U.slug(label); if (!/^[a-z_]/.test(b)) b = `f_${b}`; b = b.slice(0, 34); let k = b, i = 2; while (taken.has(k) || ['title', 'date', 'photos', 'notes', '_linked'].includes(k) && taken.has(k)) k = `${b}_${i++}`; return k; };

    /* ═════════ 🧮 le champ « Calcul » et les types de l'utilisateur (filtres, obligatoires) ═════════ */
    const num = v => U.num(String(v ?? '').replace(/[^\d,.-]/g, ''));
    ART.views.o_calc = {
        read: (ctx, it, f) => esc(ART.views.o_calc.text(ctx, it, f)),
        text: (ctx, it, f) => { const c = f.calc || {}, d = it.data || {}, rows = Array.isArray(d[c.field]) ? d[c.field] : [];
            if (c.op === 'count') return rows.length ? U.plural(rows.length, f.unit || 'ligne') : '';
            if (c.op === 'sum') { const s = rows.reduce((a, r) => a + (num(r[c.col]) || 0), 0); return s ? `${s.toLocaleString('fr-FR')}${f.unit ? ` ${f.unit}` : ''}` : ''; }
            if (c.op === 'dur') { const s = rows.reduce((a, r) => a + U.secs(r[c.col]), 0); return s ? U.hms(s) : ''; }
            if (c.op === 'children') { const l = OE.childrenOf(ctx.store, it, c.child || '', 'parent'); return l.length ? U.plural(l.length, f.unit || 'partie') : ''; }
            if (c.op === 'years') { const y = Number(U.yearOf(d[c.field] || '')); return y ? U.plural(new Date().getFullYear() - y, 'an') : ''; }
            return ''; },
    };
    /** un type de l'utilisateur, chargé de la base : ses filtres (« Dans la recherche ») et sa petite ligne */
    const decorate = d => { if (!d?.userType || d._oeDecorated) return; d._oeDecorated = true;
        const fs = ART.fieldsOf(d), filt = fs.filter(f => f.filterable);
        d.filters = store => { const list = store.of(d.key), out = [];
            filt.forEach(f => {
                if ((f.type === 'list' || f.type === 'select') && (f.choices || []).length) { const has = k => list.filter(it => (Array.isArray(it.data[f.key]) ? it.data[f.key] : [it.data[f.key]]).map(String).includes(String(k))).length;
                    out.push({id: `u_${f.key}`, label: f.label, group: f.label, type: 'check', options: (f.choices || []).map(c => Array.isArray(c) ? c : [c, c]).filter(([k]) => has(k)).map(([k, l]) => [k, `${l} (${has(k)})`]), test: (it, v) => !v?.length || v.some(x => (Array.isArray(it.data[f.key]) ? it.data[f.key] : [it.data[f.key]]).map(String).includes(String(x)))}); }
                else if (f.type === 'place') out.push({id: `u_${f.key}`, label: f.label, type: 'place', chipPrefix: f.label, test: (it, v) => !v || (typeof v === 'object' ? U.place(it.data[f.key])?.plid === Number(v.id) : U.placeTitle(it.data[f.key]).toLowerCase().includes(String(v).replace(/^txt:/, '').toLowerCase()))});
                else if (f.type === 'bool') out.push({id: `u_${f.key}`, label: f.label, group: 'Autres', type: 'check', test: (it, v) => !v || !!it.data[f.key]});
                else out.push({id: `u_${f.key}`, label: f.label, group: f.label, type: 'text', placeholder: '…', test: (it, v) => { if (!v) return true; let t = ''; try { t = ART.text(ART.ctx(store, it), it, f); } catch (_) {} return OE.norm(t).includes(OE.norm(v)); }});
            });
            out.push({id: 'from', label: 'De', group: 'Période', type: 'text', placeholder: '1900', test: (it, v) => !v || (Number(it.year) || 0) >= Number(v)}, {id: 'to', label: 'À', group: 'Période', type: 'text', placeholder: '1950', test: (it, v) => !v || (Number(it.year) || 9999) <= Number(v)});
            return out; };
        if (!d.eyebrow) d.eyebrow = () => [d.label, OE.fam(d.family || 'mine').label].filter(Boolean).join(' · ');
        if (d.partOf) OE.childPreset[d.key] = (p, n) => ({title: `${p.title} — ${String(d.label).toLowerCase()} ${n + 1}`});
    };
    const loadTypes0 = ART.loadTypes;
    ART.loadTypes = types => { loadTypes0(types); (types || []).forEach(t => decorate(ART.defs[t.key])); };
    // « Obligatoire » : on ne peut pas enregistrer une fiche d'un type à soi sans ses champs obligatoires
    const missing = C => { const def = ART.defs[C?.S?.kind]; if (!C?.S?.edit || !def?.userType) return [];
        const req = ART.fieldsOf(def, C.store.customFields?.(def.key) || []).filter(f => f.required && f.key !== 'title'); if (!req.length) return [];
        let d = {}; try { d = ART.collect(C.body, C.store, C.current(), clone(C.S.draft || {})); } catch (_) { return []; }
        return req.filter(f => ART.isEmpty(f, d[f.key])); };
    const guard = (e, C) => { const m = missing(C); if (!m.length) return; e.preventDefault(); e.stopImmediatePropagation(); A().toast(`À remplir avant d’enregistrer : ${m.map(f => f.label).join(', ')}.`, 'error'); C.body.querySelector(`[data-fk="${CSS.escape(m[0].key)}"] input, [data-fk="${CSS.escape(m[0].key)}"] textarea`)?.focus(); };
    document.addEventListener('click', e => { const b = e.target.closest('.ar-dlg [data-ar-cmd="save"]'); if (b) guard(e, b.closest('.ar-dlg')._C); }, true);
    document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { const dl = document.querySelector('dialog.ar-dlg[open]'); if (dl?._C && !document.querySelector('.ar-dlg ~ dialog[open]')) guard(e, dl._C); } }, true);

    /* ═════════ L'assistant ═════════ */
    const STEPS = ['Nom et icône', 'Champs et groupes', 'Liens possibles', 'Liste et vignettes', 'Aperçu'];
    const baseGroups = () => [{key: 'main', label: 'L’œuvre', zone: 'main', fields: [{key: 'title', label: 'Titre', type: 'text', star: true, required: true, base: true, inList: true}, {key: 'date', label: 'Date', type: 'date', star: true, base: true, inList: true, inCard: true}]},
        {key: 'photos', label: 'Photos et films', zone: 'left', fields: [{key: 'photos', label: 'Photos et films', type: 'photos', star: true, base: true, inList: true}]}];
    /** les champs de tous les autres types (bibliothèque) */
    const library = () => Object.values(ART.defs).filter(d => !d.hidden && d.key !== 'profile' && !d.key.startsWith('profile') && d.key !== '_oe_preview')
        .flatMap(d => ART.fieldsOf(d).filter(f => !['title', 'date', 'photos', 'notes', '_linked'].includes(f.key) && f.type !== 'computed' && SORTS.concat(['person', 'select', 'ident', 'items', 'employer', 'periodical', 'source']).includes(f.type)).map(f => ({d, f})));
    /** le type enregistré → l'état de l'assistant */
    function fromDef(def) {
        const groups = (def.groups || []).filter(g => !['_linked', '_mine', 'notes', 'links_oe', 'parts_oe'].includes(g.key)).map(g => ({key: g.key, label: g.label, zone: g.zone || 'main', fields: (g.fields || []).map(f => ({...clone(f), type: f.type === 'person' ? 'people' : f.type, base: ['title', 'date', 'photos'].includes(f.key)}))}));
        const linksG = (def.groups || []).find(g => g.key === 'links_oe');
        return {key: def.key, label: def.label, many: def.many, icon: def.icon, family: def.family || 'mine', from: '', parts: {on: !!def.partKind, label: ART.defs[def.partKind]?.label || '', many: ART.defs[def.partKind]?.many || '', key: def.partKind || '', groups: (ART.defs[def.partKind]?.groups || []).filter(g => !['main', '_linked', '_mine', 'notes'].includes(g.key)).map(g => ({...clone(g), part: true}))},
            groups: [...groups, ...((ART.defs[def.partKind]?.groups || []).filter(g => !['main', '_linked', '_mine', 'notes'].includes(g.key)).map(g => ({...clone(g), part: true})))],
            links: (linksG?.fields || []).map(f => ({to: (f.kinds || [])[0], name: f.label, back: f.back || '', key: f.key})), list: def.list || ['title', 'date'], card: def.card || ['date'], export: def.export || []};
    }
    ART.newTypeDialog = (C, {key = ''} = {}) => {
        const cur = key ? ART.defs[key] : null;
        const W = cur ? fromDef(cur) : {key: '', label: '', many: '', icon: '🎠', family: 'mine', from: '', parts: {on: false, label: '', many: ''}, groups: baseGroups(), links: [], list: ['photos', 'title', 'date'], card: ['date'], export: []};
        let step = 0, sel = null, gsel = 'main', libq = '', dirty = false;
        const openFams = new Set();
        const dlg = document.createElement('dialog'); dlg.className = 'modal oe-dlg oe-wiz'; dlg.dataset.ownClose = '1'; dlg.dataset.dndOff = ''; dlg.dataset.ordOff = '';
        document.body.appendChild(dlg);
        const allFields = () => W.groups.flatMap(g => g.fields.map(f => ({...f, g})));
        const findF = k => { for (const g of W.groups) { const i = g.fields.findIndex(f => f.key === k); if (i >= 0) return {g, i, f: g.fields[i]}; } return null; };
        const taken = () => new Set(allFields().map(f => f.key));
        const changed = () => { dirty = true; };
        const close = async (force = false) => { if (!force && dirty && !await A().confirmBox('Ce que tu as préparé pour ce type sera perdu.', {title: 'Quitter sans enregistrer le type ?', okLabel: 'Quitter', danger: true})) return; dlg.close(); dlg.remove(); };
        dlg.addEventListener('cancel', e => { e.preventDefault(); if (document.querySelector('.oe-wiz ~ dialog[open]')) return; if (sel && step === 1) { sel = null; return paint(); } close(); });
        const addField = (type, o = {}, want = '') => { const g = W.groups.find(x => x.key === gsel) || W.groups[0]; const {key: _k, ...rest} = o; const label = rest.label || short(type).replace(/^\S+\s/, ''); const f = {star: true, ...rest, key: fkey(want || label, taken()), label, type};
            if (type === 'list' && !f.choices) f.choices = ['Premier choix', 'Deuxième choix'];
            if (type === 'rows' && !f.cols) f.cols = [{key: 'quoi', label: 'Quoi'}, {key: 'date', label: 'Date', w: 's'}];
            if (type === 'computed' && !f.calc) f.calc = {op: 'count'};
            if (type === 'item' && !f.kinds) f.kinds = [];
            g.fields.push(f); sel = f.key; changed(); return f; };

        /* — étape 1 — */
        const step1 = () => `<div class="oe-w1"><label class="oe-fld">Nom du type<input data-w="label" maxlength="80" value="${esc(W.label)}" placeholder="Char de carnaval, Sabot sculpté…" required></label>
            <label class="oe-fld">Au pluriel<input data-w="many" maxlength="80" value="${esc(W.many)}" placeholder="${esc(W.label ? `${W.label}s` : 'Chars de carnaval')}"></label>
            <div class="oe-fld"><span>Icône</span><div class="oe-icg">${ICONS.map(i => `<button type="button" class="${W.icon === i ? 'on' : ''}" data-w-icon="${i}">${i}</button>`).join('')}<input data-w="icon" maxlength="4" value="${ICONS.includes(W.icon) ? '' : esc(W.icon)}" placeholder="＋" title="Une autre icône (colle un emoji)" aria-label="Une autre icône"></div></div>
            <label class="oe-fld">Famille<select data-w="family">${OE.FAMILIES.map(f => `<option value="${f.key}" ${W.family === f.key ? 'selected' : ''}>${esc(f.icon)} ${esc(f.label)}</option>`).join('')}</select></label>
            ${cur ? '' : `<div class="oe-fld"><span>Partir de…</span><label class="checkbox-line"><input type="radio" name="oe-from" value="" ${W.from ? '' : 'checked'}> Rien (titre, date, photos)</label><label class="checkbox-line"><input type="radio" name="oe-from" value="x" ${W.from ? 'checked' : ''}> Un type existant :
                <select data-w="from">${['', ...Object.keys(ART.defs)].filter(k => !k || (!ART.defs[k].hidden && k !== 'profile' && !k.startsWith('profile') && k !== '_oe_preview')).map(k => `<option value="${esc(k)}" ${W.from === k ? 'selected' : ''}>${k ? `${esc(ART.defs[k].icon)} ${esc(ART.defs[k].label)}` : '— choisir —'}</option>`).join('')}</select></label></div>`}
            <div class="oe-fld"><span>Fiches « parties »</span><label class="checkbox-line"><input type="checkbox" data-w-parts ${W.parts.on ? 'checked' : ''}> Ce type a des fiches « parties » <small class="ar-g">— comme les fontes d’une sculpture, les mises en scène d’une pièce</small></label>
                <div class="oe-parts" ${W.parts.on ? '' : 'hidden'}><label class="oe-fld">Une partie s’appelle<input data-wp="label" maxlength="60" value="${esc(W.parts.label)}" placeholder="Édition (une par année de défilé)"></label><label class="oe-fld">Au pluriel<input data-wp="many" maxlength="60" value="${esc(W.parts.many)}" placeholder="Éditions"></label></div></div>
            <p class="ar-note">Ce type est rangé avec les autres : liste avec la barre de recherche et les filtres, ⚙️ champs affichés, export, catalogue, « Lié à ». <b>📤 Exporter le type</b> (⚙️ Gérer les types) pour le donner à un cousin.</p></div>`;
        /* — étape 2 — */
        const defTxt = f => [f.type === 'list' ? (f.choices || []).slice(0, 3).join(' · ') + ((f.choices || []).length > 3 ? '…' : '') : '', f.unit ? `unité : ${f.unit}` : '', f.type === 'rows' ? (f.cols || []).map(c => c.label).join(', ') : '', f.type === 'computed' ? OE.lab(CALC, f.calc?.op) : '', f.type === 'item' ? ((f.kinds || []).map(k => ART.defs[k]?.label).filter(Boolean).join(', ') || 'toutes les fiches') : '', f.star ? '' : 'masqué à la lecture', f.help ? `« ${f.help} »` : ''].filter(Boolean).join(' · ');
        const srcTxt = f => f.base ? 'base' : f.source ? `↙ ${ART.defs[String(f.source).split('.')[0]]?.label || f.source}` : '';
        const step2 = () => `<div class="oe-wiz3"><div class="oe-wgroups">${W.groups.map((g, gi) => { if (g.part && !W.parts.on) return '';
                return `<div class="oe-gbox ${gsel === g.key ? 'is-sel' : ''} ${g.part ? 'is-part' : ''}" data-g="${esc(g.key)}"><div class="oe-gh"><button type="button" class="ar-linkbtn" data-w-gsel>▾ ${esc(g.label)}${g.part ? ` <small>(une ${esc(W.parts.label || 'partie')})</small>` : ''}</button><span class="spacer"></span>
                    ${W.parts.on && !['main', 'photos'].includes(g.key) ? `<label class="checkbox-line oe-gpart" title="Ces champs sont ceux de chaque partie"><input type="checkbox" data-w-gpart ${g.part ? 'checked' : ''}> pour chaque partie</label>` : ''}
                    <button type="button" class="icon-button small" data-w-gmv="-1" ${gi ? '' : 'disabled'} title="Monter le groupe">↑</button><button type="button" class="icon-button small" data-w-gmv="1" ${gi < W.groups.length - 1 ? '' : 'disabled'} title="Descendre le groupe">↓</button><button type="button" class="icon-button small" data-w-gren title="Renommer le groupe">✎</button>${['main', 'photos'].includes(g.key) ? '' : '<button type="button" class="icon-button small" data-w-gdel title="Retirer le groupe (ses champs vont dans le premier)">✕</button>'}</div>
                    ${g.fields.map(f => `<div class="oe-cf ${sel === f.key ? 'sel' : ''} ${f.star ? '' : 'off'}" data-f="${esc(f.key)}" draggable="true"><span class="ar-grip" title="Glisser pour ranger">⠿</span><button type="button" class="oe-eye" data-w-eye title="${f.star ? 'Masquer à la lecture' : 'Afficher'}">${f.star ? '👁' : '🚫'}</button>
                        <button type="button" class="oe-cfl" data-w-sel><b>${esc(f.label)}</b>${f.required ? ' <small class="ar-g">obligatoire</small>' : ''}</button><span class="oe-ty">${esc(short(f.type))}</span><span class="oe-src">${esc(srcTxt(f))}</span><span class="oe-def">${esc(defTxt(f))}</span></div>`).join('') || '<p class="muted">Aucun champ : choisis une sorte à droite.</p>'}</div>`; }).join('')}
                <div class="ar-row"><button type="button" class="button small secondary" data-w-addf>＋ Ajouter un champ</button><button type="button" class="button small secondary" data-w-addg>＋ Ajouter un groupe</button><button type="button" class="button small secondary" data-w-lib>↙ Reprendre d’un autre type…</button></div>
                ${sel ? settingsHtml(findF(sel)?.f) : ''}</div>
            <aside class="oe-pan"><div class="oe-ph"><b>＋ Champs à ajouter</b></div><div class="oe-pb"><b class="oe-sm">Champ perso — choisis sa sorte</b> <small class="ar-g">(dans « ${esc(W.groups.find(g => g.key === gsel)?.label || '')} »)</small>
                <div class="oe-tys">${SORTS.map(t => `<button type="button" data-w-add="${t}">${esc(tile(t))}</button>`).join('')}</div></div>
                <div class="oe-pb"><b class="oe-sm">Bibliothèque : champs des autres types</b><input type="search" data-w-libq placeholder="Chercher un champ…" value="${esc(libq)}" aria-label="Chercher un champ"><div class="oe-lib" data-w-libl>${libHtml()}</div>
                <p class="ar-note">Un champ repris garde sa forme et son nom (tu peux le renommer) ; les fiches gardent leurs valeurs si tu le retires.</p></div></aside></div>`;
        const libHtml = () => { const have = new Set(allFields().map(f => f.source).filter(Boolean)), q = OE.norm(libq);
            const l = library().filter(({d, f}) => !q || OE.norm(`${f.label} ${d.label}`).includes(q));
            const seen = new Set(); const rows = l.filter(({d, f}) => { const k = `${d.key}.${f.key}`; if (seen.has(k)) return false; seen.add(k); return true; });
            return rows.slice(0, q ? 200 : 60).map(({d, f}) => `<label class="checkbox-line"><input type="checkbox" data-w-libf="${esc(`${d.key}.${f.key}`)}" ${have.has(`${d.key}.${f.key}`) ? 'checked' : ''}> ${esc(short(f.type === 'person' ? 'people' : f.type).split(' ')[0])} ${esc(f.label)} <small>${esc(d.icon)} ${esc(d.label)}</small></label>`).join('') + (rows.length > (q ? 200 : 60) ? `<p class="ar-note">… ${rows.length - (q ? 200 : 60)} de plus : précise ta recherche.</p>` : '') || '<p class="muted">Aucun champ.</p>'; };
        const tog = (k, on, label) => `<label class="ui-toggle"><input type="checkbox" data-ws-b="${k}" ${on ? 'checked' : ''}><i></i>${esc(label)}</label>`;
        function settingsHtml(f) { if (!f) return '';
            const kindsSel = `<select data-ws="kinds" class="ar-in"><option value="">Toutes les fiches</option>${Object.values(ART.defs).filter(d => !d.hidden && d.key !== 'profile' && !d.key.startsWith('profile') && d.key !== '_oe_preview').map(d => `<option value="${esc(d.key)}" ${(f.kinds || [])[0] === d.key ? 'selected' : ''}>${esc(d.icon)} ${esc(d.label)}</option>`).join('')}</select>`;
            const rowsF = W.groups.flatMap(g => g.fields).filter(x => x.type === 'rows');
            return `<div class="oe-pop" data-ws-for="${esc(f.key)}"><div class="oe-poph"><b>Réglages du champ « ${esc(f.label)} »</b><span class="spacer"></span><button type="button" class="icon-button small" data-w-unsel aria-label="Fermer les réglages">×</button></div>
                <div class="oe-popg"><label>Libellé<input class="ar-in" data-ws="label" maxlength="80" value="${esc(f.label)}"></label>
                <label>Sorte<select class="ar-in" data-ws="type" ${f.base ? 'disabled' : ''}>${[...SORTS, ...(SORTS.includes(f.type) ? [] : [f.type])].map(t => `<option value="${t}" ${f.type === t ? 'selected' : ''}>${esc(tile(t))}</option>`).join('')}</select></label>
                <label>Aide (bulle ?)<input class="ar-in" data-ws="help" maxlength="160" value="${esc(f.help || '')}" placeholder="« Mesures du char monté, sans les personnages »"></label>
                <label>Valeur de départ, exemple<input class="ar-in" data-ws="ph" maxlength="120" value="${esc(f.ph || '')}"></label>
                ${['measure', 'number', 'dims', 'money', 'computed'].includes(f.type) ? `<label>Unité<input class="ar-in" data-ws="unit" maxlength="20" value="${esc(f.unit || '')}" placeholder="m, kg, heures…"></label>` : ''}
                ${f.type === 'list' || f.type === 'select' ? `<label class="is-wide">Choix (un par ligne)<textarea class="ar-in" data-ws="choices" rows="4">${esc((f.choices || []).map(c => Array.isArray(c) ? c[1] : c).join('\n'))}</textarea></label>` : ''}
                ${f.type === 'rows' ? `<label class="is-wide">Colonnes (une par ligne : « Nom » ou « Nom : date / nombre / personne / lieu / montant / oui-non »)<textarea class="ar-in" data-ws="cols" rows="4">${esc((f.cols || []).map(c => `${c.label}${c.type && c.type !== 'text' ? ` : ${({person: 'personne', place: 'lieu', money: 'montant', bool: 'oui-non', number: 'nombre', date: 'date'})[c.type] || c.type}` : ''}`).join('\n'))}</textarea></label>` : ''}
                ${f.type === 'item' ? `<label>Vers quelles fiches${kindsSel}</label>` : ''}
                ${f.type === 'computed' ? `<label>Calcul<select class="ar-in" data-ws="calc_op">${CALC.map(([k, l]) => `<option value="${k}" ${f.calc?.op === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                    ${['count', 'sum', 'dur'].includes(f.calc?.op) ? `<label>Tableau<select class="ar-in" data-ws="calc_field"><option value="">—</option>${rowsF.map(x => `<option value="${esc(x.key)}" ${f.calc?.field === x.key ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>` : ''}
                    ${['sum', 'dur'].includes(f.calc?.op) ? `<label>Colonne<select class="ar-in" data-ws="calc_col"><option value="">—</option>${(rowsF.find(x => x.key === f.calc?.field)?.cols || []).map(c => `<option value="${esc(c.key)}" ${f.calc?.col === c.key ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></label>` : ''}
                    ${f.calc?.op === 'years' ? `<label>Date<select class="ar-in" data-ws="calc_field">${W.groups.flatMap(g => g.fields).filter(x => x.type === 'date').map(x => `<option value="${esc(x.key)}" ${f.calc?.field === x.key ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>` : ''}` : ''}</div>
                <div class="oe-popt"><span>Obligatoire</span>${tog('required', f.required, f.key === 'title' ? 'toujours (le titre)' : 'à remplir avant d’enregistrer')}<span>Affiché d’office</span><span class="oe-togs">${tog('star', f.star, 'fiche')}${tog('inList', f.inList || W.list.includes(f.key), 'liste')}${tog('inCard', f.inCard || W.card.includes(f.key), 'vignettes')}</span>
                    <span>Dans la recherche</span>${tog('filterable', f.filterable, `filtre « ${f.label} » dans Filtrer ▾`)}</div>
                ${f.base ? '' : '<div class="ar-row"><button type="button" class="button small secondary danger" data-w-fdel>🗑 Retirer ce champ</button></div>'}</div>`; }
        /* — étape 3 — */
        const step3 = () => { const types = Object.values(ART.defs).filter(d => !d.hidden && d.key !== 'profile' && !d.key.startsWith('profile') && d.key !== '_oe_preview' && d.key !== W.key);
            return `<div class="oe-w3"><p class="ar-phelp">Coche les types vers lesquels une fiche « ${esc(W.label || 'de ce type')} » peut pointer, et donne un nom au lien (dans les deux sens) : il s’affiche dans « 🔗 Lié à » des deux fiches.</p>
                <div class="oe-links">${OE.FAMILIES.map(fm => { const l = types.filter(d => (d.userType ? 'mine' : OE.famOf(d.key)) === fm.key); if (!l.length) return '';
                    return `<details data-fam="${fm.key}" ${openFams.has(fm.key) || l.some(d => W.links.some(x => x.to === d.key)) ? 'open' : ''}><summary>${esc(fm.icon)} ${esc(fm.label)} <small class="ar-g">${W.links.filter(x => l.some(d => d.key === x.to)).length || ''}</small></summary>${l.map(d => { const lk = W.links.find(x => x.to === d.key);
                        return `<div class="oe-lk ${lk ? 'on' : ''}" data-to="${esc(d.key)}"><label class="checkbox-line"><input type="checkbox" data-w-link ${lk ? 'checked' : ''}> ${esc(d.icon)} ${esc(d.label)}</label>${lk ? `<input class="ar-in" data-w-lname value="${esc(lk.name)}" placeholder="musique du char" aria-label="Nom du lien"><input class="ar-in" data-w-lback value="${esc(lk.back)}" placeholder="vu de l’autre côté : « joué sur le char »" aria-label="Nom du lien vu de l’autre fiche">` : ''}</div>`; }).join('')}</details>`; }).join('')}</div></div>`; };
        /* — étape 4 — */
        const listable = () => allFields().filter(f => !f.g.part && f.type !== 'rows' && f.type !== 'longtext' && f.type !== 'note');
        const step4 = () => { const fs = listable(), ord = [...W.list.filter(k => fs.some(f => f.key === k)), ...fs.map(f => f.key).filter(k => !W.list.includes(k))];
            return `<div class="oe-w4"><div><h4>☰ Les colonnes de la liste</h4><p class="ar-phelp">Coche, puis range avec ↑ ↓.</p><div class="ar-plist">${ord.map((k, i) => { const f = fs.find(x => x.key === k); return `<div class="ar-fr ${W.list.includes(k) ? '' : 'off'}" data-lk="${esc(k)}"><span></span><input type="checkbox" data-w-col ${W.list.includes(k) ? 'checked' : ''} aria-label="Colonne ${esc(f.label)}"><span class="lbl">${esc(f.label)}</span><span class="ty">${esc(short(f.type))}</span><span class="tools"><button type="button" data-w-cmv="-1" ${i ? '' : 'disabled'} title="Monter">↑</button><button type="button" data-w-cmv="1" ${i < ord.length - 1 ? '' : 'disabled'} title="Descendre">↓</button></span></div>`; }).join('')}</div></div>
                <div><h4>▦ Sous chaque vignette</h4><p class="ar-phelp">Les lignes grises (affichage « Fiches »).</p><div class="ar-plist">${fs.filter(f => f.type !== 'photos' && f.key !== 'title').map(f => `<label class="checkbox-line"><input type="checkbox" data-w-card="${esc(f.key)}" ${W.card.includes(f.key) ? 'checked' : ''}> ${esc(f.label)}</label>`).join('')}</div>
                <h4>⤓ Dans l’export et le livre</h4><div class="ar-plist">${allFields().filter(f => !f.g.part).map(f => `<label class="checkbox-line"><input type="checkbox" data-w-exp="${esc(f.key)}" ${!W.export.length || W.export.includes(f.key) ? 'checked' : ''}> ${esc(f.label)}</label>`).join('')}</div></div>
                <div><h4>Aperçu de la liste</h4><div class="ar-scroll"><table class="ar-t"><thead><tr>${W.list.map(k => `<th>${esc(fs.find(f => f.key === k)?.label || '')}</th>`).join('')}</tr></thead><tbody><tr>${W.list.map(k => `<td class="ar-g">${k === 'title' ? `<b>${esc(W.label || 'Sans titre')}</b>` : k === 'photos' ? '🖼' : '…'}</td>`).join('')}</tr></tbody></table></div>
                <div class="ar-grid oe-cardpv"><span class="ar-card"><span class="ar-cov is-empty">${esc(W.icon)}</span><b>${esc(W.label || 'Sans titre')}</b><small>${esc(W.card.map(k => fs.find(f => f.key === k)?.label).filter(Boolean).join(' · '))}</small></span></div></div></div>`; };
        /* — étape 5 — */
        const step5 = () => { let pv = '';
            try { const def = toDef(false, '_oe_preview'); ART.define({...def, key: '_oe_preview', hidden: true}); const sample = {id: 0, kind: '_oe_preview', title: W.label || 'Exemple', year: 1952, data: {title: W.label || 'Exemple', date: '1952'}};
                pv = ART.readHtml(C.store, sample); } catch (e) { pv = `<p class="muted">${esc(e.message)}</p>`; } finally { delete ART.defs._oe_preview; }
            const n = allFields().filter(f => !f.g.part).length, np = allFields().filter(f => f.g.part).length;
            return `<div class="oe-w5"><div class="ui-msg info oe-sum">ℹ️ <b>${esc(W.icon)} ${esc(W.label || '(sans nom)')}</b> · ${esc(OE.fam(W.family).label)} · ${esc(U.plural(n, 'champ'))}${W.parts.on ? ` · parties « ${esc(W.parts.label || 'partie')} » (${esc(U.plural(np, 'champ'))})` : ''} · ${esc(U.plural(W.links.length, 'lien'))}</div>
                <p class="ar-phelp">Voici une fiche vide de ce type, telle qu’elle s’affichera (les champs vides sont cachés à la lecture ; ici on montre leur place).</p><div class="oe-preview">${pv}</div></div>`; };

        const cleanF = f => { const o = {key: f.key, label: f.label, type: f.type, star: !!f.star}; if (f.key === 'title') o.head = true; ['help', 'ph', 'unit', 'source', 'back', 'calc', 'kinds'].forEach(k => { if (f[k] !== undefined && f[k] !== '') o[k] = clone(f[k]); });
                if (f.required) o.required = true; if (f.filterable) o.filterable = true; if (f.inList || W.list.includes(f.key)) o.inList = true; if (f.inCard || W.card.includes(f.key)) o.inCard = true; o.inExport = !W.export.length || W.export.includes(f.key);
                if (f.type === 'list' || f.type === 'select') o.choices = (f.choices || []).slice(0, 80); if (f.type === 'rows') { o.cols = (f.cols || []).slice(0, 12); o.addLabel = 'Une ligne'; }
                if (f.type === 'computed') o.view = 'o_calc'; if (f.type === 'people') o.addLabel = 'Une personne'; if (f.view && f.type !== 'computed') o.view = f.view; if (f.labels) o.labels = clone(f.labels); if (f.choices && !o.choices) o.choices = clone(f.choices);
                if (f.type === 'computed' && f.calc?.op === 'children') o.calc = {...f.calc, child: W.parts.key || ''}; return o; };
        /** l'état → la définition enregistrée par le moteur */
        function toDef(forSave = true, key = W.key) {
            const fam = OE.fam(W.family);
            const groups = W.groups.filter(g => !g.part || !W.parts.on).map(g => ({key: g.key, label: g.label, zone: g.zone || 'main', icon: g.icon || '', fields: g.fields.map(cleanF)}));
            if (W.links.length) groups.push({key: 'links_oe', label: 'Liens', icon: '🔗', zone: 'right', fields: W.links.map(l => ({key: l.key || fkey(`lien_${l.name || ART.defs[l.to]?.label || 'lien'}`, taken()), label: l.name || ART.defs[l.to]?.label || 'Lien', type: 'items', kinds: [l.to], back: l.back || '', star: true}))});
            if (W.parts.on && W.parts.key) groups.push({key: 'parts_oe', label: W.parts.many || 'Parties', zone: 'main', fields: [{key: '_parts', label: W.parts.many || 'Parties', type: 'computed', view: 'o_children', child: W.parts.key, childField: 'parent', unit: (W.parts.label || 'partie').toLowerCase(), add: `Ajouter « ${W.parts.label || 'partie'} »`, star: true, cols: [['title', 'Titre'], ['date', 'Date']]}]});
            groups.push({key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]});
            return {key, label: W.label.trim(), many: (W.many || `${W.label.trim()}s`).trim(), icon: W.icon || '✦', family: fam.key, domain: fam.domain, groups, list: W.list, card: W.card, export: W.export.length ? W.export : undefined, partKind: W.parts.on ? (W.parts.key || '') : '', userType: !forSave || undefined};
        }
        let saving = null; // un seul enregistrement à la fois : ⌘S ou double clic ne créent pas deux types
        function save() { if (!saving) saving = save1().finally(() => { saving = null; }); return saving; }
        async function save1() {
            if (!W.label.trim()) { step = 0; paint(); A().toast('Donne un nom au type.', 'error'); dlg.querySelector('[data-w="label"]')?.focus(); return; }
            if (W.parts.on && !W.parts.label.trim()) { step = 0; paint(); A().toast('Donne un nom aux fiches « parties ».', 'error'); dlg.querySelector('[data-wp="label"]')?.focus(); return; }
            const btn = dlg.querySelector('[data-w-save]'); if (btn) btn.disabled = true;
            try {
                let def = toDef(); const r = await ART.write('save_type', {key: W.key || '', label: def.label, def}); W.key = r.key;
                if (W.parts.on) { // la sorte des « parties » : le titre, la date, la fiche du dessus, puis ses groupes
                    const pg = W.groups.filter(g => g.part).map(g => ({key: g.key, label: g.label, zone: g.zone || 'main', fields: g.fields.map(cleanF)}));
                    const pdef = {label: W.parts.label.trim(), many: (W.parts.many || `${W.parts.label.trim()}s`).trim(), icon: W.icon, family: def.family, domain: def.domain, parent_type: W.key, parentField: 'parent', quiet: true, hidden: true, partOf: W.key,
                        groups: [{key: 'main', label: W.parts.label.trim(), zone: 'main', fields: [{key: 'title', label: 'Titre', type: 'text', star: true, head: true}, {key: 'date', label: 'Date', type: 'date', star: true}, {key: 'parent', label: W.label.trim(), type: 'item', kinds: [W.key], star: true, free: false}]},
                            {key: 'photos', label: 'Photos', zone: 'left', fields: [{key: 'photos', label: 'Photos', type: 'photos', star: true}]}, ...pg, {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}], list: ['title', 'date'], card: ['date']};
                    const r2 = await ART.write('save_type', {key: W.parts.key || '', label: pdef.label, def: pdef}); W.parts.key = r2.key;
                    def = toDef(); await ART.write('save_type', {key: W.key, label: def.label, def});
                }
                Object.keys(ART.defs).filter(k => k === W.key || k === W.parts.key).forEach(k => { delete ART.defs[k]; });
                await C.reload(); dirty = false; await close(true);
                C.S.view = 'list'; C.S.kind = W.key; C.S.id = 0; C.prefs.extraTabs = [...new Set([...(C.prefs.extraTabs || []), W.key])]; C.savePrefs(); C.paint(true);
                A().toast(cur ? `Type « ${def.label} » enregistré.` : `Type « ${def.label} » créé : il est dans « ✎ Mes types ».`);
            } catch (e) { A().toast(e.message, 'error', {retry: save}); if (btn) btn.disabled = false; }
        }
        let painting = false;
        function paint() {
            if (painting) return; painting = true;
            try { paint0(); } finally { painting = false; }
        }
        function paint0() {
            const body = [step1, step2, step3, step4, step5][step]();
            dlg.innerHTML = `<div class="oe-shell"><header class="ar-top"><span class="ar-ticon">${esc(W.icon || '✎')}</span><div class="ar-tname"><span class="eyebrow">ŒUVRES · ${cur ? 'MODIFIER UN TYPE' : 'NOUVEAU TYPE'}</span><h2>✎ ${cur ? `Le type « ${esc(cur.label)} »` : 'Créer un type d’œuvre'}</h2></div><span class="spacer"></span><button type="button" class="icon-button" data-w-close aria-label="Fermer" title="Fermer">×</button></header>
                <nav class="oe-steps" role="tablist">${STEPS.map((s, i) => `<button type="button" role="tab" class="${i === step ? 'is-active' : i < step ? 'dn' : ''}" data-w-step="${i}">${i + 1} · ${esc(s)}${i < step ? ' ✓' : ''}</button>`).join('')}</nav>
                <div class="oe-body oe-wbody">${body}</div>
                <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-w-close>Annuler</button>${step ? '<button type="button" class="button secondary" data-w-prev>← Précédent</button>' : ''}${step < 4 ? '<button type="button" class="button" data-w-next>Suivant →</button>' : `<button type="button" class="button" data-w-save>${cur ? '💾 Enregistrer le type' : '✓ Créer le type'}</button>`}</div></div>`;
        }
        const keep = fn => { const a = document.activeElement, sel0 = a?.matches?.('input,textarea') ? [a.dataset.ws || a.dataset.w || a.dataset.wp || (a.matches('[data-w-libq]') ? 'libq' : ''), a.selectionStart] : null; fn(); paint();
            if (sel0?.[0]) { const el = dlg.querySelector(`[data-ws="${sel0[0]}"], [data-w="${sel0[0]}"], [data-wp="${sel0[0]}"]`) || (sel0[0] === 'libq' ? dlg.querySelector('[data-w-libq]') : null); if (el) { el.focus(); try { el.setSelectionRange(sel0[1], sel0[1]); } catch (_) {} } } };
        dlg.addEventListener('input', e => { const t = e.target, d = t.dataset;
            if (d.w === 'label') { W.label = t.value; changed(); dlg.querySelector('[data-w="many"]').placeholder = W.label ? `${W.label}s` : ''; return; }
            if (d.w === 'many') { W.many = t.value; changed(); return; }
            if (d.w === 'icon') { if (t.value.trim()) { W.icon = t.value.trim(); changed(); dlg.querySelectorAll('[data-w-icon]').forEach(b => b.classList.remove('on')); dlg.querySelector('.ar-ticon').textContent = W.icon; } return; }
            if (d.wp) { W.parts[d.wp] = t.value; changed(); return; }
            if (t.matches('[data-w-libq]')) { libq = t.value; dlg.querySelector('[data-w-libl]').innerHTML = libHtml(); return; }
            if (t.matches('[data-w-lname],[data-w-lback]')) { const lk = W.links.find(x => x.to === t.closest('[data-to]').dataset.to); if (lk) lk[t.matches('[data-w-lname]') ? 'name' : 'back'] = t.value.slice(0, 80); changed(); return; }
            if (d.ws && ['label', 'help', 'ph', 'unit'].includes(d.ws)) { const f = findF(t.closest('[data-ws-for]').dataset.wsFor)?.f; if (!f) return; f[d.ws] = t.value.slice(0, 160); if (d.ws === 'label' && !f.label.trim()) f.label = 'Champ'; changed();
                const row = dlg.querySelector(`.oe-cf[data-f="${CSS.escape(f.key)}"] .oe-cfl b`); if (row && d.ws === 'label') row.textContent = f.label; }
        });
        dlg.addEventListener('change', e => { if (painting) return; const t = e.target, d = t.dataset;
            if (d.w === 'family') { W.family = t.value; changed(); return; }
            if (t.name === 'oe-from') { if (!t.value) { W.from = ''; W.groups = baseGroups(); } changed(); return paint(); }
            if (d.w === 'from') { W.from = t.value; const src = ART.defs[t.value]; if (src) { // les champs du type de départ (repris, avec leur source)
                    const gs = src.groups.filter(g => !['_linked', '_mine'].includes(g.key)).map(g => ({key: g.key, label: g.label, zone: g.zone || 'main', fields: g.fields.filter(f => f.type !== 'computed').map(f => ({...clone(f), type: f.type === 'person' ? 'people' : f.type, source: `${src.key}.${f.key}`, base: ['title', 'date', 'photos'].includes(f.key)}))})).filter(g => g.fields.length && g.key !== 'notes');
                    if (!gs.some(g => g.fields.some(f => f.key === 'title'))) gs.unshift(baseGroups()[0]);
                    W.groups = gs; W.list = (src.list || ['title', 'date']).filter(k => gs.some(g => g.fields.some(f => f.key === k))); W.card = (src.card || []).filter(k => gs.some(g => g.fields.some(f => f.key === k))); gsel = gs[0].key; }
                dlg.querySelector('input[name="oe-from"][value="x"]').checked = !!t.value; changed(); return; }
            if (t.matches('[data-w-parts]')) { W.parts.on = t.checked; changed(); return paint(); }
            if (t.matches('[data-w-gpart]')) { const g = W.groups.find(x => x.key === t.closest('[data-g]').dataset.g); if (g) g.part = t.checked; changed(); return paint(); }
            if (t.matches('[data-w-libf]')) { const [dk, fk] = t.dataset.wLibf.split('.'), src = ART.fieldsOf(ART.defs[dk] || {groups: []}).find(f => f.key === fk); if (!src) return;
                if (t.checked) addField(src.type === 'person' ? 'people' : src.type, {...clone(src), source: `${dk}.${fk}`, label: src.label, star: true}, src.key);
                else W.groups.forEach(g => { g.fields = g.fields.filter(f => f.source !== t.dataset.wLibf || f.base); });
                changed(); return keep(() => {}); }
            if (t.matches('[data-w-link]')) { const to = t.closest('[data-to]').dataset.to; if (t.checked) W.links.push({to, name: ART.defs[to]?.label || '', back: W.label || '', key: fkey(`lien_${to}`, new Set([...taken(), ...W.links.map(x => x.key)]))}); else W.links = W.links.filter(x => x.to !== to); changed(); return paint(); }
            if (t.matches('[data-w-col]')) { const k = t.closest('[data-lk]').dataset.lk; W.list = t.checked ? [...new Set([...W.list, k])] : W.list.filter(x => x !== k); changed(); return paint(); }
            if (t.matches('[data-w-card]')) { const k = t.dataset.wCard; W.card = t.checked ? [...new Set([...W.card, k])] : W.card.filter(x => x !== k); changed(); return paint(); }
            if (t.matches('[data-w-exp]')) { const all = allFields().filter(f => !f.g.part).map(f => f.key); if (!W.export.length) W.export = all; W.export = t.checked ? [...new Set([...W.export, t.dataset.wExp])] : W.export.filter(x => x !== t.dataset.wExp); if (W.export.length === all.length) W.export = []; changed(); return; }
            if (painting || ['label', 'help', 'ph', 'unit'].includes(d.ws) || d.w || d.wp) return; // déjà pris par « input »
            const box = t.closest('[data-ws-for]'); if (!box) return; const f = findF(box.dataset.wsFor)?.f; if (!f) return;
            if (d.ws === 'type') { f.type = t.value; delete f.view; if (f.type === 'list' && !f.choices) f.choices = ['Premier choix', 'Deuxième choix']; if (f.type === 'rows' && !f.cols) f.cols = [{key: 'quoi', label: 'Quoi'}]; if (f.type === 'computed') f.calc = f.calc || {op: 'count'}; }
            if (d.ws === 'choices') f.choices = t.value.split(/\n/).map(x => x.trim()).filter(Boolean).slice(0, 80);
            if (d.ws === 'cols') { const TY = {personne: 'person', lieu: 'place', montant: 'money', 'oui-non': 'bool', nombre: 'number', date: 'date'}; const used = new Set();
                f.cols = t.value.split(/\n/).map(x => x.trim()).filter(Boolean).slice(0, 12).map(x => { const [l, ty] = x.split(/\s*:\s*/); let k = fkey(l || 'colonne', used); used.add(k); return {key: k, label: (l || 'Colonne').slice(0, 60), ...(TY[OE.norm(ty || '')] ? {type: TY[OE.norm(ty)]} : {}), w: 'm'}; }); }
            if (d.ws === 'kinds') f.kinds = t.value ? [t.value] : [];
            if (d.ws === 'calc_op') f.calc = {op: t.value}; if (d.ws === 'calc_field') f.calc = {...(f.calc || {}), field: t.value}; if (d.ws === 'calc_col') f.calc = {...(f.calc || {}), col: t.value};
            if (d.wsB) { if (d.wsB === 'inList') { W.list = t.checked ? [...new Set([...W.list, f.key])] : W.list.filter(x => x !== f.key); f.inList = t.checked; } else if (d.wsB === 'inCard') { W.card = t.checked ? [...new Set([...W.card, f.key])] : W.card.filter(x => x !== f.key); f.inCard = t.checked; } else if (!(d.wsB === 'required' && f.key === 'title')) f[d.wsB] = t.checked; }
            changed(); keep(() => {});
        });
        dlg.addEventListener('click', async e => { const b = e.target.closest('button'); if (!b) return; const d = b.dataset, row = b.closest('[data-f]'), gb = b.closest('[data-g]');
            if (d.wClose !== undefined) return close();
            if (d.wStep !== undefined) { step = Number(d.wStep); return paint(); }
            if (d.wNext !== undefined) { if (step === 0 && !W.label.trim()) { A().toast('Donne un nom au type.', 'error'); dlg.querySelector('[data-w="label"]')?.focus(); return; } step = Math.min(4, step + 1); return paint(); }
            if (d.wPrev !== undefined) { step = Math.max(0, step - 1); return paint(); }
            if (d.wSave !== undefined) return save();
            if (d.wIcon) { W.icon = d.wIcon; changed(); return paint(); }
            if (d.wAdd) { addField(d.wAdd); return paint(); }
            if (d.wAddf !== undefined) { addField('text', {label: 'Nouveau champ'}); paint(); dlg.querySelector('[data-ws="label"]')?.select(); return; }
            if (d.wLib !== undefined) { dlg.querySelector('[data-w-libq]')?.focus(); return; }
            if (d.wAddg !== undefined) { const n = await A().askText({title: '＋ Ajouter un groupe', message: 'Le nom du groupe (ex. « Le défilé »).', value: '', okLabel: 'Ajouter'}); if (!n?.trim()) return; const k = fkey(`g_${n}`, new Set(W.groups.map(g => g.key))); W.groups.push({key: k, label: n.trim().slice(0, 60), zone: 'main', fields: [], part: W.parts.on && W.groups.some(g => g.part)}); gsel = k; changed(); return paint(); }
            if (d.wUnsel !== undefined) { sel = null; return paint(); }
            if (gb && d.wGsel !== undefined) { gsel = gb.dataset.g; return paint(); }
            if (gb && d.wGmv) { const i = W.groups.findIndex(g => g.key === gb.dataset.g), j = i + Number(d.wGmv); if (j < 0 || j >= W.groups.length) return; [W.groups[i], W.groups[j]] = [W.groups[j], W.groups[i]]; changed(); return paint(); }
            if (gb && d.wGren !== undefined) { const g = W.groups.find(x => x.key === gb.dataset.g); const n = await A().askText({title: 'Renommer le groupe', message: '', value: g.label, okLabel: 'Renommer'}); if (!n?.trim()) return; g.label = n.trim().slice(0, 60); changed(); return paint(); }
            if (gb && d.wGdel !== undefined) { const i = W.groups.findIndex(g => g.key === gb.dataset.g), g = W.groups[i]; W.groups.splice(i, 1); W.groups[0].fields.push(...g.fields); if (gsel === g.key) gsel = W.groups[0].key; changed(); paint();
                A().undoToast(`Groupe « ${g.label} » retiré`, {undo: () => { W.groups[0].fields = W.groups[0].fields.filter(f => !g.fields.includes(f)); W.groups.splice(i, 0, g); paint(); }}); return; }
            if (row && d.wSel !== undefined) { sel = sel === row.dataset.f ? null : row.dataset.f; gsel = row.closest('[data-g]').dataset.g; paint(); dlg.querySelector('.oe-pop')?.scrollIntoView({block: 'nearest'}); return; }
            if (row && d.wEye !== undefined) { const f = findF(row.dataset.f).f; f.star = !f.star; changed(); return paint(); }
            if (d.wFdel !== undefined) { const at = findF(b.closest('[data-ws-for]').dataset.wsFor); if (!at || at.f.base) return; at.g.fields.splice(at.i, 1); sel = null; W.list = W.list.filter(k => k !== at.f.key); W.card = W.card.filter(k => k !== at.f.key); changed(); paint();
                A().undoToast(`Champ « ${at.f.label} » retiré`, {undo: () => { at.g.fields.splice(at.i, 0, at.f); paint(); }}); return; }
            if (d.wCmv) { const fs = listable(), ord = [...W.list.filter(k => fs.some(f => f.key === k)), ...fs.map(f => f.key).filter(k => !W.list.includes(k))], k = b.closest('[data-lk]').dataset.lk, i = ord.indexOf(k), j = i + Number(d.wCmv);
                if (j < 0 || j >= ord.length) return; [ord[i], ord[j]] = [ord[j], ord[i]]; W.list = ord.filter(x => W.list.includes(x)); changed(); return paint(); }
        });
        dlg.addEventListener('toggle', e => { const d = e.target; if (d.matches?.('details[data-fam]')) { if (d.open) openFams.add(d.dataset.fam); else openFams.delete(d.dataset.fam); } }, true);
        // ⠿ glisser un champ (dans son groupe ou dans un autre)
        let drag = null;
        dlg.addEventListener('dragstart', e => { const r = e.target.closest?.('.oe-cf'); if (!r) return; drag = r.dataset.f; r.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'oe-field'); } catch (_) {} });
        dlg.addEventListener('dragover', e => { if (!drag) return; const box = e.target.closest('.oe-gbox'); if (box) e.preventDefault(); });
        dlg.addEventListener('drop', e => { if (!drag) return; const box = e.target.closest('.oe-gbox'); if (!box) return; e.preventDefault(); const at = findF(drag); if (!at) return;
            const g = W.groups.find(x => x.key === box.dataset.g), over = e.target.closest('.oe-cf'); at.g.fields.splice(at.i, 1);
            let j = over ? g.fields.findIndex(f => f.key === over.dataset.f) : g.fields.length; if (over) { const rc = over.getBoundingClientRect(); if (e.clientY > rc.top + rc.height / 2) j++; }
            g.fields.splice(Math.max(0, j), 0, at.f); drag = null; changed(); paint(); });
        dlg.addEventListener('dragend', () => { drag = null; dlg.querySelectorAll('.drag').forEach(x => x.classList.remove('drag')); });
        paint(); dlg.showModal();
        setTimeout(() => dlg.querySelector('[data-w="label"]')?.focus(), 30);
        return dlg;
    };
})();
