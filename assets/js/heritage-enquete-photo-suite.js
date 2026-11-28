/* LCNDA — 🔎 Enquête photo : la suite (11 aides de plus). Chargé après heritage-enquete-photo-plus.js ; s'ajoute à sa grille des
 * aides et à ses boutons des questions guidées (ext.enquetePhotoPlus), et se montre sur l'écran (ext.enquetePhotoSuite.onStage).
 * Calculs : app-enquete-photo-core.js (lensRect, gridProgress, legendLines, ghostOn, byYear, sentence, conclusionHistory).
 * Serveur : lib/enquete_photo.php (GET ep&op= that_day, occupations, occasions, photographer_route ; « reopen » dans list et get ;
 * les changements de conclusion et de certitude vont au journal de l'enquête, lignes « ⚖ … »). Essai : tests/test-enquete-photo.js.
 *  🔍 double loupe (la même zone, deux images, position liée) · ▦ grille de lecture (3 × 3, 4 × 4, 6 × 6, cases cochées par image) ·
 *  🔢 numéroter les personnes (légende sous la photo, ⤓ PNG et 🖨 comme une légende d'autrefois ; vivants et fiches confidentielles
 *  jamais nommés en consultation ni en partage sans risque) · 👻 silhouette fantôme (taille et posture, jamais le visage) ·
 *  📅 ce jour-là (météo d'autrefois si installée, lune, histoire locale, la famille ce jour-là et ce mois-là ; rien en ligne) ·
 *  🗺 tournée d'un photographe · 👔 tenues de métier et 🎞 occasions de photo (guides sourcés ↗, reliés à l'arbre) ·
 *  ✍ en une phrase (prudence selon la certitude) · 📜 ce qui a changé ma conclusion · 🔔 du nouveau pour une enquête terminée.
 * Réglages (⚙️ Personnaliser) : taille de la grille, grossissement de la loupe. Réglages de l'enquête : settings_json (grids, people).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {}, UI = () => window.LCNDA_UI || {}, C = () => window.LCNDA_EP_CORE, EP = () => ext.enquetePhoto || {}, X = () => ext.enquetePhotoAides || {};
    const T = (s, v) => { if (v) v = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number.isInteger(x) && x >= 1000 && x <= 2200 ? String(x) : x])); return window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)); };
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (m, k, o) => A().toast?.(m, k, o);
    const undoToast = (m, o) => (A().undoToast ? A().undoToast(m, o) : toast(m));
    const empty = (t, icon = '🔍') => (A().empty ? A().empty(t, {icon}) : `<p class="empty-line">${esc(t)}</p>`);
    const ext_ = (u, n) => (UI().extLink ? UI().extLink(u, n) : `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">↗ ${esc(n)}</a>`);
    const dlgOpen = o => ext.openDialog?.(o);
    const seg = (label, items, cls = '') => (UI().segmented ? UI().segmented({label, cls, items}) : items.map(i => `<button type="button" class="button small secondary${i.on ? ' is-active' : ''}" ${i.attrs}>${i.html}</button>`).join(''));
    const segPick = b => (UI().segPick ? UI().segPick(b) : b.parentElement?.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b)));
    const nf = (n, d = 0) => (window.LCNDA_I18N?.fmtNumber ? window.LCNDA_I18N.fmtNumber(n, {maximumFractionDigits: d}) : String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ','));
    const uid = () => Math.random().toString(36).slice(2, 10);
    const W = p => `https://fr.wikipedia.org/wiki/${p}`;
    const download = (blob, name) => { const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: name}); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    const safeName = s => (A().safeExportFilename ? A().safeExportFilename(s) : String(s || 'enquete').replace(/[^\w-]+/g, '-'));
    const imgs = api => api.images.filter(im => im.media?.media_type === 'image' && im.media.filename && !im.media.missing);
    const settings = api => api.inq.settings || {};
    const prefs = () => ({gridSize: 3, loupeZoom: 4, ...(EP().prefs?.() || {})});
    const CERT_L = {proven: 'Prouvé', probable: 'Probable', supposed: 'Supposé'};
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const placeOf = api => X().placeOf?.(api) || null;
    const yearWin = api => X().yearWin?.(api) || {from: null, to: null};
    const imageChoice = (api, name, cur, list = imgs(api)) => `<select name="${name}">${list.map(im => `<option value="${im.id}" ${im.id === cur ? 'selected' : ''}>${esc(api.letterOf(im))} · ${esc(im.label || im.media?.title || '')}</option>`).join('')}</select>`;
    async function loadImg(api, im) { const el = new Image(); el.src = api.mediaSrc(im.media); await el.decode().catch(() => new Promise(r => { el.onload = r; el.onerror = r; })); return el; }

    /** les réglages de l'enquête : fusionnés tout de suite, enregistrés un peu après (plusieurs clics de suite = un envoi) */
    let saveT = 0, saveApi = null;
    function saveSettings(api, patch, now = false) {
        if (api.ro) return Promise.resolve();
        api.inq.settings = {...(api.inq.settings || {}), ...patch}; saveApi = api; clearTimeout(saveT);
        const go = () => api.post('update', {id: api.inq.id, settings: api.inq.settings}).catch(e => toast(e.message, 'error'));
        if (now) return go();
        return new Promise(r => { saveT = setTimeout(() => { go().then(r); }, 350); });
    }
    function flush() { if (saveApi && saveT) { clearTimeout(saveT); saveT = 0; const a = saveApi; return a.post('update', {id: a.inq.id, settings: a.inq.settings}).catch(() => {}); } return Promise.resolve(); }

    /* ═════════ 1. 🔍 double loupe : la même zone, grossie, sur deux images (position liée) ═════════ */
    async function loupe(api) {
        const list = imgs(api); if (list.length < 2) return toast(T('Ajoute d’abord une deuxième image (un autre tirage, une autre vue) dans l’enquête.'), 'error');
        const a0 = api.img && list.includes(api.img) ? api.img : list[0], b0 = list.find(x => x !== a0);
        const st = {a: a0.id, b: b0.id, k: Math.max(2, Math.min(8, Number(prefs().loupeZoom) || 4)), p: {x: 0.5, y: 0.5}, off: {dx: 0, dy: 0}, linked: true, pb: {x: 0.5, y: 0.5}};
        const el = {};
        const dg = dlgOpen({eyebrow: T('🔍 DOUBLE LOUPE'), title: T('La même zone, sur deux images'), submitLabel: T('Fermer'), wide: true,
            body: `<p class="ui-hint">${esc(T('Promène la loupe sur une des deux vignettes : la même zone grossit sur l’autre image. Délie les positions pour corriger un décalage entre deux tirages.'))}</p>
                <div class="ep-xrow"><label>${esc(T('Image A'))} ${imageChoice(api, 'a', st.a, list)}</label><label>${esc(T('Image B'))} ${imageChoice(api, 'b', st.b, list)}</label>
                    <label class="ep-sl">${esc(T('Grossissement'))}<input type="range" min="2" max="8" step="1" value="${st.k}" data-l2="k"><output>× ${st.k}</output></label>
                    <label class="ui-toggle"><input type="checkbox" data-l2="linked" checked><i></i>${esc(T('Positions liées'))}</label></div>
                <div class="ep2-loupes">${['a', 'b'].map(s => `<figure class="ep2-lp" data-l2side="${s}"><canvas class="ep2-over" data-l2over="${s}" width="320" height="220" tabindex="0" aria-label="${esc(T('Vignette : clique ou glisse pour placer la loupe ; flèches pour la déplacer'))}"></canvas><canvas class="ep2-lens" data-l2lens="${s}" width="320" height="320"></canvas><figcaption data-l2cap="${s}"></figcaption></figure>`).join('')}</div>
                ${api.ro ? '' : `<div><span class="pk-lab">${esc(T('Ce que montre la loupe'))}</span><div class="ep-chipset">${['Le même détail sur les deux images', 'Un détail différent', 'Plus net sur A', 'Plus net sur B'].map(c => `<button type="button" class="ep-tag" data-l2r="${esc(c)}">${esc(T(c))}</button>`).join('')}</div></div>`}`,
            onSubmit: () => true});
        if (!dg) return;
        const load = async () => { el.a = await loadImg(api, api.images.find(i => i.id === st.a)); el.b = await loadImg(api, api.images.find(i => i.id === st.b)); draw(); };
        const posOf = s => (s === 'a' ? st.p : st.linked ? C().linkedPoint(st.p, st.off) : st.pb);
        const draw = () => ['a', 'b'].forEach(s => {
            const im = el[s]; if (!im?.naturalWidth) return; const over = dg.querySelector(`[data-l2over="${s}"]`), lens = dg.querySelector(`[data-l2lens="${s}"]`), p = posOf(s);
            const kk = Math.min(over.width / im.naturalWidth, over.height / im.naturalHeight), ow = im.naturalWidth * kk, oh = im.naturalHeight * kk, ox = (over.width - ow) / 2, oy = (over.height - oh) / 2;
            const g = over.getContext('2d'); g.clearRect(0, 0, over.width, over.height); g.drawImage(im, ox, oy, ow, oh);
            const r = C().lensRect(p.x, p.y, st.k, im.naturalWidth, im.naturalHeight, lens.width, lens.height);
            g.strokeStyle = '#ffd84d'; g.lineWidth = 2; g.strokeRect(ox + r.x * ow, oy + r.y * oh, r.w * ow, r.h * oh);
            const h = lens.getContext('2d'); h.imageSmoothingEnabled = true; h.clearRect(0, 0, lens.width, lens.height);
            h.drawImage(im, r.x * im.naturalWidth, r.y * im.naturalHeight, r.w * im.naturalWidth, r.h * im.naturalHeight, 0, 0, lens.width, lens.height);
            over._fit = {ox, oy, ow, oh};
            dg.querySelector(`[data-l2cap="${s}"]`).textContent = `${api.letterOf(api.images.find(i => i.id === st[s]))} · × ${st.k}`;
        });
        const place = (s, e) => { const c = dg.querySelector(`[data-l2over="${s}"]`), f = c._fit; if (!f) return; const r = c.getBoundingClientRect(), sx = c.width / r.width, sy = c.height / r.height;
            const x = Math.max(0, Math.min(1, ((e.clientX - r.left) * sx - f.ox) / f.ow)), y = Math.max(0, Math.min(1, ((e.clientY - r.top) * sy - f.oy) / f.oh));
            if (s === 'a') st.p = {x, y}; else if (st.linked) st.p = {x: Math.max(0, Math.min(1, x - st.off.dx)), y: Math.max(0, Math.min(1, y - st.off.dy))}; else { st.pb = {x, y}; st.off = {dx: x - st.p.x, dy: y - st.p.y}; }
            draw(); };
        dg.querySelectorAll('[data-l2over]').forEach(c => {
            const s = c.dataset.l2over;
            c.addEventListener('pointerdown', e => { e.preventDefault(); c.setPointerCapture?.(e.pointerId); place(s, e); const mv = ev => place(s, ev), up = () => { c.removeEventListener('pointermove', mv); c.removeEventListener('pointerup', up); }; c.addEventListener('pointermove', mv); c.addEventListener('pointerup', up); });
            c.addEventListener('keydown', e => { const d = {ArrowLeft: [-0.02, 0], ArrowRight: [0.02, 0], ArrowUp: [0, -0.02], ArrowDown: [0, 0.02]}[e.key]; if (!d) return; e.preventDefault();
                if (s === 'b' && !st.linked) { st.pb = {x: Math.max(0, Math.min(1, st.pb.x + d[0])), y: Math.max(0, Math.min(1, st.pb.y + d[1]))}; st.off = {dx: st.pb.x - st.p.x, dy: st.pb.y - st.p.y}; } else st.p = {x: Math.max(0, Math.min(1, st.p.x + d[0])), y: Math.max(0, Math.min(1, st.p.y + d[1]))}; draw(); });
        });
        dg.addEventListener('input', e => { if (e.target.dataset.l2 === 'k') { st.k = Number(e.target.value); e.target.parentElement.querySelector('output').textContent = `× ${st.k}`; draw(); } });
        dg.addEventListener('change', e => { if (e.target.dataset.l2 === 'linked') { st.linked = e.target.checked; if (!st.linked) st.pb = C().linkedPoint(st.p, st.off); draw(); } if (e.target.name === 'a' || e.target.name === 'b') { st[e.target.name] = Number(e.target.value); st.off = {dx: 0, dy: 0}; load(); } });
        dg.addEventListener('click', async e => { const r = e.target.closest('[data-l2r]'); if (!r || api.ro) return; const ia = api.images.find(i => i.id === st.a), ib = api.images.find(i => i.id === st.b);
            await api.addClue({kind: 'objet', text: `${T(r.dataset.l2r)} (${api.letterOf(ia)} / ${api.letterOf(ib)})`, certainty: 'supposed', source: 'compare', why: T('Vu à la double loupe (× {k}), au même endroit des deux images', {k: st.k}), images: {[st.a]: 'yes', [st.b]: 'yes'}, data: {loupe: {x: Math.round(st.p.x * 1000) / 1000, y: Math.round(st.p.y * 1000) / 1000, k: st.k}}}); r.disabled = true; });
        load().catch(() => {});
        return dg;
    }

    /* ═════════ 2. ▦ grille de lecture · 3. 🔢 les personnes numérotées : posées sur la photo (onStage) ═════════ */
    const S = {grid: false, people: false}; // ce qu'on montre sur l'écran ouvert
    const gridOf = (api, im) => { const g = settings(api).grids?.[im.id]; return {n: C().GRID_SIZES.includes(Number(g?.n)) ? Number(g.n) : Number(prefs().gridSize) || 3, done: Array.isArray(g?.done) ? g.done : []}; };
    const peopleOf = (api, im) => (Array.isArray(settings(api).people?.[im.id]) ? settings(api).people[im.id] : []);
    function setGrid(api, im, g) { saveSettings(api, {grids: {...(settings(api).grids || {}), [im.id]: {n: g.n, done: [...new Set(g.done)].sort((a, b) => a - b)}}}); }
    function setPeople(api, im, list) { return saveSettings(api, {people: {...(settings(api).people || {}), [im.id]: list}}); }
    function toggleGrid(api, on = !S.grid) { S.grid = on; if (on) { S.people = false; api.setTool?.('hand'); } repaint(api); if (on) toast(T('▦ Grille de lecture : clique une case quand tu l’as bien regardée.')); }
    function togglePeople(api, on = !S.people) { if (on && api.ro) return; S.people = on; if (on) { S.grid = false; api.setTool?.('hand'); } repaint(api); if (on) toast(T('🔢 Clique sur chaque personne de la photo : elle reçoit un numéro. Écris son nom dans la légende sous la photo.')); }
    function repaint(api) { const stage = api.dlg?.querySelector('[data-ep-stage]'); if (stage) onStage(api, stage); }
    /** appelé par l'écran après chaque dessin de la scène */
    function onStage(api, stage) {
        stage.classList.toggle('ep2-grid-on', S.grid); stage.classList.toggle('ep2-people-on', S.people);
        stage.querySelectorAll('.ep-view').forEach(view => {
            const im = api.images.find(i => i.id === Number(view.dataset.epViewImg)), cv = view.querySelector('.ep-canvas'); if (!im || !cv || !cv.querySelector('img.ep-photo')) return;
            let ov = cv.querySelector('.ep2-ov'); if (!ov) { ov = document.createElement('div'); ov.className = 'ep2-ov'; cv.appendChild(ov); bindOverlay(api, ov, im); }
            const g = gridOf(api, im), marks = peopleOf(api, im), done = new Set(g.done);
            ov.innerHTML = `${S.grid ? `<div class="ep2-grid" style="grid-template-columns:repeat(${g.n},1fr);grid-template-rows:repeat(${g.n},1fr)">${Array.from({length: g.n * g.n}, (_, i) => `<button type="button" class="ep2-cell${done.has(i) ? ' is-done' : ''}" data-ep2-cell="${i}" aria-pressed="${done.has(i)}" aria-label="${esc(T('Case {n} : {s}', {n: i + 1, s: done.has(i) ? T('regardée') : T('pas encore regardée')}))}" ${api.ro ? 'disabled' : ''}>${done.has(i) ? '✓' : ''}</button>`).join('')}</div>` : ''}
                ${marks.map(m => `<button type="button" class="ep2-pin" data-ep2-pin="${esc(m.id)}" style="left:${(m.x * 100).toFixed(2)}%;top:${(m.y * 100).toFixed(2)}%" title="${esc(T('Personne {n}', {n: m.n}))}" aria-label="${esc(T('Personne {n}', {n: m.n}))}">${m.n}</button>`).join('')}`;
            let bar = view.querySelector('.ep2-bar'); if (!S.grid) bar?.remove();
            else { if (!bar) { bar = document.createElement('div'); bar.className = 'ep2-bar'; view.appendChild(bar); bar.addEventListener('pointerdown', e => e.stopPropagation()); bar.addEventListener('click', e => barClick(api, im, e)); }
                const p = C().gridProgress(g);
                bar.innerHTML = `${seg(T('Taille de la grille'), C().GRID_SIZES.map(n => ({on: g.n === n, attrs: `data-ep2-n="${n}" ${api.ro ? 'disabled' : ''}`, html: `${n}×${n}`})), 'ep2-gsz')}<span class="ep2-gp" role="status">${esc(T('{a} sur {b} regardées', {a: p.done, b: p.total}))}${p.all ? ' ✓' : ''}</span><button type="button" class="icon-button small" data-ep2-gclose aria-label="${esc(T('Cacher la grille'))}" title="${esc(T('Cacher la grille'))}">×</button>`; }
        });
        legend(api, stage);
    }
    function barClick(api, im, e) {
        if (e.target.closest('[data-ep2-gclose]')) return toggleGrid(api, false);
        const b = e.target.closest('[data-ep2-n]'); if (!b || api.ro) return; const g = gridOf(api, im), n = Number(b.dataset.ep2N); if (n === g.n) return;
        const before = {...g}; setGrid(api, im, {n, done: []}); repaint(api);
        if (before.done.length) undoToast(T('Grille {n}×{n} : les cases cochées repartent de zéro', {n}), {undo: () => { setGrid(api, im, before); repaint(api); }});
    }
    function bindOverlay(api, ov, im) {
        let down = null;
        ov.addEventListener('pointerdown', e => {
            down = {x: e.clientX, y: e.clientY};
            const pin = e.target.closest('[data-ep2-pin]');
            if (S.people && !api.ro) { e.stopPropagation(); e.preventDefault();
                if (pin) { const list = peopleOf(api, im).map(m => ({...m})), m = list.find(x => x.id === pin.dataset.ep2Pin); if (!m) return; let moved = false;
                    const mv = ev => { const r = ov.getBoundingClientRect(); m.x = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)); m.y = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)); pin.style.left = `${m.x * 100}%`; pin.style.top = `${m.y * 100}%`; moved = true; };
                    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (moved) setPeople(api, im, list); };
                    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); } }
        });
        ov.addEventListener('click', e => {
            const far = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5; down = null; if (far) return;
            if (S.people && !api.ro) {
                if (e.target.closest('[data-ep2-pin]')) return focusLegend(api, e.target.closest('[data-ep2-pin]').dataset.ep2Pin);
                const r = ov.getBoundingClientRect(), list = peopleOf(api, im).slice(), m = {id: uid(), n: C().nextNumber(list), x: Math.round((e.clientX - r.left) / r.width * 10000) / 10000, y: Math.round((e.clientY - r.top) / r.height * 10000) / 10000, label: '', person_id: 0, certainty: 'supposed'};
                setPeople(api, im, [...list, m]); repaint(api); focusLegend(api, m.id); return;
            }
            const c = e.target.closest('[data-ep2-cell]'); if (!c || api.ro || !S.grid) return;
            const g = gridOf(api, im), i = Number(c.dataset.ep2Cell), done = new Set(g.done); if (done.has(i)) done.delete(i); else done.add(i);
            setGrid(api, im, {n: g.n, done: [...done]}); repaint(api);
            const p = C().gridProgress({n: g.n, done: [...done]}); if (p.all && done.has(i)) toast(T('▦ Toute la photo est regardée, case par case.'));
        });
    }
    function focusLegend(api, id) { setTimeout(() => { const i = api.dlg?.querySelector(`[data-ep2-lab="${CSS.escape(id)}"]`); i?.focus(); i?.select?.(); }, 40); }

    /* ─── la légende sous la photo ─── */
    const peopleCache = {}; // id → {id, name, private} (de face_people : un vivant n'est pas nommé en consultation)
    async function loadPeople(api, ids) {
        const need = ids.filter(id => id && !peopleCache[id]); if (!need.length) return;
        try { const r = await api.get('face_people', {ids: need.join(',')}); Object.entries(r.people || {}).forEach(([k, p]) => { peopleCache[k] = p; }); } catch (_) {}
    }
    function legendLines(api, im, safe) {
        const marks = peopleOf(api, im);
        const people = Object.fromEntries(marks.filter(m => m.person_id).map(m => [m.person_id, peopleCache[m.person_id] || {name: '', private: false}]));
        return C().legendLines(marks.map(m => (m.priv ? {...m, label: T('Personne confidentielle'), person_id: 0, certainty: 'proven'} : m)), {people, safe: safe || api.ro, privNames: api.inq.private_names || [], t: T});
    }
    function legend(api, stage) {
        const left = stage.closest('.ep-left'); if (!left) return;
        let box = left.querySelector('[data-ep2-legend]');
        const im = api.img, marks = im ? peopleOf(api, im) : [];
        if (!im || (!S.people && !marks.length)) { box?.remove(); return; }
        if (!box) { box = document.createElement('section'); box.className = 'ep2-legend'; box.dataset.ep2Legend = '1'; stage.after(box); bindLegend(api, box); }
        loadPeople(api, marks.map(m => Number(m.person_id)).filter(Boolean)).then(() => paintLegend(api, box, im));
        paintLegend(api, box, im);
    }
    function paintLegend(api, box, im) {
        const marks = peopleOf(api, im).slice().sort((a, b) => a.n - b.n), lines = legendLines(api, im, false);
        box.innerHTML = `<div class="ep2-lhead"><b>🔢 ${esc(T('Les personnes numérotées'))}</b> <small class="muted">${esc(api.letterOf(im))}</small><span class="ep-sp"></span>
            ${api.ro ? '' : `<button type="button" class="button small ${S.people ? '' : 'secondary'}" data-ep2-mode aria-pressed="${S.people}">${esc(S.people ? T('✓ Numéroter : clique sur la photo') : T('🔢 Numéroter'))}</button>`}
            <button type="button" class="button small secondary" data-ep2-exp="png" ${marks.length ? '' : 'disabled'}>⤓ ${esc(T('PNG avec la légende'))}</button><button type="button" class="button small secondary" data-ep2-exp="print" ${marks.length ? '' : 'disabled'}>🖨 ${esc(T('Imprimer…'))}</button></div>
            ${marks.length ? `<ol class="ep2-ll">${marks.map((m, i) => { const ln = lines.find(l => l.n === m.n) || lines[i], p = m.person_id ? peopleCache[m.person_id] : null;
                return `<li data-ep2-row="${esc(m.id)}"><b class="ep2-num">${m.n}</b>${api.ro || m.priv ? `<span>${esc(ln?.text || '')}</span>` : `<input data-ep2-lab="${esc(m.id)}" value="${esc(m.label || '')}" placeholder="${esc(p?.name || T('inconnu'))}" aria-label="${esc(T('Qui est le numéro {n} ?', {n: m.n}))}" maxlength="120">
                    <button type="button" class="button small secondary" data-ep2-person="${esc(m.id)}">👤 ${esc(p?.name || T('Relier à une personne…'))}</button>${m.person_id ? `<button type="button" class="icon-button small" data-ep2-unperson="${esc(m.id)}" aria-label="${esc(T('Retirer le lien'))}" title="${esc(T('Retirer le lien'))}">⌀</button>` : ''}
                    ${seg(T('Certitude'), Object.entries(CERT_L).map(([k, l]) => ({on: (m.certainty || 'supposed') === k, attrs: `data-ep2-cert="${k}" data-ep2-id="${esc(m.id)}"`, html: esc(T(l))})), 'ep2-lcert')}
                    <button type="button" class="icon-button small" data-ep2-del="${esc(m.id)}" aria-label="${esc(T('Effacer le numéro'))}" title="${esc(T('Effacer le numéro'))}">🗑</button>`}</li>`; }).join('')}</ol>
                <p class="ui-hint">${esc(T('« ? » : pas encore sûr. En consultation et en partage sans risque, un vivant ou une fiche confidentielle n’est jamais nommé.'))}</p>`
            : `<p class="ui-hint">${esc(T('Clique sur chaque personne de la photo : 1, 2, 3… Puis écris qui c’est (« inconnu », « Jean MAZAUD ? »).'))}</p>`}`;
    }
    function bindLegend(api, box) {
        const im = () => api.img, upd = (id, fn) => { const list = peopleOf(api, im()).map(m => ({...m})), m = list.find(x => x.id === id); if (!m) return null; fn(m); setPeople(api, im(), list); return m; };
        box.addEventListener('change', e => { const id = e.target.dataset.ep2Lab; if (id) { upd(id, m => { m.label = e.target.value.trim().slice(0, 120); }); } });
        box.addEventListener('click', async e => {
            const t = e.target;
            if (t.closest('[data-ep2-mode]')) return togglePeople(api);
            const x = t.closest('[data-ep2-exp]'); if (x) return exportLegend(api, im(), x.dataset.ep2Exp);
            if (api.ro) return;
            const c = t.closest('[data-ep2-cert]'); if (c) { segPick(c); upd(c.dataset.ep2Id, m => { m.certainty = c.dataset.ep2Cert; }); paintLegend(api, box, im()); return; }
            const pp = t.closest('[data-ep2-person]'); if (pp) { const P = window.LCNDA_PICKER, it = P?.openPicker ? await P.openPicker({kind: 'person', title: T('Qui est-ce ?')}) : null; if (!it || !Number(it.id)) return;
                upd(pp.dataset.ep2Person, m => { m.person_id = Number(it.id); }); await loadPeople(api, [Number(it.id)]); paintLegend(api, box, im()); return; }
            const up = t.closest('[data-ep2-unperson]'); if (up) { upd(up.dataset.ep2Unperson, m => { m.person_id = 0; }); paintLegend(api, box, im()); return; }
            const d = t.closest('[data-ep2-del]'); if (d) { const before = peopleOf(api, im()).slice(), i0 = im(); setPeople(api, i0, before.filter(m => m.id !== d.dataset.ep2Del)); repaint(api);
                undoToast(T('Numéro effacé'), {undo: () => { setPeople(api, i0, before); repaint(api); }}); }
        });
    }
    /** ⤓ la photo avec ses numéros et la légende dessous, comme les légendes d'autrefois (PNG), ou 🖨 à imprimer */
    async function legendCanvas(api, im, safe) {
        const faces = safe ? (im.faces || []).filter(f => f.private).map(f => ({...f, t: 'blur'})) : [];
        const base = await api.composite(im, {layers: false, extraBlur: faces}), W0 = base.width, H0 = base.height, u = Math.max(W0, H0) / 400;
        const lines = legendLines(api, im, safe), fs = Math.max(14, Math.round(u * 9)), cols = W0 > 900 ? 2 : 1, rows = Math.ceil(lines.length / cols), pad = Math.round(fs * 1.2);
        const cv = document.createElement('canvas'); cv.width = W0; cv.height = H0 + pad * 2 + rows * fs * 1.5; const g = cv.getContext('2d');
        g.fillStyle = '#fbf8f1'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(base, 0, 0);
        peopleOf(api, im).forEach(m => { const x = m.x * W0, y = m.y * H0, r = u * 7; g.beginPath(); g.fillStyle = '#ffffff'; g.arc(x, y, r + u, 0, Math.PI * 2); g.fill(); g.beginPath(); g.fillStyle = '#1b1b1b'; g.arc(x, y, r, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#fff'; g.font = `bold ${Math.round(u * 9)}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(m.n), x, y + u * 0.5); });
        g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = '#2b2418'; g.font = `${fs}px Georgia, serif`;
        lines.forEach((l, i) => { const c = Math.floor(i / rows), r = i % rows; g.fillText(`${l.n} : ${l.text}`, pad + c * (W0 / cols), H0 + pad + (r + 0.8) * fs * 1.5); });
        return cv;
    }
    function exportLegend(api, im, how) {
        const safe0 = api.ro;
        dlgOpen({eyebrow: T('🔢 LÉGENDE'), title: how === 'print' ? T('Imprimer la photo et sa légende') : T('La photo et sa légende (PNG)'), submitLabel: how === 'print' ? T('🖨 Imprimer…') : T('⤓ Télécharger'),
            body: `<label class="ui-toggle"><input type="checkbox" name="safe" ${safe0 ? 'checked disabled' : 'checked'}><i></i>${esc(T('Partage sans risque : visages des vivants floutés, vivants et fiches confidentielles non nommés'))}</label>`,
            onSubmit: async f => {
                const safe = safe0 || f.safe.checked, cv = await legendCanvas(api, im, safe), lines = legendLines(api, im, safe), name = safeName(`${api.inq.title} ${api.letterOf(im)} legende`);
                if (how === 'png') { cv.toBlob(b => download(b, `${name}.png`), 'image/png'); api.post('log_export', {id: api.inq.id, what: 'legende'}).catch(() => {}); return true; }
                const k = Math.min(1, 1800 / Math.max(cv.width, cv.height)), sm = document.createElement('canvas'); sm.width = Math.round(cv.width * k); sm.height = Math.round(cv.height * k); sm.getContext('2d').drawImage(cv, 0, 0, sm.width, sm.height);
                const html = `<div style="font:14px/1.5 Georgia,serif;color:#222;padding:12mm"><h1 style="font-size:20px">${esc(api.inq.title)}</h1><img src="${sm.toDataURL('image/jpeg', 0.9)}" alt="" style="max-width:100%;max-height:200mm"><ol style="list-style:none;padding:0">${lines.map(l => `<li><b>${l.n}</b> : ${esc(l.text)}</li>`).join('')}</ol><p style="font-size:11px">${esc(T('« ? » : pas encore sûr.'))}</p></div>`;
                if (UI().openPrintDialog) UI().openPrintDialog({title: api.inq.title, key: 'enquete-photo-legende', html}); else toast(T('L’impression n’est pas prête.'), 'error');
                api.post('log_export', {id: api.inq.id, kind: 'print', what: 'legende'}).catch(() => {}); return true; }});
    }

    /* ═════════ 4. 👻 silhouette fantôme : le contour d'une personne d'une image, posé sur une autre (taille, posture ; jamais le visage) ═════════ */
    const ghostLayer = (api, im) => api.layersOf(im).find(l => l.id === 'ghost');
    async function ghost(api) {
        const list = imgs(api); if (list.length < 2) return toast(T('Ajoute d’abord une deuxième image dans l’enquête.'), 'error');
        const a0 = api.img && list.includes(api.img) ? api.img : list[0];
        const st = {a: a0.id, b: list.find(x => x !== a0).id, mode: 'free', pts: [], draft: [], shape: '', dx: 0, dy: 0, k: 100, step: 'draw'};
        const el = {};
        const shapesOf = id => (ghostLayer(api, api.images.find(i => i.id === id))?.shapes || []).filter(s => s.t === 'free' && (s.pts || []).length >= 3);
        const dg = dlgOpen({eyebrow: T('👻 SILHOUETTE FANTÔME'), title: T('Comparer une silhouette d’une image à l’autre'), submitLabel: T('Fermer'), wide: true,
            body: `<p class="ui-hint">${esc(T('Entoure une personne sur la première image, puis pose son contour, transparent, sur l’autre : déplace-le et règle sa taille pour comparer la taille et la posture. Seulement la silhouette : jamais le visage.'))}</p>
                <div class="ep-xrow"><label>${esc(T('Entourer sur'))} ${imageChoice(api, 'a', st.a, list)}</label><label>${esc(T('Poser sur'))} ${imageChoice(api, 'b', st.b, list)}</label><label data-g2pick>${esc(T('Contour'))}<select name="shape"></select></label></div>
                <div class="ep-xrow">${seg(T('Façon d’entourer'), [['free', T('Main levée')], ['poly', T('Points (double-clic pour fermer)')]].map(([k, l]) => ({on: st.mode === k, attrs: `data-g2m="${k}" ${api.ro ? 'disabled' : ''}`, html: esc(l)})))}
                    ${api.ro ? '' : `<button type="button" class="button small secondary" data-g2new>✎ ${esc(T('Nouveau contour'))}</button>`}</div>
                <div class="ep2-ghost"><figure><canvas data-g2a width="420" height="420" aria-label="${esc(T('Première image : entoure la personne'))}"></canvas><figcaption data-g2capa></figcaption></figure>
                    <figure><canvas data-g2b width="420" height="420" aria-label="${esc(T('Deuxième image : glisse le contour pour le placer'))}"></canvas><figcaption data-g2capb></figcaption></figure></div>
                <div class="ep-xrow"><label class="ep-sl">${esc(T('Taille du contour'))}<input type="range" min="30" max="250" value="100" data-g2k><output>100 %</output></label><span data-g2h class="muted"></span></div>
                ${api.ro ? '' : `<div><span class="pk-lab">${esc(T('Ce que montre la silhouette'))}</span><div class="ep-chipset">${['Même taille', 'Plus grand sur la deuxième image', 'Plus petit sur la deuxième image', 'Même posture', 'Posture différente'].map(c => `<button type="button" class="ep-tag" data-g2r="${esc(c)}">${esc(T(c))}</button>`).join('')}</div></div>`}`,
            onSubmit: () => true});
        if (!dg) return;
        const ca = dg.querySelector('[data-g2a]'), cb = dg.querySelector('[data-g2b]');
        const fit = (c, im) => { const k = Math.min(c.width / im.naturalWidth, c.height / im.naturalHeight), w = im.naturalWidth * k, h = im.naturalHeight * k; return {ox: (c.width - w) / 2, oy: (c.height - h) / 2, w, h}; };
        const fillShapes = () => { const sel = dg.querySelector('[name=shape]'), L = shapesOf(st.a); sel.innerHTML = L.length ? L.map((s, i) => `<option value="${esc(s.id)}" ${s.id === st.shape ? 'selected' : ''}>${esc(s.text || T('Contour {n}', {n: i + 1}))}</option>`).join('') : `<option value="">${esc(T('— pas encore'))}</option>`;
            if (!L.some(s => s.id === st.shape)) st.shape = L[L.length - 1]?.id || ''; sel.value = st.shape; st.pts = L.find(s => s.id === st.shape)?.pts || []; };
        const ratio = () => (el.a && el.b ? (el.a.naturalHeight / el.a.naturalWidth) / (el.b.naturalHeight / el.b.naturalWidth) : 1);
        const draw = () => {
            if (!el.a?.naturalWidth || !el.b?.naturalWidth) return;
            const fa = fit(ca, el.a), ga = ca.getContext('2d'); ga.clearRect(0, 0, ca.width, ca.height); ga.drawImage(el.a, fa.ox, fa.oy, fa.w, fa.h);
            const path = (g, f, pts, close) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(f.ox + x * f.w, f.oy + y * f.h) : g.moveTo(f.ox + x * f.w, f.oy + y * f.h))); if (close) g.closePath(); };
            const pts = st.draft.length ? st.draft : st.pts;
            if (pts.length) { path(ga, fa, pts, !st.draft.length); ga.fillStyle = 'rgba(130, 80, 223, .25)'; if (!st.draft.length) ga.fill(); ga.strokeStyle = '#8250df'; ga.lineWidth = 2; ga.stroke(); }
            const fb = fit(cb, el.b), gb = cb.getContext('2d'); gb.clearRect(0, 0, cb.width, cb.height); gb.drawImage(el.b, fb.ox, fb.oy, fb.w, fb.h);
            const gh = st.pts.length >= 3 ? C().ghostOn(st.pts, {dx: st.dx, dy: st.dy, k: st.k / 100, ratio: ratio()}) : null;
            if (gh) { path(gb, fb, gh.pts, true); gb.fillStyle = 'rgba(130, 80, 223, .35)'; gb.fill(); gb.setLineDash([6, 4]); gb.strokeStyle = '#8250df'; gb.lineWidth = 2; gb.stroke(); gb.setLineDash([]); }
            ca._f = fa; cb._f = fb;
            dg.querySelector('[data-g2capa]').textContent = api.letterOf(api.images.find(i => i.id === st.a)); dg.querySelector('[data-g2capb]').textContent = api.letterOf(api.images.find(i => i.id === st.b));
            dg.querySelector('[data-g2h]').textContent = gh ? T('Sur la deuxième image, le contour fait {p} % de la hauteur de l’image.', {p: Math.round(gh.h * 100)}) : T('Entoure d’abord une personne sur la première image.');
        };
        const load = async () => { el.a = await loadImg(api, api.images.find(i => i.id === st.a)); el.b = await loadImg(api, api.images.find(i => i.id === st.b)); fillShapes(); draw(); };
        const norm = (c, e) => { const r = c.getBoundingClientRect(), f = c._f; if (!f) return [0, 0]; return [Math.max(0, Math.min(1, ((e.clientX - r.left) * c.width / r.width - f.ox) / f.w)), Math.max(0, Math.min(1, ((e.clientY - r.top) * c.height / r.height - f.oy) / f.h))]; };
        const keep = () => { if (api.ro || st.draft.length < 3) { st.draft = []; draw(); return; }
            const im = api.images.find(i => i.id === st.a), ls = api.layersOf(im), n = shapesOf(st.a).length + 1, s = {id: uid(), t: 'free', x: 0, y: 0, w: 0, h: 0, pts: [...st.draft, st.draft[0]].map(p => [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4]), color: '#8250df', text: T('Silhouette {n}', {n})};
            let l = ghostLayer(api, im); api.change(im, () => { if (!l) { l = {id: 'ghost', name: T('👻 Silhouettes'), visible: true, locked: false, shapes: []}; ls.push(l); } l.shapes.push(s); });
            st.shape = s.id; st.draft = []; st.dx = 0; st.dy = 0; fillShapes(); draw(); toast(T('Contour gardé sur son calque « 👻 Silhouettes » (↶ Annuler dans l’écran).')); };
        ca.addEventListener('pointerdown', e => { if (api.ro) return; e.preventDefault(); const p = norm(ca, e);
            if (st.mode === 'poly') { st.draft.push(p); draw(); return; }
            st.draft = [p]; ca.setPointerCapture?.(e.pointerId); const mv = ev => { st.draft.push(norm(ca, ev)); draw(); }, up = () => { ca.removeEventListener('pointermove', mv); ca.removeEventListener('pointerup', up); keep(); }; ca.addEventListener('pointermove', mv); ca.addEventListener('pointerup', up); });
        ca.addEventListener('dblclick', () => { if (st.mode === 'poly') keep(); });
        cb.addEventListener('pointerdown', e => { e.preventDefault(); if (!st.pts.length || !cb._f) return; cb.setPointerCapture?.(e.pointerId); const x0 = e.clientX, y0 = e.clientY, d0 = {dx: st.dx, dy: st.dy}, r = cb.getBoundingClientRect(), sx = cb.width / r.width / cb._f.w, sy = cb.height / r.height / cb._f.h;
            const mv = ev => { st.dx = d0.dx + (ev.clientX - x0) * sx; st.dy = d0.dy + (ev.clientY - y0) * sy; draw(); }, up = () => { cb.removeEventListener('pointermove', mv); cb.removeEventListener('pointerup', up); }; cb.addEventListener('pointermove', mv); cb.addEventListener('pointerup', up); });
        cb.addEventListener('wheel', e => { e.preventDefault(); st.k = Math.max(30, Math.min(250, st.k + (e.deltaY < 0 ? 5 : -5))); const i = dg.querySelector('[data-g2k]'); i.value = String(st.k); i.parentElement.querySelector('output').textContent = `${st.k} %`; draw(); }, {passive: false});
        dg.addEventListener('input', e => { if (e.target.matches('[data-g2k]')) { st.k = Number(e.target.value); e.target.parentElement.querySelector('output').textContent = `${st.k} %`; draw(); } });
        dg.addEventListener('change', e => { if (e.target.name === 'a' || e.target.name === 'b') { st[e.target.name] = Number(e.target.value); st.draft = []; load(); } if (e.target.name === 'shape') { st.shape = e.target.value; fillShapes(); draw(); } });
        dg.addEventListener('click', async e => {
            const m = e.target.closest('[data-g2m]'); if (m) { segPick(m); st.mode = m.dataset.g2m; st.draft = []; draw(); return; }
            if (e.target.closest('[data-g2new]')) { st.draft = []; toast(st.mode === 'poly' ? T('Clique autour de la personne, point par point ; double-clic pour fermer.') : T('Entoure la personne d’un trait, sans lever le doigt.')); return; }
            const r = e.target.closest('[data-g2r]'); if (!r || api.ro || !st.pts.length) return; const ia = api.images.find(i => i.id === st.a), ib = api.images.find(i => i.id === st.b);
            await api.addClue({kind: 'gens', text: `${T(r.dataset.g2r)} (${T('silhouette')} ${api.letterOf(ia)} → ${api.letterOf(ib)})`, certainty: 'supposed', source: 'compare', why: T('Silhouette de {a} posée sur {b}, à {k} % ; la distance à l’appareil change la taille vue', {a: api.letterOf(ia), b: api.letterOf(ib), k: st.k}), images: {[st.a]: 'yes', [st.b]: 'yes'}, data: {ghost: {shape: st.shape, k: st.k}}}); r.disabled = true; });
        load().catch(() => {});
        return dg;
    }

    /* ═════════ 5. 📅 ce jour-là : ce que l'app sait déjà de ce jour (sur l'ordinateur, rien en ligne) ═════════ */
    function dayOfInq(api) {
        const d = C().dayOf(api.inq.conclusion?.date?.text || ''); if (d) return d;
        for (const c of api.clues) { if (c.certainty === 'refuted' || !['date', 'dos'].includes(c.kind)) continue; const x = C().dayOf(c.text); if (x) return x; }
        return null;
    }
    const iso = d => `${String(d.y).padStart(4, '0')}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    function thatDay(api) {
        const d0 = dayOfInq(api), pl = placeOf(api);
        const dg = dlgOpen({eyebrow: T('📅 CE JOUR-LÀ'), title: T('Ce jour-là'), submitLabel: T('Fermer'), wide: true,
            body: `<p class="ui-hint">${esc(T('Ce que l’app sait déjà de ce jour : la météo d’autrefois (si elle est installée), la lune, l’histoire du lieu et ce qui se passait dans la famille. Tout est lu sur l’ordinateur.'))}</p>
                <div class="ep-xrow"><label>${esc(T('Date'))}<input type="date" name="day" value="${d0 ? iso(d0) : ''}" min="1600-01-01" max="2100-12-31"></label>${pl?.name ? `<span class="muted">📍 ${esc(pl.name)}</span>` : `<span class="muted">${esc(T('Pas de lieu : seulement la lune et la famille.'))}</span>`}</div>
                <div class="ep2-day" data-d2 aria-live="polite">${d0 ? '' : empty(T('Choisis une date au jour près (la conclusion n’en a pas).'), '📅')}</div>`, onSubmit: () => true});
        if (!dg) return;
        const out = dg.querySelector('[data-d2]');
        const run = async () => {
            const v = dg.querySelector('[name=day]').value; const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); if (!m) { out.innerHTML = empty(T('Choisis une date au jour près (la conclusion n’en a pas).'), '📅'); return; }
            const y = +m[1], mo = +m[2], d = +m[3], label = `${d} ${T(MONTHS[mo - 1])} ${y}`, seq = (run.seq = (run.seq || 0) + 1);
            out.innerHTML = `<article class="ep2-card"><h4>📅 ${esc(label)}${pl?.name ? ` · ${esc(pl.name)}` : ''}</h4><div data-d2w></div><div data-d2m></div><div data-d2h></div><div data-d2f></div></article>`;
            const sec = (k, html) => { if (seq !== run.seq) return; const h = out.querySelector(`[data-d2${k}]`); if (h) h.innerHTML = html; };
            // 🌙 la lune (calendrier de l'app)
            const L = window.LCNDA_LUNE; if (L?.phase && L.jd) { try { const ph = L.phase(L.jd(y, mo, d, 21)); sec('m', `<p>🌙 <b>${esc(T('La lune'))}</b> : ${esc(T(ph.name))} · ${esc(T('{p} % éclairée', {p: Math.round(ph.illumination * 100)}))} <small class="muted">(${esc(T('le soir'))})</small>${api.ro ? '' : ` <button type="button" class="link-button" data-d2add="moon" data-t="${esc(T('Lune ce jour-là : {n}', {n: T(ph.name)}))}">＋ ${esc(T('Indice'))}</button>`}</p>`); } catch (_) {} }
            // 🌦 la météo d'autrefois (packs installés)
            const W0 = (ext.pickSources || []).find(x => x.id === 'meteo_jour');
            if (!W0) sec('w', `<p class="muted">🌦 ${esc(T('La météo d’autrefois n’est pas chargée.'))}</p>`);
            else if (pl?.lat == null) sec('w', `<p class="muted">🌦 ${esc(T('Météo : il faut un lieu placé sur la carte.'))}</p>`);
            else { sec('w', `<p class="muted">🌦 ${esc(T('Lecture…'))}</p>`);
                (async () => { let ok = false; try { ok = await W0.installed(); } catch (_) { ok = false; }
                    if (!ok) return sec('w', `<p class="muted">🌦 ${esc(T('La météo d’autrefois n’est pas installée (Réglages → Météo d’autrefois).'))}</p>`);
                    try { const r = await W0.fetch({place: {name: pl.name, lat: pl.lat, lon: pl.lon}, date: v}); const facts = (r.facts || []).slice(0, 6);
                        sec('w', `<p>🌦 <b>${esc(T('La météo'))}</b> : ${facts.map(f => `${esc(f.label)} ${esc(f.value)}`).join(' · ')} ${r.url ? ext_(r.url, T('Source')) : ''}${api.ro ? '' : ` <button type="button" class="link-button" data-d2add="meteo" data-t="${esc(T('Météo ce jour-là : {m}', {m: facts.slice(0, 3).map(f => `${f.label} ${f.value}`).join(', ')}).slice(0, 580))}">＋ ${esc(T('Indice'))}</button>`}</p>`); }
                    catch (e) { sec('w', `<p class="muted">🌦 ${esc(e.message)}</p>`); } })(); }
            // 🗓 l'histoire locale (le monde autour)
            if (pl?.id) { try { const r = await api.get('local_events', {place_id: pl.id, from: y, to: y}); const L2 = (r.events || []).filter(x => x.from <= y && x.to >= y).slice(0, 8);
                sec('h', L2.length ? `<p>🗓 <b>${esc(T('L’histoire du lieu'))}</b></p><ul class="ep2-dl">${L2.map(x => `<li>${esc(x.date || String(x.from))} — ${esc(x.title)}${x.url ? ` ${ext_(x.url, '')}` : ''}</li>`).join('')}</ul>` : `<p class="muted">🗓 ${esc(T('Rien dans l’histoire locale connue cette année-là.'))}</p>`); } catch (_) { sec('h', ''); } }
            // 👪 la famille ce jour-là, ce mois-là
            try { const r = await api.get('that_day', {date: v}); const row = x => `<li>${esc(x.date)} — ${esc(x.label)} : ${x.who.map(w => (w.id ? `<button type="button" class="link-button" data-d2p="${w.id}">${esc(w.name)}</button>` : esc(w.name))).join(', ')}${x.place ? ` <small class="muted">· ${esc(x.place)}</small>` : ''}</li>`;
                sec('f', `<p>👪 <b>${esc(T('Dans la famille'))}</b></p>${r.day.length ? `<p class="ep2-sub">${esc(T('Ce jour-là'))}</p><ul class="ep2-dl">${r.day.map(row).join('')}</ul>` : ''}${r.month.length ? `<p class="ep2-sub">${esc(T('Ce mois-là'))}</p><ul class="ep2-dl">${r.month.map(row).join('')}</ul>` : ''}${!r.day.length && !r.month.length ? `<p class="muted">${esc(T('Rien dans l’arbre ce mois-là.'))}</p>` : ''}`); }
            catch (e) { sec('f', `<p class="muted">${esc(e.message)}</p>`); }
        };
        dg.addEventListener('change', e => { if (e.target.name === 'day') run(); });
        dg.addEventListener('click', async e => {
            const p = e.target.closest('[data-d2p]'); if (p) { dg.close(); api.dlg?.close(); A().openPersonById?.(Number(p.dataset.d2p)); return; }
            const a = e.target.closest('[data-d2add]'); if (a && !api.ro) { const v = dg.querySelector('[name=day]').value; await api.addClue({kind: 'ciel', text: a.dataset.t, certainty: 'supposed', source: 'donnees', why: T('Si la photo est bien du {d} : à comparer avec ce qu’on voit', {d: v})}); a.disabled = true; }
        });
        if (d0) run();
        return dg;
    }

    /* ═════════ 6. 🗺 la tournée d'un photographe : ses photos placées, par année ═════════ */
    const YCOL = ['#055dff', '#d9480f', '#1a7f37', '#8250df', '#bf8700', '#d1242f', '#0a7d8c', '#6e5494'];
    async function route(api = null, pid = 0) {
        let list = []; try { list = (await EP()._get('photographers')).photographers || []; } catch (_) {}
        if (!list.length) return dlgOpen({eyebrow: T('🗺 TOURNÉE'), title: T('La tournée d’un photographe'), submitLabel: T('Fermer'), body: empty(T('Ta liste de photographes est vide : ajoute-les dans 📮 Photographes.'), '📮'), onSubmit: () => true});
        const cur = Number(pid) || Number(list[0].id);
        const dg = dlgOpen({eyebrow: T('🗺 TOURNÉE'), title: T('La tournée d’un photographe'), submitLabel: T('Fermer'), wide: true,
            body: `<p class="ui-hint">${esc(T('Toutes les photos placées sur la carte que tu as reliées à ce photographe (indice « photographe » d’une enquête, éditeur d’une carte postale), regroupées par année : ses tournées.'))}</p>
                <label>${esc(T('Photographe'))}<select name="pid">${list.map(p => `<option value="${p.id}" ${Number(p.id) === cur ? 'selected' : ''}>${esc(p.name)}${p.city ? ` · ${esc(p.city)}` : ''}</option>`).join('')}</select></label><div data-r2 aria-live="polite"></div>`, onSubmit: () => true});
        if (!dg) return;
        const host = dg.querySelector('[data-r2]');
        const run = async id => {
            host.innerHTML = UI().spinner ? UI().spinner(T('Recherche…')) : '';
            let r; try { r = await EP()._get('photographer_route', {pid: id}); } catch (e) { host.innerHTML = empty(e.message); return; }
            const groups = C().byYear(r.photos), col = i => YCOL[i % YCOL.length];
            if (!r.photos.length) { host.innerHTML = empty(r.unplaced ? T('{n} photo(s) de ce photographe, mais aucune n’est placée sur la carte.', {n: r.unplaced}) : T('Aucune photo reliée à ce photographe pour l’instant (note-le comme indice « 📮 Le photographe » dans une enquête).'), '🗺'); return; }
            const pts = groups.flatMap((g, i) => g.photos.map(p => ({lat: p.lat, lon: p.lon, label: `${g.year || '?'} · ${p.place}`, color: col(i)})));
            const paths = groups.filter(g => g.photos.length > 1).map(g => ({coords: g.photos.map(p => [p.lat, p.lon]), color: col(groups.indexOf(g)), dashed: g.year == null}));
            host.innerHTML = `${ext.miniMap ? ext.miniMap(pts, paths, {height: 320}) : ''}
                <ul class="ep2-route">${groups.map((g, i) => `<li><span class="ep2-dot" style="background:${col(i)}"></span><div><b>${esc(g.year ? String(g.year) : T('Année inconnue'))}</b> · ${esc(T('{n} photo(s)', {n: g.photos.length}))} : ${esc([...new Set(g.photos.map(p => p.place))].join(' → '))}
                    <div class="ep-wall">${g.photos.slice(0, 12).map(p => `<button type="button" class="ep-wtile" data-r2m="${p.media_id}" title="${esc(p.title)}"><img src="media/${encodeURIComponent(p.filename)}" alt="" loading="lazy"><small>${esc(p.title)}</small></button>`).join('')}</div></div></li>`).join('')}</ul>
                ${r.unplaced ? `<p class="ui-hint">${esc(T('{n} autre(s) photo(s) sans lieu sur la carte.', {n: r.unplaced}))}</p>` : ''}`;
        };
        dg.addEventListener('change', e => { if (e.target.name === 'pid') run(Number(e.target.value)); });
        dg.addEventListener('click', e => { const m = e.target.closest('[data-r2m]'); if (m) { dg.close(); EP().forMedia?.([Number(m.dataset.r2m)]); } });
        run(cur);
        return dg;
    }

    /* ═════════ 7. 👔 tenues de métier · 8. 🎞 occasions de photo : guides (faits sûrs, sourcés ↗), reliés à l'arbre ═════════ */
    const GUIDES = {
        metiers: {icon: '👔', title: 'Tenues de métier', kind: 'gens', intro: 'Un habit de travail dit souvent le métier : cherche ensuite dans ton arbre qui exerçait ce métier. Un habit n’est qu’un indice (« Supposé ») tant qu’un autre ne le confirme pas.', items: [
            {n: 'Blouse', t: 'Longue chemise de toile, souvent bleue, portée par-dessus les habits par les paysans, les marchands de bestiaux et les ouvriers au XIXᵉ siècle.', cert: 'supposed', url: W('Blouse'), w: ['cultivateur', 'laboureur', 'agriculteur', 'journalier', 'maquignon', 'marchand de bestiaux', 'fermier', 'métayer']},
            {n: 'Tablier de cuir du forgeron', t: 'Un grand tablier de cuir protège le forgeron des étincelles et du métal chaud.', cert: 'supposed', url: W('Forgeron'), w: ['forgeron', 'maréchal-ferrant', 'maréchal ferrant', 'taillandier', 'serrurier']},
            {n: 'Coiffe et rubans de la nourrice', t: 'Les nourrices se faisaient souvent photographier en tenue, avec une coiffe à longs rubans.', cert: 'supposed', url: W('Nourrice'), w: ['nourrice']},
            {n: 'Bleu de travail', t: 'Veste et pantalon de grosse toile bleue des ouvriers et des mécaniciens.', cert: 'supposed', url: W('Bleu_de_travail'), w: ['ouvrier', 'mécanicien', 'ajusteur', 'tourneur', 'chaudronnier', 'cheminot']},
            {n: 'Toque et veste blanche du cuisinier', cert: 'supposed', url: W('Toque_(couvre-chef)'), w: ['cuisinier', 'cuisinière', 'pâtissier', 'chef de cuisine']},
            {n: 'Soutane', t: 'Robe longue des prêtres catholiques.', cert: 'probable', url: W('Soutane'), w: ['prêtre', 'curé', 'abbé', 'vicaire', 'chanoine', 'séminariste']},
            {n: 'Bâchi à pompon rouge', t: 'Le bonnet des marins de la Marine nationale.', cert: 'probable', url: W('Bachi'), w: ['marin', 'matelot', 'quartier-maître', 'quartier maître']},
            {n: 'Sabots', t: 'Chaussures de bois, portées surtout à la campagne.', cert: 'supposed', url: W('Sabot_(chaussure)'), w: ['sabotier']}],
            after: (dg, api) => treeJobs(dg, api)},
        occasions: {icon: '🎞', title: 'Les occasions de photo', kind: 'gens', intro: 'Beaucoup de photos de famille anciennes ont été faites pour une occasion. Chacune propose les événements de ton arbre qui tombent dans la fenêtre de dates de l’enquête.', items: [
            {k: 'conscrits', n: 'Conscrits', t: 'Les jeunes hommes d’une même « classe », celle de l’année de leurs 20 ans, posaient souvent ensemble autour du conseil de révision, avec cocardes et rubans.', cert: 'supposed', url: W('Conseil_de_révision')},
            {k: 'service', n: 'Départ au service militaire', t: 'La conscription, instituée par la loi Jourdan en 1798 ; le service militaire obligatoire a été suspendu par la loi de 1997.', from: 1798, cert: 'supposed', url: W('Service_militaire_en_France')},
            {k: 'communion', n: 'Première communion', t: 'Brassard au bras pour les garçons, robe et voile blancs pour les filles.', cert: 'supposed', url: W('Première_communion')},
            {k: 'bapteme', n: 'Baptême', cert: 'supposed', url: W('Baptême')},
            {k: 'mariage', n: 'Mariage', t: 'Photo de groupe de la noce, souvent devant la maison, la mairie ou l’église.', cert: 'supposed', url: W('Mariage')},
            {k: 'noces', n: 'Noces d’or', t: 'Cinquante ans de mariage.', cert: 'supposed', url: W('Anniversaire_de_mariage')},
            {k: 'deces', n: 'Photo post-mortem', t: 'Photographier un mort, souvent un enfant, pour en garder une image : une pratique répandue au XIXᵉ siècle.', cert: 'supposed', url: W('Photographie_post-mortem')}],
            after: (dg, api) => treeOccasions(dg, api)},
    };
    function installGuides() { const G = X().GUIDES; if (G) Object.entries(GUIDES).forEach(([k, g]) => { if (!G[k]) G[k] = g; }); }
    const OCC_TEXT = {conscrits: 'Peut-être les conscrits de la classe {y} : {w}', service: 'Peut-être le départ au service de {w} ({y})', communion: 'Peut-être la communion de {w} ({y})', bapteme: 'Peut-être le baptême de {w} ({y})',
        mariage: 'Peut-être le mariage de {w} ({y})', noces: 'Peut-être les noces d’or de {w} ({y})', deces: 'Peut-être une photo de deuil ou post-mortem de {w} ({y})'};
    async function treeJobs(dg, api) {
        const host = document.createElement('div'); host.className = 'ep2-tree'; dg.querySelector('.ep-guide')?.after(host);
        const items = GUIDES.metiers.items, words = [...new Set(items.flatMap(it => it.w))];
        let r; try { r = await EP()._get('occupations', {words: words.join('|')}); } catch (_) { return; }
        const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
        const byItem = items.map(it => ({it, people: (r.people || []).filter(p => it.w.some(w => fold(w) === p.word || fold(p.occupation).includes(fold(w))))})).filter(x => x.people.length);
        host.innerHTML = `<h4>👪 ${esc(T('Ces métiers dans ton arbre'))}</h4>${byItem.length ? `<ul class="ep-guide">${byItem.map(({it, people}) => `<li><div><b>${esc(T(it.n))}</b><br><small>${people.slice(0, 12).map(p => `${p.id ? `<button type="button" class="link-button" data-j2p="${p.id}">${esc(p.name)}</button>` : esc(p.name)} <span class="muted">(${esc(p.occupation)}${p.birth || p.death ? `, ${esc(p.birth || '?')}-${esc(p.death || '')}` : ''})</span>`).join(' · ')}</small></div></li>`).join('')}</ul>` : empty(T('Aucun de ces métiers dans ton arbre.'), '👔')}`;
        host.onclick = e => { const p = e.target.closest('[data-j2p]'); if (p) { dg.close(); api?.dlg?.close(); A().openPersonById?.(Number(p.dataset.j2p)); } };
    }
    async function treeOccasions(dg, api) {
        if (!api) return; const host = document.createElement('div'); host.className = 'ep2-tree'; dg.querySelector('.ep-guide')?.after(host);
        const w = yearWin(api); if (!w.from && !w.to) { host.innerHTML = empty(T('Il faut d’abord une fourchette de dates (la frise de la photo).'), '📏'); return; }
        let r; try { r = await api.get('occasions', {from: w.from || w.to, to: w.to || w.from}); } catch (e) { host.innerHTML = empty(e.message); return; }
        const rows = GUIDES.occasions.items.map(it => ({it, list: (r.occasions || {})[it.k] || []})).filter(x => x.list.length);
        host.innerHTML = `<h4>👪 ${esc(T('Dans ton arbre, entre {a} et {b}', {a: r.from, b: r.to}))}</h4>${rows.length ? `<ul class="ep-guide">${rows.map(({it, list}) => `<li><div><b>${esc(T(it.n))}</b>${list.map((x, i) => `<br><small>${x.close ? '⭐ ' : ''}${esc(String(x.year))} · ${esc(x.who.map(p => p.name).join(' et '))}${x.date ? ` <span class="muted">(${esc(x.label)} ${esc(x.date)})</span>` : ''}</small>${api.ro ? '' : ` <button type="button" class="link-button" data-o2="${esc(it.k)}:${i}">＋ ${esc(T('Indice'))}</button>`}`).join('')}</div></li>`).join('')}</ul>
            <p class="ui-hint">${esc(r.family ? T('⭐ : un proche des gens de la photo.') : T('Personne n’est encore identifié sur la photo : tout l’arbre est proposé.'))}</p>` : empty(T('Aucun événement de l’arbre dans cette fenêtre.'), '🎞')}`;
        host.onclick = async e => { const b = e.target.closest('[data-o2]'); if (!b || api.ro) return; const [k, i] = b.dataset.o2.split(':'), x = (r.occasions[k] || [])[Number(i)]; if (!x) return;
            await api.addClue({kind: 'gens', text: T(OCC_TEXT[k] || 'Peut-être : {w} ({y})', {w: x.who.map(p => p.name).join(' et '), y: x.year}).slice(0, 590), certainty: 'supposed', source: 'famille', why: T('L’événement tombe dans la fenêtre de dates de la photo ; à confirmer par un autre indice'), data: {occasion: k, event_id: x.id}}); b.disabled = true; };
    }

    /* ═════════ 9. ✍ en une phrase ═════════ */
    function phrase(api) {
        const s0 = C().sentence(api.inq.conclusion || {}, {t: T});
        const people = (api.inq.links || []).filter(l => l.kind === 'person' && l.ref_id > 0), media = api.images.filter(im => im.media && !im.media.missing);
        const dg = dlgOpen({eyebrow: T('✍ EN UNE PHRASE'), title: T('La conclusion en une phrase'), submitLabel: T('Fermer'),
            body: s0 ? `<p class="ui-hint">${esc(T('Les mots suivent la certitude : « Prouvé » sans rien, « Probable » avec « sans doute », « Supposé » avec « peut-être ». Tu peux retoucher la phrase.'))}</p>
                <textarea name="s" rows="3" ${api.ro ? 'readonly' : ''}>${esc(s0)}</textarea>
                <div class="ep-row"><button type="button" class="button small" data-p2copy>⧉ ${esc(T('Copier'))}</button>${api.ro ? '' : `<button type="button" class="button small secondary" data-p2note ${people.length || media.length ? '' : 'disabled'}>＋ ${esc(T('Ajouter comme note…'))}</button>`}</div>
                ${api.ro || people.length ? '' : `<p class="ui-hint">${esc(T('Relie l’enquête à une personne (🔗 Relier…) pour pouvoir l’ajouter à sa fiche.'))}</p>`}`
                : empty(T('Pas encore de conclusion : choisis le lieu ou la date à l’étape « Ma conclusion ».'), '✍'), onSubmit: () => true});
        if (!dg || !s0) return dg;
        const text = () => dg.querySelector('[name=s]').value.trim();
        dg.addEventListener('click', async e => {
            if (e.target.closest('[data-p2copy]')) { try { await navigator.clipboard.writeText(text()); toast(T('Phrase copiée')); } catch (_) { dg.querySelector('[name=s]').select(); toast(T('Copie impossible ici : la phrase est sélectionnée.'), 'error'); } return; }
            const n = e.target.closest('[data-p2note]'); if (!n || api.ro) return;
            const body = `${text()}\n— ${T('🔎 Enquête photo « {t} »', {t: api.inq.title})}`;
            const items = [...people.map(l => ({icon: '👤', label: l.label, run: () => noteToPerson(api, l.ref_id, body)})), ...(people.length && media.length ? ['-'] : []), ...media.map(im => ({icon: '🖼', label: `${api.letterOf(im)} · ${im.label || im.media.title || ''}`, run: () => noteToMedia(api, im, body)}))];
            UI().menuAt?.(n, items, {title: T('Ajouter comme note à…')});
        });
        return dg;
    }
    async function noteToPerson(api, pid, body) {
        try { const r = await A().api('add_note', {}, {method: 'POST', body: {person_id: pid, title: T('🔎 Enquête photo'), body}}); const id = Number(r?.result?.id ?? r?.id ?? 0);
            undoToast(T('Note ajoutée à la fiche'), id ? {undo: () => A().api('delete_note', {}, {method: 'POST', body: {id}})} : {}); api.post('journal', {id: api.inq.id, what: T('✍ Conclusion ajoutée comme note'), result: body.slice(0, 300)}).catch(() => {}); }
        catch (e) { toast(e.message, 'error'); }
    }
    async function noteToMedia(api, im, body) {
        const before = String(im.media.description || ''), next = before ? `${before}\n\n${body}` : body;
        try { await A().api('save_media', {}, {method: 'POST', body: {media_id: im.media_id, description: next}}); im.media.description = next;
            undoToast(T('Ajoutée à la description de l’image'), {undo: async () => { await A().api('save_media', {}, {method: 'POST', body: {media_id: im.media_id, description: before}}); im.media.description = before; }}); }
        catch (e) { toast(e.message, 'error'); }
    }

    /* ═════════ 10. 📜 ce qui a changé ma conclusion (le journal de l'enquête, lignes « ⚖ ») ═════════ */
    function history(api) {
        const H = C().conclusionHistory(api.inq.journal);
        dlgOpen({eyebrow: T('📜 CE QUI A CHANGÉ'), title: T('Ce qui a changé ma conclusion'), submitLabel: T('Fermer'), wide: true,
            body: H.length ? `<p class="ui-hint">${esc(T('Chaque changement du lieu, de la date ou de la certitude d’un indice, avec l’indice qui l’a fait changer.'))}</p>
                <ol class="ep2-hist">${H.map(j => `<li><small class="muted">${UI().when ? UI().when(j.created_at) : esc(j.created_at)}</small><b>${esc(String(j.what).replace(/^⚖\s*/, ''))}</b><span>${esc(j.result || '')}</span></li>`).join('')}</ol>
                <div class="ep-row"><button type="button" class="button small secondary" data-h2csv>⤓ ${esc(T('Exporter…'))}</button></div>`
                : empty(T('Rien encore : chaque changement de la conclusion ou de la certitude d’un indice sera noté ici.'), '📜'),
            onOpen: dg => dg.addEventListener('click', e => { if (!e.target.closest('[data-h2csv]')) return; const rows = [[T('Date'), T('Quoi'), T('De → à')], ...H.map(j => [j.created_at, String(j.what).replace(/^⚖\s*/, ''), j.result])];
                if (UI().exportRows) UI().exportRows({title: T('Ce qui a changé ma conclusion'), name: `${api.inq.title} historique`, rows: () => rows}); }), onSubmit: () => true});
    }
    /** à l'étape « Ma conclusion » : quel indice m'a fait changer d'avis (le dernier modifié, proposé) */
    function becauseHtml(api) {
        if (api.ro) return '';
        const L = api.clues.filter(c => c.certainty !== 'refuted').slice().sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')) || b.id - a.id);
        if (!L.length) return '';
        return `<label class="ep2-because">${esc(T('Si je change d’avis, c’est à cause de l’indice'))}<select name="c_because"><option value="">${esc(T('— aucun en particulier'))}</option>${L.map((c, i) => `<option value="${c.id}" ${i === 0 ? 'selected' : ''}>${c.num} · ${esc(c.text.slice(0, 60))}</option>`).join('')}</select></label>`;
    }

    /* ═════════ 11. 🔔 du nouveau pour une enquête terminée (calculé à la demande par le serveur : « reopen ») ═════════ */
    function reopenNotice(api) {
        const R = api.inq.reopen || []; if (api.inq.status !== 'done' || !R.length) return '';
        return `<div class="ui-notice ep2-reopen" role="status">🔔 <b>${esc(T('Du nouveau qui pourrait aider :'))}</b><ul>${R.map(r => `<li>${esc(r.label)}</li>`).join('')}</ul>${api.ro ? '' : `<button type="button" class="button small" data-ep2-reopen>↺ ${esc(T('Reprendre l’enquête'))}</button>`}</div>`;
    }
    function reopenAid(api) {
        const R = api.inq.reopen || [];
        dlgOpen({eyebrow: T('🔔 DU NOUVEAU'), title: T('Du nouveau pour cette enquête ?'), submitLabel: T('Fermer'),
            body: `${api.inq.status !== 'done' ? `<p class="ui-hint">${esc(T('L’enquête est en cours. Une fois « terminée pour l’instant », elle est signalée dans la liste dès que du nouveau pourrait aider : une photo du même photographe ou du même lieu, des données installées, un événement de l’arbre dans sa fenêtre de dates.'))}</p>` : ''}
                ${R.length ? `<ul>${R.map(r => `<li>${esc(r.label)}</li>`).join('')}</ul>` : api.inq.status === 'done' ? empty(T('Rien de neuf depuis que l’enquête a été terminée.'), '🔔') : ''}`, onSubmit: () => true});
    }
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-ep2-reopen]'); if (!b) return; const cur = EP().current; if (cur && !cur.ro) { cur.inq.reopen = []; cur.setStatus('open').then(() => cur.renderSide()); } });
    /** la petite pastille des listes (Documents → 🔎 Enquêtes photo, Outils de modification) */
    const reopenBadge = q => ((q?.reopen || []).length ? {text: `🔔 ${T('Du nouveau')}`, kind: 'blue', title: q.reopen.map(r => r.label).join(' · ')} : null);

    /* ═════════ ⚙️ Personnaliser : la taille de la grille, le grossissement de la loupe ═════════ */
    function prefsHtml(p) {
        return `<label>${esc(T('▦ Grille de lecture : taille au départ'))} <select data-pf="gridSize">${C().GRID_SIZES.map(n => `<option value="${n}" ${Number(p.gridSize || 3) === n ? 'selected' : ''}>${n} × ${n}</option>`).join('')}</select></label>
            <label>${esc(T('🔍 Double loupe : grossissement au départ'))} <input type="number" min="2" max="8" step="1" value="${Number(p.loupeZoom) || 4}" data-pf="loupeZoom"></label>`;
    }
    function prefsRead(dg) { const g = k => dg.querySelector(`[data-pf="${k}"]`); return {gridSize: C().GRID_SIZES.includes(Number(g('gridSize')?.value)) ? Number(g('gridSize').value) : 3, loupeZoom: Math.max(2, Math.min(8, Number(g('loupeZoom')?.value) || 4))}; }

    /* ═════════ la grille des aides, les questions guidées : ajoutés à ceux de heritage-enquete-photo-plus.js ═════════ */
    const AIDES = [['🔢 Regarder, nommer, raconter', [['loupe2', '🔍', 'Double loupe'], ['grille', '▦', 'Grille de lecture'], ['numeros', '🔢', 'Numéroter les personnes'], ['silhouette', '👻', 'Silhouette fantôme'], ['cejour', '📅', 'Ce jour-là'],
        ['tournee', '🗺', 'Tournée du photographe'], ['g:metiers', '👔', 'Tenues de métier'], ['g:occasions', '🎞', 'Occasions de photo'], ['phrase', '✍', 'En une phrase'], ['historique', '📜', 'Ce qui a changé ma conclusion'], ['nouveau', '🔔', 'Du nouveau ?']]]];
    const OPEN = {loupe2: loupe, grille: a => toggleGrid(a, true), numeros: a => (a.ro ? repaint(a) : togglePeople(a, true)), silhouette: ghost, cejour: thatDay, tournee: a => route(a), phrase, historique: history, nouveau: reopenAid};
    const READONLY = ['loupe2', 'grille', 'cejour', 'tournee', 'phrase', 'historique', 'nouveau'];
    function stepButtons(k, mk) {
        const b = (key, label) => mk(`data-ep-aide="${key}"`, label), g = (key, label) => mk(`data-ep-guide="${key}"`, label);
        const row = list => `<div class="ep-row ep-plusrow">${list.join('')}</div>`;
        return {support: row([b('tournee', T('🗺 Tournée du photographe'))]),
            texte: row([b('loupe2', T('🔍 Double loupe')), b('grille', T('▦ Grille de lecture'))]),
            objets: row([b('loupe2', T('🔍 Double loupe')), b('grille', T('▦ Grille de lecture'))]),
            gens: row([b('numeros', T('🔢 Numéroter les personnes')), b('silhouette', T('👻 Silhouette fantôme')), g('metiers', T('👔 Tenues de métier')), g('occasions', T('🎞 Occasions de photo'))]),
            date: row([b('cejour', T('📅 Ce jour-là')), g('occasions', T('🎞 Occasions de photo'))]),
            conclusion: row([b('phrase', T('✍ En une phrase')), b('historique', T('📜 Ce qui a changé ma conclusion')), b('cejour', T('📅 Ce jour-là'))])}[k] || '';
    }
    function install() {
        installGuides();
        const P = ext.enquetePhotoPlus; if (!P || P._suite) return !!P; P._suite = true;
        P.AIDES.push(...AIDES); (P.READONLY = P.READONLY || []).push(...READONLY);
        const has0 = P.has, open0 = P.open, step0 = P.stepButtons, close0 = P.onClose;
        P.has = k => Object.prototype.hasOwnProperty.call(OPEN, k) || (k.startsWith('g:') && !!GUIDES[k.slice(2)]) || has0(k);
        P.open = (k, api) => { installGuides(); if (OPEN[k]) return OPEN[k](api); if (k.startsWith('g:') && GUIDES[k.slice(2)]) return X().guide?.(k.slice(2), api); return open0(k, api); };
        P.stepButtons = (k, mk) => (step0 ? step0(k, mk) : '') + stepButtons(k, mk);
        P.onClose = api => { S.grid = false; S.people = false; flush(); return close0?.(api); };
        return true;
    }
    if (!install()) setTimeout(install, 0);
    ext.enquetePhotoSuite = {onStage, becauseHtml, reopenNotice, reopenBadge, prefsHtml, prefsRead, route, loupe, ghost, thatDay, phrase, history, toggleGrid, togglePeople, legendCanvas, exportLegend, GUIDES, AIDES, _state: S, _flush: flush};
})();
