/* LCNDA — 🔎 Enquête photo : 26 aides en plus, et « 👤 Qui est-ce ? » (le pont vers l'outil local 👤 Visages).
 * Chargé après heritage-enquete-photo-aides.js ; la grille des aides et les questions guidées les proposent (ext.enquetePhotoPlus).
 * Calculs : app-enquete-photo-core.js (canaux, relief, mesure, boussole, « qui pourrait-ce être », croissance…). Serveur :
 * lib/enquete_photo.php (GET ep&op= candidates, face_people, buildings, local_events, map, races, family_places). Essai :
 * tests/test-enquete-photo.js.
 *  🔬 regarder de plus près : 🎨 canaux de couleur, 🔦 lumière rasante, 🪞 deux tirages, 🔬 grain et trame, 📏 mesurer ;
 *  🏠 le décor et le pays : 🛋 intérieur, 🎭 décor de studio, 🐄 bêtes et cultures, 🏘 toits, 🏙 profil des toits, 🧭 boussole,
 *     📐 distances, 🏗 construction et démolition, 🗓 histoire locale ;
 *  👪 qui, et dans quel ordre : 👪 qui pourrait-ce être, 👤 qui est-ce (visages), 💍 habit qui revient, 👶 croissance des enfants,
 *     🗃 provenance, ✍ plusieurs mains au dos, 📜 atelier de transcription ;
 *  🧠 faire le point : ☑ ai-je tout regardé, 😈 avocat du diable, 🌡 niveau et temps passé, 📋 rapport d'expert, 🧩 tableau,
 *     🗺 carte des enquêtes (calque de la grande carte, éteint au départ).
 * 👤 Qui est-ce ? : SEULEMENT l'outil Visages déjà installé (empreintes calculées sur cet ordinateur, comparées aux visages que la
 * personne a identifiés à la main dans SES photos), à la demande ; rien en ligne ; « Supposé » seul, « Probable » confirmé par un
 * autre indice qui n'est pas un visage, jamais « Prouvé ». L'IA, elle, ne regarde jamais les visages.
 * Les guides : seulement des faits sûrs, chacun avec sa source ↗ ; rien n'est téléchargé ni livré ici.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const key of ['mapSetup', 'mapDraw']) ext[key] = ext[key] || [];
    const A = () => window.LCNDA_APP || {}, UI = () => window.LCNDA_UI || {}, C = () => window.LCNDA_EP_CORE, EP = () => ext.enquetePhoto || {}, X = () => ext.enquetePhotoAides || {};
    // les années restent « 1860 » (pas « 1 860 ») : passées en texte
    const T = (s, v) => { if (v) v = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number.isInteger(x) && x >= 1000 && x <= 2200 ? String(x) : x])); return window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)); };
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (m, k, o) => A().toast?.(m, k, o);
    const undoToast = (m, o) => (A().undoToast ? A().undoToast(m, o) : toast(m));
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    const empty = (t, icon = '🔍') => (A().empty ? A().empty(t, {icon}) : `<p class="empty-line">${esc(t)}</p>`);
    const ext_ = (u, n) => (UI().extLink ? UI().extLink(u, n) : `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">↗ ${esc(n)}</a>`);
    const dlgOpen = o => ext.openDialog?.(o);
    const seg = (label, items, cls = '') => (UI().segmented ? UI().segmented({label, cls, items}) : items.map(i => `<button type="button" class="button small secondary${i.on ? ' is-active' : ''}" ${i.attrs}>${i.html}</button>`).join(''));
    const segPick = b => (UI().segPick ? UI().segPick(b) : b.parentElement?.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b)));
    const nf = (n, d = 1) => (window.LCNDA_I18N?.fmtNumber ? window.LCNDA_I18N.fmtNumber(n, {maximumFractionDigits: d}) : String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ','));
    const uid = () => Math.random().toString(36).slice(2, 10);
    const W = p => `https://fr.wikipedia.org/wiki/${p}`;
    const CERTS = [['proven', 'Prouvé'], ['probable', 'Probable'], ['supposed', 'Supposé']];
    const certSeg = (on = 'supposed', list = CERTS) => `${seg(T('Certitude'), list.map(([k, l]) => ({on: k === on, attrs: `data-xc="${k}"`, html: esc(T(l))})), 'ep-xcert')}<input type="hidden" name="xc" value="${on}">`;
    const bindCert = dg => dg.addEventListener('click', e => { const b = e.target.closest('[data-xc]'); if (!b) return; segPick(b); const h = dg.querySelector('[name=xc]'); if (h) h.value = b.dataset.xc; });
    const download = (blob, name) => { const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: name}); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    const safeName = s => (A().safeExportFilename ? A().safeExportFilename(s) : String(s || 'enquete').replace(/[^\w-]+/g, '-'));
    const placeOf = api => X().placeOf?.(api) || null;
    const yearWin = api => X().yearWin?.(api) || {from: null, to: null};
    const imgs = api => api.images.filter(im => im.media?.media_type === 'image' && im.media.filename && !im.media.missing);
    const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

    /** les réglages de l'enquête (settings_json), fusionnés puis enregistrés */
    async function saveSettings(api, patch) {
        if (api.ro) return;
        const s = {...(api.inq.settings || {}), ...patch}; api.inq.settings = s;
        try { await api.post('update', {id: api.inq.id, settings: s}); } catch (e) { toast(e.message, 'error'); }
    }
    const settings = api => api.inq.settings || {};
    /** une image de l'enquête, chargée (pour les filtres sur l'ordinateur) */
    async function loadImg(api, im) { const el = new Image(); el.src = api.mediaSrc(im.media); await el.decode().catch(() => new Promise(r => { el.onload = r; el.onerror = r; })); return el; }
    /** l'image dans un <canvas> réduit (côté le plus long : max points) */
    function toCanvas(el, max = 1000) { const k = Math.min(1, max / Math.max(el.naturalWidth || 1, el.naturalHeight || 1)), cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round((el.naturalWidth || 1) * k)); cv.height = Math.max(1, Math.round((el.naturalHeight || 1) * k)); cv.getContext('2d').drawImage(el, 0, 0, cv.width, cv.height); return cv; }
    const imageChoice = (api, name = 'img', cur = api.img?.id, list = imgs(api)) => `<select name="${name}">${list.map(im => `<option value="${im.id}" ${im.id === cur ? 'selected' : ''}>${esc(api.letterOf(im))} · ${esc(im.label || im.media?.title || '')}</option>`).join('')}</select>`;
    const clueKindOfImage = im => (im?.side === 'verso' ? 'dos' : 'texte');

    /* ═════════ 1. 🎨 canaux de couleur · 2. 🔦 lumière rasante : dans « 🎚️ Mieux voir » (le panneau de l'atelier, sur l'image affichée) ═════════ */
    function betterSee(api, rake = false) { if (!imgs(api).length) return toast(T('Choisis d’abord une image.'), 'error'); (EP().current?.betterSee || api.betterSee)?.call(EP().current, {rake}); toast(rake ? T('🔦 Lumière rasante : règle d’où vient la lumière dans « 🎚️ Mieux voir ».') : T('🎨 Un canal de couleur, le négatif : dans « 🎚️ Mieux voir ».')); }
    /** « ＋ Garder ce que je lis » (dans 🎚️ Mieux voir) : le texte lu avec un réglage devient un indice « Supposé » */
    async function keepRead(api, im, how, view) {
        if (api.ro || !im) return;
        const t = await A().askText?.({title: T('Ce que tu lis avec ce filtre'), placeholder: T('Phot. J. LACOMBE, Tulle')}); if (!t) return;
        await api.addClue({kind: clueKindOfImage(im), text: T('Lu avec « {f} » : « {t} »', {f: how, t}).slice(0, 590), certainty: 'supposed', why: T('Vu avec un filtre calculé sur l’ordinateur : à vérifier sur l’original'), images: {[im.id]: 'yes'}, data: {filter: {channel: view?.channel || '', invert: !!view?.invert, rake: view?.rake ? view.rakeAz : 0}}});
    }

    /* ═════════ 3. 🪞 deux tirages de la même photo : superposer, clignoter, différence ═════════ */
    async function twoPrints(api) {
        const list = imgs(api); if (list.length < 2) return toast(T('Ajoute d’abord le deuxième tirage dans l’enquête (« ＋ Ajouter une photo ou un document… »).'), 'error');
        const a0 = api.img && list.includes(api.img) ? api.img : list[0], b0 = list.find(x => x !== a0);
        const st = {a: a0.id, b: b0.id, mode: 'fade', op: 50, dx: 0, dy: 0, k: 100}; let A0 = null, B0 = null, blink = 0, show = true;
        const dg = dlgOpen({eyebrow: T('🪞 DEUX TIRAGES'), title: T('Deux tirages de la même photo'), submitLabel: T('Fermer'), wide: true,
            body: `<p class="ui-hint">${esc(T('Pose l’un sur l’autre : ce qui change saute aux yeux (recadrage, retouche, personne effacée). Règle le décalage pour les aligner.'))}</p>
                <div class="ep-xrow"><label>${esc(T('Tirage A'))} ${imageChoice(api, 'a', st.a, list)}</label><label>${esc(T('Tirage B'))} ${imageChoice(api, 'b', st.b, list)}</label></div>
                <div class="ep-xrow">${seg(T('Façon de comparer'), [['fade', T('Fondu')], ['blink', T('Clignoter')], ['diff', T('Différence')]].map(([k, l]) => ({on: st.mode === k, attrs: `data-xm="${k}"`, html: esc(l)})))}
                    <label class="ep-sl">${esc(T('Opacité de B'))}<input type="range" min="0" max="100" value="${st.op}" data-xf="op"><output>${st.op} %</output></label></div>
                <div class="ep-xrow"><label class="ep-sl">${esc(T('Décaler B ←→'))}<input type="range" min="-200" max="200" value="0" data-xf="dx"><output>0</output></label><label class="ep-sl">${esc(T('Décaler B ↑↓'))}<input type="range" min="-200" max="200" value="0" data-xf="dy"><output>0</output></label><label class="ep-sl">${esc(T('Taille de B'))}<input type="range" min="50" max="200" value="100" data-xf="k"><output>100 %</output></label></div>
                <div class="ep-xcv" data-xcv>${UI().spinner ? UI().spinner(T('Calcul…')) : ''}</div>
                ${api.ro ? '' : `<div><span class="pk-lab">${esc(T('Ce que montre la comparaison'))}</span><div class="ep-chipset">${['Même photo, recadrée', 'Retouche visible', 'Une personne effacée ou ajoutée', 'Les deux tirages sont identiques', 'Pas la même prise de vue'].map(c => `<button type="button" class="ep-tag" data-xr="${esc(c)}">${esc(T(c))}</button>`).join('')}</div></div>`}`,
            onSubmit: () => true});
        if (!dg) return;
        const host = dg.querySelector('[data-xcv]');
        const load = async () => { A0 = toCanvas(await loadImg(api, api.images.find(i => i.id === st.a)), 1000); B0 = toCanvas(await loadImg(api, api.images.find(i => i.id === st.b)), 1000); host.innerHTML = ''; const cv = document.createElement('canvas'); cv.width = A0.width; cv.height = A0.height; cv.className = 'ep-xcanvas'; host.appendChild(cv); draw(); };
        const draw = () => { const cv = host.querySelector('canvas'); if (!cv || !A0 || !B0) return; const g = cv.getContext('2d'); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, cv.width, cv.height); g.drawImage(A0, 0, 0);
            if (st.mode === 'blink' && !show) return;
            const k = st.k / 100, w = A0.width * k, h = B0.height * (A0.width / B0.width) * k;
            g.globalAlpha = st.mode === 'diff' ? 1 : st.mode === 'blink' ? 1 : st.op / 100; g.globalCompositeOperation = st.mode === 'diff' ? 'difference' : 'source-over';
            g.drawImage(B0, st.dx, st.dy, w, h); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; };
        const setBlink = () => { clearInterval(blink); blink = 0; show = true; if (st.mode === 'blink') blink = setInterval(() => { show = !show; draw(); }, 650); draw(); };
        dg.addEventListener('close', () => clearInterval(blink));
        dg.addEventListener('input', e => { const k = e.target.dataset.xf; if (!k) return; st[k] = Number(e.target.value); const o = e.target.parentElement.querySelector('output'); if (o) o.textContent = `${e.target.value}${k === 'op' || k === 'k' ? ' %' : ''}`; draw(); });
        dg.addEventListener('change', e => { if (e.target.name === 'a' || e.target.name === 'b') { st[e.target.name] = Number(e.target.value); load(); } });
        dg.addEventListener('click', async e => {
            const m = e.target.closest('[data-xm]'); if (m) { segPick(m); st.mode = m.dataset.xm; setBlink(); return; }
            const r = e.target.closest('[data-xr]'); if (r) { const ia = api.images.find(i => i.id === st.a), ib = api.images.find(i => i.id === st.b);
                await api.addClue({kind: 'support', text: `${T(r.dataset.xr)} (${api.letterOf(ia)} / ${api.letterOf(ib)})`, certainty: 'probable', source: 'compare', why: T('Deux tirages superposés ({m})', {m: T({fade: 'Fondu', blink: 'Clignoter', diff: 'Différence'}[st.mode])}), images: {[st.a]: 'yes', [st.b]: 'yes'}}); r.disabled = true; }
        });
        load().catch(err => { host.innerHTML = empty(err.message || T('Pas disponible.')); });
    }

    /* ═════════ 4. 📏 mesurer d'après une taille connue ═════════ */
    let pending = null; // {mode: 'measure' | 'roof', image}
    /** appelé par l'écran à la fin d'un tracé : la mesure (📐 ligne) et le profil des toits (✎) vont sur leur calque */
    function onDraw(api, im, s) {
        if (!pending || pending.image !== im.id) return false;
        if (pending.mode === 'measure' && s.t === 'line') {
            const ls = api.layersOf(im); let l = ls.find(x => x.id === 'measure'); if (!l) l = {id: 'measure', name: T('📏 Mesures'), visible: true, locked: false, shapes: []};
            s.n = l.shapes.length + 1; s.color = '#d9480f'; api.change(im, () => { if (!ls.includes(l)) ls.push(l); l.shapes.push(s); }); pending = null; api.setTool('hand'); setTimeout(() => measureTool(api), 60); return true;
        }
        if (pending.mode === 'roof' && s.t === 'free') {
            const ls = api.layersOf(im); let l = ls.find(x => x.id === 'roof'); if (!l) l = {id: 'roof', name: T('🏙 Profil des toits'), visible: true, locked: false, shapes: []};
            s.color = '#8250df'; api.change(im, () => { if (!ls.includes(l)) ls.push(l); l.shapes = [s]; }); pending = null; api.setTool('hand'); setTimeout(() => roofTool(api), 60); return true;
        }
        return false;
    }
    function segLen(api, im, s) { const v = api.viewOf(im)?.querySelector('img.ep-photo'), Wd = v?.naturalWidth || 1000, Hd = v?.naturalHeight || 1000; return Math.hypot((s.pts[1][0] - s.pts[0][0]) * Wd, (s.pts[1][1] - s.pts[0][1]) * Hd); }
    function measureTool(api) {
        const im = api.img; if (!im) return toast(T('Choisis d’abord une image.'), 'error');
        const segs = (api.layersOf(im).find(l => l.id === 'measure')?.shapes || []).filter(s => s.t === 'line' && s.pts);
        const draw = () => { if (api.ro) return; pending = {mode: 'measure', image: im.id}; api.setTool('line'); toast(T('Trace un segment sur la photo (📐) : une porte, une brique, une personne debout…')); };
        if (!segs.length) { draw(); return; }
        const lens = segs.map(s => ({len: segLen(api, im, s)}));
        let st = {ref: 0, size: 'porte', mine: '', tol: 0.1};
        const sizes = {porte: [2, 0.1, T('une porte (environ 2 m)')], brique: [0.22, 0.05, T('une brique (22 cm)')], moi: [0, 0.05, T('ma valeur')]};
        const body = () => `<p class="ui-hint">${esc(T('Choisis un segment dont tu connais la taille : les autres sont estimés par une règle de trois.'))}</p>
            <div class="ep-xrow"><label>${esc(T('Segment connu'))}<select name="ref">${segs.map((s, i) => `<option value="${i}" ${st.ref === i ? 'selected' : ''}>📏 ${s.n || i + 1}</option>`).join('')}</select></label>
                <label>${esc(T('C’est'))}<select name="size">${Object.entries(sizes).map(([k, v]) => `<option value="${k}" ${st.size === k ? 'selected' : ''}>${esc(v[2])}</option>`).join('')}</select></label>
                <label ${st.size === 'moi' ? '' : 'hidden'} data-xmine>${esc(T('Taille (en mètres)'))}<input name="mine" inputmode="decimal" value="${esc(st.mine)}" placeholder="1,70"></label></div>
            <div data-xout aria-live="polite"></div>
            <p class="ui-notice">⚠️ ${esc(T('Valable seulement pour des choses à la même distance de l’appareil et à peu près de face. Avec la perspective (un mur en biais, une personne au fond), l’erreur peut être très grande.'))}</p>
            ${api.ro ? '' : `<button type="button" class="button small secondary" data-xdraw>📐 ${esc(T('Tracer un autre segment'))}</button>`}`;
        const calc = dg => {
            const out = dg.querySelector('[data-xout]'), s = sizes[st.size], size = st.size === 'moi' ? Number(String(st.mine).replace(',', '.')) : s[0];
            const res = C().measure(lens, st.ref, size, s[1]);
            out.innerHTML = res.length ? `<table class="ep-stable"><tbody>${res.map(r => `<tr><td>📏 ${segs[r.i].n || r.i + 1}${r.i === st.ref ? ` <small class="muted">${esc(T('(connu)'))}</small>` : ''}</td><td><b>${esc(T('environ {v} m', {v: nf(r.value, 2)}))}</b><br><small class="muted">${esc(T('entre {a} et {b} m (± {p} %)', {a: nf(r.lo, 2), b: nf(r.hi, 2), p: Math.round(r.rel * 100)}))}</small></td><td>${api.ro || r.i === st.ref ? '' : `<button type="button" class="button small secondary" data-xadd="${r.i}">＋ ${esc(T('Indice'))}</button>`}</td></tr>`).join('')}</tbody></table>` : empty(T('Donne la taille du segment connu.'), '📏');
            return res;
        };
        let res = [];
        dlgOpen({eyebrow: T('📏 MESURER'), title: T('Mesurer d’après une taille connue'), submitLabel: T('Fermer'), wide: true, body: body(),
            onOpen: dg => { res = calc(dg);
                dg.addEventListener('input', e => { if (e.target.name === 'mine') { st.mine = e.target.value; res = calc(dg); } });
                dg.addEventListener('change', e => { if (e.target.name === 'ref') st.ref = Number(e.target.value); if (e.target.name === 'size') { st.size = e.target.value; dg.querySelector('[data-xmine]').hidden = st.size !== 'moi'; } res = calc(dg); });
                dg.addEventListener('click', async e => {
                    if (e.target.closest('[data-xdraw]')) { dg.close(); draw(); return; }
                    const b = e.target.closest('[data-xadd]'); if (!b) return; const r = res.find(x => x.i === Number(b.dataset.xadd)); if (!r) return;
                    const what = await A().askText?.({title: T('Qu’est-ce que ce segment ?'), placeholder: T('l’homme debout, la façade…')}); if (!what) return;
                    await api.addClue({kind: 'gens', text: T('{w} : environ {v} m (entre {a} et {b})', {w: what, v: nf(r.value, 2), a: nf(r.lo, 2), b: nf(r.hi, 2)}).slice(0, 590), certainty: 'supposed', why: T('Mesuré d’après {r} ; la perspective peut fausser la mesure', {r: sizes[st.size][2]}), data: {measure: {value: r.value, lo: r.lo, hi: r.hi, ref: st.size}}}); b.disabled = true;
                }); },
            onSubmit: () => true});
    }

    /* ═════════ 5, 6, 8, 9. guides (faits sûrs, sourcés) ═════════ */
    const GUIDES = {
        grain: {icon: '🔬', title: 'Grain et trame : original ou copie ?', kind: 'support', intro: 'Regarde de très près (zoom) : le grain dit si c’est un tirage d’origine, une copie ou une image imprimée.', items: [
            {n: 'Tirage d’origine', t: 'Grain fin et régulier, des détails dans les ombres et les lumières, pas de trame de points.', url: W('Tirage_photographique')},
            {n: 'Copie d’une copie (photo d’une photo)', t: 'Moins nette, contraste plus dur, détails perdus dans les ombres ; parfois les rayures du tirage copié.', url: W('Contretype')},
            {n: 'Similigravure (journal, livre, carte imprimée)', t: 'Une trame de points réguliers, visible de près : l’image a été imprimée, ce n’est pas une photo.', from: 1880, cert: 'probable', url: W('Similigravure')},
            {n: 'Phototypie (beaucoup de cartes postales anciennes)', t: 'Imprimée sans trame régulière : un grain fin et irrégulier.', url: W('Phototypie')}]},
        interieur: {icon: '🛋', title: 'L’intérieur : ce que dit la pièce', kind: 'objet', intro: 'Un objet de la maison donne parfois un « pas avant » ; le reste aide à relier deux photos prises dans la même pièce.', items: [
            {n: 'Ampoule électrique', t: 'Lampe électrique à incandescence.', from: 1879, cert: 'probable', url: W('Lampe_à_incandescence')},
            {n: 'Lampe à pétrole', t: 'Lampe à mèche avec un verre, au pétrole.', from: 1853, cert: 'probable', url: W('Lampe_à_pétrole')},
            {n: 'Téléphone', from: 1876, cert: 'probable', url: W('Téléphone')},
            {n: 'Machine à coudre', from: 1830, cert: 'probable', url: W('Machine_à_coudre')},
            {n: 'Horloge ou pendule', t: 'Note l’heure qu’elle montre : elle aide le calcul d’ombre, si elle marchait.', url: W('Horloge')},
            {n: 'Papier peint', t: 'Le même motif sur une autre photo de la famille : sans doute la même pièce.', url: W('Papier_peint')}]},
        toits: {icon: '🏘', title: 'Toits et murs : un indice de région', kind: 'lieu', intro: 'Les matériaux du pays se voient sur les toits et les murs. Ce n’est qu’un indice de région : « Supposé » tant qu’un autre indice ne le confirme pas.', items: [
            {n: 'Toit de lauzes (pierres plates)', t: 'Surtout dans les régions de montagne et de pierre (Massif central, Alpes, Pyrénées, Causses).', cert: 'supposed', url: W('Lauze')},
            {n: 'Toit d’ardoise', t: 'Très répandu dans l’ouest et le nord ; extraite notamment en Anjou, en Bretagne et dans les Ardennes.', cert: 'supposed', url: W('Ardoise')},
            {n: 'Tuiles canal (tuiles rondes)', t: 'Le toit du Midi, aux pentes faibles.', cert: 'supposed', url: W('Tuile_canal')},
            {n: 'Tuiles mécaniques (à emboîtement)', t: 'Tuiles moulées qui s’emboîtent, faites en usine.', from: 1841, cert: 'probable', url: W('Tuile_mécanique')},
            {n: 'Colombages (pans de bois)', t: 'Normandie, Alsace, Champagne, Pays basque…', cert: 'supposed', url: W('Pan_de_bois')},
            {n: 'Murs de pierre apparente', t: 'La pierre du pays (granit, calcaire, grès, schiste) dit souvent la région.', cert: 'supposed', url: W('Architecture_vernaculaire')}],
            after: async (dg, api) => { let r = {places: []}; try { r = await api.get('family_places'); } catch (_) {} const host = document.createElement('div');
                host.innerHTML = r.places.length ? `<h4>${esc(T('Les lieux de ta famille, pour comparer'))}</h4><p class="ep-moonlist">${r.places.slice(0, 20).map(p => esc(`${p.name} (${p.n})`)).join(' · ')}</p>` : ''; dg.querySelector('.ep-guide')?.after(host); }},
        cultures: {icon: '🌾', title: 'Cultures du paysage', kind: 'lieu', intro: 'Certaines cultures ne poussent qu’en quelques régions : un indice de région, « Supposé ».', items: [
            {n: 'Oliviers', t: 'Surtout autour de la Méditerranée.', cert: 'supposed', url: W('Olivier')},
            {n: 'Châtaigniers en vergers', t: 'Cévennes, Ardèche, Limousin, Corse…', cert: 'supposed', url: W('Châtaignier')},
            {n: 'Champs de lavande', t: 'Provence.', cert: 'supposed', url: W('Lavande')},
            {n: 'Vignes', t: 'Une région de vignes : compare avec les appellations des lieux de ta famille (🌾 Son terroir).', cert: 'supposed', url: W('Viticulture_en_France')}]},
    };
    function installGuides() { const G = X().GUIDES; if (G) Object.entries(GUIDES).forEach(([k, g]) => { if (!G[k]) G[k] = g; }); }

    /* ═════════ 8. 🐄 bêtes et cultures → une région ═════════ */
    async function animals(api) {
        installGuides();
        const dg = dlgOpen({eyebrow: T('🐄 BÊTES ET CULTURES'), title: T('Bêtes et cultures : un indice de région'), submitLabel: T('Fermer'), wide: true,
            body: `<p class="ui-hint">${esc(T('Une race locale (vache, cheval, mouton…) a une région d’origine : ses bêtes vivaient surtout là. Ce n’est qu’un indice, « Supposé ».'))}</p>
                <div class="ep-xrow"><label>${esc(T('Race reconnue'))}<input name="q" placeholder="Salers, Limousine, Percheron…" autocomplete="off"></label><button type="button" class="button small" data-xgo>🔍 ${esc(T('Chercher'))}</button></div>
                <div data-xres aria-live="polite"></div><div class="ep-row"><button type="button" class="button small secondary" data-xcult>🌾 ${esc(T('Cultures du paysage (guide)'))}</button></div>`, onSubmit: () => true});
        if (!dg) return;
        const res = dg.querySelector('[data-xres]');
        const run = async () => {
            let r; try { r = await api.get('races', {q: dg.querySelector('[name=q]').value.trim()}); } catch (e) { res.innerHTML = empty(e.message); return; }
            if (!r.installed) { res.innerHTML = empty(T('La liste des races n’est pas installée.')); return; }
            const L = r.races || [];
            res.innerHTML = L.length ? `<ul class="ep-guide">${L.map((x, i) => `<li><div><b>${esc(x.icon)} ${esc(x.name)}</b>${x.family ? ` <span class="ui-badge is-blue">${esc(T('pays de ta famille'))}</span>` : ''}<br><small>${esc([x.origin, x.dep_names].filter(Boolean).join(' · '))}</small><br>${x.wp ? ext_(x.wp, T('Source')) : ''}</div>${api.ro ? '' : `<button type="button" class="button small secondary" data-xr="${i}">＋ ${esc(T('Indice'))}</button>`}</li>`).join('')}</ul><p class="ui-hint">${esc(r.credit || '')} ${esc(r.licence || '')}</p>`
                : empty(T('Aucune race de ce nom (ou aucune race des pays de ta famille).'), '🐄');
            res.onclick = async e => { const b = e.target.closest('[data-xr]'); if (!b) return; const x = L[Number(b.dataset.xr)];
                await api.addClue({kind: 'lieu', text: T('Race {n} : originaire de {o}', {n: x.name, o: x.origin || x.dep_names || '?'}).slice(0, 590), certainty: 'supposed', source: 'donnees', why: T('Une race locale vit surtout dans sa région d’origine, pas seulement'), url: x.wp || x.url || ''}); b.disabled = true; };
        };
        dg.addEventListener('click', e => { if (e.target.closest('[data-xgo]')) run(); if (e.target.closest('[data-xcult]')) { dg.close(); X().guide?.('cultures', api); } });
        dg.querySelector('[name=q]').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
        run();
    }

    /* ═════════ 7. 🎭 décor de studio → 📮 photographe, 🧩 photos sœurs ═════════ */
    const DECOR = ['Toile peinte (paysage)', 'Toile peinte (intérieur)', 'Colonne', 'Balustrade', 'Rideau', 'Chaise', 'Fauteuil', 'Guéridon', 'Plante en pot', 'Tapis', 'Rocher en carton', 'Barrière rustique'];
    function decor(api) {
        const cur = new Set((api.clues.filter(c => Array.isArray(c.data?.backdrop)).slice(-1)[0]?.data?.backdrop) || []);
        dlgOpen({eyebrow: T('🎭 DÉCOR DE STUDIO'), title: T('Le décor du studio'), submitLabel: api.ro ? T('Fermer') : T('＋ Garder le décor'), wide: true,
            body: `<p class="ui-hint">${esc(T('Coche ce que tu vois derrière les gens. Le même décor sur deux photos : sans doute le même studio, à la même époque. Ajoute les décors connus d’un photographe dans 📮 Photographes.'))}</p>
                <div class="ep-chipset" data-xdec>${DECOR.map(d => `<button type="button" class="ep-tag${cur.has(T(d)) ? ' is-on' : ''}" aria-pressed="${cur.has(T(d))}" data-xd="${esc(T(d))}" ${api.ro ? 'disabled' : ''}>${esc(T(d))}</button>`).join('')}</div>
                <label>${esc(T('Autre chose (séparé par des virgules)'))}<input name="other" ${api.ro ? 'readonly' : ''}></label><div data-xsis></div>`,
            onOpen: dg => { dg.addEventListener('click', e => { const b = e.target.closest('[data-xd]'); if (!b) return; const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('is-on', on); }); sisterBox(api, dg.querySelector('[data-xsis]'), 'decor'); },
            onSubmit: async f => { if (api.ro) return true;
                const list = [...f.querySelectorAll('[data-xd][aria-pressed="true"]')].map(b => b.dataset.xd).concat(String(f.other.value || '').split(',').map(s => s.trim()).filter(Boolean));
                if (!list.length) { toast(T('Coche au moins un élément du décor.'), 'error'); return false; }
                await api.addClue({kind: 'support', text: T('Décor du studio : {l}', {l: list.join(', ')}).slice(0, 590), certainty: 'probable', why: T('Vu sur l’image'), data: {backdrop: list}});
                setTimeout(() => decorResult(api), 300); }});
    }
    async function sisterBox(api, host, how) {
        if (!host) return; let r; try { r = await api.get('sisters'); } catch (_) { return; }
        const media = (r.media || []).filter(m => m.how === how), studios = how === 'decor' ? r.studios || [] : [];
        host.innerHTML = `${studios.length ? `<h4>📮 ${esc(T('Photographes au décor qui ressemble'))}</h4><ul class="ep-guide">${studios.map((p, i) => `<li><div><b>${esc(p.name)}</b> <small>${esc([p.city, [p.year_from, p.year_to].filter(Boolean).join(' – ')].filter(Boolean).join(' · '))}</small><br><small class="muted">${esc(T('en commun : {l}', {l: p.common.join(', ')}))}</small></div>${api.ro ? '' : `<button type="button" class="button small secondary" data-xst="${i}">＋ ${esc(T('Indice'))}</button>`}</li>`).join('')}</ul>` : ''}
            ${media.length ? `<h4>🧩 ${esc(T('Photos sœurs'))}</h4><div class="ep-wall">${media.map(m => `<div class="ep-wtile"><img src="media/${encodeURIComponent(m.filename)}" alt="" loading="lazy"><small>${esc(m.title)}</small><small class="muted">${esc(how === 'item' ? T('même objet : {n}', {n: m.why}) : T('même décor : {n}', {n: m.why}))}</small>${api.ro ? '' : `<button type="button" class="button small secondary" data-xin="${m.id}">＋ ${esc(T('Dans l’enquête'))}</button>`}</div>`).join('')}</div>` : ''}`;
        host.onclick = async e => { const s = e.target.closest('[data-xst]'); if (s) { const p = studios[Number(s.dataset.xst)]; await api.addClue({kind: 'support', text: T('Décor connu du photographe {n}', {n: p.name}), certainty: 'supposed', date_from: p.year_from || null, date_to: p.year_to || null, why: T('en commun : {l}', {l: p.common.join(', ')}), data: {photographer: p.name}}); s.disabled = true; }
            const b = e.target.closest('[data-xin]'); if (b) { b.disabled = true; EP().current?.addImages([Number(b.dataset.xin)]); } };
    }
    function decorResult(api) {
        dlgOpen({eyebrow: T('🎭 DÉCOR DE STUDIO'), title: T('Le même décor ailleurs ?'), submitLabel: T('Fermer'), wide: true, body: '<div data-xsis></div>',
            onOpen: dg => sisterBox(api, dg.querySelector('[data-xsis]'), 'decor').then(() => { const h = dg.querySelector('[data-xsis]'); if (!h.innerHTML.trim()) h.innerHTML = empty(T('Rien de semblable pour l’instant dans tes autres enquêtes ni chez tes photographes.'), '🎭'); }), onSubmit: () => true});
    }

    /* ═════════ 10. 👪 qui pourrait-ce être ? ═════════ */
    function reasonText(r) {
        return {age: () => T('avait {a} à {b} ans à cette date', {a: r.a, b: r.b}), place: () => T('a vécu à {k} km du lieu supposé', {k: r.km}), close: () => T('proche des gens de la photo'),
            unborn: () => T('pas encore né(e) (né(e) en {y})', {y: r.y}), dead: () => T('mort(e) en {y}, avant la photo', {y: r.y}), nobirth: () => T('date de naissance inconnue'),
            gender: () => T('pas le bon sexe'), far: () => T('ses lieux sont à {k} km', {k: r.km}), noplace: () => T('aucun lieu connu de sa vie')}[r.k]?.() || '';
    }
    function lastAge(api) { const c = api.clues.filter(x => Number.isFinite(Number(x.data?.age)) && x.certainty !== 'refuted').slice(-1)[0]; return c ? Number(c.data.age) : ''; }
    async function whoCould(api) {
        const w = yearWin(api), pl = placeOf(api);
        const st = {age: lastAge(api), spread: 3, from: w.from || '', to: w.to || '', gender: '', showNo: false};
        const dg = dlgOpen({eyebrow: T('👪 QUI POURRAIT-CE ÊTRE ?'), title: T('Qui pourrait-ce être ?'), submitLabel: T('Fermer'), wide: true,
            body: `<p class="ui-hint">${esc(T('D’après l’âge apparent que tu notes, la date et le lieu probables : les personnes de l’arbre qui collent, avec pourquoi oui et pourquoi non. Jamais d’analyse des visages.'))}</p>
                <div class="ep-xrow"><label>${esc(T('Âge apparent'))}<input name="age" inputmode="numeric" value="${esc(st.age)}" placeholder="6"></label><label>${esc(T('Marge (± ans)'))}<input name="spread" inputmode="numeric" value="${st.spread}"></label><label>${esc(T('De'))}<input name="from" inputmode="numeric" value="${esc(st.from)}" placeholder="1905"></label><label>${esc(T('À'))}<input name="to" inputmode="numeric" value="${esc(st.to)}" placeholder="1915"></label>
                    <label>${esc(T('Sexe'))}<select name="gender"><option value="">${esc(T('peu importe'))}</option><option value="male">${esc(T('un homme, un garçon'))}</option><option value="female">${esc(T('une femme, une fille'))}</option></select></label><button type="button" class="button small" data-xgo>🔍 ${esc(T('Chercher'))}</button></div>
                ${pl?.name ? `<p class="ui-hint">${esc(T('Lieu supposé : {p}', {p: pl.name}))}</p>` : ''}<div data-xres aria-live="polite"></div>`, onSubmit: () => true});
        if (!dg) return;
        const res = dg.querySelector('[data-xres]');
        const run = async () => {
            const v = n => dg.querySelector(`[name="${n}"]`).value.trim(); Object.assign(st, {age: v('age'), spread: Number(v('spread')) || 3, from: v('from'), to: v('to'), gender: v('gender')});
            if (!st.from && !st.to) { res.innerHTML = empty(T('Il faut d’abord une fourchette de dates (la frise de la photo).'), '📏'); return; }
            res.innerHTML = UI().spinner ? UI().spinner(T('Recherche…')) : '';
            let r; try { r = await api.get('candidates', {age: st.age || 0, spread: st.spread, from: st.from || st.to, to: st.to || st.from, place_id: pl?.id || '', lat: pl?.lat ?? '', lon: pl?.lon ?? ''}); } catch (e) { res.innerHTML = empty(e.message); return; }
            const marks = settings(api).who || {};
            const rows = r.people.map(p => ({p, f: C().whoFits(p, {age: st.age, spread: st.spread, from: r.from, to: r.to, gender: st.gender, hasPlace: r.has_place})})).sort((a, b) => (b.f.fit - a.f.fit) || (b.f.score - a.f.score));
            const shown = rows.filter(x => (st.showNo || marks[x.p.id] !== 'no') && (x.f.fit || x.f.yes.length)).slice(0, 40), nNo = rows.filter(x => marks[x.p.id] === 'no').length;
            res.innerHTML = shown.length ? `<ul class="ep-who">${shown.map(({p, f}) => `<li class="${f.fit ? 'is-fit' : ''}${marks[p.id] === 'no' ? ' is-no' : ''}${marks[p.id] === 'yes' ? ' is-yes' : ''}" data-xp="${p.id}"><div><b>${p.id ? `<button type="button" class="link-button" data-xopen="${p.id}">${esc(p.name)}</button>` : esc(p.name)}</b> <small class="muted">(${esc(p.birth || '?')}-${esc(p.death || '')})</small>
                ${f.yes.length ? `<br><small class="ep-yes">✓ ${f.yes.map(x => esc(reasonText(x))).join(' · ')}</small>` : ''}${f.no.length ? `<br><small class="ep-no">✗ ${f.no.map(x => esc(reasonText(x))).join(' · ')}</small>` : ''}</div>
                ${api.ro ? '' : `<div class="ep-row"><button type="button" class="button small secondary" data-xyes="${p.id}" ${marks[p.id] === 'yes' ? 'disabled' : ''}>✓ ${esc(T('Peut-être'))}</button><button type="button" class="button small secondary" data-xno="${p.id}">${marks[p.id] === 'no' ? esc(T('Remettre')) : `✗ ${esc(T('Écarter'))}`}</button></div>`}</li>`).join('')}</ul>
                ${nNo ? `<button type="button" class="link-button" data-xshowno>${esc(st.showNo ? T('Cacher les personnes écartées') : T('Montrer les personnes écartées ({n})', {n: nNo}))}</button>` : ''}`
                : empty(T('Personne de l’arbre ne colle avec cet âge à cette date.'), '👪');
            res.onclick = async e => {
                const o = e.target.closest('[data-xopen]'); if (o) { dg.close(); A().openPersonById?.(Number(o.dataset.xopen)); return; }
                if (e.target.closest('[data-xshowno]')) { st.showNo = !st.showNo; return run(); }
                const y = e.target.closest('[data-xyes]'); if (y) { const x = rows.find(q => q.p.id === Number(y.dataset.xyes)); if (!x) return;
                    await api.addClue({kind: 'gens', text: T('Peut-être {n}', {n: x.p.name}), certainty: 'supposed', source: 'famille', why: x.f.yes.map(reasonText).join(' · ').slice(0, 3000), data: {person_id: x.p.id, who: 1, age: Number(st.age) || null}});
                    await saveSettings(api, {who: {...(settings(api).who || {}), [x.p.id]: 'yes'}}); return run(); }
                const n = e.target.closest('[data-xno]'); if (n) { const id = Number(n.dataset.xno), before = {...(settings(api).who || {})}, was = before[id];
                    await saveSettings(api, {who: {...before, [id]: was === 'no' ? '' : 'no'}}); run();
                    if (was !== 'no') undoToast(T('Personne écartée'), {undo: async () => { await saveSettings(api, {who: before}); run(); }}); }
            };
        };
        dg.addEventListener('click', e => { if (e.target.closest('[data-xgo]')) run(); });
        dg.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); run(); } });
        if (st.from || st.to) run(); else res.innerHTML = empty(T('Il faut d’abord une fourchette de dates (la frise de la photo).'), '📏');
    }

    /* ═════════ 👤 Qui est-ce ? — l'outil local Visages, sur les images de l'enquête ═════════ */
    const faceCrop = (f, filename, size = 64) => { const w = Math.max(f.w * 1.25, 1), h = Math.max(f.h * 1.25, 1), x = Math.max(0, f.x - f.w * .125), y = Math.max(0, f.y - f.h * .125);
        return `<span class="ep-facecrop" style="width:${size}px;height:${Math.round(size * 1.15)}px;background-image:url('media/${encodeURIComponent(filename)}');background-size:${(100 / w * 100).toFixed(1)}% ${(100 / h * 100).toFixed(1)}%;background-position:${(w >= 100 ? 0 : x / (100 - w) * 100).toFixed(1)}% ${(h >= 100 ? 0 : y / (100 - h) * 100).toFixed(1)}%"></span>`; };
    async function faces(api) {
        const FI = ext.faceInternals;
        const dg = dlgOpen({eyebrow: T('👤 QUI EST-CE ?'), title: T('👤 Qui est-ce ? (visages, sur l’ordinateur)'), submitLabel: T('Fermer'), wide: true,
            body: `<p class="ui-hint">${esc(T('L’outil 👤 Visages compare, sur cet ordinateur, les visages de ces images à ceux que tu as identifiés toi-même dans tes photos. Rien ne part sur Internet. Une proposition reste « Supposé » ; « Probable » seulement si un autre indice (date, lieu, âge) colle avec la personne ; jamais « Prouvé ».'))}</p><div data-xf aria-live="polite">${UI().spinner ? UI().spinner(T('Lecture des visages…')) : ''}</div>`, onSubmit: () => true});
        if (!dg) return;
        const host = dg.querySelector('[data-xf]');
        if (!FI?.analyse || !FI?.createEngine) { host.innerHTML = empty(T('L’outil 👤 Visages n’est pas chargé.'), '👤'); return; }
        const mine = imgs(api), mids = new Set(mine.map(im => im.media_id));
        let engine = null; dg.addEventListener('close', () => { try { engine?.dispose(); } catch (_) {} });
        const draw = async () => {
            let idx; try { idx = await A().api('faces_index'); } catch (e) { host.innerHTML = empty(e.message, '👤'); return; }
            const byId = new Map((idx.media || []).map(m => [m.id, m])), todo = mine.filter(im => !byId.get(im.media_id)?.scanned).map(im => byId.get(im.media_id) || {id: im.media_id, filename: im.media.filename});
            const models = (idx.media || []).filter(m => m.tagged && !m.scanned && !mids.has(m.id)).slice(0, 40);
            const R = FI.analyse(idx), props = R.props.filter(p => mids.has(p.face.media_id)), known = R.known.length;
            const ids = [...new Set(props.map(p => p.person.id))];
            let people = {}; if (ids.length) { try { people = (await api.get('face_people', {ids: ids.join(',')})).people || {}; } catch (_) {} }
            const w = yearWin(api), age = lastAge(api), others = api.clues.filter(c => !['visage', 'ia'].includes(c.source) && c.certainty !== 'refuted');
            const list = props.map(p => ({...p, info: people[p.person.id] || null})).filter(p => p.info && !(p.info.id === 0 && p.info.private));
            const scanBtn = !api.ro && (todo.length || models.length) ? `<div class="ep-row"><button type="button" class="button small" data-xscan>🔍 ${esc(T('Analyser {n} image(s) sur l’ordinateur', {n: todo.length + models.length}))}</button><small class="muted">${esc(models.length ? T('dont {m} de tes photos où des visages sont déjà identifiés (les modèles)', {m: models.length}) : '')}</small></div>` : '';
            host.innerHTML = `${scanBtn}<div data-xrun></div>
                ${list.length ? `<ul class="ep-faces">${list.map((p, i) => { const im = mine.find(x => x.media_id === p.face.media_id), f = C().whoFits(p.info, {age, from: w.from, to: w.to});
                    return `<li><span>${faceCrop(p.face, im.media.filename)}</span><div><b>${esc(p.sure ? T('C’est sans doute {n}', {n: p.info.name}) : T('C’est peut-être {n}', {n: p.info.name}))}</b> <small class="muted">${esc(api.letterOf(im))} · ${esc(T('ressemblance {d}', {d: nf(Math.max(0, 1 - p.d), 2)}))}</small>
                        ${f.yes.length ? `<br><small class="ep-yes">✓ ${f.yes.map(x => esc(reasonText(x))).join(' · ')}</small>` : ''}${f.no.length ? `<br><small class="ep-no">✗ ${f.no.map(x => esc(reasonText(x))).join(' · ')}</small>` : ''}
                        ${api.ro ? '' : `<label class="ep-xconf">${esc(T('Confirmé par un autre indice (pas un visage)'))}<select data-xconf="${i}"><option value="">${esc(T('— pas encore'))}</option>${others.map(c => `<option value="${c.id}">${c.num} · ${esc(c.text.slice(0, 60))}</option>`).join('')}</select></label>
                        <div class="ep-row"><button type="button" class="button small secondary" data-xkeep="${i}">＋ ${esc(T('Indice'))}</button></div>`}</div></li>`; }).join('')}</ul>`
                    : known ? empty(T('Aucun visage de ces images ne ressemble à un visage que tu as identifié.'), '👤') : `${empty(T('Aucun visage identifié à la main sur des photos analysées : identifie d’abord quelques visages dans 👤 Visages.'), '👤')}${ext.openFaces && !api.ro ? `<button type="button" class="button small secondary" data-xopenfaces>👤 ${esc(T('Ouvrir 👤 Visages'))}</button>` : ''}`}`;
            host.onclick = async e => {
                if (e.target.closest('[data-xopenfaces]')) { dg.close(); ext.openFaces(); return; }
                if (e.target.closest('[data-xscan]')) return scan([...todo, ...models]);
                const k = e.target.closest('[data-xkeep]'); if (!k) return; const p = list[Number(k.dataset.xkeep)], im = mine.find(x => x.media_id === p.face.media_id);
                const by = Number(host.querySelector(`[data-xconf="${k.dataset.xkeep}"]`)?.value) || 0;
                const clue = await api.addClue({kind: 'gens', source: 'visage', text: T('👤 Visage : sans doute {n}', {n: p.info.name}).slice(0, 590), certainty: by ? 'probable' : 'supposed',
                    why: [T('Proposé par 👤 Visages (sur l’ordinateur), d’après les visages identifiés à la main'), by ? T('confirmé par l’indice {n}', {n: api.clues.find(c => c.id === by)?.num || ''}) : ''].filter(Boolean).join(' · '),
                    images: {[im.id]: 'yes'}, data: {face: {media_id: p.face.media_id, x: p.face.x, y: p.face.y, w: p.face.w, h: p.face.h}, person_id: p.info.id || p.person.id, d: Math.round(p.d * 1000) / 1000, confirmed_by: by || 0}});
                if (clue) { const shape = {id: uid(), t: 'rect', x: p.face.x / 100, y: p.face.y / 100, w: p.face.w / 100, h: p.face.h / 100, clue: clue.id, n: clue.num, color: '#8250df'};
                    api.change(im, () => api.layersOf(im).push({id: `c${clue.id}`, name: `${clue.num} · 👤 ${clue.text.slice(0, 36)}`, visible: true, locked: false, shapes: [shape]})); k.disabled = true; }
            };
        };
        const scan = async list => {
            const run = host.querySelector('[data-xrun]'), say = t => { run.innerHTML = `<p class="ui-hint"><span class="ui-spin" aria-hidden="true"></span> ${esc(t)}</p>`; };
            host.querySelector('[data-xscan]')?.setAttribute('disabled', '');
            try { engine = FI.createEngine({onStep: say}); say(T('Préparation du calcul…')); await engine.ensure();
                let i = 0; for (const m of list) { i++; say(T('Image {i} sur {n}…', {i, n: list.length})); const r = await engine.scan(m); if (r.stopped) break;
                    await A().api('save_face_scan', {}, {method: 'POST', body: r.skipped ? {media_id: m.id, skipped: r.skipped} : {media_id: m.id, faces: r.faces || [], model: engine.kind}}); }
                engine.dispose(); engine = null; api.post('journal', {id: api.inq.id, what: T('👤 Visages analysés sur l’ordinateur'), result: T('{n} image(s)', {n: list.length})}).catch(() => {});
            } catch (e) { run.innerHTML = empty(e.message || T('Pas disponible.'), '👤'); return; }
            draw();
        };
        draw();
    }

    /* ═════════ 11. 💍 habit ou bijou qui revient ═════════ */
    function item(api) {
        if (api.ro) return;
        const list = imgs(api);
        dlgOpen({eyebrow: T('💍 HABIT OU BIJOU'), title: T('Un habit ou un bijou qui revient'), submitLabel: T('＋ Garder'), wide: true,
            body: `<p class="ui-hint">${esc(T('La même broche, la même montre, le même chapeau sur deux photos : sans doute la même personne, ou le même foyer. Coche les images où tu le vois.'))}</p>
                <label>${esc(T('L’objet'))}<input name="item" required placeholder="${esc(T('broche ovale'))}"></label>
                ${list.length > 1 ? `<fieldset class="ep-fs"><legend>${esc(T('Sur quelles images ?'))}</legend>${list.map(im => `<label class="ep-ck"><input type="checkbox" name="i_${im.id}" ${im === api.img ? 'checked' : ''}> ${esc(api.letterOf(im))} · ${esc(im.label || im.media?.title || '')}</label>`).join('')}</fieldset>` : ''}
                <div><span class="pk-lab">${esc(T('Sûr ?'))}</span>${certSeg('probable', CERTS.slice(1))}</div><div data-xsis></div>`,
            onOpen: dg => { bindCert(dg); sisterBox(api, dg.querySelector('[data-xsis]'), 'item'); },
            onSubmit: async f => { const it = f.item.value.trim(); if (!it) return false; const images = {}; list.forEach(im => { if (list.length < 2 ? im === api.img : f.elements[`i_${im.id}`]?.checked) images[im.id] = 'yes'; });
                await api.addClue({kind: 'gens', text: T('Même habit ou bijou : {i}', {i: it}), certainty: f.xc.value || 'probable', why: Object.keys(images).length > 1 ? T('Vu sur les images {l}', {l: list.filter(im => images[im.id]).map(im => api.letterOf(im)).join(', ')}) : T('Vu sur l’image'), images, data: {item: it}}); }});
    }

    /* ═════════ 12. 🗃 provenance · 13. ✍ plusieurs mains au dos ═════════ */
    function provenance(api) {
        const p = settings(api).provenance || {};
        dlgOpen({eyebrow: T('🗃 PROVENANCE'), title: T('D’où vient la photo elle-même ?'), submitLabel: api.ro ? T('Fermer') : T('Enregistrer'), body: `<p class="ui-hint">${esc(T('Qui l’avait, dans quel album, qui te l’a donnée et quand : souvent le meilleur indice de la famille de la photo.'))}</p>
            <div class="form-grid one-column"><label>${esc(T('Qui l’avait'))}<input name="owner" value="${esc(p.owner || '')}" ${api.ro ? 'readonly' : ''}></label><label>${esc(T('Dans quel album, quelle boîte'))}<input name="album" value="${esc(p.album || '')}" ${api.ro ? 'readonly' : ''}></label>
            <div class="ep-2"><label>${esc(T('Donnée par'))}<input name="given_by" value="${esc(p.given_by || '')}" ${api.ro ? 'readonly' : ''}></label><label>${esc(T('Quand'))}<input name="given_when" value="${esc(p.given_when || '')}" ${api.ro ? 'readonly' : ''} placeholder="2019"></label></div>
            <label>${esc(T('Note'))}<textarea name="note" rows="2" ${api.ro ? 'readonly' : ''}>${esc(p.note || '')}</textarea></label></div>`,
            onSubmit: async f => { if (api.ro) return true; const v = {owner: f.owner.value.trim(), album: f.album.value.trim(), given_by: f.given_by.value.trim(), given_when: f.given_when.value.trim(), note: f.note.value.trim()};
                await saveSettings(api, {provenance: v}); api.post('journal', {id: api.inq.id, what: T('🗃 Provenance notée'), result: [v.owner, v.album, v.given_by].filter(Boolean).join(' · ')}).catch(() => {}); toast(T('Provenance enregistrée')); }});
    }
    const INKS = [['crayon', 'au crayon'], ['encre', 'à l’encre'], ['stylo', 'au stylo-bille'], ['tampon', 'au tampon']];
    function hands(api) {
        const L = () => settings(api).inscriptions || [];
        const row = (x, i) => `<li><div><b>« ${esc(x.text)} »</b><br><small>${esc([x.writer ? T('écrit par {w}', {w: x.writer}) : T('main inconnue'), x.when, T(INKS.find(k => k[0] === x.ink)?.[1] || ''), api.letterOf(api.images.find(im => im.id === x.image) || api.img)].filter(Boolean).join(' · '))}</small> ${api.certBadge(x.certainty || 'supposed')}</div>
            <div class="ep-row"><button type="button" class="button small secondary" data-xcmp="${i}">✍️ ${esc(T('Comparer à une écriture connue'))}</button>${api.ro ? '' : `<button type="button" class="button small secondary" data-xatl="${i}">📜 ${esc(T('Atelier'))}</button><button type="button" class="button small secondary" data-xclue="${i}">＋ ${esc(T('Indice'))}</button><button type="button" class="icon-button small" data-xdel="${i}" aria-label="${esc(T('Supprimer'))}" title="${esc(T('Supprimer'))}">🗑</button>`}</div></li>`;
        const list = imgs(api), verso = list.find(im => im.side === 'verso') || api.img;
        const dg = dlgOpen({eyebrow: T('✍ PLUSIEURS MAINS'), title: T('Plusieurs mains au dos'), submitLabel: T('Fermer'), wide: true,
            body: `<p class="ui-hint">${esc(T('Une légende au crayon, une date à l’encre, un tampon : note qui a écrit quoi, et quand. Une écriture se compare avec une lettre ou une signature connue.'))}</p><ul class="ep-guide" data-xl>${L().map(row).join('') || ''}</ul><div data-xempty>${L().length ? '' : empty(T('Aucune inscription notée.'), '✍')}</div>
                ${api.ro ? '' : `<fieldset class="ep-fs"><legend>${esc(T('Une inscription'))}</legend><div class="form-grid one-column"><label>${esc(T('Ce qui est écrit'))}<input name="text" placeholder="${esc(T('Maman et Paul, été 1925'))}"></label>
                <div class="ep-2"><label>${esc(T('Écrit par (si on le sait)'))}<input name="writer"></label><label>${esc(T('Quand'))}<input name="when" placeholder="${esc(T('après 1950 ?'))}"></label></div>
                <div class="ep-2"><label>${esc(T('Écrit'))}<select name="ink">${INKS.map(([k, l]) => `<option value="${k}">${esc(T(l))}</option>`).join('')}</select></label>${list.length > 1 ? `<label>${esc(T('Image'))} ${imageChoice(api, 'image', verso?.id, list)}</label>` : ''}</div>
                <div><span class="pk-lab">${esc(T('Sûr de la lecture ?'))}</span>${certSeg('probable')}</div><button type="button" class="button small" data-xadd>＋ ${esc(T('Ajouter l’inscription'))}</button></div></fieldset>`}`, onSubmit: () => true});
        if (!dg) return;
        bindCert(dg);
        const paint = () => { dg.querySelector('[data-xl]').innerHTML = L().map(row).join(''); dg.querySelector('[data-xempty]').innerHTML = L().length ? '' : empty(T('Aucune inscription notée.'), '✍'); };
        dg.addEventListener('click', async e => {
            const t = e.target;
            if (t.closest('[data-xadd]')) { const v = n => dg.querySelector(`[name="${n}"]`)?.value.trim() || ''; if (!v('text')) return toast(T('Écris ce qui est écrit.'), 'error');
                const x = {id: uid(), text: v('text').slice(0, 300), writer: v('writer').slice(0, 120), when: v('when').slice(0, 60), ink: v('ink'), certainty: v('xc') || 'probable', image: Number(v('image')) || verso?.id || 0};
                await saveSettings(api, {inscriptions: [...L(), x]}); ['text', 'writer', 'when'].forEach(n => { dg.querySelector(`[name="${n}"]`).value = ''; }); paint(); return; }
            const d = t.closest('[data-xdel]'); if (d) { const before = L(), x = before[Number(d.dataset.xdel)]; await saveSettings(api, {inscriptions: before.filter((_, i) => i !== Number(d.dataset.xdel))}); paint();
                undoToast(T('Inscription supprimée'), {undo: async () => { await saveSettings(api, {inscriptions: before}); paint(); }}); void x; return; }
            const c = t.closest('[data-xclue]'); if (c) { const x = L()[Number(c.dataset.xclue)];
                await api.addClue({kind: 'dos', text: T('« {t} » — {w}', {t: x.text, w: x.writer ? T('écrit par {w}', {w: x.writer}) : T('main inconnue')}).slice(0, 590), certainty: x.certainty || 'probable', why: [T(INKS.find(k => k[0] === x.ink)?.[1] || ''), x.when].filter(Boolean).join(' · '), images: {[x.image || api.img?.id]: 'yes'}, date_from: C().yearOf(x.when), data: {inscription: x.id}}); c.disabled = true; return; }
            const a = t.closest('[data-xatl]'); if (a) { const x = L()[Number(a.dataset.xatl)]; dg.close(); atelier(api, {text: x.text, image: x.image}); return; }
            const m = t.closest('[data-xcmp]'); if (m) { const x = L()[Number(m.dataset.xcmp)]; compareHand(api, api.images.find(im => im.id === x.image) || verso); }
        });
    }
    /** ✍️ l'écriture du dos, côte à côte avec les signatures marquées dans l'atelier (« Comparer deux signatures »), ou le comparateur de photos */
    async function compareHand(api, im) {
        let r = {signs: []}; try { r = await A().api('txaid_signs', {act_id: 0}); } catch (_) {}
        const thumb = s => `api.php?action=atelier_idees&op=thumb&act=${encodeURIComponent(s.act_id)}&zone=${encodeURIComponent(s.zone_id)}`, signs = r.signs || [];
        dlgOpen({eyebrow: T('✍️ ÉCRITURE'), title: T('Comparer à une écriture connue'), submitLabel: T('Fermer'), wide: true,
            body: `<div class="ep-hand"><figure><img src="${esc(api.mediaSrc(im?.media))}" alt=""><figcaption>${esc(api.letterOf(im))} · ${esc(T('le dos'))}</figcaption></figure><figure data-xother><figcaption>${esc(T('Choisis une signature ci-dessous'))}</figcaption></figure></div>
                ${signs.length ? `<ul class="ep-signs">${signs.map((s, i) => `<li><button type="button" class="ep-signpick" data-xs="${i}"><img src="${thumb(s)}" alt="" loading="lazy"><span>${esc([s.text, s.title, s.date].filter(Boolean).join(' · ') || T('Acte {n}', {n: s.act_id}))}</span></button></li>`).join('')}</ul>`
                    : `<p class="ui-hint">${esc(T('Aucune signature marquée dans tes actes : dans l’📜 Atelier de transcription, une zone « signature » sert ensuite ici.'))}</p>`}
                ${ext.photoCompareWith ? `<button type="button" class="button small secondary" data-xpc>🔍 ${esc(T('Comparer avec une autre image (lettre, carte)…'))}</button>` : ''}`,
            onOpen: dg => dg.addEventListener('click', e => { const b = e.target.closest('[data-xs]'); if (b) { const s = signs[Number(b.dataset.xs)]; dg.querySelector('[data-xother]').innerHTML = `<img src="${thumb(s)}" alt=""><figcaption>${esc([s.title, s.date, s.place].filter(Boolean).join(' · '))}</figcaption>`; }
                if (e.target.closest('[data-xpc]')) { dg.close(); ext.photoCompareWith({id: im.media_id, filename: im.media?.filename, title: im.media?.title}); } }), onSubmit: () => true});
    }

    /* ═════════ 24. 📜 l'atelier de transcription : le texte part, la transcription revient en indice ═════════ */
    async function readBack(api, im) {
        try { const o = await A().api('act_page_owner', {media_id: im.media_id}); if (!o?.id) return null; const t = await A().api('act_transcription', {id: o.id}); return String(t?.body || '').trim() ? {id: o.id, body: String(t.body).trim()} : null; } catch (_) { return null; }
    }
    function offerTranscription(api, im, tr) {
        dlgOpen({eyebrow: T('📜 ATELIER'), title: T('La transcription de l’atelier'), submitLabel: T('＋ Garder comme indice'), body: `<label>${esc(T('Le texte transcrit'))}<textarea name="t" rows="4">${esc(tr.body.slice(0, 590))}</textarea></label><div><span class="pk-lab">${esc(T('Sûr ?'))}</span>${certSeg('probable')}</div>`,
            onOpen: bindCert, onSubmit: async f => { await api.addClue({kind: clueKindOfImage(im), text: `« ${f.t.value.trim().slice(0, 580)} »`, certainty: f.xc.value || 'probable', source: 'atelier', why: T('Transcrit dans l’📜 Atelier de transcription'), images: {[im.id]: 'yes'}, data: {act_id: tr.id}}); }});
    }
    async function atelier(api, {text = '', image = 0} = {}) {
        if (!ext.openActTranscriber) return toast(T('L’Atelier de transcription n’est pas encore chargé.'), 'error');
        const im = api.images.find(x => x.id === Number(image)) || imgs(api).find(x => x.side === 'verso') || api.img; if (!im) return;
        const last = text || api.clues.filter(c => ['texte', 'dos'].includes(c.kind) && c.certainty !== 'refuted').slice(-1)[0]?.text?.replace(/^«\s*|\s*»$/g, '') || '';
        const before = await readBack(api, im);
        dlgOpen({eyebrow: T('📜 ATELIER'), title: T('Lire avec l’atelier de transcription'), submitLabel: T('Fermer'), body: `<p class="ui-hint">${esc(T('Le texte part dans l’atelier (avec l’image) : tu le relis là-bas, mot à mot. En revenant, la transcription devient un indice.'))}</p>
            <label>${esc(T('Ce que tu lis déjà'))}<textarea name="t" rows="3">${esc(last)}</textarea></label><div class="ep-row">${api.ro ? '' : `<button type="button" class="button small" data-xgo>📜 ${esc(T('Ouvrir dans l’atelier'))}</button>`}${before ? `<button type="button" class="button small secondary" data-xback>⟲ ${esc(T('Reprendre la transcription'))}</button>` : ''}</div>`,
            onOpen: dg => dg.addEventListener('click', async e => {
                if (e.target.closest('[data-xback]')) { dg.close(); offerTranscription(api, im, before); return; }
                if (!e.target.closest('[data-xgo]')) return; const t = dg.querySelector('[name=t]').value; dg.close();
                await ext.openActTranscriber({mediaId: im.media_id, filename: im.media?.filename, title: im.media?.title || '', text: t, kind: im.side === 'verso' ? 'lettre' : undefined});
                const tx = [...document.querySelectorAll('dialog.h-tx-dlg')].pop();
                tx?.addEventListener('close', async () => { const tr = await readBack(api, im); if (tr && (!before || tr.body !== before.body)) offerTranscription(api, im, tr); }, {once: true});
            }), onSubmit: () => true});
    }

    /* ═════════ 14. 🧭 la boussole sur la carte · 17. 🏗 dates de construction ═════════ */
    const DIRS = Array.from({length: 16}, (_, i) => i * 22.5);
    async function compassTool(api) {
        const pl = placeOf(api), s0 = settings(api).compass || {}, sh = api.clues.find(c => Array.isArray(c.data?.shadow?.facing));
        const st = {lat: s0.lat ?? pl?.lat ?? '', lon: s0.lon ?? pl?.lon ?? '', az: s0.az ?? (sh ? Math.round(sh.data.shadow.facing[0]) : 0), fov: s0.fov ?? 50, km: s0.km ?? 1};
        let blds = [], loadedFor = '';
        const dg = dlgOpen({eyebrow: T('🧭 BOUSSOLE'), title: T('D’où, et vers où, la photo a été prise'), submitLabel: api.ro ? T('Fermer') : T('Enregistrer'), wide: true,
            body: `<p class="ui-hint">${esc(T('Pose le point du photographe, la direction et l’angle de vue : les bâtiments connus dans le cône sont proposés (fiches d’édifices, monuments historiques et gares, s’ils sont installés).'))}</p>
                <div class="ep-xrow"><label>${esc(T('Latitude'))}<input name="lat" inputmode="decimal" value="${esc(st.lat)}" placeholder="45.16"></label><label>${esc(T('Longitude'))}<input name="lon" inputmode="decimal" value="${esc(st.lon)}" placeholder="1.53"></label>${pl?.lat != null ? `<button type="button" class="button small secondary" data-xhere>📍 ${esc(T('Le lieu supposé'))}</button>` : ''}</div>
                <div class="ep-xrow"><label>${esc(T('Direction'))}<select name="dir">${DIRS.map(d => `<option value="${d}" ${Math.round(d) === Math.round(st.az) ? 'selected' : ''}>${esc(T(C().compass(d)))} (${d}°)</option>`).join('')}</select></label><label>${esc(T('ou en degrés'))}<input name="az" inputmode="numeric" value="${esc(st.az)}"></label>
                    <label class="ep-sl">${esc(T('Angle de vue'))}<input type="range" min="10" max="120" step="5" name="fov" value="${st.fov}"><output>${st.fov}°</output></label><label>${esc(T('Jusqu’à (km)'))}<input name="km" inputmode="decimal" value="${esc(st.km)}"></label></div>
                ${sh ? `<p class="ui-hint">☀️ ${esc(T('Le calcul d’ombre dit : la photo regarde vers le {d} (le matin).', {d: T(C().compass(sh.data.shadow.facing[0]))}))}</p>` : ''}
                <div data-xmap></div><div data-xb aria-live="polite"></div>`,
            onSubmit: async () => { if (api.ro) return true; await saveSettings(api, {compass: {lat: Number(st.lat), lon: Number(st.lon), az: Number(st.az), fov: Number(st.fov), km: Number(st.km)}}); toast(T('Boussole enregistrée')); }});
        if (!dg) return;
        const paint = async () => {
            const c = {lat: Number(String(st.lat).replace(',', '.')), lon: Number(String(st.lon).replace(',', '.')), az: Number(st.az) || 0, fov: Number(st.fov) || 50, km: Math.max(0.1, Math.min(20, Number(String(st.km).replace(',', '.')) || 1))};
            const box = dg.querySelector('[data-xb]'), map = dg.querySelector('[data-xmap]');
            if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon) || st.lat === '' || st.lon === '') { map.innerHTML = ''; box.innerHTML = empty(T('Il faut un lieu placé sur la carte (conclusion, hypothèse ou indice).'), '🧭'); return; }
            const key = `${c.lat.toFixed(3)},${c.lon.toFixed(3)},${c.km}`;
            if (key !== loadedFor) { loadedFor = key; try { blds = (await api.get('buildings', {lat: c.lat, lon: c.lon, km: c.km})).buildings || []; } catch (_) { blds = []; } }
            const inside = blds.map(b => ({b, r: C().inCone(c, b)})).filter(x => x.r.inside).sort((a, b) => a.r.km - b.r.km);
            map.innerHTML = ext.miniMap ? ext.miniMap([{lat: c.lat, lon: c.lon, label: T('Le photographe'), color: '#d9480f'}, ...inside.slice(0, 40).map((x, i) => ({lat: x.b.lat, lon: x.b.lon, label: x.b.name, color: '#055dff', n: i + 1}))], [{coords: C().cone(c), color: '#d9480f', width: 2, dashed: true}], {height: 280}) : '';
            box.innerHTML = inside.length ? `<ol class="ep-blds">${inside.slice(0, 40).map((x, i) => { const d = C().buildingDates(x.b); return `<li><b>${esc(x.b.name)}</b> <small class="muted">${esc([x.b.kind, T('{k} km', {k: nf(x.r.km, 2)}), d.from ? T('pas avant {y}', {y: d.from}) : '', d.to ? T('pas après {y}', {y: d.to}) : ''].filter(Boolean).join(' · '))}</small>${x.b.url ? ` ${ext_(x.b.url, '')}` : ''}${api.ro ? '' : ` <button type="button" class="button small secondary" data-xbi="${i}">＋ ${esc(T('Indice'))}</button>`}</li>`; }).join('')}</ol>`
                : empty(blds.length ? T('Aucun bâtiment connu dans ce cône.') : T('Aucun bâtiment connu autour de ce point (fiches d’édifices, monuments historiques et gares installés).'), '🏛');
            box.onclick = async e => { const b = e.target.closest('[data-xbi]'); if (!b) return; const x = inside[Number(b.dataset.xbi)]; await keepBuilding(api, x.b, T('Dans le champ de la photo, à {k} km', {k: nf(x.r.km, 2)})); b.disabled = true; };
        };
        let t = 0; const later = () => { clearTimeout(t); t = setTimeout(paint, 250); };
        dg.addEventListener('input', e => { const n = e.target.name; if (!n) return; if (n === 'fov') { st.fov = Number(e.target.value); e.target.parentElement.querySelector('output').textContent = `${st.fov}°`; } else if (n === 'az') st.az = Number(e.target.value) || 0; else if (['lat', 'lon', 'km'].includes(n)) st[n] = e.target.value; later(); });
        dg.addEventListener('change', e => { if (e.target.name === 'dir') { st.az = Number(e.target.value); dg.querySelector('[name=az]').value = st.az; paint(); } });
        dg.addEventListener('click', e => { if (e.target.closest('[data-xhere]')) { st.lat = pl.lat; st.lon = pl.lon; dg.querySelector('[name=lat]').value = pl.lat; dg.querySelector('[name=lon]').value = pl.lon; paint(); } });
        paint();
    }
    /** un bâtiment reconnu → un indice de lieu, et sa date (« pas avant » sa construction, « pas après » sa démolition) */
    async function keepBuilding(api, b, why) {
        const d = C().buildingDates(b);
        return api.addClue({kind: 'lieu', text: T('Bâtiment reconnu : {n}', {n: b.name}).slice(0, 590), certainty: 'supposed', source: 'donnees', date_from: d.from, date_to: d.to, url: b.url || '',
            why: [why, d.from ? T('existe depuis {y} : pas avant', {y: d.from}) : '', d.to ? T('démoli en {y} : pas après', {y: d.to}) : '', T('d’après : {s}', {s: T({sites: 'les fiches d’édifices', merimee: 'les monuments historiques (Mérimée)', gares: 'les gares'}[b.src] || b.src)})].filter(Boolean).join(' · ').slice(0, 3000), data: {building: {name: b.name, src: b.src, built: d.from, gone: d.to}}});
    }
    async function construction(api) {
        const pl = placeOf(api), c0 = settings(api).compass;
        const lat = c0?.lat ?? pl?.lat, lon = c0?.lon ?? pl?.lon;
        if (lat == null || lon == null) return toast(T('Il faut un lieu placé sur la carte (conclusion, hypothèse ou indice).'), 'error');
        const dg = dlgOpen({eyebrow: T('🏗 CONSTRUCTION'), title: T('Construit quand, démoli quand ?'), submitLabel: T('Fermer'), wide: true, body: `<p class="ui-hint">${esc(T('Un bâtiment reconnu sur la photo existait déjà : « pas avant » sa construction ; s’il a été démoli, « pas après ». Les dates viennent des données installées.'))}</p><div data-xb>${UI().spinner ? UI().spinner(T('Recherche…')) : ''}</div>`, onSubmit: () => true});
        if (!dg) return;
        let r = {buildings: []}; try { r = await api.get('buildings', {lat, lon, km: 3}); } catch (_) {}
        const B = r.buildings || [], sug = C().matchBuildings(api.clues.filter(c => ['lieu', 'objet', 'texte'].includes(c.kind) && !c.data?.building), B).slice(0, 12), dated = B.filter(b => { const d = C().buildingDates(b); return d.from || d.to; }).slice(0, 40);
        const box = dg.querySelector('[data-xb]');
        box.innerHTML = `${sug.length ? `<h4>💡 ${esc(T('Ce qui ressemble à tes indices'))}</h4><ul class="ep-guide">${sug.map((s, i) => `<li><div>${esc(T('L’indice {n} « {t} » ressemble à « {b} »', {n: s.clue.num, t: s.clue.text, b: s.b.name}))}<br><small>${esc([s.from ? T('pas avant {y}', {y: s.from}) : '', s.to ? T('pas après {y}', {y: s.to}) : '', T('{k} km', {k: nf(s.b.km ?? 0, 2)})].filter(Boolean).join(' · '))}</small></div>${api.ro ? '' : `<button type="button" class="button small" data-xs="${i}">✓ ${esc(T('C’est lui'))}</button>`}</li>`).join('')}</ul>` : ''}
            <h4>🏛 ${esc(T('Bâtiments datés à moins de 3 km'))}</h4>${dated.length ? `<ul class="ep-guide">${dated.map((b, i) => { const d = C().buildingDates(b); return `<li><div><b>${esc(b.name)}</b> <small class="muted">${esc([b.kind, d.from ? T('pas avant {y}', {y: d.from}) : '', d.to ? T('pas après {y}', {y: d.to}) : '', T('{k} km', {k: nf(b.km, 2)})].filter(Boolean).join(' · '))}</small>${b.url ? ` ${ext_(b.url, '')}` : ''}</div>${api.ro ? '' : `<button type="button" class="button small secondary" data-xd="${i}">＋ ${esc(T('Indice'))}</button>`}</li>`; }).join('')}</ul>` : empty(T('Aucun bâtiment daté autour de ce lieu dans les données installées.'), '🏛')}`;
        box.onclick = async e => { const s = e.target.closest('[data-xs]'); if (s) { const x = sug[Number(s.dataset.xs)]; await keepBuilding(api, x.b, T('Reconnu dans l’indice {n}', {n: x.clue.num})); s.disabled = true; return; }
            const d = e.target.closest('[data-xd]'); if (d) { await keepBuilding(api, dated[Number(d.dataset.xd)], T('Vu sur la photo')); d.disabled = true; } };
    }

    /* ═════════ 15. 🏙 profil des toits ═════════ */
    const roofOf = im => (im?.layers || []).find(l => l.id === 'roof')?.shapes?.[0]?.pts || null;
    function roofTool(api) {
        const list = imgs(api), with_ = list.filter(im => roofOf(im));
        const draw = () => { if (api.ro) return; pending = {mode: 'roof', image: api.img.id}; api.setTool('free'); toast(T('Trace à main levée (✎) la ligne des toits et des clochers contre le ciel, de gauche à droite.')); };
        if (!roofOf(api.img)) { if (api.ro) return toast(T('Aucun profil des toits tracé.')); draw(); return; }
        const others = with_.filter(im => im !== api.img);
        const st = {b: others[0]?.id || 0, op: 60, blink: false}; let timer = 0, show = true;
        const dg = dlgOpen({eyebrow: T('🏙 PROFIL DES TOITS'), title: T('Comparer deux profils de toits'), submitLabel: T('Fermer'), wide: true,
            body: `<p class="ui-hint">${esc(T('Les toits et les clochers changent peu : deux photos du même endroit ont le même profil, même de loin ou d’un autre angle (à peu près).'))}</p>
                ${others.length ? `<div class="ep-xrow"><label>${esc(T('Avec'))} ${imageChoice(api, 'b', st.b, others)}</label><label class="ep-sl">${esc(T('Opacité de B'))}<input type="range" min="0" max="100" value="${st.op}" data-xop><output>${st.op} %</output></label><label class="ui-toggle"><input type="checkbox" data-xblink><i></i>${esc(T('Clignoter'))}</label></div><div data-xsvg></div><p data-xgap></p>
                ${api.ro ? '' : `<div><span class="pk-lab">${esc(T('Le même endroit ?'))}</span><div class="ep-row">${[['oui', T('Oui')], ['non', T('Non')], ['peut', T('Peut-être')]].map(([k, l]) => `<button type="button" class="button small secondary" data-xr="${k}">${esc(l)}</button>`).join('')}</div></div>`}`
                    : `<p class="ui-notice">${esc(T('Trace aussi le profil des toits sur une autre image de l’enquête pour les comparer.'))}</p>`}
                ${api.ro ? '' : `<button type="button" class="button small secondary" data-xredraw>✎ ${esc(T('Retracer le profil de cette image'))}</button>`}`, onSubmit: () => true});
        if (!dg) return;
        const a = C().normLine(roofOf(api.img));
        const paint = () => { const host = dg.querySelector('[data-xsvg]'); if (!host) return; const bIm = api.images.find(i => i.id === st.b), b = C().normLine(roofOf(bIm));
            const pts = (v, col, op) => v ? `<polyline points="${v.map((y, i) => `${(i / (v.length - 1) * 300).toFixed(1)},${(10 + y * 100).toFixed(1)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="3" opacity="${op}"/>` : '';
            host.innerHTML = `<svg class="ep-roof" viewBox="0 0 300 120" role="img" aria-label="${esc(T('Les deux profils de toits'))}">${pts(a, '#055dff', 1)}${st.blink && !show ? '' : pts(b, '#d1242f', st.op / 100)}</svg><small class="muted"><span style="color:#055dff">━</span> ${esc(api.letterOf(api.img))} · <span style="color:#d1242f">━</span> ${esc(api.letterOf(bIm))}</small>`;
            const g = C().lineGap(a, b); dg.querySelector('[data-xgap]').textContent = g == null ? '' : g < 0.1 ? T('Écart moyen {g} : très proches.', {g: nf(g, 2)}) : g < 0.2 ? T('Écart moyen {g} : assez proches.', {g: nf(g, 2)}) : T('Écart moyen {g} : différents.', {g: nf(g, 2)}); };
        dg.addEventListener('close', () => clearInterval(timer));
        dg.addEventListener('input', e => { if (e.target.matches('[data-xop]')) { st.op = Number(e.target.value); e.target.parentElement.querySelector('output').textContent = `${st.op} %`; paint(); } });
        dg.addEventListener('change', e => { if (e.target.name === 'b') { st.b = Number(e.target.value); paint(); } if (e.target.matches('[data-xblink]')) { st.blink = e.target.checked; clearInterval(timer); show = true; if (st.blink) timer = setInterval(() => { show = !show; paint(); }, 650); paint(); } });
        dg.addEventListener('click', async e => { if (e.target.closest('[data-xredraw]')) { dg.close(); draw(); return; }
            const r = e.target.closest('[data-xr]'); if (!r) return; const bIm = api.images.find(i => i.id === st.b), k = r.dataset.xr, g = C().lineGap(a, C().normLine(roofOf(bIm)));
            await api.addClue({kind: 'lieu', source: 'compare', text: T('Profil des toits comparé à {b} : {r}', {b: api.letterOf(bIm), r: T({oui: 'le même', non: 'pas le même', peut: 'peut-être le même'}[k])}), certainty: k === 'oui' ? 'probable' : k === 'non' ? 'refuted' : 'supposed',
                why: T('Profils superposés (écart moyen {g})', {g: g == null ? '?' : nf(g, 2)}), images: {[api.img.id]: 'yes', [st.b]: 'yes'}}); dg.close(); });
        paint();
    }

    /* ═════════ 16. 📐 distances entre repères ═════════ */
    function distances(api) {
        if (api.ro) return;
        dlgOpen({eyebrow: T('📐 DISTANCES'), title: T('La distance entre deux repères'), submitLabel: T('Ajouter l’indice'), body: `<p class="ui-hint">${esc(T('« Le clocher est à environ 200 m derrière la fontaine » : une distance entre deux choses vues aide à retrouver l’endroit sur un plan.'))}</p>
            <div class="form-grid one-column"><div class="ep-2"><label>${esc(T('De'))}<input name="a" required placeholder="${esc(T('la fontaine'))}"></label><label>${esc(T('À'))}<input name="b" required placeholder="${esc(T('le clocher'))}"></label></div>
            <div class="ep-2"><label>${esc(T('Environ'))}<input name="d" inputmode="decimal" required placeholder="200"></label><label>${esc(T('Unité'))}<select name="u"><option value="m">${esc(T('mètres'))}</option><option value="km">${esc(T('kilomètres'))}</option><option value="pas">${esc(T('pas'))}</option></select></label></div>
            <label>${esc(T('Comment'))}<select name="how"><option value="oeil">${esc(T('estimée à l’œil'))}</option><option value="mesure">${esc(T('mesurée (📏)'))}</option><option value="carte">${esc(T('d’après une carte'))}</option></select></label>
            <div><span class="pk-lab">${esc(T('Sûr ?'))}</span>${certSeg('supposed', CERTS.slice(1))}</div></div>`,
            onOpen: bindCert,
            onSubmit: async f => { const d = Number(String(f.d.value).replace(',', '.')); if (!(d > 0)) { toast(T('Donne une distance.'), 'error'); return false; }
                const u = {m: T('mètres'), km: T('kilomètres'), pas: T('pas')}[f.u.value];
                await api.addClue({kind: 'lieu', text: T('{a} → {b} : environ {d} {u}', {a: f.a.value.trim(), b: f.b.value.trim(), d: nf(d, 2), u}).slice(0, 590), certainty: f.xc.value || 'supposed', why: T({oeil: 'estimée à l’œil', mesure: 'mesurée (📏)', carte: 'd’après une carte'}[f.how.value]), data: {distance: {a: f.a.value.trim(), b: f.b.value.trim(), d, unit: f.u.value, how: f.how.value}}}); }});
    }

    /* ═════════ 18. 🗓 histoire locale : une scène possible ═════════ */
    async function localHistory(api) {
        const pl = placeOf(api), w = yearWin(api);
        if (!pl?.id) return toast(T('Il faut un lieu de la base (conclusion, hypothèse ou indice).'), 'error');
        if (!w.from && !w.to) return toast(T('Il faut d’abord une fourchette de dates (la frise de la photo).'), 'error');
        let r; try { r = await api.get('local_events', {place_id: pl.id, from: w.from || w.to, to: w.to || w.from}); } catch (e) { return toast(e.message, 'error'); }
        const L = r.events || [];
        dlgOpen({eyebrow: T('🗓 HISTOIRE LOCALE'), title: T('Ce qui se passait à {p} ({a}–{b})', {p: r.place || pl.name, a: w.from || w.to, b: w.to || w.from}), submitLabel: T('Fermer'), wide: true,
            body: L.length ? `<p class="ui-hint">${esc(T('Une fête, une inondation, une visite : la photo montre peut-être cette scène. Seulement une piste, « Supposé ».'))}</p><ul class="ep-guide">${L.map((e, i) => `<li><div><b>${esc(e.title)}</b> <span class="ui-badge is-date">${esc(e.from === e.to ? e.from : `${e.from}–${e.to}`)}</span>${e.scope === 'local' ? ` <span class="ui-badge is-blue">${esc(T('local'))}</span>` : ''}${e.desc ? `<br><small>${esc(e.desc)}</small>` : ''}${e.url ? `<br>${ext_(e.url, T('Source'))}` : ''}</div>${api.ro ? '' : `<button type="button" class="button small secondary" data-xe="${i}">＋ ${esc(T('Scène possible'))}</button>`}</li>`).join('')}</ul>`
                : empty(T('Rien dans l’histoire locale de l’app pour ce lieu et ces années (🌍 Le monde autour : tu peux y ajouter tes événements).'), '🗓'),
            onOpen: dg => dg.addEventListener('click', async e => { const b = e.target.closest('[data-xe]'); if (!b) return; const x = L[Number(b.dataset.xe)];
                await api.addClue({kind: 'date', text: T('Peut-être : {t} ({y})', {t: x.title, y: x.from === x.to ? x.from : `${x.from}–${x.to}`}).slice(0, 590), certainty: 'supposed', source: 'donnees', url: x.url || '', why: T('Histoire locale qui colle avec le lieu et les dates')}); b.disabled = true; }), onSubmit: () => true});
    }

    /* ═════════ 19. 👶 ranger une série d'après la croissance des enfants ═════════ */
    function growth(api) {
        const list = imgs(api); if (list.length < 2) return toast(T('Il faut au moins deux images dans l’enquête.'), 'error');
        let rows = JSON.parse(JSON.stringify(settings(api).growth || [{who: '', ages: {}}]));
        const table = () => `<table class="ep-stable ep-grow"><thead><tr><th>${esc(T('Enfant'))}</th>${list.map(im => `<th>${esc(api.letterOf(im))}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map((r, i) => `<tr><td><input data-xw="${i}" value="${esc(r.who)}" placeholder="${esc(T('le petit en marin'))}" ${api.ro ? 'readonly' : ''}></td>${list.map(im => `<td><input data-xa="${i}" data-im="${im.id}" inputmode="numeric" value="${esc(r.ages?.[im.id] ?? '')}" aria-label="${esc(T('Âge sur {l}', {l: api.letterOf(im)}))}" ${api.ro ? 'readonly' : ''}></td>`).join('')}<td>${api.ro ? '' : `<button type="button" class="icon-button small" data-xrm="${i}" aria-label="${esc(T('Retirer'))}" title="${esc(T('Retirer'))}">×</button>`}</td></tr>`).join('')}</tbody></table>`;
        const result = () => { const g = C().growthOrder(rows, list.map(im => im.id)); if (g.used < 2) return {g, html: empty(T('Note l’âge approximatif d’un même enfant sur au moins deux images.'), '👶')};
            const L = g.order.map(id => list.find(im => String(im.id) === id));
            return {g, html: `<p><b>${esc(T('Ordre suggéré : {o}', {o: L.map(im => api.letterOf(im)).join(' → ')}))}</b></p><p class="ui-hint">${esc(L.map(im => T('{l} : +{t} an(s)', {l: api.letterOf(im), t: nf(g.t[String(im.id)], 1)})).join(' · '))}</p>${g.spread > 2 ? `<p class="ui-notice">⚠️ ${esc(T('Les âges ne collent pas bien entre eux (jusqu’à {s} ans d’écart) : revois-les.', {s: nf(g.spread, 1)}))}</p>` : ''}`}; };
        let save = 0;
        dlgOpen({eyebrow: T('👶 CROISSANCE'), title: T('Ranger la série d’après l’âge des enfants'), submitLabel: T('Fermer'), wide: true,
            body: `<p class="ui-hint">${esc(T('Sur chaque image, note l’âge que paraît avoir chaque enfant (à peu près). Les enfants grandissent dans le même sens : l’app en tire un ordre.'))}</p><div data-xt>${table()}</div>${api.ro ? '' : `<button type="button" class="button small secondary" data-xplus>＋ ${esc(T('Un enfant'))}</button>`}<div data-xo aria-live="polite">${result().html}</div>
                ${api.ro ? '' : `<div class="ep-row"><button type="button" class="button small" data-xkeep>＋ ${esc(T('Garder l’ordre comme indice'))}</button><button type="button" class="button small secondary" data-xsort>↕ ${esc(T('Ranger les images dans cet ordre'))}</button></div>`}`,
            onOpen: dg => {
                const upd = () => { dg.querySelector('[data-xo]').innerHTML = result().html; clearTimeout(save); save = setTimeout(() => saveSettings(api, {growth: rows}), 600); };
                dg.addEventListener('input', e => { const w = e.target.dataset.xw, a = e.target.dataset.xa; if (w != null) rows[Number(w)].who = e.target.value.slice(0, 80); if (a != null) { const r = rows[Number(a)]; r.ages = r.ages || {}; r.ages[e.target.dataset.im] = e.target.value === '' ? '' : Number(e.target.value.replace(',', '.')); } upd(); });
                dg.addEventListener('click', async e => {
                    if (e.target.closest('[data-xplus]')) { rows.push({who: '', ages: {}}); dg.querySelector('[data-xt]').innerHTML = table(); return; }
                    const rm = e.target.closest('[data-xrm]'); if (rm) { rows.splice(Number(rm.dataset.xrm), 1); if (!rows.length) rows.push({who: '', ages: {}}); dg.querySelector('[data-xt]').innerHTML = table(); upd(); return; }
                    const {g} = result();
                    if (e.target.closest('[data-xkeep]') && g.used >= 2) { const o = g.order.map(id => api.letterOf(list.find(im => String(im.id) === id))).join(' → ');
                        await api.addClue({kind: 'date', text: T('Ordre d’après la croissance des enfants : {o}', {o}), certainty: 'supposed', why: T('Âges approximatifs notés à l’œil'), images: Object.fromEntries(g.order.map(id => [id, 'yes'])), data: {growth: {order: g.order, t: g.t}}}); return; }
                    if (e.target.closest('[data-xsort]') && g.used >= 2) { const ordered = [...g.order.map(id => list.find(im => String(im.id) === id)), ...api.images.filter(im => !g.order.includes(String(im.id)))]; const before = api.images.map(im => [im.id, im.position]);
                        for (let i = 0; i < ordered.length; i++) await api.post('image_save', {image_id: ordered[i].id, position: i}); dg.close(); await api.reload();
                        undoToast(T('Images rangées dans l’ordre de la croissance'), {undo: async () => { for (const [id, p] of before) await api.post('image_save', {image_id: id, position: p}); await api.reload(); }}); }
                }); },
            onSubmit: () => { clearTimeout(save); if (!api.ro) saveSettings(api, {growth: rows}); return true; }});
    }

    /* ═════════ 20. ☑ ai-je tout regardé ? ═════════ */
    const CHECK_LABELS = {coins: 'Les quatre coins de l’image', fond: 'Le fond, derrière les gens', reflets: 'Les reflets (vitrines, miroirs, flaques)', dos: 'Le dos de la photo', bords: 'Les bords, la marge, le carton', ombres: 'Les ombres', mains: 'Les mains (alliance, outil, objet tenu)', habits: 'Les habits et les chaussures', textes: 'Les petits textes (enseignes, affiches, plaques)', ciel: 'Le ciel et le temps qu’il fait'};
    function checklist(api) {
        const c = {...(settings(api).checklist || {})};
        const prog = () => { const p = C().checklistProgress({checklist: c}); return `<div class="ep-prog" role="progressbar" aria-valuemin="0" aria-valuemax="${p.total}" aria-valuenow="${p.done}" aria-label="${esc(T('Regardé'))}"><i style="width:${Math.round(p.done / p.total * 100)}%"></i></div><small>${esc(T('{a} sur {b} regardés', {a: p.done, b: p.total}))}</small>`; };
        dlgOpen({eyebrow: T('☑ AI-JE TOUT REGARDÉ ?'), title: T('Ai-je tout regardé ?'), submitLabel: T('Fermer'), body: `<p class="ui-hint">${esc(T('Coche au fur et à mesure. Les indices se cachent souvent là où on ne regarde pas.'))}</p><div data-xp>${prog()}</div>
            <ul class="ep-check">${C().CHECKLIST.map(k => `<li><label class="ep-ck"><input type="checkbox" data-xk="${k}" ${c[k] ? 'checked' : ''} ${api.ro ? 'disabled' : ''}> ${esc(T(CHECK_LABELS[k]))}</label></li>`).join('')}</ul>`,
            onOpen: dg => dg.addEventListener('change', e => { const k = e.target.dataset.xk; if (!k) return; if (e.target.checked) c[k] = 1; else delete c[k]; dg.querySelector('[data-xp]').innerHTML = prog(); saveSettings(api, {checklist: {...c}}).then(() => api.render?.()); }),
            onSubmit: () => true});
    }

    /* ═════════ 21. 😈 l'avocat du diable ═════════ */
    const DEVIL_HINT = {place: 'Une autre photo du même lieu où un détail ne colle pas', date: 'Un détail plus récent (ou plus ancien) que cette date', hyp: 'Un indice qui irait contre cette hypothèse', clue: 'Une autre explication de cet indice'};
    function devil(api) {
        const L = C().devilTargets(api.inq);
        dlgOpen({eyebrow: T('😈 AVOCAT DU DIABLE'), title: T('Qu’est-ce qui prouverait le contraire ?'), submitLabel: T('Fermer'), wide: true,
            body: L.length ? `<p class="ui-hint">${esc(T('Pour chaque conclusion, imagine ce qui la démentirait : ce qu’il faut chercher devient un indice « à chercher ».'))}</p><ul class="ep-devil">${L.map((t, i) => `<li class="${t.done ? 'is-done' : ''}"><div><b>${esc(t.k === 'place' ? T('Lieu : {l}', {l: t.label}) : t.k === 'date' ? T('Date : {l}', {l: t.label}) : t.hyp ? T('Hypothèse : {l}', {l: t.label}) : T('Indice {n} : {l}', {n: t.num, l: t.label}))}</b> ${api.certBadge(t.certainty)}${t.done ? ` <small class="muted">✓ ${esc(T('déjà « à chercher »'))}</small>` : ''}</div>
                ${api.ro ? '' : `<div class="ep-xrow"><input data-xq="${i}" placeholder="${esc(T(DEVIL_HINT[t.k === 'place' ? 'place' : t.k === 'date' ? 'date' : t.hyp ? 'hyp' : 'clue']))}" aria-label="${esc(T('Qu’est-ce qui prouverait le contraire ?'))}"><button type="button" class="button small secondary" data-xadd="${i}">＋ ${esc(T('À chercher'))}</button></div>`}</li>`).join('')}</ul>`
                : empty(T('Pas encore de conclusion ni d’indice sûr à mettre à l’épreuve.'), '😈'),
            onOpen: dg => dg.addEventListener('click', async e => { const b = e.target.closest('[data-xadd]'); if (!b) return; const t = L[Number(b.dataset.xadd)], q = dg.querySelector(`[data-xq="${b.dataset.xadd}"]`);
                const text = (q.value.trim() || q.placeholder).slice(0, 500);
                const c = await api.addClue({kind: 'autre', text: T('À chercher : {t}', {t: text}), certainty: 'supposed', why: T('Ce qui prouverait le contraire de « {c} »', {c: t.label}).slice(0, 3000), data: {todo: 1, against: t.k}});
                if (c) { b.disabled = true; b.closest('li').classList.add('is-done'); } }), onSubmit: () => true});
    }

    /* ═════════ 22. 🌡 le niveau de l'enquête, et le temps passé ═════════ */
    const LEVEL_LABELS = {debutee: ['🌱', 'Débutée'], avancee: ['🔎', 'Avancée'], resolue: ['✅', 'Résolue'], impossible: ['⏸', 'Impossible pour l’instant']};
    function badge(inq) {
        const l = C().levelOf(inq), [i, t] = LEVEL_LABELS[l.level], sec = Number(inq?.settings?.time_s) || 0, p = C().checklistProgress(inq?.settings);
        return `<button type="button" class="ep-level is-${l.level}" data-ep-cmd="level" title="${esc(T('Niveau de l’enquête'))}${sec >= 60 ? ` · ${esc(T('temps passé : {d}', {d: C().fmtDur(sec)}))}` : ''}">${i} ${esc(T(t))}${l.chosen ? '' : ' ?'}${p.done ? ` · ☑ ${p.done}/${p.total}` : ''}</button>`;
    }
    function level(api) {
        const l = C().levelOf(api.inq), sec = Number(settings(api).time_s) || 0;
        dlgOpen({eyebrow: T('🌡 NIVEAU'), title: T('Où en est l’enquête ?'), submitLabel: T('Fermer'), body: `${seg(T('Niveau'), C().LEVELS.map(k => ({on: l.level === k, attrs: `data-xl="${k}" ${api.ro ? 'disabled' : ''}`, html: `${LEVEL_LABELS[k][0]} ${esc(T(LEVEL_LABELS[k][1]))}`})), 'ep-levels')}
            ${l.chosen ? '' : `<p class="ui-hint">${esc(T('Proposé d’après les indices et la conclusion : choisis pour le garder.'))}</p>`}
            <p>⏱ ${esc(sec >= 60 ? T('Temps passé sur l’enquête : {d}', {d: C().fmtDur(sec)}) : T('Temps passé sur l’enquête : moins d’une minute'))}</p>
            <p class="ui-hint">${esc(T('« Impossible pour l’instant » n’est pas un échec : une enquête dort parfois des années avant qu’un cousin retrouve le dos d’une autre photo.'))}</p>`,
            onOpen: dg => dg.addEventListener('click', async e => { const b = e.target.closest('[data-xl]'); if (!b || api.ro) return; segPick(b); const before = settings(api).level; await saveSettings(api, {level: b.dataset.xl}); refreshBadge(api);
                undoToast(T('Niveau : {l}', {l: T(LEVEL_LABELS[b.dataset.xl][1])}), {undo: async () => { await saveSettings(api, {level: before || ''}); refreshBadge(api); }}); }), onSubmit: () => true});
    }
    function refreshBadge(api) { const el = api.dlg?.querySelector('[data-ep-cmd="level"]'); if (el) el.outerHTML = badge(api.inq); }
    /** à la fermeture : le temps passé (au plus 3 h d'un coup, une fenêtre oubliée ne compte pas des jours) */
    function onClose(api) {
        if (api.ro || !api.t0) return; const sec = Math.min(3 * 3600, Math.round((Date.now() - api.t0) / 1000)); if (sec < 20) return;
        const s = {...(api.inq.settings || {}), time_s: (Number(api.inq.settings?.time_s) || 0) + sec}; api.inq.settings = s;
        EP()._post?.('update', {id: api.inq.id, settings: s}).catch(() => {});
    }

    /* ═════════ 23. 📋 le rapport pour un expert ═════════ */
    async function reportHtml(api) {
        const inq = api.inq, c = inq.conclusion || {}, privNames = (inq.links || []).filter(l => l.private).map(l => l.label.replace(/\s*\(.*\)$/, '')).filter(Boolean);
        const hide = t => privNames.some(n => n && String(t || '').includes(n));
        const clues = api.clues.filter(x => x.source !== 'visage' && !hide(x.text) && !hide(x.why) && !x.data?.who);
        const certW = k => T(api.CERT[k]?.[0] || ''), p = settings(api).provenance || {}, ins = (settings(api).inscriptions || []).filter(x => !hide(x.text) && !hide(x.writer));
        const qs = [...clues.filter(x => x.certainty === 'supposed' && !x.data?.todo).map(x => T('{n}. « {t} » : est-ce juste ?', {n: x.num, t: x.text})), ...clues.filter(x => x.data?.todo).map(x => x.text), ...C().missing(inq).map(m => X().missingText?.(m)).filter(Boolean)];
        const css = 'body{font:14px/1.5 Georgia,serif;color:#222;max-width:860px;margin:24px auto;padding:0 16px}h1{font-size:24px}h2{font-size:17px;border-bottom:1px solid #ccc;margin-top:22px}figure{margin:10px 0}img{max-width:100%;max-height:120mm}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 6px;vertical-align:top;font-size:13px}.r{text-decoration:line-through;color:#888}.b{font:11px system-ui;border:1px solid;padding:0 4px;text-transform:uppercase}';
        const images = X()._imagesHtml ? await X()._imagesHtml(api, {safe: true, layers: true}) : '';
        return `<!doctype html><html lang="fr"><meta charset="utf-8"><title>${esc(inq.title)}</title><style>${css}</style><body>
            <h1>📋 ${esc(T('Dossier pour un expert : {t}', {t: inq.title}))}</h1><p>${esc(T('Une photo de famille dont on cherche le lieu et la date. Merci pour votre regard : les questions précises sont à la fin.'))}</p>${images}
            <h2>${esc(T('Ce que l’on pense'))}</h2><p>${c.place ? `🗺 ${esc(c.place.name || '')} <span class="b">${esc(certW(c.place.certainty))}</span>` : ''}${c.date ? `<br>📅 ${esc(c.date.text || '')} <span class="b">${esc(certW(c.date.certainty))}</span>` : ''}${!c.place && !c.date ? esc(T('Pas encore de conclusion.')) : ''}</p>
            <h2>${esc(T('Les indices relevés'))}</h2><table><thead><tr><th>N°</th><th>${esc(T('Indice'))}</th><th>${esc(T('Certitude'))}</th><th>${esc(T('Pourquoi'))}</th></tr></thead><tbody>${clues.map(x => `<tr class="${x.certainty === 'refuted' ? 'r' : ''}"><td>${x.num}</td><td>${esc(x.text)}${x.url ? ` (<a href="${esc(x.url)}">${esc(T('source'))}</a>)` : ''}</td><td><span class="b">${esc(certW(x.certainty))}</span></td><td>${esc(x.why || '')}</td></tr>`).join('')}</tbody></table>
            ${p.album || p.owner || p.given_when ? `<h2>${esc(T('Provenance du tirage'))}</h2><p>${esc([p.album && T('Album : {a}', {a: p.album}), p.given_when && T('Reçue en {w}', {w: p.given_when})].filter(Boolean).join(' · '))}</p>` : ''}
            ${ins.length ? `<h2>${esc(T('Inscriptions au dos'))}</h2><ul>${ins.map(x => `<li>« ${esc(x.text)} » — ${esc([T(INKS.find(k => k[0] === x.ink)?.[1] || ''), x.when].filter(Boolean).join(' · '))}</li>`).join('')}</ul>` : ''}
            <h2>${esc(T('Nos questions précises'))}</h2><ol>${qs.slice(0, 20).map(q => `<li>${esc(String(q).replace(/^\d+\.\s*/, ''))}</li>`).join('') || `<li>${esc(T('Où et quand cette photo a-t-elle été prise ?'))}</li>`}</ol>
            <p><small>${esc(T('Dossier sans risque : visages des vivants floutés, noms des vivants, notes, journal et propositions de visages retirés.'))}</small></p></body></html>`;
    }
    async function report(api) {
        const html = await reportHtml(api);
        dlgOpen({eyebrow: T('📋 RAPPORT D’EXPERT'), title: T('Un dossier pour un expert'), submitLabel: T('Fermer'), wide: true,
            body: `<p class="ui-hint">${esc(T('Pour un musée, un archiviste, un forum d’entraide : la photo, les indices et des questions précises. Comme « Partager sans risque » : rien de privé.'))}</p><iframe class="ep-story" sandbox="" title="${esc(T('Aperçu'))}"></iframe>
                <div class="ep-row"><button type="button" class="button small" data-xprint>🖨 ${esc(T('Imprimer ou PDF…'))}</button><button type="button" class="button small secondary" data-xdl>⤓ ${esc(T('Télécharger la page (.html)'))}</button></div>`,
            onOpen: dg => { dg.querySelector('iframe').srcdoc = html; dg.addEventListener('click', e => {
                if (e.target.closest('[data-xprint]')) { UI().openPrintDialog ? UI().openPrintDialog({title: api.inq.title, key: 'enquete-photo-rapport', html}) : toast(T('L’impression n’est pas prête.'), 'error'); api.post('log_export', {id: api.inq.id, kind: 'print', what: 'rapport'}).catch(() => {}); }
                if (e.target.closest('[data-xdl]')) { download(new Blob([html], {type: 'text/html'}), `${safeName(api.inq.title)}-rapport.html`); api.post('log_export', {id: api.inq.id, what: 'rapport'}).catch(() => {}); } }); },
            onSubmit: () => true});
    }

    /* ═════════ 25. 🧩 sur un tableau ═════════ */
    function board(api) {
        if (api.ro) return;
        const t = (ext.dropTargets || []).find(x => x.id === 'board'); if (!t) return toast(T('Les tableaux ne sont pas chargés.'), 'error');
        dlgOpen({eyebrow: T('🧩 TABLEAU'), title: T('Mettre l’enquête sur un tableau'), submitLabel: T('Choisir le tableau…'), body: `<p class="ui-hint">${esc(T('Les images et les indices sont posés sur le tableau ; relie ensuite les indices de plusieurs photos par un 🧵 fil rouge (clic droit sur un élément du tableau).'))}</p>
            <label class="ui-toggle"><input type="checkbox" name="layers" checked><i></i>${esc(T('Les images avec leurs calques (une copie ; l’original ne change pas)'))}</label><label class="ui-toggle"><input type="checkbox" name="clues" checked><i></i>${esc(T('Les indices, en notes'))}</label>`,
            onSubmit: async f => {
                const ctx = await t.choose(); if (!ctx) return false;
                const items = [];
                for (const im of imgs(api)) {
                    let mid = im.media_id;
                    if (f.layers.checked && api.layersOf(im).some(l => l.visible && l.shapes.length) && ext.rtUploadCopy) { try { const cv = await api.composite(im, {layers: true}); const blob = await new Promise(r => cv.toBlob(r, 'image/png')); const r = await ext.rtUploadCopy(blob, {title: `🔎 ${api.inq.title} · ${api.letterOf(im)}`}); mid = Number(r.media_id || r.id) || mid; } catch (_) {} }
                    items.push({kind: 'media', ref_id: mid, title: `${api.letterOf(im)} · ${im.label || im.media?.title || ''}`, origin: {kind: 'photo_inquiry', id: api.inq.id, label: api.inq.title}});
                }
                if (f.clues.checked) api.clues.filter(c => c.source !== 'visage').forEach(c => items.push({kind: 'text', title: `🔎 ${c.num} · ${c.text}`, value: [T(api.CERT[c.certainty]?.[0] || ''), c.why].filter(Boolean).join(' · '), origin: {kind: 'photo_inquiry', id: api.inq.id, label: api.inq.title}}));
                try { const r = await t.receive(items, ctx); await api.post('link_save', {inquiry_id: api.inq.id, kind: 'board', ref_id: Number(ctx.board_id)}).catch(() => {}); await api.reload(); undoToast(r?.message || T('Posé sur le tableau'), r?.undo ? {undo: r.undo} : {}); }
                catch (e) { toast(e.message, 'error'); return false; }
            }});
    }

    /* ═════════ 26. 🗺 les enquêtes sur la grande carte (calque éteint au départ) ═════════ */
    const M = {last: null, list: null, at: 0};
    const mapOn = () => !!EP().prefs?.().mapLayer;
    async function mapPoints(force = false) { if (!force && M.list && Date.now() - M.at < 30000) return M.list; try { M.list = (await EP()._get('map')).inquiries || []; } catch (_) { M.list = []; } M.at = Date.now(); return M.list; }
    async function drawMapLayer() {
        const st = document.getElementById('map-stage'); if (!st) return 0;
        let svg = st.querySelector('#ep-map-layer');
        if (!mapOn()) { svg?.remove(); return 0; }
        if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'ep-map-layer'; svg.setAttribute('class', 'ep-map-layer'); st.appendChild(svg);
            svg.addEventListener('click', e => { const g = e.target.closest('[data-ep-mapq]'); if (g) EP().open?.(Number(g.dataset.epMapq)); }); }
        const L = M.last, list = await mapPoints(); if (!L) return 0;
        svg.setAttribute('viewBox', `0 0 ${L.width} ${L.height}`);
        const pts = list.map(q => ({q, x: A().lngToX(q.lon, L.z) - L.left, y: A().latToY(q.lat, L.z) - L.top})).filter(p => p.x > -20 && p.y > -20 && p.x < L.width + 20 && p.y < L.height + 20);
        svg.innerHTML = pts.map(p => `<g class="ep-mapq" data-ep-mapq="${p.q.id}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})"><title>🔎 ${esc(p.q.title)} · ${esc(p.q.place)} · ${esc(T(EP_CERT_LABEL[p.q.certainty] || ''))}</title><rect x="-9" y="-9" width="18" height="18" rx="4" fill="${C().CERT_COLOR[p.q.certainty] || '#888'}" stroke="#fff" stroke-width="2"/><text text-anchor="middle" dy="4" font-size="11" fill="#fff">🔎</text></g>`).join('');
        return pts.length;
    }
    const EP_CERT_LABEL = {proven: 'Prouvé', probable: 'Probable', supposed: 'Supposé', refuted: 'Réfuté'};
    function setMapLayer(on) { EP().setPrefs?.({mapLayer: !!on}); const b = document.querySelector('[data-ep-maplayer]'); if (b) { b.classList.toggle('is-active', !!on); b.setAttribute('aria-pressed', String(!!on)); } return drawMapLayer(); }
    ext.mapSetup.push(() => {
        const strip = document.querySelector('.map-layout .tool-strip'); if (!strip || strip.querySelector('[data-ep-maplayer]')) return;
        const b = document.createElement('button'); b.type = 'button'; b.className = `button small secondary${mapOn() ? ' is-active' : ''}`; b.dataset.epMaplayer = '1'; b.setAttribute('aria-pressed', String(mapOn()));
        b.title = T('Les photos dont l’enquête a trouvé un lieu, en couleur selon la certitude'); b.textContent = `🔎 ${T('Enquêtes photo')}`;
        strip.insertBefore(b, strip.querySelector('.spacer'));
        b.addEventListener('click', () => { M.list = null; setMapLayer(!mapOn()); });
    });
    ext.mapDraw.push(p => { M.last = p; drawMapLayer(); });
    function mapAid(api) {
        dlgOpen({eyebrow: T('🗺 CARTE DES ENQUÊTES'), title: T('Les enquêtes sur la grande carte'), submitLabel: T('Fermer'), body: `<p class="ui-hint">${esc(T('Sur la grande carte, un calque montre toutes les photos dont l’enquête a trouvé un lieu, en couleur selon la certitude (vert Prouvé, bleu Probable, jaune Supposé). Éteint au départ, pour ne pas encombrer la carte.'))}</p>
            <label class="ui-toggle"><input type="checkbox" data-xon ${mapOn() ? 'checked' : ''}><i></i>${esc(T('Montrer les enquêtes photo sur la grande carte'))}</label><div class="ep-row"><button type="button" class="button small secondary" data-xgo>🗺 ${esc(T('Ouvrir la carte'))}</button></div>`,
            onOpen: dg => { dg.addEventListener('change', e => { if (e.target.matches('[data-xon]')) setMapLayer(e.target.checked); }); dg.addEventListener('click', e => { if (e.target.closest('[data-xgo]')) { dg.close(); api.dlg?.close(); A().setModule?.('map'); } }); }, onSubmit: () => true});
    }

    /* ═════════ la grille, les questions, l'aiguillage ═════════ */
    const AIDES = [
        ['🔬 Regarder de plus près', [['canaux', '🎨', 'Canaux de couleur'], ['relief', '🔦', 'Lumière rasante'], ['deuxtirages', '🪞', 'Deux tirages'], ['g:grain', '🔬', 'Grain et trame'], ['mesurer', '📏', 'Mesurer']]],
        ['🏠 Le décor et le pays', [['g:interieur', '🛋', 'L’intérieur'], ['decor', '🎭', 'Décor de studio'], ['animaux', '🐄', 'Bêtes et cultures'], ['g:toits', '🏘', 'Toits et murs'], ['profil', '🏙', 'Profil des toits'], ['boussole', '🧭', 'Boussole sur la carte'], ['distances', '📐', 'Distances entre repères'], ['construction', '🏗', 'Construction et démolition'], ['histoire', '🗓', 'Histoire locale']]],
        ['👪 Qui, et dans quel ordre', [['qui', '👪', 'Qui pourrait-ce être ?'], ['visages', '👤', 'Qui est-ce ? (visages)'], ['habit', '💍', 'Habit ou bijou qui revient'], ['croissance', '👶', 'Croissance des enfants'], ['provenance', '🗃', 'Provenance de la photo'], ['mains', '✍', 'Plusieurs mains au dos'], ['atelier', '📜', 'Atelier de transcription']]],
        ['🧠 Faire le point', [['checklist', '☑', 'Ai-je tout regardé ?'], ['diable', '😈', 'Avocat du diable'], ['niveau', '🌡', 'Niveau de l’enquête'], ['rapport', '📋', 'Rapport pour un expert'], ['tableau', '🧩', 'Sur un tableau'], ['carte', '🗺', 'Carte des enquêtes']]]];
    const OPEN = {canaux: a => betterSee(a), relief: a => betterSee(a, true), deuxtirages: twoPrints, mesurer: measureTool, decor, animaux: animals, profil: roofTool, boussole: compassTool, distances, construction, histoire: localHistory,
        qui: whoCould, visages: faces, habit: item, croissance: growth, provenance, mains: hands, atelier: a => atelier(a), checklist, diable: devil, niveau: level, rapport: report, tableau: board, carte: mapAid};
    /** les boutons de chaque question guidée (mk : le bouton de l'écran, qui grise ce qui écrit en consultation) */
    function stepButtons(k, mk) {
        const b = (key, label) => mk(`data-ep-aide="${key}"`, label), g = (key, label) => mk(`data-ep-guide="${key}"`, label);
        const row = list => `<div class="ep-row ep-plusrow">${list.join('')}</div>`;
        return {support: row([g('grain', T('🔬 Grain et trame')), b('deuxtirages', T('🪞 Deux tirages')), b('decor', T('🎭 Décor de studio')), b('provenance', T('🗃 Provenance'))]),
            dos: row([b('mains', T('✍ Plusieurs mains')), b('canaux', T('🎨 Canaux de couleur')), b('relief', T('🔦 Lumière rasante')), b('atelier', T('📜 Envoyer à l’atelier'))]),
            texte: row([b('canaux', T('🎨 Canaux de couleur')), b('relief', T('🔦 Lumière rasante'))]),
            lieu: row([b('boussole', T('🧭 Boussole sur la carte')), b('profil', T('🏙 Profil des toits')), b('distances', T('📐 Distances')), g('toits', T('🏘 Toits et murs')), b('animaux', T('🐄 Bêtes et cultures')), b('construction', T('🏗 Construction et démolition'))]),
            gens: row([b('visages', T('👤 Qui est-ce ? (visages, sur l’ordinateur)')), b('qui', T('👪 Qui pourrait-ce être ?')), b('habit', T('💍 Habit ou bijou qui revient')), b('mesurer', T('📏 Mesurer')), b('croissance', T('👶 Croissance des enfants'))]),
            objets: row([g('interieur', T('🛋 L’intérieur')), b('mesurer', T('📏 Mesurer'))]),
            date: row([b('histoire', T('🗓 Histoire locale')), b('construction', T('🏗 Construction et démolition')), b('croissance', T('👶 Croissance des enfants'))]),
            conclusion: row([b('checklist', T('☑ Ai-je tout regardé ?')), b('diable', T('😈 Avocat du diable')), b('niveau', T('🌡 Niveau')), b('rapport', T('📋 Rapport pour un expert')), b('tableau', T('🧩 Sur un tableau')), b('carte', T('🗺 Carte des enquêtes'))])}[k] || '';
    }
    function has(k) { return Object.prototype.hasOwnProperty.call(OPEN, k) || (k.startsWith('g:') && !!GUIDES[k.slice(2)]); }
    function open(k, api) { installGuides(); if (k.startsWith('g:')) return X().guide?.(k.slice(2), api); return OPEN[k]?.(api); }
    installGuides(); setTimeout(installGuides, 0);
    ext.enquetePhotoPlus = {AIDES, GUIDES, has, open, stepButtons, onDraw, onClose, badge, keepRead, drawMapLayer, setMapLayer, mapOn, reportHtml, _pending: () => pending, READONLY: ['rapport', 'carte', 'checklist', 'niveau', 'qui', 'visages', 'canaux', 'relief', 'deuxtirages', 'mains', 'profil', 'boussole', 'histoire']};
})();
