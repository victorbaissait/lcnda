/* LCNDA — 🧩 « Cette personne était… » : la LISTE des personnes qui ont des profils (onglet Listes) et la rubrique de
 * Maintenance qui règle leurs pages (ordre, visibilité, largeur et couleur des sections ; ordre, visibilité et couleur des
 * profils ; modèles ; exception pour une personne ; pages personnalisées).
 *
 *  - Liste « profiles_list » : barre H10 (🔍, Filtrer ▾ par profil, groupe, nombre de profils, métier, réglage propre ;
 *    Liste | Fiches ; Trier), une ligne ou une carte par personne avec les pastilles de couleur de ses profils ; un clic
 *    ouvre sa page (PF.openPage). Serveur : GET art&op=profile_people (lib/profils.php, profils_people).
 *    Pourquoi pas fusionnée avec « Métiers » : cette liste-là range des MÉTIERS (un texte) avec les fiches qui l'ont ;
 *    celle-ci range des PERSONNES avec leurs profils. Le métier est donc une rubrique de son menu Filtrer.
 *  - Maintenance → Apparence → Fiches personnes et animaux : section « FICHES PERSONNES · Cette personne était… (profils) »,
 *    même présentation que « Ordre et visibilité des blocs » (ext.designPanels). Les réglages sont ceux de la page
 *    (layout_prefs « global » et « person:<id> » : ppage, pfpages, page), donc repris dans « 💾 Réglages enregistrés ».
 *    Serveur : GET art&op=page_settings (profils_page_settings) ; écriture : art_write save_settings.
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART, PF = ART?.PF; if (!ART?.define || !PF) return;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI || {};
    const U = ART.util, esc = U.esc;
    const plural = (n, w, pl) => U.plural(n, w, pl);
    const clone = o => JSON.parse(JSON.stringify(o ?? null));
    const toast = (...a) => A()?.toast?.(...a);
    const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const nameOf = p => `${p.first_name || ''} ${String(p.last_name || '').toLocaleUpperCase('fr-FR')}`.trim() || 'Sans nom';
    const life = p => (p.birth || p.death ? `${p.birth || '?'}–${p.death || ''}` : '');
    const known = k => ART.profiles[k] || null;
    const groupOf = k => PF.norm ? (PF.norm(ART.profiles[k] || {key: k}).group || 'autre') : (ART.profiles[k]?.group || 'autre');
    const badges = keys => keys.filter(known).map(k => `<span class="pf-b" style="${PF.vars(PF.color(k))}">${esc(ART.profiles[k].icon || '✦')} ${esc(ART.profiles[k].short || ART.profiles[k].label)}</span>`).join('');

    /* ═════════ 1. La liste « 🧩 Cette personne était… » ═════════ */
    ext.lists = ext.lists || {};
    ext.lists.profiles_list = async token => {
        const app = A(), ws = app.$('#workspace'), alive = () => token === undefined || token === app.state?.workspaceToken;
        ws.innerHTML = `<section class="page pf-listpage">${UI().spinner ? UI().spinner('Chargement…') : 'Chargement…'}</section>`;
        let data;
        try { await PF.refreshDefs?.(true); data = await app.api('art', {op: 'profile_people'}); PF.loadDefs?.(data.defs); } catch (e) { if (alive()) ws.innerHTML = `<section class="page">${app.empty ? app.empty(e.message) : esc(e.message)}</section>`; return; }
        if (!alive()) return;
        const people = (data.people || []).map(p => ({...p, profiles: (p.profiles || []).filter(k => typeof k === 'string'), name: nameOf(p)}));
        const keys = [...new Set(people.flatMap(p => p.profiles))].filter(known).sort((a, b) => String(ART.profiles[a].label).localeCompare(ART.profiles[b].label, 'fr'));
        const jobs = [...new Set(people.map(p => p.occupation.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')).slice(0, 300);
        const groups = PF.GROUPS.filter(([g]) => people.some(p => p.profiles.some(k => groupOf(k) === g)));
        ws.innerHTML = `<section class="page pf-listpage"><header class="page-header"><div><span class="eyebrow">LISTES · PROFILS</span><h2>🧩 Cette personne était…</h2><p class="muted">Les personnes qui ont des profils (artiste, sportif, élu, militaire…) : un clic ouvre leur page.</p></div>${document.body.classList.contains('is-kiosk') ? '' : '<div class="page-actions"><button type="button" class="button" data-pfl-new title="Choisir une personne, puis cocher ce qu’elle était (artiste, sportif, élu…)">＋ Nouvelle page</button></div>'}</header><div data-pfl-bar></div><div data-pfl-body></div><div class="list-more-wrap" data-pfl-more></div></section>`;
        const body = ws.querySelector('[data-pfl-body]'), more = ws.querySelector('[data-pfl-more]');
        // ＋ : choisir la personne (menu de choix), puis ses profils ; la liste se redessine ensuite
        ws.querySelector('[data-pfl-new]')?.addEventListener('click', async () => {
            const P = window.LCNDA_PICKER || app; const it = await P.openPicker?.({kind: 'person', title: 'Qui était cette personne ?'});
            if (!it || !Number(it.id)) return;
            // la liste ne se redessine que si on y est encore (pas par-dessus un autre écran)
            const still = () => alive() && app.state?.module === 'listes' && app.state?.listType === 'profiles_list' && ws.querySelector('.pf-listpage');
            if (!still()) return;
            PF.openChooser(Number(it.id), {name: it.title || '', onDone: () => { if (still()) ext.lists.profiles_list(app.state?.workspaceToken); }});
        });
        let shown = 60;
        const bar = UI().listBar({key: 'listes:profiles_list',
            search: {placeholder: 'Chercher une personne… (ex. Martin, maire, sportif)'},
            filters: [
                {id: 'prof', label: 'Profil', type: 'check', options: keys.map(k => [k, `${ART.profiles[k].icon || ''} ${ART.profiles[k].label}`])},
                {id: 'group', label: 'Groupe', type: 'check', options: groups.map(([g, l]) => [g, l])},
                {id: 'n', label: 'Nombre de profils', type: 'radio', options: [['', 'Tous'], ['1', 'Un seul'], ['2', 'Deux'], ['3', 'Trois ou plus']], dflt: ''},
                {id: 'job', label: 'Métier', type: 'check', options: jobs.map(j => [j, j])},
                {id: 'own', label: 'Page personnalisée', chipLabel: 'Page personnalisée', type: 'check'},
                {id: 'locked', label: 'Fiche verrouillée', chipLabel: 'Verrouillées', type: 'check'}],
            view: {dflt: 'list', what: 'fiches'},
            sort: {options: [['az', 'A → Z'], ['za', 'Z → A'], ['most', 'Le plus de profils'], ['items', 'Le plus de fiches'], ['recent', 'Plus récents'], ['old', 'Plus anciens']], value: 'az'},
            onChange: () => { shown = 60; paint(); }});
        ws.querySelector('[data-pfl-bar]').appendChild(bar);
        function rowsOf(st) {
            const q = fold(st.q), f = st.filters;
            let l = people.filter(p => {
                if (q && !fold(`${p.name} ${p.occupation} ${p.profiles.map(k => ART.profiles[k]?.label || k).join(' ')}`).includes(q)) return false;
                if (f.prof?.length && !f.prof.some(k => p.profiles.includes(k))) return false;
                if (f.group?.length && !p.profiles.some(k => f.group.includes(groupOf(k)))) return false;
                if (f.n && (f.n === '3' ? p.profiles.length < 3 : p.profiles.length !== Number(f.n))) return false;
                if (f.job?.length && !f.job.includes(p.occupation.trim())) return false;
                if (f.own && !p.own) return false;
                if (f.locked && !p.is_locked) return false;
                return true; });
            const s = st.sort;
            if (s === 'most') l = [...l].sort((a, b) => b.profiles.length - a.profiles.length || a.name.localeCompare(b.name, 'fr'));
            else if (s === 'items') l = [...l].sort((a, b) => b.items - a.items || a.name.localeCompare(b.name, 'fr'));
            else l = UI().sortItems(l, s || 'az', {name: p => `${p.last_name} ${p.first_name}`, date: p => p.updated_at});
            return l;
        }
        const thumb = (p, big) => window.LCNDA_UI?.avatarOn?.() ? window.LCNDA_UI.avatar({...p, photo: p.photo ? `media/${encodeURIComponent(p.photo)}` : ''}, big ? 88 : 34) : p.photo ? `<img src="media/${encodeURIComponent(p.photo)}" alt="" loading="lazy">` : `<span class="pf-lav ${{male: 'm', female: 'f'}[p.gender] || 'u'}${big ? ' is-big' : ''}">${esc(U.initials ? U.initials(p.name) : p.name.slice(0, 2))}</span>`;
        function paint() {
            const st = bar.state, l = rowsOf(st), part = l.slice(0, shown);
            bar.setCount(l.length, 'personne');
            const items = part.map(p => st.view === 'cards' ? ({thumb: thumb(p, true), name: p.name, open: `data-pfl-open="${p.id}"`, openLabel: '↗ Sa page', // K9 : la vignette unique
                lines: [[life(p), p.occupation].filter(Boolean).join(' · '), [p.items ? plural(p.items, 'fiche') : '', p.own ? '✎ page personnalisée' : '', p.is_locked ? '🔒 fiche verrouillée' : ''].filter(Boolean).join(' · ')], badges: [`<span class="pf-badges">${badges(p.profiles)}</span>`]})
                : ({thumb: thumb(p, false), name: p.name, open: `data-pfl-open="${p.id}"`,
                lines: [{html: `<span class="pf-badges">${badges(p.profiles)}</span>`}, [life(p), p.occupation, p.items ? plural(p.items, 'fiche') : ''].filter(Boolean).join(' · '), p.own ? '✎ page personnalisée' : '', p.is_locked ? '🔒 fiche verrouillée' : ''],
                actions: `<button type="button" class="button small secondary" data-pfl-open="${p.id}">↗ Sa page</button>`}));
            body.innerHTML = l.length ? UI().itemsHtml(st.view, items) : (people.length ? A().emptyState({icon: '🔍', text: 'Aucune personne ne correspond', hint: 'Retire un filtre ou change la recherche.'})
                : A().emptyState({icon: '🧩', text: 'Aucune personne n’a encore de profil', hint: 'Sur une fiche, « 🧩 Choisir ses profils… » : artiste, sportif, élu, militaire…'}));
            more.innerHTML = '';
            if (l.length > shown && UI().moreButton) { const b = UI().moreButton({remaining: l.length - shown, step: 60, feminine: true, onClick: () => { shown += 60; paint(); }}); more.appendChild(b); }
        }
        body.addEventListener('click', e => { const b = e.target.closest('[data-pfl-open]'); if (b) PF.openPage(Number(b.dataset.pflOpen), 'all'); });
        paint();
    };

    /* ═════════ 2. Maintenance : « Cette personne était… (profils) » ═════════ */
    const WIDTHS = [['ligne', '1'], ['½', '1/2'], ['⅓', '1/3'], ['¼', '1/4'], ['⅔', '2/3'], ['¾', '3/4']];
    /** une « personne » qui a tous les profils de la base : pour montrer toutes les sections dans le réglage standard */
    const fakeStore = (data, keys, own = false) => ({pid: 0, name: 'toutes les pages', person: {profiles: keys.map(k => ({profile_key: k})), is_artist: keys.includes('artist') ? 1 : 0}, global: own ? {} : data, personSet: own ? data : null, items: [], of: () => [], get: () => null, people: []});
    /** l'éditeur d'un réglage (standard ou exception) : renvoie le HTML ; l'état est dans ed */
    function editorHtml(ed) {
        const st = fakeStore(ed.data, ed.keys, ed.own), all = PF.allCfg(st), pp = ed.data.ppage || {};
        const profRows = all.profOrder.filter(known).map((k, i) => `<div class="order-row has-visibility pfm-row" data-pfm-prof="${esc(k)}"><span class="order-grip" draggable="true" aria-hidden="true">⠿</span><span class="order-number">${String(i + 1).padStart(2, '0')}</span><b><span class="pf-b" style="${PF.vars(pp.profColors?.[k] || PF.color(k))}">${esc(ART.profiles[k].icon || '✦')} ${esc(ART.profiles[k].label)}</span></b><span class="ar-ocol" data-pfm-pcol="${esc(k)}"></span><label class="order-visible" title="Montrer ce profil sur les pages"><input type="checkbox" data-pfm-pvis ${all.profHidden.has(k) ? '' : 'checked'}></label></div>`).join('');
        const secRows = all.order.map(k => [k, PF.section(st, k)]).filter(([, S0]) => S0).map(([k, S0], i) => { const w = all.widths[k] || S0.w || 'ligne', ow = all.owner[k], P = ow && ow !== 'common' ? ART.profiles[ow] : null;
            return `<div class="order-row has-visibility pfm-row" data-pfm-sec="${esc(k)}"><span class="order-grip" draggable="true" aria-hidden="true">⠿</span><span class="order-number">${String(i + 1).padStart(2, '0')}</span><b>${esc(S0.icon || '')} ${esc(S0.label)}${P ? ` <small class="muted">${esc(P.icon || '')} ${esc(P.short || P.label)}</small>` : ' <small class="muted">commune</small>'}</b><div class="block-widths" aria-label="Largeur de la section">${WIDTHS.map(([v, t]) => `<button type="button" data-pfm-w="${v}" aria-pressed="${v === w ? 'true' : 'false'}" title="Largeur ${v === 'ligne' ? 'toute la ligne' : v}">${t}</button>`).join('')}</div><span class="ar-ocol" data-o-col="${esc(k)}"></span><label class="order-visible" title="Montrer la section"><input type="checkbox" data-pfm-svis ${all.hidden.has(k) ? '' : 'checked'}></label></div>`; }).join('');
        const models = ed.keys.map(k => { const P = known(k); if (!P) return ''; if (k === 'artist') { const M = ART.models || {}; const cur = ed.data.page?.model || ''; return Object.keys(M).length > 1 ? `<label class="pfm-model"><span>${esc(P.icon)} ${esc(P.label)}</span><select data-pfm-model="artist"><option value="">Selon la discipline</option>${Object.entries(M).filter(([, m]) => m?.label).map(([mk, m]) => `<option value="${esc(mk)}" ${mk === cur ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select></label>` : ''; }
            const ms = Array.isArray(P.models) ? Object.fromEntries(P.models.filter(m => ART.models?.[m]).map(m => [m, ART.models[m]])) : (P.models || {}); const ent = Object.entries(ms).filter(([, m]) => m?.label); if (ent.length < 2) return '';
            const cur = ed.data.pfpages?.[k]?.model || ''; return `<label class="pfm-model"><span>${esc(P.icon)} ${esc(P.label)}</span><select data-pfm-model="${esc(k)}"><option value="">Modèle de départ</option>${ent.map(([mk, m]) => `<option value="${esc(mk)}" ${mk === cur ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select></label>`; }).join('');
        return `<b class="pf-sub">Profils (ordre, couleur, visibles)</b><div class="order-list block-order-list" data-pfm-list="prof">${profRows || '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🧩</span><span class="empty-line-text">Aucun profil dans la base pour l’instant.</span></p>'}</div>
            <b class="pf-sub">Sections de la page « Tout mélangé »</b><div class="order-list block-order-list" data-pfm-list="sec">${secRows}</div>
            ${models ? `<b class="pf-sub">Modèles de départ</b><div class="pfm-models">${models}</div>` : ''}
            <label class="checkbox-line"><input type="checkbox" data-pfm-empty ${pp.hideEmpty ? 'checked' : ''}> Masquer les sections vides</label>`;
    }
    /** les pastilles C2 de l'éditeur (profils et sections) */
    function mountColors(box, ed) {
        const UIx = UI(); if (!UIx.colorField) return;
        const pp = () => { ed.data.ppage = ed.data.ppage || {}; return ed.data.ppage; };
        box.querySelectorAll('[data-pfm-pcol]').forEach(slot => { const k = slot.dataset.pfmPcol, f = UIx.colorField({value: pp().profColors?.[k] || PF.color(k), compact: true}); f.title = 'Couleur du profil'; slot.appendChild(f);
            f.input.addEventListener('change', () => { if (!/^#[0-9a-f]{6}$/i.test(f.input.value || '')) return; pp().profColors = {...(pp().profColors || {}), [k]: f.input.value.slice(0, 7)}; ed.dirty = true; ed.repaint(); }); });
        const st = fakeStore(ed.data, ed.keys, ed.own), all = PF.allCfg(st);
        ART.mountSecColors?.(box, all.colors, k => { const ow = all.owner[k]; return ow && ow !== 'common' ? (pp().profColors?.[ow] || PF.color(ow)) : ''; }, (k, v) => { const p = pp(); p.colors = {...(p.colors || {})}; if (v == null) delete p.colors[k]; else p.colors[k] = v; ed.dirty = true; ed.repaint(); });
    }
    /** relie un éditeur : clics, cases, glisser ; ed = {data, keys, own, dirty, repaint} */
    function bindEditor(box, ed) {
        const pp = () => { ed.data.ppage = ed.data.ppage || {}; const p = ed.data.ppage, all = PF.allCfg(fakeStore(ed.data, ed.keys, ed.own)); p.order = p.order || [...all.order]; p.hidden = p.hidden || [...all.hidden]; p.widths = p.widths || {}; p.profOrder = p.profOrder || [...all.profOrder]; p.profHidden = p.profHidden || [...all.profHidden]; return p; };
        box.addEventListener('click', e => { const b = e.target.closest('[data-pfm-w]'); if (!b) return; const k = b.closest('[data-pfm-sec]').dataset.pfmSec; pp().widths[k] = b.dataset.pfmW; ed.dirty = true; ed.repaint(); });
        box.addEventListener('change', e => { const t = e.target;
            if (t.matches('[data-pfm-svis]')) { const k = t.closest('[data-pfm-sec]').dataset.pfmSec, p = pp(); p.hidden = t.checked ? p.hidden.filter(x => x !== k) : [...new Set([...p.hidden, k])]; }
            else if (t.matches('[data-pfm-pvis]')) { const k = t.closest('[data-pfm-prof]').dataset.pfmProf, p = pp(); p.profHidden = t.checked ? p.profHidden.filter(x => x !== k) : [...new Set([...p.profHidden, k])]; }
            else if (t.matches('[data-pfm-model]')) { const k = t.dataset.pfmModel; if (k === 'artist') { ed.data.page = {...(ed.data.page || {}), model: t.value || undefined}; if (!t.value) delete ed.data.page.model; } else { ed.data.pfpages = ed.data.pfpages || {}; const o = ed.data.pfpages[k] || {}; ed.data.pfpages[k] = t.value ? {model: t.value, widths: o.widths || {}, colors: o.colors || {}, custom: o.custom || []} : {custom: o.custom || []}; } }
            else if (t.matches('[data-pfm-empty]')) { pp().hideEmpty = t.checked; }
            else return;
            ed.dirty = true; ed.repaint(); });
        let drag = null;
        box.addEventListener('dragstart', e => { const g = e.target.closest('.order-grip'); if (!g) return; drag = g.closest('.order-row'); drag.classList.add('is-dragging'); try { e.dataTransfer.setData('text/plain', ''); } catch (_) {} });
        box.addEventListener('dragover', e => { if (!drag) return; const o = e.target.closest('.order-row'); if (!o || o === drag || o.parentElement !== drag.parentElement) return; e.preventDefault(); const r = o.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) o.before(drag); else o.after(drag); });
        box.addEventListener('dragend', () => { if (!drag) return; const list = drag.parentElement; drag.classList.remove('is-dragging'); drag = null; const p = pp();
            if (list.dataset.pfmList === 'prof') p.profOrder = [...list.querySelectorAll('[data-pfm-prof]')].map(r => r.dataset.pfmProf);
            else p.order = [...list.querySelectorAll('[data-pfm-sec]')].map(r => r.dataset.pfmSec);
            ed.dirty = true; ed.repaint(); });
    }
    const write = (key, data) => ART.write('save_settings', {key, data});
    let M = null; // l'état de la rubrique
    async function mount(host) {
        if (!host || host.dataset.pfmDone) return; host.dataset.pfmDone = '1';
        const body = host.querySelector('[data-pfm-body]');
        let r; try { await PF.refreshDefs?.(true); r = await A().api('art', {op: 'page_settings'}); } catch (e) { body.innerHTML = A().empty ? A().empty(e.message) : esc(e.message); return; }
        const defs = await A().api('art', {op: 'profiles', person_id: 0}).catch(() => ({defs: []}));
        const keys = [...new Set(['artist', ...(defs.defs || []).filter(d => d.count > 0).map(d => d.key)])].filter(known);
        const g = r.global && !Array.isArray(r.global) ? r.global : {};
        M = {global: g, presets: Array.isArray(r.presets?.list) ? r.presets.list : [], people: r.people || [], keys, person: null};
        const std = {data: clone(g), keys, own: false, dirty: false};
        const exc = {data: null, keys, own: true, dirty: false, pid: 0, name: ''};
        body.innerHTML = `<div class="design-order-grid block-grid pfm-grid">
            <section class="maintenance-panel order-editor block-order-editor" data-pfm-std><div class="item-title-row"><h3>Réglage standard — toutes les pages</h3></div><div data-pfm-ed></div>
                <div class="page-actions action-zone"><button class="button small" type="button" data-pfm-save-std>Enregistrer le réglage standard</button><button class="button small secondary" type="button" data-pfm-reset-std title="Revenir aux modèles de départ (↶ Annuler possible)">↺ Remettre comme au départ</button></div>
                <div data-presets-slot="pfm-presets"></div></section>
            <section class="maintenance-panel order-editor block-order-editor" data-pfm-exc><div class="item-title-row"><h3>Exception pour une personne</h3></div>
                <span class="pk-lab">Personne</span>${A().pickerField ? A().pickerField({name: 'pfm_person', kind: 'person'}) : ''}<div data-pfm-ed><p class="muted">Choisis une personne : sa page aura son propre réglage (comme « Réglage propre à … » dans « ⚙️ Organiser la page »).</p></div>
                <div class="page-actions action-zone" data-pfm-excact hidden><button class="button small" type="button" data-pfm-save-exc>Enregistrer l’exception</button><button class="button small secondary" type="button" data-pfm-open-exc>↗ Ouvrir sa page</button><button class="button small secondary" type="button" data-pfm-drop-exc>↺ Remettre comme au départ</button></div></section></div>
            <section class="maintenance-panel pfm-people"><h3>Pages personnalisées</h3><div data-pfm-people></div></section>`;
        const stdBox = body.querySelector('[data-pfm-std] [data-pfm-ed]'), excBox = body.querySelector('[data-pfm-exc] [data-pfm-ed]');
        std.repaint = () => { stdBox.innerHTML = editorHtml(std); mountColors(stdBox, std); };
        exc.repaint = () => { if (!exc.data) return; excBox.innerHTML = editorHtml(exc); mountColors(excBox, exc); body.querySelector('[data-pfm-excact]').hidden = false; };
        bindEditor(stdBox, std); bindEditor(excBox, exc); std.repaint();
        // 💾 Réglages enregistrés : la même liste (art_write « presets ») que « ⚙️ Champs affichés » d’une fiche, même fichier exporté (outil « artistes »)
        const savePresets = l => write('presets', {list: l}).then(() => { M.presets = l; });
        const stdPick = d => ['ppage', 'pfpages', 'page'].forEach(k => { if (d?.[k] !== undefined) std.data[k] = clone(d[k]); else delete std.data[k]; });
        const pframe = UI().presetsFrame?.({id: 'profils-pages', what: 'les pages des profils (et tous les champs affichés des fiches)', quietApply: true,
            list: () => M.presets.map(p => ({name: String(p?.name || 'Sans nom')})),
            apply: i => { const p = M.presets[i]; if (!p) return false; stdPick(p.data); std.dirty = true; std.repaint(); toast(`Réglage « ${p.name} » repris : « Enregistrer le réglage standard » pour le garder.`); },
            save: name => { const l = clone(M.presets), row = {name, data: clone(std.data)}, at = l.findIndex(p => p.name === name); if (at >= 0) l[at] = row; else l.push(row); return savePresets(l); },
            replace: i => { const l = clone(M.presets); if (!l[i]) return false; l[i].data = clone(std.data); return savePresets(l); },
            rename: (i, name) => { const l = clone(M.presets); if (!l[i]) return false; l[i].name = name; return savePresets(l); },
            duplicate: async i => { const l = clone(M.presets), p = l[i]; if (!p) return false; const nm = UI().freeName(p.name, l.map(x => x.name)); l.splice(i + 1, 0, {...clone(p), name: nm}); await savePresets(l); toast(`Copie « ${nm} » créée.`); },
            exportOne: i => { const p = M.presets[i]; if (p) A().exportSettingFile?.('artistes', p.name, {artistes: p.data}); return false; },
            remove: async i => { const old = clone(M.presets), p = old[i]; if (!p) return false; const l = old.filter((_, k) => k !== i); await savePresets(l);
                A().undoToast(`Réglage « ${p.name} » supprimé`, {undo: async () => { await savePresets(old); pframe.refresh(); }, redo: async () => { await savePresets(l); pframe.refresh(); }}); },
            importOne: async () => { const got = await A().importSettingFile?.('artistes', {names: M.presets.map(p => p.name), check: x => x && typeof x.artistes === 'object'}); if (!got) return false;
                await savePresets([...clone(M.presets), {name: got.nom, data: got.donnees.artistes}]); toast(`Réglage « ${got.nom} » importé : « Appliquer » pour t’en servir.`); }});
        if (pframe) body.querySelector('[data-presets-slot="pfm-presets"]').replaceWith(pframe);
        const peopleBox = body.querySelector('[data-pfm-people]');
        const paintPeople = () => { peopleBox.innerHTML = M.people.length ? `<div class="pfm-plist">${M.people.map(p => `<div class="pfm-prow" data-pid="${p.id}"><b>${esc(nameOf(p))}</b><small class="muted">${window.LCNDA_UI?.when?.(p.updated_at, {label: 'Modifié'}) || ''}</small><button type="button" class="button small secondary" data-pfm-open="${p.id}">↗ Ouvrir</button><button type="button" class="button small secondary" data-pfm-drop="${p.id}">↺ Remettre comme au départ</button></div>`).join('')}</div>` : (A().emptyState ? A().emptyState({icon: '🧩', text: 'Aucune page personnalisée', hint: 'Une exception se crée ici, ou dans « ⚙️ Organiser la page » (« Réglage propre à … »).'}) : ''); };
        paintPeople();
        const reloadPeople = async () => { try { const x = await A().api('art', {op: 'page_settings'}); M.people = x.people || []; paintPeople(); } catch (_) {} };
        /** revenir au standard (↶ Annuler remet l'exception) */
        const dropPerson = async pid => { const p = M.people.find(x => x.id === pid), old = p?.data; if (!old) return;
            try { await write(`person:${pid}`, null); } catch (e) { toast(e.message, 'error'); return; }
            await reloadPeople(); if (exc.pid === pid) { exc.data = null; excBox.innerHTML = '<p class="muted">Cette page suit maintenant le réglage standard.</p>'; body.querySelector('[data-pfm-excact]').hidden = true; }
            A().undoToast(`Page de ${nameOf(p)} : retour au standard`, {undo: async () => { await write(`person:${pid}`, old); await reloadPeople(); }, redo: async () => { await write(`person:${pid}`, null); await reloadPeople(); }}); };
        body.addEventListener('picker-change', async e => { if (!e.target.closest('[data-pfm-exc]')) return; const v = e.detail?.value ?? e.detail?.item?.id, pid = Number(typeof v === 'object' ? v?.id : v) || 0; if (!pid) return;
            try { const b = await A().api('art', {op: 'boot', person_id: pid}); const own = b.settings?.person?.own ? b.settings.person : {...clone(g), own: true};
                Object.assign(exc, {pid, name: nameOf(b.person || {}), data: own, dirty: false, keys: [...new Set([...(b.person?.profiles || []).map(p => p.profile_key), ...(Number(b.person?.is_artist) ? ['artist'] : [])])].filter(known)});
                if (!exc.keys.length) { excBox.innerHTML = `<p class="muted">${esc(exc.name)} n’a pas encore de profil : « 🧩 Choisir ses profils… » sur sa fiche.</p>`; body.querySelector('[data-pfm-excact]').hidden = true; exc.data = null; return; }
                exc.repaint(); } catch (er) { toast(er.message, 'error'); } });
        body.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b || b.closest('.pk')) return;
            if (b.hasAttribute('data-pfm-save-std')) { const old = clone(M.global); try { await write('global', std.data); M.global = clone(std.data); std.dirty = false; PF.profColors = {...(std.data.ppage?.profColors || {})}; A().undoToast ? A().undoToast('Réglage standard des pages enregistré', {undo: async () => { await write('global', old); M.global = old; std.data = clone(old); std.repaint(); }}) : toast('✓ Enregistré'); } catch (er) { toast(er.message, 'error', {retry: () => b.click()}); } return; }
            if (b.hasAttribute('data-pfm-reset-std')) { const old = clone(std.data); ['ppage', 'pfpages', 'page'].forEach(k => { delete std.data[k]; }); try { await write('global', std.data); M.global = clone(std.data); PF.profColors = {}; std.repaint(); A().undoToast?.('Pages remises au réglage de départ', {undo: async () => { await write('global', old); M.global = old; std.data = clone(old); std.repaint(); }}); } catch (er) { toast(er.message, 'error'); } return; }
            if (b.hasAttribute('data-pfm-save-exc')) { if (!exc.pid || !exc.data) return; try { exc.data.own = true; await write(`person:${exc.pid}`, exc.data); exc.dirty = false; await reloadPeople(); toast(`✓ Exception enregistrée pour ${exc.name}`, 'success'); } catch (er) { toast(er.message, 'error', {retry: () => b.click()}); } return; }
            if (b.hasAttribute('data-pfm-open-exc')) return exc.pid && PF.openPage(exc.pid, 'all');
            if (b.hasAttribute('data-pfm-drop-exc')) return exc.pid && dropPerson(exc.pid);
            if (b.dataset.pfmOpen) return PF.openPage(Number(b.dataset.pfmOpen), 'all');
            if (b.dataset.pfmDrop) return dropPerson(Number(b.dataset.pfmDrop));
        });
    }
    ext.designPanels = ext.designPanels || [];
    ext.designPanels.push(() => {
        setTimeout(() => mount(document.querySelector('[data-pfm-host]')), 0);
        return `<section class="person-block-config" data-pfm-host><header><span class="eyebrow">FICHES PERSONNES</span><h3>Cette personne était… (profils)</h3><p>Les pages des personnes qui ont des profils (artiste, sportif, élu…) : l’ordre, la visibilité, la largeur et la couleur des sections ; l’ordre, la couleur et la visibilité des profils ; les modèles. Le réglage standard vaut pour toutes les pages ; une exception pour une personne ; en bas, les pages personnalisées.</p></header><div data-pfm-body>${UI().spinner ? UI().spinner('Chargement…') : 'Chargement…'}</div></section>`;
    });
    PF.mountMaintenance = mount;
})();
