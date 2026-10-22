/* LCNDA — 🎨 Catalogues d'artistes : les IMPORTS (Discogs, MusicBrainz, Apple Music, Open Library, Wikidata, IMDb, TMDb,
 * un tableau d'inventaire collé, un fichier exporté d'ici). Les demandes passent par le serveur (lib/artist_catalog.php,
 * artist_remote) : adresses construites à partir d'identifiants vérifiés. Les clés personnelles (jeton Discogs, clé TMDb)
 * restent dans ce navigateur (genealogie-artist-keys).
 * Discogs : rôles traduits en français, crédits par piste (extraartists[].tracks), intertitres, matrice / runout et autres
 * identifiants, date de sortie à la française, format et genre de l'édition choisie.
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART; if (!ART) return;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const U = ART.util, esc = U.esc, clone = U.clone;
    const toast = (...a) => A().toast(...a);
    const post = async (action, body) => (await A().api(action, {}, {method: 'POST', body})).result;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const readJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch (_) { return d; } };
    const writeJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const KEYS = 'genealogie-artist-keys', keys = () => readJ(KEYS, {});
    const yearOf = v => (String(v || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/) || [])[1] || '';
    const msDur = ms => ms ? U.hms(Math.round(ms / 1000)) : '';
    const sameKey = it => `${it.kind}|${String(it.data?.title || it.title || '').toLowerCase().replace(/\W+/g, '')}|${yearOf(it.data?.year || it.data?.date || it.data?.released || it.year)}`;
    const remote = q2 => post('artist_remote', q2);

    /* — Discogs : les rôles en français — */
    const ROLES = {'vocals': 'Chant', 'lead vocals': 'Chant', 'backing vocals': 'Chœurs', 'chorus': 'Chœurs', 'guitar': 'Guitare', 'acoustic guitar': 'Guitare acoustique', 'electric guitar': 'Guitare électrique', 'bass': 'Basse', 'bass guitar': 'Basse', 'double bass': 'Contrebasse',
        'drums': 'Batterie', 'percussion': 'Percussions', 'piano': 'Piano', 'keyboards': 'Claviers', 'organ': 'Orgue', 'accordion': 'Accordéon', 'violin': 'Violon', 'cello': 'Violoncelle', 'saxophone': 'Saxophone', 'trumpet': 'Trompette', 'trombone': 'Trombone', 'clarinet': 'Clarinette', 'flute': 'Flûte', 'harmonica': 'Harmonica', 'banjo': 'Banjo', 'harp': 'Harpe',
        'orchestra': 'Orchestre', 'conductor': 'Direction d’orchestre', 'arranged by': 'Arrangements', 'orchestrated by': 'Orchestration', 'producer': 'Production', 'produced by': 'Production', 'executive-producer': 'Production exécutive', 'co-producer': 'Coproduction',
        'written-by': 'Écrit par', 'written by': 'Écrit par', 'lyrics by': 'Paroles', 'words by': 'Paroles', 'music by': 'Musique', 'composed by': 'Composition', 'songwriter': 'Auteur-compositeur', 'adapted by': 'Adaptation', 'translated by': 'Traduction',
        'engineer': 'Ingénieur du son', 'recorded by': 'Prise de son', 'recording by': 'Prise de son', 'mixed by': 'Mixage', 'mastered by': 'Mastering', 'remastered by': 'Remastering', 'lacquer cut by': 'Gravure', 'edited by': 'Montage',
        'photography by': 'Photo', 'photography': 'Photo', 'design': 'Conception graphique', 'artwork': 'Illustration', 'artwork by': 'Illustration', 'illustration': 'Illustration', 'cover': 'Pochette', 'liner notes': 'Texte de pochette', 'layout': 'Mise en page',
        'performer': 'Interprète', 'featuring': 'Avec', 'presenter': 'Présentation', 'narrator': 'Récitant', 'directed by': 'Réalisation', 'management': 'Management', 'publisher': 'Éditeur', 'copyright (c)': 'Copyright', 'phonographic copyright (p)': 'Producteur phonographique', 'distributed by': 'Distribution', 'pressed by': 'Pressage', 'manufactured by': 'Fabrication', 'recorded at': 'Enregistré à', 'mixed at': 'Mixé à', 'mastered at': 'Masterisé à'};
    const role = r => String(r || '').split(/\s*,\s*/).map(x => { const k = x.replace(/\s*\[.*?\]\s*/g, '').trim(); return ROLES[k.toLowerCase()] || k; }).join(', ');
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    /** « 1958-03-00 » → « mars 1958 » ; « 1958-03-12 » → « 12 mars 1958 » */
    const frDate = s => { const m = String(s || '').match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/); if (!m) return String(s || ''); const mo = Number(m[2] || 0), d = Number(m[3] || 0); return mo ? `${d ? `${d === 1 ? '1er' : d} ` : ''}${MONTHS[mo - 1]} ${m[1]}` : m[1]; };
    ART.discogsRole = role; ART.frDate = frDate;
    let STORE = null;
    /** l'artiste crédité : la fiche de l'artiste si c'est son nom, sinon un nom sans fiche */
    const artistRef = n => { n = String(n || '').trim(); if (!n) return null; const me = STORE?.name || '', fold = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, ''); return fold(n) === fold(me) || fold(n.split(' ').reverse().join(' ')) === fold(me) ? {pid: STORE.pid, title: me} : {pname: n}; };
    function tidy(kind, d) { if (typeof d.artist === 'string') d.artist = artistRef(d.artist); if (typeof d.director === 'string' && d.director) d.director = {pname: d.director}; if (typeof d.label === 'string' && d.label) d.label = {txt: d.label}; if (typeof d.publisher === 'string' && d.publisher) d.publisher = {txt: d.publisher}; try { ART.defs[kind]?.upgrade?.(d); } catch (_) {} }
    async function discogsItem(type, id) {
        const token = keys().discogs || '', j = await remote({source: 'discogs', what: type, id: String(id), token});
        let rel = j, versions = [];
        if (type === 'master') { try { await sleep(1100); rel = j.main_release ? await remote({source: 'discogs', what: 'release', id: String(j.main_release), token}) : j; } catch (_) { rel = j; }
            try { await sleep(1100); versions = (await remote({source: 'discogs', what: 'versions', id: String(id), token})).versions || []; } catch (_) {} }
        const fmts = rel.formats || [], desc = fmts.flatMap(f => f.descriptions || []).join(' '), clean = n => String(n || '').replace(/\s\(\d+\)$/, '');
        // crédits : ceux qui valent pour certaines pistes (extraartists[].tracks) vont avec ces pistes ; les autres, au disque
        const extra = (rel.extraartists || j.extraartists || []).map(a => ({role: role(a.role), pname: clean(a.anv || a.name), tracks: String(a.tracks || '').trim()}));
        const posIn = (spec, pos) => { if (!spec) return false; return spec.split(/\s*,\s*/).some(p => { const r = p.match(/^(\S+)\s+(?:to|à)\s+(\S+)$/i); if (!r) return p.toUpperCase() === String(pos).toUpperCase(); const all = (rel.tracklist || j.tracklist || []).map(t => String(t.position).toUpperCase()), a = all.indexOf(r[1].toUpperCase()), b = all.indexOf(r[2].toUpperCase()), i = all.indexOf(String(pos).toUpperCase()); return a >= 0 && b >= 0 && i >= a && i <= b; }); };
        const tracks = (rel.tracklist || j.tracklist || []).filter(t => t.type_ !== 'index').map(t => t.type_ === 'heading' ? {heading: true, title: t.title || '', pos: ''} : ({pos: t.position || '', title: t.title || '', dur: t.duration || '',
            credits: [...(t.extraartists || []).map(a => ({role: role(a.role), pname: clean(a.anv || a.name)})), ...extra.filter(c => c.tracks && posIn(c.tracks, t.position)).map(c => ({role: c.role, pname: c.pname}))]}));
        const ids = rel.identifiers || [], mx = ids.filter(x => /Matrix|Runout/i.test(x.type));
        const label0 = (rel.labels || [])[0];
        return {kind: 'release', data: {title: j.title || rel.title, artist: artistRef((j.artists || rel.artists || []).map(a => clean(a.anv || a.name)).join(', ')), year: String(rel.year || j.year || ''), released: frDate(rel.released || ''),
            label: label0?.name ? {txt: clean(label0.name)} : null, catno: label0?.catno || '',
            format: fmts.map(f => [Number(f.qty) > 1 ? `${f.qty} ×` : '', f.name, ...(f.descriptions || []), f.text || ''].filter(Boolean).join(' · ')).join(' + '), country: rel.country || '',
            genre: (rel.genres || j.genres || []).join(', '), styles: (rel.styles || j.styles || []).join(', '),
            barcode: ids.find(x => x.type === 'Barcode')?.value || '', matrix_a: mx[0]?.value || '', matrix_b: mx[1]?.value || '',
            runout: ids.filter(x => x.type !== 'Barcode' && !mx.slice(0, 2).includes(x)).map(x => ({type: x.type, value: x.value, note: x.description || ''})),
            notes: rel.notes || j.notes || '', rtype: /Compilation/.test(desc) ? 'compil' : /\bEP\b/.test(desc) ? 'ep' : /Single|7"/.test(desc) ? 'single' : /Live/.test(desc) ? 'live' : 'album',
            credits: extra.filter(c => !c.tracks).map(c => ({role: c.role, pname: c.pname})), tracks, discogs: type === 'master' ? `r${rel.id || ''}` : `r${id}`,
            versions: versions.map(v => ({title: v.title !== (j.title || '') ? v.title : '', format: v.format || (v.major_formats || []).join(', '), label: clean(v.label), catno: v.catno || '', country: v.country || '', year: String(v.released || '').slice(0, 4), note: v.status && v.status !== 'Accepted' ? v.status : ''})),
            link: rel.uri || j.uri || `https://www.discogs.com/${type}/${id}`,
            photos: [...(rel.images || []), ...(type === 'master' ? (j.images || []).filter(im => !(rel.images || []).some(x => x.uri === im.uri)) : [])].slice(0, 8).map((im, i) => ({u: im.uri, k: i === 0 ? 'recto' : i === 1 ? 'verso' : 'autre'})).filter(p => p.u)}};
    }
    ART.discogsItem = discogsItem;

    ART.editKeys = () => { const toastX = toast;
            const k = keys();
            ext.openDialog({eyebrow: 'IMPORTS', title: '🔑 Clés personnelles', submitLabel: 'Enregistrer', body: `<p class="muted">Facultatives. Elles restent dans ce navigateur et ne servent qu’aux imports.</p>
                <label>Jeton Discogs (pour chercher par nom ; sans lui, colle l’adresse d’une page Discogs)<input name="discogs" value="${esc(k.discogs || '')}" autocomplete="off" placeholder="discogs.com → Paramètres → Développeurs → Générer un jeton"></label>
                <label>Clé TMDb (filmographies avec affiches)<input name="tmdb" value="${esc(k.tmdb || '')}" autocomplete="off" placeholder="themoviedb.org → Paramètres → API (clé v3, 32 caractères)"></label>`,
                onSubmit: f => { writeJ(KEYS, {discogs: f.elements.discogs.value.trim(), tmdb: f.elements.tmdb.value.trim()}); toast('Clés enregistrées.'); }});
    };

    ART.openImport = (C, kind0) => {
        STORE = C.store; const pid = C.pid; let tab = kind0;
        function openImport() {
            const SRC0 = {book: [['ol_isbn', 'Open Library : un ISBN'], ['ol_author', 'Open Library : tous les livres d’un auteur'], ['ol_subject', 'Open Library : livres sur un sujet'], ['wd', 'Wikidata : œuvres écrites']],
                work: [['wd', 'Wikidata : œuvres de l’artiste (avec images des musées)'], ['csv', 'Un tableau d’inventaire (copier-coller d’un tableur)']],
                release: [['discogs', 'Discogs : adresse d’un artiste, d’un album ou d’un disque'], ['discogs_search', 'Discogs : chercher par nom (jeton)'], ['mb', 'MusicBrainz (libre, sans clé)'], ['itunes', 'Apple Music (iTunes)'], ['wd', 'Wikidata : albums']],
                film: [['wd', 'Wikidata (relie aux fiches IMDb)'], ['imdb', 'Une adresse IMDb de la personne (nm…)'], ['tmdb', 'TMDb (clé ; affiches)']]};
            const SRC = [...(SRC0[tab] || []), ['file', 'Un fichier exporté d’ici (💾 Fichier, ou l’ancienne « Sauvegarde JSON »)']];
            const name = C.store.name;
            ext.openDialog({eyebrow: `IMPORTER · ${String(ART.defs[tab]?.many || '').toUpperCase()}`, title: '⤒ Importer', wide: true, submitLabel: 'Importer la sélection',
                body: `<div class="ar-imp"><label>Source<select data-src>${SRC.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
                    <div class="ar-impq"><input data-iq value="${esc(name)}" placeholder="Nom, adresse, ISBN…"><button type="button" class="button small" data-go>Chercher</button></div><p class="muted" data-help></p>
                    <div data-res class="ar-res"></div><label class="checkbox-line"><input type="checkbox" data-imgs checked> Rapatrier les images (pochettes, affiches, couvertures) dans les médias de la fiche</label><label class="checkbox-line"><input type="checkbox" data-nodup checked> Ne pas doubler ce qui est déjà au catalogue (même titre, même année)</label><p class="muted" data-prog></p></div>`,
                onOpen: dg => {
                    const src = dg.querySelector('[data-src]'), iq = dg.querySelector('[data-iq]'), res = dg.querySelector('[data-res]'), help = dg.querySelector('[data-help]');
                    const HELP = {ol_isbn: 'L’ISBN (10 ou 13 chiffres) est au dos du livre.', ol_author: 'Le nom de l’auteur tel qu’il est publié.', ol_subject: 'Un sujet ou un nom : les livres qui en parlent.', wd: 'Le nom de l’artiste, ou l’adresse de sa page Wikidata (Q…).', csv: 'Copie les lignes de ton tableur (avec la ligne des titres de colonnes : N°, Titre, Date, Technique, Dimensions, Lieu, Propriétaire, État, Valeur…) et colle-les ci-dessous.',
                        discogs: 'Ex. https://www.discogs.com/artist/123456-Nom, …/master/…, …/release/…', discogs_search: 'Le nom de l’artiste ou de l’album (il faut le jeton : bouton 🔑 Clés).', mb: 'Le nom de l’artiste.', itunes: 'Le nom de l’artiste (et éventuellement de l’album).', imdb: 'Ex. https://www.imdb.com/name/nm0000123/ — la filmographie vient de Wikidata (et de TMDb si la clé est donnée).', tmdb: 'Le nom, ou l’adresse IMDb (nm…).', file: 'Un fichier fait avec « ⤓ Exporter ▾ » → « 💾 Fichier » (ici ou sur un autre ordinateur), ou l’ancienne « Sauvegarde JSON ».'};
                    const setHelp = () => { help.textContent = HELP[src.value] || ''; const cur = dg.querySelector('[data-iq]') || dg.querySelector('.ar-csv');
                        if (src.value === 'csv' && !cur.matches('.ar-csv')) cur.replaceWith(Object.assign(document.createElement('textarea'), {rows: 8, className: 'ar-csv'}));
                        else if (src.value !== 'csv' && cur.matches('.ar-csv')) { const i = Object.assign(document.createElement('input'), {placeholder: 'Nom, adresse, ISBN…'}); i.dataset.iq = ''; cur.replaceWith(i); }
                        dg.querySelector('[data-go]').textContent = src.value === 'csv' ? 'Lire le tableau' : src.value === 'file' ? '📁 Choisir le fichier…' : 'Chercher'; const iqq = dg.querySelector('[data-iq]'); if (iqq) iqq.hidden = src.value === 'file'; };
                    src.addEventListener('change', () => { res.innerHTML = ''; res._cands = []; setHelp(); }); setHelp();
                    dg.querySelector('[data-go]').addEventListener('click', async () => { const val = (dg.querySelector('[data-iq]') || dg.querySelector('.ar-csv')).value.trim(); res.innerHTML = '<p class="muted">Recherche…</p>';
                        try { await SEARCH[src.value](val, res); } catch (er) { res.innerHTML = `<p class="error-text">${esc(er.message)}</p>`; } });
                    res.addEventListener('click', async ev => { const b = ev.target.closest('[data-pick]'); if (!b) return; res.innerHTML = '<p class="muted">Chargement…</p>'; try { await res._pick(Number(b.dataset.pick), res); } catch (er) { res.innerHTML = `<p class="error-text">${esc(er.message)}</p>`; } });
                    res.addEventListener('change', ev => { if (ev.target.matches('[data-all]')) res.querySelectorAll('[data-cand]').forEach(c => { c.checked = ev.target.checked; }); });
                },
                onSubmit: async f => {
                    const res = f.querySelector('[data-res]'), cands = res._cands || [], chosen = [...res.querySelectorAll('[data-cand]:checked')].map(c => cands[Number(c.dataset.cand)]).filter(Boolean);
                    if (!chosen.length) return window.LCNDA_UI.fail(res.querySelector('[data-cand]'), 'Coche ce qu’il faut importer.');
                    const prog = f.querySelector('[data-prog]'), imgs = f.querySelector('[data-imgs]').checked, nodup = f.querySelector('[data-nodup]').checked, have = new Set(C.store.items.map(sameKey));
                    let extra; try { extra = await ART.needArtist(C.store, tab); } catch (_) { return false; }
                    let done = 0, skipped = 0; const out = [];
                    for (const c of chosen) {
                        prog.textContent = `${done + skipped + 1} / ${chosen.length} : ${c.title || ''}…`;
                        let it; try { it = c.full ? await c.full() : clone(c.item); } catch (er) { toast(`${c.title} : ${er.message}`, 'error'); continue; }
                        if (!it) continue; it.data.title = String(it.data.title || c.title || '').trim() || 'Sans titre';
                        const kind = it.kind || tab; tidy(kind, it.data); if (nodup && have.has(sameKey({kind, data: it.data}))) { skipped++; continue; }
                        if (imgs) { const ph = []; for (const p of ART.arr(it.data.photos).slice(0, 8)) { if (!p.u) { ph.push(p); continue; } try { const r = await post('artist_fetch_image', {person_id: pid, url: p.u, title: it.data.title}); ph.push({mid: r.id, f: r.filename, k: p.k, c: p.c || ''}); } catch (_) { ph.push(p); } } it.data.photos = ph; } // pas rapatriée : l'adresse reste, « ↻ Réessayer de rapatrier » dans le formulaire
                        out.push({kind, data: it.data}); have.add(sameKey({kind, data: it.data})); done++;
                        if (out.length >= 20) { await ART.write('save_items', {person_id: pid, items: out.splice(0), ...extra}); }
                    }
                    if (out.length) await ART.write('save_items', {person_id: pid, items: out, ...extra});
                    await C.reload(); C.paint(true); toast(`${A().plural(done, 'importé')}${skipped ? `, ${A().plural(skipped, 'déjà présent', 'déjà présents')}` : ''}.`);
                }});
        }
        // la liste à cocher des candidats
        const candList = (res, cands, note = '') => { res._cands = cands; res.innerHTML = cands.length ? `${note ? `<p class="muted">${esc(note)}</p>` : ''}<label class="checkbox-line"><input type="checkbox" data-all checked> Tout cocher (${cands.length})</label><div class="ar-cands">${cands.map((c, i) => `<label class="checkbox-line"><input type="checkbox" data-cand="${i}" ${c.off ? '' : 'checked'}>${c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy">` : ''}<span><b>${esc(c.title)}</b> <small class="muted">${esc(c.sub || '')}</small></span></label>`).join('')}</div>` : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🔍</span><span class="empty-line-text">Rien trouvé.</span></p>'; };
        const choose = (res, rows, onPick, note = 'Lequel ?') => { res._pick = i => onPick(rows[i]); res.innerHTML = `<p class="muted">${esc(note)}</p>${rows.map((r, i) => `<button type="button" class="ar-choice" data-pick="${i}"><b>${esc(r.label)}</b> <small class="muted">${esc(r.description || '')}</small></button>`).join('') || '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🔍</span><span class="empty-line-text">Rien trouvé.</span></p>'}`; };
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
            file: async (val, res) => { const file = await new Promise(ok => { const i = Object.assign(document.createElement('input'), {type: 'file', accept: '.json,application/json', hidden: true}); i.dataset.uiOff = '1'; document.body.appendChild(i); i.addEventListener('change', () => { ok(i.files?.[0] || null); i.remove(); }); i.addEventListener('cancel', () => { ok(null); i.remove(); }); i.click(); }); if (!file) { res.innerHTML = ''; return; }
                let j = null; try { j = JSON.parse(await file.text()); } catch (_) {} if (!j || !Array.isArray(j.items)) throw new Error('Ce fichier n’est pas un export du catalogue (💾 Fichier).');
                const list = j.items.map(x => x && typeof x === 'object' ? (x.data && typeof x.data === 'object' ? {kind: x.kind || j.kind, data: x.data} : {kind: j.kind, data: x}) : null).filter(x => x && ART.defs[x.kind] && x.kind !== 'profile');
                candList(res, list.map(x => ({title: x.data.title || 'Sans titre', sub: [ART.defs[x.kind].label, U.yearOf(x.data.year || x.data.date || x.data.released)].filter(Boolean).join(' · '), item: {kind: x.kind, data: x.data}})), `${U.plural(list.length, 'fiche')} dans « ${file.name} ».`); },
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
        const parseCsv = txt => { const SH = window.LCNDA_SHEET; if (SH?.parseCSV) { const t0 = String(txt).replace(/^\ufeff/, ''), first = t0.split(/\r?\n/).find(l => l.trim()) || ''; const sep = (first.match(/\t/g) || []).length ? '\t' : (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ','; return SH.parseCSV(t0, {sep}).filter(r => r.some(c => String(c).trim())); } // le lecteur commun (guillemets, retours dans une case)
            const lines = String(txt).replace(/\r/g, '').split('\n').filter(l => l.trim()); const sep = (lines[0].match(/\t/g) || []).length ? '\t' : (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
            return lines.map(l => { const out = []; let cur = '', inq = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (inq) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') inq = false; else cur += ch; } else if (ch === '"') inq = true; else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; }); };
        openImport();
    };
})();
