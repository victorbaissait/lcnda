/* LCNDA — 🎨 Catalogues d'artistes : l'ART (peinture, dessin, gravure, sculpture, photographie…) — définitions du moteur.
 * Maquette C : n° du catalogue raisonné et inventaires, technique, dimensions, signature, où est l'œuvre et à qui, attribution,
 * provenance (étapes, ventes, prix), expositions (fiches liées, n° au catalogue, prêteur), bibliographie, états et
 * restaurations, valeur et assurance, œuvres liées (étude, esquisse, réplique, gravure d'après, pendant), tirages et fontes.
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART; if (!ART?.define) return;
    const U = ART.util, esc = U.esc;
    const WKIND = [['peinture', 'Peinture'], ['dessin', 'Dessin'], ['aquarelle', 'Aquarelle'], ['gravure', 'Gravure'], ['sculpture', 'Sculpture'], ['photographie', 'Photographie'], ['pastel', 'Pastel'], ['ceramique', 'Céramique'], ['autre', 'Autre']];
    const ATTRIB = [['certaine', 'Œuvre certaine'], ['attribuee', 'Attribuée'], ['atelier', 'Atelier'], ['entourage', 'Entourage'], ['douteuse', 'Douteuse'], ['rejetee', 'Rejetée']];
    const STATUS = [['famille', 'Dans la famille'], ['musee', 'Musée, collection publique'], ['prive', 'Collection privée'], ['vendu', 'Vendue'], ['prete', 'Prêtée'], ['depot', 'En dépôt'], ['perdu', 'Perdue, disparue'], ['detruit', 'Détruite'], ['inconnu', 'Où ? inconnu']];
    const CONDITION = [['', '—'], ['bon', 'bon'], ['moyen', 'moyen'], ['restaurer', 'à restaurer'], ['restaure', 'restauré'], ['fragile', 'fragile']];
    const STEP = [['creation', 'l’artiste'], ['don', 'donnée'], ['vente', 'vendue'], ['achat', 'achetée, rachetée'], ['heritage', 'par héritage'], ['pret', 'prêtée'], ['depot', 'en dépôt'], ['vol', 'volée'], ['autre', 'autre']];
    const RELS = [['etude', 'étude pour'], ['esquisse', 'esquisse'], ['replique', 'réplique'], ['variante', 'variante'], ['gravure', 'gravure d’après'], ['pendant', 'pendant'], ['serie', 'même série']];
    const PHOTO = [['face', 'Face'], ['dos', 'Dos'], ['signature', 'Signature'], ['detail', 'Détail'], ['uv', 'UV'], ['ancienne', 'Photo ancienne'], ['cadre', 'Cadre'], ['autre', 'Autre']];
    const lab = (l, k) => (l.find(x => x[0] === k) || [, k || ''])[1];
    ART.ARTLISTS = {WKIND, ATTRIB, STATUS, STEP, RELS};

    ART.define({key: 'work', icon: '🖼', label: 'Œuvre', many: 'Œuvres', fem: true, domain: 'art',
        eyebrow: it => [lab(WKIND, it.data?.wkind || 'peinture'), it.data?.catref ? `CR ${String(it.data.catref).replace(/^CR\s*/i, '')}` : ''].filter(Boolean).join(' · '),
        heading: (ctx, it) => `<h2 class="ar-h2">${esc(it.title)}${it.data?.date ? ` <small>· ${esc(it.data.date)}</small>` : ''}</h2>`,
        badges: (ctx, it) => { const d = it.data || {}, a = d.attribution || 'certaine'; const b = [`<span class="ar-badge ${a === 'certaine' ? 'ok' : 'w'}">${a === 'certaine' ? '✓ ' : ''}${esc(lab(ATTRIB, a))}</span>`];
            if (d.status) b.push(`<span class="ar-badge b">${esc(lab(STATUS, d.status))}</span>`); if (d.condition) b.push(`<span class="ar-badge">État : ${esc(lab(CONDITION, d.condition))}</span>`); return `<div class="ar-badges">${b.join('')}</div>`; },
        cardLine: it => [it.data?.catref && `CR ${String(it.data.catref).replace(/^CR\s*/i, '')}`, it.data?.date, it.data?.technique].filter(Boolean).join(' · '),
        newData: store => ({wkind: 'peinture', status: 'famille', attribution: 'certaine', catref: nextRef(store)}),
        groups: [
            {key: 'main', label: 'L’œuvre', zone: 'main', fields: [
                {key: 'title', label: 'Titre', type: 'text', star: true, head: true},
                {key: 'date', label: 'Date', type: 'date', star: true, head: true},
                {key: 'wkind', label: 'Sorte', type: 'select', choices: WKIND, star: false},
                {key: 'technique', label: 'Technique', type: 'text', star: true, ph: 'Huile sur toile'},
                {key: 'dims', label: 'Dimensions', type: 'dims', star: true},
                {key: 'signature', label: 'Signé, daté', type: 'text', star: true, ph: 'en bas à droite « J. Martin 21 »'},
                {key: 'inscriptions', label: 'Inscriptions', type: 'text', star: true},
                {key: 'painted_at', label: 'Lieu peint', type: 'place', star: true},
                {key: 'series', label: 'Série', type: 'text', star: true, count: true},
                {key: 'attribution', label: 'Attribution', type: 'select', choices: ATTRIB, star: true, head: true},
                {key: 'status', label: 'Où est l’œuvre', type: 'select', choices: STATUS, star: true, head: true},
                {key: 'condition', label: 'État', type: 'select', choices: CONDITION, star: true, head: true}]},
            {key: 'photos', label: 'Photos', zone: 'left', fields: [{key: 'photos', label: 'Photos (face, dos, signature, UV…)', type: 'photos', star: true, labels: PHOTO, pickTitle: 'Les photos de l’œuvre'}]},
            {key: 'numbers', label: 'Numéros', icon: '🔢', zone: 'left', fields: [
                {key: 'catref', label: 'Catalogue raisonné', short: 'N°', type: 'text', star: true, ph: 'CR 47'},
                {key: 'inv', label: 'Inventaire famille', type: 'text', star: true},
                {key: 'museum_inv', label: 'Musée', type: 'text', star: true},
                {key: 'old_no', label: 'Ancien n°', type: 'text', star: true},
                {key: 'sale', label: 'Vente', type: 'text', star: true, ph: 'Drouot 1987, lot 112'}]},
            {key: 'prov', label: 'Provenance', zone: 'main', fields: [{key: 'provenance', label: 'Provenance', type: 'rows', view: 'provenance', star: true, addLabel: 'Une étape', focus: 'date',
                cols: [{key: 'date', label: 'Date', w: 's', ph: '1921 – 1938'}, {key: 'mode', label: 'Comment', type: 'select', choices: STEP, w: 's'}, {key: 'owner', label: 'Qui (personne, galerie, musée)', type: 'person', w: 'm'}, {key: 'how', label: 'Précision', w: 'm', ph: 'pour son mariage, lot 112…'}, {key: 'price', label: 'Prix', type: 'money', w: 's'}, {key: 'doc', label: 'Pièce (lettre, facture…)', w: 's'}]}]},
            {key: 'expos', label: 'Expositions', zone: 'main', fields: [{key: 'exhibitions', label: 'Expositions', type: 'rows', view: 'exhibitions', star: true, addLabel: 'Une exposition',
                cols: [{key: 'ex', label: 'Exposition', type: 'item', kinds: ['exhibition'], w: 'l'}, {key: 'catno', label: 'N° au catalogue', w: 's', ph: 'n° 18, repr. p. 9'}, {key: 'lender', label: 'Prêtée par', type: 'person', w: 'm'}]}]},
            {key: 'biblio', label: 'Bibliographie de l’œuvre', zone: 'main', fields: [{key: 'literature', label: 'Bibliographie de l’œuvre', type: 'rows', view: 'biblio', star: true, addLabel: 'Une référence',
                cols: [{key: 'ref', label: 'Livre, catalogue, article', type: 'item', kinds: ['book'], w: 'l'}, {key: 'page', label: 'Page, n°, fig.', w: 's', ph: 'p. 9, n° 18, repr.'}, {key: 'quote', label: 'Citation', w: 'm'}]}]},
            {key: 'where', label: 'Où est-elle', icon: '📍', zone: 'right', fields: [
                {key: 'holder', label: 'Collection', type: 'text', star: true, ph: 'Collection privée, musée…', bare: false},
                {key: 'owner', label: 'Propriétaire', type: 'person', star: true, roleWord: 'propriétaire'},
                {key: 'location', label: 'Lieu', short: 'Où', type: 'place', star: true},
                {key: 'location_detail', label: 'Pièce, réserve', type: 'text', star: true, ph: 'salon'}]},
            {key: 'states', label: 'États et restaurations', icon: '🩺', zone: 'right', fields: [{key: 'states', label: 'États et restaurations', type: 'rows', view: 'states', star: true, bare: true, addLabel: 'Un constat',
                cols: [{key: 'date', label: 'Date', w: 's'}, {key: 'state', label: 'Constat, intervention', w: 'l'}, {key: 'by', label: 'Par', type: 'person', w: 'm'}, {key: 'doc', label: 'Rapport', w: 's'}]}]},
            {key: 'value', label: 'Valeur et assurance', icon: '💶', zone: 'right', fields: [
                {key: 'value', label: 'Estimée', type: 'money', star: true}, {key: 'value_by', label: 'Par', type: 'text', star: true}, {key: 'insured', label: 'Assurée', type: 'text', star: true}]},
            {key: 'related', label: 'Œuvres liées', icon: '🔗', zone: 'right', fields: [{key: 'related', label: 'Œuvres liées', type: 'rows', view: 'related', star: true, bare: true, addLabel: 'Une œuvre liée',
                cols: [{key: 'w', label: 'Œuvre', type: 'item', kinds: ['work'], w: 'l'}, {key: 'rel', label: 'Lien', type: 'select', choices: RELS, w: 's'}]}]},
            {key: 'casts', label: 'Tirages et fontes', icon: '🗿', zone: 'main', fields: [{key: 'casts', label: 'Tirages et fontes', type: 'rows', star: false, addLabel: 'Un tirage',
                cols: [{key: 'no', label: 'N° (3/8, EA…)', w: 's'}, {key: 'date', label: 'Date', w: 's'}, {key: 'maker', label: 'Fondeur, tireur', w: 'm'}, {key: 'material', label: 'Matière, papier', w: 'm'}, {key: 'owner', label: 'Où, à qui', type: 'person', w: 'm'}]}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        list: ['catref', 'photos', 'title', 'date', 'technique', 'dims', 'location', 'owner', 'attribution', '_expos'],
        card: ['catref', 'date', 'technique'], export: ['photos', 'catref', 'title', 'date', 'technique', 'dims', 'signature', 'inscriptions', 'provenance', 'exhibitions', 'literature', 'value', 'owner', 'notes', 'related'],
        listExtra: [{key: '_expos', label: 'Expos', type: 'computed', view: 'expo_count'}],
        filters: store => { const works = store.of('work'), techs = [...new Set(works.map(w => String(w.data.technique || '').trim()).filter(Boolean))].sort();
            return [{id: 'tech', label: 'Technique', group: 'Technique', type: 'check', options: techs.map(t => [t, `${t} (${works.filter(w => w.data.technique === t).length})`]), test: (it, v) => !v.length || v.includes(it.data.technique)},
                {id: 'from', label: 'De', group: 'Période', type: 'text', placeholder: '1918', test: (it, v) => !v || (Number(it.year) || 0) >= Number(v)},
                {id: 'to', label: 'À', group: 'Période', type: 'text', placeholder: '1930', test: (it, v) => !v || (Number(it.year) || 9999) <= Number(v)},
                {id: 'status', label: 'Où est l’œuvre', group: 'Où est l’œuvre', type: 'check', options: STATUS.filter(([k]) => works.some(w => (w.data.status || 'inconnu') === k)).map(([k, l]) => [k, `${l} (${works.filter(w => (w.data.status || 'inconnu') === k).length})`]), test: (it, v) => !v.length || v.includes(it.data.status || 'inconnu')},
                {id: 'place', label: 'Lieu de conservation', type: 'place', chipPrefix: 'À', test: (it, v) => !v || (typeof v === 'object' ? U.place(it.data.location)?.plid === Number(v.id) : U.placeTitle(it.data.location).toLowerCase().includes(String(v).replace(/^txt:/, '').toLowerCase()))},
                {id: 'owner', label: 'Propriétaire', type: 'person', chipPrefix: 'Chez', test: (it, v) => !v || (typeof v === 'object' ? U.person(it.data.owner)?.pid === Number(v.id) : U.nameOf(it.data.owner).toLowerCase().includes(String(v).replace(/^txt:/, '').toLowerCase()))},
                {id: 'attr', label: 'Attribution', group: 'Attribution', type: 'check', options: [['certaine', 'Certaine'], ['autre', 'Attribuée, atelier, entourage'], ['doute', 'Douteuse, rejetée']], test: (it, v) => { if (!v.length) return true; const a = it.data.attribution || 'certaine'; return v.some(x => x === 'certaine' ? a === 'certaine' : x === 'autre' ? ['attribuee', 'atelier', 'entourage'].includes(a) : ['douteuse', 'rejetee'].includes(a)); }},
                {id: 'exposed', label: 'Exposée au moins une fois', group: 'Autres', type: 'check', test: (it, v, st) => !v || ART.arr(it.data.exhibitions).length > 0},
                {id: 'nophoto', label: 'Sans photo', group: 'Autres', type: 'check', test: (it, v) => !v || !ART.arr(it.data.photos).length},
                {id: 'cited', label: 'Citée dans un livre', group: 'Autres', type: 'check', test: (it, v) => !v || ART.arr(it.data.literature).length > 0}]; },
        upgrade: d => { const lines = v => String(v).split(/\n+/).map(x => x.trim()).filter(Boolean);
            if (d.note && !d.notes) { d.notes = d.note; delete d.note; }
            if (typeof d.provenance === 'string') d.provenance = lines(d.provenance).map(x => ({how: x}));
            if (typeof d.exhibitions === 'string') d.exhibitions = lines(d.exhibitions).map(x => ({ex: {txt: x}}));
            if (typeof d.literature === 'string') d.literature = lines(d.literature).map(x => ({ref: {txt: x}}));
            if (d.catref === undefined && d.inv) d.catref = ''; if (d.valueDate && !d.value_by) d.value_by = d.valueDate; },
        sorts: [['catref', 'N° du catalogue'], ['date', 'Date'], ['az', 'Titre A → Z'], ['za', 'Titre Z → A'], ['value', 'Valeur'], ['size', 'Dimensions']],
        summary: list => { const v = list.reduce((a, w) => a + (U.num(w.data.value) || 0), 0); return v ? `valeur estimée ${v.toLocaleString('fr-FR')} €` : ''; },
    });
    const nextRef = store => { const n = store.of('work').map(w => Number(String(w.data.catref || '').match(/(\d+)\s*$/)?.[1] || 0)); return `CR ${(n.length ? Math.max(...n) : 0) + 1}`; };
    // la série : « Les moulins de la Corrèze (5) »
    ART.ft.text_series = null;
    ART.views.expo_count = {read: (ctx, it) => String(ART.arr(it.data?.exhibitions).length || 0), text: (ctx, it) => String(ART.arr(it.data?.exhibitions).length || 0)};

    /* provenance : la frise (rond bleu = possession, jaune = vente, plein = aujourd'hui) */
    ART.views.provenance = {
        meta: () => 'qui l’a eue, quand, comment',
        actions: (ctx, it) => it.id ? `<button type="button" class="button small secondary" data-ar-cmd="edit">＋ Ajouter une étape</button>` : '',
        read: (ctx, it, f, v) => { const l = v || []; return `<div class="ar-tl">${l.map((s, i) => `<div class="ar-ev ${['vente', 'achat'].includes(s.mode) ? 'sale' : ''} ${i === l.length - 1 ? 'now' : ''}"><b>${esc(s.date || '?')}</b> · ${esc(lab(STEP, s.mode) || '')}${s.owner ? ` ${U.personChip(s.owner, '', ctx)}` : ''} ${s.price ? `<span class="ar-price">${esc(U.money(s.price))}</span>` : ''} <span class="ar-g">${esc(s.how || '')}</span>${s.doc ? ` <span class="ar-ochip"><i>📄</i>${esc(s.doc)}</span>` : ''}</div>`).join('')}</div>`; },
    };
    ART.views.states = {read: (ctx, it, f, v) => `<div class="ar-tl ar-tl-s">${(v || []).map((s, i, l) => `<div class="ar-ev ${i === l.length - 1 ? 'now' : ''}"><b>${esc(s.date || '?')}</b> · ${esc(s.state || '')}${s.by ? ` <span class="ar-g">par</span> ${U.personChip(s.by, '', ctx)}` : ''}${s.doc ? ` <span class="ar-g">(📄 ${esc(s.doc)})</span>` : ''}</div>`).join('')}</div>`};
    /* expositions : chaque exposition est une fiche, reliée à toutes ses œuvres */
    ART.views.exhibitions = {
        meta: () => 'chaque exposition est une fiche, reliée à toutes ses œuvres',
        actions: (ctx, it) => it.id ? `<button type="button" class="button small secondary" data-ar-cmd="edit">＋ Ajouter à une exposition…</button>` : '',
        read: (ctx, it, f, v) => { const st = ctx.store; return `<div class="ar-scroll"><table class="ar-t"><thead><tr><th>Exposition</th><th>Lieu</th><th>Dates</th><th>N° au catalogue</th><th>Prêtée par</th></tr></thead><tbody>${(v || []).map(r => { const ref = U.ref(r.ex), ex = ref?.iid ? st.get(ref.iid) : null;
            return `<tr><td>${U.refChip(r.ex, '🖼')}</td><td>${esc([U.placeTitle(ex?.data?.place), ex?.data?.venue].filter(Boolean).join(', '))}</td><td>${esc(ex?.data?.dates || ex?.year || '')}</td><td>${esc(r.catno || '')}</td><td>${r.lender ? (U.person(r.lender)?.pid ? U.personChip(r.lender, '', ctx) : esc(U.nameOf(r.lender))) : ''}</td></tr>`; }).join('')}</tbody></table></div>`; },
    };
    ART.views.biblio = {read: (ctx, it, f, v) => (v || []).map(r => `<div class="ar-bib">${U.refChip(r.ref, '📚')} <span>${esc(r.page || '')}</span>${r.quote ? ` <span class="ar-g">« ${esc(r.quote)} »</span>` : ''}</div>`).join('')};
    ART.views.related = {read: (ctx, it, f, v) => { const st = ctx.store; return `<div class="ar-minis">${(v || []).map(r => { const ref = U.ref(r.w), w = ref?.iid ? st.get(ref.iid) : null;
        return `<button type="button" class="ar-mini-w" ${ref?.iid ? `data-ar-open="${ref.iid}"` : ''}>${w ? U.cover(w, 'ar-mi') : '<span class="ar-mi is-empty">🖼</span>'}<span>${esc(lab(RELS, r.rel) || '')}</span><small>${esc([w?.year || '', w?.data?.catref || ref?.title || ref?.txt || ''].filter(Boolean).join(' '))}</small></button>`; }).join('')}</div><p class="ar-note">Liens : étude pour, esquisse, réplique, variante, gravure d’après, pendant, même série…</p>`; }};
    // la série : nombre d'œuvres de la même série (« Les moulins de la Corrèze (5) »)
    ART.after.push((C, body, it) => { if (it.kind !== 'work' || !it.data?.series) return; const n = C.store.of('work').filter(w => w.data.series === it.data.series).length; const dd = [...body.querySelectorAll('.ar-main .ar-dl dt')].find(dt => dt.textContent === 'Série')?.nextElementSibling; if (dd) dd.innerHTML = `<span class="ar-ochip is-link"><i>🗂</i>${esc(it.data.series)} (${n})</span>`; });
    // « Où est-elle » : « Collection privée · 👤 Paul BORIE / 📍 Tulle · salon » sur deux lignes
    ART.after.push((C, body, it) => { if (it.kind !== 'work') return; const box = body.querySelector('[data-ar-group="where"]'); if (!box) return; const d = it.data, ctx = ART.ctx(C.store, it);
        const l1 = [d.holder ? `<b>${esc(d.holder)}</b>` : '', d.owner ? U.personChip(d.owner, '', ctx) : ''].filter(Boolean).join(' · '), l2 = [d.location ? U.placeChip(d.location) : '', d.location_detail ? esc(d.location_detail) : ''].filter(Boolean).join(' · ');
        box.innerHTML = `<h5>📍 Où est-elle</h5>${l1 ? `<div class="ar-where">${l1}</div>` : ''}${l2 ? `<div class="ar-where">${l2}</div>` : ''}`; });

    /* ═════════ 🏛 Exposition ═════════ */
    ART.define({key: 'exhibition', icon: '🏛', label: 'Exposition', many: 'Expositions', tab: 'Expos', fem: true, domain: 'art',
        groups: [{key: 'main', label: 'Exposition', zone: 'main', fields: [{key: 'title', label: 'Titre', type: 'text', star: true, head: true}, {key: 'dates', label: 'Dates', type: 'text', star: true, ph: '1950, 12 mai – 30 juin 1950'},
                {key: 'place', label: 'Lieu', type: 'place', star: true}, {key: 'venue', label: 'Salle, musée', type: 'text', star: true}, {key: 'curator', label: 'Commissaire', type: 'person', star: true, roleWord: 'commissaire'},
                {key: 'catalogue', label: 'Catalogue', type: 'item', kinds: ['book'], star: true}]},
            {key: 'works', label: 'Œuvres exposées', zone: 'main', fields: [{key: '_works', label: 'Œuvres exposées', type: 'computed', view: 'ex_works', star: true}]},
            {key: 'photos', label: 'Affiche, photos', zone: 'left', fields: [{key: 'photos', label: 'Affiche, photos', type: 'photos', star: true, labels: [['affiche', 'Affiche'], ['vue', 'Vue de salle'], ['carton', 'Carton d’invitation'], ['autre', 'Autre']]}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        list: ['dates', 'title', 'place', 'venue', '_works'], card: ['dates', 'place'], export: ['dates', 'title', 'place', 'venue', 'catalogue'],
        cardLine: it => [it.data?.dates || it.year, U.placeTitle(it.data?.place)].filter(Boolean).join(' · '),
    });
    ART.views.ex_works = {
        meta: (ctx, it) => esc(U.plural(ctx.store.linksTo(it.id, 'exhibitions').length, 'œuvre')),
        text: (ctx, it) => U.plural(ctx.store.linksTo(it.id, 'exhibitions').length, 'œuvre'),
        read: (ctx, it) => { const st = ctx.store, l = st.linksTo(it.id, 'exhibitions').map(k => ({k, w: st.get(k.from) || {...k.other, data: {}}}));
            if (!l.length) return '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🗂️</span><span class="empty-line-text">Aucune œuvre : sur la fiche d’une œuvre, « Expositions » → choisis celle-ci.</span></p>';
            return `<div class="ar-grid">${l.map(({k, w}) => `<button type="button" class="ar-card" data-ar-open="${w.id}">${U.cover(w)}<b>${esc(w.title)}</b><small>${esc([k.data?.catno, w.year].filter(Boolean).join(' · '))}</small></button>`).join('')}</div>`; },
    };
})();
