/* LCNDA — 🔎 Recherche : les sortes et outils ajoutés par l'audit des onglets (docs/design/audit-onglets.html §11 et « manques transversaux »).
 *  - 🔁 Chercher et remplacer dans les données (prénoms, métiers, lieux, notes, descriptions) : aperçu ligne par ligne, « Remplacer », « ↶ Annuler » ;
 *  - 🧬 Recherche par lien de parenté ; 📊 Comparer deux recherches enregistrées ; 🧾 Sources et citations ;
 *  - ☑ la barre d'actions sur les résultats (tout cocher, 🏷 étiqueter, 📋 ajouter à Mes listes) + « ⤓ Exporter ▾ » et « 🖨 Imprimer » en haut ;
 *  - 🕘 les 20 dernières recherches, rappelables d'un clic (colonne de gauche).
 * Serveur : lib/recherche_outils.php (routes « ro_* »). Appelé par app-recherche.js (EXT.researchPlus, EXT.researchBar, EXT.researchHistory).
 * Essai : tests/test-audit-recherche.js
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI, S = () => A().state;
    const esc = s => A().escapeHtml(String(s ?? ''));
    const api = (...a) => A().api(...a);
    const post = async (action, body) => { const r = await api(action, {}, {method: 'POST', body}); return r?.result ?? r; };
    const kiosk = () => document.body.classList.contains('is-kiosk');
    const toast = (m, k) => A().toast(m, k);
    const ws = () => document.querySelector('#workspace');
    const live = (token, kind) => token === S().workspaceToken && S().module === 'recherche' && (!kind || S().researchKind === kind);
    const wait = text => `<section class="loading-screen">${UI().spinner(i18n(text))}</section>`; // R10 : le rond commun
    const readJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } };
    const writeJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const personName = p => A().personName ? A().personName(p) : `${p.first_name || ''} ${p.last_name || ''}`.trim();
    const yr = (d, y) => d || y || '—';

    /** « ↶ Annuler » (et « ↷ Rétablir ») d'un geste gardé côté serveur (table ro_undo) */
    function undoable(message, undoId, after) {
        if (!undoId) { toast(message); return; }
        A().undoToast(message, {
            undo: async () => { const r = await post('ro_undo', {id: undoId}); await after?.('undo'); return r?.already ? {already: true} : undefined; },
            redo: async () => { await post('ro_redo', {id: undoId}); await after?.('redo'); },
        });
    }

    /* ═════ Les formulaires des sortes ajoutées : gardés le temps de la séance (rappel par l'historique) ═════ */
    const FORMS_KEY = 'lcnda-research-forms';
    const forms = () => { const s = S(); if (!s.roForms) s.roForms = readJ(FORMS_KEY, {}) || {}; return s.roForms; };
    const setForm = (kind, v) => { forms()[kind] = v; writeJ(FORMS_KEY, forms()); };

    /* ═════ 🕘 Historique des recherches : les 20 dernières, toutes sortes ═════ */
    const HIST_KEY = 'genealogie-research-history';
    const SNAP_KEYS = ['research', 'dateSearch', 'placeNameSearch', 'transcriptionSearch', 'inseeSearch', 'proximitySearch', 'archiveDigestSearch'];
    const KIND_LABEL = () => Object.fromEntries((window.LCNDA_EXT?.researchKinds?.rows?.() || []).map(r => [r.key, r.label]));
    function historyLabel(kind) {
        const s = S(), f = forms()[kind] || {};
        switch (kind) {
            case 'text': return s.research?.q || '';
            case 'dates': { const d = s.dateSearch || {}; return [d.mode === 'range' ? [d.yearFrom, d.yearTo].filter(Boolean).join('–') : d.values, d.placeName, s.research?.q].filter(Boolean).join(' · '); }
            case 'place_name': return s.placeNameSearch?.q || '';
            case 'transcriptions': return s.transcriptionSearch?.q || '';
            case 'archive_digest': { const a = s.archiveDigestSearch || {}; return [a.q, a.city, a.dept].filter(Boolean).join(' · '); }
            case 'insee': { const n = s.inseeSearch || {}; return [n.prenom, n.nom, n.communeNaissance, n.communeDeces].filter(Boolean).join(' '); }
            case 'proximity': { const p = s.proximitySearch || {}; return [p.placeName, p.yearFrom && p.yearTo ? `${p.yearFrom}–${p.yearTo}` : p.exactDate].filter(Boolean).join(' · '); }
            case 'replace': return f.find ? `${f.find} → ${f.replace ?? ''}` : '';
            case 'kinship': return f.person_name ? `${REL()[f.relation] || ''} · ${f.person_name}` : '';
            case 'compare': return f.a_name && f.b_name ? `${f.a_name} / ${f.b_name}` : '';
            case 'sources': return f.q || '';
            default: return '';
        }
    }
    const history = {
        list: () => { const h = readJ(HIST_KEY, []); return Array.isArray(h) ? h.filter(x => x && typeof x.kind === 'string') : []; },
        /** gardée après chaque recherche lancée (la même deux fois de suite remonte en haut) */
        add(kind = S().researchKind) {
            const label = String(historyLabel(kind) || '').trim(); if (!label) return;
            const s = S(), snap = {}; SNAP_KEYS.forEach(k => { if (s[k] != null) snap[k] = JSON.parse(JSON.stringify(s[k])); });
            if (forms()[kind]) snap.roForm = JSON.parse(JSON.stringify(forms()[kind]));
            const list = history.list().filter(x => !(x.kind === kind && x.label === label));
            list.unshift({kind, label: label.slice(0, 120), at: Date.now(), snap});
            writeJ(HIST_KEY, list.slice(0, 20));
            history.refresh();
        },
        restore(i) {
            const it = history.list()[i]; if (!it) return;
            const s = S(); SNAP_KEYS.forEach(k => { if (it.snap?.[k]) s[k] = JSON.parse(JSON.stringify(it.snap[k])); });
            if (it.snap?.roForm) setForm(it.kind, it.snap.roForm);
            s.researchKind = it.kind; s.archiveDigestAdding = false;
            A().persistUiState(); A().renderSidebar(); window.LCNDA_PARTS?.renderResearch?.();
        },
        html() {
            const list = history.list(), kl = KIND_LABEL();
            if (!list.length) return '';
            return `<details class="rp-history" data-rp-history><summary>${esc(i18n('🕘 Dernières recherches'))} <small>${list.length}</small></summary><div class="rp-history-list">${list.map((h, i) => `<button type="button" class="rp-history-item" data-rp-hist="${i}" title="${esc(new Date(h.at).toLocaleString('fr-FR'))}"><b>${esc(h.label)}</b><small>${esc(i18n(kl[h.kind] || h.kind))}</small></button>`).join('')}<button type="button" class="link-button rp-history-clear" data-rp-hist-clear>${esc(i18n('Vider la liste'))}</button></div></details>`;
        },
        /** dans la colonne de gauche, sous le choix de la sorte */
        mount(host) {
            if (!host) return;
            host.querySelector('[data-rp-history]')?.remove();
            host.insertAdjacentHTML('beforeend', history.html());
            const box = host.querySelector('[data-rp-history]'); if (!box) return;
            box.addEventListener('click', e => {
                const b = e.target.closest('[data-rp-hist]'); if (b) { history.restore(Number(b.dataset.rpHist)); return; }
                if (e.target.closest('[data-rp-hist-clear]')) { A().undoLocalChange(i18n('Dernières recherches vidées'), [HIST_KEY], () => { try { localStorage.removeItem(HIST_KEY); } catch (_) {} }, () => history.refresh()); history.refresh(); }
            });
        },
        refresh() { const host = document.querySelector('[data-rp-history-host]'); if (host) history.mount(host); },
    };

    /* ═════ ☑ Barre d'actions sur une liste de personnes + ⤓ Exporter / 🖨 Imprimer (en-tête) ═════ */
    const headActions = () => [`<button class="button secondary" type="button" data-rp-export>${esc(i18n('⤓ Exporter ▾'))}</button>`, `<button class="button secondary" type="button" data-rp-print>${esc(i18n('🖨 Imprimer'))}</button>`];
    function csvDownload(name, rows) {
        const cell = v => (A().csvCell ? A().csvCell(v) : `"${String(v ?? '').replace(/"/g, '""')}"`);
        const text = '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type: 'text/csv;charset=utf-8'})); a.download = name; document.body.append(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    const tableDoc = (title, head, rows) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:12px system-ui,sans-serif;margin:16px}h1{font-size:16px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eee}</style></head><body><h1>${esc(title)}</h1><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
    /** Les boutons « ⤓ Exporter ▾ » et « 🖨 Imprimer » de l'en-tête, pour un tableau (titre, en-têtes, lignes) */
    function bindExportPrint(page, getTable) {
        page?.querySelector('[data-rp-export]')?.addEventListener('click', () => {
            const t = getTable();
            UI().openExportDialog({title: t.title, defaultName: t.title, quality: false, formats: [
                {id: 'csv', label: i18n('📊 CSV'), hint: i18n('tableur'), ext: 'csv', run: o => csvDownload(o.filename || 'recherche.csv', [t.head, ...t.rows])},
                {id: 'print', run: () => UI().openPrintDialog({title: t.title, html: tableDoc(t.title, t.head, t.rows), photos: false})}]});
        });
        page?.querySelector('[data-rp-print]')?.addEventListener('click', () => { const t = getTable(); UI().openPrintDialog({title: t.title, html: tableDoc(t.title, t.head, t.rows), photos: false}); });
    }
    const PEOPLE_HEAD = () => [i18n('Personne'), i18n('Naissance'), i18n('Décès')];
    const personRow = p => [personName(p), yr(p.birth_date, p.birth_year), yr(p.death_date, p.death_year)];
    /**
     * researchBar.attach(root, people, {title, head, row}) : root contient des cases [data-rp-pick="id"] ;
     * la barre se pose en haut des résultats : Tout cocher · n cochées · 🏷 Étiqueter · 📋 Ajouter à Mes listes ;
     * sans case cochée, les actions portent sur tous les résultats. L'en-tête de la page reçoit Exporter / Imprimer.
     */
    function attachBar(root, people, o = {}) {
        if (!root || !people) return;
        const page = root.closest('.page') || root;
        const title = o.title || i18n('Résultats de la recherche');
        const byId = new Map(people.map(p => [Number(p.id), p]));
        const picked = () => [...root.querySelectorAll('[data-rp-pick]:checked')].map(c => Number(c.dataset.rpPick));
        const targets = () => { const p = picked(); return p.length ? p : people.map(x => Number(x.id)); };
        const bar = document.createElement('div'); bar.className = 'rp-bar'; bar.dataset.rpBar = '';
        bar.innerHTML = `<label class="rp-bar-all"><input type="checkbox" data-rp-all> ${esc(i18n('Tout cocher'))}</label><span class="rp-bar-count" data-rp-count></span>
            ${kiosk() ? '' : `<button type="button" class="button small secondary" data-rp-label>${esc(i18n('🏷 Étiqueter'))}</button><button type="button" class="button small secondary" data-rp-list>${esc(i18n('📋 Ajouter à Mes listes'))}</button>`}`;
        const first = root.querySelector('.data-table-wrap, .date-results, .rp-results, table') || root.firstElementChild;
        if (first) first.before(bar); else root.prepend(bar);
        const count = () => { const n = picked().length; bar.querySelector('[data-rp-count]').textContent = n ? i18n('{n} cochée(s) sur {t}', {n, t: people.length}) : i18n('Rien de coché : les actions portent sur les {t} résultats', {t: people.length}); const all = bar.querySelector('[data-rp-all]'); all.checked = n > 0 && n === people.length; all.indeterminate = n > 0 && n < people.length; };
        root.addEventListener('change', e => { if (e.target.matches('[data-rp-pick]')) count(); });
        bar.querySelector('[data-rp-all]').addEventListener('change', e => { root.querySelectorAll('[data-rp-pick]').forEach(c => { c.checked = e.target.checked; }); count(); });
        count();
        bar.querySelector('[data-rp-label]')?.addEventListener('click', async e => {
            const btn = e.currentTarget;
            let labels = []; try { labels = (await api('ro_label_rules')).labels || []; } catch (err) { toast(err.message, 'error'); return; }
            const go = async body => { try { const ids = targets(); const r = await post('ro_people_label', {...body, ids}); undoable(i18n('🏷 « {label} » posée sur {n} personne(s)', {label: r.label, n: r.added}), r.undo_id); } catch (err) { toast(err.message, 'error'); } };
            UI().menuAt(btn, [...labels.map(l => ({icon: '🏷', label: l.name, run: () => go({label_id: l.id})})), '-', {icon: '＋', label: i18n('Nouvelle étiquette…'), run: async () => { const name = await A().askText({title: i18n('Nouvelle étiquette'), placeholder: i18n('Ex : Poilu, À vérifier…'), okLabel: i18n('Étiqueter')}); if (name && name.trim()) go({label_name: name.trim()}); }}], {title: i18n('Étiqueter {n} personne(s)', {n: targets().length})});
        });
        bar.querySelector('[data-rp-list]')?.addEventListener('click', async e => {
            const btn = e.currentTarget;
            let lists = []; try { lists = ((await api('my_lists')).lists || []).filter(l => l.source === 'persons'); } catch (err) { toast(err.message, 'error'); return; }
            if (!lists.length) { toast(i18n('Aucune de « Mes listes » ne contient des personnes : crée-en une dans Réglages → Éditeur de listes.'), 'error'); return; }
            UI().menuAt(btn, lists.map(l => ({icon: l.icon || '📋', label: l.name, run: async () => { try { const r = await post('ro_people_to_list', {list_id: l.id, ids: targets()}); undoable(i18n('📋 {n} personne(s) ajoutée(s) à « {list} »', {n: r.added, list: r.list}), r.undo_id); } catch (err) { toast(err.message, 'error'); } }})), {title: i18n('Ajouter à une liste')});
        });
        const head = o.head || PEOPLE_HEAD(), row = o.row || personRow;
        bindExportPrint(page, () => { const ids = picked(); const list = ids.length ? ids.map(id => byId.get(id)).filter(Boolean) : people; return {title, head, rows: list.map(row)}; });
    }
    const pickCell = p => `<td class="rp-pick-cell"><input type="checkbox" data-rp-pick="${Number(p.id)}" aria-label="${esc(i18n('Cocher {name}', {name: personName(p)}))}"></td>`;
    /** Le tableau de personnes des sortes ajoutées (avec une case à cocher par ligne) */
    function peopleTable(people, extra = null) {
        if (!people.length) return A().emptyState({icon: '🔎', text: i18n('Personne ne correspond.'), hint: i18n('Essaie un autre lien ou moins de critères.')});
        return `<div class="data-table-wrap rp-results"><table class="data-table sortable-table"><thead><tr><th class="rp-pick-cell"></th><th><button data-sort-column="1">${esc(i18n('Personne'))}</button></th>${extra ? `<th><button data-sort-column="2">${esc(extra.label)}</button></th>` : ''}<th><button data-sort-column="${extra ? 3 : 2}">${esc(i18n('Naissance'))}</button></th><th><button data-sort-column="${extra ? 4 : 3}">${esc(i18n('Décès'))}</button></th></tr></thead><tbody>${people.map(p => `<tr>${pickCell(p)}<td data-sort-value="${esc(personName(p).toLowerCase())}"><button class="table-link" data-open-person="${Number(p.id)}">${esc(personName(p) || i18n('Personne sans nom'))}</button></td>${extra ? `<td>${esc(extra.value(p))}</td>` : ''}<td data-sort-value="${Number(p.birth_year) || 9999}">${esc(yr(p.birth_date, p.birth_year))}</td><td data-sort-value="${Number(p.death_year) || 9999}">${esc(yr(p.death_date, p.death_year) === '—' && p.living_status === 'living' ? i18n('Vivant(e)') : yr(p.death_date, p.death_year))}</td></tr>`).join('')}</tbody></table></div>`;
    }

    /* ═════ 🔁 Chercher et remplacer dans les données ═════ */
    const FIELDS = () => [['first_name', i18n('Prénoms')], ['occupation', i18n('Métiers')], ['place', i18n('Noms de lieux')], ['note', i18n('Notes')], ['description', i18n('Descriptions des événements')]];
    const REPLACE_PREFS = 'genealogie-research-replace'; // où chercher, majuscules, mot entier : retenus
    function markHtml(text, find, cs, word) {
        if (!find) return esc(text);
        let re; try { re = new RegExp((word ? '(?<![\\p{L}\\p{N}])' : '') + find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + (word ? '(?![\\p{L}\\p{N}])' : ''), 'gu' + (cs ? '' : 'i')); } catch (_) { return esc(text); }
        let out = '', last = 0; String(text).replace(re, (m, ...rest) => { const at = rest[rest.length - 2]; out += esc(text.slice(last, at)) + `<mark>${esc(m)}</mark>`; last = at + m.length; return m; });
        return out + esc(text.slice(last));
    }
    async function renderReplace(token = ++S().workspaceToken) {
        if (!live(token, 'replace')) return;
        const prefs = readJ(REPLACE_PREFS, {}) || {}, f = {field: prefs.field || 'occupation', case: !!prefs.case, word: !!prefs.word, ...(forms().replace || {})};
        const page = document.createElement('section'); page.className = 'page rp-replace';
        page.innerHTML = `${UI().pageHeader({where: i18n('Recherche'), icon: '🔁', title: i18n('Chercher et remplacer'), help: esc(i18n('Corrige une faute partout d’un coup (« cultivatr » → « cultivateur »). Tu vois d’abord chaque ligne qui changerait ; décoche celles à garder. « ↶ Annuler » remet tout comme avant.')), actions: headActions()})}
            <form class="maintenance-panel rp-replace-form" data-rp-replace-form><div class="form-grid" style="padding:0">
                <label>${esc(i18n('Où chercher'))}<select name="field">${FIELDS().map(([v, l]) => `<option value="${v}" ${f.field === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <label>${esc(i18n('Chercher'))}<input name="find" required maxlength="200" value="${esc(f.find || '')}" placeholder="${esc(i18n('Ex : cultivatr'))}" autocomplete="off"></label>
                <label>${esc(i18n('Remplacer par'))}<input name="replace" maxlength="200" value="${esc(f.replace || '')}" placeholder="${esc(i18n('Ex : cultivateur (vide = effacer)'))}" autocomplete="off"></label>
                <div class="checkbox-group"><label class="checkbox-line"><input type="checkbox" name="case" ${f.case ? 'checked' : ''}> ${esc(i18n('Respecter les majuscules'))}</label><label class="checkbox-line"><input type="checkbox" name="word" ${f.word ? 'checked' : ''}> ${esc(i18n('Mot entier seulement'))}</label></div>
            </div><div class="page-actions"><button class="button" type="submit">${esc(i18n('Voir l’aperçu'))}</button></div></form><div data-rp-replace-out></div>`;
        ws().replaceChildren(page);
        const form = page.querySelector('[data-rp-replace-form]'), out = page.querySelector('[data-rp-replace-out]');
        let last = null;
        const read = () => ({field: form.elements.field.value, find: form.elements.find.value, replace: form.elements.replace.value, case: form.elements.case.checked ? 1 : 0, word: form.elements.word.checked ? 1 : 0});
        const preview = async (record = true) => {
            const q = read(); if (!q.find.trim()) { out.innerHTML = ''; return; }
            setForm('replace', q); writeJ(REPLACE_PREFS, {field: q.field, case: !!q.case, word: !!q.word});
            out.innerHTML = UI().spinner(i18n('Recherche des lignes à changer…'));
            let d; try { d = await api('ro_replace_preview', q); } catch (err) { out.innerHTML = UI().notice ? UI().notice('error', esc(err.message)) : esc(err.message); return; }
            if (!live(token, 'replace')) return;
            last = {q, rows: d.rows};
            if (record) history.add('replace');
            if (!d.total) { out.innerHTML = A().emptyState({icon: '🔁', text: i18n('Rien à remplacer.'), hint: i18n('Aucune ligne ne contient « {find} ».', {find: q.find})}); return; }
            out.innerHTML = `<div class="rp-bar rp-replace-bar"><label class="rp-bar-all"><input type="checkbox" data-rp-rall checked> ${esc(i18n('Tout cocher'))}</label><span class="rp-bar-count" data-rp-rcount></span>${d.locked ? `<span class="muted">${esc(i18n('🔒 {n} ligne(s) d’une fiche verrouillée : elles ne changeront pas.', {n: d.locked}))}</span>` : ''}${d.total > d.shown ? `<span class="muted">${esc(i18n('Seules les {n} premières lignes sont montrées ; « Remplacer » change les lignes cochées.', {n: d.shown}))}</span>` : ''}${kiosk() ? '' : `<button type="button" class="button" data-rp-apply data-ro-edit>${esc(i18n('🔁 Remplacer'))}</button>`}</div>
                <div class="data-table-wrap"><table class="data-table rp-replace-table"><thead><tr><th class="rp-pick-cell"></th><th>${esc(i18n('Où'))}</th><th>${esc(i18n('Avant'))}</th><th>${esc(i18n('Après'))}</th></tr></thead><tbody>${d.rows.map(r => `<tr class="${r.locked ? 'is-locked' : ''}"><td class="rp-pick-cell"><input type="checkbox" data-rp-rkey="${esc(r.key)}" ${r.locked ? 'disabled title="' + esc(i18n('Fiche verrouillée')) + '"' : 'checked'} aria-label="${esc(i18n('Changer cette ligne'))}"></td><td>${r.person_id ? `<button class="table-link" data-open-person="${r.person_id}">${esc(r.who)}</button>` : esc(r.who)}</td><td class="rp-before">${markHtml(r.before, q.find, q.case, q.word)}</td><td class="rp-after">${esc(r.after)}</td></tr>`).join('')}</tbody></table></div>`;
            const keys = () => [...out.querySelectorAll('[data-rp-rkey]:checked')].map(c => c.dataset.rpRkey);
            const count = () => { const n = keys().length; out.querySelector('[data-rp-rcount]').textContent = i18n('{n} ligne(s) cochée(s) sur {t}', {n, t: d.total}); const b = out.querySelector('[data-rp-apply]'); if (b) { b.disabled = !n; b.textContent = i18n('🔁 Remplacer ({n})', {n}); } };
            out.addEventListener('change', e => { if (e.target.matches('[data-rp-rall]')) out.querySelectorAll('[data-rp-rkey]:not(:disabled)').forEach(c => { c.checked = e.target.checked; }); count(); });
            count(); A().bindTableLinks?.();
            out.querySelector('[data-rp-apply]')?.addEventListener('click', async () => {
                const k = keys(); if (!k.length) return;
                try {
                    const r = await post('ro_replace_apply', {...last.q, keys: k});
                    undoable(i18n('🔁 {n} remplacement(s) faits', {n: r.count}), r.undo_id, () => preview(false));
                    await preview(false);
                } catch (err) { toast(err.message, 'error'); }
            });
        };
        form.addEventListener('submit', e => { e.preventDefault(); preview(); });
        bindExportPrint(page, () => ({title: i18n('Chercher et remplacer'), head: [i18n('Où'), i18n('Avant'), i18n('Après')], rows: (last?.rows || []).map(r => [r.who, r.before, r.after])}));
        if (f.find) preview(false);
        else form.elements.find.focus();
    }

    /* ═════ 🧬 Recherche par lien de parenté ═════ */
    const REL = () => ({cousins: i18n('Cousins germains'), second_cousins: i18n('Cousins issus de germains'), siblings: i18n('Frères et sœurs'), uncles: i18n('Oncles et tantes'), nephews: i18n('Neveux et nièces'),
        parents: i18n('Parents'), grandparents: i18n('Grands-parents'), children: i18n('Enfants'), grandchildren: i18n('Petits-enfants'), ancestors: i18n('Tous les ancêtres'), descendants: i18n('Tous les descendants'), spouses: i18n('Conjoints')});
    async function renderKinship(token = ++S().workspaceToken) {
        if (!live(token, 'kinship')) return;
        const f = {relation: 'cousins', living: '', gender: '', born_after: '', born_before: '', ...(forms().kinship || {})};
        if (!f.person_id && S().currentPersonId) f.person_id = Number(S().currentPersonId);
        const page = document.createElement('section'); page.className = 'page rp-kinship';
        page.innerHTML = `${UI().pageHeader({where: i18n('Recherche'), icon: '🧬', title: i18n('Recherche par lien de parenté'), help: esc(i18n('« Tous les cousins germains de… », « les descendants vivants de… nés après 1900 » : choisis une personne et un lien.')), actions: headActions()})}
            <form class="maintenance-panel" data-rp-kin-form><div class="form-grid" style="padding:0">
                <div class="pk-host"><span>${esc(i18n('Personne'))}</span><div data-rp-kin-person>${window.LCNDA_PICKER?.pickerField({name: 'person_id', kind: 'person', allowCreate: false, value: f.person_id || null}) || ''}</div></div>
                <label>${esc(i18n('Lien'))}<select name="relation">${Object.entries(REL()).map(([v, l]) => `<option value="${v}" ${f.relation === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <label>${esc(i18n('Qui'))}<select name="living"><option value="">${esc(i18n('Vivants et décédés'))}</option><option value="living" ${f.living === 'living' ? 'selected' : ''}>${esc(i18n('Seulement les vivants'))}</option><option value="deceased" ${f.living === 'deceased' ? 'selected' : ''}>${esc(i18n('Seulement les décédés'))}</option></select></label>
                <label>${esc(i18n('Sexe'))}<select name="gender"><option value="">${esc(i18n('Indifférent'))}</option><option value="male" ${f.gender === 'male' ? 'selected' : ''}>${esc(i18n('Homme'))}</option><option value="female" ${f.gender === 'female' ? 'selected' : ''}>${esc(i18n('Femme'))}</option></select></label>
                <label>${esc(i18n('Nés en ou après'))}<input name="born_after" type="number" min="1" max="2200" value="${esc(f.born_after)}" placeholder="1900"></label>
                <label>${esc(i18n('Nés en ou avant'))}<input name="born_before" type="number" min="1" max="2200" value="${esc(f.born_before)}" placeholder="1950"></label>
            </div><div class="page-actions"><button class="button" type="submit">${esc(i18n('Chercher'))}</button></div></form><div data-rp-kin-out></div>`;
        ws().replaceChildren(page);
        const form = page.querySelector('[data-rp-kin-form]'), out = page.querySelector('[data-rp-kin-out]');
        let personTitle = f.person_name || '';
        page.querySelector('[data-rp-kin-person]').addEventListener('picker-change', e => { const it = e.detail.item; personTitle = it ? (it.title || it.name || '') : ''; });
        const run = async (record = true) => {
            const v = A().formObject(form); if (!Number(v.person_id)) { out.innerHTML = A().emptyState({icon: '🧬', text: i18n('Choisis une personne.'), hint: i18n('Puis le lien de parenté cherché.')}); return; }
            out.innerHTML = UI().spinner(i18n('Recherche dans l’arbre…'));
            let d; try { d = await api('ro_kinship', v); } catch (err) { out.innerHTML = esc(err.message); return; }
            if (!live(token, 'kinship')) return;
            setForm('kinship', {...v, person_id: Number(v.person_id), person_name: d.person.name || personTitle}); if (record) history.add('kinship');
            const genLabel = p => (['ancestors', 'descendants'].includes(d.relation) ? i18n('génération {n}', {n: p.generation}) : REL()[d.relation]);
            out.innerHTML = `<p class="muted rp-kin-sum">${esc(i18n('{rel} de {name} : {n} personne(s).', {rel: REL()[d.relation], name: d.person.name, n: d.people.length}))}</p>${peopleTable(d.people, {label: i18n('Lien'), value: genLabel})}`;
            A().bindTableLinks?.();
            attachBar(out, d.people, {title: `${REL()[d.relation]} — ${d.person.name}`, head: [...PEOPLE_HEAD(), i18n('Lien')], row: p => [...personRow(p), genLabel(p)]});
        };
        form.addEventListener('submit', e => { e.preventDefault(); run(); });
        bindExportPrint(page, () => ({title: i18n('Lien de parenté'), head: PEOPLE_HEAD(), rows: []}));
        if (f.person_id && forms().kinship) run(false);
    }

    /* ═════ 📊 Comparer deux recherches enregistrées ═════ */
    const OPS = () => [['minus', i18n('dans A mais pas dans B')], ['and', i18n('dans A et dans B')], ['or', i18n('dans A ou dans B')], ['xor', i18n('dans une seule des deux')]];
    async function renderCompare(token = ++S().workspaceToken) {
        if (!live(token, 'compare')) return;
        ws().innerHTML = wait('Chargement des recherches enregistrées…');
        let searches = []; try { searches = (await api('saved_searches')).searches || []; } catch (_) {}
        if (!live(token, 'compare')) return;
        const f = {op: 'minus', ...(forms().compare || {})};
        const page = document.createElement('section'); page.className = 'page rp-compare';
        const opts = sel => searches.map(s => `<option value="${Number(s.id)}" ${Number(sel) === Number(s.id) ? 'selected' : ''}>${esc(s.name)} (${Number(s.count || 0)})</option>`).join('');
        page.innerHTML = `${UI().pageHeader({where: i18n('Recherche'), icon: '📊', title: i18n('Comparer deux recherches'), help: esc(i18n('Ce qui est dans une recherche enregistrée et pas dans l’autre (ex. les Sosa nés en Corrèze sans acte de baptême) : pour trouver les trous.')), actions: headActions()})}
            ${searches.length < 2 ? A().emptyState({icon: '📊', text: i18n('Il faut au moins deux recherches enregistrées.'), hint: i18n('Fais-les dans « Recherche multicritère », puis « Enregistrer ».'), action: {label: i18n('Ouvrir la recherche multicritère'), attrs: 'data-rp-go-saved'}}) : `
            <form class="maintenance-panel" data-rp-cmp-form><div class="form-grid" style="padding:0">
                <label>${esc(i18n('Recherche A'))}<select name="a">${opts(f.a || searches[0].id)}</select></label>
                <label>${esc(i18n('Les personnes'))}<select name="op">${OPS().map(([v, l]) => `<option value="${v}" ${f.op === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <label>${esc(i18n('Recherche B'))}<select name="b">${opts(f.b || searches[1].id)}</select></label>
            </div><div class="page-actions"><button class="button" type="submit">${esc(i18n('Comparer'))}</button></div></form><div data-rp-cmp-out></div>`}`;
        ws().replaceChildren(page);
        page.querySelector('[data-rp-go-saved]')?.addEventListener('click', () => { S().researchKind = 'saved'; A().persistUiState(); A().renderSidebar(); window.LCNDA_PARTS.renderResearch(); });
        const form = page.querySelector('[data-rp-cmp-form]'), out = page.querySelector('[data-rp-cmp-out]');
        bindExportPrint(page, () => ({title: i18n('Comparer deux recherches'), head: PEOPLE_HEAD(), rows: []}));
        if (!form) return;
        const run = async (record = true) => {
            const v = A().formObject(form);
            out.innerHTML = UI().spinner(i18n('Comparaison…'));
            let d; try { d = await api('ro_compare', v); } catch (err) { out.innerHTML = esc(err.message); return; }
            if (!live(token, 'compare')) return;
            setForm('compare', {...v, a_name: d.a.name, b_name: d.b.name}); if (record) history.add('compare');
            const opLabel = Object.fromEntries(OPS())[d.op];
            out.innerHTML = `<p class="muted">${esc(i18n('A : « {a} » ({na}) · B : « {b} » ({nb}) → {n} personne(s) {op}.', {a: d.a.name, na: d.a.count, b: d.b.name, nb: d.b.count, n: d.count, op: opLabel}))}</p>${peopleTable(d.people)}`;
            A().bindTableLinks?.();
            attachBar(out, d.people, {title: `${d.a.name} / ${d.b.name} — ${opLabel}`});
        };
        form.addEventListener('submit', e => { e.preventDefault(); run(); });
        if (forms().compare) run(false);
    }

    /* ═════ 🧾 Recherche dans les sources et les citations ═════ */
    async function renderSources(token = ++S().workspaceToken) {
        if (!live(token, 'sources')) return;
        const f = forms().sources || {};
        const page = document.createElement('section'); page.className = 'page rp-sources';
        page.innerHTML = `${UI().pageHeader({where: i18n('Recherche'), icon: '🧾', title: i18n('Sources et citations'), help: esc(i18n('Chercher un mot dans le titre, l’auteur et le texte des sources, et dans la page et la note de chaque citation.')), actions: headActions()})}
            <form class="maintenance-panel" data-rp-src-form><div class="form-grid" style="padding:0"><label class="span-2">${esc(i18n('Texte à chercher'))}<input name="q" value="${esc(f.q || '')}" required minlength="2" placeholder="${esc(i18n('Ex : registre paroissial, folio 12, Tulle…'))}" autocomplete="off"></label></div><div class="page-actions"><button class="button" type="submit">${esc(i18n('Chercher'))}</button></div></form><div data-rp-src-out></div>`;
        ws().replaceChildren(page);
        const form = page.querySelector('[data-rp-src-form]'), out = page.querySelector('[data-rp-src-out]');
        let last = null;
        const run = async (record = true) => {
            const q = form.elements.q.value.trim(); if (q.length < 2) return;
            out.innerHTML = UI().spinner(i18n('Recherche dans les sources…'));
            let d; try { d = await api('ro_sources', {q}); } catch (err) { out.innerHTML = esc(err.message); return; }
            if (!live(token, 'sources')) return;
            last = d; setForm('sources', {q}); if (record) history.add('sources');
            const srcHtml = d.sources.length ? `<div class="data-table-wrap"><table class="data-table rp-src-table"><thead><tr><th>${esc(i18n('Source'))}</th><th>${esc(i18n('Trouvé dans'))}</th><th>${esc(i18n('Extrait'))}</th><th>${esc(i18n('Citée'))}</th></tr></thead><tbody>${d.sources.map(s => `<tr><td><b>${esc(s.title || i18n('Source sans titre'))}</b>${s.author ? `<small class="cell-muted">${esc(s.author)}</small>` : ''}${s.url ? ` <a href="${esc(A().safeUrl ? A().safeUrl(s.url) : s.url)}" target="_blank" rel="noopener">↗</a>` : ''}</td><td>${esc(i18n(s.field))}</td><td class="rp-snippet">${markHtml(s.snippet, q, false, false)}</td><td>${esc(i18n('{n} fois', {n: s.uses}))}</td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">${esc(i18n('Aucune source ne contient ce texte.'))}</p>`;
            const citHtml = d.citations.length ? `<div class="data-table-wrap"><table class="data-table rp-cit-table"><thead><tr><th>${esc(i18n('Source'))}</th><th>${esc(i18n('Pour'))}</th><th>${esc(i18n('Page'))}</th><th>${esc(i18n('Extrait'))}</th></tr></thead><tbody>${d.citations.map(c => `<tr><td>${esc(c.title)}</td><td>${c.person_id ? `<button class="table-link" data-open-person="${c.person_id}">${esc(c.person_name || i18n('Personne sans nom'))}</button>` : esc(c.entity_type)}</td><td>${esc(c.page)}</td><td class="rp-snippet">${markHtml(c.snippet, q, false, false)}</td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">${esc(i18n('Aucune citation ne contient ce texte.'))}</p>`;
            out.innerHTML = `<h3>${esc(i18n('📚 Sources ({n})', {n: d.sources.length}))}</h3>${srcHtml}<h3>${esc(i18n('🔖 Citations ({n})', {n: d.citations.length}))}</h3>${citHtml}`;
            A().bindTableLinks?.();
        };
        form.addEventListener('submit', e => { e.preventDefault(); run(); });
        bindExportPrint(page, () => ({title: i18n('Sources et citations'), head: [i18n('Sorte'), i18n('Source'), i18n('Pour'), i18n('Extrait')],
            rows: [...(last?.sources || []).map(s => [i18n('Source'), s.title, '', s.snippet]), ...(last?.citations || []).map(c => [i18n('Citation'), c.title, c.person_name || c.entity_type, c.snippet])]}));
        if (f.q) run(false); else form.elements.q.focus();
    }

    const EXT = window.LCNDA_EXT = window.LCNDA_EXT || {};
    /** les sortes ajoutées : [clé, nom] (rangées par app-recherche.js) et leur page */
    EXT.researchPlusKinds = [['replace', '🔁 Chercher et remplacer'], ['kinship', '🧬 Lien de parenté'], ['compare', '📊 Comparer deux recherches'], ['sources', '🧾 Sources et citations']];
    EXT.researchPlus = {replace: renderReplace, kinship: renderKinship, compare: renderCompare, sources: renderSources};
    EXT.researchBar = {attach: attachBar, headActions, bindExportPrint, csvDownload, tableDoc, pickCell};
    EXT.researchHistory = history;
    EXT.roUndoable = undoable;
    if (S()?.module === 'recherche' && S()?.bootstrap) { try { A().renderSidebar(); } catch (_) {} }
})();
