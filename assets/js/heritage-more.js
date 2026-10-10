/**
 * Base propre, contexte et modularité (serveur : lib/heritage_more.php, structure n°12) :
 *  📮 actes à demander (Registre de courriers) · 🌡️ épidémies, guerres, hivers · 🔐 copie chez un cousin
 *  👶 âges et écarts · 🧹 harmoniser les variantes · 📍 lieux mal placés · 📏 taille des ancêtres
 *  ✊ résistants · 🧩 éditeur de blocs · ⚖️ comparer deux fiches avant fusion · 🏷️ étiquettes sur tous les blocs
 * Chargé après app.js, heritage.js, heritage-tools.js et heritage-links.js (window.LCNDA_APP, window.LCNDA_EXT).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const key of ['personBlocks', 'dashboard', 'lists', 'graphStats', 'maintenance']) ext[key] = ext[key] || {};
    for (const key of ['afterCourriers', 'afterDuplicates', 'afterPersonForm']) ext[key] = ext[key] || [];
    const esc = value => A().escapeHtml(value ?? '');
    const nl = value => esc(value).replace(/\n/g, '<br>');
    const api = (...args) => A().api(...args);
    const toast = (...args) => A().toast(...args);
    const empty = text => A().empty(text);
    const card = (...args) => A().card(...args);
    const S = () => A().state;
    const fmt = (n, d = 0) => Number(n || 0).toLocaleString('fr-FR', {maximumFractionDigits: d});
    const plural = (n, one, many) => `${fmt(n)} ${n > 1 ? many : one}`;
    const isCurrent = (token, module = 'maintenance') => token === S().workspaceToken && S().module === module;
    const personLink = (id, name, extra = '') => id ? `<button type="button" class="table-link" data-h-person="${Number(id)}">${esc(name || 'Personne')}</button>${extra ? ` <small>${esc(extra)}</small>` : ''}` : esc(name || '');
    const pname = p => p ? A().personName(p) : '';
    const pLink = p => p ? personLink(p.id, pname(p) + (p.birth_year || p.death_year ? ` (${p.birth_year || '?'}–${p.death_year || ''})` : '')) : '';
    const header = (eyebrow, title, intro, actions = '') => `<header class="page-header"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2>${intro ? `<p>${intro}</p>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</header>`;
    const tools = (...args) => ext.tools ? ext.tools(...args) : '';
    const refresh = () => ext.refreshView ? ext.refreshView() : null;
    const dialog = opts => ext.openDialog(opts);
    const ls = (key, fallback = '') => { try { return localStorage.getItem(key) ?? fallback; } catch (_) { return fallback; } };
    const lsSet = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };
    const sizeText = bytes => bytes > 1048576 ? fmt(bytes / 1048576, 1) + ' Mo' : fmt(bytes / 1024) + ' ko';
    const dateTimeFr = v => { if (!v) return ''; const d = new Date(String(v).replace(' ', 'T') + (String(v).length === 19 ? 'Z' : '')); return isNaN(d) ? String(v) : d.toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'}); };

    /* ═══════════════════════ 🏷️ ÉTIQUETTES SUR TOUS LES BLOCS ═══════════════════════ */

    const textColor = hex => { const m = String(hex || '').match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i); if (!m) return '#fff'; const [r, g, b] = m.slice(1).map(x => parseInt(x, 16)); return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111' : '#fff'; };
    const oneChip = (l, removable = false) => `<span class="label-chip" style="--label-bg:${esc(l.color || '#0066cc')};--label-fg:${textColor(l.color || '#0066cc')}" data-lp-chip="${Number(l.id)}"><span>${esc(l.name || 'Étiquette')}</span>${removable ? `<button type="button" class="label-chip-remove" data-lp-remove="${Number(l.id)}" aria-label="Retirer l’étiquette">&times;</button>` : ''}</span>`;
    /** Étiquettes affichées sur une fiche de bloc (lecture seule). */
    ext.labelChips = labels => labels?.length ? `<span class="h-label-chips">${labels.map(l => oneChip(l)).join('')}</span>` : '';
    /** Sélecteur d'étiquettes d'un formulaire : enregistré avec la fiche, même à sa création. */
    ext.labelsPicker = (type, labels = []) => `<div class="h-labels-picker" data-pending-labels="${esc(type)}" data-ids="${esc((labels || []).map(l => l.id).join(','))}">
        <span class="section-label">🏷️ Étiquettes</span><span class="h-lp-chips">${(labels || []).map(l => oneChip(l, true)).join('') || '<small class="muted" data-lp-none>Aucune</small>'}</span>
        <button type="button" class="icon-action icon-add" data-lp-add title="Ajouter une étiquette" aria-label="Ajouter une étiquette"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
        <span class="h-lp-box" hidden><input type="text" data-lp-q placeholder="Tape pour chercher ou créer une étiquette…" autocomplete="off"><span class="h-lp-sugg"></span></span></div>`;
    let labelsCache = null;
    const allLabels = async (fresh = false) => { if (!labelsCache || fresh) labelsCache = (await api('labels')).labels || []; return labelsCache; };
    const pickerIds = box => (box.dataset.ids || '').split(',').map(Number).filter(Boolean);
    function pickerSet(box, ids) {
        box.dataset.ids = ids.join(',');
        const byId = Object.fromEntries((labelsCache || []).map(l => [Number(l.id), l]));
        const known = [...box.querySelectorAll('[data-lp-chip]')].reduce((acc, c) => { acc[Number(c.dataset.lpChip)] = {id: c.dataset.lpChip, name: c.textContent.replace('×', '').trim(), color: c.style.getPropertyValue('--label-bg')}; return acc; }, {});
        box.querySelector('.h-lp-chips').innerHTML = ids.map(id => oneChip(byId[id] || known[id] || {id, name: '#' + id}, true)).join('') || '<small class="muted" data-lp-none>Aucune</small>';
    }
    async function pickerSuggest(box) {
        const input = box.querySelector('[data-lp-q]'), out = box.querySelector('.h-lp-sugg');
        const q = input.value.trim().toLowerCase(), ids = pickerIds(box);
        let all = [];
        try { all = await allLabels(); } catch (error) { out.textContent = error.message; return; }
        const list = all.filter(l => !ids.includes(Number(l.id)) && (!q || String(l.name).toLowerCase().includes(q))).slice(0, 8);
        const exists = all.some(l => String(l.name).trim().toLowerCase() === q);
        out.innerHTML = list.map(l => `<button type="button" class="labels-suggestion" data-lp-pick="${l.id}">${oneChip(l)}</button>`).join('') + (q && !exists ? `<button type="button" class="labels-suggestion labels-create" data-lp-create="${esc(input.value.trim())}">+ Créer « ${esc(input.value.trim())} »</button>` : '');
    }
    document.addEventListener('click', async event => {
        const box = event.target.closest?.('.h-labels-picker');
        document.querySelectorAll('.h-labels-picker .h-lp-box:not([hidden])').forEach(b => { if (!box || !box.contains(b)) b.hidden = true; });
        if (!box) return;
        if (event.target.closest('[data-lp-add]')) { const b = box.querySelector('.h-lp-box'); b.hidden = !b.hidden; if (!b.hidden) { b.querySelector('input').value = ''; b.querySelector('input').focus(); pickerSuggest(box); } return; }
        const rm = event.target.closest('[data-lp-remove]');
        if (rm) { pickerSet(box, pickerIds(box).filter(id => id !== Number(rm.dataset.lpRemove))); return; }
        const pick = event.target.closest('[data-lp-pick]');
        if (pick) { pickerSet(box, [...pickerIds(box), Number(pick.dataset.lpPick)]); box.querySelector('[data-lp-q]').value = ''; pickerSuggest(box); return; }
        const create = event.target.closest('[data-lp-create]');
        if (create) {
            try { const r = await api('save_label', {}, {method: 'POST', body: {name: create.dataset.lpCreate}}); await allLabels(true); if (r.result?.id) pickerSet(box, [...pickerIds(box), Number(r.result.id)]); box.querySelector('[data-lp-q]').value = ''; pickerSuggest(box); }
            catch (error) { toast(error.message, 'error'); }
        }
    });
    document.addEventListener('input', event => { const input = event.target.closest?.('[data-lp-q]'); if (input) pickerSuggest(input.closest('.h-labels-picker')); });
    document.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target.closest?.('[data-lp-q]')) { event.preventDefault(); event.target.closest('.h-labels-picker').querySelector('[data-lp-pick],[data-lp-create]')?.click(); } });

    // Les formulaires des blocs appellent « save_… » : on y ajoute les étiquettes choisies (pending_labels).
    const LABELED = {save_voyage: 'voyage', save_placement: 'placement', save_coat_of_arms: 'coat_of_arms', save_poilu: 'poilu', save_field_trip: 'field_trip', save_family_paper: 'family_paper', save_old_map: 'old_map',
        save_probate_inventory: 'probate_inventory', save_help_request: 'help_request', save_parish: 'parish', save_cited_name: 'cited_name', save_resistance: 'resistance', save_custom_block_entry: 'custom_block_entry'};
    let lastForm = null;
    document.addEventListener('submit', event => { lastForm = event.target; }, true);
    function wrapApi() {
        const app = A();
        if (!app || app.api._hMore) return;
        const original = app.api;
        const wrapped = (action, params = {}, opts = {}) => {
            const type = LABELED[action];
            if (type && opts?.body && !(opts.body instanceof FormData) && !('pending_labels' in opts.body)) {
                const box = (lastForm?.isConnected ? lastForm.querySelector(`[data-pending-labels="${type}"]`) : null) || document.querySelector(`dialog[open] [data-pending-labels="${type}"]`);
                if (box) opts = {...opts, body: {...opts.body, pending_labels: pickerIds(box)}};
            }
            return original(action, params, opts);
        };
        wrapped._hMore = true;
        app.api = wrapped;
    }
    wrapApi(); setTimeout(wrapApi, 0);

    /* ═══════════════════════ 📮 ACTES À DEMANDER (Registre de courriers) ═══════════════════════ */

    const RELATIONS = [['descendant', 'Je suis son descendant direct'], ['moi', 'C’est mon propre acte'], ['ascendant', 'Je suis son ascendant direct'], ['conjoint', 'Je suis son conjoint'], ['autre', 'Autre (cousin, collatéral…)']];
    ext.afterCourriers.push(async () => {
        const token = S().workspaceToken;
        let data;
        try { data = await api('recent_acts'); } catch (_) { return; }
        if (token !== S().workspaceToken || S().listType !== 'courriers') return;
        const page = A().$('#workspace .page');
        if (!page || page.querySelector('.h-acts')) return;
        const showAll = ls('lcnda-acts-all') === '1';
        const acts = (data.acts || []).filter(a => showAll || (!a.has_copy && !a.courrier_id));
        const todayIso = new Date().toISOString().slice(0, 10);
        const state = a => a.tag === 'DEAT' ? '<span class="h-badge is-ok">Communicable à tous</span>'
            : a.public ? `<span class="h-badge is-ok">Ouvert à tous depuis ${esc(dateTimeFr(a.open_at))}</span>`
            : `<span class="h-badge is-warn">Réservé à la famille directe jusqu’au ${esc(dateTimeFr(a.open_at))}</span>`;
        const html = `<details class="maintenance-panel h-acts" ${acts.length ? 'open' : ''}><summary><strong>📮 Actes à demander à la mairie</strong> <small>(${acts.length})</small></summary>
            <p class="muted">Les actes de moins de 100 ans ne sont en général pas en ligne : il faut les demander à la mairie. Naissances et mariages de moins de 75 ans : copie intégrale réservée à la personne, ses ascendants, descendants et conjoint (sinon extrait sans filiation). Décès : communicables à tous.</p>
            <label class="checkbox-line"><input type="checkbox" data-h-acts-all ${showAll ? 'checked' : ''}> Montrer aussi ceux que j’ai déjà (copie, source) ou déjà demandés</label>
            ${acts.length ? `<table class="data-table"><thead><tr><th>Acte</th><th>Personne(s)</th><th>Date, lieu</th><th>Accès</th><th>En ligne aux archives</th><th></th></tr></thead><tbody>${acts.map(a => `<tr>
                <td><strong>${esc(a.kind)}</strong>${a.has_copy ? '<br><small>✅ copie ou source déjà là</small>' : ''}</td><td>${a.people.map(pLink).join('<br>')}</td>
                <td>${esc(a.date_text)}${a.place ? `<br><small>${esc(a.place)}${a.county ? ' (' + esc(a.county) + ')' : ''}</small>` : ''}</td><td>${state(a)}</td>
                <td><small>vers ${a.online_from}${a.online_from <= Number(todayIso.slice(0, 4)) ? ' (peut-être déjà)' : ''}</small></td>
                <td>${a.courrier_id ? `<small>✉️ courrier ${esc(a.courrier_statut || '')}</small>` : `<button type="button" class="button small" data-h-act-letter="${a.event_id}">Préparer la lettre</button>`}${!a.public && a.tag !== 'DEAT' ? `<br><button type="button" class="link-button" data-h-act-remind="${a.event_id}">🔔 Me rappeler à l’ouverture</button>` : ''}</td></tr>`).join('')}</tbody></table>` : empty('Aucun acte récent à demander.')}</details>`;
        (page.querySelector('.page-header') || page.firstElementChild).insertAdjacentHTML('afterend', html);
        const box = page.querySelector('.h-acts');
        box.querySelector('[data-h-acts-all]').addEventListener('change', e => { lsSet('lcnda-acts-all', e.target.checked ? '1' : '0'); A().renderList(); });
        box.querySelectorAll('[data-h-act-remind]').forEach(b => b.addEventListener('click', async () => {
            try { const r = await api('act_open_reminder', {}, {method: 'POST', body: {event_id: b.dataset.hActRemind}}); toast(`Rappel posé au ${dateTimeFr(r.result.date)}.`); b.disabled = true; }
            catch (error) { toast(error.message, 'error'); }
        }));
        box.querySelectorAll('[data-h-act-letter]').forEach(b => b.addEventListener('click', () => openLetter(Number(b.dataset.hActLetter), (data.acts || []).find(a => a.event_id === Number(b.dataset.hActLetter)))));
    });
    function openLetter(eventId, act) {
        const relation = ls('lcnda-act-relation', 'descendant');
        dialog({
            eyebrow: 'DEMANDE D’ACTE', title: 'Lettre à la mairie', wide: true, submitLabel: 'Ajouter au registre de courriers',
            body: `<div class="form-grid"><label>Ton nom (signature)<input name="requester" value="${esc(ls('lcnda-act-requester'))}" placeholder="Prénom Nom"></label>
                <label>Ton lien avec la personne<select name="relation">${RELATIONS.map(([k, l]) => `<option value="${k}" ${k === relation ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div>
                <label class="h-block-label">Lettre (tu peux la retoucher)<textarea name="letter" rows="16" class="h-letter"></textarea></label>
                <div class="page-actions"><button type="button" class="button small secondary" data-h-letter-copy>📋 Copier la lettre</button>${act && !act.public && act.tag !== 'DEAT' ? `<label class="checkbox-line"><input type="checkbox" name="remind_open" checked> Me rappeler le ${esc(dateTimeFr(act.open_at))}, quand l’acte sera ouvert à tous</label>` : ''}</div>
                <p class="muted">Beaucoup de mairies acceptent aussi la demande en ligne (service-public.fr pour les naissances et mariages, ou le site de la commune).</p>`,
            onOpen: d => {
                const form = d.querySelector('form');
                const load = async () => {
                    try { const r = await api('act_request_letter', {event_id: eventId, requester: form.requester.value, relation: form.relation.value}); form.letter.value = r.letter; form.dataset.objet = r.objet; }
                    catch (error) { toast(error.message, 'error'); }
                };
                form.requester.addEventListener('change', () => { lsSet('lcnda-act-requester', form.requester.value); load(); });
                form.relation.addEventListener('change', () => { lsSet('lcnda-act-relation', form.relation.value); load(); });
                d.querySelector('[data-h-letter-copy]').addEventListener('click', async () => { try { await navigator.clipboard.writeText(form.letter.value); toast('Lettre copiée.'); } catch (_) { form.letter.select(); document.execCommand('copy'); toast('Lettre copiée.'); } });
                load();
            },
            onSubmit: async form => {
                await api('create_act_request', {}, {method: 'POST', body: {event_id: eventId, requester: form.requester.value, relation: form.relation.value, remind_open: form.remind_open?.checked ? 1 : 0}});
                toast('Courrier ajouté au registre' + (form.remind_open?.checked ? ', rappel posé.' : '.'));
                A().renderList();
            },
        });
    }

    /* ═══════════════════════ 🌡️ ÉPIDÉMIES, GUERRES, HIVERS ═══════════════════════ */

    const CRISIS_COLORS = {'épidémie': '#b5523b', famine: '#b8860b', hiver: '#3d7fb8', guerre: '#555', crise: '#7a5c99'};
    const CRISIS_ICONS = {'épidémie': '🦠', famine: '🌾', hiver: '❄️', guerre: '⚔️', crise: '🍇'};
    function deathsChart(byYear, crises) {
        const years = Object.keys(byYear).map(Number);
        if (!years.length) return '';
        const min = Math.floor(Math.min(...years) / 10) * 10 - 10, max = Math.max(Math.max(...years) + 10, min + 80), top = Math.max(3, ...Object.values(byYear));
        const W = 1000, H = 220, pad = 30, x = y => pad + (y - min) / Math.max(1, max - min + 1) * (W - pad * 2), bw = Math.max(1.5, (W - pad * 2) / Math.max(1, max - min + 1) - 0.5);
        const bands = crises.map(c => `<rect x="${x(c.from)}" y="10" width="${Math.max(3, x(c.to + 1) - x(c.from))}" height="${H - pad - 10}" fill="${CRISIS_COLORS[c.category] || '#999'}" opacity=".18"><title>${esc(c.title)} (${c.from}${c.to !== c.from ? '–' + c.to : ''})</title></rect>`).join('');
        const bars = Object.entries(byYear).map(([y, n]) => `<rect x="${x(Number(y))}" y="${H - pad - n / top * (H - pad - 20)}" width="${bw}" height="${n / top * (H - pad - 20)}" fill="#333"><title>${y} : ${n} décès</title></rect>`).join('');
        const ticks = []; for (let y = Math.ceil(min / 50) * 50; y <= max; y += 50) ticks.push(`<text x="${x(y)}" y="${H - 8}" font-size="13" text-anchor="middle" fill="currentColor">${y}</text>`);
        return `<svg class="h-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Décès de la famille par année">${bands}${bars}${ticks.join('')}</svg>`;
    }
    ext.lists.historical_context = async token => {
        const data = await api('historical_context');
        if (!isCurrent(token, 'listes')) return;
        const crises = data.crises || [];
        const hit = crises.filter(c => c.victims.length);
        A().$('#workspace').innerHTML = `<section class="page collection-page">${header('LISTES', 'Épidémies, guerres, hivers terribles', 'Les grandes crises de l’histoire de France à côté des décès de ta famille : pour comprendre une vague de morts (choléra de 1832, Grand Hiver de 1709, grippe espagnole…).')}
            <section class="maintenance-panel"><h3>Décès de la famille par année</h3>${deathsChart(data.by_year || {}, crises) || empty('Aucun décès daté.')}
                <p class="h-legend">${Object.entries(CRISIS_ICONS).map(([k, i]) => `<span><i style="background:${CRISIS_COLORS[k]}"></i>${i} ${esc(k)}</span>`).join('')}</p></section>
            ${(data.spikes || []).length ? `<section class="maintenance-panel"><h3>Années noires de la famille</h3><table class="data-table"><thead><tr><th>Année</th><th>Décès</th><th>D’habitude</th><th>Explication possible</th></tr></thead><tbody>${data.spikes.map(s => `<tr><td><strong>${s.year}</strong></td><td>${s.deaths}</td><td>${fmt(s.usual, 1)} / an</td><td>${s.explained.length ? esc(s.explained.join(' ; ')) : '<span class="muted">aucune crise connue : épidémie locale ? (regarde l’âge des morts : enfants → variole, rougeole, dysenterie)</span>'}</td></tr>`).join('')}</tbody></table></section>` : ''}
            <h3>${plural(hit.length, 'crise a touché', 'crises ont touché')} la famille</h3>
            <div class="h-records">${crises.map(c => `<article class="h-record h-crisis ${c.victims.length ? '' : 'is-quiet'}" style="--crisis:${CRISIS_COLORS[c.category] || '#999'}"><header><div><strong>${CRISIS_ICONS[c.category] || '•'} ${esc(c.title)}</strong> <small>${c.from}${c.to !== c.from ? '–' + c.to : ''} · ${esc(c.scope === 'France' ? 'toute la France' : 'régions : ' + c.scope)}</small></div>${c.excess ? `<span class="h-badge ${c.excess >= 2 ? 'is-warn' : ''}">${c.excess >= 2 ? '×' + fmt(c.excess, 1) + ' la mortalité habituelle' : 'mortalité ordinaire'}</span>` : ''}</header>
                <p>${esc(c.description)}</p>${c.victims.length ? `<details ${c.victims.length <= 6 ? 'open' : ''}><summary>${plural(c.victims.length, 'décès dans la famille', 'décès dans la famille')} pendant cette période</summary><ul>${c.victims.map(v => `<li>${pLink(v.person)} — ${esc(v.date)}${v.place ? ' à ' + esc(v.place) : ''}${v.age !== null ? ` <small>(${v.age} ans)</small>` : ''}</li>`).join('')}</ul></details>` : '<p class="muted">Aucun décès de la famille enregistré pendant cette crise.</p>'}</article>`).join('') || empty('Aucune crise dans la période couverte par ta base.')}</div></section>`;
        A().bindTableLinks();
    };

    /* ═══════════════════════ ✊ RÉSISTANTS ═══════════════════════ */

    const KIND_ICON = {entree: '✊', mission: '✉️', sabotage: '💥', combat: '🔫', cache: '🏚️', passage: '🚧', arrestation: '⛓️', interrogatoire: '❓', internement: '🔒', deportation: '🚂', evasion: '🏃', liberation: '🕊️', execution: '⚰️', deces: '✝️', decoration: '🎖️', autre: '•'};
    let resistanceKinds = {entree: 'Entrée en résistance', autre: 'Autre'};
    const stepPlace = s => s.place_text ? ` à ${esc(s.place_text)}` : '';
    const resLinks = person => {
        const n = encodeURIComponent(pname(person));
        return `<p class="h-links">🔎 Chercher : <a href="https://fusilles-40-44.maitron.fr/?s=${n}" target="_blank" rel="noopener noreferrer">Maitron des fusillés ↗</a> · <a href="https://www.memoiredeshommes.sga.defense.gouv.fr/" target="_blank" rel="noopener noreferrer">Mémoire des hommes (dossiers de résistants GR 16 P) ↗</a> · <a href="http://www.bddm.org/liv/recherche.php" target="_blank" rel="noopener noreferrer">Livre-Mémorial des déportés ↗</a> · <a href="https://museedelaresistanceenligne.org/" target="_blank" rel="noopener noreferrer">Musée de la Résistance en ligne ↗</a> · <a href="https://www.ordredelaliberation.fr/fr/compagnons" target="_blank" rel="noopener noreferrer">Compagnons de la Libération ↗</a></p>`;
    };
    function resistanceMap(steps) {
        const pts = steps.filter(s => s.lat !== null && s.lat !== '' && s.lon !== null && s.lon !== '').map(s => ({lat: Number(s.lat), lon: Number(s.lon), label: `${s.date_start || ''} ${s.kind_label || ''}${s.place_text ? ' — ' + s.place_text : ''}`.trim(), color: ['arrestation', 'execution', 'deportation', 'deces'].includes(s.kind) ? '#b5523b' : '#333'}));
        if (!pts.length || !ext.miniMap) return '';
        return ext.miniMap(pts, pts.length > 1 ? [{coords: pts.map(p => [p.lat, p.lon]), color: '#b5523b', dashed: true}] : [], {height: 300});
    }
    function resistanceHtml(r, person, withPerson = false) {
        const pr = r.profile || {};
        const chips = [pr.nom_de_guerre && `Nom de guerre : <strong>« ${esc(pr.nom_de_guerre)} »</strong>`, pr.network && `Réseau : ${esc(pr.network)}`, pr.movement && `Mouvement : ${esc(pr.movement)}`, pr.rank && `Grade : ${esc(pr.rank)}`,
            (pr.joined || pr.left_date) && `${esc(pr.joined || '?')} → ${esc(pr.left_date || '?')}`, pr.recognition && `Reconnaissance : ${esc(pr.recognition)}`].filter(Boolean);
        const fate = [Number(pr.arrested) && '<span class="h-badge is-warn">⛓️ Arrêté(e)</span>', Number(pr.deported) && '<span class="h-badge is-warn">🚂 Déporté(e)</span>', Number(pr.killed) && '<span class="h-badge is-dark">⚰️ Mort(e) pour la France</span>'].filter(Boolean).join(' ');
        const steps = r.steps || [];
        return `${withPerson ? `<h4>${pLink(person)}</h4>` : ''}${ext.labelChips(r.labels)}${chips.length || fate ? `<p class="h-res-profile">${chips.join(' · ')} ${fate}</p>` : ''}${pr.fate ? `<p><strong>Devenir :</strong> ${esc(pr.fate)}</p>` : ''}${pr.file_ref ? `<p><small>Dossier : ${esc(pr.file_ref)}</small></p>` : ''}
            ${steps.length ? `<div class="h-voyage-layout"><ol class="h-res-steps">${steps.map(s => `<li class="is-${esc(s.kind)}"><strong>${esc(s.date_start || 'Date ?')}${s.date_end ? ' → ' + esc(s.date_end) : ''}</strong> ${KIND_ICON[s.kind] || '•'} ${esc(s.kind_label)}${stepPlace(s)}${s.linked_person_id ? ` — avec ${personLink(s.linked_person_id, s.linked_name)}` : ''}${s.linked_text ? ` — ${esc(s.linked_text)}` : ''}${s.note ? `<br><small>${nl(s.note)}</small>` : ''}</li>`).join('')}</ol><div>${resistanceMap(steps)}</div></div>` : '<p class="muted">Aucune étape : ajoute son parcours jour par jour (missions, caches, arrestation, internement, déportation…).</p>'}
            ${(r.cited_in || []).length ? `<h5>Cité(e) dans le parcours de</h5><ul>${r.cited_in.map(s => `<li>${personLink(s.person_id, s.owner_name)} — ${esc(s.date_start || '')} ${esc(s.kind_label)}${stepPlace(s)}</li>`).join('')}</ul>` : ''}
            ${ext.thumbs ? ext.thumbs('resistance-' + (person?.id || 0), r.media || []) : ''}${pr.notes ? `<p class="h-transcription">${nl(pr.notes)}</p>` : ''}${person ? resLinks(person) : ''}`;
    }
    ext.personBlocks.resistance = (index, detail, {editOnly}) => {
        const p = detail.person, r = detail.heritage?.resistance;
        if (!r) return '';
        if (r.kinds) resistanceKinds = r.kinds;
        const has = r.profile || (r.steps || []).length;
        if (!(ext.flagShown ? ext.flagShown(p, 'show_resistance_block') : Number(p.show_resistance_block)) && !has && !(r.cited_in || []).length) return '';
        return card(index, 'Résistant', (r.steps || []).length || '', resistanceHtml(r, p), 'span-12', editOnly(has ? tools(`data-h-res-edit="${p.id}"`, `data-h-res-clear="${p.id}"`, 'le parcours de résistant') : `<button type="button" class="button small secondary" data-h-res-edit="${p.id}">+ Parcours</button>`));
    };
    document.addEventListener('click', async event => {
        const edit = event.target.closest?.('[data-h-res-edit]');
        if (edit) { openResistanceDialog(Number(edit.dataset.hResEdit)); return; }
        const clear = event.target.closest?.('[data-h-res-clear]');
        if (clear && confirm('Effacer tout le parcours de résistant de cette fiche ?')) {
            try { await api('clear_resistance', {}, {method: 'POST', body: {person_id: clear.dataset.hResClear}}); toast('Parcours effacé.'); refresh(); } catch (error) { toast(error.message, 'error'); }
        }
    });
    async function openResistanceDialog(personId) {
        const r = await api('resistance', {person_id: personId});
        resistanceKinds = r.kinds || resistanceKinds;
        const pr = r.profile || {};
        const f = k => esc(pr[k] || '');
        const placeField = (name, value, lat, lon, ph) => ext.placeField ? ext.placeField(name, value, lat, lon, ph) : `<input name="${name}" value="${esc(value || '')}">`;
        const stepRow = (s = {}) => `<div class="h-res-row"><div class="form-grid">
            <label>Du<input name="s_date_start" value="${esc(s.date_start || '')}" placeholder="12 mars 1943"></label><label>Au <small>(facultatif)</small><input name="s_date_end" value="${esc(s.date_end || '')}" placeholder="20 mars 1943"></label>
            <label>Ce qui s’est passé<select name="s_kind">${Object.entries(resistanceKinds).map(([k, l]) => `<option value="${k}" ${s.kind === k ? 'selected' : ''}>${KIND_ICON[k] || ''} ${esc(l)}</option>`).join('')}</select></label>
            <label>Lieu${placeField('s_place', s.place_text, s.lat, s.lon, 'Lyon, ferme des Brosses, prison de Montluc…')}</label>
            <label>Avec (fiche)${A().collectionPersonField('s_person', s.linked_person_id ? {id: s.linked_person_id, first_name: s.linked_name || '', last_name: ''} : null, 'Compagnon, logeur, dénonciateur…')}</label>
            <label>Avec (texte libre)<input name="s_linked_text" value="${esc(s.linked_text || '')}" placeholder="le groupe Combat de Bourg"></label>
            <label class="span-2">Détails<textarea name="s_note" rows="2">${esc(s.note || '')}</textarea></label></div>
            <div class="h-row-actions"><button type="button" class="icon-button" data-h-res-up title="Monter">↑</button><button type="button" class="icon-button" data-h-res-down title="Descendre">↓</button><button type="button" class="icon-button danger" data-h-res-del title="Retirer cette étape">🗑</button></div></div>`;
        dialog({
            eyebrow: 'RÉSISTANT', title: 'Parcours de résistant', wide: true, labels: ['resistance', r.labels],
            body: `<div class="form-grid">
                <label>Nom de guerre<input name="nom_de_guerre" value="${f('nom_de_guerre')}" placeholder="Max, Rex…"></label><label>Réseau<input name="network" value="${f('network')}" placeholder="Alliance, Comète, Brutus…"></label>
                <label>Mouvement, maquis, groupe<input name="movement" value="${f('movement')}" placeholder="Combat, FTP, maquis du Vercors…"></label><label>Grade, rôle<input name="rank" value="${f('rank')}" placeholder="agent P2, chef de groupe, agent de liaison…"></label>
                <label>Entrée en résistance<input name="joined" value="${f('joined')}" placeholder="juin 1941"></label><label>Jusqu’à<input name="left_date" value="${f('left_date')}" placeholder="septembre 1944"></label>
                <label>Reconnaissance, décorations<input name="recognition" value="${f('recognition')}" placeholder="Médaille de la Résistance, CVR…"></label><label>Référence du dossier<input name="file_ref" value="${f('file_ref')}" placeholder="SHD GR 16 P 123456"></label>
                <div class="span-2 h-checks"><label class="checkbox-line"><input type="checkbox" name="arrested" ${Number(pr.arrested) ? 'checked' : ''}> ⛓️ Arrêté(e)</label><label class="checkbox-line"><input type="checkbox" name="deported" ${Number(pr.deported) ? 'checked' : ''}> 🚂 Déporté(e)</label><label class="checkbox-line"><input type="checkbox" name="killed" ${Number(pr.killed) ? 'checked' : ''}> ⚰️ Tué(e), fusillé(e), mort(e) en déportation</label></div>
                <label class="span-2">Devenir<input name="fate" value="${f('fate')}" placeholder="Fusillé au Mont-Valérien le 15 décembre 1943 / rentré de Buchenwald en mai 1945"></label></div>
                <h4>Parcours jour par jour</h4><p class="muted">Missions, caches, passages de ligne, arrestation, prisons, déportation… Chaque lieu apparaît sur la carte, dans l’ordre. Une personne choisie « avec » voit ce passage sur sa propre fiche.</p>
                <div data-h-res-rows>${(r.steps.length ? r.steps : [{}]).map(stepRow).join('')}</div><button type="button" class="button small secondary" data-h-res-add>+ Étape</button>
                <label class="h-block-label">Notes, témoignages<textarea name="notes" rows="3">${f('notes')}</textarea></label>
                <h4>Documents, photos, enregistrements</h4>${ext.mediaEditorHtml ? ext.mediaEditorHtml('resistance', personId, r.media || [], [['', 'Carte de combattant, fiche d’arrestation, photos, témoignage enregistré…', 'image/*,application/pdf,audio/*,video/*']]) : ''}`,
            onOpen: d => {
                const rows = d.querySelector('[data-h-res-rows]');
                d.querySelector('[data-h-res-add]').addEventListener('click', () => { rows.insertAdjacentHTML('beforeend', stepRow()); A().bindCollectionPersonFields(rows.lastElementChild); });
                rows.addEventListener('click', e => {
                    const row = e.target.closest('.h-res-row');
                    if (e.target.closest('[data-h-res-del]')) row.remove();
                    if (e.target.closest('[data-h-res-up]') && row.previousElementSibling) row.parentElement.insertBefore(row, row.previousElementSibling);
                    if (e.target.closest('[data-h-res-down]') && row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling, row);
                });
            },
            onSubmit: async form => {
                const v = A().formObject(form);
                const profile = Object.fromEntries(['nom_de_guerre', 'network', 'movement', 'rank', 'joined', 'left_date', 'recognition', 'file_ref', 'fate', 'notes'].map(k => [k, v[k] || '']));
                ['arrested', 'deported', 'killed'].forEach(k => { profile[k] = form.querySelector(`[name=${k}]`).checked ? 1 : 0; });
                const steps = [...form.querySelectorAll('.h-res-row')].map(row => ({
                    date_start: row.querySelector('[name=s_date_start]').value, date_end: row.querySelector('[name=s_date_end]').value, kind: row.querySelector('[name=s_kind]').value,
                    place_text: row.querySelector('[name=s_place]').value, lat: row.querySelector('[name=s_place_lat]')?.value || '', lon: row.querySelector('[name=s_place_lon]')?.value || '',
                    linked_person_id: row.querySelector('[name=s_person]').value, linked_text: row.querySelector('[name=s_linked_text]').value, note: row.querySelector('[name=s_note]').value,
                }));
                await api('save_resistance', {}, {method: 'POST', body: {person_id: personId, profile, steps}});
                if (ext.uploadMediaEditor) await ext.uploadMediaEditor(form, 'resistance', personId);
                toast('Parcours enregistré.');
                refresh();
            },
        });
    }
    ext.lists.resistance_list = async token => {
        const data = await api('resistance_overview');
        if (!isCurrent(token, 'listes')) return;
        const people = data.people || [];
        const pts = [], paths = [];
        people.forEach(r => { const c = (r.steps || []).filter(s => s.lat !== null && s.lat !== '').map(s => [Number(s.lat), Number(s.lon)]); c.forEach((x, i) => pts.push({lat: x[0], lon: x[1], label: pname(r.person) + ' — ' + (r.steps.filter(s => s.lat !== null && s.lat !== '')[i]?.place_text || '')})); if (c.length > 1) paths.push({coords: c, color: '#b5523b', dashed: true}); });
        A().$('#workspace').innerHTML = `<section class="page collection-page">${header('LISTES', 'Résistants', 'Les résistants de la famille : réseaux, arrestations, caches, déportations, et leurs parcours sur la carte. Pour en ajouter un : fiche → Identité → « Blocs à afficher sur la fiche » → ✊ Résistant.')}
            ${people.length ? `${pts.length && ext.miniMap ? `<section class="maintenance-panel">${ext.miniMap(pts, paths, {height: 380})}</section>` : ''}
            <table class="data-table"><thead><tr><th>Personne</th><th>Nom de guerre</th><th>Réseau, mouvement</th><th>Période</th><th>Devenir</th><th>Étapes</th></tr></thead><tbody>${people.map(r => { const pr = r.profile || {}; return `<tr><td>${pLink(r.person)}${ext.labelChips(r.labels)}</td><td>${esc(pr.nom_de_guerre || '')}</td><td>${esc([pr.network, pr.movement].filter(Boolean).join(' · '))}</td><td>${esc([pr.joined, pr.left_date].filter(Boolean).join(' → '))}</td><td>${[Number(pr.arrested) && '⛓️ arrêté', Number(pr.deported) && '🚂 déporté', Number(pr.killed) && '⚰️ mort'].filter(Boolean).join(', ')}${pr.fate ? `<br><small>${esc(pr.fate)}</small>` : ''}</td><td>${(r.steps || []).length}</td></tr>`; }).join('')}</tbody></table>` : empty('Aucun résistant pour l’instant.')}</section>`;
        A().bindTableLinks();
    };

    /* ═══════════════════════ 🧩 BLOCS PERSONNALISÉS (sur les fiches) ═══════════════════════ */

    const FIELD_TYPES = [
        ['text', '📝', 'Texte court', 'Un nom, une cote, un titre…'], ['longtext', '📄', 'Texte long', 'Un récit, une transcription, des souvenirs…'], ['date', '📅', 'Date', '12 mai 1885, vers 1850…'],
        ['number', '🔢', 'Nombre', 'Une somme, une surface, un nombre d’enfants…'], ['select', '📋', 'Liste de choix', 'Choisir parmi des réponses que tu écris'], ['checkbox', '☑️', 'Case à cocher', 'Oui / non'],
        ['url', '🔗', 'Lien internet', 'Une page d’archives, un article…'], ['person', '👤', 'Personne liée', 'Une autre fiche de la base'], ['place', '📍', 'Lieu', 'Placé tout seul sur la carte'],
        ['media', '🖼️', 'Photos, vidéos, sons', 'Fichiers à ajouter'], ['person_info', 'ℹ️', 'Info tirée d’une fiche', 'Naissance, décès, métier… repris tout seuls'], ['map', '🗺️', 'Carte', 'Les lieux du bloc sur une carte'],
    ];
    const typeInfo = t => FIELD_TYPES.find(x => x[0] === t) || FIELD_TYPES[0];
    const INFOS = [['birth', 'Naissance (date et lieu)'], ['death', 'Décès (date et lieu)'], ['age', 'Âge au décès'], ['occupation', 'Métier'], ['parents', 'Parents'], ['spouses', 'Conjoints'], ['children', 'Nombre d’enfants'], ['birthplace', 'Lieu de naissance'], ['residence', 'Lieu de résidence']];
    const INFO_DEFAULT = 'Info tirée d’une fiche';
    /** Intitulé affiché : celui choisi, sinon le nom de l'info (« Naissance (date et lieu) »…), avec la fiche d'origine. */
    const infoLabel = (f, fields = []) => {
        const base = f.label && f.label !== INFO_DEFAULT ? f.label : (INFOS.find(i => i[0] === f.info)?.[1] || 'Info');
        const from = f.from && f.from !== 'self' ? fields.find(x => x.key === f.from) : null;
        return from && !base.includes(from.label) ? `${base} — ${from.label}` : base;
    };
    const fieldLabel = (f, fields) => f.type === 'person_info' ? infoLabel(f, fields) : f.label;
    const ACCEPT = {image: 'image/*', video: 'video/*', audio: 'audio/*', all: 'image/*,video/*,audio/*,application/pdf'};
    const DISPLAY = {flag: 'Dans « Blocs à afficher sur la fiche » : je coche la case sur les fiches concernées', always: 'Sur toutes les fiches', filled: 'Seulement sur les fiches où il est rempli'};
    const blockPoints = (def, entries) => {
        const pts = [];
        entries.forEach(e => def.fields.filter(f => f.type === 'place').forEach(f => { const v = e.data[f.key]; if (v && v.lat !== null && v.lat !== undefined && v.lat !== '') pts.push({lat: Number(v.lat), lon: Number(v.lon), label: `${f.label} : ${v.text}`}); }));
        return pts;
    };
    function fieldValueHtml(def, f, e) {
        const v = e.data?.[f.key];
        switch (f.type) {
            case 'checkbox': return v ? '✅ oui' : '—';
            case 'longtext': return v ? nl(v) : '';
            case 'url': return v ? `<a href="${esc(v)}" target="_blank" rel="noopener noreferrer">${esc(v.replace(/^https?:\/\//, '').slice(0, 60))} ↗</a>` : '';
            case 'person': return e.people?.[f.key] ? pLink(e.people[f.key]) : '';
            case 'place': return v?.text ? `${esc(v.text)}${v.lat !== null && v.lat !== undefined && v.lat !== '' ? ' <small title="Placé sur la carte">📍</small>' : ''}` : '';
            case 'media': { const m = (e.media || []).filter(x => (x.role || '') === f.key); return m.length && ext.thumbs ? ext.thumbs(`cb-${e.id}-${f.key}`, m) : ''; }
            case 'number': return v === '' || v === null || v === undefined ? '' : esc(fmt(v, 2));
            case 'map': return '';
            default: return esc(v ?? '');
        }
    }
    function entryHtml(def, e, editable) {
        const rows = def.fields.filter(f => f.type !== 'map').map(f => { const h = fieldValueHtml(def, f, e); return h ? `<div class="data-row"><dt>${esc(fieldLabel(f, def.fields))}</dt><dd>${h}</dd></div>` : ''; }).join('');
        return `<article class="h-cb-entry"><div class="h-cb-entry-head">${ext.labelChips(e.labels)}${editable ? tools(`data-h-cb-edit="${e.id}" data-h-cb-block="${def.id}"`, `data-h-cb-del="${e.id}"`, 'cette fiche du bloc') : ''}</div><dl class="data-list">${rows || '<p class="muted">Vide.</p>'}</dl></article>`;
    }
    let currentBlocks = [];
    ext.personBlocks.custom_blocks = (index, detail, {editOnly}) => {
        const p = detail.person, blocks = detail.heritage?.custom_blocks || [];
        currentBlocks = blocks;
        if (!blocks.length) return '';
        const editable = !Number(p.is_locked);
        const cards = [], waiting = [];
        blocks.forEach(b => {
            const show = b.display === 'always' || b.entries.length || (b.display === 'flag' && b.flagged);
            if (!show) { if (b.display === 'filled') waiting.push(b); return; }
            const canAdd = Number(b.repeatable) || !b.entries.length;
            const hasMap = b.fields.some(f => f.type === 'map');
            const pts = hasMap ? blockPoints(b, b.entries) : [];
            const selfInfos = b.fields.filter(f => f.type === 'person_info' && f.from === 'self' && b.self_info?.[f.key]).map(f => `<span class="collection-kind">${esc(infoLabel(f, b.fields))} : ${esc(b.self_info[f.key])}</span>`).join(' ');
            const body = `${b.description ? `<p class="muted">${esc(b.description)}</p>` : ''}${b.entries.length ? '' : selfInfos ? `<p>${selfInfos}</p>` : ''}
                ${b.entries.length ? `<div class="${pts.length ? 'h-voyage-layout' : ''}"><div class="h-cb-entries">${b.entries.map(e => entryHtml(b, e, editable)).join('')}</div>${pts.length && ext.miniMap ? `<div>${ext.miniMap(pts, pts.length > 1 ? [{coords: pts.map(x => [x.lat, x.lon]), color: '#555', dashed: true}] : [], {height: 300})}</div>` : ''}</div>` : empty('Rien de rempli pour l’instant.')}`;
            cards.push(card(index, `${b.icon || '🧩'} ${b.name}`, b.entries.length || '', body, 'span-12', editOnly(canAdd ? `<button type="button" class="button small secondary" data-h-cb-edit="0" data-h-cb-block="${b.id}">+ Remplir</button>` : '')));
        });
        if (waiting.length && editable) cards.push(editOnly(card(index, 'Mes blocs', '', `<p class="muted">Blocs créés dans Maintenance → Éditeur de blocs, affichés seulement une fois remplis :</p><div class="page-actions">${waiting.map(b => `<button type="button" class="button small secondary" data-h-cb-edit="0" data-h-cb-block="${b.id}">${esc(b.icon || '🧩')} ${esc(b.name)}</button>`).join('')}</div>`, 'span-6')));
        return cards.join('');
    };
    document.addEventListener('click', async event => {
        const edit = event.target.closest?.('[data-h-cb-edit]');
        if (edit) { openEntryDialog(Number(edit.dataset.hCbBlock), Number(edit.dataset.hCbEdit)); return; }
        const del = event.target.closest?.('[data-h-cb-del]');
        if (del && confirm('Supprimer cette fiche du bloc ?')) {
            try { await api('delete_custom_block_entry', {}, {method: 'POST', body: {id: del.dataset.hCbDel}}); toast('Supprimé.'); refresh(); } catch (error) { toast(error.message, 'error'); }
        }
    });
    function fieldInputHtml(f, value, entry, allFields = []) {
        const help = f.help ? `<small class="muted">${esc(f.help)}</small>` : '';
        const req = f.required ? ' required' : '';
        const name = `f_${f.key}`;
        switch (f.type) {
            case 'longtext': return `<label class="span-2">${esc(f.label)}${help}<textarea name="${name}" rows="4"${req}>${esc(value ?? '')}</textarea></label>`;
            case 'number': return `<label>${esc(f.label)}${help}<input type="text" inputmode="decimal" name="${name}" value="${esc(value ?? '')}"></label>`;
            case 'select': return `<label>${esc(f.label)}${help}<select name="${name}"${req}><option value="">—</option>${f.options.map(o => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
            case 'checkbox': return `<label class="checkbox-line"><input type="checkbox" name="${name}" ${value ? 'checked' : ''}> ${esc(f.label)}</label>`;
            case 'url': return `<label>${esc(f.label)}${help}<input type="url" name="${name}" value="${esc(value ?? '')}" placeholder="https://…"></label>`;
            case 'person': return `<label>${esc(f.label)}${help}${A().collectionPersonField(name, entry?.people?.[f.key] || null, 'Tape un nom…')}</label>`;
            case 'place': return `<label>${esc(f.label)}${help}${ext.placeField ? ext.placeField(name, value?.text || '', value?.lat ?? '', value?.lon ?? '', 'Commune, adresse…') : `<input name="${name}" value="${esc(value?.text || '')}">`}</label>`;
            case 'person_info': return `<div class="h-cb-info"><strong>ℹ️ ${esc(infoLabel(f, allFields))}</strong> <small class="muted">(repris tout seul de la fiche${f.from !== 'self' ? ' choisie' : ''})</small>${value ? ` : ${esc(value)}` : ' : <span class="muted">rien de connu pour l’instant</span>'}</div>`;
            case 'map': return `<p class="muted span-2">🗺️ ${esc(f.label)} : la carte montrera les lieux de ce bloc.</p>`;
            case 'media': return '';
            default: return `<label>${esc(f.label)}${help}<input name="${name}" value="${esc(value ?? '')}"${req}${f.type === 'date' ? ' placeholder="12 mai 1885"' : ''}></label>`;
        }
    }
    async function openEntryDialog(blockId, entryId) {
        let def = currentBlocks.find(b => Number(b.id) === blockId);
        if (!def) { const d = await api('custom_blocks_defs'); def = (d.blocks || []).find(b => Number(b.id) === blockId); }
        if (!def) return toast('Bloc introuvable.', 'error');
        const entry = (def.entries || []).find(e => Number(e.id) === entryId) || {id: 0, data: {}, media: [], labels: [], people: {}};
        const personId = S().currentPersonId;
        const mediaFields = def.fields.filter(f => f.type === 'media');
        dialog({
            eyebrow: (def.icon || '🧩') + ' ' + def.name.toUpperCase(), title: entryId ? 'Modifier' : 'Remplir le bloc', wide: def.fields.length > 4, labels: Number(def.labels) ? ['custom_block_entry', entry.labels] : null,
            body: `${def.description ? `<p class="muted">${esc(def.description)}</p>` : ''}<div class="form-grid">${def.fields.map(f => fieldInputHtml(f, f.type === 'person_info' ? (entry.data[f.key] || def.self_info?.[f.key] || '') : entry.data[f.key], entry, def.fields)).join('')}</div>
                ${mediaFields.length && ext.mediaEditorHtml ? ext.mediaEditorHtml('custom_block_entry', entry.id, entry.media || [], mediaFields.map(f => [f.key, f.label, ACCEPT[f.accept] || ACCEPT.all])) : ''}`,
            onSubmit: async form => {
                const data = {};
                def.fields.forEach(f => {
                    const el = form.querySelector(`[name="f_${f.key}"]`);
                    if (f.type === 'checkbox') data[f.key] = el?.checked ? 1 : 0;
                    else if (f.type === 'place') data[f.key] = {text: el?.value || '', lat: form.querySelector(`[name="f_${f.key}_lat"]`)?.value || null, lon: form.querySelector(`[name="f_${f.key}_lon"]`)?.value || null};
                    else if (el) data[f.key] = el.value;
                });
                const saved = await api('save_custom_block_entry', {}, {method: 'POST', body: {id: entry.id, block_id: def.id, person_id: personId, data}});
                if (ext.uploadMediaEditor) await ext.uploadMediaEditor(form, 'custom_block_entry', saved.result.id);
                toast('Enregistré.');
                refresh();
            },
        });
    }
    // Fenêtre IDENTITÉ : une case par bloc personnalisé « à cocher », dans « Blocs à afficher sur la fiche »
    let defsCache = null;
    ext.afterPersonForm.push(async (form, p) => {
        const box = form.querySelector('.person-heritage-flags');
        if (!box) return;
        box.querySelector('.h-cb-flags')?.remove();
        try { defsCache = (await api('custom_blocks_defs')).blocks || []; } catch (_) { return; }
        const flagged = new Set((S().currentPerson?.heritage?.custom_blocks || []).filter(b => b.flagged).map(b => Number(b.id)));
        const defs = defsCache.filter(b => b.display === 'flag');
        if (!defs.length) return;
        box.insertAdjacentHTML('beforeend', `<div class="h-cb-flags" data-cb-person="${Number(p.id)}">${defs.map(b => `<label class="checkbox-line"><input type="checkbox" data-cb-flag="${b.id}" ${flagged.has(Number(b.id)) ? 'checked' : ''}> ${esc(b.icon || '🧩')} ${esc(b.name)} <small style="font-weight:normal;color:#666">(mon bloc${b.description ? ' : ' + esc(b.description.slice(0, 80)) : ''})</small></label>`).join('')}</div>`);
    });
    document.addEventListener('submit', event => {
        const form = event.target;
        if (form.getAttribute?.('id') !== 'person-form' || event.submitter?.value === 'cancel') return; // (form.id = le champ « id » du formulaire)
        const box = form.querySelector('.h-cb-flags');
        if (!box || !Number(box.dataset.cbPerson)) return;
        const ids = [...box.querySelectorAll('[data-cb-flag]:checked')].map(i => Number(i.dataset.cbFlag));
        setTimeout(async () => { try { await api('set_custom_block_flags', {}, {method: 'POST', body: {person_id: box.dataset.cbPerson, block_ids: ids}}); refresh(); } catch (error) { toast(error.message, 'error'); } }, 400);
    }, true);

    /* ═══════════════════════ 🧩 ÉDITEUR DE BLOCS (Maintenance) ═══════════════════════ */

    const TEMPLATES = [
        {name: 'Décorations et médailles', icon: '🎖️', description: 'Médailles, décorations, distinctions reçues.', repeatable: 1, fields: [['text', 'Décoration'], ['date', 'Date'], ['longtext', 'Motif, citation'], ['media', 'Diplôme, photo de la médaille']]},
        {name: 'Maison de famille', icon: '🏡', description: 'Les maisons où la famille a vécu.', repeatable: 1, fields: [['place', 'Adresse'], ['text', 'Période'], ['longtext', 'Souvenirs'], ['media', 'Photos'], ['map', 'Carte des maisons']]},
        {name: 'Témoignage enregistré', icon: '🎙️', description: 'Souvenirs racontés par un proche.', repeatable: 1, fields: [['person', 'Raconté par'], ['date', 'Enregistré le'], ['media', 'Enregistrement (son ou vidéo)'], ['longtext', 'Résumé, transcription'], ['person_info', 'Naissance (date et lieu)']]},
        {name: 'Bloc vide', icon: '🧩', description: '', repeatable: 1, fields: [['text', 'Titre']]},
    ];
    const newField = (type, label) => ({key: 'f' + Math.random().toString(36).slice(2, 8), type, label: label || (type === 'person_info' ? INFOS[0][1] : typeInfo(type)[2]), help: '', options: type === 'select' ? ['Choix 1', 'Choix 2'] : [], info: 'birth', from: 'self', accept: 'all', required: false});
    let editorDef = null;
    ext.maintenance.block_editor = async token => {
        const data = await api('custom_blocks_defs');
        if (!isCurrent(token)) return;
        const blocks = data.blocks || [];
        if (editorDef) return renderBlockEditor(token);
        A().$('#workspace').innerHTML = `<section class="page collection-page">${header('MAINTENANCE', 'Éditeur de blocs', 'Crée tes propres blocs pour les fiches (décorations, maisons, témoignages, carnet de santé…), sans rien programmer. Tu peux les partager avec un proche et importer ceux des autres.', '<button type="button" class="button" data-h-be-new>+ Nouveau bloc</button>')}
            <section class="maintenance-panel"><h3>Importer un bloc reçu</h3><p class="muted">Un fichier « .lcnda-bloc.json » envoyé par un cousin : seul le modèle du bloc est partagé, jamais les données des fiches.</p><input type="file" accept=".json,application/json" data-h-be-import></section>
            ${blocks.length ? `<div class="h-records">${blocks.map(b => `<article class="h-record"><header><div><strong>${esc(b.icon)} ${esc(b.name)}</strong> <small>${plural(b.fields.length, 'champ', 'champs')} · ${plural(b.entry_count, 'fiche remplie', 'fiches remplies')}${b.author ? ' · par ' + esc(b.author) : ''}</small></div>${tools(`data-h-be-edit="${b.id}"`, `data-h-be-del="${b.id}"`, 'ce bloc')}</header>
                ${b.description ? `<p>${esc(b.description)}</p>` : ''}<p class="muted">${b.fields.map(f => typeInfo(f.type)[1] + ' ' + esc(f.label)).join(' · ')}</p><p><small>📌 ${esc(DISPLAY[b.display] || '')}</small></p>
                <div class="page-actions"><a class="button small secondary" href="api.php?action=export_custom_block_def&id=${b.id}" download>📤 Partager (fichier)</a></div></article>`).join('')}</div>` : empty('Aucun bloc pour l’instant : clique sur « + Nouveau bloc ».')}</section>`;
        const ws = A().$('#workspace');
        ws.querySelector('[data-h-be-new]').addEventListener('click', () => chooseTemplate(token));
        ws.querySelectorAll('[data-h-be-edit]').forEach(b => b.addEventListener('click', () => { const d = blocks.find(x => Number(x.id) === Number(b.dataset.hBeEdit)); editorDef = JSON.parse(JSON.stringify(d)); renderBlockEditor(++S().workspaceToken); }));
        ws.querySelectorAll('[data-h-be-del]').forEach(b => b.addEventListener('click', async () => {
            const d = blocks.find(x => Number(x.id) === Number(b.dataset.hBeDel));
            if (!confirm(`Supprimer le bloc « ${d.name} »${d.entry_count ? ` et ce qui a été rempli sur ${plural(d.entry_count, 'fiche', 'fiches')}` : ''} ?`)) return;
            await api('delete_custom_block_def', {}, {method: 'POST', body: {id: d.id}}); toast('Bloc supprimé.'); ext.maintenance.block_editor(++S().workspaceToken);
        }));
        ws.querySelector('[data-h-be-import]').addEventListener('change', async e => {
            const file = e.target.files[0]; if (!file) return;
            try { const r = await api('import_custom_block_def', {}, {method: 'POST', body: {json: await file.text()}}); toast(r.result.updated ? 'Bloc mis à jour.' : 'Bloc importé : il est prêt à être utilisé.'); ext.maintenance.block_editor(++S().workspaceToken); }
            catch (error) { toast(error.message, 'error'); }
        });
    };
    function chooseTemplate(token) {
        dialog({
            eyebrow: 'NOUVEAU BLOC', title: 'Par quoi commencer ?',
            body: `<div class="h-templates">${TEMPLATES.map((t, i) => `<button type="button" class="h-template" data-h-tpl="${i}"><span>${t.icon}</span><strong>${esc(t.name)}</strong><small>${esc(t.fields.map(f => f[1]).join(', '))}</small></button>`).join('')}</div>`,
            onOpen: d => d.querySelectorAll('[data-h-tpl]').forEach(b => b.addEventListener('click', () => {
                const t = TEMPLATES[Number(b.dataset.hTpl)];
                editorDef = {id: 0, name: t.name === 'Bloc vide' ? '' : t.name, icon: t.icon, description: t.description, repeatable: t.repeatable, display: 'flag', labels: 1, author: ls('lcnda-act-requester'), fields: t.fields.map(([type, label]) => newField(type, label))};
                d.close(); renderBlockEditor(++S().workspaceToken);
            })),
        });
    }
    const EMOJIS = {
        'Famille': '👪 👨‍👩‍👧‍👦 👨‍👩‍👧 👩‍👧 👨‍👦 👶 👧 👦 👩 👨 👵 👴 🧓 🤰 🤱 👰 🤵 💍 💒 💐 💌 💕 ❤️ 🫶 🤝 🎂 🎁 🎉 🍼 🧸 🪆 👼 ✝️ ⚰️ 🪦 🕯️ 🌹 🥀',
        'Maison et lieux': '🏡 🏠 🏘️ 🏚️ 🏰 🏯 ⛪ 🕌 🕍 🛕 🏛️ 🏫 🏥 🏭 🏪 🏨 🏢 🗼 🌉 🏞️ ⛰️ 🏔️ 🌋 🏖️ 🏝️ 🌾 🌲 🌳 🌻 🗺️ 🧭 📍 📌 🚩 🏳️ 🌍 🌎 🌏',
        'Métiers': '🧑‍🌾 🚜 🐄 🐑 🐴 🐓 🍇 🍷 🧑‍🍳 🍞 🥖 🧀 🧑‍🔧 🔨 🪚 ⚒️ 🛠️ ⛏️ 🧱 🪵 🧑‍🏭 ⚙️ 🧵 🪡 🧶 👗 👞 🧑‍⚕️ ⚕️ 💊 🩺 🧑‍🏫 🎓 📚 ✒️ 🧑‍⚖️ ⚖️ 🧑‍✈️ ⚓ 🚢 🎣 🧑‍🚒 👮 💂 🧑‍🎨 🎨 🎭 🎻 🎹 🎺 🥁 🎤 📷 🖋️ 💼 💰 🏦',
        'Guerre et mémoire': '🎖️ 🏅 🥇 🎗️ ⚔️ 🗡️ 🛡️ 🪖 🔫 💣 ✊ 🕊️ ✉️ 📯 🚂 🚃 ⛓️ 🔒 🗝️ 🇫🇷 🏴 🏳️ 🪦 🕯️ 📜 📃 📰 🗞️',
        'Documents': '📜 📃 📄 📑 📋 🗂️ 📁 📂 🗃️ 🗄️ 📒 📓 📔 📕 📗 📘 📙 📚 📖 🔖 🏷️ ✉️ 📨 📮 📝 ✏️ 🖊️ 🖋️ ✒️ 📎 🖇️ 📏 🔍 🔎 🧾 🪪 💳 📸 🖼️ 🎞️ 📹 🎥 🎙️ 📻 📺 💾 💿 📼',
        'Voyages': '🚢 ⛵ 🛶 ⚓ 🚂 🚃 🚋 🚌 🚗 🚲 🛵 ✈️ 🛩️ 🚀 🧳 🎒 🗺️ 🧭 🌐 🏝️ 🗽 🗼 🏔️ 🛤️ 🚉 🛂 🛃',
        'Loisirs et santé': '⚽ 🏉 🚴 🏊 🎣 🏹 ♟️ 🎲 🃏 🎯 🎪 🎠 🎡 📯 🎵 🎶 🎼 💃 🕺 🍾 🥂 🍽️ 🩺 💉 🩹 🧬 🦷 👓 🦯 ♿ 🏥',
        'Nature et animaux': '🌸 🌼 🌷 🌹 🍀 🍂 🍁 🌿 🌱 🌳 🌲 🌾 🍎 🍐 🍒 🥔 🌽 🐶 🐱 🐴 🐄 🐖 🐑 🐐 🐓 🦆 🐝 🦋 🐟 🐚 🦉 🐦 ☀️ 🌙 ⭐ ❄️ 🌧️ ⛈️ 🌈 🔥 💧',
        'Symboles': '🧩 ⭐ 🌟 ✨ 💡 🔔 📣 ❗ ❓ ✅ ☑️ ❌ ⚠️ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟤 ♥️ ♦️ ♣️ ♠️ ⚜️ 🔱 ☘️ ✡️ ☪️ ☮️ ☯️ ♾️ 🔗 🧬 🧪 🔬 🔭 ⌛ ⏳ ⏰ 📅 🗓️',
    };
    function emojiPanelHtml() {
        const groups = Object.entries(EMOJIS);
        return `<div class="h-emoji-panel" hidden><div class="h-emoji-tabs">${groups.map(([g], i) => `<button type="button" class="link-button ${i ? '' : 'is-active'}" data-emoji-tab="${esc(g)}">${esc(g)}</button>`).join('')}</div>
            ${groups.map(([g, list], i) => `<div class="h-emoji-grid" data-emoji-group="${esc(g)}" ${i ? 'hidden' : ''}>${list.split(' ').filter(Boolean).map(e => `<button type="button" data-be-icon="${e}" title="${e}">${e}</button>`).join('')}</div>`).join('')}</div>`;
    }
    function fieldRowHtml(f, i, all) {
        const [, icon, typeName] = typeInfo(f.type);
        const personFields = all.filter(x => x.type === 'person');
        let extra = '';
        if (f.type === 'select') extra = `<label class="span-2">Les choix <small>(un par ligne)</small><textarea rows="3" data-be="options">${esc(f.options.join('\n'))}</textarea></label>`;
        if (f.type === 'media') extra = `<label>Fichiers acceptés<select data-be="accept">${[['all', 'Photos, vidéos, sons, PDF'], ['image', 'Photos seulement'], ['video', 'Vidéos seulement'], ['audio', 'Sons seulement']].map(([k, l]) => `<option value="${k}" ${f.accept === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
        if (f.type === 'person_info') extra = `<p class="muted span-2">ℹ️ Rien à taper : l’info est reprise toute seule de la fiche, et se met à jour quand la fiche change.</p><label>Quelle info ?<select data-be="info">${INFOS.map(([k, l]) => `<option value="${k}" ${f.info === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>De quelle fiche ?<select data-be="from"><option value="self">La fiche où est le bloc</option>${personFields.map(p => `<option value="${esc(p.key)}" ${f.from === p.key ? 'selected' : ''}>La personne du champ « ${esc(p.label)} »</option>`).join('')}</select></label>`;
        const canRequire = ['text', 'longtext', 'date', 'select', 'person'].includes(f.type);
        return `<div class="h-be-field" data-be-i="${i}"><div class="h-be-field-head"><span class="h-be-type" title="${esc(typeName)}">${icon}</span><input data-be="label" value="${esc(f.label)}" placeholder="Nom du champ" aria-label="Nom du champ"><small class="muted">${esc(typeName)}</small>
            <span class="h-row-actions"><button type="button" class="icon-button" data-be-up title="Monter">↑</button><button type="button" class="icon-button" data-be-down title="Descendre">↓</button><button type="button" class="icon-button danger" data-be-del title="Retirer ce champ">🗑</button></span></div>
            <div class="form-grid">${extra}${['map', 'person_info'].includes(f.type) ? '' : `<label>Aide <small>(facultatif)</small><input data-be="help" value="${esc(f.help)}" placeholder="Exemple de ce qu’il faut écrire"></label>`}${canRequire ? `<label class="checkbox-line"><input type="checkbox" data-be="required" ${f.required ? 'checked' : ''}> Obligatoire</label>` : ''}</div></div>`;
    }
    function previewHtml(d) {
        const fake = {id: 0, data: {}, media: [], people: {}};
        return `<div class="card span-12 h-be-preview"><header class="card-head"><div class="card-title"><h3>${esc(d.icon || '🧩')} ${esc(d.name || 'Mon bloc')}</h3></div></header><div class="card-body">${d.description ? `<p class="muted">${esc(d.description)}</p>` : ''}<div class="form-grid">${d.fields.map(f => fieldInputHtml(f, '', fake, d.fields)).join('')}${d.fields.filter(f => f.type === 'media').map(f => `<label>${esc(f.label)}<input type="file" disabled></label>`).join('')}</div>${Number(d.labels) ? '<p><small>🏷️ Étiquettes</small></p>' : ''}</div></div>`;
    }
    function renderBlockEditor(token) {
        const d = editorDef;
        A().$('#workspace').innerHTML = `<section class="page collection-page h-be">${header('ÉDITEUR DE BLOCS', d.id ? 'Modifier « ' + d.name + ' »' : 'Nouveau bloc', 'Trois étapes : nomme le bloc, ajoute ses champs en cliquant sur les boutons, puis enregistre. L’aperçu à droite montre ce que tu verras sur une fiche.', '<button type="button" class="button secondary" data-be-cancel>← Retour</button>')}
            <div class="h-be-layout"><div>
            <section class="maintenance-panel"><h3>1. Le bloc</h3><div class="form-grid">
                <label>Nom<input data-bd="name" value="${esc(d.name)}" placeholder="Décorations, Maison de famille…" required></label>
                <div class="h-be-icon-field span-2"><span class="h-be-icon-title">Icône</span><span class="h-be-icons"><input data-bd="icon" value="${esc(d.icon)}" maxlength="16" class="h-be-icon" aria-label="Icône (n’importe quel émoji)"><button type="button" class="button small secondary" data-be-emoji-open>Choisir un émoji…</button></span>
                    <small class="muted">Ou colle n’importe quel émoji dans la case (sur Mac : Ctrl + ⌘ + Espace).</small>${emojiPanelHtml()}</div>
                <label class="span-2">Description <small>(facultatif)</small><input data-bd="description" value="${esc(d.description)}" placeholder="À quoi sert ce bloc ?"></label>
                <fieldset class="span-2 h-be-display"><legend>Où apparaît ce bloc ?</legend>${Object.entries(DISPLAY).map(([k, l]) => `<label class="checkbox-line"><input type="radio" name="be-display" value="${k}" ${d.display === k ? 'checked' : ''}> ${esc(l)}</label>`).join('')}<p class="muted">Avec le premier choix, une case « ${esc(d.icon || '🧩')} ${esc(d.name || 'Mon bloc')} » apparaît dans la fenêtre Identité, rubrique « Blocs à afficher sur la fiche », à côté de Départs, Poilu, Résistant…</p></fieldset>
                <label class="checkbox-line"><input type="checkbox" data-bd="repeatable" ${Number(d.repeatable) ? 'checked' : ''}> Plusieurs fois sur une même fiche (ex. plusieurs médailles)</label>
                <label class="checkbox-line"><input type="checkbox" data-bd="labels" ${Number(d.labels) ? 'checked' : ''}> Pouvoir y mettre des étiquettes</label>
                <label>Créé par <small>(apparaît quand tu le partages)</small><input data-bd="author" value="${esc(d.author || '')}"></label></div></section>
            <section class="maintenance-panel"><h3>2. Les champs</h3><p class="muted">Clique sur un bouton pour ajouter un champ :</p>
                <div class="h-be-palette">${FIELD_TYPES.map(([t, icon, label, help]) => `<button type="button" class="button small secondary" data-be-add="${t}" title="${esc(help)}">${icon} ${esc(label)}</button>`).join('')}</div>
                <div data-be-fields>${d.fields.map((f, i) => fieldRowHtml(f, i, d.fields)).join('') || '<p class="muted">Aucun champ.</p>'}</div></section>
            <div class="page-actions"><button type="button" class="button" data-be-save>3. Enregistrer le bloc</button><button type="button" class="button secondary" data-be-cancel>Annuler</button></div></div>
            <aside><h3>Aperçu</h3><div data-be-preview>${previewHtml(d)}</div></aside></div></section>`;
        const ws = A().$('#workspace');
        const preview = () => { ws.querySelector('[data-be-preview]').innerHTML = previewHtml(d); };
        const again = () => renderBlockEditor(token);
        ws.querySelectorAll('[data-be-cancel]').forEach(b => b.addEventListener('click', () => { editorDef = null; ext.maintenance.block_editor(++S().workspaceToken); }));
        ws.querySelectorAll('[data-bd]').forEach(el => el.addEventListener('input', () => { d[el.dataset.bd] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value; preview(); }));
        ws.querySelectorAll('[data-bd][type=checkbox]').forEach(el => el.addEventListener('change', () => { d[el.dataset.bd] = el.checked ? 1 : 0; preview(); }));
        ws.querySelectorAll('[name=be-display]').forEach(el => el.addEventListener('change', () => { d.display = el.value; }));
        const panel = ws.querySelector('.h-emoji-panel');
        ws.querySelector('[data-be-emoji-open]').addEventListener('click', () => { panel.hidden = !panel.hidden; });
        panel.addEventListener('click', e => {
            const tab = e.target.closest('[data-emoji-tab]');
            if (tab) { panel.querySelectorAll('[data-emoji-tab]').forEach(t => t.classList.toggle('is-active', t === tab)); panel.querySelectorAll('[data-emoji-group]').forEach(g => { g.hidden = g.dataset.emojiGroup !== tab.dataset.emojiTab; }); return; }
            const pick = e.target.closest('[data-be-icon]');
            if (pick) { d.icon = pick.dataset.beIcon; ws.querySelector('[data-bd=icon]').value = d.icon; panel.hidden = true; preview(); }
        });
        ws.querySelectorAll('[data-be-add]').forEach(b => b.addEventListener('click', () => { d.fields.push(newField(b.dataset.beAdd)); again(); setTimeout(() => { const rows = A().$$('.h-be-field'); rows[rows.length - 1]?.querySelector('[data-be=label]')?.select(); }, 0); }));
        const box = ws.querySelector('[data-be-fields]');
        box.addEventListener('input', e => {
            const row = e.target.closest('[data-be-i]'); if (!row) return;
            const f = d.fields[Number(row.dataset.beI)], k = e.target.dataset.be;
            if (k === 'options') f.options = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
            else if (k === 'required') f.required = e.target.checked;
            else if (k) f[k] = e.target.value;
            preview();
        });
        box.addEventListener('change', e => {
            const row = e.target.closest('[data-be-i]'); if (!row) return;
            const f = d.fields[Number(row.dataset.beI)], k = e.target.dataset.be;
            if (k === 'required') f.required = e.target.checked;
            else if (k && e.target.tagName === 'SELECT') {
                const auto = f.type === 'person_info' && (!f.label || f.label === INFO_DEFAULT || INFOS.some(i => i[1] === f.label));
                f[k] = e.target.value;
                if (k === 'info' && auto) { f.label = INFOS.find(i => i[0] === f.info)?.[1] || f.label; row.querySelector('[data-be=label]').value = f.label; }
            }
            preview();
        });
        box.addEventListener('click', e => {
            const row = e.target.closest('[data-be-i]'); if (!row) return;
            const i = Number(row.dataset.beI);
            if (e.target.closest('[data-be-del]')) { d.fields.splice(i, 1); again(); }
            if (e.target.closest('[data-be-up]') && i > 0) { [d.fields[i - 1], d.fields[i]] = [d.fields[i], d.fields[i - 1]]; again(); }
            if (e.target.closest('[data-be-down]') && i < d.fields.length - 1) { [d.fields[i + 1], d.fields[i]] = [d.fields[i], d.fields[i + 1]]; again(); }
        });
        ws.querySelector('[data-be-save]').addEventListener('click', async () => {
            if (!String(d.name).trim()) { toast('Donne un nom au bloc.', 'error'); ws.querySelector('[data-bd=name]').focus(); return; }
            try { await api('save_custom_block_def', {}, {method: 'POST', body: d}); toast(d.display === 'flag' ? 'Bloc enregistré : coche-le dans Identité → « Blocs à afficher sur la fiche ».' : 'Bloc enregistré.'); editorDef = null; ext.maintenance.block_editor(++S().workspaceToken); }
            catch (error) { toast(error.message, 'error'); }
        });
    }

    /* ═══════════════════════ 👶 ÂGES ET ÉCARTS (Maintenance) ═══════════════════════ */

    const LEVEL = {high: ['🔴', 'Très improbable'], mid: ['🟠', 'À vérifier'], low: ['🟡', 'Curieux']};
    ext.maintenance.ages = async token => {
        const data = await api('age_checks');
        if (!isCurrent(token)) return;
        const level = S().hAgeLevel || 'all';
        const alerts = (data.alerts || []).filter(a => level === 'all' || a.level === level);
        A().$('#workspace').innerHTML = `<section class="page collection-page">${header('MAINTENANCE', 'Âges et écarts', 'Âge au mariage, âge des parents, écart entre les naissances : ce qui est impossible ou très rare signale souvent une erreur (homonyme, mauvaise date, mauvais parents).')}
            <div class="collection-toolbar"><label>Afficher <select data-h-age-level><option value="all">toutes les alertes (${(data.alerts || []).length})</option>${Object.entries(LEVEL).map(([k, [i, l]]) => `<option value="${k}" ${level === k ? 'selected' : ''}>${i} ${l} (${(data.alerts || []).filter(a => a.level === k).length})</option>`).join('')}</select></label></div>
            ${alerts.length ? `<table class="data-table"><thead><tr><th></th><th>Personne</th><th>Alerte</th><th>Détail</th><th>Autre fiche</th></tr></thead><tbody>${alerts.map(a => `<tr><td title="${esc(LEVEL[a.level][1])}">${LEVEL[a.level][0]}</td><td>${pLink(a.person)}</td><td><strong>${esc(a.text)}</strong></td><td><small>${esc(a.detail)}</small></td><td>${pLink(a.other)}</td></tr>`).join('')}</tbody></table>` : empty('Aucune alerte : les âges et les écarts sont vraisemblables.')}
            <section class="maintenance-panel"><h3>Moyennes de la famille</h3><p class="muted">Repères en France : au XVIIIe siècle, les femmes se marient vers 25-26 ans et les hommes vers 27-28 ans ; un enfant naît en moyenne tous les 2 ans à 2 ans et demi (24 à 30 mois).</p>
            ${(data.periods || []).length ? `<table class="data-table"><thead><tr><th>Période (mariage ou naissance)</th><th>Âge au mariage des hommes</th><th>des femmes</th><th>Mariages</th><th>Écart entre naissances</th></tr></thead><tbody>${data.periods.map(r => `<tr><td>${esc(r.period)}</td><td>${r.men !== null ? fmt(r.men, 1) + ' ans' : '—'}</td><td>${r.women !== null ? fmt(r.women, 1) + ' ans' : '—'}</td><td>${r.n}</td><td>${r.spacing !== null ? fmt(r.spacing, 1) + ' mois' : '—'} <small class="muted">${r.spacing_n ? '(' + r.spacing_n + ')' : ''}</small></td></tr>`).join('')}</tbody></table>` : empty('Pas assez de dates.')}</section></section>`;
        A().bindTableLinks();
        A().$('[data-h-age-level]').addEventListener('change', e => { S().hAgeLevel = e.target.value; ext.maintenance.ages(++S().workspaceToken); });
    };

    /* ═══════════════════════ 🧹 HARMONISER LES VARIANTES ═══════════════════════ */

    const HARM_FIELDS = [['occupation', 'Métiers'], ['last_name', 'Noms de famille'], ['first_name', 'Prénoms'], ['place', 'Lieux']];
    ext.maintenance.harmonize = async token => {
        const field = S().hHarmField || 'occupation';
        const data = await api('variant_groups', {field});
        if (!isCurrent(token)) return;
        const groups = data.groups || [];
        A().$('#workspace').innerHTML = `<section class="page collection-page">${header('MAINTENANCE', 'Harmoniser les variantes', 'Une base propre : « Laboureur », « laboureur », « labour. » et « Labourreur » deviennent une seule écriture. Rien n’est changé sans ton accord : choisis l’écriture à garder, décoche ce qui ne doit pas bouger, puis confirme.')}
            <div class="h-tabs">${HARM_FIELDS.map(([k, l]) => `<button type="button" class="button small ${k === field ? '' : 'secondary'}" data-h-harm-field="${k}">${esc(l)}</button>`).join('')}</div>
            ${groups.length ? `<p>${plural(groups.length, 'groupe de variantes trouvé', 'groupes de variantes trouvés')}.</p><div class="h-records">${groups.map((g, gi) => `<article class="h-record h-harm" data-h-harm="${gi}"><div class="h-harm-variants">${g.variants.map(v => `<label class="checkbox-line"><input type="checkbox" data-h-harm-v value="${esc(v.value)}" checked> <span class="h-harm-value">${esc(v.value)}</span> <small>(${v.count})</small> <button type="button" class="link-button" data-h-harm-pick="${esc(v.value)}" title="Garder cette écriture">← garder</button></label>`).join('')}</div>
                <div class="h-harm-target"><label>Écrire partout<input data-h-harm-target value="${esc(g.proposal)}"></label><button type="button" class="button small" data-h-harm-apply>Harmoniser</button></div></article>`).join('')}</div>` : empty('Aucune variante trouvée pour ce champ.')}</section>`;
        const ws = A().$('#workspace');
        ws.querySelectorAll('[data-h-harm-field]').forEach(b => b.addEventListener('click', () => { S().hHarmField = b.dataset.hHarmField; ext.maintenance.harmonize(++S().workspaceToken); }));
        ws.querySelectorAll('[data-h-harm]').forEach(box => {
            const g = groups[Number(box.dataset.hHarm)];
            box.querySelectorAll('[data-h-harm-pick]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); box.querySelector('[data-h-harm-target]').value = b.dataset.hHarmPick; }));
            box.querySelector('[data-h-harm-apply]').addEventListener('click', async () => {
                const target = box.querySelector('[data-h-harm-target]').value.trim();
                const values = [...box.querySelectorAll('[data-h-harm-v]:checked')].map(i => i.value).filter(v => v !== target);
                if (!target || !values.length) return toast('Rien à changer.', 'error');
                const n = g.variants.filter(v => values.includes(v.value)).reduce((s, v) => s + v.count, 0);
                if (!confirm(`Remplacer ${values.map(v => `« ${v} »`).join(', ')} par « ${target} » ?\n\n${plural(n, 'élément sera modifié', 'éléments seront modifiés')}. (Annulable depuis l’historique des modifications.)`)) return;
                try { const r = await api('apply_variants', {}, {method: 'POST', body: {field, target, values}}); toast(`${plural(r.result.changed, 'modification', 'modifications')}.`); ext.maintenance.harmonize(++S().workspaceToken); }
                catch (error) { toast(error.message, 'error'); }
            });
        });
    };

    /* ═══════════════════════ 📍 LIEUX MAL PLACÉS ═══════════════════════ */

    ext.maintenance.misplaced = async token => {
        const data = await api('suspicious_places');
        if (!isCurrent(token)) return;
        const alerts = data.alerts || [];
        const pts = alerts.map(a => ({lat: Number(a.place.lat), lon: Number(a.place.lon), label: a.place.name, color: '#b5523b'}));
        if (data.center) pts.push({lat: data.center[0], lon: data.center[1], label: 'Centre de la famille', color: '#2e7d32'});
        A().$('#workspace').innerHTML = `<section class="page collection-page">${header('MAINTENANCE', 'Lieux mal placés', 'Coordonnées improbables : point en plein océan, hors du pays indiqué, latitude et longitude inversées, ou homonyme (un « Saint-Martin » d’un autre département bien plus près du reste de la famille).')}
            ${alerts.length ? `${ext.miniMap && pts.length ? `<section class="maintenance-panel">${ext.miniMap(pts, [], {height: 340})}<p class="muted">🟢 centre de la famille · 🔴 lieux suspects</p></section>` : ''}
            <table class="data-table"><thead><tr><th>Lieu</th><th>Coordonnées</th><th>Pourquoi</th><th>Événements</th><th></th></tr></thead><tbody>${alerts.map((a, i) => `<tr><td><strong>${esc(a.place.name)}</strong><br><small>${esc([a.place.county, a.place.state, a.place.country].filter(Boolean).join(', '))}</small></td>
                <td><small>${fmt(a.place.lat, 4)}, ${fmt(a.place.lon, 4)}<br>à ${fmt(a.distance)} km de la famille</small></td><td><ul>${a.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul></td><td>${a.place.n}</td>
                <td>${a.suggest ? `<button type="button" class="button small" data-h-mp-fix="${i}">${esc(a.suggest.why)}</button><br>` : ''}<button type="button" class="link-button" data-h-mp-ignore="${a.place.id}">C’est juste, ne plus signaler</button></td></tr>`).join('')}</tbody></table>` : empty('Aucun lieu suspect : tous les points sont vraisemblables.')}</section>`;
        const ws = A().$('#workspace');
        ws.querySelectorAll('[data-h-mp-fix]').forEach(b => b.addEventListener('click', async () => {
            const a = alerts[Number(b.dataset.hMpFix)];
            if (!confirm(`${a.suggest.why} pour « ${a.place.name} » ?`)) return;
            try { await api('fix_place', {}, {method: 'POST', body: {id: a.place.id, lat: a.suggest.lat, lon: a.suggest.lon, insee: a.suggest.insee || ''}}); toast('Lieu corrigé.'); ext.maintenance.misplaced(++S().workspaceToken); } catch (error) { toast(error.message, 'error'); }
        }));
        ws.querySelectorAll('[data-h-mp-ignore]').forEach(b => b.addEventListener('click', async () => { await api('fix_place', {}, {method: 'POST', body: {id: b.dataset.hMpIgnore, ignore: 1}}); ext.maintenance.misplaced(++S().workspaceToken); }));
    };

    /* ═══════════════════════ 🔐 COPIE CHEZ UN COUSIN ═══════════════════════ */

    async function postForm(action, fd) {
        fd.append('csrf', S().csrf);
        const r = await fetch('api.php?action=' + action, {method: 'POST', body: fd, headers: {'X-CSRF-Token': S().csrf}});
        const j = await r.json().catch(() => ({error: 'Réponse illisible du serveur'}));
        if (!r.ok || j.error) throw new Error(j.error || 'Erreur');
        return j;
    }
    ext.maintenance.cousin_vault = async token => {
        const s = await api('vault_status');
        if (!isCurrent(token)) return;
        const last = s.last_sent_days;
        A().$('#workspace').innerHTML = `<section class="page collection-page">${header('MAINTENANCE', 'Copie chez un cousin', 'Une copie de secours chez quelqu’un de confiance, chiffrée : ton cousin la garde dans son coffre sans pouvoir la lire. Si ton ordinateur meurt, il te la rend et tu la rouvres avec ton mot de passe. Et tu peux garder la sienne en échange.')}
            <div class="h-columns">
            <section class="maintenance-panel"><h3>📤 Confier ma copie</h3>${last === null ? '<p>Tu n’as encore confié aucune copie.</p>' : `<p class="${last > 90 ? 'h-offsite-sentence is-warn' : ''}">Dernière copie confiée il y a ${plural(last, 'jour', 'jours')}${last > 90 ? ' : pense à en envoyer une nouvelle.' : '.'}</p>`}
                <form id="h-vault-export" autocomplete="off"><div class="form-grid"><label>Ton nom (pour qu’il sache à qui elle est)<input name="owner" value="${esc(ls('lcnda-vault-owner', ls('lcnda-act-requester')))}" required></label><label>Pour (cousin)<input name="cousin" placeholder="Marie, cousin Paul…"></label>
                <label>Mot de passe (8 caractères au moins)<input type="password" name="password" minlength="8" required autocomplete="new-password"></label><label>Le retaper<input type="password" name="password2" minlength="8" required autocomplete="new-password"></label></div>
                <p class="muted">⚠️ Le mot de passe n’est enregistré nulle part : <strong>sans lui, la copie est illisible, même pour toi</strong>. Note-le sur papier. La copie contient la base (fiches, notes, sources), sans les photos.</p>
                <div class="page-actions"><button class="button" type="submit">Créer la copie chiffrée</button><span class="muted" data-h-vault-status></span></div></form>
                <p class="muted">Puis envoie le fichier « .lcnda-coffre » à ton cousin (clé USB, WeTransfer, courriel…). Il le range dans son LCNDA : Maintenance → Copie chez un cousin → « Ranger la copie d’un cousin ».</p>
                ${s.sent.length ? `<details><summary>Copies déjà confiées (${s.sent.length})</summary><ul>${s.sent.map(x => `<li>${esc(dateTimeFr(x.sent_at))}${x.cousin ? ' — ' + esc(x.cousin) : ''} <small>(${sizeText(x.size)})</small></li>`).join('')}</ul></details>` : ''}
                <h3>📥 Récupérer ma copie</h3><p class="muted">Ton cousin t’a rendu ton fichier : il est déchiffré et rangé dans tes sauvegardes (Maintenance → Sauvegarde), d’où tu peux le rouvrir.</p>
                <form id="h-vault-open" autocomplete="off" class="form-grid"><label>Mon fichier « .lcnda-coffre »<input type="file" name="file" accept=".lcnda-coffre" required></label><label>Mon mot de passe<input type="password" name="password" required autocomplete="off"></label><div class="page-actions span-2"><button class="button secondary" type="submit">Déchiffrer</button></div></form></section>
            <section class="maintenance-panel"><h3>🗄️ Les copies que je garde pour mes cousins</h3><p class="muted">Elles restent chiffrées : tu ne peux pas les lire, seulement les rendre. On garde les 3 dernières de chaque cousin.</p>
                <form id="h-vault-store" class="page-actions"><input type="file" name="file" accept=".lcnda-coffre" required><button class="button small" type="submit">Ranger la copie d’un cousin</button></form>
                ${s.held.length ? `<table class="data-table"><thead><tr><th>De</th><th>Copie du</th><th>Reçue le</th><th>Taille</th><th></th></tr></thead><tbody>${s.held.map(h => { const age = h.copy_created_at ? Math.floor((Date.now() - new Date(h.copy_created_at)) / 864e5) : null; return `<tr><td><strong>${esc(h.owner)}</strong></td><td>${esc(dateTimeFr(h.copy_created_at))}${age > 180 ? `<br><small class="h-offsite-sentence is-warn">ancienne (${plural(age, 'jour', 'jours')}) : demande-lui une copie récente</small>` : ''}</td><td>${esc(dateTimeFr(h.received_at))}</td><td>${sizeText(h.size)}</td><td><a class="button small secondary" href="api.php?action=vault_download&id=${h.id}" download>Lui rendre (télécharger)</a> <button type="button" class="icon-button danger" data-h-vault-del="${h.id}" title="Supprimer">🗑</button></td></tr>`; }).join('')}</tbody></table>` : empty('Aucune copie gardée pour l’instant.')}</section></div></section>`;
        const ws = A().$('#workspace');
        const rerender = () => ext.maintenance.cousin_vault(++S().workspaceToken);
        ws.querySelector('#h-vault-export').addEventListener('submit', async e => {
            e.preventDefault();
            const f = e.currentTarget, status = f.querySelector('[data-h-vault-status]');
            if (f.password.value !== f.password2.value) return toast('Les deux mots de passe ne sont pas identiques.', 'error');
            lsSet('lcnda-vault-owner', f.owner.value);
            status.textContent = 'Chiffrement… (quelques secondes)';
            try {
                const r = await fetch('api.php?action=vault_export', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': S().csrf}, body: JSON.stringify({owner: f.owner.value, cousin: f.cousin.value, password: f.password.value, csrf: S().csrf})});
                if (!r.ok || (r.headers.get('Content-Type') || '').includes('json')) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Copie impossible'); }
                const blob = await r.blob();
                const name = (r.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'copie-chiffree.lcnda-coffre';
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
                toast('Copie chiffrée créée : envoie-la à ton cousin.'); rerender();
            } catch (error) { status.textContent = ''; toast(error.message, 'error'); }
        });
        ws.querySelector('#h-vault-store').addEventListener('submit', async e => {
            e.preventDefault();
            try { const j = await postForm('vault_store', new FormData(e.currentTarget)); toast(`Copie de ${j.owner} rangée dans le coffre.`); rerender(); } catch (error) { toast(error.message, 'error'); }
        });
        ws.querySelector('#h-vault-open').addEventListener('submit', async e => {
            e.preventDefault();
            try { const j = await postForm('vault_open', new FormData(e.currentTarget)); alert(`Copie déchiffrée (${plural(j.persons, 'fiche', 'fiches')}, du ${dateTimeFr(j.created_at)}).\n\nElle est rangée dans tes sauvegardes sous le nom :\n${j.file}\n\nPour la rouvrir : Maintenance → Sauvegarde.`); }
            catch (error) { toast(error.message, 'error'); }
        });
        ws.querySelectorAll('[data-h-vault-del]').forEach(b => b.addEventListener('click', async () => { if (!confirm('Supprimer cette copie du coffre ? Ton cousin ne pourra plus te la demander.')) return; await api('vault_delete', {}, {method: 'POST', body: {id: b.dataset.hVaultDel}}); rerender(); }));
    };
    // Rappel au démarrage : seulement si une copie a déjà été confiée et qu'elle a plus de 3 mois
    setTimeout(async () => {
        try {
            if (sessionStorage.getItem('lcnda-vault-reminded') || !A()?.state?.csrf) return;
            sessionStorage.setItem('lcnda-vault-reminded', '1');
            const s = await api('vault_status');
            if (s.sent.length && s.last_sent_days > 90) toast(`Ta dernière copie confiée à un cousin date de ${s.last_sent_days} jours : pense à lui en envoyer une nouvelle (Maintenance → Copie chez un cousin).`);
        } catch (_) {}
    }, 9000);

    /* ═══════════════════════ 📏 TAILLE DES ANCÊTRES ═══════════════════════ */

    // Taille moyenne en France selon l'année de naissance (conscrits pour les hommes ; enquêtes de santé pour les femmes)
    const FR_MEN = [[1780, 1.63], [1800, 1.63], [1820, 1.64], [1850, 1.65], [1870, 1.65], [1890, 1.66], [1910, 1.67], [1930, 1.69], [1950, 1.72], [1970, 1.75], [1990, 1.76], [2000, 1.77]];
    const FR_WOMEN = [[1780, 1.52], [1800, 1.53], [1850, 1.54], [1870, 1.55], [1900, 1.57], [1930, 1.59], [1950, 1.61], [1970, 1.63], [1990, 1.64], [2000, 1.65]];
    const refAt = (table, year) => { if (year <= table[0][0]) return table[0][1]; for (let i = 1; i < table.length; i++) if (year <= table[i][0]) { const [y0, v0] = table[i - 1], [y1, v1] = table[i]; return v0 + (v1 - v0) * (year - y0) / (y1 - y0); } return table[table.length - 1][1]; };
    ext.graphStats.heights = async token => {
        const data = await api('heights_data');
        if (token !== S().workspaceToken || S().module !== 'graphiques') return;
        const people = (data.people || []).filter(p => p.birth_year);
        const noYear = (data.people || []).filter(p => !p.birth_year);
        const W = 1000, H = 380, pad = 50;
        const years = people.map(p => p.birth_year);
        const minY = Math.min(1780, ...years), maxY = Math.max(2000, ...years);
        const x = y => pad + (y - minY) / (maxY - minY) * (W - pad * 2), yv = h => H - pad - (h - 1.40) / (2.0 - 1.40) * (H - pad * 2);
        const line = (t, color) => `<polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-dasharray="6 4" points="${t.map(([a, b]) => `${x(a)},${yv(b)}`).join(' ')}"/>`;
        const grid = [1.5, 1.6, 1.7, 1.8, 1.9].map(h => `<line x1="${pad}" x2="${W - pad}" y1="${yv(h)}" y2="${yv(h)}" stroke="currentColor" opacity=".12"/><text x="${pad - 6}" y="${yv(h) + 4}" font-size="13" text-anchor="end" fill="currentColor">${String(h).replace('.', ',')} m</text>`).join('');
        const ticks = []; for (let y = Math.ceil(minY / 25) * 25; y <= maxY; y += 25) ticks.push(`<text x="${x(y)}" y="${H - pad + 20}" font-size="13" text-anchor="middle" fill="currentColor">${y}</text>`);
        const dots = people.map(p => `<circle cx="${x(p.birth_year)}" cy="${yv(Math.min(2, Math.max(1.4, p.height)))}" r="6" fill="${p.gender === 'female' ? '#b5523b' : '#2b5d8a'}" stroke="#fff"><title>${esc(p.name)} — ${String(p.height).replace('.', ',')} m (né${p.gender === 'female' ? 'e' : ''} en ${p.birth_year})</title></circle>`).join('');
        const gens = {};
        people.forEach(p => { const k = Math.floor(p.birth_year / 25) * 25, g = p.gender === 'female' ? 'f' : 'm'; (gens[k] ||= {m: [], f: []})[g].push(p.height); });
        const avg = l => l.length ? l.reduce((a, b) => a + b, 0) / l.length : null;
        const cm = v => v === null ? '—' : fmt(v * 100) + ' cm';
        const diff = (v, ref) => v === null ? '' : ` <small class="${v >= ref ? 'is-up' : 'is-down'}">(${v >= ref ? '+' : ''}${fmt((v - ref) * 100)} cm)</small>`;
        A().$('#workspace').innerHTML = `<section class="page"><header class="page-header"><div><span class="eyebrow">STATISTIQUES</span><h2>La taille de tes ancêtres</h2><p>Relevée dans les registres matricules, les fiches signalétiques, les passeports (champ « Taille » de la fiche, ou bloc Militaire). Comparée à la moyenne française de leur génération : environ 1,65 m pour un homme né vers 1870, 1,75 m aujourd’hui.</p></div></header>
            ${people.length ? `<section class="maintenance-panel"><svg class="h-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Taille selon l’année de naissance">${grid}${ticks.join('')}${line(FR_MEN, '#2b5d8a')}${line(FR_WOMEN, '#b5523b')}${dots}</svg>
                <p class="h-legend"><span><i style="background:#2b5d8a"></i>Hommes de la famille · - - moyenne française</span><span><i style="background:#b5523b"></i>Femmes de la famille · - - moyenne française</span></p></section>
            <table class="data-table"><thead><tr><th>Génération (nés en)</th><th>Hommes de la famille</th><th>Moyenne France</th><th>Femmes de la famille</th><th>Moyenne France</th></tr></thead><tbody>${Object.entries(gens).sort((a, b) => a[0] - b[0]).map(([k, g]) => { const mid = Number(k) + 12, m = avg(g.m), f = avg(g.f); return `<tr><td>${k}–${Number(k) + 24}</td><td>${cm(m)}${diff(m, refAt(FR_MEN, mid))} <small class="muted">${g.m.length ? '(' + g.m.length + ')' : ''}</small></td><td>${cm(refAt(FR_MEN, mid))}</td><td>${cm(f)}${diff(f, refAt(FR_WOMEN, mid))} <small class="muted">${g.f.length ? '(' + g.f.length + ')' : ''}</small></td><td>${cm(refAt(FR_WOMEN, mid))}</td></tr>`; }).join('')}</tbody></table>
            <details><summary>Les ${people.length} mesures</summary><table class="data-table"><tbody>${people.sort((a, b) => a.birth_year - b.birth_year).map(p => `<tr><td>${personLink(p.id, p.name)}</td><td>${p.birth_year}</td><td>${String(p.height).replace('.', ',')} m</td><td>${diff(p.height, refAt(p.gender === 'female' ? FR_WOMEN : FR_MEN, p.birth_year))}</td></tr>`).join('')}</tbody></table></details>` : empty('Aucune taille relevée : remplis le champ « Taille » des fiches (Identité), par exemple « 1 m 65 » d’après le registre matricule.')}
            ${noYear.length ? `<p class="muted">${plural(noYear.length, 'taille sans année de naissance', 'tailles sans année de naissance')} : ${noYear.map(p => personLink(p.id, p.name)).join(', ')}.</p>` : ''}</section>`;
        A().bindTableLinks();
    };

    /* ═══════════════════════ ⚖️ COMPARER DEUX FICHES AVANT FUSION ═══════════════════════ */

    ext.afterDuplicates.push(() => {
        A().$$('.issue-list article').forEach(article => {
            const m = article.querySelector('[data-merge-target]');
            if (!m || article.querySelector('[data-h-compare]')) return;
            const a = m.dataset.mergeTarget, b = m.dataset.mergeSource;
            article.querySelector('.page-actions').insertAdjacentHTML('afterbegin', `<button type="button" class="button small" data-h-compare="${a}" data-h-compare-b="${b}">⚖️ Comparer</button>`);
        });
        A().$$('[data-h-compare]').forEach(btn => btn.addEventListener('click', () => openCompare(Number(btn.dataset.hCompare), Number(btn.dataset.hCompareB))));
    });
    async function openCompare(a, b) {
        let data;
        try { data = await api('compare_people', {a, b}); } catch (error) { return toast(error.message, 'error'); }
        const A1 = data.a, B1 = data.b;
        const evText = p => p.events.map(e => `${e.label}${e.date_text || e.year ? ' ' + (e.date_text || e.year) : ''}${e.place ? ' à ' + e.place : ''}`);
        const norm = v => String(Array.isArray(v) ? v.join(' | ') : v ?? '').trim().toLowerCase();
        const gender = g => ({male: 'Homme', female: 'Femme'}[g] || 'Inconnu');
        const rows = [['Prénom', A1.person.first_name, B1.person.first_name], ['Nom', A1.person.last_name, B1.person.last_name], ['Sexe', gender(A1.person.gender), gender(B1.person.gender)],
            ['Naissance', A1.person.birth_year, B1.person.birth_year], ['Décès', A1.person.death_year, B1.person.death_year], ['Métier', A1.person.occupation, B1.person.occupation],
            ['Parents', A1.parents, B1.parents], ['Conjoints', A1.spouses, B1.spouses], ['Enfants', A1.children, B1.children], ['Événements', evText(A1), evText(B1)],
            ['Sources', A1.sources, B1.sources], ['Médias', A1.media, B1.media], ['Notes', A1.notes, B1.notes]];
        const cell = v => Array.isArray(v) ? (v.length ? `<ul>${v.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<span class="muted">—</span>') : (v === null || v === undefined || v === '' ? '<span class="muted">—</span>' : esc(v));
        const same = rows.filter(r => norm(r[1]) === norm(r[2]) && norm(r[1]) !== '').length;
        const diffs = rows.filter(r => norm(r[1]) !== norm(r[2]) && norm(r[1]) !== '' && norm(r[2]) !== '').length;
        dialog({
            eyebrow: 'FUSION DE DOUBLONS', title: 'Comparer les deux fiches', wide: true,
            body: `<p>${plural(same, 'point commun', 'points communs')} · <strong>${plural(diffs, 'différence', 'différences')}</strong> (en orange) · en gris : renseigné d’un seul côté (sera gardé à la fusion).</p>
                <table class="data-table h-compare"><thead><tr><th></th><th>A — ${personLink(A1.person.id, pname(A1.person))} <small>#${A1.person.id}</small></th><th>B — ${personLink(B1.person.id, pname(B1.person))} <small>#${B1.person.id}</small></th></tr></thead>
                <tbody>${rows.map(r => { const na = norm(r[1]), nb = norm(r[2]); const cls = na === nb ? (na ? 'is-same' : '') : (na && nb ? 'is-diff' : 'is-one'); return `<tr class="${cls}"><th>${esc(r[0])}</th><td>${cell(r[1])}</td><td>${cell(r[2])}</td></tr>`; }).join('')}</tbody></table>
                <p class="muted">La fusion déplace événements, médias, sources, notes, relations… vers la fiche gardée, puis supprime l’autre.</p>
                <div class="page-actions"><button type="button" class="button" data-h-merge="${a}" data-h-merge-src="${b}">Garder A (fusionner B dans A)</button><button type="button" class="button" data-h-merge="${b}" data-h-merge-src="${a}">Garder B (fusionner A dans B)</button></div>`,
            onOpen: d => d.querySelectorAll('[data-h-merge]').forEach(btn => btn.addEventListener('click', async () => {
                if (!confirm(`Fusionner la fiche #${btn.dataset.hMergeSrc} dans la fiche #${btn.dataset.hMerge} ?\n\nLa fiche #${btn.dataset.hMergeSrc} sera supprimée après déplacement de ses données.`)) return;
                try { await api('merge_people', {}, {method: 'POST', body: {target_id: btn.dataset.hMerge, source_id: btn.dataset.hMergeSrc}}); toast('Fusion effectuée.'); d.close(); A().renderMaintenance(); }
                catch (error) { toast(error.message, 'error'); }
            })),
        });
    }
    /* ═══════════════════════ 🏘️ FICHE D'UN VILLAGE (Listes) ═══════════════════════ */

    const VILLAGE_MAPS = [['cassini', 'Cassini (XVIIIe)'], ['cassini_royal', 'Cassini, exemplaire du roi'], ['etatmajor', 'État-major (1820-1866)'], ['osmfr', 'Aujourd’hui']];
    /** Petite carte en tuiles (Cassini par défaut), centrée sur la commune. */
    function villageMapHtml(v, bg, zoom) {
        if (v.lat === null || v.lon === null) return empty('La commune n’a pas de coordonnées : place-la sur la carte depuis Listes → Lieux.');
        const W = 760, H = 420, z = zoom;
        const px = A().lngToX(v.lon, z), py = A().latToY(v.lat, z);
        const x0 = Math.floor((px - W / 2) / 256), x1 = Math.floor((px + W / 2) / 256), y0 = Math.floor((py - H / 2) / 256), y1 = Math.floor((py + H / 2) / 256);
        const tiles = [];
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.push(`<img alt="" loading="lazy" src="${esc(A().mapTileUrl(bg, z, x, y))}" style="left:${x * 256 - px + W / 2}px;top:${y * 256 - py + H / 2}px">`);
        return `<div class="h-village-map" style="width:${W}px;height:${H}px">${tiles.join('')}<span class="h-village-pin" title="${esc(v.name)}">📍</span></div>`;
    }
    function populationChart(points) {
        if (points.length < 2) return '';
        const W = 760, H = 220, pad = 44;
        const ys = points.map(p => p[0]), ns = points.map(p => p[1]);
        const minY = Math.min(...ys), maxY = Math.max(...ys), top = Math.max(...ns) * 1.1;
        const x = y => pad + (y - minY) / Math.max(1, maxY - minY) * (W - pad * 2), yv = n => H - pad - n / top * (H - pad - 16);
        const line = points.map(p => `${x(p[0])},${yv(p[1])}`).join(' ');
        return `<svg class="h-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Population au fil des recensements"><line x1="${pad}" x2="${W - pad}" y1="${H - pad}" y2="${H - pad}" stroke="currentColor" opacity=".3"/>
            <polyline fill="none" stroke="#2b5d8a" stroke-width="2.5" points="${line}"/>${points.map(p => `<circle cx="${x(p[0])}" cy="${yv(p[1])}" r="4" fill="#2b5d8a"><title>${p[0]} : ${fmt(p[1])} habitants</title></circle>`).join('')}
            ${(() => { // étiquettes espacées d'au moins 70 px (le dernier recensement toujours affiché)
                const shown = []; let last = -1e9;
                points.forEach((p, i) => { const px = x(p[0]); if (px - last >= 70 || i === points.length - 1) { if (i === points.length - 1 && shown.length && px - last < 70) shown.pop(); shown.push(p); last = px; } });
                return shown.map(p => `<text x="${x(p[0])}" y="${H - pad + 18}" font-size="13" text-anchor="middle" fill="currentColor">${p[0]}</text><text x="${x(p[0])}" y="${yv(p[1]) - 9}" font-size="12" text-anchor="middle" fill="currentColor">${fmt(p[1])}</text>`).join('');
            })()}</svg>`;
    }
    ext.lists.villages = async token => {
        const st = S();
        if (st.hVillage) return renderVillage(token, st.hVillage);
        const data = await api('villages', {q: st.hVillageQ || ''});
        if (!isCurrent(token, 'listes')) return;
        const rows = data.villages || [];
        A().$('#workspace').innerHTML = `<section class="page collection-page">${header('LISTES', 'Fiche d’un village', 'Pour chaque commune où la famille a vécu : les familles, les métiers, l’église et la paroisse, la population au fil des recensements, et la carte de Cassini.')}
            <div class="collection-toolbar"><input type="search" id="h-village-q" value="${esc(st.hVillageQ || '')}" placeholder="Chercher une commune…"></div>
            ${rows.length ? `<table class="data-table"><thead><tr><th>Commune</th><th>Département</th><th>Personnes de la famille</th><th>Événements</th><th>Période</th></tr></thead><tbody>${rows.map(v => `<tr><td><button type="button" class="table-link" data-h-village="${esc(v.key)}"><strong>${esc(v.name)}</strong></button>${v.places > 1 ? ` <small class="muted">(${v.places} lieux)</small>` : ''}</td><td>${esc([v.county, v.country !== 'France' ? v.country : ''].filter(Boolean).join(', '))}</td><td>${v.persons}</td><td>${v.events}</td><td>${v.from ? esc(v.from + (v.to && v.to !== v.from ? '–' + v.to : '')) : '—'}</td></tr>`).join('')}</tbody></table>` : empty('Aucune commune : les lieux des événements et des recensements apparaissent ici.')}</section>`;
        const ws = A().$('#workspace');
        ws.querySelector('#h-village-q').addEventListener('input', debounceVillage(e => { st.hVillageQ = e.target.value.trim(); ext.lists.villages(++st.workspaceToken).then(() => { const i = A().$('#h-village-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }));
        ws.querySelectorAll('[data-h-village]').forEach(b => b.addEventListener('click', () => { st.hVillage = b.dataset.hVillage; ext.lists.villages(++st.workspaceToken); }));
    };
    let villageTimer = 0;
    const debounceVillage = fn => e => { clearTimeout(villageTimer); villageTimer = setTimeout(() => fn(e), 300); };
    /** Barres par décennie (toutes les décennies de la commune, même vides), pour tous les actes ou une seule sorte. */
    function decadesHtml(v, type) {
        const all = Object.keys(v.decades).map(Number);
        const data = type ? ((v.decades_by_type || []).find(t => t.label === type)?.decades || {}) : v.decades;
        const top = Math.max(1, ...Object.values(data));
        const bars = [];
        for (let d = Math.min(...all); d <= Math.max(...all); d += 10) {
            const n = Number(data[d] || 0);
            bars.push(`<span title="${d}–${d + 9} : ${n} acte${n > 1 ? 's' : ''}">${n ? `<b>${n}</b>` : ''}<i style="height:${n ? Math.round(n / top * 110) + 3 : 0}px"></i><small>${d}</small></span>`);
        }
        return `<div class="h-decades">${bars.join('')}</div>`;
    }
    async function renderVillage(token, key) {
        const st = S();
        let v;
        try { v = await api('village', {key}); } catch (error) { st.hVillage = ''; toast(error.message, 'error'); return ext.lists.villages(++st.workspaceToken); }
        if (!isCurrent(token, 'listes')) return;
        const bg = st.hVillageMap || 'cassini', zoom = Number(st.hVillageZoom) || 13;
        const actsType = (v.decades_by_type || []).some(t => t.label === st.hVillageActs) ? st.hVillageActs : '';
        const pr = v.profile;
        const pops = [...(pr.populations || [])];
        if (v.current_population && !pops.some(p => p[0] >= new Date().getFullYear() - 5)) pops.push([new Date().getFullYear(), v.current_population]);
        pops.sort((a, b) => a[0] - b[0]);
        const wiki = `https://fr.wikipedia.org/w/index.php?search=${encodeURIComponent(v.name + ' ' + (v.county || ''))}`;
        const geoportail = v.lat !== null ? `https://www.geoportail.gouv.fr/carte?c=${v.lon},${v.lat}&z=14&l0=BNF-IGNF_GEOGRAPHICALGRIDSYSTEMS.CASSINI::GEOPORTAIL:OGC:WMTS(1)&permalink=yes` : '';
        const topJob = Math.max(1, ...v.jobs.map(j => j.count));
        A().$('#workspace').innerHTML = `<section class="page collection-page h-village">${header('FICHE D’UN VILLAGE', v.name, esc([v.county, v.state !== v.county ? v.state : '', v.country].filter(Boolean).join(' · ')) + (v.insee ? ` · code INSEE ${esc(v.insee)}` : '') + (v.places.length > 1 ? `<br><small>Lieux de la base rattachés : ${esc(v.places.join(', '))}</small>` : ''),
                `<button type="button" class="button secondary" data-h-village-back>← Toutes les communes</button><button type="button" class="button secondary" data-h-village-mono>Monographie complète</button>${tools('data-h-village-edit', 'data-h-village-clear', 'la fiche du village')}`)}
            ${ext.labelChips(v.labels)}
            <div class="h-village-stats"><span><strong>${fmt(v.people_count)}</strong> personnes de la famille</span><span>${plural(v.families.length, 'famille', 'familles').replace(/^(\S+)/, '<strong>$1</strong>')}</span><span><strong>${fmt(v.acts.baptemes)}</strong> naissances / baptêmes</span><span><strong>${fmt(v.acts.mariages)}</strong> mariages</span><span><strong>${fmt(v.acts.deces)}</strong> décès / sépultures</span>${v.current_population ? `<span><strong>${fmt(v.current_population)}</strong> habitants aujourd’hui</span>` : ''}</div>
            <div class="h-village-grid">
            <section class="maintenance-panel h-village-mapbox"><h3>🗺️ La carte</h3><div class="h-tabs">${VILLAGE_MAPS.map(([k, l]) => `<button type="button" class="button small ${k === bg ? '' : 'secondary'}" data-h-village-bg="${k}">${esc(l)}</button>`).join('')}<span class="spacer"></span><button type="button" class="icon-button" data-h-village-zoom="-1" title="Dézoomer">−</button><button type="button" class="icon-button" data-h-village-zoom="1" title="Zoomer">+</button></div>
                <div class="h-village-mapwrap">${villageMapHtml(v, bg, zoom)}</div>${geoportail ? `<p class="h-links"><a href="${esc(geoportail)}" target="_blank" rel="noopener noreferrer">Ouvrir sur le Géoportail ↗</a> · <button type="button" class="link-button" data-h-village-main>Voir sur la carte de l’app</button></p>` : ''}</section>
            <section class="maintenance-panel"><h3>⛪ Église et paroisse</h3>
                <dl class="data-list">${pr.church ? `<div class="data-row"><dt>Église</dt><dd>${esc(pr.church)}</dd></div>` : ''}${pr.patron_saint ? `<div class="data-row"><dt>Saint patron</dt><dd>${esc(pr.patron_saint)}</dd></div>` : ''}${pr.diocese ? `<div class="data-row"><dt>Diocèse</dt><dd>${esc(pr.diocese)}</dd></div>` : ''}</dl>
                ${!pr.church && !pr.patron_saint && !pr.diocese ? '<p class="muted">Église, saint patron et diocèse à noter (crayon en haut).</p>' : ''}
                ${v.parish.length ? `<h4>Avant la Révolution</h4><ul>${v.parish.map(x => `<li>Dépendait de la paroisse de <strong>${esc(x.parish)}</strong>${x.until ? ` jusqu’en ${x.until}` : ''}${x.from ? ` (depuis ${x.from})` : ''}${x.note ? ` — <small>${esc(x.note)}</small>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Aucun rattachement à une autre paroisse noté (Listes → Paroisses d’Ancien Régime).</p>'}
                ${v.registers.length ? `<h4>Registres en ligne</h4><ul>${v.registers.map(l => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ↗</a>${l.note ? ` <small class="muted">${esc(l.note)}</small>` : ''}</li>`).join('')}</ul>` : ''}
                ${v.graves.length ? `<h4>Cimetières</h4><ul>${v.graves.map(g => `<li>${esc(g.cemetery_name || 'Cimetière')} <small>(${plural(g.n, 'sépulture notée', 'sépultures notées')})</small></li>`).join('')}</ul>` : ''}</section>
            <section class="maintenance-panel"><h3>👥 Population au fil des recensements</h3>${populationChart(pops) || '<p class="muted">Ajoute les chiffres des recensements (crayon en haut) : ils sont sur la page Wikipédia de la commune (« Évolution démographique », d’après Cassini/EHESS et l’INSEE).</p>'}
                ${pops.length ? `<details><summary>Les chiffres (${pops.length})</summary><table class="data-table"><tbody>${pops.map(p => `<tr><td>${p[0]}</td><td>${fmt(p[1])} habitants</td></tr>`).join('')}</tbody></table></details>` : ''}
                ${v.census.length ? `<h4>Recensements de la famille ici</h4><table class="data-table"><thead><tr><th>Année</th><th>Foyers</th><th>Personnes relevées</th></tr></thead><tbody>${v.census.map(c => `<tr><td>${c.year}</td><td>${c.households}</td><td>${c.members}</td></tr>`).join('')}</tbody></table>` : ''}
                <p class="h-links"><a href="${esc(wiki)}" target="_blank" rel="noopener noreferrer">Wikipédia (évolution démographique) ↗</a> · <a href="http://cassini.ehess.fr/" target="_blank" rel="noopener noreferrer">Des villages de Cassini aux communes d’aujourd’hui (EHESS) ↗</a></p></section>
            <section class="maintenance-panel"><h3>⚒️ Métiers dominants</h3>${v.jobs.length ? `<ul class="h-bars">${v.jobs.map(j => `<li><span class="h-bar-label">${esc(j.name)}</span><span class="h-bar"><i style="width:${Math.round(j.count / topJob * 100)}%"></i></span><span>${j.count}${j.from ? ` <small class="muted">${j.from}${j.to && j.to !== j.from ? '–' + j.to : ''}</small>` : ''}</span></li>`).join('')}</ul>` : '<p class="muted">Aucun métier noté pour les personnes de cette commune.</p>'}</section>
            </div>
            <section class="maintenance-panel"><h3>🏠 Les familles qui y ont vécu (${v.families.length})</h3>${v.families.length ? `<table class="data-table"><thead><tr><th>Famille</th><th>Personnes</th><th>Période</th><th>Générations</th><th>Qui</th></tr></thead><tbody>${v.families.map(f => `<tr><td><strong>${esc(f.name)}</strong>${f.variants.length > 1 ? `<br><small class="muted">${esc(f.variants.join(', '))}</small>` : ''}</td><td>${f.count}</td><td>${f.from ? esc(f.from + (f.to && f.to !== f.from ? '–' + f.to : '')) : '—'}</td><td>${f.generations}</td><td>${(() => { const link = p => personLink(p.id, pname(p) + (p.birth_year ? ` (${p.birth_year})` : ''));
                    return f.people.length > 8 ? `<span>${f.people.slice(0, 8).map(link).join(', ')}</span><span hidden>, ${f.people.slice(8).map(link).join(', ')}</span> <button type="button" class="link-button" data-h-village-more data-n="${f.people.length - 8}">et ${f.people.length - 8} autre${f.people.length - 8 > 1 ? 's' : ''} ▾</button>` : f.people.map(link).join(', '); })()}</td></tr>`).join('')}</tbody></table>` : empty('Aucune personne de la famille rattachée à cette commune.')}</section>
            ${Object.keys(v.decades).length > 1 ? `<section class="maintenance-panel"><div class="h-panel-head"><h3>📜 Actes de la famille par décennie</h3><label class="h-inline">Afficher <select data-h-village-acts><option value="">Tous les actes (${fmt(Object.values(v.decades).reduce((a, b) => a + b, 0))})</option>${(v.decades_by_type || []).map(t => `<option value="${esc(t.label)}" ${t.label === actsType ? 'selected' : ''}>${esc(t.label)} (${fmt(t.total)})</option>`).join('')}</select></label></div><div data-h-village-decades>${decadesHtml(v, actsType)}</div></section>` : ''}
            ${pr.notes || v.media.length ? `<section class="maintenance-panel"><h3>📝 Notes et photos</h3>${pr.notes ? `<p class="h-transcription">${nl(pr.notes)}</p>` : ''}${ext.thumbs ? ext.thumbs('village-' + pr.id, v.media) : ''}</section>` : ''}
            </section>`;
        A().bindTableLinks();
        const ws = A().$('#workspace');
        const again = () => renderVillage(++st.workspaceToken, key);
        ws.querySelector('[data-h-village-back]').addEventListener('click', () => { st.hVillage = ''; ext.lists.villages(++st.workspaceToken); });
        ws.querySelector('[data-h-village-mono]').addEventListener('click', () => { st.graphMode = 'place_monograph'; st.graphPlaceMonograph = {...(st.graphPlaceMonograph || {}), id: v.place_id, name: v.name, county: v.county || '', country: v.country || ''}; A().setModule('graphiques'); });
        ws.querySelectorAll('[data-h-village-bg]').forEach(b => b.addEventListener('click', () => { st.hVillageMap = b.dataset.hVillageBg; again(); }));
        ws.querySelectorAll('[data-h-village-zoom]').forEach(b => b.addEventListener('click', () => { st.hVillageZoom = Math.max(10, Math.min(16, zoom + Number(b.dataset.hVillageZoom))); again(); }));
        ws.querySelectorAll('[data-h-village-more]').forEach(b => b.addEventListener('click', () => {
            const rest = b.previousElementSibling, open = rest.hidden;
            rest.hidden = !open;
            b.textContent = open ? 'réduire ▴' : `et ${b.dataset.n} autre${Number(b.dataset.n) > 1 ? 's' : ''} ▾`;
        }));
        ws.querySelector('[data-h-village-acts]')?.addEventListener('change', e => { st.hVillageActs = e.target.value; ws.querySelector('[data-h-village-decades]').innerHTML = decadesHtml(v, e.target.value); });
        ws.querySelector('[data-h-village-main]')?.addEventListener('click', () => { st.mapCenter = {lat: v.lat, lon: v.lon}; st.mapZoom = 14; st.mapKeepCenter = true; A().setModule('carte'); });
        ws.querySelector('[data-h-village-edit]').addEventListener('click', () => openVillageDialog(v, again));
        ws.querySelector('[data-h-village-clear]').addEventListener('click', async () => {
            if (!confirm('Effacer ce qui a été noté sur ce village (église, populations, notes) ? Les familles et les métiers, calculés depuis les fiches, restent.')) return;
            try { await api('save_village_profile', {}, {method: 'POST', body: {key, name: v.name, populations: [], pending_labels: []}}); toast('Fiche du village effacée.'); again(); } catch (error) { toast(error.message, 'error'); }
        });
    }
    function openVillageDialog(v, done) {
        const pr = v.profile;
        dialog({
            eyebrow: 'FICHE D’UN VILLAGE', title: v.name, wide: true, labels: ['village', v.labels],
            body: `<div class="form-grid"><label>Église<input name="church" value="${esc(pr.church)}" placeholder="Église Saint-Martin, collégiale…"></label><label>Saint patron<input name="patron_saint" value="${esc(pr.patron_saint)}" placeholder="saint Martin"></label>
                <label>Diocèse (sous l’Ancien Régime)<input name="diocese" value="${esc(pr.diocese)}" placeholder="Limoges"></label><span></span>
                <label class="span-2">Population au fil des recensements <small>(une ligne par année : « 1793 : 1 450 ». Tu peux coller le tableau de Wikipédia.)</small><textarea name="populations_text" rows="7" placeholder="1793 : 1450&#10;1806 : 1512&#10;1836 : 1604">${esc((pr.populations || []).map(p => `${p[0]} : ${p[1]}`).join('\n'))}</textarea></label>
                <label class="span-2">Notes (histoire, seigneurie, foires, curés…)<textarea name="notes" rows="4">${esc(pr.notes)}</textarea></label></div>
                <h4>Photos (église, vues anciennes, cartes postales…)</h4>${ext.mediaEditorHtml ? ext.mediaEditorHtml('village', pr.id || 0, v.media || [], [['', 'Photos et documents', 'image/*,application/pdf']]) : ''}`,
            onSubmit: async form => {
                const val = A().formObject(form);
                const saved = await api('save_village_profile', {}, {method: 'POST', body: {key: v.key, name: v.name, church: val.church, patron_saint: val.patron_saint, diocese: val.diocese, populations_text: val.populations_text, notes: val.notes}});
                if (ext.uploadMediaEditor) await ext.uploadMediaEditor(form, 'village', saved.result.id);
                toast('Fiche du village enregistrée.');
                done();
            },
        });
    }
})();
