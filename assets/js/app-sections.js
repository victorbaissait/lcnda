/* LCNDA — 🗂 Sections des fiches (personnes et animaux).
 *
 * Maquettes validées : docs/design/fiche-sections.html (F1 à F12), docs/design/reglages-fiches.html (P1–P3),
 * docs/design/fiches-et-designs.html (D1–D4 « qui règle quoi »). Mode d'emploi : docs/UI.md (« Sections des fiches »).
 *
 * Les blocs d'une fiche se rangent dans des sections nommées (avec une icône) ; ce qui n'est rangé nulle part va dans
 * « Sans section », à la fin, pour que rien ne disparaisse. Style des titres : Trait et titre (départ), Encadrée, Grand
 * titre, Bandeau, Centré, ou Onglets en haut (place des onglets, « ▦ Tout voir »). Le DESSIN (traits, coins, ombres, onglets)
 * suit les designs A1 / A6 et les couleurs de l'Apparence : aucun réglage de forme ici. L'espace entre deux sections
 * = 2 × l'écart entre deux blocs (il suit A2 Densité).
 *
 * Stockage (rien d'ancien n'est changé, on ajoute seulement) :
 *  - 'genealogie-person-blocks' / 'genealogie-animal-blocks' / 'genealogie-person-blocks-<id>' (exception d'une fiche) :
 *    {order, hidden, widths, hideEmptyIdentity} comme avant + sections: [{id, name, icon, hidden, folded}] + assign: {bloc: id}.
 *    Tant que les sections n'ont jamais été réglées, elles sont calculées (derive) : pour les personnes, l'ordre des blocs ne
 *    bouge pas d'une ligne (les sections suivent l'ordre gardé) ; la fiche reste la même, avec les titres en plus.
 *  - 'genealogie-sheet-sections' : le style et les options (OPT0) ; 'lcnda-sheet-sections-open' (sections repliées, cet
 *    appareil), 'lcnda-sheet-tab' (onglet ouvert), 'lcnda-sheet-edit-tab' (Personnes / Animaux sur la page de réglages).
 *  - l'ancien rangement de la page simple « fiche d'animal » ('genealogie-pet-sections') est repris une fois dans l'ordre
 *    des blocs des animaux (migratePetLayout).
 * API : window.LCNDA_SECTIONS (aussi pour les essais) ; app.js appelle renderSheet() pour le corps de la fiche.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } };
    const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
    const plural = (n, w, p) => (A().plural ? A().plural(n, w, p) : `${n} ${w}${n > 1 ? 's' : ''}`);
    const toast = (m, k) => A().toast?.(m, k);
    const RO = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');

    const OPT_KEY = 'genealogie-sheet-sections';
    const FOLD_KEY = 'lcnda-sheet-sections-open';
    const TAB_KEY = 'lcnda-sheet-tab';
    const EDK_KEY = 'lcnda-sheet-edit-tab';
    const PET_LAYOUT_KEY = 'genealogie-pet-sections';
    const STYLES = [['line', 'Trait et titre', 'Un petit titre en capitales posé sur un trait. Sobre, prend peu de place.'], ['box', 'Encadrée', 'Un cadre autour de la section, le titre dans une étiquette sur le bord.'], ['big', 'Grand titre', 'Sans trait ni cadre : juste le nom, en grand, comme un chapitre.'],
        ['band', 'Bandeau', 'Une bande de la couleur principale (celle de l’Apparence), titre en blanc.'], ['center', 'Centré', 'Le titre au milieu, un trait de chaque côté. Façon livre.'], ['tabs', 'Onglets en haut', 'Une section = un onglet (bleu = ouvert), avec le nombre entre parenthèses.']];
    const PLACES = [['left', 'Gauche', 'collés à gauche'], ['center', 'Centre', 'au milieu de la fiche'], ['right', 'Droite', 'collés à droite'], ['full', 'Toute la largeur', 'ils se partagent la ligne'], ['avant', 'Comme avant', 'à gauche, « ▦ Tout voir » tout à droite']];
    const ALLS = [['left', 'À gauche'], ['right', 'À droite'], ['none', 'Caché']];
    const NUMW = [['1', '1, 2, 3'], ['I', 'I, II, III'], ['A', 'A, B, C']];
    const OPT0 = {style: 'line', place: 'avant', all: 'right', fold: true, startFolded: false, nums: true, numW: '1', blockNums: 'seq', count: true, empty: 'grey', animalOwn: true, editor: 'avant', phoneFirst: true};
    const WIDTHS = [['12', '1', '1'], ['6', '½', '1/2'], ['4', '⅓', '1/3'], ['3', '¼', '1/4'], ['8', '⅔', '2/3'], ['9', '¾', '3/4']];
    /** les sections de départ (personnes : Identité, Famille, Vie, Documents ; animaux : les six onglets de l'ancienne page) */
    const SEC0 = {
        human: [['s_ident', 'Identité', '🪪'], ['s_family', 'Famille', '👪'], ['s_life', 'Vie', '📅'], ['s_docs', 'Documents', '📁']],
        animal: [['s_fiche', 'Fiche', '🪪'], ['s_marks', 'Bagues et marques', '🔖'], ['s_obs', 'Observations', '👁'], ['s_health', 'Santé', '🩺'], ['s_group', 'Groupe', '👥'], ['s_map', 'Carte', '🗺']],
    };
    // personnes : les blocs qui ouvrent une section (les autres restent dans la section en cours : l'ordre ne bouge pas)
    const H_ANCHOR = {identity: 's_ident', ascendants: 's_family', descendants: 's_family', bio: 's_life', event_map: 's_life', media: 's_docs', sources: 's_docs', notes: 's_docs'};
    // animaux : chaque bloc du suivi dans sa section, tout le reste dans 🪪 Fiche
    const A_NAT = {animal_marks: 's_marks', animal_obs: 's_obs', animal_health: 's_health', animal_group: 's_group', animal_map: 's_map'};
    // l'ancienne page simple « fiche d'animal » : ses parties → les blocs de la fiche complète
    const PET_PART = {identity: 'animal', ident: 'animal', parents: 'animal_parents', offspring: 'animal_offspring', siblings: 'animal_siblings', owners: 'animal_owners', titles: 'animal_titles', health: 'animal_health', measures: 'animal_health', life: 'animal_life', story: 'animal_story', notes: 'notes', boards: 'boards', photos: 'media'};

    /* ═════════════════════════ Les options (style, onglets, numéros…) ═════════════════════════ */
    function cleanOpts(v) {
        const o = isObj(v) ? v : {}, one = (x, list, d) => (list.some(l => l[0] === x) ? x : d), bool = (x, d) => (typeof x === 'boolean' ? x : d);
        return {style: one(o.style, STYLES, OPT0.style), place: one(o.place, PLACES, OPT0.place), all: one(o.all, ALLS, OPT0.all), fold: bool(o.fold, OPT0.fold), startFolded: bool(o.startFolded, OPT0.startFolded),
            nums: bool(o.nums, OPT0.nums), numW: one(o.numW, NUMW, OPT0.numW), blockNums: o.blockNums === 'sec' ? 'sec' : 'seq', count: bool(o.count, OPT0.count), empty: o.empty === 'hide' ? 'hide' : 'grey',
            animalOwn: bool(o.animalOwn, OPT0.animalOwn), editor: o.editor === 'new' ? 'new' : 'avant', phoneFirst: bool(o.phoneFirst, OPT0.phoneFirst)}; // un ancien « Espace entre sections » (gap) est ignoré sans erreur
    }
    const opts = () => cleanOpts(lsGet(OPT_KEY, {}));
    const saveOpts = o => lsSet(OPT_KEY, cleanOpts(o));
    const roman = n => { let s = '', x = n; [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']].forEach(([v, r]) => { while (x >= v) { s += r; x -= v; } }); return s; };
    const numText = (n, w) => (w === 'I' ? roman(n) : w === 'A' ? (n <= 26 ? String.fromCharCode(64 + n) : String(n)) : String(n));

    /* ═════════════════════════ Les sections d'une sorte de fiche (et d'une fiche) ═════════════════════════ */
    const cleanText = (v, n) => String(v ?? '').replace(/[<>"`]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
    function cleanSections(v) {
        if (!Array.isArray(v)) return null;
        const seen = new Set(), out = [];
        v.forEach(s => { if (!isObj(s)) return; const id = String(s.id || ''); if (!/^s_[a-z0-9_]{1,40}$/.test(id) || seen.has(id)) return; seen.add(id); out.push({id, name: cleanText(s.name, 60) || 'Section', icon: cleanText(s.icon, 8), hidden: !!s.hidden, folded: !!s.folded}); });
        return out.slice(0, 40);
    }
    function cleanAssign(v, ids) { const out = {}; if (isObj(v)) Object.entries(v).forEach(([k, s]) => { if (/^[a-z0-9_]{1,60}$/i.test(k) && ids.has(String(s))) out[k] = String(s); }); return out; }
    const secOf = row => ({id: row[0], name: row[1], icon: row[2], hidden: false, folded: false});
    /** les sections calculées quand on n'a encore rien réglé */
    function derive(kind, order) {
        const sections = SEC0[kind === 'animal' ? 'animal' : 'human'].map(secOf), assign = {};
        if (kind === 'animal') { order.forEach(k => { assign[k] = A_NAT[k] || 's_fiche'; }); return {sections, assign}; }
        // personnes : une section commence à son premier bloc « repère » ; l'ordre des blocs (et donc la fiche) ne change pas
        const opened = []; let cur = '';
        order.forEach(k => { const a = H_ANCHOR[k]; if (a && !opened.includes(a)) { opened.push(a); cur = a; } if (!cur) { cur = 's_ident'; opened.push(cur); } assign[k] = cur; });
        const byId = Object.fromEntries(sections.map(s => [s.id, s]));
        return {sections: [...opened.map(id => byId[id]), ...sections.filter(s => !opened.includes(s.id))], assign};
    }
    const ANIMALS = () => A().ANIMAL_BLOCKS || [];
    const exceptionKey = pid => `genealogie-person-blocks-${Number(pid)}`;
    const hasException = pid => { try { return !!Number(pid) && localStorage.getItem(exceptionKey(pid)) !== null; } catch (_) { return false; } };
    const ownSections = pid => { const v = lsGet(exceptionKey(pid), null); return isObj(v) && Array.isArray(v.sections); };
    /** le rangement d'une sorte de fiche (personId = 0) ou d'une fiche (avec son exception) */
    function model(kind, personId = 0) {
        kind = kind === 'animal' ? 'animal' : 'human';
        migratePetLayout();
        const s = A().personBlockSettings ? A().personBlockSettings(Number(personId) || 0, kind) : {order: [], hidden: [], widths: {}};
        const order = kind === 'human' ? s.order.filter(k => !ANIMALS().includes(k)) : [...s.order];
        const o = opts(), secKind = kind === 'animal' && !o.animalOwn ? 'human' : kind;
        const src = secKind === kind ? s : A().personBlockSettings(Number(personId) || 0, 'human');
        let sections = cleanSections(src.sections), assign = null, derived = false;
        if (sections) assign = cleanAssign(src.assign, new Set(sections.map(x => x.id)));
        else { const d = derive(secKind, secKind === kind ? order : src.order.filter(k => !ANIMALS().includes(k))); sections = d.sections; assign = d.assign; derived = true; }
        if (secKind !== kind) { const first = sections[0]?.id; order.forEach(k => { if (!assign[k] && first) assign[k] = first; }); } // les blocs propres aux animaux : dans la première section des personnes
        return {kind, personId: Number(personId) || 0, secKind, order, hidden: [...(s.hidden || [])], widths: {...(s.widths || {})}, hideEmptyIdentity: !!s.hideEmptyIdentity, sections, assign, derived};
    }
    function groups(m) {
        const ids = new Set(m.sections.map(x => x.id));
        return {secs: m.sections.map(sec => ({...sec, keys: m.order.filter(k => m.assign[k] === sec.id)})), loose: m.order.filter(k => !ids.has(m.assign[k]))};
    }
    /** garde un rangement (tout de suite : K2) */
    function save(m) {
        const hidden = m.hidden.filter((k, i, l) => l.indexOf(k) === i), widths = {...m.widths}, sections = cleanSections(m.sections) || [], assign = cleanAssign(m.assign, new Set(sections.map(x => x.id)));
        const fullOrder = (kind, order) => { if (kind !== 'human') return order; const prev = (A().personBlockSettings?.(m.personId, 'human')?.order || []); const animals = prev.filter(k => ANIMALS().includes(k)); return [...order, ...animals.filter(k => !order.includes(k))]; };
        if (m.personId) {
            const cur = lsGet(exceptionKey(m.personId), {}) || {};
            lsSet(exceptionKey(m.personId), {...(isObj(cur) ? cur : {}), order: fullOrder(m.kind, m.order), hidden, widths, hideEmptyIdentity: !!m.hideEmptyIdentity, sections, assign});
            return;
        }
        const key = A().blockBaseKey ? A().blockBaseKey(m.kind) : (m.kind === 'animal' ? 'genealogie-animal-blocks' : 'genealogie-person-blocks');
        const cur = lsGet(key, {}) || {};
        const next = {...(isObj(cur) ? cur : {}), order: fullOrder(m.kind, m.order), hidden, widths, hideEmptyIdentity: !!m.hideEmptyIdentity};
        if (m.secKind === m.kind) { next.sections = sections; next.assign = assign; }
        lsSet(key, next);
        if (m.secKind !== m.kind) { // les animaux prennent les sections des personnes : on les range là
            const hk = A().blockBaseKey ? A().blockBaseKey('human') : 'genealogie-person-blocks', h = lsGet(hk, {}) || {};
            const hm = model('human', 0); const hAssign = {...hm.assign, ...assign};
            lsSet(hk, {...(isObj(h) ? h : {}), sections, assign: cleanAssign(hAssign, new Set(sections.map(x => x.id)))});
        }
    }
    /** l'ancien rangement de la page simple « fiche d'animal » : repris une fois dans l'ordre des blocs des animaux */
    let petLayoutDone = false;
    function migratePetLayout() {
        if (petLayoutDone || !A().personBlockSettings) return; petLayoutDone = true;
        try {
            const old = lsGet(PET_LAYOUT_KEY, null); if (!isObj(old) || !Array.isArray(old.order)) return;
            const key = A().blockBaseKey ? A().blockBaseKey('animal') : 'genealogie-animal-blocks', cur = lsGet(key, null);
            if (isObj(cur) && cur.petLayout) return;
            const s = A().personBlockSettings(0, 'animal');
            const wanted = []; old.order.forEach(p => { const b = PET_PART[p] || (/^cs_/.test(p) ? 'animal_custom' : ''); if (b && !wanted.includes(b) && s.order.includes(b)) wanted.push(b); });
            const slots = s.order.map((k, i) => (wanted.includes(k) ? i : -1)).filter(i => i >= 0), order = [...s.order];
            slots.forEach((at, n) => { order[at] = wanted[n]; });
            const hiddenParts = Array.isArray(old.hidden) ? old.hidden : [];
            const hid = wanted.filter(b => { const parts = Object.keys(PET_PART).filter(p => PET_PART[p] === b); return parts.length && parts.every(p => hiddenParts.includes(p)); });
            lsSet(key, {...(isObj(cur) ? cur : {}), order, hidden: [...new Set([...(s.hidden || []), ...hid])], widths: s.widths, hideEmptyIdentity: !!s.hideEmptyIdentity, petLayout: 1});
        } catch (e) { console.warn(e); }
    }

    /* ═════════════════════════ La fiche : les sections et leurs blocs ═════════════════════════ */
    const isPhone = () => { try { return matchMedia('(max-width: 700px)').matches; } catch (_) { return false; } };
    const foldStore = () => { const v = lsGet(FOLD_KEY, {}); return isObj(v) ? v : {}; };
    function isFolded(kind, sec, i, o) {
        if (!o.fold) return false;
        const st = foldStore()[kind] || {};
        if (typeof st[sec.id] === 'boolean') return st[sec.id];
        if (isPhone() && o.phoneFirst) return i > 0; // sur téléphone : la première section ouverte, les autres repliées
        return !!sec.folded || o.startFolded;
    }
    function setFolded(kind, id, folded) { const v = foldStore(); v[kind] = {...(v[kind] || {}), [id]: !!folded}; lsSet(FOLD_KEY, v); }
    const tabStore = () => { const v = lsGet(TAB_KEY, {}); return isObj(v) ? v : {}; };
    const countOf = html => { let n = 0; String(html).replace(/<h3[^>]*>[\s\S]*?<small>\((\d+)\)<\/small>/g, (_, c) => { n += Number(c) || 0; return ''; }); return n; };
    const kindLabel = kind => (kind === 'animal' ? 'animaux' : 'personnes');
    /* ── 🔗 l'adresse de la fiche : « #personnes/12/famille » (nom de la section sans accents, ou son identifiant stable) ── */
    const slugOf = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    const secSlug = sec => (sec.id === '__all' ? 'tout' : slugOf(sec.name) || sec.id);
    /** la section que dit l'adresse, parmi celles montrées ; '__all' pour « tout » ; null si inconnue (= onglet par défaut, sans erreur) */
    function secFromSlug(secs, slug) {
        slug = String(slug || '').toLowerCase(); if (!slug) return null;
        if (slug === 'tout' || slug === '__all') return '__all';
        const hit = secs.find(s => slugOf(s.name) === slug) || secs.find(s => s.id === slug || s.id.replace(/^s_/, '') === slug);
        return hit ? hit.id : null;
    }
    /** le corps de la fiche : sections, onglets, « Sans section » (appelé par renderPerson, app.js ; preview = l'aperçu des Réglages) */
    function renderSheet(personId, kind, renderers, {preview = false} = {}) {
        const m = model(kind, personId), o = opts(), g = groups(m), ro = RO();
        const tabs = o.style === 'tabs';
        const defaults = A().defaultPersonBlocks || [];
        let counter = 1, secNo = 0;
        const one = (key, index) => {
            try {
                const block = renderers[key](index);
                return block ? A().applyBlockWidth(String(block).replace('<section class="card', `<section data-pblock="${esc(key)}" class="card`), m.widths?.[key]) : '';
            } catch (error) {
                console.error(`Erreur dans le bloc personne "${key}"`, error);
                const label = defaults.find(row => row[0] === key)?.[1] || key;
                return A().applyBlockWidth(A().card(index, label, '', `<div class="empty-card">Ce bloc a été isolé car il provoquait une erreur : ${esc(error.message || 'erreur JavaScript')}</div>`), m.widths?.[key]);
            }
        };
        const blocksOf = (keys, prefix) => { let j = 0; return keys.filter(k => !m.hidden.includes(k) && renderers[k]).map(k => { const idx = prefix ? `${prefix}.${j + 1}` : String(counter).padStart(2, '0'); const h = one(k, idx); if (h) { j++; counter++; } return h; }).filter(Boolean); };
        const shown = [];
        g.secs.forEach(sec => {
            if (sec.hidden) return;
            const no = secNo + 1;
            const items = blocksOf(sec.keys, o.blockNums === 'sec' ? numText(no, o.nums ? o.numW : '1') : '');
            if (!items.length && o.empty === 'hide') return;
            secNo = no; shown.push({sec, no, items, count: items.reduce((n, h) => n + countOf(h), 0)});
        });
        const looseItems = blocksOf(g.loose, '');
        const store = tabStore(), sh = !preview ? A().state?.sheetHash : null;
        const asked = sh && sh.pending && Number(sh.id) === m.personId ? secFromSlug(shown.map(x => x.sec), sh.slug) : null; // l'adresse passe devant l'onglet retenu
        const want = asked && (asked !== '__all' || o.all !== 'none') ? asked : store[kind];
        const active = tabs ? (want === '__all' && o.all !== 'none' ? '__all' : shown.some(x => x.sec.id === want) ? want : shown[0]?.sec.id || '__all') : '';
        const allBtn = `<button type="button" role="tab" class="fsec-tab is-all${active === '__all' ? ' is-active' : ''}" data-fsec-tab="__all" aria-selected="${active === '__all'}">▦ Tout voir</button>`;
        const tabsBar = tabs ? `<div class="fsec-tabs-wrap is-place-${o.place}"><div class="segmented fsec-tabs" role="tablist" aria-label="Sections de la fiche">${o.all === 'left' ? allBtn : ''}${shown.map(x => `<button type="button" role="tab" class="fsec-tab${x.sec.id === active ? ' is-active' : ''}${x.items.length ? '' : ' is-empty'}" data-fsec-tab="${esc(x.sec.id)}" aria-selected="${x.sec.id === active}">${x.sec.icon ? `<span aria-hidden="true">${esc(x.sec.icon)}</span> ` : ''}${esc(x.sec.name)}${o.count && x.count ? ` <small>(${x.count})</small>` : ''}</button>`).join('')}${o.all === 'right' ? allBtn : ''}</div>${ro ? '' : '<button type="button" class="icon-button small fsec-gear" data-fsec-arrange title="⚙️ Ranger les sections…" aria-label="Ranger les sections">⚙️</button>'}</div>` : '';
        const secHtml = (x, i) => {
            const folded = !tabs && isFolded(kind, x.sec, i, o), empty = !x.items.length, hide = tabs && active !== '__all' && active !== x.sec.id;
            const num = o.nums ? `<span class="fsec-num">${esc(numText(x.no, o.numW))}</span>` : '';
            return `<section class="fsec${empty ? ' is-empty' : ''}${folded ? ' is-folded' : ''}" data-fsec="${esc(x.sec.id)}"${hide ? ' hidden' : ''}>
                <header class="fsec-head"><button type="button" class="fsec-toggle" data-fsec-fold aria-expanded="${!folded}"${o.fold && !tabs ? '' : ' disabled'}>${num}${x.sec.icon ? `<span class="fsec-ic" aria-hidden="true">${esc(x.sec.icon)}</span>` : ''}<span class="fsec-name">${esc(x.sec.name)}</span><span class="fsec-meta">· ${empty ? 'vide' : esc(plural(x.items.length, 'bloc'))}</span></button>
                <span class="fsec-tools">${ro ? '' : `<button type="button" class="icon-button small fsec-more" data-fsec-more title="Plus d’actions sur la section" aria-label="Plus d’actions sur la section « ${esc(x.sec.name)} »">⋯</button>`}${o.fold && !tabs ? `<span class="fsec-chev" aria-hidden="true">▾</span>` : ''}</span></header>
                <div class="card-grid fsec-body"${folded ? ' hidden' : ''}>${x.items.join('') || (A().empty ? A().empty('Rien dans cette section pour l’instant.', {icon: x.sec.icon || '📭'}) : '')}</div></section>`;
        };
        const own = m.personId && hasException(m.personId) && !ro ? `<p class="fsec-own"><span class="fsec-own-dot" aria-hidden="true"></span>Rangement propre à cette fiche <button type="button" class="link-button" data-fsec-unown>↺ Reprendre celui de toutes les fiches</button></p>` : '';
        return `<div class="fsec-wrap is-${o.style}${tabs ? ` is-tabs${active === '__all' ? ' is-all' : ''}` : ''}" data-fsec-kind="${kind}" data-fsec-person="${m.personId}">${own}${tabsBar}${shown.map(secHtml).join('')}${looseItems.length ? `<section class="fsec is-loose" data-fsec="__loose"><div class="card-grid fsec-body">${looseItems.join('')}</div></section>` : ''}</div>`;
    }

    /* ── les gestes sur la fiche : replier, onglets, ⋯ d'une section, exception ── */
    const wrapOf = el => el?.closest?.('.fsec-wrap');
    function showTab(wrap, id, focus = false) {
        const kind = wrap.dataset.fsecKind, all = id === '__all';
        const v = tabStore(); v[kind] = id; lsSet(TAB_KEY, v);
        wrap.classList.toggle('is-all', all);
        wrap.querySelectorAll('[data-fsec-tab]').forEach(b => { const on = b.dataset.fsecTab === id; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); if (on) { if (focus) b.focus(); try { b.scrollIntoView({block: 'nearest', inline: 'center'}); } catch (_) {} } });
        wrap.querySelectorAll(':scope > .fsec:not(.is-loose)').forEach(s => { s.hidden = !all && s.dataset.fsec !== id; });
        routeTo(wrap);
    }
    /** l'onglet ouvert va dans l'adresse (remplacée : pas une entrée d'historique par clic) */
    function routeTo(wrap) {
        if (!wrap?.isConnected || !wrap.closest('#workspace') || !wrap.classList.contains('is-tabs')) return;
        const pid = Number(wrap.dataset.fsecPerson) || 0, id = wrap.querySelector('[data-fsec-tab].is-active')?.dataset.fsecTab; if (!pid || !id) return;
        const sec = id === '__all' ? {id} : model(wrap.dataset.fsecKind, pid).sections.find(s => s.id === id);
        if (sec) A().setSheetRoute?.(pid, secSlug(sec));
    }
    /** l'adresse demande une section (lien copié, rechargement, ← →) : son onglet ; sinon on la déplie et on y descend */
    function applyRoute() {
        const st = A().state || {}, wrap = document.querySelector('#workspace .person-page .fsec-wrap'); if (!wrap) return false;
        const pid = Number(wrap.dataset.fsecPerson) || 0, sh = st.sheetHash, tabs = wrap.classList.contains('is-tabs');
        if (sh && sh.pending && Number(sh.id) === pid) {
            sh.pending = false;
            const here = [...wrap.querySelectorAll(':scope > .fsec[data-fsec]:not(.is-loose)')].map(x => x.dataset.fsec), m = model(wrap.dataset.fsecKind, pid);
            const id = secFromSlug(m.sections.filter(x => here.includes(x.id)), sh.slug);
            if (tabs) { if (id && wrap.querySelector(`[data-fsec-tab="${CSS.escape(id)}"]`)) showTab(wrap, id); }
            else if (id && id !== '__all') {
                const sec = wrap.querySelector(`:scope > .fsec[data-fsec="${CSS.escape(id)}"]`);
                if (sec) { if (sec.classList.contains('is-folded')) fold(sec, false); setTimeout(() => { try { sec.scrollIntoView({block: 'start'}); } catch (_) {} }, 80); }
            }
            if (!id) A().setSheetRoute?.(pid, ''); // section inconnue : l'onglet par défaut, l'adresse sans section
        }
        if (tabs) routeTo(wrap);
        return true;
    }
    /** ouvre la fiche sur un bloc : sa section dépliée (ou son onglet), puis le bloc à l'écran (anciens liens : « ↗ Santé ») */
    function revealBlock(key, {scroll = true} = {}) {
        const card = document.querySelector(`#workspace [data-pblock="${CSS.escape(key)}"]`); if (!card) return false;
        const sec = card.closest('.fsec'), wrap = wrapOf(card);
        if (wrap?.classList.contains('is-tabs') && sec && sec.hidden) showTab(wrap, sec.dataset.fsec);
        if (sec?.classList.contains('is-folded')) fold(sec, false);
        if (scroll) { card.scrollIntoView({block: 'start'}); card.classList.add('h-flash'); setTimeout(() => card.classList.remove('h-flash'), 2200); }
        return true;
    }
    function fold(sec, folded) {
        const wrap = wrapOf(sec); if (!wrap) return;
        sec.classList.toggle('is-folded', folded);
        const body = sec.querySelector('.fsec-body'); if (body) body.hidden = folded;
        sec.querySelector('[data-fsec-fold]')?.setAttribute('aria-expanded', String(!folded));
        setFolded(wrap.dataset.fsecKind, sec.dataset.fsec, folded);
        if (!folded) window.dispatchEvent(new Event('resize')); // les cartes d'un bloc qui s'ouvre se recalent
    }
    /** une fiche qui a son rangement à elle : les gestes de la fiche y vont ; sinon dans « toutes les fiches » */
    const targetModel = wrap => { const kind = wrap.dataset.fsecKind, pid = Number(wrap.dataset.fsecPerson) || 0; return model(kind, ownSections(pid) ? pid : 0); };
    const rerender = () => { if (A().rerenderPerson) A().rerenderPerson(); else if (A().state?.currentPersonId) A().selectPerson?.(A().state.currentPersonId, false); };
    async function sectionMenu(btn) {
        const wrap = wrapOf(btn), sec = btn.closest('.fsec'); if (!wrap || !sec) return;
        const m = targetModel(wrap), i = m.sections.findIndex(s => s.id === sec.dataset.fsec), s = m.sections[i]; if (!s) return;
        const o = opts(), keys = keysOf(m);
        const run = (label, fn) => () => { A().undoLocalChange ? A().undoLocalChange(label, keys, () => { fn(m); save(m); }, rerender) : (fn(m), save(m)); rerender(); };
        UI().menuAt?.(btn, [
            {icon: '✎', label: 'Renommer', run: async () => { const v = cleanText(await A().askText?.({title: 'Renommer la section', value: s.name, okLabel: 'Renommer'}), 60); if (v) run(`Section renommée : « ${v} »`, mm => { mm.sections[i].name = v; })(); }},
            {icon: '🙂', label: 'Changer l’icône', run: () => pickIcon(btn, s.icon, ic => run(`Icône de la section « ${s.name} » changée`, mm => { mm.sections[i].icon = ic; })())},
            '-',
            {icon: '↑', label: 'Monter', shortcut: 'Alt+ArrowUp', disabled: i === 0, run: run(`Section « ${s.name} » montée`, mm => { mm.sections.splice(i - 1, 0, mm.sections.splice(i, 1)[0]); })},
            {icon: '↓', label: 'Descendre', shortcut: 'Alt+ArrowDown', disabled: i === m.sections.length - 1, run: run(`Section « ${s.name} » descendue`, mm => { mm.sections.splice(i + 1, 0, mm.sections.splice(i, 1)[0]); })},
            o.fold && !wrap.classList.contains('is-tabs') ? {icon: sec.classList.contains('is-folded') ? '▾' : '▸', label: sec.classList.contains('is-folded') ? 'Déplier' : 'Replier', run: () => fold(sec, !sec.classList.contains('is-folded'))} : null,
            '-',
            {icon: '⚙️', label: 'Ranger les sections…', run: () => openArrangeDialog()},
            {icon: '🗑', label: 'Supprimer la section', danger: true, run: () => deleteSection(m, s.id, rerender)},
        ].filter(Boolean), {title: `« ${s.name} »`});
    }
    const keysOf = m => (m.personId ? [exceptionKey(m.personId)] : [A().blockBaseKey?.(m.kind) || 'genealogie-person-blocks', ...(m.secKind !== m.kind ? [A().blockBaseKey?.('human') || 'genealogie-person-blocks'] : [])]);
    /** H7 : pas de question ; les blocs vont dans « Sans section » ; « ↶ Annuler » la remet */
    function deleteSection(m, id, after) {
        const s = m.sections.find(x => x.id === id); if (!s) return;
        const n = m.order.filter(k => m.assign[k] === id).length;
        const msg = `Section « ${s.name} » supprimée${n ? ` · ${n > 1 ? `ses ${n} blocs vont` : 'son bloc va'} dans « Sans section »` : ''}`;
        const change = () => { m.sections = m.sections.filter(x => x.id !== id); Object.keys(m.assign).forEach(k => { if (m.assign[k] === id) delete m.assign[k]; }); save(m); };
        if (A().undoLocalChange) A().undoLocalChange(msg, keysOf(m), change, async () => { await after?.(); }); else change();
        after?.();
    }
    /** une icône : la grille d'émojis de l'app, posée près du bouton */
    function pickIcon(anchor, cur, done) {
        const r = anchor.getBoundingClientRect(), input = document.createElement('input');
        input.className = 'fsec-icon-probe'; input.value = cur || ''; input.setAttribute('aria-hidden', 'true'); input.tabIndex = -1;
        Object.assign(input.style, {position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, opacity: '0', pointerEvents: 'none'});
        (anchor.closest('dialog') || document.body).appendChild(input);
        const end = v => { input.remove(); if (v) done(cleanText(v, 8)); };
        if (ext.pickEmoji) { ext.pickEmoji(input, v => end(v), {}); setTimeout(() => { if (!document.querySelector('.h-emoji-pop')) input.remove(); }, 60000); }
        else A().askText?.({title: 'Icône de la section', value: cur || '', okLabel: 'Choisir'}).then(end);
    }
    let bound = false;
    function bindSheet() {
        if (bound) return; bound = true;
        document.addEventListener('click', e => {
            const t = e.target; if (!t.closest?.('#workspace .fsec-wrap, #workspace .person-page')) return;
            const f = t.closest('[data-fsec-fold]'); if (f && !f.disabled) { const sec = f.closest('.fsec'); fold(sec, !sec.classList.contains('is-folded')); return; }
            const tb = t.closest('[data-fsec-tab]'); if (tb) { showTab(wrapOf(tb), tb.dataset.fsecTab); return; }
            const mo = t.closest('[data-fsec-more]'); if (mo) { e.preventDefault(); sectionMenu(mo); return; }
            if (t.closest('[data-fsec-arrange]')) { openArrangeDialog(); return; }
            const un = t.closest('[data-fsec-unown]');
            if (un) { const pid = Number(wrapOf(un)?.dataset.fsecPerson) || 0; if (!pid) return; const k = exceptionKey(pid); const change = () => { try { localStorage.removeItem(k); } catch (_) {} }; if (A().undoLocalChange) A().undoLocalChange('Le rangement de toutes les fiches est repris', [k], change, rerender); else change(); rerender(); }
        });
        document.addEventListener('keydown', e => {
            const tb = e.target.closest?.('.fsec-tabs [data-fsec-tab]'); if (!tb || !/^Arrow(Left|Right)$/.test(e.key) || e.altKey || e.metaKey || e.ctrlKey) return;
            const all = [...tb.parentElement.querySelectorAll('[data-fsec-tab]')], i = all.indexOf(tb), next = all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
            if (next) { e.preventDefault(); showTab(wrapOf(tb), next.dataset.fsecTab, true); }
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindSheet); else bindSheet();

    /* ═════════════════════════ L'éditeur des sections (« Comme avant » F11, « Nouveau » F6/F10) ═════════════════════════ */
    const blockLabel = (key, kind) => { const raw = (A().defaultPersonBlocks || []).find(r => r[0] === key)?.[1] || key; return kind === 'animal' || /^animal/.test(key) ? raw.replace(/^(\S+) Animal : (.)/, (_, ic, c) => `${ic} ${c.toUpperCase()}`) : raw; };
    const uid = () => 's_' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
    /** html de l'éditeur ; ctx = {kind, personId, look, id} */
    function editorHtml(ctx) {
        const m = model(ctx.kind, ctx.personId), g = groups(m), look = ctx.look === 'new' ? 'new' : 'avant', ro = RO();
        const W = A().defaultPersonBlockSpans || {};
        let n = 0;
        const widthBtns = (key) => `<div class="block-widths fsed-widths" role="group" aria-label="Largeur du bloc">${WIDTHS.map(([v, nu, avant]) => `<button type="button" data-fsed-width="${v}" aria-pressed="${String(m.widths[key] || W[key] || '12') === v}" title="Largeur ${avant}">${look === 'new' ? nu : avant}</button>`).join('')}</div>`;
        const eye = (on, what, attr) => (look === 'new'
            ? `<button type="button" class="icon-button small fsed-eye${on ? '' : ' is-off'}" ${attr} aria-pressed="${on}" title="${on ? `Cacher ${what}` : `Montrer ${what}`}" aria-label="${on ? `Cacher ${what}` : `Montrer ${what}`}">${on ? '👁' : '🙈'}</button>`
            : `<label class="order-visible fsed-check" title="${on ? `Cacher ${what}` : `Montrer ${what}`}"><input type="checkbox" ${attr} ${on ? 'checked' : ''} aria-label="Montrer ${what}"></label>`);
        const brow = key => { const vis = !m.hidden.includes(key); if (vis) n++; const lab = blockLabel(key, m.kind);
            return `<div class="order-row has-visibility fsed-brow${vis ? '' : ' is-hidden'}" data-fsed-block="${esc(key)}" data-order-key="${esc(key)}"><span class="order-grip fsed-grip" data-fsed-grip tabindex="0" role="button" aria-label="Déplacer « ${esc(lab)} » : glisse, ou Alt + ↑ / ↓">⠿</span><span class="order-number">${vis ? String(n).padStart(2, '0') : '—'}</span><b>${esc(lab)}</b>${widthBtns(key)}${eye(vis, `le bloc « ${lab} »`, 'data-fsed-bshow')}${ro ? '' : `<button type="button" class="icon-button small fsed-more" data-fsed-bmore title="Plus d’actions" aria-label="Plus d’actions sur « ${esc(lab)} »">⋯</button>`}</div>`; };
        const secs = g.secs.map((s, i) => { const vis = !s.hidden;
            return `<div class="fsed-sec${vis ? '' : ' is-hidden'}" data-fsed-sec="${esc(s.id)}"><div class="order-row fsed-secrow"><span class="order-grip fsed-grip" data-fsed-grip tabindex="0" role="button" aria-label="Déplacer la section « ${esc(s.name)} » : glisse, ou Alt + ↑ / ↓">⠿</span><span class="order-number fsed-secno">${String(i + 1).padStart(2, '0')}</span><span class="fsed-ic" aria-hidden="true">${esc(s.icon || '▢')}</span><b class="fsed-name" data-fsed-rename title="Double-clic pour renommer">${esc(s.name)}</b><small class="fsed-count">${esc(plural(s.keys.length, 'bloc'))}${vis ? '' : ' · cachée'}${s.folded ? ' · repliée au départ' : ''}</small>${eye(vis, `la section « ${s.name} »`, 'data-fsed-sshow')}${ro ? '' : `<button type="button" class="icon-button small fsed-more" data-fsed-smore title="Plus d’actions" aria-label="Plus d’actions sur la section « ${esc(s.name)} »">⋯</button>`}</div>
                <div class="fsed-blocks" data-fsed-list="${esc(s.id)}">${s.keys.map(brow).join('') || '<p class="fsed-empty">Vide : glisse des blocs ici.</p>'}</div></div>`; }).join('');
        const loose = `<div class="fsed-sec is-loose" data-fsed-sec="__loose"><div class="fsed-secrow is-loose"><span class="fsed-ic" aria-hidden="true">▢</span><b>Sans section</b><small class="fsed-count">${g.loose.length ? 's’affichent à la fin de la fiche' : 'vide'}</small></div><div class="fsed-blocks" data-fsed-list="__loose">${g.loose.map(brow).join('')}</div></div>`;
        return `<div class="fsed is-${look}" data-fsed data-fsed-kind="${m.kind}" data-fsed-person="${m.personId}" data-fsed-look="${look}">
            <div class="fsed-list order-list block-order-list">${secs}${loose}</div>
            ${ro ? '' : `<div class="fsed-add" data-fsed-addbox><button type="button" class="${look === 'new' ? 'link-button' : 'button small'} fsed-addbtn" data-fsed-add>＋ Nouvelle section</button><div class="fsed-addform" hidden><button type="button" class="icon-button fsed-addic" data-fsed-addic title="Choisir une icône" aria-label="Choisir une icône">🧩</button><input type="text" maxlength="60" data-fsed-addname placeholder="Nom de la section (« Suivi », « Métier »…)" aria-label="Nom de la nouvelle section"><button type="button" class="button small" data-fsed-addok>Créer la section</button><button type="button" class="button small secondary" data-fsed-addcancel>Annuler</button></div></div>`}
            <p class="fsed-help muted">Au clavier : Tab jusqu’à ⠿ puis ${keyHtml('Alt+ArrowUp')} / ${keyHtml('Alt+ArrowDown')} · ⋯ d’une section : Renommer, Changer l’icône, Monter, Descendre, Supprimer (↶ Annuler).</p>
            ${UI().toggleHtml ? UI().toggleHtml('Masquer les lignes vides (pas remplies) du bloc Identité', {checked: m.hideEmptyIdentity, attrs: 'data-fsed-hideempty'}) : ''}</div>`;
    }
    const keyHtml = combo => (A().keys?.html ? A().keys.html(combo) : esc(combo.replace('ArrowUp', '↑').replace('ArrowDown', '↓')));
    /** un geste de l'éditeur : gardé tout de suite (K2), l'éditeur redessiné, la fiche ouverte aussi */
    function commit(host, mutate, {label = '', undo = false} = {}) {
        const ed = host.querySelector('[data-fsed]'); if (!ed) return;
        const m = model(ed.dataset.fsedKind, Number(ed.dataset.fsedPerson) || 0);
        const keys = keysOf(m);
        notify(host); // la page de réglages (K2) note le geste avant qu'il change
        const change = () => { mutate(m); save(m); };
        if (undo && A().undoLocalChange) A().undoLocalChange(label, keys, change, () => redrawAll()); else change();
        redrawAll();
        if (A().state?.module === 'personnes') rerender();
    }
    const notify = host => { host.dispatchEvent(new Event('change', {bubbles: true})); };
    const HOSTS = new Set();
    function redrawAll() { HOSTS.forEach(h => { if (!h.isConnected) { HOSTS.delete(h); return; } drawEditor(h); }); document.querySelectorAll('[data-fsec-pv]').forEach(x => { x.innerHTML = previewHtml(x.dataset.fsecPv); }); refreshLive(); }
    function drawEditor(host) {
        const ctx = host._fsed; if (!ctx) return;
        const focus = document.activeElement && host.contains(document.activeElement) ? sigOf(document.activeElement) : null;
        host.innerHTML = editorHtml(ctx);
        if (focus) { const el = host.querySelector(focus); el?.focus({preventScroll: true}); }
        ctx.after?.(host);
    }
    const sigOf = el => { const r = el.closest('[data-fsed-block], [data-fsed-sec]'); if (!r) return null; const b = r.closest('[data-fsed-block]'); const base = b ? `[data-fsed-block="${CSS.escape(b.dataset.fsedBlock)}"]` : `[data-fsed-sec="${CSS.escape(r.dataset.fsedSec)}"] > .fsed-secrow`; return `${base} ${el.matches('[data-fsed-grip]') ? '[data-fsed-grip]' : el.matches('[data-fsed-bshow],[data-fsed-sshow]') ? '[data-fsed-bshow],[data-fsed-sshow]' : '[data-fsed-grip]'}`; };
    /** monte un éditeur dans host ; ctx = {kind, personId, look, after} */
    function mountEditor(host, ctx) {
        host._fsed = ctx; HOSTS.add(host); drawEditor(host);
        if (host._fsedBound) return host; host._fsedBound = true;
        host.addEventListener('click', e => onEditorClick(host, e));
        host.addEventListener('change', e => {
            const t = e.target;
            if (t.matches('[data-fsed-bshow]')) { const k = t.closest('[data-fsed-block]').dataset.fsedBlock; commit(host, m => { m.hidden = t.checked ? m.hidden.filter(x => x !== k) : [...m.hidden, k]; }); }
            else if (t.matches('[data-fsed-sshow]')) { const id = t.closest('[data-fsed-sec]').dataset.fsedSec; commit(host, m => { const s = m.sections.find(x => x.id === id); if (s) s.hidden = !t.checked; }); }
            else if (t.matches('[data-fsed-hideempty]')) commit(host, m => { m.hideEmptyIdentity = t.checked; });
        });
        host.addEventListener('dblclick', e => { const n = e.target.closest('[data-fsed-rename]'); if (n) renameInline(host, n); });
        host.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-fsed-addname]')) { e.preventDefault(); host.querySelector('[data-fsed-addok]')?.click(); } if (e.key === 'Escape' && e.target.matches('[data-fsed-addname]')) host.querySelector('[data-fsed-addcancel]')?.click(); });
        host.addEventListener('pointerdown', e => startDrag(host, e));
        return host;
    }
    function onEditorClick(host, e) {
        const t = e.target;
        const w = t.closest('[data-fsed-width]'); if (w) { const k = w.closest('[data-fsed-block]').dataset.fsedBlock; commit(host, m => { m.widths[k] = w.dataset.fsedWidth; }); return; }
        const be = t.closest('button[data-fsed-bshow]'); if (be) { const k = be.closest('[data-fsed-block]').dataset.fsedBlock; commit(host, m => { m.hidden = m.hidden.includes(k) ? m.hidden.filter(x => x !== k) : [...m.hidden, k]; }); return; }
        const se = t.closest('button[data-fsed-sshow]'); if (se) { const id = se.closest('[data-fsed-sec]').dataset.fsedSec; commit(host, m => { const s = m.sections.find(x => x.id === id); if (s) s.hidden = !s.hidden; }); return; }
        const bm = t.closest('[data-fsed-bmore]'); if (bm) { blockMenu(host, bm); return; }
        const sm = t.closest('[data-fsed-smore]'); if (sm) { secMenu(host, sm); return; }
        const box = host.querySelector('[data-fsed-addbox]');
        if (t.closest('[data-fsed-add]')) { box.querySelector('.fsed-addform').hidden = false; t.closest('[data-fsed-add]').hidden = true; box.querySelector('[data-fsed-addname]').focus(); return; }
        if (t.closest('[data-fsed-addcancel]')) { box.querySelector('.fsed-addform').hidden = true; box.querySelector('[data-fsed-add]').hidden = false; return; }
        if (t.closest('[data-fsed-addic]')) { const b = t.closest('[data-fsed-addic]'); pickIcon(b, b.textContent, ic => { b.textContent = ic; }); return; }
        if (t.closest('[data-fsed-addok]')) {
            const inp = box.querySelector('[data-fsed-addname]'), name = cleanText(inp.value, 60);
            if (!name) { UI().fail ? UI().fail(inp, 'Donne un nom à la section.') : inp.focus(); return; }
            const icon = cleanText(box.querySelector('[data-fsed-addic]').textContent, 8);
            commit(host, m => { m.sections.push({id: uid(), name, icon, hidden: false, folded: false}); }, {label: `Section « ${name} » créée`, undo: true});
        }
    }
    function renameInline(host, nameEl) {
        const id = nameEl.closest('[data-fsed-sec]').dataset.fsedSec, old = nameEl.textContent;
        const inp = document.createElement('input'); inp.type = 'text'; inp.maxLength = 60; inp.value = old; inp.className = 'fsed-renamer'; inp.setAttribute('aria-label', 'Nouveau nom de la section');
        nameEl.replaceWith(inp); inp.focus(); inp.select();
        let done = false;
        const end = ok => { if (done) return; done = true; const v = cleanText(inp.value, 60); if (ok && v && v !== old) commit(host, m => { const s = m.sections.find(x => x.id === id); if (s) s.name = v; }); else drawEditor(host); };
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); end(true); } if (e.key === 'Escape') { e.preventDefault(); end(false); } });
        inp.addEventListener('blur', () => end(true));
    }
    /** déplace un bloc : dans sa section (rang) ou dans une autre (avant `before`, sinon à la fin) */
    function moveBlock(m, key, secId, before = null) {
        m.order = m.order.filter(k => k !== key);
        if (secId === '__loose') delete m.assign[key]; else m.assign[key] = secId;
        let at = before ? m.order.indexOf(before) : -1;
        if (at < 0) { const same = m.order.map((k, i) => ((secId === '__loose' ? !m.sections.some(s => s.id === m.assign[k]) : m.assign[k] === secId) ? i : -1)).filter(i => i >= 0); at = same.length ? same[same.length - 1] + 1 : m.order.length; }
        m.order.splice(at, 0, key);
    }
    /** un sous-menu (« Déplacer vers ▸ », « Largeur ▸ ») : ouvert juste après le premier, sous le même bouton */
    const subMenu = (btn, items, o) => setTimeout(() => { const r = btn.getBoundingClientRect(); UI().menuAt?.({x: r.left, y: r.bottom + 8}, items, o); }, 0);
    function blockMenu(host, btn) {
        const ed = host.querySelector('[data-fsed]'), key = btn.closest('[data-fsed-block]').dataset.fsedBlock;
        const m = model(ed.dataset.fsedKind, Number(ed.dataset.fsedPerson) || 0), g = groups(m);
        const here = m.sections.some(s => s.id === m.assign[key]) ? m.assign[key] : '__loose', list = here === '__loose' ? g.loose : g.secs.find(s => s.id === here).keys, i = list.indexOf(key), lab = blockLabel(key, m.kind);
        UI().menuAt?.(btn, [
            {icon: '↑', label: 'Monter', shortcut: 'Alt+ArrowUp', disabled: i <= 0, run: () => commit(host, mm => moveBlock(mm, key, here, list[i - 1]))},
            {icon: '↓', label: 'Descendre', shortcut: 'Alt+ArrowDown', disabled: i >= list.length - 1, run: () => commit(host, mm => moveBlock(mm, key, here, list[i + 2] || null))},
            {icon: '➜', label: 'Déplacer vers ▸', run: () => subMenu(btn, [...m.sections.map(s => ({icon: s.icon || '▢', label: `${s.name}${s.id === here ? ' · ici' : ''}`, disabled: s.id === here, run: () => commit(host, mm => moveBlock(mm, key, s.id), {label: `« ${lab} » va dans « ${s.name} »`, undo: true})})), {icon: '▢', label: 'Sans section', disabled: here === '__loose', run: () => commit(host, mm => moveBlock(mm, key, '__loose'))}, '-',
                {icon: '＋', label: 'Nouvelle section…', run: async () => { const name = cleanText(await A().askText?.({title: 'Nouvelle section', message: `« ${lab} » y sera rangé.`, okLabel: 'Créer la section'}), 60); if (name) commit(host, mm => { const id = uid(); mm.sections.push({id, name, icon: '🧩', hidden: false, folded: false}); moveBlock(mm, key, id); }, {label: `Section « ${name} » créée`, undo: true}); }}], {title: 'Déplacer vers'})},
            {icon: '↔', label: 'Largeur ▸', run: () => subMenu(btn, WIDTHS.map(([v, nu]) => ({icon: String(m.widths[key] || '12') === v ? '✓' : '', label: nu, run: () => commit(host, mm => { mm.widths[key] = v; })})), {title: 'Largeur'})},
            {icon: m.hidden.includes(key) ? '👁' : '🙈', label: m.hidden.includes(key) ? 'Montrer le bloc' : 'Cacher le bloc', run: () => commit(host, mm => { mm.hidden = mm.hidden.includes(key) ? mm.hidden.filter(x => x !== key) : [...mm.hidden, key]; })},
        ], {title: `« ${lab} »`});
    }
    function secMenu(host, btn) {
        const ed = host.querySelector('[data-fsed]'), id = btn.closest('[data-fsed-sec]').dataset.fsedSec;
        const m = model(ed.dataset.fsedKind, Number(ed.dataset.fsedPerson) || 0), i = m.sections.findIndex(s => s.id === id), s = m.sections[i]; if (!s) return;
        UI().menuAt?.(btn, [
            {icon: '✎', label: 'Renommer', run: () => { const n = host.querySelector(`[data-fsed-sec="${CSS.escape(id)}"] [data-fsed-rename]`); if (n) renameInline(host, n); }},
            {icon: '🙂', label: 'Changer l’icône', run: () => pickIcon(btn, s.icon, ic => commit(host, mm => { const x = mm.sections.find(y => y.id === id); if (x) x.icon = ic; }))},
            {icon: '⧉', label: 'Dupliquer', run: () => commit(host, mm => { mm.sections.splice(i + 1, 0, {...s, id: uid(), name: cleanText(`${s.name} (copie)`, 60)}); }, {label: `Section « ${s.name} » dupliquée (vide)`, undo: true})},
            {icon: s.folded ? '▾' : '▸', label: s.folded ? 'Ouverte au départ' : 'Repliée au départ', run: () => commit(host, mm => { const x = mm.sections.find(y => y.id === id); if (x) x.folded = !x.folded; })},
            {icon: '↑', label: 'Monter', shortcut: 'Alt+ArrowUp', disabled: i === 0, run: () => commit(host, mm => { mm.sections.splice(i - 1, 0, mm.sections.splice(i, 1)[0]); })},
            {icon: '↓', label: 'Descendre', shortcut: 'Alt+ArrowDown', disabled: i === m.sections.length - 1, run: () => commit(host, mm => { mm.sections.splice(i + 1, 0, mm.sections.splice(i, 1)[0]); })},
            {icon: '🗑', label: 'Supprimer la section', danger: true, run: () => { notify(host); deleteSection(m, id, () => { redrawAll(); if (A().state?.module === 'personnes') rerender(); }); }},
        ], {title: `« ${s.name} »`});
    }
    /* ── glisser une poignée ⠿ (souris ou doigt) : le trait bleu montre où ça se pose ── */
    function startDrag(host, e) {
        const grip = e.target.closest('[data-fsed-grip]'); if (!grip || e.button !== 0 || RO()) return;
        const ed = host.querySelector('[data-fsed]'), blockRow = grip.closest('[data-fsed-block]'), secEl = blockRow ? null : grip.closest('[data-fsed-sec]');
        if (!blockRow && !secEl) return;
        e.preventDefault();
        const row = blockRow || secEl.querySelector('.fsed-secrow');
        const marker = document.createElement('div'); marker.className = 'dnd-marker fsed-marker'; Object.assign(marker.style, {position: 'fixed', zIndex: '100000', height: '4px'});
        (host.closest('dialog') || document.body).appendChild(marker);
        row.classList.add('is-dnd-dragging');
        let target = null;
        const place = (x, y) => {
            if (blockRow) {
                const lists = [...ed.querySelectorAll('[data-fsed-list]')];
                let best = lists[0], dist = Infinity;
                lists.forEach(l => { const r = l.closest('.fsed-sec').getBoundingClientRect(); const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0; if (d < dist) { dist = d; best = l; } });
                const rows = [...best.querySelectorAll(':scope > [data-fsed-block]')].filter(r => r !== blockRow);
                const nxt = rows.find(r => { const b = r.getBoundingClientRect(); return b.top + b.height / 2 > y; }) || null;
                target = {sec: best.dataset.fsedList, before: nxt?.dataset.fsedBlock || null};
                const ref = (nxt || rows[rows.length - 1] || best).getBoundingClientRect();
                Object.assign(marker.style, {top: `${(nxt ? ref.top : (rows.length ? ref.bottom : ref.top + 4)) - 2}px`, left: `${ref.left}px`, width: `${Math.max(60, ref.width)}px`});
            } else {
                const secs = [...ed.querySelectorAll('.fsed-sec:not(.is-loose)')].filter(s => s !== secEl);
                const nxt = secs.find(s => { const b = s.getBoundingClientRect(); return b.top + Math.min(40, b.height / 2) > y; }) || null;
                target = {before: nxt?.dataset.fsedSec || null};
                const ref = (nxt || secs[secs.length - 1] || secEl).getBoundingClientRect();
                Object.assign(marker.style, {top: `${(nxt ? ref.top : ref.bottom) - 2}px`, left: `${ref.left}px`, width: `${ref.width}px`});
            }
        };
        place(e.clientX, e.clientY);
        const scroller = host.closest('dialog') || document.getElementById('workspace');
        const onMove = ev => { place(ev.clientX, ev.clientY); if (scroller) { const r = scroller.getBoundingClientRect(); if (ev.clientY < r.top + 40) scroller.scrollTop -= 14; if (ev.clientY > r.bottom - 40) scroller.scrollTop += 14; } };
        const onUp = () => {
            document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp);
            marker.remove(); row.classList.remove('is-dnd-dragging');
            if (!target) return;
            if (blockRow) { const key = blockRow.dataset.fsedBlock; commit(host, m => moveBlock(m, key, target.sec, target.before)); }
            else { const id = secEl.dataset.fsedSec; commit(host, m => { const s = m.sections.find(x => x.id === id); m.sections = m.sections.filter(x => x.id !== id); const at = target.before ? m.sections.findIndex(x => x.id === target.before) : m.sections.length; m.sections.splice(at < 0 ? m.sections.length : at, 0, s); }); }
        };
        document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp);
    }
    /* ── Alt + ↑ / ↓ sur une poignée (K20) : avant heritage-dnd.js (écoute posée sur window, en capture) ── */
    window.addEventListener('keydown', e => {
        if (!e.altKey || e.metaKey || e.ctrlKey || !/^Arrow(Up|Down)$/.test(e.key)) return;
        const grip = e.target.closest?.('[data-fsed-grip]'); if (!grip) return;
        const host = [...HOSTS].find(h => h.contains(grip)); if (!host) return;
        e.preventDefault(); e.stopPropagation();
        const up = e.key === 'ArrowUp', ed = host.querySelector('[data-fsed]'), m = model(ed.dataset.fsedKind, Number(ed.dataset.fsedPerson) || 0), g = groups(m);
        const b = grip.closest('[data-fsed-block]');
        if (b) {
            const key = b.dataset.fsedBlock, here = m.sections.some(s => s.id === m.assign[key]) ? m.assign[key] : '__loose';
            const lists = [...g.secs.map(s => [s.id, s.keys]), ['__loose', g.loose]], li = lists.findIndex(l => l[0] === here), list = lists[li][1], i = list.indexOf(key);
            if (up && i > 0) commit(host, mm => moveBlock(mm, key, here, list[i - 1]));
            else if (!up && i < list.length - 1) commit(host, mm => moveBlock(mm, key, here, list[i + 2] || null));
            else if (up && li > 0) commit(host, mm => moveBlock(mm, key, lists[li - 1][0])); // en haut de sa section : à la fin de la section du dessus
            else if (!up && li < lists.length - 1) commit(host, mm => moveBlock(mm, key, lists[li + 1][0], lists[li + 1][1][0] || null)); // en bas : au début de celle du dessous
            else return;
            say(host, `${blockLabel(key, m.kind)} déplacé`);
        } else {
            const id = grip.closest('[data-fsed-sec]')?.dataset.fsedSec, i = m.sections.findIndex(s => s.id === id); if (i < 0) return;
            const j = up ? i - 1 : i + 1; if (j < 0 || j >= m.sections.length) return;
            commit(host, mm => { mm.sections.splice(j, 0, mm.sections.splice(i, 1)[0]); });
            say(host, `« ${m.sections[i].name} » est maintenant ${j + 1}ᵉ sur ${m.sections.length}`);
        }
    }, true);
    const say = (host, msg) => { let live = host.querySelector('.fsed-live'); if (!live) { live = document.createElement('span'); live.className = 'fsed-live visually-hidden'; live.setAttribute('aria-live', 'polite'); host.appendChild(live); } live.textContent = msg; };

    /* ═════════════════════════ Réglages → Apparence → Fiches personnes et animaux ═════════════════════════ */
    const editKind = () => { const v = lsGet(EDK_KEY, null); if (v === 'animal' || v === 'human') return v; return A().state?.currentPersonKind === 'animal' ? 'animal' : 'human'; };
    const seg = (name, list, cur, attrs = '') => `<div class="segmented fsec-seg" role="radiogroup" ${attrs}>${list.map(([v, l]) => `<button type="button" role="radio" data-fsec-opt="${name}" data-v="${esc(v)}" class="${String(cur) === String(v) ? 'is-active' : ''}" aria-checked="${String(cur) === String(v)}">${esc(l)}</button>`).join('')}</div>`;
    /** petits dessins des styles (comme la maquette F1) */
    const styleThumb = k => `<span class="fsec-thumb is-${k}" aria-hidden="true">${k === 'tabs' ? '<i class="t"><b></b><b></b><b></b></i>' : '<i class="h"><em>1</em><span></span></i>'}<i class="g"><b></b><b></b></i>${k === 'tabs' ? '<i class="g"><b></b><b></b></i>' : '<i class="h"><em>2</em><span></span></i><i class="g"><b></b><b></b></i>'}</span>`;
    function presPanelHtml() {
        const o = opts();
        return `<section class="person-block-config" id="fsec-pres"><header><span class="eyebrow">FICHES PERSONNES ET ANIMAUX</span><h3>Présentation de l’éditeur</h3><p>La façon dont les listes à ranger de cette page sont dessinées. Ne change que cet écran de réglage (et la fenêtre « ⚙️ Ranger les sections » d’une fiche) : ni les fiches, ni les données.</p></header>
            <div class="maintenance-panel fsec-panel fsec-pres-row"><span class="fsec-lab">Présentation de l’éditeur</span>${seg('editor', [['avant', 'Comme avant'], ['new', 'Nouveau']], o.editor)}<small class="muted">« Nouveau » : sections en bandes, ⠿ et 👁.</small></div></section>`;
    }
    function designsNoteHtml() {
        const D = window.LCNDA_DESIGNS; let txt = '';
        try { const G = D?.read?.(); const nm = id => { const v = D.DEFS[id].variants.find(x => x.k === G[id].v); return v ? v.t : ''; }; if (G) txt = `traits, coins et ombres (<b>${esc(nm('a1'))}</b>)`; } catch (_) {}
        return `<div class="ui-notice ui-notice-info fsec-designs-link" id="fsec-designs-link"><span class="ui-notice-ic" aria-hidden="true">🎨</span><span>Le style des fiches : ${txt || 'traits, coins, ombres'}. Il se règle avec la forme de l’en-tête, plus bas sur cette page. <button type="button" class="link-button" data-fsec-go-designs>Style des fiches ↓</button></span></div>`;
    }
    function sectionsPanelHtml() {
        const o = opts(), kind = editKind();
        const opt = (k, label, sub) => (UI().toggleHtml ? UI().toggleHtml(label, {checked: !!o[k], attrs: `data-fsec-opt-check="${k}"`, sub}) : '');
        return `<section class="person-block-config" id="fsec-cfg"><header><span class="eyebrow">FICHES PERSONNES ET ANIMAUX</span><h3 data-help="Les blocs d’une fiche se rangent en sections nommées (Identité, Famille…). Ici, où vont leurs titres et leurs options ; la forme (traits, coins, ombres) se règle plus bas, avec l’en-tête (« Style des fiches »)." data-help-faq="sections des fiches">Sections des fiches</h3><p>Les blocs se rangent en sections nommées (Identité, Famille…). Ici, la façon de dessiner leurs titres et leurs options. Chaque changement est gardé tout de suite.</p></header>
            ${designsNoteHtml()}
            <div class="maintenance-panel fsec-panel">
                <div class="fsec-row"><span class="fsec-lab">Pour quelles fiches</span>${seg('kind', [['human', '👤 Personnes'], ['animal', '🐾 Animaux']], kind)}${UI().toggleHtml ? UI().toggleHtml('Sections propres aux animaux', {checked: o.animalOwn, attrs: 'data-fsec-opt-check="animalOwn"', sub: 'Éteint : les animaux prennent les sections des personnes.'}) : ''}</div>
                <div class="fsec-row is-top"><span class="fsec-lab">Style des sections</span><div class="fsec-styles" role="radiogroup" aria-label="Style des sections">${STYLES.map(([k, t, d]) => `<button type="button" role="radio" class="fsec-style${o.style === k ? ' is-active' : ''}" data-fsec-opt="style" data-v="${k}" aria-checked="${o.style === k}" aria-label="Style des sections : ${esc(t)}" title="${esc(d)}">${styleThumb(k)}<b>${esc(t)}</b><small>${k === 'line' ? 'Par défaut' : k === 'tabs' ? 'En option' : ''}</small></button>`).join('')}</div></div>
                <div class="fsec-row${o.style === 'tabs' ? '' : ' is-dim'}"><span class="fsec-lab">Place des onglets <small class="muted">(style « Onglets en haut »)</small></span>${seg('place', PLACES.map(p => [p[0], p[1]]), o.place)}</div>
                <div class="fsec-row${o.style === 'tabs' ? '' : ' is-dim'}"><span class="fsec-lab">« ▦ Tout voir »</span>${seg('all', ALLS, o.all)}</div>
                <div class="fsec-row is-top"><span class="fsec-lab">Options</span><div class="fsec-opts">
                    ${opt('fold', 'Sections repliables (▾)', 'Retenu d’une fiche à l’autre.')}${opt('startFolded', 'Ouvrir les fiches avec les sections repliées')}${opt('phoneFirst', 'Sur téléphone : seulement la première section ouverte')}
                    ${opt('nums', 'Numéros des sections')}<div class="fsec-sub${o.nums ? '' : ' is-dim'}"><span>Écriture</span>${seg('numW', NUMW, o.numW)}</div>
                    <div class="fsec-sub"><span>Numéros des blocs</span>${seg('blockNums', [['seq', 'À la suite (01, 02…)'], ['sec', 'Par section (1.1, 1.2…)']], o.blockNums)}</div>
                    ${opt('count', 'Onglets : montrer le nombre entre parenthèses')}
                    <div class="fsec-sub"><span>Sections vides</span>${seg('empty', [['grey', 'En gris'], ['hide', 'Cachées']], o.empty)}</div></div></div>
                <div class="fsec-row is-top"><span class="fsec-lab">Aperçu</span>${liveHtml(kind)}</div>
                <p class="muted fsec-note">L’espace entre deux sections vaut deux fois l’écart entre deux blocs : il suit A2 Densité. Le bandeau prend la couleur principale de l’Apparence, qui passe toujours devant.</p>
            </div></section>`;
    }
    /** le cadre qui remplace « Ordre et visibilité des blocs » (personnes ou animaux, + l'exception de la fiche ouverte) */
    function blocksPanelHtml() {
        const kind = editKind(), st = A().state || {}, pid = Number(st.currentPersonId) || 0;
        const cur = st.currentPerson?.person && Number(st.currentPerson.person.id) === pid ? st.currentPerson.person : null;
        const known = cur || (st.people || []).find(x => Number(x.id) === pid) || null, fc = st.fsecCur && Number(st.fsecCur.id) === pid ? st.fsecCur : null;
        const curKind = (fc?.kind || known?.kind || st.currentPersonKind) === 'animal' ? 'animal' : 'human', name = (known ? A().personName?.(known) : '') || fc?.name || '';
        const word = kind === 'animal' ? 'FICHES ANIMAUX' : 'FICHES PERSONNES';
        return `<section class="person-block-config" id="fsec-blocks"><header><span class="eyebrow">${word}</span><h3>Ordre et visibilité des blocs</h3><p>Glisse les sections et les blocs pour changer leur ordre. Décoche une section ou un bloc pour le masquer.</p><p class="person-exception-summary" data-exception-summary="person-blocks"></p></header>
            <div class="design-order-grid block-grid fsec-blocks-grid"><section class="maintenance-panel order-editor block-order-editor fsec-ed-panel"><div class="item-title-row"><h3>${kind === 'animal' ? 'Toutes les fiches d’animaux' : 'Toutes les fiches'}</h3></div>${kind === 'animal' && !opts().animalOwn ? '<p class="fsec-offnote">Les animaux prennent les sections des personnes (« Sections propres aux animaux » est éteint) : créer, renommer ou ranger une section change aussi celles des personnes.</p>' : ''}<div data-fsec-editor="0"></div></section>
            ${pid ? `<section class="maintenance-panel order-editor block-order-editor fsec-ed-panel"><div class="item-title-row"><h3>Exception pour ${esc(name || `la fiche n°${pid}`)}</h3>${hasException(pid) ? `<button class="button small secondary" type="button" data-fsec-reset-ex="${pid}">Annuler l’exception</button>` : ''}</div>${curKind !== kind ? `<p class="block-editor-offnote">La fiche ouverte (${esc(name)}) est ${curKind === 'animal' ? 'un animal : son exception se règle avec « 🐾 Animaux »' : 'une personne : son exception se règle avec « 👤 Personnes »'}, en haut des Sections.</p>` : `<div data-fsec-editor="${pid}"></div>`}</section>`
                : `<section class="maintenance-panel order-editor block-order-editor"><h3>Exception fiche actuelle</h3><p>Ouvre ${kind === 'animal' ? 'un animal' : 'une personne'} pour créer une exception propre à sa fiche.</p></section>`}</div></section>`;
    }
    /* ── 👁 l'aperçu : la VRAIE fiche, en petit et en direct (lecture seule, rien n'est envoyé ni changé) ──
     * « Aperçu avec : [fiche] » (le menu de choix unique) : par défaut la fiche ouverte en dernier, sinon la racine Sosa, sinon la
     * première fiche ; elle est dessinée par app.js (personPageHtml : ses vrais blocs, rangés comme réglé ici) et posée dans le
     * cadre réduit des aperçus vivants de Designs au choix (LCNDA_DESIGNS.frame : iframe sans script, transform: scale).
     * Base vide : le petit dessin d'avant (previewHtml) et la petite ligne K10. */
    const LIVE = {pick: {}, cache: new Map(), timer: 0};
    function liveHtml(kind) {
        const P = window.LCNDA_PICKER || A();
        return `<div class="fsec-live" data-fsec-live="${kind}"><div class="fsec-live-top"><span class="pk-lab">Aperçu avec :</span>${P.pickerField ? P.pickerField({name: 'fsec_pv_person', hiddenName: false, kind: 'person', animals: kind === 'animal' ? 'only' : false, allowCreate: false, value: LIVE.pick[kind] || null}) : ''}<button type="button" class="button small secondary" data-fsec-live-open disabled>↗ Ouvrir cette fiche</button></div>
            <div class="fsec-live-view" aria-label="Aperçu de la fiche (lecture seule)"><div class="lcd-stage is-preview fsec-live-stage" data-fsec-live-stage></div></div>
            <div class="fsec-live-none" data-fsec-live-none hidden>${A().empty ? A().empty(kind === 'animal' ? 'Aucun animal pour l’instant : l’aperçu montre un dessin.' : 'Aucune fiche pour l’instant : l’aperçu montre un dessin.', {icon: kind === 'animal' ? '🐾' : '👤'}) : ''}<div class="fsec-pv-box" data-fsec-pv="${kind}">${previewHtml(kind)}</div></div></div>`;
    }
    /** la fiche d'une sorte : celle qu'on a choisie, sinon la dernière ouverte, la racine Sosa, la première de la liste */
    async function liveDetail(kind, id) {
        if (LIVE.cache.has(id)) return LIVE.cache.get(id);
        const api = A().api; if (!api || !id) return null;
        let d = null; try { d = await api('person', {id}); } catch (_) { return null; }
        if (!d?.person || (d.person.kind === 'animal') !== (kind === 'animal')) return null;
        const [mil, grave] = await Promise.all([api('military', {id}).catch(() => null), api('cemetery', {id}).catch(() => null)]);
        d.militaryData = mil?.data || {}; d.grave = grave?.grave || null;
        LIVE.cache.set(id, d); if (LIVE.cache.size > 12) LIVE.cache.delete(LIVE.cache.keys().next().value);
        return d;
    }
    async function liveDefault(kind) {
        const st = A().state || {}, cur = st.currentPerson?.person;
        const tries = kind === 'animal' ? [st.lastAnimalId, cur?.kind === 'animal' && cur.id, st.currentPersonKind === 'animal' && st.currentPersonId]
            : [st.lastHumanId, cur && cur.kind !== 'animal' && cur.id, st.currentPersonKind !== 'animal' && st.currentPersonId, A().sosaRootId?.(), st.bootstrap?.startPersonId];
        for (const id of [...new Set(tries.map(Number).filter(Boolean))]) { if (await liveDetail(kind, id)) return id; }
        try { const first = ((await A().api('people', {limit: 1, kind: kind === 'animal' ? 'animal' : 'human'})).people || [])[0]; if (first && await liveDetail(kind, Number(first.id))) return Number(first.id); } catch (_) {}
        return 0;
    }
    async function fillLive(box) {
        if (!box?.isConnected) return;
        const kind = box.dataset.fsecLive, seq = (box._seq = (box._seq || 0) + 1);
        let id = Number(LIVE.pick[kind]) || 0;
        if (!id || !(await liveDetail(kind, id))) id = await liveDefault(kind);
        if (seq !== box._seq || !box.isConnected) return;
        const view = box.querySelector('.fsec-live-view'), none = box.querySelector('[data-fsec-live-none]'), top = box.querySelector('.fsec-live-top'), open = box.querySelector('[data-fsec-live-open]');
        const det = id ? LIVE.cache.get(id) : null, html = det && A().personPageHtml ? A().personPageHtml(det) : '';
        const D = window.LCNDA_DESIGNS;
        if (!html || !D?.frame) { view.hidden = true; top.hidden = !id; none.hidden = false; const pv = none.querySelector('[data-fsec-pv]'); if (pv) pv.innerHTML = previewHtml(kind); box.dataset.fsecLivePerson = ''; return; }
        view.hidden = false; none.hidden = true; top.hidden = false; open.disabled = false; box.dataset.fsecLivePerson = String(id);
        const field = box.querySelector('.pk');
        // la fiche prise par défaut s'affiche dans le champ (une fois : si on vide le champ pour chercher, on ne le remplit pas de nouveau)
        if (field && !Number(LIVE.pick[kind]) && (window.LCNDA_PICKER || A()).pickerSet && !('fsecLiveSet' in box.dataset)) { box.dataset.fsecLiveSet = String(id); try { (window.LCNDA_PICKER || A()).pickerSet(field, {id, title: A().personName ? A().personName(det.person) : '', kind: 'person', gender: det.person.gender}); } catch (_) {} }
        D.frame(box.querySelector('[data-fsec-live-stage]'), {html, W: 1000, detail: det});
    }
    /** un réglage a changé : la fiche de l'aperçu se redessine (sans relire la base) */
    function refreshLive(delay = 60) { clearTimeout(LIVE.timer); LIVE.timer = setTimeout(() => document.querySelectorAll('[data-fsec-live]').forEach(fillLive), delay); }
    /** l'aperçu en petit : les titres des sections dans le style choisi et les blocs en barres grises */
    function previewHtml(kind) {
        const o = opts(), m = model(kind, 0), g = groups(m), st = A().state || {};
        const nm = st.currentPerson?.person && (st.currentPerson.person.kind === 'animal') === (kind === 'animal') ? (A().personName?.(st.currentPerson.person) || '') : (kind === 'animal' ? 'Gaston' : 'Jeanne MARTIN');
        const secs = g.secs.filter(s => !s.hidden);
        const bars = keys => keys.filter(k => !m.hidden.includes(k)).slice(0, 6).map(k => `<i style="grid-column:span ${Number(m.widths[k] || A().defaultPersonBlockSpans?.[k] || 12)}"></i>`).join('');
        return `<div class="fsec-pv is-${o.style}" aria-hidden="true"><div class="fsec-pv-hero"><b>${esc(nm)}</b></div>${o.style === 'tabs' ? `<div class="fsec-pv-tabs">${secs.slice(0, 6).map((s, i) => `<span class="${i ? '' : 'is-on'}">${esc(s.icon)} ${esc(s.name)}</span>`).join('')}</div><div class="fsec-pv-grid">${bars(secs[0]?.keys || [])}</div>` : secs.slice(0, 6).map((s, i) => `<div class="fsec-pv-sec"><div class="fsec-pv-h">${o.nums ? `<em>${esc(numText(i + 1, o.numW))}</em>` : ''}${esc(s.name)}</div><div class="fsec-pv-grid">${bars(s.keys)}</div></div>`).join('')}</div>`;
    }
    function bindSheetsPage(page) {
        if (!page || page.dataset.fsecBound) return; page.dataset.fsecBound = '1';
        const look = () => opts().editor;
        const mountAll = () => page.querySelectorAll('[data-fsec-editor]').forEach(h => mountEditor(h, {kind: editKind(), personId: Number(h.dataset.fsecEditor) || 0, look: look()}));
        mountAll();
        const redrawCfg = () => {
            const box = page.querySelector('#fsec-cfg'); if (!box) return;
            const live = box.querySelector('[data-fsec-live]'); // l'aperçu reste en place (pas de clignotement) s'il montre la même sorte de fiche
            box.outerHTML = sectionsPanelHtml(); const nb = page.querySelector('#fsec-cfg'); UI().scan?.(nb);
            const slot = nb?.querySelector('[data-fsec-live]'); if (live && slot && live.dataset.fsecLive === slot.dataset.fsecLive) slot.replaceWith(live);
            refreshLive(0);
        };
        const redrawBlocks = () => { const box = page.querySelector('#fsec-blocks'); if (box) { box.outerHTML = blocksPanelHtml(); mountAll(); } };
        const redrawPres = () => { const box = page.querySelector('#fsec-pres'); if (box) box.outerHTML = presPanelHtml(); };
        refreshLive(0);
        page.addEventListener('picker-change', e => { const box = e.target.closest?.('[data-fsec-live]'); if (!box) return; const v = Number(e.detail?.value) || 0; LIVE.pick[box.dataset.fsecLive] = v; box.dataset.fsecLiveSet = String(v); fillLive(box); });
        // tout autre réglage de la page (en-tête, boutons, blocs…) : l'aperçu suit
        ['click', 'change', 'input'].forEach(ev => page.addEventListener(ev, e => { if (!e.target.closest?.('.fsec-live-top')) refreshLive(250); }));
        page.addEventListener('click', e => {
            const t = e.target;
            const op = t.closest('[data-fsec-live-open]'); if (op) { const id = Number(op.closest('[data-fsec-live]')?.dataset.fsecLivePerson) || 0; if (id) A().openPersonById?.(id); return; }
            const b = t.closest('[data-fsec-opt]');
            if (b && page.contains(b)) {
                const k = b.dataset.fsecOpt, v = b.dataset.v;
                if (k === 'kind') { lsSet(EDK_KEY, v); redrawCfg(); redrawBlocks(); refreshLive(0); return; }
                const o = opts(); if (String(o[k]) === v) return; o[k] = v; saveOpts(o);
                if (k === 'editor') { redrawPres(); redrawBlocks(); return; }
                redrawCfg(); return;
            }
            if (t.closest('[data-fsec-go-designs]')) { const f = document.getElementById('lc-person-header'); f?.scrollIntoView({behavior: 'smooth', block: 'start'}); return; }
            const rx = t.closest('[data-fsec-reset-ex]');
            if (rx) { const k = exceptionKey(rx.dataset.fsecResetEx); try { localStorage.removeItem(k); } catch (_) {} redrawBlocks(); }
        });
        page.addEventListener('change', e => {
            const c = e.target.closest?.('[data-fsec-opt-check]'); if (!c) return;
            const o = opts(); o[c.dataset.fsecOptCheck] = c.checked; saveOpts(o);
            if (c.dataset.fsecOptCheck === 'animalOwn') redrawBlocks();
            if (c.dataset.fsecOptCheck === 'nums') redrawCfg();
        });
    }
    /** l'ordre des cadres de la page (maquette reglages-fiches.html, P1) et le sommaire « Sur cette page » */
    const PAGE_ORDER = [['fsec-pres', 'Présentation de l’éditeur'], ['lc-person-header', 'En-tête de la fiche'], ['lc-head-elems', 'Éléments de l’en-tête'], ['lc-obs-place', '＋ Nouvelle observation'], ['fsec-cfg', 'Sections des fiches'], ['fsec-blocks', 'Ordre et visibilité des blocs'],
        ['h-flag-config', 'Blocs à afficher sur demande'], ['@Cette personne était', 'Cette personne était…'], ['@Filtres du bloc Événements', 'Filtres du bloc Événements'], ['lineage-config', 'Ascendants et descendants'], ['web-search-config', 'Chercher sur internet'], ['@Fiches avec un réglage particulier', 'Fiches avec un réglage particulier']];
    function arrangeSheetsPage() {
        const st = A().state; if (st?.module !== 'maintenance' || st.maintenanceTab !== 'design_sheets') return;
        const page = document.querySelector('#workspace > .page'); if (!page) return;
        const find = key => (key.startsWith('@') ? [...page.querySelectorAll(':scope > .person-block-config')].find(s => (s.querySelector(':scope > header h3')?.textContent || '').startsWith(key.slice(1))) : page.querySelector(`:scope > #${key}`));
        const head = page.querySelector(':scope > .page-header');
        const found = PAGE_ORDER.map(([k, t]) => [find(k), t]).filter(([el]) => el && !el.hidden);
        let anchor = head;
        found.forEach(([el], i) => { el.id = el.id || `fsec-part-${i}`; el.classList.add('fsec-part'); if (anchor.nextElementSibling !== el) anchor.after(el); anchor = el; });
        page.querySelector(':scope > .fsec-toc')?.remove();
        head?.insertAdjacentHTML('afterend', `<nav class="fsec-toc maintenance-panel" aria-label="Sur cette page"><span class="section-label">Sur cette page</span><div>${found.map(([el, t]) => `<button type="button" class="button small secondary" data-fsec-toc="${esc(el.id)}">${esc(t)}</button>`).join('')}</div></nav>`);
        page.querySelector('.fsec-toc').addEventListener('click', e => { const b = e.target.closest('[data-fsec-toc]'); if (!b) return; const el = document.getElementById(b.dataset.fsecToc); el?.scrollIntoView({behavior: document.documentElement.classList.contains('a11y-calm') ? 'auto' : 'smooth', block: 'start'}); el?.querySelector('h3')?.setAttribute('tabindex', '-1'); el?.querySelector('h3')?.focus({preventScroll: true}); });
        bindSheetsPage(page);
        // « ↺ Remettre comme au départ » de la page (à droite du titre, sans question, ↶ Annuler) : sections de départ, style, en-tête
        const acts = head?.querySelector('.page-actions');
        if (acts && !acts.querySelector('[data-fsec-reset-all]')) {
            acts.insertAdjacentHTML('beforeend', '<button type="button" class="button secondary" data-fsec-reset-all>↺ Remettre comme au départ</button>');
            acts.querySelector('[data-fsec-reset-all]').addEventListener('click', () => {
                const bk = ['human', 'animal'].map(k => A().blockBaseKey?.(k)).filter(Boolean), keys = [OPT_KEY, 'genealogie-sheet-head', 'genealogie-person-header', ...bk];
                const change = () => { [OPT_KEY, 'genealogie-sheet-head', 'genealogie-person-header'].forEach(k => { try { localStorage.removeItem(k); } catch (_) {} }); bk.forEach(k => { const v = lsGet(k, null); if (isObj(v)) { delete v.sections; delete v.assign; lsSet(k, v); } }); };
                if (A().undoLocalChange) A().undoLocalChange('Fiches personnes et animaux remises comme au départ', keys, change, () => A().renderDesignTools?.()); else change();
                A().renderDesignTools?.();
            });
        }
        if (st.fsecFocus) { const id = st.fsecFocus; st.fsecFocus = ''; setTimeout(() => document.getElementById(id)?.scrollIntoView({block: 'start'}), 50); }
    }
    ext.afterDesign = ext.afterDesign || [];
    ext.afterDesign.push(() => arrangeSheetsPage());
    /** « Designs au choix → Fiches » (D3) et la fiche (⋯ → Ranger) : ouvre la page sur un cadre */
    function openSheetsPage(partId = 'fsec-cfg', kind = '') {
        if (kind) lsSet(EDK_KEY, kind);
        const st = A().state; if (!st) return; st.maintenanceTab = 'design_sheets'; st.fsecFocus = partId; A().setModule?.('maintenance');
    }

    /* ═════════════════════════ La fenêtre « ⚙️ Ranger les sections » ouverte depuis une fiche ═════════════════════════ */
    function openArrangeDialog() {
        const st = A().state || {}, det = st.currentPerson, p = det?.person; if (!p || !ext.openDialog) return;
        const kind = p.kind === 'animal' ? 'animal' : 'human', pid = Number(p.id);
        let scope = hasException(pid) ? 'one' : 'all';
        const dlg = ext.openDialog({eyebrow: kind === 'animal' ? '🗂 FICHE ANIMAL' : '🗂 FICHE', title: `Ranger les sections — fiche de ${A().personName?.(p) || ''}`, wide: true, submitLabel: 'Fermer', onSubmit: () => true,
            body: `<div class="fsec-dlg-top"><div class="segmented fsec-seg" role="radiogroup" data-fsec-scope>${[['one', 'Pour cette fiche seulement'], ['all', kind === 'animal' ? 'Pour toutes les fiches d’animaux' : 'Pour toutes les fiches']].map(([v, l]) => `<button type="button" role="radio" data-v="${v}" class="${scope === v ? 'is-active' : ''}" aria-checked="${scope === v}">${l}</button>`).join('')}</div><button type="button" class="link-button" data-fsec-allsettings>Tous les réglages des fiches ↗</button></div><div data-fsec-dlg-ed></div>`});
        const host = dlg.querySelector('[data-fsec-dlg-ed]');
        const mount = () => mountEditor(host, {kind, personId: scope === 'one' ? pid : 0, look: opts().editor});
        mount();
        dlg.querySelector('[data-fsec-scope]').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b || b.dataset.v === scope) return; scope = b.dataset.v; dlg.querySelectorAll('[data-fsec-scope] [data-v]').forEach(x => { const on = x === b; x.classList.toggle('is-active', on); x.setAttribute('aria-checked', String(on)); }); mount(); });
        dlg.querySelector('[data-fsec-allsettings]').addEventListener('click', () => { dlg.close(); openSheetsPage('fsec-blocks', kind); });
        UI().autoSaveDialog?.(dlg, {keys: [A().blockBaseKey?.(kind) || 'genealogie-person-blocks', A().blockBaseKey?.('human') || 'genealogie-person-blocks', exceptionKey(pid)], reload: () => { drawEditor(host); if (st.module === 'personnes') rerender(); }, label: 'Rangement des sections'});
        dlg.addEventListener('close', () => { HOSTS.delete(host); if (A().state?.module === 'personnes') rerender(); });
        return dlg;
    }

    /* ═════════════════════════ La fiche : « ⋯ » de l'en-tête (⚙️ Ranger les sections…) ═════════════════════════ */
    ext.afterPerson = ext.afterPerson || [];
    ext.afterPerson.push(() => applyRoute()); // 🔗 la section de l'adresse
    ext.afterPerson.push(detail => {
        const bar = document.querySelector('#workspace .person-page .person-hero-actions'); if (!bar || RO() || bar.querySelector('[data-fsec-hero-more]')) return;
        bar.insertAdjacentHTML('beforeend', '<button type="button" class="icon-action fsec-hero-more" data-fsec-hero-more title="Plus d’actions sur la fiche" aria-label="Plus d’actions sur la fiche">⋯</button>');
        bar.querySelector('[data-fsec-hero-more]').addEventListener('click', e => {
            const p = detail?.person || {};
            UI().menuAt?.(e.currentTarget, [
                Number(p.is_locked) ? null : {icon: '✎', label: 'Modifier la fiche', run: () => document.querySelector('#workspace [data-edit-person-inline]')?.click()},
                {icon: '🖨', label: 'Imprimer', run: () => { const b = document.querySelector('#workspace [data-print-person]'); if (b) b.click(); else UI().printPage?.(A().personName?.(p) || ''); }},
                '-',
                {icon: '⚙️', label: 'Ranger les sections…', run: () => openArrangeDialog()},
                {icon: '⚙️', label: 'Boutons de l’en-tête…', run: () => openSheetsPage('lc-person-header')},
                p.kind === 'animal' && detail?.heritage?.animal?.id && ext.suivi?.openShare ? {icon: '📤', label: 'Partager le suivi…', run: () => ext.suivi.openShare({scope: 'pets', ids: [Number(detail.heritage.animal.id)]})} : null,
            ].filter(Boolean), {title: A().personName?.(p) || 'La fiche'});
        });
    });

    window.LCNDA_SECTIONS = {OPT_KEY, FOLD_KEY, TAB_KEY, OPT0, SEC0, STYLES, PLACES, opts, saveOpts, cleanOpts, cleanSections, derive, model, groups, save, renderSheet, revealBlock, showTab, editorHtml, mountEditor, presPanelHtml, sectionsPanelHtml, blocksPanelHtml, previewHtml, refreshLive, slugOf, secFromSlug, applyRoute, arrangeSheetsPage, openArrangeDialog, openSheetsPage, migratePetLayout, numText, hasException,
        _resetPetLayout: () => { petLayoutDone = false; }, _liveReset: () => { LIVE.pick = {}; LIVE.cache.clear(); }};
})();
