/**
 * 📘 Livrets de famille (serveur : lib/family_booklets.php, structure n°35)
 *  - Listes → « Livrets de famille » : tous les livrets transcrits, puis un livret présenté comme le vrai (délivrance,
 *    époux et épouse avec leurs parents, mariage, enfants, décès, divorce, mentions), avec ses photos et ses recueils ;
 *  - chaque personne écrite peut être reliée à une fiche (ou une fiche créée) : le livret apparaît sur la fiche (bloc
 *    « Livrets de famille ») et « Reporter sur les fiches » ajoute ce qui y manque (naissances, décès, métiers, mariage,
 *    enfants du couple), sans rien écraser.
 * Chargé après heritage.js (window.LCNDA_APP, window.LCNDA_EXT).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const key of ['personBlocks', 'lists']) ext[key] = ext[key] || {};
    const esc = v => A().escapeHtml(v ?? '');
    const nl = v => esc(v).replace(/\n/g, '<br>');
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const S = () => A().state;
    const fmt = n => Number(n || 0).toLocaleString('fr-FR');
    const isCurrent = token => token === S().workspaceToken && S().module === 'listes' && S().listType === 'family_booklets';
    const personLink = (id, name) => id ? `<button type="button" class="table-link" data-h-person="${Number(id)}">${esc(name || 'Personne')}</button>` : esc(name || '');
    const PARENT_SLOTS = [['husband_father', 'Père de l’époux'], ['husband_mother', 'Mère de l’époux'], ['wife_father', 'Père de l’épouse'], ['wife_mother', 'Mère de l’épouse']];
    const MODELS = [['', '—'], ['avant1877', 'Avant 1877 (premiers livrets, Paris)'], ['1877', 'Modèle de 1877 (livret « bleu »)'], ['1975', 'Modèle de 1975 (époux, épouse, enfants)'], ['2003', 'Depuis 2003 (parents, enfants)'], ['autre', 'Autre (étranger, colonial…)']];

    /* ─── La liste ─── */
    ext.lists.family_booklets = async token => {
        const st = S();
        if (st.hBooklet) return showBooklet(token, st.hBooklet);
        let data; try { data = await api('booklets', {q: st.hBookletQ || ''}); } catch (error) { toast(error.message, 'error'); return; }
        if (!isCurrent(token)) return;
        const rows = data.booklets || [];
        A().$('#workspace').innerHTML = `<section class="page h-booklets"><header class="page-header"><div><span class="eyebrow">LISTES</span><h2>Livrets de famille</h2>
            <p>La transcription complète des livrets de famille : délivrance, époux et épouse, leurs parents, le mariage, les enfants et toutes les mentions. Relie chaque personne à sa fiche : le livret y apparaît, et ses dates peuvent y être reportées.</p></div>
            <div class="page-actions"><button type="button" class="button" data-bk-new>📘 + Nouveau livret</button></div></header>
            <div class="list-toolbar"><div class="search-box" style="position:static;max-width:500px"><div class="search-row"><input data-bk-q placeholder="Chercher un nom, une commune…" value="${esc(st.hBookletQ || '')}"><button aria-label="Rechercher">⌕</button></div></div></div>
            ${rows.length ? `<div class="h-bk-grid">${rows.map(r => `<button type="button" class="h-bk-card" data-bk-open="${r.id}">
                <span class="h-bk-cover">${r.media?.[0] ? A().mediaThumbHtml(r.media[0]) : '<span class="h-bk-coverart">LIVRET<br>DE<br>FAMILLE</span>'}</span>
                <span class="h-bk-info"><strong>${esc(r.title)}</strong><small>${esc([r.commune, r.marriage_date && 'mariage ' + r.marriage_date].filter(Boolean).join(' · ') || 'Commune et date à compléter')}</small>
                <small>${fmt(r.children)} enfant${r.children > 1 ? 's' : ''} · ${fmt(r.linked)}/${fmt(r.people)} personne${r.people > 1 ? 's' : ''} reliée${r.linked > 1 ? 's' : ''} · ${fmt(r.media_count)} photo${r.media_count > 1 ? 's' : ''}</small></span></button>`).join('')}</div>`
                : A().empty(st.hBookletQ ? 'Aucun livret ne correspond.' : 'Aucun livret transcrit. « + Nouveau livret » : tu recopies ce qui est écrit, page par page, et tu relies les personnes à leurs fiches.')}</section>`;
        const ws = A().$('#workspace');
        let t = 0; ws.querySelector('[data-bk-q]').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { st.hBookletQ = e.target.value; ext.lists.family_booklets(++st.workspaceToken); }, 300); });
        ws.querySelector('[data-bk-new]').addEventListener('click', () => openEditor(null));
        ws.querySelectorAll('[data-bk-open]').forEach(b => b.addEventListener('click', () => { st.hBooklet = Number(b.dataset.bkOpen); ext.lists.family_booklets(++st.workspaceToken); }));
    };

    /* ─── Un livret, présenté comme le vrai ─── */
    function slotHtml(s, people, label, extra = '') {
        if (!s || (!s.written_name && !s.person_id)) return `<div class="h-bk-slot is-empty"><span class="eyebrow">${esc(label)}</span><p class="muted">—</p></div>`;
        const p = people[s.person_id];
        const line = (k, v) => v ? `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>` : '';
        return `<div class="h-bk-slot"><span class="eyebrow">${esc(label)}</span><h4>${esc(s.written_name || p?.name || '')}</h4>
            ${p ? `<p class="h-bk-linked">🔗 ${personLink(p.id, p.name)}${p.birth || p.death ? ` <small class="muted">(${esc(p.birth || '?')} – ${esc(p.death || '')})</small>` : ''}</p>` : '<p class="h-bk-unlinked muted">pas encore relié à une fiche</p>'}
            <dl class="h-bk-dl">${line('Naissance', [s.birth_date, s.birth_place && 'à ' + s.birth_place].filter(Boolean).join(' '))}${line('Profession', s.occupation)}${line('Domicile', s.residence)}${line('Décès', [s.death_date, s.death_place && 'à ' + s.death_place].filter(Boolean).join(' '))}${line('Mention', s.marriage_note)}${line('Reconnaissance', s.recognition)}${line('Note', s.note)}</dl>${extra}</div>`;
    }
    async function showBooklet(token, id) {
        const st = S();
        let b; try { b = await api('booklet', {id}); } catch (error) { st.hBooklet = 0; toast(error.message, 'error'); return ext.lists.family_booklets(++st.workspaceToken); }
        if (!isCurrent(token)) return;
        const d = b.data, people = b.people || {};
        const parents = which => PARENT_SLOTS.filter(([k]) => k.startsWith(which)).map(([k, l]) => slotHtml(d[k], people, l)).join('');
        const top = (k, v) => v ? `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>` : '';
        const model = MODELS.find(m => m[0] === d.model)?.[1] || '';
        A().$('#workspace').innerHTML = `<section class="page h-booklet">
            <header class="page-header"><div><span class="eyebrow">LIVRET DE FAMILLE</span><h2>${esc(b.title)}</h2><p>${esc([d.commune, d.department, d.country].filter(Boolean).join(' · '))}${d.issued ? ` · délivré le ${esc(d.issued)}` : ''}</p></div>
                <div class="page-actions"><button type="button" class="button secondary" data-bk-back>← Tous les livrets</button><button type="button" class="button" data-bk-edit>✎ Modifier</button><button type="button" class="button secondary" data-bk-apply>🗂 Reporter sur les fiches</button><button type="button" class="button secondary" data-bk-print>🖨️ Imprimer</button><button type="button" class="button secondary danger" data-bk-del>Supprimer</button></div></header>
            ${ext.labelChips ? ext.labelChips(b.labels) : ''}
            <div class="h-bk-book">
                <section class="h-bk-page h-bk-pagecover"><span class="h-bk-rf">RÉPUBLIQUE FRANÇAISE</span><strong>LIVRET DE FAMILLE</strong>
                    <dl class="h-bk-dl">${top('Commune', d.commune)}${top('Département', d.department)}${top('Délivré le', d.issued)}${top('Numéro', d.number)}${top('Modèle', model)}${top('Officier d’état civil', d.officer)}${top('Détenteur', d.holder)}${top('Conservé', d.kept_at)}${top('État', d.condition)}</dl></section>
                <section class="h-bk-page"><h3>💍 Le mariage</h3><dl class="h-bk-dl">${top('Mariage civil', [d.marriage_date, d.marriage_place && 'à ' + d.marriage_place].filter(Boolean).join(' '))}${top('Officier', d.marriage_officer)}${top('Contrat', [d.contract_date, d.contract_notary && 'chez ' + d.contract_notary].filter(Boolean).join(' '))}${top('Mariage religieux', [d.religious_date, d.religious_parish && 'paroisse ' + d.religious_parish].filter(Boolean).join(' '))}${top('Divorce', [d.divorce_date, d.divorce_note].filter(Boolean).join(' — '))}</dl>
                    ${!d.marriage_date && !d.marriage_place ? '<p class="muted">Date et lieu du mariage à recopier.</p>' : ''}</section>
                <section class="h-bk-page h-bk-couple"><div>${slotHtml(d.husband, people, 'Époux')}<div class="h-bk-parents">${parents('husband')}</div></div><div>${slotHtml(d.wife, people, 'Épouse')}<div class="h-bk-parents">${parents('wife')}</div></div></section>
                <section class="h-bk-page h-bk-wide"><h3>👶 Les enfants (${d.children.length})</h3>${d.children.length ? `<div class="h-bk-children">${d.children.map((c, i) => slotHtml(c, people, `Enfant n°${i + 1}${c.sex ? (c.sex === 'F' ? ' · fille' : ' · garçon') : ''}`)).join('')}</div>` : '<p class="muted">Aucun enfant recopié.</p>'}</section>
                ${d.others.length ? `<section class="h-bk-page h-bk-wide"><h3>👥 Autres personnes citées</h3><div class="h-bk-children">${d.others.map(c => slotHtml(c, people, 'Témoin / autre')).join('')}</div></section>` : ''}
                ${d.mentions ? `<section class="h-bk-page h-bk-wide"><h3>📝 Mentions</h3><p class="h-transcription">${nl(d.mentions)}</p></section>` : ''}
                ${d.transcription ? `<section class="h-bk-page h-bk-wide"><h3>✍️ Transcription intégrale</h3><p class="h-transcription">${nl(d.transcription)}</p></section>` : ''}
                ${d.notes || d.sources ? `<section class="h-bk-page h-bk-wide"><h3>🗒️ Notes et sources</h3>${d.notes ? `<p>${nl(d.notes)}</p>` : ''}${d.sources ? `<p class="muted">${nl(d.sources)}</p>` : ''}</section>` : ''}
                <section class="h-bk-page h-bk-wide"><h3>📷 Les pages</h3>${b.media.length && ext.thumbs ? ext.thumbs('booklet-' + id, b.media) : '<p class="muted">Ajoute les photos des pages avec « ✎ Modifier ».</p>'}</section>
            </div>
            <div data-rc-host data-rc-type="family_booklet" data-rc-key="${id}"></div>
        </section>`;
        A().bindTableLinks();
        const ws = A().$('#workspace'), again = () => showBooklet(++st.workspaceToken, id);
        ws.querySelector('[data-bk-back]').addEventListener('click', () => { st.hBooklet = 0; ext.lists.family_booklets(++st.workspaceToken); });
        ws.querySelector('[data-bk-edit]').addEventListener('click', () => openEditor(b, again));
        ws.querySelector('[data-bk-apply]').addEventListener('click', () => openApply(id, again));
        ws.querySelector('[data-bk-print]').addEventListener('click', () => window.print());
        ws.querySelector('[data-bk-del]').addEventListener('click', async () => {
            if (!confirm(`Supprimer « ${b.title} » ? Les fiches des personnes et les photos restent.`)) return;
            try { await api('delete_booklet', {}, {method: 'POST', body: {id}}); toast('Livret supprimé.'); st.hBooklet = 0; ext.lists.family_booklets(++st.workspaceToken); } catch (error) { toast(error.message, 'error'); }
        });
    }

    /* ─── L'éditeur ─── */
    const field = (name, label, v, ph = '', cls = '') => `<label class="${cls}">${esc(label)}<input name="${name}" value="${esc(v || '')}" placeholder="${esc(ph)}"></label>`;
    function slotEditor(prefix, s, label, people, {child = false, removable = false} = {}) {
        s = s || {};
        const p = people[s.person_id];
        return `<fieldset class="h-bk-slotedit" data-bk-slot="${prefix}"><legend>${esc(label)}</legend>
            ${removable ? `<span class="h-bk-slottools"><button type="button" class="icon-button small" data-bk-up aria-label="Monter">↑</button><button type="button" class="icon-button small" data-bk-down aria-label="Descendre">↓</button><button type="button" class="icon-button small" data-bk-remove aria-label="Retirer">✕</button></span>` : ''}
            <div class="form-grid">
                ${field('written_name', 'Nom et prénoms (tels qu’écrits)', s.written_name, 'MARTIN Jean Baptiste')}
                <label>Fiche reliée ${A().collectionPersonField('bk_p_' + prefix.replace(/[^a-z0-9_]/gi, '_'), p ? {id: p.id, first_name: p.name, last_name: ''} : null, 'Chercher la personne')}<button type="button" class="link-button" data-bk-create>＋ créer la fiche avec ce qui est écrit</button></label>
                ${child ? `<label>Sexe <select name="sex"><option value="">—</option><option value="M" ${s.sex === 'M' ? 'selected' : ''}>garçon</option><option value="F" ${s.sex === 'F' ? 'selected' : ''}>fille</option></select></label>` : ''}
                ${field('birth_date', 'Né(e) le', s.birth_date, '12 mars 1888')}${field('birth_place', 'à', s.birth_place, 'Pernay')}
                ${field('occupation', 'Profession', s.occupation)}${field('residence', 'Domicile', s.residence)}
                ${field('death_date', 'Décédé(e) le', s.death_date)}${field('death_place', 'à', s.death_place)}
                ${child ? `${field('marriage_note', 'Mention de mariage', s.marriage_note, 'marié le … à … avec …', 'span-2')}${field('recognition', 'Reconnaissance, légitimation', s.recognition, '', 'span-2')}` : ''}
                ${field('note', 'Note', s.note, '', 'span-2')}
            </div></fieldset>`;
    }
    function readSlot(box) {
        const v = n => box.querySelector(`[name="${n}"]`)?.value?.trim() || '';
        const hidden = box.querySelector('input[type=hidden][name^="bk_p_"]');
        return {written_name: v('written_name'), sex: v('sex'), birth_date: v('birth_date'), birth_place: v('birth_place'), occupation: v('occupation'), residence: v('residence'),
            death_date: v('death_date'), death_place: v('death_place'), marriage_note: v('marriage_note'), recognition: v('recognition'), note: v('note'), person_id: Number(hidden?.value) || 0};
    }
    /** « DUPONT Jean Pierre » ou « Jean Pierre Dupont » → prénoms et nom */
    function splitName(text) {
        const w = String(text || '').trim().split(/\s+/).filter(Boolean);
        if (!w.length) return {first_name: '', last_name: ''};
        const caps = w.filter(x => x.length > 1 && x === x.toUpperCase() && /[A-ZÀ-Ý]/.test(x));
        if (caps.length) return {last_name: caps.join(' '), first_name: w.filter(x => !caps.includes(x)).join(' ')};
        return w.length === 1 ? {first_name: '', last_name: w[0]} : {first_name: w.slice(0, -1).join(' '), last_name: w[w.length - 1]};
    }
    function openEditor(b, done) {
        const d = b?.data || {husband: {}, wife: {}, children: [], others: []}, people = b?.people || {};
        const childrenHtml = list => list.map((c, i) => slotEditor('child_' + i + '_' + Math.random().toString(36).slice(2, 6), c, `Enfant n°${i + 1}`, people, {child: true, removable: true})).join('');
        const top = (name, label, ph = '') => field(name, label, d[name], ph);
        const area = (name, label, rows, ph = '') => `<label class="span-2">${esc(label)}<textarea name="${name}" rows="${rows}" placeholder="${esc(ph)}">${esc(d[name] || '')}</textarea></label>`;
        ext.openDialog({eyebrow: 'LIVRET DE FAMILLE', title: b ? b.title : 'Nouveau livret', wide: true, labels: ['family_booklet', b?.labels || []],
            body: `<div class="h-bk-editor">
                <nav class="h-bk-nav">${[['bk-s1', '📘 Délivrance'], ['bk-s2', '💍 Mariage'], ['bk-s3', '👨 Époux'], ['bk-s4', '👩 Épouse'], ['bk-s5', '👶 Enfants'], ['bk-s6', '📝 Mentions, transcription'], ['bk-s7', '📷 Photos']].map(([k, l]) => `<a href="#${k}" data-bk-jump="${k}">${l}</a>`).join('')}</nav>
                <section id="bk-s1"><h3>📘 Délivrance du livret</h3><div class="form-grid">${top('title', 'Titre (facultatif)', 'Livret de Jean Martin et Marie Petit')}${top('commune', 'Commune', 'Pernay')}${top('department', 'Département', 'Indre-et-Loire')}${top('country', 'Pays', 'France')}${top('issued', 'Délivré le', '15 mai 1912')}${top('number', 'Numéro', '')}
                    <label>Modèle <select name="model">${MODELS.map(([k, l]) => `<option value="${k}" ${d.model === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>${top('officer', 'Officier d’état civil (signature)', '')}${top('holder', 'Qui l’a aujourd’hui', 'Tante Lucie')}${top('kept_at', 'Où il est conservé', 'boîte à papiers, grenier…')}${top('condition', 'État', 'bon, pages manquantes…')}</div></section>
                <section id="bk-s2"><h3>💍 Le mariage</h3><div class="form-grid">${top('marriage_date', 'Mariage civil le', '15 mai 1912')}${top('marriage_place', 'à', 'Pernay')}${top('marriage_officer', 'Devant (officier)', '')}${top('contract_date', 'Contrat de mariage le', '')}${top('contract_notary', 'chez (notaire)', '')}${top('religious_date', 'Mariage religieux le', '')}${top('religious_parish', 'Paroisse', '')}${top('divorce_date', 'Divorce le', '')}${top('divorce_note', 'Divorce : mention', '')}</div></section>
                <section id="bk-s3">${slotEditor('husband', d.husband, '👨 L’époux', people)}<div class="h-bk-parentsedit">${slotEditor('husband_father', d.husband_father, 'Son père', people)}${slotEditor('husband_mother', d.husband_mother, 'Sa mère', people)}</div></section>
                <section id="bk-s4">${slotEditor('wife', d.wife, '👩 L’épouse', people)}<div class="h-bk-parentsedit">${slotEditor('wife_father', d.wife_father, 'Son père', people)}${slotEditor('wife_mother', d.wife_mother, 'Sa mère', people)}</div></section>
                <section id="bk-s5"><h3>👶 Les enfants</h3><div data-bk-children>${childrenHtml(d.children || [])}</div><button type="button" class="button small secondary" data-bk-addchild>+ Enfant</button>
                    <h3>👥 Autres personnes citées <small class="muted">(témoins, enfant décédé avant…)</small></h3><div data-bk-others>${(d.others || []).map((c, i) => slotEditor('other_' + i, c, 'Personne citée', people, {removable: true})).join('')}</div><button type="button" class="button small secondary" data-bk-addother>+ Personne citée</button></section>
                <section id="bk-s6"><h3>📝 Mentions, transcription, notes</h3><div class="form-grid">${area('mentions', 'Mentions (décès, divorce, rectifications, tampons…)', 4)}${area('transcription', 'Transcription intégrale, page par page', 8, 'Page 1 : …')}${area('notes', 'Notes', 3)}${area('sources', 'Sources', 2)}</div></section>
                <section id="bk-s7"><h3>📷 Photos des pages</h3>${ext.mediaEditorHtml ? ext.mediaEditorHtml('family_booklet', b?.id || 0, b?.media || [], [['', 'Pages du livret', 'image/*,application/pdf']]) : ''}${b?.id ? '' : '<p class="muted">Les recueils se relient au livret une fois enregistré (en bas de sa page).</p>'}</section>
            </div>`,
            onOpen: dlg => {
                const body = dlg.querySelector('.h-dialog-body');
                body.addEventListener('click', async e => {
                    const j = e.target.closest('[data-bk-jump]'); if (j) { e.preventDefault(); dlg.querySelector('#' + j.dataset.bkJump)?.scrollIntoView({behavior: 'smooth', block: 'start'}); return; }
                    if (e.target.closest('[data-bk-addchild]')) { const box = body.querySelector('[data-bk-children]'); box.insertAdjacentHTML('beforeend', slotEditor('child_n' + Date.now().toString(36), {}, `Enfant n°${box.children.length + 1}`, people, {child: true, removable: true})); A().bindCollectionPersonFields(box.lastElementChild); box.lastElementChild.querySelector('input').focus(); return; }
                    if (e.target.closest('[data-bk-addother]')) { const box = body.querySelector('[data-bk-others]'); box.insertAdjacentHTML('beforeend', slotEditor('other_n' + Date.now().toString(36), {}, 'Personne citée', people, {removable: true})); A().bindCollectionPersonFields(box.lastElementChild); return; }
                    const fs = e.target.closest('[data-bk-slot]');
                    if (fs && e.target.closest('[data-bk-remove]')) { fs.remove(); renumber(body); return; }
                    if (fs && e.target.closest('[data-bk-up]') && fs.previousElementSibling) { fs.parentElement.insertBefore(fs, fs.previousElementSibling); renumber(body); return; }
                    if (fs && e.target.closest('[data-bk-down]') && fs.nextElementSibling) { fs.parentElement.insertBefore(fs.nextElementSibling, fs); renumber(body); return; }
                    if (fs && e.target.closest('[data-bk-create]')) {
                        const s = readSlot(fs); if (!s.written_name) { toast('Écris d’abord le nom et les prénoms.', 'error'); return; }
                        if (s.person_id && !confirm('Cette case est déjà reliée à une fiche. En créer une autre ?')) return;
                        const role = fs.dataset.bkSlot, gender = s.sex === 'F' || /wife|mother/.test(role) ? 'female' : s.sex === 'M' || /husband|father/.test(role) ? 'male' : 'unknown';
                        try {
                            const r = await api('save_person', {}, {method: 'POST', body: {...splitName(s.written_name), gender, living_status: s.death_date ? 'deceased' : 'unknown', occupation: s.occupation}});
                            const pid = Number(r.result?.id || r.id); const hid = fs.querySelector('input[type=hidden][name^="bk_p_"]'), vis = hid?.parentElement?.querySelector('[data-cp-input]');
                            if (hid) hid.value = pid; if (vis) vis.value = s.written_name;
                            toast(`Fiche créée pour ${s.written_name}. « Reporter sur les fiches » ajoutera ses dates.`);
                        } catch (error) { toast(error.message, 'error'); }
                    }
                });
            },
            onSubmit: async form => {
                const val = A().formObject(form);
                const data = {}; ['title', 'commune', 'department', 'country', 'issued', 'number', 'model', 'holder', 'kept_at', 'condition', 'officer', 'marriage_date', 'marriage_place', 'marriage_officer', 'contract_notary', 'contract_date', 'religious_date', 'religious_parish', 'divorce_date', 'divorce_note', 'mentions', 'transcription', 'notes', 'sources'].forEach(k => { data[k] = form.querySelector(`.h-bk-editor > section > .form-grid [name="${k}"]`)?.value ?? val[k] ?? ''; });
                for (const k of ['husband', 'wife', 'husband_father', 'husband_mother', 'wife_father', 'wife_mother']) data[k] = readSlot(form.querySelector(`[data-bk-slot="${k}"]`));
                data.children = [...form.querySelectorAll('[data-bk-children] > [data-bk-slot]')].map(readSlot);
                data.others = [...form.querySelectorAll('[data-bk-others] > [data-bk-slot]')].map(readSlot);
                const saved = await api('save_booklet', {}, {method: 'POST', body: {id: b?.id || 0, data, pending_labels: val.pending_labels}});
                const id = Number(saved.result?.id || saved.id);
                if (ext.uploadMediaEditor) await ext.uploadMediaEditor(form, 'family_booklet', id);
                toast('Livret enregistré.');
                S().hBooklet = id; S().listType = 'family_booklets';
                if (done) done(); else if (S().module === 'listes') ext.lists.family_booklets(++S().workspaceToken); else { A().setModule('listes'); }
            },
        });
    }
    const renumber = body => body.querySelectorAll('[data-bk-children] > [data-bk-slot]').forEach((fs, i) => { fs.querySelector('legend').textContent = `Enfant n°${i + 1}`; });

    /* ─── Reporter sur les fiches ─── */
    async function openApply(id, done) {
        let r; try { r = await api('booklet_proposals', {id}); } catch (error) { toast(error.message, 'error'); return; }
        const items = r.items || [];
        ext.openDialog({eyebrow: 'LIVRET DE FAMILLE', title: 'Reporter sur les fiches', submitLabel: items.length ? 'Reporter ce qui est coché' : 'Fermer',
            body: items.length ? `<p class="muted">Ce que le livret apporte aux fiches reliées et qui leur manque. Rien n’est écrasé ; chaque date ajoutée garde la mention « D’après le livret de famille ».</p>
                <ul class="h-bk-apply">${items.map(it => `<li><label class="checkbox-line"><input type="checkbox" name="k" value="${esc(it.key)}" checked> <span><strong>${esc(it.label)}</strong> <small class="muted">${esc(it.what)}</small></span></label></li>`).join('')}</ul>`
                : '<p>Rien à reporter : relie d’abord les personnes à leurs fiches (ou crée-les), ou bien les fiches ont déjà ces informations.</p>',
            onSubmit: async form => {
                if (!items.length) return true;
                const keys = [...form.querySelectorAll('[name=k]:checked')].map(i => i.value);
                if (!keys.length) { toast('Rien de coché.'); return true; }
                const res = await api('apply_booklet', {}, {method: 'POST', body: {id, keys}});
                toast(`${res.result?.done ?? res.done ?? keys.length} information(s) reportée(s) sur les fiches.`);
                done?.();
            },
        });
    }

    /* ─── Bloc de la fiche ─── */
    ext.personBlocks.booklets = (index, detail) => {
        const list = detail.heritage?.booklets || [];
        if (!list.length) return '';
        return A().card(index, '📘 Livrets de famille', list.length, `<div class="h-bk-mentions">${list.map(m => `<article class="h-bk-mention">
            ${m.media?.[0] ? A().mediaThumbHtml(m.media[0]) : '<span class="h-bk-coverart small">LIVRET</span>'}
            <div><button type="button" class="table-link" data-bk-goto="${m.id}"><strong>${esc(m.title)}</strong></button>
            <p><span class="h-bk-role">${esc(m.role_label)}</span>${m.commune ? ` · ${esc(m.commune)}` : ''}${m.issued ? ` · délivré le ${esc(m.issued)}` : ''}</p>
            <small class="muted">${esc([m.slot?.written_name && `écrit : « ${m.slot.written_name} »`, m.slot?.birth_date && `né(e) le ${m.slot.birth_date}${m.slot.birth_place ? ' à ' + m.slot.birth_place : ''}`, m.marriage && `mariage ${m.marriage}`, m.slot?.death_date && `décès ${m.slot.death_date}`].filter(Boolean).join(' · '))}</small></div></article>`).join('')}</div>`, 'span-12');
    };
    document.addEventListener('click', e => {
        const g = e.target.closest?.('[data-bk-goto]'); if (!g) return;
        S().listType = 'family_booklets'; S().hBooklet = Number(g.dataset.bkGoto); A().setModule('listes');
    });
    ext.bookletSplitName = splitName; // pour les essais
})();
