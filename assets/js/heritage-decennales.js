/* LCNDA — 📑 Lire une table décennale (F13) : la photo d'une table décennale devient un dépouillement « Table décennale »
 * (Listes → Dépouillements, Recherche → Dépouillement d'archive), ligne par ligne, avec les fiches proposées.
 * Construit sur ce qui existe :
 *  - l'image : la fenêtre unique des médias (mediaField / openMediaPicker) ;
 *  - la lecture : Tesseract (A().loadOcrEngine, moteur vérifié par son empreinte) pour une table imprimée, le lecteur
 *    d'écriture manuscrite (HTR, api htr_recognize avec la bande de la case) s'il est installé ; sinon la saisie se fait à
 *    la main, dans une grille rapide, la bande de la ligne sous les yeux ;
 *  - les dates : comprises comme dans un champ de date (C4, UI.readDate), l'année prise dans la table quand elle manque ;
 *  - l'enregistrement : les actions des dépouillements (save_archive_digest avec le modèle « table », link_archive_digest_media,
 *    save_archive_digest_person, save_archive_digest_transcription_line avec la zone de chaque ligne sur l'image) ;
 *  - les fiches : le menu de choix unique (relier) ou « ＋ Créer la fiche » (avec l'événement), toujours avec « ↶ Annuler ».
 * Les 5 étapes : ① l'image ② les colonnes (glisser, gabarits connus) ③ la lecture ④ la relecture ⑤ créer.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const P = () => window.LCNDA_PICKER || window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const toast = (...a) => A().toast(...a);
    const plural = (n, w, many) => (A().plural ? A().plural(n, w, many) : `${n} ${n > 1 ? (many || w + 's') : w}`);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    const KINDS = [['naissance', 'Naissances', 'Naissance'], ['mariage', 'Mariages', 'Mariage'], ['deces', 'Décès', 'Décès'], ['mixte', 'Plusieurs sortes (colonne « sorte d’acte »)', '']];
    const ACT = {naissance: 'Naissance', mariage: 'Mariage', deces: 'Décès', autre: 'Autre'};
    const ROLES = [['nom', 'Nom'], ['prenoms', 'Prénoms'], ['date', 'Date'], ['sorte', 'Sorte d’acte'], ['annee', 'Année'], ['notes', 'N° / notes'], ['ignore', 'À ignorer']];
    const roleLabel = r => (ROLES.find(x => x[0] === r) || ['', r])[1];
    /** gabarits de tables connus : colonnes (début, fin en fraction de la largeur, rôle) */
    const TEMPLATES = [
        {key: 'npd', label: 'Nom · Prénoms · Date (la plus courante)', cols: [[0, .36, 'nom'], [.36, .72, 'prenoms'], [.72, 1, 'date']]},
        {key: 'npds', label: 'Nom · Prénoms · Date · Sorte d’acte (table mixte)', cols: [[0, .3, 'nom'], [.3, .6, 'prenoms'], [.6, .84, 'date'], [.84, 1, 'sorte']]},
        {key: 'nnpd', label: 'N° · Nom · Prénoms · Date', cols: [[0, .09, 'notes'], [.09, .4, 'nom'], [.4, .72, 'prenoms'], [.72, 1, 'date']]},
        {key: 'anpd', label: 'Année · Nom · Prénoms · Date', cols: [[0, .12, 'annee'], [.12, .42, 'nom'], [.42, .72, 'prenoms'], [.72, 1, 'date']]},
        {key: 'npdn', label: 'Nom · Prénoms · Date · Observations', cols: [[0, .3, 'nom'], [.3, .58, 'prenoms'], [.58, .8, 'date'], [.8, 1, 'notes']]},
    ];
    const MY_KEY = 'lcnda-decennale-gabarits';
    const myTemplates = () => { try { const v = JSON.parse(localStorage.getItem(MY_KEY) || '[]'); return Array.isArray(v) ? v.filter(t => t && typeof t.label === 'string' && Array.isArray(t.cols)).slice(0, 30) : []; } catch (_) { return []; } };
    const saneCols = cols => (Array.isArray(cols) ? cols : []).map(c => [clamp(Number(c[0]) || 0, 0, 1), clamp(Number(c[1]) || 0, 0, 1), ROLES.some(r => r[0] === c[2]) ? c[2] : 'ignore']).filter(c => c[1] - c[0] > .01).slice(0, 12);

    /* ═════════ Dates : comprises comme dans un champ de date (C4), avec l'année de la table quand elle manque ═════════ */
    function periodYears(text) {
        const t = String(text || ''); const ys = (t.match(/\b(1[5-9]\d{2}|20\d{2})\b/g) || []).map(Number);
        const rep = [...t.matchAll(/\ban\s+([ivx]+|\d{1,2})\b/gi)].map(m => UI().readDate?.(`an ${m[1]}`)).filter(r => r?.ok).map(r => { const y = Number((r.extra || '').match(/(\d{4})\D+\d{4}/)?.[1]); return y ? y + 1 : 0; }).filter(Boolean);
        const all = [...ys, ...rep]; if (!all.length) return null;
        return {y1: Math.min(...all), y2: Math.max(...all)};
    }
    const hasYear = s => /\b\d{3,4}\b|\ban\s+[ivx\d]+/i.test(String(s || ''));
    /** la date d'une ligne : {text (complétée), ok, label, warn} ; prevYear = l'année de la ligne d'avant (les tables sont rangées par année) */
    function rowDate(raw, {annee = '', prevYear = 0, period = null} = {}) {
        let t = String(raw || '').trim().replace(/\s+/g, ' ').replace(/[,;]$/, '');
        if (!t) return {text: '', ok: false, empty: true};
        let completed = false;
        if (!hasYear(t)) {
            const y = Number(String(annee).match(/\d{4}/)?.[0]) || prevYear || (period && period.y1 === period.y2 ? period.y1 : 0);
            if (y) { t = /^\d{1,2}[/.-]\d{1,2}$/.test(t) ? `${t}/${y}` : `${t} ${y}`; completed = true; }
        }
        const r = UI().readDate ? UI().readDate(t) : {ok: true, label: t};
        if (!r) return {text: t, ok: false, empty: true};
        if (!r.ok) return {text: t, ok: false, warn: r.text || 'date à vérifier', completed};
        const y = Number((t.match(/\b(\d{4})\b/) || [])[1]) || 0;
        let warn = '';
        if (!completed && !hasYear(raw)) warn = 'année à préciser';
        if (period && y && (y < period.y1 - 1 || y > period.y2 + 1) && !/\ban\s/i.test(t)) warn = `hors de la période de la table (${period.y1}–${period.y2})`;
        return {text: t, ok: true, label: r.label, extra: r.extra || '', warn, completed, year: y};
    }
    ext.decennaleRowDate = rowDate; ext.decennalePeriod = periodYears; // pour les tests

    /* ═════════ Les lignes de la table : repérées dans l'image (bandes d'encre séparées par du blanc) ═════════ */
    function detectRows(img, top, bottom, x0 = 0, x1 = 1) {
        const iw = img.naturalWidth, ih = img.naturalHeight, w = 700, sx = x0 * iw, sy = top * ih, sw = Math.max(1, (x1 - x0) * iw), sh = Math.max(1, (bottom - top) * ih);
        const k = w / sw, h = Math.max(20, Math.round(sh * k));
        const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', {willReadFrequently: true});
        g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
        const d = g.getImageData(0, 0, w, h).data, lum = new Float32Array(w * h);
        let sum = 0; for (let i = 0; i < w * h; i++) { lum[i] = d[i * 4] * .299 + d[i * 4 + 1] * .587 + d[i * 4 + 2] * .114; sum += lum[i]; }
        const mean = sum / (w * h), thr = mean * .62;
        const ink = new Float32Array(h);
        for (let y = 0; y < h; y++) { let n = 0; for (let x = 0; x < w; x++) if (lum[y * w + x] < thr) n++; ink[y] = n / w; }
        // un trait de règle (presque toute la largeur) n'est pas une ligne d'écriture
        const sorted = [...ink].filter(v => v < .6).sort((a, b) => a - b), p90 = sorted[Math.floor(sorted.length * .9)] || 0;
        const t = Math.max(.006, p90 * .18);
        const runs = []; let start = -1;
        for (let y = 0; y <= h; y++) { const on = y < h && ink[y] > t && ink[y] < .6; if (on && start < 0) start = y; if (!on && start >= 0) { runs.push([start, y]); start = -1; } }
        const merged = []; runs.forEach(r => { const last = merged[merged.length - 1]; if (last && r[0] - last[1] <= 2) last[1] = r[1]; else merged.push([...r]); });
        const hs = merged.map(r => r[1] - r[0]).sort((a, b) => a - b), med = hs[Math.floor(hs.length / 2)] || 0;
        const text = merged.filter(r => r[1] - r[0] >= Math.max(4, med * .35));
        if (!text.length) return [];
        const rows = text.map((r, i) => { const prev = text[i - 1], next = text[i + 1]; const y0 = prev ? (prev[1] + r[0]) / 2 : Math.max(0, r[0] - (r[1] - r[0]) * .4); const y1 = next ? (r[1] + next[0]) / 2 : Math.min(h, r[1] + (r[1] - r[0]) * .4); return [y0, y1]; });
        return rows.map(([y0, y1]) => ({y0: top + (y0 / h) * (bottom - top), y1: top + (y1 / h) * (bottom - top)}));
    }
    const evenRows = (top, bottom, n) => Array.from({length: n}, (_, i) => ({y0: top + (bottom - top) * i / n, y1: top + (bottom - top) * (i + 1) / n}));
    ext.decennaleDetectRows = detectRows;

    /** une case (ou toute une ligne) de l'image dans un canvas, agrandie pour la lecture */
    function cropCanvas(img, x0, y0, x1, y1, {minH = 0, maxW = 2600, gray = false} = {}) {
        const iw = img.naturalWidth, ih = img.naturalHeight, sx = x0 * iw, sy = y0 * ih, sw = Math.max(1, (x1 - x0) * iw), sh = Math.max(1, (y1 - y0) * ih);
        let k = minH ? clamp(minH / sh, 1, 4) : 1; if (sw * k > maxW) k = maxW / sw;
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); if (gray) g.filter = 'grayscale(1) contrast(1.3)';
        g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height); c._k = k; c._sx = sx; c._sy = sy; return c;
    }
    const canvasB64 = c => new Promise(ok => c.toBlob(b => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.readAsDataURL(b); }, 'image/jpeg', .92));

    /* ═════════ L'assistant ═════════ */
    async function open(opts = {}) {
        document.querySelector('dialog.h-td-dlg')?.close();
        const td = {step: 1, media: null, img: null, place: null, period: opts.period || '', kind: opts.kind || 'naissance', writing: 'print', lang: 'fra', service: '', cote: '',
            cols: TEMPLATES[0].cols.map(c => [...c]), template: 'npd', top: .08, bottom: .96, left: .02, right: .98, rows: [], cells: [], read: '', digestId: 0, created: null, cur: 0, busy: false, stop: false};
        const dlg = document.createElement('dialog'); dlg.className = 'modal modal-xl h-td-dlg';
        dlg.innerHTML = `<form method="dialog" class="h-td-form" novalidate>
            <div class="modal-head"><div><span class="eyebrow">DÉPOUILLEMENTS · TABLE DÉCENNALE</span><h2>📑 Lire une table décennale</h2></div><button class="icon-button" type="button" data-td-close aria-label="Fermer">×</button></div>
            <ol class="h-td-steps" aria-label="Les étapes">${['L’image', 'Les colonnes', 'La lecture', 'La relecture', 'Créer'].map((l, i) => `<li data-td-st="${i + 1}"><span>${i + 1}</span>${l}</li>`).join('')}</ol>
            <div class="h-td-body" data-td-body></div>
            <div class="modal-actions"><button type="button" class="button secondary" data-td-cancel>Annuler</button><span class="spacer"></span><button type="button" class="button secondary" data-td-back>← Retour</button><button type="button" class="button" data-td-next>Suivant →</button></div>
        </form>`;
        document.body.appendChild(dlg); dlg.showModal();
        const $ = s => dlg.querySelector(s), body = $('[data-td-body]'), form = $('form');
        const ac = new AbortController(), sig = {signal: ac.signal};
        const period = () => periodYears(td.period);
        const close = async () => {
            if (td.busy) { td.stop = true; }
            if (!td.digestId && td.cells.some(c => c.nom || c.prenoms) && !await A().confirmBox('Ce qui a été lu ou saisi n’est pas encore dans un dépouillement.', {title: 'Fermer l’assistant ?', okLabel: 'Fermer sans créer', danger: false})) return;
            dlg.close();
        };
        dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
        dlg.addEventListener('close', () => { ac.abort(); dlg.remove(); opts.onClose?.(td.digestId); });
        $('[data-td-close]').addEventListener('click', close, sig); $('[data-td-cancel]').addEventListener('click', close, sig);
        $('[data-td-back]').addEventListener('click', () => { if (td.busy) return; go(td.step === 4 && td.read === 'manual' ? 2 : td.step - 1); }, sig);
        form.addEventListener('submit', e => { e.preventDefault(); }, sig); // la touche Entrée ne valide pas l'étape (la grille s'en sert)
        $('[data-td-next]').addEventListener('click', () => next(), sig);

        async function loadImg(m) {
            td.media = m ? {id: Number(m.id), title: m.title || '', filename: m.filename, thumb: m.thumb || (m.filename ? `media/${encodeURIComponent(m.thumbnail || m.filename)}` : '')} : null; td.img = null;
            if (!td.media?.filename) return;
            td.img = await new Promise(ok => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = `media/${encodeURIComponent(td.media.filename)}`; });
            if (!td.img) toast('L’image n’a pas pu être ouverte.', 'error');
            td.rows = []; td.cells = []; td.read = '';
        }
        if (opts.mediaId || opts.media) {
            let m = opts.media; if (!m?.filename) { try { const r = await api('picker_search', {kind: 'media', ids: String(opts.mediaId || opts.media?.id)}); m = (r.groups || []).flatMap(g => g.items || [])[0]; } catch (_) {} }
            if (m) await loadImg(m);
        }

        function paintSteps() {
            dlg.querySelectorAll('[data-td-st]').forEach(li => { const n = Number(li.dataset.tdSt); li.classList.toggle('is-active', n === td.step); li.classList.toggle('is-done', n < td.step); });
            $('[data-td-back]').hidden = td.step === 1 || td.step === 5 && !!td.digestId;
            const nx = $('[data-td-next]');
            nx.textContent = td.step === 3 ? 'Relire →' : td.step === 4 ? 'Suivant : créer →' : td.step === 5 ? (td.digestId ? 'Fermer' : '＋ Créer le dépouillement') : 'Suivant →';
            nx.disabled = td.busy; $('[data-td-cancel]').hidden = td.step === 5 && !!td.digestId;
        }
        function go(n) { td.step = clamp(n, 1, 5); paintSteps(); [null, step1, step2, step3, step4, step5][td.step](); body.scrollTop = 0; }
        async function next() {
            if (td.busy) return;
            const U = UI();
            if (td.step === 1) {
                const errs = [];
                if (!td.media || !td.img) errs.push([form.elements.td_media, 'Choisis la photo de la table.']);
                if (td.period.trim() && !period()) errs.push([form.elements.td_period, 'Je ne trouve pas d’année : écris par exemple « 1853-1862 ».']);
                if (errs.length) { if (U.formErrors) U.formErrors(form, errs); else toast(errs[0][1], 'error'); return; }
                return go(2);
            }
            if (td.step === 2) {
                if (!td.cols.some(c => c[2] === 'nom' || c[2] === 'prenoms')) return toast('Donne au moins une colonne « Nom » ou « Prénoms ».', 'error');
                if (!td.rows.length) td.rows = detectRows(td.img, td.top, td.bottom, td.left, td.right);
                if (!td.rows.length) td.rows = evenRows(td.top, td.bottom, 20);
                return go(3);
            }
            if (td.step === 3) { if (!td.cells.length) startManual(); return go(4); }
            if (td.step === 4) { readGrid(); if (!td.cells.some(c => c.nom || c.prenoms)) return toast('Aucune ligne avec un nom : saisis au moins un nom, ou reviens à la lecture.', 'error'); return go(5); }
            if (td.step === 5) { if (td.digestId) { dlg.close(); return; } return create(); }
        }

        /* ─── ① l'image et la table ─── */
        function step1() {
            const pk = P(), placeVal = td.place ? (td.place.id ? {id: td.place.id, title: td.place.title, kind: 'place'} : `txt:${td.place.title}`) : null;
            body.innerHTML = `<div class="h-td-s1">
                <div class="h-td-s1-form">
                    <div><span class="pk-lab">La photo de la table</span>${pk.mediaField ? pk.mediaField({name: 'td_media', types: ['image'], value: td.media, title: 'La photo de la table décennale', okLabel: 'Prendre cette photo'}) : ''}<small class="muted">Une page (ou une double page) photographiée bien à plat ; une image de l’ordinateur entre dans les Médias.</small></div>
                    <div class="pk-host"><span class="pk-lab">Commune</span>${pk.pickerField ? pk.pickerField({name: 'td_place', kind: 'place', allowFree: true, value: placeVal}) : ''}</div>
                    <label>Période de la table<input name="td_period" value="${esc(td.period)}" placeholder="1853-1862, 1793-an X…" autocomplete="off"><small class="muted" data-td-period-help></small></label>
                    <label>Sorte d’actes<select name="td_kind">${KINDS.map(([k, l]) => `<option value="${k}" ${td.kind === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                    <div><span class="pk-lab">L’écriture</span><div class="segmented h-td-writing" role="group" aria-label="L’écriture de la table"><button type="button" data-td-writing="print" class="${td.writing === 'print' ? 'is-active' : ''}">🖨 Imprimée ou tapée</button><button type="button" data-td-writing="hand" class="${td.writing === 'hand' ? 'is-active' : ''}">✍ À la main</button></div></div>
                    <label data-td-langwrap>Langue<select name="td_lang">${[['fra', 'Français'], ['lat', 'Latin'], ['fra+lat', 'Français + latin'], ['eng', 'Anglais'], ['deu', 'Allemand'], ['ita', 'Italien'], ['spa', 'Espagnol']].map(([k, l]) => `<option value="${k}" ${td.lang === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                    <div class="h-td-two"><label>Archives<input name="td_service" value="${esc(td.service)}" placeholder="AD 19…"></label><label>Cote<input name="td_cote" value="${esc(td.cote)}" placeholder="2 E 123…"></label></div>
                </div>
                <figure class="h-td-s1-prev">${td.img ? `<img src="media/${esc(encodeURIComponent(td.media.filename))}" alt="">` : (A().emptyState ? A().emptyState({icon: '📑', text: 'Choisis la photo de la table', hint: 'Dans tes médias, ou depuis l’ordinateur (glisser, coller, importer).', action: {label: '🖼 Choisir la photo', attrs: 'data-td-pick'}}) : '')}</figure>
            </div>`;
            const help = () => { const p = period(), h = body.querySelector('[data-td-period-help]'); if (h) h.textContent = !td.period.trim() ? 'Facultatif : sert à compléter les dates sans année et à repérer celles qui sortent de la table.' : p ? `✓ Compris : de ${p.y1} à ${p.y2}` : '⚠️ Je ne trouve pas d’année.'; };
            help();
            body.querySelector('[data-td-langwrap]').hidden = td.writing !== 'print';
            body.addEventListener('input', e => { const n = e.target.name; if (n === 'td_period') { td.period = e.target.value; help(); } if (n === 'td_service') td.service = e.target.value; if (n === 'td_cote') td.cote = e.target.value; }, sig);
            body.addEventListener('change', e => { const n = e.target.name; if (n === 'td_kind') td.kind = e.target.value; if (n === 'td_lang') td.lang = e.target.value; }, sig);
        }
        body.addEventListener('media-change', async e => { if (td.step !== 1) return; await loadImg(e.detail?.item); step1(); }, sig);
        body.addEventListener('picker-change', e => { if (e.detail?.name !== 'td_place') return; const it = e.detail.item; td.place = it ? {id: it.free ? 0 : Number(it.id) || 0, title: it.title || String(e.detail.value || '').replace(/^txt:/, '')} : null; }, sig);
        body.addEventListener('click', e => {
            const w = e.target.closest('[data-td-writing]'); if (w) { td.writing = w.dataset.tdWriting; body.querySelectorAll('[data-td-writing]').forEach(b => b.classList.toggle('is-active', b === w)); const l = body.querySelector('[data-td-langwrap]'); if (l) l.hidden = td.writing !== 'print'; td.cells = []; td.read = ''; return; }
            if (e.target.closest('[data-td-pick]')) body.querySelector('[data-media-field] [data-mf="pick"], [data-media-field] [data-mf="change"]')?.click();
        }, sig);

        /* ─── ② les colonnes : traits à glisser, gabarits ─── */
        function step2() {
            const all = [...TEMPLATES, ...myTemplates().map((t, i) => ({...t, key: `my${i}`, mine: true}))];
            body.innerHTML = `<div class="h-td-s2">
                <div class="h-td-tools">
                    <label>Gabarit<select data-td-tpl>${all.map(t => `<option value="${esc(t.key)}" ${t.key === td.template ? 'selected' : ''}>${t.mine ? '⭐ ' : ''}${esc(t.label)}</option>`).join('')}<option value="" ${td.template ? '' : 'selected'}>Mes réglages (glissés)</option></select></label>
                    <button type="button" class="button small secondary" data-td-addcol title="Couper la colonne la plus large en deux">＋ Colonne</button><button type="button" class="button small secondary" data-td-delcol title="Retirer la dernière colonne">− Colonne</button>
                    <button type="button" class="button small secondary" data-td-keep title="Garder ces colonnes pour une prochaine table (sur cet ordinateur)">⭐ Garder ce gabarit</button>
                    <span class="spacer"></span>
                    <button type="button" class="button small" data-td-rows title="Chercher les lignes d’écriture entre le trait du haut et celui du bas">↧ Repérer les lignes</button>
                    <label class="h-td-nrows">Lignes <input type="number" min="1" max="200" data-td-nrows value="${td.rows.length || ''}" placeholder="—" title="Nombre de lignes : la zone est coupée en parts égales"></label>
                </div>
                <p class="muted small h-td-help">Glisse les <b class="h-td-k-col">traits bleus</b> pour séparer les colonnes et choisis ce que contient chacune ; les <b class="h-td-k-band">traits orange</b> bornent la zone à lire (sous les titres, au-dessus du bas de page). Puis « ↧ Repérer les lignes ».</p>
                <div class="h-td-stage" data-td-stage><div class="h-td-imgbox" data-td-imgbox><img src="media/${esc(encodeURIComponent(td.media.filename))}" alt="La table décennale" draggable="false"><div class="h-td-ov" data-td-ov></div></div></div>
            </div>`;
            paintOverlay();
        }
        function paintOverlay() {
            const ov = body.querySelector('[data-td-ov]'); if (!ov) return;
            const pc = v => `${(v * 100).toFixed(3)}%`;
            const cols = td.cols, bounds = [cols[0][0], ...cols.map(c => c[1])];
            ov.innerHTML = `<div class="h-td-zone" style="left:${pc(cols[0][0])};right:${pc(1 - cols[cols.length - 1][1])};top:${pc(td.top)};bottom:${pc(1 - td.bottom)}"></div>
                ${td.rows.map((r, i) => `<div class="h-td-row${i % 2 ? ' is-odd' : ''}" style="left:${pc(cols[0][0])};right:${pc(1 - cols[cols.length - 1][1])};top:${pc(r.y0)};height:${pc(r.y1 - r.y0)}"></div>`).join('')}
                ${bounds.map((x, i) => `<div class="h-td-vline" data-td-v="${i}" style="left:${pc(x)}" title="Glisser pour déplacer" role="slider" aria-label="Séparation de colonne ${i + 1}" aria-valuenow="${Math.round(x * 100)}" tabindex="0"></div>`).join('')}
                <div class="h-td-hline" data-td-h="top" style="top:${pc(td.top)}" title="Haut de la zone à lire" role="slider" aria-label="Haut de la zone à lire" tabindex="0"></div><div class="h-td-hline" data-td-h="bottom" style="top:${pc(td.bottom)}" title="Bas de la zone à lire" role="slider" aria-label="Bas de la zone à lire" tabindex="0"></div>
                ${cols.map((c, i) => `<label class="h-td-colrole" style="left:${pc(c[0])};width:${pc(c[1] - c[0])};top:${pc(Math.max(0, td.top - .045))}"><select data-td-role="${i}" aria-label="Colonne ${i + 1}">${ROLES.map(([k, l]) => `<option value="${k}" ${c[2] === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`).join('')}`;
            const n = body.querySelector('[data-td-nrows]'); if (n && document.activeElement !== n) n.value = td.rows.length || '';
        }
        const setTpl = key => { const t = [...TEMPLATES, ...myTemplates().map((x, i) => ({...x, key: `my${i}`}))].find(x => x.key === key); if (!t) return; const l = td.cols[0][0], r = td.cols[td.cols.length - 1][1], w = r - l; td.cols = saneCols(t.cols).map(c => [l + c[0] * w, l + c[1] * w, c[2]]); td.template = key; td.cells = []; td.read = ''; paintOverlay(); };
        let dragLine = null;
        body.addEventListener('pointerdown', e => {
            const v = e.target.closest('[data-td-v],[data-td-h]'); if (!v || td.step !== 2) return;
            e.preventDefault(); dragLine = {el: v, v: v.dataset.tdV, h: v.dataset.tdH}; v.setPointerCapture(e.pointerId);
        }, sig);
        body.addEventListener('pointermove', e => {
            if (!dragLine) return; const box = body.querySelector('[data-td-imgbox]').getBoundingClientRect();
            const fx = clamp((e.clientX - box.left) / box.width, 0, 1), fy = clamp((e.clientY - box.top) / box.height, 0, 1);
            moveLine(dragLine, fx, fy);
        }, sig);
        const endLine = () => { if (dragLine) { dragLine = null; td.template = ''; const s = body.querySelector('[data-td-tpl]'); if (s) s.value = ''; td.cells = []; td.read = ''; } };
        body.addEventListener('pointerup', endLine, sig); body.addEventListener('pointercancel', endLine, sig);
        function moveLine(d, fx, fy) {
            if (d.v != null) {
                const i = Number(d.v), cols = td.cols, min = .015;
                if (i === 0) cols[0][0] = clamp(fx, 0, cols[0][1] - min);
                else if (i === cols.length) cols[i - 1][1] = clamp(fx, cols[i - 1][0] + min, 1);
                else { const x = clamp(fx, cols[i - 1][0] + min, cols[i][1] - min); cols[i - 1][1] = x; cols[i][0] = x; }
                td.left = cols[0][0]; td.right = cols[cols.length - 1][1];
            } else if (d.h === 'top') { td.top = clamp(fy, 0, td.bottom - .03); td.rows = td.rows.filter(r => r.y0 >= td.top - .001); }
            else { td.bottom = clamp(fy, td.top + .03, 1); td.rows = td.rows.filter(r => r.y1 <= td.bottom + .001); }
            paintOverlay(); const el = body.querySelector(d.v != null ? `[data-td-v="${d.v}"]` : `[data-td-h="${d.h}"]`); if (el && document.activeElement?.closest?.('[data-td-ov]')) el.focus();
        }
        body.addEventListener('keydown', e => {
            const v = e.target.closest?.('[data-td-v],[data-td-h]'); if (!v || !/^Arrow/.test(e.key)) return; e.preventDefault();
            const step = e.shiftKey ? .02 : .004, dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
            if (v.dataset.tdV != null) { const i = Number(v.dataset.tdV), x = i === td.cols.length ? td.cols[i - 1][1] : td.cols[i][0]; moveLine({v: v.dataset.tdV}, x + dir * step, 0); }
            else moveLine({h: v.dataset.tdH}, 0, (v.dataset.tdH === 'top' ? td.top : td.bottom) + dir * step);
            td.template = ''; td.cells = []; td.read = '';
        }, sig);
        body.addEventListener('change', e => {
            if (td.step !== 2) return;
            if (e.target.matches('[data-td-tpl]')) { if (e.target.value) setTpl(e.target.value); return; }
            if (e.target.matches('[data-td-role]')) { td.cols[Number(e.target.dataset.tdRole)][2] = e.target.value; td.template = ''; td.cells = []; td.read = ''; const s = body.querySelector('[data-td-tpl]'); if (s) s.value = ''; return; }
            if (e.target.matches('[data-td-nrows]')) { const n = clamp(Math.round(Number(e.target.value) || 0), 0, 200); td.rows = n ? evenRows(td.top, td.bottom, n) : []; td.cells = []; td.read = ''; paintOverlay(); }
        }, sig);
        body.addEventListener('click', async e => {
            if (td.step !== 2) return; const b = e.target.closest('button'); if (!b) return;
            if (b.hasAttribute('data-td-addcol')) { if (td.cols.length >= 12) return; let w = -1, k = 0; td.cols.forEach((c, i) => { if (c[1] - c[0] > w) { w = c[1] - c[0]; k = i; } }); const c = td.cols[k], m = (c[0] + c[1]) / 2; td.cols.splice(k, 1, [c[0], m, c[2]], [m, c[1], 'ignore']); td.template = ''; td.cells = []; paintOverlay(); }
            else if (b.hasAttribute('data-td-delcol')) { if (td.cols.length <= 1) return; const last = td.cols.pop(); td.cols[td.cols.length - 1][1] = last[1]; td.template = ''; td.cells = []; paintOverlay(); }
            else if (b.hasAttribute('data-td-rows')) { td.rows = detectRows(td.img, td.top, td.bottom, td.left, td.right); td.cells = []; td.read = ''; paintOverlay(); toast(td.rows.length ? `${plural(td.rows.length, 'ligne repérée', 'lignes repérées')} : vérifie qu’elles tombent bien sur l’écriture.` : 'Aucune ligne repérée : ajuste les traits orange, ou indique le nombre de lignes.', td.rows.length ? '' : 'error'); }
            else if (b.hasAttribute('data-td-keep')) {
                const name = await A().askText?.({title: 'Garder ce gabarit', message: 'Son nom (il sera proposé pour tes prochaines tables, sur cet ordinateur) :', value: '', okLabel: 'Garder'}); if (!name?.trim()) return;
                const l = td.cols[0][0], w = (td.cols[td.cols.length - 1][1] - l) || 1, list = myTemplates();
                list.push({label: name.trim().slice(0, 80), cols: td.cols.map(c => [+((c[0] - l) / w).toFixed(4), +((c[1] - l) / w).toFixed(4), c[2]])});
                try { localStorage.setItem(MY_KEY, JSON.stringify(list.slice(-30))); } catch (_) {}
                td.template = `my${list.length - 1}`; step2(); toast(`Gabarit « ${name.trim()} » gardé.`);
            }
        }, sig);

        /* ─── ③ la lecture : Tesseract (imprimé), HTR (manuscrit) s'il est installé, sinon à la main ─── */
        const roleCols = () => td.cols.map((c, i) => ({i, x0: c[0], x1: c[1], role: c[2]})).filter(c => c.role !== 'ignore');
        const emptyCell = r => ({nom: '', prenoms: '', date: '', sorte: td.kind === 'mixte' ? '' : td.kind, annee: '', notes: '', conf: null, y0: r.y0, y1: r.y1});
        function startManual() { td.cells = td.rows.map(emptyCell); td.read = 'manual'; }
        async function step3() {
            const hand = td.writing === 'hand';
            body.innerHTML = `<div class="h-td-s3"><div data-td-read class="h-td-read">${UI().spinner ? UI().spinner('Préparation…') : 'Préparation…'}</div></div>`;
            const box = body.querySelector('[data-td-read]');
            const manualBtn = '<button type="button" class="button" data-td-manual>✍ Saisir les lignes à la main</button>';
            const say = (kind, msg, extra = '') => { box.innerHTML = `${UI().notice ? UI().notice(kind, msg) : `<p>${esc(msg)}</p>`}<div class="h-td-row-actions">${extra}</div>`; };
            box.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.hasAttribute('data-td-manual')) { startManual(); go(4); } if (b.hasAttribute('data-td-run')) runRead(); if (b.hasAttribute('data-td-stop')) td.stop = true; }, sig);
            if (td.cells.length && td.read) { say('ok', `${plural(td.cells.length, 'ligne déjà lue', 'lignes déjà lues')} : passe à la relecture, ou relis l’image.`, `<button type="button" class="button secondary" data-td-run>↻ Relire l’image</button>${manualBtn}`); return; }
            if (hand) {
                let ready = false; try { ready = !!(await api('htr_setup_status')).ready; } catch (_) {}
                if (td.step !== 3) return;
                if (!ready) { say('info', 'Le lecteur d’écriture manuscrite (HTR) n’est pas installé sur cet ordinateur : la saisie se fait à la main, dans une grille rapide, la bande de chaque ligne sous les yeux. (Pour l’installer : Réglages → Reconnaissance d’écriture.)', manualBtn); return; }
                say('info', `${plural(td.rows.length, 'ligne', 'lignes')} à lire avec le lecteur d’écriture manuscrite (HTR) : chaque case est envoyée au lecteur installé sur cet ordinateur. C’est plus lent, et à relire attentivement.`, `<button type="button" class="button" data-td-run>▶ Lire les lignes</button>${manualBtn}`); return;
            }
            say('info', `${plural(td.rows.length, 'ligne', 'lignes')} à lire, ${plural(roleCols().length, 'colonne', 'colonnes')}. La lecture se fait sur cet ordinateur (le moteur est téléchargé une fois, et vérifié).`, `<button type="button" class="button" data-td-run>▶ Lire les lignes</button>${manualBtn}`);
            runRead();
        }
        const progress = (i, n, what) => { const box = body.querySelector('[data-td-read]'); if (!box) return; box.innerHTML = `<div class="h-td-prog"><div>${UI().spinner ? UI().spinner(what) : esc(what)}</div><div class="h-pc-meter"><i style="width:${n ? Math.round(i / n * 100) : 0}%"></i></div><small class="muted">${i} / ${n}</small> <button type="button" class="button small secondary" data-td-stop>■ Arrêter</button></div>`; };
        async function runRead() {
            if (td.busy) return; td.busy = true; td.stop = false; paintSteps();
            const hand = td.writing === 'hand', cells = td.rows.map(emptyCell), cols = roleCols();
            try {
                if (hand) {
                    const total = td.rows.length * cols.length; let k = 0;
                    for (const [ri, r] of td.rows.entries()) for (const c of cols) {
                        if (td.stop) throw Object.assign(new Error('Lecture arrêtée.'), {stopped: true});
                        progress(k++, total, `Lecture manuscrite : ligne ${ri + 1}`);
                        const can = cropCanvas(td.img, c.x0, r.y0, c.x1, r.y1, {minH: 64});
                        const res = await post('htr_recognize', {media_id: td.media.id, model: td.lang.startsWith('fra') || td.lang === 'lat' ? 'fr-actes' : 'en-handwritten', image_b64: await canvasB64(can)});
                        put(cells[ri], c.role, String(res.result?.text || res.text || '').replace(/\s+/g, ' ').trim(), null);
                    }
                } else {
                    progress(0, 1, 'Chargement du moteur de lecture…');
                    const T = await A().loadOcrEngine();
                    if (td.stop) throw Object.assign(new Error('Lecture arrêtée.'), {stopped: true});
                    progress(0, 1, 'Lecture de la table…');
                    const rh = td.rows.length ? (td.rows.reduce((s, r) => s + (r.y1 - r.y0), 0) / td.rows.length) * td.img.naturalHeight : 30;
                    const can = cropCanvas(td.img, td.left, td.top, td.right, td.bottom, {minH: rh ? (td.bottom - td.top) * td.img.naturalHeight * clamp(44 / rh, 1, 3) : 0, gray: true});
                    const worker = await T.createWorker(td.lang, 1);
                    let data;
                    try { await worker.setParameters({tessedit_pageseg_mode: '6', preserve_interword_spaces: '1'}); data = (await worker.recognize(can)).data || {}; } finally { worker.terminate().catch(() => {}); }
                    const words = (data.words?.length ? data.words : (data.blocks || []).flatMap(b => (b.paragraphs || []).flatMap(p => (p.lines || []).flatMap(l => l.words || [])))).filter(w => w?.bbox && /[\p{L}\p{N}]/u.test(w.text || ''));
                    const iw = td.img.naturalWidth, ih = td.img.naturalHeight;
                    const toImg = (x, y) => [(can._sx + x / can._k) / iw, (can._sy + y / can._k) / ih];
                    if (!td.rows.length) { const ys = words.map(w => toImg(0, (w.bbox.y0 + w.bbox.y1) / 2)[1]).sort((a, b) => a - b); if (ys.length) td.rows = evenRows(td.top, td.bottom, 20); }
                    const per = td.rows.map(() => Object.fromEntries(cols.map(c => [c.i, []])));
                    words.forEach(w => {
                        const [cx, cy] = toImg((w.bbox.x0 + w.bbox.x1) / 2, (w.bbox.y0 + w.bbox.y1) / 2);
                        const ri = td.rows.findIndex(r => cy >= r.y0 && cy < r.y1), c = cols.find(cc => cx >= cc.x0 && cx < cc.x1);
                        if (ri >= 0 && c) per[ri][c.i].push(w);
                    });
                    per.forEach((byCol, ri) => cols.forEach(c => { const ws = byCol[c.i].sort((a, b) => a.bbox.x0 - b.bbox.x0); if (!ws.length) return; put(cells[ri], c.role, ws.map(w => w.text).join(' ').replace(/\s+/g, ' ').trim(), Math.min(...ws.map(w => Number(w.confidence) || 0))); }));
                }
                td.cells = cells; td.read = hand ? 'htr' : 'ocr';
                const got = cells.filter(c => c.nom || c.prenoms).length;
                toast(`${plural(got, 'ligne lue', 'lignes lues')} sur ${td.rows.length} : relis et corrige.`);
                td.busy = false; go(4);
            } catch (err) {
                td.busy = false; paintSteps();
                if (err.stopped) { const box = body.querySelector('[data-td-read]'); if (box) box.innerHTML = `${UI().notice ? UI().notice('info', 'Lecture arrêtée.') : ''}<div class="h-td-row-actions"><button type="button" class="button secondary" data-td-run>▶ Reprendre la lecture</button><button type="button" class="button" data-td-manual>✍ Saisir les lignes à la main</button></div>`; return; }
                const msg = hand ? `Le lecteur d’écriture manuscrite n’a pas pu lire la table (${err.message || 'erreur'}).` : `${err.message || 'Le moteur de lecture n’a pas pu être chargé.'}`;
                const box = body.querySelector('[data-td-read]'); if (box) box.innerHTML = `${UI().notice ? UI().notice('warn', `${msg} La saisie à la main reste possible : la bande de chaque ligne s’affiche au-dessus de la grille.`) : esc(msg)}<div class="h-td-row-actions"><button type="button" class="button secondary" data-td-run>↻ Réessayer</button><button type="button" class="button" data-td-manual>✍ Saisir les lignes à la main</button></div>`;
            }
        }
        function put(cell, role, text, conf) {
            if (!text || role === 'ignore') return;
            if (role === 'sorte') { const f = fold(text); cell.sorte = /^n|nais/.test(f) ? 'naissance' : /^m|mar/.test(f) ? 'mariage' : /^d|dec/.test(f) ? 'deces' : 'autre'; }
            else cell[role] = cell[role] ? `${cell[role]} ${text}` : text;
            if (conf != null) cell.conf = cell.conf == null ? conf : Math.min(cell.conf, conf);
        }

        /* ─── ④ la relecture : la grille, l'image en regard ─── */
        function dateInfo(i) {
            let prev = 0; for (let k = i - 1; k >= 0; k--) { const d = rowDate(td.cells[k].date, {annee: td.cells[k].annee, period: period()}); if (d.year) { prev = d.year; break; } }
            return rowDate(td.cells[i].date, {annee: td.cells[i].annee, prevYear: prev, period: period()});
        }
        const dateHelp = d => (d.empty ? '' : d.ok ? `${d.warn ? '⚠️' : '✓'} ${esc(d.label)}${d.warn ? ` <span class="h-td-warn">— ${esc(d.warn)}</span>` : ''}` : `⚠️ ${esc(d.warn || 'date à vérifier')}`);
        const kindOpts = v => `<option value="">—</option>${Object.entries(ACT).map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${l}</option>`).join('')}`;
        function step4() {
            const hasAnnee = td.cols.some(c => c[2] === 'annee'), hasNotes = td.cols.some(c => c[2] === 'notes');
            body.innerHTML = `<div class="h-td-s4">
                <div class="h-td-s4-img" data-td-s4img><div class="h-td-imgbox"><img src="media/${esc(encodeURIComponent(td.media.filename))}" alt="La table décennale" draggable="false"><div class="h-td-ov" data-td-ov4></div></div></div>
                <div class="h-td-s4-grid">
                    <div class="h-td-strip-wrap"><span class="pk-lab" data-td-strip-lab>La ligne sur l’image</span><canvas class="h-td-strip" data-td-strip height="60"></canvas></div>
                    <p class="muted small">${td.read === 'manual' ? 'Saisis chaque ligne en regardant la bande au-dessus. ' : 'Ce que l’app a lu : corrige ce qui est faux (les cases peu sûres sont en jaune). '}Entrée ou ↓ : ligne suivante ; ↑ : ligne d’avant. Les dates sans année prennent l’année de la ligne d’avant${period() ? ` (table de ${period().y1} à ${period().y2})` : ''}.</p>
                    <div class="h-td-gridwrap"><table class="data-table h-td-grid"><thead><tr><th>N°</th><th>Nom</th><th>Prénoms</th>${hasAnnee ? '<th>Année</th>' : ''}<th>Date</th><th>Sorte</th>${hasNotes ? '<th>N° / notes</th>' : ''}<th></th></tr></thead><tbody data-td-tbody></tbody></table></div>
                    <div class="h-td-row-actions"><button type="button" class="button small secondary" data-td-addrow>＋ Ajouter une ligne</button><span class="muted small" data-td-count></span></div>
                </div></div>`;
            const tb = body.querySelector('[data-td-tbody]');
            tb.innerHTML = td.cells.map((c, i) => {
                const d = dateInfo(i), low = c.conf != null && c.conf < 60 ? ' is-unsure' : '';
                return `<tr data-td-i="${i}"><td class="h-td-n">${i + 1}</td><td><input data-td-k="nom" class="h-td-nom${low}" value="${esc(c.nom)}" aria-label="Nom, ligne ${i + 1}"></td><td><input data-td-k="prenoms" class="${low.trim()}" value="${esc(c.prenoms)}" aria-label="Prénoms, ligne ${i + 1}"></td>${hasAnnee ? `<td><input data-td-k="annee" class="h-td-annee" value="${esc(c.annee)}" aria-label="Année, ligne ${i + 1}"></td>` : ''}<td><input data-td-k="date" value="${esc(c.date)}" aria-label="Date, ligne ${i + 1}" placeholder="12 mars, 12/03/1855…"><small class="h-td-dh ${d.ok && !d.warn ? 'is-ok' : d.empty ? '' : 'is-warn'}" data-td-dh>${dateHelp(d)}</small></td><td><select data-td-k="sorte" aria-label="Sorte d’acte, ligne ${i + 1}">${kindOpts(c.sorte)}</select></td>${hasNotes ? `<td><input data-td-k="notes" value="${esc(c.notes)}" aria-label="Notes, ligne ${i + 1}"></td>` : ''}<td><button type="button" class="icon-button small" data-td-delrow title="Retirer cette ligne" aria-label="Retirer la ligne ${i + 1}">✕</button></td></tr>`;
            }).join('') || `<tr><td colspan="8">${A().empty ? A().empty('Aucune ligne : « ＋ Ajouter une ligne ».', {icon: '📑'}) : ''}</td></tr>`;
            count(); paintOv4(); paintStrip();
            const first = tb.querySelector(`tr[data-td-i="${td.cur}"] input`) || tb.querySelector('input'); first?.focus({preventScroll: true});
        }
        const count = () => { const n = td.cells.filter(c => c.nom || c.prenoms).length, el = body.querySelector('[data-td-count]'); if (el) el.textContent = `${plural(n, 'ligne avec un nom', 'lignes avec un nom')} sur ${td.cells.length}`; };
        function paintOv4() {
            const ov = body.querySelector('[data-td-ov4]'); if (!ov) return; const pc = v => `${(v * 100).toFixed(3)}%`;
            ov.innerHTML = td.cells.map((c, i) => `<div class="h-td-row${i === td.cur ? ' is-cur' : ''}${i % 2 ? ' is-odd' : ''}" data-td-zone="${i}" style="left:${pc(td.left)};right:${pc(1 - td.right)};top:${pc(c.y0)};height:${pc(Math.max(.004, c.y1 - c.y0))}" title="Ligne ${i + 1}"></div>`).join('');
            const z = ov.querySelector('.is-cur'); const wrap = body.querySelector('[data-td-s4img]');
            if (z && wrap) { const zr = z.getBoundingClientRect(), wr = wrap.getBoundingClientRect(); if (zr.top < wr.top || zr.bottom > wr.bottom) wrap.scrollTop += zr.top - wr.top - wr.height / 3; }
        }
        function paintStrip() {
            const cv = body.querySelector('[data-td-strip]'), c = td.cells[td.cur]; if (!cv || !td.img) return;
            const lab = body.querySelector('[data-td-strip-lab]'); if (lab) lab.textContent = c ? `La ligne ${td.cur + 1} sur l’image` : 'La ligne sur l’image';
            const g = cv.getContext('2d'), wPx = cv.clientWidth || 600; cv.width = Math.round(wPx * (window.devicePixelRatio || 1));
            if (!c) { g.clearRect(0, 0, cv.width, cv.height); return; }
            const iw = td.img.naturalWidth, ih = td.img.naturalHeight, pad = (c.y1 - c.y0) * .25, y0 = Math.max(0, c.y0 - pad), y1 = Math.min(1, c.y1 + pad);
            const sw = (td.right - td.left) * iw, sh = (y1 - y0) * ih, k = cv.width / sw; cv.height = Math.max(30, Math.min(160, Math.round(sh * k)));
            g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(td.img, td.left * iw, y0 * ih, sw, sh, 0, 0, cv.width, cv.height);
            g.strokeStyle = 'rgba(31,111,235,.5)'; g.lineWidth = 1; td.cols.forEach(col => { const x = (col[1] - td.left) / (td.right - td.left) * cv.width; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, cv.height); g.stroke(); });
        }
        function readGrid() {
            body.querySelectorAll('[data-td-i]').forEach(tr => { const c = td.cells[Number(tr.dataset.tdI)]; if (!c) return; tr.querySelectorAll('[data-td-k]').forEach(inp => { c[inp.dataset.tdK] = inp.value.trim(); }); });
        }
        body.addEventListener('focusin', e => { if (td.step !== 4) return; const tr = e.target.closest('[data-td-i]'); if (!tr) return; const i = Number(tr.dataset.tdI); if (i !== td.cur) { td.cur = i; paintOv4(); paintStrip(); } }, sig);
        body.addEventListener('input', e => {
            if (td.step !== 4) return; const inp = e.target.closest('[data-td-k]'); if (!inp) return; const tr = inp.closest('[data-td-i]'), i = Number(tr.dataset.tdI);
            td.cells[i][inp.dataset.tdK] = inp.value; inp.classList.remove('is-unsure');
            if (['date', 'annee'].includes(inp.dataset.tdK)) body.querySelectorAll('[data-td-i]').forEach(r => { const k = Number(r.dataset.tdI); if (k < i) return; const d = dateInfo(k), h = r.querySelector('[data-td-dh]'); if (h) { h.innerHTML = dateHelp(d); h.className = `h-td-dh ${d.ok && !d.warn ? 'is-ok' : d.empty ? '' : 'is-warn'}`; } });
            count();
        }, sig);
        body.addEventListener('focusout', e => { if (td.step !== 4) return; const inp = e.target.closest?.('[data-td-k="nom"]'); if (inp && inp.value && inp.value !== inp.value.toLocaleUpperCase('fr')) { inp.value = inp.value.toLocaleUpperCase('fr'); td.cells[Number(inp.closest('[data-td-i]').dataset.tdI)].nom = inp.value; } }, sig);
        body.addEventListener('keydown', e => {
            if (td.step !== 4) return; const inp = e.target.closest?.('[data-td-k]'); if (!inp || inp.tagName === 'SELECT' && /Arrow/.test(e.key)) return;
            const dir = e.key === 'Enter' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0; if (!dir) return;
            e.preventDefault(); const i = Number(inp.closest('[data-td-i]').dataset.tdI) + dir;
            if (i >= td.cells.length && e.key === 'Enter') { addRow(); }
            body.querySelector(`[data-td-i="${clamp(i, 0, td.cells.length - 1)}"] [data-td-k="${inp.dataset.tdK}"]`)?.focus();
        }, sig);
        function addRow() { readGrid(); const last = td.cells[td.cells.length - 1], h = last ? last.y1 - last.y0 : .03, y0 = last ? last.y1 : td.top; td.cells.push({...emptyCell({y0, y1: Math.min(1, y0 + h)})}); td.cur = td.cells.length - 1; step4(); }
        body.addEventListener('click', e => {
            if (td.step !== 4) return;
            const z = e.target.closest('[data-td-zone]'); if (z) { td.cur = Number(z.dataset.tdZone); body.querySelector(`[data-td-i="${td.cur}"] [data-td-k="nom"]`)?.focus(); return; }
            const b = e.target.closest('button'); if (!b) return;
            if (b.hasAttribute('data-td-addrow')) addRow();
            if (b.hasAttribute('data-td-delrow')) {
                readGrid(); const i = Number(b.closest('[data-td-i]').dataset.tdI), gone = td.cells.splice(i, 1)[0]; td.cur = clamp(td.cur, 0, td.cells.length - 1); step4();
                A().undoToast ? A().undoToast(`Ligne ${i + 1} retirée`, {undo: () => { td.cells.splice(i, 0, gone); if (td.step === 4) step4(); }, redo: () => { td.cells.splice(i, 1); if (td.step === 4) step4(); }}) : null;
            }
        }, sig);

        /* ─── ⑤ créer le dépouillement, puis les fiches ─── */
        const kept = () => td.cells.map((c, i) => ({...c, i})).filter(c => (c.nom || c.prenoms).trim());
        const kindLabel = () => (KINDS.find(k => k[0] === td.kind) || KINDS[0])[1].replace(/ \(.*/, '');
        const digestTitle = () => ['Table décennale', td.kind === 'mixte' ? '' : kindLabel(), td.place?.title, td.period].filter(Boolean).join(' · ');
        function step5() {
            if (td.digestId) return paintFiches();
            const rows = kept(), warn = rows.filter(c => { const d = dateInfo(c.i); return !d.empty && (!d.ok || d.warn); }).length;
            body.innerHTML = `<div class="h-td-s5">
                <h3>Voilà ce qui va entrer</h3>
                <ul class="h-td-sum"><li>📑 Un dépouillement <b>« ${esc(digestTitle())} »</b> (modèle « Table décennale »), dans Listes → Dépouillements et Recherche → Dépouillement d’archive ;</li>
                <li>👥 <b>${plural(rows.length, 'ligne', 'lignes')}</b> relevée${rows.length > 1 ? 's' : ''} (nom, prénoms, date, sorte d’acte), chacune avec sa zone sur l’image ;</li>
                <li>🖼 la photo de la table, reliée au dépouillement (page 1).</li></ul>
                ${warn ? (UI().notice ? UI().notice('warn', `${plural(warn, 'date reste', 'dates restent')} à vérifier : elles sont gardées telles qu’écrites.`) : '') : ''}
                <p class="muted">Ensuite, l’app te propose les fiches qui correspondent : relier ou créer, ligne par ligne.</p></div>`;
        }
        async function create() {
            if (td.busy) return; readGrid(); const rows = kept(); if (!rows.length) return toast('Aucune ligne avec un nom.', 'error');
            td.busy = true; paintSteps(); body.innerHTML = UI().spinner ? UI().spinner('Création du dépouillement…') : 'Création…';
            const make = async () => {
                const p = period();
                const res = await post('save_archive_digest', {record_type: 'table_decennale', template_key: 'table', status: 'todo', city_name: td.place?.title || '', place_id: td.place?.id || 0, year_text: td.period.trim() || (p ? `${p.y1}-${p.y2}` : ''),
                    archive_service: td.service.trim(), archive_reference: td.cote.trim(), searched: '', found: '', notes: `Lue avec l’assistant « 📑 Lire une table décennale » (${td.read === 'ocr' ? 'lecture automatique, relue' : td.read === 'htr' ? 'écriture manuscrite lue automatiquement, relue' : 'saisie à la main'}). Sorte d’actes : ${kindLabel()}.`, page_total: 1});
                const id = Number(res.result?.id || res.id); if (!id) throw new Error('Le dépouillement n’a pas pu être créé.');
                await post('link_archive_digest_media', {archive_digest_id: id, media_id: td.media.id, page_number: '1'});
                const out = [];
                for (const [n, c] of rows.entries()) {
                    const d = dateInfo(c.i), act = ACT[c.sorte] || (td.kind !== 'mixte' ? ACT[td.kind] : '');
                    const dateText = d.ok ? d.text : c.date;
                    const r = await post('save_archive_digest_person', {archive_digest_id: id, person_mode: 'manual', first_name: c.prenoms.trim(), last_name: c.nom.trim(), page_number: '1', household_key: '', address: '',
                        personal_status: act, extra_info: dateText, notes: [c.notes, d.warn ? `date à vérifier : ${d.warn}` : '', !d.ok && c.date ? 'date à vérifier' : ''].filter(Boolean).join(' · ')});
                    const zone = {x: td.left * 100, y: c.y0 * 100, width: (td.right - td.left) * 100, height: Math.max(.2, (c.y1 - c.y0) * 100)};
                    await post('save_archive_digest_transcription_line', {archive_digest_id: id, media_id: td.media.id, page_number: '1', line_number: n + 1, content: [c.nom.trim(), c.prenoms.trim(), dateText, act].filter(Boolean).join(' · '), zone_json: JSON.stringify(zone)});
                    out.push({rowId: Number(r.result?.id || r.id), first: c.prenoms.trim(), last: c.nom.trim(), date: dateText, dateOk: d.ok, year: d.year || 0, act: c.sorte || (td.kind !== 'mixte' ? td.kind : ''), personId: 0, created: false, suggestion: null});
                    if ((n + 1) % 5 === 0) body.innerHTML = UI().spinner ? UI().spinner(`Création du dépouillement… ${n + 1} / ${rows.length}`) : '';
                }
                return {id, out};
            };
            try {
                const r = await make(); td.digestId = r.id; td.created = r.out;
                const undo = async () => { await post('delete_archive_digest', {id: td.digestId}); td.digestId = 0; td.created = null; if (dlg.open) go(5); ext.lists?.depouillements && A().state.module === 'listes' && A().state.listType === 'depouillements' && A().renderList?.(); };
                const redo = async () => { const again = await make(); td.digestId = again.id; td.created = again.out; if (dlg.open) { go(5); suggest(); } };
                A().undoToast ? A().undoToast(`Dépouillement créé : ${plural(r.out.length, 'ligne', 'lignes')}`, {undo, redo, icon: '📑'}) : toast('Dépouillement créé.');
                td.busy = false; go(5); suggest();
            } catch (err) { td.busy = false; toast(err.message || 'Création impossible.', 'error', {retry: create}); go(5); }
        }
        /** les fiches proposées : même prénom et même nom, l'année proche de celle de l'acte */
        async function suggest() {
            for (const row of td.created || []) {
                if (!dlg.open || !td.created) return;
                const q = `${row.first.split(/\s+/)[0] || ''} ${row.last}`.trim(); if (!q) continue;
                try {
                    const r = await api('picker_search', {kind: 'person', q, limit: 6}); const items = (r.groups || []).flatMap(g => g.items || []).filter(i => i.kind === 'person');
                    const fn = fold(row.first.split(/\s+/)[0]), ln = fold(row.last);
                    const best = items.find(i => { const t = fold(i.title); return t.includes(ln) && (!fn || t.includes(fn)); });
                    if (best) row.suggestion = {id: Number(best.id), title: best.title, meta: best.meta || ''};
                } catch (_) {}
                paintFiche(row);
            }
        }
        function ficheHtml(row, i) {
            const pk = P(), name = `${row.first} ${row.last}`.trim();
            const what = [ACT[row.act], row.date].filter(Boolean).join(' · ');
            const state = row.personId ? `<span class="h-td-linked">${row.created ? '＋ Fiche créée' : '🔗 Reliée'} : <button type="button" class="link-button" data-open-person="${row.personId}">↗ ${esc(row.personName || name)}</button></span>`
                : `<div class="h-td-fpick">${pk.pickerField ? pk.pickerField({name: `td_p${i}`, kind: 'person', allowCreate: false, value: row.suggestion ? {id: row.suggestion.id, title: row.suggestion.title, kind: 'person'} : null}) : ''}</div>
                   <button type="button" class="button small" data-td-link="${i}" title="Relier la ligne à la fiche choisie">🔗 Relier</button><button type="button" class="button small secondary" data-td-create="${i}" title="Créer la fiche ${esc(name)}${ACT[row.act] && row.act !== 'mariage' && row.dateOk ? ' avec son événement' : ''}">＋ Créer la fiche</button>`;
            return `<li class="h-td-fiche" data-td-f="${i}"><div class="h-td-fname"><b>${esc(row.last.toLocaleUpperCase('fr'))}</b> ${esc(row.first)}<small class="muted">${esc(what)}${!row.personId && row.suggestion ? ' · fiche proposée' : ''}</small></div><div class="h-td-fact">${state}</div></li>`;
        }
        function paintFiche(row) { const i = td.created.indexOf(row), li = body.querySelector(`[data-td-f="${i}"]`); if (li) li.outerHTML = ficheHtml(row, i); }
        function paintFiches() {
            const rows = td.created || [], linkable = rows.filter(r => !r.personId && r.suggestion).length;
            body.innerHTML = `<div class="h-td-s5">
                ${UI().notice ? UI().notice('ok', `Le dépouillement « ${esc(digestTitle())} » est créé avec ${plural(rows.length, 'ligne', 'lignes')}.`) : ''}
                <div class="h-td-row-actions"><button type="button" class="button secondary" data-td-open>↗ Ouvrir le dépouillement</button><span class="spacer"></span><button type="button" class="button small" data-td-linkall ${linkable ? '' : 'disabled'}>🔗 Relier les fiches proposées${linkable ? ` (${linkable})` : ''}</button></div>
                <h3>Les fiches</h3><p class="muted small">Pour chaque ligne : relie-la à une fiche de ta base (menu de choix), ou crée la fiche. Rien n’est obligatoire : la ligne reste dans le dépouillement.</p>
                <ul class="h-td-fiches">${rows.map(ficheHtml).join('')}</ul></div>`;
        }
        async function linkRow(row, personId, title) {
            await post('save_archive_digest_person', {id: row.rowId, archive_digest_id: td.digestId, person_mode: 'existing', person_id: personId, first_name: row.first, last_name: row.last, page_number: '1', personal_status: ACT[row.act] || '', extra_info: row.date});
            row.personId = personId; row.personName = title; row.created = false;
        }
        async function unlinkRow(row) { await post('save_archive_digest_person', {id: row.rowId, archive_digest_id: td.digestId, person_mode: 'manual', first_name: row.first, last_name: row.last, page_number: '1', personal_status: ACT[row.act] || '', extra_info: row.date}); row.personId = 0; row.created = false; }
        async function createRow(row) {
            const r = await post('save_archive_digest_person', {id: row.rowId, archive_digest_id: td.digestId, person_mode: 'create', first_name: row.first, last_name: row.last, page_number: '1', personal_status: ACT[row.act] || '', extra_info: row.date});
            const pid = Number(r.result?.person_id || r.person_id); if (!pid) throw new Error('La fiche n’a pas pu être créée.');
            const slug = row.act === 'naissance' ? 'birth' : row.act === 'deces' ? 'death' : '';
            const type = slug ? (A().state.bootstrap?.eventTypes || []).find(t => t.slug === slug && t.scope === 'person') : null;
            if (type && row.dateOk) { try { await post('add_event', {person_id: pid, event_type_id: type.id, date_text: row.date, place_id: td.place?.id || '', description: `Relevé dans la table décennale${td.place?.title ? ` de ${td.place.title}` : ''}${td.period ? ` (${td.period})` : ''}.`}); } catch (_) {} }
            row.personId = pid; row.personName = `${row.first} ${row.last}`.trim(); row.created = true;
        }
        body.addEventListener('click', async e => {
            if (td.step !== 5) return; const b = e.target.closest('button'); if (!b) return;
            if (b.hasAttribute('data-td-open')) { const id = td.digestId; dlg.close(); ext.openDepouillement?.(id, '1'); return; }
            if (b.dataset.openPerson) { const id = Number(b.dataset.openPerson); dlg.close(); A().state.currentPersonId = id; A().setModule('personnes'); return; }
            const i = Number(b.dataset.tdLink ?? b.dataset.tdCreate ?? -1), row = td.created?.[i];
            try {
                if (b.hasAttribute('data-td-linkall')) {
                    const list = td.created.filter(r => !r.personId && r.suggestion); b.disabled = true;
                    for (const r of list) await linkRow(r, r.suggestion.id, r.suggestion.title);
                    paintFiches();
                    A().undoToast?.(`${plural(list.length, 'ligne reliée', 'lignes reliées')} à sa fiche`, {undo: async () => { for (const r of list) await unlinkRow(r); if (td.step === 5) paintFiches(); }, redo: async () => { for (const r of list) await linkRow(r, r.suggestion.id, r.suggestion.title); if (td.step === 5) paintFiches(); }});
                    return;
                }
                if (!row) return;
                if (b.hasAttribute('data-td-link')) {
                    const f = body.querySelector(`[data-td-f="${i}"] [data-picker], [data-td-f="${i}"] .pk`); const v = Number(body.querySelector(`[data-td-f="${i}"] input[name="td_p${i}"]`)?.value || 0);
                    if (!v) { if (UI().fieldError && f) UI().fieldError(f, 'Choisis la fiche dans la liste (ou « ＋ Créer la fiche »).'); else toast('Choisis la fiche dans la liste.', 'error'); return; }
                    const title = body.querySelector(`[data-td-f="${i}"] .pk-chosen b, [data-td-f="${i}"] .pk-chip b`)?.textContent || '';
                    await linkRow(row, v, title); paintFiche(row);
                    A().undoToast?.(`Ligne reliée à ${title || 'la fiche'}`, {undo: async () => { await unlinkRow(row); if (td.step === 5) paintFiche(row); }, redo: async () => { await linkRow(row, v, title); if (td.step === 5) paintFiche(row); }});
                }
                if (b.hasAttribute('data-td-create')) {
                    b.disabled = true; await createRow(row); paintFiche(row);
                    A().undoToast?.(`Fiche créée : ${row.personName}`, {undo: async () => { const pid = row.personId; await post('delete_person', {id: pid}); row.personId = 0; row.created = false; await unlinkRow(row); if (td.step === 5) paintFiche(row); }, redo: async () => { await createRow(row); if (td.step === 5) paintFiche(row); }});
                }
            } catch (err) { toast(err.message || 'Impossible.', 'error'); b.disabled = false; }
        }, sig);

        go(1);
        return {dlg, state: td};
    }
    ext.openDecennale = open;
})();
