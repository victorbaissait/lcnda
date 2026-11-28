/* LCNDA — 🔗 Documents liés (maquette docs/design/documents-lies-recueils.html, partie 1 ; serveur : lib/doc_links.php).
 * Deux documents DIFFÉRENTS reliés pour une raison (même régiment, même famille…) — pas les pages d'un même document (📑,
 * heritage-pages.js), pas un recueil (📚). Le lien va dans les deux sens.
 *   ext.docLinks.mount(élément, mediaId, {ro, onOpen(id)}) → le bloc « 🔗 Documents liés » (page du document, visionneuse, enquête)
 *   ext.docLinks.compare(texteA, texteB) → {common: [...], learn: [...]} : ce que les deux textes ont en commun, ce que B apprend sur A
 * « En commun » et « Ce que l'autre t'apprend » sont calculés ici, depuis les transcriptions (rien d'autre n'est gardé).
 * Réglage : « Ce que l'autre t'apprend » montré (conseillé) ou non (clé genealogie-liens-learn). Essai : tests/test-documents-lies.js.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const T = (k, v) => (window.LCNDA_I18N?.t ? window.LCNDA_I18N.t(k, v) : String(k).replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? ''));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (m, k) => A()?.toast?.(m, k);
    const kiosk = () => document.body.classList.contains('is-kiosk');
    const REASONS = [['regiment', '🎖', 'même régiment'], ['famille', '👪', 'même famille'], ['affaire', '📂', 'même affaire'], ['lieu', '📍', 'même lieu'], ['notaire', '✒️', 'même notaire'], ['autre', '🔗', 'autre raison']];
    const reasonOf = k => REASONS.find(r => r[0] === k) || REASONS[REASONS.length - 1];
    const reasonText = l => (l.reason === 'autre' && l.note ? l.note : T(reasonOf(l.reason)[2]) + (l.note ? ` · ${l.note}` : ''));
    const LEARN_KEY = 'genealogie-liens-learn';
    const learnOn = () => { try { return localStorage.getItem(LEARN_KEY) !== '0'; } catch (_) { return true; } };

    /* ─── ce que deux textes ont en commun ─── */
    const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    // ce que « Repérer » ne range pas en nom, lieu ou date : régiments, batailles, campagnes, prisons…
    const SPECIAL = /\b\d+\s*(?:e|ème|eme|er)?\s*(?:régiment|regiment|bataillon|escadron|demi-brigade)\b(?:\s+(?:de|d['’])\s*[a-zà-ÿ]+)?|\bbataille\s+(?:de|d['’])\s*[A-ZÀ-Ý][\wÀ-ÿ-]+|\bcampagne\s+(?:de|d['’]|du)\s*[A-ZÀ-Ý][\wÀ-ÿ-]+|\bsiège\s+(?:de|d['’])\s*[A-ZÀ-Ý][\wÀ-ÿ-]+/giu;
    function entities(text) {
        const src = String(text || ''), out = [], seen = new Set();
        const lineOf = at => src.slice(0, at).split('\n').length;
        const spans = []; // ce qui est déjà repéré (noms, batailles) : un lieu « après à / en » ne doit pas le recouvrir
        const add = (type, label, at) => { spans.push([at, at + String(label).length]); const k = type + ':' + fold(label); if (!fold(label) || seen.has(k)) return; seen.add(k); out.push({type, label: String(label).replace(/\s+/g, ' ').trim(), key: fold(label), line: lineOf(at), at}); };
        try { (ext.actDetect ? ext.actDetect(src) : []).forEach(f => { if (['person', 'place', 'job'].includes(f.type)) add(f.type, f.label, f.s); }); } catch (_) {}
        try { (ext.actFindDates ? ext.actFindDates(src) : []).forEach(d => { const y = String(d.iso || '').slice(0, 4); if (/^\d{4}$/.test(y)) add('year', y, d.s ?? 0); }); } catch (_) {}
        for (const m of src.matchAll(SPECIAL)) add('special', m[0], m.index);
        for (const m of src.matchAll(/\b(1[5-9]\d\d)\b/g)) add('year', m[1], m.index); // une année seule (« en 1805 »)
        // un lieu étranger ou ancien que « Repérer » ne connaît pas : « en Bohême », « à Prague », « au Mans »
        for (const m of src.matchAll(/(?:^|[\s,(])(?:à|en|au|aux)\s+((?:[A-ZÀ-Ý][a-zà-ÿ'’-]{2,})(?:[- ](?:sur|sous|en|le|la|de|du)?[- ]?[A-ZÀ-Ý][a-zà-ÿ'’-]+)*)/gu)) {
            const at = m.index + m[0].lastIndexOf(m[1]), end = at + m[1].length; if (spans.some(([x, y]) => at < y && x < end)) continue; add('place', m[1], at); }
        return out;
    }
    /** {common: [{type, label}], learn: [{type, label, line, quote}]} : en commun, et ce que B dit que A ne dit pas */
    function compare(textA, textB) {
        const a = entities(textA), b = entities(textB), keysA = new Set(a.map(e => e.type + ':' + e.key));
        const common = b.filter(e => keysA.has(e.type + ':' + e.key)).map(e => ({type: e.type, label: e.label}));
        const L = String(textB || '').split('\n');
        const learn = b.filter(e => !keysA.has(e.type + ':' + e.key) && e.type !== 'job').slice(0, 8).map(e => ({type: e.type, label: e.label, line: e.line, quote: (L[e.line - 1] || '').trim().slice(0, 140)}));
        return {common, learn};
    }
    const ICON = {person: '👤', place: '📍', year: '📅', special: '🎖', job: '🔨'};

    /* ─── le bloc ─── */
    async function load(id) { return A().api('doc_links', {media_id: id}); }
    async function save(body) { const r = await A().api('doc_link_save', {}, {method: 'POST', body}); return r.result || r; }
    async function del(id) { const r = await A().api('doc_link_delete', {}, {method: 'POST', body: {id}}); return r.result || r; }
    const changed = id => document.dispatchEvent(new CustomEvent('lcnda:doc-links-changed', {detail: {media_id: Number(id)}}));

    function html(st, ro) {
        const items = st.items || [], show = learnOn();
        const one = l => { const c = compare(st.text, l.text);
            return `<li class="dl-item" data-dl-id="${l.id}"><div class="dl-head"><span class="dl-ic" aria-hidden="true">${reasonOf(l.reason)[1]}</span>
                <button type="button" class="link-button dl-open" data-dl-open="${l.media_id}"><b>${esc(l.title)}</b></button>${l.date_text ? ` <small class="muted">${esc(l.date_text)}</small>` : ''}
                <small class="dl-why">${esc(reasonText(l))}</small><span class="spacer"></span>${ro ? '' : `<button type="button" class="icon-button small" data-dl-more="${l.id}" aria-haspopup="menu" title="${esc(T('Plus d’actions'))}" aria-label="${esc(T('Plus d’actions'))}">⋯</button>`}</div>
                ${c.common.length ? `<div class="dl-common"><span class="muted">${esc(T('En commun :'))}</span> ${c.common.slice(0, 12).map(e => `<span class="dl-chip is-${e.type}">${ICON[e.type] || ''} ${esc(e.label)}</span>`).join(' ')}</div>` : (st.text && l.text ? `<div class="dl-common muted">${esc(T('Rien de commun repéré dans les deux textes.'))}</div>` : `<div class="dl-common muted">${esc(T('Pas encore de texte à comparer : transcris les deux documents.'))}</div>`)}
                ${show && c.learn.length ? `<details class="dl-learn"><summary>💡 ${esc(T('Ce que ce document t’apprend ({n})', {n: c.learn.length}))}</summary><ul>${c.learn.map(e => `<li><span class="dl-chip is-${e.type}">${ICON[e.type] || ''} ${esc(e.label)}</span> <small class="muted">${esc(T('l. {n}', {n: e.line}))}</small>${e.quote ? `<br><small class="dl-quote">« ${esc(e.quote)} »</small>` : ''}</li>`).join('')}</ul></details>` : ''}</li>`; };
        return `<div class="dl-h"><h3>🔗 ${esc(T('Documents liés'))}${items.length ? ` <small class="muted">${items.length}</small>` : ''}</h3><span class="spacer"></span>${ro ? '' : `<button type="button" class="button small secondary" data-dl-add>＋ ${esc(T('Lier un document…'))}</button>`}</div>
            ${items.length ? `<ul class="dl-list">${items.map(one).join('')}</ul>` : `<p class="muted dl-empty">${esc(T('Un autre document qui va avec celui-ci (même régiment, même famille, même affaire…) : « ＋ Lier un document… ». Ce n’est pas une page de ce document (📑), ni un recueil (📚).'))}</p>`}`;
    }
    function reasonMenu(at, current, done) {
        UI().menuAt?.(at, [...REASONS.map(([k, ic, l]) => ({icon: ic, label: T(l) + (k === current ? ' ✓' : ''), run: () => (k === 'autre' ? askNote(done) : done(k, ''))}))], {title: T('Pourquoi ces documents vont ensemble ?')});
    }
    async function askNote(done) {
        const v = await A().askText?.({title: T('Autre raison'), message: T('La raison, en quelques mots (ex. même procès, même voyage)'), placeholder: T('Ex. même procès'), okLabel: T('Lier')});
        if (v == null || !String(v).trim()) return; done('autre', String(v).trim().slice(0, 200));
    }
    function mount(host, mediaId, o = {}) {
        if (!host) return null;
        let st = {items: [], text: ''}, cur = Number(mediaId), seq = 0;
        const ro = () => (o.ro ?? kiosk());
        const draw = () => { host.classList.add('dl-block'); host.innerHTML = html(st, ro()); host.hidden = ro() && !st.items.length; };
        const reload = async () => { const n = ++seq; try { const s = await load(cur); if (n === seq) { st = s; draw(); } } catch (_) { if (n === seq) host.hidden = true; } };
        async function addLink(at) {
            const P = window.LCNDA_MEDIA_PICKER; if (!P?.openMediaPicker) return toast(T('La fenêtre des images n’est pas chargée.'), 'error');
            const picked = await P.openMediaPicker({types: ['image', 'document'], multiple: false, title: `🔗 ${T('Lier un document…')}`, eyebrow: T('DOCUMENTS LIÉS'), okLabel: T('Lier ce document')});
            const m = Array.isArray(picked) ? picked[0] : picked; const other = Number(m?.id || 0); if (!other) return;
            if (other === cur) return toast(T('Un document ne se lie pas à lui-même.'), 'error');
            reasonMenu(at, '', async (reason, note) => {
                try { st = await save({media_id: cur, other_id: other, reason, note}); draw(); changed(cur); changed(other); } catch (e) { return toast(e.message, 'error'); }
                A().undoToast?.(T('Documents liés'), {undo: async () => { const l = st.items.find(x => x.media_id === other); if (l) { await del(l.id); await reload(); changed(cur); changed(other); } }});
            });
        }
        host.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b || !host.contains(b)) return;
            if (b.matches('[data-dl-add]')) return addLink(b);
            if (b.dataset.dlOpen) { const id = Number(b.dataset.dlOpen); return o.onOpen ? o.onOpen(id) : ext.openDocMedia?.(id); }
            if (b.dataset.dlMore) { const l = st.items.find(x => x.id === Number(b.dataset.dlMore)); if (!l) return;
                UI().menuAt?.(b, [
                    {icon: '↗', label: T('Ouvrir ce document'), run: () => (o.onOpen ? o.onOpen(l.media_id) : ext.openDocMedia?.(l.media_id))},
                    {icon: '✏️', label: T('Changer la raison…'), run: () => reasonMenu(b, l.reason, async (reason, note) => { try { st = await save({media_id: cur, other_id: l.media_id, reason, note}); draw(); changed(l.media_id); } catch (err) { toast(err.message, 'error'); } })},
                    '-', {icon: '×', label: T('Retirer le lien'), danger: true, run: async () => { let r; try { r = await del(l.id); } catch (err) { return toast(err.message, 'error'); } await reload(); changed(cur); changed(l.media_id);
                        A().undoToast?.(T('Lien retiré'), {undo: async () => { await save(r.removed); await reload(); changed(cur); changed(l.media_id); }}); }},
                ], {title: l.title}); }
        });
        const onChanged = ev => { if (!host.isConnected) { document.removeEventListener('lcnda:doc-links-changed', onChanged); return; } if (Number(ev.detail?.media_id) === cur) reload(); };
        document.addEventListener('lcnda:doc-links-changed', onChanged);
        draw(); reload();
        return {reload, setMedia: id => { if (Number(id) === cur) return; cur = Number(id); st = {items: [], text: ''}; draw(); reload(); }, state: () => st};
    }

    /* ─── la visionneuse : le bloc sous « 📑 Pages du document » ─── */
    let lbCtl = null;
    function lbRefresh() {
        const lb = document.getElementById('lightbox'), S = A()?.state, it = S?.lightboxMedia?.[S.lightboxIndex]; if (!lb?.open || !it) return;
        let box = document.getElementById('lightbox-links');
        if (!box) { box = document.createElement('section'); box.id = 'lightbox-links'; box.className = 'lb-links'; const after = document.getElementById('lightbox-pages') || lb.querySelector('.lightbox-attachment-block'); if (after) after.after(box); else lb.querySelector('.lightbox-details')?.append(box); }
        const ro = !!S?.lightboxReadOnly || kiosk();
        if (!lbCtl || lbCtl.ro !== ro || !lbCtl.host.isConnected || lbCtl.host !== box) { if (lbCtl && lbCtl.host === box) { const nb = box.cloneNode(false); box.replaceWith(nb); box = nb; } lbCtl = mount(box, it.id, {ro, onOpen: id => ext.openDocMedia?.(id)}); if (lbCtl) { lbCtl.ro = ro; lbCtl.host = box; } }
        else lbCtl.setMedia(it.id);
    }
    const lbWatch = () => { const lb = document.getElementById('lightbox'); if (!lb) return setTimeout(lbWatch, 500);
        const go = () => setTimeout(lbRefresh, 0);
        ['lightbox-image', 'lightbox-pdf', 'lightbox-video', 'lightbox-audio'].forEach(k => { const el = document.getElementById(k); if (el) new MutationObserver(go).observe(el, {attributes: true, attributeFilter: ['src', 'hidden']}); });
        new MutationObserver(() => { if (lb.open) go(); }).observe(lb, {attributes: true, attributeFilter: ['open']}); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', lbWatch); else lbWatch();

    /* ─── 🔎 dans une enquête : les liens entre les documents du dossier, ceux qui n'y sont pas encore, ce qu'ils apprennent ─── */
    async function invDocLinks(page, data, invId, refresh) {
        if (!page || !Array.isArray(data?.media) || !data.media.length) return;
        const inDossier = new Map(data.media.map(m => [Number(m.id || m.media_id), m])), ro = kiosk();
        let all; try { all = await Promise.all([...inDossier.keys()].map(async id => ({id, st: await load(id)}))); } catch (_) { return; }
        if (!page.isConnected) return;
        const pairs = [], outside = new Map(), learns = [], seen = new Set();
        all.forEach(({id, st}) => (st.items || []).forEach(l => {
            const k = [Math.min(id, l.media_id), Math.max(id, l.media_id)].join('-'); if (seen.has(k)) return; seen.add(k);
            const a = inDossier.get(id); pairs.push({a: {id, title: a?.title || a?.filename || ''}, b: l, inB: inDossier.has(l.media_id)});
            if (!inDossier.has(l.media_id)) outside.set(l.media_id, {...l, via: a?.title || ''});
            if (learnOn()) compare(st.text, l.text).learn.slice(0, 4).forEach(e => learns.push({...e, from: l.title, fromId: l.media_id}));
        }));
        if (!pairs.length) return;
        const sec = document.createElement('section'); sec.className = 'card dl-inv'; sec.dataset.dlInv = '';
        sec.innerHTML = `<div class="dl-h"><h3>🔗 ${esc(T('Documents liés'))} <small class="muted">${pairs.length}</small></h3></div>
            <ul class="dl-list">${pairs.map(p => `<li class="dl-item"><div class="dl-head"><span class="dl-ic">${reasonOf(p.b.reason)[1]}</span><b>${esc(p.a.title)}</b> ↔ <button type="button" class="link-button" data-dl-inv-open="${p.b.media_id}"><b>${esc(p.b.title)}</b></button>
                <small class="dl-why">${esc(reasonText(p.b))}</small>${p.inB ? '' : ` <span class="ui-badge is-yellow">${esc(T('pas dans le dossier'))}</span>`}<span class="spacer"></span>${p.inB || ro ? '' : `<button type="button" class="button small" data-dl-inv-add="${p.b.media_id}">＋ ${esc(T('Ajouter au dossier'))}</button>`}</div>
                ${(() => { const c = compare(all.find(x => x.id === p.a.id)?.st.text || '', p.b.text).common; return c.length ? `<div class="dl-common"><span class="muted">${esc(T('En commun :'))}</span> ${c.slice(0, 10).map(e => `<span class="dl-chip is-${e.type}">${ICON[e.type] || ''} ${esc(e.label)}</span>`).join(' ')}</div>` : ''; })()}</li>`).join('')}</ul>
            ${learns.length ? `<details class="dl-learn" open><summary>💡 ${esc(T('Ce que les documents liés apprennent ({n})', {n: learns.length}))}</summary><ul>${learns.map((e, i) => `<li><span class="dl-chip is-${e.type}">${ICON[e.type] || ''} ${esc(e.label)}</span> <small class="muted">${esc(e.from)} · ${esc(T('l. {n}', {n: e.line}))}</small>${ro ? '' : ` <button type="button" class="button small secondary" data-dl-inv-lead="${i}">🔎 ${esc(T('En faire une piste'))}</button>`}${e.quote ? `<br><small class="dl-quote">« ${esc(e.quote)} »</small>` : ''}</li>`).join('')}</ul></details>` : ''}`;
        page.querySelector('[data-dl-inv]')?.remove(); page.append(sec);
        sec.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.dlInvOpen) return ext.openDocMedia?.(Number(b.dataset.dlInvOpen));
            if (b.dataset.dlInvAdd) { b.disabled = true; try { await A().api('link_investigation_media', {}, {method: 'POST', body: {investigation_id: invId, media_ids: [Number(b.dataset.dlInvAdd)]}}); toast(T('Ajouté au dossier de l’enquête.')); refresh?.(); } catch (err) { b.disabled = false; toast(err.message, 'error'); } return; }
            if (b.dataset.dlInvLead) { const x = learns[Number(b.dataset.dlInvLead)]; if (!x) return; b.disabled = true;
                try { await A().api('add_investigation_item', {}, {method: 'POST', body: {investigation_id: invId, kind: 'lead', status: 'to_explore', title: x.label, notes: `${T('D’après « {doc} », l. {n}', {doc: x.from, n: x.line})}${x.quote ? ` : « ${x.quote} »` : ''}`}}); toast(T('Piste ajoutée à l’enquête.')); refresh?.(); } catch (err) { b.disabled = false; toast(err.message, 'error'); } }
        });
    }

    ext.docLinks = {mount, compare, entities, REASONS, LEARN_KEY};
    ext.invDocLinks = invDocLinks;
})();
