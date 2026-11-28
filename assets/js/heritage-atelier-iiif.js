/* LCNDA — 📜 Atelier de transcription, idée 40 : 🌐 ouvrir directement UNE vue des Archives (IIIF) (maquette approuvée docs/design/atelier-idees.html).
 * Fichier → « 🌐 Depuis une adresse IIIF… », ou le lien sous « Choisis l'image de l'acte » quand l'acte n'a pas encore d'image.
 * On colle l'adresse d'un manifeste IIIF (ou d'une seule image IIIF) donnée par le site des Archives : l'app lit le titre, le nombre
 * de vues, la cote et la licence ; on choisit la vue (petites vignettes autour) ; seule cette vue est téléchargée, en bonne
 * résolution, dans les Médias ; l'acte reçoit la source, la cote, la vue n / N et le lien ↗ source ; la mention de licence est gardée
 * avec l'image. Ensuite « Vue suivante → » (⏭ 37) télécharge la suivante, une à la fois. « Tout le registre » : l'outil des recueils.
 * Respect des Archives : seulement l'adresse collée, une vue par clic ; adresse pas IIIF : on dit quoi faire ; licence qui interdit
 * la réutilisation : on le dit avant d'ouvrir. Serveur : lib/atelier_idees.php (iiif_preview, iiif_thumb, iiif_open).
 *   window.LCNDA_EXT.atelierIiif.open({plug}) — essai : tests/test-atelier-idees.js
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const post = b => A().api('atelier_idees_write', {}, {method: 'POST', body: b}).then(r => r?.result || r);
    const thumbUrl = (manifest, n) => `api.php?action=atelier_idees&op=iiif_thumb&manifest=${encodeURIComponent(manifest)}&n=${n}`;

    function open({plug = null, url = ''} = {}) {
        const dg = document.createElement('dialog'); dg.className = 'modal aii-dlg'; document.body.appendChild(dg);
        let info = null, n = 1, busy = false;
        dg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">📜 ${esc(i18n('ATELIER'))}</span><h2>🌐 ${esc(i18n('Ouvrir une vue des Archives (IIIF)'))}</h2></div><button type="button" class="icon-button" data-aii-x aria-label="${esc(i18n('Fermer'))}">×</button></div>
            <p class="muted">${esc(i18n('Colle l’adresse IIIF donnée par le site des Archives (bouton « IIIF » ou « Partager » de leur visionneuse). Seule la vue choisie est téléchargée.'))}</p>
            <div class="aii-row"><input type="url" data-aii-url placeholder="https://…/manifest.json" maxlength="2000" value="${esc(url)}" aria-label="${esc(i18n('Adresse IIIF'))}"><button type="button" class="button secondary" data-aii-look>${esc(i18n('Lire'))}</button></div>
            <div data-aii-info aria-live="polite"></div>
            <div class="modal-actions"><button type="button" class="button secondary" data-aii-all hidden title="${esc(i18n('Télécharger plusieurs vues dans un recueil (l’outil des recueils)'))}">📚 ${esc(i18n('Tout le registre → recueil'))}</button><span class="spacer"></span><button type="button" class="button secondary" data-aii-x>${esc(i18n('Annuler'))}</button><button type="button" class="button" data-aii-go disabled>⬇ ${esc(i18n('Ouvrir cette vue seulement'))}</button></div></form>`;
        dg.showModal();
        const $ = s => dg.querySelector(s), close = () => { dg.close(); dg.remove(); };
        dg.addEventListener('cancel', e => { e.preventDefault(); if (!busy) close(); });
        const paintView = () => {
            if (!info) return; const N = info.count; n = Math.max(1, Math.min(N, n));
            $('[data-aii-n]').value = String(n); $('[data-aii-lab]').textContent = info.labels[n - 1] && info.labels[n - 1] !== String(n) ? `« ${info.labels[n - 1]} »` : '';
            const around = []; for (let k = Math.max(1, n - 3); k <= Math.min(N, n + 3); k++) around.push(k);
            $('[data-aii-thumbs]').innerHTML = around.map(k => `<button type="button" class="aii-th${k === n ? ' is-on' : ''}" data-aii-pick="${k}" aria-pressed="${k === n}" title="${esc(i18n('Vue {n}', {n: k}))}"><img src="${esc(thumbUrl(info.url, k))}" alt="" loading="lazy" onerror="this.remove()"><small>${k}</small></button>`).join('');
        };
        const look = async () => {
            const u = $('[data-aii-url]').value.trim(); if (!u) return;
            $('[data-aii-info]').innerHTML = `${window.LCNDA_UI.spinner(i18n('Lecture du manifeste…'))}`; $('[data-aii-go]').disabled = true; $('[data-aii-all]').hidden = true;
            try { info = await A().api('atelier_idees', {op: 'iiif_preview', url: u}); info.url = u; }
            catch (e) { info = null; $('[data-aii-info]').innerHTML = `<div class="ui-msg is-error aii-err">⛔ ${esc(e.message)}</div>`; return; }
            n = Math.max(1, Math.min(info.count, n));
            const lic = info.licence ? (info.licence_url ? `${window.LCNDA_UI.extLink(info.licence_url, info.licence)}` : esc(info.licence)) : '';
            $('[data-aii-info]').innerHTML = `<div class="aii-found"><b data-i18n-off>${esc(info.title)}</b> · ${esc(A().plural ? A().plural(info.count, 'vue') : i18n('{n} vues', {n: info.count}))}
                <div class="aii-meta">${[info.attribution ? `<span data-i18n-off>${esc(info.attribution)}</span>` : '', info.cote ? `${esc(i18n('cote'))} <b data-i18n-off>${esc(info.cote)}</b>` : '', lic ? `${esc(i18n('Licence :'))} ${lic}` : ''].filter(Boolean).join(' · ')}</div></div>
                ${info.licence_warn ? `<div class="ui-msg is-warning aii-warn">⚠️ ${esc(i18n('La licence de ce registre ne permet pas de réutiliser les images : la vue reste pour ton usage personnel, sans la publier ni la partager.'))}</div>` : ''}
                <div class="aii-pick"><span>${esc(i18n('Vue :'))}</span><button type="button" class="icon-button small" data-aii-step="-1" aria-label="${esc(i18n('Vue d’avant'))}">◀</button><input type="number" data-aii-n min="1" max="${info.count}" value="${n}" aria-label="${esc(i18n('Numéro de la vue'))}"><span class="muted">/ ${info.count}</span><button type="button" class="icon-button small" data-aii-step="1" aria-label="${esc(i18n('Vue suivante'))}">▶</button><small class="muted" data-aii-lab data-i18n-off></small></div>
                <div class="aii-thumbs" data-aii-thumbs></div>`;
            paintView(); $('[data-aii-go]').disabled = false; $('[data-aii-all]').hidden = !ext.recueilIiif;
        };
        dg.addEventListener('input', e => { if (e.target.matches('[data-aii-n]')) { n = Number(e.target.value) || 1; clearTimeout(dg._t); dg._t = setTimeout(paintView, 250); } });
        dg.addEventListener('click', async e => {
            if (e.target.closest('[data-aii-x]')) { if (!busy) close(); return; }
            if (e.target.closest('[data-aii-look]')) return look();
            const st = e.target.closest('[data-aii-step]'); if (st) { n += Number(st.dataset.aiiStep); paintView(); return; }
            const pk = e.target.closest('[data-aii-pick]'); if (pk) { n = Number(pk.dataset.aiiPick); paintView(); return; }
            if (e.target.closest('[data-aii-all]') && info) { // « Tout le registre » : l'outil des recueils, déjà là
                const u = info.url; close(); const d2 = ext.recueilIiif.open({onDone: rid => { if (rid) A().toast(i18n('Le registre est dans les Recueils.')); }});
                const inp = d2?.querySelector('[data-rq-url]'); if (inp) { inp.value = u; d2.querySelector('[data-rq-look]')?.click(); } return;
            }
            const go = e.target.closest('[data-aii-go]'); if (!go || !info || busy) return;
            busy = true; go.disabled = true; go.textContent = i18n('Téléchargement de la vue {n}…', {n});
            let r; try { r = await post({op: 'iiif_open', url: info.url, n}); } catch (e2) { busy = false; go.disabled = false; go.textContent = `⬇ ${i18n('Ouvrir cette vue seulement')}`; $('[data-aii-info]').insertAdjacentHTML('beforeend', `<div class="ui-msg is-error aii-err">⛔ ${esc(e2.message)}</div>`); return; }
            busy = false; close();
            const next = {mediaId: r.media_id, filename: r.filename, title: '', text: '', atelierNext: {reg: r.reg, source: ext.txSuivant?.sourceOf(r.reg) || ''}};
            if (plug) await plug.switchTo(next); else ext.openActTranscriber?.(next);
            A().toast(i18n('Vue {n} / {total} ouverte : la source, la cote et le lien ↗ source sont gardés avec l’acte.', {n: r.n, total: r.total}));
        });
        $('[data-aii-url]').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); look(); } });
        if (url) look();
        return dg;
    }
    ext.atelierIiif = {open};

    ext.txPlugins = ext.txPlugins || [];
    ext.txPlugins.push(plug => { // le lien discret sous « Choisis l'image de l'acte » (un acte sans image)
        const empty = plug.$('[data-tx-empty]'); if (!empty || empty.querySelector('[data-aii-open]')) return;
        (empty.querySelector('span') || empty).insertAdjacentHTML('beforeend', ` <button type="button" class="link-button aii-emptylink" data-aii-open>🌐 ${esc(i18n('Depuis une adresse IIIF…'))}</button>`);
        empty.addEventListener('click', e => { if (e.target.closest('[data-aii-open]')) open({plug}); });
    });
    ext.txMenus = ext.txMenus || [];
    ext.txMenus.push((menu, plug) => (menu === 'Fichier' ? [{icon: '🌐', label: i18n('Depuis une adresse IIIF…'), run: () => open({plug})}] : []));
})();
