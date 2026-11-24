/* LCNDA — ⚖️ Généalogiste successoral, le droit en plus : deux onglets du dossier (maquette docs/design/idees-suite.html, partie 3).
 *  ⚖️ Droit et parts : la loi de l'époque du décès (conjoint en usufruit, enfants naturels ou adultérins, filiation à corriger),
 *     les successions en cascade, le régime matrimonial, le testament et les donations (réserve, quotité disponible, réduction),
 *     les droits du conjoint et le droit de retour, une estimation des droits de succession et des délais, un défunt à l'étranger ;
 *     les montants sont retapés à chaque fois, jamais gardés (comme l'actif net) ; tout est « indicatif, à vérifier par le notaire ».
 *  🗂 Suivi des héritiers : des colonnes (à trouver → trouvé → contacté → contrat signé → pièces reçues), à glisser ou à choisir,
 *     la prochaine chose à faire, la date de relance, et 🔎 les sources cherchées pour chaque héritier.
 * Calcul : heritage-successoral-droit-core.js (window.LCNDA_SUCC_DROIT) ; serveur : lib/successoral_droit.php (op p2_droit_save).
 * Essai : tests/test-successoral-droit.js.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI || {}, S = () => window.LCNDA_SUCC_CORE, DR = () => window.LCNDA_SUCC_DROIT;
    const T = (k, v) => (window.LCNDA_I18N?.t ? window.LCNDA_I18N.t(k, v) : String(k).replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? ''));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const post = async body => { const r = await A().api('successoral_write', {}, {method: 'POST', body}); return r.result || r; };
    const hidden = () => document.body?.classList.contains('is-kiosk') || document.documentElement.classList.contains('ms-open');
    const eur = n => (Number.isFinite(Number(n)) ? new Intl.NumberFormat(window.LCNDA_I18N?.intlLocale?.() || 'fr-FR', {style: 'currency', currency: 'EUR', maximumFractionDigits: 0}).format(Number(n)) : '—');
    const pct = f => { const D = DR(); const x = typeof f === 'string' ? D.parse(f) : f; return `${(Math.round(D.num(x) * 10000) / 100).toLocaleString('fr-FR')} %`; };
    const nameOf = (D, id) => (S()?.name ? S().name(D.graph?.persons?.[id]) : String(id));
    const badge = (t, k = 'grey') => (UI().badge ? UI().badge(t, k) : `<span class="ui-badge is-${k}">${esc(t)}</span>`);
    const notice = (k, html) => (UI().notice ? UI().notice(k, html) : `<p>${html}</p>`);

    /* ═════ les onglets ═════ */
    const SP = ext.succPlus2 = ext.succPlus2 || {};
    const prevTabs = SP.tabs, prevTab = SP.tab;
    SP.tabs = T0 => {
        const list = prevTabs ? prevTabs(T0) : T0, out = [...list];
        if (hidden() || !DR()) return out;
        const ih = out.findIndex(t => t[0] === 'heirs'); out.splice(ih + 1, 0, ['droit', '⚖️ Droit et parts']);
        const ic = out.findIndex(t => t[0] === 'contacts'); out.splice(ic + 1, 0, ['suivi', '🗂 Suivi des héritiers']);
        return out;
    };
    const prevAfter = SP.after;
    SP.after = (tab, body, D, R, P_) => {
        try { prevAfter?.(tab, body, D, R, P_); } catch (e) { console.error(e); }
        if (tab !== 'notary' || hidden() || !ext.openTextDoc || !ext.textDocTools?.dataOf) return;
        const pv = body.querySelector('.succ-npreview'); if (!pv || body.querySelector('[data-sd-wp]')) return;
        pv.insertAdjacentHTML('beforebegin', `<p><button type="button" class="button small secondary" data-sd-wp>📝 ${esc(T('Dans le traitement de texte (modifiable, puis Word ou PDF)'))}</button></p>`);
        body.querySelector('[data-sd-wp]').addEventListener('click', () => ext.openTextDoc({data: ext.textDocTools.dataOf(pv.innerHTML), name: T('Dévolution — {t}', {t: D.title || ''})}));
    };
    SP.tab = (k, body, D, R, P_) => { if (k === 'droit') return tabDroit(body, D, R); if (k === 'suivi') return tabSuivi(body, D, R); return prevTab?.(k, body, D, R, P_); };

    /* ═════ ce que le dossier garde ═════ */
    const droitOf = D => ({law: 'auto', matrim: 'communaute', attribution: false, residence: '', nationalite: '', biens_etranger: false, spouse_donation: '', spouse_age: 0, cascade: true, filiation: {}, handicap: [], ...(D.options?.droit || {})});
    const suiviOf = D => ({...(D.options?.suivi || {})});
    async function save(D, key, value, {label = '', redraw = null} = {}) {
        try {
            const r = await post({op: 'p2_droit_save', case_id: D.id, key, value}); D.options = {...(D.options || {}), [key]: r.value}; redraw?.();
            if (label) A().undoToast?.(label, {undo: async () => { const b = await post({op: 'p2_droit_save', case_id: D.id, key, value: r.before || {}}); D.options = {...D.options, [key]: b.value}; redraw?.(); }});
        } catch (e) { A().toast(e.message, 'error'); }
    }
    // les montants : seulement le temps que l'onglet est ouvert (jamais gardés)
    const MEM = new Map(); const mem = D => { if (!MEM.has(D.id)) MEM.set(D.id, {net: '', propres: '', communs: '', donations: [], legs: []}); return MEM.get(D.id); };

    /* ═════ ⚖️ Droit et parts ═════ */
    function recompute(D, extra = {}) {
        const statuses = {}, spouse = {}; for (const [pid, o] of Object.entries(D.overrides || {})) { if (o.status || o.adoption) statuses[pid] = {status: o.status, adoption: o.adoption}; if (o.spouse) spouse[pid] = o.spouse; }
        return S().compute(D.graph, {deceasedId: D.deceased_id, deathDate: D.death_iso || '', overrides: statuses, spouse: {...spouse, ...(extra.spouse || {})}, t: T, excludePrivate: D.count_private === false, ...(extra.deceasedId ? {deceasedId: extra.deceasedId, deathDate: extra.deathDate} : {})});
    }
    function tabDroit(body, D, R) {
        const X = DR(), dr = droitOf(D), m = mem(D), ro = D.archived || D.state === 'archive' || ['clos'].includes(D.state);
        const regime = dr.law === 'today' ? 'today' : X.regimeOf(R.deathDate || D.death_iso);
        const H = X.historical(R, D.graph, {overrides: Object.fromEntries(Object.entries(dr.filiation).map(([k, v]) => [k, {filiation: v}])), regime, recompute: e => recompute(D, e), t: T});
        let shares = H.shares.filter(s => !s.usufruct || s.share.n);
        const C = dr.cascade !== false ? X.cascade(shares, D.graph, {deathDate: R.deathDate || D.death_iso, compute: (g, o) => recompute(D, o), after: Object.entries(D.overrides || {}).filter(([, o]) => o.status === 'dead_after').map(([k]) => Number(k)), t: T}) : null;
        if (C && C.steps.length) shares = C.shares;
        const rowOf = id => R.rows.find(r => r.id === Number(id)) || {};
        const kids = R.order === 1 ? R.rows.filter(r => r.a === 0 && r.b === 1) : [];
        const usu = H.shares.find(s => s.usufruct);
        const spouseRow = R.rows.find(r => r.role === 'spouse');
        // le régime matrimonial et le testament (montants en mémoire)
        const reg = X.regime({kind: dr.matrim, propres: m.propres, communs: m.communs, attribution: dr.attribution, t: T});
        const netTyped = m.net !== '' ? Number(m.net) : (m.propres !== '' || m.communs !== '' ? reg.succession : NaN);
        const L = Number.isFinite(netTyped) ? X.liberalites({net: netTyped, shares: shares.map(s => ({id: s.id, share: s.share, role: s.role})), childrenCount: kids.length, spouseId: spouseRow?.id || 0, donations: m.donations, legs: m.legs, spouseDonation: dr.spouse_donation, usufructAge: dr.spouse_age || 70, t: T}) : null;
        const heirOpts = sel => R.rows.filter(r => r.role !== 'spouse' || true).map(r => `<option value="${r.id}" ${Number(sel) === r.id ? 'selected' : ''}>${esc(r.name)} (${esc(r.kin)})</option>`).join('');
        const dl = X.delais(D.death_iso, {abroad: !!dr.residence && !/^(fr|france)$/i.test(dr.residence)});
        const tax = L ? L.rows.filter(r => r.aRecevoir > 0).map(r => { const row = rowOf(r.id), lien = row.id ? X.lienOf(row) : 'autre', d = X.droits(r.aRecevoir + r.usufruit, lien, {handicap: dr.handicap.includes(r.id)}); return {r, row, lien, d}; }) : [];
        const LIEN = {conjoint: 'conjoint (exonéré)', enfant: 'ligne directe', parent: 'ligne directe', petitenfant: 'petit-enfant', frere: 'frère ou sœur', neveu: 'neveu ou nièce', parent4: 'parent jusqu’au 4e degré', autre: 'autre'};
        body.innerHTML = `<div class="sd">${notice('warn', esc(T('Calculs indicatifs, à faire vérifier par le notaire. Les montants tapés ici ne sont jamais gardés.')))}
            <section class="sd-sec"><h3>⚖️ ${esc(T('La loi appliquée'))}</h3>
                <p><b>${esc(H.label)}</b>${D.death_iso ? ` · ${esc(T('décès le {d}', {d: D.death_iso}))}` : ''}</p>
                <label class="sd-row">${esc(T('Calculer selon'))} <select data-sd="law" ${ro ? 'disabled' : ''}><option value="auto" ${dr.law !== 'today' ? 'selected' : ''}>${esc(T('La loi du jour du décès (recommandé)'))}</option><option value="today" ${dr.law === 'today' ? 'selected' : ''}>${esc(T('La loi d’aujourd’hui'))}</option></select></label>
                ${H.notes.map(n => `<p class="muted">• ${esc(n)}</p>`).join('')}${H.warnings.map(w => notice('warn', esc(w))).join('')}
                ${kids.length && regime !== 'today' && regime !== 'y2002' ? `<h4>${esc(T('La filiation des enfants (déduite des mariages, à corriger)'))}</h4><table class="sd-t"><tbody>${kids.map(k => { const f = X.filiationOf(D.graph, D.deceased_id, k.id, Object.fromEntries(Object.entries(dr.filiation).map(([a, b]) => [a, {filiation: b}]))); return `<tr><td>${esc(k.name)}</td><td><select data-sd-fil="${k.id}" ${ro ? 'disabled' : ''}>${[['legitime', 'Légitime (né du mariage)'], ['naturelle', 'Naturel (parents non mariés)'], ['adulterine', 'Adultérin (un parent marié à quelqu’un d’autre)']].map(([v, l]) => `<option value="${v}" ${f === v ? 'selected' : ''}>${esc(T(l))}</option>`).join('')}</select></td></tr>`; }).join('')}</tbody></table>` : ''}
                <table class="sd-t"><thead><tr><th>${esc(T('Héritier'))}</th><th>${esc(T('Lien'))}</th><th>${esc(T('Part'))}</th></tr></thead><tbody>${H.shares.map(s => `<tr><td>${esc(nameOf(D, s.id))}</td><td>${esc(rowOf(s.id).kin || '')}</td><td>${s.usufruct ? esc(T('usufruit de {u}', {u: pct(s.usufruct)})) : `${esc(X.str(s.share))} · ${pct(s.share)}`}</td></tr>`).join('')}</tbody></table></section>
            ${R.hypotheses?.length ? `<section class="sd-sec"><h3>🔀 ${esc(T('Les hypothèses côte à côte'))}</h3><div class="sd-scroll"><table class="sd-t"><thead><tr><th>${esc(T('Héritier'))}</th><th>${esc(T('Calcul principal'))}</th>${R.hypotheses.map((h, i) => `<th title="${esc(h.label)}">${String.fromCharCode(66 + i)}</th>`).join('')}</tr></thead><tbody>${[...new Set([...R.rows.filter(r => r.share !== '0').map(r => r.id), ...R.hypotheses.flatMap(h => h.shares.map(x => x.id))])].map(id => `<tr><td>${esc(nameOf(D, id))}</td><td>${esc(R.rows.find(r => r.id === id)?.share || '—')}</td>${R.hypotheses.map(h => `<td>${esc(h.shares.find(x => x.id === id)?.share || '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${R.hypotheses.map((h, i) => `<p class="muted">${String.fromCharCode(66 + i)} : ${esc(h.label)}</p>`).join('')}</section>` : ''}
            <section class="sd-sec"><h3>📄 ${esc(T('Comparer avec l’acte de notoriété'))}</h3><p class="muted">${esc(T('Colle la liste des héritiers de l’acte (un par ligne, avec sa part : « Jean MAZAUD 1/4 », « 25 % », « la moitié ») : l’app compare avec son calcul.'))}</p>
                <textarea data-sd-noto rows="3" placeholder="Jean MAZAUD 1/4">${esc(m.noto || '')}</textarea>${m.noto ? (() => { const N = X.notoriete(m.noto, R.rows); return `<table class="sd-t"><thead><tr><th>${esc(T('Héritier'))}</th><th>${esc(T('Calcul'))}</th><th>${esc(T('Acte'))}</th><th></th></tr></thead><tbody>${N.rows.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.share)}</td><td>${esc(r.act || '—')}</td><td>${r.state === 'same' ? badge(T('pareil'), 'green') : r.state === 'diff' ? badge(T('différent'), 'red') : r.state === 'missing' ? badge(T('pas dans l’acte'), 'yellow') : badge(T('part illisible'), 'grey')}</td></tr>`).join('')}</tbody></table>${N.extra.length ? notice('warn', esc(T('Dans l’acte mais pas dans le calcul : {l}', {l: N.extra.join(' ; ')}))) : ''}`; })() : ''}</section>
            <section class="sd-sec"><h3>🔗 ${esc(T('Les successions en cascade'))}</h3>
                <label class="ui-toggle"><input type="checkbox" data-sd="cascade" ${dr.cascade !== false ? 'checked' : ''} ${ro ? 'disabled' : ''}><i></i>${esc(T('Un héritier mort après le défunt : sa part passe à ses propres héritiers'))}</label>
                ${C && C.steps.length ? `${C.steps.map(st => `<p>• ${esc(T('{n}, mort le {d} : sa part va à {to}.', {n: nameOf(D, st.from), d: st.date, to: st.to.map(x => `${nameOf(D, x.id)} (${x.share})`).join(', ')}))}</p>`).join('')}<table class="sd-t"><thead><tr><th>${esc(T('Qui reçoit au bout du compte'))}</th><th>${esc(T('Part'))}</th></tr></thead><tbody>${C.shares.map(s => `<tr><td>${esc(nameOf(D, s.id))}${s.via?.length ? ` <small class="muted">${esc(T('par {v}', {v: s.via.map(v => nameOf(D, v)).join(' → ')}))}</small>` : ''}</td><td>${esc(X.str(s.share))} · ${pct(s.share)}</td></tr>`).join('')}</tbody></table>` : `<p class="muted">${esc(T('Aucun héritier mort après le défunt.'))}</p>`}</section>
            <section class="sd-sec"><h3>💍 ${esc(T('Le régime matrimonial'))}</h3>${spouseRow || dr.matrim !== 'communaute' ? '' : `<p class="muted">${esc(T('Pas de conjoint survivant dans le calcul : le régime ne change rien, sauf une communauté à liquider.'))}</p>`}
                <div class="sd-grid"><label>${esc(T('Régime'))}<select data-sd="matrim" ${ro ? 'disabled' : ''}>${[['communaute', 'Communauté (légale, réduite aux acquêts)'], ['separation', 'Séparation de biens'], ['universelle', 'Communauté universelle']].map(([v, l]) => `<option value="${v}" ${dr.matrim === v ? 'selected' : ''}>${esc(T(l))}</option>`).join('')}</select></label>
                ${dr.matrim === 'universelle' ? `<label class="ui-toggle"><input type="checkbox" data-sd="attribution" ${dr.attribution ? 'checked' : ''} ${ro ? 'disabled' : ''}><i></i>${esc(T('Avec attribution intégrale au survivant'))}</label>` : ''}
                <label>${esc(T('Biens propres du défunt (€)'))}<input type="number" min="0" step="100" data-sdm="propres" value="${esc(m.propres)}"></label>${dr.matrim !== 'separation' ? `<label>${esc(T('Biens communs (€)'))}<input type="number" min="0" step="100" data-sdm="communs" value="${esc(m.communs)}"></label>` : ''}</div>
                <p class="muted">${esc(reg.note)}</p>${m.propres !== '' || m.communs !== '' ? `<p>${esc(T('Dans la succession : {s} · au conjoint d’abord (sa part de communauté) : {c}', {s: eur(reg.succession), c: eur(reg.conjointAvant)}))}</p>` : ''}</section>
            <section class="sd-sec"><h3>📜 ${esc(T('Testament et donations'))}</h3>
                <div class="sd-grid"><label>${esc(T('Actif net de la succession (€)'))}<input type="number" min="0" step="100" data-sdm="net" value="${esc(m.net)}" placeholder="${Number.isFinite(reg.succession) && (m.propres !== '' || m.communs !== '') ? esc(String(reg.succession)) : ''}"></label>
                ${spouseRow ? `<label>${esc(T('Donation entre époux'))}<select data-sd="spouse_donation" ${ro ? 'disabled' : ''}>${[['', 'Aucune'], ['quart_pp_usu', '¼ en propriété et ¾ en usufruit'], ['usu', 'L’usufruit de tout'], ['qd', 'La quotité disponible en propriété']].map(([v, l]) => `<option value="${v}" ${dr.spouse_donation === v ? 'selected' : ''}>${esc(T(l))}</option>`).join('')}</select></label><label>${esc(T('Âge du conjoint (pour l’usufruit)'))}<input type="number" min="0" max="120" data-sd="spouse_age" value="${esc(dr.spouse_age || '')}" ${ro ? 'readonly' : ''}></label>` : ''}</div>
                <h4>${esc(T('Donations reçues de son vivant'))}</h4>${m.donations.map((d, i) => `<div class="sd-line"><select data-sdl="donations|${i}|to">${heirOpts(d.to)}</select><input type="number" min="0" step="100" data-sdl="donations|${i}|amount" value="${esc(d.amount)}" placeholder="€"><label class="ui-toggle"><input type="checkbox" data-sdl="donations|${i}|hors" ${d.hors ? 'checked' : ''}><i></i>${esc(T('hors part (non rapportable)'))}</label><button type="button" class="icon-button small" data-sddel="donations|${i}" aria-label="${esc(T('Enlever'))}">×</button></div>`).join('')}
                <button type="button" class="button small secondary" data-sdadd="donations">＋ ${esc(T('Une donation'))}</button>
                <h4>${esc(T('Legs (testament)'))}</h4>${m.legs.map((l, i) => `<div class="sd-line"><select data-sdl="legs|${i}|to">${heirOpts(l.to)}</select><select data-sdl="legs|${i}|kind">${[['amount', 'Une somme'], ['fraction', 'Une fraction'], ['qd', 'La quotité disponible']].map(([v, x]) => `<option value="${v}" ${l.kind === v ? 'selected' : ''}>${esc(T(x))}</option>`).join('')}</select>${l.kind === 'qd' ? '' : l.kind === 'fraction' ? `<input data-sdl="legs|${i}|fraction" value="${esc(l.fraction || '')}" placeholder="1/4">` : `<input type="number" min="0" step="100" data-sdl="legs|${i}|amount" value="${esc(l.amount || '')}" placeholder="€">`}<button type="button" class="icon-button small" data-sddel="legs|${i}" aria-label="${esc(T('Enlever'))}">×</button></div>`).join('')}
                <button type="button" class="button small secondary" data-sdadd="legs">＋ ${esc(T('Un legs'))}</button>
                ${L ? `<p class="sd-sum">${esc(T('Masse de calcul {m} · réserve {r} ({f}) · quotité disponible {q}', {m: eur(L.masse), r: eur(L.reserve), f: L.reserveFraction, q: eur(L.qd)}))}</p>${L.notes.map(n => `<p class="muted">• ${esc(n)}</p>`).join('')}
                    <table class="sd-t"><thead><tr><th>${esc(T('Héritier'))}</th><th>${esc(T('Part selon la loi'))}</th><th>${esc(T('Déjà reçu (rapport)'))}</th><th>${esc(T('Legs, dons hors part'))}</th><th>${esc(T('Usufruit'))}</th><th>${esc(T('À recevoir'))}</th></tr></thead><tbody>${L.rows.map(r => `<tr><td>${esc(nameOf(D, r.id) || '?')}</td><td>${eur(r.abIntestat)}</td><td>${r.rapport ? '− ' + eur(r.rapport) : '—'}</td><td>${r.liberalites ? eur(r.liberalites) : '—'}</td><td>${r.usufruit ? eur(r.usufruit) : '—'}</td><td><b>${eur(r.aRecevoir)}</b></td></tr>`).join('')}</tbody></table>
                    ${L.reductions.length ? notice('warn', esc(T('Réductions : {r}', {r: L.reductions.map(x => `${nameOf(D, x.to)} ${eur(x.from)} → ${eur(x.to_c)}`).join(' ; ')}))) : ''}` : `<p class="muted">${esc(T('Tape l’actif net (ou les biens du régime matrimonial) pour voir les montants.'))}</p>`}</section>
            <section class="sd-sec"><h3>💶 ${esc(T('Droits de succession (estimation) et délais'))}</h3>
                ${dl ? `<p>${dl.late ? badge(T('En retard'), 'red') : badge(T('{n} jours', {n: String(dl.days)}), dl.days < 30 ? 'yellow' : 'grey')} ${esc(T('Déclaration de succession à déposer avant le {d} (6 mois après le décès, 12 hors de France métropolitaine) ; après, des intérêts de retard.', {d: dl.declaration}))}</p>` : `<p class="muted">${esc(T('La date exacte du décès donne la date limite de la déclaration.'))}</p>`}
                ${tax.length ? `<table class="sd-t"><thead><tr><th>${esc(T('Héritier'))}</th><th>${esc(T('Lien (impôt)'))}</th><th>${esc(T('Reçoit'))}</th><th>${esc(T('Abattement'))}</th><th>${esc(T('Droits estimés'))}</th><th>${esc(T('Handicap'))}</th></tr></thead><tbody>${tax.map(({r, lien, d}) => `<tr><td>${esc(nameOf(D, r.id))}</td><td>${esc(T(LIEN[lien] || lien))}</td><td>${eur(r.aRecevoir + r.usufruit)}</td><td>${d.exonere ? '—' : eur(d.abattement)}</td><td><b>${d.exonere ? esc(T('exonéré')) : eur(d.droits)}</b></td><td><input type="checkbox" data-sd-hand="${r.id}" ${dr.handicap.includes(r.id) ? 'checked' : ''} ${ro ? 'disabled' : ''} aria-label="${esc(T('Héritier handicapé (abattement en plus)'))}"></td></tr>`).join('')}</tbody></table><p class="muted">${esc(T('Barèmes et abattements de l’article 777 du CGI (valeurs 2024), sans les dons des 15 dernières années ni les cas particuliers (frère ou sœur vivant avec le défunt, assurance vie…).'))}</p>` : `<p class="muted">${esc(T('Les droits s’estiment quand l’actif est tapé.'))}</p>`}</section>
            <section class="sd-sec"><h3>🏠 ${esc(T('Droits du conjoint et droit de retour'))}</h3>
                ${spouseRow ? `<p>• ${esc(T('Le conjoint peut rester gratuitement dans le logement pendant un an (art. 763), puis demander un droit viager au logement dans l’année du décès (art. 764 et 765-1).'))}</p>` : ''}
                <p>• ${esc(T('Droit de retour des parents (art. 738-2) : les biens qu’un père ou une mère avait donnés au défunt mort sans descendant leur reviennent, dans la limite de leur part.'))}</p>
                <p>• ${esc(T('Droit de retour des frères et sœurs (art. 757-3) : quand le conjoint hérite de tout, la moitié des biens de famille reçus des parents va aux frères et sœurs.'))}</p></section>
            <section class="sd-sec"><h3>🌍 ${esc(T('Un défunt lié à l’étranger'))}</h3>
                <div class="sd-grid"><label>${esc(T('Dernière résidence habituelle (pays)'))}<input data-sd="residence" value="${esc(dr.residence)}" placeholder="France" ${ro ? 'readonly' : ''}></label><label>${esc(T('Nationalité'))}<input data-sd="nationalite" value="${esc(dr.nationalite)}" placeholder="${esc(T('française'))}" ${ro ? 'readonly' : ''}></label>
                <label class="ui-toggle"><input type="checkbox" data-sd="biens_etranger" ${dr.biens_etranger ? 'checked' : ''} ${ro ? 'disabled' : ''}><i></i>${esc(T('Des biens à l’étranger'))}</label></div>
                ${X.abroad({residence: dr.residence, biensEtranger: dr.biens_etranger, nationalite: dr.nationalite, t: T}).map(w => notice('warn', esc(w))).join('')}</section></div>`;
        const redraw = () => setTimeout(() => { if (body.isConnected) tabDroit(body, D, R); }, 0); // après le « blur » du champ (sinon le navigateur se plaint)
        const setDr = (k, v, label) => { const nd = {...droitOf(D), [k]: v}; save(D, 'droit', nd, {label, redraw}); };
        body.querySelectorAll('[data-sd]').forEach(el => el.addEventListener('change', () => { const k = el.dataset.sd, v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) || 0 : el.value; setDr(k, v, T('Réglage changé.')); }));
        body.querySelectorAll('[data-sd-fil]').forEach(el => el.addEventListener('change', () => setDr('filiation', {...droitOf(D).filiation, [el.dataset.sdFil]: el.value}, T('Filiation changée.'))));
        body.querySelectorAll('[data-sd-hand]').forEach(el => el.addEventListener('change', () => { const id = Number(el.dataset.sdHand), h = droitOf(D).handicap.filter(x => x !== id); if (el.checked) h.push(id); setDr('handicap', h, ''); }));
        body.querySelectorAll('[data-sdm]').forEach(el => el.addEventListener('change', () => { m[el.dataset.sdm] = el.value; redraw(); }));
        body.querySelector('[data-sd-noto]')?.addEventListener('change', e => { m.noto = e.target.value; redraw(); });
        body.querySelectorAll('[data-sdl]').forEach(el => el.addEventListener('change', () => { const [list, i, k] = el.dataset.sdl.split('|'); m[list][Number(i)][k] = el.type === 'checkbox' ? el.checked : el.value; redraw(); }));
        body.querySelectorAll('[data-sdadd]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.sdadd; m[k].push(k === 'donations' ? {to: R.rows[0]?.id || 0, amount: '', hors: false} : {to: R.rows[0]?.id || 0, kind: 'amount', amount: '', fraction: ''}); redraw(); }));
        body.querySelectorAll('[data-sddel]').forEach(b => b.addEventListener('click', () => { const [k, i] = b.dataset.sddel.split('|'); const was = m[k].splice(Number(i), 1)[0]; redraw(); A().undoToast?.(T('Ligne enlevée.'), {undo: () => { m[k].splice(Number(i), 0, was); redraw(); }}); }));
    }

    /* ═════ 🗂 Suivi des héritiers ═════ */
    const STAGES = [['trouver', '🔎', 'À trouver'], ['trouve', '📍', 'Trouvé'], ['contacte', '✉️', 'Contacté'], ['signe', '✍️', 'Contrat signé'], ['pieces', '📑', 'Pièces reçues']];
    const SOURCES = ['Acte de naissance', 'Acte de mariage', 'Acte de décès', 'Fichier des décès (INSEE)', 'Annuaires (téléphone, en ligne)', 'Listes électorales', 'Registres matricules', 'Réseaux sociaux', 'Archives notariales', 'Cadastre, hypothèques', 'Voisins, mairie'];
    const SRC_STATES = [['a_faire', 'À faire', 'grey'], ['en_cours', 'En cours', 'yellow'], ['trouve', 'Trouvé', 'green'], ['rien', 'Rien trouvé', 'red']];
    function tabSuivi(body, D, R) {
        const su = suiviOf(D), ro = D.archived || D.state === 'archive';
        const heirs = R.rows.filter(r => DR().parse(r.share).n !== 0n || r.unknown), stageOf = id => su[id]?.stage || 'trouver';
        const todayIso = new Date().toISOString().slice(0, 10);
        body.innerHTML = `<div class="sd"><p class="muted">${esc(T('Glisse une carte d’une colonne à l’autre (ou choisis l’étape sur la carte). Une date de relance passée apparaît en rouge.'))}</p>
            <div class="sd-kanban" data-sd-kanban>${STAGES.map(([k, ic, l]) => { const list = heirs.filter(h => stageOf(h.id) === k); return `<section class="sd-col" data-sd-col="${k}" aria-label="${esc(T(l))}"><h4>${ic} ${esc(T(l))} <small>${list.length}</small></h4>${list.map(h => { const x = su[h.id] || {}, late = x.remind && x.remind < todayIso, ns = (x.sources || []).length, found = (x.sources || []).filter(s => s.state === 'trouve').length;
                return `<article class="sd-card" draggable="${!ro}" data-sd-card="${h.id}" tabindex="0"><b>${esc(h.name)}</b><small class="muted">${esc(h.kin)} · ${esc(h.share)}${h.unknown ? ` · ${esc(T('vivant ?'))}` : ''}</small>
                    ${x.next ? `<p class="sd-next">➜ ${esc(x.next)}</p>` : ''}${x.remind ? `<p class="${late ? 'sd-late' : 'muted'}">🔔 ${esc(x.remind)}</p>` : ''}
                    <div class="sd-cardact"><select data-sd-stage="${h.id}" aria-label="${esc(T('Étape'))}" ${ro ? 'disabled' : ''}>${STAGES.map(([v, i2, l2]) => `<option value="${v}" ${stageOf(h.id) === v ? 'selected' : ''}>${i2} ${esc(T(l2))}</option>`).join('')}</select>
                    <button type="button" class="button small secondary" data-sd-edit="${h.id}">✎</button><button type="button" class="button small secondary" data-sd-src="${h.id}">🔎 ${ns ? `${found}/${ns}` : esc(T('Sources'))}</button></div></article>`; }).join('') || `<p class="muted sd-empty">—</p>`}</section>`; }).join('')}</div></div>`;
        const redraw = () => setTimeout(() => { if (body.isConnected) tabSuivi(body, D, R); }, 0);
        const setH = (id, patch, label) => { const ns = {...suiviOf(D), [id]: {stage: 'trouver', next: '', remind: '', sources: [], ...(suiviOf(D)[id] || {}), ...patch}}; save(D, 'suivi', ns, {label, redraw}); };
        body.querySelectorAll('[data-sd-stage]').forEach(el => el.addEventListener('change', () => setH(el.dataset.sdStage, {stage: el.value}, T('{n} : {s}', {n: nameOf(D, el.dataset.sdStage), s: T(STAGES.find(s => s[0] === el.value)[2])}))));
        let drag = null;
        body.querySelectorAll('[data-sd-card]').forEach(c => { c.addEventListener('dragstart', e => { drag = c.dataset.sdCard; e.dataTransfer.setData('text/plain', drag); c.classList.add('is-drag'); }); c.addEventListener('dragend', () => c.classList.remove('is-drag')); });
        body.querySelectorAll('[data-sd-col]').forEach(col => { col.addEventListener('dragover', e => { if (drag) { e.preventDefault(); col.classList.add('is-over'); } }); col.addEventListener('dragleave', () => col.classList.remove('is-over'));
            col.addEventListener('drop', e => { e.preventDefault(); col.classList.remove('is-over'); const id = drag || e.dataTransfer.getData('text/plain'); drag = null; if (id && stageOf(Number(id)) !== col.dataset.sdCol) setH(id, {stage: col.dataset.sdCol}, T('{n} : {s}', {n: nameOf(D, id), s: T(STAGES.find(s => s[0] === col.dataset.sdCol)[2])})); }); });
        body.querySelectorAll('[data-sd-edit]').forEach(b => b.addEventListener('click', () => { const id = b.dataset.sdEdit, x = suiviOf(D)[id] || {};
            ext.openDialog?.({eyebrow: '🗂 ' + T('Suivi des héritiers'), title: nameOf(D, id), submitLabel: T('Enregistrer'), body: `<div class="form-grid"><label class="span-2">${esc(T('La prochaine chose à faire'))}<input name="next" value="${esc(x.next || '')}" maxlength="300"></label><label>${esc(T('Date de relance'))}<input type="date" name="remind" value="${esc(x.remind || '')}"></label></div>`,
                onSubmit: f => { setH(id, {next: f.querySelector('[name=next]').value.trim(), remind: f.querySelector('[name=remind]').value}, T('Suivi changé.')); return true; }}); }));
        body.querySelectorAll('[data-sd-src]').forEach(b => b.addEventListener('click', () => sourcesDialog(D, b.dataset.sdSrc, redraw)));
    }
    function sourcesDialog(D, id, after) {
        const x = suiviOf(D)[id] || {}, list = (x.sources || []).map(s => ({...s}));
        const dg = document.createElement('dialog'); dg.className = 'modal sd-srcdlg';
        const paint = () => { dg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">🔎 ${esc(T('Les sources pour retrouver'))}</span><h2>${esc(nameOf(D, id))}</h2></div><button type="button" class="icon-button" data-x aria-label="${esc(T('Fermer'))}">×</button></div>
            <p class="muted">${esc(T('Ce qui a été cherché, quand, et le résultat : pour ne jamais chercher deux fois.'))}</p>
            <table class="sd-t"><thead><tr><th>${esc(T('Source'))}</th><th>${esc(T('Résultat'))}</th><th>${esc(T('Date'))}</th><th>${esc(T('Note'))}</th><th></th></tr></thead><tbody>${list.map((s, i) => `<tr><td>${esc(T(s.what))}</td><td><select data-ss="${i}|state">${SRC_STATES.map(([v, l]) => `<option value="${v}" ${s.state === v ? 'selected' : ''}>${esc(T(l))}</option>`).join('')}</select></td><td><input type="date" data-ss="${i}|date" value="${esc(s.date || '')}"></td><td><input data-ss="${i}|note" value="${esc(s.note || '')}" maxlength="500"></td><td><button type="button" class="icon-button small" data-ssdel="${i}" aria-label="${esc(T('Enlever'))}">×</button></td></tr>`).join('') || `<tr><td colspan="5" class="muted">${esc(T('Rien de noté pour l’instant.'))}</td></tr>`}</tbody></table>
            <div class="sd-srcadd">${SOURCES.filter(sx => !list.some(s => s.what === sx)).map(sx => `<button type="button" class="button small secondary" data-ssadd="${esc(sx)}">＋ ${esc(T(sx))}</button>`).join('')}<button type="button" class="button small secondary" data-ssown>＋ ${esc(T('Une autre source…'))}</button></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>${esc(T('Annuler'))}</button><button type="button" class="button" data-ok>${esc(T('Enregistrer'))}</button></div></form>`; };
        paint(); document.body.appendChild(dg); dg.showModal();
        const done = () => { dg.close(); dg.parentNode?.removeChild(dg); };
        dg.addEventListener('change', e => { const el = e.target.closest('[data-ss]'); if (!el) return; const [i, k] = el.dataset.ss.split('|'); list[Number(i)][k] = el.value; });
        dg.addEventListener('click', async e => {
            if (e.target.closest('[data-x]')) return done();
            const ad = e.target.closest('[data-ssadd]'); if (ad) { list.push({what: ad.dataset.ssadd, state: 'en_cours', date: new Date().toISOString().slice(0, 10), note: ''}); return paint(); }
            if (e.target.closest('[data-ssown]')) { const n = await A().askText({title: T('Une autre source'), okLabel: T('Ajouter')}); if (n?.trim()) { list.push({what: n.trim().slice(0, 120), state: 'en_cours', date: new Date().toISOString().slice(0, 10), note: ''}); paint(); } return; }
            const dl = e.target.closest('[data-ssdel]'); if (dl) { list.splice(Number(dl.dataset.ssdel), 1); return paint(); }
            if (e.target.closest('[data-ok]')) { const ns = {...suiviOf(D), [id]: {stage: 'trouver', next: '', remind: '', ...(suiviOf(D)[id] || {}), sources: list}}; done(); save(D, 'suivi', ns, {label: T('Sources notées.'), redraw: after}); }
        });
        dg.addEventListener('cancel', e => { e.preventDefault(); done(); });
    }

    /* ═════ 🧭 un nouveau dossier pas à pas : 1 le défunt, 2 la famille trouvée, 3 les doutes, 4 les héritiers ═════ */
    const STEPS = ['Le défunt', 'La famille trouvée', 'Les doutes', 'Les héritiers'];
    const STATUS_CHOICES = [['alive', '✓ Vivant au décès'], ['dead_before', '✝ Mort avant'], ['dead_after', '✝ Mort après'], ['unknown', '? On ne sait pas']];
    async function wizard() {
        if (hidden()) return A().toast(T('Pas en mode consultation ni en mode simple.'));
        const P = window.LCNDA_PICKER || window.LCNDA_APP;
        let step = 0, D = null, R = null, created = 0;
        const dg = document.createElement('dialog'); dg.className = 'modal sd-wiz'; dg.innerHTML = '<div class="sd-wroot"></div>'; document.body.appendChild(dg); const root = dg.firstChild; // le message « ↶ Annuler » se met dans la fenêtre : on ne la réécrit pas en entier
        const load = async () => { D = await A().api('successoral', {op: 'get', id: created}); const ov = {}, sp = {}; for (const [k, o] of Object.entries(D.overrides || {})) { if (o.status || o.adoption) ov[k] = {status: o.status, adoption: o.adoption}; if (o.spouse) sp[k] = o.spouse; } R = S().compute(D.graph, {deceasedId: D.deceased_id, deathDate: D.death_iso || '', overrides: ov, spouse: sp, t: T}); };
        const ORD = {0: 'Aucun héritier trouvé', 1: '1er ordre : les descendants', 2: '2e ordre : parents, frères et sœurs', 3: '3e ordre : les autres ascendants', 4: '4e ordre : oncles, tantes, cousins'};
        function paint() {
            const head = `<div class="modal-head"><div><span class="eyebrow">🧭 ${esc(T('Nouveau dossier, pas à pas'))} · ${esc(T('Étape {i} sur {n}', {i: String(step + 1), n: '4'}))}</span><h2>${esc(T(STEPS[step]))}</h2></div><button type="button" class="icon-button" data-wx aria-label="${esc(T('Fermer'))}">×</button></div>
                <ol class="sd-wsteps">${STEPS.map((s, i) => `<li class="${i === step ? 'is-on' : i < step ? 'is-done' : ''}">${i < step ? '✓' : i + 1}. ${esc(T(s))}</li>`).join('')}</ol>`;
            let body = '';
            if (step === 0) body = `<div class="form-grid"><div class="span-2"><span class="pk-lab">${esc(T('La personne décédée'))}</span>${P.pickerField({name: 'deceased_id', kind: 'person', animals: false, value: null})}</div>
                <label>${esc(T('Date du décès (vide : celle de la fiche)'))}<input name="death_date_text" maxlength="120"></label><label>${esc(T('Dernier domicile'))}<input name="last_address" maxlength="400"></label></div>
                <p class="ui-hint">${esc(T('Le dossier s’ouvre à l’étape suivante ; ↶ Annuler le supprime.'))}</p>`;
            if (step === 1) { const heirs = R.rows.filter(r => r.share !== '0'), unk = R.rows.filter(r => r.unknown);
                body = `<p><b>${esc(T(ORD[R.order] || ''))}</b>${R.spouse ? ` · ${esc(T('avec un conjoint'))}` : ''}</p><p>${esc(T('{n} héritiers trouvés, {u} dont on ne sait pas s’ils vivaient au décès.', {n: String(heirs.length), u: String(unk.length)}))}</p>
                    ${R.notes.map(n => `<p class="muted">• ${esc(n)}</p>`).join('')}${R.search?.length ? `<p class="muted">${esc(T('{n} recherches à faire (adresses, dates, branches) : elles seront dans le dossier.', {n: String(R.search.length)}))}</p>` : ''}`; }
            if (step === 2) { const unk = R.rows.filter(r => r.unknown || r.baseTiming === 'unknown');
                body = unk.length ? `<p>${esc(T('Pour chacun, ce qu’on sait au jour du décès. Le calcul se refait à chaque choix.'))}</p><table class="sd-t"><tbody>${unk.map(r => `<tr><td><b>${esc(r.name)}</b><br><small class="muted">${esc(r.kin)}${r.years ? ` · ${esc(r.years)}` : ''}</small></td><td>${STATUS_CHOICES.map(([v, l]) => `<button type="button" class="button small ${D.overrides?.[r.id]?.status === v ? '' : 'secondary'}" data-wst="${r.id}|${v}">${esc(T(l))}</button>`).join(' ')}</td></tr>`).join('')}</tbody></table>${R.hypotheses?.length ? `<p class="muted">${esc(T('Sans réponse, le dossier garde les hypothèses ({n}) côte à côte.', {n: String(R.hypotheses.length)}))}</p>` : ''}` : `<p>✓ ${esc(T('Aucun doute : chaque héritier a un statut connu.'))}</p>`; }
            if (step === 3) body = `<table class="sd-t"><thead><tr><th>${esc(T('Héritier'))}</th><th>${esc(T('Lien'))}</th><th>${esc(T('Part'))}</th></tr></thead><tbody>${R.rows.filter(r => r.share !== '0').map(r => `<tr><td>${esc(r.name)}${r.unknown ? ' ' + badge(T('vivant ?'), 'yellow') : ''}</td><td>${esc(r.kin)}</td><td>${esc(r.share)} · ${esc(String(r.pct).replace('.', ','))} %</td></tr>`).join('')}</tbody></table>${R.totalOk ? '' : notice('warn', esc(T('Le total ne fait pas 1 : il manque sans doute des personnes.')))}`;
            root.innerHTML = `<form method="dialog">${head}<div class="sd-wbody">${body}</div><div class="modal-actions">${step ? `<button type="button" class="button secondary" data-wprev>← ${esc(T('Retour'))}</button>` : ''}<span class="spacer"></span><button type="button" class="button" data-wnext>${step === 3 ? esc(T('Ouvrir le dossier')) : `${esc(T('Suivant'))} →`}</button></div></form>`;
        }
        paint(); dg.showModal();
        const close = () => { dg.close(); dg.parentNode?.removeChild(dg); };
        dg.addEventListener('cancel', e => { e.preventDefault(); close(); if (created) ext.successoral?.openCase?.(created); });
        dg.addEventListener('click', async e => {
            if (e.target.closest('[data-wx]')) { close(); if (created) ext.successoral?.openCase?.(created); return; }
            if (e.target.closest('[data-wprev]')) { step = Math.max(created ? 1 : 0, step - 1); return paint(); }
            const st = e.target.closest('[data-wst]'); if (st) { const [pid, v] = st.dataset.wst.split('|'); try { await post({op: 'override', case_id: created, person_id: Number(pid), field: 'status', value: v}); await load(); paint(); } catch (err) { A().toast(err.message, 'error'); } return; }
            if (!e.target.closest('[data-wnext]')) return;
            if (step === 0) {
                const f = dg.querySelector('form'), did = Number(f.querySelector('[name=deceased_id]')?.value) || 0; if (!did) return A().toast(T('Choisis la personne décédée.'), 'error');
                const body = {op: 'save', id: 0, deceased_id: did, last_address: f.querySelector('[name=last_address]').value}; const dt = f.querySelector('[name=death_date_text]').value.trim(); if (dt) body.death_date_text = dt;
                try { const r = await post(body); created = r.id; } catch (err) { return A().toast(err.message, 'error'); }
                A().undoToast?.(T('Dossier ouvert'), {undo: async () => { await post({op: 'delete', id: created}); close(); ext.successoral?.openCase?.(0); }});
                await load(); step = 1; return paint();
            }
            if (step < 3) { step++; return paint(); }
            close(); ext.successoral?.openCase?.(created, 'heirs');
        });
    }
    ext.succDroit = {tabDroit, tabSuivi, sourcesDialog, wizard, STAGES, SOURCES};
    if (!document.getElementById('sd-css')) { const st = document.createElement('style'); st.id = 'sd-css'; st.textContent = `
.sd{display:grid;gap:14px}.sd-sec{border:2px solid var(--ink,#111);padding:10px 14px;background:var(--surface,#fff)}.sd-sec h3{margin:0 0 8px}.sd-sec h4{margin:12px 0 6px;font-size:13px}
.sd-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.sd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px 14px;align-items:end}.sd-grid label{display:grid;gap:3px;font-size:13px}
.sd-t{width:100%;border-collapse:collapse;font-size:13px;margin:6px 0}.sd-t th,.sd-t td{border-bottom:1px solid var(--line,#e4e6ea);padding:4px 6px;text-align:left}.sd-t th{background:var(--surface-2,#f4f5f7)}
.sd-line{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:4px 0}.sd-line input{width:130px}.sd-sum{font-weight:700}
.sd-kanban{display:grid;grid-template-columns:repeat(5,minmax(180px,1fr));gap:10px;overflow-x:auto;align-items:start}
.sd-col{background:var(--surface-2,#f4f5f7);border:2px solid var(--line,#c9ced8);padding:8px;min-height:160px}.sd-col.is-over{border-color:var(--accent,#055dff)}.sd-col h4{margin:0 0 8px;font-size:13px}.sd-col h4 small{color:var(--muted,#666)}
.sd-card{background:var(--surface,#fff);border:2px solid var(--ink,#111);padding:8px;margin-bottom:8px;display:grid;gap:4px;cursor:grab}.sd-card.is-drag{opacity:.5}.sd-card small{font-size:11.5px}
.sd-next{margin:0;font-size:12.5px}.sd-late{margin:0;color:#c62828;font-weight:700;font-size:12.5px}.sd-cardact{display:flex;gap:4px;flex-wrap:wrap}.sd-cardact select{flex:1;min-width:0;font-size:12px}
.sd-wiz{width:min(860px,96vw)}.sd-wsteps{display:flex;gap:6px;flex-wrap:wrap;list-style:none;padding:0;margin:0 0 12px}.sd-wsteps li{border:2px solid var(--line,#c9ced8);padding:3px 8px;font-size:12.5px}.sd-wsteps li.is-on{border-color:var(--accent,#055dff);font-weight:700}.sd-wsteps li.is-done{color:var(--muted,#666)}.sd-wbody{min-height:160px}
.sd-scroll{overflow-x:auto}[data-sd-noto]{width:100%}
.sd-srcadd{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.sd-srcdlg{width:min(900px,96vw)}
@media (max-width:900px){.sd-kanban{grid-template-columns:repeat(5,220px)}}
`; document.head.appendChild(st); }
})();
