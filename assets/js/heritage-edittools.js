/**
 * 🛠️ Listes → Outils de modification : les projets des éditeurs de l'app, un onglet par outil
 * (🎬 montage vidéo, 🎧 son, 🎚️ retouche des photos, ✒️ dessin vectoriel, 📐 mise en page des livres) : chercher, trier, ouvrir, renommer,
 * supprimer, ou en commencer un nouveau. Chargé après heritage-studio.js, heritage-studio-av.js et heritage-layout.js.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => A().escapeHtml(v ?? '');
    const toast = (...a) => A().toast(...a);
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const TAB_KEY = 'genealogie-edittools-tab', VIEW_KEY = 'genealogie-edittools-view', SORT_KEY = 'genealogie-edittools-sort', STEP = 24;
    const UI = () => window.LCNDA_UI;
    const fmtDate = d => window.LCNDA_UI?.when?.(d) || ''; // K4 : HTML <time>, date complète au survol
    const fmtDur = s => { s = Math.round(Number(s) || 0); return s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : ''; };

    /** Chaque outil : comment lire ses projets, les ouvrir, les renommer, les supprimer, en créer un */
    const TOOLS = [
        {key: 'montage', icon: '🎬', label: 'Montage vidéo', what: 'montage',
            load: async () => ((await api('montage_projects')).projects || []).map(p => ({id: p.id, name: p.name, date: p.updated_at, thumb: p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : '<span class="h-et-ico">🎬</span>', info: [`${p.clips} morceau${p.clips > 1 ? 'x' : ''}`, `${p.sources} rush${p.sources > 1 ? 'es' : ''}`, fmtDur(p.duration)].filter(Boolean).join(' · ')})),
            open: (id, again) => ext.openMontageProject?.(id, again),
            create: again => ext.newMontage?.(again),
            rename: async (id, name) => { const r = await api('montage_project', {id}); await post('save_montage_project', {id, name, project: r.project}); },
            remove: id => post('delete_montage_project', {id}), createLabel: '＋ Nouveau montage'},
        {key: 'audio', icon: '🎧', label: 'Son', what: 'son',
            load: async () => ((await api('audio_projects')).projects || []).map(p => ({id: p.id, name: p.name, date: p.updated_at, thumb: '<span class="h-et-ico">🎧</span>', info: [p.media_title || 'son importé', fmtDur(p.duration), p.exists ? '' : '⚠ fichier de travail introuvable'].filter(Boolean).join(' · '), disabled: !p.exists})),
            open: (id, again) => ext.openAudioProject?.(id, again),
            create: again => ext.newAudioProject?.(again),
            rename: (id, name) => post('rename_audio_project', {id, name}),
            remove: id => post('delete_audio_project', {id}), createLabel: '＋ Nouveau projet son'},
        {key: 'retouch', icon: '🎚️', label: 'Retouche des photos', what: 'retouche',
            load: async () => ((await api('retouch_projects')).projects || []).map(p => ({id: p.id, name: p.name, date: p.updated_at, thumb: p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : '<span class="h-et-ico">🎚️</span>', info: [p.media_title || p.source, p.exists ? '' : '⚠ photo de départ introuvable'].filter(Boolean).join(' · '), disabled: !p.exists})),
            open: id => ext.openRetouchProject?.(id),
            create: () => ext.pickRetouch?.(),
            rename: (id, name) => post('rename_retouch_project', {id, name}),
            remove: id => post('delete_retouch_project', {id}), createLabel: '＋ Nouvelle retouche', extra: '<button type="button" class="button secondary" data-et-canvas title="Une image vide (blanche, transparente ou d’une couleur), à la taille voulue, pour dessiner, écrire ou assembler des calques">⬜ Canevas vide</button><button type="button" class="button secondary" data-et-restore title="Une vieille photo abîmée : redresser, couleurs, taches, déchirures, visages, colorisation, pas à pas">🧭 Restaurer une vieille photo</button><button type="button" class="button secondary" data-et-idp title="Le portrait de plusieurs fiches recadré au même format (yeux à la même hauteur), puis utilisé comme portrait">🪪 Portraits d’identité</button>'},
        {key: 'vector', icon: '✒️', label: 'Dessin vectoriel', what: 'dessin',
            load: async () => ((await api('vector_docs')).docs || []).map(d => ({id: d.id, name: d.name, date: d.updated_at, thumb: d.thumb ? `<img src="${esc(d.thumb)}" alt="">` : '<span class="h-et-ico">✒️</span>', info: `${d.objects} objet${d.objects > 1 ? 's' : ''}`})),
            open: (id, again) => ext.openVectorEditor?.({id, onSaved: again, onClose: again}),
            create: again => ext.openVectorEditor?.({onSaved: again, onClose: again}),
            rename: (id, name) => post('rename_vector_doc', {id, name}),
            remove: id => post('delete_vector_doc', {id}), createLabel: '＋ Nouveau dessin', extra: '<button type="button" class="button secondary" data-et-vxblason>🛡️ Nouveau blason</button>'},
        {key: 'layout', icon: '📐', label: 'Mise en page (livres)', what: 'livre',
            load: async () => ((await api('layout_docs')).docs || []).map(d => ({id: d.id, name: d.name, date: d.updated_at, thumb: `<span class="h-et-cover">${ext.layoutCoverHtml?.(d.cover, 44) || '📐'}</span>`, info: [d.is_design ? '🎨 Design' : '📖 Livre', `${d.pages} page${d.pages > 1 ? 's' : ''}`].join(' · ')})),
            open: (id, again) => ext.openLayoutDoc?.(id, again),
            create: again => ext.newLayoutDoc?.('family', again),
            rename: async (id, name) => { const r = await api('layout_doc', {id}); await post('save_layout_doc', {id, name, is_design: r.is_design, doc: r.doc}); },
            remove: id => post('delete_layout_doc', {id}), createLabel: '＋ Nouveau livre', extra: '<button type="button" class="button secondary" data-et-blank>⬜ Livre vide</button><button type="button" class="button secondary" data-et-studio>📐 Ouvrir l’atelier</button>'},
    ];

    // d'autres fichiers ajoutent leur outil (arbre décoratif, transcription, diaporama, plan de maison…) : ext.editToolsExtra.push({key, icon, label, …})
    ext.editToolsExtra = ext.editToolsExtra || [];
    const baseTools = () => [...TOOLS, ...ext.editToolsExtra.filter(t => t.key !== 'house'), ...ext.editToolsExtra.filter(t => t.key === 'house')]; // la maison (plan et 3D) à la fin
    ext.editToolsList = () => baseTools(); // pour le widget « Raccourcis » (heritage-shortcuts.js) : les projets de chaque outil
    // l'ordre des outils et ceux qu'on cache (⚙️ Ranger les outils) ; il en reste toujours au moins un
    const ORDER_KEY = 'genealogie-edit-tools-order';
    const toolPrefs = () => { try { const v = JSON.parse(localStorage.getItem(ORDER_KEY) || '{}'); return {order: Array.isArray(v?.order) ? v.order : [], hidden: Array.isArray(v?.hidden) ? v.hidden : []}; } catch (_) { return {order: [], hidden: []}; } };
    const orderedTools = () => { const all = baseTools(), p = toolPrefs(); return [...p.order.map(k => all.find(t => t.key === k)).filter(Boolean), ...all.filter(t => !p.order.includes(t.key))]; };
    const allTools = () => { const p = toolPrefs(), list = orderedTools().filter(t => !p.hidden.includes(t.key)); return list.length ? list : orderedTools(); };
    function arrangeTools(onDone) {
        const p = toolPrefs();
        ext.openDialog({eyebrow: 'OUTILS DE MODIFICATION', title: '⚙️ Ranger les outils', submitLabel: 'Enregistrer',
            body: `<p class="muted">Range les onglets avec ↑ ↓ et décoche ceux que tu ne veux pas voir.</p><ol class="h-pet-layout" data-list>${orderedTools().map(t => `<li class="h-pet-lrow" data-k="${esc(t.key)}"><input type="checkbox" ${p.hidden.includes(t.key) ? '' : 'checked'} title="Montrer"><span>${t.icon} ${esc(t.label)}</span><button type="button" class="h-bt" data-up title="Monter">↑</button><button type="button" class="h-bt" data-down title="Descendre">↓</button></li>`).join('')}</ol><button type="button" class="button small secondary" data-reset>↺ Remettre comme au départ</button>`,
            onOpen: dg => dg.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const li = b.closest('[data-k]');
                if (b.hasAttribute('data-up')) li.previousElementSibling?.before(li); else if (b.hasAttribute('data-down')) li.nextElementSibling?.after(li);
                else if (b.hasAttribute('data-reset')) { try { localStorage.removeItem(ORDER_KEY); } catch (_) {} dg.close(); onDone?.(); } }),
            onSubmit: f => { const li = [...f.querySelectorAll('[data-k]')], hidden = li.filter(x => !x.querySelector('input').checked).map(x => x.dataset.k); if (hidden.length >= li.length) { toast('Garde au moins un outil.', 'error'); return false; }
                try { localStorage.setItem(ORDER_KEY, JSON.stringify({order: li.map(x => x.dataset.k), hidden})); } catch (_) {} onDone?.(); }});
    }
    ext.arrangeEditTools = arrangeTools;
    // les cartes des projets (C6) : grande vignette, nom, détails, date, boutons
    const ensureCss = () => { if (document.getElementById('h-et-css')) return; const st = document.createElement('style'); st.id = 'h-et-css'; st.textContent = `
.h-et-bar{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}
.h-et-bar .ui-sortbar{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap}
.h-et-cards .ui-card-act .button{min-height:30px}
.h-et-cards .ui-card-thumb .h-et-ico,.h-et-cards .ui-card-thumb .h-et-cover{font-size:46px}
.h-et-page .ui-more{margin:14px auto 0;display:block}
`; document.head.appendChild(st); };
    ext.lists = ext.lists || {};
    ext.lists.edit_tools = async token => {
        const S = A().state, ws = A().$('#workspace');
        let tab = (() => { try { return localStorage.getItem(TAB_KEY) || 'montage'; } catch (_) { return 'montage'; } })();
        if (!allTools().some(t => t.key === tab)) tab = 'montage';
        let q = '', sort = (() => { try { return localStorage.getItem(SORT_KEY) || 'recent'; } catch (_) { return 'recent'; } })(), rows = [], loading = false, shown = STEP;
        // « Liste | Fiches » retenu pour chaque outil : {montage: 'list', retouch: 'cards', …}
        const views = () => { try { const v = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (_) { return {}; } };
        const viewOf = k => (views()[k] === 'cards' ? 'cards' : 'list');
        let view = viewOf(tab);
        if (!['recent', 'old', 'az', 'za'].includes(sort)) sort = 'recent';
        const tool = () => allTools().find(t => t.key === tab);
        const visible = () => {
            const n = s => String(s || '').toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, '');
            const words = n(q).split(/\s+/).filter(Boolean);
            const list = rows.filter(r => words.every(w => n(`${r.name} ${r.info}`).includes(w)));
            const by = {recent: (a, b) => String(b.date).localeCompare(String(a.date)), old: (a, b) => String(a.date).localeCompare(String(b.date)), az: (a, b) => a.name.localeCompare(b.name, 'fr', {sensitivity: 'base'}), za: (a, b) => b.name.localeCompare(a.name, 'fr', {sensitivity: 'base'})}[sort];
            return list.sort(by);
        };
        const acts = r => `<div class="h-et-act"><button type="button" class="button small" data-et-open="${r.id}" ${r.disabled ? 'disabled' : ''}>Ouvrir</button><button type="button" class="icon-button small" data-et-ren="${r.id}" title="Renommer" aria-label="Renommer">✎</button><button type="button" class="icon-button small" data-et-del="${r.id}" title="Supprimer le projet" aria-label="Supprimer le projet">🗑</button></div>`;
        const drawList = () => {
            const box = ws.querySelector('[data-et-list]'); if (!box) return;
            const t = tool(), list = visible(), part = list.slice(0, shown), U = UI();
            const bar = ws.querySelector('.ui-listbar'); if (bar?.setCount) bar.setCount(loading ? '' : `${A().plural(list.length, 'projet')}${list.length !== rows.length ? ` sur ${rows.length}` : ''}`);
            if (loading) { box.innerHTML = U?.skeleton ? U.skeleton(4) : '<div class="loading-block">Chargement…</div>'; return; }
            box.innerHTML = list.length ? (view === 'cards'
                ? `<div class="h-et-cards">${U.cardsHtml(part.map(r => ({thumb: r.thumb, name: r.name, open: `data-et-open="${r.id}"`, disabled: r.disabled, lines: [r.info], when: r.date, whenLabel: 'Modifié', menu: [`<button type="button" data-et-ren="${r.id}">✎ Renommer</button>`, `<button type="button" class="danger" data-et-del="${r.id}">🗑 Supprimer le projet</button>`]})))}</div>`
                : `<div class="data-table-wrap"><table class="data-table h-et-table"><thead><tr><th></th><th>Nom</th><th>Détails</th><th>Modifié</th><th></th></tr></thead><tbody>${part.map(r => `<tr><td class="h-et-thumb">${r.thumb}</td><td><button type="button" class="table-link" data-et-open="${r.id}" ${r.disabled ? 'disabled' : ''}>${esc(r.name)}</button></td><td class="muted">${esc(r.info)}</td><td>${fmtDate(r.date)}</td><td>${acts(r)}</td></tr>`).join('')}</tbody></table></div>`)
                : rows.length ? A().emptyState({icon: '🔎', text: `Aucun projet pour « ${q.trim()} »`, hint: 'Vérifie l’orthographe, ou cherche un autre mot (nom, photo, détails).', action: {label: '× Effacer la recherche', attrs: 'data-et-clear'}})
                    : A().emptyState({icon: t.icon || '🗂️', text: `Aucun projet de ${t.what} pour l’instant`, hint: 'Commence-en un : il apparaîtra ici, avec les autres, pour le rouvrir plus tard.', action: {label: t.createLabel, attrs: 'data-et-new'}});
            if (list.length > shown && U?.moreButton) box.appendChild(U.moreButton({remaining: list.length - shown, step: STEP, onClick: () => { shown += STEP; drawList(); }}));
        };
        const load = async () => {
            loading = true; shown = STEP; drawList();
            try { rows = await tool().load(); } catch (err) { rows = []; toast(err.message, 'error'); }
            loading = false; if (token !== S.workspaceToken || S.module !== 'listes') return; drawList();
        };
        const again = () => { if (S.module === 'listes' && S.listType === 'edit_tools') load(); };
        const drawPage = () => {
            const t = tool(), U = UI();
            ws.innerHTML = `<section class="page collection-page h-et-page" data-dnd-off><header class="page-header"><div><span class="eyebrow">LISTES</span><h2>🛠️ Outils de modification</h2><p>Les projets des outils de l’app : choisis un outil, puis ouvre, cherche, trie, renomme ou commence un projet.</p></div><div class="page-actions"><button type="button" class="button small secondary" data-et-arrange title="L’ordre des outils, et ceux qu’on montre">⚙️ Ranger les outils</button></div></header>
                <div class="segmented enquetes-tab-toggle h-et-tabs">${allTools().map(x => `<button type="button" class="${x.key === tab ? 'is-active ' : ''}enquetes-tab-btn" data-et-tab="${x.key}"><span class="enquetes-tab-icon" aria-hidden="true">${x.icon}</span><span>${esc(x.label)}</span></button>`).join('')}</div>
                <div class="h-et-bar"><span class="spacer"></span><button type="button" class="button" data-et-new>${esc(t.createLabel)}</button>${t.extra || ''}</div>
                <div data-et-sortslot></div>
                <div data-et-list></div></section>`;
            ensureCss();
            view = viewOf(tab);
            const slot = ws.querySelector('[data-et-sortslot]');
            // H10 : la barre commune (🔍 Chercher · Liste | Fiches · Trier), retenue pour chaque outil (« lcnda-listbar:listes:edit_tools:<outil> »)
            const viewOpt = {key: '', value: view, what: 'projets', onChange: v => { view = v; const all = views(); all[tab] = v; try { localStorage.setItem(VIEW_KEY, JSON.stringify(all)); } catch (_) {} drawList(); }};
            const bar = U.listBar({key: `listes:edit_tools:${tab}`, search: {placeholder: 'Chercher un projet… (nom, photo, détails)', value: q}, view: viewOpt,
                sort: {options: [['recent', 'Les plus récents'], ['old', 'Les plus anciens'], ['az', 'A → Z'], ['za', 'Z → A']], value: sort},
                onChange: b => { q = b.q; if (b.sort !== sort) { sort = b.sort; try { localStorage.setItem(SORT_KEY, sort); } catch (_) {} } shown = STEP; drawList(); }});
            ({q, sort} = bar.state); view = bar.state.view;
            slot.replaceWith(bar);
            load();
        };
        drawPage();
        ws.onclick = async e => {
            const b = e.target.closest('button'); if (!b || !ws.querySelector('.h-et-page')) return; const d = b.dataset, t = tool();
            try {
                if (d.etArrange !== undefined) return arrangeTools(() => { if (!allTools().some(x => x.key === tab)) tab = allTools()[0].key; drawPage(); });
                if (d.etTab) { tab = d.etTab; try { localStorage.setItem(TAB_KEY, tab); } catch (_) {} return drawPage(); }
                if (d.etNew !== undefined) return t.create(again);
                if (d.etBlank !== undefined) return ext.newLayoutDoc?.('blank', again);
                if (d.etStudio !== undefined) return ext.openLayoutStudio?.();
                if (d.etCanvas !== undefined) return ext.newBlankCanvas?.();
                if (d.etRestore !== undefined) return ext.openRestore?.();
                if (d.etIdp !== undefined) return ext.openIdPhotoBatch?.();
                if (d.etClear !== undefined) { const i = ws.querySelector('.ui-listbar input[type=search]'); if (i) { i.value = ''; i.dispatchEvent(new Event('input', {bubbles: true})); i.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter'})); } q = ''; shown = STEP; return drawList(); }
                if (d.etVxblason !== undefined) return ext.openVectorEditor?.({coat: {title: 'Blason'}, onSaved: again, onClose: again});
                if (d.etX && t.onExtra) return t.onExtra(d.etX, again); // les boutons en plus d'un outil ajouté
                if (d.etOpen) return t.open(Number(d.etOpen), again);
                if (d.etRen) { const r = rows.find(x => x.id === Number(d.etRen)), n = await A().askText({title: 'Renommer le projet', message: 'Nouveau nom :', value: r?.name || '', okLabel: 'Renommer'}); if (!n?.trim()) return; await t.rename(r.id, n.trim().slice(0, 160)); toast('Projet renommé.'); return load(); }
                if (d.etDel) { const r = rows.find(x => x.id === Number(d.etDel)); if (!await A().confirmBox('Les photos, vidéos et sons restent dans les Médias.', {title: `Supprimer le projet « ${r?.name} » ?`, okLabel: 'Supprimer le projet'})) return; await t.remove(r.id); toast('Projet supprimé.'); return load(); }
            } catch (err) { toast(err.message, 'error'); }
        };
        ws.oninput = null; ws.onchange = null;
    };
})();
