/**
 * 🌍 Le monde autour — la vie d'un ancêtre à côté des grands événements (guerres, épidémies, lois, inventions, régimes)
 * et de l'histoire locale. Données : assets/data/monde-autour.json (livré, source de chaque événement) + mes événements
 * (table history_events) ; calcul : lib/monde_autour.php (GET world_around, world_events ; POST save_history_event,
 * delete_history_event).
 *  - bloc de fiche « 🌍 Le monde autour » : filtres par sorte, frise de la vie, « Jean a 19 ans quand la guerre de 1870 commence » ;
 *  - Chronologie : la colonne « Contexte » (frise historique) prend ces événements (app-chronologie.js → ext.worldTimeline) ;
 *  - Listes → Histoire → « 🌍 Le monde autour » : toute la liste, ses sources, et mes événements (＋ Nouvel événement).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.personBlocks = ext.personBlocks || {};
    ext.lists = ext.lists || {};
    const esc = v => A().escapeHtml(v ?? '');
    const api = (...a) => A().api(...a);
    const post = async (action, body) => { const r = await A().api(action, {}, {method: 'POST', body}); return r?.result ?? r ?? {}; };
    const toast = (...a) => A().toast(...a);
    const S = () => A().state;
    const REACH = [['commune', '📍 La commune seulement'], ['departement', '🗺 Tout son département'], ['france', '🇫🇷 Toute la France'], ['monde', '🌍 Le monde']];
    const ls = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    let CATS = {};
    const catOf = c => CATS[c] || {icon: '•', label: c, color: '#777'};
    const yrs = e => e.to > e.from ? `${e.from}–${e.to}` : String(e.from);
    const srcLink = e => e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.src || 'Source')} ↗</a>` : esc(e.src || '');

    /* ─────────── le bloc de la fiche ─────────── */
    ext.personBlocks.world = (index, detail) => {
        const pid = Number(detail.person?.id) || 0;
        if (!pid || detail.person?.kind === 'animal') return '';
        return A().card(index, '🌍 Le monde autour', '', `<div class="h-world" data-world-host="${pid}">${UI().spinner ? UI().spinner('On cherche ce qui se passait autour…') : ''}</div>`, 'span-12',
            `<button type="button" class="button small secondary" data-world-new="${pid}" title="Une fête, une inondation, un incendie au village… rattaché à une commune">＋ Ajouter un événement local</button>`);
    };

    function frise(d, list) {
        const [a, b] = d.span, W = 1000, H = 54, x = y => 20 + (y - a) / Math.max(1, b - a) * (W - 40);
        const ticks = []; for (let y = Math.ceil(a / 10) * 10; y <= b; y += (b - a > 120 ? 20 : 10)) ticks.push(`<text x="${x(y)}" y="${H - 2}" font-size="11" text-anchor="middle" fill="currentColor" opacity=".6">${y}</text>`);
        const bars = list.map(e => { const c = catOf(e.cat).color, x1 = x(Math.max(a, e.from)), x2 = x(Math.min(b, e.to)); return `<rect x="${x1}" y="${e.hit === 'local' ? 6 : 14}" width="${Math.max(3, x2 - x1)}" height="10" rx="2" fill="${esc(c)}" opacity=".75"><title>${esc(yrs(e) + ' · ' + e.title)}</title></rect>`; }).join('');
        const life = `<line x1="${x(a)}" y1="34" x2="${x(b)}" y2="34" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>${d.person.birth ? `<circle cx="${x(d.person.birth)}" cy="34" r="5" fill="currentColor"><title>Naissance ${d.person.birth}</title></circle>` : ''}${d.person.death ? `<circle cx="${x(d.person.death)}" cy="34" r="5" fill="#111" stroke="currentColor"><title>Décès ${d.person.death}</title></circle>` : ''}`;
        return `<svg class="h-world-frise" viewBox="0 0 ${W} ${H}" role="img" aria-label="Frise de la vie de ${esc(d.person.first)} (${a}–${b}) et des événements">${bars}${life}${ticks.join('')}</svg>`;
    }

    function rowHtml(e, withAge = true) {
        const c = catOf(e.cat);
        return `<li class="h-world-row${e.hit === 'local' ? ' is-local' : ''}" style="--world-c:${esc(c.color)}"><span class="h-world-year">${esc(yrs(e))}</span><span class="h-world-ico" aria-hidden="true">${c.icon}</span>
            <div class="h-world-txt"><strong>${esc(e.title)}</strong>${e.hit === 'local' ? ` ${UI().badge ? UI().badge(e.own ? (e.place || 'Local') : 'Histoire locale', 'yellow') : ''}` : ''}${e.own ? ` ${UI().badge ? UI().badge('Ajouté par toi', 'grey') : ''}` : ''}
                ${withAge && e.phrase ? `<p class="h-world-phrase">${esc(e.phrase)}</p>` : ''}${e.desc ? `<p class="muted">${esc(e.desc)}</p>` : ''}
                ${e.hint ? `<p class="h-world-hint">💡 ${esc(e.hint)}</p>` : ''}${e.src ? `<small class="h-world-src">Source : ${srcLink(e)}</small>` : ''}</div>
            ${e.own ? `<span class="h-world-acts"><button type="button" class="icon-button" data-world-edit="${e.own}" aria-label="Modifier cet événement" title="Modifier">✎</button><button type="button" class="icon-button" data-world-del="${e.own}" aria-label="Supprimer cet événement" title="Supprimer">🗑</button></span>` : ''}</li>`;
    }

    async function fill(host) {
        const pid = Number(host.dataset.worldHost), st = ls('genealogie-world-block', {cat: '', level: 1});
        let d; try { d = await api('world_around', {id: pid, level: st.level}); } catch (e) { host.innerHTML = A().empty(e.message || 'Chargement impossible.', {icon: '⛔'}); return; }
        if (!host.isConnected) return;
        CATS = d.cats || CATS;
        if (!d.span) { host.innerHTML = A().empty(d.reason || 'Pas de dates sur la fiche.', {icon: '🌍'}); return; }
        const local = d.events.filter(e => e.hit === 'local');
        const counts = {}; d.events.forEach(e => { counts[e.cat] = (counts[e.cat] || 0) + 1; });
        const cur = st.cat;
        const list = cur === 'local' ? local : cur ? d.events.filter(e => e.cat === cur) : d.events;
        const btn = (k, l, n) => `<button type="button" class="${cur === k ? 'is-active' : ''}" data-world-cat="${k}">${l} (${n})</button>`;
        host.innerHTML = `<p class="h-world-lead">De ${d.span[0]} à ${d.span[1]} : ${A().plural(d.events.length, 'événement')} pendant la vie de ${esc(d.person.first)}${local.length ? `, dont ${A().plural(local.length, 'événement')} de l’histoire locale` : ''}.</p>
            ${frise(d, list)}
            <div class="h-world-bar"><div class="ui-filters" role="toolbar" aria-label="Sortes d’événements">${btn('', 'Tout', d.events.length)}${local.length ? btn('local', '📍 Histoire locale', local.length) : ''}${Object.entries(counts).map(([k, n]) => btn(k, `${catOf(k).icon} ${catOf(k).label}`, n)).join('')}</div>
                <label class="ui-toggle"><input type="checkbox" data-world-level ${st.level >= 2 ? 'checked' : ''}><i></i>Plus de détails</label></div>
            ${list.length ? `<ol class="h-world-list">${list.map(e => rowHtml(e)).join('')}</ol>` : A().empty('Rien dans cette sorte pendant sa vie.', {icon: '🌍'})}
            <p class="h-world-credit muted"><small>${esc(d.credit)} Licence ${esc(d.licence)}. <button type="button" class="table-link" data-world-list>Voir toute la liste et ses sources →</button></small></p>`;
    }
    const refreshBlocks = () => document.querySelectorAll('[data-world-host]').forEach(h => fill(h));

    /* ─────────── mes événements : fenêtre ─────────── */
    async function editEvent(row = null, after = refreshBlocks) {
        const P = window.LCNDA_PICKER || A();
        if (!Object.keys(CATS).length) { try { CATS = (await api('world_events', {own: 1})).cats || {}; } catch (_) {} }
        const v = row || {from_year: '', to_year: '', reach: 'commune', category: 'société'};
        ext.openDialog({eyebrow: 'LE MONDE AUTOUR', title: row ? 'Modifier l’événement' : 'Nouvel événement', body: `<div class="form-grid">
                <label class="span-2">Titre<input name="title" required maxlength="200" value="${esc(v.title || '')}" placeholder="Incendie de l’église, grande crue de la Vézère, foire aux chevaux…" data-error="Donne un titre à l’événement."></label>
                <label>Année de début<input name="from_year" type="number" min="1000" max="2100" required value="${esc(v.from_year || '')}" data-error="Donne l’année (entre 1000 et 2100)."></label>
                <label>Année de fin <small>(si ça a duré)</small><input name="to_year" type="number" min="1000" max="2100" value="${esc(v.to_year && v.to_year !== v.from_year ? v.to_year : '')}"></label>
                <label>Date précise <small>(facultatif)</small><input name="date_text" maxlength="80" value="${esc(v.date_text || '')}" placeholder="7 mai 1925, vers 1784…"></label>
                <label>Sorte<select name="category">${Object.entries(CATS).map(([k, c]) => `<option value="${esc(k)}" ${k === v.category ? 'selected' : ''}>${c.icon} ${esc(c.label)}</option>`).join('')}</select></label>
                <div class="span-2"><span class="pk-lab">Commune</span>${P.pickerField({name: 'place_id', kind: 'place', value: v.place_id ? Number(v.place_id) : null})}</div>
                <label>Qui est concerné ?<select name="reach">${REACH.map(([k, l]) => `<option value="${k}" ${k === v.reach ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label class="span-2">Pour la phrase « Jean a 19 ans quand … » <small>(facultatif)</small><input name="quand" maxlength="200" value="${esc(v.quand || '')}" placeholder="l’église du village brûle"></label>
                <label class="span-2">Ce qu’il faut savoir<textarea name="description" rows="3" maxlength="4000">${esc(v.description || '')}</textarea></label>
                <label>Source<input name="source" maxlength="500" value="${esc(v.source || '')}" placeholder="Monographie communale, journal…"></label>
                <label>Lien <small>(facultatif)</small><input name="url" type="url" maxlength="1000" value="${esc(v.url || '')}" placeholder="https://…"></label></div>`,
            onSubmit: async f => {
                const data = Object.fromEntries(new FormData(f)); data.id = row?.id || 0;
                if (['commune', 'departement'].includes(data.reach) && !Number(data.place_id)) throw UI().invalid ? UI().invalid('place_id', 'Choisis la commune de l’événement.') : new Error('Choisis la commune de l’événement.');
                if (data.to_year && Number(data.to_year) < Number(data.from_year)) return UI().fail(f.elements.to_year, 'L’année de fin doit venir après celle du début.');
                await post('save_history_event', data);
                toast(row ? 'Enregistré' : 'Événement ajouté', row ? 'success' : '');
                after();
            }});
    }
    async function ownRow(id) { const d = await api('world_events', {own: 1}); const e = (d.events || []).find(x => Number(x.own) === Number(id)); return e ? {id: e.own, title: e.title, from_year: e.from, to_year: e.to, date_text: e.date, category: e.cat, reach: e.reach, place_id: e.place_id, quand: e.quand, description: e.desc, source: e.src, url: e.url} : null; }
    async function deleteEvent(id, after = refreshBlocks) {
        try {
            const r = await post('delete_history_event', {id}); after();
            const row = r.row || {}, again = {title: row.title, from_year: row.from_year, to_year: row.to_year, date_text: row.date_text, category: row.category, reach: row.reach, place_id: row.place_id, quand: row.quand, description: row.description, source: row.source, url: row.url};
            let back = 0;
            A().undoToast?.(`Événement « ${row.title} » supprimé`, {undo: async () => { back = (await post('save_history_event', again)).id; after(); }, redo: async () => { if (back) await post('delete_history_event', {id: back}); after(); }});
        } catch (e) { toast(e.message, 'error'); }
    }

    /* ─────────── Listes → 🌍 Le monde autour ─────────── */
    ext.lists.world_events = async token => {
        const st = ls('genealogie-world-list', {q: '', cat: '', own: false});
        let d; try { d = await api('world_events', {}); } catch (e) { A().$('#workspace').innerHTML = A().emptyState({icon: '⛔', text: e.message}); return; }
        if (token !== S().workspaceToken || S().module !== 'listes') return;
        CATS = d.cats || CATS;
        const ws = A().$('#workspace');
        ws.innerHTML = `<section class="page collection-page h-world-page">${UI().pageHeader({title: '🌍 Le monde autour', help: 'Les grands événements de France et du monde (guerres, épidémies, lois, inventions, régimes) et ton histoire locale. Sur chaque fiche, le bloc « 🌍 Le monde autour » les met à côté de la vie de la personne, avec son âge.',
                actions: ['<button type="button" class="button" data-world-new="0">＋ Nouvel événement</button>']})}
            <div class="h-world-listbar"><label class="h-world-q"><span aria-hidden="true">🔍</span><input type="search" data-world-q value="${esc(st.q)}" placeholder="Chercher… (choléra, 1870, Corrèze)" aria-label="Chercher un événement"></label>
                <select data-world-fcat aria-label="Sorte"><option value="">Toutes les sortes</option>${Object.entries(CATS).map(([k, c]) => `<option value="${esc(k)}" ${st.cat === k ? 'selected' : ''}>${c.icon} ${esc(c.label)}</option>`).join('')}</select>
                <label class="ui-toggle"><input type="checkbox" data-world-own ${st.own ? 'checked' : ''}><i></i>Seulement les miens (${d.own})</label><span class="spacer"></span><span class="muted" data-world-count></span></div>
            <ol class="h-world-list" data-world-rows></ol>
            <section class="maintenance-panel"><h3>D’où viennent ces événements ?</h3><p>${esc(d.credit)}</p><p>Licence <a href="${esc(d.licence_url)}" target="_blank" rel="noopener noreferrer">${esc(d.licence)} ↗</a>. Chaque événement renvoie à sa source. Les « crises » servent aussi à la liste « Épidémies, guerres, hivers terribles ».</p></section></section>`;
        const paint = () => {
            const q = st.q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
            const rows = d.events.filter(e => (!st.own || e.own) && (!st.cat || e.cat === st.cat) && (!q || `${e.title} ${e.desc} ${e.scope} ${e.place || ''} ${e.from}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)));
            ws.querySelector('[data-world-count]').textContent = A().plural(rows.length, 'événement');
            ws.querySelector('[data-world-rows]').innerHTML = rows.length ? rows.map(e => rowHtml({...e, hit: e.own && e.reach === 'commune' || (e.scope && !/^(france|monde|europe)$/i.test(e.scope)) ? 'local' : ''}, false)).join('')
                : A().emptyState({icon: '🌍', text: st.own ? 'Tu n’as pas encore ajouté d’événement' : 'Aucun événement pour cette recherche', hint: 'Une fête, une inondation, un incendie au village…', action: {label: '＋ Nouvel événement', attrs: 'data-empty-click="[data-world-new]"'}});
            lsSet('genealogie-world-list', st);
        };
        paint();
        ws.querySelector('[data-world-q]').addEventListener('input', e => { st.q = e.target.value; paint(); });
        ws.querySelector('[data-world-fcat]').addEventListener('change', e => { st.cat = e.target.value; paint(); });
        ws.querySelector('[data-world-own]').addEventListener('change', e => { st.own = e.target.checked; paint(); });
    };
    const relist = () => { if (S().module === 'listes' && S().listType === 'world_events') A().renderList?.(); else refreshBlocks(); };

    /* ─────────── Chronologie : la colonne « Contexte » ─────────── */
    const tl = {id: 0, list: null, busy: false};
    ext.worldTimeline = id => {
        id = Number(id) || 0; if (!id) return null;
        if (tl.id === id && tl.list) return tl.list;
        if (!tl.busy) {
            tl.busy = true; tl.id = id; tl.list = null;
            api('world_around', {id, level: 1, from: 1450, to: new Date().getFullYear()}).then(d => {
                CATS = d.cats || CATS;
                tl.list = (d.events || []).map(e => ({start_year: e.from, end_year: e.to, title: e.title, label: e.title, category: [`${catOf(e.cat).icon} ${catOf(e.cat).label}`, e.phrase && e.age >= 0 ? e.phrase : ''].filter(Boolean).join(' · '), parent_label: '', hidden: false}));
                if (S().module === 'chronologie' && S().timeline?.history) window.LCNDA_PARTS?.renderTimeline?.();
            }).catch(() => { tl.list = []; }).finally(() => { tl.busy = false; });
        }
        return null;
    };

    /* ─────────── clics ─────────── */
    document.addEventListener('click', async e => {
        const t = e.target;
        const cat = t.closest?.('[data-world-cat]');
        if (cat) { const st = ls('genealogie-world-block', {cat: '', level: 1}); st.cat = cat.dataset.worldCat; lsSet('genealogie-world-block', st); fill(cat.closest('[data-world-host]')); return; }
        if (t.closest?.('[data-world-new]')) { e.preventDefault(); editEvent(null, relist); return; }
        const ed = t.closest?.('[data-world-edit]'); if (ed) { const r = await ownRow(ed.dataset.worldEdit); if (r) editEvent(r, relist); return; }
        const del = t.closest?.('[data-world-del]'); if (del) { deleteEvent(Number(del.dataset.worldDel), relist); return; }
        if (t.closest?.('[data-world-list]')) { e.preventDefault(); S().listType = 'world_events'; A().setModule('listes'); }
    });
    document.addEventListener('change', e => {
        if (!e.target.matches?.('[data-world-level]')) return;
        const st = ls('genealogie-world-block', {cat: '', level: 1}); st.level = e.target.checked ? 2 : 1; lsSet('genealogie-world-block', st); refreshBlocks();
    });
    const scan = () => document.querySelectorAll('[data-world-host]:not([data-world-done])').forEach(h => { h.dataset.worldDone = '1'; fill(h); });
    new MutationObserver(scan).observe(document.documentElement, {childList: true, subtree: true});
    // le bloc (juste après la biographie) et la liste (Listes → Histoire, en premier)
    const boot = () => {
        const B = A()?.defaultPersonBlocks; if (Array.isArray(B) && !B.some(b => b[0] === 'world')) { const i = B.findIndex(b => b[0] === 'bio'); B.splice(i < 0 ? B.length : i + 1, 0, ['world', '🌍 Le monde autour']); }
        const L = A()?.defaultListTypes; if (Array.isArray(L) && !L.some(x => x[0] === 'world_events')) { const i = L.findIndex(x => x[0] === 'historical_context'); L.splice(i < 0 ? L.length : i, 0, ['world_events', '34a', '🌍 Le monde autour']); }
    };
    boot(); document.addEventListener('DOMContentLoaded', boot, {once: true});
    ext.world = {editEvent, deleteEvent, rowHtml};
})();
