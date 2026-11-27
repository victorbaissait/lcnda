/* LCNDA — 📒 Fiches (onglet « Fiches », masqué au départ : Réglages → Apparence → ordre du menu).
 * Une fiche = une page sur un sujet (« La Pologne avant les guerres napoléoniennes », un métier, un lieu…), faite de
 * blocs rangés sur une grille : texte (mise en forme simple), images et documents, personnes, frise de dates, citation,
 * liens, intertitre, et ce que l'app sait montrer : un écran (carte, arbre, liste, Mes listes, fiche d'une personne,
 * village…) ou un widget / un graphique à soi. Serveur : lib/topic_sheets.php.
 * Audit des onglets (§13) : colonne = la barre commune (🔍 dans le contenu des fiches, extrait trouvé) ; en-têtes UI.pageHeader ;
 * ↩ « Cité dans » en bas de la fiche, et « 📒 Fiches qui la citent » sur la fiche d'une personne ; 🕘 Versions (L3) ;
 * bloc 🤖 « Les personnes de la base qui… » ; ⤓ Exporter (Markdown, page web) ; suppression d'une fiche ou d'un modèle
 * tout de suite avec « ↶ Annuler » ; mode consultation : rien à modifier ; « Chercher dans cette page » (R13).
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m))); // 🌐 app-i18n.js
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const esc = v => A().escapeHtml(v ?? '');
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const S = () => A().state;
    const kiosk = () => document.body.classList.contains('is-kiosk'); // R6 : mode consultation, rien à modifier
    const UIx = () => window.LCNDA_UI || {};
    const foldT = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const isCurrent = token => token === S().workspaceToken && S().module === 'fiches';
    const uid = () => 'b_' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);

    const KINDS = [
        ['text', '📝', 'Texte', 'Paragraphes, titres, listes, gras, italique, liens'],
        ['images', '🖼️', 'Images et documents', 'Photos, cartes anciennes, scans, PDF'],
        ['people', '👥', 'Personnes', 'Des fiches de la base liées au sujet'],
        ['dates', '📅', 'Frise de dates', 'Les dates clés, dans l’ordre'],
        ['quote', '❝', 'Citation', 'Un extrait, avec sa source'],
        ['links', '🔗', 'Liens', 'Sites, archives en ligne, articles'],
        ['divider', '➖', 'Intertitre', 'Un titre pour séparer les parties'],
        ['screen', '📺', 'Écran de l’app', 'Carte, arbre, liste, Mes listes, fiche d’une personne, village…'],
        ['diagram', '🏛️', 'Diagramme', 'Un de « Mes diagrammes » : hémicycle, frise d’un groupe, camembert…'],
        ['widget', '📊', 'Widget ou graphique à soi', 'Ceux de l’Éditeur de widgets / de graphiques'],
        ['photomap', '📸', 'Carte de photos', 'Une de tes cartes de photos (ou toutes), avec sa période'], // heritage-photomaps.js
        ['auto', '🤖', 'Les personnes de la base qui…', 'Tenu à jour tout seul : un métier, un lieu, une période'], // lib/topic_sheets.php (topic_auto_people)
        ['basket', '🧺', 'Panier', 'Ce qu’il y a dans un de tes paniers, tenu à jour (chaque chose avec sa source)'], // heritage-connexions.js (cx_basket)
        ['data', '📊', 'Données', 'Une liste de données : séismes, batailles, Tour de France… avec filtres, ou une question'], // 📊 plus bas : listes de données (app-listes-donnees.js), à jour ou figées
    ];

    /** 🧺 le bloc « Panier » : ce qu'il y a dans le panier choisi, relu à chaque affichage (chaque chose garde son origine ↗) */
    async function fillBaskets(root) {
        for (const el of root.querySelectorAll('[data-fi-basket]:not([data-fi-basket-done])')) {
            el.dataset.fiBasketDone = '1';
            let r = null; try { r = await api('cx_basket', {basket_id: Number(el.dataset.fiBasket) || 0}); } catch (_) {}
            const items = (r?.items || []).slice(0, Number(el.dataset.fiBasketLimit) || 50), b = (r?.baskets || []).find(x => Number(x.id) === Number(el.dataset.fiBasket));
            if (!items.length) { el.innerHTML = A().empty ? A().empty(i18n('Ce panier est vide pour l’instant.')) : `<p class="muted">${esc(i18n('Ce panier est vide pour l’instant.'))}</p>`; continue; }
            el.innerHTML = `${b?.name ? `<p class="muted">🧺 ${esc(b.name)}</p>` : ''}<ul class="h-fi-basket-list">${items.map((it, i) => `<li><b>${esc(it.title || '')}</b>${it.value && it.value !== it.title ? ` — ${esc(String(it.value).slice(0, 240))}` : ''}${it.origin?.label ? ` <button type="button" class="link-button" data-fi-bk-open="${i}" title="${esc(i18n('Revenir à l’origine'))}">↗ ${esc(it.origin.label)}</button>` : ''}</li>`).join('')}</ul>`;
            el.querySelectorAll('[data-fi-bk-open]').forEach(btn => btn.addEventListener('click', () => ext.connexions?.openOrigin?.(items[Number(btn.dataset.fiBkOpen)])));
        }
    }
    const kindOf = t => KINDS.find(k => k[0] === t) || KINDS[0];
    const WIDTHS = [['12', 'toute la largeur'], ['6', '½'], ['4', '⅓'], ['3', '¼'], ['8', '⅔'], ['9', '¾']];
    const TEMPLATES = [
        {name: 'Sujet d’histoire', icon: '🏛️', subtitle: 'Le contexte historique d’une époque ou d’un pays', blocks: [
            {type: 'text', title: 'En bref', width: '8', text: 'Ce qu’il faut savoir en quelques lignes.'}, {type: 'dates', title: 'Les dates clés', width: '4', rows: []},
            {type: 'divider', title: 'Le contexte'}, {type: 'text', title: 'Politique', width: '6', text: ''}, {type: 'text', title: 'Vie quotidienne', width: '6', text: ''},
            {type: 'images', title: 'Cartes et documents', width: '12', layout: 'grid'}, {type: 'people', title: 'Mes ancêtres concernés', width: '6', ids: []}, {type: 'links', title: 'Pour aller plus loin', width: '6', rows: []}]},
        {name: 'Un lieu', icon: '🏘️', subtitle: 'Un village, une ville, une région', blocks: [
            {type: 'text', title: 'Présentation', width: '8', text: ''}, {type: 'images', title: 'Photos', width: '4', layout: 'large'},
            {type: 'screen', title: 'La carte', width: '12', target: 'module:carte', height: 560}, {type: 'people', title: 'Ceux qui y ont vécu', width: '6', ids: []}, {type: 'links', title: 'Archives en ligne', width: '6', rows: []}]},
        {name: 'Un métier', icon: '🛠️', subtitle: 'Un métier d’autrefois', blocks: [
            {type: 'text', title: 'Le métier', width: '8', text: ''}, {type: 'quote', title: 'Témoignage', width: '4', text: '', source: ''},
            {type: 'people', title: 'Mes ancêtres qui l’ont exercé', width: '12', ids: []}, {type: 'images', title: 'Images', width: '12', layout: 'strip'}]},
        {name: 'Fiche vide', icon: '📒', subtitle: '', blocks: []},
    ];

    /* Mise en forme simple du texte : # titre, ## sous-titre, - liste, 1. liste, **gras**, *italique*, [texte](https://…), > citation */
    function md(src) {
        const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>').replace(/__(.+?)__/g, '<u>$1</u>')
            .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer" title="${u}">↗ ${t}</a>`);
        const out = []; let list = null;
        const flush = () => { if (list) { out.push(`<${list.t}>${list.items.map(i => `<li>${i}</li>`).join('')}</${list.t}>`); list = null; } };
        for (const line of String(src || '').split('\n')) {
            const l = line.trimEnd(); let m;
            if ((m = l.match(/^\s*[-•*]\s+(.*)$/))) { if (list?.t !== 'ul') { flush(); list = {t: 'ul', items: []}; } list.items.push(inline(m[1])); continue; }
            if ((m = l.match(/^\s*\d+[.)]\s+(.*)$/))) { if (list?.t !== 'ol') { flush(); list = {t: 'ol', items: []}; } list.items.push(inline(m[1])); continue; }
            flush();
            if ((m = l.match(/^###\s+(.*)$/))) out.push(`<h5>${inline(m[1])}</h5>`);
            else if ((m = l.match(/^##\s+(.*)$/))) out.push(`<h4>${inline(m[1])}</h4>`);
            else if ((m = l.match(/^#\s+(.*)$/))) out.push(`<h3>${inline(m[1])}</h3>`);
            else if ((m = l.match(/^>\s?(.*)$/))) out.push(`<blockquote>${inline(m[1])}</blockquote>`);
            else if (l.trim() === '---') out.push('<hr>');
            else if (l.trim() === '') out.push('');
            else out.push(`<p>${inline(l)}</p>`);
        }
        flush();
        return out.join('');
    }

    let sheets = [], cur = null, editing = false, filter = '';
    async function loadList() { try { sheets = (await api('topic_sheets')).sheets || []; } catch (e) { toast(e.message, 'error'); sheets = []; } }

    /* ─── Colonne de gauche ─── */
    ext.fiches = {};
    ext.fiches.sidebar = (content, footer) => {
        // R2 : la barre commune (🔍 Chercher, Trier) ; la recherche lit aussi le contenu des fiches (textes, citations, dates, liens)
        content.innerHTML = `<div class="h-fi-side"><div data-fi-bar></div><div data-fi-rows></div></div>`;
        const UI = UIx(), rowsBox = content.querySelector('[data-fi-rows]');
        let q = filter, sort = 'az';
        const snippet = (txt, w) => { const f = foldT(txt), i = f.indexOf(w); if (i < 0) return ''; const a = Math.max(0, i - 30); return `${a ? '…' : ''}${txt.slice(a, i + w.length + 50).replace(/\s+/g, ' ')}…`; };
        const draw = () => {
            const words = foldT(q).split(/\s+/).filter(Boolean);
            let rows = sheets.map(x => ({x, hay: foldT(`${x.title} ${x.subtitle || ''}`), body: foldT(x.text || '')})).filter(r => words.every(w => r.hay.includes(w) || r.body.includes(w)));
            rows = UI.sortItems ? UI.sortItems(rows.map(r => ({...r, title: r.x.title, updated_at: r.x.updated_at})), sort, {name: r => r.title, date: r => r.updated_at}) : rows;
            bar?.setCount?.(`${A().plural(rows.length, 'fiche')}${rows.length !== sheets.length ? ` sur ${sheets.length}` : ''}`);
            rowsBox.innerHTML = `<button type="button" class="h-fi-sitem ${!S().ficheId ? 'is-active' : ''}" data-fi-open="0"><span>📚</span><strong>${esc(i18n('Toutes les fiches'))}</strong><small>${sheets.length}</small></button>
                ${rows.map(({x, hay}) => { const inText = words.length && !words.every(w => hay.includes(w)), sn = inText ? snippet(x.text || '', words.find(w => !hay.includes(w)) || words[0]) : '';
                    return `<button type="button" class="h-fi-sitem ${Number(S().ficheId) === x.id ? 'is-active' : ''}" data-fi-open="${x.id}"><span>${esc(x.icon || '📒')}</span><strong>${esc(x.title)}</strong><small>${x.blocks}</small>${sn ? `<em class="h-fi-snip" data-fi-snip>${esc(sn)}</em>` : ''}</button>`; }).join('')
                || `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🗂️</span><span class="empty-line-text">${esc(q.trim() ? i18n('Aucune fiche pour « {nm} »', {nm: q.trim()}) : i18n('Aucune fiche.'))}</span></p>`}`;
        };
        const bar = UI.listBar ? UI.listBar({key: 'fiches:colonne', search: {placeholder: i18n('Chercher dans les fiches… (titre, texte, citations)')}, sort: {options: [['az', 'A → Z'], ['za', 'Z → A'], ['recent', 'Les plus récentes'], ['old', 'Les plus anciennes']], value: 'az'},
            onChange: b => { q = b.q || ''; filter = q; sort = b.sort || 'az'; draw(); }}) : null;
        if (bar) { content.querySelector('[data-fi-bar]').appendChild(bar); q = bar.state?.q || q; sort = bar.state?.sort || sort; }
        else { content.querySelector('[data-fi-bar]').innerHTML = `<input type="search" data-fi-q placeholder="${esc(i18n('Chercher dans les fiches…'))}" value="${esc(filter)}">`; content.querySelector('[data-fi-q]').addEventListener('input', e => { q = filter = e.target.value; draw(); }); }
        draw();
        content.addEventListener('click', e => { const b = e.target.closest('[data-fi-open]'); if (!b) return; S().ficheId = Number(b.dataset.fiOpen) || 0; editing = false; A().setModule('fiches'); });
        footer.innerHTML = kiosk() ? '' : `<button type="button" class="button small" data-fi-new>${esc(i18n('＋ Nouvelle fiche'))}</button>`;
        footer.querySelector('[data-fi-new]')?.addEventListener('click', newSheet);
        if (!sheets.length) loadList().then(() => { if (S().module === 'fiches') draw(); });
    };

    /* ─── Écran ─── */
    ext.fiches.render = async token => {
        await loadList();
        if (!isCurrent(token)) return;
        const id = Number(S().ficheId) || 0;
        if (!id) { cur = null; let tpls = []; try { tpls = (await api('topic_sheet_templates')).templates || []; } catch (_) {} if (!isCurrent(token)) return; return renderIndex(token, tpls); }
        try { cur = await api('topic_sheet', {id}); } catch (e) { toast(e.message, 'error'); S().ficheId = 0; return renderIndex(token); }
        if (!isCurrent(token)) return;
        renderSheet(token);
        A().renderSidebar?.();
    };
    function renderIndex(token, tpls = []) {
        const ph = UIx().pageHeader ? UIx().pageHeader({icon: '📒', title: i18n('Mes fiches'), help: esc(i18n('Une fiche par sujet : l’histoire d’un pays à une époque, un lieu, un métier, une guerre, une coutume… Tu y mets ce que tu veux : du texte, des images et des documents, des personnes de la base, une frise de dates, des citations, des liens, et tout ce que l’app sait montrer (carte, arbre, listes, Mes listes, widgets et graphiques à toi).')),
            primary: kiosk() ? '' : `<button type="button" class="button" data-fi-new>${esc(i18n('＋ Nouvelle fiche'))}</button>`}) : '';
        A().$('#workspace').innerHTML = `<section class="page h-fi">
            ${ph}
            ${sheets.length ? `<div class="h-fi-cards">${sheets.map(s => `<button type="button" class="h-fi-card" data-fi-open="${s.id}" style="${s.color ? `--fi-c:${esc(s.color)}` : ''}">${s.cover ? `<span class="h-fi-cover">${A().mediaThumbHtml(s.cover)}</span>` : `<span class="h-fi-cover is-icon">${esc(s.icon || '📒')}</span>`}<strong>${esc(s.icon || '')} ${esc(s.title)}</strong><small>${esc(s.subtitle || '')}</small><small class="muted">${s.blocks} bloc${s.blocks > 1 ? 's' : ''}</small></button>`).join('')}</div>` : A().emptyState({icon: '📒', text: 'Aucune fiche pour l’instant', hint: 'Une fiche rassemble texte, images, personnes, cartes et listes sur un sujet.', action: kiosk() ? null : {label: '＋ Nouvelle fiche', attrs: 'data-fi-new'}})}
            ${tpls.length && !kiosk() ? `<h3 class="h-fi-modhead">⭐ Mes modèles <small class="muted">— des fiches toutes prêtes à remplir, proposées dans « Nouvelle fiche »</small></h3><div class="h-fi-cards is-models">${tpls.map(s => `<button type="button" class="h-fi-card" data-fi-open="${s.id}" style="${s.color ? `--fi-c:${esc(s.color)}` : ''}"><span class="h-fi-cover is-icon">${esc(s.icon || '📒')}</span><strong>⭐ ${esc(s.title)}</strong><small>${esc(s.subtitle || '')}</small><small class="muted">${s.blocks.length} bloc${s.blocks.length > 1 ? 's' : ''}</small></button>`).join('')}</div>` : ''}
        </section>`;
        const ws = A().$('#workspace');
        ws.querySelectorAll('[data-fi-new]').forEach(b => b.addEventListener('click', newSheet));
        ws.querySelectorAll('[data-fi-open]').forEach(b => b.addEventListener('click', () => { S().ficheId = Number(b.dataset.fiOpen); A().setModule('fiches'); }));
    }
    /** Les blocs vidés de leur contenu : même ordre, mêmes titres, largeurs, couleurs et réglages (écran, widget, disposition des images) */
    const emptyBlocks = (blocks, keepContent = false) => JSON.parse(JSON.stringify(blocks)).map(b => {
        const o = {...b, id: uid()};
        if (!keepContent) { if ('text' in o) o.text = ''; if (o.source !== undefined) o.source = ''; if (o.caption !== undefined) o.caption = ''; if (o.note !== undefined) o.note = ''; if (Array.isArray(o.rows)) o.rows = []; if (Array.isArray(o.ids)) o.ids = []; if (o.snap) { delete o.snap; o.mode = 'live'; } }
        return o;
    });
    async function newSheet() {
        let mine = [];
        try { mine = (await api('topic_sheet_templates')).templates || []; } catch (_) {}
        const tplCard = (v, t, i, extra = '') => `<label class="h-fi-tpl"><input type="radio" name="tpl" value="${v}" ${i === 0 ? 'checked' : ''} data-icon="${esc(t.icon || '📒')}"><span>${esc(t.icon || '📒')}</span><strong>${esc(t.name || t.title)}</strong><small>${esc(t.subtitle || (t.blocks.length ? `${t.blocks.length} bloc${t.blocks.length > 1 ? 's' : ''}` : 'Rien : tu ajoutes les blocs toi-même'))}</small>${extra}</label>`;
        const mineHtml = () => mine.length ? `<div class="h-fi-tpls">${mine.map(t => tplCard('u' + t.id, t, -1, `<span class="h-fi-tplact"><button type="button" class="h-bt" data-fi-tpledit="${t.id}" title="Modifier le modèle">✎</button><button type="button" class="h-bt" data-fi-tpldel="${t.id}" title="Supprimer le modèle">🗑</button></span>`)).join('')}</div>`
            : '<p class="empty-line h-fi-nomodel"><span class="empty-line-ico" aria-hidden="true">🗂️</span><span class="empty-line-text">Aucun modèle pour l’instant : dans une fiche, « ⧉ Dupliquer » → « ⭐ En faire un modèle ».</span></p>';
        ext.openDialog({eyebrow: 'FICHES', title: 'Nouvelle fiche', wide: true, submitLabel: 'Créer la fiche',
            body: `<div class="form-grid"><label class="span-2">Titre<input name="title" required maxlength="200" placeholder="La Pologne avant les guerres napoléoniennes"></label>
                <label>Icône<input name="icon" value="${esc(TEMPLATES[0].icon)}" maxlength="8" class="h-fi-iconin" readonly title="Choisir une icône"></label><label>Sous-titre <small>(facultatif)</small><input name="subtitle" maxlength="600"></label></div>
                <h4>Partir de</h4><div class="h-fi-tpls">${TEMPLATES.map((t, i) => tplCard(i, t, i)).join('')}</div>
                <h4>⭐ Mes modèles</h4><div data-fi-mine>${mineHtml()}</div>`,
            onOpen: d => {
                const ic = d.querySelector('.h-fi-iconin');
                ic.addEventListener('click', e => ext.pickEmoji?.(e.target));
                d.addEventListener('change', e => { if (e.target.name === 'tpl') ic.value = e.target.dataset.icon || '📒'; });
                d.addEventListener('click', async e => {
                    const b = e.target.closest('[data-fi-tpledit],[data-fi-tpldel]'); if (!b) return;
                    e.preventDefault(); e.stopPropagation();
                    const id = Number(b.dataset.fiTpledit || b.dataset.fiTpldel), t = mine.find(x => x.id === id);
                    if (b.dataset.fiTpledit) { d.close(); S().ficheId = id; editing = true; return A().setModule('fiches'); }
                    // R7 : supprimé tout de suite, « ↶ Annuler » le remet (même numéro, lib/topic_sheets.php : topic_undelete)
                    try {
                        await post('delete_topic_sheet', {id}); const pos = mine.findIndex(x => x.id === id); mine = mine.filter(x => x.id !== id);
                        const paint = () => { if (!d.isConnected) return; const wasMine = d.querySelector('input[name="tpl"]:checked')?.value === 'u' + id; d.querySelector('[data-fi-mine]').innerHTML = mineHtml(); if (wasMine || !d.querySelector('input[name="tpl"]:checked')) d.querySelector('input[name="tpl"]').checked = true; };
                        paint();
                        A().undoToast?.(i18n('Modèle « {nm} » supprimé', {nm: t?.title || ''}), {undo: async () => { await post('save_topic_sheet', {undelete: id}); if (t && !mine.some(x => x.id === id)) mine.splice(Math.max(0, pos), 0, t); paint(); }, redo: async () => { await post('delete_topic_sheet', {id}); mine = mine.filter(x => x.id !== id); paint(); }});
                    } catch (err) { toast(err.message, 'error'); }
                });
            },
            onSubmit: async form => {
                const f = Object.fromEntries(new FormData(form)), v = String(f.tpl || '');
                const t = v.startsWith('u') ? mine.find(x => 'u' + x.id === v) : TEMPLATES[Number(v)];
                const src = t || TEMPLATES.at(-1);
                const blocks = emptyBlocks(src.blocks, true);
                const r = await post('save_topic_sheet', {title: f.title, icon: f.icon || src.icon, subtitle: f.subtitle || '', color: src.color || '', blocks});
                S().ficheId = Number(r.result?.id || r.id); editing = true; A().setModule('fiches');
            }});
    }
    /** ⧉ Dupliquer : copie complète, même ordre de blocs mais vide, ou modèle pour les prochaines fiches */
    function duplicateSheet() {
        const c = cur, isTpl = !!c.template;
        const opt = (v, ic, l, h, on) => `<label class="h-fi-tpl"><input type="radio" name="how" value="${v}" ${on ? 'checked' : ''}><span>${ic}</span><strong>${l}</strong><small>${h}</small></label>`;
        ext.openDialog({eyebrow: isTpl ? 'MODÈLE' : 'FICHE', title: '⧉ Dupliquer', wide: true, submitLabel: 'Dupliquer',
            body: `<div class="h-fi-tpls">${isTpl ? opt('model', '⭐', 'Une copie du modèle', 'Pour faire une variante du modèle', true) + opt('structure', '▦', 'Une fiche avec ce modèle', 'Une nouvelle fiche, blocs dans le même ordre', false)
                : opt('full', '⧉', 'Une copie complète', 'Tout le contenu (les images restent sur l’original)', true) + opt('structure', '▦', 'Le même ordre de blocs', 'Une nouvelle fiche avec les mêmes blocs, mais vides', false) + opt('model', '⭐', 'En faire un modèle', 'Proposé dans « Nouvelle fiche » → « Mes modèles »', false)}</div>
                <div class="form-grid"><label class="span-2">Nom<input name="title" required maxlength="200" value="${esc(c.title + ' (copie)')}"></label>
                <label class="span-2 checkbox-line" data-fi-keep hidden><input type="checkbox" name="keep"> garder aussi les textes, citations, dates, liens et personnes (les images ne vont pas dans un modèle)</label></div>`,
            onOpen: d => {
                const name = d.querySelector('[name="title"]'), keep = d.querySelector('[data-fi-keep]');
                d.addEventListener('change', e => {
                    if (e.target.name !== 'how') return; const v = e.target.value;
                    keep.hidden = v !== 'model' || isTpl; keep.style.display = keep.hidden ? 'none' : '';
                    name.value = v === 'model' && !isTpl ? c.title : v === 'structure' ? (isTpl ? 'Nouvelle fiche' : c.title + ' (nouvelle)') : c.title + ' (copie)';
                });
                keep.style.display = 'none';
            },
            onSubmit: async form => {
                const f = Object.fromEntries(new FormData(form)), title = String(f.title || '').trim() || c.title;
                const base = {title, subtitle: c.subtitle, icon: c.icon, color: c.color};
                let r;
                if (f.how === 'full') { r = await post('save_topic_sheet', {...base, blocks: c.blocks.map(b => ({...b, id: b.type === 'images' ? b.id : uid()}))}); toast('Fiche dupliquée (les images restent sur l’original).'); }
                else if (f.how === 'structure') { r = await post('save_topic_sheet', {...base, blocks: emptyBlocks(c.blocks, isTpl)}); toast('Nouvelle fiche avec le même ordre de blocs.'); }
                else { r = await post('save_topic_sheet', {...base, template: 1, blocks: emptyBlocks(c.blocks, isTpl || !!form.elements.keep.checked)}); toast(isTpl ? 'Modèle dupliqué.' : '⭐ Modèle créé : tu le retrouves dans « Nouvelle fiche » → « Mes modèles ».'); if (!isTpl) return; }
                S().ficheId = Number(r.result?.id || r.id); A().setModule('fiches');
            }});
    }
    const save = async (quiet = true, extra = {}) => {
        try { await post('save_topic_sheet', {id: cur.id, title: cur.title, subtitle: cur.subtitle, icon: cur.icon, color: cur.color, blocks: cur.blocks, ...extra}); if (!quiet) toast('Fiche enregistrée.'); }
        catch (e) { toast(e.message, 'error'); }
    };

    /* Le contenu d'un bloc */
    const mediaOf = b => (cur.media || []).filter(m => m.role === b.id);
    function blockBody(b) {
        switch (b.type) {
            case 'text': return b.text ? `<div class="h-fi-text">${md(b.text)}</div>` : '<p class="muted">Texte vide : ✎ pour l’écrire.</p>';
            case 'quote': return b.text ? `<figure class="h-fi-quote"><blockquote>${esc(b.text).replace(/\n/g, '<br>')}</blockquote>${b.source ? `<figcaption>— ${esc(b.source)}</figcaption>` : ''}</figure>` : '<p class="muted">Citation vide : ✎ pour l’écrire.</p>';
            case 'images': { const ms = mediaOf(b); return ms.length ? `<div class="h-fi-imgs is-${esc(b.layout || 'grid')}">${ext.thumbs ? ext.thumbs('fiche-' + b.id, ms) : ms.map(m => A().mediaThumbHtml(m)).join('')}</div>${b.caption ? `<p class="h-fi-caption">${esc(b.caption)}</p>` : ''}` : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🖼️</span><span class="empty-line-text">Aucune image : ✎ pour en ajouter (de l’ordinateur ou déjà dans l’app).</span></p>'; }
            case 'auto': { const ps = (b.ids || []).map(i => cur.people?.[i]).filter(Boolean), crit = [b.occupation && i18n('métier : {x}', {x: b.occupation}), b.place && i18n('lieu : {x}', {x: b.place}), (b.from || b.to) && `${b.from || '…'} – ${b.to || '…'}`].filter(Boolean).join(' · ');
                if (!crit) return `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🤖</span><span class="empty-line-text">${esc(i18n('Rien de choisi : ✎ pour dire qui montrer (un métier, un lieu, une période).'))}</span></p>`;
                return `<p class="h-fi-autocrit muted">🤖 ${esc(crit)} · ${esc(A().plural(ps.length, i18n('personne')))}${ps.length >= (Number(b.limit) || 60) ? ` ${esc(i18n('(les premières)'))}` : ''}</p>` + blockBody({...b, type: 'people', ids: b.ids || []}); }
            case 'people': { const ps = (b.ids || []).map(i => cur.people?.[i]).filter(Boolean); return (ps.length ? `<div class="h-fi-people">${ps.map(p => `<button type="button" class="h-fi-person" data-h-person="${Number(p.id)}"><span class="h-fi-ini ${p.gender === 'female' ? 'is-f' : p.gender === 'male' ? 'is-m' : ''}">${esc(((p.first_name || '')[0] || '') + ((p.last_name || '')[0] || ''))}</span><span><strong>${esc(A().personName(p))}</strong><small>${esc([p.birth_year || p.death_year ? `${p.birth_year || '?'} – ${p.death_year || '?'}` : '', p.occupation].filter(Boolean).join(' · '))}</small></span></button>`).join('')}</div>` : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">👤</span><span class="empty-line-text">Aucune personne : ✎ pour en ajouter.</span></p>') + (b.note ? `<p class="h-fi-caption">${esc(b.note)}</p>` : ''); }
            case 'dates': return (b.rows || []).length ? `<ol class="h-fi-dates">${b.rows.map(r => `<li><span>${esc(r.date)}</span><p>${esc(r.text)}</p></li>`).join('')}</ol>` : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📅</span><span class="empty-line-text">Aucune date : ✎ pour en ajouter.</span></p>';
            case 'links': return (b.rows || []).length ? `<ul class="h-fi-links">${b.rows.map(r => `<li>${r.url ? `${window.LCNDA_UI.extLink(r.url, r.label || r.url)}` : esc(r.label)}${r.note ? ` <small class="muted">— ${esc(r.note)}</small>` : ''}</li>`).join('')}</ul>` : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📭</span><span class="empty-line-text">Aucun lien : ✎ pour en ajouter.</span></p>';
            case 'screen': {
                const as = ext.appScreen; if (!as) return '<p class="muted">Écran indisponible.</p>';
                if (as.nested) return as.nestedLink(b.target, b.title || as.label(b.target));
                return as.valid(b.target) ? `<iframe class="h-ct-frame" src="${esc(as.url(b))}" title="${esc(b.title || as.label(b.target))}" loading="lazy" style="height:${Math.max(240, Math.min(2000, Number(b.height) || 560))}px"></iframe>` : '<p class="muted">Cet écran n’existe plus : ✎ pour en choisir un autre.</p>';
            }
            case 'diagram': return Number(b.diagram) && ext.diagramEmbedHtml ? ext.diagramEmbedHtml(b.diagram) : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📭</span><span class="empty-line-text">Aucun diagramme choisi : ✎ pour en choisir un.</span></p>';
            case 'photomap': return `<div class="pm-widget" data-fi-photomap="${esc(JSON.stringify(b.config || {}))}">${window.LCNDA_UI.spinner('Chargement de la carte…')}</div>`;
            case 'basket': return `<div class="h-fi-basket" data-fi-basket="${Number(b.basket) || 0}" data-fi-basket-limit="${Number(b.limit) || 50}">${window.LCNDA_UI.spinner(i18n('Chargement du panier…'))}</div>`;
            case 'data': return dBody(b);
            case 'widget': return b.widget ? `<div class="h-fi-widget" data-fi-widget="${esc(b.widget)}">${window.LCNDA_UI.spinner('Calcul…')}</div>` : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🧩</span><span class="empty-line-text">Aucun widget choisi : ✎ pour en choisir un.</span></p>';
            default: return '';
        }
    }
    const titleOf = b => b.title || (b.type === 'data' ? dTitle(b) : b.type === 'screen' && ext.appScreen ? ext.appScreen.label(b.target) : b.type === 'widget' ? (ext.customWidgetDefs?.()[b.widget]?.name || 'Widget') : b.type === 'diagram' ? ((ext.diagramItems?.() || []).find(x => Number(x[0]) === Number(b.diagram))?.[1].replace(/^\S+\s/, '') || 'Diagramme') : kindOf(b.type)[2]);
    function renderSheet(token) {
        const c = cur;
        if (kiosk()) editing = false; // R6 : avant de dessiner les blocs (pas d'outils ✎ en consultation)
        const blocks = c.blocks.map((b, i) => {
            const tools = editing ? `<span class="h-fi-tools"><button type="button" class="h-bt h-fi-arrow" data-fi-up="${i}" title="Avant">↑</button><button type="button" class="h-bt h-fi-arrow" data-fi-down="${i}" title="Après">↓</button><button type="button" class="h-bt" data-fi-edit="${i}" title="Modifier">✎</button><button type="button" class="h-bt" data-fi-dup="${i}" title="Dupliquer">⧉</button><button type="button" class="h-bt" data-fi-del="${i}" title="Supprimer">🗑</button></span>`
                : (['screen'].includes(b.type) ? `<button type="button" class="button small secondary" data-ct-open-screen="${esc(b.target)}" title="Ouvrir en grand">↗</button>` : '') + (kiosk() ? '' : `<button type="button" class="h-bt h-fi-quickedit" data-fi-edit="${i}" title="Modifier">✎</button>`);
            if (b.type === 'divider') return `<div class="span-12 h-fi-divider" data-fi-block="${i}" style="${b.color ? `--fi-c:${esc(b.color)}` : ''}"><h3>${esc(b.title || 'Intertitre')}</h3>${tools}</div>`;
            const html = A().card(i + 1, '\u0001', '', blockBody(b), 'span-' + (b.width || '12'), tools).replace('\u0001', `${kindOf(b.type)[1]} ${esc(titleOf(b))}`);
            return html.replace('<section class="card', `<section data-fi-block="${i}" style="${b.color ? `--fi-c:${esc(b.color)}` : ''}" class="h-fi-block ${b.color ? 'has-color' : ''} card`);
        }).join('');
        if (kiosk()) editing = false;
        const ro = kiosk(), bt = (attrs, label, cls = 'secondary') => `<button type="button" class="button ${cls}" ${attrs}>${esc(i18n(label))}</button>`;
        // R1 : l'en-tête commun ; R4 : ⤓ Exporter ▾ et 🖨 Imprimer en haut à droite ; R6 : rien à modifier en consultation
        const head = UIx().pageHeader ? UIx().pageHeader({where: c.template ? i18n('⭐ Modèle de fiche') : undefined, icon: c.icon || '📒', title: c.title, help: c.subtitle ? esc(c.subtitle) : '', detail: true, cls: 'h-fi-head',
            primary: ro ? '' : `<button type="button" class="button ${editing ? '' : 'secondary'}" data-fi-mode>${esc(i18n(editing ? '✓ Terminé' : '✏️ Organiser'))}</button>`,
            actions: [ro ? '' : bt('data-fi-add', '＋ Bloc'), c.template && !ro ? bt('data-fi-use', '＋ Créer une fiche avec ce modèle', '') : '', bt('data-fi-export', '⤓ Exporter ▾'), bt('data-fi-print', '🖨 Imprimer')].filter(Boolean),
            more: [ro ? '' : `<button type="button" data-fi-props>${esc(i18n('⚙️ Titre, icône, couleur'))}</button>`, ro ? '' : `<button type="button" data-fi-copy>${esc(i18n('⧉ Dupliquer'))}</button>`, ro ? '' : `<button type="button" data-fi-versions>${esc(i18n('🕘 Versions'))}${c.versions ? ` (${c.versions})` : ''}</button>`, ro ? '' : `<button type="button" class="danger" data-fi-delete>${esc(i18n('🗑 Supprimer'))}</button>`].filter(Boolean)})
            : `<header class="page-header h-fi-head"><div><h2>${esc(c.icon || '📒')} ${esc(c.title)}</h2></div></header>`;
        const cited = (c.cited_in || []);
        A().$('#workspace').innerHTML = `<section class="page h-fi ${editing ? 'is-editing' : ''}" style="${c.color ? `--fi-c:${esc(c.color)}` : ''}">
            ${head}
            <div class="card-grid h-fi-grid">${blocks || A().empty(ro ? i18n('Fiche vide.') : 'Fiche vide : « ＋ Bloc » pour ajouter du texte, des images, des personnes, une carte, une liste…')}</div>
            ${editing ? '<div class="h-fi-addrow"><button type="button" class="button" data-fi-add>＋ Ajouter un bloc</button></div>' : ''}
            ${c.template ? '' : `<section class="card h-fi-cited" data-fi-cited><h3>↩ ${esc(i18n('Cité dans'))} <small class="muted">${cited.length}</small></h3>${cited.length ? `<ul class="h-fi-citedlist">${cited.map(x => `<li><button type="button" class="table-link" data-fi-cite-go="${esc(x.kind)}:${Number(x.id)}">${esc(x.label)}</button>${x.via ? ` <small class="muted">${esc(i18n('({x})', {x: i18n(x.via)}))}</small>` : ''}</li>`).join('')}</ul>` : `<p class="muted">${esc(i18n('Rien ne renvoie encore à cette fiche : écris son titre (« {t} ») dans une note de personne ou de lieu, une enquête, ou une autre fiche.', {t: c.title}))}</p>`}</section>`}
        </section>`;
        const ws = A().$('#workspace');
        fillBaskets(ws);
        ws.querySelectorAll('[data-fi-photomap]').forEach(el => { let c = {}; try { c = JSON.parse(el.dataset.fiPhotomap || '{}'); } catch (_) {} if (ext.photomapEmbed) ext.photomapEmbed(el, c); else el.innerHTML = '<p class="muted">Carte de photos indisponible.</p>'; });
        ws.querySelectorAll('[data-fi-widget]').forEach(el => { if (ext.renderCustomWidgetInto) ext.renderCustomWidgetInto(el, el.dataset.fiWidget).catch?.(() => { el.innerHTML = '<p class="muted">Ce widget n’existe plus.</p>'; }); else el.innerHTML = '<p class="muted">Widget indisponible.</p>'; });
        dMount(ws, c); // 📊 les blocs « Données » à jour : la liste relue à chaque ouverture
        A().bindTableLinks?.();
        pageFind(ws.querySelector('.h-fi'));
        ws.querySelector('.h-fi').addEventListener('click', async e => {
            const t = e.target.closest('button'); if (!t) return;
            const d = t.dataset, i = Number(d.fiUp ?? d.fiDown ?? d.fiEdit ?? d.fiDel ?? d.fiDup ?? -1);
            if (kiosk() && (d.fiDfreeze !== undefined || d.fiMode !== undefined || d.fiAdd !== undefined || d.fiProps !== undefined || d.fiEdit !== undefined || d.fiDelete !== undefined || d.fiCopy !== undefined || d.fiUse !== undefined || d.fiVersions !== undefined)) return toast(i18n('Mode consultation : rien ne peut être modifié.'), 'error');
            if (d.fiMode !== undefined) { editing = !editing; return renderSheet(token); }
            if (d.fiAdd !== undefined) return addBlock();
            if (d.fiProps !== undefined) return editProps();
            if (d.fiPrint !== undefined) return printSheet();
            if (d.fiExport !== undefined) return exportMenu(t);
            if (d.fiVersions !== undefined) { t.closest('details')?.removeAttribute('open'); return openVersions(); }
            if (d.fiCiteGo !== undefined) return citeGo(d.fiCiteGo);
            if (d.fiDfreeze !== undefined) return dFreeze(d.fiDfreeze);
            if (d.fiDopen !== undefined) return dOpenList(c.blocks.find(x => x.id === d.fiDopen), c);
            if (d.fiCopy !== undefined) return duplicateSheet();
            if (d.fiUse !== undefined) { const r = await post('save_topic_sheet', {title: 'Nouvelle fiche', subtitle: '', icon: c.icon, color: c.color, blocks: emptyBlocks(c.blocks, true)}); toast('Fiche créée avec ce modèle : change son titre dans « ⚙️ Titre, icône, couleur ».'); S().ficheId = Number(r.result?.id || r.id); editing = true; return A().setModule('fiches'); }
            if (d.fiDelete !== undefined) { // R7 : supprimée tout de suite, « ↶ Annuler » la remet (même numéro, images et étiquettes)
                t.closest('details')?.removeAttribute('open');
                try { await post('delete_topic_sheet', {id: c.id}); } catch (err) { return toast(err.message, 'error'); }
                const id = c.id; S().ficheId = 0; sheets = sheets.filter(x => x.id !== id);
                A().undoToast?.(c.template ? i18n('Modèle « {nm} » supprimé', {nm: c.title}) : i18n('Fiche « {nm} » supprimée', {nm: c.title}), {
                    undo: async () => { await post('save_topic_sheet', {undelete: id}); await loadList(); if (S().module === 'fiches') { S().ficheId = id; A().setModule('fiches'); } },
                    redo: async () => { await post('delete_topic_sheet', {id}); await loadList(); if (S().module === 'fiches' && Number(S().ficheId) === id) { S().ficheId = 0; A().setModule('fiches'); } }});
                return A().setModule('fiches'); }
            if (d.fiUp !== undefined && i > 0) { [c.blocks[i - 1], c.blocks[i]] = [c.blocks[i], c.blocks[i - 1]]; await save(); return renderSheet(token); }
            if (d.fiDown !== undefined && i < c.blocks.length - 1) { [c.blocks[i + 1], c.blocks[i]] = [c.blocks[i], c.blocks[i + 1]]; await save(); return renderSheet(token); }
            if (d.fiDup !== undefined) { const b = JSON.parse(JSON.stringify(c.blocks[i])); b.id = uid(); c.blocks.splice(i + 1, 0, b); await save(); return renderSheet(token); }
            if (d.fiDel !== undefined) { // H7 : supprimé tout de suite, « ↶ Annuler » le remet à sa place
                const b = c.blocks[i]; c.blocks.splice(i, 1); await save();
                const same = () => { if (cur !== c) throw new Error('la fiche n’est plus ouverte'); };
                A().undoToast?.(i18n('Bloc « {nm} » supprimé', {nm: titleOf(b)}), {undo: async () => { same(); c.blocks.splice(Math.min(i, c.blocks.length), 0, b); await save(); if (S().module === 'fiches') refresh(); }, redo: async () => { same(); const k = c.blocks.indexOf(b); if (k >= 0) { c.blocks.splice(k, 1); await save(); } if (S().module === 'fiches') refresh(); }});
                return refresh(); }
            if (d.fiEdit !== undefined) return editBlock(i, null, t.closest('[data-fi-block]'));
        });
    }
    const refresh = () => A().setModule('fiches');

    /* R13 — « Chercher dans cette page » : sur une fiche de 6 blocs ou plus, cache les blocs qui ne contiennent pas le texte */
    function pageFind(page) {
        if (!page || page.querySelector('.h-fi-find')) return;
        const blocks = () => [...page.querySelectorAll('[data-fi-block]')]; if (blocks().length < 6) return;
        const box = document.createElement('div'); box.className = 'h-fi-find ui-l6'; box.setAttribute('role', 'search');
        const sf = UIx().searchField ? UIx().searchField({placeholder: i18n('Chercher dans cette page…'), label: i18n('Chercher dans cette page')}) : null;
        const input = sf ? sf.input : Object.assign(document.createElement('input'), {type: 'search', placeholder: i18n('Chercher dans cette page…')});
        input.dataset.fiFind = '1'; box.appendChild(sf || input);
        const info = document.createElement('small'); info.className = 'ui-l6-info'; info.setAttribute('aria-live', 'polite'); box.appendChild(info);
        const apply = () => { const q = foldT(input.value.trim()); let hit = 0; blocks().forEach(el => { const ok = !q || foldT(el.textContent).includes(q); el.classList.toggle('h-fi-find-off', !ok); if (ok) hit++; }); info.textContent = q ? i18n('{n} sur {all}', {n: hit, all: blocks().length}) : ''; };
        input.addEventListener('input', () => { clearTimeout(input._t); input._t = setTimeout(apply, 120); }); input.addEventListener('search', apply);
        const head = page.querySelector(':scope > .page-header'); if (head) head.after(box); else page.prepend(box);
    }
    /* ↩ Cité dans : ouvrir ce qui renvoie à la fiche */
    function citeGo(v) {
        const [kind, id] = String(v).split(':'), n = Number(id);
        if (kind === 'person') return A().openPersonById?.(n);
        if (kind === 'sheet') { S().ficheId = n; editing = false; return A().setModule('fiches'); }
        if (kind === 'investigation') { S().currentInvestigationId = n; return A().setModule('enquetes'); }
        if (kind === 'place') return ext.shortcuts?.openTarget ? ext.shortcuts.openTarget(`place:${n}`) : A().setModule('carte');
    }
    /* ⤓ Exporter : la fiche en Markdown (.md) ou en page web (.html, un seul fichier) ; 🖨 Imprimer reste à côté */
    function sheetMarkdown(c) {
        const out = [`# ${c.icon ? c.icon + ' ' : ''}${c.title}`, c.subtitle ? `_${c.subtitle}_` : ''];
        c.blocks.forEach(b => {
            if (b.type === 'divider') { out.push(`## ${b.title || ''}`); return; }
            out.push(`### ${titleOf(b)}`);
            if (b.type === 'text') out.push(String(b.text || ''));
            else if (b.type === 'quote') out.push(String(b.text || '').split('\n').map(l => `> ${l}`).join('\n') + (b.source ? `\n>\n> — ${b.source}` : ''));
            else if (b.type === 'dates') out.push((b.rows || []).map(r => `- **${r.date}** — ${r.text}`).join('\n'));
            else if (b.type === 'links') out.push((b.rows || []).map(r => `- ${r.url ? `[${r.label || r.url}](${r.url})` : r.label}${r.note ? ` — ${r.note}` : ''}`).join('\n'));
            else if (b.type === 'people' || b.type === 'auto') out.push((b.ids || []).map(i => cur.people?.[i]).filter(Boolean).map(p => `- ${A().personName(p)}${p.birth_year || p.death_year ? ` (${p.birth_year || '?'}–${p.death_year || '?'})` : ''}`).join('\n'));
            else if (b.type === 'data') out.push(dMarkdown(b));
            else if (b.type === 'images') out.push(mediaOf(b).map(m => `![${m.title || ''}](media/${encodeURIComponent(m.filename || '')})`).join('\n') + (b.caption ? `\n\n_${b.caption}_` : ''));
            else out.push(i18n('_(écran de l’app : à voir dans LCNDA)_'));
        });
        return out.filter(x => x !== '').join('\n\n') + '\n';
    }
    function sheetHtml(c) {
        const abs = u => new URL(u, location.href).href;
        const body = c.blocks.map(b => {
            if (b.type === 'divider') return `<h2>${esc(b.title || '')}</h2>`;
            let inner = '';
            if (b.type === 'images') inner = mediaOf(b).filter(m => /\.(jpe?g|png|gif|webp)$/i.test(m.filename || '')).map(m => `<img src="${esc(abs('media/' + encodeURIComponent(m.filename)))}" alt="${esc(m.title || '')}">`).join('') + (b.caption ? `<p><i>${esc(b.caption)}</i></p>` : '');
            else if (['screen', 'widget', 'diagram', 'photomap', 'basket'].includes(b.type)) inner = `<p><i>${esc(i18n('(écran de l’app : à voir dans LCNDA)'))}</i></p>`;
            else if (b.type === 'data') inner = dStatic(b);
            else inner = blockBody(b).replace(/<button[^>]*>/g, '<div class="p">').replace(/<\/button>/g, '</div>');
            return `<section><h3>${esc(titleOf(b))}</h3>${inner}</section>`;
        }).join('');
        return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(c.title)}</title><style>body{font-family:Georgia,serif;max-width:860px;margin:2rem auto;padding:0 16px;color:#111;line-height:1.5}h2{border-bottom:2px solid #111}img{max-width:100%;margin:4px 0}blockquote{border-left:3px solid #999;margin:0;padding-left:12px;font-style:italic}.p{margin:2px 0}${D_CSS}@media (prefers-color-scheme:dark){body{background:#111;color:#eee}h2{border-color:#eee}}</style></head><body><h1>${esc(c.icon || '')} ${esc(c.title)}</h1>${c.subtitle ? `<p><i>${esc(c.subtitle)}</i></p>` : ''}${body}<footer><small>${esc(i18n('Fiche exportée de LCNDA le {d}', {d: new Date().toLocaleDateString('fr-FR')}))}</small></footer></body></html>`;
    }
    function download(text, name, type) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    }
    /** 🧾 la fiche en LaTeX (à partir de son Markdown) : titres, gras, italique, listes, liens ; les caractères spéciaux échappés */
    function sheetLatex(c) {
        const ex = t => String(t).replace(/\\/g, '\\textbackslash{}').replace(/([#$%&_{}])/g, '\\$1').replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}');
        const inl = t => ex(t).replace(/\*\*(.+?)\*\*/g, '\\textbf{$1}').replace(/\*(.+?)\*/g, '\\emph{$1}').replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, a, u) => `\\href{${u.replace(/\\([#$%&_{}])/g, '$1')}}{${a}}`);
        const out = []; let inList = false;
        for (const line of String(sheetMarkdown(c)).split('\n')) {
            const m = /^(#{1,4})\s+(.*)$/.exec(line), li = /^\s*[-*]\s+(.*)$/.exec(line);
            if (!li && inList) { out.push('\\end{itemize}'); inList = false; }
            if (m) { const lv = m[1].length; out.push(lv === 1 ? `\\title{${inl(m[2])}}\n\\maketitle` : `\\${['section', 'subsection', 'subsubsection'][Math.min(2, lv - 2)]}*{${inl(m[2])}}`); }
            else if (li) { if (!inList) { out.push('\\begin{itemize}'); inList = true; } out.push(`  \\item ${inl(li[1])}`); }
            else if (/^>\s?/.test(line)) out.push(`\\begin{quote}${inl(line.replace(/^>\s?/, ''))}\\end{quote}`);
            else out.push(line.trim() ? inl(line) : '');
        }
        if (inList) out.push('\\end{itemize}');
        return `\\documentclass[11pt]{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage[T1]{fontenc}\n\\usepackage[french]{babel}\n\\usepackage{hyperref}\n\\date{}\n\\begin{document}\n${out.join('\n')}\n\\end{document}\n`;
    }
    /** 📱 la fiche en ePub (liseuse, téléphone) : une seule page XHTML tirée de la page web de la fiche ; images incluses si elles sont dans le fichier */
    async function sheetEpub(c) {
        const Z = window.LCNDA_SHEET?.makeZip; if (!Z) throw new Error(i18n('ePub indisponible ici.'));
        const src = new DOMParser().parseFromString(sheetHtml(c), 'text/html');
        src.querySelectorAll('script, iframe, button, form').forEach(n => n.remove());
        const imgs = []; let k = 0;
        for (const im of [...src.querySelectorAll('img')]) {
            const m = /^data:(image\/(png|jpeg|gif|webp));base64,(.*)$/.exec(im.getAttribute('src') || '');
            if (!m) { im.remove(); continue; }
            const bin = atob(m[3]), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
            const file = `images/i${++k}.${m[2] === 'jpeg' ? 'jpg' : m[2]}`; imgs.push({file, mt: m[1], u8}); im.setAttribute('src', file);
        }
        const body = new XMLSerializer().serializeToString(src.body).replace(/^<body[^>]*>|<\/body>$/g, '');
        const title = String(c.title || i18n('Fiche')), id = 'lcnda-' + Date.now().toString(36), xe = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const page = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="fr" lang="fr"><head><meta charset="utf-8"/><title>${xe(title)}</title><style>body{font-family:serif;line-height:1.5}img{max-width:100%}h1,h2,h3{font-family:sans-serif}</style></head><body>${body}</body></html>`;
        const nav = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${xe(title)}</title></head><body><nav epub:type="toc"><ol><li><a href="fiche.xhtml">${xe(title)}</a></li></ol></nav></body></html>`;
        const opf = `<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">${id}</dc:identifier><dc:title>${xe(title)}</dc:title><dc:language>fr</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="p" href="fiche.xhtml" media-type="application/xhtml+xml"/>${imgs.map((im, i) => `<item id="i${i}" href="${im.file}" media-type="${im.mt}"/>`).join('')}</manifest><spine><itemref idref="p"/></spine></package>`;
        const container = '<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';
        return Z([{name: 'mimetype', data: 'application/epub+zip', store: true}, {name: 'META-INF/container.xml', data: container}, {name: 'OEBPS/content.opf', data: opf}, {name: 'OEBPS/nav.xhtml', data: nav}, {name: 'OEBPS/fiche.xhtml', data: page}, ...imgs.map(im => ({name: `OEBPS/${im.file}`, data: im.u8, store: true}))], 'application/epub+zip');
    }
    function exportMenu(anchor) {
        const c = cur, base = A().safeExportFilename ? A().safeExportFilename(c.title, 'fiche') : 'fiche';
        const items = [{icon: '📝', label: i18n('Markdown (.md)'), run: () => { download(sheetMarkdown(c), `${base}.md`, 'text/markdown;charset=utf-8'); toast(i18n('Fiche exportée en Markdown.'), 'success'); }},
            {icon: '🌐', label: i18n('Page web (.html)'), run: () => { download(sheetHtml(c), `${base}.html`, 'text/html;charset=utf-8'); toast(i18n('Fiche exportée en page web.'), 'success'); }},
            ...(window.LCNDA_TEXT?.fromMarkdown ? (() => { // les formats du traitement de texte (app-texte-formats.js), à partir du Markdown de la fiche
                const TX = window.LCNDA_TEXT, doc = () => { const r = TX.fromMarkdown(sheetMarkdown(c)); return r?.doc || r; };
                const save = async (fn, ext, type) => { try { const out = await fn(doc()); const blob = out instanceof Blob ? out : new Blob([out], {type}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${base}.${ext}`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); toast(i18n('Fiche exportée ({f}).', {f: '.' + ext}), 'success'); } catch (e) { toast(e.message || String(e), 'error'); } };
                return [TX.toDocx && {icon: '📄', label: i18n('Word (.docx)'), run: () => save(TX.toDocx, 'docx')}, TX.toOdt && {icon: '📄', label: i18n('LibreOffice (.odt)'), run: () => save(TX.toOdt, 'odt')}, TX.toRtf && {icon: '📄', label: i18n('RTF (.rtf)'), run: () => save(TX.toRtf, 'rtf', 'application/rtf')}, TX.toText && {icon: '🗒', label: i18n('Texte simple (.txt)'), run: () => save(TX.toText, 'txt', 'text/plain;charset=utf-8')}].filter(Boolean);
            })() : []),
            {icon: '📱', label: i18n('ePub (.epub)'), help: i18n('liseuse, téléphone, tablette'), run: async () => { try { const blob = await sheetEpub(c); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${base}.epub`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); toast(i18n('Fiche exportée ({f}).', {f: '.epub'}), 'success'); } catch (e) { toast(e.message || String(e), 'error'); } }},
            {icon: '🧾', label: i18n('LaTeX (.tex)'), run: () => { download(sheetLatex(c), `${base}.tex`, 'application/x-tex;charset=utf-8'); toast(i18n('Fiche exportée ({f}).', {f: '.tex'}), 'success'); }},
            {icon: '🧩', label: i18n('Données (.json)'), help: i18n('la fiche telle quelle, pour la garder ou la réutiliser'), run: () => { download(JSON.stringify({format: 'lcnda-fiche', version: 1, exported: new Date().toISOString(), fiche: c}, null, 2), `${base}.json`, 'application/json;charset=utf-8'); toast(i18n('Fiche exportée ({f}).', {f: '.json'}), 'success'); }},
            '-', {icon: '🖨', label: i18n('PDF (par 🖨 Imprimer)'), run: () => printSheet()}];
        if (UIx().menuAt) UIx().menuAt(anchor, items, {title: i18n('⤓ Exporter la fiche')}); else items[0].run();
    }
    /* 🗂 une Fiche comme page d'un onglet à soi (heritage-tabs.js, pièce « tab_fiche ») : les blocs en lecture */
    ext.fiches.embed = async (el, id) => {
        let d; try { d = await api('topic_sheet', {id: Number(id)}); } catch (e) { el.innerHTML = A().empty(e.message || i18n('Fiche introuvable.'), {icon: '📒'}); return null; }
        const keep = cur; cur = d;
        let html = '';
        try { html = d.blocks.map(b => b.type === 'divider' ? `<h3 class="h-fi-divider span-12">${esc(b.title || '')}</h3>` : `<section class="card span-${esc(b.width || '12')} h-fi-block"><header class="card-head"><h3>${kindOf(b.type)[1]} ${esc(titleOf(b))}</h3></header><div class="card-body">${blockBody(b)}</div></section>`).join(''); }
        finally { cur = keep; }
        el.innerHTML = `<div class="h-fi h-fi-embed" data-fi-embed="${Number(id)}"><p class="h-fi-embedhead"><b>${esc(d.icon || '📒')} ${esc(d.title)}</b>${d.subtitle ? ` <small class="muted">${esc(d.subtitle)}</small>` : ''} <button type="button" class="button small secondary" data-fi-embedopen="${Number(id)}">${esc(i18n('↗ Ouvrir la fiche'))}</button></p><div class="card-grid h-fi-grid">${html || A().empty(i18n('Fiche vide.'))}</div></div>`;
        el.querySelector('[data-fi-embedopen]')?.addEventListener('click', () => { S().ficheId = Number(id); editing = false; A().setModule('fiches'); });
        el.querySelectorAll('[data-fi-widget]').forEach(w => { if (ext.renderCustomWidgetInto) ext.renderCustomWidgetInto(w, w.dataset.fiWidget).catch?.(() => {}); });
        fillBaskets(el);
        el.querySelectorAll('[data-fi-photomap]').forEach(w => { let c = {}; try { c = JSON.parse(w.dataset.fiPhotomap || '{}'); } catch (_) {} ext.photomapEmbed?.(w, c); });
        dMount(el, d);
        return d;
    };
    ext.fiches.list = async () => { await loadList(); return sheets.map(x => ({id: x.id, title: x.title, icon: x.icon})); };
    ext.fiches.exportMarkdown = () => (cur ? sheetMarkdown(cur) : ''); ext.fiches.exportHtml = () => (cur ? sheetHtml(cur) : ''); // (essais)
    /* 🕘 Versions (L3, app-versions.js) : l'état d'avant chaque enregistrement ; « ↺ Revenir » garde l'état actuel d'abord */
    function openVersions() {
        const c = cur, U = UIx(); if (!U.openVersions) return toast(i18n('La fenêtre « Versions » n’est pas encore chargée.'), 'error');
        const textOf = d => [d.title, d.subtitle, d.text].filter(Boolean).join('\n\n');
        U.openVersions({title: c.title, tool: i18n('Fiche'), kind: 'text',
            list: async () => ((await post('save_topic_sheet', {id: c.id, versions_of: c.id})).result?.versions || []).map(v => ({id: v.id, label: v.reason === 'auto' ? '' : v.reason === 'avant retour' ? i18n('Avant un retour en arrière') : v.reason, created_at: v.saved_at, auto: v.reason === 'auto', info: `${v.title} · ${A().plural(v.blocks, 'bloc')}`})),
            now: {info: `${c.title} · ${A().plural(c.blocks.length, 'bloc')}`},
            preview: async v => { if (!v) return {text: textOf({title: c.title, subtitle: c.subtitle, text: (c.blocks || []).map(b => [b.title, b.text, b.source, b.caption, b.note, ...(b.rows || []).map(r => Object.values(r).join(' '))].filter(Boolean).join('\n')).join('\n')})}; const d = await api('topic_sheet', {id: c.id, version: v.id}); return {text: textOf(d)}; },
            keepNow: async label => { await post('save_topic_sheet', {id: c.id, keep_version: 1, label: label || i18n('gardée')}); },
            saveNow: async () => { await post('save_topic_sheet', {id: c.id, keep_version: 1, label: i18n('gardée à la main')}); },
            restore: async v => {
                const r = (await post('save_topic_sheet', {id: c.id, restore_version: v.id})).result || {};
                if (S().module === 'fiches') refresh();
                return {undo: r.snapshot ? async () => { await post('save_topic_sheet', {id: c.id, restore_version: r.snapshot}); if (S().module === 'fiches') refresh(); } : null};
            }});
    }

    /* ─── 📊 Bloc « Données » : une liste de données (ou une question), filtrée ; 🔄 à jour ou 📌 figée ───
     * Les listes viennent du moteur commun (app-listes-donnees.js : LCNDA_EXT.dataListsEngine), rangées par thème (app-listes-themes.js),
     * listes réunies comprises (app-listes-reunies*.js) ; une question passe par LCNDA_EXT.dataAsk (app-donnees-accueil.js).
     * Réglages du bloc : list, ask, q, from, to, near ('' | 'place' | 'subject' = le titre de la fiche), center {lat, lon, title}, km,
     * family (seulement près des lieux de la famille), famcol (colonne « 👪 Dans la famille »), cols, limit (≤ 500), sort, dir,
     * view ('table' | 'list' | 'map' | 'timeline'), mode ('live' : relue à chaque ouverture | 'frozen' : snap = la copie datée).
     * snap = {at, list, label, icon, source, sourceUrl, licence, crit, total, cols: [{k, l}], rows: [{c: [...], s, u, g, y}]} :
     * chaque ligne garde sa source ↗ (s, u). Serveur : lib/topic_sheets.php (topic_clean_data : tailles, adresses http(s), et la colonne
     * « Dans la famille » d'une copie ne nomme jamais une personne vivante ni une fiche confidentielle). Essai : tests/test-fiche-bloc-donnees.js */
    const DE = () => ext.dataListsEngine || null;
    const LF = () => ext.listesFamille || null;
    const DMAX = 500;
    const DVIEWS = [['table', '▦', 'Tableau'], ['list', '☰', 'Liste compacte'], ['map', '🗺', 'Carte'], ['timeline', '⏳', 'Frise']];
    const D_CSS = 'table.h-fi-dtable{border-collapse:collapse;width:100%;font-size:13px;margin:4px 0}.h-fi-dtable th,.h-fi-dtable td{border:1px solid #bbb;padding:3px 6px;text-align:left;vertical-align:top}.h-fi-dfoot,.h-fi-dcrit{font-size:12px;color:#555}';
    const dataLast = new Map(); // id du bloc → la dernière lecture d'un bloc « à jour » (⤓ Exporter, 🖨 Imprimer)
    const httpUrl = u => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');
    const dListOf = id => (DE()?.list?.() || []).find(d => d.id === id) || null;
    const dFields = d => (d?.fields || []).filter(f => f && f.key && f.type !== 'url' && !f.hidden);
    const dLicence = d => String(d?.licence || d?.license || (String(d?.source || '').match(/\b(CC0|CC[ -]BY(?:[ -]SA)?(?: \d\.\d)?|ODbL(?: \d\.\d)?|Licence Ouverte(?: \d\.\d)?|domaine public)/i) || [])[0] || '');
    const dCell = (f, v) => (v == null ? '' : Array.isArray(v) ? v.join(' · ') : f?.type === 'bool' ? (v && v !== 'non' && v !== '0' ? i18n('oui') : i18n('non'))
        : typeof v === 'number' ? (Number.isInteger(v) && Math.abs(v) < 10000 ? String(v) : v.toLocaleString('fr-FR', {maximumFractionDigits: 2})) : String(v));
    const dDate = s => { const t = new Date(String(s || '') + 'T12:00:00'); return Number.isNaN(t.getTime()) ? String(s || '') : t.toLocaleDateString('fr-FR'); };
    const dTitle = b => { const d = dListOf(b.list); return d ? i18n(d.label) : b.snap?.label || i18n('Données'); };
    /** la source d'une ligne : celles d'une ligne réunie (avec la fiche de la première qui en a une), sinon la liste */
    function dRowSource(d, r) {
        const ms = Array.isArray(r?._members) ? r._members : [];
        if (ms.length) return {s: [...new Set(ms.map(m => m.src?.short).filter(Boolean))].join(' ; ') || d.source || i18n(d.label), u: ms.map(m => httpUrl(m.rec?.url)).find(Boolean) || httpUrl(ms[0]?.src?.url) || httpUrl(d.sourceUrl)};
        return {s: d.source || i18n(d.label), u: (d.fields || []).filter(f => f.type === 'url').map(f => httpUrl(r?.[f.key])).find(Boolean) || httpUrl(d.sourceUrl)};
    }
    /* 📍 un lieu de la base (sur TON serveur), et le sujet de la fiche : son titre (« Naves »), sinon un de ses mots en majuscule */
    const placeMemo = new Map();
    async function dPlace(name) {
        const k = foldT(name).trim(); if (!k) return null; if (placeMemo.has(k)) return placeMemo.get(k);
        let p = null; try { const r = await api('picker_search', {kind: 'place', q: name, limit: 5}); const its = (r.groups || []).flatMap(g => g.items || []).filter(x => x.lat != null && x.lon != null); p = its.find(x => foldT(x.title || x.name).startsWith(k)) || null; } catch (_) {}
        const v = p ? {lat: Number(p.lat), lon: Number(p.lon), title: String(p.title || p.name || name).replace(/\s*\(.*$/, '')} : null; placeMemo.set(k, v); return v;
    }
    async function dSubject(sheet) {
        const t = String(sheet?.title || '').trim(); if (!t) return null;
        const whole = await dPlace(t); if (whole) return whole;
        for (const w of t.split(/[\s,;:()«»"’']+/).filter(x => /^\p{Lu}/u.test(x) && x.length > 2).reverse()) { const p = await dPlace(w); if (p) return p; }
        return null;
    }
    /** lire la liste avec les réglages du bloc : {d, st, rows, total, center} ou {error} */
    async function dRun(b, sheet) {
        const E = DE(), d0 = dListOf(b.list);
        if (!E || !d0) return {error: i18n('Cette liste n’est pas disponible ici.')};
        let inst; try { inst = await E.isInstalled(d0); } catch (e) { return {error: i18n('Impossible de vérifier si ces données sont installées : {e}', {e: e?.message || String(e)})}; } // pas « pas installées »
        if (!inst) return {error: i18n('Ces données ne sont pas encore sur cet ordinateur (Réglages → 🗂 Données).'), notInstalled: true};
        const st = {...E.blank()}, d = E.viewDef ? E.viewDef(d0, st) : d0;
        if (b.q) st.q = b.q;
        if (b.from != null || b.to != null) st.period = {from: b.from ?? -9999, to: b.to ?? 9999, mode: 'overlap'};
        const center = b.near === 'subject' ? await dSubject(sheet) : b.near === 'place' ? b.center : null;
        if (center && d.geo) st.near = {lat: center.lat, lon: center.lon, km: Number(b.km) || 30, title: center.title};
        if (b.sort && (b.sort !== '_km' || st.near)) { st.sort = b.sort; st.dir = b.dir === 'desc' ? 'desc' : 'asc'; } else if (st.near) st.sort = '_km';
        const limit = Math.max(1, Math.min(DMAX, Number(b.limit) || 20));
        let rows = [], total = 0;
        if (b.family && LF() && d.geo) { // 👪 seulement près des lieux de la famille (rayon : Réglages → 🧰 Listes de données)
            await LF().ready(); const fk = LF().km();
            const p = await E.fetchPage(d, st, 0, d.query ? 5000 : 200000), all = (p.all || p.rows || []).filter(r => { const g = E.geoOf(d, r); return g && LF().nearKm(g[0], g[1], fk) <= fk; });
            total = all.length; rows = all.slice(0, limit);
        } else { const p = await E.fetchPage(d, st, 0, limit); rows = p.rows || []; total = Number(p.total ?? rows.length) || rows.length; }
        return {d, d0, st, rows, total, center, noSubject: b.near === 'subject' && !center};
    }
    function dCrit(b, res) {
        const st = res?.st || {}, n = st.near;
        return [b.ask ? `« ${b.ask} »` : '', b.q ? i18n('mots : « {q} »', {q: b.q}) : '', b.from != null || b.to != null ? `📅 ${b.from ?? '…'} → ${b.to ?? '…'}` : '',
            n ? i18n('📍 À {km} km autour de {p}', {km: n.km, p: n.title}) : res?.noSubject ? i18n('📍 le sujet de la fiche n’est pas un lieu connu') : '', b.family ? i18n('👪 près des lieux de la famille') : ''].filter(Boolean).join(' · ');
    }
    /** la lecture → le modèle commun (le même qu'une copie figée) */
    async function dModel(b, res) {
        const {d, d0, st, rows} = res, E = DE(), fs = dFields(d);
        let cs = (b.cols || []).map(k => fs.find(f => f.key === k)).filter(Boolean); if (!cs.length) cs = fs.slice(0, 4);
        const cols = cs.map(f => ({k: f.key, l: `${i18n(f.label)}${f.unit ? ` (${i18n(f.unit)})` : ''}`}));
        if (st.near) cols.push({k: '_km', l: i18n('Distance (km)')});
        const fam = !!(b.famcol && LF() && d.geo && d.period), fk = Number(d.familyKm) > 0 ? Number(d.familyKm) : LF()?.km?.() || 15;
        if (fam) { await LF().ready(); cols.push({k: '_fam', l: i18n('👪 Dans la famille')}); }
        const out = rows.map(r => {
            const g = E.geoOf(d, r), p = E.periodOf(d, r), src = dRowSource(d, r);
            const c = cs.map(f => dCell(f, r[f.key]).slice(0, 400));
            if (st.near) c.push(r._km != null ? String(r._km).replace('.', ',') : '');
            if (fam) c.push(g && p ? LF().text(LF().presence(g[0], g[1], p[0], fk)) : '');
            return {c, s: String(src.s).slice(0, 200), u: src.u, g: g ? [Number(g[0].toFixed(5)), Number(g[1].toFixed(5))] : null, y: p ? p[0] : null};
        });
        return {at: new Date().toISOString().slice(0, 10), list: (d0 || d).id, label: i18n(d.label), icon: d.icon || '📋', source: d.source || '', sourceUrl: httpUrl(d.sourceUrl), licence: dLicence(d), crit: dCrit(b, res), total: res.total, cols, rows: out};
    }
    /** le bloc dessiné (à l'écran, exporté, imprimé : o.actions = les boutons, o.print = sans carte) */
    function dHtml(m, b, o = {}) {
        const rows = m.rows || [], cols = m.cols || [], view = o.print && b.view === 'map' ? 'table' : (b.view || 'table');
        const short = s => (String(s).length > 40 ? String(s).slice(0, 38) + '…' : String(s));
        const src = r => (r.u ? `<a class="h-fi-dsrc" href="${esc(r.u)}" target="_blank" rel="noopener noreferrer" title="${esc(r.s)}">↗ ${esc(short(r.s || i18n('source')))}</a>` : `<span class="h-fi-dsrc muted">↗ ${esc(short(r.s || i18n('source')))}</span>`);
        const listHtml = rs => `<ul class="h-fi-dlist">${rs.map(r => `<li><b>${esc(r.c[0] || '—')}</b>${r.c.slice(1).filter(Boolean).length ? ` <span class="muted">${esc(r.c.slice(1).filter(Boolean).join(' · '))}</span>` : ''} ${src(r)}</li>`).join('')}</ul>`;
        let body;
        if (!rows.length) body = `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🔎</span><span class="empty-line-text">${esc(i18n('Aucune ligne ne correspond à ces critères.'))}</span></p>`;
        else if (view === 'list') body = listHtml(rows);
        else if (view === 'timeline') { const ts = rows.filter(r => r.y != null && r.y !== '').sort((a, z) => Number(a.y) - Number(z.y)); body = ts.length ? `<ol class="h-fi-dates h-fi-dtime">${ts.map(r => `<li><span>${esc(r.y)}</span><p>${esc(r.c.filter(Boolean).join(' · '))} ${src(r)}</p></li>`).join('')}</ol>` : `${window.LCNDA_APP.empty(i18n('Aucune de ces lignes n’a de date.'))}`; }
        else if (view === 'map') { const pts = rows.filter(r => Array.isArray(r.g)).map(r => ({lat: r.g[0], lon: r.g[1], label: r.c[0] || '', color: '#0066cc'})); body = (pts.length && ext.miniMap ? `<div class="h-fi-dmap">${ext.miniMap(pts, [], {height: 300, interactive: !kiosk()})}</div>` : `${window.LCNDA_APP.empty(i18n('Aucune de ces lignes n’a de position sur la carte.'))}`) + listHtml(rows); }
        else body = `<div class="data-table-wrap h-fi-dwrap"><table class="data-table h-fi-dtable"><thead><tr>${cols.map(c => `<th scope="col">${esc(c.l)}</th>`).join('')}<th scope="col">${esc(i18n('Source'))}</th></tr></thead><tbody>${rows.map(r => `<tr>${cols.map((c, j) => `<td>${esc(r.c[j] ?? '')}</td>`).join('')}<td>${src(r)}</td></tr>`).join('')}</tbody></table></div>`;
        const frozen = b.mode === 'frozen', lic = m.licence ? ` · ${esc(i18n('Licence : {l}', {l: m.licence}))}` : '';
        const who = m.source ? (httpUrl(m.sourceUrl) ? `${window.LCNDA_UI.extLink(m.sourceUrl, m.source)}` : esc(m.source)) : esc(m.label || '');
        const when = frozen ? i18n('📌 Figé le {d}', {d: dDate(m.at)}) : i18n('🔄 À jour, lu le {d}', {d: dDate(m.at)});
        const count = m.total > rows.length ? i18n('{n} lignes sur {t}', {n: rows.length, t: m.total}) : A().plural ? A().plural(rows.length, i18n('ligne')) : String(rows.length);
        const acts = o.actions && !kiosk() ? `<span class="h-fi-dacts">${b.list ? `<button type="button" class="button small secondary" data-fi-dopen="${esc(b.id)}">${esc(i18n('↗ Ouvrir la liste'))}</button>` : ''}${b.list ? `<button type="button" class="button small secondary" data-fi-dfreeze="${esc(b.id)}">${esc(i18n(frozen ? '↻ Refaire la copie' : '📌 Figer maintenant'))}</button>` : ''}</span>` : '';
        return `${m.crit ? `<p class="h-fi-dcrit muted">${esc(m.icon || '📋')} ${esc(m.label || '')} · ${esc(m.crit)}</p>` : `<p class="h-fi-dcrit muted">${esc(m.icon || '📋')} ${esc(m.label || '')}</p>`}${body}
            <div class="h-fi-dfoot"><small>${esc(i18n('Source :'))} ${who}${lic} · ${esc(when)} · ${esc(count)}</small>${acts}</div>`;
    }
    function dBody(b) {
        if (!b.list && !b.snap) return `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📊</span><span class="empty-line-text">${esc(i18n('Aucune liste choisie : ✎ pour en choisir une, ou pour poser une question.'))}</span></p>`;
        if (b.mode === 'frozen' && b.snap) return `<div class="h-fi-data is-frozen" data-fi-frozen="${esc(b.id)}">${dHtml(b.snap, b, {actions: true})}</div>`;
        return `<div class="h-fi-data" data-fi-data="${esc(b.id)}">${UIx().spinner ? UIx().spinner(i18n('Lecture des données…')) : esc(i18n('Lecture des données…'))}</div>`;
    }
    /** les blocs « à jour » d'une page (la fiche, ou une fiche posée dans un onglet) : relus maintenant */
    function dMount(scope, sheet) {
        scope.querySelectorAll('[data-fi-data]').forEach(async el => {
            const b = (sheet.blocks || []).find(x => x.id === el.dataset.fiData); if (!b) return;
            let html;
            try {
                const res = await dRun(b, sheet);
                if (res.error) html = `<p class="muted">${esc(res.error)}</p>${res.notInstalled && !kiosk() ? `<p><button type="button" class="button small" data-fi-dopen="${esc(b.id)}">${esc(i18n('📦 Installer'))}</button></p>` : ''}${b.snap ? dHtml(b.snap, {...b, mode: 'frozen'}) : ''}`; // ⤓ : la liste en grand propose de l'installer
                else { const m = await dModel(b, res); dataLast.set(b.id, m); html = dHtml(m, b, {actions: true}); }
            } catch (e) { html = `<p class="muted">${esc(e.message || String(e))}</p>`; }
            if (el.isConnected) { el.innerHTML = html; dMapCards(el, dataLast.get(b.id) || b.snap); }
        });
        scope.querySelectorAll('[data-fi-frozen]').forEach(el => { const b = (sheet.blocks || []).find(x => x.id === el.dataset.fiFrozen); if (b?.snap) dMapCards(el, b.snap); });
    }
    /** 🗺 la vue carte d'un bloc : un clic sur un point ouvre sa fiche sur la carte (app-carte-fiche.js) ; ☰ Voir la ligne = la liste dessous */
    function dMapCards(el, m) {
        const host = el.querySelector('.h-fi-dmap'), CF = ext.carteFiche; if (!host || !CF || !m) return;
        const rows = (m.rows || []).filter(r => Array.isArray(r.g)), cols = m.cols || [], all = m.rows || [];
        host.querySelectorAll('.h-map-point').forEach((g, i) => { if (!rows[i]) return; g.dataset.cfI = String(i); g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); g.style.cursor = 'pointer'; g.setAttribute('aria-label', i18n('Voir la fiche : {name}', {name: rows[i].c[0] || '—'})); });
        const src = r => (r.u ? `<a href="${esc(r.u)}" target="_blank" rel="noopener noreferrer">${esc(r.s || i18n('source'))} ↗</a>` : esc(r.s || ''));
        CF.attach(host, {label: i => rows[i]?.c[0] || '—', sub: i => rows[i]?.c[1] || '',
            card: i => { const r = rows[i]; if (!r) return null; const fj = cols.findIndex(c => c.k === '_fam');
                return {title: r.c[0] || '—', lines: cols.slice(1).map((c, j) => (j + 1 === fj ? null : [c.l, esc(r.c[j + 1] ?? '')])).filter(Boolean), fam: fj >= 0 && r.c[fj] ? esc(r.c[fj]) : null, src: src(r), line: true}; },
            onAct: (k, i) => { if (k !== 'line') return; const li = el.querySelectorAll('.h-fi-dlist li')[all.indexOf(rows[i])]; if (!li) return;
                li.classList.add('ld-row-hl'); li.tabIndex = -1; li.scrollIntoView?.({block: 'center'}); li.focus({preventScroll: true}); setTimeout(() => li.classList.remove('ld-row-hl'), 6000); }});
    }
    /** pour ⤓ Exporter et 🖨 Imprimer : la copie figée, sinon la dernière lecture */
    const dModelOf = b => (b.mode === 'frozen' ? b.snap : dataLast.get(b.id) || b.snap) || null;
    const dStatic = b => { const m = dModelOf(b); return m ? dHtml(m, b, {print: true}) : `<p><i>${esc(i18n('(données : à voir dans LCNDA)'))}</i></p>`; };
    function dMarkdown(b) {
        const m = dModelOf(b); if (!m) return i18n('_(données : à voir dans LCNDA)_');
        const cell = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
        const head = `| ${[...m.cols.map(c => cell(c.l)), i18n('Source')].join(' | ')} |\n|${' --- |'.repeat(m.cols.length + 1)}`;
        const body = (m.rows || []).map(r => `| ${[...m.cols.map((c, j) => cell(r.c[j])), r.u ? `[↗ ${cell(r.s)}](${r.u})` : `↗ ${cell(r.s)}`].join(' | ')} |`).join('\n');
        const foot = [`${i18n('Source :')} ${m.sourceUrl ? `[${m.source}](${m.sourceUrl})` : m.source || m.label}`, m.licence ? i18n('Licence : {l}', {l: m.licence}) : '', b.mode === 'frozen' ? i18n('📌 Figé le {d}', {d: dDate(m.at)}) : i18n('🔄 À jour, lu le {d}', {d: dDate(m.at)})].filter(Boolean).join(' · ');
        return `${m.crit ? `_${m.crit}_\n\n` : ''}${head}\n${body}\n\n_${foot}_`;
    }
    /** ↗ la liste en grand, avec la même période et le même lieu */
    function dOpenList(b, sheet) {
        if (!b || !DE()?.open) return;
        const preset = {};
        if (b.from != null || b.to != null) preset.period = {from: b.from ?? -9999, to: b.to ?? 9999, mode: 'overlap'};
        const go = c => { if (c) preset.near = {lat: c.lat, lon: c.lon, km: Number(b.km) || 30, title: c.title}; DE().open(b.list, preset); };
        if (b.near === 'subject') dSubject(sheet).then(go); else go(b.near === 'place' ? b.center : null);
    }
    /** 📌 Figer maintenant / ↻ Refaire la copie ; ↶ Annuler remet le bloc d'avant */
    async function dFreeze(id) {
        const c = cur, i = c.blocks.findIndex(x => x.id === id); if (i < 0) return;
        const before = JSON.parse(JSON.stringify(c.blocks[i]));
        let m; try { const res = await dRun(before, c); if (res.error) return toast(res.error, 'error'); m = await dModel(before, res); } catch (e) { return toast(e.message, 'error'); }
        const after = {...before, mode: 'frozen', snap: m};
        c.blocks[i] = after; await save(); refresh();
        A().undoToast?.(i18n(before.mode === 'frozen' ? 'Copie refaite : « {nm} »' : 'Bloc figé : « {nm} »', {nm: titleOf(before)}), {undo: () => dPut(c.id, id, before), redo: () => dPut(c.id, id, after)});
    }
    /** remettre un bloc (ou l'enlever : blk = null) dans la fiche telle qu'elle est sur le serveur, puis la redessiner si elle est ouverte */
    async function dPut(sheetId, blockId, blk) {
        const s = await api('topic_sheet', {id: sheetId}), k = s.blocks.findIndex(x => x.id === blockId);
        if (blk) { if (k >= 0) s.blocks[k] = blk; else s.blocks.push(blk); } else if (k >= 0) s.blocks.splice(k, 1);
        await post('save_topic_sheet', {id: s.id, title: s.title, subtitle: s.subtitle, icon: s.icon, color: s.color, blocks: s.blocks});
        if (S().module === 'fiches' && Number(S().ficheId) === Number(sheetId)) refresh();
    }
    /** ↶ après ✎ Enregistrer d'un bloc « Données » : le bloc d'avant, ou plus de bloc */
    function dUndo(c, before, after, fresh) {
        A().undoToast?.(i18n(fresh ? 'Bloc « {nm} » ajouté' : 'Bloc « {nm} » enregistré', {nm: titleOf(after)}), {undo: () => dPut(c.id, after.id, before), redo: () => dPut(c.id, after.id, after)});
    }
    /* ✎ les réglages, en quatre sections repliées (comme ⚙️ Personnaliser du widget 📊) : 📋 Données (la liste, choisie avec le choix
     * commun LCNDA_EXT.dataListPicker — recherche, les 20 thèmes en pastilles, cartes par thème, installé / à télécharger, clavier — ou une
     * question), 🔎 Filtres, 👁 Affichage, 🎨 Apparence (titre, largeur, couleur : les champs communs à tous les blocs). Seule la première
     * est ouverte ; fermée, chacune dit en une ligne ce qu'elle règle (« 1850–1900 · 30 km autour de Tulle »). Les noms des champs
     * enregistrés n'ont pas changé (list, ask, q, from, to, near, center, km, family, famcol, cols, limit, sort, dir, view, mode) :
     * un bloc enregistré avant s'ouvre tel quel (dNorm ne fait que ranger les valeurs d'une vieille version). */
    const dNorm = b => { // un bloc d'avant : des valeurs en texte (« 1850 », « 30 »), un sens de tri absent
        if (b.from === '' || b.from === undefined) b.from = null; if (b.to === '' || b.to === undefined) b.to = null;
        ['from', 'to'].forEach(k => { if (b[k] != null && Number.isFinite(Number(b[k]))) b[k] = Math.round(Number(b[k])); else if (b[k] != null) b[k] = null; });
        if (b.dir !== 'desc') b.dir = 'asc'; if (!Array.isArray(b.cols)) b.cols = []; if (!['place', 'subject'].includes(b.near)) b.near = '';
        return b;
    };
    const dThemeOf = d => { const TH = ext.listesThemes; if (!d || !TH?.themeOf) return null; const id = TH.themeOf(d); return (TH.themes?.() || []).find(t => t.id === id) || null; };
    const D_WIDTHS = {12: '1', 6: '1/2', 4: '1/3', 3: '1/4', 8: '2/3', 9: '3/4'};
    function dColsHtml(d, b) {
        const fs = dFields(d); if (!fs.length) return `<p class="muted">${esc(i18n('Choisis d’abord une liste.'))}</p>`;
        const on = (b.cols || []).filter(k => fs.some(f => f.key === k)), keys = on.length ? on : fs.slice(0, 4).map(f => f.key);
        return fs.map(f => `<label class="checkbox-line"><input type="checkbox" name="dcol" value="${esc(f.key)}" ${keys.includes(f.key) ? 'checked' : ''}> ${esc(i18n(f.label))}</label>`).join('');
    }
    const dSortHtml = (d, b) => `<option value="">${esc(i18n('l’ordre de la liste'))}</option>${dFields(d).map(f => `<option value="${esc(f.key)}" ${b.sort === f.key ? 'selected' : ''}>${esc(i18n(f.label))}</option>`).join('')}${d?.geo ? `<option value="_km" ${b.sort === '_km' ? 'selected' : ''}>${esc(i18n('la distance'))}</option>` : ''}`;
    /** la liste choisie, sur une ligne calme : « 📋 ⚔️ Batailles · ⚔️ Guerres et soldats — Changer », la source et la licence */
    function dChosenHtml(d) {
        const th = dThemeOf(d), ic = d.merged ? '🔀' : d.icon || '📋', lic = dLicence(d);
        const who = d.source ? (httpUrl(d.sourceUrl) ? `${window.LCNDA_UI.extLink(d.sourceUrl, d.source)}` : esc(d.source)) : '';
        return `<div class="h-fi-dchosen" data-fi-dchosen-line="${esc(d.id)}">
            <p class="h-fi-dchosen-name"><span aria-hidden="true">${esc(ic === '📋' ? '📋' : `📋 ${ic}`)}</span> <b>${esc(i18n(d.label))}</b>${th ? ` <span class="muted">· ${esc(`${th.icon || ''} ${i18n(th.label)}`.trim())}</span>` : ''} <span class="muted" aria-hidden="true">—</span> <button type="button" class="link-button" data-fi-dchange>${esc(i18n('Changer'))}</button></p>
            ${who || lic ? `<p class="h-fi-dchosen-src muted"><small>${who ? `${esc(i18n('Source :'))} ${who}` : ''}${who && lic ? ' · ' : ''}${lic ? esc(i18n('Licence : {l}', {l: lic})) : ''}</small></p>` : ''}
            <div data-fi-dinst aria-live="polite"></div></div>`;
    }
    function dEditorHtml(b, common = '') {
        if (!DE()) return `${common}<p class="muted">${esc(i18n('Les listes de données ne sont pas chargées.'))}</p>`;
        dNorm(b);
        const d = dListOf(b.list), v = x => (x == null ? '' : esc(x)), radio = (name, val, cur0, ic, l) => `<label class="h-fi-dchoice"><input type="radio" name="${name}" value="${val}" ${cur0 === val ? 'checked' : ''}><span>${ic} ${esc(i18n(l))}</span></label>`;
        const snapNote = b.snap ? `<label class="checkbox-line" data-fi-dresnap><input type="checkbox" name="resnap" ${b.mode === 'frozen' ? '' : 'checked'}> ${esc(i18n('Refaire la copie avec ces réglages (copie actuelle : {d}, {n} lignes)', {d: dDate(b.snap.at), n: (b.snap.rows || []).length}))}</label>` : '';
        const sec = (id, title, html, open = false) => `<details class="h-fi-dsec" data-fi-dsec="${id}" ${open ? 'open' : ''}><summary><span class="h-fi-dsec-t">${esc(i18n(title))}</span><small class="h-fi-dsec-sum muted" data-fi-dsum="${id}"></small></summary><div class="h-fi-dsec-body">${html}</div></details>`;
        const id = esc(b.id);
        return `<div class="h-fi-dbox" data-fi-dbox><input type="hidden" name="list" value="${v(b.list)}">
            ${sec('data', '📋 Données', `<div data-fi-dchosen></div><div class="h-fi-dpick" data-fi-dpicker hidden></div>
                <details class="h-fi-dask" data-fi-daskbox ${b.ask ? 'open' : ''}><summary>${esc(i18n('💬 ou pose une question'))}</summary>
                    <div class="h-fi-dask-in"><label for="fi-dask-${id}">${esc(i18n('Une question'))} <small>(${esc(i18n('facultatif'))})</small></label>
                    <div class="h-fi-dask-row"><input id="fi-dask-${id}" name="ask" value="${v(b.ask)}" maxlength="300" placeholder="${esc(i18n('ex. les séismes près de Tulle entre 1850 et 1900'))}"><button type="button" class="button small secondary" data-fi-dask>${esc(i18n('🔎 Comprendre'))}</button></div>
                    <div class="h-fi-dpills" data-fi-dpills aria-live="polite"></div></div></details>`, true)}
            ${sec('filt', '🔎 Filtres', `<div class="h-fi-dgrid">
                <label class="is-wide">${esc(i18n('Mots à chercher'))}<input name="q" value="${v(b.q)}" maxlength="120" placeholder="${esc(i18n('facultatif'))}"></label>
                <label>${esc(i18n('De l’année'))}<input name="from" type="number" inputmode="numeric" min="-9999" max="2999" value="${v(b.from)}" placeholder="1850"></label>
                <label>${esc(i18n('À l’année'))}<input name="to" type="number" inputmode="numeric" min="-9999" max="2999" value="${v(b.to)}" placeholder="1900"></label>
                <label>${esc(i18n('Autour de'))}<select name="near"><option value="">${esc(i18n('partout'))}</option><option value="place" ${b.near === 'place' ? 'selected' : ''}>${esc(i18n('un lieu'))}</option><option value="subject" ${b.near === 'subject' ? 'selected' : ''}>${esc(i18n('le sujet de la fiche (son titre)'))}</option></select></label>
                <label data-fi-dplacebox>${esc(i18n('Lieu'))}<input name="place" value="${v(b.center?.title)}" maxlength="160" placeholder="${esc(i18n('ex. Tulle'))}"></label>
                <label data-fi-dkmbox>${esc(i18n('Rayon (km)'))}<input name="km" type="number" inputmode="numeric" min="1" max="2000" value="${Number(b.km) || 30}"></label>
                <label class="checkbox-line is-row"><input type="checkbox" name="family" ${b.family ? 'checked' : ''}> ${esc(i18n('👪 Seulement près des lieux de la famille'))}</label></div>`)}
            ${sec('show', '👁 Affichage', `<div class="h-fi-dchoices" role="group" aria-label="${esc(i18n('Affichage'))}">${DVIEWS.map(([k, ic, l]) => radio('view', k, b.view || 'table', ic, l)).join('')}</div>
                <fieldset class="h-fi-dset"><legend>${esc(i18n('Colonnes'))}</legend><div class="h-fi-dcols" data-fi-dcols>${dColsHtml(d, b)}</div></fieldset>
                <div class="h-fi-dgrid">
                    <label>${esc(i18n('Combien de lignes au plus'))}<input name="limit" type="number" inputmode="numeric" min="1" max="${DMAX}" value="${Number(b.limit) || 20}"></label>
                    <label>${esc(i18n('Trier par'))}<select name="sort" data-fi-dsort>${dSortHtml(d, b)}</select></label>
                    <label>${esc(i18n('Ordre'))}<select name="dir"><option value="asc">${esc(i18n('↑ croissant'))}</option><option value="desc" ${b.dir === 'desc' ? 'selected' : ''}>${esc(i18n('↓ décroissant'))}</option></select></label>
                    <label class="checkbox-line is-row"><input type="checkbox" name="famcol" ${b.famcol ? 'checked' : ''}> ${esc(i18n('Colonne « 👪 Dans la famille » (qui vivait là, cette année-là)'))}</label></div>
                <div class="h-fi-dchoices" role="group" aria-label="${esc(i18n('Mode'))}">${radio('mode', 'live', b.mode === 'frozen' ? 'frozen' : 'live', '🔄', 'À jour : relue à chaque ouverture')}${radio('mode', 'frozen', b.mode === 'frozen' ? 'frozen' : 'live', '📌', 'Figé : une copie datée des lignes, avec leurs sources')}</div>${snapNote}`)}
            ${common ? sec('look', '🎨 Apparence', `<div class="h-fi-dlook">${common}</div>`) : ''}
            <p class="muted h-fi-help">${esc(i18n('Chaque ligne garde sa source ↗ ; la source et la licence sont écrites sous le bloc, et suivent la fiche quand on l’imprime ou l’exporte.'))}</p></div>`;
    }
    /** la ligne de résumé de chaque section (quand elle est fermée) */
    function dSummaries(box, root) {
        const el = n => (root || box).querySelector(`[name="${n}"]`), val = n => String(el(n)?.value ?? '').trim(), on = n => !!el(n)?.checked;
        const d = dListOf(val('list')), set = (k, s) => { const x = box.querySelector(`[data-fi-dsum="${k}"]`); if (x) x.textContent = s; };
        set('data', d ? [`${d.merged ? '🔀' : d.icon || '📋'} ${i18n(d.label)}`, dThemeOf(d) ? i18n(dThemeOf(d).label) : ''].filter(Boolean).join(' · ') : val('ask') ? `« ${val('ask')} »` : i18n('aucune liste choisie'));
        const near = val('near'), km = Number(val('km')) || 30, from = val('from'), to = val('to');
        set('filt', [val('q') ? `« ${val('q')} »` : '', from || to ? `${from || '…'}–${to || '…'}` : '',
            near === 'place' ? i18n('{km} km autour de {p}', {km, p: val('place') || '…'}) : near === 'subject' ? i18n('{km} km autour du sujet de la fiche', {km}) : '',
            on('family') ? i18n('👪 près des lieux de la famille') : ''].filter(Boolean).join(' · ') || i18n('aucun filtre : toute la liste'));
        const view = (root || box).querySelector('[name="view"]:checked')?.value || 'table', vw = DVIEWS.find(x => x[0] === view), nc = (root || box).querySelectorAll('[name="dcol"]:checked').length;
        const so = el('sort'), sl = so && so.value ? so.selectedOptions[0]?.textContent : '';
        set('show', [vw ? `${vw[1]} ${i18n(vw[2])}` : '', nc ? i18n('{n} colonnes', {n: nc}) : '', i18n('{n} lignes au plus', {n: Number(val('limit')) || 20}), sl ? `${i18n('tri : {f}', {f: sl})} ${val('dir') === 'desc' ? '↓' : '↑'}` : '',
            on('famcol') ? '👪' : '', (root || box).querySelector('[name="mode"]:checked')?.value === 'frozen' ? i18n('📌 Figé') : i18n('🔄 À jour')].filter(Boolean).join(' · '));
        set('look', [val('title') ? `« ${val('title')} »` : i18n('le nom de la liste'), el('width') ? i18n('largeur {w}', {w: D_WIDTHS[val('width')] || val('width')}) : '', on('hascolor') ? i18n('en couleur') : ''].filter(Boolean).join(' · '));
        const w = val('near'); const pb = box.querySelector('[data-fi-dplacebox]'), kb = box.querySelector('[data-fi-dkmbox]');
        if (pb) pb.hidden = w !== 'place'; if (kb) kb.hidden = !w;
    }
    function dBind(root, b) {
        const box = root.querySelector('[data-fi-dbox]'); if (!box) return;
        const el = n => box.querySelector(`[name="${n}"]`), chosenBox = box.querySelector('[data-fi-dchosen]'), pk = box.querySelector('[data-fi-dpicker]');
        const sums = () => dSummaries(box, root);
        const repaint = () => { const d = dListOf(el('list').value); box.querySelector('[data-fi-dcols]').innerHTML = dColsHtml(d, {cols: d && d.id === b.list ? b.cols : []}); box.querySelector('[data-fi-dsort]').innerHTML = dSortHtml(d, d && d.id === b.list ? b : {}); sums(); };
        /* ⚠ une liste pas encore sur cet ordinateur : « 📦 Installer » sur place (le pack s'installe comme dans Listes), puis ↻ vérifier */
        const checkInst = async d => {
            const slot = chosenBox.querySelector('[data-fi-dinst]'); if (!slot || !DE()?.isInstalled) return;
            let ok, err = ''; try { ok = await DE().isInstalled(d); } catch (e) { err = e?.message || String(e); } if (!slot.isConnected || el('list').value !== d.id) return;
            if (err) { slot.innerHTML = `<p class="h-fi-dwarn">⚠ ${esc(i18n('Impossible de vérifier si ces données sont installées : {e}', {e: err}))}</p><div class="h-fi-dinstrow"><button type="button" class="button small secondary" data-fi-drecheck>${esc(i18n('↻ C’est installé : vérifier'))}</button></div>`; return; } // pas « pas encore » : on ne sait pas
            slot.innerHTML = ok ? '' : `<p class="h-fi-dwarn">⚠ ${esc(i18n('Ces données ne sont pas encore sur cet ordinateur : installe-les pour voir les lignes.'))}</p>
                <div class="h-fi-dinstrow">${d.install && !kiosk() ? `<button type="button" class="button small" data-fi-dinstall>${esc(i18n('📦 Installer'))}</button>` : ''}<button type="button" class="button small secondary" data-fi-drecheck>${esc(i18n('↻ C’est installé : vérifier'))}</button></div><div data-fi-dinsthost></div>`;
        };
        const paintChosen = () => {
            const d = dListOf(el('list').value);
            if (d) { chosenBox.innerHTML = dChosenHtml(d); pk.hidden = true; pk.innerHTML = ''; checkInst(d); }
            else { chosenBox.innerHTML = el('list').value ? `<p class="h-fi-dwarn">⚠ ${esc(i18n('Cette liste n’est pas disponible ici.'))}</p>` : ''; mountPicker(); }
            sums();
        };
        const setList = d => { el('list').value = d.id; paintChosen(); repaint(); };
        const mountPicker = (keep = null) => {
            pk.hidden = false;
            if (!ext.dataListPicker) { pk.innerHTML = `${window.LCNDA_UI.spinner(i18n('Chargement…'))}`; return; }
            ext.dataListPicker(pk, {compact: true, filter: d => !d.link, selected: el('list').value,
                head: keep ? `<p class="h-fi-dkeep"><button type="button" class="link-button" data-fi-dkeep>${esc(i18n('✕ Garder « {nm} »', {nm: i18n(keep.label)}))}</button></p>` : '',
                onPick: d => setList(d)});
        };
        paintChosen();
        const ask = async () => {
            const q = el('ask').value.trim(), out = box.querySelector('[data-fi-dpills]'); if (!q) return el('ask').focus();
            if (!ext.dataAsk) { out.innerHTML = `<p class="muted">${esc(i18n('La lecture des questions n’est pas chargée.'))}</p>`; return; }
            out.innerHTML = UIx().spinner ? UIx().spinner(i18n('Je lis la question…')) : esc(i18n('Je lis la question…'));
            let r; try { r = await ext.dataAsk(q); } catch (e) { out.innerHTML = `<p class="muted">${esc(e.message || String(e))}</p>`; return; }
            const u = r.u || {}, pills = [];
            if (r.d) { setList(r.d); pills.push([`${r.d.icon || '📋'} ${i18n(r.d.label)}`, 'list']); }
            if (Array.isArray(u.years)) { el('from').value = u.years[0]; el('to').value = u.years[1]; pills.push([`📅 ${u.years[0]} → ${u.years[1]}`, 'from']); } else { el('from').value = ''; el('to').value = ''; }
            if (u.where === 'place' && u.center) { el('near').value = 'place'; el('place').value = u.center.title; el('km').value = u.km || 30; box.dataset.fiDcenter = JSON.stringify(u.center); pills.push([i18n('📍 À {km} km autour de {p}', {km: u.km || 30, p: u.center.title}), 'place']); }
            else { el('near').value = ''; }
            el('family').checked = u.where === 'family'; if (u.where === 'family') pills.push([i18n('👪 près des lieux de la famille'), 'family']);
            const notes = [u.whoNote, u.whereNote].filter(Boolean);
            out.innerHTML = `<h4>${esc(i18n('Ce que j’ai compris'))} <small class="muted">${esc(i18n('touche une pastille pour la changer'))}</small></h4>
                <div class="h-fi-dpillrow">${pills.map(([l, f]) => `<button type="button" class="h-fi-dpill" data-fi-dfocus="${f}">${esc(l)}</button>`).join('')}</div>
                ${notes.map(n => `<p class="muted">${esc(n)}</p>`).join('')}<p class="muted">${esc(r.d ? i18n('{n} lignes trouvées : règle les colonnes et l’affichage, puis enregistre.', {n: r.total || 0}) : i18n('Je n’ai pas compris de quelle liste il s’agit : choisis-la ci-dessus.'))}</p>`;
            sums();
        };
        box.addEventListener('click', e => {
            if (e.target.closest('[data-fi-dask]')) { e.preventDefault(); ask(); }
            const f = e.target.closest('[data-fi-dfocus]');
            if (f) { e.preventDefault(); const k = f.dataset.fiDfocus, x = k === 'list' ? box.querySelector('[data-fi-dchange]') || pk.querySelector('[data-ld-ov-q]') : el(k); const sec = x?.closest('details.h-fi-dsec'); if (sec) sec.open = true; x?.focus(); }
            if (e.target.closest('[data-fi-dchange]')) { e.preventDefault(); const d = dListOf(el('list').value); chosenBox.innerHTML = ''; mountPicker(d); setTimeout(() => { try { pk.querySelector('[data-ld-ov-q]')?.focus({preventScroll: true}); } catch (_) {} }, 30); }
            if (e.target.closest('[data-fi-dkeep]')) { e.preventDefault(); paintChosen(); box.querySelector('[data-fi-dchange]')?.focus(); }
            if (e.target.closest('[data-fi-dinstall]')) { e.preventDefault(); const d = dListOf(el('list').value); try { d?.install?.(chosenBox.querySelector('[data-fi-dinsthost]')); } catch (err) { toast(err.message, 'error'); } }
            if (e.target.closest('[data-fi-drecheck]')) { e.preventDefault(); const d = dListOf(el('list').value); if (d) checkInst(d); }
        });
        el('ask').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ask(); } });
        root.addEventListener('input', sums); root.addEventListener('change', sums); root.addEventListener('click', e => { if (e.target.closest('[data-fi-w]')) setTimeout(sums, 0); });
    }
    /** ✎ Enregistrer : lire les réglages ; un lieu tapé est cherché dans la base ; « Figé » refait la copie (sauf si on garde l'ancienne) */
    async function dRead(form, b) {
        const box = form.querySelector('[data-fi-dbox]') || form, f = Object.fromEntries(new FormData(form));
        const num = x => (x === '' || x == null || !Number.isFinite(Number(x)) ? null : Math.round(Number(x)));
        if (!f.list) { toast(i18n('Choisis une liste (ou pose une question et touche « 🔎 Comprendre »).'), 'error'); return false; }
        Object.assign(b, {list: String(f.list), ask: String(f.ask || '').trim(), q: String(f.q || '').trim(), from: num(f.from), to: num(f.to), near: ['place', 'subject'].includes(f.near) ? f.near : '',
            km: Math.max(1, Math.min(2000, num(f.km) || 30)), family: !!form.elements.family?.checked, famcol: !!form.elements.famcol?.checked, limit: Math.max(1, Math.min(DMAX, num(f.limit) || 20)),
            sort: String(f.sort || ''), dir: f.dir === 'desc' ? 'desc' : 'asc', view: DVIEWS.some(x => x[0] === f.view) ? f.view : 'table', mode: f.mode === 'frozen' ? 'frozen' : 'live',
            cols: [...form.querySelectorAll('input[name="dcol"]:checked')].map(x => x.value)});
        if (b.near === 'place') {
            const name = String(f.place || '').trim(); let c = null; try { c = JSON.parse(box.dataset.fiDcenter || 'null'); } catch (_) {}
            if (!c || foldT(c.title) !== foldT(name)) c = b.center && foldT(b.center.title) === foldT(name) ? b.center : name ? await dPlace(name) : null;
            if (!c) { toast(name ? i18n('Lieu introuvable dans la base : « {l} »', {l: name}) : i18n('Écris le lieu (ou choisis « partout »).'), 'error'); return false; }
            b.center = {lat: c.lat, lon: c.lon, title: c.title};
        } else b.center = null;
        if (b.mode === 'frozen') {
            const keep = b.snap && form.elements.resnap && !form.elements.resnap.checked;
            if (!keep) { const res = await dRun(b, cur); if (res.error) { toast(res.error, 'error'); return false; } b.snap = await dModel(b, res); }
        } else delete b.snap;
        return true;
    }
    /** 📎 depuis une liste (☑ lignes choisies → « Insérer… ») : un nouveau bloc « Données » figé, dans une fiche choisie (ou une nouvelle) ; ↶ Annuler */
    ext.fiches.addDataSnapshot = async (snap, {anchor = null} = {}) => {
        if (kiosk()) return toast(i18n('Mode consultation : rien ne peut être modifié.'), 'error');
        if (!snap || !Array.isArray(snap.rows) || !Array.isArray(snap.cols)) return toast(i18n('Rien à mettre dans la fiche.'), 'error');
        await loadList();
        const blk = {id: uid(), type: 'data', title: '', width: '12', mode: 'frozen', list: snap.list || '', view: 'table', limit: Math.min(DMAX, snap.rows.length) || 20, cols: [], snap: {...snap, rows: snap.rows.slice(0, DMAX)}};
        const body = s => ({id: s.id, title: s.title, subtitle: s.subtitle, icon: s.icon, color: s.color, blocks: s.blocks});
        const go = async id => {
            try {
                let created = false;
                if (id) { const s = await api('topic_sheet', {id}); await post('save_topic_sheet', {...body(s), blocks: [...s.blocks, blk]}); }
                else { const r = await post('save_topic_sheet', {title: snap.label || i18n('Nouvelle fiche'), icon: '📊', subtitle: '', color: '', blocks: [blk]}); id = Number(r.result?.id || r.id); created = true; }
                const name = created ? (snap.label || i18n('Nouvelle fiche')) : (sheets.find(x => x.id === id)?.title || '');
                const again = () => (S().module === 'fiches' && Number(S().ficheId) === id ? refresh() : null);
                A().undoToast?.(i18n('📒 Ajouté à la fiche « {nm} »', {nm: name}), {
                    undo: async () => { if (created) await post('delete_topic_sheet', {id}); else { const s = await api('topic_sheet', {id}); await post('save_topic_sheet', {...body(s), blocks: s.blocks.filter(x => x.id !== blk.id)}); } await loadList(); again(); },
                    redo: async () => { if (created) await post('save_topic_sheet', {undelete: id}); else { const s = await api('topic_sheet', {id}); await post('save_topic_sheet', {...body(s), blocks: [...s.blocks, blk]}); } await loadList(); again(); }});
                await loadList(); again();
                return id;
            } catch (e) { toast(e.message, 'error'); return null; }
        };
        const items = [{icon: '＋', label: i18n('Une nouvelle fiche'), run: () => go(0)}, ...(sheets.length ? ['-'] : []), ...sheets.map(s => ({icon: s.icon || '📒', label: s.title, run: () => go(s.id)}))];
        if (UIx().menuAt) return UIx().menuAt(anchor || document.body, items, {title: i18n('📒 Dans quelle fiche ?')});
        return go(sheets[0]?.id || 0);
    };
    ext.fichesData = {run: dRun, model: dModel, html: dHtml, markdown: dMarkdown}; // (essais)

    /* ─── Ajouter un bloc ─── */
    function addBlock() {
        ext.openDialog({eyebrow: 'FICHE', title: '＋ Ajouter un bloc', wide: true, submitLabel: 'Ajouter',
            body: `<div class="h-fi-kinds">${KINDS.map(([k, ic, l, h], i) => `<label class="h-fi-tpl"><input type="radio" name="kind" value="${k}" ${i ? '' : 'checked'}><span>${ic}</span><strong>${esc(i18n(l))}</strong><small>${esc(i18n(h))}</small></label>`).join('')}</div>`,
            onSubmit: form => {
                const k = new FormData(form).get('kind') || 'text';
                const b = {id: uid(), type: k, title: '', width: k === 'divider' || k === 'screen' || k === 'data' ? '12' : '6', text: '', rows: [], ids: [], layout: 'grid', target: 'module:carte', height: 560};
                setTimeout(() => editBlock(-1, b), 50);
            }});
    }

    /* ─── Modifier un bloc (ou en créer un : i = -1) ─── */
    /** ✎ : comme les widgets du tableau de bord, le bloc se retourne et montre ses réglages sur place (un nouveau bloc s'ouvre dans une fenêtre) */
    function editBlock(i, fresh = null, host = null) {
        const b = fresh || JSON.parse(JSON.stringify(cur.blocks[i])), [, ic, label] = kindOf(b.type);
        // comme le verso d'un widget : titre, largeur en boutons (1, 1/2, 1/3…), couleur sur une ligne
        const W_CHOICES = [['12', '1'], ['6', '1/2'], ['4', '1/3'], ['3', '1/4'], ['8', '2/3'], ['9', '3/4']];
        const common = `<label>Titre du bloc <small>(facultatif)</small><input name="title" value="${esc(b.title || '')}" maxlength="200" placeholder="${esc(label)}"></label>
            ${b.type === 'divider' ? '' : `<div class="h-fi-wrow"><span>Largeur</span><input type="hidden" name="width" value="${esc(b.width || '12')}"><div class="block-widths dashboard-widget-widths">${W_CHOICES.map(([v, l]) => `<button type="button" data-fi-w="${v}" aria-pressed="${String(b.width || '12') === v ? 'true' : 'false'}" title="Largeur ${l}">${l}</button>`).join('')}</div></div>`}
            <div class="h-fi-wrow"><span>Couleur</span><span class="h-fi-colrow"><label class="checkbox-line"><input type="checkbox" name="hascolor" ${b.color ? 'checked' : ''}> ${esc(i18n('Une couleur pour ce bloc'))}</label><input type="color" name="color" value="${esc(b.color || '#0066cc')}" aria-label="${esc(i18n('Couleur du bloc'))}"></span></div>`;
        let body = '';
        const rowsEditor = (rows, cols) => `<div class="h-fi-rows" data-fi-rows>${(rows.length ? rows : [{}]).map(r => `<div class="h-fi-row">${cols.map(([k, l, w]) => `<input data-k="${k}" placeholder="${esc(l)}" value="${esc(r[k] || '')}" style="flex:${w}">`).join('')}<button type="button" class="h-bt" data-fi-rowdel title="Retirer">×</button></div>`).join('')}</div><button type="button" class="button small secondary" data-fi-rowadd>＋ Une ligne</button>`;
        if (b.type === 'text') body = `<label class="h-fi-big">Texte<textarea name="text" rows="8">${esc(b.text || '')}</textarea></label><p class="muted h-fi-help"># Titre · ## Sous-titre · - liste · 1. liste numérotée · **gras** · *italique* · __souligné__ · [texte du lien](https://…) · > citation · --- trait</p>`;
        if (b.type === 'quote') body = `<label class="h-fi-big">Citation<textarea name="text" rows="6">${esc(b.text || '')}</textarea></label><label>Source<input name="source" value="${esc(b.source || '')}" maxlength="400" placeholder="Mémoires de…, p. 12"></label>`;
        if (b.type === 'images') body = `<label>Présentation<select name="layout">${[['grid', 'mosaïque'], ['large', 'une grande image'], ['strip', 'bandeau qui défile']].map(([v, l]) => `<option value="${v}" ${b.layout === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>Légende <small>(facultatif)</small><input name="caption" value="${esc(b.caption || '')}" maxlength="1000"></label>`
            + (ext.mediaEditorHtml ? ext.mediaEditorHtml('topic_sheet', cur.id, mediaOf(b), [[b.id, 'Images et documents', 'image/*,application/pdf']]) : '');
        if (b.type === 'dates') body = `<p class="muted">Une date par ligne (ex. « 1772 », « 3 mai 1791 ») et ce qui s’est passé. Elles sont rangées dans l’ordre que tu leur donnes.</p>${rowsEditor(b.rows || [], [['date', 'Date', 1], ['text', 'Ce qui s’est passé', 4]])}`;
        if (b.type === 'links') body = `${rowsEditor(b.rows || [], [['label', 'Nom', 2], ['url', 'https://…', 3], ['note', 'Note', 2]])}`;
        if (b.type === 'people') body = `<div><span class="pk-lab">Personnes</span>${window.LCNDA_PICKER.pickerField({name: 'fi_people', kind: 'person', multiple: true, value: (b.ids || []).map(Number).filter(Boolean)})}</div><label>Note <small>(facultatif)</small><input name="note" value="${esc(b.note || '')}" maxlength="2000"></label>`;
        if (b.type === 'screen') body = ext.appScreen ? `<label>Écran ${ext.appScreen.select(b.target, 'name="target"')}</label><div><span class="pk-lab">Personne <small>(pour « Fiche d’une personne »)</small></span>${window.LCNDA_PICKER.pickerField({name: 'fi_person', kind: 'person', value: String(b.target).startsWith('person:') ? Number(b.target.slice(7)) || null : null})}</div>
            <label>Hauteur<select name="height">${ext.appScreen.heights.map(([v, l]) => `<option value="${v}" ${String(b.height) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="checkbox-line"><input type="checkbox" name="sidebar" ${b.sidebar ? 'checked' : ''}> avec sa colonne de gauche (menus de l’écran)</label>
            <p class="muted">Mes listes, les listes de l’app, la carte, les arbres, les statistiques, la fiche d’une personne, un village… : tout écran de l’app se met dans la fiche, à jour.</p>` : '<p class="muted">Écrans indisponibles.</p>';
        if (b.type === 'diagram') { const items = ext.diagramItems?.() || []; body = `<label>Diagramme<select name="diagram"><option value="">— choisir —</option>${items.map(([id, l]) => `<option value="${id}" ${Number(b.diagram) === Number(id) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label><p><button type="button" class="button small secondary" data-fi-dgnew>＋ Nouveau diagramme</button></p><p class="muted">Graphiques → Mes diagrammes : le bloc montre toujours sa dernière version.</p>`; }
        if (b.type === 'auto') body = `<p class="muted">${esc(i18n('La liste se refait toute seule à chaque ouverture : les personnes de la base qui ont ce métier, ou un événement dans ce lieu, pendant cette période.'))}</p>
            <div class="form-grid"><label>${esc(i18n('Métier'))}<input name="occupation" value="${esc(b.occupation || '')}" maxlength="120" placeholder="${esc(i18n('ex. sabotier'))}"></label><label>${esc(i18n('Lieu'))}<input name="place" value="${esc(b.place || '')}" maxlength="120" placeholder="${esc(i18n('ex. Naves'))}"></label>
            <label>${esc(i18n('De l’année'))}<input name="from" type="number" min="0" max="2999" value="${b.from || ''}" placeholder="1800"></label><label>${esc(i18n('À l’année'))}<input name="to" type="number" min="0" max="2999" value="${b.to || ''}" placeholder="1900"></label>
            <label>${esc(i18n('Combien au plus'))}<input name="limit" type="number" min="5" max="300" value="${Number(b.limit) || 60}"></label><label>${esc(i18n('Note'))} <small>(${esc(i18n('facultatif'))})</small><input name="note" value="${esc(b.note || '')}" maxlength="2000"></label></div>`;
        if (b.type === 'data') body = dEditorHtml(b, common); // 🎨 titre, largeur, couleur : dans sa section « Apparence »
        if (b.type === 'basket') {
            // la liste des paniers arrive juste après l'ouverture de la fenêtre (editBlock reste synchrone)
            body = `<label>${esc(i18n('Quel panier'))}<select name="basket" data-fi-bksel data-cur="${Number(b.basket) || 0}"><option value="0">${esc(i18n('Chargement…'))}</option></select></label><label>${esc(i18n('Combien au plus'))}<input name="limit" type="number" min="5" max="300" value="${Number(b.limit) || 50}"></label><p class="muted">${esc(i18n('Le bloc suit le panier : ce que tu y ajoutes apparaît ici aussi.'))}</p>`;
            setTimeout(async () => { const sel = document.querySelector('[data-fi-bksel]'); if (!sel) return; let bs = []; try { bs = (await api('cx_basket', {basket_id: 0})).baskets || []; } catch (_) {}
                sel.innerHTML = bs.length ? bs.map(x => `<option value="${Number(x.id)}" ${Number(sel.dataset.cur) === Number(x.id) ? 'selected' : ''}>🧺 ${esc(x.name || i18n('Mon panier'))}</option>`).join('') : `<option value="0">${esc(i18n('Aucun panier pour l’instant : mets quelque chose au 🧺 d’abord.'))}</option>`; }, 0);
        }
        if (b.type === 'photomap') body = ext.photomapConfigHtml ? ext.photomapConfigHtml(b.config || {}) : '<p class="muted">Cartes de photos indisponibles.</p>';
        if (b.type === 'widget') {
            // 📈 le menu de choix commun (sorte « graph », tous mes widgets) ; le champ caché garde l'identifiant cw_…
            const defs = Object.values(ext.customWidgetDefs?.() || {}), cur = b.widget ? ext.customWidgetDefs?.()?.[b.widget] : null, info = cur ? ext.myGraphInfo?.(cur.id) : null;
            const value = cur && info?.rid ? {kind: 'graph', id: info.rid, uid: cur.id, title: cur.name || 'Mon widget', icon: cur.icon || '🧱'} : null;
            body = defs.length ? `<div data-fi-widgetpk><span class="pk-lab">Widget ou graphique</span>${window.LCNDA_PICKER.pickerField({name: 'fi_widget', hiddenName: false, kind: 'graph', value, allowCreate: false, placeholder: 'Chercher un widget ou un graphique…', filter: {graph_kinds: 'numbers,list,chart,appstat,screen,diagram,text,links,journey'}})}<input type="hidden" name="widget" value="${esc(b.widget || '')}"></div><div data-sc-panelslot>${ext.shortcuts?.panelHtml?.(b.widget) || ''}</div><p class="muted">Pour en créer un : Réglages → Éditeur de widgets ou Éditeur de graphiques.</p>` : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🧩</span><span class="empty-line-text">Aucun widget ni graphique à toi pour l’instant : Réglages → Éditeur de widgets ou Éditeur de graphiques.</span></p>';
        }
        const onOpen = dlg => {
                const root = dlg.querySelector('.h-dialog-body') || dlg;
                ext.bindMediaEditor?.(root);
                if (b.type === 'data') dBind(root, b);
                root.addEventListener('input', e => { if (e.target.type === 'color' && e.target.name === 'color') { const h = root.querySelector('[name=hascolor]'); if (h) h.checked = true; } }); // choisir une couleur, c'est vouloir une couleur
                root.addEventListener('picker-change', e => { if (e.detail.name === 'fi_person') root.dataset.fiPersonName = e.detail.item?.title || ''; });
                root.addEventListener('picker-change', e => { const box = e.target.closest?.('[data-fi-widgetpk]'); if (box) { box.querySelector('input[name=widget]').value = e.detail.item?.uid || ''; const slot = root.querySelector('[data-sc-panelslot]'); if (slot) slot.innerHTML = ext.shortcuts?.panelHtml?.(e.detail.item?.uid || '') || ''; } });
                root.addEventListener('click', e => {
                    if (e.target.closest('[data-fi-rowadd]')) { const box = root.querySelector('[data-fi-rows]'), last = box.lastElementChild; const n = last.cloneNode(true); n.querySelectorAll('input').forEach(x => { x.value = ''; }); box.appendChild(n); n.querySelector('input').focus(); }
                    if (e.target.closest('[data-fi-rowdel]')) { const row = e.target.closest('.h-fi-row'), box = row.parentElement; if (box.children.length > 1) row.remove(); else row.querySelectorAll('input').forEach(x => { x.value = ''; }); }
                    if (e.target.closest('[data-fi-dgnew]')) ext.openDiagramEditor?.(null, {onSave: id => { const sel = root.querySelector('[name=diagram]'); if (sel) { sel.insertAdjacentHTML('beforeend', `<option value="${id}">${esc((ext.diagramItems?.() || []).find(x => Number(x[0]) === Number(id))?.[1] || 'Nouveau diagramme')}</option>`); sel.value = String(id); } }});
                });
            };
        const onSubmit = async form => {
                const f = Object.fromEntries(new FormData(form));
                b.title = (f.title || '').trim(); if (f.width) b.width = f.width; b.color = form.elements.hascolor?.checked ? f.color : '';
                if (['text', 'quote'].includes(b.type)) b.text = f.text || '';
                if (b.type === 'quote') b.source = f.source || '';
                if (b.type === 'images') { b.layout = f.layout; b.caption = f.caption || ''; }
                if (b.type === 'dates' || b.type === 'links') b.rows = [...form.querySelectorAll('.h-fi-row')].map(r => Object.fromEntries([...r.querySelectorAll('[data-k]')].map(x => [x.dataset.k, x.value.trim()]))).filter(r => Object.values(r).some(Boolean));
                if (b.type === 'links' && b.rows.some(r => r.url && !/^https?:\/\//i.test(r.url))) { toast('Une adresse doit commencer par http:// ou https://', 'error'); return false; }
                if (b.type === 'people') { b.ids = String(f.fi_people || '').split(',').map(Number).filter(Boolean); b.note = f.note || ''; }
                if (b.type === 'auto') { Object.assign(b, {occupation: String(f.occupation || '').trim(), place: String(f.place || '').trim(), from: Number(f.from) || 0, to: Number(f.to) || 0, limit: Number(f.limit) || 60, note: f.note || ''}); if (!b.occupation && !b.place && !b.from && !b.to) { toast(i18n('Choisis au moins un métier, un lieu ou une période.'), 'error'); return false; } }
                if (b.type === 'screen') { let target = f.target || 'module:carte'; const pid = Number(form.elements.fi_person?.value) || 0; if (target.startsWith('person:')) target = pid ? 'person:' + pid : 'module:personnes'; b.target = target; b.personName = (form.querySelector('.h-dialog-body') || form).dataset.fiPersonName ?? (pid ? b.personName || '' : ''); b.height = Number(f.height) || 560; b.sidebar = !!form.elements.sidebar?.checked; }
                if (b.type === 'widget') b.widget = f.widget || '';
                if (b.type === 'basket') { b.basket = Number(f.basket) || 0; b.limit = Math.max(5, Math.min(300, Number(f.limit) || 50)); }
                if (b.type === 'photomap') b.config = ext.photomapConfigRead ? ext.photomapConfigRead(form) : {};
                if (b.type === 'diagram') b.diagram = Number(f.diagram) || 0;
                if (b.type === 'data' && await dRead(form, b) === false) return false;
                const before = fresh ? null : cur.blocks[i], c0 = cur;
                if (fresh) cur.blocks.push(b); else cur.blocks[i] = b;
                await save();
                if (b.type === 'data') dUndo(c0, before, b, fresh); // ↶ le bloc d'avant (ou pas de bloc)
                if (b.type === 'images' && ext.uploadMediaEditor) await ext.uploadMediaEditor(form, 'topic_sheet', cur.id);
                refresh();
            };
        // un nouveau bloc s'ouvre lui aussi sur place : une carte vide en bas de la fiche, retournée sur ses réglages
        if (fresh && !host) {
            const grid = A().$('#workspace .h-fi-grid');
            if (grid) { grid.querySelector(':scope > .empty-state, :scope > .empty')?.remove(); grid.insertAdjacentHTML('beforeend', A().card(cur.blocks.length + 1, `${ic} ${i18n("Nouveau bloc")}`, '', '', 'span-' + (b.type === 'divider' ? '12' : (b.width || '12'))).replace('<section class="card', '<section data-fi-new class="h-fi-block card')); host = grid.lastElementChild; host.scrollIntoView({block: 'center', behavior: 'smooth'}); }
        }
        const target = host ? (host.querySelector(':scope > .card-body') || host) : null;
        if (target) { // sur place, comme le verso d'un widget
            host.classList.add('is-back');
            target.innerHTML = `<form class="h-fi-back dashboard-widget-back" novalidate><div class="dashboard-widget-back-title"><strong>${fresh ? 'Nouveau bloc' : 'Réglages du bloc'}</strong><span>${ic} ${esc(label)}</span></div>${b.type === 'data' ? '' : common}${body}<div class="page-actions compact h-fi-back-actions"><button type="submit" class="button small">${fresh ? 'Ajouter' : 'Enregistrer'}</button><button type="button" class="button small secondary" data-fi-cancel>Annuler</button></div></form>`;
            const form = target.querySelector('form');
            onOpen(form);
            form.querySelector('[data-fi-cancel]').addEventListener('click', () => refresh());
            // la largeur se voit tout de suite, comme pour un widget
            form.addEventListener('click', e => { const w = e.target.closest('[data-fi-w]'); if (!w) return; form.elements.width.value = w.dataset.fiW; form.querySelectorAll('[data-fi-w]').forEach(x => x.setAttribute('aria-pressed', String(x === w))); host.className = host.className.replace(/\bspan-\d+\b/, 'span-' + w.dataset.fiW); });
            form.addEventListener('submit', async e => { e.preventDefault(); const btn = form.querySelector('[type=submit]'); btn.disabled = true; try { if (await onSubmit(form) === false) btn.disabled = false; } catch (err) { toast(err.message, 'error'); btn.disabled = false; } });
            if (b.type === 'data') setTimeout(() => { try { form.querySelector('[data-fi-dpicker]:not([hidden]) [data-ld-ov-q]')?.focus({preventScroll: true}); } catch (_) {} }, 30); else form.querySelector('input[name=title]')?.focus();
            return;
        }
        ext.openDialog({eyebrow: 'FICHE', title: `${ic} ${fresh ? 'Nouveau bloc' : 'Modifier le bloc'} — ${label}`, wide: true, submitLabel: fresh ? 'Ajouter' : 'Enregistrer', body: (b.type === 'data' ? '' : common) + body, onOpen, onSubmit});
    }

    /* ─── Titre, icône, sous-titre, couleur de la fiche ─── */
    function editProps() {
        ext.openDialog({eyebrow: 'FICHE', title: '⚙️ La fiche', submitLabel: 'Enregistrer',
            body: `<div class="form-grid"><label class="span-2">Titre<input name="title" value="${esc(cur.title)}" required maxlength="200"></label><label>Icône<input name="icon" value="${esc(cur.icon || '📒')}" class="h-fi-iconin" readonly title="Choisir une icône"></label>
                <div class="h-fi-wrow"><span>Couleur</span><span class="h-fi-colrow"><label class="checkbox-line"><input type="checkbox" name="hascolor" ${cur.color ? 'checked' : ''}> ${esc(i18n('Une couleur pour la fiche'))}</label><input type="color" name="color" value="${esc(cur.color || '#0066cc')}" aria-label="${esc(i18n('Couleur de la fiche'))}"></span></div>
                <label class="span-2">Sous-titre<input name="subtitle" value="${esc(cur.subtitle || '')}" maxlength="600"></label></div>
                ${ext.labelsPicker ? ext.labelsPicker('topic_sheet', cur.labels || []) : ''}
                ${ext.mediaEditorHtml ? `<div class="h-fi-coverpick">${ext.mediaEditorHtml('topic_sheet', cur.id, (cur.media || []).filter(m => m.role === 'cover'), [['cover', '🖼️ Image de couverture (la vignette de la fiche dans la liste ; sinon la première image de la fiche)', 'image/*']])}</div>` : ''}`,
            onOpen: d => { d.querySelector('.h-fi-iconin').addEventListener('click', e => ext.pickEmoji?.(e.target)); }, // la zone des images est déjà branchée par openDialog
            onSubmit: async form => { const f = Object.fromEntries(new FormData(form)); Object.assign(cur, {title: f.title.trim(), icon: f.icon || '📒', subtitle: f.subtitle || '', color: form.elements.hascolor.checked ? f.color : ''});
                const lb = form.querySelector('[data-pending-labels="topic_sheet"]'), ids = lb ? (lb.dataset.ids || '').split(',').map(Number).filter(Boolean) : null; // 🏷️ les étiquettes de la fiche (Listes › Fiches thématiques : Filtrer › Étiquette)
                await save(true, ids ? {pending_labels: ids} : {}); if (ids) cur.labels = ids.map(id => ({id})); if (ext.uploadMediaEditor) await ext.uploadMediaEditor(form, 'topic_sheet', cur.id); refresh(); }});
    }

    /* ─── Imprimer : une page propre (texte, images, personnes, dates, citations, liens ; les écrans et widgets en titre) ─── */
    function printSheet() {
        const c = cur, UI = window.LCNDA_UI; if (!UI?.openPrintDialog) return toast('La fenêtre « Imprimer » n’est pas chargée.', 'error');
        const abs = u => new URL(u, location.href).href;
        // L1 : ce qu'on imprime — textes et images, personnes et dates, écrans et widgets (en titre), citations et liens
        const group = t => (t === 'data' ? 'data' : ['text', 'images', 'diagram', 'photomap'].includes(t) ? 'texts' : ['people', 'dates'].includes(t) ? 'people' : ['screen', 'widget'].includes(t) ? 'screens' : ['quote', 'links'].includes(t) ? 'quotes' : 'texts');
        const body = o => c.blocks.map(b => {
            if (b.type === 'divider') return `<h2>${esc(b.title)}</h2>`;
            if (!o[group(b.type)]) return '';
            let inner = '';
            if (b.type === 'images') inner = mediaOf(b).filter(m => m.media_type === 'image' || /\.(jpe?g|png|gif|webp)$/i.test(m.filename || '')).map(m => `<img src="${esc(abs('media/' + encodeURIComponent(m.filename)))}" alt="">`).join('') + (b.caption ? `<p><i>${esc(b.caption)}</i></p>` : '');
            else if (b.type === 'diagram') inner = document.querySelector(`[data-dg-embed="${Number(b.diagram)}"] .h-dg-svg`)?.innerHTML || '';
            else if (b.type === 'screen' || b.type === 'widget') inner = '<p><i>(écran de l’app : à voir dans LCNDA)</i></p>';
            else if (b.type === 'data') inner = dStatic(b);
            else inner = blockBody(b).replace(/<button[^>]*data-h-person[^>]*>/g, '<div class="p">').replace(/<\/button>/g, '</div>');
            return `<section style="width:${Math.round(Number(b.width || 12) / 12 * 100) - 2}%"><h3>${esc(titleOf(b))}</h3>${inner}</section>`;
        }).join('');
        UI.openPrintDialog({title: c.title || 'La fiche', key: 'fiche', zone: 'Fiche', margin: 12,
            options: [{key: 'texts', label: 'Textes et images', checked: true}, {key: 'people', label: 'Personnes et dates', checked: true}, {key: 'screens', label: 'Écrans et widgets (en titre)', checked: false}, {key: 'quotes', label: 'Citations et liens', checked: true}, {key: 'data', label: i18n('📊 Données (tableaux, avec leurs sources)'), checked: true}],
            html: o => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(c.title)}</title><style>body{font-family:Georgia,serif;margin:0;color:#111}h1{margin:0}main{display:flex;flex-wrap:wrap;gap:2%}section{break-inside:avoid;margin-bottom:14px}h2{width:100%;border-bottom:2px solid #111;margin:18px 0 8px}h3{font-size:15px;margin:6px 0}img{max-width:100%;max-height:340px;margin:4px 4px 0 0}blockquote{margin:0;padding-left:12px;border-left:3px solid #999;font-style:italic}ol,ul{padding-left:18px}.p{margin:2px 0}.p small{color:#666;margin-left:6px}${D_CSS}</style></head><body><h1>${esc(c.icon || '')} ${esc(c.title)}</h1>${c.subtitle ? `<p>${esc(c.subtitle)}</p>` : ''}<main>${body(o)}</main></body></html>`});
    }
    /* ─── Listes → 📒 Fiches ─── */
    ext.lists = ext.lists || {};
    ext.lists.topic_sheets_list = async token => {
        await loadList();
        if (token !== S().workspaceToken || S().module !== 'listes') return;
        const fmtDate = d => window.LCNDA_UI?.when?.(d) || ''; // K4
        A().$('#workspace').innerHTML = `<section class="page collection-page"><header class="page-header"><div><span class="eyebrow">LISTES</span><h2>📒 Fiches</h2><p>Les fiches sur un sujet (onglet « Fiches ») : clique sur une fiche pour l’ouvrir.</p></div>
                <div class="page-actions"><button type="button" class="button" data-fi-listnew>＋ Nouvelle fiche</button></div></header>
            ${sheets.length ? '<div data-fi-bar></div><div data-fi-items></div>' : A().emptyState({icon: '📒', text: 'Aucune fiche pour l’instant', hint: 'Une fiche rassemble texte, images, personnes, cartes et listes sur un sujet.', action: {label: '＋ Nouvelle fiche', attrs: 'data-fi-listnew'}})}</section>`;
        const ws = A().$('#workspace'), UI = window.LCNDA_UI;
        // H10 : « N fiches · [Liste | Fiches] · Trier : … », retenus pour cette liste
        const KEY = 'listes:topic_sheets_list';
        let sort = UI?.sortOf ? UI.sortOf(KEY) : 'recent', view = UI?.viewOf ? UI.viewOf(KEY) : 'list';
        const draw = () => {
            const box = ws.querySelector('[data-fi-items]'); if (!box) return;
            const lab = bar?.state.filters.label, labId = lab && typeof lab === 'object' ? Number(lab.id) : 0; // Filtrer › Étiquette 🏷
            const words = fold(q).split(/\s+/).filter(Boolean), list0 = sheets.filter(x => words.every(w => fold(`${x.title} ${x.subtitle || ''}`).includes(w)) && (!labId || (x.labels || []).some(l => Number(l.id) === labId)));
            const list = UI?.sortItems ? UI.sortItems(list0, sort, {name: x => x.title, date: x => x.updated_at}) : list0;
            bar?.setCount(`${A().plural(list.length, 'fiche')}${list.length !== sheets.length ? ` sur ${sheets.length}` : ''}`);
            if (!list.length) { box.innerHTML = A().emptyState({icon: '🔎', text: q.trim() ? i18n('Aucune fiche pour « {nm} »', {nm: q.trim()}) : 'Aucune fiche ne correspond', hint: q.trim() ? 'Vérifie l’orthographe, ou cherche un autre mot (titre, sous-titre).' : 'Retire un filtre.'}); return; }
            box.innerHTML = view === 'cards' && UI?.cardsHtml
                ? UI.cardsHtml(list.map(x => ({thumb: `<span class="ui-card-ico">${esc(x.icon || '📒')}</span>`, name: x.title || 'Fiche sans titre', open: `data-fi-listopen="${x.id}"`, lines: [x.subtitle, `${x.blocks} bloc${x.blocks > 1 ? 's' : ''}`], when: x.updated_at, whenLabel: 'Modifiée'})))
                : `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Fiche</th><th>Sous-titre</th><th>Blocs</th><th>Modifiée</th></tr></thead><tbody>${list.map(s => `<tr><td><button type="button" class="table-link" data-fi-listopen="${s.id}">${esc((s.icon || '📒') + ' ' + s.title)}</button></td><td>${esc(s.subtitle || '')}</td><td>${s.blocks}</td><td>${fmtDate(s.updated_at)}</td></tr>`).join('')}</tbody></table></div>`;
            box.querySelectorAll('[data-fi-listopen]').forEach(b => b.addEventListener('click', () => { S().ficheId = Number(b.dataset.fiListopen); A().setModule('fiches'); }));
        };
        const slot = ws.querySelector('[data-fi-bar]');
        // H10 : la barre commune (🔍 Chercher · Liste | Fiches · Trier), retenue pour cette liste
        let q = '';
        const fold = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const bar = slot && UI?.listBar ? UI.listBar({key: KEY, search: {placeholder: 'Chercher une fiche… (titre, sous-titre)'}, view: {what: 'fiches', onChange: v => { view = v; draw(); }},
            filters: [{id: 'label', label: 'Étiquette', kind: 'label', allowFree: false, chipPrefix: 'Étiquette :'}],
            sort: {options: [['recent', 'Les plus récentes'], ['old', 'Les plus anciennes'], ['az', 'A → Z'], ['za', 'Z → A']], value: sort},
            onChange: (b, {what}) => { q = b.q; sort = b.sort; UI.setSort(KEY, sort); if (what !== 'view') draw(); }}) : null;
        if (bar) { ({q, sort, view} = bar.state); slot.replaceWith(bar); }
        draw();
        ws.querySelectorAll('[data-fi-listnew]').forEach(b => b.addEventListener('click', newSheet));
    };
    /* 📒 sur la fiche d'une personne, dans le bloc « Cité dans » : les Fiches où elle figure (bloc « Personnes ») */
    let sheetsAt = 0;
    ext.afterPerson = ext.afterPerson || [];
    ext.afterPerson.push(async detail => {
        const pid = Number(detail?.person?.id) || 0; if (!pid) return;
        if (Date.now() - sheetsAt > 30000) { await loadList(); sheetsAt = Date.now(); }
        const hits = sheets.filter(x => (x.people_ids || []).map(Number).includes(pid));
        if (!hits.length || Number(S().currentPersonId) !== pid || document.querySelector('#workspace [data-fi-pcited]')) return;
        let host = document.querySelector('#workspace section[data-pblock="mentions"]');
        if (!host) { // pas de bloc « Cité dans » (rien d'autre ne la cite) : une petite carte à la fin des blocs
            const any = document.querySelector('#workspace section[data-pblock]'); if (!any) return;
            any.parentElement.insertAdjacentHTML('beforeend', A().card('📒', i18n('Cité dans'), hits.length, '', 'span-6').replace('<section class="card', '<section data-fi-pcard class="card'));
            host = any.parentElement.lastElementChild;
        }
        const box = document.createElement('div'); box.className = 'h-fi-pcited'; box.dataset.fiPcited = '';
        box.innerHTML = `<h4>📒 ${esc(i18n('Dans les Fiches'))} <small class="muted">${hits.length}</small></h4><ul>${hits.map(x => `<li><button type="button" class="table-link" data-fi-popen="${x.id}">${esc(`${x.icon || '📒'} ${x.title}`)}</button></li>`).join('')}</ul>`;
        box.addEventListener('click', e => { const b = e.target.closest('[data-fi-popen]'); if (!b) return; S().ficheId = Number(b.dataset.fiPopen); editing = false; A().setModule('fiches'); });
        (host.querySelector(':scope > .card-body') || host).appendChild(box);
    });
    ext.fichesInternals = {md}; // pour les essais
})();
