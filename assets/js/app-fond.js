/* LCNDA — 🧩 Fond des pages (Réglages → Thème et couleurs ; maquette validée docs/design/fond-des-pages.html).
 *
 * Ce qu'on voit derrière les blocs : 9 fonds (petits carreaux = le départ, uni, pointillés, cahier ligné, papier millimétré,
 * grain de papier, toile, dégradé, ma photo), la taille du motif, son intensité, sa couleur, et les pages concernées.
 * Gardé dans 'genealogie-design' avec le reste de Thème et couleurs (champs cachés du formulaire #design-form :
 * bgKind, bgSize, bgInt, bgColor, bgWhere, bgBlur ; « grid » = 'off' pour Uni, comme avant) : il voyage avec les
 * réglages enregistrés et le défaut du site. La photo n'y est pas (trop lourde) : 'genealogie-bg-photo', sur cet
 * ordinateur ; sans elle (autre ordinateur, défaut du site), le fond est uni.
 * Pose sur <html> : data-lc-bg + --lc-bg-img / --lc-bg-size (designs.css), data-lc-bgoff (pages décochées) ;
 * app.js pose data-lcnda-page (la page ouverte).
 * Priorités (validées) : Accessibilité → Contraste élevé et « Une chose à la fois » mettent un fond uni ; sur une fiche,
 * le grain du style « Papier ancien » passe devant. Le cadre le dit.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const PHOTO_KEY = 'genealogie-bg-photo';
    const KINDS = [
        ['carreaux', 'Petits carreaux', 'comme aujourd’hui'], ['uni', 'Uni', 'rien derrière, le plus calme'], ['points', 'Pointillés', 'une grille de petits points'],
        ['ligne', 'Cahier ligné', 'lignes et marge rouge'], ['milli', 'Papier millimétré', 'fin, trait plus fort tous les 5'], ['grain', 'Grain de papier', 'va bien avec « Archive papier »'],
        ['toile', 'Toile', 'tissage léger, album de famille'], ['degrade', 'Dégradé', 'du papier vers la couleur'], ['photo', 'Ma photo', 'pâle et floutée derrière']];
    const SIZES = {s: 18, m: 28, l: 44};
    const COLORS = [['avant', '#0066cc', 'Bleu pâle (comme avant)'], ['gris', '#3c3c3c', 'Gris neutre'], ['principale', '', 'Couleur principale (suit l’Apparence)'], ['sepia', '#8b5a2b', 'Sépia'], ['theme', '', 'Les traits de mon thème (✎ Mes thèmes)']];
    const AREAS = [['dash', 'Tableau de bord', ['dashboard']], ['fiche', 'Personnes et fiches', ['personnes']], ['graph', 'Graphiques et arbres', ['graphiques']],
        ['listes', 'Listes et recherche', ['listes', 'recherche']], ['enq', 'Enquêtes et tableaux', ['enquetes']], ['reg', 'Réglages', ['maintenance']]];
    const HEX = /^#[0-9a-f]{6}$/i;
    const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',');

    /** les réglages, nettoyés (valeurs connues seulement : elles vont dans des styles) */
    function read(d = readDesign()) {
        const kind = d.grid === 'off' ? 'uni' : KINDS.some(k => k[0] === d.bgKind) ? d.bgKind : 'carreaux'; // « grid: off » (Uni, et les anciens réglages) passe devant ; le cadre écrit toujours les deux d'accord
        const int = Math.round(Number(d.bgInt)); const blur = Math.round(Number(d.bgBlur));
        const where = String(d.bgWhere || '').split(/\s+/).filter(w => AREAS.some(a => a[0] === w));
        return {kind, size: SIZES[d.bgSize] ? d.bgSize : 'm', int: int >= 1 && int <= 10 ? int : 4,
            color: COLORS.some(c => c[0] === d.bgColor) || HEX.test(d.bgColor || '') ? d.bgColor : 'avant', off: where, blur: blur >= 0 && blur <= 20 ? blur : 10};
    }
    function readDesign() { try { const d = JSON.parse(localStorage.getItem('genealogie-design') || '{}'); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch (_) { return {}; } }
    const isDefault = F => F.kind === 'carreaux' && F.size === 'm' && F.int === 4 && F.color === 'avant';
    const photo = () => { try { return localStorage.getItem(PHOTO_KEY) || ''; } catch (_) { return ''; } };

    /** la couleur du motif, en « r,g,b » */
    function rgbOf(F, ctx) {
        if (ctx.dark) return '255,255,255'; // en sombre, le motif s'éclaircit tout seul
        if (HEX.test(F.color)) return hexRgb(F.color);
        if (F.color === 'principale') return hexRgb(HEX.test(ctx.blue || '') ? ctx.blue : '#0066cc');
        if (F.color === 'theme') return hexRgb(HEX.test(ctx.line || '') ? ctx.line : '#111111');
        return hexRgb((COLORS.find(c => c[0] === F.color) || COLORS[0])[1]);
    }
    /** le fond : {img, size} (img = 'none' pour uni) ; small = les vignettes des cartes */
    function bgOf(F, ctx, kind = F.kind, small = false) {
        const c = rgbOf(F, ctx), z = small ? Math.round(SIZES[F.size] * .7) : SIZES[F.size], a = .035 * F.int / 4; // 4 = comme avant (.035)
        const rgba = (k = 1) => `rgba(${c},${Math.min(1, a * k).toFixed(3)})`;
        switch (kind) {
            case 'carreaux': return {img: `linear-gradient(${rgba()} 1px, transparent 1px), linear-gradient(90deg, ${rgba()} 1px, transparent 1px)`, size: `${z}px ${z}px`};
            case 'points': return {img: `radial-gradient(${rgba(4)} 1.1px, transparent 1.6px)`, size: `${Math.round(z * .6)}px ${Math.round(z * .6)}px`};
            case 'ligne': { const m = small ? 18 : 46, red = `rgba(220,70,70,${Math.min(1, a * 5).toFixed(3)})`; return {img: `linear-gradient(90deg, transparent ${m}px, ${red} ${m}px, ${red} ${m + 2}px, transparent ${m + 2}px), linear-gradient(transparent ${z - 1}px, ${rgba(2.5)} ${z - 1}px)`, size: `100% 100%, 100% ${z}px`}; }
            case 'milli': { const f = Math.max(4, Math.round(z / 5)); return {img: `linear-gradient(${rgba(2.2)} 1px, transparent 1px), linear-gradient(90deg, ${rgba(2.2)} 1px, transparent 1px), linear-gradient(${rgba(.8)} 1px, transparent 1px), linear-gradient(90deg, ${rgba(.8)} 1px, transparent 1px)`, size: `${f * 5}px ${f * 5}px, ${f * 5}px ${f * 5}px, ${f}px ${f}px, ${f}px ${f}px`}; }
            case 'grain': { const noise = `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${ctx.dark ? 1 : .45} 0 0 0 0 ${ctx.dark ? 1 : .35} 0 0 0 0 ${ctx.dark ? 1 : .2} 0 0 0 ${Math.min(1, a * 6).toFixed(2)} 0'/></filter><rect width='160' height='160' filter='url(#n)'/></svg>`;
                return {img: `radial-gradient(${rgba(2.2)} 1px, transparent 1.2px), url("data:image/svg+xml;utf8,${encodeURIComponent(noise)}")`, size: `${Math.max(4, Math.round(z * .22))}px ${Math.max(4, Math.round(z * .22))}px, 160px 160px`}; }
            case 'toile': { const s = Math.max(4, Math.round(z / 5)); return {img: `repeating-linear-gradient(45deg, ${rgba(1.6)} 0 1px, transparent 1px ${s}px), repeating-linear-gradient(-45deg, ${rgba(1.6)} 0 1px, transparent 1px ${s}px)`, size: 'auto'}; }
            case 'degrade': return {img: `linear-gradient(180deg, transparent 0%, ${rgba(4)} 100%)`, size: '100% 100%'};
            case 'photo': { const url = small ? (photo() || DEMO) : (blurred.url || ''); if (!url) return {img: 'none', size: 'auto'};
                const veil = `color-mix(in srgb, var(--paper, #fff) ${Math.round(96 - F.int * 6)}%, transparent)`; return {img: `linear-gradient(${veil}, ${veil}), url("${url}")`, size: 'cover', photo: true}; }
            default: return {img: 'none', size: 'auto'};
        }
    }
    // une maison dessinée : la vignette « Ma photo » tant qu'il n'y a pas de photo
    const DEMO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260"><rect width="400" height="260" fill="#cfe1f0"/><rect y="170" width="400" height="90" fill="#8fb36b"/><polygon points="120,110 210,50 300,110" fill="#9c4a2f"/><rect x="135" y="110" width="150" height="90" fill="#e9d8b8"/><rect x="160" y="130" width="28" height="28" fill="#5a7d9a"/><rect x="232" y="130" width="28" height="28" fill="#5a7d9a"/><rect x="198" y="155" width="26" height="45" fill="#6b4226"/><circle cx="330" cy="60" r="26" fill="#f5d36b"/><circle cx="60" cy="150" r="38" fill="#4f7d3a"/></svg>');

    /** la photo floutée, fabriquée une fois (canvas) pour la taille de flou choisie */
    const blurred = {src: '', blur: -1, url: '', busy: null};
    function makeBlurred(src, blur) {
        if (!src) { blurred.src = ''; blurred.url = ''; return Promise.resolve(''); }
        if (blurred.src === src && blurred.blur === blur && blurred.url) return Promise.resolve(blurred.url);
        return new Promise(res => { const img = new Image(); img.onload = () => {
            try { const k = Math.min(1, 1200 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
                const g = c.getContext('2d'); g.filter = blur ? `blur(${blur}px)` : 'none'; g.drawImage(img, -blur * 2, -blur * 2, c.width + blur * 4, c.height + blur * 4);
                Object.assign(blurred, {src, blur, url: c.toDataURL('image/jpeg', .82)}); } catch (_) { Object.assign(blurred, {src, blur, url: src}); }
            res(blurred.url); }; img.onerror = () => res(''); img.src = src; });
    }

    /** pose le fond sur <html> ; ctx = {dark, blue, line} (app.js applyDesign) */
    let lastCtx = {dark: false, blue: '#0066cc', line: ''};
    function apply(design = readDesign(), ctx = lastCtx) {
        lastCtx = ctx; const root = document.documentElement, F = read(design);
        root.setAttribute('data-lc-bgoff', F.off.join(' ')); if (!F.off.length) root.removeAttribute('data-lc-bgoff');
        const clear = () => { root.removeAttribute('data-lc-bg'); root.style.removeProperty('--lc-bg-img'); root.style.removeProperty('--lc-bg-size'); };
        if (F.kind === 'uni' || (F.kind === 'carreaux' && isDefault(F) && !ctx.dark)) { clear(); if (F.kind === 'uni') root.setAttribute('data-lc-grid', 'off'); else root.removeAttribute('data-lc-grid'); return F; }
        root.removeAttribute('data-lc-grid');
        if (F.kind === 'photo') {
            const src = photo();
            if (!src) { clear(); root.setAttribute('data-lc-grid', 'off'); return F; } // pas de photo ici (autre ordinateur, défaut du site) : uni
            if (blurred.src !== src || blurred.blur !== F.blur || !blurred.url) { clear(); makeBlurred(src, F.blur).then(() => apply(readDesign(), lastCtx)); return F; }
        }
        if (F.kind === 'carreaux' && isDefault(F) && ctx.dark) { clear(); return F; } // le départ, en sombre : comme avant
        const b = bgOf(F, ctx);
        root.setAttribute('data-lc-bg', F.kind); root.style.setProperty('--lc-bg-img', b.img); root.style.setProperty('--lc-bg-size', b.size);
        return F;
    }
    /** la page ouverte (pour « Sur quelles pages ») */
    function setModule(mod) { document.documentElement.setAttribute('data-lcnda-page', mod || ''); }

    /* ═════════ Le cadre « 🧩 Fond des pages » (dans le formulaire #design-form) ═════════ */
    const FIELDS = ['bgKind', 'bgSize', 'bgInt', 'bgColor', 'bgWhere', 'bgBlur', 'grid'];
    function valuesOf(F) { return {bgKind: F.kind, bgSize: F.size, bgInt: String(F.int), bgColor: F.color, bgWhere: F.off.join(' '), bgBlur: String(F.blur), grid: F.kind === 'uni' ? 'off' : 'on'}; }
    function panelHtml(design) {
        const F = read(design), V = valuesOf(F);
        return `<section class="maintenance-panel lcf" id="lc-fond" data-lcf><h3>🧩 Fond des pages</h3>
            <p class="muted">Ce qu’on voit derrière les blocs, sur toutes les pages. Le fond reste très pâle pour ne jamais gêner la lecture ; la couleur du papier vient du Preset (ou de ton thème).</p>
            ${FIELDS.map(n => `<input type="hidden" name="${n}" value="${esc(V[n])}" form="design-form" data-lcf-f="${n}">`).join('')}
            <p class="ui-notice ui-notice-info lcf-prio" data-lcf-prio hidden></p>
            <div class="lcf-lab"><span>1</span> Le fond</div><div class="lcf-choices" data-lcf-choices></div>
            <div class="lcf-grid"><div>
                <div class="lcf-lab"><span>2</span> Réglages en plus</div>
                <div class="lcf-set" data-lcf-set="size"><div class="lcf-k">Taille du motif</div><div class="segmented lcf-seg" data-lcf-seg="size">${[['s', 'Petit'], ['m', 'Moyen'], ['l', 'Grand']].map(([v, l]) => `<button type="button" data-v="${v}">${l}</button>`).join('')}</div><p class="muted">Les carreaux, points ou lignes plus serrés ou plus espacés.</p></div>
                <div class="lcf-set" data-lcf-set="int"><div class="lcf-k"><label for="lcf-int">Intensité</label><output data-lcf-intout></output></div><input type="range" id="lcf-int" min="1" max="10" step="1" data-lcf-int><p class="muted">De « à peine visible » à « bien marqué ». Au départ : comme aujourd’hui.</p></div>
                <div class="lcf-set" data-lcf-set="color"><div class="lcf-k">Couleur du motif</div><div class="lcf-colors">${COLORS.map(([k, hex, t]) => `<button type="button" class="lcf-sw is-${k}" data-lcf-color="${k}" title="${esc(t)}" aria-label="${esc(t)}"${hex ? ` style="background:${hex}"` : ''}></button>`).join('')}<label class="lcf-own"><input type="color" data-lcf-own aria-label="Une couleur à moi"> à moi</label></div>
                    <p class="muted">Bleu pâle = comme avant · gris · la couleur principale de l’Apparence (elle suit si tu la changes) · sépia · la couleur des traits de ton thème (✎ Mes thèmes) · une couleur à toi.</p></div>
                <div class="lcf-set" data-lcf-set="photo" hidden><div class="lcf-k">Ta photo</div><div class="lcf-row"><label class="button small secondary">Choisir une photo…<input type="file" accept="image/*" data-lcf-file hidden></label><button type="button" class="button small secondary" data-lcf-nophoto>Retirer la photo</button><span class="muted" data-lcf-pname></span></div>
                    <div class="lcf-k" style="margin-top:10px"><label for="lcf-blur">Flou</label><output data-lcf-blurout></output></div><input type="range" id="lcf-blur" min="0" max="20" step="1" data-lcf-blur>
                    <p class="muted">Pâlie par l’intensité et floutée, pour rester derrière sans gêner. Elle reste sur cet ordinateur (pas dans le défaut du site : là-bas, fond uni).</p></div>
                <div class="lcf-set"><div class="lcf-k">Sur quelles pages</div><div class="lcf-where">${AREAS.map(([k, l]) => `<label><input type="checkbox" data-lcf-area="${k}"> ${l}</label>`).join('')}</div>
                    <p class="muted">Décoché : fond uni sur ces pages. La carte et les éditeurs plein écran gardent toujours le leur.</p></div>
                <div class="lcf-actions"><button type="button" class="button secondary" data-lcf-reset>↺ Remettre comme au départ</button></div>
            </div><div>
                <div class="lcf-lab"><span>3</span> Aperçu vivant</div>
                <div class="lcf-pvh"><b>👁 Une page de l’app</b><div class="segmented lcf-seg" data-lcf-seg="pvmode"><button type="button" data-v="clair">☀︎ Clair</button><button type="button" data-v="sombre">☾ Sombre</button></div></div>
                <div class="lcf-mini" data-lcf-mini><div class="lcf-top"><span data-p="dash">Tableau de bord</span><span data-p="fiche">Personnes</span><span data-p="reg">Réglages</span></div><div class="lcf-sd"><i class="on"></i><i></i><i></i><i></i></div>
                    <div class="lcf-ws" data-lcf-ws><div class="lcf-content"><h5 data-lcf-title></h5><div class="lcf-c">Identité<u></u><u></u><u></u></div><div class="lcf-c">Événements<u></u><u></u><u></u></div><div class="lcf-c">Famille<u></u><u></u></div><div class="lcf-c">Documents<u></u><u></u></div></div></div></div>
                <div class="lcf-row lcf-pvon"><span class="muted">Voir sur :</span><div class="segmented lcf-seg" data-lcf-seg="pvpage"><button type="button" data-v="fiche">une fiche</button><button type="button" data-v="dash">le tableau de bord</button><button type="button" data-v="reg">les Réglages</button></div></div>
                <p class="muted" data-lcf-pvnote></p>
            </div></div></section>`;
    }
    /** les couleurs du moment (Preset, couleur principale, thème) pour l'aperçu et les vignettes */
    const ctxNow = () => ({...lastCtx});
    function bind(box) {
        if (!box || box.dataset.lcfBound) return; box.dataset.lcfBound = '1';
        const $ = s => box.querySelector(s), field = n => box.querySelector(`[data-lcf-f="${n}"]`);
        let pv = {dark: !!lastCtx.dark, page: 'fiche'};
        const cur = () => read(Object.fromEntries(FIELDS.map(n => [n, field(n).value])));
        const draw = () => {
            const F = cur(), ctx = ctxNow();
            $('[data-lcf-choices]').innerHTML = KINDS.map(([k, t, s]) => `<button type="button" class="lcf-ch${F.kind === k ? ' is-on' : ''}" data-lcf-kind="${k}" aria-pressed="${F.kind === k}"><span class="lcf-th"><span class="lcf-bg" data-th="${k}"></span>${k === 'photo' ? '<span class="lcf-veil"></span>' : ''}<i></i><i></i></span><b>${t}${k === 'carreaux' ? ' <span class="lcf-pill is-def">Par défaut</span>' : k === 'uni' ? '' : ' <span class="lcf-pill">Nouveau</span>'}</b><small>${s}</small></button>`).join('');
            box.querySelectorAll('[data-th]').forEach(el => { const b = bgOf(F, {...ctx, dark: false}, el.dataset.th, true); el.style.backgroundImage = b.img; el.style.backgroundSize = b.size; el.style.backgroundPosition = b.photo ? 'center' : '0 0'; if (b.photo) el.style.filter = 'blur(3px)'; });
            box.querySelectorAll('[data-lcf-seg="size"] button').forEach(b => b.classList.toggle('is-active', b.dataset.v === F.size));
            box.querySelectorAll('[data-lcf-seg="pvmode"] button').forEach(b => b.classList.toggle('is-active', (b.dataset.v === 'sombre') === pv.dark));
            box.querySelectorAll('[data-lcf-seg="pvpage"] button').forEach(b => b.classList.toggle('is-active', b.dataset.v === pv.page));
            const ir = $('[data-lcf-int]'); if (Number(ir.value) !== F.int) ir.value = F.int;
            $('[data-lcf-intout]').textContent = F.int <= 2 ? 'à peine visible' : F.int <= 5 ? (F.int === 4 ? 'normale (comme avant)' : 'normale') : F.int <= 8 ? 'marquée' : 'bien marquée';
            const br = $('[data-lcf-blur]'); if (Number(br.value) !== F.blur) br.value = F.blur; $('[data-lcf-blurout]').textContent = F.blur < 4 ? 'léger' : F.blur < 12 ? 'fort' : 'très fort';
            box.querySelectorAll('[data-lcf-color]').forEach(b => b.classList.toggle('is-on', b.dataset.lcfColor === F.color));
            const own = $('[data-lcf-own]'); own.closest('label').classList.toggle('is-on', HEX.test(F.color)); if (HEX.test(F.color)) own.value = F.color;
            const pr = box.querySelector('.lcf-sw.is-principale'); if (pr) pr.style.background = HEX.test(ctx.blue || '') ? ctx.blue : '#0066cc';
            const th = box.querySelector('.lcf-sw.is-theme'); if (th) { th.style.background = HEX.test(ctx.line || '') ? ctx.line : '#111'; th.disabled = !ctx.line; th.title = ctx.line ? COLORS[4][2] : 'Les traits de mon thème : choisis d’abord un thème à toi (✎ Mes thèmes)'; }
            box.querySelectorAll('[data-lcf-area]').forEach(c => { c.checked = !F.off.includes(c.dataset.lcfArea); });
            $('[data-lcf-set="photo"]').hidden = F.kind !== 'photo';
            $('[data-lcf-pname]').textContent = photo() ? '✓ une photo est choisie' : 'Pas encore de photo : fond uni en attendant.';
            $('[data-lcf-nophoto]').hidden = !photo();
            $('[data-lcf-set="size"]').classList.toggle('is-off', ['uni', 'photo', 'degrade'].includes(F.kind));
            $('[data-lcf-set="color"]').classList.toggle('is-off', ['uni', 'photo'].includes(F.kind));
            $('[data-lcf-set="int"]').classList.toggle('is-off', F.kind === 'uni');
            // l'aperçu
            const mini = $('[data-lcf-mini]'), ws = $('[data-lcf-ws]'), on = !F.off.includes(pv.page);
            mini.classList.toggle('is-dark', pv.dark);
            const pctx = {...ctx, dark: pv.dark}, b = on ? (F.kind === 'photo' ? bgOf(F, pctx, 'photo', true) : bgOf(F, pctx)) : {img: 'none', size: 'auto'};
            ws.style.backgroundImage = b.img; ws.style.backgroundSize = b.size; ws.style.backgroundPosition = b.photo ? 'center' : '0 0';
            box.querySelectorAll('.lcf-top span').forEach(s => s.classList.toggle('on', s.dataset.p === pv.page));
            $('[data-lcf-title]').textContent = {fiche: 'Louise BORIE', dash: 'Vue d’ensemble', reg: 'Thème et couleurs'}[pv.page];
            $('[data-lcf-pvnote]').textContent = !on ? 'Cette page est décochée dans « Sur quelles pages » : fond uni ici.' : F.kind === 'uni' ? 'Fond uni : rien derrière les blocs.' : F.kind === 'photo' && !photo() ? 'Choisis une photo : en attendant, la maison de l’exemple.' : `${KINDS.find(k => k[0] === F.kind)[1]} — ${pv.dark ? 'en mode sombre, le motif s’éclaircit tout seul' : 'la couleur du papier vient du Preset'}.`;
            // ce qui passe devant (validé) : on le dit au lieu de laisser croire que le choix ne marche pas
            const root = document.documentElement, prio = [];
            if (root.classList.contains('a11y-contrast')) prio.push('Accessibilité → « Contraste élevé » est activé : il met un fond uni partout, il passe devant ce réglage.');
            if (root.classList.contains('a11y-simple')) prio.push('Accessibilité → « Une chose à la fois » est activé : il met un fond uni partout, il passe devant ce réglage.');
            try { const G = window.LCNDA_DESIGNS?.read?.(); if (G?.a1?.v === 'papier') prio.push('Style des fiches « Papier ancien » : sur une fiche, son grain de papier passe devant ce fond.'); } catch (_) {}
            const pe = $('[data-lcf-prio]'); pe.hidden = !prio.length; pe.innerHTML = prio.map(esc).join('<br>');
        };
        const set = patch => { Object.entries(patch).forEach(([n, v]) => { const f = field(n); if (f) f.value = v; }); if ('bgKind' in patch) field('grid').value = patch.bgKind === 'uni' ? 'off' : 'on'; // le fond choisi décide (« grid » suit)
            const d = {...readDesign(), ...Object.fromEntries(FIELDS.map(n => [n, field(n).value]))}; apply(d, lastCtx); // tout de suite à l'écran ; le formulaire le garde (✓ Enregistré, ↶ Annuler)
            field('bgKind').dispatchEvent(new Event('change', {bubbles: true})); draw(); };
        box.addEventListener('click', e => {
            const k = e.target.closest('[data-lcf-kind]'); if (k) { set({bgKind: k.dataset.lcfKind}); if (k.dataset.lcfKind === 'photo' && !photo()) $('[data-lcf-file]').click(); return; }
            const sb = e.target.closest('[data-lcf-seg] button'); if (sb) { const g = sb.parentElement.dataset.lcfSeg;
                if (g === 'size') set({bgSize: sb.dataset.v}); else { if (g === 'pvmode') pv.dark = sb.dataset.v === 'sombre'; if (g === 'pvpage') pv.page = sb.dataset.v; draw(); } return; }
            const c = e.target.closest('[data-lcf-color]'); if (c && !c.disabled) { set({bgColor: c.dataset.lcfColor}); return; }
            if (e.target.closest('[data-lcf-nophoto]')) { try { localStorage.removeItem(PHOTO_KEY); } catch (_) {} Object.assign(blurred, {src: '', url: ''}); set({}); return; }
            if (e.target.closest('[data-lcf-reset]')) set({bgKind: 'carreaux', bgSize: 'm', bgInt: '4', bgColor: 'avant', bgWhere: '', bgBlur: '10'});
        });
        $('[data-lcf-int]').addEventListener('change', e => set({bgInt: e.target.value}));
        $('[data-lcf-int]').addEventListener('input', e => { field('bgInt').value = e.target.value; draw(); });
        $('[data-lcf-blur]').addEventListener('change', e => set({bgBlur: e.target.value}));
        $('[data-lcf-own]').addEventListener('change', e => { if (HEX.test(e.target.value)) set({bgColor: e.target.value.toLowerCase()}); });
        box.addEventListener('change', e => { const a = e.target.closest('[data-lcf-area]'); if (!a) return; e.stopPropagation(); const off = [...box.querySelectorAll('[data-lcf-area]')].filter(x => !x.checked).map(x => x.dataset.lcfArea); set({bgWhere: off.join(' ')}); });
        $('[data-lcf-file]').addEventListener('change', e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; if (!/^image\//.test(f.type)) { A().toast?.('Ce fichier n’est pas une image.', 'error'); return; }
            const img = new Image(), url = URL.createObjectURL(f);
            img.onload = () => { URL.revokeObjectURL(url); try { const k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                localStorage.setItem(PHOTO_KEY, c.toDataURL('image/jpeg', .8)); } catch (_) { A().toast?.('La photo est trop lourde pour être gardée.', 'error'); return; }
                set({bgKind: 'photo'}); };
            img.onerror = () => { URL.revokeObjectURL(url); A().toast?.('Image illisible.', 'error'); }; img.src = url; });
        draw();
        box.lcfDraw = draw;
    }

    window.LCNDA_FOND = {KINDS, AREAS, PHOTO_KEY, read, apply, setModule, panelHtml, bind, bgOf};
    // le cadre, une fois la page de Thème et couleurs dessinée (et à chaque fois qu'elle se redessine)
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.afterDesign = ext.afterDesign || [];
    ext.afterDesign.push(() => { const box = document.getElementById('lc-fond'); if (!box) return;
        const form = box.closest('#design-form'); if (form) form.after(box); // un cadre à part, sous le formulaire (ses champs restent du formulaire : form="design-form")
        bind(box); });
})();
