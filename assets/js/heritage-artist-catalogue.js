/* LCNDA — 🎨 « 📖 Nouveau catalogue raisonné » et « 💿 Discographie » en livre (maquette G).
 * Sur le modèle du livre d'après la famille (heritage-layout.js, newDocWizard('family') / familyDoc()) : parties à cocher et à
 * ranger (couverture, introduction, chronologie, notices, expositions, bibliographie, index, concordances), champs de la notice
 * (= onglet « L'export » du panneau « ⚙️ Champs affichés »), une ou plusieurs œuvres par page. Le livre est fait page par page
 * dans la mise en page (ext.layoutKit) ; chaque notice est un OBJET DYNAMIQUE ({type:'art', id}) qui suit sa fiche :
 * « ↻ Mettre à jour les objets dynamiques » reprend une provenance corrigée. Sans la mise en page : un livre à imprimer.
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART; if (!ART) return;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP, P = () => window.LCNDA_PICKER || window.LCNDA_APP;
    const U = ART.util, esc = U.esc;
    const PARTS = {
        catalogue: [['cover', 'Couverture', 1], ['intro', 'Introduction, biographie', 1], ['chrono', 'Chronologie', 1], ['notices', 'Notices des œuvres', 1, '(par période)'], ['expos', 'Liste des expositions', 1], ['biblio', 'Bibliographie générale', 1], ['index', 'Index des titres, des lieux, des propriétaires', 1], ['concord', 'Concordances (n° CR ↔ inventaire ↔ ventes)', 1], ['lost', 'Œuvres non retrouvées (en annexe)', 0]],
        discography: [['cover', 'Couverture', 1], ['intro', 'Introduction, biographie', 1], ['chrono', 'Chronologie', 1], ['notices', 'Les disques', 1, '(une double page par album : pochette, pistes, crédits, éditions)'], ['tracks', 'Index des morceaux', 1], ['credits', 'Index des musiciens et des crédits', 1], ['concord', 'Concordance des numéros de catalogue', 0]],
    };
    const LAYOUTS = [['one', '1 œuvre par page (grande image)'], ['spread', 'Une double page par œuvre (image à gauche, notice à droite)'], ['two', '2 œuvres par page'], ['four', '4 œuvres par page (inventaire)']];
    const FORMATS = [['23x28', '23 × 28 cm', 230, 280], ['A4', 'A4 (21 × 29,7 cm)', 210, 297], ['21x27', '21 × 27 cm', 210, 270], ['royal', 'Livre (15,6 × 23,4 cm)', 156, 234], ['square', 'Carré (21 × 21 cm)', 210, 210], ['A4L', 'A4 à l’italienne', 297, 210]];
    const PREF = 'genealogie-artist-book';
    const readP = () => { try { return JSON.parse(localStorage.getItem(PREF) || '{}') || {}; } catch (_) { return {}; } };

    /* ═════════ La notice d'une fiche (texte de la mise en page, avec ses styles) ═════════ */
    const p = (ps, html) => `<p data-ps="${ps}">${html}</p>`;
    function noticeParas(store, it, fields, opts = {}) {
        const ctx = ART.ctx(store, it), all = ART.layout(store, it.kind, 'export').fields, use = all.filter(f => fields ? fields.includes(f.key) : f.on);
        const txt = f => ART.text(ctx, it, f), out = [];
        const num = String(it.data?.catref || '').replace(/^CR\s*/i, '');
        if (num) out.push(p('ps-chapter', esc(num)));
        out.push(p('ps-name', `<i>${esc(it.title)}</i>`));
        const meta = use.filter(f => !['title', 'catref', 'photos', 'provenance', 'exhibitions', 'literature', 'related', 'notes', 'note', 'tracks', 'credits', 'versions', 'owner'].includes(f.key) && f.type !== 'rows' && f.type !== 'longtext');
        // « 1921 », « Huile sur toile, 46 × 55 cm », « Signé et daté en bas à droite… » : les champs « nus » sans libellé, ensemble
        const NL = ['date', 'released', 'year', 'technique', 'dims', 'format', 'signature'];
        const bare = meta.filter(f => NL.includes(f.key)).map(f => (f.key === 'signature' ? `Signé, daté ${txt(f)}` : txt(f))).filter(Boolean);
        const dt = bare.length && meta.some(f => ['date', 'released', 'year'].includes(f.key) && txt(f)) ? bare.shift() : '';
        if (dt) out.push(p('ps-dates', esc(dt)));
        if (bare.length) out.push(p('ps-dates', esc(bare.join(', '))));
        meta.filter(f => !NL.includes(f.key)).forEach(f => { const t = txt(f); if (t) out.push(p('ps-dates', `${esc(f.short || f.label)} : ${esc(t)}`)); });
        const sec = (label, body) => { if (body) { out.push(p('ps-head', esc(label))); out.push(p('ps-body', body)); } };
        const owner = use.find(f => f.key === 'owner');
        if (owner) { const o = U.person(it.data.owner); const name = opts.hideLiving && o?.pid && store.isLiving?.(o.pid) ? 'collection particulière' : U.nameOf(it.data.owner); if (name) sec('Propriétaire actuel', esc(name)); }
        use.filter(f => ['provenance', 'exhibitions', 'literature', 'related'].includes(f.key) || (f.type === 'rows' && !['tracks', 'versions'].includes(f.key))).forEach(f => {
            const rows = Array.isArray(it.data[f.key]) ? it.data[f.key] : []; if (!rows.length) return;
            const one = r => f.key === 'provenance' ? [r.date, (ART.ARTLISTS?.STEP.find(x => x[0] === r.mode) || [, ''])[1], opts.hideLiving && U.person(r.owner)?.pid && store.isLiving?.(U.person(r.owner).pid) ? 'collection particulière' : U.nameOf(r.owner), r.how, r.price && U.money(r.price)].filter(Boolean).join(', ')
                : f.key === 'exhibitions' ? [U.refTitle(r.ex), r.catno].filter(Boolean).join(', ') : f.key === 'literature' ? [U.refTitle(r.ref), r.page].filter(Boolean).join(', ') : f.key === 'related' ? [(ART.ARTLISTS?.RELS.find(x => x[0] === r.rel) || [, ''])[1], U.refTitle(r.w)].filter(Boolean).join(' ') : (f.cols || []).map(c => ART.cellText(c, r[c.key])).filter(Boolean).join(', ');
            sec({literature: 'Bibliographie', related: 'Œuvres en rapport'}[f.key] || f.label, esc(rows.map(one).filter(Boolean).join(' ; ')) + '.');
        });
        // un disque : les pistes, les crédits, les éditions
        if (it.kind === 'release') {
            if (use.some(f => f.key === 'tracks') && ART.arr(it.data.tracks).length) { out.push(p('ps-head', 'Pistes')); it.data.tracks.forEach(t => out.push(t.heading ? p('ps-head', esc(t.title)) : p('ps-list', `<b>${esc(t.pos || '')}</b> ${esc(t.title)}${t.dur ? ` (${esc(t.dur)})` : ''}`))); }
            if (use.some(f => f.key === 'credits')) sec('Crédits', esc(ART.normPeople(it.data.credits).map(c => `${c.role ? `${c.role} : ` : ''}${c.title || c.txt}`).join(' ; ')));
            if (use.some(f => f.key === 'versions')) sec('Éditions', esc(ART.arr(it.data.versions).map(v => [v.year, v.country, v.label, v.catno, v.format].filter(Boolean).join(' ')).join(' ; ')));
        }
        use.filter(f => f.type === 'longtext').forEach(f => { const t = it.data[f.key]; if (t) sec(f.label, esc(t).replace(/\n/g, '<br>')); });
        return out.join('');
    }
    /** l'objet dynamique de la mise en page : relit la fiche et refait le texte (« ↻ Mettre à jour ») */
    async function noticeHtml(dyn) {
        const r = await A().api('art', {op: 'item', id: dyn.id}), it = r.item;
        const store = new ART.Store(it.person_id); store.items = [it]; store.byId = new Map([[it.id, it]]); store.links = r.links || []; store.people = r.people || [];
        try { await store.load(); } catch (_) {}
        return noticeParas(store, store.get(it.id) || it, dyn.fields?.length ? dyn.fields : null, {hideLiving: dyn.part === 'hide'});
    }

    /* ═════════ La fenêtre « Nouveau document » (maquette G) ═════════ */
    async function wizard({mode = 'catalogue', onSaved = null, pid = 0, store = null, ids = null} = {}) {
        pid = pid || store?.pid || Number(A().state?.currentPersonId) || 0;
        let st = store; const pref = readP();
        const loadStore = async id => { st = new ART.Store(id); await st.load(); pid = id; return st; };
        if (pid && !st) { try { await loadStore(pid); } catch (_) { st = null; } }
        const kit = ext.layoutKit;
        let parts = (pref[`parts_${mode}`] || PARTS[mode].map(([k, , on]) => ({k, on: !!on}))).filter(x => PARTS[mode].some(y => y[0] === x.k));
        PARTS[mode].forEach(([k, , on]) => { if (!parts.some(x => x.k === k)) parts.push({k, on: !!on}); });
        const kindOf = () => mode === 'catalogue' ? 'work' : 'release';
        const listOf = () => { if (!st) return []; const all = st.of(kindOf()); const sel = ids && ids.length ? ids.map(i => st.get(i)).filter(x => x && x.kind === kindOf()) : all; return sel; };
        const pages = (n, lay) => Math.round(n * ({one: 1, spread: 2, two: .5, four: .25}[lay] || 1) + parts.filter(x => x.on).length * 2 + 2);
        const dlg = ext.openDialog({eyebrow: 'NOUVEAU DOCUMENT', title: mode === 'catalogue' ? '📖 Un catalogue raisonné' : '💿 Une discographie', wide: true, submitLabel: '📖 Faire le livre',
            body: `<div class="ar-wiz"><div class="ar-wizl">
                <div class="segmented ar-wizmode"><button type="button" data-wm="family">👪 Livre de famille</button><button type="button" class="${mode === 'catalogue' ? 'is-active' : ''}" data-wm="catalogue">🖼 Catalogue raisonné</button><button type="button" class="${mode === 'discography' ? 'is-active' : ''}" data-wm="discography">💿 Discographie</button></div>
                <span class="pk-lab">Artiste</span>${P().pickerField({name: '', hiddenName: false, kind: 'person', value: st ? {id: st.pid, title: st.name} : null})}
                <div class="form-grid"><label>Design<select name="design">${(kit?.THEMES || [{id: 'classique', name: 'Classique'}]).map(t => `<option value="${esc(t.id)}" ${(pref.design || 'elegant') === t.id ? 'selected' : ''}>✨ ${esc(t.name)}</option>`).join('')}</select></label>
                <label>Format<select name="format">${FORMATS.map(([k, l]) => `<option value="${k}" ${(pref.format || '23x28') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <label>${mode === 'catalogue' ? 'Œuvres' : 'Disques'}<select name="which" data-which></select></label>
                <label>Ordre<select name="order"><option value="catref">${mode === 'catalogue' ? 'N° du catalogue' : 'Mon ordre'}</option><option value="date" ${mode !== 'catalogue' ? 'selected' : ''}>Date</option><option value="az">Titre A → Z</option></select></label></div>
                <span class="pk-lab">Les parties du livre</span><div class="ar-plist ar-parts" data-parts></div>
                <span class="pk-lab">Dans chaque notice <small class="muted">(le panneau « ⚙️ Champs affichés », onglet « L’export »)</small></span><div class="ar-nfields" data-nfields></div>
                <label>Mise en page des notices<select name="layout">${LAYOUTS.map(([k, l]) => `<option value="${k}" ${(pref.layout || 'spread') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <label class="ui-toggle"><input type="checkbox" name="hide" ${pref.hide ? 'checked' : ''}><i></i>Cacher le nom des propriétaires vivants (« collection particulière »)</label>
                <p class="muted" data-pcount></p></div><div class="ar-wizr" data-preview></div></div>`,
            onOpen: dg => {
                dg.classList.add('ar-wizdlg'); dg.dataset.dndOff = ''; dg.dataset.ordOff = '';
                const paint = () => {
                    const list = listOf(), which = dg.querySelector('[data-which]'), lay = dg.querySelector('[name=layout]').value;
                    which.innerHTML = `${ids?.length ? `<option value="list">Les ${list.length} (filtres de la liste)</option>` : ''}<option value="all">${st ? `Toutes : ${st.of(kindOf()).length}` : '—'}</option>`;
                    dg.querySelector('[data-parts]').innerHTML = parts.map((x, i) => { const d = PARTS[mode].find(y => y[0] === x.k); return `<div class="ar-fr ${x.on ? '' : 'off'}" data-pk="${x.k}" draggable="true"><span class="ar-grip">⠿</span><label class="checkbox-line"><input type="checkbox" data-pon ${x.on ? 'checked' : ''}><span class="lbl">${esc(d[1])}${d[3] ? ` <small class="muted">${esc(d[3])}</small>` : ''}</span></label><span class="tools"><button type="button" data-pmv="-1" ${i ? '' : 'disabled'} title="Monter">↑</button><button type="button" data-pmv="1" ${i < parts.length - 1 ? '' : 'disabled'} title="Descendre">↓</button></span></div>`; }).join('');
                    const F = st ? ART.layout(st, kindOf(), 'export').fields.filter(f => f.type !== 'computed') : [];
                    dg.querySelector('[data-nfields]').innerHTML = F.map(f => `<button type="button" class="ar-nf ${f.on ? 'on' : ''}" data-nf="${esc(f.key)}">${esc(f.short || f.label)}</button>`).join('') || '<small class="muted">Choisis d’abord l’artiste.</small>';
                    dg.querySelector('[data-pcount]').textContent = st ? `${U.plural(list.length, mode === 'catalogue' ? 'œuvre' : 'disque')} · environ ${pages(list.length, lay)} pages` : '';
                    dg.querySelector('[type=submit]').textContent = `📖 Faire le livre${st ? ` (≈ ${pages(list.length, lay)} pages)` : ''}`;
                    const first = ART.sortItems ? ART.sortItems(list, dg.querySelector('[name=order]').value)[0] : list[0];
                    dg.querySelector('[data-preview]').innerHTML = first ? `<div class="ar-spread"><div class="ar-page"><h6>${esc(st.name)}</h6>${U.photoSrc(ART.normPhotos(first.data.photos)[0]) ? `<img src="${esc(U.photoSrc(ART.normPhotos(first.data.photos)[0]))}" alt="">` : '<span class="ar-cov is-empty">🖼</span>'}<p class="cap">Fig. ${esc(String(first.data.catref || '').replace(/^CR\s*/i, '') || '1')} — ${esc(first.title)}${first.year ? `, ${esc(first.year)}` : ''}</p><span class="folio">64</span></div><div class="ar-page ar-ptext"><h6>Notices</h6>${noticeParas(st, first, null, {hideLiving: dg.querySelector('[name=hide]').checked}).replace(/data-ps="ps-chapter"/, 'class="no"').replace(/data-ps="ps-name"/, 'class="ti"').replace(/data-ps="ps-head"/g, 'class="lbl"').replace(/data-ps="[^"]*"/g, '')}<span class="folio">65</span></div></div><p class="muted">Comme « 👪 Livre d’après la famille » : le livre est fait page par page dans la mise en page (textes chaînés, sommaire, index automatiques) ; chaque notice est un <b>objet dynamique</b> lié à la fiche de l’œuvre : « ↻ Mettre à jour les objets dynamiques » reprend une provenance corrigée.</p>`
                        : '<p class="muted">L’aperçu d’une double page s’affiche ici.</p>';
                };
                dg._paint = paint; paint();
                dg.addEventListener('picker-change', async e => { const it = e.detail.item; if (!it?.id) return; try { await loadStore(Number(it.id)); ids = null; paint(); } catch (er) { A().toast(er.message, 'error'); } });
                dg.addEventListener('change', e => { if (e.target.matches('[data-pon]')) { const k = e.target.closest('[data-pk]').dataset.pk; parts.find(x => x.k === k).on = e.target.checked; } paint(); });
                dg.addEventListener('click', async e => { const b = e.target.closest('button'); if (!b) return;
                    if (b.dataset.wm) { e.preventDefault(); if (b.dataset.wm === mode) return; dg.close(); if (b.dataset.wm === 'family') ext.newLayoutDoc?.('family', onSaved); else wizard({mode: b.dataset.wm, onSaved, pid, store: st}); return; }
                    if (b.dataset.pmv) { const k = b.closest('[data-pk]').dataset.pk, i = parts.findIndex(x => x.k === k), j = i + Number(b.dataset.pmv); [parts[i], parts[j]] = [parts[j], parts[i]]; paint(); return; }
                    if (b.dataset.nf && st) { const L = ART.layout(st, kindOf(), 'export').fields.find(f => f.key === b.dataset.nf); ART.setVisible(st, kindOf(), 'export', b.dataset.nf, !L?.on); try { await ART.persistSettings?.(st); } catch (_) {} paint(); } });
                let drag = null;
                dg.addEventListener('dragstart', e => { drag = e.target.closest?.('[data-pk]'); });
                dg.addEventListener('dragover', e => { const o = e.target.closest?.('[data-pk]'); if (!drag || !o || o === drag) return; e.preventDefault(); const r = o.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) o.before(drag); else o.after(drag); });
                dg.addEventListener('dragend', () => { if (!drag) return; drag = null; parts = [...dg.querySelectorAll('[data-pk]')].map(r => parts.find(x => x.k === r.dataset.pk)); dg._paint(); });
            },
            onSubmit: async f => {
                if (!st) return window.LCNDA_UI.fail(f.querySelector('.pk'), 'Choisis l’artiste.');
                const v = Object.fromEntries(new FormData(f)), list0 = v.which === 'list' ? listOf() : st.of(kindOf());
                const list = ART.sortItems ? ART.sortItems(list0, v.order) : list0;
                if (!list.length) { A().toast(mode === 'catalogue' ? 'Aucune œuvre à mettre dans le livre.' : 'Aucun disque à mettre dans le livre.', 'error'); return false; }
                try { localStorage.setItem(PREF, JSON.stringify({...readP(), design: v.design, format: v.format, layout: v.layout, hide: !!v.hide, [`parts_${mode}`]: parts})); } catch (_) {}
                const o = {mode, design: v.design, format: v.format, layout: v.layout, hide: !!v.hide, parts: parts.filter(x => x.on).map(x => x.k)};
                if (!kit) { printBook(st, list, o); return true; }
                const doc = buildDoc(st, list, o); const name = `${mode === 'catalogue' ? 'Catalogue raisonné' : 'Discographie'} — ${st.name}`;
                kit.openEditor({id: 0, name, doc, onSaved});
                return true;
            }});
        return dlg;
    }

    /* ═════════ Le livre dans la mise en page ═════════ */
    function buildDoc(st, list, o) {
        const K = ext.layoutKit, th = K.THEMES.find(t => t.id === o.design) || K.THEMES[0], fm = FORMATS.find(x => x[0] === o.format) || FORMATS[0];
        const doc = K.themeDoc(th, '', {w: fm[2], h: fm[3]});
        const kind = o.mode === 'catalogue' ? 'work' : 'release';
        doc.title = o.mode === 'catalogue' ? `${st.name}, catalogue raisonné` : `${st.name}, discographie`;
        if (!doc.paraStyles.some(s => s.id === 'ps-name')) K.baseStyles({titleFont: th.titleFont, bodyFont: th.bodyFont, bodySize: 10}).forEach(s => { if (!doc.paraStyles.some(x => x.id === s.id)) doc.paraStyles.push(s); });
        doc.pages = [];
        const page = (master = 'A') => { const pg = {id: K.nid('p'), master, items: []}; doc.pages.push(pg); return pg; };
        const chapter = (title, paras, cols = 1) => { const pg = page(), b = K.box(doc, doc.pages.length - 1); pg.items.push(K.textItem({x: b.x, y: b.y, w: b.w, h: 18, html: `<p data-ps="ps-chapter">${esc(title)}</p>`, name: 'Chapitre'})); pg.flowTop = b.y + 20; K.flow(doc, paras.length ? paras : [{ps: 'ps-body', text: ' '}], {first: pg, columns: cols}); delete pg.flowTop; };
        const pr = st.of('profile')[0]?.data || {}, now = new Date().toISOString().slice(0, 16);
        const fieldsExport = ART.layout(st, kind, 'export').fields.filter(f => f.on).map(f => f.key);
        const notice = (it, b, h = null) => K.textItem({x: b.x, y: b.y, w: b.w, h: h || b.h, html: noticeParas(st, it, fieldsExport, {hideLiving: o.hide}), name: `Notice — ${it.title}`, dyn: {type: 'art', id: it.id, fields: fieldsExport, part: o.hide ? 'hide' : '', at: now}});
        const frame = (it, x, y, w, h) => { const ph = ART.normPhotos(it.data.photos)[0]; return K.shapeItem('frame', {x, y, w, h, src: ph?.f ? `media/${ph.f}` : '', mediaId: ph?.mid || undefined, srcName: it.title, fit: 'fit', fill: ph?.f ? 'none' : 'sw-light', stroke: {c: 'none', w: 0}, name: `Image — ${it.title}`}); };
        const cap = (it, x, y, w) => K.textItem({x, y, w, h: 8, html: `<p data-ps="ps-caption">${esc([String(it.data.catref || '').replace(/^CR\s*/i, '') && `Fig. ${String(it.data.catref).replace(/^CR\s*/i, '')}`, it.title, it.year].filter(Boolean).join(' — '))}</p>`, name: 'Légende'});
        o.parts.forEach(part => {
            if (part === 'cover') { const first = list.find(i => ART.normPhotos(i.data.photos)[0]?.f); page('B').items.push(...K.coverItems(doc, th, {title: st.name, subtitle: o.mode === 'catalogue' ? 'Catalogue raisonné' : 'Discographie', author: '', photo: first ? `media/${ART.normPhotos(first.data.photos)[0].f}` : ''})); }
            if (part === 'intro') chapter('Introduction', String(pr.bio || `${st.name}.`).split(/\n+/).filter(Boolean).map(t => ({ps: 'ps-body', text: t})));
            if (part === 'chrono') chapter('Chronologie', ART.sortItems([...st.of('work'), ...st.of('release'), ...st.of('exhibition'), ...st.of('book'), ...st.of('film')], 'year').filter(i => i.year).map(i => ({ps: 'ps-list', lead: String(i.year), text: `${ART.defs[i.kind]?.label || ''} — ${i.title}`})));
            if (part === 'notices') {
                // par période (décennie) pour un catalogue raisonné
                let period = '';
                list.forEach((it, n) => {
                    const dec = it.year ? `${Math.floor(it.year / 10) * 10}` : '';
                    if (o.mode === 'catalogue' && dec && dec !== period && (o.layout === 'one' || o.layout === 'spread')) { period = dec; }
                    if (o.layout === 'spread' || o.mode === 'discography') {
                        const pl = page(), bl = K.box(doc, doc.pages.length - 1); pl.items.push(frame(it, bl.x, bl.y, bl.w, bl.h - 12), cap(it, bl.x, bl.y + bl.h - 10, bl.w));
                        const pr2 = page(), br = K.box(doc, doc.pages.length - 1); pr2.items.push(notice(it, br));
                    } else if (o.layout === 'one') {
                        const pg = page(), b = K.box(doc, doc.pages.length - 1), ih = b.h * 0.55; pg.items.push(frame(it, b.x, b.y, b.w, ih), cap(it, b.x, b.y + ih + 1, b.w), notice(it, {x: b.x, y: b.y + ih + 11, w: b.w, h: b.h - ih - 11}));
                    } else {
                        const per = o.layout === 'two' ? 2 : 4; if (n % per === 0) page(); const pg = doc.pages[doc.pages.length - 1], b = K.box(doc, doc.pages.length - 1), k = n % per, rows = per === 2 ? 2 : 2, cols = per === 2 ? 1 : 2;
                        const cw = (b.w - (cols - 1) * 6) / cols, chh = (b.h - (rows - 1) * 6) / rows, x = b.x + (k % cols) * (cw + 6), y = b.y + Math.floor(k / cols) * (chh + 6), iw = cw * 0.42;
                        pg.items.push(frame(it, x, y, iw, chh * 0.7), notice(it, {x: x + iw + 4, y, w: cw - iw - 4, h: chh}));
                    }
                });
            }
            if (part === 'expos') chapter('Expositions', ART.sortItems(st.of('exhibition'), 'year').map(x => ({ps: 'ps-list', lead: String(x.data.dates || x.year || ''), text: `${x.title}${x.data.place ? `, ${U.placeTitle(x.data.place)}` : ''} — ${U.plural(st.linksTo(x.id, 'exhibitions').length, 'œuvre')}`})));
            if (part === 'biblio') chapter('Bibliographie', ART.sortItems(st.of('book'), 'year').map(b => ({ps: 'ps-list', text: [ART.normPeople(b.data.authors).map(a => a.title || a.txt).join(', '), b.title, U.refTitle(b.data.publisher), b.data.place && U.placeTitle(b.data.place), b.year].filter(Boolean).join(', ')})));
            if (part === 'index') { const titles = list.map(i => ({ps: 'ps-list', text: `${i.title} — ${i.data.catref || i.year || ''}`})).sort((a, b) => a.text.localeCompare(b.text, 'fr'));
                const places = [...new Set(list.map(i => U.placeTitle(i.data.location)).filter(Boolean))].sort().map(t => ({ps: 'ps-list', text: `${t} — ${list.filter(i => U.placeTitle(i.data.location) === t).map(i => i.data.catref || i.title).join(', ')}`}));
                const owners = [...new Set(list.map(i => U.nameOf(i.data.owner)).filter(Boolean))].sort().map(t => ({ps: 'ps-list', text: `${t} — ${list.filter(i => U.nameOf(i.data.owner) === t).map(i => i.data.catref || i.title).join(', ')}`}));
                chapter('Index', [{ps: 'ps-head', text: 'Titres'}, ...titles, ...(places.length ? [{ps: 'ps-head', text: 'Lieux'}, ...places] : []), ...(owners.length && !o.hide ? [{ps: 'ps-head', text: 'Propriétaires'}, ...owners] : [])], 2); }
            if (part === 'concord') chapter('Concordances', list.map(i => ({ps: 'ps-list', text: [i.data.catref || i.data.catno, i.data.inv && `inv. ${i.data.inv}`, i.data.museum_inv && `musée ${i.data.museum_inv}`, i.data.sale].filter(Boolean).join(' ↔ ') || i.title})), 2);
            if (part === 'lost') chapter('Œuvres non retrouvées', list.filter(i => ['inconnu', 'perdu', 'detruit'].includes(i.data.status)).map(i => ({ps: 'ps-list', lead: i.data.catref || '', text: `${i.title}${i.year ? `, ${i.year}` : ''}`})));
            if (part === 'tracks') { const t = []; list.forEach(r => ART.arr(r.data.tracks).filter(x => !x.heading).forEach(x => t.push({ps: 'ps-list', text: `${x.title} — ${r.title}${r.year ? ` (${r.year})` : ''}, ${x.pos || ''}`}))); chapter('Index des morceaux', t.sort((a, b) => a.text.localeCompare(b.text, 'fr')), 2); }
            if (part === 'credits') { const m = new Map(); list.forEach(r => [...ART.normPeople(r.data.credits), ...ART.arr(r.data.tracks).flatMap(x => ART.normPeople(x.credits))].forEach(c => { const n = c.title || c.txt; if (!n) return; if (!m.has(n)) m.set(n, new Set()); m.get(n).add(`${c.role ? `${c.role}, ` : ''}${r.title}`); })); chapter('Musiciens et crédits', [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr')).map(([n, s]) => ({ps: 'ps-list', text: `${n} — ${[...s].join(' ; ')}`})), 2); }
        });
        if (!doc.pages.length) page();
        return doc;
    }

    /* ═════════ Sans la mise en page : un livre à imprimer ═════════ */
    function printBook(st, list, o) {
        const w = window.open('', '_blank'); if (!w) return A().toast('La fenêtre d’impression est bloquée par le navigateur.', 'error');
        const abs = s => (s ? new URL(s, location.href).href : '');
        const html = list.map(it => { const ph = U.photoSrc(ART.normPhotos(it.data.photos)[0]); return `<section class="sp"><div class="l">${ph ? `<img src="${esc(abs(ph))}">` : ''}<p class="cap">${esc(it.title)}</p></div><div class="r">${noticeParas(st, it, null, {hideLiving: o.hide}).replace(/data-ps="ps-chapter"/, 'class="no"').replace(/data-ps="ps-name"/, 'class="ti"').replace(/data-ps="ps-head"/g, 'class="lbl"').replace(/data-ps="[^"]*"/g, '')}</div></section>`; }).join('');
        w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(st.name)}</title><style>body{font:11px/1.45 Georgia,serif;color:#222;margin:0}h1{font:700 40px Georgia;text-align:center;margin:30vh 0 10px}.sp{display:grid;grid-template-columns:1fr 1fr;gap:20px;page-break-after:always;padding:18mm}.l img{max-width:100%;max-height:220mm;display:block;margin:auto}.cap{text-align:center;font-style:italic;color:#777}.no{font:700 26px Georgia;color:#8a6a3a;margin:0}.ti{font:italic 700 17px Georgia;margin:0 0 4px}.lbl{font:700 8px system-ui;letter-spacing:.14em;color:#8a6a3a;text-transform:uppercase;margin:8px 0 2px}p{margin:2px 0}</style><h1>${esc(st.name)}</h1><p style="text-align:center;page-break-after:always">${o.mode === 'catalogue' ? 'Catalogue raisonné' : 'Discographie'}</p>${html}<script>onload=()=>setTimeout(()=>print(),400)<\/script>`); w.document.close();
    }

    ext.artistCatalogue = {wizard, noticeHtml, noticeParas, buildDoc};
})();
