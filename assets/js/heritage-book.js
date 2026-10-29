/**
 * 📖 Livre de famille (Réglages → Export propre) : une branche, les parties du livre dans l'ordre voulu, ce que
 * montre chaque fiche, les textes (titre, préface, mot de la fin), l'allure (style, police, page, couleur) et le format
 * du fichier (PDF par l'impression, HTML, Word, OpenDocument, ePub, Markdown, texte, CSV). Les réglages restent
 * d'une fois sur l'autre (genealogie-family-book). Serveur : lib/family_book.php.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => A().escapeHtml(v ?? '');
    const KEY = 'genealogie-family-book';
    const SECTIONS = [['cover', '📕 Couverture', 'le titre, le sous-titre, l’auteur'], ['preface', '✍️ Préface', 'ton texte d’introduction'], ['stats', '🔢 La famille en chiffres', 'personnes, périodes, noms les plus portés'],
        ['tree', '🌳 L’arbre', 'génération par génération'], ['people', '👤 Les fiches', 'une par personne'], ['chronology', '🗓️ Chronologie', 'toutes les dates de la branche'],
        ['places', '📍 Les lieux de la famille', 'où, combien, quand'], ['index', '🔤 Index des noms', 'par ordre alphabétique'], ['epilogue', '🖋️ Mot de la fin', 'ton texte de conclusion']];
    const PARTS = [['bio', '📝 Biographie', 'écrite d’après les événements'], ['family', '👪 Famille proche', 'parents, conjoints, enfants'], ['events', '🗓️ Repères', 'les événements datés'], ['photos', '🖼️ Photos', 'portrait et photos liées'], ['notes', '🗒️ Notes', 'les notes de la fiche']];
    const DEF = {sections: ['cover', 'tree', 'people', 'chronology'], off: ['preface', 'stats', 'places', 'index', 'epilogue'], parts: ['bio', 'family', 'events', 'photos'], partsOff: ['notes'],
        scope: 'ancestors', generations: 6, title: '', subtitle: '', author: '', preface: '', epilogue: '', theme: 'modern', font: 'sans', paper: 'A4', accent: '', flow: 'page', order: 'book', photo_count: 3, event_count: 12};
    const FORMATS = [['print', '📖 Ouvrir pour imprimer ou PDF', 'La page s’ouvre : « Imprimer », puis « Enregistrer en PDF ».', true], ['html', '🌐 Page HTML', 'Un fichier à ouvrir dans n’importe quel navigateur, photos comprises.'],
        ['doc', '📝 Word (.doc)', 'À retoucher dans Word ou Pages.'], ['odt', '📄 OpenDocument (.odt)', 'LibreOffice, Word, Pages : texte modifiable.'], ['epub', '📱 ePub (liseuse)', 'Pour une liseuse, un téléphone, une tablette.'],
        ['md', 'Ⓜ️ Markdown', 'Texte structuré, pour un site ou des notes.'], ['txt', '🔤 Texte brut', 'Le texte seul.'], ['csv', '📊 Tableau CSV', 'Les personnes du livre, pour un tableur.']];

    function load() {
        let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; }
        const keep = (list, all) => { const ok = (Array.isArray(list) ? list : []).filter(k => all.some(([x]) => x === k)); return [...new Set(ok)]; };
        const c = {...DEF, ...s};
        c.sections = keep(c.sections, SECTIONS); c.off = keep(c.off, SECTIONS).filter(k => !c.sections.includes(k));
        SECTIONS.forEach(([k]) => { if (!c.sections.includes(k) && !c.off.includes(k)) c.off.push(k); });
        c.parts = keep(c.parts, PARTS); c.partsOff = keep(c.partsOff, PARTS).filter(k => !c.parts.includes(k));
        PARTS.forEach(([k]) => { if (!c.parts.includes(k) && !c.partsOff.includes(k)) c.partsOff.push(k); });
        return c;
    }
    const save = c => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (_) {} };

    /** Une liste à cocher et à ranger (↑ ↓ et poignée) */
    const orderList = (kind, all, on, off) => `<ol class="h-book-order" data-book-list="${kind}">${[...on, ...off].map(k => { const [, label, help] = all.find(x => x[0] === k); const checked = on.includes(k);
        return `<li data-k="${k}" class="${checked ? '' : 'is-off'}"><label class="checkbox-line"><input type="checkbox" ${checked ? 'checked' : ''} data-book-on> <span><strong>${label}</strong> <small>${help}</small></span></label><span class="h-book-moves"><button type="button" class="icon-button small" data-book-move="-1" aria-label="Monter">↑</button><button type="button" class="icon-button small" data-book-move="1" aria-label="Descendre">↓</button></span></li>`; }).join('')}</ol>`;

    ext.familyBookPanelHtml = () => {
        const c = load(), S = A().state, start = S.bootstrap?.startPersonId;
        const sel = (name, opts) => `<select name="${name}">${opts.map(([v, l]) => `<option value="${v}" ${String(c[name]) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
        return `<section class="maintenance-panel h-book">
  <h3>Livre de famille — livret narratif</h3>
  <div class="h-book-studio"><div><b>📐 Mise en page, façon InDesign</b><span>Pages, gabarits, calques, textes, formes, images, nuancier, dégradés, habillage, Pathfinder… À partir de la famille, d’un design ou d’une page blanche ; enregistré, exporté en PDF.</span></div><button type="button" class="button" data-open-layout-studio>Ouvrir l’atelier de mise en page</button></div>
  <p>Ou, plus simple : choisis la branche, les parties du livre et leur ordre (coche, glisse ⠿ ou ↑ ↓), ce que montre chaque fiche, l’allure, puis le format. Tes réglages sont gardés pour la prochaine fois.</p>
  <form id="family-book-form" class="h-book-form" novalidate>
    <fieldset><legend>1. La branche</legend><div class="form-grid">
      <label>Qui <select name="scope"><option value="all" ${c.scope === 'all' ? 'selected' : ''}>toute la base</option><option value="ancestors" ${c.scope === 'ancestors' ? 'selected' : ''}>les ancêtres de…</option><option value="descendants" ${c.scope === 'descendants' ? 'selected' : ''}>les descendants de…</option><option value="both" ${c.scope === 'both' ? 'selected' : ''}>ancêtres et descendants de…</option></select></label>
      <div><span class="pk-lab">Personne de départ</span>${(window.LCNDA_PICKER || A()).pickerField({name: 'book_root', kind: 'person', value: start || null})}</div>
      <label>Générations <input type="number" name="generations" min="1" max="30" value="${esc(c.generations)}"></label>
      <label><span data-help="L’ordre de l’arbre suit les numéros Sosa (ancêtres) ou d’Aboville (descendants) : la personne, ses parents, ses grands-parents…">Ordre des fiches</span> ${sel('order', [['book', 'celui de l’arbre (Sosa, d’Aboville)'], ['generation', 'par génération'], ['birth', 'par date de naissance'], ['name', 'par nom (alphabétique)']])}</label>
    </div></fieldset>
    <div class="h-book-cols">
      <fieldset><legend>2. Le livre, dans l’ordre</legend>${orderList('sections', SECTIONS, c.sections, c.off)}</fieldset>
      <fieldset><legend>3. Chaque fiche, dans l’ordre</legend>${orderList('parts', PARTS, c.parts, c.partsOff)}
        <div class="form-grid"><label>Photos par fiche <input type="number" name="photo_count" min="0" max="12" value="${esc(c.photo_count)}"></label><label>Repères par fiche <input type="number" name="event_count" min="0" max="60" value="${esc(c.event_count)}"></label></div></fieldset>
    </div>
    <fieldset><legend>4. Les textes</legend><div class="form-grid">
      <label>Titre <input name="title" value="${esc(c.title)}" placeholder="Ascendance de… (automatique si vide)"></label>
      <label>Sous-titre <input name="subtitle" value="${esc(c.subtitle)}" placeholder="Trois siècles en Touraine"></label>
      <label>Auteur <input name="author" value="${esc(c.author)}" placeholder="${esc([localStorage.getItem('genealogie-owner-first'), ''].filter(Boolean).join(' ') || 'Ton nom')}"></label>
      <label class="span-2">Préface <textarea name="preface" rows="4" maxlength="8000" placeholder="Pourquoi ce livre, à qui il est dédié…">${esc(c.preface)}</textarea></label>
      <label class="span-2">Mot de la fin <textarea name="epilogue" rows="3" maxlength="8000" placeholder="Remerciements, ce qui reste à chercher…">${esc(c.epilogue)}</textarea></label>
    </div></fieldset>
    <fieldset><legend>5. L’allure</legend><div class="form-grid">
      <label>Style ${sel('theme', [['modern', 'Moderne (noir et bleu)'], ['classic', 'Classique (bordeaux, centré)'], ['elegant', 'Élégant (doré)'], ['sepia', 'Sépia (papier ancien)'], ['minimal', 'Sobre (gris)']])}</label>
      <label>Police ${sel('font', [['sans', 'Sans empattement (Arial)'], ['serif', 'Avec empattement (Georgia)'], ['mono', 'Machine à écrire']])}</label>
      <label>Format de page ${sel('paper', [['A4', 'A4'], ['A5', 'A5 (petit livre)'], ['letter', 'Lettre US']])}</label>
      <label><span data-help="Une fiche par page : chaque personne commence en haut d’une page. À la suite : les fiches s’enchaînent, le livre a moins de pages.">Mise en page</span> ${sel('flow', [['page', 'une fiche par page'], ['flow', 'à la suite (moins de pages)']])}</label>
      <label>Couleur <span class="h-book-color"><input type="color" name="accent" value="${esc(c.accent || '#006dcc')}"><button type="button" class="link-button" data-book-accent-reset>${c.accent ? 'celle du style' : '(celle du style)'}</button></span></label>
    </div></fieldset>
    <fieldset><legend>6. Le format</legend><div class="h-book-formats">${FORMATS.map(([k, l, h, main]) => `<button type="button" class="button ${main ? '' : 'secondary'} small" data-book-format="${k}" title="${esc(h)}">${l}</button>`).join('')}</div>
      <p class="muted h-book-note">PDF : ouvre le livre, puis « Imprimer / enregistrer en PDF ». Les photos sont rangées dans les fichiers HTML, Word et ePub quand elles sont petites ; en Markdown, elles restent des liens vers le dossier des médias.</p>
      <p class="h-book-regl" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button type="button" class="button small secondary" data-book-export title="Un fichier .json, à garder ou à passer à un autre ordinateur">⤓ Exporter mes réglages</button><button type="button" class="button small secondary" data-book-import title="Remettre des réglages exportés (fichier .json)">⤒ Importer un réglage</button><button type="button" class="link-button" data-book-reset>↺ Remettre comme au départ</button></p></fieldset>
  </form>
</section>`;
    };

    function read(form) {
        const c = load();
        ['scope', 'generations', 'order', 'title', 'subtitle', 'author', 'preface', 'epilogue', 'theme', 'font', 'paper', 'flow', 'photo_count', 'event_count'].forEach(k => { if (form.elements[k]) c[k] = form.elements[k].value; });
        c.accent = form.dataset.accentSet === '1' ? form.elements.accent.value : (c.accent || '');
        const listOf = kind => [...form.querySelectorAll(`[data-book-list="${kind}"] li`)];
        c.sections = listOf('sections').filter(li => li.querySelector('[data-book-on]').checked).map(li => li.dataset.k);
        c.off = listOf('sections').filter(li => !li.querySelector('[data-book-on]').checked).map(li => li.dataset.k);
        c.parts = listOf('parts').filter(li => li.querySelector('[data-book-on]').checked).map(li => li.dataset.k);
        c.partsOff = listOf('parts').filter(li => !li.querySelector('[data-book-on]').checked).map(li => li.dataset.k);
        return c;
    }
    ext.bindFamilyBook = exportUrl => {
        const form = document.getElementById('family-book-form'); if (!form) return;
        if (load().accent) form.dataset.accentSet = '1';
        const persist = () => save(read(form));
        form.addEventListener('input', persist); form.addEventListener('change', persist);
        form.elements.accent.addEventListener('input', () => { form.dataset.accentSet = '1'; persist(); });
        form.addEventListener('click', async e => {
            const mv = e.target.closest('[data-book-move]');
            if (mv) { const li = mv.closest('li'); if (mv.dataset.bookMove === '-1' && li.previousElementSibling) li.parentElement.insertBefore(li, li.previousElementSibling); else if (mv.dataset.bookMove === '1' && li.nextElementSibling) li.parentElement.insertBefore(li.nextElementSibling, li); persist(); return; }
            if (e.target.closest('[data-book-accent-reset]')) { form.dataset.accentSet = '0'; const c = read(form); c.accent = ''; save(c); A().toast('Couleur du style choisi.'); return; }
            if (e.target.closest('[data-book-export]')) { // ⤓ les réglages du livre dans un fichier : {lcnda:'reglage', outil, nom, version, donnees}
                const c = read(form), nom = String(await A().askText({title: 'Exporter mes réglages', message: 'Nom de ce réglage :', value: c.title || 'Mon livre de famille', okLabel: 'Exporter'}) ?? '').trim().slice(0, 60); if (!nom) return;
                const {title, subtitle, author, preface, epilogue, ...rest} = c, slug = nom.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'reglage';
                const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({lcnda: 'reglage', outil: 'livre-de-famille', nom, version: 1, donnees: {...rest, title, subtitle, author, preface, epilogue}}, null, 1)], {type: 'application/json'})); a.download = `lcnda-reglage-livre-de-famille-${slug}.json`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
                return;
            }
            if (e.target.closest('[data-book-import]')) {
                const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json'; inp.hidden = true; inp.dataset.uiOff = ''; document.body.appendChild(inp);
                inp.addEventListener('change', async () => {
                    const f = inp.files?.[0]; inp.remove(); if (!f) return;
                    let data; try { data = JSON.parse(await f.text()); } catch (_) { A().toast('Ce fichier n’est pas un réglage LCNDA (il n’est pas lisible).', 'error'); return; }
                    if (data?.lcnda !== 'reglage' || !data.donnees || typeof data.donnees !== 'object') { A().toast('Ce fichier n’est pas un réglage LCNDA.', 'error'); return; }
                    if (data.outil !== 'livre-de-famille') { A().toast(`Ce réglage vient d’un autre outil (« ${String(data.outil || '?').slice(0, 40)} ») : il ne va pas dans le livre de famille.`, 'error'); return; }
                    if (!await A().confirmBox('Tes réglages actuels du livre seront remplacés.', {title: `Mettre le réglage « ${String(data.nom || '').slice(0, 60)} » ?`, okLabel: 'Mettre ce réglage', danger: false})) return;
                    const ok = {}; Object.keys(DEF).forEach(k => { if (data.donnees[k] !== undefined) ok[k] = typeof DEF[k] === 'number' ? Number(data.donnees[k]) || DEF[k] : Array.isArray(DEF[k]) ? (Array.isArray(data.donnees[k]) ? data.donnees[k].map(String) : DEF[k]) : String(data.donnees[k]).slice(0, 8000); });
                    save({...load(), ...ok}); const sec = form.closest('.h-book'); sec.outerHTML = ext.familyBookPanelHtml(); ext.bindFamilyBook(exportUrl); A().toast(`Réglage « ${String(data.nom || '').slice(0, 60)} » mis.`);
                });
                inp.click(); return;
            }
            if (e.target.closest('[data-book-reset]')) { if (!await A().confirmBox('', {title: 'Remettre tous les réglages du livre comme au départ ?', okLabel: 'Remettre comme au départ'})) return; localStorage.removeItem(KEY); const sec = form.closest('.h-book'); sec.outerHTML = ext.familyBookPanelHtml(); ext.bindFamilyBook(exportUrl); return; }
            const f = e.target.closest('[data-book-format]'); if (!f) return;
            const c = read(form); save(c);
            const root = form.elements.book_root?.value || String(A().state.bootstrap?.startPersonId || '');
            if (c.scope !== 'all' && !Number(root)) return window.LCNDA_UI.fail(form.elements.book_root || form.querySelector('.pk'), 'Choisis la personne de départ de la branche.');
            if (!c.sections.length) return window.LCNDA_UI.fail(form.querySelector('[name^=sec], [data-sec] input, input[type=checkbox]'), 'Coche au moins une partie du livre.');
            const p = {scope: c.scope, root_id: root, generations: String(Math.max(1, Math.min(30, Number(c.generations) || 6))), sections: c.sections.join(','), parts: c.parts.join(','),
                title: c.title, subtitle: c.subtitle, author: c.author, preface: c.preface, epilogue: c.epilogue, theme: c.theme, font: c.font, paper: c.paper, flow: c.flow, order: c.order,
                photo_count: String(c.photo_count), event_count: String(c.event_count), accent: c.accent || ''};
            Object.keys(p).forEach(k => { if (p[k] === '') delete p[k]; });
            const kind = f.dataset.bookFormat;
            if (kind === 'print') { // L1 : la fenêtre « Imprimer » commune (aperçu, pages), sans nouvel onglet
                const UI = window.LCNDA_UI; if (!UI?.openPrintDialog) { A().toast('La fenêtre « Imprimer » n’est pas chargée.', 'error'); return; }
                let html = ''; try { const r = await fetch(exportUrl('export_family_book', {...p, inline: '1'}), {credentials: 'same-origin'}); if (!r.ok) throw new Error(`erreur ${r.status}`); html = await r.text(); } catch (e) { A().toast(`Le livre n’a pas pu être préparé : ${e.message}`, 'error'); return; }
                const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
                html = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<head>/i, `<head><base href="${base.replace(/"/g, '&quot;')}">`).replace(/<\/head>/i, '<style>.actions{display:none!important}</style></head>');
                UI.openPrintDialog({title: c.title || 'Livre de famille', key: 'livre-famille', photos: true, margin: 12, ...(String(c.paper || '').toUpperCase() === 'A5' ? {paper: 'A5'} : {}), html}); return; }
            const a = document.createElement('a'); a.href = exportUrl('export_family_book', {...p, format: kind}); a.download = ''; document.body.appendChild(a); a.click(); a.remove();
            A().toast('Préparation du livre…');
        });
    };
})();
