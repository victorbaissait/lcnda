/* LCNDA — 📥 À trier : les photos envoyées par un téléphone de terrain (maquette docs/design/telephone-wifi.html, partie 5 ;
 * serveur lib/telephone_wifi.php ; la page du téléphone : app-terrain.js).
 *  - Listes → Médias et documents → « 📥 À trier » ; pastille « 📥 N » dans la barre du haut (réglage) ;
 *  - barre de liste H10 : 🔍 Chercher (texte, téléphone, personne), Filtrer ▾ (À trier, 🗑 Supprimées, Reliées), Liste | Fiches, Trier ;
 *  - chaque photo : « 🔗 Relier à <la personne proposée> », « Relier à… » (une personne, un événement, une source, la visite : menu
 *    de choix unique), ⋯ ou clic droit → le menu d'actions (UI.contextMenu) ; cases à cocher pour relier ou supprimer en lot ;
 *  - tout se défait avec « ↶ Annuler » ; une photo supprimée reste 30 jours dans « 🗑 Supprimées » (réglage), puis est effacée ;
 *  - rien n'est écrit sur une fiche sans un clic : même la personne proposée par le téléphone n'est qu'une suggestion ;
 *  - le texte du téléphone est TOUJOURS posé comme du texte (esc) ; mode consultation : la boîte se lit, rien ne se relie. */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (_, k) => (v && k in v ? v[k] : `{${k}}`)));
    const pl = (n, one) => (window.LCNDA_I18N?.plural ? window.LCNDA_I18N.plural(n, one) : `${n} ${one}${n > 1 ? 's' : ''}`);
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.lists = ext.lists || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const LIST = 'a_trier';
    const S = () => A().state;
    const toast = (m, k, o) => A()?.toast?.(m, k, o);
    const g = () => (typeof window.LCNDA_GENEALOGY === 'string' ? `&g=${encodeURIComponent(window.LCNDA_GENEALOGY)}` : '');
    const fileUrl = (id, o = '') => `api.php?action=inbox_file&id=${Number(id)}${o}${g()}`;
    const GUEST = () => !!window.LCNDA_GUEST;
    let DATA = null, picked = new Set();

    function addList() {
        const app = A();
        if (app?.defaultListTypes && !app.defaultListTypes.some(x => x[0] === LIST)) app.defaultListTypes.push([LIST, '04a0', '📥 À trier']);
    }
    addList(); document.addEventListener('DOMContentLoaded', addList, {once: true});
    const isHere = token => token === S().workspaceToken && S().module === 'listes' && S().listType === LIST;
    const write = (op, body = {}) => A().api('inbox_write', {}, {method: 'POST', body: {op, ...body}});

    function openList() { document.querySelectorAll('dialog[open]').forEach(d => { if (!d.classList.contains('is-full')) d.close(); }); S().listType = LIST; A().setModule('listes'); }
    ext.aTrier = {open: openList, refresh: () => pill()};

    /* ═════ la page ═════ */
    async function render(token) {
        const ws = document.getElementById('workspace'); if (!ws || !isHere(token)) return;
        if (GUEST()) { ws.innerHTML = `<section class="page">${UI().pageHeader({title: i18n('📥 À trier')})}${UI().notice('info', i18n('Ce réglage ne se change que sur l’ordinateur principal : cet appareil est un appareil invité, en lecture seule.'))}</section>`; return; }
        ws.innerHTML = `<section class="page tw-box" data-tw-page>${UI().pageHeader({title: i18n('📥 À trier'), where: i18n('Listes · Médias et documents'),
            help: esc(i18n('Les photos envoyées par un téléphone de terrain arrivent ici, hors de l’arbre. Relie chacune à ce qu’elle montre, ou supprime-la.')),
            more: [`<button type="button" data-tw-settings>${esc(i18n('⚙️ Réglages de cet outil'))}</button>`, `<button type="button" data-tw-log>${esc(i18n('📜 Qui a vu quoi'))}</button>`]})}
            <div data-tw-bar></div><div data-tw-bulk></div><div data-tw-list>${UI().spinner(i18n('Chargement…'))}</div></section>`;
        const root = ws.querySelector('[data-tw-page]');
        root.querySelector('[data-tw-settings]')?.addEventListener('click', () => ext.openReseauLocal?.());
        root.querySelector('[data-tw-log]')?.addEventListener('click', () => ext.openAccessLog?.());
        const bar = UI().listBar({key: 'listes:a_trier', search: {placeholder: i18n('Chercher… (texte, téléphone, personne)')},
            filters: [{id: 'view', label: i18n('Afficher'), type: 'radio', options: [['box', i18n('À trier')], ['deleted', i18n('🗑 Supprimées')], ['linked', i18n('Reliées')]], dflt: 'box'}],
            view: {dflt: 'cards', what: 'photos'}, sort: {options: [['recent', i18n('Les plus récentes')], ['old', i18n('Les plus anciennes')]], value: 'recent'}, count: true,
            onChange: (_st, o) => { if (o?.what === 'filter') { picked.clear(); load(); } else paint(); }});
        root.querySelector('[data-tw-bar]').appendChild(bar);
        const load = async () => {
            try { DATA = await A().api('inbox_list', {view: bar.state.filters.view || 'box'}); } catch (e) { if (isHere(token)) root.querySelector('[data-tw-list]').innerHTML = UI().notice('error', e.message); return; }
            if (isHere(token)) { paint(); pill(DATA.counts.box); }
        };
        const view = () => bar.state.filters.view || 'box';
        const ro = () => !!DATA?.kiosk;
        const rowOf = id => (DATA?.rows || []).find(r => r.id === Number(id));
        function lines(r) {
            const who = r.for ? (r.for_kind === 'visit' ? i18n('visite {name}', {name: r.for}) : i18n('pour {name}', {name: r.for})) : i18n('personne pas choisie');
            const out = [`📱 ${r.device}`, who];
            if (r.gps) out.push(r.gps_kept ? i18n('📍 GPS gardé') : i18n('📍 GPS retiré'));
            if (r.status === 'linked' && r.link) out.push(i18n('🔗 reliée à {name}', {name: r.link}));
            if (r.status === 'deleted' && r.deleted) { const until = new Date(new Date(r.deleted).getTime() + (DATA.settings.suppr === 'direct' ? 10e3 : DATA.trash_days * 86400e3)); out.push(i18n('effacée pour de bon le {date}', {date: until.toLocaleDateString(window.LCNDA_I18N?.locale?.() || undefined)})); }
            return out;
        }
        function paint() {
            if (!DATA) return;
            const st = bar.state, q = String(st.q || '').trim();
            let rows = DATA.rows.filter(r => !q || (UI().listMatch?.text ? UI().listMatch.text(q, `${r.note} ${r.device} ${r.for} ${r.link}`) : `${r.note} ${r.device} ${r.for}`.toLowerCase().includes(q.toLowerCase())));
            rows = st.sort === 'old' ? rows.slice().reverse() : rows;
            bar.setCount?.(`${pl(rows.length, 'photo')} · ${view() === 'box' ? i18n('À trier') : view() === 'deleted' ? i18n('🗑 Supprimées') : i18n('Reliées')}`);
            const items = rows.map(r => {
                const acts = view() === 'box' && !ro() ? `${r.for_kind ? `<button type="button" class="button small" data-tw-quick="${r.id}">${esc(r.for_kind === 'visit' ? i18n('🗄 Relier à la visite') : i18n('🔗 Relier à {name}', {name: r.for}))}</button>` : ''}
                    <button type="button" class="button small secondary" data-tw-to="${r.id}">${esc(i18n('Relier à…'))}</button>` : view() === 'deleted' && !ro() ? `<button type="button" class="button small secondary" data-tw-restore="${r.id}">${esc(i18n('Remettre'))}</button>` : '';
                const more = view() === 'box' && !ro() ? `<button type="button" class="icon-button small" data-tw-more="${r.id}" title="${esc(i18n('Plus d’actions'))}" aria-label="${esc(i18n('Plus d’actions'))}">⋯</button>` : '';
                const all = `${acts}${more}`;
                // en fiches, les boutons restent visibles (quick) : « ⋯ » est déjà le nôtre (le menu d'actions)
                return {name: r.note || i18n('(sans texte)'), cls: picked.has(r.id) ? 'is-sel' : '', attrs: `data-tw-row="${r.id}"`, when: r.at,
                    thumb: `<img src="${esc(fileUrl(r.id, '&thumb=1'))}" alt="" loading="lazy">`, open: `data-tw-big="${r.id}"`, lines: lines(r),
                    ...(st.view === 'cards' ? {quick: `<span class="tw-acts">${all}</span>`, noOpen: true} : {actions: all})};
            });
            const box = root.querySelector('[data-tw-list]');
            box.innerHTML = !DATA.rows.length ? A().empty(view() === 'box' ? i18n('Rien à trier : les photos du téléphone arriveront ici.') : i18n('Rien ici.'), {icon: '📥'})
                : items.length ? (st.view === 'cards' ? UI().cardsHtml(items) : UI().rowsHtml(items)) : `<p class="empty-line">🔍 ${esc(i18n('Rien ne correspond.'))}</p>`;
            box.querySelectorAll('.ui-row-name, .ui-card-name, .ui-row-main small, .ui-card-body small').forEach(n => n.setAttribute('data-i18n-off', ''));
            if (ro()) box.insertAdjacentHTML('afterbegin', UI().notice('info', i18n('Mode consultation : la boîte se lit, mais rien ne se relie ni ne se supprime.')));
            paintBulk();
        }
        // ☑ la barre de sélection commune (app-selection.js) : Tout cocher, Maj+clic, 🔗 Relier…, 🗑 Supprimer, ✕ Décocher
        let selBar = null;
        function paintBulk() {
            selBar?.destroy(); selBar = null;
            const box = root.querySelector('[data-tw-list]');
            if (view() !== 'box' || ro() || !ext.selectionBar || !box?.querySelector('[data-tw-row]')) return;
            const keep = [...picked].filter(id => rowOf(id)).map(String);
            selBar = ext.selectionBar({host: box, rowSelector: '[data-tw-row]', idOf: el => el.dataset.twRow, what: [i18n('photo cochée'), i18n('photos cochées')], place: root.querySelector('[data-tw-bulk]'),
                onChange: ids => { picked = new Set(ids.map(Number)); },
                actions: [
                    {id: 'link', icon: '🔗', label: i18n('Relier…'), edit: true, run: ids => { const n = ids.map(Number), b = selBar?.el.querySelector('[data-sel-act="0"]'); const items = [{label: i18n('👤 Une personne…'), run: () => linkTo(n, 'person')}, {label: i18n('📅 Un événement… (inhumation, mariage…)'), run: () => linkTo(n, 'event')}, {label: i18n('📚 Une source… (l’acte, la cote)'), run: () => linkTo(n, 'source')}]; if (b && UI().menuAt) UI().menuAt(b, items); else items[0].run(); }},
                    {id: 'delete', icon: '🗑', label: i18n('Supprimer'), edit: true, danger: true, run: ids => remove(ids.map(Number))},
                ]});
            selBar?.set(keep);
        }

        /* ─── les gestes ─── */
        async function link(ids, kind, target, title = '') {
            const r0 = rowOf(ids[0]);
            const keep = DATA.settings.gps === 'relier' && ids.some(id => rowOf(id)?.gps_kept) ? await A().confirmBox({title: i18n('📍 Garder la position GPS ?'), message: i18n('La photo contient une position GPS (utile pour situer une tombe). La garder pour la carte ?'), okLabel: i18n('Garder'), cancelLabel: i18n('La retirer'), danger: false}) : false;
            let r;
            try { r = await write('link', {ids, kind, target, keep_gps: !!keep}); } catch (e) { toast(e.message, 'error'); return; }
            const done = (r.linked || []).map(x => x.id);
            picked.clear();
            toast(i18n('✓ Reliées à {name} : {n}', {name: r.label || title, n: pl(done.length, 'photo')}), '', {kind: 'undo', action: {label: i18n('↶ Annuler'), run: async () => { try { await write('unlink', {ids: done}); toast(i18n('Annulé'), 'success'); } catch (e) { toast(e.message, 'error'); } load(); }}});
            if (r.tomb && r.kind === 'person' && r.burial_type) {
                toast(i18n('🪦 Une photo de tombe : ajouter aussi l’inhumation à {name} ?', {name: r.label}), '', {action: {label: i18n('＋ Ajouter'), run: async () => {
                    try { const ev = await A().api('add_event', {}, {method: 'POST', body: {person_id: r.target, event_type_id: r.burial_type, date_text: ''}});
                        toast(i18n('✓ Inhumation ajoutée à {name}.', {name: r.label}), '', {kind: 'undo', action: {label: i18n('↶ Annuler'), run: () => A().api('delete_event', {}, {method: 'POST', body: {id: ev.id}}).catch(e => toast(e.message, 'error'))}});
                    } catch (e) { toast(e.message, 'error'); }
                }}});
            }
            void r0; load();
        }
        async function linkTo(ids, kind) {
            const P = window.LCNDA_PICKER || A();
            if (kind === 'visit') { const v = rowOf(ids[0]); if (v?.for_kind === 'visit') return link(ids, 'visit', v.for_id, v.for); return; }
            const title = {person: i18n('Relier à une personne'), event: i18n('Relier à un événement'), source: i18n('Relier à une source')}[kind];
            const r0 = rowOf(ids[0]);
            const it = await P.openPicker({kind, title, ...(kind === 'person' && r0?.for_kind === 'person' ? {query: ''} : {})});
            if (it && it.id) link(ids, kind, Number(it.id), it.title || '');
        }
        async function remove(ids) {
            let r; try { r = await write('delete', {ids}); } catch (e) { toast(e.message, 'error'); return; }
            picked.clear();
            const n = r.deleted || 0;
            toast(DATA.settings.suppr === 'direct' ? i18n('✓ Supprimées : {n}', {n: pl(n, 'photo')}) : i18n('✓ Supprimées : {n}. Gardées 30 jours dans « 🗑 Supprimées » (Filtrer ▾).', {n: pl(n, 'photo')}), 'success',
                {action: {label: i18n('↶ Annuler'), run: async () => { try { await write('restore', {ids}); } catch (e) { toast(e.message, 'error'); } load(); }}});
            load();
        }
        function bigView(r) {
            const dl = document.createElement('dialog'); dl.className = 'modal h-modal tw-big-dialog';
            dl.innerHTML = `<div class="modal-head"><div><span class="eyebrow">📥 ${esc(i18n('À trier'))}</span><h2 data-i18n-off>${esc(r.note || i18n('(sans texte)'))}</h2></div><button type="button" class="icon-button" data-x aria-label="${esc(i18n('Fermer'))}">×</button></div>
                <div class="h-dialog-body"><img class="tw-big-img" src="${esc(fileUrl(r.id))}" alt=""><p class="muted" data-i18n-off>${esc(lines(r).join(' · '))}</p></div>`;
            document.body.appendChild(dl); dl.addEventListener('close', () => dl.remove()); dl.querySelector('[data-x]').addEventListener('click', () => dl.close()); dl.showModal();
        }
        function editNote(r) {
            const dl = document.createElement('dialog'); dl.className = 'modal h-modal';
            dl.innerHTML = `<form method="dialog"><div class="modal-head"><h2>${esc(i18n('✎ Modifier le texte'))}</h2><button type="button" class="icon-button" data-x aria-label="${esc(i18n('Fermer'))}">×</button></div>
                <div class="h-dialog-body"><input name="note" maxlength="200" class="tw-note-in" aria-label="${esc(i18n('✎ Modifier le texte'))}"></div>
                <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>${esc(i18n('Annuler'))}</button><button type="submit" class="button">${esc(i18n('Enregistrer'))}</button></div></form>`;
            document.body.appendChild(dl);
            const inp = dl.querySelector('input'); inp.value = r.note; // posé comme une valeur, jamais comme du HTML
            dl.addEventListener('close', () => dl.remove());
            dl.querySelectorAll('[data-x]').forEach(x => x.addEventListener('click', () => dl.close()));
            dl.querySelector('form').addEventListener('submit', async e => {
                e.preventDefault(); const prev = r.note; dl.close();
                try { await write('note', {id: r.id, note: inp.value}); } catch (err) { toast(err.message, 'error'); return; }
                toast(i18n('Texte enregistré'), '', {kind: 'undo', action: {label: i18n('↶ Annuler'), run: async () => { await write('note', {id: r.id, note: prev}).catch(() => {}); load(); }}});
                load();
            });
            dl.showModal(); inp.focus();
        }
        function menuItems(r) {
            const it = [{label: i18n('Relier à'), heading: true},
                {label: i18n('👤 Une personne…'), run: () => linkTo([r.id], 'person')},
                {label: i18n('📅 Un événement… (inhumation, mariage…)'), run: () => linkTo([r.id], 'event')},
                {label: i18n('📚 Une source… (l’acte, la cote)'), run: () => linkTo([r.id], 'source')}];
            if (r.for_kind === 'visit') it.push({label: i18n('🗄 La visite d’archives proposée'), run: () => linkTo([r.id], 'visit')});
            it.push({label: i18n('Photo'), heading: true}, {label: i18n('🔍 Ouvrir en grand'), run: () => bigView(r)}, {label: i18n('✎ Modifier le texte'), run: () => editNote(r)},
                {label: i18n('⟲ Tourner'), run: async () => { try { await write('rotate', {id: r.id, dir: 'left'}); load(); } catch (e) { toast(e.message, 'error'); } }},
                {label: i18n('⤓ Exporter l’original'), run: () => { const a = document.createElement('a'); a.href = fileUrl(r.id, '&download=1'); a.download = ''; document.body.appendChild(a); a.click(); a.remove(); }},
                {label: i18n('🗑 Supprimer'), danger: true, run: () => remove([r.id])});
            return it.filter(x => !x.heading);
        }
        const sig = A().listControllerSignal?.();
        root.addEventListener('click', e => {
            const t = e.target;
            const q = t.closest('[data-tw-quick]'); if (q) { const r = rowOf(q.dataset.twQuick); if (r) link([r.id], r.for_kind, r.for_id, r.for); return; }
            const to = t.closest('[data-tw-to]'); if (to) { const r = rowOf(to.dataset.twTo); if (r && UI().contextMenu) UI().contextMenu(e, menuItems(r).slice(0, r.for_kind === 'visit' ? 4 : 3)); return; }
            const m = t.closest('[data-tw-more]'); if (m) { const r = rowOf(m.dataset.twMore); if (r && UI().contextMenu) UI().contextMenu(e, menuItems(r)); return; }
            const big = t.closest('[data-tw-big]'); if (big) { const r = rowOf(big.dataset.twBig); if (r) bigView(r); return; }
            const rs = t.closest('[data-tw-restore]'); if (rs) { write('restore', {ids: [Number(rs.dataset.twRestore)]}).then(() => { toast(i18n('Remise dans 📥 À trier.'), 'success'); load(); }).catch(err => toast(err.message, 'error')); return; }
        }, {signal: sig});
        // clic droit : le même menu d'actions que « ⋯ »
        root.addEventListener('contextmenu', e => { const row = e.target.closest('[data-tw-row]'); if (!row || view() !== 'box' || ro()) return; const r = rowOf(row.dataset.twRow); if (r && UI().contextMenu) UI().contextMenu(e, menuItems(r)); }, {signal: sig});
        root.addEventListener('keydown', e => { if ((e.key === 'Delete' || e.key === 'Backspace') && picked.size && !e.target.closest('input,textarea')) { e.preventDefault(); remove([...picked]); } }, {signal: sig});
        load();
    }
    ext.lists[LIST] = token => render(token);

    /* ═════ la pastille 📥 N dans la barre du haut ═════ */
    let last = -1;
    async function pill(known) {
        if (GUEST()) return;
        let d = null;
        if (typeof known === 'number') d = {box: known, pastille: DATA?.settings?.pastille || 'oui', arrivee: DATA?.settings?.arrivee || 'pastille'};
        else { try { d = await A().api('inbox_count'); } catch (_) { return; } }
        const meta = document.querySelector('.topbar-meta'); if (!meta) return;
        let b = meta.querySelector('#tw-pill');
        if (last >= 0 && d.box > last && d.arrivee === 'message') toast(i18n('📥 Arrivées du téléphone : {n}', {n: pl(d.box - last, 'photo')}), '', {action: {label: i18n('Voir'), run: openList}});
        last = d.box;
        if (d.pastille !== 'oui' || !d.box) { b?.remove(); return; }
        if (!b) { b = document.createElement('button'); b.type = 'button'; b.id = 'tw-pill'; b.className = 'screen-tool tw-pill'; b.addEventListener('click', openList); meta.insertBefore(b, meta.querySelector('#rl-pill') || meta.querySelector('#genealogy-switch') || null); }
        b.textContent = `📥 ${d.box}`;
        b.title = i18n('📥 À trier : {n}', {n: pl(d.box, 'photo')}); b.setAttribute('aria-label', b.title);
    }
    function start() {
        if (GUEST() || !window.GENEALOGY_READY) return;
        setTimeout(() => pill(), 1500);
        window.lcnda?.reseau?.onEvent?.(e => { if (e && e.type === 'deposit') { clearTimeout(start.t); start.t = setTimeout(() => { pill(); if (S()?.module === 'listes' && S().listType === LIST && !document.querySelector('.tw-box :focus-within input[type=search]')) render(++S().workspaceToken); }, 800); } });
        setInterval(() => { if (document.visibilityState === 'visible') pill(); }, 120000);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
})();
