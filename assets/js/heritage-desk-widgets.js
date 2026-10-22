/**
 * 🪟 Widgets sur le bureau (PC, Mac, Linux) : « 🪟 Mettre sur le bureau » sur les widgets du tableau de bord qui le savent
 * (Anniversaires du jour, Cette semaine, Personne au hasard, Image au hasard) et « 🪟 Widgets sur le bureau… » en bas de la
 * colonne du tableau de bord. Dans l'application de bureau (Electron) : une petite fenêtre sans cadre, en lecture seule,
 * toujours au-dessus ou non, qui retient sa place, et qui peut démarrer avec l'ordinateur (window.lcnda.desktopWidgets,
 * electron/preload.js → electron/main.js → electron/desk-widgets.js). Dans un navigateur : un fichier .html autonome du
 * widget (données figées, sans personne vivante), à garder ouvert dans un onglet. Données : lib/desk_widgets.php.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => (A()?.escapeHtml ? A().escapeHtml(v ?? '') : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const toast = (...a) => A().toast(...a);
    const KINDS = {
        today: ['🎂', 'Ce jour-là', 'Les anniversaires du jour et des 7 jours qui viennent, et ce qui s’est passé ce jour-là dans ta famille.'],
        ancestor: ['🌳', 'Un ancêtre', 'Un de tes ancêtres, un nouveau chaque jour (↻ pour en voir un autre) : son portrait, ses dates, ses lieux.'],
        photo: ['📷', 'Photo du jour', 'Une photo de tes médias, une nouvelle chaque jour.'],
        countdown: ['⏳', 'Compte à rebours', 'Les jours qui restent avant une date : la cousinade, un anniversaire, un voyage aux archives…'],
    };
    // les widgets du tableau de bord qui ont leur widget de bureau
    const FROM_DASH = {today: 'today', upcoming: 'today', saint_day: 'today', random_person: 'ancestor', chosen_person: 'ancestor', random_media: 'photo', favorite_image: 'photo'};
    const desk = () => window.lcnda?.desktopWidgets || null;
    const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
    /** « 14 juillet 2027 », « 14/07/2027 », « 2027-07-14 » → « 2027-07-14 » ('' si on ne comprend pas) */
    const toIso = raw => {
        const s = String(raw || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/^le\s+/, '').replace(/\s+/g, ' ');
        let m, y, mo, d;
        if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) [y, mo, d] = [+m[1], +m[2], +m[3]];
        else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) [d, mo, y] = [+m[1], +m[2], +m[3]];
        else if ((m = /^(1er|\d{1,2}) ([a-z]+)\.? (\d{4})$/.exec(s))) { d = m[1] === '1er' ? 1 : +m[1]; mo = MONTHS.findIndex(x => x.startsWith(m[2].slice(0, 3))) + 1; y = +m[3]; }
        if (!y || !mo || !d) return '';
        const dt = new Date(y, mo - 1, d); return dt.getMonth() === mo - 1 && dt.getDate() === d ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';
    };
    const isoLabel = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d === 1 ? '1er' : d} ${['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][m - 1]} ${y}`; };
    const CD_KEY = 'genealogie-desk-countdown';
    const cdRead = () => { try { const o = JSON.parse(localStorage.getItem(CD_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; } };
    const cdWrite = o => { try { localStorage.setItem(CD_KEY, JSON.stringify(o)); } catch (_) {} };

    async function fileFor(kind, opts = {}) {
        const url = new URL('api.php', location.href); url.searchParams.set('action', 'desk_widget_file'); url.searchParams.set('kind', kind);
        if (opts.label) url.searchParams.set('label', opts.label); if (opts.date) url.searchParams.set('date', opts.date);
        const r = await fetch(url, {credentials: 'same-origin'});
        if (!r.ok || !/html/.test(r.headers.get('content-type') || '')) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Le widget n’a pas pu être fabriqué.'); }
        const blob = await r.blob(), a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = `widget-${kind}.html`; document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
        toast(`Widget prêt : widget-${kind}.html. Ouvre-le d’un double-clic et garde l’onglet ouvert (ou épingle-le) : il change tout seul chaque jour.`, 'success');
    }

    /** la fenêtre « 🪟 Widgets sur le bureau » ; focus = la sorte à mettre en avant */
    async function openDialog(focus = '') {
        const D = desk();
        let state = {widgets: {}, autostart: false, platform: ''};
        if (D) { try { state = await D.list() || state; } catch (_) {} }
        const cd = {label: cdRead().label || 'La cousinade', date: cdRead().date || ''};
        const os = {darwin: 'Mac', win32: 'Windows', linux: 'Linux'}[state.platform] || 'ton ordinateur';
        const card = k => {
            const [ic, name, hint] = KINDS[k], w = state.widgets?.[k] || {}, on = !!w.open;
            const cdFields = k === 'countdown' ? `<div class="form-grid one-column dw-count"><label>Quoi<input type="text" data-dw-cd="label" maxlength="60" value="${esc(cd.label)}"></label><label>Le<input type="text" data-dw-cd="date" data-ui-date="nocal" value="${esc(cd.date ? isoLabel(cd.date) : '')}" placeholder="14 juillet 2027"></label></div>` : '';
            const acts = D
                ? `<label class="ui-toggle"><input type="checkbox" data-dw-top="${k}"${w.onTop ? ' checked' : ''}><i></i>Toujours au-dessus</label><div class="dw-acts">${on ? `<button type="button" class="button small secondary" data-dw-close="${k}">× Retirer du bureau</button><button type="button" class="button small secondary" data-dw-open="${k}">↻ Remettre à jour</button>` : `<button type="button" class="button small" data-dw-open="${k}">🪟 Mettre sur le bureau</button>`}</div>`
                : `<div class="dw-acts"><button type="button" class="button small" data-dw-file="${k}">⤓ Télécharger le widget (.html)</button></div>`;
            return `<div class="dw-kind${on ? ' is-open' : ''}${focus === k ? ' is-focus' : ''}" data-dw-kind="${k}"><h4>${ic} ${esc(name)}</h4><p>${esc(hint)}</p>${cdFields}${acts}</div>`;
        };
        const intro = D
            ? UI().notice?.('info', `Les widgets se posent sur le bureau de ${os}, dans une petite fenêtre sans cadre : glisse-la par son titre, elle retient sa place. Lecture seule : rien ne s’y modifie. Clic droit sur un widget : toujours au-dessus, ouvrir LCNDA, fermer.`) || ''
            : UI().notice?.('warn', 'Tu utilises LCNDA dans un navigateur : les vrais widgets de bureau (petite fenêtre sans cadre, toujours au-dessus, au démarrage de l’ordinateur) demandent l’application de bureau LCNDA (PC, Mac, Linux). À la place, télécharge le widget : un fichier .html autonome, à ouvrir d’un double-clic et à garder dans un onglet ; sans personne vivante ni fiche confidentielle.') || '';
        ext.openDialog({eyebrow: 'TABLEAU DE BORD', title: '🪟 Widgets sur le bureau', wide: true, submitLabel: 'Fermer',
            body: `${intro}<div class="dw-kinds">${Object.keys(KINDS).map(card).join('')}</div>${D ? `<div class="dw-auto"><label class="ui-toggle"><input type="checkbox" data-dw-auto${state.autostart ? ' checked' : ''}><i></i>Démarrer avec l’ordinateur (les widgets s’ouvrent seuls, sans la grande fenêtre)</label></div>` : ''}`,
            onOpen: dg => {
                const repaint = async () => { if (D) { try { state = await D.list() || state; } catch (_) {} } dg.querySelector('.dw-kinds').innerHTML = Object.keys(KINDS).map(card).join(''); UI()?.scan?.(dg); };
                const cdOpts = () => { const label = dg.querySelector('[data-dw-cd="label"]')?.value.trim().slice(0, 60) || 'La cousinade'; const raw = dg.querySelector('[data-dw-cd="date"]')?.value || ''; const date = toIso(raw); return {label, date, raw}; };
                const optsFor = k => { const o = {onTop: !!dg.querySelector(`[data-dw-top="${k}"]`)?.checked}; if (k === 'countdown') { const c = cdOpts(); o.label = c.label; o.date = c.date; } return o; };
                dg.addEventListener('click', async e => {
                    const b = e.target.closest('button'); if (!b) return;
                    try {
                        if (b.dataset.dwOpen || b.dataset.dwFile) {
                            const k = b.dataset.dwOpen || b.dataset.dwFile;
                            if (k === 'countdown') { const c = cdOpts(); if (!c.date) { const f = dg.querySelector('[data-dw-cd="date"]'); return UI()?.fail ? UI().fail(f, c.raw ? '⛔ Je ne comprends pas cette date : écris par exemple « 14 juillet 2027 » ou « 14/07/2027 ».' : '⛔ Donne la date du compte à rebours.') : toast('Donne la date.', 'error'); } cdWrite({label: c.label, date: c.date}); }
                            if (b.dataset.dwFile) return fileFor(k, optsFor(k));
                            const r = await D.open(k, optsFor(k)); if (!r?.ok) throw new Error(r?.error || 'Le widget n’a pas pu s’ouvrir.');
                            toast(`${KINDS[k][0]} « ${KINDS[k][1]} » est sur le bureau.`, 'success'); return repaint();
                        }
                        if (b.dataset.dwClose) { const k = b.dataset.dwClose; await D.close(k); A().undoToast ? A().undoToast(`« ${KINDS[k][1]} » retiré du bureau`, {undo: async () => { await D.open(k, optsFor(k)); repaint(); }}) : toast('Retiré du bureau.'); return repaint(); }
                    } catch (err) { toast(err.message, 'error'); }
                });
                dg.addEventListener('change', async e => {
                    const t = e.target;
                    if (t.dataset.dwTop && D) { const k = t.dataset.dwTop; if (state.widgets?.[k]?.open) { await D.open(k, optsFor(k)); repaint(); } else { await D.set?.(k, {onTop: t.checked}); } return; }
                    if (t.matches('[data-dw-auto]') && D) { const r = await D.autostart(t.checked); if (!r?.ok) { t.checked = !t.checked; return toast(r?.error || 'Ce réglage n’a pas pu être changé sur cet ordinateur.', 'error'); } toast(t.checked ? 'Les widgets démarreront avec l’ordinateur.' : 'Les widgets ne démarreront plus avec l’ordinateur.', 'success'); }
                });
                if (focus) setTimeout(() => dg.querySelector(`[data-dw-kind="${focus}"]`)?.scrollIntoView({block: 'nearest'}), 50);
            }, onSubmit: () => {}});
    }
    ext.deskWidgets = {open: openDialog, toIso, KINDS, FROM_DASH, fileFor};

    /* le bouton 🪟 sur les widgets du tableau de bord, et l'entrée en bas de sa colonne (sans toucher app-tableau-de-bord.js) */
    const decorate = () => {
        let settings = null;
        document.querySelectorAll('#workspace .dashboard-widget[data-dashboard-widget] .dashboard-widget-tools').forEach(tools => {
            if (tools.querySelector('[data-dw-put]')) return;
            settings = settings || A()?.dashboardBlockSettings?.() || {widgets: []};
            const id = tools.closest('[data-dashboard-widget]').dataset.dashboardWidget, w = (settings.widgets || []).find(x => x.id === id), kind = w && FROM_DASH[w.type];
            if (!kind) return;
            const b = document.createElement('button'); b.type = 'button'; b.className = 'icon-action'; b.dataset.dwPut = kind;
            b.title = desk() ? `🪟 Mettre sur le bureau (« ${KINDS[kind][1]} », une petite fenêtre à part)` : `🪟 Mettre sur le bureau (« ${KINDS[kind][1]} » : un fichier .html autonome dans un navigateur)`; b.setAttribute('aria-label', 'Mettre sur le bureau'); b.textContent = '🪟';
            tools.prepend(b);
        });
        const foot = document.querySelector('.dashboard-footer-actions');
        if (foot && !foot.querySelector('[data-dw-all]')) { const b = document.createElement('button'); b.type = 'button'; b.className = 'button small secondary'; b.dataset.dwAll = '1'; b.textContent = '🪟 Widgets sur le bureau…'; b.title = 'Ce jour-là, un ancêtre, la photo du jour, un compte à rebours : sur le bureau de l’ordinateur'; foot.appendChild(b); }
    };
    let raf = 0;
    new MutationObserver(() => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; decorate(); }); }).observe(document.body, {childList: true, subtree: true});
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-dw-put], [data-dw-all]'); if (!b) return;
        e.preventDefault(); e.stopPropagation(); openDialog(b.dataset.dwPut || '');
    }, true);
})();
