/* LCNDA — 🏛 La fiche d'identité d'un recueil (maquette docs/design/registres-etat-fonds.html, partie 5 ; serveur : lib/recueil_fiche.php).
 * Où il est (service d'archives de la liste qui existe, fonds, série, cote, lien en ligne, lien d'une vue et décalage vue ↔ page, autre
 * exemplaire), la citation prête à copier, qui peut le voir (communicabilité calculée ou choisie, réutilisation, mode consultation), le support,
 * l'état matériel, la langue, l'écriture, la provenance ; et, sur la page d'un service d'archives, les recueils chez eux et leurs lacunes.
 *   ext.recueilFiche.fields(r)            → les champs de la fenêtre « Modifier le recueil » (repliés sous « 🏛 Où il est, qui peut le voir »)
 *   ext.recueilFiche.bind(dialog, r)      → remplit la liste « Autre exemplaire », montre / cache « jusqu'en »
 *   ext.recueilFiche.block(type, ctx)     → blocs du Résumé « 🏛 Où il est » et « 🔐 Qui peut le voir »
 *   ext.recueilFiche.pageLinks(el, p, ctx)→ « ↗ Vue 23 en ligne » et « ⧉ Citer cette page » sur la page ouverte
 *   ext.recueilFiche.serviceSection(el, s)→ « 📚 Recueils chez eux » sur la page d'un service d'archives
 * Essai : tests/test-recueil-fiche.js.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const T = (k, v) => (window.LCNDA_I18N?.t ? window.LCNDA_I18N.t(k, v) : String(k).replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? ''));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (m, k) => A()?.toast?.(m, k);
    const safeUrl = u => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');
    const REUSE = [['', 'Pas dit'], ['etalab', 'Licence ouverte (Etalab)'], ['cc-by', 'CC BY'], ['cc-by-sa', 'CC BY-SA'], ['cc-by-nc', 'CC BY-NC'], ['public', 'Domaine public'], ['reserve', 'Tous droits réservés'], ['demander', 'À demander au service'], ['autre', 'Autre']];
    const SUPPORT = [['', 'Pas dit'], ['papier', 'Papier'], ['parchemin', 'Parchemin'], ['microfilm', 'Microfilm'], ['numerique', 'Numérique'], ['autre', 'Autre']];
    const STATE = [['', 'Pas dit'], ['bon', 'Bon'], ['abime', 'Abîmé'], ['fragile', 'Fragile (ne pas manipuler)'], ['a_restaurer', 'À restaurer'], ['restaure', 'Restauré']];
    const LANGS = ['Français', 'Latin', 'Occitan', 'Breton', 'Alsacien', 'Allemand', 'Italien', 'Espagnol', 'Catalan', 'Flamand', 'Basque'];
    const SCRIPTS = ['Cursive moderne', 'Cursive XVIIIᵉ', 'Écriture secrétaire', 'Gothique', 'Kurrent (allemande)', 'Imprimé', 'Dactylographié'];
    const HIDE_KEY = 'genealogie-recueils-caches-consultation';
    const label = (list, k) => T(list.find(x => x[0] === k)?.[1] || '');
    const opts = (list, cur) => list.map(([k, l]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${esc(T(l))}</option>`).join('');

    /* ─── la citation et le lien d'une vue ─── */
    function viewNum(r, p) { return p ? p.num + (Number(r.view_offset) || 0) : 0; }
    function viewUrl(r, p) { const n = viewNum(r, p); return r.view_url && n > 0 ? r.view_url.replaceAll('{n}', String(n)) : ''; }
    /** « AD Cher, 3 E 1234, f° 11 r° (vue 23) » */
    function citation(r, p = null) {
        const svc = r.service ? (r.service.short_name || r.service.name) : (r.place_text || '');
        const where = p ? (p.label || (['liasse', 'archives'].includes(r.numbering) ? T('pièce {n}', {n: String(p.num)}) : T('p. {x}', {x: String(p.num)}))) : '';
        const vue = p && r.view_url ? T('vue {n}', {n: String(viewNum(r, p))}) : '';
        return [svc, r.fonds && !r.reference ? r.fonds : '', r.reference || '', where].filter(Boolean).join(', ') + (vue ? ` (${vue})` : '') || r.title;
    }
    async function copy(text) {
        try { await navigator.clipboard.writeText(text); toast(T('Copié : {x}', {x: text})); }
        catch (_) { A().askText ? A().askText({title: T('Citer'), message: T('Copie le texte :'), value: text, okLabel: T('Fermer')}) : toast(text); }
    }

    /* ─── qui peut le voir ─── */
    function commHtml(r) {
        const c = r.communicability || {}, kinds = (c.kinds || []).map(k => (ext.actKindLabel ? ext.actKindLabel(k) : k)).join(', ');
        if (c.state === 'free') return `<p class="rf-comm is-ok">✓ <b>${esc(T('Communicable'))}</b>${c.mode === 'libre' ? ` — ${esc(T('choisi'))}` : c.mode === 'reserve' ? ` — ${esc(T('le délai est passé ({y})', {y: c.until || r.comm_until}))}` : c.last_year ? ` — ${esc(T('acte le plus récent : {y} ; délai {d} ans', {y: String(c.last_year), d: String(c.delay)}))}` : ''}</p>`;
        if (c.state === 'reserved') return `<p class="rf-comm is-lock">🔒 <b>${esc(c.until ? T('Réservé jusqu’en {y}', {y: c.until}) : T('Réservé'))}</b>${c.mode ? ` — ${esc(T('choisi'))}` : c.last_year ? ` — ${esc(T('acte le plus récent : {y} ; délai {d} ans ({k})', {y: String(c.last_year), d: String(c.delay), k: kinds || T('sorte d’acte pas dite : 75 ans par prudence')}))}` : ''}</p>`;
        if (c.state === 'authorization') return `<p class="rf-comm is-lock">🔐 <b>${esc(T('Sur autorisation'))}</b></p>`;
        return `<p class="rf-comm">❔ <b>${esc(T('À vérifier'))}</b> — ${esc(T('écris les années du recueil (ou fais son sommaire) pour que l’app calcule'))}</p>`;
    }
    const LAW = 'Règle (Code du patrimoine, L213-2) : tout de suite dans le cas général et pour les actes de décès ; 50 ans (vie privée, documents militaires) ; 75 ans (naissances, mariages, notaires, recensements) ; 100 ans si des mineurs sont concernés ; 120 ans après la naissance pour les dossiers médicaux. L’app propose, tu corriges : le service d’archives a le dernier mot.';

    /* ─── la fenêtre du recueil ─── */
    function fields(r) {
        const open = !!(r && (r.archive_service_id || r.fonds || r.series || r.url || r.view_url || r.comm_mode || r.reuse || r.support || r.material_state || r.language || r.script || r.provenance || r.digitized_by || r.twin_id || r.twin_text));
        const P = window.LCNDA_PICKER, mode = r?.comm_mode || '';
        return `<details class="rf-box" ${open ? 'open' : ''}><summary><b>🏛 ${esc(T('Où il est, qui peut le voir'))}</b> <small class="muted">${esc(T('service d’archives, fonds, liens, communicabilité, support…'))}</small></summary>
            <div class="form-grid rf-grid">
                <div class="span-2"><span class="pk-lab">🏛 ${esc(T('Service d’archives'))}</span>${P?.pickerField ? P.pickerField({name: 'archive_service_id', kind: 'archive_service', allowCreate: true, value: Number(r?.archive_service_id) || null}) : `<input name="archive_service_id" type="number" value="${esc(r?.archive_service_id || '')}">`}
                    <small class="muted">${esc(T('Dans la liste de Réglages › Services d’archives ; « Lieu de conservation » reste pour un texte libre.'))}</small></div>
                <label>${esc(T('Fonds'))}<input name="fonds" maxlength="300" value="${esc(r?.fonds || '')}" placeholder="${esc(T('ex. Fonds de la paroisse de Sancoins'))}"></label>
                <label>${esc(T('Série · sous-série'))}<input name="series" maxlength="200" value="${esc(r?.series || '')}" placeholder="${esc(T('ex. E · 3 E (état civil)'))}"></label>
                <label class="span-2">${esc(T('Lien en ligne du recueil'))}<input name="url" type="url" maxlength="1000" value="${esc(r?.url || '')}" placeholder="https://archives.exemple.fr/ark:/…"></label>
                <label>${esc(T('Lien d’une vue ({n} = numéro de la vue)'))}<input name="view_url" maxlength="1000" value="${esc(r?.view_url || '')}" placeholder="https://…/vue/{n}"></label>
                <label>${esc(T('Vue = page + …'))}<input name="view_offset" type="number" min="-10000" max="10000" value="${esc(r?.view_offset || 0)}"><small class="muted">${esc(T('ex. 2 si la vue 1 est la couverture et la vue 2 une page blanche'))}</small></label>
                <label>${esc(T('Autre exemplaire (un autre recueil)'))}<select name="twin_id" data-rf-twin><option value="0">${esc(T('— aucun —'))}</option>${r?.twin_id ? `<option value="${r.twin_id}" selected>${esc(r.twin?.title || '…')}</option>` : ''}</select></label>
                <label>${esc(T('… ou décrit'))}<input name="twin_text" maxlength="300" value="${esc(r?.twin_text || '')}" placeholder="${esc(T('ex. Collection du greffe, AD 18, 3 E 1235'))}"></label>
                <fieldset class="span-2 rf-comm-in"><legend>🔐 ${esc(T('Communicabilité'))}</legend>
                    ${[['', T('Calculée d’après les années et les sortes d’actes (conseillé)')], ['libre', T('Libre')], ['reserve', T('Réservée jusqu’en…')], ['autorisation', T('Sur autorisation')]].map(([k, l]) => `<label class="re-check"><input type="radio" name="comm_mode" value="${k}" ${mode === k ? 'checked' : ''}> ${esc(l)}</label>`).join('')}
                    <label class="re-field" data-rf-until ${mode === 'reserve' ? '' : 'hidden'}>${esc(T('Jusqu’en (année)'))}<input name="comm_until" inputmode="numeric" maxlength="4" value="${esc(r?.comm_until || '')}" placeholder="2045"></label>
                    <small class="muted">${esc(T(LAW))}</small></fieldset>
                <label>${esc(T('Réutilisation'))}<select name="reuse">${opts(REUSE, r?.reuse || '')}</select></label>
                <label>${esc(T('Support'))}<select name="support">${opts(SUPPORT, r?.support || '')}</select></label>
                <label>${esc(T('État matériel'))}<select name="material_state">${opts(STATE, r?.material_state || '')}</select></label>
                <label>${esc(T('Langue'))}<input name="language" list="rf-langs" maxlength="100" value="${esc(r?.language || '')}"></label>
                <label>${esc(T('Écriture'))}<input name="script" list="rf-scripts" maxlength="100" value="${esc(r?.script || '')}"></label>
                <label>${esc(T('Numérisé par'))}<input name="digitized_by" maxlength="300" value="${esc(r?.digitized_by || '')}" placeholder="${esc(T('ex. AD 18 (2009), moi (2026)'))}"></label>
                <label class="span-2">${esc(T('Provenance'))}<input name="provenance" maxlength="500" value="${esc(r?.provenance || '')}" placeholder="${esc(T('ex. Dépôt de la commune, 1952'))}"></label>
                <datalist id="rf-langs">${LANGS.map(l => `<option value="${esc(T(l))}">`).join('')}</datalist><datalist id="rf-scripts">${SCRIPTS.map(l => `<option value="${esc(T(l))}">`).join('')}</datalist>
            </div></details>`;
    }
    async function bind(dlg, r) {
        dlg.addEventListener('change', e => { if (e.target.name === 'comm_mode') { const u = dlg.querySelector('[data-rf-until]'); if (u) u.hidden = e.target.value !== 'reserve'; } });
        const sel = dlg.querySelector('[data-rf-twin]'); if (!sel) return;
        try {
            const list = ((await A().api('recueils')).recueils || []).filter(x => x.id !== r?.id);
            const cur = Number(sel.value) || 0;
            sel.innerHTML = `<option value="0">${esc(T('— aucun —'))}</option>${list.map(x => `<option value="${x.id}" ${x.id === cur ? 'selected' : ''}>${esc(x.title)}${x.reference ? ` (${esc(x.reference)})` : ''}</option>`).join('')}`;
        } catch (_) {}
    }

    /* ─── les blocs du Résumé ─── */
    function block(type, ctx) {
        const r = ctx.D().recueil, row = (k, v) => (v ? `<dt>${esc(k === 'Cote' ? T('Cote', {ctx: 'archives'}) : T(k))}</dt><dd>${v}</dd>` : '');
        if (type === 'where') {
            const svc = r.service ? `<button type="button" class="link-button" data-rf-svc="${r.service.id}">🏛 ${esc(r.service.name)}</button>${safeUrl(r.service.search_url) ? ` · <a href="${esc(safeUrl(r.service.search_url))}" target="_blank" rel="noopener noreferrer">${esc(T('Registres en ligne'))} ↗</a>` : ''}` : esc(r.place_text || '');
            const twin = r.twin ? `<button type="button" class="link-button" data-open-recueil="${r.twin.id}">↪ ${esc(r.twin.title)}${r.twin.reference ? ` (${esc(r.twin.reference)})` : ''}</button>` : esc(r.twin_text || '');
            const body = row('Service d’archives', svc) + row('Fonds', esc(r.fonds)) + row('Série', esc(r.series)) + row('Cote', esc(r.reference)) + row('Dates', esc(r.date_text))
                + row('En ligne', safeUrl(r.url) ? `<a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener noreferrer">${esc(String(r.url).replace(/^https?:\/\//, '').slice(0, 60))} ↗</a>` : '')
                + row('Lien d’une vue', r.view_url ? esc(T('vue = page + {n}', {n: String(r.view_offset || 0)})) : '') + row('Autre exemplaire', twin);
            return `${body ? `<dl class="rf-dl">${body}</dl>` : `<p class="muted">${esc(T('Pas encore dit : « Modifier » → « 🏛 Où il est, qui peut le voir ».'))}</p>`}
                <p class="rf-cite"><span class="muted">${esc(T('Citer :'))}</span> <q>${esc(citation(r))}</q> <button type="button" class="button small secondary" data-rf-cite>⧉ ${esc(T('Copier'))}</button></p>`;
        }
        if (type === 'access') {
            let hide = true; try { hide = localStorage.getItem(HIDE_KEY) !== '0'; } catch (_) {}
            const body = row('Réutilisation', esc(label(REUSE, r.reuse))) + row('Support', esc(label(SUPPORT, r.support))) + row('État matériel', esc(label(STATE, r.material_state)))
                + row('Langue', esc(r.language)) + row('Écriture', esc(r.script)) + row('Provenance', esc(r.provenance)) + row('Numérisé par', esc(r.digitized_by || (ctx.D().versions || []).map(v => v.name).join(', ')));
            return `${commHtml(r)}${body ? `<dl class="rf-dl">${body}</dl>` : ''}
                <label class="ui-toggle rf-hide"><input type="checkbox" data-rf-hide ${hide ? 'checked' : ''}><i></i>${esc(T('Mode consultation : cacher les recueils non communicables (conseillé)'))}</label>`;
        }
        return '';
    }
    function bindBlocks(root, ctx) {
        root.querySelectorAll('[data-rf-cite]').forEach(b => b.addEventListener('click', () => copy(citation(ctx.D().recueil))));
        root.querySelectorAll('[data-rf-svc]').forEach(b => b.addEventListener('click', () => ext.archiveServices?.open?.(Number(b.dataset.rfSvc))));
        root.querySelectorAll('[data-rf-hide]').forEach(c => c.addEventListener('change', () => { try { localStorage.setItem(HIDE_KEY, c.checked ? '1' : '0'); } catch (_) {} toast(c.checked ? T('En mode consultation, les recueils non communicables sont cachés.') : T('En mode consultation, tous les recueils sont montrés.')); }));
    }

    /* ─── sur la page ouverte ─── */
    function pageLinks(el, p, ctx) {
        if (!el || !p) return;
        const r = ctx.D().recueil, url = viewUrl(r, p);
        el.innerHTML = `<div class="rf-page">${url ? `<a class="button small secondary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">↗ ${esc(T('Vue {n} en ligne', {n: String(viewNum(r, p))}))}</a>` : ''}<button type="button" class="button small secondary" data-rf-pcite title="${esc(citation(r, p))}">⧉ ${esc(T('Citer cette page'))}</button></div>`;
        el.querySelector('[data-rf-pcite]').addEventListener('click', () => copy(citation(r, p)));
    }

    /* ─── 🏛 sur la page d'un service d'archives : ses recueils, et les lacunes ─── */
    async function serviceSection(el, s) {
        if (!el) return;
        let d; try { d = await A().api('archive_service_recueils', {id: s.id}); } catch (_) { el.hidden = true; return; }
        if (!el.isConnected) return;
        const rs = d.recueils || [], gaps = d.gaps || [];
        const pct = x => { const e = x.etat; if (!e) return 0; const live = e.todo + e.doing + e.checked + e.done; return live ? Math.round((e.done + e.checked) / live * 100) : 0; };
        const comm = x => (x.communicability?.state === 'reserved' ? `🔒 ${esc(x.communicability.until ? T('jusqu’en {y}', {y: x.communicability.until}) : T('Réservé'))}` : x.communicability?.state === 'authorization' ? `🔐 ${esc(T('Sur autorisation'))}` : x.communicability?.state === 'free' ? `✓ ${esc(T('Communicable'))}` : '❔');
        const total = rs.reduce((a, x) => a + x.pages, 0), done = rs.reduce((a, x) => a + (x.etat ? x.etat.done + x.etat.checked : 0), 0), absent = rs.reduce((a, x) => a + (x.etat?.absent || 0), 0);
        el.hidden = false;
        el.innerHTML = `<header class="card-head"><div class="card-title"><h3>📚 ${esc(T('Recueils chez eux'))} <small>(${rs.length})</small></h3></div></header><div class="card-body">
            ${rs.length ? `<p class="muted">${esc(T('{p} pages · {d} finies ou relues · {a} absentes', {p: String(total), d: String(done), a: String(absent)}))}</p>
            <div class="h-asv-tablewrap"><table class="data-table rf-svc" data-cols-off><thead><tr><th>${esc(T('Recueil'))}</th><th>${esc(T('Fonds · série'))}</th><th>${esc(T('Cote', {ctx: 'archives'}))}</th><th>${esc(T('Dates'))}</th><th>${esc(T('Pages'))}</th><th>${esc(T('Transcrit · relu'))}</th><th>${esc(T('Communicable'))}</th></tr></thead><tbody>
            ${rs.map(x => `<tr><td><button type="button" class="table-link" data-open-recueil="${x.id}">${esc(x.icon || '📚')} ${esc(x.title)}</button>${safeUrl(x.url) ? ` <a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer" title="${esc(T('En ligne'))}">↗</a>` : ''}</td><td>${esc([x.fonds, x.series].filter(Boolean).join(' · '))}</td><td>${esc(x.reference)}</td><td>${esc(x.date_text)}</td>
                <td class="num">${x.pages}${x.expected ? ` / ${x.expected}` : ''}</td><td><span class="rs-bar"><i class="${pct(x) === 100 ? 'is-full' : ''}" style="width:${pct(x)}%"></i></span> ${pct(x)} %</td><td>${comm(x)}</td></tr>`).join('')}</tbody></table></div>`
            : A().empty(T('Aucun recueil relié à ce service : dans un recueil, « Modifier » → « 🏛 Où il est » → Service d’archives.'), {icon: '📚'})}
            ${gaps.length ? `<h4 class="rf-gaps-h">🕳 ${esc(T('Lacunes ({n})', {n: String(gaps.length)}))}</h4><ul class="rf-gaps">${gaps.slice(0, 30).map(g => `<li>${g.status === 'closed' ? '✓' : '•'} ${esc(g.title)}${g.period ? ` <small class="muted">${esc(g.period)}</small>` : ''}</li>`).join('')}</ul>` : ''}</div>`;
    }

    ext.recueilFiche = {fields, bind, block, bindBlocks, pageLinks, serviceSection, citation, viewUrl};
})();
