/* LCNDA — L3 Une seule fenêtre « 🕘 Versions » (Harmonisation L, validé ; maquette docs/design/harmonisation-L.html).
 * Mode d'emploi : docs/UI.md (« L3 — 🕘 Versions »). Styles : assets/css/versions.css. Test : tests/test-harmo-l3-versions.js.
 *
 *   UI.openVersions({title, tool, kind, list, now, preview, keepNow, restore, rename, copy, exportOne, remove, saveNow, actions, onChange})
 *     kind     : 'text' | 'site' | 'image' | 'audio' | 'video' | 'board' | 'layout'… (dit comment montrer et comparer)
 *     list()   : async → [{id, label, created_at, auto, info, by, locked, shown, badge}] (les plus récentes d'abord)
 *     now      : {info, hint} | async () → {…} | false — la ligne « Maintenant » (toujours en haut, K8 « EN COURS »)
 *     preview(v | null) : async → {text} | {html} (page isolée) | {src, kind:'image'|'audio'|'video'} ; null = maintenant
 *     keepNow(label)    : async — garde l'état actuel comme version automatique (appelé avant « ↺ Revenir »)
 *     restore(v)        : async → {undo} — remet cette version ; le message H7 « ↶ Annuler » est fait ici
 *     rename(v, nom), copy(v), exportOne(v), remove(v) → {undo} ou {undo, commit} (commit = suppression pour de bon, faite
 *       quand le message disparaît sans « Annuler »), saveNow(), actions : [{icon, label, run(v), when(v)}] en plus.
 *   Une action absente n'est pas proposée. UI.versionsDiff(a, b) et UI.versionsGroup(date) servent aussi aux tests (Node).
 */
(() => {
    'use strict';
    const root = typeof window !== 'undefined' ? window : globalThis;
    const UI = root.LCNDA_UI = root.LCNDA_UI || {};
    const A = () => root.LCNDA_APP || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const plural = (n, w) => (A().plural ? A().plural(n, w) : `${n} ${w}${n > 1 ? 's' : ''}`);
    const toast = (m, k, o) => (A().toast ? A().toast(m, k, o) : console.info(m));

    /* ═════ Ranger par Aujourd’hui · Cette semaine · Plus ancien ═════ */
    function groupOf(d, now = new Date()) {
        const x = d instanceof Date ? d : UI.whenParse ? UI.whenParse(d) : (d ? new Date(String(d).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(d)) ? '' : 'Z')) : null);
        if (!x || isNaN(x)) return 'older';
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        if (x.getTime() >= start) return 'today';
        return x.getTime() >= start - 6 * 86400000 ? 'week' : 'older';
    }
    const GROUPS = [['today', 'Aujourd’hui'], ['week', 'Cette semaine'], ['older', 'Plus ancien']];

    /* ═════ Comparer deux textes, mot à mot : à gauche ce qui part (barré rouge), à droite ce qui arrive (vert) ═════ */
    function diff(a, b) {
        const tok = s => String(s ?? '').split(/(\s+)/).filter(x => x !== '');
        const x = tok(a), y = tok(b);
        let p = 0; while (p < x.length && p < y.length && x[p] === y[p]) p++;
        let s = 0; while (s < x.length - p && s < y.length - p && x[x.length - 1 - s] === y[y.length - 1 - s]) s++;
        const xm = x.slice(p, x.length - s), ym = y.slice(p, y.length - s);
        const ops = [];
        x.slice(0, p).forEach(t => ops.push(['=', t]));
        if (xm.length * ym.length > 4e6) { // trop long pour le mot à mot : le milieu changé d'un bloc
            ops.push(['-', xm.join('')]); ops.push(['+', ym.join('')]); }
        else {
            const n = xm.length, m = ym.length, L = Array.from({length: n + 1}, () => new Uint32Array(m + 1));
            for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = xm[i] === ym[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
            let i = 0, j = 0;
            while (i < n && j < m) { if (xm[i] === ym[j]) { ops.push(['=', xm[i]]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) ops.push(['-', xm[i++]]); else ops.push(['+', ym[j++]]); }
            while (i < n) ops.push(['-', xm[i++]]); while (j < m) ops.push(['+', ym[j++]]);
        }
        x.slice(x.length - s).forEach(t => ops.push(['=', t]));
        const words = t => (/\S/.test(t) ? t.trim().split(/\s+/).length : 0);
        let added = 0, removed = 0;
        ops.forEach(([k, t]) => { if (k === '-') removed += words(t); if (k === '+') added += words(t); });
        const out = h => esc(h).replace(/\n/g, '<br>');
        /* un côté : ce qui reste (=) et ce qui change (x) ; un blanc commun entre deux morceaux changés reste dans la même marque */
        const side = (mine, tag) => {
            const segs = [];
            ops.forEach(([k, t]) => { if (k !== '=' && k !== mine) return; const kk = k === '=' ? '=' : 'x'; const last = segs[segs.length - 1]; if (last && last[0] === kk) last[1] += t; else segs.push([kk, t]); });
            for (let i = 1; i < segs.length - 1; i++) if (segs[i][0] === '=' && !/\S/.test(segs[i][1]) && segs[i - 1][0] === 'x' && segs[i + 1][0] === 'x') { segs[i - 1][1] += segs[i][1] + segs[i + 1][1]; segs.splice(i, 2); i--; }
            return segs.map(([k, t]) => (k === '=' ? out(t) : `<${tag}>${out(t)}</${tag}>`)).join('');
        };
        const left = side('-', 'del'), right = side('+', 'ins');
        return {left, right, added, removed, same: !added && !removed};
    }
    UI.versionsDiff = diff;
    UI.versionsGroup = groupOf;
    if (typeof module !== 'undefined' && module.exports) module.exports = {diff, groupOf};
    if (typeof document === 'undefined') return;

    const when = d => (UI.when ? UI.when(d) : esc(d || ''));
    const badge = (t, k, o) => (UI.badge ? UI.badge(t, k, o) : `<span class="ui-badge">${esc(t)}</span>`);
    const spin = t => (UI.spinner ? UI.spinner(t) : esc(t)); // C7 : le rond commun (app-ui.js est chargé avant)
    const clock = s => (UI.clock ? UI.clock(s) : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);

    /* ═════ La fenêtre ═════ */
    UI.openVersions = (o = {}) => {
        const kind = o.kind || 'text';
        const dlg = document.createElement('dialog');
        dlg.className = 'modal modal-l ui-vers';
        dlg.dataset.versKind = kind;
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">Versions${o.tool ? ` · ${esc(o.tool)}` : ''}</span><h2>🕘 ${esc(o.title || 'Versions')}</h2></div><button type="button" class="icon-button" data-vers-close aria-label="Fermer">×</button></div>
            <div class="ui-vers-body">
                <div class="ui-vers-top"><div class="ui-filters" role="group" aria-label="Quelles versions montrer" data-vers-filters></div>${o.saveNow ? '<button type="button" class="button small secondary" data-vers-save>＋ Enregistrer la version actuelle</button>' : ''}</div>
                <div class="ui-vers-grid"><div class="ui-vers-list" data-vers-list role="listbox" aria-label="Versions" tabindex="-1"></div><section class="ui-vers-pane" data-vers-pane aria-live="polite"></section></div>
                <div class="ui-vers-cmp" data-vers-cmp hidden></div>
            </div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button" data-vers-close>Fermer</button></div>`;
        document.body.appendChild(dlg);
        const $ = s => dlg.querySelector(s);
        let items = [], filter = 'all', cur = null, checked = [], nowInfo = null, closed = false;
        const cache = new Map();
        const prev = async v => { const k = v ? `v${v.id}` : 'now'; if (v && cache.has(k)) return cache.get(k); const p = await o.preview?.(v || null); if (v) cache.set(k, p); return p; };
        const byId = id => (id === 'now' ? null : items.find(x => String(x.id) === String(id)));
        const shown = () => items.filter(x => filter === 'all' || (filter === 'named' ? !x.auto : x.auto));

        async function load() {
            try { items = (await o.list?.()) || []; } catch (e) { items = []; toast(e.message || String(e), 'error'); }
            try { nowInfo = typeof o.now === 'function' ? await o.now() : o.now; } catch (_) { nowInfo = null; }
            checked = checked.filter(id => id === 'now' || byId(id));
            if (cur && cur !== 'now' && !byId(cur)) cur = null;
            paint();
        }
        function paintFilters() {
            const n = {all: items.length, named: items.filter(x => !x.auto).length, auto: items.filter(x => x.auto).length};
            $('[data-vers-filters]').innerHTML = [['all', 'Tout'], ['named', '✎ Nommées'], ['auto', '🕘 Automatiques']].map(([k, l]) => `<button type="button" class="${filter === k ? 'is-active' : ''}" data-vers-filter="${k}" aria-pressed="${filter === k}">${l} (${n[k]})</button>`).join('');
        }
        const rowHtml = v => {
            const id = v ? String(v.id) : 'now', isCur = cur === id, cb = checked.includes(id);
            const small = v ? [when(v.created_at), v.by ? esc(v.by) : '', v.info ? esc(v.info) : ''].filter(Boolean).join(' · ') : esc(nowInfo?.hint || 'pas encore enregistrée comme version') + (nowInfo?.info ? ` · ${esc(nowInfo.info)}` : '');
            const right = v ? `${v.shown ? badge('Affichée', 'green') : ''}${!v.auto ? '<span class="ui-badge is-date ui-vers-named">✎ nommée</span>' : ''}${v.badge || ''}` : badge('En cours', 'blue');
            const canCmp = !!(o.preview && (v || o.now !== false));
            return `<div class="ui-vers-row${isCur ? ' is-active' : ''}${v ? '' : ' is-now'}" role="option" aria-selected="${isCur}" data-vers-row="${esc(id)}" tabindex="${isCur || (!cur && !v) ? 0 : -1}">
                ${canCmp ? `<label class="ui-vers-cb" title="Cocher pour comparer"><input type="checkbox" data-vers-check="${esc(id)}" ${cb ? 'checked' : ''} aria-label="Comparer ${esc(v ? v.label : 'Maintenant')}"></label>` : '<span></span>'}
                <div class="ui-vers-txt"><span class="ui-vers-nm">${esc(v ? v.label : (nowInfo?.label || 'Maintenant'))}</span><small data-vers-info="${esc(id)}">${small}</small></div><span class="ui-vers-bdg">${right}</span></div>`;
        };
        function paintList() {
            const list = shown();
            let h = o.now === false ? '' : rowHtml(null);
            GROUPS.forEach(([g, label]) => { const part = list.filter(v => groupOf(v.created_at) === g); if (part.length) h += `<div class="ui-vers-grp">${label}</div>${part.map(rowHtml).join('')}`; });
            if (!list.length) h += A().empty ? A().empty(filter === 'all' ? 'Pas encore de version.' : filter === 'named' ? 'Aucune version nommée.' : 'Aucune version automatique.', {icon: '🕘', ...(o.saveNow && filter !== 'auto' ? {action: {label: '＋ Enregistrer la version actuelle', attrs: 'data-vers-save'}} : {})}) : '<p class="empty-line">Pas encore de version.</p>';
            else if (o.preview) h += `<p class="ui-vers-hint">${checked.length === 1 ? 'Coche une deuxième version pour comparer.' : 'Coche deux versions pour les comparer.'}</p>`;
            $('[data-vers-list]').innerHTML = h;
            // une ligne utile qui demande du temps (taille en pixels, durée…) : remplie ensuite
            list.forEach(v => { if (typeof v.infoAsync !== 'function' || v.info) return; Promise.resolve(v.infoAsync()).then(t => { if (!t || closed) return; v.info = t; const el = dlg.querySelector(`[data-vers-info="${CSS.escape(String(v.id))}"]`); if (el) el.innerHTML = [when(v.created_at), v.by ? esc(v.by) : '', esc(t)].filter(Boolean).join(' · '); }).catch(() => {}); });
        }
        const media = (p, cls = '') => {
            if (!p) return A().empty ? A().empty('Pas d’aperçu pour cette version.', {icon: '🕘'}) : '';
            if (p.src && (p.kind || kind) === 'image') return `<img class="ui-vers-img ${cls}" src="${esc(p.src)}" alt="" data-vers-img>`;
            if (p.src && (p.kind || kind) === 'audio') return `<div class="ui-vers-audio"><canvas class="ui-vers-wave" data-vers-wave="${esc(p.src)}" width="600" height="70" aria-hidden="true"></canvas><audio controls preload="metadata" src="${esc(p.src)}"></audio></div>`;
            if (p.src && (p.kind || kind) === 'video') return `<video class="ui-vers-video" controls preload="metadata" src="${esc(p.src)}"></video>`;
            if (p.html != null) return `<iframe class="ui-vers-frame" sandbox="" title="Aperçu" data-vers-frame></iframe>`;
            const t = String(p.text ?? ''); return t.trim() ? `<div class="ui-vers-text">${esc(t.length > 2400 ? t.slice(0, 2400) + ' …' : t).replace(/\n/g, '<br>')}</div><small class="muted ui-vers-note">${t.length > 2400 ? 'Aperçu : le début du texte.' : ''}</small>` : (A().empty ? A().empty('Cette version est vide.', {icon: '📄'}) : '');
        };
        const fillFrame = (host, p) => { const f = host.querySelector('[data-vers-frame]'); if (f && p?.html != null) f.srcdoc = String(p.html); };
        async function paintPane() {
            const pane = $('[data-vers-pane]');
            const v = cur ? byId(cur) : null, isNow = cur === 'now' || (!cur && o.now !== false);
            if (!cur && !isNow) { pane.innerHTML = `<div class="ui-vers-pd">${A().empty ? A().empty('Choisis une version dans la liste pour la voir ici.', {icon: '🕘'}) : ''}</div>`; return; }
            const label = v ? v.label : (nowInfo?.label || 'Maintenant');
            const acts = [];
            if (v && o.restore && !v.shown) acts.push(`<button type="button" class="button small" data-vers-act="restore">↺ Revenir à cette version</button>`);
            if (v && o.preview && o.now !== false) acts.push(`<button type="button" class="button small secondary" data-vers-act="cmpnow">⇄ Comparer avec maintenant</button>`);
            (o.actions || []).forEach((a, i) => { if (v && (!a.when || a.when(v))) acts.push(`<button type="button" class="button small secondary" data-vers-extra="${i}">${esc(a.icon ? `${a.icon} ${a.label}` : a.label)}</button>`); });
            if (v && o.rename && !v.locked) acts.push(`<button type="button" class="button small secondary" data-vers-act="rename">✎ Renommer</button>`);
            if (v && (o.rename || o.copy || o.exportOne || o.remove)) acts.push(`<button type="button" class="icon-button small" data-vers-act="more" title="Plus d’actions" aria-label="Plus d’actions pour « ${esc(label)} »" aria-haspopup="menu">⋯</button>`);
            pane.innerHTML = `<div class="ui-vers-ph"><b>${esc(label)}</b> <span class="muted">${v ? `· ${when(v.created_at)}${v.by ? ` · ${esc(v.by)}` : ''}` : `· ${esc(nowInfo?.hint || 'ce qui est à l’écran')}`}</span></div>
                <div class="ui-vers-pd" data-vers-pd>${spin('Chargement de l’aperçu…')}</div>
                ${acts.length ? `<div class="ui-vers-pa">${acts.join('')}</div>` : ''}`;
            const want = cur;
            let p = null; try { p = await prev(v); } catch (e) { p = {text: '', error: e.message}; }
            if (closed || want !== cur) return;
            const pd = pane.querySelector('[data-vers-pd]');
            pd.innerHTML = p?.error ? `<p class="ui-vers-err">⛔ ${esc(p.error)}</p>` : media(p);
            fillFrame(pd, p); drawWaves(pd);
            const im = pd.querySelector('[data-vers-img]');
            if (im) im.addEventListener('load', () => { if (!pd.isConnected) return; const s = `${im.naturalWidth.toLocaleString('fr-FR')} × ${im.naturalHeight.toLocaleString('fr-FR')} px`; const ok = Math.min(im.naturalWidth, im.naturalHeight) >= 1748 * 0.7; pd.insertAdjacentHTML('beforeend', `<small class="muted ui-vers-note">${s} · ${ok ? 'assez grande pour imprimer en A5' : 'trop petite pour imprimer en A5'}</small>`); }, {once: true});
        }
        /* deux formes de son côte à côte (et A / B pour écouter l'une puis l'autre au même endroit) */
        async function drawWaves(host) {
            const cvs = [...host.querySelectorAll('[data-vers-wave]')]; if (!cvs.length) return;
            const Ctx = root.AudioContext || root.webkitAudioContext; if (!Ctx) return;
            for (const c of cvs) {
                try {
                    const ac = UI._versAc || (UI._versAc = new Ctx());
                    const buf = await ac.decodeAudioData(await (await fetch(c.dataset.versWave)).arrayBuffer());
                    if (!c.isConnected) continue;
                    const d = buf.getChannelData(0), g = c.getContext('2d'), W = c.width, H = c.height, step = Math.max(1, Math.floor(d.length / W));
                    g.clearRect(0, 0, W, H); g.fillStyle = getComputedStyle(c).color || '#055dff';
                    for (let x = 0; x < W; x++) { let mx = 0; for (let i = x * step, e = Math.min(d.length, i + step); i < e; i += 8) mx = Math.max(mx, Math.abs(d[i])); const h = Math.max(1, mx * H); g.fillRect(x, (H - h) / 2, 1, h); }
                    c.dataset.drawn = '1';
                } catch (_) { c.dataset.drawn = '0'; }
            }
        }
        async function paintCompare() {
            const box = $('[data-vers-cmp]');
            if (checked.length !== 2) { box.hidden = true; box.innerHTML = ''; return; }
            // l'ordre du temps : la plus ancienne à gauche (« maintenant » toujours à droite)
            const pair = checked.slice().sort((a, b) => (a === 'now' ? 1 : b === 'now' ? -1 : (new Date(byId(a)?.created_at || 0) - new Date(byId(b)?.created_at || 0)) || (Number(a) - Number(b))));
            const [va, vb] = pair.map(byId), la = va ? va.label : 'Maintenant', lb = vb ? vb.label : 'Maintenant';
            const head = (v, l) => `<span class="ui-vers-ch">${esc(l)}${v ? ` · ${when(v.created_at)}` : ''}</span>`;
            box.hidden = false;
            box.innerHTML = `<div class="ui-vers-ct"><b>⇄ Comparer</b> <span class="muted">${esc(la)} → ${esc(lb)}</span><button type="button" class="link-button" data-vers-uncheck>× Ne plus comparer</button></div>${spin('Comparaison…')}`;
            const want = checked.join();
            let pa, pb; try { [pa, pb] = await Promise.all([prev(va), prev(vb)]); } catch (e) { box.innerHTML = `<p class="ui-vers-err">⛔ ${esc(e.message)}</p>`; return; }
            if (closed || want !== checked.join()) return;
            let inner = '';
            const k = pa?.src ? (pa.kind || kind) : 'text';
            if (o.compare) inner = await o.compare(va, vb, pa, pb);
            else if (pa?.src && pb?.src && k === 'image') {
                inner = `<div class="ui-vers-slide" data-vers-slide style="--cut:50%"><img src="${esc(pb.src)}" alt="" class="is-b"><img src="${esc(pa.src)}" alt="" class="is-a"><span class="ui-vers-cut" role="slider" tabindex="0" aria-label="Trait entre les deux images" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" data-vers-cut><i>⇆</i></span><span class="ui-vers-lab is-a">${esc(la)}</span><span class="ui-vers-lab is-b">${esc(lb)}</span></div><small class="muted">Glisse le trait pour voir avant / après (← → au clavier).</small>`;
            } else if (pa?.src && pb?.src && (k === 'audio' || k === 'video')) {
                inner = `<div class="ui-vers-ab" data-vers-ab><div><small class="muted">A · ${esc(la)}</small><canvas class="ui-vers-wave is-a" data-vers-wave="${esc(pa.src)}" width="900" height="56" aria-hidden="true"></canvas></div><div><small class="muted">B · ${esc(lb)}</small><canvas class="ui-vers-wave is-b" data-vers-wave="${esc(pb.src)}" width="900" height="56" aria-hidden="true"></canvas></div>
                    <div class="ui-vers-abbar"><button type="button" class="button small secondary" data-vers-ab="play" aria-label="Écouter">▶</button><button type="button" class="button small is-on" data-vers-ab="a" aria-pressed="true">👂 A</button><button type="button" class="button small secondary" data-vers-ab="b" aria-pressed="false">✨ B</button><small class="muted">A / B : écouter l’un puis l’autre au même endroit</small></div>
                    <audio preload="auto" src="${esc(pa.src)}" data-vers-au="a"></audio><audio preload="auto" src="${esc(pb.src)}" data-vers-au="b"></audio></div>`;
            } else {
                const d = diff(pa?.text ?? '', pb?.text ?? '');
                inner = `<p class="muted ui-vers-sum">${d.same ? 'Les deux textes sont pareils.' : `${plural(d.added, 'mot')} ajouté${d.added > 1 ? 's' : ''}, ${plural(d.removed, 'mot')} retiré${d.removed > 1 ? 's' : ''}.`}</p><div class="ui-vers-two"><div>${head(va, la)}<div class="ui-vers-text" data-vers-left>${d.left || '<span class="muted">(vide)</span>'}</div></div><div>${head(vb, lb)}<div class="ui-vers-text" data-vers-right>${d.right || '<span class="muted">(vide)</span>'}</div></div></div>`;
            }
            box.innerHTML = `<div class="ui-vers-ct"><b>⇄ Comparer</b> <span class="muted">${esc(la)} → ${esc(lb)}</span><button type="button" class="link-button" data-vers-uncheck>× Ne plus comparer</button></div>${inner}`;
            bindSlide(box); bindAb(box); drawWaves(box);
            if (dlg.isConnected && box.scrollIntoView && innerWidth < 760) box.scrollIntoView({block: 'nearest'});
        }
        function bindSlide(box) {
            const s = box.querySelector('[data-vers-slide]'); if (!s) return;
            const cut = s.querySelector('[data-vers-cut]');
            const set = f => { f = Math.max(0, Math.min(100, f)); s.style.setProperty('--cut', `${f}%`); cut.setAttribute('aria-valuenow', String(Math.round(f))); };
            const at = e => { const r = s.getBoundingClientRect(); set((e.clientX - r.left) / r.width * 100); };
            s.addEventListener('pointerdown', e => { e.preventDefault(); s.setPointerCapture?.(e.pointerId); at(e); const mv = ev => at(ev), up = () => { s.removeEventListener('pointermove', mv); s.removeEventListener('pointerup', up); }; s.addEventListener('pointermove', mv); s.addEventListener('pointerup', up); });
            cut.addEventListener('keydown', e => { const v = Number(cut.getAttribute('aria-valuenow')) || 50; if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); set(v + (e.key === 'ArrowLeft' ? -5 : 5)); } });
        }
        function bindAb(box) {
            const ab = box.querySelector('[data-vers-ab]'); if (!ab) return;
            const au = {a: ab.querySelector('[data-vers-au="a"]'), b: ab.querySelector('[data-vers-au="b"]')};
            let side = 'a';
            const btn = k => ab.querySelector(`[data-vers-ab="${k}"]`);
            const choose = k => { const from = au[side], to = au[k], playing = !from.paused; if (k !== side) { try { to.currentTime = Math.min(from.currentTime, to.duration || from.currentTime); } catch (_) {} from.pause(); } side = k;
                ['a', 'b'].forEach(x => { btn(x).classList.toggle('is-on', x === k); btn(x).classList.toggle('secondary', x !== k); btn(x).setAttribute('aria-pressed', String(x === k)); });
                if (playing) to.play().catch(() => {}); };
            ab.addEventListener('click', e => { const b = e.target.closest('[data-vers-ab]'); if (!b) return; const k = b.dataset.versAb;
                if (k === 'play') { const a = au[side]; if (a.paused) { a.play().catch(() => {}); b.textContent = '⏸'; } else { a.pause(); b.textContent = '▶'; } return; }
                choose(k); });
            Object.values(au).forEach(a => a.addEventListener('ended', () => { btn('play').textContent = '▶'; }));
        }
        function paint() { paintFilters(); paintList(); paintPane(); paintCompare(); }

        const keepScroll = fn => { const l = $('[data-vers-list]'), y = l.scrollTop; fn(); l.scrollTop = y; };
        const select = id => { cur = id; keepScroll(paintList); paintPane(); dlg.querySelector(`[data-vers-row="${CSS.escape(id)}"]`)?.focus({preventScroll: false}); };
        const changed = () => { cache.clear(); o.onChange?.(); return load(); };

        async function doRestore(v) {
            try {
                if (o.keepNow) await o.keepNow(`Avant le retour à « ${v.label} »`);
                const r = await o.restore(v);
                await changed();
                const msg = `↺ Revenu à « ${v.label} » — la version d’avant est gardée`;
                if (A().undoToast && r?.undo) A().undoToast(msg, {undo: async () => { await r.undo(); if (!closed) await changed(); }, redo: r.redo ? async () => { await r.redo(); if (!closed) await changed(); } : null, undoneText: `retour à « ${v.label} »`});
                else toast(msg);
            } catch (e) { toast(e.message || String(e), 'error'); }
        }
        async function doRename(v) {
            const name = await A().askText?.({title: '✎ Renommer la version', message: 'Le nouveau nom :', value: v.label, okLabel: 'Renommer'});
            if (name == null) return; const nm = String(name).trim().slice(0, 120);
            if (!nm) return toast('Donne un nom à la version.', 'error');
            if (nm === v.label) return;
            try { await o.rename(v, nm); await changed(); toast(`Version renommée « ${nm} ».`, 'success'); } catch (e) { toast(e.message || String(e), 'error'); }
        }
        async function doRemove(v) {
            try {
                const r = (await o.remove(v)) || {};
                if (cur === String(v.id)) cur = null;
                checked = checked.filter(x => x !== String(v.id));
                if (r.commit) { items = items.filter(x => x !== v); paint(); } else await changed();
                let undone = false;
                const t = A().undoToast ? A().undoToast(`Version « ${v.label} » supprimée`, {undo: r.undo || r.commit ? async () => { undone = true; await r.undo?.(); if (!closed) await changed(); } : null}) : toast(`Version « ${v.label} » supprimée.`);
                if (r.commit) { // la suppression pour de bon, quand le message est parti sans « Annuler »
                    let done = false; const go = () => { removeEventListener('pagehide', go); if (done || undone) return; done = true; Promise.resolve(r.commit()).then(() => { if (!closed) changed(); }).catch(e => toast(e.message || String(e), 'error')); };
                    // le message part (« is-leaving ») : après « ↶ Annuler », undone est déjà vrai
                    if (t?.classList) { const mo = new MutationObserver(() => { if (t.classList.contains('is-leaving')) { mo.disconnect(); setTimeout(go, 0); } }); mo.observe(t, {attributes: true, attributeFilter: ['class']}); }
                    else setTimeout(go, 6500);
                    addEventListener('pagehide', go, {once: true});
                }
            } catch (e) { toast(e.message || String(e), 'error'); }
        }
        const run = async (fn, ...a) => { try { const r = await fn(...a); return r; } catch (e) { toast(e.message || String(e), 'error'); return null; } };
        function more(btn, v, e = null) { // ⋯ et clic droit (K14) : le même menu de l'app
            const items = [
                o.rename && !v.locked && {icon: '✎', label: 'Renommer', run: () => doRename(v)},
                o.copy && {icon: '⧉', label: 'En faire une copie', help: 'Une copie à part, l’original ne change pas.', run: async () => { if (await run(o.copy, v) !== null) { await changed(); } }},
                o.exportOne && {icon: '⤓', label: 'Exporter', help: 'Un fichier sur ton ordinateur.', run: () => run(o.exportOne, v)},
                o.remove && !v.locked && {icon: '🗑', label: 'Supprimer', danger: true, help: 'On peut encore l’annuler juste après.', run: () => doRemove(v)},
            ].filter(Boolean);
            return e ? UI.contextMenu?.(e, items, {title: v.label}) : UI.menuAt?.(btn, items, {title: v.label});
        }

        dlg.addEventListener('click', async e => {
            const t = e.target;
            if (t.closest('[data-vers-close]')) return dlg.close();
            const f = t.closest('[data-vers-filter]'); if (f) { filter = f.dataset.versFilter; paintFilters(); keepScroll(paintList); return; }
            if (t.closest('[data-vers-save]')) { await run(o.saveNow); return changed(); }
            if (t.closest('[data-vers-uncheck]')) { checked = []; keepScroll(paintList); return paintCompare(); }
            if (t.closest('.ui-vers-cb')) return; // la case : « change » s'en charge
            const row = t.closest('[data-vers-row]'); if (row) return select(row.dataset.versRow);
            const x = t.closest('[data-vers-extra]'); if (x) { const v = byId(cur); const a = (o.actions || [])[Number(x.dataset.versExtra)]; if (v && a) { const r = await run(a.run, v, dlg); if (r === 'close') dlg.close(); else if (r !== false) changed(); } return; }
            const b = t.closest('[data-vers-act]'); if (!b) return;
            const v = byId(cur); if (!v) return;
            const k = b.dataset.versAct;
            if (k === 'restore') return doRestore(v);
            if (k === 'cmpnow') { checked = [String(v.id), 'now']; keepScroll(paintList); return paintCompare(); }
            if (k === 'rename') return doRename(v);
            if (k === 'more') return more(b, v);
        });
        dlg.addEventListener('change', e => {
            const c = e.target.closest('[data-vers-check]'); if (!c) return;
            const id = c.dataset.versCheck;
            checked = checked.filter(x => x !== id); if (c.checked) checked.push(id);
            if (checked.length > 2) checked = checked.slice(-2); // la plus ancienne coche part
            keepScroll(paintList); paintCompare();
        });
        dlg.addEventListener('contextmenu', e => { const row = e.target.closest('[data-vers-row]'); const v = row && byId(row.dataset.versRow); if (!v || e.shiftKey) return; e.preventDefault(); cur = String(v.id); keepScroll(paintList); paintPane(); more(null, v, e); }); // more(…, e) ouvre UI.contextMenu
        dlg.addEventListener('keydown', e => {
            const row = e.target.closest?.('[data-vers-row]'); if (!row) return;
            const rows = [...dlg.querySelectorAll('[data-vers-row]')], i = rows.indexOf(row);
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = rows[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (n) select(n.dataset.versRow); }
            else if (e.key === 'Enter') { e.preventDefault(); select(row.dataset.versRow); }
            else if (e.key === ' ') { e.preventDefault(); row.querySelector('[data-vers-check]')?.click(); }
        });
        dlg.addEventListener('close', () => { closed = true; dlg.querySelectorAll('audio, video').forEach(a => { try { a.pause(); } catch (_) {} }); o.onClose?.(); dlg.remove(); });
        dlg.addEventListener('cancel', e => { if (document.querySelector('.ui-actmenu')) e.preventDefault(); });
        dlg.showModal();
        load().then(() => { if (!cur && o.now === false && items[0]) select(String(items[0].id)); else dlg.querySelector('[data-vers-row]')?.focus({preventScroll: true}); });
        dlg.versions = {reload: changed, select, get items() { return items; }};
        return dlg;
    };

    /* ═════ Les versions d'un média (photo retouchée, son, montage) : table media_versions (lib/studio.php) ═════
     * UI.openMediaVersions(media, {tool, kind, onShown(file, versions), actions}) — l'original est toujours gardé (jamais supprimé ni renommé) ;
     * « ↺ Revenir » = cette version devient celle affichée partout (les autres restent) ; ↶ remet la précédente. */
    const DEFAULT_MEDIA_LABEL = /^(Original|(Retouche|Montage) \d+ — \d{2}\/\d{2}\/\d{4})$/;
    UI.openMediaVersions = (media, opt = {}) => {
        const api = (a, p, b) => A().api(a, p || {}, b ? {method: 'POST', body: b} : undefined);
        const kind = opt.kind || (/^(audio|video)$/.test(media.media_type || media.kind || '') ? (media.media_type || media.kind) : 'image');
        const url = f => `media/${encodeURIComponent(f)}`;
        let vs = [];
        const shownOf = () => vs.find(x => x.shown) || vs[0];
        const after = async r => { if (r?.versions) vs = r.versions; const s = shownOf(); opt.onShown?.(s?.filename || r?.filename || '', vs); };
        const show = async id => { const r = await api('retouch_show_version', {}, {media_id: media.id, version_id: id}); await after(r.result || r); };
        const meta = v => () => new Promise(res => {
            if (kind === 'image') { const im = new Image(); im.onload = () => res(`${im.naturalWidth.toLocaleString('fr-FR')} × ${im.naturalHeight.toLocaleString('fr-FR')} px`); im.onerror = () => res(''); im.src = url(v.filename); return; }
            const el = document.createElement(kind === 'video' ? 'video' : 'audio'); el.preload = 'metadata'; el.onloadedmetadata = () => res(isFinite(el.duration) ? clock(el.duration) : ''); el.onerror = () => res(''); el.src = url(v.filename);
        });
        const word = kind === 'image' ? 'image' : kind === 'video' ? 'vidéo' : 'son';
        return UI.openVersions({
            title: media.title || media.filename || 'Média', tool: opt.tool || (kind === 'image' ? 'Retouche' : kind === 'video' ? 'Montage' : 'Son'), kind,
            list: async () => {
                vs = (await api('media_versions', {id: media.id})).versions || [];
                return vs.slice().reverse().map(v => ({id: v.id, label: v.label || 'Version', created_at: v.created_at, auto: DEFAULT_MEDIA_LABEL.test(v.label || ''), locked: !!v.is_original || !v.id, shown: !!v.shown, infoAsync: meta(v), filename: v.filename,
                    badge: v.is_original ? '<span class="ui-badge is-grey">Original</span>' : ''}));
            },
            now: async () => { const s = shownOf(); return s ? {label: 'Maintenant', hint: `la version affichée partout : « ${s.label || 'Original'} »`} : {label: 'Maintenant'}; },
            preview: async v => { const f = v ? v.filename : shownOf()?.filename || media.filename; return f ? {src: url(f), kind} : null; },
            restore: async v => { const before = shownOf(); await show(v.id); return before?.id ? {undo: () => show(before.id), redo: () => show(v.id)} : {}; },
            rename: async (v, label) => { const r = await api('retouch_rename_version', {}, {media_id: media.id, version_id: v.id, label}); if (r.error) throw new Error(r.error); },
            copy: async v => {
                const blob = await (await fetch(url(v.filename))).blob();
                const fd = new FormData(); fd.append('file', blob, v.filename.replace(/^.*?([^/]+)$/, '$1')); fd.append('media_id', media.id); fd.append('mode', 'copy'); fd.append('show', '0');
                fd.append('title', `${media.title || word} — ${v.label}`.slice(0, 300));
                const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state?.csrf || ''}});
                const j = await r.json().catch(() => ({error: 'Réponse illisible du serveur'}));
                if (!r.ok || j.error) throw new Error(j.error || 'Copie impossible.');
                toast(`Copie rangée dans les médias : « ${media.title || word} — ${v.label} ».`, 'success'); opt.onCopy?.(j.result);
            },
            exportOne: async v => { const a = document.createElement('a'); a.href = url(v.filename); a.download = `${(media.title || word).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80)} — ${v.label.replace(/[\\/:*?"<>|]+/g, '-')}${(v.filename.match(/\.[a-z0-9]{2,5}$/i) || [''])[0]}`; document.body.appendChild(a); a.click(); a.remove(); },
            remove: async v => ({undo: async () => {}, commit: async () => { const r = await api('retouch_delete_version', {}, {media_id: media.id, version_id: v.id}); if (r.error) throw new Error(r.error); await after(r.result || r); }}),
            actions: opt.actions, onClose: opt.onClose,
        });
    };
})();
