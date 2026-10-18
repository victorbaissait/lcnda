/* LCNDA — 🎨 Le catalogue d'un artiste (serveur : lib/artist_catalog.php).
 * Sur la fiche d'une personne cochée « Artiste » : 📚 bibliographie (ses livres, et ceux écrits sur lui), 🖼️ catalogue des
 * œuvres avec inventaire (n°, technique, dimensions, où est l'œuvre, à qui, état, valeur, expositions), 💿 discographie
 * album par album et morceau par morceau (paroles, notes, crédits, photos du disque, éditions et pressages comme Discogs)
 * et 🎬 filmographie (rôles, métiers, réalisateur, durée, affiche, identifiants IMDb).
 * Imports : Discogs, MusicBrainz, Apple Music (iTunes), Open Library, Wikidata (qui relie aux fiches IMDb) et TMDb.
 * Les clés personnelles (jeton Discogs, clé TMDb) restent dans ce navigateur (genealogie-artist-keys).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (...a) => A().toast(...a);
    const api = (...a) => A().api(...a);
    const post = async (action, body) => (await api(action, {}, {method: 'POST', body})).result;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const readJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch (_) { return d; } };
    const writeJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const KEYS = 'genealogie-artist-keys', PREFS = 'genealogie-artist-prefs';

    const KINDS = {book: ['📚', 'Bibliographie', 'livre'], work: ['🖼️', 'Œuvres et inventaire', 'œuvre'], release: ['💿', 'Discographie', 'disque'], film: ['🎬', 'Filmographie', 'film']};
    const MUSIC = ['musicien', 'chanteur', 'compositeur', 'chef', 'groupe'], SCREEN = ['cineaste', 'acteur', 'videaste'];
    const BOOK_ROLES = [['auteur', 'De lui / d’elle (auteur)'], ['sur', 'Sur lui / sur elle'], ['illustrateur', 'Illustrations'], ['traducteur', 'Traduction'], ['prefacier', 'Préface'], ['contribution', 'Contribution'], ['catalogue', 'Catalogue d’exposition']];
    const BOOK_KINDS = [['livre', 'Livre'], ['article', 'Article'], ['revue', 'Revue, numéro spécial'], ['these', 'Thèse, mémoire'], ['catalogue', 'Catalogue'], ['partition', 'Partition'], ['autre', 'Autre']];
    const WORK_STATUS = [['famille', 'Dans la famille'], ['musee', 'Musée, collection publique'], ['prive', 'Collection privée'], ['vendu', 'Vendu'], ['prete', 'Prêté'], ['depot', 'En dépôt'], ['perdu', 'Perdu, disparu'], ['detruit', 'Détruit'], ['inconnu', 'Où ? inconnu']];
    const CONDITION = [['', '—'], ['bon', 'Bon état'], ['moyen', 'État moyen'], ['restaurer', 'À restaurer'], ['restaure', 'Restauré'], ['fragile', 'Fragile']];
    const REL_TYPES = [['album', 'Album'], ['ep', 'EP, maxi'], ['single', 'Single, 45 tours'], ['compil', 'Compilation'], ['live', 'En public (live)'], ['bo', 'Bande originale'], ['coffret', 'Coffret'], ['participation', 'Participation'], ['autre', 'Autre']];
    const PHOTO_KINDS = [['recto', 'Recto (pochette)'], ['verso', 'Verso'], ['disque', 'Disque, rond central'], ['livret', 'Livret'], ['interieur', 'Intérieur'], ['autre', 'Autre']];
    const FILM_KINDS = [['long', 'Long métrage'], ['court', 'Court métrage'], ['serie', 'Série'], ['telefilm', 'Téléfilm'], ['docu', 'Documentaire'], ['clip', 'Clip'], ['pub', 'Publicité'], ['theatre', 'Théâtre filmé'], ['autre', 'Autre']];
    const label = (list, k) => (list.find(x => x[0] === k) || [, k || ''])[1];

    // les champs de chaque genre : [clé, libellé, type, options]
    const FIELDS = {
        book: [['role', 'Lien avec l’artiste', 'select', BOOK_ROLES], ['bkind', 'Genre', 'select', BOOK_KINDS], ['title', 'Titre', 'text'], ['subtitle', 'Sous-titre', 'text'], ['authors', 'Auteur(s)', 'text'], ['year', 'Année', 'text'],
            ['publisher', 'Éditeur', 'text'], ['place', 'Lieu d’édition', 'text'], ['collection', 'Collection', 'text'], ['edition', 'Édition (1re, 2e…)', 'text'], ['isbn', 'ISBN', 'text'], ['pages', 'Pages', 'text'], ['lang', 'Langue', 'text'],
            ['where', 'Où le trouver (bibliothèque, cote, chez nous…)', 'text'], ['link', 'Lien', 'text'], ['note', 'Note, résumé', 'area']],
        work: [['inv', 'N° d’inventaire', 'text'], ['catref', 'N° du catalogue raisonné', 'text'], ['title', 'Titre', 'text'], ['date', 'Date', 'text'], ['technique', 'Technique', 'text'], ['support', 'Support', 'text'],
            ['h', 'Hauteur (cm)', 'num'], ['w', 'Largeur (cm)', 'num'], ['d', 'Profondeur (cm)', 'num'], ['series', 'Série, ensemble', 'text'], ['signature', 'Signature, inscriptions', 'text'], ['status', 'Où est l’œuvre', 'select', WORK_STATUS],
            ['location', 'Lieu précis (musée, ville, pièce…)', 'text'], ['owner', 'Propriétaire', 'text'], ['condition', 'État', 'select', CONDITION], ['acquired', 'Entrée (date, comment)', 'text'], ['value', 'Valeur estimée (€)', 'num'], ['valueDate', 'Date de l’estimation', 'text'],
            ['provenance', 'Provenance, historique', 'area'], ['exhibitions', 'Expositions', 'area'], ['literature', 'Bibliographie de l’œuvre', 'area'], ['note', 'Note', 'area']],
        release: [['rtype', 'Genre', 'select', REL_TYPES], ['title', 'Titre', 'text'], ['artist', 'Artiste crédité', 'text'], ['year', 'Année', 'text'], ['released', 'Date de sortie', 'text'], ['label', 'Label', 'text'], ['catno', 'N° de catalogue', 'text'],
            ['format', 'Format (CD, vinyle 33 t, cassette, numérique…)', 'text'], ['country', 'Pays', 'text'], ['genre', 'Genre musical', 'text'], ['styles', 'Styles', 'text'], ['barcode', 'Code-barres', 'text'], ['producer', 'Production', 'text'], ['studio', 'Studio, lieu d’enregistrement', 'text'],
            ['link', 'Lien (Discogs, MusicBrainz…)', 'text'], ['notes', 'Notes', 'area']],
        film: [['title', 'Titre', 'text'], ['original', 'Titre original', 'text'], ['year', 'Année', 'text'], ['fkind', 'Genre', 'select', FILM_KINDS], ['jobs', 'Métier(s) (acteur, réalisation, scénario…)', 'text'], ['role', 'Rôle (personnage)', 'text'],
            ['director', 'Réalisation', 'text'], ['duration', 'Durée (min)', 'num'], ['country', 'Pays', 'text'], ['production', 'Production', 'text'], ['distribution', 'Distribution (sociétés)', 'text'], ['cast', 'Avec (acteurs)', 'area'],
            ['synopsis', 'Résumé', 'area'], ['awards', 'Prix, festivals', 'area'], ['imdb', 'IMDb (tt…)', 'text'], ['tmdb', 'TMDb', 'text'], ['wikidata', 'Wikidata (Q…)', 'text'], ['link', 'Lien', 'text'], ['note', 'Note', 'area']],
    };

    /* ── petits outils ── */
    const photoSrc = ph => ph?.f ? `media/${encodeURIComponent(ph.f)}` : (/^https:\/\//.test(ph?.u || '') ? ph.u : '');
    const cover = (it, cls = 'h-ar-cov') => { const src = photoSrc((it.data?.photos || [])[0]); return src ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy">` : `<span class="${cls} is-empty">${KINDS[it.kind][0]}</span>`; };
    const secs = d => { const m = String(d || '').trim().match(/^(?:(\d+):)?(\d{1,3}):(\d{2})$/); return m ? (Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3])) : 0; };
    const hms = s => !s ? '' : s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const msDur = ms => ms ? hms(Math.round(ms / 1000)) : '';
    const yearOf = v => (String(v || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/) || [])[1] || '';
    const dims = d => [d.h, d.w, d.d].filter(v => v !== '' && v != null).join(' × ') + ([d.h, d.w, d.d].some(v => v !== '' && v != null) ? ' cm' : '');
    const money = v => v === '' || v == null || !Number.isFinite(Number(v)) ? '' : Number(v).toLocaleString('fr-FR', {style: 'currency', currency: 'EUR', maximumFractionDigits: 0});
    const sameKey = it => `${it.kind}|${String(it.data?.title || it.title || '').toLowerCase().replace(/\W+/g, '')}|${yearOf(it.data?.year || it.data?.date || it.year)}`;
    const fileToData = file => new Promise((ok, ko) => { const img = new Image(), url = URL.createObjectURL(file); img.onload = () => { const k = Math.min(1, 2400 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', .9)); }; img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('Image illisible.')); }; img.src = url; });
    const keys = () => readJ(KEYS, {});

    function visibleKinds(person, items) {
        const disc = person.artist_discipline || '', has = k => items.some(i => i.kind === k);
        return Object.keys(KINDS).filter(k => k === 'book' || has(k) || (k === 'work' && !MUSIC.includes(disc) && !SCREEN.includes(disc)) || (k === 'release' && MUSIC.includes(disc)) || (k === 'film' && SCREEN.includes(disc)));
    }
    const sorted = (list, how) => { const l = [...list]; if (how === 'title') l.sort((a, b) => String(a.title).localeCompare(String(b.title), 'fr')); else if (how === 'perso') l.sort((a, b) => a.sort - b.sort); else l.sort((a, b) => (Number(a.year) || 9999) - (Number(b.year) || 9999) || a.sort - b.sort); if (how === 'recent') l.reverse(); return l; };

    /* ═════════ Les blocs de la fiche ═════════ */
    function blockBody(kind, person, items) {
        const list = sorted(items.filter(i => i.kind === kind), readJ(PREFS, {}).sort || 'year');
        if (!list.length) return `${A().emptyState({icon: KINDS[kind][0], text: `Aucun${kind === 'work' ? 'e' : ''} ${KINDS[kind][2]} pour l’instant`})}<div class="h-ar-row"><button type="button" class="button small secondary" data-ar-open="${kind}" data-ar-pid="${person.id}" data-ar-new>＋ Ajouter</button><button type="button" class="button small secondary" data-ar-open="${kind}" data-ar-pid="${person.id}" data-ar-import>📥 Importer</button></div>`;
        if (kind === 'book') { const g = BOOK_ROLES.map(([r, l]) => [l, list.filter(b => (b.data.role || 'auteur') === r)]).filter(x => x[1].length);
            return g.map(([l, bs]) => `<h4 class="h-ar-h">${esc(l)} <small class="muted">${bs.length}</small></h4><ul class="h-ar-blist">${bs.map(b => `<li><button type="button" class="link-button" data-ar-item="${b.id}" data-ar-pid="${person.id}">${cover(b, 'h-ar-mini')}<span><b>${esc(b.title)}</b>${b.data.subtitle ? ` — ${esc(b.data.subtitle)}` : ''}<small class="muted">${esc([b.data.authors, b.data.publisher, b.year].filter(Boolean).join(' · '))}</small></span></button></li>`).join('')}</ul>`).join(''); }
        if (kind === 'work') { const val = list.reduce((a, w) => a + (Number(w.data.value) || 0), 0), by = WORK_STATUS.map(([k, l]) => [l, list.filter(w => (w.data.status || 'inconnu') === k).length]).filter(x => x[1]);
            return `<p class="h-ar-sum">${list.length} œuvre${list.length > 1 ? 's' : ''} · ${by.map(([l, n]) => `${esc(l)} : ${n}`).join(' · ')}${val ? ` · valeur estimée ${money(val)}` : ''}</p><div class="h-ar-grid">${list.slice(0, 24).map(w => `<button type="button" class="h-ar-card" data-ar-item="${w.id}" data-ar-pid="${person.id}">${cover(w)}<b>${esc(w.title)}</b><small>${esc([w.data.inv && `n° ${w.data.inv}`, w.data.date, w.data.technique].filter(Boolean).join(' · '))}</small></button>`).join('')}</div>${list.length > 24 ? `<p class="muted">… et ${list.length - 24} autres (« Tout voir »).</p>` : ''}`; }
        if (kind === 'release') return `<div class="h-ar-grid">${list.map(r => `<button type="button" class="h-ar-card" data-ar-item="${r.id}" data-ar-pid="${person.id}">${cover(r)}<b>${esc(r.title)}</b><small>${esc([r.year, label(REL_TYPES, r.data.rtype), r.data.label].filter(Boolean).join(' · '))}${(r.data.tracks || []).length ? ` · ${(r.data.tracks || []).length} titres` : ''}</small></button>`).join('')}</div>`;
        return `<table class="h-ar-table"><tbody>${list.map(f => `<tr data-ar-item="${f.id}" data-ar-pid="${person.id}"><td>${cover(f, 'h-ar-mini')}</td><td>${esc(f.year || '')}</td><td><b>${esc(f.title)}</b>${f.data.original && f.data.original !== f.title ? `<br><small class="muted">${esc(f.data.original)}</small>` : ''}</td><td>${esc([f.data.jobs, f.data.role && `rôle : ${f.data.role}`].filter(Boolean).join(' · '))}</td><td>${esc(f.data.director || '')}</td><td>${esc(label(FILM_KINDS, f.data.fkind))}</td></tr>`).join('')}</tbody></table>`;
    }
    ext.personBlocks = ext.personBlocks || {};
    [['artist_books', 'book'], ['artist_works', 'work'], ['artist_discography', 'release'], ['artist_filmography', 'film']].forEach(([key, kind]) => {
        ext.personBlocks[key] = (index, detail) => {
            const p = detail.person; if (!p || !Number(p.is_artist)) return '';
            const items = detail.heritage?.artist || []; if (!visibleKinds(p, items).includes(kind)) return '';
            const n = items.filter(i => i.kind === kind).length;
            return A().card(index, `${KINDS[kind][0]} ${KINDS[kind][1]}`, n || '', `<div class="h-ar-block">${blockBody(kind, p, items)}</div>`, 'span-12',
                `<button type="button" class="button small secondary" data-ar-open="${kind}" data-ar-pid="${p.id}">${n ? 'Tout voir, modifier' : 'Ouvrir'}</button>`);
        };
    });
    document.addEventListener('click', e => {
        const b = e.target.closest('[data-ar-open],[data-ar-item]'); if (!b || b.closest('.h-ar-dlg')) return;
        const pid = Number(b.dataset.arPid); if (!pid) return; e.preventDefault();
        if (b.dataset.arOpen) openCatalog(pid, {tab: b.dataset.arOpen, add: b.hasAttribute('data-ar-new'), importNow: b.hasAttribute('data-ar-import')});
        else openCatalog(pid, {item: Number(b.dataset.arItem)});
    });

    /* ═════════ Le catalogue (plein écran) ═════════ */
    async function openCatalog(pid, opts = {}) {
        let items = [], person = {}, tab = opts.tab || 'book', q = '', changed = false, view = null; // view : null (la liste) ou {item, mode: 'read'|'edit'}
        const prefs = readJ(PREFS, {sort: 'year', workView: 'cards'});
        const load = async () => { items = (await api('artist_items', {person_id: pid})).items || []; };
        try { const d = await api('person', {id: pid}); person = d.person || d; await load(); } catch (e) { return toast(e.message, 'error'); }
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-ar-dlg';
        dlg.innerHTML = `<div class="h-ar"><header class="h-ar-top"><div><span class="eyebrow">🎨 CATALOGUE DE L’ARTISTE</span><h2>${esc(A().personName ? A().personName(person) : `${person.first_name || ''} ${person.last_name || ''}`)}</h2></div>
            <nav class="segmented h-ar-tabs" data-ar-tabs></nav><span class="spacer"></span><button type="button" class="button small secondary" data-ar-cmd="keys" title="Jeton Discogs, clé TMDb" data-help="Facultatives : un jeton Discogs permet de chercher un disque par son nom, une clé TMDb donne les affiches des films. Elles restent dans ce navigateur.">🔑 Clés</button>${ext.fullButton ? ext.fullButton('artist') : ''}<button type="button" class="icon-button" data-ar-cmd="close" aria-label="Fermer">×</button></header>
            <div class="h-ar-body" data-ar-body></div></div>`;
        document.body.appendChild(dlg); ext.fullInit?.(dlg, 'artist', true); dlg.showModal(); // plein écran par défaut ; ⛶ pour passer en fenêtre (retenu)
        const body = dlg.querySelector('[data-ar-body]');
        const leaveEdit = () => view?.mode !== 'edit' || A().confirmBox('Les modifications de cet élément seront perdues.', {title: 'Quitter sans enregistrer ?', okLabel: 'Quitter sans enregistrer', danger: true});
        const close = async () => { if (!await leaveEdit()) return; dlg.close(); dlg.remove(); if (changed) ext.refreshView?.(); };
        dlg.addEventListener('cancel', async e => { e.preventDefault(); if (!await leaveEdit()) return; if (view) { view = null; draft = null; paint(); } else close(); });
        const current = () => items.filter(i => i.kind === tab);
        const paintTabs = () => { dlg.querySelector('[data-ar-tabs]').innerHTML = Object.entries(KINDS).map(([k, [ic, l]]) => `<button type="button" class="${k === tab ? 'is-active' : ''}" data-ar-tab="${k}" title="${esc(l)}">${ic} ${esc({book: 'Bibliographie', work: 'Œuvres', release: 'Discographie', film: 'Filmographie'}[k] || l)} <small>${items.filter(i => i.kind === k).length || ''}</small></button>`).join(''); };
        function paint() {
            paintTabs();
            if (view?.mode === 'edit') return paintEditor();
            if (view?.mode === 'read') return paintRead();
            const ql = q.toLowerCase(), list = sorted(current().filter(i => !ql || JSON.stringify(i.data).toLowerCase().includes(ql)), prefs.sort);
            const bar = `<div class="h-ar-bar"><input type="search" data-ar-q placeholder="Chercher (titre, label, lieu, paroles…)" value="${esc(q)}"><select data-ar-sort>${[['year', 'Par année'], ['recent', 'Plus récents d’abord'], ['title', 'Par titre'], ['perso', 'Mon ordre']].map(([k, l]) => `<option value="${k}" ${prefs.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
                ${tab === 'work' ? `<span class="segmented"><button type="button" class="${prefs.workView !== 'table' ? 'is-active' : ''}" data-ar-wv="cards">Vignettes</button><button type="button" class="${prefs.workView === 'table' ? 'is-active' : ''}" data-ar-wv="table">Inventaire</button></span>` : ''}
                <span class="spacer"></span><button type="button" class="button small" data-ar-cmd="add">＋ Ajouter un${tab === 'work' ? 'e' : ''} ${KINDS[tab][2]}</button><button type="button" class="button small secondary" data-ar-cmd="import" data-help="Remplit le catalogue depuis Discogs, MusicBrainz, Apple Music, Open Library, Wikidata ou TMDb : tu choisis ce qui entre, rien n’est écrasé.">📥 Importer</button>
                <button type="button" class="button small secondary" data-ar-cmd="export" title="Tableur (CSV), impression ou PDF, sauvegarde (JSON)">⤓ Exporter ▾</button></div>`;
            const move = it => prefs.sort === 'perso' ? `<span class="h-ar-move"><button type="button" class="icon-button" data-ar-up="${it.id}" title="Monter">↑</button><button type="button" class="icon-button" data-ar-down="${it.id}" title="Descendre">↓</button></span>` : '';
            let h;
            if (!list.length) h = q ? A().emptyState({icon: '🔎', text: 'Rien ne correspond', hint: 'Change les mots cherchés.'})
                : A().emptyState({icon: KINDS[tab][0], text: `Aucun${tab === 'work' ? 'e' : ''} ${KINDS[tab][2]} pour l’instant`, hint: `« ＋ Ajouter », ou « 📥 Importer » (${{book: 'Open Library par ISBN ou par auteur, Wikidata', work: 'Wikidata, ou un tableau d’inventaire collé', release: 'Discogs, MusicBrainz, Apple Music, Wikidata', film: 'Wikidata (avec les identifiants IMDb), TMDb'}[tab]}).`, action: {label: `＋ Ajouter un${tab === 'work' ? 'e' : ''} ${KINDS[tab][2]}`, attrs: 'data-ar-cmd="add"'}});
            else if (tab === 'work' && prefs.workView === 'table') h = `<div class="h-ar-scroll"><table class="h-ar-table h-ar-inv"><thead><tr><th></th><th>N°</th><th>Titre</th><th>Date</th><th>Technique</th><th>Dimensions</th><th>Où</th><th>Propriétaire</th><th>État</th><th>Valeur</th><th></th></tr></thead><tbody>${list.map(w => `<tr data-ar-edit="${w.id}"><td>${cover(w, 'h-ar-mini')}</td><td>${esc(w.data.inv || '')}</td><td><b>${esc(w.title)}</b></td><td>${esc(w.data.date || '')}</td><td>${esc([w.data.technique, w.data.support].filter(Boolean).join(' sur '))}</td><td>${esc(dims(w.data))}</td><td>${esc([label(WORK_STATUS, w.data.status || 'inconnu'), w.data.location].filter(Boolean).join(' — '))}</td><td>${esc(w.data.owner || '')}</td><td>${esc(label(CONDITION, w.data.condition || ''))}</td><td>${esc(money(w.data.value))}</td><td>${move(w)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="9">${A().plural(list.length, 'œuvre')}</td><td>${esc(money(list.reduce((a, w) => a + (Number(w.data.value) || 0), 0)))}</td><td></td></tr></tfoot></table></div>`;
            else if (tab === 'work' || tab === 'release') h = `<div class="h-ar-grid is-big">${list.map(it => `<div class="h-ar-card" data-ar-${tab === 'release' ? 'read' : 'edit'}="${it.id}">${cover(it)}<b>${esc(it.title)}</b><small>${esc(tab === 'release' ? [it.year, label(REL_TYPES, it.data.rtype), it.data.label, it.data.format].filter(Boolean).join(' · ') : [it.data.inv && `n° ${it.data.inv}`, it.data.date, it.data.technique, label(WORK_STATUS, it.data.status || 'inconnu')].filter(Boolean).join(' · '))}</small>${move(it)}</div>`).join('')}</div>`;
            else h = `<div class="h-ar-scroll"><table class="h-ar-table"><tbody>${list.map(it => `<tr data-ar-edit="${it.id}"><td>${cover(it, 'h-ar-mini')}</td><td>${esc(it.year || '')}</td><td><b>${esc(it.title)}</b>${it.data.subtitle ? ` — ${esc(it.data.subtitle)}` : ''}${it.data.original && it.data.original !== it.title ? `<br><small class="muted">${esc(it.data.original)}</small>` : ''}</td><td>${esc(tab === 'book' ? [label(BOOK_ROLES, it.data.role || 'auteur'), it.data.authors].filter(Boolean).join(' · ') : [it.data.jobs, it.data.role && `rôle : ${it.data.role}`].filter(Boolean).join(' · '))}</td><td>${esc(tab === 'book' ? [it.data.publisher, it.data.isbn && `ISBN ${it.data.isbn}`].filter(Boolean).join(' · ') : [it.data.director, label(FILM_KINDS, it.data.fkind), it.data.duration && `${it.data.duration} min`].filter(Boolean).join(' · '))}</td><td>${move(it)}</td></tr>`).join('')}</tbody></table></div>`;
            body.innerHTML = bar + h;
        }
        /* ── la fiche d'un disque, comme sur Discogs ── */
        function paintRead() {
            const it = view.item, d = it.data, tracks = d.tracks || [], tot = tracks.reduce((a, t) => a + secs(t.dur), 0), photos = d.photos || [];
            body.innerHTML = `<div class="h-ar-bar"><button type="button" class="button small secondary" data-ar-cmd="back">← ${KINDS[tab][1]}</button><span class="spacer"></span><button type="button" class="button small" data-ar-edit="${it.id}">✎ Modifier</button></div>
                <article class="h-ar-rel"><aside><div class="h-ar-gal">${photos.length ? photos.map((ph, i) => `<figure><img src="${esc(photoSrc(ph))}" alt="" data-ar-zoom="${i}"><figcaption>${esc(label(PHOTO_KINDS, ph.k) || '')}${ph.c ? ` · ${esc(ph.c)}` : ''}</figcaption></figure>`).join('') : `<span class="h-ar-cov is-empty">💿</span>`}</div></aside>
                <div><h2>${esc(d.artist ? `${d.artist} – ` : '')}${esc(it.title)}</h2><dl class="h-ar-dl">${[['Label', [d.label, d.catno].filter(Boolean).join(' – ')], ['Format', d.format], ['Pays', d.country], ['Sortie', d.released || d.year], ['Genre', d.genre], ['Style', d.styles], ['Genre de parution', label(REL_TYPES, d.rtype)], ['Production', d.producer], ['Studio', d.studio], ['Code-barres', d.barcode]].filter(x => x[1]).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
                <h3>Titres${tot ? ` <small class="muted">· durée totale ${hms(tot)}</small>` : ''}</h3><table class="h-ar-table h-ar-tracks"><tbody>${tracks.map((t, i) => `<tr class="${t.lyrics || t.notes ? 'has-more' : ''}"><td>${esc(t.pos || i + 1)}</td><td><b>${esc(t.title)}</b>${t.credits ? `<br><small class="muted">${esc(t.credits)}</small>` : ''}${t.version ? `<br><small class="muted">${esc(t.version)}</small>` : ''}</td><td>${esc(t.dur || '')}</td><td>${t.lyrics || t.notes ? `<button type="button" class="link-button" data-ar-lyr="${i}">${t.lyrics ? '📝 paroles' : ''}${t.lyrics && t.notes ? ' · ' : ''}${t.notes ? '💬 notes' : ''}</button>` : ''}</td></tr><tr class="h-ar-lyr" data-ar-lyrrow="${i}" hidden><td></td><td colspan="3">${t.lyrics ? `<pre class="h-ar-lyrics">${esc(t.lyrics)}</pre>` : ''}${t.notes ? `<div class="h-ar-notes"><b>Notes</b><p>${esc(t.notes).replace(/\n/g, '<br>')}</p></div>` : ''}</td></tr>`).join('') || '<tr><td class="muted">Pas encore de titres.</td></tr>'}</tbody></table>
                ${(d.credits || []).length ? `<h3>Crédits</h3><ul class="h-ar-credits">${d.credits.map(c => `<li><span>${esc(c.role)}</span> – ${esc(c.name)}</li>`).join('')}</ul>` : ''}
                ${d.notes ? `<h3>Notes</h3><p>${esc(d.notes).replace(/\n/g, '<br>')}</p>` : ''}
                ${(d.versions || []).length ? `<h3>Éditions et pressages <small class="muted">${d.versions.length}</small></h3><div class="h-ar-scroll"><table class="h-ar-table"><thead><tr><th>Titre</th><th>Format</th><th>Label</th><th>N° cat.</th><th>Pays</th><th>Année</th><th>Note</th></tr></thead><tbody>${d.versions.map(v => `<tr><td>${esc(v.title || it.title)}</td><td>${esc(v.format || '')}</td><td>${esc(v.label || '')}</td><td>${esc(v.catno || '')}</td><td>${esc(v.country || '')}</td><td>${esc(v.year || '')}</td><td>${esc(v.note || '')}${v.barcode ? ` <small class="muted">${esc(v.barcode)}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}
                ${d.link ? `<p><a href="${esc(/^https?:\/\//.test(d.link) ? d.link : '#')}" target="_blank" rel="noopener noreferrer">${esc(d.link)}</a></p>` : ''}</div></article>`;
        }
        /* ── l'éditeur ── */
        const fieldHtml = ([k, l, type, opt], d) => type === 'select' ? `<label>${esc(l)}<select data-f="${k}">${opt.map(([v, t]) => `<option value="${v}" ${String(d[k] ?? opt[0][0]) === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`
            : type === 'area' ? `<label class="is-wide">${esc(l)}<textarea data-f="${k}" rows="3">${esc(d[k] || '')}</textarea></label>` : `<label>${esc(l)}<input data-f="${k}" ${type === 'num' ? 'type="number" step="any"' : ''} value="${esc(d[k] ?? '')}"></label>`;
        const photosHtml = ph => `<div class="h-ar-photos" data-ar-photos>${ph.map((p, i) => `<figure data-i="${i}"><img src="${esc(photoSrc(p))}" alt=""><select data-pk>${PHOTO_KINDS.map(([v, t]) => `<option value="${v}" ${p.k === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select><input data-pc value="${esc(p.c || '')}" placeholder="légende"><span><button type="button" class="icon-button" data-ph-left="${i}" title="Avant">←</button><button type="button" class="icon-button" data-ph-del="${i}" title="Retirer">×</button></span></figure>`).join('')}
            <div class="h-ar-phadd"><button type="button" class="button small secondary" data-ar-cmd="phfile">＋ Photo de l’ordinateur</button><button type="button" class="button small secondary" data-ar-cmd="phurl">＋ Depuis une adresse (Discogs, Wikimedia…)</button><button type="button" class="button small secondary" data-ar-cmd="phmedia">＋ Parmi mes médias</button></div></div>`;
        const rowsHtml = (k, rows, cols) => `<div class="h-ar-rows" data-rows="${k}">${rows.map((r, i) => `<div class="h-ar-r" data-i="${i}">${cols.map(([c, l, w]) => `<input data-c="${c}" value="${esc(r[c] ?? '')}" placeholder="${esc(l)}" style="flex:${w || 1}">`).join('')}<span class="h-ar-ract">${k === 'tracks' ? `<button type="button" class="icon-button ${r.lyrics || r.notes || r.credits ? 'is-on' : ''}" data-r-more="${i}" title="Paroles, notes, crédits">📝</button>` : ''}<button type="button" class="icon-button" data-r-up="${i}" title="Monter">↑</button><button type="button" class="icon-button" data-r-del="${i}" title="Retirer">×</button></span>
            ${k === 'tracks' ? `<div class="h-ar-more" data-more="${i}" hidden><label>Crédits du titre<input data-c="credits" value="${esc(r.credits || '')}" placeholder="Paroles : …, Musique : …, Guitare : …"></label><label>Version (remix, prise, durée d’édition…)<input data-c="version" value="${esc(r.version || '')}"></label><label>Paroles<textarea data-c="lyrics" rows="8">${esc(r.lyrics || '')}</textarea></label><label>Notes, annotations (sens d’un vers, histoire du morceau…)<textarea data-c="notes" rows="4">${esc(r.notes || '')}</textarea></label></div>` : ''}</div>`).join('')}
            <button type="button" class="button small secondary" data-r-add="${k}">＋ ${{tracks: 'Un titre', versions: 'Une édition', credits: 'Un crédit'}[k]}</button>${k === 'tracks' ? ' <button type="button" class="button small secondary" data-r-paste="tracks">📋 Coller une liste de titres…</button>' : ''}</div>`;
        const COLS = {tracks: [['pos', 'N°', .4], ['title', 'Titre', 4], ['dur', '3:45', .7]], versions: [['title', 'Titre (si différent)', 2], ['format', 'Format', 2], ['label', 'Label', 1.5], ['catno', 'N° cat.', 1], ['country', 'Pays', 1], ['year', 'Année', .7], ['barcode', 'Code-barres', 1.4], ['note', 'Note', 2]], credits: [['role', 'Rôle', 1], ['name', 'Nom', 2]]};
        let draft = null;
        function paintEditor() {
            const it = view.item; draft = draft || JSON.parse(JSON.stringify(it.data || {})); const d = draft;
            d.photos = d.photos || []; if (tab === 'release') { d.tracks = d.tracks || []; d.versions = d.versions || []; d.credits = d.credits || []; }
            body.innerHTML = `<div class="h-ar-bar"><button type="button" class="button small secondary" data-ar-cmd="cancel">← Annuler</button><b>${it.id ? 'Modifier' : 'Nouveau'} : ${esc(KINDS[tab][2])}</b><span class="spacer"></span>${it.id ? '<button type="button" class="button small danger" data-ar-cmd="del">🗑 Supprimer</button>' : ''}<button type="button" class="button small" data-ar-cmd="save">💾 Enregistrer</button></div>
                <div class="h-ar-form"><div class="h-ar-fields">${FIELDS[tab].map(f => fieldHtml(f, d)).join('')}</div>
                <h4>${tab === 'release' ? 'Photos du disque (pochette, verso, disque, livret…)' : tab === 'film' ? 'Affiche, photos' : tab === 'work' ? 'Photos de l’œuvre' : 'Couverture'}</h4>${photosHtml(d.photos)}
                ${tab === 'release' ? `<h4>Titres <small class="muted" data-ar-tot></small></h4>${rowsHtml('tracks', d.tracks, COLS.tracks)}<h4>Crédits</h4>${rowsHtml('credits', d.credits, COLS.credits)}<h4>Éditions et pressages (comme sur Discogs)</h4>${rowsHtml('versions', d.versions, COLS.versions)}` : ''}</div>`;
            const tot = (d.tracks || []).reduce((a, t) => a + secs(t.dur), 0), tt = body.querySelector('[data-ar-tot]'); if (tt) tt.textContent = tot ? `durée totale ${hms(tot)}` : '';
            const phz = body.querySelector('[data-ar-photos]'); if (phz) window.LCNDA_UI?.bindFileDrop?.(phz, files => addPhotoFiles(files), {accept: 'image/*'}); // E4
        }
        const sync = () => { // les champs du formulaire → draft
            if (!draft) return;
            body.querySelectorAll('[data-f]').forEach(el => { draft[el.dataset.f] = el.value; });
            body.querySelectorAll('[data-ar-photos] figure').forEach(fg => { const p = draft.photos[Number(fg.dataset.i)]; if (p) { p.k = fg.querySelector('[data-pk]').value; p.c = fg.querySelector('[data-pc]').value; } });
            body.querySelectorAll('[data-rows]').forEach(box => { const k = box.dataset.rows; box.querySelectorAll(':scope > .h-ar-r').forEach(r => { const row = draft[k][Number(r.dataset.i)]; if (row) r.querySelectorAll('[data-c]').forEach(inp => { row[inp.dataset.c] = inp.value; }); }); });
        };
        const startEdit = it => { draft = null; view = {item: it, mode: 'edit'}; paint(); };
        async function saveDraft() {
            sync(); const it = view.item; if (!String(draft.title || '').trim()) return toast('Il faut un titre.', 'error');
            if (tab === 'release') draft.tracks = draft.tracks.filter(t => t.title || t.lyrics);
            try { const r = await post('save_artist_item', {person_id: pid, kind: tab, id: it.id || 0, data: draft}); changed = true; await load(); const fresh = items.find(i => i.id === r.id); draft = null; view = tab === 'release' && fresh ? {item: fresh, mode: 'read'} : null; paint(); toast('Enregistré.'); } catch (e) { toast(e.message, 'error'); }
        }
        async function addPhoto(ph) { sync(); draft.photos.push(ph); paint(); }
        /** des photos de l'ordinateur (bouton, glisser-déposer ou ⌘V) : elles entrent dans les Médias, puis dans l'élément */
        async function addPhotoFiles(files) { for (const f of files.slice(0, 12)) { try { const r = await post('artist_upload_image', {person_id: pid, title: `${draft.title || KINDS[tab][2]} — ${f.name}`, data: await fileToData(f)}); await addPhoto({m: r.id, f: r.filename, k: draft.photos.length ? 'autre' : 'recto'}); } catch (er) { toast(er.message, 'error'); } } }
        dlg.addEventListener('input', e => { if (e.target.matches('[data-ar-q]')) { q = e.target.value; const pos = e.target.selectionStart; paint(); const i = body.querySelector('[data-ar-q]'); i.focus(); i.setSelectionRange(pos, pos); } });
        dlg.addEventListener('change', e => {
            if (e.target.matches('[data-ar-sort]')) { prefs.sort = e.target.value; writeJ(PREFS, prefs); paint(); }
            if (e.target.matches('[data-c="dur"]')) { sync(); const tot = draft.tracks.reduce((a, t) => a + secs(t.dur), 0), tt = body.querySelector('[data-ar-tot]'); if (tt) tt.textContent = tot ? `durée totale ${hms(tot)}` : ''; }
        });
        dlg.addEventListener('click', async e => {
            const t = e.target.closest('button, [data-ar-edit], [data-ar-read], img[data-ar-zoom]'); if (!t) return; const d = t.dataset;
            t.closest('details')?.removeAttribute('open');
            if (d.arTab) { if (!await leaveEdit()) return; tab = d.arTab; view = null; draft = null; q = ''; return paint(); }
            if (d.arWv) { prefs.workView = d.arWv; writeJ(PREFS, prefs); return paint(); }
            if (d.arUp || d.arDown) { const list = sorted(current(), 'perso'), i = list.findIndex(x => x.id === Number(d.arUp || d.arDown)), j = d.arUp ? i - 1 : i + 1; if (i < 0 || j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; list.forEach((x, k) => { x.sort = k + 1; }); paint(); post('reorder_artist_items', {person_id: pid, ids: list.map(x => x.id)}).then(() => { changed = true; }).catch(er => toast(er.message, 'error')); return; }
            if (d.arRead) { const it = items.find(i => i.id === Number(d.arRead)); if (it) { view = {item: it, mode: 'read'}; paint(); } return; }
            if (d.arEdit) { const it = items.find(i => i.id === Number(d.arEdit)); if (it) startEdit(it); return; }
            if (d.arLyr !== undefined) { const r = body.querySelector(`[data-ar-lyrrow="${d.arLyr}"]`); if (r) r.hidden = !r.hidden; return; }
            if (d.arZoom !== undefined) { const ph = view.item.data.photos[Number(d.arZoom)]; ext.openDialog({eyebrow: 'PHOTO', title: label(PHOTO_KINDS, ph.k) || 'Photo', wide: true, body: `<img src="${esc(photoSrc(ph))}" alt="" style="max-width:100%;max-height:75vh;display:block;margin:auto">`, submitLabel: 'Fermer', onSubmit: () => true}); return; }
            if (d.phDel !== undefined) { sync(); draft.photos.splice(Number(d.phDel), 1); return paint(); }
            if (d.phLeft !== undefined) { sync(); const i = Number(d.phLeft); if (i > 0) [draft.photos[i - 1], draft.photos[i]] = [draft.photos[i], draft.photos[i - 1]]; return paint(); }
            if (d.rAdd) { sync(); draft[d.rAdd].push(d.rAdd === 'tracks' ? {pos: String(draft.tracks.length + 1)} : {}); paint(); body.querySelector(`[data-rows="${d.rAdd}"] > .h-ar-r:last-of-type input`)?.focus(); return; }
            if (d.rDel !== undefined) { sync(); draft[t.closest('[data-rows]').dataset.rows].splice(Number(d.rDel), 1); return paint(); }
            if (d.rUp !== undefined) { sync(); const k = t.closest('[data-rows]').dataset.rows, i = Number(d.rUp); if (i > 0) [draft[k][i - 1], draft[k][i]] = [draft[k][i], draft[k][i - 1]]; return paint(); }
            if (d.rMore !== undefined) { const m = t.closest('.h-ar-r').querySelector('[data-more]'); m.hidden = !m.hidden; return; }
            if (d.rPaste) { const txt = await new Promise(ok => { let v = ''; ext.openDialog({eyebrow: 'DISCOGRAPHIE', title: 'Coller une liste de titres', submitLabel: 'Ajouter', body: '<p class="muted">Un titre par ligne, avec si on veut le numéro devant et la durée à la fin : « 1. Le temps des cerises 3:12 ».</p><textarea data-t rows="12" style="width:100%"></textarea>', onSubmit: f => { v = f.querySelector('[data-t]').value; } }).addEventListener('close', () => ok(v)); }); if (!txt.trim()) return; sync();
                txt.split(/\n+/).map(l => l.trim()).filter(Boolean).forEach(l => { const m = l.match(/^([A-Z]?\d+[a-z]?|[A-D]\d*)[.)\-\s]+(.*)$/), rest = m ? m[2] : l, dm = rest.match(/^(.*?)[\s–—-]*\(?(\d{1,2}:\d{2}(?::\d{2})?)\)?$/); draft.tracks.push({pos: m ? m[1] : String(draft.tracks.length + 1), title: (dm ? dm[1] : rest).trim(), dur: dm ? dm[2] : ''}); }); return paint(); }
            const c = d.arCmd; if (!c) return;
            if (c === 'close') return close();
            if (c === 'back') { view = null; return paint(); }
            if (c === 'cancel') { draft = null; view = view.item.id && tab === 'release' ? {item: view.item, mode: 'read'} : null; return paint(); }
            if (c === 'add') return startEdit({id: 0, data: {title: '', ...(tab === 'book' ? {role: 'auteur', bkind: 'livre', authors: A().personName?.(person) || ''} : tab === 'work' ? {status: 'famille', inv: nextInv()} : tab === 'release' ? {rtype: 'album', artist: A().personName?.(person) || ''} : {fkind: 'long'})}});
            if (c === 'save') return saveDraft();
            if (c === 'del') { if (!await A().confirmBox('', {title: 'Supprimer cet élément du catalogue ?', okLabel: 'Supprimer l’élément'})) return; try { await post('delete_artist_item', {person_id: pid, id: view.item.id}); changed = true; await load(); view = null; draft = null; paint(); } catch (er) { toast(er.message, 'error'); } return; }
            if (c === 'phfile') { const inp = Object.assign(document.createElement('input'), {type: 'file', accept: 'image/*', multiple: true}); inp.onchange = () => addPhotoFiles([...inp.files]); inp.click(); return; }
            if (c === 'phurl') { const u = await A().askText({title: 'Une image depuis une adresse', message: 'Adresse https d’une image de Discogs, MusicBrainz (Cover Art Archive), Open Library, Wikimedia Commons, TMDb ou Apple.', value: '', okLabel: 'Rapatrier'}); if (!u) return; try { const r = await post('artist_fetch_image', {person_id: pid, url: u.trim(), title: draft.title || ''}); await addPhoto({m: r.id, f: r.filename, k: draft.photos.length ? 'autre' : 'recto'}); } catch (er) { toast(er.message, 'error'); } return; }
            if (c === 'phmedia') { const m = await pickMedia(); if (m) await addPhoto({m: m.id, f: m.filename, k: draft.photos.length ? 'autre' : 'recto'}); return; }
            if (c === 'import') return openImport();
            if (c === 'keys') return editKeys();
            if (c === 'csv' || c === 'json' || c === 'print') return exportKind(c);
            if (c === 'export') { // E3 : une seule fenêtre d'export
                const UI = window.LCNDA_UI || {}; if (!UI.openExportDialog) return exportKind('print');
                const nm = `${A().personName?.(person) || 'artiste'} — ${KINDS[tab][1]}`;
                return UI.openExportDialog({title: nm, defaultName: nm, quality: false, info: A().plural(current().length, 'élément'), formats: [
                    {id: 'csv', label: '📊 Tableur', hint: 'CSV (Excel, Numbers, LibreOffice)', ext: 'csv', run: async o => exportKind('csv', o.filename)},
                    {id: 'pdf', hint: tab === 'work' ? 'l’inventaire illustré (« Enregistrer en PDF »)' : 'la liste illustrée (« Enregistrer en PDF »)', ext: '', run: async () => exportKind('print')},
                    {id: 'print', hint: tab === 'work' ? 'l’inventaire illustré' : 'la liste illustrée', run: async () => exportKind('print')},
                    {id: 'file', label: '💾 Sauvegarde', hint: 'JSON, pour une autre base', ext: 'json', run: async o => exportKind('json', o.filename)}]});
            }
        });
        const nextInv = () => { const nums = items.filter(i => i.kind === 'work').map(i => Number(String(i.data.inv || '').match(/(\d+)\s*$/)?.[1] || 0)); const n = (nums.length ? Math.max(...nums) : 0) + 1, pre = (items.find(i => i.kind === 'work' && /\d+\s*$/.test(i.data.inv || ''))?.data.inv || '').replace(/\d+\s*$/, ''); return `${pre}${String(n).padStart(3, '0')}`; };
        // une image des médias : le même choix d'image que partout (heritage.js pickImage : vignettes, recherche au style du menu)
        async function pickMedia() { return ext.pickImage ? ext.pickImage({eyebrow: 'MÉDIAS', title: 'Choisir une image', filters: false, allowImport: false}) : null; }
        function editKeys() {
            const k = keys();
            ext.openDialog({eyebrow: 'IMPORTS', title: '🔑 Clés personnelles', submitLabel: 'Enregistrer', body: `<p class="muted">Facultatives. Elles restent dans ce navigateur et ne servent qu’aux imports.</p>
                <label>Jeton Discogs (pour chercher par nom ; sans lui, colle l’adresse d’une page Discogs)<input name="discogs" value="${esc(k.discogs || '')}" autocomplete="off" placeholder="discogs.com → Paramètres → Développeurs → Générer un jeton"></label>
                <label>Clé TMDb (filmographies avec affiches)<input name="tmdb" value="${esc(k.tmdb || '')}" autocomplete="off" placeholder="themoviedb.org → Paramètres → API (clé v3, 32 caractères)"></label>`,
                onSubmit: f => { writeJ(KEYS, {discogs: f.elements.discogs.value.trim(), tmdb: f.elements.tmdb.value.trim()}); toast('Clés enregistrées.'); }});
        }
        function exportKind(how, filename = '') {
            const list = sorted(current(), prefs.sort), name = `${A().safeExportFilename ? A().safeExportFilename(A().personName?.(person) || 'artiste', 'artiste') : 'artiste'}-${tab}`;
            const cols = FIELDS[tab].map(f => f[0]), dl = (blob, fn) => { const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: fn}); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
            if (how === 'json') return dl(new Blob([JSON.stringify({kind: tab, items: list.map(i => i.data)}, null, 1)], {type: 'application/json'}), filename || `${name}.json`);
            if (how === 'csv') { const q2 = v => `"${String(v ?? '').replace(/^([=+\-@\t\r])/, "'$1").replace(/"/g, '""')}"`, sel = (list, k) => (list.find(x => x[0] === k) || [])[3]; const head = FIELDS[tab].map(f => f[1]).concat(tab === 'release' ? ['Titres'] : []);
                const rows = list.map(i => cols.map(k => { const opt = sel(FIELDS[tab], k); return opt ? label(opt, i.data[k]) : i.data[k]; }).concat(tab === 'release' ? [(i.data.tracks || []).map(t => `${t.pos || ''} ${t.title}${t.dur ? ` (${t.dur})` : ''}`).join(' | ')] : []));
                return dl(new Blob(['﻿' + [head, ...rows].map(r => r.map(q2).join(';')).join('\r\n')], {type: 'text/csv;charset=utf-8'}), filename || `${name}.csv`); }
            const w = window.open('', '_blank'); if (!w) return toast('Fenêtre bloquée.', 'error');
            const abs = s => s ? new URL(s, location.href).href : '';
            const rowsH = list.map(i => `<tr><td>${photoSrc((i.data.photos || [])[0]) ? `<img src="${esc(abs(photoSrc(i.data.photos[0])))}">` : ''}</td><td>${tab === 'work' ? `<b>${esc(i.data.inv || '')}</b>` : esc(i.year || '')}</td><td><b>${esc(i.title)}</b>${FIELDS[tab].filter(f => !['title', 'inv', 'note', 'notes', 'synopsis', 'cast'].includes(f[0]) && i.data[f[0]]).map(f => `<br><small>${esc(f[1])} : ${esc(f[3] ? label(f[3], i.data[f[0]]) : i.data[f[0]])}</small>`).join('')}${tab === 'release' && (i.data.tracks || []).length ? `<ol>${i.data.tracks.map(t => `<li>${esc(t.title)}${t.dur ? ` <small>${esc(t.dur)}</small>` : ''}</li>`).join('')}</ol>` : ''}</td></tr>`).join('');
            w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(KINDS[tab][1])}</title><style>body{font:13px/1.4 system-ui,sans-serif;margin:16px}h1{font-size:20px}table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #ccc;padding:6px;vertical-align:top}td:first-child{width:110px}img{max-width:100px;max-height:110px}small{color:#555}ol{margin:4px 0 0 18px;padding:0;columns:2}@page{margin:12mm}</style><h1>${esc(KINDS[tab][1])} — ${esc(A().personName?.(person) || '')}</h1><p>${A().plural(list.length, 'élément')} · ${new Date().toLocaleDateString('fr-FR')}</p><table>${rowsH}</table><script>onload=()=>setTimeout(()=>print(),300)<\/script>`); w.document.close();
        }

        /* ═════════ Les imports ═════════ */
        function openImport() {
            const SRC = {book: [['ol_isbn', 'Open Library : un ISBN'], ['ol_author', 'Open Library : tous les livres d’un auteur'], ['ol_subject', 'Open Library : livres sur un sujet'], ['wd', 'Wikidata : œuvres écrites']],
                work: [['wd', 'Wikidata : œuvres de l’artiste (avec images des musées)'], ['csv', 'Un tableau d’inventaire (copier-coller d’un tableur)']],
                release: [['discogs', 'Discogs : adresse d’un artiste, d’un album ou d’un disque'], ['discogs_search', 'Discogs : chercher par nom (jeton)'], ['mb', 'MusicBrainz (libre, sans clé)'], ['itunes', 'Apple Music (iTunes)'], ['wd', 'Wikidata : albums']],
                film: [['wd', 'Wikidata (relie aux fiches IMDb)'], ['imdb', 'Une adresse IMDb de la personne (nm…)'], ['tmdb', 'TMDb (clé ; affiches)']]}[tab];
            const name = A().personName?.(person) || '';
            ext.openDialog({eyebrow: `IMPORTER · ${KINDS[tab][1].toUpperCase()}`, title: '📥 Importer', wide: true, submitLabel: 'Importer la sélection',
                body: `<div class="h-ar-imp"><label>Source<select data-src>${SRC.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
                    <div class="h-ar-impq"><input data-iq value="${esc(name)}" placeholder="Nom, adresse, ISBN…"><button type="button" class="button small" data-go>Chercher</button></div><p class="muted" data-help></p>
                    <div data-res class="h-ar-res"></div><label class="checkbox-line"><input type="checkbox" data-imgs checked> Rapatrier les images (pochettes, affiches, couvertures) dans les médias de la fiche</label><label class="checkbox-line"><input type="checkbox" data-nodup checked> Ne pas doubler ce qui est déjà au catalogue (même titre, même année)</label><p class="muted" data-prog></p></div>`,
                onOpen: dg => {
                    const src = dg.querySelector('[data-src]'), iq = dg.querySelector('[data-iq]'), res = dg.querySelector('[data-res]'), help = dg.querySelector('[data-help]');
                    const HELP = {ol_isbn: 'L’ISBN (10 ou 13 chiffres) est au dos du livre.', ol_author: 'Le nom de l’auteur tel qu’il est publié.', ol_subject: 'Un sujet ou un nom : les livres qui en parlent.', wd: 'Le nom de l’artiste, ou l’adresse de sa page Wikidata (Q…).', csv: 'Copie les lignes de ton tableur (avec la ligne des titres de colonnes : N°, Titre, Date, Technique, Dimensions, Lieu, Propriétaire, État, Valeur…) et colle-les ci-dessous.',
                        discogs: 'Ex. https://www.discogs.com/artist/123456-Nom, …/master/…, …/release/…', discogs_search: 'Le nom de l’artiste ou de l’album (il faut le jeton : bouton 🔑 Clés).', mb: 'Le nom de l’artiste.', itunes: 'Le nom de l’artiste (et éventuellement de l’album).', imdb: 'Ex. https://www.imdb.com/name/nm0000123/ — la filmographie vient de Wikidata (et de TMDb si la clé est donnée).', tmdb: 'Le nom, ou l’adresse IMDb (nm…).'};
                    const setHelp = () => { help.textContent = HELP[src.value] || ''; const cur = dg.querySelector('[data-iq]') || dg.querySelector('.h-ar-csv');
                        if (src.value === 'csv' && !cur.matches('.h-ar-csv')) cur.replaceWith(Object.assign(document.createElement('textarea'), {rows: 8, className: 'h-ar-csv'}));
                        else if (src.value !== 'csv' && cur.matches('.h-ar-csv')) { const i = Object.assign(document.createElement('input'), {placeholder: 'Nom, adresse, ISBN…'}); i.dataset.iq = ''; cur.replaceWith(i); }
                        dg.querySelector('[data-go]').textContent = src.value === 'csv' ? 'Lire le tableau' : 'Chercher'; };
                    src.addEventListener('change', () => { res.innerHTML = ''; res._cands = []; setHelp(); }); setHelp();
                    dg.querySelector('[data-go]').addEventListener('click', async () => { const val = (dg.querySelector('[data-iq]') || dg.querySelector('.h-ar-csv')).value.trim(); res.innerHTML = '<p class="muted">Recherche…</p>';
                        try { await SEARCH[src.value](val, res); } catch (er) { res.innerHTML = `<p class="error-text">${esc(er.message)}</p>`; } });
                    res.addEventListener('click', async ev => { const b = ev.target.closest('[data-pick]'); if (!b) return; res.innerHTML = '<p class="muted">Chargement…</p>'; try { await res._pick(Number(b.dataset.pick), res); } catch (er) { res.innerHTML = `<p class="error-text">${esc(er.message)}</p>`; } });
                    res.addEventListener('change', ev => { if (ev.target.matches('[data-all]')) res.querySelectorAll('[data-cand]').forEach(c => { c.checked = ev.target.checked; }); });
                },
                onSubmit: async f => {
                    const res = f.querySelector('[data-res]'), cands = res._cands || [], chosen = [...res.querySelectorAll('[data-cand]:checked')].map(c => cands[Number(c.dataset.cand)]).filter(Boolean);
                    if (!chosen.length) { toast('Coche ce qu’il faut importer.', 'error'); return false; }
                    const prog = f.querySelector('[data-prog]'), imgs = f.querySelector('[data-imgs]').checked, nodup = f.querySelector('[data-nodup]').checked, have = new Set(items.map(sameKey));
                    let done = 0, skipped = 0; const out = [];
                    for (const c of chosen) {
                        prog.textContent = `${done + skipped + 1} / ${chosen.length} : ${c.title || ''}…`;
                        let it; try { it = c.full ? await c.full() : c.item; } catch (er) { toast(`${c.title} : ${er.message}`, 'error'); continue; }
                        if (!it) continue; it.data.title = String(it.data.title || c.title || '').trim() || 'Sans titre';
                        if (nodup && have.has(sameKey({kind: tab, data: it.data}))) { skipped++; continue; }
                        if (imgs) { const ph = []; for (const p of (it.data.photos || []).slice(0, 8)) { if (!p.u) { ph.push(p); continue; } try { const r = await post('artist_fetch_image', {person_id: pid, url: p.u, title: it.data.title}); ph.push({m: r.id, f: r.filename, k: p.k, c: p.c || ''}); } catch (_) { ph.push(p); } } it.data.photos = ph; }
                        out.push({kind: tab, data: it.data}); have.add(sameKey({kind: tab, data: it.data})); done++;
                        if (out.length >= 20) { await post('save_artist_items', {person_id: pid, items: out.splice(0)}); }
                    }
                    if (out.length) await post('save_artist_items', {person_id: pid, items: out});
                    changed = true; await load(); view = null; paint(); toast(`${A().plural(done, 'importé')}${skipped ? `, ${A().plural(skipped, 'déjà présent', 'déjà présents')}` : ''}.`);
                }});
        }
        // la liste à cocher des candidats
        const candList = (res, cands, note = '') => { res._cands = cands; res.innerHTML = cands.length ? `${note ? `<p class="muted">${esc(note)}</p>` : ''}<label class="checkbox-line"><input type="checkbox" data-all checked> Tout cocher (${cands.length})</label><div class="h-ar-cands">${cands.map((c, i) => `<label class="checkbox-line"><input type="checkbox" data-cand="${i}" ${c.off ? '' : 'checked'}>${c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy">` : ''}<span><b>${esc(c.title)}</b> <small class="muted">${esc(c.sub || '')}</small></span></label>`).join('')}</div>` : '<p class="muted">Rien trouvé.</p>'; };
        const choose = (res, rows, onPick, note = 'Lequel ?') => { res._pick = i => onPick(rows[i]); res.innerHTML = `<p class="muted">${esc(note)}</p>${rows.map((r, i) => `<button type="button" class="h-ar-choice" data-pick="${i}"><b>${esc(r.label)}</b> <small class="muted">${esc(r.description || '')}</small></button>`).join('') || '<p class="muted">Rien trouvé.</p>'}`; };
        const remote = q2 => post('artist_remote', q2);
        // Wikidata : trouver la personne (nom, adresse, Q…), puis la liste
        async function wdPerson(val, res, then) {
            const qid = (val.match(/\b(Q\d+)\b/) || [])[1]; if (qid) return then(qid);
            const nm = (val.match(/\b(nm\d{5,10})\b/) || [])[1]; if (nm) { const r = (await remote({source: 'wikidata', what: 'imdb', id: nm})).items; if (!r.length) throw new Error('Cette fiche IMDb n’est pas reliée à Wikidata.'); return then(r[0].p.split('/').pop()); }
            const r = (await remote({source: 'wikidata', what: 'find', q: val})).items; if (r.length === 1) return then(r[0].id);
            choose(res, r, x => then(x.id), 'Quelle personne ?');
        }
        const wdYear = v => yearOf(v);
        const SEARCH = {
            ol_isbn: async (val, res) => { const j = await remote({source: 'openlibrary', what: 'isbn', id: val}); candList(res, (j.docs || []).map(olCand)); },
            ol_author: async (val, res) => { const j = await remote({source: 'openlibrary', what: 'author', q: val}); candList(res, (j.docs || []).map(olCand), `${A().plural(j.numFound || 0, 'titre')} chez Open Library (les éditions d’un même livre sont regroupées).`); },
            ol_subject: async (val, res) => { const j = await remote({source: 'openlibrary', what: 'subject', q: val}); candList(res, (j.docs || []).map(d => ({...olCand(d), off: true, item: {data: {...olCand(d).item.data, role: 'sur'}}}))); },
            wd: (val, res) => wdPerson(val, res, async qid => {
                if (tab === 'book') { const r = (await remote({source: 'wikidata', what: 'books', id: qid})).items, by = groupBy(r, 'b'); candList(res, by.map(g => { const x = g[0]; return {title: x.bLabel, sub: [wdYear(x.date), x.pubLabel, x.typeLabel].filter(Boolean).join(' · '), item: {data: {title: x.bLabel, year: wdYear(x.date), publisher: x.pubLabel || '', isbn: x.isbn || '', role: 'auteur', bkind: 'livre', link: x.b}}}; })); }
                else if (tab === 'work') { const r = (await remote({source: 'wikidata', what: 'works', id: qid})).items, by = groupBy(r, 'w'); candList(res, by.map(g => { const x = g[0], img = x.img ? x.img.replace(/^http:/, 'https:') + '?width=1200' : ''; return {title: x.wLabel, sub: [wdYear(x.date), [...new Set(g.map(y => y.matLabel).filter(Boolean))].join(', '), x.colLabel].filter(Boolean).join(' · '), img: img ? img.replace('width=1200', 'width=120') : '',
                    item: {data: {title: x.wLabel, date: wdYear(x.date), technique: [...new Set(g.map(y => y.matLabel).filter(Boolean))].join(', '), h: x.h || '', w: x.wd || '', location: x.colLabel || '', status: x.colLabel ? 'musee' : 'inconnu', inv: x.inv || '', link: x.w, photos: img ? [{u: img, k: 'recto'}] : []}}}; }), 'Les œuvres connues de Wikidata (souvent celles des musées).'); }
                else if (tab === 'release') { const r = (await remote({source: 'wikidata', what: 'albums', id: qid})).items, by = groupBy(r, 'a'); candList(res, by.map(g => { const x = g[0]; return {title: x.aLabel, sub: [wdYear(x.date), x.typeLabel, x.labelLabel].filter(Boolean).join(' · '),
                    full: async () => { if (x.discogs) { try { return await discogsItem('master', x.discogs); } catch (_) {} } return {data: {title: x.aLabel, year: wdYear(x.date), label: x.labelLabel || '', rtype: /single/i.test(x.typeLabel || '') ? 'single' : /EP/.test(x.typeLabel || '') ? 'ep' : 'album', link: x.a}}; }}; }), 'Les albums connus de Wikidata ; quand Discogs les connaît aussi, titres et éditions viennent de Discogs.'); }
                else { const r = (await remote({source: 'wikidata', what: 'films', id: qid})).items; candList(res, filmsFromWd(r), 'Filmographie de Wikidata (identifiants IMDb compris).'); }
            }),
            imdb: async (val, res) => { const nm = (val.match(/\b(nm\d{5,10})\b/) || [])[1]; if (!nm) throw new Error('Il faut l’adresse de la personne sur IMDb (…/name/nm…).'); await SEARCH.wd(nm, res); },
            tmdb: async (val, res) => { const key = keys().tmdb; if (!key) throw new Error('Il faut la clé TMDb (bouton 🔑 Clés). Sans clé : « Wikidata ».');
                const nm = (val.match(/\b(nm\d{5,10})\b/) || [])[1]; let people;
                if (nm) { const j = await remote({source: 'tmdb', what: 'find', id: nm, key}); people = j.person_results || []; } else people = (await remote({source: 'tmdb', what: 'search', q: val, key})).results || [];
                const go = async p => { const j = await remote({source: 'tmdb', what: 'credits', id: String(p.id), key}), map = new Map();
                    [...(j.cast || []).map(c => ({...c, job: 'acteur'})), ...(j.crew || []).map(c => ({...c, job: ({Director: 'réalisation', Screenplay: 'scénario', Writer: 'scénario', 'Original Music Composer': 'musique', Producer: 'production', Editor: 'montage', 'Director of Photography': 'image'})[c.job] || c.job}))].forEach(c => {
                        const k = `${c.media_type}${c.id}`, cur = map.get(k) || {c, jobs: new Set(), role: ''}; cur.jobs.add(c.job); if (c.character) cur.role = c.character; map.set(k, cur); });
                    candList(res, [...map.values()].map(({c, jobs, role}) => { const title = c.title || c.name || '', yr = yearOf(c.release_date || c.first_air_date), poster = c.poster_path ? `https://image.tmdb.org/t/p/w500${c.poster_path}` : '';
                        return {title, sub: [yr, [...jobs].join(', '), role && `rôle : ${role}`, c.media_type === 'tv' ? 'série' : ''].filter(Boolean).join(' · '), img: poster.replace('w500', 'w92'),
                            full: async () => { let m = {}; try { m = await remote({source: 'tmdb', what: c.media_type === 'tv' ? 'tv' : 'movie', id: String(c.id), key}); } catch (_) {}
                                return {data: {title, original: c.original_title || c.original_name || '', year: yr, fkind: c.media_type === 'tv' ? 'serie' : 'long', jobs: [...jobs].join(', '), role, synopsis: c.overview || m.overview || '', duration: m.runtime || '', country: (m.production_countries || []).map(x => x.name).join(', '), production: (m.production_companies || []).map(x => x.name).slice(0, 4).join(', '),
                                    director: (m.credits?.crew || []).filter(x => x.job === 'Director').map(x => x.name).join(', '), cast: (m.credits?.cast || []).slice(0, 12).map(x => `${x.name}${x.character ? ` (${x.character})` : ''}`).join(', '), imdb: m.imdb_id || m.external_ids?.imdb_id || '', tmdb: String(c.id), photos: poster ? [{u: poster, k: 'recto'}] : []}}; }}; }).sort((a, b) => String(a.sub).localeCompare(String(b.sub))));
                };
                if (people.length === 1) return go(people[0]); choose(res, people.map(p => ({...p, label: p.name, description: (p.known_for || []).map(k => k.title || k.name).slice(0, 3).join(', ')})), go, 'Quelle personne ?');
            },
            discogs: async (val, res) => { const m = val.match(/discogs\.com\/(?:[a-z]{2}\/)?(artist|master|release)\/(\d+)/i) || val.match(/^\[?([amr])(\d+)\]?$/i); if (!m) throw new Error('Colle l’adresse d’une page Discogs (artiste, album « master » ou disque « release »).');
                const type = {a: 'artist', m: 'master', r: 'release'}[m[1].toLowerCase()] || m[1].toLowerCase(), id = m[2];
                if (type !== 'artist') { const it = await discogsItem(type, id); return candList(res, [{title: it.data.title, sub: [it.data.year, it.data.format].filter(Boolean).join(' · '), item: it}]); }
                let page = 1, all = []; for (;;) { const j = await remote({source: 'discogs', what: 'artist', id, page, token: keys().discogs || ''}); all.push(...(j.releases || [])); if (!j.pagination || page >= j.pagination.pages || page >= 6) break; page++; await sleep(1100); }
                candList(res, all.map(r => ({title: r.title, sub: [r.year, r.type === 'master' ? 'album (toutes éditions)' : 'disque', r.format, r.label, r.role !== 'Main' ? r.role : ''].filter(Boolean).join(' · '), img: r.thumb || '', off: r.role !== 'Main',
                    full: async () => { await sleep(1300); return discogsItem(r.type === 'master' ? 'master' : 'release', String(r.id)); }})), 'Ses parutions sur Discogs (les participations sont décochées). Discogs limite le rythme : l’import prend un peu plus d’une seconde par disque.'); },
            discogs_search: async (val, res) => { const token = keys().discogs; const j = await remote({source: 'discogs', what: 'search', q: val, type: 'master', token: token || ''});
                candList(res, (j.results || []).map(r => ({title: r.title, sub: [r.year, (r.format || []).join(', '), (r.label || [])[0]].filter(Boolean).join(' · '), img: r.thumb || '', full: async () => { await sleep(1100); return discogsItem(r.type === 'master' ? 'master' : 'release', String(r.id)); }}))); },
            mb: async (val, res) => { const j = await remote({source: 'musicbrainz', what: 'search', q: val});
                choose(res, (j.artists || []).map(a => ({...a, label: a.name, description: [a.disambiguation, a.country, a['life-span']?.begin].filter(Boolean).join(' · ')})), async a => {
                    const g = await remote({source: 'musicbrainz', what: 'groups', id: a.id});
                    candList(res, (g['release-groups'] || []).map(rg => ({title: rg.title, sub: [yearOf(rg['first-release-date']), rg['primary-type'], ...(rg['secondary-types'] || [])].filter(Boolean).join(' · '), off: (rg['secondary-types'] || []).length > 0,
                        full: async () => mbItem(rg, a.name)})).sort((x, y) => String(x.sub).localeCompare(String(y.sub))), 'Ses albums, EP et singles sur MusicBrainz (compilations et live décochés). Pochettes : Cover Art Archive.'); }, 'Quel artiste ?'); },
            itunes: async (val, res) => { const j = await remote({source: 'itunes', what: 'search', q: val});
                candList(res, (j.results || []).filter(a => a.wrapperType === 'collection').map(a => ({title: a.collectionName, sub: [yearOf(a.releaseDate), a.artistName, a.primaryGenreName, `${a.trackCount} titres`].filter(Boolean).join(' · '), img: a.artworkUrl100 || '',
                    full: async () => { const t = await remote({source: 'itunes', what: 'album', id: String(a.collectionId)}), songs = (t.results || []).filter(s => s.wrapperType === 'track'), discs = new Set(songs.map(s => s.discNumber)).size;
                        return {data: {title: a.collectionName, artist: a.artistName, year: yearOf(a.releaseDate), released: (a.releaseDate || '').slice(0, 10), genre: a.primaryGenreName || '', rtype: /- (single|ep)$/i.test(a.collectionName) ? (/ep$/i.test(a.collectionName) ? 'ep' : 'single') : 'album', format: 'Numérique', notes: a.copyright || '',
                            tracks: songs.map(s => ({pos: discs > 1 ? `${s.discNumber}-${s.trackNumber}` : String(s.trackNumber), title: s.trackName, dur: msDur(s.trackTimeMillis)})), photos: a.artworkUrl100 ? [{u: a.artworkUrl100.replace(/100x100bb/, '1200x1200bb'), k: 'recto'}] : []}}; }})), 'Albums d’Apple Music (titres et durées ; pas les éditions physiques).'); },
            csv: async (val, res) => { if (!String(val || '').trim()) throw new Error('Colle d’abord les lignes du tableur (avec la ligne des titres).'); const rows = parseCsv(val); if (rows.length < 2) throw new Error('Il faut la ligne des titres de colonnes et au moins une ligne.');
                const head = rows[0].map(h => h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim());
                const MAP = [['inv', /^(n[°o]|num|inv|cote)/], ['catref', /catalogue|raisonne/], ['title', /^titre|title|nom de l/], ['date', /^date|annee|year/], ['technique', /technique|medium/], ['support', /support/], ['dimstr', /dimension|format|taille/], ['h', /^haut/], ['w', /^larg/], ['d', /^prof/], ['location', /lieu|localisation|emplacement|ou est/], ['owner', /proprietaire|owner|collection/], ['condition', /etat|condition/], ['value', /valeur|prix|estimation/], ['provenance', /provenance|historique/], ['exhibitions', /exposition/], ['signature', /signature|inscription/], ['series', /serie/], ['note', /note|remarque|commentaire/]];
                const idx = MAP.map(([k, re]) => [k, head.findIndex(h => re.test(h))]).filter(x => x[1] >= 0);
                if (!idx.some(x => x[0] === 'title')) throw new Error('Une colonne « Titre » est nécessaire.');
                candList(res, rows.slice(1).filter(r => r.some(Boolean)).map(r => { const data = {status: 'famille'}; idx.forEach(([k, i]) => { data[k] = (r[i] || '').trim(); });
                    if (data.dimstr) { const n = data.dimstr.replace(/,/g, '.').match(/\d+(\.\d+)?/g) || []; [data.h, data.w, data.d] = [n[0] || '', n[1] || '', n[2] || '']; delete data.dimstr; }
                    if (data.value) data.value = String(data.value).replace(/[^\d.,]/g, '').replace(',', '.');
                    const st = (data.location + ' ' + data.owner).toLowerCase(); if (/mus[ée]e|fonds|frac|bibl/.test(st)) data.status = 'musee'; else if (/vendu/.test(st)) data.status = 'vendu';
                    const c = (data.condition || '').toLowerCase(); data.condition = /[àa] restaurer|mauvais/.test(c) ? 'restaurer' : /restaur[ée]/.test(c) ? 'restaure' : /moyen/.test(c) ? 'moyen' : /bon|tr[eè]s bien/.test(c) ? 'bon' : '';
                    return {title: data.title || '(sans titre)', sub: [data.inv, data.date, data.technique].filter(Boolean).join(' · '), item: {data}}; }), `Colonnes reconnues : ${idx.map(x => x[0]).join(', ')}.`); },
        };
        const groupBy = (rows, k) => { const m = new Map(); rows.forEach(r => { if (!m.has(r[k])) m.set(r[k], []); m.get(r[k]).push(r); }); return [...m.values()]; };
        const olCand = d => ({title: d.title, sub: [d.first_publish_year, (d.author_name || []).join(', '), (d.publisher || [])[0]].filter(Boolean).join(' · '), img: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-S.jpg` : '',
            item: {data: {title: d.title, subtitle: d.subtitle || '', authors: (d.author_name || []).join(', '), year: String(d.first_publish_year || ''), publisher: (d.publisher || [])[0] || '', place: (d.publish_place || [])[0] || '', isbn: (d.isbn || []).find(x => x.length === 13) || (d.isbn || [])[0] || '', pages: String(d.number_of_pages_median || ''), lang: (d.language || []).join(', '), role: 'auteur', bkind: 'livre', link: d.key ? `https://openlibrary.org${d.key}` : '', photos: d.cover_i ? [{u: `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`, k: 'recto'}] : []}}});
        function filmsFromWd(rows) {
            const kindOf = t => /série|series/i.test(t) ? 'serie' : /court/i.test(t) ? 'court' : /documentaire|documentary/i.test(t) ? 'docu' : /téléfilm|television film/i.test(t) ? 'telefilm' : /clip|music video/i.test(t) ? 'clip' : 'long';
            return groupBy(rows, 'f').map(g => { const x = g[0], jobs = [...new Set(g.map(y => y.job))], role = [...new Set(g.map(y => y.roleLabel).filter(r => r && !/^Q\d+$/.test(r)))].join(', '), yr = wdYear(g.map(y => y.date).filter(Boolean).sort()[0]);
                return {title: x.fLabel, sub: [yr, jobs.join(', '), role && `rôle : ${role}`, x.typeLabel].filter(Boolean).join(' · '), y: Number(yr) || 9999,
                    item: {data: {title: x.fLabel, year: yr, jobs: jobs.join(', '), role, director: [...new Set(g.map(y => y.dirLabel).filter(Boolean))].join(', '), duration: x.dur ? String(Math.round(Number(x.dur))) : '', imdb: x.imdb || '', wikidata: x.f.split('/').pop(), fkind: kindOf(x.typeLabel || ''), link: x.imdb ? `https://www.imdb.com/title/${x.imdb}/` : x.f}}}; }).sort((a, b) => a.y - b.y);
        }
        async function discogsItem(type, id) {
            const token = keys().discogs || '', j = await remote({source: 'discogs', what: type, id: String(id), token});
            let rel = j, versions = [];
            if (type === 'master') { try { await sleep(1100); rel = j.main_release ? await remote({source: 'discogs', what: 'release', id: String(j.main_release), token}) : j; } catch (_) { rel = j; }
                try { await sleep(1100); versions = (await remote({source: 'discogs', what: 'versions', id: String(id), token})).versions || []; } catch (_) {} }
            const fmts = rel.formats || [], desc = fmts.flatMap(f => f.descriptions || []).join(' '), clean = n => String(n || '').replace(/\s\(\d+\)$/, '');
            const tracks = (j.tracklist || rel.tracklist || []).filter(t => t.type_ !== 'heading' && t.type_ !== 'index').map(t => ({pos: t.position || '', title: t.title || '', dur: t.duration || '', credits: (t.extraartists || []).map(a => `${a.role} : ${clean(a.name)}`).join(' · ')}));
            return {data: {title: j.title || rel.title, artist: (j.artists || rel.artists || []).map(a => clean(a.name)).join(', '), year: String(j.year || rel.year || ''), released: rel.released || '', label: (rel.labels || [])[0]?.name ? clean(rel.labels[0].name) : '', catno: (rel.labels || [])[0]?.catno || '',
                format: fmts.map(f => [Number(f.qty) > 1 ? `${f.qty} ×` : '', f.name, ...(f.descriptions || [])].filter(Boolean).join(' ')).join(' + '), country: rel.country || '', genre: (j.genres || rel.genres || []).join(', '), styles: (j.styles || rel.styles || []).join(', '),
                barcode: (rel.identifiers || []).find(x => x.type === 'Barcode')?.value || '', notes: rel.notes || j.notes || '', rtype: /Compilation/.test(desc) ? 'compil' : /\bEP\b/.test(desc) ? 'ep' : /Single|7"/.test(desc) ? 'single' : /Live/.test(desc) ? 'live' : 'album',
                credits: (rel.extraartists || []).map(a => ({role: a.role, name: clean(a.name)})), tracks,
                versions: versions.map(v => ({title: v.title !== (j.title || '') ? v.title : '', format: v.format || (v.major_formats || []).join(', '), label: clean(v.label), catno: v.catno || '', country: v.country || '', year: String(v.released || '').slice(0, 4), note: v.status && v.status !== 'Accepted' ? v.status : ''})),
                link: j.uri || rel.uri || `https://www.discogs.com/${type}/${id}`, photos: [...(j.images || []), ...(type === 'master' ? (rel.images || []).filter(im => !(j.images || []).some(x => x.uri === im.uri)) : [])].slice(0, 8).map((im, i) => ({u: im.uri, k: i === 0 ? 'recto' : im.type === 'primary' ? 'recto' : 'autre'})).filter(p => p.u)}};
        }
        async function mbItem(rg, artist) {
            await sleep(1100); const rs = ((await remote({source: 'musicbrainz', what: 'releases', id: rg.id})).releases || []).sort((a, b) => String(a.date || '9').localeCompare(String(b.date || '9')));
            const main = rs.find(r => r.status === 'Official') || rs[0]; let full = {};
            if (main) { await sleep(1100); full = await remote({source: 'musicbrainz', what: 'release', id: main.id}); }
            const discs = (full.media || []).length;
            return {data: {title: rg.title, artist, year: yearOf(rg['first-release-date']), released: rg['first-release-date'] || '', rtype: ({Album: 'album', EP: 'ep', Single: 'single'})[rg['primary-type']] || 'autre', label: (full['label-info'] || [])[0]?.label?.name || '', catno: (full['label-info'] || [])[0]?.['catalog-number'] || '',
                format: (full.media || []).map(m => m.format).filter(Boolean).join(' + '), country: full.country || '', barcode: full.barcode || '', link: `https://musicbrainz.org/release-group/${rg.id}`,
                tracks: (full.media || []).flatMap(m => (m.tracks || []).map(t => ({pos: discs > 1 ? `${m.position}-${t.number}` : String(t.number), title: t.title, dur: msDur(t.length)}))),
                versions: rs.map(r => ({title: r.title !== rg.title ? r.title : '', format: (r.media || []).map(m => m.format).filter(Boolean).join(' + '), label: (r['label-info'] || [])[0]?.label?.name || '', catno: (r['label-info'] || [])[0]?.['catalog-number'] || '', country: r.country || '', year: String(r.date || '').slice(0, 4), barcode: r.barcode || '', note: r.status && r.status !== 'Official' ? r.status : ''})),
                photos: [{u: `https://coverartarchive.org/release-group/${rg.id}/front-500`, k: 'recto'}]}};
        }
        const parseCsv = txt => { const lines = String(txt).replace(/\r/g, '').split('\n').filter(l => l.trim()); const sep = (lines[0].match(/\t/g) || []).length ? '\t' : (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
            return lines.map(l => { const out = []; let cur = '', inq = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (inq) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') inq = false; else cur += ch; } else if (ch === '"') inq = true; else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; }); };

        // ouverture
        if (opts.item) { const it = items.find(i => i.id === opts.item); if (it) { tab = it.kind; view = it.kind === 'release' ? {item: it, mode: 'read'} : {item: it, mode: 'edit'}; } }
        paint();
        if (opts.add) dlg.querySelector('[data-ar-cmd="add"]')?.click();
        if (opts.importNow) openImport();
    }
    ext.artistCatalog = {open: openCatalog, KINDS, FIELDS};
})();
