/* LCNDA — 📑 Le sommaire d'un recueil (maquettes docs/design/documents-lies-recueils.html partie 3, registres-etat-fonds.html partie 4 ;
 * serveur : lib/recueil_toc.php). Chapitres, sous-chapitres (autant de niveaux qu'on veut), passages décrits (« du milieu de la page 5 au
 * milieu de la page 7 : mariage… », sans créer de fiche). Chaque ligne s'ouvre et se ferme (▸ ▾, retenu), montre son avancement
 * (les états de l'onglet « 🗂 État ») ; « Tout ouvrir / Tout fermer », niveaux, chercher, mode lecture ; « ✨ Proposer le découpage »
 * (d'après les actes de l'Atelier, sur demande) ; incohérences signalées ; une liasse se range par date, sorte ou cote. ↶ Annuler partout.
 *   ext.recueilSommaire.paint(body, ctx)     → l'onglet « 📑 Sommaire »
 *   ext.recueilSommaire.block(b, ctx, el)    → le bloc du Résumé
 *   ext.recueilSommaire.pagePath(el, p, ctx) → « 📑 Année 1789 › Baptêmes 1789 » sur la page ouverte
 *   ext.recueilSommaire.arrange(btn, ctx)    → « 🗃 Ranger par… » (liasse)
 * ctx = {D(), reload(), openPage(id), post(action, body), openTab(tab)}. Essai : tests/test-recueil-sommaire.js.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const T = (k, v) => (window.LCNDA_I18N?.t ? window.LCNDA_I18N.t(k, v) : String(k).replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? ''));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (m, k) => A()?.toast?.(m, k);
    const plural = (n, one, many) => (A()?.plural ? A().plural(n, one, many) : `${n} ${n > 1 ? many : one}`);
    const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const KINDS = [['naissance', 'Naissance'], ['bapteme', 'Baptême'], ['mariage', 'Mariage'], ['deces', 'Décès'], ['sepulture', 'Sépulture'], ['notarial', 'Acte notarié'], ['notoriete', 'Acte de notoriété'], ['recensement', 'Recensement'], ['militaire', 'Document militaire'], ['lettre', 'Lettre'], ['autre', 'Autre']];
    const kindLabel = k => (ext.actKindLabel ? ext.actKindLabel(k) : T(KINDS.find(x => x[0] === k)?.[1] || k));
    const POS = [['', ''], ['haut', 'haut'], ['milieu', 'milieu'], ['bas', 'bas']];
    const posWord = p => ({haut: T('haut de'), milieu: T('milieu de'), bas: T('bas de')}[p] || '');
    const isLiasse = D => ['liasse', 'archives'].includes(D?.recueil?.numbering);
    const pw = D => (isLiasse(D) ? T('pièce') : T('p.'));

    /* ─── les données ─── */
    const cache = new Map(); // recueil → {at, data}
    async function load(ctx, force = false) {
        const D = ctx.D(), c = cache.get(D.recueil.id);
        if (c && !force && c.at === D) return c.data;
        const data = await A().api('recueil_toc', {id: D.recueil.id}); cache.set(D.recueil.id, {at: D, data}); return data;
    }
    /** « p. 1–9 », « milieu p. 5 → milieu p. 7 », « pièce 3 » */
    function range(D, r) {
        if (!r.from_num) return T('pages pas dites');
        const one = (pos, n) => `${pos ? posWord(pos) + ' ' : ''}${pw(D)} ${n}`;
        if (r.kind === 'element' && (r.pos_from || r.pos_to)) return r.to_num && (r.to_num !== r.from_num || r.pos_to !== r.pos_from) ? `${one(r.pos_from, r.from_num)} → ${one(r.pos_to, r.to_num)}` : one(r.pos_from, r.from_num);
        return r.to_num && r.to_num !== r.from_num ? `${pw(D)} ${r.from_num}–${r.to_num}` : `${pw(D)} ${r.from_num}`;
    }
    /** l'avancement d'une ligne : les pages de sa plage (onglet « 🗂 État ») */
    function progress(D, r) {
        if (!r.from_num) return null;
        const ps = D.pages.filter(p => p.num >= r.from_num && p.num <= (r.to_num || r.from_num) && p.absent !== 'blanche');
        const live = ps.filter(p => !p.absent), done = live.filter(p => p.state === 'done' || p.state === 'checked').length;
        return {done, live: live.length, absent: ps.length - live.length, pct: live.length ? Math.round(done / live.length * 100) : 0, doing: live.some(p => p.state === 'doing')};
    }
    const bar = pr => (pr ? `<span class="rs-prog" title="${esc(T('{d} sur {n} pages finies ou relues', {d: String(pr.done), n: String(pr.live)}))}"><span class="rs-bar"><i class="${pr.pct === 100 ? 'is-full' : pr.doing ? 'is-doing' : ''}" style="width:${pr.pct}%"></i></span><small>${pr.done}/${pr.live}</small>${pr.absent ? ` <small class="rs-abs">⛔ ${pr.absent}</small>` : ''}</span>` : '');

    /* ─── ouvert / fermé, retenu par recueil (sur cet ordinateur) ─── */
    const SHUT_KEY = 'genealogie-sommaire-plie';
    const shutRead = rid => { try { return new Set((JSON.parse(localStorage.getItem(SHUT_KEY) || '{}')[rid]) || []); } catch (_) { return new Set(); } };
    const shutWrite = (rid, set) => { try { const all = JSON.parse(localStorage.getItem(SHUT_KEY) || '{}'); all[rid] = [...set].slice(-2000); localStorage.setItem(SHUT_KEY, JSON.stringify(all)); } catch (_) {} };
    const LEVEL_KEY = 'genealogie-sommaire-niveau';
    const levelRead = () => { try { return localStorage.getItem(LEVEL_KEY) || 'all'; } catch (_) { return 'all'; } };
    const levelWrite = v => { try { localStorage.setItem(LEVEL_KEY, v); } catch (_) {} };

    /* ─── l'onglet ─── */
    const ui = new Map(); // recueil → {q, read}
    async function paint(body, ctx) {
        const D = ctx.D(), rid = D.recueil.id, st = ui.get(rid) || {q: '', read: false}; ui.set(rid, st);
        if (!body.querySelector('.rs-tab')) body.innerHTML = `<div class="rs-tab">${UI().spinner ? UI().spinner(T('Chargement du sommaire…')) : '…'}</div>`;
        let data; try { data = await load(ctx); } catch (e) { body.innerHTML = A().emptyState({icon: '⛔', text: T('Le sommaire ne s’ouvre pas'), hint: e.message || ''}); return; }
        if (!body.isConnected) return;
        const items = data.items || [], shut = shutRead(rid), ro = document.body.classList.contains('is-kiosk');
        // les niveaux montrés : 1, 2, 3, 4… jusqu'au plus profond des chapitres (sous-sous-sous-chapitres et ainsi de suite), puis « + passages »
        const deepest = Math.max(1, ...items.filter(r => r.kind === 'chapter').map(r => r.level));
        const level = levelRead() === 'all' || Number(levelRead()) <= deepest ? levelRead() : 'all';
        // chercher : les lignes trouvées et leurs parents
        const q = fold(st.q).trim(), byId = new Map(items.map(r => [r.id, r]));
        let keep = null;
        if (q) { keep = new Set(); items.forEach(r => { if (fold(`${r.title} ${r.note}`).includes(q)) { for (let x = r; x; x = byId.get(x.parent_id)) keep.add(x.id); } }); }
        const hiddenBy = r => { for (let x = byId.get(r.parent_id); x; x = byId.get(x.parent_id)) if (shut.has(x.id)) return true; return false; };
        const show = items.filter(r => (keep ? keep.has(r.id) : !hiddenBy(r)) && (level === 'all' || (r.kind === 'chapter' && r.level <= Number(level))));
        const line = r => {
            const pr = progress(D, r), kids = r.children, open = !shut.has(r.id) || !!keep;
            const meta = [r.act_kind ? `<span class="rs-pill">${esc(kindLabel(r.act_kind))}</span>` : '', r.year_from ? `<span class="rs-years">${r.year_from}${r.year_to && r.year_to !== r.year_from ? '–' + r.year_to : ''}</span>` : ''].join('');
            return `<li class="rs-li is-${r.kind} lv-${Math.min(r.level, 6)}" data-rs-id="${r.id}" style="--lv:${r.level - 1}">
                <div class="rs-ln">${kids && !st.read ? `<button type="button" class="rs-tw" data-rs-fold="${r.id}" aria-expanded="${open}" aria-label="${esc(open ? T('Fermer') : T('Ouvrir'))}">${open ? '▾' : '▸'}</button>` : `<span class="rs-tw is-leaf" aria-hidden="true">${r.kind === 'element' ? '·' : ''}</span>`}
                <span class="rs-rng">${esc(range(D, r))}</span>
                <button type="button" class="rs-title${r.kind === 'element' ? ' is-el' : ''}" data-rs-open="${r.page_from}" ${r.page_from ? '' : 'disabled'}>${esc(r.title)}</button>${meta}
                <span class="spacer"></span>${r.kind === 'chapter' ? bar(pr) : ''}${ro || st.read ? '' : `<button type="button" class="icon-button small" data-rs-menu="${r.id}" aria-label="${esc(T('Plus d’actions'))}" title="${esc(T('Plus d’actions'))}">⋯</button>`}</div>
                ${(st.read || r.kind === 'element') && r.note ? `<p class="rs-note">${esc(r.note).replace(/\n/g, '<br>')}</p>` : ''}</li>`;
        };
        const warn = (data.warnings || []).map(w => w.type === 'overlap' ? `⚠️ ${esc(T('« {a} » et « {b} » se chevauchent ({p} {x}–{y}).', {a: w.a_title, b: w.b_title, p: pw(D), x: String(w.from), y: String(w.to)}))}`
            : w.type === 'kind' ? `⚠️ ${esc(T('{p} {n} : un acte « {k} » dans « {t} ».', {p: pw(D), n: String(w.page), k: kindLabel(w.kind), t: w.title}))}`
            : `⚠️ ${esc(T('{p} {n} : un acte de {y} dans « {t} ».', {p: pw(D), n: String(w.page), y: String(w.year), t: w.title}))}`);
        body.innerHTML = `<div class="rs-tab${st.read ? ' is-read' : ''}">
            <div class="rs-bar-top">
                <span class="re-row"><button type="button" class="button small secondary" data-rs-all="open">▾ ${esc(T('Tout ouvrir'))}</button><button type="button" class="button small secondary" data-rs-all="shut">▸ ${esc(T('Tout fermer'))}</button>
                <span class="segmented rs-level" role="radiogroup" aria-label="${esc(T('Niveaux montrés'))}">${[...Array.from({length: Math.min(deepest, 30)}, (_, i) => [String(i + 1), i ? String(i + 1) : T('Niveau 1')]), ['all', T('+ passages')]].map(([k, l]) => `<button type="button" role="radio" aria-checked="${level === k}" class="${level === k ? 'is-active' : ''}" data-rs-level="${k}">${esc(l)}</button>`).join('')}</span></span>
                <input type="search" class="rs-q" data-rs-q value="${esc(st.q)}" placeholder="${esc(T('Chercher dans le sommaire…'))}" aria-label="${esc(T('Chercher dans le sommaire'))}">
                <span class="re-row">${ro ? '' : `<button type="button" class="button small" data-rs-new="chapter">＋ ${esc(T('Chapitre…'))}</button><button type="button" class="button small secondary" data-rs-new="element">＋ ${esc(T('Passage…'))}</button><button type="button" class="button small secondary" data-rs-propose>✨ ${esc(T('Proposer le découpage'))}</button>${isLiasse(D) ? `<button type="button" class="button small secondary" data-rs-arrange>🗃 ${esc(T('Ranger par…'))}</button>` : ''}`}
                <button type="button" class="button small secondary${st.read ? ' is-active' : ''}" data-rs-read aria-pressed="${st.read}">📖 ${esc(T('Mode lecture'))}</button></span></div>
            ${warn.length ? `<div class="re-msg is-warn rs-warn">${warn.slice(0, 8).join('<br>')}${warn.length > 8 ? `<br>${esc(T('… et {n} autres.', {n: String(warn.length - 8)}))}` : ''}</div>` : ''}
            ${items.length ? (show.length ? `<ul class="rs-tree">${show.map(line).join('')}</ul>` : A().empty(T('Rien ne correspond.'), {icon: '🔎'}))
                : A().emptyState({icon: '📑', text: T('Pas encore de sommaire'), hint: T('« ＋ Chapitre… » : un titre, de telle page à telle page (ex. « Mariages 1870 », pages 15 à 19). Ou « ✨ Proposer le découpage » d’après les actes déjà transcrits.')})}
            <p class="muted rs-hint">${esc(T('Un clic sur un titre : sa première page. Un passage décrit (« du milieu de la page 5 au milieu de la page 7 : mariage… ») ne crée pas de fiche.'))}</p>
            <section class="ri-box" data-ri-host></section></div>`;
        const again = () => paint(body, ctx);
        ext.recueilIndex?.mount(body.querySelector('[data-ri-host]'), ctx); // 📇 tables et index (heritage-recueil-index.js)
        const reloadAll = async () => { cache.delete(rid); await ctx.reload(); };
        body.querySelectorAll('[data-rs-fold]').forEach(b => b.addEventListener('click', () => { const id = Number(b.dataset.rsFold), s = shutRead(rid); if (s.has(id)) s.delete(id); else s.add(id); shutWrite(rid, s); again().then(() => body.querySelector(`[data-rs-fold="${id}"]`)?.focus()); }));
        body.querySelectorAll('[data-rs-all]').forEach(b => b.addEventListener('click', () => { shutWrite(rid, b.dataset.rsAll === 'open' ? new Set() : new Set(items.filter(r => r.children).map(r => r.id))); again(); }));
        body.querySelectorAll('[data-rs-level]').forEach(b => b.addEventListener('click', () => { levelWrite(b.dataset.rsLevel); again(); }));
        let timer = 0;
        body.querySelector('[data-rs-q]').addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => { st.q = e.target.value; again().then(() => { const i = body.querySelector('[data-rs-q]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 200); });
        body.querySelector('[data-rs-read]').addEventListener('click', () => { st.read = !st.read; again(); });
        body.querySelectorAll('[data-rs-open]').forEach(b => b.addEventListener('click', () => ctx.openPage(Number(b.dataset.rsOpen))));
        body.querySelectorAll('[data-rs-new]').forEach(b => b.addEventListener('click', () => itemDialog(ctx, {kind: b.dataset.rsNew}, items, reloadAll)));
        body.querySelector('[data-rs-propose]')?.addEventListener('click', () => propose(ctx, reloadAll));
        body.querySelector('[data-rs-arrange]')?.addEventListener('click', e => arrange(e.currentTarget, ctx));
        body.querySelectorAll('[data-rs-menu]').forEach(b => b.addEventListener('click', () => {
            const r = byId.get(Number(b.dataset.rsMenu)); if (!r) return;
            const sib = items.filter(x => x.parent_id === r.parent_id), i = sib.indexOf(r);
            UI().menuAt?.(b, [{icon: '✎', label: T('Modifier…'), run: () => itemDialog(ctx, r, items, reloadAll)},
                ...(r.kind === 'chapter' ? [{icon: '＋', label: T('Sous-chapitre…'), run: () => itemDialog(ctx, {kind: 'chapter', parent_id: r.id, page_from: r.page_from, page_to: r.page_to}, items, reloadAll)},
                    {icon: '＋', label: T('Passage dans ce chapitre…'), run: () => itemDialog(ctx, {kind: 'element', parent_id: r.id, page_from: r.page_from, page_to: r.page_from}, items, reloadAll)},
                    {icon: '✨', label: T('Proposer le découpage de ce chapitre'), run: () => propose(ctx, reloadAll, r)}] : []),
                ...(i > 0 && sib[i - 1].from_num === r.from_num ? [{icon: '↑', label: T('Monter'), run: () => move(ctx, r, -1, reloadAll)}] : []),
                ...(i < sib.length - 1 && sib[i + 1].from_num === r.from_num ? [{icon: '↓', label: T('Descendre'), run: () => move(ctx, r, 1, reloadAll)}] : []),
                '-', {icon: '🗑', label: r.children ? T('Supprimer (avec ce qu’il contient)') : T('Supprimer'), danger: true, run: () => remove(ctx, r, reloadAll)}], {title: r.title.slice(0, 60)});
        }));
    }
    async function move(ctx, r, dir, after) { try { await ctx.post('move_recueil_toc', {id: r.id, dir}); await after(); } catch (e) { toast(e.message, 'error'); } }
    async function remove(ctx, r, after) {
        try {
            const x = await ctx.post('delete_recueil_toc', {id: r.id}), res = x.result || x;
            A().undoToast?.(T('« {t} » retiré du sommaire', {t: r.title.slice(0, 60)}), {undo: async () => { await ctx.post('restore_recueil_toc', {recueil_id: ctx.D().recueil.id, rows: res.removed}); await after(); }});
            await after();
        } catch (e) { toast(e.message, 'error'); }
    }

    /* ─── la fenêtre d'un chapitre ou d'un passage ─── */
    function itemDialog(ctx, r, items, after) {
        const D = ctx.D(), el = r.kind === 'element', isNew = !r.id;
        const pageOpts = cur => D.pages.map(p => `<option value="${p.id}" ${Number(cur) === p.id ? 'selected' : ''}>${esc(`${p.num}${p.label ? ' — ' + p.label : ''}`)}</option>`).join('');
        const posOpts = cur => POS.map(([k]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${esc(k ? T(k === 'haut' ? 'en haut' : k === 'milieu' ? 'au milieu' : 'en bas') : T('toute la page'))}</option>`).join('');
        // un chapitre ne va pas dans lui-même ni dans un de ses sous-chapitres
        const below = new Set(); if (r.id) { below.add(r.id); let grow = true; while (grow) { grow = false; items.forEach(x => { if (below.has(x.parent_id) && !below.has(x.id)) { below.add(x.id); grow = true; } }); } }
        const parents = items.filter(x => x.kind === 'chapter' && !below.has(x.id));
        const title = isNew ? (el ? T('Nouveau passage') : T('Nouveau chapitre')) : (el ? T('Modifier le passage') : T('Modifier le chapitre'));
        ext.openDialog({eyebrow: T('📑 SOMMAIRE'), title, wide: true, submitLabel: isNew ? T('Ajouter') : T('Enregistrer'),
            body: `<div class="form-grid rs-form">
                <label class="span-2">${esc(el ? T('Ce que c’est (sans créer de fiche)') : T('Titre'))}<input name="title" required maxlength="300" value="${esc(r.title || '')}" placeholder="${esc(el ? T('ex. Mariage de Louis LACOMBE et Anne MAZAUD') : T('ex. Mariages 1870'))}"></label>
                <label class="span-2">${esc(T('Dans'))}<select name="parent_id"><option value="0">${esc(T('— au premier niveau —'))}</option>${parents.map(x => `<option value="${x.id}" ${Number(r.parent_id) === x.id ? 'selected' : ''}>${esc('  '.repeat(x.level - 1) + (x.level > 1 ? '› ' : '') + x.title)}</option>`).join('')}</select></label>
                <label>${esc(T('De la page'))}<select name="page_from">${el ? '' : `<option value="0">${esc(T('— pas dit —'))}</option>`}${pageOpts(r.page_from)}</select></label>
                ${el ? `<label>${esc(T('Endroit'))}<select name="pos_from">${posOpts(r.pos_from || '')}</select></label>` : ''}
                <label>${esc(T('À la page'))}<select name="page_to">${el ? '' : `<option value="0">${esc(T('— la même —'))}</option>`}${pageOpts(r.page_to || r.page_from)}</select></label>
                ${el ? `<label>${esc(T('Endroit'))}<select name="pos_to">${posOpts(r.pos_to || '')}</select></label>` : ''}
                ${el ? '' : `<label>${esc(T('Sorte d’acte (facultatif)'))}<select name="act_kind"><option value="">${esc(T('— toutes —'))}</option>${KINDS.map(([k]) => `<option value="${k}" ${r.act_kind === k ? 'selected' : ''}>${esc(kindLabel(k))}</option>`).join('')}</select></label>
                <label>${esc(T('Années (facultatif)'))}<span class="rs-years-in"><input name="year_from" inputmode="numeric" maxlength="4" value="${esc(r.year_from || '')}" placeholder="1870"> – <input name="year_to" inputmode="numeric" maxlength="4" value="${esc(r.year_to && r.year_to !== r.year_from ? r.year_to : '')}" placeholder="1872"></span></label>`}
                <label class="span-2">${esc(el ? T('Description, résumé, ce qu’on y apprend') : T('Note (facultatif)'))}<textarea name="note" rows="${el ? 5 : 3}">${esc(r.note || '')}</textarea></label></div>
                <p class="muted">${esc(el ? T('Un passage décrit sert à retrouver ce qu’il y a dans le recueil ; « 👤 » sur les fiches reste possible depuis l’Atelier.') : T('Un chapitre peut contenir des sous-chapitres et des passages. La sorte et les années servent à repérer ce qui n’est pas à sa place.'))}</p>`,
            onSubmit: async form => {
                const f = Object.fromEntries(new FormData(form)), body = {...f, id: r.id || 0, recueil_id: D.recueil.id, kind: r.kind,
                    page_from: Number(f.page_from || 0), page_to: Number(f.page_to || 0) || Number(f.page_from || 0), parent_id: Number(f.parent_id || 0), year_from: Number(f.year_from || 0), year_to: Number(f.year_to || 0) || Number(f.year_from || 0)};
                const x = await ctx.post('save_recueil_toc', body), res = x.result || x;
                A().undoToast?.(isNew ? T('« {t} » ajouté au sommaire', {t: String(f.title).slice(0, 60)}) : T('« {t} » modifié', {t: String(f.title).slice(0, 60)}), {undo: async () => {
                    if (isNew) await ctx.post('delete_recueil_toc', {id: res.id}); else await ctx.post('restore_recueil_toc', {recueil_id: D.recueil.id, rows: [res.before]});
                    await after(); }});
                await after(); return true;
            }});
    }

    /* ─── ✨ Proposer le découpage ─── */
    async function propose(ctx, after, inside = null) {
        const D = ctx.D();
        let prop; try { prop = await A().api('recueil_toc_propose', {id: D.recueil.id}); } catch (e) { return toast(e.message, 'error'); }
        let chapters = prop.chapters || [];
        if (inside) chapters = chapters.flatMap(c => (c.children?.length ? c.children : [c])).filter(c => c.from_num >= inside.from_num && c.to_num <= (inside.to_num || inside.from_num)).map(c => ({...c, children: []}));
        if (!chapters.length) return toast(prop.reason || T('Rien à proposer : aucun acte repéré sur ces pages.'));
        const row = (c, i, j = null) => `<li><label class="re-check"><input type="checkbox" data-rs-p="${i}" ${j === null ? '' : `data-rs-pk="${j}"`} checked> <span class="rs-rng">${esc(`${pw(D)} ${c.from_num}${c.to_num !== c.from_num ? '–' + c.to_num : ''}`)}</span> <input class="rs-ptitle" data-rs-pt="${i}${j === null ? '' : '.' + j}" value="${esc(c.title)}" aria-label="${esc(T('Titre'))}"></label>
            ${c.children?.length ? `<ul>${c.children.map((k, jj) => row(k, i, jj)).join('')}</ul>` : ''}</li>`;
        ext.openDialog({eyebrow: T('📑 SOMMAIRE'), title: inside ? T('Découper « {t} »', {t: inside.title.slice(0, 50)}) : T('✨ Proposer le découpage'), wide: true, submitLabel: T('Ajouter au sommaire'),
            body: `<p class="muted">${esc(T('D’après les actes déjà transcrits dans l’Atelier (leur sorte et leur année), page par page. Décoche ce qui ne va pas, corrige les titres : rien n’est ajouté avant que tu acceptes.'))}</p>
                <ul class="rs-prop">${chapters.map((c, i) => row(c, i)).join('')}</ul>`,
            onOpen: d => d.querySelectorAll('[data-rs-p]:not([data-rs-pk])').forEach(cb => cb.addEventListener('change', () => d.querySelectorAll(`[data-rs-p="${cb.dataset.rsP}"][data-rs-pk]`).forEach(k => { k.checked = cb.checked; }))),
            onSubmit: async form => {
                const pick = chapters.map((c, i) => {
                    const on = form.querySelector(`[data-rs-p="${i}"]:not([data-rs-pk])`)?.checked;
                    const kids = (c.children || []).map((k, j) => (form.querySelector(`[data-rs-p="${i}"][data-rs-pk="${j}"]`)?.checked ? {...k, title: form.querySelector(`[data-rs-pt="${i}.${j}"]`)?.value || k.title} : null)).filter(Boolean);
                    return on ? {...c, title: form.querySelector(`[data-rs-pt="${i}"]`)?.value || c.title, children: kids} : null;
                }).filter(Boolean);
                if (!pick.length) { toast(T('Rien de coché.'), 'error'); return false; }
                const x = await ctx.post('recueil_toc_accept', {recueil_id: D.recueil.id, parent_id: inside ? inside.id : 0, chapters: pick}), res = x.result || x;
                A().undoToast?.(plural(res.ids.length, 'chapitre ajouté au sommaire', 'chapitres ajoutés au sommaire'), {icon: '📑', undo: async () => { await ctx.post('recueil_toc_remove', {recueil_id: D.recueil.id, ids: res.ids}); await after(); }});
                await after(); return true;
            }});
    }

    /* ─── 🗃 ranger une liasse ─── */
    function arrange(btn, ctx) {
        const D = ctx.D();
        const go = async by => {
            try {
                const x = await ctx.post('recueil_reorder', {recueil_id: D.recueil.id, by}), res = x.result || x;
                const changed = res.before.some((id, i) => id !== res.order[i]);
                if (!changed) return toast(T('Déjà dans cet ordre.'));
                A().undoToast?.(T('Pièces rangées ({x})', {x: {date: T('par date'), kind: T('par sorte'), cote: T('par cote')}[by]}), {icon: '🗃', undo: async () => { await ctx.post('recueil_reorder', {recueil_id: D.recueil.id, order: res.before}); cache.delete(D.recueil.id); await ctx.reload(); }});
                cache.delete(D.recueil.id); await ctx.reload();
            } catch (e) { toast(e.message, 'error'); }
        };
        UI().menuAt?.(btn, [{icon: '📅', label: T('Par date (de l’acte, sinon du document)'), run: () => go('date')}, {icon: '📜', label: T('Par sorte d’acte'), run: () => go('kind')}, {icon: '🔢', label: T('Par cote'), run: () => go('cote')}], {title: T('Ranger les pièces')});
    }

    /* ─── le bloc du Résumé, et le chemin sur une page ─── */
    function block(b, ctx, el) {
        load(ctx).then(data => {
            if (!el.isConnected) return; const D = ctx.D();
            const items = (data.items || []).filter(r => r.kind === 'chapter' && r.level <= 2).slice(0, b?.n || 30);
            el.innerHTML = items.length ? `<ul class="rs-tree is-mini">${items.map(r => `<li class="rs-li lv-${r.level}" style="--lv:${r.level - 1}"><div class="rs-ln"><span class="rs-rng">${esc(range(D, r))}</span><button type="button" class="rs-title" data-rc-open="${r.page_from}" ${r.page_from ? '' : 'disabled'}>${esc(r.title)}</button><span class="spacer"></span>${bar(progress(D, r))}</div></li>`).join('')}</ul>
                <p><button type="button" class="link-button" data-rs-goto>📑 ${esc(T('Tout le sommaire'))}</button></p>` : `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📑</span><span class="empty-line-text">${esc(T('Pas encore de sommaire.'))}</span></p><button type="button" class="link-button" data-rs-goto>＋ ${esc(T('Faire le sommaire'))}</button>`;
            el.querySelectorAll('[data-rc-open]').forEach(x => x.addEventListener('click', () => ctx.openPage(Number(x.dataset.rcOpen))));
            el.querySelectorAll('[data-rs-goto]').forEach(x => x.addEventListener('click', () => ctx.openTab?.('sommaire')));
        }).catch(() => { el.textContent = ''; });
        return `<p class="muted">${esc(T('Chargement du sommaire…'))}</p>`;
    }
    function pagePath(el, p, ctx) {
        if (!el || !p) return;
        load(ctx).then(data => {
            if (!el.isConnected) return;
            const path = (data.items || []).filter(r => r.kind === 'chapter' && r.from_num && p.num >= r.from_num && p.num <= (r.to_num || r.from_num)).sort((a, b) => a.level - b.level);
            const els = (data.items || []).filter(r => r.kind === 'element' && r.from_num && p.num >= r.from_num && p.num <= (r.to_num || r.from_num));
            el.hidden = !path.length && !els.length;
            el.innerHTML = `${path.length ? `<p class="rs-path">📑 ${path.map(r => `<button type="button" class="link-button" data-rs-goto>${esc(r.title)}</button>`).join(' › ')}</p>` : ''}${els.length ? `<ul class="rs-pels">${els.map(r => `<li><span class="rs-rng">${esc(range(ctx.D(), r))}</span> ${esc(r.title)}</li>`).join('')}</ul>` : ''}`;
            el.querySelectorAll('[data-rs-goto]').forEach(x => x.addEventListener('click', () => ctx.openTab?.('sommaire')));
        }).catch(() => { el.hidden = true; });
    }
    const forget = rid => cache.delete(Number(rid));
    ext.recueilSommaire = {paint, block, pagePath, arrange, forget, range};
})();
