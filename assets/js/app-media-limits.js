/* LCNDA — 📎 Fichiers des médias (serveur : lib/media_limits.php ; maquette : la page des Réglages ci-dessous).
 *  1. Réglages → « 📎 Fichiers des médias » : la taille la plus grande d'une image ou d'un document (100 Mo conseillés),
 *     d'un son ou d'une vidéo (250 Mo conseillés), et la taille d'image (en millions de points, 120 conseillés) au-delà de
 *     laquelle les outils qui décodent une image (« 🎚️ Mieux voir », ✨ Lire l'acte, Atelier, retouche, vignettes du serveur)
 *     ne la traitent pas — l'image reste gardée. Rangé dans la base (api.php?action=save_media_limits), chaque changement
 *     se défait avec « ↶ Annuler ».
 *  2. LCNDA_APP.mediaLimits = {get, maxBytes, fileError, tooBig} : les mêmes limites dans le navigateur (window.LCNDA_MEDIA_LIMITS,
 *     écrit par index.php), avec un message clair.
 *  3. L'événement commun « lcnda:media-changed » (sur document, detail {source, action, ids}) : émis après tout envoi réussi
 *     vers upload.php, et après toute écriture d'api.php qui ajoute ou change un média (fiche, visionneuse, menu de choix des
 *     médias, import, « 📥 À trier », dossier Scans, retouche…). L'onglet Documents (heritage-onglets-documents.js) l'écoute.
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (_, k) => (v && k in v ? v[k] : `{${k}}`)));
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (m, k, o) => A()?.toast?.(m, k, o);

    /* ═════════ 2. les limites ═════════ */
    const DEFAULTS = {image_mb: 100, av_mb: 250, mpx: 120};
    const CHOICES = {image_mb: [25, 50, 100, 200, 500], av_mb: [100, 250, 500, 1000, 2000], mpx: [50, 80, 120, 200, 300]};
    let DATA = (() => { const d = window.LCNDA_MEDIA_LIMITS; return d && typeof d === 'object' && d.limits ? d : {limits: {...DEFAULTS}, choices: CHOICES, defaults: DEFAULTS}; })();
    const get = () => ({...DEFAULTS, ...(DATA.limits || {})});
    const isAV = kind => kind === 'audio' || kind === 'video';
    const kindOf = file => (/^audio\//.test(file?.type || '') ? 'audio' : /^video\//.test(file?.type || '') ? 'video' : 'image');
    const maxBytes = kind => (isAV(kind) ? get().av_mb : get().image_mb) * 1048576;
    /** le message si ce fichier est trop gros pour être ajouté (sinon '') */
    function fileError(file, kind = kindOf(file)) {
        if (!file || !(file.size > maxBytes(kind))) return '';
        const n = isAV(kind) ? get().av_mb : get().image_mb, name = file.name || i18n('Ce fichier');
        return isAV(kind) ? i18n('{name} dépasse {n} Mo, la taille la plus grande réglée pour un son ou une vidéo (Réglages → Fichiers des médias).', {name, n})
            : i18n('{name} dépasse {n} Mo, la taille la plus grande réglée pour une image ou un document (Réglages → Fichiers des médias).', {name, n});
    }
    let lastWarn = '';
    /** une image trop grande pour être décodée par un outil ? true = l'outil ne la traite pas (un message clair, une fois par image) */
    function tooBig(w, h, {quiet = false} = {}) {
        w = Number(w) || 0; h = Number(h) || 0; if (!w || !h) return false;
        const max = get().mpx, mpx = w * h / 1e6; if (mpx <= max) return false;
        const key = `${w}x${h}`;
        if (!quiet && lastWarn !== key) {
            lastWarn = key; setTimeout(() => { if (lastWarn === key) lastWarn = ''; }, 8000);
            toast(i18n('Cette image est très grande ({w} × {h} points, {n} millions) : elle est bien gardée, mais les outils qui la décodent (vignettes, « Mieux voir », lecture de l’écriture, retouche) ne la traitent pas au-delà de {max} millions de points, pour ne pas saturer la mémoire. Tu peux changer cette limite : Réglages → Fichiers des médias.', {w, h, n: Math.ceil(mpx), max}), 'error', {duration: 12000});
        }
        return true;
    }
    const mediaLimits = {get, maxBytes, fileError, tooBig, DEFAULTS, CHOICES};
    const publish = () => { const app = A(); if (app && !app.mediaLimits) app.mediaLimits = mediaLimits; };
    publish(); document.addEventListener('DOMContentLoaded', publish);
    ext.mediaLimits = mediaLimits;

    /* ═════════ 3. l'événement commun « un média a été ajouté ou changé » ═════════ */
    const MEDIA_ACTION = /media|photo|image|upload|import|inbox|scan|retouch|postcard|transcri|recueil|collection|socface|atelier|restore|undo|trash/;
    const emit = detail => { try { document.dispatchEvent(new CustomEvent('lcnda:media-changed', {detail})); } catch (_) {} };
    ext.mediaChanged = (detail = {}) => emit({source: 'app', ...detail});
    if (!window.fetch.__lcndaMedia) {
        const orig = window.fetch;
        const wrapped = function (input, init) {
            let watch = null;
            try {
                const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
                if (method !== 'GET' && method !== 'HEAD') {
                    const u = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input?.url || '', location.href);
                    if (u.origin === location.origin) {
                        if (/(?:^|\/)upload\.php$/.test(u.pathname)) watch = {source: 'upload', action: 'upload'};
                        else if (/(?:^|\/)api\.php$/.test(u.pathname)) { const a = u.searchParams.get('action') || ''; if (a !== 'save_settings' && MEDIA_ACTION.test(a)) watch = {source: 'api', action: a}; }
                    }
                }
            } catch (_) { watch = null; }
            const p = orig.call(this, input, init);
            if (watch) p.then(r => { if (!r || !r.ok) return; r.clone().json().then(j => { if (j && !j.error && j.notice && watch.source === 'upload') toast(String(j.notice), '', {duration: 15000}); if (j && !j.error) emit({...watch, ids: Array.isArray(j.media) ? j.media.map(Number) : j.result?.media_id ? [Number(j.result.media_id)] : []}); }, () => {}); }, () => {});
            return p;
        };
        wrapped.__lcndaMedia = true; if (orig.__lcndaGen) wrapped.__lcndaGen = true;
        window.fetch = wrapped;
    }

    /* ═════════ 1. Réglages → 📎 Fichiers des médias ═════════ */
    const ROWS = [
        ['image_mb', 'Taille la plus grande d’une image ou d’un document', n => i18n('{n} Mo', {n}), 'Une photo, un scan ou un PDF plus gros est refusé à l’ajout, avec un message qui le dit. Les scans d’archives en très haute définition dépassent souvent 25 Mo.'],
        ['av_mb', 'Taille la plus grande d’un son ou d’une vidéo', n => (n >= 1000 ? i18n('{n} Go', {n: n / 1000}) : i18n('{n} Mo', {n})), 'Un enregistrement ou un film plus gros est refusé à l’ajout.'],
        ['mpx', 'Taille d’image la plus grande pour les outils qui la décodent', n => i18n('{n} millions de points', {n}), 'Au-delà, l’image est bien gardée et s’affiche, mais « 🎚️ Mieux voir », ✨ Lire l’acte, l’Atelier, la retouche et les vignettes du serveur ne la traitent pas : décoder une image immense peut saturer la mémoire de l’ordinateur. 120 millions de points, c’est par exemple 12 000 × 10 000.']];
    async function save(patch) {
        const r = await A().api('save_media_limits', {}, {method: 'POST', body: patch});
        if (r?.result?.limits) DATA = {...DATA, ...r.result}; else DATA = {...DATA, limits: {...get(), ...patch}};
        window.LCNDA_MEDIA_LIMITS = DATA;
    }
    ext.maintenance = ext.maintenance || {};
    ext.maintenance.media_files = async token => {
        const ws = document.getElementById('workspace'); if (!ws) return;
        try { const r = await A().api('media_limits'); if (r?.limits) { DATA = r; window.LCNDA_MEDIA_LIMITS = r; } } catch (_) {}
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const ro = document.body.classList.contains('is-kiosk') || !!window.LCNDA_GUEST;
        const draw = () => {
            const cur = get(), d = {...DEFAULTS, ...(DATA.defaults || {})}, ch = {...CHOICES, ...(DATA.choices || {})};
            const changed = ROWS.some(([k]) => cur[k] !== d[k]);
            ws.innerHTML = `<section class="page mf-page" data-mf-page>${UI().pageHeader ? UI().pageHeader({title: i18n('Fichiers des médias'), icon: '📎', attrs: 'data-ph-title', where: i18n('Réglages · Apparence et affichage'), saved: true,
                    help: i18n('La taille des photos, documents, sons et vidéos que tu ajoutes, et ce que les outils d’image acceptent de traiter.'),
                    actions: [`<button type="button" class="button secondary" data-mf-reset data-ui-reset${changed && !ro ? '' : ' disabled'}>${esc(i18n('↺ Remettre comme au départ'))}</button>`]}) : `<h2>📎 ${esc(i18n('Fichiers des médias'))}</h2>`}
                <section class="card mf-card maintenance-panel">${ROWS.map(([k, label, fmt, help]) => `<div class="mf-row">
                    <label class="field mf-field"><span>${esc(i18n(label))}</span><select data-mf-key="${k}"${ro ? ' disabled' : ''}>${ch[k].map(n => `<option value="${n}"${n === cur[k] ? ' selected' : ''}>${esc(fmt(n))}${n === d[k] ? ` ${esc(i18n('(conseillé)'))}` : ''}</option>`).join('')}</select></label>
                    <p class="ui-hint">${esc(i18n(help))}</p></div>`).join('')}
                    ${UI().notice ? UI().notice('info', esc(i18n('Des fichiers plus gros prennent plus de place sur le disque, rendent les sauvegardes plus lourdes et plus longues, et demandent plus de mémoire pour les ouvrir. Le téléphone par le wifi garde ses propres limites.'))) : ''}
                </section></section>`;
        };
        const redraw = async () => { if (document.querySelector('[data-mf-page]')) { draw(); bind(); } };
        const bind = () => {
            const page = ws.querySelector('[data-mf-page]'); if (!page) return;
            page.addEventListener('change', async e => {
                const sel = e.target.closest('[data-mf-key]'); if (!sel || ro) return;
                const k = sel.dataset.mfKey, before = get()[k], v = Number(sel.value);
                if (v === before) return;
                try { await save({[k]: v}); } catch (err) { toast(err.message || String(err), 'error'); redraw(); return; }
                redraw();
                A().undoToast?.(i18n('Réglage changé : « {what} »', {what: i18n(ROWS.find(r => r[0] === k)[1])}), {undo: async () => { await save({[k]: before}); redraw(); }});
            });
            page.addEventListener('click', async e => {
                if (!e.target.closest('[data-mf-reset]') || ro) return;
                const before = get(); try { await save({...DEFAULTS}); } catch (err) { toast(err.message || String(err), 'error'); return; }
                redraw();
                A().undoToast?.(i18n('Fichiers des médias remis comme au départ.'), {undo: async () => { await save(before); redraw(); }});
            });
        };
        draw(); bind();
    };
})();
