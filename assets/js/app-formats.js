/* LCNDA — 📐 Formats de document : UNE liste commune (A0 à A6, Lettre US, cartes, livres, photos 10×15, 13×18…, écrans 16:9…),
 * le « Format libre » (largeur × hauteur, unité mm / cm / px / pouces, portrait / paysage, résolution en ppp pour l'export image)
 * et « Mes formats » (chaque format libre utilisé y est gardé pour la prochaine fois).
 *
 *   const F = window.LCNDA_FORMATS;
 *   F.boxHtml({tool: 'carte', value: F.last('carte') || {id: 'A3', orient: 'landscape'}, units: ['mm', 'cm', 'px', 'in'], dpi: true})
 *   const box = F.bindBox(dialog.querySelector('[data-fmt-box]'), {onChange: v => …});  // box.get() → {id, w, h, unit, dpi, orient}
 *   F.use('carte', box.get());   // retenu pour cet outil ; un format libre entre dans « Mes formats »
 *   F.inMm(v) → [w, h] en mm ; F.inPx(v, ppp) → [w, h] en points (px) ; F.label(v) → « A4 · 21 × 29,7 cm »
 * Utilisé par : 🗺️ la nouvelle carte (heritage-vector-map.js), ✒️ Fichier → Format du document (heritage-vector.js),
 * 📐 Fichier → Format du document (heritage-layout.js), 🎚️ Image → Taille de l'image (heritage-studio.js), 🖨 Imprimer (app-actions.js).
 */
(() => {
    'use strict';
    const KEY = 'genealogie-formats';
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const r2 = v => Math.round(Number(v) * 100) / 100;
    const nf = v => String(r2(v)).replace('.', ',');
    const MM_IN = 25.4;
    /** [id, nom, largeur, hauteur, unité] — toujours en portrait (la largeur la plus petite) sauf les écrans, posés comme on les voit */
    const GROUPS = [
        ['Papier', [['A0', 'A0', 841, 1189], ['A1', 'A1', 594, 841], ['A2', 'A2', 420, 594], ['A3', 'A3', 297, 420], ['A4', 'A4', 210, 297], ['A5', 'A5', 148, 210], ['A6', 'A6', 105, 148],
            ['B5', 'B5', 176, 250], ['letter', 'Lettre US', 215.9, 279.4], ['legal', 'Legal US', 215.9, 355.6], ['tabloid', 'Tabloïd US', 279.4, 431.8]]],
        ['Cartes et livres', [['postcard', 'Carte postale', 105, 148], ['card', 'Carte de visite', 55, 85], ['dl', 'Carton DL (faire-part)', 99, 210], ['sq15', 'Carré 15 × 15 cm', 150, 150], ['square', 'Carré 21 × 21 cm', 210, 210], ['sq30', 'Carré 30 × 30 cm', 300, 300],
            ['royal', 'Livre (15,6 × 23,4 cm)', 156, 234], ['us6x9', 'Livre US (6 × 9 in)', 152.4, 228.6], ['album', 'Album photo (21,6 × 28 cm)', 216, 280]]],
        ['Photos', [['p9x13', 'Photo 9 × 13', 90, 130], ['p10x15', 'Photo 10 × 15', 100, 150], ['p13x18', 'Photo 13 × 18', 130, 180], ['p15x20', 'Photo 15 × 20', 150, 200], ['p18x24', 'Photo 18 × 24', 180, 240],
            ['p20x30', 'Photo 20 × 30', 200, 300], ['p24x30', 'Photo 24 × 30', 240, 300], ['p30x40', 'Photo 30 × 40', 300, 400], ['p30x45', 'Photo 30 × 45', 300, 450], ['p40x50', 'Photo 40 × 50', 400, 500], ['p50x70', 'Photo 50 × 70', 500, 700]]],
        ['Écrans', [['s169', 'Écran 16:9 (1920 × 1080)', 1920, 1080, 'px'], ['s43', 'Écran 4:3 (1600 × 1200)', 1600, 1200, 'px'], ['s11', 'Carré 1:1 (1080 × 1080)', 1080, 1080, 'px'], ['s916', 'Vertical 9:16 (1080 × 1920)', 1080, 1920, 'px'], ['s4k', '4K 16:9 (3840 × 2160)', 3840, 2160, 'px']]],
    ];
    const PRESETS = GROUPS.flatMap(([group, list]) => list.map(([id, label, w, h, unit = 'mm']) => ({id, label, w, h, unit, group})));
    const UNITS = {mm: 'mm', cm: 'cm', px: 'px', in: 'pouces'};
    const okUnit = u => (u in UNITS ? u : 'mm');
    const clampDpi = v => Math.max(36, Math.min(1200, Math.round(Number(v) || 300)));
    /** une valeur dans une unité → mm (les px dépendent de la résolution) */
    const toMm = (v, unit, dpi = 96) => { v = Number(v) || 0; return unit === 'cm' ? v * 10 : unit === 'in' ? v * MM_IN : unit === 'px' ? v / (dpi || 96) * MM_IN : v; };
    const fromMm = (mm, unit, dpi = 96) => { mm = Number(mm) || 0; return unit === 'cm' ? mm / 10 : unit === 'in' ? mm / MM_IN : unit === 'px' ? mm / MM_IN * (dpi || 96) : mm; };
    const conv = (v, from, to, dpi) => (from === to ? Number(v) : fromMm(toMm(v, from, dpi), to, dpi));
    const find = id => PRESETS.find(p => p.id === id) || mine().find(p => p.id === id) || null;

    /* ── la mémoire : « Mes formats » et le dernier format de chaque outil ── */
    const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } };
    const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) {} };
    /** un format reçu (mémoire, document, fichier) remis d'aplomb : rien d'inconnu, des bornes */
    function clean(v) {
        if (!v || typeof v !== 'object') return null;
        const unit = okUnit(v.unit), max = unit === 'px' ? 30000 : toMm(1, unit) > 0 ? fromMm(5000, unit) : 5000, min = unit === 'px' ? 8 : fromMm(5, unit);
        const w = Number(v.w), h = Number(v.h);
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
        const out = {id: /^[A-Za-z0-9_:-]{1,40}$/.test(String(v.id || '')) ? String(v.id) : 'free', w: r2(Math.min(max, Math.max(min, w))), h: r2(Math.min(max, Math.max(min, h))), unit, dpi: clampDpi(v.dpi), orient: v.orient === 'landscape' ? 'landscape' : v.orient === 'portrait' ? 'portrait' : (w > h ? 'landscape' : 'portrait')};
        if (typeof v.name === 'string' && v.name.trim()) out.name = v.name.trim().slice(0, 60);
        return out;
    }
    const own = () => (Array.isArray(read().mine) ? read().mine : []).map(clean).filter(Boolean).filter(m => m.id.startsWith('mf')).slice(0, 12);
    /** les formats déjà gardés dans la mise en page (« Enregistrer ce format », en mm) : proposés aussi partout */
    const legacy = () => { let v = []; try { v = JSON.parse(localStorage.getItem('genealogie-layout-formats') || '[]'); } catch (_) {} return (Array.isArray(v) ? v : []).filter(f => f && /^my_[a-z0-9]{1,24}$/.test(String(f.k))).slice(0, 30).map(f => clean({id: f.k, name: String(f.name || 'Mon format').replace(/[<>"`]/g, '').slice(0, 60), w: f.w, h: f.h, unit: 'mm'})).filter(Boolean); };
    const mine = () => [...own(), ...legacy()];
    const label = v => { v = clean(v); if (!v) return ''; const p = PRESETS.find(x => x.id === v.id); const [w, h] = inMm(v);
        const dims = v.unit === 'px' ? `${Math.round(v.w)} × ${Math.round(v.h)} px` : v.unit === 'in' ? `${nf(v.w)} × ${nf(v.h)} pouces` : `${nf(w / 10)} × ${nf(h / 10)} cm`;
        return p ? `${p.label.replace(/\s*\(.*\)$/, '')} · ${dims}` : dims; };
    const sameDims = (a, b) => a.unit === b.unit && Math.abs(a.w - b.w) < 0.05 && Math.abs(a.h - b.h) < 0.05;
    function rememberMine(v) {
        v = clean(v); if (!v) return null;
        const all = read(), list = own();
        const hit = list.find(m => sameDims(m, v) || (sameDims(m, {...v, w: v.h, h: v.w})));
        const item = hit || {...v, id: 'mf' + Date.now().toString(36), name: v.name || label({...v, id: 'free'})};
        all.mine = [item, ...list.filter(m => m !== hit)].slice(0, 12); write(all);
        return item;
    }
    function removeMine(id) { const all = read(), list = own(), gone = list.find(m => m.id === id); all.mine = list.filter(m => m.id !== id); write(all); return gone || null; }
    const last = tool => clean(read().last?.[tool]);
    function setLast(tool, v) { v = clean(v); if (!v || !/^[a-z0-9-]{1,40}$/.test(tool)) return; const all = read(); all.last = {...(all.last && typeof all.last === 'object' ? all.last : {}), [tool]: v}; write(all); }
    /** le format qu'un outil vient d'utiliser : retenu pour lui, et un format libre est gardé dans « Mes formats » */
    function use(tool, v) { v = clean(v); if (!v) return null; let out = v; if (v.id === 'free') { const m = rememberMine(v); if (m) out = {...v, id: m.id}; } setLast(tool, out); return out; }
    /** [largeur, hauteur] en mm, dans le sens choisi */
    function inMm(v) { v = clean(v); if (!v) return [210, 297]; return [toMm(v.w, v.unit, v.dpi), toMm(v.h, v.unit, v.dpi)]; }
    /** [largeur, hauteur] en points (px) à la résolution donnée (96 ppp : l'écran, et les dessins de l'app) */
    function inPx(v, dpi = 96) { v = clean(v); if (!v) return [794, 1123]; if (v.unit === 'px') return [Math.round(v.w), Math.round(v.h)]; const [w, h] = inMm(v); return [Math.round(w / MM_IN * dpi), Math.round(h / MM_IN * dpi)]; }
    /** une taille connue (mm ou px) → la valeur de la boîte (le préréglage qui va avec, s'il y en a un) */
    function fromSize(w, h, unit = 'mm', dpi = 300, prefer = '') {
        const u = prefer && prefer in UNITS ? prefer : unit;
        const all = [...PRESETS, ...mine()];
        const match = all.find(p => { const pw = toMm(p.w, p.unit, unit === 'px' ? dpi : 96), ph = toMm(p.h, p.unit, unit === 'px' ? dpi : 96), mw = toMm(w, unit, dpi), mh = toMm(h, unit, dpi); return p.unit === 'px' && unit === 'px' ? (Math.abs(p.w - w) < 1 && Math.abs(p.h - h) < 1) || (Math.abs(p.w - h) < 1 && Math.abs(p.h - w) < 1) : p.unit !== 'px' && unit !== 'px' && ((Math.abs(pw - mw) < 0.6 && Math.abs(ph - mh) < 0.6) || (Math.abs(pw - mh) < 0.6 && Math.abs(ph - mw) < 0.6)); });
        return clean({id: match ? match.id : 'free', w: conv(w, unit, u, dpi), h: conv(h, unit, u, dpi), unit: u, dpi, orient: w > h ? 'landscape' : 'portrait'});
    }
    /** une valeur de départ : un préréglage (id) dans le sens voulu, dans l'unité voulue */
    function preset(id, {orient = '', unit = '', dpi = 300} = {}) {
        const p = find(id) || find('A4'); let w = p.w, h = p.h; const o = orient || (w > h ? 'landscape' : 'portrait');
        if ((o === 'landscape') !== (w > h) && w !== h) [w, h] = [h, w];
        const u = p.unit === 'px' ? 'px' : (unit && unit !== 'px' ? unit : p.unit);
        return clean({id: p.id, w: conv(w, p.unit, u, dpi), h: conv(h, p.unit, u, dpi), unit: u, dpi: p.dpi || dpi, orient: o});
    }
    /** les <option> de la liste commune (Mes formats d'abord, puis les familles, puis « Format libre ») */
    function optionsHtml(sel = '', {px = true} = {}) {
        const m = mine();
        const opt = p => `<option value="${esc(p.id)}"${p.id === sel ? ' selected' : ''}>${esc(p.name || p.label)}</option>`;
        return `${m.length ? `<optgroup label="⭐ Mes formats">${m.map(opt).join('')}</optgroup>` : ''}${GROUPS.filter(([g]) => px || g !== 'Écrans').map(([g]) => `<optgroup label="${esc(g)}">${PRESETS.filter(p => p.group === g).map(opt).join('')}</optgroup>`).join('')}<option value="free"${sel === 'free' ? ' selected' : ''}>✎ Format libre…</option>`;
    }
    /**
     * la boîte « Format » : liste commune · largeur × hauteur + unité · Portrait / Paysage · résolution (ppp)
     * value : {id, w, h, unit, dpi, orient} ; units : les unités proposées ; dpi : montrer la résolution ; hint : une phrase sous la résolution
     */
    function boxHtml({value = null, units = ['mm', 'cm', 'px', 'in'], dpi = true, orientation = true, title = 'Format', hint = 'pour l’export en image (PNG, JPG)', id = ''} = {}) {
        const us = units.filter(u => u in UNITS);
        let v = clean(value) || preset('A4', {unit: us.includes('mm') ? 'mm' : us[0]});
        if (!us.includes(v.unit)) v = clean({...v, w: conv(v.w, v.unit, us[0], v.dpi), h: conv(v.h, v.unit, us[0], v.dpi), unit: us[0]});
        const sel = find(v.id) ? v.id : 'free', uid = id || 'fmt' + Math.random().toString(36).slice(2, 7);
        return `<div class="fmt-box" data-fmt-box data-fmt-units="${esc(us.join(','))}" data-fmt-value="${esc(JSON.stringify(v))}">
            <label class="fmt-preset"><span>${esc(title)}</span><select data-fmt-preset aria-label="${esc(title)}">${optionsHtml(sel, {px: us.includes('px')})}</select></label>
            <div class="fmt-dims" role="group" aria-label="Largeur et hauteur">
                <label><span>Largeur</span><input type="number" data-fmt-w id="${uid}-w" min="0.01" step="any" value="${r2(v.w)}" inputmode="decimal"></label>
                <span class="fmt-x" aria-hidden="true">×</span>
                <label><span>Hauteur</span><input type="number" data-fmt-h min="0.01" step="any" value="${r2(v.h)}" inputmode="decimal"></label>
                <label><span>Unité</span><select data-fmt-unit>${us.map(u => `<option value="${u}"${u === v.unit ? ' selected' : ''}>${UNITS[u]}</option>`).join('')}</select></label>
            </div>
            ${orientation ? `<div class="segmented fmt-orient" role="radiogroup" aria-label="Sens"><button type="button" role="radio" data-fmt-or="portrait" class="${v.orient === 'portrait' ? 'is-active' : ''}" aria-checked="${v.orient === 'portrait'}">▯ Portrait</button><button type="button" role="radio" data-fmt-or="landscape" class="${v.orient === 'landscape' ? 'is-active' : ''}" aria-checked="${v.orient === 'landscape'}">▭ Paysage</button></div>` : ''}
            ${dpi ? `<label class="fmt-dpi"><span>Résolution</span><input type="number" data-fmt-dpi min="36" max="1200" step="1" value="${v.dpi}"><em>ppp</em><small class="muted">${esc(hint)}</small></label>` : ''}
            <p class="fmt-info muted" data-fmt-info aria-live="polite"></p>
            <button type="button" class="link-button fmt-forget" data-fmt-forget hidden>× Retirer de « Mes formats »</button>
        </div>`;
    }
    /** relie une boîte (rendue par boxHtml) : → {get(), set(v), el} ; onChange(v) à chaque changement */
    function bindBox(el, {onChange = null, dpi: showDpi = null} = {}) {
        if (!el) return null;
        if (el._fmt) return el._fmt;
        const q = s => el.querySelector(s), presetSel = q('[data-fmt-preset]'), wIn = q('[data-fmt-w]'), hIn = q('[data-fmt-h]'), unitSel = q('[data-fmt-unit]'), dpiIn = q('[data-fmt-dpi]'), info = q('[data-fmt-info]'), forget = q('[data-fmt-forget]');
        let v = clean(JSON.parse(el.dataset.fmtValue || '{}')) || preset('A4');
        const units = (el.dataset.fmtUnits || 'mm').split(',');
        const paint = () => {
            wIn.value = r2(v.w); hIn.value = r2(v.h); unitSel.value = v.unit; if (dpiIn) dpiIn.value = v.dpi;
            const known = find(v.id); presetSel.value = known ? v.id : 'free';
            el.querySelectorAll('[data-fmt-or]').forEach(b => { const on = b.dataset.fmtOr === v.orient; b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on); });
            const [mw, mh] = inMm(v), [pw, ph] = inPx(v, v.dpi);
            info.textContent = `${nf(mw / 10)} × ${nf(mh / 10)} cm${dpiIn || showDpi ? ` · ${pw} × ${ph} px à ${v.dpi} ppp` : ''}`;
            forget.hidden = !own().some(m => m.id === v.id);
        };
        const changed = () => { paint(); onChange?.(get()); el.dispatchEvent(new CustomEvent('format-change', {bubbles: true, detail: get()})); };
        const get = () => clean(v);
        const set = nv => { const c = clean(nv); if (!c) return; v = units.includes(c.unit) ? c : clean({...c, w: conv(c.w, c.unit, units[0], c.dpi), h: conv(c.h, c.unit, units[0], c.dpi), unit: units[0]}); paint(); };
        presetSel.addEventListener('change', () => {
            if (presetSel.value === 'free') { v = {...v, id: 'free'}; changed(); wIn.focus(); wIn.select?.(); return; }
            const p = find(presetSel.value); if (!p) return;
            const u = p.unit === 'px' ? (units.includes('px') ? 'px' : units[0]) : (v.unit === 'px' ? (units.includes('mm') ? 'mm' : units[0]) : v.unit);
            let w = conv(p.w, p.unit, u, v.dpi), h = conv(p.h, p.unit, u, v.dpi);
            if (p.group !== 'Écrans' && !p.group?.startsWith?.('⭐') && !String(p.id).startsWith('m') && (v.orient === 'landscape') !== (w > h) && w !== h) [w, h] = [h, w];
            v = clean({id: p.id, w, h, unit: u, dpi: String(p.id).startsWith('mf') ? p.dpi : v.dpi, orient: w > h ? 'landscape' : w < h ? 'portrait' : v.orient});
            changed();
        });
        const dims = () => {
            const w = Number(wIn.value), h = Number(hIn.value); if (!(w > 0) || !(h > 0)) return;
            v = clean({...v, w, h, orient: w > h ? 'landscape' : w < h ? 'portrait' : v.orient});
            const same = [...PRESETS, ...mine()].find(p => p.unit === v.unit ? sameDims(p, v) || sameDims(p, {...v, w: v.h, h: v.w}) : p.unit !== 'px' && v.unit !== 'px' && Math.abs(toMm(p.w, p.unit) - toMm(v.w, v.unit)) < 0.6 && Math.abs(toMm(p.h, p.unit) - toMm(v.h, v.unit)) < 0.6);
            v.id = same ? same.id : 'free'; changed();
        };
        wIn.addEventListener('change', dims); hIn.addEventListener('change', dims);
        unitSel.addEventListener('change', () => { const u = okUnit(unitSel.value); v = clean({...v, w: conv(v.w, v.unit, u, v.dpi), h: conv(v.h, v.unit, u, v.dpi), unit: u}); changed(); });
        dpiIn?.addEventListener('change', () => { const d = clampDpi(dpiIn.value); if (v.unit === 'px') v = clean({...v, dpi: d}); else v = clean({...v, dpi: d}); changed(); });
        el.addEventListener('click', e => {
            const b = e.target.closest('[data-fmt-or]'); if (b) { const o = b.dataset.fmtOr; if (o !== v.orient) { v = clean({...v, w: v.h, h: v.w, orient: o}); if (v.w === v.h) v.orient = o; } changed(); return; }
            if (e.target.closest('[data-fmt-forget]')) {
                const gone = removeMine(v.id); if (!gone) return;
                v = {...v, id: 'free'}; presetSel.innerHTML = optionsHtml('free', {px: units.includes('px')}); changed();
                window.LCNDA_APP?.undoToast?.(`« ${gone.name || label(gone)} » retiré de Mes formats`, {undo: () => { const all = read(); all.mine = [gone, ...own()].slice(0, 12); write(all); presetSel.innerHTML = optionsHtml(v.id, {px: units.includes('px')}); paint(); }});
            }
        });
        paint();
        el._fmt = {get, set, el};
        return el._fmt;
    }
    /* ── ℹ️ Informations du document : les mêmes champs dans les trois outils (chacun prend ceux qui lui servent) ── */
    const LANGS = [['fr', 'Français'], ['en', 'Anglais'], ['de', 'Allemand'], ['es', 'Espagnol'], ['it', 'Italien'], ['pt', 'Portugais'], ['nl', 'Néerlandais'], ['oc', 'Occitan'], ['br', 'Breton'], ['eu', 'Basque'], ['ca', 'Catalan'], ['co', 'Corse'], ['la', 'Latin'], ['pl', 'Polonais'], ['ar', 'Arabe']];
    const INFO = {title: ['Titre', 200], author: ['Auteur', 200], subject: ['Sujet', 300], desc: ['Description', 2000], keywords: ['Mots-clés', 400], rights: ['Droits (copyright)', 300], lang: ['Langue', 12], date: ['Date', 40], isbn: ['ISBN (facultatif)', 20], people: ['Personnes reliées', 0]};
    const ctrl = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
    /** des informations reçues remises d'aplomb (textes bornés, personnes = numéros) */
    function cleanInfo(v, keys = Object.keys(INFO)) {
        const out = {}; if (!v || typeof v !== 'object') return out;
        keys.forEach(k => { if (!(k in INFO)) return; if (k === 'people') { const ids = (Array.isArray(v.people) ? v.people : String(v.people || '').split(',')).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 60); if (ids.length) out.people = [...new Set(ids)]; return; }
            const t = typeof v[k] === 'string' ? v[k].replace(ctrl, '').trim().slice(0, INFO[k][1]) : ''; if (t) out[k] = t; });
        return out;
    }
    /** un ISBN-10 ou ISBN-13 juste (avec sa clé) */
    function isbnOk(t) {
        const d = String(t || '').replace(/[\s-]/g, '').toUpperCase();
        if (/^\d{9}[\dX]$/.test(d)) { let s = 0; for (let i = 0; i < 10; i++) s += (d[i] === 'X' ? 10 : Number(d[i])) * (10 - i); return s % 11 === 0; }
        if (/^\d{13}$/.test(d)) { let s = 0; for (let i = 0; i < 13; i++) s += Number(d[i]) * (i % 2 ? 3 : 1); return s % 10 === 0; }
        return false;
    }
    function infoHtml(value = {}, keys = ['title', 'author', 'subject', 'keywords', 'lang']) {
        const v = cleanInfo(value, keys), P = window.LCNDA_PICKER || window.LCNDA_APP;
        const f = k => {
            const [lab] = INFO[k], val = esc(v[k] || '');
            if (k === 'desc') return `<label class="is-wide"><span>${lab}</span><textarea name="info_desc" rows="3" maxlength="2000">${val}</textarea></label>`;
            if (k === 'lang') return `<label><span>${lab}</span><select name="info_lang"><option value="">—</option>${LANGS.map(([c, l]) => `<option value="${c}"${v.lang === c ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
            if (k === 'people') return `<div class="is-wide"><span class="pk-lab">${lab}</span>${P?.pickerField ? P.pickerField({name: 'info_people', kind: 'person', multiple: true, value: v.people || []}) : ''}</div>`;
            const ph = {keywords: 'mariage, Brive, 1925 (séparés par des virgules)', rights: '© 2026 Famille Martin', author: 'Prénom Nom', date: '7 mai 1925, vers 1950…', isbn: '978-2-…'}[k] || '';
            return `<label class="${k === 'keywords' || k === 'rights' ? 'is-wide' : ''}"><span>${lab}</span><input type="text" name="info_${k}" value="${val}" maxlength="${INFO[k][1]}"${ph ? ` placeholder="${esc(ph)}"` : ''}${k === 'date' ? ' data-ui-date="nocal"' : ''}></label>`;
        };
        return `<div class="fmt-info-grid">${keys.filter(k => k in INFO).map(f).join('')}</div>`;
    }
    const readInfo = (form, keys) => cleanInfo(Object.fromEntries(keys.map(k => [k, form.elements['info_' + k]?.value ?? ''])), keys);
    /** ℹ️ la fenêtre « Informations du document » : → Promise<info|null> (null = Annuler) */
    function openInfoDialog({title = 'Informations du document', what = 'Ces informations vont dans les fichiers exportés.', value = {}, keys = ['title', 'author', 'subject', 'keywords', 'lang']} = {}) {
        return new Promise(res => {
            const E = window.LCNDA_EXT; let done = false;
            if (!E?.openDialog) { res(null); return; }
            const dlg = E.openDialog({eyebrow: 'DOCUMENT', title: `ℹ️ ${title}`, submitLabel: 'Enregistrer',
                body: `<p class="muted">${esc(what)}</p>${infoHtml(value, keys)}`,
                onSubmit: f => { const v = readInfo(f, keys); if (keys.includes('isbn') && v.isbn && !isbnOk(v.isbn)) return window.LCNDA_UI?.fail ? window.LCNDA_UI.fail(f.elements.info_isbn, 'Cet ISBN n’est pas juste : vérifie les chiffres (10 ou 13, avec la clé à la fin).') : false; done = true; res(v); }});
            dlg.addEventListener('close', () => { if (!done) res(null); });
        });
    }
    window.LCNDA_FORMATS = {GROUPS, PRESETS, UNITS, toMm, fromMm, conv, find, clean, mine, rememberMine, removeMine, last, setLast, use, inMm, inPx, fromSize, preset, label, optionsHtml, boxHtml, bindBox, KEY, own, INFO, LANGS, cleanInfo, isbnOk, infoHtml, readInfo, openInfoDialog};
})();
