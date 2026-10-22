/* LCNDA — 📤 Partager avec la famille (F11 ; serveur : lib/family_share.php).
 * Maintenance → Exporter → « 📤 Partager avec la famille » : une copie de l'arbre en lecture seule (.zip : index.html +
 * photos) à envoyer à la famille ; elle s'ouvre d'un double-clic, sans l'app ni internet. On choisit les branches (vide =
 * toute la base), ce que deviennent les vivants (cachés, ou prénom seulement) et ce qu'on montre (photos, actes, notes) ;
 * le résumé « Voilà ce qui part » se met à jour à chaque changement, avant de fabriquer le fichier.
 * Construit à côté des exports existants (GEDCOM « Pour partager », GEDCOM d'une seule branche) : même règle des vivants.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const key of ['exportPanels', 'afterExport']) ext[key] = ext[key] || [];
    const esc = v => A().escapeHtml(String(v ?? ''));
    const P = () => window.LCNDA_PICKER || A();
    const UI = () => window.LCNDA_UI || {};
    const plural = (n, one, many) => A().plural(n, one, many);
    const PREF = 'lcnda-family-share';
    const loadPrefs = () => { try { return {living: 'hide', photos: true, docs: true, notes: true, ...JSON.parse(localStorage.getItem(PREF) || '{}')}; } catch (_) { return {living: 'hide', photos: true, docs: true, notes: true}; } };
    const savePrefs = p => { try { localStorage.setItem(PREF, JSON.stringify({living: p.living, photos: p.photos, docs: p.docs, notes: p.notes})); } catch (_) {} };
    const MODES = [['ascendants', 'Les ancêtres de…'], ['descendants', 'Les descendants de…'], ['couple', 'Les descendants du couple…']];

    ext.exportPanels.push(() => `<section class="maintenance-panel" id="h-family-share"><h3 data-help="Une copie de l’arbre à ouvrir d’un double-clic, sans l’app ni internet. Rien ne peut y être modifié ; les vivants et les fiches confidentielles n’y sont pas." data-help-faq="Partager avec la famille">📤 Partager avec la famille</h3>
        <p>Une <b>copie de l’arbre en lecture seule</b>, à envoyer à la famille (clé USB, courriel, WeTransfer…) : un fichier .zip qui s’ouvre d’un double-clic, <b>sans l’app ni internet</b>, avec l’arbre, les fiches, les photos que tu choisis et la recherche. Les personnes vivantes n’y figurent pas (ou seulement leur prénom), ni les fiches confidentielles.</p>
        <div class="page-actions"><button type="button" class="button" data-fs-open>📤 Partager avec la famille…</button></div></section>`);
    ext.afterExport.push(() => { document.querySelector('[data-fs-open]')?.addEventListener('click', () => openShareDialog()); });

    function defaultTitle() {
        const last = (document.getElementById('brand-lastname')?.textContent || '').trim();
        return last && !/^famille$/i.test(last) ? `L’arbre de la famille ${last.charAt(0).toUpperCase()}${last.slice(1).toLowerCase()}` : 'L’arbre de la famille';
    }
    function params(st) {
        const branches = st.branches.filter(b => b.person).map(b => ({mode: b.mode === 'couple' ? 'descendants' : b.mode, person: b.person, partner: b.mode === 'couple' ? (b.partner || 0) : 0, generations: Number(b.generations) || 60, spouses: b.spouses ? 1 : 0}));
        return {branches: JSON.stringify(branches), living: st.living, photos: st.photos ? 1 : 0, docs: st.docs ? 1 : 0, notes: st.notes ? 1 : 0, title: st.title || ''};
    }
    const branchRow = (b, k) => `<div class="h-fs-branch" data-fs-branch="${k}">
        <select data-fs-mode aria-label="Sorte de branche">${MODES.map(([v, l]) => `<option value="${v}" ${b.mode === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <div class="h-fs-pk">${P().pickerField({name: `fs_person_${k}`, hiddenName: false, kind: 'person', animals: false, value: b.person ? {id: b.person, title: b.personName || ''} : null})}</div>
        <div class="h-fs-pk" data-fs-partner ${b.mode === 'couple' ? '' : 'hidden'}><span class="pk-lab">et</span>${P().pickerField({name: `fs_partner_${k}`, hiddenName: false, kind: 'person', animals: false, value: b.partner ? {id: b.partner, title: b.partnerName || ''} : null})}</div>
        <label class="h-fs-gen">Générations<input type="number" min="1" max="60" value="${Number(b.generations) || 60}" data-fs-gen></label>
        <button type="button" class="icon-button small" data-fs-del aria-label="Retirer cette branche" title="Retirer cette branche">×</button></div>`;
    function summaryHtml(r, st) {
        const s = r.summary, n = s.living_hidden + s.living_first;
        const line = (ico, txt) => `<li><span aria-hidden="true">${ico}</span> ${txt}</li>`;
        const items = [
            line('👥', `<b>${plural(s.people, 'personne')}</b>${s.branches ? ` (${plural(s.branches, 'branche')})` : ' (toute la base)'}${r.root ? `, à partir de <b>${esc(r.root.name)}</b>` : ''}`),
            line('📅', `${plural(s.events, 'événement')} et ${plural(s.families, 'famille')}`),
            st.photos ? line('📷', plural(s.photos, 'photo')) : '', st.docs ? line('📄', plural(s.docs, 'acte ou document', 'actes ou documents')) : '', st.notes ? line('📝', plural(s.notes, 'note')) : '',
            line('🔒', n ? `${plural(n, 'personne vivante', 'personnes vivantes')} ${st.living === 'first' ? '<b>au prénom seulement</b> (ni nom, ni date, ni lieu, ni photo)' : '<b>retirée' + (n > 1 ? 's' : '') + '</b>'}` : 'Aucune personne vivante dans ce choix'),
            s.private_removed ? line('🔒', `${plural(s.private_removed, 'fiche confidentielle retirée', 'fiches confidentielles retirées')}`) : '',
            s.media_skipped_hidden ? line('🚫', `${plural(s.media_skipped_hidden, 'image laissée', 'images laissées')} de côté : une personne vivante ou confidentielle y est reliée`) : '',
            s.media_skipped_other ? line('ℹ️', `${plural(s.media_skipped_other, 'fichier laissé', 'fichiers laissés')} de côté (PDF, son, vidéo ou fichier introuvable)`) : '',
            s.names_redacted ? line('✂️', `${plural(s.names_redacted, 'nom de vivant retiré', 'noms de vivants retirés')} des textes (remplacés par « [nom retiré] »)`) : '',
        ].filter(Boolean).join('');
        const size = s.bytes > 1e6 ? `${(s.bytes / 1e6).toLocaleString('fr-FR', {maximumFractionDigits: 1})} Mo` : `${Math.max(1, Math.round(s.bytes / 1e3))} ko`;
        return `<h4>Voilà ce qui part</h4><ul class="h-fs-sum">${items}</ul><p class="muted">Environ ${size} · un fichier .zip à décompresser, puis ouvrir <b>index.html</b>.</p>
            ${!r.gd && (st.photos || st.docs) ? UI().notice?.('warn', 'Cet ordinateur ne sait pas réduire les images : elles ne partiront pas.') || '' : ''}`;
    }

    function openShareDialog() {
        const pr = loadPrefs();
        const st = {title: defaultTitle(), branches: [], living: pr.living === 'first' ? 'first' : 'hide', photos: pr.photos !== false, docs: pr.docs !== false, notes: pr.notes !== false};
        let timer = 0, seq = 0, last = null;
        const dlg = ext.openDialog({eyebrow: 'EXPORTER', title: '📤 Partager avec la famille', wide: true, submitLabel: '📤 Fabriquer la copie (.zip)',
            body: `<p class="muted">Une copie de l’arbre en lecture seule : la famille l’ouvre d’un double-clic, sans l’app ni internet, et ne peut rien y changer.</p>
                <div class="form-grid"><label class="span-2">Titre de la copie<input name="title" maxlength="120" value="${esc(st.title)}"></label></div>
                <fieldset class="h-fs-fs"><legend>Les branches</legend><p class="muted" data-fs-all>Aucune branche choisie : toute la base part.</p><div data-fs-branches></div>
                    <button type="button" class="button small secondary" data-fs-add>＋ Ajouter une branche</button></fieldset>
                <div class="h-fs-cols"><fieldset class="h-fs-fs"><legend>Les personnes vivantes</legend>
                    <label class="checkbox-line"><input type="radio" name="living" value="hide" ${st.living === 'hide' ? 'checked' : ''}> Cachées : elles n’apparaissent pas du tout</label>
                    <label class="checkbox-line"><input type="radio" name="living" value="first" ${st.living === 'first' ? 'checked' : ''}> Prénom seulement (sans nom, date, lieu ni photo)</label>
                    <p class="muted">Vivantes = notées « vivantes », ou sans décès et nées il y a moins de 100 ans. Les fiches confidentielles ne partent jamais.</p></fieldset>
                <fieldset class="h-fs-fs"><legend>Ce qu’on montre</legend>
                    <label class="checkbox-line"><input type="checkbox" name="photos" ${st.photos ? 'checked' : ''}> 📷 Les photos</label>
                    <label class="checkbox-line"><input type="checkbox" name="docs" ${st.docs ? 'checked' : ''}> 📄 Les actes et documents (avec leur transcription)</label>
                    <label class="checkbox-line"><input type="checkbox" name="notes" ${st.notes ? 'checked' : ''}> 📝 Les notes</label>
                    <p class="muted">Une image où figure une personne vivante ou confidentielle ne part jamais.</p></fieldset></div>
                <section class="h-fs-summary" data-fs-summary aria-live="polite">${UI().spinner?.('Je regarde ce qui partirait…') || ''}</section>`,
            onOpen: d => {
                const box = d.querySelector('[data-fs-branches]');
                const drawBranches = () => { box.innerHTML = st.branches.map(branchRow).join(''); d.querySelector('[data-fs-all]').hidden = st.branches.length > 0; };
                const refresh = (delay = 350) => { clearTimeout(timer); timer = setTimeout(load, delay); };
                async function load() {
                    const mine = ++seq, out = d.querySelector('[data-fs-summary]');
                    try { const r = await A().api('family_share_preview', params(st)); if (mine !== seq) return; last = r; out.innerHTML = summaryHtml(r, st); }
                    catch (e) { if (mine !== seq) return; last = null; out.innerHTML = UI().notice?.('error', e.message) || esc(e.message); }
                }
                d.querySelector('[data-fs-add]').addEventListener('click', () => { st.branches.push({mode: 'descendants', person: 0, partner: 0, generations: 60, spouses: true}); drawBranches(); box.querySelector('[data-fs-branch]:last-child .pk input')?.focus(); });
                box.addEventListener('click', e => { const del = e.target.closest('[data-fs-del]'); if (!del) return; st.branches.splice(Number(del.closest('[data-fs-branch]').dataset.fsBranch), 1); drawBranches(); refresh(0); });
                box.addEventListener('change', e => {
                    const row = e.target.closest('[data-fs-branch]'); if (!row) return; const b = st.branches[Number(row.dataset.fsBranch)];
                    if (e.target.matches('[data-fs-mode]')) { b.mode = e.target.value; row.querySelector('[data-fs-partner]').hidden = b.mode !== 'couple'; refresh(); }
                    if (e.target.matches('[data-fs-gen]')) { b.generations = Math.max(1, Math.min(60, Number(e.target.value) || 60)); refresh(); }
                });
                box.addEventListener('picker-change', e => {
                    const row = e.target.closest('[data-fs-branch]'); if (!row) return; const b = st.branches[Number(row.dataset.fsBranch)], it = e.detail.item;
                    const partner = String(e.detail.name || '').startsWith('fs_partner_');
                    b[partner ? 'partner' : 'person'] = it && !it.free ? Number(it.id) || 0 : 0; b[partner ? 'partnerName' : 'personName'] = it?.title || '';
                    refresh(0);
                });
                d.querySelector('.h-dialog-body').addEventListener('change', e => {
                    const t = e.target; if (t.closest('[data-fs-branches]')) return;
                    if (t.name === 'living') st.living = t.value === 'first' ? 'first' : 'hide';
                    if (['photos', 'docs', 'notes'].includes(t.name)) st[t.name] = t.checked;
                    if (t.name === 'title') st.title = t.value.trim();
                    savePrefs(st); refresh(0);
                });
                d.querySelector('[name=title]').addEventListener('input', e => { st.title = e.target.value.trim(); });
                drawBranches(); load();
            },
            onSubmit: async form => {
                const bad = st.branches.findIndex(b => !b.person);
                if (bad >= 0) return UI().fail(form.querySelector(`[data-fs-branch="${bad}"] .pk input`) || form.querySelector('[data-fs-add]'), 'Choisis la personne de cette branche, ou retire la branche (×).');
                const couple = st.branches.findIndex(b => b.mode === 'couple' && !b.partner);
                if (couple >= 0) return UI().fail(form.querySelector(`[data-fs-branch="${couple}"] [data-fs-partner] .pk input`), 'Choisis le conjoint, ou prends « Les descendants de… ».');
                if (last && !last.summary.people) return UI().fail(form.querySelector('[data-fs-add]'), 'Rien ne partirait : choisis une autre branche.');
                const out = form.querySelector('[data-fs-summary]');
                const keep = out.innerHTML; out.innerHTML = UI().spinner?.('Je fabrique la copie (les photos sont réduites)…') || 'Préparation…';
                try {
                    const url = new URL('api.php', location.href); url.searchParams.set('action', 'family_share_export');
                    Object.entries(params(st)).forEach(([k, v]) => url.searchParams.set(k, String(v)));
                    const r = await fetch(url, {credentials: 'same-origin'});
                    if (!r.ok || !/zip/.test(r.headers.get('content-type') || '')) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'La copie n’a pas pu être fabriquée.'); }
                    const name = (/filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '') || [])[1] || 'arbre-famille.zip';
                    const blob = await r.blob(), a = document.createElement('a');
                    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
                    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
                    A().toast(`Copie prête : ${name}. Envoie ce fichier à la famille ; il s’ouvre avec index.html.`, 'success');
                    return true;
                } catch (e) { out.innerHTML = keep; A().toast(e.message, 'error'); return false; }
            }});
        return dlg;
    }
    ext.openFamilyShare = openShareDialog;
    window.LCNDA_FAMILY_SHARE = {open: openShareDialog};
})();
