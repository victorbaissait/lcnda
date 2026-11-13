/* LCNDA — 🧭 Explorations (maquette Z de docs/design/profils-et-oeuvres.html), sur le moteur des fiches (docs/TYPES.md).
 * La fiche d'une expédition : itinéraire sur la carte (étapes numérotées, sommets ▲), membres 👤 et leur rôle, moyens,
 * premières, carnets, photos et films, collectes et où elles sont aujourd'hui, incidents, récits et conférences, cartes
 * tracées, toponymes. Le profil « 🧭 Explorateur » : expéditions (liste, carte de toutes, frise), premières, toponymes donnés
 * ou à son nom, collectes, récits, conférences, sociétés (Société de géographie, Explorers Club…), distinctions.
 * Outils communs : heritage-sciences.js (ART.sci).
 */
(() => {
    'use strict';
    const i18n = (s, v) => { const I = (typeof window !== 'undefined' ? window : globalThis).LCNDA_I18N; if (v) v = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x])); return I ? I.t(s, v) : (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s); }; // 🌐 textes traduits (docs/I18N.md) ; nombres gardés tels quels
    const ART = window.LCNDA_ART; if (!ART?.define || !ART.sci) return;
    const SC = ART.sci, U = ART.util, esc = U.esc, lab = SC.lab;
    const plural = (n, w, pl) => U.plural(n, w, pl);

    const EKIND = [['', '—'], ['scientifique', 'scientifique'], ['geographique', i18n('géographique, cartographie')], ['alpinisme', 'alpinisme'], ['polaire', 'polaire'], ['maritime', i18n('maritime, océanographique')], ['speleo', i18n('spéléologie')], ['archeo', i18n('archéologique')], ['naturaliste', 'naturaliste, collecte'], ['ethno', 'ethnographique'], ['aerienne', i18n('aérienne')], ['raid', i18n('raid, traversée')], ['militaire', 'militaire'], ['autre', 'autre']];
    const MKIND = [['carnet', '📓 Carnet'], ['photos', '📷 Photos'], ['film', '🎞 Film'], ['croquis', '✏️ Croquis'], ['son', '🎙 Enregistrements'], ['lettres', '✉️ Lettres'], ['autre', '📎 Autre']];
    const RKIND = [['livre', '📚 Livre'], ['article', '📰 Article'], ['conference', `🎤 ${i18n('Conférences')}`], ['film', '🎞 Film'], ['expo', '🏛 Exposition'], ['radio', `📻 ${i18n('Radio, télévision')}`], ['autre', '📎 Autre']];
    const TSTAT = [['', '—'], ['officiel', 'officiel'], ['non_officiel', i18n('nom donné, non officiel')], ['disparu', i18n('disparu, remplacé')]];
    const EPHOTO = [['depart', i18n('Départ')], ['camp', 'Campement'], ['sommet', 'Sommet, point fort'], ['portrait', 'Portrait'], ['carte', i18n('Carte')], ['objet', 'Objet'], ['autre', 'Autre']];
    SC.EKIND = EKIND;

    /** les repères de l'itinéraire d'une expédition */
    const routePts = it => ART.arr(it.data?.route).map((r, i) => ({plid: U.place(r.place)?.plid || 0, coords: r.coords || '', label: `${r.summit ? '▲' : r.n || i + 1} · ${[U.placeTitle(r.place) || r.label, r.alt].filter(Boolean).join(' ')}`, n: r.summit ? 0 : (Number(r.n) || i + 1), color: r.summit ? '#d0182f' : '', show: true}));
    SC.routePts = routePts;
    ART.views.sc_route = {
        meta: (ctx, it) => { const l = it.data?.route || []; return l.length ? esc(plural(l.length, 'étape')) : ''; },
        actions: (ctx, it) => it.id ? `<button type="button" class="button small secondary" data-ar-cmd="edit">＋ ${i18n('Ajouter une étape')}</button>` : '',
        read: (ctx, it, f, v) => { const l = Array.isArray(v) ? v : []; if (!l.length) return '';
            return `${SC.mapSlot([{color: '#e1a500', line: true, pts: routePts(it)}], {height: 450, empty: i18n('Les lieux de l’itinéraire n’ont pas encore leurs coordonnées (fiche du lieu, ou colonne « Coordonnées »).')})}
                <div class="ar-scroll"><table class="ar-t sc-route"><thead><tr><th>${i18n('Étape')}</th><th>${i18n('Lieu')}</th><th>Dates</th><th>Moyen</th></tr></thead><tbody>${l.map((r, i) => `<tr class="${r.summit ? 'is-me' : ''}"><td>${r.summit ? '▲' : esc(r.n || i + 1)}</td><td>${r.place ? U.placeChip(r.place) : ''}${r.label ? ` <b>${esc(r.label)}</b>` : ''}${r.alt ? ` <small class="ar-g">${esc(r.alt)}</small>` : ''}${r.note ? `<br><small class="ar-g">${esc(r.note)}</small>` : ''}</td><td>${esc(r.date || '')}</td><td>${esc(r.means || '')}</td></tr>`).join('')}</tbody></table></div>`; },
        text: (ctx, it) => ART.arr(it.data?.route).map(r => U.placeTitle(r.place) || r.label).filter(Boolean).join(' → '),
    };
    ART.views.sc_firsts = {read: (ctx, it, f, v) => (v || []).map(r => `<div class="sc-line">🥇 <b>${esc(r.what || '')}</b>${r.date ? ` · ${esc(r.date)}` : ''}${r.note ? ` <small class="ar-g">${esc(r.note)}</small>` : ''}</div>`).join('')};
    ART.views.sc_emedia = {read: (ctx, it, f, v) => `<div class="sc-chips">${(v || []).map(r => `<span class="ar-ochip"><i>${esc(String(lab(MKIND, r.kind || 'autre')).split(' ')[0])}</i>${esc([r.title, r.extent].filter(Boolean).join(' · '))}${r.where ? ` <small class="ar-g">(${esc(r.where)})</small>` : ''}</span>`).join('')}</div>`};
    ART.views.sc_collect = {read: (ctx, it, f, v) => `<div class="ar-scroll"><table class="ar-t"><tbody>${(v || []).map(r => `<tr><td>${esc([r.qty, r.what].filter(Boolean).join(' '))}</td><td>${SC.refOf(r.where, 'empid')?.empid ? SC.refChip(r.where, 'employer') : esc(SC.refTitle(r.where, 'empid'))}${r.inv ? ` <small class="ar-g">n° ${esc(r.inv)}</small>` : ''}${/famille/i.test(SC.refTitle(r.where, 'empid') || r.where || '') ? ' · 📦' : ''}</td></tr>`).join('')}</tbody></table></div>`};
    ART.views.sc_lines = {read: (ctx, it, f, v) => (v || []).map(r => `<div class="sc-line">${r.date ? `<b>${esc(r.date)}</b> · ` : ''}${esc(r.what || '')}</div>`).join('')};
    ART.views.sc_accounts = {read: (ctx, it, f, v) => (v || []).map(r => `<div class="sc-line">${r.ref ? U.refChip(r.ref, String(lab(RKIND, r.kind || 'autre')).split(' ')[0]) : `<span class="ar-ochip is-free"><i>${esc(String(lab(RKIND, r.kind || 'autre')).split(' ')[0])}</i>${esc(r.title || '')}</span>`}${r.by ? ` ${U.personChip(r.by, '', ctx)}` : ''} <small class="ar-g">${esc([r.count && (r.kind === 'conference' ? plural(Number(r.count) || 0, i18n('conférence')) : r.count), r.date].filter(Boolean).join(' · '))}</small>${r.note ? ` <small class="ar-g">${esc(r.note)}</small>` : ''}</div>`).join('')};
    ART.views.sc_maps = {read: (ctx, it, f, v) => (v || []).map(r => `<div class="sc-line">${esc([r.title, r.scale].filter(Boolean).join(' au '))}${SC.docChip(r.doc)}</div>`).join('')};
    ART.views.sc_topos = {read: (ctx, it, f, v) => (v || []).map(r => `<div class="sc-line">« ${esc(r.name || '')} »${r.what ? ` · ${esc(r.what)}` : ''}${r.place ? ` ${U.placeChip(r.place)}` : ''}${r.status ? ` <small class="ar-g">(${esc(lab(TSTAT, r.status))})</small>` : ''}</div>`).join('')};

    ART.define({key: 'expedition', icon: '🧭', label: i18n('Expédition'), many: i18n('Expéditions'), fem: true, domain: 'science', profile: 'explorer',
        eyebrow: it => [i18n('Expédition'), it.data?.region, U.yearOf(it.data?.dates) || it.year].filter(Boolean).join(' · '),
        heading: (ctx, it) => `<h2 class="ar-h2">${esc(it.title)}${it.data?.dates ? ` <small>· ${esc(it.data.dates)}</small>` : ''}</h2>`,
        badges: (ctx, it) => { const d = it.data || {}, b = []; if (d.ekind) b.push(`<span class="ar-badge b">${esc(lab(EKIND, d.ekind))}</span>`); const m = ART.normPeople(d.members).length; if (m) b.push(`<span class="ar-badge">👥 ${esc(plural(m, 'membre'))}</span>`);
            if ((d.route || []).length) b.push(`<span class="ar-badge">📍 ${esc(plural(d.route.length, 'étape'))}</span>`); if ((d.firsts || []).length) b.push(`<span class="ar-badge ok">🥇 ${esc(plural(d.firsts.length, 'première'))}</span>`); return b.length ? `<div class="ar-badges">${b.join('')}</div>` : ''; },
        cardLine: it => [it.data?.dates || it.year, it.data?.region].filter(Boolean).join(' · '),
        newData: () => ({ekind: 'scientifique', route: []}),
        groups: [
            {key: 'main', label: i18n('L’expédition'), zone: 'main', fields: [
                {key: 'title', label: i18n('Nom de l’expédition'), type: 'text', star: true, head: true, ph: 'Mission Limousin – Hoggar'},
                {key: 'dates', label: 'Dates', type: 'text', star: true, ph: '28 déc. 1933 – 4 mai 1934'},
                {key: 'region', label: i18n('Région'), type: 'text', star: true, ph: 'Sahara, Hoggar'},
                {key: 'ekind', label: 'Sorte', type: 'select', choices: EKIND, star: true, head: true},
                {key: 'objective', label: 'Objectif', type: 'text', star: true, ph: 'relever la flore et les roches de l’Atakor'},
                {key: 'sponsor', label: 'Commanditaire', type: 'employer', star: true},
                {key: 'funders', label: 'Financeurs', type: 'text', star: true, ph: 'Muséum · Conseil général de la Corrèze · souscription'},
                {key: 'budget', label: 'Budget', type: 'money', star: false},
                {key: 'result', label: i18n('Résultat'), type: 'text', star: false, ph: 'réussie, interrompue…'}]},
            {key: 'route', label: i18n('Itinéraire'), zone: 'main', fields: [{key: 'route', label: `🗺 ${i18n('Itinéraire')}`, type: 'rows', view: 'sc_route', star: true, addLabel: i18n('Une étape'), focus: 'date', unitWord: i18n('étape'),
                cols: [{key: 'n', label: i18n('Étape'), w: 's', ph: '1, 2–4'}, {key: 'place', label: i18n('Lieu'), type: 'place', w: 'l'}, {key: 'label', label: 'Nom (pic, col, oasis…)', w: 'm', ph: 'pic sans nom de l’Atakor'}, {key: 'date', label: 'Dates', w: 's', ph: '18 févr.'},
                    {key: 'means', label: 'Moyen', w: 'm', ph: 'méharis, 2 camions Latil, cordée'}, {key: 'alt', label: 'Altitude', w: 's', ph: '2 780 m'}, {key: 'summit', label: '▲ Sommet', type: 'bool', w: 's'}],
                more: [{key: 'coords', label: i18n('Coordonnées (si le lieu n’en a pas)'), type: 'text'}, {key: 'note', label: 'Note', type: 'text'}]}]},
            {key: 'firsts', label: i18n('Premières'), zone: 'main', fields: [{key: 'firsts', label: `🥇 ${i18n('Premières')}`, type: 'rows', view: 'sc_firsts', star: true, addLabel: i18n('Une première'),
                cols: [{key: 'what', label: i18n('Première'), w: 'l', ph: '1re ascension d’un piton de l’Atakor'}, {key: 'date', label: 'Date', w: 's', ph: '3 mars 1934'}, {key: 'note', label: 'Note', w: 'm'}]}]},
            {key: 'members', label: 'Membres', zone: 'main', fields: [{key: 'members', label: '👥 Membres', type: 'people', view: 'sc_people', star: true, section: true, addLabel: i18n('Un membre'), rolePh: i18n('chef, médecin, botaniste, guide…'), roleWord: 'membre'}]},
            {key: 'means', label: 'Moyens', zone: 'main', fields: [{key: 'means', label: '🚚 Moyens', type: 'rows', star: true, addLabel: i18n('Un moyen'),
                cols: [{key: 'what', label: i18n('Véhicule, animaux, matériel'), w: 'l', ph: 'camion Latil'}, {key: 'qty', label: 'Combien', w: 's'}, {key: 'note', label: 'Note', w: 'm'}]}]},
            {key: 'emedia', label: 'Carnets, photos, films', zone: 'main', fields: [{key: 'notebooks', label: '📓 Carnets, photos, films', type: 'rows', view: 'sc_emedia', star: true, addLabel: i18n('Un carnet, des photos…'),
                cols: [{key: 'kind', label: 'Sorte', type: 'select', choices: MKIND, w: 's'}, {key: 'title', label: 'Titre', w: 'l', ph: 'Carnet de route de René'}, {key: 'extent', label: i18n('Étendue'), w: 's', ph: '112 p., 214 photos'}, {key: 'where', label: i18n('Où'), w: 'm'}]}]},
            {key: 'collect', label: 'Collectes', zone: 'main', fields: [{key: 'collections', label: `🧪 ${i18n('Collectes — où elles sont aujourd’hui')}`, type: 'rows', view: 'sc_collect', star: true, addLabel: i18n('Une collecte'),
                cols: [{key: 'qty', label: 'Combien', w: 's', ph: '312'}, {key: 'what', label: i18n('Quoi'), w: 'l', ph: 'plantes séchées'}, {key: 'where', label: i18n('Où aujourd’hui'), type: SC.cellKind('employer'), w: 'm'}, {key: 'inv', label: 'N°', w: 's'}]}]},
            {key: 'incidents', label: 'Incidents', zone: 'main', fields: [{key: 'incidents', label: '⚠️ Incidents', type: 'rows', view: 'sc_lines', star: true, addLabel: i18n('Un incident'),
                cols: [{key: 'date', label: 'Date', w: 's'}, {key: 'what', label: i18n('Quoi'), w: 'l', ph: 'camion perdu dans l’erg · 4 jours sans eau'}]}]},
            {key: 'photos', label: 'Photos', zone: 'left', fields: [{key: 'photos', label: 'Photos', type: 'photos', star: true, labels: EPHOTO, pickTitle: i18n('Les photos de l’expédition')}]},
            {key: 'accounts', label: i18n('Récits et conférences'), icon: '📚', zone: 'right', fields: [{key: 'accounts', label: i18n('Récits et conférences'), type: 'rows', view: 'sc_accounts', star: true, bare: true, addLabel: i18n('Un récit, des conférences'),
                cols: [{key: 'kind', label: 'Sorte', type: 'select', choices: RKIND, w: 's'}, {key: 'title', label: 'Titre', w: 'm'}, {key: 'ref', label: i18n('Fiche (livre…)'), type: 'item', kinds: ['book', 'paper', 'film'], w: 'm'}, {key: 'by', label: i18n('Par'), type: 'person', w: 'm'}, {key: 'count', label: 'Combien', w: 's'}, {key: 'date', label: 'Date', w: 's'}]}]},
            {key: 'maps', label: i18n('Cartes tracées'), icon: '🗺', zone: 'right', fields: [{key: 'maps', label: i18n('Cartes tracées'), type: 'rows', view: 'sc_maps', star: true, bare: true, addLabel: i18n('Une carte'),
                cols: [{key: 'title', label: i18n('Carte'), w: 'l', ph: 'carte de l’Atakor'}, {key: 'scale', label: i18n('Échelle'), w: 's', ph: '1/200 000'}, {key: 'doc', label: i18n('Pièce'), w: 's'}]}]},
            {key: 'topos', label: 'Toponymes', icon: '🏷', zone: 'right', fields: [{key: 'toponyms', label: i18n('Toponymes donnés'), type: 'rows', view: 'sc_topos', star: true, bare: true, addLabel: i18n('Un nom donné'),
                cols: [{key: 'name', label: 'Nom', w: 'm', ph: 'Guelta Martin'}, {key: 'what', label: i18n('Quoi'), w: 's', ph: 'point d’eau'}, {key: 'place', label: i18n('Où'), type: 'place', w: 'm'}, {key: 'status', label: 'Statut', type: 'select', choices: TSTAT, w: 's'}]}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        list: ['photos', 'dates', 'title', 'region', 'ekind', 'members'], card: ['dates', 'region'],
        export: ['photos', 'title', 'dates', 'region', 'objective', 'sponsor', 'members', 'route', 'firsts', 'collections', 'accounts', 'notes'],
        searchHint: 'ex. Hoggar, 1934, Tamanrasset',
        filters: store => { const l = store.of('expedition');
            return [{id: 'ek', label: 'Sorte', group: 'Sorte', type: 'check', options: EKIND.filter(x => x[0] && l.some(i => i.data.ekind === x[0])).map(x => [x[0], `${x[1]} (${l.filter(i => i.data.ekind === x[0]).length})`]), test: (it, v) => !v?.length || v.includes(it.data.ekind)},
                {id: 'member', label: i18n('Avec'), type: 'person', chipPrefix: i18n('Avec'), test: (it, v) => !v || ART.normPeople(it.data.members).some(m => typeof v === 'object' ? m.pid === Number(v.id) : String(m.title || m.txt || '').toLowerCase().includes(String(v).replace(/^txt:/, '').toLowerCase()))},
                {id: 'place', label: i18n('Passée par'), type: 'place', chipPrefix: i18n('Par'), test: (it, v) => !v || ART.arr(it.data.route).some(r => typeof v === 'object' ? U.place(r.place)?.plid === Number(v.id) : U.placeTitle(r.place).toLowerCase().includes(String(v).replace(/^txt:/, '').toLowerCase()))},
                {id: 'firsts', label: i18n('Avec une première'), group: 'Autres', type: 'check', test: (it, v) => !v || ART.arr(it.data.firsts).length > 0}]; },
        sorts: [['year', i18n('Par année')], ['recent', i18n('Les plus récentes')], ['az', 'A → Z'], ['za', 'Z → A'], ['perso', 'Mon ordre']],
    });

    /* ═════════ Le profil « 🧭 Explorateur » : sa fiche (une par personne) ═════════ */
    ART.define({key: 'profile_explorer', icon: '🧭', label: i18n('Profil d’explorateur'), many: i18n('Profils d’explorateur'), domain: 'profile', hidden: true, linked: false, profile: 'explorer',
        groups: [
            {key: 'main', label: i18n('L’explorateur'), zone: 'main', fields: [
                {key: 'title', label: 'Nom', type: 'text', star: true, head: true},
                {key: 'specialties', label: i18n('Spécialités'), type: 'text', star: true, ph: 'Sahara, haute montagne, botanique'},
                {key: 'regions', label: i18n('Régions parcourues'), type: 'text', star: true},
                {key: 'societies', label: i18n('Sociétés'), type: 'rows', star: true, addLabel: i18n('Une société'), cols: [{key: 'name', label: i18n('Société, club'), type: SC.cellKind('employer'), w: 'l'}, {key: 'from', label: 'Depuis', w: 's'}, {key: 'role', label: i18n('Rôle'), w: 'm', ph: 'membre, président'}]},
                {key: 'distinctions', label: 'Distinctions', type: 'rows', star: true, addLabel: i18n('Une distinction'), cols: [{key: 'year', label: i18n('Année'), w: 's'}, {key: 'name', label: 'Distinction', w: 'l', ph: 'médaille d’or de la Société de géographie'}, {key: 'note', label: 'Note', w: 'm'}]},
                {key: 'named', label: i18n('Lieux à son nom'), type: 'rows', star: true, addLabel: i18n('Un lieu à son nom'), cols: [{key: 'name', label: 'Nom', w: 'm'}, {key: 'what', label: i18n('Quoi'), w: 's'}, {key: 'place', label: i18n('Où'), type: 'place', w: 'm'}, {key: 'year', label: i18n('Année'), w: 's'}]},
                {key: 'talks', label: i18n('Conférences'), type: 'rows', star: true, addLabel: i18n('Des conférences'), cols: [{key: 'date', label: 'Dates', w: 's'}, {key: 'title', label: 'Sujet', w: 'l'}, {key: 'place', label: i18n('Où'), type: 'place', w: 'm'}, {key: 'count', label: 'Combien', w: 's'}]},
                {key: 'bio', label: i18n('Récit de vie'), type: 'longtext', star: true, rows: 6}]}],
    });

    /* ═════════ Les sections de la page (profil explorateur) ═════════ */
    const EXP = ['explorer'];
    const exps = C => ART.sortItems ? ART.sortItems(C.store.of('expedition'), 'year') : C.store.of('expedition');
    SC.section('exp_list', {icon: '🧭', label: i18n('Expéditions'), w: 'ligne', profiles: EXP, render: C => { const l = exps(C);
        return {count: l.length, body: l.length ? `<div class="ar-minicov" style="--n:6">${l.slice(0, 12).map(it => `<button type="button" class="ar-mc" data-ar-open="${it.id}">${U.cover(it)}<span>${esc(it.title)}</span><small>${esc([it.data.dates || it.year, it.data.region].filter(Boolean).join(' · '))}</small></button>`).join('')}</div>` : SC.empty(i18n('Aucune expédition pour l’instant.'), 'expedition', i18n('Nouvelle expédition')),
            actions: `${l.length ? SC.newBtn('expedition', i18n('Nouvelle')) : ''}${SC.allBtn('expedition')}`}; }});
    SC.section('exp_map', {icon: '🗺', label: i18n('Carte de toutes ses expéditions'), w: '½', profiles: EXP, render: C => { const l = exps(C).filter(it => ART.arr(it.data.route).length);
        return {count: l.length, body: l.length ? `${SC.mapSlot(l.map((it, i) => ({color: SC.COLORS[i % SC.COLORS.length], line: true, pts: routePts(it).map(p => ({...p, color: p.color || SC.COLORS[i % SC.COLORS.length], show: false}))})), {height: 560})}<div class="sci-legend">${l.map((it, i) => `<button type="button" class="ar-linkbtn" data-ar-open="${it.id}"><i style="background:${SC.COLORS[i % SC.COLORS.length]}"></i>${esc(it.title)}</button>`).join('')}</div>` : `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📍</span><span class="empty-line-text">${i18n('Aucun itinéraire : sur la fiche d’une expédition, « 🗺 Itinéraire » → une ligne par étape.')}</span></p>`}; }});
    /** la frise : une barre par expédition, de sa date de départ à son retour */
    SC.frise = (rows, {color = '#e1a500'} = {}) => { const r = rows.filter(x => x.from); if (!r.length) return '';
        const a = Math.min(...r.map(x => x.from)), b = Math.max(...r.map(x => x.to || x.from)), span = Math.max(1, b - a + 1), step = span > 60 ? 20 : span > 25 ? 10 : span > 8 ? 5 : 1;
        const ticks = []; for (let y = Math.ceil(a / step) * step; y <= b; y += step) ticks.push(y);
        return `<div class="sci-frise"><div class="sc-fax">${ticks.map(y => `<span style="left:${((y - a) / span * 100).toFixed(2)}%">${y}</span>`).join('')}</div>${r.map(x => `<div class="sc-frow"><span class="sc-flab">${x.open ? `<button type="button" class="ar-linkbtn" data-ar-open="${x.open}">${esc(x.label)}</button>` : esc(x.label)}</span><span class="sc-ftrack"><i style="left:${((x.from - a) / span * 100).toFixed(2)}%;width:${Math.max(1.2, ((x.to || x.from) - x.from + 1) / span * 100).toFixed(2)}%;background:${esc(x.color || color)}" title="${esc(`${x.from}${x.to && x.to !== x.from ? `–${x.to}` : ''}`)}"></i></span></div>`).join('')}</div>`; };
    SC.section('exp_frise', {icon: '📈', label: i18n('Frise des expéditions'), w: 'ligne', profiles: EXP, render: C => { const l = exps(C);
        const rows = l.map((it, i) => { const ys = String(it.data.dates || it.year || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/g) || []; const from = Number(ys[0] || it.date_min || it.year) || 0, to = Number(ys[ys.length - 1] || it.date_max || from) || from; return {from, to, label: it.title, open: it.id, color: SC.COLORS[i % SC.COLORS.length]}; });
        return {count: l.length, body: SC.frise(rows) || `<p class="muted">${i18n('Les expéditions sans date n’ont pas de place sur la frise.')}</p>`}; }});
    SC.section('exp_firsts', {icon: '🥇', label: i18n('Premières'), w: '½', profiles: EXP, render: C => { const l = exps(C).flatMap(it => ART.arr(it.data.firsts).map(f => ({...f, it})));
        return {count: l.length, body: l.length ? l.map(f => `<div class="sc-line">🥇 <b>${esc(f.what || '')}</b>${f.date ? ` · ${esc(f.date)}` : ''} <button type="button" class="ar-linkbtn" data-ar-open="${f.it.id}">${esc(f.it.title)}</button></div>`).join('') : `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🏆</span><span class="empty-line-text">${i18n('Aucune première notée.')}</span></p>`}; }});
    SC.section('exp_toponyms', {icon: '🏷', label: i18n('Toponymes donnés ou à son nom'), w: '⅓', profiles: EXP, render: C => { const given = exps(C).flatMap(it => ART.arr(it.data.toponyms).map(t => ({...t, it}))), named = SC.pdata(C, 'explorer').named || [];
        return {count: given.length + named.length, body: `${given.length ? `<p class="ar-g">${i18n('Noms donnés')}</p>${given.map(t => `<div class="sc-line">« ${esc(t.name || '')} »${t.what ? ` · ${esc(t.what)}` : ''}${t.status ? ` <small class="ar-g">(${esc(lab(TSTAT, t.status))})</small>` : ''}</div>`).join('')}` : ''}${named.length ? `<p class="ar-g">${i18n('À son nom')}</p>${named.map(t => `<div class="sc-line">« ${esc(t.name || '')} »${t.what ? ` · ${esc(t.what)}` : ''}${t.year ? ` · ${esc(t.year)}` : ''}</div>`).join('')}` : ''}` || `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📍</span><span class="empty-line-text">${i18n('Aucun nom de lieu noté.')}</span></p>`, actions: SC.editBtn('explorer')}; }});
    SC.section('exp_collections', {icon: '🧪', label: i18n('Collectes et où elles sont'), w: '½', profiles: EXP, render: C => { const l = exps(C).flatMap(it => ART.arr(it.data.collections).map(c => ({...c, it})));
        return {count: l.length, body: l.length ? `<div class="ar-scroll"><table class="ar-t"><thead><tr><th>${i18n('Quoi')}</th><th>${i18n('Où aujourd’hui')}</th><th>${i18n('Expédition')}</th></tr></thead><tbody>${l.map(c => `<tr><td>${esc([c.qty, c.what].filter(Boolean).join(' '))}</td><td>${SC.refOf(c.where, 'empid')?.empid ? SC.refChip(c.where, 'employer') : esc(SC.refTitle(c.where, 'empid'))}</td><td><button type="button" class="ar-linkbtn" data-ar-open="${c.it.id}">${esc(c.it.title)}</button></td></tr>`).join('')}</tbody></table></div>` : `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📭</span><span class="empty-line-text">${i18n('Aucune collecte notée.')}</span></p>`}; }});
    SC.section('exp_accounts', {icon: '📚', label: i18n('Récits et conférences'), w: '⅓', profiles: EXP, render: C => { const l = exps(C).flatMap(it => ART.arr(it.data.accounts).map(r => ({...r, it}))), talks = SC.pdata(C, 'explorer').talks || [], ctx = ART.ctx(C.store, {});
        return {count: l.length + talks.length, body: `${ART.views.sc_accounts.read(ctx, {}, {}, l)}${talks.map(t => `<div class="sc-line">🎤 ${esc([t.title, t.count && plural(Number(t.count) || 0, i18n('conférence')), t.date].filter(Boolean).join(' · '))}</div>`).join('')}` || `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📝</span><span class="empty-line-text">${i18n('Aucun récit noté.')}</span></p>`, actions: SC.editBtn('explorer')}; }});
    SC.section('exp_societies', {icon: '🏛', label: i18n('Sociétés et distinctions'), w: '⅓', profiles: EXP, render: C => { const d = SC.pdata(C, 'explorer'), s = d.societies || [], di = d.distinctions || [];
        return {count: s.length + di.length, body: `${s.map(r => `<div class="sc-line">${typeof r.name === 'object' ? SC.refChip(r.name, 'employer') : esc(r.name || '')}${[r.from && `depuis ${r.from}`, r.role].filter(Boolean).length ? ` <small class="ar-g">${esc([r.from && `depuis ${r.from}`, r.role].filter(Boolean).join(', '))}</small>` : ''}</div>`).join('')}${di.map(r => `<div class="sc-line">🏅 ${esc([r.year, r.name].filter(Boolean).join(' · '))}</div>`).join('')}` || `<p class="muted">${i18n('Société de géographie, Explorers Club, médailles… : « … » pour les écrire.')}</p>`, actions: SC.editBtn('explorer')}; }});
    SC.section('exp_members', {icon: '👥', label: i18n('Compagnons d’expédition'), w: '⅓', profiles: EXP, render: C => { const by = new Map(), ctx = ART.ctx(C.store, {});
        exps(C).forEach(it => ART.normPeople(it.data.members).forEach(m => { if (m.pid === C.pid) return; const k = m.pid ? `p${m.pid}` : `n${String(m.txt || '').toLowerCase()}`; if (!by.has(k)) by.set(k, {m, n: 0, roles: new Set()}); const x = by.get(k); x.n++; if (m.role) x.roles.add(m.role); }));
        const l = [...by.values()].sort((a, b) => b.n - a.n);
        return {count: l.length, body: l.length ? l.slice(0, 24).map(x => `<div>${U.personChip(x.m, [...x.roles].join(', '), ctx)}${x.n > 1 ? ` <small class="ar-g">× ${x.n}</small>` : ''}</div>`).join('') : `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">👤</span><span class="empty-line-text">${i18n('Personne d’autre noté dans ses expéditions.')}</span></p>`}; }});
    ART.models.explorateur = {label: 'Explorateur', order: ['exp_list', 'exp_map', 'exp_firsts', 'exp_frise', 'exp_collections', 'exp_toponyms', 'exp_accounts', 'exp_societies', 'exp_members', 'sci_discoveries', 'bio', 'identity', 'prizes'], hidden: []};
})();
