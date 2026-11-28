/* LCNDA — 🔎 Enquête photo : la suite, 2ᵉ partie (6 aides). Chargé après heritage-enquete-photo-suite.js ; s'ajoute à la grille des aides
 * et aux boutons des questions guidées (ext.enquetePhotoPlus), et à ⚙️ Personnaliser (ext.enquetePhotoSuite.prefsHtml / prefsRead).
 * Calculs : app-enquete-photo-core.js (albumCheck, imageWindows, yearGaps, learnFacts, byYear, nextNumber).
 * Serveur : lib/enquete_photo.php (GET ep&op= place_timeline, group_expected, versos, person_years) ; « Cette photo m'apprend » écrit dans
 * l'arbre par les actions habituelles (add_event, add_web_source ; ↶ Annuler : delete_source, delete_event). Essai : tests/test-enquete-photo.js.
 *  📒 classement d'un album (glisser les photos dans l'ordre supposé ; les âges notés et les indices de date qui se contredisent sont signalés) ·
 *  🏘 le même lieu à travers le temps (toutes les photos d'un lieu, de la plus ancienne à la plus récente) ·
 *  📝 cette photo m'apprend (résidence, présence datée, métier : un bouton par fait, l'enquête comme source, ↶ Annuler) ·
 *  🎓 photo de groupe : qui devrait y être (classe d'école, conscrits, noce), à poser sur la photo avec les personnes numérotées ·
 *  🔄 les dos côte à côte (tampons, écritures, numéros : repérer un même lot) · 🕳 les années sans photo d'une personne.
 * Réglages (⚙️ Personnaliser) : écart d'âge toléré, âges d'une classe d'école, trou le plus court signalé. Pas de table de plus :
 * settings_json garde l'ordre supposé (albumOrder).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {}, UI = () => window.LCNDA_UI || {}, C = () => window.LCNDA_EP_CORE, EP = () => ext.enquetePhoto || {}, X = () => ext.enquetePhotoAides || {}, S2 = () => ext.enquetePhotoSuite || {};
    const T = (s, v) => { if (v) v = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number.isInteger(x) ? String(x) : x])); return window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)); };
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (m, k) => A().toast?.(m, k);
    const undoToast = (m, o) => (A().undoToast ? A().undoToast(m, o) : toast(m));
    const empty = (t, icon = '🔍') => (A().empty ? A().empty(t, {icon}) : `<p class="empty-line">${esc(t)}</p>`);
    const dlgOpen = o => ext.openDialog?.(o);
    const seg = (label, items, cls = '') => (UI().segmented ? UI().segmented({label, cls, items}) : items.map(i => `<button type="button" class="button small secondary${i.on ? ' is-active' : ''}" ${i.attrs}>${i.html}</button>`).join(''));
    const plural = (n, w, pl) => (A().plural ? A().plural(n, w, pl) : `${n} ${n > 1 ? (pl || w + 's') : w}`);
    const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const thumb = f => (f ? `media/${encodeURIComponent(f)}` : '');
    const photos = api => api.images.filter(im => im.media?.media_type === 'image' && im.media.filename && !im.media.missing && im.side !== 'verso');
    const settings = api => api.inq.settings || {};
    const prefs = () => ({ageTol: 1, schoolFrom: 6, schoolTo: 13, gapMin: 3, ...(EP().prefs?.() || {})});
    const CERT_L = {proven: 'Prouvé', probable: 'Probable', supposed: 'Supposé', refuted: 'Réfuté'};
    const cb = c => (EP().current?.api?.().certBadge ? EP().current.api().certBadge(c) : `<span class="ui-badge">${esc(T(CERT_L[c] || 'Supposé'))}</span>`);
    let saveT = 0;
    function saveSettings(api, patch) {
        if (api.ro) return; api.inq.settings = {...(api.inq.settings || {}), ...patch}; clearTimeout(saveT);
        saveT = setTimeout(() => api.post('update', {id: api.inq.id, settings: api.inq.settings}).catch(e => toast(e.message, 'error')), 400);
    }
    const flush = api => { if (saveT) { clearTimeout(saveT); saveT = 0; return api.post('update', {id: api.inq.id, settings: api.inq.settings}).catch(() => {}); } return Promise.resolve(); };

    /* ═════════ 1. 📒 classement d'un album : l'ordre supposé, contrôlé par les âges notés et les dates ═════════ */
    function windowsOf(api, list) {
        const w = C().imageWindows(api.clues, list.map(im => im.id));
        list.forEach(im => { const y = C().yearOf(im.media?.date_text); const k = String(im.id); if (y && w[k].from == null && w[k].to == null) w[k] = {from: y, to: y, media: true}; });
        return w;
    }
    function orderOf(api, list) {
        const saved = (settings(api).albumOrder || []).map(String).filter(id => list.some(im => String(im.id) === id));
        return [...saved, ...list.map(im => String(im.id)).filter(id => !saved.includes(id))];
    }
    function classement(api) {
        const list = photos(api); if (list.length < 2) return toast(T('Il faut au moins deux photos dans l’enquête.'), 'error');
        let order = orderOf(api, list);
        const byId = id => list.find(im => String(im.id) === String(id)), L = id => api.letterOf(byId(id));
        const ageOf = (id, rows) => rows.map(r => r.ages?.[id]).filter(v => v !== '' && v != null).map(v => T('{n} ans', {n: v})).join(', ');
        const check = () => C().albumCheck(order, {ages: settings(api).growth || [], windows: windowsOf(api, list), tol: Number(prefs().ageTol) || 1});
        const issueText = i => (i.kind === 'age' ? T('{a} est avant {b}, mais {w} y paraît plus âgé ({x} ans contre {y}).', {a: L(i.a), b: L(i.b), w: i.who ? `« ${i.who} »` : T('l’enfant'), x: i.ageA, y: i.ageB})
            : T('{a} est avant {b}, mais {a} n’est pas d’avant {f} et {b} pas d’après {t}.', {a: L(i.a), b: L(i.b), f: i.from, t: i.to}));
        const rowsHtml = r => { const w = windowsOf(api, list), rows = settings(api).growth || [];
            return `<ol class="ep3-order" data-c3-list>${order.map((id, k) => { const im = byId(id), win = w[id] || {};
                return `<li class="ep3-oi${r.bad.has(id) ? ' is-bad' : ''}" data-c3-id="${esc(id)}" ${api.ro ? '' : 'draggable="true"'}><span class="ep3-grip" aria-hidden="true">${api.ro ? '' : '⠿'}</span><span class="ep3-k">${k + 1}</span>
                    <img src="${esc(api.mediaSrc({filename: im.media.thumbnail || im.media.filename}))}" alt="" loading="lazy"><span class="ep3-ot"><b>${esc(L(id))} · ${esc(im.label || im.media.title || '')}</b>
                    <small class="muted">${esc([win.from != null || win.to != null ? (win.from === win.to ? String(win.from) : T('{a} à {b}', {a: win.from ?? '…', b: win.to ?? '…'})) : T('sans date'), ageOf(id, rows)].filter(Boolean).join(' · '))}</small></span>
                    ${api.ro ? '' : `<span class="ep3-ob"><button type="button" class="icon-button small" data-c3-up="${esc(id)}" ${k ? '' : 'disabled'} aria-label="${esc(T('Avancer'))}" title="${esc(T('Avancer'))}">↑</button><button type="button" class="icon-button small" data-c3-down="${esc(id)}" ${k < order.length - 1 ? '' : 'disabled'} aria-label="${esc(T('Reculer'))}" title="${esc(T('Reculer'))}">↓</button></span>`}</li>`; }).join('')}</ol>`; };
        const resHtml = r => (r.issues.length ? `<div class="ui-notice ep3-issues" role="status"><b>⚠️ ${esc(T('{n} à revoir', {n: plural(r.issues.length, 'contradiction')}))}</b><ul>${r.issues.slice(0, 20).map(i => `<li>${esc(issueText(i))}</li>`).join('')}</ul></div>`
            : `<p class="ep3-ok" role="status">✓ ${esc(r.checked ? T('Rien ne se contredit dans cet ordre (âges notés et dates).') : T('Note des âges (👶 Croissance) ou des indices de date pour que l’app vérifie l’ordre.'))}</p>`);
        const paint = dg => { const r = check(); dg.querySelector('[data-c3-host]').innerHTML = rowsHtml(r); dg.querySelector('[data-c3-res]').innerHTML = resHtml(r); };
        const setOrder = (dg, o) => { order = o; saveSettings(api, {albumOrder: order.map(Number)}); paint(dg); };
        dlgOpen({eyebrow: T('📒 CLASSEMENT D’UN ALBUM'), title: T('Les photos dans l’ordre supposé'), submitLabel: T('Fermer'), wide: true,
            body: `<p class="ui-hint">${esc(T('Fais glisser les photos dans l’ordre où tu crois qu’elles ont été prises (ou ↑ ↓). L’app vérifie avec les âges notés (👶 Croissance des enfants) et les indices de date, et signale ce qui se contredit.'))}</p>
                <div data-c3-host></div><div data-c3-res aria-live="polite"></div>
                ${api.ro ? '' : `<div class="ep-row"><button type="button" class="button small secondary" data-c3-ages>👶 ${esc(T('Noter les âges'))}</button><button type="button" class="button small" data-c3-keep>＋ ${esc(T('Garder l’ordre comme indice'))}</button><button type="button" class="button small secondary" data-c3-sort>↕ ${esc(T('Ranger les images dans cet ordre'))}</button></div>`}`,
            onOpen: dg => {
                let drag = null;
                dg.addEventListener('dragstart', e => { const li = e.target.closest?.('[data-c3-id]'); if (!li) return; drag = li.dataset.c3Id; li.classList.add('is-dragging'); try { e.dataTransfer.setData('text/plain', drag); e.dataTransfer.effectAllowed = 'move'; } catch (_) {} });
                dg.addEventListener('dragend', () => { drag = null; dg.querySelectorAll('.is-dragging, .is-over').forEach(x => x.classList.remove('is-dragging', 'is-over')); });
                dg.addEventListener('dragover', e => { const li = e.target.closest?.('[data-c3-id]'); if (!li || !drag) return; e.preventDefault(); dg.querySelectorAll('.is-over').forEach(x => x.classList.remove('is-over')); li.classList.add('is-over'); });
                dg.addEventListener('drop', e => { const li = e.target.closest?.('[data-c3-id]'); if (!li || !drag) return; e.preventDefault(); const from = order.indexOf(drag), to = order.indexOf(li.dataset.c3Id); if (from < 0 || to < 0 || from === to) return; const o = order.slice(); o.splice(to, 0, ...o.splice(from, 1)); setOrder(dg, o); });
                dg.addEventListener('click', async e => {
                    const up = e.target.closest('[data-c3-up]'), dn = e.target.closest('[data-c3-down]');
                    if (up || dn) { const id = (up || dn).dataset[up ? 'c3Up' : 'c3Down'], i = order.indexOf(id), j = i + (up ? -1 : 1); if (j < 0 || j >= order.length) return; const o = order.slice(); [o[i], o[j]] = [o[j], o[i]]; setOrder(dg, o); dg.querySelector(`[data-c3-${up ? 'up' : 'down'}="${CSS.escape(id)}"]`)?.focus(); return; }
                    if (e.target.closest('[data-c3-ages]')) { await flush(api); ext.enquetePhotoPlus?.open?.('croissance', api); return; }
                    if (e.target.closest('[data-c3-keep]')) { const r = check(), o = order.map(id => L(id)).join(' → ');
                        await api.addClue({kind: 'date', text: T('Ordre supposé de l’album : {o}', {o}), certainty: 'supposed', why: r.issues.length ? T('Rangé à la main ; {n} encore à revoir', {n: plural(r.issues.length, 'contradiction')}) : T('Rangé à la main ; ni les âges notés ni les dates ne le contredisent'), images: Object.fromEntries(order.map(id => [id, 'yes'])), data: {albumOrder: order.map(Number), issues: r.issues.length}}); toast(T('Ordre gardé comme indice.'), 'success'); return; }
                    if (e.target.closest('[data-c3-sort]')) { const before = api.images.map(im => [im.id, im.position]), rest = api.images.filter(im => !order.includes(String(im.id)));
                        const seq = [...order.map(byId), ...rest]; for (let i = 0; i < seq.length; i++) await api.post('image_save', {image_id: seq[i].id, position: i}); await flush(api); dg.close(); await api.reload();
                        undoToast(T('Images rangées dans l’ordre de l’album'), {undo: async () => { for (const [id, p] of before) await api.post('image_save', {image_id: id, position: p}); await api.reload(); }}); }
                });
                paint(dg);
            },
            onSubmit: () => { flush(api); return true; }});
    }

    /* ═════════ 2. 🏘 le même lieu à travers le temps ═════════ */
    async function sameplace(api, placeId = 0) {
        let pl = placeId ? {id: placeId} : X().placeOf?.(api);
        if (!pl?.id) { const P = window.LCNDA_PICKER || A(); const it = await P.openPicker?.({kind: 'place', title: T('Quel lieu ?')}); if (!it?.id) return; pl = {id: Number(it.id), name: it.title}; }
        const dg = dlgOpen({eyebrow: T('🏘 LE MÊME LIEU À TRAVERS LE TEMPS'), title: T('Toutes les photos d’un lieu'), submitLabel: T('Fermer'), wide: true,
            body: `<p class="ui-hint">${esc(T('Les photos des enquêtes qui ont conclu à ce lieu, et les photos posées à ce lieu dans Documents, de la plus ancienne à la plus récente : ce qui a changé (une façade, un arbre, une enseigne) aide à dater.'))}</p><div data-c3-tl aria-live="polite">${UI().spinner ? UI().spinner(T('Chargement…')) : ''}</div>`, onSubmit: () => true});
        if (!dg) return;
        let r; try { r = await api.get('place_timeline', {place_id: pl.id}); } catch (e) { dg.querySelector('[data-c3-tl]').innerHTML = empty(e.message, '🏘'); return dg; }
        const mine = new Set(api.images.map(im => im.media_id)), host = dg.querySelector('[data-c3-tl]');
        if (!r.photos.length) { host.innerHTML = empty(T('Aucune photo de {p} pour l’instant.', {p: r.place.name}), '🏘'); return dg; }
        host.innerHTML = `<h4>📍 ${esc(r.place.name)} · ${esc(plural(r.photos.length, 'photo'))}${r.undated ? ` <small class="muted">(${esc(T('{n} sans date, à la fin', {n: r.undated}))})</small>` : ''}</h4>
            <ol class="ep3-tl">${C().byYear(r.photos).map(g => `<li class="ep3-ty"><span class="ep3-yr">${esc(g.year == null ? T('Sans date') : String(g.year))}</span><div class="ep3-tph">${g.photos.map(p => `<figure class="ep3-fig${mine.has(p.media_id) ? ' is-mine' : ''}">
                <img src="${esc(thumb(p.thumb))}" alt="${esc(p.title)}" loading="lazy"><figcaption><b>${esc(p.title)}</b><small class="muted">${esc([p.date_text, p.inquiry ? `🔎 ${p.inquiry.title}` : T('Documents'), p.certainty ? T(CERT_L[p.certainty] || '') : ''].filter(Boolean).join(' · '))}</small>
                ${mine.has(p.media_id) ? `<small>${esc(T('dans cette enquête'))}</small>` : api.ro ? '' : `<button type="button" class="button small secondary" data-c3-add="${p.media_id}">＋ ${esc(T('Comparer dans l’enquête'))}</button>`}</figcaption></figure>`).join('')}</div></li>`).join('')}</ol>`;
        host.onclick = async e => { const b = e.target.closest('[data-c3-add]'); if (!b || api.ro) return; b.disabled = true; await EP().current?.addImages?.([Number(b.dataset.c3Add)]); b.textContent = T('✓ Ajoutée'); };
        return dg;
    }

    /* ═════════ 3. 📝 cette photo m'apprend : les faits à reporter dans l'arbre ═════════ */
    const peopleCache = {};
    async function peopleOn(api) {
        const ids = new Set((api.inq.links || []).filter(l => l.kind === 'person' && l.ref_id > 0).map(l => l.ref_id));
        Object.values(settings(api).people || {}).forEach(L => (L || []).forEach(m => { if (m && m.person_id) ids.add(Number(m.person_id)); }));
        const need = [...ids].filter(id => !peopleCache[id]);
        if (need.length) { try { const r = await api.get('face_people', {ids: need.join(',')}); Object.entries(r.people || {}).forEach(([k, p]) => { peopleCache[k] = p; }); } catch (_) {} }
        return [...ids].map(id => peopleCache[id]).filter(p => p && p.id && !(api.ro && p.private));
    }
    function jobsOf(api) {
        const items = S2().GUIDES?.metiers?.items || [], out = [], seen = new Set();
        api.clues.filter(c => c.certainty !== 'refuted').forEach(c => {
            const t = fold(c.text); let w = c.data?.job || '';
            if (!w) w = items.flatMap(x => x.w).find(x => new RegExp(`(^|[^a-z])${fold(x).replace(/[^a-z ]/g, '.')}([^a-z]|$)`).test(t)) || '';
            if (w && !seen.has(fold(w))) { seen.add(fold(w)); out.push({word: w, certainty: c.certainty, clue: c.num}); }
        });
        return out;
    }
    const FACT = {residence: ['🏠', 'RESI', 'Lieu de résidence'], presence: ['📍', 'RESI', 'Présence attestée'], occupation: ['👔', 'OCCU', 'Profession']};
    function typeId(tag) { const L = A().state?.bootstrap?.eventTypes || []; return Number((L.find(t => t.scope === 'person' && String(t.gedcom_tag).toUpperCase() === tag) || {}).id) || 0; }
    const factText = f => `${FACT[f.kind][0]} ${f.name} : ${T(FACT[f.kind][2]).toLowerCase()}${f.kind === 'occupation' ? ` « ${f.job} »` : f.place ? ` — ${f.place}` : ''}${f.date_text ? `, ${f.date_text}` : ''}`;
    async function learn(api) {
        const people = await peopleOn(api), facts = C().learnFacts({conclusion: api.inq.conclusion || {}, people, jobs: jobsOf(api), t: T});
        const why = C().sentence(api.inq.conclusion || {}, {t: T});
        const dg = dlgOpen({eyebrow: T('📝 CETTE PHOTO M’APPREND'), title: T('Ce que la photo apprend sur l’arbre'), submitLabel: T('Fermer'), wide: true,
            body: `<p class="ui-hint">${esc(T('Les faits tirés de la conclusion (lieu, date) et des indices de métier, pour chaque personne reliée ou numérotée. Un clic les ajoute à la fiche, avec l’enquête comme source ; « ↶ Annuler » les retire.'))}</p>
                ${facts.length ? `<ul class="ep3-facts">${facts.map((f, i) => `<li class="ep3-fact"><span>${esc(factText(f))} ${cb(f.certainty)}</span>${api.ro ? '' : `<button type="button" class="button small" data-c3-fact="${i}">＋ ${esc(T('Ajouter à la fiche'))}</button>`}</li>`).join('')}</ul>`
                    : empty(people.length ? T('La conclusion n’a pas encore de lieu de la base ni de date, et aucun indice ne dit un métier.') : T('Relie d’abord l’enquête à une personne (🔗 Relier…) ou numérote les personnes sur la photo (🔢).'), '📝')}`, onSubmit: () => true});
        if (!dg) return;
        dg.addEventListener('click', async e => {
            const b = e.target.closest('[data-c3-fact]'); if (!b || api.ro || b.disabled) return; const f = facts[Number(b.dataset.c3Fact)]; if (!f) return;
            const tid = typeId(FACT[f.kind][1]); if (!tid) return toast(T('Ce type d’événement n’existe pas dans la base.'), 'error');
            b.disabled = true;
            const body = {person_id: f.person_id, event_type_id: tid, date_text: f.date_text || '', description: f.kind === 'occupation' ? f.job : T('D’après la photo de l’enquête « {t} »', {t: api.inq.title}), ...(f.place_id ? {place_id: f.place_id} : {}), ...(f.kind === 'presence' ? {title: T('Présent sur une photo')} : {})};
            let ev, src;
            try {
                ev = await A().api('add_event', {}, {method: 'POST', body}); const evId = Number((ev?.result || ev)?.id);
                src = await A().api('add_web_source', {}, {method: 'POST', body: {person_id: f.person_id, entity_type: 'event', event_id: evId, source_type: 'other', title: T('Enquête photo « {t} »', {t: api.inq.title}).slice(0, 480),
                    text: [why, ...api.clues.filter(c => c.certainty !== 'refuted').slice(0, 12).map(c => `${c.num}. ${c.text} (${T(CERT_L[c.certainty] || '')})`)].filter(Boolean).join('\n'), note: T('Certitude : {c}', {c: T(CERT_L[f.certainty] || 'Supposé')})}});
                const srcId = Number((src?.result || src)?.id);
                await api.post('journal', {id: api.inq.id, what: T('📝 Reporté dans l’arbre'), result: factText(f)}).catch(() => {});
                b.textContent = T('✓ Ajouté');
                undoToast(T('Ajouté à la fiche de {n}', {n: f.name}), {undo: async () => { if (srcId) await A().api('delete_source', {}, {method: 'POST', body: {id: srcId}}).catch(() => {}); await A().api('delete_event', {}, {method: 'POST', body: {id: evId}}); b.disabled = false; b.textContent = `＋ ${T('Ajouter à la fiche')}`; }});
            } catch (err) { b.disabled = false; toast(err.message, 'error'); }
        });
        return dg;
    }

    /* ═════════ 4. 🎓 photo de groupe : qui devrait y être ═════════ */
    const KINDS = [['school', '🎓', 'Classe d’école'], ['conscrits', '🎖', 'Conscrits'], ['wedding', '💒', 'Noce']];
    const ROLES = {married: 'marié(e)', parent: 'parent', sibling: 'frère ou sœur', grandparent: 'grand-parent', uncle: 'oncle ou tante', child: 'enfant', family: 'famille', pupil: 'élève', conscrit: 'conscrit'};
    async function group(api) {
        const w = X().yearWin?.(api) || {}, occ = api.clues.find(c => c.data?.occasion === 'mariage' && c.data.event_id && c.certainty !== 'refuted');
        const st = {kind: occ ? 'wedding' : (api.clues.some(c => c.data?.occasion === 'conscrits') ? 'conscrits' : 'school'), year: w.from && w.to ? Math.round((w.from + w.to) / 2) : (w.from || w.to || ''), list: [], pick: new Set()};
        const dg = dlgOpen({eyebrow: T('🎓 PHOTO DE GROUPE'), title: T('Qui devrait être sur la photo ?'), submitLabel: T('Fermer'), wide: true,
            body: `<p class="ui-hint">${esc(T('Une classe, des conscrits, une noce : l’arbre propose les personnes attendues ce jour-là. Coche celles à poser sur la photo : elles reçoivent un numéro (🔢), à glisser ensuite sur le bon visage. Ce n’est qu’une liste de possibles (« Supposé »).'))}</p>
                <div class="ep-xrow">${seg(T('Sorte de photo'), KINDS.map(([k, i, l]) => ({on: st.kind === k, attrs: `data-c3-kind="${k}"`, html: `${i} ${esc(T(l))}`})), 'ep3-kinds')}
                    <label>${esc(T('Année'))} <input data-c3-year inputmode="numeric" maxlength="4" value="${esc(st.year)}" style="width:6em"></label></div>
                <div data-c3-g aria-live="polite"></div>`, onSubmit: () => true});
        if (!dg) return;
        const host = dg.querySelector('[data-c3-g]');
        const load = async () => {
            host.innerHTML = UI().spinner ? UI().spinner(T('Chargement…')) : '';
            const q = {kind: st.kind, year: st.year || ''};
            if (st.kind === 'wedding') { if (occ) q.event_id = occ.data.event_id; else q.person_ids = (api.inq.links || []).filter(l => l.kind === 'person').map(l => l.ref_id).slice(0, 2).join(','); }
            if (st.kind === 'school') { q.age_from = prefs().schoolFrom; q.age_to = prefs().schoolTo; }
            let r; try { r = await api.get('group_expected', q); } catch (e) { host.innerHTML = empty(e.message, '🎓'); return; }
            st.list = r.people || []; st.pick = new Set();
            host.innerHTML = st.list.length ? `<p><b>${esc(plural(st.list.length, 'personne attendue', 'personnes attendues'))}</b>${r.year ? ` · ${esc(String(r.year))}` : ''}</p>
                <ul class="ep3-group">${st.list.map((p, i) => `<li><label class="checkbox-line"><input type="checkbox" data-c3-p="${i}" ${api.ro || !p.id ? 'disabled' : ''}> <span><b>${esc(p.name)}</b> <small class="muted">${esc([T(ROLES[p.role] || p.role), p.age != null ? T('{n} ans', {n: p.age}) : '', p.birth || p.death ? `${p.birth || '?'}–${p.death || ''}` : ''].filter(Boolean).join(' · '))}</small></span></label></li>`).join('')}</ul>
                ${api.ro ? '' : `<div class="ep-row"><button type="button" class="button small" data-c3-place disabled>🔢 ${esc(T('Poser les cochés sur la photo'))}</button></div>`}`
                : empty(st.kind === 'wedding' ? T('Personne de la famille des mariés n’est connue dans l’arbre pour cette année-là.') : T('Personne de l’arbre n’a l’âge voulu à ce lieu cette année-là.'), '🎓');
        };
        dg.addEventListener('click', e => {
            const k = e.target.closest('[data-c3-kind]'); if (k) { st.kind = k.dataset.c3Kind; UI().segPick?.(k); load(); return; }
            if (e.target.closest('[data-c3-place]')) { place(api, [...st.pick].map(i => st.list[i]).filter(p => p?.id)); dg.close(); }
        });
        dg.addEventListener('change', e => {
            if (e.target.matches('[data-c3-year]')) { const y = Number(e.target.value); st.year = y >= 1000 && y <= 2200 ? y : ''; load(); return; }
            const c = e.target.closest('[data-c3-p]'); if (c) { if (c.checked) st.pick.add(Number(c.dataset.c3P)); else st.pick.delete(Number(c.dataset.c3P)); const b = dg.querySelector('[data-c3-place]'); if (b) b.disabled = !st.pick.size; }
        });
        load();
        return dg;
    }
    /** les personnes cochées → des numéros en bas de la photo (🔢 de la suite), à glisser ensuite sur les visages */
    async function place(api, people) {
        const im = api.img && photos(api).includes(api.img) ? api.img : photos(api)[0]; if (!im || !people.length) return;
        const before = (settings(api).people?.[im.id] || []).map(m => ({...m})), list = before.map(m => ({...m}));
        people.forEach((p, i) => { list.push({id: Math.random().toString(36).slice(2, 10), n: C().nextNumber(list), x: Math.round((0.06 + 0.88 * (people.length > 1 ? i / (people.length - 1) : 0.5)) * 10000) / 10000, y: 0.93, label: '', person_id: p.id, certainty: 'supposed'}); });
        const set = async L => { api.inq.settings = {...settings(api), people: {...(settings(api).people || {}), [im.id]: L}}; await api.post('update', {id: api.inq.id, settings: api.inq.settings}); S2().togglePeople?.(api, true); };
        await set(list);
        undoToast(T('{n} posées sur la photo : glisse chaque numéro sur le bon visage', {n: plural(people.length, 'personne')}), {undo: () => set(before)});
    }

    /* ═════════ 5. 🔄 les dos côte à côte ═════════ */
    async function backs(api) {
        const st = {all: false, size: 220, pick: new Set(), list: []};
        const dg = dlgOpen({eyebrow: T('🔄 LES DOS CÔTE À CÔTE'), title: T('Comparer les dos des photos'), submitLabel: T('Fermer'), wide: true,
            body: `<p class="ui-hint">${esc(T('Les dos (versos) côte à côte : un même tampon, la même écriture, des numéros qui se suivent… disent souvent un même lot (même photographe, même tirage, même album). Marque une image comme « verso » pour qu’elle vienne ici.'))}</p>
                <div class="ep-xrow"><label class="ui-toggle"><input type="checkbox" data-c3-all><i></i>${esc(T('Aussi les dos des autres enquêtes'))}</label><label class="ep-sl">${esc(T('Taille'))}<input type="range" min="140" max="420" step="20" value="${st.size}" data-c3-size></label></div>
                <div data-c3-b aria-live="polite"></div>${api.ro ? '' : `<div class="ep-row"><button type="button" class="button small" data-c3-batch disabled>＋ ${esc(T('Même lot : garder comme indice'))}</button></div>`}`, onSubmit: () => true});
        if (!dg) return;
        const host = dg.querySelector('[data-c3-b]');
        const load = async () => {
            let r; try { r = await api.get('versos', {all: st.all ? 1 : 0}); } catch (e) { host.innerHTML = empty(e.message, '🔄'); return; }
            st.list = r.versos || []; st.pick = new Set();
            host.innerHTML = st.list.length ? `<div class="ep3-backs" style="--ep3-w:${st.size}px">${st.list.map((v, i) => `<figure class="ep3-back${v.inquiry_id === api.inq.id ? ' is-mine' : ''}"><img src="${esc(thumb(v.media_type === 'image' ? v.filename : ''))}" alt="${esc(v.title)}" loading="lazy">
                <figcaption><label class="checkbox-line"><input type="checkbox" data-c3-v="${i}" ${api.ro ? 'disabled' : ''}> <b>${esc(v.label || v.title)}</b></label><small class="muted">${esc(v.inquiry_id === api.inq.id ? T('cette enquête') : `🔎 ${v.inquiry}`)}</small>
                ${v.clues.length ? `<ul>${v.clues.map(c => `<li>${esc(c.text)}</li>`).join('')}</ul>` : ''}</figcaption></figure>`).join('')}</div>`
                : empty(T('Aucun dos pour l’instant : sur l’image du dos, choisis « verso ».'), '🔄');
        };
        dg.addEventListener('input', e => { if (e.target.matches('[data-c3-size]')) { st.size = Number(e.target.value); dg.querySelector('.ep3-backs')?.style.setProperty('--ep3-w', `${st.size}px`); } });
        dg.addEventListener('change', e => {
            if (e.target.matches('[data-c3-all]')) { st.all = e.target.checked; load(); return; }
            const c = e.target.closest('[data-c3-v]'); if (c) { if (c.checked) st.pick.add(Number(c.dataset.c3V)); else st.pick.delete(Number(c.dataset.c3V)); const b = dg.querySelector('[data-c3-batch]'); if (b) b.disabled = st.pick.size < 2; }
        });
        dg.addEventListener('click', async e => {
            const b = e.target.closest('[data-c3-batch]'); if (!b || api.ro || st.pick.size < 2) return;
            const L = [...st.pick].map(i => st.list[i]), mine = L.filter(v => v.inquiry_id === api.inq.id);
            await api.addClue({kind: 'dos', text: T('Même lot que : {l}', {l: L.map(v => v.inquiry_id === api.inq.id ? (v.label || v.title) : `${v.label || v.title} (🔎 ${v.inquiry})`).join(' · ')}).slice(0, 590), certainty: 'supposed', source: 'compare',
                why: T('Dos comparés côte à côte (tampon, écriture, numéros)'), images: Object.fromEntries(mine.map(v => [v.image_id, 'yes'])), data: {batch: L.map(v => v.media_id)}});
            b.disabled = true; toast(T('Gardé comme indice.'), 'success');
        });
        load();
        return dg;
    }

    /* ═════════ 6. 🕳 les années sans photo d'une personne ═════════ */
    async function gaps(api, personId = 0) {
        let pid = personId;
        if (!pid) {
            const people = await peopleOn(api);
            if (people.length === 1) pid = people[0].id;
            else if (people.length > 1) { pid = await new Promise(res => UI().menuAt?.(document.activeElement || document.body, people.map(p => ({icon: '👤', label: p.name, run: () => res(p.id)})), {title: T('Pour qui ?'), onClose: () => setTimeout(() => res(0), 50)})); }
            else { const P = window.LCNDA_PICKER || A(); const it = await P.openPicker?.({kind: 'person', title: T('Les photos de qui ?')}); pid = Number(it?.id) || 0; }
        }
        if (!pid) return;
        const dg = dlgOpen({eyebrow: T('🕳 LES ANNÉES SANS PHOTO'), title: T('Les années avec et sans photo'), submitLabel: T('Fermer'), wide: true, body: `<div data-c3-y aria-live="polite">${UI().spinner ? UI().spinner(T('Chargement…')) : ''}</div>`, onSubmit: () => true});
        if (!dg) return;
        const host = dg.querySelector('[data-c3-y]');
        let r; try { r = await api.get('person_years', {person_id: pid}); } catch (e) { host.innerHTML = empty(e.message, '🕳'); return dg; }
        const ys = r.photos.map(p => p.year).filter(Boolean), from = r.person.birth || (ys.length ? Math.min(...ys) : null), to = r.person.death || r.now;
        if (!from) { host.innerHTML = empty(T('Il faut une date de naissance (ou une photo datée) pour {n}.', {n: r.person.name}), '🕳'); return dg; }
        const g = C().yearGaps(ys, from, to, Number(prefs().gapMin) || 3), by = new Map(); r.photos.forEach(p => { if (p.year) by.set(p.year, [...(by.get(p.year) || []), p]); });
        const cells = []; for (let y = from; y <= to; y++) { const n = (by.get(y) || []).length; cells.push(`<span class="ep3-cell${n ? ' is-on' : ''}${y % 10 === 0 ? ' is-dec' : ''}" title="${esc(`${y} : ${n ? plural(n, 'photo') : T('aucune photo')}`)}">${y % 10 === 0 ? `<i>${y}</i>` : ''}</span>`); }
        host.innerHTML = `<p><b>👤 ${esc(r.person.name)}</b> · ${esc(`${from}–${r.person.death || ''}`)} · ${esc(plural(r.photos.length, 'photo'))} · ${esc(T('{n} % des années ont une photo', {n: g.cover}))}</p>
            <div class="ep3-strip" role="img" aria-label="${esc(T('{a} années avec une photo, sur {b}', {a: g.have.length, b: to - from + 1}))}">${cells.join('')}</div>
            ${g.gaps.length ? `<h4>${esc(T('À chercher chez les cousins'))}</h4><ul class="ep3-gaps">${g.gaps.map(([a, b]) => `<li><b>${esc(a === b ? String(a) : `${a}–${b}`)}</b> · ${esc(T('{n} ans sans photo', {n: b - a + 1}))}${r.person.birth ? ` <small class="muted">(${esc(T('de {x} à {y} ans', {x: a - r.person.birth, y: b - r.person.birth}))})</small>` : ''}</li>`).join('')}</ul>` : `<p class="ep3-ok">✓ ${esc(T('Pas de longue période sans photo.'))}</p>`}
            ${r.photos.some(p => !p.year) ? `<p class="muted">${esc(T('{n} sans date : date-les pour qu’elles comptent.', {n: plural(r.photos.filter(p => !p.year).length, 'photo')}))}</p>` : ''}
            <div class="ep-row"><button type="button" class="button small secondary" data-c3-exp>⤓ ${esc(T('Exporter la liste'))}</button></div>`;
        host.querySelector('[data-c3-exp]')?.addEventListener('click', () => UI().exportRows?.({title: T('⤓ Les années sans photo'), name: T('Années sans photo — {n}', {n: r.person.name}),
            rows: () => [[T('De'), T('À'), T('Années')], ...g.gaps.map(([a, b]) => [a, b, b - a + 1])]}));
        return dg;
    }

    /* ═════════ ⚙️ Personnaliser ═════════ */
    function prefsHtml(p) {
        return `<label>${esc(T('📒 Classement d’un album : écart d’âge toléré (ans)'))} <input type="number" min="0" max="5" step="0.5" value="${esc(p.ageTol ?? 1)}" data-pf="ageTol"></label>
            <label>${esc(T('🎓 Classe d’école : âges des élèves'))} <input type="number" min="2" max="18" step="1" value="${esc(p.schoolFrom ?? 6)}" data-pf="schoolFrom" aria-label="${esc(T('De'))}"> – <input type="number" min="3" max="20" step="1" value="${esc(p.schoolTo ?? 13)}" data-pf="schoolTo" aria-label="${esc(T('À'))}"></label>
            <label>${esc(T('🕳 Années sans photo : signaler à partir de (ans)'))} <input type="number" min="1" max="30" step="1" value="${esc(p.gapMin ?? 3)}" data-pf="gapMin"></label>`;
    }
    function prefsRead(dg) {
        const g = k => Number(dg.querySelector(`[data-pf="${k}"]`)?.value), lim = (v, a, b, d) => (Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d);
        const f = lim(g('schoolFrom'), 2, 18, 6), t = lim(g('schoolTo'), 3, 20, 13);
        return {ageTol: lim(g('ageTol'), 0, 5, 1), schoolFrom: Math.min(f, t), schoolTo: Math.max(f, t), gapMin: lim(g('gapMin'), 1, 30, 3)};
    }

    /* ═════════ la grille des aides, les questions guidées ═════════ */
    const AIDES = [['📒 Albums, lieux et familles', [['classement', '📒', 'Classement d’un album'], ['memelieu', '🏘', 'Le même lieu à travers le temps'], ['apprend', '📝', 'Cette photo m’apprend'], ['groupe', '🎓', 'Photo de groupe : qui devrait y être ?'], ['dos2', '🔄', 'Les dos côte à côte'], ['trous', '🕳', 'Les années sans photo']]]];
    const OPEN = {classement, memelieu: a => sameplace(a), apprend: learn, groupe: group, dos2: backs, trous: a => gaps(a)};
    const READONLY = ['classement', 'memelieu', 'apprend', 'groupe', 'dos2', 'trous'];
    function stepButtons(k, mk) {
        const b = (key, label) => mk(`data-ep-aide="${key}"`, label), row = list => `<div class="ep-row ep-plusrow">${list.join('')}</div>`;
        return {dos: row([b('dos2', T('🔄 Les dos côte à côte'))]), support: row([b('dos2', T('🔄 Les dos côte à côte'))]), lieu: row([b('memelieu', T('🏘 Le même lieu à travers le temps'))]),
            date: row([b('classement', T('📒 Classement d’un album'))]), gens: row([b('groupe', T('🎓 Photo de groupe : qui devrait y être ?')), b('trous', T('🕳 Les années sans photo'))]),
            conclusion: row([b('apprend', T('📝 Cette photo m’apprend'))])}[k] || '';
    }
    function install() {
        const P = ext.enquetePhotoPlus, S = ext.enquetePhotoSuite; if (!P || !S || !P._suite) return false; if (P._classement) return true; P._classement = true;
        P.AIDES.push(...AIDES); (P.READONLY = P.READONLY || []).push(...READONLY);
        const has0 = P.has, open0 = P.open, step0 = P.stepButtons;
        P.has = k => Object.prototype.hasOwnProperty.call(OPEN, k) || has0(k);
        P.open = (k, api) => (OPEN[k] ? OPEN[k](api) : open0(k, api));
        P.stepButtons = (k, mk) => (step0 ? step0(k, mk) : '') + stepButtons(k, mk);
        const ph0 = S.prefsHtml, pr0 = S.prefsRead;
        S.prefsHtml = p => (ph0 ? ph0(p) : '') + prefsHtml(p);
        S.prefsRead = dg => ({...(pr0 ? pr0(dg) : {}), ...prefsRead(dg)});
        return true;
    }
    if (!install()) { let n = 0; const again = () => { if (!install() && ++n < 50) setTimeout(again, 100); }; setTimeout(again, 0); }
    ext.enquetePhotoClassement = {classement, sameplace, learn, group, place, backs, gaps, prefsHtml, prefsRead, AIDES, jobsOf, peopleOn};
})();
