/**
 * 📚 Atelier de recherche (Enquêtes → onglet « Atelier ») — pour écrire une thèse, un livre, un article, préparer une exposition :
 * des projets, et dans chacun des dossiers imbriqués sans limite (parties, chapitres, sections…) où l'on range
 * des références (livres, articles, archives, gravures…), notes, citations, images, personnes, lieux, dates, liens,
 * tâches et brouillons. Un élément peut être dans plusieurs dossiers. Vue d'ensemble, chronologie, carte,
 * bibliographie à la française, import / export .bib et .ris, plan et textes en un fichier.
 * Serveur : lib/atelier.php (structure n°24). Chargé après heritage-more.js.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.lists = ext.lists || {};
    const esc = value => A().escapeHtml(value ?? '');
    const nl = value => esc(value).replace(/\n/g, '<br>');
    const api = (...args) => A().api(...args);
    const toast = (...args) => A().toast(...args);
    const empty = text => A().empty(text);
    const S = () => A().state;
    const fmt = (n, d = 0) => Number(n || 0).toLocaleString('fr-FR', {maximumFractionDigits: d});
    const plural = (n, one, many) => `${fmt(n)} ${n > 1 ? many : one}`;
    const isCurrent = token => token === S().workspaceToken && S().module === 'enquetes';
    const dialog = opts => ext.openDialog(opts);
    const pname = p => p ? A().personName(p) : '';
    const post = (action, body) => api(action, {}, {method: 'POST', body});

    /* ─────────── Sortes d'éléments ─────────── */
    const TYPES = {
        reference: ['📖', 'Référence', 'Livre, article, archive, gravure, page web…'], note: ['📝', 'Note', 'Une idée, une réflexion, un résumé'],
        quote: ['❝', 'Citation', 'Un extrait, avec sa source et sa page'], media: ['🖼️', 'Image ou document', 'Gravure, photo, scan, PDF…'],
        person: ['👤', 'Personne', 'De ta base, ou quelqu’un d’autre'], place: ['📍', 'Lieu', 'Placé sur la carte'],
        event: ['📅', 'Date, événement', 'Pour la chronologie'], link: ['🔗', 'Lien internet', 'Un site, une base en ligne'],
        task: ['✅', 'Tâche', 'À faire, avec une échéance'], draft: ['✍️', 'Brouillon', 'Un texte en cours, avec ses mots comptés'],
    };
    const TYPE_PLURALS = {reference: 'Références', note: 'Notes', quote: 'Citations', media: 'Images et documents', person: 'Personnes', place: 'Lieux', event: 'Dates, événements', link: 'Liens internet', task: 'Tâches', draft: 'Brouillons'};
    const REF_KINDS = {livre: 'Livre', article: 'Article de revue', chapitre: 'Chapitre d’ouvrage', these: 'Thèse, mémoire', archive: 'Document d’archives', image: 'Image, gravure, estampe', presse: 'Article de presse', web: 'Page internet', objet: 'Objet', autre: 'Autre'};
    const ROLES = {auteur: 'auteur', dir: 'directeur (dir.)', trad: 'traducteur', graveur: 'graveur', editeur: 'éditeur', illustrateur: 'illustrateur', photographe: 'photographe', autre: 'autre'};
    const READ = {'': '—', a_lire: '📕 à lire', en_cours: '📖 en cours de lecture', lu: '📗 lu', exploite: '✅ exploité'};
    const STAGES = {idee: 'idée', plan: 'plan', premier_jet: 'premier jet', relu: 'relu', fini: 'fini'};
    const KIND_ICONS = {these: '🎓', livre: '📕', article: '📰', memoire: '📘', exposition: '🖼️', enquete: '🔍', autre: '📚'};
    // Plans de départ
    const n = (name, children = []) => ({name, children});
    const PLANS = {
        these: ['Thèse', [n('Introduction'), n('Partie 1', [n('Chapitre 1'), n('Chapitre 2')]), n('Partie 2', [n('Chapitre 3'), n('Chapitre 4')]), n('Partie 3', [n('Chapitre 5'), n('Chapitre 6')]), n('Conclusion'),
            n('Sources', [n('Archives'), n('Sources imprimées'), n('Iconographie'), n('Presse')]), n('Bibliographie', [n('Ouvrages généraux'), n('Études')]), n('Annexes'), n('Directeur de thèse et soutenance')]],
        livre: ['Livre', [n('Plan', [n('Prologue'), n('Chapitre 1'), n('Chapitre 2'), n('Chapitre 3'), n('Épilogue')]), n('Documentation', [n('Archives'), n('Lectures'), n('Entretiens')]), n('Illustrations', [n('À demander'), n('Droits obtenus')]), n('Éditeur')]],
        article: ['Article', [n('Problématique'), n('Plan'), n('Sources'), n('Bibliographie'), n('Soumission et relectures')]],
        exposition: ['Exposition', [n('Propos et parcours'), n('Salles', [n('Salle 1'), n('Salle 2'), n('Salle 3')]), n('Œuvres et prêts', [n('Demandes'), n('Accordés')]), n('Textes de salle'), n('Catalogue'), n('Logistique')]],
        enquete: ['Enquête', [n('Hypothèses'), n('Pistes', [n('À suivre'), n('Abandonnées')]), n('Preuves'), n('Personnes'), n('Lieux'), n('Conclusions')]],
        vide: ['Vide', []],
    };

    /* ─────────── Réglages (Maintenance → Atelier de recherche) : menu, sortes d'éléments, dossiers, plans ─────────── */
    const CFG_KEY = 'genealogie-atelier-config'; // copié tout seul dans la base (lib/settings.php)
    const NAV_BUILTIN = [['overview', '📊', 'Vue d’ensemble'], ['all', '🗂️', 'Tout le projet'], ['starred', '⭐', 'Favoris'], ['unfiled', '📥', 'Non classés'], ['tasks', '✅', 'Tâches'], ['timeline', '🕰️', 'Chronologie'], ['people', '👥', 'Personnes'], ['map', '🗺️', 'Carte'], ['biblio', '📚', 'Bibliographie'], ['trash', '🗑️', 'Corbeille']];
    const readCfg = () => { try { const c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); return c && typeof c === 'object' ? c : {}; } catch (_) { return {}; } };
    function loadCfg() {
        const c = readCfg();
        const merge = (saved, builtins) => { const out = [], seen = new Set();
            (Array.isArray(saved) ? saved : []).forEach(x => { if (!x || typeof x.key !== 'string' || seen.has(x.key)) return; const b = builtins.find(y => y.key === x.key);
                if (b) out.push({...b, icon: typeof x.icon === 'string' && x.icon ? x.icon : b.icon, label: typeof x.label === 'string' && x.label.trim() ? x.label : b.label, hidden: !!x.hidden});
                else if (x.custom) out.push({...x, hidden: !!x.hidden});
                else return; seen.add(x.key); });
            builtins.forEach(b => { if (!seen.has(b.key)) out.push({...b}); });
            return out; };
        const nav = merge(c.nav, NAV_BUILTIN.map(([key, icon, label]) => ({key, icon, label, builtin: true})));
        nav.forEach(x => { if (x.key === 'trash') x.hidden = false; });
        return {nav, types: merge(c.types, Object.entries(TYPES).map(([key, [icon, label, help]]) => ({key, icon, label, help, builtin: true}))),
            plans: merge(c.plans, Object.entries(PLANS).map(([key, [label, tree]]) => ({key, label, tree, builtin: true}))),
            folders: {closed: c.folders?.closed || '📁', open: c.folders?.open || '📂'}};
    }
    let CFG = loadCfg();
    function saveCfg(c = CFG) {
        const slim = (list, keepAll) => list.map(x => x.builtin ? {key: x.key, icon: x.icon, label: x.label, hidden: !!x.hidden} : keepAll(x));
        try { localStorage.setItem(CFG_KEY, JSON.stringify({nav: slim(c.nav, x => x), types: slim(c.types, x => x), plans: c.plans.map(x => x.builtin ? {key: x.key, label: x.label, hidden: !!x.hidden} : x), folders: c.folders})); } catch (_) {}
        CFG = loadCfg();
    }
    const tkey = x => typeof x === 'string' ? x : (x.type === 'custom' ? x.data?.ctype || 'custom' : x.type);
    const tentry = x => CFG.types.find(t => t.key === tkey(x));
    const ti = x => tentry(x)?.icon || TYPES[tkey(x)]?.[0] || '🧩';
    const tl = x => tentry(x)?.label || TYPES[tkey(x)]?.[1] || 'Élément';
    const plabel = k => { const e = tentry(k); return e?.builtin && e.label === TYPES[k]?.[1] ? (TYPE_PLURALS[k] || e.label) : tl(k); };
    const navEntry = k => CFG.nav.find(n => n.key === k);
    const navTitle = k => { const e = navEntry(k); return e ? `${e.icon} ${e.label}` : ''; };
    const uid = p => p + Math.random().toString(36).slice(2, 9);

    /* ─────────── Citer à la française ─────────── */
    const year = i => String(i.data?.year || i.data?.date || '').match(/\d{3,4}/)?.[0] || '';
    const creatorsOf = (i, roles) => (i.data?.creators || []).filter(c => !roles || roles.includes(c.role));
    const nameUp = c => [c.last ? c.last.toLocaleUpperCase('fr-FR') : '', c.first].filter(Boolean).join(' ');
    const authorsTxt = list => list.length > 3 ? nameUp(list[0]) + ' et al.' : list.map(nameUp).join(', ').replace(/, ([^,]*)$/, ' et $1');
    const firstAuthor = i => { const c = creatorsOf(i)[0]; return c ? [c.last, c.first].filter(Boolean).join(' ') : ''; };
    /** Référence complète (texte, avec *italique* pour les titres d'ouvrages) */
    function cite(i, html = true) {
        const md = html === 'md'; if (md) html = false;
        const d = i.data || {}, it = t => t ? (html ? `<i>${esc(t)}</i>` : md ? `*${t}*` : t) : '', tx = t => t ? (html ? esc(t) : t) : '';
        const auth = authorsTxt(creatorsOf(i, ['auteur', 'graveur', 'photographe', 'illustrateur', 'autre']));
        const dir = creatorsOf(i, ['dir']);
        const pub = [d.place, d.publisher, d.year || d.date].filter(Boolean).map(tx).join(', ');
        const parts = [];
        const title = i.title;
        switch (d.kind) {
            case 'article': case 'presse': parts.push(auth && tx(auth), `« ${tx(title)} »`, it(d.container), d.volume && tx('vol. ' + d.volume), d.issue && tx('n° ' + d.issue), tx(d.date || d.year), d.pages && tx('p. ' + d.pages)); break;
            case 'chapitre': { const dans = [dir.length ? tx(authorsTxt(dir) + ' (dir.)') : '', it(d.container)].filter(Boolean).join(', '); parts.push(auth && tx(auth), `« ${tx(title)} »`, dans && 'dans ' + dans, pub, d.pages && tx('p. ' + d.pages)); break; }
            case 'these': parts.push(auth && tx(auth), it(title), tx('thèse'), pub); break;
            case 'archive': parts.push(tx(d.archive), d.call_number && tx(d.call_number), `« ${tx(title)} »`, tx(d.date || d.year)); break;
            case 'image': case 'objet': parts.push(auth && tx(auth), it(title), tx(d.technique), tx(d.date || d.year), tx(d.dimensions), tx(d.archive), d.call_number && tx(d.call_number)); break;
            case 'web': parts.push(auth && tx(auth), `« ${tx(title)} »`, it(d.container), tx(d.date || d.year), d.url && (html ? `<span class="h-at-url">${esc(d.url)}</span>` : d.url), d.accessed && tx(`consulté le ${d.accessed}`)); break;
            default: parts.push(auth ? tx(auth) : (dir.length ? tx(authorsTxt(dir) + ' (dir.)') : ''), it(title), d.edition && tx(d.edition), pub, d.pages && tx(d.pages + (/\d$/.test(d.pages) && !/[-–]/.test(d.pages) ? ' p.' : ''))); break;
        }
        let out = parts.filter(Boolean).join(', ');
        if (d.doi) out += html ? `, doi : ${esc(d.doi)}` : `, doi : ${d.doi}`;
        return /[.!?…]$/.test(out) ? out : out + '.';
    }
    const shortCite = i => `${creatorsOf(i)[0]?.last || creatorsOf(i)[0]?.first || i.title.slice(0, 30)}${year(i) ? ', ' + year(i) : ''}`;
    const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

    /* ─────────── BibTeX / RIS ─────────── */
    const BIB_TYPES = {livre: 'book', article: 'article', chapitre: 'incollection', these: 'phdthesis', archive: 'unpublished', image: 'misc', presse: 'article', web: 'online', objet: 'misc', autre: 'misc'};
    const RIS_TYPES = {livre: 'BOOK', article: 'JOUR', chapitre: 'CHAP', these: 'THES', archive: 'MANSCPT', image: 'ART', presse: 'NEWS', web: 'ELEC', objet: 'GEN', autre: 'GEN'};
    function toBibtex(refs) {
        const used = new Set();
        return refs.map(i => {
            const d = i.data || {};
            let key = ((creatorsOf(i)[0]?.last || 'ref') + (year(i) || '')).normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toLowerCase() || 'ref';
            for (let k = 0, base = key; used.has(key); k++) key = base + (k < 26 ? String.fromCharCode(97 + k) : String(k));
            used.add(key);
            const names = roles => creatorsOf(i, roles).map(c => [c.last, c.first].filter(Boolean).join(', ')).join(' and ');
            const f = {author: names(['auteur', 'graveur', 'photographe', 'illustrateur', 'autre']), editor: names(['dir']), translator: names(['trad']), title: i.title,
                [d.kind === 'article' || d.kind === 'presse' ? 'journal' : 'booktitle']: d.container, [d.kind === 'these' ? 'school' : 'publisher']: d.publisher, address: d.place, year: year(i), volume: d.volume, number: d.issue,
                pages: (d.pages || '').replace(/\s*[–-]+\s*/, '--'), edition: d.edition, isbn: d.isbn, doi: d.doi, url: d.url, language: d.language, abstract: d.abstract, keywords: (i.tags || []).join(', '),
                note: [d.archive, d.call_number].filter(Boolean).join(', ')};
            const texEsc = (k, v) => ['url', 'doi'].includes(k) ? String(v).replace(/[{}]/g, '') : String(v).replace(/[{}]/g, '').replace(/([&%#_$])/g, '\\$1');
            return `@${BIB_TYPES[d.kind] || 'misc'}{${key},\n${Object.entries(f).filter(([, v]) => v).map(([k, v]) => `  ${k} = {${texEsc(k, v)}}`).join(',\n')}\n}`;
        }).join('\n\n') + '\n';
    }
    function toRis(refs) {
        return refs.map(i => {
            const d = i.data || {}, L = [['TY', RIS_TYPES[d.kind] || 'GEN'], ['TI', i.title]];
            creatorsOf(i).forEach(c => L.push([{dir: 'ED', trad: 'A4', editeur: 'A3'}[c.role] || 'AU', [c.last, c.first].filter(Boolean).join(', ')]));
            const [sp, ep] = String(d.pages || '').split(/\s*[–-]+\s*/);
            [['PY', year(i)], ['T2', d.container], ['PB', d.publisher], ['CY', d.place], ['VL', d.volume], ['IS', d.issue], ['SP', sp], ['EP', ep], ['SN', d.isbn], ['DO', d.doi], ['UR', d.url], ['LA', d.language], ['AB', d.abstract], ['AV', d.archive], ['CN', d.call_number]].forEach(([k, v]) => { if (v) L.push([k, v]); });
            (i.tags || []).forEach(t => L.push(['KW', t]));
            L.push(['ER', '']);
            return L.map(([k, v]) => `${k}  - ${String(v).replace(/\n/g, ' ')}`).join('\n');
        }).join('\n\n') + '\n';
    }

    /* ─────────── État ─────────── */
    const st = () => (S().atelier ||= {project: 0, node: 'overview', sel: [], tags: [], q: '', type: '', sort: {col: 'title', dir: 1}, closed: {}});
    let P = null; // projet chargé : {project, folders, items, people}
    const load = async id => { P = await api('atelier_project', {id}); P.byId = new Map(P.items.map(i => [Number(i.id), i])); P.fById = new Map(P.folders.map(f => [Number(f.id), f])); return P; };
    const kids = parent => P.folders.filter(f => (f.parent_id === null ? 0 : Number(f.parent_id)) === parent).sort((a, b) => a.position - b.position || a.id - b.id);
    const descendants = id => { const out = [id]; kids(id).forEach(k => out.push(...descendants(Number(k.id)))); return out; };
    const pathOf = id => { const out = []; let f = P.fById.get(id), guard = 0; while (f && guard++ < 200) { out.unshift(f); f = f.parent_id ? P.fById.get(Number(f.parent_id)) : null; } return out; };
    const live = () => P.items.filter(i => !Number(i.trashed));
    const dateKey = i => { const d = i.data || {}; const v = i.type === 'task' ? d.due : i.type === 'reference' ? (d.date || d.year) : i.type === 'person' ? d.dates : d.date; const m = String(v || '').match(/(\d{3,4})(?:-(\d{2})(?:-(\d{2}))?)?/); return m ? m[1].padStart(4, '0') + (m[2] || '00') + (m[3] || '00') : ''; };

    /* ═══════════ Les projets ═══════════ */
    const firstNode = () => CFG.nav.find(x => !x.hidden)?.key || 'all';
    /** Choisir un fichier : son nom et son texte (ou null). */
    const pickNamedFile = accept => new Promise(resolve => { const input = Object.assign(document.createElement('input'), {type: 'file', accept}); input.addEventListener('change', async () => { const f = input.files[0]; resolve(f ? {name: f.name, text: await f.text()} : null); }); input.click(); });
    const importSummary = r => [plural(r.count, 'référence', 'références'), r.notes ? plural(r.notes, 'note', 'notes') : '', r.links ? plural(r.links, 'lien', 'liens') : '', r.folders ? plural(r.folders, 'dossier', 'dossiers') : ''].filter(Boolean).join(', ') + ` (${r.format})` + (r.files_skipped ? ` — ${plural(r.files_skipped, 'fichier joint', 'fichiers joints')} (PDF…) à rajouter à la main` : '');
    const IMPORT_ACCEPT = '.rdf,.json,.xml,.bib,.ris,.txt,application/json,text/xml,application/rdf+xml';
    function importProjectDialog(kinds) {
        dialog({eyebrow: 'IMPORTER UN PROJET', title: 'Depuis Zotero ou un autre logiciel', wide: true, submitLabel: 'Choisir le fichier et importer',
            body: `<p>Le projet est créé avec ses dossiers, ses références et ses notes.</p>
                <ul class="h-at-howto"><li><b>Zotero</b> (avec les collections et sous-collections, qui deviennent des dossiers, et les notes) : clic droit sur une collection → <i>Exporter la collection…</i> → format <b>Zotero RDF</b>.</li>
                <li><b>Zotero, Mendeley, Zettlr…</b> : export <b>CSL JSON</b> (.json).</li><li><b>EndNote</b> : <i>File → Export</i> → <b>XML</b>.</li><li>Tout logiciel de bibliographie : <b>BibTeX</b> (.bib) ou <b>RIS</b> (.ris).</li></ul>
                <p class="muted">Les fichiers PDF joints ne voyagent pas dans ces exports : ils sont comptés, et tu pourras les rajouter dans chaque référence.</p>
                <div class="form-grid"><label>Nom du projet <small>(vide : le nom de la collection)</small><input name="title" placeholder="Les montreurs de vues d’optique"></label>
                <label>Sorte de projet<select name="kind">${Object.entries(kinds).map(([k, l]) => `<option value="${k}" ${k === 'these' ? 'selected' : ''}>${KIND_ICONS[k] || ''} ${esc(l)}</option>`).join('')}</select></label></div>`,
            onSubmit: async form => {
                const file = await pickNamedFile(IMPORT_ACCEPT); if (!file) return false;
                const title = form.title.value.trim() || '';
                const r = await post('atelier_import', {text: file.text, new_project: {title: title || '', kind: form.kind.value}});
                toast('Projet importé : ' + importSummary(r.result) + '.');
                Object.assign(st(), {project: r.result.project_id, node: firstNode(), sel: [], tags: [], q: '', type: ''});
                ext.atelier(++S().workspaceToken);
            },
        });
    }
    ext.atelier = async token => {
        CFG = loadCfg();
        const v = st();
        if (v.project) {
            try { await load(v.project); } catch (error) { v.project = 0; toast(error.message, 'error'); return ext.atelier(token); }
            if (!isCurrent(token)) return;
            return renderProject(token);
        }
        let data;
        try { data = await api('atelier_projects'); } catch (error) { toast(error.message, 'error'); return; }
        if (!isCurrent(token)) return;
        const projects = data.projects || [];
        const ws = A().$('#workspace');
        const card = p => { const words = Number(p.words), target = Number(p.target_words);
            const days = p.deadline ? Math.ceil((new Date(p.deadline + 'T12:00:00') - new Date()) / 864e5) : null;
            return `<article class="h-at-project ${p.status === 'archived' ? 'is-archived' : ''}" style="--at-color:${esc(p.color)}" data-at-open="${p.id}" tabindex="0">
                <div class="h-at-project-icon">${esc(p.icon || KIND_ICONS[p.kind] || '📚')}</div><div class="h-at-project-body"><span class="eyebrow">${esc(data.kinds[p.kind] || '')}${p.status === 'archived' ? ' · archivé' : ''}</span><h3>${esc(p.title)}</h3>${p.subtitle ? `<p class="muted">${esc(p.subtitle)}</p>` : ''}
                <p class="h-at-project-stats">${plural(Number(p.item_count), 'élément', 'éléments')} · ${plural(Number(p.folder_count), 'dossier', 'dossiers')}${Number(p.open_tasks) ? ` · ${plural(Number(p.open_tasks), 'tâche', 'tâches')} à faire` : ''}</p>
                ${target ? `<div class="h-at-words"><div class="h-progress"><span style="width:${Math.min(100, Math.round(100 * words / target))}%"></span></div><small>${fmt(words)} mots sur ${fmt(target)}</small></div>` : words ? `<small>${fmt(words)} mots écrits</small>` : ''}
                ${days !== null ? `<small class="${days < 0 ? 'h-at-late' : ''}">${days < 0 ? `échéance dépassée de ${plural(-days, 'jour', 'jours')}` : `rendu dans ${plural(days, 'jour', 'jours')}`}</small>` : ''}</div></article>`; };
        ws.innerHTML = `<section class="page collection-page h-at">${`<header class="page-header"><div><span class="eyebrow">ENQUÊTES</span><h2>📚 Atelier de recherche</h2><p>Pour écrire une thèse, un livre, un article ou préparer une exposition : un projet, ses dossiers et sous-dossiers sans limite (parties, chapitres, sources…), et tout ce que tu y ranges — références, archives, gravures, citations, notes, personnes de ta base, lieux, dates, tâches, brouillons. Bibliographie toute prête, chronologie, carte.</p></div><div class="page-actions"><button type="button" class="button" data-at-new>+ Projet</button><button type="button" class="button secondary" data-at-importproject>⬇ Importer un projet (Zotero…)</button><button type="button" class="button secondary" data-at-settings title="Maintenance → Atelier de recherche">⚙ Réglages</button></div></header>`}
            ${projects.length ? `<div class="h-at-projects">${projects.map(card).join('')}</div>` : empty('Aucun projet pour l’instant. Clique sur « + Projet » : par exemple « Les montreurs de vues d’optique, XVIIIe-XIXe siècles ».')}</section>`;
        ws.querySelector('[data-at-new]').addEventListener('click', () => projectDialog(null, data.kinds));
        ws.querySelector('[data-at-importproject]').addEventListener('click', () => importProjectDialog(data.kinds));
        ws.querySelector('[data-at-settings]').addEventListener('click', () => openSettings());
        lastKinds = data.kinds;
        ws.querySelectorAll('[data-at-open]').forEach(c => {
            const open = () => { Object.assign(st(), {project: Number(c.dataset.atOpen), node: firstNode(), sel: [], tags: [], q: '', type: ''}); ext.atelier(++S().workspaceToken); };
            c.addEventListener('click', open); c.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
        });
    };
    let lastKinds = {these: 'Thèse', livre: 'Livre', article: 'Article', memoire: 'Mémoire', exposition: 'Exposition', enquete: 'Enquête', autre: 'Autre'};
    ext.atelierNewProject = () => projectDialog(null, P?.kinds || lastKinds);
    function projectDialog(p, kinds) {
        const isNew = !p; p = p || {kind: 'these', icon: '', color: '#0066cc', target_words: 0};
        const planTree = list => `<ul>${list.map(x => `<li>${esc(x.icon || CFG.folders.closed)} ${esc(x.name)}${x.children?.length ? planTree(x.children) : ''}</li>`).join('')}</ul>`;
        dialog({eyebrow: 'ATELIER DE RECHERCHE', title: isNew ? 'Nouveau projet' : 'Modifier le projet', wide: true, submitLabel: isNew ? 'Créer le projet' : 'Enregistrer',
            body: `<div class="form-grid"><label class="span-2">Titre<input name="title" required value="${esc(p.title || '')}" placeholder="Les montreurs de vues d’optique (XVIIIe-XIXe siècles)"></label>
                <label class="span-2">Sous-titre<input name="subtitle" value="${esc(p.subtitle || '')}" placeholder="Colporteurs d’images, boîtes d’optique et publics populaires"></label>
                <label>Sorte de projet<select name="kind">${Object.entries(kinds).map(([k, l]) => `<option value="${k}" ${p.kind === k ? 'selected' : ''}>${KIND_ICONS[k] || ''} ${esc(l)}</option>`).join('')}</select></label>
                <label>Icône<input name="icon" value="${esc(p.icon || '')}" maxlength="16" placeholder="🎓" class="h-be-icon"></label>
                <label>Objectif de mots <small>(facultatif)</small><input type="number" name="target_words" min="0" step="1000" value="${Number(p.target_words) || ''}" placeholder="100000"></label>
                <label>Date de rendu <small>(facultatif)</small><input type="date" name="deadline" value="${esc(p.deadline || '')}"></label>
                <label>Couleur<input type="color" name="color" value="${esc(p.color || '#0066cc')}"></label>
                ${isNew ? '' : `<label class="checkbox-line"><input type="checkbox" name="archived" ${p.status === 'archived' ? 'checked' : ''}> Archivé (fini ou en pause)</label>`}
                <label class="span-2">Problématique, présentation<textarea name="description" rows="4" placeholder="Qui étaient les montreurs d’optique ? D’où venaient-ils, quelles images montraient-ils, à quels publics ?">${esc(p.description || '')}</textarea></label></div>
                ${isNew ? `<h4>Plan de départ</h4><p class="muted">Des dossiers déjà prêts, que tu pourras renommer, déplacer, compléter ou supprimer.</p><div class="h-at-plans">${CFG.plans.filter(x => !x.hidden).map((x, i, arr) => `<label class="h-at-plan"><input type="radio" name="plan" value="${esc(x.key)}" ${i === 0 ? 'checked' : ''}><strong>${esc(x.label)}</strong>${x.tree?.length ? planTree(x.tree) : '<p class="muted">Aucun dossier</p>'}</label>`).join('')}</div><p class="muted"><button type="button" class="link-button" data-at-settings-plans>⚙ Créer mes plans, les ranger, en masquer…</button></p>` : ''}`,
            onOpen: dl => { dl.querySelector('[name=kind]').addEventListener('change', e => { const r = dl.querySelector(`[name=plan][value="${e.target.value}"]`); if (r) r.checked = true; });
                dl.querySelector('[data-at-settings-plans]')?.addEventListener('click', () => { dl.close(); openSettings(); }); },
            onSubmit: async form => {
                const f = Object.fromEntries(new FormData(form));
                const body = {id: p.id || 0, title: f.title, subtitle: f.subtitle, kind: f.kind, icon: f.icon, color: f.color, description: f.description, target_words: Number(f.target_words) || 0, deadline: f.deadline, status: form.archived?.checked ? 'archived' : 'active'};
                if (isNew) body.folders = CFG.plans.find(x => x.key === f.plan)?.tree || [];
                const r = await post('save_atelier_project', body);
                if (isNew) Object.assign(st(), {project: r.result.id, node: firstNode(), sel: [], tags: [], q: '', type: ''});
                toast(isNew ? 'Projet créé.' : 'Projet enregistré.');
                ext.atelier(++S().workspaceToken);
            },
            onDelete: isNew ? null : async () => {
                if (!confirm(`Supprimer « ${p.title} » avec tous ses dossiers et ses ${plural(P?.items.length || 0, 'élément', 'éléments')} ? C’est définitif.`)) return false;
                await post('delete_atelier_project', {id: p.id}); st().project = 0; toast('Projet supprimé.'); ext.atelier(++S().workspaceToken);
            },
        });
    }

    /* ═══════════ Un projet ouvert : dossiers | éléments | détail ═══════════ */
    const SPECIAL_VIEWS = ['overview', 'timeline', 'people', 'map', 'biblio', 'tasks'];
    const reload = async (keepScroll = true) => { const v = st(), pid = v.project; await load(pid); if (S().module !== 'enquetes' || S().enquetesTab !== 'atelier' || st().project !== pid) return; renderProject(S().workspaceToken, keepScroll); };
    /** Vue à soi (Maintenance → Atelier) : sortes, étiquettes, favoris, lecture, tâches à faire, texte, années, dossier par son nom. */
    function viewFilter(f, items) {
        const lower = x => String(x || '').toLowerCase();
        if (f.types?.length) items = items.filter(i => f.types.includes(tkey(i)));
        if (f.tags?.length) items = items.filter(i => f.tagMode === 'any' ? f.tags.some(t => (i.tags || []).includes(t)) : f.tags.every(t => (i.tags || []).includes(t)));
        if (f.starred) items = items.filter(i => Number(i.starred));
        if (f.read) items = items.filter(i => i.type === 'reference' && (i.data.read || '') === f.read);
        if (f.todo) items = items.filter(i => i.type === 'task' && !Number(i.data.done));
        if (f.text) items = items.filter(i => lower([i.title, JSON.stringify(i.data), (i.tags || []).join(' ')].join(' ')).includes(lower(f.text)));
        if (f.from || f.to) items = items.filter(i => { const y = Number(dateKey(i).slice(0, 4)); return y && (!f.from || y >= Number(f.from)) && (!f.to || y <= Number(f.to)); });
        if (f.folder) { const want = lower(f.folder); const ok = new Set(P.folders.filter(x => lower(x.name).includes(want)).flatMap(x => descendants(Number(x.id)))); items = items.filter(i => i.folders.some(x => ok.has(x))); }
        return items;
    }
    function nodeItems(node) {
        const v = st();
        let items = node === 'trash' ? P.items.filter(i => Number(i.trashed)) : live();
        if (typeof node === 'number') { const set = new Set(v.deep ? descendants(node) : [node]); items = items.filter(i => i.folders.some(f => set.has(f))); }
        if (node === 'starred') items = items.filter(i => Number(i.starred));
        if (node === 'unfiled') items = items.filter(i => !i.folders.length);
        if (typeof node === 'string' && node.startsWith('v_')) items = viewFilter(navEntry(node)?.filter || {}, items);
        if (v.type) items = items.filter(i => tkey(i) === v.type);
        if (v.tags.length) items = items.filter(i => v.tags.every(t => (i.tags || []).includes(t)));
        if (v.q) { const q = v.q.toLowerCase(); items = items.filter(i => [i.title, JSON.stringify(i.data), (i.tags || []).join(' ')].join(' ').toLowerCase().includes(q)); }
        const s = v.sort, key = i => s.col === 'creator' ? firstAuthor(i) || i.data?.creator || '' : s.col === 'year' ? dateKey(i) : s.col === 'type' ? tl(i) : s.col === 'added' ? i.created_at : i.title;
        return items.sort((a, b) => { const x = String(key(a) || ''), y = String(key(b) || ''); if (!x !== !y) return x ? -1 : 1; return x.localeCompare(y, 'fr', {numeric: true, sensitivity: 'base'}) * s.dir; });
    }
    const nodeItemsCount = k => viewFilter(navEntry(k)?.filter || {}, live()).length;
    let rendering = false;
    function renderProject(token, keepScroll = false) {
        // un champ qui perd le focus pendant qu'on redessine (« change » au blur) : on redessine juste après
        if (rendering) { setTimeout(() => renderProject(S().workspaceToken, true), 0); return; }
        rendering = true;
        try { drawProject(keepScroll); } finally { rendering = false; }
    }
    function drawProject(keepScroll) {
        const v = st(), p = P.project, ws = A().$('#workspace');
        const scroll = keepScroll ? [...ws.querySelectorAll('[data-at-scroll]')].map(el => el.scrollTop) : [];
        if (typeof v.node === 'number' && !P.fById.has(v.node)) v.node = 'all';
        if (typeof v.node === 'string' && !navEntry(v.node)) v.node = 'all';
        if (v.type && !CFG.types.some(t => t.key === v.type)) v.type = '';
        v.sel = v.sel.filter(id => P.byId.has(id));
        if (typeof v.node === 'number' || ['all', 'starred', 'unfiled', 'trash'].includes(v.node)) { const visible = new Set(nodeItems(v.node).map(i => Number(i.id))); v.sel = v.sel.filter(id => visible.has(id)); }
        const target = Number(p.target_words), words = Number(p.words);
        // compte des éléments par dossier (directs)
        const counts = new Map(); live().forEach(i => i.folders.forEach(f => counts.set(f, (counts.get(f) || 0) + 1)));
        const folderNode = f => { const id = Number(f.id), ch = kids(id), open = !v.closed[id];
            return `<li class="h-at-node" data-at-folder="${id}"><div class="h-at-row ${v.node === id ? 'is-on' : ''}" draggable="true" data-at-go="${id}" style="${f.color ? `--at-fc:${esc(f.color)}` : ''}">
                ${ch.length ? `<button type="button" class="h-at-toggle" data-at-toggle="${id}" aria-label="${open ? 'Replier' : 'Déplier'}">${open ? '▾' : '▸'}</button>` : '<span class="h-at-toggle"></span>'}
                <span class="h-at-ficon">${esc(f.icon || (open && ch.length ? CFG.folders.open : CFG.folders.closed))}</span><span class="h-at-fname">${esc(f.name)}</span>${counts.get(id) ? `<small class="h-at-count">${fmt(counts.get(id))}</small>` : ''}
                <span class="h-at-factions"><button type="button" data-at-fadd="${id}" title="Sous-dossier">＋</button><button type="button" data-at-fedit="${id}" title="Renommer, icône, couleur">✎</button></span></div>
                ${ch.length && open ? `<ul>${ch.map(folderNode).join('')}</ul>` : ''}</li>`; };
        const tagCounts = new Map(); live().forEach(i => (i.tags || []).forEach(t => tagCounts.set(t, (tagCounts.get(t) || 0) + 1)));
        const tags = [...tagCounts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
        const special = SPECIAL_VIEWS.includes(v.node);
        ws.innerHTML = `<section class="page collection-page h-at h-at-open" style="--at-color:${esc(p.color)}">
            <header class="h-at-head"><button type="button" class="button secondary small" data-at-home>← Projets</button><span class="h-at-head-icon">${esc(p.icon || KIND_ICONS[p.kind] || '📚')}</span>
                <div class="h-at-head-title"><h2>${esc(p.title)}</h2>${p.subtitle ? `<p class="muted">${esc(p.subtitle)}</p>` : ''}</div>
                ${target ? `<div class="h-at-words" title="Mots des brouillons"><div class="h-progress"><span style="width:${Math.min(100, Math.round(100 * words / target))}%"></span></div><small>${fmt(words)} / ${fmt(target)} mots</small></div>` : ''}
                <span class="h-at-head-actions"><button type="button" class="button small secondary" data-at-export>Exporter…</button><button type="button" class="button small secondary" data-at-pedit>Projet…</button><button type="button" class="button small secondary" data-at-settings title="Réglages de l’Atelier (Maintenance)">⚙</button></span></header>
            <div class="h-at-grid">
                <aside class="h-at-tree" data-at-scroll>
                    <ul class="h-at-special">${CFG.nav.filter(x => !x.hidden || x.key === v.node).map(({key: k, icon, label}) => { const c = k === 'all' ? live().length : k === 'trash' ? P.items.length - live().length : k === 'starred' ? live().filter(i => Number(i.starred)).length : k === 'unfiled' ? live().filter(i => !i.folders.length).length : k === 'tasks' ? live().filter(i => i.type === 'task' && !Number(i.data.done)).length : k.startsWith('v_') ? nodeItemsCount(k) : 0;
                        return `<li><div class="h-at-row ${v.node === k ? 'is-on' : ''}" data-at-go="${esc(k)}" ${k === 'trash' || k === 'all' || k === 'starred' || k === 'unfiled' ? `data-at-drop="${k}"` : ''}><span class="h-at-ficon">${esc(icon)}</span><span class="h-at-fname">${esc(label)}</span>${c ? `<small class="h-at-count">${fmt(c)}</small>` : ''}</div></li>`; }).join('')}</ul>
                    <div class="h-at-tree-head" data-at-drop="root"><span>Dossiers</span><button type="button" class="icon-button" data-at-fadd="0" title="Nouveau dossier">＋</button></div>
                    <ul class="h-at-folders">${kids(0).map(folderNode).join('') || '<li class="muted h-at-none">Aucun dossier. « ＋ » pour en créer un.</li>'}</ul>
                    ${tags.length ? `<div class="h-at-tags"><input type="search" data-at-tagq placeholder="Filtrer les étiquettes"><div class="h-at-tagcloud">${tags.map(([t, c]) => `<button type="button" class="h-at-tag ${v.tags.includes(t) ? 'is-on' : ''}" data-at-tag="${esc(t)}" title="${fmt(c)}">${esc(t)}</button>`).join('')}</div>${v.tags.length ? '<button type="button" class="link-button" data-at-tagclear>Toutes les étiquettes</button>' : ''}</div>` : ''}
                </aside>
                <main class="h-at-main" data-at-scroll>${special ? specialView(v.node) : listView()}</main>
                <aside class="h-at-detail" data-at-scroll>${detailView()}</aside>
            </div></section>`;
        if (keepScroll) ws.querySelectorAll('[data-at-scroll]').forEach((el, i) => { el.scrollTop = scroll[i] || 0; });
        A().bindTableLinks?.();
        bindProject(ws.querySelector('.h-at-open'));
    }

    /* ─────────── Liste des éléments ─────────── */
    function listView() {
        const v = st(), node = v.node, items = nodeItems(node);
        const folder = typeof node === 'number' ? P.fById.get(node) : null;
        const sub = folder ? kids(node) : [];
        const head = folder ? `<nav class="h-at-crumbs">${pathOf(node).map((f, i, arr) => i < arr.length - 1 ? `<button type="button" class="link-button" data-at-go="${f.id}">${esc(f.name)}</button> ›` : '').join(' ')}</nav><h3 class="h-at-ftitle">${esc(folder.icon || CFG.folders.open)} ${esc(folder.name)}</h3>`
            : `<h3 class="h-at-ftitle">${esc(navTitle(node))}</h3>`;
        const sortTh = (col, label) => `<th><button type="button" class="h-lv-sort" data-at-sort="${col}">${label}${v.sort.col === col ? (v.sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`;
        const trash = node === 'trash';
        return `${head}
            ${folder ? `<details class="h-at-fnotes" ${folder.notes ? 'open' : ''}><summary>📝 Notes du dossier${folder.notes ? '' : ' <small class="muted">(vides)</small>'}</summary><textarea data-at-fnotes rows="4" placeholder="Ce que ce dossier doit contenir, le plan de la section, les idées…">${esc(folder.notes || '')}</textarea></details>` : ''}
            ${sub.length ? `<div class="h-at-subs">${sub.map(f => `<button type="button" class="h-at-sub" data-at-go="${f.id}" data-at-folder-drop="${f.id}">${esc(f.icon || CFG.folders.closed)} ${esc(f.name)}</button>`).join('')}</div>` : ''}
            <div class="h-at-toolbar">${trash ? (items.length ? '<button type="button" class="button small danger" data-at-emptytrash>Vider la corbeille</button>' : '') : `<div class="h-at-addmenu"><button type="button" class="button small" data-at-addmenu>+ Ajouter ▾</button><div class="h-at-menu" hidden>${CFG.types.filter(t => !t.hidden).map(t => `<button type="button" data-at-add="${esc(t.key)}" title="${esc(t.help || '')}">${esc(t.icon)} ${esc(t.label)}</button>`).join('')}<button type="button" class="h-at-menu-cfg" data-at-settings>⚙ Réglages des sortes…</button></div></div>
                <button type="button" class="button small secondary" data-at-import title="Zotero (.rdf), CSL JSON, EndNote (.xml), BibTeX (.bib), RIS (.ris)">⬇ Importer…</button>`}
                ${folder && kids(node).length ? `<label class="checkbox-line h-at-deep"><input type="checkbox" data-at-deep ${v.deep ? 'checked' : ''}> avec les sous-dossiers</label>` : ''}
                <select data-at-type><option value="">Toutes les sortes</option>${CFG.types.filter(t => !t.hidden || t.key === v.type).map(t => `<option value="${esc(t.key)}" ${v.type === t.key ? 'selected' : ''}>${esc(t.icon)} ${esc(t.label)}</option>`).join('')}</select>
                <input type="search" data-at-q value="${esc(v.q)}" placeholder="Chercher (titre, auteur, texte, étiquette…)"></div>
            ${v.sel.length > 1 ? `<div class="h-at-bulk"><strong>${plural(v.sel.length, 'élément choisi', 'éléments choisis')}</strong>
                ${trash ? '<button type="button" class="button small" data-at-bulk="restore">Restaurer</button><button type="button" class="button small danger" data-at-bulk="delete">Supprimer définitivement</button>'
                    : `<select data-at-bulkfolder><option value="">Ranger dans…</option>${folderOptions()}</select><button type="button" class="button small secondary" data-at-bulk="tag">🏷 Étiquette…</button><button type="button" class="button small secondary" data-at-bulk="star">⭐ Favoris</button>${folder ? '<button type="button" class="button small secondary" data-at-bulk="remove">Retirer de ce dossier</button>' : ''}<button type="button" class="button small secondary danger" data-at-bulk="trash">🗑 Corbeille</button>`}
                <button type="button" class="link-button" data-at-unsel>Aucun</button></div>` : ''}
            ${items.length ? `<table class="data-table h-at-table"><thead><tr><th class="h-at-c-star"></th>${sortTh('type', '')}${sortTh('title', 'Titre')}${sortTh('creator', 'Auteur, créateur')}${sortTh('year', 'Date')}<th class="h-at-c-att" title="Fichiers joints">📎</th></tr></thead>
                <tbody>${items.map(i => `<tr data-at-item="${i.id}" class="${v.sel.includes(Number(i.id)) ? 'is-sel' : ''} ${i.type === 'task' && Number(i.data.done) ? 'is-done' : ''}" draggable="true">
                    <td class="h-at-c-star"><button type="button" class="h-at-star ${Number(i.starred) ? 'is-on' : ''}" data-at-star="${i.id}" title="Favori">${Number(i.starred) ? '★' : '☆'}</button></td>
                    <td class="h-at-c-type" title="${esc(tl(i))}${i.type === 'reference' ? ' — ' + esc(REF_KINDS[i.data.kind] || '') : ''}">${ti(i)}</td>
                    <td class="h-at-c-title">${esc(i.title)}${(i.tags || []).length ? ` <span class="h-at-rowtags">${i.tags.slice(0, 3).map(t => `<span>${esc(t)}</span>`).join('')}</span>` : ''}${i.type === 'reference' && i.data.read ? ` <small class="muted">${esc(READ[i.data.read])}</small>` : ''}</td>
                    <td>${esc(i.type === 'reference' ? creatorsOf(i).map(c => c.last || c.first).slice(0, 3).join(', ') : i.type === 'media' ? i.data.creator : i.type === 'quote' && i.data.source_id ? firstAuthor(P.byId.get(Number(i.data.source_id)) || {data: {}}) : '')}</td>
                    <td class="h-at-c-year">${esc(i.type === 'task' ? (i.data.due ? new Date(i.data.due + 'T12:00:00').toLocaleDateString('fr-FR') : '') : year(i) || (i.type === 'event' ? i.data.date : ''))}</td>
                    <td class="h-at-c-att">${i.media?.length ? fmt(i.media.length) : ''}</td></tr>`).join('')}</tbody></table>
                <p class="muted h-at-hint">Clic : voir · double-clic : modifier · ⌘/Ctrl-clic ou Maj-clic : en choisir plusieurs · glisser sur un dossier pour l’y ranger${typeof node === 'number' ? ' (⌥/Alt en glissant : le garder aussi ici)' : ''}.</p>`
                : empty(trash ? 'La corbeille est vide.' : v.q || v.tags.length || v.type ? 'Rien ne correspond à ta recherche.' : folder ? 'Ce dossier est vide : « + Ajouter », ou glisse ici des éléments d’un autre dossier.' : 'Rien ici pour l’instant.')}`;
    }
    const folderOptions = (selected = []) => { const out = []; const walk = (parent, depth) => kids(parent).forEach(f => { out.push(`<option value="${f.id}" ${selected.includes(Number(f.id)) ? 'selected' : ''}>${'  '.repeat(depth)}${esc(f.icon || '📁')} ${esc(f.name)}</option>`); walk(Number(f.id), depth + 1); }); walk(0, 0); return out.join(''); };

    /* ─────────── Vues spéciales ─────────── */
    function specialView(node) {
        const items = live(), people = P.people || {};
        if (node === 'overview') {
            const p = P.project, byType = CFG.types.map(t => t.key).map(k => [k, items.filter(i => tkey(i) === k).length]).filter(([, c]) => c);
            const refs = items.filter(i => i.type === 'reference'), reads = Object.keys(READ).filter(Boolean).map(k => [k, refs.filter(i => i.data.read === k).length]);
            const tasks = items.filter(i => i.type === 'task' && !Number(i.data.done)).sort((a, b) => String(a.data.due || '9').localeCompare(String(b.data.due || '9')));
            const drafts = items.filter(i => i.type === 'draft');
            const recent = [...items].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 8);
            const days = p.deadline ? Math.ceil((new Date(p.deadline + 'T12:00:00') - new Date()) / 864e5) : null;
            const wc = t => (String(t || '').match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) || []).length;
            return `<h3 class="h-at-ftitle">📊 Vue d’ensemble</h3>
                ${p.description ? `<div class="h-at-problem"><span class="section-label">Problématique</span><p>${nl(p.description)}</p></div>` : ''}
                <div class="h-at-stats">${byType.map(([k, c]) => `<button type="button" class="h-at-stat" data-at-typejump="${k}"><span>${ti(k)}</span><b>${fmt(c)}</b><small>${esc(c > 1 ? plabel(k) : tl(k))}</small></button>`).join('') || '<p class="muted">Le projet est vide : choisis un dossier à gauche, puis « + Ajouter ».</p>'}</div>
                ${days !== null ? `<p class="${days < 0 ? 'h-at-late' : ''}">📆 ${days < 0 ? `Date de rendu dépassée de ${plural(-days, 'jour', 'jours')}` : `Rendu le ${new Date(p.deadline + 'T12:00:00').toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'})} : encore ${plural(days, 'jour', 'jours')}`}${Number(p.target_words) && days > 0 ? ` · ${fmt(Math.max(0, Math.ceil((Number(p.target_words) - Number(p.words)) / days)))} mots par jour pour tenir l’objectif` : ''}</p>` : ''}
                <div class="h-at-cols">
                ${refs.length ? `<section><h4>📖 Lectures</h4>${reads.map(([k, c]) => `<div class="h-at-bar"><span>${esc(READ[k])}</span><b style="width:${refs.length ? Math.round(100 * c / refs.length) : 0}%"></b><em>${fmt(c)}</em></div>`).join('')}<small class="muted">${plural(refs.length, 'référence', 'références')}</small></section>` : ''}
                ${drafts.length ? `<section><h4>✍️ Brouillons</h4>${drafts.map(d => { const w = wc(d.data.text), t = Number(d.data.target); return `<button type="button" class="h-at-line" data-at-pick="${d.id}">${esc(d.title)} <small class="muted">${fmt(w)}${t ? ' / ' + fmt(t) : ''} mots · ${esc(STAGES[d.data.stage] || '')}</small></button>`; }).join('')}</section>` : ''}
                ${tasks.length ? `<section><h4>✅ À faire</h4>${tasks.slice(0, 8).map(t => `<label class="checkbox-line h-at-task ${t.data.due && t.data.due < todayIso() ? 'h-at-late' : ''}"><input type="checkbox" data-at-taskdone="${t.id}"> ${esc(t.title)}${t.data.due ? ` <small>${new Date(t.data.due + 'T12:00:00').toLocaleDateString('fr-FR')}</small>` : ''}</label>`).join('')}${tasks.length > 8 ? `<button type="button" class="link-button" data-at-go="tasks">Toutes les tâches (${fmt(tasks.length)})</button>` : ''}</section>` : ''}
                ${recent.length ? `<section><h4>🕘 Derniers changements</h4>${recent.map(i => `<button type="button" class="h-at-line" data-at-pick="${i.id}">${ti(i)} ${esc(i.title)}</button>`).join('')}</section>` : ''}</div>`;
        }
        if (node === 'tasks') {
            const tasks = items.filter(i => i.type === 'task').sort((a, b) => Number(a.data.done) - Number(b.data.done) || String(a.data.due || '9').localeCompare(String(b.data.due || '9')));
            const today = todayIso();
            return `<h3 class="h-at-ftitle">✅ Tâches</h3><div class="h-at-toolbar"><button type="button" class="button small" data-at-add="task">+ Tâche</button></div>
                ${tasks.map(t => `<div class="h-at-taskrow ${Number(t.data.done) ? 'is-done' : ''} ${!Number(t.data.done) && t.data.due && t.data.due < today ? 'h-at-late' : ''}"><input type="checkbox" data-at-taskdone="${t.id}" ${Number(t.data.done) ? 'checked' : ''}><button type="button" class="link-button" data-at-pick="${t.id}">${esc(t.title)}</button>
                    <small class="muted">${[t.data.priority === 'haute' ? '🔴 haute' : t.data.priority === 'basse' ? 'basse' : '', t.data.due ? 'pour le ' + new Date(t.data.due + 'T12:00:00').toLocaleDateString('fr-FR') : '', t.folders.map(f => P.fById.get(f)?.name).filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</small></div>`).join('') || empty('Aucune tâche.')}`;
        }
        if (node === 'timeline') {
            const dated = items.filter(i => dateKey(i) && ['event', 'reference', 'media', 'task', 'person'].includes(i.type)).sort((a, b) => dateKey(a).localeCompare(dateKey(b)));
            const groups = new Map(); dated.forEach(i => { const y = Number(dateKey(i).slice(0, 4)); const k = y; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
            return `<h3 class="h-at-ftitle">🕰️ Chronologie</h3><p class="muted">Les dates, événements, documents, images et tâches du projet, dans l’ordre du temps.</p>
                ${dated.length ? `<ol class="h-lv-timeline h-at-timeline">${[...groups.entries()].map(([y, list]) => `<li><span class="h-lv-year">${y}</span>${list.map(i => `<button type="button" class="h-at-line" data-at-pick="${i.id}">${ti(i)} ${esc(i.title)} <small class="muted">${esc(i.type === 'event' ? [i.data.date, i.data.end && '→ ' + i.data.end, i.data.place?.text].filter(Boolean).join(' ') : i.type === 'reference' ? REF_KINDS[i.data.kind] : '')}</small></button>`).join('')}</li>`).join('')}</ol>` : empty('Aucun élément daté : ajoute des « Date, événement », ou des dates aux références et aux images.')}`;
        }
        if (node === 'people') {
            const rows = items.filter(i => i.type === 'person');
            const inEvents = new Map(); items.filter(i => i.type === 'event').forEach(e => (e.data.people || []).forEach(pid => { if (!inEvents.has(pid)) inEvents.set(pid, []); inEvents.get(pid).push(e); }));
            return `<h3 class="h-at-ftitle">👥 Personnes</h3><div class="h-at-toolbar"><button type="button" class="button small" data-at-add="person">+ Personne</button></div>
                ${rows.length || inEvents.size ? `<table class="data-table"><thead><tr><th>Personne</th><th>Rôle</th><th>Dates</th><th>Lieux</th></tr></thead><tbody>${rows.map(i => { const b = i.data.person_id ? people[i.data.person_id] : null;
                    return `<tr><td>${b ? `<button type="button" class="table-link" data-h-person="${b.id}">${esc(pname(b))}</button> <small class="muted">dans ta base</small>` : `<button type="button" class="link-button" data-at-pick="${i.id}">${esc(i.title)}</button>`}</td><td>${esc(i.data.role)}</td><td>${esc(i.data.dates || (b ? [b.birth_year, b.death_year].filter(Boolean).join('–') : ''))}</td><td>${esc(i.data.places)}</td></tr>`; }).join('')}
                    ${[...inEvents.entries()].filter(([pid]) => !rows.some(r => Number(r.data.person_id) === Number(pid))).map(([pid, evs]) => `<tr><td><button type="button" class="table-link" data-h-person="${pid}">${esc(pname(people[pid]))}</button></td><td class="muted">dans ${plural(evs.length, 'événement', 'événements')}</td><td></td><td></td></tr>`).join('')}</tbody></table>` : empty('Aucune personne : « + Personne » (de ta base, ou quelqu’un d’autre : un montreur, un graveur, un éditeur…).')}`;
        }
        if (node === 'map') {
            const pts = [];
            items.forEach(i => { const pl = i.data?.place; if (pl && typeof pl === 'object' && pl.lat !== null && pl.lat !== undefined) pts.push({lat: +pl.lat, lon: +pl.lon, label: `${ti(i)} ${i.title}${pl.text ? ' — ' + pl.text : ''}`}); });
            return `<h3 class="h-at-ftitle">🗺️ Carte</h3><p class="muted">Les lieux et les événements situés du projet.</p>${ext.miniMap ? ext.miniMap(pts, [], {height: 480, emptyText: 'Aucun lieu placé : ajoute un « Lieu » ou un lieu à une date.'}) : ''}
                ${pts.length ? `<ul class="h-at-maplist">${items.filter(i => i.data?.place?.text).map(i => `<li><button type="button" class="link-button" data-at-pick="${i.id}">${ti(i)} ${esc(i.title)}</button> <small class="muted">${esc(i.data.place.text)}</small></li>`).join('')}</ul>` : ''}`;
        }
        if (node === 'biblio') {
            const v = st(), scope = P.fById.has(v.biblioScope) ? v.biblioScope : 0;
            const set = scope ? new Set(descendants(scope)) : null;
            const refs = items.filter(i => i.type === 'reference' && (!set || i.folders.some(f => set.has(f))));
            const sorter = (a, b) => (firstAuthor(a) || a.title).localeCompare(firstAuthor(b) || b.title, 'fr', {sensitivity: 'base'}) || year(a).localeCompare(year(b));
            const GROUPS = [['Sources manuscrites', ['archive']], ['Sources iconographiques et objets', ['image', 'objet']], ['Presse', ['presse']], ['Ouvrages', ['livre']], ['Articles et chapitres', ['article', 'chapitre']], ['Thèses et mémoires', ['these']], ['Sites internet', ['web']], ['Autres', ['autre']]];
            return `<h3 class="h-at-ftitle">📚 Bibliographie</h3>
                <div class="h-at-toolbar"><label>Pour <select data-at-biblioscope><option value="0">tout le projet</option>${folderOptions([scope])}</select></label>
                    <button type="button" class="button small secondary" data-at-copybib>Copier</button><button type="button" class="button small secondary" data-at-printbib>Imprimer</button>
                    <button type="button" class="button small secondary" data-at-exp="bib">.bib</button><button type="button" class="button small secondary" data-at-exp="ris">.ris</button></div>
                <div class="h-at-biblio" data-at-biblio>${refs.length ? GROUPS.map(([label, kinds]) => { const list = refs.filter(i => kinds.includes(i.data.kind || 'autre')).sort(sorter); return list.length ? `<h4>${label}</h4><ul>${list.map(i => `<li><button type="button" class="link-button h-at-cite" data-at-pick="${i.id}">${cite(i)}</button></li>`).join('')}</ul>` : ''; }).join('') : empty('Aucune référence ici.')}</div>`;
        }
        return '';
    }

    /* ─────────── Panneau de détail ─────────── */
    function detailView() {
        const v = st();
        if (v.sel.length !== 1) {
            if (typeof v.node === 'number' && v.sel.length === 0) { const f = P.fById.get(v.node); const all = new Set(descendants(v.node)); const n = live().filter(i => i.folders.some(x => all.has(x))).length;
                return `<div class="h-at-dempty"><p class="h-at-big">${esc(f.icon || CFG.folders.open)}</p><h3>${esc(f.name)}</h3><p class="muted">${plural(n, 'élément', 'éléments')} avec les sous-dossiers</p><button type="button" class="button small secondary" data-at-fedit="${f.id}">Renommer, icône, couleur…</button></div>`; }
            return `<div class="h-at-dempty"><p class="h-at-big">📚</p><p class="muted">${v.sel.length > 1 ? plural(v.sel.length, 'élément choisi', 'éléments choisis') : 'Choisis un élément pour le voir ici.'}</p></div>`;
        }
        const i = P.byId.get(v.sel[0]); if (!i) return '';
        const d = i.data || {}, people = P.people || {};
        const row = (label, val, raw = false) => val ? `<div class="data-row"><dt>${esc(label)}</dt><dd>${raw ? val : esc(val)}</dd></div>` : '';
        const url = u => u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u.replace(/^https?:\/\//, '').slice(0, 50))} ↗</a>` : '';
        let body = '';
        switch (i.type) {
            case 'reference':
                body = `<div class="h-at-citebox"><span class="section-label">Référence</span><p>${cite(i)}</p></div><dl class="data-list">${row('Sorte', REF_KINDS[d.kind])}${(d.creators || []).map(c => row(ROLES[c.role] || 'auteur', [c.first, c.last].filter(Boolean).join(' '))).join('')}
                    ${row(d.kind === 'article' || d.kind === 'presse' ? 'Revue, journal' : d.kind === 'web' ? 'Site' : 'Dans', d.container)}${row('Année', d.year)}${row('Date', d.date)}${row('Éditeur', d.publisher)}${row('Lieu d’édition', d.place)}${row('Volume', d.volume)}${row('Numéro', d.issue)}${row('Pages', d.pages)}
                    ${row('Dépôt, institution', d.archive)}${row('Cote', d.call_number)}${row('Technique', d.technique)}${row('Dimensions', d.dimensions)}${row('ISBN', d.isbn)}${row('DOI', d.doi)}${row('Lien', url(d.url), true)}${row('Consulté le', d.accessed)}${row('Langue', d.language)}${row('Lecture', READ[d.read] !== '—' ? READ[d.read] : '')}</dl>
                    ${d.abstract ? `<details><summary>Résumé</summary><p>${nl(d.abstract)}</p></details>` : ''}`;
                { const quotes = live().filter(q => q.type === 'quote' && Number(q.data.source_id) === Number(i.id)); if (quotes.length) body += `<h4>❝ Citations tirées de cette référence</h4>${quotes.map(q => `<button type="button" class="h-at-quote" data-at-pick="${q.id}">${esc(q.data.text.slice(0, 220))}${q.data.text.length > 220 ? '…' : ''}${q.data.page ? ` <small>p. ${esc(q.data.page)}</small>` : ''}</button>`).join('')}`; }
                break;
            case 'quote': { const src = d.source_id ? P.byId.get(Number(d.source_id)) : null;
                body = `<blockquote class="h-at-bq">${nl(d.text)}</blockquote>${d.translation ? `<p class="muted"><i>${nl(d.translation)}</i></p>` : ''}<dl class="data-list">${row('Source', src ? `<button type="button" class="link-button" data-at-pick="${src.id}">${cite(src)}</button>` : '', true)}${row('Page', d.page)}${row('Langue', d.lang)}</dl>`; break; }
            case 'media': body = `<dl class="data-list">${row('Auteur, graveur', d.creator)}${row('Date', d.date)}${row('Technique', d.technique)}${row('Dimensions', d.dimensions)}${row('Conservé à', d.holder)}${row('Cote, n° d’inventaire', d.call_number)}${row('Crédit, droits', d.credit)}${row('Lien', url(d.url), true)}</dl>${d.caption ? `<p class="h-at-caption">${nl(d.caption)}</p>` : ''}`; break;
            case 'person': { const b = d.person_id ? people[d.person_id] : null; body = `<dl class="data-list">${row('Dans ta base', b ? `<button type="button" class="table-link" data-h-person="${b.id}">${esc(pname(b))}</button>` : '', true)}${row('Rôle, métier', d.role)}${row('Dates', d.dates)}${row('Lieux', d.places)}</dl>`; break; }
            case 'place': body = `<dl class="data-list">${row('Lieu', d.place?.text)}${row('Sorte de lieu', d.kind)}</dl>${d.place?.lat !== null && d.place?.lat !== undefined && ext.miniMap ? ext.miniMap([{lat: +d.place.lat, lon: +d.place.lon, label: i.title}], [], {height: 200}) : ''}`; break;
            case 'event': body = `<dl class="data-list">${row('Date', d.date)}${row('Jusqu’au', d.end)}${row('Lieu', d.place?.text)}${row('Personnes', (d.people || []).map(pid => people[pid] ? `<button type="button" class="table-link" data-h-person="${pid}">${esc(pname(people[pid]))}</button>` : '').join(', '), true)}</dl>`; break;
            case 'link': body = `<dl class="data-list">${row('Adresse', url(d.url), true)}${row('Site', d.site)}${row('Consulté le', d.accessed)}</dl>`; break;
            case 'task': body = `<label class="checkbox-line h-at-taskbig"><input type="checkbox" data-at-taskdone="${i.id}" ${Number(d.done) ? 'checked' : ''}> Fait</label><dl class="data-list">${row('Pour le', d.due ? new Date(d.due + 'T12:00:00').toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'}) : '')}${row('Priorité', d.priority)}</dl>`; break;
            case 'draft': { const w = (String(d.text || '').match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) || []).length, t = Number(d.target);
                body = `<p><b>${fmt(w)}</b> mots${t ? ` sur ${fmt(t)}` : ''} · ${esc(STAGES[d.stage] || '')}</p>${t ? `<div class="h-progress"><span style="width:${Math.min(100, Math.round(100 * w / t))}%"></span></div>` : ''}<div class="h-at-draft">${nl(String(d.text || '').slice(0, 3000))}${String(d.text || '').length > 3000 ? '<p class="muted">…</p>' : ''}</div><button type="button" class="button small" data-at-write="${i.id}">✍️ Écrire</button>`; break; }
            case 'custom': { const def = tentry(i), vals = d.values || {}, fields = def?.fields || Object.keys(vals).map(k => ({key: k, label: k, type: 'text'}));
                body = `<dl class="data-list">${fields.map(f => { const v = vals[f.key]; if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return '';
                    const h = f.type === 'checkbox' ? (Number(v) ? '✅ oui' : '') : f.type === 'longtext' ? nl(v) : f.type === 'url' ? url(String(v)) : f.type === 'person' ? (people[v] ? `<button type="button" class="table-link" data-h-person="${Number(v)}">${esc(pname(people[v]))}</button>` : '') : f.type === 'place' ? esc(v?.text || '') : esc(typeof v === 'object' ? JSON.stringify(v) : v);
                    return h ? row(f.label, h, true) : ''; }).join('')}</dl>${def ? '' : '<p class="muted">Cette sorte d’élément n’existe plus dans les réglages : ses valeurs sont gardées.</p>'}`; break; }
            default: body = d.text ? `<div class="h-at-notetext">${nl(d.text)}</div>` : '';
        }
        const related = (d.related || []).map(id => P.byId.get(Number(id))).filter(Boolean);
        const backlinks = live().filter(x => (x.data?.related || []).map(Number).includes(Number(i.id)) && !related.includes(x));
        return `<div class="h-at-dhead"><span class="eyebrow">${ti(i)} ${esc(tl(i))}${Number(i.trashed) ? ' · dans la corbeille' : ''}</span><h3>${esc(i.title)}</h3>
            <div class="h-at-dactions">${Number(i.trashed) ? `<button type="button" class="button small" data-at-restore="${i.id}">Restaurer</button>` : `<button type="button" class="button small" data-at-edit="${i.id}">✎ Modifier</button>${i.type === 'reference' ? `<button type="button" class="button small secondary" data-at-copy="${i.id}" title="Copier la référence">📋 Citer</button>` : ''}<button type="button" class="button small secondary" data-at-dup="${i.id}" title="Dupliquer">⧉</button><button type="button" class="button small secondary danger" data-at-trash="${i.id}" title="Mettre à la corbeille">🗑</button>`}</div></div>
            ${body}
            ${i.media?.length && ext.thumbs ? `<h4>📎 Fichiers</h4>${ext.thumbs('at-' + i.id, i.media)}` : ''}
            ${d.notes ? `<h4>Notes</h4><div class="h-at-notetext">${nl(d.notes)}</div>` : ''}
            <h4>🏷 Étiquettes</h4><div class="h-at-dtags">${(i.tags || []).map(t => `<span class="h-at-tag is-on">${esc(t)} <button type="button" data-at-untag="${esc(t)}" aria-label="Retirer">×</button></span>`).join('')}<input data-at-addtag placeholder="+ étiquette" list="h-at-taglist"><datalist id="h-at-taglist">${[...new Set(live().flatMap(x => x.tags || []))].map(t => `<option value="${esc(t)}">`).join('')}</datalist></div>
            <h4>📁 Rangé dans</h4><div class="h-at-dfolders">${i.folders.map(f => P.fById.get(f)).filter(Boolean).map(f => `<span class="h-at-chip"><button type="button" class="link-button" data-at-go="${f.id}">${esc(pathOf(Number(f.id)).map(x => x.name).join(' › '))}</button> <button type="button" data-at-unfile="${f.id}" aria-label="Retirer de ce dossier">×</button></span>`).join('') || '<span class="muted">Non classé</span>'}
                <select data-at-file><option value="">+ ranger aussi dans…</option>${folderOptions()}</select></div>
            <h4>🔗 Voir aussi</h4><div class="h-at-drel">${[...related.map(x => [x, true]), ...backlinks.map(x => [x, false])].map(([x, own]) => `<span class="h-at-chip"><button type="button" class="link-button" data-at-pick="${x.id}">${ti(x)} ${esc(x.title.slice(0, 60))}</button>${own ? ` <button type="button" data-at-unrel="${x.id}" aria-label="Retirer">×</button>` : ''}</span>`).join('') || '<span class="muted">Rien</span>'}
                <input data-at-relq placeholder="+ relier à… (tape un titre)" list="h-at-rellist"><datalist id="h-at-rellist">${live().filter(x => x.id !== i.id).slice(0, 2000).map(x => `<option value="${esc(ti(x) + ' ' + x.title + ' #' + x.id)}">`).join('')}</datalist></div>
            <p class="muted h-at-dates">Ajouté le ${esc(new Date(String(i.created_at).replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR'))}${i.updated_at !== i.created_at ? ` · modifié le ${esc(new Date(String(i.updated_at).replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR'))}` : ''}</p>`;
    }

    /* ─────────── Formulaires ─────────── */
    const CUSTOM_FIELD_TYPES = [['text', '📝 Texte court'], ['longtext', '📄 Texte long'], ['date', '📅 Date'], ['number', '🔢 Nombre'], ['select', '📋 Liste de choix'], ['checkbox', '☑️ Case à cocher'], ['url', '🔗 Lien internet'], ['person', '👤 Personne de la base'], ['place', '📍 Lieu']];
    /** Élément d'une sorte créée dans Maintenance → Atelier : titre + ses champs, puis notes, étiquettes, dossiers et fichiers comme les autres. */
    function customDialog(key, item = null) {
        const v = st(), def = CFG.types.find(t => t.key === key) || {key, icon: '🧩', label: 'Élément', fields: []}, d = item?.data || {}, vals = d.values || {}, isNew = !item, people = P.people || {};
        const fieldHtml = f => { const n = 'cv_' + f.key, val = vals[f.key] ?? '', cls = f.width === 'half' ? '' : ' class="span-2"', help = f.help ? `<small class="muted">${esc(f.help)}</small>` : '', ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '', req = f.required ? ' required' : '';
            switch (f.type) {
                case 'longtext': return `<label class="span-2">${esc(f.label)}<textarea name="${n}" rows="4"${ph}${req}>${esc(val)}</textarea>${help}</label>`;
                case 'select': return `<label${cls}>${esc(f.label)}<select name="${n}"${req}><option value=""></option>${(f.options || []).map(o => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>${help}</label>`;
                case 'checkbox': return `<label class="checkbox-line${f.width === 'half' ? '' : ' span-2'}"><input type="checkbox" name="${n}" ${Number(val) ? 'checked' : ''}> ${esc(f.label)}</label>`;
                case 'person': return `<label${cls}>${esc(f.label)}${A().collectionPersonField(n, val ? people[val] || {id: val, first_name: '#' + val, last_name: ''} : null, 'Tape un nom…')}${help}</label>`;
                case 'place': return `<label${cls}>${esc(f.label)}${ext.placeField(n, val?.text || '', val?.lat ?? '', val?.lon ?? '', f.placeholder || 'Commune, adresse…')}${help}</label>`;
                case 'number': return `<label${cls}>${esc(f.label)}<input name="${n}" inputmode="decimal" value="${esc(val)}"${ph}${req}>${help}</label>`;
                case 'url': return `<label${cls}>${esc(f.label)}<input type="url" name="${n}" value="${esc(val)}" placeholder="${esc(f.placeholder || 'https://…')}"${req}>${help}</label>`;
                default: return `<label${cls}>${esc(f.label)}<input name="${n}" value="${esc(val)}"${ph}${req}>${help}</label>`;
            } };
        const folderIds = item ? item.folders : (typeof v.node === 'number' ? [v.node] : []);
        let savedId = 0;
        dialog({eyebrow: (isNew ? 'AJOUTER · ' : 'MODIFIER · ') + def.label.toUpperCase(), title: isNew ? `${def.icon} ${def.label}` : item.title, wide: true, submitLabel: 'Enregistrer',
            body: `<div class="form-grid"><label class="span-2">${esc(def.titleLabel || 'Titre')}<input name="title" value="${esc(item?.title || '')}" ${def.fields?.some(f => f.type === 'text') ? '' : 'required'}></label>${(def.fields || []).map(fieldHtml).join('')}
                <label class="span-2">Notes<textarea name="notes" rows="3">${esc(d.notes || '')}</textarea></label>
                <label class="span-2">Étiquettes <small>(séparées par des virgules)</small><input name="tags" value="${esc((item?.tags || []).join(', '))}"></label>
                <label class="span-2">Rangé dans <small>(⌘/Ctrl-clic pour plusieurs dossiers)</small><select name="folders" multiple size="${Math.min(8, Math.max(3, P.folders.length))}">${folderOptions(folderIds.map(Number))}</select></label></div>
                ${ext.mediaEditorHtml ? ext.mediaEditorHtml('atelier_item', item?.id || 0, item?.media || [], [['', 'Fichiers joints (PDF, scans, photos)', 'image/*,application/pdf,video/*,audio/*']]) : ''}`,
            onSubmit: async form => {
                const values = {}, pkeys = [];
                (def.fields || []).forEach(f => { const el = form.querySelector(`[name="cv_${f.key}"]`); if (!el) return;
                    if (f.type === 'checkbox') values[f.key] = el.checked ? 1 : 0;
                    else if (f.type === 'person') { values[f.key] = Number(el.value) || null; pkeys.push(f.key); }
                    else if (f.type === 'place') values[f.key] = {text: el.value, lat: form.querySelector(`[name="cv_${f.key}_lat"]`)?.value || null, lon: form.querySelector(`[name="cv_${f.key}_lon"]`)?.value || null};
                    else values[f.key] = el.value; });
                const keep = Object.fromEntries(Object.entries(vals).filter(([k]) => !(def.fields || []).some(f => f.key === k))); // valeurs d'anciens champs gardées
                const saved = await post('save_atelier_item', {id: savedId || item?.id || 0, project_id: P.project.id, type: 'custom', title: form.title.value, data: {ctype: key, values: {...keep, ...values}, pkeys, notes: form.notes.value, related: d.related || []},
                    tags: form.tags.value.split(',').map(t => t.trim()).filter(Boolean), folder_ids: [...form.folders.selectedOptions].map(o => Number(o.value)), starred: item ? Number(item.starred) : 0});
                savedId = Number(saved.result.id);
                if (ext.uploadMediaEditor) { try { await ext.uploadMediaEditor(form, 'atelier_item', savedId); } catch (error) { toast('Enregistré, mais un fichier n’a pas pu être ajouté : ' + error.message, 'error'); } }
                v.sel = [savedId]; toast(isNew ? 'Ajouté.' : 'Enregistré.'); await reload();
            },
        });
    }
    function itemDialog(type, item = null, preset = {}) {
        if (type === 'custom' || !TYPES[type]) return customDialog(item ? item.data?.ctype : type, item);
        const v = st(), d = item?.data || preset.data || {}, isNew = !item;
        const people = P.people || {};
        const inp = (name, label, val, attrs = '', cls = '') => `<label${cls ? ` class="${cls}"` : ''}>${label}<input name="${name}" value="${esc(val ?? '')}" ${attrs}></label>`;
        const area = (name, label, val, rows = 4, cls = 'span-2', ph = '') => `<label class="${cls}">${label}<textarea name="${name}" rows="${rows}" placeholder="${esc(ph)}">${esc(val ?? '')}</textarea></label>`;
        const creatorRow = (c = {}) => `<div class="h-at-creator"><input data-c="last" value="${esc(c.last || '')}" placeholder="Nom"><input data-c="first" value="${esc(c.first || '')}" placeholder="Prénom"><select data-c="role">${Object.entries(ROLES).map(([k, l]) => `<option value="${k}" ${(c.role || 'auteur') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select><button type="button" class="icon-button" data-c-del title="Retirer">✕</button></div>`;
        let fields = '';
        const title = item?.title ?? preset.title ?? '';
        switch (type) {
            case 'reference':
                fields = `<label>Sorte<select name="kind" data-at-refkind>${Object.entries(REF_KINDS).map(([k, l]) => `<option value="${k}" ${(d.kind || 'livre') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                    <label>Lecture<select name="read">${Object.entries(READ).map(([k, l]) => `<option value="${k}" ${(d.read || '') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                    <label class="span-2">Titre<input name="title" required value="${esc(title)}" placeholder="Titre de l’ouvrage, de l’article, du document"></label>
                    <div class="span-2"><span class="section-label">Auteurs, directeurs, graveurs…</span><div data-at-creators>${(d.creators?.length ? d.creators : [{}]).map(creatorRow).join('')}</div><button type="button" class="button small secondary" data-at-cadd>+ Personne</button></div>
                    ${inp('container', 'Revue, ouvrage, site, journal', d.container, 'placeholder="Revue d’histoire du XIXe siècle"', 'span-2')}
                    ${inp('year', 'Année', d.year, 'placeholder="1998"')}${inp('date', 'Date précise', d.date, 'placeholder="12 mai 1851"')}
                    ${inp('publisher', 'Éditeur (ou université)', d.publisher)}${inp('place', 'Lieu d’édition', d.place)}
                    ${inp('volume', 'Volume', d.volume)}${inp('issue', 'Numéro', d.issue)}${inp('pages', 'Pages', d.pages, 'placeholder="125-148, ou 320"')}${inp('edition', 'Édition', d.edition, 'placeholder="2e éd."')}
                    ${inp('archive', 'Dépôt, institution', d.archive, 'placeholder="Archives nationales, BnF Estampes, musée Carnavalet…"')}${inp('call_number', 'Cote, n° d’inventaire', d.call_number, 'placeholder="F/12/1234, Hennin 9876"')}
                    ${inp('technique', 'Technique (images)', d.technique, 'placeholder="eau-forte coloriée, vue d’optique"')}${inp('dimensions', 'Dimensions', d.dimensions, 'placeholder="28 × 42 cm"')}
                    ${inp('isbn', 'ISBN', d.isbn)}${inp('doi', 'DOI', d.doi)}${inp('url', 'Lien internet', d.url, 'type="url" placeholder="https://gallica.bnf.fr/…"')}${inp('accessed', 'Consulté le', d.accessed, 'placeholder="12/10/2026"')}
                    ${inp('language', 'Langue', d.language)}${area('abstract', 'Résumé', d.abstract, 3)}`;
                break;
            case 'quote': fields = `${area('text', 'Citation', d.text, 5, 'span-2', 'Le texte exact, tel qu’il est écrit')}
                    <label class="span-2">Tirée de<select name="source_id"><option value="">— aucune référence —</option>${P.items.filter(x => x.type === 'reference' && (!Number(x.trashed) || Number(x.id) === Number(d.source_id))).sort((a, b) => (firstAuthor(a) || a.title).localeCompare(firstAuthor(b) || b.title, 'fr')).map(x => `<option value="${x.id}" ${Number(d.source_id) === Number(x.id) ? 'selected' : ''}>${esc(shortCite(x) + ' — ' + x.title.slice(0, 80))}</option>`).join('')}</select></label>
                    ${inp('page', 'Page, folio', d.page, 'placeholder="p. 12, f° 3 v°"')}${inp('lang', 'Langue', d.lang)}${area('translation', 'Traduction', d.translation, 2)}
                    <label class="span-2">Titre <small>(facultatif : sinon le début de la citation)</small><input name="title" value="${esc(title)}"></label>`; break;
            case 'media': fields = `<label class="span-2">Titre<input name="title" required value="${esc(title)}" placeholder="Vue d’optique : la place Saint-Marc à Venise"></label>
                    ${inp('creator', 'Auteur, graveur, éditeur', d.creator, 'placeholder="Basset, rue Saint-Jacques"')}${inp('date', 'Date', d.date, 'placeholder="vers 1770"')}${inp('technique', 'Technique', d.technique, 'placeholder="eau-forte coloriée"')}${inp('dimensions', 'Dimensions', d.dimensions)}
                    ${inp('holder', 'Conservé à', d.holder, 'placeholder="BnF, département des Estampes"')}${inp('call_number', 'Cote, n° d’inventaire', d.call_number)}${inp('credit', 'Crédit, droits', d.credit)}${inp('url', 'Lien', d.url, 'type="url"')}${area('caption', 'Légende, description', d.caption, 3)}`; break;
            case 'person': fields = `<label class="span-2">Personne de ta base <small>(facultatif)</small>${A().collectionPersonField('person_id', d.person_id ? people[d.person_id] || {id: d.person_id, first_name: '#' + d.person_id, last_name: ''} : null, 'Tape un nom…')}</label>
                    <label class="span-2">Nom <small>(si ce n’est pas quelqu’un de ta base)</small><input name="title" value="${esc(title)}" placeholder="Pierre Martin, montreur d’optique"></label>
                    ${inp('role', 'Rôle, métier', d.role, 'placeholder="montreur de vues d’optique, colporteur"')}${inp('dates', 'Dates', d.dates, 'placeholder="vers 1740 – après 1789"')}${inp('places', 'Lieux', d.places, 'placeholder="Briançonnais, Paris, foires de Beaucaire"', 'span-2')}`; break;
            case 'place': fields = `<label class="span-2">Lieu${ext.placeField('place', d.place?.text || '', d.place?.lat ?? '', d.place?.lon ?? '', 'Commune, adresse, monument…')}</label>
                    ${inp('kind', 'Sorte de lieu', d.kind, 'placeholder="foire, atelier, dépôt d’archives"')}<label>Titre <small>(facultatif)</small><input name="title" value="${esc(title)}"></label>`; break;
            case 'event': fields = `<label class="span-2">Titre<input name="title" required value="${esc(title)}" placeholder="Foire Saint-Germain : un montreur d’optique condamné"></label>
                    ${inp('date', 'Date', d.date, 'placeholder="1775-02-03, ou mars 1775"')}${inp('end', 'Jusqu’au', d.end)}<label class="span-2">Lieu${ext.placeField('place', d.place?.text || '', d.place?.lat ?? '', d.place?.lon ?? '', 'Commune, adresse…')}</label>
                    <div class="span-2"><span class="section-label">Personnes de ta base</span><div data-at-people>${(d.people?.length ? d.people : ['']).map(pid => `<div class="h-rec-person">${A().collectionPersonField('ev_person', pid ? people[pid] || {id: pid, first_name: '#' + pid, last_name: ''} : null, 'Tape un nom…')}</div>`).join('')}</div><button type="button" class="button small secondary" data-at-padd>+ Personne</button></div>`; break;
            case 'link': fields = `${inp('url', 'Adresse', d.url, 'type="url" required placeholder="https://…"', 'span-2')}<label class="span-2">Titre<input name="title" value="${esc(title)}"></label>${inp('site', 'Site', d.site, 'placeholder="Gallica, Europeana…"')}${inp('accessed', 'Consulté le', d.accessed)}`; break;
            case 'task': fields = `<label class="span-2">Tâche<input name="title" required value="${esc(title)}" placeholder="Demander les cotes F/12 aux Archives nationales"></label>
                    <label>Pour le<input type="date" name="due" value="${esc(d.due || '')}"></label><label>Priorité<select name="priority">${['haute', 'normale', 'basse'].map(o => `<option ${(d.priority || 'normale') === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label><label class="checkbox-line"><input type="checkbox" name="done" ${Number(d.done) ? 'checked' : ''}> Fait</label>`; break;
            case 'draft': fields = `<label class="span-2">Titre<input name="title" required value="${esc(title)}" placeholder="Chapitre 2 : les routes des montreurs"></label>
                    <label>Avancement<select name="stage">${Object.entries(STAGES).map(([k, l]) => `<option value="${k}" ${(d.stage || 'idee') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label><label>Objectif de mots<input type="number" name="target" min="0" value="${Number(d.target) || ''}"></label>
                    <label class="span-2">Texte <small data-at-wc></small><textarea name="text" rows="18" class="h-at-writer">${esc(d.text || '')}</textarea></label>`; break;
            default: fields = `<label class="span-2">Titre <small>(facultatif)</small><input name="title" value="${esc(title)}"></label>${area('text', 'Note', d.text, 10)}`;
        }
        const folderIds = item ? item.folders : (preset.folders || (typeof v.node === 'number' ? [v.node] : []));
        let savedId = 0; // si l'envoi d'un fichier échoue après l'enregistrement, réessayer ne crée pas de doublon
        dialog({eyebrow: (isNew ? 'AJOUTER · ' : 'MODIFIER · ') + tl(type).toUpperCase(), title: isNew ? `${ti(type)} ${tl(type)}` : item.title, wide: true, submitLabel: 'Enregistrer',
            body: `<div class="form-grid">${fields}
                ${type === 'note' ? '' : area('notes', 'Notes', d.notes, 3, 'span-2', 'Ce que j’en pense, comment je vais m’en servir…')}
                <label class="span-2">Étiquettes <small>(séparées par des virgules)</small><input name="tags" value="${esc((item?.tags || preset.tags || []).join(', '))}" list="h-at-taglist2" placeholder="optique, colportage, foires"><datalist id="h-at-taglist2">${[...new Set(live().flatMap(x => x.tags || []))].map(t => `<option value="${esc(t)}">`).join('')}</datalist></label>
                <label class="span-2">Rangé dans <small>(⌘/Ctrl-clic pour plusieurs dossiers)</small><select name="folders" multiple size="${Math.min(8, Math.max(3, P.folders.length))}">${folderOptions(folderIds.map(Number))}</select></label></div>
                ${ext.mediaEditorHtml ? ext.mediaEditorHtml('atelier_item', item?.id || 0, item?.media || [], [['', type === 'media' ? 'Images, scans, documents' : 'Fichiers joints (PDF, scans, photos)', 'image/*,application/pdf,video/*,audio/*']]) : ''}`,
            onOpen: dl => {
                const cbox = dl.querySelector('[data-at-creators]');
                dl.querySelector('[data-at-cadd]')?.addEventListener('click', () => { cbox.insertAdjacentHTML('beforeend', creatorRow()); cbox.lastElementChild.querySelector('input').focus(); });
                cbox?.addEventListener('click', e => { if (e.target.closest('[data-c-del]')) { const r = e.target.closest('.h-at-creator'); if (cbox.children.length > 1) r.remove(); else r.querySelectorAll('input').forEach(x => { x.value = ''; }); } });
                dl.querySelector('[data-at-padd]')?.addEventListener('click', () => { const box = dl.querySelector('[data-at-people]'); box.insertAdjacentHTML('beforeend', `<div class="h-rec-person">${A().collectionPersonField('ev_person', null, 'Tape un nom…')}</div>`); A().bindCollectionPersonFields(box); });
                const wc = dl.querySelector('[data-at-wc]'), ta = dl.querySelector('.h-at-writer');
                if (wc && ta) { const up = () => { wc.textContent = '— ' + plural((ta.value.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) || []).length, 'mot', 'mots'); }; ta.addEventListener('input', up); up(); }
            },
            onSubmit: async form => {
                const f = name => form.querySelector(`[name="${name}"]`);
                const val = name => f(name)?.value ?? '';
                const data = {notes: val('notes'), related: d.related || []};
                const place = name => ({text: val(name), lat: val(name + '_lat') || null, lon: val(name + '_lon') || null});
                ({
                    reference: () => Object.assign(data, {kind: val('kind'), read: val('read'), creators: [...form.querySelectorAll('.h-at-creator')].map(r => ({last: r.querySelector('[data-c=last]').value, first: r.querySelector('[data-c=first]').value, role: r.querySelector('[data-c=role]').value})),
                        ...Object.fromEntries(['container', 'year', 'date', 'publisher', 'place', 'volume', 'issue', 'pages', 'edition', 'archive', 'call_number', 'technique', 'dimensions', 'isbn', 'doi', 'url', 'accessed', 'language', 'abstract'].map(k => [k, val(k)]))}),
                    quote: () => Object.assign(data, {text: val('text'), source_id: Number(val('source_id')) || null, page: val('page'), lang: val('lang'), translation: val('translation')}),
                    media: () => Object.assign(data, Object.fromEntries(['creator', 'date', 'technique', 'dimensions', 'holder', 'call_number', 'credit', 'url', 'caption'].map(k => [k, val(k)]))),
                    person: () => Object.assign(data, {person_id: Number(val('person_id')) || null, role: val('role'), dates: val('dates'), places: val('places'), name: val('title')}),
                    place: () => Object.assign(data, {place: place('place'), kind: val('kind')}),
                    event: () => Object.assign(data, {date: val('date'), end: val('end'), place: place('place'), people: [...form.querySelectorAll('[data-at-people] input[type=hidden][name=ev_person]')].map(x => Number(x.value)).filter(Boolean)}),
                    link: () => Object.assign(data, {url: val('url'), site: val('site'), accessed: val('accessed')}),
                    task: () => Object.assign(data, {due: val('due'), priority: val('priority'), done: f('done')?.checked ? 1 : 0}),
                    draft: () => Object.assign(data, {text: val('text'), target: Number(val('target')) || 0, stage: val('stage')}),
                    note: () => Object.assign(data, {text: val('text')}),
                }[type] || (() => {}))();
                const saved = await post('save_atelier_item', {id: savedId || item?.id || 0, project_id: P.project.id, type, title: val('title'), data, tags: val('tags').split(',').map(t => t.trim()).filter(Boolean),
                    folder_ids: [...(f('folders')?.selectedOptions || [])].map(o => Number(o.value)), starred: item ? Number(item.starred) : 0});
                savedId = Number(saved.result.id);
                if (ext.uploadMediaEditor) { try { await ext.uploadMediaEditor(form, 'atelier_item', savedId); } catch (error) { toast('Enregistré, mais un fichier n’a pas pu être ajouté : ' + error.message, 'error'); } }
                v.sel = [savedId];
                toast(isNew ? 'Ajouté.' : 'Enregistré.');
                await reload();
            },
        });
    }
    function folderDialog(folder, parentId = 0) {
        const isNew = !folder;
        dialog({eyebrow: 'DOSSIER', title: isNew ? (parentId ? `Sous-dossier de « ${P.fById.get(parentId)?.name} »` : 'Nouveau dossier') : 'Modifier le dossier', submitLabel: isNew ? 'Créer' : 'Enregistrer',
            body: `<div class="form-grid"><label class="span-2">Nom<input name="name" required value="${esc(folder?.name || '')}" placeholder="Chapitre 3 : les images montrées"></label>
                <label>Icône <small>(facultatif)</small><input name="icon" value="${esc(folder?.icon || '')}" maxlength="16" placeholder="📁" class="h-be-icon"></label><label>Couleur<input type="color" name="color" value="${esc(folder?.color || '#0066cc')}"></label>
                <label class="span-2">Dans<select name="parent_id"><option value="0">— à la racine du projet —</option>${(() => { const ban = folder ? new Set(descendants(Number(folder.id))) : new Set(); const out = []; const walk = (p, depth) => kids(p).forEach(f => { if (!ban.has(Number(f.id))) { out.push(`<option value="${f.id}" ${Number(folder ? folder.parent_id || 0 : parentId) === Number(f.id) ? 'selected' : ''}>${'  '.repeat(depth)}${esc(f.name)}</option>`); walk(Number(f.id), depth + 1); } }); walk(0, 0); return out.join(''); })()}</select></label>
                ${isNew ? '' : `<div class="span-2 h-at-forder"><button type="button" class="button small secondary" data-at-fmove="-1">↑ Monter</button><button type="button" class="button small secondary" data-at-fmove="1">↓ Descendre</button></div>`}</div>`,
            onOpen: dl => dl.querySelectorAll('[data-at-fmove]').forEach(b => b.addEventListener('click', async () => {
                const sibs = kids(folder.parent_id ? Number(folder.parent_id) : 0), i = sibs.findIndex(x => Number(x.id) === Number(folder.id)), dir = Number(b.dataset.atFmove);
                const before = dir < 0 ? sibs[i - 1] : sibs[i + 2];
                if (dir < 0 && !before) return; if (dir > 0 && i === sibs.length - 1) return;
                await post('save_atelier_folder', {id: folder.id, before: before ? before.id : 0}); dl.close(); await reload();
            })),
            onSubmit: async form => {
                const f = Object.fromEntries(new FormData(form));
                const body = {name: f.name, icon: f.icon, color: f.color === '#0066cc' && !folder?.color ? '' : f.color, parent_id: Number(f.parent_id) || 0};
                const r = await post('save_atelier_folder', isNew ? {...body, project_id: P.project.id} : {...body, id: folder.id});
                if (isNew) { st().node = Number(r.result.id); if (parentId) delete st().closed[parentId]; }
                await reload();
            },
            onDelete: isNew ? null : async () => {
                const sub = descendants(Number(folder.id)).length - 1;
                if (!confirm(`Supprimer le dossier « ${folder.name} »${sub ? ` et ses ${plural(sub, 'sous-dossier', 'sous-dossiers')}` : ''} ? Les éléments ne sont pas supprimés : ils restent dans le projet (dans « Non classés » s’ils ne sont rangés nulle part ailleurs).`)) return false;
                await post('delete_atelier_folder', {id: folder.id}); if (st().node === Number(folder.id)) st().node = 'all'; await reload();
            },
        });
    }

    /* ─────────── Exports ─────────── */
    function exportDialog() {
        const refs = live().filter(i => i.type === 'reference');
        const slug = String(P.project.title).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase().slice(0, 60) || 'projet';
        dialog({eyebrow: 'EXPORTER', title: P.project.title, body: `<div class="h-at-exports">
            <button type="button" class="button secondary" data-x="md">📄 Plan et textes (.md)<small>Les dossiers dans l’ordre, avec leurs notes, brouillons, citations et références : à ouvrir dans un traitement de texte</small></button>
            <button type="button" class="button secondary" data-x="bib">📚 Références (.bib)<small>${plural(refs.length, 'référence', 'références')}, pour un gestionnaire de bibliographie ou LaTeX</small></button>
            <button type="button" class="button secondary" data-x="ris">📚 Références (.ris)<small>Le format accepté par presque tous les logiciels de bibliographie</small></button>
            <button type="button" class="button secondary" data-x="csv">📊 Tableau de tous les éléments (.csv)<small>Pour un tableur</small></button>
            <button type="button" class="button secondary" data-x="plan">🗂️ Enregistrer ce plan comme plan de départ<small>Les dossiers de ce projet seront proposés à la création d’un nouveau projet</small></button></div>`,
            onOpen: dl => dl.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => {
                const x = b.dataset.x;
                if (x === 'plan') { ext.atelierSavePlanFromProject(); return; }
                if (x === 'bib') ext.downloadText(slug + '.bib', toBibtex(refs), 'text/plain');
                if (x === 'ris') ext.downloadText(slug + '.ris', toRis(refs), 'application/x-research-info-systems');
                if (x === 'md') ext.downloadText(slug + '.md', toMarkdown(), 'text/markdown');
                if (x === 'csv') { const q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"'; ext.downloadText(slug + '.csv', '﻿' + [['Sorte', 'Titre', 'Auteurs', 'Date', 'Dossiers', 'Étiquettes', 'Référence'].map(q).join(';'), ...live().map(i => [tl(i), i.title, i.type === 'reference' ? creatorsOf(i).map(c => [c.last, c.first].filter(Boolean).join(' ')).join(' ; ') : '', year(i) || i.data.date || '', i.folders.map(f => pathOf(f).map(y => y.name).join(' › ')).join(' ; '), (i.tags || []).join(', '), i.type === 'reference' ? cite(i, false) : ''].map(q).join(';'))].join('\n'), 'text/csv'); }
                toast('Fichier prêt.');
            })),
        });
    }
    function toMarkdown() {
        const out = [`# ${P.project.title}`, P.project.subtitle ? `*${P.project.subtitle}*` : '', P.project.description ? '\n' + P.project.description : ''];
        const itemMd = i => { const d = i.data || {};
            if (i.type === 'draft') return `\n${d.text || ''}\n`;
            if (i.type === 'note') return `\n> 📝 ${String(d.text || '').replace(/\n/g, '\n> ')}\n`;
            if (i.type === 'quote') { const s = d.source_id ? P.byId.get(Number(d.source_id)) : null; return `\n> « ${String(d.text || '').replace(/\n/g, '\n> ')} »${s ? `\n> — ${cite(s, false)}${d.page ? ', ' + d.page : ''}` : ''}\n`; }
            if (i.type === 'reference') return `- ${cite(i, 'md')}`;
            return `- ${ti(i)} ${i.title}${d.notes ? ' — ' + d.notes.replace(/\n/g, ' ') : ''}`;
        };
        const walk = (parent, depth) => kids(parent).forEach(f => {
            out.push('', `${'#'.repeat(Math.min(6, depth + 2))} ${f.name}`);
            if (f.notes) out.push('', f.notes);
            const items = live().filter(i => i.folders.includes(Number(f.id))).sort((a, b) => (a.type === 'draft' ? 0 : 1) - (b.type === 'draft' ? 0 : 1) || a.title.localeCompare(b.title, 'fr'));
            items.forEach(i => out.push(itemMd(i)));
            walk(Number(f.id), depth + 1);
        });
        walk(0, 0);
        const unfiled = live().filter(i => !i.folders.length);
        if (unfiled.length) { out.push('', '## Non classés'); unfiled.forEach(i => out.push(itemMd(i))); }
        return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
    }

    /* ─────────── Gestes ─────────── */
    let lastClick = 0;
    function bindProject(ws) {
        const v = st();
        const go = node => { v.node = node; v.sel = []; renderProject(S().workspaceToken); ws.querySelector('.h-at-main')?.scrollTo(0, 0); };
        const act = async (action, ids, extra = {}) => { try { const r = await post('atelier_items_action', {project_id: P.project.id, ids, action, ...extra}); await reload(); return r.result; } catch (error) { toast(error.message, 'error'); } };
        ws.querySelector('[data-at-home]').addEventListener('click', () => { v.project = 0; P = null; ext.atelier(++S().workspaceToken); });
        ws.querySelector('[data-at-pedit]').addEventListener('click', () => projectDialog(P.project, P.kinds));
        ws.querySelector('[data-at-export]').addEventListener('click', exportDialog);
        ws.addEventListener('click', async e => {
            const t = e.target;
            const q = sel => t.closest(sel);
            if (q('[data-at-toggle]')) { const id = Number(q('[data-at-toggle]').dataset.atToggle); v.closed[id] = !v.closed[id]; return renderProject(S().workspaceToken, true); }
            if (q('[data-at-fadd]')) { e.stopPropagation(); return folderDialog(null, Number(q('[data-at-fadd]').dataset.atFadd)); }
            if (q('[data-at-fedit]')) { e.stopPropagation(); return folderDialog(P.fById.get(Number(q('[data-at-fedit]').dataset.atFedit))); }
            if (q('[data-at-go]')) { const g = q('[data-at-go]').dataset.atGo; return go(/^\d+$/.test(g) ? Number(g) : g); }
            if (q('[data-at-typejump]')) { v.type = q('[data-at-typejump]').dataset.atTypejump; return go('all'); }
            if (q('[data-at-tag]')) { const tg = q('[data-at-tag]').dataset.atTag; v.tags = v.tags.includes(tg) ? v.tags.filter(x => x !== tg) : [...v.tags, tg]; if ([...SPECIAL_VIEWS, 'trash'].includes(v.node)) v.node = 'all'; return renderProject(S().workspaceToken, true); }
            if (q('[data-at-tagclear]')) { v.tags = []; return renderProject(S().workspaceToken, true); }
            if (q('[data-at-settings]')) return openSettings();
            if (q('[data-at-addmenu]')) { const m = q('.h-at-addmenu').querySelector('.h-at-menu'); m.hidden = !m.hidden; return; }
            if (q('[data-at-add]')) { ws.querySelector('.h-at-menu')?.setAttribute('hidden', ''); return itemDialog(q('[data-at-add]').dataset.atAdd); }
            if (q('[data-at-import]')) {
                const file = await pickNamedFile(IMPORT_ACCEPT); if (!file) return;
                try { const r = await post('atelier_import', {project_id: P.project.id, folder_id: typeof v.node === 'number' ? v.node : 0, text: file.text}); toast('Importé : ' + importSummary(r.result) + '.'); await reload(); } catch (error) { toast(error.message, 'error'); }
                return;
            }
            if (q('[data-at-sort]')) { const c = q('[data-at-sort]').dataset.atSort; v.sort = v.sort.col === c ? {col: c, dir: -v.sort.dir} : {col: c, dir: 1}; return renderProject(S().workspaceToken, true); }
            if (q('[data-at-star]')) { e.stopPropagation(); const i = P.byId.get(Number(q('[data-at-star]').dataset.atStar)); return act(Number(i.starred) ? 'unstar' : 'star', [Number(i.id)]); }
            if (q('[data-at-pick]')) { const id = Number(q('[data-at-pick]').dataset.atPick), i = P.byId.get(id); if (!i) return; v.sel = [id]; return renderProject(S().workspaceToken, true); }
            if (q('[data-at-edit]')) { const i = P.byId.get(Number(q('[data-at-edit]').dataset.atEdit)); return itemDialog(i.type, i); }
            if (q('[data-at-write]')) { const i = P.byId.get(Number(q('[data-at-write]').dataset.atWrite)); return itemDialog(i.type, i); }
            if (q('[data-at-dup]')) { const i = P.byId.get(Number(q('[data-at-dup]').dataset.atDup)); try { const r = await post('save_atelier_item', {project_id: P.project.id, type: i.type, title: i.title + ' (copie)', data: i.data, tags: i.tags, folder_ids: i.folders}); v.sel = [Number(r.result.id)]; toast('Dupliqué (sans les fichiers joints).'); await reload(); } catch (error) { toast(error.message, 'error'); } return; }
            if (q('[data-at-copy]')) { const i = P.byId.get(Number(q('[data-at-copy]').dataset.atCopy)); try { await navigator.clipboard.writeText(cite(i, false)); toast('Référence copiée.'); } catch (_) { toast(cite(i, false)); } return; }
            if (q('[data-at-trash]')) { const id = Number(q('[data-at-trash]').dataset.atTrash); await act('trash', [id]); toast('Mis à la corbeille (on peut l’en sortir).'); return; }
            if (q('[data-at-restore]')) return act('restore', [Number(q('[data-at-restore]').dataset.atRestore)]);
            if (q('[data-at-untag]')) return act('untag', v.sel, {tag: q('[data-at-untag]').dataset.atUntag});
            if (q('[data-at-unfile]')) return act('remove', v.sel, {folder_id: Number(q('[data-at-unfile]').dataset.atUnfile)});
            if (q('[data-at-unrel]')) { const i = P.byId.get(v.sel[0]); const rel = (i.data.related || []).filter(x => Number(x) !== Number(q('[data-at-unrel]').dataset.atUnrel)); return saveData(i, {related: rel}); }
            if (q('[data-at-emptytrash]')) { const ids = P.items.filter(i => Number(i.trashed)).map(i => Number(i.id)); if (confirm(`Supprimer définitivement ${plural(ids.length, 'élément', 'éléments')} ?`)) { await act('delete', ids); v.sel = []; } return; }
            if (q('[data-at-unsel]')) { v.sel = []; return renderProject(S().workspaceToken, true); }
            if (q('[data-at-bulk]')) {
                const a = q('[data-at-bulk]').dataset.atBulk;
                if (a === 'tag') { const tg = prompt('Étiquette à ajouter :'); if (tg?.trim()) await act('tag', v.sel, {tag: tg.trim()}); return; }
                if (a === 'delete' && !confirm(`Supprimer définitivement ${plural(v.sel.length, 'élément', 'éléments')} ?`)) return;
                await act(a, v.sel, {folder_id: typeof v.node === 'number' ? v.node : 0}); if (['trash', 'delete', 'restore', 'remove'].includes(a)) { v.sel = []; renderProject(S().workspaceToken, true); }
                return;
            }
            if (q('[data-at-copybib]')) { const txt = ws.querySelector('[data-at-biblio]').innerText; try { await navigator.clipboard.writeText(txt); toast('Bibliographie copiée.'); } catch (_) { toast('Copie impossible : sélectionne le texte à la main.', 'error'); } return; }
            if (q('[data-at-printbib]')) { const w = window.open('', '_blank'); if (!w) return; w.document.write(`<!doctype html><meta charset="utf-8"><title>Bibliographie</title><style>body{font:12pt/1.5 Georgia,serif;max-width:46rem;margin:2rem auto}li{margin:.3rem 0;list-style:none;text-indent:-1.5rem;padding-left:1.5rem}button{all:unset}</style><h1>${esc(P.project.title)}</h1>${ws.querySelector('[data-at-biblio]').innerHTML}`); w.document.close(); w.print(); return; }
            if (q('[data-at-exp]')) { const x = q('[data-at-exp]').dataset.atExp, refs = live().filter(i => i.type === 'reference'); ext.downloadText('references.' + x, x === 'bib' ? toBibtex(refs) : toRis(refs), 'text/plain'); return; }
            // ligne du tableau : choisir (clic), plusieurs (⌘/Ctrl, Maj), modifier (double-clic)
            const tr = q('[data-at-item]');
            if (tr) {
                const id = Number(tr.dataset.atItem), now = Date.now();
                if (now - lastClick < 350 && v.sel.length === 1 && v.sel[0] === id) { lastClick = 0; const i = P.byId.get(id); if (!Number(i.trashed)) itemDialog(i.type, i); return; }
                lastClick = now;
                if (e.metaKey || e.ctrlKey) v.sel = v.sel.includes(id) ? v.sel.filter(x => x !== id) : [...v.sel, id];
                else if (e.shiftKey && v.sel.length) { const rows = [...ws.querySelectorAll('[data-at-item]')].map(r => Number(r.dataset.atItem)); const a = rows.indexOf(v.sel[v.sel.length - 1]), b = rows.indexOf(id); v.sel = [...new Set([...v.sel, ...rows.slice(Math.min(a, b), Math.max(a, b) + 1)])]; }
                else v.sel = [id];
                return renderProject(S().workspaceToken, true);
            }
        });
        ws.addEventListener('change', async e => {
            const t = e.target;
            if (t.matches('[data-at-type]')) { v.type = t.value; return renderProject(S().workspaceToken, true); }
            if (t.matches('[data-at-deep]')) { v.deep = t.checked; return renderProject(S().workspaceToken, true); }
            if (t.matches('[data-at-q]')) { v.q = t.value.trim(); if (SPECIAL_VIEWS.includes(v.node)) v.node = 'all'; return renderProject(S().workspaceToken, true); }
            if (t.matches('[data-at-biblioscope]')) { v.biblioScope = Number(t.value) || 0; return renderProject(S().workspaceToken, true); }
            if (t.matches('[data-at-taskdone]')) { const i = P.byId.get(Number(t.dataset.atTaskdone)); return saveData(i, {done: t.checked ? 1 : 0}); }
            if (t.matches('[data-at-bulkfolder]') && t.value) { if (await act('add', v.sel, {folder_id: Number(t.value)})) toast('Rangé.'); return; }
            if (t.matches('[data-at-file]') && t.value) return act('add', v.sel, {folder_id: Number(t.value)});
            if (t.matches('[data-at-addtag]') && t.value.trim()) return act('tag', v.sel, {tag: t.value.trim()});
            if (t.matches('[data-at-relq]') && t.value) { const m = t.value.match(/#(\d+)$/); if (!m) return; const i = P.byId.get(v.sel[0]); return saveData(i, {related: [...new Set([...(i.data.related || []), Number(m[1])])]}); }
            if (t.matches('[data-at-fnotes]')) { try { await post('save_atelier_folder', {id: v.node, notes: t.value}); P.fById.get(v.node).notes = t.value; toast('Notes du dossier enregistrées.'); } catch (error) { toast(error.message, 'error'); } }
        });
        ws.querySelector('[data-at-q]')?.addEventListener('search', e => { v.q = e.target.value.trim(); renderProject(S().workspaceToken, true); });
        ws.querySelector('[data-at-tagq]')?.addEventListener('input', e => { const q = e.target.value.toLowerCase(); ws.querySelectorAll('[data-at-tag]').forEach(b => { b.hidden = q && !b.dataset.atTag.toLowerCase().includes(q); }); });
        ws.querySelector('[data-at-addtag]')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.dispatchEvent(new Event('change', {bubbles: true})); } });
        // Glisser-déposer : éléments → dossier ; dossier → dossier (ou racine)
        let drag = null;
        ws.addEventListener('dragstart', e => {
            const tr = e.target.closest?.('[data-at-item]'), fr = e.target.closest?.('.h-at-row[data-at-go]');
            if (tr) { const id = Number(tr.dataset.atItem); drag = {items: v.sel.includes(id) ? v.sel : [id]}; e.dataTransfer.setData('text/plain', 'items'); e.dataTransfer.effectAllowed = 'copyMove'; }
            else if (fr && /^\d+$/.test(fr.dataset.atGo)) { drag = {folder: Number(fr.dataset.atGo)}; e.dataTransfer.setData('text/plain', 'folder'); e.dataTransfer.effectAllowed = 'move'; }
        });
        ws.addEventListener('dragend', () => { drag = null; ws.querySelectorAll('.is-drop').forEach(x => x.classList.remove('is-drop')); });
        const targetOf = e => e.target.closest?.('.h-at-row[data-at-go], [data-at-drop], [data-at-folder-drop]');
        ws.addEventListener('dragover', e => {
            const tg = targetOf(e); if (!tg || !drag) return;
            const id = tg.dataset.atFolderDrop || tg.dataset.atGo;
            if (drag.folder && !(/^\d+$/.test(id || '') || tg.dataset.atDrop === 'root')) return;
            if (drag.folder && /^\d+$/.test(id || '') && descendants(drag.folder).includes(Number(id))) return;
            if (drag.items && !/^\d+$/.test(id || '') && !['trash', 'starred', 'unfiled'].includes(tg.dataset.atDrop)) return;
            e.preventDefault(); ws.querySelectorAll('.is-drop').forEach(x => x !== tg && x.classList.remove('is-drop')); tg.classList.add('is-drop');
        });
        ws.addEventListener('drop', async e => {
            const tg = targetOf(e); if (!tg || !drag) return; e.preventDefault();
            const id = tg.dataset.atFolderDrop || tg.dataset.atGo, d = drag; drag = null;
            if (d.folder) { try { await post('save_atelier_folder', {id: d.folder, parent_id: /^\d+$/.test(id || '') ? Number(id) : 0}); if (/^\d+$/.test(id || '')) delete v.closed[Number(id)]; await reload(); } catch (error) { toast(error.message, 'error'); } return; }
            if (tg.dataset.atDrop === 'trash') { if (await act('trash', d.items)) { v.sel = []; renderProject(S().workspaceToken, true); } return; }
            if (tg.dataset.atDrop === 'starred') return act('star', d.items);
            if (tg.dataset.atDrop === 'unfiled') { if (await act('unfile', d.items)) toast('Sorti de tous les dossiers (« Non classés »).'); return; }
            const folder = Number(id), moving = typeof v.node === 'number' && v.node !== folder && !e.altKey;
            if (await act(moving ? 'move' : 'add', d.items, {folder_id: folder, from: moving ? v.node : 0, from_deep: moving && v.deep ? 1 : 0})) toast(`${moving ? 'Déplacé' : 'Rangé'} dans « ${P.fById.get(folder)?.name} ».`);
        });
    }
    async function saveData(i, patch) {
        try { await post('save_atelier_item', {id: i.id, project_id: P.project.id, title: i.title, data: {...i.data, ...patch}, tags: i.tags}); await reload(); }
        catch (error) { toast(error.message, 'error'); }
    }

    /* ═══════════ ⚙ Maintenance → Atelier de recherche : tout se règle ici ═══════════ */
    const openSettings = () => { S().maintenanceTab = 'atelier'; A().setModule('maintenance'); };
    ext.maintenance = ext.maintenance || {};
    // Plan écrit en texte : un dossier par ligne, décalé (espaces, tabulation ou tirets) pour les sous-dossiers, émoji au début facultatif
    const EMOJI_START = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s+/u;
    function outlineToTree(text) {
        const root = [], stack = [{depth: -1, children: root}];
        String(text || '').split(/\r?\n/).forEach(line => {
            if (!line.trim()) return;
            const m = line.match(/^([ \t>•*-]*)(.*)$/); const depth = (m[1].replace(/\t/g, '  ').length);
            let name = m[2].trim(), icon = '';
            const e = name.match(EMOJI_START); if (e) { icon = e[1]; name = name.slice(e[0].length).trim(); }
            if (!name) return;
            while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
            const node = {name: name.slice(0, 200), icon, children: []};
            stack[stack.length - 1].children.push(node); stack.push({depth, children: node.children});
        });
        return root;
    }
    const treeToOutline = (tree, depth = 0) => (tree || []).map(n => '  '.repeat(depth) + (n.icon ? n.icon + ' ' : '') + n.name + (n.children?.length ? '\n' + treeToOutline(n.children, depth + 1) : '')).join('\n');
    const countTree = t => (t || []).reduce((a, n) => a + 1 + countTree(n.children), 0);
    ext.atelierSavePlanFromProject = () => {
        if (!P) return;
        const walk = parent => kids(parent).map(f => ({name: f.name, icon: f.icon || '', children: walk(Number(f.id))}));
        const tree = walk(0);
        if (!tree.length) return toast('Ce projet n’a pas de dossiers.', 'error');
        CFG.plans.push({key: uid('p_'), label: 'Plan de « ' + P.project.title.slice(0, 50) + ' »', tree, custom: true}); saveCfg();
        toast('Plan enregistré : il est proposé à la création d’un projet (Maintenance → Atelier pour le renommer).');
    };
    ext.maintenance.atelier = async token => {
        CFG = loadCfg();
        if (token !== S().workspaceToken || S().module !== 'maintenance') return;
        const ws = A().$('#workspace');
        const iconInput = (attr, value) => `<span class="h-at-iconfield"><input ${attr} value="${esc(value || '')}" maxlength="16" class="h-be-icon" aria-label="Émoji"><button type="button" class="icon-button" data-cfg-emoji title="Choisir un émoji">😀</button></span>`;
        const moveBtns = (list, i) => `<span class="h-rb-tools"><button type="button" class="icon-button" data-cfg-move="-1" ${i === 0 ? 'disabled' : ''} title="Monter">↑</button><button type="button" class="icon-button" data-cfg-move="1" ${i === list.length - 1 ? 'disabled' : ''} title="Descendre">↓</button></span>`;
        const row = (sec, x, i, list, extra = '') => `<div class="h-cfg-row ${x.hidden ? 'is-hidden' : ''}" data-cfg-sec="${sec}" data-cfg-i="${i}">${moveBtns(list, i)}
            ${sec === 'plans' ? '' : iconInput('data-cfg="icon"', x.icon)}<input data-cfg="label" value="${esc(x.label)}" class="h-cfg-label" aria-label="Nom">
            ${x.key === 'trash' ? '<small class="muted">toujours visible</small>' : `<label class="checkbox-line"><input type="checkbox" data-cfg="hidden" ${x.hidden ? 'checked' : ''}> masquer</label>`}
            ${x.builtin ? '<small class="muted h-cfg-tag">de l’app</small>' : '<small class="h-cfg-tag is-mine">à moi</small>'}${extra}</div>`;
        const navExtra = x => x.custom ? `<button type="button" class="button small secondary" data-cfg-view-edit>Filtre…</button><button type="button" class="icon-button danger" data-cfg-del title="Supprimer">🗑</button>` : '';
        const typeExtra = x => x.custom ? `<button type="button" class="button small secondary" data-cfg-type-edit>Champs (${(x.fields || []).length})…</button><button type="button" class="icon-button danger" data-cfg-del title="Supprimer">🗑</button>` : '';
        const planExtra = x => `<small class="muted">${plural(countTree(x.tree), 'dossier', 'dossiers')}</small>${x.custom ? `<button type="button" class="button small secondary" data-cfg-plan-edit>Modifier…</button><button type="button" class="icon-button danger" data-cfg-del title="Supprimer">🗑</button>` : `<button type="button" class="button small secondary" data-cfg-plan-copy>Copier pour le modifier</button>`}`;
        ws.innerHTML = `<section class="page collection-page h-cfg">${`<header class="page-header"><div><span class="eyebrow">MAINTENANCE</span><h2>📚 Atelier de recherche</h2><p>Les réglages de l’Atelier (Enquêtes → Atelier) : l’ordre et les émojis du menu d’un projet, tes propres vues, les sortes d’éléments (et les tiennes, avec leurs champs), les émojis des dossiers et tes plans de départ. Tout est enregistré tout de suite.</p></div><div class="page-actions"><button type="button" class="button secondary" data-cfg-open>Ouvrir l’Atelier</button></div></header>`}
            <section class="maintenance-panel"><h3>1. Le menu de gauche d’un projet</h3><p class="muted">Monte, descends, change l’émoji ou le nom, masque ce dont tu ne te sers pas (la Corbeille reste toujours). Une <b>vue à toi</b> regroupe les éléments selon tes critères (ex. « 📕 À lire » : les références à lire ; « 🖼 Gravures » : les images et références « gravure »).</p>
                <div class="h-cfg-list">${CFG.nav.map((x, i, l) => row('nav', x, i, l, navExtra(x))).join('')}</div><button type="button" class="button small" data-cfg-view-add>+ Ma propre vue</button></section>
            <section class="maintenance-panel"><h3>2. Les sortes d’éléments</h3><p class="muted">L’ordre du menu « + Ajouter » et de « Toutes les sortes ». Une sorte masquée ne se propose plus, mais ce qui existe déjà reste visible. <b>Ta propre sorte</b> a les champs que tu veux (ex. « 🎞 Plaque de lanterne » : sujet, fabricant, dimensions, état, lieu de conservation…).</p>
                <div class="h-cfg-list">${CFG.types.map((x, i, l) => row('types', x, i, l, typeExtra(x))).join('')}</div><button type="button" class="button small" data-cfg-type-add>+ Ma propre sorte d’élément</button></section>
            <section class="maintenance-panel"><h3>3. Les dossiers</h3><p class="muted">L’émoji des dossiers qui n’en ont pas. Chaque dossier peut aussi avoir le sien : dans un projet, survole le dossier puis ✎.</p>
                <div class="form-grid"><label>Dossier fermé ${iconInput('data-cfg-folder="closed"', CFG.folders.closed)}</label><label>Dossier ouvert ${iconInput('data-cfg-folder="open"', CFG.folders.open)}</label></div></section>
            <section class="maintenance-panel"><h3>4. Les plans de départ</h3><p class="muted">Proposés quand on crée un projet. Range-les, masque ceux qui ne te servent pas, crée les tiens (ou copie un plan de l’app pour le changer). Astuce : dans un projet, « Exporter… → Enregistrer ce plan » garde ses dossiers comme plan.</p>
                <div class="h-cfg-list">${CFG.plans.map((x, i, l) => row('plans', x, i, l, planExtra(x))).join('')}</div><button type="button" class="button small" data-cfg-plan-add>+ Mon plan</button></section>
            <div class="page-actions"><button type="button" class="button secondary danger" data-cfg-reset>Tout remettre comme au départ</button></div></section>`;
        const again = () => ext.maintenance.atelier(S().workspaceToken);
        const listOf = sec => CFG[sec];
        const at = el => { const r = el.closest('[data-cfg-i]'); return r ? [r.dataset.cfgSec, Number(r.dataset.cfgI)] : [null, -1]; };
        ws.querySelector('[data-cfg-open]').addEventListener('click', () => { S().enquetesTab = 'atelier'; A().setModule('enquetes'); });
        ws.addEventListener('input', e => {
            const t = e.target;
            if (t.dataset.cfgFolder) { CFG.folders[t.dataset.cfgFolder] = t.value.trim() || (t.dataset.cfgFolder === 'open' ? '📂' : '📁'); saveCfg(); return; }
            const [sec, i] = at(t); if (!sec || !t.dataset.cfg || t.type === 'checkbox') return;
            listOf(sec)[i][t.dataset.cfg] = t.value; saveCfg();
        }, {signal: (ws._cfgCtl = (ws._cfgCtl?.abort(), new AbortController())).signal});
        ws.addEventListener('change', e => {
            const t = e.target, [sec, i] = at(t);
            if (sec && t.dataset.cfg === 'hidden') { listOf(sec)[i].hidden = t.checked; saveCfg(); t.closest('.h-cfg-row').classList.toggle('is-hidden', t.checked); }
            if (sec && t.dataset.cfg === 'label' && !t.value.trim()) { saveCfg(); again(); } // nom vidé : celui de l'app revient
        }, {signal: ws._cfgCtl.signal});
        ws.addEventListener('click', e => {
            const t = e.target, [sec, i] = at(t);
            if (t.closest('[data-cfg-emoji]')) { const input = t.closest('.h-at-iconfield').querySelector('input'); return ext.pickEmoji?.(input); }
            if (t.closest('[data-cfg-move]')) { const l = listOf(sec), j = i + Number(t.closest('[data-cfg-move]').dataset.cfgMove); if (j >= 0 && j < l.length) { [l[i], l[j]] = [l[j], l[i]]; saveCfg(); again(); } return; }
            if (t.closest('[data-cfg-del]')) { const x = listOf(sec)[i]; if (!confirm(`Supprimer « ${x.label} » ?${sec === 'types' ? ' Les éléments déjà faits avec cette sorte gardent leurs valeurs.' : ''}`)) return; listOf(sec).splice(i, 1); saveCfg(); again(); return; }
            if (t.closest('[data-cfg-view-add]')) return viewDialog(null);
            if (t.closest('[data-cfg-view-edit]')) return viewDialog(CFG.nav[i]);
            if (t.closest('[data-cfg-type-add]')) return typeDialog(null);
            if (t.closest('[data-cfg-type-edit]')) return typeDialog(CFG.types[i]);
            if (t.closest('[data-cfg-plan-add]')) return planDialog(null);
            if (t.closest('[data-cfg-plan-edit]')) return planDialog(CFG.plans[i]);
            if (t.closest('[data-cfg-plan-copy]')) { const x = CFG.plans[i]; return planDialog({key: '', label: x.label + ' (ma version)', tree: JSON.parse(JSON.stringify(x.tree || [])), custom: true}, true); }
            if (t.closest('[data-cfg-reset]')) { if (!confirm('Remettre tous les réglages de l’Atelier comme au départ ? Tes vues, tes sortes d’éléments et tes plans seront supprimés (les éléments des projets ne sont pas touchés).')) return; try { localStorage.removeItem(CFG_KEY); } catch (_) {} CFG = loadCfg(); toast('Réglages remis comme au départ.'); again(); }
        }, {signal: ws._cfgCtl.signal});

        function viewDialog(view) {
            const f = view?.filter || {}, isNew = !view;
            dialog({eyebrow: 'MA PROPRE VUE', title: isNew ? 'Nouvelle vue' : view.label, wide: true, submitLabel: 'Enregistrer',
                body: `<div class="form-grid"><label>Nom<input name="label" required value="${esc(view?.label || '')}" placeholder="À lire"></label><label>Émoji${iconInput('name="icon"', view?.icon || '🔎')}</label>
                    <div class="span-2"><span class="section-label">Sortes d’éléments <small>(aucune cochée : toutes)</small></span><div class="h-village-maps-grid">${CFG.types.map(t => `<label class="checkbox-line"><input type="checkbox" name="types" value="${esc(t.key)}" ${(f.types || []).includes(t.key) ? 'checked' : ''}> ${esc(t.icon)} ${esc(t.label)}</label>`).join('')}</div></div>
                    <label>Étiquettes <small>(séparées par des virgules)</small><input name="tags" value="${esc((f.tags || []).join(', '))}" placeholder="optique, gravure"></label>
                    <label>Avec<select name="tagMode"><option value="all" ${f.tagMode !== 'any' ? 'selected' : ''}>toutes ces étiquettes</option><option value="any" ${f.tagMode === 'any' ? 'selected' : ''}>au moins une</option></select></label>
                    <label>Lecture (références)<select name="read">${Object.entries(READ).map(([k, l]) => `<option value="${k}" ${(f.read || '') === k ? 'selected' : ''}>${k ? esc(l) : 'peu importe'}</option>`).join('')}</select></label>
                    <label>Texte contenu<input name="text" value="${esc(f.text || '')}" placeholder="un mot, un nom…"></label>
                    <label>Années de<input type="number" name="from" value="${esc(f.from || '')}" placeholder="1700"></label><label>à<input type="number" name="to" value="${esc(f.to || '')}" placeholder="1850"></label>
                    <label class="span-2">Dossier dont le nom contient <small>(avec ses sous-dossiers, dans chaque projet)</small><input name="folder" value="${esc(f.folder || '')}" placeholder="Sources"></label>
                    <label class="checkbox-line"><input type="checkbox" name="starred" ${f.starred ? 'checked' : ''}> Favoris seulement</label><label class="checkbox-line"><input type="checkbox" name="todo" ${f.todo ? 'checked' : ''}> Tâches pas encore faites</label></div>`,
                onOpen: dl => dl.querySelector('[data-cfg-emoji]').addEventListener('click', () => ext.pickEmoji?.(dl.querySelector('[name=icon]'))),
                onSubmit: form => {
                    const fd = new FormData(form);
                    const filter = {types: fd.getAll('types'), tags: String(fd.get('tags') || '').split(',').map(x => x.trim()).filter(Boolean), tagMode: fd.get('tagMode'), read: fd.get('read') || '', text: String(fd.get('text') || '').trim(),
                        from: fd.get('from') || '', to: fd.get('to') || '', folder: String(fd.get('folder') || '').trim(), starred: !!form.starred.checked, todo: !!form.todo.checked};
                    const entry = {key: view?.key || uid('v_'), icon: String(fd.get('icon') || '🔎').trim() || '🔎', label: String(fd.get('label')).trim(), custom: true, filter, hidden: !!view?.hidden};
                    if (isNew) CFG.nav.splice(Math.max(0, CFG.nav.findIndex(x => x.key === 'trash')), 0, entry); else Object.assign(CFG.nav.find(x => x.key === view.key), entry);
                    saveCfg(); toast('Vue enregistrée.'); again();
                },
            });
        }
        function typeDialog(type) {
            const isNew = !type, def = type ? JSON.parse(JSON.stringify(type)) : {key: uid('x_'), icon: '🧩', label: '', titleLabel: 'Titre', help: '', fields: [{key: uid('f'), type: 'text', label: '', width: 'full'}], custom: true};
            const fieldRow = (f, i) => `<div class="h-cfg-field" data-cf-i="${i}"><input data-cf="label" value="${esc(f.label)}" placeholder="Nom du champ" required><select data-cf="type">${CUSTOM_FIELD_TYPES.map(([k, l]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
                <select data-cf="width"><option value="full" ${f.width !== 'half' ? 'selected' : ''}>pleine largeur</option><option value="half" ${f.width === 'half' ? 'selected' : ''}>demi-largeur</option></select>
                <input data-cf="options" value="${esc((f.options || []).join(', '))}" placeholder="choix séparés par des virgules" ${f.type === 'select' ? '' : 'hidden'}>
                <input data-cf="placeholder" value="${esc(f.placeholder || '')}" placeholder="exemple grisé (facultatif)"><label class="checkbox-line"><input type="checkbox" data-cf="required" ${f.required ? 'checked' : ''}> obligatoire</label>
                <span class="h-rb-tools"><button type="button" class="icon-button" data-cf-move="-1">↑</button><button type="button" class="icon-button" data-cf-move="1">↓</button><button type="button" class="icon-button danger" data-cf-del>🗑</button></span></div>`;
            dialog({eyebrow: 'MA PROPRE SORTE D’ÉLÉMENT', title: isNew ? 'Nouvelle sorte' : type.label, wide: true, submitLabel: 'Enregistrer',
                body: `<div class="form-grid"><label>Nom<input name="label" required value="${esc(def.label)}" placeholder="Plaque de lanterne magique"></label><label>Émoji${iconInput('name="icon"', def.icon)}</label>
                    <label>Nom du champ titre<input name="titleLabel" value="${esc(def.titleLabel || 'Titre')}" placeholder="Titre, Sujet, Nom…"></label><label>Aide dans le menu <small>(facultatif)</small><input name="help" value="${esc(def.help || '')}" placeholder="Une plaque vue ou achetée"></label></div>
                    <h4>Les champs</h4><div data-cf-list>${def.fields.map(fieldRow).join('')}</div><button type="button" class="button small secondary" data-cf-add>+ Champ</button>`,
                onOpen: dl => {
                    dl.querySelector('[data-cfg-emoji]').addEventListener('click', () => ext.pickEmoji?.(dl.querySelector('[name=icon]')));
                    const box = dl.querySelector('[data-cf-list]');
                    const read = () => { def.fields = [...box.querySelectorAll('[data-cf-i]')].map(r => { const old = def.fields[Number(r.dataset.cfI)] || {}; return {...old, key: old.key || uid('f'), label: r.querySelector('[data-cf=label]').value, type: r.querySelector('[data-cf=type]').value, width: r.querySelector('[data-cf=width]').value,
                        options: r.querySelector('[data-cf=options]').value.split(',').map(x => x.trim()).filter(Boolean), placeholder: r.querySelector('[data-cf=placeholder]').value, required: r.querySelector('[data-cf=required]').checked}; }); };
                    const paint = () => { box.innerHTML = def.fields.map(fieldRow).join(''); };
                    box.addEventListener('change', e => { if (e.target.dataset.cf === 'type') { read(); paint(); } });
                    box.addEventListener('click', e => { const r = e.target.closest('[data-cf-i]'); if (!r) return; read(); const i = Number(r.dataset.cfI);
                        if (e.target.closest('[data-cf-del]')) { def.fields.splice(i, 1); paint(); }
                        const mv = e.target.closest('[data-cf-move]'); if (mv) { const j = i + Number(mv.dataset.cfMove); if (j >= 0 && j < def.fields.length) { [def.fields[i], def.fields[j]] = [def.fields[j], def.fields[i]]; paint(); } } });
                    dl.querySelector('[data-cf-add]').addEventListener('click', () => { read(); def.fields.push({key: uid('f'), type: 'text', label: '', width: 'full'}); paint(); box.lastElementChild?.querySelector('input')?.focus(); });
                    dl._readFields = read;
                },
                onSubmit: form => {
                    form.closest('dialog')._readFields();
                    def.fields = def.fields.filter(f => f.label.trim());
                    Object.assign(def, {label: form.label.value.trim(), icon: form.icon.value.trim() || '🧩', titleLabel: form.titleLabel.value.trim() || 'Titre', help: form.help.value.trim()});
                    if (isNew) CFG.types.push(def); else CFG.types[CFG.types.findIndex(x => x.key === def.key)] = def;
                    saveCfg(); toast('Sorte d’élément enregistrée : elle est dans « + Ajouter ».'); again();
                },
            });
        }
        function planDialog(plan, copy = false) {
            const isNew = !plan || copy;
            dialog({eyebrow: 'PLAN DE DÉPART', title: isNew ? 'Nouveau plan' : plan.label, wide: true, submitLabel: 'Enregistrer',
                body: `<label>Nom du plan<input name="label" required value="${esc(plan?.label || '')}" placeholder="Ma thèse en trois parties"></label>
                    <p class="muted">Un dossier par ligne. Décale avec deux espaces (ou une tabulation, ou un tiret) pour faire un sous-dossier, autant de niveaux que tu veux. Un émoji au début de la ligne devient l’icône du dossier.</p>
                    <div class="h-cfg-plan"><textarea name="outline" rows="16" spellcheck="false" placeholder="Introduction&#10;📁 Partie 1&#10;  Chapitre 1&#10;    Section 1.1&#10;  Chapitre 2&#10;Sources&#10;  🏛 Archives">${esc(treeToOutline(plan?.tree || []))}</textarea><div class="h-at-plan" data-cfg-preview></div></div>`,
                onOpen: dl => { const ta = dl.querySelector('[name=outline]'), pv = dl.querySelector('[data-cfg-preview]');
                    const tree = list => `<ul>${list.map(x => `<li>${esc(x.icon || CFG.folders.closed)} ${esc(x.name)}${x.children.length ? tree(x.children) : ''}</li>`).join('')}</ul>`;
                    const up = () => { const t = outlineToTree(ta.value); pv.innerHTML = `<strong>Aperçu</strong> <small class="muted">${plural(countTree(t), 'dossier', 'dossiers')}</small>${t.length ? tree(t) : '<p class="muted">Vide</p>'}`; };
                    ta.addEventListener('input', up); ta.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); const a = ta.selectionStart; ta.setRangeText('  ', a, ta.selectionEnd, 'end'); up(); } }); up(); },
                onSubmit: form => {
                    const entry = {key: !isNew ? plan.key : uid('p_'), label: form.label.value.trim(), tree: outlineToTree(form.outline.value), custom: true, hidden: !isNew && !!plan.hidden};
                    if (isNew) CFG.plans.push(entry); else CFG.plans[CFG.plans.findIndex(x => x.key === plan.key)] = entry;
                    saveCfg(); toast('Plan enregistré.'); again();
                },
            });
        }
    };
})();
