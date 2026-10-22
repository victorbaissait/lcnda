/* LCNDA — K16 (interrupteur ou case à cocher) et K17 (nombres, durées, heures) — harmonisation validée.
 * Mode d'emploi : docs/UI.md, « K16 » et « K17 ».
 *
 * K16 — un interrupteur pour un réglage qui s'applique tout de suite ; une case à cocher pour choisir des éléments
 *   dans une liste, ou pour une option qu'on valide ensuite par un bouton (« Enregistrer », « Créer », « ⤓ Exporter »…).
 *     UI.toggleHtml('Afficher les dates', {checked, attrs: 'data-x="dates"', sub: 'petite ligne grise'})
 *     UI.checkHtml('Masquer les vivants', {checked, attrs: 'name="hide"'})
 *   UI.asToggle(label) montre une ancienne « case » (label.checkbox-line) en interrupteur (même case dessous).
 *
 * K17 — l'unité est DANS la case (« 12 | px »), jamais dans le libellé ; les heures et les durées s'écrivent
 *   librement (« 14 h 30 », « 2 h 15 », « 1 min 30 », « 90 s », « 1:30 ») avec « ✓ Compris : … » dessous.
 *   Les valeurs enregistrées ne changent pas : la case d'origine (type=time « 14:30 », nombre de secondes…) reste là,
 *   cachée, avec son nom et ses écouteurs ; seule la saisie change.
 *     <input type="number" data-unit="px">             → « 12 | px » (habillé tout seul)
 *     <input type="time" name="x">                      → « 14 h 30 » + « ✓ Compris : 14 h 30 » (la case garde « 14:30 »)
 *     <input type="number" data-ui-duration="s">        → « 1 min 30 s » (la case garde 90) ; "ms", "s", "min", "h"
 *     UI.numberField({name, value, unit, min, max, step}) · UI.timeField({name, value}) · UI.durationField({name, value, unit})
 *     UI.readTime('14h30') → {ok, value: '14:30', label: '14 h 30'} · UI.readDuration('1 min 30', {unit: 's'}) → {ok, value: 90, seconds: 90, label}
 *     UI.formatDuration(90, {unit: 's'}) → « 1 min 30 s » · UI.clock(3920) → « 1:05:20 » (affichage d'un lecteur : « 3:20 », « 1:05:00 »)
 */
(() => {
    'use strict';
    const UI = window.LCNDA_UI = window.LCNDA_UI || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const fire = (el, type) => el.dispatchEvent(new Event(type, {bubbles: true}));
    const isOff = el => !!el.closest?.('[data-ui-off]');
    const shown = el => el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
    const VALUE = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    const rawSet = (inp, v) => VALUE.set.call(inp, v);
    const rawGet = inp => VALUE.get.call(inp);
    function watchValue(inp, cb) { // même contrat que app-ui.js : champ.value = … écrit par l'outil met l'habillage à jour
        if (!inp._uiWatch) {
            inp._uiWatch = [];
            Object.defineProperty(inp, 'value', {configurable: true, get() { return rawGet(this); }, set(v) { rawSet(this, v); this._uiWatch.forEach(f => { try { f(); } catch (_) {} }); }});
            inp.form?.addEventListener('reset', () => setTimeout(() => inp._uiWatch.forEach(f => f())));
        }
        inp._uiWatch.push(cb);
    }
    const numText = (v, d = 3) => (Number.isFinite(v) ? String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',') : '');
    const cap = t => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

    /* ═════ K16 Interrupteur ou case ═════ */
    UI.toggleHtml = (label, {checked = false, attrs = '', sub = '', cls = '', disabled = false, html = false} = {}) =>
        `<label class="ui-toggle${cls ? ' ' + cls : ''}"><input type="checkbox" ${attrs}${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}><i></i><span>${html ? label : esc(label)}${sub ? ` <small class="muted">${html ? sub : esc(sub)}</small>` : ''}</span></label>`;
    UI.checkHtml = (label, {checked = false, attrs = '', sub = '', cls = '', disabled = false, html = false} = {}) =>
        `<label class="checkbox-line${cls ? ' ' + cls : ''}"><input type="checkbox" ${attrs}${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}> ${html ? label : esc(label)}${sub ? ` <small class="muted">${html ? sub : esc(sub)}</small>` : ''}</label>`;
    /** une case « .checkbox-line » montrée en interrupteur (la même case : rien ne change pour l'outil) */
    function asToggle(lab) {
        if (!lab || lab.classList.contains('ui-toggle') || lab.dataset.k16 === 'case') return;
        const cb = lab.querySelector(':scope > input[type=checkbox]'); if (!cb) return;
        lab.classList.remove('checkbox-line'); lab.classList.add('ui-toggle');
        if (cb.previousSibling && cb.previousSibling.nodeType === 3 && !cb.previousSibling.textContent.trim()) cb.previousSibling.remove();
        lab.insertBefore(cb, lab.firstChild);
        if (!(cb.nextElementSibling?.tagName === 'I' && cb.nextSibling === cb.nextElementSibling)) cb.after(document.createElement('i'));
        const t = lab.childNodes[2]; if (t && t.nodeType === 3) t.textContent = t.textContent.replace(/^\s+/, '');
    }
    UI.asToggle = asToggle;

    /* ═════ K17 Lire une heure ═════ */
    /** readTime('14 h 30' | '14:30' | '14h' | '9h05' | '1430' | 'midi' | '2 pm') → null (vide) | {ok:true, value:'14:30', label:'14 h 30'} | {ok:false, text} */
    UI.readTime = (raw, {seconds = false} = {}) => {
        let s = fold(raw).trim().replace(/\s+/g, ' ').replace(/^(a|vers|le)\s+/, '');
        if (!s) return null;
        const ex = 'exemples : 14 h 30, 14:30, 9h05, midi';
        if (/^midi( et quart| et demie?)?$/.test(s)) s = s.replace('midi', '12 h').replace(' et quart', ' 15').replace(/ et demie?/, ' 30');
        if (/^minuit( et quart| et demie?)?$/.test(s)) s = s.replace('minuit', '0 h').replace(' et quart', ' 15').replace(/ et demie?/, ' 30');
        s = s.replace(/\s*(heures?|hr)\b/g, ' h').replace(/ et quart$/, ' 15').replace(/ et demie?$/, ' 30').trim();
        let m, hh, mm = 0, ss = 0, ampm = '';
        if ((m = s.match(/^(.*?)\s*(am|pm|du matin|de l'?apres-midi|du soir)$/))) { s = m[1]; ampm = /am|matin/.test(m[2]) ? 'am' : 'pm'; }
        if ((m = s.match(/^(\d{1,2})\s*(?:h|:|\.)\s*(?:(\d{1,2})\s*(?:min|mn|m)?\s*(?:(?::|\s)\s*(\d{1,2})\s*s?)?)?$/))) { hh = +m[1]; mm = +(m[2] || 0); ss = +(m[3] || 0); if (m[2] && m[2].length === 1 && /[:.]/.test(s)) return {ok: false, text: `écris les minutes avec deux chiffres (${m[1]}:0${m[2]} ?)`}; }
        else if ((m = s.match(/^(\d{1,2})$/))) hh = +m[1];
        else if ((m = s.match(/^(\d{1,2})(\d{2})$/))) { hh = +m[1]; mm = +m[2]; }
        else return {ok: false, text: `je ne comprends pas cette heure (${ex})`};
        if (ampm) { if (hh > 12) return {ok: false, text: `heure impossible : ${hh} h ${ampm}`}; if (ampm === 'pm' && hh < 12) hh += 12; if (ampm === 'am' && hh === 12) hh = 0; }
        if (hh === 24 && !mm && !ss) hh = 0;
        if (hh > 23) return {ok: false, text: `heure impossible : ${hh} h (de 0 h à 23 h 59)`};
        if (mm > 59) return {ok: false, text: `minutes impossibles : ${mm} (de 0 à 59)`};
        if (ss > 59) return {ok: false, text: `secondes impossibles : ${ss} (de 0 à 59)`};
        const p2 = n => String(n).padStart(2, '0');
        return {ok: true, value: `${p2(hh)}:${p2(mm)}${seconds || ss ? ':' + p2(ss) : ''}`, label: `${hh} h ${p2(mm)}${ss ? ` ${p2(ss)} s` : ''}`, h: hh, m: mm, s: ss};
    };
    /** l'heure enregistrée (« 14:30 ») écrite pour la case : « 14 h 30 » */
    UI.timeText = v => { const m = String(v || '').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/); return m ? `${+m[1]} h ${m[2]}${m[3] && m[3] !== '00' ? ` ${m[3]} s` : ''}` : String(v || ''); };

    /* ═════ K17 Lire une durée ═════ */
    const FACT = {ms: 0.001, s: 1, min: 60, h: 3600, j: 86400};
    const UNIT_OF = w => { w = String(w || '').replace(/\.$/, ''); if (/^(ms|millisecondes?)$/.test(w)) return 'ms'; if (/^(s|sec|secs|secondes?|"|''|″)$/.test(w)) return 's'; if (/^(min|mins|mn|m|minutes?|'|′)$/.test(w)) return 'min'; if (/^(h|hr|hrs|heures?)$/.test(w)) return 'h'; if (/^(j|jours?)$/.test(w)) return 'j'; return null; };
    const NEXT = {j: 'h', h: 'min', min: 's', s: null, ms: null};
    const UNIT_WORD = {ms: 'ms', s: 's', min: 'min', h: 'h', j: 'j'};
    /** formatDuration(valeur, {unit}) → « 1 h 05 min », « 1 min 30 s », « 0,8 s » (valeur dans l'unité de la case) */
    UI.formatDuration = (value, {unit = 's'} = {}) => {
        const v = Number(value); if (!Number.isFinite(v)) return '';
        let sec = Math.abs(v) * (FACT[unit] || 1); const neg = v < 0 ? '−' : '';
        if (unit === 'ms' && sec < 1) return `${neg}${numText(sec * 1000, 1)} ms`;
        sec = Math.round(sec * 1000) / 1000;
        const d = Math.floor(sec / 86400); sec -= d * 86400;
        const hh = Math.floor(sec / 3600); sec -= hh * 3600;
        const mm = Math.floor(sec / 60); sec = Math.round((sec - mm * 60) * 1000) / 1000;
        const parts = [];
        if (d) parts.push(`${d} j`);
        if (hh) parts.push(`${hh} h`);
        if (mm) parts.push(`${(d || hh) && mm < 10 ? '0' + mm : mm} min`);
        if (sec || !parts.length) parts.push(`${numText(sec)} s`);
        return neg + parts.join(' ');
    };
    /** clock(secondes, {tenths}) → « 3:20 », « 1:05:00 » (au-delà d'une heure), « 0:03,5 » avec tenths — l'affichage commun des lecteurs */
    UI.clock = (sec, {tenths = false} = {}) => {
        let v = Number(sec); if (!Number.isFinite(v) || v < 0) v = 0;
        if (tenths) v = Math.round(v * 10) / 10; else v = Math.floor(v + 1e-6);
        const hh = Math.floor(v / 3600), mm = Math.floor((v % 3600) / 60), s = v - hh * 3600 - mm * 60;
        const ss = tenths ? s.toFixed(1).padStart(4, '0').replace('.', ',') : String(Math.floor(s)).padStart(2, '0');
        return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
    };
    /** readDuration('2 h 15' | '1 min 30' | '90 s' | '1:30' | '1:05:00' | '3\'20' | '45', {unit, colon, min, max, step})
     *  → null | {ok:true, seconds, value (dans l'unité de la case), label} | {ok:false, text}
     *  Un nombre seul est dans l'unité de la case ; « 1:30 » = 1 min 30 s (ou 1 h 30 pour une case en minutes ou en heures). */
    UI.readDuration = (raw, {unit = 's', colon = '', min = null, max = null, step = null} = {}) => {
        let s = fold(raw).trim().replace(/\s+/g, ' ').replace(/,/g, '.').replace(/[’`´]/g, "'").replace(/′/g, "'").replace(/″/g, '"').replace(/\bet\b/g, ' ').replace(/\s+/g, ' ').trim();
        if (!s) return null;
        const ex = 'exemples : 90 s, 1 min 30, 2 h 15, 1:30';
        let sec = null, m;
        if ((m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?$|^(\d+):(\d{1,2}\.\d+)$/))) {
            if (m[4] !== undefined) sec = +m[4] * 60 + +m[5];
            else if (m[3] !== undefined) { if (+m[2] > 59 || +m[3] >= 60) return {ok: false, text: `durée impossible : ${s} (minutes et secondes de 0 à 59)`}; sec = +m[1] * 3600 + +m[2] * 60 + +m[3]; }
            else { if (+m[2] > 59) return {ok: false, text: `durée impossible : ${s} (de 0 à 59 après les deux-points)`}; sec = (colon || (unit === 'min' || unit === 'h' ? 'hm' : 'ms')) === 'hm' ? +m[1] * 3600 + +m[2] * 60 : +m[1] * 60 + +m[2]; }
        } else {
            const re = /(\d+(?:\.\d+)?)\s*(millisecondes?|ms|secondes?|secs?|s|''|"|minutes?|mins?|mn|m|'|heures?|hrs?|h|jours?|j)?\.?/g;
            let pos = 0, last = null, total = 0, any = false;
            for (const t of s.matchAll(re)) {
                if (s.slice(pos, t.index).trim()) return {ok: false, text: `je ne comprends pas cette durée (${ex})`};
                pos = t.index + t[0].length; any = true;
                let u = t[2] ? UNIT_OF(t[2]) : (last ? NEXT[last] : unit);
                if (!u) return {ok: false, text: `je ne comprends pas « ${t[0].trim()} » après ${UNIT_WORD[last] || ''} (${ex})`};
                total += Number(t[1]) * FACT[u]; last = u;
            }
            if (!any || s.slice(pos).trim()) return {ok: false, text: `je ne comprends pas cette durée (${ex})`};
            sec = total;
        }
        if (!Number.isFinite(sec)) return {ok: false, text: `je ne comprends pas cette durée (${ex})`};
        let value = sec / (FACT[unit] || 1), note = '';
        const st = Number(step) > 0 ? Number(step) : 0;
        if (st) { const r = Math.round(Math.round(value / st) * st * 1e6) / 1e6; if (Math.abs(r - value) > 1e-9) { note = ` (arrondi à ${UI.formatDuration(st, {unit})} près)`; value = r; } }
        else value = Math.round(value * 1e6) / 1e6;
        // hors des bornes de la case : ramené à la plus courte / la plus longue durée possible (comme les curseurs), et dit dessous
        if (min !== null && min !== '' && value < Number(min)) { value = Number(min); note = ` (trop court : ramené à ${UI.formatDuration(value, {unit})}, le minimum)`; }
        if (max !== null && max !== '' && value > Number(max)) { value = Number(max); note = ` (trop long : ramené à ${UI.formatDuration(value, {unit})}, le maximum)`; }
        return {ok: true, seconds: note ? value * (FACT[unit] || 1) : Math.round(sec * 1000) / 1000, value, label: UI.formatDuration(value, {unit}) + note, ...(note ? {adjusted: true} : {})};
    };

    /* ═════ K17 Les cases ═════ */
    const helpHtml = r => (!r ? '' : r.ok ? `✓ Compris : <b>${esc(r.label)}</b>` : `⚠️ ${esc(cap(r.text))}`);
    function copyPlace(from, to) { // l'habillage prend la place de la case (marges, grille, flex)
        const cs = getComputedStyle(from), ws = to.style;
        ['marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'alignSelf', 'gridColumnStart', 'gridColumnEnd', 'gridRowStart', 'gridRowEnd', 'flexGrow', 'flexShrink', 'flexBasis', 'order'].forEach(k => { const v = cs[k]; if (v && v !== 'auto' && v !== '0px' && v !== 'normal' && !(k === 'flexShrink' && v === '1') && !(k === 'flexGrow' && v === '0') && !(k === 'order' && v === '0')) ws[k] = v; });
        if (cs.marginTop !== '0px' || cs.marginBottom !== '0px' || cs.marginLeft !== '0px' || cs.marginRight !== '0px') from.style.margin = '0';
    }
    const fullWidth = inp => { const p = inp.parentElement; if (!p) return false; const pc = getComputedStyle(p), pw = p.clientWidth - parseFloat(pc.paddingLeft) - parseFloat(pc.paddingRight); return pw > 0 && inp.offsetWidth >= pw - 2; };

    /** une case chiffrée avec l'unité dedans : « 12 | px » (la case d'origine reste la même, sans les petites flèches) */
    function buildUnit(inp, unit) {
        inp.dataset.uiUnitDone = '1';
        if (!unit) return null;
        const w = h('span', 'ui-unit'), u = h('span', 'ui-unit-u', esc(unit));
        u.setAttribute('aria-hidden', 'true');
        const wasW = inp.offsetWidth, full = wasW && fullWidth(inp);
        copyPlace(inp, w);
        inp.parentNode.insertBefore(w, inp); w.append(inp, u);
        if (full) w.classList.add('is-full');
        else if (wasW) { w.style.width = `${Math.max(wasW, 56) + Math.min(40, 8 + unit.length * 7)}px`; }
        if (!inp.getAttribute('aria-label')) { const lab = inp.closest('label')?.textContent.trim().replace(/\s+/g, ' '); if (lab) inp.setAttribute('aria-label', `${lab.slice(0, 80)} (${unit})`); }
        w.style.setProperty('--ui-unit-w', `${8 + unit.length * 7.2}px`);
        return w;
    }
    /** « Taille (px) » → « Taille » + px dans la case */
    const LABEL_UNIT = /\s*\(\s*(?:en\s+)?(px|mm|cm|m|km|cM|Mb|s|ms|min|minutes?|secondes?|heures?|h|jours?|ans|années|mois|semaines?|%|°|pt|ppp|dpi|€|kg|g|pixels?|x|×)\s*\)\s*$/;
    const UNIT_NORM = {minute: 'min', minutes: 'min', seconde: 's', secondes: 's', heure: 'h', heures: 'h', jour: 'jours', jours: 'jours', années: 'ans', pixel: 'px', pixels: 'px', dpi: 'ppp', semaine: 'semaines', x: '×'};
    function labelUnit(inp, strip) {
        const lab = inp.closest('label'); if (!lab) return '';
        const walk = document.createTreeWalker(lab, NodeFilter.SHOW_TEXT); let n, hit = null;
        while ((n = walk.nextNode())) {
            if (n.parentElement?.closest('.ui-unit, .ui-num, select, option, button, output, .ui-help, [data-help-bubble]')) continue;
            if (inp.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) break; // le texte avant la case seulement
            if (LABEL_UNIT.test(n.textContent)) hit = n;
        }
        if (!hit) return '';
        const u = hit.textContent.match(LABEL_UNIT)[1];
        if (strip) hit.textContent = hit.textContent.replace(LABEL_UNIT, '');
        return UNIT_NORM[u] || u;
    }
    function enhanceNumber(inp) {
        if (inp.dataset.uiUnitDone || inp.closest('.ui-unit, .ui-num, .ui-hm')) return true;
        if (isOff(inp) || inp.type === 'hidden') { inp.dataset.uiUnitDone = 'off'; return true; }
        if (!shown(inp)) return false;
        const unit = inp.dataset.unit != null ? inp.dataset.unit : (inp.type === 'number' ? labelUnit(inp, true) : '');
        buildUnit(inp, unit);
        return true;
    }
    /** UI.numberField({name, value, unit, min, max, step, label, attrs}) → l'élément « .ui-unit » (.input = la case) */
    UI.numberField = ({name = '', value = '', unit = '', min = '', max = '', step = '', label = '', attrs = ''} = {}) => {
        const w = h('span', 'ui-unit is-full');
        w.innerHTML = `<input type="number"${name ? ` name="${esc(name)}"` : ''}${min !== '' ? ` min="${esc(min)}"` : ''}${max !== '' ? ` max="${esc(max)}"` : ''}${step !== '' ? ` step="${esc(step)}"` : ''} value="${esc(value)}"${label ? ` aria-label="${esc(label)}"` : ''} data-ui-unit-done="1" ${attrs}><span class="ui-unit-u" aria-hidden="true">${esc(unit)}</span>`;
        w.style.setProperty('--ui-unit-w', `${8 + String(unit).length * 7.2}px`);
        w.input = w.querySelector('input'); return w;
    };

    /** heure ou durée : une case texte libre devant la case d'origine (cachée, elle garde la valeur enregistrée) */
    function buildFree(carrier, kind, opts = {}) {
        carrier.dataset.uiDone = carrier.dataset.uiDone || '1'; carrier.dataset.uiHm = kind;
        const unit = kind === 'duration' ? (opts.unit || carrier.dataset.uiDuration || 's') : '';
        const compact = opts.compact ?? (carrier.hasAttribute('data-ui-compact') || (carrier.offsetWidth && carrier.offsetWidth < 110) || !!carrier.closest('[class*=toolbar], [class*=-tools], [class*=inspector], .kn-g2, .kn-g3, .h-avx-row'));
        const w = h('span', `ui-hm is-${kind}${compact ? ' is-compact' : ''}`), box = h('span', 'ui-hm-box'), help = h('span', 'ui-hm-help');
        help.setAttribute('aria-live', 'polite');
        const txt = document.createElement('input'); txt.type = 'text'; txt.className = 'ui-hm-input'; txt.autocomplete = 'off'; txt.spellcheck = false;
        txt.placeholder = opts.placeholder || carrier.getAttribute('placeholder') || (kind === 'time' ? '14 h 30' : unit === 'min' || unit === 'h' ? '1 h 30' : '1 min 30');
        const lab = carrier.getAttribute('aria-label') || carrier.closest('label')?.textContent.trim().replace(/\s+/g, ' ').slice(0, 80) || (kind === 'time' ? 'Heure' : 'Durée');
        txt.setAttribute('aria-label', lab);
        if (carrier.id && !document.querySelector(`label[for="${CSS.escape(carrier.id)}"] input`)) document.querySelectorAll(`label[for="${CSS.escape(carrier.id)}"]`).forEach(l => l.addEventListener('click', e => { e.preventDefault(); txt.focus(); }));
        txt.disabled = carrier.disabled; txt.readOnly = carrier.readOnly; if (carrier.required) txt.setAttribute('aria-required', 'true');
        if (shown(carrier)) copyPlace(carrier, w);
        if (shown(carrier) && fullWidth(carrier)) w.classList.add('is-full');
        carrier.parentNode?.insertBefore(w, carrier);
        box.appendChild(txt);
        w.append(box, help, carrier); carrier.classList.add('ui-hm-carrier'); carrier.tabIndex = -1; carrier.setAttribute('aria-hidden', 'true');
        const range = () => ({unit, min: carrier.getAttribute('min'), max: carrier.getAttribute('max'), step: carrier.getAttribute('step') && carrier.getAttribute('step') !== 'any' ? carrier.getAttribute('step') : null, colon: carrier.dataset.uiColon || ''});
        const read = t => (kind === 'time' ? UI.readTime(t) : UI.readDuration(t, range()));
        const fromCarrier = () => { const v = rawGet(carrier); if (v === '' || v == null) return ''; return kind === 'time' ? UI.timeText(v) : UI.formatDuration(Number(v), {unit}); };
        let typed = false;
        const paint = r => {
            help.innerHTML = helpHtml(r);
            help.className = `ui-hm-help${r ? (r.ok ? ' is-ok' : ' is-warn') : ''}`;
            w.classList.toggle('is-bad', !!r && !r.ok);
        };
        const show = () => { if (document.activeElement === txt && typed) return; txt.value = fromCarrier(); const r = txt.value ? read(txt.value) : null; paint(r && r.ok ? r : null); };
        const commit = (final) => {
            const t = txt.value, r = read(t);
            paint(r);
            if (!t.trim()) { carrier.setCustomValidity(''); if (rawGet(carrier) !== '') { rawSet(carrier, ''); fire(carrier, 'input'); } if (final) fire(carrier, 'change'); return; }
            if (!r || !r.ok) { carrier.setCustomValidity(r ? cap(r.text) + '.' : ''); return; }
            carrier.setCustomValidity('');
            const nv = String(r.value);
            if (rawGet(carrier) !== nv) { rawSet(carrier, nv); fire(carrier, 'input'); if (final) fire(carrier, 'change'); }
            else if (final && typed) fire(carrier, 'change');
        };
        ['input', 'change'].forEach(t => txt.addEventListener(t, e => e.stopPropagation())); // la case texte ne parle qu'à sa case d'origine
        txt.addEventListener('input', () => { typed = true; carrier.dispatchEvent(new CustomEvent('ui-hm-typing', {bubbles: false})); commit(false); });
        txt.addEventListener('change', () => { commit(true); typed = false; });
        txt.addEventListener('blur', () => { const r = read(txt.value); if (r && r.ok) { txt.value = kind === 'time' ? r.label : r.label.replace(/ \(arrondi.*$/, ''); } typed = false; });
        txt.addEventListener('keydown', e => {
            if (e.key === 'Enter') { commit(true); typed = false; }
            else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey) { // ↑ ↓ : une minute (heure) ou un pas (durée) ; ⇧ ×10
                e.preventDefault();
                const dir = e.key === 'ArrowUp' ? 1 : -1, big = e.shiftKey ? 10 : 1;
                if (kind === 'time') { const r = UI.readTime(txt.value) || UI.readTime(rawGet(carrier)) || {h: 12, m: 0}; let t = ((r.h * 60 + r.m + dir * big * (e.shiftKey ? 6 : 5)) % 1440 + 1440) % 1440; txt.value = UI.timeText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`); }
                else { const r = UI.readDuration(txt.value, {...range(), min: null, max: null}); const st = Number(range().step) || (unit === 'ms' ? 100 : unit === 's' ? 1 : 1); let v = (r && r.ok ? r.value : Number(rawGet(carrier)) || 0) + dir * st * big; const mn = range().min, mx = range().max; if (mn !== null && mn !== '') v = Math.max(Number(mn), v); if (mx !== null && mx !== '') v = Math.min(Number(mx), v); v = Math.max(0, Math.round(v * 1e6) / 1e6); txt.value = UI.formatDuration(v, {unit}); }
                typed = true; commit(true); typed = false; txt.select();
            }
        });
        carrier.addEventListener('invalid', () => { if (document.activeElement !== txt) setTimeout(() => { if (carrier.closest('.is-invalid') || w.classList.contains('is-invalid')) txt.focus(); }, 0); });
        new MutationObserver(() => { txt.disabled = carrier.disabled; txt.readOnly = carrier.readOnly; }).observe(carrier, {attributes: true, attributeFilter: ['disabled', 'readonly']});
        watchValue(carrier, () => { typed = false; carrier.setCustomValidity(''); show(); });
        carrier.addEventListener('input', e => { if (e.isTrusted) show(); });
        show();
        w.input = carrier; w.text = txt;
        return w;
    }
    UI.timeField = ({name = '', value = '', placeholder = '', required = false, compact} = {}) => {
        const c = document.createElement('input'); c.type = 'time'; if (name) c.name = name; rawSet(c, value || ''); if (required) c.required = true;
        const holder = h('span'); holder.appendChild(c); const w = buildFree(c, 'time', {placeholder, compact}); w.remove(); return w;
    };
    UI.durationField = ({name = '', value = '', unit = 's', min = '', max = '', step = '', placeholder = '', required = false, compact} = {}) => {
        const c = document.createElement('input'); c.type = 'number'; c.dataset.uiDuration = unit; if (name) c.name = name; if (min !== '') c.min = min; if (max !== '') c.max = max; c.step = step !== '' ? step : 'any'; rawSet(c, value === '' || value == null ? '' : String(value)); if (required) c.required = true;
        const holder = h('span'); holder.appendChild(c); const w = buildFree(c, 'duration', {unit, placeholder, compact}); w.remove(); return w;
    };

    /** une durée gardée en texte libre (« 2:58 », « ≈ 24 min ») : « ✓ Compris : 2 min 58 s » dessous, quand c'est compris */
    function buildHint(inp) {
        inp.dataset.uiHm = 'hint';
        const help = h('span', 'ui-hm-help'); help.setAttribute('aria-live', 'polite');
        inp.after(help);
        const upd = () => { const r = UI.readDuration(String(rawGet(inp) || '').replace(/^[≈~]\s*|^(environ|env\.?|vers)\s+/i, ''), {unit: inp.dataset.uiDurationHint || 's', colon: inp.dataset.uiColon || ''}); help.innerHTML = r && r.ok ? helpHtml(r) : ''; help.className = `ui-hm-help${r && r.ok ? ' is-ok' : ''}`; };
        inp.addEventListener('input', upd); watchValue(inp, upd); upd();
        return true;
    }

    /* ═════ Habillage automatique ═════ */
    const WANT = 'input[type=time], input[data-ui-time], input[data-ui-duration], input[data-ui-duration-hint], input[type=number], input[data-unit]:not([type=range]):not(.ui-num-input)';
    function enhanceOne(el) {
        if (!el.isConnected) return true;
        if (el.dataset.uiHm) return true;
        if (el.matches('input[type=time], input[data-ui-time]')) { if (isOff(el)) { el.dataset.uiHm = 'off'; return true; } buildFree(el, 'time'); return true; }
        if (el.matches('input[data-ui-duration-hint]')) return isOff(el) ? true : buildHint(el);
        if (el.matches('input[data-ui-duration]')) { if (isOff(el)) { el.dataset.uiHm = 'off'; return true; } buildFree(el, 'duration'); return true; }
        return enhanceNumber(el);
    }
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(list => list.forEach(en => { if (!en.isIntersecting && !en.boundingClientRect.width) return; if (enhanceOne(en.target)) io.unobserve(en.target); }), {rootMargin: '600px'}) : null;
    function scan(root) {
        if (!root?.querySelectorAll) return;
        const els = root.matches?.(WANT) ? [root] : [];
        els.push(...root.querySelectorAll(WANT));
        els.forEach(el => { if (el._k17Seen || el.dataset.uiHm || el.dataset.uiUnitDone) return; el._k17Seen = true; if (!enhanceOne(el)) { if (io) io.observe(el); else el._k17Seen = false; } });
    }
    UI.scanInputs = (root = document) => scan(root);
    let queued = new Set(), timer = 0;
    new MutationObserver(list => {
        list.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1 && !n.classList?.contains('ui-hm') && !n.classList?.contains('ui-unit')) queued.add(n); }));
        if (!queued.size) return;
        clearTimeout(timer);
        timer = setTimeout(() => { const nodes = [...queued]; queued = new Set(); nodes.forEach(n => { if (n.isConnected) scan(n); }); }, 30);
    }).observe(document.documentElement, {childList: true, subtree: true});
    document.addEventListener('DOMContentLoaded', () => scan(document));
    if (document.readyState !== 'loading') scan(document);
})();
