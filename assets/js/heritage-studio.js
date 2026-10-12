/**
 * Atelier : 🎨 mises en page enregistrées (Apparence) · 🖼️ retouche des photos · 📋 Mes listes dans Listes et partagées.
 * Chargé après heritage-more.js (window.LCNDA_APP, window.LCNDA_EXT).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const key of ['lists', 'maintenance']) ext[key] = ext[key] || {};
    for (const key of ['designPanels', 'afterDesign']) ext[key] = ext[key] || [];
    const esc = value => A().escapeHtml(value ?? '');
    const api = (...args) => A().api(...args);
    const toast = (...args) => A().toast(...args);
    const S = () => A().state;
    const ls = (key, fallback = null) => { try { return localStorage.getItem(key) ?? fallback; } catch (_) { return fallback; } };
    const lsSet = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };
    const lsDel = key => { try { localStorage.removeItem(key); } catch (_) {} };
    const slug = text => String(text || 'sans-nom').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'sans-nom';
    /** Fait télécharger un fichier texte (JSON) au navigateur ou à Electron. */
    function downloadText(name, text, type = 'application/json') {
        const url = URL.createObjectURL(new Blob([text], {type}));
        const a = Object.assign(document.createElement('a'), {href: url, download: name});
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    /** Demande un fichier à l'utilisateur et rend son texte (ou null). */
    const pickFile = accept => new Promise(resolve => {
        const input = Object.assign(document.createElement('input'), {type: 'file', accept});
        input.addEventListener('change', async () => resolve(input.files[0] ? await input.files[0].text() : null));
        input.click();
    });
    ext.downloadText = downloadText;
    ext.pickFile = pickFile;

    /* ═══════════════════════ 🎨 MISES EN PAGE ENREGISTRÉES (Maintenance → Apparence) ═══════════════════════ */

    // Tout ce que règle l'écran Apparence : design, menus (ordre, masqués), listes, cartes, graphiques, blocs des
    // fiches et du tableau de bord, couleurs, fonds de carte… (pas les données, ni les raccourcis, ni les sauvegardes).
    const LAYOUT_KEYS = [
        'genealogie-design', 'genealogie-menu-order', 'genealogie-menu-hidden',
        'genealogie-list-order', 'genealogie-list-hidden', 'genealogie-map-order', 'genealogie-map-hidden', 'genealogie-maintenance-order',
        'genealogie-graph-diagram-order', 'genealogie-graph-diagram-hidden', 'genealogie-graph-stats-order', 'genealogie-graph-stats-hidden',
        'genealogie-tile-cat-order', 'genealogie-tile-hidden-cats', 'genealogie-tile-hidden', 'genealogie-tile-custom-cats',
        'genealogie-person-blocks', 'genealogie-dashboard-blocks', 'genealogie-dashboard-widget-catalog-order', 'genealogie-dashboard-widget-catalog-hidden',
        'genealogie-events-filter', 'genealogie-stats-colors', 'genealogie-gender-colors', 'genealogie-tree-card-fields', 'genealogie-identity-name-variants-display',
        'genealogie-battue-level-colors', 'genealogie-person-badge-colors', 'genealogie-archive-digest-category-order', 'genealogie-heritage-flags',
        'genealogie-village-maps', 'genealogie-transcription-layout'
    ];
    const LAYOUT_PREFIXES = ['genealogie-tile-items-'];
    const PROFILES_KEY = 'genealogie-layout-profiles';
    const isLayoutKey = key => LAYOUT_KEYS.includes(key) || LAYOUT_PREFIXES.some(p => key.startsWith(p));
    function currentLayout() {
        const settings = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && isLayoutKey(key)) settings[key] = localStorage.getItem(key);
        }
        return settings;
    }
    const profiles = () => { try { const p = JSON.parse(ls(PROFILES_KEY, '[]')); return Array.isArray(p) ? p : []; } catch (_) { return []; } };
    const saveProfiles = list => lsSet(PROFILES_KEY, JSON.stringify(list));
    const profileSummary = settings => {
        const count = key => { try { const v = JSON.parse(settings[key] || '[]'); return Array.isArray(v) ? v.length : Object.keys(v || {}).length; } catch (_) { return 0; } };
        const parts = [];
        if (settings['genealogie-design']) parts.push('design');
        if (settings['genealogie-menu-order'] || settings['genealogie-menu-hidden']) parts.push(`menus${count('genealogie-menu-hidden') ? ` (${count('genealogie-menu-hidden')} masqué(s))` : ''}`);
        if (settings['genealogie-list-order'] || settings['genealogie-list-hidden']) parts.push('listes');
        if (settings['genealogie-person-blocks']) parts.push('blocs des fiches');
        if (settings['genealogie-dashboard-blocks']) parts.push('tableau de bord');
        if (Object.keys(settings).some(k => k.startsWith('genealogie-tile'))) parts.push('fonds de carte');
        if (Object.keys(settings).some(k => /colors/.test(k))) parts.push('couleurs');
        return parts.join(' · ') || 'réglages de départ';
    };
    /** Applique une mise en page : chaque réglage enregistré est remis, les autres reviennent au réglage de départ. */
    async function applyLayout(settings) {
        const removed = []; // (un fichier reçu a déjà été vérifié à l'import)
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && isLayoutKey(key) && !(key in settings)) { removed.push(key); lsDel(key); }
        }
        const set = {};
        Object.entries(settings).forEach(([key, value]) => { if (isLayoutKey(key) && typeof value === 'string') { set[key] = value; lsSet(key, value); } });
        // Les réglages sont aussi gardés dans la base : on attend qu'elle les ait reçus avant de recharger l'écran,
        // sinon la page rechargée reprendrait les anciens.
        try {
            const csrf = window.INSTALL_CSRF || S().csrf || '';
            const r = await fetch('api.php?action=save_settings', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf}, body: JSON.stringify({set, remove: removed, csrf})});
            if (!r.ok) throw new Error();
        } catch (_) { toast('La base n’a pas pu enregistrer la mise en page : réessaie.', 'error'); return; }
        // Tout l'écran se redessine avec la nouvelle mise en page (menus, blocs, couleurs).
        location.reload();
    }
    /**
     * Valeurs d'un fichier de mise en page reçu : seulement ce que l'écran Apparence peut lui-même produire.
     * (Certaines valeurs, comme les couleurs des graphiques, sont écrites telles quelles dans la page.)
     */
    const COLOR_KEYS = ['genealogie-stats-colors', 'genealogie-battue-level-colors', 'genealogie-person-badge-colors', 'genealogie-gender-colors'];
    function safeLayoutValue(key, value) {
        if (typeof value !== 'string' || value.length > 200000) return false;
        if (/[<>`]|javascript:|expression\(|url\(/i.test(value)) return false;
        let parsed; try { parsed = JSON.parse(value); } catch (_) { return !/["']/.test(value); }
        const leaves = []; const walk = v => { if (v && typeof v === 'object') Object.values(v).forEach(walk); else leaves.push(v); }; walk(parsed);
        if (COLOR_KEYS.includes(key)) return leaves.every(v => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v));
        return leaves.every(v => typeof v !== 'string' || !/["\\]/.test(v));
    }
    const cleanLayout = settings => Object.fromEntries(Object.entries(settings || {}).filter(([k, v]) => isLayoutKey(k) && safeLayoutValue(k, v)));
    const validProfile = p => p && typeof p === 'object' && typeof p.name === 'string' && p.settings && typeof p.settings === 'object';
    ext.designPanels.push(() => {
        const list = profiles();
        return `<section class="person-block-config h-layouts" id="h-layouts"><header><span class="eyebrow">MISES EN PAGE</span><h3>Mes mises en page enregistrées</h3><p>Garde <b>tous</b> les réglages de l’Apparence sous un nom : design, menus affichés ou masqués et leur ordre, listes, cartes, graphiques, blocs des fiches et du tableau de bord, couleurs, fonds de carte. Tu peux y revenir en un clic, ou envoyer le fichier à un autre utilisateur de LCNDA.</p></header>
            <div class="h-layouts-save"><input type="text" id="h-layout-name" maxlength="60" placeholder="Nom de la mise en page (ex. Mode salon, Ma version épurée)"><button type="button" class="button small" data-h-layout-save>Enregistrer la mise en page actuelle</button><button type="button" class="button small secondary" data-h-layout-import>Importer un fichier…</button></div>
            ${list.length ? `<ul class="h-layouts-list">${list.map((p, i) => `<li><div><strong>${esc(p.name)}</strong><small>${esc(profileSummary(p.settings))}${p.saved ? ` · ${esc(new Date(p.saved).toLocaleDateString('fr-FR'))}` : ''}${p.from ? ` · reçue de ${esc(p.from)}` : ''}</small></div>
                <span class="page-actions"><button type="button" class="button small" data-h-layout-apply="${i}">Appliquer</button><button type="button" class="button small secondary" data-h-layout-update="${i}" title="Remplacer par les réglages actuels">Mettre à jour</button><button type="button" class="button small secondary" data-h-layout-rename="${i}">Renommer</button><button type="button" class="button small secondary" data-h-layout-export="${i}">Partager (fichier)</button><button type="button" class="button small secondary danger" data-h-layout-delete="${i}">Supprimer</button></span></li>`).join('')}</ul>` : '<p class="cell-muted">Aucune mise en page enregistrée.</p>'}</section>`;
    });
    ext.afterDesign.push(() => {
        const box = document.getElementById('h-layouts');
        if (!box) return;
        const rerender = () => A().renderMaintenance?.();
        const nameInput = box.querySelector('#h-layout-name');
        const save = () => {
            const name = nameInput.value.trim();
            if (!name) { toast('Donne un nom à cette mise en page.', 'error'); nameInput.focus(); return; }
            const list = profiles();
            const same = list.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
            if (same >= 0 && !confirm(`Une mise en page « ${list[same].name} » existe déjà. La remplacer ?`)) return;
            const entry = {name, saved: new Date().toISOString(), settings: currentLayout()};
            if (same >= 0) list[same] = entry; else list.push(entry);
            saveProfiles(list); toast(`Mise en page « ${name} » enregistrée.`); rerender();
        };
        box.querySelector('[data-h-layout-save]').addEventListener('click', save);
        nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
        box.querySelector('[data-h-layout-import]').addEventListener('click', async () => {
            const text = await pickFile('.json,application/json');
            if (text === null) return;
            let data; try { data = JSON.parse(text); } catch (_) { return toast('Ce fichier n’est pas une mise en page LCNDA.', 'error'); }
            if (data?.type !== 'lcnda-mise-en-page' || !validProfile(data)) return toast('Ce fichier n’est pas une mise en page LCNDA.', 'error');
            const settings = cleanLayout(data.settings);
            const ignored = Object.keys(data.settings).length - Object.keys(settings).length;
            const list = profiles();
            let name = data.name.slice(0, 60);
            while (list.some(p => p.name === name)) name = `${name} (2)`;
            list.push({name, saved: new Date().toISOString(), from: String(data.author || '').slice(0, 60), settings});
            saveProfiles(list);
            toast(`Mise en page « ${name} » importée : clique sur « Appliquer » pour l’utiliser.${ignored > 0 ? ` (${ignored} réglage(s) illisible(s) laissé(s) de côté)` : ''}`); rerender();
        });
        const at = (attr, fn) => box.querySelectorAll(`[${attr}]`).forEach(b => b.addEventListener('click', () => { const list = profiles(), i = Number(b.getAttribute(attr)); if (list[i]) fn(list, i, list[i]); }));
        at('data-h-layout-apply', (list, i, p) => {
            if (!confirm(`Appliquer la mise en page « ${p.name} » ?\n\nTous les réglages de l’Apparence seront remplacés (pense à enregistrer la mise en page actuelle si tu veux la garder). L’écran va se recharger.`)) return;
            toast(`Mise en page « ${p.name} » appliquée.`); applyLayout(p.settings);
        });
        at('data-h-layout-update', (list, i, p) => {
            if (!confirm(`Remplacer « ${p.name} » par les réglages actuels ?`)) return;
            list[i] = {...p, saved: new Date().toISOString(), settings: currentLayout()}; saveProfiles(list); toast('Mise en page mise à jour.'); rerender();
        });
        at('data-h-layout-rename', (list, i, p) => {
            const name = (prompt('Nouveau nom :', p.name) || '').trim().slice(0, 60);
            if (!name) return;
            list[i] = {...p, name}; saveProfiles(list); toast('Mise en page renommée.'); rerender();
        });
        at('data-h-layout-export', (list, i, p) => {
            downloadText(`mise-en-page-${slug(p.name)}.lcnda-apparence.json`, JSON.stringify({type: 'lcnda-mise-en-page', version: 1, name: p.name, saved: p.saved, settings: p.settings}, null, 1));
            toast('Fichier prêt : envoie-le à l’autre personne, elle l’importe dans Maintenance → Apparence.');
        });
        at('data-h-layout-delete', (list, i, p) => {
            if (!confirm(`Supprimer la mise en page « ${p.name} » ? (les réglages actuels ne changent pas)`)) return;
            list.splice(i, 1); saveProfiles(list); toast('Mise en page supprimée.'); rerender();
        });
    });
    /* ═══════════════════════ 🎚️ RETOUCHE DES PHOTOS (visionneuse → « Retoucher ») ═══════════════════════ */

    const RT_SLIDERS = [
        ['exposure', 'Exposition', -100, 100], ['brightness', 'Luminosité', -100, 100], ['contrast', 'Contraste', -100, 100],
        ['shadows', 'Ombres', -100, 100], ['highlights', 'Hautes lumières', -100, 100], ['saturation', 'Saturation', -100, 100], ['warmth', 'Chaleur', -100, 100],
    ];
    const RT_CHANNELS = [['rgb', 'RVB'], ['r', 'Rouge'], ['g', 'Vert'], ['b', 'Bleu']];
    const rtDefault = () => ({exposure: 0, brightness: 0, contrast: 0, shadows: 0, highlights: 0, saturation: 0, warmth: 0, bw: false, sepia: false, invert: false,
        curves: {rgb: [[0, 0], [255, 255]], r: [[0, 0], [255, 255]], g: [[0, 0], [255, 255]], b: [[0, 0], [255, 255]]}});
    const clamp255 = v => v < 0 ? 0 : v > 255 ? 255 : v;
    /** Courbe lisse qui passe par les points sans faire de bosses (interpolation monotone de Fritsch-Carlson). */
    function curveLut(points) {
        const p = [...points].sort((a, b) => a[0] - b[0]).filter((q, i, arr) => i === 0 || q[0] !== arr[i - 1][0]);
        const lut = new Float32Array(256);
        if (p.length < 2) { for (let i = 0; i < 256; i++) lut[i] = i; return lut; }
        const n = p.length, d = [], m = new Array(n).fill(0);
        for (let i = 0; i < n - 1; i++) d.push((p[i + 1][1] - p[i][1]) / (p[i + 1][0] - p[i][0]));
        m[0] = d[0]; m[n - 1] = d[n - 2];
        for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
        for (let i = 0; i < n - 1; i++) {
            if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
            const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
            if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
        }
        for (let x = 0; x < 256; x++) {
            if (x <= p[0][0]) { lut[x] = p[0][1]; continue; }
            if (x >= p[n - 1][0]) { lut[x] = p[n - 1][1]; continue; }
            let k = 0; while (x > p[k + 1][0]) k++;
            const h = p[k + 1][0] - p[k][0], t = (x - p[k][0]) / h, t2 = t * t, t3 = t2 * t;
            lut[x] = (2 * t3 - 3 * t2 + 1) * p[k][1] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * p[k + 1][1] + (t3 - t2) * h * m[k + 1];
        }
        return lut;
    }
    /** Les trois tables (rouge, vert, bleu) qui donnent la valeur retouchée de chaque niveau. */
    function rtLuts(st) {
        const base = new Float32Array(256);
        const exp = Math.pow(2, st.exposure / 50), c = (259 * (st.contrast * 1.275 + 255)) / (255 * (259 - st.contrast * 1.275));
        for (let i = 0; i < 256; i++) {
            let v = st.invert ? 255 - i : i;
            v = v * exp + st.brightness * 1.2;
            v = c * (v - 128) + 128;
            if (v < 128) v += st.shadows * 0.6 * Math.pow(1 - Math.max(0, v) / 128, 2);
            else v += st.highlights * 0.6 * Math.pow((Math.min(255, v) - 128) / 127, 2);
            base[i] = clamp255(v);
        }
        const master = curveLut(st.curves.rgb);
        return ['r', 'g', 'b'].map(ch => { const own = curveLut(st.curves[ch]), lut = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) lut[i] = own[Math.round(clamp255(master[Math.round(base[i])]))]; return lut; });
    }
    function rtApply(src, dst, st) {
        const [lr, lg, lb] = rtLuts(st), sat = 1 + st.saturation / 100, warm = st.warmth * 0.35;
        const a = src.data, o = dst.data, plain = sat === 1 && !warm && !st.bw && !st.sepia;
        for (let i = 0; i < a.length; i += 4) {
            let r = lr[a[i]], g = lg[a[i + 1]], b = lb[a[i + 2]];
            if (!plain) {
                if (sat !== 1) { const y = 0.299 * r + 0.587 * g + 0.114 * b; r = y + (r - y) * sat; g = y + (g - y) * sat; b = y + (b - y) * sat; }
                if (warm) { r += warm; b -= warm; }
                if (st.bw || st.sepia) { const y = 0.299 * r + 0.587 * g + 0.114 * b; if (st.sepia) { r = y * 1.07 + 18; g = y * 0.92 + 8; b = y * 0.72; } else { r = g = b = y; } }
            }
            o[i] = r; o[i + 1] = g; o[i + 2] = b; o[i + 3] = a[i + 3];
        }
        return dst;
    }
    /** Réglage automatique : les 0,5 % les plus sombres deviennent noirs, les 0,5 % les plus clairs deviennent blancs. */
    function rtAuto(img, st) {
        const hist = new Array(256).fill(0); let n = 0;
        for (let i = 0; i < img.data.length; i += 16) { hist[Math.round(0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2])]++; n++; }
        let lo = 0, hi = 255, acc = 0;
        while (lo < 254 && (acc += hist[lo]) < n * 0.005) lo++;
        acc = 0; while (hi > lo + 1 && (acc += hist[hi]) < n * 0.005) hi--;
        Object.assign(st, rtDefault(), {bw: st.bw, sepia: st.sepia, invert: st.invert});
        if (hi - lo < 8) return; // image presque d'une seule teinte : rien à étirer
        st.curves.rgb = [[lo, 0], [Math.round((lo + hi) / 2), 128], [hi, 255]];
    }
    const RT_PRESETS = [
        ['Auto', st => st._auto = true],
        ['Vieille photo ravivée', st => Object.assign(st, {contrast: 22, shadows: 18, highlights: -12, saturation: 18, warmth: -8, curves: {...rtDefault().curves, rgb: [[0, 0], [70, 58], [190, 205], [255, 255]]}})],
        ['Document lisible', st => Object.assign(st, {bw: true, contrast: 45, brightness: 12, curves: {...rtDefault().curves, rgb: [[0, 0], [90, 40], [200, 245], [255, 255]]}})],
        ['Sépia doux', st => Object.assign(st, {sepia: true, contrast: 10, shadows: 10})],
        ['Négatif → positif', st => Object.assign(st, {invert: true, contrast: 15})],
    ];
    const mediaSrc = m => `media/${encodeURIComponent(m.filename)}?v=${m._cacheBust || ''}`;
    /** Retouche d'une photo : on part de la version affichée (ou d'une autre, `source`), le résultat devient une nouvelle version. */
    async function openRetouch(source = '') {
        const st0 = A().state, item = st0.lightboxMedia?.[st0.lightboxIndex];
        if (!item) return;
        let versions = [];
        try { versions = (await api('media_versions', {id: item.id})).versions || []; } catch (_) {}
        const from = source || item.filename;
        const img = new Image(); img.decoding = 'async';
        img.src = `media/${encodeURIComponent(from)}?v=${item._cacheBust || ''}`;
        try { await img.decode(); } catch (_) { return toast('Impossible d’ouvrir cette image.', 'error'); }
        const st = rtDefault(); let channel = 'rgb';
        const scale = Math.min(1, 1100 / Math.max(img.naturalWidth, img.naturalHeight));
        const pw = Math.max(1, Math.round(img.naturalWidth * scale)), ph = Math.max(1, Math.round(img.naturalHeight * scale));
        const work = document.createElement('canvas'); work.width = pw; work.height = ph;
        const wctx = work.getContext('2d', {willReadFrequently: true}); wctx.drawImage(img, 0, 0, pw, ph);
        const srcData = wctx.getImageData(0, 0, pw, ph);
        const hist = new Array(256).fill(0); for (let i = 0; i < srcData.data.length; i += 4) hist[Math.round(0.299 * srcData.data[i] + 0.587 * srcData.data[i + 1] + 0.114 * srcData.data[i + 2])]++;
        const hmax = Math.max(...hist.slice(2, 254), 1);
        const histPath = 'M0,256 ' + hist.map((h, x) => `L${x},${256 - Math.min(256, h / hmax * 230)}`).join(' ') + ' L255,256 Z';
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-retouch';
        dlg.innerHTML = `<div class="h-rt-head"><div><span class="eyebrow">RETOUCHE</span><h2>${esc(item.title || item.filename || 'Photo')}</h2></div><button type="button" class="icon-button" data-rt-close aria-label="Fermer">×</button></div>
            <div class="h-rt-body"><div class="h-rt-stage"><canvas data-rt-canvas width="${pw}" height="${ph}"></canvas><button type="button" class="button small secondary h-rt-before" data-rt-before title="Garder appuyé pour voir l’original">👁 Avant / après</button></div>
            <div class="h-rt-tools"><div class="h-rt-presets">${RT_PRESETS.map(([l], i) => `<button type="button" class="button small secondary" data-rt-preset="${i}">${esc(l)}</button>`).join('')}</div>
                ${RT_SLIDERS.map(([k, l, mn, mx]) => `<label class="h-rt-slider"><span>${esc(l)} <output data-rt-out="${k}">0</output></span><input type="range" min="${mn}" max="${mx}" value="0" data-rt="${k}"></label>`).join('')}
                <div class="h-rt-toggles"><label class="checkbox-line"><input type="checkbox" data-rt-t="bw"> Noir et blanc</label><label class="checkbox-line"><input type="checkbox" data-rt-t="sepia"> Sépia</label><label class="checkbox-line"><input type="checkbox" data-rt-t="invert"> Négatif</label></div>
                <div class="h-rt-curve-head"><strong>Courbe</strong><span>${RT_CHANNELS.map(([k, l]) => `<button type="button" class="h-rt-ch ${k === 'rgb' ? 'is-active' : ''}" data-rt-ch="${k}">${l}</button>`).join('')}</span></div>
                <svg class="h-rt-curve" viewBox="-6 -6 268 268" data-rt-curve><path class="h-rt-hist" d="${histPath}"/><g class="h-rt-grid">${[64, 128, 192].map(v => `<line x1="${v}" y1="0" x2="${v}" y2="256"/><line x1="0" y1="${v}" x2="256" y2="${v}"/>`).join('')}<line x1="0" y1="256" x2="256" y2="0" class="h-rt-diag"/></g><path class="h-rt-line" data-rt-line/><g data-rt-points></g></svg>
                <div class="h-rt-curve-tools"><button type="button" class="button small secondary" data-rt-ptdel disabled>Enlever le point</button></div>
                <p class="muted h-rt-help">Clic sur la courbe : ajouter un point · glisser : le déplacer · pour l’enlever : le choisir puis « Enlever le point » (ou la touche ⌫), ou le glisser hors du cadre. Monter la courbe éclaircit, la creuser assombrit, un « S » donne du contraste.</p>
                <button type="button" class="link-button" data-rt-reset>Tout remettre à zéro</button></div></div>
            <section class="h-rt-versions" data-rt-versions></section>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-rt-close>Annuler</button><button type="button" class="button secondary" data-rt-save="copy" title="Un autre média, rattaché aux mêmes fiches">Copie séparée</button><button type="button" class="button secondary" data-rt-save="keep" title="Gardée dans les versions, la photo affichée ne change pas">Enregistrer sans l’afficher</button><button type="button" class="button" data-rt-save="show">Enregistrer et afficher cette version</button></div>
            <p class="muted h-rt-note">L’original n’est jamais modifié : chaque retouche est une version de la photo, et tu choisis celle qui s’affiche partout.</p>`;
        document.body.appendChild(dlg);
        dlg.addEventListener('close', () => dlg.remove());
        dlg.querySelectorAll('[data-rt-close]').forEach(b => b.addEventListener('click', () => dlg.close()));
        const canvas = dlg.querySelector('[data-rt-canvas]'), ctx = canvas.getContext('2d'), out = ctx.createImageData(pw, ph);
        let raf = 0, showBefore = false, selPt = -1, outside = -1;
        const draw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (showBefore) ctx.putImageData(srcData, 0, 0); else ctx.putImageData(rtApply(srcData, out, st), 0, 0); }); };
        const svg = dlg.querySelector('[data-rt-curve]');
        const drawCurve = () => {
            const lut = curveLut(st.curves[channel]);
            dlg.querySelector('[data-rt-line]').setAttribute('d', 'M' + Array.from(lut, (v, x) => `${x},${256 - v}`).join(' L'));
            dlg.querySelector('[data-rt-line]').dataset.ch = channel;
            const pts = st.curves[channel];
            if (selPt >= pts.length) selPt = -1;
            dlg.querySelector('[data-rt-points]').innerHTML = pts.map(([x, y], i) => `<circle cx="${x}" cy="${256 - y}" r="${i === selPt ? 7 : 5.5}" data-rt-pt="${i}" class="${i === selPt ? 'is-sel' : ''}${i === outside ? ' is-out' : ''}"/>`).join('');
            const del = dlg.querySelector('[data-rt-ptdel]'); if (del) del.disabled = !(selPt >= 0 && pts.length > 2);
        };
        const syncControls = () => {
            RT_SLIDERS.forEach(([k]) => { dlg.querySelector(`[data-rt="${k}"]`).value = st[k]; dlg.querySelector(`[data-rt-out="${k}"]`).textContent = st[k] > 0 ? '+' + st[k] : st[k]; });
            ['bw', 'sepia', 'invert'].forEach(k => { dlg.querySelector(`[data-rt-t="${k}"]`).checked = !!st[k]; });
            drawCurve(); draw();
        };
        dlg.addEventListener('input', e => { const k = e.target.dataset.rt; if (k) { st[k] = Number(e.target.value); dlg.querySelector(`[data-rt-out="${k}"]`).textContent = st[k] > 0 ? '+' + st[k] : st[k]; draw(); } });
        dlg.addEventListener('change', e => { const k = e.target.dataset.rtT; if (k) { st[k] = e.target.checked; if (k === 'bw' && st.bw) st.sepia = false; if (k === 'sepia' && st.sepia) st.bw = false; syncControls(); } });
        dlg.querySelectorAll('[data-rt-ch]').forEach(b => b.addEventListener('click', () => { channel = b.dataset.rtCh; selPt = -1; dlg.querySelectorAll('[data-rt-ch]').forEach(x => x.classList.toggle('is-active', x === b)); drawCurve(); }));
        dlg.querySelectorAll('[data-rt-preset]').forEach(b => b.addEventListener('click', () => { const keep = {bw: false, sepia: false, invert: false}; Object.assign(st, rtDefault(), keep); RT_PRESETS[Number(b.dataset.rtPreset)][1](st); if (st._auto) { delete st._auto; rtAuto(srcData, st); } syncControls(); }));
        dlg.querySelector('[data-rt-reset]').addEventListener('click', () => { Object.assign(st, rtDefault()); syncControls(); });
        const before = dlg.querySelector('[data-rt-before]');
        const setBefore = v => { showBefore = v; before.classList.toggle('is-active', v); draw(); };
        before.addEventListener('pointerdown', () => setBefore(true));
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => before.addEventListener(t, () => showBefore && setBefore(false)));
        // Courbe : ajouter, déplacer, enlever des points
        const rawPoint = e => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 268 - 6, 256 - ((e.clientY - r.top) / r.height * 268 - 6)]; };
        const svgPoint = e => rawPoint(e).map(v => Math.round(clamp255(v)));
        const removePoint = i => { const pts = st.curves[channel]; if (i < 0 || pts.length <= 2) return; pts.splice(i, 1); selPt = -1; drawCurve(); draw(); };
        let dragging = -1;
        svg.setAttribute('tabindex', '0');
        svg.addEventListener('pointerdown', e => {
            const pts = st.curves[channel], hit = e.target.closest('[data-rt-pt]');
            if (hit) dragging = Number(hit.dataset.rtPt);
            else { const [x, y] = svgPoint(e); if (pts.some(p => Math.abs(p[0] - x) < 6)) return; pts.push([x, y]); pts.sort((a, b) => a[0] - b[0]); dragging = pts.findIndex(p => p[0] === x); }
            selPt = dragging; outside = -1; svg.focus(); svg.setPointerCapture(e.pointerId); drawCurve(); draw();
        });
        svg.addEventListener('pointermove', e => {
            if (dragging < 0) return;
            const pts = st.curves[channel], [rx, ry] = rawPoint(e), [x, y] = svgPoint(e);
            // Glissé bien hors du cadre : le point sera enlevé au lâcher (il devient gris)
            outside = pts.length > 2 && (rx < -30 || rx > 286 || ry < -30 || ry > 286) ? dragging : -1;
            const lo = dragging > 0 ? pts[dragging - 1][0] + 1 : 0, hi = dragging < pts.length - 1 ? pts[dragging + 1][0] - 1 : 255;
            if (outside < 0) pts[dragging] = [Math.min(hi, Math.max(lo, x)), y];
            drawCurve(); draw();
        });
        const release = () => { if (dragging >= 0 && outside === dragging) { outside = -1; removePoint(dragging); } dragging = -1; outside = -1; drawCurve(); };
        svg.addEventListener('pointerup', release); svg.addEventListener('pointercancel', release);
        // ⌫ / Suppr enlève le point choisi (écouté sur toute la page : un clic sur la courbe ne lui donne pas le clavier)
        const onKey = e => { if (dlg.open && (e.key === 'Delete' || e.key === 'Backspace') && selPt >= 0 && !e.target.closest?.('input, textarea, select, [contenteditable]')) { e.preventDefault(); removePoint(selPt); } };
        document.addEventListener('keydown', onKey); dlg.addEventListener('close', () => document.removeEventListener('keydown', onKey));
        svg.addEventListener('contextmenu', e => { const hit = e.target.closest('[data-rt-pt]'); if (hit) { e.preventDefault(); removePoint(Number(hit.dataset.rtPt)); } });
        dlg.querySelector('[data-rt-ptdel]').addEventListener('click', () => removePoint(selPt));
        // Tout ce qui montrait l'ancien fichier (fiche, liste des médias…) est redessiné
        const refreshAfter = async () => {
            const state = A().state;
            try {
                if (state.module === 'listes') await A().renderList();
                else if (state.currentPersonId && state.module === 'personnes') await A().selectPerson(state.currentPersonId, false);
                else ext.refreshView?.();
            } catch (_) {}
        };
        // Les versions : l'original, puis les retouches ; on choisit celle qui s'affiche par défaut
        const applyShown = file => { if (file && file !== item.filename) { item.filename = item.thumbnail = file; item._cacheBust = Date.now(); A().renderLightboxItem?.(); refreshAfter(); } };
        const drawVersions = () => {
            const box = dlg.querySelector('[data-rt-versions]');
            box.innerHTML = `<h3>Versions de la photo</h3><div class="h-rt-vlist">${versions.map(v => `<figure class="${v.shown ? 'is-shown' : ''} ${v.filename === from ? 'is-source' : ''}"><img src="media/${encodeURIComponent(v.filename)}" alt="" loading="lazy"><figcaption><strong>${esc(v.label)}</strong>${v.shown ? '<span class="h-rt-badge">affichée</span>' : (v.id ? `<button type="button" class="link-button" data-rt-vshow="${v.id}">Afficher par défaut</button>` : '')}
                ${v.filename !== from ? `<button type="button" class="link-button" data-rt-vfrom="${esc(v.filename)}">Retoucher celle-ci</button>` : '<small>en cours de retouche</small>'}${!v.is_original && v.id ? `<button type="button" class="link-button danger" data-rt-vdel="${v.id}">Supprimer</button>` : ''}</figcaption></figure>`).join('')}</div>`;
            box.querySelectorAll('[data-rt-vshow]').forEach(b => b.addEventListener('click', async () => {
                try { const r = await api('retouch_show_version', {}, {method: 'POST', body: {media_id: item.id, version_id: b.dataset.rtVshow}}); versions = r.result.versions; applyShown(r.result.filename); drawVersions(); toast('Version affichée par défaut changée.'); }
                catch (error) { toast(error.message, 'error'); }
            }));
            box.querySelectorAll('[data-rt-vdel]').forEach(b => b.addEventListener('click', async () => {
                if (!confirm('Supprimer cette version retouchée ? L’original et les autres versions restent.')) return;
                try { const r = await api('retouch_delete_version', {}, {method: 'POST', body: {media_id: item.id, version_id: b.dataset.rtVdel}}); versions = r.result.versions; applyShown(r.result.filename); drawVersions(); toast('Version supprimée.'); }
                catch (error) { toast(error.message, 'error'); }
            }));
            box.querySelectorAll('[data-rt-vfrom]').forEach(b => b.addEventListener('click', () => { dlg.close(); openRetouch(b.dataset.rtVfrom); }));
        };
        drawVersions();
        dlg.querySelectorAll('[data-rt-save]').forEach(b => b.addEventListener('click', async () => {
            const mode = b.dataset.rtSave, label0 = b.textContent;
            const mpx = img.naturalWidth * img.naturalHeight / 1e6;
            if (mpx > 60 && !confirm(`Cette image est très grande (${Math.round(mpx)} millions de points) : l’enregistrement peut être long, voire échouer. Continuer ?`)) return;
            dlg.querySelectorAll('.modal-actions button').forEach(x => { x.disabled = true; });
            b.textContent = 'Enregistrement…';
            try {
                // L'image en pleine taille, retouchée avec les mêmes réglages que l'aperçu
                const full = document.createElement('canvas'); full.width = img.naturalWidth; full.height = img.naturalHeight;
                const fctx = full.getContext('2d', {willReadFrequently: true}); fctx.drawImage(img, 0, 0);
                const data = fctx.getImageData(0, 0, full.width, full.height); fctx.putImageData(rtApply(data, data, st), 0, 0);
                const ext0 = String(from || '').split('.').pop().toLowerCase();
                const type = ext0 === 'png' ? 'image/png' : ext0 === 'webp' ? 'image/webp' : ext0 === 'gif' ? 'image/png' : 'image/jpeg';
                const blob = await new Promise(res => full.toBlob(res, type, 0.93));
                if (!blob) throw new Error('Image trop grande pour être enregistrée par le navigateur.');
                const fd = new FormData(); fd.append('file', blob, 'retouche.' + (type.split('/')[1] === 'jpeg' ? 'jpg' : type.split('/')[1])); fd.append('media_id', item.id); fd.append('mode', mode === 'copy' ? 'copy' : 'version'); fd.append('show', mode === 'show' ? '1' : '0'); fd.append('csrf', A().state.csrf);
                const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}});
                const j = await r.json().catch(() => ({error: 'Réponse illisible du serveur'}));
                if (!r.ok || j.error) throw new Error(j.error || 'Enregistrement impossible.');
                if (mode === 'copy') { toast('Copie retouchée ajoutée aux mêmes fiches.'); dlg.close(); refreshAfter(); return; }
                if (mode === 'show') { applyShown(j.result.filename); toast('Nouvelle version affichée. L’original est gardé dans les versions.'); dlg.close(); return; }
                versions = j.result.versions; toast('Version enregistrée (non affichée).'); dlg.close();
            } catch (error) {
                toast(error.message, 'error');
                dlg.querySelectorAll('.modal-actions button').forEach(x => { x.disabled = false; });
                b.textContent = label0;
            }
        }));
        dlg.showModal();
        syncControls();
    }
    document.addEventListener('click', e => { if (e.target.closest('#retouch-media')) openRetouch(); });
    ext.openRetouch = openRetouch;
})();
