/* LCNDA — 🧩 Types d'œuvres : les fiches DÉTAILLÉES des maquettes J, K et T (docs/design/profils-et-oeuvres.html).
 *  J : 🗿 Sculpture → 🔥 fontes et tirages (chaque fonte est une petite fiche) ; 🪧 Affiche (imprimeur, tirage, ce qu'elle annonçait).
 *  K : 🎻 Concerto (mouvements, création, interprétations → enregistrements → parutions) ;
 *      🎭 Pièce de théâtre → mises en scène → représentations → tournées (Arbre · Tableau · Calendrier · Carte).
 *      La fiche « représentation façon setlist » détaillée est celle du domaine « scène » : ici, le type parent et le lien.
 *  T : ⚒️ Pièce de ferronnerie (commande, techniques, poinçon, atelier, protection, restaurations) — et le modèle commun
 *      de toutes les pièces de métiers d'art (OE.craft), repris par heritage-oeuvres-types.js.
 * Noyau : heritage-oeuvres.js (OE.make, OE.G, vues « parties »).
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART, OE = ART?.oeuvres; if (!OE?.make) return;
    const A = () => window.LCNDA_APP, X = () => window.LCNDA_EXT || {};
    const U = ART.util, esc = U.esc, G = OE.G, F = OE.F, lab = OE.lab;
    const ATTRIB = ART.ARTLISTS?.ATTRIB || [['certaine', 'Œuvre certaine'], ['attribuee', 'Attribuée'], ['douteuse', 'Douteuse']];
    const badge = (t, cls = '') => `<span class="ar-badge ${cls}">${esc(t)}</span>`;
    const badges = l => { const b = l.filter(Boolean); return b.length ? `<div class="ar-badges">${b.join('')}</div>` : ''; };
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    /** « 12 mai 1951 », « 12/05/1951 », « 1951-05-12 », « 1er juin 1952 » → {y, m, d} */
    const frDate = s => { s = OE.norm(s).replace(/1er/, '1'); let m = s.match(/(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})/);
        if (m) { const mi = MONTHS.findIndex(x => OE.norm(x).startsWith(m[2].slice(0, 3))); if (mi >= 0) return {y: +m[3], m: mi, d: +m[1]}; }
        m = s.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{4})/); if (m) return {y: +m[3], m: +m[2] - 1, d: +m[1]};
        m = s.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return {y: +m[1], m: +m[2] - 1, d: +m[3]}; return null; };
    OE.frDate = frDate;
    const dkey = it => { const d = frDate(it.data?.date || ''); return d ? d.y * 10000 + d.m * 100 + d.d : (Number(it.year) || 9999) * 10000; };

    /* ═════════ J. 🗿 Sculpture et ses fontes ═════════ */
    const TECH = [['', '—'], ['cire', 'Fonte à la cire perdue'], ['sable', 'Fonte au sable'], ['taille', 'Taille directe'], ['modelage', 'Modelage'], ['moulage', 'Moulage, tirage'], ['assemblage', 'Assemblage, soudure'], ['autre', 'Autre']];
    const MAT = ['bronze', 'plâtre', 'terre cuite', 'marbre', 'pierre', 'bois', 'fer', 'résine', 'cire', 'autre'].map(x => [x, x]);
    const VERS = [['reduction', 'réduction'], ['agrandissement', 'agrandissement'], ['version', 'autre version'], ['monument', 'monument'], ['etude', 'étude peinte, dessinée'], ['dapres', 'faite d’après']];
    OE.make({key: 'o_sculpture', icon: '🗿', label: 'Sculpture', many: 'Sculptures', fem: true, fam: 'visual', chain: 'Modèle → fontes / tirages',
        eyebrow: it => ['Sculpture', it.data?.material, it.data?.catref].filter(Boolean).join(' · '),
        heading: (ctx, it) => `<h2 class="ar-h2">${esc(it.title)}${[it.data?.date, it.data?.material].filter(Boolean).length ? ` <small>· ${esc([it.data.date, it.data.material].filter(Boolean).join(' · '))}</small>` : ''}</h2>`,
        badges: (ctx, it) => { const d = it.data || {}, a = d.attribution || 'certaine', casts = OE.childrenOf(ctx.store, it, 'o_cast', 'sculpture'), post = casts.filter(c => c.data.posthumous).length;
            return badges([badge(`${a === 'certaine' ? '✓ ' : ''}${lab(ATTRIB, a)}`, a === 'certaine' ? 'ok' : 'w'), d.edition_plan ? badge(d.edition_plan, 'b') : '', post ? badge(U.plural(post, 'fonte posthume', 'fontes posthumes'), 'w') : '']); },
        newData: () => ({attribution: 'certaine', material: 'bronze'}),
        main: [['material', 'Matériau', 'select', {choices: MAT}], ['technique', 'Technique', 'select', {choices: TECH}], ['technique_note', 'Précision', 'text', {ph: 'd’après un modèle en plâtre'}],
            ['dims', 'Dimensions', 'dims'], ['weight', 'Poids', 'measure', {unit: 'kg'}], ['signature', 'Signé', 'text', {ph: '« J. MARTIN » sur la terrasse'}], ['founder_mark', 'Cachet du fondeur', 'text', {ph: '« Susse Fres Fondeurs Paris »'}],
            ['base', 'Socle', 'text', {ph: 'Marbre vert de mer, H. 8 cm'}], ['sitter', 'Modèle (a posé)', 'o_ppl', {rolePh: 'a posé, son portrait…', addLabel: 'Une personne'}],
            ['attribution', 'Attribution', 'select', {choices: ATTRIB, head: true}], ['catref', 'N° du catalogue raisonné', 'text', {ph: 'CR S-12'}], ['edition_plan', 'Tirage prévu', 'text', {ph: '8 + 4 EA', head: true}], ['inscriptions', 'Inscriptions', 'text', {h: 1}]],
        photos: [['face', 'Face'], ['profil', 'Profil'], ['dos', 'Dos'], ['cachet', 'Cachet'], ['signature', 'Signature'], ['platre', 'Plâtre'], ['esquisse', 'Esquisse'], ['detail', 'Détail']],
        groups: [
            {key: 'model', label: 'Modèle d’origine', icon: '🧱', zone: 'left', fields: [['model_material', 'Matériau', 'text', {ph: 'Plâtre patiné, 1931'}], ['model_where', 'Où', 'text', {ph: 'Musée du Cloître, Tulle'}], ['model_inv', 'N° d’inventaire', 'text'],
                ['sketch', 'Esquisse', 'text', {ph: 'terre cuite, 22 cm · famille'}], ['mould', 'Moule', 'text', {ph: 'détruit en 1990 (PV)'}]].map(F)},
            {key: 'casts', label: 'Fontes et tirages', zone: 'main', fields: [{key: '_casts', label: 'Fontes et tirages', secLabel: '🔥 Fontes et tirages', type: 'computed', view: 'o_casts', star: true}]},
            G.rows('versions', '↔ Agrandissements, réductions, versions', [['w', 'Œuvre', 'item', {kinds: ['o_sculpture', 'work', 'o_monument'], w: 'l'}], ['rel', 'Sorte', 'select', {choices: VERS, w: 's'}], ['material', 'Matière', 'text', {w: 's'}], ['size', 'Taille', 'text', {w: 's', ph: 'H. 32 cm'}], ['year', 'Année', 'text', {w: 's'}], ['maker', 'Fondeur', 'text', {w: 's'}], ['n', 'Exemplaires', 'text', {w: 's', ph: '25 ex.'}]], {add: 'Une version', view: 'o_versions'}),
            G.side('rights', 'Édition et droits', '⚖️', [['edition_plan_note', 'Tirage prévu', 'o_inline', {view: 'o_legal'}], ['contract', 'Contrat', 'text', {ph: 'Susse, 1931 · 📄'}], ['rights', 'Droits', 'text', {ph: 'ayants droit Martin'}], ['committee', 'Avis du comité', 'text', {ph: 'fonte 8/8 : authentifiée 1990'}]]),
            G.expos(), G.where(), G.prov(), G.biblio(), G.states(), G.value()],
        list: ['photos', 'catref', 'title', 'date', 'material', 'dims', '_ncasts'], card: ['date', 'material', 'edition_plan'], export: ['photos', 'catref', 'title', 'date', 'material', 'technique', 'dims', 'signature', 'founder_mark', 'edition_plan', 'exhibitions', 'literature', 'notes'],
        listExtra: [{key: '_ncasts', label: 'Fontes', type: 'computed', view: 'o_ncasts'}],
        filters: [store => [{id: 'post', label: 'Avec une fonte posthume', group: 'Fontes', type: 'check', test: (it, v) => !v || OE.childrenOf(store, it, 'o_cast', 'sculpture').some(c => c.data.posthumous)}]]});
    ART.views.o_ncasts = {read: (ctx, it) => String(OE.childrenOf(ctx.store, it, 'o_cast', 'sculpture').length || ''), text: (ctx, it) => String(OE.childrenOf(ctx.store, it, 'o_cast', 'sculpture').length || '')};
    ART.views.o_legal = {read: (ctx, it) => { const p = it.data?.edition_plan; return p ? `${esc(p)} <small class="ar-g">(limite légale : 8 + 4 EA = 12)</small>` : ''; }, text: (ctx, it) => it.data?.edition_plan || ''};
    ART.views.o_versions = {read: (ctx, it, f, v) => (v || []).map(r => `<div class="oe-vline">${r.w ? U.refChip(r.w, '🗿') : ''} <span class="ar-g">${esc([lab(VERS, r.rel), r.material, r.size, r.year, r.maker, r.n].filter(Boolean).join(' · '))}</span></div>`).join('')};
    const castSort = l => [...l].sort((a, b) => { const n = x => { const s = String(x.data?.no || x.title || ''); if (/^EA|^E\.?A/i.test(s)) return 1000 + (Number(s.match(/\d+/)?.[0]) || 0); return Number(s.match(/^(\d+)/)?.[1]) || 999; }; return n(a) - n(b) || a.sort - b.sort; });
    ART.views.o_casts = {
        meta: (ctx, it) => { const l = OE.childrenOf(ctx.store, it, 'o_cast', 'sculpture'); return esc(l.length ? `${U.plural(l.length, 'exemplaire')} · ${U.plural(l.filter(c => c.data.location || c.data.holder || c.data.owner).length, 'localisé')}` : ''); },
        actions: (ctx, it) => { const l = OE.childrenOf(ctx.store, it, 'o_cast', 'sculpture'), p = l.filter(c => c.data.posthumous).length;
            return `${l.length ? `<span class="ui-filters oe-castf"><button type="button" class="is-active" data-oe-castf="all">Toutes ${l.length}</button><button type="button" data-oe-castf="0">Du vivant ${l.length - p}</button><button type="button" data-oe-castf="1">Posthumes ${p}</button></span>` : ''}${OE.newChildBtn(it, 'o_cast', 'sculpture', 'Ajouter une fonte')}`; },
        text: (ctx, it) => U.plural(OE.childrenOf(ctx.store, it, 'o_cast', 'sculpture').length, 'fonte'),
        read: (ctx, it) => {
            if (!it.id) return '<p class="muted">Enregistre d’abord la sculpture, puis ajoute ses fontes.</p>';
            const l = castSort(OE.childrenOf(ctx.store, it, 'o_cast', 'sculpture'));
            if (!l.length) return '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🖼️</span><span class="empty-line-text">Aucune fonte notée <small>Chaque fonte est une petite fiche (cachet, numéro, poids, patineur, propriétaires, ventes, photos).</small></span><button type="button" class="button small secondary" data-empty-click="[data-oe-newchild=&quot;o_cast&quot;]">＋ Ajouter une fonte</button></p>';
            const st = ctx.store;
            return `<div class="ar-scroll"><table class="ar-t oe-ctable"><thead><tr><th>N°</th><th>Fondeur</th><th>Fondue</th><th>Procédé</th><th>Patine</th><th>Où / à qui</th><th></th></tr></thead><tbody>${l.map(c => { const d = c.data || {}, x = ART.ctx(st, c);
                const where = [d.owner ? U.personChip(d.owner, '', x) : '', d.holder ? esc(d.holder) : '', d.location ? U.placeChip(d.location) : '', d.location_detail ? esc(d.location_detail) : '', d.inv ? `<small class="ar-g">inv. ${esc(d.inv)}</small>` : ''].filter(Boolean).join(' ');
                return `<tr class="is-click ${d.ours ? 'is-me' : ''}" data-ar-row-open="${c.id}" data-post="${d.posthumous ? 1 : 0}"><td><b>${esc(d.no || c.title)}</b></td><td>${esc(U.refTitle(d.founder) || d.founder?.title || '')}</td><td>${esc(d.date || '')}</td><td>${esc(lab(CAST_PROC, d.process))}</td><td>${esc(d.patina || '')}</td><td>${d.posthumous ? badge('posthume', 'w') + ' ' : ''}${where}</td><td class="d">${d.ours ? '⭐ la nôtre' : '↗'}</td></tr>`; }).join('')}</tbody></table></div><p class="ar-note">Chaque fonte est une petite fiche : cachet et numéro gravés, poids, patineur, propriétaires successifs, ventes et prix, photos de l’exemplaire.</p>`;
        },
    };
    document.addEventListener('click', e => { const b = e.target.closest('[data-oe-castf]'); if (!b) return; const sec = b.closest('.ar-sec'); if (!sec) return;
        sec.querySelectorAll('[data-oe-castf]').forEach(x => x.classList.toggle('is-active', x === b)); sec.querySelectorAll('tr[data-post]').forEach(tr => { tr.hidden = b.dataset.oeCastf !== 'all' && tr.dataset.post !== b.dataset.oeCastf; }); });
    const CAST_PROC = [['', '—'], ['cire', 'cire perdue'], ['sable', 'au sable'], ['galvano', 'galvanoplastie'], ['resine', 'tirage en résine'], ['platre', 'tirage en plâtre'], ['autre', 'autre']];
    OE.make({key: 'o_cast', icon: '🔥', label: 'Fonte, tirage', many: 'Fontes et tirages', fem: true, fam: 'visual', hidden: true, quiet: true, parentField: 'sculpture', titleLabel: 'Nom de l’exemplaire', titlePh: 'Fonte 1/8', dateLabel: 'Fondue',
        eyebrow: it => ['Fonte', it.data?.no, U.refTitle(it.data?.sculpture)].filter(Boolean).join(' · '),
        crumbExtra: (ctx, it) => { const s = U.ref(it.data?.sculpture); return s?.iid ? ` · de la sculpture « <button type="button" class="ar-linkbtn u" data-ar-open="${s.iid}">${esc(s.title)}</button> »` : ''; },
        badges: (ctx, it) => badges([it.data?.posthumous ? badge('posthume', 'w') : '', it.data?.ours ? badge('⭐ la nôtre', 'b') : '']),
        main: [['sculpture', 'Sculpture', 'item', {kinds: ['o_sculpture'], free: false}], ['no', 'N° gravé', 'text', {ph: '1/8, EA I, HC…'}], ['founder', 'Fondeur', 'employer', {icon: '🏭'}], ['process', 'Procédé', 'select', {choices: CAST_PROC}],
            ['patina', 'Patine', 'text', {ph: 'brun nuancé, vert antique…'}], ['patineur', 'Patineur', 'person'], ['mark', 'Cachet et numéro gravés', 'text'], ['weight', 'Poids', 'measure', {unit: 'kg'}],
            ['posthumous', 'Fonte posthume', 'bool', {on: 'posthume'}], ['ours', 'La nôtre', 'bool', {on: '⭐ la nôtre'}], ['authenticated', 'Authentification', 'text', {h: 1, ph: 'comité, 1990'}]],
        photos: [['face', 'Face'], ['cachet', 'Cachet'], ['numero', 'Numéro'], ['socle', 'Socle'], ['autre', 'Autre']],
        groups: [G.side('where', 'Où, à qui', '📍', [['holder', 'Collection', 'text', {ph: 'Musée Labenche, Brive'}], ['owner', 'Propriétaire', 'person', {roleWord: 'propriétaire'}], ['location', 'Lieu', 'place'], ['location_detail', 'Pièce, hall', 'text'], ['inv', 'N° d’inventaire', 'text']]), G.prov(), G.states(), G.value()],
        prizes: false, list: ['photos', 'no', 'founder', 'date', 'process', 'patina', 'owner'], card: ['no', 'date', 'founder'],
        sorts: [['perso', 'Mon ordre'], ['year', 'Par année'], ['az', 'A → Z']]});
    OE.childPreset = OE.childPreset || {};
    OE.childPreset.o_cast = (parent, n) => ({title: `${parent.title} — fonte ${n + 1}`, no: `${n + 1}/${String(parent.data?.edition_plan || '').match(/^\s*(\d+)/)?.[1] || '?'}`, technique: parent.data?.technique || ''});

    /* ═════════ J. 🪧 Affiche · graphisme ═════════ */
    const PROC = [['', '—'], ['litho', 'lithographie'], ['offset', 'offset'], ['serigraphie', 'sérigraphie'], ['typo', 'typographie'], ['bois', 'gravure sur bois'], ['pochoir', 'pochoir'], ['numerique', 'impression numérique'], ['main', 'peinte à la main']];
    const SUBJ = [['', '—'], ['evenement', 'un événement (fête, foire…)'], ['spectacle', 'un spectacle, un film'], ['election', 'une élection'], ['pub', 'une publicité'], ['tourisme', 'le tourisme'], ['propagande', 'propagande, appel'], ['autre', 'autre']];
    OE.make({key: 'o_affiche', icon: '🪧', label: 'Affiche', many: 'Affiches', fem: true, fam: 'design', chain: 'Œuvre → états → exemplaires',
        eyebrow: it => ['Affiche', lab(PROC, it.data?.process)].filter(Boolean).join(' · '),
        heading: (ctx, it) => `<h2 class="ar-h2">${esc(it.title)}${[it.data?.date, lab(PROC, it.data?.process)].filter(Boolean).length ? ` <small>· ${esc([it.data.date, lab(PROC, it.data.process)].filter(Boolean).join(' · '))}</small>` : ''}</h2>`,
        main: [['sponsor', 'Commanditaire', 'employer', {icon: '🏛'}], ['subject', 'Elle annonçait', 'select', {choices: SUBJ}], ['announces', 'Annonce', 'item', {kinds: ['o_son_lumiere', 'o_festival', 'concert', 'exhibition', 'o_representation', 'film']}], ['event_dates', 'Dates annoncées', 'text', {ph: '23-24 juin 1952'}],
            ['election', 'Élection', 'text', {h: 1, ph: 'législatives 1958 · Henri BORIE'}], ['printer', 'Imprimeur', 'employer', {icon: '🏭'}], ['process', 'Procédé', 'select', {choices: PROC}], ['colors', 'Couleurs', 'text', {ph: '4 couleurs'}],
            ['format', 'Format', 'text', {ph: '120 × 160 cm (double grand aigle)'}], ['other_formats', 'Autres formats', 'text', {ph: 'existe aussi en 40 × 60 cm'}], ['print_run', 'Tirage', 'text', {ph: '500 ex. + 50 petit format'}],
            ['posted', 'Affichée', 'text', {ph: 'du 1er au 24 juin 1952'}], ['posted_where', 'Où', 'text', {ph: 'Tulle, Brive, Uzerche'}], ['text', 'Texte', 'longtext', {rows: 2}], ['mentions', 'Mentions', 'text', {ph: '« Imp. Mazeyrie » · timbre fiscal · visa n° 52-118'}],
            ['designer', 'Graphiste, dessinateur', 'people', {rolePh: 'dessin, maquette…'}]],
        photos: [['affiche', 'Affiche'], ['etat', 'État 1'], ['avant', 'Avant la lettre'], ['maquette', 'Maquette'], ['mur', 'Au mur'], ['autre', 'Autre']],
        groups: [G.rows('states', 'États', [['state', 'État', 'text', {w: 'm', ph: 'état 1, avant la lettre, maquette'}], ['date', 'Date', 'text', {w: 's'}], ['note', 'Différences', 'text', {w: 'l'}]], {add: 'Un état', h: 1}),
            G.rows('copies', 'Exemplaires connus', [['where', 'Où (archives, musée, chez nous…)', 'text', {w: 'l'}], ['cote', 'Cote', 'text', {w: 's', ph: '6 Fi 1952/4'}], ['state', 'État', 'text', {w: 's', ph: 'plié, bon état'}], ['ours', 'Le nôtre', 'bool', {w: 's'}]], {add: 'Un exemplaire', zone: 'right', icon: '📍', view: 'o_copies'}),
            G.side('elec', 'Aussi pour les élections', '🗳', [['_elec', 'Élection', 'computed', {view: 'o_elec'}]]), G.expos(), G.biblio()],
        list: ['photos', 'title', 'date', 'printer', 'process', 'format', 'print_run'], card: ['date', 'printer'], export: ['photos', 'title', 'date', 'sponsor', 'printer', 'process', 'format', 'print_run', 'posted', 'mentions', 'copies']});
    ART.views.o_copies = {read: (ctx, it, f, v) => (v || []).map(r => `<div>${r.ours ? '<b>Le nôtre :</b> ' : ''}${esc(r.where || '')}${r.cote ? ` <small class="ar-g">cote ${esc(r.cote)}</small>` : ''}${r.state ? ` <small class="ar-g">· ${esc(r.state)}</small>` : ''}</div>`).join('')};
    ART.views.o_elec = {read: (ctx, it) => it.data?.election ? `<p style="margin:0">Affiche de campagne · ${esc(it.data.election)}</p>` : '', text: (ctx, it) => it.data?.election || ''};

    /* ═════════ K. 🎻 Concerto (et toute la musique savante : OE.savante) ═════════ */
    const CATSYS = [['op', 'op.'], ['bwv', 'BWV'], ['k', 'K.'], ['d', 'D.'], ['hob', 'Hob.'], ['rv', 'RV'], ['s', 'S.'], ['l', 'L.'], ['hwv', 'HWV'], ['woo', 'WoO'], ['autre', 'autre']];
    const IKIND = [['creation', 'Création'], ['studio', 'Studio'], ['concert', 'Concert'], ['radio', 'Radio'], ['tv', 'Télévision'], ['autre', 'Autre']];
    const ROMAN = n => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][n] || String(n);
    const catno = d => d?.catno ? `${lab(CATSYS, d.catsys || 'op') === 'autre' ? '' : lab(CATSYS, d.catsys || 'op')} ${d.catno}`.trim() : '';
    /** une œuvre de musique savante : forme, n° de catalogue, tonalité, effectif, mouvements, création, interprétations… */
    OE.savante = (spec) => OE.make({fam: 'music', fem: false, chain: 'Œuvre → mouvements → interprétations → enregistrements → parutions', ...spec,
        eyebrow: it => ['Musique savante', spec.label, catno(it.data)].filter(Boolean).join(' · '),
        heading: (ctx, it) => `<h2 class="ar-h2">${esc(it.title)}${catno(it.data) ? ` <small>· ${esc(catno(it.data))}</small>` : ''}</h2>`,
        dateLabel: 'Composé', dateShown: true, mainLabel: 'L’œuvre',
        main: [['composer', 'Compositeur', 'person', {roleWord: 'compositeur'}], ['catsys', 'Catalogue', 'select', {choices: CATSYS, short: 'Système', join: {key: 'catno', sep: ' '}}], ['catno', 'N°', 'text', {ph: '12'}], ['thematic', 'Catalogue thématique', 'text', {ph: 'JM 34', h: 1}],
            ['form', 'Forme', 'text', {ph: spec.formPh || 'concerto'}], ['tonality', 'Tonalité', 'text', {ph: 'ré mineur'}], ['nmov', 'Mouvements', 'o_inline', {view: 'o_nmov'}], ['duration', 'Durée', 'duration', {ph: '≈ 24 min'}],
            ['scoring', 'Effectif', 'text', {ph: spec.scoringPh || 'accordéon solo · 2.2.2.2 – 2.2.0.0 – timbales – cordes'}], ['composed_place', 'Lieu de composition', 'place'],
            ['dedicatee', 'Dédicataire', 'person', {roleWord: 'dédicataire', join: {key: 'dedication'}}], ['dedication', 'Dédicace', 'text', {ph: 'à mon frère'}], ['commission', 'Commande', 'text', {ph: 'Radio-Limoges (ORTF) · lettre du 3 fév. 1961'}],
            ...(spec.extra || []),
            ['publisher', 'Édition', 'text', {ph: 'Éd. Choudens, 1964'}], ['cotage', 'Cotage', 'text', {ph: 'A.C. 21.034', h: 1}]],
        photos: [['manuscrit', 'Manuscrit'], ['page', 'Page'], ['edition', 'Édition'], ['programme', 'Programme'], ['autre', 'Autre']], photosLabel: 'Partition, manuscrit',
        groups: [
            G.sec('premiere', 'Création', [['prem_date', 'Date', 'date'], ['prem_place', 'Lieu', 'place'], ['prem_venue', 'Salle', 'text', {ph: 'Grand-Théâtre'}], ['prem_soloists', 'Solistes', 'o_ppl', {rolePh: 'accordéon, soprano…'}], ['prem_ensemble', 'Orchestre, ensemble', 'text'], ['prem_conductor', 'Direction', 'person', {roleWord: 'chef'}]]),
            {key: 'movements', label: 'Mouvements', zone: 'main', fields: [{key: 'movements', label: spec.movLabel || 'Mouvements', secLabel: `🎼 ${spec.movLabel || 'Mouvements'}`, type: 'rows', view: 'o_movements', star: true, section: true, addLabel: spec.movAdd || 'Un mouvement',
                cols: [{key: 'no', label: 'N°', w: 's', ph: 'I'}, {key: 'title', label: 'Titre, tempo', w: 'm', ph: 'Allegro moderato'}, {key: 'sub', label: 'Sous-titre', w: 'm', ph: '« La Montagne »'}, {key: 'key', label: 'Tonalité · mesure', w: 's', ph: 'ré mineur · 4/4'}, {key: 'dur', label: 'Durée', w: 's', ph: '9:40'}, {key: 'rec', label: 'Enregistrement', type: 'item', kinds: ['recording'], w: 'm'}]}]},
            {key: 'interp', label: 'Interprétations', icon: '🎤', zone: 'right', fields: [{key: 'interpretations', label: 'Interprétations', type: 'rows', view: 'o_interp', star: true, bare: true, addLabel: 'Une interprétation',
                cols: [{key: 'kind', label: 'Sorte', type: 'select', choices: IKIND, w: 's'}, {key: 'date', label: 'Date', w: 's'}, {key: 'place', label: 'Lieu', type: 'place', w: 'm'}, {key: 'soloist', label: 'Soliste', type: 'person', w: 'm'}, {key: 'ensemble', label: 'Orchestre', w: 'm'}, {key: 'conductor', label: 'Direction', type: 'person', w: 'm'}, {key: 'rec', label: 'Enregistrement', type: 'item', kinds: ['recording'], w: 'm'}, {key: 'release', label: 'Parution', type: 'item', kinds: ['release', 'master'], w: 'm'}, {key: 'n', label: 'Dates', w: 's', ph: '2 dates'}]}]},
            G.side('ms', 'Manuscrit', '📍', [['ms_where', 'Où', 'text', {ph: 'BnF, Musique'}], ['ms_cote', 'Cote', 'text', {ph: 'Ms. 21 344'}], ['ms_scan', 'Scan', 'document']]),
            ...(spec.groups || []), G.biblio()],
        list: ['title', 'catno', 'date', 'tonality', 'duration', 'composer'], card: ['date', 'catno', 'tonality'], export: ['title', 'composer', 'catsys', 'catno', 'form', 'tonality', 'scoring', 'date', 'dedicatee', 'commission', 'prem_date', 'movements', 'interpretations', 'publisher']});
    ART.views.o_nmov = {read: (ctx, it) => { const n = ART.arr(it.data?.movements).length; return n ? esc(U.plural(n, 'mouvement')) : ''; }, text: (ctx, it) => { const n = ART.arr(it.data?.movements).length; return n ? U.plural(n, 'mouvement') : ''; }};
    ART.views.o_movements = {read: (ctx, it, f, v) => (v || []).map((r, i) => `<div class="oe-mvt"><span class="oe-rn">${esc(r.no || `${ROMAN(i + 1)}.`)}</span><span><b>${esc(r.title || '')}</b>${r.sub ? ` <small class="ar-g">${esc(r.sub)}</small>` : ''}</span><span>${esc(r.key || '')}</span><span class="oe-dur">${esc(r.dur || '')}</span><span>${r.rec ? U.refChip(r.rec, '▶') : ''}</span></div>`).join('') + (() => { const s = (v || []).reduce((a, r) => a + U.secs(r.dur), 0); return s ? `<p class="ar-note">${esc(U.plural((v || []).length, 'mouvement'))} · ${esc(U.hms(s))}</p>` : ''; })()};
    ART.views.o_interp = {read: (ctx, it, f, v) => `${(v || []).map(r => `<div class="ar-reccard oe-icard"><div class="ar-rhd"><span class="oe-kind k-${esc(r.kind || 'autre')}">${esc(lab(IKIND, r.kind || 'autre').toLocaleUpperCase('fr-FR'))}</span><b>${esc([r.date, U.placeTitle(r.place)].filter(Boolean).join(' · '))}</b></div>
        <small class="ar-g">${[r.soloist ? `soliste ${U.person(r.soloist)?.pid ? U.personChip(r.soloist, '', ctx) : esc(U.nameOf(r.soloist))}` : '', esc(r.ensemble || ''), r.conductor ? `dir. ${esc(U.nameOf(r.conductor))}` : '', esc(r.n || '')].filter(Boolean).join(' · ')}</small>
        ${r.rec || r.release ? `<div>${r.rec ? U.refChip(r.rec, '🎙') : ''}${r.rec && r.release ? ' → ' : ''}${r.release ? U.refChip(r.release, '💿') : ''}</div>` : ''}</div>`).join('')}<p class="ar-note">Interprétation → enregistrement → parution : la même chaîne que le morceau.</p>`};
    OE.savante({key: 'o_concerto', icon: '🎻', label: 'Concerto', many: 'Concertos', formPh: 'concerto', newData: () => ({catsys: 'op', form: 'concerto'})});

    /* ═════════ K. 🎭 Pièce de théâtre → mises en scène → représentations → tournées ═════════ */
    const REP = () => OE.kindOf('o_representation'), TOUR = () => OE.kindOf('o_tournee');
    const repsOf = (st, mes) => OE.childrenOf(st, mes, REP(), 'staging');
    const MESK = [['creation', 'Création'], ['reprise', 'Reprise'], ['adaptation', 'Adaptation'], ['lecture', 'Lecture'], ['captation', 'Captation'], ['autre', 'Autre']];
    OE.make({key: 'o_piece', icon: '🎭', label: 'Pièce de théâtre', many: 'Pièces de théâtre', fem: true, fam: 'stage', chain: 'Pièce → mises en scène → représentations → tournées', dateLabel: 'Écrite',
        eyebrow: it => ['Pièce de théâtre', it.data?.genre].filter(Boolean).join(' · '),
        main: [['author', 'Auteur', 'person', {roleWord: 'auteur'}], ['coauthors', 'Coauteurs, adaptateurs', 'people', {h: 1, rolePh: 'adaptation, d’après…'}], ['genre', 'Genre', 'text', {ph: 'comédie dramatique'}], ['acts', 'Actes', 'number'],
            ['ncharacters', 'Personnages', 'o_inline', {view: 'o_nchar'}], ['language', 'Langue', 'text', {h: 1, ph: 'français, occitan…'}], ['published', 'Publiée', 'item', {kinds: ['book']}], ['adapted', 'Adaptée', 'items', {kinds: ['film', 'o_emission_radio', 'o_feuilleton', 'o_emission_tv']}],
            ['rights', 'Droits (SACD…)', 'text', {h: 1}], ['manuscript', 'Manuscrit, tapuscrit', 'document', {h: 1}]],
        photos: [['affiche', 'Affiche'], ['scene', 'Photo de scène'], ['manuscrit', 'Manuscrit'], ['programme', 'Programme'], ['autre', 'Autre']],
        groups: [G.rows('characters', 'Personnages', [['name', 'Personnage', 'text', {w: 'm', ph: 'Mélanie, la grand-mère'}], ['sex', 'F / H', 'select', {choices: [['', '—'], ['f', 'F'], ['h', 'H'], ['x', 'autre']], w: 's'}], ['desc', 'Qui est-ce', 'text', {w: 'l'}]], {add: 'Un personnage', h: 1}),
            {key: 'stagings', label: 'Mises en scène', zone: 'main', fields: [{key: '_stagings', label: 'Mises en scène', secLabel: '🎭 Mises en scène, représentations, tournées', type: 'computed', view: 'o_stagings', star: true}]},
            G.biblio()],
        list: ['photos', 'title', 'date', 'author', 'genre', 'acts', '_nmes'], card: ['date', 'genre'], listExtra: [{key: '_nmes', label: 'Mises en scène', type: 'computed', view: 'o_nmes'}]});
    ART.views.o_nchar = {read: (ctx, it) => { const l = it.data?.characters || []; if (!l.length) return ''; const f = l.filter(c => c.sex === 'f').length, h = l.filter(c => c.sex === 'h').length; return esc(`${l.length}${f || h ? ` (${[f && `${f} F`, h && `${h} H`].filter(Boolean).join(', ')})` : ''}`); }, text: (ctx, it) => String(ART.arr(it.data?.characters).length || '')};
    ART.views.o_nmes = {read: (ctx, it) => String(OE.childrenOf(ctx.store, it, 'o_mes', 'play').length || ''), text: (ctx, it) => String(OE.childrenOf(ctx.store, it, 'o_mes', 'play').length || '')};
    OE.childPreset.o_mes = (p, n) => ({title: `${p.title} — ${n ? `mise en scène ${n + 1}` : 'création'}`, mkind: n ? 'reprise' : 'creation'});
    OE.childPreset[REP()] = OE.childPreset.o_representation = p => ({title: U.refTitle(p.data?.play) || p.title});
    OE.childPreset[TOUR()] = OE.childPreset.o_tournee = (p, n) => ({title: `${U.refTitle(p.data?.play) || p.title} — tournée ${n + 1}`});
    const MODE = {};
    const calHtml = (dates, y, m) => { const first = new Date(y, m, 1), off = (first.getDay() + 6) % 7, n = new Date(y, m + 1, 0).getDate(), on = new Set(dates.filter(d => d.y === y && d.m === m).map(d => d.d));
        return `<div class="oe-cal">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => `<span class="h">${x}</span>`).join('')}${'<span></span>'.repeat(off)}${Array.from({length: n}, (_, i) => `<span class="${on.has(i + 1) ? 'on' : ''}">${i + 1}</span>`).join('')}</div><small class="ar-g">${esc(MONTHS[m])} ${y}</small>`; };
    const repTable = (st, reps, withMes = false) => `<div class="ar-scroll"><table class="ar-t oe-ctable"><thead><tr><th>Date</th>${withMes ? '<th>Mise en scène</th>' : ''}<th>Lieu</th><th>Salle</th><th>Spect.</th><th>Note</th></tr></thead><tbody>${reps.map(r => { const d = r.data || {};
        return `<tr class="is-click" data-ar-row-open="${r.id}"><td>${esc(d.date || r.year || '')}</td>${withMes ? `<td>${esc(U.refTitle(d.staging))}</td>` : ''}<td>${d.place ? `📍 ${esc(U.placeTitle(d.place))}` : ''}</td><td>${esc(d.venue || '')}</td><td>${esc(d.spectators || '')}</td><td>${d.tag ? badge(lab(REPTAG, d.tag), 'b') : ''} ${esc(d.note || '')}</td></tr>`; }).join('')}</tbody></table></div>`;
    function stagingsHtml(st, it, mode) {
        const mes = OE.childrenOf(st, it, 'o_mes', 'play').sort((a, b) => (Number(a.year) || 9999) - (Number(b.year) || 9999));
        if (!it.id) return '<p class="muted">Enregistre d’abord la pièce, puis ajoute ses mises en scène.</p>';
        if (!mes.length) return '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📅</span><span class="empty-line-text">Aucune mise en scène <small>La création, puis les reprises. Chacune a sa distribution, ses représentations et ses tournées.</small></span><button type="button" class="button small secondary" data-empty-click="[data-oe-newchild=&quot;o_mes&quot;]">＋ Ajouter une mise en scène</button></p>';
        const allReps = mes.flatMap(m => repsOf(st, m)).sort((a, b) => dkey(a) - dkey(b));
        if (mode === 'table') return allReps.length ? repTable(st, allReps, true) : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📅</span><span class="empty-line-text">Aucune représentation notée.</span></p>';
        if (mode === 'cal') { const ds = allReps.map(r => frDate(r.data?.date || '')).filter(Boolean); const months = [...new Set(ds.map(d => d.y * 12 + d.m))].sort((a, b) => a - b).slice(0, 24);
            return months.length ? `<div class="oe-cals">${months.map(k => `<div>${calHtml(ds, Math.floor(k / 12), k % 12)}</div>`).join('')}</div>${months.length === 24 ? '<p class="ar-note">Les 24 premiers mois.</p>' : ''}` : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📅</span><span class="empty-line-text">Aucune représentation avec une date complète (« 12 mai 1951 »).</span></p>'; }
        if (mode === 'map') return `<div data-oe-map>${allReps.some(r => U.place(r.data?.place)?.plid) ? '<p class="muted">Carte en préparation…</p>' : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📍</span><span class="empty-line-text">Aucune représentation avec un lieu de ta base.</span></p>'}</div>`;
        return mes.map((m, i) => { const d = m.data || {}, x = ART.ctx(st, m), reps = repsOf(st, m).sort((a, b) => dkey(a) - dkey(b)), tours = OE.childrenOf(st, m, TOUR(), 'staging');
            const cast = (d.cast || []), first = frDate(reps[0]?.data?.date || '');
            return `<div class="oe-lvl l2"><span class="oe-lt">Mise en scène ${i + 1} · ${esc(lab(MESK, d.mkind || 'creation').toLowerCase())}</span>
                <div class="oe-hd"><span class="oe-kind k-mes">${esc(lab(MESK, d.mkind || 'creation').toLocaleUpperCase('fr-FR'))}</span><button type="button" class="ar-linkbtn" data-ar-open="${m.id}"><b>${esc([d.company?.title || d.company?.txt || '', d.date || m.year].filter(Boolean).join(' · ') || m.title)}</b></button>
                <small class="ar-g">${[d.director ? `mise en scène ${U.personChip(d.director, '', x)}` : '', ...ART.normPeople(d.team).slice(0, 3).map(p => `${esc(p.role || '')} ${esc(p.title || p.txt)}`), (d.music || []).map(r => U.refChip(r, '🎵')).join('')].filter(Boolean).join(' · ')}</small></div>
                ${cast.length ? `<div class="ar-scroll"><table class="ar-t"><thead><tr><th>Personnage</th><th>Interprète</th><th>Remplaçant(e)</th></tr></thead><tbody>${cast.slice(0, 3).map(r => `<tr><td>${esc(r.role || '')}</td><td>${r.actor ? U.personChip(r.actor, '', x) : ''}</td><td>${r.under ? U.personChip(r.under, '', x) : '—'}${r.under_n ? ` <small class="ar-g">(${esc(r.under_n)})</small>` : ''}</td></tr>`).join('')}${cast.length > 3 ? `<tr><td colspan="3"><button type="button" class="ar-linkbtn" data-ar-open="${m.id}">▸ voir toute la distribution (${cast.length})</button></td></tr>` : ''}</tbody></table></div>` : ''}
                <div class="oe-lvl l3"><span class="oe-lt">Représentations · ${reps.length}</span>${reps.length ? `<div class="oe-repgrid">${repTable(st, reps.slice(0, 6))}<div>${first ? calHtml(reps.map(r => frDate(r.data?.date || '')).filter(Boolean), first.y, first.m) : ''}</div></div>${reps.length > 6 ? `<button type="button" class="ar-linkbtn" data-oe-mode="table">▸ les ${reps.length} représentations (Tableau)</button>` : ''}` : ''}
                    <div class="ar-row">${OE.newChildBtn({id: m.id}, REP(), 'staging', 'Ajouter une représentation').replace('data-oe-newchild', `data-oe-parent="${m.id}" data-oe-newchild`)}</div></div>
                <div class="oe-lvl l4"><span class="oe-lt">Tournées</span>${tours.map(t => { const tr = repsOf(st, m).filter(r => U.ref(r.data?.tour)?.iid === t.id), sp = tr.reduce((a, r) => a + (U.num(r.data?.spectators) || 0), 0), towns = new Set(tr.map(r => U.placeTitle(r.data?.place)).filter(Boolean)).size;
                    return `<div><span class="oe-kind k-tour">TOURNÉE</span> <button type="button" class="ar-linkbtn" data-ar-open="${t.id}"><b>${esc(t.title)}</b></button> <small class="ar-g">· ${esc([tr.length && U.plural(tr.length, 'date'), towns && U.plural(towns, 'ville'), sp && `${sp.toLocaleString('fr-FR')} spectateurs`, t.data?.date].filter(Boolean).join(' · '))}</small></div>`; }).join('')}
                    <div class="ar-row">${OE.newChildBtn({id: m.id}, TOUR(), 'staging', 'Ajouter une tournée').replace('data-oe-newchild', `data-oe-parent="${m.id}" data-oe-newchild`)}</div></div></div>`; }).join('');
    }
    ART.views.o_stagings = {
        meta: (ctx, it) => { const m = OE.childrenOf(ctx.store, it, 'o_mes', 'play'), r = m.reduce((a, x) => a + repsOf(ctx.store, x).length, 0); return esc([m.length && U.plural(m.length, 'mise en scène', 'mises en scène'), r && U.plural(r, 'représentation')].filter(Boolean).join(' · ')); },
        actions: (ctx, it) => `<span class="segmented oe-seg">${[['tree', 'Arbre'], ['table', 'Tableau'], ['cal', 'Calendrier'], ['map', 'Carte']].map(([k, l]) => `<button type="button" class="${(MODE[it.id] || 'tree') === k ? 'is-active' : ''}" data-oe-mode="${k}">${l}</button>`).join('')}</span>${OE.newChildBtn(it, 'o_mes', 'play', 'Ajouter une mise en scène')}`,
        text: (ctx, it) => U.plural(OE.childrenOf(ctx.store, it, 'o_mes', 'play').length, 'mise en scène', 'mises en scène'),
        read: (ctx, it) => `<div data-oe-stagings="${it.id || 0}">${stagingsHtml(ctx.store, it, MODE[it.id] || 'tree')}</div>`,
    };
    /** la carte des représentations (fond de carte de l'app ; coordonnées des lieux par le menu de choix) */
    async function drawMap(C, box, it) {
        const st = C.store, reps = OE.childrenOf(st, it, 'o_mes', 'play').flatMap(m => repsOf(st, m)), byPl = new Map();
        reps.forEach(r => { const p = U.place(r.data?.place); if (p?.plid) byPl.set(p.plid, (byPl.get(p.plid) || 0) + 1); });
        if (!byPl.size || !X().miniMap) return;
        try { const r = await A().api('picker_search', {kind: 'place', ids: [...byPl.keys()].join(','), limit: 200}); const items = (r.groups || []).flatMap(g => g.items || []);
            const pts = items.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon)).map(p => ({lat: p.lat, lon: p.lon, label: `${p.title} · ${U.plural(byPl.get(Number(p.id)) || 0, 'date')}`, n: byPl.get(Number(p.id)) || 1}));
            if (box.isConnected) box.innerHTML = X().miniMap(pts, [], {height: 320, emptyText: 'Ces lieux n’ont pas de coordonnées.'}); }
        catch (e) { if (box.isConnected) box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
    }
    document.addEventListener('click', e => {
        const b = e.target.closest('[data-oe-mode]'); if (!b) return; const C = b.closest('.ar-dlg')?._C, box = b.closest('.ar-sec')?.querySelector('[data-oe-stagings]'); if (!C || !box) return;
        e.preventDefault(); const it = C.current(); if (!it?.id) return; MODE[it.id] = b.dataset.oeMode;
        b.closest('.ar-sec').querySelectorAll('.oe-seg [data-oe-mode]').forEach(x => x.classList.toggle('is-active', x.dataset.oeMode === MODE[it.id]));
        box.innerHTML = stagingsHtml(C.store, it, MODE[it.id]); if (MODE[it.id] === 'map') { const m = box.querySelector('[data-oe-map]'); if (m) drawMap(C, m, it); }
    });
    OE.make({key: 'o_mes', icon: '🎭', label: 'Mise en scène', many: 'Mises en scène', fem: true, fam: 'stage', hidden: true, quiet: true, parentField: 'play', dateLabel: 'Année', chain: 'Mise en scène → représentations → tournées',
        eyebrow: it => ['Mise en scène', lab(MESK, it.data?.mkind || 'creation'), U.refTitle(it.data?.play)].filter(Boolean).join(' · '),
        crumbExtra: (ctx, it) => { const s = U.ref(it.data?.play); return s?.iid ? ` · de la pièce « <button type="button" class="ar-linkbtn u" data-ar-open="${s.iid}">${esc(s.title)}</button> »` : ''; },
        main: [['play', 'Pièce', 'item', {kinds: ['o_piece', 'o_opera', 'o_ballet', 'o_comedie_musicale']}], ['mkind', 'Sorte', 'select', {choices: MESK}], ['company', 'Compagnie, théâtre', 'employer', {icon: '🎭'}], ['place', 'Ville', 'place'], ['venue', 'Salle', 'text'],
            ['director', 'Mise en scène', 'person', {roleWord: 'metteur en scène'}], ['team', 'Équipe', 'people', {rolePh: 'décors, costumes, lumières, musique…', addLabel: 'Une personne'}], ['music', 'Musique', 'items', {kinds: ['track_work', 'o_musscene']}],
            ['capture', 'Captation', 'text', {ph: 'captation FR3, 1979', h: 1}], ['program', 'Programme', 'document', {h: 1}]],
        photos: [['scene', 'Photo de scène'], ['affiche', 'Affiche'], ['programme', 'Programme'], ['maquette', 'Maquette du décor'], ['autre', 'Autre']],
        groups: [{key: 'cast', label: 'Distribution', zone: 'main', fields: [{key: 'cast', label: 'Distribution', type: 'rows', star: true, section: true, addLabel: 'Un rôle', cols: [{key: 'role', label: 'Personnage', w: 'm'}, {key: 'actor', label: 'Interprète', type: 'person', w: 'm'}, {key: 'under', label: 'Remplaçant(e)', type: 'person', w: 'm'}, {key: 'under_n', label: 'Dates du remplaçant', w: 's', ph: '12 dates'}]}]},
            {key: 'reps', label: 'Représentations', zone: 'main', fields: [{key: '_reps', label: 'Représentations', type: 'computed', view: 'o_children', child: 'o_representation', childField: 'staging', unit: 'représentation', add: 'Ajouter une représentation', star: true,
                cols: [['date', 'Date'], ['place', 'Lieu', x => x.data?.place ? `📍 ${esc(U.placeTitle(x.data.place))}` : ''], ['venue', 'Salle', x => esc(x.data?.venue || '')], ['spectators', 'Spect.', x => esc(x.data?.spectators || '')], ['tag', 'Note', x => x.data?.tag ? badge(lab(REPTAG, x.data.tag), 'b') : esc(x.data?.note || '')]]}]},
            {key: 'tours', label: 'Tournées', zone: 'main', fields: [{key: '_tours', label: 'Tournées', type: 'computed', view: 'o_children', child: 'o_tournee', childField: 'staging', unit: 'tournée', add: 'Ajouter une tournée', star: true, cols: [['title', 'Tournée'], ['date', 'Période']]}]}],
        prizes: false, list: ['date', 'title', 'mkind', 'director', 'company', 'place'], card: ['date', 'mkind']});
    const REPTAG = [['', '—'], ['premiere', 'première'], ['derniere', 'dernière'], ['gala', 'gala'], ['scolaire', 'scolaire'], ['pleinair', 'plein air'], ['captee', 'captée'], ['annulee', 'annulée']];
    OE.REPTAG = REPTAG;
    // la représentation : seulement si le domaine « scène » n'a pas déjà la sienne (fiche avec setlist)
    if (!ART.defs.performance && !ART.defs.show && !ART.defs.representation) OE.make({key: 'o_representation', icon: '🎟', label: 'Représentation', many: 'Représentations', fem: true, fam: 'stage', quiet: true, parentField: 'staging', titlePh: 'La Veillée, Tulle', dateShown: true,
        eyebrow: it => ['Représentation', U.refTitle(it.data?.staging)].filter(Boolean).join(' · '),
        crumbExtra: (ctx, it) => { const s = U.ref(it.data?.staging); return s?.iid ? ` · de la mise en scène « <button type="button" class="ar-linkbtn u" data-ar-open="${s.iid}">${esc(s.title)}</button> »` : ''; },
        main: [['staging', 'Mise en scène, spectacle', 'item', {kinds: ['o_mes', 'o_opera_prod', 'o_ballet', 'o_comedie_musicale', 'o_seul_en_scene', 'o_cirque', 'o_marionnettes', 'o_cabaret', 'o_magie', 'o_conte', 'o_lecture', 'o_rue']}], ['tour', 'Tournée', 'item', {kinds: ['o_tournee']}], ['place', 'Ville', 'place'], ['venue', 'Salle', 'text', {ph: 'Théâtre municipal'}],
            ['spectators', 'Spectateurs', 'number'], ['tag', 'Note', 'select', {choices: REPTAG}], ['note', 'Précision', 'text', {ph: 'joué en plein air'}], ['night_cast', 'Distribution du soir', 'people', {h: 1, rolePh: 'rôle'}], ['takings', 'Recette', 'money', {h: 1}]],
        groups: [G.side('setlist', 'Setlist', '📋', [['_sl', 'Setlist', 'computed', {view: 'o_setlist_hint'}]])], prizes: false,
        list: ['date', 'title', 'place', 'venue', 'spectators', 'tag'], card: ['date', 'place'], sorts: [['year', 'Par date'], ['recent', 'Les plus récentes'], ['az', 'A → Z']]});
    ART.views.o_setlist_hint = {read: () => '<p class="ar-note" style="margin:0">La setlist du soir (titres, rappels, invités) se note dans la fiche « Concert, représentation » quand elle est là.</p>', text: () => ''};
    if (!ART.defs.tour) OE.make({key: 'o_tournee', icon: '🚌', label: 'Tournée', many: 'Tournées', fem: true, fam: 'stage', quiet: true, parentField: 'staging', dateLabel: 'Période',
        main: [['staging', 'Mise en scène, spectacle', 'item', {kinds: ['o_mes', 'o_seul_en_scene', 'o_cirque', 'o_cabaret']}], ['organizer', 'Organisée par', 'employer'], ['region', 'Régions', 'text', {ph: 'Limousin, Auvergne'}], ['_stats', 'En chiffres', 'o_inline', {view: 'o_tourstats'}]],
        groups: [{key: 'dates', label: 'Dates', zone: 'main', fields: [{key: '_dates', label: 'Dates', type: 'computed', view: 'o_tourdates', star: true}]}], prizes: false,
        list: ['date', 'title', 'staging', '_stats'], card: ['date']});
    const tourReps = (st, t) => st.items.filter(r => r.kind === REP() && U.ref(r.data?.tour)?.iid === t.id).sort((a, b) => dkey(a) - dkey(b));
    ART.views.o_tourstats = {read: (ctx, it) => { const l = tourReps(ctx.store, it), sp = l.reduce((a, r) => a + (U.num(r.data?.spectators) || 0), 0), towns = new Set(l.map(r => U.placeTitle(r.data?.place)).filter(Boolean)).size; return esc([l.length && U.plural(l.length, 'date'), towns && U.plural(towns, 'ville'), sp && `${sp.toLocaleString('fr-FR')} spectateurs`].filter(Boolean).join(' · ')); }, text: (ctx, it) => U.plural(tourReps(ctx.store, it).length, 'date')};
    ART.views.o_tourdates = {read: (ctx, it) => { const l = tourReps(ctx.store, it); return l.length ? repTable(ctx.store, l) : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📅</span><span class="empty-line-text">Aucune date : sur chaque représentation, choisis cette tournée.</span></p>'; }, text: (ctx, it) => U.plural(tourReps(ctx.store, it).length, 'date')};

    /* ═════════ T. ⚒️ Les pièces de métiers d'art (modèle commun) et la ferronnerie ═════════ */
    const PROT = [['', '—'], ['inscrit', 'Inscrite aux Monuments historiques'], ['classe', 'Classée Monument historique'], ['inventaire', 'Inventaire général'], ['label', 'Label (Patrimoine du XXe s.…)'], ['aucune', 'Aucune']];
    const SITU = [['', '—'], ['place', 'en place'], ['deposee', 'déposée'], ['reserve', 'en réserve'], ['musee', 'au musée'], ['vendue', 'vendue'], ['disparue', 'disparue'], ['detruite', 'détruite']];
    const COND = [['', '—'], ['bon', 'bon'], ['moyen', 'moyen'], ['restaurer', 'à restaurer'], ['restaure', 'restauré'], ['fragile', 'fragile']];
    OE.CRAFT = {PROT, SITU, COND};
    /** une pièce de métier d'art : métier, atelier, compagnons, techniques, poinçon, commande, protection, restaurations */
    OE.craft = spec => OE.make({fam: 'design', fem: true, object: false, ...spec,
        eyebrow: spec.eyebrow || (it => [spec.label, lab(spec.kinds || [], it.data?.piece_kind), it.data?.protection && ['inscrit', 'classe'].includes(it.data.protection) ? 'MH' : ''].filter(Boolean).join(' · ')),
        heading: (ctx, it) => { const sub = [it.data?.date, String(it.data?.[spec.matKey || 'material'] || '').split(',')[0].trim()].filter(Boolean); return `<h2 class="ar-h2">${esc(it.title)}${sub.length ? ` <small>· ${esc(sub.join(' · '))}</small>` : ''}</h2>`; },
        badges: (ctx, it) => { const d = it.data || {}; return badges([['inscrit', 'classe'].includes(d.protection) ? badge(`${d.protection === 'classe' ? 'Classée' : 'Inscrite'} MH${d.prot_date && U.yearOf(d.prot_date) ? ` ${U.yearOf(d.prot_date)}` : ''}`, 'b') : '', d.situation ? badge(lab(SITU, d.situation), d.situation === 'place' ? 'ok' : 'w') : '', d.condition ? badge(`État : ${lab(COND, d.condition)}`) : '']); },
        main: [...(spec.kinds ? [['piece_kind', 'Sorte de pièce', 'select', {choices: [['', '—'], ...spec.kinds]}]] : []),
            ['metier', 'Métier', 'text', {ph: spec.metierPh || 'Ferronnier d’art', h: !spec.showMetier}], ['metier_domain', 'Domaine des métiers d’art', 'text', {h: 1}],
            ['sponsor', 'Commanditaire', 'employer', {icon: '🏛', join: {key: 'sponsor_note'}}], ['sponsor_note', 'Décision, commande', 'text', {ph: 'délibération du 3 mars 1927'}], ['sponsor_people', 'Pour le commanditaire', 'o_ppl', {rolePh: 'maire, curé, client…', h: !spec.sponsorPeople}],
            ['installed', 'Installée', 'place'], ['installed_detail', 'Où exactement', 'text', {ph: 'cour d’honneur'}], ['installed_date', 'Le', 'text', {ph: '14 juillet 1928'}],
            ['makers', 'Concepteur', 'o_ppl', {rolePh: 'dessin et forge…', addLabel: 'Une personne'}], ['atelier', 'Atelier', 'employer', {icon: '🏭'}], [spec.matKey || 'material', spec.matLabel || 'Matériaux', 'text', {ph: spec.matPh || ''}],
            ['techniques', 'Techniques', 'list', {choices: spec.techniques || [], wide: true}], ['dims', 'Dimensions', 'dims', {unit: spec.unit || 'cm'}], ['weight', 'Poids', 'measure', {unit: spec.weightUnit || 'kg'}], ['parts', 'Composition', 'text', {ph: spec.partsPh || ''}],
            ['decor', 'Décor', 'text', {ph: spec.decorPh || ''}], ['mark', 'Poinçon / marque', 'text', {ph: spec.markPh || '« P.M. » dans un losange, au revers'}],
            ...(spec.extra || []),
            ['situation', 'Situation', 'select', {choices: SITU, head: true}], ['condition', 'État', 'select', {choices: COND, head: true}]],
        photos: spec.photos || [['vue', 'Vue d’ensemble'], ['dessin', 'Dessin'], ['detail', 'Détail'], ['poincon', 'Poinçon'], ['ancienne', 'Photo ancienne'], ['autre', 'Autre']],
        groups: [
            G.rows('drawings', 'Dessins préparatoires', [['what', 'Dessin, gabarit, devis', 'text', {w: 'l', ph: 'Élévation 1/10 · lavis · 1927'}], ['date', 'Date', 'text', {w: 's'}], ['where', 'Où, cote', 'text', {w: 'm'}]], {add: 'Un dessin', zone: 'left', icon: '✏️', view: 'o_drawings'}),
            {key: 'workshop', label: 'Atelier et compagnons', zone: 'main', fields: [{key: 'crew', label: 'Atelier et compagnons', secLabel: '👥 Atelier et compagnons', type: 'rows', star: true, section: true, addLabel: 'Une personne',
                cols: [{key: 'who', label: 'Personne', type: 'person', w: 'm'}, {key: 'role', label: 'Rôle', w: 's', ph: 'maître, compagnon, apprenti'}, {key: 'work', label: 'Travail', w: 'l', ph: 'dessin, volutes, montage'}]}]},
            {key: 'states', label: 'États et restaurations', zone: 'main', fields: [{key: 'states', label: 'États et restaurations', secLabel: '🩺 États et restaurations', type: 'rows', view: 'states', star: true, section: true, addLabel: 'Un constat',
                cols: [{key: 'date', label: 'Date', w: 's'}, {key: 'state', label: 'Constat, intervention', w: 'l'}, {key: 'by', label: 'Par', type: 'person', w: 'm'}, {key: 'doc', label: 'Rapport', w: 's'}]}]},
            G.side('protection', 'Protection', '🏛', [['protection', 'Statut', 'select', {choices: PROT}], ['prot_date', 'Arrêté', 'date'], ['merimee', 'Base Mérimée', 'ident', {ph: 'PA19000…', href: v => /^(PA|IA|EA)\w+$/i.test(v) ? `https://pop.culture.gouv.fr/notice/merimee/${encodeURIComponent(v)}` : ''}],
                ['palissy', 'Base Palissy (objet)', 'ident', {ph: 'PM19000…', h: 1, href: v => /^(PM|IM)\w+$/i.test(v) ? `https://pop.culture.gouv.fr/notice/palissy/${encodeURIComponent(v)}` : ''}], ['inventory', 'Inventaire', 'ident', {ph: 'IA19…', href: v => /^(IA|IM)\w+$/i.test(v) ? `https://pop.culture.gouv.fr/notice/merimee/${encodeURIComponent(v)}` : ''}]]),
            G.side('order', 'Commande', '💶', [['estimate', 'Devis', 'money'], ['paid', 'Payé', 'money'], ['paid_doc', 'Pièce', 'text', {ph: 'mandat'}], ['delay', 'Délais', 'text', {ph: '14 mois'}]]),
            ...(spec.groups || []), G.where(), G.prov(), G.expos(), G.biblio(), G.value()],
        list: spec.list || ['photos', 'title', 'date', 'piece_kind', 'material', 'installed', 'protection'], card: spec.card || ['date', 'material'],
        export: ['photos', 'title', 'date', 'piece_kind', 'sponsor', 'installed', 'makers', 'material', 'techniques', 'dims', 'decor', 'mark', 'crew', 'states', 'protection', 'merimee'],
        filters: [store => [{id: 'mh', label: 'Protégée (MH)', group: 'Protection', type: 'check', test: (it, v) => !v || ['inscrit', 'classe'].includes(it.data.protection)}]]});
    ART.views.o_drawings = {read: (ctx, it, f, v) => (v || []).map(r => `<div><span class="ar-ochip"><i>📄</i>${esc([r.what, r.date].filter(Boolean).join(' · '))}</span>${r.where ? ` <small class="ar-g">${esc(r.where)}</small>` : ''}</div>`).join('')};
    OE.craft({key: 'o_ferronnerie', icon: '⚒️', label: 'Ferronnerie d’art', many: 'Pièces de ferronnerie', showMetier: true, sponsorPeople: true, metierPh: 'Ferronnier d’art',
        kinds: [['grille', 'grille'], ['portail', 'portail'], ['rampe', 'rampe d’escalier'], ['balcon', 'balcon, garde-corps'], ['enseigne', 'enseigne'], ['marquise', 'marquise'], ['lustre', 'lustre, lanterne'], ['croix', 'croix, calvaire'], ['girouette', 'girouette'], ['penture', 'pentures, serrurerie'], ['mobilier', 'mobilier'], ['autre', 'autre']],
        matPh: 'fer puddlé, tôle repoussée, rehauts de feuille d’or', matLabel: 'Métal', partsPh: '2 vantaux + imposte', decorPh: 'volutes en C et S, armes de la ville, monogramme « RF »', unit: 'm',
        techniques: [['forge', 'forgé'], ['rive', 'rivé'], ['embreve', 'embrevé'], ['repousse', 'repoussé'], ['dore', 'doré'], ['soude', 'soudé'], ['cisele', 'ciselé'], ['estampe', 'estampé'], ['tordu', 'tordu, torsadé'], ['peint', 'peint'], ['galva', 'galvanisé, métallisé']],
        newData: () => ({metier: 'Ferronnier d’art', metier_domain: 'Métal', situation: 'place'})});
})();
