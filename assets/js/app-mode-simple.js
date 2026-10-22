/* LCNDA — 🧓 Mode simple (mode grand-parent, validé : maquettes mode-grand-parent.html et accessibilite-mode-simple.html).
 *
 * Une façon très simple de montrer l'arbre à quelqu'un qui n'est pas à l'aise avec l'ordinateur : de très gros boutons,
 * l'arbre, les photos, les personnes et « Ce jour-là », des phrases lues à voix haute, et rien qu'on puisse modifier.
 *
 * - Données : GET api.php?action=mode_simple_data (lib/mode_simple.php), une lecture au moment d'ouvrir le mode.
 * - Lecture seule stricte : pendant le mode, aucune requête POST ne part (fetch, XMLHttpRequest et sendBeacon sont
 *   arrêtés ; les réglages d'affichage en attente partent après la sortie) ; body.is-kiosk comme le mode consultation 🔒
 *   (qui reste, lui, la protection côté serveur quand il est allumé). Pas de ⋯, pas de clic droit, pas de glisser,
 *   pas de petites croix, pas de fenêtre par-dessus : chaque chose est un écran entier.
 * - Réglages : localStorage « genealogie-mode-simple » (copié dans la base comme les autres « genealogie-* », et dans
 *   les défauts du site) ; « Propre à cet appareil » (réglage « Réglages de base » coupé) : « lcnda-mode-simple-local ».
 *   Sur l'appareil seulement : « lcnda-mode-simple-device » = {start, viewer} (ouvrir l'app en mode simple, qui regarde).
 *   Le code de sortie est gardé haché (SHA-256 + sel), jamais en clair.
 * - Lien de parenté en clair : même calcul et mêmes mots que lib/question_more.php (qm_kin_label_g : ancêtre commun le
 *   plus proche), puis les alliances (« ton beau-père », « le mari de ta petite-fille Émilie »).
 * - Réglages : Maintenance → Accessibilité → onglet « 🧓 Mode simple » (dessiné ici, appelé par app-access.js).
 * API : window.LCNDA_EXT.modeSimple = {open, close, isOpen, settings, renderSettings, kin, bio, data, debug…}.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const KEY = 'genealogie-mode-simple', PKEY = 'genealogie-mode-simple-presets', LOCAL = 'lcnda-mode-simple-local', DEV = 'lcnda-mode-simple-device';
    const FAQ_Q = 'Comment montrer l’arbre à une personne âgée (mode simple) ?';
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const clone = o => JSON.parse(JSON.stringify(o));
    const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const plural = (n, one, many) => (A().plural ? A().plural(n, one, many) : `${n} ${n > 1 ? (many || one + 's') : one}`);
    const lsGet = k => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch (_) { return null; } };
    const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const toast = (m, k, o) => A().toast?.(m, k, o);

    /* le jour : ?jour=AAAA-MM-JJ dans l'adresse (pour essayer « Ce jour-là » un autre jour) */
    const TODAY = (() => { let q = ''; try { q = new URLSearchParams(location.search).get('jour') || window.LCNDA_MODE_SIMPLE_TODAY || ''; } catch (_) {} const d = q ? new Date(q + 'T12:00:00') : new Date(); return isNaN(d) ? new Date() : d; })();
    const TY = TODAY.getFullYear(), TM = TODAY.getMonth() + 1, TD = TODAY.getDate();

    /* ═════════════════════════ Réglages ═════════════════════════ */
    const TILE_KEYS = ['tree', 'photo', 'people', 'day'];
    const DEF = () => ({
        v: 1, ready: false,
        viewer: 0, notInTree: false, askViewer: false,
        theme: 'light', contrast: false, cb: 'none', calm: false,
        colors: {bg: null, ink: null, btn: null, tree: null, photo: null, people: null, day: null},
        fs: 24, btnH: 72, caseS: 80, gap: 22, font: '', lnCaps: true,
        voice: true, voiceName: '', rate: 90, autoRead: false, autoCaptions: false,
        tiles: TILE_KEYS.map(k => [k, true]),
        living: 'show', branchesOff: [], hiddenPhotos: [], docs: false,
        slideSec: 8, slideAuto: false, idleFrame: false, idleMin: 5,
        holdSec: 3, useCode: false, codeHash: '',
        forAll: true, baseAll: true,
        link: {cb: true, contrast: true, size: true, motion: true, voice: true},
    });
    const HEX = v => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);
    const num = (v, a, b, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };
    const bool = (v, d) => (typeof v === 'boolean' ? v : d);
    function clean(raw) {
        const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}, d = DEF(), o = {...d};
        o.ready = bool(r.ready, false);
        o.viewer = Math.max(0, Math.round(num(r.viewer, 0, 1e9, 0)));
        ['notInTree', 'askViewer', 'contrast', 'calm', 'lnCaps', 'voice', 'autoRead', 'autoCaptions', 'docs', 'slideAuto', 'idleFrame', 'useCode', 'forAll', 'baseAll'].forEach(k => { o[k] = bool(r[k], d[k]); });
        o.theme = ['light', 'sepia', 'dark'].includes(r.theme) ? r.theme : 'light';
        o.cb = ['none', 'protan', 'deutan', 'tritan', 'achroma'].includes(r.cb) ? r.cb : 'none';
        o.colors = {}; Object.keys(d.colors).forEach(k => { o.colors[k] = HEX(r.colors?.[k]); });
        o.fs = Math.round(num(r.fs, 22, 40, 24)); o.btnH = Math.round(num(r.btnH, 64, 120, 72)); o.caseS = Math.round(num(r.caseS, 56, 140, 80)); o.gap = Math.round(num(r.gap, 10, 44, 22));
        o.font = typeof r.font === 'string' ? r.font.replace(/["'<>\\;{}\u0000-\u001f\u007f]/g, '').trim().slice(0, 60) : '';
        o.voiceName = typeof r.voiceName === 'string' ? r.voiceName.slice(0, 200) : '';
        o.rate = Math.round(num(r.rate, 60, 130, 90));
        const seen = new Set(), tiles = [];
        (Array.isArray(r.tiles) ? r.tiles : []).forEach(t => { if (Array.isArray(t) && TILE_KEYS.includes(t[0]) && !seen.has(t[0])) { seen.add(t[0]); tiles.push([t[0], t[1] !== false]); } });
        TILE_KEYS.forEach(k => { if (!seen.has(k)) tiles.push([k, true]); });
        if (!tiles.some(t => t[1])) tiles[0][1] = true; // au moins un gros bouton
        o.tiles = tiles;
        o.living = ['show', 'first', 'hide'].includes(r.living) ? r.living : 'show';
        o.branchesOff = (Array.isArray(r.branchesOff) ? r.branchesOff : []).filter(x => typeof x === 'string' && x.length < 80).slice(0, 200);
        o.hiddenPhotos = (Array.isArray(r.hiddenPhotos) ? r.hiddenPhotos : []).map(Number).filter(x => Number.isInteger(x) && x > 0).slice(0, 5000);
        o.slideSec = Math.round(num(r.slideSec, 3, 30, 8)); o.idleMin = Math.round(num(r.idleMin, 1, 60, 5)); o.holdSec = num(r.holdSec, 1, 10, 3);
        o.codeHash = typeof r.codeHash === 'string' && /^[0-9a-f]{16}:[0-9a-f]{64}$/.test(r.codeHash) ? r.codeHash : '';
        if (!o.codeHash) o.useCode = false;
        o.link = {}; Object.keys(d.link).forEach(k => { o.link[k] = bool(r.link?.[k], true); });
        return o;
    }
    /** les réglages : ceux de cet appareil s'il les garde pour lui (« Réglages de base » coupé), sinon ceux de la généalogie */
    function read() { const loc = lsGet(LOCAL); return clean(loc && loc.baseAll === false ? loc : lsGet(KEY)); }
    function write(s) { const c = clean(s); if (c.baseAll === false) lsSet(LOCAL, c); else { lsSet(LOCAL, null); lsSet(KEY, c); } return c; }
    /** le « mode confidentialité » de l'app (Maintenance → Export) : les vivants sont montrés par leur prénom seulement */
    const privacyOn = () => { try { return !!JSON.parse(localStorage.getItem('genealogie-export-privacy') || '{}').enabled; } catch (_) { return false; } };
    const dev = () => { const d = lsGet(DEV); return d && typeof d === 'object' ? d : {}; };
    const setDev = patch => { const d = {...dev(), ...patch}; Object.keys(d).forEach(k => d[k] === undefined && delete d[k]); lsSet(DEV, d); };

    /* l'accessibilité de toute l'app (♿ Toute l'app) : ce qui « vaut aussi ici » */
    const appA11y = () => { const a = ext.access?.get?.() || {}; return {cb: a.cb || 'none', contrast: !!a.contrast, size: Number(a.size) || 100, calm: !!a.calm, rate: Math.round((Number(a.rate) || 1) * 100), voice: a.voice || ''}; };
    const reduceOs = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
    /* ═════ Couleurs : thèmes, contraste mesuré (WCAG), « Corriger » ═════ */
    const PAL = {
        light: {bg: '#fbfbfb', ink: '#0b0b0b', card: '#ffffff', muted: '#3d3d3d', btn: '#0047c2', onBtn: '#ffffff', tree: '#dff2e4', photo: '#e2ebff', people: '#fff0c2', day: '#fde3ec'},
        sepia: {bg: '#f3e9d6', ink: '#2a1d0e', card: '#fbf5ea', muted: '#4b3822', btn: '#6b3a12', onBtn: '#ffffff', tree: '#e2e6c7', photo: '#e8dcc4', people: '#f2dcae', day: '#efd2c9'},
        dark: {bg: '#121212', ink: '#f4f4f4', card: '#1e1e1e', muted: '#d0d0d0', btn: '#8fb8ff', onBtn: '#0a0a0a', tree: '#16301f', photo: '#18294a', people: '#3b3112', day: '#3d1a28'},
    };
    const PAL_HC = {
        light: {bg: '#ffffff', ink: '#000000', card: '#ffffff', muted: '#000000', btn: '#002f87', onBtn: '#ffffff', tree: '#ffffff', photo: '#ffffff', people: '#ffffff', day: '#ffffff'},
        dark: {bg: '#000000', ink: '#ffffff', card: '#000000', muted: '#ffffff', btn: '#ffe14d', onBtn: '#000000', tree: '#000000', photo: '#000000', people: '#000000', day: '#000000'},
    };
    const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const lum = h => { const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const bestOn = c => (ratio(c, '#ffffff') >= ratio(c, '#0a0a0a') ? '#ffffff' : '#0a0a0a');
    function toHsl(h) { const [r, g, b] = rgb(h).map(v => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let H = 0, S2 = 0; const L = (mx + mn) / 2;
        if (mx !== mn) { const d = mx - mn; S2 = L > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); H = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; H /= 6; } return [H, S2, L]; }
    function fromHsl(H, S2, L) { const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
        let r, g, b; if (!S2) r = g = b = L; else { const q = L < 0.5 ? L * (1 + S2) : L + S2 - L * S2, p = 2 * L - q; r = f(p, q, H + 1 / 3); g = f(p, q, H); b = f(p, q, H - 1 / 3); }
        return '#' + [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join(''); }
    /** « Corriger » : la même teinte, plus claire ou plus foncée, jusqu'à 7:1 contre l'autre couleur */
    function fixColor(c, against) { const [H, S2, L0] = toHsl(c); const darkText = lum(against) < 0.4; let L = L0;
        for (let i = 0; i < 101; i++) { const t = fromHsl(H, S2, L); if (ratio(t, against) >= 7.05) return t; L = darkText ? Math.min(1, L + 0.01) : Math.max(0, L - 0.01); }
        return darkText ? '#ffffff' : '#000000'; }

    /** ce qui s'applique vraiment : réglages du mode + ceux de toute l'app quand la ligne dit « Pareil que l'app » */
    function eff(st) {
        const L = st.link, ap = appA11y();
        const contrast = L.contrast ? ap.contrast : st.contrast, cb = L.cb ? ap.cb : st.cb, calm = (L.motion ? ap.calm : st.calm) || reduceOs();
        const mult = L.size ? ap.size / 100 : 1, fs = Math.max(22, Math.round(st.fs * mult));
        const rate = L.voice ? ap.rate : st.rate, voiceName = L.voice ? ap.voice : st.voiceName;
        let pal;
        if (contrast) pal = {...PAL_HC[st.theme === 'dark' ? 'dark' : 'light']};
        else { pal = {...PAL[st.theme]}; Object.keys(st.colors).forEach(k => { if (st.colors[k]) pal[k] = st.colors[k]; }); if (st.colors.btn) pal.onBtn = bestOn(pal.btn); }
        return {contrast, cb, calm, fs, mult, rate, voiceName, pal, btnH: Math.max(64, Math.round(st.btnH * Math.min(1.25, Math.max(1, mult)))), caseS: st.caseS, gap: st.gap};
    }
    const CHECKS = [['ink', 'bg', 'Le texte sur le fond'], ['onBtn', 'btn', 'Le texte des boutons principaux'], ['ink', 'tree', 'Le texte sur « L’arbre »'], ['ink', 'photo', 'Le texte sur « Les photos »'], ['ink', 'people', 'Le texte sur « Les personnes »'], ['ink', 'day', 'Le texte sur « Ce jour-là »']];
    const contrastRows = pal => CHECKS.map(([a, b, label]) => ({a, b, label, r: ratio(pal[a], pal[b])}));
    const FONTS = {
        '': {label: 'Inter (celle du prototype)', stack: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif"},
        'Atkinson Hyperlegible': {label: 'Atkinson Hyperlegible', stack: "'Atkinson Hyperlegible', Verdana, Tahoma, sans-serif"},
        'Luciole': {label: 'Luciole', stack: "Luciole, 'Atkinson Hyperlegible', Verdana, sans-serif"},
        'OpenDyslexic': {label: 'OpenDyslexic', stack: "OpenDyslexic, 'Comic Sans MS', Verdana, sans-serif"},
    };
    const fontStack = f => FONTS[f]?.stack || `'${f}', ${FONTS[''].stack}`;
    const fontLabel = f => FONTS[f]?.label || f;

    /* SHA-256 (le code de sortie n'est jamais gardé en clair ; marche aussi hors d'un « contexte sûr ») */
    function sha256(str) {
        const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
        const bytes = [...new TextEncoder().encode(str)], l = bytes.length * 8;
        bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
        for (let i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (l >>> (i * 8)) & 255);
        const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], W = new Array(64);
        const rr = (x, n) => (x >>> n) | (x << (32 - n));
        for (let o = 0; o < bytes.length; o += 64) {
            for (let i = 0; i < 16; i++) W[i] = (bytes[o + 4 * i] << 24) | (bytes[o + 4 * i + 1] << 16) | (bytes[o + 4 * i + 2] << 8) | bytes[o + 4 * i + 3];
            for (let i = 16; i < 64; i++) { const s0 = rr(W[i - 15], 7) ^ rr(W[i - 15], 18) ^ (W[i - 15] >>> 3), s1 = rr(W[i - 2], 17) ^ rr(W[i - 2], 19) ^ (W[i - 2] >>> 10); W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0; }
            let [a, b, c, d, e, f, g, h] = H;
            for (let i = 0; i < 64; i++) { const t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0, t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0; h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0; }
            [a, b, c, d, e, f, g, h].forEach((v, i) => { H[i] = (H[i] + v) | 0; });
        }
        return H.map(v => (v >>> 0).toString(16).padStart(8, '0')).join('');
    }
    const makeCodeHash = code => { const salt = [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join(''); return `${salt}:${sha256(salt + ':' + code)}`; };
    const checkCode = (code, stored) => { const [salt, h] = String(stored || '').split(':'); return !!salt && !!h && sha256(salt + ':' + code) === h; };

    /* ═════════════════════════ Données (lecture seule) ═════════════════════════ */
    let D = null, loading = null;
    function apiGet(action) { const u = new URL('api.php', location.href); u.searchParams.set('action', action); return realFetch(u.toString(), {headers: {Accept: 'application/json'}, credentials: 'same-origin'}).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
    const dkey = x => (x ? x.y * 10000 + (x.m || 0) * 100 + (x.d || 0) : 99999999);
    function indexData(r) {
        const P = new Map(), parentsOf = new Map(), famsOf = new Map(), parentFam = new Map(), M = new Map();
        (r.persons || []).forEach(p => P.set(p.id, p));
        (r.families || []).forEach(f => {
            [f.a, f.b].filter(Boolean).forEach(x => { if (!famsOf.has(x)) famsOf.set(x, []); famsOf.get(x).push(f); });
            f.c.forEach(c => { if (!parentFam.has(c)) parentFam.set(c, f); const ps = parentsOf.get(c) || []; [f.a, f.b].filter(Boolean).forEach(x => ps.includes(x) || ps.push(x)); parentsOf.set(c, ps); });
        });
        (r.media || []).forEach(m => M.set(m.id, m));
        return {P, F: r.families || [], M, media: r.media || [], parentsOf, famsOf, parentFam, start: r.start || 0, anc: new Map(), rel: new Map()};
    }
    function loadData(force = false) {
        if (D && !force) return Promise.resolve(D);
        if (loading) return loading;
        loading = apiGet('mode_simple_data').then(r => { if (!r || !Array.isArray(r.persons)) throw new Error(r?.error || 'données illisibles'); D = indexData(r); return D; }).finally(() => { loading = null; });
        return loading;
    }

    /* ═════════════════════════ La famille ═════════════════════════ */
    const P = id => D?.P.get(Number(id));
    const birthKey = id => dkey(P(id)?.birth?.date || P(id)?.bapt?.date);
    const byBirth = (a, b) => birthKey(a) - birthKey(b);
    const famsOf = id => D.famsOf.get(id) || [];
    const parentsOf = id => (D.parentsOf.get(id) || []).filter(x => P(x)).sort((x, y) => (P(x).g === 'm' ? 0 : P(x).g === 'f' ? 1 : 2) - (P(y).g === 'm' ? 0 : P(y).g === 'f' ? 1 : 2));
    const spousesOf = id => famsOf(id).map(f => (f.a === id ? f.b : f.a)).filter(x => x && P(x));
    const childrenOf = id => { const c = []; famsOf(id).forEach(f => f.c.forEach(x => c.includes(x) || c.push(x))); return c.filter(x => P(x)).sort(byBirth); };
    const siblingsOf = id => { const f = D.parentFam.get(id); return f ? f.c.filter(x => P(x)).slice().sort(byBirth) : [id]; };
    function ancestors(id) {
        if (D.anc.has(id)) return D.anc.get(id);
        const m = new Map([[id, 0]]), q = [id];
        while (q.length) { const x = q.shift(), d = m.get(x); if (d >= 30) continue; (D.parentsOf.get(x) || []).forEach(p => { if (!m.has(p)) { m.set(p, d + 1); q.push(p); } }); }
        D.anc.set(id, m); return m;
    }
    /** ce que la personne t est pour celle qui regarde v, par le sang : [a, b] = générations de t et de v jusqu'à l'ancêtre commun */
    function bloodSteps(v, t) { if (v === t) return null; const A1 = ancestors(t), B = ancestors(v); let best = null; A1.forEach((a, x) => { if (B.has(x)) { const b = B.get(x); if (!best || a + b < best[0] + best[1]) best = [a, b]; } }); return best; }
    /** même calcul et mêmes mots que qm_kin_label_g (lib/question_more.php), sans l'article */
    function kinNoun(a, b, g) {
        const f = g === 'f', m = g === 'm', e = f ? 'e' : '';
        const great = (n, base) => 'arrière-'.repeat(Math.max(0, n)) + base;
        if (a === 0) return b === 1 ? (f ? 'mère' : m ? 'père' : 'parent') : great(b - 2, f ? 'grand-mère' : 'grand-père');
        if (b === 0) return a === 1 ? (f ? 'fille' : m ? 'fils' : 'enfant') : great(a - 2, f ? 'petite-fille' : 'petit-fils');
        if (a === 1 && b === 1) return f ? 'sœur' : 'frère';
        if (a === 1) return b === 2 ? (f ? 'tante' : 'oncle') : great(b - 3, f ? 'grand-tante' : 'grand-oncle');
        if (b === 1) return a === 2 ? (f ? 'nièce' : 'neveu') : great(a - 3, f ? 'petite-nièce' : 'petit-neveu');
        const deg = Math.min(a, b) - 1, c = f ? 'cousine' : 'cousin';
        if (a === b) return deg === 1 ? `${c} germain${e}` : deg === 2 ? `${c} issu${e} de germains` : `${c} éloigné${e}`;
        return c; // générations décalées : « ta cousine », plus simple à entendre que « à la mode de Bretagne »
    }
    const startsVowel = n => /^[aeiouyéèêâîôûœh]/i.test(n);
    const pos = (n, f) => (startsVowel(n) || !f ? 'ton ' : 'ta ') + n;
    const art = (n, f) => (startsVowel(n) ? 'l’' : f ? 'la ' : 'le ') + n;
    const blood = (v, t) => { const s = bloodSteps(v, t); return s ? kinNoun(s[0], s[1], P(t).g) : null; };
    /** le lien en clair, pour la personne qui regarde : « ta grand-mère », « ton beau-père », « le mari de ta petite-fille Émilie » */
    function relFor(v, t) {
        if (!v || !P(v) || !P(t)) return '';
        if (t === v) return 'toi';
        const k = v + ':' + t; if (D.rel.has(k)) return D.rel.get(k);
        const f = P(t).g === 'f', out = (() => {
            if (spousesOf(v).includes(t)) return pos(f ? 'femme' : P(t).g === 'm' ? 'mari' : 'conjoint', f);
            const b = blood(v, t); if (b) return pos(b, f);
            for (const s of spousesOf(t)) {
                const bs = blood(v, s); if (!bs) continue;
                if (/^(père|mère|parent)$/.test(bs)) return pos(f ? 'belle-mère' : 'beau-père', f);
                if (/^(fils|fille|enfant)$/.test(bs)) return pos(f ? 'belle-fille' : 'gendre', f);
                if (/^(frère|sœur)$/.test(bs)) return pos(f ? 'belle-sœur' : 'beau-frère', f);
                return `${f ? 'la femme de ' : P(t).g === 'm' ? 'le mari de ' : 'le conjoint de '}${pos(bs, P(s).g === 'f')} ${P(s).first}`;
            }
            for (const sp of spousesOf(v)) {
                const bs = blood(sp, t); if (!bs) continue;
                if (/^(père|mère|parent)$/.test(bs)) return pos(f ? 'belle-mère' : 'beau-père', f);
                if (/^(frère|sœur)$/.test(bs)) return pos(f ? 'belle-sœur' : 'beau-frère', f);
                if (/^(fils|fille|enfant)$/.test(bs)) return pos(f ? 'belle-fille' : 'beau-fils', f);
                return `${art(bs, f)} de ${pos(P(sp).g === 'f' ? 'femme' : 'mari', P(sp).g === 'f')}`;
            }
            return '';
        })();
        D.rel.set(k, out); return out;
    }

    /* ═════════════════════════ Dates et phrases ═════════════════════════ */
    const day1 = d => (d === 1 ? '1er' : String(d));
    function fmtD(x) { if (!x) return ''; if (!x.m) return String(x.y); if (!x.d) return `${MOIS[x.m - 1]} ${x.y}`; return `${day1(x.d)} ${MOIS[x.m - 1]} ${x.y}`; }
    function leD(x) { if (!x) return ''; if (x.about) return `vers ${x.y}`; return x.d ? `le ${fmtD(x)}` : `en ${fmtD(x)}`; }
    function ageAt(b, at) { if (!b || !at) return null; let a = at.y - b.y; if (at.m && b.m && (at.m < b.m || (at.m === b.m && at.d && b.d && at.d < b.d))) a--; return a; }
    const todayD = {y: TY, m: TM, d: TD};
    const joinFr = a => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' et ' + a[a.length - 1]);
    const titleCase = s => String(s || '').toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

    /* ═════════════════════════ Voix ═════════════════════════ */
    const TTS = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
    const frVoices = () => { try { return speechSynthesis.getVoices().filter(v => /^fr(-|_|$)/i.test(v.lang)); } catch (_) { return []; } };

    /* ═════════════════════════ Lecture seule : rien ne part pendant le mode ═════════════════════════ */
    const realFetch = window.fetch.bind(window);
    const guard = {on: false, blocked: [], deferred: [], posts: 0};
    const isRead = m => !m || /^(GET|HEAD)$/i.test(m);
    (function installGuard() {
        window.fetch = function (input, init) {
            if (guard.on) {
                const method = (init && init.method) || (input && typeof input === 'object' && input.method) || 'GET';
                if (!isRead(method)) {
                    const url = String(typeof input === 'string' ? input : input?.url || '');
                    guard.blocked.push(url);
                    // les réglages d'affichage en attente (copie dans la base) partent après la sortie, pas pendant
                    if (/action=save_settings\b/.test(url)) return new Promise(res => guard.deferred.push(() => realFetch(input, init).then(res, () => res(new Response('{}')))));
                    return Promise.reject(new TypeError('Mode simple : lecture seule'));
                }
            }
            return realFetch(input, init);
        };
        const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (m, ...a) { this.__msMethod = m; this.__msUrl = a[0]; return XO.call(this, m, ...a); };
        XMLHttpRequest.prototype.send = function (...a) { if (guard.on && !isRead(this.__msMethod)) { guard.blocked.push(String(this.__msUrl || '')); setTimeout(() => this.dispatchEvent(new Event('error')), 0); return; } return XS.apply(this, a); };
        if (navigator.sendBeacon) { const SB = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = (u, d) => { if (guard.on) { guard.blocked.push(String(u)); return false; } return SB(u, d); }; }
    })();

    /* ═════════════════════════ Le mode : un « moteur » dessiné dans un cadre ═════════════════════════
     * Le même moteur sert au plein écran, à « 👁 Essayer ici » (dans la page des réglages) et à l'aperçu vivant (non cliquable). */
    const TITLES = {who: ['👋', 'Qui regarde ?'], tree: ['🌳', 'L’arbre'], photos: ['📷', 'Les photos'], slides: ['📷', 'Les photos'], person: ['👤', 'Sa fiche'], people: ['👥', 'Les personnes'], day: ['🎂', 'Ce jour-là'], code: ['🔒', 'Quitter'], loading: ['', 'Un instant…'], error: ['', 'Mode simple']};
    const TILE = {tree: ['🌳', 'L’arbre', 'Toute la famille, de case en case'], photo: ['📷', 'Les photos', ''], people: ['👥', 'Les personnes', 'Chercher quelqu’un par son nom'], day: ['🎂', 'Ce jour-là', '']};

    function makeMode(host, opts = {}) {
        const live = !opts.preview, full = !!opts.full;
        let S = opts.settings ? clean(opts.settings) : read();
        const V = {screen: 'home', stack: [], center: 0, zoom: 3, slide: 0, slideList: null, slideTags: false, slideTimer: 0, peopleTab: 'family', letter: null, query: '', choosing: false, code: '', photoFilter: 'all', person: 0, viewer: null, auto: false};
        host.innerHTML = `<div class="ms" role="region" aria-label="Mode simple"><header class="ms-bar"></header><main class="ms-main"></main><div class="ms-msg" role="status" aria-live="polite" hidden></div></div>`;
        const GP = host.firstElementChild, BAR = $('.ms-bar', GP), MAIN = $('.ms-main', GP), MSG = $('.ms-msg', GP);
        if (!live) GP.setAttribute('inert', '');
        let E = eff(S);
        /* ── qui regarde, ce qu'on voit ── */
        const viewerId = () => { if (V.viewer !== null) return V.viewer; if (S.notInTree) return 0; const d = dev().viewer; if (live && Number.isInteger(d) && P(d)) return d; return P(S.viewer) ? S.viewer : (P(D?.start) ? D.start : 0); };
        const livingMode = () => (S.living === 'show' && privacyOn() ? 'first' : S.living);
        const surnameKey = p => norm(p.last).trim();
        let nearCache = null;
        function near() {
            const v = viewerId(); if (nearCache && nearCache.v === v) return nearCache.set;
            const set = new Set(); if (v && P(v)) { set.add(v); [...spousesOf(v), ...parentsOf(v), ...siblingsOf(v)].forEach(x => set.add(x)); const q = childrenOf(v); while (q.length) { const x = q.shift(); if (set.has(x)) continue; set.add(x); childrenOf(x).forEach(c => q.push(c)); spousesOf(x).forEach(s => set.add(s)); } }
            nearCache = {v, set}; return set;
        }
        function vis(id) {
            const p = P(id); if (!p) return false; const v = viewerId(); if (id === v) return true;
            if (p.priv) return false;
            if (S.branchesOff.length && !near().has(id) && S.branchesOff.includes(surnameKey(p))) return false;
            if (p.living && livingMode() === 'hide') return false;
            return true;
        }
        const visA = a => a.filter(vis);
        const firstOnly = p => p.living && livingMode() === 'first' && p.id !== viewerId();
        const lastShown = p => (S.lnCaps ? String(p.last).toUpperCase() : titleCase(p.last));
        const nameH = p => (firstOnly(p) || !p.last ? esc(p.first || 'Sans prénom') : `${esc(p.first || '')} <span class="ms-ln">${esc(lastShown(p))}</span>`);
        const nameT = p => (firstOnly(p) || !p.last ? (p.first || 'Sans prénom') : `${p.first} ${titleCase(p.last)}`); // à lire : sans capitales (la voix les épellerait)
        const by = p => (p.birth?.date || p.bapt?.date)?.y, dy = p => p.death?.date?.y;
        function years(p) { if (firstOnly(p)) return ''; const b = by(p), d = dy(p); if (p.living) return b ? `${p.g === 'f' ? 'née' : 'né'} en ${b}` : ''; if (b && d) return `${b} – ${d}`; if (b) return `${p.g === 'f' ? 'née' : 'né'} en ${b}`; if (d) return `${p.g === 'f' ? 'morte' : 'mort'} en ${d}`; return ''; }
        function yearsSpoken(p) { if (firstOnly(p)) return ''; const b = by(p), d = dy(p); if (p.living) return b ? `${p.g === 'f' ? 'née' : 'né'} en ${b}` : ''; if (b && d) return `de ${b} à ${d}`; return years(p); }
        const rel = t => relFor(viewerId(), t);
        const nb = t => esc(t).replace(/-/g, '‑');
        const relLabel = id => { const r = rel(id); return r ? `<span class="ms-rel">${r === 'toi' ? 'C’est toi' : nb(r)}</span>` : ''; };
        /* ── portraits : la photo de la fiche, sinon le portrait K7 (UI.avatar) en grand ── */
        function ph(id, px = 80, cls = '') {
            const p = P(id); if (!p) return '';
            if (p.photo && !firstOnly(p)) return `<span class="ms-ph ${cls}"><img src="${esc(p.photo)}" alt="" loading="lazy" draggable="false"></span>`;
            const av = UI().avatar ? UI().avatar({id: p.id, first_name: p.first, last_name: firstOnly(p) ? '' : p.last, gender: p.g === 'm' ? 'male' : p.g === 'f' ? 'female' : 'unknown'}, 88, {noPhoto: true}) : '';
            return `<span class="ms-ph ${cls}" style="--px:${px}px">${av.replace(/--av:\d+px/, `--av:${px}px`)}</span>`;
        }
        /* ── photos ── */
        const photoOk = m => !S.hiddenPhotos.includes(m.id) && (S.docs || !m.doc) && (!m.people.length || m.people.some(vis));
        const visPhotos = () => (D ? D.media.filter(photoOk) : []);
        const photoWhen = m => (m.date ? (m.date.about ? 'vers ' + m.date.y : fmtD(m.date)) : '');
        const photoCap = m => [photoWhen(m), m.place].filter(Boolean).join(' · ');
        const img = (m, cls = '') => `<img class="${cls}" src="${esc(m.thumb || m.src)}" alt="${esc(m.title || 'Photo')}" loading="lazy" draggable="false">`;
        /* ── apparence ── */
        function applyLook() {
            E = eff(S);
            GP.dataset.theme = S.contrast || E.contrast ? (S.theme === 'dark' ? 'dark' : 'light') : S.theme;
            GP.dataset.contrast = E.contrast ? 'on' : 'off'; GP.dataset.calm = E.calm ? 'on' : 'off'; GP.dataset.caps = S.lnCaps ? 'on' : 'off';
            const pal = E.pal, st = GP.style;
            [['--bg', pal.bg], ['--ink', pal.ink], ['--card', pal.card], ['--muted', pal.muted], ['--blue', pal.btn], ['--on-blue', pal.onBtn], ['--t-tree', pal.tree], ['--t-photo', pal.photo], ['--t-people', pal.people], ['--t-day', pal.day]].forEach(([k, v]) => st.setProperty(k, v));
            st.setProperty('--fs', E.fs + 'px'); st.setProperty('--btn-h', E.btnH + 'px'); st.setProperty('--case', E.caseS + 'px'); st.setProperty('--gap', E.gap + 'px');
            st.setProperty('--font', fontStack(S.font));
            GP.dataset.cb = E.cb;
            const own = !S.link.cb && E.cb !== 'none';
            st.filter = own ? `url(#ms-cb-${E.cb})` : '';
            if (own) ensureCbFilter(E.cb);
            if (full) document.documentElement.classList.toggle('ms-own-cb', !S.link.cb);
        }
        /* ── navigation ── */
        const snapshot = () => ({screen: V.screen, center: V.center, slide: V.slide, slideList: V.slideList, person: V.person, peopleTab: V.peopleTab, letter: V.letter, choosing: V.choosing, slideTags: V.slideTags});
        function go(screen, o = {}) { stopSlide(); stopSpeak(); if ((o.push !== false && V.screen !== screen) || o.forcePush) V.stack.push(snapshot()); Object.assign(V, o.state || {}); V.screen = screen; render(true); }
        function back() { stopSlide(); stopSpeak(); const s = V.stack.pop(); if (!s) { goHome(); return; } Object.assign(V, s); render(true); }
        function goHome() { stopSlide(); stopSpeak(); V.stack = []; V.screen = 'home'; V.choosing = false; render(true); }
        /* ── barre du haut : « ← Retour » à gauche, « 🏠 Accueil » à droite ; sur l'accueil : la date et « 🔊 Écouter » ── */
        function bar() {
            if (V.screen === 'home') {
                const d = `${JOURS[TODAY.getDay()]} ${day1(TD)} ${MOIS[TM - 1]}`;
                BAR.innerHTML = `<span class="ms-date">📅 ${esc(d.charAt(0).toUpperCase() + d.slice(1))}</span><span></span>${speakBtn(homeSpeech(), 'Écouter') || '<span></span>'}`; return;
            }
            if (V.screen === 'loading' || V.screen === 'error') { BAR.innerHTML = `<span></span><h1 class="ms-title" tabindex="-1">${esc(TITLES[V.screen][1])}</h1><span></span>`; return; }
            const [ic, t] = TITLES[V.screen] || ['', ''];
            const noHome = V.screen === 'who' && !V.stack.length;
            BAR.innerHTML = `<button type="button" class="ms-btn" data-act="back" aria-label="Retour à l’écran d’avant"><span class="ms-ico" aria-hidden="true">←</span><span class="ms-lbl">Retour</span></button><h1 class="ms-title" tabindex="-1">${ic ? `<span aria-hidden="true">${ic}</span> ` : ''}${esc(t)}</h1>${noHome ? '<span></span>' : '<button type="button" class="ms-btn" data-act="home" aria-label="Accueil"><span class="ms-ico" aria-hidden="true">🏠</span><span class="ms-lbl">Accueil</span></button>'}`;
        }
        function render(focus) {
            applyLook(); bar(); MAIN.className = 'ms-main'; MAIN.scrollTop = 0;
            const r = {home: rHome, who: rWho, tree: rTree, photos: rPhotos, slides: rSlides, person: rPerson, people: rPeople, day: rDay, code: rCode, loading: rLoading, error: rError}[V.screen] || rHome;
            r();
            MAIN.firstElementChild?.classList.add('ms-fade');
            if (focus && live) { const t = $('h1', MAIN) || $('.ms-title', BAR); if (t && V.screen !== 'code' && V.screen !== 'people') { t.setAttribute('tabindex', '-1'); try { t.focus({preventScroll: true}); } catch (_) {} } }
            if (live && V.screen === 'person' && S.voice && S.autoRead) { const b = $('[data-act=speak]', MAIN); if (b) setTimeout(() => speak(b.dataset.text, b), 300); }
        }
        function rLoading() { MAIN.innerHTML = `<div class="ms-center"><span class="ms-spin" aria-hidden="true"></span><p class="ms-lead">Un instant, on prépare l’arbre…</p></div>`; }
        function rError() { MAIN.innerHTML = `<div class="ms-center"><p class="ms-lead">L’arbre n’a pas pu être lu. Demande à la personne qui a préparé l’app.</p><button type="button" class="ms-btn primary" data-act="retry"><span class="ms-ico" aria-hidden="true">↻</span><span>Réessayer</span></button></div>`; }

        /* ── Accueil ── */
        const viewerFirst = () => { const v = viewerId(); return v && P(v) ? P(v).first : ''; };
        const homeSpeech = () => { const n = viewerFirst(), t = S.tiles.filter(x => x[1]).map(x => TILE[x[0]][1].replace(/^(L’|Les |Ce )/, m => m.toLowerCase())); return `Bonjour${n ? ' ' + n : ''}. Touche un gros bouton : ${joinFr(t)}.`; };
        function rHome() {
            const n = viewerFirst(), cnt = dayData().today.length, tiles = S.tiles.filter(t => t[1]).map(t => t[0]);
            const sub = k => (k === 'photo' ? `${plural(visPhotos().length, 'photo')} de famille` : k === 'day' ? (cnt ? 'Il se passe quelque chose aujourd’hui !' : 'Anniversaires et souvenirs') : TILE[k][2]);
            MAIN.innerHTML = `<div class="ms-home"><div class="ms-hello"><div><h1 tabindex="-1">Bonjour${n ? ' ' + esc(n) : ''} !</h1><p>Touche un gros bouton pour commencer.</p></div></div>
                <div class="ms-tiles" data-n="${tiles.length}">${tiles.map(k => `<button type="button" class="ms-tile k-${k}" data-act="tile" data-to="${k}"><span class="ms-big" aria-hidden="true">${TILE[k][0]}</span><span><b>${TILE[k][1]}</b><small>${esc(sub(k))}</small>${k === 'day' && cnt ? `<span class="ms-badge">${plural(cnt, 'souvenir')} aujourd’hui</span>` : ''}</span></button>`).join('')}</div>
                <div class="ms-foot"><button type="button" class="ms-btn" data-act="who"><span class="ms-ico" aria-hidden="true">👋</span><span>${n ? 'Ce n’est pas ' + esc(n) + ' ?' : 'Qui regarde ?'}</span></button>
                <button type="button" class="ms-btn ms-hold" data-act="hold" aria-label="Quitter le mode simple : garde le doigt appuyé ${String(S.holdSec).replace('.', ',')} secondes, ou garde la touche Entrée enfoncée"><span class="ms-fill" aria-hidden="true"></span><span class="ms-ico" aria-hidden="true">🔒</span><span class="ms-hold-t">Quitter le mode simple<br><span class="ms-hint">garde le doigt appuyé ${String(S.holdSec).replace('.', ',')} s</span></span></button></div></div>`;
            if (live) bindHold();
        }
        function bindHold() {
            const b = $('.ms-hold', MAIN); if (!b) return; let t0 = 0, raf = 0, done = false; const DUR = S.holdSec * 1000, fill = $('.ms-fill', b), hint = $('.ms-hint', b);
            const step = () => { const k = Math.min(1, (performance.now() - t0) / DUR); fill.style.width = (k * 100) + '%'; if (k >= 1) { done = true; stop(true); afterHold(); } else raf = requestAnimationFrame(step); };
            const start = () => { if (t0) return; done = false; t0 = performance.now(); raf = requestAnimationFrame(step); hint.textContent = 'Continue… encore un peu'; };
            const stop = ok => { cancelAnimationFrame(raf); const el = performance.now() - t0; t0 = 0; fill.style.width = '0'; if (!ok && !done && el > 0 && hint.isConnected) hint.textContent = `Garde le doigt appuyé ${String(S.holdSec).replace('.', ',')} secondes`; };
            b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); start(); });
            ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => b.addEventListener(ev, () => t0 && stop(false)));
            b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) start(); } });
            b.addEventListener('keyup', e => { if (e.key === 'Enter' || e.key === ' ') t0 && stop(false); });
        }
        function afterHold() { if (S.useCode && S.codeHash) { V.code = ''; go('code'); } else exit(); }
        function exit() { stopSlide(); stopSpeak(); opts.onExit?.(); }

        /* ── Qui regarde ── */
        function rWho() {
            const living = [...D.P.values()].filter(p => p.living && vis(p.id) && !p.priv).sort((a, b) => byBirth(a.id, b.id)).slice(0, 8);
            MAIN.innerHTML = `<div><h1 class="ms-h2" tabindex="-1">Qui regarde l’arbre ?</h1><p class="ms-lead">Touche ta photo. L’app dira ensuite « ta mère », « ton petit-fils »…</p>
                ${living.length ? `<div class="ms-who-grid">${living.map(p => `<button type="button" class="ms-who" data-act="setviewer" data-id="${p.id}">${ph(p.id, 130)}<b>${esc(p.first)}</b><span class="ms-yr">${esc(years(p))}</span></button>`).join('')}</div>` : ''}
                <div class="ms-row"><button type="button" class="ms-btn" data-act="chooseother"><span class="ms-ico" aria-hidden="true">👥</span><span>Quelqu’un d’autre de la famille</span></button>
                <button type="button" class="ms-btn" data-act="setviewer" data-id="0"><span class="ms-ico" aria-hidden="true">🙂</span><span>Je ne suis pas dans l’arbre</span></button></div></div>`;
        }

        /* ── Arbre : la personne au milieu ── */
        function card(id, kind, act = 'center') {
            const p = P(id), r = rel(id), small = kind === 'v' && V.zoom === 1;
            const say = `${nameT(p)}${r ? ', ' + (r === 'toi' ? 'c’est toi' : r) : ''}${yearsSpoken(p) ? ', ' + yearsSpoken(p) : ''}. ${act === 'center' ? 'Toucher pour la mettre au milieu.' : 'Toucher pour voir sa fiche.'}`;
            return `<button type="button" class="ms-card ${kind}" data-act="${act}" data-id="${id}" data-pid="${id}" aria-label="${esc(say)}">${ph(id, kind === 'v' ? Math.round(E.caseS * (V.zoom === 1 ? 0.7 : 0.85)) : E.caseS)}<span class="ms-tx">${kind !== 'v' || V.zoom > 1 ? relLabel(id) : ''}<span class="ms-nm">${small ? esc(p.first) : nameH(p)}</span>${small ? '' : `<span class="ms-yr">${esc(years(p))}</span>`}</span></button>`;
        }
        function treeRows() {
            const c = V.center, z = V.zoom, up = z === 3 ? 1 : z === 2 ? 2 : 3, down = z === 3 ? 1 : 2, ups = []; let gen = [c];
            for (let k = 1; k <= up; k++) { const nx = []; gen.forEach(id => { const ps = id ? parentsOf(id) : []; const fa = ps.find(x => P(x).g !== 'f'), mo = ps.find(x => P(x).g === 'f'); nx.push(fa && vis(fa) ? fa : null, mo && vis(mo) ? mo : null); }); if (nx.every(x => !x)) break; ups.unshift(nx); gen = nx; }
            const downs = []; let dg = [c]; for (let k = 1; k <= down; k++) { const nx = []; dg.forEach(id => visA(childrenOf(id)).forEach(x => nx.includes(x) || nx.push(x))); if (!nx.length) break; downs.push(nx); dg = nx; }
            return {ups, downs};
        }
        function cardSizes(z, n) {
            const w = MAIN.clientWidth || 900, phone = w < 600, W = phone ? w - 44 : Math.max(300, w - 214), g = E.gap;
            if (z === 3) return {cw: Math.min(380, Math.floor((W - g * (n - 1)) / n)), kind: phone ? 'v' : 'h'};
            if (z === 2) return {cw: Math.min(280, Math.floor((W - g * (n - 1)) / n)), kind: n > 3 || phone ? 'v' : 'h'};
            return {cw: Math.min(210, Math.floor((W - g * (n - 1)) / n)), kind: 'v'};
        }
        function rTree() {
            const v = viewerId();
            if (!V.center || !vis(V.center)) V.center = v && vis(v) ? v : ([...D.P.keys()].find(vis) || 0);
            if (!V.center) { MAIN.innerHTML = `<div class="ms-center"><p class="ms-lead">Il n’y a encore personne à montrer.</p></div>`; return; }
            const c = V.center, p = P(c), {ups, downs} = treeRows(); MAIN.className = 'ms-main flush';
            const ps = visA(parentsOf(c)), ch = visA(childrenOf(c)), sp = visA(spousesOf(c))[0];
            const phone = (MAIN.clientWidth || 900) < 600;
            const row = (ids, wrap) => { if (ids.length > 4 || phone) ids = ids.filter(Boolean); if (phone && ids.length > 2) wrap = true; const n = ids.length || 1; const {cw, kind} = cardSizes(V.zoom, phone ? Math.min(n, 2) : wrap ? Math.min(n, V.zoom === 3 ? 3 : 4) : n);
                return `<div class="ms-trow${wrap ? ' wrap' : ''}" style="--cw:${cw}px">${ids.map(id => (id ? card(id, kind) : '<span class="ms-slot" aria-hidden="true"></span>')).join('')}</div>`; };
            const upTxt = ps.length ? joinFr(ps.map(x => P(x).first)) : '', d1 = ch[0];
            const spW = Math.min(cardSizes(3, 2).cw, 300);
            MAIN.innerHTML = `<div class="ms-tree"><div class="ms-tcol">
                ${ps.length ? `<button type="button" class="ms-btn ms-arrow" data-act="up"><span class="ms-ico" aria-hidden="true">▲</span><span>Vers les parents · ${esc(upTxt)}</span></button>` : '<div class="ms-arrow-none">On ne connaît pas encore ses parents</div>'}
                <div class="ms-canvas"><svg class="ms-lines" aria-hidden="true"></svg>
                ${ups.map(r => row(r)).join('')}
                <div class="ms-tcenter" style="margin-bottom:${downs.length ? 'var(--gap)' : '0'}">
                    <div class="ms-tmain${V.zoom < 3 ? ' sm' : ''}" data-pid="${c}">${ph(c, V.zoom < 3 ? Math.round(E.caseS * 1.1) : Math.round(E.caseS * 1.5))}<span class="ms-tx">${relLabel(c)}<h1 class="ms-nm" tabindex="-1">${nameH(p)}</h1><span class="ms-yr">${esc(years(p))}</span>
                    <button type="button" class="ms-btn primary" data-act="person" data-id="${c}"><span class="ms-ico" aria-hidden="true">📖</span><span>Voir sa fiche</span></button></span></div>
                    ${sp ? `<span class="ms-ring" aria-hidden="true">💍</span><div class="ms-spouse" style="--cw:${spW}px">${card(sp, 'h')}</div>` : ''}
                </div>
                ${downs.map(r => row(r, true)).join('')}
                </div>
                ${d1 ? `<button type="button" class="ms-btn ms-arrow" data-act="down"><span class="ms-ico" aria-hidden="true">▼</span><span>Vers les enfants · ${esc(P(d1).first)}${ch.length > 1 ? ` (l’aîné${P(d1).g === 'f' ? 'e' : ''})` : ''}</span></button>` : '<div class="ms-arrow-none">Pas d’enfants connus</div>'}
                </div>
                <div class="ms-zoom">
                    <button type="button" class="ms-btn" data-act="zin" aria-label="Plus gros"><span class="ms-ico" aria-hidden="true">＋</span><span>Plus gros</span></button>
                    <div class="ms-zlevel" aria-live="polite">${['', 'Petites cases', 'Cases moyennes', 'Grosses cases'][V.zoom]}</div>
                    <button type="button" class="ms-btn" data-act="zout" aria-label="Plus de monde"><span class="ms-ico" aria-hidden="true">−</span><span>Plus de monde</span></button>
                    ${v && vis(v) ? `<button type="button" class="ms-btn ms-me" data-act="center" data-id="${v}" aria-label="Revenir à moi"><span class="ms-ico" aria-hidden="true">🎯</span><span>Revenir à moi</span></button>` : ''}
                </div></div>`;
            requestAnimationFrame(() => { drawLines(); const m = $('.ms-tmain', MAIN), cv = $('.ms-canvas', MAIN); if (m && cv) { const top = m.getBoundingClientRect().top - cv.getBoundingClientRect().top + cv.scrollTop; cv.scrollTop = Math.max(0, top - cv.clientHeight / 2 + m.offsetHeight / 2); } });
        }
        function drawLines() {
            const cv = $('.ms-canvas', MAIN), svg = $('.ms-lines', MAIN); if (!cv || !svg) return; const R = cv.getBoundingClientRect(), sc = R.width / (cv.offsetWidth || R.width || 1) || 1, pos2 = {};
            $$('[data-pid]', cv).forEach(el => { const r = el.getBoundingClientRect(); pos2[el.dataset.pid] = {x: (r.left - R.left + r.width / 2) / sc, top: (r.top - R.top) / sc + cv.scrollTop, bottom: (r.bottom - R.top) / sc + cv.scrollTop}; });
            let d = '';
            Object.keys(pos2).forEach(id => { const ps = parentsOf(Number(id)).filter(x => pos2[x]); if (!ps.length) return; const ch = pos2[id]; let px, py;
                if (ps.length >= 2) { const a = pos2[ps[0]], b = pos2[ps[1]]; px = (a.x + b.x) / 2; py = Math.max(a.bottom, b.bottom); } else { px = pos2[ps[0]].x; py = pos2[ps[0]].bottom; }
                if (ch.top <= py) return; const my = py + (ch.top - py) / 2; d += `M${px.toFixed(1)} ${py.toFixed(1)}V${my.toFixed(1)}H${ch.x.toFixed(1)}V${ch.top.toFixed(1)}`; });
            svg.setAttribute('height', cv.scrollHeight); svg.setAttribute('width', cv.clientWidth); svg.innerHTML = `<path d="${d}"/>`;
        }

        /* ── Photos ── */
        const photoList = () => { let l = visPhotos(); const v = viewerId(); if (V.photoFilter === 'me' && v) l = l.filter(m => m.people.includes(v)); return l; };
        function rPhotos() {
            const all = visPhotos(), v = viewerId(), mine = v ? all.filter(m => m.people.includes(v)).length : 0, l = photoList();
            if (!all.length) { MAIN.innerHTML = `<div class="ms-center"><h1 class="ms-h2" tabindex="-1">Les photos</h1><p class="ms-lead">Il n’y a pas encore de photo à regarder.</p></div>`; return; }
            MAIN.innerHTML = `<div><h1 class="ms-sr" tabindex="-1">Les photos</h1><div class="ms-ph-top">
                <button type="button" class="ms-btn primary" data-act="slideshow"><span class="ms-ico" aria-hidden="true">▶</span><span>Regarder les ${plural(l.length, 'photo')}</span></button>
                ${v && mine ? `<div class="ms-seg" role="group" aria-label="Quelles photos"><button type="button" class="${V.photoFilter === 'all' ? 'is-active' : ''}" data-act="pfilter" data-v="all" aria-pressed="${V.photoFilter === 'all'}">Toutes (${all.length})</button><button type="button" class="${V.photoFilter === 'me' ? 'is-active' : ''}" data-act="pfilter" data-v="me" aria-pressed="${V.photoFilter === 'me'}">Avec toi (${mine})</button></div>` : ''}
                </div><div class="ms-ph-grid">${l.map((m, i) => `<button type="button" class="ms-ph-tile" data-act="openslide" data-i="${i}"><span class="ms-thumb">${img(m)}</span><span class="ms-cap"><b>${esc(m.title || 'Photo')}</b><span>${esc(photoCap(m))}</span></span></button>`).join('')}</div></div>`;
        }
        const slides = () => (V.slideList || photoList().map(m => m.id)).filter(id => D.M.get(id) && photoOk(D.M.get(id)));
        function slideSpeech(m) {
            const ppl = m.people.filter(vis).map(id => { const r = rel(id); return nameT(P(id)) + (r ? ', ' + (r === 'toi' ? 'toi' : r) : ''); });
            const w = photoWhen(m); return `${m.title || 'Photo'}.${w ? ' ' + w.charAt(0).toUpperCase() + w.slice(1) + (m.place ? ', à ' + m.place : '') + '.' : m.place ? ' À ' + m.place + '.' : ''}${ppl.length ? ' Sur la photo : ' + joinFr(ppl) + '.' : ''}`;
        }
        function rSlides() {
            const ids = slides(); if (!ids.length) { MAIN.innerHTML = '<div class="ms-center"><p class="ms-lead">Il n’y a pas de photo à montrer.</p></div>'; return; }
            V.slide = ((V.slide % ids.length) + ids.length) % ids.length; const m = D.M.get(ids[V.slide]); MAIN.className = 'ms-main flush';
            const ppl = m.people.filter(vis), faces = m.faces.filter(f => vis(f.p)), auto = V.auto;
            const tags = V.slideTags && faces.length ? faces.map(f => { const k = ppl.indexOf(f.p) + 1, r = rel(f.p), x = f.x + f.w / 2, y = f.y; return ppl.length > 3 ? `<span class="ms-tag num" style="left:${x}%;top:${y}%">${k}</span>` : `<span class="ms-tag" style="left:${x}%;top:${y}%">${esc(P(f.p).first)}${r ? `<em>${r === 'toi' ? 'toi' : nb(r)}</em>` : ''}</span>`; }).join('') : '';
            MAIN.innerHTML = `<div class="ms-slides"><h1 class="ms-sr" tabindex="-1">${esc(m.title || 'Photo')}</h1>
                <div class="ms-stage"><div class="ms-pbox" role="img" aria-label="${esc(m.title || 'Photo')}"><img src="${esc(m.src)}" alt="" draggable="false">${tags}</div>
                ${ids.length > 1 ? '<button type="button" class="ms-sarrow prev" data-act="prev" aria-label="Photo d’avant">‹</button><button type="button" class="ms-sarrow next" data-act="next" aria-label="Photo suivante">›</button>' : ''}</div>
                <div class="ms-sinfo">${auto ? '<div class="ms-prog" aria-hidden="true"><i></i></div>' : ''}
                <div class="ms-scap"><b>${esc(m.title || 'Photo')}</b><span>${esc(photoCap(m))}</span></div>
                <div class="ms-sbtns">${speakBtn(slideSpeech(m))}
                ${ppl.length ? `<button type="button" class="ms-btn ${V.slideTags ? 'is-on' : ''}" data-act="tags" aria-pressed="${V.slideTags}"><span class="ms-ico" aria-hidden="true">👥</span><span>${V.slideTags ? 'Cacher les noms' : 'Qui est là ?'}</span></button>` : '<span class="ms-noone">Personne n’est nommé sur cette photo</span>'}
                ${ids.length > 1 ? `<button type="button" class="ms-btn ${auto ? 'is-on' : ''}" data-act="auto" aria-pressed="${auto}"><span class="ms-ico" aria-hidden="true">${auto ? '⏸' : '▶'}</span><span>${auto ? 'Arrêter le défilement' : 'Défilement tout seul'}</span></button>` : ''}
                <span class="ms-count">${V.slide + 1} sur ${ids.length}</span></div>
                ${V.slideTags && ppl.length ? `<div class="ms-faces">${ppl.map((id, k) => `<button type="button" class="ms-chip" data-act="person" data-id="${id}">${ppl.length > 3 && faces.length ? `<span class="ms-numb" aria-hidden="true">${k + 1}</span>` : ''}${ph(id, 56)}<span class="ms-cx"><span>${nameH(P(id))}</span>${rel(id) ? `<span class="ms-rel">${rel(id) === 'toi' ? 'toi' : esc(rel(id))}</span>` : ''}</span></button>`).join('')}</div>` : ''}
                </div></div>`;
            const im = $('.ms-pbox img', MAIN); const fit = () => fitPhoto(); if (im.complete) fit(); else im.addEventListener('load', fit, {once: true});
            if (live && auto) startSlide();
            if (live && S.voice && S.autoCaptions) { const b = $('[data-act=speak]', MAIN); if (b) setTimeout(() => speak(b.dataset.text, b), 350); }
        }
        function fitPhoto() {
            const st = $('.ms-stage', MAIN), box = $('.ms-pbox', MAIN), im = $('img', box || MAIN); if (!st || !box || !im) return;
            const nw = im.naturalWidth || 4, nh = im.naturalHeight || 3, W = st.clientWidth - (st.clientWidth < 640 ? 16 : 250), H = st.clientHeight - 20;
            const w = Math.max(80, Math.min(W, H * nw / nh)); box.style.width = w + 'px'; box.style.height = (w * nh / nw) + 'px';
        }
        function startSlide() { stopSlide(); const dur = S.slideSec * 1000, t0 = performance.now();
            const tick = () => { const k = (performance.now() - t0) / dur, pr = $('.ms-prog i', MAIN); if (pr) pr.style.width = Math.min(100, k * 100) + '%'; if (k >= 1) { V.slide++; render(false); return; } V.slideTimer = requestAnimationFrame(tick); };
            V.slideTimer = requestAnimationFrame(tick); }
        function stopSlide() { if (V.slideTimer) cancelAnimationFrame(V.slideTimer); V.slideTimer = 0; }

        /* ── Fiche simplifiée : son histoire en phrases ── */
        function bio(id) {
            const p = P(id), f = p.g === 'f', E2 = f ? 'e' : '', il = f ? 'Elle' : 'Il', elle = f ? 'elle' : 'il', out = [];
            if (firstOnly(p)) return [`${p.first} fait partie de la famille.`];
            const nm = nameT(p), b = p.birth, bp = p.bapt;
            if (b?.date || b?.place) out.push(`${nm} est né${E2}${b.date ? ' ' + leD(b.date) : ''}${b.place ? ' à ' + b.place : ''}.`);
            if (bp?.date || bp?.place) out.push(`${b?.date || b?.place ? il : nm} a été baptisé${E2}${bp.date ? ' ' + leD(bp.date) : ''}${bp.place ? ' à ' + bp.place : ''}.`);
            if (!out.length) out.push(`${nm} fait partie de la famille.`);
            const ps = visA(parentsOf(id)); if (ps.length) out.push(`${f ? 'C’est la fille' : p.g === 'm' ? 'C’est le fils' : 'C’est l’enfant'} de ${joinFr(ps.map(x => nameT(P(x))))}.`);
            if (p.job) { const job = p.job.charAt(0).toLowerCase() + p.job.slice(1); const age = ageAt(b?.date, todayD); if (!p.living) out.push(`${il} était ${job}.`); else if (age !== null && age >= 65) out.push(`${il} a été ${job}.`); else out.push(`${il} est ${job}.`); }
            famsOf(id).forEach(fm => {
                const sp = fm.a === id ? fm.b : fm.a; if (!sp || !vis(sp)) return; const md = fm.marr?.date, mp = fm.marr?.place;
                if (fm.marr && (md || mp)) out.push(`${md ? (md.about ? 'Vers ' + md.y : md.d ? 'Le ' + fmtD(md) : 'En ' + fmtD(md)) + (mp ? ', à ' + mp : '') + ', ' : mp ? 'À ' + mp + ', ' : ''}${elle} s’est marié${E2} avec ${nameT(P(sp))}.`);
                else if (fm.marr) out.push(`${il} s’est marié${E2} avec ${nameT(P(sp))}.`);
                else out.push(`${il} a vécu avec ${nameT(P(sp))}.`);
                const ch = visA(fm.c); if (ch.length) out.push(ch.length === 1 ? `Ils ont eu ${P(ch[0]).g === 'f' ? 'une fille' : P(ch[0]).g === 'm' ? 'un fils' : 'un enfant'}, ${P(ch[0]).first}.` : `Ils ont eu ${ch.length} enfants : ${joinFr(ch.map(x => P(x).first))}.`);
            });
            if (p.living) { const a = ageAt(b?.date || bp?.date, todayD); if (a !== null && a >= 0) out.push(`Aujourd’hui, ${elle} a ${a} an${a > 1 ? 's' : ''}.`); }
            else if (p.death?.date || p.death?.place) { const a = ageAt(b?.date || bp?.date, p.death.date); out.push(`${il} est décédé${E2}${p.death.date ? ' ' + leD(p.death.date) : ''}${p.death.place ? ' à ' + p.death.place : ''}${a !== null && a >= 0 && !p.death.date?.about && !(b?.date || bp?.date)?.about ? `, à ${a} an${a > 1 ? 's' : ''}` : ''}.`); }
            return out;
        }
        function rPerson() {
            const id = V.person, p = P(id); if (!p || !vis(id)) { back(); return; }
            const b = bio(id), r = rel(id), ps = visA(parentsOf(id)), sps = visA(spousesOf(id)), ch = visA(childrenOf(id)), sib = visA(siblingsOf(id)).filter(x => x !== id), f = p.g === 'f';
            const phs = visPhotos().filter(m => !m.doc && m.people.includes(id));
            const grp = (t, ids) => (ids.length ? `<div class="ms-sec"><h2>${t}</h2><div class="ms-fam">${ids.map(x => card(x, 'h', 'person')).join('')}</div></div>` : '');
            const relS = r ? (r === 'toi' ? 'C’est toi !' : `C’est ${r}.`) : '';
            const spT = sps.length ? (f ? (sps.length > 1 ? 'Ses maris' : 'Son mari') : p.g === 'm' ? (sps.length > 1 ? 'Ses femmes' : 'Sa femme') : 'Son conjoint') : '';
            const sibT = sib.length > 1 ? 'Ses frères et sœurs' : sib[0] && P(sib[0]).g === 'f' ? 'Sa sœur' : 'Son frère';
            MAIN.innerHTML = `<div class="ms-fiche"><div class="ms-fleft">${ph(id, 300, 'big')}${relLabel(id)}<h1 tabindex="-1">${nameH(p)}</h1><span class="ms-yr">${esc(years(p))}</span>
                ${speakBtn((relS ? nameT(p) + '. ' + relS + ' ' : '') + b.join(' '), 'Écouter son histoire')}
                <button type="button" class="ms-btn" data-act="totree" data-id="${id}"><span class="ms-ico" aria-hidden="true">🌳</span><span>Voir dans l’arbre</span></button></div>
                <div><p class="ms-bio">${b.map(esc).join(' ')}</p>
                ${phs.length ? `<div class="ms-sec"><h2><span aria-hidden="true">📷</span> Ses photos (${phs.length})</h2><div class="ms-mini">${phs.map(m => `<button type="button" class="ms-ph-tile" data-act="personslide" data-ph="${m.id}" data-id="${id}"><span class="ms-thumb">${img(m)}</span><span class="ms-cap"><b>${esc(m.title || 'Photo')}</b><span>${esc(photoWhen(m))}</span></span></button>`).join('')}</div></div>` : ''}
                ${grp(ps.length > 1 ? 'Ses parents' : 'Son parent', ps)}${grp(spT, sps)}${grp(ch.length > 1 ? 'Ses enfants' : 'Son enfant', ch)}${grp(sibT, sib)}
                </div></div>`;
        }

        /* ── Les personnes : par famille, par prénom, chercher ── */
        const sorted = () => [...D.P.values()].filter(p => vis(p.id)).sort((a, b) => norm(a.first + ' ' + a.last).localeCompare(norm(b.first + ' ' + b.last)));
        const pRow = p => { const r = rel(p.id), y = years(p); return `<button type="button" class="ms-prow" data-act="${V.choosing ? 'setviewer' : 'person'}" data-id="${p.id}">${ph(p.id, 76)}<span class="ms-tx"><span class="ms-nm">${nameH(p)}</span><span class="ms-yr">${esc(y)}${r ? `${y ? ' · ' : ''}<b>${r === 'toi' ? 'toi' : esc(r)}</b>` : ''}</span></span><span class="ms-go" aria-hidden="true">›</span></button>`; };
        function rPeople() {
            const tabs = [['family', '👪', 'Par famille'], ['letter', '🔤', 'Par prénom'], ['search', '🔍', 'Chercher']]; let body = '';
            if (V.peopleTab === 'family') {
                const g = {}; sorted().forEach(p => { const k = firstOnly(p) ? 'La famille d’aujourd’hui' : p.last ? 'Famille ' + lastShown(p) : 'Sans nom de famille'; (g[k] = g[k] || []).push(p); });
                const keys = Object.keys(g).sort((a, b) => g[b].length - g[a].length || a.localeCompare(b));
                body = keys.length ? keys.map(k => `<section class="ms-grp"><h2>${esc(k)} · ${plural(g[k].length, 'personne')}</h2>${g[k].sort((a, b) => byBirth(a.id, b.id)).map(pRow).join('')}</section>`).join('') : '<p class="ms-lead">Il n’y a encore personne à montrer.</p>';
            } else if (V.peopleTab === 'letter') {
                const all = sorted();
                if (!V.letter) { const L = {}; all.forEach(p => { const l = (norm(p.first)[0] || '?').toUpperCase(); L[l] = (L[l] || 0) + 1; });
                    body = `<p class="ms-lead">Touche la première lettre du prénom.</p><div class="ms-letters">${Object.keys(L).sort().map(l => `<button type="button" class="ms-btn" data-act="letter" data-l="${esc(l)}" aria-label="Lettre ${esc(l)}, ${plural(L[l], 'personne')}">${esc(l)}<small>${L[l]}</small></button>`).join('')}</div>`; }
                else body = `<h2 class="ms-h2">Les prénoms en « ${esc(V.letter)} »</h2>` + all.filter(p => (norm(p.first)[0] || '?').toUpperCase() === V.letter).map(pRow).join('');
            } else body = searchHTML();
            MAIN.innerHTML = `<div class="${V.peopleTab === 'search' ? 'ms-search' : ''}"><h1 class="ms-sr" tabindex="-1">Les personnes</h1>${V.choosing ? '<p class="ms-lead ms-strong">Touche la personne qui regarde.</p>' : ''}<div class="ms-seg ms-ptabs" role="tablist">${tabs.map(([k, i, t]) => `<button type="button" role="tab" aria-selected="${V.peopleTab === k}" class="${V.peopleTab === k ? 'is-active' : ''}" data-act="ptab" data-v="${k}"><span class="ms-em" aria-hidden="true">${i} </span>${t}</button>`).join('')}</div>${body}</div>`;
            if (live && V.peopleTab === 'search') setTimeout(() => { const i = $('.ms-q', MAIN); try { i?.focus({preventScroll: true}); i?.setSelectionRange(i.value.length, i.value.length); } catch (_) {} }, 30);
            else if (live) $('.ms-ptabs .is-active', MAIN)?.focus({preventScroll: true});
        }
        function searchHTML() {
            const phone = (MAIN.clientWidth || 900) < 600, keys = [['A', 'Z', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'], ['Q', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M'], ['W', 'X', 'C', 'V', 'B', 'N', '-']];
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            return `<div class="ms-srow"><label class="ms-sbox"><span aria-hidden="true">🔍</span><input class="ms-q" value="${esc(V.query)}" placeholder="Tape un prénom ou un nom" autocomplete="off" spellcheck="false" inputmode="${phone ? 'text' : 'none'}" aria-label="Prénom ou nom à chercher" data-ui-off></label>
                ${SR ? '<button type="button" class="ms-btn" data-act="dictate"><span class="ms-ico" aria-hidden="true">🎤</span><span class="ms-lbl">Dicter</span></button>' : ''}<button type="button" class="ms-btn" data-act="key" data-k="clear"><span class="ms-ico" aria-hidden="true">⌫</span><span class="ms-lbl">Tout effacer</span></button></div>
                <div class="ms-sres" aria-live="polite">${searchResults()}</div>
                <div class="ms-kb" role="group" aria-label="Clavier">${keys.map((r, i) => `<div class="ms-kbrow">${r.map(k => `<button type="button" class="ms-btn" data-act="key" data-k="${k}">${k}</button>`).join('')}${i === 2 ? '<button type="button" class="ms-btn w2" data-act="key" data-k=" ">Espace</button><button type="button" class="ms-btn w2" data-act="key" data-k="⌫" aria-label="Effacer une lettre">⌫ Effacer</button>' : ''}</div>`).join('')}</div>`;
        }
        function searchResults() {
            const q = norm(V.query).trim(); if (!q) return '<p class="ms-sempty">Tape les premières lettres, ou touche 🎤 Dicter et dis le prénom.</p>';
            const words = q.split(/\s+/), r = sorted().filter(p => { const h = norm(nameT(p)); return words.every(w => h.split(/[\s-]+/).some(x => x.startsWith(w))); });
            if (!r.length) return `<p class="ms-sempty">Personne ne s’appelle « ${esc(V.query.trim())} ». Vérifie l’orthographe.</p>`;
            return `<p class="ms-sempty ms-n">${plural(r.length, 'personne trouvée', 'personnes trouvées')}</p>` + r.slice(0, 60).map(pRow).join('');
        }
        function updSearch() { const r = $('.ms-sres', MAIN); if (r) r.innerHTML = searchResults(); const i = $('.ms-q', MAIN); if (i && i.value !== V.query) i.value = V.query; }
        function dictate(b) {
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) { msg('La dictée n’est pas possible sur cet appareil. Utilise le clavier.'); return; }
            try { const r = new SR(); r.lang = 'fr-FR'; r.interimResults = false; b.classList.add('is-on'); b.innerHTML = '<span class="ms-ico" aria-hidden="true">🎤</span><span class="ms-listen">J’écoute…</span>';
                r.onresult = ev => { V.query = ev.results[0][0].transcript; updSearch(); }; r.onend = () => { b.classList.remove('is-on'); b.innerHTML = '<span class="ms-ico" aria-hidden="true">🎤</span><span class="ms-lbl">Dicter</span>'; }; r.onerror = () => msg('Je n’ai pas bien entendu. Réessaie, ou utilise le clavier.'); r.start(); }
            catch (_) { msg('La dictée n’a pas marché. Utilise le clavier.'); }
        }

        /* ── Ce jour-là ── */
        function dayData() {
            const today = [], soon = []; if (!D) return {today, soon, photos: []};
            const vs = [...D.P.values()].filter(p => vis(p.id) && !firstOnly(p));
            const ahead = (m, d) => { let n = new Date(TY, m - 1, d, 12); const t0 = new Date(TY, TM - 1, TD, 12); if (n < t0) n = new Date(TY + 1, m - 1, d, 12); return {days: Math.round((n - t0) / 864e5), year: n.getFullYear()}; };
            vs.forEach(p => {
                const b = p.birth?.date; if (b && b.m && b.d && !b.about) {
                    if (b.m === TM && b.d === TD) today.push({k: p.living ? 'bday' : 'born', p, yrs: TY - b.y});
                    else { const a = ahead(b.m, b.d); if (a.days > 0 && a.days <= 45) soon.push({k: p.living ? 'bday' : 'born', p, days: a.days, age: a.year - b.y}); }
                }
                const d = p.death?.date; if (!p.living && d && d.m === TM && d.d === TD && !d.about) today.push({k: 'death', p, yrs: TY - d.y});
            });
            D.F.forEach(f => { const d = f.marr?.date; if (!d || !d.m || !d.d || d.about || !f.a || !f.b || !vis(f.a) || !vis(f.b) || firstOnly(P(f.a)) || firstOnly(P(f.b))) return;
                if (d.m === TM && d.d === TD) today.push({k: 'wed', f, yrs: TY - d.y}); else { const a = ahead(d.m, d.d); if (a.days > 0 && a.days <= 45 && P(f.a).living && P(f.b).living) soon.push({k: 'wed', f, days: a.days, age: a.year - d.y}); } });
            const photos = visPhotos().filter(m => !m.doc && m.date?.m === TM && !m.date.about);
            soon.sort((a, b) => a.days - b.days); today.sort((a, b) => (a.k === 'bday' ? 0 : 1) - (b.k === 'bday' ? 0 : 1));
            return {today, soon, photos};
        }
        const placeTxt = pl => (pl ? ` à ${esc(pl)}` : '');
        function rDay() {
            const {today, soon, photos} = dayData(), dd = `${day1(TD)} ${MOIS[TM - 1]}`;
            const weddingPhoto = f => visPhotos().find(m => !m.doc && m.date && f.marr?.date && m.date.y === f.marr.date.y && m.date.m === f.marr.date.m && m.people.includes(f.a) && m.people.includes(f.b));
            const c1 = e => {
                if (e.k === 'bday') { const p = e.p, r = rel(p.id); return `<div class="ms-dcard big">${ph(p.id, 150)}<div class="ms-tx"><b>🎂 ${r === 'toi' ? 'C’est ton anniversaire' : esc(p.first) + ' a ' + e.yrs + ' ans aujourd’hui'} !</b><span class="ms-when">${r && r !== 'toi' ? 'C’est ' + esc(r) + '. ' : ''}${p.g === 'f' ? 'Elle est née' : 'Il est né'} le ${esc(fmtD(p.birth.date))}${placeTxt(p.birth.place)}.</span><button type="button" class="ms-btn primary" data-act="person" data-id="${p.id}"><span class="ms-ico" aria-hidden="true">📖</span><span>Voir sa fiche</span></button></div></div>`; }
                if (e.k === 'wed') { const a = P(e.f.a), b = P(e.f.b), m = weddingPhoto(e.f); return `<div class="ms-dcard">${m ? `<span class="ms-dthumb">${img(m)}</span>` : ph(a.id, 110)}<div class="ms-tx"><b>💍 ${esc(a.first)} et ${esc(b.first)} se sont mariés il y a ${e.yrs} ans</b><span class="ms-when">Le ${esc(fmtD(e.f.marr.date))}${e.f.marr.place ? ', à ' + esc(e.f.marr.place) : ''}.</span>${m ? `<button type="button" class="ms-btn" data-act="personslide" data-ph="${m.id}" data-id="0"><span class="ms-ico" aria-hidden="true">📷</span><span>Voir la photo</span></button>` : ''}</div></div>`; }
                if (e.k === 'born') { const p = e.p, r = rel(p.id); return `<div class="ms-dcard">${ph(p.id, 110)}<div class="ms-tx"><b>🎂 ${esc(p.first)} aurait eu ${e.yrs} ans aujourd’hui</b><span class="ms-when">${r ? 'C’est ' + esc(r) + '. ' : ''}${p.g === 'f' ? 'Elle est née' : 'Il est né'} le ${esc(fmtD(p.birth.date))}${placeTxt(p.birth.place)}.</span><button type="button" class="ms-btn" data-act="person" data-id="${p.id}"><span class="ms-ico" aria-hidden="true">📖</span><span>Sa fiche</span></button></div></div>`; }
                const p = e.p; return `<div class="ms-dcard">${ph(p.id, 110)}<div class="ms-tx"><b>🕊 On se souvient de ${esc(p.first)}</b><span class="ms-when">${p.g === 'f' ? 'Elle nous a quittés' : 'Il nous a quittés'} le ${esc(fmtD(p.death.date))}, il y a ${e.yrs} ans.</span><button type="button" class="ms-btn" data-act="person" data-id="${p.id}"><span class="ms-ico" aria-hidden="true">📖</span><span>Sa fiche</span></button></div></div>`;
            };
            const soonRow = s => { if (s.k === 'wed') { const a = P(s.f.a), b = P(s.f.b); return `<button type="button" class="ms-prow" data-act="person" data-id="${a.id}">${ph(a.id, 76)}<span class="ms-tx"><span class="ms-nm">${s.days === 1 ? 'Demain' : 'Dans ' + s.days + ' jours'} : ${esc(a.first)} et ${esc(b.first)}</span><span class="ms-yr">${s.age} ans de mariage</span></span><span class="ms-go" aria-hidden="true">›</span></button>`; }
                const r = rel(s.p.id), me = r === 'toi', f = s.p.g === 'f';
                return `<button type="button" class="ms-prow" data-act="person" data-id="${s.p.id}">${ph(s.p.id, 76)}<span class="ms-tx"><span class="ms-nm">${s.days === 1 ? 'Demain' : 'Dans ' + s.days + ' jours'} : ${me ? 'ton anniversaire' : esc(s.p.first)}</span><span class="ms-yr">${s.k === 'born' ? `${f ? 'Elle' : 'Il'} aurait eu ${s.age} ans` : `${me ? 'Tu auras' : f ? 'Elle aura' : 'Il aura'} ${s.age} ans`}${r && !me ? ' · ' + esc(r) : ''}</span></span><span class="ms-go" aria-hidden="true">›</span></button>`; };
            MAIN.innerHTML = `<div><h1 class="ms-h2" tabindex="-1">Aujourd’hui, ${dd}</h1>
                ${today.length ? `<div class="ms-dlist">${today.map(c1).join('')}</div>` : `<p class="ms-lead">Pas d’anniversaire aujourd’hui.${soon.length ? ' Voici ce qui arrive bientôt.' : ''}</p>`}
                ${photos.length ? `<h2 class="ms-h2 ms-mt">📷 Des photos prises en ${MOIS[TM - 1]}</h2><div class="ms-mini">${photos.map(m => `<button type="button" class="ms-ph-tile" data-act="personslide" data-ph="${m.id}" data-id="0"><span class="ms-thumb">${img(m)}</span><span class="ms-cap"><b>${esc(m.title || 'Photo')}</b><span>${esc(photoWhen(m))}${m.date ? ' · il y a ' + (TY - m.date.y) + ' ans' : ''}</span></span></button>`).join('')}</div>` : ''}
                ${soon.length ? `<h2 class="ms-h2 ms-mt">🎈 Bientôt</h2><div class="ms-soon">${soon.slice(0, 8).map(soonRow).join('')}</div>` : ''}</div>`;
        }

        /* ── Code de sortie ── */
        function rCode() {
            MAIN.innerHTML = `<div class="ms-code"><h1 tabindex="-1">Tape le code pour quitter</h1><p>C’est la personne qui a préparé l’app qui le connaît. Ce n’est pas une protection : il évite seulement de sortir par erreur.</p>
                <div class="ms-dots" aria-live="polite" aria-label="${V.code.length} chiffre${V.code.length > 1 ? 's' : ''} tapé${V.code.length > 1 ? 's' : ''} sur 4">${[0, 1, 2, 3].map(i => `<i>${V.code[i] ? '●' : ''}</i>`).join('')}</div>
                <div class="ms-pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(k => `<button type="button" class="ms-btn" data-act="digit" data-k="${k}">${k}</button>`).join('')}<button type="button" class="ms-btn txt" data-act="digit" data-k="⌫">⌫ Effacer</button><button type="button" class="ms-btn" data-act="digit" data-k="0">0</button><button type="button" class="ms-btn txt" data-act="home">Rester</button></div></div>`;
            if (live) setTimeout(() => $('.ms-pad .ms-btn', MAIN)?.focus({preventScroll: true}), 30);
        }
        function digit(k) {
            if (k === '⌫') V.code = V.code.slice(0, -1); else if (V.code.length < 4) V.code += k; rCode();
            if (V.code.length === 4) { if (checkCode(V.code, S.codeHash)) { V.code = ''; exit(); } else setTimeout(() => { V.code = ''; rCode(); $('.ms-dots', MAIN)?.classList.add('bad'); msg('Ce n’est pas le bon code. Demande à la personne qui a préparé l’app.'); }, 250); }
        }

        /* ── Voix ── */
        let speaking = null;
        const speakBtn = (text, label = 'Écouter') => (S.voice && TTS ? `<button type="button" class="ms-btn" data-act="speak" data-text="${esc(text)}" data-label="${esc(label)}"><span class="ms-ico" aria-hidden="true">🔊</span><span>${esc(label)}</span></button>` : '');
        function setSpeakBtn(b, on) { if (!b || !b.isConnected) return; b.classList.toggle('is-on', on); b.innerHTML = on ? '<span class="ms-ico" aria-hidden="true">⏹</span><span>Arrêter</span>' : `<span class="ms-ico" aria-hidden="true">🔊</span><span>${esc(b.dataset.label || 'Écouter')}</span>`; }
        function speak(text, btn) {
            if (!TTS) { msg('La lecture à voix haute n’est pas possible sur cet appareil.'); return; }
            try {
                if (speaking) { speechSynthesis.cancel(); const was = speaking; speaking = null; setSpeakBtn(was, false); if (was === btn) return; }
                const u = new SpeechSynthesisUtterance(text); u.lang = 'fr-FR'; u.rate = (E.rate || 90) / 100;
                const vs = frVoices(), v = vs.find(x => x.voiceURI === E.voiceName || x.name === E.voiceName) || vs.find(x => /fr-FR/i.test(x.lang)) || vs[0]; if (v) u.voice = v;
                u.onend = u.onerror = () => { if (speaking === btn) { speaking = null; setSpeakBtn(btn, false); } };
                speaking = btn; setSpeakBtn(btn, true); speechSynthesis.speak(u);
            } catch (_) { msg('La lecture à voix haute n’a pas marché. Réessaie.'); }
        }
        function stopSpeak() { try { if (speaking) { speechSynthesis.cancel(); setSpeakBtn(speaking, false); speaking = null; } } catch (_) {} }
        /* ── Message en bas à gauche, en grand, 6 s (H7) ── */
        let msgT = 0;
        function msg(t) { MSG.hidden = false; MSG.innerHTML = `${esc(t)}<span class="ms-msgbar"></span>`; clearTimeout(msgT); const b = $('.ms-msgbar', MSG); if (b.animate && !E.calm) b.animate([{width: '100%'}, {width: '0%'}], {duration: 6000, easing: 'linear'}); msgT = setTimeout(() => { MSG.hidden = true; }, 6000); }

        /* ── Toucher ── */
        function onClick(e) {
            const b = e.target.closest('[data-act]'); if (!b || !GP.contains(b)) return; const a = b.dataset.act, id = Number(b.dataset.id) || 0; armIdle();
            switch (a) {
            case 'back': back(); break;
            case 'home': goHome(); break;
            case 'retry': start(); break;
            case 'tile': { const to = b.dataset.to === 'photo' ? 'photos' : b.dataset.to; if (to === 'tree') V.center = 0; if (to === 'photos') V.slideList = null; if (to === 'people') { V.choosing = false; V.letter = null; } go(to); break; }
            case 'who': go('who'); break;
            case 'setviewer': V.viewer = id && P(id) ? id : 0; if (full) setDev({viewer: V.viewer || undefined}); nearCache = null; V.choosing = false; V.stack = []; V.screen = 'home'; V.center = 0; render(true); msg(V.viewer ? `Bonjour ${P(V.viewer).first} ! L’app dira « ta mère », « ton petit-fils »…` : 'D’accord. L’app ne dira pas les liens de famille.'); break;
            case 'chooseother': V.choosing = true; go('people', {state: {peopleTab: 'family', letter: null}}); break;
            case 'center': if (id === V.center) return; V.stack.push(snapshot()); V.center = id; rTree(); focusMain(); break;
            case 'up': { const ps = visA(parentsOf(V.center)); if (ps.length) { V.stack.push(snapshot()); V.center = ps.find(x => P(x).g === 'm') || ps[0]; rTree(); focusMain(); } break; }
            case 'down': { const ch = visA(childrenOf(V.center)); if (ch.length) { V.stack.push(snapshot()); V.center = ch[0]; rTree(); focusMain(); } break; }
            case 'zin': if (V.zoom < 3) { V.zoom++; rTree(); } else msg('C’est déjà le plus gros.'); break;
            case 'zout': if (V.zoom > 1) { V.zoom--; rTree(); } else msg('On voit déjà le plus de monde possible.'); break;
            case 'person': V.person = id; go('person', {forcePush: true}); break;
            case 'totree': V.center = id; go('tree'); break;
            case 'speak': speak(b.dataset.text, b); break;
            case 'slideshow': V.slideList = null; V.slide = 0; V.auto = S.slideAuto; go('slides'); break;
            case 'openslide': V.slideList = photoList().map(m => m.id); V.slide = Number(b.dataset.i) || 0; V.auto = S.slideAuto; go('slides'); break;
            case 'personslide': { const pid = id, l = pid ? visPhotos().filter(m => !m.doc && m.people.includes(pid)).map(m => m.id) : [Number(b.dataset.ph)]; V.slideList = l; V.slide = Math.max(0, l.indexOf(Number(b.dataset.ph))); V.auto = false; go('slides', {forcePush: true}); break; }
            case 'pfilter': V.photoFilter = b.dataset.v; rPhotos(); break;
            case 'prev': stopSpeak(); V.slide--; rSlides(); break;
            case 'next': stopSpeak(); V.slide++; rSlides(); break;
            case 'tags': V.slideTags = !V.slideTags; stopSlide(); rSlides(); break;
            case 'auto': V.auto = !V.auto; stopSlide(); rSlides(); break;
            case 'ptab': V.peopleTab = b.dataset.v; V.letter = null; rPeople(); break;
            case 'letter': V.stack.push(snapshot()); V.letter = b.dataset.l; rPeople(); break;
            case 'key': { const k = b.dataset.k; if (k === '⌫') V.query = V.query.slice(0, -1); else if (k === 'clear') V.query = ''; else V.query += V.query ? k.toLowerCase() : k; updSearch(); break; }
            case 'dictate': dictate(b); break;
            case 'digit': digit(b.dataset.k); break;
            case 'hold': if (b.matches('.ms-hold')) { const h = $('.ms-hint', b); if (h) h.textContent = `Garde le doigt appuyé ${String(S.holdSec).replace('.', ',')} secondes`; } break;
            default: break;
            }
        }
        const focusMain = () => { if (live) setTimeout(() => $('.ms-tmain h1', MAIN)?.focus({preventScroll: true}), 20); };
        function onKey(e) {
            if (!live || (!full && !GP.contains(document.activeElement))) return;
            const outside = full && !GP.contains(e.target);
            if (outside) e.stopPropagation(); // les raccourcis de l'app normale n'entendent rien pendant le mode
            armIdle(); const inInput = e.target.tagName === 'INPUT';
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (V.screen !== 'home') back(); return; }
            if (e.key === 'Tab' && full) { const list = $$('button:not([disabled]), input, [tabindex="0"]', GP).filter(x => x.offsetParent || x.getClientRects().length); if (list.length) { const i = list.indexOf(document.activeElement); if (i < 0 || (e.shiftKey && i === 0) || (!e.shiftKey && i === list.length - 1)) { e.preventDefault(); (e.shiftKey ? list[list.length - 1] : list[0]).focus(); } } return; }
            if (V.screen === 'tree' && !inInput) {
                const m = {ArrowUp: 'up', ArrowDown: 'down'}[e.key];
                if (m) { e.preventDefault(); $(`[data-act=${m}]`, MAIN)?.click(); return; }
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const sib = visA(siblingsOf(V.center)), i = sib.indexOf(V.center), j = i + (e.key === 'ArrowRight' ? 1 : -1); e.preventDefault(); if (sib[j]) { V.stack.push(snapshot()); V.center = sib[j]; rTree(); focusMain(); } else msg(e.key === 'ArrowRight' ? 'Pas de frère ou de sœur après.' : 'Pas de frère ou de sœur avant.'); return; }
                if (e.key === '+' || e.key === '=') { e.preventDefault(); if (V.zoom < 3) { V.zoom++; rTree(); focusMain(); } return; }
                if (e.key === '-') { e.preventDefault(); if (V.zoom > 1) { V.zoom--; rTree(); focusMain(); } return; }
            }
            if (V.screen === 'slides' && !inInput) { if (e.key === 'ArrowLeft') { e.preventDefault(); stopSpeak(); V.slide--; rSlides(); return; } if (e.key === 'ArrowRight') { e.preventDefault(); stopSpeak(); V.slide++; rSlides(); return; } }
            if (V.screen === 'code' && /^[0-9]$/.test(e.key)) { e.preventDefault(); digit(e.key); return; }
            if (V.screen === 'code' && e.key === 'Backspace') { e.preventDefault(); digit('⌫'); return; }
            if (outside && /^(Arrow|Enter$| $)/.test(e.key)) { e.preventDefault(); $('button', MAIN)?.focus(); return; }
            if (!inInput && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key) && GP.contains(document.activeElement)) {
                const list = $$('button:not([disabled])', GP).filter(x => x.getClientRects().length), i = list.indexOf(document.activeElement);
                if (i >= 0) { e.preventDefault(); const n = list[(i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length]; n.focus(); n.scrollIntoView({block: 'nearest'}); }
            }
        }
        /* cadre photo : après N minutes sans toucher l'écran, le diaporama défile tout seul */
        let idleT = 0;
        function armIdle() { clearTimeout(idleT); if (!live || !full || !S.idleFrame) return; idleT = setTimeout(() => { if (V.screen !== 'slides' && V.screen !== 'code' && visPhotos().length) { V.slideList = null; V.slide = 0; V.auto = true; go('slides'); } }, S.idleMin * 60000); }
        if (live) {
            GP.addEventListener('click', onClick);
            GP.addEventListener('input', e => { if (e.target.matches('.ms-q')) { V.query = e.target.value; updSearch(); } });
            GP.addEventListener('contextmenu', e => e.preventDefault()); // pas de clic droit
            GP.addEventListener('dragstart', e => e.preventDefault()); // pas de glisser
            GP.addEventListener('pointerdown', armIdle);
            (full ? document : GP).addEventListener('keydown', onKey, true);
            // les raccourcis de l'app normale n'entendent pas les touches du mode simple
            ['keydown', 'keyup', 'keypress'].forEach(t => GP.addEventListener(t, e => e.stopPropagation()));
        }
        const onResize = () => { if (V.screen === 'tree') rTree(); if (V.screen === 'slides') fitPhoto(); };
        window.addEventListener('resize', onResize);
        function start(screen) {
            const ready = D && !opts.reload;
            if (!ready) { V.screen = 'loading'; render(false); }
            const after = () => {
                V.stack = []; nearCache = null; V.zoom = 3;
                if (screen) V.screen = screen;
                else V.screen = live && full && (S.askViewer || (!S.notInTree && !viewerId())) ? 'who' : 'home';
                if (V.screen === 'person') V.person = opts.person || viewerId();
                render(live); armIdle();
            };
            if (ready) { after(); return Promise.resolve(); }
            return loadData(!!opts.reload).then(after).catch(err => { console.warn(err); V.screen = 'error'; render(false); });
        }
        return {
            root: GP, V, start, render: () => render(false), go, back, goHome, msg,
            setSettings(st) { S = clean(st); nearCache = null; if (V.screen === 'loading' || V.screen === 'error') return; render(false); },
            show(screen) { stopSlide(); V.stack = []; if (screen === 'person') V.person = viewerId() || V.person; if (screen === 'tree') V.center = 0; V.screen = screen; render(false); },
            destroy() { stopSlide(); stopSpeak(); clearTimeout(idleT); clearTimeout(msgT); window.removeEventListener('resize', onResize); (full ? document : GP).removeEventListener('keydown', onKey, true); host.innerHTML = ''; },
            bio: id => bio(id), rel: t => rel(t), vis, viewerId, dayData, visPhotos,
        };
    }

    /* filtres de daltonisme propres au mode simple (même correction que l'app : app-access.js, fixMatrix) */
    function ensureCbFilter(k) {
        const id = `ms-cb-${k}`; if (document.getElementById(id)) return;
        let svg = document.getElementById('ms-cb-svg');
        if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'ms-cb-svg'; svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden'); document.body.appendChild(svg); }
        let m = null; try { m = k === 'achroma' ? [[0.2126, 0.7152, 0.0722], [0.2126, 0.7152, 0.0722], [0.2126, 0.7152, 0.0722]] : ext.access?.fixMatrix?.(k, 0.8); } catch (_) { m = null; }
        if (!m) return;
        const vals = [...m.map(r => [...r.map(x => +x.toFixed(6)), 0, 0]), [0, 0, 0, 1, 0]].map(r => r.join(' ')).join(' ');
        svg.insertAdjacentHTML('beforeend', `<filter id="${id}" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="${vals}"/></filter>`);
    }

    /* ═════════════════════════ Plein écran : ouvrir et quitter ═════════════════════════ */
    let FULL = null, keptInert = [], addedKiosk = false;
    function open({screen = '', from = ''} = {}) {
        if (FULL) return FULL;
        const host = document.createElement('div'); host.id = 'ms-root'; host.className = 'ms-host';
        document.body.appendChild(host);
        keptInert = [...document.body.children].filter(el => el !== host && !el.hasAttribute('inert') && el.tagName !== 'SCRIPT');
        keptInert.forEach(el => el.setAttribute('inert', ''));
        document.documentElement.classList.add('ms-open');
        if (!document.body.classList.contains('is-kiosk')) { document.body.classList.add('is-kiosk'); addedKiosk = true; } else addedKiosk = false;
        $$('dialog[open]').forEach(d => { try { d.close(); } catch (_) {} });
        guard.on = true; guard.blocked = [];
        FULL = makeMode(host, {full: true, reload: true, onExit: () => close(true)});
        FULL.start(screen || '');
        FULL.from = from;
        return FULL;
    }
    function close(fromMode = false) {
        if (!FULL) return;
        FULL.destroy(); document.getElementById('ms-root')?.remove(); FULL = null;
        keptInert.forEach(el => el.removeAttribute('inert')); keptInert = [];
        document.documentElement.classList.remove('ms-open', 'ms-own-cb');
        if (addedKiosk) document.body.classList.remove('is-kiosk'); addedKiosk = false;
        guard.on = false; const later = guard.deferred.splice(0); later.forEach(fn => { try { fn(); } catch (_) {} });
        if (fromMode) toast('Mode simple quitté. Tu retrouves l’app normale.');
        if (location.hash === '#mode-simple') { try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {} }
        refreshEntry();
    }
    /** l'entrée : la première fois, « Préparer le mode simple » (les réglages) ; ensuite, il démarre tout de suite */
    function enter() {
        const s = read();
        if (!s.ready) { goSettings(); toast('Première fois : vérifie ces réglages, puis « ▶ Ouvrir le mode simple ».'); return; }
        open();
    }
    async function goSettings() {
        try { sessionStorage.setItem('lcnda-a11y-tab', 'simple'); } catch (_) {}
        const st = A().state; if (!st || !A().setModule) return;
        st.maintenanceTab = 'accessibilite'; await A().setModule('maintenance');
    }
    function markReady() { const s = read(); if (!s.ready) write({...s, ready: true}); }

    /* ═════ Le bouton 🧓 en haut à droite (à côté du 🔒), montré si « Pour tout le monde » est coché ═════ */
    function refreshEntry() {
        const s = read(); let b = document.getElementById('mode-simple-open');
        if (!b) { const k = document.getElementById('kiosk-toggle'); if (!k) return; b = document.createElement('button'); b.type = 'button'; b.id = 'mode-simple-open'; b.className = 'screen-tool ms-entry'; k.after(b); }
        b.innerHTML = '<span aria-hidden="true">🧓</span><span class="ms-entry-t">Mode simple</span>';
        b.title = 'Mode simple : montrer l’arbre à quelqu’un qui n’est pas à l’aise avec l’ordinateur (gros boutons, rien à modifier)';
        b.setAttribute('aria-label', 'Mode simple');
        b.hidden = !s.forAll;
    }
    document.addEventListener('click', e => {
        if (e.target.closest?.('#mode-simple-open, [data-ms-open]')) { e.preventDefault(); const b = e.target.closest('[data-ms-open]'); if (b?.dataset.msOpen === 'now') { markReady(); open(); } else enter(); }
        else if (e.target.closest?.('[data-ms-prepare]')) { e.preventDefault(); goSettings(); }
    });
    addEventListener('storage', e => { if (e.key === KEY || e.key === LOCAL) refreshEntry(); });
    addEventListener('hashchange', () => { if (location.hash === '#mode-simple') { if (!FULL) open(); } });

    /* ═════ Widget du tableau de bord ═════ */
    ext.dashboard = ext.dashboard || {};
    ext.dashboard.mode_simple_widget = {load: () => null, render: (index, widget, span) => {
        const body = `<div class="ms-widget"><span class="ms-widget-ico" aria-hidden="true">🧓</span><div><p>Pour montrer l’arbre à quelqu’un qui n’est pas à l’aise avec l’ordinateur : de très gros boutons, seulement l’arbre, les photos et les fiches, et rien qu’on puisse modifier par erreur.</p>
            <div class="page-actions"><button type="button" class="button" data-ms-open>▶ Démarrer le mode simple</button><button type="button" class="button secondary" data-ms-prepare>⚙️ Préparer</button></div></div></div>`;
        return A().card ? A().card(index, 'Mode simple', '', body, span) : `<section class="card ${span}">${body}</section>`;
    }};

    /* ═════════════════════════ Réglages : Maintenance → Accessibilité → 🧓 Mode simple ═════════════════════════ */
    const PRESETS_READY = [
        {k: 'legible', name: 'Très lisible', hint: 'Atkinson Hyperlegible, texte 30 px, très gros boutons', set: {font: 'Atkinson Hyperlegible', fs: 30, btnH: 84, caseS: 96, theme: 'light', contrast: false}},
        {k: 'sepia', name: 'Sépia doux', hint: 'Fond crème, police de livre, doux pour les yeux', set: {theme: 'sepia', font: 'Georgia', fs: 26, contrast: false}},
        {k: 'night', name: 'Nuit', hint: 'Fond sombre et texte clair, n’éblouit pas le soir', set: {theme: 'dark', contrast: false}},
        {k: 'contrast', name: 'Contraste fort', hint: 'Noir sur blanc pur, traits épais, 21:1', set: {contrast: true, theme: 'light', link: {contrast: false}}},
        {k: 'proto', name: 'Comme le prototype', hint: 'Les réglages du prototype que tu as aimé', set: {theme: 'light', font: '', fs: 24, btnH: 72, caseS: 80, gap: 22, contrast: false, colors: {bg: null, ink: null, btn: null, tree: null, photo: null, people: null, day: null}}},
    ];
    const LOOK_KEYS = ['theme', 'contrast', 'cb', 'calm', 'colors', 'fs', 'btnH', 'caseS', 'gap', 'font', 'lnCaps'];
    const applyPreset = (s, set) => { const o = clone(s); Object.entries(set).forEach(([k, v]) => { o[k] = v && typeof v === 'object' && !Array.isArray(v) ? {...o[k], ...v} : v; }); return clean(o); };
    const presetOn = (s, set) => Object.entries(set).every(([k, v]) => (v && typeof v === 'object' ? Object.entries(v).every(([x, y]) => s[k][x] === y) : s[k] === v));
    const presets = () => { const l = lsGet(PKEY); return Array.isArray(l) ? l.filter(x => x && typeof x.name === 'string' && x.data && typeof x.data === 'object') : []; };
    const savePresets = l => lsSet(PKEY, l.slice(0, 50));
    const TAB_KEY = 'lcnda-a11y-tab';
    const OPEN_KEY = 'lcnda-mode-simple-open'; // sections ouvertes (cet ordinateur)
    const SECTIONS = [['who', '👋', 'Qui regarde'], ['colors', '🎨', 'Couleurs'], ['sizes', '📏', 'Tailles'], ['font', '🔤', 'Police'], ['voice', '🔊', 'Voix'], ['show', '👁', 'Ce qu’on montre'], ['slides', '🖼', 'Diaporama et cadre photo'], ['exit', '🔒', 'Sortie et démarrage']];
    const isOpenSec = k => { const o = lsGet(OPEN_KEY); return o && typeof o === 'object' && k in o ? !!o[k] : ['who', 'colors'].includes(k); };
    let PV = null, TRY = null, pvScreen = 'home';
    function why(t) { return `<p class="ms-why"><b>Pourquoi ?</b> ${t}</p>`; }
    const tg = (attr, on, label, sub = '') => `<label class="ui-toggle ms-tg"><input type="checkbox" ${attr} ${on ? 'checked' : ''}><i></i><span>${label}${sub ? `<small>${sub}</small>` : ''}</span></label>`;
    const segH = (k, val, opts) => `<div class="segmented ms-segset" role="radiogroup">${opts.map(([v, t]) => `<button type="button" class="${String(val) === String(v) ? 'is-active' : ''}" data-ms-set="${k}" data-v="${esc(v)}" aria-pressed="${String(val) === String(v)}">${t}</button>`).join('')}</div>`;
    const rangeH = (k, label, val, min, max, step, unit, def) => `<label class="ms-range"><span class="ms-sr">${esc(label)}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-ms-range="${k}" data-unit="${unit}" data-default="${def}" aria-label="${esc(label)}"></label>`;
    const line = (label, body, cls = '') => `<div class="ms-line ${cls}"><div class="ms-lab">${label}</div><div class="ms-ctl">${body}</div></div>`;
    /** C2 : la pastille montre la couleur qui s'applique ; « Aucune » (ou la couleur du thème) = revenir à celle du thème */
    function colorCtl(k, label, s, pal) { const v = s.colors[k]; return `<div class="ms-color"><span class="ms-clab">${label}</span><span data-ms-color-slot="${k}" data-v="${esc(v || pal[k])}"></span><small class="ms-cv">${v ? 'Ta couleur · ' + esc(v.toUpperCase()) : 'Celle du thème'}</small></div>`; }

    function settingsHtml(s) {
        const ap = appA11y(), e = eff(s), pal = e.pal, rows = contrastRows(pal), bad = rows.filter(r => r.r < 7);
        const apCb = {none: 'Normal', protan: 'Protanopie', deutan: 'Deutéranopie', tritan: 'Tritanopie', achroma: 'Achromatopsie', protanomaly: 'Protanomalie', deuteranomaly: 'Deutéranomalie', tritanomaly: 'Tritanomalie'};
        const linkRow = (k, ico, label, appTxt, own) => `<div class="ms-link"><div class="ms-link-l"><b><span aria-hidden="true">${ico}</span> ${label}</b><span class="ui-badge is-gray">App : ${esc(appTxt)}</span></div><div class="ms-link-r">${tg(`data-ms-link="${k}"`, s.link[k], s.link[k] ? 'Pareil que l’app' : 'Propre au mode simple')}${s.link[k] ? '' : `<div class="ms-own">${own}</div>`}</div></div>`;
        const sec = (k, n, body, summary) => { const [, ico, t] = SECTIONS.find(x => x[0] === k); const o = isOpenSec(k); return `<section class="ms-sec-s ${o ? 'is-open' : ''}" id="ms-s-${k}"><button type="button" class="ms-sec-h" data-ms-sec="${k}" aria-expanded="${o}"><span class="ms-num">${String(n).padStart(2, '0')}</span><span aria-hidden="true">${ico}</span><span class="ms-sec-t">${t}</span><span class="ms-sec-sum">${summary}</span><span class="ms-car" aria-hidden="true">${o ? '▴' : '▾'}</span></button>${o ? `<div class="ms-sec-b">${body}</div>` : ''}</section>`; };
        const vp = D && !s.notInTree ? (P(s.viewer) || P(D.start) || null) : null;
        const voices = TTS ? frVoices() : [];
        const branches = branchList();
        const tileName = {tree: ['🌳', 'L’arbre'], photo: ['📷', 'Les photos'], people: ['👥', 'Les personnes'], day: ['🎂', 'Ce jour-là']};
        const hidden = s.hiddenPhotos.map(id => D?.M.get(id)).filter(Boolean);
        return `<div class="ms-set">
        <div class="ms-set-main">
        <section class="maintenance-panel ms-intro"><span class="ms-intro-ico" aria-hidden="true">🧓</span><div><h3>Le mode simple ${UI().badge ? UI().badge('Nouveau', 'blue') : ''}</h3>
            <p>De très gros boutons pour regarder l’arbre, les photos et les fiches, sans rien pouvoir modifier ni supprimer par erreur — pour une personne âgée, un enfant, ou n’importe qui qui veut juste regarder.</p>
            <div class="ms-intro-acts"><button type="button" class="button" data-ms-open="now">▶ Ouvrir le mode simple</button><button type="button" class="button secondary" data-ms-try>${TRY ? '✕ Fermer l’essai' : '👁 Essayer ici'}</button></div>
            <p class="muted ms-small">On le trouve aussi avec le bouton « 🧓 Mode simple » en haut de l’app et sur le tableau de bord.</p>
            <div class="ms-try" data-ms-try-box ${TRY ? '' : 'hidden'}></div></div></section>

        <section class="maintenance-panel"><h3><span aria-hidden="true">🔗</span> Tes réglages d’accessibilité valent aussi ici</h3>
            ${UI().notice ? UI().notice('info', 'Ce que tu as réglé dans « ♿ Toute l’app » (daltonisme, contraste, taille du texte, mouvements, voix) s’applique aussi au mode simple. Pour un réglage différent, choisis « Propre au mode simple ».') : ''}
            <p class="ms-goapp"><button type="button" class="link-button" data-ms-tab="app">♿ Voir les réglages de toute l’app</button></p>
            ${linkRow('cb', '🎨', 'Daltonisme', apCb[ap.cb] || 'Normal', `<select data-ms-sel="cb" aria-label="Daltonisme propre au mode simple">${['none', 'protan', 'deutan', 'tritan', 'achroma'].map(k => `<option value="${k}" ${s.cb === k ? 'selected' : ''}>${apCb[k]}</option>`).join('')}</select>`)}
            ${linkRow('contrast', '🌓', 'Contraste', ap.contrast ? 'élevé' : 'normal', tg('data-ms-bool="contrast"', s.contrast, 'Contraste fort dans le mode simple'))}
            ${linkRow('size', '🔤', 'Taille du texte', ap.size + ' %', '<span class="muted">La taille de la section « Tailles » s’applique telle quelle.</span>')}
            ${linkRow('motion', '🎞', 'Réduire les mouvements', ap.calm ? 'oui' : 'non', tg('data-ms-bool="calm"', s.calm, 'Moins d’animations dans le mode simple'))}
            ${linkRow('voice', '🔊', 'Lecture à voix haute', 'vitesse ' + ap.rate + ' %', '<span class="muted">La voix et la vitesse de la section « Voix » s’appliquent.</span>')}
        </section>

        <section class="maintenance-panel"><h3><span aria-hidden="true">✨</span> Ensembles prêts</h3><p class="muted">Un clic applique tout d’un coup : couleurs, police et tailles. Tu peux ensuite retoucher chaque réglage plus bas.</p>
            <div class="ms-ready">${PRESETS_READY.map(p => { const on = presetOn(s, p.set); return `<div class="ms-ready-c ${on ? 'is-on' : ''}"><span class="ms-ready-pv" data-ms-pv="${p.k}" aria-hidden="true"></span>${on ? '<span class="ms-ready-ok">✓ Appliqué</span>' : ''}<button type="button" class="ms-ready-b" data-ms-ready="${p.k}" aria-pressed="${on}"><b>${esc(p.name)}</b><small>${esc(p.hint)}</small></button></div>`; }).join('')}</div>
            <div data-ms-presets></div></section>

        ${sec('who', 1, `${line('Personne qui regarde', `<span class="pk-lab ms-sr">Personne qui regarde</span>${A().pickerField ? A().pickerField({name: '', hiddenName: false, kind: 'person', value: s.viewer || null}) : ''}
            ${tg('data-ms-bool="notInTree"', s.notInTree, 'Je ne suis pas dans l’arbre', 'L’app dit alors les noms, sans « ta mère » ni « ton petit-fils ».')}
            ${why(`Les liens s’écrivent en clair pour ${vp ? esc(vp.first) : 'cette personne'} : « ta mère », « ton arrière-petit-fils ». On se repère mieux avec « ta mère » qu’avec un nom.`)}`)}
            ${line('À chaque ouverture', `${tg('data-ms-bool="askViewer"', s.askViewer, 'Demander « Qui regarde ? »', 'Quand plusieurs personnes se servent de la même tablette.')}${why('Chacun touche sa photo, et les liens s’écrivent pour lui.')}`)}`,
            esc(s.notInTree ? 'Personne de l’arbre' : vp ? `${vp.first} ${String(vp.last).toUpperCase()}` : 'La personne de départ'))}

        ${sec('colors', 2, `${line('Thème', `${segH('theme', s.theme, [['light', '☀️ Clair'], ['sepia', '📜 Sépia'], ['dark', '🌙 Sombre']])}${why('Le sépia est plus doux pour les yeux fatigués ; le sombre n’éblouit pas le soir.')}`)}
            ${e.contrast ? `<div class="ms-line"><div class="ms-lab"></div><div class="ms-ctl">${UI().notice ? UI().notice('info', 'Le contraste fort est allumé : les couleurs choisies ici reviendront quand tu l’éteindras.') : ''}</div></div>` : ''}
            ${line('Fond, texte et boutons', `<div class="ms-colors">${colorCtl('bg', 'Fond', s, PAL[s.theme])}${colorCtl('ink', 'Texte et traits', s, PAL[s.theme])}${colorCtl('btn', 'Boutons principaux', s, PAL[s.theme])}</div>${why('Une couleur de fond douce et un texte très foncé fatiguent moins.')}`)}
            ${line('Les gros boutons', `<div class="ms-colors">${colorCtl('tree', '🌳 L’arbre', s, PAL[s.theme])}${colorCtl('photo', '📷 Les photos', s, PAL[s.theme])}${colorCtl('people', '👥 Les personnes', s, PAL[s.theme])}${colorCtl('day', '🎂 Ce jour-là', s, PAL[s.theme])}</div>${why('Chaque gros bouton garde sa couleur partout : on se repère sans lire.')}`)}
            ${line('Lisible ?', `<div class="ms-checks" data-ms-checks>${checksHtml(pal)}</div>${why('On vise 7:1 au moins (le plus haut niveau des règles d’accessibilité). « Corriger » garde la teinte et change seulement sa clarté.')}`)}`,
            `${{light: '☀️ Clair', sepia: '📜 Sépia', dark: '🌙 Sombre'}[s.theme]} · ${bad.length ? '⚠️ à corriger' : '✓ très lisible'}`)}

        ${sec('sizes', 3, `${line('Texte', `${rangeH('fs', 'Taille du texte', s.fs, 22, 40, 1, 'px', 24)}<p class="ms-help">${s.link.size ? `× ${ap.size} % (taille du texte de l’app) = <b>${e.fs} px</b> à l’écran. ` : ''}Jamais moins de 22 px.</p>${why('À 24 px on lit sans lunettes à 50 cm ; à 30 px et plus, de loin.')}`)}
            ${line('Boutons', `${rangeH('btnH', 'Hauteur des boutons', s.btnH, 64, 120, 2, 'px', 72)}${why('Un doigt qui tremble touche facilement un bouton de 72 px ou plus (64 px au moins).')}`)}
            ${line('Cases de l’arbre', `${rangeH('caseS', 'Photo des cases de l’arbre', s.caseS, 56, 140, 2, 'px', 80)}${why('La photo de chaque case : plus grande, on se reconnaît plus vite.')}`)}
            ${line('Espace entre les boutons', `${rangeH('gap', 'Espace entre les boutons', s.gap, 10, 44, 1, 'px', 22)}${why('Plus d’espace : on touche moins souvent le bouton d’à côté.')}`)}`,
            `Texte ${e.fs} px · boutons ${e.btnH} px`)}

        ${sec('font', 4, `${line('Police', `<div class="ms-font"><span class="ms-font-cur" style="font-family:${esc(fontStack(s.font))}">${esc(fontLabel(s.font))} — Louise CHASTANG, ta mère</span><button type="button" class="button secondary" data-ms-font>🔤 Changer de police…</button></div>
                <div class="ms-font-quick">${['Atkinson Hyperlegible', 'Luciole', 'OpenDyslexic', ''].map(f => `<button type="button" class="button small ${s.font === f ? '' : 'secondary'}" data-ms-set="font" data-v="${esc(f)}" style="font-family:${esc(fontStack(f))}">${esc(f ? fontLabel(f) : 'Inter')}</button>`).join('')}</div>
                ${why('Atkinson Hyperlegible et Luciole sont dessinées pour les personnes qui voient mal : les lettres qui se ressemblent (I l 1, O 0, b d) ne se confondent pas. OpenDyslexic aide certaines personnes dyslexiques. Atkinson et OpenDyslexic sont rangées dans l’app ; Luciole est prise si elle est sur l’ordinateur, sinon une police proche (Atkinson Hyperlegible).')}`)}
            ${line('Noms de famille', `${segH('lnCaps', s.lnCaps ? 'on' : 'off', [['on', 'CHASTANG'], ['off', 'Chastang']])}${why('Les capitales repèrent le nom de famille, comme dans l’app ; en minuscules, c’est plus doux à lire.')}`)}`,
            `${esc(fontLabel(s.font).replace(/ \(.*\)$/, ''))} · ${s.lnCaps ? 'NOMS en capitales' : 'Noms en minuscules'}`)}

        ${sec('voice', 5, `${line('Lecture à voix haute', `${tg('data-ms-bool="voice"', s.voice, 'Montrer les boutons « 🔊 Écouter »')}${TTS ? '' : '<p class="ms-help">⚠️ Ce navigateur ne sait pas lire à voix haute : les boutons 🔊 ne seront pas montrés.</p>'}${why('Une phrase écoutée se comprend même quand on lit mal.')}`)}
            ${line('Voix', `${s.link.voice ? (UI().notice ? UI().notice('info', 'Pareil que l’app : la voix et la vitesse de « ♿ Toute l’app ».') : '') + '<p><button type="button" class="link-button" data-ms-link-off="voice">Choisir une voix propre au mode simple</button></p>' : ''}
                <select data-ms-sel="voiceName" ${s.link.voice || !voices.length ? 'disabled' : ''} aria-label="Voix"><option value="">Voix française de l’appareil</option>${voices.map(v => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === s.voiceName ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>
                ${rangeH('rate', 'Vitesse de la voix', s.link.voice ? ap.rate : s.rate, 60, 130, 5, '%', 90).replace('<input', s.link.voice ? '<input disabled' : '<input')}
                <div class="ms-row-s"><button type="button" class="button small secondary" data-ms-say ${TTS ? '' : 'disabled'}>▶ Essayer</button><button type="button" class="button small secondary" data-ms-hush ${TTS ? '' : 'disabled'}>■ Arrêter</button></div>
                ${why('Un peu plus lent que d’habitude (80 à 90 %) se suit mieux.')}`)}
            ${line('Tout seul', `${tg('data-ms-bool="autoCaptions"', s.autoCaptions, 'Lire les légendes des photos dans le diaporama')}${tg('data-ms-bool="autoRead"', s.autoRead, 'Lire l’histoire dès qu’on ouvre une fiche')}${why('Pour une personne qui voit très mal : elle n’a rien à toucher pour entendre.')}`)}`,
            `${s.link.voice ? 'Comme l’app' : 'Propre'} · ${e.rate} %`)}

        ${sec('show', 6, `${line('Les gros boutons', `<div class="ms-tiles-set" data-ms-tiles>${s.tiles.map(([k, on], i) => `<div class="ms-tile-row" data-k="${k}"><span aria-hidden="true">${tileName[k][0]}</span><b>${tileName[k][1]}</b><span class="ms-sp"></span><button type="button" class="icon-button small" data-ms-tile-up="${k}" ${i === 0 ? 'disabled' : ''} aria-label="Monter « ${tileName[k][1]} »" title="Monter">↑</button><button type="button" class="icon-button small" data-ms-tile-down="${k}" ${i === s.tiles.length - 1 ? 'disabled' : ''} aria-label="Descendre « ${tileName[k][1]} »" title="Descendre">↓</button><label class="ui-toggle ms-tg"><input type="checkbox" data-ms-tile="${k}" ${on ? 'checked' : ''} aria-label="Montrer « ${tileName[k][1]} »"><i></i></label></div>`).join('')}</div>${why('Moins de boutons, moins d’hésitation : garde seulement ce que la personne aime regarder.')}`)}
            ${line('Personnes vivantes', `${segH('living', s.living, [['show', 'Tout montrer'], ['first', 'Prénom seulement'], ['hide', 'Cacher']])}${privacyOn() && s.living === 'show' ? '<p class="ms-help">ℹ️ Le « mode confidentialité » de l’app est allumé : les vivants sont montrés par leur prénom seulement.</p>' : ''}<p class="ms-help">Les fiches marquées « confidentielles » ne sont jamais montrées.</p>${why('Pour montrer l’arbre à un voisin ou à l’école sans dévoiler les vivants.')}`)}
            ${line('Branches', `${branches.length ? `<div class="ms-branches">${branches.map(b => `<label class="ms-branch"><input type="checkbox" data-ms-branch="${esc(b.key)}" ${s.branchesOff.includes(b.key) ? '' : 'checked'}><b>Côté ${esc(b.name)}</b> <small>${plural(b.n, 'personne')}</small></label>`).join('')}</div>` : '<p class="ms-help">Les branches apparaîtront quand l’arbre sera lu.</p>'}${why('La personne qui regarde, sa famille proche et ses descendants restent toujours visibles.')}`)}
            ${line('Photos retirées', `<div class="ms-hidden-ph">${hidden.map(m => `<span class="ms-hph"><img src="${esc(m.thumb)}" alt=""><b>${esc(m.title || 'Photo')}</b> <small>${esc(m.date ? String(m.date.y) : '')}</small><button type="button" class="ms-hph-x" data-ms-unhide="${m.id}" aria-label="Remettre « ${esc(m.title || 'Photo')} » dans le mode simple" title="Remettre dans le mode simple">×</button></span>`).join('')}</div>
                <button type="button" class="button secondary" data-ms-pick-hidden>🖼 Choisir les photos à retirer…</button>${why('« Retirer » cache la photo du mode simple seulement : elle reste dans tes médias.')}`)}
            ${line('Actes et documents', `${tg('data-ms-bool="docs"', s.docs, 'Montrer aussi les actes et documents', 'Souvent difficiles à lire.')}${why('Une écriture ancienne ou une page dense découragent ; les photos parlent à tout le monde.')}`)}`,
            `${plural(s.tiles.filter(t => t[1]).length, 'gros bouton')} · ${plural(D ? D.media.filter(m => !s.hiddenPhotos.includes(m.id) && (s.docs || !m.doc)).length : 0, 'photo')}`)}

        ${sec('slides', 7, `${line('Durée de chaque photo', `${rangeH('slideSec', 'Durée de chaque photo', s.slideSec, 3, 30, 1, 's', 8)}${why('Le temps de regarder, et de dire « Oh, c’est ta tante ! ».')}`)}
            ${line('Défilement', tg('data-ms-bool="slideAuto"', s.slideAuto, 'Faire défiler tout seul en ouvrant le diaporama'))}
            ${line('Cadre photo', `${tg('data-ms-bool="idleFrame"', s.idleFrame, 'Quand personne ne touche, lancer le diaporama')}${rangeH('idleMin', 'Minutes sans toucher', s.idleMin, 1, 60, 1, 'min', 5).replace('<input', s.idleFrame ? '<input' : '<input disabled')}${why('La tablette posée sur le buffet devient un cadre photo de famille.')}`)}`,
            `${s.slideSec} s par photo · ${s.idleFrame ? `cadre après ${s.idleMin} min` : 'sans cadre photo'}`)}

        ${sec('exit', 8, `${line('Pour quitter', `${rangeH('holdSec', 'Durée de l’appui long', s.holdSec, 1, 10, 0.5, 's', 3)}<p class="ms-help">Garder le doigt sur « 🔒 Quitter le mode simple » (sur l’accueil seulement).</p>${why('Un appui long ne se fait pas par hasard : on ne sort pas par erreur.')}`)}
            ${line('Code à 4 chiffres', `${tg('data-ms-bool="useCode"', s.useCode, 'Demander aussi un code')}<div class="ms-codein" data-ms-codein>${[0, 1, 2, 3].map(i => `<input type="password" inputmode="numeric" maxlength="1" autocomplete="off" aria-label="Chiffre ${i + 1} du code" data-ui-off ${s.useCode || !s.codeHash ? '' : ''}>`).join('')}</div>
                <p class="ms-help">${s.codeHash ? '🔒 Un code est enregistré (il est gardé caché, même pour l’app). Tape 4 chiffres pour le changer.' : 'Tape 4 chiffres : le code est gardé caché, jamais en clair.'}</p>${why('Utile quand un petit-enfant joue aussi avec la tablette. Ce n’est pas une vraie protection : il évite seulement de sortir par erreur.')}`)}
            ${line('Sur cet appareil', `${tg('data-ms-dev="start"', !!dev().start, 'Ouvrir l’app directement en mode simple')}<div class="ms-addr"><code>…/#mode-simple</code><button type="button" class="button small secondary" data-ms-copy>📋 Copier</button></div>${why('Sur la tablette de Mamie, l’app s’ouvre toute seule sur les gros boutons. Ajoute l’adresse à l’écran d’accueil de la tablette.')}`)}
            <h4 class="ms-forall">Pour tout le monde</h4>
            ${line('Le bouton 🧓', `${tg('data-ms-bool="forAll"', s.forAll, 'Montrer « 🧓 Mode simple » en haut de l’app, pour tous', 'Toute personne qui ouvre cette généalogie peut passer en mode simple.')}${why('Le mode simple n’est pas réservé aux grands-parents : c’est la façon la plus calme de regarder l’arbre.')}`)}
            ${line('Réglages de base', `${tg('data-ms-bool="baseAll"', s.baseAll, 'Ces réglages servent de base sur tous les appareils', s.baseAll ? 'Ils sont gardés avec ta généalogie : chaque tablette ou ordinateur part d’ici.' : 'Coupé : cet appareil garde ses propres réglages du mode simple.')}${why('Tu prépares une fois, et chaque tablette ou ordinateur de la famille démarre pareil.')}`)}`,
            `Appui long ${String(s.holdSec).replace('.', ',')} s · ${s.useCode && s.codeHash ? 'avec code' : 'sans code'}`)}
        </div>
        <aside class="ms-preview" data-ms-preview><div class="ms-pv-head"><span class="eyebrow">Aperçu vivant</span>${bad.length ? (UI().badge ? UI().badge('⚠️ À corriger', 'yellow') : '') : (UI().badge ? UI().badge('✓ Très lisible', 'green') : '')}</div>
            <div class="ui-tabs ms-pv-tabs" role="tablist">${[['home', 'Accueil'], ['tree', 'Arbre'], ['photos', 'Photos'], ['person', 'Fiche']].map(([k, t]) => `<button type="button" role="tab" class="${pvScreen === k ? 'is-active' : ''}" aria-selected="${pvScreen === k}" data-ms-pv-tab="${k}">${t}</button>`).join('')}</div>
            <div class="ms-tablet"><div class="ms-tablet-in" data-ms-pv-host></div></div>
            <p class="ms-pv-meta">Texte <b>${e.fs} px</b> · boutons <b>${e.btnH} px</b> · police <b>${esc(fontLabel(s.font).replace(/ \(.*\)$/, ''))}</b></p>
            <p class="ms-pv-badges">${Object.values(s.link).every(Boolean) ? (UI().badge ? UI().badge('Suit l’accessibilité de l’app', 'blue') : '') : ''}${bad.length && UI().badge ? UI().badge('Contraste à corriger', 'yellow') : ''}</p>
            <p class="muted ms-small">Ce que verra ${vp && !s.notInTree ? esc(vp.first) : 'la personne'} sur une tablette. Le mode simple ne permet <b>ni de modifier, ni de supprimer</b> : ni menu caché, ni clic droit.</p></aside>
        <button type="button" class="button ms-pv-jump" data-ms-pv-jump aria-label="Voir l’aperçu">👁 Aperçu</button>
        </div>`;
    }
    function checksHtml(pal) { return contrastRows(pal).map(r => { const ok = r.r >= 7, fixable = !ok && ['tree', 'photo', 'people', 'day', 'btn', 'bg'].includes(r.b); return `<div class="ms-check ${ok ? 'is-ok' : 'is-bad'}"><span class="ms-aa" style="background:${pal[r.b]};color:${pal[r.a]}">Aa</span><span class="ms-check-t">${esc(r.label)}</span><b class="ms-check-r">${ok ? '✓ Très lisible' : '⚠️ Pas assez lisible'} ${r.r.toFixed(1).replace('.', ',').replace(',0', '')}:1</b>${fixable ? `<button type="button" class="button small secondary" data-ms-fix="${r.b}" data-against="${pal[r.a]}">Corriger</button>` : ''}</div>`; }).join(''); }
    function branchList() {
        if (!D) return [];
        const m = new Map(); D.P.forEach(p => { const k = norm(p.last).trim(); if (!k) return; const x = m.get(k) || {key: k, name: String(p.last).toUpperCase(), n: 0}; x.n++; m.set(k, x); });
        return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, 24);
    }
    /** l'onglet « 🧓 Mode simple » : dessiné dans la page Accessibilité (app-access.js appelle renderSettings) */
    function renderSettings(box) {
        const s = read();
        // garder le clavier au même endroit après le redessin (K2 : chaque changement redessine l'onglet)
        const ae = document.activeElement, keep = ae && box.contains(ae) ? [...ae.attributes].find(a => a.name.startsWith('data-ms-') && a.name !== 'data-ms-box') : null;
        const keepSel = keep ? `[${keep.name}="${CSS.escape(keep.value)}"]${ae.dataset.v != null ? `[data-v="${CSS.escape(ae.dataset.v)}"]` : ''}` : '';
        box.innerHTML = settingsHtml(s);
        if (keepSel) setTimeout(() => $(keepSel, box)?.focus({preventScroll: true}), 0);
        const UIx = UI();
        // C2 : les couleurs (« Aucune » = celle du thème)
        $$('[data-ms-color-slot]', box).forEach(slot => {
            const k = slot.dataset.msColorSlot, v = slot.dataset.v;
            if (!UIx.colorField) { slot.outerHTML = `<input type="color" value="${esc(v)}" data-ms-color="${k}">`; return; }
            const f = UIx.colorField({name: '', value: v, allowNone: true}); f.dataset.msColor = k; f.classList.add('ms-cfield');
            slot.replaceWith(f);
            const val = st => { const x = HEX(f.value); return !x || x === PAL[st.theme][k] ? null : x; };
            f.input?.addEventListener('change', () => change(st => { st.colors[k] = val(st); }, true));
            f.input?.addEventListener('input', () => { const st = read(); st.colors[k] = val(st); live(box, clean(st)); });
        });
        // 💾 Réglages enregistrés (le cadre commun) : enregistrer, renommer, exporter, importer
        const slot = $('[data-ms-presets]', box);
        if (slot && UIx.presetsFrame) {
            const today = () => new Date().toISOString();
            const frame = UIx.presetsFrame({id: 'mode-simple', what: 'les réglages du mode simple (couleurs, tailles, police, voix, ce qu’on montre)', list: presets, quietApply: true,
                apply: i => { const x = presets()[i]; if (!x) return false; change(st => Object.assign(st, clean({...x.data, ready: st.ready, codeHash: st.codeHash, viewer: st.viewer, notInTree: st.notInTree})), true); toast(`Réglages « ${x.name} » appliqués.`); return false; },
                save: name => { const l = presets(), it = {name, date: today(), data: strip(read())}, i = l.findIndex(x => x.name === name); if (i >= 0) l[i] = it; else l.push(it); savePresets(l); },
                replace: i => { const l = presets(); if (!l[i]) return false; l[i] = {...l[i], date: today(), data: strip(read())}; savePresets(l); },
                rename: (i, name) => { const l = presets(); if (!l[i]) return false; l[i].name = name; savePresets(l); },
                duplicate: i => { const l = presets(), x = l[i]; if (!x) return false; const nm = UIx.freeName ? UIx.freeName(x.name, l.map(y => y.name)) : x.name + ' (copie)'; l.splice(i + 1, 0, {name: nm, date: today(), data: clone(x.data)}); savePresets(l); },
                exportOne: i => { const x = presets()[i]; if (x) A().exportSettingFile?.('mode-simple', x.name, {data: x.data}); return false; },
                remove: i => { const l = presets(), x = l[i]; if (!x) return false; A().undoLocalChange ? A().undoLocalChange(`Réglage « ${x.name} » supprimé`, [PKEY], () => { l.splice(i, 1); savePresets(l); }, () => { if (frame.isConnected) frame.refresh(); }) : (l.splice(i, 1), savePresets(l)); },
                importOne: async () => {
                    const got = await A().importSettingFile?.('mode-simple', {names: presets().map(x => x.name), check: d => d && typeof d.data === 'object' && d.data && !Array.isArray(d.data)});
                    if (!got) return false;
                    const l = presets(); l.push({name: got.nom, date: today(), data: strip(clean(got.donnees.data))}); savePresets(l);
                    toast(`Réglage « ${got.nom} » importé : clique « Appliquer » pour t’en servir.`);
                },
            });
            slot.replaceWith(frame);
        }
        // l'aperçu vivant : une tablette miniature (non cliquable)
        mountPreview(box, s);
        if (TRY) mountTry(box);
        $$('[data-ms-pv]', box).forEach(el => miniPreview(el, applyPreset(s, PRESETS_READY.find(p => p.k === el.dataset.msPv).set)));
    }
    const strip = s => { const o = clean(s); delete o.codeHash; delete o.viewer; delete o.ready; return o; }; // un réglage enregistré ne garde ni le code ni la personne
    /** une miniature à l'échelle : le mode est dessiné en 1024 px de large, puis réduit à la largeur du cadre */
    const scaleBox = (outer, w = 1024) => { let ro = null; const set = () => { if (!outer.isConnected && ro) { ro.disconnect(); return; } if (outer.clientWidth) outer.style.setProperty('--pv-scale', String(outer.clientWidth / w)); }; set(); try { ro = new ResizeObserver(set); ro.observe(outer); } catch (_) {} };
    function mountPreview(box, s) {
        const host = $('[data-ms-pv-host]', box); if (!host) return;
        PV?.destroy(); scaleBox(host); const m = PV = makeMode(host, {preview: true, settings: s});
        m.start(pvScreen);
    }
    function miniPreview(el, s) { const host = document.createElement('div'); host.className = 'ms-mini-host'; el.appendChild(host); scaleBox(el); const m = makeMode(host, {preview: true, settings: s}); if (D) m.start('home'); else loadData().then(() => m.start('home')).catch(() => {}); }
    function mountTry(box) {
        const host = $('[data-ms-try-box]', box); if (!host) return; host.hidden = false;
        host.innerHTML = '<div class="ms-try-in"></div>'; scaleBox(host.firstElementChild);
        TRY?.destroy?.(); TRY = makeMode(host.firstElementChild, {onExit: () => { TRY?.destroy(); TRY = null; const p = document.querySelector('.a11y-page [data-ms-box]'); if (p) renderSettings(p); toast('Essai fermé : c’est ainsi qu’on quitte le mode simple.'); }});
        TRY.start('home');
    }
    /** un changement fait dans l'onglet : gardé tout de suite (K2 : app-pages.js voit le localStorage changer et propose « ↶ Annuler ») */
    function change(fn, redraw = false) {
        const s = read(), before = s.viewer; fn(s); s.ready = true; const c = write(s);
        if (c.viewer !== before || c.notInTree) setDev({viewer: undefined});
        const box = document.querySelector('.a11y-page [data-ms-box]');
        if (box && redraw) { const y = document.getElementById('workspace')?.scrollTop; renderSettings(box); const ws = document.getElementById('workspace'); if (ws && y != null) ws.scrollTop = y; }
        else if (box) live(box, c);
        refreshEntry();
        return c;
    }
    /** un changement venu d'une fenêtre (images, menu de choix) : on prévient K2 pour « ✓ Enregistré » et « ↶ Annuler » */
    const kick = el => { if (el?.isConnected) el.dispatchEvent(new Event('change', {bubbles: true})); };
    /** sans tout redessiner (un curseur qu'on glisse) : l'aperçu, le contraste, les résumés */
    function live(box, s) {
        PV?.setSettings(s); TRY?.setSettings?.(s);
        const ch = $('[data-ms-checks]', box); if (ch) ch.innerHTML = checksHtml(eff(s).pal);
        const meta = $('.ms-pv-meta', box), e = eff(s); if (meta) meta.innerHTML = `Texte <b>${e.fs} px</b> · boutons <b>${e.btnH} px</b> · police <b>${esc(fontLabel(s.font).replace(/ \(.*\)$/, ''))}</b>`;
    }
    function bindSettings(page) {
        if (page.__msBound) return; page.__msBound = true;
        page.addEventListener('click', async e => {
            const box = e.target.closest('[data-ms-box]'); if (!box) return;
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.msSec) { const o = lsGet(OPEN_KEY) || {}; o[b.dataset.msSec] = !isOpenSec(b.dataset.msSec); lsSet(OPEN_KEY, o); renderSettings(box); return; }
            if (b.dataset.msSet) { const k = b.dataset.msSet, v = b.dataset.v; change(st => { st[k] = k === 'lnCaps' ? v === 'on' : v; }, true); return; }
            if (b.dataset.msReady) { const p = PRESETS_READY.find(x => x.k === b.dataset.msReady); if (p) change(st => Object.assign(st, applyPreset(st, p.set)), true); return; }
            if (b.dataset.msFix) { const k = b.dataset.msFix; change(st => { const pal = eff(st).pal; st.colors[k] = fixColor(pal[k], b.dataset.against); }, true); return; }
            if (b.dataset.msTileUp || b.dataset.msTileDown) { const k = b.dataset.msTileUp || b.dataset.msTileDown, d = b.dataset.msTileUp ? -1 : 1; change(st => { const i = st.tiles.findIndex(t => t[0] === k), j = i + d; if (j < 0 || j >= st.tiles.length) return; [st.tiles[i], st.tiles[j]] = [st.tiles[j], st.tiles[i]]; }, true); return; }
            if (b.dataset.msUnhide) { const id = Number(b.dataset.msUnhide); change(st => { st.hiddenPhotos = st.hiddenPhotos.filter(x => x !== id); }, true); return; }
            if (b.hasAttribute('data-ms-pick-hidden')) {
                const cur = read().hiddenPhotos; const list = await A().openMediaPicker?.({multiple: true, types: ['image'], value: cur, title: 'Les photos à retirer du mode simple', intro: 'Coche les photos à ne pas montrer : elles restent dans tes médias.', okLabel: 'Retirer ces photos', allowImport: false});
                if (Array.isArray(list)) { change(st => { st.hiddenPhotos = list.map(m => Number(m.id)).filter(Boolean); }, true); kick(box); } return;
            }
            if (b.dataset.msLinkOff) { change(st => { st.link[b.dataset.msLinkOff] = false; }, true); return; }
            if (b.dataset.msPvTab) { pvScreen = b.dataset.msPvTab; $$('[data-ms-pv-tab]', box).forEach(x => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-selected', String(x === b)); }); PV?.show(pvScreen); return; }
            if (b.hasAttribute('data-ms-pv-jump')) { $('[data-ms-preview]', box)?.scrollIntoView({behavior: 'smooth', block: 'start'}); return; }
            if (b.hasAttribute('data-ms-try')) { if (TRY) { TRY.destroy(); TRY = null; renderSettings(box); } else { TRY = true; mountTry(box); b.textContent = '✕ Fermer l’essai'; } return; }
            if (b.hasAttribute('data-ms-font')) { const s0 = read(); const f = await UIx().openFontPicker?.({value: s0.font || 'Inter', sample: 'Louise CHASTANG, ta mère', title: 'La police du mode simple', top: ['Atkinson Hyperlegible', 'Luciole', 'OpenDyslexic']}); if (f) { UIx().rememberFont?.(f); change(st => { st.font = f === 'Inter' ? '' : f; }, true); } return; }
            if (b.hasAttribute('data-ms-say')) { const s0 = read(), e0 = eff(s0); try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance('Bonjour ! Voici Louise Chastang, ta mère. Elle est née le 3 mai 1897 à Arnac-la-Poste.'); u.lang = 'fr-FR'; u.rate = e0.rate / 100; const v = frVoices().find(x => x.voiceURI === e0.voiceName); if (v) u.voice = v; speechSynthesis.speak(u); } catch (_) {} return; }
            if (b.hasAttribute('data-ms-hush')) { try { speechSynthesis.cancel(); } catch (_) {} return; }
            if (b.hasAttribute('data-ms-copy')) { const url = location.origin + location.pathname + '#mode-simple'; try { await navigator.clipboard.writeText(url); toast('Adresse copiée : ' + url); } catch (_) { toast(url); } return; }
        });
        const UIx = UI;
        page.addEventListener('change', e => {
            const t = e.target, box = t.closest('[data-ms-box]'); if (!box) return;
            if (t.dataset.msBool) { const k = t.dataset.msBool; if (k === 'useCode' && t.checked && !read().codeHash) { t.checked = false; const first = $('[data-ms-codein] input', box); first?.focus(); toast('Tape d’abord les 4 chiffres du code, juste en dessous.'); return; } change(st => { st[k] = t.checked; if (k === 'baseAll' && !t.checked) lsSet(LOCAL, {...st, baseAll: false}); }, true); return; }
            if (t.dataset.msLink) { change(st => { st.link[t.dataset.msLink] = t.checked; }, true); return; }
            if (t.dataset.msSel) { change(st => { st[t.dataset.msSel] = t.value; }, true); return; }
            if (t.dataset.msTile) { const k = t.dataset.msTile; if (!t.checked && read().tiles.filter(x => x[1]).length <= 1) { t.checked = true; toast('Il faut garder au moins un gros bouton.'); return; } change(st => { st.tiles = st.tiles.map(x => (x[0] === k ? [k, t.checked] : x)); }, true); return; }
            if (t.dataset.msBranch) { const k = t.dataset.msBranch; change(st => { st.branchesOff = t.checked ? st.branchesOff.filter(x => x !== k) : [...new Set([...st.branchesOff, k])]; }, true); return; }
            if (t.dataset.msDev) { setDev({[t.dataset.msDev]: t.checked || undefined}); if (t.checked) markReady(); return; }
            if (t.dataset.msRange) { change(st => { st[t.dataset.msRange] = Number(t.value); }, true); }
        });
        page.addEventListener('input', e => {
            const t = e.target; if (!t.dataset?.msRange) return; const box = t.closest('[data-ms-box]'); if (!box) return;
            const s = read(); s[t.dataset.msRange] = Number(t.value); live(box, clean(s));
        });
        // les 4 cases du code : le code est haché dès qu'il est complet (jamais gardé en clair)
        page.addEventListener('input', e => {
            const t = e.target; if (!t.closest?.('[data-ms-codein]')) return; const all = $$('[data-ms-codein] input', page), i = all.indexOf(t);
            t.value = t.value.replace(/\D/g, '').slice(-1); if (t.value && all[i + 1]) all[i + 1].focus();
            const c = all.map(x => x.value).join('');
            if (c.length === 4 && /^\d{4}$/.test(c)) { all.forEach(x => { x.value = ''; }); change(st => { st.codeHash = makeCodeHash(c); st.useCode = true; }, true); toast('Code de sortie enregistré (gardé caché).'); }
        });
        page.addEventListener('keydown', e => { const t = e.target; if (t.closest?.('[data-ms-codein]') && e.key === 'Backspace' && !t.value) { const all = $$('[data-ms-codein] input', page), i = all.indexOf(t); if (all[i - 1]) { all[i - 1].focus(); all[i - 1].value = ''; } } });
        page.addEventListener('picker-change', e => {
            if (!e.target.closest?.('[data-ms-box]')) return; const v = Number(e.detail?.value) || 0;
            change(st => { st.viewer = v; if (v) st.notInTree = false; }, true); kick(e.target.closest('[data-ms-box]') || page);
        });
    }
    /** appelé par app-access.js : les onglets de page « ♿ Toute l'app » / « 🧓 Mode simple » */
    const tabNow = () => { try { return sessionStorage.getItem(TAB_KEY) === 'simple' ? 'simple' : 'app'; } catch (_) { return 'app'; } };
    function tabsHtml() { const t = tabNow(); return `<div class="segmented ms-pagetabs" role="tablist" aria-label="Accessibilité">${[['app', '♿', 'Toute l’app'], ['simple', '🧓', 'Mode simple']].map(([k, i, n]) => `<button type="button" role="tab" class="${t === k ? 'is-active' : ''}" aria-selected="${t === k}" data-ms-tab="${k}"><span aria-hidden="true">${i}</span> ${n}${k === 'simple' ? ' <span class="ms-new">Nouveau</span>' : ''}</button>`).join('')}</div>`; }
    function mountTab(page) {
        bindSettings(page);
        if (!page.__msTabs) { page.__msTabs = true; page.addEventListener('click', e => { const b = e.target.closest('[data-ms-tab]'); if (!b) return; try { sessionStorage.setItem(TAB_KEY, b.dataset.msTab); } catch (_) {} ext.maintenance?.accessibilite?.(A().state?.workspaceToken ?? 0, false); }); }
        if (tabNow() !== 'simple') { PV?.destroy(); PV = null; if (TRY && TRY.destroy) TRY.destroy(); TRY = null; return; }
        const box = $('[data-ms-box]', page); if (!box) return;
        renderSettings(box);
        loadData().then(() => { if (box.isConnected && !box.__drawnWithData) { box.__drawnWithData = true; renderSettings(box); } }).catch(() => {});
    }

    /* ═════ Démarrage : « Ouvrir l'app en mode simple sur cet appareil », ou l'adresse …/#mode-simple ═════ */
    function boot() {
        refreshEntry();
        const first = String(window.LCNDA_FIRST_HASH || location.hash || '');
        if (window.GENEALOGY_READY !== false && (first === '#mode-simple' || dev().start)) setTimeout(() => { if (!FULL) open({from: 'start'}); }, 50);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

    /** ↺ Remettre comme au départ (onglet 🧓) : les réglages du mode simple, sans question (« ↶ Annuler » dans le message, K2) */
    function reset() { setDev({viewer: undefined}); lsSet(LOCAL, null); write({...DEF(), ready: true}); const box = document.querySelector('.a11y-page [data-ms-box]'); if (box) renderSettings(box); refreshEntry(); }
    /* ce qui ne quitte jamais cette généalogie : le code de sortie (même haché), qui regarde, les photos cachées (numéros de cette base)
       — portable(r) : les réglages sans eux (💾 toute l'app, défauts du site, fichier) ; keepPrivate(r, ici) : r avec ceux d'ici */
    const PRIVATE = ['codeHash', 'useCode', 'viewer', 'notInTree', 'ready', 'hiddenPhotos'];
    const portable = raw => { const o = clean(raw); PRIVATE.forEach(k => delete o[k]); return o; };
    const keepPrivate = (raw, here) => { const h = clean(here), o = {...(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {})}; PRIVATE.forEach(k => { o[k] = h[k]; }); return clean(o); };
    ext.modeSimple = {
        open, close, enter, reset, portable, keepPrivate, PRIVATE, isOpen: () => !!FULL, current: () => FULL, settings: read, write, clean, defaults: DEF, eff, ratio, fixColor, contrastRows,
        renderSettings, mountTab, tabsHtml, tabNow, data: () => D, loadData, makeMode, sha256, checkCode, makeCodeHash,
        kin: (v, t) => (D ? relFor(v, t) : ''), kinNoun, refreshEntry,
        debug: () => ({guard: {on: guard.on, blocked: guard.blocked.slice(), deferred: guard.deferred.length}, screen: FULL?.V.screen || '', V: FULL?.V}),
    };
})();
