/* LCNDA — 🔎 Pistes automatiques pour tout l'arbre (serveur : lib/pistes_auto.php ; style : assets/css/pistes-branches-celebres.css).
 * Comme les « indices » des grands sites, mais avec des sources ouvertes : Open Archives (en ligne, à la demande, lentement),
 * Décès INSEE, Morts pour la France, Léonore, annuaires de Paris (déjà installés dans l'app). Rien n'est ajouté tout seul.
 * Où : Listes → « 🔎 Pistes à vérifier » (lancer pour tout l'arbre / une branche / les ancêtres Sosa / des descendants, barre
 * d'avancée, ⏸ pause / ▶ reprise, la liste avec ✓ Rattacher, ✗ Pas lui, ↶), un widget du tableau de bord « N pistes à vérifier »,
 * un bloc sur la fiche (« 🔎 Pistes à vérifier »), une pastille en bas de l'écran pendant la recherche, et Réglages →
 * « 🔎 Pistes, branches, célèbres » (localStorage « genealogie-pistes-auto » ; aussi les réglages des deux autres fichiers).
 * Pour d'autres fichiers : LCNDA_EXT.pistesAuto. Essai : tests/test-pistes-auto.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => { const w = v && Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x]));
        return root.LCNDA_I18N ? root.LCNDA_I18N.t(s, w) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (w && w[k] != null ? w[k] : m)); };
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const get = (a, q) => A().api(a, q);
    const post = (a, b) => A().api(a, {}, {method: 'POST', body: b}).then(r => (r && r.result !== undefined ? r.result : r));
    const fmt = n => Number(n || 0).toLocaleString('fr-FR');
    const KEY = 'genealogie-pistes-auto';
    const LIST = 'data_pistes', WIDGET = 'pistes_auto', BLOCK = ['pistes_auto', '🔎 Pistes à vérifier'], TAB = ['pistes_reglages', '25k8', '🔎 Pistes, branches, célèbres'];
    const SRC = {oa: ['🇳🇱', 'Open Archives'], insee: ['⚰️', 'Décès INSEE'], mpf: ['🎖️', 'Morts pour la France'], leonore: ['🏅', 'Léonore'], annuaire: ['📇', 'Annuaires de Paris']};
    const DEF = {block: true, float: true, src: {oa: true, insee: true, mpf: true, leonore: true, annuaire: true}};
    function settings() { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...DEF, ...s, src: {...DEF.src, ...(s.src || {})}}; }
    function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} }
    const link = (url, label) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label));
    const emptyLine = (text, icon = '🔎', hint = '') => (A().emptyState ? A().emptyState({text, icon, hint, size: 'small'}) : `<p class="muted">${esc(text)}</p>`);
    const goList = () => { const st = A().state; if (!st) return; st.listType = LIST; A().setModule?.('listes'); };
    const openPerson = id => A().openPersonById?.(Number(id));
    const changed = () => { try { root.dispatchEvent(new CustomEvent('lcnda:pistes-changed')); } catch (_) {} };

    /* ═════════ une piste ═════════ */
    const CHK = {ok: '✓', q: '?', no: '✗'};
    const whyHtml = why => (why?.length ? `<div class="ctl-checks pst-why">${why.map(([k, t]) => `<span class="ctl-check is-${k === 'ok' ? 'ok' : k === 'no' ? 'no' : 'q'}">${CHK[k] || '?'} ${esc(t)}</span>`).join('')}</div>` : '');
    const scoreBadge = n => `<span class="pst-score ${n >= 80 ? 'is-high' : n >= 65 ? 'is-mid' : 'is-low'}" title="${esc(T('Note de ressemblance sur 100'))}">${esc(T('{n} %', {n}))}</span>`;
    const canEvent = r => r.main !== false && ['BIRT', 'BAPM', 'DEAT', 'BURI'].includes(r.tag) && ['oa', 'insee'].includes(r.src);
    function rowHtml(r, {person = true} = {}) {
        const [ic, label] = SRC[r.src] || ['🔎', r.src];
        const acts = r.status === 'new'
            ? `<button type="button" class="button small" data-pst-ok="${r.id}">${esc(T('✓ Rattacher comme source'))}</button>${canEvent(r) ? `<button type="button" class="button small secondary" data-pst-ev="${r.id}">${esc(T('＋ et ajouter l’événement'))}</button>` : ''}<button type="button" class="button small secondary" data-pst-no="${r.id}">${esc(T('✗ Pas lui'))}</button>`
            : r.status === 'added' ? `<span class="ui-badge is-green">${esc(T('Rattachée'))}</span> <button type="button" class="button small secondary" data-pst-undo="${r.id}">${esc(T('↶ Retirer'))}</button>`
            : `<span class="ui-badge is-grey">${esc(T('Pas lui'))}</span> <button type="button" class="button small secondary" data-pst-unno="${r.id}">${esc(T('↺ Remettre'))}</button>`;
        const who = person ? `<button type="button" class="pst-who" data-pst-person="${r.person_id}" title="${esc(T('Ouvrir la fiche'))}"><b>${esc(r.person)}</b>${r.years ? ` <small>${esc(r.years)}</small>` : ''}</button> · ` : '';
        return `<article class="pst-row ctl-row is-${r.score >= 80 ? 'orange' : 'yellow'}" data-pst-row="${r.id}">
            <div class="ctl-row-main"><h3>${who}<span class="pst-src" title="${esc(label)}">${ic}</span> ${esc(r.title)} ${scoreBadge(r.score)}</h3>
            ${whyHtml(r.why)}
            <p class="cplus-src pst-source">${esc(T('Source :'))} ${esc(r.archive || label)}${r.src === 'oa' ? ` ${esc(T('via Open Archives'))}` : ''}${r.licence ? ` — ${esc(r.licence)}` : ''} · ${link(r.url, T('↗ voir l’acte'))}${r.source_url && r.source_url !== r.url ? ` · ${link(r.source_url, T('↗ source'))}` : ''}</p></div>
            <div class="ctl-row-acts">${acts}</div></article>`;
    }

    /* ═════════ ✓ Rattacher, ✗ Pas lui, ↶ ═════════ */
    async function act(kind, id, after) {
        try {
            if (kind === 'ok' || kind === 'ev') {
                const r = await post('pistes_accept', {id, mode: kind === 'ev' ? 'event' : 'source'});
                A().undoToast?.(T('Rattaché à la fiche : {t}', {t: r.title}) + (r.notes?.length ? ` (${r.notes.join(' ; ')})` : ''), {icon: '🔎', undo: async () => { await post('pistes_undo', {id}); changed(); after?.(); }});
            } else if (kind === 'no') {
                await post('pistes_reject', {id});
                A().undoToast?.(T('Piste écartée : elle ne reviendra pas.'), {icon: '✗', undo: async () => { await post('pistes_unreject', {id}); changed(); after?.(); }});
            } else if (kind === 'undo') {
                await post('pistes_undo', {id});
                A().undoToast?.(T('Ajout retiré de la fiche.'), {undo: async () => { await post('pistes_accept', {id, mode: 'source'}); changed(); after?.(); }});
            } else if (kind === 'unno') {
                await post('pistes_unreject', {id});
                A().undoToast?.(T('Piste remise dans « à vérifier ».'), {undo: async () => { await post('pistes_reject', {id}); changed(); after?.(); }});
            }
            try { root.dispatchEvent(new CustomEvent('lcnda:data-changed')); } catch (_) {}
            changed(); after?.();
        } catch (e) { A().toast?.(e.message, 'error'); }
    }
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-pst-ok], [data-pst-ev], [data-pst-no], [data-pst-undo], [data-pst-unno], [data-pst-person], [data-pst-go]'); if (!b) return;
        const d = b.dataset;
        if (d.pstPerson) return openPerson(d.pstPerson);
        if (d.pstGo !== undefined) return goList();
        const host = b.closest('[data-pst-host]');
        const after = () => host?.__pstRedraw?.();
        b.disabled = true;
        const [k, id] = d.pstOk ? ['ok', d.pstOk] : d.pstEv ? ['ev', d.pstEv] : d.pstNo ? ['no', d.pstNo] : d.pstUndo ? ['undo', d.pstUndo] : ['unno', d.pstUnno];
        act(k, Number(id), after).finally(() => { if (b.isConnected) b.disabled = false; });
    });

    /* ═════════ la recherche en arrière-plan (pas à pas ; continue d'une page à l'autre) ═════════ */
    const RUN = {job: null, on: false, timer: 0, busy: false};
    function jobLine(j) {
        if (!j) return '';
        const c = j.counts || {}, pct = j.total ? Math.round(100 * j.pos / j.total) : 0;
        const st = {running: T('en cours'), paused: T('en pause'), done: T('finie'), stopped: T('arrêtée')}[j.status] || j.status;
        return `<div class="pst-job is-${esc(j.status)}" data-pst-job data-id="${Number(j.id)}" data-status="${esc(j.status)}"><div class="pst-job-top"><b>${esc(T('Recherche : {l}', {l: j.label}))}</b> <span class="ui-badge is-grey">${esc(st)}</span>
            <span class="pst-job-acts">${j.status === 'running' ? `<button type="button" class="button small secondary" data-pst-pause>${esc(T('⏸ Pause'))}</button>` : j.status === 'paused' ? `<button type="button" class="button small" data-pst-resume>${esc(T('▶ Reprendre'))}</button>` : ''}${['running', 'paused'].includes(j.status) ? `<button type="button" class="button small secondary" data-pst-stop>${esc(T('■ Arrêter'))}</button>` : ''}</span></div>
            <div class="pst-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
            <small class="muted">${esc(T('{p} fiches sur {t} regardées · {f} pistes trouvées · {x} fiches gardées pour soi (vivantes ou confidentielles : rien d’envoyé) · {n} questions à Open Archives', {p: fmt(j.pos), t: fmt(j.total), f: fmt(c.found), x: fmt(c.private), n: fmt(c.net)}))}</small>
            ${j.message ? `<p class="pst-msg">${esc(j.message)}</p>` : ''}</div>`;
    }
    function paint() {
        document.querySelectorAll('[data-pst-jobhost]').forEach(h => {
            const j = RUN.job, cur = h.querySelector('[data-pst-job]');
            // même recherche, même état : seulement la barre et les nombres (les boutons ne bougent pas sous la souris)
            if (j && cur && cur.dataset.id === String(j.id) && cur.dataset.status === j.status) {
                const tmp = document.createElement('div'); tmp.innerHTML = jobLine(j);
                cur.querySelector('.pst-bar').replaceWith(tmp.querySelector('.pst-bar')); cur.querySelector('small').replaceWith(tmp.querySelector('small'));
                const m = tmp.querySelector('.pst-msg'), old = cur.querySelector('.pst-msg'); if (old) old.remove(); if (m) cur.appendChild(m);
                return;
            }
            h.innerHTML = jobLine(j);
        });
        let f = document.querySelector('.pst-float');
        const show = settings().float && RUN.job && RUN.job.status === 'running' && !(A().state?.module === 'listes' && A().state?.listType === LIST);
        if (!show) { f?.remove(); return; }
        if (!f) { f = document.createElement('div'); f.className = 'pst-float'; document.body.appendChild(f); }
        const j = RUN.job;
        f.innerHTML = `<button type="button" data-pst-go title="${esc(T('Voir les pistes'))}">🔎 ${esc(T('Pistes : {p} / {t} fiches · {f} trouvées', {p: fmt(j.pos), t: fmt(j.total), f: fmt(j.counts?.found)}))}</button><button type="button" data-pst-pause title="${esc(T('Pause'))}">⏸</button>`;
    }
    async function tick() {
        clearTimeout(RUN.timer);
        if (!RUN.on || !RUN.job || RUN.busy) return;
        RUN.busy = true;
        let wait = 1500;
        try {
            const r = await post('pistes_step', {id: RUN.job.id});
            RUN.job = r.job; wait = Math.max(150, Number(r.wait_ms) || 0);
            if (r.job.status !== 'running') { RUN.on = false; if (r.job.status === 'done') A().toast?.(T('Recherche de pistes finie : {n} pistes à vérifier.', {n: fmt(r.new)})); }
            changed();
        } catch (e) { wait = 15000; RUN.job = {...RUN.job, message: e.message}; }
        finally { RUN.busy = false; }
        paint();
        if (RUN.on) RUN.timer = setTimeout(tick, wait);
    }
    async function control(what) {
        if (!RUN.job) return;
        try { const r = await post(`pistes_${what}`, {id: RUN.job.id}); RUN.job = r.job; RUN.on = r.job.status === 'running'; paint(); if (RUN.on) tick(); changed(); } catch (e) { A().toast?.(e.message, 'error'); }
    }
    document.addEventListener('click', e => {
        if (e.target.closest?.('[data-pst-pause]')) control('pause');
        else if (e.target.closest?.('[data-pst-resume]')) control('resume');
        else if (e.target.closest?.('[data-pst-stop]')) control('stop');
    });
    async function start(scope, sources) {
        const r = await post('pistes_start', {scope, sources});
        RUN.job = r.job; RUN.on = true; paint(); tick(); changed();
        return r.job;
    }
    async function boot() {
        try { const r = await get('pistes_job'); RUN.job = r.job; if (r.job?.status === 'running') { RUN.on = true; tick(); } paint(); } catch (_) {}
    }

    /* ═════════ Listes → 🔎 Pistes à vérifier ═════════ */
    const FKEY = 'genealogie-pistes-filtres';
    const filt = () => { let f = {}; try { f = JSON.parse(localStorage.getItem(FKEY) || '{}') || {}; } catch (_) {} return {status: 'new', src: '', min: '', q: '', sort: 'score', ...f}; };
    const setFilt = o => { try { localStorage.setItem(FKEY, JSON.stringify({...filt(), ...o})); } catch (_) {} };
    async function renderList(token) {
        const S = A().state, ok = () => token === S.workspaceToken && S.module === 'listes' && S.listType === LIST, ws = document.getElementById('workspace');
        ws.innerHTML = `<section class="page pst-page">${UI().spinner ? UI().spinner(T('On lit les pistes…')) : ''}</section>`;
        let about; try { about = await get('pistes_about'); } catch (e) { if (ok()) ws.innerHTML = `<section class="page">${emptyLine(e.message)}</section>`; return; }
        if (!ok()) return;
        RUN.job = RUN.job && RUN.job.id === about.job?.id && RUN.on ? RUN.job : about.job;
        const s = settings();
        const head = UI().pageHeader ? UI().pageHeader({icon: '🔎', title: T('Pistes à vérifier'), help: esc(T('Des actes qui ressemblent à tes fiches, trouvés dans des sources ouvertes. Rien n’est ajouté tout seul : à toi de dire « ✓ Rattacher » ou « ✗ Pas lui ».'))}) : `<h2>${esc(T('🔎 Pistes à vérifier'))}</h2>`;
        const srcBox = about.sources.map(x => `<label class="checkbox-line pst-srcbox"><input type="checkbox" data-pst-src="${esc(x.id)}" ${s.src[x.id] !== false && x.installed ? 'checked' : ''} ${x.installed ? '' : 'disabled'}> ${esc(x.icon)} ${esc(x.label)} ${x.online ? `<small class="muted">(${esc(T('en ligne'))})</small>` : x.installed ? '' : `<small class="muted">(${esc(T('pas installée'))})</small>`}</label>`).join('');
        const scopes = [['all', T('Tout l’arbre')], ['sosa', T('Mes ancêtres (Sosa)')], ...about.branches.map(b => [`branch:${b.id}`, T('Branche {n} ({k} fiches)', {n: b.name, k: b.n})]), ['desc', T('Les descendants de…')]];
        ws.innerHTML = `<section class="page pst-page" data-pst-host>${head}
            <section class="maintenance-panel pst-launch"><h3>${esc(T('Chercher des pistes'))}</h3>
                <div class="pst-launch-row"><label>${esc(T('Pour'))} <select data-pst-scope>${scopes.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></label>
                <button type="button" class="button" data-pst-start>${esc(T('🔍 Chercher des pistes'))}</button></div>
                <div class="pst-srcs">${srcBox}</div>
                <p class="muted"><small>${esc(T('La recherche continue pendant que tu travailles ailleurs dans l’app (une question à Open Archives toutes les 2 secondes au plus, comme le site le demande ; les réponses sont gardées 30 jours). Rien n’est envoyé pour une personne vivante, une fiche confidentielle, ou quelqu’un né il y a moins de 100 ans sans date de décès.'))}</small></p>
                <div data-pst-jobhost></div></section>
            <div class="ui-filters pst-pills" data-pst-pills></div>
            <div class="pst-filters"><input type="search" data-pst-q placeholder="${esc(T('Chercher… (nom, acte, lieu)'))}" value="${esc(filt().q)}">
                <select data-pst-fsrc><option value="">${esc(T('Toutes les sources'))}</option>${Object.entries(SRC).map(([k, [ic, l]]) => `<option value="${k}" ${filt().src === k ? 'selected' : ''}>${ic} ${esc(T(l))}</option>`).join('')}</select>
                <select data-pst-min><option value="">${esc(T('Toutes les notes'))}</option>${[60, 70, 80, 90].map(n => `<option value="${n}" ${String(filt().min) === String(n) ? 'selected' : ''}>${esc(T('{n} % et plus', {n}))}</option>`).join('')}</select>
                <select data-pst-sort>${[['score', T('Les plus sûres d’abord')], ['name', T('Par nom')], ['recent', T('Les plus récentes')]].map(([v, l]) => `<option value="${v}" ${filt().sort === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
            <div class="ctl-list pst-list" data-pst-list></div><div data-pst-more></div></section>`;
        paint();
        const host = ws.querySelector('[data-pst-host]');
        let shown = 50;
        const draw = async () => {
            const f = filt();
            const framesOn = !!UI().framesOn?.();
            let r; try { r = await get('pistes_list', {status: f.status, src: f.src, min: f.min, q: f.q, sort: f.sort, limit: shown, ...(framesOn ? {per_person: 1} : {})}); } catch (e) { A().toast?.(e.message, 'error'); return; }
            if (!host.isConnected) return;
            const c = r.counts || {};
            host.querySelector('[data-pst-pills]').innerHTML = [['new', T('À vérifier'), c.new], ['added', T('Rattachées'), c.added], ['no', T('Écartées'), c.no]]
                .map(([k, l, n]) => `<button type="button" data-pst-status="${k}" class="${f.status === k ? 'is-active' : ''}">${esc(l)} <span class="ctl-n">(${fmt(n)})</span></button>`).join('');
            const L = host.querySelector('[data-pst-list]'), loaded = r.rows.length;
            // 🗂 un cadre par personne (réglage genealogie-cadres) : ses pistes de la page ensemble ; celles d'autres pages (tri par note) en « + N autres pistes »
            if (framesOn && r.rows.length) {
                for (const pid of [...opened.keys()]) if (!r.rows.some(x => x.person_id === pid)) opened.delete(pid);
                const extra = await Promise.all([...opened.keys()].map(pid => get('pistes_list', {person_id: pid, status: f.status, src: f.src, min: f.min, q: f.q, sort: f.sort, limit: 500}).then(x => x.rows || []).catch(() => opened.get(pid))));
                if (!host.isConnected) return;
                const have = new Set(r.rows.map(x => x.id)); extra.flat().forEach(x => { if (!have.has(x.id)) { have.add(x.id); r.rows.push(x); } });
                const per = r.per_person || {};
                L.innerHTML = UI().personCardsHtml(UI().groupByPerson(r.rows, x => x.person_id).map(g => { const x0 = g.items[0], all = Math.max(g.items.length, Number(per[g.key]) || 0), rest = all - g.items.length;
                    return UI().personCardHtml({id: x0.person_id, name: x0.person, life: x0.years, count: T(all > 1 ? '{n} pistes' : '{n} piste', {n: fmt(all)}), cls: 'pst-card',
                        body: g.items.map(x => rowHtml(x, {person: false})).join('') + (rest > 0 ? `<p class="ui-person-card-more"><button type="button" class="link-button" data-pst-rest="${x0.person_id}">${esc(rest > 1 ? T(x0.gender === 'male' ? '+ {n} autres pistes pour lui' : '+ {n} autres pistes pour elle', {n: fmt(rest)}) : T(x0.gender === 'male' ? '+ 1 autre piste pour lui' : '+ 1 autre piste pour elle'))}</button></p>` : '')}); }).join(''));
            } else L.innerHTML = r.rows.length ? r.rows.map(x => rowHtml(x)).join('') : emptyLine(f.status === 'new' ? T('Aucune piste à vérifier') : T('Rien ici'), '🔎', f.status === 'new' ? T('Lance « 🔍 Chercher des pistes » : les actes qui ressemblent à tes fiches viendront ici.') : '');
            const more = host.querySelector('[data-pst-more]'); more.innerHTML = '';
            if (r.total > loaded) { const b = document.createElement('button'); b.type = 'button'; b.className = 'button secondary'; b.textContent = T('Voir {n} de plus', {n: Math.min(50, r.total - loaded)}); b.onclick = () => { shown += 50; draw(); }; more.appendChild(b); }
        };
        host.__pstRedraw = draw;
        const opened = new Map(); // les personnes dont on a chargé toutes les pistes (« + N autres pistes »)
        host.addEventListener('click', async e => {
            const b = e.target.closest('[data-pst-rest]'); if (!b) return;
            const pid = Number(b.dataset.pstRest); b.disabled = true;
            opened.set(pid, []); draw();
        });
        host.addEventListener('change', e => {
            const t = e.target;
            if (t.matches('[data-pst-src]')) { const s2 = settings(); s2.src[t.dataset.pstSrc] = t.checked; save(s2); }
            else if (t.matches('[data-pst-fsrc]')) { setFilt({src: t.value}); shown = 50; draw(); }
            else if (t.matches('[data-pst-min]')) { setFilt({min: t.value}); shown = 50; draw(); }
            else if (t.matches('[data-pst-sort]')) { setFilt({sort: t.value}); draw(); }
        });
        let qt = 0;
        host.querySelector('[data-pst-q]').addEventListener('input', e => { clearTimeout(qt); qt = setTimeout(() => { setFilt({q: e.target.value.trim()}); shown = 50; draw(); }, 250); });
        host.addEventListener('click', async e => {
            const p = e.target.closest('[data-pst-status]'); if (p) { setFilt({status: p.dataset.pstStatus}); shown = 50; return draw(); }
            if (!e.target.closest('[data-pst-start]')) return;
            let scope = host.querySelector('[data-pst-scope]').value;
            if (scope === 'desc') {
                const it = await (root.LCNDA_PICKER || A()).openPicker?.({kind: 'person', title: T('Les descendants de qui ?'), eyebrow: T('PISTES')});
                if (!it?.id) return; scope = `desc:${Number(it.id)}`;
            }
            const sources = [...host.querySelectorAll('[data-pst-src]:checked')].map(x => x.dataset.pstSrc);
            try { await start(scope, sources); } catch (err) { A().toast?.(err.message, 'error'); }
        });
        const onChange = () => { if (!host.isConnected) { root.removeEventListener('lcnda:pistes-changed', onChange); return; } clearTimeout(host.__t); host.__t = setTimeout(draw, 400); };
        root.addEventListener('lcnda:pistes-changed', onChange);
        draw();
    }

    /* ═════════ la fiche : « 🔎 Pistes à vérifier » (seulement s'il y en a) ═════════ */
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK[0]] = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal' || !settings().block) return '';
        return A().card(index, T(BLOCK[1]), '', `<div class="pst-block" data-pst-host data-pst-person-block="${Number(p.id)}"></div>`, 'span-12', `<button type="button" class="button small secondary" data-pst-go>${esc(T('Toutes les pistes'))}</button>`).replace(/^(\s*<section class="card[^"]*")/, '$1 hidden');
    };
    async function fillPerson(host) {
        const id = Number(host.dataset.pstPersonBlock);
        const draw = async () => {
            let r; try { r = await get('pistes_list', {person_id: id, status: 'new', limit: 20}); } catch (_) { return; }
            if (!host.isConnected) return;
            const card = host.closest('section.card');
            host.innerHTML = r.rows.length ? `<p class="cplus-lead">${esc(r.rows.length > 1 ? T('{n} actes ressemblent à cette personne : à vérifier.', {n: r.rows.length}) : T('Un acte ressemble à cette personne : à vérifier.'))}</p>${r.rows.slice(0, 2).map(x => rowHtml(x, {person: false})).join('')}${r.rows.length > 2 ? `<details class="cplus-more"><summary>${esc(T('▸ plus ({n})', {n: r.rows.length - 2}))}</summary>${r.rows.slice(2).map(x => rowHtml(x, {person: false})).join('')}</details>` : ''}` : '';
            if (card) card.hidden = !r.rows.length;
        };
        host.__pstRedraw = draw;
        await draw();
    }
    (ext.afterPerson = ext.afterPerson || []).push(() => { document.querySelectorAll('#workspace [data-pst-person-block]:not([data-pst-done])').forEach(h => { h.dataset.pstDone = '1'; fillPerson(h); }); });

    /* ═════════ le widget du tableau de bord : « N pistes à vérifier » ═════════ */
    ext.dashboard = ext.dashboard || {};
    ext.dashboard[WIDGET] = {load: () => get('pistes_count').catch(() => null), render: (index, w, span, d) => {
        const card = (body, acts = '') => A().card(index, T('🔎 Pistes à vérifier'), '', body, span, acts);
        if (!d) return card(A().empty ? A().empty(T('Pistes indisponibles pour l’instant.'), {icon: '🔎'}) : '');
        const job = d.job && ['running', 'paused'].includes(d.job.status) ? `<div class="pst-bar"><span style="width:${d.job.total ? Math.round(100 * d.job.pos / d.job.total) : 0}%"></span></div><small class="muted">${esc(T('Recherche {s} : {p} / {t} fiches', {s: d.job.status === 'running' ? T('en cours') : T('en pause'), p: fmt(d.job.pos), t: fmt(d.job.total)}))}</small>` : '';
        const by = Object.entries(d.by_src || {}).map(([k, n]) => `${SRC[k]?.[0] || '🔎'} ${fmt(n)}`).join(' · ');
        const body = `<div class="pst-widget"><button type="button" class="ctl-widget-big" data-pst-go><strong>${fmt(d.new)}</strong><span>${esc(d.new > 1 ? T('pistes à vérifier') : d.new ? T('piste à vérifier') : T('aucune piste à vérifier'))}</span></button>
            ${d.new ? `<p class="muted">${esc(T('pour {n} fiches', {n: fmt(d.people)}))} · ${by}</p>` : `<p class="muted">${esc(T('Lance une recherche pour tout l’arbre : les actes qui ressemblent à tes fiches viendront ici.'))}</p>`}${job}</div>`;
        return card(body, `<button class="button small secondary" type="button" data-pst-go>${esc(d.new ? T('Voir') : T('Chercher'))}</button>`);
    }};

    /* ═════════ Réglages → 🔎 Pistes, branches, célèbres (les trois fichiers) ═════════ */
    ext.pistesSettings = ext.pistesSettings || [];
    ext.pistesSettings.unshift({id: 'pistes', title: T('🔎 Pistes à vérifier'), key: KEY, items: [['block', T('Sur la fiche : les pistes de la personne')], ['float', T('Une pastille en bas de l’écran pendant la recherche')]]});
    document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-pst-set]'); if (!t) return;
        const [key, item] = t.dataset.pstSet.split('|');
        let s = {}; try { s = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (_) {}
        const before = JSON.stringify(s); s[item] = t.checked;
        try { localStorage.setItem(key, JSON.stringify(s)); } catch (_) {}
        A().undoToast?.(t.checked ? T('Allumé : {l}', {l: t.dataset.pstLabel}) : T('Éteint : {l}', {l: t.dataset.pstLabel}), {undo: () => { try { localStorage.setItem(key, before); } catch (_) {} drawSettings(); }});
    });
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        if (A().state?.maintenanceTab !== TAB[0] && token === undefined) return;
        let about = {sources: []}, cel = {sources: []};
        try { about = await get('pistes_about'); } catch (_) {}
        try { cel = await get('celeb_about'); } catch (_) {}
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const sec = g => { let s = {}; try { s = JSON.parse(localStorage.getItem(g.key) || '{}') || {}; } catch (_) {}
            return `<div class="maintenance-panel"><h3>${esc(g.title)}</h3>${g.items.map(([k, l, dflt]) => `<label class="checkbox-line"><input type="checkbox" data-pst-set="${esc(g.key)}|${esc(k)}" data-pst-label="${esc(l)}" ${(s[k] ?? dflt ?? true) ? 'checked' : ''}> <span>${esc(l)}</span></label>`).join('')}</div>`; };
        const rows = [...about.sources.map(x => [x.label, x.what, x.online ? T('en ligne, gardé 30 jours') : x.installed ? T('dans l’app') : T('pas installée'), x.licence, x.url, x.rules || '']),
            ...(cel.sources || []).map(x => [x.label, x.what, T('en ligne, gardé 60 jours'), x.licence, x.url, x.rules || ''])];
        ws.innerHTML = `<section class="page pst-settings">${UI().pageHeader ? UI().pageHeader({title: T('Pistes, branches isolées, parents célèbres'), icon: '🔎', where: T('Réglages · Données'), help: esc(T('Ce qui s’affiche, et d’où viennent les données.'))}) : ''}
            ${(ext.pistesSettings || []).map(sec).join('')}
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Source'))}</th><th>${esc(T('Ce qu’elle donne'))}</th><th>${esc(T('Où'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Règles d’usage'))}</th></tr></thead>
            <tbody>${rows.map(([l, w, o, lic, u, ru]) => `<tr><td>${link(u, l)}</td><td>${esc(w)}</td><td>${esc(o)}</td><td>${esc(lic)}</td><td><small>${esc(ru)}</small></td></tr>`).join('')}</tbody></table></div>
            <p class="muted">${esc(T('Ce qui part sur Internet : pour Open Archives, le prénom, le nom et une période d’années d’une personne décédée ; pour Wikidata, l’identifiant Q d’une fiche déjà reliée, ou le prénom et le nom d’un ancêtre né avant 1900 ; pour WikiTree (si tu l’allumes), son identifiant WikiTree. Jamais rien pour une personne vivante, une fiche confidentielle, ou quelqu’un né il y a moins de 100 ans sans date de décès.'))}</p></div></section>`;
    }
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    /* ═════════ enregistrement (listes, tableau de bord, fiche, Réglages, registre commun) ═════════ */
    ext.lists = ext.lists || {};
    ext.lists[LIST] = token => renderList(token);
    (ext.dataSources = ext.dataSources || []).push({id: 'pistes_auto', icon: '🔎', label: T('Pistes à vérifier (actes qui lui ressemblent)'), group: 'Chercher', needs: ['person'], installed: () => true, enabled: () => settings().block,
        run: async (ctx, host) => { const id = Number(ctx.person?.id || ctx.person) || 0; if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return; } host.innerHTML = `<div data-pst-host data-pst-person-block="${id}"></div>`; await fillPerson(host.firstElementChild); if (!host.textContent.trim()) host.innerHTML = emptyLine(T('Aucune piste pour cette personne : lance une recherche dans Listes → Pistes à vérifier.')); }});
    function register() {
        const app = A(); if (!app.defaultListTypes) return false;
        if (!app.defaultListTypes.some(x => x[0] === LIST)) app.defaultListTypes.push([LIST, '90c', T('🔎 Pistes à vérifier')]);
        const G = (ext.listGroupDefaults || []).find(g => g[0] === 'g_research'); if (G && Array.isArray(G[3]) && !G[3].includes(LIST)) G[3].unshift(LIST);
        if (Array.isArray(app.defaultDashboardBlocks) && !app.defaultDashboardBlocks.some(x => x[0] === WIDGET)) { app.defaultDashboardBlocks.push([WIDGET, T('🔎 Pistes à vérifier')]); if (app.defaultDashboardBlockSpans) app.defaultDashboardBlockSpans[WIDGET] = '4'; if (app.dashboardWidgetInfo) app.dashboardWidgetInfo[WIDGET] = T('Les actes trouvés qui ressemblent à tes fiches, à vérifier.'); }
        const B = app.defaultPersonBlocks; if (Array.isArray(B) && !B.some(b => b[0] === BLOCK[0])) { const i = B.findIndex(b => b[0] === 'tout_sur' || b[0] === 'world'); B.splice(i < 0 ? B.length : i, 0, [BLOCK[0], T(BLOCK[1])]); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans[BLOCK[0]] ||= '12';
        const tabs = app.defaultMaintenanceTabs; if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { const i = tabs.findIndex(t => t[0] === 'terre_mots'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, [TAB[0], TAB[1], T(TAB[2])]); }
        return true;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});
    const ready = () => { if (A().state?.csrf) boot(); else setTimeout(ready, 500); };
    ready();
    ext.pistesAuto = {settings, start, rowHtml, fillPerson, openList: goList, job: () => RUN.job, openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
