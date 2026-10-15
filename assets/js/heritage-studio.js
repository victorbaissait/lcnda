/**
 * Atelier : 🎨 mises en page enregistrées (Apparence) · 🖼️ retouche des photos · 📋 Mes listes dans Listes et partagées.
 * Chargé après heritage-more.js (window.LCNDA_APP, window.LCNDA_EXT).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const key of ['lists', 'maintenance']) ext[key] = ext[key] || {};
    for (const key of ['designPanels', 'designPanelsEnd', 'afterDesign']) ext[key] = ext[key] || [];
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
    ext.designPanelsEnd.push(() => { // tout en bas de l'Apparence : on enregistre une fois tout réglé
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
        at('data-h-layout-rename', async (list, i, p) => {
            const name = ((await A().askText({title: 'Renommer la mise en page', message: 'Nouveau nom :', value: p.name, okLabel: 'Renommer'})) || '').trim().slice(0, 60);
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
    /* ═══════════════ 🗃️ TOUS MES RÉGLAGES (Maintenance → Apparence, après les mises en page) ═══════════════ */
    // Tous les réglages de l'app (« genealogie-… ») : apparence, mais aussi listes, statistiques, onglets, widgets,
    // tableaux, animaux, raccourcis… Pas ce qui est propre à cet ordinateur ni ce qui vise une fiche précise de la base.
    const ALL_PROFILES_KEY = 'genealogie-settings-profiles';
    const ALL_SKIP = ['genealogie-auto-backup-lock', 'genealogie-baissait-ui-v2', 'genealogie-last-route', PROFILES_KEY, ALL_PROFILES_KEY, 'genealogie-site-defaults-applied',
        'genealogie-dashboard-recent-people', 'genealogie-sosa-root', 'genealogie-sosa-root-name', 'genealogie-sosa-map', 'genealogie-daboville-root', 'genealogie-daboville-root-name', 'genealogie-daboville-map', 'genealogie-atelier-timers'];
    const isAllKey = key => /^genealogie-[a-z0-9-]{1,80}$/.test(key) && !ALL_SKIP.includes(key) && !/-\d+$/.test(key);
    function currentAll() {
        const settings = {};
        for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key && isAllKey(key)) settings[key] = localStorage.getItem(key); }
        return settings;
    }
    const allProfiles = () => { try { const p = JSON.parse(ls(ALL_PROFILES_KEY, '[]')); return Array.isArray(p) ? p.filter(validProfile) : []; } catch (_) { return []; } };
    const saveAllProfiles = list => { try { localStorage.setItem(ALL_PROFILES_KEY, JSON.stringify(list)); return true; } catch (_) { toast('Trop de réglages enregistrés pour la place disponible : supprimes-en un.', 'error'); return false; } };
    const allSummary = s => { const n = Object.keys(s).length; return `${n} réglage${n > 1 ? 's' : ''}`; };
    /** Remet un ensemble : ses réglages remplacent tous les réglages actuels (les autres reviennent à ceux de départ). */
    async function applyAll(settings, {layoutOnly = false, keep = []} = {}) {
        // un fichier reçu : ce qui a été laissé de côté à l'import (illisible) n'efface rien ; une mise en page ne touche qu'à l'Apparence
        const removed = [];
        for (let i = localStorage.length - 1; i >= 0; i--) { const key = localStorage.key(i); if (key && isAllKey(key) && !(key in settings) && !keep.includes(key) && (!layoutOnly || isLayoutKey(key))) { removed.push(key); lsDel(key); } }
        const set = {};
        Object.entries(settings).forEach(([key, value]) => { if (isAllKey(key) && typeof value === 'string') { set[key] = value; lsSet(key, value); } });
        try {
            const csrf = window.INSTALL_CSRF || S().csrf || '';
            const r = await fetch('api.php?action=save_settings', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf}, body: JSON.stringify({set, remove: removed, csrf})});
            if (!r.ok) throw new Error();
        } catch (_) { toast('La base n’a pas pu enregistrer ces réglages : réessaie.', 'error'); return; }
        location.reload();
    }
    // un fichier reçu : les mêmes précautions que pour une mise en page
    const cleanAll = settings => Object.fromEntries(Object.entries(settings || {}).filter(([k, v]) => isAllKey(k) && safeLayoutValue(k, v)));
    ext.designPanelsEnd.push(() => {
        const list = allProfiles();
        return `<section class="person-block-config h-layouts" id="h-allsets"><header><span class="eyebrow">TOUS LES RÉGLAGES</span><h3>Mes ensembles de réglages</h3><p>Garde <b>l’intégralité</b> des réglages de l’app sous un nom : l’Apparence, mais aussi les listes et leurs colonnes, les statistiques et onglets à soi, les widgets, les tableaux, les animaux, les livrets, les raccourcis, la recherche sur internet… Tu peux y revenir en un clic, ou les passer à un autre ordinateur avec un fichier. Ne sont pas gardés : tes données, ce qui vise une fiche précise (de cujus, exceptions d’une fiche) et ce qui est propre à cet ordinateur.</p></header>
            <div class="h-layouts-save"><input type="text" id="h-allset-name" maxlength="60" placeholder="Nom de l’ensemble (ex. Mon app complète, Version élevage)"><button type="button" class="button small" data-h-allset-save>Enregistrer tous les réglages actuels</button><button type="button" class="button small secondary" data-h-allset-export-now>Exporter les réglages actuels</button><button type="button" class="button small secondary" data-h-allset-import>Importer un fichier…</button></div>
            ${list.length ? `<ul class="h-layouts-list">${list.map((p, i) => `<li><div><strong>${esc(p.name)}</strong><small>${esc(allSummary(p.settings))}${p.saved ? ` · ${esc(new Date(p.saved).toLocaleDateString('fr-FR'))}` : ''}${p.from ? ` · reçu de ${esc(p.from)}` : ''}</small></div>
                <span class="page-actions"><button type="button" class="button small" data-h-allset-apply="${i}">Appliquer</button><button type="button" class="button small secondary" data-h-allset-update="${i}" title="Remplacer par les réglages actuels">Mettre à jour</button><button type="button" class="button small secondary" data-h-allset-rename="${i}">Renommer</button><button type="button" class="button small secondary" data-h-allset-export="${i}">Exporter (fichier)</button><button type="button" class="button small secondary danger" data-h-allset-delete="${i}">Supprimer</button></span></li>`).join('')}</ul>` : '<p class="cell-muted">Aucun ensemble de réglages enregistré.</p>'}</section>`;
    });
    ext.afterDesign.push(() => {
        const box = document.getElementById('h-allsets');
        if (!box) return;
        const rerender = () => A().renderMaintenance?.();
        const nameInput = box.querySelector('#h-allset-name');
        const fileOf = (name, saved, settings) => JSON.stringify({type: 'lcnda-reglages', version: 1, name, saved, settings}, null, 1);
        const save = () => {
            const name = nameInput.value.trim();
            if (!name) { toast('Donne un nom à cet ensemble de réglages.', 'error'); nameInput.focus(); return; }
            const list = allProfiles(), same = list.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
            if (same >= 0 && !confirm(`Un ensemble « ${list[same].name} » existe déjà. Le remplacer ?`)) return;
            const entry = {name, saved: new Date().toISOString(), settings: currentAll()};
            if (same >= 0) list[same] = entry; else list.push(entry);
            if (saveAllProfiles(list)) { toast(`Ensemble « ${name} » enregistré.`); rerender(); }
        };
        box.querySelector('[data-h-allset-save]').addEventListener('click', save);
        nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
        box.querySelector('[data-h-allset-export-now]').addEventListener('click', () => { downloadText(`reglages-lcnda-${new Date().toISOString().slice(0, 10)}.lcnda-reglages.json`, fileOf('Mes réglages', new Date().toISOString(), currentAll())); toast('Fichier prêt : il s’importe ici, sur un autre ordinateur.'); });
        box.querySelector('[data-h-allset-import]').addEventListener('click', async () => {
            const text = await pickFile('.json,application/json');
            if (text === null) return;
            let data; try { data = JSON.parse(text); } catch (_) { return toast('Ce fichier n’est pas un fichier de réglages LCNDA.', 'error'); }
            // une mise en page (Apparence) s'importe aussi ici
            if (!['lcnda-reglages', 'lcnda-mise-en-page'].includes(data?.type) || !validProfile(data)) return toast('Ce fichier n’est pas un fichier de réglages LCNDA.', 'error');
            const settings = cleanAll(data.settings), dropped = Object.keys(data.settings).filter(k => !(k in settings)).slice(0, 500), ignored = dropped.length;
            const list = allProfiles(); let name = String(data.name).slice(0, 60) || 'Réglages importés';
            while (list.some(p => p.name === name)) name = `${name} (2)`;
            list.push({name, saved: new Date().toISOString(), from: String(data.author || '').slice(0, 60), settings, keep: dropped.filter(k => typeof k === 'string'), layoutOnly: data.type === 'lcnda-mise-en-page'});
            if (saveAllProfiles(list)) { toast(`Ensemble « ${name} » importé : clique sur « Appliquer » pour l’utiliser.${ignored > 0 ? ` (${ignored} réglage(s) illisible(s) laissé(s) de côté)` : ''}`); rerender(); }
        });
        const at = (attr, fn) => box.querySelectorAll(`[${attr}]`).forEach(b => b.addEventListener('click', () => { const list = allProfiles(), i = Number(b.getAttribute(attr)); if (list[i]) fn(list, i, list[i]); }));
        at('data-h-allset-apply', (list, i, p) => {
            if (!confirm(`Appliquer l’ensemble « ${p.name} » ?\n\nTous les réglages de l’app seront remplacés (pense à enregistrer les réglages actuels si tu veux les garder). Tes données ne bougent pas. L’écran va se recharger.`)) return;
            toast(`Ensemble « ${p.name} » appliqué.`); applyAll(p.settings, {layoutOnly: !!p.layoutOnly, keep: Array.isArray(p.keep) ? p.keep : []});
        });
        at('data-h-allset-update', (list, i, p) => { if (!confirm(`Remplacer « ${p.name} » par les réglages actuels ?`)) return; list[i] = {...p, saved: new Date().toISOString(), settings: currentAll()}; if (saveAllProfiles(list)) { toast('Ensemble mis à jour.'); rerender(); } });
        at('data-h-allset-rename', async (list, i, p) => {
            const name = ((await A().askText({title: 'Renommer l’ensemble', message: 'Nouveau nom :', value: p.name, okLabel: 'Renommer'})) || '').trim().slice(0, 60);
            if (!name) return; list[i] = {...p, name}; if (saveAllProfiles(list)) { toast('Ensemble renommé.'); rerender(); }
        });
        at('data-h-allset-export', (list, i, p) => { downloadText(`reglages-${slug(p.name)}.lcnda-reglages.json`, fileOf(p.name, p.saved, p.settings)); toast('Fichier prêt : il s’importe dans Maintenance → Apparence → « Mes ensembles de réglages ».'); });
        at('data-h-allset-delete', (list, i, p) => { if (!confirm(`Supprimer l’ensemble « ${p.name} » ? (les réglages actuels ne changent pas)`)) return; list.splice(i, 1); if (saveAllProfiles(list)) { toast('Ensemble supprimé.'); rerender(); } });
    });
    /* ═══════════ ⚙️ BARRES D'OUTILS À SOI (Retouche, Modifier le son, Montage vidéo) ═══════════
     * Un éditeur marque ses rangées d'outils data-tbg="clé" data-tbg-label="nom" ; « ⚙️ Personnaliser » range, montre
     * ou cache leurs boutons et options. Réglages : genealogie-toolbars = {éditeur: {order: {rangée: [clés]}, hidden: {rangée: [clés]}}}.
     */
    const TB_KEY = 'genealogie-toolbars';
    const tbAll = () => { try { const v = JSON.parse(localStorage.getItem(TB_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } };
    const tbSkip = el => el.matches('[data-tb-config], .dnd-grip, script, template');
    /** Une clé stable pour un bouton : son premier attribut data-… (ou celui de ce qu'il contient) */
    function tbKeyOf(el) {
        if (el.dataset.tb) return el.dataset.tb;
        const attr = n => [...n.attributes].find(a => a.name.startsWith('data-') && !/^data-(tb|dnd|need)/.test(a.name));
        let a = attr(el); if (!a) for (const d of el.querySelectorAll('*')) { a = attr(d); if (a) break; }
        return a ? `${a.name.slice(5)}=${a.value}` : `${el.tagName.toLowerCase()}:${(el.textContent || '').trim().slice(0, 24)}`;
    }
    const tbLabel = el => { if (el.dataset.tbLabel) return el.dataset.tbLabel; const tx = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60), ti = el.title || el.getAttribute('aria-label') || el.querySelector('[title]')?.title || ''; return tx.length <= 3 && ti ? `${tx} ${ti}`.trim() : tx || ti || '(sans nom)'; };
    const tbKids = g => [...g.children].filter(c => !tbSkip(c));
    const TB_DEFS = 'genealogie-toolbar-defs'; // les boutons de chaque éditeur, notés à son ouverture (pour Maintenance → Montage, retouche et son)
    const tbDefs = () => { try { const v = JSON.parse(localStorage.getItem(TB_DEFS) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } };
    ext.tbDefs = tbDefs;
    function tbRemember(root, id) {
        const groups = [...root.querySelectorAll('[data-tbg]')].map(g => ({key: g.dataset.tbg, label: g.dataset.tbgLabel || g.dataset.tbg, items: tbKids(g).map(el => [tbKeyOf(el), tbLabel(el)])})).filter(g => g.items.length);
        const all = tbDefs(), old = all[id]?.groups || [];
        // on garde l'ordre de départ déjà noté ; les nouvelles rangées et les nouveaux boutons s'ajoutent
        const merged = groups.map(g => { const o = old.find(x => x.key === g.key); if (!o) return g; const keys = o.items.map(i => i[0]); return {...g, items: [...o.items.filter(i => g.items.some(n => n[0] === i[0])).map(i => g.items.find(n => n[0] === i[0])), ...g.items.filter(n => !keys.includes(n[0]))]}; });
        const next = {groups: merged}; // les rangées qui n'existent plus disparaissent de la liste
        if (JSON.stringify(all[id]) !== JSON.stringify(next)) { all[id] = next; try { localStorage.setItem(TB_DEFS, JSON.stringify(all)); } catch (_) {} }
    }
    ext.tbApply = (root, id) => {
        tbRemember(root, id);
        const cfg = tbAll()[id] || {};
        root.querySelectorAll('[data-tbg]').forEach(g => {
            const k = g.dataset.tbg, kids = tbKids(g), order = cfg.order?.[k] || [], hidden = cfg.hidden?.[k] || [];
            const byKey = new Map(kids.map(el => [tbKeyOf(el), el]));
            [...order.map(x => byKey.get(x)).filter(Boolean), ...kids.filter(el => !order.includes(tbKeyOf(el)))].forEach(el => g.appendChild(el));
            g.querySelectorAll(':scope > [data-tb-config]').forEach(b => g.appendChild(b)); // le bouton ⚙️ reste au bout
            kids.forEach(el => el.classList.toggle('is-tb-off', hidden.includes(tbKeyOf(el))));
        });
    };
    /* Plein écran d'un éditeur (comme les tableaux) : ⛶, gardé pour la prochaine fois */
    const FULL_KEY = 'genealogie-editor-full';
    const fullAll = () => { try { return JSON.parse(localStorage.getItem(FULL_KEY) || '{}') || {}; } catch (_) { return {}; } };
    ext.fullButton = id => `<button type="button" class="icon-button h-full-btn" data-full-toggle="${esc(id)}" title="Plein écran (⛶)" aria-label="Plein écran">⛶</button>`;
    ext.fullInit = (dlg, id) => { if (fullAll()[id]) dlg.classList.add('is-full'); };
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-full-toggle]'); if (!b) return;
        const dlg = b.closest('dialog'); if (!dlg) return;
        const on = dlg.classList.toggle('is-full'), all = fullAll(); all[b.dataset.fullToggle] = on;
        try { localStorage.setItem(FULL_KEY, JSON.stringify(all)); } catch (_) {}
        b.title = on ? 'Quitter le plein écran' : 'Plein écran (⛶)';
        setTimeout(() => window.dispatchEvent(new Event('resize')), 30); // les images et les ondes se redessinent à la nouvelle taille
    });
    /* ⌘ + / ⌘ − / ⌘ 0 (Ctrl sur PC et Linux) dans un éditeur ouvert : la frise du montage, l'onde du son, la photo retouchée.
     * Renvoie true si un éditeur a zoomé (sinon l'app zoome toute la page). */
    ext.editorZoom = dir => {
        const open = [...document.querySelectorAll('dialog[open]')].pop(); if (!open) return false;
        const click = sel => { const b = open.querySelector(sel); if (!b) return false; b.click(); return true; };
        if (open.classList.contains('h-avx-montage')) {
            const z = open.querySelector('[data-mt-zoom]'); if (!z) return false;
            z.value = String(dir === 0 ? 40 : Math.max(Number(z.min), Math.min(Number(z.max), Math.round(Number(z.value) * (dir > 0 ? 1.4 : 1 / 1.4)))));
            z.dispatchEvent(new Event('input', {bubbles: true})); return true;
        }
        if (open.querySelector('[data-avx-zoom]')) return click(dir === 0 ? '[data-avx-zoom="fit"]' : dir > 0 ? '[data-avx-zoom="in"]' : '[data-avx-zoom="out"]');
        if (open.querySelector('[data-rt-zoom]')) return click(dir === 0 ? '[data-rt-zoomfit]' : `[data-rt-zoom="${dir > 0 ? 1 : -1}"]`);
        return false;
    };
    // dans un navigateur (l'app Electron passe par son menu Affichage)
    if (!/Electron/i.test(navigator.userAgent)) document.addEventListener('keydown', e => {
        if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
        const dir = ['+', '='].includes(e.key) ? 1 : e.key === '-' ? -1 : e.key === '0' ? 0 : null; if (dir === null) return;
        if (ext.editorZoom(dir)) e.preventDefault();
    }, true);
    ext.tbButton = id => `<button type="button" class="button small secondary" data-tb-config="${esc(id)}" title="Ranger, montrer ou cacher les boutons et les options">⚙️ Personnaliser</button>`;
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-tb-config]'); if (!b) return;
        e.preventDefault();
        const id = b.dataset.tbConfig, root = b.closest('dialog') || document;
        const groups = [...root.querySelectorAll('[data-tbg]')].filter(g => tbKids(g).length);
        const rows = g => tbKids(g).map(el => `<li class="h-pet-lrow" data-k="${esc(tbKeyOf(el))}"><input type="checkbox" ${el.classList.contains('is-tb-off') ? '' : 'checked'} title="Montrer"><span>${esc(tbLabel(el))}</span><button type="button" class="h-bt" data-up title="Monter">↑</button><button type="button" class="h-bt" data-down title="Descendre">↓</button></li>`).join('');
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-modal h-tbcfg';
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">PERSONNALISER</span><h2>⚙️ Boutons et options</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="h-tbcfg-body"><p class="muted">Coche ce qu’on montre, range avec ↑ ↓ (ou en glissant ⠿). Gardé pour la prochaine fois.</p>${groups.map(g => `<section><h4>${esc(g.dataset.tbgLabel || g.dataset.tbg)}</h4><ol class="h-pet-layout" data-g="${esc(g.dataset.tbg)}">${rows(g)}</ol></section>`).join('')}</div>
            <div class="modal-actions"><button type="button" class="button secondary" data-reset>Tout remettre comme au départ</button><span class="spacer"></span><button type="button" class="button secondary" data-x>Annuler</button><button type="button" class="button" data-ok>Enregistrer</button></div>`;
        (b.closest('dialog') || document.body).appendChild(dlg);
        dlg.addEventListener('click', ev => {
            const li = ev.target.closest('li');
            if (ev.target.closest('[data-up]') && li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling);
            if (ev.target.closest('[data-down]') && li.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li);
            if (ev.target.closest('[data-x]')) dlg.close();
            if (ev.target.closest('[data-reset]')) { const all = tbAll(); delete all[id]; try { localStorage.setItem(TB_KEY, JSON.stringify(all)); } catch (_) {} toast('Boutons remis comme au départ (rouvre la fenêtre pour retrouver l’ordre de départ).'); root.querySelectorAll('.is-tb-off').forEach(x => x.classList.remove('is-tb-off')); dlg.close(); }
            if (ev.target.closest('[data-ok]')) {
                const cfg = {order: {}, hidden: {}};
                dlg.querySelectorAll('[data-g]').forEach(ol => { const lis = [...ol.children]; cfg.order[ol.dataset.g] = lis.map(l => l.dataset.k); cfg.hidden[ol.dataset.g] = lis.filter(l => !l.querySelector('input').checked).map(l => l.dataset.k); });
                const all = tbAll(); all[id] = cfg; try { localStorage.setItem(TB_KEY, JSON.stringify(all)); } catch (_) {}
                ext.tbApply(root, id); toast('Boutons rangés.'); dlg.close();
            }
        });
        dlg.addEventListener('close', () => dlg.remove());
        dlg.showModal();
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
        Object.assign(st, rtDefault(), {bw: st.bw, sepia: st.sepia, invert: st.invert, strokes: st.strokes || []});
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

    /* ── Correcteur de taches et tampon de duplication ──
       Chaque coup est noté en coordonnées relatives (0 à 1) : on le rejoue sur l'aperçu puis, à l'enregistrement, sur l'image en pleine taille. */
    /** Copie un disque de (sx,sy) vers (cx,cy), bord adouci ; `offset` corrige la teinte (correcteur). Lit dans `from`, écrit dans `data`. */
    function rtDab(data, from, W, H, cx, cy, sx, sy, r, offset = null, hard = 0.55) {
        const r2 = r * r, x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
        const dx = Math.round(sx - cx), dy = Math.round(sy - cy);
        for (let y = y0; y <= y1; y++) {
            const syy = y + dy; if (syy < 0 || syy >= H) continue;
            for (let x = x0; x <= x1; x++) {
                const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy); if (d2 > r2) continue;
                const sxx = x + dx; if (sxx < 0 || sxx >= W) continue;
                const t = Math.sqrt(d2) / r, a = t <= hard ? 1 : 1 - (t - hard) / (1 - hard), w = a * a * (3 - 2 * a);
                const i = (y * W + x) * 4, j = (syy * W + sxx) * 4;
                for (let c = 0; c < 3; c++) data[i + c] = data[i + c] * (1 - w) + (from[j + c] + (offset ? offset[c] : 0)) * w;
            }
        }
    }
    /** Pour une tache en (cx,cy) : la zone voisine dont le pourtour ressemble le plus au pourtour de la tache, et l'écart de teinte à corriger. */
    function rtHealSource(from, W, H, cx, cy, r) {
        const ring = []; for (let k = 0; k < 40; k++) { const a = k / 40 * Math.PI * 2; for (const f of [1.15, 1.45]) ring.push([Math.cos(a) * r * f, Math.sin(a) * r * f]); }
        const px = (x, y) => { x = Math.max(0, Math.min(W - 1, Math.round(x))); y = Math.max(0, Math.min(H - 1, Math.round(y))); return (y * W + x) * 4; };
        let best = null;
        for (const dist of [2.4, 3.2, 4.4]) for (let k = 0; k < 16; k++) {
            const a = k / 16 * Math.PI * 2, sx = cx + Math.cos(a) * r * dist, sy = cy + Math.sin(a) * r * dist;
            if (sx - r < 0 || sy - r < 0 || sx + r >= W || sy + r >= H) continue;
            let ssd = 0; for (const [ox, oy] of ring) { const i = px(cx + ox, cy + oy), j = px(sx + ox, sy + oy); for (let c = 0; c < 3; c++) { const d = from[i + c] - from[j + c]; ssd += d * d; } }
            if (!best || ssd < best.ssd) best = {sx, sy, ssd};
        }
        if (!best) return null;
        const off = [0, 0, 0]; for (const [ox, oy] of ring) { const i = px(cx + ox, cy + oy), j = px(best.sx + ox, best.sy + oy); for (let c = 0; c < 3; c++) off[c] += from[i + c] - from[j + c]; }
        return {sx: best.sx, sy: best.sy, offset: off.map(v => v / ring.length)};
    }
    /** Rejoue les coups (groupes d'un même geste) sur une image : correcteur et tampon. */
    function rtReplayStrokes(img, strokes) {
        const W = img.width, H = img.height, data = img.data;
        for (const g of strokes) {
            const from = new Uint8ClampedArray(data); // chaque geste copie depuis l'état d'avant lui (pas de trainée qui se recopie)
            for (const d of g.dabs) {
                const cx = d.x * W, cy = d.y * H, r = Math.max(1, d.r * W);
                if (g.tool === 'heal') { const h = rtHealSource(from, W, H, cx, cy, r); if (h) rtDab(data, from, W, H, cx, cy, h.sx, h.sy, r, h.offset, 0.35); }
                else rtDab(data, from, W, H, cx, cy, cx + d.ox * W, cy + d.oy * H, r, null, d.h ?? 0.55);
            }
        }
        return img;
    }
    /* ── Calques d'annotation : des traits de pinceau et des textes, gardés en coordonnées relatives (0 à 1)
       pour être redessinés à n'importe quelle taille (aperçu, zoom, image en pleine taille à l'enregistrement). */
    const RT_BRUSHES = [['round', 'Rond net'], ['soft', 'Rond doux'], ['marker', 'Surligneur'], ['pencil', 'Crayon fin'], ['chalk', 'Craie (grain)'], ['eraser', 'Gomme']];
    const RT_FONTS = [['Arial, Helvetica, sans-serif', 'Sans empattement'], ['Georgia, "Times New Roman", serif', 'Avec empattement'], ['"Brush Script MT", "Segoe Script", cursive', 'Manuscrite'], ['"Courier New", monospace', 'Machine à écrire']];
    function rtDrawOp(c, op, W, H) {
        c.save();
        if (op.type === 'text') {
            const size = Math.max(6, op.size * W);
            c.globalAlpha = op.opacity ?? 1; c.fillStyle = op.color; c.font = `${op.bold ? 'bold ' : ''}${size}px ${op.font || 'Arial, sans-serif'}`; c.textBaseline = 'top';
            if (op.halo) { c.lineWidth = Math.max(2, size / 6); c.strokeStyle = op.halo; c.lineJoin = 'round'; }
            String(op.text).split('\n').forEach((line, i) => { const y = op.y * H + i * size * 1.2; if (op.halo) c.strokeText(line, op.x * W, y); c.fillText(line, op.x * W, y); });
            c.restore(); return;
        }
        const pts = op.points; if (!pts?.length) { c.restore(); return; }
        const lw = Math.max(0.5, (op.brush === 'pencil' ? Math.min(op.size, 0.004) : op.size) * W);
        c.lineCap = op.brush === 'marker' ? 'square' : 'round'; c.lineJoin = 'round'; c.lineWidth = lw;
        c.strokeStyle = op.color; c.globalAlpha = (op.opacity ?? 1) * (op.brush === 'marker' ? 0.45 : 1);
        if (op.brush === 'eraser') { c.globalCompositeOperation = 'destination-out'; c.strokeStyle = '#000'; c.globalAlpha = op.opacity ?? 1; }
        if (op.brush === 'marker') c.globalCompositeOperation = 'multiply';
        if (op.brush === 'soft') c.filter = `blur(${Math.max(1, lw * 0.28)}px)`;
        if (op.brush === 'chalk') {
            // craie : des petits points au hasard (toujours les mêmes : le hasard part du trait lui-même)
            let seed = Math.round(pts[0][0] * 1e6 + pts[0][1] * 1e3) || 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
            c.fillStyle = op.color;
            for (let i = 0; i < pts.length; i++) {
                const [x, y] = pts[i], [px, py] = pts[Math.max(0, i - 1)], steps = Math.max(1, Math.round(Math.hypot((x - px) * W, (y - py) * H) / (lw / 3)));
                for (let s = 0; s < steps; s++) { const t = s / steps, cx = (px + (x - px) * t) * W, cy = (py + (y - py) * t) * H;
                    for (let k = 0; k < 8; k++) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * lw / 2; c.globalAlpha = (op.opacity ?? 1) * (0.25 + rnd() * 0.5); c.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, Math.max(1, lw / 10), Math.max(1, lw / 10)); } }
            }
            c.restore(); return;
        }
        c.beginPath(); c.moveTo(pts[0][0] * W, pts[0][1] * H);
        if (pts.length === 1) c.lineTo(pts[0][0] * W + 0.01, pts[0][1] * H);
        for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; c.quadraticCurveTo(pts[i][0] * W, pts[i][1] * H, mx * W, my * H); }
        if (pts.length > 1) { const l = pts[pts.length - 1]; c.lineTo(l[0] * W, l[1] * H); }
        c.stroke(); c.restore();
    }
    const rtDrawLayer = (canvas, layer) => { const c = canvas.getContext('2d'); c.clearRect(0, 0, canvas.width, canvas.height); layer.ops.forEach(op => rtDrawOp(c, op, canvas.width, canvas.height)); };
    const rtClone = v => JSON.parse(JSON.stringify(v));

    /** Retouche d'une photo : on part de la version affichée (ou d'une autre, `source`), le résultat devient une nouvelle version.
     *  Outils : réglages, correcteur de taches, tampon (source choisie), pinceau (6 sortes), texte ; calques d'annotation ; historique ; zoom. */
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
        // aperçu assez grand pour zoomer et corriger un détail (l'enregistrement se fait toujours en pleine taille)
        const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
        const pw = Math.max(1, Math.round(img.naturalWidth * scale)), ph = Math.max(1, Math.round(img.naturalHeight * scale));
        const work = document.createElement('canvas'); work.width = pw; work.height = ph;
        const wctx = work.getContext('2d', {willReadFrequently: true}); wctx.drawImage(img, 0, 0, pw, ph);
        const srcData = wctx.getImageData(0, 0, pw, ph);
        const hist = new Array(256).fill(0); for (let i = 0; i < srcData.data.length; i += 4) hist[Math.round(0.299 * srcData.data[i] + 0.587 * srcData.data[i + 1] + 0.114 * srcData.data[i + 2])]++;
        const hmax = Math.max(...hist.slice(2, 254), 1);
        const histPath = 'M0,256 ' + hist.map((h, x) => `L${x},${256 - Math.min(256, h / hmax * 230)}`).join(' ') + ' L255,256 Z';
        const TOOLS = [['adjust', '🎚', 'Réglages'], ['heal', '🩹', 'Correcteur de taches'], ['clone', '🧬', 'Tampon'], ['brush', '🖌', 'Pinceau'], ['text', '🔤', 'Texte'], ['hand', '✋', 'Déplacer la vue']];
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-retouch h-rt2';
        dlg.innerHTML = `<div class="h-rt-head"><div><span class="eyebrow">RETOUCHE</span><h2>${esc(item.title || item.filename || 'Photo')}</h2></div><span class="spacer"></span>${ext.tbButton('retouch')}${ext.fullButton('retouch')}<button type="button" class="icon-button" data-rt-close aria-label="Fermer">×</button></div>
            <div class="h-rt-bar" data-tbg="rt-bar" data-tbg-label="Barre du haut (groupes)">
                <span class="h-rt-modes" role="toolbar" data-tb="modes" data-tb-label="Les outils" data-tbg="rt-modes" data-tbg-label="Outils">${TOOLS.map(([k, i, l]) => `<button type="button" class="button small ${k === 'adjust' ? '' : 'secondary'}" data-rt-mode="${k}" title="${esc(l)}">${i} ${esc(l)}</button>`).join('')}</span>
                <span class="h-rt-hist-btns"><button type="button" class="button small secondary" data-rt-undo disabled title="Annuler (⌘Z)">↶</button><button type="button" class="button small secondary" data-rt-redo disabled title="Rétablir (⇧⌘Z)">↷</button></span>
                <span class="h-rt-zoom"><button type="button" class="button small secondary" data-rt-zoom="-1" title="Dézoomer (−)">−</button><output data-rt-zoomout>100 %</output><button type="button" class="button small secondary" data-rt-zoom="1" title="Zoomer (+)">+</button><button type="button" class="button small secondary" data-rt-zoomfit title="Toute l’image (0)">Ajuster</button><button type="button" class="button small secondary" data-rt-zoom100 title="Taille réelle (1)">1:1</button></span>
            </div>
            <div class="h-rt-opts" data-rt-opts hidden data-tbg="rt-opts" data-tbg-label="Options des outils (pinceau, texte…)">
                <label data-o="size">Taille <input type="range" min="1" max="200" value="18" data-rt-size> <output data-rt-size-out>18</output> <small class="muted">[ ]</small></label>
                <label data-o="hard">Dureté <input type="range" min="0" max="100" value="55" data-rt-hard> <output data-rt-hard-out>55 %</output></label>
                <label data-o="opacity">Opacité <input type="range" min="5" max="100" value="100" data-rt-opac> <output data-rt-opac-out>100 %</output></label>
                <label data-o="brush">Sorte <select data-rt-brushtype>${RT_BRUSHES.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
                <label data-o="color">Couleur <input type="color" value="#d0021b" data-rt-color></label>
                <span data-o="swatches" class="h-rt-swatches">${['#d0021b', '#f5a623', '#f8e71c', '#7ed321', '#2a7de1', '#9013fe', '#ffffff', '#000000'].map(c => `<button type="button" style="background:${c}" data-rt-swatch="${c}" aria-label="${c}"></button>`).join('')}</span>
                <label data-o="font">Police <select data-rt-font>${RT_FONTS.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('')}</select></label>
                <label data-o="font" class="checkbox-line"><input type="checkbox" data-rt-halo checked> <span>contour blanc</span></label>
                <span data-o="clone" class="h-rt-clone"><button type="button" class="button small" data-rt-pick>🎯 Choisir l’endroit à recopier</button><label class="checkbox-line"><input type="checkbox" data-rt-aligned checked> <span>aligné</span></label></span>
                <small class="muted" data-rt-paint-help></small>
            </div>
            <div class="h-rt-main">
                <div class="h-rt-left">
                    <div class="h-rt-stage" data-rt-stage><div class="h-rt-canvaswrap" data-rt-wrap><canvas data-rt-canvas width="${pw}" height="${ph}"></canvas><span class="h-rt-brush" data-rt-brush hidden></span><span class="h-rt-src" data-rt-src hidden></span></div>
                        <button type="button" class="button small secondary h-rt-before" data-rt-before title="Garder appuyé pour voir l’original">👁 Avant / après</button></div>
                    <section class="h-rt-versions" data-rt-versions></section>
                </div>
                <aside class="h-rt-side">
                    <div class="h-rt-tabs"><button type="button" class="is-active" data-rt-tab="adjust">🎚 Réglages</button><button type="button" data-rt-tab="layers">🗂 Calques</button><button type="button" data-rt-tab="history">🕘 Historique</button></div>
                    <div class="h-rt-tools" data-rt-pane="adjust" data-tbg="rt-adjust" data-tbg-label="Panneau Réglages"><div class="h-rt-presets" data-tb-label="Préréglages">${RT_PRESETS.map(([l], i) => `<button type="button" class="button small secondary" data-rt-preset="${i}">${esc(l)}</button>`).join('')}</div>
                        ${RT_SLIDERS.map(([k, l, mn, mx]) => `<label class="h-rt-slider"><span>${esc(l)} <output data-rt-out="${k}">0</output></span><input type="range" min="${mn}" max="${mx}" value="0" data-rt="${k}"></label>`).join('')}
                        <div class="h-rt-toggles"><label class="checkbox-line"><input type="checkbox" data-rt-t="bw"> Noir et blanc</label><label class="checkbox-line"><input type="checkbox" data-rt-t="sepia"> Sépia</label><label class="checkbox-line"><input type="checkbox" data-rt-t="invert"> Négatif</label></div>
                        <div class="h-rt-curve-head"><strong>Courbe</strong><span>${RT_CHANNELS.map(([k, l]) => `<button type="button" class="h-rt-ch ${k === 'rgb' ? 'is-active' : ''}" data-rt-ch="${k}">${l}</button>`).join('')}</span></div>
                        <svg class="h-rt-curve" viewBox="-6 -6 268 268" data-rt-curve><path class="h-rt-hist" d="${histPath}"/><g class="h-rt-grid">${[64, 128, 192].map(v => `<line x1="${v}" y1="0" x2="${v}" y2="256"/><line x1="0" y1="${v}" x2="256" y2="${v}"/>`).join('')}<line x1="0" y1="256" x2="256" y2="0" class="h-rt-diag"/></g><path class="h-rt-line" data-rt-line/><g data-rt-points></g></svg>
                        <div class="h-rt-curve-tools"><button type="button" class="button small secondary" data-rt-ptdel disabled>Enlever le point</button></div>
                        <p class="muted h-rt-help">Clic sur la courbe : ajouter un point · glisser : le déplacer · pour l’enlever : le choisir puis « Enlever le point » (ou ⌫), ou le glisser hors du cadre.</p>
                        <button type="button" class="link-button" data-rt-reset>Remettre les réglages à zéro</button></div>
                    <div class="h-rt-tools" data-rt-pane="layers" hidden></div>
                    <div class="h-rt-tools" data-rt-pane="history" hidden></div>
                </aside>
            </div>
            <div class="modal-actions"><label class="checkbox-line h-rt-merge" data-rt-mergebox hidden><input type="checkbox" data-rt-merge checked> <span>avec les annotations (calques visibles)</span></label><span class="spacer"></span><button type="button" class="button secondary" data-rt-close>Annuler</button><button type="button" class="button secondary" data-rt-save="copy" title="Un autre média, rattaché aux mêmes fiches">Copie séparée</button><button type="button" class="button secondary" data-rt-save="keep" title="Gardée dans les versions, la photo affichée ne change pas">Enregistrer sans l’afficher</button><button type="button" class="button" data-rt-save="show">Enregistrer et afficher cette version</button></div>
            <p class="muted h-rt-note">L’original n’est jamais modifié : chaque retouche est une version de la photo, et tu choisis celle qui s’affiche partout.</p>`;
        document.body.appendChild(dlg);
        ext.tbApply(dlg, 'retouch'); // boutons rangés à sa façon (⚙️ Personnaliser)
        ext.fullInit(dlg, 'retouch');
        const $ = q => dlg.querySelector(q), $$ = q => [...dlg.querySelectorAll(q)];
        const canvas = $('[data-rt-canvas]'), ctx = canvas.getContext('2d'), out = ctx.createImageData(pw, ph);
        const stage = $('[data-rt-stage]'), wrap = $('[data-rt-wrap]');
        let raf = 0, showBefore = false, selPt = -1, outside = -1;
        const baseData = new ImageData(new Uint8ClampedArray(srcData.data), pw, ph); // l'image d'origine (avant / après, annuler)
        // ── Calques : la photo (réglages, taches, tampon) tout en bas, puis les calques d'annotation ──
        st.strokes = [];
        let layers = [], activeLayer = '', layerSeq = 0;
        const layerCanvases = new Map();
        const layerCanvas = l => { let c = layerCanvases.get(l.id); if (!c) { c = document.createElement('canvas'); c.width = pw; c.height = ph; layerCanvases.set(l.id, c); } return c; };
        const newLayer = name => { const l = {id: 'l' + (++layerSeq) + Date.now().toString(36), name: name || `Calque ${layers.length + 1}`, visible: true, opacity: 1, locked: false, ops: []}; layers.push(l); activeLayer = l.id; return l; };
        let photoVisible = true;
        const photo = () => rtApply(srcData, out, st);
        const draw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
            if (showBefore) { ctx.putImageData(baseData, 0, 0); return; }
            if (photoVisible) ctx.putImageData(photo(), 0, 0); else { ctx.clearRect(0, 0, pw, ph); }
            for (const l of layers) if (l.visible) { ctx.globalAlpha = l.opacity; ctx.drawImage(layerCanvas(l), 0, 0); ctx.globalAlpha = 1; }
            if (painting?.preview) { ctx.save(); const l = layers.find(x => x.id === activeLayer); ctx.globalAlpha = l?.opacity ?? 1; rtDrawOp(ctx, painting.preview, pw, ph); ctx.restore(); }
        }); };
        // ── Historique : chaque geste ou réglage est une étape ; un clic sur une étape y revient ──
        let history = [], hpos = -1;
        const snapshot = () => ({st: rtClone({...st, strokes: undefined}), strokes: rtClone(st.strokes), layers: rtClone(layers), activeLayer, photoVisible});
        const commit = label => {
            const snap = snapshot();
            if (hpos >= 0 && JSON.stringify(history[hpos].snap) === JSON.stringify(snap)) return; // rien n'a changé
            history = history.slice(0, hpos + 1); history.push({label, at: new Date(), snap}); if (history.length > 200) history.shift(); hpos = history.length - 1;
            refreshHistory();
        };
        const restore = i => {
            const s = history[i]?.snap; if (!s) return;
            Object.keys(st).forEach(k => { if (k !== 'strokes') delete st[k]; }); Object.assign(st, rtClone(s.st));
            st.strokes = rtClone(s.strokes);
            srcData.data.set(baseData.data); if (st.strokes.length) rtReplayStrokes(srcData, st.strokes);
            layers = rtClone(s.layers); activeLayer = s.activeLayer; photoVisible = s.photoVisible;
            layerCanvases.clear(); layers.forEach(l => rtDrawLayer(layerCanvas(l), l));
            hpos = i; syncControls(); refreshLayers(); refreshHistory();
        };
        const undoBtn = $('[data-rt-undo]'), redoBtn = $('[data-rt-redo]');
        function refreshHistory() {
            undoBtn.disabled = hpos <= 0; redoBtn.disabled = hpos >= history.length - 1;
            const pane = $('[data-rt-pane="history"]');
            pane.innerHTML = `<p class="muted">Clique sur une étape pour revenir à ce moment-là ; les étapes suivantes restent (en gris) tant que tu ne fais rien d’autre.</p><ol class="h-rt-history">${history.map((h, i) => `<li class="${i === hpos ? 'is-current' : i > hpos ? 'is-future' : ''}"><button type="button" data-rt-hist="${i}"><span>${esc(h.label)}</span><small>${h.at.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit', second: '2-digit'})}</small></button></li>`).join('')}</ol>`;
            pane.querySelector('.is-current')?.scrollIntoView({block: 'nearest'});
        }
        $('[data-rt-pane="history"]').addEventListener('click', e => { const b = e.target.closest('[data-rt-hist]'); if (b) restore(Number(b.dataset.rtHist)); });
        undoBtn.addEventListener('click', () => restore(hpos - 1));
        redoBtn.addEventListener('click', () => restore(hpos + 1));
        // ── Calques : liste, ajout, ordre, visibilité, opacité, verrou, nom ──
        function refreshLayers() {
            const pane = $('[data-rt-pane="layers"]');
            pane.innerHTML = `<p class="muted">Le pinceau et le texte dessinent sur le calque choisi (en bleu) ; la photo reste dessous, intacte. Les réglages, le correcteur et le tampon agissent sur la photo.</p>
                <button type="button" class="button small" data-rt-ladd>+ Nouveau calque</button>
                <ol class="h-rt-layers">${[...layers].reverse().map(l => `<li class="${l.id === activeLayer ? 'is-active' : ''}" data-rt-l="${l.id}">
                    <button type="button" class="h-rt-eye" data-rt-lvis title="${l.visible ? 'Masquer' : 'Montrer'}">${l.visible ? '👁' : '◌'}</button>
                    <input value="${esc(l.name)}" data-rt-lname aria-label="Nom du calque">
                    <button type="button" class="h-rt-eye" data-rt-llock title="${l.locked ? 'Déverrouiller' : 'Verrouiller'}">${l.locked ? '🔒' : '🔓'}</button>
                    <span class="h-rt-lmoves"><button type="button" class="icon-button small" data-rt-lmove="1" title="Monter">↑</button><button type="button" class="icon-button small" data-rt-lmove="-1" title="Descendre">↓</button><button type="button" class="icon-button small" data-rt-ldel title="Supprimer">✕</button></span>
                    <label class="h-rt-lopac">Opacité <input type="range" min="0" max="100" value="${Math.round(l.opacity * 100)}" data-rt-lopac></label>
                    <small class="muted">${l.ops.length} trait${l.ops.length > 1 ? 's' : ''} ou texte${l.ops.length > 1 ? 's' : ''}</small>
                    ${l.ops.length ? `<button type="button" class="link-button" data-rt-lclear>vider</button>` : ''}</li>`).join('')}
                    <li class="is-photo"><button type="button" class="h-rt-eye" data-rt-pvis title="${photoVisible ? 'Masquer la photo' : 'Montrer la photo'}">${photoVisible ? '👁' : '◌'}</button><strong>🖼 Photo</strong><small class="muted">réglages, ${st.strokes.length} correction${st.strokes.length > 1 ? 's' : ''}</small></li></ol>`;
            $('[data-rt-mergebox]').hidden = !layers.some(l => l.ops.length);
        }
        const paneLayers = $('[data-rt-pane="layers"]');
        paneLayers.addEventListener('click', e => {
            if (e.target.closest('[data-rt-ladd]')) { newLayer(); refreshLayers(); commit('Nouveau calque'); return; }
            if (e.target.closest('[data-rt-pvis]')) { photoVisible = !photoVisible; refreshLayers(); draw(); commit(photoVisible ? 'Photo montrée' : 'Photo masquée'); return; }
            const li = e.target.closest('[data-rt-l]'); if (!li) return;
            const l = layers.find(x => x.id === li.dataset.rtL); if (!l) return;
            if (e.target.closest('[data-rt-lvis]')) { l.visible = !l.visible; refreshLayers(); draw(); commit(`${l.name} ${l.visible ? 'montré' : 'masqué'}`); return; }
            if (e.target.closest('[data-rt-llock]')) { l.locked = !l.locked; refreshLayers(); commit(`${l.name} ${l.locked ? 'verrouillé' : 'déverrouillé'}`); return; }
            if (e.target.closest('[data-rt-ldel]')) { if (l.ops.length && !confirm(`Supprimer « ${l.name} » et ce qui est dessus ?`)) return; layers = layers.filter(x => x !== l); layerCanvases.delete(l.id); activeLayer = layers[layers.length - 1]?.id || ''; refreshLayers(); draw(); commit(`${l.name} supprimé`); return; }
            if (e.target.closest('[data-rt-lclear]')) { l.ops = []; rtDrawLayer(layerCanvas(l), l); refreshLayers(); draw(); commit(`${l.name} vidé`); return; }
            const mv = e.target.closest('[data-rt-lmove]');
            if (mv) { const i = layers.indexOf(l), j = i + Number(mv.dataset.rtLmove); if (j < 0 || j >= layers.length) return; [layers[i], layers[j]] = [layers[j], layers[i]]; refreshLayers(); draw(); commit(`${l.name} déplacé`); return; }
            if (!e.target.closest('input,button')) { activeLayer = l.id; refreshLayers(); }
        });
        paneLayers.addEventListener('focusin', e => { const li = e.target.closest('[data-rt-l]'); if (li && activeLayer !== li.dataset.rtL) { activeLayer = li.dataset.rtL; paneLayers.querySelectorAll('[data-rt-l]').forEach(x => x.classList.toggle('is-active', x === li)); } });
        paneLayers.addEventListener('input', e => { const li = e.target.closest('[data-rt-l]'), l = layers.find(x => x.id === li?.dataset.rtL); if (!l) return; if (e.target.matches('[data-rt-lopac]')) { l.opacity = Number(e.target.value) / 100; draw(); } if (e.target.matches('[data-rt-lname]')) l.name = e.target.value.slice(0, 60) || 'Calque'; });
        paneLayers.addEventListener('change', e => { const li = e.target.closest('[data-rt-l]'), l = layers.find(x => x.id === li?.dataset.rtL); if (!l) return; if (e.target.matches('[data-rt-lopac]')) commit(`Opacité de ${l.name} : ${Math.round(l.opacity * 100)} %`); if (e.target.matches('[data-rt-lname]')) commit(`Calque renommé « ${l.name} »`); });
        const showTab = k => { $$('[data-rt-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.rtTab === k)); $$('[data-rt-pane]').forEach(p => { p.hidden = p.dataset.rtPane !== k; }); };
        $$('[data-rt-tab]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.rtTab)));

        // ── Zoom : boutons, molette avec ⌘ / Ctrl (ou pincer), barre d'espace ou ✋ pour se déplacer ──
        let zoom = 1; // 1 = toute l'image dans le cadre
        const fitScale = () => { const r = stage.getBoundingClientRect(); return Math.min((r.width - 24) / pw, (r.height - 24) / ph); };
        const setZoom = (z, cx, cy) => {
            const r = stage.getBoundingClientRect(), before = canvas.getBoundingClientRect();
            const ax = cx ?? r.left + r.width / 2, ay = cy ?? r.top + r.height / 2, fx = (ax - before.left) / before.width, fy = (ay - before.top) / before.height;
            zoom = Math.max(0.2, Math.min(40, z));
            const k = fitScale() * zoom; canvas.style.width = pw * k + 'px'; canvas.style.height = ph * k + 'px';
            const after = canvas.getBoundingClientRect();
            stage.scrollLeft += (after.left + fx * after.width) - ax; stage.scrollTop += (after.top + fy * after.height) - ay;
            $('[data-rt-zoomout]').textContent = Math.round(k / scale * 100) + ' %';
            canvas.classList.toggle('is-pixelated', k / scale > 2);
        };
        $$('[data-rt-zoom]').forEach(b => b.addEventListener('click', () => setZoom(zoom * (b.dataset.rtZoom === '1' ? 1.5 : 1 / 1.5))));
        $('[data-rt-zoomfit]').addEventListener('click', () => setZoom(1));
        $('[data-rt-zoom100]').addEventListener('click', () => setZoom(scale / fitScale()));
        stage.addEventListener('wheel', e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); setZoom(zoom * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY); }, {passive: false});
        const ro = new ResizeObserver(() => setZoom(zoom)); ro.observe(stage);

        // ── Outils de peinture ──
        let mode = 'adjust', brush = 18, hard = 55, opac = 100, brushType = 'round', color = '#d0021b', font = RT_FONTS[0][0], halo = true, aligned = true;
        let cloneOff = null, cloneSrc = null, picking = false, painting = null, panning = null, spaceDown = false;
        const brushEl = $('[data-rt-brush]'), srcEl = $('[data-rt-src]'), help = $('[data-rt-paint-help]');
        const HELP = {adjust: '', hand: 'Glisse pour te déplacer dans l’image zoomée (la barre d’espace fait pareil avec n’importe quel outil).',
            heal: 'Clique sur une tache, une poussière ou une rayure : elle est remplacée par ce qui l’entoure. Pour une rayure, glisse le long. Zoome (⌘ + molette) pour être précis.',
            clone: '« Choisir l’endroit à recopier » (ou ⌥ + clic), puis peins sur la zone à couvrir. « Aligné » : la source suit ton pinceau d’un trait à l’autre.',
            brush: 'Peins sur le calque choisi (Calques) : annoter, entourer, flécher à la main. La gomme efface ce qui a été peint, jamais la photo.',
            text: 'Clique dans l’image à l’endroit du texte, écris, puis Entrée (⇧ + Entrée pour aller à la ligne).'};
        const OPTS = {heal: ['size'], clone: ['size', 'hard', 'clone'], brush: ['size', 'opacity', 'brush', 'color', 'swatches'], text: ['size', 'opacity', 'color', 'swatches', 'font'], hand: [], adjust: []};
        const setMode = m => {
            mode = m; picking = false;
            $$('[data-rt-mode]').forEach(b => b.classList.toggle('secondary', b.dataset.rtMode !== m));
            $('[data-rt-opts]').hidden = !OPTS[m].length;
            $$('[data-rt-opts] [data-o]').forEach(el => { el.hidden = !OPTS[m].includes(el.dataset.o); });
            help.textContent = HELP[m];
            canvas.classList.toggle('is-painting', ['heal', 'clone', 'brush'].includes(m)); canvas.classList.toggle('is-text', m === 'text'); stage.classList.toggle('is-hand', m === 'hand');
            brushEl.hidden = true; srcEl.hidden = true;
            if (['brush', 'text'].includes(m)) { if (!layers.length) { newLayer('Annotations'); refreshLayers(); commit('Calque « Annotations » créé'); } showTab('layers'); }
            if (m === 'adjust') showTab('adjust');
        };
        $$('[data-rt-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.rtMode)));
        const setSize = v => { brush = Math.max(1, Math.min(200, Math.round(v))); $('[data-rt-size]').value = brush; $('[data-rt-size-out]').textContent = brush; };
        $('[data-rt-size]').addEventListener('input', e => setSize(Number(e.target.value)));
        $('[data-rt-hard]').addEventListener('input', e => { hard = Number(e.target.value); $('[data-rt-hard-out]').textContent = hard + ' %'; });
        $('[data-rt-opac]').addEventListener('input', e => { opac = Number(e.target.value); $('[data-rt-opac-out]').textContent = opac + ' %'; });
        $('[data-rt-brushtype]').addEventListener('change', e => { brushType = e.target.value; });
        $('[data-rt-color]').addEventListener('input', e => { color = e.target.value; });
        $$('[data-rt-swatch]').forEach(b => b.addEventListener('click', () => { color = b.dataset.rtSwatch; $('[data-rt-color]').value = color; }));
        $('[data-rt-font]').addEventListener('change', e => { font = e.target.value; });
        $('[data-rt-halo]').addEventListener('change', e => { halo = e.target.checked; });
        $('[data-rt-aligned]').addEventListener('change', e => { aligned = e.target.checked; });
        $('[data-rt-pick]').addEventListener('click', () => { picking = true; help.textContent = 'Clique maintenant à l’endroit à recopier.'; canvas.classList.add('is-picking'); });
        // coordonnées : la toile garde sa taille d'aperçu (pw × ph) ; elle est affichée plus ou moins grande selon le zoom
        const toCanvas = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * pw / r.width, (e.clientY - r.top) * ph / r.height, r.width / pw]; };
        const showBrush = e => {
            if (!['heal', 'clone', 'brush'].includes(mode) || picking) { brushEl.hidden = true; srcEl.hidden = !(mode === 'clone' && cloneSrc && picking === false && !cloneOff); return; }
            const [x, y, k] = toCanvas(e), r = mode === 'brush' && brushType === 'pencil' ? Math.min(brush, 4) : brush, cr = canvas.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
            Object.assign(brushEl.style, {width: r * 2 * k + 'px', height: r * 2 * k + 'px', left: (cr.left - wr.left + x * k - r * k) + 'px', top: (cr.top - wr.top + y * k - r * k) + 'px', borderColor: mode === 'brush' ? color : ''}); brushEl.hidden = false;
            const off = cloneOff || (cloneSrc && aligned === false ? null : null);
            if (mode === 'clone' && (off || cloneSrc)) { const sx = off ? x + off[0] : cloneSrc[0], sy = off ? y + off[1] : cloneSrc[1]; Object.assign(srcEl.style, {left: (cr.left - wr.left + sx * k) + 'px', top: (cr.top - wr.top + sy * k) + 'px'}); srcEl.hidden = false; }
        };
        const dabAt = (x, y) => {
            const g = painting, d = g.dabs, last = d[d.length - 1];
            if (last && Math.hypot(x - last.x * pw, y - last.y * ph) < Math.max(0.6, brush / 4)) return;
            const rec = {x: x / pw, y: y / ph, r: brush / pw};
            if (g.tool === 'heal') { const h = rtHealSource(g.from, pw, ph, x, y, brush); if (!h) return; rtDab(srcData.data, g.from, pw, ph, x, y, h.sx, h.sy, brush, h.offset, 0.35); }
            else { rec.ox = cloneOff[0] / pw; rec.oy = cloneOff[1] / ph; rec.h = hard / 100; rtDab(srcData.data, g.from, pw, ph, x, y, x + cloneOff[0], y + cloneOff[1], brush, null, hard / 100); }
            d.push(rec); draw();
        };
        const placeText = (x, y) => {
            const l = layers.find(z => z.id === activeLayer); if (!l || l.locked) return toast('Ce calque est verrouillé : choisis-en un autre dans Calques.', 'error');
            const r = canvas.getBoundingClientRect(), wr = wrap.getBoundingClientRect(), k = r.width / pw;
            const ta = document.createElement('textarea'); ta.className = 'h-rt-textinput'; ta.rows = 1;
            Object.assign(ta.style, {left: (r.left - wr.left + x * k) + 'px', top: (r.top - wr.top + y * k) + 'px', fontSize: Math.max(10, brush * k) + 'px', color, fontFamily: font});
            wrap.appendChild(ta); ta.focus();
            let over = false; const done = ok => { if (over) return; over = true; const text = ta.value.trim(); ta.remove(); if (!ok || !text) return; l.ops.push({type: 'text', text, x: x / pw, y: y / ph, size: brush / pw, color, opacity: opac / 100, font, halo: halo ? '#ffffff' : ''}); rtDrawLayer(layerCanvas(l), l); draw(); refreshLayers(); commit(`Texte « ${text.slice(0, 24)}${text.length > 24 ? '…' : ''} »`); };
            ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); done(true); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } });
            ta.addEventListener('blur', () => done(true));
        };
        canvas.addEventListener('pointerdown', e => {
            if (mode === 'hand' || spaceDown || e.button === 1) { panning = {x: e.clientX, y: e.clientY, l: stage.scrollLeft, t: stage.scrollTop}; canvas.setPointerCapture(e.pointerId); e.preventDefault(); return; }
            if (mode === 'adjust') return;
            e.preventDefault();
            const [x, y] = toCanvas(e);
            if (mode === 'text') return placeText(x, y);
            if (mode === 'clone') {
                if (e.altKey || picking) { cloneSrc = [x, y]; cloneOff = null; picking = false; canvas.classList.remove('is-picking'); help.textContent = HELP.clone; toast('Endroit à recopier choisi : peins maintenant sur la zone à couvrir.'); return; }
                if (cloneSrc && (!cloneOff || !aligned)) cloneOff = [cloneSrc[0] - x, cloneSrc[1] - y];
                if (!cloneOff) { toast('Choisis d’abord l’endroit à recopier (bouton 🎯 ou ⌥ + clic).', 'error'); return; }
            }
            if (mode === 'brush') {
                const l = layers.find(z => z.id === activeLayer); if (!l) return;
                if (l.locked) return toast('Ce calque est verrouillé : choisis-en un autre dans Calques.', 'error');
                painting = {tool: 'brush', layer: l, preview: {type: 'brush', brush: brushType, color, size: (brushType === 'pencil' ? Math.min(brush, 4) : brush) * 2 / pw, opacity: opac / 100, points: [[x / pw, y / ph]]}};
                canvas.setPointerCapture(e.pointerId); draw(); return;
            }
            painting = {tool: mode, dabs: [], from: new Uint8ClampedArray(srcData.data)};
            canvas.setPointerCapture(e.pointerId); dabAt(x, y);
        });
        canvas.addEventListener('pointermove', e => {
            if (panning) { stage.scrollLeft = panning.l - (e.clientX - panning.x); stage.scrollTop = panning.t - (e.clientY - panning.y); return; }
            showBrush(e);
            if (!painting) return;
            const [x, y] = toCanvas(e);
            if (painting.tool === 'brush') { const p = painting.preview.points, l = p[p.length - 1]; if (Math.hypot((x / pw - l[0]) * pw, (y / ph - l[1]) * ph) >= 1) { p.push([x / pw, y / ph]); draw(); } return; }
            dabAt(x, y);
        });
        canvas.addEventListener('pointerleave', () => { brushEl.hidden = true; if (!cloneSrc) srcEl.hidden = true; });
        const NAMES = {heal: 'Correcteur de taches', clone: 'Tampon de duplication'};
        const endPaint = () => {
            if (panning) { panning = null; return; }
            if (!painting) return;
            const g = painting; painting = null;
            if (g.tool === 'brush') { g.layer.ops.push(g.preview); rtDrawLayer(layerCanvas(g.layer), g.layer); draw(); refreshLayers(); commit(`${RT_BRUSHES.find(b => b[0] === g.preview.brush)?.[1] || 'Pinceau'} sur « ${g.layer.name} »`); return; }
            if (g.dabs.length) { st.strokes.push({tool: g.tool, dabs: g.dabs}); refreshLayers(); commit(NAMES[g.tool] + (g.dabs.length > 1 ? ` (${g.dabs.length} touches)` : '')); }
        };
        canvas.addEventListener('pointerup', endPaint); canvas.addEventListener('pointercancel', endPaint);
        // ── Courbe et réglages ──
        const svg = $('[data-rt-curve]');
        const drawCurve = () => {
            const lut = curveLut(st.curves[channel]);
            $('[data-rt-line]').setAttribute('d', 'M' + Array.from(lut, (v, x) => `${x},${256 - v}`).join(' L'));
            $('[data-rt-line]').dataset.ch = channel;
            const pts = st.curves[channel];
            if (selPt >= pts.length) selPt = -1;
            $('[data-rt-points]').innerHTML = pts.map(([x, y], i) => `<circle cx="${x}" cy="${256 - y}" r="${i === selPt ? 7 : 5.5}" data-rt-pt="${i}" class="${i === selPt ? 'is-sel' : ''}${i === outside ? ' is-out' : ''}"/>`).join('');
            const del = $('[data-rt-ptdel]'); if (del) del.disabled = !(selPt >= 0 && pts.length > 2);
        };
        function syncControls() {
            RT_SLIDERS.forEach(([k]) => { $(`[data-rt="${k}"]`).value = st[k]; $(`[data-rt-out="${k}"]`).textContent = st[k] > 0 ? '+' + st[k] : st[k]; });
            ['bw', 'sepia', 'invert'].forEach(k => { $(`[data-rt-t="${k}"]`).checked = !!st[k]; });
            drawCurve(); draw();
        }
        const label = k => RT_SLIDERS.find(x => x[0] === k)?.[1] || k;
        dlg.addEventListener('input', e => { const k = e.target.dataset.rt; if (k) { st[k] = Number(e.target.value); $(`[data-rt-out="${k}"]`).textContent = st[k] > 0 ? '+' + st[k] : st[k]; draw(); } });
        dlg.addEventListener('change', e => {
            const k = e.target.dataset.rt; if (k) commit(`${label(k)} : ${st[k] > 0 ? '+' : ''}${st[k]}`);
            const t = e.target.dataset.rtT; if (t) { st[t] = e.target.checked; if (t === 'bw' && st.bw) st.sepia = false; if (t === 'sepia' && st.sepia) st.bw = false; syncControls(); commit(`${{bw: 'Noir et blanc', sepia: 'Sépia', invert: 'Négatif'}[t]} ${st[t] ? 'oui' : 'non'}`); }
        });
        $$('[data-rt-ch]').forEach(b => b.addEventListener('click', () => { channel = b.dataset.rtCh; selPt = -1; $$('[data-rt-ch]').forEach(x => x.classList.toggle('is-active', x === b)); drawCurve(); }));
        $$('[data-rt-preset]').forEach(b => b.addEventListener('click', () => { const keep = {bw: false, sepia: false, invert: false, strokes: st.strokes}; Object.assign(st, rtDefault(), keep); RT_PRESETS[Number(b.dataset.rtPreset)][1](st); if (st._auto) { delete st._auto; rtAuto(srcData, st); } syncControls(); commit(`Préréglage « ${RT_PRESETS[Number(b.dataset.rtPreset)][0]} »`); }));
        $('[data-rt-reset]').addEventListener('click', () => { Object.assign(st, rtDefault(), {strokes: st.strokes}); syncControls(); commit('Réglages remis à zéro'); });
        const before = $('[data-rt-before]');
        const setBefore = v => { showBefore = v; before.classList.toggle('is-active', v); draw(); };
        before.addEventListener('pointerdown', () => setBefore(true));
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => before.addEventListener(t, () => showBefore && setBefore(false)));
        const rawPoint = e => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 268 - 6, 256 - ((e.clientY - r.top) / r.height * 268 - 6)]; };
        const svgPoint = e => rawPoint(e).map(v => Math.round(clamp255(v)));
        const removePoint = i => { const pts = st.curves[channel]; if (i < 0 || pts.length <= 2) return; pts.splice(i, 1); selPt = -1; drawCurve(); draw(); commit('Point de courbe enlevé'); };
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
            outside = pts.length > 2 && (rx < -30 || rx > 286 || ry < -30 || ry > 286) ? dragging : -1;
            const lo = dragging > 0 ? pts[dragging - 1][0] + 1 : 0, hi = dragging < pts.length - 1 ? pts[dragging + 1][0] - 1 : 255;
            if (outside < 0) pts[dragging] = [Math.min(hi, Math.max(lo, x)), y];
            drawCurve(); draw();
        });
        const release = () => { if (dragging >= 0 && outside === dragging) { outside = -1; removePoint(dragging); } else if (dragging >= 0) commit(`Courbe ${RT_CHANNELS.find(c => c[0] === channel)[1]}`); dragging = -1; outside = -1; drawCurve(); };
        svg.addEventListener('pointerup', release); svg.addEventListener('pointercancel', release);
        svg.addEventListener('contextmenu', e => { const hit = e.target.closest('[data-rt-pt]'); if (hit) { e.preventDefault(); removePoint(Number(hit.dataset.rtPt)); } });
        $('[data-rt-ptdel]').addEventListener('click', () => removePoint(selPt));
        // ── Clavier : ⌘Z / ⇧⌘Z, [ ] taille, + − 0 1 zoom, espace pour se déplacer, ⌫ point de courbe ──
        const typing = e => e.target.closest?.('input:not([type=range]):not([type=checkbox]):not([type=color]), textarea, select, [contenteditable]');
        const onKey = e => {
            if (!dlg.open || typing(e)) return;
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopImmediatePropagation(); restore(e.shiftKey ? hpos + 1 : hpos - 1); return; }
            if (e.key === '[') { setSize(brush * 0.85 - 1); return; } if (e.key === ']') { setSize(brush * 1.18 + 1); return; }
            if (e.key === '+' || e.key === '=') { setZoom(zoom * 1.5); return; } if (e.key === '-') { setZoom(zoom / 1.5); return; }
            if (e.key === '0') { setZoom(1); return; } if (e.key === '1') { setZoom(scale / fitScale()); return; }
            if (e.key === ' ' && !spaceDown) { spaceDown = true; stage.classList.add('is-hand'); e.preventDefault(); return; }
            if ((e.key === 'Delete' || e.key === 'Backspace') && selPt >= 0) { e.preventDefault(); removePoint(selPt); }
        };
        const onKeyUp = e => { if (e.key === ' ') { spaceDown = false; stage.classList.toggle('is-hand', mode === 'hand'); } };
        window.addEventListener('keydown', onKey, true); document.addEventListener('keyup', onKeyUp); // avant les raccourcis de l'app
        // fermer : on demande s'il y a du travail non enregistré
        let saved = false;
        const askClose = () => { if (!saved && hpos > 0 && !confirm('Fermer sans enregistrer ? Les retouches en cours seront perdues.')) return; saved = true; dlg.close(); };
        $$('[data-rt-close]').forEach(b => b.addEventListener('click', askClose));
        dlg.addEventListener('cancel', e => { if (!saved && hpos > 0) { e.preventDefault(); askClose(); } });
        dlg.addEventListener('close', () => { window.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onKeyUp); ro.disconnect(); dlg.remove(); });
        const refreshAfter = async () => {
            const state = A().state;
            try {
                if (state.module === 'listes') await A().renderList();
                else if (state.currentPersonId && state.module === 'personnes') await A().selectPerson(state.currentPersonId, false);
                else ext.refreshView?.();
            } catch (_) {}
        };
        // ── Versions ──
        const applyShown = file => { if (file && file !== item.filename) { item.filename = item.thumbnail = file; item._cacheBust = Date.now(); A().renderLightboxItem?.(); refreshAfter(); } };
        const drawVersions = () => {
            const box = $('[data-rt-versions]');
            box.innerHTML = `<details ${versions.length > 1 ? 'open' : ''}><summary><h3>Versions de la photo (${versions.length || 1})</h3></summary><div class="h-rt-vlist">${versions.map(v => `<figure class="${v.shown ? 'is-shown' : ''} ${v.filename === from ? 'is-source' : ''}"><img src="media/${encodeURIComponent(v.filename)}" alt="" loading="lazy"><figcaption><strong>${esc(v.label)}</strong>${v.shown ? '<span class="h-rt-badge">affichée</span>' : (v.id ? `<button type="button" class="link-button" data-rt-vshow="${v.id}">Afficher par défaut</button>` : '')}
                ${v.filename !== from ? `<button type="button" class="link-button" data-rt-vfrom="${esc(v.filename)}">Retoucher celle-ci</button>` : '<small>en cours de retouche</small>'}${!v.is_original && v.id ? `<button type="button" class="link-button danger" data-rt-vdel="${v.id}">Supprimer</button>` : ''}</figcaption></figure>`).join('')}</div></details>`;
            box.querySelectorAll('[data-rt-vshow]').forEach(b => b.addEventListener('click', async () => {
                try { const r = await api('retouch_show_version', {}, {method: 'POST', body: {media_id: item.id, version_id: b.dataset.rtVshow}}); versions = r.result.versions; applyShown(r.result.filename); drawVersions(); toast('Version affichée par défaut changée.'); }
                catch (error) { toast(error.message, 'error'); }
            }));
            box.querySelectorAll('[data-rt-vdel]').forEach(b => b.addEventListener('click', async () => {
                if (!confirm('Supprimer cette version retouchée ? L’original et les autres versions restent.')) return;
                try { const r = await api('retouch_delete_version', {}, {method: 'POST', body: {media_id: item.id, version_id: b.dataset.rtVdel}}); versions = r.result.versions; applyShown(r.result.filename); drawVersions(); toast('Version supprimée.'); }
                catch (error) { toast(error.message, 'error'); }
            }));
            box.querySelectorAll('[data-rt-vfrom]').forEach(b => b.addEventListener('click', () => { if (!saved && hpos > 0 && !confirm('Quitter cette retouche sans l’enregistrer ?')) return; saved = true; dlg.close(); openRetouch(b.dataset.rtVfrom); }));
        };
        drawVersions();
        $$('[data-rt-save]').forEach(b => b.addEventListener('click', async () => {
            const saveMode = b.dataset.rtSave, label0 = b.textContent;
            const mpx = img.naturalWidth * img.naturalHeight / 1e6;
            if (mpx > 60 && !confirm(`Cette image est très grande (${Math.round(mpx)} millions de points) : l’enregistrement peut être long, voire échouer. Continuer ?`)) return;
            $$('.modal-actions button').forEach(x => { x.disabled = true; });
            b.textContent = 'Enregistrement…';
            try {
                // L'image en pleine taille : la photo retouchée, puis les calques visibles redessinés à cette taille
                const full = document.createElement('canvas'); full.width = img.naturalWidth; full.height = img.naturalHeight;
                const fctx = full.getContext('2d', {willReadFrequently: true}); fctx.drawImage(img, 0, 0);
                const data = fctx.getImageData(0, 0, full.width, full.height);
                if (st.strokes.length) rtReplayStrokes(data, st.strokes);
                fctx.putImageData(rtApply(data, data, st), 0, 0);
                if (!photoVisible) fctx.clearRect(0, 0, full.width, full.height);
                if ($('[data-rt-merge]').checked) for (const l of layers) if (l.visible && l.ops.length) {
                    const lc = document.createElement('canvas'); lc.width = full.width; lc.height = full.height; rtDrawLayer(lc, l);
                    fctx.globalAlpha = l.opacity; fctx.drawImage(lc, 0, 0); fctx.globalAlpha = 1;
                }
                const ext0 = String(from || '').split('.').pop().toLowerCase();
                const type = ext0 === 'png' ? 'image/png' : ext0 === 'webp' ? 'image/webp' : ext0 === 'gif' ? 'image/png' : 'image/jpeg';
                const blob = await new Promise(res => full.toBlob(res, type, 0.93));
                if (!blob) throw new Error('Image trop grande pour être enregistrée par le navigateur.');
                const fd = new FormData(); fd.append('file', blob, 'retouche.' + (type.split('/')[1] === 'jpeg' ? 'jpg' : type.split('/')[1])); fd.append('media_id', item.id); fd.append('mode', saveMode === 'copy' ? 'copy' : 'version'); fd.append('show', saveMode === 'show' ? '1' : '0'); fd.append('csrf', A().state.csrf);
                const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}});
                const j = await r.json().catch(() => ({error: 'Réponse illisible du serveur'}));
                if (!r.ok || j.error) throw new Error(j.error || 'Enregistrement impossible.');
                saved = true;
                if (saveMode === 'copy') { toast('Copie retouchée ajoutée aux mêmes fiches.'); dlg.close(); refreshAfter(); return; }
                if (saveMode === 'show') { applyShown(j.result.filename); toast('Nouvelle version affichée. L’original est gardé dans les versions.'); dlg.close(); return; }
                versions = j.result.versions; toast('Version enregistrée (non affichée).'); dlg.close();
            } catch (error) {
                toast(error.message, 'error');
                $$('.modal-actions button').forEach(x => { x.disabled = false; });
                b.textContent = label0;
            }
        }));
        dlg.showModal();
        setMode('adjust');
        commit('Ouverture de la photo');
        refreshLayers();
        syncControls();
        requestAnimationFrame(() => setZoom(1));
    }
    ext.retouchDrawOp = rtDrawOp; // pour les essais
    document.addEventListener('click', e => { if (e.target.closest('#retouch-media')) openRetouch(); });
    ext.openRetouch = openRetouch;

    /** Listes → Médias → « 🎚️ Retoucher » : une photo de l'app (les plus récentes, ou filtrées) ou une photo importée, puis la Retouche */
    function pickRetouch() {
        const open = item => { const st = A().state; st.lightboxMedia = [item]; st.lightboxIndex = 0; openRetouch(); };
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-modal h-rt-pick';
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">RETOUCHE</span><h2>Quelle photo retoucher ?</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="h-rt-pick-bar"><input type="search" data-q placeholder="Chercher une photo de l’app (titre, cote, nom du fichier)…"><label class="button small"><input type="file" accept="image/jpeg,image/png,image/webp" data-file hidden>📥 Importer une photo</label></div>
            <p class="muted small">Une photo importée est ajoutée aux Médias (sans être rattachée à une fiche) ; ses retouches sont gardées comme versions.</p>
            <div class="h-rt-pick-grid" data-grid><div class="loading-block">Chargement…</div></div>`;
        document.body.append(dlg);
        dlg.addEventListener('close', () => dlg.remove());
        dlg.querySelector('[data-x]').addEventListener('click', () => dlg.close());
        let items = [], timer = 0, seq = 0;
        const load = async () => {
            const n = ++seq, grid = dlg.querySelector('[data-grid]');
            try { items = (await api('image_pick', {q: dlg.querySelector('[data-q]').value.trim()})).media || []; } catch (e) { if (n === seq) grid.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
            if (n !== seq) return;
            grid.innerHTML = items.length ? items.map((m, i) => `<button type="button" class="h-rt-pick-item" data-i="${i}" title="${esc(m.title || m.filename)}"><img loading="lazy" alt="" src="media/${encodeURIComponent(m.thumbnail || m.filename)}"><span>${esc(m.title || m.filename)}</span></button>`).join('') : '<p class="muted">Aucune photo ne correspond. Importe-en une avec « 📥 Importer une photo ».</p>';
        };
        dlg.querySelector('[data-q]').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 220); });
        dlg.querySelector('[data-grid]').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; const m = items[+b.dataset.i]; dlg.close(); open(m); });
        dlg.querySelector('[data-file]').addEventListener('change', async e => {
            const f = e.target.files?.[0]; if (!f) return;
            const fd = new FormData(); fd.append('file', f, f.name); fd.append('kind', 'image'); fd.append('title', f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 300));
            try {
                const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}});
                const j = await r.json().catch(() => ({error: 'Réponse illisible du serveur'}));
                if (!r.ok || j.error) throw new Error(j.error || 'Import impossible.');
                dlg.close(); toast('Photo importée dans les Médias.');
                if (A().state.module === 'listes') Promise.resolve(A().renderList?.()).catch(() => {});
                open({id: j.result.media_id, filename: j.result.filename, thumbnail: j.result.filename, title: fd.get('title'), media_type: 'image'});
            } catch (err) { toast(err.message, 'error'); }
        });
        dlg.showModal(); load();
    }
    ext.pickRetouch = pickRetouch;
})();
