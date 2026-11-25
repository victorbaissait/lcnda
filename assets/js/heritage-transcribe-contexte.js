/* LCNDA — 📜 Atelier de transcription : versions, mots sur l'image, « Aider l'IA », pourquoi l'acte de notoriété
 * (maquette validée : docs/design/transcription-versions-contexte.html ; réponses retenues : celles conseillées).
 *  1. 🕘 la bande « Versions » au-dessus de « 📄 Ce texte est celui du document… » : ma version, chaque lecture (modèle, date, image envoyée),
 *     les copies ; un clic = l'aperçu en lecture seule (« Utiliser cette version », « Comparer avec ma version », « Fermer ») ;
 *     « ⧉ Dupliquer » garde une copie ; les versions automatiques et les plus anciennes dans « ⋯ N autres » (la fenêtre 🕘 Versions).
 *  2. 🔦 les mots choisis dans le texte : un cadre serré dans la bande de leur ligne (≈ estimé d'après la place des lettres ; exact si la
 *     lecture a donné la place de chaque mot) ; sa couleur se choisit (bleu au départ), retenue dans genealogie-htr-word-color.
 *  3. 🧠 « Aider l'IA » : titre, de quoi parle l'acte, personnes reliées, indices de la base (cochés au départ : l'événement, les noms, les lieux) ;
 *     le texte envoyé se voit tel quel (le serveur le compose : tx_deep_prompt, lib/transcription_actes.php).
 *  4. ❓ acte de notoriété : « Pourquoi cet acte a été fait » (data.reason = {k, t, auto}), pré-rempli par « 🧭 Repérer ».
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
                const z = zones.filter(q => q.e > q.s && q.w > 0 && q.h > 0 && q.s <= a2 && q.e >= b2).sort((p, q) => (p.e - p.s) - (q.e - q.s))[0];
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
    /** les mots lus à la main → wb (début, fin dans le texte de la ligne ; x de l'image) ; null si une boîte manque */
    function wordsOfLine(words, ox = 0) {
        const out = []; let at = 0;
        for (const w of words || []) { const t = String(w.t || ''); if (!t) continue; if (!Array.isArray(w.bbox)) return null; out.push([at, at + t.length, Math.round(w.bbox[0] + ox), Math.round(w.bbox[2] + ox)]); at += t.length + 1; }
        return out.length ? out : null;
    }

    /* ═════════ 1. 🕘 la bande « Versions » ═════════ */
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
    /** le texte en lecture seule : les mots douteux [?] soulignés */
    const roHtml = body => esc(body).replace(/(\S+)\s?\[\?\]/g, '<span class="h-tx-doubt">$1</span>').replace(/\[illisible\]/g, '<span class="h-tx-doubt">[illisible]</span>').replace(/\n/g, '<br>');
    const MAX_CHIPS = 4;
    /**
     * host : la bande ; o = {list(), body(id) → {body}, use(v), compare(v), duplicate(v | null), rename(v), openAll(), dim(on)}.
     * Renvoie {refresh(), close(), shown()}.
     */
    function versionsStrip(host, prev, o) {
        let items = [], open = null;
        const paint = () => {
            const mine = items.filter(v => !v.auto), shown = mine.slice(0, MAX_CHIPS), more = items.length - shown.length;
            host.hidden = !items.length;
            host.innerHTML = `<span class="h-tx-vlab">🕘 ${esc(i18n('Versions'))}</span>
                <button type="button" class="h-tx-chip2${open ? '' : ' is-on'}" data-tx-v="me" aria-pressed="${!open}">✍ ${esc(i18n('Ma version'))} <small>${esc(i18n('(actuelle)'))}</small></button>
                ${shown.map(v => { const [ic, n, sm, kind] = chipOf(v); return `<button type="button" class="h-tx-chip2${kind === 'read' ? ' is-ai' : ''}${open?.id === v.id ? ' is-on' : ''}" data-tx-v="${v.id}" aria-pressed="${open?.id === v.id}" title="${esc(metaLines(v).join('\n'))}">${ic} <span data-i18n-off>${esc(n)}</span>${sm ? ` <small>· ${esc(sm)}</small>` : ''}</button>`; }).join('')}
                ${more > 0 ? `<button type="button" class="h-tx-chip2" data-tx-vmore title="${esc(i18n('Toutes les versions, y compris les automatiques'))}">⋯ ${esc(i18n('{n} autres', {n: more}))}</button>` : ''}
                <span class="spacer"></span><button type="button" class="button small secondary" data-tx-vdup title="${esc(i18n('Garder une copie de la version affichée, par exemple ce que l’IA a lu avant de corriger'))}">⧉ ${esc(i18n('Dupliquer'))}</button>`;
        };
        async function show(v) {
            open = v; paint(); o.dim?.(true); prev.hidden = false; prev.innerHTML = `<p class="muted">…</p>`;
            let x; try { x = await o.body(v.id); } catch (e) { prev.hidden = true; open = null; paint(); o.dim?.(false); return A().toast(e.message, 'error'); }
            if (open !== v) return;
            const [ic, n, , kind] = chipOf(v);
            prev.innerHTML = `<div class="h-tx-vhead"><b>${ic} <span data-i18n-off>${esc(n)}</span></b> <span class="muted">— ${esc(i18n('lecture seule'))}</span></div>
                <div class="h-tx-vmeta">${metaLines(v).map(s => `<span class="ui-badge is-grey">${esc(s)}</span>`).join('')}</div>
                <div class="h-tx-vro" data-tx-vro>${roHtml(x.body || '')}</div>
                <div class="h-tx-vbtns"><button type="button" class="button small" data-tx-vuse>✓ ${esc(i18n('Utiliser cette version'))}</button><button type="button" class="button small secondary" data-tx-vcmp>⚖️ ${esc(i18n('Comparer avec ma version'))}</button>${kind !== 'read' ? `<button type="button" class="button small secondary" data-tx-vren>✎ ${esc(i18n('Renommer'))}</button>` : ''}<button type="button" class="button small secondary" data-tx-vclose>× ${esc(i18n('Fermer'))}</button></div>`;
        }
        function close() { if (!open && prev.hidden) return; open = null; prev.hidden = true; prev.innerHTML = ''; o.dim?.(false); paint(); }
        host.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.txV === 'me') return close();
            if (b.dataset.txV) { const v = items.find(x => String(x.id) === b.dataset.txV); if (v) { if (open?.id === v.id) return close(); show(v); } return; }
            if ('txVmore' in b.dataset) return o.openAll?.();
            if ('txVdup' in b.dataset) { b.disabled = true; try { await o.duplicate(open); } finally { b.disabled = false; } }
        });
        prev.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b || !open) return; const v = open;
            if ('txVclose' in b.dataset) return close();
            if ('txVcmp' in b.dataset) return o.compare(v);
            if ('txVuse' in b.dataset) { close(); return o.use(v); }
            if ('txVren' in b.dataset) { await o.rename(v); }
        });
        async function refresh() {
            try { items = await o.list(); } catch (_) { items = []; }
            if (open && !items.some(v => v.id === open.id)) close(); else { if (open) open = items.find(v => v.id === open.id) || open; paint(); }
        }
        let rt = 0; const soon = (ms = 250) => { clearTimeout(rt); rt = setTimeout(refresh, ms); };
        return {refresh, soon, close, isOpen: () => !!open};
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

    ext.txCtx = {REASONS, reasonOf, reasonGuess, reasonHtml, whyHtml, reasonHint, WCOL_KEY, WORD_COLORS, wordColor, setWordColor, wordColorHtml, wordBoxes, wordsOfLine,
        chipOf, metaLines, versionsStrip, openAide, contextOf, checkedCount, hintsOf};
})();
