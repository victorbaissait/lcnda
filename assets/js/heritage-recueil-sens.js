/* LCNDA — 💡 Ce qu'on trouve dans un recueil, et les réglages des recueils (maquette docs/design/registres-etat-fonds.html, parties 7 et 8 ;
 * serveur : lib/recueil_sens.php). Calculé depuis ce qui est déjà transcrit : actes par année (les années sans acte hachurées), sortes,
 * personnes citées et reliées, noms, métiers, lieux, signatures, années couvertes ; remarques À VÉRIFIER (une année sans acte → « Marquer une
 * lacune » ; une année avec deux fois plus de décès). Pour un recueil (bloc du Résumé) et pour tous les recueils d'un service d'archives.
 * « ⚙️ Réglages des recueils » : le profil (Ma généalogie / Centre d'archives), les trous de numérotation, la fiabilité, les remarques, le
 * mode consultation.
 *   ext.recueilSens.block(ctx, el) · ext.recueilSens.serviceBlock(el, service) · ext.recueilSens.settings(after) · ext.recueilSens.opt(key)
 * Essai : tests/test-recueil-sens.js.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const T = (k, v) => (window.LCNDA_I18N?.t ? window.LCNDA_I18N.t(k, v) : String(k).replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? ''));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const plural = (n, one, many) => (A()?.plural ? A().plural(n, one, many) : `${n} ${n > 1 ? many : one}`);
    const kindLabel = k => (ext.actKindLabel ? ext.actKindLabel(k) : k);
    const KIND_COLOR = {naissance: '#055dff', bapteme: '#055dff', mariage: '#6929c4', deces: '#555', sepulture: '#555'};

    /* ─── les réglages (clés « genealogie-* » : gardés aussi dans la base) ─── */
    const KEYS = {profil: 'genealogie-recueils-profil', trous: 'genealogie-recueils-trous', fiabilite: 'genealogie-recueils-fiabilite', remarques: 'genealogie-recueils-remarques', cacher: 'genealogie-recueils-caches-consultation'};
    const read = k => { try { return localStorage.getItem(KEYS[k]); } catch (_) { return null; } };
    const write = (k, v) => { try { localStorage.setItem(KEYS[k], v); } catch (_) {} };
    /** opt('trous') → true si on signale les trous (conseillé) ; opt('profil') → 'genealogie' | 'archives' */
    const opt = k => (k === 'profil' ? (read('profil') === 'archives' ? 'archives' : 'genealogie') : read(k) !== '0');
    function settings(after) {
        const prof = opt('profil');
        ext.openDialog({eyebrow: T('📚 RECUEILS'), title: T('Réglages des recueils'), submitLabel: T('Enregistrer'),
            body: `<fieldset class="rf-comm-in"><legend>${esc(T('Profil'))}</legend>
                <label class="re-check"><input type="radio" name="profil" value="genealogie" ${prof === 'genealogie' ? 'checked' : ''}> 🧑 <b>${esc(T('Ma généalogie (conseillé)'))}</b></label>
                <label class="re-check"><input type="radio" name="profil" value="archives" ${prof === 'archives' ? 'checked' : ''}> 🏛 <b>${esc(T('Centre d’archives, association'))}</b></label>
                <small class="muted">${esc(T('Centre d’archives : la vue des fonds en premier, les colonnes support, état matériel, langue et réutilisation, et la fiche (« Où il est », « Qui peut le voir ») en tête du résumé des nouveaux recueils. Rien n’est caché pour de bon : on change d’avis quand on veut.'))}</small></fieldset>
                <div class="rf-opts">${[['trous', T('Me signaler les trous de numérotation (conseillé)')], ['fiabilite', T('Montrer la fiabilité de la lecture sur chaque page (conseillé)')], ['remarques', T('Montrer les remarques « à vérifier » (années sans acte, pics de décès) (conseillé)')], ['cacher', T('Mode consultation : cacher les recueils non communicables (conseillé)')]]
                    .map(([k, l]) => `<label class="re-check"><input type="checkbox" name="${k}" ${opt(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>`,
            onSubmit: async form => {
                const f = new FormData(form);
                write('profil', f.get('profil') === 'archives' ? 'archives' : 'genealogie');
                ['trous', 'fiabilite', 'remarques', 'cacher'].forEach(k => write(k, f.get(k) ? '1' : '0'));
                A().toast(T('Réglages des recueils enregistrés.')); after?.(); return true;
            }});
    }

    /* ─── le dessin ─── */
    function html(d, {title = '', gapBtn = true} = {}) {
        if (!d.acts) return `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">💡</span><span class="empty-line-text">${esc(T('Rien à montrer pour l’instant : transcris des actes dans l’Atelier (sur les photos des pages), l’app en tire les années, les noms, les métiers, les lieux.'))}</span></p>`;
        const years = d.years.length ? Array.from({length: d.years[1] - d.years[0] + 1}, (_, i) => d.years[0] + i) : [];
        const max = Math.max(1, ...Object.values(d.by_year).map(k => Object.values(k).reduce((a, b) => a + b, 0)));
        const hist = years.length > 1 && years.length <= 300 ? `<div class="rsn-hist" role="img" aria-label="${esc(T('Actes par année, de {a} à {b}', {a: String(d.years[0]), b: String(d.years[1])}))}">${years.map(y => {
            const k = d.by_year[y]; if (!k) return `<i class="is-gap" title="${esc(T('{y} : aucun acte', {y: String(y)}))}"></i>`;
            const tot = Object.values(k).reduce((a, b) => a + b, 0);
            return `<i style="height:${Math.max(4, tot / max * 100)}%" title="${esc(`${y} : ${Object.entries(k).map(([x, n]) => `${n} ${kindLabel(x)}`).join(', ')}`)}">${Object.entries(k).map(([x, n]) => `<b style="height:${n / tot * 100}%;background:${KIND_COLOR[x] || '#8a8f99'}"></b>`).join('')}</i>`; }).join('')}</div>
            <div class="rsn-hx"><span>${d.years[0]}</span><span>${d.years[1]}</span></div>` : '';
        const notes = opt('remarques') ? d.notes.map((n, i) => n.type === 'gap' ? `<div class="re-msg is-warn">⚠️ <b>${esc(n.from === n.to ? T('{y} : aucun acte', {y: String(n.from)}) : T('{a}-{b} : aucun acte', {a: String(n.from), b: String(n.to)}))}</b> — ${esc(T('registre perdu, ailleurs, ou pas encore transcrit ?'))}${gapBtn ? ` <button type="button" class="button small secondary" data-rsn-gap="${i}">${esc(T('Marquer une lacune'))}</button>` : ''}</div>`
            : `<div class="re-msg">📈 <b>${esc(T('{y} : {n} décès ou sépultures', {y: String(n.year), n: String(n.n)}))}</b> — ${esc(T('au moins deux fois plus que d’habitude ({m}) : épidémie, disette, guerre ? À vérifier.', {m: String(n.median)}))}</div>`).join('') : '';
        const list = (o, max = 8) => Object.entries(o).slice(0, max).map(([k, n]) => `${esc(k)} <small class="muted">(${n})</small>`).join(' · ');
        const row = (k, v) => (v ? `<dt>${esc(T(k))}</dt><dd>${v}</dd>` : '');
        const signTot = d.signs + d.nosign;
        return `${title}${hist}${notes}<dl class="rf-dl">
            ${row('Actes transcrits', String(d.acts))}${row('Sortes d’actes', Object.entries(d.kinds).map(([k, n]) => `${n} ${esc(kindLabel(k))}`).join(' · '))}
            ${row('Personnes citées', esc(T('{n} ({l} reliées à une fiche)', {n: String(d.people), l: String(d.linked)})))}${row('Noms les plus fréquents', list(d.names))}
            ${row('Métiers', list(d.jobs))}${row('Lieux', list(d.places))}${row('Signatures', signTot ? esc(T('{p} % signent ({s} sur {t} actes qui le disent)', {p: String(Math.round(d.signs / signTot * 100)), s: String(d.signs), t: String(signTot)})) : '')}
            ${row('Années couvertes', d.years.length ? esc(`${d.years[0]}–${d.years[1]}`) + (d.gaps.length ? ` · <span class="muted">${esc(T('sans acte : {x}', {x: d.gaps.map(g => (g[0] === g[1] ? g[0] : `${g[0]}-${g[1]}`)).join(', ')}))}</span>` : '') : '')}</dl>
            <p class="muted rsn-note">${esc(T('Calculé depuis les actes transcrits dans l’Atelier : ce n’est jamais affirmé, c’est à vérifier.'))}</p>`;
    }
    function bindGaps(el, d, {recueil = null, service = null} = {}) {
        el.querySelectorAll('[data-rsn-gap]').forEach(b => b.addEventListener('click', async () => {
            const n = d.notes[Number(b.dataset.rsnGap)]; if (!n) return;
            const span = n.from === n.to ? String(n.from) : `${n.from}-${n.to}`;
            const what = recueil ? recueil.title : (service?.name || '');
            try {
                const r = await A().api('save_archive_digest_gap', {}, {method: 'POST', body: {gap_type: 'missing_period', period_text: span, title: T('{w} : aucun acte en {y}', {w: what, y: span}), notes: recueil?.reference ? `${T('Cote', {ctx: 'archives'})} : ${recueil.reference}` : '', status: 'open'}});
                const id = (r.result || r).id;
                A().undoToast?.(T('Lacune ajoutée : Recherche › Suivi des registres › Lacunes d’archives.'), {undo: async () => { await A().api('delete_archive_digest_gap', {}, {method: 'POST', body: {id}}); }});
                b.disabled = true; b.textContent = '✓ ' + T('Lacune notée');
            } catch (e) { A().toast(e.message, 'error'); }
        }));
    }
    /** le bloc du Résumé d'un recueil */
    function block(ctx, el) {
        const r = ctx.D().recueil;
        A().api('recueil_sens', {id: r.id}).then(d => { if (!el.isConnected) return; el.innerHTML = html(d); bindGaps(el, d, {recueil: r}); })
            .catch(e => { if (el.isConnected) el.innerHTML = `<p class="muted">${esc(e.message || '')}</p>`; });
        return `<p class="muted">${esc(T('Calcul…'))}</p>`;
    }
    /** sur la page d'un service d'archives : tous ses recueils ensemble */
    async function serviceBlock(el, s) {
        if (!el) return;
        let d; try { d = await A().api('recueil_sens', {service: s.id}); } catch (_) { el.hidden = true; return; }
        if (!el.isConnected || !d.recueils || !d.acts) { el.hidden = true; return; }
        el.hidden = false;
        el.innerHTML = `<header class="card-head"><div class="card-title"><h3>💡 ${esc(T('Ce qu’on trouve chez eux'))} <small>(${esc(plural(d.recueils, 'recueil', 'recueils'))})</small></h3></div></header><div class="card-body">${html(d)}</div>`;
        bindGaps(el, d, {service: s});
    }
    ext.recueilSens = {block, serviceBlock, settings, opt, html};
})();
