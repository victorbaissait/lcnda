/* LCNDA — 📚 Recueils : « 🌐 Depuis un registre en ligne… » (lib/recueil_iiif.php).
 * On colle l'adresse IIIF (le « manifeste ») d'un registre : l'app dit son titre et son nombre de vues ; on choisit les vues
 * (toutes, ou de… à…) ; elles sont téléchargées quelques-unes à la fois (barre d'avancée, « Arrêter » garde ce qui est fait),
 * dans un nouveau recueil, une vue par page. « ↶ Annuler » supprime le recueil et ses photos.
 *   window.LCNDA_EXT.recueilIiif.open({onDone}) */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {}, A = () => window.LCNDA_APP;
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const post = (a, b) => A().api(a, {}, {method: 'POST', body: b}).then(r => r.result || r);
    function open({onDone} = {}) {
        const dg = document.createElement('dialog'); dg.className = 'modal rq-dlg'; document.body.appendChild(dg);
        let info = null, stop = false, busy = false;
        dg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">📚 ${esc(T('Nouveau recueil'))}</span><h2>🌐 ${esc(T('Depuis un registre en ligne (IIIF)'))}</h2></div><button type="button" class="icon-button" data-rq-x aria-label="${esc(T('Fermer'))}">×</button></div>
            <p class="muted">${esc(T('Beaucoup d’archives, de bibliothèques et Gallica publient leurs registres en IIIF. Colle l’adresse du « manifeste » (souvent …/manifest.json, parfois derrière un logo IIIF) : l’app télécharge les vues dans un nouveau recueil, une vue par page.'))}</p>
            <div class="rq-row"><input type="url" data-rq-url placeholder="https://…/manifest.json" maxlength="2000"><button type="button" class="button secondary" data-rq-look>🔎 ${esc(T('Regarder'))}</button></div>
            <div data-rq-info></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-rq-x>${esc(T('Fermer'))}</button><button type="button" class="button" data-rq-go disabled>⤓ ${esc(T('Télécharger'))}</button></div></form>`;
        dg.showModal();
        const $ = s => dg.querySelector(s), close = () => { stop = true; dg.close(); dg.parentNode?.removeChild(dg); };
        dg.addEventListener('cancel', e => { if (busy) { e.preventDefault(); stop = true; return; } close(); });
        const look = async () => {
            const url = $('[data-rq-url]').value.trim(); if (!url) return;
            $('[data-rq-info]').innerHTML = `<p class="muted">${esc(T('Lecture du manifeste…'))}</p>`; $('[data-rq-go]').disabled = true;
            try { info = await A().api('recueil_iiif_preview', {url}); }
            catch (e) { info = null; $('[data-rq-info]').innerHTML = `<div class="ui-msg is-error">⛔ ${esc(e.message)}</div>`; return; }
            const L = info.labels || [];
            $('[data-rq-info]').innerHTML = `<div class="rq-found"><b>${esc(info.title)}</b> · ${esc(T('{n} vues', {n: String(info.count)}))}${info.attribution ? `<br><small class="muted">${esc(info.attribution)}</small>` : ''}</div>
                <fieldset class="rq-range"><legend>${esc(T('Quelles vues ?'))}</legend><label><input type="radio" name="rq-which" value="all" checked> ${esc(T('Toutes ({n})', {n: String(info.count)}))}</label>
                <label><input type="radio" name="rq-which" value="some"> ${esc(T('De la vue'))} <input type="number" data-rq-from min="1" max="${info.count}" value="1"> ${esc(T('à la vue'))} <input type="number" data-rq-to min="1" max="${info.count}" value="${Math.min(info.count, 20)}"></label>
                <small class="muted">${esc(T('Les vues : {l}', {l: L.slice(0, 8).join(', ') + (L.length > 8 ? '…' : '')}))}</small></fieldset>
                ${info.count > 150 ? `<p class="ui-hint">⏳ ${esc(T('Beaucoup de vues : le téléchargement peut être long. Tu peux l’arrêter, ce qui est fait reste.'))}</p>` : ''}`;
            $('[data-rq-from]').addEventListener('focus', () => { dg.querySelector('[name=rq-which][value=some]').checked = true; });
            $('[data-rq-to]').addEventListener('focus', () => { dg.querySelector('[name=rq-which][value=some]').checked = true; });
            $('[data-rq-go]').disabled = false;
        };
        dg.addEventListener('click', async e => {
            if (e.target.closest('[data-rq-x]')) { if (busy) { stop = true; return; } return close(); }
            if (e.target.closest('[data-rq-look]')) return look();
            const go = e.target.closest('[data-rq-go]'); if (!go || !info) return;
            if (busy) { stop = true; go.disabled = true; return; }
            const some = dg.querySelector('[name=rq-which]:checked')?.value === 'some', n = info.count;
            const from = some ? Math.max(1, Math.min(n, Number($('[data-rq-from]').value) || 1)) : 1, to = some ? Math.max(from, Math.min(n, Number($('[data-rq-to]').value) || n)) : n;
            busy = true; stop = false; go.textContent = `■ ${T('Arrêter')}`; $('[data-rq-look]').disabled = true; $('[data-rq-url]').disabled = true;
            $('[data-rq-info]').insertAdjacentHTML('beforeend', `<p data-rq-prog>${esc(T('Téléchargement…'))} <progress max="${to - from + 1}" value="0"></progress> <span data-rq-n></span></p>`);
            let rid = 0, done = 0, title = info.title, err = '';
            try {
                while (!stop && done < to - from + 1) {
                    const r = await post('recueil_iiif_import', {url: $('[data-rq-url]').value.trim(), recueil_id: rid, from, to, done});
                    rid = r.recueil_id; done = r.done; title = r.title;
                    $('[data-rq-prog] progress').value = done; $('[data-rq-n]').textContent = T('{d} sur {n}', {d: String(done), n: String(to - from + 1)});
                    if (!r.media_ids.length) break;
                }
            } catch (e2) { err = e2.message; }
            busy = false; close();
            if (err) A().toast(T('Arrêté : {e}', {e: err}), 'error');
            if (!rid) return;
            A().undoToast?.(T('Recueil « {t} » : {n} vues', {t: title, n: String(done)}), {icon: '📚', undo: async () => { await post('delete_recueil', {id: rid}); onDone?.(0); }});
            onDone?.(rid);
        });
        $('[data-rq-url]').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); look(); } });
        return dg;
    }
    ext.recueilIiif = {open};
    if (!document.getElementById('rq-css')) { const st = document.createElement('style'); st.id = 'rq-css'; st.textContent = `
.rq-dlg{width:min(720px,96vw)}.rq-row{display:flex;gap:8px}.rq-row input{flex:1;min-width:0}.rq-found{margin:10px 0;padding:8px 10px;border:2px solid var(--line,#c9ced8)}
.rq-range{display:grid;gap:6px;border:0;padding:0;margin:8px 0}.rq-range input[type=number]{width:80px}[data-rq-prog] progress{width:min(320px,60%)}
`; document.head.appendChild(st); }
})();
