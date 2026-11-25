/* LCNDA — ☑ La barre de sélection commune (actions groupées) : des cases sur les lignes d'une liste, et une barre
 * « 3 fiches cochées · 🏷 Étiqueter · ★ Ajouter à Mes listes · 🔒 Verrouiller · ⤓ Exporter · 🗑 Supprimer · ✕ Décocher ».
 * Faite pour servir partout (Listes, Personnes, Recherche, Documents…) :
 *
 *   const sel = LCNDA_EXT.selectionBar({
 *       host,                                  // l'élément qui contient les lignes (tableau, cartes…)
 *       rowSelector: '[data-sel-id]',          // une ligne cochable ; son numéro : idOf(el) (par défaut data-sel-id)
 *       what: ['fiche cochée', 'fiches cochées'],
 *       actions: LCNDA_EXT.selectionBar.personActions({after: () => redessiner()}),
 *       key: 'listes:persons',                 // la sélection est gardée (en mémoire) quand la liste est redessinée
 *   });
 *   sel.refresh();   // après avoir redessiné les lignes : les cases reviennent, cochées comme avant
 *   sel.ids();       // les numéros cochés ;  sel.clear() ;  sel.destroy()
 *
 * Une action : {id, icon, label, help, edit (cachée en mode consultation), danger, min (cochées au moins), run(ids, sel)}.
 * Maj + clic coche toutes les lignes entre deux cases. Mode consultation (body.is-kiosk) : seules les actions sans « edit ».
 * Actions toutes prêtes : personActions, eventActions, labelAction(type), exportAction(), deleteAction(…).
 * Serveur : POST listes_plus_write (lib/listes_plus.php) ; chaque action a son « ↶ Annuler ».
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const kiosk = () => document.body.classList.contains('is-kiosk');
    const toast = (m, k, o) => A().toast?.(m, k, o);
    const post = async body => { const r = await A().api('listes_plus_write', {}, {method: 'POST', body}); return r?.result ?? r ?? {}; };
    const kept = new Map(); // key → Set des numéros cochés (la liste redessinée les retrouve)

    function selectionBar(o = {}) {
        const host = o.host; if (!host) return null;
        const rowSel = o.rowSelector || '[data-sel-id]';
        const idOf = o.idOf || (el => el.dataset.selId);
        const [one, many] = o.what || [T('ligne cochée'), T('lignes cochées')];
        const set = o.key ? (kept.get(o.key) || kept.set(o.key, new Set()).get(o.key)) : new Set();
        let lastClicked = null;
        const bar = document.createElement('div');
        bar.className = 'sel-bar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', T('Sélection'));
        const rows = () => [...host.querySelectorAll(rowSel)].filter(r => !r.hidden);
        // 🧺 « Au panier » et 📍 « Mettre dans… » (heritage-connexions.js) : ajoutées à chaque barre ; kind = la sorte des lignes (person, event, note, source, media…)
        if (!o.kind) o.kind = (o.actions || []).find(a => a && a._kind)?._kind || '';
        const actions = () => [...(o.actions || []), ...(selectionBar.extraActions || []).flatMap(f => { try { return f(o) || []; } catch (_) { return []; } })].filter(a => a && !(a.edit && kiosk()));
        function paint() {
            const n = set.size, all = rows(), on = all.filter(r => set.has(String(idOf(r)))).length;
            const acts = actions();
            bar.classList.toggle('has-sel', n > 0);
            bar.innerHTML = `<label class="sel-all checkbox-line"><input type="checkbox" data-sel-all${all.length && on === all.length ? ' checked' : ''}${on && on < all.length ? ' data-mixed' : ''} aria-label="${esc(T('Tout cocher'))}"> <span>${n ? esc(`${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`) : esc(T('Tout cocher'))}</span></label>`
                + (n ? `<span class="sel-acts">${acts.map((a, i) => `<button type="button" class="button small ${a.danger ? 'secondary danger' : 'secondary'}" data-sel-act="${i}"${(a.min || 1) > n ? ' disabled' : ''} title="${esc(a.help || a.label)}">${esc(a.icon ? `${a.icon} ${a.label}` : a.label)}</button>`).join('')}<button type="button" class="link-button" data-sel-clear>${esc(T('✕ Décocher'))}</button></span>` : '');
            const allBox = bar.querySelector('[data-sel-all]'); if (allBox && allBox.hasAttribute('data-mixed')) allBox.indeterminate = true;
            o.onChange?.(ids());
        }
        function attach() {
            if (o.prune !== false) { const here = new Set(rows().map(r => String(idOf(r)))); [...set].forEach(id => { if (!here.has(id)) set.delete(id); }); } // une ligne partie (supprimée, filtrée) n'est plus cochée
            rows().forEach(r => {
                const id = String(idOf(r)); let box = r.querySelector(':scope [data-sel-check]');
                if (!box) {
                    const cell = r.matches('tr') ? r.querySelector('td') : r;
                    if (!cell) return;
                    const lab = document.createElement('label'); lab.className = 'sel-box'; lab.dataset.ctxSkip = '';
                    lab.innerHTML = `<input type="checkbox" data-sel-check aria-label="${esc(T('Cocher cette ligne'))}">`;
                    cell.prepend(lab); box = lab.firstChild;
                }
                box.checked = set.has(id); r.classList.toggle('is-sel', box.checked);
            });
            paint();
        }
        function ids() { return [...set]; }
        function toggle(r, on) { const id = String(idOf(r)); if (on) set.add(id); else set.delete(id); const b = r.querySelector('[data-sel-check]'); if (b) b.checked = on; r.classList.toggle('is-sel', on); }
        host.addEventListener('click', e => {
            const box = e.target.closest?.('[data-sel-check]'); if (!box) { if (e.target.closest?.('.sel-box')) e.stopPropagation(); return; }
            e.stopPropagation();
            const r = box.closest(rowSel); if (!r) return;
            const all = rows();
            if (e.shiftKey && lastClicked && all.includes(lastClicked)) { const a = all.indexOf(lastClicked), b = all.indexOf(r); all.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(x => toggle(x, box.checked)); }
            else toggle(r, box.checked);
            lastClicked = r; paint();
        }, true);
        bar.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.matches('[data-sel-clear]')) { clear(); return; }
            const a = actions()[Number(b.dataset.selAct)]; if (!a) return;
            b.disabled = true;
            try { await a.run(ids(), api); } catch (err) { toast(err?.message || String(err), 'error'); } finally { b.disabled = false; }
        });
        bar.addEventListener('change', e => { if (!e.target.matches('[data-sel-all]')) return; const on = e.target.checked; rows().forEach(r => toggle(r, on)); paint(); });
        function clear() { set.clear(); attach(); }
        const api = {el: bar, ids, clear, refresh: attach, set: list => { set.clear(); (list || []).forEach(x => set.add(String(x))); attach(); }, rows: () => rows().filter(r => set.has(String(idOf(r)))), destroy: () => { bar.remove(); }, host};
        if (o.place !== false) (o.place || host).before(bar);
        attach();
        return api;
    }

    /* ─────────── actions toutes prêtes ─────────── */
    const plural = (n, one, many) => (A().plural ? A().plural(n, one, many) : `${n} ${n > 1 ? (many || one + 's') : one}`);
    async function pickDialog({eyebrow, title, body, submitLabel}) {
        const D = ext.openDialog;
        return new Promise(resolve => {
            if (!D) { resolve(null); return; }
            let done = false;
            D({eyebrow, title, body, submitLabel, onSubmit: f => { done = true; resolve(Object.fromEntries(new FormData(f))); }, onOpen: d => d.addEventListener('close', () => { if (!done) resolve(null); })});
        });
    }
    function labelAction(type = 'person', {after} = {}) {
        return {id: 'label', _kind: type, icon: '🏷', label: T('Étiqueter'), help: T('Poser une étiquette sur toutes les lignes cochées'), edit: true, run: async ids => {
            let labels = []; try { labels = (await A().api('labels')).labels || []; } catch (_) {}
            const v = await pickDialog({eyebrow: T('ÉTIQUETER'), title: T('Une étiquette pour {n}', {n: plural(ids.length, T('ligne cochée'), T('lignes cochées'))}), submitLabel: T('Étiqueter'),
                body: `<div class="form-grid one-column">${labels.length ? `<label>${esc(T('Étiquette existante'))}<select name="label_id"><option value="">${esc(T('— Une nouvelle —'))}</option>${labels.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select></label>` : ''}<label>${esc(T('Ou une nouvelle étiquette'))}<input name="label_name" maxlength="100" placeholder="${esc(T('ex. À vérifier aux archives'))}"></label></div>`});
            if (!v) return;
            const r = await post({op: 'label_add', entity_type: type, ids, label_id: v.label_id || 0, label_name: v.label_name || ''});
            await after?.();
            A().undoToast?.(T('Étiquette posée sur {n}', {n: plural(r.added.length, T('ligne'))}) + (r.skipped ? ` ${T('({n} verrouillées laissées de côté)', {n: r.skipped})}` : ''), {
                undo: async () => { await post({op: 'label_remove', entity_type: type, ids: r.added, label_id: r.label_id, drop_label: r.created ? 1 : 0}); await after?.(); },
                redo: async () => { await post({op: 'label_add', entity_type: type, ids: r.added, label_id: r.label_id}); await after?.(); }});
        }};
    }
    function myListAction({after} = {}) {
        return {id: 'mylist', _kind: 'person', icon: '★', label: T('Ajouter à Mes listes'), help: T('Ajouter les fiches cochées à une de « Mes listes »'), edit: true, run: async ids => {
            let lists = []; try { lists = ((await A().api('my_lists')).lists || []).filter(l => l.source === 'persons'); } catch (_) {}
            if (!lists.length) { toast(T('Aucune de « Mes listes » ne contient des personnes : crée-en une dans Listes → Mes listes.')); return; }
            const v = await pickDialog({eyebrow: T('MES LISTES'), title: T('Ajouter {n} à une liste', {n: plural(ids.length, T('fiche'))}), submitLabel: T('Ajouter'),
                body: `<div class="form-grid one-column"><label>${esc(T('Liste'))}<select name="list_id" required>${lists.map(l => `<option value="${l.id}">${esc(`${l.icon || '📋'} ${l.name}`)}</option>`).join('')}</select></label></div>`});
            if (!v) return;
            const r = await post({op: 'mylist_add', list_id: Number(v.list_id), ids});
            await after?.();
            const name = lists.find(l => String(l.id) === String(v.list_id))?.name || '';
            A().undoToast?.(T('{n} ajoutées à « {list} »', {n: plural(r.count, T('fiche')), list: name}), {undo: async () => { await post({op: 'mylist_restore', list_id: Number(v.list_id), before: r.before}); await after?.(); },
                redo: async () => { await post({op: 'mylist_add', list_id: Number(v.list_id), ids}); await after?.(); }});
        }};
    }
    function lockAction(locked, {after} = {}) {
        return {id: locked ? 'lock' : 'unlock', icon: locked ? '🔒' : '🔓', label: locked ? T('Verrouiller') : T('Déverrouiller'), help: locked ? T('Plus rien ne pourra changer sur ces fiches tant qu’elles sont verrouillées') : T('Ces fiches pourront de nouveau être modifiées'), edit: true, run: async ids => {
            const r = await post({op: 'lock', ids, locked: locked ? 1 : 0});
            await after?.();
            A().undoToast?.(locked ? T('{n} verrouillées', {n: plural(r.count, T('fiche'))}) : T('{n} déverrouillées', {n: plural(r.count, T('fiche'))}), {undo: async () => { await post({op: 'lock_restore', before: r.before}); await after?.(); },
                redo: async () => { await post({op: 'lock', ids, locked: locked ? 1 : 0}); await after?.(); }});
        }};
    }
    /** ⤓ Exporter la sélection : les lignes cochées, telles qu'affichées (CSV pour le tableur) */
    function exportAction({name = 'selection', rowsOf = null} = {}) {
        return {id: 'export', icon: '⤓', label: T('Exporter'), help: T('Les lignes cochées dans un fichier CSV (tableur)'), run: async (ids, sel) => {
            const text = c => (c.innerText || c.textContent || '').replace(/[↑↓]/g, '').replace(/\s+/g, ' ').trim();
            let m = rowsOf ? rowsOf(ids) : null;
            if (!m) {
                const picked = sel.rows(); const table = picked[0]?.closest('table');
                const head = table?.tHead ? [...table.tHead.rows[0].cells].map(text) : [];
                const keep = head.map((h, i) => i).filter(i => head[i] !== '' || picked.some(r => text(r.cells?.[i] || {}) !== ''));
                m = table ? [keep.map(i => head[i] || T('Colonne {n}', {n: i + 1})), ...picked.map(r => keep.map(i => text(r.cells[i] || {})))] : [[T('Ligne')], ...picked.map(r => [text(r)])];
            }
            const cell = v => (A().csvCell ? A().csvCell(v, {sep: ';'}) : `"${String(v ?? '').replace(/"/g, '""')}"`);
            const csv = '﻿' + m.map(r => r.map(cell).join(';')).join('\r\n');
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
            a.download = `${A().safeExportFilename ? A().safeExportFilename(name, 'selection') : name}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
            toast(T('{n} exportées.', {n: plural(m.length - 1, T('ligne'))}));
        }};
    }
    /** 🗑 tout de suite, puis « ↶ Annuler » (chaque suppression est gardée dans le journal) */
    function deleteAction(kind, {after} = {}) {
        const isP = kind === 'person';
        return {id: 'delete', icon: '🗑', label: T('Supprimer'), help: isP ? T('Supprime les fiches cochées ; « ↶ Annuler » les remet') : T('Supprime les lignes cochées ; « ↶ Annuler » les remet'), edit: true, danger: true, run: async (ids, sel) => {
            const r = await post({op: isP ? 'delete_persons' : 'delete_events', ids});
            sel.clear(); await after?.();
            const n = r.deleted.length, changeIds = r.deleted.map(x => x.change_id);
            if (r.skipped.length) toast(T('{n} laissées de côté : {why}', {n: r.skipped.length, why: r.skipped[0].why}), 'error');
            if (!n) return;
            A().undoToast?.(isP ? T('{n} supprimées', {n: plural(n, T('fiche'))}) : T('{n} supprimés', {n: plural(n, T('événement'))}), {
                undo: async () => { await post({op: isP ? 'restore_persons' : 'restore_events', change_ids: changeIds}); await after?.(); }});
        }};
    }
    const personActions = (o = {}) => [labelAction('person', o), myListAction(o), lockAction(true, o), lockAction(false, o), exportAction({name: o.name || T('fiches')}), deleteAction('person', o)];
    const eventActions = (o = {}) => [labelAction('event', o), exportAction({name: o.name || T('événements')}), deleteAction('event', o)];

    selectionBar.labelAction = labelAction; selectionBar.myListAction = myListAction; selectionBar.lockAction = lockAction;
    selectionBar.exportAction = exportAction; selectionBar.deleteAction = deleteAction;
    selectionBar.personActions = personActions; selectionBar.eventActions = eventActions;
    selectionBar.post = post;
    ext.selectionBar = selectionBar;
})();
