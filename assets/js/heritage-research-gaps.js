/* LCNDA — 🔍 Assistant de recherche « Que manque-t-il ? » (Recherche → Type de recherche) : les actes qui manquent à la
 * lignée, rangés par service d'archives (Archives départementales de tel département), par ancêtre ou par sorte d'acte,
 * avec la commune, les années, les séries à consulter (état civil, tables décennales, registres paroissiaux, notaires 3 E,
 * enregistrement 3 Q, recrutement 1 R, recensements 6 M) et ce qui est déjà dans le suivi des dépouillements.
 * Une ligne s'ajoute au suivi (« à faire ») en un clic ; la liste s'imprime pour aller aux archives. Données : lib/research_gaps.php.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const S = () => A().state;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const fmt = n => Number(n || 0).toLocaleString('fr-FR');
    const ls = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };

    const KINDS = {birth: ['👶', 'Naissance'], marriage: ['💍', 'Mariage'], death: ['🕯️', 'Décès'], parents: ['👪', 'Parents'], contract: ['📜', 'Contrat de mariage'], succession: ['⚖️', 'Succession'], census: ['🏠', 'Recensements'], military: ['🎖️', 'Registre matricule']};
    const STATUS = {todo: 'à faire', done: 'terminé', review: 'à revoir', doubt: 'doute', priority: 'priorité', later: 'plus tard'};
    const years = it => it.from == null ? '' : it.from === it.to || it.to == null ? String(it.from) : `${it.from} – ${it.to}`;
    const st = () => (S().gapsView ||= {gen: Number(ls('genealogie-gaps-gen', 7)) || 7, group: ls('genealogie-gaps-group', 'archives'), off: [], q: ''});
    const webSearch = q => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
    const faSearch = q => `https://francearchives.gouv.fr/fr/search?q=${encodeURIComponent(q)}`;

    function row(it, opts = {}) {
        const [ico, label] = KINDS[it.kind] || ['•', it.what];
        const done = (it.digested || []).map(d => `<span class="h-gap-dig ${d.status === 'done' ? 'ok' : ''}" title="Déjà dans le suivi des dépouillements">${esc(d.year_text || 'sans période')} · ${esc(d.result_label || STATUS[d.status] || d.status)}</span>`).join('');
        const where = (it.where || []).map(w => `<li><b>${esc(w.series)}</b> — ${esc(w.detail)}</li>`).join('');
        const links = [it.archive?.france && it.place ? `<a href="${esc(faSearch(`${it.place} ${it.what}`))}" target="_blank" rel="noopener">FranceArchives</a>` : '',
            it.kind === 'death' && it.gender === 'male' && it.from <= 1921 && it.to >= 1914 ? `<a href="${esc(webSearch(`Mémoire des hommes ${it.name}`))}" target="_blank" rel="noopener">Mémoire des hommes</a>` : '',
            `<a href="${esc(webSearch(`${it.name} ${it.place || ''} ${it.what} généalogie`))}" target="_blank" rel="noopener">Sur internet</a>`].filter(Boolean).join(' · ');
        return `<article class="h-gap" data-gap-i="${it._i}">
            <div class="h-gap-head"><span class="h-gap-kind" title="${esc(label)}">${ico}</span>
                <div class="h-gap-who">${opts.noPerson ? '' : `<button type="button" class="table-link" data-h-person="${Number(it.person_id)}">${esc(it.name)}</button> <small class="muted">Sosa ${fmt(it.sosa)} · génération ${it.generation}</small>`}
                    <div><b>${esc(label)}</b>${it.place ? ` à <b>${esc(it.place)}</b>` : ' <span class="muted">(lieu inconnu)</span>'}${years(it) ? `, <b>${esc(years(it))}</b>` : ''} <small class="muted">— ${esc(it.why)}</small></div>
                    ${opts.noArchive ? '' : `<div class="h-gap-arch">🏛️ ${esc(it.archive?.label || '')}</div>`}</div>
                <div class="h-gap-act"><button type="button" class="button small secondary" data-gap-add title="Ajouter une ligne « à faire » dans Recherche → Dépouillement d’archive">📌 Au suivi</button></div></div>
            ${it.decennial?.length ? `<p class="h-gap-td">📇 Tables décennales : ${it.decennial.map(t => `<span>${esc(t)}</span>`).join('')}</p>` : ''}
            <ul class="h-gap-where">${where}</ul>
            <div class="h-gap-foot">${done ? `<span class="muted">Déjà cherché :</span> ${done}` : ''}<span class="h-gap-links">${links}</span></div></article>`;
    }

    async function render(token) {
        const v = st(), ws = document.getElementById('workspace');
        ws.innerHTML = '<section class="page h-gaps">'+window.LCNDA_UI.spinner('Je regarde ce qui manque à la lignée…')+'</section>';
        let d;
        try { d = await api('research_gaps', {gen: v.gen}); } catch (e) { ws.innerHTML = `<section class="page"><p class="error">${esc(e.message)}</p></section>`; return; }
        if (token !== S().workspaceToken || S().module !== 'recherche') return;
        const items = (d.items || []).map((it, i) => ({...it, _i: i}));
        const draw = () => {
            const q = v.q.trim().toLowerCase(), vis = items.filter(it => !v.off.includes(it.kind) && (!q || `${it.name} ${it.place} ${it.archive?.label} ${it.what}`.toLowerCase().includes(q)));
            const groups = new Map();
            const keyOf = it => v.group === 'person' ? `p${it.person_id}` : v.group === 'kind' ? it.kind : v.group === 'commune' ? `c${it.place || '?'}` : `a${it.archive?.key}`;
            if (v.group === 'archives') (d.archives || []).forEach(a => groups.set(`a${a.key}`, [])); // les services les plus chargés d'abord
            vis.forEach(it => { const k = keyOf(it); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); });
            [...groups.keys()].forEach(k => { if (!groups.get(k).length) groups.delete(k); });
            const head = (k, list) => {
                const it = list[0];
                if (v.group === 'person') return `<h3><button type="button" class="table-link" data-h-person="${Number(it.person_id)}">${esc(it.name)}</button> <small class="muted">Sosa ${fmt(it.sosa)} · ${list.length} recherche${list.length > 1 ? 's' : ''}</small></h3>`;
                if (v.group === 'kind') return `<h3>${KINDS[it.kind][0]} ${esc(KINDS[it.kind][1])} <small class="muted">${list.length}</small></h3>`;
                if (v.group === 'commune') return `<h3>📍 ${esc(it.place || 'Lieu inconnu')} <small class="muted">${esc(it.archive?.label || '')} · ${list.length}</small></h3>`;
                const a = (d.archives || []).find(x => x.key === it.archive?.key) || {};
                const communes = [...new Set(list.map(x => x.place).filter(Boolean))];
                return `<h3>🏛️ ${esc(it.archive?.label || '')} <small class="muted">${list.length} recherche${list.length > 1 ? 's' : ''}</small></h3>
                    <p class="h-gaps-sub">${communes.length ? `Communes : ${communes.map(c => `<span>${esc(c)}</span>`).join('')}` : ''}
                    <span class="h-gap-links">${it.archive?.france && a.department ? `<a href="${esc(webSearch(`${it.archive.label} état civil en ligne`))}" target="_blank" rel="noopener">🌐 Trouver le site des archives</a> · <a href="${esc(faSearch(a.department))}" target="_blank" rel="noopener">FranceArchives</a>` : ''}</span></p>`;
            };
            const sortIn = list => v.group === 'archives' || v.group === 'commune' ? [...list].sort((a, b) => String(a.place).localeCompare(String(b.place), 'fr') || (a.from ?? 0) - (b.from ?? 0)) : list;
            ws.querySelector('[data-gaps-list]').innerHTML = vis.length ? [...groups.entries()].map(([k, list]) => `<section class="h-gaps-group">${head(k, list)}${sortIn(list).map(it => row(it, {noPerson: v.group === 'person', noArchive: v.group === 'archives'})).join('')}</section>`).join('')
                : `<p class="muted">${items.length ? 'Rien avec ces filtres.' : 'Rien ne manque dans les générations regardées : bravo ! Regarde plus loin (générations) ou complète la lignée.'}</p>`;
            ws.querySelector('[data-gaps-count]').textContent = `${fmt(vis.length)} recherche${vis.length > 1 ? 's' : ''}${vis.length !== items.length ? ` sur ${fmt(items.length)}` : ''}`;
        };
        const counts = d.counts || {};
        ws.innerHTML = `<section class="page h-gaps"><header class="page-header"><div><span class="eyebrow">RECHERCHE · QUE MANQUE-T-IL ?</span><h2>Les actes à chercher${d.root_name ? ` pour la lignée de ${esc(d.root_name)}` : ''}</h2>
                <p class="muted">${fmt(d.total)} recherche${d.total > 1 ? 's' : ''} pour ${fmt(d.ancestors)} ancêtres sur ${d.generations} générations, chez ${fmt((d.archives || []).length)} service${(d.archives || []).length > 1 ? 's' : ''} d’archives. Les plus proches générations d’abord : leurs actes sont les plus faciles à trouver, et chacun ouvre la porte du suivant.</p></div>
                <div class="page-actions"><button type="button" class="button secondary" data-gaps-print>🖨 Imprimer pour aller aux archives</button></div></header>
            <div class="h-gaps-bar"><label>Générations<select data-gaps-gen>${[3, 4, 5, 6, 7, 8, 9, 10, 12].map(n => `<option value="${n}" ${n === v.gen ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
                <label>Ranger par<select data-gaps-group>${[['archives', 'Service d’archives'], ['commune', 'Commune'], ['person', 'Ancêtre'], ['kind', 'Sorte d’acte']].map(([k, l]) => `<option value="${k}" ${k === v.group ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label class="h-gaps-q">Filtrer<input type="search" data-gaps-q value="${esc(v.q)}" placeholder="Nom, commune, département…"></label>
                <strong data-gaps-count></strong></div>
            <div class="h-gaps-kinds">${Object.entries(KINDS).filter(([k]) => counts[k]).map(([k, [ico, l]]) => `<label class="h-gaps-chip"><input type="checkbox" data-gaps-kind="${k}" ${v.off.includes(k) ? '' : 'checked'}> ${ico} ${esc(l)} <small>${fmt(counts[k])}</small></label>`).join('')}</div>
            <div data-gaps-list></div></section>`;
        draw();
        ws.querySelector('[data-gaps-gen]').addEventListener('change', e => { v.gen = Number(e.target.value); lsSet('genealogie-gaps-gen', v.gen); render(++S().workspaceToken); });
        ws.querySelector('[data-gaps-group]').addEventListener('change', e => { v.group = e.target.value; lsSet('genealogie-gaps-group', v.group); draw(); });
        let tm = 0; ws.querySelector('[data-gaps-q]').addEventListener('input', e => { clearTimeout(tm); tm = setTimeout(() => { v.q = e.target.value; draw(); }, 200); });
        ws.querySelectorAll('[data-gaps-kind]').forEach(c => c.addEventListener('change', () => { v.off = [...ws.querySelectorAll('[data-gaps-kind]')].filter(x => !x.checked).map(x => x.dataset.gapsKind); draw(); }));
        ws.querySelector('[data-gaps-print]').addEventListener('click', () => { if (window.LCNDA_UI?.printPage) { window.LCNDA_UI.printPage('Les trous à combler, pour aller aux archives', {bodyClass: 'h-gaps-printing'}); return; } document.body.classList.add('h-gaps-printing'); window.print(); setTimeout(() => document.body.classList.remove('h-gaps-printing'), 500); }); // K13
        ws.querySelector('[data-gaps-list]').addEventListener('click', async e => {
            const b = e.target.closest('[data-gap-add]'); if (!b) return;
            const it = items[Number(b.closest('[data-gap-i]').dataset.gapI)];
            const notes = (it.where || []).map(w => `${w.series} : ${w.detail}`).join('\n') + (it.decennial?.length ? `\nTables décennales : ${it.decennial.join(', ')}` : '');
            b.disabled = true;
            try {
                await api('save_archive_digest', {}, {method: 'POST', body: {id: 0, place_id: it.place_id || 0, city_name: it.place || '', department: it.archive?.department || '', archive_service: it.archive?.label || '', year_text: years(it), record_type: it.record_type || 'autre', status: 'todo',
                    searched: `${KINDS[it.kind]?.[1] || it.what} de ${it.name} (Sosa ${it.sosa}) — ${it.why}`, notes}});
                it.digested = [...(it.digested || []), {year_text: years(it), status: 'todo'}]; b.textContent = '✓ Ajouté'; toast('Ajouté au suivi : Recherche → Dépouillement d’archive.');
                const art = b.closest('[data-gap-i]'); art.outerHTML = row(it, {noPerson: v.group === 'person', noArchive: v.group === 'archives'});
            } catch (err) { b.disabled = false; toast(err.message, 'error'); }
        });
    }
    ext.researchGaps = render;
})();
