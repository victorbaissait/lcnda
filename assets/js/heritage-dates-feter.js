/* LCNDA — 🎂 Dates à fêter (F10 ; serveur : lib/dates_feter.php, GET dates_feter).
 * Le widget « Anniversaires du jour » du tableau de bord devient « 🎂 Dates à fêter » (même widget, même place : rien en
 * double) : aujourd'hui, cette semaine ou ce mois-ci ; les vivants avec leur âge (« Marie a 40 ans »), les ancêtres
 * « il y a 150 ans » ; les anniversaires ronds mis en avant (🎉, noces d'or…) ; filtres Tout / Vivants / Ancêtres / Sosa, et
 * une branche (✎ du widget). 🔔 sur une ligne pose un rappel ordinaire de l'app (Listes → Rappels) la veille, une semaine
 * avant ou le jour même, avec « ↶ Annuler ». Les fiches confidentielles n'y sont jamais ; en mode consultation 🔒, un vivant
 * n'apparaît que par son prénom, sans âge.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.dashboard = ext.dashboard || {};
    ext.dashboardConfig = ext.dashboardConfig || {};
    const esc = v => A().escapeHtml(String(v ?? ''));
    const UI = () => window.LCNDA_UI || {};
    const P = () => window.LCNDA_PICKER || A();
    const KEY = 'today'; // le widget « Anniversaires du jour » d'avant, agrandi
    const PERIODS = [['today', 'Aujourd’hui'], ['week', 'Cette semaine'], ['month', 'Ce mois-ci']];
    const WHO = [['all', 'Tout'], ['living', '🎂 Vivants'], ['dead', '🕯 Ancêtres']];
    const KINDS = [['birth', 'Naissances'], ['union', 'Mariages'], ['death', 'Décès']];
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const MONTHS_S = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
    const cfgOf = w => ({period: 'today', who: 'all', sosa: false, round: false, kinds: ['birth', 'union', 'death'], branch: 0, branchName: '', ...(w?.config || {})});
    const isoParts = iso => iso.split('-').map(Number);
    const dayLabel = (iso, days) => { if (days === 0) return 'Aujourd’hui'; if (days === 1) return 'Demain'; const [y, m, d] = isoParts(iso); return `${DAYS[new Date(y, m - 1, d).getDay()]} ${d} ${MONTHS_S[m - 1]}`; };
    const longDate = iso => { const [, m, d] = isoParts(iso); return `${d === 1 ? '1er' : d} ${MONTHS[m - 1]}`; };
    const addDays = (iso, n) => { const [y, m, d] = isoParts(iso); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); };
    const who = p => `${p.first}${p.last ? ' ' + p.last : ''}`;
    const link = p => p.id ? `<button type="button" class="link-button" data-df-person="${p.id}">${esc(who(p))}</button>` : `<b>${esc(who(p))}</b>`;
    const both = list => list.map(link).join(' et ');

    /** La phrase d'une date à fêter (HTML, texte échappé) */
    function sentence(it) {
        const ps = it.persons || [], one = ps[0] || {first: '?'};
        const ago = it.years ? ` <span class="muted">il y a ${it.years} ans (${it.year})</span>` : '';
        if (it.masked) return it.kind === 'union' ? `💍 Anniversaire de mariage de ${both(ps)}` : `🎂 Anniversaire de ${link(one)}`;
        if (it.kind === 'birth') {
            if (it.living) return it.days === 0 ? `🎂 ${link(one)} a <b>${it.years} ans</b> aujourd’hui` : `🎂 ${link(one)} aura <b>${it.years} ans</b>`;
            return `👶 Naissance de ${link(one)}${ago}`;
        }
        if (it.kind === 'union') {
            if (it.living) return `💍 ${both(ps)} : <b>${it.years} ans de mariage</b>${it.noces ? ` <span class="muted">(${esc(it.noces)})</span>` : ''}`;
            return `💍 Mariage de ${both(ps)}${ago}`;
        }
        return `🕯 Décès de ${link(one)}${ago}`;
    }
    function rowHtml(it, i) {
        const p = (it.persons || [])[0] || {};
        const av = UI().avatar ? UI().avatar({id: p.id, first_name: p.first, last_name: p.last, gender: p.gender, sosa: p.sosa}, 34) : '';
        const sosa = (it.persons || []).filter(x => x.sosa).map(x => UI().badge?.(`Sosa ${x.sosa}`, 'sosa') || '').join(' ');
        return `<li class="h-df-row${it.round ? ' is-round' : ''}${it.days === 0 ? ' is-today' : ''}" data-df-i="${i}">
            <span class="h-df-when">${esc(dayLabel(it.date, it.days))}</span>${av}
            <span class="h-df-txt">${it.round ? '<span class="h-df-party" title="Anniversaire rond">🎉</span> ' : ''}${sentence(it)}${it.place ? ` <small class="muted">· ${esc(it.place)}</small>` : ''}</span>
            <span class="h-df-end">${sosa}<button type="button" class="icon-button small" data-df-remind="${i}" title="Me le rappeler (la veille, une semaine avant…)" aria-label="Me le rappeler">🔔</button></span></li>`;
    }
    const pill = (attr, val, label, on, n) => `<button type="button" class="${on ? 'is-active' : ''}" data-df-${attr}="${val}" aria-pressed="${on}">${esc(label)}${n !== undefined ? ` (${n})` : ''}</button>`;

    async function fill(box, widget) {
        const c = cfgOf(widget), limit = Math.max(1, Number(widget.limit) || 8);
        const list = box.querySelector('[data-df-list]');
        list.innerHTML = UI().skeleton?.(3) || '';
        let r;
        try { r = await A().api('dates_feter', {period: c.period, who: c.who, sosa: c.sosa ? 1 : 0, round: c.round ? 1 : 0, kinds: (c.kinds || []).join(','), branch: c.branch || ''}); }
        catch (e) { list.innerHTML = A().empty(e.message, {icon: '⛔'}); return; }
        if (!box.isConnected) return;
        box.querySelector('[data-df-who="all"]').textContent = `Tout (${r.counts.all})`;
        box.querySelector('[data-df-who="living"]').textContent = `🎂 Vivants (${r.counts.living})`;
        box.querySelector('[data-df-who="dead"]').textContent = `🕯 Ancêtres (${r.counts.dead})`;
        const count = box.closest('.card')?.querySelector('.card-title h3 small'); if (count) count.textContent = `(${r.total})`;
        const items = r.items || [];
        const when = c.period === 'today' ? 'aujourd’hui' : c.period === 'week' ? 'cette semaine' : 'ce mois-ci';
        list.innerHTML = items.length
            ? `<ul class="h-df-list">${items.slice(0, limit).map(rowHtml).join('')}</ul>${items.length > limit ? `<p class="muted h-df-more">… et ${A().plural(items.length - limit, 'autre date', 'autres dates')} ${when}. <button type="button" class="link-button" data-df-all>Tout voir</button></p>` : ''}${r.kiosk ? '<p class="muted">🔒 Mode consultation : les vivants n’apparaissent que par leur prénom.</p>' : ''}`
            : A().empty(`Rien à fêter ${when}${c.who === 'living' ? ' chez les vivants' : c.who === 'dead' ? ' chez les ancêtres' : ''}${c.branch ? ' dans cette branche' : ''}.`, {icon: '🎂', action: c.period !== 'month' ? {label: 'Voir le mois', attrs: 'data-df-period="month"'} : null});
        box._items = items;
        box.querySelector('[data-df-all]')?.addEventListener('click', e => { e.currentTarget.closest('p').remove(); list.querySelector('.h-df-list').insertAdjacentHTML('beforeend', items.slice(limit).map((it, k) => rowHtml(it, k + limit)).join('')); });
    }
    /** un réglage changé dans le widget (période, filtre) est gardé dans le widget lui-même, comme le crayon ✎ */
    function saveCfg(widget, patch) {
        Object.assign(widget.config = widget.config || {}, patch);
        try { const s = A().dashboardBlockSettings(), w = s.widgets.find(x => x.id === widget.id); if (w) { w.config = {...(w.config || {}), ...patch}; A().saveDashboardBlockSettings(s); } } catch (_) {}
    }
    async function remind(it, at) {
        const today = new Date(), iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        const off = {eve: -1, week: -7, day: 0}[at], due = addDays(it.date, off);
        if (due < iso) return A().toast('Cette date est déjà passée : choisis « le jour même ».', 'error');
        const ps = it.persons || [], names = ps.map(who).join(' et ');
        const what = it.kind === 'birth' ? (it.living ? `Anniversaire de ${names}${it.years && !it.masked ? ` (${it.years} ans)` : ''}` : `${it.years} ans de la naissance de ${names}`)
            : it.kind === 'union' ? (it.living ? `${it.years && !it.masked ? it.years + ' ans de mariage' : 'Anniversaire de mariage'} de ${names}${it.noces ? ` (${it.noces})` : ''}` : `${it.years} ans du mariage de ${names}`)
                : `${it.years} ans du décès de ${names}`;
        try {
            const r = await A().api('save_standalone_reminder', {}, {method: 'POST', body: {title: `${it.kind === 'death' ? '🕯' : it.kind === 'union' ? '💍' : '🎂'} ${what} — le ${longDate(it.date)}`, reminder_due_at: due, reminder_mode: 'on', reminder_category: 'autre',
                notes: `Posé depuis « Dates à fêter » du tableau de bord.${ps.filter(p => p.id).map(p => `\nFiche : ${who(p)} (n° ${p.id})`).join('')}`}});
            const id = Number(r?.result?.id ?? r?.id) || 0;
            A().undoToast(`🔔 Rappel posé pour le ${longDate(due)} (Listes → Rappels)`, {undo: async () => { if (id) await A().api('delete_standalone_reminder', {}, {method: 'POST', body: {id}}); }});
            try { window.lcnda?.refreshReminders?.(); } catch (_) {}
        } catch (e) { A().toast(e.message, 'error'); }
    }

    ext.dashboard[KEY] = {render: (index, widget, span) => {
        const c = cfgOf(widget), id = 'df-' + Math.random().toString(36).slice(2, 9);
        setTimeout(() => {
            const box = document.getElementById(id); if (!box || box.dataset.on) return; box.dataset.on = '1';
            box.addEventListener('click', e => {
                const pb = e.target.closest('[data-df-period]'); if (pb) { saveCfg(widget, {period: pb.dataset.dfPeriod}); box.querySelectorAll('[data-df-period]').forEach(b => { const on = b.dataset.dfPeriod === widget.config.period; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on); }); return fill(box, widget); }
                const wb = e.target.closest('[data-df-who]'); if (wb) { saveCfg(widget, {who: wb.dataset.dfWho}); box.querySelectorAll('[data-df-who]').forEach(b => { const on = b.dataset.dfWho === widget.config.who; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on); }); return fill(box, widget); }
                const sb = e.target.closest('[data-df-sosa]'); if (sb) { saveCfg(widget, {sosa: !cfgOf(widget).sosa}); sb.classList.toggle('is-active', !!widget.config.sosa); sb.setAttribute('aria-pressed', !!widget.config.sosa); return fill(box, widget); }
                const per = e.target.closest('[data-df-person]'); if (per) { A().openPersonById ? A().openPersonById(Number(per.dataset.dfPerson)) : (A().state.currentPersonId = Number(per.dataset.dfPerson), A().setModule('personnes')); return; }
                const rb = e.target.closest('[data-df-remind]'); if (rb) {
                    const it = box._items?.[Number(rb.dataset.dfRemind)]; if (!it) return;
                    UI().menuAt?.(rb, [{icon: '🔔', label: 'La veille', disabled: it.days < 1, run: () => remind(it, 'eve')}, {icon: '🔔', label: 'Une semaine avant', disabled: it.days < 7, run: () => remind(it, 'week')}, {icon: '🔔', label: 'Le jour même', run: () => remind(it, 'day')}], {title: 'Me le rappeler'});
                }
            });
            fill(box, widget);
        }, 0);
        const branch = c.branch ? `<span class="ui-badge is-blue" title="Seulement cette branche (réglée avec le crayon ✎)">🌿 ${esc(c.branchName || 'une branche')}</span>` : '';
        const body = `<div class="h-df" id="${id}"><div class="h-df-bar"><div class="ui-filters h-df-periods" role="group" aria-label="Période">${PERIODS.map(([v, l]) => pill('period', v, l, c.period === v)).join('')}</div>
            <div class="ui-filters h-df-who" role="group" aria-label="Qui">${WHO.map(([v, l]) => pill('who', v, l, c.who === v)).join('')}${pill('sosa', '1', '⭐ Sosa', !!c.sosa)}</div>${branch}</div><div data-df-list></div></div>`;
        return A().card(index, '🎂 Dates à fêter', '', body, span);
    }};
    ext.dashboardConfig[KEY] = {
        html: w => { const c = cfgOf(w);
            return `<fieldset class="h-df-cfg"><legend>Dates à fêter</legend>
                <label>Période<select data-dfc="period">${PERIODS.map(([v, l]) => `<option value="${v}" ${c.period === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label>Qui<select data-dfc="who"><option value="all" ${c.who === 'all' ? 'selected' : ''}>Tout le monde</option><option value="living" ${c.who === 'living' ? 'selected' : ''}>Les vivants (avec leur âge)</option><option value="dead" ${c.who === 'dead' ? 'selected' : ''}>Les ancêtres (« il y a 150 ans »)</option></select></label>
                <div class="h-df-kinds">${KINDS.map(([v, l]) => `<label class="checkbox-line"><input type="checkbox" data-dfc-kind value="${v}" ${(c.kinds || []).includes(v) ? 'checked' : ''}> ${l}</label>`).join('')}</div>
                <label class="checkbox-line"><input type="checkbox" data-dfc="sosa" ${c.sosa ? 'checked' : ''}> Seulement mes ancêtres directs (Sosa)</label>
                <label class="checkbox-line"><input type="checkbox" data-dfc="round" ${c.round ? 'checked' : ''}> Seulement les anniversaires ronds (40 ans, noces d’or, il y a 200 ans…)</label>
                <div data-dfc-branch><span class="pk-lab">Une seule branche : les descendants de… <small>(vide = toute la famille)</small></span>${P().pickerField?.({name: 'dfc_branch', hiddenName: false, kind: 'person', animals: false, value: c.branch ? {id: Number(c.branch), title: c.branchName || ''} : null}) || ''}
                    <input type="hidden" data-dfc="branch" value="${Number(c.branch) || ''}"><input type="hidden" data-dfc="branchName" value="${esc(c.branchName || '')}"></div></fieldset>`; },
        read: ed => { const kinds = [...ed.querySelectorAll('[data-dfc-kind]:checked')].map(x => x.value);
            return {period: ed.querySelector('[data-dfc=period]')?.value || 'today', who: ed.querySelector('[data-dfc=who]')?.value || 'all', sosa: !!ed.querySelector('[data-dfc=sosa]')?.checked,
                round: !!ed.querySelector('[data-dfc=round]')?.checked, kinds: kinds.length ? kinds : ['birth', 'union', 'death'],
                branch: Number(ed.querySelector('[data-dfc=branch]')?.value) || 0, branchName: ed.querySelector('[data-dfc=branchName]')?.value || ''}; },
    };
    document.addEventListener('picker-change', e => { const box = e.target.closest?.('[data-dfc-branch]'); if (!box) return; const it = e.detail.item; box.querySelector('[data-dfc=branch]').value = it && !it.free ? Number(it.id) || '' : ''; box.querySelector('[data-dfc=branchName]').value = it && !it.free ? it.title || '' : ''; });

    // au catalogue des widgets : le même widget, avec son nouveau nom et sa description
    const reg = () => {
        const app = A(); if (!app?.defaultDashboardBlocks) return false;
        const row = app.defaultDashboardBlocks.find(x => x[0] === KEY); if (row) row[1] = '🎂 Dates à fêter';
        if (app.dashboardWidgetInfo) app.dashboardWidgetInfo[KEY] = 'Les naissances, mariages et décès à fêter aujourd’hui, cette semaine ou ce mois-ci : l’âge des vivants, « il y a 150 ans » pour les ancêtres, les anniversaires ronds mis en avant ; filtres vivants, ancêtres, Sosa, une branche ; 🔔 pour un rappel la veille ou une semaine avant.';
        if (app.defaultDashboardBlockLimits) app.defaultDashboardBlockLimits[KEY] = 8;
        return true;
    };
    if (!reg()) document.addEventListener('DOMContentLoaded', reg);
    window.LCNDA_DATES_FETER = {sentence, cfgOf};
})();
