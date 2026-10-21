/* LCNDA — ♿ Accessibilité (Maintenance → Accessibilité).
 * Réglages gardés dans localStorage « genealogie-accessibilite » (copié dans la base par app.js, comme les autres « genealogie-* ») et appliqués à toute l'app dès le
 * chargement : classes « a11y-… » et variables « --a11y-… » sur <html> (styles : assets/css/access.css).
 * Couleurs : filtre SVG de correction (daltonisation, matrices de Machado 2009) + palette sûre Okabe-Ito pour les
 * couleurs de sens ; aperçu « voir comme… » (filtre de simulation). Texte, contraste, focus, grandes cibles, curseur,
 * mouvement, durée des messages, lecture à voix haute (speechSynthesis), sous-titres toujours affichés (pistes <track> et
 * aperçu des montages), description des images pour les lecteurs d'écran (alt des médias, descriptions écrites gardées dans
 * « genealogie-media-alt »), mode « une chose à la fois » (html.a11y-simple), dictée vocale (SpeechRecognition, fr-FR).
 * API : window.LCNDA_EXT.access = {get, set, reset, apply, simulate, speak, stop} ; page : LCNDA_EXT.maintenance.accessibilite(token).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const KEY = 'genealogie-accessibilite';
    const SIM_KEY = 'genealogie-accessibilite-simulation';
    const FAQ_Q = 'Comment rendre l’app plus facile à lire ou à utiliser (daltonisme, gros texte, voix) ?';
    const root = document.documentElement;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (m, k) => (A().toast ? A().toast(m, k) : console.info(m));

    /* la feuille de style va avec le script : une seule ligne à ajouter dans index.php */
    (() => {
        if (document.querySelector('link[href*="assets/css/access.css"]')) return;
        const src = document.currentScript?.src || '', v = (src.match(/[?&]v=([^&]+)/) || [])[1];
        const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = `assets/css/access.css${v ? `?v=${v}` : ''}`;
        document.head.appendChild(l);
    })();

    /* ═════ Réglages ═════ */
    const DEFAULTS = () => ({
        cb: 'none', fix: 80, safe: false, shapes: false,
        size: 100, lh: null, ls: 0, ws: 0, font: 'app', underline: false,
        contrast: false,
        focus: false, big: false, cursor: false,
        calm: false, toastX: 1,
        tts: false, rate: 1, voice: '',
        subs: false, alt: false, simple: false, dictate: false,
    });
    let P = DEFAULTS();
    const load = () => {
        let s = null; try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { s = null; }
        const d = DEFAULTS(); P = {...d, ...(s && typeof s === 'object' ? s : {})};
        const clamp = (v, a, b, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : def; };
        if (!CB[P.cb]) P.cb = 'none';
        P.fix = clamp(P.fix, 0, 100, d.fix); P.size = clamp(P.size, 90, 160, 100); P.lh = P.lh == null ? null : clamp(P.lh, 1, 2, null);
        P.ls = clamp(P.ls, 0, 0.2, 0); P.ws = clamp(P.ws, 0, 0.5, 0); P.rate = clamp(P.rate, 0.5, 2, 1); P.toastX = [1, 2, 3].includes(Number(P.toastX)) ? Number(P.toastX) : 1;
        if (!FONTS[P.font]) P.font = 'app';
        return P;
    };
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (_) {} };

    /* ═════ Couleurs : simulation et correction ═════ */
    const M = {
        protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
        deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
        tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
        protanomaly: [[0.385450, 0.769005, -0.154455], [0.100526, 0.829802, 0.069673], [-0.007442, -0.022190, 1.029632]],
        deuteranomaly: [[0.547494, 0.607765, -0.155259], [0.181692, 0.781742, 0.036566], [-0.010410, 0.027275, 0.983136]],
        tritanomaly: [[1.104996, -0.046633, -0.058363], [-0.032137, 0.971635, 0.060503], [0.001336, 0.317922, 0.680742]],
        achroma: [[0.2126, 0.7152, 0.0722], [0.2126, 0.7152, 0.0722], [0.2126, 0.7152, 0.0722]],
    };
    const CB = {
        none: {label: 'Normal', hint: 'Les couleurs de l’app, sans changement.'},
        protan: {label: 'Protanopie', hint: 'Le rouge est peu visible (paraît sombre, se confond avec le vert).', m: 'protan', kind: 'rg'},
        deutan: {label: 'Deutéranopie', hint: 'Le vert est peu visible — le plus fréquent (environ 1 homme sur 20).', m: 'deutan', kind: 'rg'},
        tritan: {label: 'Tritanopie', hint: 'Le bleu et le jaune se confondent (rare).', m: 'tritan', kind: 'by'},
        achroma: {label: 'Achromatopsie', hint: 'Pas de couleurs du tout : tout est en gris.', m: 'achroma', kind: 'gray'},
        protanomaly: {label: 'Protanomalie', hint: 'Rouge affaibli.', m: 'protanomaly', kind: 'rg', light: true},
        deuteranomaly: {label: 'Deutéranomalie', hint: 'Vert affaibli (le plus courant de tous).', m: 'deuteranomaly', kind: 'rg', light: true},
        tritanomaly: {label: 'Tritanomalie', hint: 'Bleu et jaune affaiblis.', m: 'tritanomaly', kind: 'by', light: true},
    };
    const mul = (a, b) => a.map((r, i) => b[0].map((_, j) => r.reduce((s, _x, k) => s + a[i][k] * b[k][j], 0)));
    const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const matValues = m => [...m.map(r => [...r.map(x => +x.toFixed(6)), 0, 0]), [0, 0, 0, 1, 0]].map(r => r.join(' ')).join('  ');
    /* daltonisation : ce que la personne ne voit pas (original − simulé) est reporté sur les canaux qu'elle voit */
    function fixMatrix(type, k) {
        const S = M[CB[type].m], E = I3.map((r, i) => r.map((x, j) => x - S[i][j]));
        const Sh = CB[type].kind === 'by' ? [[1, 0, 0.7], [0, 1, 0.7], [0, 0, 0]] : [[0, 0, 0], [0.7, 1, 0], [0.7, 0, 1]];
        const C = mul(Sh, E);
        return I3.map((r, i) => r.map((x, j) => x + k * C[i][j]));
    }
    const SVG_NS = 'http://www.w3.org/2000/svg';
    function ensureSvg() {
        let svg = document.getElementById('a11y-svg'); if (svg || !document.body) return svg;
        svg = document.createElementNS(SVG_NS, 'svg'); svg.id = 'a11y-svg'; svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
        svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
        svg.innerHTML = `<defs><filter id="a11y-fix" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="${matValues(I3)}"/></filter>
            ${Object.keys(CB).filter(k => CB[k].m).map(k => `<filter id="a11y-sim-${k}" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="${matValues(M[CB[k].m])}"/></filter>`).join('')}</defs>`;
        document.body.appendChild(svg);
        return svg;
    }
    function updateFixFilter() {
        const svg = ensureSvg(); if (!svg) return;
        const f = svg.querySelector('#a11y-fix'), k = P.fix / 100;
        if (P.cb === 'achroma') { // pas de correction de couleur possible : on renforce les différences de clair et de foncé
            const s = 1 + 0.45 * k, b = -0.225 * k;
            f.innerHTML = `<feComponentTransfer><feFuncR type="linear" slope="${s}" intercept="${b}"/><feFuncG type="linear" slope="${s}" intercept="${b}"/><feFuncB type="linear" slope="${s}" intercept="${b}"/></feComponentTransfer>`;
        } else if (CB[P.cb]?.m) f.innerHTML = `<feColorMatrix type="matrix" values="${matValues(fixMatrix(P.cb, k))}"/>`;
    }
    let sim = '';
    try { sim = sessionStorage.getItem(SIM_KEY) || ''; if (!CB[sim]?.m) sim = ''; } catch (_) { sim = ''; }

    /* palette sûre (Okabe-Ito) */
    const OI = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#999999'];

    /* ═════ Appliquer à toute l'app ═════ */
    /* Atkinson Hyperlegible et OpenDyslexic sont embarquées (assets/fonts/, licence SIL OFL, @font-face dans access.css) :
       elles marchent partout, même hors ligne. Comic Sans est celle de l'ordinateur (absente sous Linux le plus souvent). */
    const FONTS = {
        app: {label: 'Celle de l’app', stack: ''},
        legible: {label: 'Très lisible', face: 'Atkinson Hyperlegible', stack: '"Atkinson Hyperlegible", Verdana, Tahoma, "DejaVu Sans", sans-serif'},
        dys: {label: 'OpenDyslexic', group: 'dys', face: 'OpenDyslexic', stack: 'OpenDyslexic, "Comic Sans MS", Verdana, sans-serif'},
        comic: {label: 'Comic Sans', group: 'dys', system: 'Comic Sans MS', stack: '"Comic Sans MS", "Comic Sans", "Comic Neue", OpenDyslexic, Verdana, sans-serif'},
    };
    function fontExists(name) {
        try {
            const c = fontExists.c || (fontExists.c = document.createElement('canvas').getContext('2d')), t = 'mmmmmmmmmwwwwwwwlli1ÉgQ';
            return ['monospace', 'serif', 'sans-serif'].some(base => { c.font = `72px ${base}`; const w0 = c.measureText(t).width; c.font = `72px "${name}", ${base}`; return c.measureText(t).width !== w0; });
        } catch (_) { return false; }
    }
    /* la police de l'ordinateur est-elle là ? (Comic Sans) — « Comic Sans MS » ou « Comic Sans » */
    const comicInstalled = () => (comicInstalled.v ??= ['Comic Sans MS', 'Comic Sans'].some(fontExists));

    const CLASSES = ['a11y-filter', 'a11y-safe', 'a11y-shapes', 'a11y-zoom', 'a11y-lh', 'a11y-spacing', 'a11y-font', 'a11y-underline', 'a11y-contrast', 'a11y-focus', 'a11y-big', 'a11y-cursor', 'a11y-calm', 'a11y-sim', 'a11y-subs', 'a11y-alt', 'a11y-simple', 'a11y-dictate'];
    function apply() {
        const on = {
            'a11y-safe': P.safe, 'a11y-shapes': P.shapes, 'a11y-zoom': P.size !== 100, 'a11y-lh': P.lh != null,
            'a11y-spacing': P.ls > 0 || P.ws > 0, 'a11y-font': P.font !== 'app', 'a11y-underline': P.underline, 'a11y-contrast': P.contrast,
            'a11y-focus': P.focus, 'a11y-big': P.big, 'a11y-cursor': P.cursor, 'a11y-calm': P.calm, 'a11y-sim': !!sim,
            'a11y-subs': P.subs, 'a11y-alt': P.alt, 'a11y-simple': P.simple, 'a11y-dictate': P.dictate && !dictationWhy(),
        };
        const filters = [];
        if (P.cb !== 'none' && P.fix > 0) { updateFixFilter(); filters.push('url(#a11y-fix)'); }
        if (sim) { ensureSvg(); filters.push(`url(#a11y-sim-${sim})`); }
        on['a11y-filter'] = filters.length > 0;
        CLASSES.forEach(c => root.classList.toggle(c, !!on[c]));
        const set = (k, v) => (v == null ? root.style.removeProperty(k) : root.style.setProperty(k, v));
        set('--a11y-filter', filters.length ? filters.join(' ') : null);
        set('--a11y-zoom', P.size !== 100 ? String(P.size / 100) : null);
        set('--a11y-lh', P.lh != null ? String(P.lh) : null);
        set('--a11y-ls', P.ls > 0 ? `${P.ls}em` : null); set('--a11y-ws', P.ws > 0 ? `${P.ws}em` : null);
        set('--a11y-font', P.font !== 'app' ? FONTS[P.font].stack : null);
        root.dataset.a11yToast = String(P.toastX);
        applyGender(); remapCharts(); showSimBanner(); updateFloating();
        if (document.body) { applySubs(); applyAlt(); updateSimpleBar(); trackModule(); if (!P.dictate || dictationWhy()) { dictStop(true); hideMic(); } }
    }

    /* couleurs homme / femme : celles de l'app (Maintenance → couleurs des fiches) remplacées par une paire sûre, si elles sont différentes */
    const lum = hex => { const m = String(hex).trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i); if (!m) return 1; let h = m[1]; if (h.length === 3) h = h.replace(/./g, c => c + c); const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    function applyGender() {
        let st = document.getElementById('a11y-gender-style');
        const g = k => root.style.getPropertyValue(`--gender-${k}-bg`).trim().toLowerCase();
        const male = g('male'), female = g('female');
        let css = '';
        if (P.safe && male && female && male !== female) {
            const pick = (hex, dark, light) => (lum(hex) < 0.35 ? dark : light);
            const [mb, mt] = pick(male, ['#0072B2', '#ffffff'], ['#cfe6f6', '#000000']), [fb, ft] = pick(female, ['#CC79A7', '#000000'], ['#f6dcea', '#000000']);
            css = `html.a11y-safe{--gender-male-bg:${mb}!important;--gender-male-text:${mt}!important;--gender-female-bg:${fb}!important;--gender-female-text:${ft}!important}`;
        }
        if (!css) { st?.remove(); return; }
        if (!st) { st = document.createElement('style'); st.id = 'a11y-gender-style'; document.head.appendChild(st); }
        if (st.textContent !== css) st.textContent = css;
    }
    new MutationObserver(() => { if (P.safe) applyGender(); }).observe(root, {attributes: true, attributeFilter: ['style']});

    /* couleurs des graphiques : la palette des statistiques (écrite dans les barres) → palette sûre */
    const CHART_SEL = '.stats-stage [style], .stats-chart [style], .stats-histogram [style], .stats-custom-grid [style], .a11y-demo-chart [style]';
    function remapCharts(scope = document) {
        const els = scope.querySelectorAll ? scope.querySelectorAll(CHART_SEL) : [];
        if (!P.safe) { scope.querySelectorAll?.('[data-a11y-style]').forEach(el => { el.setAttribute('style', el.dataset.a11yStyle); delete el.dataset.a11yStyle; }); return; }
        let pal = []; try { pal = (A().getStatsColors?.() || []).map(c => String(c).toLowerCase()); } catch (_) { pal = []; }
        if (!pal.length) return;
        const map = new Map(); pal.forEach((c, i) => { if (!map.has(c)) map.set(c, OI[i % OI.length]); });
        const re = new RegExp(pal.map(c => c.replace('#', '#')).filter((c, i, a) => a.indexOf(c) === i).sort((a, b) => b.length - a.length).join('|'), 'gi');
        els.forEach(el => {
            if (el.dataset.a11yStyle != null) return;
            const s = el.getAttribute('style') || ''; if (!re.test(s)) return; re.lastIndex = 0;
            el.dataset.a11yStyle = s; el.setAttribute('style', s.replace(re, m => map.get(m.toLowerCase()) || m));
        });
    }
    let chartTimer = 0;
    const watchCharts = () => new MutationObserver(() => { if (!P.safe) return; clearTimeout(chartTimer); chartTimer = setTimeout(() => remapCharts(), 60); }).observe(document.body, {childList: true, subtree: true});

    /* ═════ Mouvement : pas de défilement animé demandé par le code ═════ */
    const calm = () => root.classList.contains('a11y-calm');
    const unsmooth = o => (o && typeof o === 'object' && o.behavior === 'smooth' && calm() ? {...o, behavior: 'auto'} : o);
    [[Element.prototype, 'scrollIntoView'], [Element.prototype, 'scrollTo'], [Element.prototype, 'scrollBy'], [window, 'scrollTo'], [window, 'scrollBy']].forEach(([o, k]) => {
        const f = o[k]; if (typeof f !== 'function') return;
        o[k] = function (...a) { if (a.length === 1) a[0] = unsmooth(a[0]); return f.apply(this, a); };
    });

    /* ═════ Messages (toasts) plus longs : l'app les retire au bout de 4,2 s, on les remet le temps qu'il faut ═════ */
    function watchToasts() {
        const region = document.getElementById('toast-region'); if (!region) return;
        new MutationObserver(list => {
            const x = P.toastX; if (x <= 1) return;
            list.forEach(m => m.removedNodes.forEach(n => {
                if (n.nodeType !== 1 || !n.classList.contains('toast') || n._a11yKept) return;
                n._a11yKept = true; n.style.animation = 'none';
                const next = m.nextSibling && m.nextSibling.parentNode === region ? m.nextSibling : null;
                region.insertBefore(n, next);
                setTimeout(() => n.remove(), 4200 * (x - 1));
            }));
        }).observe(region, {childList: true});
    }

    /* ═════ Lecture à voix haute ═════ */
    const TTS = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
    const frVoices = () => { try { return speechSynthesis.getVoices().filter(v => /^fr(-|_|$)/i.test(v.lang)); } catch (_) { return []; } };
    function pickVoice() { const l = frVoices(); return l.find(v => v.voiceURI === P.voice) || l.find(v => /fr-FR/i.test(v.lang) && v.localService) || l.find(v => /fr-FR/i.test(v.lang)) || l[0] || null; }
    function chunks(text) {
        const out = []; const parts = String(text).replace(/\s+/g, ' ').trim().split(/(?<=[.!?…;:])\s+/);
        let cur = '';
        parts.forEach(p => { while (p.length > 220) { const cut = p.lastIndexOf(' ', 220) > 60 ? p.lastIndexOf(' ', 220) : 220; out.push((cur + ' ' + p.slice(0, cut)).trim()); cur = ''; p = p.slice(cut); } if ((cur + ' ' + p).length > 220) { out.push(cur.trim()); cur = p; } else cur = `${cur} ${p}`; });
        if (cur.trim()) out.push(cur.trim());
        return out.filter(Boolean);
    }
    let speakingId = 0;
    function speak(text) {
        if (!TTS) { toast('La lecture à voix haute n’est pas possible dans ce navigateur.', 'error'); return false; }
        stop(); const id = ++speakingId, list = chunks(text); if (!list.length) return false;
        const v = pickVoice();
        list.forEach((t, i) => {
            const u = new SpeechSynthesisUtterance(t); u.lang = v?.lang || 'fr-FR'; if (v) u.voice = v; u.rate = P.rate;
            if (i === list.length - 1) u.onend = u.onerror = () => { if (id === speakingId) { speakingId = 0; updateFloating(); } };
            speechSynthesis.speak(u);
        });
        updateFloating();
        return true;
    }
    function stop() { if (!TTS) return; speakingId = 0; try { speechSynthesis.cancel(); } catch (_) {} updateFloating(); }
    const speaking = () => TTS && speakingId > 0;
    /* texte à lire : sans les boutons ni les cases vides (« — »), avec une pause entre les lignes */
    const BLOCK = /^(DIV|P|LI|DT|DD|TR|TD|TH|H[1-6]|SECTION|ARTICLE|HEADER|FOOTER|UL|OL|DL|TABLE|BLOCKQUOTE|FIGCAPTION)$/;
    const clean = el => {
        const c = el.cloneNode(true);
        c.querySelectorAll('button, input, select, textarea, script, style, svg, img, [aria-hidden="true"], [hidden], .card-head-actions, .no-export, [class*="web-search"], [class*="initial"], .portrait, .card-index').forEach(x => x.remove());
        c.querySelectorAll('.data-row, dl > div').forEach(r => { const v = r.querySelector('dd'); if (v && /^[—–-]?$/.test(v.textContent.trim())) r.remove(); });
        c.querySelectorAll('dt').forEach(x => x.append(' : '));
        c.querySelectorAll('*').forEach(x => x.append(BLOCK.test(x.tagName) ? '. ' : ' '));
        return (c.textContent || '').replace(/\s+/g, ' ').replace(/\s*:\s*\.\s*/g, ' : ').replace(/(\s*\.\s*){2,}/g, '. ').replace(/^\s*\.\s*/, '').trim();
    };
    function personPageText() {
        const page = document.querySelector('#workspace .person-page'); if (!page) return '';
        const hero = page.querySelector('.person-hero'); const parts = [];
        if (hero) { const h2 = hero.querySelector('h2'); if (h2) parts.push(`${h2.textContent.trim()}.`); const rest = clean(hero).replace(h2?.textContent.trim() || '', '').trim(); if (rest) parts.push(rest); }
        page.querySelectorAll('.card').forEach(card => {
            if (!card.getClientRects().length || card.closest('[hidden]')) return;
            const t = card.querySelector('.card-head h3'), body = card.querySelector('.card-body');
            const tt = t ? clean(t).replace(/\(\d+\)$/, '').trim() : '', bt = body ? clean(body) : '';
            if (bt) parts.push(`${tt ? tt + '. ' : ''}${bt}`);
        });
        return parts.map(t => (/[.!?…]$/.test(t) ? t : `${t}.`)).join(' ').replace(/(\s*\.\s*){2,}/g, '. ');
    }
    /* bouton 🔊 près d'une sélection, « Lire la fiche », « Arrêter » */
    let sayBtn = null, dock = null;
    const hostFor = node => (node?.nodeType === 1 ? node : node?.parentElement)?.closest?.('dialog[open]') || document.body;
    function placeFixed(el, host, x, y) {
        if (el.parentNode !== host) host.appendChild(el);
        let ox = 0, oy = 0;
        if (host !== document.body) { const cs = getComputedStyle(host); if (cs.filter !== 'none' || cs.transform !== 'none') { const r = host.getBoundingClientRect(); ox = r.left + host.clientLeft; oy = r.top + host.clientTop; } }
        el.style.left = `${Math.max(4, Math.min(innerWidth - 50, x) - ox)}px`; el.style.top = `${Math.max(4, Math.min(innerHeight - 46, y) - oy)}px`;
    }
    function selectionChanged() {
        if (!P.tts || !TTS) { sayBtn?.remove(); return; }
        const s = getSelection(), text = s && s.rangeCount ? s.toString().trim() : '';
        if (text.length < 2 || s.anchorNode?.parentElement?.closest('.a11y-say, .a11y-dock')) { if (sayBtn && !sayBtn.matches(':hover')) sayBtn.remove(); return; }
        if (!sayBtn) {
            sayBtn = document.createElement('button'); sayBtn.type = 'button'; sayBtn.className = 'a11y-say'; sayBtn.textContent = '🔊'; sayBtn.title = 'Lire à voix haute la sélection (Échap pour arrêter)'; sayBtn.setAttribute('aria-label', 'Lire à voix haute le texte sélectionné');
            sayBtn.addEventListener('mousedown', e => e.preventDefault());
            sayBtn.addEventListener('click', () => { const t = getSelection()?.toString() || ''; speak(t); sayBtn.remove(); });
        }
        const r = s.getRangeAt(0).getBoundingClientRect(); if (!r.width && !r.height) return;
        placeFixed(sayBtn, hostFor(s.focusNode), r.right + 6, r.bottom + 6);
    }
    let selTimer = 0;
    document.addEventListener('selectionchange', () => { clearTimeout(selTimer); selTimer = setTimeout(selectionChanged, 220); });
    function updateFloating() {
        const need = (P.tts && TTS && document.querySelector('#workspace .person-page .person-hero')) || speaking();
        if (!need) { dock?.remove(); return; }
        if (!dock) {
            dock = document.createElement('div'); dock.className = 'a11y-dock'; dock.setAttribute('role', 'region'); dock.setAttribute('aria-label', 'Lecture à voix haute');
            dock.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.a11yStop != null) stop(); else if (b.dataset.a11yReadPage != null) { const t = personPageText(); if (!speak(t)) toast('Rien à lire sur cette fiche.'); } });
        }
        const host = topModal() || document.body;
        if (dock.parentNode !== host) host.appendChild(dock);
        const html = speaking() ? '<button type="button" class="a11y-dock-stop" data-a11y-stop>⏹ Arrêter la lecture <kbd>Échap</kbd></button>' : (P.tts && document.querySelector('#workspace .person-page .person-hero') && host === document.body ? '<button type="button" data-a11y-read-page title="Lire à voix haute le nom et les blocs visibles de la fiche">🔊 Lire la fiche</button>' : '');
        if (!html) { dock.remove(); return; }
        if (dock.innerHTML !== html) dock.innerHTML = html;
    }
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && speaking()) { e.preventDefault(); e.stopPropagation(); stop(); } }, true);
    let wsTimer = 0;
    const watchWorkspace = () => { const ws = document.getElementById('workspace'); if (ws) new MutationObserver(() => { clearTimeout(wsTimer); wsTimer = setTimeout(updateFloating, 150); }).observe(ws, {childList: true}); };

    /* ═════ Aperçu « voir comme… » (simulation) ═════ */
    let banner = null;
    const CAN_POP = 'popover' in HTMLElement.prototype;
    function simulate(type) {
        sim = CB[type]?.m ? type : '';
        try { if (sim) sessionStorage.setItem(SIM_KEY, sim); else sessionStorage.removeItem(SIM_KEY); } catch (_) {}
        apply(); refreshPage();
    }
    function showSimBanner() {
        if (!sim) { if (banner) { try { banner.hidePopover?.(); } catch (_) {} banner.remove(); banner = null; } return; }
        if (!document.body) return;
        if (!banner) {
            banner = document.createElement('div'); banner.className = 'a11y-banner'; banner.setAttribute('role', 'status');
            if (CAN_POP) banner.setAttribute('popover', 'manual');
            banner.addEventListener('click', e => { if (e.target.closest('[data-a11y-sim-stop]')) simulate(''); });
            banner.addEventListener('change', e => { if (e.target.matches('[data-a11y-sim-pick]')) simulate(e.target.value); });
        }
        banner.innerHTML = `<span class="a11y-banner-eye" aria-hidden="true">👁</span><span><b>Simulation</b> — l’écran est montré comme le voit une personne atteinte de <select data-a11y-sim-pick aria-label="Type de daltonisme simulé">${Object.keys(CB).filter(k => CB[k].m).map(k => `<option value="${k}" ${k === sim ? 'selected' : ''}>${esc(CB[k].label.toLowerCase())}</option>`).join('')}</select>. Ce n’est qu’un aperçu : rien n’est changé.</span><button type="button" class="button small" data-a11y-sim-stop>Arrêter</button>`;
        placeBanner();
    }
    /* une fenêtre ouverte rend le reste de la page inactif : le bandeau va dans la fenêtre du dessus, toujours tout en haut */
    const topModal = () => [...document.querySelectorAll('dialog[open]')].filter(d => { try { return d.matches(':modal'); } catch (_) { return false; } }).at(-1) || null;
    function placeBanner() {
        if (!banner || !sim) return;
        const host = topModal() || document.body;
        if (banner.parentNode !== host) { try { banner.hidePopover?.(); } catch (_) {} host.appendChild(banner); }
        if (CAN_POP) { try { if (banner.matches(':popover-open')) banner.hidePopover(); banner.showPopover(); } catch (_) {} }
    }
    const onLayerChange = () => { placeBanner(); updateFloating(); syncLightboxField(); };
    setInterval(() => { if (sim && banner && !banner.isConnected) placeBanner(); }, 1000); // la fenêtre qui le portait a été retirée
    document.addEventListener('toggle', e => { if (e.target !== banner && e.target.matches?.('dialog, [popover]')) setTimeout(onLayerChange); }, true);
    document.addEventListener('close', () => setTimeout(onLayerChange), true);
    new MutationObserver(list => { if (list.some(m => m.attributeName === 'open')) setTimeout(onLayerChange); }).observe(document.documentElement, {attributes: true, attributeFilter: ['open'], subtree: true});

    /* ═════ Sous-titres toujours affichés ═════ */
    /* Une vidéo qui a une piste de sous-titres (<track kind="subtitles|captions">) la montre d'office (en français s'il y en a une) ;
       l'aperçu des montages (heritage-studio-av.js) lit la classe « a11y-subs » pour dessiner la piste « Sous-titres » même cachée. */
    const shownTracks = new Map(); // piste → mode d'avant
    function showTracks(v) {
        const list = v.textTracks ? [...v.textTracks].filter(t => t.kind === 'subtitles' || t.kind === 'captions') : [];
        if (!list.length || list.some(t => t.mode === 'showing')) return; // déjà une piste affichée (choisie par la personne)
        const t = list.find(x => /^fr/i.test(x.language || '')) || list[0];
        if (!shownTracks.has(t)) shownTracks.set(t, t.mode);
        try { t.mode = 'showing'; } catch (_) {}
    }
    function hookVideo(v) {
        if (!v._a11ySubs) {
            v._a11ySubs = true;
            v.textTracks?.addEventListener?.('addtrack', () => { if (P.subs) setTimeout(() => showTracks(v)); });
            v.addEventListener('loadedmetadata', () => { if (P.subs) showTracks(v); });
        }
        showTracks(v);
    }
    function applySubs() {
        if (P.subs) { document.querySelectorAll('video').forEach(hookVideo); return; }
        shownTracks.forEach((mode, t) => { try { t.mode = mode === 'showing' ? 'hidden' : mode; } catch (_) {} });
        shownTracks.clear();
    }

    /* ═════ Description des images pour les lecteurs d'écran (texte alternatif) ═════ */
    /* Toute image dont l'adresse est un fichier des médias (media/…) reçoit un « alt » utile : la description écrite pour les
       lecteurs d'écran (fenêtre du média), sinon titre + date + lieu + personnes. Les infos viennent de picker_search (100 à la
       fois, gardées en mémoire). Les petites images posées à côté d'un nom et les images de décoration reçoivent alt="".
       Un alt déjà bien écrit par l'app est gardé. Quand le réglage est coupé, chaque image retrouve son alt d'avant. */
    const ALT_KEY = 'genealogie-media-alt'; // {numéro du média: description} — copié dans la base par app.js
    let altCache = null;
    const readAlts = () => {
        if (altCache) return altCache;
        try { const o = JSON.parse(localStorage.getItem(ALT_KEY) || '{}'); altCache = o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (_) { altCache = {}; }
        return altCache;
    };
    function writeAlt(id, text) {
        const o = {...readAlts()}, t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 600);
        if (t) o[id] = t; else delete o[id];
        altCache = o;
        try { if (Object.keys(o).length) localStorage.setItem(ALT_KEY, JSON.stringify(o)); else localStorage.removeItem(ALT_KEY); } catch (_) {}
        if (P.alt) scanAlt(document);
    }
    const byFile = new Map(), byId = new Map(), names = new Map(), missing = new Set();
    const wantFiles = new Set(), wantIds = new Set();
    let catalog = {offset: 0, done: false};
    const pick = params => (A().api ? A().api('picker_search', params) : fetch(`api.php?${new URLSearchParams({action: 'picker_search', ...params})}`, {headers: {Accept: 'application/json'}}).then(r => r.json()));
    const itemsOf = r => (r?.groups || []).flatMap(g => g.items || []);
    function remember(it, full = false) {
        if (!it?.id) return;
        const m = byId.get(it.id) || {id: it.id};
        Object.assign(m, {title: it.title || '', filename: it.filename || '', media_type: String(it.media_type || '').toLowerCase(), date_text: it.date_text || '', year: it.year || '', place: it.place || '', tag: it.tag || '', people: (it.people_ids || []).map(Number)});
        if (full) { m.description = String(it.description || ''); m.full = true; }
        byId.set(it.id, m);
        [it.filename, it.thumbnail].forEach(f => { if (f) { byFile.set(f, it.id); missing.delete(f); } });
    }
    function mediaFile(img) {
        const src = img.getAttribute('src') || ''; if (!src || /^(data|blob|about):/i.test(src)) return '';
        let u; try { u = new URL(src, location.href); } catch (_) { return ''; }
        if (u.origin !== location.origin) return '';
        const m = u.pathname.match(/\/media\/(.+)$/); if (!m) return '';
        try { return decodeURIComponent(m[1]); } catch (_) { return m[1]; }
    }
    const fileLike = t => !t || (/\.[a-z0-9]{2,5}$/i.test(t) && !/\s/.test(t)) || /^[0-9a-f]{16,}/i.test(t);
    const GENERIC = /^(image|images|photo|photographie|aper[çc]u|vignette|miniature|portrait|m[ée]dia|document|capture|img|picture|thumbnail|thumb|fichier|illustration|logo|icon|ic[ôo]ne)$/i;
    const goodAlt = a => { const t = String(a || '').trim(); return t.length >= 4 && !fileLike(t) && !GENERIC.test(t); };
    const joinFr = l => (l.length < 2 ? l.join('') : `${l.slice(0, -1).join(', ')} et ${l.at(-1)}`);
    const firstSentence = t => { const x = String(t || '').replace(/\s+/g, ' ').trim(); const m = x.match(/^.{20,200}?[.!?…](\s|$)/); return (m ? m[0] : x.slice(0, 200)).trim(); };
    /** Le texte lu pour un média (null tant que ses infos ne sont pas arrivées). */
    function altFor(id) {
        const own = readAlts()[id]; if (own) return own;
        const m = byId.get(Number(id)); if (!m) return null;
        const kind = m.tag ? m.tag.charAt(0) + m.tag.slice(1).toLowerCase() : m.media_type === 'document' || m.media_type === 'pdf' ? 'Document' : 'Photo';
        const title = fileLike(m.title) ? '' : m.title.trim();
        let s = title || kind;
        const when = m.date_text || String(m.year || ''), extra = [when && !title.includes(when) ? when : '', m.place && !title.includes(m.place) ? m.place : ''].filter(Boolean);
        if (extra.length) s += ` (${extra.join(', ')})`;
        const who = m.people.map(i => names.get(i)).filter(Boolean).filter(n => !title.includes(n));
        if (who.length) s += ` — ${who.length > 4 ? `${who.slice(0, 3).join(', ')} et ${who.length - 3} autres personnes` : joinFr(who)}`;
        if (!title && m.description) s += `. ${firstSentence(m.description)}`;
        return s;
    }
    /* petite image posée à côté d'un nom (pastille, avatar) : le nom est déjà lu, l'image est décorative */
    function tinyBesideText(img) {
        const r = img.getBoundingClientRect(); if (!r.width || r.width > 44 || r.height > 44) return false;
        const box = img.closest('button, a, li, label, [class*="chip"], [class*="row"], [class*="item"], [class*="av"]');
        return !!box && box.textContent.replace(/\s+/g, '').length > 1;
    }
    function markAlt(img, text) {
        if (!img.hasAttribute('data-a11y-alt-orig')) img.setAttribute('data-a11y-alt-orig', img.hasAttribute('alt') ? img.getAttribute('alt') : '\u0001');
        if (img.getAttribute('alt') !== text) img.setAttribute('alt', text);
        img.dataset.a11yAlt = text;
    }
    function processImg(img) {
        const cur = img.getAttribute('alt'), mine = img.dataset.a11yAlt != null && cur === img.dataset.a11yAlt;
        const file = mediaFile(img);
        if (!file) { if (cur == null) markAlt(img, img.getAttribute('title') || ''); return; } // pas un média : décoration (ou son titre)
        const id = byFile.get(file);
        if (id == null) { if (!missing.has(file)) { wantFiles.add(file); scheduleResolve(); } else if (cur == null) markAlt(img, ''); return; }
        const m = byId.get(id);
        if (!m?.full || m.people.some(i => !names.has(i))) { wantIds.add(id); scheduleResolve(); }
        if (tinyBesideText(img)) { if (cur == null || mine || !goodAlt(cur)) markAlt(img, ''); return; }
        const own = readAlts()[id];
        if (!own && cur != null && !mine && goodAlt(cur)) return; // déjà bien décrite par l'app
        const text = altFor(id); if (text != null) markAlt(img, text);
    }
    function scanAlt(root) {
        if (!P.alt || !root) return;
        if (root.tagName === 'IMG') processImg(root); else root.querySelectorAll?.('img').forEach(processImg);
    }
    function applyAlt() {
        if (P.alt) { scanAlt(document); syncLightboxField(); return; }
        document.querySelectorAll('img[data-a11y-alt-orig]').forEach(img => {
            const o = img.getAttribute('data-a11y-alt-orig');
            if (o === '\u0001') img.removeAttribute('alt'); else img.setAttribute('alt', o);
            img.removeAttribute('data-a11y-alt-orig'); delete img.dataset.a11yAlt;
        });
        syncLightboxField();
    }
    let resolveTimer = 0, resolving = false, again = false;
    const scheduleResolve = () => { clearTimeout(resolveTimer); resolveTimer = setTimeout(resolveMedia, 120); };
    async function resolveMedia() {
        if (resolving) { again = true; return; }
        resolving = true;
        try {
            // 1. les numéros des fichiers inconnus : les médias du plus récent au plus ancien, 100 à la fois, jusqu'à les avoir tous
            const unknown = () => [...wantFiles].filter(f => !byFile.has(f));
            if (unknown().length && catalog.done) catalog = {offset: 0, done: false, again: true}; // un média ajouté depuis : on relit le début
            for (let guard = 0; unknown().length && !catalog.done && guard < 80; guard++) {
                const r = await pick({kind: 'media', limit: 100, offset: catalog.offset});
                const list = itemsOf(r); list.forEach(it => remember(it));
                catalog.offset += 100;
                if (!r?.more || !list.length || catalog.again) catalog.done = true;
            }
            catalog.done = true;
            wantFiles.forEach(f => { if (!byFile.has(f)) missing.add(f); }); wantFiles.clear();
            scanAlt(document); // repère les médias affichés dont il manque la description ou les noms
            // 2. description de chaque média affiché (100 à la fois)
            const shown = [...wantIds], ids = shown.filter(id => !byId.get(id)?.full); wantIds.clear();
            for (let i = 0; i < ids.length; i += 100) itemsOf(await pick({kind: 'media', ids: ids.slice(i, i + 100).join(','), with_text: 1})).forEach(it => remember(it, true));
            ids.forEach(id => { const m = byId.get(id); if (m) m.full = true; });
            // 3. les noms des personnes rattachées (100 à la fois)
            const pids = [...new Set(shown.flatMap(id => byId.get(id)?.people || []))].filter(i => !names.has(i));
            for (let i = 0; i < pids.length; i += 100) {
                const got = itemsOf(await pick({kind: 'person', ids: pids.slice(i, i + 100).join(','), animals: 1}));
                got.forEach(it => names.set(Number(it.id), String(it.title || '').trim()));
            }
            pids.forEach(i => { if (!names.has(i)) names.set(i, ''); });
            wantIds.clear(); scanAlt(document); syncLightboxField();
        } catch (e) { console.warn('[accessibilité] description des images :', e); }
        finally { resolving = false; if (again) { again = false; scheduleResolve(); } }
    }
    /* la fenêtre d'un média : un champ « Description de l'image (lue à voix haute) » sous la note */
    let lbTimer = 0;
    function syncLightboxField() {
        const desc = document.getElementById('lightbox-description'); let box = document.getElementById('a11y-lb-alt');
        const st = A().state, item = st?.lightboxMedia?.[st.lightboxIndex];
        const isImg = item && (/^(image|document)$/i.test(String(item.media_type || '')) && /\.(jpe?g|png|gif|webp|tiff?|bmp|heic|avif)$/i.test(item.filename || ''));
        if (!P.alt || !desc || !isImg || !item.id || !document.getElementById('lightbox')?.open) { box?.remove(); return; }
        if (!box) {
            box = document.createElement('div'); box.id = 'a11y-lb-alt'; box.className = 'a11y-lb-alt';
            box.innerHTML = `<label for="a11y-lb-alt-text">Description de l’image <small>(lue à voix haute)</small></label>
                <textarea id="a11y-lb-alt-text" rows="2" maxlength="600"></textarea>
                <small class="a11y-lb-hint">Pour qui ne voit pas l’écran : son lecteur d’écran lira ce texte. Dis ce qu’on voit, en une ou deux phrases. Gardé tout de suite, sans « Enregistrer ».</small>`;
            const ta = box.querySelector('textarea');
            ta.addEventListener('input', () => { clearTimeout(lbTimer); const id = box.dataset.id; lbTimer = setTimeout(() => writeAlt(id, ta.value), 350); });
            ta.addEventListener('blur', () => { clearTimeout(lbTimer); writeAlt(box.dataset.id, ta.value); });
            desc.after(box);
        }
        const ta = box.querySelector('textarea');
        ta.disabled = desc.disabled || desc.readOnly;
        if (box.dataset.id !== String(item.id)) {
            box.dataset.id = String(item.id); ta.value = readAlts()[item.id] || '';
            if (!byId.has(Number(item.id))) remember({id: Number(item.id), title: item.title, filename: item.filename, thumbnail: item.thumbnail, media_type: item.media_type, date_text: item.date_text}, false);
        }
        const auto = (() => { const own = readAlts()[item.id]; if (!own) return altFor(item.id); const keep = altCache; altCache = {...keep}; delete altCache[item.id]; const a = altFor(item.id); altCache = keep; return a; })();
        ta.placeholder = auto ? `Sinon, on lira : « ${auto} »` : 'Ce qu’on voit : « Joseph et Louise devant la ferme, en habits de fête »';
    }
    /* un seul observateur pour les images et les vidéos ajoutées ou changées */
    let mediaQueue = new Set(), mediaTimer = 0;
    function flushMedia() {
        mediaTimer = 0; const list = [...mediaQueue]; mediaQueue.clear();
        list.forEach(n => {
            if (!n.isConnected) return;
            if (P.alt) scanAlt(n);
            if (P.subs) { if (n.tagName === 'VIDEO') hookVideo(n); else n.querySelectorAll?.('video').forEach(hookVideo); }
            if (n.id === 'lightbox-image') syncLightboxField();
        });
    }
    function watchMedia() {
        new MutationObserver(muts => {
            if (!P.alt && !P.subs) return;
            muts.forEach(m => { if (m.type === 'attributes') mediaQueue.add(m.target); else m.addedNodes.forEach(n => { if (n.nodeType === 1 && (n.tagName === 'IMG' || n.tagName === 'VIDEO' || n.firstElementChild)) mediaQueue.add(n); }); });
            if (mediaQueue.size && !mediaTimer) mediaTimer = setTimeout(flushMedia, 80);
        }).observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['src']});
        document.addEventListener('keydown', e => { if (P.alt && /^Arrow(Left|Right)$/.test(e.key) && document.getElementById('lightbox')?.open) setTimeout(syncLightboxField, 60); });
    }

    /* ═════ Mode « une chose à la fois » ═════ */
    /* Presque tout est en CSS (html.a11y-simple dans access.css) ; ici : l'écran ouvert (html[data-a11y-module]) et le bandeau
       « 🧩 Une chose à la fois — Tout afficher », toujours là pour tout réafficher (le « 🧓 Mode simple » est autre chose : app-mode-simple.js). */
    function trackModule() {
        const a = document.querySelector('.main-nav .nav-item.is-active'), m = a?.dataset.module || '';
        if (root.dataset.a11yModule !== m) root.dataset.a11yModule = m;
    }
    function watchNav() { const nav = document.querySelector('.main-nav'); if (nav) new MutationObserver(trackModule).observe(nav, {subtree: true, childList: true, attributes: true, attributeFilter: ['class']}); trackModule(); }
    let simpleBar = null;
    function updateSimpleBar() {
        if (!P.simple) { simpleBar?.remove(); return; }
        if (!simpleBar) {
            simpleBar = document.createElement('div'); simpleBar.className = 'a11y-simplebar'; simpleBar.setAttribute('role', 'region'); simpleBar.setAttribute('aria-label', 'Une chose à la fois');
            simpleBar.innerHTML = '<span class="a11y-simplebar-txt"><span aria-hidden="true">🧩</span> Une chose à la fois</span><button type="button" data-a11y-simple-off title="Remettre tous les boutons et tous les outils à l’écran">Tout afficher</button>';
            simpleBar.addEventListener('click', e => { if (e.target.closest('[data-a11y-simple-off]')) simpleOff(); });
        }
        if (simpleBar.parentNode !== document.body) document.body.appendChild(simpleBar);
    }
    function simpleOff() {
        P.simple = false; save(); apply(); refreshPage();
        toast('Tout est réaffiché. Pour revenir à « une chose à la fois » : Maintenance → Accessibilité.');
    }

    /* ═════ Dictée vocale ═════ */
    /* Un petit 🎤 dans le champ texte où l'on écrit ; clic (ou Ctrl + Maj + Espace) = dicter en français ; le texte va au curseur,
       la ponctuation dite (« virgule », « point », « à la ligne »…) devient des signes. Web Speech API (Chrome, Edge, Safari) ;
       pas dans l'app de bureau (Electron n'a pas le service de reconnaissance) ni dans Firefox : le réglage l'explique. */
    const SRec = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;
    const IS_DESKTOP = (() => { try { return !!(window.lcnda && typeof window.lcnda.chooseImportFile === 'function') || /\bElectron\//.test(navigator.userAgent); } catch (_) { return false; } })();
    const IS_MAC = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
    function dictationWhy() { return IS_DESKTOP ? 'desktop' : !SRec() ? 'none' : ''; }
    const DICT_KEY_LABEL = IS_MAC ? '⌃ ⇧ Espace' : 'Ctrl + Maj + Espace';
    const NOT_HERE = 'Ta machine ne propose pas la dictée ici. Sur Mac, utilise la dictée du système : touche 🎤 ou deux fois Fn. Sur Windows : touche Windows + H.';
    const WB = '(?<![\\p{L}\\p{N}])', WE = '(?![\\p{L}\\p{N}])'; // début et fin de mot (lettres accentuées comprises)
    const W = (src, out) => [new RegExp(WB + src + WE, 'giu'), out];
    const SAY = [
        W('nouveau paragraphe', '\n\n'), W('(?:retour )?à la ligne', '\n'), W('nouvelle ligne', '\n'),
        W('points? de suspension', '…'), W("point d['’ ]?interrogation", '?'), W("point d['’ ]?exclamation", '!'),
        W('point[- ]virgule', ';'), W('deux[- ]points', ':'),
        W('(?:ouvre[rz]?|ouvrez) les guillemets', '«'), W('(?:ferme[rz]?|fermez) les guillemets', '»'),
        W('(?:ouvre[rz]?|ouvrez) la parenthèse', '('), W('(?:ferme[rz]?|fermez) la parenthèse', ')'),
        W('virgule', ','), [new RegExp(WB + "point" + WE + "(?!\\s+(?:de|du|des|d['’]|sur|final)" + WE + ")", 'giu'), '.'],
    ];
    /** La ponctuation dite → les signes, avec les espaces à la française. */
    function punctuate(raw, multiline = true) {
        let t = ` ${String(raw || '')} `;
        SAY.forEach(([re, out]) => { t = t.replace(re, ` ${out} `); });
        t = t.replace(/[ \t]+/g, ' ')
            .replace(/ ?\n ?/g, '\n')
            .replace(/ +([,.…)])/g, '$1')
            .replace(/([(«]) +/g, '$1')
            .replace(/« */g, '« ').replace(/ *»/g, ' »')
            .replace(/ *([;:?!])/g, ' $1')
            .replace(/([,.;:?!…)»])(?=[\p{L}\p{N}«(])/gu, '$1 ')
            .replace(/([.?!…]\s+|\n)(\p{Ll})/gu, (m, a, b) => a + b.toUpperCase());
        if (!multiline) t = t.replace(/\s*\n+\s*/g, ' ');
        return t.replace(/^ +| +$/g, '').replace(/^\n+/, multiline ? '\n' : '');
    }
    /** Met le texte dicté au curseur du champ (majuscule en début de phrase, espaces autour). */
    function insertDictated(el, raw) {
        const multi = el.tagName === 'TEXTAREA';
        let text = punctuate(raw, multi); if (!text.trim() && !/\n/.test(text)) return '';
        const v = el.value ?? '', s = el.selectionStart ?? v.length, e = el.selectionEnd ?? s, before = v.slice(0, s), after = v.slice(e);
        if (/(^|[.!?…]\s*|\n\s*)$/.test(before)) text = text.replace(/^(\s*«?\s*)(\p{Ll})/u, (m, a, b) => a + b.toUpperCase());
        if (before && !/[\s(«'’-]$/.test(before) && !/^[\s,.…)\n]/.test(text)) text = ` ${text}`;
        if (after && /^[\p{L}\p{N}«(]/u.test(after) && !/\s$/.test(text)) text += ' ';
        el.focus();
        let ok = false;
        try { el.setSelectionRange?.(s, e); ok = document.execCommand('insertText', false, text); } catch (_) { ok = false; }
        if (!ok || (el.value ?? '') === v) { el.setRangeText(text, s, e, 'end'); el.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: text})); }
        return text;
    }
    const OK_TYPES = /^(text|)$/i;
    function dictTarget(el) {
        if (!el || !(el instanceof HTMLElement) || el.disabled || el.readOnly) return null;
        if (el.tagName === 'TEXTAREA') { if (el.closest('.a11y-skip, [data-no-dictation]')) return null; return el.getBoundingClientRect().width >= 120 ? el : null; }
        if (el.tagName !== 'INPUT' || !OK_TYPES.test(el.getAttribute('type') || '')) return null;
        if (/^(numeric|decimal|tel|email|url|search)$/i.test(el.inputMode || '') || el.hasAttribute('data-ui-date') || el.classList.contains('ui-num-input')) return null;
        if (el.closest('.a11y-skip, [data-no-dictation], .pk-field, .pk-input, [class*="picker"], .search-box, [role="combobox"], .ui-search, .a11y-range') || el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete')) return null;
        return el.getBoundingClientRect().width >= 120 ? el : null;
    }
    let mic = null, micFor = null, rec = null, recFor = null, recWanted = false, bubble = null;
    function micButton() {
        if (mic) return mic;
        mic = document.createElement('button'); mic.type = 'button'; mic.className = 'a11y-mic'; mic.textContent = '🎤';
        mic.setAttribute('aria-label', `Dicter dans ce champ (${DICT_KEY_LABEL})`); mic.title = `Dicter : parle, le texte s’écrit au curseur (${DICT_KEY_LABEL}, Échap pour arrêter)`;
        mic.addEventListener('mousedown', e => e.preventDefault()); // le champ garde le curseur
        mic.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); if (rec) dictStop(); else if (micFor) dictStart(micFor); });
        return mic;
    }
    function placeMic() {
        if (!mic || !micFor || !micFor.isConnected) return;
        const r = micFor.getBoundingClientRect(); if (!r.width) { hideMic(); return; }
        const tall = r.height > 50, size = 30;
        placeFixed(mic, hostFor(micFor), r.right - size - 4, tall ? r.top + 4 : r.top + (r.height - size) / 2);
        if (bubble?.isConnected) placeFixed(bubble, hostFor(micFor), Math.max(8, r.right - 300), r.bottom + 6);
    }
    function showMic(el) { micFor = el; micButton(); mic.classList.toggle('is-on', !!rec && recFor === el); placeMic(); }
    function hideMic() { if (rec && micFor === recFor) return; mic?.remove(); micFor = null; }
    document.addEventListener('focusin', e => { if (!P.dictate || dictationWhy()) return; const t = dictTarget(e.target); if (t) showMic(t); else if (e.target !== mic) hideMic(); });
    document.addEventListener('focusout', () => setTimeout(() => { const a = document.activeElement; if (a !== micFor && a !== mic && !(rec && recFor === micFor)) hideMic(); }, 120));
    addEventListener('scroll', () => { if (mic?.isConnected) placeMic(); }, true);
    addEventListener('resize', () => { if (mic?.isConnected) placeMic(); });
    function setBubble(text) {
        if (!micFor) return;
        if (!bubble) { bubble = document.createElement('div'); bubble.className = 'a11y-dict-bubble'; bubble.setAttribute('role', 'status'); bubble.setAttribute('aria-live', 'polite'); }
        bubble.innerHTML = `<b><span class="a11y-dict-dot" aria-hidden="true"></span>Je t’écoute…</b>${text ? `<span>« ${esc(text)} »</span>` : '<span>Parle, puis clique sur 🎤 ou appuie sur Échap pour arrêter. Dis « virgule », « point », « à la ligne » pour la ponctuation.</span>'}`;
        if (!bubble.isConnected) hostFor(micFor).appendChild(bubble);
        placeMic();
    }
    function dictStart(el) {
        const why = dictationWhy(); if (why) { toast(NOT_HERE, 'error'); return; }
        dictStop(true);
        const Ctor = SRec(); let r;
        try { r = new Ctor(); } catch (_) { toast(NOT_HERE, 'error'); return; }
        r.lang = 'fr-FR'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
        rec = r; recFor = el; recWanted = true; showMic(el); mic.classList.add('is-on'); mic.setAttribute('aria-pressed', 'true'); setBubble('');
        r.onresult = ev => {
            if (rec !== r) return;
            let interim = '';
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
                const res = ev.results[i], txt = res[0]?.transcript || '';
                if (res.isFinal) { if (recFor?.isConnected) insertDictated(recFor, txt); } else interim += txt;
            }
            setBubble(interim.trim());
        };
        r.onerror = ev => {
            if (rec !== r) return;
            const msg = {'not-allowed': 'Le micro est refusé : autorise-le pour ce site (le cadenas à gauche de l’adresse), puis réessaie.', 'service-not-allowed': NOT_HERE, 'audio-capture': 'Aucun micro trouvé : branche-en un ou vérifie les réglages du son.', network: 'La dictée de ce navigateur a besoin d’Internet. Sur Mac, la dictée du système marche hors ligne : touche 🎤 ou deux fois Fn.', 'language-not-supported': NOT_HERE}[ev.error];
            if (msg) toast(msg, 'error');
            if (ev.error !== 'no-speech' && ev.error !== 'aborted') recWanted = false;
        };
        r.onend = () => { if (rec !== r) return; if (recWanted && recFor?.isConnected && document.activeElement === recFor) { try { r.start(); return; } catch (_) {} } dictStop(true); };
        try { r.start(); } catch (_) { dictStop(true); toast(NOT_HERE, 'error'); }
    }
    function dictStop(silent = false) {
        const r = rec; rec = null; recWanted = false;
        if (r) { try { r.onend = null; r.stop(); } catch (_) {} }
        bubble?.remove();
        if (mic) { mic.classList.remove('is-on'); mic.removeAttribute('aria-pressed'); }
        const f = recFor; recFor = null;
        if (!silent && f?.isConnected) f.focus();
        if (document.activeElement !== micFor) hideMic();
    }
    document.addEventListener('keydown', e => {
        if (rec && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dictStop(); return; }
        if (!P.dictate || dictationWhy() || !(e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && (e.code === 'Space' || e.key === ' '))) return;
        const t = dictTarget(document.activeElement); if (!t) return;
        e.preventDefault(); e.stopPropagation();
        if (rec) dictStop(); else { showMic(t); dictStart(t); }
    }, true);

    /* ═════ La page Maintenance → Accessibilité ═════ */
    let pageToken = 0;
    const isOn = k => !!P[k];
    /* C8 : interrupteur ; avec une aide, la bulle « ? » se met juste à côté (hors du libellé, pour ne pas basculer en cliquant dessus) */
    const toggle = (k, label, sub = '', {help: h = '', faq = '', disabled = false} = {}) => {
        const t = `<label class="ui-toggle a11y-toggle ${disabled ? 'is-disabled' : ''}"><input type="checkbox" data-a11y-bool="${k}" ${isOn(k) && !disabled ? 'checked' : ''} ${disabled ? 'disabled' : ''}><i></i><span>${label}${sub ? `<small>${sub}</small>` : ''}</span></label>`;
        return h ? `<div class="a11y-trow">${t}${help(h, faq)}</div>` : t;
    };
    const help = (text, faq = '') => `<span class="a11y-help-slot" data-a11y-help="${esc(text)}" ${faq ? `data-a11y-faq="${esc(faq)}"` : ''}></span>`;
    /* C3 : libellé · curseur · case chiffrée avec unité (double-clic = valeur de départ) */
    const range = (k, label, {min, max, step, unit = '', factor = 1, dec = 0, def, autoText = ''}) => {
        const v = P[k], shown = v == null ? def : v;
        return `<div class="a11y-range" data-a11y-range="${k}" data-factor="${factor}" data-dec="${dec}" data-def="${def}" data-auto="${esc(autoText)}"><span class="a11y-range-lab">${label}</span>
            <input type="range" min="${min}" max="${max}" step="${step}" value="${shown}" data-ui-done="1" aria-label="${esc(label.replace(/<[^>]+>/g, ""))}" title="Double-clic : revenir à la valeur de départ">
            <span class="ui-num"><input type="text" class="ui-num-input" inputmode="decimal" autocomplete="off" spellcheck="false" aria-label="${esc(label.replace(/<[^>]+>/g, ""))} (valeur)"><span class="ui-num-unit">${esc(unit)}</span></span></div>`;
    };
    const dots = ['#d0182f', '#1aa34a', '#0066cc', '#e1a500', '#d9488f'];
    const cbCard = k => `<label class="a11y-cb ${P.cb === k ? 'is-on' : ''}"><input type="radio" name="a11y-cb" value="${k}" ${P.cb === k ? 'checked' : ''}>
        <span class="a11y-cb-dots" ${CB[k].m ? `style="filter:url(#a11y-sim-${k})"` : ''} aria-hidden="true">${dots.map(c => `<i style="background:${c}"></i>`).join('')}</span>
        <b>${esc(CB[k].label)}</b><small>${esc(CB[k].hint)}</small></label>`;
    const FONT_NOTE = {
        app: 'Arial, comme d’habitude.',
        legible: 'Atkinson Hyperlegible : faite pour les personnes qui voient mal (lettres qu’on ne confond pas : I l 1, O 0). Toujours disponible.',
        dys: 'Lettres alourdies en bas, pour qu’elles ne se retournent pas. Toujours disponible.',
    };
    const fontCard = k => {
        const f = FONTS[k], st = f.stack ? `font-family:${esc(f.stack)}` : '';
        let note = FONT_NOTE[k] || '', warn = false;
        if (k === 'comic') {
            if (comicInstalled()) note = 'Comic Sans MS, la police de ton ordinateur : ronde et simple, souvent conseillée pour la dyslexie.';
            else { warn = true; note = 'Comic Sans n’est pas sur cet ordinateur (fréquent sous Linux) : l’app prend OpenDyslexic à la place. Choisis plutôt « OpenDyslexic ».'; }
        }
        return `<label class="a11y-font-card ${P.font === k ? 'is-on' : ''} ${warn ? 'is-missing' : ''}"><input type="radio" name="a11y-font" value="${k}" ${P.font === k ? 'checked' : ''}><b style="${st}">${esc(f.label)}</b><span class="a11y-font-sample" style="${st}">Jean-Baptiste MARTIN, né en 1784 à Saint-Céré</span><small class="${warn ? 'is-warn' : ''}">${warn ? '⚠ ' : ''}${esc(note)}</small></label>`;
    };
    function pageHtml() {
        let pal = []; try { pal = A().getStatsColors?.() || []; } catch (_) {}
        if (!pal.length) pal = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f'];
        const voices = TTS ? frVoices() : [];
        const reduceOs = matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        return `<section class="page a11y-page"><header class="page-header"><div><span class="eyebrow">MAINTENANCE</span><h2>♿ Accessibilité</h2>
            <p>Pour voir, lire et utiliser l’app plus facilement (couleurs, texte, contraste, clavier, mouvement, voix, lecteur d’écran, sous-titres, dictée), et pour préparer le mode simple. Chaque réglage s’applique tout de suite et reste gardé avec ta généalogie.</p></div>
            <div class="page-actions"><button type="button" class="button secondary" data-a11y-reset>↺ Remettre comme au départ</button></div></header>

        <section class="maintenance-panel a11y-sec" id="a11y-colors"><h3>🎨 Couleurs et daltonisme ${help('Choisis la sorte de daltonisme : l’app corrige ses couleurs pour que tu les distingues mieux. Les petites pastilles montrent comment ces couleurs sont vues.')}</h3>
            <p class="muted">Environ 1 homme sur 12 voit mal certaines couleurs. Choisis ce qui te ressemble : l’app décale ses couleurs pour que les différences se voient (c’est une correction, réglable).</p>
            <div class="a11y-cbs" role="radiogroup" aria-label="Sorte de daltonisme">${['none', 'protan', 'deutan', 'tritan', 'achroma'].map(cbCard).join('')}</div>
            <details class="a11y-light" ${CB[P.cb].light ? 'open' : ''}><summary>Couleurs seulement affaiblies (léger)</summary><div class="a11y-cbs">${['protanomaly', 'deuteranomaly', 'tritanomaly'].map(cbCard).join('')}</div></details>
            ${range('fix', 'Force de la correction', {min: 0, max: 100, step: 5, unit: '%', def: 80})}
            <div class="a11y-toggles">${toggle('safe', 'Couleurs faciles à distinguer', 'Erreur / réussi, homme / femme et graphiques prennent des couleurs que tout le monde distingue (palette Okabe-Ito).')}
            <p class="muted a11y-small">Les couleurs que tu as choisies toi-même (dessins, plans et maison 3D, tableaux, mises en page, photos) ne sont pas remplacées : c’est la correction (le curseur au-dessus) qui les rend plus faciles à distinguer, partout, y compris dans les outils de modification en plein écran.</p>
            ${toggle('shapes', 'Ajouter des formes en plus des couleurs', 'Symboles ✓ ⚠ ⛔ dans les messages, hachures sur les pastilles des légendes et les barres des graphiques, ronds et carrés pour femmes et hommes.')}</div>
            <div class="a11y-demo" aria-label="Aperçu"><span class="a11y-demo-title">Aperçu</span>
                <div class="a11y-demo-msgs"><span class="a11y-demo-msg is-bad">Date impossible</span><span class="a11y-demo-msg is-good">Enregistré</span><span class="a11y-demo-msg is-warn">À vérifier</span></div>
                <div class="a11y-demo-people"><span class="pk-av m">JM</span> Jean MARTIN <span class="pk-av f">LB</span> Louise BORIE</div>
                <div class="a11y-demo-chart stats-chart compact">${['Martin', 'Borie', 'Dupuy', 'Lacombe'].map((n, i) => `<div class="stats-chart-row"><span class="stats-chart-label">${n}</span><span class="stats-chart-track"><span class="stats-chart-bar" style="width:${[92, 70, 48, 30][i]}%;background:${esc(pal[i % pal.length])}"></span></span><strong class="stats-chart-value">${[23, 17, 12, 7][i]}</strong></div>`).join('')}</div>
                <div class="a11y-demo-legend">${pal.slice(0, 4).map((c, i) => `<span><i style="background:${esc(c)}"></i>${['Naissances', 'Mariages', 'Décès', 'Autres'][i]}</span>`).join('')}</div></div>
            <div class="a11y-simbox"><h4>👁 Voir comme… <small>pour vérifier un faire-part, un livre ou un graphique</small></h4>
                <p class="muted">Montre tout l’écran comme le voit une personne daltonienne (une simulation, pas une correction). Va ensuite sur l’écran à vérifier : un bandeau en haut rappelle que c’est une simulation, avec « Arrêter ».</p>
                <div class="a11y-simbtns">${Object.keys(CB).filter(k => CB[k].m).map(k => `<button type="button" class="button small ${sim === k ? '' : 'secondary'}" data-a11y-sim="${k}">${esc(CB[k].label)}</button>`).join('')}${sim ? '<button type="button" class="button small secondary" data-a11y-sim="">Arrêter</button>' : ''}</div></div>
        </section>

        <section class="maintenance-panel a11y-sec" id="a11y-text"><h3>🔤 Texte ${help('La taille agrandit l’écran principal, la colonne de gauche et les fenêtres. Les outils en plein écran (dessin, mise en page, montage) gardent leur taille.')}</h3>
            <p class="muted">Plus gros, plus aéré, une police plus facile à lire. Recommandé pour la dyslexie : interligne 1,5, lettres + 12 %, mots + 16 %.</p>
            ${range('size', 'Taille du texte', {min: 90, max: 160, step: 5, unit: '%', def: 100})}
            ${range('lh', 'Interligne <small>(auto = comme l’app)</small>', {min: 1, max: 2, step: 0.1, dec: 1, def: 1.5, autoText: 'auto'})}
            ${range('ls', 'Espace entre les lettres', {min: 0, max: 0.2, step: 0.01, unit: '%', factor: 100, def: 0})}
            ${range('ws', 'Espace entre les mots', {min: 0, max: 0.5, step: 0.02, unit: '%', factor: 100, def: 0})}
            <p><button type="button" class="link-button" data-a11y-dys>Mettre les espacements conseillés pour la dyslexie</button></p>
            <h4>Police</h4><div class="a11y-fonts" role="radiogroup" aria-label="Police">${['app', 'legible'].map(fontCard).join('')}
                <div class="a11y-font-group" role="group" aria-labelledby="a11y-font-dys"><span class="a11y-font-group-t" id="a11y-font-dys">Pour la dyslexie : choisis celle qui te va</span><div class="a11y-font-pair">${['dys', 'comic'].map(fontCard).join('')}</div></div></div>
            <p class="muted a11y-small">« Atkinson Hyperlegible » et « OpenDyslexic » sont rangées dans l’app (polices libres, licence SIL OFL) : rien à installer, et elles marchent sans internet.</p>
            <div class="a11y-toggles">${toggle('underline', 'Liens toujours soulignés', 'Pour reconnaître un lien sans compter sur sa couleur.')}</div>
        </section>

        <section class="maintenance-panel a11y-sec" id="a11y-contrast"><h3>🌓 Contraste</h3>
            <p class="muted">Textes gris passés en noir (ou en blanc en mode sombre), bordures plus marquées, fonds unis sans quadrillage. Marche en clair et en sombre.</p>
            <div class="a11y-toggles">${toggle('contrast', 'Contraste élevé')}</div>
        </section>

        <section class="maintenance-panel a11y-sec" id="a11y-simple"><h3>🧩 Une chose à la fois</h3>
            <p class="muted">Une interface plus calme : moins de boutons, de chiffres et de décorations, les actions principales plus grandes, et un seul panneau à la fois (le tableau de bord sans sa colonne de réglages, les fiches sur une seule colonne, pas d’écran divisé). Rien n’est supprimé : le petit bandeau « 🧩 Une chose à la fois — Tout afficher », en bas à droite, remet tout d’un clic.</p>
            <div class="a11y-toggles">${toggle('simple', 'Mode « une chose à la fois »', 'Cache les outils avancés ou rarement utilisés : ADN, comparaison, animaux, écran divisé, nouvelle fenêtre, réglages du tableau de bord, supprimer / verrouiller une fiche, historique, filtres avancés de la carte…', {help: 'Moins de choses à l’écran pour se concentrer sur l’essentiel. Les outils cachés reviennent avec « Tout afficher », en bas à droite de l’écran.', faq: 'Comment simplifier l’écran (mode « une chose à la fois ») ?'})}</div>
        </section>

        <section class="maintenance-panel a11y-sec" id="a11y-input"><h3>🖱 Clavier et souris</h3>
            <p class="muted">Avec la touche Tab, un cadre épais bleu et jaune montre où tu es. Les boutons et les cases peuvent être plus grands (au moins 40 px), et la flèche de la souris plus grosse.</p>
            <div class="a11y-toggles">${toggle('focus', 'Contour bien visible autour de l’élément choisi au clavier')}
            ${toggle('big', 'Grandes cibles', 'Boutons, menus, champs et cases à cocher plus grands, plus faciles à toucher ou à cliquer.')}
            ${toggle('cursor', 'Grosse flèche de souris')}</div>
        </section>

        <section class="maintenance-panel a11y-sec" id="a11y-motion"><h3>🎞 Mouvement</h3>
            <p class="muted">Moins de choses qui bougent : pas d’animations, pas de glissements, pas de défilement animé.${reduceOs ? ' <b>Ton ordinateur demande déjà moins d’animations : c’est respecté.</b>' : ''}</p>
            <div class="a11y-toggles">${toggle('calm', 'Réduire les animations et le défilement animé')}</div>
            <div class="a11y-row"><span class="a11y-range-lab">Les messages restent affichés</span><div class="segmented a11y-seg" role="radiogroup" aria-label="Durée des messages">${[[1, 'normal (6 s)'], [2, '2 fois plus (12 s)'], [3, '3 fois plus (18 s)']].map(([v, l]) => `<button type="button" class="${P.toastX === v ? 'is-active' : ''}" data-a11y-toastx="${v}" aria-pressed="${P.toastX === v}">${l}</button>`).join('')}</div>
                <button type="button" class="button small secondary" data-a11y-trytoast>Essayer</button></div>
        </section>

        <section class="maintenance-panel a11y-sec" id="a11y-voice"><h3>🔊 Lecture à voix haute</h3>
            ${TTS ? '' : '<p class="a11y-note is-warn">⚠ Ce navigateur ne sait pas lire à voix haute.</p>'}
            <p class="muted">Sélectionne un texte avec la souris : un bouton 🔊 apparaît à côté, clique dessus pour l’entendre. Sur une fiche, le bouton « 🔊 Lire la fiche » (en bas à gauche) lit le nom puis les blocs affichés. <b>Échap</b> arrête la lecture.</p>
            <div class="a11y-toggles">${toggle('tts', 'Lire à voix haute le texte que je sélectionne')}</div>
            ${range('rate', 'Vitesse de la voix', {min: 0.5, max: 2, step: 0.05, unit: '%', factor: 100, def: 1})}
            <div class="a11y-row"><label class="a11y-range-lab" for="a11y-voice-sel">Voix</label><select id="a11y-voice-sel" data-a11y-voice ${voices.length ? '' : 'disabled'}><option value="">${voices.length ? 'Voix française de l’ordinateur' : 'Aucune voix française trouvée'}</option>${voices.map(v => `<option value="${esc(v.voiceURI)}" ${P.voice === v.voiceURI ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>
                <button type="button" class="button small secondary" data-a11y-try ${TTS ? '' : 'disabled'}>🔊 Essayer</button><button type="button" class="button small secondary" data-a11y-stop ${TTS ? '' : 'disabled'}>⏹ Arrêter</button></div>
        </section>

        <section class="maintenance-panel a11y-sec" id="a11y-reader"><h3>🦮 Lecteur d’écran</h3>
            <p class="muted">Pour les personnes qui ne voient pas l’écran et l’écoutent avec un lecteur d’écran (VoiceOver sur Mac, NVDA ou JAWS sur Windows).</p>
            <div class="a11y-toggles">${toggle('alt', 'Décrire les images', 'Chaque photo ou document de tes médias est décrit à voix haute : la « Description de l’image » écrite dans la fenêtre du média, sinon son titre, sa date, son lieu et les personnes rattachées. Les petites images à côté d’un nom et les décorations sont passées sous silence.', {help: 'Le lecteur d’écran lit un texte à la place de chaque image. Pour l’écrire toi-même : ouvre un média, champ « Description de l’image (lue à voix haute) ».', faq: 'Comment faire lire la description des images par un lecteur d’écran ?'})}</div>
        </section>

        <section class="maintenance-panel a11y-sec" id="a11y-video"><h3>🎬 Vidéos et montages</h3>
            <div class="a11y-toggles">${toggle('subs', 'Sous-titres toujours affichés', 'Les vidéos qui ont des sous-titres les montrent d’office (en français s’il y en a). Dans le montage, la piste « Sous-titres » se voit à la lecture même si tu l’as cachée (l’œil) ; la vidéo exportée, elle, ne change pas.', {help: 'Pour lire ce qui est dit sans devoir allumer les sous-titres à chaque fois.', faq: 'Comment afficher toujours les sous-titres des vidéos et des montages ?'})}</div>
        </section>

        <section class="maintenance-panel a11y-sec" id="a11y-dictation"><h3>🎤 Dictée vocale</h3>
            ${dictationWhy() ? `<p class="a11y-note is-warn" role="note">⚠ ${esc(NOT_HERE)}</p>` : ''}
            <p class="muted">Parle au lieu de taper : un petit 🎤 apparaît dans le champ texte où tu écris. Clique dessus (ou <kbd>${esc(DICT_KEY_LABEL)}</kbd>), parle, et le texte s’écrit au curseur. Dis « virgule », « point », « point d’interrogation », « deux points », « à la ligne » ou « nouveau paragraphe » pour la ponctuation. <b>Échap</b> ou un nouveau clic sur 🎤 arrête.</p>
            <div class="a11y-toggles">${toggle('dictate', 'Dictée vocale dans les champs texte', dictationWhy() ? 'Pas disponible ici (voir au-dessus).' : 'En français. Pas dans les cases de recherche, les dates, les nombres ni les mots de passe.', {help: 'Le navigateur écoute le micro seulement quand tu cliques sur 🎤. La première fois, il demande la permission d’utiliser le micro.', faq: 'Comment remplir un champ en parlant (dictée vocale) ?', disabled: !!dictationWhy()})}</div>
            <div class="a11y-dict-try" data-a11y-dict-try hidden><label class="a11y-range-lab" for="a11y-dict-try">Essaie ici</label><textarea id="a11y-dict-try" rows="3" placeholder="Clique ici, puis sur 🎤 : « Joseph est né à Tulle virgule en 1784 point »"></textarea></div>
        </section>

        <section class="maintenance-panel a11y-sec a11y-help-sec" id="a11y-aide"><h3>ℹ️ Aide</h3>
            <dl class="a11y-dl">
                <dt>Couleurs et daltonisme</dt><dd>La correction change un peu toutes les couleurs de l’écran pour que le rouge et le vert (ou le bleu et le jaune) ne se confondent plus. « Couleurs faciles à distinguer » remplace les couleurs qui ont un sens (erreur, réussi, homme, femme, graphiques). « Formes » ajoute un symbole pour ne jamais dépendre de la couleur seule.</dd>
                <dt>Voir comme…</dt><dd>Montre l’écran comme le voit une personne daltonienne, pour vérifier qu’un document reste lisible avant de l’envoyer ou de l’imprimer. Rien n’est modifié.</dd>
                <dt>Texte</dt><dd>Agrandit et aère le texte. Les outils en plein écran gardent leur taille pour que leurs réglages restent à leur place.</dd>
                <dt>Contraste</dt><dd>Plus de gris pâle : le texte est noir sur blanc (ou blanc sur noir en mode sombre).</dd>
                <dt>Clavier et souris</dt><dd>Pour travailler sans souris (Tab, Maj+Tab, Entrée) ou avec une souris difficile à viser.</dd>
                <dt>Mouvement</dt><dd>Pour les personnes que les animations gênent ou fatiguent, et pour avoir le temps de lire les messages.</dd>
                <dt>Lecture à voix haute</dt><dd>Utilise la voix de l’ordinateur ; rien n’est envoyé sur internet par l’app.</dd>
                <dt>Une chose à la fois</dt><dd>Cache ce qui sert rarement pour garder l’essentiel, en plus grand. « Tout afficher » (en bas à droite) remet tout.</dd>
                <dt>Lecteur d’écran</dt><dd>Donne un texte à chaque image de tes médias. Le mieux : écrire toi-même ce qu’on voit, dans la fenêtre du média.</dd>
                <dt>Sous-titres</dt><dd>Allume d’office les sous-titres des vidéos et la piste « Sous-titres » des montages, à la lecture.</dd>
                <dt>Dictée vocale</dt><dd>Utilise la reconnaissance de la voix du navigateur (Chrome et Edge passent par internet ; Safari peut le faire sur l’ordinateur). Dans l’app de bureau, utilise la dictée du système : sur Mac, touche 🎤 ou deux fois Fn ; sur Windows, touche Windows + H.</dd>
            </dl>
            <p class="muted a11y-small">Ces réglages sont gardés avec ta généalogie (comme l’apparence) : ils suivent sa sauvegarde et la retrouvent sur un autre ordinateur.</p>
        </section>

        </section>`;
    }
    /* cases chiffrées des curseurs */
    const fmt = (v, dec) => (Number.isFinite(v) ? v.toFixed(dec).replace('.', ',') : '');
    function bindRanges(page) {
        page.querySelectorAll('[data-a11y-range]').forEach(box => {
            const k = box.dataset.a11yRange, r = box.querySelector('input[type=range]'), num = box.querySelector('.ui-num-input');
            const f = Number(box.dataset.factor) || 1, dec = Number(box.dataset.dec) || 0, def = Number(box.dataset.def), auto = box.dataset.auto;
            const show = () => { if (document.activeElement === num) return; if (P[k] == null && auto) { num.value = ''; num.placeholder = auto; box.classList.add('is-auto'); } else { num.value = fmt(Number(r.value) * f, dec); box.classList.remove('is-auto'); } };
            const setV = v => { r.value = String(v); P[k] = Number(r.value); save(); apply(); show(); afterChange(k); };
            if (k === 'size') {
                /* Taille du texte : pendant le glissement, seul l'aperçu grossit (sinon toute la page, curseur compris, bouge sous la souris) ;
                   on applique au lâcher, en gardant le curseur à la même place à l'écran. */
                const prev = document.createElement('div'); prev.className = 'a11y-size-preview'; prev.setAttribute('aria-hidden', 'true');
                prev.innerHTML = '<span>Jean-Baptiste MARTIN, né le 7 mai 1784 à Tulle</span><small>Aperçu : la page prendra cette taille quand tu lâcheras le curseur.</small>';
                box.after(prev);
                const preview = () => { num.value = fmt(Number(r.value) * f, dec); prev.style.setProperty('--a11y-prev', String(Number(r.value) / 100)); prev.classList.add('is-on'); };
                const applyKeep = () => {
                    prev.classList.remove('is-on');
                    if (Number(r.value) === P.size) { show(); return; }
                    const top = box.getBoundingClientRect().top;
                    setV(r.value);
                    const fix = () => { for (let el = box.parentElement; el; el = el.parentElement) { const d = box.getBoundingClientRect().top - top; if (Math.abs(d) <= 1) return; if (el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.scrollTop += d / (parseFloat(getComputedStyle(el).zoom) || 1); } const d = box.getBoundingClientRect().top - top; if (Math.abs(d) > 1) document.scrollingElement.scrollTop += d; };
                    requestAnimationFrame(() => { fix(); requestAnimationFrame(fix); });
                };
                r.addEventListener('input', preview);
                r.addEventListener('change', applyKeep);
            } else r.addEventListener('input', () => setV(r.value));
            r.addEventListener('dblclick', () => { if (auto) { P[k] = null; r.value = String(def); save(); apply(); show(); afterChange(k); } else setV(def); });
            const commit = () => { const raw = num.value.trim(); if (!raw && auto) { P[k] = null; save(); apply(); show(); return; } const v = Number(raw.replace(',', '.').replace(/[^\d.+-]/g, '')) / f; if (!Number.isFinite(v)) { show(); return; } setV(Math.min(Number(r.max), Math.max(Number(r.min), v))); };
            num.addEventListener('change', commit);
            num.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); commit(); num.select(); } else if (e.key === 'Escape') { num.blur(); show(); } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const st = Number(r.step) * (e.shiftKey ? 10 : 1); setV(Math.min(Number(r.max), Math.max(Number(r.min), (P[k] ?? def) + (e.key === 'ArrowUp' ? st : -st)))); num.select(); } });
            num.addEventListener('focus', () => num.select()); num.addEventListener('blur', show);
            show();
        });
    }
    function afterChange(k) {
        const page = document.querySelector('.a11y-page'); if (!page) return;
        if (k === 'cb') {
            page.querySelectorAll('.a11y-cb').forEach(c => c.classList.toggle('is-on', c.querySelector('input').checked));
            const fx = page.querySelector('[data-a11y-range="fix"]'); fx?.classList.toggle('is-disabled', P.cb === 'none'); fx?.querySelectorAll('input').forEach(i => { i.disabled = P.cb === 'none'; });
        }
        if (k === 'font') page.querySelectorAll('.a11y-font-card').forEach(c => c.classList.toggle('is-on', c.querySelector('input').checked));
        if (k === 'tts') { const r = page.querySelector('[data-a11y-range="rate"]'); r?.classList.toggle('is-disabled', !P.tts); }
        if (k === 'dictate') { const t = page.querySelector('[data-a11y-dict-try]'); if (t) t.hidden = !(P.dictate && !dictationWhy()); }
    }
    function refreshPage() { const page = document.querySelector('.a11y-page'); if (page && ext.maintenance?.accessibilite) { const st = A().state; ext.maintenance.accessibilite(st ? st.workspaceToken : 0, true); } }
    function mountHelp(page) {
        page.querySelectorAll('[data-a11y-help]').forEach(slot => {
            const text = slot.dataset.a11yHelp, faq = slot.dataset.a11yFaq || FAQ_Q, UI = window.LCNDA_UI;
            if (UI?.helpTip) { slot.replaceWith(UI.helpTip(text, faq)); return; }
            const b = document.createElement('button'); b.type = 'button'; b.className = 'ui-help a11y-help'; b.textContent = '?'; b.title = 'Aide'; b.setAttribute('aria-label', `Aide : ${text}`); b.setAttribute('aria-expanded', 'false');
            const bub = document.createElement('span'); bub.className = 'a11y-bubble'; bub.hidden = true; bub.innerHTML = `${esc(text)} <a href="#" data-a11y-faq>En savoir plus (FAQ) →</a>`;
            b.addEventListener('click', e => { e.preventDefault(); bub.hidden = !bub.hidden; b.setAttribute('aria-expanded', String(!bub.hidden)); });
            bub.querySelector('[data-a11y-faq]').addEventListener('click', async e => { e.preventDefault(); const st = A().state; if (st && A().setModule) { st.maintenanceTab = 'faq'; await A().setModule('maintenance'); for (let i = 0; i < 30; i++) { const q = document.querySelector('[data-faq-q]'); if (q) { q.value = faq; q.dispatchEvent(new Event('input', {bubbles: true})); return; } await new Promise(r => setTimeout(r, 100)); } } });
            slot.replaceWith(b, bub);
        });
    }
    ext.maintenance = ext.maintenance || {};
    ext.maintenance.accessibilite = async (token, keepScroll = false) => {
        const st = A().state; if (st && token !== st.workspaceToken) return;
        const ws = document.getElementById('workspace'); if (!ws) return;
        const y = keepScroll ? ws.scrollTop : 0;
        ws.innerHTML = pageHtml(); ws.scrollTop = y;
        const page = ws.querySelector('.a11y-page'); pageToken++;
        // onglets de page « ♿ Toute l'app » / « 🧓 Mode simple » (le second est dessiné par app-mode-simple.js)
        const MS = ext.modeSimple;
        if (MS?.tabsHtml) {
            page.querySelector('.page-header')?.insertAdjacentHTML('afterend', MS.tabsHtml());
            if (MS.tabNow() === 'simple') { page.querySelectorAll(':scope > .a11y-sec').forEach(x => x.remove()); page.insertAdjacentHTML('beforeend', '<div class="ms-box" data-ms-box></div>'); }
        }
        bindRanges(page); mountHelp(page); afterChange('cb'); afterChange('tts'); afterChange('dictate');
        remapCharts(page);
        // K2 : tout est gardé tout de suite ; « ↶ Annuler » (message) relit les réglages et les remet en place
        window.LCNDA_UI?.autoSave?.(page, {redraw: () => { load(); apply(); refreshPage(); }});
        MS?.mountTab?.(page);
        page.addEventListener('change', e => {
            const t = e.target;
            if (t.matches('[data-a11y-bool]')) { P[t.dataset.a11yBool] = t.checked; save(); apply(); afterChange(t.dataset.a11yBool); if (t.dataset.a11yBool === 'simple' && t.checked) toast('Une chose à la fois : moins de boutons. Pour tout réafficher, clique sur « Tout afficher » en bas à droite.'); return; }
            if (t.name === 'a11y-cb') { P.cb = t.value; if (t.value !== 'none' && !P.safe) { P.safe = true; const s = page.querySelector('[data-a11y-bool="safe"]'); if (s) s.checked = true; } save(); apply(); afterChange('cb'); return; }
            if (t.name === 'a11y-font') { P.font = t.value; save(); apply(); afterChange('font'); return; }
            if (t.matches('[data-a11y-voice]')) { P.voice = t.value; save(); }
        });
        page.addEventListener('click', async e => {
            const b = e.target.closest('button, a'); if (!b) return;
            if (b.dataset.a11ySim != null) { simulate(b.dataset.a11ySim); return; }
            if (b.dataset.a11yToastx) { P.toastX = Number(b.dataset.a11yToastx); save(); apply(); page.querySelectorAll('[data-a11y-toastx]').forEach(x => { const on = x === b; x.classList.toggle('is-active', on); x.setAttribute('aria-pressed', String(on)); }); return; }
            if (b.hasAttribute('data-a11y-trytoast')) { toast(`Voici un message : il reste ${P.toastX === 1 ? '6' : P.toastX === 2 ? '12' : '18'} secondes environ.`); return; }
            if (b.hasAttribute('data-a11y-try')) { speak('Bonjour ! Voici la voix qui lira tes textes. Jean-Baptiste Martin, né le 7 mai 1784 à Figeac, dans le Lot.'); return; }
            if (b.hasAttribute('data-a11y-stop')) { stop(); return; }
            if (b.hasAttribute('data-a11y-dys')) { P.lh = 1.5; P.ls = 0.12; P.ws = 0.16; save(); apply(); refreshPage(); toast('Espacements conseillés appliqués.'); return; }
            if (b.hasAttribute('data-a11y-reset')) { if (ext.modeSimple?.tabNow?.() === 'simple') ext.modeSimple.reset(); else reset(); } // K2 : sans question, « ↶ Annuler » dans le message (onglet 🧓 : les réglages du mode simple)
        });
    };

    function reset() { P = DEFAULTS(); try { localStorage.removeItem(KEY); } catch (_) {} stop(); sim = ''; try { sessionStorage.removeItem(SIM_KEY); } catch (_) {} apply(); refreshPage(); }
    function set(k, v) { if (typeof k === 'object') Object.assign(P, k); else P[k] = v; save(); apply(); }

    ext.access = {get: () => ({...P}), set, reset, apply, simulate, speak, stop, personPageText, fixMatrix, OI, KEY,
        punctuate, insertDictated, dictationWhy, altFor, mediaAlts: readAlts, setMediaAlt: writeAlt, simpleOff};

    /* ═════ Démarrage : appliqué tout de suite, avant même l'app ═════ */
    load();
    const start = () => { ensureSvg(); apply(); watchToasts(); watchWorkspace(); watchCharts(); watchMedia(); watchNav(); if (TTS) try { speechSynthesis.addEventListener?.('voiceschanged', () => { if (document.querySelector('.a11y-page #a11y-voice-sel option:only-child')) refreshPage(); }); } catch (_) {} };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
    addEventListener('storage', e => { if (e.key === KEY) { load(); apply(); } if (e.key === ALT_KEY) { altCache = null; if (P.alt) scanAlt(document); } }); // un autre onglet a changé les réglages
})();
