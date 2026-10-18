/* LCNDA — 🎨 La PAGE DE L'ARTISTE (maquette E) : toutes ses facettes, en sections qu'on range, cache, met en ½, ⅓ ou pleine ligne.
 * Le profil « Artiste » est une fiche du moteur (sorte « profile », une par personne) : noms de scène, groupes (membres 👤),
 * labels, éditeurs, galeries, agents, formation (maîtres 👤), prix (→ œuvre), influences, liens officiels, presse.
 * Modèles de départ selon la discipline (Musicien, Peintre, Écrivain, Cinéaste, Photographe, Sculpteur, Architecte) ;
 * tout est gardé dans les réglages (« 💾 Réglages enregistrés », outil « artistes »).
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART; if (!ART?.define) return;
    const A = () => window.LCNDA_APP;
    const U = ART.util, esc = U.esc;
    const org = (label, key, kinds = ['org']) => ({key, label, type: 'rows', star: true, addLabel: label.replace(/s$/, ''), cols: [{key: 'org', label, type: 'item', kinds, w: 'l'}, {key: 'from', label: 'De', w: 's'}, {key: 'to', label: 'À', w: 's'}, {key: 'note', label: 'Note', w: 'm'}]});

    /* ═════════ 🎨 Le profil « Artiste » (une fiche par personne) ═════════ */
    ART.define({key: 'profile', icon: '🎨', label: 'Profil d’artiste', many: 'Profils', domain: 'profile', hidden: true, linked: false,
        groups: [
            {key: 'identity', label: 'Identité artistique', icon: '🎭', zone: 'main', fields: [
                {key: 'title', label: 'Nom d’artiste principal', type: 'text', star: true},
                {key: 'disciplines', label: 'Disciplines', type: 'text', star: true, ph: 'chanteur, peintre'},
                {key: 'stage_names', label: 'Noms de scène', type: 'rows', star: true, addLabel: 'Un nom de scène', cols: [{key: 'name', label: 'Nom', w: 'l'}, {key: 'from', label: 'De', w: 's'}, {key: 'to', label: 'À', w: 's'}]},
                {key: 'groups', label: 'Groupes', type: 'rows', star: true, addLabel: 'Un groupe', cols: [{key: 'org', label: 'Groupe, collectif', type: 'item', kinds: ['org'], w: 'm'}, {key: 'from', label: 'De', w: 's'}, {key: 'to', label: 'À', w: 's'}, {key: 'role', label: 'Rôle, instrument', w: 's'}], more: [{key: 'members', label: 'Membres', type: 'people'}]},
                org('Labels', 'labels'), org('Éditeurs', 'publishers'), org('Galeries', 'galleries'), org('Agents, producteurs', 'agents'),
                {key: 'training', label: 'Formation', type: 'rows', star: true, addLabel: 'Une école, un maître', cols: [{key: 'school', label: 'École, atelier', w: 'm'}, {key: 'master', label: 'Élève de', type: 'person', w: 'm'}, {key: 'from', label: 'De', w: 's'}, {key: 'to', label: 'À', w: 's'}]},
                {key: 'influences', label: 'Influences', type: 'text', star: true}]},
            {key: 'prizes', label: 'Prix et distinctions', icon: '🏆', zone: 'main', fields: [{key: 'prizes', label: 'Prix et distinctions', type: 'rows', star: true, addLabel: 'Un prix', cols: [{key: 'year', label: 'Année', w: 's'}, {key: 'prize', label: 'Prix', w: 'l'}, {key: 'work', label: 'Pour l’œuvre', type: 'item', kinds: ['release', 'work', 'book', 'film', 'track_work'], w: 'm'}, {key: 'status', label: 'Lauréat ou nommé', type: 'select', choices: [['laureat', 'lauréat'], ['nomme', 'nommé']], w: 's'}]}]},
            {key: 'bio', label: 'Biographie', icon: '📝', zone: 'main', fields: [{key: 'bio', label: 'Biographie', type: 'longtext', star: true, rows: 8}]},
            {key: 'links', label: 'Liens officiels', icon: '🔗', zone: 'main', fields: [{key: 'links', label: 'Liens officiels', type: 'rows', star: true, addLabel: 'Un lien', cols: [{key: 'label', label: 'Nom (Site officiel, Discogs, IMDb…)', w: 'm'}, {key: 'url', label: 'Adresse', type: 'url', w: 'l'}]}]},
            {key: 'press', label: 'Presse et critiques', icon: '📰', zone: 'main', fields: [{key: 'press', label: 'Presse et critiques', type: 'rows', star: true, addLabel: 'Un article', cols: [{key: 'paper', label: 'Journal, revue', w: 'm'}, {key: 'date', label: 'Date', w: 's'}, {key: 'title', label: 'Titre', w: 'm'}, {key: 'extract', label: 'Extrait', w: 'l'}]}]}],
    });

    /* ═════════ Les sections de la page ═════════ */
    const P = ART.pageSections;
    const prof = C => C.store.of('profile')[0] || null;
    const grid = (C, list, n = 6) => `<div class="ar-minicov" style="--n:${n}">${list.slice(0, n).map(it => `<button type="button" class="ar-mc" data-ar-open="${it.id}">${U.cover(it)}<span>${esc(it.title)}</span><small>${esc(ART.defs[it.kind]?.cardLine ? ART.defs[it.kind].cardLine(it) : it.year || '')}</small></button>`).join('')}</div>`;
    const rows = (C, field) => { const p = prof(C); if (!p) return ''; const f = ART.fieldsOf(ART.defs.profile).find(x => x.key === field); return ART.read(ART.ctx(C.store, p), p, f); };
    const editBtn = '<button type="button" class="icon-button small" data-ar-editprofile title="Modifier">…</button>';
    P.bio = {icon: '📝', label: 'Biographie', w: 'ligne', render: C => { const b = prof(C)?.data?.bio; return {body: b ? `<div class="ar-long">${esc(b).replace(/\n/g, '<br>')}</div>` : '<p class="muted">Pas encore de biographie : « … » pour l’écrire.</p>', actions: editBtn}; }};
    P.identity = {icon: '🎭', label: 'Identité artistique', w: '½', render: C => { const p = prof(C), d = p?.data || {}, ctx = p ? ART.ctx(C.store, p) : null;
        const line = (k, v) => v ? `<dt>${esc(k)}</dt><dd>${v}</dd>` : '';
        const orgs = l => (l || []).map(r => `${U.refChip(r.org, '🏷')} ${esc([r.from, r.to].filter(Boolean).join('-'))}`).join(' · ');
        const body = p ? `<dl class="ar-dl">${line('Noms de scène', esc((d.stage_names || []).map(r => `${r.name}${r.from ? ` (${[r.from, r.to].filter(Boolean).join('-')})` : ''}`).join(' · ')))}${line('Groupes', (d.groups || []).map(r => `${U.refChip(r.org, '👥')} ${esc([[r.from, r.to].filter(Boolean).join('-'), r.role].filter(Boolean).join(', '))}`).join(' · '))}${line('Labels', orgs(d.labels))}${line('Éditeurs', orgs(d.publishers))}${line('Galeries', orgs(d.galleries))}${line('Agents', orgs(d.agents))}${line('Formation', (d.training || []).map(r => `${esc(r.school || '')}${r.master ? ` · élève de ${U.personChip(r.master, '', ctx)}` : ''}`).join('<br>'))}${line('Influences', esc(d.influences || ''))}</dl>` : '';
        return {body: body.replace('<dl class="ar-dl"></dl>', '') || '<p class="muted">Noms de scène, groupes, labels, galeries, formation… : « … » pour les écrire.</p>', actions: editBtn}; }};
    P.prizes = {icon: '🏆', label: 'Prix et distinctions', w: '½', render: C => { const p = prof(C), l = p?.data?.prizes || [], ctx = p ? ART.ctx(C.store, p) : null;
        return {body: l.length ? l.map(r => `<div class="ar-prize">${esc(r.year || '')} · ${esc(r.prize || '')}${r.work ? ` — ${U.refChip(r.work)}` : ''}${r.status === 'nomme' ? ' <span class="ar-g">(nommé)</span>' : ''}</div>`).join('') : '<p class="muted">Aucun prix noté.</p>', actions: editBtn}; }};
    P.discography = {icon: '💿', label: 'Discographie', w: 'ligne', kinds: ['release'], render: (C, sec) => { const l = ART.sortItems(C.store.of('release'), 'year'), tab = sec.state || 'all';
        const n = k => l.filter(r => (r.data.rtype || 'album') === k).length, f = tab === 'all' ? l : l.filter(r => tab === 'album' ? ['album', 'live', 'bo'].includes(r.data.rtype || 'album') : (r.data.rtype || 'album') === tab);
        return {count: l.length, head: `<span class="ui-filters ar-dtabs">${[['album', 'Albums', n('album') + n('live') + n('bo')], ['single', 'Singles', n('single') + n('ep')], ['compil', 'Compilations', n('compil')]].filter(x => x[2]).map(([k, t, c]) => `<button type="button" class="${tab === k ? 'is-active' : ''}" data-ar-dtab="${k}">${t} ${c}</button>`).join('')}</span>`,
            body: l.length ? grid(C, f, 6) : '<p class="muted">Aucun disque.</p>', actions: '<button type="button" class="button small secondary" data-ar-tab="release">Tout voir</button>'}; }};
    P.tracks = {icon: '🎵', label: 'Morceaux (œuvres musicales)', w: 'ligne', render: C => { const l = C.store.of('track_work'); return {count: l.length, body: l.length ? `<div class="ar-chipsrow">${l.slice(0, 30).map(t => `<button type="button" class="ar-ochip is-link" data-ar-open="${t.id}"><i>🎵</i>${esc(t.title)}</button>`).join('')}</div>` : '<p class="muted">Aucun morceau.</p>', actions: '<button type="button" class="button small secondary" data-ar-tab="track_work">Tout voir</button>'}; }};
    P.works = {icon: '🖼', label: 'Œuvres · catalogue raisonné', w: '½', render: C => { const l = ART.sortItems(C.store.of('work'), 'catref'), cnt = k => l.filter(w => (w.data.status || 'inconnu') === k).length;
        const sum = [U.plural(l.length, 'œuvre'), cnt('famille') && `${cnt('famille')} dans la famille`, cnt('musee') && U.plural(cnt('musee'), 'musée'), cnt('inconnu') && `${cnt('inconnu')} où ? inconnu`].filter(Boolean).join(' · ');
        return {count: l.length, body: l.length ? `<p class="ar-sum">${esc(sum)}</p><div class="ar-minicov" style="--n:4">${l.slice(0, 4).map(w => `<button type="button" class="ar-mc" data-ar-open="${w.id}">${U.cover(w)}<small>${esc(w.data.catref || w.year || '')}</small></button>`).join('')}</div>` : '<p class="muted">Aucune œuvre.</p>', actions: '<button type="button" class="button small secondary" data-ar-tab="work">Tout voir</button>'}; }};
    P.expos = {icon: '🏛', label: 'Expositions', w: '½', render: C => { const st = C.store, l = ART.sortItems(st.of('exhibition'), 'year');
        return {count: l.length, body: l.length ? l.map(x => `<div class="ar-exline"><button type="button" class="ar-linkbtn" data-ar-open="${x.id}">${esc([x.data.dates || x.year, x.title].filter(Boolean).join(' · '))}${x.data.place ? `, ${esc(U.placeTitle(x.data.place))}` : ''}</button> <span class="ar-g">· ${esc(U.plural(st.linksTo(x.id, 'exhibitions').length, 'œuvre'))}${U.ref(x.data.catalogue) ? ' · catalogue' : ''}</span></div>`).join('') : '<p class="muted">Aucune exposition.</p>', actions: '<button type="button" class="button small secondary" data-ar-tab="exhibition">Tout voir</button>'}; }};
    P.biblio = {icon: '📚', label: 'Bibliographie', w: '⅓', render: C => { const l = C.store.of('book'), n = r => l.filter(b => (b.data.role || 'auteur') === r).length;
        return {count: l.length, body: `<p>${esc([n('auteur') && `${n('auteur')} de lui`, n('sur') && `${n('sur')} sur lui`, n('catalogue') && U.plural(n('catalogue'), 'catalogue')].filter(Boolean).join(' · ') || 'Aucun livre.')}</p>`, actions: '<button type="button" class="button small secondary" data-ar-tab="book">Tout voir</button>'}; }};
    P.filmo = {icon: '🎬', label: 'Filmographie', w: '⅓', render: C => { const l = C.store.of('film'); return {count: l.length, body: `<p>${esc(l.length ? U.plural(l.filter(f => !['theatre', 'spectacle', 'opera'].includes(f.data.fkind)).length, 'film') : 'Aucun film.')}</p>`, actions: '<button type="button" class="button small secondary" data-ar-tab="film">Tout voir</button>'}; }};
    P.concerts = {icon: '📅', label: 'Concerts et tournées', w: '⅓', render: C => { const l = C.store.of('concert'); return {count: l.length, body: `<p>${esc(l.length ? `${U.plural(l.length, 'date')}${new Set(l.map(c => U.placeTitle(c.data.place)).filter(Boolean)).size ? ` · ${U.plural(new Set(l.map(c => U.placeTitle(c.data.place)).filter(Boolean)).size, 'ville')}` : ''}` : 'Aucun concert.')}</p>`, actions: '<button type="button" class="button small secondary" data-ar-tab="concert">Tout voir</button>'}; }};
    P.shows = {icon: '🎭', label: 'Spectacles et rôles', w: 'ligne', render: C => { const l = C.store.of('film').filter(f => ['theatre', 'spectacle', 'opera'].includes(f.data.fkind)); return {count: l.length, body: l.length ? grid(C, l, 6) : '<p class="muted">Aucun spectacle.</p>'}; }};
    P.photos = {icon: '📷', label: 'Photographies', w: 'ligne', render: C => { const l = C.store.of('work').filter(w => w.data.wkind === 'photographie'); return {count: l.length, body: l.length ? grid(C, l, 6) : '<p class="muted">Aucune photographie.</p>'}; }};
    P.press = {icon: '📰', label: 'Presse et critiques', w: 'ligne', render: C => ({body: rows(C, 'press') || '<p class="muted">Aucun article noté.</p>', actions: editBtn})};
    P.links = {icon: '🔗', label: 'Liens officiels', w: 'en-tête', render: () => ({body: ''})};

    /* les modèles de départ, selon la discipline */
    const ALL = Object.keys(P);
    const M = ART.models;
    Object.assign(M, {
        musicien: {label: 'Musicien', order: ['bio', 'identity', 'prizes', 'discography', 'tracks', 'works', 'expos', 'biblio', 'filmo', 'concerts', 'shows', 'photos', 'press', 'links'], hidden: ['shows', 'photos', 'press']},
        peintre: {label: 'Peintre', order: ['bio', 'works', 'expos', 'identity', 'prizes', 'biblio', 'photos', 'press', 'links', 'discography', 'tracks', 'filmo', 'concerts', 'shows'], hidden: ['discography', 'tracks', 'filmo', 'concerts', 'shows']},
        ecrivain: {label: 'Écrivain', order: ['bio', 'biblio', 'identity', 'prizes', 'press', 'filmo', 'links', 'works', 'expos', 'discography', 'tracks', 'concerts', 'shows', 'photos'], hidden: ['works', 'expos', 'discography', 'tracks', 'concerts', 'shows', 'photos']},
        cineaste: {label: 'Cinéaste', order: ['bio', 'filmo', 'shows', 'identity', 'prizes', 'biblio', 'press', 'links', 'discography', 'tracks', 'works', 'expos', 'concerts', 'photos'], hidden: ['discography', 'tracks', 'works', 'expos', 'concerts', 'photos']},
        photographe: {label: 'Photographe', order: ['bio', 'photos', 'expos', 'works', 'identity', 'prizes', 'biblio', 'press', 'links', 'discography', 'tracks', 'filmo', 'concerts', 'shows'], hidden: ['discography', 'tracks', 'filmo', 'concerts', 'shows']},
        sculpteur: {label: 'Sculpteur', order: ['bio', 'works', 'expos', 'identity', 'prizes', 'biblio', 'press', 'links', 'photos', 'discography', 'tracks', 'filmo', 'concerts', 'shows'], hidden: ['photos', 'discography', 'tracks', 'filmo', 'concerts', 'shows']},
        architecte: {label: 'Architecte', order: ['bio', 'works', 'identity', 'prizes', 'biblio', 'expos', 'press', 'links', 'photos', 'discography', 'tracks', 'filmo', 'concerts', 'shows'], hidden: ['discography', 'tracks', 'filmo', 'concerts', 'shows', 'photos']},
    });
    const MODEL_OF = {musicien: 'musicien', chanteur: 'musicien', compositeur: 'musicien', chef: 'musicien', groupe: 'musicien', peintre: 'peintre', plasticien: 'peintre', ecrivain: 'ecrivain', poete: 'ecrivain', dramaturge: 'ecrivain', cineaste: 'cineaste', acteur: 'cineaste', videaste: 'cineaste', danseur: 'cineaste', photographe: 'photographe', sculpteur: 'sculpteur', architecte: 'architecte'};
    const WIDTH = {'ligne': 'w-12', '¾': 'w-9', '⅔': 'w-8', '½': 'w-6', '⅓': 'w-4', 'en-tête': 'w-0'};
    /** les largeurs d'une section de page, rangées comme ailleurs dans l'app (de la plus large à la plus étroite) */
    ART.PAGE_WIDTHS = [['ligne', 'toute la ligne'], ['¾', '¾'], ['⅔', '⅔'], ['½', '½'], ['⅓', '⅓']];
    ART.PAGE_WIDTH_CLASS = WIDTH;
    ART.widthOptions = w => ART.PAGE_WIDTHS.map(([v, l]) => `<option value="${v}" ${v === w ? 'selected' : ''}>${l}</option>`).join('');
    /** la couleur du liseré d'une section : réglage de la section (« none » = aucun), sinon celle donnée (profil), sinon rien */
    ART.secColor = (colors, k, dflt = '') => { const c = colors?.[k]; if (c === 'none') return ''; return /^#[0-9a-f]{6}$/i.test(c || '') ? c : dflt; };
    /** dans un panneau « Organiser » : une pastille C2 par ligne [data-o-col] (Aucune = pas de liseré) et ↺ (couleur de départ) */
    ART.mountSecColors = (root, colors, dflt, onSet) => root.querySelectorAll('[data-o-col]').forEach(slot => {
        const k = slot.dataset.oCol, UI = window.LCNDA_UI, raw = colors?.[k], cur = raw === 'none' ? '' : (ART.secColor(colors, k, dflt(k)) || '');
        if (!UI?.colorField) return;
        const f = UI.colorField({value: cur || '#7b2ff7', allowNone: true, compact: true}); if (!cur) f.value = '';
        f.title = 'Couleur du liseré de la section'; slot.appendChild(f);
        f.input.addEventListener('change', () => onSet(k, f.input.value || 'none'));
        if (raw) { const r = document.createElement('button'); r.type = 'button'; r.className = 'ar-colreset'; r.textContent = '↺'; r.title = 'Revenir à la couleur de départ'; r.addEventListener('click', () => onSet(k, null)); slot.appendChild(r); }
    });
    /** la page telle qu'on la montre : ordre, cachées, largeurs (réglage de l'artiste, sinon global, sinon le modèle de sa discipline) */
    /* le modèle de départ : celui de la discipline d'artiste, sinon celui du premier profil coché (Scientifique, Explorateur…) */
    const defModel = st => MODEL_OF[st.person.artist_discipline] || (!Number(st.person.is_artist) && (st.person.profiles || []).map(p => ART.profiles?.[p.profile_key]?.models?.[0]).find(m => m && M[m])) || 'musicien';
    const heroEyebrow = (st, disc) => profilesOf(st).map(k => k === 'artist' ? `🎨 ARTISTE${disc ? ` · ${esc(disc.toLocaleUpperCase('fr-FR'))}` : ''}` : ART.profiles?.[k] ? esc(`${ART.profiles[k].icon} ${String(ART.profiles[k].label).toLocaleUpperCase('fr-FR')}`) : '').filter(Boolean).join(' · ') || '🎨 ARTISTE';
    function pageCfg(store) {
        const s = store.settings?.page || {}, model = M[s.model || defModel(store)] || M.musicien;
        const custom = s.custom || [];
        const order = [...new Set([...(s.order || model.order), ...Object.keys(P), ...custom.map(c => c.key)])].filter(k => P[k] || custom.some(c => c.key === k));
        const hidden = new Set(s.hidden || model.hidden);
        return {order, hidden, widths: s.widths || {}, colors: s.colors || {}, custom, modelKey: s.model || defModel(store)};
    }
    /* les profils (l'actuel « Artiste » ; d'autres viendront : politique, sportif…) : une section de page dit à quel profil
       elle appartient (profile, « artist » par défaut) ; la page ne montre que celles des profils cochés sur la fiche */
    ART.profiles = ART.profiles || {};
    ART.profiles.artist = {key: 'artist', label: 'Artiste', icon: '🎨', type: 'profile', models: M};
    const profilesOf = st => { const l = (st.person.profiles || []).map(p => p.profile_key); if (Number(st.person.is_artist) && !l.includes('artist')) l.push('artist'); return l.length ? l : ['artist']; };
    const secOf0 = (cfg, k) => P[k] || (cfg.custom.find(c => c.key === k) ? {icon: '✎', label: cfg.custom.find(c => c.key === k).label, w: '⅓', custom: true, render: C => { const p = prof(C), v = p?.data?.[k]; return {body: v ? `<div class="ar-long">${esc(v).replace(/\n/g, '<br>')}</div>` : '<p class="muted">Vide : « … » pour l’écrire.</p>', actions: editBtn}; }} : null);
    const secOf = (cfg, k, st = null) => { const S0 = secOf0(cfg, k); if (S0 && st && !(S0.profiles || [S0.profile || 'artist']).some(x => profilesOf(st).includes(x))) return null; return S0; };
    const secState = {};

    ART.paintPage = (C, body) => {
        const st = C.store, p = st.person, cfg = pageCfg(st), pr = prof(C), d = pr?.data || {};
        const life = [p.birth && `° ${[p.birth.year, p.birth.place].filter(Boolean).join(' ')}`, p.death && `† ${[p.death.year, p.death.place].filter(Boolean).join(' ')}`,
            st.of('release').length && U.plural(st.of('release').length, 'disque'), st.of('work').length && U.plural(st.of('work').length, 'œuvre'), st.of('book').filter(b => (b.data.role || 'auteur') === 'auteur').length && U.plural(st.of('book').filter(b => (b.data.role || 'auteur') === 'auteur').length, 'livre'), st.of('film').length && U.plural(st.of('film').length, 'film')].filter(Boolean).join(' · ');
        const disc = [p.artist_discipline, d.disciplines].filter(Boolean).join(', ').replace(/^(\w)/, c => c);
        const links = (d.links || []).filter(l => /^https?:/.test(l.url || ''));
        const ICON = u => /discogs/.test(u) ? '💿' : /imdb/.test(u) ? '🎬' : /wikipedia|wikidata/.test(u) ? '📖' : '🌐';
        const linksOn = !cfg.hidden.has('links');
        const hero = `<header class="ar-hero">${p.photo ? `<span class="ar-hero-ph" style="background-image:url('media/${encodeURIComponent(p.photo)}')"></span>` : `<span class="ar-hero-ph ${{male: 'm', female: 'f'}[p.gender] || 'u'}">${esc(U.initials(st.name))}</span>`}<div><span class="eyebrow">${heroEyebrow(st, disc)}</span>
            <h2>${esc(st.name)}${(d.stage_names || []).length ? ` <small>· ${d.stage_names.map(r => `« ${esc(r.name)} »`).join(', ')}</small>` : ''}</h2><p class="ar-g">${esc([life, ...profilesOf(st).filter(k => k !== 'artist').map(k => ART.profiles?.[k]?.summary?.(st))].filter(Boolean).join(' · '))}</p>${linksOn && links.length ? `<div class="ar-hero-links">${links.map(l => `<a class="ar-ochip is-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer"><i>${ICON(l.url)}</i>${esc(l.label || l.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0])}</a>`).join('')}</div>` : ''}</div></header>`;
        const secs = cfg.order.filter(k => !cfg.hidden.has(k) && k !== 'links').map(k => { const S0 = secOf(cfg, k, st); if (!S0) return ''; const r = S0.render(C, {state: secState[k]}); const w = cfg.widths[k] || S0.w;
            const col = ART.secColor(cfg.colors, k);
            return `<section class="ar-blk ${WIDTH[w] || 'w-12'}${col ? ' has-lis' : ''}" data-sec="${esc(k)}"${col ? ` style="--pf:${esc(col)}"` : ''}><div class="ar-bh"><span class="ar-grip" title="Ranger : ⚙️ Organiser la page">⠿</span><b>${esc(S0.icon)} ${esc(S0.label)}</b>${r.count ? ` <small class="ar-g">${r.count}</small>` : ''}${r.head || ''}<span class="spacer"></span>${r.actions || ''}</div><div class="ar-bb">${r.body}</div></section>`; }).join('');
        body.innerHTML = `<div class="ar-page">${hero}<div class="ar-blocks">${secs}</div></div>`;
        body.onclick = e => { const b = e.target.closest('[data-ar-dtab]'); if (b) { secState.discography = b.dataset.arDtab === secState.discography ? 'all' : b.dataset.arDtab; ART.paintPage(C, body); return; }
            if (e.target.closest('[data-ar-editprofile]')) { const it = prof(C); if (it) C.open(it.id, {edit: true}); else C.newItem('profile', {title: st.name}); } };
    };

    /* ═════════ « ⚙️ Organiser la page de l'artiste » ═════════ */
    ART.openOrganizer = C => {
        const aside = C.dlg.querySelector('[data-ar-panel]'); aside.hidden = false; C.dlg.classList.add('has-panel');
        const close = () => { aside.hidden = true; aside.innerHTML = ''; C.panel = null; C.dlg.classList.remove('has-panel'); };
        C.panel = {close, page: true, refresh: () => paint()};
        const tgt = () => { const s = C.store; if (s.personSet?.own) return s.personSet; s.global = s.global || {}; return s.global; };
        const page = () => { const t = tgt(); const cfg = pageCfg(C.store); t.page = t.page || {}; t.page.order = t.page.order || cfg.order; t.page.hidden = t.page.hidden || [...cfg.hidden]; t.page.widths = t.page.widths || {}; t.page.custom = t.page.custom || []; return t.page; };
        const save = async () => { C.store.settings = C.store.personSet?.own ? C.store.personSet : C.store.global; try { await ART.persistSettings(C.store); } catch (e) { A().toast(e.message, 'error'); } C.paint(false); paint(); };
        function paint() {
            const cfg = pageCfg(C.store), list = cfg.order;
            aside.innerHTML = `<div class="ar-ph"><b>⚙️ Organiser la page${profilesOf(C.store).includes('artist') ? ' de l’artiste' : ` de ${esc(C.store.name)}`}</b><span class="spacer"></span><button type="button" class="icon-button small" data-o-close aria-label="Fermer">×</button></div><div class="ar-pbody">
                <p class="ar-phelp">Glisse ⠿ (ou ↑ ↓) pour ranger, 👁 pour cacher. La largeur : toute la ligne, ¾, ⅔, ½ ou ⅓ ; la pastille : la couleur du liseré.</p><div class="ar-plist">${list.map((k, i) => { const S0 = secOf(cfg, k, C.store); if (!S0) return ''; const on = !cfg.hidden.has(k), w = cfg.widths[k] || S0.w;
                    return `<div class="ar-fr ${on ? '' : 'off'} ${S0.custom ? 'cust' : ''}" data-okey="${esc(k)}" draggable="true"><span class="ar-grip">⠿</span><button type="button" class="ar-eye" data-o-eye title="${on ? 'Cacher' : 'Montrer'}">${on ? '👁' : '🚫'}</button><span class="lbl">${esc(S0.icon)} ${esc(S0.label)}</span>
                        ${k === 'links' ? '<span class="ty">en-tête</span>' : `<select class="ty ar-wsel" data-o-w title="Largeur">${ART.widthOptions(w)}</select><span class="ar-ocol" data-o-col="${esc(k)}"></span>`}<span class="tools"><button type="button" data-o-mv="-1" ${i ? '' : 'disabled'} title="Monter">↑</button><button type="button" data-o-mv="1" ${i < list.length - 1 ? '' : 'disabled'} title="Descendre">↓</button>${S0.custom ? '<button type="button" data-o-del title="Retirer">🗑</button>' : ''}</span></div>`; }).join('')}</div>
                <div class="ar-pbtns"><button type="button" class="button small secondary" data-o-add>＋ Ajouter une section</button><select class="ar-in" data-o-model title="Modèle de départ selon la discipline">${Object.entries(M).map(([k, m]) => `<option value="${k}" ${k === cfg.modelKey ? 'selected' : ''}>Modèle : ${esc(m.label)}</option>`).join('')}</select></div>
                <p class="ar-phelp">Modèles de départ selon la discipline (Musicien, Peintre, Écrivain, Cinéaste, Photographe, Sculpteur, Architecte…) ; tout se change ensuite. Gardé dans « 💾 Réglages enregistrés » (outil « artistes ») : « ⚙️ Champs affichés » d’une fiche.</p></div>`;
            ART.mountSecColors(aside, cfg.colors, () => '', (k, v) => { const p0 = page(); p0.colors = {...(p0.colors || {})}; if (v == null) delete p0.colors[k]; else p0.colors[k] = v; save(); });
        }
        aside.onclick = async e => { const b = e.target.closest('button'); if (!b) return; const row = b.closest('[data-okey]'), k = row?.dataset.okey, pg = () => page();
            if (b.dataset.oClose !== undefined) return close();
            if (b.dataset.oEye !== undefined) { const p0 = pg(); p0.hidden = p0.hidden.includes(k) ? p0.hidden.filter(x => x !== k) : [...p0.hidden, k]; return save(); }
            if (b.dataset.oMv) { const p0 = pg(), i = p0.order.indexOf(k), j = i + Number(b.dataset.oMv); if (i < 0 || j < 0 || j >= p0.order.length) return; [p0.order[i], p0.order[j]] = [p0.order[j], p0.order[i]]; return save(); }
            if (b.dataset.oDel !== undefined) { const p0 = pg(); p0.custom = p0.custom.filter(c => c.key !== k); p0.order = p0.order.filter(x => x !== k); return save(); }
            if (b.dataset.oAdd !== undefined) { const n = await A().askText({title: '＋ Ajouter une section', message: 'Son nom (ex. « Ses instruments ») ; tu l’écris ensuite avec « … ».', value: '', okLabel: 'Ajouter'}); if (!n?.trim()) return; const p0 = pg(), key = `s_${U.slug(n)}`;
                p0.custom.push({key, label: n.trim().slice(0, 60)}); p0.order.push(key);
                // le champ du même nom dans le profil, pour l'écrire
                const g = C.store.global = C.store.global || {}; g.kinds = g.kinds || {}; const K = g.kinds.profile = g.kinds.profile || {}; (K.custom = K.custom || []).push({key, label: n.trim().slice(0, 60), type: 'longtext', star: true});
                return save(); } };
        aside.onchange = e => { const k = e.target.closest('[data-okey]')?.dataset.okey; if (e.target.matches('[data-o-w]')) { page().widths[k] = e.target.value; save(); } if (e.target.matches('[data-o-model]')) { const t = tgt(); t.page = {model: e.target.value, widths: t.page?.widths || {}, colors: t.page?.colors || {}, custom: t.page?.custom || []}; save(); } };
        let drag = null;
        aside.ondragstart = e => { drag = e.target.closest('[data-okey]'); drag?.classList.add('drag'); };
        aside.ondragover = e => { if (!drag) return; const o = e.target.closest('[data-okey]'); if (!o || o === drag) return; e.preventDefault(); const r = o.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) o.before(drag); else o.after(drag); };
        aside.ondragend = () => { if (!drag) return; drag.classList.remove('drag'); drag = null; page().order = [...aside.querySelectorAll('[data-okey]')].map(r => r.dataset.okey); save(); };
        paint();
    };
})();
