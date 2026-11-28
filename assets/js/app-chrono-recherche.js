/* LCNDA — ⏱ Temps de recherche : un chronomètre commun à toute l'app (audit des onglets, manque transversal).
 *  ext.researchClock = {start(scope), stop(), total(scope), running(), today(scope), since(days, scope), scopes(days), others()}
 *  - un seul chronomètre à la fois ; « scope » = sur quoi on travaille (« Général », « Branche MAZAUD », « Enquête : … ») ;
 *  - le temps est rangé par jour et par sujet dans le réglage « genealogie-research-clock » (suit la base et la sauvegarde) ;
 *  - others() lit aussi, sans y toucher, les chronomètres des Successions (lcnda-succ-chrono) et de l'Atelier (genealogie-atelier-timers).
 *  Le widget « ⏱ Temps de recherche » du tableau de bord (research_time) : démarrer / arrêter, aujourd'hui, la semaine, par sujet.
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const KEY = 'genealogie-research-clock';
    const GENERAL = () => i18n('Général');
    const pad = n => String(n).padStart(2, '0');
    const dayOf = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return {run: v && v.run && v.run.start ? v.run : null, days: v && v.days && typeof v.days === 'object' ? v.days : {}}; } catch (_) { return {run: null, days: {}}; } };
    const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) {} };
    const cleanScope = s => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || GENERAL();
    /** ajoute [from, to] (en ms) aux jours qu'il couvre (une séance qui passe minuit compte pour les deux jours) */
    function addSpan(days, scope, from, to) {
        let t = from;
        while (t < to) {
            const d = new Date(t); const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(), end = Math.min(to, next);
            const k = dayOf(t); days[k] = days[k] || {}; days[k][scope] = Math.round(((days[k][scope] || 0) + (end - t) / 1000) * 10) / 10;
            t = end;
        }
    }
    /** les jours, avec la séance en cours comptée jusqu'à maintenant (sans l'écrire) */
    function withRun() { const v = read(); if (!v.run) return v.days; const days = JSON.parse(JSON.stringify(v.days)); addSpan(days, v.run.scope, v.run.start, Date.now()); return days; }
    const sum = (days, scope, from = '') => Object.entries(days).filter(([d]) => !from || d >= from).reduce((n, [, m]) => n + Object.entries(m).filter(([s]) => !scope || s === scope).reduce((a, [, x]) => a + Number(x || 0), 0), 0);
    const fromDays = n => dayOf(Date.now() - (Math.max(1, n) - 1) * 86400000);

    const clock = {
        /** démarre (ou change de sujet : la séance en cours est d'abord rangée) */
        start(scope) { const s = cleanScope(scope); const v = read(); if (v.run) { if (v.run.scope === s) return v.run; addSpan(v.days, v.run.scope, v.run.start, Date.now()); } v.run = {scope: s, start: Date.now()}; write(v); paint(); return v.run; },
        /** arrête : rend les secondes de la séance */
        stop() { const v = read(); if (!v.run) return 0; const sec = (Date.now() - v.run.start) / 1000; addSpan(v.days, v.run.scope, v.run.start, Date.now()); v.run = null; write(v); paint(); return Math.round(sec); },
        running: () => read().run,
        /** total en secondes (tout le temps ; un sujet, ou tous) */
        total: scope => Math.round(sum(withRun(), scope ? cleanScope(scope) : '')),
        today: scope => Math.round(sum(withRun(), scope ? cleanScope(scope) : '', dayOf(Date.now()))),
        since: (days, scope) => Math.round(sum(withRun(), scope ? cleanScope(scope) : '', fromDays(days))),
        /** [[sujet, secondes]] sur les n derniers jours (le plus long d'abord) */
        scopes(days = 7) { const m = {}, from = fromDays(days); Object.entries(withRun()).forEach(([d, x]) => { if (d < from) return; Object.entries(x).forEach(([s, n]) => { m[s] = (m[s] || 0) + Number(n || 0); }); }); return Object.entries(m).map(([s, n]) => [s, Math.round(n)]).sort((a, b) => b[1] - a[1]); },
        /** les sujets déjà utilisés (pour la liste de choix) */
        known() { const set = new Set([GENERAL()]); Object.values(read().days).forEach(x => Object.keys(x).forEach(s => set.add(s))); return [...set]; },
        /** les autres chronomètres de l'app, lus sans y toucher : [{key, label, today, total}] en secondes */
        others() {
            const out = [], now = Date.now(), d0 = new Date(); d0.setHours(0, 0, 0, 0); const t0 = d0.getTime();
            try {
                const st = JSON.parse(localStorage.getItem('lcnda-succ-chrono') || 'null');
                if (st && (st.start || (st.segs || []).length)) {
                    const segs = [...(st.segs || []), ...(st.start ? [{from: st.start, to: now}] : [])];
                    const tot = segs.reduce((n, s) => n + Math.max(0, (s.to || now) - s.from), 0), tod = segs.reduce((n, s) => n + Math.max(0, Math.min(s.to || now, now) - Math.max(s.from, t0)), 0);
                    out.push({key: 'succ', label: `⚖️ ${st.number ? st.number + ' · ' : ''}${st.title || i18n('Succession')}`, today: Math.round(tod / 1000), total: Math.round(tot / 1000), on: !!st.start});
                }
            } catch (_) {}
            try {
                const tm = JSON.parse(localStorage.getItem('genealogie-atelier-timers') || '{}') || {}; let tod = 0, tot = 0, on = false, n = 0;
                Object.values(tm).forEach(t => { if (!t || t.kind !== 'chrono') return; n++; const run = t.start ? now - t.start : 0; if (t.start) on = true; tot += (t.total || 0) + run; tod += (t.day === dayOf(now) ? (t.today || 0) : 0) + run; });
                if (n) out.push({key: 'atelier', label: i18n('📚 Atelier'), today: Math.round(tod / 1000), total: Math.round(tot / 1000), on});
            } catch (_) {}
            return out;
        },
    };
    ext.researchClock = clock;

    /* ── affichage ── */
    const hms = sec => { sec = Math.max(0, Math.round(sec)); if (window.LCNDA_UI?.clock) return window.LCNDA_UI.clock(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60; return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`; };
    const short = sec => { const m = Math.round(sec / 60); return m < 60 ? i18n('{n} min', {n: m}) : i18n('{h} h {m}', {h: Math.floor(m / 60), m: pad(m % 60)}); };
    const ro = () => document.body.classList.contains('is-kiosk');
    function body() {
        const run = clock.running(), kn = clock.known(), week = clock.scopes(7), others = clock.others();
        const cur = run ? run.scope : (kn[0] || GENERAL());
        return `<div class="rcl-box${run ? ' is-on' : ''}" data-rcl-box>
            <div class="rcl-top"><span class="rcl-clock" data-rcl-clock aria-live="off">${hms(run ? (Date.now() - run.start) / 1000 : 0)}</span>
                ${ro() ? '' : `<label class="rcl-scope"><span>${esc(i18n('Sur quoi ?'))}</span><input data-rcl-scope list="rcl-scopes" value="${esc(cur)}" maxlength="80" ${run ? 'disabled' : ''}><datalist id="rcl-scopes">${kn.map(s => `<option value="${esc(s)}">`).join('')}</datalist></label>
                <button type="button" class="button small${run ? ' secondary' : ''}" data-rcl-do="${run ? 'stop' : 'start'}">${esc(run ? i18n('⏹ Arrêter') : i18n('▶ Démarrer'))}</button>`}</div>
            <p class="rcl-sum"><span>${esc(i18n('Aujourd’hui'))} <b data-rcl-today>${esc(short(clock.today()))}</b></span><span>${esc(i18n('7 derniers jours'))} <b data-rcl-week>${esc(short(clock.since(7)))}</b></span></p>
            ${week.length ? `<ul class="rcl-list">${week.slice(0, 6).map(([s, n]) => `<li><span>${esc(s)}</span><b>${esc(short(n))}</b></li>`).join('')}</ul>` : `<p class="muted">${esc(i18n('Démarre le chronomètre quand tu te mets à chercher : le temps passé est rangé par jour et par sujet.'))}</p>`}
            ${others.length ? `<p class="rcl-others muted">${others.map(o => `${esc(o.label)}${o.on ? ' ⏱' : ''} : ${esc(i18n('{t} aujourd’hui', {t: short(o.today)}))}`).join(' · ')}</p>` : ''}
        </div>`;
    }
    function paint() { document.querySelectorAll('[data-rcl-host]').forEach(h => { h.innerHTML = body(); }); }
    setInterval(() => {
        const run = clock.running(); if (!run) return;
        document.querySelectorAll('[data-rcl-clock]').forEach(el => { el.textContent = hms((Date.now() - run.start) / 1000); });
    }, 1000);
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-rcl-do]'); if (!b) return;
        e.preventDefault();
        if (b.dataset.rclDo === 'start') { const inp = b.closest('[data-rcl-box]')?.querySelector('[data-rcl-scope]'); clock.start(inp?.value); A()?.toast?.(i18n('⏱ C’est parti : « {s} ».', {s: clock.running()?.scope || ''})); }
        else { const run = clock.running(), sec = clock.stop(); if (run) A()?.toast?.(i18n('⏱ {t} rangées dans « {s} ».', {t: short(sec), s: run.scope})); }
    });
    // une autre fenêtre de l'app a démarré ou arrêté le chronomètre
    window.addEventListener('storage', e => { if (e.key === KEY) paint(); });

    /* ── le widget du tableau de bord ── */
    try { const a0 = A(); if (a0?.defaultDashboardBlocks && !a0.defaultDashboardBlocks.some(x => x[0] === 'research_time')) { a0.defaultDashboardBlocks.push(['research_time', '⏱ Temps de recherche']); if (a0.defaultDashboardBlockSpans) a0.defaultDashboardBlockSpans.research_time = '6'; if (a0.dashboardWidgetInfo) a0.dashboardWidgetInfo.research_time = 'Un chronomètre de séance : démarre-le quand tu cherches, le temps est rangé par jour et par sujet (une branche, une enquête). Montre aussi le temps des Successions et de l’Atelier.'; } } catch (_) {}
    ext.dashboard = ext.dashboard || {};
    ext.dashboard.research_time = {load: () => Promise.resolve(null), render: (index, widget, span) => A().card(index, i18n('⏱ Temps de recherche'), '', `<div data-rcl-host>${body()}</div>`, span)};
})();
