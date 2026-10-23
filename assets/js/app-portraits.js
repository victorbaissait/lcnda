/* LCNDA — 👤 K7 : un seul portrait (rond ou carré d'initiales, ou la photo de la fiche), partout.
 *
 * Réglage : Réglages → Apparence → onglet « 👤 Portraits » (le cadre est dessiné par app-colonne.js).
 *   localStorage['genealogie-portraits'] = {mode: 'avant'|'rond'|'carre', shape: 'rond'|'arrondi'|'carre'|'penche',
 *     radius (%), init (% de la taille), bw (px), bc, cmode: 'plein'|'pale'|'unique', m, f, u, a, one (couleurs),
 *     photo, bwphoto, letters: 'deux'|'une', sosa}
 *   « Comme avant » (par défaut) : chaque endroit garde son dessin d'aujourd'hui ; UI.avatarOn() est faux.
 *
 * Le composant : UI.avatar(personne, taille, {sosa}) → HTML d'un portrait en 4 tailles (22, 34, 48, 88).
 *   personne = {id, first_name, last_name, name|title, gender ('male'|'female'|'m'|'f'|'u'), kind ('animal'),
 *               photo (adresse d'image déjà prête), initials (si déjà calculées), sosa}
 *   UI.avatarOr(personne, taille, ancienHtml) : le portrait commun si le réglage n'est pas « Comme avant », sinon l'ancien dessin.
 * Les couleurs, la forme, le bord et la taille des lettres sont des variables CSS posées sur :root (app.css, « .lc-av »).
 */
(() => {
    'use strict';
    const UI = window.LCNDA_UI = window.LCNDA_UI || {};
    const A = () => window.LCNDA_APP || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const KEY = 'genealogie-portraits';
    const SIZES = [22, 34, 48, 88];
    const DEF_COLORS = {m: '#3c78d8', f: '#d9488f', u: '#8a8f99', a: '#e9a23b', one: '#0066cc'};
    const PRESETS = {
        avant: {},
        rond: {shape: 'rond', radius: 20, init: 40, bw: 0, bc: '#080808', cmode: 'plein', ...DEF_COLORS, photo: true, bwphoto: false, letters: 'deux', sosa: false},
        carre: {shape: 'carre', radius: 0, init: 32, bw: 2, bc: '#080808', cmode: 'unique', ...DEF_COLORS, photo: true, bwphoto: true, letters: 'deux', sosa: false},
    };
    const KEYS = Object.keys(PRESETS.rond);
    const HEX = /^#[0-9a-f]{6}$/i;
    const clamp = (v, a, b, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };

    /** le réglage lu et vérifié (seulement des valeurs connues : il est écrit tel quel dans les styles) */
    function clean(raw) {
        const r = raw && typeof raw === 'object' ? raw : {};
        const mode = ['avant', 'rond', 'carre'].includes(r.mode) ? r.mode : 'avant';
        const base = PRESETS[mode === 'avant' ? 'rond' : mode];
        const out = {mode};
        out.shape = ['rond', 'arrondi', 'carre', 'penche'].includes(r.shape) ? r.shape : base.shape;
        out.radius = clamp(r.radius, 0, 45, base.radius);
        out.init = clamp(r.init, 28, 60, base.init);
        out.bw = Math.round(clamp(r.bw, 0, 4, base.bw) * 2) / 2;
        out.bc = HEX.test(r.bc || '') ? r.bc.toLowerCase() : base.bc;
        out.cmode = ['plein', 'pale', 'unique'].includes(r.cmode) ? r.cmode : base.cmode;
        ['m', 'f', 'u', 'a', 'one'].forEach(k => { out[k] = HEX.test(r[k] || '') ? r[k].toLowerCase() : base[k]; });
        ['photo', 'bwphoto', 'sosa'].forEach(k => { out[k] = typeof r[k] === 'boolean' ? r[k] : base[k]; });
        out.letters = r.letters === 'une' ? 'une' : 'deux';
        return out;
    }
    function read() { try { return clean(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (_) { return clean(null); } }
    function write(s) { try { localStorage.setItem(KEY, JSON.stringify(clean(s))); } catch (_) { A().toast?.('Enregistrement impossible : la place du navigateur est pleine ?', 'error'); } apply(); }

    /* ── couleurs ── */
    const hx = h => [0, 2, 4].map(i => parseInt(h.slice(1 + i, 3 + i), 16));
    const toHex = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
    const mix = (a, b, t) => { const x = hx(a), y = hx(b); return toHex(x.map((v, i) => v * (1 - t) + y[i] * t)); };
    /** fond et lettres d'un genre, d'après le réglage (même calcul que la maquette validée) */
    function colorsOf(S, g) {
        const base = S.cmode === 'unique' ? S.one : S[g];
        if (S.cmode === 'unique' && S.bwphoto) return ['#f1f1f1', '#555555'];
        if (S.cmode === 'plein') return [base, '#ffffff'];
        return [mix(base, '#ffffff', S.cmode === 'unique' ? .9 : .84), mix(base, '#000000', .12)];
    }
    /** les variables CSS d'un réglage (sur :root, ou sur un aperçu) */
    function varsOf(S) {
        const v = {};
        ['m', 'f', 'u', 'a'].forEach(g => { const [bg, fg] = colorsOf(S, g); v[`--lc-av-bg-${g}`] = bg; v[`--lc-av-fg-${g}`] = fg; });
        v['--lc-av-radius'] = S.shape === 'rond' ? '50%' : S.shape === 'arrondi' ? `${S.radius}%` : '0';
        v['--lc-av-rot'] = S.shape === 'penche' ? 'rotate(-3deg)' : 'none';
        v['--lc-av-init'] = String(S.init / 100);
        v['--lc-av-bw'] = `${S.bw}px`;
        v['--lc-av-bc'] = S.bc;
        v['--lc-av-photo-filter'] = S.bwphoto ? 'grayscale(1)' : 'none';
        return v;
    }
    const styleOf = S => Object.entries(varsOf(S)).map(([k, v]) => `${k}:${v}`).join(';');
    function apply() {
        const S = read(), root = document.documentElement;
        if (S.mode === 'avant') { root.removeAttribute('data-lc-portraits'); Object.keys(varsOf(S)).forEach(k => root.style.removeProperty(k)); return S; }
        root.setAttribute('data-lc-portraits', S.mode);
        Object.entries(varsOf(S)).forEach(([k, v]) => root.style.setProperty(k, v));
        return S;
    }

    /* ── la personne ── */
    const genderOf = p => {
        if (p.kind === 'animal' || p.gender === 'a') return 'a';
        const g = String(p.gender || '').toLowerCase();
        return g === 'male' || g === 'm' || g === 'h' ? 'm' : g === 'female' || g === 'f' ? 'f' : 'u';
    };
    const letter = w => (String(w || '').match(/\p{L}|\p{N}/u) || [''])[0];
    /** deux lettres (prénom + nom) ou une seule (le nom) */
    function initialsOf(p, letters) {
        if (genderOf(p) === 'a') return '🐾';
        let first = String(p.first_name ?? p.first ?? '').trim(), last = String(p.last_name ?? p.last ?? '').trim();
        if (!first && !last) {
            if (p.initials && letters !== 'une') return String(p.initials).slice(0, 2).toLocaleUpperCase('fr-FR');
            const words = String(p.name || p.title || '').replace(/[«»"()]/g, ' ').split(/\s+/).filter(w => letter(w));
            const upper = words.findIndex(w => w.length > 1 && w === w.toLocaleUpperCase('fr-FR') && /\p{L}/u.test(w));
            if (upper > 0) { first = words.slice(0, upper).join(' '); last = words.slice(upper).join(' '); }
            else if (words.length > 1) { first = words[0]; last = words.slice(1).join(' '); }
            else last = words[0] || '';
        }
        const out = letters === 'une' ? letter(last || first) : letter(first) + letter(last);
        return (out || '?').toLocaleUpperCase('fr-FR');
    }
    const sizeOf = n => SIZES.reduce((best, s) => Math.abs(s - n) < Math.abs(best - n) ? s : best, 34);
    const safeUrl = u => { u = String(u || ''); return /^(media\/|https?:\/\/|\/|data:image\/|blob:|api\.php)/i.test(u) && !/['"()\\<>\s]/.test(u) ? u : ''; };

    /** Le portrait commun. size : 22 (dans une ligne), 34 (listes, menu de choix), 48 (arbre, vignettes), 88 (fiche). */
    function avatar(p, size = 34, opts = {}) {
        p = p || {};
        const S = opts.settings || read(), n = sizeOf(Number(size) || 34), g = genderOf(p);
        const photo = S.photo && !opts.noPhoto ? safeUrl(p.photo) : '';
        const ini = p.free ? '?' : initialsOf(p, S.letters);
        const cls = `lc-av lc-av-${n} is-${p.free ? 'u' : g}${photo ? ' has-photo' : ''}${S.letters === 'une' ? ' is-one' : ''}`;
        const style = `--av:${n}px${photo ? `;background-image:url('${esc(photo)}')` : ''}${opts.settings ? ';' + styleOf(S) : ''}`;
        const label = p.free ? '' : String(p.name || p.title || [p.first_name, p.last_name].filter(Boolean).join(' ')).trim();
        const av = `<span class="${cls}" style="${style}" aria-hidden="true"${label ? ` title="${esc(label)}"` : ''}>${photo ? '' : esc(ini)}</span>`;
        let sosa = 0;
        if (S.sosa && n >= 34 && g !== 'a' && !p.free && !opts.noSosa) {
            sosa = Number(opts.sosa ?? p.sosa) || 0;
            if (!sosa && p.id) { try { sosa = Number(A().sosaNumberFor?.(p.id)) || 0; } catch (_) { sosa = 0; } }
        }
        return sosa ? `<span class="lc-av-wrap lc-av-wrap-${n}">${av}<span class="lc-av-sosa" title="Sosa ${sosa}">${sosa}</span></span>` : av;
    }
    const avatarOn = () => read().mode !== 'avant';

    UI.avatar = avatar;
    UI.avatarOn = avatarOn;
    UI.avatarOr = (p, size, legacy) => (avatarOn() ? avatar(p, size) : legacy);
    UI.avatarInitials = initialsOf;
    window.LCNDA_PORTRAITS = {KEY, PRESETS, DEF_COLORS, SIZES, read, write, clean, apply, avatar, varsOf, styleOf, colorsOf, initialsOf, on: avatarOn};
    apply();
})();
