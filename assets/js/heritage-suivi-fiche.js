/* LCNDA — 🐾 Suivi des animaux : la fiche d'un animal (Listes → Animaux, heritage-pets.js) reçoit ses onglets de suivi
 * (maquette docs/design/animaux-suivi.html : S5 marques, S6 observations, S13 trajets, S17 santé, S18 événement de santé)
 * et, en plus de la maquette, l'onglet « 👥 Groupe » (groupe, clan, meute, troupe, pod : rôle, entrée, changement de
 * rôle, départ, exclusion, mort, passage dans un autre groupe, avec une frise). Les marques suivent l'espèce
 * (oiseau, chat, chien, cheval, ferme, poisson, animal marin, mammifère sauvage, primate) ; les couleurs des bagues : les
 * couleurs de base d'office + l'outil commun C2 (pipette, autre couleur, code #, récentes).
 * Les outils communs (carte, données, pastilles…) viennent de heritage-suivi.js (ext.suivi.U).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.suivi = ext.suivi || {};
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI || {}, P = () => window.LCNDA_PICKER, C = () => window.LCNDA_SUIVI;
    const U = () => ext.suivi.U;
    const esc = v => U().esc(v);

    /* ═════════ Fiche animal unique (fiche-sections.html, F4–F7) : les onglets du suivi deviennent des BLOCS de la fiche complète ═════════
     * « 🔖 Bagues et marques » (Marques pour un animal qui n'est pas un oiseau), « 👁 Observations », « 🩺 Santé » (avec heritage-pets.js),
     * « 👥 Groupe », « 🗺 Carte / trajets » : rangés dans leurs sections (app-sections.js). Les mêmes fonctions qu'avant (marksTab, obsTab…)
     * dessinent chacune dans son bloc (ctx.panel) ; une écriture relit le suivi et redessine tous les blocs. */
    const SV_BLOCKS = {animal_marks: 'marks', animal_obs: 'obs', animal_group: 'group', animal_map: 'map'};
    const isBird = a => (a?.data?.species || '') === 'oiseau' || /oiseau/.test(String(a?.data?.species || ''));
    const holder = (kind, petId) => `<div class="sv-pet-panel" data-sv-block="${kind}" data-sv-pet-id="${Number(petId)}">${UI().spinner ? UI().spinner('Le suivi…') : '<p class="muted">Chargement…</p>'}</div>`;
    ext.personBlocks = ext.personBlocks || {};
    const svTitle = {marks: a => (isBird(a) ? '🔖 Bagues et marques' : '🔖 Marques'), obs: () => '👁 Observations', group: () => '👥 Groupe', map: a => (a?.suivi?.gps ? '🗺 Trajets' : '🗺 Carte')};
    const svCount = {marks: a => a?.suivi?.marks || '', obs: a => a?.suivi?.obs ?? 0, group: a => a?.suivi?.groups || '', map: () => ''};
    Object.entries(SV_BLOCKS).forEach(([key, kind]) => {
        ext.personBlocks[key] = (index, detail) => {
            const a = detail.heritage?.animal; if (detail.person?.kind !== 'animal' || !a) return '';
            const ro = U()?.RO?.(), acts = kind === 'obs' && !ro ? `<button type="button" class="button small" data-sv-new-obs="${Number(a.id)}">＋ Nouvelle observation</button>` : kind === 'map' && !ro ? `<button type="button" class="button small secondary" data-sv-import="${Number(a.id)}">⤒ Importer un trajet…</button>` : '';
            return A().card(index, svTitle[kind](a), svCount[kind](a), holder(kind, a.id), 'span-12', acts);
        };
    });
    /** 🩺 la partie « suivi » du bloc Santé (frise des états, courbe du poids, événements de santé) : posée par heritage-pets.js */
    ext.suivi.healthHolder = petId => holder('health', petId);
    const TABS = () => ({marks: marksTab, obs: obsTab, health: healthTab, group: groupTab, map: mapTab});
    let fillSeq = 0;
    /** remplit les blocs du suivi de la fiche ouverte (après son dessin) */
    async function fillBlocks(detail) {
        const a = detail?.heritage?.animal, ws = document.getElementById('workspace');
        if (detail?.person?.kind !== 'animal' || !a || !ws) return;
        const seq = ++fillSeq, id = Number(a.id);
        let det, D;
        try { [det, D] = await Promise.all([U().api('suivi', {op: 'animal', id}), U().overview(true)]); } catch (e) { console.error(e); ws.querySelectorAll('[data-sv-block]').forEach(h => { h.innerHTML = A().empty('Le suivi n’a pas pu être lu.', {icon: '⚠️'}); }); return; }
        if (seq !== fillSeq) return;
        const me = U().animalById(D, id) || {id, title: a.title, species: det.species, marks: det.marks};
        const prof = det.profile?.profile || det.guess || 'autre', PR = C().PROFILES[prof] || C().PROFILES.autre;
        const st = A().state, again = () => { if (st.module === 'personnes' && st.currentPersonId) A().selectPerson(st.currentPersonId, false); };
        const ctx = {id, det, D, me, prof, PR, again, gpsAll: null};
        const draw = () => {
            document.querySelectorAll('#workspace [data-sv-block]').forEach(h => {
                if (Number(h.dataset.svPetId) !== id) return;
                const panel = document.createElement('div'); panel.className = 'sv-pet-panel'; panel.dataset.svBlock = h.dataset.svBlock; panel.dataset.svPetId = String(id);
                h.replaceWith(panel);
                try { TABS()[h.dataset.svBlock]?.({...ctx, panel, reload: ctx.reload}); } catch (e) { console.error(e); panel.innerHTML = A().empty(`Ce bloc n’a pas pu être dessiné : ${e.message || 'erreur'}`, {icon: '⚠️'}); }
            });
            const seen = document.querySelector('#workspace [data-lc-seen]'); if (seen) paintSeen(seen, ctx);
        };
        ctx.reload = async () => { U().invalidate(); try { const [d2, D2] = await Promise.all([U().api('suivi', {op: 'animal', id}), U().overview(true)]); ctx.det = d2; ctx.D = D2; ctx.me = U().animalById(D2, id) || ctx.me; } catch (e) { console.error(e); } draw(); };
        ext.suivi.ficheCtx = ctx;
        draw();
    }
    ext.afterPerson = ext.afterPerson || [];
    ext.afterPerson.push(detail => { fillBlocks(detail); });

    /* ═════════ 👁 Vu la dernière fois (élément de l'en-tête, F9) ═════════ */
    const dayDiff = iso => { if (!/^\d{4}-\d{2}-\d{2}/.test(iso || '')) return null; const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((t - new Date(`${String(iso).slice(0, 10)}T00:00:00`)) / 864e5); };
    /** la pastille K8 : vert (< seuil vert), jaune (jusqu'au seuil « pas revu »), rouge au-delà, gris : jamais vu */
    function seenBadge(iso, hc) {
        const d = dayDiff(iso);
        if (d == null) return {kind: 'grey', text: 'Jamais vu depuis le baguage'};
        const when = d <= 0 ? 'Vu aujourd’hui' : d === 1 ? 'Vu hier' : `Vu il y a ${U().plural(d, 'jour')}`;
        if (d < hc.green) return {kind: 'green', text: when};
        if (d < hc.red) return {kind: 'yellow', text: when};
        return {kind: 'red', text: `Pas revu depuis ${U().plural(d, 'jour')}`};
    }
    ext.suivi.seenBadge = seenBadge;
    function paintSeen(el, ctx) {
        const hc = ext.sheetHead ? ext.sheetHead() : {green: 7, red: 30, seenDetail: true};
        const {det, D, me} = ctx;
        const followed = det.profile || det.marks.length || det.observations.length || det.gps?.n;
        if (!followed) { el.hidden = true; el.innerHTML = ''; return; }
        const last = U().lastSeen(me), o = det.observations.find(x => x.pet_id === ctx.id && x.iso === last?.iso) || det.observations[0] || null;
        const b = seenBadge(last?.iso, hc), stamp = last?.iso ? `${last.iso}${last.time ? ` ${last.time}` : ''}` : '';
        const place = o ? U().placeOfObs(o, D) : (last?.place || ''), who = o?.observer || '';
        const badge = UI().badge(b.text, b.kind, {title: stamp ? (UI().whenFull?.(stamp) || '') : '', cls: 'lc-seen-badge'});
        el.hidden = false;
        if (!hc.seenDetail || el.classList.contains('is-compact')) { el.innerHTML = `<span class="lc-seen-line"${o ? ` data-sv-obs="${o.id}" role="button" tabindex="0"` : ''} title="${esc([place && `📍 ${place}`, who && `par ${who}`].filter(Boolean).join(' · '))}">${badge.replace(/>([^<]*)</, '>👁 $1<')}</span>`; }
        else el.innerHTML = `${badge}${stamp ? `<span class="lc-seen-line"${o ? ` data-sv-obs="${o.id}" role="button" tabindex="0" title="Ouvrir cette observation"` : ''}>👁 Vu la dernière fois : ${UI().when ? UI().when(stamp) : esc(stamp)}${place ? ` · 📍 ${o?.place_id ? `<button type="button" class="link-button" data-open-place-id="${Number(o.place_id)}">${esc(place)} ↗</button>` : esc(place)}` : ''}${who ? ` · par ${o?.observer_id ? `<button type="button" class="link-button" data-open-person="${Number(o.observer_id)}">${esc(who)}</button>` : esc(who)}` : ''}</span>` : ''}`;
        const pill = document.querySelector('#workspace [data-lc-obs-ago]'); if (pill) { const d = dayDiff(last?.iso); pill.textContent = d == null ? '' : d <= 0 ? ' · vu aujourd’hui' : d === 1 ? ' · vu hier' : ` · vu il y a ${d} j`; }
    }
    /** appelé par l'en-tête (app-apparence.js) : la place est prête, le suivi la remplit quand il est lu */
    ext.suivi.fillSeen = el => { const c = ext.suivi.ficheCtx; if (c && Number(el.dataset.lcSeen) === c.id) paintSeen(el, c); else el.hidden = true; };
    // la bande d'actions rapides : 🩺＋ Santé, 🔖 Marque
    document.addEventListener('click', e => {
        const pl = e.target.closest?.('[data-open-place-id]'); if (pl) { e.preventDefault(); e.stopPropagation(); const sc = ext.shortcuts; if (sc?.openTarget && sc.canOpen?.('place')) sc.openTarget(`place:${Number(pl.dataset.openPlaceId)}`, {title: pl.textContent}); return; }
        const h = e.target.closest?.('[data-sv-health-new]'); if (h) { e.preventDefault(); openHealth({petId: Number(h.dataset.svHealthNew), ctx: ext.suivi.ficheCtx}); return; }
        const mk = e.target.closest?.('[data-lc-mark-new]'); if (mk) { e.preventDefault(); window.LCNDA_SECTIONS?.revealBlock?.('animal_marks'); setTimeout(() => document.querySelector('#workspace [data-pblock="animal_marks"] [data-sv-mark-add], #workspace [data-pblock="animal_marks"] [data-sv-mark-new]')?.click(), 120); }
    });

    /* ═════════ S5 : 🔖 Bagues et marques ═════════ */
    const LEG = {L: 'Patte gauche', R: 'Patte droite'};
    const ringWords = r => !r ? 'rien' : r.metal ? 'bague métal' : `${(C().colorInfo(C().colorKey(r.color))?.[1] || r.name || 'couleur')}${C().colorKey(r.color) && C().colorInfo(C().colorKey(r.color))?.[2] !== r.color ? ' (' + r.color + ')' : ''}${r.code ? `, gravé « ${r.code} »` : ''}`;
    /** Les pattes avec les bagues posées, en grand (S5, S14) */
    function legsBig(colors) {
        const slot = (r, x, y) => !r ? '' : `<rect x="${x}" y="${y}" width="34" height="30" rx="3" fill="${esc(r.metal ? '#c0c4c8' : r.color)}" stroke="var(--sv-ring-line, #222)" stroke-width="1.5"/>${r.code ? `<text x="${x + 17}" y="${y + 20}" text-anchor="middle" font-size="13" font-weight="800" fill="${esc(r.code_color || '#111')}">${esc(r.code)}</text>` : r.metal ? `<text x="${x + 17}" y="${y + 19}" text-anchor="middle" font-size="8" fill="#333">EA…</text>` : ''}`;
        return `<svg class="sv-legs is-big" viewBox="0 0 220 170" role="img" aria-label="${esc(C().comboText(colors))}"><line x1="62" y1="6" x2="62" y2="130" stroke="currentColor" stroke-width="7"/><line x1="158" y1="6" x2="158" y2="130" stroke="currentColor" stroke-width="7"/><path d="M62 130 l-24 20 M62 130 l24 20 M62 130 v22 M158 130 l-24 20 M158 130 l24 20 M158 130 v22" stroke="currentColor" stroke-width="5" fill="none"/>${slot(colors.L?.[0], 45, 24)}${slot(colors.L?.[1], 45, 66)}${slot(colors.R?.[0], 141, 24)}${slot(colors.R?.[1], 141, 66)}</svg>`;
    }
    function marksTab(ctx) {
        const {det, prof, PR, panel, id} = ctx, ro = U().RO(), pf = det.profile || {};
        const active = det.marks.filter(m => !m.end_date), metal = active.filter(m => m.kind === 'metal'), rings = active.find(m => m.kind === 'color_rings');
        const others = active.filter(m => !['metal', 'color_rings'].includes(m.kind)), ended = det.marks.filter(m => m.end_date);
        const dl = rows => `<dl class="sv-dl">${rows.filter(r => r[1]).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
        const sexTxt = det.sex === 'M' ? '♂ Mâle' : det.sex === 'F' ? '♀ Femelle' : '? Inconnu';
        const isBird = prof === 'oiseau';
        const history = [...det.marks.map(m => ({iso: m.start_iso, date: m.start_date, html: `${esc(isBird && m.kind === 'color_rings' ? 'Pose des bagues de couleur' : `${C().MARKS[m.kind]?.label || 'Marque'} posée`)}${m.code ? ` « ${esc(m.code)} »` : ''}`})), ...ended.map(m => ({iso: m.end_iso, date: m.end_date, html: `${esc(C().MARKS[m.kind]?.label || 'Marque')}${m.code ? ` « ${esc(m.code)} »` : ''} retirée${m.end_reason ? ` : ${esc(m.end_reason)}` : ''} ${U().badge('Fait', 'green')}`}))].filter(x => x.date).sort((a, b) => (a.iso || '').localeCompare(b.iso || ''));
        const addable = PR.marks.filter(k => !(isBird && ['metal', 'color_rings'].includes(k)));
        panel.innerHTML = `<div class="card-grid dashboard-grid sv-marks">
            <section class="card span-6"><header class="card-head"><div class="card-title"><h3>${isBird ? '🐣 Baguage' : '🪪 Suivi'}</h3></div>${ro ? '' : '<div class="card-head-actions"><button type="button" class="button small secondary" data-sv-prof-edit>✎ Modifier</button></div>'}</header><div class="card-body">
                ${dl([['Espèce', `${esc(PR.icon)} ${esc(pf.taxon || ext.speciesLabel?.(det.species) || det.species || '—')}${pf.sci_name ? ` <i class="muted">${esc(pf.sci_name)}</i>` : ''}`], ['Marques proposées pour', `${esc(PR.icon)} ${esc(PR.label)}`], ['Sexe', esc(sexTxt)],
                    [isBird ? 'Âge au baguage' : 'Âge au marquage', esc({poussin: 'Poussin', jeune: 'Jeune', adulte: 'Adulte', inconnu: 'Inconnu'}[pf.age_class] || '')], ['Date', esc(pf.ringed_date || '')], ['Lieu', pf.ringed_place ? `📍 ${esc(pf.ringed_place.name)}${pf.ringed_place.county ? ` <small class="muted">${esc(pf.ringed_place.county)}</small>` : ''}` : ''],
                    [isBird ? 'Bagueur' : 'Responsable du suivi', esc(pf.ringer || '')], ['Programme', pf.program ? `📚 ${esc(pf.program)}` : ''], ['La maison', pf.home ? `🏠 ${esc(pf.home.name)}` : ''],
                    ['Suivi', esc({suivi: 'en cours', pause: 'en pause', fini: 'terminé', perdu: 'perdu de vue'}[pf.status] || (det.profile ? 'en cours' : 'pas encore commencé'))]])}
                ${!det.profile && !ro ? A().empty('Pas encore de suivi pour cet animal.', {icon: '🐾', action: {label: '✎ Commencer le suivi', attrs: 'data-sv-prof-edit'}}) : ''}</div></section>
            ${isBird ? `<section class="card span-6"><header class="card-head"><div class="card-title"><h3>🎨 Bagues de couleur</h3></div>${ro ? '' : '<div class="card-head-actions"><button type="button" class="button small secondary" data-sv-rings-edit>✎ Modifier</button></div>'}</header><div class="card-body">
                ${rings ? `<div class="sv-rings-big">${legsBig(rings.colors)}<div>${['L', 'R'].map(l => `<p><b>${LEG[l]}</b><br>Haut : ${esc(ringWords(rings.colors[l]?.[0]))}<br>Bas : ${esc(ringWords(rings.colors[l]?.[1]))}</p>`).join('')}<p class="sv-code">${esc(C().comboText(rings.colors))}</p></div></div><p class="muted sv-small">Gauche et droite de l’oiseau (vu de dos). Chaque bague se règle d’un clic : couleur (les couleurs des bagues en tête, ou toute autre couleur), code gravé, couleur du code.</p>` : A().empty('Pas de bagues de couleur.', {icon: '🎨', action: ro ? null : {label: '＋ Poser des bagues', attrs: 'data-sv-rings-edit'}})}
                ${history.length ? `<ol class="sv-hist">${history.map(h => `<li><b>${esc(h.date)}</b><span>${h.html}</span></li>`).join('')}</ol>` : ''}</div></section>
            <section class="card span-6"><header class="card-head"><div class="card-title"><h3>🔩 Bague métal</h3></div>${ro ? '' : `<div class="card-head-actions"><button type="button" class="button small secondary" data-sv-mark-new="metal">＋ Ajouter</button></div>`}</header><div class="card-body">${metal.length ? metal.map(m => `<div class="sv-metal">${esc((m.scheme || 'Bague').toUpperCase())} · ${esc(m.code)}</div>${dl([['Centre', esc(m.scheme)], ['Numéro', `<code>${esc(m.code)}</code>`], ['Patte', esc(m.position)], ['Posée le', esc(m.start_date)]])}${markActs(m, ro)}`).join('') : A().empty('Pas de bague métal.', {icon: '🔩'})}</div></section>` : ''}
            <section class="card span-${isBird ? '6' : '12'}"><header class="card-head"><div class="card-title"><h3>${isBird ? '📡 Autres marques' : `${esc(PR.icon)} Ses marques`}</h3></div>${ro ? '' : '<div class="card-head-actions"><button type="button" class="button small" data-sv-mark-add>＋ Ajouter une marque ▾</button></div>'}</header><div class="card-body">
                ${others.length ? others.map(m => markRow(m, ro)).join('') : A().empty(isBird ? 'Pas de puce, de collier, de marque d’aile ni de balise.' : `Aucune marque pour l’instant (${addable.map(k => C().MARKS[k].label.toLowerCase()).slice(0, 4).join(', ')}…).`, {icon: '🏷️'})}
                ${ended.filter(m => !['color_rings'].includes(m.kind)).length ? `<details class="sv-ended"><summary>Marques retirées (${ended.filter(m => m.kind !== 'color_rings').length})</summary>${ended.filter(m => m.kind !== 'color_rings').map(m => markRow(m, ro)).join('')}</details>` : ''}
                <p class="muted sv-small">🧬 Les marques proposées suivent l’espèce : ${esc(PR.marks.map(k => C().MARKS[k].label.toLowerCase()).join(', '))}.${PR.find === 'rings' ? ' On retrouve l’oiseau par les couleurs des bagues et le code.' : ' On retrouve l’animal par son n° (même en partie).'}</p></div></section></div>`;
        if (!ro) ext.suivi.hintInto?.(panel);
        panel.querySelectorAll('[data-sv-prof-edit]').forEach(b => b.addEventListener('click', () => profileDialog(ctx)));
        panel.querySelectorAll('[data-sv-rings-edit]').forEach(b => b.addEventListener('click', () => ringsDialog(ctx, rings)));
        panel.querySelectorAll('[data-sv-mark-new]').forEach(b => b.addEventListener('click', () => markDialog(ctx, {kind: b.dataset.svMarkNew})));
        panel.querySelector('[data-sv-mark-add]')?.addEventListener('click', e => UI().menuAt(e.currentTarget, addable.map(k => ({icon: C().MARKS[k].icon, label: k === 'other' ? 'Autre marque…' : C().MARKS[k].label, run: () => markDialog(ctx, {kind: k})})), {title: '＋ Ajouter une marque'}));
        bindMarkActs(ctx);
    }
    const markActs = (m, ro) => ro ? '' : `<div class="sv-mark-acts"><button type="button" class="button small secondary" data-sv-mark-edit="${m.id}">✎ Modifier</button>${/gps|satellite|vhf|transmitter/.test(m.kind) && !m.end_date ? `<button type="button" class="button small secondary" data-sv-import="${m.pet_id}">⤒ Importer un trajet…</button>` : ''}<button type="button" class="icon-button small danger" data-sv-mark-del="${m.id}" title="Supprimer la marque" aria-label="Supprimer la marque">🗑</button></div>`;
    function markRow(m, ro) {
        const M = C().MARKS[m.kind] || C().MARKS.other, gps = /gps|satellite|vhf|transmitter/.test(m.kind);
        const col = m.colors?.single ? `<i class="sv-dot" style="background:${esc(m.colors.single.color)}"></i>` : '';
        return `<div class="sv-mark${m.end_date ? ' is-ended' : ''}">${m.media_id ? `<span class="sv-mark-photo" data-media-id="${m.media_id}"></span>` : `<span class="sv-mark-ico" aria-hidden="true">${M.icon}</span>`}<div><b>${esc(M.label)}</b>${col}${m.model ? ` · ${esc(m.model)}` : ''}${m.code ? ` · n° <code>${esc(m.code)}</code>` : ''}${m.kind === 'chip' && m.code ? (C().norm(m.code).length === 15 ? ` <small class="sv-ok">✓ 15 chiffres</small>` : ` <small class="sv-warn">⚠️ ${C().norm(m.code).length} chiffres</small>`) : ''}
            <br><small class="muted">${esc([m.position, m.start_date ? `posée le ${m.start_date}` : '', m.interval_min ? `un point toutes les ${m.interval_min} min` : '', m.end_date ? `fin : ${m.end_date}${m.end_reason ? ` (${m.end_reason})` : ''}` : gps ? 'fin : toujours en place' : '', M.photo && !m.media_id ? 'photo de référence à ajouter' : '', m.note].filter(Boolean).join(' · '))}</small> ${gps && !m.end_date ? U().badge('Émet', 'blue') : ''}${markActs(m, ro)}</div></div>`;
    }
    function bindMarkActs(ctx) {
        const {panel, det} = ctx;
        panel.querySelectorAll('[data-sv-mark-edit]').forEach(b => b.addEventListener('click', () => { const m = det.marks.find(x => x.id === Number(b.dataset.svMarkEdit)); if (m) m.kind === 'color_rings' ? ringsDialog(ctx, m) : markDialog(ctx, m); }));
        panel.querySelectorAll('[data-sv-mark-del]').forEach(b => b.addEventListener('click', () => { const mid = Number(b.dataset.svMarkDel); A().deleteWithUndo({action: 'suivi_write', body: {op: 'delete', type: 'animal_mark', id: mid}, type: 'animal_mark', id: mid, message: 'Marque supprimée.', after: () => ctx.reload()}); }));
        // vignettes des photos de référence (photo-identification)
        panel.querySelectorAll('.sv-mark-photo[data-media-id]').forEach(async el => { try { const r = await U().api('picker_search', {kind: 'media', ids: el.dataset.mediaId}); const it = r.groups?.[0]?.items?.[0]; if (it?.thumb) el.innerHTML = `<img src="${esc(it.thumb)}" alt="${esc(it.title || 'Photo de référence')}" loading="lazy">`; else el.textContent = '📸'; } catch (_) { el.textContent = '📸'; } });
    }
    function profileDialog(ctx) {
        const {det, id} = ctx, pf = det.profile || {}, prof = pf.profile || det.guess;
        ext.openDialog({eyebrow: '🐾 SUIVI', title: `Le suivi de ${ctx.me.title}`,
            body: `<div class="form-grid sv-form"><label>Espèce (son nom)<input name="taxon" maxlength="120" value="${esc(pf.taxon || '')}" placeholder="Corneille noire, Hérisson d’Europe, Grand dauphin…"></label><label>Nom scientifique<input name="sci_name" maxlength="120" value="${esc(pf.sci_name || '')}" placeholder="Corvus corone"></label>
                <label>Marques proposées pour<select name="profile">${Object.entries(C().PROFILES).map(([k, p]) => `<option value="${k}" ${k === prof ? 'selected' : ''}>${p.icon} ${esc(p.label)}</option>`).join('')}</select></label>
                <label>Âge au baguage ou au marquage<select name="age_class">${[['', '—'], ['poussin', 'Poussin'], ['jeune', 'Jeune'], ['adulte', 'Adulte'], ['inconnu', 'Inconnu']].map(([k, l]) => `<option value="${k}" ${pf.age_class === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label>Date du baguage ou du marquage<input name="ringed_date" data-ui-date value="${esc(pf.ringed_date || '')}" placeholder="12 mai 2025"></label>
                <div><span class="pk-lab">Lieu</span>${P().pickerField({name: 'ringed_place_id', kind: 'place', value: pf.ringed_place_id || null})}</div>
                <div><span class="pk-lab">Bagueur ou responsable</span>${P().pickerField({name: 'ringer', kind: 'person', allowFree: true, value: pf.ringer_id || (pf.ringer ? 'txt:' + pf.ringer : null)})}</div>
                <label>Programme<input name="program" maxlength="200" value="${esc(pf.program || '')}" placeholder="Corneilles de Paris, programme 2024 →"></label>
                <div><span class="pk-lab">La maison (pour « plus loin » et « temps dehors »)</span>${P().pickerField({name: 'home_place_id', kind: 'place', value: pf.home_place_id || null})}</div>
                <label>Le suivi<select name="status">${[['suivi', 'En cours'], ['pause', 'En pause'], ['fini', 'Terminé'], ['perdu', 'Perdu de vue']].map(([k, l]) => `<option value="${k}" ${(pf.status || 'suivi') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label class="sv-span2">Note<textarea name="note" rows="2">${esc(pf.note || '')}</textarea></label></div>`,
            onSubmit: async form => { const v = new FormData(form); await U().write('save_profile', {pet_id: id, taxon: v.get('taxon'), sci_name: v.get('sci_name'), profile: v.get('profile'), age_class: v.get('age_class'), ringed_date: v.get('ringed_date'), ringed_place_id: Number(v.get('ringed_place_id')) || 0, ringer: String(v.get('ringer') || ''), program: v.get('program'), home_place_id: Number(v.get('home_place_id')) || 0, status: v.get('status'), note: v.get('note')}); U().toast('Suivi enregistré.', 'success'); ctx.reload(); }});
    }
    /** Les bagues de couleur : 4 places, chacune avec sa couleur (couleurs de base d'office, ou n'importe laquelle par C2), son code gravé et la couleur du code */
    function ringsDialog(ctx, mark = null) {
        const cur = clone(mark?.colors) || {L: [null, null], R: [null, null]};
        ['L', 'R'].forEach(l => { cur[l] = cur[l] || [null, null]; });
        let sel = ['R', 1];
        const slotHtml = () => `<div class="sv-ringed">${legsBig({L: cur.L, R: cur.R})}<div class="sv-ring-slots">${['L', 'R'].map(l => [0, 1].map(i => `<button type="button" class="sv-ring-slot${sel[0] === l && sel[1] === i ? ' is-on' : ''}" data-slot="${l}${i}"><span class="sv-dot" style="background:${esc(cur[l][i] ? (cur[l][i].metal ? '#c0c4c8' : cur[l][i].color) : 'transparent')}"></span>${LEG[l]}, ${i ? 'en bas' : 'en haut'} : <b>${esc(ringWords(cur[l][i]))}</b></button>`).join('')).join('')}</div></div>`;
        const editHtml = () => { const r = cur[sel[0]][sel[1]];
            return `<fieldset class="sv-ring-edit"><legend>${LEG[sel[0]]}, ${sel[1] ? 'en bas' : 'en haut'}</legend><div class="sv-palette">${C().RING_COLORS.map(([k, n, hex]) => `<button type="button" class="sv-sw${r && (k === 'metal' ? r.metal : !r.metal && C().colorKey(r.color) === k && r.color === hex) ? ' is-on' : ''}" data-col="${k}" style="background:${hex}" title="${esc(n)}" aria-label="${esc(n)}"></button>`).join('')}<button type="button" class="sv-sw is-txt" data-col="none" title="Pas de bague ici">∅</button></div>
                <label class="sv-ring-c2">Autre couleur<input type="color" data-ring-color value="${esc(r && !r.metal ? r.color : '#1a8a3a')}"></label>
                <label>Code gravé<input data-ring-code maxlength="12" value="${esc(r?.code || '')}" placeholder="7K"></label><label class="sv-ring-c2">Couleur du code<input type="color" data-ring-codecol value="${esc(r?.code_color || '#111111')}"></label></fieldset>`; };
        const dlg = ext.openDialog({eyebrow: '🎨 BAGUES DE COULEUR', title: `Les bagues de ${ctx.me.title}`, wide: true,
            body: `<div data-rings>${slotHtml()}</div><div data-edit>${editHtml()}</div>
                <div class="form-grid"><label>Date de la pose ou du changement<input name="date" data-ui-date value="${esc(mark ? '' : (ctx.det.profile?.ringed_date || ''))}" placeholder="3 février 2026"></label>${mark ? `<label class="checkbox-line"><input type="checkbox" name="change" checked> C’est un changement : garder l’ancienne combinaison dans l’histoire</label><label>Pourquoi le changement<input name="reason" maxlength="200" placeholder="l’ancienne « 7H » était usée"></label>` : ''}</div>`,
            onSubmit: async form => {
                const v = new FormData(form), date = String(v.get('date') || '').trim(), change = mark && v.get('change');
                if (change) { if (!date) return UI().fail(form.elements.date, 'Donne la date du changement.'); await U().write('save_mark', {...mark, colors: mark.colors, end_date: date, end_reason: String(v.get('reason') || 'bagues changées')}); await U().write('save_mark', {pet_id: ctx.id, kind: 'color_rings', colors: cur, start_date: date}); }
                else await U().write('save_mark', {...(mark || {}), id: mark?.id || 0, pet_id: ctx.id, kind: 'color_rings', colors: cur, start_date: mark?.start_date || date});
                U().toast('Bagues enregistrées.', 'success'); ctx.reload();
            }});
        const box = dlg.querySelector('[data-rings]'), ed = dlg.querySelector('[data-edit]');
        const redraw = () => { box.innerHTML = slotHtml(); ed.innerHTML = editHtml(); };
        dlg.addEventListener('click', e => {
            const s = e.target.closest('[data-slot]'); if (s) { sel = [s.dataset.slot[0], Number(s.dataset.slot[1])]; redraw(); return; }
            const c = e.target.closest('[data-col]'); if (!c) return;
            const old = cur[sel[0]][sel[1]] || {};
            if (c.dataset.col === 'none') cur[sel[0]][sel[1]] = null;
            else if (c.dataset.col === 'metal') cur[sel[0]][sel[1]] = {metal: true, code: old.code || '', code_color: old.code_color || ''};
            else { const info = C().colorInfo(c.dataset.col); cur[sel[0]][sel[1]] = {color: info[2], name: info[1], code: old.code || '', code_color: old.code_color || (['noir', 'bleu', 'violet', 'marron', 'vert'].includes(info[0]) ? '#ffffff' : '#111111')}; UI().rememberColor?.(info[2]); }
            redraw();
        });
        ed.addEventListener('input', e => {
            const r = cur[sel[0]][sel[1]];
            if (e.target.matches('[data-ring-color]')) { const hex = e.target.value; cur[sel[0]][sel[1]] = {...(r && !r.metal ? r : {}), color: hex, name: C().colorInfo(C().colorKey(hex))?.[1] || '', metal: false}; box.innerHTML = slotHtml(); }
            if (e.target.matches('[data-ring-code]') && r) { r.code = e.target.value.trim().toUpperCase(); box.innerHTML = slotHtml(); }
            if (e.target.matches('[data-ring-codecol]') && r) { r.code_color = e.target.value; box.innerHTML = slotHtml(); }
        });
    }
    function markDialog(ctx, m = {}) {
        const M = C().MARKS[m.kind] || C().MARKS.other, isNew = !m.id;
        const posPh = {metal: 'Gauche, en bas', wing_tag: 'Aile droite', ear_tag: 'Oreille gauche', fin_tag: 'Nageoire dorsale', photo_id: 'Nageoire dorsale, caudale, flanc gauche…', ear_notch: 'Oreille droite, 2 encoches', scute: 'Écaille marginale 3'}[m.kind] || '';
        ext.openDialog({eyebrow: `${M.icon} MARQUE`, title: isNew ? `Nouvelle marque : ${M.label.toLowerCase()}` : `${M.label} · ${ctx.me.title}`,
            body: `<div class="form-grid sv-form">${m.kind === 'other' ? `<label>Nom de la marque<input name="scheme" maxlength="120" value="${esc(m.scheme || '')}" placeholder="Marque de peinture, médaillon…"></label>` : ''}
                <label>${esc(M.num || 'Code')}<input name="code" maxlength="80" value="${esc(m.code || '')}" ${m.kind === 'chip' ? 'inputmode="numeric" placeholder="250269604124471"' : ''}></label>
                ${m.kind === 'metal' ? `<label>${esc(M.scheme)}<input name="scheme" maxlength="120" value="${esc(m.scheme || '')}" placeholder="CRBPO — Muséum, Paris"></label>` : ''}
                ${M.model ? `<label>${esc(M.model)}<input name="model" maxlength="120" value="${esc(m.model || '')}"></label>` : ''}
                ${M.interval ? `<label>Un point toutes les<input type="number" name="interval_min" min="0" max="100000" data-unit="min" value="${esc(m.interval_min ?? '')}"></label>` : ''}
                ${M.color ? `<label class="sv-ring-c2">Couleur<input type="color" name="color" value="${esc(m.colors?.single?.color || '#d7262e')}"></label>` : ''}
                <label>Où est-elle<input name="position" maxlength="120" value="${esc(m.position || '')}" placeholder="${esc(posPh)}"></label>
                <label>Posée le<input name="start_date" data-ui-date value="${esc(m.start_date || '')}"></label><label>Retirée le<input name="end_date" data-ui-date value="${esc(m.end_date || '')}" placeholder="vide = toujours en place"></label>
                <label>Pourquoi retirée<input name="end_reason" maxlength="200" value="${esc(m.end_reason || '')}" placeholder="perdue, usée, changée…"></label>
                <div class="sv-span2"><span class="pk-lab">${M.photo ? 'Photo de référence' : 'Photo'}${M.hint ? ` <small class="muted">(${esc(M.hint)})</small>` : ''}</span>${P().mediaField({name: 'media_id', types: ['image'], value: m.media_id || null})}</div>
                <label class="sv-span2">Note<textarea name="note" rows="2">${esc(m.note || '')}</textarea></label></div>`,
            onSubmit: async form => {
                const v = new FormData(form);
                if (m.kind === 'chip' && v.get('code') && !/^[0-9 ]{6,20}$/.test(String(v.get('code')))) return UI().fail(form.elements.code, 'Un numéro de puce n’a que des chiffres (15 en général).');
                await U().write('save_mark', {id: m.id || 0, pet_id: ctx.id, kind: m.kind, code: v.get('code'), scheme: v.get('scheme') || m.scheme || '', model: v.get('model'), interval_min: v.get('interval_min'), position: v.get('position'), start_date: v.get('start_date'), end_date: v.get('end_date'), end_reason: v.get('end_reason'), note: v.get('note'), media_id: Number(v.get('media_id')) || 0, colors: M.color ? {single: {color: v.get('color')}} : null});
                U().toast(isNew ? 'Marque ajoutée.' : 'Marque enregistrée.', 'success'); ctx.reload();
            }});
    }
    const clone = v => JSON.parse(JSON.stringify(v ?? null));

    /* ═════════ S6 : 👁 Observations ═════════ */
    function obsTab(ctx) {
        const {det, D, panel, id} = ctx, KEY = 'listes:suivi-fiche-obs';
        const years = [...new Set(det.observations.map(o => (o.iso || '').slice(0, 4)).filter(Boolean))].sort().reverse();
        panel.innerHTML = `<div class="sv-obs-head"><div data-bar></div>${U().RO() ? '' : `<button type="button" class="button" data-sv-new-obs="${id}">＋ Nouvelle observation</button>`}</div><div data-list></div>`;
        const list = panel.querySelector('[data-list]');
        const bar = UI().listBar({key: KEY, search: {placeholder: 'Chercher… (lieu, observateur, note)'},
            filters: [{id: 'year', label: 'Année', type: 'radio', options: [['', 'Toutes'], ...years.map(y => [y, y])], dflt: ''}, {id: 'rel', label: 'Bague lue', type: 'check', options: [['full', 'En entier'], ['partial', 'Partielle'], ['colors', 'Couleurs seules'], ['doubt', 'Doute']]}],
            view: {dflt: 'list', what: 'observations'}, sort: {options: [['recent', 'Plus récentes'], ['old', 'Plus anciennes']], value: 'recent'},
            onChange: s => draw(s)});
        panel.querySelector('[data-bar]').replaceWith(bar);
        function draw(s) {
            const q = String(s.q || '').toLowerCase(), f = s.filters || {};
            let rows = det.observations.filter(o => (!f.year || (o.iso || '').startsWith(f.year)) && (!(f.rel || []).length || f.rel.includes(o.reliability)) && (!q || [U().placeOfObs(o, D), o.observer, o.note, o.reading].join(' ').toLowerCase().includes(q)));
            rows = UI().sortItems ? UI().sortItems(rows, s.sort || 'recent', {name: o => o.iso, date: o => `${o.iso} ${o.time}`}) : rows;
            const thisYear = String(new Date().getFullYear()), sites = new Set(rows.map(o => o.site_id || o.place_id || U().placeOfObs(o, D)));
            bar.setCount?.(`${U().plural(rows.length, 'observation')}${rows.length ? ` · ${rows.filter(o => (o.iso || '').startsWith(thisYear)).length} en ${thisYear} · vu sur ${U().plural(sites.size, 'site')}` : ''}`);
            const obsWithMe = rows.map(o => o.pet_id === id ? o : {...o, with: [...new Set([...(o.with || []).filter(x => x !== id), o.pet_id].filter(Boolean))]});
            list.innerHTML = rows.length ? (s.view === 'cards' && UI().cardsHtml ? UI().cardsHtml(obsWithMe.map(o => ({thumb: '<span class="ui-card-ico">👁</span>', name: `${U().dateFr(o.iso || o.date)}${o.time ? ', ' + U().timeFr(o.time) : ''}`, open: `data-sv-obs="${o.id}"`, lines: [U().placeOfObs(o, D), (o.behaviors || []).map(b => C().BEHAVIORS[b] || b).join(' ')], badges: [U().relBadge(o), U().obsMediaHtml?.(o)].filter(Boolean)}))) : ext.suivi.obsTableHtml(D, obsWithMe, {showAnimal: false}))
                : A().emptyState({icon: '👁', text: q || f.year ? 'Aucune observation ne correspond.' : 'Pas encore d’observation', hint: 'Chaque fois qu’on le voit : quand, où, ce qu’il faisait, avec qui, par qui, et si la bague a été bien lue.', action: U().RO() ? null : {label: '＋ Nouvelle observation', attrs: `data-sv-new-obs="${id}"`}});
        }
        draw(bar.state);
    }

    /* ═════════ S17 : 🩺 Santé (frise des états, courbe du poids, événements) ═════════ */
    function healthTab(ctx) {
        const {det, panel, id} = ctx, ro = U().RO(), H = det.health.slice().sort((a, b) => (a.iso || '').localeCompare(b.iso || ''));
        const HS = U().HS(), colors = {green: '#1a8a3a', red: '#d7262e', blue: '#055dff', black: '#222', yellow: '#e1a500', grey: '#888'};
        // la frise : chaque état dure jusqu'au suivant ; les vaccins et traitements de la partie « 🩺 Santé » d'avant (fiche d'animal) y sont rangés
        const pts = H.filter(h => /^\d{4}/.test(h.iso || ''));
        const t = h => Date.parse((h.iso || '').length === 4 ? `${h.iso}-07-01` : (h.iso || '').length === 7 ? `${h.iso}-15` : h.iso);
        const t0 = pts.length ? t(pts[0]) : 0, t1 = Math.max(Date.now(), pts.length ? t(pts[pts.length - 1]) : 0), span = Math.max(1, t1 - t0);
        const frise = pts.length ? `<div class="sv-frise">${pts.map((h, i) => { const a = t(h), b = i + 1 < pts.length ? t(pts[i + 1]) : t1, st = HS[h.state] || ['—', 'grey']; return `<span class="sv-frise-seg" style="left:${(100 * (a - t0) / span).toFixed(2)}%;width:${Math.max(1.5, 100 * (b - a) / span).toFixed(2)}%;background:${colors[st[1]]}" title="${esc(st[0])} · ${esc(U().dateFr(h.iso))}"><b>${esc(st[0])}</b><small>${esc(U().dateFr(h.iso))}</small></span>`; }).join('')}</div>` : '';
        // la courbe du poids : les événements de santé (et les anciens relevés de poids de la fiche)
        const wpts = H.filter(h => h.weight_g != null && /^\d{4}-\d{2}-\d{2}/.test(h.iso || '')).map(h => ({d: Date.parse(h.iso), w: h.weight_g}));
        const curve = wpts.length > 1 ? (() => { const W = 520, Hh = 150, P0 = 34, x0 = Math.min(...wpts.map(p => p.d)), x1 = Math.max(...wpts.map(p => p.d)) || x0 + 1, y0 = Math.min(...wpts.map(p => p.w)) * .9, y1 = Math.max(...wpts.map(p => p.w)) * 1.05; const X = d => P0 + (d - x0) / Math.max(1, x1 - x0) * (W - 2 * P0), Y = w => Hh - P0 + 10 - (w - y0) / Math.max(1, y1 - y0) * (Hh - P0 - 16);
            return `<svg class="sv-curve is-big" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Courbe du poids"><line x1="${P0}" y1="${Hh - P0 + 10}" x2="${W - P0}" y2="${Hh - P0 + 10}" stroke="currentColor" stroke-opacity=".25"/><text x="4" y="${Y(y1)}" font-size="10" fill="currentColor">${esc(U().weightText(y1))}</text><text x="4" y="${Y(y0)}" font-size="10" fill="currentColor">${esc(U().weightText(y0))}</text><polyline fill="none" stroke="var(--blue-bright)" stroke-width="2.5" points="${wpts.map(p => `${X(p.d).toFixed(1)},${Y(p.w).toFixed(1)}`).join(' ')}"/>${wpts.map(p => `<circle cx="${X(p.d).toFixed(1)}" cy="${Y(p.w).toFixed(1)}" r="4" fill="var(--blue-bright)"><title>${esc(U().dateFr(new Date(p.d).toISOString().slice(0, 10)))} : ${esc(U().weightText(p.w))}</title></circle><text x="${X(p.d).toFixed(1)}" y="${(Y(p.w) - 8).toFixed(1)}" text-anchor="middle" font-size="10" fill="currentColor">${esc(U().weightText(p.w))}</text>`).join('')}</svg>`; })() : '';
        const ev = H.slice().reverse();
        panel.innerHTML = `<div class="sv-health-head"><h3>🩺 Santé de ${esc(ctx.me.title)} ${H.length ? U().healthBadge(H[H.length - 1].state) : ''}</h3>${ro ? '' : '<button type="button" class="button" data-sv-h-new>＋ Événement de santé</button>'}</div>
            <div class="card-grid dashboard-grid"><section class="card span-6"><header class="card-head"><div class="card-title"><h3>Frise des états</h3></div></header><div class="card-body">${frise || A().empty('Pas encore d’état.', {icon: '🩺'})}</div></section>
            <section class="card span-6"><header class="card-head"><div class="card-title"><h3>Poids</h3></div></header><div class="card-body">${curve || A().empty('Il faut au moins deux poids datés.', {icon: '⚖️'})}</div></section>
            <section class="card span-12"><header class="card-head"><div class="card-title"><h3>Événements de santé <small>(${H.length})</small></h3></div></header><div class="card-body">${ev.length ? `<ol class="sv-events">${ev.map(h => `<li data-ctx-menu><div class="sv-ev-date"><b>${esc(U().dateFr(h.iso || h.date))}</b>${U().healthBadge(h.state)}</div><div><b>${esc([C().HEALTH_WHAT.find(x => x[0] === h.what_kind)?.[1], h.what_text].filter(Boolean).join(' · ') || '—')}</b>${h.weight_g != null ? ` · ${esc(U().weightText(h.weight_g))}` : ''}
                <br><small>${[h.cause ? `Pourquoi : <b>${esc(C().CAUSES[h.cause] || h.cause)}</b>${h.cause_text ? ` « ${esc(h.cause_text)} »` : ''}` : '', h.place ? `Où : 📍 ${esc(h.place)}` : '', h.carer ? `Soigné par ${esc(h.carer)}` : '', h.care ? esc(h.care) : '', h.meds ? `💊 ${esc(h.meds)}` : '', h.outcome === 'relache' ? `relâché${h.outcome_date ? ' le ' + esc(h.outcome_date) : ''}` : h.outcome === 'mort' ? `† mort${h.outcome_date ? ' le ' + esc(h.outcome_date) : ''}` : ''].filter(Boolean).join(' · ')}</small>${h.media_ids?.length ? ` <small>📷 ${h.media_ids.length}</small>` : ''}</div>
                ${ro ? '' : `<details class="ui-more"><summary class="icon-button small" aria-label="Plus d’actions">⋯</summary><div class="ui-ph-menu"><button type="button" data-sv-h-edit="${h.id}">✎ Modifier</button><button type="button" class="danger" data-sv-h-del="${h.id}">🗑 Supprimer</button></div></details>`}</li>`).join('')}</ol>` : A().empty('Aucun événement de santé.', {icon: '🩺', action: ro ? null : {label: '＋ Événement de santé', attrs: 'data-sv-h-new'}})}</div></section></div>`;
        panel.querySelectorAll('[data-sv-h-new]').forEach(b => b.addEventListener('click', () => openHealth({petId: id, ctx})));
        panel.querySelectorAll('[data-sv-h-edit]').forEach(b => b.addEventListener('click', () => { b.closest('details')?.removeAttribute('open'); const h = det.health.find(x => x.id === Number(b.dataset.svHEdit)); if (h) openHealth({petId: id, h, ctx}); }));
        panel.querySelectorAll('[data-sv-h-del]').forEach(b => b.addEventListener('click', () => { b.closest('details')?.removeAttribute('open'); const hid = Number(b.dataset.svHDel); A().deleteWithUndo({action: 'suivi_write', body: {op: 'delete', type: 'animal_health', id: hid}, type: 'animal_health', id: hid, message: 'Événement de santé supprimé.', after: () => ctx.reload()}); }));
    }
    /** S18 : la fenêtre « Nouvel événement de santé » */
    async function openHealth({petId = 0, h = null, ctx = null} = {}) {
        if (U().RO()) return U().toast('Mode consultation : rien à modifier.');
        const D = (ctx?.D && U().animalById(ctx.D, petId) ? ctx.D : null) || await U().overview().catch(() => ({animals: []})), a = U().animalById(D, petId); // la fiche ouverte a déjà le suivi à jour
        const prof = a ? U().profileOf(a) : 'autre';
        // Pourquoi : d'abord les causes de l'espèce, puis « Plus de causes ▾ » (toutes) et mes causes (« ＋ Autre cause… », gardées sur cet appareil)
        const MINE = 'genealogie-suivi-causes', mine = () => { try { return (JSON.parse(localStorage.getItem(MINE) || '[]') || []).filter(x => typeof x === 'string' && x.trim()).slice(0, 40); } catch (_) { return []; } };
        const first = [...new Set([...(C().PROFILES[prof]?.causes || []), ...mine(), ...(h?.cause ? [h.cause] : []), 'inconnue'])];
        const more = Object.keys(C().CAUSES).filter(k => !first.includes(k));
        let what = h?.what_kind || '', cause = h?.cause || '', state = h?.state || '';
        const seg = (name, list, cur) => `<div class="sv-tags" data-seg="${name}">${list.map(([k, l]) => `<button type="button" class="sv-tag${k === cur ? ' is-on' : ''}" data-v="${esc(k)}" aria-pressed="${k === cur}">${esc(l)}</button>`).join('')}</div>`;
        const dlg = ext.openDialog({eyebrow: `🩺 SANTÉ${a ? ' · ' + a.title.toUpperCase() : ''}`, title: h ? 'Modifier l’événement de santé' : 'Nouvel événement de santé',
            body: `<div class="sv-form sv-health-form">${petId ? '' : `<div><span class="pk-lab">L’animal</span>${P().pickerField({name: 'pet_id', kind: 'pet'})}</div>`}
                <div class="sv-obs-2"><label>Date<input name="date" data-ui-date required value="${esc(h?.date || '')}" placeholder="18/10/2026"></label><div><span class="pk-lab">État après</span>${seg('state', C().HEALTH_STATES.map(([k, l]) => [k, l]), state)}</div></div>
                <div><span class="pk-lab">Ce qu’il a</span>${seg('what', C().HEALTH_WHAT, what)}<input name="what_text" maxlength="600" value="${esc(h?.what_text || '')}" placeholder="Patte arrière gauche entaillée"></div>
                <div><span class="pk-lab">Pourquoi</span>${seg('cause', first.map(k => [k, C().CAUSES[k] || k]), cause)}<div class="sv-cause-more" data-cause-more hidden>${seg('cause', more.map(k => [k, C().CAUSES[k]]), cause)}</div><div class="sv-tags"><button type="button" class="sv-tag" data-cause-toggle aria-expanded="false">Plus de causes ▾</button><button type="button" class="sv-tag" data-cause-add>＋ Autre cause…</button></div><input name="cause_text" maxlength="600" value="${esc(h?.cause_text || '')}" placeholder="Précise si tu veux… (« débroussailleuse du voisin, sous la haie »)"></div>
                <div class="sv-obs-2"><div><span class="pk-lab">Où</span>${P().pickerField({name: 'place_id', kind: 'place', value: h?.place_id || null})}</div><div><span class="pk-lab">Soigné par</span>${P().pickerField({name: 'carer', kind: 'person', allowFree: true, value: h?.carer_id || (h?.carer ? 'txt:' + h.carer : null)})}</div></div>
                <div class="sv-obs-2"><label>Soins<input name="care" maxlength="2000" value="${esc(h?.care || '')}" placeholder="Plaie nettoyée, bandage"></label><label>Médicaments<input name="meds" maxlength="2000" value="${esc(h?.meds || '')}" placeholder="Antibiotique 5 jours, anti-douleur"></label></div>
                <div class="sv-obs-2"><label>Poids<input type="number" name="weight_g" min="0" step="1" data-unit="g" value="${esc(h?.weight_g ?? '')}"></label><div><span class="pk-lab">Photos</span>${P().mediaField({name: 'media_ids', multiple: true, types: ['image'], value: h?.media_ids || []})}</div></div>
                <div><span class="pk-lab">Suite</span><div class="sv-tags">${[['', 'Pas encore'], ['relache', 'Relâché le …'], ['mort', 'Mort le …']].map(([k, l]) => `<label class="sv-tag${(h?.outcome || '') === k ? ' is-on' : ''}"><input type="radio" name="outcome" value="${k}" ${(h?.outcome || '') === k ? 'checked' : ''}> ${l}</label>`).join('')}</div><input name="outcome_date" data-ui-date value="${esc(h?.outcome_date || '')}" placeholder="date de la suite" aria-label="Date de la suite"></div>
                <label class="sv-note">Note<textarea name="note" rows="3">${esc(h?.note || '')}</textarea></label></div>`,
            onSubmit: async form => {
                const v = new FormData(form), pid = petId || Number(v.get('pet_id')) || 0;
                const errs = []; if (!pid) errs.push([form.elements.pet_id, 'Choisis l’animal.']); if (!String(v.get('date') || '').trim()) errs.push([form.elements.date, 'Donne la date de l’événement.']);
                if (errs.length) { UI().formErrors ? UI().formErrors(form, errs) : UI().fail(errs[0][0], errs[0][1]); return false; }
                const outcome = String(v.get('outcome') || ''); if (outcome && !state) state = outcome === 'mort' ? 'mort' : 'relache';
                await U().write('save_health', {id: h?.id || 0, pet_id: pid, date: v.get('date'), state, what_kind: what, what_text: v.get('what_text'), cause, cause_text: v.get('cause_text'), place_id: Number(v.get('place_id')) || 0, carer: String(v.get('carer') || ''), care: v.get('care'), meds: v.get('meds'), weight_g: v.get('weight_g'), media_ids: String(v.get('media_ids') || ''), outcome, outcome_date: v.get('outcome_date'), note: v.get('note')});
                U().toast(h ? 'Événement de santé enregistré.' : 'Événement de santé créé.', 'success');
                if (ctx) ctx.reload(); else U().refreshView();
            }});
        dlg.addEventListener('click', async e => {
            const tg = e.target.closest('[data-cause-toggle]'); if (tg) { const box = dlg.querySelector('[data-cause-more]'); box.hidden = !box.hidden; tg.setAttribute('aria-expanded', String(!box.hidden)); tg.textContent = box.hidden ? 'Plus de causes ▾' : 'Moins de causes ▴'; return; }
            if (e.target.closest('[data-cause-add]')) {
                const t = String(await A().askText?.({title: 'Une autre cause', message: 'La cause (elle sera proposée les prochaines fois) :', okLabel: 'Ajouter'}) || '').trim().slice(0, 40); if (!t) return;
                try { localStorage.setItem(MINE, JSON.stringify([...new Set([t, ...mine()])].slice(0, 40))); } catch (_) {}
                const row = dlg.querySelector('[data-seg="cause"]'); let btn = [...dlg.querySelectorAll('[data-seg="cause"] [data-v]')].find(x => x.dataset.v === t);
                if (!btn) { row.insertAdjacentHTML('beforeend', `<button type="button" class="sv-tag" data-v="${esc(t)}" aria-pressed="false">${esc(t)}</button>`); btn = row.lastElementChild; }
                cause = ''; btn.click(); return;
            }
            const b = e.target.closest('[data-seg] [data-v]'); if (b) { const g = b.closest('[data-seg]').dataset.seg, val = b.dataset.v; const was = {state, what, cause}[g]; const nv = was === val ? '' : val; if (g === 'state') state = nv; if (g === 'what') what = nv; if (g === 'cause') cause = nv; dlg.querySelectorAll(`[data-seg="${g}"] [data-v]`).forEach(x => { x.classList.toggle('is-on', x.dataset.v === nv); x.setAttribute('aria-pressed', x.dataset.v === nv); }); return; }
            const r = e.target.closest('label.sv-tag'); if (r) setTimeout(() => r.parentElement.querySelectorAll('label.sv-tag').forEach(x => x.classList.toggle('is-on', x.querySelector('input').checked)));
        });
        return dlg;
    }
    ext.suivi.openHealth = openHealth;

    /* ═════════ 👥 Groupe : appartenances, rôles, histoire sociale (frise) ═════════ */
    const END = () => Object.fromEntries(C().END_REASONS);
    const START = {entree: 'entre dans', naissance: 'naît dans', transfert: 'arrive dans', role: 'devient', fondateur: 'fonde'};
    /** La frise d'une histoire sociale : une ligne par groupe (fiche d'un animal) ou par animal (page du groupe) ; un segment par rôle */
    ext.suivi.socialFrise = (members, D, {byAnimal = false} = {}) => {
        if (!members.length) return A().empty('Pas encore d’histoire.', {icon: '👥'});
        const iso = s => (/^\d{4}/.test(s || '') ? s : '');
        const tt = s => { const v = iso(s); return v ? Date.parse(v.length === 4 ? `${v}-07-01` : v.length === 7 ? `${v}-15` : v) : null; };
        const times = members.flatMap(m => [tt(m.start_iso), tt(m.end_iso)]).filter(Number.isFinite);
        const t0 = Math.min(...times, Date.now()), t1 = Math.max(Date.now(), ...times), span = Math.max(1, t1 - t0);
        const rows = {}; members.forEach(m => { const k = byAnimal ? m.pet_id : m.group_id; (rows[k] = rows[k] || []).push(m); });
        const groups = Object.fromEntries((D?.groups || []).map(g => [g.id, g]));
        const roleColor = r => /alpha|dominant|matriarche|reproduct/i.test(r) ? '#d7262e' : /jeune|petit/i.test(r) ? '#1a8a3a' : /satellite|subordonn/i.test(r) ? '#888' : '#055dff';
        const yearsLbl = [new Date(t0).getFullYear(), new Date(t1).getFullYear()];
        return `<div class="sv-social">${Object.entries(rows).map(([k, list]) => { const label = byAnimal ? (U().animalById(D, k)?.title || 'Animal') : (list[0].group_name || groups[k]?.name || 'Groupe');
            return `<div class="sv-social-row"><span class="sv-social-lab">${byAnimal ? `<button type="button" class="link-button" data-sv-pet="${k}" data-sv-tab="group">${esc(label)}</button>` : `<button type="button" class="link-button" data-sv-group="${k}">👥 ${esc(label)}</button>`}</span><span class="sv-social-bar">${list.map(m => { const a = tt(m.start_iso) ?? t0, b = m.end_date ? (tt(m.end_iso) ?? a + 864e5 * 30) : t1; return `<span class="sv-social-seg" style="left:${(100 * (a - t0) / span).toFixed(2)}%;width:${Math.max(1.5, 100 * (b - a) / span).toFixed(2)}%;background:${roleColor(m.role)}" title="${esc(`${m.role || 'membre'} · ${m.start_date || '?'} → ${m.end_date || 'aujourd’hui'}${m.end_reason ? ' · ' + (END()[m.end_reason] || m.end_reason) : ''}`)}"><b>${esc(m.role || 'membre')}</b></span>${m.end_reason && m.end_reason !== 'role' ? `<span class="sv-social-end" style="left:${(100 * (b - t0) / span).toFixed(2)}%" title="${esc(END()[m.end_reason] || '')}">${{exclu: '✖', mort: '†', transfert: '→', depart: '↗', inconnu: '?'}[m.end_reason] || '•'}</span>` : ''}`; }).join('')}</span></div>`; }).join('')}
            <div class="sv-social-axis"><span>${yearsLbl[0]}</span><span>${yearsLbl[1]}</span></div><p class="muted sv-small">Rouge : alpha, dominant, matriarche · bleu : membre · vert : jeune · gris : satellite, subordonné · ✖ exclu · † mort · → passé dans un autre groupe · ↗ parti.</p></div>`;
    };
    function groupTab(ctx) {
        const {det, D, panel, id} = ctx, ro = U().RO(), mem = det.members, cur = mem.filter(m => !m.end_date);
        const story = mem.flatMap(m => [{iso: m.start_iso, date: m.start_date, txt: `${m.start_reason === 'role' ? `devient ${m.role || 'membre'} dans` : `${START[m.start_reason] || 'entre dans'}`} « ${m.group_name} »${m.role && m.start_reason !== 'role' ? ` (${m.role})` : ''}`, m},
            ...(m.end_date && m.end_reason !== 'role' ? [{iso: m.end_iso, date: m.end_date, txt: `${END()[m.end_reason] || 'quitte'}${m.end_reason === 'exclu' || m.end_reason === 'depart' ? ` (« ${m.group_name} »)` : m.end_reason === 'transfert' ? ` (quitte « ${m.group_name} »)` : ''}`, m, end: true}] : [])]).sort((a, b) => (a.iso || '').localeCompare(b.iso || ''));
        panel.innerHTML = `<div class="sv-health-head"><h3>👥 Groupe de ${esc(ctx.me.title)}</h3>${ro ? '' : '<button type="button" class="button" data-sv-m-new>＋ Entrée dans un groupe</button>'}</div>
            <div class="card-grid dashboard-grid"><section class="card span-6"><header class="card-head"><div class="card-title"><h3>Aujourd’hui</h3></div></header><div class="card-body">${cur.length ? cur.map(m => `<div class="sv-member"><button type="button" class="link-button" data-sv-group="${m.group_id}"><b>👥 ${esc(m.group_name)}</b></button> <small class="muted">${esc(m.group_kind)}</small><br>Rôle : <b>${esc(m.role || 'membre')}</b> · depuis ${esc(m.start_date || '?')}${ro ? '' : `<div class="sv-mark-acts"><button type="button" class="button small secondary" data-sv-m-role="${m.id}">Changer de rôle</button><button type="button" class="button small secondary" data-sv-m-leave="${m.id}">Sortie du groupe…</button><button type="button" class="icon-button small" data-sv-m-edit="${m.id}" aria-label="Modifier">✎</button></div>`}</div>`).join('') : A().empty('Dans aucun groupe pour l’instant.', {icon: '👥', hint: 'Pour un animal social : meute, troupe, clan, pod, colonie…', action: ro ? null : {label: '＋ Entrée dans un groupe', attrs: 'data-sv-m-new'}})}</div></section>
            <section class="card span-6"><header class="card-head"><div class="card-title"><h3>Son histoire</h3></div></header><div class="card-body">${story.length ? `<ol class="sv-hist">${story.map(s => `<li><b>${esc(s.date || '?')}</b><span>${esc(s.txt)}${s.m.end_reason === 'exclu' && s.end ? ' ' + U().badge('Exclu', 'red') : ''}${s.m.end_reason === 'mort' && s.end ? ' ' + U().badge('† Mort', 'black') : ''}${s.m.note && !s.end ? ` <small class="muted">— ${esc(s.m.note)}</small>` : ''}</span>${ro ? '' : `<button type="button" class="icon-button small" data-sv-m-edit="${s.m.id}" aria-label="Modifier">✎</button><button type="button" class="icon-button small danger" data-sv-m-del="${s.m.id}" aria-label="Supprimer cette ligne">🗑</button>`}</li>`).join('')}</ol>` : A().empty('Pas encore d’histoire.', {icon: '📜'})}</div></section>
            <section class="card span-12"><header class="card-head"><div class="card-title"><h3>Frise de son histoire sociale</h3></div></header><div class="card-body">${ext.suivi.socialFrise(mem, D)}</div></section></div>`;
        panel.querySelectorAll('[data-sv-m-new]').forEach(b => b.addEventListener('click', () => memberDialog({petId: id, ctx})));
        panel.querySelectorAll('[data-sv-m-edit]').forEach(b => b.addEventListener('click', () => memberDialog({petId: id, m: mem.find(x => x.id === Number(b.dataset.svMEdit)), ctx})));
        panel.querySelectorAll('[data-sv-m-role]').forEach(b => b.addEventListener('click', () => memberDialog({petId: id, m: mem.find(x => x.id === Number(b.dataset.svMRole)), ctx, mode: 'role'})));
        panel.querySelectorAll('[data-sv-m-leave]').forEach(b => b.addEventListener('click', () => memberDialog({petId: id, m: mem.find(x => x.id === Number(b.dataset.svMLeave)), ctx, mode: 'leave'})));
        panel.querySelectorAll('[data-sv-m-del]').forEach(b => b.addEventListener('click', () => { const mid = Number(b.dataset.svMDel); A().deleteWithUndo({action: 'suivi_write', body: {op: 'delete', type: 'animal_member', id: mid}, type: 'animal_member', id: mid, message: 'Ligne de l’histoire supprimée.', after: () => ctx.reload()}); }));
    }
    /** Entrée dans un groupe, changement de rôle, sortie (départ, exclusion, mort, passage dans un autre groupe) */
    function memberDialog({petId = 0, groupId = 0, m = null, ctx = null, mode = ''} = {}) {
        const roleChips = `<div class="sv-tags" data-roles>${C().ROLES.map(r => `<button type="button" class="sv-tag" data-role="${esc(r)}">${esc(r)}</button>`).join('')}</div>`;
        const title = mode === 'role' ? 'Changement de rôle' : mode === 'leave' ? 'Sortie du groupe' : m ? 'Modifier l’appartenance' : 'Entrée dans un groupe';
        const dlg = ext.openDialog({eyebrow: '👥 GROUPE', title,
            body: `<div class="sv-form">${petId ? '' : `<div><span class="pk-lab">L’animal</span>${P().pickerField({name: 'pet_id', kind: 'pet', value: m?.pet_id || null})}</div>`}
                <div><span class="pk-lab">Le groupe</span>${P().pickerField({name: 'group_id', kind: 'agroup', allowCreate: true, value: m?.group_id || groupId || null})}</div>
                <fieldset ${mode ? 'hidden' : ''}><legend>Entrée</legend><div class="sv-obs-2"><label>Rôle (facultatif)<input name="role" maxlength="60" value="${esc(m?.role || '')}" placeholder="alpha, matriarche, jeune… ou un mot libre"></label><label>Le<input name="start_date" data-ui-date value="${esc(m?.start_date || '')}"></label></div>${roleChips}
                    <label>Comment<select name="start_reason">${[['entree', 'Entre dans le groupe'], ['naissance', 'Naît dans le groupe'], ['fondateur', 'Fonde le groupe'], ['transfert', 'Vient d’un autre groupe'], ['role', 'Change de rôle']].map(([k, l]) => `<option value="${k}" ${(m?.start_reason || 'entree') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></fieldset>
                <fieldset ${mode === 'role' ? 'hidden' : ''}><legend>Sortie${mode ? '' : ' (facultatif)'}</legend><label>Pourquoi<select name="end_reason"><option value="">— encore dans le groupe —</option>${C().END_REASONS.filter(([k]) => k !== 'role').map(([k, l]) => `<option value="${k}" ${m?.end_reason === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label><label>Le<input name="end_date" data-ui-date value="${esc(m?.end_date === '?' ? '' : m?.end_date || '')}"></label>
                    <div data-transfer hidden><span class="pk-lab">Le nouveau groupe</span>${P().pickerField({name: 'transfer_to', kind: 'agroup', allowCreate: true})}<label>Son rôle là-bas<input name="new_role_t" maxlength="60"></label></div></fieldset>
                ${mode === 'role' ? `<div class="sv-obs-2"><label>Nouveau rôle<input name="new_role" maxlength="60" required placeholder="alpha, satellite…"></label><label>Depuis le<input name="role_date" data-ui-date></label></div>${roleChips}` : ''}
                <label class="sv-note">Note<textarea name="note" rows="3">${esc(m?.note || '')}</textarea></label></div>`,
            onSubmit: async form => {
                const v = new FormData(form), pid = petId || Number(v.get('pet_id')) || 0, gid = Number(v.get('group_id')) || 0;
                const errs = []; if (!pid) errs.push([form.elements.pet_id, 'Choisis l’animal.']); if (!gid) errs.push([form.elements.group_id, 'Choisis le groupe (ou crée-le).']);
                if (mode === 'role' && !String(v.get('new_role') || '').trim()) errs.push([form.elements.new_role, 'Écris le nouveau rôle.']);
                const er = String(v.get('end_reason') || ''); if (er === 'transfert' && !Number(v.get('transfer_to'))) errs.push([form.elements.transfer_to, 'Choisis le nouveau groupe.']);
                if (errs.length) { UI().formErrors ? UI().formErrors(form, errs) : UI().fail(errs[0][0], errs[0][1]); return false; }
                const body = {id: m?.id || 0, pet_id: pid, group_id: gid, role: v.get('role'), start_date: v.get('start_date'), start_reason: v.get('start_reason'), end_date: v.get('end_date'), end_reason: er, note: v.get('note')};
                if (mode === 'role') Object.assign(body, {end_date: v.get('role_date') || U().dateFr(U().todayIso()), end_reason: 'role', new_role: v.get('new_role')});
                if (er === 'transfert') Object.assign(body, {transfer_to: Number(v.get('transfer_to')), new_role: v.get('new_role_t')});
                await U().write('save_member', body);
                U().toast(mode === 'role' ? 'Nouveau rôle enregistré.' : mode === 'leave' ? 'Sortie du groupe enregistrée.' : m ? 'Appartenance enregistrée.' : 'Entrée dans le groupe enregistrée.', 'success');
                if (ctx) ctx.reload(); else U().refreshView();
            }});
        const showT = () => { const t = dlg.querySelector('[data-transfer]'); if (t) t.hidden = dlg.querySelector('[name="end_reason"]').value !== 'transfert'; };
        dlg.querySelector('[name="end_reason"]').addEventListener('change', showT); showT();
        dlg.addEventListener('click', e => { const r = e.target.closest('[data-role]'); if (!r) return; const inp = dlg.querySelector(mode === 'role' ? '[name="new_role"]' : '[name="role"]'); inp.value = r.dataset.role; inp.dispatchEvent(new Event('input', {bubbles: true})); });
        // « ＋ Créer le groupe « … » » : la fenêtre du groupe, puis il est choisi
        dlg.addEventListener('picker-create', e => { if (e.detail.kind !== 'agroup') return; e.preventDefault(); U().groupDialog({name: e.detail.text}, {after: r => e.detail.pick({id: r.id, title: r.title})}); });
        return dlg;
    }
    ext.suivi.memberDialog = memberDialog;
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-sv-member-new], [data-sv-member-edit]'); if (!b) return; if (b.dataset.svMemberNew) return memberDialog({groupId: Number(b.dataset.svMemberNew)}); U().api('suivi', {op: 'group', id: A().state.svGroup}).then(r => { const m = r.members.find(x => x.id === Number(b.dataset.svMemberEdit)); if (m) memberDialog({m: {...m, group_name: r.group.name}}); }); });

    /* ═════════ S13 : 🗺 Carte et trajets (nuits, plus loin de la maison, temps dehors, zone fréquentée) ═════════ */
    async function mapTab(ctx) {
        const {det, D, panel, id, me} = ctx, ro = U().RO();
        panel.innerHTML = UI().spinner ? UI().spinner('La carte…') : '…';
        const all = ctx.gpsAll || (det.gps.n ? ((await U().api('suivi', {op: 'gps', pet_id: id, max: 20000}).catch(() => ({points: []}))).points || []) : []);
        ctx.gpsAll = all;
        const trips = C().splitTrips(all, 120).reverse(), home = det.profile?.home && Number.isFinite(det.profile.home.lat) ? det.profile.home : null;
        const obs = det.observations.filter(o => o.pet_id === id && Number.isFinite(o.lat));
        let sel = 0, link = true;
        const zoneAll = C().hull(all.length ? all : obs.map(o => [0, o.lat, o.lon]));
        panel.innerHTML = `<div class="sv-health-head"><h3>🗺 ${trips.length ? 'Trajets' : 'Carte'} de ${esc(me.title)}</h3><div class="page-actions">${UI().toggleHtml('Relier les points dans l’ordre', {checked: true, attrs: 'data-link'})}${ro ? '' : `<button type="button" class="button secondary" data-sv-import="${id}">⤒ Importer un trajet…</button>`}<button type="button" class="button secondary" data-sv-trips-export>⤓ Exporter ▾</button></div></div>
            <div class="sv-trip-grid"><div><div class="sv-map-host" data-map></div><div class="sv-legend" data-legend></div><div data-replay></div></div>
            <aside>${trips.length ? `<div class="sv-kpis is-col" data-kpis></div><h4>${U().plural(trips.length, 'sortie')} (une sortie = un trajet)</h4><div class="sv-trips">${trips.slice(0, 60).map((t, i) => `<button type="button" class="sv-trip${i === 0 ? ' is-on' : ''}" data-trip="${i}"><b>${esc(tripName(t))}</b><small class="muted">${U().plural(t.points.length, 'point')} · ${esc(U().kmText(t.km))}${home ? ` · plus loin ${esc(U().kmText(C().farthest(t.points, home).km))}` : ''}</small></button>`).join('')}<button type="button" class="sv-trip" data-trip="all"><b>Tous les points</b><small class="muted">${U().plural(all.length, 'point')} · zone ≈ ${esc(areaTxt(zoneAll.km2))}</small></button></div>` : A().empty('Pas de trajet GPS.', {icon: '📡', hint: 'Une balise ou un collier GPS ? Importe son fichier (GPX, KML, CSV).', action: ro ? null : {label: '⤒ Importer un trajet…', attrs: `data-sv-import="${id}"`}})}
                ${det.imports.length ? `<h4>Fichiers importés</h4>${det.imports.map(imp => `<div class="sv-row"><span class="sv-what">📄 ${esc(imp.filename || 'fichier')} <small class="muted">${esc(imp.format)} · ${U().plural(imp.points, 'point')}</small></span>${ro ? '' : `<button type="button" class="icon-button small danger" data-sv-imp-del="${imp.id}" title="Retirer ces points" aria-label="Retirer ces points">🗑</button>`}</div>`).join('')}` : ''}</aside></div>`;
        const host = panel.querySelector('[data-map]'); let view = null, rep = null;
        const draw = () => {
            const t = sel === 'all' ? {points: all} : trips[sel];
            const series = [];
            if (obs.length) series.push({name: `${me.title} · observations`, color: '#055dff', line: link, dashed: true, numbered: link, points: obs.slice().sort((a, b) => (U().tOf(a) || 0) - (U().tOf(b) || 0)).map((o, k) => ({lat: o.lat, lon: o.lon, t: U().tOf(o), n: k + 1, html: U().obsPopup(o, me, D)}))});
            if (t?.points?.length) series.push({name: `${me.title} · GPS`, color: '#e8590c', line: true, gps: true, points: t.points.map(p => ({t: p[0], lat: p[1], lon: p[2]}))});
            const hull = C().hull(t?.points?.length ? t.points : obs.map(o => [0, o.lat, o.lon]));
            const polys = hull.hull.length > 2 ? [{coords: hull.hull, color: '#e8590c', label: 'zone fréquentée'}] : [];
            if (!view) view = U().mapView(host, {series, polygons: polys, home, height: 380, wheel: true}); else { view.setSeries(series, polys); view.fit(); }
            const ts = series.flatMap(x => x.points.map(p => p.t)).filter(Number.isFinite); rep?.stop(); rep = ts.length > 1 ? U().replayBar(panel.querySelector('[data-replay]'), Math.min(...ts), Math.max(...ts), v => view.setTime(v)) : null;
            panel.querySelector('[data-legend]').innerHTML = `${series.map(s => `<span class="sv-leg"><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}${polys.length ? '<span class="sv-leg"><i style="background:#e8590c;opacity:.4"></i>zone fréquentée</span>' : ''}${home ? ' · 🏠 maison' : ''}`;
            const k = panel.querySelector('[data-kpis]');
            if (k && t?.points?.length) { const far = C().farthest(t.points, home), out = sel === 'all' ? 0 : (t.t1 - t.t0) / 60; k.innerHTML = `${sel !== 'all' ? `<div><b>${esc(durTxt(out))}</b><small>dehors · sortie ${esc(U().timeFr(U().tTime(t.t0)))} · rentrée ${esc(U().timeFr(U().tTime(t.t1)))}</small></div>` : ''}${home ? `<div><b>${esc(U().kmText(far.km))}</b><small>le plus loin de la maison${far.at ? ` (${esc(U().timeFr(U().tTime(far.at)))})` : ''}</small></div>` : ''}<div><b>${esc(U().kmText(C().pathKm(t.points)))}</b><small>parcourus</small></div><div><b>${esc(areaTxt(hull.km2))}</b><small>zone fréquentée${sel === 'all' ? ` (${U().plural(trips.length, 'sortie')})` : ''}</small></div>`; }
        };
        panel.addEventListener('click', e => {
            const b = e.target.closest('[data-trip]'); if (b) { sel = b.dataset.trip === 'all' ? 'all' : Number(b.dataset.trip); panel.querySelectorAll('[data-trip]').forEach(x => x.classList.toggle('is-on', x === b)); draw(); return; }
            const d = e.target.closest('[data-sv-imp-del]'); if (d) { const imp = Number(d.dataset.svImpDel); A().confirmBox('Ces points seront retirés de la base (le fichier d’origine n’est pas touché).', {title: 'Retirer les points de ce fichier ?', okLabel: 'Retirer les points', danger: true}).then(async ok => { if (!ok) return; await U().write('gps_undo', {import_id: imp}); ctx.gpsAll = null; U().toast('Points retirés.'); ctx.reload(); }); }
            if (e.target.closest('[data-sv-trips-export]')) { const pts = sel === 'all' ? all : trips[sel]?.points || []; UI().menuAt(e.target.closest('[data-sv-trips-export]'), [
                {icon: '📍', label: 'GPX (ce trajet)', disabled: !pts.length, run: () => dl(`${me.title}.gpx`, C().toGPX([{name: me.title, points: pts}]), 'application/gpx+xml')},
                {icon: '📍', label: 'KML (ce trajet)', disabled: !pts.length, run: () => dl(`${me.title}.kml`, C().toKML([{name: me.title, points: pts}]), 'application/vnd.google-earth.kml+xml')},
                {icon: '📡', label: 'Movebank (CSV)', disabled: !pts.length, run: () => dl(`${me.title} — movebank.csv`, C().toMovebank([{name: me.title, taxon: det.profile?.sci_name || det.profile?.taxon || '', tag: det.marks.find(m => /gps|satellite|vhf/.test(m.kind))?.code || '', points: pts}]), 'text/csv;charset=utf-8')},
                {icon: '🧾', label: 'Ouvrir dans le tableur', disabled: !pts.length, run: () => ext.openRowsInSheet?.({name: `${me.title} — trajet`, rows: [['Date', 'Heure', 'Latitude', 'Longitude'], ...pts.map(p => [U().tIso(p[0]), U().tTime(p[0]), p[1], p[2]])]})}], {title: '⤓ Exporter'}); }
        });
        panel.querySelector('[data-link]')?.addEventListener('change', e => { link = e.target.checked; draw(); });
        draw();
    }
    const dl = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = A().safeExportFilename ? A().safeExportFilename(name) : name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
    const areaTxt = km2 => !km2 ? '—' : km2 < 1 ? `${(km2 * 100).toLocaleString('fr-FR', {maximumFractionDigits: 1})} ha` : `${km2.toLocaleString('fr-FR', {maximumFractionDigits: 1})} km²`;
    const durTxt = min => min < 60 ? `${Math.round(min)} min` : `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}`;
    function tripName(t) {
        const a = new Date(t.t0 * 1000), b = new Date(t.t1 * 1000), M = U().MONTHS;
        if (a.toDateString() === b.toDateString()) return `${a.getDate()} ${M[a.getMonth()]} ${a.getFullYear()}, ${U().timeFr(U().tTime(t.t0))} → ${U().timeFr(U().tTime(t.t1))}`;
        return `Nuit du ${a.getDate()}${a.getMonth() !== b.getMonth() ? ' ' + M[a.getMonth()] : ''} au ${b.getDate()} ${M[b.getMonth()]} ${b.getFullYear()}`;
    }
})();
