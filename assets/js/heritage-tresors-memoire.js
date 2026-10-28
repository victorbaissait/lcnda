/**
 * ✨ Trésors — 🕯️ Garder la mémoire :
 *  - ✉️ Lettres aux descendants (capsule temporelle) : un texte, un son ou une vidéo qui ne s'ouvre qu'à une date — choisie,
 *    ou « aux N ans de » quelqu'un. Scellée, la lettre ne montre que pour qui, de qui et quand (le serveur garde le texte).
 *  - 👃 Souvenirs des sens, 🥘 livre de recettes, 🎶 chansons de la famille : une collection commune (formulaire, filtre, recherche),
 *    les deux derniers s'impriment en livre (couverture, sommaire, une page chacun).
 *  - 🎙️ L'entretien guidé : questions par thème lues à voix haute, enregistrement au micro rangé sur la fiche, un repère par question.
 *  - 🕯️ La veillée : en plein écran, les vies d'une branche racontées à voix haute, musique douce synthétisée.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const F = ext.tresorFeatures = ext.tresorFeatures || [];
    const P = () => window.LCNDA_PICKER;
    const today = () => new Date().toISOString().slice(0, 10);
    const daysTo = d => Math.ceil((new Date(d + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000);
    const humanWait = n => n <= 0 ? 'aujourd’hui' : n < 60 ? `dans ${n} jour${n > 1 ? 's' : ''}` : n < 730 ? `dans ${Math.round(n / 30.4)} mois` : `dans ${Math.round(n / 365.25)} ans`;

    /* ── ✉️ Lettres aux descendants ── */
    async function mediaHtml(T, ids) {
        if (!ids?.length) return '';
        const r = await T.api('tresor_media', {ids: ids.join(',')}).catch(() => ({media: []}));
        return (r.media || []).map(m => { const src = `media/${encodeURIComponent(m.filename)}`, t = m.media_type;
            return t === 'audio' ? `<audio controls preload="none" src="${src}"></audio>` : t === 'video' ? `<video controls preload="none" src="${src}" style="max-width:100%"></video>` : `<img src="${src}" alt="${T.esc(m.title || '')}" style="max-width:100%;border-radius:8px">`; }).join('');
    }
    function letterForm(T, it, tr) {
        const d = it?.data || {};
        return `<div class="form-grid">
            <div class="span-2"><span class="pk-lab">De la part de (une fiche, ou un nom)</span>${P().pickerField({name: 'from', kind: 'person', allowFree: true, value: d.from ?? null})}</div>
            <label class="span-2">Pour (ex. « Léa », « mes petits-enfants », « celui qui reprendra la maison »)<input name="to" maxlength="200" value="${T.esc(d.to || '')}"></label>
            <label>S’ouvre<select name="when"><option value="date" ${d.when !== 'age' ? 'selected' : ''}>à une date</option><option value="age" ${d.when === 'age' ? 'selected' : ''}>à un anniversaire</option></select></label>
            <label data-w="date">Le<input type="date" name="open_at" value="${T.esc(it?.open_at || '')}" min="${today()}"></label>
            <div class="span-2" data-w="age"><span class="pk-lab">L’anniversaire de</span>${P().pickerField({name: 'for_person', kind: 'person', value: d.for_person ?? null})}</div>
            <label data-w="age">À ses<input type="number" name="age" min="1" max="120" value="${T.esc(d.age || 18)}" data-unit="ans"></label>
            <label class="span-2">Titre<input name="title" maxlength="200" value="${T.esc(it?.title || '')}" placeholder="Pour tes 18 ans"></label>
            <label class="span-2">La lettre<textarea name="body" rows="10" placeholder="${it?.sealed ? 'Scellée : laisse vide pour garder le texte d’origine' : 'Écris ici…'}">${it?.sealed ? '' : T.esc(it?.body || '')}</textarea></label>
            <div class="span-2"><span class="pk-lab">Un son, une vidéo ou une photo (facultatif)</span>${P().mediaField({name: 'media_ids', multiple: true, value: d.media || []})}</div>
        </div>`;
        void tr;
    }
    /** la date d'ouverture « aux N ans de » quelqu'un : son anniversaire cette année-là */
    const ageDate = (p, age) => { if (!p?.by) return ''; const md = p.bd ? p.bd.slice(4) : '-01-01'; return `${String(p.by + age).padStart(4, '0')}${md}`; };
    function editLetter(T, it, after) {
        T.tree().then(tr => ext.openDialog({eyebrow: 'LETTRE AUX DESCENDANTS', title: it ? '✉️ La lettre' : '✉️ Nouvelle lettre', wide: true, submitLabel: it ? 'Enregistrer' : '🔒 Sceller la lettre', body: letterForm(T, it, tr),
            onOpen: dl => { const sync = () => { const w = dl.querySelector('[name=when]').value; dl.querySelectorAll('[data-w]').forEach(x => { x.hidden = x.dataset.w !== w; }); }; dl.querySelector('[name=when]').addEventListener('change', sync); sync(); },
            onSubmit: async form => {
                const v = k => form.elements[k]?.value || '', when = v('when');
                let open = v('open_at');
                if (when === 'age') { const p = tr.byId.get(Number(v('for_person'))); if (!p?.by) return T.fail(form.elements.for_person, 'Choisis une personne dont on connaît la naissance.'); open = ageDate(p, Number(v('age')) || 18); }
                if (!open) return T.fail(form.elements.open_at, 'Choisis le jour où la lettre s’ouvrira.');
                if (!it && open <= today()) return T.fail(when === 'age' ? form.elements.age : form.elements.open_at, 'La date doit être dans le futur (sinon ce n’est plus une surprise).');
                if (!it && !v('body').trim() && !v('media_ids')) return T.fail(form.elements.body, 'Écris quelque chose ou joins un son, une vidéo ou une photo.');
                const from = v('from'), media = v('media_ids') ? v('media_ids').split(',').map(Number).filter(Boolean) : [];
                const pid = /^\d+$/.test(from) ? Number(from) : (when === 'age' ? Number(v('for_person')) : 0);
                await T.save({id: it?.id, kind: 'letter', person_id: pid || null, title: v('title') || (when === 'age' ? `Pour ses ${v('age')} ans` : 'Lettre'), body: v('body'), open_at: open,
                    data: {from, to: v('to'), when, for_person: Number(v('for_person')) || null, age: Number(v('age')) || null, media, occasion: when === 'age' ? `à ses ${v('age')} ans` : ''}});
                T.toast(it ? 'Lettre enregistrée.' : `🔒 Lettre scellée : elle s’ouvrira le ${T.dateFr(open)}.`, 'success'); after();
            }}));
    }
    async function renderLetters(host, T) {
        const tr = await T.tree();
        const draw = async () => {
            const list = await T.items('letter'), who = v => (/^\d+$/.test(String(v || '')) ? T.name(tr.byId.get(Number(v))) : String(v || '').replace(/^txt:/, '')) || 'Quelqu’un';
            const open = list.filter(x => !x.sealed), sealed = list.filter(x => x.sealed).sort((a, b) => a.open_at.localeCompare(b.open_at));
            host.innerHTML = `<div class="h-tr-row h-tr-noprint"><span class="h-tr-muted">${sealed.length} scellée${sealed.length > 1 ? 's' : ''} · ${open.length} ouverte${open.length > 1 ? 's' : ''}</span></div>
                ${sealed.length ? `<h3>🔒 En attente</h3><div class="h-tr-cards">${sealed.map(x => `<div class="h-tr-sealed"><span style="font-size:34px">✉️</span><b>${T.esc(x.title)}</b><small>De ${T.esc(who(x.data?.from))}${x.data?.to ? ` pour ${T.esc(x.data.to)}` : ''}</small><span class="h-tr-pill">s’ouvre le ${T.esc(T.dateFr(x.open_at))} · ${humanWait(daysTo(x.open_at))}</span><span><button type="button" class="h-tr-link" data-l-edit="${x.id}">Modifier</button> · <button type="button" class="h-tr-link" data-l-del="${x.id}">Supprimer</button></span></div>`).join('')}</div>` : ''}
                <h3>📬 Ouvertes</h3>${open.length ? (await Promise.all(open.map(async x => `<article class="h-tr-panel h-tr-print"><div class="h-tr-row" style="justify-content:space-between"><div><b>${T.esc(x.title)}</b><br><small class="h-tr-muted">De ${T.esc(who(x.data?.from))}${x.data?.to ? ` · pour ${T.esc(x.data.to)}` : ''} · ${T.when(x.created_at, {label: 'écrite'})}${x.open_at ? ` · ouverte le ${T.esc(T.dateFr(x.open_at))}` : ''}</small></div><span class="h-tr-noprint"><button type="button" class="h-tr-link" data-l-edit="${x.id}">Modifier</button> · <button type="button" class="h-tr-link" data-l-del="${x.id}">Supprimer</button></span></div>${x.body ? `<div class="h-tr-letter">${T.esc(x.body)}</div>` : ''}${await mediaHtml(T, x.data?.media)}</article>`))).join('') : T.empty('Aucune lettre ouverte pour l’instant', {icon: '📬', hint: 'Une lettre scellée s’ouvre toute seule le jour venu.'})}`;
        };
        host.addEventListener('click', async e => {
            const ed = e.target.closest('[data-l-edit]'); if (ed) { const it = (await T.items('letter')).find(x => x.id === Number(ed.dataset.lEdit)); return editLetter(T, it, draw); }
            const del = e.target.closest('[data-l-del]'); if (del && await window.LCNDA_APP.confirmBox('La lettre sera effacée pour de bon.', {title: 'Supprimer la lettre ?', okLabel: 'Supprimer', danger: true})) { await T.remove(Number(del.dataset.lDel)); draw(); }
        });
        T.actions(host, {primary: {label: '✉️ Écrire une lettre', attrs: 'data-l-new', run: () => editLetter(T, null, draw)}});
        await draw();
    }
    F.push({key: 'lettres', group: 'memoire', icon: '✉️', title: 'Lettres aux descendants', desc: 'Un texte, un son ou une vidéo qui ne s’ouvre qu’à une date : « pour les 18 ans de Léa », « en 2050 ».', render: renderLetters});
    ext.tresorLetters = {ageDate, editLetter};

    /* ── Une collection d'éléments gardés (souvenirs des sens, recettes, chansons) : le formulaire, la liste, le livre ── */
    const A = () => window.LCNDA_APP;
    const who = (T, tr, v) => (/^\d+$/.test(String(v ?? '')) ? T.name(tr.byId.get(Number(v))) : String(v || '').replace(/^txt:/, ''));
    function fieldHtml(T, f, it) {
        const d = it?.data || {}, val = f.k === 'title' ? it?.title : f.k === 'body' ? it?.body : d[f.k], cls = f.wide ? 'span-2' : '';
        if (f.type === 'person') return `<div class="${cls}"><span class="pk-lab">${T.esc(f.label)}</span>${P().pickerField({name: f.k, kind: 'person', allowFree: true, value: val ?? null})}</div>`;
        if (f.type === 'media') return `<div class="span-2"><span class="pk-lab">${T.esc(f.label)}</span>${P().mediaField({name: f.k, multiple: true, value: val || []})}</div>`;
        if (f.type === 'select') return `<label class="${cls}">${T.esc(f.label)}<select name="${f.k}">${f.options.map(([v, l]) => `<option value="${v}" ${String(val ?? f.options[0][0]) === v ? 'selected' : ''}>${T.esc(l)}</option>`).join('')}</select></label>`;
        if (f.type === 'textarea') return `<label class="span-2">${T.esc(f.label)}<textarea name="${f.k}" rows="${f.rows || 5}" placeholder="${T.esc(f.ph || '')}">${T.esc(val || '')}</textarea></label>`;
        return `<label class="${cls}">${T.esc(f.label)}<input name="${f.k}" maxlength="300" value="${T.esc(val ?? '')}" placeholder="${T.esc(f.ph || '')}"></label>`;
    }
    /** où sont rangés les éléments : la Mémoire familiale pour les recettes, chansons et souvenirs (cfg.mem), sinon les Trésors */
    const store = (T, cfg) => cfg.mem ? {items: () => T.api('tresor_memories', {kind: cfg.kind}).then(r => r.items || []), save: item => T.post('tresor_memory_write', {op: 'save', item}), remove: id => T.post('tresor_memory_write', {op: 'delete', id})}
        : {items: () => T.items(cfg.kind), save: item => T.save(item), remove: id => T.remove(id)};
    function editItem(T, cfg, it, after) {
        ext.openDialog({eyebrow: cfg.eyebrow, title: it ? `${cfg.icon} ${it.title}` : `${cfg.icon} ${cfg.newLabel}`, wide: true, submitLabel: 'Enregistrer',
            body: `<div class="form-grid">${cfg.fields.map(f => fieldHtml(T, f, it)).join('')}</div>`,
            onSubmit: async form => {
                const v = k => form.elements[k]?.value ?? '', data = {...(it?.data || {})};
                if (!v('title').trim()) return T.fail(form.elements.title, cfg.needTitle || 'Donne-lui un titre.');
                cfg.fields.forEach(f => { if (f.k !== 'title' && f.k !== 'body') data[f.k] = f.type === 'media' ? (v(f.k) ? v(f.k).split(',').map(Number).filter(Boolean) : []) : v(f.k); });
                const pv = String(data[cfg.personKey || 'from'] || '');
                await store(T, cfg).save({id: it?.id, kind: cfg.kind, person_id: /^\d+$/.test(pv) ? Number(pv) : null, title: v('title').trim(), body: v('body'), data});
                T.toast('Enregistré.', 'success'); after();
            }});
    }
    async function renderCollection(host, T, cfg) {
        const tr = await T.tree(); let q = '', filt = '', all = [];
        host.innerHTML = `<div class="h-tr-row h-tr-noprint"><label>Chercher<input type="search" data-c-q placeholder="un mot, un nom…"></label>
            ${cfg.filter ? `<label>${T.esc(cfg.filter.label)}<select data-c-f><option value="">Tous</option>${cfg.filter.options.map(([v, l]) => `<option value="${v}">${T.esc(l)}</option>`).join('')}</select></label>` : ''}
            <span class="h-tr-muted" data-c-n></span></div>
            ${cfg.intro ? `<p class="h-tr-muted h-tr-noprint">${cfg.intro}</p>` : ''}<div class="h-tr-body" data-c-list></div>`;
        const list = host.querySelector('[data-c-list]');
        const paint = async () => {
            const vis = all.filter(x => (!filt || x.data?.[cfg.filter.key] === filt) && (!q || `${x.title} ${x.body} ${Object.values(x.data || {}).join(' ')} ${who(T, tr, x.data?.[cfg.personKey || 'from'])}`.toLowerCase().includes(q)));
            host.querySelector('[data-c-n]').textContent = `${vis.length} sur ${all.length}`;
            list.innerHTML = vis.length ? (await Promise.all(vis.map(async x => `<article class="h-tr-panel h-tr-print" data-c-id="${x.id}">${cfg.card(T, tr, x)}${await mediaHtml(T, x.data?.media)}<p class="h-tr-noprint" style="margin:8px 0 0"><button type="button" class="h-tr-link" data-c-edit="${x.id}">Modifier</button> · <button type="button" class="h-tr-link" data-c-del="${x.id}">Supprimer</button></p></article>`))).join('') : T.empty(all.length ? 'Rien ne correspond à ta recherche' : cfg.empty, {icon: cfg.icon});
        };
        /** « 🖨 Imprimer » le livre : grisé (C8) tant qu'il n'y a rien à mettre dedans */
        const bookState = () => { const bk = host.closest('.h-tr-page')?.querySelector('[data-c-book]'); if (!bk) return; bk.disabled = !all.length; bk.setAttribute('aria-disabled', String(!all.length)); bk.title = all.length ? `${cfg.book.label} : couverture, sommaire, une page chacun` : `Rien à mettre dans le livre pour l’instant : commence par « ＋ ${cfg.newLabel} ».`; };
        const load = async () => { all = await store(T, cfg).items(); await paint(); if (cfg.book) bookState(); };
        host.querySelector('[data-c-q]').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); paint(); });
        host.querySelector('[data-c-f]')?.addEventListener('change', e => { filt = e.target.value; paint(); });
        host.addEventListener('click', async e => {
            const ed = e.target.closest('[data-c-edit]'); if (ed) return editItem(T, cfg, all.find(x => String(x.id) === ed.dataset.cEdit), load);
            const del = e.target.closest('[data-c-del]'); if (del && await A().confirmBox('Cet élément sera effacé pour de bon.', {title: 'Supprimer ?', okLabel: 'Supprimer', danger: true})) { await store(T, cfg).remove(cfg.mem ? del.dataset.cDel : Number(del.dataset.cDel)); load(); }
        });
        T.actions(host, {primary: {label: `＋ ${cfg.newLabel}`, attrs: 'data-c-new', run: () => editItem(T, cfg, null, load)},
            print: cfg.book ? {label: cfg.book.label, attrs: 'data-c-book', title: `${cfg.book.label} : couverture, sommaire, une page chacun`, run: async () => { if (!all.length) return T.toast('Rien à mettre dans le livre pour l’instant.'); await cfg.book.print(T, tr, all); }} : null,
            more: cfg.mem ? [{label: '📋 Voir dans Listes › Mémoire familiale', attrs: 'data-c-memlist', title: 'Rangé avec les expressions, surnoms, traditions et témoignages', run: () => { A().state.listType = 'family_memories'; A().setModule('listes'); }}] : []});
        await load();
    }
    /** un livre à imprimer (recettes, chansons) : couverture, sommaire par rubrique, une page par élément */
    async function printBook(T, tr, items, {title, sub, group, groups, page}) {
        const ids = [...new Set(items.flatMap(x => x.data?.media || []))], media = new Map();
        if (ids.length) ((await T.api('tresor_media', {ids: ids.join(',')}).catch(() => ({}))).media || []).forEach(m => media.set(Number(m.id), m));
        const img = x => (x.data?.media || []).map(id => media.get(Number(id))).filter(m => m?.media_type === 'image').slice(0, 1).map(m => `<img src="media/${encodeURIComponent(m.filename)}" alt="">`).join('');
        const by = groups.map(([k, l]) => [l, items.filter(x => (x.data?.[group] || groups[groups.length - 1][0]) === k)]).filter(([, l]) => l.length);
        const st = T.start(tr), fam = st?.last ? `de la famille ${st.last}` : 'de la famille';
        ext.tresorPrint(title, `.pg{width:190mm;min-height:270mm;margin:10mm auto;padding:16mm;box-sizing:border-box;background:#fffdf7;color:#2a2016;font-family:Georgia,serif;page-break-after:always;box-shadow:0 2px 12px #0004}.cover{display:flex;flex-direction:column;justify-content:center;text-align:center;border:3px double #8a6b3a}.cover h1{font-size:34pt;margin:0 0 8mm}.toc li{margin:2mm 0}h2{font-size:20pt;border-bottom:1px solid #c9b48a;padding-bottom:2mm}h3{color:#8a6b3a;font-size:11pt;text-transform:uppercase;letter-spacing:.08em}.pg img{max-width:100%;max-height:80mm;display:block;margin:4mm auto;border-radius:3mm}.txt{white-space:pre-wrap;line-height:1.6}.story{font-style:italic;color:#5a4a33;border-left:3px solid #c9b48a;padding-left:4mm}ul.ing{columns:2}@media print{.pg{margin:0;box-shadow:none}}`,
            `<section class="pg cover"><h1>${T.esc(title)}</h1><p style="font-size:16pt">${T.esc(fam)}</p><p>${T.esc(sub)}</p><p style="margin-top:20mm">${new Date().getFullYear()}</p></section>
             <section class="pg"><h2>Sommaire</h2>${by.map(([l, list]) => `<h3>${T.esc(l)}</h3><ol class="toc">${list.map(x => `<li>${T.esc(x.title)}${who(T, tr, x.data?.from) ? ` — ${T.esc(who(T, tr, x.data.from))}` : ''}</li>`).join('')}</ol>`).join('')}</section>
             ${by.map(([l, list]) => list.map(x => `<section class="pg"><h3>${T.esc(l)}</h3><h2>${T.esc(x.title)}</h2>${img(x)}${page(T, tr, x)}</section>`).join('')).join('')}`);
    }

    /* ── 👃 Souvenirs des sens ── */
    const SENSES = [['odeur', '👃 Une odeur'], ['son', '👂 Un son'], ['gout', '👅 Un goût'], ['toucher', '✋ Au toucher'], ['image', '👁 Une image']];
    const senseCfg = {kind: 'sense', mem: true, icon: '👃', eyebrow: 'SOUVENIR DES SENS', newLabel: 'Noter un souvenir', personKey: 'from', empty: 'Aucun souvenir noté pour l’instant : l’odeur de la cire dans l’escalier, le bruit du moulin, le goût des confitures de Mémé…',
        intro: 'Les souvenirs qui ne tiennent dans aucun acte : une odeur, un bruit, un goût. Joins-y un son enregistré ou une photo si tu en as.',
        filter: {key: 'sense', label: 'Le sens', options: SENSES},
        fields: [{k: 'sense', type: 'select', label: 'Le sens', options: SENSES}, {k: 'title', label: 'Le souvenir en quelques mots', ph: 'L’odeur de la cire dans l’escalier', wide: true},
            {k: 'from', type: 'person', label: 'Ça rappelle (une fiche, ou un nom)'}, {k: 'place', label: 'Où', ph: 'la maison de Naves'}, {k: 'when', label: 'Quand', ph: 'vers 1950, l’été'},
            {k: 'body', type: 'textarea', label: 'Raconte', ph: 'Chaque samedi, elle cirait les marches…'}, {k: 'media', type: 'media', label: 'Un son, une photo (facultatif)'}],
        card: (T, tr, x) => { const s = SENSES.find(z => z[0] === x.data?.sense) || SENSES[0], meta = [who(T, tr, x.data?.from) && `ça rappelle ${who(T, tr, x.data.from)}`, x.data?.place, x.data?.when].filter(Boolean);
            return `<div class="h-tr-row" style="justify-content:space-between"><b style="font-size:17px">${s[1].split(' ')[0]} ${T.esc(x.title)}</b><span class="h-tr-pill">${T.esc(s[1].replace(/^\S+\s/, ''))}</span></div>${meta.length ? `<small class="h-tr-muted">${T.esc(meta.join(' · '))}</small>` : ''}${x.body ? `<div class="h-tr-letter" style="margin-top:8px">${T.esc(x.body)}</div>` : ''}`; }};
    F.push({key: 'sens', group: 'memoire', icon: '👃', title: 'Souvenirs des sens', desc: 'L’odeur de la cire, le bruit du moulin, le goût des confitures : ce qu’aucun acte ne garde.', render: (h, T) => renderCollection(h, T, senseCfg)});

    /* ── 🥘 Le livre de recettes ── */
    const DISHES = [['entree', 'Entrées et soupes'], ['plat', 'Plats'], ['dessert', 'Desserts et gâteaux'], ['conserve', 'Confitures et conserves'], ['boisson', 'Boissons'], ['autre', 'Autres']];
    const lines = s => String(s || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
    const recipePage = (T, tr, x) => `${who(T, tr, x.data?.from) ? `<p><b>La recette de ${T.esc(who(T, tr, x.data.from))}</b>${x.data?.serves ? ` · ${T.esc(x.data.serves)}` : ''}</p>` : x.data?.serves ? `<p>${T.esc(x.data.serves)}</p>` : ''}
        ${lines(x.data?.ingredients).length ? `<h3>Ingrédients</h3><ul class="ing">${lines(x.data.ingredients).map(i => `<li>${T.esc(i)}</li>`).join('')}</ul>` : ''}${x.body ? `<h3>Préparation</h3><div class="txt">${T.esc(x.body)}</div>` : ''}${x.data?.story ? `<h3>Son histoire</h3><p class="story">${T.esc(x.data.story)}</p>` : ''}`;
    const recipeCfg = {kind: 'recipe', mem: true, icon: '🥘', eyebrow: 'LIVRE DE RECETTES', newLabel: 'Ajouter une recette', personKey: 'from', empty: 'Aucune recette pour l’instant : le far de Mamie, la soupe aux choux du dimanche…',
        filter: {key: 'dish', label: 'Rubrique', options: DISHES},
        fields: [{k: 'title', label: 'Le nom de la recette', ph: 'Le clafoutis de Rose', wide: true}, {k: 'from', type: 'person', label: 'La recette de (une fiche, ou un nom)'}, {k: 'dish', type: 'select', label: 'Rubrique', options: DISHES},
            {k: 'serves', label: 'Pour combien', ph: 'pour 6'}, {k: 'ingredients', type: 'textarea', label: 'Les ingrédients (un par ligne)', rows: 6, ph: '500 g de cerises noires\n3 œufs'},
            {k: 'body', type: 'textarea', label: 'La préparation', rows: 8}, {k: 'story', type: 'textarea', label: 'Son histoire (d’où elle vient, quand on la faisait)', rows: 3}, {k: 'media', type: 'media', label: 'Une photo du plat ou de la fiche écrite à la main'}],
        card: (T, tr, x) => `<h3 style="margin:0">${T.esc(x.title)}</h3>${recipePage(T, tr, x).replace(/<h3>/g, '<h4 style="margin:10px 0 4px">').replace(/<\/h3>/g, '</h4>').replace('class="txt"', 'class="h-tr-letter"')}`,
        book: {label: 'Imprimer le livre', print: (T, tr, all) => printBook(T, tr, all, {title: 'Le livre de recettes', sub: `${all.length} recette${all.length > 1 ? 's' : ''} transmise${all.length > 1 ? 's' : ''}`, group: 'dish', groups: DISHES, page: recipePage})}};
    F.push({key: 'recettes', group: 'memoire', icon: '🥘', title: 'Le livre de recettes', desc: 'Les recettes de la famille, avec qui les faisait et leur histoire, puis un vrai livre à imprimer.', render: (h, T) => renderCollection(h, T, recipeCfg)});

    /* ── 🎶 Les chansons de la famille ── */
    const SONG = [['berceuse', 'Berceuses'], ['fete', 'Chansons de fête et de repas'], ['mariage', 'Mariages'], ['travail', 'Chansons de travail'], ['conscrits', 'Conscrits et soldats'], ['noel', 'Noël'], ['patois', 'En patois'], ['autre', 'Autres']];
    const songPage = (T, tr, x) => `<p>${[who(T, tr, x.data?.from) && `Chantée par <b>${T.esc(who(T, tr, x.data.from))}</b>`, x.data?.tune && `sur l’air de « ${T.esc(x.data.tune)} »`].filter(Boolean).join(', ')}</p>${x.body ? `<div class="txt" style="font-size:13pt">${T.esc(x.body)}</div>` : ''}${x.data?.story ? `<p class="story">${T.esc(x.data.story)}</p>` : ''}`;
    const songCfg = {kind: 'song', mem: true, icon: '🎶', eyebrow: 'CHANSONS DE LA FAMILLE', newLabel: 'Ajouter une chanson', personKey: 'from', empty: 'Aucune chanson pour l’instant : la berceuse de Mémé, la chanson des fins de banquet…',
        intro: 'Les paroles, l’air, qui la chantait — et, si tu peux, l’enregistrement (un son choisi dans les médias).', filter: {key: 'occasion', label: 'Sorte', options: SONG},
        fields: [{k: 'title', label: 'Le titre (ou le premier vers)', wide: true}, {k: 'from', type: 'person', label: 'Chantée par (une fiche, ou un nom)'}, {k: 'occasion', type: 'select', label: 'Sorte', options: SONG},
            {k: 'tune', label: 'Sur l’air de', ph: 'Cadet Rousselle'}, {k: 'body', type: 'textarea', label: 'Les paroles', rows: 10}, {k: 'story', type: 'textarea', label: 'Quand on la chantait', rows: 3}, {k: 'media', type: 'media', label: 'L’enregistrement (son ou vidéo)'}],
        card: (T, tr, x) => `<h3 style="margin:0">🎶 ${T.esc(x.title)}</h3>${songPage(T, tr, x).replace('class="txt" style="font-size:13pt"', 'class="h-tr-letter"').replace('class="story"', 'class="h-tr-muted"')}`,
        book: {label: 'Imprimer le carnet', print: (T, tr, all) => printBook(T, tr, all, {title: 'Le carnet de chansons', sub: `${all.length} chanson${all.length > 1 ? 's' : ''} de la famille`, group: 'occasion', groups: SONG, page: songPage})}};
    F.push({key: 'chansons', group: 'memoire', icon: '🎶', title: 'Les chansons de la famille', desc: 'Berceuses, chansons de banquet, de conscrits : paroles, air, qui la chantait, l’enregistrement, et un carnet à imprimer.', render: (h, T) => renderCollection(h, T, songCfg)});
    ext.tresorCollections = {renderCollection, senseCfg, recipeCfg, songCfg};

    /* ── 🎙️ L'entretien guidé ── */
    const THEMES = {
        enfance: ['Où es-tu né·e, et dans quelle maison as-tu grandi ?', 'Raconte-moi une journée ordinaire quand tu avais dix ans.', 'À quoi jouais-tu, et avec qui ?', 'Quelle odeur ou quel bruit te ramène tout de suite à ton enfance ?', 'Qui était la personne la plus importante pour toi, petit·e ?'],
        ecole: ['Comment allais-tu à l’école ?', 'Te souviens-tu de ton maître ou de ta maîtresse ?', 'Qu’est-ce qu’on apprenait par cœur ?', 'Jusqu’à quel âge es-tu allé·e à l’école, et pourquoi ?'],
        famille: ['Que sais-tu de tes grands-parents ?', 'Y avait-il des histoires qu’on se racontait toujours dans la famille ?', 'Quels étaient les métiers de tes parents ?', 'Y a-t-il un secret ou une brouille dont on parlait à voix basse ?', 'Quels prénoms revenaient dans la famille, et pourquoi ?'],
        travail: ['Quel a été ton premier travail, et combien gagnais-tu ?', 'Raconte une journée de travail.', 'De quoi es-tu le plus fier ou la plus fière dans ton métier ?', 'Quel outil ou quel geste te reste dans les mains ?'],
        amour: ['Comment as-tu rencontré ton mari, ta femme, ton amour ?', 'Comment s’est passé le mariage ?', 'Où avez-vous habité au début ?'],
        guerre: ['Où étais-tu pendant la guerre ?', 'Qu’est-ce qui manquait le plus ?', 'Qui est parti, et qui est revenu ?', 'Y a-t-il un jour que tu n’as jamais oublié ?'],
        maison: ['Décris-moi la maison : les pièces, la cuisine, le jardin.', 'Comment se chauffait-on, comment s’éclairait-on ?', 'Qu’est-ce qu’on mangeait le dimanche ?'],
        fetes: ['Comment fêtait-on Noël ?', 'Quelles étaient les fêtes du village ?', 'Quelle chanson chantait-on à la fin des repas ?'],
        conseils: ['Qu’est-ce que tu aimerais que tes arrière-petits-enfants sachent de toi ?', 'Quel conseil donnerais-tu à quelqu’un de vingt ans ?', 'Qu’est-ce qui a le plus changé dans ta vie ?']};
    const THEME_LABEL = {enfance: '🧒 L’enfance', ecole: '✏️ L’école', famille: '👪 La famille', travail: '🔨 Le travail', amour: '💞 L’amour', guerre: '🪖 La guerre', maison: '🏡 La maison', fetes: '🎉 Les fêtes', conseils: '💬 Pour plus tard'};
    const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    async function renderInterview(host, T) {
        const tr = await T.tree();
        host.innerHTML = `<form class="h-tr-panel" data-iv-form><p class="h-tr-muted">Les questions s’affichent en grand (et peuvent être lues à voix haute) ; l’entretien s’enregistre au micro, chaque question est marquée dans l’enregistrement, puis le son est rangé dans les médias de la fiche.</p>
            <div class="h-tr-row"><div style="min-width:260px"><span class="pk-lab">La personne interrogée</span>${T.personField('who', null)}</div>
            <label class="checkbox-line"><input type="checkbox" name="speak" checked> Lire les questions à voix haute</label><label class="checkbox-line"><input type="checkbox" name="rec" checked> Enregistrer au micro</label></div>
            <fieldset style="margin-top:8px"><legend><b>Les thèmes</b></legend><div class="h-tr-row">${Object.keys(THEMES).map((k, i) => `<label class="checkbox-line"><input type="checkbox" name="th" value="${k}" ${i < 3 ? 'checked' : ''}> ${THEME_LABEL[k]} <small class="h-tr-muted">(${THEMES[k].length})</small></label>`).join('')}</div></fieldset>
</form>
            <div data-iv-live></div><h3>Les entretiens enregistrés</h3><div data-iv-list></div>`;
        const form = host.querySelector('[data-iv-form]'), live = host.querySelector('[data-iv-live]'), listEl = host.querySelector('[data-iv-list]');
        const questions = () => { const p = tr.byId.get(Number(form.elements.who.value)), fem = p?.gender === 'female'; return [...form.querySelectorAll('[name=th]:checked')].flatMap(i => THEMES[i.value].map(q => ({th: i.value, q: q.replace(/·e/g, fem ? 'e' : '').replace(/ ou la plus fière/, '')}))); };
        const drawList = async () => {
            const its = await T.items('interview');
            listEl.innerHTML = its.length ? (await Promise.all(its.map(async x => { const m = x.data?.media_id ? ((await T.api('tresor_media', {ids: x.data.media_id}).catch(() => ({}))).media || [])[0] : null;
                return `<article class="h-tr-panel" data-iv-item="${x.id}"><div class="h-tr-row" style="justify-content:space-between"><b>🎙️ ${T.esc(x.title)}</b><small class="h-tr-muted">${T.when(x.created_at)}${x.data?.duration ? ` · ${mmss(x.data.duration)}` : ''}</small></div>
                    ${m ? `<audio controls preload="metadata" src="media/${encodeURIComponent(m.filename)}" style="width:100%;margin:8px 0"></audio>` : T.empty('Sans enregistrement', {icon: '🔇'})}
                    <ol class="h-tr-chap">${(x.data?.chapters || []).map(c => `<li><button type="button" class="h-tr-link" data-iv-seek="${Number(c.t) || 0}">${mmss(Number(c.t) || 0)}</button> ${T.esc(c.q)}${c.note ? `<br><small class="h-tr-muted">${T.esc(c.note)}</small>` : ''}</li>`).join('')}</ol>
                    <button type="button" class="h-tr-link" data-iv-del="${x.id}">Supprimer la fiche de l’entretien</button> <small class="h-tr-muted">(le son reste dans les médias)</small></article>`; }))).join('') : T.empty('Aucun entretien pour l’instant', {icon: '🎙️', hint: 'Choisis la personne et les thèmes, puis « 🎙️ Commencer l’entretien ».'});
        };
        host.addEventListener('click', async e => {
            const sk = e.target.closest('[data-iv-seek]'); if (sk) { const au = sk.closest('[data-iv-item]').querySelector('audio'); if (au) { au.currentTime = Number(sk.dataset.ivSeek); au.play().catch(() => {}); } return; }
            const del = e.target.closest('[data-iv-del]'); if (del && await A().confirmBox('La fiche de l’entretien (les questions et les repères) sera effacée ; le son reste dans les médias.', {title: 'Supprimer ?', okLabel: 'Supprimer', danger: true})) { await T.remove(Number(del.dataset.ivDel)); drawList(); return; }
        });
        const paper = () => { const qs = questions(), p = tr.byId.get(Number(form.elements.who.value));
                ext.tresorPrint('Entretien', 'section{max-width:180mm;margin:10mm auto;background:#fff;padding:14mm;font-family:Georgia,serif}li{margin:0 0 22mm}h2{font-size:13pt;color:#8a6b3a;text-transform:uppercase}', `<section><h1>Entretien${p ? ` avec ${T.esc(T.name(p))}` : ''}</h1><p>Le ${new Date().toLocaleDateString('fr-FR')}</p>${Object.keys(THEMES).filter(k => qs.some(q => q.th === k)).map(k => `<h2>${THEME_LABEL[k]}</h2><ol>${qs.filter(q => q.th === k).map(q => `<li>${T.esc(q.q)}</li>`).join('')}</ol>`).join('')}</section>`); };
        T.actions(host, {primary: {label: '🎙️ Commencer l’entretien', attrs: 'data-iv-go', run: () => { if (!form.hidden) form.requestSubmit(); }}, print: {attrs: 'data-iv-paper', title: 'Les questions sur papier, avec la place pour noter les réponses', run: paper}});
        form.addEventListener('submit', async e => {
            e.preventDefault(); const qs = questions(), pid = Number(form.elements.who.value) || 0, p = tr.byId.get(pid);
            if (!qs.length) return T.fail(form.querySelector('[name=th]'), 'Choisis au moins un thème.');
            let rec = null, chunks = [], stream = null, t0 = Date.now(), paused = 0, pauseAt = 0, i = 0;
            const notes = qs.map(() => ''), marks = qs.map(() => null), now = () => (Date.now() - t0 - paused - (pauseAt ? Date.now() - pauseAt : 0)) / 1000;
            if (form.elements.rec.checked) {
                try { stream = await navigator.mediaDevices.getUserMedia({audio: true}); rec = new MediaRecorder(stream); rec.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data); }; rec.start(1000); }
                catch (err) { T.toast('Le micro n’est pas disponible : l’entretien continue sans enregistrement (note les réponses).', 'error'); rec = null; }
            }
            form.hidden = true; t0 = Date.now();
            const tick = setInterval(() => { if (!host.isConnected) { clearInterval(tick); T.hush(); try { if (rec && rec.state !== 'inactive') rec.stop(); } catch (_) {} stream?.getTracks().forEach(t => t.stop()); return; } // page quittée : micro coupé
                const el = live.querySelector('[data-iv-time]'); if (el) el.textContent = mmss(now()); }, 500);
            const show = () => { marks[i] ??= now(); live.innerHTML = `<div class="h-tr-panel h-tr-iv"><div class="h-tr-row" style="justify-content:space-between"><span class="h-tr-pill">${THEME_LABEL[qs[i].th]} · question ${i + 1} sur ${qs.length}</span><span>${rec ? '🔴 ' : ''}<b data-iv-time>${mmss(now())}</b></span></div>
                <p class="h-tr-ivq">${T.esc(qs[i].q)}</p><label style="display:grid">Notes rapides (facultatif)<textarea data-iv-note rows="2">${T.esc(notes[i])}</textarea></label>
                <p class="h-tr-row"><button type="button" class="button secondary" data-iv-prev ${i ? '' : 'disabled'}>← Précédente</button><button type="button" class="button" data-iv-next>${i < qs.length - 1 ? 'Question suivante →' : 'Dernière question : terminer'}</button><button type="button" class="button secondary" data-iv-skip>Passer</button><button type="button" class="button secondary" data-iv-again>🔊 Relire</button>${rec ? `<button type="button" class="button secondary" data-iv-pause>${pauseAt ? '▶ Reprendre' : '⏸ Pause'}</button>` : ''}<button type="button" class="button danger" data-iv-stop>⏹ Terminer</button></p></div>`;
                if (form.elements.speak.checked) { T.hush(); T.say(qs[i].q); } };
            const finish = async () => {
                clearInterval(tick); T.hush(); const dur = now();
                const chapters = qs.map((q, k) => ({q: q.q, t: Math.round((marks[k] ?? 0) * 10) / 10, note: notes[k]})).filter((c, k) => marks[k] != null);
                live.innerHTML = '<p class="h-tr-muted">J’enregistre l’entretien…</p>';
                let media = null;
                try {
                    if (rec) { await new Promise(r => { rec.onstop = r; rec.stop(); }); stream.getTracks().forEach(t => t.stop());
                        const blob = new Blob(chunks, {type: rec.mimeType || 'audio/webm'}), title = `Entretien${p ? ` avec ${T.name(p)}` : ''} — ${new Date().toLocaleDateString('fr-FR')}`;
                        if (blob.size) { media = await T.upload(blob, 'audio', title, /ogg/.test(blob.type) ? 'entretien.ogg' : 'entretien.webm'); if (pid) await T.post('tresor_write', {op: 'link_media', media_id: media.media_id, person_id: pid}); } }
                    await T.save({kind: 'interview', person_id: pid || null, title: `Entretien${p ? ` avec ${T.name(p)}` : ''}`, body: chapters.filter(c => c.note).map(c => `${c.q}\n${c.note}`).join('\n\n'), data: {media_id: media?.media_id || null, chapters, duration: Math.round(dur)}});
                    T.toast(media ? 'Entretien enregistré : le son est dans les médias de la fiche.' : 'Entretien gardé (sans son).', 'success');
                } catch (err) { T.toast('L’entretien n’a pas pu être enregistré : ' + err.message, 'error'); }
                live.innerHTML = ''; form.hidden = false; drawList();
            };
            live.onclick = ev => {
                const nt = live.querySelector('[data-iv-note]'); if (nt) notes[i] = nt.value;
                if (ev.target.closest('[data-iv-next]')) { if (i < qs.length - 1) { i++; show(); } else finish(); }
                else if (ev.target.closest('[data-iv-skip]')) { marks[i] = null; if (i < qs.length - 1) { i++; show(); } else finish(); }
                else if (ev.target.closest('[data-iv-prev]') && i > 0) { i--; show(); }
                else if (ev.target.closest('[data-iv-again]')) { T.hush(); T.say(qs[i].q); }
                else if (ev.target.closest('[data-iv-pause]')) { if (pauseAt) { paused += Date.now() - pauseAt; pauseAt = 0; rec?.resume(); } else { pauseAt = Date.now(); rec?.pause(); } show(); }
                else if (ev.target.closest('[data-iv-stop]')) finish();
            };
            show();
        });
        drawList();
    }
    F.push({key: 'entretien', group: 'memoire', icon: '🎙️', title: 'L’entretien guidé', desc: 'Les bonnes questions à poser à un grand-parent, lues à voix haute ; l’enregistrement est rangé sur sa fiche, avec un repère par question.', render: renderInterview});
    ext.tresorInterview = {THEMES};

    /* ── 🕯️ La veillée en un clic ── */
    function veilleeSlides(T, tr, rootId, scope, gens) {
        const root = tr.byId.get(rootId); if (!root) return [];
        const ids = [...(scope !== 'desc' ? T.ancestors(tr, rootId, gens) : []), ...(scope !== 'asc' ? T.descendants(tr, [rootId], gens).map(d => ({...d, gen: -d.gen})) : [])];
        const people = ids.map(({id, gen}) => ({p: tr.byId.get(id), gen})).filter(x => x.p && !x.p.living).sort((a, b) => (a.p.by || 9999) - (b.p.by || 9999));
        const kin = ext.tresorKin?.kinWord, fam = root.last || T.name(root);
        return [{intro: true, title: `La veillée de la famille ${fam}`, text: `Ce soir, on raconte ${people.length} vie${people.length > 1 ? 's' : ''} de la famille de ${T.name(root)}.`},
            ...people.map(({p, gen}) => ({p, title: T.name(p), sub: [T.life(p), gen > 0 && kin ? kin(gen, p.gender, false).replace(/^(son|sa) /, '') + ` de ${root.first || T.name(root)}` : ''].filter(Boolean).join(' · '), text: T.story(tr, p).join(' ')})),
            {intro: true, title: 'Bonne nuit', text: 'Et maintenant, à vous de raconter ce dont vous vous souvenez.'}];
    }
    /** une musique douce de veillée (des accords lents, synthétisés) → stop() */
    function softMusic() {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return () => {};
        const ac = new AC(), out = ac.createGain(), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; out.gain.value = 0.0; out.connect(lp); lp.connect(ac.destination);
        out.gain.linearRampToValueAtTime(0.06, ac.currentTime + 3);
        const chords = [[220, 277.2, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [196, 246.9, 329.6]]; let k = 0, oscs = [];
        const play = () => { const t = ac.currentTime; oscs.forEach(o => { o.g.gain.setTargetAtTime(0, t, 1.2); o.o.stop(t + 5); }); oscs = chords[k++ % chords.length].map(f => { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.value = 0; g.gain.setTargetAtTime(0.33, t, 1.5); o.connect(g); g.connect(out); o.start(t); return {o, g}; }); };
        play(); const iv = setInterval(play, 6000);
        return () => { clearInterval(iv); out.gain.setTargetAtTime(0, ac.currentTime, 0.4); setTimeout(() => ac.close().catch(() => {}), 1500); };
    }
    async function renderVeillee(host, T) {
        const tr = await T.tree(), st = T.start(tr);
        host.innerHTML = `<form class="h-tr-panel h-tr-row" data-vl-form><div style="min-width:260px"><span class="pk-lab">Autour de</span>${T.personField('root', st?.id)}</div>
            <label>Qui<select name="scope"><option value="asc">ses ancêtres</option><option value="desc">ses descendants</option><option value="both">les deux</option></select></label>
            <label>Générations<input type="number" name="gens" min="1" max="12" value="4" style="width:5em"></label><label>Secondes par vie<input type="number" name="sec" min="4" max="60" value="12" style="width:5em"></label>
            <label class="checkbox-line"><input type="checkbox" name="voice" checked> Raconter à voix haute</label><label class="checkbox-line"><input type="checkbox" name="music" checked> Musique douce</label>
</form><p class="h-tr-muted">En plein écran : les portraits défilent, chaque vie est racontée. Espace = pause, flèches = avant / après, Échap = fin.</p><div data-vl-prev></div>`;
        const form = host.querySelector('[data-vl-form]'), prev = host.querySelector('[data-vl-prev]');
        const slides = () => veilleeSlides(T, tr, Number(form.elements.root.value) || st?.id, form.elements.scope.value, Number(form.elements.gens.value) || 4);
        const preview = () => { const s = slides(); prev.innerHTML = `<p><b>${s.length - 2}</b> vie${s.length > 3 ? 's' : ''} à raconter : ${T.esc(s.filter(x => x.p).map(x => x.p.first || x.title).join(', '))}</p>`; };
        form.addEventListener('change', preview); preview();
        T.actions(host, {primary: {label: '🕯️ Lancer la veillée', attrs: 'data-vl-go', run: () => form.requestSubmit()}});
        form.addEventListener('submit', e => {
            e.preventDefault(); const s = slides(); if (s.length < 3) return T.toast('Personne à raconter de ce côté-là.', 'error');
            const sec = Math.max(4, Number(form.elements.sec.value) || 12), voice = form.elements.voice.checked, stopMusic = form.elements.music.checked ? softMusic() : () => {};
            const ov = document.createElement('div'); ov.className = 'h-tr-veillee'; ov.tabIndex = 0; document.body.appendChild(ov);
            let i = 0, timer = null, pausedV = false, alive = true, turn = 0;
            const close = () => { if (!alive) return; alive = false; clearTimeout(timer); T.hush(); stopMusic(); document.removeEventListener('keydown', key, true); document.removeEventListener('fullscreenchange', fsc); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); ov.remove(); };
            const go = n => { i = Math.max(0, Math.min(s.length - 1, n)); draw(); };
            const draw = async () => {
                clearTimeout(timer); T.hush(); const x = s[i], my = ++turn, url = x.p ? T.portraitUrl(x.p) : '';
                ov.innerHTML = `<div class="h-tr-vl-slide">${x.p ? (url ? `<img src="${url}" alt="">` : `<div class="h-tr-vl-ini">${T.esc((x.p.first || '?')[0])}${T.esc((x.p.last || '')[0] || '')}</div>`) : '<div class="h-tr-vl-ini">🕯️</div>'}
                    <h2>${T.esc(x.title)}</h2>${x.sub ? `<p class="h-tr-vl-sub">${T.esc(x.sub)}</p>` : ''}<p class="h-tr-vl-text">${T.esc(x.text)}</p></div>
                    <div class="h-tr-vl-bar"><span>${i + 1} / ${s.length}</span><button type="button" data-vl="prev">◀</button><button type="button" data-vl="pause">${pausedV ? '▶' : '⏸'}</button><button type="button" data-vl="next">▶▶</button><button type="button" data-vl="close">✕ Fin</button></div>`;
                if (pausedV) return;
                const t0 = Date.now(); if (voice) await T.say(`${x.title}. ${x.text}`);
                if (my !== turn || !alive || pausedV) return;
                timer = setTimeout(() => { if (i < s.length - 1) go(i + 1); else close(); }, Math.max(1500, sec * 1000 - (Date.now() - t0)));
            };
            const key = e => { if (!alive) return; if (e.key === 'Escape') { e.preventDefault(); close(); } else if (e.key === 'ArrowRight') go(i + 1); else if (e.key === 'ArrowLeft') go(i - 1); else if (e.key === ' ') { e.preventDefault(); pausedV = !pausedV; draw(); } };
            document.addEventListener('keydown', key, true);
            ov.addEventListener('click', ev => { const b = ev.target.closest('[data-vl]'); if (!b) return; const a = b.dataset.vl; if (a === 'close') close(); else if (a === 'prev') go(i - 1); else if (a === 'next') go(i + 1); else { pausedV = !pausedV; draw(); } });
            const fsc = () => { if (!document.fullscreenElement && alive && ov.dataset.fs) close(); }; document.addEventListener('fullscreenchange', fsc);
            ov.requestFullscreen?.().then(() => { ov.dataset.fs = '1'; }).catch(() => {});
            draw();
        });
    }
    F.push({key: 'veillee', group: 'memoire', icon: '🕯️', title: 'La veillée en un clic', desc: 'En plein écran, les portraits d’une branche défilent, chaque vie est racontée à voix haute, avec une musique douce.', render: renderVeillee});
    ext.tresorVeillee = {slides: veilleeSlides};
})();
