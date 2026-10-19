/* LCNDA — 🧩 Les PROFILS d'une personne (maquettes AA et R de docs/design/profils-et-oeuvres.html).
 *
 * AA « Cette personne était… » : sur la fiche, on coche un ou plusieurs profils (Artiste, Sportif, Homme / femme politique,
 *    Élu local, Militaire, Agriculteur…, ceux déclarés par les autres outils, et les siens « ✎ Mes profils ») ; chacun ajoute
 *    ses sections à la page de la personne. « ✎ Créer mon propre profil… » : nom, icône, couleur, sections reprises ou siennes.
 * R  La page d'une personne à plusieurs profils : « Tout mélangé » (sections de tous les profils, liseré de couleur, frise de
 *    vie colorée par profil) ou un profil à la fois ; « ⚙️ Organiser la page » range les profils et les sections.
 *
 * Tout est construit sur le moteur des fiches (docs/TYPES.md) : un profil = ART.profiles[clé] ; sa fiche de profil = une
 * sorte « profile_<clé> » (ART.define, domain 'profile', hidden) ; ses sections = ART.pageSections (profile: '<clé>').
 * Serveur : lib/profils.php (set_profiles, save_profile_def, delete_profile_def, op=profiles) + art_set_profile.
 *
 * ── Déclarer un profil (pour un autre outil) ──
 *   ART.profiles.cle = {key: 'cle', label: 'Explorateur', icon: '🧭', color: '#0e9aa7', group: 'aventure',
 *       type: 'profile_cle',               // sa fiche de profil (ART.define({key: 'profile_cle', domain: 'profile', hidden: true, …}))
 *       desc: 'expéditions, carnets…',     // une ligne d'aide dans la fenêtre des profils
 *       models: {…}, defaultModel: st => 'cle',      // modèles de départ de sa page (ordre, sections cachées)
 *       timeline: C => [{label, bars: [{a: 1950, b: 1960, text, id}]}],   // facultatif : ses lignes de la frise
 *       hero: C => ({eyebrow, sub, summary, links}) };                    // facultatif : l'en-tête de sa page
 *   ART.pageSections.cle_expe = {icon: '🧭', label: 'Expéditions', w: '½', profile: 'cle', render: (C, sec) => ({body, count, actions, empty})};
 *   Groupes de la fenêtre : creation, aventure, savoir, public, armes, travail (autre : « Autres profils »).
 *   Une section commune à toutes les pages (médias, récompenses, formation…) : profile: 'common'.
 *   Côté serveur : les sortes du profil dans $GLOBALS['ART_EXTRA_TYPES'] (voir lib/profils.php) ; la fiche « profile_cle » est
 *   acceptée d'office dès que le profil existe (il est créé quand on le coche).
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART; if (!ART?.define) return;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const U = ART.util, esc = U.esc;
    const plural = (n, w, pl) => U.plural(n, w, pl);
    const clone = o => JSON.parse(JSON.stringify(o ?? null));
    const toast = (...a) => A()?.toast?.(...a);
    const PF = ART.PF = ART.PF || {};
    ART.profiles = ART.profiles || {};
    ART.timelineExtras = ART.timelineExtras || [];

    /* ═════════ Le registre des profils ═════════ */
    PF.GROUPS = [['creation', 'Création et scène'], ['aventure', 'Sport et aventure'], ['savoir', 'Savoir'], ['public', 'Vie publique'], ['armes', 'Armes et courage'], ['travail', 'Travail'], ['autre', 'Autres profils'], ['mine', '✎ Mes profils']];
    const GUESS = {artist: 'creation', craft: 'creation', crafts: 'creation', artisan: 'creation', artisan_art: 'creation', actor: 'creation', performer: 'creation', scientist: 'savoir', science: 'savoir', inventor: 'savoir', explorer: 'aventure'};
    const FIXED = {artist: '#7b2ff7', politic: '#055dff', elu_local: '#055dff', sport: '#1aa34a', inventor: '#e1a500', scientist: '#e1a500', military: '#6b7280', craft: '#c2410c', actor: '#d0182f', explorer: '#0e9aa7'};
    const PALETTE = ['#7b2ff7', '#055dff', '#1aa34a', '#e1a500', '#d0182f', '#0e9aa7', '#c2410c', '#be185d', '#4d7c0f', '#6b7280'];
    PF.profColors = {}; // la couleur choisie pour un profil (réglage standard, « Organiser la page » ou Maintenance)
    PF.color = key => { const c = PF.profColors?.[key]; if (/^#[0-9a-f]{6}$/i.test(c || '')) return c; const p = ART.profiles[key]; if (/^#[0-9a-f]{6}$/i.test(p?.color || '')) return p.color; if (FIXED[key]) return FIXED[key]; let h = 0; for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
    /** l'encre lisible sur la couleur d'un profil (jaune clair → texte foncé) ; les deux variables CSS d'une pastille ou d'une barre */
    PF.ink = c => { const m = /^#([0-9a-f]{6})$/i.exec(String(c || '')); if (!m) return '#fff'; const n = parseInt(m[1], 16), f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; const L = .2126 * f(n >> 16) + .7152 * f((n >> 8) & 255) + .0722 * f(n & 255); return L > .3 ? '#111' : '#fff'; };
    PF.vars = c => `--pf:${esc(c)};--pf-ink:${PF.ink(c)}`;
    const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const groupKey = g => { if (!g) return ''; if (PF.GROUPS.some(x => x[0] === g)) return g; const f = fold(g); return (PF.GROUPS.find(x => fold(x[1]) === f) || [''])[0]; };
    PF.norm = p => ({...p, label: p.label || p.key, icon: p.icon || '✦', color: PF.color(p.key), desc: p.desc || p.hint || '', group: groupKey(p.group) || GUESS[p.key] || (p.user ? 'mine' : 'autre')});
    /** tous les profils (un seul par nom : celui d'un outil passe avant un profil simple du même nom) */
    PF.all = () => {
        const seen = new Map();
        Object.values(ART.profiles).filter(p => p && p.key && !p.hiddenInChooser).map(PF.norm).forEach(p => { const k = fold(p.label); const o = seen.get(k); if (!o || (o.lite && !p.lite && !o.user)) seen.set(k, p); });
        return [...seen.values()];
    };
    PF.kindProfile = kind => ART.defs[kind]?.profile || (/^profile_(.+)$/.exec(String(kind || ''))?.[1]) || null;
    /** les profils cochés sur la fiche (dans l'ordre), ceux que ce navigateur connaît */
    PF.keysOf = st => { const l = (st?.person?.profiles || []).map(p => p.profile_key || p.key); if (Number(st?.person?.is_artist) && !l.includes('artist')) l.unshift('artist'); return [...new Set(l)].filter(k => ART.profiles[k]); };
    PF.isCombined = st => PF.keysOf(st).some(k => k !== 'artist');
    PF.fiche = (st, key) => { const t = ART.profiles[key]?.type; return t ? st.of(t)[0] || null : null; };
    PF.counts = {};
    const youngName = st => st.person?.first_name || st.name;
    const female = st => st?.person?.gender === 'female';
    PF.female = female;
    PF.life = st => { const p = st.person || {}; const b = p.birth, d = p.death; return [b && [b.year, b.place].filter(Boolean).join(' '), d && [d.year, d.place].filter(Boolean).join(' ')].filter(Boolean).join(' – '); };
    PF.year = v => { const y = U.yearOf(v); return y ? Number(y) : NaN; };
    /** une période → [a, b] (années) ; « en cours », « aujourd'hui » = cette année ; fin vide = un seul point */
    PF.span = (from, to) => { const a = PF.year(from); if (!Number.isFinite(a)) return null; const now = /cours|auj|présent|maintenant/i.test(String(to || '')); const b = now ? new Date().getFullYear() : PF.year(to); return [a, Number.isFinite(b) && b >= a ? b : a]; };
    PF.years = (from, to) => { const s = [String(from || '').trim(), String(to || '').trim()]; return s[0] && s[1] ? `${s[0]} – ${s[1]}` : s[0] ? (/cours/.test(s[1]) ? `depuis ${s[0]}` : s[0]) : s[1] ? `→ ${s[1]}` : ''; };
    PF.editBtn = key => `<button type="button" class="icon-button small" data-pf-edit="${esc(key)}" title="Modifier">…</button>`;
    PF.newBtn = (kind, label = '＋ Ajouter') => `<button type="button" class="button small secondary" data-pf-new="${esc(kind)}">${esc(label)}</button>`;
    PF.allBtn = kind => `<button type="button" class="button small secondary" data-ar-tab="${esc(kind)}">Tout voir</button>`;
    PF.muted = t => `<p class="muted">${esc(t)}</p>`;
    PF.res = (t, cls = '') => `<span class="pf-res ${cls}">${esc(t)}</span>`;

    // l'artiste (heritage-artist-page.js) : son groupe, sa couleur, sa frise
    ART.profiles.artist = {group: 'creation', color: '#7b2ff7', desc: 'œuvres, disques, livres, films, expositions', ...(ART.profiles.artist || {key: 'artist', label: 'Artiste', icon: '🎨', type: 'profile'})};
    const ART_KINDS = [['release', 'disque'], ['work', 'œuvre'], ['book', 'livre'], ['film', 'film'], ['track_work', 'morceau'], ['concert', 'concert'], ['exhibition', 'exposition']];
    if (!ART.profiles.artist.timeline) ART.profiles.artist.timeline = C => {
        const st = C.store, rows = [];
        ART_KINDS.forEach(([k, w]) => { const l = st.of(k), ys = l.map(i => Number(i.year)).filter(Number.isFinite); if (!ys.length) return; rows.push({label: `${ART.defs[k]?.icon || '✦'} ${ART.defs[k]?.many || k}`, bars: [{a: Math.min(...ys), b: Math.max(...ys), text: plural(l.length, w)}]}); });
        return rows;
    };
    ART.profiles.artist.sub = st => ({photographe: 'photographe', peintre: 'peintre', ecrivain: 'écrivain', cineaste: 'cinéaste', sculpteur: 'sculpteur', dramaturge: 'dramaturge', poete: 'poète', videaste: 'vidéaste', plasticien: 'plasticien', danseur: 'danseur', acteur: 'acteur', musicien: 'musique', chanteur: 'chant', compositeur: 'composition'}[st.person?.artist_discipline] || '');

    /* ═════════ Les profils « simples » : une fiche de profil + une section par groupe de champs ═════════ */
    const rowsF = (key, label, cols, add) => ({key, label, type: 'rows', star: true, addLabel: add || 'Une ligne', cols});
    const C_ = (key, label, w = 'm', extra = {}) => ({key, label, w, ...extra});
    const FROMTO = [C_('from', 'De', 's'), C_('to', 'À', 's')];
    /** PF.lite({key, label, icon, color, group, desc, sections: [{key, label, icon, w, fields | reuse | note}], order, hidden}) */
    PF.lite = spec => {
        const key = spec.key, kind = `profile_${key}`;
        Object.keys(ART.pageSections).filter(k => k.startsWith(`${key}__`)).forEach(k => delete ART.pageSections[k]); // un profil redéfini (le sien, modifié)
        const groups = spec.sections.filter(s => s.fields?.length).map(s => ({key: s.key, label: s.label, icon: s.icon || '', zone: 'main', fields: s.fields}));
        ART.define({key: kind, icon: spec.icon || '✦', label: `Profil : ${spec.label}`, many: 'Profils', fem: false, domain: 'profile', hidden: true, linked: false, profile: key,
            eyebrow: () => `${spec.icon || ''} Profil · ${spec.label}`, newData: st => ({title: `${spec.label} — ${st.name}`}),
            groups: [{key: 'main', label: 'Le profil', icon: spec.icon || '', zone: 'main', fields: [{key: 'title', label: 'En une ligne', type: 'text', star: true, ph: `ex. « ${spec.ph || spec.label} »`}]}, ...groups,
                {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}]});
        const secKeys = [];
        spec.sections.forEach(s => {
            if (s.reuse) { secKeys.push(s.reuse); return; }
            const sk = `${key}__${s.key}`; secKeys.push(sk);
            ART.pageSections[sk] = {icon: s.icon || '✦', label: s.label, w: s.w || '½', profile: key, render: C => {
                const st = C.store, it = st.of(kind)[0], fs = s.fields || [];
                const extra = s.note ? `<p class="pf-note">${esc(s.note)}${s.person ? ` <button type="button" class="ar-linkbtn" data-ar-person="${st.pid}">↗ Ouvrir la fiche</button>` : ''}</p>` : '';
                if (!it) return {body: `${PF.muted(s.empty || 'Rien de noté pour l’instant : « … » pour l’écrire.')}${extra}`, actions: fs.length ? PF.editBtn(key) : '', empty: !s.note};
                const ctx = ART.ctx(st, it);
                const parts = fs.map(f => { const h = ART.read(ctx, it, f); return h ? (fs.length > 1 ? `<div class="pf-fl"><small class="ar-g">${esc(f.label)}</small>${h}</div>` : h) : ''; }).filter(Boolean);
                const n = fs.filter(f => f.type === 'rows').reduce((t, f) => t + (Array.isArray(it.data?.[f.key]) ? it.data[f.key].length : 0), 0);
                return {body: (parts.join('') || PF.muted('Rien de noté : « … » pour l’écrire.')) + extra, count: n || '', empty: !parts.length && !s.note, actions: fs.length ? PF.editBtn(key) : ''};
            }};
        });
        const prev = ART.profiles[key];
        ART.profiles[key] = {key, label: spec.label, icon: spec.icon || '✦', color: spec.color || '', group: spec.group || (spec.user ? 'mine' : 'autre'), desc: spec.desc || '', type: kind, lite: true, user: !!spec.user, def: spec.def || null,
            sections: secKeys, models: {base: {label: spec.label, order: spec.order || secKeys, hidden: spec.hidden || []}}, defaultModel: () => 'base',
            timeline: C => { const it = C.store.of(kind)[0]; if (!it) return []; const out = [];
                groups.forEach(g => g.fields.filter(f => f.type === 'rows' && (f.cols || []).some(c => c.key === 'from')).forEach(f => { const bars = (it.data?.[f.key] || []).map(r => { const sp = PF.span(r.from, r.to); if (!sp) return null; const c0 = (f.cols || []).find(c => !['from', 'to'].includes(c.key)); return {a: sp[0], b: sp[1], text: c0 ? (c0.type ? ART.cellText(c0, r[c0.key]) : String(r[c0.key] || '')) : ''}; }).filter(Boolean); if (bars.length) out.push({label: `${g.icon || ''} ${f.label}`.trim(), bars}); }));
                return out; }};
        if (prev && !prev.lite) Object.assign(ART.profiles[key], prev); // un vrai profil d'un outil garde la main
    };
    const NOTE_BLOCS = 'Décorations, prix, concours : bloc commun « 🏆 Concours et récompenses ». Diplômes : « 🎓 Diplômes et formation ».';
    const generic = (key, label, icon, group, desc, what = 'Fonction, poste', ph = '') => PF.lite({key, label, icon, group, desc, ph, sections: [
        {key: 'career', label: 'Parcours', icon: '🧭', w: 'ligne', fields: [rowsF('career', 'Parcours', [C_('what', what, 'l'), C_('org', 'Où, chez qui', 'm'), C_('place', 'Lieu', 'm', {type: 'place'}), ...FROMTO, C_('note', 'Note', 'm')], 'Une étape')]},
        {key: 'people', label: 'Personnes liées', icon: '👥', w: '⅓', fields: [{key: 'people', label: 'Personnes liées', type: 'people', star: true, rolePh: 'rôle (associé, maître, élève…)'}]},
        {key: 'docs', label: 'Documents et photos', icon: '🖼', w: '⅓', fields: [{key: 'photos', label: 'Documents et photos', type: 'photos', star: true, labels: [['doc', 'Document'], ['photo', 'Photo'], ['autre', 'Autre']]}]}]});

    // 🎖 Armes et courage
    PF.lite({key: 'military', label: 'Militaire · ancien combattant', icon: '🎖', group: 'armes', color: '#6b7280', desc: 'unités, grades, campagnes, blessures, lettres du front', ph: 'Sergent au 126e RI, 1914-1918', sections: [
        {key: 'service', label: 'Service et unités', icon: '🎖', w: 'ligne', note: 'Le registre matricule et les fiches militaires (« 🎖️ Poilu 14-18 », « ✊ Résistant »…) restent sur la fiche de la personne.', person: true, fields: [
            {key: 'matricule', label: 'Matricule, classe, bureau de recrutement', type: 'text', star: true, ph: 'n° 1234 · classe 1912 · Tulle'},
            rowsF('units', 'Unités et grades', [C_('unit', 'Unité', 'l'), C_('grade', 'Grade', 'm'), ...FROMTO, C_('place', 'Garnison, lieu', 'm', {type: 'place'})], 'Une unité')]},
        {key: 'campaigns', label: 'Campagnes', icon: '🗺', w: '½', fields: [rowsF('campaigns', 'Campagnes', [C_('campaign', 'Campagne, front', 'l'), ...FROMTO, C_('note', 'Note', 'm')], 'Une campagne')]},
        {key: 'wounds', label: 'Blessures, citations', icon: '🩹', w: '½', fields: [rowsF('wounds', 'Blessures', [C_('date', 'Date', 's'), C_('what', 'Blessure, maladie', 'l'), C_('place', 'Où', 'm', {type: 'place'})], 'Une blessure'), {key: 'citations', label: 'Citations', type: 'longtext', star: true}]},
        {key: 'letters', label: 'Lettres du front', icon: '✉️', w: '⅓', note: NOTE_BLOCS, fields: [{key: 'letters', label: 'Lettres du front', type: 'photos', star: true, labels: [['lettre', 'Lettre'], ['carte', 'Carte postale'], ['photo', 'Photo']]}]}]});
    PF.lite({key: 'resistant', label: 'Résistant', icon: '✊', group: 'armes', color: '#d0182f', desc: 'réseaux, pseudonymes, actions, arrestation, homologation', sections: [
        {key: 'networks', label: 'Réseaux et mouvements', icon: '✊', w: '½', note: 'Le bloc « ✊ Résistant » de la fiche garde ses propres données.', person: true, fields: [rowsF('networks', 'Réseaux, mouvements', [C_('net', 'Réseau, mouvement', 'l'), C_('role', 'Rôle', 'm'), ...FROMTO], 'Un réseau'), {key: 'aliases', label: 'Pseudonymes', type: 'text', star: true}]},
        {key: 'actions', label: 'Actions', icon: '💥', w: '½', fields: [rowsF('actions', 'Actions', [C_('date', 'Date', 's'), C_('what', 'Action', 'l'), C_('place', 'Lieu', 'm', {type: 'place'})], 'Une action')]},
        {key: 'arrest', label: 'Arrestation, déportation', icon: '⛓', w: '⅓', fields: [rowsF('arrest', 'Arrestation', [C_('date', 'Date', 's'), C_('place', 'Lieu', 'm', {type: 'place'}), C_('what', 'Suite', 'l')], 'Une étape'), {key: 'homolog', label: 'Homologation (FFI, FFC, RIF, n°)', type: 'text', star: true}]}]});
    PF.lite({key: 'rescuer', label: 'Sauveteur · pompier', icon: '🚒', group: 'armes', desc: 'corps, grades, interventions, sauvetages', sections: [
        {key: 'corps', label: 'Corps et grades', icon: '🚒', w: '½', fields: [rowsF('corps', 'Corps et grades', [C_('corps', 'Corps, centre', 'l'), C_('grade', 'Grade', 'm'), ...FROMTO], 'Un corps')]},
        {key: 'rescues', label: 'Interventions et sauvetages', icon: '🛟', w: '½', note: NOTE_BLOCS, fields: [rowsF('rescues', 'Interventions', [C_('date', 'Date', 's'), C_('what', 'Intervention, sauvetage', 'l'), C_('place', 'Lieu', 'm', {type: 'place'}), C_('who', 'Personne sauvée', 'm', {type: 'person'})], 'Une intervention')]}]});
    generic('police', 'Gendarme · policier', '👮', 'armes', 'brigades, grades, affaires', 'Brigade, commissariat, grade');
    // 🐄 Travail
    PF.lite({key: 'farmer', label: 'Agriculteur · éleveur', icon: '🐄', group: 'travail', color: '#4d7c0f', desc: 'exploitation, surfaces, cheptel, coopératives', ph: 'Éleveur de limousines à Laguenne', sections: [
        {key: 'farm', label: 'Exploitation', icon: '🏡', w: 'ligne', fields: [rowsF('farm', 'Exploitations', [C_('name', 'Exploitation, ferme', 'l'), C_('place', 'Lieu', 'm', {type: 'place'}), ...FROMTO, C_('surface', 'Surface (ha)', 's'), C_('mode', 'Mode', 's', {type: 'select', choices: [['', '—'], ['proprietaire', 'propriétaire'], ['fermier', 'fermier'], ['metayer', 'métayer'], ['ouvrier', 'ouvrier agricole'], ['domestique', 'domestique']]})], 'Une exploitation'), {key: 'crops', label: 'Cultures, productions', type: 'text', star: true, ph: 'blé, seigle, châtaignes, vigne'}]},
        {key: 'herd', label: 'Cheptel', icon: '🐾', w: '½', fields: [rowsF('herd', 'Cheptel', [C_('kind', 'Espèce, race', 'm'), C_('n', 'Nombre', 's'), C_('year', 'Année', 's'), C_('animal', 'Fiche animal 🐾', 'm', {type: 'person'})], 'Une ligne')]},
        {key: 'coops', label: 'Coopératives, syndicats, mutuelle', icon: '🤝', w: '½', note: 'Concours agricoles : bloc commun « 🏆 Concours et récompenses ».', fields: [rowsF('coops', 'Coopératives', [C_('org', 'Coopérative, syndicat, mutuelle', 'l'), C_('role', 'Rôle', 'm'), ...FROMTO], 'Une ligne')]}]});
    PF.lite({key: 'entrepreneur', label: 'Entrepreneur · industriel', icon: '🏭', group: 'travail', desc: 'entreprises, associés, produits, marques, effectifs, bilans', sections: [
        {key: 'companies', label: 'Entreprises', icon: '🏭', w: 'ligne', fields: [rowsF('companies', 'Entreprises', [C_('name', 'Entreprise', 'l'), C_('role', 'Rôle (fondateur, gérant…)', 'm'), C_('place', 'Lieu', 'm', {type: 'place'}), ...FROMTO], 'Une entreprise'), {key: 'partners', label: 'Associés', type: 'people', star: true, rolePh: 'associé, gérant…'}]},
        {key: 'products', label: 'Produits et marques', icon: '🏷', w: '½', fields: [rowsF('products', 'Produits, marques', [C_('name', 'Produit, marque déposée', 'l'), C_('year', 'Année', 's'), C_('note', 'Note', 'm')], 'Un produit')]},
        {key: 'figures', label: 'Effectifs et bilans', icon: '📈', w: '½', fields: [rowsF('figures', 'Effectifs et bilans', [C_('year', 'Année', 's'), C_('staff', 'Effectif', 's'), C_('turnover', 'Chiffre d’affaires', 'm', {type: 'money'}), C_('result', 'Résultat', 'm', {type: 'money'})], 'Une année')]}]});
    generic('merchant', 'Commerçant · artisan', '🛒', 'travail', 'boutiques, ateliers, apprentis', 'Commerce, atelier, métier');
    generic('worker', 'Cheminot · ouvrier', '🚂', 'travail', 'postes, usines, dépôts', 'Poste, usine, dépôt');
    generic('emigrant', 'Émigré · expatrié', '🌍', 'travail', 'départs, pays, adresses, retours', 'Pays, ville, raison du départ');
    // 🩺 Savoir
    PF.lite({key: 'doctor', label: 'Médecin · soignant', icon: '🩺', group: 'savoir', desc: 'installations, hôpitaux, spécialités, épidémies', sections: [
        {key: 'practice', label: 'Installations et hôpitaux', icon: '🏥', w: 'ligne', note: 'Diplômes : bloc commun « 🎓 Diplômes et formation ».', fields: [rowsF('practice', 'Installations', [C_('what', 'Cabinet, hôpital, service', 'l'), C_('role', 'Poste', 'm'), C_('place', 'Lieu', 'm', {type: 'place'}), ...FROMTO], 'Une installation'), {key: 'specialties', label: 'Spécialités', type: 'text', star: true}]},
        {key: 'epidemics', label: 'Épidémies, patientèle', icon: '🦠', w: '½', fields: [rowsF('epidemics', 'Épidémies', [C_('year', 'Année', 's'), C_('what', 'Épidémie, campagne', 'l'), C_('place', 'Lieu', 'm', {type: 'place'})], 'Une ligne'), {key: 'patients', label: 'Patientèle', type: 'longtext', star: true}]}]});
    PF.lite({key: 'teacher', label: 'Enseignant', icon: '👩‍🏫', group: 'savoir', desc: 'postes, classes, matières, élèves, inspections', sections: [
        {key: 'posts', label: 'Postes', icon: '🏫', w: 'ligne', fields: [rowsF('posts', 'Postes', [C_('school', 'École, collège', 'l'), C_('place', 'Lieu', 'm', {type: 'place'}), C_('class', 'Classe, matière', 'm'), ...FROMTO], 'Un poste')]},
        {key: 'pupils', label: 'Élèves', icon: '🧒', w: '½', fields: [{key: 'pupils', label: 'Élèves', type: 'people', star: true, rolePh: 'élève (1932)'}, {key: 'class_photos', label: 'Photos de classe', type: 'photos', star: true}]},
        {key: 'inspections', label: 'Inspections', icon: '📋', w: '½', fields: [rowsF('inspections', 'Inspections', [C_('date', 'Date', 's'), C_('who', 'Inspecteur', 'm', {type: 'person'}), C_('note', 'Appréciation', 'l')], 'Une inspection')]}]});
    generic('jurist', 'Juriste · magistrat', '⚖️', 'savoir', 'tribunaux, études, charges', 'Charge, tribunal, étude');
    generic('collector', 'Collectionneur · érudit', '📚', 'savoir', 'collections, sociétés savantes, publications', 'Collection, société savante');
    // 🗳 Vie publique (politique et élu local : heritage-profils-politique.js)
    PF.lite({key: 'clergy', label: 'Religieux · clergé', icon: '⛪', group: 'public', desc: 'ordination, vœux, ordre, paroisses, missions', sections: [
        {key: 'orders', label: 'Ordination, vœux, ordre', icon: '⛪', w: '½', fields: [{key: 'ordination', label: 'Ordination, vœux', type: 'text', star: true, ph: 'prêtre le 29 juin 1931 à Tulle'}, {key: 'order', label: 'Ordre, congrégation, diocèse', type: 'text', star: true}]},
        {key: 'charges', label: 'Paroisses et charges', icon: '📍', w: '½', fields: [rowsF('charges', 'Paroisses et charges', [C_('charge', 'Charge (curé, vicaire…)', 'm'), C_('place', 'Paroisse', 'm', {type: 'place'}), ...FROMTO], 'Une charge')]},
        {key: 'missions', label: 'Missions', icon: '🌍', w: '⅓', fields: [rowsF('missions', 'Missions', [C_('what', 'Mission', 'l'), C_('place', 'Où', 'm', {type: 'place'}), ...FROMTO], 'Une mission')]}]});
    generic('unionist', 'Syndicaliste · militant', '✊', 'public', 'syndicats, grèves, mandats', 'Syndicat, mouvement, mandat');
    generic('volunteer', 'Bénévole · associatif', '🤝', 'public', 'associations, rôles, actions', 'Association, rôle');
    generic('diplomat', 'Diplomate · fonctionnaire', '🕊', 'public', 'postes, ambassades, préfectures', 'Poste, administration');
    // ✍️ Création, 🧭 aventure
    generic('writer', 'Écrivain · journaliste', '✍️', 'creation', 'journaux, rubriques, pseudonymes', 'Journal, revue, rubrique');
    generic('photographer', 'Photographe', '📷', 'creation', 'studios, reportages, fonds', 'Studio, agence, reportage');
    generic('architect', 'Architecte', '🏛', 'creation', 'agences, chantiers, concours', 'Agence, chantier');
    generic('aviator', 'Aviateur · marin', '✈️', 'aventure', 'brevets, appareils, navires, traversées', 'Appareil, navire, ligne');
    PF.lite({key: 'alpinist', label: 'Alpiniste', icon: '🏔', group: 'aventure', desc: 'sommets, voies, cotations, cordées, premières', sections: [
        {key: 'ascents', label: 'Ascensions', icon: '🏔', w: 'ligne', fields: [rowsF('ascents', 'Ascensions', [C_('date', 'Date', 's'), C_('summit', 'Sommet', 'm'), C_('route', 'Voie', 'm'), C_('grade', 'Cotation', 's'), C_('rope', 'Cordée', 'm'), C_('first', 'Première', 's', {type: 'bool'})], 'Une ascension')]}]});

    /* ═════════ Les profils de l'utilisateur (dans la base : profiles, origin 'user') ═════════ */
    const userSection = (s, i) => {
        if (s.reuse) return {reuse: String(s.reuse)};
        const key = /^[a-z][a-z0-9_]{0,30}$/.test(s.key || '') ? s.key : `s${i}`, label = String(s.label || 'Section').slice(0, 60);
        const f = s.kind === 'rows' ? rowsF(key, label, (Array.isArray(s.cols) && s.cols.length ? s.cols : ['Quoi', 'De', 'À']).slice(0, 8).map((c, j) => ({key: /^(de|du)$/i.test(c) ? 'from' : /^(à|a|au|jusqu’à)$/i.test(c) ? 'to' : `c${j}`, label: String(c).slice(0, 40), w: j ? 's' : 'l'})))
            : s.kind === 'items' ? {key, label, type: 'items', star: true, kinds: (s.kinds || []).filter(k => ART.defs[k])}
                : s.kind === 'photos' ? {key, label, type: 'photos', star: true} : {key, label, type: 'longtext', star: true};
        return {key, label, icon: s.icon || '✎', w: s.w || '½', fields: [f]};
    };
    PF.loadDefs = defs => (Array.isArray(defs) ? defs : []).forEach(d => {
        PF.counts[d.key] = d.count || 0;
        if (d.origin !== 'user') return;
        const def = d.def && typeof d.def === 'object' ? d.def : {};
        try { PF.lite({key: d.key, label: d.label, icon: d.icon, color: def.color, group: 'mine', user: true, desc: 'ton profil', def: {...def, label: d.label, icon: d.icon}, sections: (def.sections || []).map(userSection), order: def.order}); } catch (e) { console.error(e); }
    });
    let defsAt = 0;
    PF.refreshDefs = async (force = false) => {
        if (!force && Date.now() - defsAt < 30000) return;
        try { const r = await A().api('art', {op: 'profiles', person_id: 0}); PF.loadDefs(r.defs); if (r.prof_colors && typeof r.prof_colors === 'object') PF.profColors = r.prof_colors; defsAt = Date.now(); } catch (_) {}
    };
    // la boutique du catalogue charge aussi les profils de l'utilisateur
    if (ART.Store && !ART.Store.prototype._pfWrapped) {
        const load0 = ART.Store.prototype.load;
        ART.Store.prototype.load = async function () { await PF.refreshDefs(); this._pfLater = {}; this._pfDetail = null; this._pfLoading = null; const r = await load0.call(this); PF.profColors = {...(this.global?.ppage?.profColors || {})}; return r; };
        ART.Store.prototype._pfWrapped = true;
    }

    /* ═════════ Enregistrer une fiche d'un autre profil : pas de « Cocher Artiste ? » ═════════ */
    const save0 = ART.saveItem;
    /** les profils qui peuvent porter une sorte (comme $GLOBALS['ART_EXTRA_TYPES'] côté serveur) : le premier est celui qu'on propose */
    const SHARED = {tour: ['artist', 'actor'], stage_piece: ['artist', 'actor'], series: ['artist', 'actor'], season: ['artist', 'actor'], episode: ['artist', 'actor']};
    PF.kindProfiles = kind => {
        if (ART.profiles.artisan?.craftKinds?.includes(kind)) return ['artisan', 'artist']; // une pièce de métier d'art : « Artisan d'art » d'abord
        if (SHARED[kind]) return SHARED[kind];
        if (Array.isArray(ART.defs[kind]?.profiles)) return ART.defs[kind].profiles;
        const p = PF.kindProfile(kind); return p ? [p] : [];
    };
    ART.saveItem = async (store, kind, id, data) => {
        const profs = PF.kindProfiles(kind);
        if (!profs.length || (profs.length === 1 && profs[0] === 'artist') || ART.sci?.KIND_PROFILE?.[kind]) return save0(store, kind, id, data); // sciences : leur propre question (heritage-sciences.js)
        if (profs.length > 1) { // plusieurs profils possibles : on propose le bon s'il n'y en a aucun (pas « Artiste » pour une ferronnerie)
            const have = (store.person.profiles || []).map(p => p.profile_key);
            if (Number(store.person.is_artist)) have.push('artist');
            if (!profs.some(k => have.includes(k))) {
                const P = ART.profiles[profs[0]] || {label: profs[0], icon: '✦'}, def = ART.defs[kind] || {};
                const ok = await A().confirmBox(`La fiche de ${store.name} n’est pas encore cochée « ${P.label} ». La cocher pour y ranger ${def.fem ? 'cette' : 'ce'} ${String(def.label || 'fiche').toLowerCase()} ?`, {title: `${P.icon} Cocher « ${P.label} » ?`, okLabel: `Cocher « ${P.label} »`});
                if (!ok) throw new Error('');
                await ART.write('set_profile', {person_id: store.pid, profile: profs[0], on: 1, label: P.label, icon: P.icon});
                store.person.profiles = [...(store.person.profiles || []), {profile_key: profs[0], item_id: null}];
                if (profs[0] === 'artist') store.person.is_artist = 1;
            }
        }
        const pf = ART.defs[kind]?.parentField, parent_id = pf ? (U.ref(data[pf])?.iid || 0) : 0;
        const r = await ART.write('save_item', {person_id: store.pid, kind, id: id || 0, data, parent_id});
        return r.id;
    };
    // les fiches de profil ne sont pas des onglets de listes
    const tabKinds0 = ART.tabKinds;
    ART.tabKinds = store => tabKinds0(store).filter(k => !String(k).startsWith('profile_')); // les sortes des profils cochés : ART.profiles[k].kinds
    [['politic', '🗳 Politique'], ['sport', '🏅 Sport']].forEach(d => { if (!ART.DOMAINS.some(x => x[0] === d[0])) ART.DOMAINS.splice(ART.DOMAINS.length - 1, 0, d); });

    /* ═════════ AA · La fenêtre « 🧩 Profils de … » ═════════ */
    let CHOOSER = null;
    PF.openChooser = async (pid, {name = '', onDone = null} = {}) => {
        if (CHOOSER?.isConnected) CHOOSER.close();
        let cur = [];
        try { const r = await A().api('art', {op: 'profiles', person_id: pid}); cur = (r.profiles || []).map(p => p.key); PF.loadDefs(r.defs); defsAt = Date.now(); } catch (e) { toast(e.message, 'error'); return; }
        const picked = new Set(cur);
        const dlg = document.createElement('dialog'); dlg.className = 'modal pf-dlg'; CHOOSER = dlg;
        dlg.innerHTML = `<form method="dialog" class="pf-form"><div class="modal-head"><div><span class="eyebrow">CETTE PERSONNE ÉTAIT…</span><h2>🧩 Profils de ${esc(name || 'cette personne')}</h2><small class="muted">Coche ce qui la décrit ; tu pourras régler les sections de chacun.</small></div><button class="icon-button" type="button" data-pf-x aria-label="Fermer">×</button></div>
            <div class="pf-cbody"><input type="search" data-pf-q placeholder="Chercher un profil… (sportif, maire, médecin)" aria-label="Chercher un profil"><div class="pf-voc" data-pf-voc></div></div>
            <div class="modal-actions"><button type="button" class="button secondary" data-pf-create>✎ Créer mon propre profil…</button><span class="spacer"></span><button type="button" class="button secondary" data-pf-x>Annuler</button><button type="submit" class="button">Appliquer</button></div></form>`;
        document.body.appendChild(dlg);
        const voc = dlg.querySelector('[data-pf-voc]'), q = dlg.querySelector('[data-pf-q]');
        const hl = (t, w) => { const s = esc(t); if (!w) return s; const i = fold(t).indexOf(fold(w)); return i < 0 || fold(t).length !== String(t).length ? s : `${esc(t.slice(0, i))}<mark>${esc(t.slice(i, i + w.length))}</mark>${esc(t.slice(i + w.length))}`; };
        function paint() {
            const w = q.value.trim(), all = PF.all(), match = p => !w || fold(`${p.label} ${p.desc || ''} ${PF.GROUPS.find(g => g[0] === p.group)?.[1] || ''}`).includes(fold(w));
            const html = PF.GROUPS.map(([g, gl]) => { const l = all.filter(p => p.group === g && match(p)).sort((a, b) => a.label.localeCompare(b.label, 'fr')); if (!l.length && !(g === 'mine' && !w)) return '';
                return `<div class="pf-vg ${g === 'mine' ? 'is-mine' : ''}"><div class="pf-grp">${esc(gl)}</div>${l.map(p => `<label class="pf-ck" title="${esc(p.desc || '')}" style="--pf:${esc(/^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : PF.color(p.key))}"><input type="checkbox" value="${esc(p.key)}" ${picked.has(p.key) ? 'checked' : ''}><span class="pf-ic">${esc(p.icon)}</span><span class="pf-lb">${hl(p.label, w)}${p.desc ? `<small>${esc(p.desc)}</small>` : ''}</span>${p.user ? `<span class="pf-tools"><button type="button" class="icon-button small" data-pf-editdef="${esc(p.key)}" title="Modifier ce profil">✎</button><button type="button" class="icon-button small" data-pf-deldef="${esc(p.key)}" title="Supprimer ce profil">🗑</button></span>` : ''}</label>`).join('')}${g === 'mine' && !l.length ? '<p class="muted pf-small">Aucun pour l’instant : « ✎ Créer mon propre profil… ».</p>' : ''}</div>`; }).join('');
            voc.innerHTML = html.replace(/<div class="pf-vg is-mine"><div class="pf-grp">[^<]*<\/div><p[^>]*>[^<]*<\/p><\/div>/, w ? '' : '$&') || `<p class="pf-none">Aucun profil pour « ${esc(w)} ». Vérifie l’orthographe, ou : <button type="button" class="ar-linkbtn" data-pf-create>✎ Créer le profil « ${esc(w.slice(0, 60))} »</button></p>`;
        }
        paint();
        q.addEventListener('input', paint);
        q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const w = fold(q.value), l = [...voc.querySelectorAll('input[type=checkbox]:not(:checked)')], b = l.find(c => fold(ART.profiles[c.value]?.label).includes(w)) || l[0]; if (b) { b.checked = true; picked.add(b.value); } } }); // Entrée : le premier dont le NOM correspond
        voc.addEventListener('change', e => { const c = e.target.closest('input[type=checkbox]'); if (!c) return; if (c.checked) picked.add(c.value); else picked.delete(c.value); });
        dlg.addEventListener('close', () => { dlg.remove(); if (CHOOSER === dlg) CHOOSER = null; });
        dlg.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.hasAttribute('data-pf-x')) { e.preventDefault(); dlg.close(); return; }
            if (b.hasAttribute('data-pf-create')) { e.preventDefault(); const k = await PF.openWizard({label: q.value.trim()}); if (k) { picked.add(k); q.value = ''; paint(); } return; }
            if (b.dataset.pfEditdef) { e.preventDefault(); e.stopPropagation(); await PF.openWizard({key: b.dataset.pfEditdef}); paint(); return; }
            if (b.dataset.pfDeldef) { e.preventDefault(); e.stopPropagation(); const k = b.dataset.pfDeldef;
                try { const r = await ART.write('delete_profile_def', {key: k}); delete ART.profiles[k]; picked.delete(k); paint();
                    A().undoToast(`Profil « ${r.profile.label} » supprimé`, {undo: async () => { await ART.write('save_profile_def', {key: r.profile.key, label: r.profile.label, icon: r.profile.icon, def: r.profile.def}); await PF.refreshDefs(true); paint(); }, redo: async () => { await ART.write('delete_profile_def', {key: k}); delete ART.profiles[k]; paint(); }});
                } catch (er) { toast(er.message, 'error'); } return; }
        });
        dlg.querySelector('form').addEventListener('submit', async e => {
            e.preventDefault();
            const btn = dlg.querySelector('[type=submit]'); if (btn.disabled) return; btn.disabled = true;
            const order = [...cur.filter(k => picked.has(k)), ...[...picked].filter(k => !cur.includes(k))];
            const meta = k => { const p = ART.profiles[k] || {}; return {key: k, label: p.label || k, icon: p.icon || ''}; };
            const off = cur.filter(k => !picked.has(k));
            try {
                const r = await ART.write('set_profiles', {person_id: pid, on: order.map(meta), off});
                dlg.close();
                const added = order.filter(k => !cur.includes(k)), msg = added.length || off.length ? `Profils de ${name || 'la fiche'} : ${[added.length && `＋ ${added.map(k => ART.profiles[k]?.label || k).join(', ')}`, off.length && `− ${off.map(k => ART.profiles[k]?.label || k).join(', ')}`].filter(Boolean).join(' · ')}` : 'Profils enregistrés';
                const back = async () => { const r2 = await ART.write('set_profiles', {person_id: pid, on: cur.map(meta), off: order.filter(k => !cur.includes(k))}); await onDone?.(r2.profiles); };
                A().undoToast(msg, {undo: back, redo: async () => { const r3 = await ART.write('set_profiles', {person_id: pid, on: order.map(meta), off}); await onDone?.(r3.profiles); }});
                await onDone?.(r.profiles);
            } catch (er) { btn.disabled = false; toast(er.message, 'error', {retry: () => dlg.querySelector('form').requestSubmit()}); }
        });
        dlg.showModal(); q.focus();
        return dlg;
    };

    /* ═════════ AA · « ✎ Créer un profil » : 1 · Nom, 2 · Sections, 3 · Page ═════════ */
    const KIND_LABEL = {rows: '📋 tableau', items: '📎 fiches liées', photos: '🖼 images', text: '¶ texte'};
    PF.openWizard = ({key = '', label = ''} = {}) => new Promise(resolve => {
        const old = key ? ART.profiles[key] : null, od = old?.def || {};
        const W = {step: 1, label: old?.label || label || '', icon: old?.icon || '✦', color: old?.color || '#7b2ff7',
            reuse: (od.sections || []).filter(s => s.reuse).map(s => s.reuse),
            mine: (od.sections || []).filter(s => !s.reuse).map(s => ({key: s.key, label: s.label, kind: s.kind || 'text', cols: (s.cols || []).join(' · '), kinds: s.kinds || []})), order: od.order || []};
        if (!W.mine.length && !old) W.mine.push({key: '', label: '', kind: 'rows', cols: 'Quoi · De · À', kinds: []});
        let result = null;
        const dlg = document.createElement('dialog'); dlg.className = 'modal pf-dlg pf-wiz';
        const reusable = () => Object.entries(ART.pageSections).filter(([k, s]) => !['pf_frise', 'pf_identity'].includes(k) && !(key && k.startsWith(`${key}__`)) && !s.custom).map(([k, s]) => ({k, s, from: s.profile === 'common' ? 'Commun' : (ART.profiles[s.profile || 'artist']?.label || '')})).filter(x => x.from);
        const kinds = () => Object.values(ART.defs).filter(d => !d.hidden && d.domain !== 'profile').sort((a, b) => String(a.many).localeCompare(String(b.many), 'fr'));
        const ICONS = ['🎺', '🐝', '🎣', '⛵', '🚜', '🧵', '🍷', '🎯', '🕯', '🧀', '📮', '🚲'];
        function grab() {
            const f = dlg.querySelector('form');
            if (W.step === 1) { W.label = f.elements.label.value.trim(); W.icon = f.elements.icon.value.trim() || '✦'; W.color = f.elements.color.value || '#7b2ff7'; }
            if (W.step === 2) {
                W.reuse = [...dlg.querySelectorAll('[data-w-reuse]:checked')].map(c => c.value);
                W.mine = [...dlg.querySelectorAll('[data-w-sec]')].map(r => ({key: r.dataset.key || '', label: r.querySelector('[data-w-l]').value.trim(), kind: r.querySelector('[data-w-k]').value, cols: r.querySelector('[data-w-c]')?.value || '', kinds: r.querySelector('[data-w-kinds]')?.value ? [r.querySelector('[data-w-kinds]').value] : []})).filter(s => s.label);
            }
        }
        const secList = () => { const keys = W.reuse.map(k => ({k, label: `${ART.pageSections[k]?.icon || ''} ${ART.pageSections[k]?.label || k}`, from: ART.profiles[ART.pageSections[k]?.profile || 'artist']?.label || 'Commun'})).concat(W.mine.map((s, i) => ({k: `mine:${s.key || i}`, label: `✎ ${s.label}`, from: 'à toi'})));
            const pos = new Map(W.order.map((k, i) => [k, i])); return keys.sort((a, b) => (pos.has(a.k) ? pos.get(a.k) : 999) - (pos.has(b.k) ? pos.get(b.k) : 999)); };
        function paint() {
            const step = W.step;
            const body = step === 1 ? `<label class="pf-fld">Nom du profil<input name="label" maxlength="60" value="${esc(W.label)}" placeholder="Musicien de fanfare, apiculteur…" required></label>
                <div class="pf-row2"><label class="pf-fld">Icône<input name="icon" maxlength="8" value="${esc(W.icon)}" class="pf-icon-in"></label><label class="pf-fld">Couleur<input type="color" name="color" value="${esc(W.color)}"></label></div>
                <div class="pf-icons">${ICONS.map(i => `<button type="button" class="pf-ib" data-w-icon="${i}">${i}</button>`).join('')}</div>`
                : step === 2 ? `<b class="pf-sub">Sections reprises d’autres profils</b><div class="pf-lib">${reusable().map(x => `<label><input type="checkbox" data-w-reuse value="${esc(x.k)}" ${W.reuse.includes(x.k) ? 'checked' : ''}> ${esc(x.s.icon || '')} ${esc(x.s.label)} <small>${esc(x.from)}</small></label>`).join('')}</div>
                <b class="pf-sub">Mes sections (avec mes champs)</b><div data-w-mine>${W.mine.map((s, i) => `<div class="pf-cf" data-w-sec data-key="${esc(s.key)}"><input class="ar-in" data-w-l value="${esc(s.label)}" placeholder="Nom (ex. Instruments joués)" maxlength="60"><select class="ar-in" data-w-k>${Object.entries(KIND_LABEL).map(([k, l]) => `<option value="${k}" ${s.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
                    ${s.kind === 'rows' ? `<input class="ar-in" data-w-c value="${esc(s.cols)}" placeholder="colonnes : instrument · de · à">` : s.kind === 'items' ? `<select class="ar-in" data-w-kinds>${kinds().map(d => `<option value="${esc(d.key)}" ${(s.kinds || [])[0] === d.key ? 'selected' : ''}>→ ${esc(d.icon)} ${esc(d.many)}</option>`).join('')}</select>` : '<span></span>'}<button type="button" class="icon-button small" data-w-del="${i}" title="Retirer">✕</button></div>`).join('')}</div>
                <button type="button" class="button small secondary" data-w-add>＋ Ajouter une section</button>`
                : `<p class="pf-small">L’ordre de départ de la page (⚙️ Organiser la page le change ensuite, personne par personne).</p><div class="ar-plist">${secList().map((x, i, l) => `<div class="ar-fr" data-w-o="${esc(x.k)}"><span class="ar-grip">⠿</span><span></span><span class="lbl">${esc(x.label)} <small class="ar-g">${esc(x.from)}</small></span><span></span><span class="tools"><button type="button" data-w-mv="-1" ${i ? '' : 'disabled'} title="Monter">↑</button><button type="button" data-w-mv="1" ${i < l.length - 1 ? '' : 'disabled'} title="Descendre">↓</button></span></div>`).join('') || '<p class="muted">Aucune section : reviens à l’étape 2.</p>'}</div>`;
            dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">✎ ${old ? 'MODIFIER' : 'CRÉER'} UN PROFIL</span><h2>${esc(W.icon)} ${esc(W.label || 'Mon profil')}</h2></div><button class="icon-button" type="button" data-w-x aria-label="Fermer">×</button></div>
                <div class="pf-steps">${['1 · Nom', '2 · Sections', '3 · Page'].map((s, i) => `<span class="${i + 1 < step ? 'dn' : i + 1 === step ? 'on' : ''}">${s}</span>`).join('')}</div>
                <div class="pf-wbody">${body}<p class="pf-note">Un profil = un nom + une icône + une couleur + des sections (reprises ou tiennes) + un ordre de départ.</p></div>
                <div class="modal-actions">${step > 1 ? '<button type="button" class="button secondary" data-w-prev>← Retour</button>' : ''}<span class="spacer"></span><button type="button" class="button secondary" data-w-x>Annuler</button><button type="submit" class="button">${step < 3 ? 'Suivant →' : old ? 'Enregistrer' : 'Créer le profil'}</button></div></form>`;
            setTimeout(() => dlg.querySelector('input:not([type=checkbox]):not([type=color])')?.focus(), 20);
        }
        dlg.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.hasAttribute('data-w-x')) { e.preventDefault(); dlg.close(); return; }
            if (b.dataset.wIcon) { dlg.querySelector('[name=icon]').value = b.dataset.wIcon; return; }
            if (b.hasAttribute('data-w-prev')) { grab(); W.step--; paint(); return; }
            if (b.hasAttribute('data-w-add')) { grab(); W.mine.push({key: '', label: '', kind: 'rows', cols: 'Quoi · De · À', kinds: []}); paint(); setTimeout(() => [...dlg.querySelectorAll('[data-w-l]')].pop()?.focus(), 30); return; }
            if (b.dataset.wDel) { grab(); const i = Number(b.dataset.wDel); W.mine.splice(i, 1); paint(); return; }
            if (b.dataset.wMv) { const k = b.closest('[data-w-o]').dataset.wO, l = secList().map(x => x.k), i = l.indexOf(k), j = i + Number(b.dataset.wMv); if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; W.order = l; paint(); }
        });
        dlg.addEventListener('change', e => { if (e.target.matches('[data-w-k]')) { grab(); paint(); } });
        dlg.addEventListener('submit', async e => {
            e.preventDefault(); if (dlg._busy) return; grab(); // un seul profil créé, même avec Entrée répétée
            if (W.step === 1 && !W.label) { toast('Donne un nom à ce profil.', 'error'); return; }
            if (W.step === 2 && !W.reuse.length && !W.mine.length) { toast('Choisis au moins une section (reprise ou à toi).', 'error'); return; }
            if (W.step < 3) { W.step++; paint(); return; }
            const used = new Set();
            const mine = W.mine.map((s, i) => { let k = s.key || `s_${U.slug(s.label).slice(0, 24)}`; while (used.has(k)) k += '_'; used.add(k); return {key: k, label: s.label, kind: s.kind, cols: s.kind === 'rows' ? s.cols.split(/\s*[·,;|]\s*/).filter(Boolean).slice(0, 8) : [], kinds: s.kinds, w: s.kind === 'rows' ? 'ligne' : '½', _i: i}; });
            const order = secList().map(x => x.k.startsWith('mine:') ? mine.find((m, i) => `mine:${W.mine[i].key || i}` === x.k)?.key : x.k).filter(Boolean);
            const sections = [...W.reuse.map(r => ({reuse: r})), ...mine.map(({_i, ...m}) => m)];
            const pos = new Map(order.map((k, i) => [k, i])); sections.sort((a, b) => (pos.get(a.reuse || a.key) ?? 99) - (pos.get(b.reuse || b.key) ?? 99));
            const btn = dlg.querySelector('[type=submit]'); btn.disabled = true; dlg._busy = true;
            try {
                const r = await ART.write('save_profile_def', {key: key || '', label: W.label, icon: W.icon, def: {color: W.color, group: 'mine', sections, order: sections.map(s => s.reuse || `${key || '?'}__${s.key}`)}});
                await PF.refreshDefs(true);
                if (!ART.profiles[r.key]) PF.loadDefs([{key: r.key, label: W.label, icon: W.icon, origin: 'user', def: {color: W.color, sections}}]);
                result = r.key; A().toast?.(`✓ Profil « ${W.label} » ${old ? 'enregistré' : 'créé'}`, 'success'); dlg.close();
            } catch (er) { btn.disabled = false; toast(er.message, 'error'); } finally { dlg._busy = false; }
        });
        dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
        document.body.appendChild(dlg); paint(); dlg.showModal();
    });

    /* ═════════ AA · Sur la fiche : le bloc « 🧩 Cette personne était… » et la ligne du formulaire ═════════ */
    const badge = (p, attrs = '') => `<span class="pf-b" style="${PF.vars(PF.color(p.key))}" ${attrs}>${esc(p.icon || ART.profiles[p.key]?.icon || '✦')} ${esc(ART.profiles[p.key]?.label || p.label || p.key)}</span>`;
    PF.badge = badge;
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.profiles = (index, detail, opts = {}) => {
        const p = detail.person; if (!p || p.kind === 'animal') return '';
        const list = Array.isArray(detail.heritage?.profiles) ? detail.heritage.profiles : (Number(p.is_artist) ? [{key: 'artist', label: 'Artiste', icon: '🎨'}] : []);
        const edit = Number(p.is_locked) || p.kiosk ? (() => '') : (opts.editOnly || (x => x)); // fiche verrouillée : pas de « Choisir ses profils… »
        const known = list.filter(x => ART.profiles[x.key] || x.label);
        const body = known.length ? `<div class="pf-badges">${known.map(x => `<button type="button" class="pf-b is-btn" style="${PF.vars(PF.color(x.key))}" data-pf-page-pid="${p.id}" data-pf-view="${esc(x.key)}" title="Ouvrir la page de ce profil">${esc(x.icon || ART.profiles[x.key]?.icon || '✦')} ${esc(ART.profiles[x.key]?.label || x.label || x.key)}</button>`).join('')}</div>
            <div class="ar-row"><button type="button" class="button small" data-pf-page-pid="${p.id}" data-pf-view="all">🧩 Ouvrir sa page</button>${edit(`<button type="button" class="button small secondary" data-pf-choose-pid="${p.id}">🧩 Choisir ses profils…</button>`)}</div>`
            : `<p class="muted pf-small">Artiste, sportif, élu, militaire, agriculteur, enseignant… : coche ce que cette personne était ; chaque profil ajoute ses sections à sa page.</p>${edit(`<div class="ar-row"><button type="button" class="button small secondary" data-pf-choose-pid="${p.id}">🧩 Choisir ses profils…</button></div>`)}`;
        return A().card(index, '🧩 Cette personne était…', known.length || '', `<div class="pf-block">${body}</div>`, 'span-12');
    };
    const nameOf = p => `${p?.first_name || ''} ${String(p?.last_name || '').toLocaleUpperCase('fr-FR')}`.trim();
    document.addEventListener('click', e => {
        const b = e.target.closest('[data-pf-choose-pid],[data-pf-page-pid]'); if (!b || b.closest('.ar-dlg')) return;
        e.preventDefault();
        const pid = Number(b.dataset.pfChoosePid || b.dataset.pfPagePid); if (!pid) return;
        const cur = A()?.state?.currentPerson?.person;
        if (b.dataset.pfChoosePid) PF.openChooser(pid, {name: Number(cur?.id) === pid ? nameOf(cur) : '', onDone: async () => { await ext.refreshView?.(); }});
        else PF.openPage(pid, b.dataset.pfView || 'all');
    });
    /** ouvrir la page d'une personne (tout mélangé, ou un profil) */
    PF.openPage = async (pid, view = 'all') => {
        const C = await ART.open(pid, {kind: 'page'}); if (!C) return null;
        C.S.pview = view; C.paint(true); return C;
    };
    // le formulaire « Modifier la personne » : à côté de « Artiste », la ligne des profils
    ext.afterPersonForm = ext.afterPersonForm || [];
    ext.afterPersonForm.push((form, p) => {
        form.querySelector('[data-pf-formrow]')?.remove();
        if (!p?.id || p.kind === 'animal') return;
        const line = form.querySelector('#person-artist-line'); if (!line) return;
        const row = document.createElement('div'); row.className = 'checkbox-line pf-formrow'; row.dataset.pfFormrow = '1';
        const draw = list => { row.innerHTML = `<span class="pf-fr-l">🧩 Cette personne était…</span><span class="pf-badges">${(list || []).filter(x => ART.profiles[x.key] || x.label).map(x => badge(x)).join('') || '<small class="muted">aucun profil coché</small>'}</span><button type="button" class="button small secondary" data-pf-formchoose>🧩 Profils…</button>`; };
        draw(A()?.state?.currentPerson?.heritage?.profiles || (Number(p.is_artist) ? [{key: 'artist'}] : []));
        line.after(row);
        row.addEventListener('click', e => { if (!e.target.closest('[data-pf-formchoose]')) return; e.preventDefault();
            PF.openChooser(Number(p.id), {name: nameOf(p), onDone: list => { draw(list); const cb = form.querySelector('#person-is-artist'), on = (list || []).some(x => x.key === 'artist'); if (cb && cb.checked !== on) { cb.checked = on; cb.dispatchEvent(new Event('change', {bubbles: true})); } }}); });
    });

    /* ═════════ R · La page d'une personne à plusieurs profils ═════════ */
    const WIDTH = {'ligne': 'w-12', '½': 'w-6', '⅓': 'w-4', '¼': 'w-3', '⅔': 'w-8', '¾': 'w-9'};
    /** la couleur d'un profil sur la page de cette personne (son réglage propre, sinon le standard) */
    PF.colorIn = (st, key) => { const c = (cfgOf(st).ppage || {}).profColors?.[key]; return /^#[0-9a-f]{6}$/i.test(c || '') ? c : PF.color(key); };
    const cfgOf = st => (st.personSet?.own ? st.personSet : st.global) || {};
    const tgtOf = st => { if (st.personSet?.own) return st.personSet; st.global = st.global || {}; return st.global; };
    PF.cfgOf = cfgOf; PF.tgtOf = tgtOf;
    const commonKeys = () => Object.entries(ART.pageSections).filter(([k, s]) => s.profile === 'common' && !['pf_frise', 'pf_identity'].includes(k)).map(([k]) => k);
    const ARTIST_MODEL = {musicien: 'musicien', chanteur: 'musicien', compositeur: 'musicien', chef: 'musicien', groupe: 'musicien', peintre: 'peintre', plasticien: 'peintre', ecrivain: 'ecrivain', poete: 'ecrivain', dramaturge: 'ecrivain', cineaste: 'cineaste', acteur: 'cineaste', videaste: 'cineaste', danseur: 'cineaste', photographe: 'photographe', sculpteur: 'sculpteur', architecte: 'architecte'};
    /** les sections d'un profil (clés), sans les communes */
    PF.sectionKeys = (st, pk) => {
        const P = ART.profiles[pk]; if (!P) return [];
        if (pk === 'artist') { const pc = cfgOf(st).page?.custom || []; return [...Object.entries(ART.pageSections).filter(([k, s]) => (s.profile || 'artist') === 'artist' && k !== 'links' && !k.startsWith('pf_')).map(([k]) => k), ...pc.map(c => c.key)]; }
        const own = P.sections || Object.entries(ART.pageSections).filter(([, s]) => s.profile === pk || (s.profiles || []).includes(pk) || (P.uses && s.profile === P.uses)).map(([k]) => k);
        const cu = (cfgOf(st).pfpages?.[pk]?.custom || []).map(c => `${pk}__${c.key}`);
        return [...new Set([...own, ...cu])];
    };
    /** l'ordre, les cachées, les largeurs d'un profil seul (son modèle, puis le réglage) */
    PF.profileCfg = (st, pk) => {
        const P = ART.profiles[pk] || {}, keys = PF.sectionKeys(st, pk), all = cfgOf(st);
        if (pk === 'artist') { const s = all.page || {}, M = ART.models, m = M[s.model || ARTIST_MODEL[st.person?.artist_discipline] || 'musicien'] || M.musicien || {order: keys, hidden: []};
            return {order: [...new Set([...(s.order || m.order || []), ...keys])].filter(k => keys.includes(k)), hidden: new Set(s.hidden || m.hidden || []), widths: s.widths || {}, colors: s.colors || {}, model: s.model || ''}; }
        const s = all.pfpages?.[pk] || {}, models = Array.isArray(P.models) ? Object.fromEntries(P.models.filter(k => ART.models[k]).map(k => [k, ART.models[k]])) : P.models || {}, mk = s.model || P.defaultModel?.(st) || Object.keys(models)[0], m = models[mk] || {order: keys, hidden: []};
        const order = [...new Set(['pf_frise', ...(s.order || m.order || keys), ...keys, ...commonKeys()])].filter(k => k === 'pf_frise' || keys.includes(k) || commonKeys().includes(k));
        const hidden = new Set([...(s.hidden || m.hidden || []), ...((m.hidden || []).filter(k => !(s.order || []).includes(k) && s.hidden))]);
        return {order, hidden, widths: s.widths || {}, colors: s.colors || {}, model: mk, models};
    };
    /** la page « Tout mélangé » : l'ordre de toutes les sections, le profil de chacune */
    PF.allCfg = st => {
        const s = cfgOf(st).ppage || {}, keys = PF.keysOf(st);
        const profOrder = [...new Set([...(s.profOrder || []).filter(k => keys.includes(k)), ...keys])];
        const profHidden = new Set((s.profHidden || []).filter(k => keys.includes(k)));
        const owner = {pf_frise: 'common', pf_identity: 'common'}, defaults = ['pf_frise', 'pf_identity'], defHidden = new Set();
        profOrder.forEach(pk => { const c = PF.profileCfg(st, pk); c.order.forEach(k => { if (owner[k] || commonKeys().includes(k)) return; owner[k] = pk; defaults.push(k); if (c.hidden.has(k)) defHidden.add(k); }); });
        commonKeys().forEach(k => { if (!owner[k]) { owner[k] = 'common'; defaults.push(k); } });
        const order = [...new Set([...(s.order || []).filter(k => owner[k]), ...defaults])];
        const hidden = new Set([...(s.hidden || []), ...[...defHidden].filter(k => !(s.order || []).includes(k))]);
        return {order, hidden, widths: s.widths || {}, colors: s.colors || {}, profColors: s.profColors || {}, owner, profOrder, profHidden, hideEmpty: !!s.hideEmpty};
    };
    /** une section : celles des profils, les sections ajoutées (texte), et celles de l'artiste ajoutées */
    PF.section = (st, k) => {
        if (ART.pageSections[k]) return ART.pageSections[k];
        const m = /^([a-z][a-z0-9_]*)__(c_[a-z0-9_]+)$/.exec(k);
        if (m) { const c = (cfgOf(st).pfpages?.[m[1]]?.custom || []).find(x => x.key === m[2]); if (!c) return null;
            return {icon: '✎', label: c.label, w: '⅓', profile: m[1], custom: true, render: C => { const it = PF.fiche(C.store, m[1]), v = it?.data?.[m[2]]; return {body: v ? `<div class="ar-long">${esc(v).replace(/\n/g, '<br>')}</div>` : PF.muted('Vide : « … » pour l’écrire.'), empty: !v, actions: PF.editBtn(m[1])}; }}; }
        const ac = (cfgOf(st).page?.custom || []).find(c => c.key === k);
        if (ac) return {icon: '✎', label: ac.label, w: '⅓', profile: 'artist', custom: true, render: C => { const it = C.store.of('profile')[0], v = it?.data?.[k]; return {body: v ? `<div class="ar-long">${esc(v).replace(/\n/g, '<br>')}</div>` : PF.muted('Vide : « … » pour l’écrire.'), empty: !v, actions: '<button type="button" class="icon-button small" data-ar-editprofile title="Modifier">…</button>'}; }};
        return null;
    };

    /* — la frise — */
    PF.gantt = (rows, {empty = 'Rien à placer sur la frise : les dates (mandats, clubs, œuvres…) la remplissent.'} = {}) => {
        rows = rows.filter(r => r && (r.bars || []).some(b => Number.isFinite(b.a)));
        const bars = rows.flatMap(r => r.bars).filter(b => Number.isFinite(b.a));
        if (!bars.length) return PF.muted(empty);
        let lo = Math.min(...bars.map(b => b.a)), hi = Math.max(...bars.map(b => Number.isFinite(b.b) ? b.b : b.a)) + 1;
        const span0 = Math.max(hi - lo, 1), step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find(s => span0 / s <= 6) || 1000;
        lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step; if (hi <= lo) hi = lo + step;
        const ticks = []; for (let y = lo; y <= hi; y += step) ticks.push(y);
        const pct = y => ((y - lo) / (hi - lo)) * 100;
        const one = b => { const a = b.a, z = (Number.isFinite(b.b) ? b.b : b.a) + 1, l = pct(a), w = Math.max(pct(z) - l, 1.2), tip = `${b.text ? `${b.text} · ` : ''}${a}${z - 1 > a ? `–${z - 1}` : ''}`;
            const st = `left:${l.toFixed(2)}%;width:${w.toFixed(2)}%;${b.color ? `${PF.vars(b.color)};` : ''}${b.dim ? 'opacity:.7;' : ''}`;
            return b.id ? `<button type="button" class="pf-bar" style="${st}" data-ar-open="${Number(b.id)}" title="${esc(tip)}">${esc(b.text || '')}</button>` : `<span class="pf-bar" style="${st}" title="${esc(tip)}">${esc(b.text || '')}</span>`; };
        return `<div class="pf-gantt" style="--steps:${ticks.length - 1}"><div class="pf-gax"><span></span><div>${ticks.map(t => `<span style="left:${pct(t).toFixed(2)}%">${t}</span>`).join('')}</div></div>
            ${rows.map(r => `<div class="pf-grow" style="${r.color ? PF.vars(r.color) : ''}"><span class="pf-glab" title="${esc(r.label)}">${esc(r.label)}</span><div class="pf-tr">${r.bars.filter(b => Number.isFinite(b.a)).map(one).join('')}</div></div>`).join('')}</div>`;
    };
    /** des périodes qui se chevauchent → une seule, avec les textes de chacune (frise « Tout mélangé ») */
    PF.mergeBars = bars => { const out = []; [...bars].filter(b => Number.isFinite(b.a)).sort((x, y) => x.a - y.a).forEach(b => { const z = Number.isFinite(b.b) ? b.b : b.a, cur = out[out.length - 1];
        if (cur && b.a <= cur.b) { cur.b = Math.max(cur.b, z); if (b.text && !cur.texts.includes(b.text)) cur.texts.push(b.text); cur.n++; } else out.push({a: b.a, b: z, texts: b.text ? [b.text] : [], id: b.id, n: 1}); });
        return out.map(o => ({a: o.a, b: o.b, text: o.texts.slice(0, 3).join(' · ') + (o.texts.length > 3 ? ` … (+${o.texts.length - 3})` : ''), id: o.n === 1 ? o.id : undefined})); };
    PF.timelineOf = (C, pk) => {
        const P = ART.profiles[pk]; if (!P?.timeline) return [];
        let r; try { r = P.timeline(C); } catch (_) { try { r = P.timeline(C.store); } catch (e) { console.error(e); return []; } }
        r = Array.isArray(r) ? r : [];
        // une frise écrite comme [{from, to, label}] (outil « sciences ») : une ligne au nom du profil
        if (r.length && !r[0].bars) r = [{label: `${P.icon} ${P.label}`, bars: r.map(x => { const sp = PF.span(x.from, x.to); return sp ? {a: sp[0], b: sp[1], text: x.label || ''} : null; }).filter(Boolean)}];
        return r.map(x => ({...x, color: x.color || PF.color(pk)}));
    };
    ART.pageSections.pf_frise = {icon: '📈', label: 'Frise de vie', w: 'ligne', profile: 'common', render: (C, sec) => {
        const st = C.store, view = sec.view || 'all';
        let rows;
        if (view === 'all') { const cfg = PF.allCfg(st);
            rows = cfg.profOrder.filter(k => !cfg.profHidden.has(k)).map(pk => { const P = ART.profiles[pk], l = PF.timelineOf(C, pk); return l.length ? {label: `${P.icon} ${P.label}`, color: PF.color(pk), bars: PF.mergeBars(l.flatMap(r => r.bars)).map(b => ({...b, color: PF.color(pk)}))} : null; }).filter(Boolean);
            ART.timelineExtras.forEach(x => { try { const r = x.rows?.(C) || []; rows.push(...r.map(y => ({...y, color: y.color || x.color}))); } catch (e) { console.error(e); } });
        } else rows = PF.timelineOf(C, view);
        return {body: PF.gantt(rows), empty: !rows.length};
    }};
    // 👤 Identité, famille (la fiche de toujours)
    const kin = (p, m, f, u) => p?.gender === 'female' ? f : p?.gender === 'male' ? m : u;
    const pName = x => `${x?.first_name || ''} ${String(x?.last_name || '').toLocaleUpperCase('fr-FR')}`.trim() || '?';
    const pChip = x => x?.id ? `<button type="button" class="ar-linkbtn" data-ar-person="${Number(x.id)}">${esc(pName(x))}</button>` : esc(pName(x));
    ART.pageSections.pf_identity = {icon: '👤', label: 'Identité, famille', w: '½', profile: 'common', render: C => {
        const st = C.store, d = st._pfDetail;
        if (!d) { if (!st._pfLoading) { st._pfLoading = A().api('person', {id: st.pid}).then(r => { st._pfDetail = r || {}; if (C.S.view === 'page' && C.dlg.isConnected) C.paint(false); }).catch(() => { st._pfDetail = {}; }); } return {body: '<p class="muted"><span class="ui-spinner" aria-hidden="true"></span> Chargement…</p>'}; }
        const me = d.person || st.person, list = v => (Array.isArray(v) ? v : []).map(x => x.person || x.partner || x).filter(x => x && (x.first_name || x.last_name));
        const parents = list(d.parents), partners = list(d.partners), children = list(d.children), sibs = list(d.siblings);
        const parts = [parents.length && `${kin(me, 'Fils', 'Fille', 'Enfant')} de ${parents.map(pChip).join(' et ')}`,
            sibs.length && sibs.slice(0, 4).map(x => `${kin(x, 'frère', 'sœur', 'frère ou sœur')} de ${pChip(x)}`).join(', ') + (sibs.length > 4 ? ` et ${sibs.length - 4} autres` : ''),
            partners.length && `${kin(me, 'époux', 'épouse', 'conjoint')} de ${partners.map(pChip).join(', ')}`, children.length && plural(children.length, 'enfant')].filter(Boolean);
        const life = [st.person.birth && `° ${[st.person.birth.date || st.person.birth.year, st.person.birth.place].filter(Boolean).join(' ')}`, st.person.death && `† ${[st.person.death.date || st.person.death.year, st.person.death.place].filter(Boolean).join(' ')}`].filter(Boolean).join(' · ');
        return {body: `${life ? `<p>${esc(life)}</p>` : ''}${parts.length ? `<p>${parts.join(' · ')}</p>` : PF.muted('Pas encore de famille sur la fiche.')}<button type="button" class="ar-linkbtn" data-ar-person="${st.pid}">↗ Ouvrir la fiche</button>`, head: '<small class="ar-g">(la fiche de toujours)</small>'};
    }};

    /* — les blocs communs (outil « blocs » : récompenses, presse, formation), chargés une fois par page — */
    /** PF.later(C, clé, () => promesse) : la valeur si elle est là, sinon null (la page se redessine quand elle arrive) */
    PF.later = (C, key, fn) => {
        const st = C.store, box = st._pfLater = st._pfLater || {};
        if (key in box && box[key] !== PENDING) return box[key];
        if (box[key] !== PENDING) { box[key] = PENDING; Promise.resolve().then(fn).then(v => { box[key] = v; }, () => { box[key] = undefined; }).then(() => { if (C.S.view === 'page' && C.dlg.isConnected) C.paint(false); }); }
        return null;
    };
    const PENDING = Symbol('…');
    const LOADING = '<p class="muted"><span class="ui-spinner" aria-hidden="true"></span> Chargement…</p>';
    PF.loading = LOADING;
    ART.pageSections.pf_awards = {icon: '🏆', label: 'Concours et récompenses', w: '⅓', profile: 'common', render: C => {
        if (!ext.awards?.listFor) return {body: PF.muted('Bloc « 🏆 Concours et récompenses » de la fiche.'), empty: true};
        const l = PF.later(C, 'awards', () => ext.awards.listFor(C.pid)); if (!l) return {body: LOADING};
        return {body: l.length ? ext.awards.tableHtml(l.slice(0, 6), C.pid) + (l.length > 6 ? `<p class="ar-g">… et ${esc(plural(l.length - 6, 'autre'))}.</p>` : '') : PF.muted('Aucune récompense : bloc « 🏆 Concours et récompenses » de la fiche.'), count: l.length || '', empty: !l.length};
    }};
    ART.pageSections.pf_press = {icon: '📰', label: 'Dans les médias', w: '⅓', profile: 'common', render: C => {
        if (!ext.press?.listFor) return {body: PF.muted('Bloc « 📰 Dans les médias » de la fiche.'), empty: true};
        const l = PF.later(C, 'press', () => ext.press.listFor(C.pid)); if (!l) return {body: LOADING};
        return {body: l.length ? (ext.press.cardsHtml ? ext.press.cardsHtml(l.slice(0, 4)) : `<p>${esc(plural(l.length, 'passage'))}</p>`) : PF.muted('Aucun article : bloc « 📰 Dans les médias » de la fiche.'), count: l.length || '', empty: !l.length};
    }};
    ART.pageSections.pf_education = {icon: '🎓', label: 'Diplômes et formation', w: '⅓', profile: 'common', render: C => {
        if (!ext.education?.listFor) return {body: PF.muted('Bloc « 🎓 Diplômes et formation » de la fiche.'), empty: true};
        const r = PF.later(C, 'education', () => ext.education.listFor(C.pid)); if (!r) return {body: LOADING};
        const n = (r.steps || []).length + (r.diplomas || []).length;
        return {body: n ? (ext.education.diplomasHtml && r.diplomas?.length ? ext.education.diplomasHtml(r.diplomas) : `<p>${esc([plural((r.steps || []).length, 'étape'), plural((r.diplomas || []).length, 'diplôme')].join(' · '))}</p>`) : PF.muted('Rien de noté : bloc « 🎓 Diplômes et formation » de la fiche.'), count: n || '', empty: !n};
    }};

    /* — dessiner la page — */
    const paintArtist = ART.paintPage, orgArtist = ART.openOrganizer;
    const secState = {};
    const renderSec = (C, k, S0, view) => { try { return S0.render(C, {state: secState[k], view}) || {body: ''}; } catch (e) { console.error(e); return {body: PF.muted('Cette section n’a pas pu s’afficher.'), empty: true}; } };
    /** le liseré d'une section : sa couleur à elle, sinon celle de son profil (les sections communes : aucun) */
    const lisOf = (C, cfg, k, pk) => ART.secColor ? ART.secColor(cfg?.colors, k, pk && pk !== 'common' ? PF.colorIn(C.store, pk) : '') : (pk && pk !== 'common' ? PF.color(pk) : '');
    const blockHtml = (C, k, S0, w, pk, r, col = lisOf(C, null, k, pk)) => `<section class="ar-blk pf-blk ${WIDTH[w] || 'w-12'} ${col ? 'has-pf' : ''}" data-sec="${esc(k)}" style="--pf:${esc(col || 'transparent')}"><div class="ar-bh"><span class="ar-grip" title="Ranger : ⚙️ Organiser la page">⠿</span><b>${esc(S0.icon || '')} ${esc(S0.label)}</b>${r.count ? ` <small class="ar-g">${esc(r.count)}</small>` : ''}${r.head || ''}<span class="spacer"></span>${r.actions || ''}</div><div class="ar-bb">${r.body || ''}</div></section>`;
    const visibleKeys = st => { const cfg = PF.allCfg(st); return cfg.profOrder.filter(k => !cfg.profHidden.has(k)); };
    /** la vue : « Tout mélangé » ou un profil ; un seul profil (visible) = sa page directement */
    const viewOf = C => { const vis = visibleKeys(C.store), v = C.S.pview || C.prefs?.pview?.[C.pid] || 'all'; if (vis.length === 1 && PF.keysOf(C.store).length === 1) return vis[0]; return v === 'all' || vis.includes(v) ? v : 'all'; };
    const segHtml = (C, view) => { const cfg = PF.allCfg(C.store), ks = cfg.profOrder.filter(k => !cfg.profHidden.has(k));
        return `<nav class="segmented pf-seg" aria-label="Profils"><button type="button" class="${view === 'all' ? 'is-active' : ''}" data-pf-view="all">Tout mélangé</button>${ks.map(k => `<button type="button" class="${view === k ? 'is-active' : ''}" data-pf-view="${esc(k)}">${esc(ART.profiles[k].icon)} ${esc(ART.profiles[k].short || ART.profiles[k].label)}</button>`).join('')}</nav>`; };
    const photoHtml = st => { const p = st.person; return p.photo ? `<span class="ar-hero-ph" style="background-image:url('media/${encodeURIComponent(p.photo)}')"></span>` : `<span class="ar-hero-ph ${{male: 'm', female: 'f'}[p.gender] || 'u'}">${esc(U.initials(st.name))}</span>`; };
    const linksHtml = links => (links || []).filter(l => /^https?:\/\//i.test(l.url || '')).map(l => `<a class="ar-ochip is-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer"><i>${esc(l.icon || '🌐')}</i>${esc(l.label || l.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0])}</a>`).join('');
    PF.linksHtml = linksHtml;
    function heroAll(C, view) {
        const st = C.store, keys = PF.allCfg(st).profOrder;
        return `<header class="ar-hero pf-hero">${photoHtml(st)}<div class="pf-hmain"><h2>${esc(st.name)}${PF.life(st) ? ` <small>· ${esc(PF.life(st))}</small>` : ''}</h2>
            <div class="pf-badges">${keys.map(k => { const P = ART.profiles[k], sub = (() => { try { return P.sub?.(st); } catch (e) { console.error(e); return ''; } })(); return `<button type="button" class="pf-b is-btn" style="${PF.vars(PF.colorIn(st, k))}" data-pf-view="${esc(k)}">${esc(P.icon)} ${esc(P.label)}${sub ? ` · ${esc(sub)}` : ''}</button>`; }).join('')}${st.readonly ? '' : '<button type="button" class="pf-b is-add" data-pf-choose>＋ profil</button>'}</div>
            <div class="pf-segrow">${segHtml(C, view)}</div></div></header>`;
    }
    function heroOne(C, pk, extra = '') {
        const st = C.store, P = ART.profiles[pk], h = (() => { try { return P.hero?.(C) || {}; } catch (e) { console.error(e); return {}; } })();
        return `<header class="ar-hero pf-hero is-one" style="${PF.vars(PF.colorIn(st, pk))}">${photoHtml(st)}<div class="pf-hmain"><span class="eyebrow pf-ey">${esc(h.eyebrow || `${P.icon} ${P.label}`.toLocaleUpperCase('fr-FR'))}</span><h2>${esc(st.name)}${h.sub || PF.life(st) ? ` <small>· ${esc(h.sub || PF.life(st))}</small>` : ''}</h2>${h.summary || P.summary ? `<small class="ar-g">${esc(h.summary || (() => { try { return P.summary(st); } catch (_) { return ''; } })())}</small>` : ''}${h.links?.length ? `<div class="ar-hero-links">${linksHtml(h.links)}</div>` : ''}</div>${extra}</header>`;
    }
    function paintPf(C, body) {
        const st = C.store, view = viewOf(C); C.S.pview = view;
        const bar = () => `<div class="pf-switch"><div class="pf-badges">${PF.allCfg(st).profOrder.map(k => `<button type="button" class="pf-b is-btn ${k === view ? 'is-on' : ''}" style="${PF.vars(PF.colorIn(st, k))}" data-pf-view="${esc(k)}">${esc(ART.profiles[k].icon)} ${esc(ART.profiles[k].label)}</button>`).join('')}${st.readonly ? '' : '<button type="button" class="pf-b is-add" data-pf-choose>＋ profil</button>'}</div>${segHtml(C, view)}</div>`;
        if (view === 'artist') {
            body.innerHTML = `${bar()}<div data-pf-artist></div>`;
            paintArtist(C, body.querySelector('[data-pf-artist]'));
        } else {
            let cfg, owner = {}, list;
            if (view === 'all') { cfg = PF.allCfg(st); owner = cfg.owner; list = cfg.order.filter(k => !cfg.hidden.has(k) && (owner[k] === 'common' || !cfg.profHidden.has(owner[k]))); }
            else { cfg = PF.profileCfg(st, view); list = cfg.order.filter(k => !cfg.hidden.has(k)); list.forEach(k => { owner[k] = commonKeys().includes(k) || k === 'pf_frise' ? 'common' : view; }); }
            const hideEmpty = !!PF.allCfg(st).hideEmpty;
            const secs = list.map(k => { const S0 = PF.section(st, k); if (!S0 || S0.hideIf?.(C, view)) return ''; /* hideIf : une section en double avec celle d'un autre profil */ const r = renderSec(C, k, S0, view); if (hideEmpty && (r.empty || r.count === 0)) return '';
                const S1 = k === 'pf_frise' && view !== 'all' ? {...S0, label: 'Frise de carrière'} : S0; return blockHtml(C, k, S1, cfg.widths[k] || S0.w, owner[k], r, lisOf(C, cfg, k, owner[k])); }).join('');
            const single = PF.keysOf(st).length === 1;
            body.innerHTML = `<div class="ar-page pf-page">${view === 'all' ? heroAll(C, view) : single ? heroOne(C, view, st.readonly ? '' : '<button type="button" class="pf-b is-add pf-addone" data-pf-choose title="Cocher un autre profil (artiste, sportif, élu…)">＋ profil</button>') : bar() + heroOne(C, view)}<div class="ar-blocks">${secs || `<p class="muted">Toutes les sections sont cachées : « ⚙️ Organiser la page ».</p>`}</div>${view === 'all' ? '<p class="pf-note">« Tout mélangé » : les sections de tous ses profils, dans l’ordre que tu choisis (⚙️ Organiser la page). Le liseré de couleur dit de quel profil vient la section ; les blocs communs restent toujours visibles.</p>' : ''}</div>`;
        }
        body.onclick = async e => {
            const t = e.target.closest('button'); if (!t) return;
            if (t.dataset.pfView) { C.S.pview = t.dataset.pfView; C.prefs.pview = {...(C.prefs.pview || {}), [C.pid]: t.dataset.pfView}; C.savePrefs?.(); C.paint(true); return; }
            if ((t.hasAttribute('data-pf-choose') || t.dataset.pfEdit || t.dataset.pfNew) && st.readonly) return C.roMsg?.(); // fiche verrouillée, consultation
            if (t.hasAttribute('data-pf-choose')) return PF.openChooser(C.pid, {name: st.name, onDone: async () => { await C.reload(); C.paint(true); }});
            if (t.dataset.pfEdit) return PF.editFiche(C, t.dataset.pfEdit);
            if (t.dataset.pfNew) return C.newItem(t.dataset.pfNew);
            if (t.dataset.pfState) { const [k, v] = t.dataset.pfState.split(':'); secState[k] = v; return C.paint(false); }
            if (view === 'artist') return; // la page de l'artiste a ses propres boutons
            const b = t.closest('[data-ar-dtab]'); if (b) { secState.discography = b.dataset.arDtab === secState.discography ? 'all' : b.dataset.arDtab; return C.paint(false); }
            if (t.hasAttribute('data-ar-editprofile')) { const it = st.of('profile')[0]; if (it) C.open(it.id, {edit: true}); else C.newItem('profile', {title: st.name}); }
        };
    }
    PF.editFiche = (C, pk) => { const kind = ART.profiles[pk]?.type || `profile_${pk}`; if (!ART.defs[kind]) return; const it = C.store.of(kind)[0]; if (it) C.open(it.id, {edit: true}); else C.newItem(kind, ART.defs[kind].newData?.(C.store) || {title: C.store.name}); };
    ART.paintPage = (C, body) => PF.isCombined(C.store) ? paintPf(C, body) : paintArtist(C, body);
    PF.state = secState;
    ART.pageHead = st => {
        const ks = PF.keysOf(st);
        if (!ks.length || (ks.length === 1 && ks[0] === 'artist')) return {icon: '🎨', tab: '🎨 Page', eyebrow: 'ARTISTE · SA PAGE'};
        if (ks.length === 1) { const P = ART.profiles[ks[0]]; return {icon: P.icon, tab: `${P.icon} Page`, eyebrow: `${P.label} · sa page`.toLocaleUpperCase('fr-FR')}; }
        return {icon: '🧩', tab: '🧩 Page', eyebrow: `${ks.length} PROFILS · SA PAGE`};
    };

    /* ═════════ R · « ⚙️ Organiser la page » (tout mélangé, ou un profil) ═════════ */
    ART.openOrganizer = C => { if (!PF.isCombined(C.store) || viewOf(C) === 'artist') return orgArtist(C); return openPfOrganizer(C); };
    function openPfOrganizer(C) {
        const aside = C.dlg.querySelector('[data-ar-panel]'); aside.hidden = false; C.dlg.classList.add('has-panel');
        const close = () => { aside.hidden = true; aside.innerHTML = ''; C.panel = null; C.dlg.classList.remove('has-panel'); };
        C.panel = {close, page: true, refresh: () => paint()};
        const st = () => C.store;
        const save = async () => { const s = st(); s.settings = s.personSet?.own ? s.personSet : s.global; try { await ART.persistSettings(s); } catch (e) { toast(e.message, 'error'); } C.paint(false); paint(); };
        /** la configuration à modifier, déjà remplie avec ce qu'on voit */
        const page = () => { const view = viewOf(C), t = tgtOf(st());
            if (view === 'all') { const c = PF.allCfg(st()); t.ppage = t.ppage || {}; const p = t.ppage; p.colors = p.colors || {}; p.profColors = p.profColors || {}; p.order = p.order || [...c.order]; p.hidden = p.hidden || [...c.hidden]; p.widths = p.widths || {}; p.profOrder = p.profOrder || [...c.profOrder]; p.profHidden = p.profHidden || [...c.profHidden]; c.order.forEach(k => { if (!p.order.includes(k)) p.order.push(k); }); return p; }
            const c = PF.profileCfg(st(), view); t.pfpages = t.pfpages || {}; const p = t.pfpages[view] = t.pfpages[view] || {}; p.colors = p.colors || {}; p.order = p.order || [...c.order]; p.hidden = p.hidden || [...c.hidden]; p.widths = p.widths || {}; p.custom = p.custom || []; c.order.forEach(k => { if (!p.order.includes(k)) p.order.push(k); }); return p; };
        function paint() {
            const view = viewOf(C), s = st(), first = youngName(s);
            if (!PF.isCombined(s) || view === 'artist') { close(); return orgArtist(C); }
            const one = view !== 'all', P = ART.profiles[view];
            const cfg = one ? PF.profileCfg(s, view) : PF.allCfg(s), list = cfg.order.filter(k => PF.section(s, k));
            const ownerOf = k => one ? (commonKeys().includes(k) || k === 'pf_frise' ? 'common' : view) : cfg.owner[k];
            const nSec = pk => PF.profileCfg(s, pk).order.filter(k => k !== 'pf_frise' && !commonKeys().includes(k) && !PF.profileCfg(s, pk).hidden.has(k)).length;
            const profCards = one ? '' : `<b class="pf-sub">Profils de cette personne</b><div class="pf-cards">${cfg.profOrder.map((k, i) => { const off = cfg.profHidden.has(k); return `<div class="pf-card ${off ? 'off' : ''}" data-pfkey="${esc(k)}" draggable="true"><span class="ar-grip">⠿</span><span>${badge({key: k})} <small class="ar-g">${off ? 'caché' : plural(nSec(k), 'section')}</small></span><span class="ar-ocol" data-p-col="${esc(k)}"></span><span class="tools"><button type="button" data-p-mv="-1" ${i ? '' : 'disabled'} title="Monter">↑</button><button type="button" data-p-mv="1" ${i < cfg.profOrder.length - 1 ? '' : 'disabled'} title="Descendre">↓</button></span><label class="ui-toggle" title="${off ? 'Montrer' : 'Cacher'} ce profil sur la page"><input type="checkbox" data-p-tog ${off ? '' : 'checked'}><i></i></label></div>`; }).join('')}</div>`;
            const rows = list.map((k, i) => { const S0 = PF.section(s, k), on = !cfg.hidden.has(k), w = cfg.widths[k] || S0.w, ow = ownerOf(k), lab = k === 'pf_frise' && one ? 'Frise de carrière' : S0.label;
                const dim = !one && ow !== 'common' && cfg.profHidden.has(ow);
                return `<div class="ar-fr ${on && !dim ? '' : 'off'} ${S0.custom ? 'cust' : ''}" data-okey="${esc(k)}" draggable="true"><span class="ar-grip">⠿</span><button type="button" class="ar-eye" data-o-eye title="${on ? 'Cacher' : 'Montrer'}">${on ? '👁' : '🚫'}</button><span class="lbl pf-lbl" style="--pf:${esc(ow !== 'common' ? PF.color(ow) : 'transparent')}">${esc(S0.icon || '')} ${esc(lab)}${dim ? ' <small class="ar-g">(profil caché)</small>' : ''}</span>
                    <select class="ty ar-wsel" data-o-w title="Largeur">${ART.widthOptions ? ART.widthOptions(w) : ''}</select><span class="ar-ocol" data-o-col="${esc(k)}"></span><span class="tools"><button type="button" data-o-mv="-1" ${i ? '' : 'disabled'} title="Monter">↑</button><button type="button" data-o-mv="1" ${i < list.length - 1 ? '' : 'disabled'} title="Descendre">↓</button>${S0.custom ? '<button type="button" data-o-del title="Retirer">🗑</button>' : ''}</span></div>`; }).join('');
            const models = one ? Object.entries(cfg.models || {}) : [];
            aside.innerHTML = `<div class="ar-ph"><b>⚙️ ${one ? `Organiser le profil ${esc(String(P.label).toLocaleLowerCase('fr-FR'))}` : `Organiser la page de ${esc(first)}`}</b><span class="spacer"></span><button type="button" class="icon-button small" data-o-close aria-label="Fermer">×</button></div><div class="ar-pbody">
                <p class="ar-phelp">${one ? 'Comme pour l’artiste : ⠿ ou ↑ ↓ pour ranger, 👁 pour cacher, la largeur (toute la ligne, ½, ⅓, ¼, ⅔, ¾) et la couleur du liseré.' : 'Range les profils et les sections (⠿ ou ↑ ↓), cache-les (👁), choisis leur largeur et la couleur de leur liseré (la pastille d’un profil : sa couleur).'}</p>${profCards}
                <b class="pf-sub">Sections, dans l’ordre de la page</b><div class="ar-plist">${rows}</div>
                <div class="ar-pbtns">${one ? '' : '<button type="button" class="button small secondary" data-o-addprof>＋ Ajouter un profil</button>'}<button type="button" class="button small secondary" data-o-add>＋ Ajouter une section</button>${models.length > 1 ? `<select class="ar-in" data-o-model title="Modèle de départ">${models.map(([k, m]) => `<option value="${esc(k)}" ${k === cfg.model ? 'selected' : ''}>Modèle : ${esc(m.label)}</option>`).join('')}</select>` : ''}</div>
                ${one && P.organizerNote ? `<p class="ar-phelp">${P.organizerNote}</p>` : ''}
                <div class="pf-togs"><label class="ui-toggle"><input type="checkbox" data-o-own ${s.personSet?.own ? 'checked' : ''}><i></i>Réglage propre à ${esc(first)}</label>${one ? '' : `<label class="ui-toggle"><input type="checkbox" data-o-empty ${PF.allCfg(s).hideEmpty ? 'checked' : ''}><i></i>Masquer les sections vides</label>`}</div>
                <p class="ar-phelp">Tout se range dans « 💾 Réglages enregistrés » (⚙️ Champs affichés d’une fiche). Une section cachée garde ses données.</p></div>`;
            // C2 : la couleur du liseré de chaque section, et celle de chaque profil
            ART.mountSecColors?.(aside, cfg.colors, k => { const ow = ownerOf(k); return ow && ow !== 'common' ? PF.colorIn(s, ow) : ''; }, (k, v) => { const p = page(); p.colors = {...(p.colors || {})}; if (v == null) delete p.colors[k]; else p.colors[k] = v; save(); });
            aside.querySelectorAll('[data-p-col]').forEach(slot => { const pk = slot.dataset.pCol, UI = window.LCNDA_UI; if (!UI?.colorField) return;
                const f = UI.colorField({value: PF.colorIn(s, pk), compact: true}); f.title = 'Couleur de ce profil (pastilles, liserés, frise)'; slot.appendChild(f);
                f.input.addEventListener('change', () => { if (!/^#[0-9a-f]{6}$/i.test(f.input.value || '')) return; const t = tgtOf(st()); t.ppage = t.ppage || {}; t.ppage.profColors = {...(t.ppage.profColors || {}), [pk]: f.input.value.slice(0, 7)}; save(); }); });
        }
        aside.onclick = async e => {
            const b = e.target.closest('button'); if (!b) return;
            const row = b.closest('[data-okey]'), k = row?.dataset.okey, pc = b.closest('[data-pfkey]')?.dataset.pfkey;
            if (b.hasAttribute('data-o-close')) return close();
            if (b.hasAttribute('data-o-eye')) { const p = page(); p.hidden = p.hidden.includes(k) ? p.hidden.filter(x => x !== k) : [...p.hidden, k]; return save(); }
            if (b.dataset.oMv) { const p = page(), i = p.order.indexOf(k), j0 = Number(b.dataset.oMv); let j = i + j0; const vis = x => PF.section(st(), x); while (j >= 0 && j < p.order.length && !vis(p.order[j])) j += j0; if (i < 0 || j < 0 || j >= p.order.length) return; [p.order[i], p.order[j]] = [p.order[j], p.order[i]]; return save(); }
            if (b.dataset.pMv) { const p = page(), i = p.profOrder.indexOf(pc), j = i + Number(b.dataset.pMv); if (i < 0 || j < 0 || j >= p.profOrder.length) return; [p.profOrder[i], p.profOrder[j]] = [p.profOrder[j], p.profOrder[i]]; return save(); }
            if (b.hasAttribute('data-o-del')) { const view = viewOf(C), m = /^([a-z][a-z0-9_]*)__(c_[a-z0-9_]+)$/.exec(k); const t = tgtOf(st());
                if (m && t.pfpages?.[m[1]]) { t.pfpages[m[1]].custom = (t.pfpages[m[1]].custom || []).filter(c => c.key !== m[2]); }
                if (view !== 'all' || !m) { const p = page(); p.order = p.order.filter(x => x !== k); }
                return save(); }
            if (b.hasAttribute('data-o-addprof')) return PF.openChooser(C.pid, {name: st().name, onDone: async () => { await C.reload(); C.paint(true); paint(); }});
            if (b.hasAttribute('data-o-add')) return addSection();
        };
        aside.onchange = e => {
            const t = e.target, k = t.closest('[data-okey]')?.dataset.okey;
            if (t.matches('[data-o-w]')) { page().widths[k] = t.value; return save(); }
            if (t.matches('[data-p-tog]')) { const p = page(), pk = t.closest('[data-pfkey]').dataset.pfkey; p.profHidden = t.checked ? p.profHidden.filter(x => x !== pk) : [...new Set([...p.profHidden, pk])]; return save(); }
            if (t.matches('[data-o-model]')) { const tg = tgtOf(st()), view = viewOf(C); tg.pfpages = tg.pfpages || {}; const old = tg.pfpages[view] || {}; tg.pfpages[view] = {model: t.value, widths: old.widths || {}, colors: old.colors || {}, custom: old.custom || []}; return save(); }
            if (t.matches('[data-o-empty]')) { const p = page(); p.hideEmpty = t.checked; return save(); }
            if (t.matches('[data-o-own]')) { const s = st(); if (t.checked) { s.personSet = {...clone(s.global || {}), ...(s.personSet || {}), own: true}; s.personSet.kinds = clone(s.global?.kinds || {}); Object.values(s.personSet.kinds).forEach(K => { delete K.custom; }); } else if (s.personSet) s.personSet.own = false; return save(); }
        };
        let drag = null;
        aside.ondragstart = e => { drag = e.target.closest('[data-okey],[data-pfkey]'); drag?.classList.add('drag'); };
        aside.ondragover = e => { if (!drag) return; const sel = drag.dataset.okey ? '[data-okey]' : '[data-pfkey]', o = e.target.closest(sel); if (!o || o === drag || o.parentNode !== drag.parentNode) return; e.preventDefault(); const r = o.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) o.before(drag); else o.after(drag); };
        aside.ondragend = () => { if (!drag) return; const isSec = !!drag.dataset.okey; drag.classList.remove('drag'); drag = null; const p = page();
            if (isSec) { const seen = [...aside.querySelectorAll('[data-okey]')].map(r => r.dataset.okey); p.order = [...seen, ...p.order.filter(x => !seen.includes(x))]; } else p.profOrder = [...aside.querySelectorAll('[data-pfkey]')].map(r => r.dataset.pfkey);
            save(); };
        /** ＋ Ajouter une section : remontrer une section cachée, ou en créer une (texte) dans un profil */
        function addSection() {
            const view = viewOf(C), s = st(), one = view !== 'all', cfg = one ? PF.profileCfg(s, view) : PF.allCfg(s);
            const hiddenL = cfg.order.filter(k => cfg.hidden.has(k) && PF.section(s, k));
            const profs = (one ? [view] : cfg.profOrder).filter(k => ART.defs[ART.profiles[k]?.type]);
            ext.openDialog({eyebrow: '⚙️ ORGANISER', title: '＋ Ajouter une section', submitLabel: 'Ajouter',
                body: `${hiddenL.length ? `<b class="pf-sub">Remontrer une section cachée</b><div class="pf-lib">${hiddenL.map(k => `<label><input type="checkbox" name="show" value="${esc(k)}"> ${esc(PF.section(s, k).icon || '')} ${esc(PF.section(s, k).label)}</label>`).join('')}</div>` : ''}
                    ${profs.length ? `<b class="pf-sub">Une section à toi (un texte que tu écris)</b><label class="pf-fld">Son nom<input name="label" maxlength="60" placeholder="ex. Ses instruments, Ses chevaux…"></label>${profs.length > 1 ? `<label class="pf-fld">Dans le profil<select name="prof">${profs.map(k => `<option value="${esc(k)}">${esc(ART.profiles[k].icon)} ${esc(ART.profiles[k].label)}</option>`).join('')}</select></label>` : `<input type="hidden" name="prof" value="${esc(profs[0])}">`}` : ''}`,
                onSubmit: async form => {
                    const show = [...form.querySelectorAll('[name=show]:checked')].map(c => c.value), label = (form.elements.label?.value || '').trim(), pk = form.elements.prof?.value;
                    if (!show.length && !label) { toast('Coche une section ou donne un nom.', 'error'); return false; }
                    const p = page(); p.hidden = p.hidden.filter(x => !show.includes(x));
                    if (label && pk) {
                        const t = tgtOf(s), slug = U.slug(label).slice(0, 24) || 'section';
                        if (pk === 'artist') { const key = `s_${slug}`; t.page = t.page || {}; t.page.custom = [...(t.page.custom || []).filter(c => c.key !== key), {key, label: label.slice(0, 60)}]; t.page.order = [...(t.page.order || PF.profileCfg(s, 'artist').order), key];
                            const g = s.global = s.global || {}; g.kinds = g.kinds || {}; const K = g.kinds.profile = g.kinds.profile || {}; K.custom = [...(K.custom || []).filter(c => c.key !== key), {key, label: label.slice(0, 60), type: 'longtext', star: true}]; if (!p.order.includes(key)) p.order.push(key); }
                        else { const ck = `c_${slug}`, kind = ART.profiles[pk].type; t.pfpages = t.pfpages || {}; const pp = t.pfpages[pk] = t.pfpages[pk] || {}; pp.custom = [...(pp.custom || []).filter(c => c.key !== ck), {key: ck, label: label.slice(0, 60)}];
                            const g = s.global = s.global || {}; g.kinds = g.kinds || {}; const K = g.kinds[kind] = g.kinds[kind] || {}; K.custom = [...(K.custom || []).filter(c => c.key !== ck), {key: ck, label: label.slice(0, 60), type: 'longtext', star: true}];
                            const sk = `${pk}__${ck}`; if (!p.order.includes(sk)) p.order.push(sk); if (!one && pp.order && !pp.order.includes(sk)) pp.order.push(sk); }
                    }
                    await save(); return true;
                }});
        }
        paint();
    }
})();
