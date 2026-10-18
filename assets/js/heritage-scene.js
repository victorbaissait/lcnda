/* LCNDA — 🎤 SCÈNE : un soir de concert ou de spectacle, avec sa setlist façon setlist.fm (maquette U de
 * docs/design/profils-et-oeuvres.html), la tournée qui regroupe ses dates, le sketch / numéro / scène joué.
 * Construit SUR le moteur des fiches (docs/TYPES.md) : ce ne sont que des définitions (ART.define) + des vues (ART.views).
 *
 *  - 🎤 concert (« Concert ou représentation ») : la même fiche pour un concert, un spectacle d'humour, une représentation
 *    de théâtre, de danse, de cirque, un concert d'orchestre, une soirée de contes ; la setlist s'adapte à la sorte.
 *    Setlist : titres → fiche du morceau (ou du sketch, du numéro, de la scène) ; rappels, entractes, parties, medleys ;
 *    sur chaque ligne (📝) : reprise de 👤, version, invités 👤 avec leur rôle, dédiée à 👤, 1re / dernière fois,
 *    inachevée, joué avec telle formation, durée, minutage dans la captation.
 *    Une représentation peut être l'ENFANT D'UNE MISE EN SCÈNE (champ « staging », parentField) : la fiche « mise en scène »
 *    (outil « œuvres ») reçoit la vue « 🎭 Représentations » (ART.views.sc_performances) — voir SC.parentKinds.
 *  - 🚌 tour (Tournée) : ses dates, l'itinéraire sur la carte, la setlist type.
 *  - 🎭 stage_piece (« Sketch, numéro, scène ») : ce qui se joue sur scène sans être un morceau de musique.
 * La liste, la carte, la frise et les statistiques : heritage-scene-list.js. L'acteur : heritage-scene-actor.js.
 * Les séries : heritage-scene-series.js. Styles : assets/css/scene.css.
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART; if (!ART?.define) return;
    const A = () => window.LCNDA_APP, P = () => window.LCNDA_PICKER || window.LCNDA_APP, ext = () => window.LCNDA_EXT || {};
    const U = ART.util, esc = U.esc, T = ART.ft;
    const plural = (n, w, pl) => U.plural(n, w, pl);
    const SC = ART.scene = ART.scene || {};
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    SC.fold = fold;

    /* ═════════ Le domaine « Scène » dans « ＋ Toutes les sortes de fiches » ═════════ */
    if (Array.isArray(ART.DOMAINS) && !ART.DOMAINS.some(d => d[0] === 'scene')) { const i = ART.DOMAINS.findIndex(d => d[0] === 'autre'); ART.DOMAINS.splice(i < 0 ? ART.DOMAINS.length : i, 0, ['scene', '🎤 Scène et spectacle']); }

    /* ═════════ Dates d'un soir : « 14 juillet 1958 », « 14/07/1958 », « 1958-07-14 », « juillet 1958 », « 1958 » ═════════ */
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const MSHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const MPRE = [['janv', 1], ['fev', 2], ['mars', 3], ['avr', 4], ['mai', 5], ['juin', 6], ['juil', 7], ['aou', 8], ['sep', 9], ['oct', 10], ['nov', 11], ['dec', 12]];
    const monthOf = w => (MPRE.find(([p]) => fold(w).startsWith(p)) || [, 0])[1];
    SC.dayOf = t => {
        const s = fold(t); if (!s) return null; let m;
        const out = (y, mo = 0, d = 0) => { y = Number(y); mo = Number(mo) || 0; d = Number(d) || 0; if (!(y > 0 && y < 2200) || mo > 12 || d > 31) return null; return {y, m: mo, d, k: y * 10000 + mo * 100 + d}; };
        if ((m = s.match(/\b(\d{3,4})-(\d{1,2})-(\d{1,2})\b/))) return out(m[1], m[2], m[3]);
        if ((m = s.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{3,4})\b/))) return out(m[3], m[2], m[1]);
        if ((m = s.match(/\b(\d{1,2}|1er)\s+([a-z]{3,9})\.?\s+(\d{3,4})\b/)) && monthOf(m[2])) return out(m[3], monthOf(m[2]), m[1] === '1er' ? 1 : m[1]);
        if ((m = s.match(/\b([a-z]{3,9})\.?\s+(\d{3,4})\b/)) && monthOf(m[1])) return out(m[2], monthOf(m[1]));
        if ((m = s.match(/\b(\d{4})\b/))) return out(m[1]);
        return null;
    };
    SC.dayLabel = (d, how = 'long') => { if (!d) return ''; if (how === 'num') return d.d ? `${String(d.d).padStart(2, '0')}/${String(d.m).padStart(2, '0')}/${d.y}` : d.m ? `${MSHORT[d.m - 1]} ${d.y}` : String(d.y);
        return d.d ? `${d.d === 1 ? '1er' : d.d} ${(how === 'short' ? MSHORT : MONTHS)[d.m - 1]} ${d.y}` : d.m ? `${MONTHS[d.m - 1]} ${d.y}` : String(d.y); };
    SC.weekday = d => { if (!d?.d) return ''; try { return new Date(d.y, d.m - 1, d.d).toLocaleDateString('fr-FR', {weekday: 'long'}); } catch (_) { return ''; } };
    SC.dateKey = it => SC.dayOf(it?.data?.date)?.k || (Number(it?.year) || 0) * 10000;
    SC.cityOf = it => U.placeTitle(it?.data?.place).split(/\s*[,(]/)[0].trim();

    /* ═════════ Les sortes de soirées : la setlist s'adapte ═════════ */
    // les listes de sortes de fiches sont des tableaux partagés : d'autres outils peuvent y ajouter les leurs (SC.late)
    const STAGING_KINDS = ['staging']; // la mise en scène (outil « œuvres ») : parent d'une représentation
    const PLAY_KINDS = ['play'];        // la pièce
    const POSTER_KINDS = ['work'];      // l'affiche (une œuvre, ou le type « affiche » s'il existe)
    const MUSIC_KINDS = ['track_work'];
    const PIECE_KINDS = ['stage_piece'];
    SC.parentKinds = STAGING_KINDS; SC.playKinds = PLAY_KINDS; SC.posterKinds = POSTER_KINDS; SC.musicKinds = MUSIC_KINDS;
    const GENRES = [
        {key: 'concert', icon: '🎵', label: 'Concert', eb: 'Concert', list: 'Setlist', item: 'titre', items: 'titres', add: 'Ajouter un titre', kinds: MUSIC_KINDS},
        {key: 'humour', icon: '🎤', label: 'Humour (sketches)', eb: 'Spectacle d’humour', list: 'Sketches', item: 'sketch', items: 'sketches', add: 'Ajouter un sketch', kinds: PIECE_KINDS, piece: 'sketch'},
        {key: 'theatre', icon: '🎭', label: 'Théâtre (scènes, rôles du soir)', eb: 'Représentation', list: 'Scènes jouées', item: 'scène', items: 'scènes', add: 'Ajouter une scène', kinds: PIECE_KINDS, piece: 'scene', plays: true},
        {key: 'danse', icon: '🩰', label: 'Danse', eb: 'Spectacle de danse', list: 'Programme', item: 'pièce dansée', items: 'pièces dansées', add: 'Ajouter une pièce', kinds: PIECE_KINDS, piece: 'choregraphie'},
        {key: 'cirque', icon: '🎪', label: 'Cirque (numéros)', eb: 'Spectacle de cirque', list: 'Numéros', item: 'numéro', items: 'numéros', add: 'Ajouter un numéro', kinds: PIECE_KINDS, piece: 'numero'},
        {key: 'orchestre', icon: '🎼', label: 'Orchestre (programme)', eb: 'Concert d’orchestre', list: 'Programme', item: 'œuvre', items: 'œuvres', add: 'Ajouter une œuvre', kinds: MUSIC_KINDS},
        {key: 'conte', icon: '📖', label: 'Conte', eb: 'Soirée de contes', list: 'Contes dits', item: 'conte', items: 'contes', add: 'Ajouter un conte', kinds: PIECE_KINDS, piece: 'conte'},
        {key: 'autre', icon: '✦', label: 'Autre spectacle', eb: 'Spectacle', list: 'Programme', item: 'numéro', items: 'numéros', add: 'Ajouter une ligne', kinds: PIECE_KINDS, piece: 'autre'}];
    SC.GENRES = GENRES;
    SC.genre = k => GENRES.find(g => g.key === k) || GENRES[0];
    SC.genreOf = it => SC.genre(it?.data?.skind || it?.skind);
    /** les sortes de fiches qu'une ligne de setlist peut pointer, pour cette sorte de soirée (la 1re sert à « ＋ Créer ») */
    SC.kindsFor = gk => { const g = SC.genre(gk); const l = [...g.kinds, ...(g.plays ? PLAY_KINDS : []), ...(g.kinds === MUSIC_KINDS ? [] : MUSIC_KINDS)]; return [...new Set(l)]; };
    const cap = s => String(s || '').replace(/^./, c => c.toLocaleUpperCase('fr-FR'));
    SC.cap = cap;

    /* ═════════ Des champs qui n'apparaissent dans le formulaire que pour certaines sortes (gate) ═════════ */
    // f.gate = {field: 'skind', values: ['theatre', 'danse'], dflt: 'concert'} : caché pour les autres sortes, sauf s'il est rempli
    SC.gated = base => {
        const key = `sc_${base}`; if (T[key]) return key; const b = T[base]; if (!b) return base;
        T[key] = {...b, edit: (f, v, ctx) => {
            const g = f.gate, inner = b.edit(f, v, ctx); if (!g) return inner;
            const cur = String((ctx?.draft || {})[g.field] ?? g.dflt ?? ''), has = !ART.isEmpty({...f, type: base}, v);
            return `<div class="sc-gate" data-sc-gate="${esc(g.field)}" data-sc-vals="${esc(g.values.join(','))}" data-sc-has="${has ? 1 : 0}"${g.values.includes(cur) || has ? '' : ' hidden'}>${inner}</div>`; }};
        return key;
    };
    // des personnes en pastilles sur une ligne (« Sur scène : 👤 chant, 👤 accordéon »), rangées comme un champ simple
    T.sc_people = {...T.people, block: false, read: (f, v, ctx) => ART.normPeople(v).map(r => U.personChip(r, r.role, ctx)).join(' ')};
    // une case qui ne s'affiche que cochée (« Complet », « Non crédité(e) »…) : rien quand elle ne l'est pas
    T.sc_flag = {...T.bool, empty: v => v !== true};
    SC.cut = (t, n = 300) => { t = String(t ?? ''); return t.length > n ? `${t.slice(0, n)}…` : t; };
    SC.gated('sc_people'); SC.gated('rows'); SC.gated('person'); SC.gated('longtext'); SC.gated('number'); SC.gated('item');
    const refreshGates = form => {
        form.querySelectorAll('.sc-gate[data-sc-gate]').forEach(el => {
            const sel = form.querySelector(`[data-fk="${CSS.escape(el.dataset.scGate)}"] [data-v]`); if (!sel) return;
            el.hidden = !(el.dataset.scVals.split(',').includes(sel.value) || el.dataset.scHas === '1');
        });
    };
    SC.refreshGates = refreshGates;

    /* ═════════ La setlist : un tableau de lignes, avec 📝 pour le détail ═════════ */
    const SL_T = [['item', 'Titre'], ['encore', 'Rappel'], ['medley', 'En medley (enchaîné)'], ['interlude', 'Entracte, interlude'], ['set', 'Début d’une partie'], ['tape', 'Bande, intro enregistrée']];
    SC.SL_T = SL_T;
    const SL_MORE = [
        {key: 'cover', label: 'Reprise de (l’auteur ou l’interprète d’origine)', type: 'person'},
        {key: 'version', label: 'Version (acoustique, longue, a capella, en duo…)', type: 'text'},
        {key: 'guests', label: 'Invités sur ce titre (avec leur rôle)', type: 'people'},
        {key: 'dedic', label: 'Dédié à', type: 'person'},
        {key: 'with', label: 'Joué avec (une formation)', type: 'text'},
        {key: 'first', label: '1re fois en public', type: 'bool'}, {key: 'last', label: 'Dernière fois', type: 'bool'}, {key: 'unfinished', label: 'Inachevé (interrompu)', type: 'bool'},
        {key: 'dur', label: 'Durée', type: 'text'}, {key: 'at', label: 'Minutage dans la captation (ex. 12:30)', type: 'text'}];
    const slCols = gk => { const g = SC.genre(gk); return [{key: 't', label: 'Sorte', type: 'select', choices: SL_T, w: 's'}, {key: 'work', label: cap(g.item), type: 'item', kinds: SC.kindsFor(gk), w: 'l'}, {key: 'note', label: 'Note', w: 'm', ph: 'note (1re partie, pour Marie…)'}]; };
    const slField = (f, gk) => ({...f, cols: slCols(gk), more: SL_MORE, moreLabel: 'Reprise, invités, dédicace, 1re fois, durée…', addLabel: SC.genre(gk).add});
    SC.slField = slField;
    /** une ligne propre : sans les cases vides (la sorte « Titre » n'est pas écrite) */
    const cleanRow = r => { const o = {}; Object.entries(r || {}).forEach(([k, v]) => { if (v === '' || v == null || v === false || (Array.isArray(v) && !v.length)) return; if (k === 't' && v === 'item') return; o[k] = v; }); return o; };
    SC.rowsOf = it => (Array.isArray(it?.data?.setlist) ? it.data.setlist : []).filter(r => r && typeof r === 'object');
    const genreInForm = el => el.closest('[data-ar-form]')?.querySelector('[data-fk="skind"] [data-v]')?.value || 'concert';
    T.setlist = {label: 'Setlist', badge: '📋', wide: true, block: true,
        edit: (f, v, ctx) => { const gk = ctx?.draft?.skind || 'concert', fx = slField(f, gk), l = (Array.isArray(v) ? v : []).map(cleanRow);
            return `<div class="sc-sl-edit" data-sl-field><div class="ar-rows" data-ar-rows="rows">${l.map((r, i) => ART.rowHtml(fx, {t: 'item', ...r}, i)).join('')}</div>
                <div class="ar-row"><button type="button" class="button small secondary" data-sl-add>＋ <span data-sl-addlab>${esc(SC.genre(gk).add)}</span></button><button type="button" class="button small secondary" data-sl-add="encore">＋ Un rappel</button><button type="button" class="button small secondary" data-sl-paste title="Une liste de titres, un par ligne (copiée d’un site, d’un carnet…)">📋 Coller une liste</button><button type="button" class="button small secondary" data-sl-copy>📋 Copier la setlist d’un autre soir</button></div>
                <p class="ar-note">Chaque ligne pointe vers la fiche du ${esc(SC.genre(gk).item)} : un titre inconnu crée sa fiche d’un clic (« ＋ Créer »), ou reste en texte. 📝 sur une ligne : reprise, invités, dédicace, 1re fois, durée… · ⠿ ou ↑ ↓ pour ranger.</p></div>`; },
        get: (el, f) => T.rows.get(el, slField(f, genreInForm(el))).map(cleanRow).filter(r => U.ref(r.work) || r.note || (r.t && r.t !== 'item' && r.t !== 'encore' && r.t !== 'medley')),
        text: (f, v) => (Array.isArray(v) ? v : []).map(r => U.refTitle(r.work) || r.note || '').filter(Boolean).join(' · '),
        empty: () => false};

    /* — lire la setlist : numéros, rappels R1 R2, parties, entractes ; badges ; le milieu replié si elle est longue — */
    const songT = t => !t || t === 'item' || t === 'medley';
    SC.isSong = r => songT(r.t) || r.t === 'encore';
    /** la clé d'un titre (fiche, sinon le texte, rapproché d'une fiche du même titre) pour compter les fois où il est joué */
    SC.titleIndex = store => { const m = new Map(); (store.items || []).forEach(it => { if (['track_work', 'stage_piece', ...MUSIC_KINDS, ...PIECE_KINDS].includes(it.kind)) m.set(fold(it.title), it.id); }); return m; };
    SC.rowKey = (r, idx) => { const x = U.ref(r.work); if (x?.iid) return `i${x.iid}`; const t = fold(x?.txt || ''); if (!t) return ''; const id = idx?.get(t); return id ? `i${id}` : `t${t}`; };
    SC.concerts = store => [...(store.of ? store.of('concert') : [])].sort((a, b) => SC.dateKey(a) - SC.dateKey(b) || a.id - b.id);
    /** pour chaque titre : nombre de soirs, 1er et dernier soir (le tout calculé sur les fiches de la liste donnée) */
    SC.playStats = (store, list = null) => {
        const idx = SC.titleIndex(store), out = new Map();
        (list || SC.concerts(store)).forEach(c => { const seen = new Set(); SC.rowsOf(c).forEach(r => { if (!SC.isSong(r)) return; const k = SC.rowKey(r, idx); if (!k || seen.has(k)) return; seen.add(k);
            const x = out.get(k) || {key: k, n: 0, first: null, last: null, title: U.refTitle(r.work), ref: U.ref(r.work), cover: !!r.cover};
            if (!x.ref?.iid && U.ref(r.work)?.iid) x.ref = U.ref(r.work); if (r.cover) x.cover = true;
            x.n++; const k2 = SC.dateKey(c); if (!x.first || k2 < x.first.k) x.first = {k: k2, c}; if (!x.last || k2 >= x.last.k) x.last = {k: k2, c}; out.set(k, x); }); });
        return out;
    };
    const tipOf = x => x ? `${plural(x.n, 'soir')} · 1re fois : ${SC.dayLabel(SC.dayOf(x.first.c.data.date), 'num') || x.first.c.year || '?'} · dernière : ${SC.dayLabel(SC.dayOf(x.last.c.data.date), 'num') || x.last.c.year || '?'}` : '';
    const soundOfWork = (store, iid) => { const rec = (store.items || []).find(r => r.kind === 'recording' && U.ref(r.data?.work)?.iid === iid && ART.mediaOf(r.data?.sound)); const m = rec && ART.mediaOf(rec.data.sound); return m ? ART.player(`media/${encodeURIComponent(m.f)}`, m.dur, m.title) : ''; };
    function setlistHtml(ctx, it, {mini = false} = {}) {
        const store = ctx.store, g = SC.genreOf(it), rows = SC.rowsOf(it);
        const stats = mini ? null : SC.playStats(store), idx = SC.titleIndex(store);
        let n = 0, enc = 0;
        const main = rows.filter(r => songT(r.t)).length, collapse = !mini && main > 14;
        let songNo = 0;
        const html = rows.map((r, i) => {
            const ref = U.ref(r.work), title = ref ? U.refChip(r.work, ref.iid ? (ART.defs[ref.kind]?.icon || '🎵') : (g.kinds === MUSIC_KINDS ? '🎵' : '🎭')) : '';
            const mk = ref && !ref.iid && !mini && SC.isSong(r) && it.id && (!it.person_id || it.person_id === store.pid) ? ` <button type="button" class="ar-linkbtn sc-mk" data-sl-mk="${i}" title="Créer la fiche de ce ${esc(g.item)} (titre seul), et y relier cette ligne">＋ fiche</button>` : '';
            const notes = [];
            if (r.first) notes.push('<span class="ar-badge b">1re fois en public</span>');
            if (r.last) notes.push('<span class="ar-badge">dernière fois</span>');
            if (r.cover) notes.push(`<span class="ar-badge">reprise</span> de ${U.personChip(r.cover, '', ctx)}`);
            if (r.version) notes.push(esc(r.version));
            if (r.t === 'medley') notes.push('en medley avec le précédent');
            if (r.with) notes.push(`avec ${esc(r.with)}`);
            if (ART.normPeople(r.guests).length) notes.push('invité' + (ART.normPeople(r.guests).length > 1 ? 's' : ''));
            if (r.dedic) notes.push(`dédié à ${U.personChip(r.dedic, '', ctx)}`);
            if (r.unfinished) notes.push('<span class="ar-badge w">inachevé</span>');
            if (r.dur) notes.push(`<small class="ar-g">${esc(r.dur)}</small>`);
            if (r.at) notes.push(`<small class="ar-g">à ${esc(r.at)} de la captation</small>`);
            if (r.note) notes.push(esc(r.note));
            const guests = ART.normPeople(r.guests).map(p => U.personChip(p, p.role, ctx)).join(' ');
            const st = stats?.get(SC.rowKey(r, idx)), tip = st && st.n > 1 ? ` title="${esc(tipOf(st))}"` : '';
            const play = ref?.iid && !mini ? soundOfWork(store, ref.iid) : '';
            if (r.t === 'set') return `<tr class="sc-set"><td class="n"></td><td colspan="${mini ? 2 : 3}"><b>${esc(r.note || U.refTitle(r.work) || 'Nouvelle partie')}</b>${ref && r.note ? ` · ${title}` : ''}</td></tr>`;
            if (r.t === 'interlude' || r.t === 'tape') return `<tr class="sc-inter"><td class="n">${r.t === 'tape' ? '♪' : '–'}</td><td><i>${ref ? title : ''}${ref && r.note ? ` · ${esc(r.note)}` : ''}${!ref ? esc(r.note || (r.t === 'tape' ? 'Bande' : 'Entracte')) : ''}</i>${mk}</td>${mini ? '' : `<td>${r.t === 'tape' ? 'bande' : 'interlude'}</td><td></td>`}</tr>`;
            const isEnc = r.t === 'encore'; let no = '';
            if (isEnc) { enc++; no = `R${enc}`; } else { n++; songNo++; no = String(n); }
            const mid = collapse && !isEnc && songNo > 4 && songNo <= main - 2 ? ' sl-mid' : '';
            return `<tr class="${isEnc ? 'sc-enc' : ''}${mid}"><td class="n">${no}</td><td${tip}>${isEnc ? '<b>Rappel</b> · ' : ''}${title || '<span class="ar-none">—</span>'}${mk}${guests ? ` <small class="ar-g">avec</small> ${guests}` : ''}</td>${mini ? '' : `<td>${notes.join(' · ')}</td><td class="pl">${play}</td>`}</tr>`;
        });
        let out = html, hiddenN = collapse ? main - 6 : 0;
        if (collapse) { const at = html.findIndex(h => h.includes(' sl-mid')); if (at >= 0) out = [...html.slice(0, at), `<tr class="sc-fold"><td class="n">5–${main - 2}</td><td colspan="3"><button type="button" class="ar-linkbtn" data-sl-expand>▸ ${esc(plural(hiddenN, g.item, g.items))} de plus (tout voir)</button></td></tr>`, ...html.slice(at)]; }
        return `<div class="ar-scroll"><table class="ar-t sc-setlist">${mini ? '' : `<thead><tr><th>#</th><th>${esc(cap(g.item))}</th><th>Notes</th><th></th></tr></thead>`}<tbody>${out.join('')}</tbody></table></div>`;
    }
    SC.setlistHtml = setlistHtml;
    const slCount = it => { const r = SC.rowsOf(it); return {songs: r.filter(x => songT(x.t)).length, enc: r.filter(x => x.t === 'encore').length}; };
    SC.slCount = slCount;
    ART.views.setlist = {
        read: (ctx, it) => { const g = SC.genreOf(it), rows = SC.rowsOf(it), mine = it.id && (!it.person_id || it.person_id === ctx.store.pid);
            if (!rows.length) return `<div class="sc-sl-empty">${A().emptyState ? A().emptyState({icon: '📋', text: `Pas encore de ${g.list.toLowerCase()} pour ce soir`, hint: 'Note les titres dans l’ordre, avec les rappels, les reprises, les invités… ou copie la setlist d’un autre soir.', ...(mine ? {action: {label: `＋ ${g.add}`, attrs: 'data-sl-addread'}} : {})}) : ''}</div>`;
            return `${setlistHtml(ctx, it)}<p class="ar-note">Survole un titre : combien de fois il a été joué, la 1re et la dernière fois (d’après tes fiches). Un titre sans fiche : « ＋ fiche » la crée.</p>`; },
        meta: (ctx, it) => { const c = slCount(it), g = SC.genreOf(it); return c.songs || c.enc ? esc([plural(c.songs + c.enc, g.item, g.items), c.enc && plural(c.enc, 'rappel')].filter(Boolean).join(' · ')) : ''; },
        actions: (ctx, it) => it.id && (!it.person_id || it.person_id === ctx.store.pid) ? `<button type="button" class="button small secondary" data-sl-addread>＋ ${esc(SC.genreOf(it).add)}</button><button type="button" class="button small secondary" data-sl-copy>📋 Copier la setlist d’un autre soir</button>` : '',
        text: (ctx, it) => SC.rowsOf(it).map(r => U.refTitle(r.work)).filter(Boolean).join(' · ')};
    ART.views.sc_count = {read: () => '', text: (ctx, it) => { const c = slCount(it), g = SC.genreOf(it); return c.songs + c.enc ? plural(c.songs + c.enc, g.item, g.items) : ''; }};
    /** horaires : début – fin, et la durée calculée (« 20 h 45 – 22 h 17 · 1 h 32 ») */
    T.sc_times = {label: 'Horaires', badge: '🕘', value: d => ({start: d.start ?? '', end: d.end ?? ''}),
        edit: (f, v) => `<div class="sc-times"><input class="ar-in" data-t="start" value="${esc(v.start)}" placeholder="début : 20 h 45" aria-label="Début"> – <input class="ar-in" data-t="end" value="${esc(v.end)}" placeholder="fin : 22 h 17" aria-label="Fin"></div>`,
        collect: (el, f, draft) => { draft.start = el.querySelector('[data-t="start"]').value.trim().slice(0, 40); draft.end = el.querySelector('[data-t="end"]').value.trim().slice(0, 40); },
        read: (f, v) => { const d = SC.durMin({data: v}); return `${esc([v.start, v.end].filter(Boolean).join(' – '))}${d != null ? ` <small class="ar-g">· ${esc(SC.hm(d))}</small>` : ''}`; },
        text: (f, v) => { const d = SC.durMin({data: v}); return [[v.start, v.end].filter(Boolean).join(' – '), d != null ? SC.hm(d) : ''].filter(Boolean).join(' · '); }, empty: v => !v || (!v.start && !v.end)};
    ART.views.sc_duration = {read: (ctx, it) => SC.durationText(it) ? `<dl class="ar-dl ar-dl-s"><dt>Durée</dt><dd>${esc(SC.durationText(it))}</dd></dl>` : '', text: (ctx, it) => SC.durationText(it)};
    /** « 1 h 32 » d'après le début et la fin (20 h 45 – 22 h 17) */
    SC.minutes = t => { const m = String(t || '').match(/(\d{1,2})\s*(?:h|:)\s*(\d{2})?/i); return m ? Number(m[1]) * 60 + Number(m[2] || 0) : null; };
    SC.durMin = it => { const a = SC.minutes(it.data?.start), b = SC.minutes(it.data?.end); if (a == null || b == null) return null; const d = b >= a ? b - a : b + 1440 - a; return d > 0 && d < 1000 ? d : null; };
    SC.hm = d => d == null ? '' : d >= 60 ? `${Math.floor(d / 60)} h ${String(d % 60).padStart(2, '0')}` : `${d} min`;
    SC.durationText = it => SC.hm(SC.durMin(it));
    ART.views.sc_press = {read: (ctx, it, f, v) => (Array.isArray(v) ? v : []).map(r => `<div class="sc-press"><span class="ar-ochip"><i>📰</i>${esc([r.paper, r.date].filter(Boolean).join(', ') || 'Article')}</span>${r.tone ? ` <span class="sc-tone ${esc(r.tone)}" title="${esc({pos: 'critique positive', neu: 'neutre', neg: 'critique négative'}[r.tone] || '')}">${{pos: '+', neu: '=', neg: '−'}[r.tone] || ''}</span>` : ''}${r.title ? ` <small class="ar-g">${esc(r.title)}</small>` : ''}${r.quote ? `<div class="sc-quote">« ${esc(r.quote)} »</div>` : ''}</div>`).join('')};
    ART.views.sc_torec = {read: (ctx, it) => { if (!it.id || !ART.defs.recording) return ''; const m = ART.mediaOf(it.data?.sound); const works = SC.rowsOf(it).filter(r => SC.isSong(r) && U.ref(r.work)?.iid && ART.defs[U.ref(r.work).kind || 'track_work']?.key === 'track_work');
        if (!works.length) return ''; const done = SC.recsOf(ctx.store, it.id).length;
        return `<p class="ar-note">${done ? `${esc(plural(done, 'enregistrement'))} « en public » déjà ${done > 1 ? 'tirés' : 'tiré'} de ce soir. ` : ''}${m || done < works.length ? `<button type="button" class="ar-linkbtn u" data-sc-torec>→ En faire ${works.length - done > 1 ? 'des enregistrements' : 'un enregistrement'} « en public » ${works.length - done > 1 ? 'des morceaux' : 'du morceau'} (${works.length - done})</button>` : ''}</p>`; }};
    SC.recsOf = (store, cid) => (store.items || []).filter(r => r.kind === 'recording' && U.ref(r.data?.concert)?.iid === cid);

    /* ═════════ 🎤 La fiche d'un soir ═════════ */
    const VENUES = [['', '—'], ['salle', 'Salle de spectacle'], ['plein_air', 'Plein air'], ['eglise', 'Église, chapelle'], ['chapiteau', 'Chapiteau'], ['bal', 'Bal, salle des fêtes'], ['cafe', 'Café, cabaret'], ['theatre', 'Théâtre'], ['opera', 'Opéra'], ['festival', 'Scène de festival'], ['radio', 'Radio (en public)'], ['tele', 'Télévision'], ['prive', 'Soirée privée'], ['autre', 'Autre']];
    const CAST_STATUS = [['titulaire', 'titulaire'], ['remplacant', 'remplaçant(e)'], ['doublure', 'doublure'], ['creation', 'création du rôle'], ['derniere', 'dernière fois']];
    SC.CAST_STATUS = CAST_STATUS;
    const gate = values => ({field: 'skind', values, dflt: 'concert'});
    const tourOf = (store, it) => { const r = U.ref(it?.data?.tour); return r?.iid ? store?.get?.(r.iid) || {id: r.iid, title: r.title, kind: 'tour', data: {}} : r?.txt ? {id: 0, title: r.txt, data: {}} : null; };
    SC.tourOf = tourOf;
    SC.tourDates = (store, tid) => SC.concerts(store).filter(c => U.ref(c.data?.tour)?.iid === tid);
    SC.autoTitle = (who, city, date) => { const d = SC.dayLabel(SC.dayOf(date)) || String(date || '').trim(); return [who && city ? `${who} à ${city}` : who || city, d].filter(Boolean).join(', '); };
    ART.define({key: 'concert', icon: '🎤', label: 'Concert ou représentation', many: 'Concerts et représentations', tab: 'Scène', domain: 'scene', parentField: 'staging',
        searchHint: 'ville, salle, morceau joué, tournée',
        eyebrow: (it, store) => { const g = SC.genreOf(it), t = tourOf(store, it); let pos = '';
            if (t?.id && it.id) { const l = SC.tourDates(store, t.id), i = l.findIndex(c => c.id === it.id); if (i >= 0) pos = `date ${i + 1}/${Math.max(l.length, Number(t.data?.planned) || 0)}`; }
            return [g.eb, t && (/^tourn[ée]e\b/i.test(t.title) ? t.title : `tournée ${t.title}`), pos].filter(Boolean).join(' · '); },
        heading: (ctx, it) => { const d = SC.dayOf(it.data?.date), wd = SC.weekday(d), venue = [it.data?.venue, U.placeTitle(it.data?.place)].filter(Boolean).join(', ');
            return `<h2 class="ar-h2">${esc(SC.cut(it.title || 'Sans titre', 200))}</h2><p class="ar-g sc-when">${esc([[wd, SC.dayLabel(d) || it.data?.date].filter(Boolean).join(' '), venue, it.data?.show && `« ${it.data.show} »`].filter(Boolean).join(' · '))}</p>`; },
        badges: (ctx, it) => { const cur = it.data?.skind || 'concert', mine = it.id && (!it.person_id || it.person_id === ctx.store.pid);
            return `<div class="ui-filters sc-genres" role="group" aria-label="Sorte de soirée">${GENRES.map(g => `<button type="button" class="${g.key === cur ? 'is-active' : ''}" ${mine ? `data-sc-genre="${g.key}"` : 'disabled'} title="${g.key === cur ? 'La sorte de ce soir' : `En faire : ${esc(g.label)} (la setlist s’adapte)`}">${g.icon} ${esc(g.label)}</button>`).join('')}</div>`; },
        cardLine: it => [SC.dayLabel(SC.dayOf(it.data?.date), 'short') || it.year, SC.cityOf(it)].filter(Boolean).join(' · '),
        newData: store => ({skind: 'concert', on_stage: store?.pid ? [{pid: store.pid, title: store.name, role: ''}] : []}),
        /** les fiches d'avant (programme, musiciens, tournée en texte) : remises au format de la setlist */
        upgrade: d => { if (typeof d.tour === 'string') d.tour = d.tour.trim() ? {txt: d.tour.trim()} : '';
            if (Array.isArray(d.program) && d.program.length && !Array.isArray(d.setlist)) { d.setlist = d.program.map(r => cleanRow({work: r.work, note: r.note})); delete d.program; }
            if (Array.isArray(d.musicians) && d.musicians.length && !Array.isArray(d.on_stage)) { d.on_stage = d.musicians; delete d.musicians; }
            if (!d.skind) d.skind = 'concert'; },
        groups: [
            {key: 'main', label: 'Le soir', zone: 'main', fields: [
                {key: 'skind', label: 'Sorte de soirée', type: 'select', choices: GENRES.map(g => [g.key, `${g.icon} ${g.label}`]), star: true, head: true, help: '(la setlist s’adapte)'},
                {key: 'title', label: 'Titre', type: 'text', star: true, head: true, ph: 'se remplit tout seul : Joseph MARTIN à Tulle, 14 juillet 1958'},
                {key: 'date', label: 'Date', type: 'date', star: true},
                {key: 'show', label: 'Spectacle, programme', type: 'text', star: true, ph: 'Récital, « Le grand show », Nuit du conte…'},
                {key: 'lineup', label: 'Formation', type: 'text', star: true, ph: 'Joseph Martin et son orchestre'},
                {key: 'staging', label: 'Mise en scène', short: 'Mise en scène', type: SC.gated('item'), kinds: STAGING_KINDS, gate: gate(['theatre', 'danse', 'orchestre', 'conte', 'autre', 'humour', 'cirque']), star: true, help: '(théâtre, opéra… : cette représentation devient une de ses dates)', roleWord: 'représentation'}]},
            {key: 'setlist', label: 'Setlist, programme', zone: 'main', fields: [{key: 'setlist', label: 'Setlist, programme', secLabel: '📋 Setlist', type: 'setlist', view: 'setlist', star: true, section: true, roleWord: 'dans la setlist'}]},
            {key: 'stage', label: '👥 Sur scène · dans la salle', zone: 'main', fields: [
                {key: 'on_stage', label: 'Sur scène', type: 'sc_people', star: true, addLabel: 'Une personne sur scène', rolePh: 'chant, accordéon, rôle…', roleWord: 'sur scène'},
                {key: 'conductor', label: 'Chef d’orchestre', type: SC.gated('person'), gate: gate(['orchestre']), star: true, roleWord: 'chef d’orchestre'},
                {key: 'soloists', label: 'Solistes', type: SC.gated('sc_people'), gate: gate(['orchestre']), star: true, addLabel: 'Un ou une soliste', rolePh: 'violon, soprano…', roleWord: 'soliste'},
                {key: 'audience_people', label: 'Dans le public', type: 'sc_people', star: true, addLabel: 'Une personne dans la salle', rolePh: '6 ans, invitée, au 1er rang…', roleWord: 'dans le public'}]},
            {key: 'theatre', label: '🎭 Ce soir-là, au théâtre', zone: 'main', fields: [
                {key: 'cast_night', label: 'Rôles du soir', type: SC.gated('rows'), gate: gate(['theatre', 'danse', 'orchestre', 'conte', 'autre']), star: true, section: true, addLabel: 'Un rôle', unitWord: 'rôle',
                    cols: [{key: 'role', label: 'Rôle', w: 'm'}, {key: 'who', label: 'Joué par', type: 'person', w: 'm'}, {key: 'status', label: 'Titulaire ou remplaçant', type: 'select', choices: [['', '—'], ...CAST_STATUS], w: 's'}, {key: 'note', label: 'Note', w: 'm'}]},
                {key: 'incidents', label: 'Incidents', type: SC.gated('longtext'), gate: gate(['theatre', 'danse', 'cirque', 'humour', 'conte', 'autre', 'orchestre']), star: true, ph: 'trou de mémoire, panne de lumière, orage…'},
                {key: 'curtain_calls', label: 'Rappels (saluts)', type: SC.gated('number'), gate: gate(['theatre', 'danse', 'cirque', 'orchestre']), star: true},
                {key: 'takings', label: 'Recette', type: 'money', star: false}]},
            {key: 'evening', label: 'La soirée', icon: '🎟', zone: 'left', fields: [
                {key: 'place', label: 'Lieu', type: 'place', star: true}, {key: 'venue', label: 'Salle', type: 'text', star: true, ph: 'Bobino, place de la Cathédrale…'},
                {key: 'venue_kind', label: 'Sorte de salle', type: 'select', choices: VENUES, star: false},
                {key: 'tour', label: 'Tournée', type: 'item', kinds: ['tour'], star: true, roleWord: 'date de la tournée'},
                {key: 'festival', label: 'Festival, fête', type: 'text', star: true},
                {key: 'opening', label: '1re partie', type: 'items', kinds: ['org', 'concert'], star: true},
                {key: 'times', label: 'Horaires', type: 'sc_times', star: true},
                {key: 'audience', label: 'Spectateurs', type: 'number', star: true, ph: '≈ 3 000'}, {key: 'sold_out', label: 'Complet', type: 'sc_flag', on: 'Complet', star: false},
                {key: 'ticket', label: 'Billet', type: 'money', star: true, ph: '200 F'}, {key: 'ticket_doc', label: 'Billet (scan)', type: 'document', star: false},
                {key: 'poster', label: 'Affiche', type: 'item', kinds: POSTER_KINDS, star: true}]},
            {key: 'photos', label: 'Affiche, photos', zone: 'left', fields: [{key: 'photos', label: 'Affiche, photos', type: 'photos', star: true, labels: [['affiche', 'Affiche'], ['billet', 'Billet'], ['scene', 'Scène'], ['public', 'Public'], ['loges', 'Loges'], ['autre', 'Autre']]}]},
            {key: 'capt', label: 'Captations', icon: '🎙', zone: 'right', fields: [
                {key: 'sound', label: 'Captation (son ou vidéo)', type: 'media', media: ['audio', 'video'], star: true},
                {key: 'video', label: 'Autre captation', type: 'media', media: ['video', 'audio'], star: false},
                {key: 'capt_note', label: 'Précision', type: 'text', star: true, ph: 'bande amateur, radio, film 8 mm…'},
                {key: '_torec', label: 'En faire des enregistrements', type: 'computed', view: 'sc_torec', star: true}]},
            {key: 'press', label: 'Presse', icon: '📰', zone: 'right', fields: [{key: 'press', label: 'Articles', type: 'rows', view: 'sc_press', star: true, addLabel: 'Un article',
                cols: [{key: 'paper', label: 'Journal, revue', w: 'm'}, {key: 'date', label: 'Date', w: 's'}, {key: 'tone', label: 'Ton', type: 'select', choices: [['', '—'], ['pos', '+ positif'], ['neu', '= neutre'], ['neg', '− négatif']], w: 's'}, {key: 'title', label: 'Titre de l’article', w: 'm'}, {key: 'quote', label: 'Extrait', type: 'longtext', w: 'l'}]}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        beforeSave: d => { if (String(d.audience || '').trim()) d.spectators = d.audience; else delete d.spectators; }, // la colonne « Spect. » des représentations (outil « œuvres »)
        listExtra: [{key: '_count', label: 'Titres', type: 'computed', view: 'sc_count'}],
        list: ['date', 'title', 'place', 'venue', 'tour', '_count'], card: ['date', 'place', '_count'], export: ['skind', 'date', 'title', 'place', 'venue', 'tour', 'setlist', 'on_stage', 'audience', 'notes'],
        filters: store => [{id: 'skind', label: 'Sorte de soirée', type: 'check', options: GENRES.filter(g => store.of('concert').some(c => (c.data.skind || 'concert') === g.key)).map(g => [g.key, `${g.icon} ${g.label}`]), test: (it, v) => !v?.length || v.includes(it.data.skind || 'concert')}],
        sorts: [['recent', 'Plus récents'], ['old', 'Plus anciens'], ['city', 'Ville A → Z'], ['songs', 'Le plus de titres'], ['audience', 'Le plus de spectateurs']],
    });

    // l'outil « œuvres » ne crée sa propre « Représentation » que si aucun type performance / show / representation n'existe :
    // « representation » désigne ici la fiche d'un soir (alias caché : n'apparaît dans aucune liste de sortes) ; voir SC.late
    if (!Object.prototype.hasOwnProperty.call(ART.defs, 'representation')) Object.defineProperty(ART.defs, 'representation', {get: () => ART.defs.concert, enumerable: false, configurable: true});

    /* ═════════ 🚌 La tournée ═════════ */
    ART.views.sc_tour_dates = {
        read: (ctx, it) => { const l = SC.tourDates(ctx.store, it.id), mine = !it.person_id || it.person_id === ctx.store.pid;
            const add = mine && it.id ? `<button type="button" class="button small secondary" data-sc-newdate="${it.id}">＋ Ajouter une date</button>` : '';
            if (!l.length) return `<p class="muted">Aucune date pour l’instant.</p>${add}`;
            return `<div class="ar-scroll"><table class="ar-t sc-dates"><thead><tr><th>#</th><th>Date</th><th>Ville</th><th>Salle</th><th>Titres</th><th>Spectateurs</th></tr></thead><tbody>${l.map((c, i) => { const n = slCount(c);
                return `<tr class="is-click" data-ar-row-open="${c.id}"><td class="n">${i + 1}</td><td>${esc(SC.dayLabel(SC.dayOf(c.data.date), 'short') || c.data.date || '')}</td><td>${esc(SC.cityOf(c))}</td><td>${esc(c.data.venue || '')}</td><td>${n.songs + n.enc || ''}</td><td>${esc(c.data.audience || '')}</td></tr>`; }).join('')}</tbody></table></div>${add}`; },
        meta: (ctx, it) => { const l = SC.tourDates(ctx.store, it.id); return l.length ? esc([plural(l.length, 'date'), it.data?.planned && `${it.data.planned} prévues`, plural(new Set(l.map(SC.cityOf).filter(Boolean)).size, 'ville')].filter(Boolean).join(' · ')) : ''; },
        text: (ctx, it) => { const n = SC.tourDates(ctx.store, it.id).length; return n ? plural(n, 'date') : ''; }};
    /** la setlist type : à chaque place, le titre le plus souvent joué (R1, R2… pour les rappels) */
    SC.typeSetlist = (store, list) => {
        const idx = SC.titleIndex(store), pos = new Map();
        list.forEach(c => { let n = 0, e = 0; SC.rowsOf(c).forEach(r => { if (!SC.isSong(r)) return; const p = r.t === 'encore' ? `R${++e}` : String(++n); const k = SC.rowKey(r, idx); if (!k) return;
            const m = pos.get(p) || new Map(); const x = m.get(k) || {n: 0, title: U.refTitle(r.work), ref: U.ref(r.work)}; x.n++; m.set(k, x); pos.set(p, m); }); });
        const order = [...pos.keys()].sort((a, b) => (a[0] === 'R') - (b[0] === 'R') || Number(a.replace('R', '')) - Number(b.replace('R', '')));
        return order.map(p => { const best = [...pos.get(p).values()].sort((a, b) => b.n - a.n)[0]; return {pos: p, ...best, of: list.length}; });
    };
    SC.typeHtml = (store, list, max = 30) => { const rows = SC.typeSetlist(store, list).slice(0, max); if (!rows.length) return '<p class="muted">Pas encore de setlist notée pour ces dates.</p>';
        return `<div class="ar-scroll"><table class="ar-t sc-type"><thead><tr><th>Pos.</th><th>Titre le plus souvent à cette place</th><th>Joué</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td class="n">${esc(r.pos)}</td><td>${r.ref ? U.refChip(r.ref, '🎵') : esc(r.title)}</td><td>${r.n} / ${r.of}</td><td class="sc-barcell"><span class="sc-bar${r.pos[0] === 'R' ? ' is-enc' : ''}" style="width:${Math.round(r.n / Math.max(1, r.of) * 100)}%"></span></td></tr>`).join('')}</tbody></table></div>`; };
    ART.views.sc_tour_type = {read: (ctx, it) => { const l = SC.tourDates(ctx.store, it.id); return l.length ? SC.typeHtml(ctx.store, l) : ''; }, meta: (ctx, it) => { const n = SC.tourDates(ctx.store, it.id).filter(c => SC.rowsOf(c).length).length; return n ? `d’après ${esc(plural(n, 'setlist'))}` : ''; }};
    ART.views.sc_tour_map = {read: (ctx, it) => SC.tourDates(ctx.store, it.id).some(c => U.place(c.data.place)?.plid) ? `<div class="sc-map" data-sc-map="tour:${it.id}"><p class="muted">Carte…</p></div>` : '<p class="muted">Les lieux des dates (choisis dans ta base) s’affichent ici, reliés dans l’ordre.</p>'};
    ART.define({key: 'tour', icon: '🚌', label: 'Tournée', many: 'Tournées', fem: true, domain: 'scene',
        eyebrow: (it, store) => { const n = it.id ? SC.tourDates(store, it.id).length : 0; return ['Tournée', n && plural(n, 'date'), it.data?.dates].filter(Boolean).join(' · '); },
        cardLine: it => [it.data?.dates, it.data?.artist].filter(Boolean).join(' · '),
        groups: [
            {key: 'main', label: 'La tournée', zone: 'main', fields: [
                {key: 'title', label: 'Nom de la tournée', type: 'text', star: true, head: true, ph: 'Tournée d’été 1958'}, {key: 'dates', label: 'Dates', type: 'text', star: true, ph: 'été 1958, 1966 – 1967'},
                {key: 'artist', label: 'Artiste, formation', type: 'text', star: true}, {key: 'show', label: 'Spectacle, programme', type: 'text', star: true},
                {key: 'skind', label: 'Sorte de spectacle', type: 'select', choices: GENRES.map(g => [g.key, `${g.icon} ${g.label}`]), star: true},
                {key: 'planned', label: 'Dates prévues', type: 'number', star: true}, {key: 'promoter', label: 'Organisateur, tourneur', type: 'item', kinds: ['org'], star: true},
                {key: 'staging', label: 'Mise en scène', type: 'item', kinds: STAGING_KINDS, star: false, help: '(théâtre : la mise en scène qui tourne)'}]},
            {key: 'dates_g', label: 'Les dates', zone: 'main', fields: [{key: '_dates', label: '📅 Les dates', type: 'computed', view: 'sc_tour_dates', star: true}]},
            {key: 'type_g', label: 'Setlist type', zone: 'main', fields: [{key: '_type', label: '🚌 Setlist type', type: 'computed', view: 'sc_tour_type', star: true}]},
            {key: 'photos', label: 'Affiche, photos', zone: 'left', fields: [{key: 'photos', label: 'Affiche, photos', type: 'photos', star: true, labels: [['affiche', 'Affiche'], ['photo', 'Photo'], ['autre', 'Autre']]}]},
            {key: 'route', label: 'Itinéraire', icon: '🗺', zone: 'right', fields: [{key: '_map', label: 'Itinéraire', type: 'computed', view: 'sc_tour_map', star: true}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        list: ['photos', 'title', 'dates', 'artist', '_dates'], card: ['dates', '_dates'], export: ['title', 'dates', 'artist', 'show', 'planned', 'notes'],
        listExtra: [{key: '_dates', label: 'Dates', type: 'computed', view: 'sc_tour_dates'}],
    });

    /* ═════════ 🎭 Sketch, numéro, scène ═════════ */
    const PIECES = [['sketch', 'Sketch'], ['monologue', 'Monologue'], ['numero', 'Numéro de cirque'], ['choregraphie', 'Chorégraphie'], ['scene', 'Scène de théâtre'], ['conte', 'Conte'], ['chanson', 'Chanson parlée, poème dit'], ['tour', 'Tour de magie'], ['autre', 'Autre']];
    SC.PIECES = PIECES;
    ART.views.sc_played = {
        read: (ctx, it) => { if (!it.id) return ''; const x = SC.playStats(ctx.store).get(`i${it.id}`); if (!x) return '<p class="muted">Jamais noté dans une setlist pour l’instant.</p>';
            const evs = SC.concerts(ctx.store).filter(c => SC.rowsOf(c).some(r => U.ref(r.work)?.iid === it.id)).slice(-6).reverse();
            return `<p><b>${esc(plural(x.n, 'soir'))}</b> · 1re fois : ${U.refChip({iid: x.first.c.id, title: SC.dayLabel(SC.dayOf(x.first.c.data.date), 'num') || x.first.c.title, kind: 'concert'})} · dernière : ${U.refChip({iid: x.last.c.id, title: SC.dayLabel(SC.dayOf(x.last.c.data.date), 'num') || x.last.c.title, kind: 'concert'})}</p>${evs.length > 1 ? `<div class="ar-g">Derniers soirs :</div>${evs.map(c => `<div>${U.refChip({iid: c.id, title: c.title, kind: 'concert'})}</div>`).join('')}` : ''}`; },
        text: (ctx, it) => { const x = it.id && SC.playStats(ctx.store).get(`i${it.id}`); return x ? plural(x.n, 'soir') : ''; }};
    ART.define({key: 'stage_piece', icon: '🎭', label: 'Sketch, numéro, scène', many: 'Sketches, numéros, scènes', domain: 'scene',
        eyebrow: it => (PIECES.find(p => p[0] === it.data?.pkind) || PIECES[0])[1],
        cardLine: it => [(PIECES.find(p => p[0] === it.data?.pkind) || [, ''])[1], it.data?.written].filter(Boolean).join(' · '),
        newData: () => ({pkind: 'sketch'}),
        groups: [
            {key: 'main', label: 'Le numéro', zone: 'main', fields: [
                {key: 'title', label: 'Titre', type: 'text', star: true, head: true}, {key: 'pkind', label: 'Sorte', type: 'select', choices: PIECES, star: true},
                {key: 'authors', label: 'Auteurs', type: 'people', star: true, view: 'credits', addLabel: 'Un auteur', rolePh: 'texte, mise en scène, musique…', section: true},
                {key: 'written', label: 'Écrit, créé', type: 'date', star: true}, {key: 'dur', label: 'Durée', type: 'text', star: true, ph: '6 min'},
                {key: 'from', label: 'Tiré de', type: 'item', kinds: PLAY_KINDS, star: false, help: '(la pièce, le spectacle)'}]},
            {key: 'chars', label: 'Personnages', zone: 'main', fields: [{key: 'characters', label: 'Personnages', type: 'rows', star: true, section: true, addLabel: 'Un personnage', cols: [{key: 'name', label: 'Personnage', w: 'm'}, {key: 'who', label: 'Joué par (d’habitude)', type: 'person', w: 'm'}]}]},
            {key: 'text', label: 'Le texte', zone: 'main', fields: [{key: 'text', label: 'Le texte, le déroulé', type: 'longtext', star: true, section: true, rows: 8}]},
            {key: 'photos', label: 'Photos', zone: 'left', fields: [{key: 'photos', label: 'Photos', type: 'photos', star: true}]},
            {key: 'media', label: 'Son, vidéo', icon: '🎞', zone: 'left', fields: [{key: 'media', label: 'Son ou vidéo', type: 'media', media: ['audio', 'video'], star: true}]},
            {key: 'played', label: 'Sur scène', icon: '🎤', zone: 'right', fields: [{key: '_played', label: 'Joué sur scène', type: 'computed', view: 'sc_played', star: true}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        list: ['title', 'pkind', 'written', 'dur', '_played'], card: ['pkind', '_played'], export: ['title', 'pkind', 'authors', 'written', 'dur', 'text'],
        listExtra: [{key: '_played', label: 'Joué', type: 'computed', view: 'sc_played'}],
        filters: () => [{id: 'pkind', label: 'Sorte', type: 'check', options: PIECES, test: (it, v) => !v?.length || v.includes(it.data.pkind || 'sketch')}],
    });

    /* ═════════ Une mise en scène (outil « œuvres ») : ses représentations ═════════ */
    SC.performancesOf = (store, id) => { const own = SC.concerts(store).filter(c => U.ref(c.data?.staging)?.iid === Number(id)); const seen = new Set(own.map(c => c.id));
        const other = store.linksTo(id, 'staging').map(l => store.otherOf(l, id)).filter(o => o && !seen.has(o.id)); return [...own, ...other]; };
    ART.views.sc_performances = {
        read: (ctx, it) => { if (!it.id) return ''; const l = SC.performancesOf(ctx.store, it.id), mine = !it.person_id || it.person_id === ctx.store.pid;
            const add = mine ? `<button type="button" class="button small secondary" data-sc-newperf="${it.id}">＋ Ajouter une représentation</button>` : '';
            if (!l.length) return `<p class="muted">Aucune représentation notée.</p>${add}`;
            const cities = new Set(l.map(SC.cityOf).filter(Boolean)), ys = l.map(c => SC.dayOf(c.data?.date)?.y || Number(c.year)).filter(Boolean);
            return `<p class="ar-sum">${esc([plural(l.length, 'représentation'), ys.length && [Math.min(...ys), Math.max(...ys)].filter((v, i, a) => a.indexOf(v) === i).join(' – '), cities.size && plural(cities.size, 'ville')].filter(Boolean).join(' · '))}</p>
                <div class="ar-scroll"><table class="ar-t"><thead><tr><th>Date</th><th>Ville</th><th>Salle</th><th>Rôles du soir</th></tr></thead><tbody>${l.slice(0, 200).map(c => `<tr class="is-click" data-ar-row-open="${c.id}"><td>${esc(SC.dayLabel(SC.dayOf(c.data?.date), 'short') || c.year || '')}</td><td>${esc(SC.cityOf(c))}</td><td>${esc(c.data?.venue || '')}</td><td>${ART.arr(c.data?.cast_night).filter(r => r.status === 'remplacant' || r.status === 'doublure').length ? '<span class="ar-badge w">remplacement</span>' : ''}</td></tr>`).join('')}</tbody></table></div>${add}`; },
        meta: (ctx, it) => { const n = it.id ? SC.performancesOf(ctx.store, it.id).length : 0; return n ? esc(plural(n, 'représentation')) : ''; },
        text: (ctx, it) => { const n = it.id ? SC.performancesOf(ctx.store, it.id).length : 0; return n ? plural(n, 'représentation') : ''; }};
    /** à appeler (ou laissé faire) une fois toutes les définitions chargées : les sortes des autres outils rejoignent nos listes */
    const addGroup = (def, g) => { if (!def || def.groups.some(x => x.key === g.key)) return; const i = def.groups.findIndex(x => x.key === '_linked'); g = {zone: 'main', icon: '', ...g, fields: g.fields.map(f => ({type: 'text', ...f}))}; if (i < 0) def.groups.push(g); else def.groups.splice(i, 0, g); };
    SC.addGroup = addGroup;
    SC.late = () => {
        Object.values(ART.defs).forEach(d => {
            if (!d || d.userType) return;
            // l'outil « œuvres » : o_mes (mise en scène), o_opera_prod, o_ballet… ; o_piece, o_opera… ; o_affiche ; o_concerto, o_symphonie…
            if (/^o_(mes|opera_prod|ballet|comedie_musicale|seul_en_scene|cirque|marionnettes|cabaret|magie|conte|lecture|rue)$/.test(d.key) && !STAGING_KINDS.includes(d.key)) STAGING_KINDS.push(d.key);
            if (/^o_(piece|opera|ballet|comedie_musicale)$/.test(d.key) && !PLAY_KINDS.includes(d.key)) PLAY_KINDS.push(d.key);
            if (d.key === 'o_affiche' && !POSTER_KINDS.includes(d.key)) POSTER_KINDS.unshift(d.key);
            if (/^o_(concerto|symphonie|sonate|quatuor|oratorio|messe|lied|chanson|musscene|arrangement)$/.test(d.key) && !MUSIC_KINDS.includes(d.key)) MUSIC_KINDS.push(d.key);
            if (/^(staging|mise_en_scene|mise_scene|production|theatre_staging)$/.test(d.key) || /mise en sc[eè]ne/i.test(d.label || '')) { if (!STAGING_KINDS.includes(d.key)) STAGING_KINDS.push(d.key); }
            if (/^(play|piece|theatre_play)$/.test(d.key) || /^pi[eè]ce( de th[eé][aâ]tre)?$/i.test(d.label || '')) { if (!PLAY_KINDS.includes(d.key)) PLAY_KINDS.push(d.key); }
            if (/^(poster|affiche)$/.test(d.key) && !POSTER_KINDS.includes(d.key)) POSTER_KINDS.unshift(d.key);
            if (d.domain === 'music' && /^(concerto|symphony|symphonie|opera|classical|oeuvre_musicale|musical_work)$/.test(d.key) && !MUSIC_KINDS.includes(d.key)) MUSIC_KINDS.push(d.key);
        });
        // « œuvres » : sa représentation (o_representation) = notre fiche « concert », enfant de la mise en scène (champ staging)
        const OE = ART.oeuvres, rep = OE?.entry?.('o_representation');
        if (rep && !ART.defs.o_representation) { rep.alt = ['concert', ...(rep.alt || []).filter(k => k !== 'concert')]; rep.label = 'Concert, représentation (setlist)';
            if (OE.childPreset) { const pre = OE.childPreset.o_representation; OE.childPreset.concert = (p, n) => ({...(pre ? pre(p, n) : {}), skind: 'theatre'}); } }
        const hasReps = d => ART.fieldsOf(d).some(f => f.view === 'o_children' && /^(o_representation|concert|representation)$/.test(f.child || ''));
        STAGING_KINDS.filter(k => ART.defs[k] && !(rep && !ART.defs.o_representation && hasReps(ART.defs[k]))).forEach(k => addGroup(ART.defs[k], {key: '_sc_perfs', label: 'Représentations', fields: [{key: '_sc_perfs', label: '🎭 Représentations', type: 'computed', view: 'sc_performances', star: true}]}));
        addGroup(ART.defs.track_work, {key: '_sc_played', label: 'Sur scène', icon: '🎤', zone: 'right', fields: [{key: '_sc_played', label: 'Joué sur scène', type: 'computed', view: 'sc_played', star: true}]});
    };
    // après TOUS les scripts (ceux chargés après celui-ci compris) : DOMContentLoaded, et « load » par sécurité (SC.late peut repasser)
    if (typeof document !== 'undefined' && document.readyState !== 'complete' && typeof window.addEventListener === 'function') { document.addEventListener('DOMContentLoaded', SC.late); window.addEventListener('load', SC.late); } else setTimeout(SC.late, 0);

    /* ═════════ Les onglets : « Scène », « Tournées », « Rôles », « Séries » dès qu'il y a des fiches (sans les sous-fiches) ═════════ */
    const tabKinds0 = ART.tabKinds;
    if (tabKinds0 && !tabKinds0._sc) {
        const added = () => { try { return JSON.parse(localStorage.getItem('genealogie-artist-prefs') || '{}')?.extraTabs || []; } catch (_) { return []; } };
        ART.tabKinds = store => { const l = tabKinds0(store), plus = added(); Object.values(ART.defs).forEach(d => { if (d?.scTab && !l.includes(d.key) && d.scTab(store)) l.push(d.key); }); return l.filter(k => !ART.defs[k]?.scQuiet || plus.includes(k)); };
        ART.tabKinds._sc = true;
    }
    ART.defs.concert.scTab = store => store.of('concert').length > 0;
    ART.defs.tour.scTab = store => store.of('tour').length > 0; ART.defs.stage_piece.scTab = store => store.of('stage_piece').length > 0;

    /* ═════════ Le formulaire : titre qui se remplit tout seul, sortes qui montrent leurs champs, setlist ═════════ */
    const C_of = el => el?.closest?.('.ar-dlg')?._C || null;
    const pkFirst = fld => { const pk = fld?.querySelector('.pk'); if (!pk) return null; try { const v = JSON.parse(pk.dataset.pkValue || '[]'); return (Array.isArray(v) ? v : [v])[0] || null; } catch (_) { return null; } };
    SC.pkFirst = pkFirst;
    /** les sortes qui fabriquent leur titre (SC.titleMakers[kind](form, C) → texte) */
    SC.titleMakers = SC.titleMakers || {};
    SC.titleMakers.concert = (form, C) => {
        const v = k => form.querySelector(`[data-fk="${k}"] [data-v]`)?.value?.trim() || '';
        const place = pkFirst(form.querySelector('[data-fk="place"]')), staging = pkFirst(form.querySelector('[data-fk="staging"]'));
        const who = staging?.title || v('show') || v('lineup') || C.store.name;
        return SC.autoTitle(who, String(place?.title || '').split(/\s*[,(]/)[0].trim(), v('date'));
    };
    const autoTitle = form => {
        const C = C_of(form), mk = C && SC.titleMakers[C.S.kind]; if (!mk) return;
        const inp = form.querySelector('[data-fk="title"] input'); if (!inp || (inp.value.trim() && inp.dataset.scAuto !== '1')) return;
        const t = mk(form, C); if (!t || t === inp.value) return; inp.value = t; inp.dataset.scAuto = '1';
        C.S.draft && (C.S.draft.title = t); const h = C.dlg.querySelector('.ar-tname h2'); if (h) h.textContent = t;
    };
    SC.autoTitleNow = autoTitle;
    const onForm = e => {
        const form = e.target.closest?.('.ar-dlg [data-ar-form]'); if (!form) return;
        if (e.type === 'input' && e.target.matches('[data-fk="title"] input')) { delete e.target.dataset.scAuto; return; }
        if (e.target.matches?.('[data-v]') && e.target.closest('[data-fk]')) { const fk = e.target.closest('[data-fk]').dataset.fk; if (form.querySelector(`.sc-gate[data-sc-gate="${CSS.escape(fk)}"]`)) refreshGates(form);
            if (fk === 'skind' && e.type === 'change') resetSetlist(form); }
        autoTitle(form);
    };
    if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('input', onForm); document.addEventListener('change', onForm); document.addEventListener('picker-change', onForm);
    }
    /** la sorte change : la setlist se redessine (mêmes lignes, bons boutons, bonnes fiches proposées) */
    function resetSetlist(form) {
        const fld = form.querySelector('[data-fk="setlist"]'), C = C_of(form); if (!fld || !C) return;
        const f = ART.fieldsOf(ART.defs.concert).find(x => x.key === 'setlist'), rows = T.setlist.get(fld, f), box = fld.querySelector('[data-sl-field]'); if (!box) return;
        const lost = box.contains(document.activeElement), tmp = document.createElement('div'); tmp.innerHTML = T.setlist.edit(f, rows, {draft: {skind: genreInForm(fld)}}); box.replaceWith(tmp.firstElementChild);
        if (lost || document.activeElement === document.body) form.querySelector('[data-fk="skind"] [data-v]')?.focus();
    }
    /** une ligne de plus dans la setlist du formulaire */
    function addRows(fld, rows, focus = true) {
        const f = slField(ART.fieldsOf(ART.defs.concert).find(x => x.key === 'setlist'), genreInForm(fld)), box = fld.querySelector('[data-sl-field] > .ar-rows'); if (!box) return;
        rows.forEach(r => { const tmp = document.createElement('div'); tmp.innerHTML = ART.rowHtml(f, {t: 'item', ...cleanRow(r)}, box.children.length); box.appendChild(tmp.firstElementChild); });
        if (focus) box.lastElementChild?.querySelector('.ar-pk .pk-input, input:not([type=hidden])')?.focus();
        box.dispatchEvent(new Event('change', {bubbles: true}));
    }
    /** une liste collée (un titre par ligne) : rapprochée des fiches du même titre */
    SC.parseList = (text, store) => { const idx = SC.titleIndex(store); let enc = false;
        return String(text || '').split(/\r?\n/).map(l => l.replace(/^\s*(?:\d+[.)-]?|[-•*·–])\s*/, '').trim()).filter(Boolean).slice(0, 300).map(l => {
            if (/^(rappels?|encore|bis)\s*:?$/i.test(l)) { enc = true; return null; }
            const m = l.match(/^(.+?)\s*\(([^()]*)\)\s*$/), title = (m ? m[1] : l).slice(0, 300), note = m ? m[2].slice(0, 300) : '', id = idx.get(fold(title)), it = id && store.get(id);
            return cleanRow({t: enc ? 'encore' : 'item', work: it ? {iid: it.id, title: it.title, kind: it.kind} : {txt: title}, note}); }).filter(Boolean); };
    /** choisir un autre soir et en prendre la setlist */
    async function pickSetlist(C, exceptId) {
        const it = await P().openPicker({kind: 'artwork', title: 'Copier la setlist d’un autre soir', eyebrow: 'SETLIST', filter: {art_kind: 'concert', art_person: C.pid}});
        if (!it?.id || Number(it.id) === Number(exceptId)) return null;
        let c = C.store.get(it.id); if (!c) { try { c = await C.store.ensure(it.id); } catch (e) { A().toast(e.message, 'error'); return null; } }
        return {from: c, rows: SC.rowsOf(c).map(r => ({...r, first: undefined, last: undefined}))};
    }
    /** enregistrer une fiche depuis la lecture, avec « ↶ Annuler » (H7) */
    SC.saveWithUndo = async (C, it, data, msg) => {
        const old = U.clone(it.data || {}), kind = it.kind, id = it.id;
        const put = async d => { await ART.saveItem(C.store, kind, id, d); await C.reload(); C.paint(true); };
        try { await put(data); } catch (e) { if (e.message) A().toast(e.message, 'error', {retry: () => SC.saveWithUndo(C, it, data, msg)}); return false; }
        if (msg) A().undoToast(msg, {undo: () => put(old), redo: () => put(data)});
        return true;
    };
    const busy = new WeakSet();
    if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('click', async e => {
        const b = e.target.closest?.('button'); const dlg = b?.closest('.ar-dlg'); if (!b || !dlg?._C || b.closest('.pk, .mpk')) return;
        const C = dlg._C, d = b.dataset, it = C.current?.();
        if (busy.has(b)) return;
        const run = async fn => { busy.add(b); b.disabled = true; try { await fn(); } catch (er) { if (er?.message) A().toast(er.message, 'error'); } finally { busy.delete(b); if (b.isConnected) b.disabled = false; } };
        // — dans le formulaire —
        const fld = b.closest('[data-fk="setlist"]');
        if (fld && d.slAdd !== undefined) { addRows(fld, [{t: d.slAdd || 'item'}]); return; }
        if (fld && d.slPaste !== undefined) {
            ext().openDialog?.({eyebrow: 'SETLIST', title: '📋 Coller une liste de titres', submitLabel: 'Ajouter ces titres',
                body: `<p class="muted">Un titre par ligne (les numéros sont enlevés). Une ligne « Rappel : » range la suite en rappels ; « (note) » à la fin d’un titre devient sa note. Les titres déjà dans tes fiches y sont reliés.</p><textarea class="ar-in" data-sl-text rows="12" style="width:100%" placeholder="1. Paris canaille\n2. La complainte du marin (1re fois)\nRappel :\nLes cerisiers"></textarea>`,
                onOpen: dg => setTimeout(() => dg.querySelector('[data-sl-text]')?.focus(), 30),
                onSubmit: form => { const rows = SC.parseList(form.querySelector('[data-sl-text]').value, C.store); if (!rows.length) { A().toast('Rien à ajouter : écris un titre par ligne.', 'error'); return false; } addRows(fld, rows, false); A().toast(`${plural(rows.length, 'ligne ajoutée', 'lignes ajoutées')} à la setlist.`); setTimeout(() => b.isConnected && b.focus(), 60); return true; }});
            return; }
        if (fld && d.slCopy !== undefined) { await run(async () => { const r = await pickSetlist(C, it?.id); if (!r) return; if (!r.rows.length) { A().toast('Ce soir-là n’a pas de setlist.'); return; } addRows(fld, r.rows, false); A().toast(`${plural(r.rows.length, 'ligne copiée', 'lignes copiées')} depuis « ${r.from.title} ».`); }); setTimeout(() => b.isConnected && b.focus(), 60); return; }
        // — en lecture —
        if (C.S.edit || !it?.id) return;
        if (d.slExpand !== undefined) { b.closest('.sc-setlist')?.classList.add('is-open'); return; }
        if (d.slAddread !== undefined) { C.startEdit(); setTimeout(() => { const f2 = C.body.querySelector('[data-fk="setlist"]'); if (f2) { f2.scrollIntoView?.({block: 'center'}); addRows(f2, [{t: 'item'}]); } }, 40); return; }
        if (d.slCopy !== undefined) { await run(async () => { const r = await pickSetlist(C, it.id); if (!r) return; if (!r.rows.length) { A().toast('Ce soir-là n’a pas de setlist.'); return; }
            const data = {...U.clone(it.data), setlist: [...SC.rowsOf(it), ...r.rows]}; await SC.saveWithUndo(C, it, data, `Setlist de « ${r.from.title} » copiée (${plural(r.rows.length, 'ligne')})`); }); return; }
        if (d.slMk !== undefined) { await run(async () => { const rows = U.clone(SC.rowsOf(it)), r = rows[Number(d.slMk)], ref = U.ref(r?.work); if (!ref?.txt) return;
            const g = SC.genreOf(it), kind = SC.kindsFor(g.key).find(k => ART.defs[k]) || 'track_work', def = ART.defs[kind];
            const id = await ART.saveItem(C.store, kind, 0, {title: ref.txt, ...(def.newData ? def.newData(C.store) : {}), ...(kind === 'stage_piece' && g.piece ? {pkind: g.piece} : {})});
            r.work = {iid: id, title: ref.txt, kind}; await SC.saveWithUndo(C, it, {...U.clone(it.data), setlist: rows}, `Fiche « ${ref.txt} » créée et reliée`); }); return; }
        if (d.scGenre) { if (d.scGenre === (it.data?.skind || 'concert')) return; await run(() => SC.saveWithUndo(C, it, {...U.clone(it.data), skind: d.scGenre}, `Ce soir devient : ${SC.genre(d.scGenre).label}`)); return; }
        if (d.scNewdate) { const t = C.store.get(Number(d.scNewdate)); if (t) C.newItem('concert', {tour: {iid: t.id, title: t.title, kind: 'tour'}, skind: t.data?.skind || 'concert', show: t.data?.show || '', ...(U.ref(t.data?.staging) ? {staging: t.data.staging} : {})}); return; }
        if (d.scNewperf) { const s = C.store.get(Number(d.scNewperf)); if (s) C.newItem('concert', {skind: 'theatre', staging: {iid: s.id, title: s.title, kind: s.kind}}); return; }
        if (d.scTorec !== undefined) { await run(async () => {
            const done = new Set(SC.recsOf(C.store, it.id).map(r => U.ref(r.data.work)?.iid)), m = ART.mediaOf(it.data?.sound);
            const todo = SC.rowsOf(it).filter(r => SC.isSong(r) && U.ref(r.work)?.iid && !done.has(U.ref(r.work).iid) && (C.store.get(U.ref(r.work).iid)?.kind || 'track_work') === 'track_work');
            const seen = new Set(), items = todo.filter(r => !seen.has(U.ref(r.work).iid) && seen.add(U.ref(r.work).iid)).map(r => ({kind: 'recording', parent_id: U.ref(r.work).iid,
                data: {rkind: 'public', title: `En public, ${[SC.cityOf(it), SC.dayLabel(SC.dayOf(it.data.date), 'short')].filter(Boolean).join(', ') || it.title}`, work: {iid: U.ref(r.work).iid, title: U.refTitle(r.work), kind: 'track_work'}, date: it.data.date || '', studio: it.data.place || '', concert: {iid: it.id, title: it.title, kind: 'concert'}, ...(m ? {sound: it.data.sound} : {}), dur: r.dur || '', note: [it.data.capt_note, r.at && `à ${r.at} de la captation`].filter(Boolean).join(' · ')}}));
            if (!items.length) { A().toast('Tous les morceaux de ce soir ont déjà leur enregistrement « en public ».'); return; }
            const extra = await ART.needArtist(C.store); const res = await ART.write('save_items', {person_id: C.pid, items, ...extra}); await C.reload(); C.paint(true);
            const ids = res?.ids || [];
            A().undoToast(`${plural(ids.length, 'enregistrement')} « en public » ${ids.length > 1 ? 'ajoutés' : 'ajouté'} aux morceaux`, {undo: async () => { for (const id of ids) await ART.write('delete_item', {person_id: C.pid, id}); await C.reload(); C.paint(true); }}); }); return; }
    });
    /* « ＋ Créer la fiche « … » » sur une ligne de setlist : la bonne sorte (sketch, numéro…) selon la soirée */
    if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('picker-create', async e => {
        const host = e.target.closest?.('[data-fk="setlist"] [data-art-create]'), dlg = e.target.closest?.('.ar-dlg'); if (!host || !dlg?._C || e.detail?.kind !== 'artwork') return;
        const gk = genreInForm(host), g = SC.genre(gk), kind = SC.kindsFor(gk).find(k => ART.defs[k]); if (!kind) return;
        e.preventDefault(); e.stopPropagation();
        const C = dlg._C, def = ART.defs[kind];
        try { const data = {title: e.detail.text, ...(def.newData ? def.newData(C.store) : {}), ...(kind === 'stage_piece' && g.piece ? {pkind: g.piece} : {})}; const id = await ART.saveItem(C.store, kind, 0, data); await C.store.load(); e.detail.pick({id, title: e.detail.text, kind: 'artwork', art_kind: kind}); A().toast(`« ${e.detail.text} » ajouté au catalogue (${def.label.toLowerCase()}).`); }
        catch (er) { if (er.message) A().toast(er.message, 'error'); }
    }, true);

    /* ═════════ Après l'affichage d'une fiche : bons titres de section, cartes ═════════ */
    ART.after.push((C, body, it) => {
        if (it.kind === 'concert') { const b = body.querySelector('[data-ar-sec="setlist"] .ar-sh b'); if (b) b.textContent = `📋 ${SC.genreOf(it).list}`; }
        body.querySelectorAll('[data-sc-map]').forEach(el => SC.fillMap?.(C, el));
    });
})();
