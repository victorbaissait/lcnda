/* LCNDA — 🧾 Recensements SocFace (FranceArchives) : les écrans.
 *  - « 🔍 Chercher dans les recensements (SocFace) » : fiche (bloc Recensements), fiche d'un village, Recherche, « Chercher sur
 *    internet » → ouvre le NAVIGATEUR sur FranceArchives, champs remplis ; l'app n'interroge jamais ce site.
 *  - « ⤒ Importer des recensements SocFace » : fenêtre K13 ; CSV de FranceArchives (notice, export) ou texte copié d'une fiche,
 *    lus par le moteur des tableaux (LCNDA_SHEET) ; « c'est la même personne ? » pour chaque membre (rien relié sans confirmation).
 *  - « 🔍 Vérifier cette ligne SocFace » : le champ lu, la raison du doute, une proposition (jamais appliquée sans clic, ↶ Annuler),
 *    le lien vers l'image. Détections : assets/js/app-lecture-auto.js (LCNDA_LECTURE).
 *  - Recherche → « 🧾 Recensements SocFace » : les foyers importés, « À vérifier » / « Vérifié sur l'image ».
 * Calculs purs : app-socface-core.js (LCNDA_SOCFACE). Serveur : lib/socface.php. Mode d'emploi : docs/UI.md (« 🧾 Recensements SocFace »).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const SF = () => window.LCNDA_SOCFACE;
    const LX = () => window.LCNDA_LECTURE;
    const S = () => A().state;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const plural = (n, one, many) => A().plural ? A().plural(n, one, many) : `${n} ${n > 1 ? many || one + 's' : one}`;
    const post = (action, body) => api(action, {}, {method: 'POST', body}).then(r => r?.result ?? r);
    const LEVEL = {orange: ['🟠', 'À vérifier'], yellow: ['🟡', 'Curieux']};
    const FIELD = {last: 'Nom', first: 'Prénom', age: 'Âge', birth_year: 'Année de naissance', birth_place: 'Lieu de naissance', role: 'Lien avec le chef', gender: 'Genre', occupation: 'Profession', nationality: 'Nationalité', civil_status: 'État civil', employer: 'Employeur'};
    const ORDER = ['last', 'first', 'gender', 'age', 'birth_year', 'birth_place', 'role', 'civil_status', 'occupation', 'employer', 'nationality'];
    const genderTxt = g => g === 'f' ? 'femme' : g === 'h' ? 'homme' : '';
    const mention = () => SF()?.MENTION || 'Transcription automatique SocFace (FranceArchives) — peut contenir des erreurs : à vérifier sur l’image';
    const imgLabel = u => SF()?.imageLabel ? SF().imageLabel(u) : '🖼 Voir l’image ↗';
    const btnLink = (href, label, cls = 'button small secondary') => href ? `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : '';

    /* ═════ 🔍 Chercher : la fenêtre qui prépare l'adresse ═════ */
    function openSearch(o = {}) {
        const places = [...new Set((o.places || []).map(p => String(p || '').split(',')[0].trim()).filter(Boolean))];
        const dlg = document.createElement('dialog'); dlg.className = 'modal small-modal sf-search';
        const y1 = Math.max(1836, Number(o.y1) || 1836), y2 = Math.min(1936, Number(o.y2) || 1936);
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">RECENSEMENTS 1836-1936 · SOCFACE</span><h2>🔍 Chercher dans les recensements</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="h-dialog-body sf-search-body">
                <div class="form-grid">
                    <label>Nom<input name="last" value="${esc(o.last || '')}" autocomplete="off"></label>
                    <label>Prénom<input name="first" value="${esc(String(o.first || '').split(/\s+/)[0] || '')}" autocomplete="off"></label>
                    <label class="span-2">Commune<input name="place" value="${esc(o.place || places[0] || '')}" list="sf-search-places" autocomplete="off" placeholder="Tulle, Saint-Martin…"><datalist id="sf-search-places">${places.map(p => `<option value="${esc(p)}">`).join('')}</datalist></label>
                    <label>De l’année<input name="y1" type="number" min="1836" max="1936" value="${esc(o.y1 === '' ? '' : y1)}"></label>
                    <label>à l’année<input name="y2" type="number" min="1836" max="1936" value="${esc(o.y2 === '' ? '' : y2)}"></label>
                    <label>Genre<select name="gender"><option value="">Tous</option><option value="f" ${o.gender === 'f' ? 'selected' : ''}>Femme</option><option value="h" ${o.gender === 'h' ? 'selected' : ''}>Homme</option></select></label>
                </div>
                <p class="ui-hint">Années de recensement : <span data-sf-years></span></p>
                ${UI().notice('info', 'La recherche s’ouvre sur FranceArchives dans ton navigateur. L’app n’envoie rien d’autre que ce que tu vois dans cette adresse :')}
                <p class="sf-url"><code data-sf-url></code></p>
                <p class="ui-hint">Adresse vérifiée en partie : le nom, le prénom et le lieu sont sûrs ; les années et le genre viennent du code du site (s’ils ne filtrent pas, retouche-les sur la page).</p>
                <p class="ui-hint">Les données sont une ${esc('transcription automatique (projet SocFace) : elles peuvent contenir des erreurs. Ensuite, télécharge la notice ou « Exporter les résultats » en CSV, et fais « ⤒ Importer des recensements SocFace ».')}</p>
            </div>
            <div class="modal-actions"><button type="button" class="button secondary" data-sf-import-from-search>⤒ Importer…</button><span class="spacer"></span><button type="button" class="button secondary" data-x>Annuler</button><a class="button" data-sf-go target="_blank" rel="noopener noreferrer">↗ Ouvrir FranceArchives</a></div></form>`;
        document.body.appendChild(dlg);
        const f = dlg.querySelector('form');
        const upd = () => {
            const v = Object.fromEntries(new FormData(f));
            const url = SF().searchUrl(v);
            dlg.querySelector('[data-sf-url]').textContent = url; dlg.querySelector('[data-sf-go]').href = url;
            const ys = SF().censusYears(v.y1 || 1836, v.y2 || 1936);
            dlg.querySelector('[data-sf-years]').textContent = ys.length ? ys.join(', ') : 'aucune entre ces deux années';
        };
        f.addEventListener('input', upd); upd();
        dlg.addEventListener('click', e => {
            if (e.target.closest('[data-x]')) dlg.close();
            if (e.target.closest('[data-sf-go]')) setTimeout(() => dlg.close(), 50);
            if (e.target.closest('[data-sf-import-from-search]')) { dlg.close(); openImport({personId: o.personId}); }
        });
        dlg.addEventListener('close', () => dlg.remove());
        dlg.showModal();
        return dlg;
    }

    /** ce qu'une fiche apporte à la recherche : nom, prénom, communes de vie, années possibles dans 1836-1936 */
    async function searchFromPerson(personId) {
        let d; try { d = await api('person', {id: personId}); } catch (e) { toast(e.message, 'error'); return; }
        const p = d.person || {}, ctx = A().webSearchContext ? A().webSearchContext(d) : null;
        const life = ctx && A().webSearchLifeRange ? A().webSearchLifeRange(ctx) : {from: p.birth_year, to: p.death_year};
        const places = [...(d.events || []).map(e => e.place_name).filter(Boolean), ...((d.census?.records) || []).map(r => r.place_name).filter(Boolean)];
        const counts = {}; places.forEach(x => { const k = String(x).split(',')[0].trim(); counts[k] = (counts[k] || 0) + 1; });
        const ordered = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
        openSearch({personId, last: p.last_name, first: p.first_name, places: ordered, y1: Math.max(1836, Number(life.from) || 1836), y2: Math.min(1936, Number(life.to) || 1936), gender: p.gender === 'female' ? 'f' : p.gender === 'male' ? 'h' : ''});
    }

    /* ═════ Le contexte pour repérer les erreurs de lecture (prénoms, noms, communes, métiers) ═════ */
    const ctxCache = new Map();
    async function readingContext(dep = '', commune = '') {
        const k = `${dep}|${commune}`;
        if (!ctxCache.has(k)) ctxCache.set(k, api('socface_context', {department: dep, commune}).catch(() => ({surnames: [], firstNames: [], places: [], trades: []})));
        const c = await ctxCache.get(k);
        return {...c, firstNames: [...(c.firstNames || []), ...(LX()?.FIRST_NAMES || [])]};
    }
    const doubtsOf = (rows, year, ctx, others) => LX() ? LX().checkHousehold(rows, {...ctx, year, others}) : [];

    /* ═════ ⤒ Importer : la fenêtre K13 ═════ */
    function openImport(o = {}) {
        let state = null; // {households, preview, ctx, doubts}
        const memberRow = (h, hi, m, mi, pv) => {
            const cands = pv?.members?.[mi]?.candidates || [];
            const ds = (state.doubts[hi] || []).filter(d => d.row === mi);
            const already = (pv?.already?.[mi] || []);
            const sel = `<select data-sf-link="${hi}:${mi}" aria-label="C’est la même personne ?"><option value="">— Ne pas relier (personne sans fiche)</option>${cands.map(c => `<option value="${c.id}">Relier à ${esc(c.first_name)} ${esc(String(c.last_name || '').toUpperCase())}${c.birth_year || c.death_year ? ` (${c.birth_year || '?'}–${c.death_year || ''})` : ''} · ${c.score} % · ${esc(c.why)}</option>`).join('')}</select>`;
            const ec = cands.flatMap(c => (c.ecarts || []).map(e => `<li class="sf-ecart is-${esc(e.level)}" data-sf-ec-for="${hi}:${mi}:${c.id}" hidden>${LEVEL[e.level]?.[0] || '🟡'} ${esc(e.text)}</li>`)).join('');
            return `<tr data-sf-row="${hi}:${mi}">
                <td><input type="checkbox" data-sf-keep="${hi}:${mi}" ${m.skip ? '' : 'checked'} aria-label="Importer cette ligne"></td>
                <td><b>${esc(m.first)} ${esc(String(m.last || '').toUpperCase())}</b>${m.partial ? ' <small class="muted">(cité sur la fiche)</small>' : ''}<br><small class="muted">${esc([m.role, genderTxt(m.gender)].filter(Boolean).join(' · '))}</small></td>
                <td>${esc(m.age ? m.age + ' ans' : '')}${m.birth_year || m.birth_place ? `<br><small class="muted">${esc(['né' + (m.gender === 'f' ? 'e' : '') + (m.birth_year ? ' en ' + m.birth_year : ''), m.birth_place ? 'à ' + m.birth_place : ''].filter(Boolean).join(' '))}</small>` : ''}</td>
                <td>${esc(m.occupation)}</td>
                <td>${cands.length ? sel : '<span class="empty-line"><span class="empty-line-ico" aria-hidden="true">👤</span><span class="empty-line-text">Aucune fiche proche : la ligne entre sans fiche.</span></span>'}${already.length ? `<br><small class="muted">ⓘ déjà un recensement de ${h.year} dans sa fiche : celui-ci s’ajoute à côté, rien n’est remplacé.</small>` : ''}${ec ? `<ul class="sf-ecarts">${ec}</ul>` : ''}</td>
                <td>${ds.length ? `<button type="button" class="button small secondary" data-sf-doubts="${hi}:${mi}">${ds.some(d => d.level === 'orange') ? '🟠' : '🟡'} ${plural(ds.length, 'doute')}</button>` : '<small class="muted">—</small>'}</td></tr>`;
        };
        const previewHtml = () => state.households.map((h, hi) => {
            const pv = state.preview.households[hi] || {};
            return `<section class="sf-hh${pv.existing ? ' is-existing' : ''}" data-sf-hh="${hi}">
                <h4>📋 Recensement de ${h.year}${h.commune ? ` · ${esc(h.commune)}` : ''}${h.department ? ` <small class="muted">(${esc(h.department)})</small>` : ''} ${UI().badge('À vérifier', 'yellow', {title: mention()})}</h4>
                <p class="muted sf-hh-meta">${esc([h.cote ? 'Cote ' + h.cote : '', h.page ? 'page ' + h.page : '', h.service].filter(Boolean).join(' · '))} ${btnLink(h.url, '↗ Notice', 'link-button')} ${btnLink(h.image_url, imgLabel(h.image_url), 'link-button')}</p>
                ${pv.existing ? UI().notice('warn', 'Ce ménage est déjà importé : il sera laissé de côté (pas de doublon).') : ''}
                <div class="data-table-wrap"><table class="data-table sf-table"><thead><tr><th></th><th>Personne lue</th><th>Âge, naissance</th><th>Profession</th><th>C’est la même personne ?</th><th>Doutes</th></tr></thead><tbody>${h.members.map((m, mi) => memberRow(h, hi, m, mi, pv)).join('')}</tbody></table></div></section>`;
        }).join('');
        const analyze = async files => {
            const f = files[0]; if (!f) throw new Error('aucun fichier');
            if (f.size > 8 * 1048576) throw new Error('fichier trop gros (8 Mo au plus)');
            const buf = await f.arrayBuffer();
            const text = window.LCNDA_SHEET?.decodeBytes ? window.LCNDA_SHEET.decodeBytes(new Uint8Array(buf)).text : new TextDecoder().decode(buf);
            const parsed = SF().parse(text, {parseCSV: window.LCNDA_SHEET?.parseCSV});
            if (!parsed.households.length) throw new Error('aucun recensement dans ce fichier');
            const h0 = parsed.households[0];
            const [preview, ctx] = await Promise.all([post('socface_preview', {households: parsed.households}), readingContext(h0.department, h0.commune)]);
            const doubts = LX() ? LX().checkHouseholds(parsed.households.map(h => ({year: h.year, rows: h.members})), ctx) : [];
            state = {households: parsed.households, preview, ctx, doubts, format: parsed.format};
            const nDoubts = doubts.reduce((n, d) => n + d.length, 0);
            const people = parsed.households.reduce((n, h) => n + h.members.length, 0);
            return {count: parsed.households.length, noun: 'foyer de recensement', many: 'foyers de recensement',
                summaryHtml: `<b>${esc(plural(parsed.households.length, 'foyer de recensement', 'foyers de recensement'))}</b> (${esc(plural(people, 'personne'))})`,
                notices: [{kind: 'warn', text: mention() + '. Chaque foyer reste « À vérifier » jusqu’à ce que tu coches « Vérifié sur l’image ».'}, ...parsed.notices,
                    ...(nDoubts ? [{kind: 'info', text: `${plural(nDoubts, 'lecture douteuse', 'lectures douteuses')} repérée${nDoubts > 1 ? 's' : ''} (lettres ou chiffres qui se ressemblent, abréviations…) : clique sur « doute » pour voir pourquoi et corriger avant d’importer.`}] : []),
                    {kind: 'info', text: 'Rien n’est relié à une fiche sans ton accord : choisis « Relier à… » seulement si c’est bien la même personne. Aucune donnée de tes fiches n’est remplacée.'}],
                preview: `<div class="sf-preview">${previewHtml()}</div>`,
                onShow: body => bindPreview(body)};
        };
        const bindPreview = body => {
            const box = body.querySelector('.sf-preview'); if (!box) return;
            const showEcarts = sel => { const [hi, mi] = sel.dataset.sfLink.split(':'); box.querySelectorAll(`[data-sf-ec-for^="${hi}:${mi}:"]`).forEach(li => { li.hidden = li.dataset.sfEcFor !== `${hi}:${mi}:${sel.value}`; }); };
            box.addEventListener('change', e => {
                const sel = e.target.closest('[data-sf-link]'); if (sel) showEcarts(sel);
                const keep = e.target.closest('[data-sf-keep]'); if (keep) { const [hi, mi] = keep.dataset.sfKeep.split(':').map(Number); state.households[hi].members[mi].skip = !keep.checked; }
            });
            box.addEventListener('click', e => {
                const b = e.target.closest('[data-sf-doubts]'); if (!b) return;
                const [hi, mi] = b.dataset.sfDoubts.split(':').map(Number);
                openVerify({household: state.households[hi], row: mi, ctx: state.ctx, mode: 'preview', onApply: () => {
                    const h = state.households[hi];
                    state.doubts[hi] = doubtsOf(h.members, h.year, state.ctx);
                    const keepLinks = [...box.querySelectorAll('[data-sf-link]')].map(s => [s.dataset.sfLink, s.value]);
                    box.innerHTML = previewHtml();
                    keepLinks.forEach(([k, v]) => { const s = box.querySelector(`[data-sf-link="${k}"]`); if (s) { s.value = v; showEcarts(s); } });
                }});
            });
        };
        const run = async (an, files, body) => {
            const links = {}; body.querySelectorAll('[data-sf-link]').forEach(s => { links[s.dataset.sfLink] = Number(s.value) || 0; });
            const hs = state.households.map((h, hi) => ({...h, members: h.members.map((m, mi) => ({...m, person_id: links[`${hi}:${mi}`] || 0}))}));
            const r = await post('socface_import', {households: hs});
            const refresh = () => { window.dispatchEvent(new CustomEvent('lcnda:socface-changed')); if (S().module !== 'recherche') { try { A().refreshScreen?.(); } catch (_) {} } };
            refresh();
            const msg = `${plural(r.created, 'foyer importé', 'foyers importés')}${r.linked ? `, ${plural(r.linked, 'fiche reliée', 'fiches reliées')}` : ''}${r.skipped ? ` (${plural(r.skipped, 'déjà là', 'déjà là')})` : ''} — à vérifier sur l’image.`;
            return {message: msg, undo: async () => { await post('socface_undo', {batch: r.batch}); refresh(); }};
        };
        return UI().openImportDialog({title: 'Importer des recensements SocFace', accept: '.csv,.txt,.tsv,text/csv,text/plain', what: 'CSV de FranceArchives ou texte d’une fiche',
            intro: 'Le CSV d’une notice (« Télécharger la notice en CSV »), l’export d’une recherche (« Exporter les résultats »), ou le texte d’une fiche copié dans un fichier .txt. Rien n’est demandé à FranceArchives : seul ton fichier est lu.',
            hint: '', noun: 'foyer de recensement', many: 'foyers de recensement', analyze, run, files: o.files});
    }
    /** le texte d'une fiche collé : il devient un petit fichier .txt remis à la même fenêtre d'import */
    function openPaste() {
        const dlg = document.createElement('dialog'); dlg.className = 'modal sf-paste';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">RECENSEMENTS SOCFACE</span><h2>📋 Coller le texte d’une fiche</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="h-dialog-body"><p class="ui-hint">Sur la fiche FranceArchives, sélectionne tout le texte (de « Naissance » jusqu’à « Voir les autres membres du ménage »), copie-le, puis colle-le ici. Tu peux coller plusieurs fiches à la suite.</p>
            <textarea name="t" rows="12" placeholder="Naissance&#10;1879 ; Tulle&#10;Lien avec le chef de ménage&#10;épouse&#10;…"></textarea></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>Annuler</button><button type="submit" class="button">Continuer</button></div></form>`;
        document.body.appendChild(dlg);
        dlg.addEventListener('click', e => { if (e.target.closest('[data-x]')) dlg.close(); });
        dlg.querySelector('form').addEventListener('submit', e => {
            e.preventDefault(); const t = dlg.querySelector('textarea').value.trim();
            if (!t) { const ta = dlg.querySelector('textarea'); return UI().fail ? UI().fail(ta, 'Colle le texte d’une fiche.') : toast('Colle le texte d’une fiche.'); }
            dlg.close(); openImport({files: [new File([t], 'fiche-socface.txt', {type: 'text/plain'})]});
        });
        dlg.addEventListener('close', () => dlg.remove());
        dlg.showModal();
    }

    /* ═════ 🔍 Vérifier cette ligne SocFace ═════
     * mode 'preview' : la ligne n'est pas encore importée, la correction change la ligne en mémoire ;
     * mode 'saved' : socface_fix (l'ancienne lecture est gardée) + message H7 « ↶ Annuler ». */
    function openVerify(o) {
        const h = o.household, rows = h.members;
        let row = Math.max(0, Math.min(rows.length - 1, o.row || 0));
        const dlg = document.createElement('dialog'); dlg.className = 'modal modal-l sf-verify';
        document.body.appendChild(dlg);
        const draw = () => {
            const m = rows[row], ds = doubtsOf(rows, h.year, o.ctx || {}, o.others).filter(d => d.row === row);
            const all = doubtsOf(rows, h.year, o.ctx || {}, o.others);
            const val = f => f === 'gender' ? genderTxt(m.gender) : f === 'age' ? (m.age ? `${m.age} ans` : '') : (m[f] ?? '');
            const fields = ORDER.filter(f => val(f) !== '' && val(f) != null || ds.some(d => d.field === f));
            const orig = m.orig || {};
            dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">RECENSEMENT DE ${h.year}${h.commune || h.place ? ' · ' + esc(String(h.commune || h.place).toUpperCase()) : ''} · LIGNE ${row + 1} SUR ${rows.length}</span><h2>🔍 Vérifier cette ligne SocFace</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
                <div class="h-dialog-body sf-verify-body"><div class="sf-verify-main">
                    ${UI().notice('warn', mention() + '.')}
                    <p class="sf-verify-who"><b>${esc(m.first)} ${esc(String(m.last || '').toUpperCase())}</b>${m.person_name ? ` · relié à <button type="button" class="table-link" data-open-person="${Number(m.person_id)}">${esc(m.person_name)}</button>` : ''}</p>
                    <div class="data-table-wrap"><table class="data-table sf-verify-table"><thead><tr><th>Case</th><th>Lu par SocFace</th><th>Doute</th></tr></thead><tbody>
                    ${fields.map(f => { const fd = ds.filter(d => d.field === f || (f === 'age' && d.field === 'birth_year' && !fields.includes('birth_year')));
                        return `<tr class="${fd.some(d => d.level === 'orange') ? 'is-orange' : fd.length ? 'is-yellow' : ''}"><td class="sf-k">${esc(FIELD[f] || f)}</td><td><b>${esc(val(f))}</b>${orig[f] !== undefined && orig[f] !== val(f) ? `<br><small class="muted">lu d’abord : « ${esc(orig[f])} »</small>` : ''}</td>
                        <td>${fd.length ? fd.map(d => `<p class="sf-doubt"><span title="${esc(LEVEL[d.level]?.[1] || '')}">${LEVEL[d.level]?.[0] || '🟡'}</span> ${esc(d.why)}</p>${(d.proposals || []).length ? `<p class="sf-props">${d.proposals.map(p => `<button type="button" class="button small secondary" data-sf-apply="${esc(p.field || d.field)}" data-sf-value="${esc(p.value)}" title="${esc(p.why || '')}">${p.field && p.field !== d.field ? `${esc(FIELD[p.field] || p.field)} : « ${esc(p.value)} »` : `Utiliser « ${esc(p.value)} »`}</button>`).join('')}</p>` : ''}`).join('') : '<small class="muted">✓ rien de suspect</small>'}</td></tr>`; }).join('')}
                    </tbody></table></div>
                    <p class="ui-hint">Une proposition n’est jamais appliquée toute seule : regarde l’image, puis clique si elle est juste.${o.mode === 'saved' ? ' Tu peux toujours faire « ↶ Annuler ».' : ''}</p>
                </div>
                <aside class="sf-verify-side">
                    <h3>L’original</h3>
                    ${h.image_url ? btnLink(h.image_url, imgLabel(h.image_url), 'button') : empty('Pas de lien vers l’image dans le fichier.', '🖼')}
                    ${btnLink(m.url || h.url || h.origin_url, '↗ Notice FranceArchives')}
                    <p class="muted">${esc([h.cote ? 'Cote ' + h.cote : '', m.page ? 'page ' + m.page : h.page_line || '', m.line ? 'ligne ' + m.line : ''].filter(Boolean).join(' · '))}</p>
                    <h3>Ce ménage</h3><ol class="sf-verify-rows">${rows.map((r, i) => { const n = all.filter(d => d.row === i); return `<li><button type="button" class="link-button${i === row ? ' is-active' : ''}" data-sf-row-go="${i}">${esc(r.first)} ${esc(String(r.last || '').toUpperCase())}</button> ${n.length ? (n.some(d => d.level === 'orange') ? '🟠' : '🟡') : '<small class="muted">✓</small>'}</li>`; }).join('')}</ol>
                </aside></div>
                <div class="modal-actions"><button type="button" class="button secondary" data-sf-prev ${row ? '' : 'disabled'}>‹ Ligne d’avant</button><button type="button" class="button secondary" data-sf-next ${row < rows.length - 1 ? '' : 'disabled'}>Ligne suivante ›</button><span class="spacer"></span><button type="button" class="button" data-x>Fermer</button></div></form>`;
        };
        const empty = (t, i) => `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">${i}</span><span class="empty-line-text">${esc(t)}</span></p>`;
        dlg.addEventListener('click', async e => {
            if (e.target.closest('[data-x]')) { dlg.close(); return; }
            const go = e.target.closest('[data-sf-row-go]'); if (go) { row = Number(go.dataset.sfRowGo); draw(); return; }
            if (e.target.closest('[data-sf-prev]')) { row = Math.max(0, row - 1); draw(); return; }
            if (e.target.closest('[data-sf-next]')) { row = Math.min(rows.length - 1, row + 1); draw(); return; }
            if (e.target.closest('[data-open-person]')) { dlg.close(); return; }
            const ap = e.target.closest('[data-sf-apply]'); if (!ap) return;
            const field = ap.dataset.sfApply, value = ap.dataset.sfValue, m = rows[row], old = m[field];
            if (o.mode === 'saved') {
                ap.disabled = true;
                try {
                    const r = await post('socface_fix', {member_id: m.id, field, value});
                    m.orig = m.orig || {}; if (m.orig[field] === undefined) m.orig[field] = old; m[field] = field === 'age' ? String(value) : value;
                    draw(); o.onApply?.();
                    A().undoToast?.(`${FIELD[field] || field} : « ${old ?? ''} » → « ${value} »`, {undo: async () => { await post('socface_fix', {member_id: m.id, field, value: r.old ?? old ?? ''}); m[field] = r.old ?? old; draw(); o.onApply?.(); }});
                } catch (err) { ap.disabled = false; toast(err.message, 'error'); }
            } else {
                m.orig = m.orig || {}; if (m.orig[field] === undefined) m.orig[field] = old;
                m[field] = field === 'birth_year' ? Number(value) || null : value;
                draw(); o.onApply?.();
                A().undoToast?.(`${FIELD[field] || field} : « ${old ?? ''} » → « ${value} » (avant l’import)`, {undo: () => { m[field] = old; draw(); o.onApply?.(); }});
            }
        });
        dlg.addEventListener('keydown', e => { if (e.key === 'ArrowRight' && e.altKey) { row = Math.min(rows.length - 1, row + 1); draw(); } if (e.key === 'ArrowLeft' && e.altKey) { row = Math.max(0, row - 1); draw(); } });
        dlg.addEventListener('close', () => dlg.remove());
        draw(); dlg.showModal();
        return dlg;
    }
    /** « 🔍 Vérifier » d'un foyer déjà importé (fiche, liste, Contrôle de la base) */
    async function verifySaved(censusId, memberId = 0) {
        let d; try { d = await api('socface_list', {census_id: censusId}); } catch (e) { toast(e.message, 'error'); return; }
        const r = (d.records || [])[0]; if (!r) { toast('Foyer SocFace introuvable.', 'error'); return; }
        const ctx = await readingContext(r.county || '', r.place || '');
        // les autres recensements de la même personne (âge cohérent ?)
        const others = {};
        await Promise.all(r.members.map(async (m, i) => {
            if (!m.person_id) return;
            try { const pr = await api('socface_person', {person_id: m.person_id}); others[i] = (pr.records || []).filter(x => Number(x.id) !== Number(r.id)).flatMap(x => x.members.filter(y => Number(y.person_id) === Number(m.person_id)).map(y => ({year: x.year, age: y.age, birth_year: y.birth_year}))); } catch (_) {}
        }));
        const row = Math.max(0, r.members.findIndex(m => Number(m.id) === Number(memberId)));
        openVerify({household: {...r, commune: r.place}, row, ctx, others, mode: 'saved', onApply: () => window.dispatchEvent(new CustomEvent('lcnda:socface-changed'))});
    }

    /* ═════ Sur la fiche : bloc Recensements ═════ */
    /** les boutons du bloc Recensements d'une fiche (app.js : renderCensusCard) */
    const cardButtons = person => `<div class="sf-card-actions"><button class="button small secondary" type="button" data-sf-search-person="${Number(person.id)}" title="Ouvre FranceArchives dans ton navigateur, avec le nom, la commune et les années remplis">🔍 Chercher dans les recensements (SocFace)</button><button class="button small secondary" type="button" data-sf-import="${Number(person.id)}">⤒ Importer des recensements SocFace</button></div>`;
    /** dans un recensement importé : la pastille À VÉRIFIER / VÉRIFIÉ, la mention, les liens, « Vérifié sur l'image », les écarts */
    function censusExtraHtml(record, locked = false) {
        if (record?.origin !== 'socface') return '';
        const v = Number(record.verified) === 1;
        return `<div class="sf-rec" data-sf-rec="${Number(record.id)}">
            <p class="sf-rec-head">${UI().badge(v ? 'Vérifié' : 'À vérifier', v ? 'green' : 'yellow', {title: v ? 'Coché « Vérifié sur l’image »' : 'Lu par SocFace, à vérifier sur l’image'})} <small class="muted">${esc(mention())}</small></p>
            <p class="sf-rec-acts">${btnLink(record.image_url, imgLabel(record.image_url))}${btnLink(record.origin_url, '↗ Notice FranceArchives')}<button type="button" class="button small secondary" data-sf-verify-census="${Number(record.id)}">🔍 Vérifier</button>
            ${locked ? '' : `<label class="ui-toggle sf-verified"><input type="checkbox" data-sf-verified="${Number(record.id)}" ${v ? 'checked' : ''}><i></i>Vérifié sur l’image</label>`}</p>
            <ul class="sf-ecarts" data-sf-ecarts="${Number(record.id)}"></ul></div>`;
    }
    /** détails des recensements repliés : les foyers SocFace restent visibles (pastille, liens, « Vérifié sur l'image ») */
    const summaryHtml = (records = [], expanded = false, locked = false) => expanded ? '' : records.filter(r => r?.origin === 'socface').map(r => `<div class="sf-rec-sum"><b>🧾 Recensement de ${Number(r.year)}${r.place_name ? ' · ' + esc(r.place_name) : ''}</b>${censusExtraHtml(r, locked)}</div>`).join('');
    /** les écarts SocFace ↔ fiche, remplis après l'affichage de la fiche */
    let fillT = 0;
    function fillEcarts() {
        if (fillT) return; // une seule attente à la fois (la page change sans arrêt : pas de « debounce » qui n'arrive jamais)
        fillT = setTimeout(async () => {
            fillT = 0;
            const boxes = [...document.querySelectorAll('[data-sf-ecarts]:not([data-sf-done])')]; if (!boxes.length) return;
            const pid = Number(S().currentPersonId) || 0; if (!pid) return;
            boxes.forEach(b => b.setAttribute('data-sf-done', '1'));
            let d; try { d = await api('socface_person', {person_id: pid}); } catch (_) { return; }
            for (const r of d.records || []) {
                const box = document.querySelector(`[data-sf-ecarts="${Number(r.id)}"]`); if (!box) continue;
                const mine = (r.ecarts || []).filter(e => Number(e.person_id) === pid);
                box.innerHTML = mine.map(e => `<li class="sf-ecart is-${esc(e.level)}">${LEVEL[e.level]?.[0] || '🟡'} ${esc(e.text)}</li>`).join('');
            }
        }, 120);
    }

    /* ═════ Recherche → 🧾 Recensements SocFace ═════ */
    async function page(token) {
        const st = S(); const v = st.socfaceView ||= {status: 'todo', q: ''};
        const ws = document.getElementById('workspace');
        ws.innerHTML = `<section class="page sf-page">${UI().spinner('Les foyers importés de SocFace…')}</section>`;
        let d; try { d = await api('socface_list', {status: v.status, q: v.q}); } catch (e) { ws.innerHTML = `<section class="page">${UI().notice('error', e.message)}</section>`; return; }
        if (token !== undefined && (token !== st.workspaceToken || st.module !== 'recherche')) return;
        const c = d.counts || {all: 0, todo: 0, verified: 0};
        const pill = (k, label, n) => `<button type="button" class="${v.status === k ? 'is-active' : ''}" data-sf-status="${k}">${esc(label)} (${n})</button>`;
        const rows = (d.records || []).map(r => {
            const chef = r.members.find(m => m.is_primary) || r.members[0] || {};
            const linked = r.members.filter(m => m.person_id);
            return `<article class="sf-item" data-sf-item="${Number(r.id)}">
                <div class="sf-item-main"><h3>📋 ${r.year} · ${esc(r.place || 'commune ?')} — ménage ${esc(chef.first || '')} ${esc(String(chef.last || '').toUpperCase())} ${UI().badge(r.verified ? 'Vérifié' : 'À vérifier', r.verified ? 'green' : 'yellow')}</h3>
                <p class="muted">${esc(plural(r.members.length, 'personne'))}${r.cote ? ' · cote ' + esc(r.cote) : ''}${r.page_line ? ' · ' + esc(r.page_line) : ''} · ${UI().when ? UI().when(r.created_at, {label: 'Importé'}) : esc(r.created_at)}</p>
                <p class="sf-item-people">${r.members.map(m => m.person_id ? `<button type="button" class="table-link" data-open-person="${Number(m.person_id)}">${esc(m.first)} ${esc(String(m.last || '').toUpperCase())}</button>` : `<span class="sf-unlinked" title="Pas de fiche reliée">? ${esc(m.first)} ${esc(String(m.last || '').toUpperCase())}</span>`).join(' · ')}</p></div>
                <div class="sf-item-acts">${btnLink(r.image_url, imgLabel(r.image_url))}${btnLink(r.origin_url, '↗ Notice')}<button type="button" class="button small secondary" data-sf-verify-census="${Number(r.id)}">🔍 Vérifier</button><label class="ui-toggle sf-verified"><input type="checkbox" data-sf-verified="${Number(r.id)}" ${r.verified ? 'checked' : ''}><i></i>Vérifié sur l’image</label>${linked.length ? '' : ''}</div></article>`;
        }).join('');
        ws.innerHTML = `<section class="page sf-page">${UI().pageHeader({where: 'Recherche · Archives en ligne', icon: '🧾', title: 'Recensements SocFace', help: 'Les listes nominatives des recensements de 1836 à 1936, lues par intelligence artificielle (projet SocFace) et publiées sur FranceArchives. Cherche sur le site, télécharge le CSV, importe-le ici : chaque ménage devient un foyer de recensement, à vérifier sur l’image.',
                primary: '<button type="button" class="button" data-sf-open-search>🔍 Chercher sur FranceArchives</button>', actions: ['<button type="button" class="button secondary" data-sf-import>⤒ Importer…</button>'], more: ['<button type="button" data-sf-paste>📋 Coller le texte d’une fiche</button>']})}
            ${UI().notice('warn', mention() + '. L’app ne se connecte jamais à FranceArchives : elle ouvre le site dans ton navigateur et lit seulement les fichiers que tu lui donnes.')}
            <div class="sf-bar"><input type="search" class="sf-q" data-sf-q value="${esc(v.q)}" placeholder="Chercher… (nom, commune, année, cote)" aria-label="Chercher dans les foyers importés">
                <div class="ui-filters">${pill('todo', '🟡 À vérifier', c.todo)}${pill('verified', '✓ Vérifiés', c.verified)}${pill('all', 'Tout', c.all)}</div></div>
            <div class="sf-list">${rows || (c.all ? A().empty('Rien avec ces filtres.', {icon: '🔍'}) : A().emptyState({icon: '🧾', text: 'Aucun recensement SocFace importé pour l’instant', hint: 'Cherche un ancêtre sur FranceArchives, télécharge la notice ou les résultats en CSV, puis importe le fichier.', action: {label: '🔍 Chercher sur FranceArchives', attrs: 'data-empty-click="[data-sf-open-search]"'}}))}</div></section>`;
        ws.querySelector('[data-sf-open-search]').addEventListener('click', () => openSearch({}));
        ws.querySelectorAll('[data-sf-import]').forEach(b => b.addEventListener('click', () => openImport({})));
        ws.querySelector('[data-sf-paste]')?.addEventListener('click', () => openPaste());
        ws.querySelectorAll('[data-sf-status]').forEach(b => b.addEventListener('click', () => { v.status = b.dataset.sfStatus; page(++st.workspaceToken); }));
        let t = 0; ws.querySelector('[data-sf-q]').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { v.q = e.target.value; const pos = e.target.selectionStart; page(++st.workspaceToken).then(() => { const q = document.querySelector('[data-sf-q]'); q?.focus(); try { q?.setSelectionRange(pos, pos); } catch (_) {} }); }, 300); });
        A().bindTableLinks?.();
    }

    /* ═════ Les clics communs (fiche, liste, Contrôle de la base, Que manque-t-il ?) ═════ */
    document.addEventListener('click', e => {
        const s = e.target.closest('[data-sf-search-person]'); if (s) { e.preventDefault(); searchFromPerson(Number(s.dataset.sfSearchPerson)); return; }
        const im = e.target.closest('[data-sf-import]'); if (im && !im.closest('.sf-page')) { e.preventDefault(); openImport({personId: Number(im.dataset.sfImport) || 0}); return; }
        const vb = e.target.closest('[data-sf-verify-census]'); if (vb) { e.preventDefault(); verifySaved(Number(vb.dataset.sfVerifyCensus), Number(vb.dataset.sfMember) || 0); return; }
    });
    document.addEventListener('change', async e => {
        const cb = e.target.closest('[data-sf-verified]'); if (!cb) return;
        const id = Number(cb.dataset.sfVerified), val = cb.checked;
        try {
            await post('socface_verify', {census_id: id, verified: val ? 1 : 0});
            const redo = async to => { await post('socface_verify', {census_id: id, verified: to ? 1 : 0}); window.dispatchEvent(new CustomEvent('lcnda:socface-changed')); if (S().module !== 'recherche') { try { A().refreshScreen?.(); } catch (_) {} } };
            A().undoToast?.(val ? 'Foyer coché « Vérifié sur l’image »' : 'Foyer de nouveau « À vérifier »', {undo: () => redo(!val), redo: () => redo(val)});
            const box = cb.closest('[data-sf-rec], [data-sf-item]'); const badge = box?.querySelector('.ui-badge');
            if (badge) badge.outerHTML = UI().badge(val ? 'Vérifié' : 'À vérifier', val ? 'green' : 'yellow');
        } catch (err) { cb.checked = !val; toast(err.message, 'error'); }
    });
    window.addEventListener('lcnda:socface-changed', () => { if (S()?.module === 'recherche' && S().researchKind === 'socface') page(++S().workspaceToken); });
    // les écarts de la fiche : remplis dès qu'un bloc SocFace apparaît
    const mo = new MutationObserver(() => { if (document.querySelector('[data-sf-ecarts]:not([data-sf-done])')) fillEcarts(); });
    const start = () => { mo.observe(document.body, {childList: true, subtree: true}); fillEcarts(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

    ext.socface = {url: p => SF().searchUrl(p), openSearch, searchFromPerson, openImport, openPaste, openVerify, verifySaved, cardButtons, censusExtraHtml, summaryHtml, page, readingContext};
})();
