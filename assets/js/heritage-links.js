/**
 * Relier et raconter (serveur : lib/heritage_links.php, structure n°11) :
 *  🔎 poser une question en français · 🗣️ langues de la famille (personnes, actes, documents, carte)
 *  🔗 liens « @Jean Dupont » dans les notes et transcriptions + rubrique « Cité dans »
 *  📚 citations de sources détaillées (référence rédigée toute seule) · 🤝 demandes d'entraide
 *  🎬 le film de la famille (carte animée enregistrée en vidéo)
 * Chargé après app.js, heritage.js et heritage-tools.js (window.LCNDA_APP, window.LCNDA_EXT).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const key of ['personBlocks', 'dashboard', 'lists', 'graphStats']) ext[key] = ext[key] || {};
    for (const key of ['mapSetup', 'afterPerson']) ext[key] = ext[key] || [];
    const esc = value => A().escapeHtml(value ?? '');
    const nl = value => esc(value).replace(/\n/g, '<br>');
    const api = (...args) => A().api(...args);
    const LP = (type, labels) => window.LCNDA_EXT?.labelsPicker?.(type, labels) || ''; // étiquettes (heritage-more.js)
    const LC = labels => window.LCNDA_EXT?.labelChips?.(labels) || '';
    const toast = (...args) => A().toast(...args);
    const empty = text => A().empty(text);
    const card = (...args) => A().card(...args);
    const S = () => A().state;
    const fmt = (n, d = 0) => Number(n || 0).toLocaleString('fr-FR', {maximumFractionDigits: d});
    const plural = (n, one, many) => `${fmt(n)} ${n > 1 ? many : one}`;
    const isCurrent = token => token === S().workspaceToken && ['listes', 'maintenance'].includes(S().module);
    const personLink = (id, name, extra = '') => id ? `<button type="button" class="table-link" data-h-person="${Number(id)}">${esc(name || 'Personne')}</button>${extra ? ` <small>${esc(extra)}</small>` : ''}` : esc(name || '');
    const header = (eyebrow, title, intro, actions = '') => `<header class="page-header"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2>${intro ? `<p>${intro}</p>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</header>`;
    const tools = (...args) => ext.tools ? ext.tools(...args) : '';
    const refresh = () => ext.refreshView ? ext.refreshView() : A().renderList();

    /* ═══════════════════════ 🔎 POSER UNE QUESTION ═══════════════════════ */

    const examples = ['Quels ancêtres étaient boulangers à Lille avant 1850 ?', 'Qui est né le même jour que moi ?', 'Les petits-enfants de Jean Dupont', 'Les Dupont mariés dans le Nord au XVIIIe siècle', 'Quelles femmes sont nées en Bretagne après 1800 ?'];
    function questionPanelHtml(q = '') {
        return `<section class="maintenance-panel h-question"><h3>Poser une question</h3><form id="h-question-form" class="h-question-form"><input name="q" value="${esc(q)}" placeholder="Quels ancêtres étaient boulangers à Lille avant 1850 ?" autocomplete="off"><button class="button" type="submit">Chercher</button></form>
            <p class="muted">Sans Internet : l’app comprend les formules courantes (métier, lieu, avant / après / entre / siècle, prénom, nom, naissance, mariage, décès, « ancêtres », « le même jour que moi », et la parenté d’une fiche : « Jean Dupont a-t-il eu des enfants ? », « les petites-filles de Marie Durand », parents, frères et sœurs, conjoints, descendants). Exemples : ${examples.map(e => `<button type="button" class="link-button" data-h-question-example="${esc(e)}">${esc(e)}</button>`).join(' · ')}</p><div id="h-question-out"></div></section>`;
    }
    const resultsTable = people => `<table class="data-table"><thead><tr><th>Personne</th><th>Naissance</th><th>Décès</th><th>Métier</th></tr></thead><tbody>${people.map(p => `<tr><td>${personLink(p.id, A().personName(p))}</td><td>${esc(p.birth_date || p.birth_year || '')}</td><td>${esc(p.death_date || p.death_year || '')}</td><td>${esc(p.occupation || '')}</td></tr>`).join('')}</tbody></table>`;
    // « Enregistrer comme recherche » : nom demandé dans l'app (window.prompt ne marche pas dans l'application de bureau)
    async function saveQuestion(q, criteria, after) {
        const name = (await A().askText({title: 'Enregistrer la recherche', message: 'Nom de cette recherche (elle se relance en un clic et signale les nouvelles fiches) :', value: q.trim().replace(/\s*\?$/, ''), okLabel: 'Enregistrer'}))?.trim();
        if (!name) return;
        try {
            const r = await api('save_saved_search', {}, {method: 'POST', body: {name, criteria}});
            toast(`Recherche « ${name} » enregistrée (${plural(r.result.count, 'fiche', 'fiches')}).`);
            after?.();
        } catch (error) { toast(error.message, 'error'); }
    }
    async function runQuestion(q, after) {
        const out = document.getElementById('h-question-out');
        if (!out || !q.trim()) return;
        out.innerHTML = '<p class="muted">Recherche…</p>';
        try {
            const r = await api('ask_question', {q});
            S().hQuestion = q;
            out.innerHTML = `<p class="h-understood">J’ai compris : ${r.understood.map(u => `<span class="collection-kind">${esc(u)}</span>`).join(' ')}</p>
                ${r.answer ? `<p class="h-question-answer">${esc(r.answer)}</p>` : ''}
                <h4>${plural(r.count, 'fiche trouvée', 'fiches trouvées')}</h4>${r.people.length ? resultsTable(r.people) : empty('Aucune fiche ne répond à cette question.')}
                ${r.criteria && !r.criteria.same_birthday ? '<p><button type="button" class="button small secondary" data-h-question-save>Enregistrer comme recherche</button></p>' : ''}`;
            out.querySelector('[data-h-question-save]')?.addEventListener('click', () => saveQuestion(q, r.criteria, after));
        } catch (error) { out.innerHTML = `<p class="h-offsite-sentence is-warn">${esc(error.message)}</p>`; }
    }
    // Les recherches enregistrées, en bas de l'écran « Poser une question », dans une section qui se déplie
    async function renderSavedQuestions() {
        const box = document.getElementById('h-question-saved');
        if (!box) return;
        const data = await api('saved_searches').catch(() => ({searches: []}));
        const list = data.searches || [];
        if (!document.body.contains(box)) return;
        box.innerHTML = `<details class="maintenance-panel h-question-saved" ${S().hQuestionSavedOpen !== false ? 'open' : ''}><summary><strong>Recherches enregistrées</strong> <span class="muted">(${list.length})</span></summary>
            ${list.length ? `<div class="h-question-saved-list">${list.map(s => `<article class="h-saved ${s.new_count ? 'has-new' : ''}"><button type="button" class="link-button" data-hq-run="${s.id}"><strong>${esc(s.name)}</strong></button>${s.new_count ? ` <span class="h-new-badge">${s.new_count} nouvelle${s.new_count > 1 ? 's' : ''}</span>` : ''}<small>${esc(s.description)}</small><small>${plural(s.count, 'fiche', 'fiches')}${s.error ? ' · ' + esc(s.error) : ''}</small>
                <span class="h-saved-tools">${s.new_count ? `<button type="button" class="link-button" data-hq-seen="${s.id}">marquer comme vues</button>` : ''}<button type="button" class="link-button" data-hq-delete="${s.id}">supprimer</button></span></article>`).join('')}</div>` : '<p class="muted">Aucune recherche enregistrée. Pose une question, puis « Enregistrer comme recherche ».</p>'}</details>`;
        box.querySelector('details').addEventListener('toggle', event => { S().hQuestionSavedOpen = event.target.open; });
        box.querySelectorAll('[data-hq-run]').forEach(b => b.addEventListener('click', async () => {
            const s = list.find(x => Number(x.id) === Number(b.dataset.hqRun)), out = document.getElementById('h-question-out');
            if (!s || !out) return;
            out.innerHTML = '<p class="muted">Recherche…</p>';
            try {
                const r = await api('saved_search_results', {criteria: JSON.stringify(s.criteria), id: s.id});
                out.innerHTML = `<h4>${esc(s.name)} — ${plural(r.count, 'fiche trouvée', 'fiches trouvées')}</h4><p class="muted">${esc(r.description)}</p>${r.people.length ? resultsTable(r.people) : empty('Aucune fiche ne répond à cette recherche.')}`;
                out.scrollIntoView({behavior: 'smooth', block: 'start'});
            } catch (error) { out.innerHTML = `<p class="h-offsite-sentence is-warn">${esc(error.message)}</p>`; }
        }));
        box.querySelectorAll('[data-hq-seen]').forEach(b => b.addEventListener('click', async () => { await api('mark_saved_search_seen', {}, {method: 'POST', body: {id: b.dataset.hqSeen}}); renderSavedQuestions(); }));
        box.querySelectorAll('[data-hq-delete]').forEach(b => b.addEventListener('click', async () => { if (!confirm('Supprimer cette recherche enregistrée ?')) return; await api('delete_saved_search', {}, {method: 'POST', body: {id: b.dataset.hqDelete}}); toast('Recherche supprimée.'); renderSavedQuestions(); }));
    }
    // Recherche → « Poser une question en français » : un écran à part
    ext.question = async token => {
        if (token !== S().workspaceToken || S().module !== 'recherche') return;
        A().$('#workspace').innerHTML = `<section class="page">${header('RECHERCHE', 'Poser une question', 'Écris ta question comme tu la dirais : l’app cherche dans toute la base, sans Internet.')}${questionPanelHtml(S().hQuestion || '')}<div id="h-question-saved"></div></section>`;
        const form = A().$('#h-question-form');
        form.addEventListener('submit', event => { event.preventDefault(); runQuestion(form.q.value, renderSavedQuestions); });
        A().$$('[data-h-question-example]').forEach(b => b.addEventListener('click', () => { form.q.value = b.dataset.hQuestionExample; runQuestion(form.q.value, renderSavedQuestions); }));
        form.q.focus();
        if (S().hQuestion) runQuestion(S().hQuestion, renderSavedQuestions);
        renderSavedQuestions();
    };
    // Ajouté en haut de « Recherche → Recherche multicritère / recherches enregistrées »
    const baseResearch = ext.research;
    ext.research = async token => {
        if (baseResearch) await baseResearch(token);
        if (token !== S().workspaceToken || S().module !== 'recherche') return;
        const page = A().$('#workspace .page');
        if (!page || page.querySelector('.h-question')) return;
        page.querySelector('.page-header')?.insertAdjacentHTML('afterend', questionPanelHtml(S().hQuestion || ''));
        const form = page.querySelector('#h-question-form');
        const after = () => ext.research(++S().workspaceToken);
        form.addEventListener('submit', event => { event.preventDefault(); runQuestion(form.q.value, after); });
        page.querySelectorAll('[data-h-question-example]').forEach(b => b.addEventListener('click', () => { form.q.value = b.dataset.hQuestionExample; runQuestion(form.q.value, after); }));
        if (S().hQuestion) runQuestion(S().hQuestion, after);
    };

    /* ═══════════════════════ 🗣️ LANGUES ═══════════════════════ */

    const certaintyLabel = {certain: '', probable: ' (probable)', doute: ' (?)'};
    const langChip = (l, extra = '') => `<span class="h-lang-chip is-${esc(l.certainty || 'certain')}" title="${esc(l.certainty === 'doute' ? 'Langue à vérifier' : l.certainty === 'probable' ? 'Probable' : 'Certain')}">${esc(l.language)}${esc(certaintyLabel[l.certainty] || '')}${extra}</span>`;
    let langCatalog = ['français', 'latin', 'flamand', 'néerlandais', 'picard', 'wallon', 'breton', 'gallo', 'normand', 'occitan', 'gascon', 'provençal', 'limousin', 'auvergnat', 'franco-provençal', 'savoyard', 'basque', 'catalan', 'corse', 'alsacien', 'francique lorrain', 'allemand', 'luxembourgeois', 'italien', 'piémontais', 'espagnol', 'portugais', 'anglais', 'yiddish', 'hébreu', 'polonais', 'russe', 'arménien', 'grec', 'arabe', 'kabyle', 'turc', 'créole'];
    const langDatalist = () => `<datalist id="h-lang-list">${langCatalog.map(l => `<option value="${esc(l)}">`).join('')}</datalist>`;
    const certaintySelect = (value = 'certain', name = 'certainty') => `<select name="${name}"><option value="certain" ${value === 'certain' ? 'selected' : ''}>certain</option><option value="probable" ${value === 'probable' ? 'selected' : ''}>probable</option><option value="doute" ${value === 'doute' ? 'selected' : ''}>doute (peut-être une autre)</option></select>`;
    ext.personBlocks.languages = (index, detail, {editOnly}) => {
        const p = detail.person, L = detail.heritage?.languages;
        if (!L) return '';
        const shown = (ext.flagShown ? ext.flagShown(p, 'show_language_block') : Number(p.show_language_block)) || L.own.length || L.inherited.length;
        if (!shown || ext.flagSettings?.().hidden.includes('show_language_block')) return '';
        const events = Object.entries(detail.heritage?.event_languages || {}).map(([id, langs]) => { const ev = (detail.events || []).find(e => Number(e.id) === Number(id)); return ev ? `<li>${esc(ev.type_label)} ${esc(ev.date_text || '')} : ${langs.map(l => langChip(l)).join(' ')}</li>` : ''; }).join('');
        const body = `${L.own.length ? `<div class="h-lang-list">${L.own.map(l => `<div class="h-lang-row">${langChip(l)}${Number(l.to_descendants) ? ' <small class="muted">→ transmise à la descendance</small>' : ''}${l.note ? ` <small>${esc(l.note)}</small>` : ''}${editOnly(tools(`data-h-lang-edit="${l.id}"`, `data-h-lang-delete="${l.id}"`, 'cette langue'))}</div>`).join('')}</div>` : ''}
            ${L.inherited.length ? `<p class="h-lang-inherited">Par sa famille : ${L.inherited.map(l => `${langChip(l)} <small class="muted">de ${personLink(l.person_id, l.from_name)}${l.generations > 1 ? `, ${l.generations} générations au-dessus` : ''}</small>`).join(' · ')}</p>` : ''}
            ${!L.own.length && !L.inherited.length ? '<p class="muted">Aucune langue notée.</p>' : ''}
            ${events ? `<h5>Langue des actes</h5><ul class="h-lang-events">${events}</ul>` : ''}
            ${editOnly(`<label class="checkbox-line h-lang-noinherit"><input type="checkbox" data-h-lang-noinherit="${p.id}" ${Number(L.no_inherited) ? 'checked' : ''}> Ne pas reprendre les langues de ses ancêtres</label>`)}`;
        return card(index, 'Langues', L.own.length + L.inherited.length || '', body, 'span-6', editOnly(`<button type="button" class="button small secondary" data-h-lang-add="${p.id}">+ Langue</button>`));
    };
    function personLanguageDialog(personId, l = {}) {
        ext.openDialog({
            eyebrow: 'LANGUE', title: l.id ? 'Modifier la langue' : 'Langue parlée',
            body: `<div class="form-grid"><label>Langue<input name="language" list="h-lang-list" value="${esc(l.language || '')}" required placeholder="breton, flamand, occitan…">${langDatalist()}</label><label>Certitude${certaintySelect(l.certainty)}</label>
                <label class="span-2 checkbox-line"><input type="checkbox" name="to_descendants" ${l.id && !Number(l.to_descendants) ? '' : 'checked'}> Aussi pour toute sa descendance (sauf ceux qui ont leurs propres langues ou qui refusent l’héritage)</label>
                <label class="span-2">Note<input name="note" value="${esc(l.note || '')}" placeholder="Parlait breton à la maison, français à l’école…"></label></div>
                <p class="muted">Un doute entre deux langues ? Ajoute les deux, chacune avec « doute ».</p>`,
            onSubmit: async form => { const v = A().formObject(form); await api('save_person_language', {}, {method: 'POST', body: {...v, id: l.id || 0, person_id: personId, to_descendants: form.to_descendants.checked ? 1 : 0}}); toast('Langue enregistrée.'); await refresh(); },
        });
    }
    document.addEventListener('click', async event => {
        const add = event.target.closest?.('[data-h-lang-add]');
        if (add) personLanguageDialog(Number(add.dataset.hLangAdd));
        const ed = event.target.closest?.('[data-h-lang-edit]');
        if (ed) { const L = S().currentPerson?.heritage?.languages; const l = L?.own.find(x => Number(x.id) === Number(ed.dataset.hLangEdit)); if (l) personLanguageDialog(Number(l.person_id), l); }
        const del = event.target.closest?.('[data-h-lang-delete]');
        if (del && confirm('Supprimer cette langue ?')) { await api('delete_person_language', {}, {method: 'POST', body: {id: del.dataset.hLangDelete}}); toast('Langue supprimée.'); await refresh(); }
    });
    document.addEventListener('change', async event => {
        const c = event.target.closest?.('[data-h-lang-noinherit]');
        if (c) { await api('set_no_inherited_language', {}, {method: 'POST', body: {person_id: c.dataset.hLangNoinherit, value: c.checked ? 1 : 0}}); await refresh(); }
    });

    /** Petit éditeur de langues (actes et documents) : ajout et retrait enregistrés tout de suite. */
    function recordLanguagesEditor(container, type, id, langs = []) {
        const draw = () => {
            container.innerHTML = `<div class="h-lang-editor"><span class="section-label">Langue(s) ${type === 'event' ? 'de l’acte' : 'du document'}</span> ${langs.map((l, i) => `${langChip(l, ` <button type="button" class="h-lang-x" data-i="${i}" aria-label="Retirer">×</button>`)}`).join(' ') || '<small class="muted">non précisée</small>'}
                <span class="h-lang-add"><input list="h-lang-list" placeholder="latin, flamand…" class="h-lang-input">${certaintySelect('certain', 'h_cert')}<button type="button" class="button small secondary" data-add>Ajouter</button></span>${langDatalist()}</div>`;
            container.querySelectorAll('.h-lang-x').forEach(b => b.addEventListener('click', () => { langs.splice(Number(b.dataset.i), 1); save(); }));
            container.querySelector('[data-add]').addEventListener('click', () => { const v = container.querySelector('.h-lang-input').value.trim(); if (!v) return; langs.push({language: v.toLowerCase(), certainty: container.querySelector('[name=h_cert]').value}); save(); });
        };
        const save = async () => { try { const r = await api('save_record_languages', {}, {method: 'POST', body: {entity_type: type, entity_id: id, languages: langs}}); langs = r.result.languages; draw(); } catch (error) { toast(error.message, 'error'); } };
        draw();
    }
    // Fenêtre d'un événement : langue(s) de l'acte
    function watchDialog(id, onOpen) {
        const tryAttach = () => {
            const dialog = document.getElementById(id);
            if (!dialog) { setTimeout(tryAttach, 500); return; }
            new MutationObserver(() => { if (dialog.open) onOpen(dialog); }).observe(dialog, {attributes: true, attributeFilter: ['open']});
        };
        tryAttach();
    }
    watchDialog('event-dialog', async dialog => {
        const form = dialog.querySelector('form');
        let box = dialog.querySelector('.h-event-langs');
        if (!box) { box = document.createElement('div'); box.className = 'h-event-langs'; (form.querySelector('.modal-actions') || form.lastElementChild).insertAdjacentElement('beforebegin', box); }
        const id = Number(form.elements.id?.value) || 0;
        if (!id) { box.innerHTML = '<p class="muted h-lang-editor">Langue de l’acte : enregistre d’abord l’événement, puis rouvre-le.</p>'; return; }
        const r = await api('record_languages', {type: 'event', id}).catch(() => ({languages: []}));
        if (r.catalog) langCatalog = r.catalog;
        recordLanguagesEditor(box, 'event', id, r.languages || []);
    });
    // Page de transcription (Listes → Noms cités) : langue(s) du document
    const baseCited = ext.lists.cited_names;
    if (baseCited) ext.lists.cited_names = async (token, view) => {
        await baseCited(token, view);
        if (token !== undefined && !isCurrent(token)) return;
        const page = document.querySelector('.h-cite-page');
        const mediaId = Number(S().hCiteMedia) || 0;
        if (!page || !mediaId || page.querySelector('.h-media-langs')) return;
        const box = document.createElement('div'); box.className = 'maintenance-panel h-media-langs';
        page.querySelector('.h-cite-layout aside')?.prepend(box);
        const r = await api('record_languages', {type: 'media', id: mediaId}).catch(() => ({languages: []}));
        if (!box.isConnected) return; // on a quitté la page entre-temps
        recordLanguagesEditor(box, 'media', mediaId, r.languages || []);
    };

    const langColors = ['#0066cc', '#cc4700', '#00a37a', '#7a47db', '#cc0014', '#a07a00', '#008fb3', '#c2185b', '#5d7a00', '#6b4f2a'];
    ext.lists.languages = async token => {
        const data = await api('languages_overview');
        if (!isCurrent(token)) return;
        langCatalog = data.catalog || langCatalog;
        const langs = data.languages || [];
        const points = [];
        langs.forEach((l, i) => l.people.forEach(p => { if (p.place) points.push({lat: p.place.lat, lon: p.place.lon, label: `${l.language} — ${A().personName(p.person)} (${p.place.place})`, color: langColors[i % langColors.length]}); }));
        const map = ext.miniMap ? ext.miniMap(points, [], {height: 420, emptyText: 'Aucun lieu de naissance connu pour les personnes dont la langue est notée.'}) : '';
        A().$('#workspace').innerHTML = `<section class="page collection-page">${header('LISTES', 'Langues de la famille', 'La langue parlée par chacun ou par une branche (flamand, picard, breton, occitan, alsacien, yiddish, italien…). Elle éclaire les noms mal orthographiés par un curé qui ne comprenait pas la langue de la famille, et indique dans quelle langue chercher : dans le Nord, une partie des registres et des actes notariés est en flamand. Une langue notée sur une personne vaut aussi pour sa descendance, sauf refus explicite sur une fiche.')}
            ${langs.length ? `<div class="h-lang-legend">${langs.map((l, i) => `<span><i style="background:${langColors[i % langColors.length]}"></i>${esc(l.language)} <small>(${l.people.length})</small></span>`).join('')}</div>${map}
            ${langs.map((l, i) => `<details class="maintenance-panel"><summary><strong style="color:${langColors[i % langColors.length]}">${esc(l.language)}</strong> — ${plural(l.people.length, 'personne', 'personnes')} (${l.declared} déclarée${l.declared > 1 ? 's' : ''})</summary><table class="data-table"><tbody>${l.people.slice(0, 300).map(p => `<tr><td>${personLink(p.person.id, A().personName(p.person), A().years(p.person))}</td><td><small>${esc(p.how)}${p.certainty !== 'certain' ? ` · ${esc(p.certainty)}` : ''}</small></td><td><small>${esc(p.place?.place || '')}</small></td></tr>`).join('')}</tbody></table></details>`).join('')}`
            : empty('Aucune langue notée. Sur une fiche, coche « Langues » dans IDENTITÉ → Modifier la personne, puis « + Langue ».')}
            <h3>Langue des actes et des documents</h3>${(data.records || []).length ? `<table class="data-table"><thead><tr><th>Langue</th><th>Acte ou document</th><th>Certitude</th></tr></thead><tbody>${data.records.map(r => `<tr><td>${esc(r.language)}</td><td>${r.entity_type === 'event' ? '📜 ' : '📄 '}${r.person_id ? personLink(r.person_id, r.label) : esc(r.label || '')}</td><td>${esc(data.certainties?.[r.certainty] || r.certainty)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aucune. La langue d’un acte se note dans la fenêtre de l’événement ; celle d’un document dans sa transcription (Listes → Noms cités).</p>'}</section>`;
        A().bindTableLinks();
    };

    /* ═══════════════════════ 🔗 LIENS « @Jean Dupont » ═══════════════════════ */

    // Dans tous les champs de texte : « @Jea » propose les fiches ; le choix devient « @[Jean Dupont|12] »
    let mentionBox = null, mentionTimer = 0;
    function closeMentions() { if (mentionBox) mentionBox.hidden = true; }
    document.addEventListener('input', event => {
        const ta = event.target;
        if (!(ta instanceof HTMLTextAreaElement) || ta.closest('#find-bar')) return;
        const before = ta.value.slice(0, ta.selectionStart);
        const m = before.match(/(?:^|[\s(«"'])@([^\s@\[\]|][^@\n\[\]|]{1,40})$/u);
        clearTimeout(mentionTimer);
        if (!m) { closeMentions(); return; }
        const q = m[1];
        mentionTimer = setTimeout(async () => {
            let data = {data: []};
            try { data = await api('search', {type: 'persons', q: q.trim(), limit: 8}); } catch (_) {}
            const rows = data.data || [];
            if (!rows.length) { closeMentions(); return; }
            if (!mentionBox) { mentionBox = document.createElement('div'); mentionBox.className = 'h-mention-list'; document.body.appendChild(mentionBox); }
            const dialog = ta.closest('dialog');
            if (dialog && mentionBox.parentElement !== dialog) dialog.appendChild(mentionBox); else if (!dialog && mentionBox.parentElement !== document.body) document.body.appendChild(mentionBox);
            const r = ta.getBoundingClientRect();
            mentionBox.style.left = `${r.left + 8}px`; mentionBox.style.top = `${Math.min(r.bottom, window.innerHeight - 220)}px`;
            mentionBox.innerHTML = `<small class="muted">Lier à une fiche :</small>${rows.map(p => `<button type="button" data-id="${p.id}" data-name="${esc(A().personName(p))}">${esc(A().personName(p))} <small>${esc(A().years(p))}</small></button>`).join('')}`;
            mentionBox.hidden = false;
            mentionBox.onmousedown = e => {
                const b = e.target.closest('button[data-id]');
                if (!b) return;
                e.preventDefault();
                const start = ta.selectionStart - q.length - 1;
                const token = `@[${b.dataset.name.replace(/[\[\]|]/g, ' ').replace(/\s+/g, ' ').trim()}|${b.dataset.id}] `; // un « ] » ou « | » dans le nom casserait le lien
                ta.value = ta.value.slice(0, start) + token + ta.value.slice(ta.selectionStart);
                ta.selectionStart = ta.selectionEnd = start + token.length;
                ta.dispatchEvent(new Event('input', {bubbles: true}));
                closeMentions(); ta.focus();
            };
        }, 200);
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMentions(); });
    document.addEventListener('focusout', event => { if (event.target instanceof HTMLTextAreaElement) setTimeout(closeMentions, 200); });
    // À l'affichage, « @[Jean Dupont|12] » devient un lien vers la fiche (partout : notes, transcriptions, enquêtes…)
    const MENTION_RE = /@\[([^\]|]{1,80})\|(\d+)\]/g;
    function linkMentions(root) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {acceptNode: n => n.nodeValue.includes('@[') && !n.parentElement?.closest('textarea,input,script,style,.h-mention') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT});
        const nodes = [];
        let n;
        while ((n = walker.nextNode())) nodes.push(n);
        nodes.forEach(node => {
            const text = node.nodeValue;
            MENTION_RE.lastIndex = 0;
            if (!MENTION_RE.test(text)) return;
            MENTION_RE.lastIndex = 0;
            const frag = document.createDocumentFragment();
            let last = 0, m;
            while ((m = MENTION_RE.exec(text))) {
                frag.append(text.slice(last, m.index));
                const b = document.createElement('button');
                b.type = 'button'; b.className = 'table-link h-mention'; b.dataset.hPerson = m[2]; b.textContent = '@' + m[1]; b.title = 'Ouvrir la fiche de ' + m[1];
                frag.append(b);
                last = m.index + m[0].length;
            }
            frag.append(text.slice(last));
            node.replaceWith(frag);
        });
    }
    let mentionScan = 0;
    new MutationObserver(() => { clearTimeout(mentionScan); mentionScan = setTimeout(() => linkMentions(document.body), 80); }).observe(document.body, {childList: true, subtree: true, characterData: true});
    ext.personBlocks.mentions = (index, detail) => {
        const rows = detail.heritage?.mentions || [];
        if (!rows.length) return '';
        const icon = {note: '📝', transcription: '📜', event: '📅', investigation: '🔎'};
        return card(index, 'Cité dans', rows.length, `<ul class="h-mentions">${rows.map(r => `<li>${icon[r.kind] || '•'} <strong>${r.person_id ? personLink(r.person_id, r.label) : r.investigation_id ? `<button type="button" class="table-link" data-open-investigation="${r.investigation_id}">${esc(r.label)}</button>` : r.media_id ? `<button type="button" class="link-button" data-h-open-list="cited_names" data-h-cite-media="${r.media_id}">${esc(r.label)}</button>` : esc(r.label)}</strong><br><small class="muted">${esc(r.snippet).replace(/@\[([^\]|]+)\|\d+\]/g, '<b>@$1</b>')}</small></li>`).join('')}</ul>
            <p class="muted">Écris « @ » suivi d’un nom dans une note ou une transcription pour créer un lien vers une fiche.</p>`, 'span-6');
    };
    document.addEventListener('click', event => {
        const b = event.target.closest?.('[data-h-cite-media]');
        if (b) { S().hCiteMedia = Number(b.dataset.hCiteMedia); }
    }, true);

    /* ═══════════════════════ 📚 CITATIONS DE SOURCES DÉTAILLÉES ═══════════════════════ */

    const CITE_FIELDS = [['archive', 'Service d’archives', 'AD Nord'], ['commune', 'Commune', 'Halluin'], ['register', 'Registre', 'naissances'], ['years', 'Années', '1802-1812'], ['cote', 'Cote', '3 E 12345'], ['view', 'Vue n°', '87'], ['view_total', 'sur', '240'], ['act', 'Acte n°', '45'], ['view_url', 'Lien direct vers la vue', 'https://archives…']];
    function citationRef(c) {
        const parts = [c.archive, c.commune, [c.register, c.years].filter(Boolean).join(' '), c.cote, c.view ? `vue ${c.view}${c.view_total ? '/' + c.view_total : ''}` : '', c.act ? `acte n° ${String(c.act).replace(/^(n°|no|n)\s*/i, '')}` : ''];
        return parts.map(p => String(p || '').trim()).filter(Boolean).join(', ');
    }
    watchDialog('source-dialog', dialog => {
        const form = dialog.querySelector('form');
        let box = form.querySelector('.h-citation');
        if (!box) {
            box = document.createElement('fieldset');
            box.className = 'h-citation span-2';
            box.innerHTML = `<legend>Référence précise de l’acte <small>(facultatif)</small></legend><div class="h-citation-grid">${CITE_FIELDS.map(([k, l, ph]) => `<label class="${k === 'view_url' ? 'span-2' : ''}">${esc(l)}<input name="citation_${k}" placeholder="${esc(ph)}" ${k === 'view_url' ? 'type="url"' : ''}></label>`).join('')}</div>
                <p class="h-citation-preview"></p><p class="muted">La référence complète est rédigée toute seule, toujours de la même façon, et rangée dans « Page ou référence ». <span data-h-cite-open></span></p>`;
            const pageLabel = form.querySelector('[name=page]')?.closest('label');
            (pageLabel || form.querySelector('.form-grid').lastElementChild).insertAdjacentElement('afterend', box);
            box.addEventListener('input', () => update(true));
        }
        const linkId = Number(form.elements.link_id?.value) || 0;
        const src = (S().currentPerson?.sources || []).find(s => Number(s.link_id) === linkId);
        let c = {};
        try { c = src?.citation_json ? JSON.parse(src.citation_json) : {}; } catch (_) { c = {}; }
        CITE_FIELDS.forEach(([k]) => { form.elements['citation_' + k].value = c[k] || ''; });
        let lastRef = citationRef(c);
        function update(fromTyping) {
            const v = {};
            CITE_FIELDS.forEach(([k]) => { v[k] = form.elements['citation_' + k].value.trim(); });
            const ref = citationRef(v);
            box.querySelector('.h-citation-preview').innerHTML = ref ? `<strong>Référence :</strong> ${esc(ref)}` : '';
            box.querySelector('[data-h-cite-open]').innerHTML = /^https?:\/\//.test(v.view_url) ? `<a href="${esc(v.view_url)}" target="_blank" rel="noopener noreferrer">Ouvrir la vue ↗</a>` : '';
            const page = form.elements.page;
            if (fromTyping && page && (!page.value.trim() || page.value.trim() === lastRef)) page.value = ref;
            lastRef = ref;
        }
        update(false);
    });

    /* ═══════════════════════ 🤝 DEMANDES D'ENTRAIDE ═══════════════════════ */

    const helpTargets = {parents: 'ses parents', birth: 'sa naissance (date et lieu)', baptism: 'son baptême', marriage: 'son mariage', death: 'son décès (date et lieu)', origin: 'son origine (d’où venait la famille)', other: 'autre chose'};
    const helpStatuses = {draft: 'Brouillon', posted: 'Publiée', answered: 'Réponse reçue', solved: 'Résolue', abandoned: 'Abandonnée'};
    const helpWhere = [['Geneanet — Entraide', 'https://www.geneanet.org/entraide/'], ['Forum Geneanet', 'https://www.geneanet.org/forum/'], ['Groupes Facebook de généalogie', 'https://www.facebook.com/search/groups/?q=g%C3%A9n%C3%A9alogie'], ['Cercle généalogique du département', 'https://www.google.com/search?q=cercle+g%C3%A9n%C3%A9alogique+entraide']];
    ext.lists.help_requests = async (token, edit = null) => {
        const st = S();
        const pending = st.hEdit?.list === 'help_requests' ? st.hEdit : null;
        if (pending) { st.hEdit = null; edit = {id: pending.id, personId: pending.personId}; }
        const filter = ['open', 'closed', 'all'].includes(st.hHelpFilter) ? st.hHelpFilter : 'open';
        const data = await api('help_requests', {status: filter});
        if (!isCurrent(token)) return;
        const rows = data.requests || [];
        let e = null;
        if (edit) {
            e = edit.id ? rows.find(r => Number(r.id) === Number(edit.id)) || (await api('help_requests', {status: 'all'})).requests.find(r => Number(r.id) === Number(edit.id)) : {id: 0, target: 'parents', status: 'draft', person_id: edit.personId || 0};
            if (e?.person_id) { try { e.person = (await api('person', {id: e.person_id})).person; } catch (_) {} }
        }
        const counts = data.counts || {open: 0, closed: 0};
        A().$('#workspace').innerHTML = `<section class="page collection-page">${header('LISTES', 'Demandes d’entraide', 'Pour un ancêtre où tu es bloqué, l’app rédige un message prêt à copier sur un forum, sur l’entraide de Geneanet ou sur un groupe Facebook : ce que l’on sait (avec les sources), ce que l’on cherche, ce qui a déjà été essayé (tiré des enquêtes). Les demandes bien présentées obtiennent beaucoup plus de réponses.')}
            <div class="collection-toolbar"><button type="button" class="button" data-h-help-new>+ Demande</button><div class="segmented-filter">${[['open', `En cours (${counts.open})`], ['closed', `Terminées (${counts.closed})`], ['all', 'Toutes']].map(([k, l]) => `<button type="button" class="button small ${filter === k ? '' : 'secondary'}" data-h-help-filter="${k}">${esc(l)}</button>`).join('')}</div></div>
            ${e ? helpFormHtml(e) : ''}
            ${rows.length ? `<div class="h-records">${rows.map(r => `<article class="h-record"><header><div><strong>🤝 ${esc(helpTargets[r.target] || 'Demande')}</strong>${LC(r.labels)} — ${personLink(r.person_id, r.person_name)} <span class="collection-kind">${esc(helpStatuses[r.status] || r.status)}</span>${r.posted_where ? ` <small>· ${esc(r.posted_where)}</small>` : ''}${r.posted_url ? ` <a href="${esc(r.posted_url)}" target="_blank" rel="noopener noreferrer">voir ↗</a>` : ''}</div>${tools(`data-h-help-edit="${r.id}"`, `data-h-help-delete="${r.id}"`, 'cette demande')}</header>${r.question ? `<p>${nl(r.question)}</p>` : ''}${r.answer ? `<p class="h-transcription"><strong>Réponse :</strong> ${nl(r.answer)}</p>` : ''}<small class="muted">Mise à jour : ${esc(r.updated_at)}</small></article>`).join('')}</div>` : (e ? '' : empty(filter === 'closed' ? 'Aucune demande terminée.' : 'Aucune demande en cours. Prépare la première avec « + Demande ».'))}</section>`;
        const ws = A().$('#workspace');
        A().bindTableLinks();
        ws.querySelector('[data-h-help-new]').addEventListener('click', () => ext.lists.help_requests(++S().workspaceToken, {id: 0}));
        ws.querySelectorAll('[data-h-help-filter]').forEach(b => b.addEventListener('click', () => { st.hHelpFilter = b.dataset.hHelpFilter; A().renderList(); }));
        ws.querySelectorAll('[data-h-help-edit]').forEach(b => b.addEventListener('click', () => ext.lists.help_requests(++S().workspaceToken, {id: Number(b.dataset.hHelpEdit)})));
        ws.querySelectorAll('[data-h-help-delete]').forEach(b => b.addEventListener('click', async () => { if (!confirm('Supprimer cette demande ?')) return; await api('delete_help_request', {}, {method: 'POST', body: {id: b.dataset.hHelpDelete}}); A().renderList(); }));
        if (e) bindHelpForm(e);
    };
    function helpFormHtml(e) {
        return `<form class="maintenance-panel collection-form" id="h-help-form"><h3>${e.id ? 'Modifier la demande' : 'Nouvelle demande d’entraide'}</h3>
            <div class="form-grid"><label>Pour quel ancêtre ?${A().collectionPersonField('person_id', e.person || null, 'Personne…')}</label><label>Je cherche<select name="target">${Object.entries(helpTargets).map(([k, l]) => `<option value="${k}" ${e.target === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            <label class="span-2">Ma question, avec mes mots (facultatif)<textarea name="question" rows="2" placeholder="Je cherche le baptême de Jean Dupont vers 1750, probablement dans une paroisse voisine de Halluin…">${esc(e.question || '')}</textarea></label>
            <label>Où publier<select name="format"><option value="forum">Forum (message complet)</option><option value="geneanet">Entraide Geneanet</option><option value="facebook">Groupe Facebook (plus court)</option></select></label>
            <div class="page-actions" style="align-self:end"><button type="button" class="button secondary" data-h-help-draft>Rédiger le message</button></div>
            <label class="span-2">Message (modifiable)<textarea name="message" rows="14">${esc(e.message || '')}</textarea></label></div>
            <div class="page-actions"><button type="button" class="button small secondary" data-h-help-copy>Copier le message</button>${helpWhere.map(([l, u]) => `<a class="button small secondary" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(l)} ↗</a>`).join('')}</div>
            <h4>Suivi</h4><div class="form-grid"><label>État<select name="status">${Object.entries(helpStatuses).map(([k, l]) => `<option value="${k}" ${e.status === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label><label>Publiée où<input name="posted_where" value="${esc(e.posted_where || '')}" placeholder="Entraide Geneanet, groupe « Généalogie du Nord »…"></label>
            <label class="span-2">Lien vers la demande publiée<input name="posted_url" value="${esc(e.posted_url || '')}" placeholder="https://…"></label><label class="span-2">Réponses reçues, pistes<textarea name="answer" rows="3">${esc(e.answer || '')}</textarea></label></div>
            ${LP('help_request', e.labels)}<div class="page-actions action-zone"><button class="button" type="submit">Enregistrer</button><button class="button secondary" type="button" data-h-help-cancel>Annuler</button></div></form>`;
    }
    function bindHelpForm(e) {
        const form = A().$('#h-help-form');
        A().bindCollectionPersonFields(form); form.scrollIntoView({block: 'start'});
        form.querySelector('[data-h-help-cancel]').addEventListener('click', () => A().renderList());
        form.querySelector('[data-h-help-draft]').addEventListener('click', async () => {
            const pid = Number(form.querySelector('[name=person_id]').value);
            if (!pid) return toast('Choisis d’abord l’ancêtre (dans les suggestions).', 'error');
            if (form.message.value.trim() && !confirm('Remplacer le message actuel par un nouveau brouillon ?')) return;
            try { const r = await api('help_request_draft', {person_id: pid, target: form.target.value, question: form.question.value, format: form.format.value}); form.message.value = r.message; }
            catch (error) { toast(error.message, 'error'); }
        });
        form.querySelector('[data-h-help-copy]').addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(form.message.value); toast('Message copié : colle-le sur le forum ou le groupe.'); }
            catch (_) { form.message.select(); document.execCommand('copy'); toast('Message copié.'); }
        });
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const v = A().formObject(form);
            try { await api('save_help_request', {}, {method: 'POST', body: {...v, id: e.id, person_id: form.querySelector('[name=person_id]').value}}); toast('Demande enregistrée.'); A().renderList(); }
            catch (error) { toast(error.message, 'error'); }
        });
    }
    ext.dashboard.help_requests_widget = {load: () => api('help_requests', {status: 'open'}), render: (index, widget, span, data) => {
        const rows = data?.requests || [];
        return card(index, 'Demandes d’entraide', rows.length || '', `${rows.length ? `<ul class="h-widget-list">${rows.slice(0, 6).map(r => `<li>${personLink(r.person_id, r.person_name)} — ${esc(helpTargets[r.target] || '')} <span class="collection-kind">${esc(helpStatuses[r.status] || r.status)}</span>${r.posted_url ? ` <a href="${esc(r.posted_url)}" target="_blank" rel="noopener noreferrer">↗</a>` : ''}</li>`).join('')}</ul>` : empty('Aucune demande en cours.')}<div class="page-actions"><button type="button" class="button small secondary" data-h-open-list="help_requests" data-h-edit="0">+ Demande</button></div>`, span);
    }};

    /* ═══════════════════════ 🎬 LE FILM DE LA FAMILLE ═══════════════════════ */

    ext.mapSetup.push(() => {
        const strip = document.querySelector('.map-layout .tool-strip');
        if (!strip || strip.querySelector('[data-h-film]')) return;
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'button small'; b.dataset.hFilm = '1'; b.textContent = '🎬 Film de la famille';
        b.title = 'Enregistrer en vidéo la famille qui se déplace au fil des siècles';
        strip.insertBefore(b, strip.querySelector('#map-reset'));
        b.addEventListener('click', openFilmDialog);
    });
    function filmTitle() {
        const last = (document.getElementById('brand-lastname')?.textContent || '').trim();
        const nice = last && !/^famille$/i.test(last) ? ' ' + last.charAt(0).toUpperCase() + last.slice(1).toLowerCase() : '';
        return `La famille${nice} au fil des siècles`;
    }
    function filmMime() {
        if (typeof MediaRecorder === 'undefined') return null;
        for (const m of ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) { if (MediaRecorder.isTypeSupported(m)) return m; }
        return null;
    }
    function openFilmDialog() {
        const mime = filmMime();
        ext.openDialog({
            eyebrow: 'FILM', title: 'Le film de la famille', submitLabel: 'Enregistrer la vidéo',
            body: `<p>La carte animée montre la famille se déplacer au fil des siècles : chaque événement (naissance, mariage, décès, résidence…) apparaît à son année, puis s’estompe ; les déplacements d’une même personne sont tracés. La vidéo se télécharge en <strong>${mime?.startsWith('video/mp4') ? 'MP4' : 'WebM'}</strong>${mime?.startsWith('video/mp4') ? ' (lisible partout : messages, mails, téléphones)' : ' (si un téléphone ne la lit pas, VLC ou un convertisseur en ligne la passent en MP4)'}.</p>
                <div class="form-grid"><label>Titre<input name="title" value="${esc(filmTitle())}"></label><label>Nom de famille seulement (facultatif)<input name="surname" placeholder="Dupont"></label>
                <label>De l’année<input type="number" name="from" placeholder="auto"></label><label>À l’année<input type="number" name="to" placeholder="auto"></label>
                <label>Durée de la vidéo<select name="seconds"><option value="20">20 secondes</option><option value="40" selected>40 secondes</option><option value="60">1 minute</option><option value="90">1 min 30</option><option value="120">2 minutes</option></select></label>
                <label>Format<select name="size"><option value="1280x720">Paysage 1280 × 720 (écran, réunion)</option><option value="1080x1080">Carré 1080 × 1080 (messages)</option><option value="720x1280">Portrait 720 × 1280 (téléphone)</option></select></label>
                <label class="span-2 checkbox-line"><input type="checkbox" name="online" checked> Fond de carte détaillé (Internet) — sinon, fond hors ligne</label></div>
                <div class="h-film-preview" hidden><canvas></canvas><div class="h-progress"><span></span></div><p class="muted" data-h-film-status></p></div>`,
            onSubmit: async form => { if (!mime) { toast('Cet ordinateur ne sait pas enregistrer de vidéo depuis l’application.', 'error'); return false; } await recordFilm(form, mime); return false; },
        });
    }
    function loadImage(src, cors) {
        return new Promise(resolve => { const img = new Image(); if (cors) img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = () => resolve(null); img.referrerPolicy = 'no-referrer'; img.src = src; });
    }
    async function recordFilm(form, mime) {
        const app = A(), v = app.formObject(form);
        const [W, H] = v.size.split('x').map(Number);
        const status = form.querySelector('[data-h-film-status]'), preview = form.querySelector('.h-film-preview'), bar = form.querySelector('.h-progress span');
        preview.hidden = false; status.textContent = 'Préparation des données…';
        const submit = form.querySelector('[type=submit]'); submit.disabled = true;
        try {
            const data = await api('map', {tag: 'all', limit: 20000, surname: v.surname || undefined, surname_mode: 'last_name'});
            let pts = (data.points || []).filter(p => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)) && Number(p.year) > 0 && !(Number(p.latitude) === 0 && Number(p.longitude) === 0)).map(p => ({lat: Number(p.latitude), lon: Number(p.longitude), year: Number(p.year), pid: Number(p.person_id) || 0, name: [p.first_name, p.last_name].filter(Boolean).join(' '), surname: String(p.last_name || '').split(/[ /&]/)[0]}));
            const from = Number(v.from) || Math.min(...pts.map(p => p.year)), to = Number(v.to) || Math.max(...pts.map(p => p.year));
            pts = pts.filter(p => p.year >= from && p.year <= to);
            if (pts.length < 2) throw new Error('Pas assez d’événements datés et placés sur la carte pour faire un film.');
            // Cadrage : les 98 % de points les plus centraux (un départ au Canada ne doit pas réduire la France à un point)
            const sortedLat = pts.map(p => p.lat).sort((a, b) => a - b), sortedLon = pts.map(p => p.lon).sort((a, b) => a - b);
            const q = (arr, f) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(f * (arr.length - 1))))];
            const box = [q(sortedLat, .01), q(sortedLat, .99), q(sortedLon, .01), q(sortedLon, .99)];
            let zoom = 3;
            for (let z = 12; z >= 2; z--) { const dx = app.lngToX(box[3], z) - app.lngToX(box[2], z), dy = app.latToY(box[0], z) - app.latToY(box[1], z); if (dx <= W * .85 && dy <= H * .78) { zoom = z; break; } }
            const cx = (app.lngToX(box[2], zoom) + app.lngToX(box[3], zoom)) / 2, cy = (app.latToY(box[0], zoom) + app.latToY(box[1], zoom)) / 2;
            const left = cx - W / 2, top = cy - H / 2 + H * .03;
            const xy = p => [app.lngToX(p.lon, zoom) - left, app.latToY(p.lat, zoom) - top];
            // Fond de carte dessiné une fois
            status.textContent = 'Chargement du fond de carte…';
            const bgCanvas = document.createElement('canvas'); bgCanvas.width = W; bgCanvas.height = H;
            const bg = bgCanvas.getContext('2d');
            bg.fillStyle = '#dfe6ea'; bg.fillRect(0, 0, W, H);
            const world = 2 ** zoom, tiles = [];
            for (let tx = Math.floor(left / 256); tx <= Math.floor((left + W) / 256); tx++) for (let ty = Math.floor(top / 256); ty <= Math.floor((top + H) / 256); ty++) { if (ty >= 0 && ty < world) tiles.push([tx, ty]); }
            const drawTiles = async online => {
                const style = online ? 'light' : 'offline';
                const imgs = await Promise.all(tiles.map(([tx, ty]) => loadImage(online ? app.mapTileUrl(style, zoom, ((tx % world) + world) % world, ty) : `api.php?action=offline_tile&z=${zoom}&x=${((tx % world) + world) % world}&y=${ty}`, online)));
                bg.fillStyle = '#dfe6ea'; bg.fillRect(0, 0, W, H);
                imgs.forEach((img, i) => { if (img) bg.drawImage(img, tiles[i][0] * 256 - left, tiles[i][1] * 256 - top, 256, 256); });
                try { bg.getImageData(0, 0, 1, 1); return imgs.some(Boolean); } catch (_) { return false; }
            };
            if (!(v.online && await drawTiles(true))) await drawTiles(false);
            bg.fillStyle = 'rgba(255,255,255,.18)'; bg.fillRect(0, 0, W, H);
            // Animation
            const canvas = form.querySelector('.h-film-preview canvas');
            canvas.width = W; canvas.height = H;
            const ctx = canvas.getContext('2d');
            const surnames = [...new Set(pts.map(p => p.surname).filter(Boolean))];
            const counts = Object.fromEntries(surnames.map(s => [s, pts.filter(p => p.surname === s).length]));
            const topNames = surnames.sort((a, b) => counts[b] - counts[a]).slice(0, 8);
            const colors = ['#0066cc', '#cc4700', '#00a37a', '#7a47db', '#cc0014', '#a07a00', '#008fb3', '#c2185b'];
            const colorOf = p => colors[topNames.indexOf(p.surname)] || '#555';
            const byPerson = {};
            pts.forEach(p => { if (p.pid) (byPerson[p.pid] ||= []).push(p); });
            Object.values(byPerson).forEach(list => list.sort((a, b) => a.year - b.year));
            const span = Math.max(1, to - from), fade = Math.max(15, span / 6);
            const frame = year => {
                ctx.drawImage(bgCanvas, 0, 0);
                Object.values(byPerson).forEach(list => {
                    for (let i = 1; i < list.length; i++) {
                        const a = list[i - 1], b = list[i];
                        if (b.year > year) break;
                        const age = year - b.year; if (age > fade * 1.5) continue;
                        const [x1, y1] = xy(a), [x2, y2] = xy(b);
                        if (Math.hypot(x2 - x1, y2 - y1) < 3) continue;
                        ctx.strokeStyle = colorOf(b); ctx.globalAlpha = Math.max(.12, .7 - age / (fade * 1.5)); ctx.lineWidth = 2;
                        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2, Math.min(y1, y2) - Math.hypot(x2 - x1, y2 - y1) * .15, x2, y2); ctx.stroke();
                    }
                });
                pts.forEach(p => {
                    if (p.year > year) return;
                    const age = year - p.year, [x, y] = xy(p);
                    if (x < -20 || y < -20 || x > W + 20 || y > H + 20) return;
                    ctx.globalAlpha = Math.max(.18, 1 - age / fade);
                    ctx.fillStyle = colorOf(p);
                    const r = age < 2 ? 7 - age * 1.5 : 3.5;
                    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
                    if (age < 1) { ctx.globalAlpha = .35 * (1 - age); ctx.beginPath(); ctx.arc(x, y, 14 * (1 - age) + 6, 0, Math.PI * 2); ctx.fill(); }
                });
                ctx.globalAlpha = 1;
                ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fillRect(0, 0, W, 56);
                ctx.fillStyle = '#111'; ctx.font = `700 ${Math.round(Math.min(W, H) / 28)}px Arial, sans-serif`; ctx.textBaseline = 'middle';
                ctx.fillText(v.title || 'La famille au fil des siècles', 20, 28);
                ctx.font = `900 ${Math.round(Math.min(W, H) / 7)}px Arial, sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
                ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.strokeText(String(Math.floor(year)), W - 24, H - 24);
                ctx.fillStyle = '#111'; ctx.fillText(String(Math.floor(year)), W - 24, H - 24);
                ctx.textAlign = 'left'; ctx.font = `600 ${Math.round(Math.min(W, H) / 48)}px Arial, sans-serif`;
                topNames.slice(0, H > W ? 5 : 8).forEach((n, i) => { const yy = 80 + i * Math.round(Math.min(W, H) / 32); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(14, yy - 12, ctx.measureText(n).width + 34, 24); ctx.fillStyle = colors[i]; ctx.beginPath(); ctx.arc(28, yy, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#111'; ctx.fillText(n, 40, yy + 5); });
                ctx.font = `${Math.round(Math.min(W, H) / 70)}px Arial, sans-serif`; ctx.fillStyle = '#333'; ctx.fillText('Fond de carte © contributeurs OpenStreetMap · LCNDA', 14, H - 12);
            };
            // Enregistrement en temps réel (2 s d'arrêt sur l'image finale)
            const seconds = Number(v.seconds) || 40, fps = 30;
            const stream = canvas.captureStream(fps);
            const chunks = [];
            const rec = new MediaRecorder(stream, {mimeType: mime, videoBitsPerSecond: 6_000_000});
            rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
            const done = new Promise(resolve => { rec.onstop = resolve; });
            rec.start(500);
            const t0 = performance.now(), total = (seconds + 2) * 1000;
            await new Promise(resolve => {
                const tick = now => {
                    const t = Math.min(1, (now - t0) / (seconds * 1000));
                    frame(from + span * t);
                    bar.style.width = `${Math.round(100 * Math.min(1, (now - t0) / total))}%`;
                    status.textContent = `Enregistrement… ${Math.floor(from + span * t)} (laisse cette fenêtre ouverte)`;
                    if (now - t0 < total) requestAnimationFrame(tick); else resolve();
                };
                requestAnimationFrame(tick);
            });
            rec.stop(); await done;
            bar.style.width = '100%';
            const blob = new Blob(chunks, {type: mime.split(';')[0]});
            const ext2 = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = `film-de-la-famille-${from}-${to}.${ext2}`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 60000);
            status.textContent = `Vidéo enregistrée (${(blob.size / 1048576).toFixed(1)} Mo, ${ext2.toUpperCase()}) : regarde dans tes Téléchargements.`;
            toast('🎬 Film de la famille enregistré.');
        } catch (error) { status.textContent = error.message; toast(error.message, 'error'); }
        finally { submit.disabled = false; }
    }
})();
