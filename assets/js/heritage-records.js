/**
 * Éditeur de listes — 📇 listes de fiches que l'on remplit soi-même, comme « Circuits sur le terrain » :
 * un formulaire construit champ par champ (texte, dates, lieux sur la carte, personnes, photos, étapes sans limite…),
 * des fiches en cartes avec « À faire / Faits / Tous », une barre d'avancement, « Ouvrir » et « Marquer fait ».
 * Serveur : lib/my_lists.php (source « records », table custom_list_records, structure n°23).
 * Chargé après heritage-more.js (window.LCNDA_APP, window.LCNDA_EXT).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = value => A().escapeHtml(value ?? '');
    const nl = value => esc(value).replace(/\n/g, '<br>');
    const api = (...args) => A().api(...args);
    const toast = (...args) => A().toast(...args);
    const empty = (text, o) => A().empty(text, o);
    const S = () => A().state;
    const fmt = (n, d = 0) => Number(n || 0).toLocaleString('fr-FR', {maximumFractionDigits: d});
    const plural = (n, one, many) => `${fmt(n)} ${n > 1 ? many : one}`;
    const header = (eyebrow, title, intro, actions = '') => `<header class="page-header"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2>${intro ? `<p>${intro}</p>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</header>`;
    const tools = (...args) => ext.tools ? ext.tools(...args) : '';
    const dialog = opts => ext.openDialog(opts);
    const pname = p => p ? A().personName(p) : '';
    const personLink = p => p ? `<button type="button" class="table-link" data-h-person="${Number(p.id)}">${esc(pname(p))}</button>` : '';
    const key = () => 'f' + Math.random().toString(36).slice(2, 8);

    /* ─────────── Les sortes de champs ─────────── */
    const TYPES = [
        ['text', '📝', 'Texte court', 'Un nom, un titre, une cote…'], ['longtext', '📄', 'Texte long', 'Des notes, un récit, un compte rendu'],
        ['date', '📅', 'Date', 'Choisie dans un calendrier'], ['time', '🕘', 'Heure', '9 h 30'], ['number', '🔢', 'Nombre', 'Un coût, une durée, un nombre'],
        ['select', '📋', 'Liste de choix', 'Choisir parmi des réponses que tu écris'], ['checkbox', '☑️', 'Case à cocher', 'Oui / non'],
        ['url', '🔗', 'Lien internet', 'Une page d’archives, un site'], ['person', '👤', 'Une personne', 'Une fiche de la base'],
        ['people', '👥', 'Plusieurs personnes', 'Autant de fiches que l’on veut'], ['place', '📍', 'Lieu', 'Placé tout seul sur la carte'],
        ['media', '🖼️', 'Photos, documents', 'Fichiers à ajouter'], ['steps', '🧭', 'Étapes (sous-liste)', 'Autant de lignes que l’on veut, chacune avec ses champs, à cocher'],
        ['heading', '🔖', 'Titre de section', 'Pour séparer le formulaire (« Pour qui ? », « Étapes »…)'],
    ];
    const SUB_TYPES = ['text', 'longtext', 'date', 'time', 'number', 'select', 'checkbox', 'url', 'place', 'person'];
    const typeOf = t => TYPES.find(x => x[0] === t) || TYPES[0];
    const ACCEPT = {image: 'image/*', video: 'video/*', audio: 'audio/*', all: 'image/*,video/*,audio/*,application/pdf'};
    const f = (type, label, more = {}) => ({key: key(), type, label, help: '', placeholder: '', width: 'full', required: false, options: [], ...more});

    /* ─────────── Modèles de départ ─────────── */
    const TEMPLATES = () => [
        {icon: '🚗', name: 'Circuits', description: 'Un circuit « sur les traces de mes ancêtres » : les lieux à voir jour par jour, avec la logistique, ce que je cherche et une liste à cocher.',
            fields: [f('text', 'Nom', {width: 'half', required: true, placeholder: 'Sur les traces des Dupont en Corrèze'}), f('place', 'Point de départ', {width: 'half', placeholder: 'Brive-la-Gaillarde (hôtel, gîte…)'}),
                f('date', 'Du', {width: 'half'}), f('date', 'Au', {width: 'half'}), f('heading', 'Pour qui ?'), f('people', 'Ancêtres ou personnes'),
                f('heading', 'Étapes'), f('steps', 'Étapes', {item: 'Étape', checkable: true, fields: [f('number', 'Jour', {width: 'half'}), f('time', 'Arrivée', {width: 'half'}), f('text', 'Titre', {placeholder: 'Église Saint-Martin'}), f('place', 'Lieu'), f('text', 'Transport, accès'), f('longtext', 'Ce que je cherche'), f('longtext', 'Compte rendu')]}),
                f('longtext', 'Notes (hébergement, rendez-vous, personnes à rencontrer…)')],
            record: {status: true, todo: 'À faire', done: 'Faits', mark: 'Marquer fait', item: 'circuit', new: '+ Circuit', form: 'Nouveau circuit', meta: [], map: true}},
        {icon: '🔎', name: 'Projets de recherche', description: 'Une question à résoudre (« Qui sont les parents de Jean ? »), les pistes à suivre une par une, et la conclusion.',
            fields: [f('text', 'Question', {required: true, placeholder: 'Qui sont les parents de Jean Dupont ?'}), f('person', 'Personne concernée', {width: 'half'}), f('select', 'Priorité', {width: 'half', options: ['Haute', 'Moyenne', 'Basse']}),
                f('steps', 'Pistes à suivre', {item: 'Piste', checkable: true, fields: [f('text', 'Piste', {placeholder: 'Registres paroissiaux de Tulle 1740-1760'}), f('text', 'Où chercher'), f('select', 'Résultat', {options: ['À faire', 'Trouvé', 'Rien trouvé']})]}),
                f('longtext', 'Ce que j’ai trouvé'), f('longtext', 'Conclusion')],
            record: {status: true, todo: 'En cours', done: 'Résolus', mark: 'Marquer résolu', item: 'projet', new: '+ Projet', form: 'Nouveau projet', meta: [], map: false}},
        {icon: '📅', name: 'Rendez-vous et visites', description: 'Mairies, archives, cousins à rencontrer : quand, où, avec qui, et quoi emporter.',
            fields: [f('text', 'Objet', {required: true}), f('date', 'Date', {width: 'half'}), f('time', 'Heure', {width: 'half'}), f('place', 'Lieu'), f('text', 'Contact', {width: 'half'}), f('text', 'Téléphone', {width: 'half'}),
                f('steps', 'À emporter', {item: 'Chose', checkable: true, fields: [f('text', 'Chose')]}), f('longtext', 'Compte rendu')],
            record: {status: true, todo: 'À venir', done: 'Passés', mark: 'Marquer passé', item: 'rendez-vous', new: '+ Rendez-vous', form: 'Nouveau rendez-vous', meta: [], map: true}},
        {icon: '📇', name: 'Liste de fiches vide', description: '',
            fields: [f('text', 'Titre', {required: true})], record: {status: true, todo: 'À faire', done: 'Faits', mark: 'Marquer fait', item: 'fiche', new: '+ Nouvelle fiche', form: 'Nouvelle fiche', meta: [], map: false}},
    ];
    ext.recordTemplates = () => TEMPLATES().map(t => ({icon: t.icon, name: t.name, description: t.description, source: 'records', definition: {fields: t.fields, record: t.record}}));
    // les métadonnées (« Du », « Point de départ ») sous le titre des cartes : choisies après coup dans l'éditeur ; par défaut les 2 premiers champs courts
    const defaultMeta = d => (d.fields || []).filter(x => ['text', 'date', 'place', 'select', 'person', 'number', 'time'].includes(x.type)).slice(1, 3).map(x => x.key);

    /* ─────────── Constructeur du formulaire (dans l'éditeur de listes) ─────────── */
    ext.recordsBuilderHtml = L => {
        const d = L.definition, r = d.record = {status: true, todo: 'À faire', done: 'Faits', mark: 'Marquer fait', item: 'fiche', new: '+ Nouvelle fiche', form: 'Nouvelle fiche', meta: [], map: false, sort: 'created', ...(d.record || {})};
        d.fields ??= [];
        const keys = d.fields.filter(x => !['heading', 'steps', 'media'].includes(x.type));
        const sub = (sf, j) => `<div class="h-rb-sub" data-rb-sub="${j}"><input data-rbs="label" value="${esc(sf.label)}" placeholder="Nom du champ"><select data-rbs="type">${SUB_TYPES.map(t => `<option value="${t}" ${sf.type === t ? 'selected' : ''}>${typeOf(t)[1]} ${esc(typeOf(t)[2])}</option>`).join('')}</select>
            <select data-rbs="width" title="Largeur"><option value="full" ${sf.width !== 'half' ? 'selected' : ''}>pleine largeur</option><option value="half" ${sf.width === 'half' ? 'selected' : ''}>demi-largeur</option></select>
            ${sf.type === 'select' ? `<input data-rbs="options" value="${esc((sf.options || []).join(', '))}" placeholder="choix séparés par des virgules">` : ''}<button type="button" class="icon-button danger" data-rbs-del title="Retirer">🗑</button></div>`;
        const row = (x, i) => { const [, icon, tl] = typeOf(x.type);
            return `<div class="h-rb-field ${x.type === 'heading' ? 'is-heading' : ''}" data-rb-i="${i}"><div class="h-rb-line"><span class="h-rb-type" title="${esc(tl)}">${icon}</span>
                <input data-rb="label" value="${esc(x.label)}" placeholder="${x.type === 'heading' ? 'Titre de la section' : 'Nom du champ'}">
                ${['heading', 'steps', 'people', 'longtext', 'media'].includes(x.type) ? '' : `<select data-rb="width" title="Largeur"><option value="full" ${x.width !== 'half' ? 'selected' : ''}>pleine largeur</option><option value="half" ${x.width === 'half' ? 'selected' : ''}>demi-largeur</option></select>`}
                ${['heading', 'steps', 'media', 'checkbox'].includes(x.type) ? '' : `<label class="checkbox-line" title="Impossible d’enregistrer sans le remplir"><input type="checkbox" data-rb="required" ${x.required ? 'checked' : ''}> obligatoire</label>`}
                <span class="h-rb-tools"><button type="button" class="icon-button" data-rb-move="-1" title="Monter">↑</button><button type="button" class="icon-button" data-rb-move="1" title="Descendre">↓</button><button type="button" class="icon-button danger" data-rb-del title="Retirer">🗑</button></span></div>
                <div class="h-rb-more">${x.type === 'select' ? `<input data-rb="options" value="${esc((x.options || []).join(', '))}" placeholder="Les choix, séparés par des virgules">` : ''}
                ${x.type === 'media' ? `<select data-rb="accept">${[['all', 'photos, vidéos, sons, PDF'], ['image', 'photos seulement'], ['video', 'vidéos'], ['audio', 'sons']].map(([v, l]) => `<option value="${v}" ${x.accept === v ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}
                ${['heading', 'steps', 'checkbox', 'media', 'people', 'person'].includes(x.type) ? '' : `<input data-rb="placeholder" value="${esc(x.placeholder || '')}" placeholder="Exemple grisé dans la case (facultatif)">`}
                <input data-rb="help" value="${esc(x.help || '')}" placeholder="Aide sous le champ (facultatif)">
                ${x.type === 'steps' ? `<div class="h-rb-steps"><div class="h-rb-steps-head"><label>Une ligne s’appelle <input data-rb="item" value="${esc(x.item || 'Étape')}" class="h-rb-item"></label><label class="checkbox-line"><input type="checkbox" data-rb="checkable" ${x.checkable !== false ? 'checked' : ''}> chaque ligne se coche (barre d’avancement)</label></div>
                    <p class="muted">Les champs de chaque ligne :</p><div data-rb-subs>${(x.fields || []).map(sub).join('')}</div><button type="button" class="button small secondary" data-rbs-add>+ Champ de la ligne</button></div>` : ''}</div></div>`; };
        return `<section class="maintenance-panel"><h3>2. Le formulaire d’une fiche</h3><p class="muted">Clique sur une sorte de champ pour l’ajouter, puis donne-lui un nom. « demi-largeur » met deux champs côte à côte. Les <b>Étapes</b> sont une sous-liste sans limite, chaque ligne avec ses propres champs.</p>
                <div class="h-be-palette">${TYPES.map(([t, icon, label, help]) => `<button type="button" class="button small secondary" data-rb-add="${t}" title="${esc(help)}">${icon} ${esc(label)}</button>`).join('')}</div>
                <div class="h-rb-fields" data-rb-fields>${d.fields.map(row).join('') || '<p class="muted">Aucun champ pour l’instant.</p>'}</div>
                <button type="button" class="button small secondary" data-rb-preview>👁 Voir le formulaire</button></section>
            <section class="maintenance-panel"><h3>3. La liste des fiches</h3><div class="form-grid">
                <label>Bouton pour créer<input data-rr="new" value="${esc(r.new)}" placeholder="+ Circuit"></label><label>Titre du formulaire<input data-rr="form" value="${esc(r.form)}" placeholder="Nouveau circuit"></label><label>Une fiche s’appelle<input data-rr="item" value="${esc(r.item)}" placeholder="circuit"></label>
                <label>Titre des cartes<select data-rr="title">${keys.map(x => `<option value="${esc(x.key)}" ${r.title === x.key ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
                <label>Ordre<select data-rr="sort">${[['created', 'dans l’ordre de création'], ['manual', 'à la main (↑ ↓)'], ['title', 'par titre'], ['date', 'par la première date']].map(([v, l]) => `<option value="${v}" ${r.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <div class="span-2"><span class="section-label">Sous le titre de chaque carte</span><div class="h-village-maps-grid">${keys.map(x => `<label class="checkbox-line"><input type="checkbox" data-rr-meta="${esc(x.key)}" ${(r.meta.length ? r.meta : defaultMeta(d)).includes(x.key) ? 'checked' : ''}> ${esc(x.label)}</label>`).join('') || '<span class="muted">Ajoute d’abord des champs.</span>'}</div></div>
                <label class="checkbox-line span-2"><input type="checkbox" data-rr="status" ${r.status ? 'checked' : ''}> Suivi « à faire / fait » : onglets en haut de la liste et bouton sur chaque carte</label>
                ${r.status ? `<label>Onglet « à faire »<input data-rr="todo" value="${esc(r.todo)}"></label><label>Onglet « faits »<input data-rr="done" value="${esc(r.done)}"></label><label>Bouton<input data-rr="mark" value="${esc(r.mark)}"></label>` : ''}
                <label class="checkbox-line span-2"><input type="checkbox" data-rr="map" ${r.map ? 'checked' : ''}> Carte des lieux en haut de la liste et dans chaque fiche</label></div></section>`;
    };
    ext.bindRecordsBuilder = (ws, L, again) => {
        const d = L.definition, box = ws.querySelector('[data-rb-fields]');
        const fieldAt = el => d.fields[Number(el.closest('[data-rb-i]').dataset.rbI)];
        ws.querySelectorAll('[data-rb-add]').forEach(b => b.addEventListener('click', () => {
            const t = b.dataset.rbAdd, x = f(t, t === 'heading' ? '' : '', {});
            if (t === 'steps') Object.assign(x, {label: 'Étapes', item: 'Étape', checkable: true, fields: [f('text', 'Titre'), f('place', 'Lieu'), f('longtext', 'Notes')]});
            if (t === 'select') x.options = [];
            d.fields.push(x); again();
            setTimeout(() => { const last = [...ws.querySelectorAll('[data-rb-i]')].pop(); last?.querySelector('[data-rb=label]')?.focus(); last?.scrollIntoView({block: 'center'}); }, 0);
        }));
        const read = el => { const x = fieldAt(el), k = el.dataset.rb;
            if (k === 'required' || k === 'checkable') x[k] = el.checked;
            else if (k === 'options') x.options = el.value.split(',').map(o => o.trim()).filter(Boolean);
            else x[k] = el.value; };
        box.addEventListener('input', e => { if (e.target.dataset.rb) read(e.target); const s = e.target.closest('[data-rb-sub]'); if (s && e.target.dataset.rbs) readSub(e.target); });
        box.addEventListener('change', e => { if (e.target.dataset.rb) read(e.target); if (e.target.dataset.rbs) { readSub(e.target); if (e.target.dataset.rbs === 'type') again(); } });
        const readSub = el => { const x = fieldAt(el), sf = x.fields[Number(el.closest('[data-rb-sub]').dataset.rbSub)], k = el.dataset.rbs;
            if (k === 'options') sf.options = el.value.split(',').map(o => o.trim()).filter(Boolean); else sf[k] = el.value; };
        box.addEventListener('click', async e => {
            const t = e.target;
            if (t.closest('[data-rb-del]')) { const i = Number(t.closest('[data-rb-i]').dataset.rbI); if (d.fields[i].type === 'steps' && !await A().confirmBox('Retirer les étapes ? Celles déjà écrites dans les fiches ne seront plus affichées.', {title: 'Retirer les étapes', okLabel: 'Retirer les étapes'})) return; d.fields.splice(i, 1); again(); }
            else if (t.closest('[data-rb-move]')) { const i = Number(t.closest('[data-rb-i]').dataset.rbI), j = i + Number(t.closest('[data-rb-move]').dataset.rbMove); if (j >= 0 && j < d.fields.length) { [d.fields[i], d.fields[j]] = [d.fields[j], d.fields[i]]; again(); } }
            else if (t.closest('[data-rbs-add]')) { fieldAt(t).fields.push(f('text', '')); again(); }
            else if (t.closest('[data-rbs-del]')) { const x = fieldAt(t); x.fields.splice(Number(t.closest('[data-rb-sub]').dataset.rbSub), 1); again(); }
        });
        ws.querySelectorAll('[data-rr]').forEach(el => el.addEventListener('change', () => { const k = el.dataset.rr; d.record[k] = el.type === 'checkbox' ? el.checked : el.value; if (k === 'status') again(); }));
        ws.querySelectorAll('[data-rr]').forEach(el => el.type !== 'checkbox' && el.addEventListener('input', () => { d.record[el.dataset.rr] = el.value; }));
        ws.querySelectorAll('[data-rr-meta]').forEach(el => el.addEventListener('change', () => { d.record.meta = [...ws.querySelectorAll('[data-rr-meta]:checked')].map(x => x.dataset.rrMeta); }));
        ws.querySelector('[data-rb-preview]')?.addEventListener('click', () => {
            if (!d.fields.length) return toast('Ajoute d’abord des champs.', 'error');
            dialog({eyebrow: 'APERÇU', title: d.record.form || 'Nouvelle fiche', wide: true, body: `<p class="muted">Voici le formulaire tel qu’il s’affichera (rien n’est enregistré).</p>${formInner(d, {id: 0, data: {}, media: [], labels: []}, {})}`, onOpen: dl => bindForm(dl, d)});
        });
    };
    // Avant d'enregistrer la liste : les champs sans nom en reçoivent un
    ext.recordsBeforeSave = d => { (d.fields || []).forEach(x => { if (!String(x.label || '').trim()) x.label = typeOf(x.type)[2]; (x.fields || []).forEach(sf => { if (!String(sf.label || '').trim()) sf.label = typeOf(sf.type)[2]; }); }); };

    /* ─────────── Formulaire d'une fiche ─────────── */
    const span = x => x.width === 'half' ? '' : ' class="span-2"';
    const helpHtml = x => x.help ? `<small class="muted">${esc(x.help)}</small>` : '';
    const req = x => x.required ? ' required' : '';
    function inputHtml(x, v, name, people) {
        const ph = x.placeholder ? ` placeholder="${esc(x.placeholder)}"` : '';
        switch (x.type) {
            case 'longtext': return `<textarea name="${name}" rows="3"${ph}${req(x)}>${esc(v ?? '')}</textarea>`;
            case 'date': return `<input type="date" data-iso-date name="${name}" value="${esc(v ?? '')}"${req(x)}>`;
            case 'time': return `<input type="time" name="${name}" value="${esc(v ?? '')}"${req(x)}>`;
            case 'number': return `<input type="text" inputmode="decimal" name="${name}" value="${esc(v ?? '')}"${ph}${req(x)}>`;
            case 'select': return `<select name="${name}"${req(x)}><option value="">—</option>${(x.options || []).map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
            case 'url': return `<input type="url" name="${name}" value="${esc(v ?? '')}" placeholder="${esc(x.placeholder || 'https://…')}">`;
            case 'person': return window.LCNDA_PICKER.pickerField({name, kind: 'person', value: Number(v) || null}); // menu de choix unique
            case 'place': return ext.placeField(name, v?.text || '', v?.lat ?? '', v?.lon ?? '', x.placeholder || 'Commune, adresse…');
            default: return `<input type="text" name="${name}" value="${esc(v ?? '')}"${ph}${req(x)}>`;
        }
    }
    let stepSeq = 0;
    const stepRow = (x, it, i, people) => `<div class="h-rec-step ${it.done ? 'is-done' : ''}" data-step>
        <div class="h-rec-step-head">${x.checkable !== false ? `<label class="checkbox-line"><input type="checkbox" data-step-done ${it.done ? 'checked' : ''}> fait</label>` : ''}<strong data-step-n>${esc(x.item || 'Étape')} ${i + 1}</strong>
            <span class="h-rb-tools"><button type="button" class="icon-button" data-step-move="-1" title="Monter">↑</button><button type="button" class="icon-button" data-step-move="1" title="Descendre">↓</button><button type="button" class="icon-button danger" data-step-del title="Retirer">✕</button></span></div>
        <div class="form-grid">${x.fields.map(sf => sf.type === 'checkbox' ? `<label class="checkbox-line${sf.width === 'half' ? '' : ' span-2'}"><input type="checkbox" data-s="${esc(sf.key)}" ${it[sf.key] ? 'checked' : ''}> ${esc(sf.label)}</label>`
            : sf.type === 'person' ? `<div${span(sf)}><span class="pk-lab">${esc(sf.label)}</span>${inputHtml(sf, it[sf.key], `s_${x.key}_${++stepSeq}_${sf.key}`, people).replace(/name="/, `data-s="${esc(sf.key)}" name="`)}</div>`
            : `<label${span(sf)}>${esc(sf.label)}${inputHtml(sf, it[sf.key], `s_${x.key}_${++stepSeq}_${sf.key}`, people).replace(/name="/, `data-s="${esc(sf.key)}" name="`)}</label>`).join('')}</div></div>`;
    function formInner(d, rec, people) {
        const data = rec.data || {};
        const media = d.fields.filter(x => x.type === 'media');
        return `<div class="form-grid">${d.fields.map(x => {
            const v = data[x.key];
            if (x.type === 'heading') return `<h4 class="span-2 h-rec-heading">${esc(x.label)}</h4>${x.help ? `<p class="muted span-2">${esc(x.help)}</p>` : ''}`;
            if (x.type === 'media') return '';
            if (x.type === 'checkbox') return `<label class="checkbox-line${x.width === 'half' ? '' : ' span-2'}"><input type="checkbox" name="f_${esc(x.key)}" ${v ? 'checked' : ''}> ${esc(x.label)}</label>`;
            if (x.type === 'people') return `<div class="span-2"><span class="section-label">${esc(x.label)}</span>${helpHtml(x)}<div class="h-rec-people" data-people="${esc(x.key)}">${window.LCNDA_PICKER.pickerField({name: 'p_' + x.key, kind: 'person', multiple: true, value: (Array.isArray(v) ? v : []).map(Number).filter(Boolean)})}</div></div>`;
            if (x.type === 'steps') { const items = Array.isArray(v) ? v : [];
                return `<div class="span-2 h-rec-steps-box"><span class="section-label">${esc(x.label)}</span>${helpHtml(x)}<div class="h-rec-steps" data-steps="${esc(x.key)}">${items.map((it, i) => stepRow(x, it, i, people)).join('')}</div>
                    <button type="button" class="button small secondary" data-step-add="${esc(x.key)}">+ ${esc(x.item || 'Étape')}</button></div>`; }
            if (x.type === 'person') return `<div${span(x)}><span class="pk-lab">${esc(x.label)}${x.required ? ' <small class="muted">(obligatoire)</small>' : ''}</span>${inputHtml(x, v, 'f_' + x.key, people)}${helpHtml(x)}</div>`;
            return `<label${span(x)}>${esc(x.label)}${x.required ? ' <small class="muted">(obligatoire)</small>' : ''}${inputHtml(x, v, 'f_' + x.key, people)}${helpHtml(x)}</label>`;
        }).join('')}</div>
        ${media.length && ext.mediaEditorHtml ? ext.mediaEditorHtml('custom_list_record', rec.id, rec.media || [], media.map(x => [x.key, x.label, ACCEPT[x.accept] || ACCEPT.all])) : ''}`;
    }
    function bindForm(root, d) {
        ext.bindMediaEditor?.(root);
        const renumber = box => box.querySelectorAll('[data-step-n]').forEach((n, i) => { const x = d.fields.find(y => y.key === box.dataset.steps); n.textContent = `${x?.item || 'Étape'} ${i + 1}`; });
        root.addEventListener('click', async e => {
            const t = e.target;
            const addS = t.closest('[data-step-add]');
            if (addS) { const x = d.fields.find(y => y.key === addS.dataset.stepAdd), box = root.querySelector(`[data-steps="${x.key}"]`);
                box.insertAdjacentHTML('beforeend', stepRow(x, {}, box.children.length, {})); renumber(box);
                const last = box.lastElementChild; last.querySelector('input:not([type=checkbox]),textarea,select')?.focus(); return; }
            if (t.closest('[data-step-del]')) { const row = t.closest('[data-step]'), box = row.parentElement; const hasText = [...row.querySelectorAll('input:not([type=hidden]):not([type=checkbox]),textarea')].some(i => i.value.trim()); if (hasText && !await A().confirmBox('Retirer cette ligne ?', {title: 'Retirer la ligne', okLabel: 'Retirer la ligne'})) return; row.remove(); renumber(box); return; }
            const mv = t.closest('[data-step-move]');
            if (mv) { const row = t.closest('[data-step]'), box = row.parentElement; if (mv.dataset.stepMove === '-1' && row.previousElementSibling) box.insertBefore(row, row.previousElementSibling); else if (mv.dataset.stepMove === '1' && row.nextElementSibling) box.insertBefore(row.nextElementSibling, row); renumber(box); }
        });
        root.addEventListener('change', e => { if (e.target.matches('[data-step-done]')) e.target.closest('[data-step]').classList.toggle('is-done', e.target.checked); });
    }
    function readForm(root, d) {
        const data = {};
        const val = (el, x) => {
            if (!el) return '';
            if (x.type === 'checkbox') return el.checked ? 1 : 0;
            if (x.type === 'place') { const w = el.closest('.h-place'); return {text: el.value, lat: w?.querySelector(`[name="${el.name}_lat"]`)?.value || null, lon: w?.querySelector(`[name="${el.name}_lon"]`)?.value || null}; }
            return el.value;
        };
        d.fields.forEach(x => {
            if (x.type === 'heading' || x.type === 'media') return;
            if (x.type === 'people') { data[x.key] = String(root.querySelector(`[data-people="${x.key}"] input[type=hidden][name="p_${x.key}"]`)?.value || '').split(',').map(Number).filter(Boolean); return; }
            if (x.type === 'steps') { data[x.key] = [...root.querySelectorAll(`[data-steps="${x.key}"] > [data-step]`)].map(row => {
                const it = {done: row.querySelector('[data-step-done]')?.checked ? 1 : 0};
                x.fields.forEach(sf => { it[sf.key] = val(row.querySelector(`[data-s="${sf.key}"]`), sf); });
                return it; }); return; }
            data[x.key] = val(root.querySelector(`[name="f_${x.key}"]`), x);
        });
        return data;
    }

    /* ─────────── Affichage d'une valeur ─────────── */
    const dateFr = v => { if (!v) return ''; const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return String(v); return new Date(`${v}T12:00:00`).toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'}); };
    function valueHtml(x, v, people) {
        switch (x.type) {
            case 'checkbox': return v ? '✅ oui' : '';
            case 'longtext': return v ? nl(v) : '';
            case 'date': return esc(dateFr(v));
            case 'url': return v ? `<a href="${esc(v)}" target="_blank" rel="noopener noreferrer">${esc(String(v).replace(/^https?:\/\//, '').slice(0, 60))} ↗</a>` : '';
            case 'person': return v ? personLink(people[v]) : '';
            case 'people': return Array.isArray(v) ? v.map(id => personLink(people[id])).filter(Boolean).join(', ') : '';
            case 'place': return v?.text ? `${esc(v.text)}${v.lat !== null && v.lat !== undefined ? ' <small title="Placé sur la carte">📍</small>' : ''}` : '';
            case 'number': return v === '' || v === null || v === undefined ? '' : esc(fmt(v, 2));
            default: return esc(v ?? '');
        }
    }
    const textOf = (x, v, people) => { const h = document.createElement('div'); h.innerHTML = valueHtml(x, v, people); return h.textContent.trim(); };

    /* ─────────── La liste des fiches ─────────── */
    const st = () => (S().hRec ||= {});
    ext.renderRecords = async (token, id, inLists, data, {goEdit, isCurrent, module, back, reload}) => {
        const L = data.list, d = L.definition, r = d.record, people = data.people || {};
        const s = st(); if (s.list !== id) { S().hRec = {list: id, filter: r.status ? 'todo' : 'all', q: '', open: 0, edit: null}; }
        const v = st();
        if (v.open) return renderRecord(token, id, inLists, data, {isCurrent, module, reload});
        const titleField = d.fields.find(x => x.key === r.title) || d.fields.find(x => !['heading', 'steps', 'media'].includes(x.type));
        const meta = (r.meta.length ? r.meta : defaultMeta(d)).map(k => d.fields.find(x => x.key === k)).filter(Boolean);
        const titleOf = rec => (titleField && textOf(titleField, rec.data[titleField.key], people)) || `${r.item} sans titre`;
        const firstDate = d.fields.find(x => x.type === 'date');
        const stepWord = (d.fields.find(x => x.type === 'steps' && x.checkable !== false)?.item || 'ligne').toLowerCase();
        let rows = data.rows.filter(rec => v.filter === 'all' || !r.status || (v.filter === 'done' ? rec.status === 'done' : rec.status !== 'done'));
        if (v.q) { const q = v.q.toLowerCase(); rows = rows.filter(rec => [...Object.values(rec.cells || {}), ...(rec.labels || []).map(l => l.name)].join(' ').toLowerCase().includes(q)); }
        if (r.sort === 'title') rows.sort((a, b) => titleOf(a).localeCompare(titleOf(b), 'fr', {numeric: true}));
        if (r.sort === 'date' && firstDate) rows.sort((a, b) => String(a.data[firstDate.key] || '9999').localeCompare(String(b.data[firstDate.key] || '9999')));
        const placesOf = rec => { const pts = [], t = titleOf(rec);
            d.fields.forEach(x => { const val = rec.data[x.key];
                if (x.type === 'place' && val?.lat !== null && val?.lat !== undefined) pts.push({lat: +val.lat, lon: +val.lon, label: `${t} · ${x.label} : ${val.text}`});
                if (x.type === 'steps' && Array.isArray(val)) val.forEach((it, i) => x.fields.filter(sf => sf.type === 'place').forEach(sf => { const p = it[sf.key]; if (p?.lat !== null && p?.lat !== undefined) pts.push({lat: +p.lat, lon: +p.lon, label: `${t} · ${x.item} ${i + 1} : ${p.text}`, n: i + 1}); }));
            }); return pts; };
        const pts = r.map ? rows.flatMap(placesOf) : [];
        const counts = data.counts || {todo: 0, done: 0};
        const editing = v.edit !== null && v.edit !== undefined ? (v.edit ? data.rows.find(x => x.id === v.edit) : {id: 0, data: {}, media: [], labels: [], status: 'todo'}) : null;
        const ws = A().$('#workspace');
        ws.innerHTML = `<section class="page collection-page h-recs">${header(inLists ? 'LISTES' : 'ÉDITEUR DE LISTES', (L.icon || '📇') + ' ' + L.name, esc(L.description || '') + (L.labels?.length ? '<br>' + ext.labelChips(L.labels) : ''),
                `${inLists ? '' : '<button type="button" class="button secondary" data-rv-back>← Éditeur de listes</button>'}<button type="button" class="button secondary" data-rv-csv>Exporter (CSV)</button><button type="button" class="button secondary" data-rv-print>Imprimer</button>${tools('data-rv-edit', 'data-rv-del', 'cette liste')}`)}
            <div class="collection-toolbar"><button type="button" class="button" data-rv-new>${esc(r.new || '+ Nouvelle fiche')}</button>
                ${r.status ? `<div class="segmented-filter" role="group">${[['todo', `${r.todo} (${counts.todo})`], ['done', `${r.done} (${counts.done})`], ['all', `Tous (${counts.todo + counts.done})`]].map(([k, l]) => `<button type="button" class="button small ${v.filter === k ? '' : 'secondary'}" data-rv-filter="${k}" aria-pressed="${v.filter === k}">${esc(l)}</button>`).join('')}</div>` : ''}
                ${data.rows.length > 5 ? `<input type="search" class="h-rec-search" data-rv-q value="${esc(v.q || '')}" placeholder="Chercher dans les fiches…">` : ''}</div>
            ${editing ? `<form class="maintenance-panel collection-form h-rec-form" data-rv-form><h3>${editing.id ? 'Modifier' : esc(r.form || 'Nouvelle fiche')}</h3>${formInner(d, editing, people)}
                <div class="span-2">${ext.labelsPicker('custom_list_record', editing.labels || [])}</div>
                <div class="page-actions action-zone"><button class="button" type="submit">Enregistrer</button>${editing.id ? '' : `<button class="button secondary" type="submit" value="again">Enregistrer et en créer un autre</button>`}<button class="button secondary" type="button" data-rv-cancel>Annuler</button></div></form>` : ''}
            ${pts.length && ext.miniMap ? `<section class="maintenance-panel">${ext.miniMap(pts, [], {height: 320})}</section>` : ''}
            <div class="h-trip-list">${rows.map(rec => { const done = rec.status === 'done';
                const metaTxt = meta.map(x => { const t = x.type === 'date' ? dateFr(rec.data[x.key]) : textOf(x, rec.data[x.key], people); return t ? (meta.length > 1 ? `${x.label} : ${t}` : t) : ''; }).filter(Boolean);
                return `<article class="h-record h-trip ${done && r.status ? 'is-done' : ''}" data-rv-rec="${rec.id}"><header><div><strong>${r.status ? (done ? '✅ ' : (L.icon || '📇') + ' ') : ''}${esc(titleOf(rec))}</strong>${ext.labelChips(rec.labels)}
                    ${metaTxt.length ? `<div class="muted">${esc(metaTxt.join(' · '))}</div>` : ''}
                    ${rec.steps ? `<div>${plural(rec.steps, stepWord, stepWord.replace(/(?<![sx])$/, 's'))} · ${fmt(rec.steps_done)} faite${rec.steps_done > 1 ? 's' : ''}${done && rec.done_at ? ` · fait le ${esc(dateFr(String(rec.done_at).slice(0, 10)))}` : ''}</div><div class="h-progress"><span style="width:${Math.round(100 * rec.steps_done / rec.steps)}%"></span></div>` : (done && rec.done_at && r.status ? `<div class="muted">fait le ${esc(dateFr(String(rec.done_at).slice(0, 10)))}</div>` : '')}
                    ${rec.media?.length && ext.thumbs ? ext.thumbs('rec-' + rec.id, rec.media.slice(0, 6)) : ''}</div>
                    <div class="page-actions compact">${r.sort === 'manual' ? `<button type="button" class="icon-button" data-rv-move="-1" title="Monter">↑</button><button type="button" class="icon-button" data-rv-move="1" title="Descendre">↓</button>` : ''}<button type="button" class="button small" data-rv-open>Ouvrir</button>${r.status ? `<button type="button" class="button small secondary" data-rv-status="${done ? 'todo' : 'done'}">${done ? 'Remettre ' + esc(r.todo.toLowerCase()) : esc(r.mark)}</button>` : ''}</div></header></article>`; }).join('')
                || empty(data.rows.length ? (v.q ? 'Aucune fiche ne contient ce texte.' : `Aucune fiche dans « ${esc(v.filter === 'done' ? r.done : r.todo)} ».`) : `Aucune fiche pour l’instant. Crée la première avec « ${esc(r.new)} ».`)}</div></section>`;
        A().bindTableLinks?.();
        const go = () => reload();
        ws.querySelector('[data-rv-back]')?.addEventListener('click', back);
        ws.querySelector('[data-rv-edit]').addEventListener('click', goEdit);
        ws.querySelector('[data-rv-del]').addEventListener('click', async () => {
            if (!await A().confirmBox(`Supprimer la liste « ${L.name} » et ses ${plural(data.rows.length, 'fiche', 'fiches')} ?`, {title: 'Supprimer la liste', okLabel: 'Supprimer la liste'})) return;
            await api('delete_my_list', {}, {method: 'POST', body: {id}}); S().hListOpen = 0; S().hRec = {};
            ext.afterListDeleted?.(inLists);
        });
        ws.querySelector('[data-rv-print]').addEventListener('click', () => window.print());
        ws.querySelector('[data-rv-csv]').addEventListener('click', () => {
            const cols = d.fields.filter(x => !['heading', 'media'].includes(x.type));
            const q = val => '"' + String(val ?? '').replace(/"/g, '""') + '"';
            const stepTxt = (x, items) => (items || []).map((it, i) => `${x.item} ${i + 1}${it.done ? ' ✔' : ''} : ` + x.fields.map(sf => textOf(sf, it[sf.key], people)).filter(Boolean).join(', ')).join(' | ');
            const lines = [[...cols.map(x => x.label), ...(r.status ? ['Suivi'] : [])].map(q).join(';'), ...rows.map(rec => [...cols.map(x => x.type === 'steps' ? stepTxt(x, rec.data[x.key]) : x.type === 'date' ? rec.data[x.key] : textOf(x, rec.data[x.key], people)), ...(r.status ? [rec.status === 'done' ? r.done : r.todo] : [])].map(q).join(';'))];
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], {type: 'text/csv'})); a.download = (L.name || 'liste').replace(/[^\p{L}\p{N}]+/gu, '-') + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
        });
        ws.querySelector('[data-rv-new]').addEventListener('click', () => { v.edit = 0; go(); });
        ws.querySelectorAll('[data-rv-filter]').forEach(b => b.addEventListener('click', () => { v.filter = b.dataset.rvFilter; go(); }));
        ws.querySelector('[data-rv-q]')?.addEventListener('change', e => { v.q = e.target.value.trim(); go(); });
        ws.querySelector('[data-rv-q]')?.addEventListener('search', e => { v.q = e.target.value.trim(); go(); });
        ws.querySelectorAll('[data-rv-rec]').forEach(card => {
            const rid = Number(card.dataset.rvRec);
            card.querySelector('[data-rv-open]').addEventListener('click', () => { v.open = rid; go(); });
            card.querySelector('[data-rv-status]')?.addEventListener('click', async e => { const status = e.currentTarget.dataset.rvStatus; await api('set_my_list_record_status', {}, {method: 'POST', body: {id: rid, status}}); toast(status === 'done' ? `C’est dans « ${r.done} ».` : `C’est dans « ${r.todo} ».`); go(); });
            card.querySelectorAll('[data-rv-move]').forEach(b => b.addEventListener('click', async () => { await api('move_my_list_record', {}, {method: 'POST', body: {id: rid, direction: Number(b.dataset.rvMove)}}); go(); }));
        });
        const form = ws.querySelector('[data-rv-form]');
        if (form) {
            bindForm(form, d); form.scrollIntoView({block: 'start'});
            form.querySelector('[data-rv-cancel]').addEventListener('click', () => { v.edit = null; go(); });
            form.addEventListener('submit', async e => {
                e.preventDefault();
                const again = e.submitter?.value === 'again';
                const lb = form.querySelector('[data-pending-labels]');
                try {
                    const saved = await api('save_my_list_record', {}, {method: 'POST', body: {list_id: id, id: editing.id, data: readForm(form, d), pending_labels: lb ? (lb.dataset.ids || '').split(',').map(Number).filter(Boolean) : []}});
                    if (ext.uploadMediaEditor) await ext.uploadMediaEditor(form, 'custom_list_record', saved.result.id);
                    toast('Enregistré.');
                    v.edit = again ? 0 : null; if (!again && !editing.id && r.status && v.filter === 'done') v.filter = 'todo';
                    go();
                } catch (error) { toast(error.message, 'error'); }
            });
        }
    };

    /* ─────────── Une fiche ouverte ─────────── */
    function renderRecord(token, id, inLists, data, {reload}) {
        const v = st(), L = data.list, d = L.definition, r = d.record, people = data.people || {};
        const rec = data.rows.find(x => x.id === v.open);
        if (!rec) { v.open = 0; return reload(); }
        const titleField = d.fields.find(x => x.key === r.title) || d.fields.find(x => !['heading', 'steps', 'media'].includes(x.type));
        const title = (titleField && textOf(titleField, rec.data[titleField.key], people)) || `${r.item} sans titre`;
        const done = rec.status === 'done';
        const pts = [], paths = [];
        let body = '', dl = '', heading = '';
        // un titre de section ne s'affiche que si quelque chose de rempli le suit
        const put = html => { if (heading) { body += heading; heading = ''; } body += html; };
        const flush = () => { if (dl) { put(`<dl class="data-list">${dl}</dl>`); dl = ''; } };
        d.fields.forEach(x => {
            if (x.key === titleField?.key) return;
            const val = rec.data[x.key];
            if (x.type === 'heading') { flush(); heading = `<h3 class="h-rec-heading">${esc(x.label)}</h3>`; return; }
            if (x.type === 'media') { flush(); const m = (rec.media || []).filter(mm => (mm.role || '') === x.key); if (m.length && ext.thumbs) put(`<h4>${esc(x.label)}</h4>${ext.thumbs('recd-' + rec.id + x.key, m)}`); return; }
            if (x.type === 'place' && val?.lat !== null && val?.lat !== undefined) pts.push({lat: +val.lat, lon: +val.lon, label: `${x.label} : ${val.text}`, color: '#cc4700'});
            if (x.type === 'steps') {
                flush();
                const items = Array.isArray(val) ? val : [], coords = [];
                items.forEach((it, i) => x.fields.filter(sf => sf.type === 'place').forEach(sf => { const p = it[sf.key]; if (p?.lat !== null && p?.lat !== undefined) { pts.push({lat: +p.lat, lon: +p.lon, label: `${x.item} ${i + 1} : ${p.text}`, n: i + 1}); coords.push([+p.lat, +p.lon]); } }));
                if (coords.length > 1) paths.push({coords, color: '#0066cc', width: 2});
                const ndone = items.filter(it => it.done).length;
                if (!items.length) return;
                put(`<section class="h-rec-steps-view"><h3>${esc(x.label)} <small class="muted">${plural(items.length, 'ligne', 'lignes')}${x.checkable !== false && items.length ? ` · ${fmt(ndone)} faite${ndone > 1 ? 's' : ''}` : ''}</small></h3>${x.checkable !== false && items.length ? `<div class="h-progress"><span style="width:${Math.round(100 * ndone / items.length)}%"></span></div>` : ''}
                    <ol class="h-rec-steplist">${items.map((it, i) => { const rows = x.fields.map(sf => { const h = valueHtml(sf, it[sf.key], people); return h ? `<div class="data-row"><dt>${esc(sf.label)}</dt><dd>${h}</dd></div>` : ''; }).join('');
                        return `<li class="${it.done ? 'is-done' : ''}"><div class="h-rec-step-title">${x.checkable !== false ? `<input type="checkbox" data-rd-step="${esc(x.key)}" data-i="${i}" ${it.done ? 'checked' : ''} title="Fait" aria-label="Fait">` : ''}<strong>${esc(x.item)} ${i + 1}</strong>${it.done ? ' <small class="muted">fait</small>' : ''}</div><dl class="data-list">${rows || '<p class="muted">Vide.</p>'}</dl></li>`; }).join('')}</ol></section>`);
                return;
            }
            const h = valueHtml(x, val, people);
            if (h) dl += `<div class="data-row"><dt>${esc(x.label)}</dt><dd>${h}</dd></div>`;
        });
        flush();
        const ws = A().$('#workspace');
        ws.innerHTML = `<section class="page collection-page h-recs">${header((done && r.status ? r.done : L.name).toUpperCase(), title, (rec.labels?.length ? ext.labelChips(rec.labels) : '') + (done && rec.done_at && r.status ? ` <span class="muted">fait le ${esc(dateFr(String(rec.done_at).slice(0, 10)))}</span>` : ''),
                `<button type="button" class="button secondary" data-rd-back>← ${esc(L.name)}</button><button type="button" class="button secondary" data-rd-edit>Modifier</button>${r.status ? `<button type="button" class="button secondary" data-rd-status="${done ? 'todo' : 'done'}">${done ? 'Remettre ' + esc(r.todo.toLowerCase()) : esc(r.mark)}</button>` : ''}<button type="button" class="button secondary" data-rd-print>Imprimer</button><button type="button" class="button secondary danger" data-rd-del>Supprimer</button>`)}
            ${r.map && pts.length && ext.miniMap ? `<section class="maintenance-panel">${ext.miniMap(pts, paths, {height: 340})}</section>` : ''}
            <article class="maintenance-panel h-rec-detail">${body || '<p class="muted">Rien d’autre de rempli.</p>'}</article></section>`;
        A().bindTableLinks?.();
        ws.querySelector('[data-rd-back]').addEventListener('click', () => { v.open = 0; reload(); });
        ws.querySelector('[data-rd-edit]').addEventListener('click', () => { v.open = 0; v.edit = rec.id; reload(); });
        ws.querySelector('[data-rd-print]').addEventListener('click', () => window.print());
        ws.querySelector('[data-rd-status]')?.addEventListener('click', async e => { await api('set_my_list_record_status', {}, {method: 'POST', body: {id: rec.id, status: e.currentTarget.dataset.rdStatus}}); reload(); });
        ws.querySelector('[data-rd-del]').addEventListener('click', async () => { if (!await A().confirmBox(`Supprimer « ${title} » ?`, {title: 'Supprimer la fiche', okLabel: 'Supprimer la fiche'})) return; await api('delete_my_list_record', {}, {method: 'POST', body: {id: rec.id}}); toast('Fiche supprimée.'); v.open = 0; reload(); });
        ws.querySelectorAll('[data-rd-step]').forEach(c => c.addEventListener('change', async () => {
            try { await api('set_my_list_record_step', {}, {method: 'POST', body: {id: rec.id, field: c.dataset.rdStep, index: Number(c.dataset.i), done: c.checked ? 1 : 0}}); reload(); }
            catch (error) { toast(error.message, 'error'); c.checked = !c.checked; }
        }));
    }
})();
