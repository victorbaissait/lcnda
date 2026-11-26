/* LCNDA — 🔍 Assistant de recherche « Que manque-t-il ? » (Recherche → Type de recherche) : les actes qui manquent à la
 * lignée, rangés par service d'archives (Archives départementales de tel département), par ancêtre ou par sorte d'acte,
 * avec la commune, les années, les séries à consulter (état civil, tables décennales, registres paroissiaux, notaires 3 E,
 * enregistrement 3 Q, recrutement 1 R, recensements 6 M) et ce qui est déjà dans le suivi des dépouillements.
 * Une ligne s'ajoute au suivi (« à faire ») en un clic ; la liste s'imprime pour aller aux archives. Données : lib/research_gaps.php.
 * 👤 « Pour qui ? » : la lignée de n'importe quelle personne (Sosa comptés depuis elle), retenue ; aussi depuis la fiche (⋯).
 * 🗂 Un cadre par personne : ses recherches dedans, une ligne chacune, les boutons à droite (dessous sur un téléphone).
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
    const i18n = (text, vars) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(text, vars) : String(text ?? '')); // 🌐 app-i18n.js
    const plural = (n, one, many) => (A().plural ? A().plural(n, one, many) : `${fmt(n)} ${n > 1 ? many : one}`);
    const ls = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };

    const KINDS = {birth: ['👶', 'Naissance'], marriage: ['💍', 'Mariage'], death: ['🕯️', 'Décès'], parents: ['👪', 'Parents'], contract: ['📜', 'Contrat de mariage'], succession: ['⚖️', 'Succession'], census: ['🏠', 'Recensements'], socface: ['🧾', 'Recensement (SocFace)'], military: ['🎖️', 'Registre matricule']};
    const STATUS = {todo: 'à faire', done: 'terminé', review: 'à revoir', doubt: 'doute', priority: 'priorité', later: 'plus tard'};
    const years = it => it.from == null ? '' : it.from === it.to || it.to == null ? String(it.from) : `${it.from} – ${it.to}`;
    /** 🗂 « Un cadre par personne » (Réglages → 🔎 Recherche ; clé générale genealogie-cadres, pour Où chercher et les autres listes) : oui par défaut */
    const cadres = window.LCNDA_CADRES = window.LCNDA_CADRES || {on: () => ls('genealogie-cadres', '1') !== '0', set: on => { lsSet('genealogie-cadres', on ? '1' : '0'); window.dispatchEvent(new CustomEvent('lcnda:cadres-changed', {detail: {on: !!on}})); }};
    const GENS = Array.from({length: 28}, (_, i) => i + 3); // 3 … 30 générations
    const st = () => (S().gapsView ||= {gen: Math.min(30, Number(ls('genealogie-gaps-gen', 7)) || 7), group: ls('genealogie-gaps-group', 'archives'), off: [], q: '', limit: 600,
        person: Number(ls('genealogie-gaps-person', 0)) || 0, personName: ls('genealogie-gaps-person-name', '')});
    const setPerson = (id, name) => { const v = st(); v.person = Number(id) || 0; v.personName = v.person ? String(name || '') : ''; v.limit = 600; lsSet('genealogie-gaps-person', String(v.person)); lsSet('genealogie-gaps-person-name', v.personName); };
    const lifeText = l => !l || (l.birth == null && l.death == null) ? '' : l.death == null ? `° ${l.birth}` : l.birth == null ? `† ${l.death}` : `${l.birth} – ${l.death}`;
    /** 🔍 depuis la fiche (⋯) ou ailleurs : « Que manque-t-il ? » pour cette personne */
    function openFor(id, name) { setPerson(id, name); S().researchKind = 'gaps'; A().persistUiState?.(); A().setModule('recherche'); }
    const webSearch = q => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
    const faSearch = q => `https://francearchives.gouv.fr/fr/search?q=${encodeURIComponent(q)}`;

    function row(it, opts = {}) {
        const [ico, label] = KINDS[it.kind] || ['•', it.what];
        const done = (it.digested || []).map(d => `<span class="h-gap-dig ${d.status === 'done' ? 'ok' : ''}" title="Déjà dans le suivi des dépouillements">${esc(d.year_text || 'sans période')} · ${esc(d.result_label || STATUS[d.status] || d.status)}</span>`).join('');
        const where = (it.where || []).map(w => `<li><b>${esc(w.series)}</b> — ${esc(w.detail)}</li>`).join('');
        const sfUrl = it.kind === 'socface' && window.LCNDA_SOCFACE ? window.LCNDA_SOCFACE.searchUrl({last: it.sf?.last, first: it.sf?.first, place: it.sf?.place, y1: it.from, y2: it.to, gender: it.sf?.gender}) : '';
        const links = [sfUrl ? `<a href="${esc(sfUrl)}" target="_blank" rel="noopener noreferrer" data-gap-sf-link>🔍 Chercher sur SocFace ↗</a>` : '', it.archive?.france && it.place && it.kind !== 'socface' ? `<a href="${esc(faSearch(`${it.place} ${it.what}`))}" target="_blank" rel="noopener">FranceArchives</a>` : '',
            it.kind === 'death' && it.gender === 'male' && it.from <= 1921 && it.to >= 1914 ? `<a href="${esc(webSearch(`Mémoire des hommes ${it.name}`))}" target="_blank" rel="noopener">Mémoire des hommes</a>` : '',
            `<a href="${esc(webSearch(`${it.name} ${it.place || ''} ${it.what} généalogie`))}" target="_blank" rel="noopener">Sur internet</a>`,
            ext.connexions?.enabled?.() !== false && ext.connexions && !document.body.classList.contains('is-kiosk') ? `<button type="button" class="link-button" data-gap-inv title="${esc(i18n('Choisir l’enquête (ou en créer une) et y mettre cette recherche comme piste'))}">🕵️ ${esc(i18n('En faire une piste…'))}</button>` : ''].filter(Boolean).join(' · ');
        return `<article class="h-gap" data-gap-i="${it._i}" data-gap-kind="${esc(it.kind)}">
            <div class="h-gap-head"><span class="h-gap-kind" title="${esc(label)}">${ico}</span>
                <div class="h-gap-who">${opts.noPerson ? '' : `<button type="button" class="table-link" data-h-person="${Number(it.person_id)}">${esc(it.name)}</button> <small class="muted">Sosa ${fmt(it.sosa)} · génération ${it.generation}</small>`}
                    <div><b>${esc(label)}</b>${it.place ? ' ' + i18n('à {place}', {place: `<b>${esc(it.place)}</b>`}) : ` <span class="muted">${i18n('(lieu inconnu)')}</span>`}${years(it) ? `, <b>${esc(years(it))}</b>` : ''} <small class="muted">— ${esc(it.why)}</small></div>
                    ${opts.noArchive ? '' : `<div class="h-gap-arch">🏛️ ${esc(it.archive?.label || '')}</div>`}</div>
                <div class="h-gap-act">${it.kind === 'socface' ? `<button type="button" class="button small secondary" data-gap-sf="found" title="Noté dans le Journal des recherches ; importe ensuite le CSV pour avoir le foyer">✓ Trouvé</button><button type="button" class="button small secondary" data-gap-sf="none" title="Noté dans le Journal des recherches : « Rien trouvé »">Pas trouvé</button><button type="button" class="button small secondary" data-sf-import="${Number(it.person_id)}">⤒ Importer…</button>` : '<button type="button" class="button small secondary" data-gap-add title="Ajouter une ligne « à faire » dans Recherche → Dépouillement d’archive">📌 Au suivi</button>' + (ext.openActLetter && {birth: 'naissance', marriage: 'mariage', death: 'deces'}[it.kind] ? `<button type="button" class="button small secondary" data-cl-ask="${Number(it.person_id)}" data-cl-act="${({birth: 'naissance', marriage: 'mariage', death: 'deces'})[it.kind]}" data-cl-what="${it.from != null && it.from < new Date().getFullYear() - 100 ? 'recherche' : 'integrale'}" title="Une lettre toute prête pour demander cet acte (mairie, archives…)">📮 Demander l’acte</button>` : '')}</div></div>
            ${it.decennial?.length ? `<p class="h-gap-td">📇 Tables décennales : ${it.decennial.map(t => `<span>${esc(t)}</span>`).join('')}</p>` : ''}
            <ul class="h-gap-where">${where}</ul>
            <div class="h-gap-foot">${done ? `<span class="muted">Déjà cherché :</span> ${done}` : ''}<span class="h-gap-links">${links}</span></div></article>`;
    }

    async function render(token) {
        const v = st(), ws = document.getElementById('workspace');
        ws.innerHTML = '<section class="page h-gaps">'+window.LCNDA_UI.spinner('Je regarde ce qui manque à la lignée…')+'</section>';
        let d;
        try { d = await api('research_gaps', {gen: v.gen, limit: v.limit, ...(v.person ? {person: v.person} : {})}); } catch (e) { ws.innerHTML = `<section class="page"><p class="error">${esc(e.message)}</p></section>`; return; }
        if (token !== S().workspaceToken || S().module !== 'recherche') return;
        if (d.person_invalid) { setPerson(0, ''); toast(i18n('Cette personne n’existe plus : retour à {name}.', {name: d.default_root_name || ''})); }
        else if (v.person && d.root_name && d.root_name !== v.personName) setPerson(v.person, d.root_name);
        const chosen = v.person && d.root_id && Number(d.root_id) !== Number(d.default_root_id);
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
                return `<h3>🏛️ ${esc(it.archive?.label || '')} <small class="muted">${list.length} recherche${list.length > 1 ? 's' : ''}</small>${ext.visitPrepare ? ` <button type="button" class="button small secondary" data-gap-visit="${esc(it.archive?.key || '')}">🗄 ${esc(i18n('Préparer une visite'))}</button>` : ''}</h3>
                    <p class="h-gaps-sub">${communes.length ? `Communes : ${communes.map(c => `<span>${esc(c)}</span>`).join('')}` : ''}
                    <span class="h-gap-links">${it.archive?.france && a.department ? `<a href="${esc(webSearch(`${it.archive.label} état civil en ligne`))}" target="_blank" rel="noopener">🌐 Trouver le site des archives</a> · <a href="${esc(faSearch(a.department))}" target="_blank" rel="noopener">FranceArchives</a>` : ''}</span></p>`;
            };
            const sortIn = list => v.group === 'archives' || v.group === 'commune' ? [...list].sort((a, b) => String(a.place).localeCompare(String(b.place), 'fr') || (a.from ?? 0) - (b.from ?? 0)) : list;
            // 🗂 un cadre par personne : son nom, Sosa · génération, ses dates, le nombre de recherches ; une ligne par recherche
            const cards = list => {
                const by = new Map(); sortIn(list).forEach(it => { const k = Number(it.person_id); if (!by.has(k)) by.set(k, []); by.get(k).push(it); });
                return [...by.values()].sort((a, b) => (a[0].sosa || 0) - (b[0].sosa || 0)).map(cardHtml).join('');
            };
            const cardHtml = l => { const it = l[0], life = lifeText(d.life?.[it.person_id]);
                return `<article class="h-gap-card" data-gap-person="${Number(it.person_id)}"><header class="h-gap-card-head"><div class="h-gap-card-who"><button type="button" class="table-link h-gap-card-name" data-h-person="${Number(it.person_id)}">${esc(it.name)}</button>
                    <small class="muted">${esc(i18n('Sosa {n} · génération {g}', {n: fmt(it.sosa), g: it.generation}))}${life ? ` · <span class="h-gap-life">${esc(life)}</span>` : ''}</small></div>
                    <span class="h-gap-card-count" data-gap-card-count>${esc(plural(l.length, 'recherche', 'recherches'))}</span></header>
                    <div class="h-gap-card-body">${l.map(x => row(x, {noPerson: true, noArchive: v.group === 'archives'})).join('')}</div></article>`; };
            const framed = cadres.on(); // sans cadres : les lignes d'avant, toujours rangées par groupe
            ws.querySelector('[data-gaps-list]').innerHTML = vis.length ? [...groups.entries()].map(([k, list]) => `<section class="h-gaps-group">${framed && v.group === 'person' ? '' : head(k, list)}${framed ? cards(list) : sortIn(list).map(it => row(it, {noPerson: v.group === 'person', noArchive: v.group === 'archives'})).join('')}</section>`).join('')
                : `<p class="muted">${items.length ? 'Rien avec ces filtres.' : 'Rien ne manque dans les générations regardées : bravo ! Regarde plus loin (générations) ou complète la lignée.'}</p>`;
            ws.querySelector('[data-gaps-count]').textContent = `${fmt(vis.length)} recherche${vis.length > 1 ? 's' : ''}${vis.length !== items.length ? ` sur ${fmt(items.length)}` : ''}`;
            shownNow = vis; ws.querySelector('.page')?.__rk?.refreshRows?.();
        };
        let shownNow = items;
        const counts = d.counts || {};
        ws.innerHTML = `<section class="page h-gaps"><header class="page-header"><div><span class="eyebrow">RECHERCHE · QUE MANQUE-T-IL ?</span><h2>${d.root_name ? i18n('Les actes à chercher pour la lignée de {name}', {name: esc(d.root_name)}) : i18n('Les actes à chercher')}</h2>
                <p class="muted">${i18n('{searches} pour {ancestors} ancêtres sur {gens} générations, chez {services}.', {searches: plural(d.total, 'recherche', 'recherches'), ancestors: Number(d.ancestors || 0), gens: Number(d.generations || 0), services: plural((d.archives || []).length, 'service d’archives', 'services d’archives')})} ${i18n('Les plus proches générations d’abord : leurs actes sont les plus faciles à trouver, et chacun ouvre la porte du suivant.')}</p></div>
                <div class="page-actions"><button type="button" class="button secondary" data-gaps-print>🖨 Imprimer pour aller aux archives</button></div></header>
            <div class="h-gaps-bar"><div class="h-gaps-who"><span class="h-gaps-lab" id="h-gaps-who-lab">${esc(i18n('Pour qui ?'))}</span><span class="h-gaps-who-row"><button type="button" class="button secondary h-gaps-pick" data-gaps-pick aria-labelledby="h-gaps-who-lab h-gaps-who-name" title="${esc(i18n('Chercher ce qui manque à la lignée d’une autre personne'))}">👤 <span id="h-gaps-who-name" data-i18n-off>${esc(d.root_name || '…')}</span> ▾</button>
                ${chosen ? `<button type="button" class="link-button" data-gaps-reset>${esc(i18n('↺ Revenir à {name}', {name: d.default_root_name || ''}))}</button>` : ''}</span></div>
                <label>Générations<select data-gaps-gen>${GENS.map(n => `<option value="${n}" ${n === v.gen ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
                <label>Ranger par<select data-gaps-group>${[['archives', 'Service d’archives'], ['commune', 'Commune'], ['person', 'Ancêtre'], ['kind', 'Sorte d’acte']].map(([k, l]) => `<option value="${k}" ${k === v.group ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label class="h-gaps-q">Filtrer<input type="search" data-gaps-q value="${esc(v.q)}" placeholder="Nom, commune, département…"></label>
                <label class="ui-toggle h-gaps-frames"><input type="checkbox" data-gaps-frames ${cadres.on() ? 'checked' : ''}><i></i><span>${esc(i18n('Un cadre par personne'))}</span></label>
                <strong data-gaps-count></strong></div>
            <div class="h-gaps-kinds">${Object.entries(KINDS).filter(([k]) => counts[k]).map(([k, [ico, l]]) => `<label class="h-gaps-chip"><input type="checkbox" data-gaps-kind="${k}" ${v.off.includes(k) ? '' : 'checked'}> ${ico} ${esc(l)} <small>${fmt(counts[k])}</small></label>`).join('')}</div>
            <div data-gaps-list></div>${Number(d.total || 0) > items.length ? `<p class="h-gaps-more muted" data-gaps-more-note>${esc(i18n('Les {shown} premières recherches sur {total} : affine avec le filtre ou les générations.', {shown: fmt(items.length), total: fmt(d.total)}))} <button type="button" class="button small secondary" data-gaps-more>${esc(i18n('Voir les suivantes'))}</button></p>` : ''}${d.truncated ? `<p class="h-gaps-more muted">${esc(i18n('Lignée très grande : les {n} premiers ancêtres sont regardés.', {n: fmt(d.ancestors)}))}</p>` : ''}</section>`;
        draw();
        // 🗺 Carte des communes à visiter · 🧺 📎 les recherches montrées (app-recherche-kit.js)
        if (items.length) ext.researchKit?.table(ws.querySelector('.page'), {key: 'gaps', title: i18n('Que manque-t-il ?'), criteria: `${i18n('Que manque-t-il ?')} : ${d.root_name || ''} · ${plural(v.gen, 'génération', 'générations')}`,
            columns: [i18n('Personne'), i18n('Acte'), i18n('Commune'), i18n('Années'), i18n('Archives')], list: () => shownNow,
            cells: it => [`${it.name} (Sosa ${it.sosa})`, KINDS[it.kind]?.[1] || it.what, it.place || '', years(it), it.archive?.label || ''],
            itemOf: it => ({kind: 'row', ref_id: 0, title: `${KINDS[it.kind]?.[1] || it.what} — ${it.name}`, value: [it.place, years(it), it.archive?.label].filter(Boolean).join(' · '), data: {person_id: Number(it.person_id), columns: [i18n('Acte'), i18n('Commune'), i18n('Années'), i18n('Archives')], row: [KINDS[it.kind]?.[1] || it.what, it.place || '', years(it), it.archive?.label || '']},
                origin: {kind: 'research', label: `${i18n('Que manque-t-il ?')} · ${d.root_name || ''}`, url: '', person_id: Number(it.person_id)}}),
            geoOf: it => (it.lat != null ? {lat: it.lat, lon: it.lon, place: it.place} : null), rowSel: '[data-gap-i]', rowAttr: 'gapI', hoverIds: it => [it._i], color: '#e8590c', legend: i18n('Commune à visiter')});
        ws.querySelector('[data-gaps-gen]').addEventListener('change', e => { v.gen = Number(e.target.value); v.limit = 600; lsSet('genealogie-gaps-gen', v.gen); render(++S().workspaceToken); });
        ws.querySelector('[data-gaps-pick]').addEventListener('click', async () => {
            const P = window.LCNDA_PICKER || A().picker; if (!P?.openPicker) return;
            const it = await P.openPicker({kind: 'person', title: i18n('Que manque-t-il ? Pour qui ?'), allowCreate: false});
            if (!it || !(Number(it.id) > 0)) return;
            setPerson(Number(it.id) === Number(d.default_root_id) ? 0 : it.id, it.title || it.name || ''); render(++S().workspaceToken);
        });
        ws.querySelector('[data-gaps-frames]').addEventListener('change', e => { cadres.set(e.target.checked); draw(); });
        ws.querySelector('[data-gaps-reset]')?.addEventListener('click', () => { setPerson(0, ''); render(++S().workspaceToken); });
        ws.querySelector('[data-gaps-more]')?.addEventListener('click', () => { v.limit += 600; render(++S().workspaceToken); });
        ws.querySelector('[data-gaps-group]').addEventListener('change', e => { v.group = e.target.value; lsSet('genealogie-gaps-group', v.group); draw(); });
        let tm = 0; ws.querySelector('[data-gaps-q]').addEventListener('input', e => { clearTimeout(tm); tm = setTimeout(() => { v.q = e.target.value; draw(); }, 200); });
        ws.querySelectorAll('[data-gaps-kind]').forEach(c => c.addEventListener('change', () => { v.off = [...ws.querySelectorAll('[data-gaps-kind]')].filter(x => !x.checked).map(x => x.dataset.gapsKind); draw(); }));
        ws.querySelector('[data-gaps-print]').addEventListener('click', () => { if (window.LCNDA_UI?.printPage) { window.LCNDA_UI.printPage('Les trous à combler, pour aller aux archives', {bodyClass: 'h-gaps-printing'}); return; } document.body.classList.add('h-gaps-printing'); window.print(); setTimeout(() => document.body.classList.remove('h-gaps-printing'), 500); }); // K13
        ws.querySelector('[data-gaps-list]').addEventListener('click', async e => {
            // 🗄 Préparer une visite chez ce service, avec ses cotes (heritage-complements-2.js)
            const gv = e.target.closest('[data-gap-visit]');
            if (gv && ext.visitPrepare) { const k = gv.dataset.gapVisit; const list = items.filter(x => String(x.archive?.key || '') === k && !v.off.includes(x.kind)); return ext.visitPrepare({archive: list[0]?.archive || {}, items: list, kinds: KINDS, years}); }
            // 🧾 SocFace : « ✓ Trouvé / Pas trouvé » passe dans le Journal des recherches (un dépouillement fait), la ligne s'en va
            const sfb = e.target.closest('[data-gap-sf]');
            if (sfb) {
                const art = sfb.closest('[data-gap-i]'), it = items.find(x => x._i === Number(art.dataset.gapI)), res = sfb.dataset.gapSf;
                sfb.disabled = true;
                try {
                    const url = art.querySelector('[data-gap-sf-link]')?.href || '';
                    const r = await api('save_archive_digest', {}, {method: 'POST', body: {id: 0, place_id: it.place_id || 0, city_name: it.place || '', department: it.archive?.department || '', archive_service: 'FranceArchives — recensements (SocFace)', archive_url: url, year_text: String(it.from), record_type: 'recensement', status: 'done', result: res,
                        searched: `Recensement de ${it.from} à ${it.place} : ${it.name} (Sosa ${it.sosa}) — base de noms SocFace (transcription automatique, peut contenir des erreurs)`, sought_ids: [it.person_id]}});
                    const id = Number(r?.result?.id || r?.id || 0);
                    const idx = items.indexOf(it); items.splice(idx, 1); draw();
                    A().undoToast?.(res === 'found' ? i18n('Trouvé : recensement de {year} noté dans le Journal des recherches', {year: String(it.from)}) : i18n('Pas trouvé : noté dans le Journal des recherches'), {undo: async () => { if (id) await api('delete_archive_digest', {}, {method: 'POST', body: {id}}); items.splice(idx, 0, it); draw(); }});
                } catch (err) { sfb.disabled = false; toast(err.message, 'error'); }
                return;
            }
            const gi = e.target.closest('[data-gap-inv]'); // 🧺 « Que manque-t-il ? » → une piste d'enquête choisie (heritage-connexions.js)
            if (gi) {
                const it = items.find(x => x._i === Number(gi.closest('[data-gap-i]').dataset.gapI)); if (!it) return;
                const label = `${KINDS[it.kind]?.[1] || it.what} de ${it.name}`;
                const where = await ext.connexions.leadTarget(Number(it.person_id), `Que manque-t-il ? — ${it.name}`); if (where === null) return;
                const notes = [`${it.place ? `À ${it.place}` : 'Lieu inconnu'}${years(it) ? `, ${years(it)}` : ''} — ${it.why}`, ...(it.where || []).map(w => `${w.series} : ${w.detail}`), it.archive?.label ? `🏛️ ${it.archive.label}` : ''].filter(Boolean).join('\n');
                try {
                    const r0 = await api('ou_chercher_piste', {}, {method: 'POST', body: {person_id: Number(it.person_id), title: `${label}${it.place ? ` · ${it.place}` : ''}${years(it) ? ` · ${years(it)}` : ''}`.slice(0, 200), url: '', notes: `${notes}\n— proposé par « Que manque-t-il ? » (Sosa ${it.sosa}).`, ...where}});
                    const r = r0?.result || r0;
                    A().undoToast?.(i18n('🕵️ « {w} » : piste ajoutée à l’enquête', {w: label}), {undo: async () => {
                        if (r.link_id) await api('cx_write', {}, {method: 'POST', body: {op: 'item_link_remove', ids: [r.link_id]}});
                        if (r.item_id) await api('delete_investigation_item', {}, {method: 'POST', body: {id: r.item_id}});
                        if (r.created && r.investigation_id) await api('delete_investigation', {}, {method: 'POST', body: {id: r.investigation_id}}); }});
                } catch (err) { toast(err.message, 'error'); }
                return;
            }
            const b = e.target.closest('[data-gap-add]'); if (!b) return;
            const it = items.find(x => x._i === Number(b.closest('[data-gap-i]').dataset.gapI));
            const notes = (it.where || []).map(w => `${w.series} : ${w.detail}`).join('\n') + (it.decennial?.length ? `\nTables décennales : ${it.decennial.join(', ')}` : '');
            b.disabled = true;
            try {
                await api('save_archive_digest', {}, {method: 'POST', body: {id: 0, place_id: it.place_id || 0, city_name: it.place || '', department: it.archive?.department || '', archive_service: it.archive?.label || '', year_text: years(it), record_type: it.record_type || 'autre', status: 'todo',
                    searched: `${KINDS[it.kind]?.[1] || it.what} de ${it.name} (Sosa ${it.sosa}) — ${it.why}`, notes}});
                it.digested = [...(it.digested || []), {year_text: years(it), status: 'todo'}]; b.textContent = '✓ Ajouté'; toast('Ajouté au suivi : Recherche → Dépouillement d’archive.');
                const art = b.closest('[data-gap-i]'); art.outerHTML = row(it, {noPerson: cadres.on() || v.group === 'person', noArchive: v.group === 'archives'});
            } catch (err) { b.disabled = false; toast(err.message, 'error'); }
        });
    }
    ext.researchGaps = render;
    ext.researchGapsFor = openFor;
    ext.cadres = cadres;
    // Réglages → 🔎 Recherche : la case « Un cadre par personne » (même clé que la case de la barre)
    const wrapSettings = () => {
        const base = ext.maintenance?.recherche_fr; if (!base || base.cadresWrapped) return;
        const wrapped = async token => {
            await base(token);
            const page = document.querySelector('#workspace .rfr-page'); if (!page || page.querySelector('[data-cadres-pref]')) return;
            const box = document.createElement('section'); box.className = 'maintenance-panel';
            box.innerHTML = `<h3>${esc(i18n('Affichage des listes de recherche'))}</h3><label class="ui-toggle"><input type="checkbox" data-cadres-pref ${cadres.on() ? 'checked' : ''}><i></i><span>${esc(i18n('Un cadre par personne'))}<small class="muted"> — ${esc(i18n('Que manque-t-il ?, Où chercher, doutes, contrôle, pistes, Ma semaine, décès possibles, actes manquants, doublons : ce qui concerne chaque personne réuni dans un cadre ; sinon une ligne par élément'))}</small></span></label>`;
            page.appendChild(box);
            box.querySelector('[data-cadres-pref]').addEventListener('change', e => { cadres.set(e.target.checked); toast(i18n('Réglage enregistré.'), 'success'); });
        };
        wrapped.cadresWrapped = true; wrapped.qpWrapped = base.qpWrapped; ext.maintenance.recherche_fr = wrapped;
    };
    wrapSettings(); document.addEventListener('DOMContentLoaded', wrapSettings); window.addEventListener('load', wrapSettings);
    // 🔍 la fiche, menu ⋯ : « Que manque-t-il pour elle / lui ? »
    (ext.personMoreItems = ext.personMoreItems || []).push(detail => { const p = detail?.person; if (!p?.id || p.kind === 'animal') return null;
        return {key: 'que-manque', icon: '🔍', label: i18n(p.gender === 'male' ? 'Que manque-t-il pour lui ?' : 'Que manque-t-il pour elle ?'), run: () => openFor(Number(p.id), A().personName?.(p) || `${p.first_name || ''} ${p.last_name || ''}`.trim())}; });
    // un foyer SocFace importé : sa ligne « Recensement de … : chercher sur SocFace » s'en va
    window.addEventListener('lcnda:socface-changed', () => { if (S()?.module === 'recherche' && S().researchKind === 'gaps') render(++S().workspaceToken); });
})();
