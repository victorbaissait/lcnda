/* LCNDA — 📒 Fiches (onglet « Fiches », masqué au départ : Maintenance → Apparence → ordre du menu).
 * Une fiche = une page sur un sujet (« La Pologne avant les guerres napoléoniennes », un métier, un lieu…), faite de
 * blocs rangés sur une grille : texte (mise en forme simple), images et documents, personnes, frise de dates, citation,
 * liens, intertitre, et ce que l'app sait montrer : un écran (carte, arbre, liste, Mes listes, fiche d'une personne,
 * village…) ou un widget / une statistique à soi. Serveur : lib/topic_sheets.php.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const esc = v => A().escapeHtml(v ?? '');
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const S = () => A().state;
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
        ['widget', '📊', 'Widget ou statistique à soi', 'Ceux de l’Éditeur de widgets / de statistiques'],
    ];
    const kindOf = t => KINDS.find(k => k[0] === t) || KINDS[0];
    const WIDTHS = [['12', 'toute la largeur'], ['9', '¾'], ['8', '⅔'], ['6', '½'], ['4', '⅓'], ['3', '¼']];
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
            .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
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
        const draw = () => {
            const q = filter.toLowerCase();
            const rows = sheets.filter(s => !q || `${s.title} ${s.subtitle}`.toLowerCase().includes(q));
            content.innerHTML = `<div class="h-fi-side"><input type="search" data-fi-q placeholder="Chercher une fiche…" value="${esc(filter)}">
                <button type="button" class="h-fi-sitem ${!S().ficheId ? 'is-active' : ''}" data-fi-open="0"><span>📚</span><strong>Toutes les fiches</strong><small>${sheets.length}</small></button>
                ${rows.map(s => `<button type="button" class="h-fi-sitem ${Number(S().ficheId) === s.id ? 'is-active' : ''}" data-fi-open="${s.id}"><span>${esc(s.icon || '📒')}</span><strong>${esc(s.title)}</strong><small>${s.blocks}</small></button>`).join('') || '<p class="muted">Aucune fiche.</p>'}</div>`;
            content.querySelector('[data-fi-q]').addEventListener('input', e => { filter = e.target.value; const pos = e.target.selectionStart; draw(); const i = content.querySelector('[data-fi-q]'); i.focus(); i.setSelectionRange(pos, pos); });
        };
        draw();
        content.addEventListener('click', e => { const b = e.target.closest('[data-fi-open]'); if (!b) return; S().ficheId = Number(b.dataset.fiOpen) || 0; editing = false; A().setModule('fiches'); });
        footer.innerHTML = '<button type="button" class="button small" data-fi-new>＋ Nouvelle fiche</button>';
        footer.querySelector('[data-fi-new]').addEventListener('click', newSheet);
        if (!sheets.length) loadList().then(() => { if (S().module === 'fiches') draw(); });
    };

    /* ─── Écran ─── */
    ext.fiches.render = async token => {
        await loadList();
        if (!isCurrent(token)) return;
        const id = Number(S().ficheId) || 0;
        if (!id || !sheets.some(s => s.id === id)) { S().ficheId = 0; cur = null; return renderIndex(token); }
        try { cur = await api('topic_sheet', {id}); } catch (e) { toast(e.message, 'error'); S().ficheId = 0; return renderIndex(token); }
        if (!isCurrent(token)) return;
        renderSheet(token);
        A().renderSidebar?.();
    };
    function renderIndex(token) {
        A().$('#workspace').innerHTML = `<section class="page h-fi">
            <header class="page-header"><div><span class="eyebrow">FICHES</span><h2>📒 Mes fiches</h2><p>Une fiche par sujet : l’histoire d’un pays à une époque, un lieu, un métier, une guerre, une coutume… Tu y mets ce que tu veux : du texte, des images et des documents, des personnes de la base, une frise de dates, des citations, des liens, et tout ce que l’app sait montrer (carte, arbre, listes, Mes listes, widgets et statistiques à toi).</p></div>
                <div class="page-actions"><button type="button" class="button" data-fi-new>＋ Nouvelle fiche</button></div></header>
            ${sheets.length ? `<div class="h-fi-cards">${sheets.map(s => `<button type="button" class="h-fi-card" data-fi-open="${s.id}" style="${s.color ? `--fi-c:${esc(s.color)}` : ''}">${s.cover ? `<span class="h-fi-cover">${A().mediaThumbHtml(s.cover)}</span>` : `<span class="h-fi-cover is-icon">${esc(s.icon || '📒')}</span>`}<strong>${esc(s.icon || '')} ${esc(s.title)}</strong><small>${esc(s.subtitle || '')}</small><small class="muted">${s.blocks} bloc${s.blocks > 1 ? 's' : ''}</small></button>`).join('')}</div>` : A().empty('Aucune fiche pour l’instant : « ＋ Nouvelle fiche ».')}
        </section>`;
        const ws = A().$('#workspace');
        ws.querySelector('[data-fi-new]').addEventListener('click', newSheet);
        ws.querySelectorAll('[data-fi-open]').forEach(b => b.addEventListener('click', () => { S().ficheId = Number(b.dataset.fiOpen); A().setModule('fiches'); }));
    }
    function newSheet() {
        ext.openDialog({eyebrow: 'FICHES', title: 'Nouvelle fiche', wide: true, submitLabel: 'Créer',
            body: `<div class="form-grid"><label class="span-2">Titre<input name="title" required maxlength="200" placeholder="La Pologne avant les guerres napoléoniennes"></label>
                <label>Icône<input name="icon" value="📒" maxlength="8" class="h-fi-iconin" readonly title="Choisir une icône"></label><label>Sous-titre <small>(facultatif)</small><input name="subtitle" maxlength="600"></label></div>
                <h4>Partir de</h4><div class="h-fi-tpls">${TEMPLATES.map((t, i) => `<label class="h-fi-tpl"><input type="radio" name="tpl" value="${i}" ${i === 0 ? 'checked' : ''}><span>${t.icon}</span><strong>${esc(t.name)}</strong><small>${esc(t.subtitle || 'Rien : tu ajoutes les blocs toi-même')}</small></label>`).join('')}</div>`,
            onOpen: d => d.querySelector('.h-fi-iconin').addEventListener('click', e => ext.pickEmoji?.(e.target)),
            onSubmit: async form => {
                const f = Object.fromEntries(new FormData(form)), t = TEMPLATES[Number(f.tpl)] || TEMPLATES.at(-1);
                const blocks = JSON.parse(JSON.stringify(t.blocks)).map(b => ({...b, id: uid()}));
                const r = await post('save_topic_sheet', {title: f.title, icon: f.icon || t.icon, subtitle: f.subtitle || '', blocks});
                S().ficheId = Number(r.result?.id || r.id); editing = true; A().setModule('fiches');
            }});
    }
    const save = async (quiet = true) => {
        try { await post('save_topic_sheet', {id: cur.id, title: cur.title, subtitle: cur.subtitle, icon: cur.icon, color: cur.color, blocks: cur.blocks}); if (!quiet) toast('Fiche enregistrée.'); }
        catch (e) { toast(e.message, 'error'); }
    };

    /* Le contenu d'un bloc */
    const mediaOf = b => (cur.media || []).filter(m => m.role === b.id);
    function blockBody(b) {
        switch (b.type) {
            case 'text': return b.text ? `<div class="h-fi-text">${md(b.text)}</div>` : '<p class="muted">Texte vide : ✎ pour l’écrire.</p>';
            case 'quote': return b.text ? `<figure class="h-fi-quote"><blockquote>${esc(b.text).replace(/\n/g, '<br>')}</blockquote>${b.source ? `<figcaption>— ${esc(b.source)}</figcaption>` : ''}</figure>` : '<p class="muted">Citation vide : ✎ pour l’écrire.</p>';
            case 'images': { const ms = mediaOf(b); return ms.length ? `<div class="h-fi-imgs is-${esc(b.layout || 'grid')}">${ext.thumbs ? ext.thumbs('fiche-' + b.id, ms) : ms.map(m => A().mediaThumbHtml(m)).join('')}</div>${b.caption ? `<p class="h-fi-caption">${esc(b.caption)}</p>` : ''}` : '<p class="muted">Aucune image : ✎ pour en ajouter (de l’ordinateur ou déjà dans l’app).</p>'; }
            case 'people': { const ps = (b.ids || []).map(i => cur.people?.[i]).filter(Boolean); return (ps.length ? `<div class="h-fi-people">${ps.map(p => `<button type="button" class="h-fi-person" data-h-person="${Number(p.id)}"><span class="h-fi-ini ${p.gender === 'female' ? 'is-f' : p.gender === 'male' ? 'is-m' : ''}">${esc(((p.first_name || '')[0] || '') + ((p.last_name || '')[0] || ''))}</span><span><strong>${esc(`${p.first_name || ''} ${p.last_name || ''}`.trim())}</strong><small>${esc([p.birth_year || p.death_year ? `${p.birth_year || '?'} – ${p.death_year || '?'}` : '', p.occupation].filter(Boolean).join(' · '))}</small></span></button>`).join('')}</div>` : '<p class="muted">Aucune personne : ✎ pour en ajouter.</p>') + (b.note ? `<p class="h-fi-caption">${esc(b.note)}</p>` : ''); }
            case 'dates': return (b.rows || []).length ? `<ol class="h-fi-dates">${b.rows.map(r => `<li><span>${esc(r.date)}</span><p>${esc(r.text)}</p></li>`).join('')}</ol>` : '<p class="muted">Aucune date : ✎ pour en ajouter.</p>';
            case 'links': return (b.rows || []).length ? `<ul class="h-fi-links">${b.rows.map(r => `<li>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.label || r.url)}</a>` : esc(r.label)}${r.note ? ` <small class="muted">— ${esc(r.note)}</small>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Aucun lien : ✎ pour en ajouter.</p>';
            case 'screen': {
                const as = ext.appScreen; if (!as) return '<p class="muted">Écran indisponible.</p>';
                if (as.nested) return as.nestedLink(b.target, b.title || as.label(b.target));
                return as.valid(b.target) ? `<iframe class="h-ct-frame" src="${esc(as.url(b))}" title="${esc(b.title || as.label(b.target))}" loading="lazy" style="height:${Math.max(240, Math.min(2000, Number(b.height) || 560))}px"></iframe>` : '<p class="muted">Cet écran n’existe plus : ✎ pour en choisir un autre.</p>';
            }
            case 'widget': return b.widget ? `<div class="h-fi-widget" data-fi-widget="${esc(b.widget)}"><p class="muted">Calcul…</p></div>` : '<p class="muted">Aucun widget choisi : ✎ pour en choisir un.</p>';
            default: return '';
        }
    }
    const titleOf = b => b.title || (b.type === 'screen' && ext.appScreen ? ext.appScreen.label(b.target) : b.type === 'widget' ? (ext.customWidgetDefs?.()[b.widget]?.name || 'Widget') : kindOf(b.type)[2]);
    function renderSheet(token) {
        const c = cur;
        const blocks = c.blocks.map((b, i) => {
            const tools = editing ? `<span class="h-fi-tools"><button type="button" class="h-bt h-fi-arrow" data-fi-up="${i}" title="Avant">↑</button><button type="button" class="h-bt h-fi-arrow" data-fi-down="${i}" title="Après">↓</button><button type="button" class="h-bt" data-fi-edit="${i}" title="Modifier">✎</button><button type="button" class="h-bt" data-fi-dup="${i}" title="Dupliquer">⧉</button><button type="button" class="h-bt" data-fi-del="${i}" title="Supprimer">🗑</button></span>`
                : (['screen'].includes(b.type) ? `<button type="button" class="button small secondary" data-ct-open-screen="${esc(b.target)}" title="Ouvrir en grand">↗</button>` : '') + `<button type="button" class="h-bt h-fi-quickedit" data-fi-edit="${i}" title="Modifier">✎</button>`;
            if (b.type === 'divider') return `<div class="span-12 h-fi-divider" data-fi-block="${i}" style="${b.color ? `--fi-c:${esc(b.color)}` : ''}"><h3>${esc(b.title || 'Intertitre')}</h3>${tools}</div>`;
            const html = A().card(i + 1, '\u0001', '', blockBody(b), 'span-' + (b.width || '12'), tools).replace('\u0001', `${kindOf(b.type)[1]} ${esc(titleOf(b))}`);
            return html.replace('<section class="card', `<section data-fi-block="${i}" style="${b.color ? `--fi-c:${esc(b.color)}` : ''}" class="h-fi-block ${b.color ? 'has-color' : ''} card`);
        }).join('');
        A().$('#workspace').innerHTML = `<section class="page h-fi ${editing ? 'is-editing' : ''}" style="${c.color ? `--fi-c:${esc(c.color)}` : ''}">
            <header class="page-header h-fi-head"><div><span class="eyebrow">FICHE</span><h2>${esc(c.icon || '📒')} ${esc(c.title)}</h2>${c.subtitle ? `<p>${esc(c.subtitle)}</p>` : ''}</div>
                <div class="page-actions"><button type="button" class="button ${editing ? '' : 'secondary'}" data-fi-mode>${editing ? '✓ Terminé' : '✏️ Organiser'}</button><button type="button" class="button secondary" data-fi-add>＋ Bloc</button><button type="button" class="button secondary" data-fi-props>⚙️ Titre, icône, couleur</button><button type="button" class="button secondary" data-fi-print>🖨️ Imprimer</button><button type="button" class="button secondary" data-fi-copy>⧉ Dupliquer</button><button type="button" class="button secondary danger" data-fi-delete>Supprimer</button></div></header>
            <div class="card-grid h-fi-grid">${blocks || A().empty('Fiche vide : « ＋ Bloc » pour ajouter du texte, des images, des personnes, une carte, une liste…')}</div>
            ${editing ? '<div class="h-fi-addrow"><button type="button" class="button" data-fi-add>＋ Ajouter un bloc</button></div>' : ''}
        </section>`;
        const ws = A().$('#workspace');
        ws.querySelectorAll('[data-fi-widget]').forEach(el => { if (ext.renderCustomWidgetInto) ext.renderCustomWidgetInto(el, el.dataset.fiWidget).catch?.(() => { el.innerHTML = '<p class="muted">Ce widget n’existe plus.</p>'; }); else el.innerHTML = '<p class="muted">Widget indisponible.</p>'; });
        A().bindTableLinks?.();
        ws.querySelector('.h-fi').addEventListener('click', async e => {
            const t = e.target.closest('button'); if (!t) return;
            const d = t.dataset, i = Number(d.fiUp ?? d.fiDown ?? d.fiEdit ?? d.fiDel ?? d.fiDup ?? -1);
            if (d.fiMode !== undefined) { editing = !editing; return renderSheet(token); }
            if (d.fiAdd !== undefined) return addBlock();
            if (d.fiProps !== undefined) return editProps();
            if (d.fiPrint !== undefined) return printSheet();
            if (d.fiCopy !== undefined) { const r = await post('save_topic_sheet', {title: c.title + ' (copie)', subtitle: c.subtitle, icon: c.icon, color: c.color, blocks: c.blocks.map(b => ({...b, id: b.type === 'images' ? b.id : uid()}))}); toast('Fiche dupliquée (les images restent sur l’original).'); S().ficheId = Number(r.result?.id || r.id); return A().setModule('fiches'); }
            if (d.fiDelete !== undefined) { if (!confirm(`Supprimer la fiche « ${c.title} » ? (les images restent dans les médias de l’app)`)) return; await post('delete_topic_sheet', {id: c.id}); toast('Fiche supprimée.'); S().ficheId = 0; return A().setModule('fiches'); }
            if (d.fiUp !== undefined && i > 0) { [c.blocks[i - 1], c.blocks[i]] = [c.blocks[i], c.blocks[i - 1]]; await save(); return renderSheet(token); }
            if (d.fiDown !== undefined && i < c.blocks.length - 1) { [c.blocks[i + 1], c.blocks[i]] = [c.blocks[i], c.blocks[i + 1]]; await save(); return renderSheet(token); }
            if (d.fiDup !== undefined) { const b = JSON.parse(JSON.stringify(c.blocks[i])); b.id = uid(); c.blocks.splice(i + 1, 0, b); await save(); return renderSheet(token); }
            if (d.fiDel !== undefined) { const b = c.blocks[i]; if (!confirm(`Supprimer le bloc « ${titleOf(b)} » ?`)) return; c.blocks.splice(i, 1); await save(); return refresh(); }
            if (d.fiEdit !== undefined) return editBlock(i, null, t.closest('[data-fi-block]'));
        });
    }
    const refresh = () => A().setModule('fiches');

    /* ─── Ajouter un bloc ─── */
    function addBlock() {
        ext.openDialog({eyebrow: 'FICHE', title: '＋ Ajouter un bloc', wide: true, submitLabel: 'Ajouter',
            body: `<div class="h-fi-kinds">${KINDS.map(([k, ic, l, h], i) => `<label class="h-fi-tpl"><input type="radio" name="kind" value="${k}" ${i ? '' : 'checked'}><span>${ic}</span><strong>${esc(l)}</strong><small>${esc(h)}</small></label>`).join('')}</div>`,
            onSubmit: form => {
                const k = new FormData(form).get('kind') || 'text';
                const b = {id: uid(), type: k, title: '', width: k === 'divider' || k === 'screen' ? '12' : '6', text: '', rows: [], ids: [], layout: 'grid', target: 'module:carte', height: 560};
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
            <div class="h-fi-wrow"><span>Couleur</span><span class="h-fi-colrow"><input type="color" name="color" value="${esc(b.color || '#0066cc')}"><label class="checkbox-line"><input type="checkbox" name="hascolor" ${b.color ? 'checked' : ''}> utiliser</label></span></div>`;
        let body = '';
        const rowsEditor = (rows, cols) => `<div class="h-fi-rows" data-fi-rows>${(rows.length ? rows : [{}]).map(r => `<div class="h-fi-row">${cols.map(([k, l, w]) => `<input data-k="${k}" placeholder="${esc(l)}" value="${esc(r[k] || '')}" style="flex:${w}">`).join('')}<button type="button" class="h-bt" data-fi-rowdel title="Retirer">×</button></div>`).join('')}</div><button type="button" class="button small secondary" data-fi-rowadd>＋ Une ligne</button>`;
        if (b.type === 'text') body = `<label class="h-fi-big">Texte<textarea name="text" rows="8">${esc(b.text || '')}</textarea></label><p class="muted h-fi-help"># Titre · ## Sous-titre · - liste · 1. liste numérotée · **gras** · *italique* · __souligné__ · [texte du lien](https://…) · > citation · --- trait</p>`;
        if (b.type === 'quote') body = `<label class="h-fi-big">Citation<textarea name="text" rows="6">${esc(b.text || '')}</textarea></label><label>Source<input name="source" value="${esc(b.source || '')}" maxlength="400" placeholder="Mémoires de…, p. 12"></label>`;
        if (b.type === 'images') body = `<label>Présentation<select name="layout">${[['grid', 'mosaïque'], ['large', 'une grande image'], ['strip', 'bandeau qui défile']].map(([v, l]) => `<option value="${v}" ${b.layout === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>Légende <small>(facultatif)</small><input name="caption" value="${esc(b.caption || '')}" maxlength="1000"></label>`
            + (ext.mediaEditorHtml ? ext.mediaEditorHtml('topic_sheet', cur.id, mediaOf(b), [[b.id, 'Images et documents', 'image/*,application/pdf']]) : '');
        if (b.type === 'dates') body = `<p class="muted">Une date par ligne (ex. « 1772 », « 3 mai 1791 ») et ce qui s’est passé. Elles sont rangées dans l’ordre que tu leur donnes.</p>${rowsEditor(b.rows || [], [['date', 'Date', 1], ['text', 'Ce qui s’est passé', 4]])}`;
        if (b.type === 'links') body = `${rowsEditor(b.rows || [], [['label', 'Nom', 2], ['url', 'https://…', 3], ['note', 'Note', 2]])}`;
        if (b.type === 'people') body = `<div class="h-fi-pp" data-fi-pp>${(b.ids || []).map(pid => { const p = cur.people?.[pid]; return `<span class="h-fi-chip" data-pid="${pid}">${esc(p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : '#' + pid)} <button type="button" data-fi-pdel aria-label="Retirer">×</button></span>`; }).join('')}</div>
            <label>Ajouter une personne<input type="search" data-fi-psearch placeholder="Tape un nom…" autocomplete="off"></label><div class="h-fi-presults" data-fi-presults></div><label>Note <small>(facultatif)</small><input name="note" value="${esc(b.note || '')}" maxlength="2000"></label>`;
        if (b.type === 'screen') body = ext.appScreen ? `<label>Écran ${ext.appScreen.select(b.target, 'name="target"')}</label><label>Personne <small>(pour « Fiche d’une personne »)</small>${A().collectionPersonField?.('fi_person', String(b.target).startsWith('person:') ? {id: Number(b.target.slice(7)), first_name: b.personName || '', last_name: ''} : null, 'Nom de la personne') || ''}</label>
            <label>Hauteur<select name="height">${ext.appScreen.heights.map(([v, l]) => `<option value="${v}" ${String(b.height) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="checkbox-line"><input type="checkbox" name="sidebar" ${b.sidebar ? 'checked' : ''}> avec sa colonne de gauche (menus de l’écran)</label>
            <p class="muted">Mes listes, les listes de l’app, la carte, les arbres, les statistiques, la fiche d’une personne, un village… : tout écran de l’app se met dans la fiche, à jour.</p>` : '<p class="muted">Écrans indisponibles.</p>';
        if (b.type === 'widget') { const defs = Object.values(ext.customWidgetDefs?.() || {}); body = defs.length ? `<label>Widget ou statistique<select name="widget">${defs.map(w => `<option value="${esc(w.id)}" ${b.widget === w.id ? 'selected' : ''}>${esc((w.icon || '🧱') + ' ' + (w.name || w.id))}</option>`).join('')}</select></label><p class="muted">Pour en créer un : Maintenance → Éditeur de widgets ou Éditeur de statistiques.</p>` : '<p class="muted">Aucun widget ni statistique à toi pour l’instant : Maintenance → Éditeur de widgets ou Éditeur de statistiques.</p>'; }
        const onOpen = dlg => {
                const root = dlg.querySelector('.h-dialog-body') || dlg;
                ext.bindMediaEditor?.(root); A().bindCollectionPersonFields?.(root);
                root.addEventListener('click', e => {
                    if (e.target.closest('[data-fi-rowadd]')) { const box = root.querySelector('[data-fi-rows]'), last = box.lastElementChild; const n = last.cloneNode(true); n.querySelectorAll('input').forEach(x => { x.value = ''; }); box.appendChild(n); n.querySelector('input').focus(); }
                    if (e.target.closest('[data-fi-rowdel]')) { const row = e.target.closest('.h-fi-row'), box = row.parentElement; if (box.children.length > 1) row.remove(); else row.querySelectorAll('input').forEach(x => { x.value = ''; }); }
                    if (e.target.closest('[data-fi-pdel]')) e.target.closest('.h-fi-chip').remove();
                    const add = e.target.closest('[data-fi-padd]'); if (add) { const box = root.querySelector('[data-fi-pp]'); if (!box.querySelector(`[data-pid="${add.dataset.fiPadd}"]`)) box.insertAdjacentHTML('beforeend', `<span class="h-fi-chip" data-pid="${add.dataset.fiPadd}">${esc(add.dataset.name)} <button type="button" data-fi-pdel aria-label="Retirer">×</button></span>`); add.remove(); }
                });
                let timer = 0;
                root.querySelector('[data-fi-psearch]')?.addEventListener('input', e => {
                    clearTimeout(timer); const q = e.target.value.trim(), out = root.querySelector('[data-fi-presults]');
                    if (q.length < 2) { out.innerHTML = ''; return; }
                    timer = setTimeout(async () => { try { const r = await api('people', {q, limit: 20}); out.innerHTML = (r.people || []).map(p => `<button type="button" class="button small secondary" data-fi-padd="${p.id}" data-name="${esc(A().personName(p))}">＋ ${esc(A().personName(p))} <small class="muted">${esc(A().years?.(p) || '')}</small></button>`).join('') || '<p class="muted">Personne trouvée.</p>'; } catch (_) {} }, 250);
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
                if (b.type === 'people') { b.ids = [...form.querySelectorAll('[data-fi-pp] [data-pid]')].map(x => Number(x.dataset.pid)); b.note = f.note || ''; }
                if (b.type === 'screen') { let target = f.target || 'module:carte'; const pid = Number(form.elements.fi_person?.value) || 0; if (target.startsWith('person:')) target = pid ? 'person:' + pid : 'module:personnes'; b.target = target; b.personName = form.querySelector('[data-cp-input="fi_person"]')?.value || ''; b.height = Number(f.height) || 560; b.sidebar = !!form.elements.sidebar?.checked; }
                if (b.type === 'widget') b.widget = f.widget || '';
                if (fresh) cur.blocks.push(b); else cur.blocks[i] = b;
                await save();
                if (b.type === 'images' && ext.uploadMediaEditor) await ext.uploadMediaEditor(form, 'topic_sheet', cur.id);
                refresh();
            };
        // un nouveau bloc s'ouvre lui aussi sur place : une carte vide en bas de la fiche, retournée sur ses réglages
        if (fresh && !host) {
            const grid = A().$('#workspace .h-fi-grid');
            if (grid) { grid.querySelector(':scope > .empty-state, :scope > .empty')?.remove(); grid.insertAdjacentHTML('beforeend', A().card(cur.blocks.length + 1, `${ic} Nouveau bloc`, '', '', 'span-' + (b.type === 'divider' ? '12' : (b.width || '12'))).replace('<section class="card', '<section data-fi-new class="h-fi-block card')); host = grid.lastElementChild; host.scrollIntoView({block: 'center', behavior: 'smooth'}); }
        }
        const target = host ? (host.querySelector(':scope > .card-body') || host) : null;
        if (target) { // sur place, comme le verso d'un widget
            host.classList.add('is-back');
            target.innerHTML = `<form class="h-fi-back dashboard-widget-back" novalidate><div class="dashboard-widget-back-title"><strong>${fresh ? 'Nouveau bloc' : 'Réglages du bloc'}</strong><span>${ic} ${esc(label)}</span></div>${common}${body}<div class="page-actions compact h-fi-back-actions"><button type="submit" class="button small">${fresh ? 'Ajouter' : 'Enregistrer'}</button><button type="button" class="button small secondary" data-fi-cancel>Annuler</button></div></form>`;
            const form = target.querySelector('form');
            A().bindCollectionPersonFields?.(form); onOpen(form);
            form.querySelector('[data-fi-cancel]').addEventListener('click', () => refresh());
            // la largeur se voit tout de suite, comme pour un widget
            form.addEventListener('click', e => { const w = e.target.closest('[data-fi-w]'); if (!w) return; form.elements.width.value = w.dataset.fiW; form.querySelectorAll('[data-fi-w]').forEach(x => x.setAttribute('aria-pressed', String(x === w))); host.className = host.className.replace(/\bspan-\d+\b/, 'span-' + w.dataset.fiW); });
            form.addEventListener('submit', async e => { e.preventDefault(); const btn = form.querySelector('[type=submit]'); btn.disabled = true; try { if (await onSubmit(form) === false) btn.disabled = false; } catch (err) { toast(err.message, 'error'); btn.disabled = false; } });
            form.querySelector('input[name=title]')?.focus();
            return;
        }
        ext.openDialog({eyebrow: 'FICHE', title: `${ic} ${fresh ? 'Nouveau bloc' : 'Modifier le bloc'} — ${label}`, wide: true, submitLabel: fresh ? 'Ajouter' : 'Enregistrer', body: common + body, onOpen, onSubmit});
    }

    /* ─── Titre, icône, sous-titre, couleur de la fiche ─── */
    function editProps() {
        ext.openDialog({eyebrow: 'FICHE', title: '⚙️ La fiche', submitLabel: 'Enregistrer',
            body: `<div class="form-grid"><label class="span-2">Titre<input name="title" value="${esc(cur.title)}" required maxlength="200"></label><label>Icône<input name="icon" value="${esc(cur.icon || '📒')}" class="h-fi-iconin" readonly title="Choisir une icône"></label>
                <label>Couleur<span class="h-fi-colrow"><input type="color" name="color" value="${esc(cur.color || '#0066cc')}"><label class="checkbox-line"><input type="checkbox" name="hascolor" ${cur.color ? 'checked' : ''}> utiliser</label></span></label>
                <label class="span-2">Sous-titre<input name="subtitle" value="${esc(cur.subtitle || '')}" maxlength="600"></label></div>`,
            onOpen: d => d.querySelector('.h-fi-iconin').addEventListener('click', e => ext.pickEmoji?.(e.target)),
            onSubmit: async form => { const f = Object.fromEntries(new FormData(form)); Object.assign(cur, {title: f.title.trim(), icon: f.icon || '📒', subtitle: f.subtitle || '', color: form.elements.hascolor.checked ? f.color : ''}); await save(); refresh(); }});
    }

    /* ─── Imprimer : une page propre (texte, images, personnes, dates, citations, liens ; les écrans et widgets en titre) ─── */
    function printSheet() {
        const c = cur, w = window.open('', '_blank'); if (!w) return toast('Autorise les fenêtres pour imprimer.', 'error');
        const abs = u => new URL(u, location.href).href;
        const body = c.blocks.map(b => {
            if (b.type === 'divider') return `<h2>${esc(b.title)}</h2>`;
            let inner = '';
            if (b.type === 'images') inner = mediaOf(b).filter(m => m.media_type === 'image' || /\.(jpe?g|png|gif|webp)$/i.test(m.filename || '')).map(m => `<img src="${esc(abs('media/' + encodeURIComponent(m.filename)))}" alt="">`).join('') + (b.caption ? `<p><i>${esc(b.caption)}</i></p>` : '');
            else if (b.type === 'screen' || b.type === 'widget') inner = '<p><i>(écran de l’app : à voir dans LCNDA)</i></p>';
            else inner = blockBody(b).replace(/<button[^>]*data-h-person[^>]*>/g, '<div class="p">').replace(/<\/button>/g, '</div>');
            return `<section style="width:${Math.round(Number(b.width || 12) / 12 * 100) - 2}%"><h3>${esc(titleOf(b))}</h3>${inner}</section>`;
        }).join('');
        w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(c.title)}</title><style>body{font-family:Georgia,serif;margin:28px;color:#111}h1{margin:0}main{display:flex;flex-wrap:wrap;gap:2%}section{break-inside:avoid;margin-bottom:14px}h2{width:100%;border-bottom:2px solid #111;margin:18px 0 8px}h3{font-size:15px;margin:6px 0}img{max-width:100%;max-height:340px;margin:4px 4px 0 0}blockquote{margin:0;padding-left:12px;border-left:3px solid #999;font-style:italic}ol,ul{padding-left:18px}.p{margin:2px 0}.p small{color:#666;margin-left:6px}</style></head><body><h1>${esc(c.icon || '')} ${esc(c.title)}</h1>${c.subtitle ? `<p>${esc(c.subtitle)}</p>` : ''}<main>${body}</main><script>window.onload=()=>setTimeout(()=>print(),300)<\/script></body></html>`);
        w.document.close();
    }
    /* ─── Listes → 📒 Fiches ─── */
    ext.lists = ext.lists || {};
    ext.lists.topic_sheets_list = async token => {
        await loadList();
        if (token !== S().workspaceToken || S().module !== 'listes') return;
        const fmtDate = d => { const x = new Date(String(d || '').replace(' ', 'T')); return isNaN(x) ? '' : x.toLocaleDateString('fr-FR'); };
        A().$('#workspace').innerHTML = `<section class="page collection-page"><header class="page-header"><div><span class="eyebrow">LISTES</span><h2>📒 Fiches</h2><p>Les fiches sur un sujet (onglet « Fiches ») : clique sur une fiche pour l’ouvrir.</p></div>
                <div class="page-actions"><button type="button" class="button" data-fi-listnew>＋ Nouvelle fiche</button></div></header>
            ${sheets.length ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Fiche</th><th>Sous-titre</th><th>Blocs</th><th>Modifiée le</th></tr></thead><tbody>${sheets.map(s => `<tr><td><button type="button" class="table-link" data-fi-listopen="${s.id}">${esc((s.icon || '📒') + ' ' + s.title)}</button></td><td>${esc(s.subtitle || '')}</td><td>${s.blocks}</td><td>${esc(fmtDate(s.updated_at))}</td></tr>`).join('')}</tbody></table></div>` : A().empty('Aucune fiche pour l’instant : « ＋ Nouvelle fiche ».')}</section>`;
        const ws = A().$('#workspace');
        ws.querySelectorAll('[data-fi-listopen]').forEach(b => b.addEventListener('click', () => { S().ficheId = Number(b.dataset.fiListopen); A().setModule('fiches'); }));
        ws.querySelector('[data-fi-listnew]').addEventListener('click', newSheet);
    };
    ext.fichesInternals = {md}; // pour les essais
})();
