/* LCNDA — 🗂 Archives en ligne : 🎖 Mémoire des hommes · 🏅 Léonore · 📋 registres matricules · 📰 presse ancienne (les écrans).
 * Même principe que les recensements SocFace (heritage-socface.js), validé par l'utilisateur :
 *  - « 🔍 Chercher » ouvre le NAVIGATEUR sur la recherche du site, champs déjà remplis (nom, prénom, années, lieu, unité…) ;
 *    l'app n'interroge jamais ces sites. L'adresse ouverte est montrée telle quelle ; « ⚙️ Adresses des sites » la change (K2).
 *  - « ⤒ Importer ce que tu as trouvé » (fenêtre K13) : image, PDF, page enregistrée (.html : on n'en garde que le texte),
 *    texte (.txt) ou lien collé + saisie aidée → média relié à la fiche, source avec le lien, et selon la sorte : décès
 *    « Mort pour la France » proposé + case MPF, récompense (🏆), cases vides du bloc Militaire, passage (📰). Rien n'est
 *    écrasé ; « c'est la même personne ? » avant ; « ↶ Annuler » après (H7). Tout reste « À vérifier ».
 * Entrées : blocs Poilu 14-18, Militaire, 🏆 Concours et récompenses, 📰 Dans les médias, « Chercher sur internet » (fiche et
 * Recherche). Calculs purs : app-sources-ouvertes-core.js (LCNDA_SOURCES_OUVERTES). Serveur : lib/sources_ouvertes.php.
 * Mode d'emploi : docs/UI.md (« 🗂 Archives en ligne »).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const SO = () => window.LCNDA_SOURCES_OUVERTES;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body}).then(r => r?.result ?? r);
    const KEY = 'genealogie-sources-ouvertes-sites';
    const TAB_KEY = 'genealogie-sources-ouvertes-tab';
    const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
    const custom = () => { try { const o = JSON.parse(lsGet(KEY, '{}')); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; } };
    const GROUP_ORDER = ['mdh', 'leonore', 'matricules', 'presse'];
    const KIND_OF = {mdh: 'mdh', leonore: 'leonore', matricules: 'matricule', presse: 'presse'};
    const GROUP_OF = {mdh: 'mdh', leonore: 'leonore', matricule: 'matricules', presse: 'presse'};
    const empty = (t, i = '📭') => `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">${i}</span><span class="empty-line-text">${esc(t)}</span></p>`;
    const pickerField = o => (window.LCNDA_PICKER || A()).pickerField(o);
    const ctxCache = new Map();
    const context = async pid => { const k = Number(pid) || 0; if (!ctxCache.has(k)) ctxCache.set(k, api('so_context', {person_id: k}).catch(e => { ctxCache.delete(k); throw e; })); return ctxCache.get(k); };
    const forget = pid => { ctxCache.delete(Number(pid) || 0); };
    const refresh = () => { try { A().refreshScreen?.(); } catch (_) {} };

    /* ═════ 🔍 Chercher : la fenêtre qui prépare les adresses ═════ */
    function paramsFrom(ctx) {
        const p = ctx?.person || {};
        const life = [p.birth_year || '', p.death_year || (p.birth_year ? Math.min(Number(p.birth_year) + 90, new Date().getFullYear()) : '')];
        return {first: String(p.first || '').split(/\s+/)[0] || '', last: p.last || '', place: (ctx?.birth?.place || ctx?.places?.[0] || '').split(',')[0], y1: life[0], y2: life[1],
            birthYear: p.birth_year || '', deathYear: p.death_year || '', unit: ctx?.units?.[0]?.unit_name || '', dept: ctx?.dept?.code || '', deptName: ctx?.dept?.name || '', adUrl: ctx?.dept?.url || ''};
    }
    function linksHtml(group, p) {
        const sites = SO().SITES.filter(s => s.group === group), cu = custom();
        const rows = sites.map(s => {
            const u = SO().url(s.key, p, cu);
            const why = !u ? (s.needs === 'unit' ? 'Indique son unité (régiment…) pour trouver le journal de marche.' : s.needs === 'adUrl' ? 'Choisis le département pour ouvrir le site de ses archives.' : 'Indique au moins un nom.') : '';
            return `<li class="so-link">
                <span class="so-link-ico" aria-hidden="true">${esc(s.icon)}</span>
                <span class="so-link-main"><b>${esc(s.label)}</b>${s.paid ? ` ${UI().badge('En partie payant', 'yellow', {title: 'Une partie des journaux et la lecture complète demandent un abonnement'})}` : ''}${cu[s.key] ? ` ${UI().badge('Adresse à toi', 'blue')}` : ''}
                    ${u ? `<code class="so-url" data-so-url="${esc(s.key)}">${esc(u)}</code>` : `<small class="ui-hint">${esc(why)}</small>`}</span>
                ${u ? `<a class="button small" href="${esc(u)}" target="_blank" rel="noopener noreferrer" data-so-go="${esc(s.key)}">↗ Ouvrir</a>` : `<button type="button" class="button small" disabled>↗ Ouvrir</button>`}</li>`;
        }).join('');
        return `<ul class="so-links">${rows}</ul>`;
    }
    const GROUP_HELP = {
        mdh: 'Mémoire des hommes (ministère des Armées) : les fiches des soldats « Morts pour la France » des deux guerres, les sépultures de guerre, les militaires décédés et les marins, et les journaux de marche des unités. Ses bases ne gardent pas la recherche dans l’adresse : l’app ouvre une recherche limitée à ce site, avec son nom et son prénom.',
        leonore: 'Léonore (Archives nationales) : les dossiers des membres de la Légion d’honneur morts avant 1977 — souvent l’acte de naissance, le grade, la date de nomination, parfois une photo.',
        matricules: 'Les registres matricules (au service militaire, vers 20 ans) : numéro, classe, bureau de recrutement, signalement (cheveux, yeux, taille, instruction), campagnes, blessures, adresses successives. Ils sont sur le site des Archives du département où il habitait à 20 ans.',
        presse: 'Les journaux anciens numérisés. Gallica (BnF) est gratuit ; RetroNews (BnF) est en partie payant (certains journaux et la lecture complète demandent un abonnement) ; Europeana réunit des journaux de toute l’Europe. Un nom seul trouve beaucoup d’homonymes : ajoute le lieu et la période.',
    };
    function openSearch(o = {}) {
        const dlg = document.createElement('dialog'); dlg.className = 'modal modal-l so-search';
        let group = GROUP_ORDER.includes(o.group) ? o.group : GROUP_OF[o.kind] || lsGet(TAB_KEY, 'mdh'); if (!GROUP_ORDER.includes(group)) group = 'mdh';
        let ctx = null, pid = Number(o.personId) || 0;
        const tabs = () => `<div class="segmented so-tabs" role="tablist">${GROUP_ORDER.map(g => `<button type="button" role="tab" class="${g === group ? 'is-active' : ''}" aria-selected="${g === group}" data-so-tab="${g}">${esc(SO().GROUPS[g].icon)} ${esc(SO().GROUPS[g].label)}</button>`).join('')}</div>`;
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">ARCHIVES EN LIGNE</span><h2>🔍 Chercher dans les archives en ligne</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="h-dialog-body so-search-body" data-so-body>${UI().spinner('Ce que la fiche sait…')}</div>
            <div class="modal-actions"><button type="button" class="button secondary" data-so-settings>⚙️ Adresses des sites</button><span class="spacer"></span><button type="button" class="button secondary" data-so-paste-in>🔗 Coller un lien</button><button type="button" class="button secondary" data-so-import-from-search>⤒ Importer ce que tu as trouvé…</button><button type="button" class="button" data-x>Fermer</button></div></form>`;
        document.body.appendChild(dlg);
        const body = dlg.querySelector('[data-so-body]');
        const val = () => { const f = dlg.querySelector('form'); const v = Object.fromEntries(new FormData(f)); v.withFirst = !!f.querySelector('[name=with_first]')?.checked || !f.querySelector('[name=with_first]');
            const d = (ctx?.depts || []).find(x => x.code === v.dept); v.adUrl = d?.url || ''; v.deptName = d?.name || ''; return v; };
        const updLinks = () => { const box = body.querySelector('[data-so-links]'); if (box) box.innerHTML = linksHtml(group, val());
            const cl = body.querySelector('[data-so-classe]'); if (cl) { const c = SO().classOf(val().birthYear); cl.innerHTML = c.classe ? `<b>Classe ${c.classe}</b> — ${esc(c.text)}` : esc(c.text); } };
        const draw = () => {
            const p = paramsFrom(ctx), d = ctx?.dept;
            const living = ctx?.person && SO().livingRisk(ctx.person);
            const extra = {
                mdh: `<label>Unité (régiment…)<input name="unit" value="${esc(p.unit)}" placeholder="152e régiment d’infanterie" autocomplete="off"></label>`,
                leonore: '',
                matricules: `<label>Né en<input name="birthYear" type="number" min="1800" max="1960" value="${esc(p.birthYear)}"></label>
                    <label>Département où il habitait à 20 ans<select name="dept"><option value="">—</option>${(ctx?.depts || []).map(x => `<option value="${esc(x.code)}" ${x.code === (d?.code || '') ? 'selected' : ''}>${esc(x.code)} · ${esc(x.name)}</option>`).join('')}</select></label>`,
                presse: `<label class="ui-toggle so-span-2"><input type="checkbox" name="with_first" checked><i></i>Avec le prénom (sans lui, plus de résultats et plus d’homonymes)</label>`,
            }[group];
            body.innerHTML = `${tabs()}
                ${o.personId ? '' : `<div class="so-who"><span class="pk-lab">À partir d’une fiche (facultatif)</span>${pickerField({name: 'so_pid', kind: 'person', value: pid || null})}</div>`}
                ${living ? UI().notice('warn', 'Cette personne est peut-être vivante : ces recherches restent dans ton navigateur, rien n’est partagé. Pense à sa vie privée.') : ''}
                <p class="so-help">${esc(GROUP_HELP[group])}</p>
                <div class="form-grid so-grid">
                    <label>Nom<input name="last" value="${esc(p.last)}" autocomplete="off"></label>
                    <label>Prénom<input name="first" value="${esc(p.first)}" autocomplete="off"></label>
                    <label>Lieu<input name="place" value="${esc(p.place)}" autocomplete="off" placeholder="Tulle, Saint-Martin…"></label>
                    <label>De l’année<input name="y1" type="number" min="1500" max="2100" value="${esc(p.y1)}"></label>
                    <label>à l’année<input name="y2" type="number" min="1500" max="2100" value="${esc(p.y2)}"></label>
                    ${extra}
                </div>
                ${group === 'matricules' ? `<p class="so-classe" data-so-classe></p>${d ? `<p class="ui-hint">Département trouvé d’après ${esc(ctx?.at20 ? `« ${ctx.at20.label} » à ${ctx.at20.place} (${ctx.at20.year})` : `sa naissance à ${ctx?.birth?.place || '?'}`)}. Le bureau de recrutement est celui du lieu où il habitait à 20 ans : sur le site des archives, cherche « registres matricules », puis la classe et le bureau.</p>` : ''}` : ''}
                ${UI().notice('info', 'Chaque recherche s’ouvre dans ton navigateur. L’app n’envoie rien d’autre que ce que tu vois dans l’adresse, et ne se connecte jamais à ces sites.')}
                <div data-so-links></div>
                <p class="ui-hint">Ce qu’on lit sur ces sites est à vérifier : homonymes, fautes de lecture. Ensuite, enregistre la fiche (image, PDF, page) ou copie son lien, et fais « ⤒ Importer ce que tu as trouvé ».</p>`;
            updLinks();
        };
        dlg.addEventListener('input', e => { if (e.target.closest('.so-grid')) updLinks(); });
        dlg.addEventListener('change', async e => {
            if (e.target.closest('.so-grid')) updLinks();
            if (e.target.name === 'so_pid') { pid = Number(e.target.value) || 0; try { ctx = await context(pid); } catch (err) { toast(err.message, 'error'); } draw(); }
        });
        dlg.addEventListener('click', e => {
            if (e.target.closest('[data-x]')) { dlg.close(); return; }
            const t = e.target.closest('[data-so-tab]'); if (t) { group = t.dataset.soTab; try { localStorage.setItem(TAB_KEY, group); } catch (_) {} const keep = val(); draw(); ['last', 'first', 'place', 'y1', 'y2'].forEach(k => { const el = dlg.querySelector(`[name=${k}]`); if (el && keep[k] !== undefined) el.value = keep[k]; }); updLinks(); return; }
            if (e.target.closest('[data-so-settings]')) { openSettings(() => updLinks()); return; }
            if (e.target.closest('[data-so-import-from-search]')) { dlg.close(); openImport({personId: pid, kind: KIND_OF[group]}); }
            if (e.target.closest('[data-so-paste-in]')) { dlg.close(); openPasteLink({personId: pid, kind: KIND_OF[group]}); }
        });
        dlg.addEventListener('close', () => dlg.remove());
        dlg.showModal();
        context(pid).then(c => { ctx = c; draw(); }).catch(err => { body.innerHTML = UI().notice('error', err.message); });
        return dlg;
    }

    /* ═════ ⚙️ Adresses des sites (K2 : chaque changement est gardé tout de suite) ═════ */
    function openSettings(onChange) {
        const dlg = document.createElement('dialog'); dlg.className = 'modal so-settings';
        const rows = () => { const cu = custom(); return SO().SITES.filter(s => s.key !== 'matricules_ad').map(s => `<div class="so-set-row"><label><span><b>${esc(s.icon)} ${esc(s.label)}</b></span>
            <input name="${esc(s.key)}" value="${esc(cu[s.key] || '')}" placeholder="${esc(SO().url(s.key, {first: '{prénom}', last: '{nom}'}).replace(/%7B/g, '{').replace(/%7D/g, '}').replace(/%C3%A9/g, 'é'))}" autocomplete="off" spellcheck="false"></label></div>`).join(''); };
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">ARCHIVES EN LIGNE · RÉGLAGES</span><h2>⚙️ Adresses des sites</h2></div><button type="button" class="button small secondary" data-ui-reset>↺ Remettre comme au départ</button><button type="button" class="icon-button" data-ui-x aria-label="Fermer">×</button></div>
            <div class="h-dialog-body"><p class="ui-hint">Si un site change son adresse de recherche, écris la nouvelle ici. Case vide = l’adresse de l’app (en gris). Mots remplacés : {nom}, {prénom}, {nom_complet}, {lieu}, {de}, {à}, {naissance}, {décès}, {classe}, {unité}, {département}. Seules les adresses en http(s) sont gardées.</p>
            <div class="so-set" data-so-set>${rows()}</div></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button" data-ui-x>Fermer</button></div></form>`;
        document.body.appendChild(dlg);
        UI().autoSaveDialog(dlg, {keys: [KEY], label: 'Adresse d’un site',
            save: () => { const o = {}; dlg.querySelectorAll('[data-so-set] input').forEach(i => { const v = i.value.trim(); if (v && SO().cleanUrl(v.replace(/[{}]/g, ''))) o[i.name] = v.slice(0, 600); }); if (Object.keys(o).length) localStorage.setItem(KEY, JSON.stringify(o)); else localStorage.removeItem(KEY); },
            reload: () => { dlg.querySelector('[data-so-set]').innerHTML = rows(); },
            reset: () => { try { localStorage.removeItem(KEY); } catch (_) {} },
            onChange: () => onChange?.()});
        dlg.addEventListener('click', e => { if (e.target.closest('[data-ui-x]')) dlg.close(); });
        dlg.addEventListener('close', () => { onChange?.(); dlg.remove(); });
        dlg.showModal();
        return dlg;
    }

    /* ═════ ⤒ Importer ce qu'on a téléchargé (K13) ═════ */
    const KIND_LABEL = {mdh: '🎖 Mémoire des hommes', leonore: '🏅 Léonore', matricule: '📋 Registre matricule', presse: '📰 Presse ancienne'};
    const GRADES = ['chevalier', 'officier', 'commandeur', 'grand officier', 'grand-croix'];
    const PTYPES = [['article', 'Article'], ['faits_divers', 'Faits divers'], ['necrologie', 'Nécrologie'], ['naissance', 'Avis de naissance'], ['mariage', 'Avis de mariage'], ['deces', 'Avis de décès'], ['annonce', 'Petite annonce'], ['palmares', 'Résultats, palmarès'], ['portrait', 'Portrait'], ['citation', 'Citation'], ['autre', 'Autre']];
    const fld = (name, label, value = '', a = '') => `<label>${esc(label)}<input name="${esc(name)}" value="${esc(value ?? '')}" autocomplete="off" ${a}></label>`;
    const area = (name, label, value = '', rows = 3, a = '') => `<label class="so-span-2">${esc(label)}<textarea name="${esc(name)}" rows="${rows}" ${a}>${esc(value ?? '')}</textarea></label>`;
    function fieldsHtml(kind, v, ctx) {
        const mil = ctx?.military || {};
        const had = k => mil[k] ? `placeholder="déjà sur la fiche : ${esc(String(mil[k]).slice(0, 60))} (gardé)"` : '';
        const p = ctx?.person || {};
        if (kind === 'mdh') {
            const bases = SO().SITES.filter(s => s.group === 'mdh' && s.key !== 'mdh_jmo');
            return `<label>Base<select name="base">${bases.map(s => `<option ${v.base === s.label ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>
                ${fld('last', 'Nom', v.last ?? p.last)}${fld('first', 'Prénoms', v.first ?? p.first)}
                ${fld('birth_date', 'Date de naissance', v.birth_date, 'data-ui-date placeholder="12 mars 1890"')}${fld('birth_place', 'Lieu de naissance', v.birth_place)}
                ${fld('rank', 'Grade', v.rank, 'placeholder="soldat de 2e classe"')}${fld('unit', 'Unité', v.unit, 'placeholder="152e régiment d’infanterie"')}
                ${fld('matricule', 'Matricule au corps · classe · recrutement', v.matricule)}
                ${fld('death_date', 'Date du décès', v.death_date, 'data-ui-date placeholder="20 août 1914"')}
                <div class="so-pk"><span class="pk-lab">Lieu du décès</span>${pickerField({name: 'place_id', kind: 'place', value: null})}${v.death_place ? `<small class="ui-hint">Lu : « ${esc(v.death_place)} » — choisis le lieu (ou crée-le).</small>` : ''}</div>
                ${fld('cause', 'Genre de mort', v.cause, 'placeholder="tué à l’ennemi, des suites de blessures…"')}`;
        }
        if (kind === 'leonore') {
            return `${fld('last', 'Nom', v.last ?? p.last)}${fld('first', 'Prénoms', v.first ?? p.first)}${fld('birth_date', 'Date de naissance', v.birth_date, 'data-ui-date')}
                <label>Grade<input name="grade" value="${esc(v.grade || '')}" list="so-grades" autocomplete="off" placeholder="chevalier"><datalist id="so-grades">${GRADES.map(g => `<option value="${esc(g)}">`).join('')}</datalist></label>
                ${fld('date', 'Date de nomination', v.date, 'data-ui-date placeholder="14 juillet 1920"')}${fld('decree', 'Décret · promotion', v.decree, 'placeholder="décret du 12 juillet 1920"')}
                ${fld('cote', 'N° de dossier (cote)', v.cote, 'placeholder="LH/2154/34, 19800035/…"')}`;
        }
        if (kind === 'matricule') {
            const c = SO().classOf(p.birth_year);
            return `${fld('matricule', 'N° matricule', v.matricule, had('matricule'))}${fld('classe_mobilisation', 'Classe', v.classe_mobilisation ?? (mil.classe_mobilisation ? '' : c.classe || ''), had('classe_mobilisation'))}
                ${fld('bureau_recrutement', 'Bureau de recrutement', v.bureau_recrutement, had('bureau_recrutement') || 'placeholder="Tulle"')}${fld('service', 'Service d’archives', v.service ?? (ctx?.dept?.service || ''))}
                ${fld('cheveux', 'Cheveux', v.cheveux, had('cheveux'))}${fld('yeux', 'Yeux', v.yeux, had('yeux'))}${fld('taille', 'Taille', v.taille, had('taille') || 'placeholder="1 m 68"')}
                ${fld('degre_instruction_gen', 'Degré d’instruction', v.degre_instruction_gen, had('degre_instruction_gen') || 'placeholder="3"')}
                ${area('campagnes', 'Campagnes', v.campagnes, 2, 'placeholder="contre l’Allemagne du 2 août 1914 au…"')}${area('blessures', 'Blessures, citations, décorations', v.blessures, 2)}
                ${area('localites_successives', 'Adresses successives', v.localites_successives, 2, had('localites_successives'))}
                ${c.classe ? `<p class="ui-hint so-span-2">${esc(c.text)}</p>` : ''}`;
        }
        return `<label>Site<select name="site">${[['gallica', 'Gallica (BnF)'], ['retronews', 'RetroNews (BnF)'], ['europeana', 'Europeana'], ['', 'Autre']].map(([k, l]) => `<option value="${k}" ${v.site === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            ${fld('journal', 'Journal', v.journal, 'placeholder="Le Petit Journal"')}${fld('date', 'Date', v.date, 'data-ui-date placeholder="12 mai 1905"')}${fld('page', 'Page', v.page, 'placeholder="3"')}
            ${fld('title', 'Titre de l’article', v.title, 'placeholder="Un drame à Tulle"')}
            <label>Sorte<select name="ptype">${PTYPES.map(([k, l]) => `<option value="${k}" ${v.ptype === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    }
    function proposalsHtml(kind, ctx, v) {
        if (kind !== 'mdh') return '';
        const p = ctx?.person || {};
        const mpfLocked = p.mpf === 'yes' || p.mpf === 'no';
        return `<fieldset class="so-props"><legend>Ce qui sera proposé sur la fiche (rien n’est remplacé)</legend>
            <label class="checkbox-line"><input type="checkbox" name="add_death" ${ctx?.has_death ? 'disabled' : 'checked'}><span>Ajouter le décès « Mort pour la France »${ctx?.has_death ? ' — la fiche a déjà un décès : il est gardé' : ''}</span></label>
            <label class="checkbox-line"><input type="checkbox" name="set_mpf" ${mpfLocked ? 'disabled' : v.mpf === 'yes' ? 'checked' : ''}><span>Cocher « Mort pour la France » sur la fiche${p.mpf === 'yes' ? ' — déjà coché' : p.mpf === 'no' ? ' — la fiche dit « non » : change-la toi-même si le document dit « oui »' : ''}</span></label>
            <label class="checkbox-line"><input type="checkbox" name="add_unit" checked><span>Ajouter son unité au bloc « Poilu 14-18 » (si elle n’y est pas)</span></label></fieldset>`;
    }
    const readText = f => f.arrayBuffer().then(b => window.LCNDA_SHEET?.decodeBytes ? window.LCNDA_SHEET.decodeBytes(new Uint8Array(b)).text : new TextDecoder().decode(b));
    function openImport(o = {}) {
        let st = {kind: ['mdh', 'leonore', 'matricule', 'presse'].includes(o.kind) ? o.kind : 'mdh', pid: Number(o.personId) || 0, ctx: null, file: null, link: o.link || '', text: o.text || '', v: {}, objUrl: ''};
        const analyze = async files => {
            const f = files[0]; if (!f) throw new Error('aucun fichier');
            const ext = (f.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
            if (f.size > 60 * 1048576) throw new Error('fichier trop gros (60 Mo au plus)');
            st.file = null; st.preview = '';
            if (o.linkOnly) { /* lien collé : rien à ranger dans les médias */ }
            else if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) { st.file = f; if (st.objUrl) URL.revokeObjectURL(st.objUrl); st.objUrl = URL.createObjectURL(f); st.preview = `<img src="${esc(st.objUrl)}" alt="Le document importé">`; }
            else if (ext === 'pdf') { st.file = f; st.preview = `<div class="so-pdf">📄 <b>${esc(f.name)}</b><br><small>Le PDF sera rangé dans les médias. Recopie à côté ce qu’il dit.</small></div>`; }
            else if (ext === 'html' || ext === 'htm') { const pg = SO().parseSavedPage(await readText(f)); st.text = pg.text; st.link = st.link || pg.url; st.v.title = st.v.title || pg.title; st.preview = `<div class="so-pdf">🌐 <b>${esc(pg.title || f.name)}</b><br><small>Page enregistrée : seul son texte est gardé (dans la source), pas la page elle-même.</small></div>`; }
            else if (ext === 'txt') { st.file = o.linkOnly ? null : f; st.text = st.text || await readText(f); st.preview = `<div class="so-pdf">📝 <b>${esc(f.name)}</b></div>`; }
            else throw new Error('ici : une image (JPG, PNG, WebP, GIF), un PDF, une page enregistrée (.html) ou un texte (.txt)');
            // ce que le lien et le texte disent déjà
            const lk = SO().parseLink(st.link);
            if (lk.site === 'retronews' || lk.site === 'gallica' || lk.site === 'europeana') { st.kind = o.kind || 'presse'; st.v.site = lk.site; }
            if (lk.site === 'leonore' && !o.kind) st.kind = 'leonore';
            if (lk.site === 'mdh' && !o.kind) st.kind = 'mdh';
            Object.assign(st.v, Object.fromEntries(Object.entries({journal: lk.journal, date: lk.date, page: lk.page, cote: lk.cote}).filter(([, x]) => x)));
            if (st.text) Object.assign(st.v, SO().parseFields(st.text, st.kind), {...st.v});
            if (st.pid) { forget(st.pid); st.ctx = await context(st.pid); }
            return {count: 1, noun: 'document', summaryHtml: `<b>un document</b> pour ${st.ctx ? `<b>${esc([st.ctx.person.first, String(st.ctx.person.last || '').toUpperCase()].join(' '))}</b>` : 'la fiche choisie ci-dessous'}`,
                notices: [{kind: 'warn', text: `${SO().MENTION}. Le document entre « À vérifier ».`}, {kind: 'info', text: 'Rien de la fiche n’est remplacé : seules les cases vides sont remplies, et « ↶ Annuler » retire tout ce que l’import a ajouté.'}],
                preview: `<div class="so-imp" data-so-imp></div>`, onShow: body => draw(body)};
        };
        const read = body => {
            const box = body.querySelector('[data-so-imp]'); if (!box) return st.v;
            box.querySelectorAll('.so-fields input[name], .so-fields select[name], .so-fields textarea[name]').forEach(i => { if (i.type !== 'checkbox' && i.name !== 'place_id' && !i.name.startsWith('so_')) st.v[i.name] = i.value; });
            const lk = box.querySelector('[name=so_link]'); if (lk) st.link = lk.value.trim();
            const tx = box.querySelector('[name=so_text]'); if (tx) st.text = tx.value;
            return st.v;
        };
        let ecT = 0;
        const ecarts = body => {
            clearTimeout(ecT);
            ecT = setTimeout(async () => {
                const ul = body.querySelector('[data-so-ecarts]'); if (!ul) return;
                if (!st.pid) { ul.innerHTML = `<li class="so-ecart is-info">ℹ️ Choisis la fiche : l’app comparera le document avec elle.</li>`; return; }
                try {
                    const r = await post('so_preview', {kind: st.kind, person_id: st.pid, url: SO().cleanUrl(st.link), fields: read(body)});
                    ul.innerHTML = r.ecarts.length ? r.ecarts.map(e => `<li class="so-ecart is-${esc(e.level)}">${e.level === 'orange' ? '🟠' : e.level === 'yellow' ? '🟡' : 'ℹ️'} ${esc(e.text)}</li>`).join('') : `<li class="so-ecart is-ok">✓ Le nom, le prénom et les dates ne contredisent pas la fiche.</li>`;
                } catch (e) { ul.innerHTML = `<li class="so-ecart is-orange">⛔ ${esc(e.message)}</li>`; }
            }, 350);
        };
        const draw = body => {
            const box = body.querySelector('[data-so-imp]'); if (!box) return;
            box.innerHTML = `<div class="so-imp-who">${st.ctx && o.personId ? `<span class="pk-lab">Fiche</span> <b>${esc(st.ctx.person.first)} ${esc(String(st.ctx.person.last || '').toUpperCase())}</b>` : `<span class="pk-lab">À qui se rapporte ce document ?</span>${pickerField({name: 'so_pid', kind: 'person', value: st.pid || null})}`}</div>
                <div class="segmented so-kinds" role="tablist" aria-label="Sorte de document">${Object.entries(KIND_LABEL).map(([k, l]) => `<button type="button" class="${k === st.kind ? 'is-active' : ''}" aria-selected="${k === st.kind}" data-so-kind="${k}">${esc(l)}</button>`).join('')}</div>
                <div class="so-imp-grid${st.preview ? '' : ' is-noimg'}">${st.preview ? `<div class="so-imp-img">${st.preview}</div>` : ''}
                    <div class="so-fields"><p class="so-imp-badge">${UI().badge('À vérifier', 'yellow', {title: SO().MENTION})} <small class="muted">Recopie ce que dit le document ; laisse vide ce que tu ne sais pas.</small></p>
                    <div class="form-grid so-grid">${fieldsHtml(st.kind, st.v, st.ctx)}
                        <label class="so-span-2">Lien vers la fiche ou l’article<input name="so_link" value="${esc(st.link)}" inputmode="url" placeholder="https://…" autocomplete="off"></label>
                        ${area('so_text', 'Texte copié (facultatif : gardé dans la source)', st.text, 3)}</div>
                    ${proposalsHtml(st.kind, st.ctx, st.v)}
                    <div class="so-ecarts-box"><h4>C’est la même personne ?</h4><ul class="so-ecarts" data-so-ecarts></ul></div></div></div>`;
            ecarts(body);
        };
        let bodyRef = null;
        const bind = body => {
            if (body._soBound) return; body._soBound = true; bodyRef = body;
            body.addEventListener('click', e => { const k = e.target.closest('[data-so-kind]'); if (!k) return; read(body); st.kind = k.dataset.soKind; if (st.text) st.v = {...SO().parseFields(st.text, st.kind), ...st.v}; draw(body); });
            body.addEventListener('input', e => { if (e.target.closest('.so-fields')) ecarts(body); });
            body.addEventListener('change', async e => {
                if (e.target.name === 'so_pid') { st.pid = Number(e.target.value) || 0; read(body); st.ctx = null; if (st.pid) { try { forget(st.pid); st.ctx = await context(st.pid); } catch (err) { toast(err.message, 'error'); } } draw(body); }
                else if (e.target.closest('.so-fields')) ecarts(body);
            });
        };
        const run = async (an, files, body) => {
            read(body);
            const box = body.querySelector('[data-so-imp]');
            if (!st.pid) { const f = box.querySelector('.so-imp-who .pk') || box.querySelector('.so-imp-who'); UI().fail?.(f, 'Choisis la fiche à qui se rapporte ce document.'); return {keepOpen: true}; }
            const link = st.link.trim();
            if (link && !SO().cleanUrl(link)) { UI().fail?.(box.querySelector('[name=so_link]'), 'Le lien doit commencer par https:// (ou http://).'); return {keepOpen: true}; }
            if (!st.file && !link && !st.text.trim()) { UI().fail?.(box.querySelector('[name=so_link]'), 'Il faut un fichier, un lien ou le texte du document.'); return {keepOpen: true}; }
            const ck = n => !!box.querySelector(`[name=${n}]:checked`);
            const placeId = box.querySelector('input[type=hidden][name=place_id]')?.value || '';
            const fields = {...st.v, text: st.text}; if (st.kind === 'mdh' && fields.mpf === undefined && ck('set_mpf')) fields.mpf = 'yes';
            const data = {kind: st.kind, person_id: st.pid, url: link, site: st.v.site || '', fields, add_death: ck('add_death'), set_mpf: ck('set_mpf'), add_unit: ck('add_unit'), place_id: placeId};
            const fd = new FormData(); const csrf = A().state?.csrf || '';
            if (st.file) fd.append('file', st.file, st.file.name);
            fd.append('data', JSON.stringify(data)); fd.append('csrf', csrf);
            const headers = {'X-CSRF-Token': csrf, Accept: 'application/json', ...(typeof window.LCNDA_GENEALOGY === 'string' ? {'X-Genealogy': window.LCNDA_GENEALOGY} : {})};
            const resp = await fetch('api.php?action=so_import', {method: 'POST', body: fd, headers});
            const j = await resp.json().catch(() => ({error: 'Réponse illisible du serveur'}));
            if (!resp.ok || j.error) throw new Error(j.error || `Erreur ${resp.status}`);
            const r = j.result; forget(st.pid); if (st.objUrl) URL.revokeObjectURL(st.objUrl);
            window.dispatchEvent(new CustomEvent('lcnda:sources-ouvertes-changed', {detail: r}));
            refresh();
            return {message: `${r.summary} — à vérifier sur le document.`, undo: async () => { await post('so_undo', {batch: r.batch}); forget(st.pid); refresh(); }};
        };
        const kindWord = {mdh: 'une fiche de Mémoire des hommes', leonore: 'un dossier Léonore', matricule: 'une page de registre matricule', presse: 'un article de journal'};
        return UI().openImportDialog({title: 'Importer depuis les archives en ligne', accept: 'image/*,.pdf,.html,.htm,.txt', what: 'image, PDF, page enregistrée ou texte',
            intro: `Ce que tu as téléchargé ou enregistré : ${kindWord[st.kind]} en image ou en PDF, la page enregistrée par ton navigateur (« Enregistrer sous… »), ou un texte copié. Rien n’est demandé au site : seul ton fichier est lu. Pas de fichier ? « 🔗 Coller un lien » dans la fenêtre de recherche.`,
            noun: 'document', analyze: async files => { const a = await analyze(files); const show = a.onShow; a.onShow = body => { body.closest('dialog')?.classList.add('modal-l', 'so-import'); bind(body); show(body); }; return a; }, run, files: o.files});
    }
    /** pas de fichier : un lien collé (et le texte de la fiche si on l'a) → la même fenêtre d'import */
    function openPasteLink(o = {}) {
        const dlg = document.createElement('dialog'); dlg.className = 'modal so-paste';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">ARCHIVES EN LIGNE</span><h2>🔗 Coller un lien</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="h-dialog-body"><label>Lien de la fiche ou de l’article<input name="link" inputmode="url" placeholder="https://gallica.bnf.fr/ark:/12148/…" autocomplete="off"></label>
            <p class="ui-hint">Copie l’adresse dans la barre de ton navigateur. Gallica, RetroNews, Europeana, Léonore et Mémoire des hommes sont reconnus : le journal, la date, la page sont remplis quand l’adresse les dit.</p>
            <label>Texte de la fiche (facultatif)<textarea name="text" rows="6" placeholder="Nom : DUPONT&#10;Prénoms : Jean Marie&#10;Date de décès : 20/08/1914…"></textarea></label></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>Annuler</button><button type="submit" class="button">Continuer</button></div></form>`;
        document.body.appendChild(dlg);
        dlg.addEventListener('click', e => { if (e.target.closest('[data-x]')) dlg.close(); });
        dlg.querySelector('form').addEventListener('submit', e => {
            e.preventDefault(); const link = dlg.querySelector('[name=link]').value.trim(), text = dlg.querySelector('[name=text]').value;
            if (!SO().cleanUrl(link)) return UI().fail?.(dlg.querySelector('[name=link]'), 'Colle une adresse qui commence par https://');
            dlg.close(); openImport({...o, link, text, linkOnly: true, files: [new File([text || link], 'lien-colle.txt', {type: 'text/plain'})]});
        });
        dlg.addEventListener('close', () => dlg.remove());
        dlg.showModal(); setTimeout(() => dlg.querySelector('[name=link]')?.focus(), 30);
        return dlg;
    }

    /* ═════ Les boutons posés dans les blocs de la fiche ═════ */
    const BTN = {
        mdh: ['🔍 Mémoire des hommes', 'Ouvre Mémoire des hommes dans ton navigateur, avec son nom et son prénom'],
        matricule: ['📋 Registre matricule', 'Sa classe, son département et le site des archives où chercher son registre matricule'],
        leonore: ['🔍 Léonore', 'Ouvre la base Léonore (Légion d’honneur) dans ton navigateur'],
        presse: ['🔍 Presse ancienne', 'Gallica, RetroNews, Europeana : nom, lieu et années déjà remplis'],
    };
    /** un bouton « 🔍 … » (data-so-search) : ouvre la fenêtre de recherche sur le bon onglet */
    const btn = (kind, pid) => `<button type="button" class="button small secondary" data-so-search="${esc(kind)}" data-pid="${Number(pid) || 0}" title="${esc(BTN[kind]?.[1] || '')}">${esc(BTN[kind]?.[0] || '🔍 Archives en ligne')}</button>`;
    /** « ⤒ Importer… » (une écriture : posé avec editOnly, caché sur une fiche verrouillée ou en consultation) */
    const importBtn = (kind, pid, label = '⤒ Importer…') => `<button type="button" class="button small secondary" data-so-import="${esc(kind)}" data-pid="${Number(pid) || 0}" title="Range l’image ou le PDF trouvé, crée la source et propose ce qu’il dit">${esc(label)}</button>`;
    /** la ligne de boutons du bloc Poilu */
    const poiluRow = (pid, editOnly = h => h) => `<p class="so-row">${btn('mdh', pid)}${btn('matricule', pid)}${editOnly(importBtn('mdh', pid, '⤒ Importer une fiche…'))}</p>`;
    /** le bouton du bloc « Chercher sur internet » */
    const panelButton = ctx => ctx?.id ? `<div class="so-ws"><button type="button" class="button small" data-so-search="" data-pid="${Number(ctx.id)}">🗂 Archives en ligne : Mémoire des hommes, Léonore, matricules, presse…</button><button type="button" class="button small secondary" data-so-paste data-pid="${Number(ctx.id)}">🔗 Coller un lien</button></div>` : '';
    document.addEventListener('click', e => {
        const s = e.target.closest('[data-so-search]'); if (s) { e.preventDefault(); openSearch({personId: Number(s.dataset.pid) || 0, kind: s.dataset.soSearch || undefined}); return; }
        const im = e.target.closest('[data-so-import]'); if (im) { e.preventDefault(); openImport({personId: Number(im.dataset.pid) || 0, kind: im.dataset.soImport || undefined}); return; }
        const pl = e.target.closest('[data-so-paste]'); if (pl) { e.preventDefault(); openPasteLink({personId: Number(pl.dataset.pid) || 0}); }
    });

    ext.sourcesOuvertes = {openSearch, openImport, openPasteLink, openSettings, btn, importBtn, poiluRow, panelButton, context};
})();
