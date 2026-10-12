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
        save_probate_inventory: 'probate_inventory', save_help_request: 'help_request', save_parish: 'parish', save_cited_name: 'cited_name', save_resistance: 'resistance', save_custom_block_entry: 'custom_block_entry', save_village_profile: 'village'};
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
    const newField = (type, label, options) => ({key: 'f' + Math.random().toString(36).slice(2, 8), type, label: label || (type === 'person_info' ? INFOS[0][1] : typeInfo(type)[2]), help: '', options: type === 'select' ? (options?.length ? [...options] : ['Choix 1', 'Choix 2']) : [], info: type === 'person_info' ? (INFOS.find(i => i[1] === label || i[1].startsWith(label))?.[0] || {Métier: 'occupation', Parents: 'parents'}[label] || 'birth') : 'birth', from: 'self', accept: 'all', required: false});
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
            <section class="maintenance-panel h-village-mapbox"><h3>🗺️ La carte</h3><div class="h-tabs">${villageMapButtons().map(k => `<button type="button" class="button small ${k === bg ? '' : 'secondary'}" data-h-village-bg="${esc(k)}">${esc(tileLabel(k))}</button>`).join('')}
                    <select data-h-village-bgsel aria-label="Autres fonds de carte"><option value="">Autres fonds…</option>${tileCats().map(c => `<optgroup label="${esc(c.label)}">${c.items.map(([k, l]) => `<option value="${esc(k)}" ${k === bg && !villageMapButtons().includes(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>`).join('')}</select><span class="spacer"></span><button type="button" class="icon-button" data-h-village-zoom="-1" title="Dézoomer">−</button><button type="button" class="icon-button" data-h-village-zoom="1" title="Zoomer">+</button></div>
                <div class="h-village-mapwrap">${villageMapHtml(v, bg, zoom)}</div>
                ${geoportail ? `<p class="h-links"><a href="${esc(geoportail)}" target="_blank" rel="noopener noreferrer">Ouvrir sur le Géoportail ↗</a> · <button type="button" class="link-button" data-h-village-main>Voir sur la carte de l’app</button></p>` : ''}</section>
            <section class="maintenance-panel"><h3>⛪ Église et paroisse</h3>
                <dl class="data-list">${pr.church ? `<div class="data-row"><dt>Église</dt><dd>${esc(pr.church)}</dd></div>` : ''}${pr.patron_saint ? `<div class="data-row"><dt>Saint patron</dt><dd>${esc(pr.patron_saint)}</dd></div>` : ''}${pr.diocese ? `<div class="data-row"><dt>Diocèse</dt><dd>${esc(pr.diocese)}</dd></div>` : ''}</dl>
                ${!pr.church && !pr.patron_saint && !pr.diocese ? '<p class="muted">Église, saint patron et diocèse à noter (crayon en haut).</p>' : ''}
                ${v.parish.length ? `<h4>Avant la Révolution</h4><ul>${v.parish.map(x => `<li>Dépendait de la paroisse de <strong>${esc(x.parish)}</strong>${x.until ? ` jusqu’en ${x.until}` : ''}${x.from ? ` (depuis ${x.from})` : ''}${x.note ? ` — <small>${esc(x.note)}</small>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Aucun rattachement à une autre paroisse noté (Listes → Paroisses d’Ancien Régime).</p>'}
                ${v.registers.length ? `<h4>Registres en ligne</h4><ul>${v.registers.map(l => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ↗</a>${l.note ? ` <small class="muted">${esc(l.note)}</small>` : ''}</li>`).join('')}</ul>` : ''}
                ${v.graves.length ? `<h4>Cimetières</h4><ul>${v.graves.map(g => `<li>${esc(g.cemetery_name || 'Cimetière')} <small>(${plural(g.n, 'sépulture notée', 'sépultures notées')})</small></li>`).join('')}</ul>` : ''}</section>
            <section class="maintenance-panel"><h3>👥 Population au fil des recensements</h3>${pops.length > 1 ? '<p class="muted">La courbe est tout en bas de la fiche.</p>' : '<p class="muted">Les chiffres sont récupérés sur Wikipédia (en bas de la fiche) ; tu peux aussi les saisir à la main (crayon en haut).</p>'}
                ${pops.length ? `<details><summary>Les chiffres (${pops.length})</summary><table class="data-table"><tbody>${pops.map(p => `<tr><td>${p[0]}</td><td>${fmt(p[1])} habitants</td></tr>`).join('')}</tbody></table></details>` : ''}
                ${v.census.length ? `<h4>Recensements de la famille ici</h4><table class="data-table"><thead><tr><th>Année</th><th>Foyers</th><th>Personnes relevées</th></tr></thead><tbody>${v.census.map(c => `<tr><td>${c.year}</td><td>${c.households}</td><td>${c.members}</td></tr>`).join('')}</tbody></table>` : ''}
                <p class="h-links"><a href="${esc(wiki)}" target="_blank" rel="noopener noreferrer">Wikipédia (évolution démographique) ↗</a> · <a href="http://cassini.ehess.fr/" target="_blank" rel="noopener noreferrer">Des villages de Cassini aux communes d’aujourd’hui (EHESS) ↗</a></p></section>
            <section class="maintenance-panel"><h3>⚒️ Métiers dominants</h3>${v.jobs.length ? `<ul class="h-bars">${v.jobs.map(j => `<li><span class="h-bar-label">${esc(j.name)}</span><span class="h-bar"><i style="width:${Math.round(j.count / topJob * 100)}%"></i></span><span>${j.count}${j.from ? ` <small class="muted">${j.from}${j.to && j.to !== j.from ? '–' + j.to : ''}</small>` : ''}</span></li>`).join('')}</ul>` : '<p class="muted">Aucun métier noté pour les personnes de cette commune.</p>'}</section>
            </div>
            <section class="maintenance-panel"><h3>🏠 Les familles qui y ont vécu (${v.families.length})</h3>${v.families.length ? `<div class="data-table-wrap"><table class="data-table sortable-table"><thead><tr>${['Famille', 'Personnes', 'Période', 'Générations'].map((h, i) => `<th><button data-sort-column="${i}">${h}</button></th>`).join('')}<th>Qui</th></tr></thead><tbody>${v.families.map(f => `<tr><td data-sort-value="${esc(f.name.toLowerCase())}"><strong>${esc(f.name)}</strong>${f.variants.length > 1 ? `<br><small class="muted">${esc(f.variants.join(', '))}</small>` : ''}</td><td data-sort-value="${f.count}">${f.count}</td><td data-sort-value="${f.from || 9999}">${f.from ? esc(f.from + (f.to && f.to !== f.from ? '–' + f.to : '')) : '—'}</td><td data-sort-value="${f.generations}">${f.generations}</td><td>${(() => { const link = p => personLink(p.id, pname(p) + (p.birth_year ? ` (${p.birth_year})` : ''));
                    return f.people.length > 8 ? `<span>${f.people.slice(0, 8).map(link).join(', ')}</span><span hidden>, ${f.people.slice(8).map(link).join(', ')}</span> <button type="button" class="link-button" data-h-village-more data-n="${f.people.length - 8}">et ${f.people.length - 8} autre${f.people.length - 8 > 1 ? 's' : ''} ▾</button>` : f.people.map(link).join(', '); })()}</td></tr>`).join('')}</tbody></table></div>` : empty('Aucune personne de la famille rattachée à cette commune.')}</section>
            ${Object.keys(v.decades).length > 1 ? `<section class="maintenance-panel"><div class="h-panel-head"><h3>📜 Actes de la famille par décennie</h3><label class="h-inline">Afficher <select data-h-village-acts><option value="">Tous les actes (${fmt(Object.values(v.decades).reduce((a, b) => a + b, 0))})</option>${(v.decades_by_type || []).map(t => `<option value="${esc(t.label)}" ${t.label === actsType ? 'selected' : ''}>${esc(t.label)} (${fmt(t.total)})</option>`).join('')}</select></label></div><div data-h-village-decades>${decadesHtml(v, actsType)}</div></section>` : ''}
            ${pr.notes || v.media.length ? `<section class="maintenance-panel"><h3>📝 Notes et photos</h3>${pr.notes ? `<p class="h-transcription">${nl(pr.notes)}</p>` : ''}${ext.thumbs ? ext.thumbs('village-' + pr.id, v.media) : ''}</section>` : ''}
            <section class="maintenance-panel h-village-popchart" id="h-village-pop"><div class="h-panel-head"><h3>📈 Évolution du nombre d’habitants</h3><button type="button" class="button small secondary" data-h-village-wiki>${pr.population_source ? 'Mettre à jour depuis Wikipédia' : 'Récupérer sur Wikipédia'}</button></div>
                ${pops.length > 1 ? populationChart(pops) : '<p class="muted" data-h-village-popmsg>Pas encore assez de chiffres pour tracer la courbe.</p>'}
                ${pr.population_source ? `<p class="muted">Chiffres : <a href="${esc(pr.population_source)}" target="_blank" rel="noopener noreferrer">${esc(decodeURIComponent(pr.population_source.replace(/^.*\/wiki\//, '')).replace(/_/g, ' '))} — Wikipédia ↗</a> (d’après Cassini/EHESS et l’INSEE).</p>` : ''}</section>
            </section>`;
        A().bindTableLinks();
        const ws = A().$('#workspace');
        const again = () => renderVillage(++st.workspaceToken, key);
        ws.querySelector('[data-h-village-back]').addEventListener('click', () => { st.hVillage = ''; ext.lists.villages(++st.workspaceToken); });
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
                if (isCurrent(token, 'listes') || !auto) again();
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
            <p><button type="button" class="link-button" data-h-vmap-reset>Revenir aux fonds proposés au départ</button></p></section>`;
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
    /* ═══════════════════════ ❓ MINI FAQ (Maintenance → Glossaire / tuto / FAQ, tout en bas) ═══════════════════════ */

    const FAQ = [
        ['Fiches', [
            ['Comment ajouter un enfant, un parent ou un conjoint ?', 'Ouvre la fiche, puis dans les blocs Parents, Conjoints ou Enfants clique sur « + ». Tu peux choisir une personne qui existe déjà ou en créer une nouvelle.'],
            ['Comment afficher un bloc (Départs, Poilu, Résistant…) sur une fiche ?', 'Fiche → Identité (crayon) → « Blocs à afficher sur la fiche » : coche le bloc. Pour l’avoir sur toutes les fiches : Maintenance → Apparence → « Blocs à afficher sur demande ».'],
            ['Comment créer mon propre bloc ?', 'Maintenance → Éditeur de blocs → « + Nouveau bloc ». Pars d’un modèle, d’un bloc de l’app (Départs, Poilu, Résistant, Sépulture…) ou d’un de tes blocs, ajoute ou enlève des champs en cliquant sur les boutons, puis enregistre. Il apparaît ensuite dans Identité → « Blocs à afficher sur la fiche ».'],
            ['Comment mettre une étiquette ?', 'Dans presque tous les formulaires, la ligne « 🏷️ Étiquettes » : clique sur « + », tape le début du nom ou crée une nouvelle étiquette. La liste de toutes les étiquettes est dans Listes → Étiquettes.'],
            ['Comment protéger une fiche contre les modifications ?', 'Le cadenas en haut de la fiche la verrouille : plus rien ne peut y être changé, même par le travail à deux.'],
        ]],
        ['Recherche', [
            ['Comment retrouver vite une personne ou un lieu ?', '⌘K (Mac) ou Ctrl+K (Windows, Linux) : tape un nom, un lieu, une battue ou le nom d’un écran.'],
            ['Peut-on poser une question en français ?', 'Oui : Recherche → Type de recherche → « Poser une question en français », par exemple « Quels ancêtres étaient boulangers à Lille avant 1850 ? ». La recherche peut ensuite être enregistrée.'],
            ['Comment chercher un mot dans la page ?', '⌘F (Mac) ou Ctrl+F : les mots trouvés sont surlignés et comptés.'],
            ['Comment revenir à l’écran précédent ?', '⌘← et ⌘→ sur Mac, Alt+← et Alt+→ sur Windows et Linux. Tous les raccourcis : touche F1.'],
            ['Comment faire ma propre liste (ex. tous les divorces entre 1850 et 1920) ?', 'Maintenance → Mes listes → « + Nouvelle liste » : choisis des événements, des personnes, ou des lignes que tu écris toi-même (stands d’un salon…) ; combine les critères, choisis les colonnes, ajoute tes colonnes à remplir (texte, menu, case à cocher, lien, personne de la base) et des étiquettes. Tu peux aussi partir d’une liste de l’app (Naissances, Mariages, SOSA…) ou d’une de tes listes, l’afficher dans l’onglet Listes, et la partager avec un proche (bouton « Partager », puis « Importer une liste… » chez lui). Exportable en CSV et imprimable.'],
            ['Où voir l’histoire d’un village ?', 'Listes → Fiche d’un village : les familles, les métiers, l’église, la population au fil des recensements et la carte de Cassini.'],
        ]],
        ['Lieux et cartes', [
            ['Un lieu est mal placé sur la carte, que faire ?', 'Maintenance → Lieux mal placés : l’app repère les coordonnées improbables et propose la correction en un clic.'],
            ['Comment changer le fond de carte ?', 'Carte → réglages de la carte : Cassini, État-major, IGN, satellite, cadastre ancien… La fiche d’un village a aussi son propre choix.'],
            ['Un lieu étranger n’est pas proposé ?', 'Les villes du monde sont préparées une fois au premier lancement (quelques minutes). Un lieu introuvable peut toujours être tapé à la main.'],
        ]],
        ['Documents', [
            ['Comment ajouter des photos ou des scans ?', 'Dans le bloc Médias de la fiche (bouton « + »). Pour un dossier entier qui se remplit tout seul (scanner, téléphone) : Maintenance → Dossier « Scans » surveillé.'],
            ['Comment éclaircir ou retoucher une vieille photo ?', 'Ouvre la photo, puis « 🎚️ Retoucher » : luminosité, contraste, ombres, couleurs, noir et blanc, sépia, négatif et une courbe comme dans Photoshop. « Remplacer la photo » garde toujours l’original (« Revenir à l’original ») ; « Enregistrer une copie » ajoute la version retouchée à côté.'],
            ['Comment demander un acte récent à la mairie ?', 'Listes → Registre de courriers → « Actes à demander à la mairie » : la lettre est préparée, et un rappel peut être posé le jour où l’acte devient public.'],
            ['La reconnaissance d’écriture manuscrite ne marche pas ?', 'Elle demande un module à installer une seule fois : Maintenance → Reconnaissance d’écriture (HTR), bouton « Installer ».'],
        ]],
        ['Sauvegarde et partage', [
            ['Comment faire une sauvegarde ?', 'Maintenance → Sécurité & comparaison : sauvegarde automatique programmée, et ⌘⇧B (Ctrl+Maj+B) pour une sauvegarde tout de suite. La sauvegarde complète avec tous les médias, protégée par un mot de passe si tu veux, est dans Maintenance → Export propre.'],
            ['Comment mettre une copie chez un cousin ?', 'Maintenance → Copie chez un cousin : la copie est chiffrée, il la garde sans pouvoir la lire et te la rend si ton ordinateur tombe en panne.'],
            ['Comment travailler à deux sur la même généalogie ?', 'Maintenance → Travail à deux : vous partez de la même base, puis vous vous échangez des paquets de modifications, acceptés ou refusés un par un.'],
            ['Comment garder ou partager ma mise en page ?', 'Maintenance → Apparence → « Mes mises en page enregistrées » : donne un nom aux réglages actuels (design, menus affichés ou masqués et leur ordre, blocs, couleurs…), reviens-y en un clic, ou envoie le fichier à un autre utilisateur qui l’importe au même endroit.'],
            ['Comment montrer l’arbre sans risque qu’on le modifie ?', 'Le mode consultation (cadenas en haut à droite) bloque toute modification ; il se quitte avec ton mot de passe.'],
            ['Comment récupérer une fiche supprimée par erreur ?', 'Maintenance → Journal des modifications : une suppression se restaure avec tout ce qui était attaché. ⌘Z annule la dernière modification d’une fiche.'],
        ]],
        ['Import et export', [
            ['Comment importer mon arbre d’un autre logiciel ?', 'Maintenance → Import : fichier GEDCOM, Hérédis (.hmw) ou MacFamilyTree, sans passer par un export.'],
            ['Comment ajouter l’arbre d’un cousin à ma base ?', 'Maintenance → Fusionner un arbre : son GEDCOM est comparé au tien, puis tu décides fiche par fiche.'],
            ['Comment exporter seulement une branche ?', 'Maintenance → Export propre : choisis la personne de départ et les ascendants ou descendants à exporter.'],
        ]],
    ];
    ext.faqHtml = () => `<section class="maintenance-panel full-width help-intro h-faq"><h3>Questions fréquentes</h3><p>Comment faire ceci ou cela dans LCNDA.</p>
        ${FAQ.map(([group, items]) => `<h4>${esc(group)}</h4>${items.map(([q, a]) => `<details class="h-faq-item"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}`).join('')}</section>`;
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

    const RULES = {
        event_type: {ev: 'Type d’événement', pe: 'A eu un événement', ui: 'types'},
        year: {ev: 'Année entre', pe: 'Né(e) entre', ui: 'range'},
        death_year: {pe: 'Mort(e) entre', ui: 'range'},
        place: {ev: 'Lieu contient', pe: 'Né(e) à (lieu contient)', ui: 'text'},
        any_place: {pe: 'A un événement à (lieu contient)', ui: 'text'},
        last_name: {ev: 'Nom contient', pe: 'Nom contient', ui: 'text'},
        first_name: {ev: 'Prénom contient', pe: 'Prénom contient', ui: 'text'},
        occupation: {ev: 'Métier contient', pe: 'Métier contient', ui: 'text'},
        gender: {ev: 'Sexe', pe: 'Sexe', ui: 'gender'},
        label: {ev: 'Étiquette', pe: 'Étiquette', ui: 'labels'},
        sosa: {ev: 'Seulement mes ancêtres (Sosa)', pe: 'Seulement mes ancêtres (Sosa)', ui: 'none'},
        no_parents: {ev: 'Parents inconnus', pe: 'Parents inconnus', ui: 'none'},
        no_source: {ev: 'Sans source', pe: 'Sans source', ui: 'none'},
        text: {ev: 'Description contient', pe: 'Description contient', ui: 'text'},
    };
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
    const sourceName = src => ({events: 'événements', persons: 'personnes', free: 'lignes écrites à la main'}[src] || (listMeta?.sources?.[src] ? 'liste « ' + listMeta.sources[src] + ' »' : ''));
    ext.maintenance.my_lists = async token => {
        listMeta = await api('my_lists');
        if (!isCurrent(token)) return;
        if (S().hListOpen) return renderListView(token, S().hListOpen);
        if (listEditor) return renderListEditor(token);
        const lists = listMeta.lists || [];
        const ruleText = (l) => l.source === 'free' ? 'rien ne vient de la base : tu écris toi-même chaque ligne' : listMeta.sources?.[l.source] ? `reprise de la liste « ${listMeta.sources[l.source]} »${Object.keys(l.definition.filters || {}).length ? ' · filtrée' : ''}` : (l.definition.rules || []).map(r => (RULES[r.field]?.[l.source === 'events' ? 'ev' : 'pe'] || r.field) + (r.value ? ` « ${r.value} »` : '') + (r.from || r.to ? ` ${r.from || '…'}–${r.to || '…'}` : '')).join(l.definition.match === 'any' ? ' OU ' : ' ET ') || 'aucun critère';
        A().$('#workspace').innerHTML = `<section class="page collection-page">${header('MAINTENANCE', 'Mes listes', 'Des listes sur mesure : choisis ce que tu listes (des événements, comme les divorces, ou des personnes), combine des critères (période, lieu, nom, étiquette, ancêtres…), choisis les colonnes, et ajoute tes propres colonnes à remplir (texte, menu, case à cocher) — par exemple pour préparer un salon.', '<button type="button" class="button" data-h-list-new>+ Nouvelle liste</button><button type="button" class="button secondary" data-h-list-import>Importer une liste…</button>')}
            ${lists.length ? `<div class="h-records">${lists.map(l => `<article class="h-record"><header><div><button type="button" class="table-link" data-h-list-open="${l.id}"><strong>${esc(l.icon)} ${esc(l.name)}</strong></button> <small class="muted">${sourceName(l.source)}${l.definition.in_lists ? ' · aussi dans l’onglet Listes' : ''}</small>${ext.labelChips(l.labels)}</div><span class="h-list-actions"><button type="button" class="link-button" data-h-list-share="${l.id}" title="Fichier à envoyer à un autre utilisateur de LCNDA">Partager</button>${tools(`data-h-list-edit="${l.id}"`, `data-h-list-del="${l.id}"`, 'cette liste')}</span></header>
                ${l.description ? `<p>${esc(l.description)}</p>` : ''}<p class="muted">${esc(ruleText(l))}${(l.definition.custom || []).length ? ` · colonnes à remplir : ${esc(l.definition.custom.map(c => c.label).join(', '))}` : ''}</p></article>`).join('')}</div>` : empty('Aucune liste pour l’instant : clique sur « + Nouvelle liste ».')}</section>`;
        const ws = A().$('#workspace');
        ws.querySelector('[data-h-list-new]').addEventListener('click', () => dialog({
            eyebrow: 'NOUVELLE LISTE', title: 'Par quoi commencer ?',
            body: (() => {
                const kind = t => ({events: 'Des événements', persons: 'Des personnes', free: 'Des lignes écrites à la main'}[t.source] || (listMeta.sources?.[t.source] ? 'Liste « ' + listMeta.sources[t.source] + ' »' : ''));
                const btn = (t, attr) => `<button type="button" class="h-template" ${attr}><span>${esc(t.icon || '📋')}</span><strong>${esc(t.name)}</strong><small>${kind(t)}</small></button>`;
                return `<h4>Modèles</h4><div class="h-templates">${LIST_TEMPLATES(listMeta.event_types).map((t, i) => btn(t, `data-h-ltpl="${i}"`)).join('')}</div>
                    <h4>Partir d’une liste de l’app</h4><div class="h-templates">${APP_LIST_TEMPLATES(listMeta.event_types).map((t, i) => btn(t, `data-h-lapp="${i}"`)).join('')}</div>
                    ${lists.length ? `<h4>Partir d’une de mes listes</h4><p class="muted">Ses critères et ses colonnes sont repris ; la nouvelle liste démarre sans lignes.</p><div class="h-templates">${lists.map(l => btn(l, `data-h-lcopy="${l.id}"`)).join('')}</div>` : ''}`;
            })(),
            onOpen: d => {
                const start = (t, name) => { listEditor = JSON.parse(JSON.stringify({id: 0, description: '', ...t, labels: []})); listEditor.name = name; d.close(); renderListEditor(++S().workspaceToken); };
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
            try { const pkg = await api('export_my_list', {id: b.dataset.hListShare}); ext.downloadText(`liste-${String(pkg.name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}.lcnda-liste.json`, JSON.stringify(pkg, null, 1)); toast('Fichier prêt : l’autre personne l’importe dans Maintenance → Mes listes → « Importer une liste… ».'); }
            catch (error) { toast(error.message, 'error'); }
        }));
        ws.querySelectorAll('[data-h-list-open]').forEach(b => b.addEventListener('click', () => { S().hListOpen = Number(b.dataset.hListOpen); ext.maintenance.my_lists(++S().workspaceToken); }));
        ws.querySelectorAll('[data-h-list-edit]').forEach(b => b.addEventListener('click', () => { const l = lists.find(x => x.id === Number(b.dataset.hListEdit)); listEditor = JSON.parse(JSON.stringify(l)); renderListEditor(++S().workspaceToken); }));
        ws.querySelectorAll('[data-h-list-del]').forEach(b => b.addEventListener('click', async () => { if (!confirm('Supprimer cette liste ? (les fiches ne sont pas touchées)')) return; await api('delete_my_list', {}, {method: 'POST', body: {id: b.dataset.hListDel}}); refreshPinnedLists(); ext.maintenance.my_lists(++S().workspaceToken); }));
    };
    function ruleRowHtml(r, i, source) {
        const meta = RULES[r.field] || {}; const k = source === 'events' ? 'ev' : 'pe';
        let input = '';
        if (meta.ui === 'text') input = `<input data-lr="value" value="${esc(r.value || '')}" placeholder="…">`;
        if (meta.ui === 'range') input = `<input type="number" data-lr="from" value="${esc(r.from || '')}" placeholder="de" class="h-lr-year"> et <input type="number" data-lr="to" value="${esc(r.to || '')}" placeholder="à" class="h-lr-year">`;
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
        A().$('#workspace').innerHTML = `<section class="page collection-page h-be">${header('MES LISTES', L.id ? 'Modifier « ' + L.name + ' »' : 'Nouvelle liste', 'Trois étapes : ce que tu listes, les critères, puis les colonnes.', '<button type="button" class="button secondary" data-le-cancel>← Retour</button>')}
            <section class="maintenance-panel"><h3>1. La liste</h3><div class="form-grid"><label>Nom<input data-le="name" value="${esc(L.name)}" placeholder="Divorces 1850–1920"></label><label>Icône<input data-le="icon" value="${esc(L.icon || '📋')}" maxlength="16" class="h-be-icon"></label>
                <label class="span-2">Description <small>(facultatif)</small><input data-le="description" value="${esc(L.description || '')}"></label>
                <fieldset class="span-2 h-be-display"><legend>Je liste</legend><label class="checkbox-line"><input type="radio" name="le-source" value="events" ${L.source === 'events' ? 'checked' : ''}> des événements (une ligne par événement : divorces, mariages, décès…)</label><label class="checkbox-line"><input type="radio" name="le-source" value="persons" ${L.source === 'persons' ? 'checked' : ''}> des personnes (une ligne par personne)</label><label class="checkbox-line"><input type="radio" name="le-source" value="free" ${L.source === 'free' ? 'checked' : ''}> des lignes que j’écris moi-même (stands d’un salon, choses à chercher aux archives…) : rien ne vient de la base</label>
                    <label class="checkbox-line"><input type="radio" name="le-source" value="__table" ${listMeta.sources?.[L.source] ? 'checked' : ''}> une liste de l’app : <select data-le-table>${Object.entries(listMeta.sources || {}).map(([k, l]) => `<option value="${k}" ${L.source === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label></fieldset>
                <label class="checkbox-line span-2"><input type="checkbox" data-le-inlists ${d.in_lists ? 'checked' : ''}> Afficher aussi cette liste dans l’onglet <b>Listes</b> (menu de gauche)</label>
                <div class="span-2">${ext.labelsPicker('custom_list', L.labels || [])}</div></div></section>
            ${L.source === 'free' ? '' : listMeta.sources?.[L.source] ? `<section class="maintenance-panel"><h3>2. Ce que tu gardes</h3><p class="muted">La liste reprend toutes les lignes de « ${esc(listMeta.sources[L.source])} ». Une fois enregistrée, clique sur <b>▾</b> en haut d’une colonne pour ne garder que les valeurs que tu veux (certaines villes, certaines personnes, une période…), et sur le nom d’une colonne pour trier.</p></section>` : `<section class="maintenance-panel"><h3>2. Les critères</h3><p class="muted">Ajoute autant de critères que tu veux. « pas » inverse un critère (ex. « pas » + « Sans source » = seulement ce qui a une source).</p>
                <div class="h-tabs"><label class="checkbox-line"><input type="radio" name="le-match" value="all" ${d.match !== 'any' ? 'checked' : ''}> toutes les conditions (ET)</label><label class="checkbox-line"><input type="radio" name="le-match" value="any" ${d.match === 'any' ? 'checked' : ''}> au moins une (OU)</label></div>
                <div data-le-rules>${d.rules.map((r, i) => ruleRowHtml(r, i, L.source)).join('') || '<p class="muted">Aucun critère : toute la base.</p>'}</div>
                <label>+ Ajouter un critère <select data-le-addrule><option value="">choisir…</option>${Object.entries(RULES).filter(([, m]) => m[k]).map(([f, m]) => `<option value="${f}">${esc(m[k])}</option>`).join('')}</select></label></section>`}
            <section class="maintenance-panel"><h3>${L.source === 'free' ? '2' : '3'}. Les colonnes</h3>${L.source === 'free' ? '' : '<p class="muted">Coche les colonnes à afficher. Pour ne garder que certaines valeurs d’une colonne (des personnes, des villes, des dates…), utilise <b>▾</b> en haut de la colonne, dans la liste.</p>'}${L.source === 'free' ? '<p class="muted">Crée les colonnes de ta liste ; tu ajouteras ensuite les lignes une par une.</p>' : `<div class="h-village-maps-grid">${Object.entries(cols).map(([c, l]) => `<label class="checkbox-line"><input type="checkbox" data-le-col="${c}" ${d.columns.includes(c) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>
                ${['events', 'persons'].includes(L.source) ? `<label>Trier par <select data-le="sort">${[['date', 'date'], ['name', 'nom'], ['place', 'lieu']].map(([v, l]) => `<option value="${v}" ${(d.sort || (L.source === 'events' ? 'date' : 'name')) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}`}
                <h4>Mes colonnes à remplir</h4><div data-le-custom>${d.custom.map((c, i) => `<div class="h-lr-row" data-lc-i="${i}"><input data-lc="label" value="${esc(c.label)}" placeholder="Nom de la colonne"><select data-lc="type">${[['text', 'Texte libre'], ['select', 'Menu déroulant'], ['checkbox', 'Case à cocher'], ['date', 'Date'], ['number', 'Nombre'], ['url', 'Lien internet'], ['person', 'Personne de la base']].map(([v, l]) => `<option value="${v}" ${c.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>${c.type === 'select' ? `<input data-lc="options" value="${esc((c.options || []).join(', '))}" placeholder="choix séparés par des virgules">` : ''}<button type="button" class="icon-button danger" data-lc-del>🗑</button></div>`).join('')}</div>
                <button type="button" class="button small secondary" data-le-addcol>+ Colonne à remplir</button></section>
            <div class="page-actions"><button type="button" class="button" data-le-save>Enregistrer et voir la liste</button><button type="button" class="button secondary" data-le-cancel>Annuler</button></div></section>`;
        const ws = A().$('#workspace');
        const again = () => renderListEditor(token);
        ws.querySelectorAll('[data-le-cancel]').forEach(b => b.addEventListener('click', () => { listEditor = null; ext.maintenance.my_lists(++S().workspaceToken); }));
        ws.querySelectorAll('[data-le]').forEach(el => el.addEventListener('input', () => { if (el.dataset.le === 'sort') d.sort = el.value; else L[el.dataset.le] = el.value; }));
        const keepLabels = () => { const b = ws.querySelector('[data-pending-labels="custom_list"]'); if (b) L.labels = pickerIds(b).map(id => (labelsCache || []).find(l => Number(l.id) === id) || (L.labels || []).find(l => Number(l.id) === id) || {id, name: '#' + id}); };
        ws.querySelector('[data-le-table]')?.addEventListener('change', e => { ws.querySelector('[name=le-source][value=__table]').checked = true; L.source = e.target.value; d.columns = Object.keys(listMeta.columns[L.source] || {}); d.filters = {}; keepLabels(); again(); });
        ws.querySelectorAll('[name=le-source]').forEach(el => el.addEventListener('change', () => { L.source = el.value === '__table' ? ws.querySelector('[data-le-table]').value : el.value; d.filters = {}; d.columns = Object.keys(listMeta.columns[L.source] || {}).slice(0, 4); if (L.source === 'free' && !d.custom.length) d.custom.push({label: '', type: 'text', options: []}); keepLabels(); again(); }));
        ws.querySelectorAll('[name=le-match]').forEach(el => el.addEventListener('change', () => { d.match = el.value; }));
        ws.querySelector('[data-le-inlists]').addEventListener('change', e => { d.in_lists = e.target.checked; });
        ws.querySelector('[data-le-addrule]')?.addEventListener('change', e => { if (e.target.value) { d.rules.push({field: e.target.value, value: e.target.value === 'gender' ? 'female' : '', values: []}); again(); } });
        const rulesBox = ws.querySelector('[data-le-rules]') || document.createElement('div');
        const readRule = row => { const r = d.rules[Number(row.dataset.lrI)]; row.querySelectorAll('[data-lr]').forEach(el => { const f = el.dataset.lr; r[f] = f === 'not' ? el.checked : f === 'values' ? [...el.selectedOptions].map(o => Number(o.value)) : (f === 'from' || f === 'to') ? (Number(el.value) || null) : el.value; }); };
        rulesBox.addEventListener('input', e => { const row = e.target.closest('[data-lr-i]'); if (row) readRule(row); });
        rulesBox.addEventListener('change', e => { const row = e.target.closest('[data-lr-i]'); if (row) readRule(row); });
        rulesBox.addEventListener('click', e => { const row = e.target.closest('[data-lr-i]'); if (row && e.target.closest('[data-lr-del]')) { d.rules.splice(Number(row.dataset.lrI), 1); again(); } });
        ws.querySelectorAll('[data-le-col]').forEach(el => el.addEventListener('change', () => { d.columns = [...ws.querySelectorAll('[data-le-col]:checked')].map(x => x.dataset.leCol); }));
        ws.querySelector('[data-le-addcol]').addEventListener('click', () => { keepLabels(); d.custom.push({label: '', type: 'text', options: []}); again(); });
        const customBox = ws.querySelector('[data-le-custom]');
        customBox.addEventListener('input', e => { const row = e.target.closest('[data-lc-i]'); if (!row) return; const c = d.custom[Number(row.dataset.lcI)]; const f = e.target.dataset.lc; c[f] = f === 'options' ? e.target.value.split(',').map(x => x.trim()).filter(Boolean) : e.target.value; if (f === 'type') again(); });
        customBox.addEventListener('change', e => { if (e.target.dataset.lc === 'type') { d.custom[Number(e.target.closest('[data-lc-i]').dataset.lcI)].type = e.target.value; again(); } });
        customBox.addEventListener('click', e => { const row = e.target.closest('[data-lc-i]'); if (row && e.target.closest('[data-lc-del]')) { d.custom.splice(Number(row.dataset.lcI), 1); again(); } });
        ws.querySelector('[data-le-save]').addEventListener('click', async () => {
            if (!String(L.name || '').trim()) { toast('Donne un nom à la liste.', 'error'); return; }
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
        A().$('#workspace').innerHTML = `<section class="page collection-page h-mylist">${header('MES LISTES', (L.icon || '📋') + ' ' + L.name, esc(L.description || '') + `<br><strong>${plural(shown.length, unit[0], unit[1])}</strong>${shown.length !== data.rows.length ? ` affichée(s) sur ${fmt(data.rows.length)}` : ''}${data.truncated ? ' (liste coupée : les premières seulement)' : ''}` + (L.labels?.length ? '<br>' + ext.labelChips(L.labels) : ''),
                `${inLists ? '' : '<button type="button" class="button secondary" data-lv-back>← Mes listes</button>'}<button type="button" class="button secondary" data-lv-csv>Exporter (CSV)</button><button type="button" class="button secondary" data-lv-print>Imprimer</button>${tools('data-lv-edit', 'data-lv-del', 'cette liste')}`)}
            ${isFree ? '<div class="collection-toolbar"><button type="button" class="button" data-lv-newrow>+ Ajouter une ligne</button></div>' : ''}
            ${isPersons ? `<div class="collection-toolbar"><label class="h-lv-add">Ajouter une personne à la main ${A().collectionPersonField('lv_add', null, 'Tape un nom…')}</label><button type="button" class="button small" data-lv-addbtn>Ajouter</button></div>` : ''}
            ${filterChips}${!isFree && data.rows.length ? '<p class="muted h-lv-help">Clic sur le nom d’une colonne : trier · <b>▾</b> : ne garder que certaines valeurs (des personnes, des villes, une période…)</p>' : ''}
            ${data.rows.length || isFree ? `<div class="h-lv-scroll"><table class="data-table h-lv-table"><thead><tr>${cols.map(c => th(c, data.columns[c] || c, false)).join('')}${custom.map(c => th(c.key, c.label, true)).join('')}<th></th></tr></thead><tbody>${shown.map(r => `<tr data-lv-key="${esc(r.key)}">${cols.map(c => `<td>${cell(r, c)}</td>`).join('')}${custom.map(c => `<td class="h-lv-own">${customCell(r, c)}</td>`).join('')}<td><button type="button" class="icon-button" data-lv-remove title="Retirer de la liste (la fiche n’est pas touchée)">✕</button>${r.manual && !isFree ? ' <small class="muted" title="ajoutée à la main">✋</small>' : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('Aucune ligne ne répond à ces critères.')}</section>`;
        A().bindTableLinks?.();
        A().bindCollectionPersonFields(A().$('#workspace'));
        const ws = A().$('#workspace');
        const reload = () => renderListView(++S().workspaceToken, id, inLists);
        const saveFilters = async next => { try { await api('save_my_list_filters', {}, {method: 'POST', body: {id, filters: next}}); reload(); } catch (error) { toast(error.message, 'error'); } };
        ws.querySelectorAll('[data-lv-sort]').forEach(b => b.addEventListener('click', () => { const c = b.dataset.lvSort; S().hListSort = sort?.col === c ? (sort.dir === 'asc' ? {id, col: c, dir: 'desc'} : null) : {id, col: c, dir: 'asc'}; reload(); }));
        ws.querySelectorAll('[data-lv-unfilter]').forEach(b => b.addEventListener('click', () => { const c = b.dataset.lvUnfilter; const next = c === '*' ? {} : {...filters}; delete next[c]; saveFilters(next); }));
        ws.querySelectorAll('[data-lv-filter]').forEach(b => b.addEventListener('click', () => {
            const c = b.dataset.lvFilter, label = allCols.find(x => x[0] === c)?.[1] || c, f = filters[c] || {};
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
                    if (checked.length < Math.min(values.length, 1500)) nf.values = checked;
                    if (form.contains.value.trim()) nf.contains = form.contains.value.trim();
                    if (form.from?.value) nf.from = Number(form.from.value);
                    if (form.to?.value) nf.to = Number(form.to.value);
                    const next = {...filters}; if (Object.keys(nf).length) next[c] = nf; else delete next[c];
                    await saveFilters(next);
                },
            });
        }));
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
            try { await api('save_my_list_row', {}, {method: 'POST', body: {list_id: id, row_key: 'f:new'}}); await reload(); const last = [...A().$$('.h-lv-table tbody tr')].pop(); last?.querySelector('input,select')?.focus(); }
            catch (error) { toast(error.message, 'error'); }
        });
        ws.querySelectorAll('[data-lv-person]').forEach(b => b.addEventListener('click', () => {
            const key = b.closest('[data-lv-key]').dataset.lvKey, field = b.dataset.lvPerson;
            dialog({eyebrow: 'MES LISTES', title: 'Relier à une fiche', submitLabel: 'Relier',
                body: `<label class="h-block-label">Personne${A().collectionPersonField('lv_pick', null, 'Tape un nom…')}</label><p class="muted">Laisse vide puis « Relier » pour enlever le lien.</p>`,
                onSubmit: async form => { await api('save_my_list_row', {}, {method: 'POST', body: {list_id: id, row_key: key, field, value: form.querySelector('[name=lv_pick]').value}}); reload(); }});
        }));
        ws.querySelector('[data-lv-addbtn]')?.addEventListener('click', async () => {
            const pid = Number(ws.querySelector('[name=lv_add]').value);
            if (!pid) return toast('Choisis une personne dans les suggestions.', 'error');
            await api('save_my_list_row', {}, {method: 'POST', body: {list_id: id, row_key: 'p:' + pid, included: 1}}); toast('Ajoutée à la liste.'); reload();
        });
        ws.querySelector('.h-lv-table')?.addEventListener('change', async e => {
            const tr = e.target.closest('[data-lv-key]'), f = e.target.dataset.lv; if (!tr || !f) return;
            try { await api('save_my_list_row', {}, {method: 'POST', body: {list_id: id, row_key: tr.dataset.lvKey, field: f, value: e.target.type === 'checkbox' ? (e.target.checked ? '1' : '') : e.target.value}}); }
            catch (error) { toast(error.message, 'error'); }
        });
        ws.querySelector('.h-lv-table')?.addEventListener('click', async e => {
            const b = e.target.closest('[data-lv-remove]'); if (!b) return;
            const tr = b.closest('[data-lv-key]');
            if (isFree && !confirm('Supprimer cette ligne ?')) return;
            await api('save_my_list_row', {}, {method: 'POST', body: {list_id: id, row_key: tr.dataset.lvKey, included: -1}}); tr.remove(); toast(isFree ? 'Ligne supprimée.' : 'Retirée de la liste.');
        });
    }
})();
