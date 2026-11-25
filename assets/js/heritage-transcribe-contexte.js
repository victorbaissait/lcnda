/* LCNDA — 📜 Atelier de transcription : versions, mots sur l'image, « Aider l'IA », pourquoi l'acte de notoriété
 * (maquette validée : docs/design/transcription-versions-contexte.html ; réponses retenues : celles conseillées).
 *  1. 🕘 la bande « Versions » au-dessus de « 📄 Ce texte est celui du document… » : ma version, chaque lecture (modèle, date, image envoyée),
 *     les copies ; un clic = l'aperçu en lecture seule (« Utiliser cette version », « Comparer avec ma version », « Fermer ») ;
 *     « ⧉ Dupliquer » garde une copie ; les versions automatiques et les plus anciennes dans « ⋯ N autres » (la fenêtre 🕘 Versions).
 *     🗑 « Supprimer cette version » (aperçu) et plusieurs cochées dans 🕘 Versions : une seule « ↶ Annuler » remet chaque ligne telle quelle
 *     (même id, même date) ; « Ma version (actuelle) » est le texte du document : elle ne se supprime pas.
 *     ✎ « Travailler sur cette version dans l'éditeur » : elle devient le texte (l'ancien gardé, comme « Utiliser cette version »), les zones
 *     de l'image sont reliées à ses lignes (relinkZones : même nombre de lignes → la ligne i ; sinon à relier à la main) ; la bande dit
 *     « Tu travailles sur : … — ↩ Revenir à ma version » ; chaque version garde ses propres zones reliées (save_act_transcription_version_zones).
 *  2. 🔦 les mots choisis dans le texte : un cadre serré dans la bande de leur ligne (≈ estimé d'après la place des lettres ; exact si la
 *     lecture a donné la place de chaque mot) ; sa couleur se choisit (bleu au départ), retenue dans genealogie-htr-word-color.
 *  3. 🧠 « Aider l'IA » : titre, de quoi parle l'acte, personnes reliées, indices de la base (cochés au départ : l'événement, les noms, les lieux) ;
 *     le texte envoyé se voit tel quel (le serveur le compose : tx_deep_prompt, lib/transcription_actes.php).
 *  4. ❓ acte de notoriété : « Pourquoi cet acte a été fait » (data.reason = {k, t, auto}), pré-rempli par « 🧭 Repérer ».
 *  5. 🧠 « lu avec un indice » : les mots [?] d'une lecture faite avec des indices (data.hinted, meta.hints) ; 🖱 wordAt : un clic sur un mot
 *     de l'image → le mot le plus proche dans le texte (heritage-transcribe.js y met le curseur, au 2e clic sur la ligne choisie).
 * Les données : act_transcription_versions (data.meta), act_transcriptions.data_json (reason, about, zones[].wb). Essai : tests/test-transcription-versions-contexte.js.
 */
(() => {
    'use strict';
    const i18n = (s, v) => { const I = window.LCNDA_I18N; if (v) v = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x])); return I ? I.t(s, v) : (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s); };
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    /* ═════════ 4. ❓ Pourquoi cet acte a été fait (acte de notoriété) ═════════ */
    // [clé, symbole, dans la liste, en bref (fiche, visionneuse), ce qui le trahit dans le texte]
    const REASONS = [
        ['mariage', '💍', 'Prouver le célibat ou l’identité en vue d’un mariage', 'pour prouver le célibat ou l’identité avant un mariage', /\b(?:en\s+vue\s+d[ue]\s+(?:son\s+|leur\s+)?mariage|contracter\s+mariage|pour\s+(?:se\s+)?marier|c[ée]libat(?:aire)?|n['’](?:a|avoir)\s+jamais\s+[ée]t[ée]\s+mari[ée])/i],
        ['naissance', '📄', 'Remplacer un acte de naissance perdu ou introuvable', 'pour remplacer un acte de naissance perdu', /\bacte\s+de\s+naissance\b[^.;\n]{0,60}\b(?:perdu|[ée]gar[ée]|introuvable|d[ée]truit|br[uû]l[ée])|ne\s+pouvoir\s+(?:repr[ée]senter|produire)\s+(?:son|l['’])\s*acte\s+de\s+naissance/i],
        ['succession', '⚖️', 'Succession, héritage', 'pour une succession', /\b(?:succession|h[ée]riti(?:er|[èe]re)s?|h[ée]r[ée]dit[ée]|h[ée]ritage)\b/i],
        ['pension', '🎖', 'Pension, solde, droits d’un militaire ou d’une veuve', 'pour une pension ou des droits', /\b(?:pension|solde|invalide|veuve\s+d['’]un\s+(?:militaire|soldat)|militaire)\b/i],
        ['autre', '✎', 'Autre…', 'pour une autre raison', null]];
    const reasonOf = k => REASONS.find(r => r[0] === k) || null;
    /** « 🧭 Repérer » : la raison lue dans le texte (la première qui se voit, dans l'ordre de la liste) → {k, s, e} | null */
    function reasonGuess(text) {
        for (const [k, , , , rx] of REASONS) { if (!rx) continue; const m = rx.exec(String(text || '')); if (m) return {k, s: m.index, e: m.index + m[0].length}; }
        return null;
    }
    /** la raison en bref, pour la fiche, la visionneuse, la page du document */
    function reasonHtml(r, {full = true} = {}) {
        const x = r && reasonOf(r.k); if (!x) return '';
        return `<span class="h-why-tag"><span class="ui-badge is-blue">${x[1]} ${esc(i18n(x[3]))}</span>${full && r.t ? `<small class="muted" data-i18n-off>${esc(r.t)}</small>` : ''}</span>`;
    }
    /** le choix dans l'acte (barre au-dessus du texte, et 🧩 Gabarit de la notoriété) */
    function whyHtml(r) {
        const auto = !!(r && r.auto);
        return `<span class="h-why-k${auto ? ' is-auto' : ''}"><label>❓ <b>${esc(i18n('Pourquoi cet acte a été fait'))}</b> <select data-tx-why-k title="${esc(i18n('Pourquoi cet acte a été fait'))}"><option value="">${esc(i18n('— à choisir —'))}</option>${REASONS.map(([k, ic, l]) => `<option value="${k}" ${r?.k === k ? 'selected' : ''}>${ic} ${esc(i18n(l))}</option>`).join('')}</select></label>
            <input type="text" data-tx-why-t maxlength="300" value="${esc(r?.t || '')}" placeholder="${esc(i18n('Précision (libre)'))}" aria-label="${esc(i18n('Précision (libre)'))}" spellcheck="false" autocomplete="off">${auto ? `<small class="h-why-auto" title="${esc(i18n('Repéré dans le texte par « 🧭 Repérer » : à vérifier'))}">🧭 ${esc(i18n('repéré, à vérifier'))}</small>` : ''}</span>`;
    }
    /** l'indice de « Aider l'IA » (en français : la consigne de l'IA l'est) */
    const reasonHint = r => { const x = r && reasonOf(r.k); return x ? `${x[3].replace(/^pour /, '')}${r.t ? ` — ${r.t}` : ''}` : ''; };

    /* ═════════ 2. 🔦 les mots choisis, sur l'image ═════════ */
    const WCOL_KEY = 'genealogie-htr-word-color';
    const WORD_COLORS = [['#055dff', 'Bleu'], ['#e03131', 'Rouge'], ['#2f9e44', 'Vert'], ['#f08c00', 'Orange'], ['#ae3ec9', 'Violet'], ['#111111', 'Noir']];
    const wordColor = () => { try { const v = localStorage.getItem(WCOL_KEY); return WORD_COLORS.some(c => c[0] === v) ? v : WORD_COLORS[0][0]; } catch (_) { return WORD_COLORS[0][0]; } };
    const setWordColor = v => { if (!WORD_COLORS.some(c => c[0] === v)) return; try { localStorage.setItem(WCOL_KEY, v); } catch (_) {} };
    const wordColorHtml = () => { const cur = wordColor();
        return `<span class="h-tx-wcol" role="radiogroup" aria-label="${esc(i18n('Couleur du cadre des mots choisis'))}" title="${esc(i18n('Couleur du cadre des mots choisis'))}">🔦${WORD_COLORS.map(([c, n]) => `<button type="button" role="radio" data-tx-wcol="${c}" aria-checked="${c === cur}" class="${c === cur ? 'is-on' : ''}" style="--c:${c}" title="${esc(i18n(n))}" aria-label="${esc(i18n(n))}"></button>`).join('')}</span>`; };
    /**
     * les cadres des mots choisis [s, e) : un par ligne, dans la zone de la ligne (pixels de l'image).
     * zones : celles de la page affichée ; une zone avec wb (la place de chaque mot donnée par la lecture) et un texte inchangé (wl) → exact.
     */
    function wordBoxes(text, zones, s, e) {
        const out = []; let a = Math.max(0, Math.min(s, e)); const end = Math.max(s, e);
        while (a < end) {
            let le = text.indexOf('\n', a); if (le < 0) le = text.length;
            let a2 = a, b2 = Math.min(end, le);
            while (a2 < b2 && /\s/.test(text[a2])) a2++; while (b2 > a2 && /\s/.test(text[b2 - 1])) b2--;
            if (b2 > a2) {
                // la zone qui contient ces mots (la plus serrée) ; sinon celle qui en couvre le plus (une zone décalée d'une lettre,
                // un choix qui commence à la 1re lettre de la ligne ou finit sur la ponctuation : le cadre s'affiche quand même)
                const ov = q => Math.min(q.e, b2) - Math.max(q.s, a2), inside = q => q.s <= a2 && q.e >= b2;
                const z = zones.filter(q => q.e > q.s && q.w > 0 && q.h > 0 && ov(q) > 0).sort((p, q) => (inside(q) - inside(p)) || (inside(p) ? (p.e - p.s) - (q.e - q.s) : ov(q) - ov(p)))[0];
                if (z) {
                    const zt = text.slice(z.s, z.e); let x0 = 0, x1 = 0, exact = false;
                    if (Array.isArray(z.wb) && z.wb.length && Number(z.wl) === zt.length) {
                        const ws = z.wb.filter(w => z.s + w[1] > a2 && z.s + w[0] < b2);
                        if (ws.length) { x0 = Math.min(...ws.map(w => w[2])); x1 = Math.max(...ws.map(w => w[3])); exact = x1 > x0; }
                    }
                    if (!exact) { // ≈ d'après la place des lettres dans la ligne (sans les espaces du bord)
                        const lead = zt.length - zt.replace(/^\s+/, '').length, core = Math.max(1, zt.trim().length);
                        const f0 = clamp((a2 - z.s - lead) / core, 0, 1), f1 = clamp((b2 - z.s - lead) / core, 0, 1);
                        x0 = z.x + z.w * f0; x1 = z.x + z.w * Math.max(f1, f0 + .02);
                    }
                    const pad = z.h * .1;
                    out.push({x: x0, y: z.y + pad, w: Math.max(2, x1 - x0), h: Math.max(2, z.h - 2 * pad), exact, label: text.slice(a2, b2)});
                }
            }
            a = le + 1;
        }
        return out;
    }
    /**
     * l'inverse : un clic sur l'image (x, y en pixels de l'image) → le mot le plus proche dans le texte {s, e, word} | null.
     * La zone de la ligne sous le clic (ou la plus proche, à moins d'une demi-hauteur de ligne) ; dans la ligne, la place exacte des
     * mots si la lecture l'a donnée (wb), sinon ≈ d'après la place des lettres (comme wordBoxes).
     */
    function wordAt(text, zones, x, y) {
        text = String(text || '');
        const lines = (zones || []).filter(q => q.e > q.s && q.w > 0 && q.h > 0 && q.e <= text.length);
        const dist = q => { const dx = x < q.x ? q.x - x : x > q.x + q.w ? x - q.x - q.w : 0, dy = y < q.y ? q.y - y : y > q.y + q.h ? y - q.y - q.h : 0; return Math.hypot(dx, dy); };
        const z = lines.map(q => [q, dist(q), q.w * q.h]).filter(([q, d]) => d <= q.h / 2).sort((a, b) => a[1] - b[1] || a[2] - b[2])[0]?.[0];
        if (!z) return null;
        const zt = text.slice(z.s, z.e), words = []; const rx = /\S+/g; let m;
        while ((m = rx.exec(zt))) { if (/^\[(?:\?|illisible)\]$/.test(m[0])) continue; words.push({s: z.s + m.index, e: z.s + m.index + m[0].length}); }
        if (!words.length) return null;
        let best = null;
        if (Array.isArray(z.wb) && z.wb.length && Number(z.wl) === zt.length) {
            const wb = z.wb.map(w => ({s: z.s + w[0], e: z.s + w[1], d: x < w[2] ? w[2] - x : x > w[3] ? x - w[3] : 0})).sort((a, b) => a.d - b.d)[0];
            if (wb) best = words.find(w => w.s < wb.e && wb.s < w.e) || null;
        }
        if (!best) { // ≈ la lettre sous le clic, puis le mot qui la contient (ou le plus proche)
            const lead = zt.length - zt.replace(/^\s+/, '').length, core = Math.max(1, zt.trim().length);
            const at = z.s + lead + clamp((x - z.x) / z.w, 0, 1) * core;
            best = words.map(w => ({...w, d: at < w.s ? w.s - at : at > w.e ? at - w.e : 0})).sort((a, b) => a.d - b.d)[0];
        }
        const word = text.slice(best.s, best.e).replace(/[,.;:!?»«"]+$/, '');
        return {s: best.s, e: best.s + Math.max(1, word.length), word, zone: z.id};
    }
    /** les mots lus à la main → wb (début, fin dans le texte de la ligne ; x de l'image) ; null si une boîte manque */
    function wordsOfLine(words, ox = 0) {
        const out = []; let at = 0;
        for (const w of words || []) { const t = String(w.t || ''); if (!t) continue; if (!Array.isArray(w.bbox)) return null; out.push([at, at + t.length, Math.round(w.bbox[0] + ox), Math.round(w.bbox[2] + ox)]); at += t.length + 1; }
        return out.length ? out : null;
    }

    /* ═════════ 1. 🕘 la bande « Versions » ═════════ */
    const apiPost = (action, body) => A().api(action, {}, {method: 'POST', body}).then(r => { if (r && r.error) throw new Error(r.error); return (r && r.result) || r; });
    /** 🗑 des versions supprimées d'un coup (toutes ou aucune) → {versions, undo()} : ↶ Annuler les remet telles quelles (même id, même date) */
    async function removeVersions(vs) {
        const r = await apiPost('delete_act_transcription_versions', {ids: vs.map(v => Number(v.id))});
        return {versions: r.versions || [], undo: () => apiPost('restore_act_transcription_versions', {versions: r.versions || []})};
    }
    const LINK_SKIP = ['sign', 'note', 'skip'];
    /**
     * ✎ les zones de l'image reliées aux lignes d'un texte (oldText) → reliées aux lignes d'un autre texte (newText) :
     * même nombre de lignes → la zone de la ligne i va sur la ligne i ; sinon, autant de zones de ligne que de lignes → dans l'ordre ;
     * sinon (et les signatures, notes, passages dans une ligne) : plus reliées (s = e = 0), à relier à la main. linesOf : ext.txSnap.textLinesOf.
     * → {zones, linked, unlinked}
     */
    function relinkZones(zones, oldText, newText, linesOf) {
        oldText = String(oldText ?? ''); newText = String(newText ?? '');
        const L0 = linesOf(oldText), L1 = linesOf(newText);
        const lineOf = z => { if (!z || !(z.e > z.s) || LINK_SKIP.includes(z.kind)) return -1;
            const k = L0.findIndex(l => { const n = Math.min(z.e, l.e) - Math.max(z.s, l.s); return n > 0 && n >= (l.e - l.s) * .6 && n >= (z.e - z.s) * .6; }); return k; };
        const idx = (zones || []).map(lineOf), onLines = idx.filter(k => k >= 0);
        let map = null;
        if (onLines.length && L0.length === L1.length) map = i => idx[i];
        else if (onLines.length && onLines.length === L1.length && new Set(onLines).size === onLines.length) { const order = [...onLines].sort((a, b) => a - b); map = i => order.indexOf(idx[i]); }
        let linked = 0, unlinked = 0;
        const out = (zones || []).map((z, i) => {
            const c = {...z}; delete c.wb; delete c.wl;
            const l = map && idx[i] >= 0 ? L1[map(i)] : null;
            if (l) { c.s = l.s; c.e = l.e; if (Array.isArray(z.wb) && newText.slice(l.s, l.e) === oldText.slice(z.s, z.e)) { c.wb = z.wb; c.wl = z.wl; } linked++; return c; }
            if (z.e > z.s) unlinked++;
            c.s = 0; c.e = 0; return c;
        });
        return {zones: out, linked, unlinked};
    }
    const IMG_SHORT = {auto: 'image améliorée', mine: 'avec « Mieux voir »', orig: 'image d’origine'};
    const IMG_LONG = {auto: '✨ image améliorée automatiquement', mine: '🎚️ avec mon réglage « Mieux voir »', orig: '🖼 image d’origine'};
    const when = at => { const d = new Date(String(at || '').replace(' ', 'T') + (/Z|[+-]\d\d:?\d\d$/.test(String(at || '')) ? '' : 'Z')); if (Number.isNaN(d.getTime())) return ''; const L = document.documentElement.lang || 'fr';
        return `${d.toLocaleDateString(L, {day: '2-digit', month: '2-digit'})} ${d.toLocaleTimeString(L, {hour: '2-digit', minute: '2-digit'})}`; };
    const modelName = m => String(m || '').replace(/\.(mlmodel|pt|safetensors)$/i, '').replace(/-instruct$/i, '').replace(/:/, ' ').slice(0, 40);
    /** une version : [symbole, nom, petit texte, sorte] — sorte : read (une lecture), copy, named */
    function chipOf(v) {
        const [src, model0] = String(v.source || '').split(/:(.*)/s), model = v.meta?.model || model0 || '', small = [when(v.created_at), v.meta?.img ? i18n(IMG_SHORT[v.meta.img]) : ''].filter(Boolean).join(' · ');
        if (src === 'deep') return ['🤖', modelName(model) || i18n('Lecture approfondie'), small, 'read'];
        if (src === 'htr') return ['✍️', i18n('Écriture à la main'), small, 'read'];
        if (src === 'ocr') return ['🔎', i18n('OCR (texte imprimé)'), small, 'read'];
        if (src === 'merge') return ['⚖️', i18n('Fusion des lectures'), small, 'read'];
        if (src === 'copy') return ['📋', i18n(v.label || 'Copie'), [when(v.created_at), v.meta?.from ? i18n('depuis {x}', {x: v.meta.from}) : ''].filter(Boolean).join(' · '), 'copy'];
        return ['🕘', i18n(v.label || 'Version'), when(v.created_at), 'named'];
    }
    /** ce que la version retient (la bulle de la pastille, l'aperçu) */
    function metaLines(v) {
        const [src] = String(v.source || '').split(':'), m = v.meta || {}, out = [];
        if (src === 'deep') out.push(`🔬 ${i18n('Lecture approfondie')}${m.model ? ` · ${modelName(m.model)}` : ''}`);
        if (src === 'htr') out.push(`✍ ${i18n('Écriture à la main')}${m.model ? ` · ${modelName(m.model)}` : ''}`);
        if (v.created_at) out.push(`🕘 ${when(v.created_at)}`);
        if (m.img) out.push(i18n(IMG_LONG[m.img]));
        if (m.part) out.push(`▭ ${i18n(m.part === 'zone' ? 'la zone choisie' : 'toute la page')}`);
        if (src === 'deep' || src === 'htr') out.push(m.hints ? `🧠 ${i18n('avec « Aider l’IA » ({n} indices)', {n: m.hints})}` : `🧠 ${i18n('sans « Aider l’IA »')}`);
        if (m.from) out.push(`⧉ ${i18n('depuis {x}', {x: m.from})}`);
        return out;
    }
    /** 🧠 la bulle d'un mot douteux [?] d'une lecture faite avec des indices de « Aider l'IA » */
    const hintTitle = () => `🧠 ${i18n('lu avec un indice')} — ${i18n('L’IA a lu ce mot en s’aidant d’un indice de « Aider l’IA » : vérifie-le sur l’image.')}`;
    /** les mots marqués [?] → [{s, e, word}] (le mot, sans la marque) */
    function doubtWords(text) {
        const out = [], rx = /(\S+?)\s?\[\?\]/g; let m;
        while ((m = rx.exec(String(text || '')))) { const w = m[1].replace(/[,.;:!?»«"’']+$/, '') || m[1]; out.push({s: m.index, e: m.index + w.length, word: w}); }
        return out;
    }
    /** le texte en lecture seule : les mots douteux [?] soulignés ; hinted : la lecture s'est aidée d'indices (la bulle « 🧠 lu avec un indice ») */
    const roHtml = (body, hinted = 0) => esc(body).replace(/(\S+)\s?\[\?\]/g, hinted ? `<span class="h-tx-doubt is-hint" title="${esc(hintTitle())}">$1</span>` : '<span class="h-tx-doubt">$1</span>').replace(/\[illisible\]/g, '<span class="h-tx-doubt">[illisible]</span>').replace(/\n/g, '<br>');
    const MAX_CHIPS = 4;
    const kiosk = () => !!document.body?.classList.contains('is-kiosk'); // mode consultation : rien ne s'écrit (le serveur refuse aussi)
    /**
     * host : la bande ; o = {list(), body(id) → {body}, use(v), compare(v), duplicate(v | null), rename(v), openAll(), dim(on)}.
     * Renvoie {refresh(), close(), shown()}.
     */
    function versionsStrip(host, prev, o) {
        let items = [], open = null, working = null; // working : {v, was, body} — ✎ la version sur laquelle on travaille dans l'éditeur
        const paint = () => {
            const mine = items.filter(v => !v.auto), shown = mine.slice(0, MAX_CHIPS);
            if (working && !shown.some(v => v.id === working.v.id)) { const w = items.find(v => v.id === working.v.id); if (w) shown.push(w); }
            const more = items.length - shown.length, meOn = !open && !working;
            const onV = v => open?.id === v.id || (!open && working?.v.id === v.id);
            host.hidden = !items.length;
            const wk = working && chipOf(working.v);
            host.innerHTML = `<span class="h-tx-vlab">🕘 ${esc(i18n('Versions'))}</span>
                <button type="button" class="h-tx-chip2${meOn ? ' is-on' : ''}" data-tx-v="me" aria-pressed="${meOn}" title="${esc(i18n('Ma version : le texte du document. Elle ne se supprime pas (pour la remplacer, ouvre une autre version et « Utiliser cette version »).'))}">✍ ${esc(i18n('Ma version'))}${working ? '' : ` <small>${esc(i18n('(actuelle)'))}</small>`}</button>
                ${shown.map(v => { const [ic, n, sm, kind] = chipOf(v); return `<button type="button" class="h-tx-chip2${kind === 'read' ? ' is-ai' : ''}${onV(v) ? ' is-on' : ''}${working?.v.id === v.id ? ' is-work' : ''}" data-tx-v="${v.id}" aria-pressed="${onV(v)}" title="${esc(metaLines(v).join('\n'))}">${working?.v.id === v.id ? '✎ ' : ''}${ic} <span data-i18n-off>${esc(n)}</span>${sm ? ` <small>· ${esc(sm)}</small>` : ''}</button>`; }).join('')}
                ${more > 0 ? `<button type="button" class="h-tx-chip2" data-tx-vmore title="${esc(i18n('Toutes les versions, y compris les automatiques'))}">⋯ ${esc(i18n(more > 1 ? '{n} autres' : '{n} autre', {n: more}))}</button>` : ''}
                <button type="button" class="button small secondary h-tx-vdup" data-tx-vdup title="${esc(i18n('Garder une copie de la version affichée, par exemple ce que l’IA a lu avant de corriger'))}">⧉ ${esc(i18n('Dupliquer'))}</button>
                ${wk ? `<div class="h-tx-vwork" data-tx-vwork role="status">✎ ${esc(i18n('Tu travailles sur :'))} <b>${wk[0]} <span data-i18n-off>${esc(wk[1])}</span>${wk[2] ? ` · <span data-i18n-off>${esc(wk[2])}</span>` : ''}</b> <button type="button" class="link-button" data-tx-vback title="${esc(i18n('Remettre le texte et les zones d’avant ; cette version garde ses zones reliées'))}">↩ ${esc(i18n('Revenir à ma version'))}</button></div>` : ''}`;
        };
        async function show(v) {
            open = v; paint(); o.dim?.(true); prev.hidden = false; prev.innerHTML = `<p class="muted">…</p>`;
            let x; try { x = await o.body(v.id); } catch (e) { prev.hidden = true; open = null; paint(); o.dim?.(false); return A().toast(e.message, 'error'); }
            if (open !== v) return;
            const [ic, n, , kind] = chipOf(v);
            prev.innerHTML = `<div class="h-tx-vhead"><b>${ic} <span data-i18n-off>${esc(n)}</span></b> <span class="muted">— ${esc(i18n('lecture seule'))}</span></div>
                <div class="h-tx-vmeta">${metaLines(v).map(s => `<span class="ui-badge is-grey">${esc(s)}</span>`).join('')}</div>
                <div class="h-tx-vro" data-tx-vro>${roHtml(x.body || '', Number(x.data?.meta?.hints || v.meta?.hints) || 0)}</div>
                <div class="h-tx-vbtns"><button type="button" class="button small" data-tx-vuse>✓ ${esc(i18n('Utiliser cette version'))}</button>${o.work && !kiosk() && working?.v.id !== v.id ? `<button type="button" class="button small secondary" data-tx-vedit title="${esc(i18n('Elle devient le texte de l’éditeur (le tien est gardé) : relie les lignes de l’image à ses lignes, corrige-la ; « ↩ Revenir à ma version » ensuite'))}">✎ ${esc(i18n('Travailler sur cette version dans l’éditeur'))}</button>` : ''}<button type="button" class="button small secondary" data-tx-vcmp>⚖️ ${esc(i18n('Comparer avec ma version'))}</button>${kind !== 'read' ? `<button type="button" class="button small secondary" data-tx-vren>✎ ${esc(i18n('Renommer'))}</button>` : ''}${kiosk() ? '' : `<button type="button" class="button small secondary danger" data-tx-vdel title="${esc(i18n('On peut encore l’annuler juste après.'))}">🗑 ${esc(i18n('Supprimer cette version'))}</button>`}<button type="button" class="button small secondary" data-tx-vclose>× ${esc(i18n('Fermer'))}</button></div>`;
        }
        function close() { if (!open && prev.hidden) return; open = null; prev.hidden = true; prev.innerHTML = ''; o.dim?.(false); paint(); }
        host.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.txV === 'me') return close();
            if (b.dataset.txV) { const v = items.find(x => String(x.id) === b.dataset.txV); if (v) { if (open?.id === v.id) return close(); show(v); } return; }
            if ('txVmore' in b.dataset) return o.openAll?.();
            if ('txVback' in b.dataset) { b.disabled = true; try { await o.back?.(); } finally { b.disabled = false; } return; }
            if ('txVdup' in b.dataset) { b.disabled = true; try { await o.duplicate(open); } finally { b.disabled = false; } }
        });
        prev.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b || !open) return; const v = open;
            if ('txVclose' in b.dataset) return close();
            if ('txVcmp' in b.dataset) return o.compare(v);
            if ('txVuse' in b.dataset) { const w = working; close(); if (w) { working = null; await o.keep?.(w); paint(); } return o.use(v); }
            if ('txVren' in b.dataset) { await o.rename(v); return; }
            if ('txVedit' in b.dataset) { close(); return o.work?.(v); }
            if ('txVdel' in b.dataset) return removeOne(v);
        });
        /** 🗑 depuis l'aperçu : pas de question (↶ Annuler la remet telle quelle) */
        async function removeOne(v) {
            const name = chipOf(v)[1], w = working?.v.id === v.id ? working : null;
            close();
            let r; try { r = await (o.remove || removeVersions)([v]); } catch (e) { return A().toast(e.message, 'error'); }
            if (w) working = null; // le texte reste (c'est maintenant celui du document) ; la version n'existe plus
            await refresh(); o.onRemoved?.([v]);
            A().undoToast?.(i18n('Version supprimée : « {x} »', {x: name}), {undo: async () => { await r.undo(); if (w && !working) working = w; await refresh(); }, icon: '🗑'});
        }
        async function refresh() {
            try { items = await o.list(); } catch (_) { items = []; }
            if (working && !items.some(v => v.id === working.v.id)) working = null;
            if (open && !items.some(v => v.id === open.id)) close(); else { if (open) open = items.find(v => v.id === open.id) || open; paint(); }
        }
        let rt = 0; const soon = (ms = 250) => { clearTimeout(rt); rt = setTimeout(refresh, ms); };
        return {refresh, soon, close, isOpen: () => !!open, working: () => working, setWorking: w => { working = w || null; paint(); }};
    }

    /* ═════════ 3. 🧠 Aider l'IA ═════════ */
    const HINT_SEL = new Map(); // le choix des cases pendant la session (clé de l'acte → {clé de l'indice: oui / non})
    /**
     * o = {key, title(), setTitle(v), about(), setAbout(v), people() → [{name, role, person_id}], hints() → Promise<[{key, icon, label, text, on}]>,
     *      reason() → {k, t} | null, doc() → « Acte de notoriété (1813, Treignac) », lang(), onRead(withHints)}
     */
    function hintsOf(o, list) {
        const sel = HINT_SEL.get(o.key) || {}; HINT_SEL.set(o.key, sel);
        const all = [...list], r = o.reason?.(), rh = reasonHint(r);
        if (rh) all.unshift({key: 'reason', icon: '❓', label: 'pourquoi cet acte', text: rh, on: true});
        return all.map(h => ({...h, checked: h.key in sel ? !!sel[h.key] : !!h.on}));
    }
    /** ce qui part vers l'IA (le serveur le met en forme) ; null : rien à dire */
    function contextOf(o, list) {
        const hs = hintsOf(o, list).filter(h => h.checked).map(h => `${h.label} : ${h.text}`), about = String(o.about?.() || '').trim(), doc = String(o.doc?.() || '').trim();
        return doc || about || hs.length ? {doc, about, hints: hs} : null;
    }
    const checkedCount = (o, list) => hintsOf(o, list).filter(h => h.checked).length;
    async function openAide(o) {
        let list = []; try { list = await o.hints(); } catch (_) { list = []; }
        const people = (o.people?.() || []).filter(p => p.person_id), sel = HINT_SEL.get(o.key) || {}; HINT_SEL.set(o.key, sel);
        let read = null;
        const dlg = ext.openDialog({eyebrow: i18n('LECTURE PAR L’IA'), title: `🧠 ${i18n('Aider l’IA à lire cet acte')}`, wide: true, submitLabel: `✨ ${i18n('Lire avec ces indices')}`, closeLabel: i18n('Lire sans'),
            body: `<div class="h-ia" data-ia>
                <p class="muted h-ia-use">${esc(i18n('Utilisé par « ✨ Lire » (lecture approfondie) et « 👁 Relire ligne à ligne ».'))}</p>
                <h4>${esc(i18n('Titre'))}</h4><input type="text" data-ia-title maxlength="200" value="${esc(o.title?.() || '')}" spellcheck="false" autocomplete="off" aria-label="${esc(i18n('Titre'))}">
                <h4>${esc(i18n('En quelques mots, de quoi parle l’acte ?'))}</h4><textarea data-ia-about rows="2" maxlength="600" placeholder="${esc(i18n('ex. Acte de notoriété de Gaspard MAZAUD pour prouver qu’il est célibataire en vue de son mariage'))}" aria-label="${esc(i18n('En quelques mots, de quoi parle l’acte ?'))}">${esc(o.about?.() || '')}</textarea>
                <h4>${esc(i18n('Personnes déjà reliées à l’acte'))}</h4><div class="h-ia-pers">${people.length ? people.map(p => `<span>👤 <span data-i18n-off>${esc(p.name)}</span>${p.role ? ` <small class="muted">· ${esc(i18n(p.role, {ctx: 'role'}))}</small>` : ''}</span>`).join('') : `<span class="muted is-none">${esc(i18n('Aucune fiche reliée pour l’instant : « 🧭 Repérer », puis « 🔗 Relier… ».'))}</span>`}</div>
                <h4>${esc(i18n('Ce que la base sait déjà (indices)'))}</h4><div class="h-ia-hints" data-ia-hints></div>
                <div class="ui-notice ui-notice-warn h-txa-msg" role="note"><span class="ui-notice-ico" aria-hidden="true">⚠️</span><span><b>${esc(i18n('L’IA ne doit rien inventer.'))}</b> ${esc(i18n('Les indices servent seulement à lire un mot douteux. Un mot lu grâce à un indice reste marqué douteux [?] jusqu’à ce que tu le valides. Ce qui n’est pas sur l’image n’est jamais ajouté.'))}</span></div>
                <details class="h-ia-sent" data-ia-sentbox><summary>${esc(i18n('Voir ce qui est envoyé'))}</summary><pre data-ia-sent data-i18n-off></pre></details>
                <p class="muted h-ia-count" data-ia-count></p></div>`,
            onOpen: d => { d.querySelector('.modal-actions [data-h-close]')?.addEventListener('click', () => { read = false; }); d.addEventListener('close', () => { if (read !== null) o.onRead?.(read); }); },
            onSubmit: () => { read = true; }});
        const box = dlg.querySelector('[data-ia]');
        const paintHints = () => { const hs = hintsOf(o, list);
            box.querySelector('[data-ia-hints]').innerHTML = hs.length ? hs.map(h => `<label class="h-ia-hint"><input type="checkbox" data-ia-hint="${esc(h.key)}" ${h.checked ? 'checked' : ''}> <span>${h.icon} <b>${esc(i18n(h.label))} :</b> <span data-i18n-off>${esc(h.text)}</span></span></label>`).join('')
                : `<p class="muted">${esc(i18n('Rien encore : relie des personnes de l’acte à leur fiche pour que la base aide (mariages connus, façons d’écrire les noms, lieux…).'))}</p>`;
            const n = hs.filter(h => h.checked).length; box.querySelector('[data-ia-count]').textContent = i18n(n > 1 ? '{n} indices cochés' : '{n} indice coché', {n}); };
        let st = 0;
        const paintSent = () => { clearTimeout(st); st = setTimeout(async () => { const pre = box.querySelector('[data-ia-sent]'); if (!pre) return;
            try { const r = await A().api('tx_deep_prompt', {}, {method: 'POST', body: {language: o.lang?.() || 'fra', context: contextOf(o, list) || {}}}); pre.textContent = (r.result || r).prompt || ''; } catch (e) { pre.textContent = e.message; } }, 150); };
        box.addEventListener('change', e => { const k = e.target.dataset?.iaHint; if (!k) return; sel[k] = e.target.checked; paintHints(); paintSent(); o.onChange?.(); });
        box.addEventListener('input', e => { if (e.target.matches('[data-ia-title]')) o.setTitle?.(e.target.value); if (e.target.matches('[data-ia-about]')) o.setAbout?.(e.target.value); paintSent(); });
        paintHints(); paintSent();
        return dlg;
    }

    ext.txCtx = {REASONS, reasonOf, reasonGuess, reasonHtml, whyHtml, reasonHint, WCOL_KEY, WORD_COLORS, wordColor, setWordColor, wordColorHtml, wordBoxes, wordsOfLine, wordAt, doubtWords, hintTitle, roHtml,
        chipOf, metaLines, versionsStrip, removeVersions, relinkZones, openAide, contextOf, checkedCount, hintsOf};
})();
