/* LCNDA — ⚖️ Comparer les lectures (Atelier de transcription) : chaque lecture est gardée (✍ écriture à la main, 🔬 lecture approfondie
 * de chaque modèle d'IA, 🔎 OCR, une fusion), jamais écrasée (🕘 Versions, act_transcription_versions.source) ; on en compare 2 à 4,
 * mot par mot ou ligne par ligne, et on prend le meilleur de chacune : un clic sur un passage qui diffère → les variantes, avec la
 * lecture d'où elles viennent ; « 🗳 La majorité » choisit partout ce que la plupart des lectures disent ; « ✎ Écrire autrement ».
 * Le texte fusionné va dans l'acte (le texte d'avant reste dans 🕘 Versions, ↶ Annuler) ou se garde comme une lecture de plus.
 *   ext.txCompare = {tokens, align, merge, linesOf, labelOf, keepOn, open}
 * ✍ « Ma lecture » (réglage genealogie-tx-cmp-ma-lecture) : ligne par ligne, une ligne à moi sous chaque ligne ; brouillon
 *   genealogie-tx-cmp-draft-<acte>, gardée comme version « ✍ Ma lecture (Comparer) » (source mine).
 * Essais : tests/test-transcribe-compare.js, tests/test-comparer-ma-lecture.js.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const T = (k, v) => (window.LCNDA_I18N?.t ? window.LCNDA_I18N.t(k, v) : String(k).replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? ''));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const COLORS = ['#2f6db5', '#c0392b', '#1a7f37', '#8a3ab9'];

    /* ═════ le calcul : aligner les lectures sur une lecture de référence ═════ */
    /** les mots et les retours à la ligne (« \n » est un mot : les lignes restent) */
    const tokens = s => String(s ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').split(/(\n)| /).filter(x => x !== undefined && x !== '');
    /** pour comparer : sans majuscules ni accents ni ponctuation collée (« Maître, » = « maitre ») si loose */
    const key = (w, loose) => (loose ? String(w).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.,;:!?«»"“”()\[\]]/g, '') : w);
    /** align(base, other) → {pre: [[mots insérés avant le mot i]], at: [mot à la place du mot i, ou null]} (plus longue suite commune) */
    function align(a, b, loose = false) {
        const n = a.length, m = b.length, ka = a.map(w => key(w, loose)), kb = b.map(w => key(w, loose));
        if (n * m > 25e6) return alignGreedy(a, b, ka, kb); // très long : une version rapide (fenêtre glissante)
        const W = m + 1, L = new Uint32Array((n + 1) * (m + 1));
        for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * W + j] = ka[i] === kb[j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
        const pre = Array.from({length: n + 1}, () => []), at = new Array(n).fill(null);
        let i = 0, j = 0;
        while (i < n && j < m) {
            if (ka[i] === kb[j]) { at[i] = b[j]; i++; j++; }
            else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) { i++; } // le mot de la référence manque ici
            else { pre[i].push(b[j]); j++; }
        }
        while (j < m) pre[n].push(b[j++]);
        return {pre, at};
    }
    function alignGreedy(a, b, ka, kb) {
        const n = a.length, pre = Array.from({length: n + 1}, () => []), at = new Array(n).fill(null); let j = 0;
        for (let i = 0; i < n; i++) { const look = kb.indexOf(ka[i], j); if (look >= 0 && look - j < 40) { for (let x = j; x < look; x++) pre[i].push(b[x]); at[i] = b[look]; j = look + 1; } }
        while (j < b.length) pre[n].push(b[j++]);
        return {pre, at};
    }
    /** merge(textes, {base, loose}) → passages : [{same: true, text}] ou [{same: false, opts: [texte de chaque lecture], pick}] */
    function merge(texts, {base = 0, loose = false} = {}) {
        const toks = texts.map(tokens), B = toks[base], n = B.length, al = toks.map((tk, r) => (r === base ? null : align(B, tk, loose)));
        // les cases : avant le mot i (insertion), puis le mot i
        const cellOf = (r, c) => { const i = c >> 1; if (r === base) return c & 1 ? [B[i]] : []; const x = al[r]; return c & 1 ? (x.at[i] === null ? [] : [x.at[i]]) : x.pre[i]; };
        const cells = 2 * n + 1, diff = new Array(cells).fill(false);
        for (let c = 0; c < cells; c++) { const ref = cellOf(base, c).join(' '); for (let r = 0; r < texts.length; r++) if (r !== base && cellOf(r, c).map(w => key(w, loose)).join(' ') !== ref.split(' ').map(w => key(w, loose)).join(' ')) { diff[c] = true; break; } }
        const out = []; let c = 0;
        const join = ws => ws.join(' ').replace(/ ?\n ?/g, '\n');
        while (c < cells) {
            if (!diff[c]) { const ws = []; while (c < cells && !diff[c]) { ws.push(...cellOf(base, c)); c++; } if (ws.length) out.push({same: true, text: join(ws)}); continue; }
            const from = c; while (c < cells && diff[c]) c++;
            const opts = texts.map((_, r) => { const ws = []; for (let k = from; k < c; k++) ws.push(...cellOf(r, k)); return join(ws); });
            out.push({same: false, opts, pick: base});
        }
        return out;
    }
    /** la majorité : dans chaque passage, ce que le plus de lectures disent (égalité : la référence) */
    function majority(parts, base = 0, loose = false) {
        parts.forEach(p => { if (p.same) return; const cnt = new Map(); p.opts.forEach((o, r) => { const k = key(o, loose).trim(); if (!cnt.has(k)) cnt.set(k, []); cnt.get(k).push(r); });
            let best = null; cnt.forEach(rs => { if (!best || rs.length > best.length || (rs.length === best.length && rs.includes(base))) best = rs; }); p.pick = best.includes(base) ? base : best[0]; delete p.custom; });
        return parts;
    }
    /** le texte fusionné */
    function textOf(parts) {
        let s = ''; parts.forEach(p => { const piece = p.same ? p.text : (p.custom ?? p.opts[p.pick] ?? ''); if (!piece) return; s += (s && !s.endsWith('\n') && !piece.startsWith('\n') ? ' ' : '') + piece; });
        return s.replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }
    /** ligne par ligne : les lignes de la référence ; pour chaque lecture, ce qu'elle dit à la place de cette ligne */
    function linesOf(texts, {base = 0, loose = false} = {}) {
        const B = tokens(texts[base]), rows = [], al = texts.map((t, r) => (r === base ? null : align(B, tokens(t), loose)));
        let start = 0;
        const slice = (r, a, b) => { if (r === base) return B.slice(a, b); const x = al[r], ws = []; for (let i = a; i < b; i++) { ws.push(...x.pre[i]); if (x.at[i] !== null) ws.push(x.at[i]); } ws.push(...x.pre[b]); return ws; }; // ce qui est ajouté juste avant le retour à la ligne : sur cette ligne
        for (let i = 0; i <= B.length; i++) {
            if (i === B.length || B[i] === '\n') { if (i > start || i === B.length) { const variants = texts.map((_, r) => slice(r, start, i).filter(w => w !== '\n').join(' ')); if (variants.some(v => v.trim())) rows.push({variants, pick: base}); } start = i + 1; }
        }
        return rows;
    }
    /** les mots d'une variante qui diffèrent de la référence (pour les montrer) */
    function diffWords(ref, other, loose = false) {
        const a = tokens(ref), b = tokens(other), x = align(a, b, loose), mark = new Array(b.length).fill(true);
        let j = 0; for (let i = 0; i < a.length; i++) { j += x.pre[i].length; if (x.at[i] !== null) { mark[j] = false; j++; } }
        return b.map((w, k) => ({w, d: mark[k]}));
    }

    /* ═════ les lectures : leur nom ═════ */
    const SRC = {htr: ['✍', 'Écriture à la main'], deep: ['🔬', 'Lecture approfondie'], ocr: ['🔎', 'OCR (texte imprimé)'], merge: ['⚖️', 'Fusion des lectures'], manual: ['✎', 'À la main']};
    const labelOf = (source, model = '', page = '') => { const [ic, l] = SRC[source] || ['•', source]; return `${ic} ${T(l)}${model ? ` · ${String(model).replace(/\.(mlmodel|pt|safetensors)$/i, '').slice(0, 50)}` : ''}${page ? ` · ${page}` : ''}`; };
    const KEEP_KEY = 'genealogie-tx-garder-lectures';
    const keepOn = () => { try { return localStorage.getItem(KEEP_KEY) !== '0'; } catch (_) { return true; } };
    /* ✍ « Ma lecture » (ligne par ligne) : sous les lectures de chaque ligne, une ligne à moi où je tape ma propre lecture (réglage, décoché au départ) */
    const MA_KEY = 'genealogie-tx-cmp-ma-lecture', DRAFT_PREFIX = 'genealogie-tx-cmp-draft-';
    const maOn = () => { try { return localStorage.getItem(MA_KEY) === '1'; } catch (_) { return false; } };
    const MODE_KEY = 'genealogie-tx-cmp-mode'; // « Ligne par ligne » par défaut ; « Mot par mot » gardé si choisi
    const rd = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
    const wr = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
    const setMa = on => { try { localStorage.setItem(MA_KEY, on ? '1' : '0'); } catch (_) {} };
    /** 📑 « — page 2 — » : un repère, pas une ligne de l'acte (pas de « Ma lecture » pour lui) */
    const PAGE_MARK = /^—[ \t]*[\p{L}.]+[ \t]+\d+[^\n—]*—[ \t]*$/u, isSep = s => PAGE_MARK.test(String(s ?? '').trim());
    /** les mots de ma lecture qu'aucune des lectures ne dit (pour les montrer, comme les autres) */
    function myDiff(variants, mine, loose = false) {
        const ws = tokens(mine), marks = variants.filter(v => String(v).trim()).map(v => diffWords(v, mine, loose));
        return ws.map((w, k) => ({w, d: !marks.length || marks.every(m => m[k]?.d)}));
    }

    /* ═════ la fenêtre ═════
     * ctx = {actId, title, current() → texte à l'écran, apply(texte, label) (le met dans l'acte, ↶), api, post, pick: [n° de version] cochées d'office} */
    const IMG_KEY = 'genealogie-tx-comparer-image', imgOn = () => { try { return localStorage.getItem(IMG_KEY) !== '0'; } catch (_) { return true; } };
    async function open(ctx) {
        const imgs = (ctx.images || []).filter(m => m && m.src);
        let list = [];
        try { list = ((await ctx.api('act_transcription_versions', {act_id: ctx.actId})).items || []); } catch (e) { return A().toast(e.message, 'error'); }
        const readings = [{id: 0, label: T('📝 Le texte à l’écran'), source: 'now'}, ...list.filter(v => v.source), ...list.filter(v => !v.source && !v.auto), ...list.filter(v => !v.source && v.auto).slice(0, 10)];
        const bodies = new Map([[0, ctx.current()]]);
        const getBody = async id => { if (!bodies.has(id)) bodies.set(id, (await ctx.api('act_transcription_version', {id})).body || ''); return bodies.get(id); };
        // ctx.pick : « ⚖️ Comparer avec ma version » (la bande 🕘 Versions) — le texte à l'écran et ces versions-là, cochées
        (ctx.pick || []).forEach(id => { if (!readings.some(r => r.id === id)) { const v = list.find(x => x.id === id); if (v) readings.push(v); } });
        let chosen = ctx.pick?.length ? [0, ...ctx.pick.filter(id => readings.some(r => r.id === id))] : readings.filter(r => r.source && r.source !== 'now').slice(0, 3).map(r => r.id); if (!chosen.includes(0)) chosen.unshift(0); chosen = chosen.slice(0, 4);
        let base = 0, mode = ctx.mode === 'word' ? 'word' : ctx.mode === 'line' ? 'line' : (rd(MODE_KEY) === 'word' ? 'word' : 'line'), loose = true, parts = [], rows = [], texts = [];
        /* ✍ ma lecture : [{i, ref, text, on}] — gardée au brouillon (localStorage) jusqu'à « Mettre dans le texte » */
        const DRAFT = DRAFT_PREFIX + ctx.actId;
        let ma = maOn(), mine = [], savedBody = '';
        try { const d = JSON.parse(localStorage.getItem(DRAFT) || 'null'); if (d && Array.isArray(d.mine)) { mine = d.mine.filter(e => e && typeof e.text === 'string').map(e => ({i: Number(e.i) || 0, ref: String(e.ref ?? ''), text: e.text, on: !!e.on})); savedBody = String(d.saved || ''); } } catch (_) { mine = []; }
        const hasMine = () => mine.some(e => e.text.trim());
        if (ma && hasMine()) mode = 'line';
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-txc'; dlg.dataset.ownClose = '1';
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">⚖️ ${esc(T('Atelier de transcription'))} · ${esc(ctx.title || '')}</span><h2>${esc(T('Comparer les lectures'))}</h2></div><span class="h-txc-headbtns"><button type="button" class="button small secondary h-txc-maq" data-txc-maq aria-pressed="${ma}" title="${esc(T('Ma lecture : une ligne à moi sous chaque ligne (Tab ou Entrée : ligne suivante)'))}">✍<span> ${esc(T('Ma lecture'))}</span></button><button type="button" class="icon-button" data-txc-x aria-label="${esc(T('Fermer'))}">×</button></span></div>
            <div class="h-txc-body"><aside class="h-txc-side"><h4>${esc(T('Les lectures (2 à 4)'))}</h4><div data-txc-list></div>
                <label class="ui-toggle h-txc-keep"><input type="checkbox" data-txc-keepon ${keepOn() ? 'checked' : ''}><i></i>${esc(T('Garder chaque nouvelle lecture (écriture à la main, IA, OCR)'))}</label>
                <label class="ui-toggle h-txc-keep"><input type="checkbox" data-txc-maon ${ma ? 'checked' : ''}><i></i>${esc(T('✍ Ajouter une ligne « Ma lecture » sous chaque ligne pour taper ma propre transcription'))}</label></aside>
            <section class="h-txc-main"><div class="h-txc-tools"><span class="segmented" role="radiogroup"><button type="button" data-txc-mode="line">${esc(T('Ligne par ligne'))}</button><button type="button" data-txc-mode="word">${esc(T('Mot par mot'))}</button></span>
                <button type="button" class="button small secondary" data-txc-maj title="${esc(T('Partout : ce que le plus de lectures disent'))}">🗳 ${esc(T('La majorité'))}</button><button type="button" class="button small secondary" data-txc-ref>↺ ${esc(T('Tout comme la référence'))}</button>
                <label class="ui-toggle"><input type="checkbox" data-txc-loose ${loose ? 'checked' : ''}><i></i>${esc(T('Ignorer majuscules, accents et ponctuation'))}</label>${imgs.length ? `<label class="ui-toggle"><input type="checkbox" data-txc-imgon ${imgOn() ? 'checked' : ''}><i></i>🖼 ${esc(T('L’image à côté'))}</label>` : ''}<span class="h-txc-count" data-txc-count></span></div>
                <div class="h-txc-split"><div class="h-txc-out" data-txc-out></div>${imgs.length ? `<div class="h-txc-img" data-txc-img ${imgOn() ? '' : 'hidden'}>
                    <div class="h-txc-imgbar">${imgs.length > 1 ? imgs.map((m, i) => `<button type="button" class="button small ${i ? 'secondary' : ''}" data-txc-ipage="${i}">${esc(m.label || String(i + 1))}</button>`).join('') : ''}<span class="spacer"></span><button type="button" class="icon-button small" data-txc-z="-1" aria-label="${esc(T('Zoom arrière'))}">−</button><button type="button" class="icon-button small" data-txc-z="0" title="${esc(T('Ajuster à la fenêtre'))}" aria-label="${esc(T('Ajuster à la fenêtre'))}">⤢</button><button type="button" class="icon-button small" data-txc-z="1" aria-label="${esc(T('Zoom avant'))}">＋</button></div>
                    <div class="h-txc-stage" data-txc-stage title="${esc(T('Molette : zoom · glisser : déplacer'))}"><img data-txc-pic alt="" draggable="false"></div></div>` : ''}</div></section></div>
            <div class="modal-actions"><button type="button" class="button secondary" data-txc-save>💾 ${esc(T('Garder la fusion comme lecture'))}</button><span class="spacer"></span><button type="button" class="button secondary" data-txc-x>${esc(T('Fermer'))}</button><button type="button" class="button" data-txc-apply>✓ ${esc(T('Mettre dans le texte'))}</button></div>`;
        document.body.appendChild(dlg); dlg.showModal();
        const $ = s => dlg.querySelector(s);
        /* 🖼 l'image de l'acte à côté : molette = zoom, glisser = déplacer ; une page par onglet */
        const V = {k: 1, x: 0, y: 0, fit: 1}, pic = $('[data-txc-pic]'), stage = $('[data-txc-stage]');
        const place = () => { if (pic) pic.style.transform = `translate(${V.x}px, ${V.y}px) scale(${V.k})`; };
        const fitImg = () => { if (!pic?.naturalWidth || !stage) return; V.fit = Math.min(stage.clientWidth / pic.naturalWidth, stage.clientHeight / pic.naturalHeight) || 1; V.k = V.fit; V.x = (stage.clientWidth - pic.naturalWidth * V.k) / 2; V.y = 0; place(); };
        const zoomAt = (f, cx, cy) => { const k = Math.max(V.fit * .5, Math.min(V.k * f, 8)); V.x = cx - (cx - V.x) * k / V.k; V.y = cy - (cy - V.y) * k / V.k; V.k = k; place(); };
        const showPage = i => { if (!pic) return; pic.onload = fitImg; pic.src = imgs[i].src; dlg.querySelectorAll('[data-txc-ipage]').forEach(b => b.classList.toggle('secondary', Number(b.dataset.txcIpage) !== i)); };
        if (pic) {
            showPage(0);
            stage.addEventListener('wheel', e => { e.preventDefault(); const r = stage.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, {passive: false});
            stage.addEventListener('pointerdown', e => { const sx = e.clientX - V.x, sy = e.clientY - V.y; stage.setPointerCapture(e.pointerId); stage.classList.add('is-drag');
                const mv = ev => { V.x = ev.clientX - sx; V.y = ev.clientY - sy; place(); }, up = () => { stage.classList.remove('is-drag'); stage.removeEventListener('pointermove', mv); stage.removeEventListener('pointerup', up); };
                stage.addEventListener('pointermove', mv); stage.addEventListener('pointerup', up); });
        }
        const colorOf = id => COLORS[chosen.indexOf(id) % COLORS.length];
        const nameOf = id => readings.find(r => r.id === id)?.label || '';
        function paintList() {
            $('[data-txc-list]').innerHTML = readings.map(r => { const on = chosen.includes(r.id), i = chosen.indexOf(r.id); return `<div class="h-txc-r${on ? ' is-on' : ''}"><label><input type="checkbox" data-txc-pick="${r.id}" ${on ? 'checked' : ''} ${!on && chosen.length >= 4 ? 'disabled' : ''}><span class="h-txc-dot" style="background:${on ? COLORS[i % COLORS.length] : 'transparent'}"></span><span>${esc(r.label)}${r.created_at ? `<small class="muted">${esc(String(r.created_at).slice(0, 16).replace('T', ' '))}${r.words ? ` · ${esc(T('{n} mots', {n: String(r.words)}))}` : ''}</small>` : ''}</span></label>${on ? `<label class="h-txc-base" title="${esc(T('La référence : son découpage en lignes est gardé, les autres lectures sont comparées à elle'))}"><input type="radio" name="txc-base" data-txc-base="${r.id}" ${chosen[base] === r.id ? 'checked' : ''}>${esc(T('référence'))}</label>` : ''}</div>`; }).join('');
        }
        async function compute() {
            texts = await Promise.all(chosen.map(getBody));
            base = Math.min(base, chosen.length - 1);
            if (mode === 'word') parts = merge(texts, {base, loose}); else { stash(); rows = linesOf(texts, {base, loose}); attachMine(); }
            paint();
        }
        function paint() {
            dlg.querySelectorAll('[data-txc-mode]').forEach(b => { b.classList.toggle('is-active', b.dataset.txcMode === mode); b.setAttribute('aria-checked', String(b.dataset.txcMode === mode)); });
            const out = $('[data-txc-out]');
            if (chosen.length < 2) { out.innerHTML = `<p class="muted">${esc(T('Coche au moins deux lectures à gauche.'))}</p>`; $('[data-txc-count]').textContent = ''; return; }
            if (mode === 'word') {
                const n = parts.filter(p => !p.same).length; $('[data-txc-count]').textContent = n ? T('{n} passages diffèrent', {n: String(n)}) : T('Les lectures disent la même chose');
                out.innerHTML = `<div class="h-txc-text">${parts.map((p, i) => (p.same ? esc(p.text).replace(/\n/g, '<br>') : `<button type="button" class="h-txc-d${p.custom !== undefined ? ' is-custom' : ''}" data-txc-d="${i}" style="--c:${p.custom !== undefined ? '#6b6f76' : colorOf(chosen[p.pick])}" title="${esc(T('Les autres lectures : {v}', {v: p.opts.map((o, r) => `${nameOf(chosen[r])} : « ${o || '—'} »`).join(' · ')}))}">${esc(p.custom ?? p.opts[p.pick]) || '<i>∅</i>'}</button>`)).join(' ')}</div>`;
            } else {
                const n = rows.filter(r => !r.sep && new Set(r.variants.map(v => key(v, loose).trim())).size > 1).length; $('[data-txc-count]').textContent = T('{n} lignes diffèrent sur {m}', {n: String(n), m: String(rows.filter(r => !r.sep).length)});
                let num = 0;
                out.innerHTML = `<table class="h-txc-lines${ma ? ' has-me' : ''}"><tbody>${rows.map((r, i) => { if (r.sep) return `<tr class="h-txc-sep"><td class="h-txc-n"></td><td>${esc(r.variants[base])}</td></tr>`;
                    num++; const differ = new Set(r.variants.map(v => key(v, loose).trim())).size > 1, pk = pickOf(r);
                    const reads = differ || ma ? r.variants.map((v, k) => `<label class="h-txc-lv${pk === k ? ' is-on' : ''}" style="--c:${colorOf(chosen[k])}"><input type="radio" name="txc-l${i}" data-txc-line="${i}|${k}" ${pk === k ? 'checked' : ''}><span>${k === base || !differ ? esc(v) : diffWords(r.variants[base], v, loose).map(x => (x.d ? `<mark>${esc(x.w)}</mark>` : esc(x.w))).join(' ')}</span></label>`).join('') : esc(r.variants[base]);
                    const me = !ma ? '' : `<div class="h-txc-lv h-txc-me${pk === -1 ? ' is-on' : ''}" style="--c:${ME_COLOR}"><label class="h-txc-me-tag" title="${esc(T('Ma lecture'))}"><input type="radio" name="txc-l${i}" data-txc-line="${i}|-1" ${pk === -1 ? 'checked' : ''} aria-label="${esc(T('Ma lecture, ligne {n}', {n: String(num)}))}">✍<span> ${esc(T('Ma lecture'))}</span></label>`
                        + `<span class="h-txc-me-f"><span class="h-txc-me-bk" aria-hidden="true">${backdrop(r)}</span><input type="text" data-txc-me="${i}" value="${esc(r.my.text)}" placeholder="${esc(T('ta lecture de la ligne {n}…', {n: String(num)}))}" aria-label="${esc(T('Ma lecture, ligne {n}', {n: String(num)}))}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="next"></span>`
                        + `<button type="button" class="h-txc-mecp" data-txc-mecp="${i}" title="${esc(T('Copier la lecture choisie dans ma lecture'))}">⇣<span> ${esc(T('copier'))}</span></button></div>`;
                    return `<tr class="${differ ? 'is-diff' : ''}"><td class="h-txc-n">${num}</td><td>${reads}${me}</td></tr>`; }).join('')}</tbody></table>`;
            }
        }
        /* ✍ ma lecture : la relier aux lignes (même ligne de la référence, sinon même place), la garder au brouillon, la remettre */
        const ME_COLOR = '#b26a00';
        const pickOf = r => (r.pick === -1 && !ma ? base : r.pick);
        function attachMine() {
            const pool = mine.slice(), take = k => pool.splice(k, 1)[0];
            rows.forEach(r => { r.ref = r.variants[base]; r.sep = isSep(r.ref); r.my = null; });
            rows.forEach(r => { if (r.sep) return; const k = pool.findIndex(e => e.ref === r.variants[base]); if (k >= 0) r.my = take(k); });
            rows.forEach((r, i) => { if (r.sep || r.my) return; const k = pool.findIndex(e => e.i === i); if (k >= 0) r.my = take(k); });
            rows.forEach(r => { if (r.sep) return; r.my = {text: r.my?.text || '', on: !!r.my?.on}; if (r.my.on) { r.prev = base; r.pick = -1; } });
        }
        function stash() {
            if (!rows.length) return;
            mine = rows.map((r, i) => (r.sep || !r.my || (!r.my.text && !r.my.on) ? null : {i, ref: r.ref, text: r.my.text, on: r.pick === -1})).filter(Boolean);
        }
        let draftT = 0;
        const saveDraft = () => { clearTimeout(draftT); stash(); try { if (hasMine()) localStorage.setItem(DRAFT, JSON.stringify({at: Date.now(), mine, saved: savedBody})); else localStorage.removeItem(DRAFT); } catch (_) {} };
        const saveDraftSoon = () => { clearTimeout(draftT); draftT = setTimeout(saveDraft, 300); };
        /** le fond du champ : les mots qu'aucune lecture ne dit, surlignés (le texte tapé reste au-dessus, aligné) */
        function backdrop(r) {
            const text = r.my?.text || ''; if (!text) return '';
            const marks = myDiff(r.variants, text, loose); let w = 0;
            return text.split(/(\s+)/).map(x => (!x ? '' : /^\s+$/.test(x) ? esc(x) : (marks[w++]?.d ? `<mark>${esc(x)}</mark>` : esc(x)))).join('');
        }
        /** ce que dit ma lecture d'une ligne change : le champ, le fond, la case cochée (sans tout redessiner : le curseur reste) */
        function setMine(i, text, {select = true} = {}) {
            const r = rows[i]; if (!r || r.sep) return; r.my = r.my || {text: '', on: false}; r.my.text = text;
            if (select && text.trim() && r.pick !== -1) { r.prev = r.pick; r.pick = -1; }
            if (!text.trim() && r.pick === -1) r.pick = r.prev ?? base; // vidée : la lecture choisie avant
            r.my.on = r.pick === -1;
            const f = dlg.querySelector(`[data-txc-me="${i}"]`);
            if (f) { if (f.value !== text) f.value = text; const bk = f.parentNode.querySelector('.h-txc-me-bk'); bk.innerHTML = backdrop(r); bk.scrollLeft = f.scrollLeft;
                const td = f.closest('td'); td.querySelectorAll('[data-txc-line]').forEach(x => { const on = Number(x.dataset.txcLine.split('|')[1]) === r.pick; x.checked = on; x.closest('.h-txc-lv').classList.toggle('is-on', on); }); }
            saveDraftSoon();
        }
        const fields = () => [...dlg.querySelectorAll('[data-txc-me]')];
        const goField = (f, step) => { const all = fields(), to = all[all.indexOf(f) + step]; if (!to) return false; to.focus(); const n = to.value.length; try { to.setSelectionRange(n, n); } catch (_) {} to.scrollIntoView?.({block: 'nearest'}); return true; };
        /** tout le texte de ma lecture : mes lignes, et pour les autres la lecture choisie (une lecture complète, gardée dans 🕘 Versions) */
        const myBody = () => rows.map(r => (r.sep ? r.variants[base] : r.my?.text.trim() ? r.my.text.trim() : (r.custom ?? r.variants[pickOf(r) === -1 ? base : pickOf(r)]))).join('\n').trim();
        /** ✍ en mettant dans le texte ou en fermant : ma lecture gardée comme une version (réglage « Garder chaque nouvelle lecture »), une fois */
        async function keepMine() {
            if (!ma || !keepOn() || !rows.length) return; stash(); if (!hasMine()) return;
            const body = myBody(); if (!body || body === savedBody) return; savedBody = body;
            try { await ctx.post('save_act_transcription_version', {act_id: ctx.actId, label: '✍ Ma lecture (Comparer)', body, data: {zones: [], people: [], meta: {from: T('Comparer les lectures')}}, auto: 0, source: 'mine'}); A().toast(T('Ma lecture gardée dans 🕘 Versions.')); }
            catch (err) { savedBody = ''; A().toast(err.message, 'error'); }
        }
        const closeDlg = () => { saveDraft(); const k = keepMine().then(saveDraft); dlg.close(); dlg.parentNode?.removeChild(dlg); return k; };
        const merged = () => (mode === 'word' ? textOf(parts) : rows.map(r => (pickOf(r) === -1 ? r.my?.text.trim() || '' : r.custom ?? r.variants[pickOf(r)])).join('\n'));
        function variantMenu(btn, i) {
            const p = parts[i], items = p.opts.map((o, r) => ({icon: r === p.pick && p.custom === undefined ? '✓' : '', label: `${o || T('(rien)')} — ${nameOf(chosen[r])}`, run: () => { p.pick = r; delete p.custom; paint(); }}));
            items.push('-', {icon: '✎', label: T('Écrire autrement…'), run: async () => { const v = await A().askText({title: T('Ce passage'), value: p.custom ?? p.opts[p.pick] ?? '', okLabel: T('Valider')}); if (v === null || v === undefined) return; p.custom = v.trim(); paint(); }});
            window.LCNDA_UI?.menuAt?.(btn, items, {title: T('Les lectures disent')});
        }
        dlg.addEventListener('click', async e => {
            if (e.target.closest('[data-txc-x]')) return closeDlg();
            if (e.target.closest('[data-txc-maq]')) return toggleMa(!ma);
            const cp = e.target.closest('[data-txc-mecp]'); if (cp) return copyInto(Number(cp.dataset.txcMecp));
            const d = e.target.closest('[data-txc-d]'); if (d) return variantMenu(d, Number(d.dataset.txcD));
            const ip = e.target.closest('[data-txc-ipage]'); if (ip) return showPage(Number(ip.dataset.txcIpage));
            const zb = e.target.closest('[data-txc-z]'); if (zb) { const f = Number(zb.dataset.txcZ); if (!f) return fitImg(); return zoomAt(f > 0 ? 1.3 : 1 / 1.3, stage.clientWidth / 2, stage.clientHeight / 2); }
            const md = e.target.closest('[data-txc-mode]'); if (md) { mode = md.dataset.txcMode; wr(MODE_KEY, mode); return compute(); }
            if (e.target.closest('[data-txc-maj]')) { if (mode === 'word') majority(parts, base, loose); else rows.forEach(r => { const cnt = new Map(); r.variants.forEach((v, k) => { const kk = key(v, loose).trim(); cnt.set(kk, [...(cnt.get(kk) || []), k]); }); let best = null; cnt.forEach(ks => { if (!best || ks.length > best.length || (ks.length === best.length && ks.includes(base))) best = ks; }); r.pick = best.includes(base) ? base : best[0]; if (r.my) r.my.on = false; }); saveDraft(); return paint(); }
            if (e.target.closest('[data-txc-ref]')) { parts.forEach(p => { p.pick = base; delete p.custom; }); rows.forEach(r => { r.pick = base; if (r.my) r.my.on = false; }); saveDraft(); return paint(); }
            if (e.target.closest('[data-txc-apply]')) { const txt = merged(); if (!txt.trim()) return A().toast(T('Le texte fusionné est vide.'), 'error'); await keepMine(); await ctx.apply(txt, T('Avant « Fusion des lectures »')); clearTimeout(draftT); try { localStorage.removeItem(DRAFT); } catch (_) {} dlg.close(); dlg.parentNode?.removeChild(dlg); return; }
            if (e.target.closest('[data-txc-save]')) { const txt = merged(); try { await ctx.post('save_act_transcription_version', {act_id: ctx.actId, label: labelOf('merge', chosen.map(nameOf).map(x => x.replace(/^\S+\s/, '')).join(' + ').slice(0, 80)), body: txt, data: {zones: [], people: []}, auto: 0, source: 'merge'}); A().toast(T('Fusion gardée dans 🕘 Versions (une lecture de plus).')); } catch (err) { A().toast(err.message, 'error'); } }
        });
        dlg.addEventListener('change', e => {
            const pk = e.target.closest('[data-txc-pick]'), bs = e.target.closest('[data-txc-base]'), ln = e.target.closest('[data-txc-line]');
            if (pk) { const id = Number(pk.dataset.txcPick), refId = chosen[base]; if (pk.checked && !chosen.includes(id)) chosen.push(id); if (!pk.checked) chosen = chosen.filter(x => x !== id); base = Math.max(0, chosen.indexOf(refId)); paintList(); compute(); }
            if (bs) { base = chosen.indexOf(Number(bs.dataset.txcBase)); compute(); }
            if (ln) { const [i, k] = ln.dataset.txcLine.split('|').map(Number), r = rows[i]; if (k === -1 && r.pick !== -1) r.prev = r.pick; r.pick = k; if (r.my) r.my.on = k === -1; saveDraft(); paint(); if (k === -1) dlg.querySelector(`[data-txc-me="${i}"]`)?.focus(); }
            if (e.target.closest('[data-txc-maon]')) toggleMa(e.target.checked);
            if (e.target.closest('[data-txc-loose]')) { loose = e.target.checked; compute(); }
            if (e.target.closest('[data-txc-imgon]')) { try { localStorage.setItem(IMG_KEY, e.target.checked ? '1' : '0'); } catch (_) {} $('[data-txc-img]').hidden = !e.target.checked; dlg.querySelector('.h-txc-split').classList.toggle('has-img', e.target.checked); if (e.target.checked) requestAnimationFrame(fitImg); }
            if (e.target.closest('[data-txc-keepon]')) { try { localStorage.setItem(KEEP_KEY, e.target.checked ? '1' : '0'); } catch (_) {} }
        });
        dlg.addEventListener('cancel', e => { e.preventDefault(); closeDlg(); });
        /* ✍ ma lecture : taper la choisit ; Tab, Entrée, ↓ : la ligne suivante ; Maj+Tab, ↑ : la précédente */
        dlg.addEventListener('input', e => { const f = e.target.closest('[data-txc-me]'); if (f) setMine(Number(f.dataset.txcMe), f.value); });
        dlg.addEventListener('scroll', e => { const f = e.target.closest?.('[data-txc-me]'); if (f) f.parentNode.querySelector('.h-txc-me-bk').scrollLeft = f.scrollLeft; }, true);
        dlg.addEventListener('keydown', e => {
            const f = e.target.closest?.('[data-txc-me]'); if (!f || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
            const step = e.key === 'Enter' || e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey) ? 1 : e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey) ? -1 : 0;
            if (step && (goField(f, step) || e.key !== 'Tab')) e.preventDefault();
        });
        function toggleMa(on) {
            ma = !!on; setMa(ma); const cb = $('[data-txc-maon]'); if (cb) cb.checked = ma; $('[data-txc-maq]').setAttribute('aria-pressed', String(ma));
            if (ma && mode !== 'line') { mode = 'line'; return compute().then(() => fields()[0]?.focus()); }
            paint(); if (ma) fields()[0]?.focus();
        }
        /** ⇣ copier : la lecture choisie de cette ligne dans ma lecture (ce que j'avais tapé : ↶ Annuler) */
        function copyInto(i) {
            const r = rows[i]; if (!r || r.sep) return; const from = r.pick === -1 ? (r.prev ?? base) : r.pick, txt = r.custom ?? r.variants[from] ?? '', old = r.my?.text || '', oldPick = r.pick;
            setMine(i, txt); const f = dlg.querySelector(`[data-txc-me="${i}"]`); f?.focus();
            if (old.trim() && old !== txt) A().undoToast?.(T('Ma lecture de la ligne {n} remplacée', {n: String(rows.slice(0, i + 1).filter(x => !x.sep).length)}), {icon: '✍',
                undo: () => { setMine(i, old); if (dlg.isConnected) { rows[i].pick = oldPick; rows[i].my.on = oldPick === -1; paint(); } saveDraft(); }, redo: () => setMine(i, txt)});
        }
        dlg.querySelector('.h-txc-split').classList.toggle('has-img', !!imgs.length && imgOn());
        paintList(); await compute();
        if (ma && hasMine()) A().toast?.(T('Ta lecture reprise là où tu l’avais laissée.'));
        return dlg;
    }

    ext.txCompare = {tokens, align, merge, majority, textOf, linesOf, diffWords, myDiff, isSep, labelOf, keepOn, maOn, open, KEEP_KEY, MA_KEY};
    if (typeof module === 'object' && module.exports) module.exports = ext.txCompare;
    if (typeof document !== 'undefined' && !document.getElementById('h-txc-css')) { const st = document.createElement('style'); st.id = 'h-txc-css'; st.textContent = `
.h-txc{width:min(1300px,96vw);max-width:none}
.h-txc-body{display:grid;grid-template-columns:290px minmax(0,1fr);gap:14px;min-height:0}
.h-txc-side h4{margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted,#555)}
.h-txc-r{border:1.5px solid var(--line,#c9ced8);padding:6px 8px;margin-bottom:6px;display:grid;gap:4px;font-size:13px}.h-txc-r.is-on{border-color:var(--ink,#111)}
.h-txc-r>label{display:flex;gap:6px;align-items:flex-start}.h-txc-r small{display:block}
.h-txc-dot{width:12px;height:12px;border-radius:50%;border:1.5px solid var(--ink,#111);flex:none;margin-top:3px}
.h-txc-base{font-size:12px;color:var(--muted,#555);display:flex;gap:4px;align-items:center;margin-left:26px}
.h-txc-keep{margin-top:10px;font-size:12.5px}
.h-txc-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px}.h-txc-count{font-size:12.5px;color:var(--muted,#555)}
.h-txc-split{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.h-txc-split.has-img{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.h-txc-img{display:grid;grid-template-rows:auto 1fr;gap:6px;min-width:0}.h-txc-img[hidden]{display:none}.h-txc-imgbar{display:flex;gap:4px;flex-wrap:wrap;align-items:center}
.h-txc-stage{position:relative;overflow:hidden;height:60vh;border:1.5px solid var(--line,#c9ced8);background:#2b2b2b;cursor:grab;touch-action:none}.h-txc-stage.is-drag{cursor:grabbing}
.h-txc-stage img{position:absolute;left:0;top:0;transform-origin:0 0;max-width:none;user-select:none}
.h-txc-out{max-height:60vh;overflow:auto;border:1.5px solid var(--line,#c9ced8);padding:12px;background:var(--surface,#fff)}
.h-txc-text{font-family:Georgia,"Times New Roman",serif;font-size:16px;line-height:2}
.h-txc-d{font:inherit;border:0;border-bottom:3px solid var(--c);background:color-mix(in srgb,var(--c) 14%,transparent);padding:0 3px;cursor:pointer;color:inherit;min-height:0}
.h-txc-d:hover,.h-txc-d:focus-visible{background:color-mix(in srgb,var(--c) 28%,transparent);outline:2px solid var(--c)}
.h-txc-d.is-custom{border-bottom-style:dashed}
.h-txc-lines{width:100%;border-collapse:collapse;font-family:Georgia,serif;font-size:15px}.h-txc-lines td{border-bottom:1px solid var(--line,#e4e6ea);padding:5px 6px;vertical-align:top}
.h-txc-n{color:var(--muted,#888);font:12px system-ui;width:32px}
.h-txc-lines tr.is-diff{background:rgba(212,168,0,.06)}
.h-txc-lv{display:flex;gap:6px;align-items:flex-start;padding:3px 6px;border-left:4px solid var(--c);margin:2px 0;cursor:pointer}.h-txc-lv.is-on{background:color-mix(in srgb,var(--c) 12%,transparent)}
.h-txc-lv mark{background:color-mix(in srgb,var(--c) 30%,transparent);color:inherit}
.h-txc-headbtns{display:flex;gap:8px;align-items:center;flex:none}.h-txc-maq[aria-pressed="true"]{background:color-mix(in srgb,#b26a00 16%,transparent);border-color:#b26a00}
.h-txc-sep td{text-align:center;color:var(--muted,#777);font:600 12px system-ui;letter-spacing:.06em;background:transparent}
.h-txc-me{align-items:center;border-left-style:dashed}
.h-txc-me-tag{display:flex;gap:4px;align-items:center;flex:none;font:600 12px system-ui;color:var(--muted,#666);cursor:pointer;white-space:nowrap}
.h-txc-me-f{position:relative;flex:1;min-width:0;display:block}
.h-txc .h-txc-me-f input,.h-txc-me-bk{font:inherit;line-height:1.5;padding:1px 4px;margin:0;border:0;border-bottom:1.5px solid transparent;border-radius:0;box-sizing:border-box;width:100%;letter-spacing:normal;word-spacing:normal;white-space:pre;min-height:0;height:auto;box-shadow:none}
.h-txc-me-bk{position:absolute;left:0;top:0;bottom:0;overflow:hidden;color:transparent;pointer-events:none}
.h-txc-me-bk mark{color:transparent;background:color-mix(in srgb,var(--c) 30%,transparent);padding:0;border-radius:0}
.h-txc .h-txc-me-f input{position:relative;display:block;background:transparent;color:inherit;border-bottom-color:color-mix(in srgb,currentColor 30%,transparent);border-bottom-style:dashed;outline:none}
.h-txc .h-txc-me-f input:focus{border-bottom:1.5px solid var(--c);background:color-mix(in srgb,var(--c) 6%,transparent)}
.h-txc .h-txc-me-f input::placeholder{color:var(--muted,#888);opacity:.7;font-style:italic}
.h-txc-mecp{flex:none;font:12px system-ui;border:1px solid color-mix(in srgb,currentColor 25%,transparent);background:transparent;color:inherit;padding:1px 7px;border-radius:999px;cursor:pointer;min-height:0;opacity:.75}
.h-txc-mecp:hover,.h-txc-mecp:focus-visible{opacity:1;border-color:var(--c)}
@media (max-width:600px){.h-txc-lines{font-size:16px}.h-txc-me-tag>span,.h-txc-mecp>span,.h-txc-maq>span{display:none}.h-txc-lines td{padding:4px 3px}.h-txc-n{width:22px}.h-txc-lv{padding:3px 4px}}
@media (max-width:860px){.h-txc-body,.h-txc-split.has-img{grid-template-columns:1fr}.h-txc-stage{height:40vh}}
`; document.head.appendChild(st); }
})();
