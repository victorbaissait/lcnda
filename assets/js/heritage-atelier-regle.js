/* LCNDA — 📜 Atelier de transcription, idée 39 : 📏 la règle de lecture (maquette approuvée docs/design/atelier-idees.html).
 * Allumée (📏 dans la barre d'outils de l'image, ou Affichage → 📏 Règle de lecture), elle assombrit toute l'image sauf la ligne en
 * cours : sa zone, un peu agrandie en haut et en bas pour les jambages. Elle suit le curseur du texte (Entrée en fin de ligne : elle
 * descend) ; sur l'image, ↑ ↓ la déplacent et mettent le curseur sur la ligne correspondante. Ligne sans zone : la hauteur de la ligne
 * d'avant, posée juste dessous ; on peut la faire glisser. La force du voile : le petit curseur qui apparaît avec elle.
 * Retenu sur cet ordinateur : genealogie-tx-regle (allumée), genealogie-tx-regle-force (0,2 à 0,9).
 * Branché par ext.txPlugins / ext.txMenus (heritage-transcribe.js) ; essai : tests/test-atelier-idees.js.
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const KEY = 'genealogie-tx-regle', FORCE_KEY = 'genealogie-tx-regle-force';
    const ls = (k, d = '') => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
    const isOn = () => ls(KEY) === '1';
    const force = () => { const v = Number(ls(FORCE_KEY, '0.55')); return Number.isFinite(v) ? Math.min(.9, Math.max(.2, v)) : .55; };
    const NS = 'http://www.w3.org/2000/svg';
    const SKIP = ['skip', 'note'];

    /** les bornes de la ligne du texte à cette position */
    const lineAt = (text, pos) => { const s = text.lastIndexOf('\n', pos - 1) + 1; let e = text.indexOf('\n', pos); if (e < 0) e = text.length; return {s, e}; };
    /** la zone qui couvre le plus la ligne [s, e) */
    const zoneFor = (zones, s, e) => { let best = null, bo = 0; zones.forEach(z => { if (!(z.e > z.s) || SKIP.includes(z.kind)) return; const o = Math.min(z.e, e) - Math.max(z.s, s); if (o > bo) { bo = o; best = z; } }); return bo > 0 ? best : null; };

    /**
     * La bande de la ligne en cours : {x, y, w, h, est} (pixels de l'image) ou null. est : estimée (ligne sans zone : sous la ligne
     * d'avant qui en a une, à sa hauteur ; une ligne vide entre deux compte aussi).
     */
    function bandOf(text, zones, pos) {
        const L = lineAt(text, pos), z = zoneFor(zones, L.s, L.e);
        if (z) return {x: z.x, y: z.y, w: z.w, h: z.h, est: false};
        let s = L.s, k = 0;
        while (s > 0 && k < 40) { const P = lineAt(text, s - 1); k++; const pz = zoneFor(zones, P.s, P.e); if (pz) return {x: pz.x, y: pz.y + pz.h * k, w: pz.w, h: pz.h, est: true}; s = P.s; }
        return null;
    }
    ext.txRegle = {bandOf, lineAt}; // pour les essais

    function init(plug) {
        const {dlg, area, $} = plug, world = $('[data-tx-world]'), zonesG = $('[data-tx-zones]'), stage = $('[data-tx-stage]');
        if (!world || !zonesG || !stage) return;
        const g = document.createElementNS(NS, 'g'); g.setAttribute('data-aip-regle', ''); g.setAttribute('class', 'aip-regle');
        g.innerHTML = '<path class="aip-veil" fill-rule="evenodd"/><rect class="aip-band" rx="2"/>';
        world.insertBefore(g, $('[data-tx-words]') || null);
        const veil = g.querySelector('.aip-veil'), band = g.querySelector('.aip-band');
        // 📏 dans la barre d'outils de l'image
        const rail = $('[data-tx-rail]'), btn = document.createElement('button');
        btn.type = 'button'; btn.dataset.aipRegle = ''; btn.textContent = '📏'; btn.title = i18n('Règle de lecture : assombrit l’image sauf la ligne en cours (↑ ↓ sur l’image pour changer de ligne)'); btn.setAttribute('aria-label', i18n('Règle de lecture'));
        rail?.appendChild(btn);
        const pill = document.createElement('div'); pill.className = 'aip-pill'; pill.hidden = true;
        pill.innerHTML = `<span aria-hidden="true">📏</span><label>${esc(i18n('assombrir'))} <input type="range" min="20" max="90" step="5" data-aip-force value="${Math.round(force() * 100)}" aria-label="${esc(i18n('Force de l’assombrissement'))}"></label><button type="button" class="aip-pill-x" data-aip-off title="${esc(i18n('Éteindre la règle'))}" aria-label="${esc(i18n('Éteindre la règle'))}">×</button>`;
        stage.appendChild(pill);
        let on = isOn(), drag = null, manual = null; // manual : {key, dy} — la bande estimée déplacée à la main (ligne sans zone)
        const paintBtn = () => { btn.classList.toggle('is-active', on); btn.setAttribute('aria-pressed', String(on)); pill.hidden = !on; dlg.dataset.txRegle = on ? '1' : ''; };
        function paint() {
            const G = plug.geo(); g.setAttribute('transform', zonesG.getAttribute('transform') || '');
            if (!on || !G.imgW) { g.style.display = 'none'; return; }
            const zones = (plug.t.data.zones || []).filter(z => plug.onHere(z));
            const b = bandOf(area.value, zones, area.selectionStart);
            if (!b) { g.style.display = 'none'; dlg.dataset.txRegleBand = ''; return; }
            const L = lineAt(area.value, area.selectionStart), key = `${L.s}`;
            if (b.est && manual?.key === key) b.y += manual.dy;
            const pad = b.h * .25, y = Math.max(0, b.y - pad), h = Math.min(G.imgH - y, b.h + 2 * pad), x = Math.max(0, b.x - b.h * .2), w = Math.min(G.imgW - x, b.w + b.h * .4);
            veil.setAttribute('d', `M0 0H${G.imgW}V${G.imgH}H0Z M${x} ${y}H${x + w}V${y + h}H${x}Z`);
            veil.style.fillOpacity = String(force());
            Object.entries({x, y, width: w, height: h}).forEach(([k, v]) => band.setAttribute(k, v));
            band.classList.toggle('is-est', b.est); band.style.strokeWidth = String(1.5 / (G.zoom || 1));
            g.style.display = ''; dlg.dataset.txRegleBand = JSON.stringify({x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), est: b.est});
            return {x, y, w, h};
        }
        let raf = 0; const soon = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); };
        const set = v => { on = v; lsSet(KEY, v ? '1' : '0'); paintBtn(); paint(); };
        plug.regle = {toggle: () => set(!on), set, paint, isOn: () => on};
        btn.addEventListener('click', () => set(!on));
        pill.addEventListener('input', e => { if (!e.target.matches('[data-aip-force]')) return; lsSet(FORCE_KEY, String(Number(e.target.value) / 100)); paint(); });
        pill.addEventListener('click', e => { if (e.target.closest('[data-aip-off]')) set(false); });
        ['select', 'keyup', 'mouseup', 'input', 'focus'].forEach(ev => area.addEventListener(ev, soon));
        document.addEventListener('selectionchange', soon);
        new MutationObserver(soon).observe(zonesG, {attributes: true, attributeFilter: ['transform'], childList: true});
        new MutationObserver(soon).observe(world, {attributes: true, attributeFilter: ['transform']});
        /** ↑ ↓ sur l'image : la ligne d'avant / d'après (les lignes vides sautées), le curseur du texte suit */
        function step(d) {
            const v = area.value; let L = lineAt(v, area.selectionStart);
            for (let i = 0; i < 200; i++) {
                const pos = d > 0 ? L.e + 1 : L.s - 1; if (pos < 0 || pos > v.length || (d > 0 && L.e >= v.length)) return false;
                L = lineAt(v, pos); if (v.slice(L.s, L.e).trim()) break;
            }
            area.setSelectionRange(L.s, L.s); manual = null;
            const r = paint(); if (r) plug.reveal({x: r.x, y: r.y, w: r.w, h: r.h});
            return true;
        }
        const onKey = e => {
            if (!on || !dlg.open || [...document.querySelectorAll('dialog[open]')].at(-1) !== dlg) return;
            if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || e.altKey || e.shiftKey || e.metaKey || e.ctrlKey) return;
            if (!e.target.closest?.('[data-tx-stage]') && e.target !== stage) return;
            e.preventDefault(); e.stopPropagation(); step(e.key === 'ArrowDown' ? 1 : -1);
        };
        window.addEventListener('keydown', onKey, true);
        // glisser la bande estimée (ligne sans zone)
        band.addEventListener('pointerdown', e => { if (!band.classList.contains('is-est')) return; e.stopPropagation(); e.preventDefault(); const L = lineAt(area.value, area.selectionStart); drag = {y0: e.clientY, dy0: manual?.key === `${L.s}` ? manual.dy : 0, key: `${L.s}`}; band.setPointerCapture?.(e.pointerId); });
        band.addEventListener('pointermove', e => { if (!drag) return; const z = plug.geo().zoom || 1; manual = {key: drag.key, dy: drag.dy0 + (e.clientY - drag.y0) / z}; paint(); });
        band.addEventListener('pointerup', () => { drag = null; });
        new MutationObserver(() => { if (!dlg.isConnected) { window.removeEventListener('keydown', onKey, true); document.removeEventListener('selectionchange', soon); } }).observe(document.body, {childList: true});
        paintBtn(); paint();
    }

    ext.txPlugins = ext.txPlugins || []; ext.txPlugins.push(init);
    ext.txMenus = ext.txMenus || [];
    ext.txMenus.push((menu, plug) => (menu === 'Affichage' && plug.regle ? [{icon: '📏', label: plug.regle.isOn() ? i18n('Éteindre la règle de lecture') : i18n('Règle de lecture'), run: () => plug.regle.toggle()}] : []));
})();
