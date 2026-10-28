/* LCNDA — ✍️ Accord des mots avec la personne (né / née, décédé / décédée…) : une seule aide pour toute l'app.
 *
 *   LCNDA_ACCORD.accord(qui, mot, {before, x})   (aussi LCNDA_APP.accord et LCNDA_UI.accord)
 *     qui  = une fiche (personne : .gender ; animal : .sex 'M'/'F'), ou directement le sexe ('male', 'female',
 *            'nonbinary', 'unknown', 'M', 'F', 'mâle', 'femelle'…), ou rien (inconnu).
 *     mot  = le texte écrit comme avant, avec « (e) » (ou « (ne) », « (se) », « (le) », « (te) ») là où il s'accorde :
 *            'Né(e) le', 'non crédité(e)', 'Mort(e) pour la France' ;
 *            ou {m: 'veuf', f: 'veuve'} pour un mot qui change plus (fils / fille, il / elle…).
 *     before = ce qu'on écrivait avant pour ces fiches-là, s'il n'était pas « (e) » (lifeText : « Vivante », « Décédée »).
 *     x    = la tournure sans accord, quand il y en a une qui va bien (« Naissance le », « Décès »).
 *   Homme / mâle → masculin ; femme / femelle → féminin ; les autres suivent le réglage :
 *
 *   localStorage['genealogie-accord'] = {other: MODE, unknown: MODE}   (Réglages → Thème et couleurs → « ✍️ Accord des mots »)
 *     other   = sexe « Autre / non binaire » ; unknown = « Non renseigné » (et les animaux dont on ne connaît pas le sexe)
 *     MODE    = 'avant' (départ : on écrit comme avant, « né(e) », « Décédée »), 'f' (« née », comme « la personne »),
 *               'm' (« né »), 'point' (« né·e »), 'paren' (« né(e) »), 'neutre' (« Naissance le … » quand c'est possible, sinon « né(e) »).
 *   Le réglage voyage avec les 💾 Réglages enregistrés et le défaut du site (SITE_DEFAULT_KEYS, site_defaults_allowed_keys).
 *   Aussi pour Node (tests) : require('assets/js/app-accord.js').
 */
(function (root) {
    'use strict';
    const KEY = 'genealogie-accord';
    const MODES = [
        ['avant', 'Comme avant', 'rien ne change : « né(e) », sauf « Vivante », « Décédée » sur la fiche'],
        ['f', 'Au féminin', 'comme on dit « la personne » : « née », « décédée »'],
        ['m', 'Au masculin', '« né », « décédé »'],
        ['point', 'Avec un point médian', '« né·e », « décédé·e »'],
        ['paren', 'Entre parenthèses', '« né(e) », « décédé(e) », partout'],
        ['neutre', 'Sans accord', 'une tournure neutre quand il y en a une (« Naissance le … », « Décès »), sinon « né(e) »'],
    ];
    const IDS = MODES.map(m => m[0]);
    const DEFAULT = {other: 'avant', unknown: 'avant'};
    const clean = v => { const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; return {other: IDS.includes(o.other) ? o.other : DEFAULT.other, unknown: IDS.includes(o.unknown) ? o.unknown : DEFAULT.unknown}; };
    let cache = null, cacheRaw;
    const ls = () => { try { return root.localStorage || null; } catch (_) { return null; } };
    function read() {
        const s = ls(); let raw = null; try { raw = s ? s.getItem(KEY) : null; } catch (_) {}
        if (cache && raw === cacheRaw) return cache;
        let v = null; try { v = raw ? JSON.parse(raw) : null; } catch (_) {}
        cacheRaw = raw; cache = clean(v); return cache;
    }
    function save(v) {
        const c = clean(v), s = ls(); if (!s) { cache = c; return c; }
        try { if (c.other === DEFAULT.other && c.unknown === DEFAULT.unknown) s.removeItem(KEY); else s.setItem(KEY, JSON.stringify(c)); } catch (_) {}
        cache = null; return c;
    }

    /** 'm', 'f', 'x' (autre / non binaire) ou 'u' (non renseigné) */
    function genderOf(who) {
        let g = who;
        if (who && typeof who === 'object') g = who.gender ?? who.sex ?? who.person_gender ?? who.genre ?? '';
        g = String(g ?? '').trim().toLowerCase();
        if (['male', 'm', 'h', 'homme', 'masculin', 'mâle', 'male_animal', '♂'].includes(g)) return 'm';
        if (['female', 'f', 'femme', 'féminin', 'feminin', 'femelle', '♀'].includes(g)) return 'f';
        if (['nonbinary', 'non-binary', 'non_binary', 'other', 'autre', 'x', 'nb'].includes(g)) return 'x';
        return 'u';
    }
    const SUFFIX = /\((e|ne|se|le|te)\)/g;
    /** les formes d'un mot : {m, f, point, paren} */
    function forms(word) {
        if (word && typeof word === 'object') {
            const m = String(word.m ?? ''), f = String(word.f ?? m);
            const pre = f.startsWith(m) && f.length > m.length ? f.slice(m.length) : '';
            return {m, f, point: word.point ?? (pre ? `${m}·${pre}` : `${m}·${f}`), paren: word.paren ?? (pre ? `${m}(${pre})` : `${m} / ${f}`), x: word.x};
        }
        const t = String(word ?? '');
        if (!SUFFIX.test(t)) { SUFFIX.lastIndex = 0; return {m: t, f: t, point: t, paren: t}; }
        SUFFIX.lastIndex = 0;
        return {m: t.replace(SUFFIX, ''), f: t.replace(SUFFIX, '$1'), point: t.replace(SUFFIX, '·$1'), paren: t};
    }
    /** le mot accordé avec la fiche (ou le sexe) */
    function accord(who, word, opts = {}) {
        const F = forms(word), g = genderOf(who);
        if (g === 'm') return F.m;
        if (g === 'f') return F.f;
        const mode = opts.mode || read()[g === 'x' ? 'other' : 'unknown'];
        const x = opts.x ?? F.x;
        switch (mode) {
            case 'f': return F.f;
            case 'm': return F.m;
            case 'point': return F.point;
            case 'paren': return F.paren;
            case 'neutre': return x != null ? String(x) : F.paren;
            default: return opts.before != null ? String(opts.before) : F.paren;
        }
    }
    /** « Vivant », « Décédée »… (lifeText d'app.js passe par là) : pour les autres fiches, « comme avant » = au féminin */
    function life(status, who, opts = {}) {
        if (status === 'living') return accord(who, 'Vivant(e)', {...opts, before: 'Vivante', x: 'En vie'});
        if (status === 'deceased') return accord(who, 'Décédé(e)', {...opts, before: 'Décédée', x: 'Décès'});
        return 'À vérifier';
    }
    /** l'aperçu d'une écriture, pour les choix du réglage */
    const sample = (mode, who = 'nonbinary') => `${accord(who, 'Né(e) le', {mode, x: 'Naissance le'})} 12 mars 1888 · ${accord(who, 'Décédé(e)', {mode, before: 'Décédée', x: 'Décès'})}`;

    /* ═════════ Le cadre « ✍️ Accord des mots » (Réglages → Thème et couleurs, K2 : gardé tout de suite) ═════════ */
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const GROUPS = [['other', 'Sexe « Autre / non binaire »', 'nonbinary'], ['unknown', 'Sexe « Non renseigné » (et les animaux dont on ne connaît pas le sexe)', 'unknown']];
    const PEOPLE = [['Jean MARTIN', 'male', 'm', 'homme'], ['Marie DUPONT', 'female', 'f', 'femme'], ['Camille ROUX', 'nonbinary', 'x', 'autre / non binaire'], ['Dominique LEROY', 'unknown', 'u', 'sexe non renseigné']];
    function previewHtml(v = read()) {
        return PEOPLE.map(([name, g, cls, hint]) => {
            const opt = {mode: g === 'nonbinary' ? v.other : v.unknown};
            const av = root.LCNDA_UI?.avatar ? root.LCNDA_UI.avatar({name, gender: g}, 34, {noSosa: true}) : `<span class="lca-av is-${cls}" aria-hidden="true">${esc(name.charAt(0))}</span>`; // K7 : le portrait commun
            return `<li>${av}<span><span><b>${esc(name)}</b> <span class="muted">· ${esc(hint)}</span></span><small>${esc(accord(g, 'Né(e) le', {...opt, x: 'Naissance le'}))} 12 mars 1888 à Pernay · ${esc(accord(g, 'Marié(e) le', {...opt, x: 'Mariage le'}))} 4 juin 1910 · <span class="ui-badge is-black">† ${esc(life('deceased', g, opt))}</span></small></span></li>`;
        }).join('');
    }
    function panelHtml() {
        const v = read();
        return `<section class="maintenance-panel lca" id="lc-accord" data-lca><h3>✍️ Accord des mots</h3>
            <p class="muted">Sur les fiches d’hommes et de femmes, les mots s’accordent tout seuls : « né le » ou « née le », « décédé » ou « décédée ». Choisis ici comment les écrire pour les autres fiches. Chaque choix est gardé tout de suite.</p>
            <div class="lca-grid">${GROUPS.map(([k, title, g]) => `<fieldset class="lca-group"><legend>${esc(title)}</legend>${MODES.map(([id, name, hint]) => `<label class="lca-choice${v[k] === id ? ' is-active' : ''}"><input type="radio" name="lca-${k}" value="${id}" data-lca-k="${k}" ${v[k] === id ? 'checked' : ''}><span><b>${esc(name)}</b>${id === 'avant' ? ' <span class="ui-badge is-date">au départ</span>' : ''}<small>${esc(hint)}</small><em>${esc(sample(id, g))}</em></span></label>`).join('')}</fieldset>`).join('')}
            <div class="lca-preview"><div class="lca-preview-head"><b>Aperçu</b><button type="button" class="button small secondary" data-lca-reset data-ui-reset>↺ Remettre comme au départ</button></div><ul data-lca-preview>${previewHtml(v)}</ul></div></div>
        </section>`;
    }
    function bind(box) {
        if (!box || box.dataset.lcaBound) return; box.dataset.lcaBound = '1';
        const draw = () => { const v = read(); box.querySelectorAll('[data-lca-k]').forEach(i => { i.checked = v[i.dataset.lcaK] === i.value; i.closest('.lca-choice')?.classList.toggle('is-active', i.checked); }); const p = box.querySelector('[data-lca-preview]'); if (p) p.innerHTML = previewHtml(v); };
        box.addEventListener('change', e => { const i = e.target.closest('[data-lca-k]'); if (!i) return; save({...read(), [i.dataset.lcaK]: i.value}); draw(); });
        box.querySelector('[data-lca-reset]')?.addEventListener('click', () => { save(DEFAULT); draw(); });
        box.lcaDraw = draw;
    }

    const api = {KEY, MODES, DEFAULT, clean, read, save, genderOf, forms, accord, life, sample, panelHtml, bind, previewHtml};
    root.LCNDA_ACCORD = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof document === 'undefined') return;
    // un autre onglet (ou ↶ Annuler) a changé le réglage : relu au prochain mot
    root.addEventListener?.('storage', e => { if (e.key === KEY) cache = null; });
    // le cadre, une fois la page de Thème et couleurs dessinée (et à chaque fois qu'elle se redessine)
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    ext.afterDesign = ext.afterDesign || [];
    ext.afterDesign.push(() => {
        const form = document.getElementById('design-form'); if (!form) return;
        let box = document.getElementById('lc-accord');
        if (!box) { const at = document.getElementById('lc-fond') || form; at.insertAdjacentHTML('afterend', panelHtml()); box = document.getElementById('lc-accord'); }
        bind(box);
    });
})(typeof window !== 'undefined' ? window : globalThis);
