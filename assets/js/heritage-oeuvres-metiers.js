/* LCNDA — ⚒️ Métiers d'art (maquette S de docs/design/profils-et-oeuvres.html) et le profil « 🔨 Artisan d'art ».
 *  - La liste officielle (arrêté du 24 décembre 2015, JORFTEXT000031941949) : assets/data/metiers-art.json
 *    {source, url, licence, domaines: [{domaine, titre, icone, type, metiers: [{nom, specialites, type?}]}]} — les noms
 *    officiels tels quels ; « icone » et « type » (le type d'œuvre proposé) sont ajoutés par LCNDA. Un même métier peut être
 *    dans deux domaines (Ciseleur, Graveur…) : il reste dans chacun.
 *  - La fenêtre « ⚒️ Métiers d'art » : 16 domaines, recherche (métier, spécialité), choisir un métier = nouvelle fiche du bon
 *    type d'œuvre avec le métier noté. La recherche de « ＋ Nouvelle œuvre » propose aussi les métiers (OE.searchMetiers).
 *  - Le profil « Artisan d'art » (ART.profiles.artisan, fiche de profil « profile_artisan ») et ses sections de page :
 *    formation et apprentissage, compagnonnage, titres (MOF, Maître d'art, EPV), atelier, poinçons et marques, pièces.
 *    L'écran des cases « Cette personne était… » est celui du domaine « profils » : ici, la déclaration.
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART, OE = ART?.oeuvres; if (!OE?.make) return;
    const A = () => window.LCNDA_APP, X = () => window.LCNDA_EXT || {};
    const U = ART.util, esc = U.esc, G = OE.G, F = OE.F;
    const LEGI = 'https://www.legifrance.gouv.fr/loda/id/JORFTEXT000031941949/';

    /* ═════════ La liste (chargée une fois) ═════════ */
    let DATA = null, LOADING = null;
    OE.loadMetiers = () => DATA ? Promise.resolve(DATA) : (LOADING = LOADING || fetch('assets/data/metiers-art.json?v=1').then(r => { if (!r.ok) throw new Error('Liste des métiers introuvable.'); return r.json(); })
        .then(j => { DATA = j && Array.isArray(j.domaines) ? j : {domaines: []}; return DATA; }).catch(e => { LOADING = null; throw e; }));
    OE.metiersData = () => DATA;
    /** tous les métiers et spécialités, à plat (un métier de deux domaines compte deux fois) */
    const flat = () => (DATA?.domaines || []).flatMap(d => (d.metiers || []).flatMap(m => [{nom: m.nom, label: m.nom, domaine: d.domaine, type: m.type || d.type || 'o_piece_art', icon: d.icone || '⚒️'},
        ...(m.specialites || []).map(s => ({nom: m.nom, spec: s, label: `${s} (${m.nom})`, domaine: d.domaine, type: m.type || d.type || 'o_piece_art', icon: d.icone || '⚒️'}))]));
    OE.searchMetiers = q => { if (!DATA) return []; const w = OE.norm(q).split(/\s+/).filter(Boolean); if (!w.length) return [];
        return flat().filter(x => { const s = OE.norm(`${x.label} ${x.domaine}`); return w.every(t => s.includes(t)); }).filter(x => ART.defs[x.type]); };
    // la recherche de « ＋ Nouvelle œuvre » : la liste se charge à l'ouverture, puis la fenêtre se redessine
    const open0 = OE.openChooser;
    OE.openChooser = (C, o) => { const dlg = open0(C, o); OE.loadMetiers().then(() => { const q = dlg.isConnected && dlg.querySelector('[data-oe-q]'); if (q?.value) q.dispatchEvent(new Event('input', {bubbles: true})); }).catch(() => {}); return dlg; };

    /* ═════════ La fenêtre « ⚒️ Métiers d'art » ═════════ */
    OE.openMetiers = async C => {
        let data; try { data = await OE.loadMetiers(); } catch (e) { A().toast(e.message, 'error'); return; }
        let q = '';
        const dlg = document.createElement('dialog'); dlg.className = 'modal oe-dlg oe-met'; dlg.dataset.ownClose = '1'; dlg.dataset.dndOff = ''; dlg.dataset.ordOff = '';
        dlg.innerHTML = `<div class="oe-shell"><header class="ar-top"><span class="ar-ticon">⚒️</span><div class="ar-tname"><span class="eyebrow">${esc(C.store.name.toLocaleUpperCase('fr-FR'))} · ŒUVRES</span><h2>Métiers d’art : ${esc(U.plural(data.domaines.length, 'domaine'))}</h2></div><span class="spacer"></span>
            <button type="button" class="button small secondary" data-m-profile title="Apprentissage, compagnonnage, titres, atelier, poinçons">🔨 Profil « artisan d’art »</button><button type="button" class="icon-button" data-m-close aria-label="Fermer" title="Fermer">×</button></header>
            <div class="oe-body"><input type="search" data-m-q placeholder="Chercher un métier… (ferronnier, dinandier, plumassier, luthier…)" aria-label="Chercher un métier" autocomplete="off"><p class="ar-note oe-src">Choisis un métier : une nouvelle fiche du bon type d’œuvre s’ouvre (pièce de ferronnerie, reliure, instrument, vitrail…), avec le métier noté.</p>
            <div class="oe-sumg" data-m-grid></div><p class="ar-note oe-src">Liste officielle : <a href="${esc(LEGI)}" target="_blank" rel="noopener noreferrer">arrêté du 24 décembre 2015</a> fixant la liste des métiers d’art.</p></div></div>`;
        document.body.appendChild(dlg); dlg.showModal();
        const close = () => { dlg.close(); dlg.remove(); };
        dlg.addEventListener('cancel', e => { e.preventDefault(); if (q) { q = ''; dlg.querySelector('[data-m-q]').value = ''; paint(); return; } close(); });
        function paint() {
            const w = OE.norm(q).split(/\s+/).filter(Boolean), hit = s => !w.length || w.every(t => OE.norm(s).includes(t));
            const cards = data.domaines.map((d, di) => { const all = d.metiers || [], shown = all.filter(m => hit(`${m.nom} ${(m.specialites || []).join(' ')} ${d.domaine}`));
                if (w.length && !shown.length) return '';
                return `<section class="oe-sumc ${d.domaine === 'Métal' ? 'is-hl' : ''}"><b>${esc(d.icone || '⚒️')} ${esc(d.domaine)}</b><span class="oe-k">${esc(U.plural(all.length, 'métier'))}${ART.defs[d.type] ? ` · ${esc(ART.defs[d.type].icon)} ${esc(ART.defs[d.type].label)}` : ''}</span>
                    <span class="oe-ml">${shown.map((m, mi) => `<button type="button" class="oe-mt" data-m-d="${di}" data-m-i="${all.indexOf(m)}" title="${esc(`Nouvelle fiche : ${ART.defs[m.type || d.type]?.label || ''}`)}">${esc(m.nom)}</button>${(m.specialites || []).length ? `<small class="oe-spec">(${(m.specialites || []).map((s, si) => `<button type="button" class="oe-mt is-spec" data-m-d="${di}" data-m-i="${all.indexOf(m)}" data-m-s="${si}">${esc(s)}</button>`).join(', ')})</small>` : ''}`).join('<span class="oe-dot"> · </span>')}</span></section>`; }).join('');
            dlg.querySelector('[data-m-grid]').innerHTML = cards || A().emptyState({icon: '⚒️', text: `Aucun métier pour « ${q} »`, hint: 'Vérifie l’orthographe (sans accents, ça marche aussi).'});
        }
        dlg.addEventListener('input', e => { if (e.target.matches('[data-m-q]')) { q = e.target.value.trim(); paint(); } });
        dlg.addEventListener('keydown', e => { if (e.target.matches('[data-m-q]') && e.key === 'Enter') { e.preventDefault(); dlg.querySelector('.oe-mt')?.click(); } });
        dlg.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.mClose !== undefined) return close();
            if (b.dataset.mProfile !== undefined) { close(); return OE.openArtisanProfile(C); }
            if (b.dataset.mD !== undefined) { const d = data.domaines[Number(b.dataset.mD)], m = d?.metiers?.[Number(b.dataset.mI)]; if (!m) return; const kind = ART.defs[m.type] ? m.type : ART.defs[d.type] ? d.type : 'o_piece_art';
                close(); const S = C.S; S.view = 'list'; S.kind = kind; S.id = 0; S.back = []; C.prefs.extraTabs = [...new Set([...(C.prefs.extraTabs || []), kind])]; C.savePrefs(); C.paint(true);
                C.newItem(kind, {metier: b.dataset.mS !== undefined ? `${m.nom} — ${m.specialites[Number(b.dataset.mS)]}` : m.nom, metier_domain: d.domaine}); }
        });
        paint(); setTimeout(() => dlg.querySelector('[data-m-q]')?.focus(), 30);
    };

    /* ═════════ 🔨 Le profil « Artisan d'art » ═════════ */
    const DEVOIR = [['', '—'], ['devoir', 'Compagnons du Devoir et du Tour de France'], ['federation', 'Fédération compagnonnique des métiers du bâtiment'], ['union', 'Union compagnonnique des Devoirs unis'], ['autre', 'autre']];
    ART.define({key: 'profile_artisan', icon: '🔨', label: 'Profil d’artisan d’art', many: 'Profils d’artisans d’art', domain: 'profile', hidden: true, quiet: true,
        groups: [
            {key: 'main', label: 'Artisan d’art', zone: 'main', fields: [F(['title', 'Nom d’artisan', 'text', {head: true}]), F(['metiers', 'Métiers', 'rows', {addLabel: 'Un métier', cols: [{key: 'metier', label: 'Métier (liste officielle)', w: 'l'}, {key: 'domain', label: 'Domaine', w: 'm'}, {key: 'from', label: 'De', w: 's'}, {key: 'to', label: 'À', w: 's'}]}])]},
            {key: 'formation', label: 'Formation et apprentissage', icon: '🧑‍🏭', zone: 'main', fields: [['master', 'Maître d’apprentissage', 'person', {roleWord: 'maître d’apprentissage'}], ['master_rel', 'Lien', 'text', {ph: 'son père'}], ['contract', 'Contrat d’apprentissage', 'text', {ph: '1916 – 1919'}], ['contract_doc', 'Contrat (pièce)', 'document', {h: 1}],
                ['diplomas', 'Diplômes', 'rows', {addLabel: 'Un diplôme', cols: [{key: 'what', label: 'Diplôme', w: 's', ph: 'CAP, BMA, DMA'}, {key: 'spec', label: 'Spécialité', w: 'm'}, {key: 'year', label: 'Année', w: 's'}]}], ['schools', 'Écoles', 'text', {ph: 'École Boulle (cours du soir)'}]].map(F)},
            {key: 'compagnonnage', label: 'Compagnonnage', icon: '🛠', zone: 'main', fields: [['devoir', 'Devoir', 'select', {choices: DEVOIR}], ['comp_name', 'Nom de compagnon', 'text', {ph: '« Limousin la Fidélité »'}],
                ['tour', 'Tour de France', 'rows', {addLabel: 'Une étape', cols: [{key: 'place', label: 'Ville', type: 'place', w: 'm'}, {key: 'from', label: 'De', w: 's'}, {key: 'to', label: 'À', w: 's'}, {key: 'at', label: 'Chez', w: 'm'}]}],
                ['masterpiece', 'Chef-d’œuvre', 'item', {kinds: []}], ['received', 'Reçu', 'text', {ph: 'Toussaint 1923, Lyon'}]].map(F)},
            {key: 'titres', label: 'Titres', icon: '🎖', zone: 'main', fields: [['mof', 'Meilleur Ouvrier de France', 'text', {ph: '1936 · classe ferronnerie'}], ['mof_doc', 'Diplôme MOF', 'document', {h: 1}], ['maitre_art', 'Maître d’art', 'text', {ph: '1994'}], ['epv', 'Entreprise du patrimoine vivant', 'text', {ph: 'l’atelier, 2008'}],
                ['other_titles', 'Autres titres', 'rows', {h: 1, addLabel: 'Un titre', cols: [{key: 'what', label: 'Titre', w: 'l'}, {key: 'year', label: 'Année', w: 's'}]}]].map(F)},
            {key: 'atelier', label: 'Atelier · entreprise', icon: '🏭', zone: 'main', fields: [['workshop', 'Atelier', 'employer', {icon: '🏭'}], ['founded', 'Fondé', 'text', {ph: '1888'}], ['generations', 'Générations', 'text', {ph: '4 générations'}],
                ['crew', 'Compagnons et apprentis', 'people', {rolePh: 'compagnon, apprenti…'}], ['clients', 'Clients', 'text', {h: 1}], ['catalogue', 'Catalogue', 'document', {h: 1}], ['orders_book', 'Registre de commandes', 'document', {h: 1}]].map(F)},
            {key: 'poincons', label: 'Poinçons et marques', icon: '🔏', zone: 'main', fields: [['marks', 'Poinçons et marques', 'rows', {addLabel: 'Un poinçon, une marque', cols: [{key: 'mark', label: 'Marque', w: 'm', ph: '« P.M. » dans un losange'}, {key: 'kind', label: 'Sorte', w: 's', ph: 'poinçon, plaque, estampille'}, {key: 'from', label: 'De', w: 's'}, {key: 'to', label: 'À', w: 's'}, {key: 'where', label: 'Relevé, photo', w: 'm'}]}],
                ['garantie', 'Registre de la garantie', 'text', {h: 1, ph: 'orfèvres : bureau de garantie de…'}]].map(F)},
            {key: 'photos', label: 'Photos', zone: 'left', fields: [{key: 'photos', label: 'Photos (atelier, poinçons, diplômes)', type: 'photos', star: true, labels: [['atelier', 'Atelier'], ['poincon', 'Poinçon'], ['diplome', 'Diplôme'], ['portrait', 'Au travail'], ['autre', 'Autre']]}]},
            G.notes()],
        list: ['title', 'metiers'], card: []});
    ART.profiles = ART.profiles || {};
    const SECS = ['artisan_formation', 'artisan_compagnonnage', 'artisan_titres', 'artisan_atelier', 'artisan_poincons', 'artisan_pieces'];
    const CRAFT_KINDS = ['o_ferronnerie', 'o_piece_art', 'o_ceramique', 'o_verre', 'o_orfevrerie', 'o_tapisserie', 'o_broderie', 'o_ebenisterie', 'o_reliure', 'o_lutherie', 'o_horlogerie', 'o_medaille', 'o_mosaique', 'o_vitrail'];
    ART.profiles.artisan = {key: 'artisan', label: 'Artisan d’art', icon: '🔨', color: '#c2410c', group: 'creation', type: 'profile_artisan', kinds: ['o_ferronnerie'], craftKinds: CRAFT_KINDS, sections: SECS, // kinds = ses onglets d'office (les autres pièces : « ＋ Nouvelle œuvre » ou « ⚒️ Métiers d’art »)
       
        desc: 'apprentissage, compagnonnage, MOF, Maître d’art, EPV, atelier, poinçons', help: 'Apprentissage, compagnonnage, MOF, Maître d’art, EPV, atelier, poinçons — s’ajoute au profil artiste ou se coche seul.',
        models: {artisan: {label: 'Artisan d’art', order: SECS, hidden: []}}, defaultModel: () => 'artisan',
        hero: C => { const d = C.store.of('profile_artisan')[0]?.data || {}, met = (d.metiers || []).map(r => r.metier).filter(Boolean), n = CRAFT_KINDS.reduce((a, k) => a + C.store.of(k).length, 0);
            return {eyebrow: `🔨 ARTISAN D’ART${met.length ? ` · ${met.join(', ').toLocaleUpperCase('fr-FR')}` : ''}`, summary: [n && U.plural(n, 'pièce'), d.mof && 'Meilleur Ouvrier de France', d.maitre_art && 'Maître d’art', d.comp_name && `compagnon ${d.comp_name}`].filter(Boolean).join(' · ')}; },
        timeline: C => { const d = C.store.of('profile_artisan')[0]?.data || {}, y = s => Number(U.yearOf(s)) || 0, bars = [];
            const ct = String(d.contract || '').match(/(\d{4})\D+(\d{4})/); if (ct) bars.push({a: +ct[1], b: +ct[2], text: 'apprentissage'});
            (d.tour || []).forEach(r => { const a = y(r.from), b = y(r.to) || a; if (a) bars.push({a, b, text: `tour de France · ${U.placeTitle(r.place)}`}); });
            (d.metiers || []).forEach(r => { const a = y(r.from), b = y(r.to) || a; if (a) bars.push({a, b, text: r.metier || 'métier'}); });
            return bars.length ? [{label: '🔨 Artisan d’art', bars}] : []; }};
    const prof = C => C.store.of('profile_artisan')[0] || null;
    OE.openArtisanProfile = C => { const p = prof(C); if (p) C.open(p.id, {edit: !Object.keys(p.data || {}).some(k => k !== 'title' && p.data[k])}); else C.newItem('profile_artisan', {title: C.store.name}); };
    const edit = '<button type="button" class="icon-button small" data-oe-editartisan title="Modifier">…</button>';
    const dl = rows => { const h = rows.filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join(''); return h ? `<dl class="ar-dl ar-dl-s">${h}</dl>` : ''; };
    const empty = t => `<p class="muted">${esc(t)} : « … » pour l’écrire.</p>`;
    const P = ART.pageSections;
    P.artisan_formation = {icon: '🧑‍🏭', label: 'Formation et apprentissage', w: '⅓', profile: 'artisan', render: C => { const p = prof(C), d = p?.data || {}, x = p ? ART.ctx(C.store, p) : null;
        return {body: dl([['Maître d’apprentissage', d.master ? `${U.personChip(d.master, d.master_rel || '', x)}` : ''], ['Contrat', esc(d.contract || '') + (d.contract_doc ? ' · 📄' : '')], ...(d.diplomas || []).map(r => [r.what || 'Diplôme', esc([r.spec, r.year].filter(Boolean).join(', '))]), ['Écoles', esc(d.schools || '')]]) || empty('Maître d’apprentissage, contrat, CAP, écoles'), actions: edit}; }};
    P.artisan_compagnonnage = {icon: '🛠', label: 'Compagnonnage', w: '⅓', profile: 'artisan', render: C => { const p = prof(C), d = p?.data || {};
        const tour = (d.tour || []).map(r => esc([U.placeTitle(r.place), r.from].filter(Boolean).join(' '))).filter(Boolean).join(' → ');
        return {body: dl([['Devoir', esc(OE.lab(DEVOIR, d.devoir) || '')], ['Nom', esc(d.comp_name || '')], ['Tour de France', tour], ['Chef-d’œuvre', d.masterpiece ? U.refChip(d.masterpiece, '⚒️') : ''], ['Reçu', esc(d.received || '')]]) || empty('Devoir, nom de compagnon, tour de France, chef-d’œuvre'), actions: edit}; }};
    P.artisan_titres = {icon: '🎖', label: 'Titres', w: '⅓', profile: 'artisan', render: C => { const d = prof(C)?.data || {};
        const l = [d.mof && `<div>🇫🇷 <b>Meilleur Ouvrier de France</b> ${esc(d.mof)}${d.mof_doc ? ' · 📄 diplôme' : ''}</div>`, d.maitre_art && `<div>Maître d’art (titre du ministère) · ${esc(d.maitre_art)}</div>`, d.epv && `<div>Entreprise du patrimoine vivant (EPV) : ${esc(d.epv)}</div>`, ...(d.other_titles || []).map(r => `<div>${esc([r.what, r.year].filter(Boolean).join(' · '))}</div>`)].filter(Boolean);
        return {body: l.join('') || empty('MOF, Maître d’art, EPV'), actions: edit}; }};
    P.artisan_atelier = {icon: '🏭', label: 'Atelier · entreprise', w: '½', profile: 'artisan', render: C => { const p = prof(C), d = p?.data || {}, crew = ART.normPeople(d.crew);
        const w = d.workshop ? ART.ft.employer.read({icon: '🏭'}, d.workshop) : '';
        const line = [w, d.founded && `fondé ${esc(d.founded)}`, d.generations && esc(d.generations), crew.length && `compagnons et apprentis 👤 (${crew.length})`, d.clients && `clients : ${esc(d.clients)}`, d.catalogue && 'catalogue 📄', d.orders_book && 'registre de commandes 📄'].filter(Boolean).join(' · ');
        return {body: line || empty('L’atelier (fiche Employeurs), fondation, compagnons'), actions: edit}; }};
    P.artisan_poincons = {icon: '🔏', label: 'Poinçons et marques', w: '½', profile: 'artisan', render: C => { const d = prof(C)?.data || {};
        const l = (d.marks || []).map(r => `<span class="ar-ochip"><i>◼</i>${esc(r.mark || '')}</span> ${esc([[r.from, r.to].filter(Boolean).join('-'), r.kind, r.where].filter(Boolean).join(' · '))}`).join(' · ');
        return {body: (l || '') + (d.garantie ? ` · ${esc(d.garantie)}` : '') || empty('Poinçons, plaques, estampilles'), actions: edit}; }};
    P.artisan_pieces = {icon: '⚒️', label: 'Pièces de métiers d’art', w: 'ligne', profile: 'artisan', render: C => { const st = C.store, kinds = Object.keys(ART.defs).filter(k => ART.defs[k].family === 'design' && !ART.defs[k].userType);
        const l = kinds.flatMap(k => st.of(k)).sort((a, b) => (Number(a.year) || 9999) - (Number(b.year) || 9999));
        return {count: l.length || '', body: l.length ? `<div class="ar-minicov" style="--n:6">${l.slice(0, 12).map(it => `<button type="button" class="ar-mc" data-ar-open="${it.id}">${U.cover(it)}<span>${esc(it.title)}</span><small>${esc([it.year, it.data?.metier].filter(Boolean).join(' · '))}</small></button>`).join('')}</div>` : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📭</span><span class="empty-line-text">Aucune pièce : « ⚒️ Métiers d’art » pour en ajouter une.</span></p>',
            actions: '<button type="button" class="button small secondary" data-oe-metiers>⚒️ Métiers d’art</button>'}; }};
    document.addEventListener('click', e => { const b = e.target.closest('.ar-dlg [data-oe-editartisan], .ar-dlg [data-oe-metiers]'); if (!b) return; const C = b.closest('.ar-dlg')._C; if (!C) return; e.preventDefault(); e.stopPropagation();
        if (b.dataset.oeMetiers !== undefined) OE.openMetiers(C); else OE.openArtisanProfile(C); }, true);
    // la fiche de profil enregistrée coche d'elle-même le profil « artisan » (serveur : ART_EXTRA_TYPES de lib/oeuvres.php)
})();
