/**
 * 🧩 Atelier : des widgets dans la « Vue d'ensemble » d'un projet (heritage-research.js pose la case, ce fichier la remplit).
 *  - pour écrire : ⏱️ chronomètre (temps passé sur le projet), ⏳ minuteur / Pomodoro (sonnerie), 🎯 objectif de mots du jour,
 *    ✅ choses à faire avant une date, 🗒️ bloc-notes ;
 *  - du logiciel : 🔔 rappels, 🗓️ agenda du projet (visites d'archives, salons, circuits, courriers… épinglés ou par mot),
 *    et les widgets du tableau de bord qui savent se dessiner seuls (Mon agenda, Départs et émigration, Circuits…).
 * Réglages : localStorage « genealogie-atelier-widgets » (par projet, copiés dans la base) ; chronomètres et minuteurs
 * continuent quand on change d'écran (« genealogie-atelier-timers »).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => A().escapeHtml(v ?? '');
    const nl = v => esc(v).replace(/\n/g, '<br>');
    const toast = (...a) => A().toast(...a);
    const KEY = 'genealogie-atelier-widgets', TKEY = 'genealogie-atelier-timers';
    const read = k => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (_) { return {}; } };
    const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const uid = () => 'w' + Math.random().toString(36).slice(2, 9);
    const pad = n => String(n).padStart(2, '0');
    const hms = ms => { if (window.LCNDA_UI?.clock) return window.LCNDA_UI.clock(Math.max(0, Math.round(ms / 1000))); // K17 : « 25:00 », « 1:05:00 »
        const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 3600) ? Math.floor(s / 3600) + ':' : ''}${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}`; };
    const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const words = t => (String(t || '').match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) || []).length;

    const TYPES = {
        chrono: ['⏱️', 'Chronomètre', 'Le temps passé sur ce projet (aujourd’hui et en tout)'],
        timer: ['⏳', 'Minuteur', 'Un compte à rebours qui sonne ; mode Pomodoro (25 + 5 min)'],
        words: ['🎯', 'Objectif de mots', 'Les mots écrits aujourd’hui dans les brouillons, et l’objectif du jour'],
        todo: ['✅', 'À faire avant…', 'Les tâches du projet à finir avant une date'],
        reminders: ['🔔', 'Rappels', 'Tes rappels à venir (de la liste Rappels)'],
        agenda: ['🗓️', 'Agenda du projet', 'Visites d’archives, salons, circuits, courriers… liés au projet'],
        notes: ['🗒️', 'Bloc-notes', 'Un texte libre, enregistré tout seul'],
        dash: ['📊', 'Widget du tableau de bord', 'Un widget du logiciel (Mon agenda, Départs et émigration, Circuits…)'],
    };
    const DEFAULT_CFG = {chrono: {}, timer: {minutes: 25, pomodoro: false}, words: {goal: 500}, todo: {days: 14}, reminders: {days: 30, n: 6}, agenda: {days: 90, srcs: ['archive_visit', 'fair', 'field_trip', 'courrier_relance'], word: '', pins: []}, notes: {text: ''}, dash: {type: 'agenda_widget'}};
    const listFor = pid => (read(KEY)[pid] || null);
    const saveList = (pid, list) => { const all = read(KEY); all[pid] = list; write(KEY, all); };

    /* ─── Chronomètres et minuteurs : ils tournent même quand on regarde ailleurs ─── */
    const timers = () => read(TKEY);
    const setTimer = (id, t) => { const all = timers(); if (t) all[id] = t; else delete all[id]; write(TKEY, all); };
    function ring(label) {
        try { const c = new (window.AudioContext || window.webkitAudioContext)(); [0, 0.35, 0.7].forEach(t => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(0.0001, c.currentTime + t); g.gain.exponentialRampToValueAtTime(0.3, c.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t + 0.3); o.connect(g).connect(c.destination); o.start(c.currentTime + t); o.stop(c.currentTime + t + 0.32); }); setTimeout(() => c.close(), 1500); } catch (_) {}
        toast('⏳ ' + label, 'success');
        try { if (window.Notification && Notification.permission === 'granted') new Notification('LCNDA — Atelier', {body: label}); } catch (_) {}
    }
    setInterval(() => { // fin des minuteurs, où que l'on soit dans le logiciel
        const all = timers(); let changed = false;
        Object.entries(all).forEach(([id, t]) => {
            if (t.kind !== 'timer' || !t.end || t.paused || t.end > Date.now() || t.rang) return;
            if (t.pomodoro) { const brk = !t.onBreak; ring(brk ? `Pause de ${t.breakMin || 5} min !` : 'On reprend : nouvelle séance de travail.'); Object.assign(t, {onBreak: brk, end: Date.now() + (brk ? (t.breakMin || 5) : t.minutes) * 60000, rounds: (t.rounds || 0) + (brk ? 1 : 0)}); }
            else { ring(`Minuteur terminé (${t.minutes} min).`); t.rang = true; }
            changed = true;
        });
        if (changed) write(TKEY, all);
    }, 1000);

    /* ─── Le rendu ─── */
    const agendaCache = {at: 0, data: null};
    const agenda = async () => { if (!agendaCache.data || Date.now() - agendaCache.at > 30000) { agendaCache.data = await A().api('my_agenda'); agendaCache.at = Date.now(); } return agendaCache.data; };
    const SRC = {fair: '🎪 Salons', archive_visit: '🏛️ Visites d’archives', reminder: '🔔 Rappels', courrier: '✉️ Courriers envoyés', courrier_relance: '📮 Relances', field_trip: '🚗 Circuits', budget: '💶 Renouvellements', investigation: '🔍 Rappels d’enquête'};
    const dateFr = iso => { const [y, m, d] = String(iso).split('-').map(Number); return d ? new Date(y, m - 1, d).toLocaleDateString('fr-FR', {weekday: 'short', day: 'numeric', month: 'short'}) : ''; };

    async function widgetBody(w, ctx) {
        const c = {...DEFAULT_CFG[w.type], ...(w.cfg || {})};
        switch (w.type) {
            case 'chrono': { const t = timers()[w.id] || {kind: 'chrono', total: 0, day: todayIso(), today: 0};
                const run = t.start ? Date.now() - t.start : 0, today = (t.day === todayIso() ? t.today : 0) + run;
                return `<div class="h-atw-big" data-atw-clock>${hms(today)}</div><p class="muted">aujourd’hui · en tout <b data-atw-total>${hms((t.total || 0) + run)}</b></p>
                    <div class="h-atw-row"><button type="button" class="button small" data-atw-do="chrono-toggle">${t.start ? '⏸ Pause' : '▶ Démarrer'}</button><button type="button" class="button small secondary" data-atw-do="chrono-reset" title="Remettre aujourd’hui à zéro">↺</button></div>`; }
            case 'timer': { const t = timers()[w.id]; const left = t ? (t.paused ? t.left : t.end - Date.now()) : c.minutes * 60000;
                return `<div class="h-atw-big ${t?.onBreak ? 'is-break' : ''}" data-atw-clock>${hms(Math.max(0, left))}</div>${t?.pomodoro || c.pomodoro ? `<p class="muted">${t?.onBreak ? '☕ pause' : '✍️ travail'} · ${A().plural(t?.rounds || 0, 'séance faite', 'séances faites')}</p>` : `<p class="muted">${c.minutes} min</p>`}
                    <div class="h-atw-row"><button type="button" class="button small" data-atw-do="timer-toggle">${t && !t.paused && !t.rang ? '⏸ Pause' : '▶ Démarrer'}</button><button type="button" class="button small secondary" data-atw-do="timer-reset">↺</button>
                    ${[5, 15, 25, 45].map(m => `<button type="button" class="button small secondary" data-atw-min="${m}">${m}</button>`).join('')}</div>`; }
            case 'words': { const now = ctx.items.filter(i => i.type === 'draft').reduce((s, i) => s + words(i.data?.text), 0);
                const base = read('genealogie-atelier-wordbase'), k = `${ctx.project.id}`; if (!base[k] || base[k].day !== todayIso()) { base[k] = {day: todayIso(), words: now}; write('genealogie-atelier-wordbase', base); }
                const done = Math.max(0, now - base[k].words), pct = Math.min(100, Math.round(done / Math.max(1, c.goal) * 100)), target = Number(ctx.project.target_words) || 0;
                return `<div class="h-atw-big">${done.toLocaleString('fr-FR')} <small>/ ${Number(c.goal).toLocaleString('fr-FR')} mots</small></div><div class="h-progress"><span style="width:${pct}%"></span></div>
                    <p class="muted">${pct >= 100 ? '🎉 Objectif du jour atteint !' : `encore ${(c.goal - done).toLocaleString('fr-FR')} mots aujourd’hui`}${target ? ` · projet : ${now.toLocaleString('fr-FR')} / ${target.toLocaleString('fr-FR')}` : ''}</p>`; }
            case 'todo': { const lim = new Date(Date.now() + c.days * 864e5), limIso = `${lim.getFullYear()}-${pad(lim.getMonth() + 1)}-${pad(lim.getDate())}`;
                const tasks = ctx.items.filter(i => i.type === 'task' && !Number(i.data?.done)), due = tasks.filter(i => i.data?.due && i.data.due <= limIso).sort((a, b) => a.data.due.localeCompare(b.data.due)), late = due.filter(i => i.data.due < todayIso()).length;
                return `<div class="h-atw-big">${due.length} <small>${due.length > 1 ? 'tâches' : 'tâche'} avant le ${lim.toLocaleDateString('fr-FR', {day: 'numeric', month: 'long'})}</small></div>${late ? `<p class="h-at-late">⏰ ${late} en retard</p>` : ''}
                    <ul class="h-atw-list">${due.slice(0, 8).map(i => `<li><button type="button" class="link-button" data-atw-item="${i.id}">${esc(i.title)}</button> <small class="muted">${dateFr(i.data.due)}</small></li>`).join('')}</ul>${tasks.length > due.length ? `<p class="muted">+ ${tasks.length - due.length} sans échéance ou plus tard</p>` : ''}`; }
            case 'reminders': case 'agenda': { const a = await agenda(), end = new Date(Date.now() + c.days * 864e5), endIso = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`, t0 = todayIso();
                let rows = a.items.filter(it => w.type === 'reminders' ? it.src === 'reminder' : (c.pins.includes(it.src + ':' + it.id) || (c.srcs.includes(it.src) && (!c.word || (it.title + ' ' + it.sub).toLowerCase().includes(c.word.toLowerCase())))));
                rows = rows.filter(it => (it.end || it.start) >= t0 && it.start <= endIso || (w.type === 'reminders' && !it.done && it.start < t0));
                return rows.length ? `<ul class="h-atw-list">${rows.slice(0, c.n || 10).map(it => `<li class="${it.start < t0 ? 'h-at-late' : ''}"><b>${it.start < t0 ? '⏰ en retard' : dateFr(it.start)}</b> <button type="button" class="link-button" data-atw-agenda="${esc(it.src + ':' + it.id)}">${esc(it.title)}</button>${it.sub ? ` <small class="muted">${esc(it.sub)}</small>` : ''}</li>`).join('')}</ul>`
                    : `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📅</span><span class="empty-line-text">Rien ${w.type === 'reminders' ? 'à te rappeler' : 'de prévu pour ce projet'} d’ici ${c.days} jours.${w.type === 'agenda' && !c.pins.length && !c.word ? ' ⚙ pour épingler des visites, salons…' : ''}</span></p>`; }
            case 'notes': return `<textarea class="h-atw-notes" data-atw-notes rows="6" placeholder="Idées, pistes, choses à ne pas oublier…">${esc(c.text)}</textarea>`;
            case 'dash': { const d = ext.dashboard?.[c.type]; if (!d) return '<p class="muted">Ce widget n’existe plus.</p>';
                const data = await d.load?.().catch(() => null); const html = d.render('·', {id: w.id, type: c.type, limit: c.limit || 8, config: c.config || {}}, '12', data) || '';
                return `<div class="h-atw-dash">${html}</div>`; }
        }
        return '';
    }
    const dashChoices = () => Object.keys(ext.dashboard || {}).map(k => [k, A().dashboardWidgetLabel?.(k) || k.replace(/_widget$/, '').replace(/_/g, ' ')]);

    function settingsDialog(w, after, ctx) {
        const c = {...DEFAULT_CFG[w.type], ...(w.cfg || {})};
        let body = `<label>Titre<input name="title" value="${esc(w.title || '')}" placeholder="${esc(TYPES[w.type][1])}"></label>`;
        if (w.type === 'timer') body += `<label>Durée<input data-ui-duration="min" type="number" name="minutes" min="1" max="600" value="${c.minutes}"></label><label class="checkbox-line"><input type="checkbox" name="pomodoro" ${c.pomodoro ? 'checked' : ''}> Pomodoro : travail puis pause de 5 min, en boucle</label>`;
        if (w.type === 'words') body += `<label>Objectif de mots par jour<input type="number" name="goal" min="10" max="100000" value="${c.goal}"></label>`;
        if (w.type === 'todo') body += `<label>Les tâches à faire dans les … prochains jours<input type="number" name="days" min="1" max="3650" value="${c.days}"></label>`;
        if (w.type === 'reminders' || w.type === 'agenda') body += `<label>Sur combien de jours ?<input type="number" name="days" min="1" max="3650" value="${c.days}"></label><label>Combien au plus ?<input type="number" name="n" min="1" max="50" value="${c.n || 10}"></label>`;
        if (w.type === 'agenda') body += `<fieldset class="h-rc-modes"><legend>Quelles sortes ?</legend>${Object.entries(SRC).map(([k, l]) => `<label class="checkbox-line"><input type="checkbox" name="srcs" value="${k}" ${c.srcs.includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</fieldset>
            <label>Seulement ceux qui contiennent le mot <small class="muted">(facultatif)</small><input name="word" value="${esc(c.word)}" placeholder="optique, Bourges…"></label>
            <fieldset class="h-rc-modes"><legend>📌 Épinglés à ce projet (toujours montrés)</legend><div data-atw-pins class="h-rc-results">${window.LCNDA_UI.spinner('Chargement…')}</div></fieldset>`;
        if (w.type === 'dash') body += `<label>Widget<select name="dtype">${dashChoices().map(([k, l]) => `<option value="${k}" ${c.type === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label><label>Nombre d’éléments<input type="number" name="limit" min="1" max="50" value="${c.limit || 8}"></label>`;
        ext.openDialog({eyebrow: 'WIDGET', title: TYPES[w.type][0] + ' ' + TYPES[w.type][1], submitLabel: 'Enregistrer', body,
            onOpen: async d => { const box = d.querySelector('[data-atw-pins]'); if (!box) return; const a = await agenda();
                box.innerHTML = a.items.filter(it => it.start >= todayIso() || c.pins.includes(it.src + ':' + it.id)).slice(0, 200).map(it => `<label class="checkbox-line"><input type="checkbox" name="pins" value="${esc(it.src + ':' + it.id)}" ${c.pins.includes(it.src + ':' + it.id) ? 'checked' : ''}> ${esc(dateFr(it.start))} — ${esc(it.title)} <small class="muted">${esc(SRC[it.src] || '')}</small></label>`).join('') || '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📅</span><span class="empty-line-text">Rien à venir dans ton agenda.</span></p>'; },
            onSubmit: form => { const fd = new FormData(form); w.title = String(fd.get('title') || '').trim();
                if (w.type === 'timer') w.cfg = {minutes: Math.max(1, Number(fd.get('minutes')) || 25), pomodoro: fd.has('pomodoro')};
                if (w.type === 'words') w.cfg = {goal: Math.max(10, Number(fd.get('goal')) || 500)};
                if (w.type === 'todo') w.cfg = {days: Math.max(1, Number(fd.get('days')) || 14)};
                if (w.type === 'reminders') w.cfg = {days: Number(fd.get('days')) || 30, n: Number(fd.get('n')) || 6};
                if (w.type === 'agenda') w.cfg = {days: Number(fd.get('days')) || 90, n: Number(fd.get('n')) || 10, srcs: fd.getAll('srcs'), word: String(fd.get('word') || '').trim(), pins: fd.getAll('pins')};
                if (w.type === 'dash') w.cfg = {type: fd.get('dtype'), limit: Number(fd.get('limit')) || 8};
                if (w.type === 'timer') setTimer(w.id, null);
                after(); },
        });
    }

    /** Remplit la case des widgets d'un projet. ctx : {project, items, openItem(id)}. */
    ext.atelierWidgets = async (box, ctx) => {
        if (!box) return;
        const pid = String(ctx.project.id);
        let list = listFor(pid) || [{id: uid(), type: 'words', cfg: {}}, {id: uid(), type: 'todo', cfg: {}}, {id: uid(), type: 'agenda', cfg: {}}];
        const save = () => saveList(pid, list);
        const draw = async () => {
            box.innerHTML = `<div class="h-atw-head"><h4>🧩 Mes widgets</h4><button type="button" class="button small secondary" data-atw-add>＋ Widget</button></div><div class="h-atw-grid">${list.map((w, k) => `<section class="h-atw ${w.type === 'dash' || w.type === 'agenda' ? 'is-wide' : ''}" data-atw="${w.id}">
                <header><b>${TYPES[w.type]?.[0] || '•'} ${esc(w.title || TYPES[w.type]?.[1] || '')}</b><span class="h-rb-tools"><button type="button" class="icon-button" data-atw-move="-1" ${k ? '' : 'disabled'} title="Avancer">←</button><button type="button" class="icon-button" data-atw-move="1" ${k < list.length - 1 ? '' : 'disabled'} title="Reculer">→</button><button type="button" class="icon-button" data-atw-cfg title="Réglages">⚙</button><button type="button" class="icon-button danger" data-atw-del title="Retirer">✕</button></span></header>
                <div class="h-atw-body" data-atw-body><p class="muted">…</p></div></section>`).join('')}</div>`;
            for (const w of list) { const b = box.querySelector(`[data-atw="${w.id}"] [data-atw-body]`); try { b.innerHTML = await widgetBody(w, ctx); } catch (e) { b.innerHTML = `<p class="muted">${esc(e.message)}</p>`; } }
        };
        await draw();
        box.addEventListener('click', async e => {
            const sec = e.target.closest('[data-atw]'), w = sec ? list.find(x => x.id === sec.dataset.atw) : null;
            if (e.target.closest('[data-atw-add]')) return ext.openDialog({eyebrow: 'WIDGETS DU PROJET', title: 'Ajouter un widget', submitLabel: 'Fermer', body: `<div class="h-at-exports">${Object.entries(TYPES).map(([k, [ic, l, h]]) => `<button type="button" class="button secondary" data-atw-new="${k}">${ic} ${esc(l)}<small>${esc(h)}</small></button>`).join('')}</div>`,
                onOpen: d => d.querySelectorAll('[data-atw-new]').forEach(b => b.addEventListener('click', () => { const nw = {id: uid(), type: b.dataset.atwNew, cfg: {}}; list.push(nw); save(); d.close(); draw(); if (['dash', 'agenda'].includes(nw.type)) settingsDialog(nw, () => { save(); draw(); }, ctx); })), onSubmit: () => true});
            if (!w) { const it = e.target.closest('[data-atw-item]'); return; }
            const mv = e.target.closest('[data-atw-move]'); if (mv) { const i = list.indexOf(w), j = i + Number(mv.dataset.atwMove); if (j >= 0 && j < list.length) { [list[i], list[j]] = [list[j], list[i]]; save(); draw(); } return; }
            if (e.target.closest('[data-atw-del]')) { const at = list.indexOf(w); list = list.filter(x => x !== w); setTimer(w.id, null); save(); draw(); // H7 : « ↶ Annuler »
                A().undoToast('Widget retiré.', {undo: () => { if (!list.includes(w)) list.splice(Math.min(at, list.length), 0, w); save(); draw(); }}); return; }
            if (e.target.closest('[data-atw-cfg]')) return settingsDialog(w, () => { save(); draw(); }, ctx);
            const item = e.target.closest('[data-atw-item]'); if (item) return ctx.openItem?.(Number(item.dataset.atwItem));
            const ag = e.target.closest('[data-atw-agenda]'); if (ag) { const [src, id] = ag.dataset.atwAgenda.split(':'); const it = agendaCache.data?.items.find(x => x.src === src && String(x.id) === id); if (it) ext.lists?.my_calendar_open?.(it); return; }
            const doBtn = e.target.closest('[data-atw-do]'), min = e.target.closest('[data-atw-min]');
            if (doBtn || min) {
                const c = {...DEFAULT_CFG[w.type], ...(w.cfg || {})}, a = doBtn?.dataset.atwDo;
                if (a === 'chrono-toggle') { const t = timers()[w.id] || {kind: 'chrono', total: 0, today: 0, day: todayIso()}; if (t.day !== todayIso()) Object.assign(t, {day: todayIso(), today: 0});
                    if (t.start) { const run = Date.now() - t.start; t.total = (t.total || 0) + run; t.today = (t.today || 0) + run; t.start = 0; } else t.start = Date.now(); setTimer(w.id, t); }
                if (a === 'chrono-reset') { const t = timers()[w.id]; if (t && await A().confirmBox('Remettre le temps d’aujourd’hui à zéro ? (le total reste)', {title: 'Remettre à zéro', okLabel: 'Remettre à zéro'})) { Object.assign(t, {today: 0, start: t.start ? Date.now() : 0, day: todayIso()}); setTimer(w.id, t); } }
                if (min) { w.cfg = {...c, minutes: Number(min.dataset.atwMin)}; save(); setTimer(w.id, null); }
                if (a === 'timer-toggle') { let t = timers()[w.id];
                    if (!t || t.rang) { t = {kind: 'timer', minutes: c.minutes, pomodoro: c.pomodoro, end: Date.now() + c.minutes * 60000}; try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (_) {} }
                    else if (t.paused) { t.end = Date.now() + t.left; t.paused = false; } else { t.left = t.end - Date.now(); t.paused = true; }
                    setTimer(w.id, t); }
                if (a === 'timer-reset') setTimer(w.id, null);
                widgetBody(w, ctx).then(h => { sec.querySelector('[data-atw-body]').innerHTML = h; });
            }
        });
        let notesTimer = 0;
        box.addEventListener('input', e => { if (!e.target.matches('[data-atw-notes]')) return; const w = list.find(x => x.id === e.target.closest('[data-atw]').dataset.atw); clearTimeout(notesTimer); notesTimer = setTimeout(() => { w.cfg = {...(w.cfg || {}), text: e.target.value}; save(); }, 500); });
        const tick = setInterval(() => { if (!box.isConnected) return clearInterval(tick);
            list.filter(w => ['chrono', 'timer'].includes(w.type)).forEach(w => { const t = timers()[w.id], el = box.querySelector(`[data-atw="${w.id}"] [data-atw-clock]`); if (!t || !el) return;
                if (w.type === 'chrono' && t.start) { const run = Date.now() - t.start; el.textContent = hms((t.day === todayIso() ? t.today : 0) + run); const tot = box.querySelector(`[data-atw="${w.id}"] [data-atw-total]`); if (tot) tot.textContent = hms((t.total || 0) + run); }
                if (w.type === 'timer' && !t.paused) { el.textContent = hms(Math.max(0, t.end - Date.now())); el.classList.toggle('is-break', !!t.onBreak); } }); }, 500);
    };
})();
