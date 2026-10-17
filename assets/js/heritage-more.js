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
        save_probate_inventory: 'probate_inventory', save_help_request: 'help_request', save_parish: 'parish', save_cited_name: 'cited_name', save_resistance: 'resistance', save_custom_block_entry: 'custom_block_entry', save_village_profile: 'village', save_voter_cards: 'voter'};
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
        const kindFilter = ls('lcnda-acts-kind', '');
        const acts = (data.acts || []).filter(a => (showAll || (!a.has_copy && !a.courrier_id)) && (!kindFilter || a.kind === kindFilter));
        const limit = Number(S().hActsLimit) || 25;
        const todayIso = new Date().toISOString().slice(0, 10);
        const state = a => a.tag === 'DEAT' ? '<span class="h-badge is-ok">Communicable à tous</span>'
            : a.public ? `<span class="h-badge is-ok">Ouvert à tous depuis ${esc(dateTimeFr(a.open_at))}</span>`
            : `<span class="h-badge is-warn">Réservé à la famille directe jusqu’au ${esc(dateTimeFr(a.open_at))}</span>`;
        const html = `<details class="maintenance-panel h-acts" ${acts.length ? 'open' : ''}><summary><strong>📮 Actes à demander à la mairie</strong> <small>(${acts.length})</small></summary>
            <p class="muted">Les actes de moins de 100 ans ne sont en général pas en ligne : il faut les demander à la mairie. Naissances et mariages de moins de 75 ans : copie intégrale réservée à la personne, ses ascendants, descendants et conjoint (sinon extrait sans filiation). Décès : communicables à tous.</p>
            <div class="h-acts-tools"><label class="checkbox-line"><input type="checkbox" data-h-acts-all ${showAll ? 'checked' : ''}> Montrer aussi ceux que j’ai déjà (copie, source) ou déjà demandés</label>
                <label>Actes <select data-h-acts-kind><option value="">tous</option>${['naissance', 'mariage', 'décès'].map(k => `<option ${k === kindFilter ? 'selected' : ''}>${k}</option>`).join('')}</select></label></div>
            ${acts.length ? `<table class="data-table h-acts-table"><thead><tr><th>Acte</th><th>Personne(s)</th><th>Date, lieu</th><th>Accès</th><th>En ligne aux archives</th><th></th></tr></thead><tbody>${acts.slice(0, limit).map(a => `<tr>
                <td><strong>${esc(a.kind)}</strong>${a.has_copy ? '<br><small>✅ copie ou source déjà là</small>' : ''}</td><td>${a.people.map(pLink).join('<br>')}</td>
                <td>${esc(a.date_text)}${a.place ? `<br><small>${esc(a.place)}${a.county ? ' (' + esc(a.county) + ')' : ''}</small>` : ''}</td><td>${state(a)}</td>
                <td><small>vers ${a.online_from}${a.online_from <= Number(todayIso.slice(0, 4)) ? ' (peut-être déjà)' : ''}</small></td>
                <td>${a.courrier_id ? `<small>✉️ courrier ${esc(a.courrier_statut || '')}</small>` : `<button type="button" class="button small" data-h-act-letter="${a.event_id}">Préparer la lettre</button>`}${!a.public && a.tag !== 'DEAT' ? `<br><button type="button" class="link-button" data-h-act-remind="${a.event_id}">🔔 Me rappeler à l’ouverture</button>` : ''}</td></tr>`).join('')}</tbody></table>${acts.length > limit ? `<div class="page-actions"><button type="button" class="button secondary" data-h-acts-more>Voir ${Math.min(25, acts.length - limit)} de plus (${acts.length - limit} restants)</button></div>` : ''}` : empty('Aucun acte récent à demander.')}</details>`;
        (page.querySelector('.page-header') || page.firstElementChild).insertAdjacentHTML('afterend', html);
        const box = page.querySelector('.h-acts');
        box.querySelector('[data-h-acts-all]').addEventListener('change', e => { lsSet('lcnda-acts-all', e.target.checked ? '1' : '0'); A().renderList(); });
        box.querySelector('[data-h-acts-kind]').addEventListener('change', e => { lsSet('lcnda-acts-kind', e.target.value); S().hActsLimit = 25; A().renderList(); });
        box.querySelector('[data-h-acts-more]')?.addEventListener('click', () => { S().hActsLimit = limit + 25; A().renderList(); });
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
        ['journey', '🧭', 'Parcours jour par jour', 'Des étapes datées sur une frise et une carte (comme dans Résistants), écrites à la main ou reprises de la fiche'],
        ['stat', '📊', 'Statistique', 'Un graphique, des chiffres ou une liste réglés à fond comme dans l’Éditeur de statistiques ; ils peuvent dépendre de la personne de la fiche (ses ancêtres, sa famille…)'],
        ['widget', '🧱', 'Widget', 'Un de tes widgets (chiffres, liste, graphique, texte…) ou un écran de l’app (la fiche de la personne, une liste, un diagramme…) dans le bloc'],
    ];
    /** Champ « Widget » : l'écran ou le widget dessiné sur la fiche ; « person:self » = la personne de la fiche */
    function widgetFieldHtml(f) {
        const w = String(f.widget || ''), h = Math.max(240, Math.min(2000, Number(f.height) || 560));
        if (w.startsWith('screen:') && ext.appScreen) {
            let target = w.slice(7);
            if (target === 'person:self') target = blockDetail?.person?.id ? 'person:' + blockDetail.person.id : '';
            if (!target || !ext.appScreen.valid(target)) return '<p class="muted">Écran introuvable.</p>';
            if (ext.appScreen.nested) return ext.appScreen.nestedLink(target, f.label);
            return `<iframe class="h-ct-frame" src="${esc(ext.appScreen.url({target}))}" title="${esc(f.label)}" loading="lazy" style="height:${h}px"></iframe><button type="button" class="link-button" data-ct-open-screen="${esc(target)}">↗ Ouvrir en grand</button>`;
        }
        if (/^cw_/.test(w)) { setTimeout(() => document.querySelectorAll('[data-be-widget]:not([data-filled])').forEach(el => { el.dataset.filled = '1'; ext.renderCustomWidgetInto?.(el, el.dataset.beWidget, {personId: Number(el.dataset.bePerson) || 0}); }), 0); return `<div class="card-grid h-be-widget" data-be-widget="${esc(w)}" data-be-person="${Number(blockDetail?.person?.id) || 0}"></div>`; }
        return '<p class="muted">Choisis le widget dans l’Éditeur de blocs.</p>';
    }
    /** Champ « Statistique » : choisir une de ses statistiques, en créer une, ou la régler dans l'Éditeur de statistiques */
    function statChoiceHtml(f) {
        const stats = Object.values(ext.customWidgetDefs?.() || {}).filter(d => ['chart', 'appstat', 'numbers', 'list'].includes(d.kind));
        return `<label class="span-2">Quelle statistique ? <select data-be="widget"><option value="">choisir…</option>${stats.map(d => `<option value="${esc(d.id)}" ${f.widget === d.id ? 'selected' : ''}>${esc(`${d.icon || '📊'} ${d.name || 'Ma statistique'}`)}</option>`).join('')}</select></label>
            <p class="span-2 h-be-stat-actions"><button type="button" class="button small" data-be-stat-new="${esc(f.key)}">📊 Nouvelle statistique…</button>${f.widget ? `<button type="button" class="button small secondary" data-be-stat-edit="${esc(f.key)}">✎ Régler cette statistique…</button>` : ''}
            <small class="muted">L’Éditeur de statistiques s’ouvre avec tous ses réglages (données, critères, dessin, couleurs, légende) ; une fois enregistrée, tu reviens ici. Le critère « Par rapport à la personne de la fiche » la fait dépendre de chaque fiche.</small></p>`;
    }
    // Retour de l'Éditeur de statistiques : la statistique enregistrée va dans le champ du bloc en cours
    ext.blockStatReturn = null;
    ext.attachStatToBlock = id => {
        const ret = ext.blockStatReturn; ext.blockStatReturn = null;
        if (!ret || !editorDef) return false;
        const f = editorDef.fields.find(x => x.key === ret.key); if (f) f.widget = id;
        S().maintenanceTab = 'block_editor'; A().setModule('maintenance');
        toast('Statistique posée dans le bloc : enregistre le bloc pour la garder.');
        return true;
    };
    function widgetChoiceHtml(f) {
        const mine = Object.values(ext.customWidgetDefs?.() || {});
        const screens = ext.appScreen ? ext.appScreen.targets() : [];
        const opt = (v, l) => `<option value="${esc(v)}" ${f.widget === v ? 'selected' : ''}>${esc(l)}</option>`;
        return `<label class="span-2">Quel widget ? <select data-be="widget"><option value="">choisir…</option>
                <optgroup label="👤 Cette fiche">${opt('screen:person:self', 'La fiche de la personne (en petit)')}</optgroup>
                ${mine.length ? `<optgroup label="✨ Mes widgets">${mine.map(d => opt(d.id, `${d.icon || '🧱'} ${d.name || 'Mon widget'}`)).join('')}</optgroup>` : ''}
                ${screens.map(([g, items]) => `<optgroup label="📺 ${esc(g)}">${items.map(([v, l]) => opt('screen:' + v, l)).join('')}</optgroup>`).join('')}</select></label>
            <label>Hauteur <small>(écran)</small><select data-be="height">${[['360', 'petit'], ['560', 'moyen'], ['800', 'grand'], ['1100', 'très grand']].map(([v, l]) => `<option value="${v}" ${String(f.height || 560) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <p class="span-2"><button type="button" class="button small secondary" data-be-newwidget>🧱 Créer un widget…</button> <small class="muted">avec tout ce que propose l’Éditeur de widgets (chiffres, liste, graphique, statistique, écran, texte, raccourcis, parcours) ; il apparaît ensuite dans ce menu.</small></p>`;
    }
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
            case 'widget': case 'stat': return widgetFieldHtml(f);
            case 'journey': return ext.journeyHtml ? ext.journeyHtml({jSource: f.jSource, steps: Array.isArray(v) ? v : [], jLayout: f.jLayout, jOrder: f.jOrder, jMap: f.jMap !== false, jDays: f.jDays !== false, jWithPlace: !!f.jWithPlace, jPerson: 1, color: '#0066cc'}, f.jSource === 'person' ? [{detail: blockDetail || {events: []}}] : []) : '';
            default: return esc(v ?? '');
        }
    }
    let blockDetail = null; // la fiche affichée (pour un parcours repris de ses événements)
    function entryHtml(def, e, editable) {
        const rows = def.fields.filter(f => f.type !== 'map').map(f => { const h = fieldValueHtml(def, f, e); return h ? `<div class="data-row"><dt>${esc(fieldLabel(f, def.fields))}</dt><dd>${h}</dd></div>` : ''; }).join('');
        return `<article class="h-cb-entry"><div class="h-cb-entry-head">${ext.labelChips(e.labels)}${editable ? tools(`data-h-cb-edit="${e.id}" data-h-cb-block="${def.id}"`, `data-h-cb-del="${e.id}"`, 'cette fiche du bloc') : ''}</div><dl class="data-list">${rows || '<p class="muted">Vide.</p>'}</dl></article>`;
    }
    let currentBlocks = [];
    ext.personBlocks.custom_blocks = (index, detail, {editOnly}) => {
        const p = detail.person, blocks = detail.heritage?.custom_blocks || [];
        blockDetail = detail;
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
            // champs « Widget » : affichés sur la fiche, même quand rien n'est encore rempli dans le bloc
            const widgetFields = b.entries.length ? '' : b.fields.filter(f => ['widget', 'stat'].includes(f.type) && f.widget).map(f => `<div class="h-cb-widget"><span class="section-label">${esc(f.label)}</span>${widgetFieldHtml(f)}</div>`).join('');
            const onlyWidgets = b.fields.length && b.fields.every(f => ['widget', 'stat', 'map', 'person_info'].includes(f.type));
            const body = `${b.description ? `<p class="muted">${esc(b.description)}</p>` : ''}${widgetFields}${b.entries.length ? '' : selfInfos ? `<p>${selfInfos}</p>` : ''}
                ${b.entries.length ? `<div class="${pts.length ? 'h-voyage-layout' : ''}"><div class="h-cb-entries">${b.entries.map(e => entryHtml(b, e, editable)).join('')}</div>${pts.length && ext.miniMap ? `<div>${ext.miniMap(pts, pts.length > 1 ? [{coords: pts.map(x => [x.lat, x.lon]), color: '#555', dashed: true}] : [], {height: 300})}</div>` : ''}</div>` : onlyWidgets && widgetFields ? '' : empty('Rien de rempli pour l’instant.')}`;
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
            case 'widget': case 'stat': return `<p class="muted span-2">${f.type === 'stat' ? '📊' : '🧱'} ${esc(f.label)} : ${f.type === 'stat' ? 'la statistique' : 'le widget'} s’affiche tout seul sur la fiche.</p>`;
            case 'journey': return f.jSource === 'person' ? `<p class="muted span-2">🧭 ${esc(f.label)} : les étapes sont les événements datés de cette fiche, repris tout seuls.</p>`
                : `<div class="span-2 h-be-journey" data-be-journey="${esc(f.key)}"><span class="section-label">🧭 ${esc(f.label)}</span>${help}<div class="h-jr-rows" data-j-rows>${(Array.isArray(value) ? value : []).map((x, i) => ext.journeyRowHtml?.(x, i) || '').join('')}</div><button type="button" class="button small secondary" data-j-add>+ Étape</button></div>`;
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
            onOpen: dl => dl.querySelectorAll('[data-be-journey]').forEach(box => {
                const rows = box.querySelector('[data-j-rows]');
                box.querySelector('[data-j-add]').addEventListener('click', () => { rows.insertAdjacentHTML('beforeend', ext.journeyRowHtml({}, rows.children.length)); rows.lastElementChild.querySelector('[data-j=date]')?.focus(); });
                rows.addEventListener('click', e => { const r = e.target.closest('[data-j-row]'); if (!r) return;
                    if (e.target.closest('[data-j-del]')) r.remove();
                    if (e.target.closest('[data-j-up]') && r.previousElementSibling) rows.insertBefore(r, r.previousElementSibling);
                    if (e.target.closest('[data-j-down]') && r.nextElementSibling) rows.insertBefore(r.nextElementSibling, r); });
            }),
            onSubmit: async form => {
                const data = {};
                def.fields.forEach(f => {
                    const jb = f.type === 'journey' ? form.querySelector(`[data-be-journey="${f.key}"]`) : null;
                    if (jb) { data[f.key] = ext.readJourneyRows ? ext.readJourneyRows(jb) : []; return; }
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
    // Après l'enregistrement réussi de la fiche (app.js) : les cases des blocs perso
    ext.afterPersonSave = ext.afterPersonSave || [];
    ext.afterPersonSave.push(async (saved, form) => {
        const box = form.querySelector('.h-cb-flags');
        if (!box || !Number(box.dataset.cbPerson)) return;
        const ids = [...box.querySelectorAll('[data-cb-flag]:checked')].map(i => Number(i.dataset.cbFlag));
        await api('set_custom_block_flags', {}, {method: 'POST', body: {person_id: box.dataset.cbPerson, block_ids: ids}});
    });

    /* ═══════════════════════ 🧩 ÉDITEUR DE BLOCS (Maintenance) ═══════════════════════ */

    const TEMPLATES = [
        {name: 'Décorations et médailles', icon: '🎖️', description: 'Médailles, décorations, distinctions reçues.', repeatable: 1, fields: [['text', 'Décoration'], ['date', 'Date'], ['longtext', 'Motif, citation'], ['media', 'Diplôme, photo de la médaille']]},
        {name: 'Maison de famille', icon: '🏡', description: 'Les maisons où la famille a vécu.', repeatable: 1, fields: [['place', 'Adresse'], ['text', 'Période'], ['longtext', 'Souvenirs'], ['media', 'Photos'], ['map', 'Carte des maisons']]},
        {name: 'Témoignage enregistré', icon: '🎙️', description: 'Souvenirs racontés par un proche.', repeatable: 1, fields: [['person', 'Raconté par'], ['date', 'Enregistré le'], ['media', 'Enregistrement (son ou vidéo)'], ['longtext', 'Résumé, transcription'], ['person_info', 'Naissance (date et lieu)']]},
        {name: 'Bloc vide', icon: '🧩', description: '', repeatable: 1, fields: [['text', 'Titre']]},
    ];
    /** Les blocs de l'application, à reprendre comme point de départ (champ : [type, intitulé, choix]). */
    const APP_BLOCK_TEMPLATES = [
        // Les blocs d'une fiche personne
        {group: 'fiche', name: 'Identité', icon: '🪪', description: 'L’essentiel sur la personne.', repeatable: 0, fields: [['person_info', 'Naissance (date et lieu)'], ['person_info', 'Décès (date et lieu)'], ['person_info', 'Métier'], ['text', 'Surnom'], ['select', 'Statut', ['vivant', 'décédé', 'à vérifier']], ['text', 'Nationalité'], ['text', 'Description physique'], ['longtext', 'Notes']]},
        {group: 'fiche', name: 'Parents', icon: '👪', description: 'Le père et la mère.', repeatable: 0, fields: [['person', 'Père'], ['person', 'Mère'], ['person_info', 'Parents'], ['longtext', 'Remarques sur la filiation']]},
        {group: 'fiche', name: 'Conjoints', icon: '💍', description: 'Mariages et unions.', repeatable: 1, fields: [['person', 'Conjoint'], ['date', 'Date du mariage'], ['place', 'Lieu du mariage'], ['select', 'Union', ['mariage', 'concubinage', 'PACS', 'divorce', 'veuvage']], ['text', 'Contrat de mariage (notaire)'], ['media', 'Acte, photos'], ['map', 'Carte']]},
        {group: 'fiche', name: 'Enfants', icon: '👶', description: 'Les enfants de la personne.', repeatable: 1, fields: [['person', 'Enfant'], ['date', 'Naissance'], ['place', 'Lieu de naissance'], ['person', 'Autre parent'], ['longtext', 'Notes']]},
        {group: 'fiche', name: 'Événements', icon: '📅', description: 'Un événement de la vie.', repeatable: 1, fields: [['select', 'Événement', ['naissance', 'baptême', 'mariage', 'décès', 'inhumation', 'résidence', 'recensement', 'métier', 'autre']], ['date', 'Date'], ['place', 'Lieu'], ['person', 'Témoin'], ['longtext', 'Description'], ['url', 'Source en ligne'], ['media', 'Acte'], ['map', 'Carte des événements']]},
        {group: 'fiche', name: 'Métiers', icon: '🛠️', description: 'Les métiers exercés.', repeatable: 1, fields: [['text', 'Métier'], ['text', 'Employeur'], ['date', 'De'], ['date', 'À'], ['place', 'Lieu'], ['longtext', 'Notes']]},
        {group: 'fiche', name: 'Médias', icon: '🖼️', description: 'Photos, documents, sons et vidéos.', repeatable: 1, fields: [['text', 'Titre'], ['date', 'Date'], ['media', 'Fichiers'], ['longtext', 'Description']]},
        {group: 'fiche', name: 'Correspondance', icon: '✉️', description: 'Lettres reçues et envoyées.', repeatable: 1, fields: [['select', 'Sens', ['reçue', 'envoyée']], ['person', 'Correspondant'], ['date', 'Date'], ['place', 'Lieu d’envoi'], ['longtext', 'Transcription'], ['media', 'Lettre']]},
        {group: 'fiche', name: 'Témoignages / souvenirs', icon: '🎙️', description: 'Ce que les proches racontent.', repeatable: 1, fields: [['person', 'Raconté par'], ['date', 'Date'], ['longtext', 'Souvenir'], ['media', 'Enregistrement']]},
        {group: 'fiche', name: 'Notes', icon: '🗒️', description: 'Notes libres.', repeatable: 1, fields: [['text', 'Titre'], ['longtext', 'Note']]},
        {group: 'fiche', name: 'Sources & citations', icon: '📚', description: 'D’où vient l’information.', repeatable: 1, fields: [['text', 'Source'], ['text', 'Cote'], ['text', 'Page, vue'], ['url', 'Lien'], ['longtext', 'Citation'], ['select', 'Fiabilité', ['originale', 'copie', 'témoignage', 'à vérifier']]]},
        {group: 'fiche', name: 'Références externes', icon: '🔗', description: 'La personne sur d’autres sites.', repeatable: 1, fields: [['text', 'Site'], ['url', 'Lien'], ['text', 'Identifiant']]},
        {group: 'fiche', name: 'Repères de maternité', icon: '🤱', description: 'Grossesses et naissances.', repeatable: 1, fields: [['date', 'Naissance de l’enfant'], ['person', 'Enfant'], ['person_info', 'Âge au décès'], ['number', 'Âge de la mère'], ['longtext', 'Notes']]},
        {group: 'fiche', name: 'Enquêtes', icon: '🔍', description: 'Une piste à suivre.', repeatable: 1, fields: [['text', 'Question'], ['select', 'État', ['à faire', 'en cours', 'résolue', 'abandonnée']], ['longtext', 'Pistes'], ['url', 'Lien'], ['media', 'Documents']]},
        {group: 'fiche', name: 'Signatures', icon: '✍️', description: 'Les signatures relevées.', repeatable: 1, fields: [['date', 'Date'], ['text', 'Acte'], ['media', 'Signature']]},
        {group: 'fiche', name: 'Œuvres artistiques', icon: '🎨', description: 'Ce que la personne a créé.', repeatable: 1, fields: [['text', 'Titre'], ['select', 'Genre', ['peinture', 'dessin', 'sculpture', 'musique', 'écrit', 'photographie', 'autre']], ['date', 'Date'], ['text', 'Technique, dimensions'], ['text', 'Où elle se trouve'], ['media', 'Photos']]},
        {group: 'fiche', name: 'Inventaire après décès', icon: '📦', description: 'Les biens inventoriés.', repeatable: 1, fields: [['date', 'Date'], ['text', 'Notaire'], ['text', 'Cote'], ['longtext', 'Biens'], ['number', 'Estimation'], ['media', 'Inventaire']]},
        {group: 'fiche', name: 'Papiers de famille', icon: '🗃️', description: 'Les originaux gardés dans la famille.', repeatable: 1, fields: [['text', 'Document'], ['date', 'Date'], ['person', 'Le garde'], ['text', 'Où'], ['media', 'Scan']]},
        {group: 'fiche', name: 'Ascendants', icon: '🌳', description: 'Les parents et grands-parents.', repeatable: 0, fields: [['person_info', 'Parents'], ['person', 'Grand-père paternel'], ['person', 'Grand-mère paternelle'], ['person', 'Grand-père maternel'], ['person', 'Grand-mère maternelle']]},
        {group: 'fiche', name: 'Descendants', icon: '🌱', description: 'Enfants et petits-enfants.', repeatable: 1, fields: [['person', 'Descendant'], ['select', 'Génération', ['enfant', 'petit-enfant', 'arrière-petit-enfant']], ['longtext', 'Notes']]},
        // Les blocs « patrimoine »
        {name: 'Départs et émigration', icon: '🚢', description: 'Un départ : port, navire, destination, papiers.', repeatable: 1, fields: [['date', 'Date de départ'], ['place', 'Port de départ'], ['text', 'Navire'], ['text', 'Escales'], ['date', 'Date d’arrivée'], ['place', 'Destination'], ['select', 'Motif', ['travail', 'famille', 'guerre', 'religion', 'misère', 'aventure', 'autre']], ['person', 'Parti avec'], ['url', 'Liste de passagers (lien)'], ['date', 'Naturalisation'], ['media', 'Papiers d’émigration, photos'], ['longtext', 'Notes'], ['map', 'Trajet sur la carte']]},
        {name: 'Enfant placé', icon: '🍼', description: 'Nourrice, hospice, Assistance publique.', repeatable: 1, fields: [['select', 'Placement', ['nourrice', 'hospice', 'Assistance publique', 'orphelinat', 'famille d’accueil', 'autre']], ['text', 'Institution'], ['text', 'Matricule'], ['date', 'Début'], ['date', 'Fin'], ['place', 'Lieu de placement'], ['person', 'Nourrice'], ['text', 'Salaire de la nourrice'], ['longtext', 'Devenir, notes'], ['media', 'Dossier, photos'], ['map', 'Carte']]},
        {name: 'Blason et noblesse', icon: '🛡️', description: 'Armoiries, devise, titre.', repeatable: 0, fields: [['text', 'Titre'], ['longtext', 'Blasonnement'], ['text', 'Devise'], ['text', 'Titre de noblesse'], ['longtext', 'Origine'], ['media', 'Dessin du blason']]},
        {name: 'Poilu 14-18', icon: '🪖', description: 'Régiments, blessures, journaux de marche.', repeatable: 1, fields: [['text', 'Régiment, unité'], ['date', 'Du'], ['date', 'Au'], ['text', 'Cote du journal de marche (JMO)'], ['url', 'Lien vers le JMO'], ['select', 'Événement', ['incorporation', 'blessure', 'citation', 'prisonnier', 'disparu', 'mort', 'démobilisation', 'autre']], ['place', 'Lieu'], ['longtext', 'Notes'], ['media', 'Photos, lettres'], ['map', 'Carte']]},
        {name: 'Résistant', icon: '✊', description: 'Réseau, nom de guerre, arrestation, parcours.', repeatable: 0, fields: [['text', 'Nom de guerre'], ['text', 'Réseau'], ['text', 'Mouvement'], ['text', 'Grade'], ['date', 'Entré en résistance'], ['date', 'Sorti'], ['checkbox', 'Arrêté'], ['checkbox', 'Déporté'], ['checkbox', 'Mort'], ['text', 'Reconnaissance (médaille, homologation)'], ['text', 'Cote du dossier (SHD)'], ['person', 'Compagnon'], ['place', 'Cache'], ['longtext', 'Notes'], ['media', 'Documents'], ['map', 'Carte']]},
        {name: 'Langues', icon: '🗣️', description: 'Langues parlées.', repeatable: 1, fields: [['text', 'Langue'], ['select', 'Certitude', ['certain', 'probable', 'supposé']], ['checkbox', 'Transmise aux enfants'], ['text', 'Note']]},
        {name: 'Militaire (registre matricule)', icon: '🎖', description: 'Informations du registre matricule.', repeatable: 0, fields: [['text', 'Classe'], ['text', 'Numéro matricule'], ['text', 'Bureau de recrutement'], ['text', 'Taille'], ['text', 'Cheveux, yeux'], ['text', 'Degré d’instruction'], ['longtext', 'Détail des services'], ['longtext', 'Campagnes, blessures, décorations'], ['url', 'Lien vers le registre'], ['media', 'Page du registre']]},
        {name: 'Sépulture', icon: '🪦', description: 'Tombe, cimetière, concession.', repeatable: 1, fields: [['place', 'Cimetière'], ['text', 'Carré, allée, numéro'], ['text', 'Concession'], ['longtext', 'Inscription'], ['person', 'Inhumé avec'], ['media', 'Photos de la tombe'], ['map', 'Carte']]},
        {name: 'Objet de famille', icon: '🏺', description: 'Un objet transmis.', repeatable: 1, fields: [['text', 'Objet'], ['text', 'Nature'], ['longtext', 'Histoire'], ['person', 'Le garde aujourd’hui'], ['place', 'Où il se trouve'], ['media', 'Photos']]},
        {name: 'Mémoire familiale', icon: '📖', description: 'Recettes, expressions, chansons, surnoms.', repeatable: 1, fields: [['select', 'Sorte', ['recette', 'expression', 'chanson', 'surnom', 'tradition', 'anecdote']], ['text', 'Titre'], ['longtext', 'Texte'], ['person', 'Transmis par'], ['media', 'Enregistrement, photo']]},
        {name: 'Recensement', icon: '🏠', description: 'Une ligne de recensement.', repeatable: 1, fields: [['text', 'Année'], ['place', 'Commune'], ['text', 'Adresse, quartier'], ['text', 'Rang dans le ménage'], ['person_info', 'Métier'], ['url', 'Lien vers la page'], ['media', 'Page du recensement']]},
    ];
    const newField = (type, label, options) => ({key: 'f' + Math.random().toString(36).slice(2, 8), type, label: label || (type === 'person_info' ? INFOS[0][1] : typeInfo(type)[2]), help: '', options: type === 'select' ? (options?.length ? [...options] : ['Choix 1', 'Choix 2']) : [], info: type === 'person_info' ? (INFOS.find(i => i[1] === label || i[1].startsWith(label))?.[0] || {Métier: 'occupation', Parents: 'parents'}[label] || 'birth') : 'birth', from: 'self', accept: 'all', required: false, ...(type === 'journey' ? {jSource: 'manual', jLayout: 'vertical', jOrder: 'date', jMap: true, jDays: true, jWithPlace: false} : {})});
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
        ws.querySelector('[data-h-be-new]').addEventListener('click', () => chooseTemplate(token, blocks));
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
    function chooseTemplate(token, mine = []) {
        const btn = (t, attr, sub) => `<button type="button" class="h-template" ${attr}><span>${esc(t.icon || '🧩')}</span><strong>${esc(t.name)}</strong><small>${esc(sub)}</small></button>`;
        dialog({
            eyebrow: 'NOUVEAU BLOC', title: 'Par quoi commencer ?', wide: true,
            body: `<h4>Modèles</h4><div class="h-templates">${TEMPLATES.map((t, i) => btn(t, `data-h-tpl="${i}"`, t.fields.map(f => f[1]).join(', '))).join('')}</div>
                <h4>Partir d’un bloc de l’app</h4><p class="muted">Ses champs sont repris dans un bloc à toi, que tu modifies comme tu veux (le bloc de l’app ne change pas).</p>
                <h5>Blocs de la fiche</h5><div class="h-templates">${APP_BLOCK_TEMPLATES.map((t, i) => t.group === 'fiche' ? btn(t, `data-h-tpl-app="${i}"`, t.fields.map(f => f[1]).join(', ')) : '').join('')}</div>
                <h5>Patrimoine, histoire, documents</h5><div class="h-templates">${APP_BLOCK_TEMPLATES.map((t, i) => t.group !== 'fiche' ? btn(t, `data-h-tpl-app="${i}"`, t.fields.map(f => f[1]).join(', ')) : '').join('')}</div>
                ${mine.length ? `<h4>Partir d’un de mes blocs</h4><div class="h-templates">${mine.map(b => btn(b, `data-h-tpl-mine="${b.id}"`, b.fields.map(f => fieldLabel(f, b.fields)).join(', '))).join('')}</div>` : ''}`,
            onOpen: d => {
                const start = (t, name, fields) => { editorDef = {id: 0, name, icon: t.icon, description: t.description || '', repeatable: t.repeatable ?? 1, display: 'flag', labels: 1, author: ls('lcnda-act-requester'), fields}; d.close(); renderBlockEditor(++S().workspaceToken); };
                d.querySelectorAll('[data-h-tpl]').forEach(b => b.addEventListener('click', () => { const t = TEMPLATES[Number(b.dataset.hTpl)]; start(t, t.name === 'Bloc vide' ? '' : t.name, t.fields.map(([type, label]) => newField(type, label))); }));
                d.querySelectorAll('[data-h-tpl-app]').forEach(b => b.addEventListener('click', () => { const t = APP_BLOCK_TEMPLATES[Number(b.dataset.hTplApp)]; start(t, t.name + ' (mon bloc)', t.fields.map(([type, label, options]) => newField(type, label, options))); }));
                d.querySelectorAll('[data-h-tpl-mine]').forEach(b => b.addEventListener('click', () => {
                    const t = mine.find(x => Number(x.id) === Number(b.dataset.hTplMine)); if (!t) return;
                    // Nouvelles clés pour les champs, mais les « infos tirées d'une fiche » gardent leur lien vers le bon champ personne
                    const keys = {}; const fields = JSON.parse(JSON.stringify(t.fields)).map(f => { const k = 'f' + Math.random().toString(36).slice(2, 8); keys[f.key] = k; return {...f, key: k}; });
                    fields.forEach(f => { if (f.from && f.from !== 'self') f.from = keys[f.from] || 'self'; });
                    start(t, 'Copie de ' + t.name, fields);
                }));
            },
        });
    }
    const EMOJIS = {
        'Visages': '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 🫠 😉 😊 😇 🥰 😍 🤩 😘 😗 ☺️ 😚 😙 🥲 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🫢 🫣 🤫 🤔 🫡 🤐 🤨 😐 😑 😶 🫥 😶‍🌫️ 😏 😒 🙄 😬 😮‍💨 🤥 🫨 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 😵‍💫 🤯 🤠 🥳 🥸 😎 🤓 🧐 😕 🫤 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 🥹 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👹 👺 👻 👽 👾 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾 🙈 🙉 🙊 💌 💘 💝 💖 💗 💓 💞 💕 💟 ❣️ 💔 ❤️‍🔥 ❤️‍🩹 ❤️ 🩷 🧡 💛 💚 💙 🩵 💜 🤎 🖤 🩶 🤍 💋 💯 💢 💥 💫 💦 💨 🕳️ 💬 👁️‍🗨️ 🗨️ 🗯️ 💭 💤',
        'Personnes': '👋 👋🏻 👋🏼 👋🏽 👋🏾 👋🏿 🤚 🤚🏻 🤚🏼 🤚🏽 🤚🏾 🤚🏿 🖐️ 🖐🏻 🖐🏼 🖐🏽 🖐🏾 🖐🏿 ✋ ✋🏻 ✋🏼 ✋🏽 ✋🏾 ✋🏿 🖖 🖖🏻 🖖🏼 🖖🏽 🖖🏾 🖖🏿 🫱 🫱🏻 🫱🏼 🫱🏽 🫱🏾 🫱🏿 🫲 🫲🏻 🫲🏼 🫲🏽 🫲🏾 🫲🏿 🫳 🫳🏻 🫳🏼 🫳🏽 🫳🏾 🫳🏿 🫴 🫴🏻 🫴🏼 🫴🏽 🫴🏾 🫴🏿 🫷 🫷🏻 🫷🏼 🫷🏽 🫷🏾 🫷🏿 🫸 🫸🏻 🫸🏼 🫸🏽 🫸🏾 🫸🏿 👌 👌🏻 👌🏼 👌🏽 👌🏾 👌🏿 🤌 🤌🏻 🤌🏼 🤌🏽 🤌🏾 🤌🏿 🤏 🤏🏻 🤏🏼 🤏🏽 🤏🏾 🤏🏿 ✌️ ✌🏻 ✌🏼 ✌🏽 ✌🏾 ✌🏿 🤞 🤞🏻 🤞🏼 🤞🏽 🤞🏾 🤞🏿 🫰 🫰🏻 🫰🏼 🫰🏽 🫰🏾 🫰🏿 🤟 🤟🏻 🤟🏼 🤟🏽 🤟🏾 🤟🏿 🤘 🤘🏻 🤘🏼 🤘🏽 🤘🏾 🤘🏿 🤙 🤙🏻 🤙🏼 🤙🏽 🤙🏾 🤙🏿 👈 👈🏻 👈🏼 👈🏽 👈🏾 👈🏿 👉 👉🏻 👉🏼 👉🏽 👉🏾 👉🏿 👆 👆🏻 👆🏼 👆🏽 👆🏾 👆🏿 🖕 🖕🏻 🖕🏼 🖕🏽 🖕🏾 🖕🏿 👇 👇🏻 👇🏼 👇🏽 👇🏾 👇🏿 ☝️ ☝🏻 ☝🏼 ☝🏽 ☝🏾 ☝🏿 🫵 🫵🏻 🫵🏼 🫵🏽 🫵🏾 🫵🏿 👍 👍🏻 👍🏼 👍🏽 👍🏾 👍🏿 👎 👎🏻 👎🏼 👎🏽 👎🏾 👎🏿 ✊ ✊🏻 ✊🏼 ✊🏽 ✊🏾 ✊🏿 👊 👊🏻 👊🏼 👊🏽 👊🏾 👊🏿 🤛 🤛🏻 🤛🏼 🤛🏽 🤛🏾 🤛🏿 🤜 🤜🏻 🤜🏼 🤜🏽 🤜🏾 🤜🏿 👏 👏🏻 👏🏼 👏🏽 👏🏾 👏🏿 🙌 🙌🏻 🙌🏼 🙌🏽 🙌🏾 🙌🏿 🫶 🫶🏻 🫶🏼 🫶🏽 🫶🏾 🫶🏿 👐 👐🏻 👐🏼 👐🏽 👐🏾 👐🏿 🤲 🤲🏻 🤲🏼 🤲🏽 🤲🏾 🤲🏿 🤝 🙏 🙏🏻 🙏🏼 🙏🏽 🙏🏾 🙏🏿 ✍️ ✍🏻 ✍🏼 ✍🏽 ✍🏾 ✍🏿 💅 💅🏻 💅🏼 💅🏽 💅🏾 💅🏿 🤳 🤳🏻 🤳🏼 🤳🏽 🤳🏾 🤳🏿 💪 💪🏻 💪🏼 💪🏽 💪🏾 💪🏿 🦾 🦿 🦵 🦵🏻 🦵🏼 🦵🏽 🦵🏾 🦵🏿 🦶 🦶🏻 🦶🏼 🦶🏽 🦶🏾 🦶🏿 👂 👂🏻 👂🏼 👂🏽 👂🏾 👂🏿 🦻 🦻🏻 🦻🏼 🦻🏽 🦻🏾 🦻🏿 👃 👃🏻 👃🏼 👃🏽 👃🏾 👃🏿 🧠 🫀 🫁 🦷 🦴 👀 👁️ 👅 👄 🫦 👶 👶🏻 👶🏼 👶🏽 👶🏾 👶🏿 🧒 🧒🏻 🧒🏼 🧒🏽 🧒🏾 🧒🏿 👦 👦🏻 👦🏼 👦🏽 👦🏾 👦🏿 👧 👧🏻 👧🏼 👧🏽 👧🏾 👧🏿 🧑 🧑🏻 🧑🏼 🧑🏽 🧑🏾 🧑🏿 👱 👱🏻 👱🏼 👱🏽 👱🏾 👱🏿 👨 👨🏻 👨🏼 👨🏽 👨🏾 👨🏿 🧔 🧔🏻 🧔🏼 🧔🏽 🧔🏾 🧔🏿 🧔‍♂️ 🧔🏻‍♂️ 🧔🏼‍♂️ 🧔🏽‍♂️ 🧔🏾‍♂️ 🧔🏿‍♂️ 🧔‍♀️ 🧔🏻‍♀️ 🧔🏼‍♀️ 🧔🏽‍♀️ 🧔🏾‍♀️ 🧔🏿‍♀️ 👨‍🦰 👨🏻‍🦰 👨🏼‍🦰 👨🏽‍🦰 👨🏾‍🦰 👨🏿‍🦰 👨‍🦱 👨🏻‍🦱 👨🏼‍🦱 👨🏽‍🦱 👨🏾‍🦱 👨🏿‍🦱 👨‍🦳 👨🏻‍🦳 👨🏼‍🦳 👨🏽‍🦳 👨🏾‍🦳 👨🏿‍🦳 👨‍🦲 👨🏻‍🦲 👨🏼‍🦲 👨🏽‍🦲 👨🏾‍🦲 👨🏿‍🦲 👩 👩🏻 👩🏼 👩🏽 👩🏾 👩🏿 👩‍🦰 👩🏻‍🦰 👩🏼‍🦰 👩🏽‍🦰 👩🏾‍🦰 👩🏿‍🦰 🧑‍🦰 🧑🏻‍🦰 🧑🏼‍🦰 🧑🏽‍🦰 🧑🏾‍🦰 🧑🏿‍🦰 👩‍🦱 👩🏻‍🦱 👩🏼‍🦱 👩🏽‍🦱 👩🏾‍🦱 👩🏿‍🦱 🧑‍🦱 🧑🏻‍🦱 🧑🏼‍🦱 🧑🏽‍🦱 🧑🏾‍🦱 🧑🏿‍🦱 👩‍🦳 👩🏻‍🦳 👩🏼‍🦳 👩🏽‍🦳 👩🏾‍🦳 👩🏿‍🦳 🧑‍🦳 🧑🏻‍🦳 🧑🏼‍🦳 🧑🏽‍🦳 🧑🏾‍🦳 🧑🏿‍🦳 👩‍🦲 👩🏻‍🦲 👩🏼‍🦲 👩🏽‍🦲 👩🏾‍🦲 👩🏿‍🦲 🧑‍🦲 🧑🏻‍🦲 🧑🏼‍🦲 🧑🏽‍🦲 🧑🏾‍🦲 🧑🏿‍🦲 👱‍♀️ 👱🏻‍♀️ 👱🏼‍♀️ 👱🏽‍♀️ 👱🏾‍♀️ 👱🏿‍♀️ 👱‍♂️ 👱🏻‍♂️ 👱🏼‍♂️ 👱🏽‍♂️ 👱🏾‍♂️ 👱🏿‍♂️ 🧓 🧓🏻 🧓🏼 🧓🏽 🧓🏾 🧓🏿 👴 👴🏻 👴🏼 👴🏽 👴🏾 👴🏿 👵 👵🏻 👵🏼 👵🏽 👵🏾 👵🏿 🙍 🙍🏻 🙍🏼 🙍🏽 🙍🏾 🙍🏿 🙍‍♂️ 🙍🏻‍♂️ 🙍🏼‍♂️ 🙍🏽‍♂️ 🙍🏾‍♂️ 🙍🏿‍♂️ 🙍‍♀️ 🙍🏻‍♀️ 🙍🏼‍♀️ 🙍🏽‍♀️ 🙍🏾‍♀️ 🙍🏿‍♀️ 🙎 🙎🏻 🙎🏼 🙎🏽 🙎🏾 🙎🏿 🙎‍♂️ 🙎🏻‍♂️ 🙎🏼‍♂️ 🙎🏽‍♂️ 🙎🏾‍♂️ 🙎🏿‍♂️ 🙎‍♀️ 🙎🏻‍♀️ 🙎🏼‍♀️ 🙎🏽‍♀️ 🙎🏾‍♀️ 🙎🏿‍♀️ 🙅 🙅🏻 🙅🏼 🙅🏽 🙅🏾 🙅🏿 🙅‍♂️ 🙅🏻‍♂️ 🙅🏼‍♂️ 🙅🏽‍♂️ 🙅🏾‍♂️ 🙅🏿‍♂️ 🙅‍♀️ 🙅🏻‍♀️ 🙅🏼‍♀️ 🙅🏽‍♀️ 🙅🏾‍♀️ 🙅🏿‍♀️ 🙆 🙆🏻 🙆🏼 🙆🏽 🙆🏾 🙆🏿 🙆‍♂️ 🙆🏻‍♂️ 🙆🏼‍♂️ 🙆🏽‍♂️ 🙆🏾‍♂️ 🙆🏿‍♂️ 🙆‍♀️ 🙆🏻‍♀️ 🙆🏼‍♀️ 🙆🏽‍♀️ 🙆🏾‍♀️ 🙆🏿‍♀️ 💁 💁🏻 💁🏼 💁🏽 💁🏾 💁🏿 💁‍♂️ 💁🏻‍♂️ 💁🏼‍♂️ 💁🏽‍♂️ 💁🏾‍♂️ 💁🏿‍♂️ 💁‍♀️ 💁🏻‍♀️ 💁🏼‍♀️ 💁🏽‍♀️ 💁🏾‍♀️ 💁🏿‍♀️ 🙋 🙋🏻 🙋🏼 🙋🏽 🙋🏾 🙋🏿 🙋‍♂️ 🙋🏻‍♂️ 🙋🏼‍♂️ 🙋🏽‍♂️ 🙋🏾‍♂️ 🙋🏿‍♂️ 🙋‍♀️ 🙋🏻‍♀️ 🙋🏼‍♀️ 🙋🏽‍♀️ 🙋🏾‍♀️ 🙋🏿‍♀️ 🧏 🧏🏻 🧏🏼 🧏🏽 🧏🏾 🧏🏿 🧏‍♂️ 🧏🏻‍♂️ 🧏🏼‍♂️ 🧏🏽‍♂️ 🧏🏾‍♂️ 🧏🏿‍♂️ 🧏‍♀️ 🧏🏻‍♀️ 🧏🏼‍♀️ 🧏🏽‍♀️ 🧏🏾‍♀️ 🧏🏿‍♀️ 🙇 🙇🏻 🙇🏼 🙇🏽 🙇🏾 🙇🏿 🙇‍♂️ 🙇🏻‍♂️ 🙇🏼‍♂️ 🙇🏽‍♂️ 🙇🏾‍♂️ 🙇🏿‍♂️ 🙇‍♀️ 🙇🏻‍♀️ 🙇🏼‍♀️ 🙇🏽‍♀️ 🙇🏾‍♀️ 🙇🏿‍♀️ 🤦 🤦🏻 🤦🏼 🤦🏽 🤦🏾 🤦🏿 🤦‍♂️ 🤦🏻‍♂️ 🤦🏼‍♂️ 🤦🏽‍♂️ 🤦🏾‍♂️ 🤦🏿‍♂️ 🤦‍♀️ 🤦🏻‍♀️ 🤦🏼‍♀️ 🤦🏽‍♀️ 🤦🏾‍♀️ 🤦🏿‍♀️ 🤷 🤷🏻 🤷🏼 🤷🏽 🤷🏾 🤷🏿 🤷‍♂️ 🤷🏻‍♂️ 🤷🏼‍♂️ 🤷🏽‍♂️ 🤷🏾‍♂️ 🤷🏿‍♂️ 🤷‍♀️ 🤷🏻‍♀️ 🤷🏼‍♀️ 🤷🏽‍♀️ 🤷🏾‍♀️ 🤷🏿‍♀️ 🧑‍⚕️ 🧑🏻‍⚕️ 🧑🏼‍⚕️ 🧑🏽‍⚕️ 🧑🏾‍⚕️ 🧑🏿‍⚕️ 👨‍⚕️ 👨🏻‍⚕️ 👨🏼‍⚕️ 👨🏽‍⚕️ 👨🏾‍⚕️ 👨🏿‍⚕️ 👩‍⚕️ 👩🏻‍⚕️ 👩🏼‍⚕️ 👩🏽‍⚕️ 👩🏾‍⚕️ 👩🏿‍⚕️ 🧑‍🎓 🧑🏻‍🎓 🧑🏼‍🎓 🧑🏽‍🎓 🧑🏾‍🎓 🧑🏿‍🎓 👨‍🎓 👨🏻‍🎓 👨🏼‍🎓 👨🏽‍🎓 👨🏾‍🎓 👨🏿‍🎓 👩‍🎓 👩🏻‍🎓 👩🏼‍🎓 👩🏽‍🎓 👩🏾‍🎓 👩🏿‍🎓 🧑‍🏫 🧑🏻‍🏫 🧑🏼‍🏫 🧑🏽‍🏫 🧑🏾‍🏫 🧑🏿‍🏫 👨‍🏫 👨🏻‍🏫 👨🏼‍🏫 👨🏽‍🏫 👨🏾‍🏫 👨🏿‍🏫 👩‍🏫 👩🏻‍🏫 👩🏼‍🏫 👩🏽‍🏫 👩🏾‍🏫 👩🏿‍🏫 🧑‍⚖️ 🧑🏻‍⚖️ 🧑🏼‍⚖️ 🧑🏽‍⚖️ 🧑🏾‍⚖️ 🧑🏿‍⚖️ 👨‍⚖️ 👨🏻‍⚖️ 👨🏼‍⚖️ 👨🏽‍⚖️ 👨🏾‍⚖️ 👨🏿‍⚖️ 👩‍⚖️ 👩🏻‍⚖️ 👩🏼‍⚖️ 👩🏽‍⚖️ 👩🏾‍⚖️ 👩🏿‍⚖️ 🧑‍🌾 🧑🏻‍🌾 🧑🏼‍🌾 🧑🏽‍🌾 🧑🏾‍🌾 🧑🏿‍🌾 👨‍🌾 👨🏻‍🌾 👨🏼‍🌾 👨🏽‍🌾 👨🏾‍🌾 👨🏿‍🌾 👩‍🌾 👩🏻‍🌾 👩🏼‍🌾 👩🏽‍🌾 👩🏾‍🌾 👩🏿‍🌾 🧑‍🍳 🧑🏻‍🍳 🧑🏼‍🍳 🧑🏽‍🍳 🧑🏾‍🍳 🧑🏿‍🍳 👨‍🍳 👨🏻‍🍳 👨🏼‍🍳 👨🏽‍🍳 👨🏾‍🍳 👨🏿‍🍳 👩‍🍳 👩🏻‍🍳 👩🏼‍🍳 👩🏽‍🍳 👩🏾‍🍳 👩🏿‍🍳 🧑‍🔧 🧑🏻‍🔧 🧑🏼‍🔧 🧑🏽‍🔧 🧑🏾‍🔧 🧑🏿‍🔧 👨‍🔧 👨🏻‍🔧 👨🏼‍🔧 👨🏽‍🔧 👨🏾‍🔧 👨🏿‍🔧 👩‍🔧 👩🏻‍🔧 👩🏼‍🔧 👩🏽‍🔧 👩🏾‍🔧 👩🏿‍🔧 🧑‍🏭 🧑🏻‍🏭 🧑🏼‍🏭 🧑🏽‍🏭 🧑🏾‍🏭 🧑🏿‍🏭 👨‍🏭 👨🏻‍🏭 👨🏼‍🏭 👨🏽‍🏭 👨🏾‍🏭 👨🏿‍🏭 👩‍🏭 👩🏻‍🏭 👩🏼‍🏭 👩🏽‍🏭 👩🏾‍🏭 👩🏿‍🏭 🧑‍💼 🧑🏻‍💼 🧑🏼‍💼 🧑🏽‍💼 🧑🏾‍💼 🧑🏿‍💼 👨‍💼 👨🏻‍💼 👨🏼‍💼 👨🏽‍💼 👨🏾‍💼 👨🏿‍💼 👩‍💼 👩🏻‍💼 👩🏼‍💼 👩🏽‍💼 👩🏾‍💼 👩🏿‍💼 🧑‍🔬 🧑🏻‍🔬 🧑🏼‍🔬 🧑🏽‍🔬 🧑🏾‍🔬 🧑🏿‍🔬 👨‍🔬 👨🏻‍🔬 👨🏼‍🔬 👨🏽‍🔬 👨🏾‍🔬 👨🏿‍🔬 👩‍🔬 👩🏻‍🔬 👩🏼‍🔬 👩🏽‍🔬 👩🏾‍🔬 👩🏿‍🔬 🧑‍💻 🧑🏻‍💻 🧑🏼‍💻 🧑🏽‍💻 🧑🏾‍💻 🧑🏿‍💻 👨‍💻 👨🏻‍💻 👨🏼‍💻 👨🏽‍💻 👨🏾‍💻 👨🏿‍💻 👩‍💻 👩🏻‍💻 👩🏼‍💻 👩🏽‍💻 👩🏾‍💻 👩🏿‍💻 🧑‍🎤 🧑🏻‍🎤 🧑🏼‍🎤 🧑🏽‍🎤 🧑🏾‍🎤 🧑🏿‍🎤 👨‍🎤 👨🏻‍🎤 👨🏼‍🎤 👨🏽‍🎤 👨🏾‍🎤 👨🏿‍🎤 👩‍🎤 👩🏻‍🎤 👩🏼‍🎤 👩🏽‍🎤 👩🏾‍🎤 👩🏿‍🎤 🧑‍🎨 🧑🏻‍🎨 🧑🏼‍🎨 🧑🏽‍🎨 🧑🏾‍🎨 🧑🏿‍🎨 👨‍🎨 👨🏻‍🎨 👨🏼‍🎨 👨🏽‍🎨 👨🏾‍🎨 👨🏿‍🎨 👩‍🎨 👩🏻‍🎨 👩🏼‍🎨 👩🏽‍🎨 👩🏾‍🎨 👩🏿‍🎨 🧑‍✈️ 🧑🏻‍✈️ 🧑🏼‍✈️ 🧑🏽‍✈️ 🧑🏾‍✈️ 🧑🏿‍✈️ 👨‍✈️ 👨🏻‍✈️ 👨🏼‍✈️ 👨🏽‍✈️ 👨🏾‍✈️ 👨🏿‍✈️ 👩‍✈️ 👩🏻‍✈️ 👩🏼‍✈️ 👩🏽‍✈️ 👩🏾‍✈️ 👩🏿‍✈️ 🧑‍🚀 🧑🏻‍🚀 🧑🏼‍🚀 🧑🏽‍🚀 🧑🏾‍🚀 🧑🏿‍🚀 👨‍🚀 👨🏻‍🚀 👨🏼‍🚀 👨🏽‍🚀 👨🏾‍🚀 👨🏿‍🚀 👩‍🚀 👩🏻‍🚀 👩🏼‍🚀 👩🏽‍🚀 👩🏾‍🚀 👩🏿‍🚀 🧑‍🚒 🧑🏻‍🚒 🧑🏼‍🚒 🧑🏽‍🚒 🧑🏾‍🚒 🧑🏿‍🚒 👨‍🚒 👨🏻‍🚒 👨🏼‍🚒 👨🏽‍🚒 👨🏾‍🚒 👨🏿‍🚒 👩‍🚒 👩🏻‍🚒 👩🏼‍🚒 👩🏽‍🚒 👩🏾‍🚒 👩🏿‍🚒 👮 👮🏻 👮🏼 👮🏽 👮🏾 👮🏿 👮‍♂️ 👮🏻‍♂️ 👮🏼‍♂️ 👮🏽‍♂️ 👮🏾‍♂️ 👮🏿‍♂️ 👮‍♀️ 👮🏻‍♀️ 👮🏼‍♀️ 👮🏽‍♀️ 👮🏾‍♀️ 👮🏿‍♀️ 🕵️ 🕵🏻 🕵🏼 🕵🏽 🕵🏾 🕵🏿 🕵️‍♂️ 🕵🏻‍♂️ 🕵🏼‍♂️ 🕵🏽‍♂️ 🕵🏾‍♂️ 🕵🏿‍♂️ 🕵️‍♀️ 🕵🏻‍♀️ 🕵🏼‍♀️ 🕵🏽‍♀️ 🕵🏾‍♀️ 🕵🏿‍♀️ 💂 💂🏻 💂🏼 💂🏽 💂🏾 💂🏿 💂‍♂️ 💂🏻‍♂️ 💂🏼‍♂️ 💂🏽‍♂️ 💂🏾‍♂️ 💂🏿‍♂️ 💂‍♀️ 💂🏻‍♀️ 💂🏼‍♀️ 💂🏽‍♀️ 💂🏾‍♀️ 💂🏿‍♀️ 🥷 🥷🏻 🥷🏼 🥷🏽 🥷🏾 🥷🏿 👷 👷🏻 👷🏼 👷🏽 👷🏾 👷🏿 👷‍♂️ 👷🏻‍♂️ 👷🏼‍♂️ 👷🏽‍♂️ 👷🏾‍♂️ 👷🏿‍♂️ 👷‍♀️ 👷🏻‍♀️ 👷🏼‍♀️ 👷🏽‍♀️ 👷🏾‍♀️ 👷🏿‍♀️ 🫅 🫅🏻 🫅🏼 🫅🏽 🫅🏾 🫅🏿 🤴 🤴🏻 🤴🏼 🤴🏽 🤴🏾 🤴🏿 👸 👸🏻 👸🏼 👸🏽 👸🏾 👸🏿 👳 👳🏻 👳🏼 👳🏽 👳🏾 👳🏿 👳‍♂️ 👳🏻‍♂️ 👳🏼‍♂️ 👳🏽‍♂️ 👳🏾‍♂️ 👳🏿‍♂️ 👳‍♀️ 👳🏻‍♀️ 👳🏼‍♀️ 👳🏽‍♀️ 👳🏾‍♀️ 👳🏿‍♀️ 👲 👲🏻 👲🏼 👲🏽 👲🏾 👲🏿 🧕 🧕🏻 🧕🏼 🧕🏽 🧕🏾 🧕🏿 🤵 🤵🏻 🤵🏼 🤵🏽 🤵🏾 🤵🏿 🤵‍♂️ 🤵🏻‍♂️ 🤵🏼‍♂️ 🤵🏽‍♂️ 🤵🏾‍♂️ 🤵🏿‍♂️ 🤵‍♀️ 🤵🏻‍♀️ 🤵🏼‍♀️ 🤵🏽‍♀️ 🤵🏾‍♀️ 🤵🏿‍♀️ 👰 👰🏻 👰🏼 👰🏽 👰🏾 👰🏿 👰‍♂️ 👰🏻‍♂️ 👰🏼‍♂️ 👰🏽‍♂️ 👰🏾‍♂️ 👰🏿‍♂️ 👰‍♀️ 👰🏻‍♀️ 👰🏼‍♀️ 👰🏽‍♀️ 👰🏾‍♀️ 👰🏿‍♀️ 🤰 🤰🏻 🤰🏼 🤰🏽 🤰🏾 🤰🏿 🫃 🫃🏻 🫃🏼 🫃🏽 🫃🏾 🫃🏿 🫄 🫄🏻 🫄🏼 🫄🏽 🫄🏾 🫄🏿 🤱 🤱🏻 🤱🏼 🤱🏽 🤱🏾 🤱🏿 👩‍🍼 👩🏻‍🍼 👩🏼‍🍼 👩🏽‍🍼 👩🏾‍🍼 👩🏿‍🍼 👨‍🍼 👨🏻‍🍼 👨🏼‍🍼 👨🏽‍🍼 👨🏾‍🍼 👨🏿‍🍼 🧑‍🍼 🧑🏻‍🍼 🧑🏼‍🍼 🧑🏽‍🍼 🧑🏾‍🍼 🧑🏿‍🍼 👼 👼🏻 👼🏼 👼🏽 👼🏾 👼🏿 🎅 🎅🏻 🎅🏼 🎅🏽 🎅🏾 🎅🏿 🤶 🤶🏻 🤶🏼 🤶🏽 🤶🏾 🤶🏿 🧑‍🎄 🧑🏻‍🎄 🧑🏼‍🎄 🧑🏽‍🎄 🧑🏾‍🎄 🧑🏿‍🎄 🦸 🦸🏻 🦸🏼 🦸🏽 🦸🏾 🦸🏿 🦸‍♂️ 🦸🏻‍♂️ 🦸🏼‍♂️ 🦸🏽‍♂️ 🦸🏾‍♂️ 🦸🏿‍♂️ 🦸‍♀️ 🦸🏻‍♀️ 🦸🏼‍♀️ 🦸🏽‍♀️ 🦸🏾‍♀️ 🦸🏿‍♀️ 🦹 🦹🏻 🦹🏼 🦹🏽 🦹🏾 🦹🏿 🦹‍♂️ 🦹🏻‍♂️ 🦹🏼‍♂️ 🦹🏽‍♂️ 🦹🏾‍♂️ 🦹🏿‍♂️ 🦹‍♀️ 🦹🏻‍♀️ 🦹🏼‍♀️ 🦹🏽‍♀️ 🦹🏾‍♀️ 🦹🏿‍♀️ 🧙 🧙🏻 🧙🏼 🧙🏽 🧙🏾 🧙🏿 🧙‍♂️ 🧙🏻‍♂️ 🧙🏼‍♂️ 🧙🏽‍♂️ 🧙🏾‍♂️ 🧙🏿‍♂️ 🧙‍♀️ 🧙🏻‍♀️ 🧙🏼‍♀️ 🧙🏽‍♀️ 🧙🏾‍♀️ 🧙🏿‍♀️ 🧚 🧚🏻 🧚🏼 🧚🏽 🧚🏾 🧚🏿 🧚‍♂️ 🧚🏻‍♂️ 🧚🏼‍♂️ 🧚🏽‍♂️ 🧚🏾‍♂️ 🧚🏿‍♂️ 🧚‍♀️ 🧚🏻‍♀️ 🧚🏼‍♀️ 🧚🏽‍♀️ 🧚🏾‍♀️ 🧚🏿‍♀️ 🧛 🧛🏻 🧛🏼 🧛🏽 🧛🏾 🧛🏿 🧛‍♂️ 🧛🏻‍♂️ 🧛🏼‍♂️ 🧛🏽‍♂️ 🧛🏾‍♂️ 🧛🏿‍♂️ 🧛‍♀️ 🧛🏻‍♀️ 🧛🏼‍♀️ 🧛🏽‍♀️ 🧛🏾‍♀️ 🧛🏿‍♀️ 🧜 🧜🏻 🧜🏼 🧜🏽 🧜🏾 🧜🏿 🧜‍♂️ 🧜🏻‍♂️ 🧜🏼‍♂️ 🧜🏽‍♂️ 🧜🏾‍♂️ 🧜🏿‍♂️ 🧜‍♀️ 🧜🏻‍♀️ 🧜🏼‍♀️ 🧜🏽‍♀️ 🧜🏾‍♀️ 🧜🏿‍♀️ 🧝 🧝🏻 🧝🏼 🧝🏽 🧝🏾 🧝🏿 🧝‍♂️ 🧝🏻‍♂️ 🧝🏼‍♂️ 🧝🏽‍♂️ 🧝🏾‍♂️ 🧝🏿‍♂️ 🧝‍♀️ 🧝🏻‍♀️ 🧝🏼‍♀️ 🧝🏽‍♀️ 🧝🏾‍♀️ 🧝🏿‍♀️ 🧞 🧞‍♂️ 🧞‍♀️ 🧟 🧟‍♂️ 🧟‍♀️ 🧌 💆 💆🏻 💆🏼 💆🏽 💆🏾 💆🏿 💆‍♂️ 💆🏻‍♂️ 💆🏼‍♂️ 💆🏽‍♂️ 💆🏾‍♂️ 💆🏿‍♂️ 💆‍♀️ 💆🏻‍♀️ 💆🏼‍♀️ 💆🏽‍♀️ 💆🏾‍♀️ 💆🏿‍♀️ 💇 💇🏻 💇🏼 💇🏽 💇🏾 💇🏿 💇‍♂️ 💇🏻‍♂️ 💇🏼‍♂️ 💇🏽‍♂️ 💇🏾‍♂️ 💇🏿‍♂️ 💇‍♀️ 💇🏻‍♀️ 💇🏼‍♀️ 💇🏽‍♀️ 💇🏾‍♀️ 💇🏿‍♀️ 🚶 🚶🏻 🚶🏼 🚶🏽 🚶🏾 🚶🏿 🚶‍♂️ 🚶🏻‍♂️ 🚶🏼‍♂️ 🚶🏽‍♂️ 🚶🏾‍♂️ 🚶🏿‍♂️ 🚶‍♀️ 🚶🏻‍♀️ 🚶🏼‍♀️ 🚶🏽‍♀️ 🚶🏾‍♀️ 🚶🏿‍♀️ 🧍 🧍🏻 🧍🏼 🧍🏽 🧍🏾 🧍🏿 🧍‍♂️ 🧍🏻‍♂️ 🧍🏼‍♂️ 🧍🏽‍♂️ 🧍🏾‍♂️ 🧍🏿‍♂️ 🧍‍♀️ 🧍🏻‍♀️ 🧍🏼‍♀️ 🧍🏽‍♀️ 🧍🏾‍♀️ 🧍🏿‍♀️ 🧎 🧎🏻 🧎🏼 🧎🏽 🧎🏾 🧎🏿 🧎‍♂️ 🧎🏻‍♂️ 🧎🏼‍♂️ 🧎🏽‍♂️ 🧎🏾‍♂️ 🧎🏿‍♂️ 🧎‍♀️ 🧎🏻‍♀️ 🧎🏼‍♀️ 🧎🏽‍♀️ 🧎🏾‍♀️ 🧎🏿‍♀️ 🧑‍🦯 🧑🏻‍🦯 🧑🏼‍🦯 🧑🏽‍🦯 🧑🏾‍🦯 🧑🏿‍🦯 👨‍🦯 👨🏻‍🦯 👨🏼‍🦯 👨🏽‍🦯 👨🏾‍🦯 👨🏿‍🦯 👩‍🦯 👩🏻‍🦯 👩🏼‍🦯 👩🏽‍🦯 👩🏾‍🦯 👩🏿‍🦯 🧑‍🦼 🧑🏻‍🦼 🧑🏼‍🦼 🧑🏽‍🦼 🧑🏾‍🦼 🧑🏿‍🦼 👨‍🦼 👨🏻‍🦼 👨🏼‍🦼 👨🏽‍🦼 👨🏾‍🦼 👨🏿‍🦼 👩‍🦼 👩🏻‍🦼 👩🏼‍🦼 👩🏽‍🦼 👩🏾‍🦼 👩🏿‍🦼 🧑‍🦽 🧑🏻‍🦽 🧑🏼‍🦽 🧑🏽‍🦽 🧑🏾‍🦽 🧑🏿‍🦽 👨‍🦽 👨🏻‍🦽 👨🏼‍🦽 👨🏽‍🦽 👨🏾‍🦽 👨🏿‍🦽 👩‍🦽 👩🏻‍🦽 👩🏼‍🦽 👩🏽‍🦽 👩🏾‍🦽 👩🏿‍🦽 🏃 🏃🏻 🏃🏼 🏃🏽 🏃🏾 🏃🏿 🏃‍♂️ 🏃🏻‍♂️ 🏃🏼‍♂️ 🏃🏽‍♂️ 🏃🏾‍♂️ 🏃🏿‍♂️ 🏃‍♀️ 🏃🏻‍♀️ 🏃🏼‍♀️ 🏃🏽‍♀️ 🏃🏾‍♀️ 🏃🏿‍♀️ 💃 💃🏻 💃🏼 💃🏽 💃🏾 💃🏿 🕺 🕺🏻 🕺🏼 🕺🏽 🕺🏾 🕺🏿 🕴️ 🕴🏻 🕴🏼 🕴🏽 🕴🏾 🕴🏿 👯 👯‍♂️ 👯‍♀️ 🧖 🧖🏻 🧖🏼 🧖🏽 🧖🏾 🧖🏿 🧖‍♂️ 🧖🏻‍♂️ 🧖🏼‍♂️ 🧖🏽‍♂️ 🧖🏾‍♂️ 🧖🏿‍♂️ 🧖‍♀️ 🧖🏻‍♀️ 🧖🏼‍♀️ 🧖🏽‍♀️ 🧖🏾‍♀️ 🧖🏿‍♀️ 🧗 🧗🏻 🧗🏼 🧗🏽 🧗🏾 🧗🏿 🧗‍♂️ 🧗🏻‍♂️ 🧗🏼‍♂️ 🧗🏽‍♂️ 🧗🏾‍♂️ 🧗🏿‍♂️ 🧗‍♀️ 🧗🏻‍♀️ 🧗🏼‍♀️ 🧗🏽‍♀️ 🧗🏾‍♀️ 🧗🏿‍♀️ 🤺 🏇 🏇🏻 🏇🏼 🏇🏽 🏇🏾 🏇🏿 ⛷️ 🏂 🏂🏻 🏂🏼 🏂🏽 🏂🏾 🏂🏿 🏌️ 🏌🏻 🏌🏼 🏌🏽 🏌🏾 🏌🏿 🏌️‍♂️ 🏌🏻‍♂️ 🏌🏼‍♂️ 🏌🏽‍♂️ 🏌🏾‍♂️ 🏌🏿‍♂️ 🏌️‍♀️ 🏌🏻‍♀️ 🏌🏼‍♀️ 🏌🏽‍♀️ 🏌🏾‍♀️ 🏌🏿‍♀️ 🏄 🏄🏻 🏄🏼 🏄🏽 🏄🏾 🏄🏿 🏄‍♂️ 🏄🏻‍♂️ 🏄🏼‍♂️ 🏄🏽‍♂️ 🏄🏾‍♂️ 🏄🏿‍♂️ 🏄‍♀️ 🏄🏻‍♀️ 🏄🏼‍♀️ 🏄🏽‍♀️ 🏄🏾‍♀️ 🏄🏿‍♀️ 🚣 🚣🏻 🚣🏼 🚣🏽 🚣🏾 🚣🏿 🚣‍♂️ 🚣🏻‍♂️ 🚣🏼‍♂️ 🚣🏽‍♂️ 🚣🏾‍♂️ 🚣🏿‍♂️ 🚣‍♀️ 🚣🏻‍♀️ 🚣🏼‍♀️ 🚣🏽‍♀️ 🚣🏾‍♀️ 🚣🏿‍♀️ 🏊 🏊🏻 🏊🏼 🏊🏽 🏊🏾 🏊🏿 🏊‍♂️ 🏊🏻‍♂️ 🏊🏼‍♂️ 🏊🏽‍♂️ 🏊🏾‍♂️ 🏊🏿‍♂️ 🏊‍♀️ 🏊🏻‍♀️ 🏊🏼‍♀️ 🏊🏽‍♀️ 🏊🏾‍♀️ 🏊🏿‍♀️ ⛹️ ⛹🏻 ⛹🏼 ⛹🏽 ⛹🏾 ⛹🏿 ⛹️‍♂️ ⛹🏻‍♂️ ⛹🏼‍♂️ ⛹🏽‍♂️ ⛹🏾‍♂️ ⛹🏿‍♂️ ⛹️‍♀️ ⛹🏻‍♀️ ⛹🏼‍♀️ ⛹🏽‍♀️ ⛹🏾‍♀️ ⛹🏿‍♀️ 🏋️ 🏋🏻 🏋🏼 🏋🏽 🏋🏾 🏋🏿 🏋️‍♂️ 🏋🏻‍♂️ 🏋🏼‍♂️ 🏋🏽‍♂️ 🏋🏾‍♂️ 🏋🏿‍♂️ 🏋️‍♀️ 🏋🏻‍♀️ 🏋🏼‍♀️ 🏋🏽‍♀️ 🏋🏾‍♀️ 🏋🏿‍♀️ 🚴 🚴🏻 🚴🏼 🚴🏽 🚴🏾 🚴🏿 🚴‍♂️ 🚴🏻‍♂️ 🚴🏼‍♂️ 🚴🏽‍♂️ 🚴🏾‍♂️ 🚴🏿‍♂️ 🚴‍♀️ 🚴🏻‍♀️ 🚴🏼‍♀️ 🚴🏽‍♀️ 🚴🏾‍♀️ 🚴🏿‍♀️ 🚵 🚵🏻 🚵🏼 🚵🏽 🚵🏾 🚵🏿 🚵‍♂️ 🚵🏻‍♂️ 🚵🏼‍♂️ 🚵🏽‍♂️ 🚵🏾‍♂️ 🚵🏿‍♂️ 🚵‍♀️ 🚵🏻‍♀️ 🚵🏼‍♀️ 🚵🏽‍♀️ 🚵🏾‍♀️ 🚵🏿‍♀️ 🤸 🤸🏻 🤸🏼 🤸🏽 🤸🏾 🤸🏿 🤸‍♂️ 🤸🏻‍♂️ 🤸🏼‍♂️ 🤸🏽‍♂️ 🤸🏾‍♂️ 🤸🏿‍♂️ 🤸‍♀️ 🤸🏻‍♀️ 🤸🏼‍♀️ 🤸🏽‍♀️ 🤸🏾‍♀️ 🤸🏿‍♀️ 🤼 🤼‍♂️ 🤼‍♀️ 🤽 🤽🏻 🤽🏼 🤽🏽 🤽🏾 🤽🏿 🤽‍♂️ 🤽🏻‍♂️ 🤽🏼‍♂️ 🤽🏽‍♂️ 🤽🏾‍♂️ 🤽🏿‍♂️ 🤽‍♀️ 🤽🏻‍♀️ 🤽🏼‍♀️ 🤽🏽‍♀️ 🤽🏾‍♀️ 🤽🏿‍♀️ 🤾 🤾🏻 🤾🏼 🤾🏽 🤾🏾 🤾🏿 🤾‍♂️ 🤾🏻‍♂️ 🤾🏼‍♂️ 🤾🏽‍♂️ 🤾🏾‍♂️ 🤾🏿‍♂️ 🤾‍♀️ 🤾🏻‍♀️ 🤾🏼‍♀️ 🤾🏽‍♀️ 🤾🏾‍♀️ 🤾🏿‍♀️ 🤹 🤹🏻 🤹🏼 🤹🏽 🤹🏾 🤹🏿 🤹‍♂️ 🤹🏻‍♂️ 🤹🏼‍♂️ 🤹🏽‍♂️ 🤹🏾‍♂️ 🤹🏿‍♂️ 🤹‍♀️ 🤹🏻‍♀️ 🤹🏼‍♀️ 🤹🏽‍♀️ 🤹🏾‍♀️ 🤹🏿‍♀️ 🧘 🧘🏻 🧘🏼 🧘🏽 🧘🏾 🧘🏿 🧘‍♂️ 🧘🏻‍♂️ 🧘🏼‍♂️ 🧘🏽‍♂️ 🧘🏾‍♂️ 🧘🏿‍♂️ 🧘‍♀️ 🧘🏻‍♀️ 🧘🏼‍♀️ 🧘🏽‍♀️ 🧘🏾‍♀️ 🧘🏿‍♀️ 🛀 🛀🏻 🛀🏼 🛀🏽 🛀🏾 🛀🏿 🛌 🛌🏻 🛌🏼 🛌🏽 🛌🏾 🛌🏿 🧑‍🤝‍🧑 👭 👫 👬 💏 👩‍❤️‍💋‍👨 👨‍❤️‍💋‍👨 👩‍❤️‍💋‍👩 💑 👩‍❤️‍👨 👨‍❤️‍👨 👩‍❤️‍👩 👨‍👩‍👦 👨‍👩‍👧 👨‍👩‍👧‍👦 👨‍👩‍👦‍👦 👨‍👩‍👧‍👧 👨‍👨‍👦 👨‍👨‍👧 👨‍👨‍👧‍👦 👨‍👨‍👦‍👦 👨‍👨‍👧‍👧 👩‍👩‍👦 👩‍👩‍👧 👩‍👩‍👧‍👦 👩‍👩‍👦‍👦 👩‍👩‍👧‍👧 👨‍👦 👨‍👦‍👦 👨‍👧 👨‍👧‍👦 👨‍👧‍👧 👩‍👦 👩‍👦‍👦 👩‍👧 👩‍👧‍👦 👩‍👧‍👧 🗣️ 👤 👥 🫂 👪 👣',
        'Famille': '👪 👨‍👩‍👧‍👦 👨‍👩‍👧 👨‍👩‍👦‍👦 👨‍👩‍👧‍👧 👩‍👩‍👦 👨‍👨‍👧 👩‍👧 👩‍👦 👨‍👧 👨‍👦 👶 🧒 👧 👦 🧑 👩 👨 👵 👴 🧓 👱‍♀️ 👱 🧔 👩‍🦳 👨‍🦳 👩‍🦰 👨‍🦰 🤰 🤱 👩‍🍼 👨‍🍼 👰 🤵 💍 💒 💐 💌 💕 💞 💖 ❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 🫶 🤝 👫 👬 👭 💏 💑 🎂 🎁 🎉 🎊 🍼 🧸 🪆 👼 🕊️ ✝️ ⚰️ 🪦 🕯️ 🌹 🥀 🏠 📷 🖼️',
        'Maison et lieux': '🏡 🏠 🏘️ 🏚️ 🏗️ 🏰 🏯 ⛪ 🕌 🕍 🛕 ⛩️ 🏛️ 🏫 🏥 🏭 🏪 🏬 🏨 🏦 🏤 🏢 🗼 🗽 🌉 🌁 🏞️ ⛰️ 🏔️ 🗻 🌋 🏕️ 🏖️ 🏜️ 🏝️ 🌾 🌲 🌳 🌴 🌻 ⛲ ⛺ 🛖 🧱 🚪 🪟 🛏️ 🪑 🛁 🗺️ 🧭 📍 📌 🚩 🌍 🌎 🌏 🌐 🏙️ 🌆 🌃 🌄 🌅',
        'Métiers': '🧑‍🌾 👨‍🌾 👩‍🌾 🚜 🐄 🐑 🐴 🐓 🌾 🍇 🍷 🧑‍🍳 👨‍🍳 🍞 🥖 🥐 🧀 🥩 🐟 🧑‍🔧 🔨 🪚 🪓 ⚒️ 🛠️ ⛏️ 🪛 🔧 🔩 ⚙️ 🧱 🪵 🧑‍🏭 🏭 🧵 🪡 🧶 👗 👔 👞 👢 🎩 🧑‍⚕️ 👩‍⚕️ ⚕️ 💊 🩺 🧑‍🏫 👩‍🏫 🎓 📚 ✒️ 🧑‍⚖️ ⚖️ 🧑‍✈️ ✈️ ⚓ 🚢 🎣 🧑‍🚒 🚒 👮 💂 🕵️ 🧑‍🎨 🎨 🎭 🎻 🎹 🎺 🎷 🥁 🎤 📷 🖋️ 💼 💰 🏦 🧑‍💼 🧑‍🔬 🧑‍💻 🧑‍🚀 🧑‍🍼 💈 ✂️ 🕰️ ⌚ 💎 🛒 🧺 🪣 🛢️ ⛽ 🚂 🚚',
        'Guerre et mémoire': '🎖️ 🏅 🥇 🥈 🥉 🏆 🎗️ ⚔️ 🗡️ 🛡️ 🪖 🔫 💣 🧨 🏹 ✊ 🕊️ ✉️ 📯 🥁 🚂 🚃 ✈️ 🚁 ⚓ 🚢 🛳️ ⛓️ 🔒 🔓 🗝️ 🏳️ 🏴 🚩 🪦 ⚰️ 🕯️ 🌹 🥀 📜 📃 📰 🗞️ 🧭 🗺️ 🪧 ⛺ 🔥 💥',
        'Documents': '📜 📃 📄 📑 📋 🗂️ 📁 📂 🗃️ 🗄️ 🗒️ 🗓️ 📅 📆 📒 📓 📔 📕 📗 📘 📙 📚 📖 🔖 🏷️ ✉️ 📨 📩 📧 📮 📪 📫 📬 📭 📝 ✏️ 🖊️ 🖋️ ✒️ 🖌️ 🖍️ 📎 🖇️ 📏 📐 🔍 🔎 🧾 🪪 💳 📸 📷 📹 🎥 🎞️ 📽️ 🖼️ 🎙️ 📻 📺 📼 💾 💿 📀 🖨️ ⌨️ 💻 🖥️ 📱 ☎️ 📞 📠 🗳️ 🔏 🔐',
        'Voyages': '🚢 ⛵ 🛶 🚤 🛥️ ⚓ 🚂 🚃 🚄 🚅 🚋 🚌 🚎 🚐 🚕 🚗 🚙 🛻 🚲 🛵 🏍️ 🛺 🐎 🐪 ✈️ 🛩️ 🛫 🛬 🪂 🚁 🚀 🛸 🧳 🎒 👜 🗺️ 🧭 🌐 🏝️ 🗽 🗼 🏔️ 🛤️ 🚉 🛂 🛃 🛄 🛅 🎫 🏨 ⛽ 🚦 🛣️ 🌉',
        'Loisirs et santé': '⚽ 🏀 🏈 🏉 🎾 🏐 🏓 🏸 🥊 🚴 🏊 🏇 ⛷️ 🏂 🧗 🎣 🏹 ♟️ 🎲 🃏 🀄 🎯 🎳 🎮 🧩 🪁 🎪 🎠 🎡 🎢 🎭 🎬 📯 🎵 🎶 🎼 🎸 🪕 🪗 💃 🕺 🍾 🥂 🍻 🍽️ ☕ 🍰 🧁 🩺 💉 🩹 🩼 🦷 🦴 👓 🦯 🦽 ♿ 🏥 💤 🧘 🛀',
        'Nature et animaux': '🌸 🌼 🌷 🌹 🌺 💮 🪷 🍀 ☘️ 🍂 🍁 🌿 🌱 🌵 🌳 🌲 🌴 🌾 🍄 🌰 🍎 🍐 🍊 🍋 🍒 🍓 🍇 🍑 🥔 🥕 🌽 🧅 🧄 🐶 🐱 🐭 🐰 🦊 🐻 🐴 🐄 🐖 🐑 🐐 🐓 🦆 🦢 🦉 🐦 🕊️ 🦅 🐝 🐞 🦋 🐌 🐟 🐠 🦞 🦀 🐚 🐢 🐸 🦌 🐗 🐺 ☀️ 🌤️ ⛅ 🌧️ ⛈️ 🌩️ ❄️ ☃️ 🌨️ 🌬️ 🌈 🌙 ⭐ 🌟 🔥 💧 🌊',
        'Objets': '👓 🕶️ 🥽 🥼 🦺 👔 👕 👖 🧣 🧤 🧥 🧦 👗 👘 🥻 🩱 🩲 🩳 👙 👚 🪭 👛 👜 👝 🛍️ 🎒 🩴 👞 👟 🥾 🥿 👠 👡 🩰 👢 🪮 👑 👒 🎩 🎓 🧢 🪖 ⛑️ 📿 💄 💍 💎 🔇 🔈 🔉 🔊 📢 📣 📯 🔔 🔕 🎼 🎵 🎶 🎙️ 🎚️ 🎛️ 🎤 🎧 📻 🎷 🪗 🎸 🎹 🎺 🎻 🪕 🥁 🪘 🪇 🪈 📱 📲 ☎️ 📞 📟 📠 🔋 🪫 🔌 💻 🖥️ 🖨️ ⌨️ 🖱️ 🖲️ 💽 💾 💿 📀 🧮 🎥 🎞️ 📽️ 🎬 📺 📷 📸 📹 📼 🔍 🔎 🕯️ 💡 🔦 🏮 🪔 📔 📕 📖 📗 📘 📙 📚 📓 📒 📃 📜 📄 📰 🗞️ 📑 🔖 🏷️ 💰 🪙 💴 💵 💶 💷 💸 💳 🧾 💹 ✉️ 📧 📨 📩 📤 📥 📦 📫 📪 📬 📭 📮 🗳️ ✏️ ✒️ 🖋️ 🖊️ 🖌️ 🖍️ 📝 💼 📁 📂 🗂️ 📅 📆 🗒️ 🗓️ 📇 📈 📉 📊 📋 📌 📍 📎 🖇️ 📏 📐 ✂️ 🗃️ 🗄️ 🗑️ 🔒 🔓 🔏 🔐 🔑 🗝️ 🔨 🪓 ⛏️ ⚒️ 🛠️ 🗡️ ⚔️ 💣 🪃 🏹 🛡️ 🪚 🔧 🪛 🔩 ⚙️ 🗜️ ⚖️ 🦯 🔗 ⛓️ 🪝 🧰 🧲 🪜 ⚗️ 🧪 🧫 🧬 🔬 🔭 📡 💉 🩸 💊 🩹 🩼 🩺 🩻 🚪 🛗 🪞 🪟 🛏️ 🛋️ 🪑 🚽 🪠 🚿 🛁 🪤 🪒 🧴 🧷 🧹 🧺 🧻 🪣 🧼 🫧 🪥 🧽 🧯 🛒 🚬 ⚰️ 🪦 ⚱️ 🧿 🪬 🗿 🪧 🪪',
        'Symboles': '🏧 🚮 🚰 ♿ 🚹 🚺 🚻 🚼 🚾 🛂 🛃 🛄 🛅 ⚠️ 🚸 ⛔ 🚫 🚳 🚭 🚯 🚱 🚷 📵 🔞 ☢️ ☣️ ⬆️ ↗️ ➡️ ↘️ ⬇️ ↙️ ⬅️ ↖️ ↕️ ↔️ ↩️ ↪️ ⤴️ ⤵️ 🔃 🔄 🔙 🔚 🔛 🔜 🔝 🛐 ⚛️ 🕉️ ✡️ ☸️ ☯️ ✝️ ☦️ ☪️ ☮️ 🕎 🔯 🪯 ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ ⛎ 🔀 🔁 🔂 ▶️ ⏩ ⏭️ ⏯️ ◀️ ⏪ ⏮️ 🔼 ⏫ 🔽 ⏬ ⏸️ ⏹️ ⏺️ ⏏️ 🎦 🔅 🔆 📶 🛜 📳 📴 ♀️ ♂️ ⚧️ ✖️ ➕ ➖ ➗ 🟰 ♾️ ‼️ ⁉️ ❓ ❔ ❕ ❗ 〰️ 💱 💲 ⚕️ ♻️ ⚜️ 🔱 📛 🔰 ⭕ ✅ ☑️ ✔️ ❌ ❎ ➰ ➿ 〽️ ✳️ ✴️ ❇️ ©️ ®️ ™️ #️⃣ *️⃣ 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟 🔠 🔡 🔢 🔣 🔤 🅰️ 🆎 🅱️ 🆑 🆒 🆓 ℹ️ 🆔 Ⓜ️ 🆕 🆖 🅾️ 🆗 🅿️ 🆘 🆙 🆚 🈁 🈂️ 🈷️ 🈶 🈯 🉐 🈹 🈚 🈲 🉑 🈸 🈴 🈳 ㊗️ ㊙️ 🈺 🈵 🔴 🟠 🟡 🟢 🔵 🟣 🟤 ⚫ ⚪ 🟥 🟧 🟨 🟩 🟦 🟪 🟫 ⬛ ⬜ ◼️ ◻️ ◾ ◽ ▪️ ▫️ 🔶 🔷 🔸 🔹 🔺 🔻 💠 🔘 🔳 🔲',
    };
    // Tous les drapeaux de pays (lettres régionales), puis les drapeaux spéciaux
    const FLAG_CODES = 'AC AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CP CR CU CV CW CX CY CZ DE DG DJ DK DM DO DZ EA EC EE EG EH ER ES ET EU FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU IC ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TA TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM UN US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW';
    const flagOf = cc => String.fromCodePoint(...[...cc].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
    EMOJIS['Drapeaux'] = ['🏳️', '🏴', '🏁', '🚩', '🎌', '🏳️‍🌈', '🏳️‍⚧️', '🏴‍☠️', '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}', '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}', '\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}', ...FLAG_CODES.split(' ').map(flagOf)].join(' ');
    EMOJIS['Animaux'] = '🐕 🐶 🦮 🐕‍🦺 🐩 🐈 🐱 🐈‍⬛ 🐎 🐴 🦄 🫏 🐇 🐰 🐹 🐭 🐁 🐀 🐿️ 🦫 🦔 🦦 🦡 🦨 🦝 🐾 🐦 🐤 🐥 🐣 🐔 🐓 🦃 🦆 🦢 🦉 🦜 🦚 🐦‍⬛ 🕊️ 🦩 🪿 🐧 🐟 🐠 🐡 🦈 🐬 🐳 🐋 🐙 🦑 🦐 🦞 🦀 🐢 🦎 🐍 🐊 🦕 🦖 🐸 🐄 🐮 🐂 🐃 🐖 🐷 🐗 🐑 🐏 🐐 🦙 🐪 🐫 🦌 🫎 🦬 🐘 🦣 🦏 🦛 🦒 🦓 🦍 🦧 🐒 🐵 🦊 🐺 🦁 🐯 🐅 🐆 🐻 🐻‍❄️ 🐨 🐼 🦘 🦇 🐝 🪲 🐞 🦋 🐛 🐌 🐜 🦗 🕷️ 🦂 🪱 🪼 🦴 🪶 🥚 🐚';
    function emojiPanelHtml(first = '') {
        const groups = Object.entries(EMOJIS).sort((a, b) => (b[0] === first) - (a[0] === first));
        return `<div class="h-emoji-panel" hidden><div class="h-emoji-tabs">${groups.map(([g], i) => `<button type="button" class="link-button ${i ? '' : 'is-active'}" data-emoji-tab="${esc(g)}">${esc(g)}</button>`).join('')}</div>
            ${groups.map(([g, list], i) => `<div class="h-emoji-grid" data-emoji-group="${esc(g)}" ${i ? 'hidden' : ''}>${list.split(' ').filter(Boolean).map(e => `<button type="button" data-be-icon="${e}" title="${e}">${e}</button>`).join('')}</div>`).join('')}</div>`;
    }
    /** Choisir un émoji pour n'importe quelle case : petite fenêtre près de la case (dans la fenêtre ouverte s'il y en a une). */
    ext.pickEmoji = (input, onPick, opts = {}) => {
        document.querySelector('.h-emoji-pop')?.remove();
        const pop = document.createElement('div');
        pop.className = 'h-emoji-pop';
        pop.innerHTML = emojiPanelHtml(opts.first).replace('<div class="h-emoji-panel" hidden>', '<div class="h-emoji-panel">') + '<button type="button" class="icon-button h-emoji-pop-close" aria-label="Fermer">×</button>';
        (input.closest('dialog') || document.body).appendChild(pop);
        const r = input.getBoundingClientRect();
        pop.style.top = Math.max(8, Math.min(window.innerHeight - 340, r.bottom + 4)) + 'px';
        pop.style.left = Math.max(8, Math.min(window.innerWidth - 380, r.left)) + 'px';
        const close = () => { pop.remove(); document.removeEventListener('mousedown', outside, true); };
        const outside = e => { if (!pop.contains(e.target) && e.target !== input) close(); };
        setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
        pop.addEventListener('click', e => {
            if (e.target.closest('.h-emoji-pop-close')) return close();
            const tab = e.target.closest('[data-emoji-tab]');
            if (tab) { pop.querySelectorAll('[data-emoji-tab]').forEach(t => t.classList.toggle('is-active', t === tab)); pop.querySelectorAll('[data-emoji-group]').forEach(g => { g.hidden = g.dataset.emojiGroup !== tab.dataset.emojiTab; }); return; }
            const pick = e.target.closest('[data-be-icon]');
            if (pick) { input.value = pick.dataset.beIcon; input.dispatchEvent(new Event('input', {bubbles: true})); input.dispatchEvent(new Event('change', {bubbles: true})); onPick?.(pick.dataset.beIcon); close(); }
        });
    };
    function fieldRowHtml(f, i, all) {
        const [, icon, typeName] = typeInfo(f.type);
        const personFields = all.filter(x => x.type === 'person');
        let extra = '';
        if (f.type === 'select') extra = `<label class="span-2">Les choix <small>(un par ligne)</small><textarea rows="3" data-be="options">${esc(f.options.join('\n'))}</textarea></label>`;
        if (f.type === 'media') extra = `<label>Fichiers acceptés<select data-be="accept">${[['all', 'Photos, vidéos, sons, PDF'], ['image', 'Photos seulement'], ['video', 'Vidéos seulement'], ['audio', 'Sons seulement']].map(([k, l]) => `<option value="${k}" ${f.accept === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
        if (f.type === 'journey') extra = `<label>Les étapes viennent<select data-be="jSource"><option value="manual" ${f.jSource !== 'person' ? 'selected' : ''}>de ce que j’écris sur chaque fiche</option><option value="person" ${f.jSource === 'person' ? 'selected' : ''}>des événements datés de la fiche (tout seuls)</option></select></label>
            <label>Présentation<select data-be="jLayout">${(ext.J_LAYOUTS || [['vertical', 'Frise verticale']]).map(([k, l]) => `<option value="${k}" ${(f.jLayout || 'vertical') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            <label>Ordre<select data-be="jOrder"><option value="date" ${f.jOrder !== 'manual' ? 'selected' : ''}>par date</option><option value="manual" ${f.jOrder === 'manual' ? 'selected' : ''}>dans l’ordre écrit</option></select></label>
            <label class="checkbox-line"><input type="checkbox" data-be="jMap" ${f.jMap !== false ? 'checked' : ''}> carte du trajet</label><label class="checkbox-line"><input type="checkbox" data-be="jDays" ${f.jDays !== false ? 'checked' : ''}> « Jour 1, Jour 9… » et durées</label>
            ${f.jSource === 'person' ? `<label class="checkbox-line"><input type="checkbox" data-be="jWithPlace" ${f.jWithPlace ? 'checked' : ''}> seulement les événements avec un lieu</label>` : ''}`;
        if (f.type === 'widget') extra = widgetChoiceHtml(f);
        if (f.type === 'stat') extra = statChoiceHtml(f);
        if (f.type === 'person_info') extra = `<p class="muted span-2">ℹ️ Rien à taper : l’info est reprise toute seule de la fiche, et se met à jour quand la fiche change.</p><label>Quelle info ?<select data-be="info">${INFOS.map(([k, l]) => `<option value="${k}" ${f.info === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>De quelle fiche ?<select data-be="from"><option value="self">La fiche où est le bloc</option>${personFields.map(p => `<option value="${esc(p.key)}" ${f.from === p.key ? 'selected' : ''}>La personne du champ « ${esc(p.label)} »</option>`).join('')}</select></label>`;
        const canRequire = ['text', 'longtext', 'date', 'select', 'person'].includes(f.type);
        return `<div class="h-be-field" data-be-i="${i}"><div class="h-be-field-head"><span class="h-be-type" title="${esc(typeName)}">${icon}</span><input data-be="label" value="${esc(f.label)}" placeholder="Nom du champ" aria-label="Nom du champ"><small class="muted">${esc(typeName)}</small>
            <span class="h-row-actions"><button type="button" class="icon-button" data-be-up title="Monter">↑</button><button type="button" class="icon-button" data-be-down title="Descendre">↓</button><button type="button" class="icon-button danger" data-be-del title="Retirer ce champ">🗑</button></span></div>
            <div class="form-grid">${extra}${['map', 'person_info', 'widget', 'stat'].includes(f.type) ? '' : `<label>Aide <small>(facultatif)</small><input data-be="help" value="${esc(f.help)}" placeholder="Exemple de ce qu’il faut écrire"></label>`}${canRequire ? `<label class="checkbox-line"><input type="checkbox" data-be="required" ${f.required ? 'checked' : ''}> Obligatoire</label>` : ''}</div></div>`;
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
        box.addEventListener('click', e => {
            const sn = e.target.closest('[data-be-stat-new]'), se = e.target.closest('[data-be-stat-edit]');
            if (sn || se) { const key = (sn || se).dataset[sn ? 'beStatNew' : 'beStatEdit']; const f = d.fields.find(x => x.key === key); ext.blockStatReturn = {key}; if (se && f?.widget) ext.editStatFor?.(f.widget); else ext.newStatFor?.(); }
        });
        box.addEventListener('click', e => { if (e.target.closest('[data-be-newwidget]')) { if (!confirm('Ouvrir l’Éditeur de widgets ? Enregistre d’abord ce bloc si tu ne veux pas perdre tes changements.')) return; S().maintenanceTab = 'widget_editor'; A().setModule('maintenance'); } });
        box.addEventListener('input', e => {
            const row = e.target.closest('[data-be-i]'); if (!row) return;
            const f = d.fields[Number(row.dataset.beI)], k = e.target.dataset.be;
            if (k === 'options') f.options = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
            else if (k === 'required') f.required = e.target.checked;
            else if (k && e.target.type === 'checkbox') f[k] = e.target.checked;
            else if (k) f[k] = e.target.value;
            preview();
        });
        box.addEventListener('change', e => {
            const row = e.target.closest('[data-be-i]'); if (!row) return;
            const f = d.fields[Number(row.dataset.beI)], k = e.target.dataset.be;
            if (k === 'required') f.required = e.target.checked;
            else if (k && e.target.type === 'checkbox') f[k] = e.target.checked;
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
        A().$('#workspace').innerHTML = `<section class="page collection-page">${header('MAINTENANCE', 'Âges et écarts', 'Âge au mariage, âge des parents, écart entre les naissances, décès avant la naissance, mariage après le décès, et les erreurs de génération (fratrie étalée sur deux générations, ancêtre Sosa trop jeune ou trop vieux pour sa place dans la lignée) : ce qui est impossible ou très rare signale souvent une erreur (homonyme, mauvaise date, mauvais parents).')}
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
        const [data, hist] = await Promise.all([api('variant_groups', {field}), api('harmonize_history').catch(() => ({items: []}))]);
        if (!isCurrent(token)) return;
        const groups = data.groups || [];
        const history = hist.items || [];
        A().$('#workspace').innerHTML = `<section class="page collection-page">${header('MAINTENANCE', 'Harmoniser les variantes', 'Une base propre : « Laboureur », « laboureur », « labour. » et « Labourreur » deviennent une seule écriture. Rien n’est changé sans ton accord : choisis l’écriture à garder, décoche ce qui ne doit pas bouger, puis confirme.')}
            <div class="h-tabs">${HARM_FIELDS.map(([k, l]) => `<button type="button" class="button small ${k === field ? '' : 'secondary'}" data-h-harm-field="${k}">${esc(l)}</button>`).join('')}</div>
            ${groups.length ? `<p>${plural(groups.length, 'groupe de variantes trouvé', 'groupes de variantes trouvés')}.</p><div class="h-records">${groups.map((g, gi) => `<article class="h-record h-harm" data-h-harm="${gi}"><div class="h-harm-variants">${g.variants.map(v => `<label class="checkbox-line"><input type="checkbox" data-h-harm-v value="${esc(v.value)}" checked> <span class="h-harm-value">${esc(v.value)}</span> <small>(${v.count})</small> <button type="button" class="link-button" data-h-harm-pick="${esc(v.value)}" title="Garder cette écriture">← garder</button></label>`).join('')}</div>
                <div class="h-harm-target"><label>Écrire partout<input data-h-harm-target value="${esc(g.proposal)}"></label><button type="button" class="button small" data-h-harm-apply>Harmoniser</button></div></article>`).join('')}</div>` : empty('Aucune variante trouvée pour ce champ.')}
            ${history.length ? `<section class="maintenance-panel"><h3>Dernières harmonisations</h3><table class="data-table"><tbody>${history.map(h => `<tr><td><small>${esc(dateTimeFr(h.at))}</small></td><td>${esc(h.summary)}</td><td>${h.undoable ? `<button type="button" class="button small secondary" data-h-harm-undo="${h.id}">↶ Annuler</button>` : `<small class="muted">${h.undone ? 'annulée' : 'faite avant l’annulation possible'}</small>`}</td></tr>`).join('')}</tbody></table></section>` : ''}</section>`;
        const ws = A().$('#workspace');
        ws.querySelectorAll('[data-h-harm-field]').forEach(b => b.addEventListener('click', () => { S().hHarmField = b.dataset.hHarmField; ext.maintenance.harmonize(++S().workspaceToken); }));
        ws.querySelectorAll('[data-h-harm-undo]').forEach(b => b.addEventListener('click', async () => {
            if (!confirm('Remettre les anciennes écritures pour cette harmonisation ?')) return;
            try { const r = await api('undo_harmonize', {}, {method: 'POST', body: {id: b.dataset.hHarmUndo}}); toast(`${plural(r.result.restored, 'écriture remise', 'écritures remises')}.`); ext.maintenance.harmonize(++S().workspaceToken); }
            catch (error) { toast(error.message, 'error'); }
        }));
        ws.querySelectorAll('[data-h-harm]').forEach(box => {
            const g = groups[Number(box.dataset.hHarm)];
            box.querySelectorAll('[data-h-harm-pick]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); box.querySelector('[data-h-harm-target]').value = b.dataset.hHarmPick; }));
            box.querySelector('[data-h-harm-apply]').addEventListener('click', async () => {
                const target = box.querySelector('[data-h-harm-target]').value.trim();
                const values = [...box.querySelectorAll('[data-h-harm-v]:checked')].map(i => i.value).filter(v => v !== target);
                if (!target || !values.length) return toast('Rien à changer.', 'error');
                const n = g.variants.filter(v => values.includes(v.value)).reduce((s, v) => s + v.count, 0);
                if (!confirm(`Remplacer ${values.map(v => `« ${v} »`).join(', ')} par « ${target} » ?\n\n${plural(n, 'élément sera modifié', 'éléments seront modifiés')}. (Annulable ensuite : « Dernières harmonisations », en bas de cette page.)`)) return;
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
                <label>Mot de passe (12 caractères au moins : une petite phrase est idéale)<input type="password" name="password" minlength="12" required autocomplete="new-password"></label><label>Le retaper<input type="password" name="password2" minlength="8" required autocomplete="new-password"></label></div>
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

    const VILLAGE_MAPS_DEFAULT = ['cassini', 'cassini_royal', 'etatmajor', 'osmfr'];
    const VILLAGE_MAP_SHORT = {cassini: 'Cassini (XVIIIe)', cassini_royal: 'Cassini, exemplaire du roi', etatmajor: 'État-major (1820-1866)', osmfr: 'Aujourd’hui'};
    /** Tous les fonds de la carte principale, par catégorie. */
    const tileCats = () => A().tileLayerCategories || [{id: 'v', label: 'Fonds', items: Object.entries(VILLAGE_MAP_SHORT)}];
    const tileLabel = key => VILLAGE_MAP_SHORT[key] || tileCats().flatMap(c => c.items).find(i => i[0] === key)?.[1] || key;
    /** Fonds affichés en boutons sur la fiche d'un village (Maintenance → Apparence). */
    const villageMapButtons = () => { try { const v = JSON.parse(ls('genealogie-village-maps', 'null')); return Array.isArray(v) && v.length ? v : VILLAGE_MAPS_DEFAULT; } catch (_) { return VILLAGE_MAPS_DEFAULT; } };
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
    /* ─── 📋 Recensements : tous les foyers (filtrables par commune, année, nom) ─── */
    const censusStatus = {todo: 'À chercher', found: 'Trouvé', not_found: 'Non trouvé', not_born: 'Pas encore né', not_in_france: 'Pas encore en France', not_france: 'Pas en France', left_france: 'Plus en France', dead: 'Déjà décédé'};
    ext.lists.census_households = async token => {
        const st = S();
        const f = {village: st.hCensusVillage || '', year: st.hCensusYear || '', q: st.hCensusQ || ''};
        let data;
        try { data = await api('census_households', f); } catch (error) { toast(error.message, 'error'); return; }
        if (token !== st.workspaceToken || st.module !== 'listes' || st.listType !== 'census_households') return;
        const recs = data.records || [];
        const byYear = new Map(); recs.forEach(r => { const y = r.year || '?'; if (!byYear.has(y)) byYear.set(y, []); byYear.get(y).push(r); });
        const people = recs.reduce((n, r) => n + r.members.length, 0);
        const memberName = m => m.person_id ? personLink(m.person_id, [m.first_name, m.last_name].filter(Boolean).join(' ') || m.display_name) : esc(m.display_name || '—');
        const household = r => `<article class="h-census-house"><header><div><strong>${esc(r.place || 'Lieu inconnu')}</strong>${r.address ? ` · ${esc(r.address)}` : ''}${r.date_text ? ` <small class="muted">${esc(r.date_text)}</small>` : ''}</div>
                <span>${Number(r.is_special) ? '<span class="collection-kind">recensement particulier</span> ' : ''}<span class="collection-kind">${esc(censusStatus[r.status] || r.status || '')}</span>${Number(r.media) ? ` <span class="collection-kind">📎 ${fmt(r.media)}</span>` : ''}</span></header>
            ${r.members.length ? `<table class="data-table"><thead><tr><th>Nom</th><th>Place dans le foyer</th><th>Âge</th><th>Métier</th><th>Né(e) à</th></tr></thead><tbody>${r.members.map(m => `<tr><td>${memberName(m)}</td><td>${esc(m.household_position || m.personal_status || '')}</td><td>${esc(m.age_text || '')}</td><td>${esc(m.occupation || '')}</td><td>${esc(m.birth_place || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aucun membre relevé.</p>'}
            ${r.notes ? `<p class="muted">${nl(r.notes)}</p>` : ''}</article>`;
        A().$('#workspace').innerHTML = `<section class="page collection-page h-census-page">${header('LISTES', 'Recensements : tous les foyers', 'Chaque foyer recensé avec ses membres, regroupés par année. Filtre par commune, année ou nom ; clique sur un nom pour ouvrir sa fiche (le recensement se modifie depuis la fiche, bloc Recensements).')}
            <div class="form-grid h-census-filters"><label>Commune<select data-hc="village"><option value="">Toutes (${fmt(data.villages.reduce((n, v) => n + v.census, 0))})</option>${data.villages.map(v => `<option value="${esc(v.key)}" ${v.key === f.village ? 'selected' : ''}>${esc(v.name)}${v.county ? ` (${esc(v.county)})` : ''} — ${fmt(v.census)}</option>`).join('')}</select></label>
                <label>Année<select data-hc="year"><option value="">Toutes</option>${data.years.map(y => `<option value="${y.year}" ${String(y.year) === String(f.year) ? 'selected' : ''}>${y.year} (${fmt(y.n)})</option>`).join('')}</select></label>
                <label class="span-2">Chercher un nom, un métier, une adresse<input type="search" data-hc="q" value="${esc(f.q)}" placeholder="Dupont, cultivateur, rue du Moulin…"></label></div>
            <p class="muted">${plural(recs.length, 'foyer', 'foyers')} · ${plural(people, 'personne relevée', 'personnes relevées')}${data.truncated ? ' (les 2 000 premiers)' : ''} ${recs.length ? '<button type="button" class="link-button" data-hc-csv>Exporter en CSV</button>' : ''}</p>
            ${recs.length ? [...byYear.entries()].map(([y, list]) => `<details class="h-census-year" open><summary><strong>${esc(y)}</strong> — ${plural(list.length, 'foyer', 'foyers')}, ${plural(list.reduce((n, r) => n + r.members.length, 0), 'personne', 'personnes')}</summary>${list.map(household).join('')}</details>`).join('') : empty('Aucun recensement ne correspond. Les recensements s’ajoutent depuis la fiche d’une personne (bloc Recensements).')}</section>`;
        const ws = A().$('#workspace');
        const rerun = () => ext.lists.census_households(++S().workspaceToken);
        ws.querySelectorAll('select[data-hc]').forEach(el => el.addEventListener('change', () => { const k = el.dataset.hc; st[k === 'village' ? 'hCensusVillage' : 'hCensusYear'] = el.value; rerun(); }));
        let t = 0; ws.querySelector('input[data-hc="q"]').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { st.hCensusQ = e.target.value.trim(); rerun().then(() => { const i = A().$('#workspace input[data-hc="q"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }, 350); });
        ws.querySelector('[data-hc-csv]')?.addEventListener('click', () => {
            const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
            const lines = [['Année', 'Date', 'Commune', 'Adresse', 'Nom', 'Place dans le foyer', 'Âge', 'Métier', 'Né(e) à'].map(q).join(';')];
            recs.forEach(r => (r.members.length ? r.members : [{}]).forEach(m => lines.push([r.year, r.date_text, r.place, r.address, m.person_id ? [m.first_name, m.last_name].filter(Boolean).join(' ') || m.display_name : m.display_name, m.household_position || m.personal_status, m.age_text, m.occupation, m.birth_place].map(q).join(';'))));
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\n')], {type: 'text/csv'})); a.download = 'recensements.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        });
        A().bindTableLinks?.();
    };
    ext.openCensusHouseholds = (village = '', year = '') => { const st = S(); st.hCensusVillage = village; st.hCensusYear = year ? String(year) : ''; st.hCensusQ = ''; st.listType = 'census_households'; A().setModule('listes'); };

    ext.lists.villages = async token => {
        const st = S();
        if (st.hVillage) return renderVillage(token, st.hVillage);
        const data = await api('villages', {q: st.hVillageQ || ''});
        if (!isCurrent(token, 'listes')) return;
        const rows = data.villages || [];
        A().$('#workspace').innerHTML = `<section class="page collection-page">${header('LISTES', 'Fiche d’un village', 'Pour chaque commune où la famille a vécu : les familles, les métiers, l’église et la paroisse, la population au fil des recensements, et la carte de Cassini.')}
            <div class="collection-toolbar"><input type="search" id="h-village-q" value="${esc(st.hVillageQ || '')}" placeholder="Chercher une commune…"></div>
            ${rows.length ? `<div class="data-table-wrap"><table class="data-table sortable-table"><thead><tr>${['Commune', 'Département', 'Personnes de la famille', 'Événements', 'Période'].map((h, i) => `<th><button data-sort-column="${i}">${h}</button></th>`).join('')}</tr></thead><tbody>${rows.map(v => `<tr><td data-sort-value="${esc(v.name.toLowerCase())}"><button type="button" class="table-link" data-h-village="${esc(v.key)}"><strong>${esc(v.name)}</strong></button>${v.places > 1 ? ` <small class="muted">(${v.places} lieux)</small>` : ''}</td><td data-sort-value="${esc([v.county, v.country !== 'France' ? v.country : ''].filter(Boolean).join(', ').toLowerCase())}">${esc([v.county, v.country !== 'France' ? v.country : ''].filter(Boolean).join(', '))}</td><td data-sort-value="${v.persons}">${v.persons}</td><td data-sort-value="${v.events}">${v.events}</td><td data-sort-value="${v.from || 9999}">${v.from ? esc(v.from + (v.to && v.to !== v.from ? '–' + v.to : '')) : '—'}</td></tr>`).join('')}</tbody></table></div>` : empty('Aucune commune : les lieux des événements et des recensements apparaissent ici.')}</section>`;
        const ws = A().$('#workspace');
        ws.querySelector('#h-village-q').addEventListener('input', debounceVillage(e => { st.hVillageQ = e.target.value.trim(); ext.lists.villages(++st.workspaceToken).then(() => { const i = A().$('#h-village-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }));
        ws.querySelectorAll('[data-h-village]').forEach(b => b.addEventListener('click', () => { st.hVillage = b.dataset.hVillage; ext.lists.villages(++st.workspaceToken); }));
        A().bindTableLinks();
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
    /* ─── Fiche d'un village : parties rangées, masquées, en demi ou pleine largeur (genealogie-village-layout) ─── */
    const VILLAGE_SECTIONS = [['stats', '🔢 Les chiffres', 'full'], ['map', '🗺️ La carte', 'half'], ['church', '⛪ Église et paroisse', 'half'], ['population', '👥 Population au fil des recensements', 'half'], ['jobs', '⚒️ Métiers dominants', 'half'],
        ['addrmap', '🗺️ Plan du recensement (maisons, année par année)', 'full'], ['memo', '🗒️ Bloc-notes', 'half'], ['families', '🏠 Les familles qui y ont vécu', 'full'], ['decades', '📜 Actes par décennie', 'full'], ['notes', '📝 Notes et photos', 'full'],
        ['recueils', '📚 Recueils', 'full'], ['popchart', '📈 Évolution du nombre d’habitants', 'full']];
    ext.villageSections = () => VILLAGE_SECTIONS;
    ext.villageWidths = () => VILLAGE_WIDTHS;
    function villageLayout() {
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem('genealogie-village-layout') || '{}') || {}; } catch (_) {}
        if (window.LCNDA_SCREEN_LAYOUT?.kind === 'village') saved = window.LCNDA_SCREEN_LAYOUT; // organisation propre au widget ou à l'onglet
        const keys = VILLAGE_SECTIONS.map(x => x[0]);
        const order = [...(Array.isArray(saved.order) ? saved.order.filter(k => keys.includes(k)) : []), ...keys.filter(k => !(saved.order || []).includes(k))];
        return {order, hidden: Array.isArray(saved.hidden) ? saved.hidden.filter(k => keys.includes(k)) : [], width: saved.width && typeof saved.width === 'object' ? saved.width : {}};
    }
    const VILLAGE_WIDTHS = [['full', 'pleine', 12], ['w9', '3/4', 9], ['w8', '2/3', 8], ['half', '1/2', 6], ['w4', '1/3', 4], ['w3', '1/4', 3]];
    const villageWidth = (l, k) => { const w = l.width[k] || VILLAGE_SECTIONS.find(x => x[0] === k)?.[2] || 'full'; return VILLAGE_WIDTHS.some(x => x[0] === w) ? w : 'full'; };
    function arrangeVillage(ws) {
        const l = villageLayout(), page = ws.querySelector('.h-village');
        const flow = document.createElement('div'); flow.className = 'h-village-flow';
        l.order.forEach(k => { const el = page.querySelector(`[data-vsec="${k}"]`); if (!el) return; el.hidden = l.hidden.includes(k); el.style.setProperty('--vspan', VILLAGE_WIDTHS.find(x => x[0] === villageWidth(l, k))[2]); flow.appendChild(el); });
        const grid = page.querySelector('.h-village-grid');
        (grid || page.lastElementChild)?.insertAdjacentElement(grid ? 'beforebegin' : 'afterend', flow);
        grid?.remove();
    }
    function villageLayoutDialog(after) {
        let l = villageLayout();
        const save = () => { try { localStorage.setItem('genealogie-village-layout', JSON.stringify(l)); } catch (_) {} };
        const body = () => `<p class="muted">Pour toutes les fiches de village. Les flèches rangent les parties ; décocher en masque une ; la largeur (1/4, 1/3, 1/2, 2/3, 3/4 ou pleine) en met plusieurs sur une ligne.</p>
            <table class="data-table h-flag-table"><thead><tr><th>Ordre</th><th>Partie</th><th>Montrée</th><th>Largeur</th></tr></thead><tbody>${l.order.map((k, i) => `<tr><td><button type="button" class="icon-button" data-vl-move="${k}" data-dir="-1" ${i ? '' : 'disabled'}>↑</button><button type="button" class="icon-button" data-vl-move="${k}" data-dir="1" ${i < l.order.length - 1 ? '' : 'disabled'}>↓</button></td>
                <td>${esc(VILLAGE_SECTIONS.find(x => x[0] === k)[1])}</td><td><input type="checkbox" data-vl-show="${k}" ${l.hidden.includes(k) ? '' : 'checked'}></td>
                <td><select data-vl-width="${k}">${VILLAGE_WIDTHS.map(([w, lab]) => `<option value="${w}" ${villageWidth(l, k) === w ? 'selected' : ''}>${lab}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>
            <p><button type="button" class="link-button" data-vl-reset>↺ Remettre comme au départ</button></p>`;
        ext.openDialog({eyebrow: 'FICHE D’UN VILLAGE', title: 'Organiser la fiche', wide: true, submitLabel: 'Fermer', body: body(),
            onOpen: d => {
                const box = d.querySelector('.h-dialog-body');
                const repaint = () => { box.innerHTML = body(); save(); };
                box.addEventListener('click', e => {
                    const m = e.target.closest('[data-vl-move]');
                    if (m) { const i = l.order.indexOf(m.dataset.vlMove), j = i + Number(m.dataset.dir); [l.order[i], l.order[j]] = [l.order[j], l.order[i]]; repaint(); }
                    if (e.target.closest('[data-vl-reset]')) { l = {order: VILLAGE_SECTIONS.map(x => x[0]), hidden: [], width: {}}; repaint(); }
                });
                box.addEventListener('change', e => {
                    const t = e.target;
                    if (t.dataset.vlShow) { l.hidden = t.checked ? l.hidden.filter(x => x !== t.dataset.vlShow) : [...new Set([...l.hidden, t.dataset.vlShow])]; save(); }
                    if (t.dataset.vlWidth) { l.width[t.dataset.vlWidth] = t.value; save(); }
                });
                d.addEventListener('close', () => after(), {once: true});
            },
            onSubmit: () => true,
        });
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
                `<button type="button" class="button secondary" data-h-village-back>← Toutes les communes</button><button type="button" class="button secondary" data-h-village-layout title="Ranger les parties de la fiche, en masquer, choisir leur largeur">⚙️ Organiser la fiche</button><button type="button" class="button secondary" data-h-village-mono>Monographie complète</button>${tools('data-h-village-edit', 'data-h-village-clear', 'la fiche du village')}`)}
            ${ext.labelChips(v.labels)}
            <div class="h-village-stats" data-vsec="stats"><span><strong>${fmt(v.people_count)}</strong> personnes de la famille</span><span>${plural(v.families.length, 'famille', 'familles').replace(/^(\S+)/, '<strong>$1</strong>')}</span><span><strong>${fmt(v.acts.baptemes)}</strong> naissances / baptêmes</span><span><strong>${fmt(v.acts.mariages)}</strong> mariages</span><span><strong>${fmt(v.acts.deces)}</strong> décès / sépultures</span>${v.current_population ? `<span><strong>${fmt(v.current_population)}</strong> habitants aujourd’hui</span>` : ''}</div>
            <div class="h-village-grid">
            <section class="maintenance-panel h-village-mapbox" data-vsec="map"><h3>🗺️ La carte</h3><div class="h-tabs">${villageMapButtons().map(k => `<button type="button" class="button small ${k === bg ? '' : 'secondary'}" data-h-village-bg="${esc(k)}">${esc(tileLabel(k))}</button>`).join('')}
                    <select data-h-village-bgsel aria-label="Autres fonds de carte"><option value="">Autres fonds…</option>${tileCats().map(c => `<optgroup label="${esc(c.label)}">${c.items.map(([k, l]) => `<option value="${esc(k)}" ${k === bg && !villageMapButtons().includes(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>`).join('')}</select><span class="spacer"></span><button type="button" class="icon-button" data-h-village-zoom="-1" title="Dézoomer">−</button><button type="button" class="icon-button" data-h-village-zoom="1" title="Zoomer">+</button></div>
                <div class="h-village-mapwrap">${villageMapHtml(v, bg, zoom)}</div>
                ${geoportail ? `<p class="h-links"><a href="${esc(geoportail)}" target="_blank" rel="noopener noreferrer">Ouvrir sur le Géoportail ↗</a> · <button type="button" class="link-button" data-h-village-main>Voir sur la carte de l’app</button></p>` : ''}</section>
            <section class="maintenance-panel" data-vsec="church"><h3>⛪ Église et paroisse</h3>
                <dl class="data-list">${pr.church ? `<div class="data-row"><dt>Église</dt><dd>${esc(pr.church)}</dd></div>` : ''}${pr.patron_saint ? `<div class="data-row"><dt>Saint patron</dt><dd>${esc(pr.patron_saint)}</dd></div>` : ''}${pr.diocese ? `<div class="data-row"><dt>Diocèse</dt><dd>${esc(pr.diocese)}</dd></div>` : ''}</dl>
                ${!pr.church && !pr.patron_saint && !pr.diocese ? '<p class="muted">Église, saint patron et diocèse à noter (crayon en haut).</p>' : ''}
                ${v.parish.length ? `<h4>Avant la Révolution</h4><ul>${v.parish.map(x => `<li>Dépendait de la paroisse de <strong>${esc(x.parish)}</strong>${x.until ? ` jusqu’en ${x.until}` : ''}${x.from ? ` (depuis ${x.from})` : ''}${x.note ? ` — <small>${esc(x.note)}</small>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Aucun rattachement à une autre paroisse noté (Listes → Paroisses d’Ancien Régime).</p>'}
                ${v.registers.length ? `<h4>Registres en ligne</h4><ul>${v.registers.map(l => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ↗</a>${l.note ? ` <small class="muted">${esc(l.note)}</small>` : ''}</li>`).join('')}</ul>` : ''}
                ${v.graves.length ? `<h4>Cimetières</h4><ul>${v.graves.map(g => `<li>${esc(g.cemetery_name || 'Cimetière')} <small>(${plural(g.n, 'sépulture notée', 'sépultures notées')})</small></li>`).join('')}</ul>` : ''}</section>
            <section class="maintenance-panel" data-vsec="population"><h3>👥 Population au fil des recensements</h3>${pops.length > 1 ? '<p class="muted">La courbe est tout en bas de la fiche.</p>' : '<p class="muted">Les chiffres sont récupérés sur Wikipédia (en bas de la fiche) ; tu peux aussi les saisir à la main (crayon en haut).</p>'}
                ${pops.length ? `<details><summary>Les chiffres (${pops.length})</summary><table class="data-table"><tbody>${pops.map(p => `<tr><td>${p[0]}</td><td>${fmt(p[1])} habitants</td></tr>`).join('')}</tbody></table></details>` : ''}
                ${v.census.length ? `<h4>Recensements de la famille ici</h4><table class="data-table"><thead><tr><th>Année</th><th>Foyers</th><th>Personnes relevées</th></tr></thead><tbody>${v.census.map(c => `<tr><td><button type="button" class="table-link" data-h-census-open="${esc(String(c.year))}" title="Voir les foyers recensés">${c.year}</button></td><td>${c.households}</td><td>${c.members}</td></tr>`).join('')}</tbody></table><p><button type="button" class="button small secondary" data-h-census-open="">📋 Tous les foyers recensés ici</button></p>` : ''}
                <p class="h-links"><a href="${esc(wiki)}" target="_blank" rel="noopener noreferrer">Wikipédia (évolution démographique) ↗</a> · <a href="http://cassini.ehess.fr/" target="_blank" rel="noopener noreferrer">Des villages de Cassini aux communes d’aujourd’hui (EHESS) ↗</a></p></section>
            <section class="maintenance-panel" data-vsec="jobs"><h3>⚒️ Métiers dominants</h3>${v.jobs.length ? `<ul class="h-bars">${v.jobs.map(j => `<li><span class="h-bar-label">${esc(j.name)}</span><span class="h-bar"><i style="width:${Math.round(j.count / topJob * 100)}%"></i></span><span>${j.count}${j.from ? ` <small class="muted">${j.from}${j.to && j.to !== j.from ? '–' + j.to : ''}</small>` : ''}</span></li>`).join('')}</ul>` : '<p class="muted">Aucun métier noté pour les personnes de cette commune.</p>'}</section>
            </div>
            <section class="maintenance-panel" data-vsec="families"><h3>🏠 Les familles qui y ont vécu (${v.families.length})</h3>${v.families.length ? `<div class="data-table-wrap"><table class="data-table sortable-table"><thead><tr>${['Famille', 'Personnes', 'Période', 'Générations'].map((h, i) => `<th><button data-sort-column="${i}">${h}</button></th>`).join('')}<th>Qui</th></tr></thead><tbody>${v.families.map(f => `<tr><td data-sort-value="${esc(f.name.toLowerCase())}"><strong>${esc(f.name)}</strong>${f.variants.length > 1 ? `<br><small class="muted">${esc(f.variants.join(', '))}</small>` : ''}</td><td data-sort-value="${f.count}">${f.count}</td><td data-sort-value="${f.from || 9999}">${f.from ? esc(f.from + (f.to && f.to !== f.from ? '–' + f.to : '')) : '—'}</td><td data-sort-value="${f.generations}">${f.generations}</td><td>${(() => { const link = p => personLink(p.id, pname(p) + (p.birth_year ? ` (${p.birth_year})` : ''));
                    return f.people.length > 8 ? `<span>${f.people.slice(0, 8).map(link).join(', ')}</span><span hidden>, ${f.people.slice(8).map(link).join(', ')}</span> <button type="button" class="link-button" data-h-village-more data-n="${f.people.length - 8}">et ${f.people.length - 8} autre${f.people.length - 8 > 1 ? 's' : ''} ▾</button>` : f.people.map(link).join(', '); })()}</td></tr>`).join('')}</tbody></table></div>` : empty('Aucune personne de la famille rattachée à cette commune.')}</section>
            ${Object.keys(v.decades).length > 1 ? `<section class="maintenance-panel" data-vsec="decades"><div class="h-panel-head"><h3>📜 Actes de la famille par décennie</h3><label class="h-inline">Afficher <select data-h-village-acts><option value="">Tous les actes (${fmt(Object.values(v.decades).reduce((a, b) => a + b, 0))})</option>${(v.decades_by_type || []).map(t => `<option value="${esc(t.label)}" ${t.label === actsType ? 'selected' : ''}>${esc(t.label)} (${fmt(t.total)})</option>`).join('')}</select></label></div><div data-h-village-decades>${decadesHtml(v, actsType)}</div></section>` : ''}
            ${pr.notes || v.media.length ? `<section class="maintenance-panel" data-vsec="notes"><h3>📝 Notes et photos</h3>${pr.notes ? `<p class="h-transcription">${nl(pr.notes)}</p>` : ''}${ext.thumbs ? ext.thumbs('village-' + pr.id, v.media) : ''}</section>` : ''}
            <div data-vsec="recueils" data-rc-host data-rc-type="village" data-rc-key="${esc(key)}" data-rc-hide-empty></div>
            ${v.insee && ext.addrMap ? `<section class="maintenance-panel h-am-host" data-vsec="addrmap" data-insee="${esc(v.insee)}"><h3>🗺️ Plan du recensement <small class="muted">les maisons relevées dans les dépouillements, année par année, sur la carte d’aujourd’hui ou une carte ancienne</small></h3><div data-addrmap-box></div></section>` : ''}
            <section class="maintenance-panel h-village-memo" data-vsec="memo"><div class="h-panel-head"><h3>🗒️ Bloc-notes</h3><small class="muted" data-h-village-memosaved></small></div><textarea data-h-village-memo rows="5" placeholder="Pistes, choses à vérifier, idées… (enregistré au fil de la frappe)">${esc(pr.memo || '')}</textarea></section>
            <section class="maintenance-panel h-village-popchart" id="h-village-pop" data-vsec="popchart"><div class="h-panel-head"><h3>📈 Évolution du nombre d’habitants</h3><button type="button" class="button small secondary" data-h-village-wiki>${pr.population_source ? 'Mettre à jour depuis Wikipédia' : 'Récupérer sur Wikipédia'}</button></div>
                ${pops.length > 1 ? populationChart(pops) : '<p class="muted" data-h-village-popmsg>Pas encore assez de chiffres pour tracer la courbe.</p>'}
                ${pr.population_source ? `<p class="muted">Chiffres : <a href="${esc(pr.population_source)}" target="_blank" rel="noopener noreferrer">${esc(decodeURIComponent(pr.population_source.replace(/^.*\/wiki\//, '')).replace(/_/g, ' '))} — Wikipédia ↗</a> (d’après Cassini/EHESS et l’INSEE).</p>` : ''}</section>
            </section>`;
        A().bindTableLinks();
        const ws = A().$('#workspace');
        const again = () => renderVillage(++st.workspaceToken, key);
        arrangeVillage(ws);
        ws.querySelector('[data-h-village-layout]').addEventListener('click', () => villageLayoutDialog(again));
        const memo = ws.querySelector('[data-h-village-memo]'); let memoT = 0;
        memo?.addEventListener('input', () => { ws.querySelector('[data-h-village-memosaved]').textContent = '…'; clearTimeout(memoT); memoT = setTimeout(async () => {
            try { await api('save_village_memo', {}, {method: 'POST', body: {key, name: v.name, memo: memo.value}}); ws.querySelector('[data-h-village-memosaved]').textContent = '✓ enregistré'; } catch (e) { ws.querySelector('[data-h-village-memosaved]').textContent = '⚠ ' + e.message; }
        }, 600); });
        const am = ws.querySelector('[data-vsec="addrmap"]');
        if (am && !am.hidden && ext.addrMap) ext.addrMap(am.querySelector('[data-addrmap-box]'), {insee: am.dataset.insee});
        ws.querySelector('[data-h-village-back]').addEventListener('click', () => { st.hVillage = ''; ext.lists.villages(++st.workspaceToken); });
        ws.querySelectorAll('[data-h-census-open]').forEach(b => b.addEventListener('click', () => ext.openCensusHouseholds(key, b.dataset.hCensusOpen)));
        ws.querySelector('[data-h-village-mono]').addEventListener('click', () => { st.graphMode = 'place_monograph'; st.graphPlaceMonograph = {...(st.graphPlaceMonograph || {}), id: v.place_id, name: v.name, county: v.county || '', country: v.country || ''}; A().setModule('graphiques'); });
        ws.querySelectorAll('[data-h-village-bg]').forEach(b => b.addEventListener('click', () => { st.hVillageMap = b.dataset.hVillageBg; again(); }));
        ws.querySelector('[data-h-village-bgsel]')?.addEventListener('change', e => { if (e.target.value) { st.hVillageMap = e.target.value; again(); } });
        ws.querySelectorAll('[data-h-village-zoom]').forEach(b => b.addEventListener('click', () => { st.hVillageZoom = Math.max(10, Math.min(16, zoom + Number(b.dataset.hVillageZoom))); again(); }));
        ws.querySelectorAll('[data-h-village-more]').forEach(b => b.addEventListener('click', () => {
            const rest = b.previousElementSibling, open = rest.hidden;
            rest.hidden = !open;
            b.textContent = open ? 'réduire ▴' : `et ${b.dataset.n} autre${Number(b.dataset.n) > 1 ? 's' : ''} ▾`;
        }));
        ws.querySelector('[data-h-village-acts]')?.addEventListener('change', e => { st.hVillageActs = e.target.value; ws.querySelector('[data-h-village-decades]').innerHTML = decadesHtml(v, e.target.value); });
        ws.querySelector('[data-h-village-main]')?.addEventListener('click', () => { st.mapCenter = {lat: v.lat, lon: v.lon}; st.mapZoom = 14; st.mapKeepCenter = true; A().setModule('carte'); });
        ws.querySelector('[data-h-village-edit]').addEventListener('click', () => openVillageDialog(v, again));
        // Population : récupérée sur Wikipédia (une fois toute seule si la fiche n'a pas encore de chiffres)
        const fetchWiki = async auto => {
            const btn = ws.querySelector('[data-h-village-wiki]'), box = ws.querySelector('#h-village-pop');
            if (!btn) return;
            btn.disabled = true; btn.textContent = 'Recherche sur Wikipédia…';
            try {
                const r = await api('village_wiki_population', {key});
                await api('save_village_populations', {}, {method: 'POST', body: {key, name: v.name, populations: r.populations, source: r.url}});
                if (!auto) toast(`${plural(r.populations.length, 'recensement récupéré', 'recensements récupérés')} (${r.title}).`);
                if (S().module === 'listes' && st.listType === 'villages' && st.hVillage === key) again(); // toujours sur ce village
            } catch (error) {
                if (!document.body.contains(btn)) return;
                btn.disabled = false; btn.textContent = 'Récupérer sur Wikipédia';
                if (!auto) toast(error.message, 'error');
                else box?.querySelector('[data-h-village-popmsg]')?.insertAdjacentHTML('afterend', `<p class="muted">${esc(error.message)}</p>`);
            }
        };
        ws.querySelector('[data-h-village-wiki]')?.addEventListener('click', () => fetchWiki(false));
        st.hVillageWikiTried = st.hVillageWikiTried || {};
        if (pops.length < 2 && !st.hVillageWikiTried[key] && navigator.onLine !== false) { st.hVillageWikiTried[key] = true; fetchWiki(true); }
        ws.querySelector('[data-h-village-clear]').addEventListener('click', async () => {
            if (!confirm('Effacer ce qui a été noté sur ce village (église, populations, notes) ? Les familles et les métiers, calculés depuis les fiches, restent.')) return;
            try { await api('save_village_profile', {}, {method: 'POST', body: {key, name: v.name, populations: [], pending_labels: []}}); toast('Fiche du village effacée.'); again(); } catch (error) { toast(error.message, 'error'); }
        });
    }
    ext.designPanels = ext.designPanels || [];
    ext.afterDesign = ext.afterDesign || [];
    ext.designPanels.push(() => {
        const on = villageMapButtons();
        return `<section class="person-block-config" id="h-village-maps-config"><header><span class="eyebrow">FICHE D’UN VILLAGE</span><h3>Fonds de carte en boutons</h3><p>Les fonds cochés apparaissent en boutons sur la carte de chaque village ; tous les autres restent dans le menu « Autres fonds… ».</p></header>
            ${tileCats().map(c => `<details ${c.items.some(([k]) => on.includes(k)) ? 'open' : ''}><summary>${esc(c.label)}</summary><div class="h-village-maps-grid">${c.items.map(([k, l]) => `<label class="checkbox-line"><input type="checkbox" data-h-vmap="${esc(k)}" ${on.includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div></details>`).join('')}
            <p><button type="button" class="link-button" data-h-vmap-reset>↺ Remettre comme au départ</button></p></section>`;
    });
    ext.afterDesign.push(() => {
        const box = document.getElementById('h-village-maps-config');
        if (!box) return;
        const save = list => { lsSet('genealogie-village-maps', JSON.stringify(list)); try { window.dispatchEvent(new StorageEvent('storage', {key: 'genealogie-village-maps'})); } catch (_) {} };
        box.addEventListener('change', e => {
            const k = e.target.dataset.hVmap; if (!k) return;
            const list = villageMapButtons().filter(x => x !== k);
            if (e.target.checked) list.push(k);
            if (!list.length) { e.target.checked = true; return toast('Garde au moins un fond en bouton.', 'error'); }
            save(list); toast('Fonds de carte des villages enregistrés.');
        });
        box.querySelector('[data-h-vmap-reset]').addEventListener('click', () => { save(VILLAGE_MAPS_DEFAULT); box.querySelectorAll('[data-h-vmap]').forEach(i => { i.checked = VILLAGE_MAPS_DEFAULT.includes(i.dataset.hVmap); }); toast('Fonds de départ remis.'); });
    });
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
    /* ═══════════════════════ ❓ MINI FAQ (Maintenance → FAQ / tuto) ═══════════════════════ */

    const FAQ = [
        ['Fiches', [
            ['Peut-on mettre le menu des onglets en bas, ou la colonne à droite ?', 'Oui : Maintenance → Apparence → « Menu des onglets » (en haut ou en bas) et « Colonne latérale » (à gauche ou à droite), puis Enregistrer.'],
            ['Comment ajouter un enfant, un parent ou un conjoint ?', 'Ouvre la fiche, puis dans les blocs Parents, Conjoints ou Enfants clique sur « + ». Tu peux choisir une personne qui existe déjà ou en créer une nouvelle.'],
            ['Comment afficher un bloc (Départs, Poilu, Résistant…) sur une fiche ?', 'Fiche → Identité (crayon) → « Blocs à afficher sur la fiche » : coche le bloc. Pour l’avoir sur toutes les fiches : Maintenance → Apparence → « Blocs à afficher sur demande ».'],
            ['Comment créer mon propre widget du tableau de bord ?', 'Maintenance → Éditeur de widgets (ou « + Créer un widget » en bas de la colonne du tableau de bord) → « + Nouveau widget ». Pars de rien (chiffres, liste, graphique, statistique, écran de l’app, texte, raccourcis), de n’importe quel élément de l’app (une liste, un diagramme, une statistique, une fiche, la carte, un outil), d’un widget de l’app (copie modifiable, ou le même widget habillé de ton titre, ton icône, ta couleur), d’un de tes widgets ou d’un exemple. L’aperçu se met à jour pendant que tu règles. Il apparaît ensuite dans la colonne de gauche du tableau de bord ; « Partager » en fait un fichier pour un proche.'],
            ['Comment ranger le tableau de bord en pages et en ensembles ?', 'Tableau de bord → « Réordonner les widgets ». « + Nouvelle page » ajoute une page (Liste, Fiches, Recherche…) : ses boutons s’affichent en haut, sous le titre ; coche celle qui s’ouvre par défaut, et « Ranger ses widgets » pour l’organiser (les widgets ajoutés depuis la colonne de gauche vont sur la page affichée). « 📁 + Ensemble » crée un cadre avec un titre qui regroupe les widgets qui le suivent ; ▶ en fait un sous-ensemble, autant de niveaux que tu veux. Le bouton ▾ à gauche du cadre replie ou ouvre l’ensemble.'],
            ['Comment déplacer une ligne à la souris ?', 'Partout où il y a des flèches ↑ ↓, la poignée ⠿ (ou ↕) devant la ligne se tire à la place voulue.'],
            ['Comment créer mon propre bloc ?', 'Maintenance → Éditeur de blocs → « + Nouveau bloc ». Pars d’un modèle, d’un bloc de l’app (Départs, Poilu, Résistant, Sépulture…) ou d’un de tes blocs, ajoute ou enlève des champs en cliquant sur les boutons, puis enregistre. Il apparaît ensuite dans Identité → « Blocs à afficher sur la fiche ». Le champ « 📊 Statistique » y pose une statistique réglée à fond dans l’Éditeur de statistiques (« Nouvelle statistique… », puis retour au bloc) ; avec le critère « Par rapport à la personne de la fiche », elle compte ses ancêtres, ses descendants, sa famille… Le champ « 🧱 Widget » y pose un de tes widgets (chiffres, liste, graphique, statistique…) ou un écran de l’app (la fiche de la personne, une liste, un diagramme…).'],
            ['Comment mettre une étiquette ?', 'Dans presque tous les formulaires, la ligne « 🏷️ Étiquettes » : clique sur « + », tape le début du nom ou crée une nouvelle étiquette. La liste de toutes les étiquettes est dans Listes → Étiquettes.'],
            ['Comment repérer une erreur de génération (père confondu avec son fils homonyme) ?', 'Maintenance → Âges et écarts : en plus des âges au mariage et des parents trop jeunes ou trop vieux, une fratrie étalée sur deux générations, un ancêtre Sosa trop jeune ou trop vieux pour sa place dans la lignée, un décès avant la naissance ou un mariage après le décès.'],
            ['Comment protéger une fiche contre les modifications ?', 'Le cadenas en haut de la fiche la verrouille : plus rien ne peut y être changé, même par le travail à deux.'],
            ['Qui est le de cujus, et pourquoi porte-t-il le n° SOSA 1 ?', 'Le de cujus est la personne de départ de l’arbre : c’est elle le Sosa n°1, son père le 2, sa mère le 3, etc. Menu Aller → « De cujus » (⌘⇧H ou Ctrl+Maj+H) ouvre sa fiche. Pour en changer : Maintenance → Apparence → Numérotation Sosa, cherche la personne puis « Recalculer » ; le choix est enregistré dans la base, il suit donc la sauvegarde et un autre ordinateur.'],
            ['Comment créer mon propre onglet dans la barre du haut ?', 'Maintenance → Éditeur d’onglets → « + Nouvel onglet ». Pars d’une page composée vide, d’un écran de l’app, d’une copie du tableau de bord, d’un de tes onglets ou d’un modèle (Mon bureau de recherche, Mon village, Arbre et carte…). Dans la page, pose ce que tu veux : n’importe quel écran de l’app (une liste, un diagramme, une statistique, la fiche d’une personne, la carte, une de tes listes, un outil de Maintenance), avec sa hauteur et ses menus si tu veux, des widgets, tes statistiques, des textes libres. « ↗ En grand » ouvre l’écran. Un onglet peut aussi être un simple raccourci vers un écran. Choisis son nom et son icône ; range-le ou masque-le dans Maintenance → Apparence → « Ordre du menu principal », avec les autres onglets ; « Partager » en fait un fichier.'],
        ]],
        ['Graphiques et statistiques', [
            ['Comment voir qui se cache derrière une barre d’une statistique ?', 'Clique sur la barre, la colonne, la part ou la ligne de légende : une fenêtre montre les personnes comptées, avec une recherche, un tri par nom ou par naissance et un export CSV. « autres » montre aussi les valeurs regroupées.'],
            ['Pourquoi « autres » a des rayures ?', '« autres » réunit toutes les petites valeurs : il ne donne plus l’échelle du graphique (sinon les vraies valeurs n’auraient presque plus de couleur). Ses rayures disent qu’il dépasse l’échelle.'],
            ['Comment enregistrer une statistique en image ?', 'Graphiques → Mes statistiques → la statistique : « Image PNG » (net, pour un forum) ou « Image JPG » (plus léger, pour un courriel), « CSV » pour un tableur, « Imprimer / PDF ».'],
            ['Où ranger mes résultats ADN ?', 'Onglet « 🧬 ADN », caché au départ : Maintenance → Apparence → ordre du menu, coche « ADN ». Attention : en France, faire un test ADN généalogique est interdit hors cadre médical ou de recherche (Code civil art. 16-10, Code pénal art. 226-28-1 : 3 750 € d’amende) ; la mise en garde et les liens vers les textes officiels sont dans « ⚖️ Loi et mises en garde ». L’onglet range tests, haplogroupes, correspondances (import CSV), groupes (méthode de Leeds), segments (navigateur de chromosomes), propose un calculateur de cM et montre les lignées Y, mt et X de l’arbre. Tout est réglable dans « ⚙️ Réglages ».'],
            ['Comment dessiner un blason, un logo, ou refaire une image en vectoriel ?', 'Listes → Outils de modification → « ✒️ Dessin vectoriel » (ou « 🛡️ Nouveau blason »), le bouton ✒️ des armoiries d’une fiche, ou Maintenance → Tableaux → Formes (✒️ sur une forme). Outils façon Illustrator : plume, crayon, formes, texte, sélection directe des points, calques, groupes, masques, Pathfinder, dégradés. Onglet « Blason » : écu, partition, pièce, émaux, meubles et blasonnement automatique. Blason → « Vectoriser une image » refait un blason scanné en tracés. Import SVG, PNG, JPG, WEBP, GIF, BMP ; export SVG, PNG, JPG, WEBP, PDF ; enregistrement dans « Mes formes », dans les médias d’une fiche ou comme image d’armoiries.'],
            ['Comment dessiner le plan d’une maison de famille, en 2D et en 3D ?', 'Listes → « 🏠 Maisons de famille » (ou Outils de modification → Plan de maison). ⬚ Glisse une pièce : ses murs se font tout seuls et sa surface s’affiche ; ▬ trace des murs au clic (aimantés à la grille, aux coins, aux angles droits) ; 🚪 et 🪟 un clic sur un mur. Mobilier : plus de 50 objets (lit clos, pétrin, rouet, poêle, horloge comtoise…), ou les tiens : 📥 Importer une image vue de dessus, ou un fichier 3D (OBJ avec MTL, STL, glTF, GLB). Matériaux des murs (pierre, brique, colombage, lambris, papier peint…) et des sols (tomettes, parquet, dalles…), étages, toit, un plan scanné à calquer (mis à l’échelle en deux clics), et la « Vue 3D » où l’on tourne et visite. La maison est reliée à un lieu et à ses habitants ; chaque pièce garde ses souvenirs.'],
            ['Comment poser une statistique dans une fiche, une enquête, l’Atelier ou la fiche d’une personne ?', 'Partout où l’on pose un diagramme (bloc 📊 d’une Fiche, « + Diagramme » d’une enquête, d’un projet de l’Atelier, bloc Diagrammes d’une personne, tableau de bord), la fenêtre propose : ＋ Nouveau diagramme, 📊 D’une statistique (une statistique de l’app, un exemple ou une des tiennes, dessinée avec le type de ton choix et tenue à jour), et 📥 Importer (un diagramme ou une statistique partagée en fichier, un CSV, un tableau collé, une page Wikipédia, une image de graphique). « ＋ Créer une nouvelle statistique » mène à l’Éditeur de statistiques.'],
            ['Les statistiques peuvent-elles utiliser les frises, parts et liens des diagrammes ?', 'Oui. Dans l’Éditeur de statistiques, « Dessin » propose les dessins simples puis tous les types de Mes diagrammes : parts (camembert, anneau, mosaïque, jauges, pictogrammes…), chiffres (colonnes, courbe, radar, pyramide, carte de chaleur…), assemblées (hémicycle…), liens (nuage de mots) et, avec une liste de personnes, la frise de vies, la frise chronologique et le flux des migrations (lieu de naissance → lieu de décès). Les types sont les mêmes des deux côtés : Maintenance → « Types de diagrammes » (ou ⚙️ Ranger les types dans la galerie) pour leur ordre, cacher ceux qui ne servent pas et faire tes propres groupes.'],
            ['Comment créer ma propre statistique à partir de données externes (Wikipédia, tableur, image) ?', 'Là où l’on pose un diagramme, « 📥 Importer » : 📄 Fichier (CSV, ou un diagramme ou une statistique LCNDA), 📋 Coller un tableau (première colonne = les noms, colonnes suivantes = les chiffres, une ligne de titres devient le nom des séries), 🌐 Page Wikipédia (colle l’adresse : les tableaux et les images de graphiques de la page s’affichent, choisis-en un ; il faut Internet), 🖼️ Image d’un graphique (camembert, barres, colonnes, courbe ou hémicycle : l’app repère les couleurs et propose les parts, longueurs ou sièges ; tu nommes, tu corriges, tu indiques la vraie valeur du haut). Ensuite tu choisis le dessin et tu règles tout dans l’éditeur. Le pas-à-pas est aussi dans Maintenance → Types de diagrammes.'],
            ['Comment tenir la bibliographie, les œuvres, la discographie ou la filmographie d’un artiste ?', 'Sur sa fiche, coche « Artiste » (Modifier → Blocs à afficher) et choisis sa discipline. Apparaissent alors les blocs 📚 Bibliographie, 🖼️ Œuvres et inventaire, 💿 Discographie (musicien, chanteur, compositeur, chef, groupe) et 🎬 Filmographie (cinéaste, acteur, vidéaste) ; un bloc déjà rempli reste toujours visible. « Tout voir, modifier » ouvre le catalogue en plein écran : ＋ Ajouter, 📥 Importer, ⤓ Exporter (tableur CSV, impression, sauvegarde JSON), recherche dans tout (même les paroles), tri par année, par titre ou dans ton ordre (↑ ↓).'],
            ['Comment faire l’inventaire des œuvres d’un artiste ?', 'Catalogue de l’artiste → 🖼️ Œuvres et inventaire : n° d’inventaire (proposé à la suite du dernier), n° du catalogue raisonné, technique, support, dimensions, signature, où est l’œuvre (dans la famille, musée, collection privée, vendue, prêtée, perdue…), lieu précis, propriétaire, état, valeur estimée, provenance, expositions, photos. La vue « Inventaire » donne le tableau avec le total des valeurs ; « 🖨️ Imprimer l’inventaire illustré » le met sur papier avec les photos. 📥 Importer : un tableau de ton tableur collé tel quel (colonnes N°, Titre, Date, Technique, Dimensions, Lieu, Propriétaire, État, Valeur… reconnues toutes seules), ou les œuvres connues de Wikidata (celles des musées, avec leur image).'],
            ['Comment faire une discographie complète, morceau par morceau, comme sur Discogs ?', 'Catalogue de l’artiste → 💿 Discographie : chaque disque a son genre (album, EP, single, compilation, live, BO…), label, n° de catalogue, format, pays, date, genre et styles, code-barres, production, studio, ses photos (recto, verso, disque, livret, intérieur), ses crédits, ses titres (n°, titre, durée — la durée totale se calcule ; 📝 pour les paroles, les notes et annotations, les crédits du titre et la version) et ses éditions et pressages (format, label, n° de catalogue, pays, année, code-barres). 📋 « Coller une liste de titres » remplit tout d’un coup. Clic sur un disque : sa page comme sur Discogs, avec les paroles qu’on déplie.'],
            ['Comment importer une discographie depuis Discogs (ou MusicBrainz, Apple Music) ?', 'Catalogue → 💿 Discographie → 📥 Importer → Discogs : colle l’adresse de la page de l’artiste (…discogs.com/artist/…), d’un album (…/master/…) ou d’un disque (…/release/…). Pour un artiste, ses parutions s’affichent à cocher (les participations décochées) ; chaque album vient avec ses titres, durées, crédits, label, format, pochettes et la liste de ses éditions. Discogs limite le rythme : un peu plus d’une seconde par disque. Pour chercher par nom, il faut un jeton Discogs gratuit (discogs.com → Paramètres → Développeurs) à mettre dans 🔑 Clés. Sans clé : MusicBrainz (albums, titres, éditions, pochettes de Cover Art Archive), Apple Music (titres et durées) ou Wikidata. Les pochettes sont rapatriées dans les médias de la fiche (case à cocher). Il faut internet.'],
            ['Comment importer une filmographie (IMDb, TMDb) ?', 'Catalogue → 🎬 Filmographie → 📥 Importer : « Wikidata » avec le nom de la personne, ou « Une adresse IMDb » (…imdb.com/name/nm…) : IMDb n’a pas d’accès libre, mais Wikidata relie chaque fiche IMDb et donne films, métiers (acteur, réalisation, scénario, musique, image, montage, production), rôles, réalisateur, durée et identifiant IMDb du film. Avec une clé TMDb gratuite (🔑 Clés), « TMDb » ajoute les affiches, résumés, distribution, pays et sociétés. Tout se corrige ensuite à la main (rôle, prix, festivals, notes).'],
            ['Comment importer une bibliographie ?', 'Catalogue → 📚 Bibliographie → 📥 Importer : Open Library par ISBN (au dos du livre), tous les livres d’un auteur, ou les livres sur un sujet (ils arrivent en « Sur lui / sur elle »), ou Wikidata. Couverture, éditeur, année, pages, ISBN et langue sont remplis. Chaque livre dit son lien avec l’artiste (de lui, sur lui, illustrations, traduction, préface, catalogue d’exposition) et où le trouver (bibliothèque, cote, chez nous).'],
            ['Quelles formes pour l’arbre décoratif à imprimer ?', 'Listes → Outils de modification → 🌳 Arbre décoratif → ＋ : éventail (demi-cercle, 240°, trois-quarts 270°), roue, arbre dessiné (tronc, branches, feuillage), arbre en cases de bas en haut, ou tableau d’ascendance de gauche à droite. Jusqu’à 12 générations pour les éventails et la roue, 8 pour l’arbre dessiné, 7 pour les cases (le nombre proposé suit la forme). L’arbre s’ouvre ensuite dans le dessin vectoriel pour tout retoucher.'],
            ['Comment créer mon propre style ou mon propre format d’arbre décoratif ?', 'Dans la fenêtre de l’arbre : « ＋ » à côté de Style (ou 🎨 Mes styles) : un nom, le style de départ, la police, et chaque couleur (papier, encre, titre, case de la personne, côtés paternel et maternel, cases vides, tronc, feuilles) avec un aperçu. ⚙️ à côté de Format (ou ⚙️ Mes formats) : tes formats en cm (de 5 à 500), et pour tous, formats comme styles, coche ceux qu’on voit et range-les avec ↑ ↓. Les mêmes réglages sont dans Maintenance → « Montage, retouche, mise en page et son » → 🌳 Arbre décoratif, avec la forme, le format et le style proposés au départ.'],
            ['Comment ranger les formes de l’arbre décoratif ou leur donner un raccourci ?', '« ⚙️ Personnaliser » dans la fenêtre de l’arbre, ou Maintenance → « Montage, retouche, mise en page et son » → Boutons et options → 🌳 Arbre décoratif : cache ou range les formes et les boutons. Juste en dessous (et dans Maintenance → Raccourcis clavier), donne une touche à une forme, à « Mes formats », « Mes styles » ou à « Fabriquer l’arbre ».'],
            ['Comment dessiner une maison au centimètre près ?', 'Dans le plan, en traçant un mur (▬), une cote (📏) ou une pièce libre : clique le point de départ puis tape la longueur au clavier (350, 3,5 m, 35 mm) et Entrée ; ajoute l’angle avec @ (350 @ 90 : vers le haut ; 0 à droite, 180 à gauche). Avec l’outil pièce (⬚), tape « 420 x 350 ». En haut à gauche : la position de la souris, la longueur et l’angle du trait en cours. 🧲 Aimants : grille (1 à 100 cm), coins, milieux des murs, le long des murs, alignements (lignes de rappel roses), pas des angles (90° à 1°). Alt : sans aimant. Les flèches décalent ce qui est choisi de 1 cm (⇧ : un pas de grille). Dans Propriétés : longueur, angle et coordonnées des murs, distances d’une porte ou fenêtre aux bouts du mur, X et Y des meubles.'],
            ['Comment mesurer dans la vue 3D de la maison ?', 'Vue 3D → « 📏 Mesurer », puis deux clics sur la maison : la distance, la distance au sol et la différence de hauteur. « Cotes » affiche la longueur de chaque mur et la hauteur sous plafond ; « Dessus », « Face », « Côté » placent la caméra. L’épaisseur des planchers entre deux étages se règle dans l’onglet Étage.'],
            ['Comment avoir plus de meubles et d’objets dans le plan de maison ?', 'Onglet « Mobilier » : plus de 300 objets d’hier et d’aujourd’hui, rangés en catégories (Chambre, Séjour, Cuisine, Salle d’eau, Rangement, Bureau, Enfants, Religion et souvenirs, Métiers, Ferme et animaux, Jardin, Structure). Tape un mot dans « Chercher » : lit clos, pétrin, horloge comtoise, vache… Clic sur l’objet : il se pose au milieu de la vue.'],
            ['Comment créer mon propre objet pour le plan de maison ?', 'Mobilier → « ＋ Créer un objet » : son nom, sa catégorie (ou une nouvelle), sa taille en cm, sa couleur, sa forme vue de dessus et en 3D, et si tu veux une photo vue de dessus. Il est gardé pour toutes tes maisons, dans sa catégorie et dans « Mes objets » ; ✎ pour le modifier ou le supprimer.'],
            ['Comment télécharger des meubles 3D gratuits, libres de droit ?', 'Mobilier → « 📦 Bibliothèque en ligne » : les modèles de Poly Haven, libres de droit (CC0), se cherchent et s’importent en un clic. Onglet « Pack ZIP » : télécharge un pack CC0 (Kenney, Quaternius…) sur le site de l’auteur, choisis le fichier .zip et coche les modèles à garder. Ils arrivent dans « Mes objets », avec leur licence, leur auteur et leur source (✎ pour les voir).'],
            ['Comment cacher ou ranger les catégories et les objets du mobilier ?', 'Mobilier → « ⚙️ Ranger » : coche ce que tu veux voir et range avec ↑ ↓ les catégories, puis les objets de chaque catégorie. « ↺ Remettre comme au départ » revient au rangement d’origine.'],
            ['Comment faire une carte à la bonne échelle, sans la déformer ?', 'Listes → Outils de modification → 🗺️ Carte → « ＋ Nouvelle carte » : choisis le format, puis situe la carte (le lieu et la largeur couverte) : l’échelle est alors juste. La « Grille d’échelle » (carreaux de 100 m, 1 km…, jamais imprimée) aide à placer chaque chose à sa place, et un objet choisi montre sa longueur ou sa surface réelles.'],
            ['À quoi servent « Mode Blason » et « Mode Carte » en haut du dessin ?', 'Coche-les pour faire apparaître à droite l’onglet et le menu du blason ou de la carte ; décochés, ils restent cachés pour garder un éditeur simple.'],
            ['Comment ranger les listes (ou les pages de Maintenance) en groupes ?', 'En bas de la colonne de gauche, « Réordonner » : coche ou décoche « Ranger en groupes ». En groupes : range, renomme, crée ou efface des groupes, change une liste de groupe, choisis si les groupes sont ouverts ou fermés. En une seule liste : range avec ↑ ↓. Chaque façon garde ses réglages, tu les retrouves en changeant. « Mes listes » restent toujours en bas, à part : on les range seulement entre elles. Le même réglage est dans Maintenance → Apparence.'],
            ['Comment ranger un dessin dans un groupe ou un calque ?', 'Onglet Calques : glisse la ligne sur le groupe (il devient bleu) ; ou choisis l’objet puis « 📁 Ranger dans… ». Double-clic sur un nom pour le renommer.'],
            ['Comment ranger ou cacher les boutons de l’outil Maison, ou lui donner mes raccourcis ?', 'Dans l’outil, « ⚙️ Personnaliser » (en haut), ou Maintenance → « Montage, retouche, mise en page et son » → Éditeur « 🏠 Maison (plan et 3D) » : barre du haut, outils de la colonne de gauche, barre de la vue 3D et onglets du panneau, à cocher et ranger, à garder en ensembles nommés ; et en dessous tes raccourcis clavier pour chaque commande.'],
            ['« Poser une question » sait-il calculer, pas seulement lister ?', 'Oui (Recherche → Poser une question en français). En plus des listes (« Quels ancêtres étaient boulangers à Lille avant 1850 ? »), il répond aux questions qui demandent un calcul : le lien de parenté entre deux personnes (« Quel est le lien entre Jean Dupont et Marie Durand ? » → cousins issus de germains, oncle à la mode de Bretagne, ancêtres communs, degré civil) ; les records (qui a vécu le plus longtemps, mort le plus jeune, famille la plus nombreuse, marié le plus jeune ou le plus tard, plus grand écart d’âge entre époux, ancêtre le plus ancien) ; les moyennes (âge au mariage, au décès, au premier enfant, enfants par couple) ; les plus fréquents (prénoms, noms, métiers, communes, mois et saisons) ; une personne (« Quand est né… », « Où est mort… », « Quel âge avait… à son mariage », « Quel âge aurait… aujourd’hui ») ; les époques (« Qui a connu la Grande Guerre ? », « Qui avait 20 ans en 1914 ? », « Qui était vivant en 1900 ? ») ; les comptes (« Combien d’ancêtres ai-je ? », par génération). On ajoute « hommes », « femmes », « ancêtres », « au XIXe siècle »… La liste des exemples est sous la case : « Et aussi des questions qui demandent un calcul ».'],
            ['L’app reconnaît-elle les visages sur les photos ?', 'Oui, sur ton ordinateur seulement : Listes → Médias → « 🏷️ Qui est qui ? ». Identifie d’abord quelques visages à la main (visionneuse → Identifier), au moins une fois par personne ; « Analyser » repère alors les visages de toutes les photos et calcule leur empreinte. Onglet 💡 Propositions : « c’est sans doute Marie Martin » (très probable ou probable, avec le pourcentage de ressemblance) ; ✓ Oui, Quelqu’un d’autre… ou Ignorer, ou tout accepter d’un coup pour les très probables. Onglet 👥 : les visages inconnus qui se ressemblent d’une photo à l’autre, à nommer d’un seul geste. Chaque visage validé devient une identification ordinaire de la photo (certitude « probable »). Le modèle (≈ 13 Mo) se télécharge une fois, vérifié par son empreinte ; les photos ne sont envoyées nulle part. La « Détection de visage » simple reste à côté.'],
            ['ADN : comment regrouper mes correspondances et deviner où placer un cousin ?', 'Onglet ADN → « 🔗 Groupes automatiques » : les correspondances qui se correspondent entre elles (correspondances en commun notées ou importées, segments qui se chevauchent) forment des grappes, montrées dans une matrice colorée ; chaque grappe reçoit ses noms et lieux fréquents, son côté, et le couple d’ancêtres commun (certain si une correspondance est déjà reliée à une fiche, probable d’après les noms de l’arbre). Un clic les range en groupes. « 📍 Placer un cousin » : pour une correspondance (ou des cM tapés à la main), les relations possibles (Shared cM Project) puis les couples de ton arbre par lesquels elle descend probablement, avec un pourcentage et les indices (côté, noms, lieux, grappe, âge) ; « Retenir » le note dans la correspondance. Le test doit être relié à la fiche de la personne testée. C’est une piste, jamais une preuve.'],
            ['Que me manque-t-il dans ma généalogie, et où le chercher ?', 'Recherche → Type de recherche → « 🔍 Que manque-t-il ? ». Pour chaque ancêtre de la lignée (jusqu’à 12 générations) : la naissance, le mariage, le décès ou les parents qui manquent, mais aussi les recensements (1836-1936), le registre matricule (hommes nés de 1847 à 1921), la succession et le contrat de mariage ; avec la commune, la fenêtre d’années, le service d’archives (Archives départementales de tel département, d’après le lieu) et les séries à consulter selon l’époque : registres paroissiaux avant 1792, état civil et tables décennales ensuite, notaires (3 E), enregistrement (3 Q), recrutement (1 R), recensements (6 M). Range par service d’archives, commune, ancêtre ou sorte d’acte ; « 📌 Au suivi » ajoute la recherche « à faire » dans le Dépouillement d’archive, et ce qui y est déjà s’affiche. « 🖨️ Imprimer » fait la liste pour une visite aux archives.'],
            ['Comment récupérer la signature d’un ancêtre ou créer un monogramme, un cachet de cire ?', 'Listes → Outils de modification → « 🔤 Signatures et sceaux ». ✍️ Choisis l’image d’un acte (médias ou ordinateur), encadre la signature en glissant : le papier jauni, les taches et les lignes du registre s’effacent (seuil réglé tout seul, à affiner), l’encre devient un tracé vectoriel net, dans sa couleur d’origine ou une encre choisie ; l’image détourée (fond transparent) peut aussi aller dans les médias de la personne. 🔏 Pour un monogramme : les initiales entrelacées (anglaise, ronde, gothique, capitales romaines, Didot), dans un cachet de cire, un tampon encreur, un médaillon, un écu, un losange ou un ex-libris, avec une légende qui tourne autour (« FAMILLE MARTIN · TULLE 1832 »). Tout s’ouvre dans le dessin vectoriel pour être retouché, imprimé ou exporté.'],
            ['Comment faire un faire-part, une invitation ou une affiche de cousinade ?', 'Listes → Outils de modification → « 📰 Faire-part et affiches » (ou Graphiques). Choisis le genre (naissance, baptême, mariage, décès, cousinade, noces d’or, article de presse ancienne, invitation), un style (Belle Époque, Art nouveau, Art déco, années 50, classique, moderne, deuil) et un format ; choisis une personne de l’arbre : les noms, dates, lieux, âges et la famille se remplissent tout seuls. Le résultat s’ouvre dans l’outil vectoriel : chaque texte, ornement et la photo se modifient, puis on imprime (ou PDF) et on exporte (PNG, JPG, SVG).'],
            ['Comment faire un diaporama ou le récit en images d’un ancêtre ?', 'Listes → Outils de modification → « 🎞️ Présentation et diaporama ». « ✨ Récit d’une personne » fabrique tout seul le diaporama d’une vie : un titre, ses photos, une carte où se dessine le trajet des lieux de sa vie, sa biographie. On ajoute ensuite des photos (avec un lent mouvement de caméra), des titres, des cartes de trajet (une migration : des lieux à ajouter, ou ceux de la vie d’une personne), sa voix sur chaque diapositive (🎙), une musique qui baisse quand la voix parle ; on lit en plein écran et on exporte en vidéo (Médias ou téléchargement).'],
            ['Comment faire une présentation comme avec Keynote ou PowerPoint ?', 'Listes → Outils de modification → « 🎞️ Présentation et diaporama » → « ＋ Nouveau » → « 🎤 Présentation (façon Keynote) », puis choisis un thème et un format (16:9, 4:3, carré, vertical, A4, sur mesure). À gauche les diapositives (glisse-les pour les ranger ; ⧉ dupliquer, 👁 sauter à la lecture, § commencer une section qui se replie) ; « ＋ Diapositive ▾ » propose les dispositions : titre, titre et texte, titre et photo, photo pleine page, photo et texte, deux colonnes, citation, section, chiffre clé, une personne. En haut : insérer un texte, une forme (rectangle, ellipse, étoile, flèche, bulle, ligne…), une image, un tableau, un graphique, la fiche, le portrait, le petit arbre ou la frise de la vie d’une personne de la base, une vidéo ou un son. Un objet se déplace, s’agrandit (⇧ : proportions, ⌥ : depuis le centre), tourne (poignée du haut) et se cale sur les autres grâce aux guides ; ⌥ en glissant le copie. À droite, l’inspecteur : Format (police, taille, gras, listes, couleurs, bordure, ombre, recadrage et masque des photos…), Animer, Diapositive (fond couleur, dégradé ou image, notes), Objets (devant, derrière, cacher, verrouiller) et Document (thème, polices, format, musique). ⌘Z annule, ⌘C ⌘V copient (aussi d’une présentation à l’autre), ⌘G groupe, ⌘L verrouille.'],
            ['Comment animer une présentation (transitions, apparitions, déplacement magique) ?', 'Dans la présentation, onglet « ✨ Animer » à droite. La transition joue en arrivant sur la diapositive : fondu, dissoudre, fondu par le noir, pousser, glisser, révéler, balayage, zoom, échanger, retourner, cube, ou « déplacement magique » : duplique la diapositive (⧉), bouge, agrandis ou tourne les objets sur la copie, et ils glissent d’une place à l’autre à la lecture (des objets du même nom marchent aussi). Choisis un objet puis « ＋ Entrée » ou « ＋ Sortie » : apparition, fondu, arrivée depuis un côté, agrandir, rebond, chute, balayage, flou, tourbillon, machine à écrire pour un texte ; chaque animation part au clic, avec la précédente ou après elle, avec sa durée et son attente ; « Ordre des animations » les range (↑ ↓) et « ▶ Aperçu » les montre.'],
            ['Comment présenter avec mes notes, la diapositive suivante et un chronomètre ?', 'Dans la présentation : « ▶ Lire » (depuis le début, ou « ⏵ D’ici ») passe en plein écran ; → espace ou clic : suivante, ← : précédente, un numéro puis Entrée : aller à la diapositive, B : écran noir, W : écran blanc, L : pointeur laser, Échap : quitter. « 🎤 Présentateur » (ou P pendant la lecture) ouvre une deuxième fenêtre à mettre sur ton écran : la diapositive en cours, la suivante (ou les animations qui restent), tes notes (A− A+), le chronomètre et l’heure. Les notes s’écrivent sous la diapositive (📝 Notes) ou dans l’onglet Diapositive. Une diapositive peut aussi passer toute seule à la suivante, et la présentation recommencer en boucle (borne, exposition).'],
            ['Comment importer un PowerPoint, un fichier LibreOffice, Keynote ou un PDF ?', 'Listes → Outils de modification → « 🎞️ Présentation et diaporama » → « ⤒ Importer une présentation », ou « ⤒ Importer » dans une présentation ouverte (ajouté après la diapositive affichée, ou à la place). PowerPoint (.pptx) et OpenDocument / LibreOffice Impress (.odp) : chaque diapositive avec ses textes à leur place (tailles, gras, couleurs, listes), ses images (rangées dans les Médias), ses formes, ses tableaux, ses graphiques, ses notes et ses transitions. Keynote (.key) a un format fermé : dans Keynote, Fichier → Exporter vers → PowerPoint, puis importe le .pptx. Un PDF donne ses images (scans, photos), une par diapositive : son texte ne peut pas être lu ici. Aussi : des photos (une diapositive par photo), un texte ou un Markdown (« # Titre » commence une diapositive, « - » fait une puce, « --- » sépare, « Notes: » les notes) et le fichier .json d’une présentation de l’app.'],
            ['Comment exporter une présentation en PDF, en images ou en vidéo ?', 'Dans la présentation, « ⤓ Exporter » : PDF ou impression (une diapositive par page, ou avec les notes de l’orateur sous chaque diapositive ; dans la fenêtre d’impression, choisis « Enregistrer en PDF »), la diapositive affichée en PNG, toutes les diapositives en PNG (un fichier .zip), une vidéo WebM (chaque diapositive le temps de sa durée, avec la musique ; à garder dans les Médias ou à télécharger) et le fichier de la présentation (.json, pour la rouvrir ailleurs avec « ⤒ Importer »). Un diaporama simple peut devenir une présentation : « 🎤 En présentation » dans le diaporama.'],
            ['Comment ranger, cacher les boutons de la présentation et choisir ses réglages de départ ?', 'Dans la présentation, « ⚙️ Personnaliser » : chaque groupe de boutons du haut (insérer, disposer, lecture, fichier), la barre au-dessus des diapositives, la barre du bas, les onglets de l’inspecteur et les sections de chaque onglet (Position et taille, Texte, Image, Animations…) se montrent, se cachent et se rangent ; une disposition se garde sous un nom avec « 💾 Réglages enregistrés ». C’est aussi dans Maintenance → Montage, retouche, mise en page et son (éditeur « 🎤 Présentation »), avec le thème, le format, la transition et la disposition de départ, l’aimant, la couleur du pointeur laser, le plein écran à l’ouverture et les raccourcis clavier à soi.'],
            ['Comment restaurer une vieille photo abîmée ?', 'Listes → Outils de modification → Retouche des photos → « 🧭 Restaurer une vieille photo », ou dans la Retouche : l’onglet « 🧭 Restaurer » (menu Image). Huit étapes, chacune facultative : redresser et recadrer ; enlever le jaunissement et raviver les couleurs ; repérer et enlever tout seul les poussières et petites taches ; combler rayures, plis et déchirures (correcteur, tampon) ; réduire le grain ; rendre un visage plus net (entouré à l’ellipse) ; coloriser (tout seul, ou au pinceau avec une palette de teintes d’époque) ; comparer avant / après et enregistrer comme nouvelle version (l’original reste).'],
            ['Comment transcrire un acte (baptême, mariage, décès, acte notarié) ?', 'Listes → Outils de modification → « 📜 Transcription d’actes », ou dans la visionneuse d’une image : « 📜 Atelier ». L’image de l’acte est à gauche (zoom, contraste, négatif, rotation), le texte à droite (avec les caractères anciens : ſ, œ, [illisible]…). Choisis un passage puis dessine sa zone (▭ Zone) : un clic sur l’un surligne l’autre. « Lire (imprimé) » lit un texte tapé et pose les zones ligne par ligne ; « Lire (manuscrit) » utilise un modèle d’écriture installé. « 🧭 Repérer » trouve les noms et leur rôle (parrain, témoin, fils de…), les dates même en toutes lettres (« l’an mil sept cent quatre-vingt-dix ») ou au calendrier républicain (converties), les lieux et les métiers, et propose les fiches qui leur ressemblent. « 📋 Modèle » donne la trame d’un acte à compléter.'],
            ['Comment imprimer un bel arbre en grand format (éventail, roue, arbre dessiné) ?', 'Graphiques → « 🌳 Arbre décoratif à imprimer », ou Listes → Outils de modification → « 🌳 Arbre décoratif » : choisis la personne, la forme (éventail, éventail ouvert, roue, arbre dessiné avec tronc, branches et feuillage), le nombre de générations, le format (A4 à A0, affiches), le style (parchemin, classique, botanique, héraldique, moderne, noir et blanc) et ce qui est écrit (années, dates, lieux, métiers, numéros Sosa, cases vides, portraits). L’arbre s’ouvre dans le dessin vectoriel : tout se retouche (couleurs, polices, ornements, blason), puis Fichier → Imprimer / PDF ou Exporter en PNG.'],
            ['Comment dessiner un plan de ville, de village ou une carte de région ?', 'Dans le Dessin vectoriel : menu Plan → « Mode Plan », ou l’onglet 🗺️ Plan à droite. Choisis ce que tu dessines dans la palette (route, rue, chemin, rivière, forêt, champ, bâtiment, église, moulin, nom de lieu…), puis un clic par point : les routes se raccordent, les rivières s’élargissent, les noms suivent les rues. Styles d’époque (état-major, cadastre napoléonien, Cassini, parchemin), échelle, rose des vents, cartouche et légende automatique. « Fond de carte d’un lieu » ou « Image de référence » pose une carte ou un vieux plan en transparence pour décalquer ; « Lieux de la base » place tes lieux ; chaque objet peut être relié à une personne ou à un lieu et avoir ses années (curseur du temps).'],
            ['Comment faire un hémicycle, un fer à cheval ou la frise des membres d’un groupe ?', 'Graphiques → « Mes diagrammes » → « + Créer un diagramme » : 25 dessins (parlement en hémicycle, arc, fer à cheval, Westminster, cercle, salle ; frise des membres façon Wikipédia, frise de vies, planning ; colonnes, camembert, pyramide, flux, organigramme, Venn, nuage de mots, jauges…). Tape tes chiffres, colle-les d’un tableur, importe un CSV ou prends-les dans l’app (« Depuis l’app », avec « Tenir à jour »). Il se pose ensuite dans un widget, une fiche, la fiche d’une personne, une enquête, l’Atelier (onglet « Rattacher ») ou la mise en page (Objet → Insérer un diagramme).'],
            ['Comment créer mon propre graphique ou ma propre statistique ?', 'Maintenance → Éditeur de statistiques → « + Nouvelle statistique » (ou « + Créer une statistique » en bas de Graphiques). Pars de rien (compter des personnes, des événements, une de tes listes… par métier, par lieu, par décennie, par siècle), d’une statistique de l’app (Noms, Prénoms, Lieux, Années de naissance…) redessinée à ta façon, d’un de tes widgets ou d’un exemple. Huit dessins : barres, colonnes, camembert, anneau, courbe, aire, mosaïque, tableau. Elle apparaît dans Graphiques → « Mes statistiques », et peut aussi aller sur le tableau de bord ou dans un de tes onglets.'],
            ['Comment mettre beaucoup de conditions dans un graphique (ex. les bûcherons à 4 km de Pernay, mariés, avec deux enfants) ?', 'Dans l’Éditeur de statistiques, pars d’une statistique de l’app (Noms, Prénoms, Lieux…) ou d’un graphique de zéro, puis « + Critère » autant de fois que tu veux : métier, prénom, nom, lieu, à moins de … km d’une ville, entre deux dates précises, a eu un événement (mariage, divorce, voyage…), nombre d’enfants (« 2 et 2 » = exactement deux), nombre d’unions, nombre d’événements d’un type, âge à un événement, durée de vie, sexe, étiquette, mes ancêtres. « ✨ Proposer une légende » écrit la phrase qui résume les critères.'],
            ['Comment partager une statistique sur un forum ou avec une association ?', 'Graphiques → Mes statistiques → ta statistique : « 🖼️ Image PNG » (à poster), « 📄 CSV » (les chiffres pour un tableur) ou « 🖨️ Imprimer / PDF ».'],
            ['Où afficher ma statistique : dans Graphiques, sur le tableau de bord, dans un onglet ?', 'Dans l’éditeur, « Où l’afficher » : coche Graphiques et/ou le tableau de bord. Pour un de tes onglets : ajoute-la depuis la colonne de gauche de l’onglet, ou dans Maintenance → Éditeur d’onglets.'],
            ['Prénom et saint du jour : comment voir les personnes concernées ?', 'Graphiques → Statistiques → Prénom et saint du jour, tout en bas : la liste des personnes qui portent le prénom du saint de leur naissance ou de leur baptême (ou toutes), triable par date, par jour de l’année, par nom ou par saint. Clique sur une époque ou une famille dans les tableaux pour ne garder qu’elle.'],
            ['Prénoms : la famille et la France, comment voir tout le monde ?', 'Dans la colonne « Dans la famille », clique sur « + 12 personnes » (le nombre varie) pour déplier la liste complète, et sur « Replier » pour la refermer.'],
            ['Comment garder les réglages d’un graphique ?', 'En bas de la colonne de Graphiques, « + Enregistrer la vue » : le diagramme, la personne, la profondeur et les couleurs sont gardés dans l’onglet « Enregistrés ».'],
        ]],
        ['Recherche', [
            ['Comment retrouver vite une personne ou un lieu ?', '⌘K (Mac) ou Ctrl+K (Windows, Linux) : tape un nom, un lieu, une battue ou le nom d’un écran.'],
            ['Peut-on poser une question en français ?', 'Oui : Recherche → Type de recherche → « Poser une question en français », par exemple « Quels ancêtres étaient boulangers à Lille avant 1850 ? ». La recherche peut ensuite être enregistrée.'],
            ['Comment chercher un mot dans la page ?', '⌘F (Mac) ou Ctrl+F : les mots trouvés sont surlignés et comptés.'],
            ['Comment revenir à l’écran précédent ?', '⌘← et ⌘→ sur Mac, Alt+← et Alt+→ sur Windows et Linux. Tous les raccourcis : touche F1.'],
            ['Comment faire ma propre liste (ex. tous les divorces entre 1850 et 1920) ?', 'Maintenance → Éditeur de listes → « + Nouvelle liste » : choisis des événements, des personnes, ou des lignes que tu écris toi-même (stands d’un salon…) ; combine les critères, choisis les colonnes, ajoute tes colonnes à remplir (texte, menu, case à cocher, lien, personne de la base) et des étiquettes. Tu peux aussi partir d’une liste de l’app (Naissances, Mariages, SOSA…) ou d’une de tes listes, l’afficher dans l’onglet Listes, et la partager avec un proche (bouton « Partager », puis « Importer une liste… » chez lui). Exportable en CSV et imprimable.'],
            ['Quels actes chercher en priorité ?', 'Ajoute le widget « 💡 Suggestions de recherche » au tableau de bord : les trous de ta lignée Sosa (naissance, mariage, décès, parents inconnus), avec le lieu et les années où chercher, les générations les plus proches d’abord.'],
            ['Où voir l’histoire d’un village ?', 'Listes → Fiche d’un village : les familles, les métiers, l’église, la population au fil des recensements et la carte de Cassini. ⚙️ « Organiser la fiche » range, masque ou élargit chaque partie ; le plan du recensement et un bloc-notes y sont aussi.'],
            ['Comment masquer, ranger ou ajouter des colonnes dans une liste ?', 'Dans toutes les listes en tableau de l’onglet Listes, le bouton « ⚙️ Colonnes ».'],
            ['Comment noter mes rendez-vous et les anniversaires de la famille ?', 'Listes → Mon agenda : salons, visites d’archives, rappels, courriers, circuits, au jour, à la semaine, au mois… Listes → Calendrier de la famille : les événements des fiches au jour, au mois ou à l’année, avec un mode « anniversaires » et la date dans d’autres calendriers (julien, républicain…).'],
        ]],
        ['Lieux et cartes', [
            ['Comment mettre la fiche d’un village précis dans un widget ou un onglet ?', 'Éditeur de widgets (sorte « Écran de l’app ») ou Éditeur d’onglets : écran « Fiche d’un village… » ou « Monographie de commune… », puis la commune. Coche les parties à montrer et range-les (⠿ ou ↑ ↓) : cette organisation ne vaut que là, la fiche du village dans Listes garde la sienne.'],
            ['Un lieu est mal placé sur la carte, que faire ?', 'Maintenance → Lieux mal placés : l’app repère les coordonnées improbables et propose la correction en un clic.'],
            ['Comment changer le fond de carte ?', 'Carte → réglages de la carte : Cassini, État-major, IGN, satellite, cadastre ancien… La fiche d’un village a aussi son propre choix.'],
            ['Comment voir les adresses d’un recensement sur un plan ?', 'Listes → Dépouillements (onglet « Plan ») ou la fiche d’un village : les foyers sont placés d’après leur adresse, l’année au choix. Les anciens noms de rues et les rues disparues se dessinent à la main ; les fonds de carte favoris se choisissent dans Maintenance → Apparence.'],
            ['Comment préparer une sortie sur le terrain ?', 'Listes → Circuits sur le terrain : les étapes (mairies, cimetières, archives), la logistique et la technique de chacune. Listes → Planificateur de visite d’archives pour les cotes à consulter.'],
            ['Un lieu étranger n’est pas proposé ?', 'Les villes du monde sont préparées une fois au premier lancement (quelques minutes). Un lieu introuvable peut toujours être tapé à la main.'],
        ]],
        ['Documents', [
            ['Comment changer l’apparence d’un livret de famille ?', 'Sur le livret : « 🎨 Apparence ». Modèles (livret bleu de 1877, vert de 1975, bordeaux, papier ancien, sobre), couleurs, polices des titres et du texte (« Voir toutes les polices de mon ordinateur » ajoute les tiennes), tailles, disposition, cadre, et l’ordre des parties. Une case en fait l’apparence de tous tes livrets.'],
            ['Comment mettre une image de couverture, des étiquettes, ou enregistrer l’apparence d’un livret de famille ?', 'Sur le livret : « 🎨 Apparence » → « Image de couverture » : choisis une des photos du livret (« aucune » pour l’enlever), en vignette sur la couverture ou en fond ; elle sert aussi d’image dans la liste des livrets. « 💾 Enregistrer cette apparence sous un nom » la garde dans « Mes apparences », pour tous les livrets (× pour en supprimer une). Taille du texte et des titres : curseur ou case en px (texte 8 à 60, titres 8 à 120). « Les parties » : la largeur de chacune (1, 1/2, 1/3, 2/3, 1/4, 3/4), comme les widgets. « 🏷 Étiquettes » en haut du livret ajoute des étiquettes (aussi dans « ✎ Modifier »).'],
            ['Comment supprimer un tableau, ou dire qu’il est en pause ?', 'Dans le tableau, en haut : la liste « En cours / En pause / Terminé » et la poubelle 🗑. Dans la galerie, la poubelle apparaît au survol d’un tableau. La colonne de gauche trie par état ; l’Atelier a les mêmes filtres (et l’état se choisit dans les réglages du projet).'],
            ['Comment faire la fiche d’un animal de compagnie ?', 'Listes → « Animaux de compagnie » → « + Nouvel animal ». Une fiche complète : nom et nom d’affixe, espèce, race, sexe, robe, marques, taille, poids, naissance et décès, puce, tatouage, passeport, livre des origines (LOF, LOOF, SIRE…), numéro d’inscription, ADN, éleveur et affixe, ses maîtres (des fiches de la famille), titres et concours, vaccins, tests de santé, vétérinaire, poids au fil du temps (avec une courbe), les moments de sa vie, son caractère, son histoire, des souvenirs, des photos et documents (pedigree papier, carnet de santé). L’animal apparaît sur la fiche de ses maîtres (bloc « Animaux de compagnie », avec « + Un animal ») et dans le widget « Animaux de compagnie » du tableau de bord (avec les anniversaires).'],
            ['Un animal peut-il avoir une fiche comme une personne ?', 'Oui, si tu le veux : sa fiche d’animal (Listes → Animaux de compagnie) reste la fiche simple ; « ＋ Fiche complète » (ou la case en le créant) lui fait en plus une vraie fiche, comme une personne : arbre, événements, photos, sources, tableaux… avec un bloc « Caractéristiques de l’animal » (race, puce, éleveur, pedigree, consanguinité). Le nom, le sexe, la naissance, le décès et les parents passent de l’une à l’autre. « Personnes » → « + Nouvelle fiche » → 🐾 Un animal crée directement un animal avec sa fiche complète.'],
            ['Comment faire une généalogie d’animaux (un élevage) ?', 'Listes → Animaux de compagnie → « Type de base » : 👪 Famille, 🐾 Élevage ou 👪🐾 Les deux. En Élevage, la liste de gauche, le compteur du haut et les statistiques partent des animaux, et les nouvelles fiches sont des animaux ; le de cujus (la fiche de départ) peut être un animal, l’arbre part alors de lui. Les statistiques ne mêlent jamais personnes et animaux.'],
            ['Comment avoir un onglet « Animaux » à part ?', 'Maintenance → Apparence → Ordre du menu principal : coche « Animaux » (caché au départ). Alors « Personnes » ne liste que les personnes et « 🐾 Animaux » que les animaux, chacun avec sa dernière fiche ouverte. Sans cet onglet, dans la liste de gauche, un cadre « 🐾 Animaux » apparaît entre « Personnes » et « Signets » dès qu’il y a des animaux (et « Personnes » disparaît s’il n’y a que des animaux).'],
            ['Comment voir les animaux dans l’arbre de la famille ?', 'Graphiques → Ascendants, Descendants ou Sablier : coche « 🐾 avec les animaux » (pas coché au départ). Les animaux de chacun sont posés sous leur maître, avec un trait pointillé ; un clic ouvre leur fiche.'],
            ['Comment ranger la fiche d’un animal (montrer, cacher, déplacer ses parties) ?', 'Sur la fiche d’un animal (Listes → Animaux de compagnie) : « ⚙️ Organiser » : coche les parties à montrer et range-les avec ↑ ↓ (identité, origines, pedigree, descendance, maîtres, titres, santé, mesures, vie, histoire, photos…). Le réglage vaut pour toutes les fiches d’animaux.'],
            ['Comment ranger les blocs des fiches complètes d’animaux sans toucher aux personnes ?', 'Maintenance → Apparence → « FICHES ANIMAUX — Ordre et visibilité des blocs » : l’ordre, la largeur et les blocs montrés pour toutes les fiches d’animaux, à part des fiches des personnes. À côté, « Exception pour… » règle seulement la fiche ouverte. Si la fiche ouverte est un animal, l’exception de « FICHES PERSONNES » est grisée (et inversement pour une personne).'],
            ['Où retrouver un animal créé depuis Personnes ou Animaux ?', 'Partout : un animal créé avec « + Nouvelle fiche » → 🐾 Un animal (onglet Personnes ou Animaux) a sa fiche complète et aussi sa fiche dans Listes → Animaux de compagnie. Les deux restent liées.'],
            ['Sur la fiche complète d’un animal, que montre « Identité » ?', 'Ce qui compte pour un animal (espèce, race, sexe, robe, naissance, puce…), jamais les champs d’une personne. « Modifier » ouvre le formulaire de l’animal. Ses autres parties (identification et origines, parents et pedigree, descendance, frères et sœurs, maîtres, titres, santé, poids et taille, sa vie, son histoire, notes, photos) sont des blocs de la fiche, chacun avec ✎ pour aller droit à cette partie du formulaire. Le bloc « Recensements » (et les autres blocs propres aux personnes : maternité, militaire, électeurs…) est caché par défaut ; tu peux le remettre dans Maintenance → Apparence → « FICHES ANIMAUX ».'],
            ['Comment ajouter une espèce, changer leur ordre ou en cacher ?', 'Listes → Animaux de compagnie → « ⚙️ Réglages » (ou Maintenance → Réglages des animaux) : coche les espèces à montrer, range-les avec ↑ ↓, ajoute la tienne (son nom, et son icône : clique dessus et choisis-la, les animaux en premier) ou supprime-la avec 🗑.'],
            ['Comment régler le formulaire « Nouvel animal » (ordre des parties, champs montrés) ?', 'Maintenance → Réglages des animaux → « Formulaire » : pour tous les animaux, ou pour une espèce (case « réglage propre ») : l’ordre des parties et l’ordre des champs dans chaque partie (↑ ↓ ou en glissant ⠿), les parties et tous les champs montrés (le nom et l’espèce restent toujours). Par défaut, le numéro UELN n’apparaît que pour les chevaux.'],
            ['Comment ajouter mes propres catégories et champs à la fiche d’un animal ?', 'Maintenance → Réglages des animaux → Formulaire : « ＋ Catégorie » (ex. 🧬 Génétique, Dressage) crée une nouvelle partie du formulaire ; « ＋ Champ » sous une partie (celles de l’app ou les tiennes) ajoute un champ : texte court, texte long, date, nombre, case oui / non ou liste de choix (séparés par ;). Ils se rangent et se cachent comme les autres. Sur la fiche, un champ ajouté s’affiche dans sa partie ; tes catégories forment le bloc « 🗂️ Mes catégories » de la fiche complète. Un champ supprimé garde ce qui y était écrit (il ne s’affiche plus).'],
            ['Comment garder plusieurs façons de régler les animaux, ou les passer à un autre ordinateur ?', 'Maintenance → Réglages des animaux → « 💾 Réglages enregistrés » : « 💾 Enregistrer sous un nom… » leur donne un nom (ex. Élevage de chevaux) ; choisis-en un et « Appliquer » pour y revenir. « ⬇️ Exporter » fait un fichier .json (les réglages et tous les ensembles) ; « ⬆️ Importer » le reprend sur une autre base.'],
            ['Où vont les photos et les notes d’un animal qui a une fiche complète ?', 'Dans sa fiche complète, comme pour une personne : ses photos et documents (pedigree papier, carnet de santé…) dans le bloc « Médias », ses notes et ses sources dans le bloc « Notes ». Ceux d’avant y ont été déplacés. Sa fiche dans Listes → Animaux de compagnie montre toujours ses photos. Un animal sans fiche complète garde ses photos et notes dans sa fiche de la liste.'],
            ['Comment faire le pedigree (l’arbre) d’un animal de race ?', 'Dans la fiche de l’animal, choisis son père et sa mère s’ils ont une fiche (sinon écris leur nom et leur inscription). « 🌳 Pedigree » montre 2 à 8 générations (côté père en haut, côté mère en bas) ; un ancêtre qui revient plusieurs fois a sa couleur. Le taux de consanguinité (coefficient de Wright, d’après les ancêtres connus) et les ancêtres communs sont affichés ; le pedigree s’imprime ou se télécharge en tableur. La fiche montre aussi la descendance par portée et les frères et sœurs (mêmes parents ou demi). « ＋ Un petit » crée la fiche d’un petit avec ce parent déjà rempli.'],
            ['Où régler les couleurs, formes, pointes, polices et menus des tableaux ?', 'Maintenance → « Réglages des tableaux ». Couleurs : les pastilles proposées pour chaque usage (fond, bord, texte, dessin, notes, fond du tableau), dans l’ordre voulu, avec plusieurs palettes possibles. Pointes : celles proposées et leur ordre, et la pointe par défaut au début et à la fin. Formes : l’ordre des catégories et des formes, celles à cacher, l’accès rapide. Polices : des listes de polices à toi (avec les polices de l’ordinateur). Tailles : de quelle à quelle épaisseur (0,5 à 500 px) et taille de texte (jusqu’à 500 px), l’arrondi par défaut. Tableur : comment il est quand on le pose. Pinceaux : les tiens, avec la dureté. Menus et options : l’ordre (ou cacher) des outils, des boutons du haut, des réglages à droite et du menu « Ajouter ». En haut de la page, « 💾 Enregistrer sous un nom… » garde tous ces réglages ensemble (comme un design d’Apparence) ; « Mes réglages enregistrés » → « Appliquer » pour y revenir, 🗑 pour les supprimer.'],
            ['Comment régler la légende d’un trait ou d’une flèche ?', 'Choisis le trait : à droite, écris la « Légende », puis « Réglages de la légende » : taille, police, gras, italique, couleur du texte, cadre (fond, bord, épaisseur du bord, marge, arrondi ; fond « transparent » pour aucun cadre), position le long du trait (0 % au début, 100 % à la fin), côté (sur le trait, au-dessus, en dessous), écart avec le trait, et « suivre l’angle du trait » pour l’incliner comme lui.'],
            ['Comment choisir et ranger les formes de l’accès rapide ?', 'Maintenance → Réglages des tableaux → Formes : ⚡ sur une forme l’ajoute à l’accès rapide (les formes proposées directement dans la barre de l’outil Formes) ; dans « Accès rapide », glisse une forme ou utilise ‹ › pour changer l’ordre, × pour la retirer. N’oublie pas « Enregistrer ».'],
            ['Comment choisir la couleur de ce que je pose dans un tableau ?', 'Dès qu’un outil a des couleurs, la barre du haut montre les pastilles de ta palette et, au bout, un carré « autre couleur » pour en choisir une librement : Texte (couleur du texte), Note (fond de la note), Formes (fond), Trait et Flèche (couleur du trait), Dessin. Pour une flèche, « Pointes » donne aux pointes une couleur à part (« = » : comme le trait). Une fois l’élément posé, tout se change à droite, y compris « Couleur des pointes ».'],
            ['Comment changer l’ordre des pages de Maintenance ?', 'En bas de la colonne de Maintenance, à côté de « Pièce d’archives » : « Réordonner ». Glisse une ligne, ou utilise ses flèches ↑ ↓, puis Enregistrer ; « ↺ Remettre comme au départ » remet l’ordre de départ. (L’ordre se règle aussi dans Apparence.)'],
            ['Où sont le glossaire et la FAQ ?', 'Dans Maintenance, deux pages : « Glossaire » (vocabulaire de la généalogie, métiers anciens, aides à la lecture des actes, ton dictionnaire personnel) et « FAQ / tuto » (repères rapides et ces questions fréquentes, avec la recherche « Pose ta question »). Un bouton en haut de chaque page mène à l’autre.'],
            ['Comment souligner, barrer, faire une liste à puces ou numérotée dans un tableau ?', 'Choisis le texte, la note ou la forme : à droite, G (gras), I (italique), S (souligné), B (barré), puis aligner à gauche, centrer, à droite, justifier. « Puces et numéros » : puce, 1. 2. 3., I. II. III., a. b. c., A. B. C., tiret, cases à cocher — une ligne = un élément. « Police » propose tes listes de polices ; 🖥 ajoute les polices de l’ordinateur ; tu peux aussi taper un nom.'],
            ['Comment avoir plus de formes, ou créer la mienne ?', 'Outil Formes (S) → « Toutes les formes ▾ » : près de 800 formes rangées en 23 catégories (élémentaire, géométrie, flèches, bulles, étoiles, symboles, généalogie, personnes, croyances et mémoire, écrits et documents, lieux, maison et objets, vêtements, métiers et outils, transports, animaux, nature, météo, cuisine, musique jeux et sport, santé…), avec une recherche. « ＋ Créer une forme » : à la plume (comme dans Photoshop : clic = point d’angle, cliquer-glisser = point arrondi avec ses poignées, clic sur le premier point = forme fermée, ⌥ / Alt pour des poignées indépendantes, un tracé dans la forme = un trou), à partir d’un dessin du tableau ou d’une image. « 🧩 À partir d’une forme » : prends une forme, retourne-la (miroir, haut-bas), tourne-la, étire-la, ajoute-lui d’autres formes ou perce-y des trous, et donne-lui un nom (aussi avec ✏️ à droite sur une forme posée, ou sur chaque forme dans Maintenance → Réglages des tableaux → Formes). Tes formes vont dans « Mes formes » et dans l’accès rapide.'],
            ['Comment exporter, imprimer, importer un tableau ?', 'En haut du tableau : « ⬇ Exporter » → image PNG ou JPG, PDF, Imprimer…, la sélection en PNG, ou « Fichier du tableau » (.lcnda-tableau.json). Pour le fichier, deux choix : « Léger, sans les photos » (petit, facile à envoyer, parfait dans la même base ; ailleurs les photos absentes deviennent des notes) ou « Complet, avec les photos » (plus lourd, mais complet partout : à l’import, les photos, sons et PDF absents sont ajoutés à la base). « ＋ Ajouter → Importer un tableau » rouvre ce fichier en nouveau tableau ; les associations sont gardées quand c’est la même base. Le zoom (le pourcentage) a un menu : ajuster à la sélection, adapter le contenu à la fenêtre, 50 / 100 / 200 %.'],
            ['Comment fusionner des cellules d’un tableur ?', 'Clique une cellule, puis ⇧ + clic sur une autre : les cellules entre les deux sont choisies. À droite : « ⊞ Fusionner » (les textes sont mis bout à bout dans la première), « ⊟ Séparer » pour défaire ; le fond se met sur toutes les cellules choisies.'],
            ['Quels pinceaux et quelles gommes dans un tableau ?', 'Outil ✍︎ (P), puis le bouton du pinceau : Stylo, Monoligne, Marqueur, Crayon (grain), Pastel, Stylo-plume (le trait s’affine quand on va vite), Calame (pointe biseautée), Pinceau, Aquarelle, Remplissage (la forme tracée est remplie), Surligneur, Craie, Néon, Aérographe, Pointillé. En haut du menu, cinq épaisseurs toutes prêtes ; à côté, l’épaisseur exacte en px et une couleur au choix. Outil ⌫ (E) : « Gomme fine » efface seulement ce qu’elle touche (le trait est coupé), avec sa taille en px ; « Gomme à traits » enlève le trait entier. Un dessin déjà fait peut changer de pinceau dans le panneau de droite.'],
            ['Comment mettre un tableur dans un tableau ?', 'Outil ▦ (G) puis clic, ou « ＋ Ajouter » → Un tableur. Double-clic sur une case pour écrire ; Entrée descend, Tab passe à la suivante (et ajoute une ligne à la fin), Échap annule. Formules : =B2+B3, =SOMME(B2:B9), =MOYENNE, =MIN, =MAX, =NB, =PRODUIT, =ARRONDI(B2;1)… Colle un bout d’Excel ou de Numbers dans une case : il se range dans la grille. À droite : ajouter ou enlever lignes et colonnes, largeur de colonne, ligne et colonne de titres, une ligne sur deux teintée, fond d’une case, téléchargement en CSV.'],
            ['Comment voir ce qui est groupé dans un tableau ?', 'Chaque groupe a un cadre pointillé de couleur et une pastille « Groupe n · nombre d’éléments » : clic sur la pastille pour choisir tout le groupe (et le déplacer en la tirant). Le bouton ⧉ près du zoom montre ou cache les cadres.'],
            ['Comment faire un instantané d’un tableau, ou un nouveau tableau à partir d’un autre ?', 'En haut du tableau : « 📸 Instantanés » fige le tableau tel qu’il est (donne-lui un nom). Plus tard, « Revenir à cet état » (l’état du moment est gardé en instantané avant, rien ne se perd), ou « En faire un tableau » pour en créer un à part. « ⧉ Copie » crée tout de suite un nouveau tableau avec le contenu actuel, avec ou sans le même rangement. En plus, l’app garde toute seule une « ⏱ version automatique » par jour de travail (les 30 dernières), rangée à part et repliée en bas de la liste des instantanés.'],
            ['Comment poser un arbre automatique dans un tableau ?', '« ＋ Ajouter » → « 🌳 Un arbre automatique » : choisis la personne, puis ses ancêtres, ses descendants ou sa famille proche (parents, frères et sœurs, conjoints, enfants), le nombre de générations, avec ou sans les conjoints, flèches ou traits. Les fiches sont posées reliées et groupées (à côté de ce qui est déjà là) ; chaque carte reste liée à sa fiche : double-clic pour l’ouvrir.'],
            ['Comment mettre une frise chronologique ou une carte dans un tableau ?', '« ＋ Ajouter » → « 🗓 Une frise vivante » : les événements datés d’une personne (ou de son couple et de ses enfants) se placent tout seuls sur une ligne du temps, et suivent la fiche. « 🗺 Une carte » : les lieux d’une personne, de sa famille ou de la personne d’une enquête ; à droite, « Poser un repère » ajoute tes propres points (une commune, un lieu), et « relier les lieux dans l’ordre » trace le parcours.'],
            ['Comment choisir ce qu’une fiche montre dans un tableau ?', 'Choisis la fiche posée : à droite, « La fiche montre » : photo, dates complètes, années, lieux, métier, âge, parents. Tout est relu dans la fiche à chaque ouverture du tableau : si tu corriges une date, la carte suit.'],
            ['Comment noter une piste à vérifier, confirmée ou fausse ?', 'Choisis une note : à droite, « Piste d’enquête » → ❓ À vérifier, ✅ Confirmée ou ❌ Fausse. La note prend la couleur de son état et une pastille. En haut du tableau, « ❓ n à vérifier » compte les pistes restantes : un clic t’emmène à la suivante.'],
            ['Comment mettre un commentaire sur un élément d’un tableau ?', 'Choisis l’élément → « 💬 Commenter » à droite. Choisis un mot pour la bulle (À vérifier, Question, Idée, Source ?, Important…) ou « ＋ un autre mot… » pour le tien (il est gardé dans ta liste, « Mes mots » pour en retirer). Une petite bulle apparaît sur l’élément ; un clic dessus rouvre les commentaires, qu’on coche quand c’est réglé.'],
            ['Comment faire des zones (cadres) dans un tableau ?', '« ＋ Ajouter » → « ▭ Un cadre » (s’il y a une sélection, le cadre l’entoure). Donne-lui un nom (« Branche paternelle », « Sources à voir ») : ce qui est entièrement dedans bouge avec lui. ▾ en haut à gauche le replie (son contenu est caché, le nombre d’éléments reste affiché) ; ▸ le déplie.'],
            ['Comment aligner ou répartir plusieurs éléments ?', 'Choisis-en plusieurs (⇧ + clic ou en glissant dans le vide) : à droite, « Aligner » (gauche, centre, droite, haut, milieu, bas) et « Répartir » (même écart en largeur ou en hauteur, même largeur, même hauteur). Le bouton 🧲 en haut active la grille aimantée : en glissant, les éléments s’accrochent à la grille et aux bords et milieux des autres (des lignes roses les montrent) ; ⌥ / Alt pour s’en passer un instant.'],
            ['Comment utiliser les calques d’un tableau ?', 'En haut : 🗂 Calques → « ＋ Nouveau calque ». Le rond choisit le calque où vont les nouveaux éléments ; 👁 le montre ou le cache (même dans les images exportées), 🔒 le verrouille (on ne peut plus le choisir), ↑ le fait passer devant, ⬚ choisit ce qu’il contient. « Mettre la sélection sur le calque choisi » déplace des éléments ; à droite, « Calque » aussi.'],
            ['Comment chercher dans un tableau ?', 'En haut : 🔍 (ou ⌘F / Ctrl+F) : tape un mot ou un nom. On cherche dans les notes, les textes, les tableurs, les noms des fiches, les commentaires et les repères. Clic sur un résultat (ou Entrée, ⇧ + Entrée pour revenir) : le tableau y va et le montre ; un cadre replié s’ouvre, un calque caché se montre.'],
            ['Comment avoir la mini-carte d’un tableau ?', 'En haut : 🗺 la montre ou la cache (aussi le × sur elle). Tout le tableau en petit, la vue actuelle en rouge : clic ou glisser dedans pour s’y déplacer. Glisse son bandeau pour la mettre où tu veux : elle reste là.'],
            ['Comment présenter un tableau ?', 'En haut : « ▶ Présenter » → « ＋ La vue actuelle comme étape » (zoome et cadre d’abord), « ＋ La sélection comme étape » ou « ＋ Une étape par cadre ». « ☰ Les étapes » pour les renommer, les remettre dans l’ordre, les revoir. « ▶ Lancer » : plein écran, le tableau glisse d’une étape à l’autre (→ ou espace pour avancer, ← pour revenir, Échap pour finir). Sans étape, ce sont les cadres qui servent d’étapes.'],
            ['Comment faire une flèche en plusieurs morceaux, qui contourne, ou « frère de » toute prête ?', 'Choisis le trait : les petits « + » au milieu de chaque morceau se glissent pour le plier (un coude bleu apparaît ; double-clic dessus pour l’enlever). « Forme du trait » → « ⤳ contourne les éléments » : la flèche passe autour de ce qui est sur son chemin. « Lien tout prêt » (à droite, ou dans la barre de l’outil Flèche avant de tirer) : frère de, sœur de, époux de, épouse de, père de, fille de, cousin de, parrain de, témoin de, a écrit à, même personne ?… avec sa légende, sa couleur et son style.'],
            ['Que se passe-t-il quand je colle un tableau Excel ou une liste dans un tableau ?', 'Colle (⌘V) sur le tableau : pour plusieurs lignes, l’app demande ce que ça devient : un tableur (pour un bout d’Excel ou de Numbers), une note par ligne, une note par ligne du tableur, ou un seul texte. Les notes sont rangées en grille, à côté de ce qui est déjà là, et groupées si tu veux.'],
            ['Comment faire mes propres modèles de tableaux ?', 'Dans un tableau : « ⬇ Exporter » → « ⭐ En faire un modèle » (tout le tableau ou la sélection, avec ou sans les textes). Il apparaît dans « Nouveau tableau », sous « Mes modèles » ; le × sur un modèle le supprime.'],
            ['Comment dupliquer un élément d’un tableau en le glissant (comme dans Photoshop) ?', 'Garde ⌥ Option (Mac) ou Alt (PC) enfoncée et glisse l’élément (ou la sélection) : une copie part avec la souris, l’original reste en place. Un cadre emporte la copie de ce qu’il contient. ⌥ + clic sans glisser ne copie rien.'],
            ['Comment choisir la graisse d’une police (Light, Medium, Bold…) dans un tableau ?', 'Choisis le texte : à droite, sous « Police », « Graisse ». Par défaut, les neuf graisses habituelles (Thin 100 à Black 900). Clique 🖥 (polices de l’ordinateur) : la liste montre alors les graisses que la police a vraiment (ex. Futura Std : Light, Book, Medium, Heavy…). Le bouton G remet en normal / gras.'],
            ['Comment créer mes pointes de flèches ?', 'Maintenance → Réglages des tableaux → ➤ Pointes → « ＋ Créer une pointe » : à partir d’une forme (cherche-la parmi toutes les formes, les tiennes comprises) ou tracée à la plume ; tourne-la (0°, 90°, 180°, 270°), pleine ou en contour, accrochée par la pointe, le milieu ou l’arrière ; donne-lui un nom. Elle s’ajoute à la liste (avec un aperçu de chaque pointe), où tu la ranges, la caches ou la supprimes (🗑). L’app propose aussi 26 pointes : triangle (plein ou vide), flèche fine ou longue, double chevron, rond, carré, losange, croix, plus, étoile, cœur, pied de corbeau…'],
            ['Comment régler les couleurs et les réglages des légendes de traits ?', 'Maintenance → Réglages des tableaux → 🎨 Couleurs : trois catégories « Légendes des traits » (texte, fond du cadre, bord du cadre). → ☰ Menus et options : « Réglages d’une légende de trait » : l’ordre de ces réglages et ceux à cacher (taille, police, gras, couleurs, cadre, position, côté, écart, angle).'],
            ['Comment enregistrer un mémo vocal dans un tableau ?', '« ＋ Ajouter » → « 🎙 Un mémo vocal » → ⏺ Enregistrer, puis ⏹ Arrêter : tu peux le réécouter, lui donner un titre, puis « Poser sur le tableau ». Le son est rangé avec le tableau et dans les médias de l’app. La première fois, l’ordinateur demande l’accès au micro.'],
            ['Comment associer un tableau à une personne, une enquête, une partie d’enquête… ?', 'Sous le titre du tableau : « 🔗 Associer… » → une personne, une enquête, une battue, un projet de l’Atelier, un recueil, un lieu (sa commune), un média, une étiquette, une famille (un couple), un événement, un animal ou un autre tableau, avec si tu veux le nom d’une partie (piste 1, les témoins…). On peut en mettre plusieurs ; × pour en retirer une. Le tableau apparaît alors aussi sur la fiche de la personne (bloc « Tableaux ») et dans l’enquête, la battue ou le projet associé. « changer » à côté du rangement déplace le tableau lui-même.'],
            ['Comment faire un tableau libre (comme Freeform) ?', 'Enquêtes → onglet « Tableaux » → « + Nouveau tableau » (vide, mur d’indices, carte mentale, frise, arbre à la main). Outils en haut : texte, note, formes, trait, flèche (elle suit ce qu’elle relie), dessin à main levée, gomme ; « ＋ Ajouter » pose un fichier (image, GIF, son, vidéo, PDF), un média de l’app, une image ou un site du web, une fiche, un écran de l’app (avec aperçu vivant), un de tes widgets, un recueil, une étiquette, un dossier (un tableau dans le tableau). Glisse ou colle des images directement. ⌘G grouper, ⌘L verrouiller, ⌘D dupliquer, ⌘Z annuler. Tout s’enregistre seul.'],
            ['Comment mettre un tableau dans une enquête, une battue ou l’Atelier ?', 'Dans l’enquête (ou la battue, ou le projet), section « 🧩 Tableaux » → « + Nouveau tableau ici ». Donne-lui une partie (« Piste 1 ») pour en avoir plusieurs. Un tableau déjà fait : en haut du tableau, « changer » à côté de son rangement.'],
            ['Comment transcrire un livret de famille ?', 'Listes → « Livrets de famille » → « + Nouveau livret » : délivrance, mariage, époux et épouse avec leurs parents, enfants, mentions, transcription intégrale et photos des pages. Relie chaque personne à sa fiche (ou « créer la fiche ») ; le livret apparaît alors sur la fiche. « Reporter sur les fiches » ajoute ce qui y manque (naissances, décès, mariage, enfants du couple) sans rien écraser.'],
            ['Comment retoucher précisément une photo ?', 'Visionneuse → Retoucher : zoome (⌘ + molette, + −, 1:1), déplace-toi avec la barre d’espace. Correcteur et tampon ont une taille (touches [ et ]) et une dureté ; « 🎯 Choisir l’endroit à recopier » pour le tampon. Pinceau (6 sortes) et texte vont sur des calques, au-dessus de la photo. L’onglet « Historique » permet de revenir à n’importe quelle étape.'],
            ['Comment remplir la fiche d’un employeur ?', 'Listes → Employeurs → « 🏢 Créer la fiche » (ou clic sur l’employeur d’un recensement, ou « 🏢 Fiche de cet employeur » sous le champ Employeur). Identité, siège, dirigeants, établissements, chronologie, notes et sources ; « Remplir depuis l’Annuaire des entreprises » remplit d’un clic une entreprise qui existe (ou a existé depuis les années 1970). La fiche montre aussi la famille qui y a travaillé.'],
            ['En quels formats enregistrer un son modifié ?', 'Atelier son (✂️ Modifier) → Enregistrer : MP3 (lu partout, qualité de 96 à 320 kbit/s), WAV ou FLAC (sans perte), Ogg Opus (le plus léger), AIFF (Mac). On peut passer en mono, changer la fréquence, et « Seulement télécharger le fichier » sans rien changer dans la base.'],
            ['Comment ajouter des photos ou des scans ?', 'Dans le bloc Médias de la fiche (bouton « + »). Pour un dossier entier qui se remplit tout seul (scanner, téléphone) : Maintenance → Dossier « Scans » surveillé.'],
            ['Comment éclaircir ou retoucher une vieille photo ?', 'Ouvre la photo, puis « 🎚️ Retoucher » : luminosité, contraste, ombres, couleurs, noir et blanc, sépia, négatif et une courbe comme dans Photoshop. « Remplacer la photo » garde toujours l’original (« Revenir à l’original ») ; « Enregistrer une copie » ajoute la version retouchée à côté.'],
            ['Comment demander un acte récent à la mairie ?', 'Listes → Registre de courriers → « Actes à demander à la mairie » : la lettre est préparée, et un rappel peut être posé le jour où l’acte devient public.'],
            ['Comment ranger les pages d’un registre ou d’un carnet photographié ?', 'Listes → Recueils : les pages dans l’ordre, avec leur transcription, une image de couverture, un tableau par page (à coller depuis un tableur) et des lignes rattachées aux fiches.'],
            ['Comment dépouiller un recensement ou un registre page par page ?', 'Listes → Dépouillements : les vues du scan à côté, les personnes rangées par foyer avec l’adresse du foyer, et un cadenas 🔒 pour ne rien modifier par erreur une fois la page relue.'],
            ['Comment écouter un enregistrement ou couper une vidéo ?', 'Listes → Audios ou Vidéos : lecteur avec vitesse de 0,10× à 6×. « ✂️ Modifier » ouvre l’atelier son et vidéo (couper, améliorer, assembler) ; l’original est toujours gardé.'],
            ['Comment réunir plusieurs photos sur une seule image ?', 'Listes → Médias (ou la visionneuse) → « 🧩 Assembler des photos » : redimensionner, faire tourner, régler la transparence.'],
            ['Comment préparer un livre, une thèse ou une exposition ?', 'Enquêtes → Atelier de recherche : projets avec dossiers imbriqués, références importées de Zotero, CSL JSON ou EndNote, exports Word, PDF et CSL JSON.'],
            ['Comment convertir une date ancienne (calendrier républicain, julien…) ?', 'Maintenance → Calendrier / mesures → « Convertir une date » : 26 calendriers, dont le républicain, le julien, le romain (calendes, nones, ides) et l’ancien style anglais.'],
            ['La reconnaissance d’écriture manuscrite ne marche pas ?', 'Elle demande un module à installer une seule fois : Maintenance → Reconnaissance d’écriture (HTR), bouton « Installer ».'],
        ]],
        ['Sauvegarde et partage', [
            ['Comment faire une sauvegarde ?', 'Maintenance → Sécurité & comparaison : sauvegarde automatique programmée, et ⌘⇧B (Ctrl+Maj+B) pour une sauvegarde tout de suite. La sauvegarde complète avec tous les médias, protégée par un mot de passe si tu veux, est dans Maintenance → Export propre.'],
            ['Comment mettre une copie chez un cousin ?', 'Maintenance → Copie chez un cousin : la copie est chiffrée, il la garde sans pouvoir la lire et te la rend si ton ordinateur tombe en panne.'],
            ['Comment travailler à deux sur la même généalogie ?', 'Maintenance → Travail à deux : vous partez de la même base, puis vous vous échangez des paquets de modifications, acceptés ou refusés un par un.'],
            ['Comment faire un petit montage vidéo ?', 'Listes → 🎬 Vidéos → « 🎬 Montage » (tout à droite), ou « ✂️ Modifier » sur une vidéo. Cinq pistes : 🎬 Vidéo 1 (les morceaux à la suite, chacun avec sa transition : fondu enchaîné, au noir, au blanc), 🖼️ Vidéo 2 (une vidéo incrustée dans un coin), 🔤 Textes (titres fixes ou qui bougent : fondu, glisse, monte, grandit, générique qui défile, machine à écrire ; police, taille, couleur, bandeau, position), 🎵 Son 1 et Son 2 (musique, voix). « 🔊 Détacher le son » met le son d’un morceau sur une piste à part, pour le déplacer, le baisser ou l’enlever. Onglet 🎨 Couleurs : luminosité, contraste, saturation, température, teinte et des styles tout faits (Ancien film, Noir et blanc…), pour tout le film ou un seul morceau. Clique sur la frise pour te placer, glisse les incrustations, textes et sons. « 📤 Exporter la vidéo… » rejoue le montage et en fait un fichier (MP4 ou WebM) ; « 💾 Enregistrer le projet » garde le montage pour le continuer plus tard.'],
            ['Comment enregistrer un montage pour le continuer plus tard ?', 'Dans le montage : « 💾 Enregistrer le projet » (ou ⌘S ; ⇧⌘S pour une copie sous un autre nom). Les fichiers importés de l’ordinateur sont alors envoyés dans les Médias. Pour le rouvrir : « 📂 Projets… » en bas du montage, ou Listes → Vidéos → « 🎬 Montage » qui propose tes projets (ouvrir, renommer, supprimer) ou un nouveau montage. « 📤 Exporter la vidéo… » fabrique le fichier vidéo, sans fermer le montage.'],
            ['Comment accélérer ou ralentir une vidéo ou un son dans le montage ?', 'Choisis le morceau sur la frise, onglet 🎯 Élément → « Vitesse » : de 0,25 × à 4 × (ou les boutons 0,5 × 1 × 1,5 × 2 ×). Le morceau s’allonge ou se raccourcit sur la frise ; « garder la hauteur de la voix » évite la voix de canard.'],
            ['Comment faire durer une photo le temps que je veux dans le montage ?', 'Choisis la photo sur la frise, onglet 🎯 Élément → « Durée à l’écran » : tape les secondes (par exemple 5, ou 12,5), ou clique 2 s, 3 s, 5 s, 8 s, 10 s, 15 s.'],
            ['Comment régler le son d’un seul morceau, ou de tout le montage ?', 'Un morceau : choisis-le, onglet 🎯 Élément → « 🔊 Son de ce morceau » : voix plus nette, moins de souffle, graves, aigus, mono (et volume, fondus pour un son). « Appliquer à tous les sons du projet » recopie ces réglages partout. Tout le film d’un coup : onglet 🔊 Son (mêmes réglages, plus le volume général et « sans le son »).'],
            ['Comment annuler dans le montage ?', '⌘Z (Ctrl Z sur PC) annule la dernière modification (couper avec B, déplacer, régler…), ⇧⌘Z la rétablit ; aussi les boutons ↶ ↷ au début de la barre d’outils.'],
            ['Comment mettre mes propres raccourcis dans le montage, le son, la retouche ou la mise en page ?', 'Maintenance → « Montage, retouche, mise en page et son » → ⌨️ Raccourcis à toi (ou Maintenance → Raccourcis clavier, en bas). Choisis l’outil en haut, puis « Choisir » à côté de la commande et appuie sur la touche. Une touche déjà prise par le système (macOS, Windows, Linux) ou par le menu de l’application est refusée ; si elle sert déjà dans l’outil, tu es prévenu et ton raccourci passe avant. Sans ⌘ / Ctrl, il ne marche qu’en dehors des cases de texte. ✕ retire un raccourci.'],
            ['Mise en page : comment mettre, enlever ou remplacer un gabarit sur une page ?', 'Panneau Pages → Gabarits : la liste « Page N » change le gabarit de la page en cours (ou « Aucun gabarit » pour l’enlever). « Plusieurs pages… » (aussi dans le menu Page) le fait sur toutes les pages, une plage, les pages de gauche ou de droite, ou remplace un gabarit par un autre partout où il est. En supprimant un gabarit, tu choisis celui que prennent ses pages. ⌘Z annule.'],
            ['Comment refaire une fiche construite pareil (même ordre de blocs) ?', 'Dans la fiche : « ⧉ Dupliquer », puis « ▦ Le même ordre de blocs » (une nouvelle fiche avec les mêmes blocs, titres, largeurs et couleurs, mais vides) ou « ⭐ En faire un modèle » (tu peux garder aussi les textes, dates, liens et personnes ; les images ne vont pas dans un modèle). Tes modèles apparaissent dans « Nouvelle fiche », sous « Partir de », dans « ⭐ Mes modèles » (✎ pour le modifier, 🗑 pour le supprimer), et en bas de « Mes fiches ». Supprimer un modèle ne change pas les fiches déjà créées avec lui.'],
            ['Comment revenir plus tard sur un son que je travaille ?', 'Dans « Modifier le son » : « 💾 Enregistrer le projet » (en bas à gauche, ou ⌘S ; ⇧⌘S pour une copie sous un autre nom) garde le son en cours, sans perte, à part des Médias. Pour y revenir : « 📂 Projets… » dans « Modifier le son », Listes → 🎧 Audios → « 📂 Projets son », ou Listes → 🛠️ Outils de modification → 🎧 Son. Pour en commencer un : Listes → 🎧 Audios → « 🎧 Nouveau projet son » (un son de la base ou de l’ordinateur). Quand le son est fini, « 💾 Enregistrer… » en fait une version, une copie ou un nouveau son.'],
            ['Comment séparer le son et l’image d’une vidéo dans le montage ?', 'Choisis la vidéo sur la frise, onglet 🎯 Élément → « 🔊 Séparer le son de l’image » (ou « 🔊 Détacher le son » dans la barre) : le son passe sur une piste son, à part, et se déplace, se coupe ou se règle seul ; l’image devient muette. Pour ne prendre que le son d’une vidéo : onglet 🎞️ Rush → « ＋ Son seul », ou glisse la vidéo sur une piste son.'],
            ['Où se pose un rush glissé sur la frise du montage ?', 'Sur la piste qui est à la hauteur de la souris. Sur Vidéo 1, il se range entre les morceaux, là où tu le lâches ; sur une piste d’incrustation ou de son, au moment où tu le lâches. Une vidéo garde son son, même en incrustation.'],
            ['Comment renommer un rush du montage ?', 'Onglet 🎞️ Rush : ✎ sous le rush. Le nouveau nom se voit sur la frise et dans le projet enregistré.'],
            ['À quoi sert l’onglet 🎞️ Rush du montage ?', 'Ce sont les vidéos, photos et sons du projet. « 📥 Importer » (plusieurs fichiers à la fois) ou « 🗂 De la base » : ils attendent là, avec leur durée, sans aller tout de suite sur la frise. Glisse un rush sur une piste (vidéo, incrustation, son) à l’endroit voulu, ou utilise « ＋ À la suite », « ＋ Incruster », « ＋ Son ». Le chiffre bleu dit combien de fois il est sur la frise ; ✕ retire un rush qui ne sert pas.'],
            ['Comment régler le montage vidéo (disposition, boutons, enregistrement) ?', 'Maintenance → « Montage, retouche, mise en page et son » : le panneau des réglages à droite ou à gauche, la hauteur de l’image et des pistes, l’aide, la couleur des blocs sur la frise (vidéo principale, incrustations, textes, sons) ; l’enregistrement par défaut (MP4 ou WebM, taille : comme la vidéo, 4K, 1080 p, 720 p, 480 p, 360 p ; qualité ; images par seconde ; son) ; les boutons et options de chaque éditeur (montage, retouche, son), cochés ou non et rangés ; le plein écran à l’ouverture. Au moment d’enregistrer une vidéo, on peut encore changer la taille, la qualité et les images par seconde.'],
            ['À quoi sert l’onglet « Fiches » et comment l’afficher ?', 'Une fiche est une page sur un sujet : « La Pologne avant les guerres napoléoniennes », un lieu, un métier, une coutume… L’onglet est caché au départ : Maintenance → Apparence → « Ordre du menu principal », coche « Fiches ». « ＋ Nouvelle fiche » : un titre, une icône, et un point de départ (Sujet d’histoire, Un lieu, Un métier ou une fiche vide).'],
            ['Que peut-on mettre dans une fiche ?', '« ＋ Bloc » : 📝 un texte (# titre, ## sous-titre, - liste, **gras**, *italique*, __souligné__, [lien](https://…), > citation), 🖼️ des images et documents (de l’ordinateur ou déjà dans l’app ; en mosaïque, en grand ou en bandeau), 👥 des personnes de la base, 📅 une frise de dates, ❝ une citation et sa source, 🔗 des liens, ➖ un intertitre, 📺 un écran de l’app (carte, arbre, liste, Mes listes, statistique, fiche d’une personne, village…) et 📊 un widget ou une statistique à toi. « ✏️ Organiser » : ranger avec ↑ ↓, choisir la largeur (¼ à toute la largeur), dupliquer, supprimer ; ✎ sur un bloc pour le modifier ; une couleur par bloc ou pour la fiche. « 🖨️ Imprimer » en fait une page propre.'],
            ['Combien de pistes peut avoir un montage ? Comment en ajouter ou en supprimer ?', 'Autant que tu veux, de vidéo, de texte et de son. Sous la frise : « ＋ Piste vidéo », « ＋ Piste texte », « ＋ Piste son ». Ajouter une incrustation, un texte ou un son au même moment qu’un autre crée tout seul une piste en plus. À gauche de chaque piste : 👁 la cacher (ni vue ni entendue), ↑ ↓ la déplacer (une piste vidéo plus haute passe devant), 🗑 la supprimer (une piste vide part tout de suite ; une piste avec des éléments demande confirmation), double-clic sur son nom pour la renommer. On fait glisser un élément d’une piste à une autre du même genre, ou on choisit sa piste dans l’onglet « 🎯 Élément ».'],
            ['Comment réduire et déplacer une vidéo incrustée ou un texte dans le montage ?', 'Sur l’image : clique sur l’incrustation (piste Vidéo 2) ou sur le texte, puis fais-le glisser ; tire le petit carré du coin en bas à droite pour l’agrandir ou le réduire. Les réglages exacts (largeur, position, taille) sont aussi dans l’onglet « 🎯 Élément ».'],
            ['Comment zoomer avec le clavier ?', '⌘ + et ⌘ − sur Mac (Ctrl + et Ctrl − sur PC et Linux), ⌘ 0 / Ctrl 0 pour revenir : dans le montage, cela zoome la frise ; dans « Modifier le son », l’onde ; dans la Retouche, la photo. Ailleurs, toute la page de l’app grandit ou rapetisse.'],
            ['Comment mettre la retouche, le son ou le montage en plein écran ?', 'Bouton ⛶ en haut à droite de la fenêtre (comme pour les tableaux) ; il est gardé pour la prochaine fois. Maintenance → « Montage, retouche, mise en page et son » permet aussi de choisir le plein écran à l’ouverture.'],
            ['Comment ranger ou cacher les boutons de la Retouche, du son ou du montage ?', 'Dans la fenêtre, « ⚙️ Personnaliser » : coche ce qu’on montre et range avec ↑ ↓ (ou en glissant ⠿) les outils, les options, les réglages, les boutons de lecture… Gardé pour la prochaine fois ; « ↺ Remettre comme au départ » revient aux boutons d’origine.'],
            ['Comment mettre une photo dans un montage vidéo ?', '« ➕ Vidéo / photo à la suite » ajoute une vidéo ou une photo (de la base ou de l’ordinateur) dans la piste Vidéo 1 ; « ➕ Incrustation » la pose dans un coin. Une photo reste 5 s à l’écran au départ : « Durée à l’écran » dans l’onglet Élément.'],
            ['Comment déplacer un élément du montage sur une autre piste, ou l’enlever ?', 'Fais-le glisser sur une piste du même genre : une vidéo ou une photo va de la piste Vidéo 1 à une piste d’incrustation (et inversement), un texte sur une autre piste de textes, un son sur une autre piste de sons. ⌫ (Retour arrière) ou Suppr enlève l’élément choisi, B le coupe à la tête de lecture.'],
            ['Comment animer une vidéo ou une photo (images clés) dans le montage ?', 'Choisis l’élément, onglet 🎯 Élément → « 🎛️ Réglages de l’image » (comme dans Final Cut) : Composition (opacité, mode de fusion), Transformer (position, rotation, échelle, échelle X et Y, ancrage), Recadrer, Distorsion, Adaptation spatiale. Place la tête de lecture, clique sur ◇ : une image clé ; va plus loin, change la valeur : une deuxième. Entre les deux, la valeur change en douceur (ou régulièrement). ◀ ◆ et ◆ ▶ vont d’une image clé à l’autre.'],
            ['Comment garder plusieurs dispositions du montage ou plusieurs jeux de boutons ?', 'Maintenance → « Montage, retouche, mise en page et son » : « 💾 Réglages enregistrés » pour la disposition du montage et pour les boutons de chaque éditeur. Donne un nom, applique, supprime, exporte ou importe un fichier .json.'],
            ['Quels outils a la Retouche (façon Photoshop) ?', 'Un menu en haut (Fichier, Édition, Image, Calque, Sélection, Filtre, Affichage) et une colonne d’outils à droite de la photo : ➤ déplacer, ⬚ ◯ sélections, ➰ lasso, ✒︎ plume, 🪄 sélection automatique, ⌗ recadrer et redresser, 🩹 correcteur, 🧬 tampon, 🖌 pinceau, ⬜ formes, T texte, ✋ main, 🔍 zoom. La photo est elle-même un calque (visibilité, opacité, masque). L’original n’est jamais modifié.'],
            ['Comment sélectionner une partie d’une photo dans la Retouche ?', 'Outils ⬚ (rectangle), ◯ (ovale), ➰ (lasso à main levée), ✒︎ (plume : point par point, Entrée ou double-clic pour fermer) ou 🪄 (clic sur une couleur : les points voisins de teinte proche ; règle la tolérance). ⇧ ajoute, ⌥ enlève. Menu Sélection : tout, aucune, inverser, contour progressif, agrandir, réduire. La sélection peut ensuite aller sur un calque (⌘J), être remplie, effacée (⌫ : transparent), servir de masque ou de recadrage.'],
            ['Comment enregistrer une retouche pour la continuer plus tard ?', 'Dans la Retouche : « 💾 Enregistrer le projet » (en bas à gauche, ⌘S, ou Fichier → Enregistrer le projet ; ⇧⌘S pour une copie sous un autre nom). Tout est gardé : corrections, réglages, filtres, recadrage, calques, groupes, calques de réglage, masques et sélection. Pour reprendre : « 📂 Projets… » en bas de la Retouche, ou Listes → Médias → « Retoucher » → « 📂 Projets ». Les boutons « Enregistrer et afficher cette version », « Enregistrer sans l’afficher » et « Copie séparée » fabriquent, eux, l’image finale.'],
            ['Comment avoir plus de place pour la photo dans la Retouche ?', 'Le bouton ⇥ en haut à droite du panneau (Réglages, Filtres, Calques, Historique) le replie ; ⇤ le rouvre (aussi la touche Tab, ou Affichage → Replier / ouvrir le panneau). C’est gardé pour la prochaine fois. Le panneau s’élargit aussi en tirant son bord.'],
            ['Le montage a-t-il un menu comme la Retouche ?', 'Oui, à côté du titre : Fichier (enregistrer le projet, projets, exporter la vidéo), Édition (annuler, rétablir, couper ici, commence et finit ici, avancer, reculer, séparer le son, enlever), Ajouter (importer des rushes, un rush de la base, vidéo ou photo à la suite, incrustation, titre, son), Pistes, Lecture (lire, au début, images clés) et Affichage (onglets, zoom de la frise, plein écran).'],
            ['Où retrouver tous mes projets de montage, de son, de retouche et de mise en page ?', 'Listes → 🛠️ Outils de modification : un onglet par outil (🎬 Montage vidéo, 🎧 Son, 🎚️ Retouche des photos, 📐 Mise en page). Cherche par nom, trie (plus récents, plus anciens, A → Z, Z → A), ouvre, renomme (✎) ou supprime (🗑) un projet, ou commence-en un nouveau.'],
            ['Pourquoi la Retouche n’affiche-t-elle pas « Copie séparée » et « Enregistrer sans l’afficher » ?', 'Ces boutons servent aux photos de la base : la retouche devient une version de la photo, l’original restant gardé. Pour un canevas vide ou une photo importée, il n’y a pas d’original à garder : « 🖼 Enregistrer l’image dans les Médias » et « ⬇ Télécharger » suffisent, et « 💾 Enregistrer le projet » garde les calques pour continuer.'],
            ['Où mettre la colonne d’outils de la Retouche ?', 'Maintenance → « Montage, retouche, mise en page et son » → 🎚️ Retouche des photos : la colonne d’outils (➤ ⬚ ◯ 🪄 ⌗ 🖌 T…) à côté de l’image, tout à gauche ou tout à droite, et le panneau (Réglages, Calques…) à droite ou à gauche. Puis « Enregistrer ».'],
            ['Comment ranger ou cacher les boutons de l’atelier de mise en page ?', 'Dans l’atelier, « ⚙️ Personnaliser » (en haut à droite), ou Maintenance → « Montage, retouche, mise en page et son » → Boutons et options → Éditeur « 📐 Mise en page » : menus du haut, ↶ ↷, outils de la colonne de gauche, onglets du panneau de droite et barre du bas, à cocher et ranger avec ↑ ↓. Ouvre l’atelier une fois pour que la liste se remplisse.'],
            ['Comment faire des groupes de calques dans la Retouche ?', 'Calques → « ＋ Groupe » (ou Calque → Nouveau groupe), ou « Grouper » (⌘G) pour mettre le calque choisi dans un nouveau groupe. Un groupe peut contenir des calques et d’autres groupes, autant de niveaux qu’on veut. Le plus simple : attrape la poignée ⠿ d’une ligne et glisse-la — au-dessus ou en dessous d’un autre élément, au milieu de la ligne d’un groupe (ou sur « groupe vide ») pour la mettre dedans, sur la ligne Photo pour la mettre tout en bas. Aussi : le menu 📁 de chaque ligne, ↑ ↓ pour l’ordre, ▾ pour replier un groupe. Un groupe a sa visibilité, son opacité, son verrou et son masque. ✕ sur un groupe le supprime mais garde tout ce qu’il contient.'],
            ['Comment mettre des réglages ou des filtres dans un calque (calque de réglage) ?', 'Calques → « ＋ Réglage » (ou, en haut des onglets Réglages et Filtres, « ＋ dans un calque de réglage ») : les curseurs, la courbe et les filtres réglent alors ce calque-là (le bandeau en haut dit ce qu’on règle ; « régler la photo » pour revenir). Il agit sur tout ce qui est dessous ; coche « seulement sur … » pour qu’il ne touche que le calque ou le groupe juste dessous (comme un masque d’écrêtage de Photoshop). Mis dans un groupe, il ne touche que ce groupe. Il se masque, se dose (opacité) et se cache comme un calque.'],
            ['Comment partir d’une image vide dans la Retouche ?', 'Listes → Médias → « Retoucher » → « ⬜ Canevas vide » : choisis la taille (écran, carré, A4, carte postale ou la tienne) et le fond (blanc, transparent ou une couleur). Le canevas est ajouté aux Médias et s’ouvre dans la Retouche, prêt pour les calques, le texte, les formes.'],
            ['Comment recadrer ou redresser une photo dans la Retouche ?', 'Outil ⌗ (C) : glisse les poignées du cadre ou trace-en un nouveau, choisis des proportions (carré, 4:3, A4…), tourne avec « Redresser », puis « ✓ Valider » (ou Entrée). Échap abandonne. Menu Sélection → « Recadrer sur la sélection » recadre au plus juste.'],
            ['Comment cacher une partie d’un calque sans l’effacer (masque) ?', 'Calques → 🎭 sur le calque (ou la photo) : un masque est ajouté et le pinceau peint dedans, ⬛ pour cacher, ⬜ pour montrer. Clic sur la vignette du masque pour revenir au calque. « inverser le masque », « retirer le masque », ou Sélection → « Masque » pour en faire un d’après la sélection.'],
            ['Comment recopier toute une zone avec le tampon ?', 'Sélectionne la zone (⬚ ◯ ➰ ✒︎ 🪄), prends le tampon 🧬 et glisse : une copie de la zone se pose là où tu lâches. Sans sélection, le tampon recopie au pinceau depuis l’endroit choisi (🎯 ou ⌥ + clic).'],
            ['Comment écrire ou dessiner des formes sur une photo ?', 'Outil T : clique, écris, Entrée (gras, italique, contour blanc, polices de l’ordi). Outil ⬜ : rectangle, rectangle arrondi, ellipse, ligne ou flèche, vide ou remplie (⇧ : carré, cercle, angle droit). Avec ➤ tu les déplaces, ⌫ les supprime, double-clic sur un texte pour le réécrire.'],
            ['Quels filtres a la Retouche ?', 'Onglet ✨ Filtres (ou menu Filtre) : flou, réduire le bruit, netteté, clarté, grain et vignette, appliqués après les réglages, aussi sur l’image enregistrée en pleine taille.'],
            ['Comment régler la disposition des tableaux (barre d’outils, inspecteur) ?', 'Maintenance → Réglages des tableaux → onglet « Menus et options » → « 🧭 Disposition du tableau » : barre d’outils en haut, en bas ou sur le côté, inspecteur à droite ou à gauche, taille des boutons, titre affiché ou non. Le bouton ⚙️ dans un tableau y mène directement.'],
            ['Comment modifier un bloc d’une fiche sur un sujet ?', 'Le ✎ du bloc le retourne, comme un widget du tableau de bord : titre, largeur (1, 1/2, 1/3, 1/4, 2/3, 3/4 : elle se voit tout de suite), couleur et contenu, puis Enregistrer ou Annuler. « ＋ Bloc » ajoute une carte en bas de la fiche, déjà retournée sur ses réglages.'],
            ['Comment cacher les lignes vides du bloc Identité d’une fiche ?', 'En bas du bloc Identité : « Masquer sur cette fiche » ou « Masquer sur toutes » (et « Afficher… » pour revenir). Le réglage de toutes les fiches est aussi dans Maintenance → Apparence → blocs des fiches.'],
            ['Comment cacher des listes du menu Listes ?', 'Listes → « Réordonner » (en bas à gauche) : l’œil de chaque ligne cache ou montre la liste ; glisse ou utilise ↑ ↓ pour l’ordre, puis Enregistrer.'],
            ['Comment assembler des sons de zéro ?', 'Listes → 🎧 Audios → « 🎬 Montage » : choisis un premier son, puis « ➕ Ajouter un son… », coupe, fondus, volume… « Enregistrer » en fait un nouveau son dans la liste.'],
            ['Comment ajouter des critères à une distribution (Graphiques → Statistiques) ?', 'Sous « De … à … · Limite · Sexe », « + Critère » ajoute autant de critères que tu veux, les mêmes que dans Mes listes et l’Éditeur de statistiques : nom, métier, étiquette, lieu, à moins de … km de, a eu un mariage, nombre d’enfants, mes ancêtres (Sosa), sans source… La case « pas » inverse un critère, 🗑 le retire, « Réinitialiser » les enlève tous. La statistique ne compte alors que les fiches retenues (et leurs événements).'],
            ['Comment voir qui est derrière une barre d’une distribution ?', 'Clique sur la barre (ou la colonne) : une fenêtre montre les personnes comptées, avec une recherche, un tri par nom ou par naissance et un export CSV — comme pour une statistique à toi. C’est possible pour les noms, prénoms, lieux et pays de naissance, de mariage et de décès, les sexes, les années de naissance et de décès et l’âge au décès.'],
            ['Comment choisir les filtres de départ de toutes les distributions ?', 'Sur une distribution, « ⚙️ Réglages par défaut des distributions » : règle les années, la limite, le sexe et les critères, puis « ⭐ Garder ces filtres par défaut pour toutes ». Ils servent au départ de chaque distribution ; « ↺ Revenir aux filtres par défaut » les remet, « Plus de réglage par défaut » repart de toutes les données.'],
            ['Comment garder tous mes réglages de l’app, ou les passer à un autre ordinateur ?', 'Maintenance → Apparence, tout en bas → « 💾 Réglages enregistrés : toute l’app » : donne un nom et « 💾 Enregistrer sous ce nom » garde l’intégralité des réglages (apparence, listes et colonnes, statistiques et onglets à soi, widgets, tableaux, animaux, livrets, raccourcis…). « Appliquer » y revient (l’écran se recharge), « Exporter » en fait un fichier, « Importer un fichier… » le reprend sur un autre ordinateur. Tes données ne sont jamais touchées ; ne sont pas gardés ce qui vise une fiche précise (de cujus, exception d’une fiche) et ce qui est propre à cet ordinateur.'],
            ['Comment garder ou partager ma mise en page ?', 'Maintenance → Apparence → « 💾 Réglages enregistrés : l’Apparence » : donne un nom aux réglages actuels (design, menus affichés ou masqués et leur ordre, blocs, couleurs…), reviens-y en un clic, ou envoie le fichier à un autre utilisateur qui l’importe au même endroit.'],
            ['Comment montrer l’arbre sans risque qu’on le modifie ?', 'Le mode consultation (cadenas en haut à droite) bloque toute modification ; il se quitte avec ton mot de passe.'],
            ['Comment récupérer une fiche supprimée par erreur ?', 'Maintenance → Journal des modifications : une suppression se restaure avec tout ce qui était attaché. ⌘Z annule la dernière modification d’une fiche.'],
        ]],
        ['Import et export', [
            ['Comment organiser le livre de famille ?', 'Maintenance → Export propre → Livre de famille : coche les parties (couverture, préface, chiffres, arbre, fiches, chronologie, lieux, index, mot de la fin) et range-les ; idem pour ce que montre chaque fiche. Choisis le style, la police, le format de page, puis le format : PDF (par l’impression), HTML, Word, OpenDocument, ePub (liseuse), Markdown, texte ou CSV.'],
            ['Qu’est-ce que l’atelier de mise en page (façon InDesign) ?', 'Maintenance → Export propre → Livre de famille → « 📐 Ouvrir l’atelier de mise en page ». C’est un petit InDesign pour faire le livre de ta généalogie : pages simples ou en vis-à-vis, gabarits (folio, titre courant), calques, blocs de texte (police de l’ordinateur, corps, interlignage, approche, capitales, alignements, retraits, lettrine, colonnes), formes (rectangle, ellipse, polygone, étoile, ligne, plume), cadres d’images, nuancier et dégradés, contours, effets (opacité, fusion, ombre portée, contour progressif, angles arrondis), habillage du texte, Pathfinder, alignement et répartition, liens. On enregistre, on reprend plus tard, on exporte.'],
            ['Où retrouver les livres faits dans l’atelier de mise en page ?', 'Listes → 📐 Livres de famille : tous les livres et tes designs, avec leur couverture. Ouvrir, dupliquer, renommer, exporter, supprimer ; en haut, « Nouveau livre d’après la famille », « Depuis un design », « Page blanche », « Réglages par défaut » et l’atelier.'],
            ['Comment commencer un livre dans l’atelier de mise en page ?', 'Dans l’atelier : « 👪 Nouveau livre d’après la famille » (une branche, les parties voulues, un design : la couverture, une page par personne avec sa photo, la chronologie, l’index… les textes trop longs continuent sur la page suivante), « 🎨 Nouveau depuis un design », ou « 📄 Page blanche ». On choisit le format, les marges (haut, bas, petit fond, grand fond), les colonnes et la gouttière, le fond perdu et la ligne-bloc. « ⚙️ Réglages par défaut » fixe ce que reçoivent les nouveaux documents.'],
            ['Qu’est-ce qu’un design dans l’atelier de mise en page, et comment en faire un ?', 'Un design est un modèle : couverture, gabarits, styles de paragraphe et de caractère, couleurs. L’app en propose six (Classique, Moderne, Élégant, Sépia, Album photo, Sobre) : « Utiliser » ou « Modifier (à mon nom) ». Ton propre design : ouvre un livre, puis Fichier → « 🎨 Enregistrer comme design ». La liste montre la couverture de chaque livre et de chaque design.'],
            ['Comment ajouter des pages ou aller à une page dans l’atelier de mise en page ?', 'Menu Page (ou panneau 📄 Pages) : « ＋ Page à la fin », « ＋ Insérer… » (autant de pages qu’on veut, avant ou après une page précise, au début ou à la fin, avec le gabarit choisi), dupliquer, supprimer, avancer ou reculer une page. Pour aller à une page : la case « Page » en bas, ⌘J (Ctrl+J), ou Page Préc. / Page Suiv. du clavier.'],
            ['Quels sont les raccourcis de l’atelier de mise en page ?', 'V sélection, T texte, F cadre d’image, M rectangle, L ellipse, Y polygone, E étoile, \\ ligne, P plume (double-clic ou Entrée pour finir, clic sur le premier point pour fermer), H main, Z zoom. ⌘Z / ⇧⌘Z annuler et rétablir, ⌘C ⌘X ⌘V ⌘D, ⌘A, ⌫ supprimer, flèches pour pousser (Maj : 5 mm), ⌘] ⌘[ avancer et reculer, ⌘0 page entière, ⌘S enregistrer, W aperçu. Alt en glissant : une copie. Maj : proportions gardées.'],
            ['Comment exporter le livre de l’atelier de mise en page en PDF ?', 'Fichier → « 📄 Exporter en PDF (imprimer) » ouvre le livre prêt à imprimer : « Imprimer », puis « Enregistrer en PDF ». Pour un imprimeur : « PDF avec fond perdu et traits de coupe ». Aussi : page HTML (photos comprises) et fichier du document (.json) à garder ou à passer à quelqu’un (« Importer un document » dans l’atelier).'],
            ['Comment annuler une modification dans l’atelier de mise en page ?', 'Boutons ↶ ↷ en haut (ou ⌘Z / ⇧⌘Z). Le panneau 🕘 Historique liste chaque modification : un clic sur une étape y revient, les suivantes restent grisées tant que tu ne fais rien d’autre.'],
            ['Comment élargir le panneau de droite de l’atelier de mise en page ou de la Retouche ?', 'Glisse son bord gauche (le curseur devient ↔) vers la gauche pour l’élargir, vers la droite pour le rétrécir ; la largeur est gardée. Double-clic sur le bord : taille de départ.'],
            ['Comment créer ou changer un gabarit dans l’atelier de mise en page ?', 'Panneau 📄 Pages → Gabarits : « ＋ Nouveau gabarit » (tu lui donnes un nom), « Modifier » pour poser ce qui revient sur ses pages (folio, filets…), « → p. N » pour l’appliquer à la page en cours, « Page sans gabarit », ou « Détacher les éléments » pour modifier sur cette page seulement ce qui vient du gabarit.'],
            ['Comment mettre la couleur que je veux sur un texte ou un objet de l’atelier ?', 'Texte : choisis les mots, puis panneau 🅰 Texte → Caractère → « Couleur libre » (le carré ouvre toutes les couleurs, ou tape un code comme #7a2e2e ; les ronds sont les couleurs du nuancier). Objet : clique sur le carré du fond ou du contour en bas des outils, la palette s’ouvre directement. ⇄ (ou ⇧X) intervertit fond et contour, ⧄ (ou /) les vide, X passe de l’un à l’autre.'],
            ['Comment faire que le texte contourne une photo (habillage) ?', 'Dans l’atelier de mise en page : choisis la photo, panneau 🔧 Objet → « Habillage du texte » : autour du cadre, autour de la forme (ellipse) ou saut d’objet, et la distance. Les blocs de texte voisins passent à côté.'],
            ['Comment importer mon arbre d’un autre logiciel ?', 'Maintenance → Import : fichier GEDCOM, Hérédis (.hmw) ou MacFamilyTree, sans passer par un export.'],
            ['Comment ajouter l’arbre d’un cousin à ma base ?', 'Maintenance → Fusionner un arbre : son GEDCOM est comparé au tien, puis tu décides fiche par fiche.'],
            ['Comment faire un livre de famille en PDF ?', 'Maintenance → Export propre → Livre de famille : toute la base, ou les ancêtres et/ou les descendants d’une personne sur le nombre de générations voulu, avec l’arbre génération par génération, les biographies, les photos et la chronologie. « Ouvrir pour imprimer » puis « Imprimer / enregistrer en PDF ».'],
            ['Comment exporter seulement une branche ?', 'Maintenance → Export propre : choisis la personne de départ et les ascendants ou descendants à exporter.'],
        ]],
    ];
    // Recherche dans la FAQ : on tape sa question comme on la dirait (« comment je fais un livre en pdf ? ») ;
    // sans accents ni majuscules, sans les petits mots, avec quelques synonymes ; les meilleures réponses d'abord.
    const FAQ_STOP = new Set('a ai as au aux avec ce ces cet cette comment dans de des du elle en est et etre faire fais fait faut il ils je j la le les leur leurs lui ma me mes moi mon ne nous on ou par pas peut peux plus pour pourquoi puis qu que quel quelle quels qui quoi sa se ses si son sur ta te tes toi ton tu un une vos votre vous y lcnda app logiciel veux voudrais aimerais aimer dois doit savoir besoin possible moyen base genealogie truc chose'.split(' '));
    const FAQ_SYN = {photo: 'image media scan document', image: 'photo media', media: 'photo image document', scan: 'photo document numeriser', pdf: 'imprimer livre exporter', imprimer: 'pdf livre', livre: 'livret pdf imprimer',
        supprimer: 'effacer enlever retirer', effacer: 'supprimer', ancetre: 'sosa lignee aieul', sosa: 'ancetre lignee cujus', cujus: 'sosa depart', arbre: 'genealogie diagramme ascendant', carte: 'lieu plan',
        graphique: 'statistique stat diagramme', statistique: 'graphique stat chiffre', stat: 'statistique graphique', onglet: 'menu page', widget: 'tableau bord', sauvegarde: 'copie backup sauvegarder', sauvegarder: 'sauvegarde copie',
        importer: 'import gedcom heredis', exporter: 'export pdf csv', liste: 'listes tableau', critere: 'condition filtre', filtre: 'critere condition', condition: 'critere filtre', village: 'commune paroisse', commune: 'village lieu',
        recensement: 'foyer adresse', acte: 'registre archive', registre: 'acte recueil', cousin: 'partager copie', partager: 'partage envoyer fichier', erreur: 'incoherence verifier age', age: 'ages ecart', date: 'calendrier convertir',
        prenom: 'saint prenoms', saint: 'prenom fete', nom: 'patronyme', son: 'audio enregistrement', video: 'film', mariage: 'union marie',
        enlever: 'supprimer retirer effacer', retirer: 'supprimer enlever', manquant: 'trou suggestion chercher manque', manque: 'trou suggestion chercher', trou: 'manquant suggestion', chercher: 'recherche trouver', trouver: 'chercher recherche',
        retoucher: 'eclaircir photo', vieux: 'ancien', ancien: 'vieux', vivant: 'vivants', montrer: 'afficher consultation', proche: 'famille cousin', email: 'mail courrier', lettre: 'courrier'};
    // les synonymes vont dans les deux sens, et se retrouvent aussi au pluriel ou sous une autre forme du mot
    Object.entries({...FAQ_SYN}).forEach(([k, v]) => v.split(' ').forEach(x => { FAQ_SYN[x] = [...new Set(`${FAQ_SYN[x] || ''} ${k}`.trim().split(' '))].join(' '); }));
    const faqSyn = w => FAQ_SYN[w] || FAQ_SYN[w.replace(/s$/, '')] || FAQ_SYN[w.replace(/(es|s|x)$/, 'e')] || FAQ_SYN[w.replace(/er$/, 'e')] || '';
    const faqFold = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ');
    const faqStem = w => w.length > 4 ? w.replace(/(ements|ement|ations|ation|ees|es|s|x|e)$/, '') : w.replace(/s$/, '');
    const faqWords = t => faqFold(t).split(/[^a-z0-9]+/).filter(w => w.length > 1 && !FAQ_STOP.has(w));
    function faqSearch(query) {
        const words = faqWords(query);
        if (!words.length) return null;
        const wanted = words.map(w => [faqStem(w), ...faqSyn(w).split(' ').filter(Boolean).map(faqStem)]);
        const hits = [];
        FAQ.forEach(([group, items]) => items.forEach(([q, a]) => {
            const qs = faqWords(q + ' ' + group).map(faqStem), as = faqWords(a).map(faqStem);
            const has = (list, w) => list.some(x => x === w || (w.length >= 4 && (x.startsWith(w) || w.startsWith(x)) && x.length >= 4));
            let score = 0, found = 0;
            wanted.forEach(([w, ...syn]) => {
                let best = has(qs, w) ? 4 : has(as, w) ? 1.5 : 0;
                if (!best && syn.some(x => has(qs, x))) best = 2;
                if (!best && syn.some(x => has(as, x))) best = .7;
                if (best) { found++; score += best; }
            });
            if (found) hits.push({group, q, a, score: score * (found / wanted.length) ** 1.5});
        }));
        hits.sort((x, y) => y.score - x.score);
        return hits.filter(h => h.score >= hits[0].score * .35).slice(0, 6); // les réponses loin derrière la meilleure ne servent à rien
    }
    const faqItem = (q, a, open = false) => `<details class="h-faq-item"${open ? ' open' : ''}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`;
    ext.faqHtml = () => `<section class="maintenance-panel full-width help-intro h-faq"><h3>Questions fréquentes</h3>
        <label class="h-faq-search"><span aria-hidden="true">🔎</span><input type="search" data-faq-q placeholder="Pose ta question : comment faire un livre de famille en PDF ?" autocomplete="off"></label>
        <div data-faq-results hidden></div>
        <div data-faq-all><p>Comment faire ceci ou cela dans LCNDA.</p>
        ${FAQ.map(([group, items]) => `<h4>${esc(group)}</h4>${items.map(([q, a]) => faqItem(q, a)).join('')}`).join('')}</div></section>`;
    document.addEventListener('input', event => {
        const input = event.target.closest?.('[data-faq-q]'); if (!input) return;
        const box = input.closest('.h-faq'), results = box.querySelector('[data-faq-results]'), all = box.querySelector('[data-faq-all]');
        const hits = faqSearch(input.value);
        results.hidden = !hits; all.hidden = !!hits;
        if (!hits) return;
        results.innerHTML = hits.length
            ? `<p class="muted">${hits.length === 1 ? 'La réponse la plus proche' : 'Les réponses les plus proches'} :</p>${hits.map((h, i) => `<small class="h-faq-group">${esc(h.group)}</small>${faqItem(h.q, h.a, i === 0)}`).join('')}`
            : '<p class="muted">Pas de réponse avec ces mots : essaie d’autres mots (« photo », « sauvegarde », « arbre »…). Pour une question sur ta généalogie elle-même (« Qui était boulanger à Lille ? »), va dans Recherche → « Poser une question en français ».</p>';
    });
    ext.faqSearch = faqSearch; // pour les tests
    /* ═══════════════════════ ✍️ RECONNAISSANCE D'ÉCRITURE (HTR) : installation ═══════════════════════ */

    let htrTimer = 0;
    ext.maintenance.htr = async token => {
        clearTimeout(htrTimer);
        const s = await api('htr_setup_status');
        if (!isCurrent(token)) return;
        const running = s.install?.state === 'running';
        const missing = s.models.filter(m => !m.present);
        const state = s.ready ? '<p class="h-offsite-sentence">✅ La reconnaissance d’écriture est prête : bouton « Reconnaissance manuscrite » sur les images (médias, transcriptions).</p>'
            : running ? `<p class="h-offsite-sentence">⏳ ${esc(s.install.step || 'Installation en cours…')}</p>`
            : s.install?.state === 'error' ? `<p class="h-offsite-sentence is-warn">⚠️ ${esc(s.install.step)}</p>`
            : `<p class="h-offsite-sentence is-warn">Pas encore installée.</p>`;
        A().$('#workspace').innerHTML = `<section class="page collection-page">${header('MAINTENANCE', 'Reconnaissance d’écriture (HTR)', 'Lire automatiquement un acte manuscrit : l’app propose une transcription, que tu corriges ensuite. Elle s’appuie sur Kraken, un logiciel libre de recherche (EPHE, Inria), qui fonctionne sans Internet une fois installé.')}
            <section class="maintenance-panel">${state}
                <ol class="h-htr-steps">
                    <li class="${s.kraken ? 'is-done' : ''}"><strong>Python 3.10 ou 3.11</strong> doit être sur l’ordinateur (une seule fois). ${s.kraken ? '✅' : `Si l’installation dit qu’il manque : <a href="https://www.python.org/downloads/" target="_blank" rel="noopener noreferrer">python.org/downloads ↗</a>${s.windows ? ' (coche « Add python.exe to PATH »)' : ''}.`}</li>
                    <li class="${s.kraken ? 'is-done' : ''}"><strong>Kraken</strong> et ses modèles : bouton ci-dessous. Compte 5 à 15 minutes et environ 1 Go ; tu peux continuer à travailler pendant ce temps. ${s.kraken ? '✅ installé' : ''}</li>
                    <li class="${missing.length ? '' : 'is-done'}"><strong>Modèles</strong> : téléchargés tout seuls quand c’est possible ; sinon, ajoute le fichier .mlmodel à la main dans le tableau. ${missing.length ? '' : '✅'}</li>
                </ol>
                <div class="page-actions"><button type="button" class="button" data-h-htr-install ${running ? 'disabled' : ''}>${s.kraken ? 'Réinstaller / compléter les modèles' : 'Installer la reconnaissance d’écriture'}</button>${s.kraken && missing.length ? '<button type="button" class="button secondary" data-h-htr-models>Télécharger seulement les modèles</button>' : ''}</div>
                <p class="muted">Tout est rangé dans le dossier des données de LCNDA (<code>${esc(s.dir)}</code>), pas dans l’application : rien n’est perdu à la mise à jour de LCNDA.</p>
                ${s.log ? `<details ${running ? 'open' : ''}><summary>Journal de l’installation</summary><pre class="h-htr-log">${esc(s.log)}</pre></details>` : ''}</section>
            <section class="maintenance-panel"><h3>Modèles d’écriture</h3>
                <table class="data-table"><thead><tr><th>Fichier</th><th>Pour</th><th>État</th><th>Ajouter à la main</th></tr></thead><tbody>${s.models.map(m => `<tr><td><code>${esc(m.file)}</code></td><td><small>${esc(m.labels.join(' · '))}</small></td>
                    <td>${m.present ? `✅ ${sizeText(m.size)}` : m.doi ? '⬇️ téléchargé à l’installation' : '— <small class="muted">à ajouter à la main</small>'}</td>
                    <td><label class="button small secondary h-htr-up">Choisir le fichier…<input type="file" accept=".mlmodel" data-h-htr-up="${esc(m.file)}" hidden></label>${m.doi ? ` <a href="https://doi.org/${esc(m.doi)}" target="_blank" rel="noopener noreferrer"><small>source ↗</small></a>` : ''}</td></tr>`).join('')}</tbody></table>
                <p class="muted">Les modèles Kraken se trouvent sur Zenodo et HTR-United (<a href="https://htr-united.github.io/" target="_blank" rel="noopener noreferrer">htr-united.github.io ↗</a>). Un modèle ajouté à la main remplace celui du même nom.</p></section></section>`;
        const ws = A().$('#workspace');
        const start = async only => {
            try { const r = await api('htr_install', {}, {method: 'POST', body: {only}}); toast(r.result?.already ? 'Une installation est déjà en cours.' : 'Installation lancée en arrière-plan.'); ext.maintenance.htr(++S().workspaceToken); }
            catch (error) { toast(error.message, 'error'); }
        };
        ws.querySelector('[data-h-htr-install]').addEventListener('click', () => start(''));
        ws.querySelector('[data-h-htr-models]')?.addEventListener('click', () => start('models'));
        ws.querySelectorAll('[data-h-htr-up]').forEach(input => input.addEventListener('change', async () => {
            if (!input.files[0]) return;
            const fd = new FormData(); fd.append('file', input.files[0]); fd.append('target', input.dataset.hHtrUp);
            try { const j = await postForm('htr_upload_model', fd); toast(`Modèle ${j.file} ajouté (${sizeText(j.size)}).`); ext.maintenance.htr(++S().workspaceToken); }
            catch (error) { toast(error.message, 'error'); }
        }));
        if (running) htrTimer = setTimeout(() => { if (S().module === 'maintenance' && S().maintenanceTab === 'htr') ext.maintenance.htr(++S().workspaceToken); }, 4000);
    };
    /* ═══════════════════════ 📋 MES LISTES (Maintenance) ═══════════════════════ */

    // Critères des listes, widgets et graphiques ; « g » range le menu « + Critère » par thème
    const RULES = {
        last_name: {ev: 'Nom contient', pe: 'Nom contient', ui: 'text', g: 'Identité'},
        first_name: {ev: 'Prénom contient', pe: 'Prénom contient', ui: 'text', g: 'Identité'},
        gender: {ev: 'Sexe', pe: 'Sexe', ui: 'gender', g: 'Identité'},
        living: {ev: 'Statut (vivant, décédé)', pe: 'Statut (vivant, décédé)', ui: 'living', g: 'Identité'},
        occupation: {ev: 'Métier contient', pe: 'Métier contient', ui: 'text', g: 'Identité'},
        label: {ev: 'Étiquette', pe: 'Étiquette', ui: 'labels', g: 'Identité'},
        bookmarked: {ev: 'Dans mes favoris', pe: 'Dans mes favoris', ui: 'none', g: 'Identité'},
        year: {ev: 'Année entre', pe: 'Né(e) entre (années)', ui: 'range', g: 'Dates et âges'},
        date_range: {ev: 'Date précise entre', pe: 'Né(e) entre deux dates précises', ui: 'dates', g: 'Dates et âges'},
        birth_month: {ev: 'Personne née en (mois)', pe: 'Né(e) en (mois)', ui: 'months', g: 'Dates et âges'},
        death_year: {pe: 'Mort(e) entre (années)', ui: 'range', g: 'Dates et âges'},
        age_at: {ev: 'Âge à l’événement entre', pe: 'Âge à un événement entre', ui: 'age', g: 'Dates et âges'},
        lifespan: {ev: 'A vécu entre … ans', pe: 'A vécu entre … ans', ui: 'years_old', g: 'Dates et âges'},
        place: {ev: 'Lieu contient', pe: 'Né(e) à (lieu contient)', ui: 'text', g: 'Lieux'},
        death_place: {ev: 'Personne morte à (lieu contient)', pe: 'Mort(e) ou inhumé(e) à (lieu contient)', ui: 'text', g: 'Lieux'},
        any_place: {pe: 'A un événement à (lieu contient)', ui: 'text', g: 'Lieux'},
        county: {ev: 'Département, région ou pays contient', pe: 'A un événement dans le département, la région ou le pays', ui: 'text', g: 'Lieux'},
        near_place: {ev: 'Lieu à moins de … km de', pe: 'A un événement à moins de … km de', ui: 'near', g: 'Lieux'},
        event_type: {ev: 'Type d’événement', pe: 'A eu un événement (mariage, divorce, voyage…)', ui: 'types', g: 'Vie et famille'},
        event_count: {ev: 'Nombre d’événements d’un type entre', pe: 'Nombre d’événements d’un type entre', ui: 'count_types', g: 'Vie et famille'},
        unions_count: {ev: 'Nombre d’unions (mariages) entre', pe: 'Nombre d’unions (mariages) entre', ui: 'count', g: 'Vie et famille'},
        children_count: {ev: 'Nombre d’enfants entre', pe: 'Nombre d’enfants entre', ui: 'count', g: 'Vie et famille'},
        spouse_name: {ev: 'Conjoint : nom ou prénom contient', pe: 'Conjoint : nom ou prénom contient', ui: 'text', g: 'Vie et famille'},
        parent_name: {ev: 'Parent : nom ou prénom contient', pe: 'Parent : nom ou prénom contient', ui: 'text', g: 'Vie et famille'},
        no_parents: {ev: 'Parents inconnus', pe: 'Parents inconnus', ui: 'none', g: 'Vie et famille'},
        death_cause: {ev: 'Cause de décès contient', pe: 'Cause de décès contient', ui: 'text', g: 'Vie et famille'},
        sosa: {ev: 'Seulement mes ancêtres (Sosa)', pe: 'Seulement mes ancêtres (Sosa)', ui: 'none', g: 'Lignée'},
        of_person: {ev: 'Par rapport à la personne de la fiche', pe: 'Par rapport à la personne de la fiche (ses ancêtres, sa famille…)', ui: 'relative', g: 'Lignée'},
        sosa_generation: {ev: 'Génération Sosa entre', pe: 'Génération Sosa entre', ui: 'range', g: 'Lignée'},
        no_source: {ev: 'Sans source', pe: 'Sans source', ui: 'none', g: 'Recherche'},
        source_count: {ev: 'Nombre de sources entre', pe: 'Nombre de sources entre', ui: 'count', g: 'Recherche'},
        has_media: {ev: 'A une photo ou un document', pe: 'A une photo ou un document', ui: 'none', g: 'Recherche'},
        note: {ev: 'Note contient', pe: 'Note contient', ui: 'text', g: 'Recherche'},
        text: {ev: 'Description contient', pe: 'Description contient', ui: 'text', g: 'Recherche'},
    };
    const RULE_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    /** Les options du menu « + Critère », rangées par thème */
    ext.ruleOptionsHtml = k => { const groups = {}; Object.entries(RULES).filter(([, m]) => m[k]).forEach(([f, m]) => { (groups[m.g || 'Autres'] ||= []).push(`<option value="${f}">${esc(m[k])}</option>`); }); return Object.entries(groups).map(([g, o]) => `<optgroup label="${esc(g)}">${o.join('')}</optgroup>`).join(''); };
    const LIST_TEMPLATES = (types) => {
        const tag = t => types.filter(x => x.gedcom_tag === t).map(x => Number(x.id));
        return [
            {name: 'Divorces 1850–1920', icon: '💔', source: 'events', definition: {match: 'all', rules: [{field: 'event_type', values: tag('DIV')}, {field: 'year', from: 1850, to: 1920}], columns: ['date', 'type', 'who', 'place', 'age'], custom: [{label: 'Jugement demandé', type: 'checkbox'}, {label: 'Note', type: 'text'}]}},
            {name: 'Préparer un salon', icon: '🎪', description: 'Mes ancêtres dont les parents sont inconnus : à demander aux associations du salon.', source: 'persons', definition: {match: 'all', rules: [{field: 'sosa'}, {field: 'no_parents'}], columns: ['name', 'birth', 'birthplace', 'sosa'], custom: [{label: 'Association / stand', type: 'text'}, {label: 'Priorité', type: 'select', options: ['haute', 'moyenne', 'basse']}, {label: 'Fait', type: 'checkbox'}]}},
            {name: 'Salon : stands à visiter', icon: '🎪', description: 'Les stands et associations à voir au salon, ce que je veux leur demander, et ce qui est fait.', source: 'free', definition: {match: 'all', rules: [], columns: [], custom: [{label: 'Stand / association', type: 'text'}, {label: 'Thème', type: 'select', options: ['état civil', 'registres paroissiaux', 'notaires', 'militaire', 'paléographie', 'émigration', 'autre']}, {label: 'Question à poser', type: 'text'}, {label: 'Ancêtre concerné', type: 'person'}, {label: 'Site internet', type: 'url'}, {label: 'Fait', type: 'checkbox'}]}},
            {name: 'Mariages sans source', icon: '💍', source: 'events', definition: {match: 'all', rules: [{field: 'event_type', values: tag('MARR')}, {field: 'no_source'}], columns: ['date', 'who', 'place'], custom: [{label: 'Archives à consulter', type: 'text'}, {label: 'Trouvé', type: 'checkbox'}]}},
            {name: 'Liste vide', icon: '📋', source: 'persons', definition: {match: 'all', rules: [], columns: ['name', 'birth', 'death'], custom: []}},
        ];
    };
    /** Les listes de l'onglet Listes qui peuvent servir de point de départ. */
    const APP_LIST_TEMPLATES = (types) => {
        const tag = t => types.filter(x => x.gedcom_tag === t).map(x => Number(x.id));
        const ev = (name, icon, t) => ({name, icon, source: 'events', definition: {match: 'all', rules: [{field: 'event_type', values: tag(t)}], columns: ['date', 'who', 'place', 'age'], custom: []}});
        return [
            {name: 'Personnes', icon: '👤', source: 'persons', definition: {match: 'all', rules: [], columns: ['name', 'birth', 'birthplace', 'death', 'deathplace'], custom: []}},
            {name: 'Événements', icon: '📅', source: 'events', definition: {match: 'all', rules: [], columns: ['date', 'type', 'who', 'place'], custom: []}},
            ev('Naissances', '👶', 'BIRT'), ev('Mariages', '💍', 'MARR'), ev('Décès', '✝️', 'DEAT'),
            {name: 'Lieux', icon: '📍', source: 'places', definition: {columns: ['name', 'county', 'country', 'events', 'people'], custom: []}},
            {name: 'Médias', icon: '🖼️', source: 'media', definition: {columns: ['title', 'kind', 'date', 'person', 'reference'], custom: []}},
            {name: 'Métiers', icon: '🛠️', source: 'occupations', definition: {columns: ['occupation', 'people', 'names'], custom: []}},
            {name: 'Recensements', icon: '🏘️', source: 'census', definition: {columns: ['year', 'place', 'address', 'members', 'names'], custom: []}},
            {name: 'Rappels', icon: '⏰', source: 'reminders', definition: {columns: ['title', 'due', 'category', 'done'], custom: []}},
            {name: 'Sources', icon: '📚', source: 'sources', definition: {columns: ['title', 'author', 'agency', 'citations'], custom: []}},
            {name: 'Objets de famille', icon: '🏺', source: 'family_objects', definition: {columns: ['title', 'kind', 'person', 'location'], custom: []}},
            {name: 'Registre de courriers', icon: '✉️', source: 'courriers', definition: {columns: ['organisme', 'objet', 'sent', 'statut', 'relance'], custom: []}},
            {name: 'Sépultures', icon: '🪦', source: 'graves', definition: {columns: ['cemetery', 'city', 'plan', 'state', 'names'], custom: []}},
            {name: 'Budget de recherche', icon: '💶', source: 'budget', definition: {columns: ['title', 'category', 'amount', 'date'], custom: []}},
            {name: 'Répertoire des vivants', icon: '📇', source: 'living', definition: {columns: ['name', 'relationship', 'city', 'email', 'phone'], custom: []}},
            {name: 'SOSA (mes ancêtres)', icon: '🌳', source: 'persons', definition: {match: 'all', rules: [{field: 'sosa'}], columns: ['sosa', 'name', 'birth', 'birthplace', 'death'], custom: []}},
            {name: 'Étiquettes', icon: '🏷️', source: 'persons', definition: {match: 'all', rules: [{field: 'label', values: []}], columns: ['name', 'labels', 'birth', 'death'], custom: []}},
        ];
    };
    /** Les listes « Mes listes » affichées aussi dans l'onglet Listes (gardées en mémoire pour le menu de gauche). */
    let pinnedLists = [];
    async function refreshPinnedLists() {
        try { const r = await api('my_lists'); pinnedLists = (r.lists || []).filter(l => l.definition?.in_lists).map(l => ({id: Number(l.id), name: l.name, icon: l.icon || '📋'})); } catch (_) { return; }
        if (S().module === 'listes') A().renderSidebar?.();
    }
    ext.extraListTypes = () => pinnedLists.map(l => ['mylist:' + l.id, l.icon, l.name]);
    ext.listHandler = type => String(type || '').startsWith('mylist:') ? (token => renderListView(token, Number(type.slice(7)), true)) : null;
    setTimeout(refreshPinnedLists, 0);
    let listMeta = null, listEditor = null;
    ext.afterListDeleted = async inLists => { await refreshPinnedLists(); if (inLists) { S().listType = 'persons'; A().renderSidebar?.(); A().renderList?.(); } else ext.maintenance.my_lists(++S().workspaceToken); };
    const sourceName = src => ({events: 'événements', persons: 'personnes', free: 'lignes écrites à la main', records: 'fiches à remplir (mon formulaire)'}[src] || (listMeta?.sources?.[src] ? 'liste « ' + listMeta.sources[src] + ' »' : ''));
    ext.maintenance.my_lists = async token => {
        listMeta = await api('my_lists');
        if (!isCurrent(token)) return;
        if (S().hListOpen) return renderListView(token, S().hListOpen);
        if (listEditor) return renderListEditor(token);
        const lists = listMeta.lists || [];
        const ruleText = (l) => l.source === 'records' ? 'formulaire : ' + ((l.definition.fields || []).filter(x => x.type !== 'heading').map(x => x.label).join(', ') || 'aucun champ') : l.source === 'free' ? 'rien ne vient de la base : tu écris toi-même chaque ligne' : listMeta.sources?.[l.source] ? `reprise de la liste « ${listMeta.sources[l.source]} »${Object.keys(l.definition.filters || {}).length ? ' · filtrée' : ''}` : (l.definition.rules || []).map(r => (RULES[r.field]?.[l.source === 'events' ? 'ev' : 'pe'] || r.field) + (r.value ? ` « ${r.value} »` : '') + (r.from || r.to ? ` ${r.from || '…'}–${r.to || '…'}` : '')).join(l.definition.match === 'any' ? ' OU ' : ' ET ') || 'aucun critère';
        A().$('#workspace').innerHTML = `<section class="page collection-page">${header('MAINTENANCE', 'Éditeur de listes', 'Des listes sur mesure. <b>Des fiches avec ton propre formulaire</b>, comme « Circuits sur le terrain » : champs au choix, dates, lieux sur la carte, personnes, photos, étapes sans limite, onglets « À faire / Faits / Tous ». Ou bien une liste tirée de la base : des événements (comme les divorces) ou des personnes, avec des critères (période, lieu, nom, étiquette, ancêtres…), tes colonnes, et tes propres colonnes à remplir.', '<button type="button" class="button" data-h-list-new>+ Nouvelle liste</button><button type="button" class="button secondary" data-h-list-import>Importer une liste…</button>')}
            ${lists.length ? `<div class="h-records">${lists.map(l => `<article class="h-record"><header><div><button type="button" class="table-link" data-h-list-open="${l.id}"><strong>${esc(l.icon)} ${esc(l.name)}</strong></button> <small class="muted">${sourceName(l.source)}${l.definition.in_lists ? ' · aussi dans l’onglet Listes' : ''}</small>${ext.labelChips(l.labels)}</div><span class="h-list-actions"><button type="button" class="link-button" data-h-list-share="${l.id}" title="Fichier à envoyer à un autre utilisateur de LCNDA">Partager</button>${tools(`data-h-list-edit="${l.id}"`, `data-h-list-del="${l.id}"`, 'cette liste')}</span></header>
                ${l.description ? `<p>${esc(l.description)}</p>` : ''}<p class="muted">${esc(ruleText(l))}${(l.definition.custom || []).length ? ` · colonnes à remplir : ${esc(l.definition.custom.map(c => c.label).join(', '))}` : ''}</p></article>`).join('')}</div>` : empty('Aucune liste pour l’instant : clique sur « + Nouvelle liste ».')}</section>`;
        const ws = A().$('#workspace');
        ws.querySelector('[data-h-list-new]').addEventListener('click', () => dialog({
            eyebrow: 'NOUVELLE LISTE', title: 'Par quoi commencer ?',
            body: (() => {
                const kind = t => ({events: 'Des événements', persons: 'Des personnes', free: 'Des lignes écrites à la main'}[t.source] || (listMeta.sources?.[t.source] ? 'Liste « ' + listMeta.sources[t.source] + ' »' : ''));
                const btn = (t, attr) => `<button type="button" class="h-template" ${attr}><span>${esc(t.icon || '📋')}</span><strong>${esc(t.name)}</strong><small>${kind(t)}</small></button>`;
                const recs = ext.recordTemplates ? ext.recordTemplates() : [];
                return `${recs.length ? `<h4>📇 Des fiches avec mon formulaire (comme « Circuits sur le terrain »)</h4><div class="h-templates">${recs.map((t, i) => `<button type="button" class="h-template" data-h-lrec="${i}"><span>${esc(t.icon)}</span><strong>${esc(t.name)}</strong><small>${esc(t.description || 'Je crée mes champs moi-même')}</small></button>`).join('')}</div>` : ''}
                    <h4>Listes tirées de la base</h4><div class="h-templates">${LIST_TEMPLATES(listMeta.event_types).map((t, i) => btn(t, `data-h-ltpl="${i}"`)).join('')}</div>
                    <h4>Partir d’une liste de l’app</h4><div class="h-templates">${APP_LIST_TEMPLATES(listMeta.event_types).map((t, i) => btn(t, `data-h-lapp="${i}"`)).join('')}</div>
                    ${lists.length ? `<h4>Partir d’une de mes listes</h4><p class="muted">Ses critères et ses colonnes sont repris ; la nouvelle liste démarre sans lignes.</p><div class="h-templates">${lists.map(l => btn(l, `data-h-lcopy="${l.id}"`)).join('')}</div>` : ''}`;
            })(),
            onOpen: d => {
                const start = (t, name) => { listEditor = JSON.parse(JSON.stringify({id: 0, description: '', ...t, labels: []})); listEditor.name = name; d.close(); renderListEditor(++S().workspaceToken); };
                d.querySelectorAll('[data-h-lrec]').forEach(b => b.addEventListener('click', () => { const t = ext.recordTemplates()[Number(b.dataset.hLrec)]; start(t, t.name === 'Liste de fiches vide' ? '' : t.name); }));
                d.querySelectorAll('[data-h-ltpl]').forEach(b => b.addEventListener('click', () => { const t = LIST_TEMPLATES(listMeta.event_types)[Number(b.dataset.hLtpl)]; start(t, t.name === 'Liste vide' ? '' : t.name); }));
                d.querySelectorAll('[data-h-lapp]').forEach(b => b.addEventListener('click', () => { const t = APP_LIST_TEMPLATES(listMeta.event_types)[Number(b.dataset.hLapp)]; start(t, t.name + ' (ma version)'); }));
                d.querySelectorAll('[data-h-lcopy]').forEach(b => b.addEventListener('click', () => {
                    const l = lists.find(x => x.id === Number(b.dataset.hLcopy)); if (!l) return;
                    const def = JSON.parse(JSON.stringify(l.definition)); def.in_lists = false; (def.custom || []).forEach(c => { delete c.key; });
                    start({icon: l.icon, description: l.description, source: l.source, definition: def}, 'Copie de ' + l.name);
                }));
            },
        }));
        ws.querySelector('[data-h-list-import]').addEventListener('click', async () => {
            const text = await ext.pickFile('.json,application/json');
            if (text === null) return;
            try { const r = await api('import_my_list', {}, {method: 'POST', body: {json: text}}); toast(`Liste importée${r.result.rows ? ` avec ${plural(r.result.rows, 'ligne', 'lignes')}` : ''}.${r.result.missing.length ? ` Absent de ta base : ${r.result.missing.join(', ')}.` : ''}`); S().hListOpen = r.result.id; refreshPinnedLists(); ext.maintenance.my_lists(++S().workspaceToken); }
            catch (error) { toast(error.message, 'error'); }
        });
        ws.querySelectorAll('[data-h-list-share]').forEach(b => b.addEventListener('click', async () => {
            try { const pkg = await api('export_my_list', {id: b.dataset.hListShare}); ext.downloadText(`liste-${String(pkg.name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}.lcnda-liste.json`, JSON.stringify(pkg, null, 1)); toast('Fichier prêt : l’autre personne l’importe dans Maintenance → Éditeur de listes → « Importer une liste… ».'); }
            catch (error) { toast(error.message, 'error'); }
        }));
        ws.querySelectorAll('[data-h-list-open]').forEach(b => b.addEventListener('click', () => { S().hListOpen = Number(b.dataset.hListOpen); ext.maintenance.my_lists(++S().workspaceToken); }));
        ws.querySelectorAll('[data-h-list-edit]').forEach(b => b.addEventListener('click', () => { const l = lists.find(x => x.id === Number(b.dataset.hListEdit)); listEditor = JSON.parse(JSON.stringify(l)); renderListEditor(++S().workspaceToken); }));
        ws.querySelectorAll('[data-h-list-del]').forEach(b => b.addEventListener('click', async () => { if (!confirm('Supprimer cette liste ? (les fiches ne sont pas touchées)')) return; await api('delete_my_list', {}, {method: 'POST', body: {id: b.dataset.hListDel}}); refreshPinnedLists(); ext.maintenance.my_lists(++S().workspaceToken); }));
    };
    /** Pour l'éditeur de widgets (heritage-widgets.js) : les mêmes critères que « Mes listes ». */
    ext.listRules = () => RULES;
    ext.listRuleRowHtml = (r, i, source, meta) => { if (meta) listMeta = meta; return ruleRowHtml(r, i, source); };
    function ruleRowHtml(r, i, source) {
        const meta = RULES[r.field] || {}; const k = source === 'events' ? 'ev' : 'pe';
        let input = '';
        if (meta.ui === 'text') input = `<input data-lr="value" value="${esc(r.value || '')}" placeholder="…">`;
        if (meta.ui === 'range') input = `<input type="number" data-lr="from" value="${esc(r.from || '')}" placeholder="de" class="h-lr-year"> et <input type="number" data-lr="to" value="${esc(r.to || '')}" placeholder="à" class="h-lr-year">`;
        if (meta.ui === 'dates') input = `le <input type="date" data-lr="date_from" value="${esc(r.date_from || '')}" title="Première date (facultatif)"> et le <input type="date" data-lr="date_to" value="${esc(r.date_to || '')}" title="Dernière date (facultatif)"><small class="muted">une année seule compte si toute l’année est dans la période</small>`;
        if (meta.ui === 'near') input = `<input type="number" min="1" max="1000" data-lr="km" value="${esc(r.km || 20)}" class="h-lr-year"> km de <input data-lr="value" value="${esc(r.value || '')}" placeholder="Brest"><small class="muted">lieux qui ont des coordonnées sur la carte</small>`;
        if (meta.ui === 'age') input = `<input type="number" data-lr="from" value="${esc(r.from || '')}" placeholder="de" class="h-lr-year"> et <input type="number" data-lr="to" value="${esc(r.to || '')}" placeholder="à" class="h-lr-year"> ans${source === 'persons' ? ', à l’événement' : ''} <select data-lr="values" multiple size="4" title="Aucun choisi : n’importe quel événement">${listMeta.event_types.map(t => `<option value="${t.id}" ${(r.values || []).map(Number).includes(Number(t.id)) ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select><small class="muted">aucun choisi : n’importe quel événement ; ⌘-clic (Ctrl-clic) pour en choisir plusieurs</small>`;
        if (meta.ui === 'years_old') input = `<input type="number" min="0" data-lr="from" value="${esc(r.from ?? '')}" placeholder="de" class="h-lr-year"> et <input type="number" min="0" data-lr="to" value="${esc(r.to ?? '')}" placeholder="à" class="h-lr-year"> ans <small class="muted">d’après la naissance et le décès</small>`;
        if (meta.ui === 'count' || meta.ui === 'count_types') input = `<input type="number" min="0" data-lr="from" value="${esc(r.from ?? '')}" placeholder="de" class="h-lr-year"> et <input type="number" min="0" data-lr="to" value="${esc(r.to ?? '')}" placeholder="à" class="h-lr-year">${meta.ui === 'count_types' ? ` <select data-lr="values" multiple size="4">${listMeta.event_types.map(t => `<option value="${t.id}" ${(r.values || []).map(Number).includes(Number(t.id)) ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select>` : ''}<small class="muted">« 2 et 2 » : exactement 2 ; « 0 et 0 » : aucun ; une case vide : pas de limite</small>`;
        if (meta.ui === 'relative') input = `<select data-lr="value">${[['ancestors', 'ses ancêtres'], ['descendants', 'ses descendants'], ['branch', 'ses ancêtres, ses descendants et elle'], ['family', 'sa famille proche (parents, frères et sœurs, conjoints, enfants)'], ['surname', 'les personnes de même nom']].map(([v, l]) => `<option value="${v}" ${(r.value || 'ancestors') === v ? 'selected' : ''}>${l}</option>`).join('')}</select><small class="muted">dans un bloc de fiche : la personne de la fiche ; ailleurs (tableau de bord, Graphiques) : le de cujus</small>`;
        if (meta.ui === 'living') input = `<select data-lr="value">${[['deceased', 'décédé(e)'], ['living', 'vivant(e)'], ['unknown', 'à vérifier']].map(([v, l]) => `<option value="${v}" ${r.value === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
        if (meta.ui === 'months') input = `<select data-lr="values" multiple size="4">${RULE_MONTHS.map((m, i) => `<option value="${i + 1}" ${(r.values || []).map(Number).includes(i + 1) ? 'selected' : ''}>${m}</option>`).join('')}</select><small class="muted">dates complètes seulement ; ⌘-clic (Ctrl-clic) pour en choisir plusieurs</small>`;
        if (meta.ui === 'gender') input = `<select data-lr="value">${[['female', 'Femme'], ['male', 'Homme'], ['unknown', 'Inconnu']].map(([v, l]) => `<option value="${v}" ${r.value === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
        if (meta.ui === 'types') input = `<select data-lr="values" multiple size="4">${listMeta.event_types.map(t => `<option value="${t.id}" ${(r.values || []).map(Number).includes(Number(t.id)) ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select>${source === 'persons' ? ` entre <input type="number" data-lr="from" value="${esc(r.from || '')}" placeholder="de" class="h-lr-year"> et <input type="number" data-lr="to" value="${esc(r.to || '')}" placeholder="à" class="h-lr-year">` : ''}`;
        if (meta.ui === 'labels') input = `<select data-lr="values" multiple size="3">${listMeta.labels.map(t => `<option value="${t.id}" ${(r.values || []).map(Number).includes(Number(t.id)) ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>`;
        if (meta.ui === 'types' || meta.ui === 'labels') input += '<small class="muted">⌘-clic (Ctrl-clic) pour en choisir plusieurs</small>';
        return `<div class="h-lr-row" data-lr-i="${i}"><label class="checkbox-line h-lr-not" title="Inverser ce critère"><input type="checkbox" data-lr="not" ${r.not ? 'checked' : ''}> pas</label><strong>${esc(meta[k] || r.field)}</strong> ${input}<button type="button" class="icon-button danger" data-lr-del title="Retirer ce critère">🗑</button></div>`;
    }
    function renderListEditor(token) {
        const L = listEditor, d = L.definition = L.definition || {};
        d.match ??= 'all'; d.rules ??= []; d.columns ??= []; d.custom ??= []; d.filters ??= {}; // un modèle peut n'avoir que ses colonnes
        const cols = listMeta.columns[L.source] || {};
        const k = L.source === 'events' ? 'ev' : 'pe';
        A().$('#workspace').innerHTML = `<section class="page collection-page h-be">${header('ÉDITEUR DE LISTES', L.id ? 'Modifier « ' + L.name + ' »' : 'Nouvelle liste', L.source === 'records' ? 'Trois étapes : la liste, le formulaire d’une fiche, puis l’allure de la liste.' : 'Trois étapes : ce que tu listes, les critères, puis les colonnes.', '<button type="button" class="button secondary" data-le-cancel>← Retour</button>')}
            <section class="maintenance-panel"><h3>1. La liste</h3><div class="form-grid"><label>Nom<input data-le="name" value="${esc(L.name)}" placeholder="Divorces 1850–1920"></label><label>Icône<input data-le="icon" value="${esc(L.icon || '📋')}" maxlength="16" class="h-be-icon"></label>
                <label class="span-2">Description <small>(facultatif)</small><input data-le="description" value="${esc(L.description || '')}"></label>
                <fieldset class="span-2 h-be-display"><legend>Je liste</legend><label class="checkbox-line"><input type="radio" name="le-source" value="records" ${L.source === 'records' ? 'checked' : ''}> des fiches que je remplis avec mon propre formulaire (comme « Circuits sur le terrain » : dates, lieux, personnes, photos, étapes, à faire / faits…)</label><label class="checkbox-line"><input type="radio" name="le-source" value="events" ${L.source === 'events' ? 'checked' : ''}> des événements (une ligne par événement : divorces, mariages, décès…)</label><label class="checkbox-line"><input type="radio" name="le-source" value="persons" ${L.source === 'persons' ? 'checked' : ''}> des personnes (une ligne par personne)</label><label class="checkbox-line"><input type="radio" name="le-source" value="free" ${L.source === 'free' ? 'checked' : ''}> des lignes que j’écris moi-même (stands d’un salon, choses à chercher aux archives…) : rien ne vient de la base</label>
                    <label class="checkbox-line"><input type="radio" name="le-source" value="__table" ${listMeta.sources?.[L.source] ? 'checked' : ''}> une liste de l’app : <select data-le-table>${Object.entries(listMeta.sources || {}).map(([k, l]) => `<option value="${k}" ${L.source === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label></fieldset>
                <label class="checkbox-line span-2"><input type="checkbox" data-le-inlists ${d.in_lists ? 'checked' : ''}> Afficher aussi cette liste dans l’onglet <b>Listes</b> (menu de gauche)</label>
                <div class="span-2">${ext.labelsPicker('custom_list', L.labels || [])}</div></div></section>
            ${L.source === 'records' ? ext.recordsBuilderHtml(L) : L.source === 'free' ? '' : listMeta.sources?.[L.source] ? `<section class="maintenance-panel"><h3>2. Ce que tu gardes</h3><p class="muted">La liste reprend toutes les lignes de « ${esc(listMeta.sources[L.source])} ». Une fois enregistrée, clique sur <b>▾</b> en haut d’une colonne pour ne garder que les valeurs que tu veux (certaines villes, certaines personnes, une période…), et sur le nom d’une colonne pour trier.</p></section>` : `<section class="maintenance-panel"><h3>2. Les critères</h3><p class="muted">Ajoute autant de critères que tu veux. « pas » inverse un critère (ex. « pas » + « Sans source » = seulement ce qui a une source).</p>
                <div class="h-tabs"><label class="checkbox-line"><input type="radio" name="le-match" value="all" ${d.match !== 'any' ? 'checked' : ''}> toutes les conditions (ET)</label><label class="checkbox-line"><input type="radio" name="le-match" value="any" ${d.match === 'any' ? 'checked' : ''}> au moins une (OU)</label></div>
                <div data-le-rules>${d.rules.map((r, i) => ruleRowHtml(r, i, L.source)).join('') || '<p class="muted">Aucun critère : toute la base.</p>'}</div>
                <label>+ Ajouter un critère <select data-le-addrule><option value="">choisir…</option>${ext.ruleOptionsHtml(k)}</select></label></section>`}
            ${L.source === 'records' ? '' : `<section class="maintenance-panel"><h3>${L.source === 'free' ? '2' : '3'}. Les colonnes</h3>${L.source === 'free' ? '' : '<p class="muted">Coche les colonnes à afficher. Pour ne garder que certaines valeurs d’une colonne (des personnes, des villes, des dates…), utilise <b>▾</b> en haut de la colonne, dans la liste.</p>'}${L.source === 'free' ? '<p class="muted">Crée les colonnes de ta liste ; tu ajouteras ensuite les lignes une par une.</p>' : `<div class="h-village-maps-grid">${Object.entries(cols).map(([c, l]) => `<label class="checkbox-line"><input type="checkbox" data-le-col="${c}" ${d.columns.includes(c) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>
                ${['events', 'persons'].includes(L.source) ? `<label>Trier par <select data-le="sort">${[['date', 'date'], ['name', 'nom'], ['place', 'lieu']].map(([v, l]) => `<option value="${v}" ${(d.sort || (L.source === 'events' ? 'date' : 'name')) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}`}
                <h4>Mes colonnes à remplir</h4><div data-le-custom>${d.custom.map((c, i) => `<div class="h-lr-row" data-lc-i="${i}"><input data-lc="label" value="${esc(c.label)}" placeholder="Nom de la colonne"><select data-lc="type">${[['text', 'Texte libre'], ['select', 'Menu déroulant'], ['checkbox', 'Case à cocher'], ['date', 'Date'], ['number', 'Nombre'], ['url', 'Lien internet'], ['person', 'Personne de la base']].map(([v, l]) => `<option value="${v}" ${c.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>${c.type === 'select' ? `<input data-lc="options" value="${esc((c.options || []).join(', '))}" placeholder="choix séparés par des virgules">` : ''}<button type="button" class="icon-button danger" data-lc-del>🗑</button></div>`).join('')}</div>
                <button type="button" class="button small secondary" data-le-addcol>+ Colonne à remplir</button></section>`}
            <div class="page-actions"><button type="button" class="button" data-le-save>Enregistrer et voir la liste</button><button type="button" class="button secondary" data-le-cancel>Annuler</button></div></section>`;
        const ws = A().$('#workspace');
        const again = () => renderListEditor(token);
        ws.querySelectorAll('[data-le-cancel]').forEach(b => b.addEventListener('click', () => { listEditor = null; ext.maintenance.my_lists(++S().workspaceToken); }));
        ws.querySelectorAll('[data-le]').forEach(el => el.addEventListener('input', () => { if (el.dataset.le === 'sort') d.sort = el.value; else L[el.dataset.le] = el.value; }));
        const keepLabels = () => { const b = ws.querySelector('[data-pending-labels="custom_list"]'); if (b) L.labels = pickerIds(b).map(id => (labelsCache || []).find(l => Number(l.id) === id) || (L.labels || []).find(l => Number(l.id) === id) || {id, name: '#' + id}); };
        ws.querySelector('[data-le-table]')?.addEventListener('change', e => { ws.querySelector('[name=le-source][value=__table]').checked = true; L.source = e.target.value; d.columns = Object.keys(listMeta.columns[L.source] || {}); d.filters = {}; keepLabels(); again(); });
        ws.querySelectorAll('[name=le-source]').forEach(el => el.addEventListener('change', () => { L.source = el.value === '__table' ? ws.querySelector('[data-le-table]').value : el.value; d.filters = {};
            if (L.source === 'records' && !(d.fields || []).length) { const t = ext.recordTemplates().find(x => x.name === 'Liste de fiches vide'); d.fields = t.definition.fields; d.record = t.definition.record; } d.columns = Object.keys(listMeta.columns[L.source] || {}).slice(0, 4); if (L.source === 'free' && !d.custom.length) d.custom.push({label: '', type: 'text', options: []}); keepLabels(); again(); }));
        ws.querySelectorAll('[name=le-match]').forEach(el => el.addEventListener('change', () => { d.match = el.value; }));
        ws.querySelector('[data-le-inlists]').addEventListener('change', e => { d.in_lists = e.target.checked; });
        ws.querySelector('[data-le-addrule]')?.addEventListener('change', e => { if (e.target.value) { d.rules.push({field: e.target.value, value: {gender: 'female', living: 'deceased', of_person: 'ancestors'}[e.target.value] || '', values: []}); again(); } });
        const rulesBox = ws.querySelector('[data-le-rules]') || document.createElement('div');
        const readRule = row => { const r = d.rules[Number(row.dataset.lrI)]; row.querySelectorAll('[data-lr]').forEach(el => { const f = el.dataset.lr; r[f] = f === 'not' ? el.checked : f === 'values' ? [...el.selectedOptions].map(o => Number(o.value)) : (f === 'from' || f === 'to') ? (el.value === '' ? null : Number(el.value)) : el.value; }); };
        rulesBox.addEventListener('input', e => { const row = e.target.closest('[data-lr-i]'); if (row) readRule(row); });
        rulesBox.addEventListener('change', e => { const row = e.target.closest('[data-lr-i]'); if (row) readRule(row); });
        rulesBox.addEventListener('click', e => { const row = e.target.closest('[data-lr-i]'); if (row && e.target.closest('[data-lr-del]')) { d.rules.splice(Number(row.dataset.lrI), 1); again(); } });
        ws.querySelectorAll('[data-le-col]').forEach(el => el.addEventListener('change', () => { d.columns = [...ws.querySelectorAll('[data-le-col]:checked')].map(x => x.dataset.leCol); }));
        ws.querySelector('[data-le-addcol]')?.addEventListener('click', () => { keepLabels(); d.custom.push({label: '', type: 'text', options: []}); again(); });
        const customBox = ws.querySelector('[data-le-custom]') || document.createElement('div');
        if (L.source === 'records') ext.bindRecordsBuilder(ws, L, () => { keepLabels(); again(); });
        customBox.addEventListener('input', e => { const row = e.target.closest('[data-lc-i]'); if (!row) return; const c = d.custom[Number(row.dataset.lcI)]; const f = e.target.dataset.lc; c[f] = f === 'options' ? e.target.value.split(',').map(x => x.trim()).filter(Boolean) : e.target.value; if (f === 'type') again(); });
        customBox.addEventListener('change', e => { if (e.target.dataset.lc === 'type') { d.custom[Number(e.target.closest('[data-lc-i]').dataset.lcI)].type = e.target.value; again(); } });
        customBox.addEventListener('click', e => { const row = e.target.closest('[data-lc-i]'); if (row && e.target.closest('[data-lc-del]')) { d.custom.splice(Number(row.dataset.lcI), 1); again(); } });
        ws.querySelector('[data-le-save]').addEventListener('click', async () => {
            if (!String(L.name || '').trim()) { toast('Donne un nom à la liste.', 'error'); return; }
            if (L.source === 'records') ext.recordsBeforeSave(d);
            const lb = ws.querySelector('[data-pending-labels="custom_list"]');
            try { const r = await api('save_my_list', {}, {method: 'POST', body: {id: L.id, name: L.name, icon: L.icon, description: L.description, source: L.source, definition: d, pending_labels: lb ? pickerIds(lb) : []}}); listEditor = null; S().hListOpen = r.result.id; refreshPinnedLists(); ext.maintenance.my_lists(++S().workspaceToken); }
            catch (error) { toast(error.message, 'error'); }
        });
    }
    /** Une de « Mes listes » : dans Maintenance, ou dans l'onglet Listes (inLists) quand elle y est affichée. */
    async function renderListView(token, id, inLists = false) {
        const module = inLists ? 'listes' : 'maintenance';
        let data;
        try { data = await api('my_list_rows', {id}); }
        catch (error) {
            toast(error.message, 'error');
            if (inLists) { if (isCurrent(token, 'listes')) A().$('#workspace').innerHTML = empty('Liste impossible à ouvrir : ' + esc(error.message)); refreshPinnedLists(); return; }
            S().hListOpen = 0; return ext.maintenance.my_lists(++S().workspaceToken);
        }
        if (!isCurrent(token, module)) return;
        const goEdit = () => { listEditor = JSON.parse(JSON.stringify(data.list)); S().hListOpen = 0; if (inLists) { S().maintenanceTab = 'my_lists'; A().setModule('maintenance'); } else ext.maintenance.my_lists(++S().workspaceToken); };
        if (data.list.source === 'records' && ext.renderRecords) return ext.renderRecords(token, id, inLists, data, {goEdit,
            back: () => { S().hListOpen = 0; S().hRec = {}; ext.maintenance.my_lists(++S().workspaceToken); }, reload: () => renderListView(++S().workspaceToken, id, inLists)});
        const L = data.list, d = L.definition, cols = d.columns, custom = d.custom || [];
        const isEv = L.source === 'events', isFree = L.source === 'free', isPersons = L.source === 'persons', isTable = !isEv && !isFree && !isPersons;
        const peopleCol = c => (!isTable && (c === 'who' || c === 'name')) || (isTable && c === 'person');
        const cell = (r, c) => peopleCol(c) && r.people?.length ? r.people.map(p => personLink(p.id, pname(p))).join(' et ') : esc(r.cells[c] ?? '');
        // Texte d'une case (pour les filtres, le tri et l'export)
        const text = (r, c) => {
            const own = custom.find(x => x.key === c);
            if (own) { const v = r.values?.[c] ?? ''; return own.type === 'checkbox' ? (v === '1' ? 'oui' : 'non') : own.type === 'person' ? (r.linked?.[c] ? pname(r.linked[c]) : '') : String(v); }
            return peopleCol(c) && r.people?.length ? r.people.map(pname).join(' et ') : String(r.cells?.[c] ?? '');
        };
        const yearOf = v => { const m = String(v).match(/(?<!\d)(\d{4})(?!\d)/); return m ? Number(m[1]) : null; };
        const filters = d.filters || {};
        const passes = r => Object.entries(filters).every(([c, f]) => {
            const v = text(r, c).trim();
            if (f.values && !f.values.includes(v)) return false;
            if (f.contains && !v.toLowerCase().includes(f.contains.toLowerCase())) return false;
            if (f.from || f.to) { const y = yearOf(v); if (y === null || (f.from && y < f.from) || (f.to && y > f.to)) return false; }
            return true;
        });
        const sort = S().hListSort?.id === id ? S().hListSort : null;
        let shown = data.rows.filter(passes);
        if (sort) {
            const num = v => { const y = yearOf(v); return y ?? (v !== '' && !isNaN(Number(v)) ? Number(v) : null); };
            shown = [...shown].sort((a, b) => { const x = text(a, sort.col), y = text(b, sort.col), nx = num(x), ny = num(y); const r = nx !== null && ny !== null ? nx - ny : x.localeCompare(y, 'fr', {numeric: true, sensitivity: 'base'}); return sort.dir === 'desc' ? -r : r; });
        }
        const allCols = [...cols.map(c => [c, data.columns[c] || c]), ...custom.map(c => [c.key, c.label])];
        const th = (c, label, own) => `<th class="${own ? 'h-lv-own' : ''}"><span class="h-lv-th"><button type="button" class="h-lv-sort" data-lv-sort="${esc(c)}" title="Trier">${esc(label)}${sort?.col === c ? (sort.dir === 'desc' ? ' ▼' : ' ▲') : ''}</button><button type="button" class="h-lv-filter ${filters[c] ? 'is-on' : ''}" data-lv-filter="${esc(c)}" title="Ne garder que certaines valeurs">▾</button></span></th>`;
        const filterChips = Object.keys(filters).length ? `<div class="h-lv-filters">Filtres : ${Object.entries(filters).map(([c, f]) => `<span class="h-lv-chip">${esc(allCols.find(x => x[0] === c)?.[1] || c)} : ${esc([f.values ? (f.values.length === 1 ? (f.values[0] || '(vide)') : f.values.length + ' valeurs') : '', f.contains ? '« ' + f.contains + ' »' : '', f.from || f.to ? (f.from || '…') + '–' + (f.to || '…') : ''].filter(Boolean).join(', '))} <button type="button" data-lv-unfilter="${esc(c)}" title="Enlever ce filtre">×</button></span>`).join('')} <button type="button" class="link-button" data-lv-unfilter="*">Tout enlever</button></div>` : '';
        const unit = isEv ? ['événement', 'événements'] : isFree || isTable ? ['ligne', 'lignes'] : ['personne', 'personnes'];
        const customCell = (r, c) => { const v = r.values?.[c.key] ?? '';
            if (c.type === 'checkbox') return `<input type="checkbox" data-lv="${esc(c.key)}" ${v === '1' ? 'checked' : ''}>`;
            if (c.type === 'person') { const p = r.linked?.[c.key] || (v && r.people?.find(x => Number(x.id) === Number(v))); return `${p ? personLink(p.id, pname(p)) : '<span class="muted">—</span>'} <button type="button" class="link-button" data-lv-person="${esc(c.key)}">${p ? 'changer' : 'choisir…'}</button>`; }
            if (c.type === 'url') return `<span class="h-lv-url"><input type="url" data-lv="${esc(c.key)}" value="${esc(v)}" placeholder="https://…">${/^https?:\/\//i.test(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener noreferrer" title="Ouvrir">↗</a>` : ''}</span>`;
            if (c.type === 'select') return `<select data-lv="${esc(c.key)}"><option value=""></option>${c.options.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
            return `<input type="${c.type === 'date' ? 'text' : c.type === 'number' ? 'number' : 'text'}" data-lv="${esc(c.key)}" value="${esc(v)}" ${c.type === 'date' ? 'placeholder="date"' : ''}>`; };
        // ── Apparence : tableau, fiches, groupes, colonnes à glisser, frise, galerie ──
        const DMODES = [['table', '▦ Tableau'], ['cards', '🗂 Fiches'], ['grouped', '📚 Par groupe'], ['kanban', '🧩 Colonnes à glisser'], ['timeline', '🕰 Frise'], ['gallery', '🖼 Galerie']];
        const fresh = x => ({mode: 'table', subtitle: [], colors: [], size: 'm', accent: '#0066cc', chart_style: 'bars', title: '', badge: '', group: '', kanban: '', date: '', chart: '', totals: false, ...(x || {})});
        let disp = fresh(d.display);
        const colLabel = c => allCols.find(x => x[0] === c)?.[1] || c;
        const LV_PAL = ['#0066cc', '#cc4700', '#00a37a', '#7a47db', '#cc0014', '#a07a00', '#008fa3', '#c2408f', '#5b6b7a', '#6b8e23', '#e08a00', '#3949ab'];
        const rowColor = (r, D) => { for (const k of D.colors || []) { const v = text(r, k.col).trim().toLowerCase(), w = String(k.value || '').trim().toLowerCase();
            if (k.op === 'eq' ? v === w : k.op === 'contains' ? (w && v.includes(w)) : k.op === 'empty' ? !v : !!v) return k.color; } return ''; };
        const roCell = (r, c) => { const own = custom.find(x => x.key === c); if (!own) return cell(r, c); if (own.type === 'person') { const p = r.linked?.[c]; return p ? personLink(p.id, pname(p)) : ''; } return esc(text(r, c)); };
        const removeBtn = r => `<button type="button" class="icon-button" data-lv-remove title="${isFree ? 'Supprimer la ligne' : 'Retirer de la liste (la fiche n’est pas touchée)'}">✕</button>${r.manual && !isFree ? ' <small class="muted" title="ajoutée à la main">✋</small>' : ''}`;
        const colorAttr = (r, D) => { const c = rowColor(r, D); return c ? ` style="--lv-row:${esc(c)}" data-lv-colored` : ''; };
        const tableHtml = (rows, D) => `<div class="h-lv-scroll"><table class="data-table h-lv-table"><thead><tr>${cols.map(c => th(c, data.columns[c] || c, false)).join('')}${custom.map(c => th(c.key, c.label, true)).join('')}<th></th></tr></thead><tbody>${rows.map(r => `<tr data-lv-key="${esc(r.key)}"${colorAttr(r, D)}>${cols.map(c => `<td>${cell(r, c)}</td>`).join('')}${custom.map(c => `<td class="h-lv-own">${customCell(r, c)}</td>`).join('')}<td>${removeBtn(r)}</td></tr>`).join('')}</tbody></table></div>`;
        const img = r => r.media?.media_type === 'image' && (r.media.thumbnail || r.media.filename) ? `<img src="media/${encodeURIComponent(r.media.thumbnail || r.media.filename)}" alt="" loading="lazy">` : '';
        const cardHtml = (r, D, {drag = false, big = false} = {}) => {
            const tc = D.title || allCols[0]?.[0] || '';
            const subs = (D.subtitle?.length ? D.subtitle : allCols.slice(1, 4).map(x => x[0])).filter(c => c !== tc && c !== D.badge && !(D.mode === 'kanban' && c === D.kanban));
            const own = custom.filter(c => !subs.includes(c.key) && (isFree || c.key !== tc) && c.key !== D.badge && !(D.mode === 'kanban' && c.key === D.kanban));
            const badge = D.badge ? text(r, D.badge).trim() : '';
            const pic = img(r) || (big ? `<span class="h-lv-letter">${esc((text(r, tc).trim()[0] || '·').toUpperCase())}</span>` : '');
            return `<article class="h-lv-card${big ? ' is-big' : ''}" data-lv-key="${esc(r.key)}"${drag ? ' draggable="true"' : ''}${colorAttr(r, D)}>
                ${pic ? `<button type="button" class="h-lv-card-img" ${r.media ? 'data-lv-media title="Voir le média"' : 'tabindex="-1"'}>${pic}</button>` : ''}
                <div class="h-lv-card-head"><strong>${(tc && roCell(r, tc)) || '<span class="muted">(sans titre)</span>'}</strong>${badge ? `<span class="h-lv-badge">${esc(badge)}</span>` : ''}</div>
                ${subs.map(c => { const o = custom.find(x => x.key === c); const v = o ? customCell(r, o) : cell(r, c); return o || text(r, c).trim() ? `<div class="h-lv-card-row"><span>${esc(colLabel(c))}</span> ${v}</div>` : ''; }).join('')}
                ${own.length ? `<div class="h-lv-card-own">${own.map(c => `<label><span>${esc(c.label)}</span> ${customCell(r, c)}</label>`).join('')}</div>` : ''}
                <div class="h-lv-card-foot">${removeBtn(r)}</div></article>`;
        };
        const sortVals = arr => arr.sort((a, b) => a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'fr', {numeric: true, sensitivity: 'base'}));
        const groupBy = (rows, f) => { const m = new Map(); rows.forEach(r => { const k = f(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return m; };
        const hint = t => `<p class="muted h-lv-hint">${t} <button type="button" class="link-button" data-lv-look>🎨 Apparence</button></p>`;
        const kanbanHtml = (rows, D) => {
            const kc = D.kanban; if (!kc) return hint('Choisis la colonne qui fait les colonnes du tableau (le mieux : une de tes colonnes « Menu déroulant » ou « Case à cocher », pour pouvoir glisser les fiches de l’une à l’autre).') + cardsHtml(rows, D);
            const own = custom.find(x => x.key === kc), drag = !!own && ['select', 'checkbox', 'text'].includes(own.type);
            const laneOf = r => own ? String(r.values?.[kc] ?? '') : text(r, kc).trim();
            const m = groupBy(rows, laneOf);
            const lanes = own?.type === 'select' ? ['', ...own.options] : own?.type === 'checkbox' ? ['', '1'] : [];
            sortVals([...m.keys()]).forEach(k => { if (!lanes.includes(k)) lanes.push(k); });
            const lab = v => own?.type === 'checkbox' ? (v === '1' ? '✔ ' + own.label : '✗ pas encore') : (v || '(vide)');
            return `${drag ? '' : hint('Pour pouvoir glisser les fiches, choisis une de tes colonnes à remplir.')}<div class="h-lv-kanban">${lanes.map((v, i) => { const list = m.get(v) || [];
                const c = (D.colors || []).find(k => k.col === kc && k.op === 'eq' && String(k.value).trim().toLowerCase() === v.toLowerCase())?.color || LV_PAL[i % LV_PAL.length];
                return `<section class="h-lv-lane" data-lv-lane="${esc(v)}" style="--lv-lane:${esc(c)}"><header>${esc(lab(v))} <small>${fmt(list.length)}</small></header><div class="h-lv-lane-body">${list.map(r => cardHtml(r, D, {drag})).join('') || '<p class="muted h-lv-drop">Glisse une fiche ici</p>'}</div></section>`; }).join('')}</div>`;
        };
        const cardsHtml = (rows, D) => `<div class="h-lv-cards">${rows.map(r => cardHtml(r, D)).join('')}</div>`;
        const groupedHtml = (rows, D) => { const g = D.group || allCols[0]?.[0]; const m = groupBy(rows, r => text(r, g).trim());
            return (D.group ? '' : hint('Les lignes sont regroupées selon la première colonne ; tu peux en choisir une autre.')) + sortVals([...m.keys()]).map(k => `<details class="h-lv-group" open><summary><b>${esc(k || '(vide)')}</b> <small class="muted">${plural(m.get(k).length, unit[0], unit[1])}</small></summary>${tableHtml(m.get(k), D)}</details>`).join(''); };
        const dateCol = D => { if (D.date) return D.date; const has = c => data.rows.some(r => yearOf(text(r, c)) !== null);
            const pref = allCols.filter(([c, l]) => custom.find(x => x.key === c)?.type === 'date' || /date|année|annee|an\b|naiss|décès|deces|mariage|baptême|year/i.test(l)).map(x => x[0]);
            return pref.find(has) || allCols.map(x => x[0]).find(has) || ''; };
        const timelineHtml = (rows, D) => { const dc = dateCol(D); if (!dc) return hint('Aucune colonne ne contient de date : choisis la colonne des dates.') + cardsHtml(rows, D);
            const m = groupBy(rows, r => yearOf(text(r, dc)) ?? ''); const years = [...m.keys()].filter(y => y !== '').sort((a, b) => a - b);
            return `<ol class="h-lv-timeline">${years.map(y => `<li><span class="h-lv-year">${y}</span><div class="h-lv-tl-items">${m.get(y).map(r => cardHtml(r, D)).join('')}</div></li>`).join('')}${m.has('') ? `<li class="is-nodate"><span class="h-lv-year">Sans date</span><div class="h-lv-tl-items">${m.get('').map(r => cardHtml(r, D)).join('')}</div></li>` : ''}</ol>`; };
        const galleryHtml = (rows, D) => `<div class="h-lv-gallery">${rows.map(r => cardHtml(r, D, {big: true})).join('')}</div>`;
        const chartHtml = (rows, D) => { if (!D.chart) return '';
            const m = new Map(); rows.forEach(r => { const v = text(r, D.chart).trim() || '(vide)'; m.set(v, (m.get(v) || 0) + 1); });
            let items = [...m.entries()].sort((a, b) => b[1] - a[1]); if (items.length > 12) { const rest = items.slice(11).reduce((t, x) => t + x[1], 0); items = [...items.slice(0, 11), ['autres', rest]]; }
            const total = rows.length || 1, max = Math.max(1, ...items.map(x => x[1]));
            const colOf = (v, i) => (D.colors || []).find(k => k.col === D.chart && k.op === 'eq' && String(k.value).trim().toLowerCase() === v.toLowerCase())?.color || LV_PAL[i % LV_PAL.length];
            const legend = items.map(([v, n], i) => `<li><i style="background:${esc(colOf(v, i))}"></i>${esc(v)} <b>${fmt(n)}</b> <small class="muted">${Math.round(n / total * 100)} %</small></li>`).join('');
            if (D.chart_style === 'pie') { let acc = 0; const stops = items.map(([v, n], i) => { const a = acc; acc += n / total * 360; return `${colOf(v, i)} ${a}deg ${acc}deg`; }).join(',');
                return `<figure class="h-lv-chart is-pie"><figcaption>${esc(colLabel(D.chart))}</figcaption><div class="h-lv-pie" style="background:conic-gradient(${esc(stops)})"></div><ul class="h-lv-legend">${legend}</ul></figure>`; }
            return `<figure class="h-lv-chart"><figcaption>${esc(colLabel(D.chart))}</figcaption>${items.map(([v, n], i) => `<div class="h-lv-bar"><span>${esc(v)}</span><b style="width:${Math.max(2, n / max * 100)}%;background:${esc(colOf(v, i))}"></b><em>${fmt(n)}</em></div>`).join('')}</figure>`; };
        const numOf = v => { const t = String(v).replace(/\s| /g, '').replace(',', '.'); return t !== '' && /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null; };
        const totalsHtml = (rows, D) => { if (!D.totals) return '';
            const sums = allCols.map(([c, l]) => { const vals = rows.map(r => text(r, c).trim()).filter(Boolean); if (!vals.length || vals.some(v => numOf(v) === null) || /date|année|year/i.test(l) || (yearOf(vals[0]) !== null && !custom.find(x => x.key === c && x.type === 'number'))) return null; return [l, vals.reduce((t, v) => t + numOf(v), 0)]; }).filter(Boolean);
            const checks = custom.filter(c => c.type === 'checkbox').map(c => [c.label, rows.filter(r => r.values?.[c.key] === '1').length]);
            return `<div class="h-lv-totals"><span><b>${fmt(rows.length)}</b> ${rows.length > 1 ? unit[1] : unit[0]}</span>${sums.map(([l, t]) => `<span>Total ${esc(l)} : <b>${fmt(Math.round(t * 100) / 100)}</b></span>`).join('')}${checks.map(([l, n]) => `<span>${esc(l)} : <b>${fmt(n)}</b> / ${fmt(rows.length)}</span>`).join('')}</div>`; };
        const bodyHtml = D => {
            if (!data.rows.length && !isFree) return empty('Aucune ligne ne répond à ces critères.');
            const view = {cards: cardsHtml, grouped: groupedHtml, kanban: kanbanHtml, timeline: timelineHtml, gallery: galleryHtml}[D.mode] || tableHtml;
            return `${totalsHtml(shown, D)}${chartHtml(shown, D)}${!shown.length && D.mode !== 'table' ? empty('Aucune ligne ne répond à ces critères.') : view(shown, D)}`;
        };
        const bodyAttrs = D => `class="h-lv-body h-lv-size-${esc(D.size || 'm')}" data-lv-body style="--lv-accent:${esc(D.accent || '#0066cc')}"`;
        const modesBar = D => `<div class="h-lv-modes"><span class="h-lv-modes-tabs">${DMODES.map(([m, l]) => `<button type="button" class="${D.mode === m ? 'is-on' : ''}" data-lv-mode="${m}">${l}</button>`).join('')}</span>
            ${D.mode !== 'table' && allCols.length ? `<label class="h-lv-mini">Trier <select data-lv-sortsel><option value="">—</option>${allCols.map(([c, l]) => `<option value="${esc(c)}" ${sort?.col === c ? 'selected' : ''}>${esc(l)}${sort?.col === c ? (sort.dir === 'desc' ? ' ▼' : ' ▲') : ''}</option>`).join('')}</select></label><label class="h-lv-mini">Filtrer <select data-lv-filtersel><option value="">choisir…</option>${allCols.map(([c, l]) => `<option value="${esc(c)}">${esc(l)}</option>`).join('')}</select></label>` : ''}
            <button type="button" class="button small secondary" data-lv-look>🎨 Apparence</button></div>`;
        A().$('#workspace').innerHTML = `<section class="page collection-page h-mylist">${header(inLists ? 'LISTES' : 'ÉDITEUR DE LISTES', (L.icon || '📋') + ' ' + L.name, esc(L.description || '') + `<br><strong>${plural(shown.length, unit[0], unit[1])}</strong>${shown.length !== data.rows.length ? ` affichée(s) sur ${fmt(data.rows.length)}` : ''}${data.truncated ? ' (liste coupée : les premières seulement)' : ''}` + (L.labels?.length ? '<br>' + ext.labelChips(L.labels) : ''),
                `${inLists ? '' : '<button type="button" class="button secondary" data-lv-back>← Éditeur de listes</button>'}<button type="button" class="button secondary" data-lv-csv>Exporter (CSV)</button><button type="button" class="button secondary" data-lv-print>Imprimer</button>${tools('data-lv-edit', 'data-lv-del', 'cette liste')}`)}
            ${isFree ? '<div class="collection-toolbar"><button type="button" class="button" data-lv-newrow>+ Ajouter une ligne</button></div>' : ''}
            ${isPersons ? `<div class="collection-toolbar"><label class="h-lv-add">Ajouter une personne à la main ${A().collectionPersonField('lv_add', null, 'Tape un nom…')}</label><button type="button" class="button small" data-lv-addbtn>Ajouter</button></div>` : ''}
            ${filterChips}${!isFree && data.rows.length && disp.mode === 'table' ? '<p class="muted h-lv-help">Clic sur le nom d’une colonne : trier · <b>▾</b> : ne garder que certaines valeurs (des personnes, des villes, une période…)</p>' : ''}
            ${modesBar(disp)}<div ${bodyAttrs(disp)}>${bodyHtml(disp)}</div></section>`;
        A().bindTableLinks?.();
        A().bindCollectionPersonFields(A().$('#workspace'));
        const ws = A().$('#workspace');
        const reload = () => renderListView(++S().workspaceToken, id, inLists);
        const saveFilters = async next => { try { await api('save_my_list_filters', {}, {method: 'POST', body: {id, filters: next}}); reload(); } catch (error) { toast(error.message, 'error'); } };
        const toggleSort = c => { S().hListSort = sort?.col === c ? (sort.dir === 'asc' ? {id, col: c, dir: 'desc'} : null) : {id, col: c, dir: 'asc'}; reload(); };
        ws.querySelectorAll('[data-lv-unfilter]').forEach(b => b.addEventListener('click', () => { const c = b.dataset.lvUnfilter; const next = c === '*' ? {} : {...filters}; delete next[c]; saveFilters(next); }));
        const openFilter = c => {
            const label = allCols.find(x => x[0] === c)?.[1] || c, f = filters[c] || {};
            // Toutes les valeurs de la colonne, avec leur nombre
            const counts = new Map(); data.rows.forEach(r => { const v = text(r, c).trim(); counts.set(v, (counts.get(v) || 0) + 1); });
            const values = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr', {numeric: true, sensitivity: 'base'}));
            const hasYears = values.some(([v]) => yearOf(v) !== null);
            dialog({eyebrow: 'FILTRER LA COLONNE', title: label, submitLabel: 'Appliquer',
                body: `<label>Ne garder que ce qui contient<input name="contains" value="${esc(f.contains || '')}" placeholder="un mot, un nom…"></label>
                    ${hasYears ? `<div class="h-lv-years"><label>Années de<input type="number" name="from" value="${esc(f.from || '')}" placeholder="1850"></label><label>à<input type="number" name="to" value="${esc(f.to || '')}" placeholder="1920"></label></div>` : ''}
                    <h4>Valeurs à garder <small class="muted">(${fmt(values.length)})</small></h4><div class="h-lv-vtools"><input type="search" data-lv-vq placeholder="Chercher une valeur…"><button type="button" class="link-button" data-lv-vall>Tout cocher</button><button type="button" class="link-button" data-lv-vnone>Tout décocher</button></div>
                    <div class="h-lv-values">${values.slice(0, 1500).map(([v, n], i) => `<label class="checkbox-line" data-lv-vrow="${esc(v.toLowerCase())}"><input type="checkbox" data-lv-v="${i}" ${!f.values || f.values.includes(v) ? 'checked' : ''}> ${v === '' ? '<em>(vide)</em>' : esc(v)} <small class="muted">${fmt(n)}</small></label>`).join('')}</div>`,
                onOpen: dl => {
                    dl.querySelector('[data-lv-vq]').addEventListener('input', e => { const q = e.target.value.toLowerCase(); dl.querySelectorAll('[data-lv-vrow]').forEach(r => { r.hidden = q && !r.dataset.lvVrow.includes(q); }); });
                    const setAll = on => dl.querySelectorAll('[data-lv-vrow]:not([hidden]) input').forEach(i => { i.checked = on; });
                    dl.querySelector('[data-lv-vall]').addEventListener('click', () => setAll(true));
                    dl.querySelector('[data-lv-vnone]').addEventListener('click', () => setAll(false));
                },
                onSubmit: async form => {
                    const checked = [...form.querySelectorAll('[data-lv-v]')].filter(i => i.checked).map(i => values[Number(i.dataset.lvV)][0]);
                    const nf = {};
                    // au-delà des 1 500 valeurs affichées : on garde ce qui était déjà retenu (elles n'ont pas pu être décochées)
                    const hidden = values.slice(1500).map(([v]) => v).filter(v => !f.values || f.values.includes(v));
                    if (checked.length < Math.min(values.length, 1500)) nf.values = checked.concat(hidden);
                    if (form.contains.value.trim()) nf.contains = form.contains.value.trim();
                    if (form.from?.value) nf.from = Number(form.from.value);
                    if (form.to?.value) nf.to = Number(form.to.value);
                    const next = {...filters}; if (Object.keys(nf).length) next[c] = nf; else delete next[c];
                    await saveFilters(next);
                },
            });
        };
        ws.querySelector('[data-lv-back]')?.addEventListener('click', () => { S().hListOpen = 0; ext.maintenance.my_lists(++S().workspaceToken); });
        ws.querySelector('[data-lv-edit]').addEventListener('click', goEdit);
        ws.querySelector('[data-lv-del]').addEventListener('click', async () => {
            if (!confirm('Supprimer cette liste ? (les fiches ne sont pas touchées)')) return;
            await api('delete_my_list', {}, {method: 'POST', body: {id}}); S().hListOpen = 0; await refreshPinnedLists();
            if (inLists) { S().listType = 'persons'; A().renderSidebar?.(); A().renderList?.(); } else ext.maintenance.my_lists(++S().workspaceToken);
        });
        ws.querySelector('[data-lv-print]').addEventListener('click', () => window.print());
        ws.querySelector('[data-lv-csv]').addEventListener('click', () => {
            const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
            const lines = [[...cols.map(c => data.columns[c] || c), ...custom.map(c => c.label)].map(q).join(';'),
                ...shown.map(r => allCols.map(([c]) => text(r, c)).map(q).join(';'))];
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], {type: 'text/csv'})); a.download = (L.name || 'liste').replace(/[^\p{L}\p{N}]+/gu, '-') + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
        });
        ws.querySelector('[data-lv-newrow]')?.addEventListener('click', async () => {
            try { await api('save_my_list_row', {}, {method: 'POST', body: {list_id: id, row_key: 'f:new'}}); await reload(); const last = [...ws.querySelectorAll('[data-lv-body] [data-lv-key]')].pop(); last?.querySelector('input,select')?.focus(); }
            catch (error) { toast(error.message, 'error'); }
        });
        const pickPerson = b => {
            const key = b.closest('[data-lv-key]').dataset.lvKey, field = b.dataset.lvPerson;
            dialog({eyebrow: 'MES LISTES', title: 'Relier à une fiche', submitLabel: 'Relier',
                body: `<label class="h-block-label">Personne${A().collectionPersonField('lv_pick', null, 'Tape un nom…')}</label><p class="muted">Laisse vide puis « Relier » pour enlever le lien.</p>`,
                onSubmit: async form => { await api('save_my_list_row', {}, {method: 'POST', body: {list_id: id, row_key: key, field, value: form.querySelector('[name=lv_pick]').value}}); reload(); }});
        };
        ws.querySelector('[data-lv-addbtn]')?.addEventListener('click', async () => {
            const pid = Number(ws.querySelector('[name=lv_add]').value);
            if (!pid) return toast('Choisis une personne dans les suggestions.', 'error');
            await api('save_my_list_row', {}, {method: 'POST', body: {list_id: id, row_key: 'p:' + pid, included: 1}}); toast('Ajoutée à la liste.'); reload();
        });
        const body = ws.querySelector('[data-lv-body]');
        const rowOf = key => data.rows.find(r => r.key === key);
        const paint = D => { body.className = `h-lv-body h-lv-size-${D.size || 'm'}`; body.style.setProperty('--lv-accent', D.accent || '#0066cc'); body.innerHTML = bodyHtml(D);
            ws.querySelectorAll('[data-lv-mode]').forEach(b => b.classList.toggle('is-on', b.dataset.lvMode === D.mode)); A().bindTableLinks?.(); A().bindCollectionPersonFields(body); };
        const saveDisplay = async D => { const r = await api('save_my_list_display', {}, {method: 'POST', body: {id, display: D}}); disp = fresh(r.result?.display || r.display || D); d.display = disp; return disp; };
        ws.querySelectorAll('[data-lv-mode]').forEach(b => b.addEventListener('click', async () => {
            const changed = (disp.mode === 'table') !== (b.dataset.lvMode === 'table'); disp = {...disp, mode: b.dataset.lvMode};
            try { await saveDisplay(disp); } catch (error) { toast(error.message, 'error'); }
            if (changed) reload(); else paint(disp);
        }));
        ws.querySelector('[data-lv-sortsel]')?.addEventListener('change', e => { const c = e.target.value; S().hListSort = c ? {id, col: c, dir: sort?.col === c && sort.dir === 'asc' ? 'desc' : 'asc'} : null; reload(); });
        ws.querySelector('[data-lv-filtersel]')?.addEventListener('change', e => { if (e.target.value) openFilter(e.target.value); e.target.value = ''; });
        ws.querySelector('.h-mylist').addEventListener('click', e => { if (e.target.closest('[data-lv-look]')) openLook(); });
        body.addEventListener('change', async e => {
            const el = e.target.closest('[data-lv-key]'), f = e.target.dataset.lv; if (!el || !f) return;
            const value = e.target.type === 'checkbox' ? (e.target.checked ? '1' : '') : e.target.value;
            try { await api('save_my_list_row', {}, {method: 'POST', body: {list_id: id, row_key: el.dataset.lvKey, field: f, value}}); const r = rowOf(el.dataset.lvKey); if (r) r.values = {...(r.values || {}), [f]: value};
                if (disp.mode !== 'table' && [disp.kanban, disp.group, disp.badge, disp.chart, ...(disp.colors || []).map(k => k.col)].includes(f)) paint(disp); }
            catch (error) { toast(error.message, 'error'); }
        });
        body.addEventListener('click', async e => {
            const t = e.target;
            if (t.closest('[data-lv-sort]')) return toggleSort(t.closest('[data-lv-sort]').dataset.lvSort);
            if (t.closest('[data-lv-filter]')) return openFilter(t.closest('[data-lv-filter]').dataset.lvFilter);
            if (t.closest('[data-lv-person]')) return pickPerson(t.closest('[data-lv-person]'));
            if (t.closest('[data-lv-media]')) { const r = rowOf(t.closest('[data-lv-key]')?.dataset.lvKey); if (r?.media) A().openLightbox([r.media], 0, true); return; }
            const b = t.closest('[data-lv-remove]'); if (!b) return;
            const el = b.closest('[data-lv-key]');
            if (isFree && !confirm('Supprimer cette ligne ?')) return;
            try { await api('save_my_list_row', {}, {method: 'POST', body: {list_id: id, row_key: el.dataset.lvKey, included: -1}}); }
            catch (error) { return toast(error.message, 'error'); }
            data.rows = data.rows.filter(r => r.key !== el.dataset.lvKey); shown = shown.filter(r => r.key !== el.dataset.lvKey); el.remove(); toast(isFree ? 'Ligne supprimée.' : 'Retirée de la liste.');
        });
        // Glisser une fiche d'une colonne à l'autre (mode « Colonnes à glisser »)
        let dragKey = '';
        body.addEventListener('dragstart', e => { const c = e.target.closest?.('.h-lv-card[draggable]'); if (!c) return; dragKey = c.dataset.lvKey; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragKey); c.classList.add('is-dragging'); });
        body.addEventListener('dragend', () => { dragKey = ''; body.querySelectorAll('.is-dragging,.is-over').forEach(x => x.classList.remove('is-dragging', 'is-over')); });
        body.addEventListener('dragover', e => { const lane = e.target.closest('[data-lv-lane]'); if (!lane || !dragKey) return; e.preventDefault(); body.querySelectorAll('.is-over').forEach(x => x !== lane && x.classList.remove('is-over')); lane.classList.add('is-over'); });
        body.addEventListener('drop', async e => {
            const lane = e.target.closest('[data-lv-lane]'); if (!lane || !dragKey) return; e.preventDefault();
            const r = rowOf(dragKey), kc = disp.kanban, value = lane.dataset.lvLane; dragKey = '';
            if (!r || String(r.values?.[kc] ?? '') === value) return paint(disp);
            try { await api('save_my_list_row', {}, {method: 'POST', body: {list_id: id, row_key: r.key, field: kc, value}}); r.values = {...(r.values || {}), [kc]: value}; }
            catch (error) { toast(error.message, 'error'); }
            paint(disp);
        });
        // 🎨 Apparence : choisir comment la liste s'affiche, avec aperçu en direct derrière la fenêtre
        function openLook() {
            const D = fresh(disp), opts = (v, none = '— aucune —') => `<option value="">${none}</option>${allCols.map(([c, l]) => `<option value="${esc(c)}" ${v === c ? 'selected' : ''}>${esc(l)}${custom.find(x => x.key === c) ? ' ✎' : ''}</option>`).join('')}`;
            const OPS = [['eq', 'est'], ['contains', 'contient'], ['notempty', 'est rempli(e)'], ['empty', 'est vide']];
            const ruleRow = k => `<div class="h-lv-crule" data-lv-crule><select data-k="col">${opts(k.col, 'colonne…')}</select><select data-k="op">${OPS.map(([v, l]) => `<option value="${v}" ${k.op === v ? 'selected' : ''}>${l}</option>`).join('')}</select><input data-k="value" value="${esc(k.value || '')}" placeholder="valeur"><input type="color" data-k="color" value="${esc(k.color || '#ffcc00')}"><button type="button" class="icon-button danger" data-lv-crule-del title="Enlever">🗑</button></div>`;
            let saved = false;
            dialog({eyebrow: 'MES LISTES', title: '🎨 Apparence de la liste', submitLabel: 'Enregistrer', wide: true,
                body: `<p class="muted">Tout se voit tout de suite derrière cette fenêtre. ✎ = une de tes colonnes à remplir.</p>
                    <div class="h-lv-look">
                    <fieldset><legend>Affichage</legend><div class="h-lv-look-modes">${DMODES.map(([m, l]) => `<label class="checkbox-line"><input type="radio" name="mode" value="${m}" ${D.mode === m ? 'checked' : ''}> ${l}</label>`).join('')}</div>
                        <label>Taille des fiches <select name="size">${[['s', 'petites'], ['m', 'moyennes'], ['l', 'grandes']].map(([v, l]) => `<option value="${v}" ${D.size === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                        <label>Couleur principale <input type="color" name="accent" value="${esc(D.accent)}"></label></fieldset>
                    <fieldset><legend>Fiches</legend><label>Titre de la fiche <select name="title">${opts(D.title, '— première colonne —')}</select></label>
                        <label>Pastille (en haut à droite) <select name="badge">${opts(D.badge)}</select></label>
                        <div><span class="section-label">Lignes sous le titre</span><div class="h-lv-look-subs">${allCols.map(([c, l]) => `<label class="checkbox-line"><input type="checkbox" name="subtitle" value="${esc(c)}" ${D.subtitle.includes(c) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div><small class="muted">Rien de coché : les 3 colonnes après le titre.</small></div></fieldset>
                    <fieldset><legend>Ranger</legend><label>📚 Grouper par <select name="group">${opts(D.group, '— première colonne —')}</select></label>
                        <label>🧩 Colonnes à glisser selon <select name="kanban">${opts(D.kanban)}</select><small class="muted">Choisis un « Menu déroulant » ✎ : chaque choix devient une colonne, et on y glisse les fiches.</small></label>
                        <label>🕰 Date de la frise <select name="date">${opts(D.date, '— trouvée toute seule —')}</select></label></fieldset>
                    <fieldset><legend>Résumé en haut</legend><label>Graphique de <select name="chart">${opts(D.chart, '— pas de graphique —')}</select></label>
                        <div class="h-tabs"><label class="checkbox-line"><input type="radio" name="chart_style" value="bars" ${D.chart_style !== 'pie' ? 'checked' : ''}> barres</label><label class="checkbox-line"><input type="radio" name="chart_style" value="pie" ${D.chart_style === 'pie' ? 'checked' : ''}> camembert</label></div>
                        <label class="checkbox-line"><input type="checkbox" name="totals" ${D.totals ? 'checked' : ''}> Totaux (nombre de lignes, sommes des nombres, cases cochées)</label></fieldset>
                    <fieldset class="h-lv-look-wide"><legend>Couleurs selon une valeur</legend><p class="muted">Ex. : « Statut » est « à faire » → orange. La première règle qui marche donne la couleur de la ligne ou de la fiche, du graphique et des colonnes.</p>
                        <div data-lv-crules>${D.colors.map(ruleRow).join('')}</div><button type="button" class="button small secondary" data-lv-crule-add>+ Règle de couleur</button></fieldset></div>`,
                onOpen: dl => {
                    const form = dl.querySelector('form');
                    const read = () => fresh({mode: form.mode.value, size: form.size.value, accent: form.accent.value, title: form.title.value, badge: form.badge.value,
                        subtitle: [...form.querySelectorAll('[name=subtitle]:checked')].map(i => i.value), group: form.group.value, kanban: form.kanban.value, date: form.date.value,
                        chart: form.chart.value, chart_style: form.chart_style.value, totals: form.totals.checked,
                        colors: [...form.querySelectorAll('[data-lv-crule]')].map(row => Object.fromEntries([...row.querySelectorAll('[data-k]')].map(el => [el.dataset.k, el.value]))).filter(k => k.col)});
                    const preview = () => paint(read());
                    form.addEventListener('input', preview); form.addEventListener('change', preview);
                    dl.querySelector('[data-lv-crule-add]').addEventListener('click', () => { dl.querySelector('[data-lv-crules]').insertAdjacentHTML('beforeend', ruleRow({op: 'eq', color: ['#ffb000', '#e53935', '#43a047', '#8e24aa', '#00acc1'][dl.querySelectorAll('[data-lv-crule]').length % 5]})); });
                    dl.querySelector('[data-lv-crules]').addEventListener('click', e => { if (e.target.closest('[data-lv-crule-del]')) { e.target.closest('[data-lv-crule]').remove(); preview(); } });
                    dl.addEventListener('close', () => { if (!saved) paint(disp); });
                    dl._read = read;
                },
                onSubmit: async form => { const was = disp.mode; await saveDisplay(form.closest('dialog')._read()); saved = true; toast('Apparence enregistrée.'); if ((was === 'table') !== (disp.mode === 'table')) reload(); else paint(disp); },
            });
        }
    }
})();
