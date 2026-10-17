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
    const TAB_KEY = 'genealogie-edittools-tab';
    const fmtDate = d => { const x = new Date(String(d || '').replace(' ', 'T') + (String(d || '').includes('T') ? '' : 'Z')); return isNaN(x) ? '' : x.toLocaleString('fr-FR', {dateStyle: 'short', timeStyle: 'short'}); };
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
            remove: id => post('delete_retouch_project', {id}), createLabel: '＋ Nouvelle retouche'},
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

    ext.lists = ext.lists || {};
    ext.lists.edit_tools = async token => {
        const S = A().state, ws = A().$('#workspace');
        let tab = (() => { try { return localStorage.getItem(TAB_KEY) || 'montage'; } catch (_) { return 'montage'; } })();
        if (!TOOLS.some(t => t.key === tab)) tab = 'montage';
        let q = '', sort = 'recent', rows = [], loading = false;
        const tool = () => TOOLS.find(t => t.key === tab);
        const visible = () => {
            const n = s => String(s || '').toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, '');
            const words = n(q).split(/\s+/).filter(Boolean);
            const list = rows.filter(r => words.every(w => n(`${r.name} ${r.info}`).includes(w)));
            const by = {recent: (a, b) => String(b.date).localeCompare(String(a.date)), old: (a, b) => String(a.date).localeCompare(String(b.date)), az: (a, b) => a.name.localeCompare(b.name, 'fr', {sensitivity: 'base'}), za: (a, b) => b.name.localeCompare(a.name, 'fr', {sensitivity: 'base'})}[sort];
            return list.sort(by);
        };
        const drawList = () => {
            const box = ws.querySelector('[data-et-list]'); if (!box) return;
            const t = tool(), list = visible();
            ws.querySelector('[data-et-count]').textContent = loading ? '…' : `${list.length}${list.length !== rows.length ? ` sur ${rows.length}` : ''} projet${rows.length > 1 ? 's' : ''}`;
            box.innerHTML = loading ? '<div class="loading-block">Chargement…</div>' : list.length ? `<div class="data-table-wrap"><table class="data-table h-et-table"><thead><tr><th></th><th>Nom</th><th>Détails</th><th>Modifié le</th><th></th></tr></thead><tbody>${list.map(r => `<tr><td class="h-et-thumb">${r.thumb}</td><td><button type="button" class="table-link" data-et-open="${r.id}" ${r.disabled ? 'disabled' : ''}>${esc(r.name)}</button></td><td class="muted">${esc(r.info)}</td><td>${esc(fmtDate(r.date))}</td>
                <td><div class="h-et-act"><button type="button" class="button small" data-et-open="${r.id}" ${r.disabled ? 'disabled' : ''}>Ouvrir</button><button type="button" class="button small secondary" data-et-ren="${r.id}" title="Renommer">✎</button><button type="button" class="button small secondary" data-et-del="${r.id}" title="Supprimer le projet">🗑</button></div></td></tr>`).join('')}</tbody></table></div>`
                : A().empty(rows.length ? 'Aucun projet ne correspond à la recherche.' : `Aucun projet de ${t.what} pour l’instant : « ${t.createLabel} ».`);
        };
        const load = async () => {
            loading = true; drawList();
            try { rows = await tool().load(); } catch (err) { rows = []; toast(err.message, 'error'); }
            loading = false; if (token !== S.workspaceToken || S.module !== 'listes') return; drawList();
        };
        const again = () => { if (S.module === 'listes' && S.listType === 'edit_tools') load(); };
        const drawPage = () => {
            const t = tool();
            ws.innerHTML = `<section class="page collection-page h-et-page" data-dnd-off><header class="page-header"><div><span class="eyebrow">LISTES</span><h2>🛠️ Outils de modification</h2><p>Les projets des outils de l’app : choisis un outil, puis ouvre, cherche, trie, renomme ou commence un projet.</p></div></header>
                <div class="segmented enquetes-tab-toggle h-et-tabs">${TOOLS.map(x => `<button type="button" class="${x.key === tab ? 'is-active ' : ''}enquetes-tab-btn" data-et-tab="${x.key}"><span class="enquetes-tab-icon" aria-hidden="true">${x.icon}</span><span>${esc(x.label)}</span></button>`).join('')}</div>
                <div class="h-et-bar"><input type="search" data-et-q placeholder="Chercher un projet (nom, photo, détails)…" value="${esc(q)}"><label class="h-et-sort">Trier <select data-et-sort>${[['recent', 'Les plus récents'], ['old', 'Les plus anciens'], ['az', 'Nom A → Z'], ['za', 'Nom Z → A']].map(([k, l]) => `<option value="${k}" ${k === sort ? 'selected' : ''}>${l}</option>`).join('')}</select></label><span class="muted" data-et-count></span><span class="spacer"></span><button type="button" class="button" data-et-new>${esc(t.createLabel)}</button>${t.extra || ''}</div>
                <div data-et-list></div></section>`;
            load();
        };
        drawPage();
        ws.onclick = async e => {
            const b = e.target.closest('button'); if (!b || !ws.querySelector('.h-et-page')) return; const d = b.dataset, t = tool();
            try {
                if (d.etTab) { tab = d.etTab; try { localStorage.setItem(TAB_KEY, tab); } catch (_) {} return drawPage(); }
                if (d.etNew !== undefined) return t.create(again);
                if (d.etBlank !== undefined) return ext.newLayoutDoc?.('blank', again);
                if (d.etStudio !== undefined) return ext.openLayoutStudio?.();
                if (d.etVxblason !== undefined) return ext.openVectorEditor?.({coat: {title: 'Blason'}, onSaved: again, onClose: again});
                if (d.etOpen) return t.open(Number(d.etOpen), again);
                if (d.etRen) { const r = rows.find(x => x.id === Number(d.etRen)), n = await A().askText({title: 'Renommer le projet', message: 'Nouveau nom :', value: r?.name || '', okLabel: 'Renommer'}); if (!n?.trim()) return; await t.rename(r.id, n.trim().slice(0, 160)); toast('Projet renommé.'); return load(); }
                if (d.etDel) { const r = rows.find(x => x.id === Number(d.etDel)); if (!confirm(`Supprimer le projet « ${r?.name} » ? (les photos, vidéos et sons restent dans les Médias)`)) return; await t.remove(r.id); toast('Projet supprimé.'); return load(); }
            } catch (err) { toast(err.message, 'error'); }
        };
        ws.oninput = e => { if (e.target.matches('[data-et-q]')) { q = e.target.value; drawList(); } };
        ws.onchange = e => { if (e.target.matches('[data-et-sort]')) { sort = e.target.value; drawList(); } };
    };
})();
