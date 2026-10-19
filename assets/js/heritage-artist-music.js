/* LCNDA — 🎨 Catalogues d'artistes : la MUSIQUE (définitions pour le moteur heritage-artist.js).
 * Comme MusicBrainz / Discogs : Morceau (l'œuvre écrite) → Enregistrements (prise, mixage, remaster, version, en public ;
 * chacun peut venir d'un autre) → Pistes de chaque Parution (disque : album, single, compilation, réédition), regroupées en
 * Album (toutes éditions) → Exemplaire. Plus les concerts et tournées.
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART; if (!ART?.define) return;
    const U = ART.util, esc = U.esc;
    const REL_TYPES = [['album', 'Album'], ['ep', 'EP, maxi'], ['single', 'Single, 45 tours'], ['compil', 'Compilation'], ['live', 'En public (live)'], ['bo', 'Bande originale'], ['coffret', 'Coffret'], ['reedition', 'Réédition'], ['participation', 'Participation'], ['autre', 'Autre']];
    const GOLDMINE = [['', '—'], ['M', 'Neuf (M)'], ['NM', 'Presque neuf (NM)'], ['VG+', 'Très bon (VG+)'], ['VG', 'Bon (VG)'], ['G+', 'Assez bon (G+)'], ['G', 'Moyen (G)'], ['F', 'Passable (F)'], ['P', 'Mauvais (P)']];
    const PHOTO_KINDS = [['recto', 'Recto'], ['verso', 'Verso'], ['disque', 'Rond central'], ['face_a', 'Face A'], ['face_b', 'Face B'], ['livret', 'Livret'], ['matrice', 'Matrice'], ['interieur', 'Intérieur'], ['autre', 'Autre']];
    const REC_KINDS = [['prise', 'Prise'], ['mixage', 'Mixage'], ['remaster', 'Remaster'], ['version', 'Version'], ['public', 'En public']];
    const REC_ICON = {prise: '🎙', mixage: '🎚', remaster: '✨', version: '✂', public: '🎤'};
    const lab = (l, k) => (l.find(x => x[0] === k) || [, k || ''])[1];
    ART.MUSIC = {REL_TYPES, GOLDMINE, REC_KINDS, REC_ICON};
    const discogsHref = v => { const m = String(v).match(/^\[?([rm])?(\d+)\]?$/i); return m ? `https://www.discogs.com/${(m[1] || 'r').toLowerCase() === 'm' ? 'master' : 'release'}/${m[2]}` : /^https:/.test(v) ? v : ''; };
    const mbHref = v => /^[0-9a-f-]{36}$/i.test(String(v)) ? `https://musicbrainz.org/release/${v}` : /^https:/.test(v) ? v : '';

    /* ═════════ 💿 Disque (une parution) — maquette A ═════════ */
    ART.define({key: 'release', icon: '💿', label: 'Disque', many: 'Disques', domain: 'music', parentField: 'master',
        eyebrow: it => { const d = it.data || {}, f = String(d.format || ''); const speed = /45\s*t/i.test(f) ? '45 tours' : /33\s*t/i.test(f) ? '33 tours' : /78\s*t/i.test(f) ? '78 tours' : /\bCD\b/i.test(f) ? 'CD' : ''; const rt = lab(REL_TYPES, d.rtype || ''); return ['Disque', speed ? `${speed}${d.rtype === 'ep' ? ' (EP)' : ''}` : rt].filter(Boolean).join(' · '); },
        heading: (ctx, it) => { const d = it.data || {}; const a = U.nameOf(d.artist); return `<h2 class="ar-h2">${esc(a ? `${a} – ` : '')}${esc(it.title || d.title)}${it.year ? ` <small>· ${esc(it.year)}</small>` : ''}</h2>`; },
        crumbExtra: (ctx, it) => { const m = U.ref(it.data?.master); if (!m?.iid) return ''; const n = ctx.store.linksTo(m.iid, 'master').length; return ` · fait partie de l’album « <button type="button" class="ar-linkbtn u" data-ar-open="${m.iid}">${esc(m.title)} (toutes éditions)</button> »${n > 1 ? ` · ${esc(U.plural(n, 'édition'))}` : ''}`; },
        cardLine: it => [it.year, {album: 'LP', ep: 'EP', single: 'single', live: 'live', bo: 'B.O.', coffret: 'coffret', reedition: 'réédition'}[it.data?.rtype] || (/(\d+)\s*×\s*CD/.exec(it.data?.format || '') || [])[0]?.replace('×', '').replace(/\s+/g, ' ') || lab(REL_TYPES, it.data?.rtype)].filter(Boolean).join(' · '),
        newData: store => ({rtype: 'album', artist: {pid: store.pid, title: store.name}}),
        groups: [
            {key: 'parution', label: 'Parution', zone: 'main', fields: [
                {key: 'title', label: 'Titre', type: 'text', star: true, head: true},
                {key: 'artist', label: 'Artiste crédité', type: 'person', star: true, head: true, roleWord: 'artiste'},
                {key: 'label', label: 'Label · n° de catalogue', short: 'Label', type: 'item', kinds: ['org'], star: true, join: {key: 'catno', sep: ' – ', small: '(n° de catalogue)'}},
                {key: 'catno', label: 'N° de catalogue', type: 'text', star: true},
                {key: 'format', label: 'Format et détails', short: 'Format', type: 'text', star: true, ph: 'Vinyle · 7″ · 45 tours · EP · Mono'},
                {key: 'country', label: 'Pays', type: 'text', star: true},
                {key: 'released', label: 'Sortie', type: 'date', star: true},
                {key: 'genre', label: 'Genre', type: 'text', star: true, join: {key: 'styles', sep: ' · ', lab: 'Style :'}},
                {key: 'styles', label: 'Style', type: 'text', star: true},
                {key: 'rtype', label: 'Sorte de parution', type: 'select', choices: REL_TYPES, star: false},
                {key: 'studio', label: 'Studio', type: 'place', star: true},
                {key: 'master', label: 'Album (toutes éditions)', short: 'Album', type: 'item', kinds: ['master'], star: false},
                {key: 'year', label: 'Année', type: 'number', star: false}]},
            {key: 'tracks', label: 'Pistes et crédits', zone: 'main', fields: [
                {key: 'tracks', label: 'Pistes (avec durées)', secLabel: 'Pistes', type: 'rows', view: 'tracks', star: true, addLabel: 'Une piste', focus: 'title', paste: 'Coller une liste de titres…', unitWord: 'titre',
                    cols: [{key: 'pos', label: 'N°', w: 's', ph: 'A1'}, {key: 'title', label: 'Titre', w: 'l'}, {key: 'dur', label: 'Durée', w: 's', ph: '3:45'}, {key: 'rec', label: 'Enregistrement (prise, mixage…)', type: 'item', kinds: ['recording'], w: 'm'}, {key: 'heading', label: 'Intertitre', type: 'bool', w: 's'}],
                    more: [{key: 'credits', label: 'Crédits de la piste', type: 'people'}, {key: 'lyrics', label: 'Paroles'}, {key: 'notes', label: 'Notes, annotations'}], moreLabel: 'Crédits, paroles, notes de la piste',
                    blank: n => ({pos: String(n + 1)}), onPaste: (C, fld, f) => pasteTracks(C, fld, f)},
                {key: 'credits', label: 'Crédits du disque', secLabel: 'Crédits', type: 'people', view: 'credits', star: true, scope: 'pistes (B1…)', addLabel: 'Un crédit', roleWord: 'crédit'},
                {key: 'lyrics_all', label: 'Paroles', type: 'longtext', star: false}]},
            {key: 'editions', label: 'Éditions et pressages', zone: 'main', fields: [
                {key: 'versions', label: 'Éditions et pressages', type: 'rows', view: 'editions', star: true, addLabel: 'Une édition',
                    cols: [{key: 'title', label: 'Titre (si différent)', w: 'm'}, {key: 'format', label: 'Format', w: 'm'}, {key: 'label', label: 'Label', w: 'm'}, {key: 'catno', label: 'N°', w: 's'}, {key: 'country', label: 'Pays', w: 's'}, {key: 'year', label: 'Année', w: 's'}, {key: 'rel', label: 'Sa fiche', type: 'item', kinds: ['release'], w: 'm'}, {key: 'note', label: 'Note', w: 'm'}]}]},
            {key: 'photos', label: 'Photos', zone: 'left', fields: [{key: 'photos', label: 'Photos (recto, verso, rond central, livret, matrice…)', type: 'photos', star: true, labels: PHOTO_KINDS, pickTitle: 'Les photos du disque'}]},
            {key: 'copy', label: 'Mon exemplaire (collection)', icon: '📦', zone: 'left', fields: [
                {key: 'cond_disc', label: 'Disque', type: 'select', choices: GOLDMINE, star: true, help: '(échelle Goldmine)'},
                {key: 'cond_sleeve', label: 'Pochette', type: 'text', star: true, ph: 'Bon (G+) · coin corné'},
                {key: 'shelf', label: 'Rangé', type: 'text', star: true, ph: 'Grenier, caisse n° 3'},
                {key: 'paid', label: 'Payé', type: 'text', star: true, ph: '12 € · brocante 2019'},
                {key: 'value', label: 'Valeur', type: 'money', star: true, join: {key: 'value_date', sep: ' ', small: ''}},
                {key: 'value_date', label: 'Valeur estimée le', type: 'date', star: true},
                {key: 'dedication', label: 'Dédicace', type: 'text', star: true, join: {key: 'dedicatee', sep: ' · '}},
                {key: 'dedicatee', label: 'Dédicacé à', type: 'person', star: true, roleWord: 'dédicace'},
                // en double, en triple… : les autres exemplaires, chacun avec son état, sa place, son prix
                {key: 'copies', label: 'Autres exemplaires (double, triple…)', type: 'rows', star: true, addLabel: 'Un exemplaire de plus',
                    cols: [{key: 'cond_disc', label: 'Disque', type: 'select', choices: GOLDMINE, w: 's'}, {key: 'cond_sleeve', label: 'Pochette', w: 'm'}, {key: 'edition', label: 'Édition / pressage', w: 'm'}, {key: 'shelf', label: 'Rangé', w: 'm'}, {key: 'paid', label: 'Payé', w: 's'}, {key: 'value', label: 'Valeur', type: 'money', w: 's'}, {key: 'dedication', label: 'Dédicace', w: 'm'}, {key: 'note', label: 'Note', w: 'm'}]}]},
            {key: 'ids', label: 'Identifiants et liens', icon: '🔢', zone: 'right', fields: [
                {key: 'barcode', label: 'Code-barres', type: 'text', star: false},
                {key: 'matrix_a', label: 'Matrice face A', type: 'text', star: false},
                {key: 'matrix_b', label: 'Matrice face B', type: 'text', star: false},
                {key: 'runout', label: 'Matrice / runout, autres identifiants', type: 'rows', star: false, cols: [{key: 'type', label: 'Sorte'}, {key: 'value', label: 'Valeur', w: 'l'}, {key: 'note', label: 'Note'}]},
                {key: 'sacem', label: 'SACEM', type: 'text', star: false, ph: 'BIEM, SACEM…'},
                {key: 'discogs', label: 'Discogs', type: 'ident', href: discogsHref, star: true, ph: 'r4012233'},
                {key: 'musicbrainz', label: 'MusicBrainz', type: 'ident', href: mbHref, star: true},
                {key: 'link', label: 'Lien', type: 'url', star: false}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        list: ['photos', 'title', 'released', 'rtype', 'label', 'catno', 'format', 'country'], card: ['released', 'rtype', 'format'], export: ['photos', 'title', 'artist', 'released', 'label', 'catno', 'format', 'country', 'genre', 'tracks', 'credits', 'versions', 'notes'],
        filters: store => [{id: 'rtype', label: 'Sorte de parution', type: 'check', options: REL_TYPES.filter(([k]) => store.of('release').some(r => (r.data.rtype || 'album') === k)), test: (it, v) => !v.length || v.includes(it.data.rtype || 'album')}],
        // les disques d'avant (et ceux de Discogs) : crédits d'une piste écrits « Rôle : Nom · Rôle : Nom »
        upgrade: d => { (d.tracks || []).forEach(t => { if (typeof t.credits === 'string') t.credits = t.credits.split(/\s*·\s*/).filter(Boolean).map(x => { const m = x.match(/^(.*?)\s*:\s*(.+)$/); return m ? {role: m[1].trim(), pname: m[2].trim()} : {pname: x.trim()}; }); });
            if (Array.isArray(d.credits)) d.credits = d.credits.map(c => c && c.name && !c.pid && !c.pname ? {pname: c.name, role: c.role || '', tracks: c.tracks || ''} : c); },
        linkedSkip: ['recording', 'org'],
        linkedExtra: (ctx, it) => { const st = ctx.store, recs = ART.arr(it.data?.tracks).map(t => U.ref(t.rec)).filter(r => r?.iid).map(r => st.get(r.iid)).filter(Boolean);
            const works = new Set(recs.map(r => U.ref(r.data?.work)?.iid).filter(Boolean)); const n = k => recs.filter(r => (r.data.rkind || 'prise') === k).length;
            const bits = [n('prise') && `🎙 ${U.plural(n('prise'), 'prise')}`, n('mixage') && `🎚 ${U.plural(n('mixage'), 'mixage')}`, n('remaster') && `✨ ${U.plural(n('remaster'), 'remaster')}`].filter(Boolean);
            return (works.size ? `<div><span class="ar-ochip is-link"><i>🎵</i>${esc(U.plural(works.size, 'morceau', 'morceaux'))}</span>${bits.length ? `<span class="ar-ochip is-link">${esc(bits.join(' · '))}</span>` : ''}</div>` : ''); },
    });

    /* les pistes : « Avec les crédits » / « Paroles », la pastille violette de l'enregistrement (→ le morceau), le lecteur */
    const PREFK = 'genealogie-artist-tracks';
    ART.views.tracks = {
        meta: (ctx, it) => { const t = ART.arr(it.data?.tracks).filter(x => !x.heading); const tot = t.reduce((a, x) => a + U.secs(x.dur), 0); return t.length ? `${esc(U.plural(t.length, 'titre'))}${tot ? ` · ${U.hms(tot)}` : ''}` : ''; },
        actions: () => { const p = (() => { try { return JSON.parse(localStorage.getItem(PREFK) || '{}'); } catch (_) { return {}; } })(); return `<span class="ui-filters ar-tfilt"><button type="button" class="${p.credits === false ? '' : 'is-active'}" data-ar-tf="credits">Avec les crédits</button><button type="button" class="${p.lyrics ? 'is-active' : ''}" data-ar-tf="lyrics">Paroles</button></span>`; },
        read: (ctx, it) => {
            const st = ctx.store, d = it.data || {}, tracks = d.tracks || [], disc = ART.normPeople(d.credits);
            const p = (() => { try { return JSON.parse(localStorage.getItem(PREFK) || '{}'); } catch (_) { return {}; } })();
            if (!tracks.length) return '<p class="muted">Pas encore de pistes : « ✎ Modifier » → « ＋ Une piste » ou « 📋 Coller une liste de titres ».</p>';
            return `<table class="ar-t ar-tracks ${p.credits === false ? 'no-credits' : ''} ${p.lyrics ? 'with-lyrics' : ''}"><tbody>${tracks.map(t => {
                if (t.heading) return `<tr class="ar-theading"><td colspan="4">${esc(t.title)}</td></tr>`;
                const r = U.ref(t.rec), rec = r?.iid ? st.get(r.iid) : null, rk = rec?.data?.rkind || 'prise';
                const pos = String(t.pos || '').toUpperCase(), mine = ART.normPeople(t.credits), fromDisc = disc.filter(c => c.tracks && c.tracks.split(/[\s,;]+/).map(x => x.toUpperCase()).includes(pos));
                const cr = [...mine, ...fromDisc].map(c => `${c.role ? `${esc(c.role)} – ` : ''}${U.personChip(c, '', ctx)}`).join(' · ');
                const snd = rec ? ART.mediaOf(rec.data?.sound) : null;
                return `<tr><td class="n">${esc(t.pos || '')}</td><td><b>${esc(t.title)}</b>${r ? (r.iid ? ` <button type="button" class="ar-rec" data-ar-open="${r.iid}" title="L’enregistrement (et son morceau)">${REC_ICON[rk] || '🎙'} ${esc(r.title || rec?.title || 'enregistrement')}</button>` : ` <span class="ar-rec is-free">${esc(r.txt)}</span>`) : ''}${cr ? `<div class="ar-tkcr">${cr}</div>` : ''}${t.version ? `<div class="ar-tkcr">${esc(t.version)}</div>` : ''}
                    ${t.lyrics || t.notes ? `<div class="ar-lyr">${t.lyrics ? `<pre>${esc(t.lyrics)}</pre>` : ''}${t.notes ? `<p><b>Notes</b> ${esc(t.notes)}</p>` : ''}</div>` : ''}</td><td class="pl">${snd?.f ? ART.player(`media/${encodeURIComponent(snd.f)}`, '', snd.title) : ''}</td><td class="d">${esc(t.dur || '')}</td></tr>`; }).join('')}</tbody></table>`;
        },
    };
    document.addEventListener('click', e => { const b = e.target.closest('[data-ar-tf]'); if (!b) return; let p = {}; try { p = JSON.parse(localStorage.getItem(PREFK) || '{}'); } catch (_) {} const k = b.dataset.arTf; p[k] = k === 'credits' ? p.credits === false : !p[k]; try { localStorage.setItem(PREFK, JSON.stringify(p)); } catch (_) {} b.classList.toggle('is-active'); const t = b.closest('.ar-sec')?.querySelector('.ar-tracks'); t?.classList.toggle(k === 'credits' ? 'no-credits' : 'with-lyrics', k === 'credits' ? p.credits === false : p[k]); });
    /** crédits du disque en deux colonnes ; « (B1) » quand ils ne valent que pour certaines pistes */
    ART.views.credits = {read: (ctx, it, f, v) => { const l = ART.normPeople(v); if (!l.length) return ''; return `<div class="ar-credits is-cols">${l.map(r => `<div>${r.role ? `${esc(r.role)} – ` : ''}${U.personChip(r, '', ctx)}${r.tracks ? ` <small class="ar-g">(${esc(r.tracks)})</small>` : ''}</div>`).join('')}</div>`; }};
    ART.views.credits.meta = () => 'les noms de ta généalogie sont des pastilles cliquables';
    /** éditions et pressages : cette parution, les autres fiches du même album (↗), et les lignes importées */
    ART.views.editions = {
        meta: () => 'même album, autres parutions',
        actions: (ctx, it) => it.id ? `<button type="button" class="button small secondary" data-ar-newed="${it.id}">＋ Ajouter une édition</button>` : '',
        read: (ctx, it) => {
            const st = ctx.store, d = it.data || {}, m = U.ref(d.master);
            const sibs = m?.iid ? st.linksTo(m.iid, 'master').map(l => st.get(l.from) || {...l.other, data: {}}).filter(x => x.id !== it.id) : [];
            const rows = [{me: true, title: it.title, format: d.format, label: [U.refTitle(d.label), d.catno].filter(Boolean).join(' '), country: d.country, year: it.year || U.yearOf(d.released)},
                ...sibs.map(x => ({id: x.id, title: x.title, format: x.data?.format || x.sub || '', label: [U.refTitle(x.data?.label), x.data?.catno].filter(Boolean).join(' '), country: x.data?.country || '', year: x.year || ''})),
                ...(d.versions || []).filter(v => !U.ref(v.rel)?.iid || !sibs.some(x => x.id === U.ref(v.rel).iid)).map(v => ({id: U.ref(v.rel)?.iid || 0, title: v.title || it.title, format: v.format, label: [v.label, v.catno].filter(Boolean).join(' '), country: v.country, year: v.year, note: v.note}))];
            if (rows.length < 2) return '<p class="muted">Une seule édition connue. « ＋ Ajouter une édition » (même album, autre pays, autre format, réédition…).</p>';
            const first = rows.reduce((a, r) => (Number(r.year) || 9999) < (Number(a.year) || 9999) ? r : a, rows[0]);
            return `<div class="ar-scroll"><table class="ar-t"><thead><tr><th>Titre</th><th>Format</th><th>Label · n°</th><th>Pays</th><th>Année</th><th></th></tr></thead><tbody>${rows.map(r => `<tr class="${r.me ? 'is-me' : ''}"><td>${r.me ? `<b>${esc(r.title)}</b> <small class="ar-g">(celle-ci)</small>` : esc(r.title)}</td><td>${esc(r.format || '')}</td><td>${esc(r.label || '')}</td><td>${esc(r.country || '')}</td><td>${esc(r.year || '')}</td><td>${r === first ? '⭐ 1re' : r.id ? `<button type="button" class="icon-button small" data-ar-open="${r.id}" title="Ouvrir cette édition">↗</button>` : esc(r.note || '')}</td></tr>`).join('')}</tbody></table></div>`;
        },
    };
    // ＋ Ajouter une édition : une nouvelle parution du même album (l'album est créé s'il n'existe pas)
    document.addEventListener('click', async e => {
        const b = e.target.closest('[data-ar-newed]'); if (!b) return; const C = b.closest('.ar-dlg')?._C; if (!C) return;
        const it = C.store.get(b.dataset.arNewed); if (!it) return; let m = U.ref(it.data?.master);
        try {
            if (!m?.iid) { const id = await ART.saveItem(C.store, 'master', 0, {title: it.title, artist: it.data.artist || null, year: it.year ? String(it.year) : '', genre: it.data.genre || ''}); m = {iid: id, title: it.title, kind: 'master'}; await ART.saveItem(C.store, 'release', it.id, {...it.data, master: m}); await C.reload(); }
            C.newItem('release', {title: it.title, artist: it.data.artist || null, master: m, rtype: it.data.rtype || 'album', genre: it.data.genre || '', styles: it.data.styles || '', label: it.data.label || null});
        } catch (er) { if (er.message) window.LCNDA_APP.toast(er.message, 'error'); }
    });
    /** 📋 coller une liste de titres : « A1. Paris canaille 2:41 », « 1 - Titre (3:12) » */
    async function pasteTracks(C, fld, f) {
        const txt = await window.LCNDA_APP.askText({title: 'Coller une liste de titres', message: 'Un titre par ligne, avec si tu veux la position devant et la durée à la fin : « A1. Paris canaille 2:41 ».', value: '', okLabel: 'Ajouter', multiline: true}); if (!txt?.trim()) return;
        const box = fld.querySelector('.ar-rows');
        txt.split(/\n+/).map(l => l.trim()).filter(Boolean).forEach(l => { const m = l.match(/^([A-Z]?\d+[a-z]?|[A-D]\d*)[.)\-\s]+(.*)$/), rest = m ? m[2] : l, dm = rest.match(/^(.*?)[\s–—-]*\(?(\d{1,2}:\d{2}(?::\d{2})?)\)?$/);
            const tmp = document.createElement('div'); tmp.innerHTML = ART.rowHtml(f, {pos: m ? m[1] : String(box.children.length + 1), title: (dm ? dm[1] : rest).trim(), dur: dm ? dm[2] : ''}, box.children.length); box.appendChild(tmp.firstElementChild); });
        box.dispatchEvent(new Event('change', {bubbles: true}));
    }

    /* ═════════ 💽 Album (toutes éditions) — le « master » de Discogs ═════════ */
    ART.define({key: 'master', icon: '💽', label: 'Album (toutes éditions)', many: 'Albums', tab: 'Albums', domain: 'music',
        newData: store => ({artist: {pid: store.pid, title: store.name}}),
        heading: (ctx, it) => `<h2 class="ar-h2">${esc(U.nameOf(it.data?.artist) ? `${U.nameOf(it.data.artist)} – ` : '')}${esc(it.title)}${it.year ? ` <small>· ${esc(it.year)}</small>` : ''}</h2>`,
        groups: [{key: 'main', label: 'Album', zone: 'main', fields: [{key: 'title', label: 'Titre', type: 'text', star: true, head: true}, {key: 'artist', label: 'Artiste crédité', type: 'person', star: true, head: true, roleWord: 'artiste'}, {key: 'year', label: 'Première sortie', type: 'date', star: true}, {key: 'genre', label: 'Genre', type: 'text', star: true}, {key: 'discogs', label: 'Discogs (master)', type: 'ident', href: v => discogsHref(`m${String(v).replace(/^m/i, '')}`), star: false}]},
            {key: 'eds', label: 'Éditions', zone: 'main', fields: [{key: '_editions', label: 'Toutes ses éditions', type: 'computed', view: 'master_editions', star: true}]},
            {key: 'photos', label: 'Photos', zone: 'left', fields: [{key: 'photos', label: 'Pochette', type: 'photos', star: true, labels: PHOTO_KINDS}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        list: ['photos', 'title', 'year', '_editions'], card: ['year'], export: ['title', 'year', 'genre', 'notes'],
    });
    ART.views.master_editions = {
        meta: (ctx, it) => { const n = ctx.store.linksTo(it.id, 'master').length; return n ? esc(U.plural(n, 'édition')) : ''; },
        text: (ctx, it) => { const n = ctx.store.linksTo(it.id, 'master').length; return n ? U.plural(n, 'édition') : ''; },
        read: (ctx, it) => { const st = ctx.store, l = st.linksTo(it.id, 'master').map(x => st.get(x.from) || {...x.other, data: {}}).sort((a, b) => (Number(a.year) || 9999) - (Number(b.year) || 9999));
            if (!l.length) return '<p class="muted">Aucune parution rattachée : sur la fiche d’un disque, choisis cet album dans « Album (toutes éditions) ».</p>';
            return `<div class="ar-scroll"><table class="ar-t"><thead><tr><th></th><th>Titre</th><th>Format</th><th>Label · n°</th><th>Pays</th><th>Année</th></tr></thead><tbody>${l.map((x, i) => `<tr data-ar-row-open="${x.id}" class="is-click"><td>${U.cover(x, 'ar-mini')}</td><td><b>${esc(x.title)}</b>${i === 0 ? ' <small>⭐ 1re</small>' : ''}</td><td>${esc(x.data?.format || '')}</td><td>${esc([U.refTitle(x.data?.label), x.data?.catno].filter(Boolean).join(' '))}</td><td>${esc(x.data?.country || '')}</td><td>${esc(x.year || '')}</td></tr>`).join('')}</tbody></table></div>`; },
    };

    /* ═════════ 🎵 Morceau (l'œuvre musicale) — maquette B ═════════ */
    ART.define({key: 'track_work', icon: '🎵', label: 'Morceau', many: 'Morceaux', domain: 'music', eyebrow: () => 'Morceau (œuvre musicale)',
        newData: store => ({lyricist: {pid: store.pid, title: store.name}}),
        heading: () => '',
        cardLine: it => [U.nameOf(it.data?.lyricist) && `paroles ${U.nameOf(it.data.lyricist)}`, U.nameOf(it.data?.composer) && `musique ${U.nameOf(it.data.composer)}`, it.data?.written].filter(Boolean).join(' · '),
        groups: [
            {key: 'oeuvre', label: 'L’œuvre', icon: '✍️', zone: 'left', fields: [
                {key: 'title', label: 'Titre', type: 'text', star: true, head: true},
                {key: 'lyricist', label: 'Paroles', type: 'person', star: true, roleWord: 'paroles'},
                {key: 'composer', label: 'Musique', type: 'person', star: true, roleWord: 'musique'},
                {key: 'written', label: 'Écrite', type: 'date', star: true},
                {key: 'wplace', label: 'Lieu', type: 'place', star: true},
                {key: 'publisher', label: 'Éditeur', type: 'item', kinds: ['org'], star: true},
                {key: 'sacem', label: 'Dépôt SACEM', type: 'text', star: false, join: {key: 'iswc', sep: ' · ', lab: 'ISWC'}},
                {key: 'iswc', label: 'ISWC', type: 'text', star: false, ph: 'T-901.234.567-1'},
                {key: 'lang', label: 'Langue', type: 'text', star: false},
                {key: 'tonality', label: 'Tonalité', type: 'text', star: false, join: {key: 'meter', sep: ' · '}},
                {key: 'meter', label: 'Mesure, rythme', type: 'text', star: false, ph: '3/4 valse'},
                {key: 'after', label: 'D’après', type: 'item', kinds: ['text', 'book', 'track_work'], star: false}]},
            {key: 'scores', label: 'Partitions et paroles', icon: '📄', zone: 'left', fields: [
                {key: 'scores', label: 'Partitions', type: 'rows', star: false, addLabel: 'Une partition', cols: [{key: 'title', label: 'Partition', w: 'l'}, {key: 'year', label: 'Année', w: 's'}, {key: 'where', label: 'Où'}], view: 'docs'},
                {key: 'lyrics', label: 'Paroles (couplets annotés)', type: 'longtext', star: false, rows: 8}]},
            {key: 'covers', label: 'Reprises par d’autres', icon: '🎤', zone: 'left', fields: [{key: 'covers', label: 'Reprises', type: 'rows', star: false, bare: true, view: 'covers', addLabel: 'Une reprise', cols: [{key: 'who', label: 'Interprète', type: 'person', w: 'm'}, {key: 'year', label: 'Année', w: 's'}, {key: 'note', label: 'Précision (instrumental…)'}]}]},
            {key: 'recs', label: 'Enregistrements', zone: 'main', fields: [{key: '_recordings', label: 'Enregistrements (prises, mixages, versions)', secLabel: 'Enregistrements', type: 'computed', view: 'recordings', star: true}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'left', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        list: ['title', 'lyricist', 'composer', 'written', '_recordings'], card: ['written'], export: ['title', 'lyricist', 'composer', 'written', 'publisher', 'lyrics', 'notes'],
    });
    ART.views.docs = {read: (ctx, it, f, v) => (v || []).map(r => `<div><span class="ar-ochip"><i>📄</i>${esc([r.title, r.year].filter(Boolean).join(' · '))}</span>${r.where ? ` <small class="ar-g">${esc(r.where)}</small>` : ''}</div>`).join('')};
    ART.views.covers = {read: (ctx, it, f, v) => (v || []).map(r => `<div>${U.person(r.who)?.pid ? U.personChip(r.who, '', ctx) : esc(U.nameOf(r.who))}${r.year ? ` · ${esc(r.year)}` : ''}${r.note ? ` <span class="ar-g">(${esc(r.note)})</span>` : ''}</div>`).join('')};
    /** les enregistrements d'un morceau, en arbre (une prise → ses mixages → leurs remasters) ou en tableau */
    const recsOf = (st, workId) => st.linksTo(workId, 'work').map(l => st.get(l.from)).filter(Boolean).filter(r => r.kind === 'recording');
    const onReleases = (st, recId) => st.linksTo(recId, 'tracks').map(l => ({l, rel: st.get(l.from) || {...l.other, data: {}}})).filter(x => x.rel.kind === 'release');
    const relTable = (st, rec) => { const l = onReleases(st, rec.id); if (!l.length) return '';
        return `<table class="ar-t ar-relt"><thead><tr><th>Parution</th><th>Piste</th><th>Format</th><th>Année</th><th class="d">Durée</th></tr></thead><tbody>${l.map(({l: k, rel}) => `<tr><td><button type="button" class="ar-ochip is-link" data-ar-open="${rel.id}"><i>💿</i>${esc(rel.title)}${rel.data?.country && rel.data.country !== 'France' ? ` (${esc(rel.data.country)})` : ''}</button></td><td>${esc(k.data?.pos || '')}</td><td>${esc(rel.data?.format || '')}</td><td>${esc(rel.year || '')}</td><td class="d">${esc(k.data?.dur || '')}</td></tr>`).join('')}</tbody></table>`; };
    ART.views.recordings = {
        meta: (ctx, it) => { const l = recsOf(ctx.store, it.id); return l.length ? esc(REC_KINDS.map(([k, x]) => { const n = l.filter(r => (r.data.rkind || 'prise') === k).length; return n ? `${n} ${k === 'public' ? 'public' : U.plural(n, x.toLowerCase()).replace(/^\d+ /, '')}` : ''; }).filter(Boolean).join(' · ')) : ''; },
        text: (ctx, it) => { const n = recsOf(ctx.store, it.id).length; return n ? U.plural(n, 'enregistrement') : ''; },
        actions: (ctx, it) => it.id ? `<span class="segmented ar-rmode"><button type="button" class="${(localStorage.getItem('genealogie-artist-recview') || 'tree') === 'tree' ? 'is-active' : ''}" data-ar-recview="tree">Arbre</button><button type="button" class="${localStorage.getItem('genealogie-artist-recview') === 'table' ? 'is-active' : ''}" data-ar-recview="table">Tableau</button></span><button type="button" class="button small secondary" data-ar-newrec="${it.id}">＋ Ajouter un enregistrement</button>` : '',
        read: (ctx, it) => {
            const st = ctx.store, l = recsOf(st, it.id);
            if (!l.length) return '<p class="muted">Aucun enregistrement : « ＋ Ajouter un enregistrement » (une prise, un mixage, une version, en public…). Sur un disque, chaque piste peut ensuite pointer vers l’un d’eux.</p>';
            if (localStorage.getItem('genealogie-artist-recview') === 'table') return `<div class="ar-scroll"><table class="ar-t"><thead><tr><th>Sorte</th><th>Titre</th><th>Date</th><th>D’après</th><th>Durée</th><th>Parutions</th></tr></thead><tbody>${l.map(r => `<tr data-ar-row-open="${r.id}" class="is-click"><td><span class="ar-kind k-${esc(r.data.rkind || 'prise')}">${esc(lab(REC_KINDS, r.data.rkind || 'prise').toLocaleUpperCase('fr-FR'))}</span></td><td><b>${esc(r.title)}</b>${r.data.kept ? ' <span class="ar-star">★</span>' : ''}</td><td>${esc(r.data.date || '')}</td><td>${esc(U.refTitle(r.data.from))}</td><td>${esc(r.data.dur || '')}</td><td>${onReleases(st, r.id).length || ''}</td></tr>`).join('')}</tbody></table></div>`;
            const ids = new Set(l.map(r => r.id)), kids = id => l.filter(r => U.ref(r.data.from)?.iid === id);
            const card = (r, depth) => { const d = r.data || {}, rk = d.rkind || 'prise', snd = ART.mediaOf(d.sound), cr = ART.normPeople(d.credits), n = onReleases(st, r.id).length;
                return `<div class="ar-reccard k-${esc(rk)} ${d.kept ? 'is-main' : ''}"><div class="ar-rhd"><span class="ar-kind k-${esc(rk)}">${esc(lab(REC_KINDS, rk).toLocaleUpperCase('fr-FR'))}</span><button type="button" class="ar-linkbtn ar-rtitle" data-ar-open="${r.id}">${esc(r.title)}</button>${d.kept ? '<span class="ar-star">★ retenue</span>' : rk === 'prise' && l.some(x => x.data.kept && (x.data.rkind || 'prise') === 'prise') ? '' : ''}<small class="ar-g">${esc([d.date, U.placeTitle(d.studio), d.note, d.dur].filter(Boolean).map((x, i) => (i ? '' : '· ') + x).join(' · '))}</small><span class="spacer"></span>
                    ${cr.length ? `<span class="ar-rcred">${cr.slice(0, 3).map(c => `${c.role ? `<span class="ar-g">${esc(c.role)}</span> ` : ''}${U.personChip(c, '', ctx)}`).join(' ')}</span>` : ''}${rk === 'prise' && !d.kept && l.filter(x => (x.data.rkind || 'prise') === 'prise').length > 1 ? '<span class="ar-tag">non retenue</span>' : ''}${n && rk !== 'mixage' ? onReleases(st, r.id).map(({l: k, rel}) => `<button type="button" class="ar-ochip is-link" data-ar-open="${rel.id}"><i>💿</i>${esc(rel.title)}${k.data?.pos ? ` (piste ${esc(k.data.pos)})` : ''}</button>`).join('') : ''}</div>
                    ${snd ? `<div class="ar-rfile">${ART.player(snd.f ? `media/${encodeURIComponent(snd.f)}` : '', d.dur, snd.title)}<span class="ar-ochip"><i>🔉</i>${esc(snd.title || snd.f)}</span></div>` : ''}
                    ${rk === 'mixage' && n ? `<div class="ar-rrel">${n ? `<div class="ar-rrelh"><span class="spacer"></span><span class="ar-ochip is-link"><i>💿</i>${esc(U.plural(n, 'parution'))}</span></div>` : ''}${relTable(st, r)}</div>` : ''}
                    ${kids(r.id).length ? `<div class="ar-rtree">${kids(r.id).map(k => card(k, depth + 1)).join('')}</div>` : ''}</div>`; };
            const ORD = {prise: 0, version: 1, mixage: 2, remaster: 3, public: 4};
            const roots = l.filter(r => !ids.has(U.ref(r.data.from)?.iid)).sort((a, b) => (ORD[a.data.rkind || 'prise'] - ORD[b.data.rkind || 'prise']) || ((a.date_min ?? 9999) - (b.date_min ?? 9999)) || String(a.title).localeCompare(String(b.title), 'fr', {numeric: true}));
            return `<div class="ar-recs">${roots.map(r => card(r, 0)).join('')}</div>`;
        },
    };
    document.addEventListener('click', e => {
        const v = e.target.closest('[data-ar-recview]'); if (v) { try { localStorage.setItem('genealogie-artist-recview', v.dataset.arRecview); } catch (_) {} v.closest('.ar-dlg')?._C?.paint(false); return; }
        const b = e.target.closest('[data-ar-newrec]'); if (!b) return; const C = b.closest('.ar-dlg')?._C; if (!C) return; const w = C.store.get(b.dataset.arNewrec);
        C.newItem('recording', {rkind: 'prise', work: {iid: w.id, title: w.title, kind: 'track_work'}, title: `Prise ${C.store.linksTo(w.id, 'work').length + 1}`});
    });

    /* ═════════ 🎙 Enregistrement (prise, mixage, remaster, version, en public) ═════════ */
    ART.define({key: 'recording', icon: '🎙', label: 'Enregistrement', many: 'Enregistrements', domain: 'music', parentField: 'work',
        eyebrow: it => `Enregistrement · ${lab(REC_KINDS, it.data?.rkind || 'prise')}`,
        crumbExtra: (ctx, it) => { const w = U.ref(it.data?.work); return w?.iid ? ` · du morceau « <button type="button" class="ar-linkbtn u" data-ar-open="${w.iid}">${esc(w.title)}</button> »` : ''; },
        newData: () => ({rkind: 'prise'}),
        cardLine: it => [lab(REC_KINDS, it.data?.rkind || 'prise'), it.data?.date, it.data?.dur].filter(Boolean).join(' · '),
        groups: [
            {key: 'main', label: 'Enregistrement', zone: 'main', fields: [
                {key: 'rkind', label: 'Sorte', type: 'select', choices: REC_KINDS, star: true},
                {key: 'title', label: 'Titre', type: 'text', star: true, ph: 'Prise 3, Mix mono 1958…'},
                {key: 'work', label: 'Morceau', type: 'item', kinds: ['track_work'], star: true},
                {key: 'from', label: 'Fait d’après', type: 'item', kinds: ['recording'], star: true, help: '(le mixage d’une prise, le remaster d’un mixage…)'},
                {key: 'kept', label: 'Prise retenue', type: 'bool', star: true, on: '★ retenue'},
                {key: 'date', label: 'Date', type: 'date', star: true},
                {key: 'studio', label: 'Studio, lieu', type: 'place', star: true},
                {key: 'dur', label: 'Durée', type: 'text', star: true, ph: '2:58'},
                {key: 'note', label: 'Précision', type: 'text', star: true, ph: 'mixé par…, couplet 3 coupé, bande amateur'},
                {key: 'concert', label: 'Concert', type: 'item', kinds: ['concert'], star: false}]},
            {key: 'sound', label: 'Fichier son', zone: 'main', fields: [{key: 'sound', label: 'Fichier son', type: 'media', media: ['audio', 'video'], star: true, section: true}]},
            {key: 'credits', label: 'Crédits', zone: 'main', fields: [{key: 'credits', label: 'Crédits', type: 'people', view: 'credits', star: true, addLabel: 'Un crédit', section: true}]},
            {key: 'rel', label: 'Parutions', zone: 'main', fields: [{key: '_onrel', label: 'Figure sur', type: 'computed', view: 'rec_releases', star: true}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        list: ['rkind', 'title', 'work', 'date', 'dur', 'kept'], card: ['rkind', 'date'], export: ['rkind', 'title', 'work', 'date', 'studio', 'dur', 'credits'],
    });
    ART.views.rec_releases = {read: (ctx, it) => relTable(ctx.store, it) || '<p class="muted">Sur aucun disque pour l’instant : sur la fiche d’un disque, une piste peut pointer vers cet enregistrement.</p>', text: (ctx, it) => { const n = onReleases(ctx.store, it.id).length; return n ? U.plural(n, 'parution') : ''; }};

    /* ═════════ 📅 Concert, tournée ═════════ */
    ART.define({key: 'concert', icon: '📅', label: 'Concert', many: 'Concerts et tournées', tab: 'Concerts', domain: 'music',
        groups: [{key: 'main', label: 'Concert', zone: 'main', fields: [{key: 'title', label: 'Titre', type: 'text', star: true, head: true}, {key: 'date', label: 'Date', type: 'date', star: true}, {key: 'place', label: 'Lieu', type: 'place', star: true}, {key: 'venue', label: 'Salle', type: 'text', star: true}, {key: 'tour', label: 'Tournée', type: 'text', star: true}]},
            {key: 'program', label: 'Programme', zone: 'main', fields: [{key: 'program', label: 'Programme', type: 'rows', star: true, addLabel: 'Un morceau', cols: [{key: 'work', label: 'Morceau', type: 'item', kinds: ['track_work'], w: 'l'}, {key: 'note', label: 'Note'}]}, {key: 'musicians', label: 'Musiciens', type: 'people', star: true, view: 'credits', section: true}]},
            {key: 'photos', label: 'Affiche, photos', zone: 'left', fields: [{key: 'photos', label: 'Affiche, photos', type: 'photos', star: true, labels: [['affiche', 'Affiche'], ['photo', 'Photo'], ['billet', 'Billet'], ['autre', 'Autre']]}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        list: ['date', 'title', 'place', 'venue', 'tour'], card: ['date', 'place'], export: ['date', 'title', 'place', 'venue', 'program'],
    });
})();
