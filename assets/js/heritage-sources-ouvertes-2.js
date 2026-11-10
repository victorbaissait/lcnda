/* LCNDA — 🗂 Archives en ligne (suite) : 🏛 Archives nationales (naturalisations, Minutier central) · 🌍 ANOM (état civil des
 * colonies, bagnards) · ⚓ Service historique de la Défense (inscrits maritimes, officiers) · 🕯 mémoire de la déportation et
 * des fusillés · 📜 Journal officiel · 📒 annuaires anciens · 🏰 patrimoine (Mérimée, Palissy) · 🌐 archives étrangères.
 *
 * La recherche est la fenêtre commune de tous les lots (heritage-archives-en-ligne.js) : openSearch / openSettings /
 * openPasteLink l'ouvrent déjà sur la rubrique de ce lot ; l'app n'interroge jamais ces sites. Ici : l'import et les boutons.
 *  - « ⤒ Importer ce que tu as trouvé » (fenêtre K13) : image, PDF, page enregistrée (.html : son texte seul), texte, ou lien
 *    collé + cases → média relié, source avec le lien, ajouts proposés (événements, inventaire, départ, bloc militaire, notice
 *    d'un lieu, d'une maison ou d'un objet) avec « c'est la même personne ? » ; rien n'est écrasé ; « ↶ Annuler » (H7) ;
 *    tout reste « À vérifier ».
 *  - 🕯 Déportation et fusillés : ton sobre, une phrase de contexte ; une fiche qui porte ces événements n'entre plus dans
 *    aucun jeu (lib/sources_ouvertes_2.php → « mem » dans mode_simple_data et tresor_tree).
 * Calculs purs : app-sources-ouvertes-2-core.js (LCNDA_SOURCES_OUVERTES_2). Serveur : lib/sources_ouvertes_2.php.
 * Mode d'emploi : docs/UI.md (« 🔍 Archives en ligne »).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const S2 = () => window.LCNDA_SOURCES_OUVERTES_2;
    const SO1 = () => window.LCNDA_SOURCES_OUVERTES; // parseSavedPage (page enregistrée → texte) de la première vague
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body}).then(r => r?.result ?? r);
    const GROUP_ORDER = ['an', 'anom', 'shd', 'memoire', 'jo', 'annuaires', 'patrimoine', 'etranger'];
    const pickerField = o => (window.LCNDA_PICKER || A()).pickerField(o);
    const ctxCache = new Map();
    const context = async pid => { const k = Number(pid) || 0; if (!ctxCache.has(k)) ctxCache.set(k, api('so_context', {person_id: k}).catch(e => { ctxCache.delete(k); throw e; })); return ctxCache.get(k); };
    const forget = pid => ctxCache.delete(Number(pid) || 0);
    const refresh = () => { try { A().refreshScreen?.(); } catch (_) {} };
    const RESPECT_NOTE = 'Ces événements s’écrivent sobrement sur la fiche. Une fiche qui porte une déportation, un décès en déportation ou « Fusillé » n’apparaît plus dans les jeux ni dans les Trésors à jouer.';

    /* ═════ 🔍 Chercher et ⚙️ Adresses des sites : la fenêtre commune de tous les lots (heritage-archives-en-ligne.js) ═════ */
    const GROUP_HELP = {
        an: 'Les décrets de naturalisation de 1883 à 1930 (série BB/11, et BB/34 pour les réintégrations) et les actes des notaires de Paris (Minutier central : contrats de mariage, inventaires après décès, testaments). La recherche se fait dans les inventaires des Archives nationales publiés sur FranceArchives ; les noms y sont écrits « Nom, Prénom ».',
        anom: 'Les Archives nationales d’outre-mer (Aix-en-Provence) : l’état civil des anciennes colonies (Algérie, Antilles, Guyane, Réunion, Indochine, Afrique…) et les registres matricules et dossiers des bagnards (Guyane, Nouvelle-Calédonie). La base d’état civil se cherche par territoire, commune et année.',
        shd: 'Le Service historique de la Défense : les registres de l’inscription maritime (les marins, quartier par quartier) et les dossiers individuels des officiers. La recherche se fait dans ses inventaires publiés sur FranceArchives.',
        memoire: S2()?.GROUPS.memoire.text || '',
        jo: 'Le Journal officiel publiait chaque naturalisation, chaque nomination dans la Légion d’honneur et les autres décorations, et les changements de nom autorisés. Gallica (BnF) en garde les numéros anciens.',
        annuaires: 'Les annuaires (Bottin, annuaires départementaux, almanachs du commerce) donnent, année par année, le métier et l’adresse des commerçants et des artisans. Cherche le nom de famille et la commune : un prénom y est rarement écrit en entier.',
        patrimoine: 'Les bases du ministère de la Culture (POP) : Mérimée pour les monuments (églises, châteaux, maisons, fermes…) et Palissy pour les objets (cloches, retables, mobilier, tableaux d’église). Leur notice peut compléter la fiche d’un lieu, d’une maison ou d’un objet de famille.',
        etranger: 'Les Archives de l’État en Belgique (recherche de personnes dans l’état civil et les registres), les archives des cantons suisses (une par canton) et les listes des passagers arrivés à Ellis Island, à New York (1892-1954 : il faut un compte gratuit sur le site de la fondation).',
    };
    /** la fenêtre commune, déjà sur la rubrique de ce lot ; target = un lieu, une maison ou un objet (Mérimée, Palissy) */
    const openSearch = (o = {}) => ext.archives?.open({...o, lot: 2, group: GROUP_ORDER.includes(o.group) ? o.group : (o.target ? 'patrimoine' : undefined)});
    const openSettings = onChange => ext.archives?.openSettings({lot: 2, onChange});

    /* ═════ ⤒ Importer ce qu'on a téléchargé (K13) ═════ */
    const NAME_FIELDS = [['last', 'Nom lu sur le document', 'text'], ['first', 'Prénoms lus', 'text'], ['birth', 'Naissance lue (date, lieu)', 'text']];
    const fieldHtml = ([k, label, type, choices], v) => type === 'choice'
        ? `<label>${esc(label)}<select name="${esc(k)}">${choices.map(([c, l]) => `<option value="${esc(c)}" ${v[k] === c ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`
        : type === 'long' ? `<label class="so-span-2">${esc(label)}<textarea name="${esc(k)}" rows="3">${esc(v[k] || '')}</textarea></label>`
            : `<label>${esc(label)}<input name="${esc(k)}" value="${esc(v[k] || '')}" autocomplete="off" ${type === 'date' ? 'data-ui-date' : ''}></label>`;
    const readText = f => f.arrayBuffer().then(b => window.LCNDA_SHEET?.decodeBytes ? window.LCNDA_SHEET.decodeBytes(new Uint8Array(b)).text : new TextDecoder().decode(b));
    function openImport(o = {}) {
        const K = () => S2().KINDS;
        const st = {kind: K()[o.kind] ? o.kind : (o.target ? 'patrimoine' : 'naturalisation'), pid: Number(o.personId) || 0, fiche: null, ecarts: [], target: o.target || null,
            file: null, link: o.link || '', text: o.text || '', v: {}, objUrl: '', toggled: {}, same: 'yes', preview: ''};
        const noPerson = () => st.kind === 'patrimoine';
        const analyze = async files => {
            const f = files[0]; if (!f) throw new Error('aucun fichier');
            const ext2 = (f.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
            if (f.size > 60 * 1048576) throw new Error('fichier trop gros (60 Mo au plus)');
            st.file = null; st.preview = '';
            if (o.linkOnly) { /* lien collé : rien à ranger */ }
            else if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext2)) { st.file = f; if (st.objUrl) URL.revokeObjectURL(st.objUrl); st.objUrl = URL.createObjectURL(f); st.preview = `<img src="${esc(st.objUrl)}" alt="Le document importé">`; }
            else if (ext2 === 'pdf') { st.file = f; st.preview = `<div class="so-pdf">📄 <b>${esc(f.name)}</b><br><small>Le PDF sera rangé dans les médias. Recopie à côté ce qu’il dit.</small></div>`; }
            else if (ext2 === 'html' || ext2 === 'htm') { const pg = SO1()?.parseSavedPage ? SO1().parseSavedPage(await readText(f)) : {title: f.name, url: '', text: ''}; st.text = pg.text; st.link = st.link || pg.url; st.preview = `<div class="so-pdf">🌐 <b>${esc(pg.title || f.name)}</b><br><small>Page enregistrée : seul son texte est gardé (dans la source), pas la page elle-même.</small></div>`; }
            else if (ext2 === 'txt') { st.file = o.linkOnly ? null : f; st.text = st.text || await readText(f); st.preview = `<div class="so-pdf">📝 <b>${esc(f.name)}</b></div>`; }
            else throw new Error('ici : une image (JPG, PNG, WebP, GIF), un PDF, une page enregistrée (.html) ou un texte (.txt)');
            if (!o.kind && st.link) st.kind = S2().kindFromLink(st.link, st.kind);
            const lk = S2().parseLink(st.link); if (lk.ref && !st.v.ref) st.v.ref = lk.ref;
            if (st.text) st.v = {...S2().parseFields(st.text, st.kind), ...st.v};
            await loadFiche();
            return {count: 1, noun: 'document', summaryHtml: `<b>un document</b> pour ${st.fiche ? `<b>${esc([st.fiche.first, String(st.fiche.last || '').toUpperCase()].join(' '))}</b>` : st.target ? `<b>${esc(st.target.name)}</b>` : 'la fiche choisie ci-dessous'}`,
                notices: [{kind: 'warn', text: `${S2().MENTION}. Le document entre « À vérifier ».`}, {kind: 'info', text: 'Rien n’est remplacé : on ajoute, ou on remplit une case vide. « ↶ Annuler » retire tout ce que l’import a ajouté.'}],
                preview: '<div class="so-imp" data-so2-imp></div>', onShow: body => draw(body)};
        };
        const loadFiche = async () => {
            st.fiche = null; st.ecarts = [];
            if (!st.pid && !st.target) return;
            try { const r = await post('so2_preview', {kind: st.kind, person_id: st.pid, url: S2().cleanUrl(st.link), fields: st.v, target: st.target}); st.fiche = r.person; st.ecarts = r.ecarts || []; }
            catch (e) { st.ecarts = [{level: 'orange', text: e.message}]; }
        };
        const read = body => {
            const box = body.querySelector('[data-so2-imp]'); if (!box) return st.v;
            box.querySelectorAll('.so2-f input[name], .so2-f select[name], .so2-f textarea[name]').forEach(i => { st.v[i.name] = i.value; });
            const lk = box.querySelector('[name=so2_link]'); if (lk) st.link = lk.value.trim();
            const tx = box.querySelector('[name=so2_text]'); if (tx) st.text = tx.value;
            const same = box.querySelector('[name=so2_same]:checked'); if (same) st.same = same.value;
            box.querySelectorAll('[data-so2-add]').forEach(c => { st.toggled[c.dataset.so2Add] = c.checked; });
            return st.v;
        };
        const proposals = () => S2().proposals(st.kind, st.v, {events: st.fiche?.events || [], hasSpouse: !!st.fiche?.hasSpouse, hasVoyage: !!st.fiche?.hasVoyage})
            .map(p => ({...p, checked: st.toggled[p.id] ?? p.checked}));
        const propsHtml = () => {
            const list = proposals(); if (!list.length) return '';
            return `<fieldset class="so-props so2-props"><legend>Ce qui sera ajouté (rien n’est remplacé)</legend>${list.map(p => `<label class="checkbox-line"><input type="checkbox" data-so2-add="${esc(p.id)}" ${p.checked ? 'checked' : ''}>
                <span><b>${esc(p.label)}</b>${[p.date, p.place, p.title].filter(Boolean).length ? ` — ${esc([p.date, p.place, p.title].filter(Boolean).join(' · '))}` : ''}${p.exists ? `<br><small class="ui-hint">Déjà sur la fiche : ${esc(p.exists)} (gardé)</small>` : p.why ? `<br><small class="ui-hint">${esc(p.why)}</small>` : ''}</span></label>`).join('')}</fieldset>`;
        };
        const ecartsHtml = () => !st.pid ? `<li class="so-ecart is-info">ℹ️ Choisis la fiche : l’app comparera le document avec elle.</li>`
            : st.ecarts.length ? st.ecarts.map(e => `<li class="so-ecart is-${esc(e.level)}">${e.level === 'orange' ? '🟠' : e.level === 'yellow' ? '🟡' : 'ℹ️'} ${esc(e.text)}</li>`).join('') : `<li class="so-ecart is-ok">✓ Le nom, le prénom et les dates ne contredisent pas la fiche.</li>`;
        let ecT = 0;
        const recheck = body => { clearTimeout(ecT); ecT = setTimeout(async () => { read(body); await loadFiche(); const ul = body.querySelector('[data-so2-ecarts]'); if (ul) ul.innerHTML = ecartsHtml(); const pr = body.querySelector('[data-so2-props]'); if (pr) pr.innerHTML = propsHtml(); }, 350); };
        const targetHtml = () => {
            if (st.target?.type === 'object' || (st.target && o.target)) return `<div class="so-imp-who"><span class="pk-lab">À compléter</span> <b>${esc({place: '📍', house: '🏠', object: '🏺'}[st.target.type] || '')} ${esc(st.target.name || '')}</b></div>`;
            return `<div class="so-imp-who"><span class="pk-lab">Le lieu ou la maison à compléter</span>${pickerField({name: 'so2_target', kind: 'place,house', value: st.target?.id || null})}</div>`;
        };
        const draw = body => {
            const box = body.querySelector('[data-so2-imp]'); if (!box) return;
            const k = K()[st.kind];
            const who = noPerson() ? targetHtml() : st.fiche && o.personId ? `<div class="so-imp-who"><span class="pk-lab">Fiche</span> <b>${esc(st.fiche.first)} ${esc(String(st.fiche.last || '').toUpperCase())}</b></div>`
                : `<div class="so-imp-who"><span class="pk-lab">À qui se rapporte ce document ?</span>${pickerField({name: 'so2_pid', kind: 'person', value: st.pid || null})}</div>`;
            const opts = GROUP_ORDER.map(g => { const ks = [...new Set(S2().SITES.filter(s => s.group === g).map(s => s.kind))]; return `<optgroup label="${esc(S2().GROUPS[g].label)}">${ks.map(x => `<option value="${x}" ${x === st.kind ? 'selected' : ''}>${esc(K()[x].icon)} ${esc(K()[x].label)}</option>`).join('')}</optgroup>`; }).join('');
            box.innerHTML = `${who}
                <label class="so2-kind">Sorte de document<select name="so2_kind">${opts}</select></label>
                ${k.respect ? `<div class="so2-respect"><span aria-hidden="true">🕯</span><p>${esc(RESPECT_NOTE)}</p></div>` : ''}
                <div class="so-imp-grid${st.preview ? '' : ' is-noimg'}">${st.preview ? `<div class="so-imp-img">${st.preview}</div>` : ''}
                    <div class="so-fields"><p class="so-imp-badge">${UI().badge('À vérifier', 'yellow', {title: S2().MENTION})} <small class="muted">Recopie ce que dit le document ; laisse vide ce que tu ne sais pas.</small></p>
                    <div class="form-grid so-grid so2-f">${noPerson() ? '' : NAME_FIELDS.map(f => fieldHtml(f, st.v)).join('')}${k.fields.map(f => fieldHtml(f, st.v)).join('')}</div>
                    <div class="form-grid so-grid"><label class="so-span-2">Lien vers le document ou la notice<input name="so2_link" value="${esc(st.link)}" inputmode="url" placeholder="https://…" autocomplete="off"></label>
                        <label class="so-span-2">Texte copié (facultatif : gardé dans la source)<textarea name="so2_text" rows="3">${esc(st.text)}</textarea></label></div>
                    ${noPerson() ? '' : `<div class="so-ecarts-box"><h4>C’est la même personne ?</h4><ul class="so-ecarts" data-so2-ecarts>${ecartsHtml()}</ul>
                        <div class="so2-same"><label class="checkbox-line"><input type="radio" name="so2_same" value="yes" ${st.same === 'yes' ? 'checked' : ''}><span>Oui, c’est bien elle : ajouter à sa fiche ce qui est coché</span></label>
                        <label class="checkbox-line"><input type="radio" name="so2_same" value="no" ${st.same === 'no' ? 'checked' : ''}><span>Pas sûr : garder seulement le document et la source, sans rien ajouter à la fiche</span></label></div></div>`}
                    <div data-so2-props>${propsHtml()}</div></div></div>`;
        };
        const bind = body => {
            if (body._so2Bound) return; body._so2Bound = true;
            body.addEventListener('input', e => { if (e.target.closest('.so2-f')) recheck(body); });
            body.addEventListener('change', async e => {
                const n = e.target.name;
                if (n === 'so2_kind') { read(body); st.kind = e.target.value; if (st.text) st.v = {...S2().parseFields(st.text, st.kind), ...st.v}; st.toggled = {}; await loadFiche(); draw(body); }
                else if (n === 'so2_pid') { read(body); st.pid = Number(e.target.value) || 0; await loadFiche(); draw(body); }
                else if (n === 'so2_target') read(body); // le choix lui-même arrive par « picker-change »
                else if (e.target.closest('.so2-f')) recheck(body);
                else read(body);
            });
            body.addEventListener('picker-change', e => { if (e.detail?.name === 'so2_target') { const it = e.detail.item; st.target = it ? {type: it.kind === 'house' ? 'house' : 'place', id: it.id, name: it.title || ''} : null; } });
        };
        const run = async (an, files, body) => {
            read(body);
            const box = body.querySelector('[data-so2-imp]');
            if (noPerson() ? !st.target : !st.pid) { const f = box.querySelector('.so-imp-who .pk') || box.querySelector('.so-imp-who'); UI().fail?.(f, noPerson() ? 'Choisis le lieu ou la maison à compléter.' : 'Choisis la fiche à qui se rapporte ce document.'); return {keepOpen: true}; }
            const link = st.link.trim();
            if (link && !S2().cleanUrl(link)) { UI().fail?.(box.querySelector('[name=so2_link]'), 'Le lien doit commencer par https:// (ou http://).'); return {keepOpen: true}; }
            if (!st.file && !link && !st.text.trim() && !String(st.v.summary || '').trim()) { UI().fail?.(box.querySelector('[name=so2_link]'), 'Il faut un fichier, un lien ou le texte du document.'); return {keepOpen: true}; }
            const data = {kind: st.kind, person_id: noPerson() ? 0 : st.pid, url: link, fields: {...st.v, text: st.text}, same: st.same, adds: proposals(), target: noPerson() ? {type: st.target.type, id: st.target.id} : null};
            const fd = new FormData(); const csrf = A().state?.csrf || '';
            if (st.file) fd.append('file', st.file, st.file.name);
            fd.append('data', JSON.stringify(data)); fd.append('csrf', csrf);
            const headers = {'X-CSRF-Token': csrf, Accept: 'application/json', ...(typeof window.LCNDA_GENEALOGY === 'string' ? {'X-Genealogy': window.LCNDA_GENEALOGY} : {})};
            const resp = await fetch('api.php?action=so2_import', {method: 'POST', body: fd, headers});
            const j = await resp.json().catch(() => ({error: 'Réponse illisible du serveur'}));
            if (!resp.ok || j.error) throw new Error(j.error || `Erreur ${resp.status}`);
            const r = j.result; forget(st.pid); if (st.objUrl) URL.revokeObjectURL(st.objUrl);
            window.dispatchEvent(new CustomEvent('lcnda:sources-ouvertes-changed', {detail: r}));
            refresh();
            return {message: `${r.summary} — à vérifier sur le document.`, undo: async () => { await post('so2_undo', {batch: r.batch}); forget(st.pid); refresh(); }};
        };
        return UI().openImportDialog({title: 'Importer depuis d’autres archives', accept: 'image/*,.pdf,.html,.htm,.txt', what: 'image, PDF, page enregistrée ou texte',
            intro: 'Ce que tu as téléchargé ou enregistré : un décret, un acte, une notice, une page de registre en image ou en PDF, la page enregistrée par ton navigateur (« Enregistrer sous… »), ou un texte copié. Rien n’est demandé au site : seul ton fichier est lu. Pas de fichier ? « 🔗 Coller un lien ».',
            noun: 'document', analyze: async files => { const a = await analyze(files); const show = a.onShow; a.onShow = body => { body.closest('dialog')?.classList.add('modal-l', 'so-import', 'so2-import'); bind(body); show(body); }; return a; }, run, files: o.files});
    }
    /** pas de fichier : un lien collé → le seul « 🔗 Coller un lien » de l'app (il reconnaît le site et revient à openImport) */
    const openPasteLink = (o = {}) => ext.archives?.openPaste({...o, lot: 2});

    /* ═════ Les boutons posés dans l'app ═════ */
    const sBtn = (group, pid, label, title) => `<button type="button" class="button small secondary" data-so2-search="${esc(group)}" data-pid="${Number(pid) || 0}" title="${esc(title)}">${esc(label)}</button>`;
    const iBtn = (kind, pid, label = '⤒ Importer…') => `<button type="button" class="button small secondary" data-so2-import="${esc(kind)}" data-pid="${Number(pid) || 0}" title="Range le document trouvé, crée la source et propose ce qu’il dit">${esc(label)}</button>`;
    /** les boutons d'un bloc de la fiche : military · voyage · probate · resistance */
    function blockButtons(where, pid, editOnly = h => h) {
        if (!pid) return '';
        if (where === 'military') return sBtn('shd', pid, '⚓ Inscrits maritimes, officiers (SHD)', 'Ouvre les inventaires du Service historique de la Défense dans ton navigateur') + editOnly(iBtn('shd_marin', pid, '⤒ Importer (SHD)…'));
        if (where === 'voyage') return sBtn('an', pid, '🏛 Naturalisation', 'Les décrets de naturalisation (Archives nationales)') + sBtn('etranger', pid, '🗽 Ellis Island, Belgique, Suisse', 'Les passagers d’Ellis Island et les archives étrangères') + editOnly(iBtn('ellis', pid, '⤒ Importer…'));
        if (where === 'probate') return sBtn('an', pid, '✒ Minutier central', 'Les actes des notaires de Paris (Archives nationales)') + editOnly(iBtn('minutier', pid, '⤒ Importer un acte…'));
        if (where === 'resistance') return sBtn('memoire', pid, '🕯 Mémoire de la déportation et des fusillés', 'Mémorial de la Shoah, Livre-Mémorial des déportés, Maitron des fusillés') + editOnly(iBtn('deportation', pid, '⤒ Importer une notice…'));
        return '';
    }
    /** la monographie d'un lieu : sa description (avec les notices importées) et Mérimée / Palissy */
    function placeHtml(place) {
        if (!place || !Number(place.id)) return '';
        const desc = String(place.description || '').trim();
        const t = `data-so2-pop="place" data-id="${Number(place.id)}" data-name="${esc(place.name || '')}" data-place="${esc(place.name || '')}"`;
        return `<div class="so2-place">${desc ? `<details class="so2-desc"><summary>📜 Description et notices</summary><p class="so2-desc-text">${esc(desc)}</p></details>` : ''}
            <p class="so-row"><button type="button" class="button small secondary" ${t}>🏰 Mérimée, Palissy (patrimoine)</button></p></div>`;
    }
    /** la carte d'un objet de famille : Palissy */
    const objectButton = obj => obj?.id ? `<button type="button" class="button small secondary" data-so2-pop="object" data-id="${Number(obj.id)}" data-name="${esc(obj.title || '')}" data-place="${esc(obj.location_text || '')}">🏺 Palissy (patrimoine)</button>` : '';
    document.addEventListener('click', e => {
        const s = e.target.closest('[data-so2-search]'); if (s) { e.preventDefault(); openSearch({personId: Number(s.dataset.pid) || 0, group: s.dataset.so2Search || undefined}); return; }
        const im = e.target.closest('[data-so2-import]'); if (im) { e.preventDefault(); openImport({personId: Number(im.dataset.pid) || 0, kind: im.dataset.so2Import || undefined}); return; }
        const pl = e.target.closest('[data-so2-paste]'); if (pl) { e.preventDefault(); openPasteLink({personId: Number(pl.dataset.pid) || 0}); return; }
        const pop = e.target.closest('[data-so2-pop]');
        if (pop) { e.preventDefault(); const d = pop.dataset; openSearch({group: 'patrimoine', target: {type: d.so2Pop, id: Number(d.id) || 0, name: d.name || '', place: d.place || ''}}); }
    });

    ext.sourcesOuvertes2 = {openSearch, openImport, openPasteLink, openSettings, blockButtons, placeHtml, objectButton, archives: {help: GROUP_HELP}};
})();
