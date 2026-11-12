/* LCNDA — 🌐 Traduction de l'app (window.LCNDA_I18N ; aussi require() dans Node). Mode d'emploi : docs/I18N.md.
 *
 * Le français est la langue de référence : la CLÉ d'un texte est le texte français lui-même.
 *   t('Enregistrer')                       → « Save » en anglais, « Enregistrer » en français (ou si la traduction manque)
 *   t('{n} éléments', {n: 3})              → variables {x} remplacées (un nombre est écrit selon la langue)
 *   t('Fiche', {ctx: 'onglet'})            → clé « onglet|Fiche » quand un même mot se traduit autrement (repli : « Fiche »)
 *   plural(3, 'personne')                  → « 3 personnes » / « 3 people » / « 3 osoby » (Intl.PluralRules, 0 et 1 au singulier en français)
 *   fmtNumber(1234.5), fmtDate(date, opts) → Intl selon la langue (jamais pour les dates généalogiques : elles suivent C4)
 * Fichiers de langue : assets/i18n/<code>.json (en, es, de, it, pt, pl, nl, cs, sv, da, sk, nb, ro, fi, hu, hr, sl), fabriqués par scripts/i18n-build.js depuis
 * assets/i18n/src/*.tsv (et assets/i18n/src/nord/*.tsv pour cs, sv, da ; assets/i18n/src/nord2/*.tsv pour sk, nb ;
 * assets/i18n/src/nord3/*.tsv pour ro ; assets/i18n/src/nord4/*.tsv pour fi, hu ;
 * assets/i18n/src/nord5/*.tsv pour hr, sl). Valeur = texte, ou formes de pluriel {one, two, few, many, other}.
 *
 * En français, RIEN ne change : t() rend le texte tel quel, plural() est celui d'avant, aucune page n'est retouchée.
 * Dans une autre langue, en plus de t() dans le code, un filet relit la page (textes, title, placeholder, aria-label)
 * et remplace un texte qui est exactement une clé connue (avec ou sans symbole devant : « ＋ Ajouter… », « 🐾 Animaux »).
 * Zones jamais retouchées : [data-i18n-off], champs de saisie, contenteditable, script, style, code.
 * Langue choisie : localStorage « lcnda-langue » (cet ordinateur, pas la base) (+ cookie lcnda_lang pour le serveur : <html lang>, messages d'erreur).
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root && typeof root === 'object') root.LCNDA_I18N = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (root) {
    'use strict';
    const LANGS = Object.freeze([
        {code: 'fr', name: 'Français', flag: '🇫🇷', locale: 'fr-FR'},
        {code: 'en', name: 'English', flag: '🇬🇧', locale: 'en-GB'},
        {code: 'es', name: 'Español', flag: '🇪🇸', locale: 'es-ES'},
        {code: 'de', name: 'Deutsch', flag: '🇩🇪', locale: 'de-DE'},
        {code: 'it', name: 'Italiano', flag: '🇮🇹', locale: 'it-IT'},
        {code: 'pt', name: 'Português', flag: '🇵🇹', locale: 'pt-PT'},
        {code: 'pl', name: 'Polski', flag: '🇵🇱', locale: 'pl-PL'},
        {code: 'nl', name: 'Nederlands', flag: '🇳🇱', locale: 'nl-NL'},
        {code: 'cs', name: 'Čeština', flag: '🇨🇿', locale: 'cs-CZ'},
        {code: 'sv', name: 'Svenska', flag: '🇸🇪', locale: 'sv-SE'},
        {code: 'da', name: 'Dansk', flag: '🇩🇰', locale: 'da-DK'},
        {code: 'sk', name: 'Slovenčina', flag: '🇸🇰', locale: 'sk-SK'},
        {code: 'nb', name: 'Norsk (bokmål)', flag: '🇳🇴', locale: 'nb-NO'},
        {code: 'ro', name: 'Română', flag: '🇷🇴', locale: 'ro-RO'},
        {code: 'fi', name: 'Suomi', flag: '🇫🇮', locale: 'fi-FI'},
        {code: 'hu', name: 'Magyar', flag: '🇭🇺', locale: 'hu-HU'},
        {code: 'hr', name: 'Hrvatski', flag: '🇭🇷', locale: 'hr-HR'},
        {code: 'sl', name: 'Slovenščina', flag: '🇸🇮', locale: 'sl-SI'},
    ]);
    const CODES = LANGS.map(l => l.code);
    const KEY = 'lcnda-langue', COOKIE = 'lcnda_lang', BANNER_KEY = 'lcnda-i18n-banner-closed';
    const VERSION = 15; // monter avec ?v= de assets/i18n/*.json dans index.php
    const hasDom = typeof document !== 'undefined' && typeof window !== 'undefined';
    const isCode = c => CODES.includes(String(c || ''));

    let lang = 'fr', dict = Object.create(null), patterns = [], patternCache = new Map();
    const data = Object.create(null); // code → dictionnaire chargé

    /* ═════ Lire la langue ═════ */
    function storedLang() {
        if (!hasDom) return 'fr';
        try { const v = localStorage.getItem(KEY); return isCode(v) ? v : 'fr'; } catch (_) {} // le cookie seulement sans localStorage
        try { const m = document.cookie.match(/(?:^|;\s*)lcnda_lang=([a-z]{2})/); if (m && isCode(m[1])) return m[1]; } catch (_) {}
        return 'fr';
    }
    const info = c => LANGS.find(l => l.code === c) || LANGS[0];
    const locale = () => info(lang).locale;

    /* ═════ Charger un dictionnaire ═════ */
    function compile(d) {
        dict = d || Object.create(null);
        patterns = []; patternCache = new Map();
        Object.keys(dict).forEach(k => {
            if (k === '_meta' || !/\{[a-z_][a-z0-9_]*\}/i.test(k) || typeof dict[k] !== 'string') return;
            const raw = k.replace(/^[a-z0-9-]+\|/, '');
            const names = [];
            const parts = raw.split(/(\{[a-z_][a-z0-9_]*\})/i);
            let lit = '';
            const re = parts.map(p => {
                const m = p.match(/^\{([a-z_][a-z0-9_]*)\}$/i);
                if (m) { names.push(m[1]); return /^(n|count|nb|total|i|max|min)$/i.test(m[1]) ? '([\\d\\s  .,]+)' : '(.+?)'; }
                if (p.length > lit.length) lit = p;
                return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }).join('');
            if (lit.trim().length < 2) return; // « {n} » tout seul : trop large
            // deux mots libres (ou plus) autour d'un petit mot (« {a} de {b} », « {what} le {date} ») : trop large pour le filet,
            // il déformerait d'autres phrases ; ces textes-là passent par t() dans le code
            const letters = parts.filter(p => !/^\{[a-z_][a-z0-9_]*\}$/i.test(p)).join('').replace(/[^\p{L}]/gu, '').length;
            const wide = names.filter(n => !/^(n|count|nb|total|i|max|min)$/i.test(n)).length;
            if (wide >= 2 && letters < 6) return;
            patterns.push({re: new RegExp(`^${re}$`, 'u'), names, lit, out: dict[k]});
        });
    }
    function load(code) {
        if (!isCode(code) || code === 'fr') return Object.create(null);
        if (data[code]) return data[code];
        const pre = root && root.LCNDA_I18N_DATA;
        if (pre && pre._meta && pre._meta.lang === code) { data[code] = pre; return pre; }
        if (typeof require === 'function' && !hasDom) {
            try { data[code] = require(`../i18n/${code}.json`); return data[code]; } catch (_) { return Object.create(null); }
        }
        if (hasDom && typeof XMLHttpRequest !== 'undefined') {
            // le cookie manquait (premier lancement, autre onglet) : lecture tout de suite, pour que le premier dessin soit traduit
            try { const x = new XMLHttpRequest(); x.open('GET', `assets/i18n/${code}.json?v=${VERSION}`, false); x.send(null); if (x.status === 200) { data[code] = JSON.parse(x.responseText); return data[code]; } } catch (_) {}
        }
        return Object.create(null);
    }
    /** pour Node et les tests : donner un dictionnaire sans le lire */
    function provide(code, d) { if (isCode(code) && code !== 'fr') data[code] = d; if (code === lang) compile(data[code]); }

    /* ═════ t() ═════ */
    const pluralRules = new Map();
    function category(n, code = lang) {
        if (!pluralRules.has(code)) { try { pluralRules.set(code, new Intl.PluralRules(info(code).locale)); } catch (_) { pluralRules.set(code, null); } }
        const r = pluralRules.get(code);
        if (!r) return Math.abs(n) === 1 ? 'one' : 'other';
        return r.select(Math.abs(Number(n) || 0));
    }
    function fmtNumber(n, opts) { const v = Number(n); if (!Number.isFinite(v)) return String(n); try { return v.toLocaleString(locale(), opts); } catch (_) { return String(v); } }
    function fmtDate(d, opts = {day: 'numeric', month: 'short', year: 'numeric'}) {
        const x = d instanceof Date ? d : new Date(d); if (isNaN(x)) return '';
        try { return x.toLocaleDateString(locale(), opts); } catch (_) { return x.toISOString().slice(0, 10); }
    }
    function fmtTime(d) { const x = d instanceof Date ? d : new Date(d); if (isNaN(x)) return ''; try { return x.toLocaleTimeString(locale(), {hour: '2-digit', minute: '2-digit'}); } catch (_) { return ''; } }
    function interpolate(s, vars) {
        if (!vars || typeof s !== 'string' || s.indexOf('{') < 0) return s;
        return s.replace(/\{([a-z_][a-z0-9_]*)\}/gi, (m, k) => {
            if (!Object.prototype.hasOwnProperty.call(vars, k) || k === 'ctx') return m;
            const v = vars[k];
            return typeof v === 'number' ? (lang === 'fr' ? v.toLocaleString('fr-FR') : fmtNumber(v)) : String(v ?? '');
        });
    }
    function pick(v, vars) {
        if (v == null) return null;
        if (typeof v === 'string') return v;
        if (typeof v === 'object') { const n = vars && vars.n != null ? Number(vars.n) : 1; return v[category(n)] || v.other || v.one || null; }
        return null;
    }
    function lookup(text, ctx) {
        if (lang === 'fr') return null;
        if (ctx) { const v = dict[`${ctx}|${text}`]; if (v != null) return v; }
        const v = dict[text];
        return v == null ? null : v;
    }
    /** t('texte français', {vars, ctx}) : le texte dans la langue choisie, sinon le français */
    function t(text, vars) {
        const s = String(text ?? '');
        if (lang === 'fr') return interpolate(s, vars);
        const v = pick(lookup(s, vars && vars.ctx), vars);
        return interpolate(v == null ? s : v, vars);
    }
    /** a-t-on une traduction ? (pour les outils et les tests) */
    const has = (text, ctx) => lang === 'fr' || lookup(String(text ?? ''), ctx) != null;
    /** plural(n, 'personne', 'personnes') : le nombre écrit selon la langue + le mot accordé */
    function frPlural(n, one, many = '') { const v = Number(n) || 0; return `${v.toLocaleString('fr-FR')} ${Math.abs(v) < 2 ? one : (many || (/[sxz]$/.test(one) ? one : `${one}s`))}`; }
    function plural(n, one, many = '') {
        if (lang === 'fr') return frPlural(n, one, many);
        const v = Number(n) || 0, cat = category(v);
        const forms = lookup(one);
        if (forms == null && !(many && lookup(many) != null)) return `${fmtNumber(v)} ${Math.abs(v) < 2 ? one : (many || (/[sxz]$/.test(one) ? one : `${one}s`))}`; // mot pas encore traduit : l'accord français
        const word = (() => {
            if (forms && typeof forms === 'object') return forms[cat] || forms.other || forms.one;
            if (cat === 'one') return typeof forms === 'string' ? forms : one;
            const m = many ? lookup(many) : null;
            if (typeof m === 'string') return m;
            return typeof forms === 'string' ? forms : (many || one);
        })();
        return `${fmtNumber(v)} ${word}`;
    }

    /* ═════ Le filet : relire la page ═════ */
    const LEAD = /^[\s\p{Extended_Pictographic}\p{So}\p{Sm}️‍⃣·•]+/u;
    const TRAIL = /[\s…:▾▸→↗]+$/u;
    const memo = new Map();
    const FREE = /^(name|nom|q|who|file|err|n|count|nb|total|h|day|date|year|num)$/i; // variables qui restent telles quelles
    function matchPattern(s) {
        if (!patterns.length || s.length > 160) return null;
        if (patternCache.has(s)) return patternCache.get(s);
        let out = null;
        for (const p of patterns) {
            if (s.indexOf(p.lit) < 0) continue;
            const m = s.match(p.re); if (!m) continue;
            const vars = {}; p.names.forEach((k, i) => { vars[k] = m[i + 1]; });
            // la partie variable est traduite elle aussi (« Ajouter {x} » → « Add Key figures ») ; si elle ne l'est pas, le
            // modèle n'est pas pris (pas de phrase à moitié traduite), sauf pour une variable libre : un nom, un nombre, un texte tapé
            let miss = false;
            const val = k => { const v = vars[k]; if (!/\p{L}/u.test(v) || FREE.test(k) || /\d/.test(v) || v === s) return v; const tv = translateText(v); if (tv == null && !known(v)) miss = true; return tv ?? v; };
            const res = p.out.replace(/\{([a-z_][a-z0-9_]*)\}/gi, (x, k) => (k in vars ? val(k) : x));
            if (miss) continue;
            out = res;
            break;
        }
        if (patternCache.size > 4000) patternCache.clear();
        patternCache.set(s, out);
        return out;
    }
    /** le texte est-il une clé connue (même si sa traduction est identique : « Sources », « Notes ») ? */
    function known(v) { const f = String(v).trim().replace(/\s+/g, ' '), lead = (f.match(LEAD) || [''])[0], rest = f.slice(lead.length), core = rest.replace(TRAIL, ''); return dict[f] != null || dict[rest] != null || dict[core] != null; }
    /** traduire un texte entier tel qu'il est écrit dans la page (null = rien à changer) */
    function translateText(raw) {
        if (lang === 'fr' || !raw) return null;
        if (memo.has(raw)) return memo.get(raw);
        let res = null;
        const m = raw.match(/^(\s*)([\s\S]*?)(\s*)$/), body = m[2];
        if (body && /\p{L}/u.test(body) && body.length < 400) {
            const flat = body.replace(/\s+/g, ' ');
            let v = pick(dict[flat]);
            if (v == null) {
                const lead = (flat.match(LEAD) || [''])[0], rest = flat.slice(lead.length);
                const trail = (rest.match(TRAIL) || [''])[0], core = rest.slice(0, rest.length - trail.length);
                if (core && core !== flat) {
                    if (lead && dict[rest] != null) v = lead + pick(dict[rest]);
                    else if (trail && dict[lead + core] != null) v = pick(dict[lead + core]) + trail;
                    else if (dict[core] != null) v = lead + pick(dict[core]) + trail;
                }
                if (v == null) v = matchPattern(flat);
                if (v == null && core && core !== flat) { const c2 = matchPattern(core); if (c2 != null) v = lead + c2 + trail; }
                // « Listes · Personnes et familles », « 43 personnes · 1 animal » : chaque morceau à part (un nom reste tel quel)
                if (v == null && flat.indexOf(' · ') > 0) { let any = false; const parts = flat.split(' · ').map(x => { const tx = translateText(x); if (tx != null) any = true; return tx ?? x; }); if (any) v = parts.join(' · '); }
            }
            if (v != null && v !== flat) res = m[1] + v + m[3];
        }
        if (memo.size > 8000) memo.clear();
        memo.set(raw, res);
        return res;
    }
    const ATTRS = ['title', 'placeholder', 'aria-label', 'alt', 'data-tip'];
    const SKIP = 'script,style,textarea,code,pre,[data-i18n-off],[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"]';
    const textState = new WeakMap(); // nœud texte → {src, out}
    const attrState = new WeakMap(); // élément → {attr: {src, out}}
    const skipped = el => !el || (el.closest && el.closest(SKIP));
    function doText(node) {
        const st = textState.get(node), cur = node.nodeValue;
        if (st && cur === st.out) return;
        const src = cur, out = translateText(src);
        if (out == null) { if (st) textState.delete(node); return; }
        textState.set(node, {src, out});
        node.nodeValue = out;
    }
    function doAttrs(el) {
        if (!el.getAttribute) return;
        let st = attrState.get(el);
        for (const a of ATTRS) {
            const cur = el.getAttribute(a); if (cur == null) continue;
            const prev = st && st[a];
            if (prev && prev.out === cur) continue;
            const out = translateText(cur); if (out == null) continue;
            if (!st) { st = {}; attrState.set(el, st); }
            st[a] = {src: cur, out};
            el.setAttribute(a, out);
        }
        if (el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type) && el.value) { const o = translateText(el.value); if (o != null) el.value = o; }
    }
    function walk(rootNode) {
        if (!rootNode || lang === 'fr') return;
        if (rootNode.nodeType === 3) { if (!skipped(rootNode.parentElement)) doText(rootNode); return; }
        if (rootNode.nodeType !== 1 && rootNode.nodeType !== 9 && rootNode.nodeType !== 11) return;
        if (rootNode.nodeType === 1 && skipped(rootNode)) return;
        if (rootNode.nodeType === 1) doAttrs(rootNode);
        const doc = rootNode.ownerDocument || rootNode;
        const tw = doc.createTreeWalker(rootNode, 5 /* éléments + textes */, {acceptNode: n => (n.nodeType === 1 && n.matches(SKIP) ? 2 /* REJECT */ : 1)});
        let n;
        while ((n = tw.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
    }
    /** remettre le texte d'origine (français) partout où le filet est passé */
    function revert(rootNode = hasDom ? document.body : null) {
        if (!rootNode) return;
        const doc = rootNode.ownerDocument || rootNode;
        const tw = doc.createTreeWalker(rootNode, 5);
        let n = rootNode;
        do {
            if (n.nodeType === 3) { const st = textState.get(n); if (st && n.nodeValue === st.out) n.nodeValue = st.src; textState.delete(n); }
            else if (n.nodeType === 1) { const st = attrState.get(n); if (st) { Object.entries(st).forEach(([a, v]) => { if (n.getAttribute(a) === v.out) n.setAttribute(a, v.src); }); attrState.delete(n); } }
        } while ((n = tw.nextNode()));
    }
    let observer = null;
    function observe() {
        if (!hasDom || observer || lang === 'fr' || typeof MutationObserver === 'undefined') return;
        observer = new MutationObserver(list => {
            for (const m of list) {
                if (m.type === 'childList') m.addedNodes.forEach(walk);
                else if (m.type === 'characterData') { if (!skipped(m.target.parentElement)) doText(m.target); }
                else if (m.type === 'attributes' && !skipped(m.target)) doAttrs(m.target);
            }
        });
        observer.observe(document.documentElement, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS});
    }
    function unobserve() { if (observer) { observer.disconnect(); observer = null; } }

    /* ═════ Choisir la langue ═════ */
    function applyHtml() {
        if (!hasDom) return;
        document.documentElement.lang = lang;
        if (lang === 'fr') document.documentElement.removeAttribute('data-lang'); else document.documentElement.dataset.lang = lang; // en français : aucun attribut de plus
        try { document.cookie = `${COOKIE}=${lang}; path=/; max-age=31536000; SameSite=Lax`; } catch (_) {}
    }
    function use(code) {
        lang = isCode(code) ? code : 'fr';
        memo.clear();
        compile(lang === 'fr' ? null : load(lang));
    }
    /** setLang('en') : garde le choix, retraduit la page ; l'app redessine l'écran (évènement « lcnda:lang ») */
    function setLang(code, {persist = true, silent = false} = {}) {
        const next = isCode(code) ? code : 'fr', before = lang;
        if (persist && hasDom) { try { if (next === 'fr') localStorage.removeItem(KEY); else localStorage.setItem(KEY, next); } catch (_) {} }
        if (next === before) { applyHtml(); return next; }
        if (hasDom) { unobserve(); revert(document.documentElement); }
        use(next);
        applyHtml();
        if (hasDom) {
            if (next !== 'fr') { walk(document.documentElement); observe(); try { document.title = t('Carnet numérique des ancêtres'); } catch (_) {} }
            else { try { document.title = 'Carnet numérique des ancêtres'; } catch (_) {} }
            banner();
            if (!silent) window.dispatchEvent(new CustomEvent('lcnda:lang', {detail: {lang: next, before}}));
        }
        return next;
    }

    /* ═════ Le bandeau « Traduction faite par une IA » ═════ */
    const AI_NOTE = 'Traduction faite par une IA, pas par une personne — tu as vu une erreur ?';
    function bannerClosed() { try { return localStorage.getItem(BANNER_KEY) === lang; } catch (_) { return false; } }
    function setBannerClosed(v) { try { if (v) localStorage.setItem(BANNER_KEY, lang); else localStorage.removeItem(BANNER_KEY); } catch (_) {} banner(); }
    function banner() {
        if (!hasDom || !document.body) return;
        let el = document.getElementById('lc-i18n-banner');
        if (lang === 'fr' || bannerClosed()) { if (el) el.remove(); return; }
        if (!el) {
            el = document.createElement('div'); el.id = 'lc-i18n-banner'; el.className = 'lc-i18n-banner'; el.setAttribute('role', 'note'); el.setAttribute('data-i18n-off', '');
            document.body.appendChild(el);
            el.addEventListener('click', e => {
                if (e.target.closest('[data-i18n-report]')) { e.preventDefault(); report(); }
                else if (e.target.closest('[data-i18n-close]')) { e.preventDefault(); setBannerClosed(true); }
            });
        }
        const L = info(lang);
        el.innerHTML = `<span class="lc-i18n-banner-ico" aria-hidden="true">🤖</span><span class="lc-i18n-banner-t">${esc(t(AI_NOTE))}</span><button type="button" class="lc-i18n-banner-btn" data-i18n-report>${esc(t('Signaler une erreur'))}</button><button type="button" class="lc-i18n-banner-x" data-i18n-close aria-label="${esc(t('Fermer'))}" title="${esc(t('Fermer'))}">×</button>`;
        el.dataset.lang = L.code;
    }
    /** ouvrir « 🐞 Signaler un problème », déjà rempli pour une erreur de traduction */
    async function report(extra = '') {
        const ext = root.LCNDA_EXT || {};
        if (!ext.reportProblem || !ext.reportProblem.open) return;
        const d = await ext.reportProblem.open();
        const box = d && d.querySelector && d.querySelector('[data-rp-what]');
        if (box) {
            const where = (() => { try { const st = root.LCNDA_APP && root.LCNDA_APP.state; return st ? st.module + (st.module === 'maintenance' ? ' · ' + (st.maintenanceTab || '') : '') : ''; } catch (_) { return ''; } })();
            box.value = `[traduction · ${info(lang).name} (${lang})] ${t('Erreur de traduction sur l’écran')} « ${where} » : ${extra || ''}`.trim();
            box.focus();
        }
        return d;
    }
    function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])); }

    /** menu des 18 langues (nom dans sa langue + drapeau + code) */
    function selectHtml(attrs = '') {
        return `<select ${attrs} data-i18n-off>${LANGS.map(l => `<option value="${l.code}" ${l.code === lang ? 'selected' : ''}>${l.flag} ${l.name} (${l.code.toUpperCase()})</option>`).join('')}</select>`;
    }

    /* ═════ Démarrage ═════ */
    use(storedLang());
    if (hasDom) {
        applyHtml();
        // un menu des langues posé dans la page (écran du premier lancement : <span data-lc-lang-slot>) ; tout menu [data-lc-lang-pick] change la langue
        const slots = () => document.querySelectorAll('[data-lc-lang-slot]:not([data-done])').forEach(el => { el.dataset.done = '1'; el.innerHTML = selectHtml('data-lc-lang-pick aria-label="Langue · Language"'); });
        document.addEventListener('change', e => { const s = e.target && e.target.closest && e.target.closest('select[data-lc-lang-pick]'); if (s) setLang(s.value); });
        slots();
        const start = () => {
            slots();
            if (lang !== 'fr') { walk(document.documentElement); observe(); try { document.title = t('Carnet numérique des ancêtres'); } catch (_) {} }
            banner();
        };
        // tout de suite (ce qui est déjà lu de la page : pas de premier dessin en français), puis une fois la page entière lue
        if (lang !== 'fr' && document.documentElement) { walk(document.documentElement); observe(); }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
    }

    return {
        LANGS, CODES, KEY, COOKIE, AI_NOTE, VERSION,
        get lang() { return lang; }, getLang: () => lang, storedLang, locale, info,
        t, has, plural, frPlural, category, fmtNumber, fmtDate, fmtTime,
        setLang, provide, load, translateText, translate: walk, revert,
        banner, setBannerClosed, bannerClosed, report, selectHtml,
        _dict: () => dict,
    };
});
