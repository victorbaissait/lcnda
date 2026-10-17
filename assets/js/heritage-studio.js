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
    const TB_DEFS = 'genealogie-toolbar-defs'; // les boutons de chaque éditeur, notés à son ouverture (pour Maintenance → Montage, retouche, mise en page et son)
    // les boutons de départ de chaque éditeur : Maintenance → Montage, retouche, mise en page et son les montre avant même la première ouverture
    const TB_DEFAULT_DEFS = {"vector": {"groups": [{"key": "vx-menus", "label": "Menus du haut", "items": [["menu-Fichier", "Menu Fichier"], ["menu-Édition", "Menu Édition"], ["menu-Objet", "Menu Objet"], ["menu-Aligner", "Menu Aligner"], ["menu-Pathfinder", "Menu Pathfinder"], ["menu-Blason", "Menu Blason"], ["menu-Affichage", "Menu Affichage"]]}, {"key": "vx-hist", "label": "Annuler / rétablir (en haut)", "items": [["vx-cmd=undo", "↶ Annuler (⌘Z)"], ["vx-cmd=redo", "↷ Rétablir (⇧⌘Z)"]]}, {"key": "vx-tools", "label": "Outils (colonne de gauche)", "items": [["vx-tool=select", "➤ Sélection (V)"], ["vx-tool=direct", "⌖ Sélection directe (points et poignées) (A)"], ["vx-tool=pen", "✒️ Plume (clic : point, glisser : courbe) (P)"], ["vx-tool=pencil", "✏️ Crayon (à main levée) (N)"], ["vx-tool=rect", "▭ Rectangle (M)"], ["vx-tool=ellipse", "◯ Ellipse (L)"], ["vx-tool=polygon", "⬡ Polygone (Y)"], ["vx-tool=star", "☆ Étoile (S)"], ["vx-tool=spiral", "🌀 Spirale (glisser depuis le centre) (O)"], ["vx-tool=line", "╱ Ligne (\\)"], ["vx-tool=text", "T Texte (T)"], ["vx-tool=eyedrop", "💧 Pipette (prend la couleur d’un objet) (I)"], ["vx-tool=hand", "✋ Main (déplacer la vue) (H)"], ["vx-tool=zoom", "🔍 Loupe (⌥ : dézoomer) (Z)"], ["vx-fsfill=", "Remplissage et contour de la sélection"]]}, {"key": "vx-tabs", "label": "Onglets du panneau de droite", "items": [["vx-tab=props", "Propriétés"], ["vx-tab=layers", "Calques"], ["vx-tab=blason", "Blason"], ["vx-tab=doc", "Document"]]}]}, "retouch": {"groups": [{"key": "rt-bar", "label": "Barre du haut (groupes)", "items": [["modes", "Les outils"], ["rt-undo=", "↶↷ Annuler (⌘Z)"], ["rt-zoom=-1", "−100 %+Ajuster1:1"]]}, {"key": "rt-modes", "label": "Outils", "items": [["rt-mode=adjust", "🎚 Réglages"], ["rt-mode=heal", "🩹 Correcteur de taches"], ["rt-mode=clone", "🧬 Tampon"], ["rt-mode=brush", "🖌 Pinceau"], ["rt-mode=eraser", "🧽 Gomme"], ["rt-mode=text", "🔤 Texte"], ["rt-mode=hand", "✋ Déplacer la vue"]]}, {"key": "rt-opts", "label": "Options des outils (pinceau, texte…)", "items": [["o=size", "Taille 18 [ ]"], ["o=hard", "Dureté 55 %"], ["o=opacity", "Opacité 100 %"], ["o=brush", "Sorte de pinceau"], ["o=color", "Couleur"], ["o=swatches", "Couleurs rapides"], ["o=font", "Police"], ["o=font", "Contour blanc du texte"], ["o=clone", "Tampon : endroit à recopier, aligné"], ["o=textstyle", "Texte gras"], ["o=textstyle", "Texte italique"], ["o=textstyle", "Polices de l’ordi"], ["o=shape", "Forme (rectangle, ellipse, flèche…)"], ["o=shape", "Forme remplie"], ["o=shape", "Couleur de fond des formes"], ["o=wand", "Baguette : tolérance"], ["o=wand", "Baguette : contiguë"], ["o=sel", "Actions de la sélection"], ["o=crop", "Recadrage : proportions, redresser"], ["o=maskmode", "Masque : cacher / montrer"], ["rt-paint-help=", "Aide de l’outil"]]}, {"key": "rt-vtools", "label": "Colonne d’outils", "items": [["rt-mode=move", "Déplacer un élément d’un calque (V)"], ["rt-mode=marquee", "Sélection rectangle (M)"], ["rt-mode=ellipsesel", "Sélection ellipse (⇧M)"], ["rt-mode=lasso", "Lasso : entourer à main levée (L)"], ["rt-mode=polysel", "Plume : sélection point par point (P) — double-clic ou Entrée pour fermer"], ["rt-mode=wand", "Sélection automatique (baguette magique) (W)"], ["rt-mode=crop", "Recadrer et redresser (C)"], ["rt-mode=heal", "Correcteur de taches (J)"], ["rt-mode=clone", "Tampon : un endroit, ou une zone sélectionnée (S)"], ["rt-mode=brush", "Pinceau (B)"], ["rt-mode=eraser", "Gomme (E)"], ["rt-mode=shape", "Formes : rectangle, ellipse, ligne, flèche (U)"], ["rt-mode=text", "Texte (T)"], ["rt-mode=hand", "Main (H, ou espace)"], ["rt-mode=zoom", "Zoom (Z) — ⌥ pour reculer"], ["rt-color2=", "Couleur"]]}, {"key": "rt-adjust", "label": "Panneau Réglages", "items": [["rt-target=", "(sans nom)"], ["rt-preset=0", "Préréglages"], ["rt-out=exposure", "Exposition 0"], ["rt-out=brightness", "Luminosité 0"], ["rt-out=contrast", "Contraste 0"], ["rt-out=shadows", "Ombres 0"], ["rt-out=highlights", "Hautes lumières 0"], ["rt-out=saturation", "Saturation 0"], ["rt-out=warmth", "Chaleur 0"], ["rt-t=bw", "Noir et blanc Sépia Négatif"], ["rt-ch=rgb", "CourbeRVBRougeVertBleu"], ["rt-curve=", "(sans nom)"], ["rt-ptdel=", "Enlever le point"], ["p:Clic sur la courbe : ajo", "Clic sur la courbe : ajouter un point · glisser : le déplace"], ["rt-reset=", "Remettre les réglages à zéro"]]}]}, "video": {"groups": [{"key": "mt-tabs", "label": "Onglets de droite", "items": [["mt-tab=rush", "🎞️ Rush"], ["mt-tab=item", "🎯 Élément"], ["mt-tab=color", "🎨 Couleurs"], ["mt-tab=sound", "🔊 Son"], ["mt-tab=film", "🎞️ Film"]]}, {"key": "mt-transport", "label": "Lecture", "items": [["mt-play=", "▶ Lire"], ["mt-home=", "⏮ Au début"], ["mt-cur=", "Temps (où on en est / durée)"], ["mt-zoom=", "Zoom de la frise"]]}, {"key": "mt-ops", "label": "Outils du montage", "items": [["mt-op=undo", "↶ Annuler (⌘Z)"], ["mt-op=redo", "↷ Rétablir (⇧⌘Z)"], ["mt-op=split", "✂️ Couper ici"], ["mt-op=start", "⟦ Commence ici"], ["mt-op=end", "⟧ Finit ici"], ["mt-op=left", "← Avancer"], ["mt-op=right", "Reculer →"], ["mt-op=detach", "🔊 Détacher le son"], ["mt-op=del", "🗑 Enlever"], ["mt-op=addv1", "➕ Vidéo / photo à la suite"], ["mt-op=addv2", "➕ Incrustation"], ["mt-op=kfprev", "◀ ◆ Aller à l'image clé précédente de l'élément choisi"], ["mt-op=kfnext", "◆ ▶ Aller à l'image clé suivante de l'élément choisi"], ["mt-op=addtext", "➕ Titre / texte"], ["mt-op=adda", "➕ Son / musique"]]}]}, "layout": {"groups": [{"key": "ly-menus", "label": "Menus du haut", "items": [["menu-Fichier", "Menu Fichier"], ["menu-Édition", "Menu Édition"], ["menu-Objet", "Menu Objet"], ["menu-Page", "Menu Page"], ["menu-Affichage", "Menu Affichage"]]}, {"key": "ly-hist", "label": "Annuler / rétablir (en haut)", "items": [["ly-cmd=undo", "↶ Annuler (⌘Z)"], ["ly-cmd=redo", "↷ Rétablir (⇧⌘Z)"]]}, {"key": "ly-tools", "label": "Outils (colonne de gauche)", "items": [["ly-tool=select", "➤ Sélection (V)"], ["ly-tool=text", "T Texte (T)"], ["ly-tool=frame", "⊠ Cadre d’image (F)"], ["ly-tool=rect", "▭ Rectangle (M)"], ["ly-tool=ellipse", "◯ Ellipse (L)"], ["ly-tool=polygon", "⬡ Polygone (Y)"], ["ly-tool=star", "☆ Étoile (E)"], ["ly-tool=line", "╲ Ligne (\\)"], ["ly-tool=pen", "✒︎ Plume (P) : clic = point, double-clic ou Entrée = fini"], ["ly-tool=hand", "✋ Main (H)"], ["ly-tool=zoom", "🔍 Zoom (Z) — Alt pour reculer"], ["ly-target=fill", "⇄⧄ Fond et contour de l’objet choisi : clic = choisir la couleur"]]}, {"key": "ly-tabs", "label": "Onglets du panneau de droite", "items": [["ly-panel=pages", "📄Pages"], ["ly-panel=layers", "🗂Calques"], ["ly-panel=obj", "🔧Objet"], ["ly-panel=text", "🅰Texte"], ["ly-panel=color", "🎨Couleur"], ["ly-panel=links", "🔗Liens"], ["ly-panel=history", "🕘Historique"], ["ly-panel=doc", "⚙️Document"]]}, {"key": "ly-status", "label": "Barre du bas", "items": [["ly-cmd=first", "⏮ Première page"], ["ly-cmd=prev", "‹ Page précédente"], ["page", "Numéro de la page"], ["ly-cmd=next", "› Page suivante"], ["ly-cmd=last", "⏭ Dernière page"], ["ly-zoom=", "Zoom"], ["ly-pos=", "Position du pointeur (mm)"], ["ly-msg=", "Messages"]]}]}};
    const tbDefs = () => { let v = {}; try { v = JSON.parse(localStorage.getItem(TB_DEFS) || '{}'); if (!v || typeof v !== 'object') v = {}; } catch (_) { v = {}; } return {...TB_DEFAULT_DEFS, ...v}; };
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
    ext.fullInit = (dlg, id, byDefault = false) => { const v = fullAll()[id]; if (v === undefined ? byDefault : v) { dlg.classList.add('is-full'); const b = dlg.querySelector(`[data-full-toggle="${CSS.escape(id)}"]`); if (b) b.title = 'Quitter le plein écran'; } };
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
    // espaces de travail : les mêmes « ensembles » que Maintenance → Montage, retouche… (genealogie-toolbar-sets = {éditeur: [{name, date, v}]})
    const WS_KEY = 'genealogie-toolbar-sets';
    const wsList = id => { try { const v = JSON.parse(localStorage.getItem(WS_KEY) || '{}')?.[id]; return Array.isArray(v) ? v.filter(x => x && x.name && x.v) : []; } catch (_) { return []; } };
    const wsSave = (id, list) => { try { const all = JSON.parse(localStorage.getItem(WS_KEY) || '{}') || {}; all[id] = list; localStorage.setItem(WS_KEY, JSON.stringify(all)); } catch (_) { toast('Plus de place pour enregistrer : supprime un espace de travail.', 'error'); } };
    ext.tbButton = id => `<button type="button" class="button small secondary" data-tb-config="${esc(id)}" title="Ranger, montrer ou cacher les boutons et les options">⚙️ Personnaliser</button>`;
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-tb-config]'); if (!b) return;
        e.preventDefault();
        const id = b.dataset.tbConfig, root = b.closest('dialog') || document;
        const groups = [...root.querySelectorAll('[data-tbg]')].filter(g => tbKids(g).length);
        const rows = g => tbKids(g).map(el => `<li class="h-pet-lrow" data-k="${esc(tbKeyOf(el))}"><input type="checkbox" ${el.classList.contains('is-tb-off') ? '' : 'checked'} title="Montrer"><span>${esc(tbLabel(el))}</span><button type="button" class="h-bt" data-up title="Monter">↑</button><button type="button" class="h-bt" data-down title="Descendre">↓</button></li>`).join('');
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-modal h-tbcfg';
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">PERSONNALISER</span><h2>⚙️ Boutons et options</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="h-tbcfg-ws" data-ws><strong>🗂️ Espace de travail</strong><select data-ws-pick aria-label="Espace de travail"><option value="">— la disposition actuelle —</option>${wsList(id).map(x => `<option value="${esc(x.name)}">${esc(x.name)}</option>`).join('')}</select><button type="button" class="button small secondary" data-ws-apply>Appliquer</button><button type="button" class="button small secondary" data-ws-save>＋ Enregistrer comme espace de travail…</button><button type="button" class="button small secondary" data-ws-del>Supprimer</button></div>
            <div class="h-tbcfg-body"><p class="muted">Coche ce qu’on montre, range avec ↑ ↓ (ou en glissant ⠿). Gardé pour la prochaine fois. Comme les espaces de travail de Photoshop : enregistre une disposition sous un nom (« Restauration », « Montage rapide »…) et passe de l’une à l’autre.</p>${groups.map(g => `<section><h4>${esc(g.dataset.tbgLabel || g.dataset.tbg)}</h4><ol class="h-pet-layout" data-g="${esc(g.dataset.tbg)}">${rows(g)}</ol></section>`).join('')}</div>
            <div class="modal-actions"><button type="button" class="button secondary" data-reset>Tout remettre comme au départ</button><span class="spacer"></span><button type="button" class="button secondary" data-x>Annuler</button><button type="button" class="button" data-ok>Enregistrer</button></div>`;
        (b.closest('dialog') || document.body).appendChild(dlg);
        dlg.addEventListener('click', ev => {
            const li = ev.target.closest('li');
            if (ev.target.closest('[data-up]') && li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling);
            if (ev.target.closest('[data-down]') && li.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li);
            if (ev.target.closest('[data-x]')) dlg.close();
            if (ev.target.closest('[data-reset]')) { const all = tbAll(); delete all[id]; try { localStorage.setItem(TB_KEY, JSON.stringify(all)); } catch (_) {} toast('Boutons remis comme au départ (rouvre la fenêtre pour retrouver l’ordre de départ).'); root.querySelectorAll('.is-tb-off').forEach(x => x.classList.remove('is-tb-off')); dlg.close(); }
            const cur = () => { const c = {order: {}, hidden: {}}; dlg.querySelectorAll('[data-g]').forEach(ol => { const lis = [...ol.children]; c.order[ol.dataset.g] = lis.map(l => l.dataset.k); c.hidden[ol.dataset.g] = lis.filter(l => !l.querySelector('input').checked).map(l => l.dataset.k); }); return c; };
            const picked = () => { const n = dlg.querySelector('[data-ws-pick]').value; return n === '' ? null : wsList(id).find(y => y.name === n) || null; }; // par nom : les index se décalent après une suppression
            if (ev.target.closest('[data-ws-apply]')) { const x = picked(); if (!x) return toast('Choisis un espace de travail.'); const all = tbAll(); all[id] = x.v; try { localStorage.setItem(TB_KEY, JSON.stringify(all)); } catch (_) {} ext.tbApply(root, id); toast(`Espace de travail « ${x.name} » appliqué.`); dlg.close(); return; }
            if (ev.target.closest('[data-ws-del]')) { const x = picked(); if (!x || !confirm(`Supprimer l’espace de travail « ${x.name} » ?`)) return; wsSave(id, wsList(id).filter(y => y.name !== x.name)); const sel = dlg.querySelector('[data-ws-pick]'); sel.selectedOptions[0]?.remove(); sel.value = ''; toast('Supprimé.'); return; }
            if (ev.target.closest('[data-ws-save]')) { (async () => { const name = String((await A().askText?.({title: 'Espace de travail', message: 'Nom de cet espace de travail (boutons montrés et leur ordre) :', value: '', okLabel: 'Enregistrer'})) ?? '').trim().slice(0, 60); if (!name) return;
                const list = wsList(id).filter(y => y.name !== name); list.push({name, date: new Date().toLocaleDateString('fr-FR'), v: cur()}); wsSave(id, list.slice(-60));
                const all = tbAll(); all[id] = cur(); try { localStorage.setItem(TB_KEY, JSON.stringify(all)); } catch (_) {} ext.tbApply(root, id); toast(`Espace de travail « ${name} » enregistré (aussi dans Maintenance → Montage, retouche, mise en page et son).`); dlg.close(); })(); return; }
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
        ['shadows', 'Ombres', -100, 100], ['highlights', 'Hautes lumières', -100, 100], ['saturation', 'Saturation', -100, 100], ['vibrance', 'Vibrance (couleurs ternes d’abord)', -100, 100], ['warmth', 'Chaleur', -100, 100],
        ['hue', 'Teinte (tourner les couleurs)', -180, 180],
    ];
    /** Niveaux (comme Photoshop) : point noir et point blanc d'entrée, gamma (tons moyens, ×100), sortie */
    const RT_LEVELS = [['lvl_in_b', 'Noir d’entrée', 0, 250, 0], ['lvl_gamma', 'Tons moyens (gamma ×100)', 10, 300, 100], ['lvl_in_w', 'Blanc d’entrée', 5, 255, 255], ['lvl_out_b', 'Noir de sortie', 0, 250, 0], ['lvl_out_w', 'Blanc de sortie', 5, 255, 255]];
    /** Colorisation douce d'une photo ancienne (dégradé selon la luminosité, ou selon la hauteur : ciel en haut, terre en bas) */
    const RT_GMAPS = {'': ['Aucune'], sepia: ['Sépia chaud', ['#2a1a10', '#9c6b43', '#f4e2c4']], autochrome: ['Autochrome (couleurs d’autrefois)', ['#1f2a33', '#a8805f', '#efe2c0']],
        portrait: ['Portrait (peau rosée)', ['#2b1a17', '#c98f78', '#fbe9dc']], cyan: ['Cyanotype', ['#0d2240', '#3f78a8', '#e6f0f7']], sky: ['Paysage : ciel en haut, terre en bas', ['#5d8bbf', '#7d8f55', '#6b5338']]};
    const RT_CHANNELS = [['rgb', 'RVB'], ['r', 'Rouge'], ['g', 'Vert'], ['b', 'Bleu']];
    const rtDefault = () => ({exposure: 0, brightness: 0, contrast: 0, shadows: 0, highlights: 0, saturation: 0, vibrance: 0, warmth: 0, hue: 0, lvl_in_b: 0, lvl_gamma: 100, lvl_in_w: 255, lvl_out_b: 0, lvl_out_w: 255,
        gmap: '', gmap_amt: 70, bw: false, sepia: false, invert: false, filters: {}, crop: null, persp: null,
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
        const ib = st.lvl_in_b ?? 0, iw = Math.max(ib + 1, st.lvl_in_w ?? 255), gm = (st.lvl_gamma ?? 100) / 100, ob = st.lvl_out_b ?? 0, ow = st.lvl_out_w ?? 255, lv = ib !== 0 || iw !== 255 || gm !== 1 || ob !== 0 || ow !== 255;
        for (let i = 0; i < 256; i++) {
            let v = st.invert ? 255 - i : i;
            if (lv) v = ob + Math.pow(Math.min(1, Math.max(0, (v - ib) / (iw - ib))), 1 / gm) * (ow - ob);
            v = v * exp + st.brightness * 1.2;
            v = c * (v - 128) + 128;
            if (v < 128) v += st.shadows * 0.6 * Math.pow(1 - Math.max(0, v) / 128, 2);
            else v += st.highlights * 0.6 * Math.pow((Math.min(255, v) - 128) / 127, 2);
            base[i] = clamp255(v);
        }
        const master = curveLut(st.curves.rgb);
        return ['r', 'g', 'b'].map(ch => { const own = curveLut(st.curves[ch]), lut = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) lut[i] = own[Math.round(clamp255(master[Math.round(base[i])]))]; return lut; });
    }
    const hex3 = h => [1, 3, 5].map(k => parseInt(String(h).slice(k, k + 2), 16) || 0);
    function rtApply(src, dst, st) {
        if (st.filters?.dust > 0 && src === dst) rtDust(src, st.filters.dust); // poussière et rayures : avant tout le reste, sur l'image elle-même
        else if (st.filters?.dust > 0) { src = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height); rtDust(src, st.filters.dust); }
        const [lr, lg, lb] = rtLuts(st), sat = 1 + st.saturation / 100, warm = st.warmth * 0.35, vib = (st.vibrance || 0) / 100, hue = (st.hue || 0) * Math.PI / 180;
        const hc = Math.cos(hue), hs = Math.sin(hue), gm = st.gmap && RT_GMAPS[st.gmap]?.[1] ? RT_GMAPS[st.gmap][1].map(hex3) : null, gk = (st.gmap_amt ?? 70) / 100, W = src.width, H = src.height;
        const a = src.data, o = dst.data, plain = sat === 1 && !warm && !st.bw && !st.sepia && !vib && !hue && !gm;
        for (let i = 0; i < a.length; i += 4) {
            let r = lr[a[i]], g = lg[a[i + 1]], b = lb[a[i + 2]];
            if (!plain) {
                if (sat !== 1) { const y = 0.299 * r + 0.587 * g + 0.114 * b; r = y + (r - y) * sat; g = y + (g - y) * sat; b = y + (b - y) * sat; }
                if (vib) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), s0 = mx ? (mx - mn) / mx : 0, k = 1 + vib * (1 - s0) * (vib > 0 ? 1 : 0.8), y = 0.299 * r + 0.587 * g + 0.114 * b; r = y + (r - y) * k; g = y + (g - y) * k; b = y + (b - y) * k; }
                if (hue) { // rotation de teinte (espace YIQ) : la luminosité ne bouge pas
                    const y = 0.299 * r + 0.587 * g + 0.114 * b, ii = 0.596 * r - 0.274 * g - 0.322 * b, q = 0.211 * r - 0.523 * g + 0.312 * b, i2 = ii * hc - q * hs, q2 = ii * hs + q * hc;
                    r = y + 0.956 * i2 + 0.621 * q2; g = y - 0.272 * i2 - 0.647 * q2; b = y - 1.106 * i2 + 1.703 * q2; }
                if (warm) { r += warm; b -= warm; }
                if (st.bw || st.sepia) { const y = 0.299 * r + 0.587 * g + 0.114 * b; if (st.sepia) { r = y * 1.07 + 18; g = y * 0.92 + 8; b = y * 0.72; } else { r = g = b = y; } }
                if (gm) { // colorisation : une couleur prise dans le dégradé, qui garde la luminosité du point
                    const y = 0.299 * r + 0.587 * g + 0.114 * b; let t, c0, c1;
                    if (st.gmap === 'sky') { const row = Math.floor(i / 4 / W) / H; t = Math.min(1, Math.max(0, (row - 0.25) / 0.5)); if (t < 0.5) { c0 = gm[0]; c1 = gm[1]; t *= 2; } else { c0 = gm[1]; c1 = gm[2]; t = t * 2 - 1; } }
                    else { t = y / 255; if (t < 0.5) { c0 = gm[0]; c1 = gm[1]; t *= 2; } else { c0 = gm[1]; c1 = gm[2]; t = t * 2 - 1; } }
                    let cr = c0[0] + (c1[0] - c0[0]) * t, cg = c0[1] + (c1[1] - c0[1]) * t, cb = c0[2] + (c1[2] - c0[2]) * t;
                    const cy = 0.299 * cr + 0.587 * cg + 0.114 * cb || 1, f = y / cy; cr *= f; cg *= f; cb *= f; // même luminosité
                    r += (cr - r) * gk; g += (cg - g) * gk; b += (cb - b) * gk;
                }
            }
            o[i] = r; o[i + 1] = g; o[i + 2] = b; o[i + 3] = a[i + 3];
        }
        if (st.filters && Object.entries(st.filters).some(([k, v]) => v && k !== 'dust')) rtFilters(dst, st.filters);
        return dst;
    }
    /** Poussière et rayures : un point (ou un trait fin) très différent de son voisinage est remplacé par la médiane du voisinage.
        Plus l'effet est fort, plus le voisinage est grand et plus le seuil est bas. */
    function rtDust(img, amount) {
        // rapide : on compare chaque point à son voisinage flouté (le flou du navigateur), puis on remplace les points abîmés
        // par la moyenne de leurs voisins sains (un flou qui ignore les points abîmés : ils sont rendus transparents)
        const W = img.width, H = img.height, d = img.data, r = Math.max(1, Math.round(W / 1600 * (1 + amount / 25))), thr = 70 - amount * 0.55;
        const src = document.createElement('canvas'); src.width = W; src.height = H; src.getContext('2d').putImageData(img, 0, 0);
        const blur = (c, rad) => { const o = document.createElement('canvas'); o.width = W; o.height = H; const g = o.getContext('2d', {willReadFrequently: true}); g.filter = `blur(${rad}px)`; g.drawImage(c, 0, 0); return g.getImageData(0, 0, W, H).data; };
        const B = blur(src, r * 1.5), bad = new Uint8Array(W * H); let nbad = 0;
        for (let p = 0, i = 0; p < bad.length; p++, i += 4) { const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2], bl = 0.299 * B[i] + 0.587 * B[i + 1] + 0.114 * B[i + 2]; if (Math.abs(l - bl) > thr) { bad[p] = 1; nbad++; } }
        if (!nbad) return img;
        // les points abîmés et leur bord immédiat deviennent transparents, puis flou : la couleur des voisins sains
        const hole = new ImageData(new Uint8ClampedArray(d), W, H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x; if (!bad[p]) continue; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) hole.data[(yy * W + xx) * 4 + 3] = 0; } }
        const hc = document.createElement('canvas'); hc.width = W; hc.height = H; hc.getContext('2d').putImageData(hole, 0, 0);
        const F = blur(hc, r + 1.5);
        for (let p = 0, i = 0; p < bad.length; p++, i += 4) { if (!bad[p]) continue; if (F[i + 3] > 8) { d[i] = F[i]; d[i + 1] = F[i + 1]; d[i + 2] = F[i + 2]; } else { d[i] = B[i]; d[i + 1] = B[i + 1]; d[i + 2] = B[i + 2]; } }
        return img;
    }
    /** 🎯 Sélectionner le sujet : le fond est appris sur les bords de l'image (couleurs les plus fréquentes), puis rempli depuis
        les bords tant que la couleur lui ressemble ; ce qui reste au milieu est le sujet (trous bouchés, petits morceaux enlevés).
        Marche bien sur un fond uni ou simple (studio, mur, ciel) ; à retoucher au besoin avec ⇧ / ⌥ et les autres outils. */
    function rtSubject(src, W0, H0, tol = 24) {
        const k = Math.min(1, 420 / Math.max(W0, H0)), W = Math.max(8, Math.round(W0 * k)), H = Math.max(8, Math.round(H0 * k));
        const sc = document.createElement('canvas'); sc.width = W; sc.height = H; const sg = sc.getContext('2d', {willReadFrequently: true}); sg.filter = 'blur(1px)'; sg.drawImage(src, 0, 0, W, H);
        const d = sg.getImageData(0, 0, W, H).data, N = W * H, band = Math.max(2, Math.round(Math.min(W, H) * 0.03));
        const border = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < band || y < band || x >= W - band || y >= H - band) border.push(y * W + x);
        // quelques couleurs de fond (k-moyennes sur les bords)
        let cents = Array.from({length: 6}, (_, c) => { const p = border[Math.floor(border.length * (c + 0.5) / 6)] * 4; return [d[p], d[p + 1], d[p + 2]]; });
        for (let it = 0; it < 8; it++) { const acc = cents.map(() => [0, 0, 0, 0]);
            for (const p of border) { const i = p * 4; let best = 0, bd = 1e9; cents.forEach((c, j) => { const dd = (d[i] - c[0]) ** 2 + (d[i + 1] - c[1]) ** 2 + (d[i + 2] - c[2]) ** 2; if (dd < bd) { bd = dd; best = j; } }); const a = acc[best]; a[0] += d[i]; a[1] += d[i + 1]; a[2] += d[i + 2]; a[3]++; }
            cents = cents.map((c, j) => acc[j][3] ? [acc[j][0] / acc[j][3], acc[j][1] / acc[j][3], acc[j][2] / acc[j][3]] : c); }
        const dist = new Float32Array(N); for (let p = 0; p < N; p++) { const i = p * 4; let bd = 1e9; for (const c of cents) { const dd = (d[i] - c[0]) ** 2 + (d[i + 1] - c[1]) ** 2 + (d[i + 2] - c[2]) ** 2; if (dd < bd) bd = dd; } dist[p] = Math.sqrt(bd); }
        const bd2 = border.map(p => dist[p]).sort((a, b) => a - b), T = Math.max(14, bd2[Math.floor(bd2.length * 0.85)] * 1.5) + tol * 0.8;
        // le fond : rempli depuis les bords (et pas d'un bond : il faut aussi que le voisin ressemble)
        const bg = new Uint8Array(N), stack = [];
        for (const p of border) if (dist[p] < T) { bg[p] = 1; stack.push(p); }
        while (stack.length) { const p = stack.pop(), x = p % W; for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) { if (q < 0 || q >= N || bg[q]) continue; const i = p * 4, j = q * 4;
            const step = Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]); if (dist[q] < T && step < 40 + tol) { bg[q] = 1; stack.push(q); } } }
        // le sujet : les morceaux qui ne sont pas du fond ; on garde les gros (au moins 8 % du plus gros)
        const lab = new Int32Array(N), sizes = [0]; let n = 0;
        for (let p0 = 0; p0 < N; p0++) { if (bg[p0] || lab[p0]) continue; n++; let sz = 0; const st2 = [p0]; lab[p0] = n; while (st2.length) { const p = st2.pop(), x = p % W; sz++; for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) if (q >= 0 && q < N && !bg[q] && !lab[q]) { lab[q] = n; st2.push(q); } } sizes.push(sz); }
        let big = 0; for (const z of sizes) if (z > big) big = z; const keep = sizes.map(z => z >= big * 0.08 && z > 12);
        const mc = document.createElement('canvas'); mc.width = W; mc.height = H; const mg = mc.getContext('2d'), md = mg.createImageData(W, H);
        for (let p = 0; p < N; p++) if (!bg[p] && keep[lab[p]]) md.data[p * 4 + 3] = 255;
        mg.putImageData(md, 0, 0);
        // à la taille de l'aperçu, bord adouci puis net
        const out = document.createElement('canvas'); out.width = W0; out.height = H0; const og = out.getContext('2d', {willReadFrequently: true}); og.filter = `blur(${Math.max(1, W0 / W * 0.8)}px)`; og.drawImage(mc, 0, 0, W0, H0);
        const od = og.getImageData(0, 0, W0, H0); for (let i = 3; i < od.data.length; i += 4) { const a = od.data[i]; od.data[i] = a < 90 ? 0 : a > 165 ? 255 : (a - 90) * 3.4; } og.filter = 'none'; og.putImageData(od, 0, 0);
        return {mask: out, found: big > 0};
    }
    /** Redresser tout seul : l'angle des grandes lignes (horizon, cadres, murs) le plus fréquent, entre −20° et +20° */
    function rtAutoAngle(img) {
        const k = Math.min(1, 700 / Math.max(img.width, img.height)), W = Math.round(img.width * k), H = Math.round(img.height * k);
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', {willReadFrequently: true}); const t = document.createElement('canvas'); t.width = img.width; t.height = img.height; t.getContext('2d').putImageData(img, 0, 0); g.drawImage(t, 0, 0, W, H);
        const d = g.getImageData(0, 0, W, H).data, L = new Float32Array(W * H); for (let p = 0; p < L.length; p++) L[p] = 0.299 * d[p * 4] + 0.587 * d[p * 4 + 1] + 0.114 * d[p * 4 + 2];
        const bins = new Float32Array(81); // de −20° à +20°, par demi-degré
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
            const p = y * W + x, gx = L[p - W + 1] + 2 * L[p + 1] + L[p + W + 1] - L[p - W - 1] - 2 * L[p - 1] - L[p + W - 1], gy = L[p + W - 1] + 2 * L[p + W] + L[p + W + 1] - L[p - W - 1] - 2 * L[p - W] - L[p - W + 1], m = Math.hypot(gx, gy);
            if (m < 60) continue;
            let a = Math.atan2(gy, gx) * 180 / Math.PI; // direction du gradient → celle de la ligne : 90° de plus ; on ramène près de l'horizontale ou de la verticale
            a = ((a % 90) + 90) % 90; if (a > 45) a -= 90; // écart à l'axe le plus proche
            if (Math.abs(a) > 20) continue; bins[Math.round((a + 20) * 2)] += m;
        }
        let best = 40; for (let i = 0; i < bins.length; i++) { const v = (bins[i - 1] || 0) + bins[i] * 2 + (bins[i + 1] || 0); if (v > (bins[best - 1] || 0) + bins[best] * 2 + (bins[best + 1] || 0)) best = i; }
        return Math.round((best / 2 - 20) * 2) / 2;
    }
    /** Perspective : l'image vue à travers 4 coins (relatifs, dans l'ordre haut-gauche, haut-droit, bas-droit, bas-gauche) remise à plat */
    function rtHomography(q, W, H) { // carré unité → quadrilatère (en pixels)
        const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q.map(([x, y]) => [x * W, y * H]);
        const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3, den = dx1 * dy2 - dx2 * dy1 || 1e-9;
        const g = (dx3 * dy2 - dx2 * dy3) / den, h = (dx1 * dy3 - dx3 * dy1) / den;
        return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h];
    }
    function rtWarp(src, q) {
        const W = src.width, H = src.height, s = src.data, out = new ImageData(W, H), o = out.data, [a, b, c, d, e, f, g, h] = rtHomography(q, W, H);
        for (let y = 0; y < H; y++) { const v = (y + 0.5) / H; for (let x = 0; x < W; x++) {
            const u = (x + 0.5) / W, w = g * u + h * v + 1, sx = (a * u + b * v + c) / w - 0.5, sy = (d * u + e * v + f) / w - 0.5, i = (y * W + x) * 4;
            const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
            if (x0 < -1 || y0 < -1 || x0 >= W || y0 >= H) continue;
            for (let ch = 0; ch < 4; ch++) { const px = (xx, yy) => s[((Math.min(H - 1, Math.max(0, yy))) * W + Math.min(W - 1, Math.max(0, xx))) * 4 + ch];
                o[i + ch] = (px(x0, y0) * (1 - fx) + px(x0 + 1, y0) * fx) * (1 - fy) + (px(x0, y0 + 1) * (1 - fx) + px(x0 + 1, y0 + 1) * fx) * fy; } } }
        return out;
    }
    /* ── Filtres (après les réglages) : flou, réduire le bruit, netteté, grain, vignette ; les rayons suivent la largeur de l'image
       (même effet sur l'aperçu et sur l'image en pleine taille) ── */
    const RT_FILTERS = [['deglare', 'Reflets en moins (vitre, verre, vernis)', 0, 100], ['deglareSize', 'Taille des reflets (0 = moyenne)', 0, 100], ['dust', 'Poussière et rayures (automatique)', 0, 100], ['blur', 'Flou', 0, 100], ['denoise', 'Réduire le bruit', 0, 100], ['sharpen', 'Netteté', 0, 100], ['clarity', 'Clarté (contraste local)', -100, 100], ['grain', 'Grain', 0, 100], ['vignette', 'Vignette', -100, 100]];
    function rtBlurred(img, r) {
        const W = img.width, H = img.height, a = document.createElement('canvas'), b = document.createElement('canvas'); a.width = b.width = W; a.height = b.height = H;
        a.getContext('2d').putImageData(img, 0, 0); const g = b.getContext('2d', {willReadFrequently: true}); g.filter = `blur(${Math.max(0.3, r)}px)`; g.drawImage(a, 0, 0); return g.getImageData(0, 0, W, H).data;
    }
    /** Reflets : une vitre ajoute un voile clair et peu coloré, qui varie lentement. On le mesure (le plus sombre de chaque
        voisinage, adouci), puis on le retire en rendant le contraste perdu. f.deglare : combien on en retire ; f.deglareSize : taille. */
    function rtDeglare(img, amount, sizeV) {
        const W = img.width, H = img.height, d = img.data, k = Math.min(1, 320 / Math.max(W, H)), w = Math.max(4, Math.round(W * k)), h = Math.max(4, Math.round(H * k));
        const sc = document.createElement('canvas'); sc.width = W; sc.height = H; sc.getContext('2d').putImageData(img, 0, 0);
        const sm = document.createElement('canvas'); sm.width = w; sm.height = h; const sg = sm.getContext('2d', {willReadFrequently: true}); sg.drawImage(sc, 0, 0, w, h);
        const sd = sg.getImageData(0, 0, w, h).data, m = new Float32Array(w * h);
        for (let p = 0; p < m.length; p++) m[p] = Math.min(sd[p * 4], sd[p * 4 + 1], sd[p * 4 + 2]);
        const r = Math.max(1, Math.round(Math.max(w, h) * (0.008 + (sizeV || 50) / 100 * 0.06))), tmp = new Float32Array(m.length), er = new Float32Array(m.length);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 255; for (let i = Math.max(0, x - r); i <= Math.min(w - 1, x + r); i++) v = Math.min(v, m[y * w + i]); tmp[y * w + x] = v; }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 255; for (let j = Math.max(0, y - r); j <= Math.min(h - 1, y + r); j++) v = Math.min(v, tmp[j * w + x]); er[y * w + x] = v; }
        const sorted = Array.from(er).sort((a, b) => a - b), floor = sorted[Math.floor(sorted.length * 0.03)]; // le vrai noir de l'image : pas un reflet
        const vc = document.createElement('canvas'); vc.width = w; vc.height = h; const vg = vc.getContext('2d'), vi = vg.createImageData(w, h);
        for (let p = 0; p < er.length; p++) { const v = Math.max(0, er[p] - floor); vi.data[p * 4] = vi.data[p * 4 + 1] = vi.data[p * 4 + 2] = v; vi.data[p * 4 + 3] = 255; }
        vg.putImageData(vi, 0, 0);
        const big = document.createElement('canvas'); big.width = W; big.height = H; const bg = big.getContext('2d', {willReadFrequently: true}); bg.filter = `blur(${Math.max(1, r * W / w * 0.7)}px)`; bg.imageSmoothingQuality = 'high'; bg.drawImage(vc, 0, 0, W, H);
        const V = bg.getImageData(0, 0, W, H).data, a = Math.min(0.97, amount / 100);
        for (let i = 0; i < d.length; i += 4) { const v = V[i] * a; if (v < 0.5) continue; const g = 255 / Math.max(30, 255 - v); for (let c = 0; c < 3; c++) d[i + c] = clamp255((d[i + c] - v) * g); }
        return img;
    }
    /* ═══ Menu Filtre (comme Photoshop) : chaque filtre est une étape {t, …réglages} d'une liste (filters.chain), posée dans un
       calque de réglage : non destructif, réglable ensuite, dosable (opacité), limitable (masque). Les tailles suivent la largeur
       de l'image (s = largeur / 1000) : le même effet sur l'aperçu et sur l'image enregistrée en pleine taille. ═══ */
    const fxRng = seed => { let x = (seed >>> 0) || 1; return () => (x = (x * 16807) % 2147483647) / 2147483647; };
    const fxCanvas = img => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').putImageData(img, 0, 0); return c; };
    const fxBack = (img, c) => img.data.set(c.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, img.width, img.height).data);
    const fxLum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    /** déplacer les points : (x, y) de l'image finale ← fn(x, y) dans l'image de départ (lissé) */
    function fxDisplace(img, fn) {
        const W = img.width, H = img.height, src = new Uint8ClampedArray(img.data), o = img.data;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const r = fn(x, y); if (!r) continue; let [sx, sy] = r; sx = Math.max(0, Math.min(W - 1.001, sx)); sy = Math.max(0, Math.min(H - 1.001, sy));
            const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0, i = (y * W + x) * 4, a = (y0 * W + x0) * 4, b = a + 4, c = a + W * 4, d = c + 4;
            for (let k = 0; k < 4; k++) o[i + k] = (src[a + k] * (1 - fx) + src[b + k] * fx) * (1 - fy) + (src[c + k] * (1 - fx) + src[d + k] * fx) * fy;
        }
    }
    /** moyenne de copies déplacées (flous de mouvement, radial, rotatif) */
    function fxAccum(img, n, place) { const c0 = fxCanvas(img), c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d', {willReadFrequently: true}); g.drawImage(c0, 0, 0); for (let k = 0; k < n; k++) { g.save(); g.globalAlpha = 1 / (k + 2); place(g, k / Math.max(1, n - 1)); g.drawImage(c0, 0, 0); g.restore(); } fxBack(img, c); }
    function fxSobel(L, W, H) { const m = new Float32Array(W * H); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const p = y * W + x, gx = L[p - W + 1] + 2 * L[p + 1] + L[p + W + 1] - L[p - W - 1] - 2 * L[p - 1] - L[p + W - 1], gy = L[p + W - 1] + 2 * L[p + W] + L[p + W + 1] - L[p - W - 1] - 2 * L[p - W] - L[p - W + 1]; m[p] = Math.hypot(gx, gy); } return m; }
    const fxLumArr = img => { const L = new Float32Array(img.width * img.height); for (let p = 0; p < L.length; p++) L[p] = fxLum(img.data, p * 4); return L; };
    /** Kuwahara : chaque point prend la couleur moyenne du coin le plus uni autour de lui (effet peinture), rapide grâce aux sommes cumulées */
    function fxKuwahara(img, r) {
        // par bandes (sommes cumulées d'une bande à la fois) : rapide et peu de mémoire, même sur une grande photo
        const W = img.width, H = img.height, d = img.data, out = new Uint8ClampedArray(d), BAND = 256, W1 = W + 1;
        for (let top = 0; top < H; top += BAND) {
            const y0b = Math.max(0, top - r), y1b = Math.min(H - 1, top + BAND - 1 + r), h = y1b - y0b + 1, S = W1 * (h + 1);
            const IR = new Float64Array(S), IG = new Float64Array(S), IB = new Float64Array(S), IL = new Float64Array(S);
            for (let yy = 0; yy < h; yy++) { const y = y0b + yy; for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, rr = d[i], gg = d[i + 1], bb = d[i + 2], l = 0.299 * rr + 0.587 * gg + 0.114 * bb, q = (yy + 1) * W1 + x + 1, up = q - W1;
                IR[q] = rr + IR[q - 1] + IR[up] - IR[up - 1]; IG[q] = gg + IG[q - 1] + IG[up] - IG[up - 1]; IB[q] = bb + IB[q - 1] + IB[up] - IB[up - 1]; IL[q] = l * l + IL[q - 1] + IL[up] - IL[up - 1]; } }
            const yEnd = Math.min(H, top + BAND);
            for (let y = top; y < yEnd; y++) for (let x = 0; x < W; x++) {
                let best = Infinity, br = 0, bg = 0, bb = 0;
                for (let k = 0; k < 4; k++) {
                    const ax = k & 1 ? 1 : -1, ay = k & 2 ? 1 : -1;
                    const x0 = ax < 0 ? Math.max(0, x - r) : x, x1 = ax < 0 ? x : Math.min(W - 1, x + r), ya = (ay < 0 ? Math.max(0, y - r) : y) - y0b, yb = (ay < 0 ? y : Math.min(H - 1, y + r)) - y0b, n = (x1 - x0 + 1) * (yb - ya + 1);
                    const A = (yb + 1) * W1 + x1 + 1, Bq = ya * W1 + x1 + 1, C = (yb + 1) * W1 + x0, Dq = ya * W1 + x0;
                    const r0 = (IR[A] - IR[Bq] - IR[C] + IR[Dq]) / n, g0 = (IG[A] - IG[Bq] - IG[C] + IG[Dq]) / n, b0 = (IB[A] - IB[Bq] - IB[C] + IB[Dq]) / n, l = 0.299 * r0 + 0.587 * g0 + 0.114 * b0, v = (IL[A] - IL[Bq] - IL[C] + IL[Dq]) / n - l * l;
                    if (v < best) { best = v; br = r0; bg = g0; bb = b0; }
                }
                const i = (y * W + x) * 4; out[i] = br; out[i + 1] = bg; out[i + 2] = bb;
            }
        }
        d.set(out);
    }
    function fxMinMax(img, r, isMax) { const W = img.width, H = img.height, d = img.data, t = new Uint8ClampedArray(d); const pass = (src, dst, horiz) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; for (let c = 0; c < 3; c++) { let v = isMax ? 0 : 255; for (let k = -r; k <= r; k++) { const xx = horiz ? Math.min(W - 1, Math.max(0, x + k)) : x, yy = horiz ? y : Math.min(H - 1, Math.max(0, y + k)); const u = src[(yy * W + xx) * 4 + c]; v = isMax ? Math.max(v, u) : Math.min(v, u); } dst[i + c] = v; } } }; pass(d, t, true); pass(t, d, false); }
    function fxNoise2(seed) { const R = fxRng(seed), N = 256, perm = Array.from({length: N}, (_, i) => i).sort(() => R() - 0.5), val = Array.from({length: N}, R); const h = (x, y) => val[perm[(perm[x & 255] + y) & 255]]; const sm = t => t * t * (3 - 2 * t);
        return (x, y) => { const x0 = Math.floor(x), y0 = Math.floor(y), fx = sm(x - x0), fy = sm(y - y0); return (h(x0, y0) * (1 - fx) + h(x0 + 1, y0) * fx) * (1 - fy) + (h(x0, y0 + 1) * (1 - fx) + h(x0 + 1, y0 + 1) * fx) * fy; }; }
    // [catégorie, nom, réglages [clé, libellé, min, max, départ, pas?], fonction(img, p, s)]
    const RT_FX = {
        gauss: ['Flou', 'Flou gaussien', [['r', 'Rayon', 0, 100, 8, 0.5]], (img, p, s) => { const b = rtBlurred(img, p.r * s); img.data.set(b); }],
        motion: ['Flou', 'Flou de mouvement', [['angle', 'Angle (°)', -180, 180, 0, 1], ['dist', 'Distance', 1, 300, 40, 1]], (img, p, s) => { const a = p.angle * Math.PI / 180, D = p.dist * s, n = Math.max(4, Math.min(48, Math.round(D / 2))); fxAccum(img, n, (g, u) => g.translate(Math.cos(a) * D * (u - 0.5), Math.sin(a) * D * (u - 0.5))); }],
        radial: ['Flou', 'Flou radial (zoom)', [['amount', 'Force', 1, 100, 25, 1], ['cx', 'Centre X (%)', 0, 100, 50, 1], ['cy', 'Centre Y (%)', 0, 100, 50, 1]], (img, p) => { const cx = p.cx / 100 * img.width, cy = p.cy / 100 * img.height; fxAccum(img, 32, (g, u) => { const k = 1 + u * p.amount / 250; g.translate(cx, cy); g.scale(k, k); g.translate(-cx, -cy); }); }],
        spin: ['Flou', 'Flou rotatif', [['angle', 'Angle (°)', 1, 60, 8, 0.5], ['cx', 'Centre X (%)', 0, 100, 50, 1], ['cy', 'Centre Y (%)', 0, 100, 50, 1]], (img, p) => { const cx = p.cx / 100 * img.width, cy = p.cy / 100 * img.height; fxAccum(img, 36, (g, u) => { g.translate(cx, cy); g.rotate((u - 0.5) * p.angle * Math.PI / 180); g.translate(-cx, -cy); }); }],
        surface: ['Flou', 'Flou de surface (garde les contours)', [['r', 'Rayon', 1, 60, 8, 0.5], ['thr', 'Seuil', 1, 100, 25, 1]], (img, p, s) => { const d = img.data, b = rtBlurred(img, p.r * s); for (let i = 0; i < d.length; i += 4) { const df = (Math.abs(d[i] - b[i]) + Math.abs(d[i + 1] - b[i + 1]) + Math.abs(d[i + 2] - b[i + 2])) / 3, w = Math.max(0, 1 - df / (p.thr * 1.2)); for (let c = 0; c < 3; c++) d[i + c] += (b[i + c] - d[i + c]) * w; } }],
        tilt: ['Flou', 'Décentrement (maquette, tilt-shift)', [['pos', 'Bande nette, hauteur (%)', 0, 100, 55, 1], ['band', 'Largeur de la bande (%)', 2, 90, 22, 1], ['r', 'Flou', 1, 80, 18, 0.5]], (img, p, s) => { const W = img.width, H = img.height, d = img.data, b = rtBlurred(img, p.r * s); for (let y = 0; y < H; y++) { const t = Math.max(0, Math.min(1, (Math.abs(y / H - p.pos / 100) - p.band / 200) / Math.max(0.01, p.band / 200))); if (!t) continue; for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; for (let c = 0; c < 3; c++) d[i + c] += (b[i + c] - d[i + c]) * t; } } }],
        bokeh: ['Flou', 'Flou de l’objectif (bokeh)', [['r', 'Rayon', 1, 60, 12, 0.5], ['bright', 'Points lumineux', 0, 100, 50, 1]], (img, p, s) => { const d = img.data, hi = new ImageData(new Uint8ClampedArray(d), img.width, img.height), th = 235 - p.bright; for (let i = 0; i < hi.data.length; i += 4) { if (fxLum(hi.data, i) < th) { hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = 0; } } const b = rtBlurred(img, p.r * s), h2 = rtBlurred(hi, p.r * s * 0.8), k = p.bright / 40; for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = clamp255(255 - (255 - b[i + c]) * (255 - h2[i + c] * k) / 255); }],
        noise: ['Bruit', 'Ajouter du bruit', [['amount', 'Quantité', 0, 100, 18, 1], ['mono', 'Monochrome (0 / 1)', 0, 1, 1, 1]], (img, p) => { const d = img.data, R = fxRng(777), a = p.amount * 2.2; for (let i = 0; i < d.length; i += 4) { if (p.mono) { const n = (R() - 0.5) * a; d[i] = clamp255(d[i] + n); d[i + 1] = clamp255(d[i + 1] + n); d[i + 2] = clamp255(d[i + 2] + n); } else for (let c = 0; c < 3; c++) d[i + c] = clamp255(d[i + c] + (R() - 0.5) * a); } }],
        median: ['Bruit', 'Médiane', [['r', 'Rayon', 1, 4, 1, 1]], (img, p) => { const W = img.width, H = img.height, d = img.data, src = new Uint8ClampedArray(d), r = p.r, st = r > 2 ? 2 : 1, win = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; for (let c = 0; c < 3; c++) { win.length = 0; for (let dy = -r; dy <= r; dy += st) for (let dx = -r; dx <= r; dx += st) win.push(src[(Math.min(H - 1, Math.max(0, y + dy)) * W + Math.min(W - 1, Math.max(0, x + dx))) * 4 + c]); win.sort((a, b) => a - b); d[i + c] = win[win.length >> 1]; } } }],
        dust: ['Bruit', 'Poussière et rayures', [['amount', 'Force', 1, 100, 50, 1]], (img, p) => rtDust(img, p.amount)],
        denoise2: ['Bruit', 'Réduire le bruit', [['amount', 'Force', 1, 100, 50, 1]], (img, p, s) => { rtFilters(img, {denoise: p.amount}); void s; }],
        unsharp: ['Netteté', 'Accentuation (masque flou)', [['amount', 'Gain (%)', 0, 400, 100, 1], ['r', 'Rayon', 0.2, 30, 2, 0.1], ['thr', 'Seuil', 0, 80, 0, 1]], (img, p, s) => { const d = img.data, b = rtBlurred(img, Math.max(0.3, p.r * s)); for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) { const df = d[i + c] - b[i + c]; if (Math.abs(df) > p.thr) d[i + c] = clamp255(d[i + c] + df * p.amount / 100); } }],
        highpass: ['Netteté', 'Passe-haut (pour accentuer en Incrustation)', [['r', 'Rayon', 0.5, 100, 8, 0.5]], (img, p, s) => { const d = img.data, b = rtBlurred(img, p.r * s); for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = clamp255(128 + d[i + c] - b[i + c]); }],
        emboss: ['Esthétiques', 'Estampage (relief)', [['angle', 'Angle (°)', -180, 180, 135, 1], ['h', 'Hauteur', 1, 10, 2, 1], ['amount', 'Force (%)', 1, 400, 120, 1], ['color', 'Garder les couleurs (0 / 1)', 0, 1, 0, 1]], (img, p, s) => { const W = img.width, H = img.height, d = img.data, L = fxLumArr(img), a = p.angle * Math.PI / 180, ox = Math.round(Math.cos(a) * p.h * Math.max(1, s)), oy = Math.round(Math.sin(a) * p.h * Math.max(1, s)); const at = (x, y) => L[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))]; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = (at(x + ox, y + oy) - at(x - ox, y - oy)) * p.amount / 100, i = (y * W + x) * 4; if (p.color) for (let c = 0; c < 3; c++) d[i + c] = clamp255(d[i + c] + v); else d[i] = d[i + 1] = d[i + 2] = clamp255(128 + v); } }],
        edges: ['Esthétiques', 'Tracé des contours', [['amount', 'Force', 10, 300, 100, 1]], (img, p) => { const W = img.width, H = img.height, d = img.data, ch = [0, 1, 2].map(c => { const a = new Float32Array(W * H); for (let q = 0; q < a.length; q++) a[q] = d[q * 4 + c]; return fxSobel(a, W, H); }); for (let q = 0; q < W * H; q++) for (let c = 0; c < 3; c++) d[q * 4 + c] = clamp255(255 - ch[c][q] * p.amount / 400); }],
        glowedges: ['Esthétiques', 'Contours lumineux (néon)', [['w', 'Épaisseur', 0, 10, 1, 0.5], ['bright', 'Luminosité', 1, 20, 8, 0.5]], (img, p, s) => { const W = img.width, H = img.height, d = img.data, b = p.w ? new ImageData(rtBlurred(img, p.w * s), W, H) : img, ch = [0, 1, 2].map(c => { const a = new Float32Array(W * H); for (let q = 0; q < a.length; q++) a[q] = b.data[q * 4 + c]; return fxSobel(a, W, H); }); for (let q = 0; q < W * H; q++) for (let c = 0; c < 3; c++) d[q * 4 + c] = clamp255(ch[c][q] * p.bright / 12); }],
        solarize: ['Esthétiques', 'Solarisation', [['thr', 'Seuil', 0, 255, 128, 1]], (img, p) => { const d = img.data; for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) if (d[i + c] > p.thr) d[i + c] = 255 - d[i + c]; }],
        posterize: ['Esthétiques', 'Postérisation', [['levels', 'Niveaux', 2, 32, 5, 1]], (img, p) => { const d = img.data, k = 255 / (p.levels - 1); for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = Math.round(Math.round(d[i + c] / k) * k); }],
        threshold: ['Esthétiques', 'Seuil (noir et blanc pur)', [['level', 'Seuil', 0, 255, 128, 1]], (img, p) => { const d = img.data; for (let i = 0; i < d.length; i += 4) { const v = fxLum(d, i) >= p.level ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; } }],
        diffuse: ['Esthétiques', 'Diffusion', [['r', 'Rayon', 1, 40, 4, 0.5]], (img, p, s) => { const R = fxRng(91), r = p.r * Math.max(1, s); fxDisplace(img, (x, y) => [x + (R() - 0.5) * 2 * r, y + (R() - 0.5) * 2 * r]); }],
        wind: ['Esthétiques', 'Vent', [['len', 'Longueur', 2, 200, 40, 1], ['dir', 'Vers la droite (1) / gauche (0)', 0, 1, 1, 1]], (img, p, s) => { const W = img.width, H = img.height, d = img.data, R = fxRng(5), len = p.len * s; for (let y = 0; y < H; y++) { let carry = null, left = 0; for (let k = 0; k < W; k++) { const x = p.dir ? k : W - 1 - k, i = (y * W + x) * 4, l = fxLum(d, i); if (l > 170 && R() < 0.08) { carry = [d[i], d[i + 1], d[i + 2]]; left = len * (0.4 + R() * 0.6); } else if (carry && left > 0) { const t = left / len; for (let c = 0; c < 3; c++) d[i + c] = Math.max(d[i + c], d[i + c] + (carry[c] - d[i + c]) * t); left--; } } } }],
        oil: ['Artistiques', 'Peinture à l’huile', [['r', 'Taille de la touche', 1, 12, 4, 1]], (img, p, s) => fxKuwahara(img, Math.max(1, Math.round(p.r * Math.max(1, s))))],
        watercolor: ['Artistiques', 'Aquarelle', [['r', 'Taille des taches', 1, 12, 5, 1], ['edge', 'Contours', 0, 100, 40, 1]], (img, p, s) => { const W = img.width, H = img.height; fxKuwahara(img, Math.max(1, Math.round(p.r * Math.max(1, s)))); const d = img.data, m = fxSobel(fxLumArr(img), W, H), R = fxRng(13); for (let q = 0; q < W * H; q++) { const k = Math.max(0.35, 1 - m[q] * p.edge / 9000) * (0.97 + R() * 0.05); for (let c = 0; c < 3; c++) d[q * 4 + c] = clamp255(d[q * 4 + c] * k + (255 - d[q * 4 + c]) * 0.06); } }],
        pencil: ['Artistiques', 'Dessin au crayon', [['r', 'Trait', 1, 40, 6, 0.5], ['strength', 'Force', 0, 100, 70, 1], ['color', 'En couleur (0 / 1)', 0, 1, 0, 1]], (img, p, s) => { const W = img.width, H = img.height, d = img.data, L = fxLumArr(img), inv = new ImageData(W, H); for (let q = 0; q < L.length; q++) { inv.data[q * 4] = inv.data[q * 4 + 1] = inv.data[q * 4 + 2] = 255 - L[q]; inv.data[q * 4 + 3] = 255; } const b = rtBlurred(inv, p.r * s); for (let q = 0; q < L.length; q++) { const v = Math.min(255, L[q] * 255 / Math.max(1, 255 - b[q * 4])), k = 1 - (1 - v / 255) * (0.4 + p.strength / 100); const i = q * 4; if (p.color) for (let c = 0; c < 3; c++) d[i + c] = clamp255(255 - (255 - d[i + c]) * 0.55 * (1 - k) * 2.2); else d[i] = d[i + 1] = d[i + 2] = clamp255(255 * k); } }],
        comic: ['Artistiques', 'Bande dessinée', [['levels', 'Couleurs', 2, 8, 4, 1], ['edge', 'Traits noirs', 0, 100, 60, 1]], (img, p, s) => { const W = img.width, H = img.height; fxKuwahara(img, Math.max(1, Math.round(2 * Math.max(1, s)))); const d = img.data, k = 255 / (p.levels - 1), m = fxSobel(fxLumArr(img), W, H), th = 520 - p.edge * 4; for (let q = 0; q < W * H; q++) { const i = q * 4; if (m[q] > th) { d[i] = d[i + 1] = d[i + 2] = 20; continue; } for (let c = 0; c < 3; c++) d[i + c] = Math.round(Math.round(d[i + c] / k) * k); } }],
        oldfilm: ['Artistiques', 'Vieux film', [['amount', 'Usure', 0, 100, 60, 1]], (img, p, s) => { const W = img.width, H = img.height, d = img.data, R = fxRng(2024), a = p.amount / 100; for (let i = 0; i < d.length; i += 4) { const y = fxLum(d, i), n = (R() - 0.5) * 50 * a; d[i] = clamp255(y * 1.07 + 18 + n); d[i + 1] = clamp255(y * 0.92 + 8 + n); d[i + 2] = clamp255(y * 0.72 + n); }
            const c = fxCanvas(img), g = c.getContext('2d'); g.strokeStyle = 'rgba(255,255,240,.55)'; for (let k = 0; k < Math.round(8 * a); k++) { const x = R() * W; g.lineWidth = Math.max(1, s * (0.6 + R())); g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (R() - 0.5) * 20 * s, H); g.stroke(); } g.fillStyle = 'rgba(20,15,10,.7)'; for (let k = 0; k < Math.round(120 * a); k++) { g.beginPath(); g.arc(R() * W, R() * H, Math.max(0.6, R() * 2.5 * s), 0, Math.PI * 2); g.fill(); } fxBack(img, c); }],
        mosaic: ['Pixellisation', 'Mosaïque', [['size', 'Taille des carreaux', 2, 200, 16, 1]], (img, p, s) => { const W = img.width, H = img.height, d = img.data, z = Math.max(2, Math.round(p.size * s)); for (let y0 = 0; y0 < H; y0 += z) for (let x0 = 0; x0 < W; x0 += z) { let n = 0, r = 0, g = 0, b = 0; for (let y = y0; y < Math.min(H, y0 + z); y++) for (let x = x0; x < Math.min(W, x0 + z); x++) { const i = (y * W + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } for (let y = y0; y < Math.min(H, y0 + z); y++) for (let x = x0; x < Math.min(W, x0 + z); x++) { const i = (y * W + x) * 4; d[i] = r / n; d[i + 1] = g / n; d[i + 2] = b / n; } } }],
        halftone: ['Pixellisation', 'Demi-teinte (points d’imprimerie)', [['size', 'Taille des points', 3, 60, 8, 1], ['color', 'En couleur (0 / 1)', 0, 1, 0, 1]], (img, p, s) => { const W = img.width, H = img.height, d = img.data, z = Math.max(3, p.size * s), c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
            for (let y = 0; y < H; y += z) for (let x = 0; x < W; x += z) { const i = (Math.min(H - 1, Math.round(y + z / 2)) * W + Math.min(W - 1, Math.round(x + z / 2))) * 4, l = fxLum(d, i) / 255, rad = z / 2 * Math.sqrt(1 - l) * 1.35; if (rad < 0.3) continue; g.fillStyle = p.color ? `rgb(${d[i] * 0.85 | 0},${d[i + 1] * 0.85 | 0},${d[i + 2] * 0.85 | 0})` : '#111'; g.beginPath(); g.arc(x + z / 2, y + z / 2, rad, 0, Math.PI * 2); g.fill(); } fxBack(img, c); }],
        crystal: ['Pixellisation', 'Cristallisation', [['size', 'Taille des cristaux', 3, 150, 18, 1]], (img, p, s) => { const W = img.width, H = img.height, d = img.data, z = Math.max(3, p.size * s), gw = Math.ceil(W / z), gh = Math.ceil(H / z), R = fxRng(3), seeds = []; for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) seeds.push([(i + R()) * z, (j + R()) * z]); const col = seeds.map(([x, y]) => { const i = (Math.min(H - 1, y | 0) * W + Math.min(W - 1, x | 0)) * 4; return [d[i], d[i + 1], d[i + 2]]; });
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const gi = Math.floor(x / z), gj = Math.floor(y / z); let best = 1e18, bk = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = gi + di, jj = gj + dj; if (ii < 0 || jj < 0 || ii >= gw || jj >= gh) continue; const k = jj * gw + ii, dx = seeds[k][0] - x, dy = seeds[k][1] - y, dd = dx * dx + dy * dy; if (dd < best) { best = dd; bk = k; } } const o = (y * W + x) * 4; d[o] = col[bk][0]; d[o + 1] = col[bk][1]; d[o + 2] = col[bk][2]; } }],
        pointil: ['Pixellisation', 'Pointillisme', [['size', 'Taille des points', 3, 60, 10, 1]], (img, p, s) => { const W = img.width, H = img.height, d = img.data, z = Math.max(3, p.size * s), R = fxRng(8), c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#f6f1e6'; g.fillRect(0, 0, W, H); const n = Math.round(W * H / (z * z) * 2.2);
            for (let k = 0; k < n; k++) { const x = R() * W, y = R() * H, i = ((y | 0) * W + (x | 0)) * 4; g.fillStyle = `rgb(${clamp255(d[i] + (R() - 0.5) * 30) | 0},${clamp255(d[i + 1] + (R() - 0.5) * 30) | 0},${clamp255(d[i + 2] + (R() - 0.5) * 30) | 0})`; g.beginPath(); g.arc(x, y, z * (0.35 + R() * 0.3), 0, Math.PI * 2); g.fill(); } fxBack(img, c); }],
        lighting: ['Rendu', 'Éclairage (projecteur)', [['x', 'Lumière X (%)', 0, 100, 30, 1], ['y', 'Lumière Y (%)', 0, 100, 25, 1], ['radius', 'Portée (%)', 10, 200, 80, 1], ['power', 'Intensité (%)', 0, 200, 80, 1], ['ambient', 'Lumière ambiante (%)', 0, 100, 45, 1]], (img, p) => { const W = img.width, H = img.height, d = img.data, lx = p.x / 100 * W, ly = p.y / 100 * H, R = p.radius / 100 * Math.max(W, H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const t = Math.max(0, 1 - Math.hypot(x - lx, y - ly) / R), f = p.ambient / 100 + p.power / 100 * t * t * (3 - 2 * t), i = (y * W + x) * 4; for (let c = 0; c < 3; c++) d[i + c] = clamp255(d[i + c] * f); } }],
        clouds: ['Rendu', 'Nuages (texture)', [['scale', 'Taille', 1, 100, 30, 1], ['amount', 'Force', 0, 100, 40, 1]], (img, p) => { const W = img.width, H = img.height, d = img.data, nz = fxNoise2(42), sc = (101 - p.scale) / 100 * 12 / Math.max(W, H), a = p.amount / 100; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0, f = 1, am = 0.5; for (let o = 0; o < 5; o++) { v += nz(x * sc * f, y * sc * f) * am; f *= 2; am /= 2; } const i = (y * W + x) * 4, n = v * 255; for (let c = 0; c < 3; c++) { const b = d[i + c], sl = n < 128 ? b - (1 - 2 * n / 255) * b * (1 - b / 255) : b + (2 * n / 255 - 1) * (Math.sqrt(b / 255) * 255 - b); d[i + c] = clamp255(b + (sl - b) * a); } } }],
        flare: ['Rendu', 'Halo de lumière (flare)', [['x', 'Position X (%)', 0, 100, 25, 1], ['y', 'Position Y (%)', 0, 100, 25, 1], ['bright', 'Luminosité (%)', 10, 200, 100, 1]], (img, p) => { const W = img.width, H = img.height, c = fxCanvas(img), g = c.getContext('2d'), x = p.x / 100 * W, y = p.y / 100 * H, M = Math.max(W, H), k = p.bright / 100; g.globalCompositeOperation = 'screen';
            const blob = (cx, cy, r, col, a) => { const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2); };
            blob(x, y, M * 0.25 * k, '255,240,210', 0.9); blob(x, y, M * 0.05 * k, '255,255,255', 1); [[0.3, 0.04, '120,200,255', 0.35], [0.55, 0.025, '255,170,90', 0.4], [0.8, 0.07, '150,255,170', 0.2], [1.2, 0.05, '200,140,255', 0.25]].forEach(([t, r, col, a]) => blob(x + (W / 2 - x) * t * 2, y + (H / 2 - y) * t * 2, M * r * k, col, a * k)); fxBack(img, c); }],
        glow: ['Rendu', 'Lueur diffuse', [['thr', 'À partir de (luminosité)', 0, 255, 190, 1], ['r', 'Rayon', 1, 100, 20, 0.5], ['amount', 'Force (%)', 0, 200, 80, 1]], (img, p, s) => { const d = img.data, hi = new ImageData(new Uint8ClampedArray(d), img.width, img.height); for (let i = 0; i < hi.data.length; i += 4) if (fxLum(hi.data, i) < p.thr) hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = 0; const b = rtBlurred(hi, p.r * s), k = p.amount / 100; for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = clamp255(255 - (255 - d[i + c]) * (255 - b[i + c] * k) / 255); }],
        twirl: ['Déformation', 'Tourbillon', [['angle', 'Angle (°)', -720, 720, 180, 1], ['radius', 'Rayon (%)', 5, 100, 50, 1], ['cx', 'Centre X (%)', 0, 100, 50, 1], ['cy', 'Centre Y (%)', 0, 100, 50, 1]], (img, p) => { const W = img.width, H = img.height, cx = p.cx / 100 * W, cy = p.cy / 100 * H, R = p.radius / 100 * Math.min(W, H), A = p.angle * Math.PI / 180; fxDisplace(img, (x, y) => { const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy); if (r >= R) return null; const t = 1 - r / R, a = A * t * t, c = Math.cos(a), si = Math.sin(a); return [cx + dx * c - dy * si, cy + dx * si + dy * c]; }); }],
        pinch: ['Déformation', 'Pincement / sphérisation', [['amount', 'Force (− sphère, + pincement)', -100, 100, 50, 1], ['radius', 'Rayon (%)', 5, 100, 50, 1], ['cx', 'Centre X (%)', 0, 100, 50, 1], ['cy', 'Centre Y (%)', 0, 100, 50, 1]], (img, p) => { const W = img.width, H = img.height, cx = p.cx / 100 * W, cy = p.cy / 100 * H, R = p.radius / 100 * Math.min(W, H), e = p.amount >= 0 ? 1 / (1 + p.amount / 60) : 1 + -p.amount / 60; fxDisplace(img, (x, y) => { const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy); if (r >= R || r < 0.5) return null; const nr = Math.pow(r / R, e) * R / r; return [cx + dx * nr, cy + dy * nr]; }); }],
        wave: ['Déformation', 'Onde', [['amp', 'Amplitude', 0, 100, 10, 0.5], ['wl', 'Longueur d’onde', 5, 400, 80, 1], ['dir', 'Horizontale (0) / verticale (1)', 0, 1, 0, 1]], (img, p, s) => { const a = p.amp * s, L = p.wl * s; fxDisplace(img, (x, y) => p.dir ? [x, y + a * Math.sin(2 * Math.PI * x / L)] : [x + a * Math.sin(2 * Math.PI * y / L), y]); }],
        ripple: ['Déformation', 'Ondulation (ronds dans l’eau)', [['amp', 'Amplitude', 0, 60, 8, 0.5], ['wl', 'Écart des ronds', 5, 200, 30, 1], ['cx', 'Centre X (%)', 0, 100, 50, 1], ['cy', 'Centre Y (%)', 0, 100, 50, 1]], (img, p, s) => { const W = img.width, H = img.height, cx = p.cx / 100 * W, cy = p.cy / 100 * H, a = p.amp * s, L = p.wl * s; fxDisplace(img, (x, y) => { const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy) || 1, k = a * Math.sin(2 * Math.PI * r / L) / r; return [x + dx * k, y + dy * k]; }); }],
        polar: ['Déformation', 'Coordonnées polaires', [['mode', 'Rectangle → polaire (0) / l’inverse (1)', 0, 1, 0, 1]], (img, p) => { const W = img.width, H = img.height, cx = W / 2, cy = H / 2, M = Math.hypot(cx, cy); fxDisplace(img, (x, y) => { if (!p.mode) { const dx = x - cx, dy = y - cy, a = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI); return [a * W, Math.hypot(dx, dy) / M * H]; } const a = x / W * 2 * Math.PI - Math.PI, r = y / H * M; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; }); }],
        minimum: ['Autres', 'Minimum (assombrit, épaissit le sombre)', [['r', 'Rayon', 1, 20, 2, 1]], (img, p, s) => fxMinMax(img, Math.max(1, Math.round(p.r * Math.max(1, s / 2))), false)],
        maximum: ['Autres', 'Maximum (éclaircit, épaissit le clair)', [['r', 'Rayon', 1, 20, 2, 1]], (img, p, s) => fxMinMax(img, Math.max(1, Math.round(p.r * Math.max(1, s / 2))), true)],
        offset: ['Autres', 'Décalage (avec retour de l’autre côté)', [['dx', 'Horizontal (%)', -100, 100, 25, 1], ['dy', 'Vertical (%)', -100, 100, 0, 1]], (img, p) => { const W = img.width, H = img.height, ox = Math.round(p.dx / 100 * W), oy = Math.round(p.dy / 100 * H); fxDisplace(img, (x, y) => [((x - ox) % W + W) % W, ((y - oy) % H + H) % H]); }],
        deglare: ['Autres', 'Enlever les reflets (vitre)', [['amount', 'Reflets en moins', 0, 100, 60, 1], ['size', 'Taille des reflets (0 = moyenne)', 0, 100, 0, 1]], (img, p) => rtDeglare(img, p.amount, p.size)],
    };
    const fxDefaults = t => Object.fromEntries((RT_FX[t]?.[2] || []).map(r => [r[0], r[4]]));
    function rtFxApply(img, step) { const f = RT_FX[step?.t]; if (!f) return; const p = {...fxDefaults(step.t), ...step}; f[2].forEach(([k, , mn, mx, dv]) => { const v = Number(p[k]); p[k] = Number.isFinite(v) ? Math.min(mx, Math.max(mn, v)) : dv; }); /* réglages bornés (projet ou action d’ailleurs) */ try { f[3](img, p, img.width / 1000); } catch (err) { console.warn('Filtre', step.t, err); } }
    function rtFilters(img, f) {
        const W = img.width, H = img.height, d = img.data;
        if (f.deglare > 0) rtDeglare(img, f.deglare, f.deglareSize);
        if (f.blur > 0) { const b = rtBlurred(img, f.blur * W / 4000); for (let i = 0; i < d.length; i += 4) { d[i] = b[i]; d[i + 1] = b[i + 1]; d[i + 2] = b[i + 2]; } }
        if (f.denoise > 0) { const b = rtBlurred(img, Math.max(0.6, W / 1400 * (1 + f.denoise / 40))), k = f.denoise / 100;
            for (let i = 0; i < d.length; i += 4) { const diff = (Math.abs(d[i] - b[i]) + Math.abs(d[i + 1] - b[i + 1]) + Math.abs(d[i + 2] - b[i + 2])) / 3, w = k * Math.max(0, 1 - diff / 42); for (let c = 0; c < 3; c++) d[i + c] += (b[i + c] - d[i + c]) * w; } }
        if (f.sharpen > 0) { const b = rtBlurred(img, Math.max(0.8, W / 1600)), k = f.sharpen / 35; for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = clamp255(d[i + c] + (d[i + c] - b[i + c]) * k); }
        if (f.clarity) { const b = rtBlurred(img, W / 60), k = f.clarity / 100; for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = clamp255(d[i + c] + (d[i + c] - b[i + c]) * k); }
        if (f.grain > 0) { const amp = f.grain * 0.55; for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i += 4) { let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; h = (h ^ (h >>> 13)) * 1274126177; const n = (((h ^ (h >>> 16)) & 1023) / 1023 - 0.5) * amp; d[i] = clamp255(d[i] + n); d[i + 1] = clamp255(d[i + 1] + n); d[i + 2] = clamp255(d[i + 2] + n); } }
        if (f.vignette) { const cx = W / 2, cy = H / 2, md = Math.hypot(cx, cy), k = f.vignette / 100;
            for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i += 4) { const t = Math.hypot(x - cx, y - cy) / md, v = t < 0.45 ? 0 : Math.min(1, (t - 0.45) / 0.6), w = v * v * (3 - 2 * v), m = k > 0 ? 1 - k * w * 0.85 : 1 - k * w * 0.6; d[i] = clamp255(d[i] * m); d[i + 1] = clamp255(d[i + 1] * m); d[i + 2] = clamp255(d[i + 2] * m); } }
        if (Array.isArray(f.chain)) f.chain.forEach(step => rtFxApply(img, step)); // menu Filtre
        return img;
    }
    /** Réglage automatique : les 0,5 % les plus sombres deviennent noirs, les 0,5 % les plus clairs deviennent blancs. */
    function rtAuto(img, st) {
        const hist = new Array(256).fill(0); let n = 0;
        for (let i = 0; i < img.data.length; i += 16) { hist[Math.round(0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2])]++; n++; }
        let lo = 0, hi = 255, acc = 0;
        while (lo < 254 && (acc += hist[lo]) < n * 0.005) lo++;
        acc = 0; while (hi > lo + 1 && (acc += hist[hi]) < n * 0.005) hi--;
        Object.assign(st, rtDefault(), {bw: st.bw, sepia: st.sepia, invert: st.invert, strokes: st.strokes || [], filters: st.filters || {}, crop: st.crop || null, persp: st.persp || null});
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
    /** L'opacité (0 à 255) d'un masque de sélection, à la taille voulue */
    function rtMaskAlpha(maskCanvas, W, H) { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', {willReadFrequently: true}); g.drawImage(maskCanvas, 0, 0, W, H); const d = g.getImageData(0, 0, W, H).data, a = new Uint8ClampedArray(W * H); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3]; return a; }
    /**
     * 🧭 Restauration : les petites taches d'une photo (poussières, points blancs ou noirs, piqûres) — ce qui tranche nettement
     * sur son voisinage et reste petit. Renvoie des touches du correcteur {x, y, r} (en fractions de l'image).
     * force : 1 (seulement les taches franches) à 100 (beaucoup) ; taille : rayon maximal d'une tache, en points.
     */
    function rtSpots(img, force = 50, maxR = 6, inside = null) {
        const W = img.width, H = img.height, d = img.data, L = new Float32Array(W * H);
        for (let i = 0, j = 0; i < L.length; i++, j += 4) L[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
        // voisinage : moyenne dans une boîte (intégrale), assez large pour ne pas « voir » la tache elle-même
        const R = Math.max(4, Math.round(maxR * 1.8)), I = new Float64Array((W + 1) * (H + 1));
        for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += L[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
        const mean = (x, y) => { const x0 = Math.max(0, x - R), y0 = Math.max(0, y - R), x1 = Math.min(W, x + R + 1), y1 = Math.min(H, y + R + 1); return (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0)); };
        const thr = 70 - force * 0.55, mark = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (inside && !inside[i]) continue; if (Math.abs(L[i] - mean(x, y)) > thr) mark[i] = 1; }
        // les taches : des groupes de points marqués, petits et à peu près ronds (pas un bord, pas un trait du dessin)
        const out = [], stack = [], maxA = Math.PI * maxR * maxR * 1.4;
        for (let i = 0; i < mark.length; i++) {
            if (mark[i] !== 1) continue;
            let n = 0, sx = 0, sy = 0, x0 = W, y0 = H, x1 = 0, y1 = 0, big = false; stack.push(i); mark[i] = 2;
            while (stack.length) { const k = stack.pop(), x = k % W, y = (k - x) / W; n++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (n > maxA) big = true;
                for (const q of [k - 1, k + 1, k - W, k + W]) if (q >= 0 && q < mark.length && mark[q] === 1 && Math.abs((q % W) - x) <= 1) { mark[q] = 2; stack.push(q); } }
            const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
            if (big || n < 1 || bw > maxR * 2.6 || bh > maxR * 2.6 || Math.max(bw, bh) > 4 * Math.min(bw, bh) + 2) continue;
            out.push({x: (sx / n + .5) / W, y: (sy / n + .5) / H, r: (Math.max(bw, bh) / 2 * 1.6 + 3.5) / W}); // un peu plus large que la tache : ni anneau ni bord
            if (out.length >= 4000) break;
        }
        return out;
    }
    function rtReplayStrokes(img, strokes, masks = null) {
        const W = img.width, H = img.height, data = img.data;
        for (const g of strokes) {
            // sélection : remplir d'une couleur, rendre transparent, ou poser la zone ailleurs (tampon d'une zone)
            if (['fill', 'clear', 'patch'].includes(g.tool)) {
                const m = masks?.get(g.mask); if (!m) continue; const al = rtMaskAlpha(m, W, H);
                if (g.tool === 'fill') { const c = [1, 3, 5].map(k => parseInt(String(g.color || '#ffffff').slice(k, k + 2), 16)), op = g.opacity ?? 1; for (let i = 0; i < al.length; i++) { const w = al[i] / 255 * op; if (!w) continue; const j = i * 4; for (let k = 0; k < 3; k++) data[j + k] = data[j + k] * (1 - w) + c[k] * w; data[j + 3] = Math.max(data[j + 3], Math.round(255 * w)); } }
                if (g.tool === 'clear') for (let i = 0; i < al.length; i++) if (al[i]) data[i * 4 + 3] = Math.round(data[i * 4 + 3] * (1 - al[i] / 255));
                if (g.tool === 'patch') { const from = new Uint8ClampedArray(data), dx = Math.round(g.dx * W), dy = Math.round(g.dy * H);
                    for (let y = 0; y < H; y++) { const sy = y - dy; if (sy < 0 || sy >= H) continue; for (let x = 0; x < W; x++) { const sx = x - dx; if (sx < 0 || sx >= W) continue; const w = al[sy * W + sx] / 255; if (!w) continue; const i = (y * W + x) * 4, j = (sy * W + sx) * 4; for (let k = 0; k < 3; k++) data[i + k] = data[i + k] * (1 - w) + from[j + k] * w; } } }
                continue;
            }
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
    function rtDrawOp(c, op, W, H, env = null) {
        c.save();
        if (op.type === 'shape') { // rectangle, ellipse, ligne, flèche
            const x1 = op.x1 * W, y1 = op.y1 * H, x2 = op.x2 * W, y2 = op.y2 * H, lw = Math.max(0.5, op.size * W);
            c.globalAlpha = op.opacity ?? 1; c.lineWidth = lw; c.strokeStyle = op.color; c.lineJoin = 'round'; c.lineCap = 'round';
            c.beginPath();
            if (op.kind === 'rect') c.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
            else if (op.kind === 'round') { const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1), r = Math.min(w, h) * 0.18; c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
            else if (op.kind === 'ellipse') c.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
            else { c.moveTo(x1, y1); c.lineTo(x2, y2); }
            if (op.fill && !['line', 'arrow'].includes(op.kind)) { c.fillStyle = op.fill; c.fill(); }
            if (op.size > 0) c.stroke();
            if (op.kind === 'arrow') { const a = Math.atan2(y2 - y1, x2 - x1), L = Math.max(lw * 4, 10); c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - L * Math.cos(a - 0.45), y2 - L * Math.sin(a - 0.45)); c.lineTo(x2 - L * Math.cos(a + 0.45), y2 - L * Math.sin(a + 0.45)); c.closePath(); c.fillStyle = op.color; c.fill(); }
            c.restore(); return;
        }
        if (op.type === 'image') { // une image placée (Calque → Placer une image) : boîte x, y, w, h (0 à 1), rotation en degrés
            const im = env?.masks?.get(op.mask); if (!im) { c.restore(); return; }
            c.globalAlpha = op.opacity ?? 1; c.translate((op.x + op.w / 2) * W, (op.y + op.h / 2) * H); c.rotate((op.rot || 0) * Math.PI / 180);
            c.imageSmoothingQuality = 'high'; c.drawImage(im, -op.w * W / 2, -op.h * H / 2, op.w * W, op.h * H); c.restore(); return;
        }
        if (op.type === 'fillmask') { // une sélection remplie d'une couleur, sur un calque
            const m = env?.masks?.get(op.mask); if (!m) { c.restore(); return; }
            const t = document.createElement('canvas'); t.width = W; t.height = H; const g = t.getContext('2d'); g.fillStyle = op.color; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'destination-in'; g.drawImage(m, 0, 0, W, H);
            c.globalAlpha = op.opacity ?? 1; c.drawImage(t, (op.dx || 0) * W, (op.dy || 0) * H); c.restore(); return;
        }
        if (op.type === 'pixels') { // une zone de la photo (sélection) posée sur un calque
            const m = env?.masks?.get(op.mask); if (!m || !env.photo) { c.restore(); return; }
            const t = document.createElement('canvas'); t.width = W; t.height = H; const g = t.getContext('2d'); g.drawImage(env.photo, 0, 0, W, H); g.globalCompositeOperation = 'destination-in'; g.drawImage(m, 0, 0, W, H);
            c.globalAlpha = op.opacity ?? 1; c.drawImage(t, (op.dx || 0) * W, (op.dy || 0) * H); c.restore(); return;
        }
        if (op.type === 'text') {
            const size = Math.max(6, op.size * W);
            c.globalAlpha = op.opacity ?? 1; c.fillStyle = op.color; c.font = `${op.italic ? 'italic ' : ''}${op.bold ? 'bold ' : ''}${size}px ${op.font || 'Arial, sans-serif'}`; c.textBaseline = 'top';
            if (op.halo) { c.lineWidth = Math.max(2, size / 6) * (op.haloW || 1); c.strokeStyle = op.halo; c.lineJoin = 'round'; }
            if (op.shadow) { c.shadowColor = op.shadow; c.shadowBlur = size * 0.22; c.shadowOffsetX = c.shadowOffsetY = size * 0.07; }
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
    const rtDrawLayer = (canvas, layer, env = null) => { const c = canvas.getContext('2d'); c.clearRect(0, 0, canvas.width, canvas.height); layer.ops.forEach(op => rtDrawOp(c, op, canvas.width, canvas.height, env)); };
    /* ── Masques de calque : blanc = on voit, noir = caché. Faits de coups de pinceau (cacher / montrer) et de sélections ── */
    function rtRenderMask(ops, W, H, masks) {
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
        g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
        for (const op of ops || []) {
            g.save();
            if (op.type === 'sel') { const m = masks?.get(op.mask); if (m) { g.globalCompositeOperation = 'copy'; if (op.invert) { g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'destination-out'; } g.drawImage(m, 0, 0, W, H); } }
            else if (op.type === 'all') { if (op.mode === 'hide') g.clearRect(0, 0, W, H); else g.fillRect(0, 0, W, H); }
            else if (op.type === 'invert') { const t = document.createElement('canvas'); t.width = W; t.height = H; const tg = t.getContext('2d'); tg.fillRect(0, 0, W, H); tg.globalCompositeOperation = 'destination-out'; tg.drawImage(c, 0, 0); g.globalCompositeOperation = 'copy'; g.drawImage(t, 0, 0); }
            else if (op.points?.length) { g.globalCompositeOperation = op.mode === 'hide' ? 'destination-out' : 'source-over'; g.strokeStyle = '#000'; g.globalAlpha = op.opacity ?? 1; g.lineCap = g.lineJoin = 'round'; g.lineWidth = Math.max(0.5, op.size * W); if (op.soft) g.filter = `blur(${Math.max(1, op.size * W * 0.3)}px)`;
                g.beginPath(); g.moveTo(op.points[0][0] * W, op.points[0][1] * H); op.points.forEach(([x, y]) => g.lineTo(x * W, y * H)); if (op.points.length === 1) g.lineTo(op.points[0][0] * W + 0.1, op.points[0][1] * H); g.stroke(); }
            g.restore();
        }
        return c;
    }
    /** Modes de fusion d'un calque (comme Photoshop ; ceux que sait faire le canvas) */
    const RT_BLENDS = [['source-over', 'Normal'], ['multiply', 'Produit'], ['screen', 'Superposition (Écran)'], ['overlay', 'Incrustation'], ['darken', 'Obscurcir'], ['lighten', 'Éclaircir'],
        ['color-dodge', 'Densité couleur −'], ['color-burn', 'Densité couleur +'], ['hard-light', 'Lumière crue'], ['soft-light', 'Lumière tamisée'], ['difference', 'Différence'], ['exclusion', 'Exclusion'],
        ['hue', 'Teinte'], ['saturation', 'Saturation'], ['color', 'Couleur'], ['luminosity', 'Luminosité']];
    const rtBlend = n => RT_BLENDS.some(b => b[0] === n?.blend) ? n.blend : 'source-over';
    /** Un calque (ou la photo) avec son masque appliqué */
    function rtMasked(src, maskOps, masks) { if (!maskOps) return src; const W = src.width, H = src.height, m = rtRenderMask(maskOps, W, H, masks), t = document.createElement('canvas'); t.width = W; t.height = H; const g = t.getContext('2d'); g.drawImage(src, 0, 0); g.globalCompositeOperation = 'destination-in'; g.drawImage(m, 0, 0); return t; }
    /** Sélection automatique (baguette magique) : les points de teinte proche, voisins (contigu) ou partout */
    function rtWand(img, x0, y0, tol, contiguous) {
        const W = img.width, H = img.height, d = img.data, sx = Math.max(0, Math.min(W - 1, Math.round(x0))), sy = Math.max(0, Math.min(H - 1, Math.round(y0))), k = (sy * W + sx) * 4;
        const r0 = d[k], g0 = d[k + 1], b0 = d[k + 2], t2 = (tol * 4.42) ** 2, inside = i => { const dr = d[i] - r0, dg = d[i + 1] - g0, db = d[i + 2] - b0; return dr * dr + dg * dg + db * db <= t2; };
        const sel = new Uint8Array(W * H);
        if (!contiguous) { for (let p = 0; p < W * H; p++) if (inside(p * 4)) sel[p] = 1; }
        else { const stack = [sy * W + sx]; sel[sy * W + sx] = 1; while (stack.length) { const p = stack.pop(), x = p % W, y = (p - x) / W; for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) if (q >= 0 && !sel[q] && inside(q * 4)) { sel[q] = 1; stack.push(q); } } }
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), out = g.createImageData(W, H);
        for (let p = 0; p < W * H; p++) if (sel[p]) out.data[p * 4 + 3] = 255;
        g.putImageData(out, 0, 0); return c;
    }
    const rtClone = v => JSON.parse(JSON.stringify(v));

    /** Retouche d'une photo : on part de la version affichée (ou d'une autre, `source`), le résultat devient une nouvelle version.
     *  Outils : réglages, correcteur de taches, tampon (source choisie), pinceau (6 sortes), texte ; calques d'annotation ; historique ; zoom. */
    // 🧭 la restauration pas à pas : [clé, titre, explication, boutons] (les boutons appellent les commandes de la retouche)
    const RT_PALETTE = [['#e9c2a6', 'Peau claire'], ['#d39e7e', 'Peau hâlée'], ['#a8725a', 'Peau mate'], ['#e7a3a0', 'Joues, lèvres'], ['#5a3a24', 'Cheveux bruns'], ['#c9a35e', 'Cheveux blonds'], ['#9a9a9a', 'Cheveux gris'], ['#8fb3d9', 'Ciel'], ['#6f8f4e', 'Feuillage'], ['#9fbf6a', 'Herbe'], ['#2f3f66', 'Uniforme, costume bleu'], ['#6b2d2d', 'Robe bordeaux'], ['#3a3a3a', 'Habit noir'], ['#d8cfb8', 'Mur, pierre'], ['#b5653e', 'Brique, tuile'], ['#7b5a3a', 'Bois']];
    const RT_RESTORE_STEPS = [
        ['frame', '⌗ Cadrer et redresser', 'Une photo scannée de travers, avec ses bords blancs ou abîmés : on la redresse, puis on garde ce qui compte.', '<button type="button" class="button small" data-rt-cmd="straighten:auto">📐 Redresser tout seul</button><button type="button" class="button small secondary" data-rt-cmd="mode:crop">⌗ Recadrer</button><button type="button" class="button small secondary" data-rt-cmd="mode:persp">⧈ Photo prise de biais</button>'],
        ['color', '🎨 Couleurs passées, photo jaunie', 'Le temps jaunit, pâlit ou rosit les photos. « Enlever le jaunissement » remet chaque couleur à sa place ; « Raviver » redonne du contraste.', '<button type="button" class="button small" data-rt-cmd="restore:yellow">🟨 Enlever le jaunissement</button><button type="button" class="button small secondary" data-rt-cmd="preset:1">✨ Raviver une vieille photo</button><button type="button" class="button small secondary" data-rt-cmd="preset:0">Réglage automatique</button>'],
        ['spots', '🧹 Poussières et petites taches', 'Les points blancs ou noirs, les piqûres : l’app les cherche et les enlève une par une (avec le correcteur). Pour ne traiter qu’une partie, sélectionne-la d’abord. Ce qui reste : le correcteur 🩹 à la main.', '<label class="h-rt-slider"><span>Sensibilité <output data-rt-spotf-out>50</output></span><input type="range" min="1" max="100" value="50" data-rt-spotf></label><label class="h-rt-slider"><span>Taille maximale d’une tache <output data-rt-spots-out>6</output></span><input type="range" min="2" max="20" value="6" data-rt-spots></label><button type="button" class="button small" data-rt-cmd="restore:spots">🔍 Repérer et enlever les taches</button><button type="button" class="button small secondary" data-rt-cmd="mode:heal">🩹 Correcteur à la main</button><button type="button" class="button small secondary" data-rt-cmd="fx:dust">Filtre poussière et rayures</button>'],
        ['tears', '🩹 Déchirures, plis, rayures', 'Avec le correcteur, glisse le long d’une rayure ou d’un pli : il est comblé par ce qui l’entoure. Pour un morceau manquant (coin arraché), le tampon recopie une partie voisine.', '<button type="button" class="button small" data-rt-cmd="restore:tear">🩹 Correcteur pour les rayures</button><button type="button" class="button small secondary" data-rt-cmd="mode:clone">🧬 Tampon (morceau manquant)</button><button type="button" class="button small secondary" data-rt-cmd="mode:lasso">➰ Entourer une zone…</button>'],
        ['grain', '🌫️ Grain et bruit', 'Une photo granuleuse ou un tirage abîmé : on adoucit sans perdre les contours.', '<button type="button" class="button small" data-rt-cmd="fx:denoise2">Réduire le bruit…</button><button type="button" class="button small secondary" data-rt-cmd="fx:surface">Flou de surface (garde les contours)…</button><button type="button" class="button small secondary" data-rt-cmd="fx:median">Médiane…</button>'],
        ['face', '🙂 Netteté des visages', 'Entoure un visage avec l’ellipse ◯, puis « Visage plus net » : il est débruité et accentué, seulement là (calque à part, que tu peux doser).', '<button type="button" class="button small secondary" data-rt-cmd="mode:ellipsesel">◯ Entourer le visage</button><button type="button" class="button small" data-rt-cmd="restore:face">✨ Visage plus net</button><button type="button" class="button small secondary" data-rt-cmd="sel:subject">🎯 Sélectionner le sujet</button>'],
        ['colorize', '🌈 Coloriser une photo en noir et blanc', 'Tout seul (un dégradé de couleurs d’époque), ou à la main : choisis une couleur ci-dessous et peins doucement, la lumière de la photo est gardée.', '<button type="button" class="button small" data-rt-cmd="colorize:auto">🎨 Coloriser tout seul</button><button type="button" class="button small secondary" data-rt-cmd="colorize:paint">🖌 Coloriser au pinceau</button><div class="h-rt-palette">' + RT_PALETTE.map(([c, l]) => `<button type="button" data-rt-cmd="restore:color:${c}" style="background:${c}" title="${l}"></button>`).join('') + '</div>'],
        ['save', '✅ Comparer et enregistrer', 'Garde appuyé « 👁 Avant / après » (sous la photo) pour comparer. La photo restaurée devient une nouvelle version : l’original reste.', '<button type="button" class="button small" data-rt-cmd="save:show">💾 Enregistrer et afficher</button><button type="button" class="button small secondary" data-rt-cmd="proj:save">Garder le travail pour plus tard</button>'],
    ];
    async function openRetouch(source = '', project = null, {advanced = false, tab = ''} = {}) {
        // la retouche simple (celle de la 0.5.0) si c'est la dernière choisie ; un projet s'ouvre toujours ici
        let mode0 = ''; try { mode0 = localStorage.getItem('genealogie-retouch-mode') || ''; } catch (_) {}
        if (!project && !advanced && mode0 !== 'advanced' && ext.openRetouchSimple) return ext.openRetouchSimple(source);
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
        const TOOLS = [['adjust', '🎚', 'Réglages'], ['heal', '🩹', 'Correcteur de taches'], ['clone', '🧬', 'Tampon'], ['brush', '🖌', 'Pinceau'], ['eraser', '🧽', 'Gomme'], ['text', '🔤', 'Texte'], ['hand', '✋', 'Déplacer la vue']];
        // la colonne d'outils (comme l'atelier de mise en page) : sélectionner, recadrer, retoucher, dessiner, écrire
        const VTOOLS = [['move', '➤', 'Déplacer un élément d’un calque (V)', 'v'], ['marquee', '⬚', 'Sélection rectangle (M)', 'm'], ['ellipsesel', '◯', 'Sélection ellipse (⇧M)', ''], ['lasso', '➰', 'Lasso : entourer à main levée (L)', 'l'], ['polysel', '✒︎', 'Plume : sélection point par point (P) — double-clic ou Entrée pour fermer', 'p'], ['wand', '🪄', 'Sélection automatique (baguette magique) (W)', 'w'], ['crop', '⌗', 'Recadrer et redresser (C)', 'c'],
            ['heal', '🩹', 'Correcteur de taches (J)', 'j'], ['clone', '🧬', 'Tampon : un endroit, ou une zone sélectionnée (S)', 's'], ['brush', '🖌', 'Pinceau (B)', 'b'], ['eraser', '🧽', 'Gomme (E) : efface le calque choisi ; sur la photo, elle la cache avec un masque (rien n’est perdu)', 'e'], ['shape', '⬜', 'Formes : rectangle, ellipse, ligne, flèche (U)', 'u'], ['text', 'T', 'Texte (T)', 't'], ['hand', '✋', 'Main (H, ou espace)', 'h'], ['zoom', '🔍', 'Zoom (Z) — ⌥ pour reculer', 'z']];
        const MENUS = [
            ['Fichier', [['proj:save', '💾 Enregistrer le projet (pour continuer plus tard)', '⌘S'], ['proj:saveas', 'Enregistrer le projet sous un autre nom…', '⇧⌘S'], ['proj:open', '📂 Ouvrir un projet…'], ['-'], ['save:show', 'Enregistrer et afficher cette version'], ['save:keep', 'Enregistrer sans l’afficher'], ['save:copy', 'Copie séparée'], ['-'], ['download:png', 'Télécharger en PNG'], ['download:jpg', 'Télécharger en JPG'], ['-'], ['actions', '⚡ Actions : réglages enregistrés, à refaire sur plusieurs photos…'], ['-'], ['simple', '⚡ Passer à la retouche rapide'], ['close', 'Fermer']]],
            ['Édition', [['undo', '↶ Annuler', '⌘Z'], ['redo', '↷ Rétablir', '⇧⌘Z'], ['tab:history', '🕘 Historique']]],
            ['Image', [['tab:adjust', '🎚 Réglages, niveaux et courbe'], ['preset:0', 'Réglage automatique'], ['mode:crop', '⌗ Recadrer et redresser'], ['straighten:auto', '📐 Redresser automatiquement'], ['cropclear', 'Annuler le recadrage'], ['mode:persp', '⧈ Redresser la perspective (photo prise de biais)…'], ['persp:clear', 'Enlever la perspective'], ['-'],
                ['tab:restore', '🧭 Restaurer une vieille photo (pas à pas)'], ['tab:filters', '🧹 Poussière et rayures (Filtres)'], ['deglare', '🪟 Enlever les reflets (vitre) : calque à part'], ['colorize:auto', '🎨 Coloriser : calque de réglage (dégradé)'], ['colorize:paint', '🖌 Coloriser au pinceau : calque « Couleur »'], ['-'], ['reset', 'Remettre les réglages à zéro']]],
            ['Calque', [['ladd', '＋ Nouveau calque'], ['gadd', '📁 Nouveau groupe'], ['gwrap', 'Grouper le calque choisi', '⌘G'], ['aadd', '🎚 Nouveau calque de réglage'], ['img:place', '🖼️ Placer une image…'], ['sel:copy', 'Copier la sélection sur un calque', '⌘J'], ['-'], ['mask:add', '🎭 Ajouter un masque au calque choisi'], ['mask:hideall', '🎭 Masque qui cache tout (⌥ + clic sur 🎭)'], ['mask:sel', 'Masque d’après la sélection'], ['mask:selhide', 'Masque qui cache la sélection'], ['mask:invert', 'Inverser le masque'], ['mask:del', 'Retirer le masque'], ['-'], ['tab:layers', '🗂 Calques']]],
            ['Sélection', [['sel:subject', '🎯 Sélectionner le sujet (automatique)'], ['-'], ['sel:all', 'Tout sélectionner', '⌘A'], ['sel:none', 'Désélectionner', '⌘D'], ['sel:invert', 'Inverser', '⇧⌘I'], ['-'], ['sel:feather', 'Contour progressif…'], ['sel:grow', 'Agrandir…'], ['sel:shrink', 'Réduire…'], ['-'], ['sel:fill', 'Remplir avec la couleur'], ['sel:clear', 'Effacer (transparent)', '⌫'], ['sel:crop', 'Recadrer sur la sélection']]],
            ['Filtre', [['fx:last', '↻ Refaire le dernier filtre', '⌘F'], ['-'], ...['Flou', 'Bruit', 'Netteté', 'Esthétiques', 'Artistiques', 'Pixellisation', 'Rendu', 'Déformation', 'Autres'].map(cat => ['>', cat, Object.entries(RT_FX).filter(([, f]) => f[0] === cat).map(([k, f]) => ['fx:' + k, f[1] + '…'])]),
                ['-'], ['tab:filters', '✨ Filtres rapides et filtres du calque (panneau)'], ['filters:reset', 'Enlever les filtres rapides']]],
            ['Affichage', [['side:toggle', 'Replier / ouvrir le panneau de droite', 'Tab'], ['-'], ['zoom:in', 'Zoom avant', '+'], ['zoom:out', 'Zoom arrière', '−'], ['zoom:fit', 'Toute l’image', '0'], ['zoom:100', 'Taille réelle', '1']]],
        ];
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-retouch h-rt2'; dlg.dataset.ownClose = '1'; // il demande lui-même avant de fermer
        dlg.innerHTML = `<div class="h-rt-head"><div><span class="eyebrow">RETOUCHE</span><h2>${esc(item.title || item.filename || 'Photo')}</h2></div><nav class="h-rt-menubar">${MENUS.map(([l, items]) => `<details class="h-rt-menu"><summary>${l}</summary><div class="h-rt-menulist">${items.map(([k, t, sc]) => k === '-' ? '<hr>' : k === '>' ? `<div class="h-rt-sub"><button type="button" class="h-rt-subh"><span>${esc(t)}</span><kbd>▸</kbd></button><div class="h-rt-menulist h-rt-sublist">${sc.map(([k2, t2]) => `<button type="button" data-rt-cmd="${k2}"><span>${esc(t2)}</span></button>`).join('')}</div></div>` : `<button type="button" data-rt-cmd="${k}"><span>${esc(t)}</span>${sc ? `<kbd>${sc}</kbd>` : ''}</button>`).join('')}</div></details>`).join('')}</nav><span class="spacer"></span><button type="button" class="button small secondary" data-rt-cmd="simple" title="La retouche rapide (celle de la version 0.5.0) : réglages, courbe, taches, tampon — moins de boutons">⚡ Retouche rapide</button>${ext.tbButton('retouch')}${ext.fullButton('retouch')}<button type="button" class="icon-button" data-rt-close aria-label="Fermer">×</button></div>
            <div class="h-rt-bar" data-tbg="rt-bar" data-tbg-label="Barre du haut (groupes)">
                <span class="h-rt-modes" role="toolbar" data-tb="modes" data-tb-label="Les outils" data-tbg="rt-modes" data-tbg-label="Outils">${TOOLS.map(([k, i, l]) => `<button type="button" class="button small ${k === 'adjust' ? '' : 'secondary'}" data-rt-mode="${k}" title="${esc(l)}">${i} ${esc(l)}</button>`).join('')}</span>
                <span class="h-rt-hist-btns"><button type="button" class="button small secondary" data-rt-undo disabled title="Annuler (⌘Z)">↶</button><button type="button" class="button small secondary" data-rt-redo disabled title="Rétablir (⇧⌘Z)">↷</button></span>
                <span class="h-rt-zoom"><button type="button" class="button small secondary" data-rt-zoom="-1" title="Dézoomer (−)">−</button><output data-rt-zoomout>100 %</output><button type="button" class="button small secondary" data-rt-zoom="1" title="Zoomer (+)">+</button><button type="button" class="button small secondary" data-rt-zoomfit title="Toute l’image (0)">Ajuster</button><button type="button" class="button small secondary" data-rt-zoom100 title="Taille réelle (1)">1:1</button></span>
            </div>
            <div class="h-rt-opts" data-rt-opts hidden data-tbg="rt-opts" data-tbg-label="Options des outils (pinceau, texte…)">
                <label data-o="size">Taille <input type="range" min="1" max="200" value="18" data-rt-size> <output data-rt-size-out>18</output> <small class="muted">[ ]</small></label>
                <label data-o="hard">Dureté <input type="range" min="0" max="100" value="55" data-rt-hard> <output data-rt-hard-out>55 %</output></label>
                <label data-o="opacity">Opacité <input type="range" min="5" max="100" value="100" data-rt-opac> <output data-rt-opac-out>100 %</output></label>
                <label data-o="brush" data-tb-label="Sorte de pinceau">Sorte <select data-rt-brushtype>${RT_BRUSHES.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
                <label data-o="color">Couleur <input type="color" value="#d0021b" data-rt-color></label>
                <span data-o="swatches" class="h-rt-swatches" data-tb-label="Couleurs rapides">${['#d0021b', '#f5a623', '#f8e71c', '#7ed321', '#2a7de1', '#9013fe', '#ffffff', '#000000', '#e2b195', '#c98f78', '#8fb3d9', '#6f8f4e', '#8b5a2b', '#c9a227', '#7a4b6b'].map(c => `<button type="button" style="background:${c}" data-rt-swatch="${c}" aria-label="${c}"></button>`).join('')}</span>
                <label data-o="font" data-tb-label="Police">Police <select data-rt-font>${RT_FONTS.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('')}</select></label>
                <label data-o="font" class="checkbox-line" data-tb-label="Contour du texte"><input type="checkbox" data-rt-halo checked> <span>contour</span></label><input data-o="font" type="color" value="#ffffff" data-rt-halocolor title="Couleur du contour" data-tb-label="Couleur du contour"><label data-o="font" data-tb-label="Épaisseur du contour">épaisseur <input type="range" min="1" max="8" value="1" data-rt-halow></label>
                <label data-o="font" class="checkbox-line" data-tb-label="Ombre du texte"><input type="checkbox" data-rt-shadow> <span>ombre</span></label><input data-o="font" type="color" value="#000000" data-rt-shadowcolor title="Couleur de l’ombre" data-tb-label="Couleur de l’ombre">
                <span data-o="clone" class="h-rt-clone" data-tb-label="Tampon : endroit à recopier, aligné"><button type="button" class="button small" data-rt-pick>🎯 Choisir l’endroit à recopier</button><label class="checkbox-line"><input type="checkbox" data-rt-aligned checked> <span>aligné</span></label></span>
                <label data-o="textstyle" class="checkbox-line" data-tb-label="Texte gras"><input type="checkbox" data-rt-bold> <span><b>Gras</b></span></label><label data-o="textstyle" class="checkbox-line" data-tb-label="Texte italique"><input type="checkbox" data-rt-italic> <span><i>Italique</i></span></label><button type="button" data-o="textstyle" class="button small secondary" data-rt-localfonts data-tb-label="Polices de l’ordi">🖥 Polices de l’ordi</button>
                <label data-o="shape" data-tb-label="Forme (rectangle, ellipse, flèche…)">Forme <select data-rt-shape><option value="rect">Rectangle</option><option value="round">Rectangle arrondi</option><option value="ellipse">Ellipse</option><option value="line">Ligne</option><option value="arrow">Flèche</option></select></label>
                <label data-o="shape" class="checkbox-line" data-tb-label="Forme remplie"><input type="checkbox" data-rt-fillon> <span>remplie</span></label><label data-o="shape" data-tb-label="Couleur de fond des formes">Fond <input type="color" value="#ffffff" data-rt-fill></label>
                <label data-o="wand" data-tb-label="Baguette : tolérance">Tolérance <input type="range" min="1" max="100" value="24" data-rt-tol> <output data-rt-tol-out>24</output></label><label data-o="wand" class="checkbox-line" data-tb-label="Baguette : contiguë"><input type="checkbox" data-rt-contig checked> <span>contiguë</span></label><button type="button" data-o="wand" class="button small" data-rt-cmd="sel:subject" data-tb-label="Sélectionner le sujet" title="Le fond est reconnu sur les bords de la photo ; la tolérance règle jusqu’où il va">🎯 Sujet</button>
                <span data-o="sel" class="h-rt-selops" data-tb-label="Actions de la sélection"><small class="muted">⇧ ajouter · ⌥ enlever</small><button type="button" class="button small secondary" data-rt-cmd="sel:all">Tout</button><button type="button" class="button small secondary" data-rt-cmd="sel:none">Aucune</button><button type="button" class="button small secondary" data-rt-cmd="sel:invert">Inverser</button><button type="button" class="button small secondary" data-rt-cmd="sel:feather">Contour progressif</button><button type="button" class="button small secondary" data-rt-cmd="sel:copy">→ Calque</button><button type="button" class="button small secondary" data-rt-cmd="sel:fill">Remplir</button><button type="button" class="button small secondary" data-rt-cmd="sel:clear">Effacer</button><button type="button" class="button small secondary" data-rt-cmd="mask:sel">Masque</button><button type="button" class="button small secondary" data-rt-cmd="sel:crop">Recadrer</button></span>
                <span data-o="crop" class="h-rt-cropops" data-tb-label="Recadrage : proportions, redresser"><label>Proportions <select data-rt-ratio><option value="">Libres</option><option value="orig">Celles de la photo</option><option value="1">Carré 1:1</option><option value="1.3333">4:3</option><option value="0.75">3:4</option><option value="1.5">3:2</option><option value="0.6667">2:3</option><option value="1.7778">16:9</option><option value="0.7071">A4 portrait</option><option value="1.4142">A4 paysage</option></select></label><label>Redresser <input type="range" min="-45" max="45" step="0.5" value="0" data-rt-angle> <output data-rt-angle-out>0°</output></label><button type="button" class="button small secondary" data-rt-cmd="straighten:auto" title="Trouve l’angle des grandes lignes (horizon, murs, cadres)">📐 Auto</button><button type="button" class="button small" data-rt-cmd="cropok">✓ Valider</button><button type="button" class="button small secondary" data-rt-cmd="cropclear">Annuler le recadrage</button></span>
                <span data-o="persp" class="h-rt-cropops" data-tb-label="Perspective"><small class="muted">Place les 4 coins sur les coins de ce qui doit devenir rectangulaire (la photo, le document, la façade).</small><button type="button" class="button small" data-rt-cmd="persp:ok">✓ Valider</button><button type="button" class="button small secondary" data-rt-cmd="persp:reset">Coins aux bords</button><button type="button" class="button small secondary" data-rt-cmd="persp:cancel">Annuler</button></span>
                <span data-o="maskmode" class="h-rt-maskmode" data-tb-label="Masque : cacher / montrer"><label class="checkbox-line"><input type="radio" name="rt-maskmode" value="hide" checked data-rt-maskmode> <span>⬛ cacher</span></label><label class="checkbox-line"><input type="radio" name="rt-maskmode" value="show" data-rt-maskmode> <span>⬜ montrer</span></label></span>
                <small class="muted" data-rt-paint-help data-tb-label="Aide de l’outil"></small>
            </div>
            <div class="h-rt-main">
                <div class="h-rt-left">
                    <div class="h-rt-stage" data-rt-stage><div class="h-rt-canvaswrap" data-rt-wrap><canvas data-rt-canvas width="${pw}" height="${ph}"></canvas><canvas class="h-rt-overlay" data-rt-overlay width="${pw}" height="${ph}"></canvas><div class="h-rt-crop" data-rt-crop hidden>${['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(h => `<i data-ch="${h}"></i>`).join('')}</div><span class="h-rt-brush" data-rt-brush hidden></span><span class="h-rt-src" data-rt-src hidden></span></div>
                        <button type="button" class="button small secondary h-rt-before" data-rt-before title="Garder appuyé pour voir l’original">👁 Avant / après</button></div>
                    <section class="h-rt-versions" data-rt-versions></section>
                </div>
                <nav class="h-rt-vtools" data-tbg="rt-vtools" data-tbg-label="Colonne d’outils">${VTOOLS.map(([k, i, l]) => `<button type="button" data-rt-mode="${k}" data-rt-v title="${esc(l)}" data-tb-label="${esc(l)}">${i}</button>`).join('')}<span class="h-rt-fg" title="Couleur (pinceau, texte, formes, remplir)" data-tb-label="Couleur"><input type="color" value="#d0021b" data-rt-color2></span></nav>
                <aside class="h-rt-side"><button type="button" class="h-rt-sidetog" data-rt-sidetog title="Replier le panneau (plus de place pour la photo) — Tab">⇥</button><span class="h-rt-resize" data-rt-resize title="Glisser pour élargir ou rétrécir le panneau (double-clic : taille de départ)"></span>
                    <div class="h-rt-tabs"><button type="button" class="is-active" data-rt-tab="adjust">🎚 Réglages</button><button type="button" data-rt-tab="filters">✨ Filtres</button><button type="button" data-rt-tab="layers">🗂 Calques</button><button type="button" data-rt-tab="history">🕘 Historique</button><button type="button" data-rt-tab="restore" title="Restaurer une vieille photo, pas à pas">🧭 Restaurer</button></div>
                    <div class="h-rt-tools" data-rt-pane="adjust" data-tbg="rt-adjust" data-tbg-label="Panneau Réglages"><div class="h-rt-target" data-rt-target></div><div class="h-rt-presets" data-tb-label="Préréglages">${RT_PRESETS.map(([l], i) => `<button type="button" class="button small secondary" data-rt-preset="${i}">${esc(l)}</button>`).join('')}</div>
                        ${RT_SLIDERS.map(([k, l, mn, mx]) => `<label class="h-rt-slider"><span>${esc(l)} <output data-rt-out="${k}">0</output></span><input type="range" min="${mn}" max="${mx}" value="0" data-rt="${k}"></label>`).join('')}
                        <details class="h-rt-levels"><summary><strong>Niveaux</strong> <small class="muted">point noir, tons moyens, point blanc</small></summary>${RT_LEVELS.map(([k, l, mn, mx, dv]) => `<label class="h-rt-slider"><span>${esc(l)} <output data-rt-out="${k}">${dv}</output></span><input type="range" min="${mn}" max="${mx}" value="${dv}" data-rt="${k}"></label>`).join('')}<button type="button" class="link-button" data-rt-lvlauto>Niveaux automatiques</button></details>
                        <details class="h-rt-levels"><summary><strong>🎨 Colorisation douce</strong> <small class="muted">pour une photo en noir et blanc</small></summary><label>Couleurs <select data-rt-gmap>${Object.entries(RT_GMAPS).map(([k, [l]]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label><label class="h-rt-slider"><span>Force <output data-rt-out="gmap_amt">70</output></span><input type="range" min="0" max="100" value="70" data-rt="gmap_amt"></label><p class="muted">Mieux dans un calque de réglage (Image → Coloriser) : on le dose, on le masque, on l’enlève. Pour colorier à la main : Image → Coloriser au pinceau.</p></details>
                        <div class="h-rt-toggles"><label class="checkbox-line"><input type="checkbox" data-rt-t="bw"> Noir et blanc</label><label class="checkbox-line"><input type="checkbox" data-rt-t="sepia"> Sépia</label><label class="checkbox-line"><input type="checkbox" data-rt-t="invert"> Négatif</label></div>
                        <div class="h-rt-curve-head"><strong>Courbe</strong><span>${RT_CHANNELS.map(([k, l]) => `<button type="button" class="h-rt-ch ${k === 'rgb' ? 'is-active' : ''}" data-rt-ch="${k}">${l}</button>`).join('')}</span></div>
                        <svg class="h-rt-curve" viewBox="-6 -6 268 268" data-rt-curve><path class="h-rt-hist" d="${histPath}"/><g class="h-rt-grid">${[64, 128, 192].map(v => `<line x1="${v}" y1="0" x2="${v}" y2="256"/><line x1="0" y1="${v}" x2="256" y2="${v}"/>`).join('')}<line x1="0" y1="256" x2="256" y2="0" class="h-rt-diag"/></g><path class="h-rt-line" data-rt-line/><g data-rt-points></g></svg>
                        <div class="h-rt-curve-tools"><button type="button" class="button small secondary" data-rt-ptdel disabled>Enlever le point</button></div>
                        <p class="muted h-rt-help">Clic sur la courbe : ajouter un point · glisser : le déplacer · pour l’enlever : le choisir puis « Enlever le point » (ou ⌫), ou le glisser hors du cadre.</p>
                        <button type="button" class="link-button" data-rt-reset>Remettre les réglages à zéro</button></div>
                    <div class="h-rt-tools" data-rt-pane="filters" hidden><div class="h-rt-target" data-rt-target></div><div data-rt-fxlist></div><p class="muted">Filtres rapides, après les réglages : sur la photo, ou dans un calque de réglage (sur tout ce qui est dessous, ou seulement le calque juste dessous). Les mêmes sur l’image enregistrée en pleine taille.</p>${RT_FILTERS.map(([k, l, mn, mx]) => `<label class="h-rt-slider"><span>${esc(l)} <output data-rt-fout="${k}">0</output></span><input type="range" min="${mn}" max="${mx}" value="0" data-rt-f="${k}"></label>`).join('')}<button type="button" class="link-button" data-rt-cmd="filters:reset">Enlever les filtres</button></div>
                    <div class="h-rt-tools" data-rt-pane="layers" hidden></div>
                    <div class="h-rt-tools" data-rt-pane="history" hidden></div>
                    <div class="h-rt-tools h-rt-restore" data-rt-pane="restore" hidden>${RT_RESTORE_STEPS.map(([k, t, help, btns], i) => `<details class="h-rt-step" data-rt-step="${k}" ${i === 0 ? 'open' : ''}><summary><span class="h-rt-stepn">${i + 1}</span> ${t} <i class="h-rt-stepok" hidden>✓</i></summary><p class="muted">${help}</p><div class="h-rt-stepbtns">${btns}</div></details>`).join('')}
                        <p class="muted h-rt-help">Chaque étape est facultative et se défait (↶). Rien n’abîme l’original : la photo restaurée devient une nouvelle version.</p></div>
                </aside>
            </div>
            <div class="modal-actions"><button type="button" class="button small secondary" data-rt-projopen title="Rouvrir un travail de retouche enregistré">📂 Projets…</button><button type="button" class="button small secondary" data-rt-projsave title="Garde tout le travail (calques, groupes, masques, réglages…) pour le rouvrir et continuer (⌘S)">💾 Enregistrer le projet</button><span class="h-rt-projname" data-rt-projname></span><label class="checkbox-line h-rt-merge" data-rt-mergebox hidden><input type="checkbox" data-rt-merge checked> <span>avec les annotations (calques visibles)</span></label><span class="spacer"></span><button type="button" class="button secondary" data-rt-close>Annuler</button><button type="button" class="button secondary" data-rt-save="copy" title="Un autre média, rattaché aux mêmes fiches">Copie séparée</button><button type="button" class="button secondary" data-rt-save="keep" title="Gardée dans les versions, la photo affichée ne change pas">Enregistrer sans l’afficher</button><button type="button" class="button" data-rt-save="show">Enregistrer et afficher cette version</button></div>
            <p class="muted h-rt-note">L’original n’est jamais modifié : chaque retouche est une version de la photo, et tu choisis celle qui s’affiche partout.</p>`;
        document.body.appendChild(dlg);
        ext.tbApply(dlg, 'retouch');
        ext.editorKeysAttach?.(dlg, 'retouch'); // ⌨️ raccourcis à soi // boutons rangés à sa façon (⚙️ Personnaliser)
        // une image partie de zéro (canevas vide) ou importée : pas de « version » d'une photo de la base, juste l'image à enregistrer
        const fresh = !!(item.fresh || project?.project?.fresh);
        if (fresh) {
            dlg.querySelectorAll('[data-rt-save="copy"], [data-rt-save="keep"], [data-rt-cmd="save:copy"], [data-rt-cmd="save:keep"]').forEach(b => { b.style.display = 'none'; });
            const sh = dlg.querySelector('.modal-actions [data-rt-save="show"]'); if (sh) { sh.textContent = '🖼 Enregistrer l’image dans les Médias'; sh.title = 'L’image (calques compris) remplace celle du média ; le projet, lui, garde tous les calques pour continuer'; }
            const ms = dlg.querySelector('[data-rt-cmd="save:show"] span'); if (ms) ms.textContent = '🖼 Enregistrer l’image dans les Médias';
            sh?.insertAdjacentHTML('beforebegin', '<button type="button" class="button secondary" data-rt-cmd="download:png" title="L’image sur l’ordinateur (PNG)">⬇ Télécharger</button>');
            dlg.querySelector('.h-rt-note')?.remove();
        }
        try { const rl = JSON.parse(localStorage.getItem('genealogie-retouch-layout') || '{}') || {}; if (['left', 'right'].includes(rl.tools)) dlg.classList.add('rt-tools-' + rl.tools); if (rl.side === 'left') dlg.classList.add('rt-side-left'); } catch (_) {} // Maintenance → Montage, retouche, mise en page et son
        ext.fullInit(dlg, 'retouch');
        const $ = q => dlg.querySelector(q), $$ = q => [...dlg.querySelectorAll(q)];
        const canvas = $('[data-rt-canvas]'), ctx = canvas.getContext('2d'), out = ctx.createImageData(pw, ph);
        const overlay = $('[data-rt-overlay]'), octx = overlay.getContext('2d'), cropEl = $('[data-rt-crop]');
        const stage = $('[data-rt-stage]'), wrap = $('[data-rt-wrap]');
        let raf = 0, showBefore = false, selPt = -1, outside = -1;
        const baseData = new ImageData(new Uint8ClampedArray(srcData.data), pw, ph); // l'image d'origine (avant / après, annuler)
        // la perspective redressée : l'image de départ remise à plat (gardée tant que les 4 coins ne changent pas)
        let persp = null, warpCache = {key: '', data: null};
        const baseFor = () => { if (!st.persp) return baseData; const key = JSON.stringify(st.persp); if (warpCache.key !== key) warpCache = {key, data: rtWarp(baseData, st.persp)}; return warpCache.data; };
        const applyBase = () => { srcData.data.set(baseFor().data); if (st.strokes.length) rtReplayStrokes(srcData, st.strokes, masks); strokeVer++; photoKey = ''; draw(); };
        // ── Masques (sélections) : des toiles pw × ph jamais modifiées une fois créées, rangées par numéro (l'historique les garde) ──
        const masks = new Map(); let maskSeq = 0;
        const addMask = c => { const id = 'k' + (++maskSeq); masks.set(id, c); return id; };
        const blankMask = () => { const c = document.createElement('canvas'); c.width = pw; c.height = ph; return c; };
        let selId = null; // la sélection en cours (ou aucune)
        // ── Calques : la photo (réglages, taches, tampon) tout en bas, puis un arbre (du bas vers le haut) de calques,
        //    de groupes (qui peuvent contenir d'autres groupes) et de calques de réglage (réglages et filtres) ──
        st.strokes = [];
        let layers = [], activeLayer = '', layerSeq = 0, maskEdit = ''; let maskShow = null; // maskShow : ⌥ + clic ou \\ pour voir le masque ; maskEdit : le calque (ou 'photo') dont on peint le masque
        const nid = p => p + (++layerSeq) + Date.now().toString(36);
        const typeOf = n => n?.type || 'layer';
        const walk = (arr, fn, parent = null) => arr.forEach(n => { fn(n, arr, parent); if (typeOf(n) === 'group') walk(n.children, fn, n); });
        const nodeById = id => { let r = null; if (id) walk(layers, n => { if (n.id === id) r = n; }); return r; };
        const locate = id => { let r = null; walk(layers, (n, arr, parent) => { if (n.id === id) r = {n, arr, parent}; }); return r; };
        const drawLayers = () => { const out = []; walk(layers, n => { if (typeOf(n) === 'layer') out.push(n); }); return out; };
        // les calques qu'on peut toucher (visibles et non verrouillés, groupes compris), du haut vers le bas
        const hitList = () => { const out = []; const rec = (arr, vis, lk) => arr.forEach(n => { const v = vis && n.visible, l2 = lk || n.locked; if (typeOf(n) === 'group') rec(n.children, v, l2); else if (typeOf(n) === 'layer' && v && !l2) out.push(n); }); rec(layers, true, false); return out.reverse(); };
        const lockedDeep = n => { if (!n) return false; if (n.locked) return true; let p = locate(n.id)?.parent; while (p) { if (p.locked) return true; p = locate(p.id)?.parent; } return false; }; // verrouillé, lui ou un de ses groupes
        const layerCanvases = new Map();
        const layerCanvas = l => { let c = layerCanvases.get(l.id); if (!c) { c = document.createElement('canvas'); c.width = pw; c.height = ph; layerCanvases.set(l.id, c); } return c; };
        // un nouvel élément se range au-dessus du calque choisi (ou dans le groupe choisi)
        const insertNode = n => {
            const a = locate(activeLayer);
            if (a && typeOf(a.n) === 'group' && a.n.open !== false) a.n.children.push(n);
            else if (a) a.arr.splice(a.arr.indexOf(a.n) + 1, 0, n);
            else layers.push(n);
            activeLayer = n.id; return n;
        };
        const newLayer = name => insertNode({id: nid('l'), type: 'layer', name: name || `Calque ${drawLayers().length + 1}`, visible: true, opacity: 1, locked: false, ops: [], mask: null});
        const newGroup = name => insertNode({id: nid('g'), type: 'group', name: name || `Groupe ${(() => { let k = 0; walk(layers, n => { if (typeOf(n) === 'group') k++; }); return k + 1; })()}`, visible: true, opacity: 1, locked: false, mask: null, open: true, children: []});
        const adjDefault = () => { const d = rtDefault(); delete d.crop; delete d.persp; return d; };
        const newAdjust = name => insertNode({id: nid('a'), type: 'adjust', name: name || 'Réglages', visible: true, opacity: 1, mask: null, clip: false, st: adjDefault()});
        // la photo est un calque comme les autres, dans l'arbre : visibilité, opacité, masque, verrou, nom, groupes, glisser-déposer
        const mkPhoto = (o = {}) => ({name: 'Photo', visible: true, opacity: 1, mask: null, locked: false, ...o, id: 'photo', type: 'photo'});
        const P = () => nodeById('photo');
        layers.push(mkPhoto());
        const photoCanvas = document.createElement('canvas'); photoCanvas.width = pw; photoCanvas.height = ph; const pctx = photoCanvas.getContext('2d');
        const env = () => ({masks, photo: photoCanvas});
        let strokeVer = 0, photoKey = '';
        const hasPixels = l => (l.ops || []).some(o => o.type === 'pixels');
        const renderLayer = l => { if (typeOf(l) === 'layer') rtDrawLayer(layerCanvas(l), l, env()); };
        // la photo n'est recalculée que si ses réglages ou ses corrections ont changé
        const photo = () => { const k = strokeVer + '|' + JSON.stringify({...st, strokes: 0}); if (k !== photoKey) { photoKey = k; pctx.putImageData(rtApply(srcData, out, st), 0, 0); drawLayers().forEach(l => { if (hasPixels(l)) renderLayer(l); }); } return photoCanvas; };
        // les réglages (et filtres) que montrent les onglets Réglages et Filtres : ceux du calque de réglage choisi, sinon ceux de la photo
        const adjNode = () => { const n = nodeById(activeLayer); return typeOf(n) === 'adjust' ? n : null; };
        const T = () => adjNode()?.st || st;
        const blank = (W, H) => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
        /** Un calque de réglage appliqué à une image (son masque et son opacité dosent l'effet ; la transparence est gardée) */
        const adjCache = new Map(); // un filtre lourd n'est recalculé que si ses réglages ou ce qui est dessous ont changé
        function applyAdjust(src, n, W, H) {
            const g0 = src.getContext('2d', {willReadFrequently: true}), id = g0.getImageData(0, 0, W, H);
            const heavy = W === pw && H === ph && (n.st.filters?.chain?.length || n.st.filters?.deglare || n.st.filters?.dust); // seulement l'aperçu ; jamais en pleine taille
            let key = '';
            if (heavy) { const u = new Uint32Array(id.data.buffer, id.data.byteOffset, id.data.byteLength >> 2); let h1 = 2166136261, h2 = 0; for (let i = 0; i < u.length; i++) { h1 = Math.imul(h1 ^ u[i], 16777619); h2 = (h2 + u[i] * (i + 1)) >>> 0; } key = JSON.stringify(n.st) + '|' + (h1 >>> 0) + ':' + h2; } // tous les points comptent
            const hit = heavy ? adjCache.get(n.id) : null;
            let o; if (hit?.key === key) o = hit.o; else { o = new ImageData(W, H); rtApply(id, o, n.st); if (heavy) adjCache.set(n.id, {key, o}); }
            const adj = blank(W, H); adj.getContext('2d').putImageData(o, 0, 0);
            const res = blank(W, H), g = res.getContext('2d'); g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = n.opacity ?? 1; g.drawImage(rtMasked(adj, n.maskOff ? null : n.mask, masks), 0, 0); return res;
        }
        /** Une pile (du bas vers le haut) : calques, groupes (rendus à part, puis posés) et réglages. Un réglage « juste dessous »
            (clip) ne touche que l'élément qui est sous lui ; sinon il touche tout ce qui est dessous dans la même pile. */
        function renderStack(arr, base, R) {
            let acc = base || blank(R.W, R.H), i = 0;
            while (i < arr.length) {
                const n = arr[i];
                if (!n.visible) { i++; continue; }
                if (typeOf(n) === 'adjust') { acc = applyAdjust(acc, n, R.W, R.H); i++; continue; }
                let own = typeOf(n) === 'group' ? renderStack(n.children, null, R) : R.layer(n), j = i + 1;
                while (j < arr.length && typeOf(arr[j]) === 'adjust' && arr[j].clip) { if (arr[j].visible) own = applyAdjust(own, arr[j], R.W, R.H); j++; }
                own = rtMasked(own, R.mask(n), masks);
                const g = acc.getContext('2d'); g.globalAlpha = n.opacity ?? 1; g.globalCompositeOperation = rtBlend(n); g.drawImage(own, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
                i = j;
            }
            return acc;
        }
        const draw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
            if (showBefore) { ctx.putImageData(baseData, 0, 0); return; }
            ctx.clearRect(0, 0, pw, ph);
            const pc = photo();
            const R = {W: pw, H: ph,
                layer: l => { if (typeOf(l) === 'photo') return pc; const src = layerCanvas(l); if (!(painting?.preview && painting.layer === l && !painting.mask)) return src; const t = blank(pw, ph), g = t.getContext('2d'); g.drawImage(src, 0, 0); rtDrawOp(g, painting.preview, pw, ph, env()); return t; },
                mask: n => painting?.mask && painting.layer === n ? [...(n.mask || []), painting.preview] : n.maskOff ? null : n.mask};
            ctx.drawImage(renderStack(layers, null, R), 0, 0);
            const mn = maskShow && nodeById(maskShow.id); if (mn?.mask) { // ⌥ + clic : le masque seul ; \ : le masque en rouge (rubylith)
                const white = blank(pw, ph), wg = white.getContext('2d'); wg.fillStyle = '#fff'; wg.fillRect(0, 0, pw, ph); const shown = rtMasked(white, R.mask(mn) || mn.mask, masks);
                if (maskShow.mode === 'alone') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, pw, ph); ctx.drawImage(shown, 0, 0); }
                else { const red = blank(pw, ph), rg = red.getContext('2d'); rg.fillStyle = 'rgba(255,0,0,.5)'; rg.fillRect(0, 0, pw, ph); rg.globalCompositeOperation = 'destination-out'; rg.drawImage(shown, 0, 0); ctx.drawImage(red, 0, 0); } }
            else if (maskShow) maskShow = null;
            if (painting?.patch) { ctx.save(); ctx.drawImage((() => { const t = blank(pw, ph), g = t.getContext('2d'); g.drawImage(pc, 0, 0); g.globalCompositeOperation = 'destination-in'; g.drawImage(masks.get(painting.patch.mask), 0, 0); return t; })(), painting.patch.dx * pw, painting.patch.dy * ph); ctx.restore(); }
            drawOverlay();
        }); };
        // ── Ce qui se dessine par-dessus : la sélection (le reste assombri), le recadrage, l'élément choisi, le tracé en cours ──
        let moveSel = null; // l'élément choisi avec ➤ : {layer, i}
        function drawOverlay() {
            octx.clearRect(0, 0, pw, ph);
            const m = selId && masks.get(selId);
            if (m) {
                octx.save(); octx.fillStyle = 'rgba(10,20,40,.38)'; octx.fillRect(0, 0, pw, ph); octx.globalCompositeOperation = 'destination-out'; octx.drawImage(m, 0, 0); octx.restore();
                // un liseré autour de la sélection
                octx.save(); const e = document.createElement('canvas'); e.width = pw; e.height = ph; const eg = e.getContext('2d'); const lw = Math.max(1, pw / 700);
                eg.drawImage(m, -lw, 0); eg.drawImage(m, lw, 0); eg.drawImage(m, 0, -lw); eg.drawImage(m, 0, lw); eg.globalCompositeOperation = 'destination-out'; eg.drawImage(m, 0, 0); eg.globalCompositeOperation = 'source-in'; eg.fillStyle = '#2a7de1'; eg.fillRect(0, 0, pw, ph);
                octx.drawImage(e, 0, 0); octx.restore();
            }
            if (st.crop && mode !== 'crop') { // la zone gardée (tournée si l'image est redressée), le reste assombri
                octx.save(); octx.fillStyle = 'rgba(0,0,0,.5)'; octx.fillRect(0, 0, pw, ph); octx.globalCompositeOperation = 'destination-out';
                octx.translate(pw / 2, ph / 2); octx.rotate(-st.crop.a * Math.PI / 180); octx.translate(-pw / 2, -ph / 2); octx.fillRect(st.crop.x * pw, st.crop.y * ph, st.crop.w * pw, st.crop.h * ph); octx.restore();
            }
            if (drag?.sel) { const d = drag; octx.save(); octx.strokeStyle = '#2a7de1'; octx.lineWidth = Math.max(1, pw / 600); octx.setLineDash([6, 4]); octx.beginPath(); selPath(octx, d.sel); octx.stroke(); octx.restore(); }
            if (mode === 'persp' && persp) { // les 4 coins de la perspective et une grille pour viser
                octx.save(); const P4 = persp.map(([x, y]) => [x * pw, y * ph]), lw = Math.max(1, pw / 600), k = handleSize();
                octx.strokeStyle = 'rgba(255,255,255,.9)'; octx.lineWidth = lw * 2; octx.beginPath(); P4.forEach(([x, y], i) => i ? octx.lineTo(x, y) : octx.moveTo(x, y)); octx.closePath(); octx.stroke();
                octx.strokeStyle = '#2a7de1'; octx.lineWidth = lw; octx.stroke();
                const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; octx.setLineDash([4, 4]);
                for (const t of [1 / 3, 2 / 3]) { octx.beginPath(); octx.moveTo(...lerp(P4[0], P4[1], t)); octx.lineTo(...lerp(P4[3], P4[2], t)); octx.moveTo(...lerp(P4[0], P4[3], t)); octx.lineTo(...lerp(P4[1], P4[2], t)); octx.stroke(); }
                octx.setLineDash([]); octx.fillStyle = '#fff'; P4.forEach(([x, y]) => { octx.beginPath(); octx.arc(x, y, k * 1.4, 0, Math.PI * 2); octx.fill(); octx.stroke(); }); octx.restore();
            }
            if (poly?.length) { octx.save(); octx.strokeStyle = '#2a7de1'; octx.fillStyle = '#fff'; octx.lineWidth = Math.max(1, pw / 600); octx.beginPath(); poly.forEach(([x, y], i) => i ? octx.lineTo(x, y) : octx.moveTo(x, y)); if (polyHover) octx.lineTo(...polyHover); octx.stroke(); poly.forEach(([x, y]) => { octx.fillRect(x - 3, y - 3, 6, 6); octx.strokeRect(x - 3, y - 3, 6, 6); }); octx.restore(); }
            if (moveSel && mode === 'move') { const l = nodeById(moveSel.layer), op = l?.ops[moveSel.i], bb = op && opBox(op); if (bb) { octx.save(); octx.strokeStyle = '#2a7de1'; octx.lineWidth = Math.max(1, pw / 700); octx.setLineDash([5, 4]);
                if (op.type === 'image') { // une image placée : son cadre (tourné), 4 poignées pour la taille, une ronde pour la faire pivoter
                    const hs = imgHandles(op), k = handleSize(); octx.beginPath(); hs.corners.forEach(([x, y], i) => i ? octx.lineTo(x, y) : octx.moveTo(x, y)); octx.closePath(); octx.stroke(); octx.setLineDash([]); octx.fillStyle = '#fff';
                    octx.beginPath(); octx.moveTo(...hs.topMid); octx.lineTo(...hs.rot); octx.stroke();
                    hs.corners.forEach(([x, y]) => { octx.fillRect(x - k, y - k, k * 2, k * 2); octx.strokeRect(x - k, y - k, k * 2, k * 2); });
                    octx.beginPath(); octx.arc(hs.rot[0], hs.rot[1], k * 1.1, 0, Math.PI * 2); octx.fill(); octx.stroke();
                } else octx.strokeRect(bb.x * pw - 4, bb.y * ph - 4, bb.w * pw + 8, bb.h * ph + 8);
                octx.restore(); } }
        }
        // ── Historique : chaque geste ou réglage est une étape ; un clic sur une étape y revient ──
        let history = [], hpos = -1;
        const snapshot = () => ({st: rtClone({...st, strokes: undefined, persp: st.persp ?? st._persp0 ?? null, _persp0: undefined}), strokes: rtClone(st.strokes), layers: rtClone(layers), activeLayer, selId});
        const commit = label => {
            const snap = snapshot();
            if (hpos >= 0 && JSON.stringify(history[hpos].snap) === JSON.stringify(snap)) return; // rien n'a changé
            history = history.slice(0, hpos + 1); history.push({label, at: new Date(), snap}); if (history.length > 200) history.shift(); hpos = history.length - 1;
            refreshHistory();
        };
        const restore = i => {
            dlg.querySelector('.h-rt-fxpanel')?.remove(); // une fenêtre de filtre ouverte ne vise plus le bon calque
            const s = history[i]?.snap; if (!s) return;
            Object.keys(st).forEach(k => { if (k !== 'strokes') delete st[k]; }); Object.assign(st, rtClone(s.st));
            st.strokes = rtClone(s.strokes);
            srcData.data.set(baseFor().data); if (st.strokes.length) rtReplayStrokes(srcData, st.strokes, masks); strokeVer++;
            layers = rtClone(s.layers); activeLayer = s.activeLayer === 'photo' ? '' : s.activeLayer; selId = s.selId; moveSel = null;
            if (s.photoL && !nodeById('photo')) layers.unshift(mkPhoto(s.photoL)); // un projet d'avant : la photo hors de l'arbre
            if (maskEdit && !nodeById(maskEdit)?.mask) maskEdit = '';
            photoKey = ''; photo(); layerCanvases.clear(); drawLayers().forEach(renderLayer);
            hpos = i; syncControls(); refreshLayers(); refreshHistory(); syncCrop();
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
        // ── Calques : un arbre (calques, groupes de groupes, réglages), visibilité, opacité, verrou, nom, masque ──
        const thumbOf = (c, maskOps) => { const t = document.createElement('canvas'); t.width = 44; t.height = Math.max(1, Math.round(44 * ph / pw)); const g = t.getContext('2d'); if (maskOps) { g.fillStyle = '#111'; g.fillRect(0, 0, t.width, t.height); g.globalCompositeOperation = 'destination-out'; g.drawImage(rtRenderMask(maskOps, pw, ph, masks), 0, 0, t.width, t.height); g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, t.width, t.height); } /* comme Photoshop : blanc = montré, noir = caché */ else g.drawImage(c, 0, 0, t.width, t.height); return t.toDataURL(); };
        const maskBtns = (id, m) => m ? `<button type="button" class="h-rt-mthumb${maskEdit === id ? ' is-on' : ''}${nodeById(id)?.maskOff ? ' is-maskoff' : ''}${maskShow?.id === id ? ' is-shown' : ''}" data-rt-medit title="${maskEdit === id ? 'Tu peins le masque (pinceau : ⬛ cacher / ⬜ montrer). Clic : revenir au calque' : 'Masque : clic pour le peindre au pinceau'} · ⇧ Maj + clic : désactiver / réactiver le masque · ⌥ Alt + clic : voir le masque seul · touche \\ : le masque en rouge par-dessus"><img src="${thumbOf(null, m)}" alt="masque"></button>` : `<button type="button" class="icon-button small" data-rt-madd title="Ajouter un masque (cacher une partie sans l’effacer) — ⌥ / Alt + clic : un masque qui cache tout (ou cache la sélection)">🎭</button>`;
        const groupsList = (except = null) => { const out = []; const rec = (arr, depth, banned) => arr.forEach(n => { if (typeOf(n) !== 'group') return; const ban = banned || n === except; if (!ban) out.push([n, depth]); rec(n.children, depth + 1, ban); }); rec(layers, 0, false); return out; };
        const ICON = {layer: '🖌', group: '📁', adjust: '🎚', photo: '🖼'};
        function rowHtml(n, depth) {
            const t = typeOf(n), mops = n.mask ? `<span class="h-rt-mops"><button type="button" class="link-button" data-rt-minv>inverser le masque</button><button type="button" class="link-button" data-rt-mdel>retirer le masque</button></span>` : '';
            const loc = locate(n.id), parentId = loc?.parent?.id || '';
            const into = `<label class="h-rt-lpar" title="Ranger dans un groupe">📁 <select data-rt-lpar><option value="">(hors groupe)</option>${groupsList(n).map(([g, d]) => `<option value="${g.id}" ${g.id === parentId ? 'selected' : ''}>${'  '.repeat(d)}${esc(g.name)}</option>`).join('')}</select></label>`;
            // écrêtage façon Photoshop : le réglage « seulement dessous » est décalé, avec une flèche vers l'élément qu'il touche (souligné)
            const ix = loc ? loc.arr.indexOf(n) : -1, clipped = t === 'adjust' && n.clip, base = t !== 'adjust' && ix >= 0 && typeOf(loc.arr[ix + 1] || {}) === 'adjust' && loc.arr[ix + 1].clip;
            const clipBase = clipped ? loc.arr.slice(0, ix).reverse().find(x => !(typeOf(x) === 'adjust' && x.clip)) : null;
            const head = `<li class="h-rt-node is-${t}${(t === 'photo' ? !activeLayer : n.id === activeLayer) ? ' is-active' : ''}${n.visible ? '' : ' is-off'}${clipped ? ' is-clipped' : ''}${base ? ' is-clipbase' : ''}" data-rt-l="${n.id}" style="--d:${depth}">
                ${clipped ? `<span class="h-rt-cliparrow" title="Masque d’écrêtage : ne touche que ${clipBase ? `« ${esc(clipBase.name)} »` : 'l’élément'} juste dessous (⌥ Alt + clic entre deux calques dans Photoshop)"><svg viewBox="0 0 14 16" width="12" height="14" aria-hidden="true"><path d="M3 1v9h7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 7l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.6" transform="rotate(90 10 10)"/></svg></span>` : ''}
                <span class="h-rt-grip" draggable="true" data-rt-grip title="Glisser pour ranger : au-dessus, en dessous, ou dans un groupe (lâcher au milieu d’un groupe)">⠿</span>
                ${t === 'group' ? `<button type="button" class="h-rt-gtog" data-rt-gopen title="${n.open !== false ? 'Replier' : 'Déplier'}">${n.open !== false ? '▾' : '▸'}</button>` : '<span class="h-rt-gtog"></span>'}
                <button type="button" class="h-rt-eye" data-rt-lvis title="${n.visible ? 'Masquer' : 'Montrer'}">${n.visible ? '👁' : '◌'}</button>
                ${t === 'photo' ? `<img class="h-rt-pthumb" src="${thumbOf(photoCanvas)}" alt="">` : ''}<span class="h-rt-lico" title="${{layer: 'Calque', group: 'Groupe', adjust: 'Calque de réglage', photo: 'La photo (réglages, taches, tampon)'}[t]}">${ICON[t]}</span>
                <input value="${esc(n.name)}" data-rt-lname aria-label="Nom">
                ${maskBtns(n.id, n.mask)}
                ${t !== 'adjust' ? `<button type="button" class="h-rt-eye" data-rt-llock title="${n.locked ? 'Déverrouiller' : 'Verrouiller'}">${n.locked ? '🔒' : '🔓'}</button>` : ''}
                <span class="h-rt-lmoves"><button type="button" class="icon-button small" data-rt-lmove="1" title="Monter">↑</button><button type="button" class="icon-button small" data-rt-lmove="-1" title="Descendre">↓</button>${t !== 'group' ? '<button type="button" class="icon-button small" data-rt-ldup title="Dupliquer">⧉</button>' : ''}<button type="button" class="icon-button small" data-rt-ldel title="${t === 'group' ? 'Supprimer le groupe (ce qu’il contient reste)' : t === 'photo' ? 'Retirer la photo des calques (⌘Z pour la remettre)' : 'Supprimer'}">✕</button></span>
                <div class="h-rt-lmore">${t !== 'adjust' ? `<label class="h-rt-lblend" title="Mode de fusion : comment le calque se mélange à ce qui est dessous">Fusion <select data-rt-lblend>${RT_BLENDS.map(([v, l]) => `<option value="${v}" ${rtBlend(n) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}<label class="h-rt-lopac">Opacité <input type="range" min="0" max="100" value="${Math.round((n.opacity ?? 1) * 100)}" data-rt-lopac></label>${into}</div>
                ${t === 'adjust' ? `<div class="h-rt-adjrow"><label class="checkbox-line" title="Comme un masque d’écrêtage de Photoshop"><input type="checkbox" data-rt-lclip ${n.clip ? 'checked' : ''}> <span>seulement sur ${(() => { const i = loc.arr.indexOf(n), below = loc.arr.slice(0, i).reverse().find(x => !(typeOf(x) === 'adjust' && x.clip)); return below ? `« ${esc(below.name)} »` : 'ce qui est juste dessous'; })()}</span></label><button type="button" class="link-button" data-rt-ladj>régler…</button></div><small class="muted">${n.clip ? 'ne touche que l’élément juste dessous' : loc.parent ? `touche tout ce qui est dessous dans « ${esc(loc.parent.name)} »` : 'touche tout ce qui est dessous'}</small>`
                : t === 'photo' ? `<small class="muted">réglages, ${st.strokes.length} correction${st.strokes.length > 1 ? 's' : ''}</small>`
                : t === 'group' ? `<small class="muted">${n.children.length} élément${n.children.length > 1 ? 's' : ''}</small>` : `<small class="muted">${n.ops.length} élément${n.ops.length > 1 ? 's' : ''}</small>${n.ops.length ? '<button type="button" class="link-button" data-rt-lclear>vider</button>' : ''}`}
                ${mops}</li>`;
            return head + (t === 'group' && n.open !== false ? (n.children.length ? [...n.children].reverse().map(c => rowHtml(c, depth + 1)).join('') : `<li class="h-rt-gempty" data-rt-gin="${n.id}" style="--d:${depth + 1}">groupe vide : glisse un calque ici (⠿), ou range-le avec 📁</li>`) : '');
        }
        function refreshLayers() {
            const pane = $('[data-rt-pane="layers"]');
            pane.dataset.dndOff = '';
            pane.innerHTML = `<p class="muted">Le pinceau, les formes et le texte vont sur le calque choisi (en bleu). 📁 un groupe peut contenir des calques et d’autres groupes ; 🎚 un calque de réglage applique réglages et filtres à ce qui est dessous (ou seulement à l’élément juste dessous). 🎭 un masque cache sans effacer.</p>
                <div class="h-rt-lbar"><button type="button" class="button small" data-rt-ladd>＋ Calque</button><button type="button" class="button small secondary" data-rt-gadd title="Un groupe vide au-dessus du calque choisi">＋ Groupe</button><button type="button" class="button small secondary" data-rt-aadd title="Réglages et filtres dans un calque">＋ Réglage</button>${!P() ? '<button type="button" class="button small secondary" data-rt-padd title="La photo a été retirée des calques : la remettre tout en bas">↺ Remettre la photo</button>' : ''}${nodeById(activeLayer) || P() ? '<button type="button" class="button small secondary" data-rt-gwrap title="Met le calque choisi dans un nouveau groupe (⌘G)">Grouper</button>' : ''}${selId ? '<button type="button" class="button small secondary" data-rt-cmd="sel:copy">Sélection → calque</button>' : ''}</div>
                <ol class="h-rt-layers h-rt-tree">${[...layers].reverse().map(n => rowHtml(n, 0)).join('')}${layers.length ? '' : '<li class="muted">Aucun calque.</li>'}</ol>`;
            $('[data-rt-mergebox]').hidden = !drawLayers().some(l => l.ops.length) && !layers.some(n => !['layer', 'photo'].includes(typeOf(n))) && layers[0] === P();
            syncTarget();
        }
        const target = id => nodeById(id);
        const addMaskTo = (id, ops) => { const t = target(id); if (!t) return; t.mask = ops; maskEdit = id; if (id !== 'photo') renderLayer(t); refreshLayers(); draw(); };
        const groupWrap = () => { const a = locate(activeLayer || 'photo'); if (!a) return toast('Choisis d’abord un calque.', 'error'); const g = {id: nid('g'), type: 'group', name: `Groupe ${groupsList().length + 1}`, visible: true, opacity: 1, locked: false, mask: null, open: true, children: [a.n]}; a.arr.splice(a.arr.indexOf(a.n), 1, g); activeLayer = g.id; refreshLayers(); draw(); commit(`« ${a.n.name} » mis dans un groupe`); };
        const paneLayers = $('[data-rt-pane="layers"]');
        paneLayers.addEventListener('click', e => {
            if (e.target.closest('[data-rt-ladd]')) { newLayer(); maskEdit = ''; refreshLayers(); commit('Nouveau calque'); return; }
            if (e.target.closest('[data-rt-gadd]')) { newGroup(); maskEdit = ''; refreshLayers(); commit('Nouveau groupe'); return; }
            if (e.target.closest('[data-rt-aadd]')) { newAdjust(); maskEdit = ''; refreshLayers(); draw(); syncControls(); commit('Nouveau calque de réglage'); showTab('adjust'); return; }
            if (e.target.closest('[data-rt-gwrap]')) return groupWrap();
            if (e.target.closest('[data-rt-padd]')) { if (!P()) layers.unshift(mkPhoto()); activeLayer = ''; refreshLayers(); draw(); commit('Photo remise dans les calques'); return; }
            const li = e.target.closest('[data-rt-l]'); if (!li) return;
            const id = li.dataset.rtL, l = target(id), name = l?.name; if (!l) return;
            if (e.target.closest('[data-rt-lvis]')) { l.visible = !l.visible; refreshLayers(); draw(); commit(`${name} ${l.visible ? 'montré' : 'masqué'}`); return; }
            if (e.target.closest('[data-rt-gopen]')) { l.open = l.open === false; refreshLayers(); return; }
            if (e.target.closest('[data-rt-madd]')) {
                // ⌥ / Alt + clic, comme dans Photoshop : un masque négatif (tout caché, ou la sélection cachée) ; on peint ensuite en ⬜ pour montrer
                if (e.altKey) { addMaskTo(id, selId ? [{type: 'sel', mask: selId, invert: true}] : [{type: 'all', mode: 'hide'}]); setMode('brush'); commit(`Masque qui cache ${selId ? 'la sélection' : 'tout'} ajouté à ${name}`); toast(selId ? 'Masque ajouté : la sélection est cachée.' : 'Masque ajouté : tout est caché ; peins en ⬜ pour montrer.'); return; }
                addMaskTo(id, []); setMode('brush'); commit(`Masque ajouté à ${name}`); toast('Masque ajouté : peins en ⬛ pour cacher, en ⬜ pour montrer.'); return;
            }
            if (e.target.closest('[data-rt-medit]') && e.shiftKey) { l.maskOff = !l.maskOff; refreshLayers(); draw(); commit(`Masque de ${name} ${l.maskOff ? 'désactivé' : 'réactivé'}`); return; } // comme Photoshop
            if (e.target.closest('[data-rt-medit]') && e.altKey) { maskShow = maskShow?.id === id && maskShow.mode === 'alone' ? null : {id, mode: 'alone'}; refreshLayers(); draw(); if (maskShow) toast('Masque seul : blanc = montré, noir = caché (⌥ + clic pour revenir)'); return; }
            if (e.target.closest('[data-rt-medit]')) { maskEdit = maskEdit === id ? '' : id; activeLayer = id === 'photo' ? '' : id; if (maskEdit) setMode('brush'); else setMode(mode); refreshLayers(); return; }
            if (e.target.closest('[data-rt-minv]')) { l.mask = [...l.mask, {type: 'invert'}]; refreshLayers(); draw(); commit(`Masque de ${name} inversé`); return; }
            if (e.target.closest('[data-rt-mdel]')) { l.mask = null; if (maskEdit === id) maskEdit = ''; setMode(mode); refreshLayers(); draw(); commit(`Masque de ${name} retiré`); return; }
            const loc = locate(id);
            if (e.target.closest('[data-rt-ladj]')) { activeLayer = id; refreshLayers(); syncControls(); showTab('adjust'); return; }
            if (e.target.closest('[data-rt-llock]')) { l.locked = !l.locked; refreshLayers(); commit(`${l.name} ${l.locked ? 'verrouillé' : 'déverrouillé'}`); return; }
            if (e.target.closest('[data-rt-ldel]')) {
                if (typeOf(l) === 'group') { loc.arr.splice(loc.arr.indexOf(l), 1, ...l.children); activeLayer = l.children.at(-1)?.id || ''; refreshLayers(); draw(); commit(`Groupe « ${l.name} » supprimé (son contenu reste)`); return; }
                if (typeOf(l) === 'photo' && !confirm(`Retirer « ${l.name} » des calques ? Ses réglages et corrections sont gardés : ⌘Z ou « ↺ Remettre la photo » pour la retrouver.`)) return;
                if (l.ops?.length && !confirm(`Supprimer « ${l.name} » et ce qui est dessus ?`)) return;
                loc.arr.splice(loc.arr.indexOf(l), 1); layerCanvases.delete(l.id); if (maskEdit === l.id) maskEdit = ''; activeLayer = (loc.arr.at(-1) || loc.parent)?.id || ''; moveSel = null; refreshLayers(); draw(); syncControls(); commit(`${l.name} supprimé`); return;
            }
            if (e.target.closest('[data-rt-ldup]') && typeOf(l) === 'photo') { // une copie de la photo (avec ses réglages) sur un calque à part
                const m = blankMask(), mg = m.getContext('2d'); mg.fillStyle = '#fff'; mg.fillRect(0, 0, pw, ph);
                const c = {id: nid('l'), type: 'layer', name: l.name + ' (copie)', visible: true, opacity: 1, locked: false, ops: [{type: 'pixels', mask: addMask(m), dx: 0, dy: 0, opacity: 1}], mask: null};
                loc.arr.splice(loc.arr.indexOf(l) + 1, 0, c); activeLayer = c.id; renderLayer(c); refreshLayers(); draw(); syncControls(); commit(`${l.name} dupliquée`); return;
            }
            if (e.target.closest('[data-rt-ldup]')) { const c = {...rtClone(l), id: nid(typeOf(l)[0]), name: l.name + ' (copie)'}; loc.arr.splice(loc.arr.indexOf(l) + 1, 0, c); activeLayer = c.id; renderLayer(c); refreshLayers(); draw(); commit(`${l.name} dupliqué`); return; }
            if (e.target.closest('[data-rt-lclear]')) { l.ops = []; moveSel = null; renderLayer(l); refreshLayers(); draw(); commit(`${l.name} vidé`); return; }
            const mv = e.target.closest('[data-rt-lmove]');
            if (mv) { const i = loc.arr.indexOf(l), j = i + Number(mv.dataset.rtLmove); if (j < 0 || j >= loc.arr.length) return; [loc.arr[i], loc.arr[j]] = [loc.arr[j], loc.arr[i]]; refreshLayers(); draw(); commit(`${l.name} déplacé`); return; }
            if (!e.target.closest('input,button,select,label')) { activeLayer = l.id === 'photo' ? '' : l.id; if (maskEdit && maskEdit !== l.id) { maskEdit = ''; setMode(mode); } refreshLayers(); syncControls(); if (mode === 'brush' && brushType === 'eraser' && l.id === 'photo') pickTool('eraser'); } // gomme sur la photo : par son masque
        });
        paneLayers.addEventListener('focusin', e => { const li = e.target.closest('[data-rt-l]'); if (li && li.dataset.rtL !== 'photo' && activeLayer !== li.dataset.rtL && e.target.matches('[data-rt-lname]')) { activeLayer = li.dataset.rtL; paneLayers.querySelectorAll('[data-rt-l]').forEach(x => x.classList.toggle('is-active', x === li)); syncControls(); } });
        paneLayers.addEventListener('input', e => { const l = target(e.target.closest('[data-rt-l]')?.dataset.rtL); if (!l) return; if (e.target.matches('[data-rt-lopac]')) { l.opacity = Number(e.target.value) / 100; draw(); } if (e.target.matches('[data-rt-lname]')) { l.name = e.target.value.slice(0, 60) || 'Calque'; syncTarget(); } });
        paneLayers.addEventListener('change', e => {
            const id = e.target.closest('[data-rt-l]')?.dataset.rtL, l = target(id); if (!l) return;
            if (e.target.matches('[data-rt-lopac]')) commit(`Opacité de ${l.name} : ${Math.round(l.opacity * 100)} %`);
            if (e.target.matches('[data-rt-lname]')) { refreshLayers(); commit(`Renommé « ${l.name} »`); }
            if (e.target.matches('[data-rt-lblend]')) { l.blend = e.target.value === 'source-over' ? undefined : e.target.value; draw(); commit(`Fusion de ${l.name} : ${e.target.selectedOptions[0].textContent}`); }
            if (e.target.matches('[data-rt-lclip]')) { l.clip = e.target.checked; refreshLayers(); draw(); commit(`« ${l.name} » ${l.clip ? 'seulement sur l’élément dessous' : 'sur tout ce qui est dessous'}`); }
            if (e.target.matches('[data-rt-lpar]')) {
                const loc = locate(id), g = nodeById(e.target.value); if (!loc) return;
                loc.arr.splice(loc.arr.indexOf(l), 1); (g ? g.children : layers).push(l); if (g) g.open = true;
                refreshLayers(); draw(); commit(g ? `« ${l.name} » rangé dans « ${g.name} »` : `« ${l.name} » sorti du groupe`);
            }
        });
        // ⠿ Glisser-déposer dans l'arbre : au-dessus ou en dessous d'un élément, dans un groupe (milieu de sa ligne, ou sa ligne « groupe vide »)
        let dragId = '';
        const isInside = (n, maybeChild) => { let hit = false; if (typeOf(n) === 'group') walk(n.children, x => { if (x === maybeChild) hit = true; }); return hit; };
        const zoneOf = (li, e) => { if (li.dataset.rtGin) return 'into'; const r = li.getBoundingClientRect(), y = (e.clientY - r.top) / r.height, grp = li.classList.contains('is-group'); return grp && y > 0.3 && y < 0.75 ? 'into' : y < 0.5 ? 'above' : 'below'; };
        const clearDrop = () => paneLayers.querySelectorAll('.drop-above,.drop-below,.drop-into').forEach(x => x.classList.remove('drop-above', 'drop-below', 'drop-into'));
        paneLayers.addEventListener('dragstart', e => { const g = e.target.closest('[data-rt-grip]'); if (!g) return; dragId = g.closest('[data-rt-l]').dataset.rtL; e.dataTransfer.setData('text/x-lcnda-layer', dragId); e.dataTransfer.effectAllowed = 'move'; g.closest('li').classList.add('is-dragging'); });
        paneLayers.addEventListener('dragend', () => { dragId = ''; clearDrop(); paneLayers.querySelectorAll('.is-dragging').forEach(x => x.classList.remove('is-dragging')); });
        paneLayers.addEventListener('dragover', e => {
            if (!dragId) return; const li = e.target.closest('li[data-rt-l], li[data-rt-gin]'); if (!li) return;
            const tid = li.dataset.rtGin || li.dataset.rtL, n = nodeById(dragId), tn = nodeById(tid);
            if (tid === dragId || (tn && isInside(n, tn))) { clearDrop(); return; } // pas dans lui-même
            e.preventDefault(); e.dataTransfer.dropEffect = 'move'; clearDrop();
            const z = zoneOf(li, e); li.classList.add(z === 'into' ? 'drop-into' : z === 'bottom' ? 'drop-above' : 'drop-' + z);
        });
        paneLayers.addEventListener('dragleave', e => { if (!paneLayers.contains(e.relatedTarget)) clearDrop(); });
        paneLayers.addEventListener('drop', e => {
            if (!dragId) return; const li = e.target.closest('li[data-rt-l], li[data-rt-gin]'); clearDrop(); if (!li) return; e.preventDefault();
            const n = nodeById(dragId), from = locate(dragId); if (!n || !from) return;
            const tid = li.dataset.rtGin || li.dataset.rtL, z = zoneOf(li, e), tn = nodeById(tid);
            if (tn === n || (tn && isInside(n, tn))) return;
            from.arr.splice(from.arr.indexOf(n), 1);
            let where = '';
            if (z === 'bottom' || !tn) { layers.unshift(n); where = 'tout en bas'; }
            else if (z === 'into') { tn.children.push(n); tn.open = true; where = `dans « ${tn.name} »`; }
            else { const to = locate(tn.id), i = to.arr.indexOf(tn); to.arr.splice(z === 'above' ? i + 1 : i, 0, n); where = `${z === 'above' ? 'au-dessus de' : 'sous'} « ${tn.name} »`; }
            activeLayer = n.id === 'photo' ? '' : n.id; dragId = ''; refreshLayers(); draw(); commit(`« ${n.name} » rangé ${where}`);
        });
        // le haut des onglets Réglages et Filtres dit ce qu'ils règlent : la photo, ou un calque de réglage
        function syncTarget() {
            const n = adjNode();
            $$('[data-rt-target]').forEach(el => { el.innerHTML = n ? `<span>🎚 Calque de réglage <b>${esc(n.name)}</b> <small>${n.clip ? '(seulement l’élément dessous)' : '(tout ce qui est dessous)'}</small></span><button type="button" class="link-button" data-rt-tophoto>régler la photo</button>` : `<span>🖼 Réglages de <b>la photo</b></span><button type="button" class="link-button" data-rt-toadj title="Réglages et filtres dans un calque à part, qu’on peut masquer, doser ou limiter à un calque">＋ dans un calque de réglage</button>`; el.classList.toggle('is-adj', !!n); });
        }
        dlg.addEventListener('click', e => {
            if (e.target.closest('[data-rt-tophoto]')) { activeLayer = ''; refreshLayers(); syncControls(); }
            if (e.target.closest('[data-rt-toadj]')) { newAdjust(); refreshLayers(); syncControls(); draw(); commit('Nouveau calque de réglage'); }
        });
        const showTab = k => { $$('[data-rt-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.rtTab === k)); $$('[data-rt-pane]').forEach(p => { p.hidden = p.dataset.rtPane !== k; }); };
        $$('[data-rt-tab]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.rtTab)));
        // ── Le panneau de droite s'élargit en glissant son bord (comme dans l'atelier de mise en page) ──
        const SIDE_KEY = 'genealogie-retouch-panel-w', mainEl = $('.h-rt-main');
        // replier / ouvrir le panneau de droite (Réglages, Filtres, Calques, Historique) : gardé pour la prochaine fois
        const setSideClosed = closed => {
            dlg.classList.toggle('rt-side-closed', closed); const tg = $('[data-rt-sidetog]');
            if (tg) { tg.textContent = closed ? '⇤' : '⇥'; tg.title = closed ? 'Ouvrir le panneau (Réglages, Calques…) — Tab' : 'Replier le panneau (plus de place pour la photo) — Tab'; }
            if (closed) mainEl.style.setProperty('--rt-side', '34px'); else { mainEl.style.removeProperty('--rt-side'); try { const w0 = Number(localStorage.getItem(SIDE_KEY)); if (w0) mainEl.style.setProperty('--rt-side', w0 + 'px'); } catch (_) {} }
            try { localStorage.setItem('genealogie-retouch-side-closed', closed ? '1' : ''); } catch (_) {}
            requestAnimationFrame(() => setZoom(zoom));
        };
        $('[data-rt-sidetog]').addEventListener('click', () => setSideClosed(!dlg.classList.contains('rt-side-closed')));
        const setSide = w => { const v = Math.max(260, Math.min(Math.round(window.innerWidth * 0.6), Math.round(w))); mainEl.style.setProperty('--rt-side', v + 'px'); return v; };
        try { const w0 = Number(localStorage.getItem(SIDE_KEY)); if (w0) setSide(w0); } catch (_) {}
        $('[data-rt-resize]').addEventListener('pointerdown', e => {
            e.preventDefault(); const x0 = e.clientX, w0 = $('.h-rt-side').getBoundingClientRect().width, h = e.currentTarget; h.setPointerCapture(e.pointerId); h.classList.add('is-drag');
            const mv = ev => { setSide(w0 + (dlg.classList.contains('rt-side-left') ? ev.clientX - x0 : x0 - ev.clientX)); setZoom(zoom); };
            const up = () => { h.removeEventListener('pointermove', mv); h.classList.remove('is-drag'); try { localStorage.setItem(SIDE_KEY, String(Math.round($('.h-rt-side').getBoundingClientRect().width))); } catch (_) {} };
            h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up, {once: true}); h.addEventListener('pointercancel', up, {once: true});
        });
        $('[data-rt-resize]').addEventListener('dblclick', () => { mainEl.style.removeProperty('--rt-side'); try { localStorage.removeItem(SIDE_KEY); } catch (_) {} setZoom(zoom); });

        // ── Zoom : boutons, molette avec ⌘ / Ctrl (ou pincer), barre d'espace ou ✋ pour se déplacer ──
        let zoom = 1; // 1 = toute l'image dans le cadre
        const fitScale = () => { const r = stage.getBoundingClientRect(); return Math.max(0.01, Math.min((r.width - 24) / pw, (r.height - 24) / ph)); };
        const placeOver = () => { Object.assign(overlay.style, {left: canvas.offsetLeft + 'px', top: canvas.offsetTop + 'px', width: canvas.offsetWidth + 'px', height: canvas.offsetHeight + 'px'}); syncCrop(); };
        const setZoom = (z, cx, cy) => {
            const r = stage.getBoundingClientRect(), before = canvas.getBoundingClientRect();
            const ax = cx ?? r.left + r.width / 2, ay = cy ?? r.top + r.height / 2, fx = (ax - before.left) / before.width, fy = (ay - before.top) / before.height;
            zoom = Math.max(0.2, Math.min(40, z));
            const k = fitScale() * zoom; canvas.style.width = pw * k + 'px'; canvas.style.height = ph * k + 'px';
            const after = canvas.getBoundingClientRect();
            stage.scrollLeft += (after.left + fx * after.width) - ax; stage.scrollTop += (after.top + fy * after.height) - ay;
            $('[data-rt-zoomout]').textContent = Math.round(k / scale * 100) + ' %';
            canvas.classList.toggle('is-pixelated', k / scale > 2);
            placeOver();
        };
        $$('[data-rt-zoom]').forEach(b => b.addEventListener('click', () => setZoom(zoom * (b.dataset.rtZoom === '1' ? 1.5 : 1 / 1.5))));
        $('[data-rt-zoomfit]').addEventListener('click', () => setZoom(1));
        $('[data-rt-zoom100]').addEventListener('click', () => setZoom(scale / fitScale()));
        stage.addEventListener('wheel', e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); setZoom(zoom * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY); }, {passive: false});
        const ro = new ResizeObserver(() => setZoom(zoom)); ro.observe(stage);

        // ── Outils ──
        let mode = 'adjust', brush = 18, hard = 55, opac = 100, brushType = 'round', color = '#d0021b', font = RT_FONTS[0][0], halo = true, aligned = true, haloColor = '#ffffff', haloW = 1, shadow = false, shadowColor = '#000000';
        let bold = false, italic = false, shapeKind = 'rect', shapeFill = false, fillColor = '#ffffff', tol = 24, contig = true, maskMode = 'hide';
        let cloneOff = null, cloneSrc = null, picking = false, painting = null, panning = null, spaceDown = false, drag = null, poly = null, polyHover = null;
        const brushEl = $('[data-rt-brush]'), srcEl = $('[data-rt-src]'), help = $('[data-rt-paint-help]');
        const HELP = {adjust: '', hand: 'Glisse pour te déplacer dans l’image zoomée (la barre d’espace fait pareil avec n’importe quel outil).',
            move: 'Clique sur un trait, une forme, un texte ou une zone copiée d’un calque, puis glisse-le. ⌫ le supprime, double-clic sur un texte pour le réécrire.',
            marquee: 'Glisse pour sélectionner un rectangle (⇧ en plus : ajouter, ⌥ : enlever). Les réglages de la barre agissent ensuite sur la sélection.',
            ellipsesel: 'Glisse pour sélectionner un ovale (⇧ : ajouter, ⌥ : enlever).',
            lasso: 'Entoure à main levée la zone à sélectionner (⇧ : ajouter, ⌥ : enlever).',
            polysel: 'Plume : clique point par point autour de la zone ; double-clic, Entrée ou clic sur le premier point pour fermer. Échap : abandonner.',
            wand: 'Clique sur une couleur : tous les points voisins de teinte proche sont sélectionnés (Tolérance). ⇧ : ajouter, ⌥ : enlever.',
            crop: 'Glisse les poignées du cadre (ou trace un nouveau cadre), choisis des proportions, redresse avec le curseur, puis « ✓ Valider ».',
            zoom: 'Clic : zoomer ici · ⌥ + clic : reculer · ou glisse pour zoomer sur une zone.',
            persp: 'Glisse les 4 coins sur les coins de la photo, du document ou de la façade prise de biais, puis « ✓ Valider » : elle est remise à plat. À faire de préférence avant les corrections de taches.',
            shape: 'Glisse pour tracer la forme sur le calque choisi (⇧ : carré, cercle ou angle droit).',
            heal: 'Clique sur une tache, une poussière ou une rayure : elle est remplacée par ce qui l’entoure. Pour une rayure, glisse le long. Zoome (⌘ + molette) pour être précis.',
            clone: '« Choisir l’endroit à recopier » (ou ⌥ + clic), puis peins sur la zone à couvrir. « Aligné » : la source suit ton pinceau d’un trait à l’autre. Avec une sélection : glisse pour poser une copie de la zone ailleurs.',
            brush: 'Peins sur le calque choisi (Calques) : annoter, entourer, flécher à la main. La gomme efface ce qui a été peint, jamais la photo.',
            mask: 'Tu peins le MASQUE du calque : ⬛ cacher, ⬜ montrer. Rien n’est effacé. Clique sur la vignette du masque (Calques) pour revenir au calque.',
            text: 'Clique dans l’image à l’endroit du texte, écris, puis Entrée (⇧ + Entrée pour aller à la ligne).'};
        const SELTOOLS = ['marquee', 'ellipsesel', 'lasso', 'polysel', 'wand'];
        const OPTS = {heal: ['size'], clone: ['size', 'hard', 'clone'], brush: ['size', 'opacity', 'brush', 'color', 'swatches'], text: ['size', 'opacity', 'color', 'swatches', 'font', 'textstyle'], hand: [], adjust: [], move: ['font'], zoom: [],
            marquee: ['sel'], ellipsesel: ['sel'], lasso: ['sel'], polysel: ['sel'], wand: ['wand', 'sel'], crop: ['crop'], persp: ['persp'], shape: ['shape', 'size', 'opacity', 'color', 'swatches'], mask: ['size', 'hard', 'opacity', 'maskmode']};
        const optsFor = m => m === 'brush' && maskEdit ? 'mask' : m;
        const setMode = m => {
            const changed = m !== mode; // le même outil redemandé (rafraîchir) ne change pas d'onglet
            if (m === 'crop' && mode !== 'crop') startCrop();
            if (m === 'persp' && mode !== 'persp') { persp = st.persp ? st.persp.map(p => [...p]) : [[0.06, 0.06], [0.94, 0.06], [0.94, 0.94], [0.06, 0.94]]; if (st.persp) { const s0 = st.persp; st.persp = null; srcData.data.set(baseData.data); if (st.strokes.length) rtReplayStrokes(srcData, st.strokes, masks); strokeVer++; photoKey = ''; st._persp0 = s0; } }
            if (m !== 'persp' && mode === 'persp' && st._persp0 !== undefined) { if (!st.persp) st.persp = st._persp0; delete st._persp0; applyBase(); } // abandon : on remet la perspective d'avant
            if (m !== 'crop' && mode === 'crop') endCrop(true); // changer d'outil garde le cadre (Échap l'abandonne)
            mode = m; picking = false; poly = null; drag = null;
            const om = optsFor(m);
            // la gomme est le pinceau en mode « Gomme » : c'est son bouton qui s'allume, pas celui du pinceau
            const isOn = k => k === 'eraser' ? m === 'brush' && brushType === 'eraser' : k === m && !(m === 'brush' && brushType === 'eraser');
            $$('[data-rt-mode]').forEach(b => { if (b.hasAttribute('data-rt-v')) b.classList.toggle('is-on', isOn(b.dataset.rtMode)); else b.classList.toggle('secondary', !isOn(b.dataset.rtMode)); });
            $('[data-rt-opts]').hidden = !OPTS[om].length && !HELP[om];
            $$('[data-rt-opts] [data-o]').forEach(el => { el.hidden = !OPTS[om].includes(el.dataset.o); });
            help.textContent = HELP[om] || '';
            canvas.classList.toggle('is-painting', ['heal', 'clone', 'brush'].includes(m) && !(m === 'clone' && selId)); canvas.classList.toggle('is-text', m === 'text'); stage.classList.toggle('is-hand', m === 'hand');
            canvas.dataset.tool = m;
            brushEl.hidden = true; srcEl.hidden = true;
            if (['brush', 'text', 'shape'].includes(m) && !maskEdit) { if (!drawLayers().length) { newLayer('Annotations'); refreshLayers(); commit('Calque « Annotations » créé'); } if (!nodeById(activeLayer)) { activeLayer = drawLayers().at(-1).id; refreshLayers(); } if (changed) showTab('layers'); }
            if (m === 'adjust' && changed) showTab('adjust');
            draw();
        };
        /** Choisir un outil. 🧽 Gomme = le pinceau « Gomme » : elle efface le calque choisi ; sur la photo d'origine, elle passe
            par un masque qui la cache (comme un calque de fond qu'on ne détruit pas) ; 🖌 revient à la sorte de pinceau d'avant. */
        let brushBeforeEraser = 'round';
        const syncBrushType = () => { const s = $('[data-rt-brushtype]'); if (s) s.value = brushType; };
        const pickTool = k => {
            if (k === 'eraser') {
                if (brushType !== 'eraser') brushBeforeEraser = brushType;
                brushType = 'eraser'; syncBrushType();
                if (!maskEdit && (!activeLayer || activeLayer === 'photo') && P() && !lockedDeep(P())) { // la photo : on la cache au lieu de l'effacer
                    if (!P().mask) { addMaskTo('photo', []); commit('Masque ajouté à la photo (gomme)'); toast('Gomme sur la photo : elle est cachée par un masque, rien n’est effacé (peins en ⬜ « montrer » pour la faire revenir).'); }
                    else { maskEdit = 'photo'; refreshLayers(); }
                }
                if (maskEdit) { maskMode = 'hide'; $$('[data-rt-maskmode]').forEach(r => { r.checked = r.value === 'hide'; }); }
                return setMode('brush');
            }
            if (k === 'brush' && brushType === 'eraser') { brushType = brushBeforeEraser === 'eraser' ? 'round' : brushBeforeEraser; syncBrushType(); }
            setMode(k);
        };
        $$('[data-rt-mode]').forEach(b => b.addEventListener('click', () => pickTool(b.dataset.rtMode)));
        const setSize = v => { brush = Math.max(1, Math.min(200, Math.round(v))); $('[data-rt-size]').value = brush; $('[data-rt-size-out]').textContent = brush; };
        $('[data-rt-size]').addEventListener('input', e => setSize(Number(e.target.value)));
        $('[data-rt-hard]').addEventListener('input', e => { hard = Number(e.target.value); $('[data-rt-hard-out]').textContent = hard + ' %'; });
        $('[data-rt-opac]').addEventListener('input', e => { opac = Number(e.target.value); $('[data-rt-opac-out]').textContent = opac + ' %'; });
        $('[data-rt-brushtype]').addEventListener('change', e => { brushType = e.target.value; if (mode === 'brush') setMode('brush'); }); // « Gomme » choisie ici allume aussi l'outil 🧽
        const setColor = c => { color = c; $('[data-rt-color]').value = c; $('[data-rt-color2]').value = c; };
        $('[data-rt-color]').addEventListener('input', e => setColor(e.target.value));
        $('[data-rt-color2]').addEventListener('input', e => setColor(e.target.value));
        $$('[data-rt-swatch]').forEach(b => b.addEventListener('click', () => setColor(b.dataset.rtSwatch)));
        $('[data-rt-font]').addEventListener('change', e => { font = e.target.value; const op = moveSel && nodeById(moveSel.layer)?.ops[moveSel.i]; if (mode === 'move' && op?.type === 'text') { op.font = font; renderLayer(nodeById(moveSel.layer)); draw(); commit('Police du texte'); } });
        // contour et ombre : pour les prochains textes, et pour le texte choisi avec ➤
        const textStyle = () => { const op = moveSel && nodeById(moveSel.layer)?.ops[moveSel.i]; if (op?.type !== 'text') return; op.halo = halo ? haloColor : ''; op.haloW = haloW; op.shadow = shadow ? shadowColor : ''; renderLayer(nodeById(moveSel.layer)); draw(); commit('Style du texte'); };
        $('[data-rt-halo]').addEventListener('change', e => { halo = e.target.checked; textStyle(); });
        $('[data-rt-halocolor]').addEventListener('change', e => { haloColor = e.target.value; halo = true; $('[data-rt-halo]').checked = true; textStyle(); });
        $('[data-rt-halow]').addEventListener('change', e => { haloW = Number(e.target.value); textStyle(); });
        $('[data-rt-shadow]').addEventListener('change', e => { shadow = e.target.checked; textStyle(); });
        $('[data-rt-shadowcolor]').addEventListener('change', e => { shadowColor = e.target.value; shadow = true; $('[data-rt-shadow]').checked = true; textStyle(); });
        $('[data-rt-bold]').addEventListener('change', e => { bold = e.target.checked; });
        $('[data-rt-italic]').addEventListener('change', e => { italic = e.target.checked; });
        $('[data-rt-shape]').addEventListener('change', e => { shapeKind = e.target.value; });
        $('[data-rt-fillon]').addEventListener('change', e => { shapeFill = e.target.checked; });
        $('[data-rt-fill]').addEventListener('input', e => { fillColor = e.target.value; });
        $('[data-rt-tol]').addEventListener('input', e => { tol = Number(e.target.value); $('[data-rt-tol-out]').textContent = tol; });
        $('[data-rt-contig]').addEventListener('change', e => { contig = e.target.checked; });
        $$('[data-rt-maskmode]').forEach(r => r.addEventListener('change', () => { if (r.checked) maskMode = r.value; }));
        $('[data-rt-aligned]').addEventListener('change', e => { aligned = e.target.checked; });
        $('[data-rt-pick]').addEventListener('click', () => { picking = true; help.textContent = 'Clique maintenant à l’endroit à recopier.'; canvas.classList.add('is-picking'); });
        // les polices de l'ordinateur, ajoutées à la liste (tapées à la main si le navigateur ne sait pas les lire)
        $('[data-rt-localfonts]').addEventListener('click', async () => {
            const sel = $('[data-rt-font]'), add = names => { const have = new Set([...sel.options].map(o => o.value)); names.forEach(n => { const v = `"${n.replace(/["\\<>]/g, '')}", sans-serif`; if (!have.has(v)) { sel.add(new Option(n, v)); have.add(v); } }); };
            try {
                if (window.queryLocalFonts) { const fonts = await window.queryLocalFonts(); add([...new Set(fonts.map(f => f.family))].sort((a, b) => a.localeCompare(b, 'fr')).slice(0, 600)); toast('Polices de l’ordinateur ajoutées à la liste.'); return; }
            } catch (_) {}
            const n = ((await A().askText({title: 'Police de l’ordinateur', message: 'Nom exact de la police (ex. Garamond, Baskerville) :', okLabel: 'Ajouter'})) || '').trim().slice(0, 80); if (!n) return;
            add([n]); sel.value = `"${n.replace(/["\\<>]/g, '')}", sans-serif`; font = sel.value;
        });
        // coordonnées : la toile garde sa taille d'aperçu (pw × ph) ; elle est affichée plus ou moins grande selon le zoom
        const toCanvas = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * pw / r.width, (e.clientY - r.top) * ph / r.height, r.width / pw]; };
        const showBrush = e => {
            const painty = ['heal', 'brush'].includes(mode) || (mode === 'clone' && !selId);
            if (!painty || picking) { brushEl.hidden = true; srcEl.hidden = !(mode === 'clone' && cloneSrc && picking === false && !cloneOff); return; }
            const [x, y, k] = toCanvas(e), r = mode === 'brush' && brushType === 'pencil' && !maskEdit ? Math.min(brush, 4) : brush, cr = canvas.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
            Object.assign(brushEl.style, {width: r * 2 * k + 'px', height: r * 2 * k + 'px', left: (cr.left - wr.left + x * k - r * k) + 'px', top: (cr.top - wr.top + y * k - r * k) + 'px', borderColor: mode === 'brush' && !maskEdit ? color : ''}); brushEl.hidden = false;
            if (mode === 'clone' && (cloneOff || cloneSrc)) { const sx = cloneOff ? x + cloneOff[0] : cloneSrc[0], sy = cloneOff ? y + cloneOff[1] : cloneSrc[1]; Object.assign(srcEl.style, {left: (cr.left - wr.left + sx * k) + 'px', top: (cr.top - wr.top + sy * k) + 'px'}); srcEl.hidden = false; }
        };
        const dabAt = (x, y) => {
            const g = painting, d = g.dabs, last = d[d.length - 1];
            if (last && Math.hypot(x - last.x * pw, y - last.y * ph) < Math.max(0.6, brush / 4)) return;
            const rec = {x: x / pw, y: y / ph, r: brush / pw};
            if (g.tool === 'heal') { const h = rtHealSource(g.from, pw, ph, x, y, brush); if (!h) return; rtDab(srcData.data, g.from, pw, ph, x, y, h.sx, h.sy, brush, h.offset, 0.35); }
            else { rec.ox = cloneOff[0] / pw; rec.oy = cloneOff[1] / ph; rec.h = hard / 100; rtDab(srcData.data, g.from, pw, ph, x, y, x + cloneOff[0], y + cloneOff[1], brush, null, hard / 100); }
            d.push(rec); strokeVer++; draw();
        };
        // le calque où l'on dessine : celui qui est choisi ; si c'est un groupe ou un réglage, un nouveau calque à cet endroit
        const activeL = () => { const n = nodeById(activeLayer); if (typeOf(n) === 'layer') return n; const l = newLayer(); refreshLayers(); return l; };
        const placeText = (x, y, edit = null) => {
            const l = edit ? nodeById(edit.layer) : activeL(); if (!l || lockedDeep(l)) return toast('Ce calque est verrouillé : choisis-en un autre dans Calques.', 'error');
            const op0 = edit ? l.ops[edit.i] : null;
            const r = canvas.getBoundingClientRect(), wr = wrap.getBoundingClientRect(), k = r.width / pw, sz = op0 ? op0.size * pw : brush;
            const ta = document.createElement('textarea'); ta.className = 'h-rt-textinput'; ta.rows = 1; ta.value = op0?.text || '';
            Object.assign(ta.style, {left: (r.left - wr.left + x * k) + 'px', top: (r.top - wr.top + y * k) + 'px', fontSize: Math.max(10, sz * k) + 'px', color: op0?.color || color, fontFamily: op0?.font || font, fontWeight: (op0 ? op0.bold : bold) ? '700' : '400', fontStyle: (op0 ? op0.italic : italic) ? 'italic' : 'normal'});
            wrap.appendChild(ta); ta.focus();
            let over = false; const done = ok => { if (over) return; over = true; const text = ta.value.replace(/\s+$/, ''); ta.remove(); if (!ok) return;
                if (op0) { if (!text.trim()) l.ops.splice(edit.i, 1); else op0.text = text; moveSel = null; }
                else { if (!text.trim()) return; l.ops.push({type: 'text', text, x: x / pw, y: y / ph, size: brush / pw, color, opacity: opac / 100, font, bold, italic, halo: halo ? haloColor : '', haloW, shadow: shadow ? shadowColor : ''}); }
                renderLayer(l); draw(); refreshLayers(); commit(`Texte « ${text.slice(0, 24)}${text.length > 24 ? '…' : ''} »`); };
            ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); done(true); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } });
            ta.addEventListener('blur', () => done(true));
        };
        // ── Sélections : rectangle, ovale, lasso, plume, baguette ; ⇧ ajoute, ⌥ enlève ──
        function selPath(g, d) {
            if (d.kind === 'rect') g.rect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
            else if (d.kind === 'ellipse') g.ellipse((d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, Math.abs(d.x1 - d.x0) / 2 || 0.5, Math.abs(d.y1 - d.y0) / 2 || 0.5, 0, 0, Math.PI * 2);
            else d.pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
        }
        const shapeMask = d => { const c = blankMask(), g = c.getContext('2d'); g.fillStyle = '#000'; g.beginPath(); selPath(g, d); g.closePath(); g.fill(); return c; };
        const combine = (c, how, label = '') => { // how : 'new' | 'add' | 'sub'
            const cur0 = selId && masks.get(selId);
            if (how !== 'new' && cur0) { const r = blankMask(), g = r.getContext('2d'); g.drawImage(cur0, 0, 0); g.globalCompositeOperation = how === 'add' ? 'source-over' : 'destination-out'; g.drawImage(c, 0, 0); c = r; }
            else if (how === 'sub') return; // rien à enlever
            if (isEmpty(c)) { selId = null; } else selId = addMask(c);
            refreshLayers(); setMode(mode); draw(); commit(!selId ? 'Sélection vide' : label || ({add: 'Sélection ajoutée', sub: 'Sélection retirée'}[how] || 'Sélection'));
        };
        const isEmpty = c => { const d = c.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, pw, ph).data; for (let i = 3; i < d.length; i += 16) if (d[i]) return false; return true; };
        const howOf = e => e.altKey ? 'sub' : e.shiftKey ? 'add' : 'new';
        const maskBox = c => { const d = c.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, pw, ph).data; let x0 = pw, y0 = ph, x1 = -1, y1 = -1; for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) if (d[(y * pw + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return x1 < 0 ? null : {x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1}; };
        const blurMask = (r, thr = null) => { const m = masks.get(selId), c = blankMask(), g = c.getContext('2d'); g.filter = `blur(${r}px)`; g.drawImage(m, 0, 0); if (thr === null) return c; const id = g.getImageData(0, 0, pw, ph); for (let i = 3; i < id.data.length; i += 4) id.data[i] = id.data[i] > thr ? 255 : 0; g.putImageData(id, 0, 0); return c; };
        const finishPoly = () => { if (!poly || poly.length < 3) { poly = null; draw(); return; } const pts = poly; poly = null; polyHover = null; combine(shapeMask({kind: 'poly', pts}), polyHow); };
        let polyHow = 'new';
        // ── ➤ Déplacer : trouver l'élément sous le clic, le glisser ──
        const mctx = document.createElement('canvas').getContext('2d');
        function opBox(op) {
            if (op.type === 'image') return {x: op.x, y: op.y, w: op.w, h: op.h};
            if (op.type === 'shape') { const x = Math.min(op.x1, op.x2), y = Math.min(op.y1, op.y2); return {x, y, w: Math.abs(op.x2 - op.x1), h: Math.abs(op.y2 - op.y1)}; }
            if (op.type === 'text') { const size = Math.max(6, op.size * pw); mctx.font = `${op.italic ? 'italic ' : ''}${op.bold ? 'bold ' : ''}${size}px ${op.font || 'Arial'}`; const lines = String(op.text).split('\n'); return {x: op.x, y: op.y, w: Math.max(...lines.map(l => mctx.measureText(l).width)) / pw, h: lines.length * size * 1.2 / ph}; }
            if (op.type === 'pixels' || op.type === 'fillmask') { const m = masks.get(op.mask), b = m && (op._bb || (op._bb = maskBox(m))); return b ? {x: b.x / pw + (op.dx || 0), y: b.y / ph + (op.dy || 0), w: b.w / pw, h: b.h / ph} : null; }
            if (op.points?.length) { const xs = op.points.map(p => p[0]), ys = op.points.map(p => p[1]), pad = (op.size || 0) / 2; const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad * pw / ph; return {x, y, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 * pw / ph}; }
            return null;
        }
        const handleSize = () => Math.max(4, 6 * pw / (canvas.getBoundingClientRect().width || pw));
        /** Coins (tournés), milieu du haut et poignée de rotation d'une image placée, en pixels de l'aperçu */
        const imgHandles = op => {
            const cx = (op.x + op.w / 2) * pw, cy = (op.y + op.h / 2) * ph, r = (op.rot || 0) * Math.PI / 180, hw = op.w * pw / 2, hh = op.h * ph / 2;
            const at = (dx, dy) => [cx + dx * Math.cos(r) - dy * Math.sin(r), cy + dx * Math.sin(r) + dy * Math.cos(r)];
            return {corners: [at(-hw, -hh), at(hw, -hh), at(hw, hh), at(-hw, hh)], topMid: at(0, -hh), rot: at(0, -hh - handleSize() * 5)};
        };
        /** 🖼️ Placer une image : sur un nouveau calque, au centre, ni plus large ni plus haute que 60 % de la photo */
        const placeImage = (img, name = 'Image') => {
            const nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height; if (!nw || !nh) return toast('Image illisible.', 'error');
            const k = Math.min(1, 2000 / Math.max(nw, nh)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(nw * k)); c.height = Math.max(1, Math.round(nh * k));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            const f = Math.min(0.6 * pw / nw, 0.6 * ph / nh, 1 * pw / nw), w = nw * f / pw, h = nh * f / ph;
            const l = newLayer(String(name).replace(/\.[a-z0-9]{2,5}$/i, '').slice(0, 60) || 'Image');
            l.ops.push({type: 'image', mask: addMask(c), x: (1 - w) / 2, y: (1 - h) / 2, w, h, rot: 0, opacity: 1});
            activeLayer = l.id; maskEdit = ''; renderLayer(l); setMode('move'); moveSel = {layer: l.id, i: 0}; refreshLayers(); showTab('layers'); draw();
            commit(`Image placée : « ${l.name} »`); toast('Image placée : ➤ glisse-la, tire un coin pour la taille (⇧ : libre), la poignée ronde pour la tourner.');
        };
        const placeFile = file => { if (!file || !/^image\//.test(file.type)) return toast('Ce fichier n’est pas une image.', 'error'); const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { placeImage(im, file.name || 'Image'); URL.revokeObjectURL(u); }; im.onerror = () => { URL.revokeObjectURL(u); toast('Image illisible.', 'error'); }; im.src = u; };
        const placeUrl = (url, name) => { const im = new Image(); im.onload = () => placeImage(im, name); im.onerror = () => toast('Image introuvable.', 'error'); im.src = url; };
        function placeDialog() {
            const pd = document.createElement('dialog'); pd.className = 'modal h-modal h-rt-pick';
            pd.innerHTML = `<div class="modal-head"><div><span class="eyebrow">RETOUCHE</span><h2>🖼️ Placer une image</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
                <div class="h-rt-pick-bar"><input type="search" data-q placeholder="Chercher une photo de l’app (titre, cote, nom du fichier)…"><label class="button small">📥 De l’ordinateur<input type="file" accept="image/*" data-file hidden></label></div>
                <p class="muted small">Elle arrive sur un nouveau calque. Tu peux aussi glisser un fichier sur la photo, ou coller une image copiée (⌘V / Ctrl+V).</p>
                <div class="h-rt-pick-grid" data-grid><div class="loading-block">Chargement…</div></div>`;
            document.body.append(pd); pd.addEventListener('close', () => pd.remove()); pd.querySelector('[data-x]').addEventListener('click', () => pd.close());
            let timer = 0, seq = 0;
            const load = async () => { const n = ++seq, grid = pd.querySelector('[data-grid]'); let items = []; try { items = (await api('image_pick', {q: pd.querySelector('[data-q]').value.trim()})).media || []; } catch (er) { grid.innerHTML = `<p class="muted">${esc(er.message)}</p>`; return; } if (n !== seq) return;
                grid.innerHTML = items.length ? items.map(m => `<button type="button" class="h-rt-pick-item" data-f="${esc(m.filename)}" data-t="${esc(m.title || m.filename)}"><img src="media/${encodeURIComponent(m.thumbnail || m.filename)}" alt="" loading="lazy"><span>${esc(m.title || m.filename)}</span></button>`).join('') : '<p class="muted">Aucune photo trouvée.</p>'; };
            pd.querySelector('[data-q]').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
            pd.querySelector('[data-grid]').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; pd.close(); placeUrl(`media/${encodeURIComponent(b.dataset.f)}`, b.dataset.t); });
            pd.querySelector('[data-file]').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) { pd.close(); placeFile(f); } });
            pd.showModal(); load();
        }
        // une image glissée depuis l'ordinateur sur la photo, ou collée (⌘V) : placée sur un nouveau calque
        stage.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
        stage.addEventListener('drop', e => { const f = [...(e.dataTransfer?.files || [])].find(x => /^image\//.test(x.type)); if (f) { e.preventDefault(); placeFile(f); } });
        document.addEventListener('paste', function onPaste(e) {
            if (!dlg.isConnected) { document.removeEventListener('paste', onPaste); return; }
            if (!dlg.open || e.target.closest?.('input, textarea, [contenteditable]')) return;
            // une autre fenêtre ouverte PAR-DESSUS la retouche (pas celle d'où elle a été ouverte, ex. la mise en page) garde le collage
            const over = document.activeElement?.closest?.('dialog'); if (over && over !== dlg) return;
            const f = [...(e.clipboardData?.files || [])].find(x => /^image\//.test(x.type)); if (f) { e.preventDefault(); placeFile(f); }
        });
        const hitOp = (x, y) => { const rx = x / pw, ry = y / ph, tolx = 6 / pw * (pw / canvas.getBoundingClientRect().width), toly = tolx * pw / ph;
            for (const l of hitList()) { for (let i = l.ops.length - 1; i >= 0; i--) { const b = opBox(l.ops[i]); if (b && rx >= b.x - tolx && rx <= b.x + b.w + tolx && ry >= b.y - toly && ry <= b.y + b.h + toly) return {layer: l.id, i}; } }
            return null; };
        const moveOp = (op, dx, dy) => {
            if (op.type === 'shape') { op.x1 += dx; op.x2 += dx; op.y1 += dy; op.y2 += dy; }
            else if (op.type === 'text' || op.type === 'image') { op.x += dx; op.y += dy; }
            else if (op.type === 'pixels' || op.type === 'fillmask') { op.dx = (op.dx || 0) + dx; op.dy = (op.dy || 0) + dy; }
            else if (op.points) op.points = op.points.map(([px, py]) => [px + dx, py + dy]);
        };
        const delMoveSel = () => { const l = moveSel && nodeById(moveSel.layer); if (!l || lockedDeep(l)) return false; l.ops.splice(moveSel.i, 1); moveSel = null; renderLayer(l); draw(); refreshLayers(); commit(`Élément supprimé de « ${l.name} »`); return true; };
        canvas.addEventListener('dblclick', e => { if (mode === 'polysel') { finishPoly(); return; } if (mode !== 'move') return; const [x, y] = toCanvas(e), h = hitOp(x, y); if (!h) return; const op = nodeById(h.layer).ops[h.i]; if (op.type === 'text') { e.preventDefault(); placeText(op.x * pw, op.y * ph, h); } });
        canvas.addEventListener('pointerdown', e => {
            if (mode === 'hand' || spaceDown || e.button === 1) { panning = {x: e.clientX, y: e.clientY, l: stage.scrollLeft, t: stage.scrollTop}; canvas.setPointerCapture(e.pointerId); e.preventDefault(); return; }
            if (mode === 'adjust' || mode === 'crop') return;
            e.preventDefault();
            const [x, y] = toCanvas(e);
            if (mode === 'persp') { if (!persp) return; const k = handleSize() * 3, i = persp.findIndex(([px, py]) => Math.hypot(px * pw - x, py * ph - y) <= k); if (i >= 0) { drag = {persp: i}; canvas.setPointerCapture(e.pointerId); } return; }
            if (mode === 'zoom') { drag = {zoom: true, x0: e.clientX, y0: e.clientY, alt: e.altKey}; canvas.setPointerCapture(e.pointerId); return; }
            if (mode === 'text') { if (e.detail > 1) return; const h = hitOp(x, y), op = h && nodeById(h.layer).ops[h.i]; if (op?.type === 'text') return placeText(op.x * pw, op.y * ph, h); return placeText(x, y); }
            if (mode === 'move') {
                const cur = moveSel && nodeById(moveSel.layer)?.ops[moveSel.i];
                if (cur?.type === 'image' && !lockedDeep(nodeById(moveSel.layer))) { // une poignée de l'image choisie : taille ou rotation
                    const hs = imgHandles(cur), k = handleSize() * 2.2, ci = hs.corners.findIndex(([hx, hy]) => Math.hypot(hx - x, hy - y) <= k);
                    if (Math.hypot(hs.rot[0] - x, hs.rot[1] - y) <= k) { drag = {imgRot: true, moved: false}; canvas.setPointerCapture(e.pointerId); return; }
                    if (ci >= 0) { const o = hs.corners[(ci + 2) % 4]; drag = {imgSize: true, anchor: o, ratio: cur.w * pw / (cur.h * ph), moved: false}; canvas.setPointerCapture(e.pointerId); return; }
                }
                moveSel = hitOp(x, y); if (moveSel) { activeLayer = moveSel.layer; refreshLayers(); drag = {move: true, x, y, moved: false}; canvas.setPointerCapture(e.pointerId); }
                draw(); return;
            }
            if (mode === 'marquee' || mode === 'ellipsesel') { drag = {sel: {kind: mode === 'marquee' ? 'rect' : 'ellipse', x0: x, y0: y, x1: x, y1: y}, how: howOf(e)}; canvas.setPointerCapture(e.pointerId); return; }
            if (mode === 'lasso') { drag = {sel: {kind: 'poly', pts: [[x, y]]}, how: howOf(e)}; canvas.setPointerCapture(e.pointerId); return; }
            if (mode === 'polysel') {
                if (!poly) { poly = [[x, y]]; polyHow = howOf(e); draw(); return; }
                const [fx, fy] = poly[0], near = Math.hypot(x - fx, y - fy) * canvas.getBoundingClientRect().width / pw < 9;
                if (near && poly.length > 2) { finishPoly(); return; }
                poly.push([x, y]); draw(); return;
            }
            if (mode === 'wand') { const c = rtWand(pctx.getImageData(0, 0, pw, ph), x, y, tol, contig); combine(c, howOf(e), howOf(e) === 'new' ? 'Sélection automatique' : ''); return; }
            if (mode === 'shape') {
                const l = activeL(); if (!l) return; if (lockedDeep(l)) return toast('Ce calque est verrouillé : choisis-en un autre dans Calques.', 'error');
                painting = {tool: 'shape', layer: l, x0: x, y0: y, preview: {type: 'shape', kind: shapeKind, x1: x / pw, y1: y / ph, x2: x / pw, y2: y / ph, color, fill: shapeFill ? fillColor : '', size: Math.max(1, brush / 6) / pw, opacity: opac / 100}};
                canvas.setPointerCapture(e.pointerId); return;
            }
            if (mode === 'clone' && selId && !(e.altKey || picking) && P() && !lockedDeep(P())) { painting = {tool: 'patch', x0: x, y0: y, patch: {mask: selId, dx: 0, dy: 0}}; canvas.setPointerCapture(e.pointerId); return; }
            if (mode === 'clone') {
                if (e.altKey || picking) { cloneSrc = [x, y]; cloneOff = null; picking = false; canvas.classList.remove('is-picking'); help.textContent = HELP.clone; toast('Endroit à recopier choisi : peins maintenant sur la zone à couvrir.'); return; }
                if (cloneSrc && (!cloneOff || !aligned)) cloneOff = [cloneSrc[0] - x, cloneSrc[1] - y];
                if (!cloneOff) { toast('Choisis d’abord l’endroit à recopier (bouton 🎯 ou ⌥ + clic).', 'error'); return; }
            }
            if (mode === 'brush' && maskEdit) {
                const t = target(maskEdit); if (!t?.mask) { maskEdit = ''; setMode('brush'); return; }
                painting = {tool: 'mask', mask: true, layer: t, preview: {mode: maskMode, points: [[x / pw, y / ph]], size: brush * 2 / pw, soft: hard < 50, opacity: opac / 100}};
                canvas.setPointerCapture(e.pointerId); draw(); return;
            }
            if (mode === 'brush') {
                const l = activeL(); if (!l) return;
                if (lockedDeep(l)) return toast('Ce calque est verrouillé : choisis-en un autre dans Calques.', 'error');
                painting = {tool: 'brush', layer: l, preview: {type: 'brush', brush: brushType, color, size: (brushType === 'pencil' ? Math.min(brush, 4) : brush) * 2 / pw, opacity: opac / 100, points: [[x / pw, y / ph]]}};
                canvas.setPointerCapture(e.pointerId); draw(); return;
            }
            if (!P()) return toast('La photo n’est plus dans les calques : « ↺ Remettre la photo » (onglet Calques).', 'error');
            if (lockedDeep(P())) return toast('La photo est verrouillée (🔒 dans Calques).', 'error');
            painting = {tool: mode, dabs: [], from: new Uint8ClampedArray(srcData.data)};
            canvas.setPointerCapture(e.pointerId); dabAt(x, y);
        });
        canvas.addEventListener('pointermove', e => {
            if (panning) { stage.scrollLeft = panning.l - (e.clientX - panning.x); stage.scrollTop = panning.t - (e.clientY - panning.y); return; }
            showBrush(e);
            const [x, y] = toCanvas(e);
            if (drag?.persp !== undefined && persp) { persp[drag.persp] = [Math.min(1.2, Math.max(-0.2, x / pw)), Math.min(1.2, Math.max(-0.2, y / ph))]; draw(); return; }
            if (poly && !drag) { polyHover = [x, y]; draw(); return; }
            if (drag?.sel) { const d = drag.sel; if (d.kind === 'poly') d.pts.push([x, y]); else { let nx = x, ny = y; if (e.shiftKey && drag.how === 'new') { const s0 = Math.max(Math.abs(x - d.x0), Math.abs(y - d.y0)); nx = d.x0 + Math.sign(x - d.x0 || 1) * s0; ny = d.y0 + Math.sign(y - d.y0 || 1) * s0; } d.x1 = nx; d.y1 = ny; } draw(); return; }
            if ((drag?.imgSize || drag?.imgRot) && moveSel) { // agrandir / réduire (⇧ : sans garder les proportions) ou faire pivoter (⇧ : de 15° en 15°)
                const l = nodeById(moveSel.layer), op = l?.ops[moveSel.i]; if (!op) return;
                const cx = (op.x + op.w / 2) * pw, cy = (op.y + op.h / 2) * ph;
                if (drag.imgRot) { let a = Math.atan2(y - cy, x - cx) * 180 / Math.PI + 90; if (e.shiftKey) a = Math.round(a / 15) * 15; op.rot = Math.round(((a + 540) % 360) - 180); }
                else { // le coin opposé ne bouge pas (calcul dans le repère de l'image, qui peut être tournée)
                    const r = (op.rot || 0) * Math.PI / 180, [ax, ay] = drag.anchor, vx = x - ax, vy = y - ay;
                    let lw = Math.abs(vx * Math.cos(r) + vy * Math.sin(r)), lh = Math.abs(-vx * Math.sin(r) + vy * Math.cos(r));
                    if (!e.shiftKey) { if (lw / lh > drag.ratio) lh = lw / drag.ratio; else lw = lh * drag.ratio; }
                    lw = Math.max(8, lw); lh = Math.max(8, lh);
                    const sx = Math.sign(vx * Math.cos(r) + vy * Math.sin(r)) || 1, sy = Math.sign(-vx * Math.sin(r) + vy * Math.cos(r)) || 1;
                    const mx = ax + (sx * lw / 2) * Math.cos(r) - (sy * lh / 2) * Math.sin(r), my = ay + (sx * lw / 2) * Math.sin(r) + (sy * lh / 2) * Math.cos(r);
                    op.w = lw / pw; op.h = lh / ph; op.x = mx / pw - op.w / 2; op.y = my / ph - op.h / 2;
                }
                drag.moved = true; renderLayer(l); draw(); return;
            }
            if (drag?.move && moveSel) { const l = nodeById(moveSel.layer), op = l?.ops[moveSel.i]; if (!op) return; moveOp(op, (x - drag.x) / pw, (y - drag.y) / ph); drag.x = x; drag.y = y; drag.moved = true; renderLayer(l); draw(); return; }
            if (!painting) return;
            if (painting.tool === 'shape') { const p = painting.preview; let ex = x, ey = y; if (e.shiftKey) { if (['line', 'arrow'].includes(p.kind)) { const a = Math.round(Math.atan2(y - painting.y0, x - painting.x0) / (Math.PI / 4)) * Math.PI / 4, L = Math.hypot(x - painting.x0, y - painting.y0); ex = painting.x0 + Math.cos(a) * L; ey = painting.y0 + Math.sin(a) * L; } else { const s0 = Math.max(Math.abs(x - painting.x0), Math.abs(y - painting.y0)); ex = painting.x0 + Math.sign(x - painting.x0 || 1) * s0; ey = painting.y0 + Math.sign(y - painting.y0 || 1) * s0; } } p.x2 = ex / pw; p.y2 = ey / ph; draw(); return; }
            if (painting.tool === 'patch') { painting.patch.dx = (x - painting.x0) / pw; painting.patch.dy = (y - painting.y0) / ph; draw(); return; }
            if (painting.tool === 'brush' || painting.tool === 'mask') { const p = painting.preview.points, l = p[p.length - 1]; if (Math.hypot((x / pw - l[0]) * pw, (y / ph - l[1]) * ph) >= 1) { p.push([x / pw, y / ph]); draw(); } return; }
            dabAt(x, y);
        });
        canvas.addEventListener('pointerleave', () => { brushEl.hidden = true; if (!cloneSrc) srcEl.hidden = true; if (polyHover) { polyHover = null; draw(); } });
        const NAMES = {heal: 'Correcteur de taches', clone: 'Tampon de duplication'};
        const SHAPES = {rect: 'Rectangle', round: 'Rectangle arrondi', ellipse: 'Ellipse', line: 'Ligne', arrow: 'Flèche'};
        const endPaint = e => {
            if (panning) { panning = null; return; }
            if (drag?.zoom) { const d = drag; drag = null; const dx = Math.abs(e.clientX - d.x0), dy = Math.abs(e.clientY - d.y0);
                if (dx > 12 && dy > 12) { const r = stage.getBoundingClientRect(), f = Math.min(r.width / dx, r.height / dy); setZoom(zoom * f, (e.clientX + d.x0) / 2, (e.clientY + d.y0) / 2); }
                else setZoom(zoom * (d.alt || e.altKey ? 1 / 1.6 : 1.6), e.clientX, e.clientY); return; }
            if (drag?.sel) { const d = drag; drag = null; const s = d.sel;
                if (s.kind !== 'poly' && (Math.abs(s.x1 - s.x0) < 2 || Math.abs(s.y1 - s.y0) < 2)) { if (d.how === 'new' && selId) { selId = null; refreshLayers(); setMode(mode); draw(); commit('Désélectionner'); } else draw(); return; }
                if (s.kind === 'poly' && s.pts.length < 3) { draw(); return; }
                combine(shapeMask(s), d.how); return; }
            if (drag?.imgSize || drag?.imgRot) { const d = drag; drag = null; if (d.moved) { const l = nodeById(moveSel?.layer); refreshLayers(); commit(d.imgRot ? `Image tournée sur « ${l?.name || ''} »` : `Image agrandie / réduite sur « ${l?.name || ''} »`); } return; }
            if (drag?.move) { const d = drag; drag = null; if (d.moved) { const l = nodeById(moveSel?.layer); refreshLayers(); commit(`Élément déplacé sur « ${l?.name || ''} »`); } return; }
            if (!painting) return;
            const g = painting; painting = null;
            if (g.tool === 'shape') { const p = g.preview; if (Math.abs(p.x2 - p.x1) * pw < 2 && Math.abs(p.y2 - p.y1) * ph < 2) { draw(); return; } g.layer.ops.push(p); renderLayer(g.layer); draw(); refreshLayers(); commit(`${SHAPES[p.kind]} sur « ${g.layer.name} »`); return; }
            if (g.tool === 'patch') { const p = g.patch; if (Math.abs(p.dx * pw) < 1 && Math.abs(p.dy * ph) < 1) { draw(); return; } st.strokes.push({tool: 'patch', mask: p.mask, dx: p.dx, dy: p.dy}); rtReplayStrokes(srcData, [st.strokes[st.strokes.length - 1]], masks); strokeVer++; draw(); refreshLayers(); commit('Tampon : zone recopiée'); return; }
            if (g.tool === 'mask') { const t = g.layer; t.mask = [...(t.mask || []), g.preview]; draw(); refreshLayers(); commit(`Masque : ${g.preview.mode === 'hide' ? 'caché' : 'montré'} au pinceau`); return; }
            if (g.tool === 'brush') { g.layer.ops.push(g.preview); renderLayer(g.layer); draw(); refreshLayers(); commit(`${RT_BRUSHES.find(b => b[0] === g.preview.brush)?.[1] || 'Pinceau'} sur « ${g.layer.name} »`); return; }
            if (g.dabs.length) { st.strokes.push({tool: g.tool, dabs: g.dabs}); refreshLayers(); commit(NAMES[g.tool] + (g.dabs.length > 1 ? ` (${g.dabs.length} touches)` : '')); }
        };
        canvas.addEventListener('pointerup', endPaint); canvas.addEventListener('pointercancel', endPaint);
        canvas.addEventListener('pointerup', () => { if (drag?.persp !== undefined) drag = null; });
        // ── Recadrer et redresser : un cadre à poignées sur l'image (tournée de l'angle choisi) ──
        let crop = null; // le cadre pendant l'outil : {x, y, w, h, a} relatifs (0 à 1)
        const ratioSel = $('[data-rt-ratio]'), angleIn = $('[data-rt-angle]');
        const ratio = () => { const v = ratioSel.value; if (!v) return 0; return v === 'orig' ? pw / ph : Number(v); };
        function startCrop() { crop = st.crop ? {...st.crop} : {x: 0, y: 0, w: 1, h: 1, a: 0}; angleIn.value = crop.a; $('[data-rt-angle-out]').textContent = crop.a + '°'; syncCrop(); }
        function endCrop(apply) {
            if (apply && crop) { const full = crop.x <= 0.001 && crop.y <= 0.001 && crop.w >= 0.999 && crop.h >= 0.999 && !crop.a; st.crop = full ? null : {...crop}; commit(full ? 'Recadrage enlevé' : `Recadrage${crop.a ? ` et redressement (${crop.a}°)` : ''}`); }
            crop = null; syncCrop(); draw();
        }
        function syncCrop() {
            const on = mode === 'crop' && crop; cropEl.hidden = !on; canvas.style.transform = on && crop.a ? `rotate(${crop.a}deg)` : ''; overlay.style.transform = canvas.style.transform;
            if (!on) return;
            const W = canvas.offsetWidth, H = canvas.offsetHeight;
            Object.assign(cropEl.style, {left: canvas.offsetLeft + crop.x * W + 'px', top: canvas.offsetTop + crop.y * H + 'px', width: crop.w * W + 'px', height: crop.h * H + 'px'});
        }
        const fitRatio = (c, anchor = 'w') => { const r = ratio(); if (!r) return c; if (anchor === 'w') c.h = c.w * pw / ph / r; else c.w = c.h * ph * r / pw; if (c.h > 1) { c.h = 1; c.w = ph * r / pw; } if (c.w > 1) { c.w = 1; c.h = pw / ph / r; } c.x = Math.min(Math.max(0, c.x), 1 - c.w); c.y = Math.min(Math.max(0, c.y), 1 - c.h); return c; };
        ratioSel.addEventListener('change', () => { if (!crop) return; const cx = crop.x + crop.w / 2, cy = crop.y + crop.h / 2; fitRatio(crop); crop.x = Math.min(Math.max(0, cx - crop.w / 2), 1 - crop.w); crop.y = Math.min(Math.max(0, cy - crop.h / 2), 1 - crop.h); syncCrop(); });
        angleIn.addEventListener('input', () => { if (!crop) return; crop.a = Number(angleIn.value); $('[data-rt-angle-out]').textContent = crop.a + '°'; syncCrop(); });
        let cdrag = null;
        stage.addEventListener('pointerdown', e => {
            if (mode !== 'crop' || !crop || spaceDown) return;
            const h = e.target.closest('[data-ch]'), inside = e.target === cropEl;
            const W = canvas.offsetWidth, H = canvas.offsetHeight, wr = wrap.getBoundingClientRect();
            const rel = ev => [(ev.clientX - wr.left - canvas.offsetLeft) / W, (ev.clientY - wr.top - canvas.offsetTop) / H];
            const [x, y] = rel(e);
            if (!h && !inside && !(x >= 0 && y >= 0 && x <= 1 && y <= 1)) return;
            e.preventDefault(); const c0 = {...crop};
            cdrag = {h: h?.dataset.ch || (inside ? 'move' : 'new'), x, y, c0, rel};
            if (cdrag.h === 'new') { crop.x = x; crop.y = y; crop.w = 0.001; crop.h = 0.001; cdrag.h = 'se'; cdrag.c0 = {...crop}; }
            stage.setPointerCapture(e.pointerId);
        });
        stage.addEventListener('pointermove', e => {
            if (!cdrag) return; const [x, y] = cdrag.rel(e), dx = x - cdrag.x, dy = y - cdrag.y, c0 = cdrag.c0, h = cdrag.h, c = {...c0};
            if (h === 'move') { c.x = Math.min(Math.max(0, c0.x + dx), 1 - c0.w); c.y = Math.min(Math.max(0, c0.y + dy), 1 - c0.h); }
            else {
                if (h.includes('w')) { c.x = Math.min(Math.max(0, c0.x + dx), c0.x + c0.w - 0.02); c.w = c0.x + c0.w - c.x; }
                if (h.includes('e')) c.w = Math.min(Math.max(0.02, c0.w + dx), 1 - c0.x);
                if (h.includes('n')) { c.y = Math.min(Math.max(0, c0.y + dy), c0.y + c0.h - 0.02); c.h = c0.y + c0.h - c.y; }
                if (h.includes('s')) c.h = Math.min(Math.max(0.02, c0.h + dy), 1 - c0.y);
                if (ratio()) { const w0 = c.w, h0 = c.h; fitRatio(c, h === 'n' || h === 's' ? 'h' : 'w'); if (h.includes('w')) c.x = c0.x + c0.w - c.w; if (h.includes('n')) c.y = c0.y + c0.h - c.h; if (c.x < 0 || c.y < 0) { c.w = w0; c.h = h0; } }
            }
            Object.assign(crop, c); syncCrop();
        });
        const cropUp = () => { cdrag = null; }; stage.addEventListener('pointerup', cropUp); stage.addEventListener('pointercancel', cropUp);
        // ── Les commandes (menus du haut, barre d'options, raccourcis) ──
        const needSel = () => { if (!selId) { toast('Fais d’abord une sélection (outils ⬚ ◯ ➰ ✒︎ 🪄).', 'error'); return false; } return true; };
        const full = () => { const c = blankMask(), g = c.getContext('2d'); g.fillRect(0, 0, pw, ph); return c; };
        const downloadFull = async type => {
            if (mode === 'persp') setMode('adjust');
            try { const c = await renderFull(); const blob = await new Promise(r => c.toBlob(r, type, 0.93)); if (!blob) throw new Error('Image trop grande pour le navigateur.'); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${String(item.title || item.filename || 'photo').replace(/\.[a-z0-9]+$/i, '').replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 60) || 'photo'}-retouche.${type === 'image/png' ? 'png' : 'jpg'}`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
            catch (err) { toast(err.message, 'error'); }
        };
        /* ✨ Menu Filtre : un calque de réglage par filtre, une fenêtre pour le régler en direct */
        let lastFx = null;
        const fxNew = (key, params = null) => { const def = RT_FX[key]; const n = newAdjust(`Filtre : ${def[1]}`); n.st.filters = {chain: [{t: key, ...fxDefaults(key), ...(params || {})}]}; if (selId) n.mask = [{type: 'sel', mask: selId}]; return n; };
        function fxLast() { if (!lastFx) return toast('Aucun filtre utilisé pour l’instant (menu Filtre).'); const n = fxNew(lastFx.key, lastFx.params); refreshLayers(); syncControls(); draw(); commit(`Filtre « ${RT_FX[lastFx.key][1]} » (refait)`); toast(`« ${RT_FX[lastFx.key][1]} » refait sur un nouveau calque.`); return n; }
        function fxDialog(key, edit = null) {
            const def = RT_FX[key]; if (!def) return;
            let node, step, created = false;
            if (edit) { node = nodeById(edit.node); step = node?.st.filters?.chain?.[edit.i]; if (!step) return; }
            else { node = fxNew(key); step = node.st.filters.chain[0]; created = true; refreshLayers(); }
            activeLayer = node.id; refreshLayers(); syncControls(); draw();
            const before = JSON.stringify(step), op0 = node.opacity ?? 1;
            dlg.querySelector('.h-rt-fxpanel')?.remove();
            const pn = document.createElement('div'); pn.className = 'h-rt-fxpanel';
            pn.innerHTML = `<header><b>✨ ${esc(def[1])}</b><small>${esc(def[0])} · calque « ${esc(node.name)} »${node.mask ? ' · limité à la sélection' : ''}</small></header>
                ${def[2].map(([k, l, mn, mx, dv, stp]) => `<label class="h-rt-slider"><span>${esc(l)} <output data-fxo="${k}">${step[k] ?? dv}</output></span><input type="range" min="${mn}" max="${mx}" step="${stp || 1}" value="${step[k] ?? dv}" data-fxp="${k}"></label>`).join('')}
                <label class="h-rt-slider"><span>Opacité du calque (dosage) <output data-fxo="__op">${Math.round(op0 * 100)} %</output></span><input type="range" min="0" max="100" value="${Math.round(op0 * 100)}" data-fxp="__op"></label>
                <label class="checkbox-line"><input type="checkbox" data-fxprev checked> Aperçu</label>
                <div class="h-rt-fxbtns"><button type="button" class="button small secondary" data-fxreset>Valeurs de départ</button><span class="spacer"></span><button type="button" class="button small secondary" data-fxcancel>Annuler</button><button type="button" class="button small" data-fxok>✓ OK</button></div>
                <small class="muted">Rien n’est détruit : le filtre est sur son propre calque. Plus tard : Calques → le calque → onglet ✨ Filtres → « régler… ».</small>`;
            $('.h-rt-left').appendChild(pn);
            let tm = 0; const later = () => { clearTimeout(tm); tm = setTimeout(draw, 120); };
            pn.addEventListener('input', e => { const k = e.target.dataset.fxp; if (!k) return; const v = Number(e.target.value); if (k === '__op') { node.opacity = v / 100; pn.querySelector('[data-fxo="__op"]').textContent = v + ' %'; draw(); return; } step[k] = v; pn.querySelector(`[data-fxo="${k}"]`).textContent = v; later(); });
            pn.querySelector('[data-fxprev]').addEventListener('change', e => { node.visible = e.target.checked; draw(); });
            pn.querySelector('[data-fxreset]').addEventListener('click', () => { Object.assign(step, fxDefaults(key)); pn.querySelectorAll('[data-fxp]').forEach(i => { if (i.dataset.fxp !== '__op') { i.value = step[i.dataset.fxp]; pn.querySelector(`[data-fxo="${i.dataset.fxp}"]`).textContent = i.value; } }); draw(); });
            pn.querySelector('[data-fxcancel]').addEventListener('click', () => { pn.remove(); if (created) { const l = locate(node.id); if (l) l.arr.splice(l.arr.indexOf(node), 1); activeLayer = ''; } else { Object.keys(step).forEach(k => delete step[k]); Object.assign(step, JSON.parse(before)); node.opacity = op0; node.visible = true; } refreshLayers(); syncControls(); draw(); });
            pn.querySelector('[data-fxok]').addEventListener('click', () => { pn.remove(); node.visible = true; lastFx = {key, params: Object.fromEntries(def[2].map(([k]) => [k, step[k]]))}; refreshLayers(); syncControls(); draw(); commit(created ? `Filtre « ${def[1]} »` : `Filtre « ${def[1]} » réglé`); });
        }
        dlg.addEventListener('click', e => {
            const ed = e.target.closest('[data-rt-fxedit]'), del = e.target.closest('[data-rt-fxdel]'), up = e.target.closest('[data-rt-fxup]'), n = adjNode(); if (!n || !(ed || del || up)) return;
            const ch = n.st.filters?.chain || [], i = Number((ed || del || up).dataset[ed ? 'rtFxedit' : del ? 'rtFxdel' : 'rtFxup']);
            if (ed) return fxDialog(ch[i].t, {node: n.id, i});
            if (del) { ch.splice(i, 1); syncControls(); draw(); return commit('Filtre enlevé du calque'); }
            if (up && i > 0) { [ch[i - 1], ch[i]] = [ch[i], ch[i - 1]]; syncControls(); draw(); return commit('Ordre des filtres'); }
        });
        dlg.addEventListener('change', e => { if (!e.target.matches('[data-rt-fxadd]')) return; const k = e.target.value, n = adjNode(); e.target.value = ''; if (!k || !n) return; n.st.filters = n.st.filters || {}; const ch = n.st.filters.chain = n.st.filters.chain || []; ch.push({t: k, ...fxDefaults(k)}); syncControls(); fxDialog(k, {node: n.id, i: ch.length - 1}); });
        /* ⚡ Actions : les réglages de la photo (niveaux, courbe, filtres, colorisation…) et ses calques de réglage sans masque,
           gardés sous un nom, pour les remettre ici ou les appliquer d'un coup à plusieurs photos (une nouvelle version de chacune). */
        const ACT_KEY = 'genealogie-retouch-actions';
        const actList = () => { try { const v = JSON.parse(localStorage.getItem(ACT_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
        const actSave = l => { try { localStorage.setItem(ACT_KEY, JSON.stringify(l)); return true; } catch (_) { toast('Plus de place pour les actions : supprimes-en une.', 'error'); return false; } };
        const actOf = () => { const s0 = rtClone({...st}); ['strokes', 'crop', 'persp', '_persp0'].forEach(k => delete s0[k]);
            const adj = []; layers.forEach(n => { if (typeOf(n) === 'adjust' && n.visible && !n.mask && !n.clip) adj.push({name: n.name, opacity: n.opacity ?? 1, st: rtClone(n.st)}); });
            return {st: s0, adj}; };
        const actApplyHere = a => { Object.assign(st, rtDefault(), rtClone(a.st), {strokes: st.strokes, crop: st.crop, persp: st.persp}); (a.adj || []).forEach(x => { const n = newAdjust(x.name); n.opacity = x.opacity; n.st = {...adjDefault(), ...rtClone(x.st)}; }); refreshLayers(); syncControls(); commit(`Action « ${a.name} »`); };
        /** une action sur une image entière (en pleine taille) */
        const actRender = (im, a) => {
            const W = im.naturalWidth, H = im.naturalHeight, c = blank(W, H), g = c.getContext('2d', {willReadFrequently: true}); g.drawImage(im, 0, 0);
            const d = g.getImageData(0, 0, W, H); g.putImageData(rtApply(d, d, {...rtDefault(), ...a.st}), 0, 0);
            for (const x of a.adj || []) { const id = g.getImageData(0, 0, W, H), o = new ImageData(W, H); rtApply(id, o, {...adjDefault(), ...x.st}); const t = blank(W, H); t.getContext('2d').putImageData(o, 0, 0); g.globalAlpha = x.opacity ?? 1; g.drawImage(t, 0, 0); g.globalAlpha = 1; }
            return c;
        };
        function actionsDialog() {
            const d2 = document.createElement('dialog'); d2.className = 'modal h-modal h-modal-wide h-rt-actions';
            const draw2 = () => { const list = actList();
                d2.innerHTML = `<div class="modal-head"><div><span class="eyebrow">RETOUCHE</span><h2>⚡ Actions</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
                    <p class="muted">Une action garde les réglages de la photo (exposition, niveaux, courbe, teinte, filtres, poussière, colorisation…) et ses calques de réglage sans masque. On la remet sur une autre photo, ou sur plusieurs d’un coup : chacune reçoit une <b>nouvelle version</b>, l’original est gardé.</p>
                    <div class="h-rt-actnew"><input data-actname placeholder="Nom de l’action (ex. « Photos de l’album 1930 »)" maxlength="80"><button type="button" class="button small" data-actadd>＋ Enregistrer les réglages actuels</button></div>
                    ${list.length ? `<ol class="h-rt-actlist">${list.map((a, i) => `<li data-i="${i}"><strong>${esc(a.name)}</strong><small class="muted">${(a.adj || []).length ? `${a.adj.length} calque(s) de réglage · ` : ''}${new Date(a.at || Date.now()).toLocaleDateString('fr-FR')}</small>
                        <span><button type="button" class="button small secondary" data-acthere>Sur cette photo</button><button type="button" class="button small" data-actbatch>Sur plusieurs photos…</button><button type="button" class="icon-button danger" data-actdel title="Supprimer">🗑</button></span></li>`).join('')}</ol>` : '<p class="muted">Aucune action enregistrée.</p>'}
                    <div data-batch></div>`;
            };
            draw2(); document.body.appendChild(d2); d2.addEventListener('close', () => d2.remove());
            d2.addEventListener('click', async e => {
                if (e.target.closest('[data-x]')) return d2.close();
                if (e.target.closest('[data-actadd]')) { const name = d2.querySelector('[data-actname]').value.trim() || `Action du ${new Date().toLocaleDateString('fr-FR')}`; const l = actList(); l.push({name, at: Date.now(), ...actOf()}); if (actSave(l)) { toast(`Action « ${name} » enregistrée.`); draw2(); } return; }
                const li = e.target.closest('[data-i]'); if (!li) return; const list = actList(), a = list[Number(li.dataset.i)]; if (!a) return;
                if (e.target.closest('[data-actdel]')) { if (!confirm(`Supprimer l’action « ${a.name} » ?`)) return; list.splice(Number(li.dataset.i), 1); actSave(list); return draw2(); }
                if (e.target.closest('[data-acthere]')) { actApplyHere(a); d2.close(); return; }
                if (e.target.closest('[data-actbatch]')) return batchPanel(d2.querySelector('[data-batch]'), a);
            });
            d2.showModal();
        }
        function batchPanel(box, a) {
            const chosen = new Map();
            box.innerHTML = `<section class="h-rt-batch"><h3>« ${esc(a.name)} » sur plusieurs photos</h3><div class="h-rt-batchbar"><input type="search" data-bq placeholder="Chercher des photos (titre, cote, lieu…)"><label class="checkbox-line"><input type="checkbox" data-bshow checked> afficher la nouvelle version</label></div>
                <div class="h-rt-batchres" data-bres></div><p data-bsel class="muted">Aucune photo choisie.</p><div class="h-rt-batchgo"><button type="button" class="button" data-bgo disabled>Appliquer</button><progress data-bprog max="1" value="0" hidden></progress><small data-bstate></small></div></section>`;
            const res = box.querySelector('[data-bres]'), q = box.querySelector('[data-bq]'), go = box.querySelector('[data-bgo]');
            const syncSel = () => { box.querySelector('[data-bsel]').textContent = chosen.size ? `${chosen.size} photo(s) choisie(s).` : 'Aucune photo choisie.'; go.disabled = !chosen.size; };
            let t = 0; const search = async () => { const r = await api('list', {type: 'media', q: q.value.trim(), limit: 80}).catch(() => ({rows: []}));
                const rows = (r.rows || []).filter(m => (m.media_type || 'image') === 'image' && /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i.test(m.filename || ''));
                res.innerHTML = rows.map(m => `<label class="h-rt-bpick ${chosen.has(m.id) ? 'is-on' : ''}"><input type="checkbox" value="${m.id}" ${chosen.has(m.id) ? 'checked' : ''}><img src="media/${encodeURIComponent(m.thumbnail || m.filename)}" alt="" loading="lazy"><small>${esc(m.title || m.filename)}</small></label>`).join('') || '<p class="muted">Aucune photo trouvée.</p>';
                res.querySelectorAll('input').forEach(c => c.addEventListener('change', () => { const m = rows.find(x => String(x.id) === c.value); if (c.checked) chosen.set(m.id, m); else chosen.delete(m.id); c.closest('label').classList.toggle('is-on', c.checked); syncSel(); })); };
            q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(search, 250); }); search();
            go.addEventListener('click', async () => {
                const list = [...chosen.values()], prog = box.querySelector('[data-bprog]'), state = box.querySelector('[data-bstate]'), show = box.querySelector('[data-bshow]').checked;
                go.disabled = true; prog.hidden = false; prog.max = list.length; let ok = 0;
                for (const [i, m] of list.entries()) {
                    state.textContent = `${i + 1} / ${list.length} : ${m.title || m.filename}`;
                    try {
                        const im = new Image(); im.src = `media/${encodeURIComponent(m.filename)}?v=${Date.now()}`; await im.decode();
                        const c = actRender(im, a), png = /\.png$/i.test(m.filename), blob = await new Promise(r => c.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.93));
                        const fd = new FormData(); fd.append('file', blob, 'retouche.' + (png ? 'png' : 'jpg')); fd.append('media_id', m.id); fd.append('mode', 'version'); fd.append('show', show ? '1' : '0'); fd.append('csrf', A().state.csrf);
                        const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}}); const j = await r.json().catch(() => ({}));
                        if (!r.ok || j.error) throw new Error(j.error || 'refusé'); ok++;
                    } catch (err) { toast(`${m.title || m.filename} : ${err.message}`, 'error'); }
                    prog.value = i + 1;
                }
                state.textContent = `Terminé : ${ok} photo(s) sur ${list.length}${show ? ', nouvelle version affichée' : ''}.`; toast(state.textContent); go.disabled = false;
            });
        }
        async function cmd(k) {
            dlg.querySelectorAll('details.h-rt-menu[open]').forEach(d => d.removeAttribute('open'));
            const [a, b] = k.split(':');
            if (a === 'tab') return showTab(b);
            if (a === 'mode') return setMode(b);
            if (a === 'save') return dlg.querySelector(`[data-rt-save="${b}"]`)?.click();
            if (k === 'side:toggle') return setSideClosed(!dlg.classList.contains('rt-side-closed'));
            if (k === 'proj:save') return saveProject();
            if (k === 'proj:saveas') return saveProject(true);
            if (k === 'proj:open') return openProjects();
            if (a === 'download') return downloadFull(b === 'png' ? 'image/png' : 'image/jpeg');
            if (k === 'close') return askClose();
            if (k === 'simple') { // la retouche simple de la 0.5.0 (le choix est retenu pour la prochaine fois)
                if (!saved && hpos > 0 && !(projId && curKey() === projKey) && !confirm('Passer à la retouche simple ? Les retouches en cours seront perdues (💾 Enregistrer le projet les garde pour plus tard).')) return;
                try { localStorage.setItem('genealogie-retouch-mode', 'simple'); } catch (_) {}
                saved = true; dlg.close(); return ext.openRetouchSimple?.(source);
            }
            if (k === 'undo') return restore(hpos - 1);
            if (k === 'redo') return restore(hpos + 1);
            if (a === 'preset') return dlg.querySelector(`[data-rt-preset="${b}"]`)?.click();
            if (k === 'reset') return $('[data-rt-reset]').click();
            if (k === 'cropok') { endCrop(true); return setMode('adjust'); }
            if (k === 'cropclear') { if (mode === 'crop') { crop = {x: 0, y: 0, w: 1, h: 1, a: 0}; angleIn.value = 0; $('[data-rt-angle-out]').textContent = '0°'; syncCrop(); } if (st.crop) { st.crop = null; draw(); commit('Recadrage enlevé'); } return; }
            if (k === 'img:place') return placeDialog();
            if (k === 'actions') return actionsDialog();
            if (a === 'fx') return b === 'last' ? fxLast() : fxDialog(b);
            if (k === 'sel:subject') {
                help.textContent = 'Recherche du sujet…'; await new Promise(r => setTimeout(r, 30));
                const {mask, found} = rtSubject(photo(), pw, ph, tol); help.textContent = HELP[optsFor(mode)] || '';
                if (!found) return toast('Sujet introuvable : le fond touche tout le bord. Essaie avec moins de tolérance (🪄), ou le lasso.', 'error');
                if (!SELTOOLS.includes(mode)) setMode('wand');
                toast('Sujet sélectionné : ⇧ + baguette ou lasso pour ajouter, ⌥ pour enlever ; « Masque » pour l’appliquer. Tolérance (🪄) : jusqu’où va le fond.');
                return combine(mask, 'new', 'Sujet sélectionné');
            }
            if (k === 'straighten:auto') {
                const a = rtAutoAngle(srcData); if (Math.abs(a) < 0.25) return toast('La photo semble déjà droite.');
                const r = Math.abs(a) * Math.PI / 180, sc = Math.min(1 / (Math.cos(r) + ph / pw * Math.sin(r)), 1 / (Math.cos(r) + pw / ph * Math.sin(r)));
                const c = {x: (1 - sc) / 2, y: (1 - sc) / 2, w: sc, h: sc, a: -a};
                if (mode === 'crop') { crop = c; angleIn.value = c.a; $('[data-rt-angle-out]').textContent = c.a + '°'; syncCrop(); return toast(`Redressée de ${-a}° : ajuste le cadre puis « ✓ Valider ».`); }
                st.crop = c; draw(); toast(`Photo redressée de ${-a}° (et recadrée pour ne pas voir les coins). ⌗ Recadrer pour ajuster.`); return commit(`Redressée automatiquement (${-a}°)`);
            }
            if (k === 'persp:ok') { if (!persp) return; if (st.strokes.length && !confirm('Des corrections (taches, tampon) sont déjà faites : elles vont bouger avec la remise à plat. Continuer ?')) return; st.persp = persp.map(p => [...p]); persp = null; applyBase(); setMode('adjust'); return commit('Perspective redressée'); }
            if (k === 'persp:reset') { persp = [[0, 0], [1, 0], [1, 1], [0, 1]]; return draw(); }
            if (k === 'persp:cancel') { persp = null; return setMode('adjust'); }
            if (k === 'persp:clear') { if (!st.persp) return; st.persp = null; applyBase(); return commit('Perspective enlevée'); }
            if (k === 'deglare') { toast(`Reflets retirés sur un calque à part${selId ? ' (seulement dans la sélection : fais d’abord une sélection de la vitre pour limiter)' : ''} : règle la force et la taille, l’opacité dose, 🎭 limite, 👁 cache. La photo n’est pas touchée.`); return fxDialog('deglare'); }
            if (k === 'colorize:auto') {
                const n = newAdjust('Colorisation'); n.st.gmap = 'autochrome'; n.st.gmap_amt = 70;
                if (selId) { n.mask = [{type: 'sel', mask: selId}]; }
                refreshLayers(); syncControls(); draw(); showTab('adjust'); $$('.h-rt-levels')[1]?.setAttribute('open', '');
                toast(`Colorisation dans un calque de réglage${selId ? ' (limitée à la sélection)' : ''} : choisis les couleurs et la force ; 🎭 pour la limiter, 👁 pour la cacher. La photo n’est pas touchée.`);
                return commit('Calque de colorisation');
            }
            if (k === 'colorize:paint') {
                const l = newLayer('Couleurs (pinceau)'); l.blend = 'color'; l.opacity = 0.8; maskEdit = ''; brushType = 'soft'; syncBrushType(); setColor('#e2b195'); refreshLayers(); setMode('brush'); showTab('layers');
                toast('Peins les couleurs (pinceau doux) : le calque est en fusion « Couleur », la lumière de la photo est gardée. 🧽 pour corriger, opacité du calque pour doser.');
                return commit('Calque de couleurs (pinceau)');
            }
            if (a === 'restore') { // 🧭 la restauration pas à pas
                const step = dlg.querySelector(`[data-rt-step] [data-rt-cmd="${CSS.escape(k)}"]`)?.closest('[data-rt-step]'); step?.querySelector('.h-rt-stepok')?.removeAttribute('hidden');
                if (b === 'spots') {
                    help.textContent = 'Recherche des taches…'; await new Promise(r => setTimeout(r, 30));
                    const inside = selId ? rtMaskAlpha(masks.get(selId), pw, ph) : null;
                    const dabs = rtSpots(srcData, Number($('[data-rt-spotf]')?.value || 50), Number($('[data-rt-spots]')?.value || 6), inside); help.textContent = HELP[optsFor(mode)] || '';
                    if (!dabs.length) return toast('Aucune tache trouvée : augmente la sensibilité ou la taille.');
                    const g = {tool: 'heal', dabs}; st.strokes.push(g); rtReplayStrokes(srcData, [g], masks); strokeVer++; draw(); refreshLayers();
                    toast(`${dabs.length} tache${dabs.length > 1 ? 's' : ''} enlevée${dabs.length > 1 ? 's' : ''} : compare avec 👁 ; ↶ si c’est trop.`);
                    return commit(`Taches enlevées automatiquement (${dabs.length})`);
                }
                if (b === 'yellow') { // chaque couleur ramenée à la plage de la luminosité (sombre et clair) : la dominante (jaune, rose) s'en va, le contraste reste
                    const hs = [0, 1, 2, 3].map(() => new Uint32Array(256)), d = srcData.data, n = d.length / 4;
                    for (let i = 0; i < d.length; i += 4) { hs[0][d[i]]++; hs[1][d[i + 1]]++; hs[2][d[i + 2]]++; hs[3][Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++; }
                    const pct = (h, p) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += h[v]; if (acc >= n * p) return v; } return 255; };
                    const L0 = pct(hs[3], .01), L1 = Math.max(L0 + 10, pct(hs[3], .99)), mid = (L0 + L1) / 2;
                    ['r', 'g', 'b'].forEach((c, i) => { const lo = pct(hs[i], .01), hi = Math.max(lo + 8, pct(hs[i], .99)), mc = (lo + hi) / 2, k = (L1 - L0) / (hi - lo); // la même pente pour toutes, chaque couleur recentrée
                        const f = v => Math.round(Math.max(0, Math.min(255, mid + (v - mc) * k))); st.curves[c] = [[0, f(0)], [lo, L0], [hi, L1], [255, f(255)]].filter((q, j, arr) => j === 0 || q[0] > arr[j - 1][0]); });
                    syncControls(); draw(); return commit('Jaunissement enlevé (chaque couleur remise à sa place)');
                }
                if (b === 'face') {
                    if (!selId) { setMode('ellipsesel'); return toast('Entoure d’abord le visage avec l’ellipse ◯ (glisse sur la photo), puis reclique « Visage plus net ».'); }
                    const n = newAdjust('Visage plus net'); n.st.filters = {chain: [{t: 'denoise2', ...fxDefaults('denoise2'), amount: 30}, {t: 'unsharp', ...fxDefaults('unsharp'), amount: 140, r: 1.4, thr: 4}]}; n.mask = [{type: 'sel', mask: selId}];
                    refreshLayers(); syncControls(); draw(); toast('Visage débruité et accentué sur un calque à part : son opacité dose l’effet.'); return commit('Visage plus net');
                }
                if (b === 'tear') { setMode('heal'); const sz = $('[data-rt-size]'); if (sz) { sz.value = 26; sz.dispatchEvent(new Event('input', {bubbles: true})); } return toast('Correcteur prêt : glisse le long de la rayure ou du pli (zoome pour être précis).'); }
                if (b === 'color') { const c = k.slice('restore:color:'.length); const l = nodeById(activeLayer); if (!(l && typeOf(l) === 'layer' && l.blend === 'color')) await cmd('colorize:paint'); setColor(c); setMode('brush'); return; }
                return;
            }
            if (k === 'ladd') { newLayer(); refreshLayers(); showTab('layers'); return commit('Nouveau calque'); }
            if (k === 'gadd') { newGroup(); refreshLayers(); showTab('layers'); return commit('Nouveau groupe'); }
            if (k === 'gwrap') { showTab('layers'); return groupWrap(); }
            if (k === 'aadd') { newAdjust(); refreshLayers(); syncControls(); draw(); showTab('adjust'); return commit('Nouveau calque de réglage'); }
            if (a === 'zoom') return ({in: () => setZoom(zoom * 1.5), out: () => setZoom(zoom / 1.5), fit: () => setZoom(1), 100: () => setZoom(scale / fitScale())})[b]?.();
            if (k === 'filters:reset') { T().filters = {}; syncControls(); return commit('Filtres enlevés'); }
            if (k === 'sel:all') return combine(full(), 'new', 'Tout sélectionner');
            if (k === 'sel:none') { if (!selId) return; selId = null; refreshLayers(); setMode(mode); draw(); return commit('Désélectionner'); }
            if (k === 'mask:add') { const id = activeLayer && nodeById(activeLayer) ? activeLayer : 'photo', t = target(id); if (!t) return toast('Choisis d’abord un calque.', 'error'); if (t.mask) return toast('Ce calque a déjà un masque.'); addMaskTo(id, []); showTab('layers'); setMode('brush'); return commit('Masque ajouté'); }
            if (k === 'mask:hideall' || k === 'mask:selhide') { // masque négatif (⌥ + 🎭 dans Photoshop)
                const id = activeLayer && nodeById(activeLayer) ? activeLayer : 'photo', t = target(id); if (!t) return toast('Choisis d’abord un calque.', 'error'); if (t.mask) return toast('Ce calque a déjà un masque.');
                if (k === 'mask:selhide' && !selId) return toast('Fais d’abord une sélection.', 'error');
                addMaskTo(id, k === 'mask:selhide' ? [{type: 'sel', mask: selId, invert: true}] : [{type: 'all', mode: 'hide'}]); showTab('layers'); setMode('brush'); return commit(k === 'mask:selhide' ? 'Masque qui cache la sélection' : 'Masque qui cache tout');
            }
            if (k === 'mask:invert' || k === 'mask:del') { const id = maskEdit || (activeLayer && nodeById(activeLayer) ? activeLayer : 'photo'), t = target(id); if (!t?.mask) return toast('Ce calque n’a pas de masque (Calque → Ajouter un masque).', 'error'); if (k === 'mask:invert') t.mask = [...t.mask, {type: 'invert'}]; else { t.mask = null; if (maskEdit === id) maskEdit = ''; setMode(mode); } refreshLayers(); draw(); return commit(k === 'mask:invert' ? 'Masque inversé' : 'Masque retiré'); }
            if (!a.startsWith('sel') && k !== 'mask:sel') return;
            if (!needSel()) return;
            const m = masks.get(selId);
            if (k === 'sel:invert') { const c = full(), g = c.getContext('2d'); g.globalCompositeOperation = 'destination-out'; g.drawImage(m, 0, 0); return combine(c, 'new', 'Sélection inversée'); }
            if (k === 'sel:feather' || k === 'sel:grow' || k === 'sel:shrink') {
                const v = Number(String(await A().askText({title: {['sel:feather']: 'Contour progressif', ['sel:grow']: 'Agrandir la sélection', ['sel:shrink']: 'Réduire la sélection'}[k], message: 'De combien de points (de l’aperçu) ?', value: '8', inputMode: 'numeric', okLabel: 'Appliquer'}) || '').replace(',', '.'));
                if (!(v > 0)) return; const r = Math.min(200, v);
                return combine(k === 'sel:feather' ? blurMask(r) : blurMask(r / 2, k === 'sel:grow' ? 8 : 247), 'new', `${{['sel:feather']: 'Contour progressif', ['sel:grow']: 'Sélection agrandie', ['sel:shrink']: 'Sélection réduite'}[k]} (${r})`);
            }
            if (k === 'sel:copy') { const l = newLayer('Copie de la sélection'); l.ops.push({type: 'pixels', mask: selId, dx: 0, dy: 0, opacity: 1}); renderLayer(l); refreshLayers(); draw(); showTab('layers'); return commit('Sélection copiée sur un calque'); }
            if (k === 'sel:fill') { let l = activeL(); if (!l || lockedDeep(l)) { l = newLayer('Remplissage'); } l.ops.push({type: 'fillmask', mask: selId, color, opacity: opac / 100}); renderLayer(l); refreshLayers(); draw(); return commit(`Sélection remplie (${color})`); }
            if (k === 'sel:clear') { st.strokes.push({tool: 'clear', mask: selId}); rtReplayStrokes(srcData, [st.strokes[st.strokes.length - 1]], masks); strokeVer++; draw(); refreshLayers(); toast('Zone effacée de la photo : elle sera transparente (image enregistrée en PNG).'); return commit('Sélection effacée'); }
            if (k === 'mask:sel') { const id = activeLayer && nodeById(activeLayer) ? activeLayer : 'photo'; if (!target(id)) return toast('Choisis d’abord un calque.', 'error'); addMaskTo(id, [{type: 'sel', mask: selId}]); showTab('layers'); return commit(`Masque d’après la sélection (${id === 'photo' ? 'photo' : target(id).name})`); }
            if (k === 'sel:crop') { const bx = maskBox(m); if (!bx) return; st.crop = {x: bx.x / pw, y: bx.y / ph, w: bx.w / pw, h: bx.h / ph, a: 0}; selId = null; refreshLayers(); draw(); return commit('Recadré sur la sélection'); }
        }
        dlg.addEventListener('input', e => { const r = e.target.closest('[data-rt-spotf],[data-rt-spots]'); if (r) dlg.querySelector(r.matches('[data-rt-spotf]') ? '[data-rt-spotf-out]' : '[data-rt-spots-out]').textContent = r.value; });
        dlg.addEventListener('click', e => {
            const c = e.target.closest('[data-rt-cmd]'); if (c) { e.preventDefault(); cmd(c.dataset.rtCmd); return; }
            if (!e.target.closest('details.h-rt-menu')) dlg.querySelectorAll('details.h-rt-menu[open]').forEach(d => d.removeAttribute('open'));
        });
        // un seul menu ouvert à la fois ; on passe de l'un à l'autre au survol (comme une vraie barre de menus)
        $$('details.h-rt-menu').forEach(d => {
            d.addEventListener('toggle', () => { if (d.open) $$('details.h-rt-menu').forEach(o => { if (o !== d) o.removeAttribute('open'); }); });
            d.querySelector('summary').addEventListener('mouseenter', () => { if ($$('details.h-rt-menu').some(o => o.open && o !== d)) d.setAttribute('open', ''); });
        });
        // ── Courbe et réglages ──
        const svg = $('[data-rt-curve]');
        const drawCurve = () => {
            const lut = curveLut(T().curves[channel]);
            $('[data-rt-line]').setAttribute('d', 'M' + Array.from(lut, (v, x) => `${x},${256 - v}`).join(' L'));
            $('[data-rt-line]').dataset.ch = channel;
            const pts = T().curves[channel];
            if (selPt >= pts.length) selPt = -1;
            $('[data-rt-points]').innerHTML = pts.map(([x, y], i) => `<circle cx="${x}" cy="${256 - y}" r="${i === selPt ? 7 : 5.5}" data-rt-pt="${i}" class="${i === selPt ? 'is-sel' : ''}${i === outside ? ' is-out' : ''}"/>`).join('');
            const del = $('[data-rt-ptdel]'); if (del) del.disabled = !(selPt >= 0 && pts.length > 2);
        };
        function syncControls() {
            [...RT_SLIDERS, ...RT_LEVELS, ['gmap_amt']].forEach(([k]) => { const v = T()[k] ?? rtDefault()[k]; $(`[data-rt="${k}"]`).value = v; $(`[data-rt-out="${k}"]`).textContent = fmtV(k, v); });
            $('[data-rt-gmap]').value = T().gmap || '';
            ['bw', 'sepia', 'invert'].forEach(k => { $(`[data-rt-t="${k}"]`).checked = !!T()[k]; });
            RT_FILTERS.forEach(([k]) => { const v = T().filters?.[k] || 0; $(`[data-rt-f="${k}"]`).value = v; $(`[data-rt-fout="${k}"]`).textContent = v; });
            const fxl = $('[data-rt-fxlist]'), an = adjNode(), ch = an?.st.filters?.chain || [];
            if (fxl) fxl.innerHTML = an ? `<div class="h-rt-fxl"><b>Filtres de ce calque</b>${ch.length ? `<ol>${ch.map((st0, i) => `<li><span>${esc(RT_FX[st0.t]?.[1] || st0.t)}</span><button type="button" class="link-button" data-rt-fxedit="${i}">régler…</button>${i ? `<button type="button" class="icon-button small" data-rt-fxup="${i}" title="Plus tôt">↑</button>` : ''}<button type="button" class="icon-button small" data-rt-fxdel="${i}" title="Enlever">✕</button></li>`).join('')}</ol>` : '<p class="muted">Aucun.</p>'}
                <label>＋ Ajouter <select data-rt-fxadd><option value="">un filtre…</option>${['Flou', 'Bruit', 'Netteté', 'Esthétiques', 'Artistiques', 'Pixellisation', 'Rendu', 'Déformation', 'Autres'].map(cat => `<optgroup label="${cat}">${Object.entries(RT_FX).filter(([, f]) => f[0] === cat).map(([k, f]) => `<option value="${k}">${esc(f[1])}</option>`).join('')}</optgroup>`).join('')}</select></label></div>`
                : '<p class="muted">✨ Menu <b>Filtre</b> : chaque filtre se pose sur son propre calque (rien n’est détruit) : on le règle, on le dose avec l’opacité du calque, on le limite avec un masque 🎭, on le cache 👁.</p>';
            drawCurve(); draw(); syncTarget();
        }
        const label = k => [...RT_SLIDERS, ...RT_LEVELS, ['gmap_amt', 'Colorisation']].find(x => x[0] === k)?.[1] || k;
        const fmtV = (k, v) => RT_SLIDERS.some(x => x[0] === k) && v > 0 ? '+' + v : v;
        const flabel = k => RT_FILTERS.find(x => x[0] === k)?.[1] || k;
        dlg.addEventListener('input', e => {
            const k = e.target.dataset.rt; if (k) { T()[k] = Number(e.target.value); $(`[data-rt-out="${k}"]`).textContent = fmtV(k, T()[k]); draw(); }
            const f = e.target.dataset.rtF; if (f) { T().filters = {...(T().filters || {}), [f]: Number(e.target.value)}; $(`[data-rt-fout="${f}"]`).textContent = T().filters[f]; draw(); }
        });
        dlg.addEventListener('change', e => {
            const k = e.target.dataset.rt; if (k) commit(`${label(k)} : ${fmtV(k, T()[k])}`);
            if (e.target.matches('[data-rt-gmap]')) { T().gmap = e.target.value; draw(); commit(`Colorisation : ${RT_GMAPS[T().gmap][0]}`); }
            const f = e.target.dataset.rtF; if (f) commit(`${flabel(f)} : ${T().filters[f]}`);
            const t = e.target.dataset.rtT; if (t) { T()[t] = e.target.checked; if (t === 'bw' && T().bw) T().sepia = false; if (t === 'sepia' && T().sepia) T().bw = false; syncControls(); commit(`${{bw: 'Noir et blanc', sepia: 'Sépia', invert: 'Négatif'}[t]} ${T()[t] ? 'oui' : 'non'}`); }
        });
        $$('[data-rt-ch]').forEach(b => b.addEventListener('click', () => { channel = b.dataset.rtCh; selPt = -1; $$('[data-rt-ch]').forEach(x => x.classList.toggle('is-active', x === b)); drawCurve(); }));
        let rtLastPreset = null; // un préréglage cliqué une 2e fois sur le même calque : retour à l'état d'avant
        $$('[data-rt-preset]').forEach(b => b.addEventListener('click', () => { const tg0 = T(), i0 = Number(b.dataset.rtPreset);
            if (rtLastPreset && rtLastPreset.tg === tg0 && rtLastPreset.i === i0 && rtLastPreset.after === JSON.stringify(snapshot())) { /* seulement si rien n'a bougé depuis (⌘Z, curseur, remise à zéro…) */ const keep0 = {strokes: tg0.strokes, filters: tg0.filters, crop: tg0.crop, persp: tg0.persp}; Object.keys(tg0).forEach(k => { if (!(k in keep0)) delete tg0[k]; }); Object.assign(tg0, JSON.parse(rtLastPreset.before)); Object.entries(keep0).forEach(([k, v]) => { if (v !== undefined) tg0[k] = v; }); rtLastPreset = null; syncControls(); commit(`Préréglage « ${RT_PRESETS[i0][0]} » retiré`); return; }
            rtLastPreset = {tg: tg0, i: i0, before: JSON.stringify({...tg0, strokes: undefined, filters: undefined, crop: undefined, persp: undefined})}; })); // (avant l'application ci-dessous)
        $$('[data-rt-preset]').forEach(b => b.addEventListener('click', () => { if (!rtLastPreset || rtLastPreset.i !== Number(b.dataset.rtPreset)) return; const tg = T(), keep = tg === st ? {bw: false, sepia: false, invert: false, strokes: st.strokes, filters: st.filters, crop: st.crop, persp: st.persp} : {bw: false, sepia: false, invert: false, filters: tg.filters}; Object.assign(tg, rtDefault(), keep); if (tg !== st) { delete tg.crop; delete tg.persp; } RT_PRESETS[Number(b.dataset.rtPreset)][1](tg); if (tg._auto) { delete tg._auto; rtAuto(srcData, tg); if (tg !== st) { delete tg.strokes; delete tg.crop; delete tg.persp; } } syncControls(); commit(`Préréglage « ${RT_PRESETS[Number(b.dataset.rtPreset)][0]} »`); rtLastPreset.after = JSON.stringify(snapshot()); }));
        $('[data-rt-lvlauto]').addEventListener('click', () => { // les 0,5 % extrêmes deviennent noir et blanc, le milieu reste au milieu
            const h = new Array(256).fill(0); let n = 0; for (let i = 0; i < srcData.data.length; i += 16) { h[Math.round(0.299 * srcData.data[i] + 0.587 * srcData.data[i + 1] + 0.114 * srcData.data[i + 2])]++; n++; }
            let lo = 0, hi = 255, acc = 0; while (lo < 250 && (acc += h[lo]) < n * 0.005) lo++; acc = 0; while (hi > lo + 5 && (acc += h[hi]) < n * 0.005) hi--;
            let mid = 0; acc = 0; while (mid < 255 && (acc += h[mid]) < n / 2) mid++;
            const t = Math.min(0.95, Math.max(0.05, (mid - lo) / Math.max(1, hi - lo))), g = Math.round(Math.min(300, Math.max(10, Math.log(t) / Math.log(0.5) * 100)));
            Object.assign(T(), {lvl_in_b: lo, lvl_in_w: hi, lvl_gamma: g}); syncControls(); commit('Niveaux automatiques');
        });
        $('[data-rt-reset]').addEventListener('click', () => { const tg = T(); Object.assign(tg, rtDefault(), tg === st ? {strokes: st.strokes, filters: st.filters, crop: st.crop, persp: st.persp} : {filters: tg.filters}); if (tg !== st) { delete tg.crop; delete tg.persp; } syncControls(); commit('Réglages remis à zéro'); });
        const before = $('[data-rt-before]');
        const setBefore = v => { showBefore = v; before.classList.toggle('is-active', v); draw(); };
        before.addEventListener('pointerdown', () => setBefore(true));
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => before.addEventListener(t, () => showBefore && setBefore(false)));
        const rawPoint = e => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 268 - 6, 256 - ((e.clientY - r.top) / r.height * 268 - 6)]; };
        const svgPoint = e => rawPoint(e).map(v => Math.round(clamp255(v)));
        const removePoint = i => { const pts = T().curves[channel]; if (i < 0 || pts.length <= 2) return; pts.splice(i, 1); selPt = -1; drawCurve(); draw(); commit('Point de courbe enlevé'); };
        let dragging = -1;
        svg.setAttribute('tabindex', '0');
        svg.addEventListener('pointerdown', e => {
            const pts = T().curves[channel], hit = e.target.closest('[data-rt-pt]');
            if (hit) dragging = Number(hit.dataset.rtPt);
            else { const [x, y] = svgPoint(e); if (pts.some(p => Math.abs(p[0] - x) < 6)) return; pts.push([x, y]); pts.sort((a, b) => a[0] - b[0]); dragging = pts.findIndex(p => p[0] === x); }
            selPt = dragging; outside = -1; svg.focus(); svg.setPointerCapture(e.pointerId); drawCurve(); draw();
        });
        svg.addEventListener('pointermove', e => {
            if (dragging < 0) return;
            const pts = T().curves[channel], [rx, ry] = rawPoint(e), [x, y] = svgPoint(e);
            outside = pts.length > 2 && (rx < -30 || rx > 286 || ry < -30 || ry > 286) ? dragging : -1;
            const lo = dragging > 0 ? pts[dragging - 1][0] + 1 : 0, hi = dragging < pts.length - 1 ? pts[dragging + 1][0] - 1 : 255;
            if (outside < 0) pts[dragging] = [Math.min(hi, Math.max(lo, x)), y];
            drawCurve(); draw();
        });
        const release = () => { if (dragging >= 0 && outside === dragging) { outside = -1; removePoint(dragging); } else if (dragging >= 0) commit(`Courbe ${RT_CHANNELS.find(c => c[0] === channel)[1]}`); dragging = -1; outside = -1; drawCurve(); };
        svg.addEventListener('pointerup', release); svg.addEventListener('pointercancel', release);
        svg.addEventListener('contextmenu', e => { const hit = e.target.closest('[data-rt-pt]'); if (hit) { e.preventDefault(); removePoint(Number(hit.dataset.rtPt)); } });
        $('[data-rt-ptdel]').addEventListener('click', () => removePoint(selPt));
        // ── Clavier : outils (V M L P W C J S B U T H Z), ⌘Z / ⇧⌘Z, ⌘A ⌘D ⇧⌘I ⌘J, [ ] taille, + − 0 1 zoom, espace, ⌫ ──
        const typing = e => e.target.closest?.('input:not([type=range]):not([type=checkbox]):not([type=color]):not([type=radio]), textarea, select, [contenteditable]');
        const onKey = e => {
            if (!dlg.open || typing(e) || document.querySelector('dialog[open].ask-text-dialog')) return;
            const mod = (e.metaKey || e.ctrlKey) && !e.getModifierState?.('AltGraph') && !(e.ctrlKey && e.altKey && e.key === '\\'), k = e.key.toLowerCase(); // AltGr (clavier AZERTY Windows) arrive comme Ctrl+Alt : ce n'est pas un raccourci (« \ » = AltGr+8)
            if (mod && k === 'z') { e.preventDefault(); e.stopImmediatePropagation(); restore(e.shiftKey ? hpos + 1 : hpos - 1); return; }
            if (mod && k === 's') { e.preventDefault(); e.stopImmediatePropagation(); saveProject(e.shiftKey); return; }
            if (mod && ['a', 'd', 'i', 'j', 'g', 'f'].includes(k)) { if (k === 'i' && !e.shiftKey) return; e.preventDefault(); e.stopImmediatePropagation(); cmd({a: 'sel:all', d: 'sel:none', i: 'sel:invert', j: 'sel:copy', g: 'gwrap', f: 'fx:last'}[k]); return; }
            if (mod) return;
            if (e.key === '\\') { const n = nodeById(maskEdit || activeLayer || 'photo'); if (!n?.mask) { toast('Ce calque n’a pas de masque.'); return; } e.preventDefault(); e.stopImmediatePropagation(); maskShow = maskShow?.id === n.id && maskShow.mode === 'ruby' ? null : {id: n.id, mode: 'ruby'}; refreshLayers(); draw(); if (maskShow) toast('Masque en rouge : ce qui est caché (touche \\ pour revenir)'); return; }
            if (e.key === 'Escape' && dlg.querySelector('details.h-rt-menu[open]')) { e.preventDefault(); e.stopImmediatePropagation(); dlg.querySelectorAll('details.h-rt-menu[open]').forEach(d => d.removeAttribute('open')); return; }
            if (e.key === 'Escape' && mode === 'persp') { e.preventDefault(); e.stopImmediatePropagation(); cmd('persp:cancel'); return; }
            if (e.key === 'Escape' && (poly || mode === 'crop' || moveSel)) { e.preventDefault(); e.stopImmediatePropagation(); if (poly) { poly = null; polyHover = null; draw(); } else if (mode === 'crop') { crop = null; setMode('adjust'); } else { moveSel = null; draw(); } return; }
            if (e.key === 'Tab' && !e.shiftKey && !e.target.closest?.('input, select, textarea, button')) { e.preventDefault(); setSideClosed(!dlg.classList.contains('rt-side-closed')); return; }
            if (e.key === 'Enter' && poly) { e.preventDefault(); finishPoly(); return; }
            if (e.key === 'Enter' && mode === 'crop') { e.preventDefault(); cmd('cropok'); return; }
            if (e.key === '[') { setSize(brush * 0.85 - 1); return; } if (e.key === ']') { setSize(brush * 1.18 + 1); return; }
            if (e.key === '+' || e.key === '=') { setZoom(zoom * 1.5); return; } if (e.key === '-') { setZoom(zoom / 1.5); return; }
            if (e.key === '0') { setZoom(1); return; } if (e.key === '1') { setZoom(scale / fitScale()); return; }
            if (e.key === ' ' && !spaceDown) { spaceDown = true; stage.classList.add('is-hand'); e.preventDefault(); return; }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selPt >= 0 && document.activeElement === svg) { e.preventDefault(); removePoint(selPt); return; }
                if (mode === 'move' && moveSel) { e.preventDefault(); delMoveSel(); return; }
                if (selId) { e.preventDefault(); cmd('sel:clear'); return; }
                if (selPt >= 0) { e.preventDefault(); removePoint(selPt); }
                return;
            }
            if (k === 'x') { const c0 = color; setColor(fillColor); fillColor = c0; $('[data-rt-fill]').value = c0; return; } // X : intervertir la couleur et le fond
            if (k === 'm' && e.shiftKey) { setMode('ellipsesel'); return; }
            const t = VTOOLS.find(x => x[3] === k); if (t && !e.altKey) { pickTool(t[0]); }
        };
        const onKeyUp = e => { if (e.key === ' ') { spaceDown = false; stage.classList.toggle('is-hand', mode === 'hand'); } };
        window.addEventListener('keydown', onKey, true); document.addEventListener('keyup', onKeyUp); // avant les raccourcis de l'app
        // fermer : on demande s'il y a du travail non enregistré
        let saved = false;
        // 💾 Projet : tout le travail (corrections, réglages, calques, groupes, masques, sélection, recadrage) gardé pour continuer plus tard
        let projId = project?.id || 0, projName = project?.name || '', projKey = '';
        const curKey = () => JSON.stringify(snapshot());
        const showProj = () => { const el = $('[data-rt-projname]'); if (el) el.textContent = projId ? `🎚️ ${projName}${projKey && projKey !== curKey() ? ' · modifié' : ''}` : ''; };
        async function projectData() {
            const snap = snapshot(), ids = [...new Set((JSON.stringify(snap).match(/"k\d+"/g) || []).map(x => x.slice(1, -1)))], m = {};
            ids.forEach(id => { const c = masks.get(id); if (c) m[id] = c.toDataURL('image/png'); });
            return {...snap, masks: m, pw, ph, v: 1, fresh};
        }
        let projBusy = false;
        async function saveProject(asNew = false) {
            if (mode === 'persp') setMode('adjust');
            if (projBusy) return;
            let name = projName;
            if (!projId || asNew) { const n = await A().askText({title: 'Enregistrer le projet de retouche', message: 'Nom du projet (pour le retrouver dans « 📂 Projets… ») :', value: projName || item.title || 'Ma retouche', okLabel: 'Enregistrer'}); if (n === null) return; name = n.trim().slice(0, 160); if (!name) return toast('Donne un nom au projet.', 'error'); }
            projBusy = true; const btn = $('[data-rt-projsave]'), l0 = btn.textContent; btn.disabled = true; btn.textContent = 'Enregistrement…';
            try {
                const t = document.createElement('canvas'), k = Math.min(1, 320 / Math.max(pw, ph)); t.width = Math.max(1, Math.round(pw * k)); t.height = Math.max(1, Math.round(ph * k)); const tg = t.getContext('2d'); tg.fillStyle = '#fff'; tg.fillRect(0, 0, t.width, t.height); tg.drawImage(canvas, 0, 0, t.width, t.height);
                const r = await A().api('save_retouch_project', {}, {method: 'POST', body: {id: asNew ? 0 : projId, name, media_id: item.id || 0, source: from, thumb: t.toDataURL('image/jpeg', 0.8), project: await projectData()}});
                projId = r.result.id; projName = r.result.name; projKey = curKey(); showProj();
                toast(`Projet « ${projName} » enregistré : « 📂 Projets… » pour le rouvrir.`);
            } catch (err) { toast(err.message, 'error'); }
            finally { projBusy = false; btn.disabled = false; btn.textContent = l0; }
        }
        $('[data-rt-projsave]').addEventListener('click', () => saveProject());
        const openProjects = () => retouchProjectsDialog({current: projId, onOpen: async pr => { if (hpos > 0 && curKey() !== projKey && !confirm('Ouvrir un autre projet sans enregistrer ce travail ?')) return false; saved = true; dlg.close(); await ext.openRetouchProject(pr.id); }});
        $('[data-rt-projopen]').addEventListener('click', openProjects);
        dlg.addEventListener('input', () => setTimeout(showProj, 0)); dlg.addEventListener('pointerup', () => setTimeout(showProj, 0));
        const askClose = () => { if (!saved && hpos > 0 && !(projId && curKey() === projKey) && !confirm('Fermer sans enregistrer ? Les retouches en cours seront perdues (💾 Enregistrer le projet les garde pour plus tard).')) return; saved = true; dlg.close(); };
        $$('[data-rt-close]').forEach(b => b.addEventListener('click', askClose));
        dlg.addEventListener('cancel', e => { if (e.target !== dlg) return; if (mode === 'crop' || poly) { e.preventDefault(); return; } if (!saved && hpos > 0 && !(projId && curKey() === projKey)) { e.preventDefault(); askClose(); } });
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
            if (fresh) { box.hidden = true; box.style.display = 'none'; return; } // un canevas vide ou une image importée n'a pas de versions
            box.innerHTML = `<details ${versions.length > 1 && window.innerHeight > 900 ? 'open' : ''}><summary><h3>Versions de la photo (${versions.length || 1})</h3></summary><div class="h-rt-vlist">${versions.map(v => `<figure class="${v.shown ? 'is-shown' : ''} ${v.filename === from ? 'is-source' : ''}"><img src="media/${encodeURIComponent(v.filename)}" alt="" loading="lazy"><figcaption><strong>${esc(v.label)}</strong>${v.shown ? '<span class="h-rt-badge">affichée</span>' : (v.id ? `<button type="button" class="link-button" data-rt-vshow="${v.id}">Afficher par défaut</button>` : '')}
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
        // ── L'image en pleine taille : la photo retouchée (corrections, réglages, filtres, masque), les calques visibles, puis le recadrage ──
        const hasAlpha = () => { const p = P(); return !!(st.persp || st._persp0) && (st.persp || st._persp0).some(([x, y]) => x < 0 || y < 0 || x > 1 || y > 1) || !p || !p.visible || p.opacity < 1 || !!p.mask || layers[0] !== p || st.strokes.some(s => s.tool === 'clear'); };
        async function renderFull() {
            const W = img.naturalWidth, H = img.naturalHeight;
            const pc = document.createElement('canvas'); pc.width = W; pc.height = H;
            const fctx = pc.getContext('2d', {willReadFrequently: true}); fctx.drawImage(img, 0, 0);
            let data = fctx.getImageData(0, 0, W, H);
            if (st.persp) data = rtWarp(data, st.persp);
            if (st.strokes.length) rtReplayStrokes(data, st.strokes, masks);
            fctx.putImageData(rtApply(data, data, st), 0, 0);
            const comp = document.createElement('canvas'); comp.width = W; comp.height = H; const cg = comp.getContext('2d');
            const RF = {W, H, layer: l => { if (typeOf(l) === 'photo') return pc; const lc = blank(W, H); rtDrawLayer(lc, l, {masks, photo: pc}); return lc; }, mask: n => n.maskOff ? null : n.mask};
            cg.drawImage(renderStack($('[data-rt-merge]').checked ? layers : P() ? [P()] : [], null, RF), 0, 0);
            if (!st.crop) return comp;
            const c = st.crop, oc = document.createElement('canvas'); oc.width = Math.max(1, Math.round(c.w * W)); oc.height = Math.max(1, Math.round(c.h * H));
            const og = oc.getContext('2d'); if (!hasAlpha()) { og.fillStyle = '#fff'; og.fillRect(0, 0, oc.width, oc.height); }
            og.translate(-c.x * W, -c.y * H); og.translate(W / 2, H / 2); og.rotate(c.a * Math.PI / 180); og.translate(-W / 2, -H / 2); og.drawImage(comp, 0, 0);
            return oc;
        }
        $$('[data-rt-save]').forEach(b => b.addEventListener('click', async () => {
            if (mode === 'persp') setMode('adjust'); // la perspective en cours de réglage : on garde celle d'avant
            const saveMode = b.dataset.rtSave, label0 = b.textContent;
            const mpx = img.naturalWidth * img.naturalHeight / 1e6;
            if (mpx > 60 && !confirm(`Cette image est très grande (${Math.round(mpx)} millions de points) : l’enregistrement peut être long, voire échouer. Continuer ?`)) return;
            if (mode === 'crop') endCrop(true);
            $$('.modal-actions button').forEach(x => { x.disabled = true; });
            b.textContent = 'Enregistrement…';
            try {
                const fullC = await renderFull();
                const ext0 = String(from || '').split('.').pop().toLowerCase();
                const type = hasAlpha() ? 'image/png' : ext0 === 'png' ? 'image/png' : ext0 === 'webp' ? 'image/webp' : ext0 === 'gif' ? 'image/png' : 'image/jpeg';
                const blob = await new Promise(res => fullC.toBlob(res, type, 0.93));
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
        photo(); setMode('adjust'); if (tab) showTab(tab);
        try { if (localStorage.getItem('genealogie-retouch-side-closed') === '1') setSideClosed(true); } catch (_) {}
        commit('Ouverture de la photo');
        if (project?.project) { // un projet rouvert : ses masques (images), puis tout son état, comme une étape de l'historique
            const d = project.project;
            try {
                const imgIds = new Set(); (function walk(v) { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (v.type === 'image' && typeof v.mask === 'string') imgIds.add(v.mask); Object.values(v).forEach(walk); } })(d.layers);
                for (const [id, src] of Object.entries(d.masks || {})) { if (!/^k\d+$/.test(id) || !/^data:image\/png;base64,/.test(src)) continue; const im = new Image(); im.src = src; await im.decode(); const c = imgIds.has(id) ? Object.assign(document.createElement('canvas'), {width: im.naturalWidth, height: im.naturalHeight}) : blankMask(); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); masks.set(id, c); maskSeq = Math.max(maskSeq, Number(id.slice(1)) || 0); } // une image placée garde sa vraie taille
                const snap = {st: {...rtDefault(), ...(d.st || {}), strokes: undefined}, strokes: Array.isArray(d.strokes) ? d.strokes : [], layers: Array.isArray(d.layers) ? d.layers : [], activeLayer: String(d.activeLayer || ''), photoL: d.photoL || {}, selId: d.selId && masks.has(d.selId) ? d.selId : null};
                history.push({label: `Projet « ${project.name} » rouvert`, at: new Date(), snap: rtClone(snap)}); restore(history.length - 1);
                projKey = curKey();
                if (d.pw && (d.pw !== pw || d.ph !== ph)) toast('La photo de départ n’a plus la même taille : vérifie les calques.', 'error');
            } catch (err) { toast('Projet en partie illisible : ' + err.message, 'error'); }
        }
        showProj();
        refreshLayers();
        syncControls();
        requestAnimationFrame(() => setZoom(1));
    }
    /** 📂 Les projets de retouche enregistrés : ouvrir, renommer, supprimer */
    async function retouchProjectsDialog({current = 0, onOpen} = {}) {
        let list = []; try { list = (await api('retouch_projects')).projects || []; } catch (e) { return toast(e.message, 'error'); }
        const when = d => { const x = new Date(String(d || '').replace(' ', 'T') + 'Z'); return isNaN(x) ? '' : x.toLocaleString('fr-FR', {dateStyle: 'short', timeStyle: 'short'}); };
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-modal h-rt-projdlg';
        const draw = () => { dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">🎚️ RETOUCHE</span><h2>Projets de retouche</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            ${list.length ? `<div class="h-rt-plist">${list.map(p => `<div class="h-rt-prow${p.id === current ? ' is-cur' : ''}${p.exists ? '' : ' is-missing'}"><button type="button" class="h-rt-popen" data-open="${p.id}" ${p.exists ? '' : 'disabled'}>${p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : '<span class="h-rt-pico">🎚️</span>'}<span><b>${esc(p.name)}</b><small>${esc(p.media_title || p.source)} · ${esc(when(p.updated_at))}${p.exists ? '' : ' · photo de départ introuvable'}</small></span></button><button type="button" class="icon-button small" data-ren="${p.id}" title="Renommer">✎</button><button type="button" class="icon-button small" data-del="${p.id}" title="Supprimer le projet (les photos et leurs versions restent)">🗑</button></div>`).join('')}</div>`
                : '<p class="muted h-rt-pempty">Aucun projet pour l’instant : dans la Retouche, « 💾 Enregistrer le projet ».</p>'}`; };
        draw(); document.body.appendChild(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
        dlg.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.x !== undefined) return dlg.close();
            try {
                if (b.dataset.open) { const p = list.find(x => x.id === Number(b.dataset.open)); if (await onOpen?.(p) === false) return; dlg.close(); return; }
                if (b.dataset.ren) { const p = list.find(x => x.id === Number(b.dataset.ren)), n = await A().askText({title: 'Renommer le projet', message: 'Nouveau nom :', value: p.name, okLabel: 'Renommer'}); if (!n?.trim()) return; const r = await api('rename_retouch_project', {}, {method: 'POST', body: {id: p.id, name: n}}); p.name = r.result.name; return draw(); }
                if (b.dataset.del) { const p = list.find(x => x.id === Number(b.dataset.del)); if (!confirm(`Supprimer le projet « ${p.name} » ? La photo et ses versions restent.`)) return; await api('delete_retouch_project', {}, {method: 'POST', body: {id: p.id}}); list = list.filter(x => x !== p); return draw(); }
            } catch (err) { toast(err.message, 'error'); }
        });
    }
    ext.openRetouchProject = async id => {
        let pr; try { pr = await api('retouch_project', {id}); } catch (e) { return toast(e.message, 'error'); }
        const st = A().state; st.lightboxMedia = [{id: pr.media_id, filename: pr.source, thumbnail: pr.source, title: pr.media_title || pr.name, media_type: 'image'}]; st.lightboxIndex = 0;
        return openRetouch(pr.source, pr);
    };
    ext.openRetouchProjects = () => retouchProjectsDialog({onOpen: p => ext.openRetouchProject(p.id)});
    ext.retouchDrawOp = rtDrawOp; // pour les essais
    document.addEventListener('click', e => { if (e.target.closest('#retouch-media')) openRetouch(); });
    ext.openRetouch = openRetouch;

    /** Listes → Médias → « 🎚️ Retoucher » : une photo de l'app (les plus récentes, ou filtrées) ou une photo importée, puis la Retouche */
    function pickRetouch({restore = false} = {}) {
        const open = item => { const st = A().state; st.lightboxMedia = [item]; st.lightboxIndex = 0; openRetouch('', null, restore ? {advanced: true, tab: 'restore'} : {}); };
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-modal h-rt-pick';
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">RETOUCHE</span><h2>${restore ? 'Quelle photo restaurer ?' : 'Quelle photo retoucher ?'}</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="h-rt-pick-bar"><input type="search" data-q placeholder="Chercher une photo de l’app (titre, cote, nom du fichier)…"><button type="button" class="button small secondary" data-projects title="Rouvrir un travail de retouche enregistré">📂 Projets</button><button type="button" class="button small secondary" data-blank title="Une image vide, pour dessiner, écrire ou assembler des calques">⬜ Canevas vide</button><label class="button small"><input type="file" accept="image/jpeg,image/png,image/webp" data-file hidden>📥 Importer une photo</label></div>
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
        // ⬜ Canevas vide : une image de la taille voulue (blanche, transparente ou d'une couleur), ajoutée aux Médias puis ouverte
        dlg.querySelector('[data-projects]').addEventListener('click', () => retouchProjectsDialog({onOpen: async p => { dlg.close(); await ext.openRetouchProject(p.id); }}));
        dlg.querySelector('[data-blank]').addEventListener('click', () => {
            const SIZES = [['1920x1080', 'Écran 16:9 — 1920 × 1080'], ['1080x1080', 'Carré — 1080 × 1080'], ['1240x1754', 'A4 portrait (150 dpi) — 1240 × 1754'], ['1754x1240', 'A4 paysage (150 dpi) — 1754 × 1240'], ['2480x3508', 'A4 portrait (300 dpi) — 2480 × 3508'], ['1500x2100', 'Carte postale — 1500 × 2100'], ['custom', 'Autre taille…']];
            ext.openDialog({eyebrow: 'RETOUCHE', title: '⬜ Partir d’un canevas vide', submitLabel: 'Créer et ouvrir',
                body: `<div class="form-grid"><label class="span-2">Format<select name="size">${SIZES.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
                    <label>Largeur (pixels)<input type="number" name="w" value="1920" min="16" max="8000"></label><label>Hauteur (pixels)<input type="number" name="h" value="1080" min="16" max="8000"></label>
                    <label>Fond<select name="bg"><option value="white">Blanc</option><option value="transparent">Transparent</option><option value="color">Une couleur…</option></select></label><label>Couleur du fond<input type="color" name="color" value="#f3ece4"></label>
                    <label class="span-2">Nom<input name="title" value="Canevas" maxlength="200"></label></div><p class="muted">Le canevas est ajouté aux Médias ; on y met ensuite des calques, des groupes, du texte, des formes, des photos (Sélection → calque)…</p>`,
                onOpen: d => { const sz = d.querySelector('[name=size]'), w = d.querySelector('[name=w]'), h = d.querySelector('[name=h]'); sz.addEventListener('change', () => { if (sz.value !== 'custom') { const [a, b] = sz.value.split('x'); w.value = a; h.value = b; } }); [w, h].forEach(x => x.addEventListener('input', () => { sz.value = SIZES.find(([k]) => k === `${w.value}x${h.value}`)?.[0] || 'custom'; })); },
                onSubmit: async form => {
                    const f = Object.fromEntries(new FormData(form)), W = Math.round(Number(f.w)), H = Math.round(Number(f.h));
                    if (!(W >= 16 && H >= 16 && W <= 8000 && H <= 8000)) { toast('Taille entre 16 et 8 000 pixels de côté.', 'error'); return false; }
                    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
                    if (f.bg !== 'transparent') { g.fillStyle = f.bg === 'color' ? f.color : '#ffffff'; g.fillRect(0, 0, W, H); }
                    const blob = await new Promise(r => c.toBlob(r, 'image/png')); if (!blob) { toast('Canevas trop grand pour le navigateur.', 'error'); return false; }
                    const fd = new FormData(); fd.append('file', blob, 'canevas.png'); fd.append('kind', 'image'); fd.append('title', (f.title || 'Canevas').trim().slice(0, 300));
                    const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}});
                    const j = await r.json().catch(() => ({error: 'Réponse illisible du serveur'}));
                    if (!r.ok || j.error) { toast(j.error || 'Création impossible.', 'error'); return false; }
                    dlg.close(); if (A().state.module === 'listes') Promise.resolve(A().renderList?.()).catch(() => {});
                    open({id: j.result.media_id, filename: j.result.filename, thumbnail: j.result.filename, title: fd.get('title'), media_type: 'image', fresh: true});
                },
            });
        });
        dlg.querySelector('[data-file]').addEventListener('change', async e => {
            const f = e.target.files?.[0]; if (!f) return;
            const fd = new FormData(); fd.append('file', f, f.name); fd.append('kind', 'image'); fd.append('title', f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 300));
            try {
                const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}});
                const j = await r.json().catch(() => ({error: 'Réponse illisible du serveur'}));
                if (!r.ok || j.error) throw new Error(j.error || 'Import impossible.');
                dlg.close(); toast('Photo importée dans les Médias.');
                if (A().state.module === 'listes') Promise.resolve(A().renderList?.()).catch(() => {});
                open({id: j.result.media_id, filename: j.result.filename, thumbnail: j.result.filename, title: fd.get('title'), media_type: 'image', fresh: true});
            } catch (err) { toast(err.message, 'error'); }
        });
        dlg.showModal(); load();
    }
    ext.pickRetouch = pickRetouch;
    ext.openRestore = () => pickRetouch({restore: true}); // 🧭 restaurer une vieille photo, pas à pas
})();
