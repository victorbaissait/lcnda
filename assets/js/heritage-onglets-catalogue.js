/* LCNDA — 🎨 L'onglet « Catalogue raisonné » (maquette docs/design/onglets-documents-catalogue.html, C1 à C5).
 * Caché au départ (Réglages → Apparence → onglets du menu). Fait comme l'onglet Personnes : la liste dans la colonne de
 * gauche, la fiche à droite. Les fiches sont celles du MOTEUR DES ARTISTES (heritage-artist*.js, lib/art_engine.php) :
 * ART.Store charge le catalogue d'un artiste, ART.readHtml dessine une fiche, « ✎ Modifier » ouvre le catalogue complet.
 *  - en haut de la colonne : l'artiste (menu de choix des personnes) ; la liste des artistes vient de
 *    api.php?action=onglets&op=artists (lib/onglets.php ; en mode consultation, ni vivants ni fiches confidentielles) ;
 *  - « Classer : » selon la sorte d'œuvre : 💽 par albums (pistes dans l'ordre, faces), 🎵 par chansons (« sur N albums »
 *    se déplie), 🏷 label, 🎼 genre ; 🕰 par période (périodes de l'artiste, sinon par décennie), 🖌 technique,
 *    🏛 lieu de conservation, 🔢 n° de catalogue ; partout 📅 année, 🔤 A → Z, ✦ sorte de fiche ;
 *  - retenus par artiste : le classement, les groupes ouverts, les périodes (clé genealogie-catalogue-tab) ;
 *  - lecture seule en mode consultation 🔒 et pour une fiche verrouillée (store.readonly, comme le catalogue).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI || {}, P = () => window.LCNDA_PICKER || window.LCNDA_APP, ART = () => window.LCNDA_ART;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const plural = (n, w, pl) => A()?.plural ? A().plural(n, w, pl) : `${n} ${n > 1 ? (pl || w + 's') : w}`;
    const kiosk = () => document.body.classList.contains('is-kiosk');
    const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").toLowerCase().trim();
    const PREF = 'genealogie-catalogue-tab', BAR_KEY = 'onglets:catalogue';
    const readPref = () => { try { const v = JSON.parse(localStorage.getItem(PREF) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (_) { return {}; } };
    const writePref = fn => { const p = readPref(); fn(p); try { localStorage.setItem(PREF, JSON.stringify(p)); } catch (_) {} };
    const perArtist = (k, pid, dflt) => { const v = readPref()[k]; return v && typeof v === 'object' && Object.prototype.hasOwnProperty.call(v, String(pid)) ? v[String(pid)] : dflt; };
    const setPerArtist = (k, pid, val) => writePref(p => { const o = p[k] && typeof p[k] === 'object' && !Array.isArray(p[k]) ? p[k] : {}; o[String(pid)] = val; p[k] = o; });
    const QUIET = new Set(['recording', 'org', 'copy', 'profile', 'master', 'concert', 'text']);
    const letterOf = t => { const c = fold(String(t || '').replace(/^[^A-Za-zÀ-ÿ0-9]+/, '').replace(/^(l'|le |la |les )/i, '')).charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; };

    /* ─── l'état ─── */
    let artists = null, store = null, storePid = 0, loadingStore = null, failed = '', bar = null;
    let cur = {id: 0, song: ''};
    {   // « #catalogue/45/301 » : l'artiste n° 45, sa fiche n° 301
        const m = location.hash.match(/^#catalogue\/(\d{1,12})(?:\/(\d{1,12}))?/);
        if (m) { writePref(p => { p.pid = Number(m[1]); }); cur = {id: Number(m[2] || 0), song: ''}; }
    }
    const pidNow = () => Number(readPref().pid) || 0;
    async function loadArtists(force = false) {
        if (artists && !force) return artists;
        try { artists = (await A().api('onglets', {op: 'artists'})).artists || []; failed = ''; } catch (e) { artists = []; failed = e.message || 'La liste des artistes n’a pas pu se charger.'; }
        return artists;
    }
    function choosePid() {
        const list = artists || [], want = pidNow();
        if (want && (list.some(a => a.id === want) || !kiosk())) return want;
        return list[0]?.id || 0;
    }
    async function loadStore(pid, force = false) {
        if (!ART()?.Store || !pid) { store = null; storePid = 0; return null; }
        if (store && storePid === pid && !force) return store;
        if (loadingStore && storePid === pid && !force) return loadingStore;
        storePid = pid;
        const st = new (ART().Store)(pid);
        loadingStore = st.load().then(() => { if (storePid === pid) store = st; return st; }).catch(e => { failed = e.message || 'Ce catalogue n’a pas pu se charger.'; store = null; return null; }).finally(() => { loadingStore = null; });
        return loadingStore;
    }
    const U = () => ART().util;
    const yearOf = it => Number(it?.year) || Number(U().yearOf(it?.data?.date || it?.data?.released || it?.data?.written || '')) || 0;

    /* ─── les chansons : les morceaux, et les pistes des disques qui s'y rattachent (enregistrement → morceau, ou même titre) ─── */
    function songsOf(st) {
        const songs = new Map(), byTitle = new Map();
        st.of('track_work').forEach(w => { const s = {key: `w${w.id}`, title: w.title, work: w, year: yearOf(w), apps: []}; songs.set(s.key, s); byTitle.set(fold(w.title), s.key); });
        st.of('release').forEach(rel => {
            let side = '';
            ART().arr(rel.data?.tracks).forEach(t => {
                if (t.heading) { side = String(t.title || ''); return; }
                if (!String(t.title || '').trim()) return;
                const rec = U().ref(t.rec)?.iid ? st.get(U().ref(t.rec).iid) : null, wid = U().ref(rec?.data?.work)?.iid;
                let key = wid && songs.has(`w${wid}`) ? `w${wid}` : byTitle.get(fold(t.title));
                if (!key) { key = `t${fold(t.title).replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`; songs.set(key, {key, title: t.title, work: null, year: 0, apps: []}); byTitle.set(fold(t.title), key); }
                songs.get(key).apps.push({rel, pos: t.pos || '', dur: t.dur || rec?.data?.dur || '', side});
            });
        });
        songs.forEach(s => { if (!s.year) s.year = Math.min(...s.apps.map(a => yearOf(a.rel)).filter(Boolean), 9999) % 9999 || 0; });
        return songs;
    }

    /* ─── les façons de classer, selon les sortes présentes ─── */
    const CLASSES = {
        albums: ['💽', 'Par albums'], songs: ['🎵', 'Par chansons'], label: ['🏷', 'Par label'], genre: ['🎼', 'Par genre'],
        period: ['🕰', 'Par période'], technique: ['🖌', 'Par technique'], holder: ['🏛', 'Par lieu de conservation'], catref: ['🔢', 'Par n° de catalogue'],
        year: ['📅', 'Par année'], az: ['🔤', 'A → Z'], kind: ['✦', 'Par sorte de fiche']};
    function classesFor(st) {
        const out = [], music = st.of('release').length || st.of('track_work').length, art = st.of('work').length;
        if (music) out.push('albums', 'songs', 'label', 'genre');
        if (art) out.push('period', 'technique', 'holder', 'catref');
        out.push('year', 'az', 'kind');
        return out;
    }
    const mainItems = st => st.items.filter(i => !QUIET.has(i.kind) && !String(i.kind).startsWith('profile') && ART().defs[i.kind] && !ART().defs[i.kind].hidden);
    function periodsOf(pid) { const l = perArtist('periods', pid, []); return Array.isArray(l) ? l.filter(p => p && typeof p.name === 'string').slice(0, 40).map(p => ({name: p.name.slice(0, 60), from: Number(p.from) || 0, to: Number(p.to) || 0})) : []; }

    /** les groupes à montrer : [{key, label, sub, count, open, head (id d'une fiche), rows:[{html}], flat}] */
    function groups(st, by, q, sort) {
        const t = s => fold(s), match = s => !q || t(s).includes(q);
        const num = s => Number(String(s || '').match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(',', '.')) || 1e9;
        const sorter = (a, b) => sort === 'az' ? t(a.title).localeCompare(t(b.title), 'fr') : sort === 'num' ? num(a.data?.catref || a.data?.catno) - num(b.data?.catref || b.data?.catno) || t(a.title).localeCompare(t(b.title), 'fr') : (yearOf(a) || 9999) - (yearOf(b) || 9999) || (a.sort - b.sort) || t(a.title).localeCompare(t(b.title), 'fr');
        const by1 = (list, keyOf, labelOf = k => k, emptyLabel = 'Sans valeur', order = null) => {
            const m = new Map();
            list.forEach(it => { const k = keyOf(it) || ''; if (!m.has(k)) m.set(k, []); m.get(k).push(it); });
            let keys = [...m.keys()];
            keys.sort(order || ((a, b) => (a === '') - (b === '') || String(a).localeCompare(String(b), 'fr', {numeric: true})));
            return keys.map(k => ({key: `${by}:${k}`, label: k === '' ? emptyLabel : labelOf(k), items: m.get(k).sort(sorter)}));
        };
        const items = kinds => mainItems(st).filter(i => !kinds || kinds.includes(i.kind)).filter(i => match(`${i.title} ${i.year || ''} ${i.data?.catref || ''} ${i.data?.catno || ''} ${i.data?.technique || ''}`));
        if (by === 'albums') {
            return st.of('release').sort(sorter).map(rel => {
                const tracks = ART().arr(rel.data?.tracks), hit = match(`${rel.title} ${rel.year || ''}`) || tracks.some(x => !x.heading && match(x.title));
                return hit ? {key: `albums:${rel.id}`, label: rel.title, head: rel.id, sub: [yearOf(rel) || '', U().refTitle(rel.data?.label), rel.data?.format, plural(tracks.filter(x => !x.heading).length, 'titre')].filter(Boolean).join(' · '), badge: badgeOf(rel), thumb: U().cover(rel, 'ong-cov'), tracks: tracks.map(x => ({...x, rid: rel.id}))} : null;
            }).filter(Boolean);
        }
        if (by === 'songs') {
            const all = [...songsOf(st).values()].filter(s => match(s.title)).sort((a, b) => sort === 'date' ? (a.year || 9999) - (b.year || 9999) || t(a.title).localeCompare(t(b.title), 'fr') : t(a.title).localeCompare(t(b.title), 'fr'));
            return [{key: 'songs', flat: true, letters: sort !== 'date', songs: all}];
        }
        if (by === 'label' || by === 'genre') return by1(st.of('release').filter(r => match(`${r.title} ${r.year || ''}`)), r => by === 'label' ? U().refTitle(r.data?.label) : String(r.data?.genre || '').trim(), k => k, by === 'label' ? 'Sans label' : 'Sans genre');
        if (by === 'period') {
            const per = periodsOf(st.pid);
            if (per.length) {
                const ord = per.map(p => p.name);
                return by1(items(['work']), it => { const y = yearOf(it); const p = per.find(x => y && (!x.from || y >= x.from) && (!x.to || y <= x.to)); return p ? p.name : ''; },
                    k => { const p = per.find(x => x.name === k); return `${k}${p && (p.from || p.to) ? ` · ${p.from || '…'}–${p.to || '…'}` : ''}`; }, 'Sans période', (a, b) => (a === '') - (b === '') || ord.indexOf(a) - ord.indexOf(b));
            }
            return by1(items(['work']), it => yearOf(it) ? String(Math.floor(yearOf(it) / 10) * 10) : '', k => `Années ${k}`, 'Sans date');
        }
        if (by === 'technique') return by1(items(['work']), it => String(it.data?.technique || '').trim(), k => k, 'Sans technique');
        if (by === 'holder') return by1(items(['work']), it => U().refTitle(it.data?.holder) || U().placeTitle(it.data?.location) || '', k => k, 'Lieu inconnu');
        if (by === 'catref') return [{key: 'catref', flat: true, items: items(['work']).sort((a, b) => num(a.data?.catref) - num(b.data?.catref) || t(a.title).localeCompare(t(b.title), 'fr'))}];
        if (by === 'year') return by1(items(), it => yearOf(it) ? String(yearOf(it)) : '', k => k, 'Sans date');
        if (by === 'kind') return by1(items(), it => it.kind, k => `${ART().defs[k]?.icon || '✦'} ${ART().defs[k]?.many || k}`, 'Autres');
        return [{key: 'az', flat: true, letters: true, items: items().sort((a, b) => t(a.title).localeCompare(t(b.title), 'fr'))}];
    }
    const badgeOf = it => { const d = it.data || {}; if (it.kind === 'work' && d.catref) return d.catref; if (it.kind === 'release') { const f = String(d.format || ''); return /\bCD\b/i.test(f) ? 'CD' : /LP|33/i.test(f) ? 'LP' : /45|single|EP/i.test(f) ? '45 t' : ''; } return ''; };
    const lineOf = it => { const d = ART().defs[it.kind]; if (it.kind === 'work') return [yearOf(it) || '', it.data?.technique].filter(Boolean).join(' · '); return d?.cardLine ? d.cardLine(it) : [yearOf(it) || '', d?.label].filter(Boolean).join(' · '); };
    const badge = (t, k = 'grey') => t ? (UI().badge ? UI().badge(t, k, {cls: 'ong-kind'}) : `<span class="ong-kind">${esc(t)}</span>`) : '';
    const itemRow = it => `<button type="button" class="side-menu-item ong-row${cur.id === it.id ? ' is-active' : ''}" data-ong-item="${it.id}" data-letter="${esc(letterOf(it.title))}"><span class="ong-thumb">${U().cover(it, 'ong-cov')}</span><span class="ong-txt"><strong>${esc(it.title)}</strong><small>${esc(lineOf(it))}</small></span>${badge(badgeOf(it))}</button>`;
    const clock = d => esc(d || '');

    /* ─── la colonne de gauche ─── */
    function sidebar(content, footer) {
        const signal = A().sidebarSignal?.();
        content.innerHTML = `<div class="ong-side" data-ong-side="catalogue" data-no-reorder><div class="ong-artist" data-ong-artist>${UI().skeleton ? UI().skeleton(1) : ''}</div><div class="ong-bar" data-ong-bar></div>
            <div class="ong-classer" data-ong-classer></div><div class="ong-letters" data-ong-letters hidden></div><div class="ong-list" data-ong-list>${UI().skeleton ? UI().skeleton(6) : '<div class="loading-block">Chargement…</div>'}</div></div>`;
        footer.innerHTML = '<span data-ong-count></span>';
        bar = UI().listBar ? UI().listBar({key: BAR_KEY, search: {placeholder: 'Chercher… (titre, année, n°)'}, filters: [], sort: {options: [['date', 'Par date'], ['az', 'A → Z'], ['num', 'Par n° de catalogue']], value: 'date'},
            onChange: () => paintList()}) : null;
        if (bar) content.querySelector('[data-ong-bar]').appendChild(bar);
        content.addEventListener('picker-change', async e => {
            if (!e.target.closest('[data-ong-artist]')) return;
            const it = e.detail.item; if (!it?.id) return;
            writePref(p => { p.pid = Number(it.id); }); cur = {id: 0, song: ''};
            history.pushState(null, '', hashFor());
            await loadStore(Number(it.id)); paintList(); render();
        }, {signal});
        content.addEventListener('change', e => { const s = e.target.closest('[data-ong-by]'); if (s && store) { setPerArtist('by', store.pid, s.value); paintList(); } }, {signal});
        content.addEventListener('click', e => {
            const pe = e.target.closest('[data-ong-periods]'); if (pe) { editPeriods(); return; }
            const g = e.target.closest('[data-ong-g]'); if (g) { toggleGroup(g.dataset.ongG); return; }
            const l = e.target.closest('[data-ong-letter]'); if (l && !l.disabled) { const el = content.querySelector(`[data-ong-lh="${CSS.escape(l.dataset.ongLetter)}"]`); el?.scrollIntoView({block: 'start'}); return; }
            const ap = e.target.closest('[data-ong-apps]'); if (ap) { toggleGroup(`apps:${ap.dataset.ongApps}`); return; }
            const r = e.target.closest('[data-ong-item],[data-ong-song]'); if (r) { select(r.dataset.ongItem ? {id: Number(r.dataset.ongItem)} : {song: r.dataset.ongSong}); }
        }, {signal});
        content.addEventListener('keydown', e => {
            const r = e.target.closest?.('[data-ong-item],[data-ong-song]'); if (!r || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
            const all = [...content.querySelectorAll('[data-ong-item],[data-ong-song]')].filter(x => x.offsetParent), nx = all[all.indexOf(r) + (e.key === 'ArrowDown' ? 1 : -1)];
            if (nx) { e.preventDefault(); nx.focus(); nx.click(); nx.focus(); }
        }, {signal});
        const mod = A().state?.module;
        (async () => { await loadArtists(); const pid = choosePid(); if (pid !== pidNow()) writePref(p => { p.pid = pid; }); await loadStore(pid); if (A().state?.module === mod) paintList(); })();
    }
    function openGroups(pid) { const v = perArtist('open', pid, null); return Array.isArray(v) ? v : null; }
    function toggleGroup(key) {
        if (!store) return;
        const list = openGroups(store.pid) || [...document.querySelectorAll('#sidebar-content [data-ong-g][aria-expanded="true"]')].map(b => b.dataset.ongG);
        setPerArtist('open', store.pid, (list.includes(key) ? list.filter(k => k !== key) : [...list, key]).slice(-200));
        paintList();
    }
    function paintList() {
        const side = document.querySelector('#sidebar-content [data-ong-side="catalogue"]'); if (!side) return;
        const box = side.querySelector('[data-ong-list]'), head = side.querySelector('[data-ong-artist]'), cl = side.querySelector('[data-ong-classer]'), letters = side.querySelector('[data-ong-letters]');
        const count = document.querySelector('#sidebar-footer [data-ong-count]');
        const pid = store?.pid || choosePid(), a = (artists || []).find(x => x.id === pid);
        const title = store ? store.name : a?.name || '';
        head.innerHTML = `<span class="pk-lab">Artiste</span>${P().pickerField ? P().pickerField({name: '', hiddenName: false, kind: 'person', allowCreate: false, animals: false, value: pid ? {id: pid, title} : null}) : esc(title)}`;
        if (!pid || !store) {
            cl.innerHTML = ''; letters.hidden = true;
            box.innerHTML = A().empty ? A().empty(/introuvable/i.test(failed) ? 'Artiste introuvable : choisis-en un autre ci-dessus.' : failed || (artists && !artists.length ? 'Personne n’a encore de catalogue : coche « Artiste » sur une fiche, puis ajoute ses œuvres.' : 'Choisis un artiste.'), {icon: failed ? '⛔' : '🎨'}) : '';
            if (count) count.textContent = artists ? plural(artists.length, 'artiste') : '';
            return;
        }
        const opts = classesFor(store); let by = perArtist('by', store.pid, opts[0]); if (!opts.includes(by)) by = opts[0];
        cl.innerHTML = `<label class="ong-by"><span>Classer :</span><select data-ong-by aria-label="Classer">${opts.map(k => `<option value="${k}" ${k === by ? 'selected' : ''}>${CLASSES[k][0]} ${esc(CLASSES[k][1])}</option>`).join('')}</select></label>${by === 'period' && !store.readonly ? '<button type="button" class="button small secondary" data-ong-periods title="Les périodes de l’artiste (nom et années)">⚙️ Périodes…</button>' : ''}`;
        const st = bar?.state || {q: '', sort: 'date'}, q = fold(st.q);
        const gs = groups(store, by, q, st.sort || 'date'), open = openGroups(store.pid);
        const isOpen = (k, i) => open ? open.includes(k) : i === 0;
        const total = mainItems(store).length;
        bar?.setCount?.(plural(by === 'songs' ? (gs[0]?.songs || []).length : by === 'albums' ? gs.length : gs.reduce((n, g) => n + (g.items?.length || 0), 0), by === 'songs' ? 'chanson' : by === 'albums' ? 'album' : 'fiche'));
        if (count) count.textContent = by === 'albums' || by === 'songs' ? `${plural(store.of('release').length, 'album')} · ${plural(songsOf(store).size, 'chanson')}` : plural(total, 'fiche');
        letters.hidden = true;
        if (!total && !store.of('track_work').length) {
            box.innerHTML = A().empty ? A().empty(`Le catalogue de ${title} est vide pour l’instant.`, {icon: '🎨', action: store.readonly ? null : {label: '＋ Ajouter une œuvre', attrs: 'data-empty-click="[data-ong-open-cat]"'}}) : '';
            return;
        }
        const html = gs.map((g, i) => {
            if (g.flat && g.songs) return songsHtml(g, letters);
            if (g.flat) return flatHtml(g, letters);
            const o = isOpen(g.key, i) || (q && true);
            const body = g.tracks ? tracksHtml(g.tracks) : g.items.map(itemRow).join('');
            return `<div class="ong-grp${o ? ' is-open' : ''}"><div class="ong-gh"><button type="button" class="ong-car" data-ong-g="${esc(g.key)}" aria-expanded="${o}" title="${o ? 'Replier' : 'Déplier'}">${o ? '▾' : '▸'}</button>
                ${g.head ? `<button type="button" class="ong-gtitle${cur.id === g.head ? ' is-active' : ''}" data-ong-item="${g.head}">${g.thumb || ''}<span class="ong-txt"><strong>${esc(g.label)}</strong>${g.sub ? `<small>${esc(g.sub)}</small>` : ''}</span>${badge(g.badge)}</button>`
                : `<button type="button" class="ong-gtitle" data-ong-g="${esc(g.key)}"><span class="ong-txt"><strong>${esc(g.label)}</strong></span><small class="sf-count">${g.items.length}</small></button>`}</div>
                <div class="ong-gbody side-menu"${o ? '' : ' hidden'}>${body || '<p class="sf-empty">Rien ici.</p>'}</div></div>`;
        }).join('');
        box.innerHTML = html || (A().empty ? A().empty('Rien ne correspond : change les mots cherchés.', {icon: '🔎'}) : '');
    }
    function tracksHtml(tracks) {
        return tracks.map(t => t.heading ? `<div class="section-label ong-side-h">${esc(t.title)}</div>` : !String(t.title || '').trim() ? '' : (() => {
            const key = songKeyFor(t); return `<button type="button" class="side-menu-item ong-track${cur.song === key ? ' is-active' : ''}" data-ong-song="${esc(key)}"><span class="ong-pos">${esc(t.pos || '')}</span><span class="ong-ttl">${esc(t.title)}</span><span class="ong-dur">${clock(t.dur)}</span></button>`; })()).join('');
    }
    let songCache = {st: null, map: null};
    const songMap = () => { if (songCache.st !== store) songCache = {st: store, map: songsOf(store)}; return songCache.map; };
    function songKeyFor(t) { for (const s of songMap().values()) if (s.apps.some(a => a.rel.id === t.rid && a.pos === (t.pos || '') && fold(s.title) === fold(t.title)) || (s.apps.some(a => a.rel.id === t.rid) && fold(s.title) === fold(t.title))) return s.key; return ''; }
    function letterBar(letters, have) { letters.hidden = false; letters.innerHTML = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(L => `<button type="button" data-ong-letter="${L}" ${have.has(L) ? '' : 'disabled'} aria-label="Aller à la lettre ${L}">${L}</button>`).join(''); }
    function songsHtml(g, letters) {
        const open = openGroups(store.pid) || [];
        if (g.letters) letterBar(letters, new Set(g.songs.map(s => letterOf(s.title))));
        let last = '';
        const rows = g.songs.map(s => {
            const L = letterOf(s.title), lh = g.letters && L !== last ? `<div class="section-label ong-lh" data-ong-lh="${L}">${L}</div>` : ''; last = L;
            const o = open.includes(`apps:${s.key}`), first = s.apps[0];
            return `${lh}<div class="ong-song"><button type="button" class="side-menu-item ong-row${cur.song === s.key ? ' is-active' : ''}" data-ong-song="${esc(s.key)}"><span class="ong-ico" aria-hidden="true">🎵</span><span class="ong-txt"><strong>${esc(s.title)}</strong><small>${esc([s.year || '', first?.dur].filter(Boolean).join(' · '))}</small></span></button>
                ${s.apps.length ? `<button type="button" class="ong-apps" data-ong-apps="${esc(s.key)}" aria-expanded="${o}">${o ? '▾' : '▸'} sur ${s.apps.length}</button>` : ''}
                ${o ? `<div class="ong-applist">${s.apps.map(a => `<button type="button" class="ong-app" data-ong-item="${a.rel.id}"><span class="ong-pos">${esc(a.pos)}</span><span class="ong-ttl">${esc(a.rel.title)}${yearOf(a.rel) ? ` · ${yearOf(a.rel)}` : ''}</span><span class="ong-dur">${clock(a.dur)}</span></button>`).join('')}</div>` : ''}</div>`;
        }).join('');
        return rows ? `<div class="side-menu ong-menu">${rows}</div>` : '';
    }
    function flatHtml(g, letters) {
        if (g.letters) letterBar(letters, new Set(g.items.map(i => letterOf(i.title))));
        let last = '';
        return `<div class="side-menu ong-menu">${g.items.map(it => { const L = letterOf(it.title), lh = g.letters && L !== last ? `<div class="section-label ong-lh" data-ong-lh="${L}">${L}</div>` : ''; last = L; return lh + itemRow(it); }).join('')}</div>`;
    }

    /* ─── les périodes de l'artiste (nom + années) ─── */
    async function editPeriods() {
        if (!store || store.readonly) return;
        const pid = store.pid, now = periodsOf(pid);
        const txt = await A().askText({title: '🕰 Les périodes de l’artiste', message: 'Une période par ligne : son nom, puis ses années. Ex. « Période bleue 1946-1952 ». Une œuvre sans période va dans « Sans période ».',
            value: now.map(p => `${p.name} ${p.from || ''}${p.to ? `-${p.to}` : ''}`.trim()).join('\n'), multiline: true, okLabel: 'Enregistrer'});
        if (txt == null) return;
        const list = String(txt).split(/\n+/).map(l => l.trim()).filter(Boolean).slice(0, 40).map(l => { const m = l.match(/^(.*?)[\s,:·–-]*(\d{3,4})?\s*[-–à]*\s*(\d{3,4})?\s*$/); return {name: (m?.[1] || l).trim().slice(0, 60) || l.slice(0, 60), from: Number(m?.[2]) || 0, to: Number(m?.[3]) || 0}; });
        const before = JSON.stringify(now);
        const apply = l => { setPerArtist('periods', pid, l); paintList(); };
        apply(list);
        A().undoToast ? A().undoToast(`${plural(list.length, 'période')} pour ${store.name}`, {undo: () => apply(JSON.parse(before)), redo: () => apply(list)}) : A().toast?.('✓ Enregistré');
    }

    /* ─── à droite : la fiche ─── */
    function hashFor() { const pid = pidNow(); return pid ? `#catalogue/${pid}${cur.id ? `/${cur.id}` : ''}` : '#catalogue'; }
    async function select(o) {
        cur = {id: Number(o.id) || 0, song: o.song || ''};
        if (store && cur.song) { const s = songMap().get(cur.song); if (s?.work) cur = {id: s.work.id, song: cur.song}; }
        document.querySelectorAll('#sidebar-content [data-ong-item],#sidebar-content [data-ong-song]').forEach(b => b.classList.toggle('is-active', !!((b.dataset.ongItem && Number(b.dataset.ongItem) === cur.id && !b.matches('.ong-app')) || (b.dataset.ongSong && b.dataset.ongSong === cur.song))));
        if (location.hash !== hashFor()) history.pushState(null, '', hashFor());
        await render();
        if (matchMedia('(max-width: 850px)').matches) document.getElementById('workspace')?.scrollIntoView({block: 'start'});
    }
    async function render(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        if (!ART()?.Store) { ws.innerHTML = `<section class="page">${A().emptyState({icon: '⚠️', text: 'Le moteur des artistes n’est pas chargé', hint: 'Recharge la page.'})}</section>`; return; }
        await loadArtists();
        const pid = choosePid();
        if (pid && pid !== pidNow()) writePref(p => { p.pid = pid; });
        await loadStore(pid);
        if ((token != null && token !== A().state?.workspaceToken) || A().state?.module !== 'catalogue') return;
        if (!store) {
            const lost = /introuvable/i.test(failed); // « #catalogue/99999 » : une fiche qui n'existe pas (ou plus) — K10, et la prochaine fois le premier artiste
            if (lost) writePref(p => { delete p.pid; });
            ws.innerHTML = `<section class="page ong-page" data-ong-page="catalogue">${UI().pageHeader({title: 'Catalogue raisonné', icon: '🎨', help: 'Les œuvres d’un artiste, classées à ta façon : par albums ou par chansons pour un musicien, par période ou par technique pour un peintre…'})}
                ${lost ? A().emptyState({icon: '🔍', text: 'Artiste introuvable', hint: `Cette fiche n’existe pas, ou plus (supprimée ?).${(artists || []).length ? ' Choisis un artiste dans la colonne de gauche.' : ''}`}) : A().emptyState({icon: failed ? '⛔' : '🎨', text: failed || 'Aucun catalogue pour l’instant', hint: failed ? '' : 'Coche « Artiste » sur la fiche d’une personne (✎ Modifier la fiche), puis ajoute ses œuvres, ses disques, ses livres : ils arrivent ici.'})}</section>`;
            return;
        }
        const it = cur.id ? (store.get(cur.id) || await store.ensure(cur.id).catch(() => null)) : null;
        const song = cur.song ? songMap().get(cur.song) : null;
        if (it) return paintItem(ws, it, song);
        if (song) return paintSong(ws, song);
        cur = {id: 0, song: ''};
        paintHome(ws);
    }
    const ro = () => !!store?.readonly || kiosk();
    const crumb = (...parts) => ['Catalogue raisonné', store.name, ...parts].filter(Boolean).join(' › ');
    function appsHtml(song) {
        if (!song?.apps.length) return '';
        return `<section class="card ong-sec"><h3>💿 Sur ${plural(song.apps.length, 'album')}</h3><div class="ong-apps-list">${song.apps.map(a => `<button type="button" class="ong-app2" data-ong-item="${a.rel.id}">${U().cover(a.rel, 'ong-cov')}<span><b>${esc(a.rel.title)}</b><small>${esc([yearOf(a.rel) || '', a.side, a.pos && `piste ${a.pos}`, a.dur].filter(Boolean).join(' · '))}</small></span><span class="ong-go" aria-hidden="true">↗</span></button>`).join('')}</div></section>`;
    }
    function paintItem(ws, it, song) {
        const def = ART().defs[it.kind] || {}, group = song ? 'Chansons' : def.many || '';
        const s2 = song || (it.kind === 'track_work' ? songMap().get(`w${it.id}`) : null);
        const help = [def.label, yearOf(it) || '', s2?.apps.length ? `sur ${plural(s2.apps.length, 'album')}` : '', it.kind === 'release' ? plural(ART().arr(it.data?.tracks).filter(x => !x.heading).length, 'titre') : ''].filter(Boolean).join(' · ');
        ws.innerHTML = `<section class="page ong-page ong-catpage" data-ong-page="catalogue" data-ong-id="${it.id}">
            ${UI().pageHeader({where: crumb(group), icon: def.icon || '✦', title: it.title || 'Sans titre', help: esc(help), detail: true,
                primary: ro() ? '' : '<button type="button" class="button" data-ong-edit>✎ Modifier</button>',
                actions: ['<button type="button" class="button secondary" data-ong-open-cat>↗ Ouvrir dans le catalogue</button>'],
                more: ['<button type="button" data-ong-artist-page>🎨 Page de l’artiste</button>', '<button type="button" data-ong-export>⤓ Exporter la fiche</button>']})}
            <button type="button" class="button small secondary ong-back" data-ong-back>← Liste</button>
            ${ro() ? `<p class="ong-ro">${UI().badge ? UI().badge(kiosk() ? '🔒 Consultation' : '🔒 Fiche verrouillée', 'grey') : ''}</p>` : ''}
            <div class="ong-arhost ar-ro">${ART().readHtml(store, it)}</div>${it.kind === 'track_work' || song ? appsHtml(s2) : ''}</section>`;
    }
    function paintSong(ws, song) {
        ws.innerHTML = `<section class="page ong-page ong-catpage" data-ong-page="catalogue">
            ${UI().pageHeader({where: crumb('Chansons'), icon: '🎵', title: song.title, help: esc([song.year ? `Chanson de ${song.year}` : 'Chanson', `sur ${plural(song.apps.length, 'album')}`].join(', ') + '.'), detail: true,
                primary: ro() ? '' : '<button type="button" class="button" data-ong-new-song>＋ Créer la fiche du morceau</button>'})}
            <button type="button" class="button small secondary ong-back" data-ong-back>← Liste</button>
            ${A().empty ? A().empty('Ce titre n’a pas encore sa fiche de morceau (paroles, compositeur, enregistrements) : il vient des pistes des disques.', {icon: '🎵'}) : ''}
            ${appsHtml(song)}</section>`;
    }
    function paintHome(ws) {
        const music = store.of('release').length > 0, works = store.of('work'), main = music ? store.of('release') : works.length ? works : mainItems(store);
        const a = (artists || []).find(x => x.id === store.pid);
        ws.innerHTML = `<section class="page ong-page" data-ong-page="catalogue">
            ${UI().pageHeader({where: 'Catalogue raisonné', icon: '🎨', title: store.name, help: esc([a && (a.birth || a.death) ? `${a.birth || '?'}–${a.death || ''}` : '', plural(mainItems(store).length, 'fiche'), music ? plural(songsOf(store).size, 'chanson') : ''].filter(Boolean).join(' · ') + ' — la liste à gauche, la fiche à droite.'),
                primary: ro() ? '' : `<button type="button" class="button" data-ong-book>${music && !works.length ? '💿 Discographie' : '📖 Nouveau catalogue raisonné'}</button>`,
                actions: ['<button type="button" class="button secondary" data-ong-artist-page>🎨 Page de l’artiste</button>', ro() ? '' : '<button type="button" class="button secondary" data-ong-open-cat>＋ Ajouter une œuvre</button>'].filter(Boolean)})}
            <div class="ong-cards">${main.length ? UI().cardsHtml(main.map(it => ({thumb: U().cover(it), name: it.title, open: `data-ong-item="${it.id}"`, lines: [lineOf(it)].filter(Boolean), badges: badgeOf(it) ? [{text: badgeOf(it), kind: 'grey'}] : []}))) : A().emptyState({icon: '🎨', text: `Le catalogue de ${store.name} est vide pour l’instant`, hint: 'Ajoute ses œuvres, ses disques, ses livres dans son catalogue.', action: ro() ? null : {label: '＋ Ajouter une œuvre', attrs: 'data-empty-click="[data-ong-open-cat]"'}})}</div></section>`;
    }
    async function afterDialog(C) {
        if (!C?.dlg) return;
        await new Promise(res => { const obs = new MutationObserver(() => { if (!C.dlg.isConnected) { obs.disconnect(); res(); } }); obs.observe(document.body, {childList: true}); });
        if (A().state?.module !== 'catalogue') return;
        await loadStore(store?.pid || pidNow(), true); songCache = {st: null, map: null};
        if (cur.id && !store?.get(cur.id)) cur = {id: 0, song: ''};
        paintList(); render();
    }
    document.addEventListener('click', async e => {
        const page = e.target.closest?.('#workspace [data-ong-page="catalogue"]'); if (!page || A().state?.module !== 'catalogue' || !store) return;
        const b = e.target.closest('button, a'); if (!b) return;
        if (b.closest('.pk, .mpk')) return;
        const d = b.dataset;
        if (d.ongItem || d.arOpen) { e.preventDefault(); return select({id: Number(d.ongItem || d.arOpen)}); }
        if (d.arPerson) { e.preventDefault(); return A().openPersonById?.(Number(d.arPerson)); }
        if (b.matches('[data-ong-back]')) { cur = {id: 0, song: ''}; history.pushState(null, '', hashFor()); paintList(); render(); if (matchMedia('(max-width: 850px)').matches) document.getElementById('sidebar')?.scrollIntoView({block: 'start'}); return; }
        if (b.matches('[data-ong-artist-page]')) return afterDialog(await ART().open(store.pid, {kind: 'page'}));
        if (b.matches('[data-ong-open-cat]')) { const it = cur.id ? store.get(cur.id) : null; return afterDialog(await ART().open(store.pid, it ? {item: it.id} : {kind: store.of('work').length || !store.of('release').length ? 'work' : 'release'})); }
        if (b.matches('[data-ong-edit]')) { if (ro()) return; return afterDialog(await ART().open(store.pid, {item: cur.id, edit: true})); }
        if (b.matches('[data-ong-export]')) { const it = store.get(cur.id); const C = await ART().open(store.pid, {item: cur.id}); if (C && it) ART().exportItem?.(C, it); return afterDialog(C); }
        if (b.matches('[data-ong-book]')) { ext.artistCatalogue?.wizard?.({mode: store.of('release').length && !store.of('work').length ? 'discography' : 'catalogue', pid: store.pid, store}); return; }
        if (b.matches('[data-ong-new-song]')) { const s = songMap().get(cur.song); if (!s || ro()) return; const C = await ART().open(store.pid, {kind: 'track_work'}); C?.newItem?.('track_work', {title: s.title}); return afterDialog(C); }
    });

    ext.onglets = ext.onglets || {};
    ext.onglets.catalogue = {sidebar, render, hash: () => { const m = location.hash.match(/^#catalogue(?:\/(\d{1,12})(?:\/(\d{1,12}))?)?\/?$/); if (m && m[1]) { writePref(p => { p.pid = Number(m[1]); }); cur = {id: Number(m[2] || 0), song: m[2] ? '' : cur.song}; } return hashFor(); },
        songsOf, groups: (by, q = '', sort = 'date') => (store ? groups(store, by, fold(q), sort) : []), store: () => store, select};
    // l'app a pu ouvrir l'onglet avant que ce fichier soit chargé (adresse « #catalogue » au démarrage) : on dessine maintenant
    const late = () => { const st = A()?.state; if (st?.module !== 'catalogue') return; if (document.querySelector('#workspace .loading-screen')) render(); if (!document.querySelector('#sidebar-content [data-ong-side="catalogue"]')) A().renderSidebar?.(); };
    if (document.readyState === 'complete') setTimeout(late, 0); else addEventListener('load', () => setTimeout(late, 0), {once: true});
})();
