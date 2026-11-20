/* LCNDA — ⚖️ Outils du généalogiste successoral (maquette docs/design/onglets-et-successoral-outils.html, B1, B2, B3, B5).
 * Calculs : heritage-successoral-outils-core.js (window.LCNDA_SUCC_OUTILS) ; serveur : lib/successoral_outils.php.
 *  B1 ⏱ Chronomètre par dossier : bouton dans l'en-tête du dossier ouvert (pas pour un dossier clos ou archivé), un seul à la
 *     fois, gardé hors de l'écran et entre deux fenêtres (localStorage « lcnda-succ-chrono », comme le chronomètre de l'Atelier,
 *     heritage-atelier-widgets.js) ; arrondi à la minute ; pause toute seule après 10 min sans frappe, clic ni défilement ;
 *     « ⏹ Arrêter et noter » → 💶 Temps et frais (succ_fees, une ligne par jour, ⏱ devant) et la colonne « Temps » ;
 *     app fermée : « ⏱ 2026-014 : 1 h 05 comptées avant la fermeture. Noter · Jeter » ; changer de dossier : « Noter et passer ».
 *  B2 🔔 Échéances du jour : bouton en haut à droite (Réglages → Apparence → Boutons en haut à droite, usage successoral),
 *     pastille = retards + aujourd'hui, toutes les généalogies (index léger succ_index, « due_items ») ; ✓ fait, ⏭ demain
 *     ou lundi, ↗ le dossier ; « Ajouter mes rappels » et la bulle de l'ordinateur : non au départ (réglables, ce navigateur).
 *  B3 📋 Avant de remettre au notaire : encadré en haut de « 🖨 Pour le notaire » et fenêtre au passage à « Remis au notaire » ;
 *     ça avertit, ça n'empêche jamais (« Passer à Remis » quand même : une ligne au journal).
 *  B5 📊 Parts en euros : 👥 Héritiers → « Fractions | 💶 En euros » ; l'actif net est retapé à chaque fois, jamais gardé
 *     (ni base, ni navigateur, ni journal) ; l'impôt n'est pas calculé.
 * Jamais en mode consultation ni en mode simple ; tout texte de la base est échappé.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI, O = () => window.LCNDA_SUCC_OUTILS, S = () => window.LCNDA_SUCC_CORE;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const get = (op, q = {}) => A().api('successoral', {op, ...q});
    const post = async body => { const r = await A().api('successoral_write', {}, {method: 'POST', body}); return r.result || r; };
    const toast = (...a) => A().toast(...a);
    const kiosk = () => document.body?.classList.contains('is-kiosk');
    const simple = () => document.documentElement.classList.contains('ms-open');
    const hidden = () => kiosk() || simple();
    const store = {get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } }, set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }};
    const usageOn = () => { const c = store.get('genealogie-usage', null); return Array.isArray(c?.usages) && c.usages.includes('successoral'); };
    const gid = () => String(window.LCNDA_GENEALOGY ?? 'main') === 'main' ? '' : String(window.LCNDA_GENEALOGY);
    const loc = () => (window.LCNDA_I18N?.locale || window.LCNDA_I18N?.lang || 'fr-FR');
    const fmtDate = (iso, o = {day: 'numeric', month: 'short'}) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return String(iso || ''); const d = new Date(+m[1], +m[2] - 1, +m[3], 12); try { return window.LCNDA_I18N?.fmtDate ? window.LCNDA_I18N.fmtDate(d, o) : d.toLocaleDateString('fr-FR', o); } catch (_) { return iso; } };
    const hm = min => i18n('{h} h {m}', {h: Math.floor(min / 60), m: String(min % 60).padStart(2, '0')});
    const clock = ms => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
    const badge = (t, k = 'grey') => (UI()?.badge ? UI().badge(t, k) : `<span class="ui-badge is-${k}">${esc(t)}</span>`);
    const outils = ext.succOutils = ext.succOutils || {};

    /* ══════════ B1. ⏱ Le chronomètre ══════════ */
    const CKEY = 'lcnda-succ-chrono', AKEY = 'lcnda-succ-chrono-act';
    const chrono = () => store.get(CKEY, null);
    const setChrono = st => { store.set(CKEY, st); paintChrono(); };
    let lastAct = Date.now(), actWrite = 0;
    const touch = () => { lastAct = Date.now(); if (lastAct - actWrite > 5000) { actWrite = lastAct; store.set(AKEY, lastAct); } };
    ['keydown', 'pointerdown', 'wheel', 'scroll'].forEach(ev => window.addEventListener(ev, touch, {passive: true, capture: true}));
    const lastActivity = () => Math.max(lastAct, Number(store.get(AKEY, 0)) || 0);
    const running = st => !!st?.start;
    const caseOpen = () => ext.successoral?.current?.() || null;
    /** le bouton de l'en-tête du dossier (heritage-successoral.js, renderCase) ; rien pour un dossier clos ou archivé */
    outils.chronoButton = D => {
        if (!D || D.archived || ['clos', 'archive'].includes(D.state) || hidden()) return '';
        const st = chrono(), mine = st && st.caseId === D.id && (st.gid || '') === gid();
        if (!mine) return `<button type="button" class="button secondary succ-chrono-btn" data-succ-chrono="start" title="${esc(i18n('⏱ Compter le temps passé sur ce dossier'))}">⏱</button>`;
        const on = running(st), ms = O().elapsed(st);
        return `<span class="succ-chrono-grp${on ? ' is-on' : ' is-paused'}"><span class="succ-chrono-clock" data-succ-chrono-clock title="${esc(i18n('⏱ Compter le temps passé sur ce dossier'))}">⏱ <b>${clock(ms)}</b><small class="succ-chrono-short">${esc(i18n('{n} min', {n: Math.round(ms / 60000)}))}</small>${on ? '' : ` <small>· ${esc(i18n('en pause'))}</small>`}</span>
            <button type="button" class="button small secondary" data-succ-chrono="${on ? 'pause' : 'resume'}">${esc(on ? i18n('⏸️ Pause') : i18n('▶️ Reprendre'))}</button><button type="button" class="button small" data-succ-chrono="stop">${esc(i18n('⏹️ Arrêter et noter'))}</button></span>`;
    };
    function startChrono(D) {
        const st = chrono();
        if (st && !(st.caseId === D.id && (st.gid || '') === gid())) return switchAsk(st, D);
        setChrono({gid: gid(), caseId: D.id, number: D.number, title: D.title, start: Date.now(), segs: [], tabs: [], paused: '', seen: Date.now()});
        touch();
    }
    function pauseChrono(why = 'hand') { const st = chrono(); if (!running(st)) return; setChrono({...st, start: 0, segs: [...st.segs, {from: st.start, to: Date.now()}], paused: why, gap: null}); }
    function resumeChrono(withGap = false) {
        const st = chrono(); if (!st || running(st)) return;
        const segs = withGap && st.gap ? [...st.segs, st.gap] : st.segs;
        setChrono({...st, segs, start: Date.now(), paused: '', gap: null, closed: false}); touch();
    }
    /** ⏹ Arrêter et noter : une ligne par jour dans 💶 Temps et frais (la généalogie du dossier) */
    function stopChrono(after) {
        let st = chrono(); if (!st) return;
        if (running(st)) { st = {...st, start: 0, segs: [...st.segs, {from: st.start, to: Date.now()}]}; store.set(CKEY, st); }
        const days = O().byDay(st.segs), total = days.reduce((a, d) => a + d.minutes, 0);
        const label = O().chronoLabel((st.tabs || []).map(k => i18n(k)), i18n);
        const one = days.length <= 1;
        const discard = () => { store.set(CKEY, null); paintChrono(); after?.(); };
        if (!total) { toast(i18n('Moins d’une minute : rien à noter.')); return discard(); }
        ext.openDialog({eyebrow: i18n('💶 TEMPS ET FRAIS'), title: i18n('Noter le temps passé'), submitLabel: i18n('Noter {t}', {t: hm(total)}),
            body: `<div class="succ-form succ-chrono-note"><p class="muted">${esc(i18n('Dossier {n}', {n: st.number}))}${st.title ? ' · ' + esc(st.title) : ''}</p>
                ${one ? `<div class="form-grid"><label>${esc(i18n('Heures'))}<input type="number" name="h" min="0" max="23" value="${Math.floor(total / 60)}"></label><label>${esc(i18n('Minutes'))}<input type="number" name="m" min="0" max="59" value="${String(total % 60).padStart(2, '0')}"></label></div>`
                    : `<ul class="succ-chrono-days">${days.map(d => `<li><b>${esc(fmtDate(d.day))}</b> ${esc(hm(d.minutes))}</li>`).join('')}</ul>`}
                <label>${esc(i18n('Quoi'))}<input name="label" maxlength="300" value="${esc(label)}"></label>
                <p class="ui-hint">${esc(i18n('Proposé d’après les onglets ouverts ; à corriger si besoin. Date : {d}.', {d: one ? fmtDate(days[0]?.day || O().isoDay(new Date())) : i18n('Minuit passé : une ligne par jour.')}))}</p>
                <p><button type="button" class="button small secondary danger" data-succ-chrono-drop>${esc(i18n('Jeter ce temps'))}</button></p></div>`,
            onOpen: d => {
                d.querySelector('[data-succ-chrono-drop]').addEventListener('click', async () => { if (await A().confirmBox(i18n('Jeter ce temps ?'), {title: i18n('Jeter ce temps'), okLabel: i18n('Jeter')})) { d.close(); discard(); } });
                const f = d.querySelector('form'), sub = d.querySelector('[type=submit]');
                const upd = () => { if (!one) return; const v = (Number(f.h.value) || 0) * 60 + (Number(f.m.value) || 0); sub.textContent = i18n('Noter {t}', {t: hm(v)}); };
                f.h?.addEventListener('input', upd); f.m?.addEventListener('input', upd);
            },
            onSubmit: async f => {
                const list = one ? [{day: days[0]?.day || O().isoDay(new Date()), minutes: (Number(f.h.value) || 0) * 60 + (Number(f.m.value) || 0)}] : days.map(d => ({day: d.day, minutes: d.minutes}));
                const sum = list.reduce((a, d) => a + d.minutes, 0);
                if (!sum) { UI().fail(f.h || f.label, i18n('Combien de temps ?')); return false; }
                if (sum * 60000 > O().LONG_MS && !(await A().confirmBox(i18n('{t} d’affilée : c’est bien ça ?', {t: hm(sum)}), {title: i18n('Plus de 10 h d’affilée'), okLabel: i18n('Noter quand même')}))) return false;
                let r; try { r = await post({op: 'chrono_note', gid: st.gid || '', case_id: st.caseId, days: list, label: f.label.value}); } catch (e) { toast(e.message, 'error'); return false; }
                store.set(CKEY, null); paintChrono();
                A().undoToast(i18n('⏱ {t} notées dans le dossier {n}', {t: hm(sum), n: st.number}), {undo: async () => { await post({op: 'chrono_undo', gid: st.gid || '', case_id: st.caseId, ids: r.ids}); refreshCase(); }});
                refreshCase(); after?.();
            }});
    }
    const refreshCase = () => { const D = caseOpen(); if (D && (chrono()?.gid || '') === gid()) { ext.successoral?.reload?.(); } ext.succDossiers?.memDirty?.(); ext.succDossiers?.refresh?.(); };
    /** changer de dossier pendant qu'il tourne */
    let asked = 0;
    function switchAsk(st, D) {
        if (asked === D.id) return; asked = D.id;
        floatMsg(`${esc(i18n('Le chronomètre compte pour {n}.', {n: st.number}))} <button type="button" class="button small" data-succ-chrono-switch="${Number(D.id)}">${esc(i18n('⏹️ Noter et passer à {n}', {n: D.number}))}</button> <button type="button" class="button small secondary" data-succ-chrono-keep>${esc(i18n('Continuer sur {n}', {n: st.number}))}</button>`);
    }
    /** les onglets ouverts pendant le comptage (pour « Quoi ») ; un autre dossier ouvert : « Noter et passer » */
    outils.onCase = (D, tab, label) => {
        const st = chrono(); if (!st || !D) return;
        if (st.caseId === D.id && (st.gid || '') === gid()) { if (running(st) && label && !['dossier', 'journal', 'fees'].includes(tab) && !(st.tabs || []).includes(label)) store.set(CKEY, {...st, tabs: [...(st.tabs || []), label].slice(-6)}); asked = 0; return; }
        if (running(st) && !D.archived && !['clos', 'archive'].includes(D.state)) switchAsk(st, D);
    };
    // la petite bulle en bas : il tourne même ailleurs dans l'app, et les messages (pause toute seule, fermeture, autre dossier)
    let msgHtml = '';
    function floatMsg(html) { msgHtml = html; paintChrono(); }
    function paintChrono() {
        const st = chrono();
        let el = document.getElementById('succ-chrono-float');
        if (!st || hidden() || !usageOn()) { el?.remove(); document.title = document.title.replace(/^⏱ [^·]* · /, ''); return; }
        if (!el) { el = document.createElement('div'); el.id = 'succ-chrono-float'; el.className = 'succ-chrono-float'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
        const on = running(st), ms = O().elapsed(st);
        el.classList.toggle('is-on', on);
        el.innerHTML = `<div class="succ-chrono-row"><button type="button" class="link-button" data-succ-chrono-open title="${esc(i18n('Ouvrir le dossier'))}">⏱ ${esc(st.number)}</button> <b data-succ-chrono-fclock>${clock(ms)}</b>${on ? '' : ` <small>${esc(i18n('en pause'))}</small>`}
            <button type="button" class="icon-button small" data-succ-chrono="${on ? 'pause' : 'resume'}" aria-label="${esc(on ? i18n('⏸️ Pause') : i18n('▶️ Reprendre'))}" title="${esc(on ? i18n('⏸️ Pause') : i18n('▶️ Reprendre'))}">${on ? '⏸️' : '▶️'}</button><button type="button" class="icon-button small" data-succ-chrono="stop" aria-label="${esc(i18n('⏹️ Arrêter et noter'))}" title="${esc(i18n('⏹️ Arrêter et noter'))}">⏹️</button></div>${msgHtml ? `<div class="succ-chrono-msg">${msgHtml}</div>` : ''}`;
        const t = document.title.replace(/^⏱ [^·]* · /, ''); document.title = on ? `⏱ ${st.number} · ${t}` : t;
        document.querySelectorAll('.succ-page [data-succ-chrono-slot]').forEach(slot => { const D = caseOpen(); if (D) slot.innerHTML = outils.chronoButton(D); });
    }
    function tickChrono() {
        const st = chrono(); if (!st) return;
        const ms = O().elapsed(st);
        document.querySelectorAll('[data-succ-chrono-clock] b, [data-succ-chrono-fclock]').forEach(b => { b.textContent = clock(ms); });
        document.querySelectorAll('[data-succ-chrono-clock] .succ-chrono-short').forEach(b => { b.textContent = i18n('{n} min', {n: Math.round(ms / 60000)}); });
        if (running(st)) {
            if (Date.now() - (st.seen || 0) > 15000) store.set(CKEY, {...st, seen: Date.now()});
            const p = O().autoPause(st, lastActivity());
            if (p) { store.set(CKEY, p); const at = new Date(p.gap.from); floatMsg(`⏸️ ${esc(i18n('Rien touché depuis 10 min : chronomètre en pause à {h}.', {h: at.toLocaleTimeString(loc(), {hour: '2-digit', minute: '2-digit'})}))} <button type="button" class="button small" data-succ-chrono="resume">${esc(i18n('Reprendre'))}</button> <button type="button" class="button small secondary" data-succ-chrono="gap">${esc(i18n('Compter aussi ces 10 min'))}</button>`); }
        }
    }
    /** à l'ouverture de l'app : un chronomètre resté allumé (app fermée) — le temps jusqu'à la fermeture est gardé */
    function chronoAtStart() {
        const st = chrono(); if (!st) return;
        if (running(st) && Date.now() - (st.seen || st.start) > 60000) {
            const to = Math.max(st.start, st.seen || st.start), next = {...st, start: 0, segs: [...st.segs, {from: st.start, to}], paused: 'closed'};
            store.set(CKEY, next);
            const min = O().roundMinutes(O().elapsed(next));
            floatMsg(`${esc(i18n('⏱ {n} : {t} comptées avant la fermeture.', {n: st.number, t: hm(min)}))} <button type="button" class="button small" data-succ-chrono="stop">${esc(i18n('Noter'))}</button> <button type="button" class="button small secondary danger" data-succ-chrono="drop">${esc(i18n('Jeter'))}</button>`);
        } else paintChrono();
    }
    document.addEventListener('click', async e => {
        const b = e.target.closest?.('[data-succ-chrono], [data-succ-chrono-switch], [data-succ-chrono-keep], [data-succ-chrono-open]'); if (!b || hidden()) return;
        e.preventDefault();
        const D = caseOpen();
        if (b.matches('[data-succ-chrono-open]')) { const st = chrono(); if (st && (st.gid || '') === gid()) ext.successoral?.openCase?.(st.caseId); return; }
        if (b.matches('[data-succ-chrono-keep]')) { msgHtml = ''; paintChrono(); return; }
        if (b.matches('[data-succ-chrono-switch]')) { const id = Number(b.dataset.succChronoSwitch); msgHtml = ''; asked = 0; return stopChrono(() => { const C = caseOpen(); if (C && C.id === id) startChrono(C); }); }
        const a = b.dataset.succChrono; msgHtml = '';
        if (a === 'start' && D) startChrono(D);
        else if (a === 'pause') pauseChrono('hand');
        else if (a === 'resume') resumeChrono(false);
        else if (a === 'gap') resumeChrono(true);
        else if (a === 'stop') stopChrono();
        else if (a === 'drop') { if (await A().confirmBox(i18n('Jeter ce temps ?'), {title: i18n('Jeter ce temps'), okLabel: i18n('Jeter')})) { store.set(CKEY, null); } }
        paintChrono();
    });
    window.addEventListener('storage', e => { if (e.key === CKEY) paintChrono(); }); // deux fenêtres de l'app : un seul chronomètre

    /* ══════════ B2. 🔔 Les échéances du jour ══════════ */
    const BKEY = 'lcnda-succ-bell'; // {rappels: false, notify: false, scope: 'all' | 'here'} (ce navigateur)
    const bellCfg = () => ({rappels: false, notify: false, scope: 'all', ...(store.get(BKEY, {}) || {})});
    const bellBtn = () => document.getElementById('succ-bell-open');
    let bell = {items: [], errors: [], at: 0, busy: null, open: false, foldWeek: true};
    async function loadBell() {
        if (hidden() || !usageOn()) return null;
        if (bell.busy) return bell.busy;
        bell.busy = (async () => {
            const items = [], errors = [];
            try {
                const d = await get('index');
                for (const b of d.bases || []) {
                    if (b.error) { errors.push(b.name); continue; }
                    for (const c of b.cases || []) for (const x of c.due_items || []) items.push({...x, gid: b.id, gname: b.name, active: !!b.active, case_id: c.id, number: c.number, deceased: c.deceased || '', title: c.title});
                }
            } catch (_) { errors.push(i18n('Dossiers de succession')); }
            if (bellCfg().rappels) { try { const r = await get('rappels'); (r.items || []).forEach(x => items.push({...x, kind: 'rappel', gid: gid(), gname: '', active: true})); } catch (_) {} }
            bell = {...bell, items, errors, at: Date.now()};
            paintBell(); return bell;
        })().finally(() => { bell.busy = null; });
        return bell.busy;
    }
    function paintBell() {
        const b = bellBtn(); if (!b) return;
        const on = usageOn() && !hidden();
        b.hidden = !on; if (!on) { closeBell(); return; }
        const cfg = bellCfg(), list = cfg.scope === 'here' ? bell.items.filter(x => x.gid === gid()) : bell.items;
        const g = O().bellGroups(list);
        const pill = b.querySelector('[data-succ-bell-n]');
        if (pill) { pill.textContent = g.badge; pill.hidden = !g.badge; }
        const lab = g.count ? i18n('Échéances du jour : {n} à faire (retards et aujourd’hui)', {n: g.count}) : i18n('🔔 Échéances du jour');
        b.title = lab; b.setAttribute('aria-label', lab);
        if (bell.open) drawPanel();
    }
    const kindTxt = x => x.kind === 'rappel' ? i18n('⏰ Rappel') : '';
    function rowHtml(x) {
        const where = [x.number ? `${x.number}${x.deceased ? ' ' + String(x.deceased).split(' ').pop() : ''}` : kindTxt(x), x.gid !== gid() && x.gname ? `🌳 ${x.gname}` : '', i18n('prévu le {d}', {d: fmtDate(x.due)})].filter(Boolean).join(' · ');
        const key = esc(`${x.kind}|${x.gid}|${x.id || x.key}`);
        return `<li class="succ-bell-row" data-succ-bell-row="${key}"><div class="succ-bell-txt"><b>${esc(x.label)}</b><small>${esc(where)}</small></div><div class="succ-bell-acts">
            <button type="button" class="icon-button small" data-succ-bell-do="done" data-k="${key}" title="${esc(i18n('✓ Fait'))}" aria-label="${esc(i18n('✓ Fait'))}">✓</button>
            <button type="button" class="icon-button small" data-succ-bell-do="snooze" data-k="${key}" title="${esc(i18n('⏭ Demain (ou lundi)'))}" aria-label="${esc(i18n('⏭ Demain (ou lundi)'))}">⏭</button>
            ${x.kind === 'rappel' ? '' : `<button type="button" class="icon-button small" data-succ-bell-do="open" data-k="${key}" title="${esc(i18n('↗ Ouvrir le dossier'))}" aria-label="${esc(i18n('↗ Ouvrir le dossier'))}">↗</button>`}</div></li>`;
    }
    function drawPanel() {
        let p = document.getElementById('succ-bell-panel');
        if (!p) { p = document.createElement('div'); p.id = 'succ-bell-panel'; p.className = 'succ-bell-panel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', i18n('🔔 Échéances du jour')); document.body.appendChild(p); }
        const cfg = bellCfg(), list = cfg.scope === 'here' ? bell.items.filter(x => x.gid === gid()) : bell.items;
        const g = O().bellGroups(list);
        const today = new Date();
        let dayTxt; try { dayTxt = window.LCNDA_I18N?.fmtDate ? window.LCNDA_I18N.fmtDate(today, {weekday: 'long', day: 'numeric', month: 'long'}) : today.toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric', month: 'long'}); } catch (_) { dayTxt = ''; }
        const sec = (title, items, fold = false) => !items.length ? '' : fold ? `<details class="succ-bell-sec" ${bell.foldWeek ? '' : 'open'} data-succ-bell-week><summary>${esc(title)} · ${items.length} <span class="muted">${esc(i18n('voir ▾'))}</span></summary><ul>${items.map(rowHtml).join('')}</ul></details>`
            : `<section class="succ-bell-sec"><h4>${esc(title)} · ${items.length}</h4><ul>${items.map(rowHtml).join('')}</ul></section>`;
        const next = list.filter(x => x.due > O().isoDay(today)).sort((a, b) => String(a.due).localeCompare(String(b.due)))[0];
        const empty = !g.late.length && !g.today.length ? `<p class="succ-bell-none">✓ ${esc(i18n('Rien pour aujourd’hui.'))}${next ? ' ' + esc(i18n('Prochaine : {d} ({n})', {d: fmtDate(next.due), n: next.number || kindTxt(next)})) : ''}</p>` : '';
        p.innerHTML = `<div class="succ-bell-head"><b>${esc(i18n('🔔 À faire · {d}', {d: dayTxt}))}</b><button type="button" class="icon-button small" data-succ-bell-close aria-label="${esc(i18n('Fermer'))}">×</button></div>
            <div class="segmented succ-bell-scope" role="tablist"><button type="button" role="tab" data-succ-bell-scope="all" class="${cfg.scope !== 'here' ? 'is-active' : ''}" aria-selected="${cfg.scope !== 'here'}">${esc(i18n('Tous les dossiers'))}</button><button type="button" role="tab" data-succ-bell-scope="here" class="${cfg.scope === 'here' ? 'is-active' : ''}" aria-selected="${cfg.scope === 'here'}">${esc(i18n('Cette généalogie'))}</button></div>
            <div class="succ-bell-body">${bell.errors.map(n => `<p class="succ-bell-err">⚠️ ${esc(i18n('⚖️ {name} : impossible de lire les échéances', {name: n}))}</p>`).join('')}
                ${sec(i18n('En retard'), g.late)}${sec(i18n('Aujourd’hui'), g.today)}${empty}${sec(i18n('Cette semaine'), g.week, true)}</div>
            <div class="succ-bell-foot"><p class="ui-hint">${esc(i18n('✓ fait · ⏭ demain / lundi · ↗ ouvre le dossier (change de généalogie si besoin)'))}</p>
                <label class="checkbox-line"><input type="checkbox" data-succ-bell-cfg="rappels" ${cfg.rappels ? 'checked' : ''}> ${esc(i18n('Ajouter mes rappels'))}</label>
                <label class="checkbox-line"><input type="checkbox" data-succ-bell-cfg="notify" ${cfg.notify ? 'checked' : ''}> ${esc(i18n('Bulle de l’ordinateur à l’ouverture de l’app'))}</label>
                <button type="button" class="button small secondary" data-succ-bell-week-open>${esc(i18n('🗓 Ma semaine'))}</button></div>`;
        placePanel(p);
    }
    function placePanel(p) {
        const b = bellBtn(); if (!b || !p) return;
        const r = b.getBoundingClientRect(), w = Math.min(420, window.innerWidth - 16);
        p.style.width = w + 'px'; p.style.top = Math.max(8, r.bottom + 6) + 'px';
        p.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
    }
    function openBell() { bell.open = true; bellBtn()?.setAttribute('aria-expanded', 'true'); drawPanel(); loadBell(); }
    function closeBell() { bell.open = false; bellBtn()?.setAttribute('aria-expanded', 'false'); document.getElementById('succ-bell-panel')?.remove(); }
    async function bellDo(act, key) {
        const [kind, g, id] = key.split('|'); const x = bell.items.find(i => i.kind === kind && i.gid === g && String(i.id || i.key) === id); if (!x) return;
        if (act === 'open') {
            closeBell();
            if (g === gid()) return ext.successoral?.openCase?.(x.case_id);
            if (ext.succDossiers?.openElsewhere) return ext.succDossiers.openElsewhere(g, {id: x.case_id, number: x.number, deceased: x.deceased});
            return;
        }
        const to = O().snoozeDay();
        try {
            if (kind === 'rappel') {
                const r = await A().api('semaine_mark', {}, {method: 'POST', body: {op: act === 'done' ? 'done' : 'snooze', key: x.key, until: to, title: x.label}});
                const prev = (r.result || r).prev;
                A().undoToast(act === 'done' ? i18n('Rappel fait') : i18n('Reporté au {d}', {d: fmtDate(to)}), {undo: async () => { await A().api('semaine_mark', {}, {method: 'POST', body: {op: 'restore', key: x.key, prev}}); loadBell(); }});
            } else {
                const r = await post({op: 'due_mark', gid: g, kind, id: x.id, act, to});
                A().undoToast(act === 'done' ? i18n('✓ Fait : {l}', {l: x.label}) : i18n('Reporté au {d} : {l}', {d: fmtDate(to), l: x.label}), {undo: async () => { await post({op: 'due_mark', gid: g, kind, id: x.id, act: 'undo', prev: r.prev}); loadBell(); if (g === gid()) ext.successoral?.reload?.(); }});
                if (g === gid() && caseOpen()?.id === x.case_id) ext.successoral?.reload?.();
            }
        } catch (e) { toast(e.message, 'error'); }
        loadBell();
    }
    document.addEventListener('click', e => {
        const t = e.target; if (!t.closest) return;
        if (t.closest('#succ-bell-open')) { e.preventDefault(); return bell.open ? closeBell() : openBell(); }
        const p = t.closest('#succ-bell-panel');
        if (!p) { if (bell.open && !t.closest('dialog')) closeBell(); return; }
        if (t.closest('[data-succ-bell-close]')) return closeBell();
        const sc = t.closest('[data-succ-bell-scope]'); if (sc) { store.set(BKEY, {...bellCfg(), scope: sc.dataset.succBellScope}); return paintBell(); }
        const d = t.closest('[data-succ-bell-do]'); if (d) return bellDo(d.dataset.succBellDo, d.dataset.k);
        if (t.closest('[data-succ-bell-week-open]')) { closeBell(); return A().setModule('dashboard'); } // le widget « 🗓 Ma semaine de recherche » (heritage-semaine.js)
    });
    document.addEventListener('toggle', e => { if (e.target.matches?.('[data-succ-bell-week]')) bell.foldWeek = !e.target.open; }, true);
    document.addEventListener('change', async e => {
        const c = e.target.closest?.('[data-succ-bell-cfg]'); if (!c) return;
        const k = c.dataset.succBellCfg, v = c.checked;
        if (k === 'notify' && v && window.Notification && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (_) {} }
        store.set(BKEY, {...bellCfg(), [k]: v});
        if (k === 'rappels') loadBell();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && bell.open) closeBell(); });
    window.addEventListener('resize', () => { if (bell.open) placePanel(document.getElementById('succ-bell-panel')); });
    let bellT = 0;
    window.addEventListener('lcnda:succ-changed', () => { clearTimeout(bellT); bellT = setTimeout(loadBell, 700); }); // après chaque changement (heritage-successoral.js) : pas de lecture en boucle
    function atMidnight() { const n = new Date(), next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 30); setTimeout(() => { loadBell(); atMidnight(); }, next - n); }
    async function bellAtStart() {
        if (!bellBtn()) { const meta = document.querySelector('.topbar-meta'), f = document.getElementById('succ-filter-open'); if (meta) { const h = `<button type="button" class="screen-tool succ-bell-btn" id="succ-bell-open" hidden aria-haspopup="dialog" aria-expanded="false"><span aria-hidden="true">🔔</span><span class="succ-bell-n" data-succ-bell-n hidden></span></button>`; if (f) f.insertAdjacentHTML('beforebegin', h); else meta.insertAdjacentHTML('beforeend', h); } }
        paintBell();
        await loadBell();
        const cfg = bellCfg(), g = O().bellGroups(bell.items);
        if (cfg.notify && g.count && window.Notification && Notification.permission === 'granted' && !sessionStorage.getItem('lcnda-succ-bell-told')) {
            try { sessionStorage.setItem('lcnda-succ-bell-told', '1'); new Notification(i18n('🔔 Échéances du jour'), {body: i18n('Échéances du jour : {n} à faire (retards et aujourd’hui)', {n: g.count})}); } catch (_) {}
        }
        atMidnight();
    }

    /* ══════════ B3. 📋 Avant de remettre au notaire ══════════ */
    const GO = {pieces: ['📑 Pièces', 'data-succ-tab="pieces"'], tree: ['🌳 Arbre', 'data-succ-tab="tree"'], heirs: ['👥 Héritiers', 'data-succ-tab="heirs"'], contacts: ['✉️ Contactés', 'data-succ-tab="contacts"'],
        dossier: ['📁 Dossier', 'data-succ-tab="dossier"'], relance: ['Relancer', 'data-succ-relance'], living: ['📇 Répertoire des vivants', 'data-succ-contact']};
    const ICON = {ok: '✓', warn: '⚠️', miss: '✗'};
    outils.checklist = (D, R, P) => O().beforeNotary(D, R, P, {t: i18n, fmt: iso => fmtDate(iso, {day: 'numeric', month: 'short', year: 'numeric'})});
    /** la liste (encadré ou fenêtre) ; ro : dossier clos ou archivé, rien ne s'y change */
    outils.checklistHtml = (D, R, P, {ro = false} = {}) => {
        const ck = outils.checklist(D, R, P);
        return `<div class="succ-ck" data-succ-ck><p class="succ-ck-sum"><b>${esc(i18n('Points prêts : {n} sur {m}', {n: ck.ok, m: ck.total}))}</b> ${ck.warn ? badge(i18n('À revoir : {n}', {n: ck.warn}), 'yellow') : ''} ${ck.miss ? badge(i18n('Manque : {n}', {n: ck.miss}), 'red') : ''}</p>
            <ul class="succ-ck-list">${ck.items.map(i => `<li class="is-${i.level}" data-succ-ck-item="${esc(i.key)}"><span class="succ-ck-ic" aria-hidden="true">${ICON[i.level]}</span><div class="succ-ck-t"><b>${esc(i.text)}</b>${i.detail ? `<small>${esc(i.detail)}</small>` : ''}</div>${i.level !== 'ok' && i.go && GO[i.go] && !ro ? `<button type="button" class="button small secondary succ-ck-go" ${GO[i.go][1]} data-succ-ck-go>→ ${esc(i18n(GO[i.go][0]))}</button>` : ''}</li>`).join('')}</ul></div>`;
    };
    /** au passage à « Remis au notaire » : la liste ; « Passer à Remis » quand même (journal), ou 🖨 imprimer quand même */
    outils.notaryDialog = (D, R, P, go, print) => {
        const ck = outils.checklist(D, R, P);
        return ext.openDialog({eyebrow: i18n('📋 AVANT DE REMETTRE'), title: i18n('Avant de remettre · {n}', {n: D.number}), wide: true, submitLabel: i18n('Passer à « Remis au notaire »'),
            body: `${outils.checklistHtml(D, R, P)}${ck.ready ? '' : UI().notice('warn', i18n('Ça avertit, ça n’empêche pas : tu peux remettre quand même, ce sera noté au journal.'))}<p class="succ-ck-print"><button type="button" class="button small secondary" data-succ-ck-print>${esc(i18n('🖨 Imprimer quand même'))}</button></p>`,
            onOpen: d => { d.querySelector('[data-succ-ck-print]').addEventListener('click', () => { d.close(); print?.(); }); d.addEventListener('click', e => { if (e.target.closest('[data-succ-ck-go]')) setTimeout(() => d.close(), 0); }); },
            onSubmit: () => { go(ck.ready ? 'ok' : 'forced', O().notaryJournal(ck, i18n)); }});
    };

    /* ══════════ B5. 📊 Les parts en euros ══════════ */
    const euro = {caseId: 0, text: '', mode: 'frac', confirmed: ''}; // en mémoire seulement : jamais gardé, effacé en quittant le dossier
    outils.forget = id => { if (euro.caseId !== id) { euro.caseId = id; euro.text = ''; euro.mode = 'frac'; euro.confirmed = ''; } };
    outils.euroMode = () => euro.mode;
    outils.setEuroMode = m => { euro.mode = m === 'eur' ? 'eur' : 'frac'; };
    const seps = () => O().sepsOf(window.LCNDA_I18N?.fmtNumber ? window.LCNDA_I18N.fmtNumber(12345.5, {minimumFractionDigits: 1, maximumFractionDigits: 1}) : '') || 'fr-FR';
    const money = c => `${O().formatCents(c, seps())} €`;
    /** le % des contrats (💶 Temps et frais, « Honoraires d'un contrat » par héritier) et s'il est signé */
    const contractsOf = D => {
        const out = {};
        for (const f of D.fees || []) if (f.kind === 'percent' && f.person_id) out[f.person_id] = {percent: f.percent, signed: (D.courriers || []).some(c => Number(c.person_id) === Number(f.person_id) && c.kind !== 'acte' && c.signe_le)};
        return out;
    };
    function euroTableHtml(D, rows, cents, title = '') {
        const T = O().euroTable(rows, cents, contractsOf(D));
        const anyRounded = T.lines.some(l => l.rounded);
        const tr = l => `<tr class="${l.zero ? 'is-zero' : ''}"><td data-label="${esc(i18n('Héritier'))}"><b>${esc(l.name)}</b></td><td data-label="${esc(i18n('Qualité'))}">${esc(l.kin)}</td><td data-label="${esc(i18n('Part'))}">${esc(l.share)}</td>
            <td data-label="${esc(i18n('Montant'))}" class="succ-eur-n">${esc(money(l.cents))}${l.rounded ? ' <sup>¹</sup>' : ''}</td><td data-label="${esc(i18n('Contrat'))}">${l.percent != null ? `${esc(String(l.percent).replace('.', ','))} %${l.signed ? '' : ` <small class="succ-eur-ns">${esc(i18n('non signé'))}</small>`}` : '—'}</td>
            <td data-label="${esc(i18n('Commission'))}" class="succ-eur-n">${l.percent != null ? esc(money(l.fee)) : '—'}</td><td data-label="${esc(i18n('Reste à l’héritier'))}" class="succ-eur-n"><b>${esc(money(l.rest))}</b></td></tr>`;
        return `${title ? `<h4 class="succ-eur-hyp">${esc(title)}</h4>` : ''}<div class="succ-scroll"><table class="succ-table succ-eur" data-succ-eur-table><thead><tr><th>${esc(i18n('Héritier'))}</th><th>${esc(i18n('Qualité'))}</th><th>${esc(i18n('Part'))}</th><th>${esc(i18n('Montant'))}</th><th>${esc(i18n('Contrat'))}</th><th>${esc(i18n('Commission'))}</th><th>${esc(i18n('Reste à l’héritier'))}</th></tr></thead>
            <tbody>${T.lines.map(tr).join('')}</tbody><tfoot><tr><th colspan="3" data-label="">${esc(i18n('Total'))}</th><td class="succ-eur-n" data-label="${esc(i18n('Montant'))}"><b>${esc(money(T.total))}</b></td><td></td><td class="succ-eur-n" data-label="${esc(i18n('Commission'))}">${esc(money(T.fees))}</td><td class="succ-eur-n" data-label="${esc(i18n('Reste à l’héritier'))}"><b>${esc(money(T.rests))}</b></td></tr></tfoot></table></div>
            ${anyRounded ? `<p class="ui-hint">¹ ${esc(i18n('Arrondi au centime : chaque part est arrondie au centime inférieur, puis les centimes qui restent vont aux parts qui en ont perdu le plus. Le total tombe juste.'))}</p>` : ''}`;
    }
    function euroBody(D, R) {
        const p = O().parseEuros(euro.text);
        if (!p.ok) return `<p class="succ-eur-ask">${esc(p.why === 'empty' ? i18n('Tape l’actif net en euros pour voir la part de chacun.') : i18n('Tape un montant en euros (ex. 187 450,00).'))}</p>`;
        if (p.huge && euro.confirmed !== euro.text) return `<p class="succ-eur-ask">${esc(i18n('Plus d’un milliard d’euros : c’est bien ça ?'))} <button type="button" class="button small" data-succ-eur-ok>${esc(i18n('Oui, calculer'))}</button></p>`;
        const usu = R.spouseOption === 'usufruit' ? `<p class="ui-hint">${esc(i18n('Si le conjoint choisit l’usufruit de la totalité : pas de montant en euros (sa valeur dépend de son âge, c’est un barème fiscal) ; demande la valeur au notaire, pour lui et pour les nus-propriétaires.'))}</p>` : '';
        const rows = R.rows.filter(r => ['heir', 'parent', 'spouse'].includes(r.role));
        const hyp = (R.hypotheses || []).map(h => euroTableHtml(D, h.shares.map(s => ({...s, role: 'heir', kin: (R.rows.find(r => r.id === s.id) || {}).kin || ''})), p.cents, i18n('Autre hypothèse, {h}', {h: h.label}))).join('');
        return euroTableHtml(D, rows, p.cents) + usu + hyp;
    }
    /** 👥 Héritiers : la bascule « Fractions | 💶 En euros » ; en euros, le champ et le tableau */
    outils.heirsSwitch = () => `<div class="segmented succ-eur-switch" role="tablist" aria-label="${esc(i18n('📊 Part de chacun en euros'))}"><button type="button" role="tab" data-succ-eur-mode="frac" class="${euro.mode !== 'eur' ? 'is-active' : ''}" aria-selected="${euro.mode !== 'eur'}">${esc(i18n('Fractions'))}</button><button type="button" role="tab" data-succ-eur-mode="eur" class="${euro.mode === 'eur' ? 'is-active' : ''}" aria-selected="${euro.mode === 'eur'}">${esc(i18n('💶 En euros'))}</button></div>`;
    outils.heirsEuros = (box, D, R) => {
        box.innerHTML = `<section class="succ-box succ-eur-box"><div class="succ-box-head"><h3>${esc(i18n('📊 Part de chacun en euros'))}</h3><div class="succ-acts"><button type="button" class="button small secondary" data-succ-eur-copy>${esc(i18n('⤓ Copier le tableau'))}</button><button type="button" class="button small secondary" data-succ-eur-print>${esc(i18n('🖨 Imprimer'))}</button></div></div>
            <label class="succ-eur-in">${esc(i18n('Actif net à partager (tapé par toi)'))}<span><input data-succ-eur-amount inputmode="decimal" autocomplete="off" spellcheck="false" maxlength="40" value="${esc(euro.text)}" placeholder="187 450,00"> €</span></label>
            <p class="ui-hint">${esc(i18n('D’après le notaire. Pas gardé : effacé quand tu fermes le dossier.'))}</p>
            ${UI().notice('warn', i18n('Hors droits de succession et frais : l’app ne calcule pas l’impôt. Ces montants sont un ordre d’idée, à faire vérifier par le notaire.'))}
            <div data-succ-eur-body>${euroBody(D, R)}</div>
            <p class="ui-hint">${esc(i18n('Commission = le % écrit dans « ＋ Honoraires d’un contrat » × le montant, arrondie au centime le plus proche, sans TVA ajoutée ; reste = montant − commission.'))}</p></section>`;
        const inp = box.querySelector('[data-succ-eur-amount]'), body = box.querySelector('[data-succ-eur-body]');
        inp.addEventListener('input', () => { euro.text = inp.value; body.innerHTML = euroBody(D, R); });
        box.addEventListener('click', async e => {
            if (e.target.closest('[data-succ-eur-ok]')) { euro.confirmed = euro.text; body.innerHTML = euroBody(D, R); return; }
            if (e.target.closest('[data-succ-eur-copy]')) {
                const tables = [...body.querySelectorAll('table')]; if (!tables.length) return toast(i18n('Tape un montant en euros (ex. 187 450,00).'), 'error');
                const tsv = tables.map(t => [...t.rows].map(r => [...r.cells].map(c => c.innerText.replace(/\s*¹/, '').trim()).join('\t')).join('\n')).join('\n\n');
                try { await navigator.clipboard.writeText(`${i18n('Hors droits de succession et frais : l’app ne calcule pas l’impôt. Ces montants sont un ordre d’idée, à faire vérifier par le notaire.')}\n${tsv}`); toast(i18n('Tableau copié.'), 'success'); } catch (_) { toast(i18n('Copie impossible dans ce navigateur.'), 'error'); }
                return;
            }
            if (e.target.closest('[data-succ-eur-print]')) {
                if (!body.querySelector('table')) return toast(i18n('Tape un montant en euros (ex. 187 450,00).'), 'error');
                await UI().openPrintDialog({title: i18n('Parts en euros — {n}', {n: D.number}), key: 'succ-euros', paper: 'A4', orientation: 'landscape', photos: false,
                    html: `<section data-k-page style="font:10pt Georgia,serif"><p style="border:1.5px solid #000;padding:2mm;font-weight:700">⚠ ${esc(i18n('Hors droits de succession et frais : l’app ne calcule pas l’impôt. Ces montants sont un ordre d’idée, à faire vérifier par le notaire.'))}</p><h1 style="font-size:14pt">${esc(i18n('Parts en euros — {n}', {n: D.number}))}</h1><p>${esc(D.title)}</p>${body.innerHTML.replace(/<button[^>]*>.*?<\/button>/g, '')}</section>`});
                post({op: 'journal', case_id: D.id, kind: 'pdf', text: i18n('Parts en euros imprimées')}).catch(() => {}); // jamais le montant
            }
        });
    };

    /* ══════════ Démarrage ══════════ */
    const start = () => {
        if (!A()?.state || !O()) return setTimeout(start, 200);
        chronoAtStart(); bellAtStart();
        setInterval(tickChrono, 1000);
        const again = () => { paintBell(); paintChrono(); };
        new MutationObserver(again).observe(document.body, {attributes: true, attributeFilter: ['class']});
        new MutationObserver(again).observe(document.documentElement, {attributes: true, attributeFilter: ['class']});
        window.addEventListener('storage', e => { if (e.key === 'genealogie-usage') { again(); loadBell(); } });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0)); else setTimeout(start, 0);
    outils.loadBell = loadBell; outils.paintChrono = paintChrono;
})();
